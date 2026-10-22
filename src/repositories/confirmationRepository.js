const pool = require('../config/database');

class ConfirmationRepository {
  // --- TRACKS ---
  async getTracks(institutionId = null, academicYear = null, isActive = null) {
    let query = `
      SELECT ct.*, i.name as institution_name, i.code as institution_code,
             (SELECT COUNT(*) FROM application_confirmations ac WHERE ac.confirmation_track_id = ct.id) as total_students
      FROM confirmation_tracks ct
      JOIN institutions i ON ct.institution_id = i.id
      WHERE 1=1
    `;
    const params = [];

    if (institutionId) {
      query += ` AND ct.institution_id = ?`;
      params.push(institutionId);
    }
    if (academicYear) {
      query += ` AND ct.academic_year = ?`;
      params.push(academicYear);
    }
    if (isActive !== null && isActive !== undefined) {
      query += ` AND ct.is_active = ?`;
      params.push(isActive ? 1 : 0);
    }

    query += ` ORDER BY ct.institution_id ASC, ct.name ASC`;
    const [rows] = await pool.query(query, params);
    return rows;
  }

  async getTrackById(id) {
    const [rows] = await pool.query(`
      SELECT ct.*, i.name as institution_name, i.code as institution_code,
             (SELECT COUNT(*) FROM application_confirmations ac WHERE ac.confirmation_track_id = ct.id) as total_students
      FROM confirmation_tracks ct
      JOIN institutions i ON ct.institution_id = i.id
      WHERE ct.id = ?
    `, [id]);
    return rows[0] || null;
  }

  async createTrack(data) {
    const [result] = await pool.query(`
      INSERT INTO confirmation_tracks (institution_id, name, code, academic_year, description, start_date, end_date, is_active, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      data.institution_id,
      data.name,
      data.code || null,
      data.academic_year || '2027/2028',
      data.description || null,
      data.start_date || null,
      data.end_date || null,
      data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
      data.created_by || null
    ]);
    return result.insertId;
  }

  async updateTrack(id, data) {
    const updates = [];
    const params = [];

    if (data.name !== undefined) { updates.push('name = ?'); params.push(data.name); }
    if (data.code !== undefined) { updates.push('code = ?'); params.push(data.code); }
    if (data.academic_year !== undefined) { updates.push('academic_year = ?'); params.push(data.academic_year); }
    if (data.description !== undefined) { updates.push('description = ?'); params.push(data.description); }
    if (data.start_date !== undefined) { updates.push('start_date = ?'); params.push(data.start_date); }
    if (data.end_date !== undefined) { updates.push('end_date = ?'); params.push(data.end_date); }
    if (data.is_active !== undefined) { updates.push('is_active = ?'); params.push(data.is_active ? 1 : 0); }

    if (updates.length === 0) return true;

    params.push(id);
    await pool.query(`UPDATE confirmation_tracks SET ${updates.join(', ')} WHERE id = ?`, params);
    return true;
  }

  async deleteTrack(id) {
    await pool.query(`DELETE FROM confirmation_tracks WHERE id = ?`, [id]);
    return true;
  }

  // --- FEE COMPONENTS ---
  async getFeeComponents(institutionId = null, confirmationTrackId = null, isActive = null) {
    let query = `
      SELECT cfc.*, i.name as institution_name, ct.name as track_name
      FROM confirmation_fee_components cfc
      JOIN institutions i ON cfc.institution_id = i.id
      LEFT JOIN confirmation_tracks ct ON cfc.confirmation_track_id = ct.id
      WHERE 1=1
    `;
    const params = [];

    if (institutionId) {
      query += ` AND cfc.institution_id = ?`;
      params.push(institutionId);
    }
    if (confirmationTrackId) {
      query += ` AND (cfc.confirmation_track_id = ? OR cfc.confirmation_track_id IS NULL)`;
      params.push(confirmationTrackId);
    }
    if (isActive !== null && isActive !== undefined) {
      query += ` AND cfc.is_active = ?`;
      params.push(isActive ? 1 : 0);
    }

    query += ` ORDER BY cfc.institution_id ASC, cfc.order_index ASC, cfc.id ASC`;
    const [rows] = await pool.query(query, params);
    return rows;
  }

  async getFeeComponentById(id) {
    const [rows] = await pool.query(`
      SELECT cfc.*, i.name as institution_name, ct.name as track_name
      FROM confirmation_fee_components cfc
      JOIN institutions i ON cfc.institution_id = i.id
      LEFT JOIN confirmation_tracks ct ON cfc.confirmation_track_id = ct.id
      WHERE cfc.id = ?
    `, [id]);
    return rows[0] || null;
  }

  async createFeeComponent(data) {
    const [result] = await pool.query(`
      INSERT INTO confirmation_fee_components (institution_id, confirmation_track_id, name, description, amount, is_required, is_active, order_index, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      data.institution_id,
      data.confirmation_track_id || null,
      data.name,
      data.description || null,
      data.amount || 0,
      data.is_required !== undefined ? (data.is_required ? 1 : 0) : 1,
      data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
      data.order_index || 1,
      data.created_by || null
    ]);
    return result.insertId;
  }

