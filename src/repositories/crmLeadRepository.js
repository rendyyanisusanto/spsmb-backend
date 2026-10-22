const pool = require('../config/database');

const ALLOWED_SORT_COLUMNS = {
  id: 'cl.id',
  full_name: 'cl.full_name',
  fullName: 'cl.full_name',
  school_origin: 'cl.school_origin',
  schoolOrigin: 'cl.school_origin',
  phone: 'cl.phone',
  status: 'cl.status',
  created_at: 'cl.created_at',
  createdAt: 'cl.created_at',
  updated_at: 'cl.updated_at',
  updatedAt: 'cl.updated_at',
  next_follow_up_at: 'cl.next_follow_up_at',
  nextFollowUpAt: 'cl.next_follow_up_at'
};

class CrmLeadRepository {
  _buildWhereClause({ search, status, institutionId, institutionScope, leadByUserId }) {
    const conditions = [];
    const params = [];

    // Institution scoping (for non-SUPER_ADMIN)
    if (institutionScope && Array.isArray(institutionScope)) {
      if (institutionScope.length === 0) {
        conditions.push('1 = 0');
      } else {
        const placeholders = institutionScope.map(() => '?').join(',');
        conditions.push(`cl.institution_id IN (${placeholders})`);
        params.push(...institutionScope);
      }
    }

    // Specific institution filter
    if (institutionId) {
      conditions.push('cl.institution_id = ?');
      params.push(institutionId);
    }

    // Status filter
    if (status) {
      conditions.push('cl.status = ?');
      params.push(status);
    }

    // Lead by user filter
    if (leadByUserId) {
      conditions.push('cl.lead_by_user_id = ?');
      params.push(leadByUserId);
    }

    // Search filter (name, phone, school origin)
    if (search && search.trim() !== '') {
      const term = `%${search.trim()}%`;
      conditions.push('(cl.full_name LIKE ? OR cl.phone LIKE ? OR cl.school_origin LIKE ?)');
      params.push(term, term, term);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { where, params };
  }

  async findLeads(filters) {
    const { where, params } = this._buildWhereClause(filters);

    let sortByColumn = ALLOWED_SORT_COLUMNS[filters.sortBy] || 'cl.created_at';
    let sortOrder = (filters.sortOrder || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 10));
    const offset = (page - 1) * limit;

    const query = `
      SELECT 
        cl.id,
        cl.institution_id,
        cl.full_name,
        cl.school_origin,
        cl.address,
        cl.phone,
        cl.father_name,
        cl.mother_name,
        cl.interest,
        cl.status,
        cl.lead_source,
        cl.lead_by_user_id,
        cl.created_by_user_id,
        cl.application_id,
        cl.last_contacted_at,
        cl.next_follow_up_at,
        cl.notes,
        cl.created_at,
        cl.updated_at,
        i.name AS institution_name,
        i.code AS institution_code,
        lu.name AS lead_by_name,
        lu.username AS lead_by_username,
        cu.name AS created_by_name,
        app.registration_number AS application_registration_number,
        app.status AS application_status
      FROM crm_leads cl
      JOIN institutions i ON cl.institution_id = i.id
      LEFT JOIN users lu ON cl.lead_by_user_id = lu.id
      LEFT JOIN users cu ON cl.created_by_user_id = cu.id
      LEFT JOIN applications app ON cl.application_id = app.id
      ${where}
      ORDER BY ${sortByColumn} ${sortOrder}, cl.id DESC
      LIMIT ? OFFSET ?
    `;

    const queryParams = [...params, limit, offset];
    const [rows] = await pool.query(query, queryParams);
    return rows;
  }

  async countLeads(filters) {
    const { where, params } = this._buildWhereClause(filters);
    const query = `
      SELECT COUNT(*) AS total
      FROM crm_leads cl
      ${where}
    `;
    const [rows] = await pool.query(query, params);
    return rows[0]?.total || 0;
  }

  async findLeadById(id, connection = null) {
    const db = connection || pool;
    const query = `
      SELECT 
        cl.id,
        cl.institution_id,
        cl.full_name,
        cl.school_origin,
        cl.address,
        cl.phone,
        cl.father_name,
        cl.mother_name,
        cl.interest,
        cl.status,
        cl.lead_source,
        cl.lead_by_user_id,
        cl.created_by_user_id,
        cl.application_id,
        cl.last_contacted_at,
        cl.next_follow_up_at,
        cl.notes,
        cl.created_at,
        cl.updated_at,
        i.name AS institution_name,
        i.code AS institution_code,
        lu.name AS lead_by_name,
        lu.username AS lead_by_username,
        lu.phone AS lead_by_phone,
        cu.name AS created_by_name,
        cu.username AS created_by_username,
        app.registration_number AS application_registration_number,
        app.status AS application_status,
        app.submitted_at AS application_submitted_at
      FROM crm_leads cl
      JOIN institutions i ON cl.institution_id = i.id
      LEFT JOIN users lu ON cl.lead_by_user_id = lu.id
      LEFT JOIN users cu ON cl.created_by_user_id = cu.id
      LEFT JOIN applications app ON cl.application_id = app.id
      WHERE cl.id = ?
    `;
    const [rows] = await db.query(query, [id]);
    return rows[0] || null;
  }

