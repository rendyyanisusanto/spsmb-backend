const pool = require('../config/database');

class ApplicationRepository {
  async create(application, connection) {
    const [result] = await connection.query(
      `INSERT INTO applications 
        (registration_number, applicant_id, admission_period_id, admission_wave_id, 
         registration_type, formal_institution_id, pondok_institution_id, 
         status, step_completed, continue_token_hash, continue_token_expires_at, last_saved_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        application.registration_number,
        application.applicant_id,
        application.admission_period_id,
        application.admission_wave_id,
        application.registration_type,
        application.formal_institution_id,
        application.pondok_institution_id,
        application.status,
        application.step_completed,
        application.continue_token_hash,
        application.continue_token_expires_at
      ]
    );
    return result.insertId;
  }

  async updateRegistrationNumber(applicationId, registrationNumber, connection) {
    await connection.query(
      `UPDATE applications SET registration_number = ? WHERE id = ?`,
      [registrationNumber, applicationId]
    );
  }

  async getReceiptByRegistrationNumber(registrationNumber) {
    const query = `
      SELECT 
        a.id as application_id,
        a.registration_number,
        a.status,
        a.registration_type,
        a.continue_token_hash,
        a.continue_token_expires_at,
        a.created_at,
        ap.full_name,
        ap.gender,
        ap.whatsapp,
        ap.address,
        ap.previous_school,
        g.name as parent_name,
        fi.id as formal_institution_id,
        fi.name as formal_institution_name,
        pi.id as pondok_institution_id,
        pi.name as pondok_institution_name,
        per.id as period_id,
        per.name as period_name,
        w.id as wave_id,
        w.name as wave_name
      FROM applications a
      JOIN applicants ap ON a.applicant_id = ap.id
      LEFT JOIN applicant_guardians g ON ap.id = g.applicant_id AND g.relationship = 'GUARDIAN'
      LEFT JOIN institutions fi ON a.formal_institution_id = fi.id
      LEFT JOIN institutions pi ON a.pondok_institution_id = pi.id
      LEFT JOIN admission_periods per ON a.admission_period_id = per.id
      LEFT JOIN admission_waves w ON a.admission_wave_id = w.id
      WHERE a.registration_number = ?
    `;
    const [rows] = await pool.query(query, [registrationNumber]);
    return rows.length > 0 ? rows[0] : null;
  }

  async findByRegistrationNumber(registrationNumber) {
    const [rows] = await pool.query('SELECT * FROM applications WHERE registration_number = ?', [registrationNumber]);
    return rows.length > 0 ? rows[0] : null;
  }

  async findApplicationById(id) {
    const query = `
      SELECT 
        a.id,
        a.registration_number,
        a.applicant_id,
        a.registration_type,
        a.status,
        a.step_completed,
        a.created_at,
        a.updated_at,
        a.submitted_at,
        fi.id as formal_institution_id,
        fi.code as formal_institution_code,
        fi.name as formal_institution_name,
        pi.id as pondok_institution_id,
        pi.code as pondok_institution_code,
        pi.name as pondok_institution_name,
        per.id as period_id,
        per.academic_year as period_academic_year,
        per.start_date as period_start_date,
        per.end_date as period_end_date,
        per.is_active as period_is_active,
        w.id as wave_id,
        w.name as wave_name,
        w.start_date as wave_start_date,
        w.end_date as wave_end_date,
        w.is_active as wave_is_active
      FROM applications a
      LEFT JOIN institutions fi ON a.formal_institution_id = fi.id
      LEFT JOIN institutions pi ON a.pondok_institution_id = pi.id
      LEFT JOIN admission_periods per ON a.admission_period_id = per.id
      LEFT JOIN admission_waves w ON a.admission_wave_id = w.id
      WHERE a.id = ?
    `;
    const [rows] = await pool.query(query, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  async findApplicationByRegistrationNumber(registrationNumber) {
    const query = `
      SELECT 
        a.id,
        a.registration_number,
        a.applicant_id,
        a.registration_type,
        a.status,
        a.step_completed,
        a.created_at,
        a.updated_at,
        a.submitted_at,
        fi.id as formal_institution_id,
        fi.code as formal_institution_code,
        fi.name as formal_institution_name,
        pi.id as pondok_institution_id,
        pi.code as pondok_institution_code,
        pi.name as pondok_institution_name,
        per.id as period_id,
        per.academic_year as period_academic_year,
        per.start_date as period_start_date,
        per.end_date as period_end_date,
        per.is_active as period_is_active,
        w.id as wave_id,
        w.name as wave_name,
        w.start_date as wave_start_date,
        w.end_date as wave_end_date,
        w.is_active as wave_is_active
      FROM applications a
      LEFT JOIN institutions fi ON a.formal_institution_id = fi.id
      LEFT JOIN institutions pi ON a.pondok_institution_id = pi.id
      LEFT JOIN admission_periods per ON a.admission_period_id = per.id
      LEFT JOIN admission_waves w ON a.admission_wave_id = w.id
      WHERE a.registration_number = ?
    `;
    const [rows] = await pool.query(query, [registrationNumber]);
    return rows.length > 0 ? rows[0] : null;
  }

  async findApplicantByApplicationId(applicationId) {
    const query = `
      SELECT 
        ap.id,
        ap.full_name,
        ap.gender,
        ap.whatsapp,
        ap.address,
        ap.previous_school,
        ap.nik,
        ap.nisn,
        ap.birth_place,
        ap.birth_date,
        ap.created_at,
        ap.updated_at,
        info.id as information_source_id,
        info.name as information_source_name,
        ap.information_source_other
      FROM applications a
      JOIN applicants ap ON a.applicant_id = ap.id
      LEFT JOIN information_sources info ON ap.information_source_id = info.id
      WHERE a.id = ?
    `;
    const [rows] = await pool.query(query, [applicationId]);
    return rows.length > 0 ? rows[0] : null;
  }

  async findGuardiansByApplicantId(applicantId) {
    const query = `
      SELECT 
        id,
        relationship,
        name,
        nik,
        phone,
        occupation,
        education,
        income,
        address
      FROM applicant_guardians
      WHERE applicant_id = ?
    `;
    const [rows] = await pool.query(query, [applicantId]);
    return rows;
  }

  async findMajorChoicesByApplicationId(applicationId) {
    const query = `
      SELECT 
        amc.major_id,
        amc.priority,
        m.code,
        m.name
      FROM application_major_choices amc
      JOIN majors m ON amc.major_id = m.id
      WHERE amc.application_id = ?
      ORDER BY amc.priority ASC
    `;
    const [rows] = await pool.query(query, [applicationId]);
    return rows;
  }

  async findDynamicAnswersByApplicationId(applicationId) {
    const query = `
      SELECT 
        aa.form_field_id,
        aa.answer_value,
        ff.field_code as field_code,
        ff.label,
        ff.input_type,
        fs.id as section_id,
        fs.code as section_code,
        fs.name as section_name,
        ft.id as target_id,
        ft.code as target_code,
        ft.target_type
      FROM application_answers aa
      JOIN form_fields ff ON aa.form_field_id = ff.id
      JOIN form_sections fs ON ff.form_section_id = fs.id
      JOIN form_targets ft ON ff.form_target_id = ft.id
      WHERE aa.application_id = ?
    `;
    const [rows] = await pool.query(query, [applicationId]);
    return rows;
  }

  async findDynamicAnswersByApplicationIds(applicationIds) {
    if (!applicationIds || applicationIds.length === 0) return [];
    
    const query = `
      SELECT 
        aa.application_id,
        aa.form_field_id,
        aa.answer_value,
        ff.field_code as field_code,
        ff.label,
        ff.input_type,
        fs.id as section_id,
        fs.code as section_code,
        fs.name as section_name,
        ft.id as target_id,
        ft.code as target_code,
        ft.target_type
      FROM application_answers aa
      JOIN form_fields ff ON aa.form_field_id = ff.id
      JOIN form_sections fs ON ff.form_section_id = fs.id
      JOIN form_targets ft ON ff.form_target_id = ft.id
      WHERE aa.application_id IN (?)
    `;
    const [rows] = await pool.query(query, [applicationIds]);
    return rows;
  }

  async findDocumentsByApplicationId(applicationId) {
    const query = `
      SELECT 
        ad.id,
        ad.document_type_id,
        ad.file_name,
        ad.file_path,
        ad.file_size,
        ad.mime_type,
        ad.uploaded_at,
        dt.code as document_code,
        dt.name as document_name
      FROM applicant_documents ad
      JOIN document_types dt ON ad.document_type_id = dt.id
      WHERE ad.application_id = ?
    `;
    const [rows] = await pool.query(query, [applicationId]);
    return rows;
  }

  async updateStatus(id, status, connection = pool) {
    const updateQuery = `
      UPDATE applications 
      SET 
        status = ?, 
        updated_at = NOW(),
        submitted_at = IF(? = 'SUBMITTED' AND submitted_at IS NULL, NOW(), submitted_at)
      WHERE id = ?
    `;
    await connection.query(updateQuery, [status, status, id]);
  }

  _buildApplicationsQuery(params, isCount = false) {
    let query = isCount 
      ? 'SELECT COUNT(DISTINCT a.id) as total FROM applications a'
      : `SELECT 
          a.id,
          a.registration_number as registrationNumber,
          a.status,
          a.registration_type as registrationType,
          a.step_completed as stepCompleted,
          a.created_at as createdAt,
          a.updated_at as updatedAt,
          a.submitted_at as submittedAt,
          ap.id as applicantId,
          ap.full_name as applicantFullName,
          ap.gender as applicantGender,
          ap.whatsapp as applicantWhatsapp,
          fi.id as formalInstitutionId,
          fi.code as formalInstitutionCode,
          fi.name as formalInstitutionName,
          pi.id as pondokInstitutionId,
          pi.code as pondokInstitutionCode,
          pi.name as pondokInstitutionName,
          per.id as periodId,
          per.academic_year as periodAcademicYear,
          w.id as waveId,
          w.name as waveName
        FROM applications a`;

    query += `
      JOIN applicants ap ON a.applicant_id = ap.id
      LEFT JOIN institutions fi ON a.formal_institution_id = fi.id
      LEFT JOIN institutions pi ON a.pondok_institution_id = pi.id
      LEFT JOIN admission_periods per ON a.admission_period_id = per.id
      LEFT JOIN admission_waves w ON a.admission_wave_id = w.id
    `;

    const where = [];
    const values = [];

    // Scope check
    if (params.institutionScope && params.institutionScope.length > 0) {
      where.push('(a.formal_institution_id IN (?) OR a.pondok_institution_id IN (?))');
      values.push(params.institutionScope);
      values.push(params.institutionScope);
    }

    if (params.search) {
      where.push('(a.registration_number LIKE ? OR ap.full_name LIKE ? OR ap.whatsapp LIKE ? OR ap.nik LIKE ? OR ap.nisn LIKE ?)');
      const searchTerm = `%${params.search}%`;
      values.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (params.status) {
      where.push('a.status = ?');
      values.push(params.status);
    }

    if (params.registrationType) {
      where.push('a.registration_type = ?');
      values.push(params.registrationType);
    }

    if (params.formalInstitutionId) {
      where.push('a.formal_institution_id = ?');
      values.push(params.formalInstitutionId);
    }

    if (params.pondokInstitutionId) {
      where.push('a.pondok_institution_id = ?');
      values.push(params.pondokInstitutionId);
    }

    if (params.admissionPeriodId) {
      where.push('a.admission_period_id = ?');
      values.push(params.admissionPeriodId);
    }

    if (params.admissionWaveId) {
      where.push('a.admission_wave_id = ?');
      values.push(params.admissionWaveId);
    }

    if (params.gender) {
      where.push('ap.gender = ?');
      values.push(params.gender);
    }

    if (params.informationSourceId) {
      where.push('ap.information_source_id = ?');
      values.push(params.informationSourceId);
    }

    if (params.dateFrom) {
      where.push('a.created_at >= ?');
      values.push(`${params.dateFrom} 00:00:00`);
    }

    if (params.dateTo) {
      where.push('a.created_at <= ?');
      values.push(`${params.dateTo} 23:59:59`);
    }

    if (where.length > 0) {
      query += ' WHERE ' + where.join(' AND ');
    }

    if (!isCount) {
      const allowedSortFields = {
        created_at: 'a.created_at',
        updated_at: 'a.updated_at',
        registration_number: 'a.registration_number',
        full_name: 'ap.full_name',
        status: 'a.status'
      };

      const sortBy = allowedSortFields[params.sortBy] || 'a.created_at';
      const sortOrder = params.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      query += ` ORDER BY ${sortBy} ${sortOrder}`;

      if (params.limit && params.page) {
        const offset = (params.page - 1) * params.limit;
        query += ` LIMIT ? OFFSET ?`;
        values.push(Number(params.limit), Number(offset));
      }
    }

    return { query, values };
  }

  async findApplications(params) {
    const { query, values } = this._buildApplicationsQuery(params, false);
    const [rows] = await pool.query(query, values);
    return rows;
  }

  async countApplications(params) {
    const { query, values } = this._buildApplicationsQuery(params, true);
    const [rows] = await pool.query(query, values);
    return rows[0].total;
  }
}

module.exports = new ApplicationRepository();
