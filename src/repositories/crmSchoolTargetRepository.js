const pool = require('../config/database');

const ALLOWED_SORT_COLUMNS = {
  id: 'cst.id',
  school_name: 'cst.school_name',
  schoolName: 'cst.school_name',
  education_level: 'cst.education_level',
  educationLevel: 'cst.education_level',
  city_regency: 'cst.city_regency',
  cityRegency: 'cst.city_regency',
  district: 'cst.district',
  status: 'cst.status',
  scheduled_at: 'cst.scheduled_at',
  scheduledAt: 'cst.scheduled_at',
  first_follow_up_at: 'cst.first_follow_up_at',
  created_at: 'cst.created_at',
  createdAt: 'cst.created_at',
  updated_at: 'cst.updated_at',
  updatedAt: 'cst.updated_at'
};

class CrmSchoolTargetRepository {
  _buildWhereClause({ search, status, educationLevel, cityRegency, district, scheduled }) {
    const conditions = [];
    const params = [];

    if (status && status !== 'ALL') {
      conditions.push('cst.status = ?');
      params.push(status);
    }

    if (educationLevel && educationLevel !== 'ALL') {
      conditions.push('cst.education_level = ?');
      params.push(educationLevel);
    }

    if (cityRegency && cityRegency.trim() !== '') {
      conditions.push('cst.city_regency LIKE ?');
      params.push(`%${cityRegency.trim()}%`);
    }

    if (district && district.trim() !== '') {
      conditions.push('cst.district LIKE ?');
      params.push(`%${district.trim()}%`);
    }

    if (scheduled) {
      if (scheduled === 'HAS_SCHEDULE') {
        conditions.push('cst.scheduled_at IS NOT NULL');
      } else if (scheduled === 'NO_SCHEDULE') {
        conditions.push('cst.scheduled_at IS NULL');
      } else if (scheduled === 'UPCOMING') {
        conditions.push('cst.scheduled_at >= NOW()');
      } else if (scheduled === 'PAST') {
        conditions.push('cst.scheduled_at < NOW()');
      }
    }

    if (search && search.trim() !== '') {
      const term = `%${search.trim()}%`;
      conditions.push('(cst.school_name LIKE ? OR cst.principal_name LIKE ? OR cst.contact_person LIKE ? OR cst.phone LIKE ? OR cst.email LIKE ? OR cst.city_regency LIKE ?)');
      params.push(term, term, term, term, term, term);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { where, params };
  }

  async findTargets(filters = {}) {
    const { where, params } = this._buildWhereClause(filters);

    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 10));
    const offset = (page - 1) * limit;

