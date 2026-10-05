const applicationCompletenessService = require('./applicationCompletenessService');
const pool = require('../config/database');

class PublicApplicationStatusService {
  async getStatus(application) {
    let statusLabel = '';
    let completeness = null;
    let submittedAt = application.submitted_at;

    switch (application.status) {
      case 'DRAFT':
        statusLabel = 'Pendaftaran Belum Selesai';
        completeness = await applicationCompletenessService.getCompleteness(application);
        // Only expose what's needed for the status
        completeness = {
          complete: completeness.complete,
          percentage: completeness.percentage,
          missingFields: completeness.missing.fields,
          missingDocuments: completeness.missing.documents
        };
        break;
      case 'SUBMITTED':
        statusLabel = 'Pendaftaran Telah Dikirim';
        break;
      case 'CANCELLED':
        statusLabel = 'Pendaftaran Dibatalkan';
        break;
    }

    return {
      registrationNumber: application.registration_number,
      status: application.status,
      statusLabel,
      submittedAt,
      ...(completeness && { completeness })
    };
  }

  async getReview(application) {
    const completeness = await applicationCompletenessService.getCompleteness(application);
    
    // Fetch applicant details
    const [applicants] = await pool.query('SELECT full_name FROM applicants WHERE id = ?', [application.applicant_id]);
    const fullName = applicants[0]?.full_name || '';

    // Fetch major if exists
    const [majors] = await pool.query(
      `SELECT m.id, m.name 
       FROM application_major_choices am
       JOIN majors m ON am.major_id = m.id
       WHERE am.application_id = ? AND am.priority = 1`, 
      [application.id]
    );

    return {
      application: {
        registrationNumber: application.registration_number,
        status: application.status,
        submittedAt: application.submitted_at
      },
      applicant: {
        fullName
      },
      registration: {
        type: application.registration_type,
        formalInstitution: application.formal_institution_id ? {
          id: application.formal_institution_id,
          name: application.formal_institution_name
        } : null,
        pondokInstitution: application.pondok_institution_id ? {
          id: application.pondok_institution_id,
          name: application.pondok_institution_name
        } : null,
        major: majors.length > 0 ? {
          id: majors[0].id,
          name: majors[0].name
        } : null
      },
      completeness: {
        complete: completeness.complete,
        missing: completeness.missing
      }
    };
  }
}

module.exports = new PublicApplicationStatusService();