  async updateFeeComponent(id, data) {
    const updates = [];
    const params = [];

    if (data.name !== undefined) { updates.push('name = ?'); params.push(data.name); }
    if (data.description !== undefined) { updates.push('description = ?'); params.push(data.description); }
    if (data.amount !== undefined) { updates.push('amount = ?'); params.push(data.amount); }
    if (data.confirmation_track_id !== undefined) { updates.push('confirmation_track_id = ?'); params.push(data.confirmation_track_id || null); }
    if (data.is_required !== undefined) { updates.push('is_required = ?'); params.push(data.is_required ? 1 : 0); }
    if (data.is_active !== undefined) { updates.push('is_active = ?'); params.push(data.is_active ? 1 : 0); }
    if (data.order_index !== undefined) { updates.push('order_index = ?'); params.push(data.order_index); }

    if (updates.length === 0) return true;

    params.push(id);
    await pool.query(`UPDATE confirmation_fee_components SET ${updates.join(', ')} WHERE id = ?`, params);
    return true;
  }

  async deleteFeeComponent(id) {
    await pool.query(`DELETE FROM confirmation_fee_components WHERE id = ?`, [id]);
    return true;
  }

  // --- APPLICATION CONFIRMATIONS ---
  async getApplicantsForConfirmation(options = {}) {
    const {
      institutionId = null,
      academicYear = null,
      status = null,
      docStatus = null,
      payStatus = null,
      search = '',
      page = 1,
      limit = 20
    } = options;

    let whereClause = `WHERE a.status = 'SUBMITTED'`;
    const params = [];

    if (institutionId) {
      whereClause += ` AND (a.formal_institution_id = ? OR (a.formal_institution_id IS NULL AND a.pondok_institution_id = ?))`;
      params.push(institutionId, institutionId);
    }

    if (academicYear) {
      whereClause += ` AND (ac.academic_year = ? OR p.academic_year = ?)`;
      params.push(academicYear, academicYear);
    }

    if (status) {
      if (status === 'BELUM_PROSES') {
        whereClause += ` AND ac.id IS NULL`;
      } else {
        whereClause += ` AND ac.status = ?`;
        params.push(status);
      }
    }

    if (docStatus) {
      whereClause += ` AND ac.document_verification_status = ?`;
      params.push(docStatus);
    }

    if (payStatus) {
      whereClause += ` AND ac.payment_status = ?`;
      params.push(payStatus);
    }

    if (search && search.trim()) {
      whereClause += ` AND (ap.full_name LIKE ? OR a.registration_number LIKE ? OR ap.whatsapp LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    // Count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM applications a
      JOIN applicants ap ON a.applicant_id = ap.id
      LEFT JOIN admission_periods p ON a.admission_period_id = p.id
      LEFT JOIN application_confirmations ac ON a.id = ac.application_id
      LEFT JOIN institutions fi ON a.formal_institution_id = fi.id
      LEFT JOIN institutions pi ON a.pondok_institution_id = pi.id
      ${whereClause}
    `;
    const [countRows] = await pool.query(countQuery, params);
    const total = countRows[0].total;

    // Data
    const offset = (page - 1) * limit;
    const dataQuery = `
      SELECT 
        a.id as application_id,
        a.registration_number,
        a.registration_type,
        a.status as application_status,
        a.submitted_at,
        ap.id as applicant_id,
        ap.full_name,
        ap.gender,
        ap.whatsapp,
        ap.previous_school,
        fi.id as formal_institution_id,
        fi.name as formal_institution_name,
        fi.code as formal_institution_code,
        pi.id as pondok_institution_id,
        pi.name as pondok_institution_name,
        pi.code as pondok_institution_code,
        p.name as period_name,
        p.academic_year as period_academic_year,
        ac.id as confirmation_id,
        ac.status as confirmation_status,
        ac.document_verification_status,
        ac.payment_status,
        ac.total_bill_amount,
        ac.total_paid_amount,
        ac.official_student_number,
        ac.decision_date,
        ct.id as track_id,
        ct.name as track_name,
        ct.code as track_code
      FROM applications a
      JOIN applicants ap ON a.applicant_id = ap.id
      LEFT JOIN admission_periods p ON a.admission_period_id = p.id
      LEFT JOIN application_confirmations ac ON a.id = ac.application_id
      LEFT JOIN confirmation_tracks ct ON ac.confirmation_track_id = ct.id
      LEFT JOIN institutions fi ON a.formal_institution_id = fi.id
      LEFT JOIN institutions pi ON a.pondok_institution_id = pi.id
      ${whereClause}
      ORDER BY a.submitted_at DESC, a.id DESC
      LIMIT ? OFFSET ?
    `;

    const queryParams = [...params, limit, offset];
    const [rows] = await pool.query(dataQuery, queryParams);

    return {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
      data: rows
    };
  }

  async getConfirmationDetail(applicationId) {
    const [appRows] = await pool.query(`
      SELECT 
        a.*,
        ap.full_name, ap.gender, ap.whatsapp, ap.birth_place, ap.birth_date,
        ap.address, ap.previous_school, ap.nik, ap.nisn,
        g.name as parent_name, g.phone as parent_phone, g.relationship as parent_relationship,
        fi.id as formal_inst_id, fi.name as formal_institution_name, fi.code as formal_institution_code,
        pi.id as pondok_inst_id, pi.name as pondok_institution_name, pi.code as pondok_institution_code,
        p.name as period_name, p.academic_year as period_academic_year,
        w.name as wave_name
      FROM applications a
      JOIN applicants ap ON a.applicant_id = ap.id
      LEFT JOIN applicant_guardians g ON ap.id = g.applicant_id
      LEFT JOIN institutions fi ON a.formal_institution_id = fi.id
      LEFT JOIN institutions pi ON a.pondok_institution_id = pi.id
      LEFT JOIN admission_periods p ON a.admission_period_id = p.id
      LEFT JOIN admission_waves w ON a.admission_wave_id = w.id
      WHERE a.id = ?
    `, [applicationId]);

    if (appRows.length === 0) return null;
    const application = appRows[0];

    // Determine target institution for confirmation
    const targetInstitutionId = application.formal_institution_id || application.pondok_institution_id;

    // Confirmation record if exists
    const [confRows] = await pool.query(`
      SELECT ac.*, ct.name as track_name, ct.code as track_code, u.name as decided_by_name
      FROM application_confirmations ac
      LEFT JOIN confirmation_tracks ct ON ac.confirmation_track_id = ct.id
      LEFT JOIN users u ON ac.decided_by = u.id
      WHERE ac.application_id = ?
    `, [applicationId]);
    const confirmation = confRows[0] || null;

    // Available tracks for target institution
    const [tracks] = await pool.query(`
      SELECT * FROM confirmation_tracks
      WHERE institution_id = ? AND is_active = 1
      ORDER BY name ASC
    `, [targetInstitutionId]);

    // Bill items and payments if confirmation exists
    let billItems = [];
    let payments = [];
    let docVerifications = [];

    if (confirmation) {
      const [bills] = await pool.query(`
        SELECT * FROM confirmation_bill_items WHERE confirmation_id = ? ORDER BY id ASC
      `, [confirmation.id]);
      billItems = bills;

      const [pays] = await pool.query(`
        SELECT cp.*, u.name as verified_by_name
        FROM confirmation_payments cp
        LEFT JOIN users u ON cp.verified_by = u.id
        WHERE cp.confirmation_id = ?
        ORDER BY cp.payment_date DESC, cp.id DESC
      `, [confirmation.id]);
      payments = pays;

      const [docs] = await pool.query(`
        SELECT cdv.*, dt.name as doc_name, dt.code as doc_code, dt.description as doc_description,
               ad.file_name, ad.file_path, ad.file_size, ad.mime_type, ad.uploaded_at,
               u.name as verified_by_name
        FROM confirmation_document_verifications cdv
        JOIN document_types dt ON cdv.document_type_id = dt.id
        LEFT JOIN applicant_documents ad ON cdv.applicant_document_id = ad.id
        LEFT JOIN users u ON cdv.verified_by = u.id
        WHERE cdv.confirmation_id = ?
        ORDER BY dt.id ASC
      `, [confirmation.id]);
      docVerifications = docs;
    }

    return {
      application,
      targetInstitutionId,
      confirmation,
      tracks,
      billItems,
      payments,
      docVerifications
    };
  }

  async getOfficialStudents(options = {}) {
    const {
      institutionId = null,
      confirmationTrackId = null,
      academicYear = null,
      search = '',
      page = 1,
      limit = 20
    } = options;

    let whereClause = `WHERE ac.status = 'DITERIMA'`;
    const params = [];

    if (institutionId) {
      whereClause += ` AND ac.institution_id = ?`;
      params.push(institutionId);
    }
    if (confirmationTrackId) {
      whereClause += ` AND ac.confirmation_track_id = ?`;
      params.push(confirmationTrackId);
    }
    if (academicYear) {
      whereClause += ` AND ac.academic_year = ?`;
      params.push(academicYear);
    }
    if (search && search.trim()) {
      whereClause += ` AND (ap.full_name LIKE ? OR a.registration_number LIKE ? OR ac.official_student_number LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    // Count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM application_confirmations ac
      JOIN applications a ON ac.application_id = a.id
      JOIN applicants ap ON a.applicant_id = ap.id
      ${whereClause}
    `;
    const [countRows] = await pool.query(countQuery, params);
    const total = countRows[0].total;

    const offset = (page - 1) * limit;
    const dataQuery = `
      SELECT 
        ac.id as confirmation_id,
        ac.official_student_number,
        ac.academic_year,
        ac.decision_date,
        ac.total_paid_amount,
        ac.status as confirmation_status,
        a.id as application_id,
        a.registration_number,
        ap.full_name,
        ap.gender,
        ap.whatsapp,
        ap.previous_school,
        i.id as institution_id,
        i.name as institution_name,
        i.code as institution_code,
        ct.name as track_name,
        ct.code as track_code,
        u.name as decided_by_name
      FROM application_confirmations ac
      JOIN applications a ON ac.application_id = a.id
      JOIN applicants ap ON a.applicant_id = ap.id
      JOIN institutions i ON ac.institution_id = i.id
      JOIN confirmation_tracks ct ON ac.confirmation_track_id = ct.id
      LEFT JOIN users u ON ac.decided_by = u.id
      ${whereClause}
      ORDER BY ac.decision_date DESC, ac.id DESC
      LIMIT ? OFFSET ?
    `;

    const queryParams = [...params, limit, offset];
    const [rows] = await pool.query(dataQuery, queryParams);

    return {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
      data: rows
    };
  }
}

module.exports = new ConfirmationRepository();