    const sortColumn = ALLOWED_SORT_COLUMNS[filters.sortBy] || 'cst.created_at';
    const sortOrder = filters.sortOrder && filters.sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const query = `
      SELECT 
        cst.*,
        u_create.name AS created_by_name,
        u_update.name AS updated_by_name,
        (SELECT COUNT(*) FROM crm_school_presentation_reports r WHERE r.school_target_id = cst.id) AS reports_count,
        (SELECT COUNT(*) FROM crm_school_target_letters l WHERE l.school_target_id = cst.id) AS letters_count
      FROM crm_school_targets cst
      LEFT JOIN users u_create ON cst.created_by = u_create.id
      LEFT JOIN users u_update ON cst.updated_by = u_update.id
      ${where}
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query(query, [...params, limit, offset]);
    return rows;
  }

  async countTargets(filters = {}) {
    const { where, params } = this._buildWhereClause(filters);
    const query = `SELECT COUNT(*) AS total FROM crm_school_targets cst ${where}`;
    const [rows] = await pool.query(query, params);
    return rows[0]?.total || 0;
  }

  async getTargetStats(filters = {}) {
    // If search or region filters are applied, respect them, but aggregate statuses
    const filterWithoutStatus = { ...filters };
    delete filterWithoutStatus.status;
    const { where, params } = this._buildWhereClause(filterWithoutStatus);

    const query = `
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN cst.status = 'LEADS' THEN 1 ELSE 0 END) AS leads_count,
        SUM(CASE WHEN cst.status = 'FOLLOWED_UP' THEN 1 ELSE 0 END) AS followed_up_count,
        SUM(CASE WHEN cst.status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected_count,
        SUM(CASE WHEN cst.status = 'SCHEDULED' THEN 1 ELSE 0 END) AS scheduled_count,
        SUM(CASE WHEN cst.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_count
      FROM crm_school_targets cst
      ${where}
    `;

    const [rows] = await pool.query(query, params);
    const row = rows[0] || {};
    return {
      total: Number(row.total || 0),
      leads: Number(row.leads_count || 0),
      followedUp: Number(row.followed_up_count || 0),
      rejected: Number(row.rejected_count || 0),
      scheduled: Number(row.scheduled_count || 0),
      completed: Number(row.completed_count || 0)
    };
  }

  async findPotentialDuplicates(schoolName, cityRegency = null, excludeId = null) {
    if (!schoolName || schoolName.trim() === '') return [];

    let query = `
      SELECT id, school_name, education_level, city_regency, district, status, contact_person, phone
      FROM crm_school_targets
      WHERE (LOWER(TRIM(school_name)) = LOWER(TRIM(?)) OR school_name LIKE ?)
    `;
    const params = [schoolName.trim(), `%${schoolName.trim()}%`];

    if (cityRegency && cityRegency.trim() !== '') {
      query += ` AND (city_regency LIKE ? OR ? LIKE CONCAT('%', city_regency, '%'))`;
      params.push(`%${cityRegency.trim()}%`, cityRegency.trim());
    }

    if (excludeId) {
      query += ` AND id != ?`;
      params.push(excludeId);
    }

    query += ` LIMIT 10`;

    const [rows] = await pool.query(query, params);
    return rows;
  }

  async findById(id) {
    const query = `
      SELECT 
        cst.*,
        u_create.name AS created_by_name,
        u_update.name AS updated_by_name,
        (SELECT COUNT(*) FROM crm_school_presentation_reports r WHERE r.school_target_id = cst.id) AS reports_count,
        (SELECT COUNT(*) FROM crm_school_target_letters l WHERE l.school_target_id = cst.id) AS letters_count
      FROM crm_school_targets cst
      LEFT JOIN users u_create ON cst.created_by = u_create.id
      LEFT JOIN users u_update ON cst.updated_by = u_update.id
      WHERE cst.id = ?
    `;
    const [rows] = await pool.query(query, [id]);
    return rows[0] || null;
  }

  async create(data, connection = pool) {
    const fields = [
      'school_name', 'education_level', 'address', 'village', 'district',
      'city_regency', 'province', 'principal_name', 'contact_person',
      'contact_position', 'phone', 'email', 'source', 'status',
      'first_follow_up_at', 'scheduled_at', 'scheduled_location',
      'rejection_reason', 'team_text', 'internal_notes', 'created_by', 'updated_by'
    ];

    const values = fields.map(f => (data[f] !== undefined ? data[f] : null));
    const placeholders = fields.map(() => '?').join(', ');

    const query = `INSERT INTO crm_school_targets (${fields.join(', ')}) VALUES (${placeholders})`;
    const [result] = await connection.query(query, values);
    return result.insertId;
  }

  async update(id, data, connection = pool) {
    const updatableFields = [
      'school_name', 'education_level', 'address', 'village', 'district',
      'city_regency', 'province', 'principal_name', 'contact_person',
      'contact_position', 'phone', 'email', 'source', 'status',
      'first_follow_up_at', 'scheduled_at', 'scheduled_location',
      'rejection_reason', 'team_text', 'internal_notes', 'updated_by'
    ];

    const updates = [];
    const values = [];

    for (const field of updatableFields) {
      if (data[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(data[field]);
      }
    }

    if (updates.length === 0) return true;

    values.push(id);
    const query = `UPDATE crm_school_targets SET ${updates.join(', ')} WHERE id = ?`;
    const [result] = await connection.query(query, values);
    return result.affectedRows > 0;
  }

  async delete(id, connection = pool) {
    const query = `DELETE FROM crm_school_targets WHERE id = ?`;
    const [result] = await connection.query(query, [id]);
    return result.affectedRows > 0;
  }

  // --- Status History ---
  async createStatusHistory({ school_target_id, old_status, new_status, note, changed_by }, connection = pool) {
    const query = `
      INSERT INTO crm_school_target_status_histories 
        (school_target_id, old_status, new_status, note, changed_by, changed_at)
      VALUES (?, ?, ?, ?, ?, NOW())
    `;
    const [result] = await connection.query(query, [
      school_target_id,
      old_status,
      new_status,
      note || null,
      changed_by || null
    ]);
    return result.insertId;
  }

  async findStatusHistories(schoolTargetId) {
    const query = `
      SELECT 
        h.*,
        u.name AS changed_by_name,
        u.email AS changed_by_email
      FROM crm_school_target_status_histories h
      LEFT JOIN users u ON h.changed_by = u.id
      WHERE h.school_target_id = ?
      ORDER BY h.changed_at DESC, h.id DESC
    `;
    const [rows] = await pool.query(query, [schoolTargetId]);
    return rows;
  }

  // --- Letter Settings ---
  async getActiveLetterSettings(connection = pool) {
    const query = `SELECT * FROM crm_school_letter_settings WHERE is_active = 1 ORDER BY id ASC LIMIT 1`;
    const [rows] = await connection.query(query);
    if (rows.length > 0) return rows[0];

    // If none exists, check any setting or create default initial row
    const [anyRows] = await connection.query(`SELECT * FROM crm_school_letter_settings ORDER BY id ASC LIMIT 1`);
    if (anyRows.length > 0) return anyRows[0];

    const defaultBody = `<p>Kepada Yth.<br/><strong>{{nama_kepala_sekolah_tujuan}}</strong><br/>{{nama_sekolah_tujuan}}<br/>di {{alamat_sekolah_tujuan}}</p><p>Assalamu'alaikum Warahmatullahi Wabarakatuh,</p><p>Dengan hormat, sehubungan dengan pelaksanaan Penerimaan Santri / Siswa Baru (SPMB) Tahun Pelajaran baru, kami bermaksud mengajukan permohonan izin untuk menyelenggarakan kegiatan Sosialisasi dan Presentasi Pengenalan Lembaga Pendidikan kepada siswa/siswi kelas akhir di {{nama_sekolah_tujuan}}.</p><p>Melalui presentasi ini, kami berharap dapat memberikan wawasan dan informasi lengkap mengenai jenjang pendidikan lanjutan, kurikulum, fasilitas asrama, program beasiswa, serta jalur seleksi masuk.</p><p>Demikian surat permohonan ini kami sampaikan. Atas perhatian, perkenan waktu, dan kerja sama yang baik dari Bapak/Ibu Kepala Sekolah beserta segenap dewan guru, kami haturkan terima kasih.</p><p>Wassalamu'alaikum Warahmatullahi Wabarakatuh.</p>`;

    const [insertResult] = await connection.query(`
      INSERT INTO crm_school_letter_settings 
        (setting_name, school_name, school_address, school_phone, school_email, school_website,
         letter_number_prefix, letter_number_format, letter_body_template, closing_text,
         principal_name, principal_title, default_city, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `, [
      'Template Standar Surat Permohonan',
      'Pondok Pesantren & Sekolah Islam Terpadu',
      'Jl. Raya Asy-Syadzili No. 1, Sumberpasir, Pakis, Kab. Malang, Jawa Timur',
      '0341-791000',
      'info@asy-syadzili.sch.id',
      'https://asy-syadzili.sch.id',
      'SPMB/PRES',
      '{prefix}/{num}/{month_rom}/{year}',
      defaultBody,
      'Hormat kami,',
      'Kepala Lembaga',
      'Pengasuh / Kepala Sekolah',
      'Malang'
    ]);

    const [newRow] = await connection.query(`SELECT * FROM crm_school_letter_settings WHERE id = ?`, [insertResult.insertId]);
    return newRow[0];
  }

  async updateLetterSettings(id, data, connection = pool) {
    const fields = [
      'setting_name', 'school_name', 'school_address', 'school_phone',
      'school_email', 'school_website', 'letterhead_logo_path', 'letterhead_image_path', 'letterhead_extra_text',
      'letter_number_prefix', 'letter_number_format', 'letter_body_template', 'closing_text',
      'principal_name', 'principal_title', 'principal_nip', 'principal_signature_path',
      'spmb_chair_name', 'spmb_chair_title', 'spmb_chair_nip', 'spmb_chair_signature_path',
      'default_city', 'is_active', 'updated_by'
    ];

    const updates = [];
    const values = [];

    for (const field of fields) {
      if (data[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(data[field]);
      }
    }

    if (updates.length === 0) return true;

    values.push(id);
    const query = `UPDATE crm_school_letter_settings SET ${updates.join(', ')} WHERE id = ?`;
    const [result] = await connection.query(query, values);
    return result.affectedRows > 0;
  }

  // --- Issued Letters ---
  async getNextLetterSequence(year, connection = pool) {
    // Lock table to prevent race conditions during concurrent letter issuance
    const [rows] = await connection.query(
      `SELECT COUNT(*) AS total FROM crm_school_target_letters WHERE YEAR(issue_date) = ? FOR UPDATE`,
      [year]
    );
    return (rows[0]?.total || 0) + 1;
  }

  async findLetterByNumber(letterNumber, connection = pool) {
    const [rows] = await connection.query(
      `SELECT * FROM crm_school_target_letters WHERE letter_number = ?`,
      [letterNumber]
    );
    return rows[0] || null;
  }

  async createTargetLetter(data, connection = pool) {
    const fields = [
      'school_target_id', 'letter_settings_id', 'letter_number', 'issue_date',
      'recipient_name_snapshot', 'school_name_snapshot', 'address_snapshot',
      'letter_content_snapshot', 'signer_snapshot', 'generated_by'
    ];
    const values = fields.map(f => (data[f] !== undefined ? data[f] : null));
    const placeholders = fields.map(() => '?').join(', ');

    const query = `INSERT INTO crm_school_target_letters (${fields.join(', ')}) VALUES (${placeholders})`;
    const [result] = await connection.query(query, values);
    return result.insertId;
  }

  async findLettersByTargetId(schoolTargetId) {
    const query = `
      SELECT 
        l.*,
        u.name AS generated_by_name
      FROM crm_school_target_letters l
      LEFT JOIN users u ON l.generated_by = u.id
      WHERE l.school_target_id = ?
      ORDER BY l.issue_date DESC, l.id DESC
    `;
    const [rows] = await pool.query(query, [schoolTargetId]);
    return rows;
  }

  async findLetterById(letterId) {
    const query = `
      SELECT 
        l.*,
        u.name AS generated_by_name,
        cst.school_name AS current_school_name,
        cst.city_regency,
        cst.status AS current_target_status
      FROM crm_school_target_letters l
      LEFT JOIN users u ON l.generated_by = u.id
      LEFT JOIN crm_school_targets cst ON l.school_target_id = cst.id
      WHERE l.id = ?
    `;
    const [rows] = await pool.query(query, [letterId]);
    return rows[0] || null;
  }

  // --- Presentation Reports ---
  async findReportsByTargetId(schoolTargetId) {
    const query = `
      SELECT 
        r.*,
        u_create.name AS created_by_name,
        u_update.name AS updated_by_name
      FROM crm_school_presentation_reports r
      LEFT JOIN users u_create ON r.created_by = u_create.id
      LEFT JOIN users u_update ON r.updated_by = u_update.id
      WHERE r.school_target_id = ?
      ORDER BY r.held_at DESC, r.id DESC
    `;
    const [reports] = await pool.query(query, [schoolTargetId]);

    if (reports.length === 0) return [];

    const reportIds = reports.map(r => r.id);
    const placeholders = reportIds.map(() => '?').join(',');
    const [photos] = await pool.query(
      `SELECT * FROM crm_school_presentation_photos WHERE presentation_report_id IN (${placeholders}) ORDER BY sort_order ASC, id ASC`,
      reportIds
    );

    const photosByReportId = {};
    for (const photo of photos) {
      if (!photosByReportId[photo.presentation_report_id]) {
        photosByReportId[photo.presentation_report_id] = [];
      }
      photosByReportId[photo.presentation_report_id].push(photo);
    }

    return reports.map(r => ({
      ...r,
      photos: photosByReportId[r.id] || []
    }));
  }

  async findReportById(reportId) {
    const query = `
      SELECT 
        r.*,
        u_create.name AS created_by_name,
        u_update.name AS updated_by_name,
        cst.school_name AS target_school_name
      FROM crm_school_presentation_reports r
      LEFT JOIN users u_create ON r.created_by = u_create.id
      LEFT JOIN users u_update ON r.updated_by = u_update.id
      LEFT JOIN crm_school_targets cst ON r.school_target_id = cst.id
      WHERE r.id = ?
    `;
    const [rows] = await pool.query(query, [reportId]);
    if (!rows[0]) return null;

    const [photos] = await pool.query(
      `SELECT * FROM crm_school_presentation_photos WHERE presentation_report_id = ? ORDER BY sort_order ASC, id ASC`,
      [reportId]
    );

    return {
      ...rows[0],
      photos
    };
  }

  async countReportsByTargetId(schoolTargetId, connection = pool) {
    const [rows] = await connection.query(
      `SELECT COUNT(*) AS total FROM crm_school_presentation_reports WHERE school_target_id = ?`,
      [schoolTargetId]
    );
    return rows[0]?.total || 0;
  }

  async createReport(data, connection = pool) {
    const fields = [
      'school_target_id', 'held_at', 'location', 'team_text', 'participant_count',
      'summary', 'evaluation', 'school_response', 'obstacles', 'follow_up_plan',
      'additional_notes', 'created_by', 'updated_by'
    ];
    const values = fields.map(f => (data[f] !== undefined ? data[f] : null));
    const placeholders = fields.map(() => '?').join(', ');

    const query = `INSERT INTO crm_school_presentation_reports (${fields.join(', ')}) VALUES (${placeholders})`;
    const [result] = await connection.query(query, values);
    return result.insertId;
  }

  async updateReport(id, data, connection = pool) {
    const fields = [
      'held_at', 'location', 'team_text', 'participant_count',
      'summary', 'evaluation', 'school_response', 'obstacles',
      'follow_up_plan', 'additional_notes', 'updated_by'
    ];
    const updates = [];
    const values = [];

    for (const field of fields) {
      if (data[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(data[field]);
      }
    }

    if (updates.length === 0) return true;

    values.push(id);
    const query = `UPDATE crm_school_presentation_reports SET ${updates.join(', ')} WHERE id = ?`;
    const [result] = await connection.query(query, values);
    return result.affectedRows > 0;
  }

  async deleteReport(id, connection = pool) {
    const query = `DELETE FROM crm_school_presentation_reports WHERE id = ?`;
    const [result] = await connection.query(query, [id]);
    return result.affectedRows > 0;
  }

  // --- Photos ---
  async findPhotoById(photoId) {
    const [rows] = await pool.query(`SELECT * FROM crm_school_presentation_photos WHERE id = ?`, [photoId]);
    return rows[0] || null;
  }

  async createPhoto(data, connection = pool) {
    const fields = [
      'presentation_report_id', 'file_path', 'original_filename',
      'mime_type', 'file_size_bytes', 'caption', 'sort_order', 'uploaded_by'
    ];
    const values = fields.map(f => (data[f] !== undefined ? data[f] : null));
    const placeholders = fields.map(() => '?').join(', ');

    const query = `INSERT INTO crm_school_presentation_photos (${fields.join(', ')}) VALUES (${placeholders})`;
    const [result] = await connection.query(query, values);
    return result.insertId;
  }

  async deletePhoto(photoId, connection = pool) {
    const query = `DELETE FROM crm_school_presentation_photos WHERE id = ?`;
    const [result] = await connection.query(query, [photoId]);
    return result.affectedRows > 0;
  }
}

module.exports = new CrmSchoolTargetRepository();
