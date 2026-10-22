const path = require('path');
const fs = require('fs').promises;
const pool = require('../config/database');
const auditService = require('./auditService');
const { AUDIT_ACTIONS } = require('../constants/auditActions');
const applicationRepository = require('../repositories/applicationRepository');
const auditLogRepository = require('../repositories/auditLogRepository');

class ApplicationService {
  _getInstitutionScope(user) {
    if (!user || user.primaryRole === 'SUPER_ADMIN') {
      return null;
    }
    
    // If not SUPER_ADMIN, user must have institutions assigned
    return user.institutions ? user.institutions.map(i => i.id || i) : [];
  }

  _checkScope(application, scope) {
    if (scope === null) return true; // SUPER_ADMIN
    
    if (scope.length === 0) return false;

    return scope.includes(application.formal_institution_id) || 
           scope.includes(application.pondok_institution_id);
  }

  async getApplications(params, user) {
    const scope = this._getInstitutionScope(user);
    if (scope !== null) {
      if (scope.length === 0) {
        return {
          data: [],
          meta: {
            page: Number(params.page) || 1,
            limit: Number(params.limit) || 20,
            total: 0,
            totalPages: 0
          }
        };
      }
      params.institutionScope = scope;
    }

    const page = Number(params.page) || 1;
    const limit = Math.min(Number(params.limit) || 20, 100);
    params.page = page;
    params.limit = limit;

    const applications = await applicationRepository.findApplications(params);
    const total = await applicationRepository.countApplications(params);

    const formattedApplications = applications.map(app => ({
      id: app.id,
      registrationNumber: app.registrationNumber,
      applicant: {
        id: app.applicantId,
        fullName: app.applicantFullName,
        gender: app.applicantGender,
        whatsapp: app.applicantWhatsapp
      },
      registrationType: app.registrationType,
      formalInstitution: app.formalInstitutionId ? {
        id: app.formalInstitutionId,
        code: app.formalInstitutionCode,
        name: app.formalInstitutionName,
        logo: app.formalInstitutionLogo,
        kop: app.formalInstitutionKop
      } : null,
      pondokInstitution: app.pondokInstitutionId ? {
        id: app.pondokInstitutionId,
        code: app.pondokInstitutionCode,
        name: app.pondokInstitutionName,
        logo: app.pondokInstitutionLogo,
        kop: app.pondokInstitutionKop
      } : null,
      period: app.periodId ? {
        id: app.periodId,
        academicYear: app.periodAcademicYear
      } : null,
      wave: app.waveId ? {
        id: app.waveId,
        name: app.waveName
      } : null,
      status: app.status,
      whatsappStatus: app.whatsappStatus || 'UNSENT',
      whatsappSentAt: app.whatsappSentAt || null,
      whatsappError: app.whatsappError || null,
      stepCompleted: app.stepCompleted,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
      submittedAt: app.submittedAt
    }));

    return {
      data: formattedApplications,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async exportApplications(params, user) {
    const scope = this._getInstitutionScope(user);
    if (scope !== null) {
      if (scope.length === 0) return [];
      params.institutionScope = scope;
    }

    // Force fetch all without pagination
    params.page = 1;
    params.limit = 10000;

    const applications = await applicationRepository.findApplications(params);
    if (applications.length === 0) return [];

    const appIds = applications.map(a => a.id);
    const dynamicAnswers = await applicationRepository.findDynamicAnswersByApplicationIds(appIds);

    // Group answers by application_id
    const answersByAppId = {};
    dynamicAnswers.forEach(ans => {
      if (!answersByAppId[ans.application_id]) {
        answersByAppId[ans.application_id] = {};
      }
      
      let parsedAnswer = ans.answer_value;
      if (ans.input_type === 'CHECKBOX' || ans.input_type === 'FILE' || (typeof parsedAnswer === 'string' && parsedAnswer.startsWith('['))) {
        try { parsedAnswer = JSON.parse(parsedAnswer); } catch (e) {}
      }
      
      if (ans.input_type === 'CHECKBOX' && Array.isArray(parsedAnswer)) {
        parsedAnswer = parsedAnswer.join(', ');
      } else if (ans.input_type === 'FILE') {
        parsedAnswer = parsedAnswer ? 'Terlampir' : '';
      }
      
      answersByAppId[ans.application_id][ans.label] = parsedAnswer;
    });

    return applications.map(app => {
      const baseData = {
        'No. Registrasi': app.registrationNumber,
        'Tanggal Daftar': app.createdAt,
        'Nama Lengkap': app.applicantFullName,
        'Jenis Kelamin': app.applicantGender === 'MALE' ? 'Laki-laki' : (app.applicantGender === 'FEMALE' ? 'Perempuan' : ''),
        'Nomor HP/WhatsApp': app.applicantWhatsapp,
        'Lembaga Formal': app.formalInstitutionName || '',
        'Lembaga Pondok': app.pondokInstitutionName || '',
        'Status': app.status
      };
      
      const appDynamic = answersByAppId[app.id] || {};
      
      return { ...baseData, ...appDynamic };
    });
  }

  async getApplicationDetail(identifier, user, isRegistrationNumber = false) {
    let application;
    
    if (isRegistrationNumber) {
      application = await applicationRepository.findApplicationByRegistrationNumber(identifier);
    } else {
      application = await applicationRepository.findApplicationById(identifier);
    }

    if (!application) {
      const error = new Error('Application not found');
      error.statusCode = 404;
      throw error;
    }

    const scope = this._getInstitutionScope(user);
    if (!this._checkScope(application, scope)) {
      const error = new Error('Forbidden');
      error.statusCode = 403;
      throw error;
    }

    const applicant = await applicationRepository.findApplicantByApplicationId(application.id);
    const rawGuardians = await applicationRepository.findGuardiansByApplicantId(applicant.id);
    const majorChoices = await applicationRepository.findMajorChoicesByApplicationId(application.id);
    let dynamicAnswers = await applicationRepository.findDynamicAnswersByApplicationId(application.id);
    const documents = await applicationRepository.findDocumentsByApplicationId(application.id);
    const statusHistory = await auditLogRepository.findByEntity('APPLICATION', application.id, 'STATUS_CHANGE');

    const guardians = {
      father: rawGuardians.find(g => g.relationship === 'FATHER') || null,
      mother: rawGuardians.find(g => g.relationship === 'MOTHER') || null,
      guardian: rawGuardians.find(g => g.relationship === 'GUARDIAN') || null
    };

    // Parse JSON options if they exist
    dynamicAnswers = dynamicAnswers.map(ans => {
      let parsedAnswer = ans.answer_value;
      if (ans.input_type === 'CHECKBOX' || ans.input_type === 'FILE' || (typeof parsedAnswer === 'string' && parsedAnswer.startsWith('['))) {
        try {
          parsedAnswer = JSON.parse(parsedAnswer);
        } catch (e) {
          // Keep raw value if not valid JSON
        }
      }

      return {
        fieldId: ans.form_field_id,
        fieldCode: ans.field_code,
        label: ans.label,
        inputType: ans.input_type,
        section: {
          id: ans.section_id,
          code: ans.section_code,
          name: ans.section_name
        },
        target: {
          id: ans.target_id,
          code: ans.target_code,
          targetType: ans.target_type
        },
        answer: parsedAnswer
      };
    });

    const formattedDocuments = documents.map(doc => ({
      documentTypeId: doc.document_type_id,
      code: doc.document_code,
      name: doc.document_name,
      fileName: doc.file_name,
      filePath: doc.file_path,
      fileSize: doc.file_size,
      mimeType: doc.mime_type,
      uploadedAt: doc.uploaded_at
    }));

    const formattedHistory = statusHistory.map(hist => {
      // Parse description assuming format "STATUS_CHANGE: DRAFT -> SUBMITTED" or similar
      let fromStatus = null;
      let toStatus = null;
      
      const match = hist.description.match(/([A-Z_]+)\s*(?:->|menjadi)\s*([A-Z_]+)/i);
      if (match) {
        fromStatus = match[1].toUpperCase();
        toStatus = match[2].toUpperCase();
      }

      return {
        id: hist.id,
        fromStatus,
        toStatus,
        description: hist.description,
        changedBy: {
          id: hist.user_id,
          name: hist.user_name
        },
        createdAt: hist.createdAt
      };
    });

    return {
      application: {
        id: application.id,
        registrationNumber: application.registration_number,
        status: application.status,
        whatsappStatus: application.whatsapp_status || 'UNSENT',
        whatsappSentAt: application.whatsapp_sent_at || null,
        whatsappError: application.whatsapp_error || null,
        stepCompleted: application.step_completed,
        registrationType: application.registration_type,
        createdAt: application.created_at,
        updatedAt: application.updated_at,
        submittedAt: application.submitted_at
      },
      registration: {
        period: application.period_id ? {
          id: application.period_id,
          academicYear: application.period_academic_year,
          startDate: application.period_start_date,
          endDate: application.period_end_date,
          isActive: application.period_is_active
        } : null,
        wave: application.wave_id ? {
          id: application.wave_id,
          name: application.wave_name,
          startDate: application.wave_start_date,
          endDate: application.wave_end_date,
          isActive: application.wave_is_active
        } : null,
        formalInstitution: application.formal_institution_id ? {
          id: application.formal_institution_id,
          code: application.formal_institution_code,
          name: application.formal_institution_name,
          logo: application.formal_institution_logo,
          kop: application.formal_institution_kop
        } : null,
        pondokInstitution: application.pondok_institution_id ? {
          id: application.pondok_institution_id,
          code: application.pondok_institution_code,
          name: application.pondok_institution_name,
          logo: application.pondok_institution_logo,
          kop: application.pondok_institution_kop
        } : null
      },
      applicant: {
        id: applicant.id,
        fullName: applicant.full_name,
        gender: applicant.gender,
        whatsapp: applicant.whatsapp,
        address: applicant.address,
        previousSchool: applicant.previous_school,
        nik: applicant.nik,
        nisn: applicant.nisn,
        birthPlace: applicant.birth_place,
        birthDate: applicant.birth_date,
        informationSource: applicant.information_source_id ? {
          id: applicant.information_source_id,
          name: applicant.information_source_name
        } : null,
        informationSourceOther: applicant.information_source_other,
        createdAt: applicant.created_at,
        updatedAt: applicant.updated_at
      },
      guardians,
      majors: majorChoices,
      dynamicAnswers,
      documents: formattedDocuments,
      statusHistory: formattedHistory
    };
  }

  async getStatusHistory(id, user) {
    const application = await applicationRepository.findApplicationById(id);
    if (!application) {
      const error = new Error('Application not found');
      error.statusCode = 404;
      throw error;
    }

    const scope = this._getInstitutionScope(user);
    if (!this._checkScope(application, scope)) {
      const error = new Error('Forbidden');
      error.statusCode = 403;
      throw error;
    }

    const history = await auditLogRepository.findByEntity('APPLICATION', application.id, 'STATUS_CHANGE');
    
    return history.map(hist => {
      let fromStatus = null;
      let toStatus = null;
      
      const match = hist.description.match(/([A-Z_]+)\s*(?:->|menjadi)\s*([A-Z_]+)/i);
      if (match) {
        fromStatus = match[1].toUpperCase();
        toStatus = match[2].toUpperCase();
      }

      return {
        id: hist.id,
        fromStatus,
        toStatus,
        description: hist.description,
        changedBy: {
          id: hist.user_id,
          name: hist.user_name
        },
        createdAt: hist.createdAt
      };
    });
  }

  async resendApplicationWhatsapp(id, user, options = {}) {
    const pool = require('../config/database');
    const application = await applicationRepository.findApplicationById(id);
    if (!application) {
      const error = new Error('Data pendaftaran tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    const scope = this._getInstitutionScope(user);
    if (!this._checkScope(application, scope)) {
      const error = new Error('Anda tidak memiliki akses ke pendaftaran ini.');
      error.statusCode = 403;
      throw error;
    }

    const eventCode = application.status === 'SUBMITTED' 
      ? 'REGISTRATION_SUBMITTED' 
      : 'REGISTRATION_CREATED';

    const continueTokenService = require('./continueTokenService');
    const rawContinueToken = continueTokenService.generateToken();
    const continueTokenHash = continueTokenService.hashToken(rawContinueToken);
    const continueTokenExpiresAt = continueTokenService.getExpirationDate();
    
    await pool.query(
      'UPDATE applications SET continue_token_hash = ?, continue_token_expires_at = ? WHERE id = ?',
      [continueTokenHash, continueTokenExpiresAt, application.id]
    );

    const frontendBaseUrl = (process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',')[0].trim() : 'http://localhost:5173').replace(/\/+$/, '');
    const resumeHash = Buffer.from(`${application.registration_number}::${rawContinueToken}`).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    const continueUrl = `${frontendBaseUrl}/pendaftaran/lanjut/${resumeHash}`;
    const receiptUrl = `${frontendBaseUrl}/pendaftaran/lanjut/${resumeHash}?to=struk`;

    // Fetch receipt data for struk
    const publicApplicationService = require('./publicApplicationService');
    let receiptData = null;
    try {
      receiptData = await publicApplicationService.getReceipt(application.registration_number, rawContinueToken);
    } catch (_) {}

    const notificationEngine = require('./notificationEngineService');
    const result = await notificationEngine.processEvent(eventCode, application.id, {
      forceResend: true,
      continueToken: rawContinueToken,
      resumeHash,
      continueUrl,
      receiptUrl,
      receiptData,
      includeReceipt: options.includeReceipt !== false,
      includeContinueLink: options.includeContinueLink !== false,
      customNote: options.customNote || '',
      customMessage: options.customMessage || '',
      recipientTypes: ['APPLICANT', 'GUARDIAN']
    });

    const responseData = {
      ...result,
      registrationNumber: application.registration_number,
      continueToken: rawContinueToken,
      resumeHash,
      continueUrl,
      receiptUrl,
      receipt: receiptData
    };

    if (result.sent > 0) {
      return {
        success: true,
        message: 'Pesan WhatsApp berhasil dikirim ulang ke pendaftar.',
        data: responseData
      };
    } else {
      const firstError = result.details.find(d => d.status === 'FAILED' || d.status === 'SKIPPED');
      const reasonMsg = firstError?.error || firstError?.reason || result.reason || 'Gagal mengirim pesan WhatsApp';
      return {
        success: false,
        message: `Gagal mengirim WhatsApp: ${reasonMsg}`,
        data: responseData
      };
    }
  }

  async getResendPreview(id, user) {
    const pool = require('../config/database');
    const application = await applicationRepository.findApplicationById(id);
    if (!application) {
      const error = new Error('Data pendaftaran tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    const scope = this._getInstitutionScope(user);
    if (!this._checkScope(application, scope)) {
      const error = new Error('Anda tidak memiliki akses ke pendaftaran ini.');
      error.statusCode = 403;
      throw error;
    }

    const continueTokenService = require('./continueTokenService');
    const rawContinueToken = continueTokenService.generateToken();
    const continueTokenHash = continueTokenService.hashToken(rawContinueToken);
    const continueTokenExpiresAt = continueTokenService.getExpirationDate();
    
    await pool.query(
      'UPDATE applications SET continue_token_hash = ?, continue_token_expires_at = ? WHERE id = ?',
      [continueTokenHash, continueTokenExpiresAt, application.id]
    );

    const frontendBaseUrl = (process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',')[0].trim() : 'http://localhost:5173').replace(/\/+$/, '');
    const resumeHash = Buffer.from(`${application.registration_number}::${rawContinueToken}`).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    const continueUrl = `${frontendBaseUrl}/pendaftaran/lanjut/${resumeHash}`;
    const receiptUrl = `${frontendBaseUrl}/pendaftaran/lanjut/${resumeHash}?to=struk`;

    const notificationRoutingService = require('./notificationRoutingService');
    const context = await notificationRoutingService.getApplicationContext(application.id);

    const eventCode = application.status === 'SUBMITTED' 
      ? 'REGISTRATION_SUBMITTED' 
      : 'REGISTRATION_CREATED';

    const whatsappTemplateComposer = require('./whatsappTemplateComposer');
    const composed = await whatsappTemplateComposer.composeForApplication(application.id, eventCode, {
      context,
      forceResend: true,
      continueToken: rawContinueToken,
      resumeHash,
      continueUrl,
      receiptUrl,
      includeReceipt: true,
      includeContinueLink: true
    });

    const publicApplicationService = require('./publicApplicationService');
    let receiptData = null;
    try {
      receiptData = await publicApplicationService.getReceipt(application.registration_number, rawContinueToken);
    } catch (_) {}

    return {
      applicationId: application.id,
      registrationNumber: application.registration_number,
      status: application.status,
      studentName: context?.student_name || application.applicant?.fullName,
      phone: context?.applicant_whatsapp || application.applicant?.whatsapp,
      whatsappStatus: application.whatsapp_status,
      continueToken: rawContinueToken,
      resumeHash,
      continueUrl,
      receiptUrl,
      receipt: receiptData,
      previewMessage: composed.composedMessage
    };
  }

  async getApplicationForm(id, user) {
    const application = await applicationRepository.findApplicationById(id);
    if (!application) {
      const error = new Error('Data pendaftaran tidak ditemukan');
      error.statusCode = 404;
      throw error;
    }

    const scope = this._getInstitutionScope(user);
    if (!this._checkScope(application, scope)) {
      const error = new Error('Anda tidak memiliki akses untuk formulir pendaftar ini');
      error.statusCode = 403;
      throw error;
    }

    const publicApplicationFormService = require('./publicApplicationFormService');
    const formData = await publicApplicationFormService.getFormForApplication(application);
    return formData;
  }

  async updateApplication(id, payload, user, req) {
    const application = await applicationRepository.findApplicationById(id);
    if (!application) {
      const error = new Error('Data pendaftaran tidak ditemukan');
      error.statusCode = 404;
      throw error;
    }

    const scope = this._getInstitutionScope(user);
    if (!this._checkScope(application, scope)) {
      const error = new Error('Anda tidak memiliki akses untuk mengubah data pendaftar ini');
      error.statusCode = 403;
      throw error;
    }

    const applicant = await applicationRepository.findApplicantByApplicationId(application.id);
    if (!applicant) {
      const error = new Error('Data calon santri tidak ditemukan');
      error.statusCode = 404;
      throw error;
    }

    const formAwal = payload.initialForm || payload.formAwal || payload.applicant || payload;
    const appData = payload.application || payload;
    const guardiansData = payload.guardians;
    const dynamicAnswers = payload.dynamicAnswers || [];

    const fullNameInput = formAwal.fullName || formAwal.full_name || formAwal.namaLengkap;
    if (fullNameInput !== undefined && (!fullNameInput || fullNameInput.trim() === '')) {
      const error = new Error('Nama lengkap santri wajib diisi');
      error.statusCode = 422;
      throw error;
    }

    const formFieldBindings = require('../constants/formFieldBindings');
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Prepare updates for applicants table
      const applicantUpdates = {};
      if (fullNameInput !== undefined) {
        applicantUpdates.full_name = fullNameInput.trim();
      }
      if (formAwal.gender !== undefined || formAwal.jenisKelamin !== undefined) {
        const gVal = formAwal.gender || formAwal.jenisKelamin;
        applicantUpdates.gender = (gVal === 'L' || gVal === 'MALE') ? 'MALE' : ((gVal === 'P' || gVal === 'FEMALE') ? 'FEMALE' : gVal);
      }
      if (formAwal.whatsapp !== undefined || formAwal.phone !== undefined || formAwal.no_hp !== undefined) {
        applicantUpdates.whatsapp = formAwal.whatsapp || formAwal.phone || formAwal.no_hp || null;
      }
      if (formAwal.address !== undefined || formAwal.alamat !== undefined) {
        applicantUpdates.address = formAwal.address !== undefined ? formAwal.address : formAwal.alamat;
      }
      if (formAwal.previousSchool !== undefined || formAwal.previous_school !== undefined || formAwal.sekolahAsal !== undefined) {
        applicantUpdates.previous_school = formAwal.previousSchool !== undefined ? formAwal.previousSchool : (formAwal.previous_school || formAwal.sekolahAsal);
      }
      if (formAwal.birthPlace !== undefined || formAwal.birth_place !== undefined || formAwal.tempatLahir !== undefined) {
        applicantUpdates.birth_place = formAwal.birthPlace !== undefined ? formAwal.birthPlace : (formAwal.birth_place || formAwal.tempatLahir);
      }
      if (formAwal.birthDate !== undefined || formAwal.birth_date !== undefined || formAwal.tanggalLahir !== undefined) {
        const rawDate = formAwal.birthDate !== undefined ? formAwal.birthDate : (formAwal.birth_date || formAwal.tanggalLahir);
        applicantUpdates.birth_date = rawDate ? new Date(rawDate).toISOString().split('T')[0] : null;
      }
      if (formAwal.nik !== undefined) {
        applicantUpdates.nik = formAwal.nik || null;
      }
      if (formAwal.nisn !== undefined) {
        applicantUpdates.nisn = formAwal.nisn || null;
      }
      if (formAwal.informationSourceId !== undefined || formAwal.sumberInfo !== undefined) {
        const val = formAwal.informationSourceId !== undefined ? formAwal.informationSourceId : formAwal.sumberInfo;
        applicantUpdates.information_source_id = val ? Number(val) : null;
      }
      if (formAwal.informationSourceOther !== undefined || formAwal.sumberInfoLainnya !== undefined) {
        applicantUpdates.information_source_other = (formAwal.informationSourceOther !== undefined ? formAwal.informationSourceOther : formAwal.sumberInfoLainnya) || null;
      }

      // 2. Prepare guardian updates (FATHER, MOTHER, GUARDIAN)
      const guardianUpdates = {
        FATHER: {},
        MOTHER: {},
        GUARDIAN: {}
      };

      // Form Awal parentName -> relationship: GUARDIAN
      const parentNameInput = formAwal.parentName || formAwal.namaOrtu || formAwal.parent_name;
      if (parentNameInput !== undefined) {
        guardianUpdates.GUARDIAN.name = parentNameInput ? parentNameInput.trim() : null;
      }

      // Explicit guardians payload if provided
      if (guardiansData && typeof guardiansData === 'object') {
        const rels = ['FATHER', 'MOTHER', 'GUARDIAN'];
        for (const rel of rels) {
          const g = guardiansData[rel.toLowerCase()] || guardiansData[rel];
          if (g && typeof g === 'object') {
            if (g.name !== undefined) guardianUpdates[rel].name = g.name;
            if (g.nik !== undefined) guardianUpdates[rel].nik = g.nik;
            if (g.phone !== undefined || g.whatsapp !== undefined) guardianUpdates[rel].phone = g.phone || g.whatsapp;
            if (g.occupation !== undefined || g.pekerjaan !== undefined) guardianUpdates[rel].occupation = g.occupation || g.pekerjaan;
            if (g.education !== undefined || g.pendidikan !== undefined) guardianUpdates[rel].education = g.education || g.pendidikan;
            if (g.income !== undefined || g.penghasilan !== undefined) guardianUpdates[rel].income = g.income || g.penghasilan;
            if (g.address !== undefined || g.alamat !== undefined) guardianUpdates[rel].address = g.address || g.alamat;
          }
        }
      }

      // 3. Process dynamic answers and field bindings from Form Lengkap
      let majorChoiceId = null;
      const dynamicAnswersToUpsert = [];
      const dynamicAnswersToDelete = [];

      if (Array.isArray(dynamicAnswers)) {
        for (const item of dynamicAnswers) {
          const fieldId = item.fieldId || item.id;
          const fieldCode = item.fieldCode || item.code;
          let val = item.value !== undefined ? item.value : item.answer;

          const binding = fieldCode ? formFieldBindings[fieldCode] : null;
          if (binding) {
            if (binding.source === 'APPLICANT') {
              if (binding.column === 'birth_date' && val) {
                val = new Date(val).toISOString().split('T')[0];
              }
              applicantUpdates[binding.column] = val || null;
            } else if (binding.source === 'GUARDIAN') {
              guardianUpdates[binding.relationship][binding.column] = val || null;
            } else if (binding.source === 'MAJOR_CHOICE') {
              majorChoiceId = val;
            }
          } else if (fieldId) {
            if (val === null || val === undefined || val === '' || (Array.isArray(val) && val.length === 0)) {
              dynamicAnswersToDelete.push(fieldId);
            } else {
              const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
              dynamicAnswersToUpsert.push({ fieldId, value: strVal });
            }
          }
        }
      }

      // Execute Applicants Update
      if (Object.keys(applicantUpdates).length > 0) {
        const setClauses = [];
        const values = [];
        for (const [col, val] of Object.entries(applicantUpdates)) {
          setClauses.push(`${col} = ?`);
          values.push(val);
        }
        setClauses.push(`updated_at = NOW()`);
        values.push(applicant.id);
        await connection.query(
          `UPDATE applicants SET ${setClauses.join(', ')} WHERE id = ?`,
          values
        );
      }

      // 4. Update applications table
      const applicationUpdates = {};
      const regTypeInput = formAwal.registrationType || formAwal.registration_type || formAwal.lembaga;
      if (regTypeInput !== undefined) {
        applicationUpdates.registration_type = regTypeInput;
      }
      if (formAwal.formalInstitutionId !== undefined || formAwal.formal_institution_id !== undefined) {
        const val = formAwal.formalInstitutionId !== undefined ? formAwal.formalInstitutionId : formAwal.formal_institution_id;
        applicationUpdates.formal_institution_id = val ? Number(val) : null;
      }
      if (formAwal.pondokInstitutionId !== undefined || formAwal.pondok_institution_id !== undefined) {
        const val = formAwal.pondokInstitutionId !== undefined ? formAwal.pondokInstitutionId : formAwal.pondok_institution_id;
        applicationUpdates.pondok_institution_id = val ? Number(val) : null;
      }

      const targetStatus = formAwal.status || appData.status;
      if (targetStatus && targetStatus !== application.status) {
        if (!['DRAFT', 'SUBMITTED', 'CANCELLED'].includes(targetStatus)) {
          const error = new Error('Status tidak valid');
          error.statusCode = 422;
          throw error;
        }
        applicationUpdates.status = targetStatus;
        if (targetStatus === 'SUBMITTED' && !application.submitted_at) {
          applicationUpdates.submitted_at = new Date();
        }

        const ipAddress = req?.ip || req?.connection?.remoteAddress;
        const userAgent = req?.headers ? req.headers['user-agent'] : null;
        await auditLogRepository.create({
          user_id: user.id,
          action: 'STATUS_CHANGE',
          entity_type: 'APPLICATION',
          entity_id: application.id,
          description: `Status application diubah dari ${application.status} menjadi ${targetStatus}.`,
          ip_address: ipAddress,
          user_agent: userAgent
        }, connection);
      }

      if (Object.keys(applicationUpdates).length > 0) {
        const setClauses = [];
        const values = [];
        for (const [col, val] of Object.entries(applicationUpdates)) {
          setClauses.push(`${col} = ?`);
          values.push(val);
        }
        setClauses.push(`updated_at = NOW()`);
        values.push(application.id);
        await connection.query(
          `UPDATE applications SET ${setClauses.join(', ')} WHERE id = ?`,
          values
        );
      }

      // 5. Execute Guardian updates
      for (const [rel, updates] of Object.entries(guardianUpdates)) {
        if (Object.keys(updates).length > 0) {
          const [checkGuardian] = await connection.query(
            `SELECT id FROM applicant_guardians WHERE applicant_id = ? AND relationship = ?`,
            [applicant.id, rel]
          );

          if (checkGuardian.length > 0) {
            const setClauses = [];
            const values = [];
            for (const [col, val] of Object.entries(updates)) {
              setClauses.push(`${col} = ?`);
              values.push(val);
            }
            if (setClauses.length > 0) {
              values.push(checkGuardian[0].id);
              await connection.query(
                `UPDATE applicant_guardians SET ${setClauses.join(', ')} WHERE id = ?`,
                values
              );
            }
          } else if (updates.name) {
            const cols = ['applicant_id', 'relationship'];
            const vals = [applicant.id, rel];
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

      // 6. Major Choice Upsert
      if (majorChoiceId !== null) {
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

      // 7. Dynamic Answers Delete
      if (dynamicAnswersToDelete.length > 0) {
        await connection.query(
          `DELETE FROM application_answers WHERE application_id = ? AND form_field_id IN (?)`,
          [application.id, dynamicAnswersToDelete]
        );
      }

      // 8. Dynamic Answers Upsert
      for (const ans of dynamicAnswersToUpsert) {
        await connection.query(
          `INSERT INTO application_answers (application_id, form_field_id, answer_value) 
           VALUES (?, ?, ?) 
           ON DUPLICATE KEY UPDATE answer_value = VALUES(answer_value), updated_at = CURRENT_TIMESTAMP`,
          [application.id, ans.fieldId, ans.value]
        );
      }

      // 9. Audit Log for General Update
      const applicantName = applicantUpdates.full_name || applicant.full_name;
      await auditService.log(
        AUDIT_ACTIONS.UPDATE,
        'APPLICATION',
        application.id,
        `Memperbarui data pendaftar ${application.registration_number} (${applicantName})`,
        req,
        connection
      );

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    return await this.getApplicationDetail(id, user);
  }

  async deleteApplication(id, user, req) {
    const application = await applicationRepository.findApplicationById(id);
    if (!application) {
      const error = new Error('Data pendaftaran tidak ditemukan');
      error.statusCode = 404;
      throw error;
    }

    const scope = this._getInstitutionScope(user);
    if (!this._checkScope(application, scope)) {
      const error = new Error('Anda tidak memiliki akses untuk menghapus pendaftar ini');
      error.statusCode = 403;
      throw error;
    }

    const applicant = await applicationRepository.findApplicantByApplicationId(application.id);
    const applicantName = applicant?.full_name || 'Tanpa Nama';
    const registrationNumber = application.registration_number;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await applicationRepository.deleteApplication(application.id, application.applicant_id, connection);

      await auditService.log(
        AUDIT_ACTIONS.DELETE,
        'APPLICATION',
        application.id,
        `Menghapus pendaftar ${registrationNumber} (${applicantName})`,
        req,
        connection
      );

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    // Clean up physical document files if any
    try {
      const appStorageDir = path.join(process.cwd(), 'storage', 'applicant-documents', application.id.toString());
      await fs.rm(appStorageDir, { recursive: true, force: true });
    } catch (fsErr) {
      console.warn('Gagal menghapus berkas fisik pendaftar:', fsErr.message);
    }

    return {
      success: true,
      message: `Data pendaftar ${applicantName} (${registrationNumber}) berhasil dihapus.`
    };
  }
}

module.exports = new ApplicationService();
