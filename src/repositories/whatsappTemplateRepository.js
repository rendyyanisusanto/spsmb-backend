
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

    query += ' ORDER BY w.event_code ASC, w.scope ASC, i.name ASC';
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

  async findByCode(code) {
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
      (code, name, event_code, scope, institution_id, message, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const [result] = await pool.query(query, [
      data.code, data.name, data.event_code, data.scope, data.institution_id || null, data.message, data.is_active
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
