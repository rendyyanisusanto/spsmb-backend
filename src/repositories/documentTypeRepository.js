
const pool = require('../config/database');

class DocumentTypeRepository {
  async findAll(filters) {
    let query = 'SELECT * FROM document_types WHERE 1=1';
    const params = [];

    if (filters.status !== undefined) {
      query += ' AND is_active = ?';
      params.push(filters.status);
    }
    if (filters.search) {
      query += ' AND (name LIKE ? OR code LIKE ?)';
      params.push('%' + filters.search + '%', '%' + filters.search + '%');
    }

    query += ' ORDER BY name ASC';
    const [rows] = await pool.query(query, params);
    return rows;
  }

  async findById(id) {
    const [rows] = await pool.query('SELECT * FROM document_types WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async findByCode(code) {
    const [rows] = await pool.query('SELECT * FROM document_types WHERE code = ?', [code]);
    return rows[0] || null;
  }

  async create(data) {
    const query = `
      INSERT INTO document_types 
      (code, name, description, allowed_extensions, max_size_mb, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const [result] = await pool.query(query, [
      data.code, data.name, data.description, data.allowed_extensions, data.max_size_mb, data.is_active
    ]);
    return result.insertId;
  }

  async update(id, data) {
    const keys = Object.keys(data);
    if (keys.length === 0) return;
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => data[k]);
    values.push(id);

    await pool.query(`UPDATE document_types SET ${setClause} WHERE id = ?`, values);
  }

  async checkUsage(id) {
    const [rows] = await pool.query('SELECT COUNT(*) as count FROM applicant_documents WHERE document_type_id = ?', [id]);
    return rows[0].count > 0;
  }
  
  async checkRequirementUsage(id) {
    const [rows] = await pool.query('SELECT COUNT(*) as count FROM document_requirements WHERE document_type_id = ?', [id]);
    return rows[0].count > 0;
  }

  async remove(id) {
    await pool.query('DELETE FROM document_types WHERE id = ?', [id]);
  }
}

module.exports = new DocumentTypeRepository();
