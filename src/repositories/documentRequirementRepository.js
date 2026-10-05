
const pool = require('../config/database');

class DocumentRequirementRepository {
  async findAll(filters) {
    let query = `
      SELECT r.*, 
             t.code as target_code, t.name as target_name, t.target_type, t.institution_id,
             i.code as institution_code, i.name as institution_name, i.institution_type,
             d.code as doc_code, d.name as doc_name, d.description, d.allowed_extensions, d.max_size_mb, d.is_active as doc_is_active
      FROM document_requirements r
      JOIN form_targets t ON r.form_target_id = t.id
      LEFT JOIN institutions i ON t.institution_id = i.id
      JOIN document_types d ON r.document_type_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.targetId) {
      query += ' AND r.form_target_id = ?';
      params.push(filters.targetId);
    }

    query += ' ORDER BY r.form_target_id ASC, r.sort_order ASC';
    const [rows] = await pool.query(query, params);
    return rows;
  }

  async findById(id) {
    const query = `
      SELECT r.*, 
             t.code as target_code, t.name as target_name, t.target_type, t.institution_id,
             d.code as doc_code, d.name as doc_name, d.description, d.allowed_extensions, d.max_size_mb, d.is_active as doc_is_active
      FROM document_requirements r
      JOIN form_targets t ON r.form_target_id = t.id
      JOIN document_types d ON r.document_type_id = d.id
      WHERE r.id = ?
    `;
    const [rows] = await pool.query(query, [id]);
    return rows[0] || null;
  }
  
  async findByTargetAndDoc(targetId, docId) {
    const [rows] = await pool.query('SELECT * FROM document_requirements WHERE form_target_id = ? AND document_type_id = ?', [targetId, docId]);
    return rows[0] || null;
  }

  async create(data) {
    const query = `
      INSERT INTO document_requirements 
      (form_target_id, document_type_id, is_required, sort_order)
      VALUES (?, ?, ?, ?)
    `;
    const [result] = await pool.query(query, [
      data.form_target_id, data.document_type_id, data.is_required, data.sort_order
    ]);
    return result.insertId;
  }

  async update(id, data) {
    const keys = Object.keys(data);
    if (keys.length === 0) return;
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => data[k]);
    values.push(id);

    await pool.query(`UPDATE document_requirements SET ${setClause} WHERE id = ?`, values);
  }

  async remove(id) {
    await pool.query('DELETE FROM document_requirements WHERE id = ?', [id]);
  }
}

module.exports = new DocumentRequirementRepository();