  async createLead(leadData, connection = null) {
    const db = connection || pool;
    const query = `
      INSERT INTO crm_leads (
        institution_id,
        full_name,
        school_origin,
        address,
        phone,
        father_name,
        mother_name,
        interest,
        status,
        lead_source,
        lead_by_user_id,
        created_by_user_id,
        application_id,
        last_contacted_at,
        next_follow_up_at,
        notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      leadData.institution_id,
      leadData.full_name,
      leadData.school_origin || null,
      leadData.address || null,
      leadData.phone || null,
      leadData.father_name || null,
      leadData.mother_name || null,
      leadData.interest || null,
      leadData.status || 'NEW',
      leadData.lead_source || null,
      leadData.lead_by_user_id || null,
      leadData.created_by_user_id,
      leadData.application_id || null,
      leadData.last_contacted_at || null,
      leadData.next_follow_up_at || null,
      leadData.notes || null
    ];

    const [result] = await db.query(query, params);
    return result.insertId;
  }

  async updateLead(id, leadData, connection = null) {
    const db = connection || pool;
    const query = `
      UPDATE crm_leads SET
        institution_id = ?,
        full_name = ?,
        school_origin = ?,
        address = ?,
        phone = ?,
        father_name = ?,
        mother_name = ?,
        interest = ?,
        status = ?,
        lead_source = ?,
        lead_by_user_id = ?,
        application_id = ?,
        last_contacted_at = ?,
        next_follow_up_at = ?,
        notes = ?
      WHERE id = ?
    `;

    const params = [
      leadData.institution_id,
      leadData.full_name,
      leadData.school_origin || null,
      leadData.address || null,
      leadData.phone || null,
      leadData.father_name || null,
      leadData.mother_name || null,
      leadData.interest || null,
      leadData.status,
      leadData.lead_source || null,
      leadData.lead_by_user_id || null,
      leadData.application_id || null,
      leadData.last_contacted_at || null,
      leadData.next_follow_up_at || null,
      leadData.notes || null,
      id
    ];

    await db.query(query, params);
    return true;
  }

  async updateLeadStatus(id, newStatus, connection = null) {
    const db = connection || pool;
    const query = `UPDATE crm_leads SET status = ? WHERE id = ?`;
    await db.query(query, [newStatus, id]);
    return true;
  }

  async deleteLead(id, connection = null) {
    const db = connection || pool;
    const query = `DELETE FROM crm_leads WHERE id = ?`;
    await db.query(query, [id]);
    return true;
  }

  async createStatusHistory(historyData, connection = null) {
    const db = connection || pool;
    const query = `
      INSERT INTO crm_lead_status_histories (
        lead_id,
        previous_status,
        new_status,
        changed_by_user_id,
        notes
      ) VALUES (?, ?, ?, ?, ?)
    `;

    const params = [
      historyData.lead_id,
      historyData.previous_status || null,
      historyData.new_status,
      historyData.changed_by_user_id,
      historyData.notes || null
    ];

    const [result] = await db.query(query, params);
    return result.insertId;
  }

  async findStatusHistoriesByLeadId(leadId, connection = null) {
    const db = connection || pool;
    const query = `
      SELECT 
        h.id,
        h.lead_id,
        h.previous_status,
        h.new_status,
        h.changed_by_user_id,
        h.notes,
        h.created_at,
        u.name AS changed_by_name,
        u.username AS changed_by_username
      FROM crm_lead_status_histories h
      JOIN users u ON h.changed_by_user_id = u.id
      WHERE h.lead_id = ?
      ORDER BY h.created_at DESC, h.id DESC
    `;
    const [rows] = await db.query(query, [leadId]);
    return rows;
  }

  async findEligibleOfficers(institutionScope = null) {
    // Return users that are active and can handle leads
    let query = `
      SELECT DISTINCT u.id, u.name, u.username, u.phone
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      LEFT JOIN user_institutions ui ON u.id = ui.user_id
      WHERE u.is_active = 1
    `;

    const params = [];
    if (institutionScope && Array.isArray(institutionScope) && institutionScope.length > 0) {
      const placeholders = institutionScope.map(() => '?').join(',');
      query += ` AND (r.name = 'SUPER_ADMIN' OR ui.institution_id IN (${placeholders}))`;
      params.push(...institutionScope);
    }

    query += ` ORDER BY u.name ASC`;
    const [rows] = await pool.query(query, params);
    return rows;
  }

  async findInstitutionById(id) {
    const [rows] = await pool.query('SELECT id, code, name, is_active FROM institutions WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async findUserById(id) {
    const [rows] = await pool.query('SELECT id, name, username, is_active FROM users WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async findApplicationById(id) {
    const [rows] = await pool.query('SELECT id, registration_number, applicant_id, status FROM applications WHERE id = ?', [id]);
    return rows[0] || null;
  }
}

module.exports = new CrmLeadRepository();
