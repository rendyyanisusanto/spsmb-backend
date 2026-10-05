const pool = require('../config/database');
const effectiveFormService = require('./effectiveFormService');
const formAnswerService = require('./formAnswerService');
const formValidationService = require('./formValidationService');
const formFieldBindings = require('../constants/formFieldBindings');
const continueTokenService = require('./continueTokenService');

class PublicApplicationFormService {
  async getApplication(registrationNumber, rawContinueToken) {
    // 1. Fetch Application
    const [applications] = await pool.query(
      `SELECT a.*, f.name as formal_institution_name, p.name as pondok_institution_name
       FROM applications a
       LEFT JOIN institutions f ON a.formal_institution_id = f.id
       LEFT JOIN institutions p ON a.pondok_institution_id = p.id
       WHERE a.registration_number = ?`,
      [registrationNumber]
    );

    if (applications.length === 0) {
      const error = new Error('Pendaftaran tidak ditemukan.');
      error.status = 404;
      throw error;
    }

    const application = applications[0];

    // 2. Validate Token
    if (!continueTokenService.verifyToken(rawContinueToken, application.continue_token_hash)) {
      const error = new Error('Sesi pendaftaran telah berakhir. Silakan hubungi panitia SPSMB.');
      error.status = 401;
      throw error;
    }

    // Check expiration
    if (new Date() > new Date(application.continue_token_expires_at)) {
      const error = new Error('Sesi pendaftaran telah berakhir. Silakan hubungi panitia SPSMB.');
      error.status = 401;
      throw error;
    }

    // 3. Status editable check
    if (application.status === 'CANCELLED') {
      const error = new Error('Pendaftaran ini telah dibatalkan.');
      error.status = 403;
      throw error;
    }

    // For Sprint 19 we only allow DRAFT editing essentially, or just continue.
    // Assuming allow_edit_after_submit is checked elsewhere if needed, but for now just pass.
    return application;
  }

  async getForm(registrationNumber, rawContinueToken) {
    const application = await this.getApplication(registrationNumber, rawContinueToken);
    return this.getFormForApplication(application);
  }

  async getFormForApplication(application) {
    // 1. Get Effective Form
    const sections = await effectiveFormService.getEffectiveForm(application);
    
    // 2. Get Answers
    const { dynamicAnswers, valuesMap } = await formAnswerService.getAnswersForApplication(application.id, application.applicant_id);
    
    // 3. Attach Answers to Form
    const prefilledSections = formAnswerService.attachValuesToSections(sections, dynamicAnswers, valuesMap);

    // Filter out sections that have no fields
    const activeSections = prefilledSections.filter(s => s.fields.length > 0);

    // Calculate progress
    const completedSections = [];
    activeSections.forEach((section, index) => {
      const sectionValid = section.fields.every(f => !f.isRequired || (f.value !== null && f.value !== '' && (!Array.isArray(f.value) || f.value.length > 0)));
      if (sectionValid) completedSections.push(section.id);
    });

    // We can infer step_completed based on database or just calculated logic.
    // The prompt says "step_completed = 4" etc. But we should just return what's in DB for currentStep maybe, or progress.
    const progress = {
      currentStep: application.step_completed || 1,
      totalSteps: activeSections.length,
      completedSections,
      percentage: Math.round((completedSections.length / activeSections.length) * 100) || 0
    };

    return {
      application: {
        registrationNumber: application.registration_number,
        registrationType: application.registration_type,
        status: application.status,
        stepCompleted: application.step_completed,
        formalInstitution: application.formal_institution_id ? { id: application.formal_institution_id, name: application.formal_institution_name } : null,
        pondokInstitution: application.pondok_institution_id ? { id: application.pondok_institution_id, name: application.pondok_institution_name } : null,
        lastSavedAt: application.last_saved_at
      },
      sections: activeSections,
      progress
    };
  }

