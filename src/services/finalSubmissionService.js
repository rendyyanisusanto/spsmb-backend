const pool = require('../config/database');
const applicationCompletenessService = require('./applicationCompletenessService');
const settingService = require('./settingService');

class FinalSubmissionService {
  async submitApplication(application) {
    if (application.status === 'CANCELLED') {
      throw { status: 409, message: 'Pendaftaran ini telah dibatalkan dan tidak dapat dikirim.' };
    }

    if (application.status === 'SUBMITTED') {
      // Idempotent response per sprint requirements
      return { 
        success: true, 
        message: 'Pendaftaran sudah dikirim sebelumnya.',
        alreadySubmitted: true
      };
    }

    // Double check completeness
    const completeness = await applicationCompletenessService.getCompleteness(application);
    if (!completeness.complete) {
      throw { 
        status: 422, 
        message: 'Pendaftaran belum dapat dikirim karena masih terdapat data yang belum lengkap.',
        errors: {
          missingFields: completeness.missing.fields,
          missingDocuments: completeness.missing.documents
        }
      };
    }

    // Begin Transaction
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Row lock for concurrency
      const [rows] = await connection.query('SELECT status FROM applications WHERE id = ? FOR UPDATE', [application.id]);
      if (rows[0].status === 'SUBMITTED') {
        await connection.commit();
        return { 
          success: true, 
          message: 'Pendaftaran sudah dikirim sebelumnya.',
          alreadySubmitted: true
        };
      }

      if (rows[0].status === 'CANCELLED') {
        throw { status: 409, message: 'Pendaftaran ini telah dibatalkan dan tidak dapat dikirim.' };
      }

      // Find total effective sections + document step + review step
      const [sections] = await connection.query('SELECT COUNT(*) as total FROM form_sections WHERE is_active = 1');
      const finalStepNumber = sections[0].total + 2; // +1 for documents, +1 for review

      await connection.query(
        `UPDATE applications 
         SET status = 'SUBMITTED', 
             submitted_at = NOW(), 
             last_saved_at = NOW(),
             step_completed = ?
         WHERE id = ?`,
        [finalStepNumber, application.id]
      );

      await connection.commit();

      return {
        success: true,
        message: 'Pendaftaran berhasil dikirim.',
        alreadySubmitted: false
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }
}

module.exports = new FinalSubmissionService();
