
const pool = require('../config/database');

class FormSectionRepository {
  async findAll({ search, status }) {
    let q = 'SELECT * FROM form_sections WHERE 1=1';
    const params = [];
    if (status) {
      q += ' AND is_active = ?';
      params.push(status === 'ACTIVE' ? 1 : 0);
    }
    if (search) {
      q += ' AND name LIKE ?';
      params.push('%' + search + '%');
    }
    q += ' ORDER BY sort_order ASC, id ASC';
    const [rows] = await pool.query(q, params);
    return rows;
  }
  
  async findById(id) {
    const [rows] = await pool.query('SELECT * FROM form_sections WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async findByCode(code) {
    const [rows] = await pool.query('SELECT * FROM form_sections WHERE code = ?', [code]);
    return rows[0] || null;
  }

  async create(data) {
    const [res] = await pool.query('INSERT INTO form_sections SET ?', [data]);
    return res.insertId;
  }

  async update(id, data) {
    await pool.query('UPDATE form_sections SET ? WHERE id = ?', [data, id]);
  }

  async checkHasFields(id) {
    const [rows] = await pool.query('SELECT id FROM form_fields WHERE form_section_id = ? LIMIT 1', [id]);
    return rows.length > 0;
  }

  async delete(id) {
    await pool.query('DELETE FROM form_sections WHERE id = ?', [id]);
  }
}
module.exports = new FormSectionRepository();
