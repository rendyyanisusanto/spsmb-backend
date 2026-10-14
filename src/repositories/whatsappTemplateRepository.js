
const pool = require('../config/database');

class WhatsappTemplateRepository {
  async findAll(filters) {
    let query = `
      SELECT w.*, 
             i.code as institution_code, i.name as institution_name
      FROM wa_templates w
      LEFT JOIN institutions i ON w.institution_id = i.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.event) {
      query += ' AND w.event_code = ?';
      params.push(filters.event);
    }
    if (filters.scope) {
      query += ' AND w.scope = ?';
      params.push(filters.scope);
    }
    if (filters.sectionType) {
      query += ' AND w.section_type = ?';
      params.push(filters.sectionType);
    }
    if (filters.institutionId) {
      query += ' AND w.institution_id = ?';
      params.push(filters.institutionId);
    }
    if (filters.status !== undefined) {
      query += ' AND w.is_active = ?';
      params.push(filters.status);
    }
    if (filters.search) {
      query += ' AND (w.name LIKE ? OR w.code LIKE ?)';
      params.push('%' + filters.search + '%', '%' + filters.search + '%');
    }

    query += ' ORDER BY w.event_code ASC, w.section_type ASC, w.scope ASC, i.name ASC';
    const [rows] = await pool.query(query, params);
    return rows;
  }

  async findById(id) {
    const query = `
      SELECT w.*, 
             i.code as institution_code, i.name as institution_name
      FROM wa_templates w
      LEFT JOIN institutions i ON w.institution_id = i.id
      WHERE w.id = ?
    `;
    const [rows] = await pool.query(query, [id]);
    return rows[0] || null;
  }

  async findByCode(code, scope = null, institutionId = null) {
    if (scope === 'INSTITUTION' && institutionId) {
      const [rows] = await pool.query(
        'SELECT * FROM wa_templates WHERE code = ? AND scope = "INSTITUTION" AND institution_id = ?',
        [code, institutionId]
      );
      return rows[0] || null;
    }
    if (scope === 'GLOBAL') {
      const [rows] = await pool.query(
        'SELECT * FROM wa_templates WHERE code = ? AND scope = "GLOBAL"',
        [code]
      );
      return rows[0] || null;
    }
    const [rows] = await pool.query('SELECT * FROM wa_templates WHERE code = ?', [code]);
    return rows[0] || null;
  }

  async getActiveTemplate(eventCode, scope, institutionId) {
    let query = 'SELECT * FROM wa_templates WHERE event_code = ? AND scope = ? AND is_active = 1';
    const params = [eventCode, scope];
    if (scope === 'INSTITUTION' && institutionId) {
      query += ' AND institution_id = ?';
      params.push(institutionId);
    }
    const [rows] = await pool.query(query, params);
    return rows[0] || null;
  }

  async create(data) {
    const query = `
      INSERT INTO wa_templates 
      (code, name, event_code, scope, section_type, institution_id, message, is_active, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const [result] = await pool.query(query, [
      data.code,
      data.name,
      data.event_code,
      data.scope,
      data.section_type || (data.scope === 'GLOBAL' ? 'GLOBAL' : 'FORMAL'),
      data.institution_id || null,
      data.message,
      data.is_active,
      data.created_by || null,
      data.updated_by || null
    ]);
    return result.insertId;
  }

  async update(id, data) {
    const keys = Object.keys(data);
    if (keys.length === 0) return;
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => data[k]);
    values.push(id);

    await pool.query(`UPDATE wa_templates SET ${setClause} WHERE id = ?`, values);
  }

  async checkUsage(id) {
    const [rows] = await pool.query('SELECT COUNT(*) as count FROM wa_logs WHERE template_id = ?', [id]);
    return rows[0].count > 0;
  }
}

module.exports = new WhatsappTemplateRepository();