  async saveSection(registrationNumber, rawContinueToken, sectionId, answers, isCompleteAction) {
    const application = await this.getApplication(registrationNumber, rawContinueToken);
    const settings = await require('./settingService').getSettings();
    if (application.status !== 'DRAFT' && !settings.registration.allowEditAfterSubmit) {
      const error = new Error('Pendaftaran sudah dikirim dan tidak dapat diubah.');
      error.status = 409;
      throw error;
    }

    // 1. Get Effective Form
    const sections = await effectiveFormService.getEffectiveForm(application);
    
    const section = sections.find(s => String(s.id) === String(sectionId));
    if (!section) {
      const error = new Error('Bagian form (section) tidak valid untuk pendaftaran ini.');
      error.status = 422;
      throw error;
    }

    // 2. Validate Answers
    const validationResult = formValidationService.validateSection(section, answers, isCompleteAction);
    if (!validationResult.isValid) {
      const error = new Error('Data belum lengkap atau tidak valid.');
      error.status = 422;
      error.errors = { fields: validationResult.errors };
      throw error;
    }

    // 3. Prepare Updates
    const applicantUpdates = {};
    const guardianUpdates = {
      FATHER: {},
      MOTHER: {},
      GUARDIAN: {}
    };
    let majorChoiceId = null;
    const dynamicAnswersToUpsert = [];
    const dynamicAnswersToDelete = [];

    validationResult.validAnswers.forEach(({ field, value }) => {
      const binding = formFieldBindings[field.fieldCode];
      if (binding) {
        if (binding.source === 'APPLICANT') {
          applicantUpdates[binding.column] = value;
        } else if (binding.source === 'GUARDIAN') {
          guardianUpdates[binding.relationship][binding.column] = value;
        } else if (binding.source === 'MAJOR_CHOICE') {
          majorChoiceId = value;
        }
      } else {
        if (value === null) {
          dynamicAnswersToDelete.push(field.id);
        } else {
          dynamicAnswersToUpsert.push({ fieldId: field.id, value });
        }
      }
    });

    // 4. Execute Transaction
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Applicant Updates
      if (Object.keys(applicantUpdates).length > 0) {
        const setClauses = [];
        const values = [];
        for (const [col, val] of Object.entries(applicantUpdates)) {
          setClauses.push(`${col} = ?`);
          values.push(val);
        }
        values.push(application.applicant_id);
        await connection.query(
          `UPDATE applicants SET ${setClauses.join(', ')} WHERE id = ?`,
          values
        );
      }

      // Guardian Upserts
      for (const [rel, updates] of Object.entries(guardianUpdates)) {
        if (Object.keys(updates).length > 0) {
          const checkGuardian = await connection.query(
            `SELECT id FROM applicant_guardians WHERE applicant_id = ? AND relationship = ?`,
            [application.applicant_id, rel]
          );
          if (checkGuardian[0].length > 0) {
            // Update
            const setClauses = [];
            const values = [];
            for (const [col, val] of Object.entries(updates)) {
              setClauses.push(`${col} = ?`);
              values.push(val);
            }
            values.push(checkGuardian[0][0].id);
            await connection.query(
              `UPDATE applicant_guardians SET ${setClauses.join(', ')} WHERE id = ?`,
              values
            );
          } else {
            // Insert
            const cols = ['applicant_id', 'relationship'];
            const vals = [application.applicant_id, rel];
            for (const [col, val] of Object.entries(updates)) {
              cols.push(col);
              vals.push(val);
            }
            const placeholders = cols.map(() => '?').join(', ');
            await connection.query(
              `INSERT INTO applicant_guardians (${cols.join(', ')}) VALUES (${placeholders})`,
              vals
            );
          }
        }
      }

      // Major Choice Upsert
      if (majorChoiceId !== null) {
        // delete existing
        await connection.query(
          `DELETE FROM application_major_choices WHERE application_id = ? AND priority = 1`,
          [application.id]
        );
        if (majorChoiceId) {
          await connection.query(
            `INSERT INTO application_major_choices (application_id, major_id, priority) VALUES (?, ?, 1)`,
            [application.id, majorChoiceId]
          );
        }
      }

      // Dynamic Answers Delete
      if (dynamicAnswersToDelete.length > 0) {
        await connection.query(
          `DELETE FROM application_answers WHERE application_id = ? AND form_field_id IN (?)`,
          [application.id, dynamicAnswersToDelete]
        );
      }

      // Dynamic Answers Upsert
      for (const ans of dynamicAnswersToUpsert) {
        await connection.query(
          `INSERT INTO application_answers (application_id, form_field_id, answer_value) 
           VALUES (?, ?, ?) 
           ON DUPLICATE KEY UPDATE answer_value = VALUES(answer_value), updated_at = CURRENT_TIMESTAMP`,
          [application.id, ans.fieldId, ans.value]
        );
      }

      // Update progress and last_saved_at
      const sectionIndex = sections.findIndex(s => String(s.id) === String(sectionId));
      let stepCompleted = application.step_completed;
      if (isCompleteAction && sectionIndex + 2 > stepCompleted) {
        stepCompleted = sectionIndex + 2; // Next step
      }

      await connection.query(
        `UPDATE applications SET step_completed = ?, last_saved_at = NOW() WHERE id = ?`,
        [stepCompleted, application.id]
      );

      await connection.commit();
      
      return { stepCompleted, lastSavedAt: new Date() };

    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }
}

module.exports = new PublicApplicationFormService();
