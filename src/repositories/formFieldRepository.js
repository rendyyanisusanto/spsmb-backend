
const pool = require('../config/database');

class FormFieldRepository {
  async findAll({ targetId, sectionId, inputType, search, status, targetIds }) {
    let q = `
      SELECT f.*, 
             s.code as section_code, s.name as section_name,
             t.code as target_code, t.name as target_name, t.target_type, t.institution_id
      FROM form_fields f
      LEFT JOIN form_sections s ON f.form_section_id = s.id
      LEFT JOIN form_targets t ON f.form_target_id = t.id
      WHERE 1=1
    `;
    const params = [];
    
    if (targetIds && targetIds.length > 0) {
      q += ' AND f.form_target_id IN (?)';
      params.push(targetIds);
    }
    if (targetId) {
      q += ' AND f.form_target_id = ?';
      params.push(targetId);
    }
    if (sectionId) {
      q += ' AND f.form_section_id = ?';
      params.push(sectionId);
    }
    if (inputType) {
      q += ' AND f.input_type = ?';
      params.push(inputType);
    }
    if (status) {
      q += ' AND f.is_active = ?';
      params.push(status === 'ACTIVE' ? 1 : 0);
    }
    if (search) {
      q += ' AND (f.label LIKE ? OR f.field_code LIKE ?)';
      params.push('%' + search + '%', '%' + search + '%');
    }
    
    q += ' ORDER BY f.sort_order ASC, f.id ASC';
    
    const [rows] = await pool.query(q, params);
    
    if (rows.length === 0) return [];
    
    // get options for all fields
    const fieldIds = rows.map(r => r.id);
    const [options] = await pool.query('SELECT * FROM form_field_options WHERE form_field_id IN (?) ORDER BY sort_order ASC, id ASC', [fieldIds]);
    
    // map options to fields
    for (const row of rows) {
      row.options = options.filter(o => o.form_field_id === row.id);
    }
    
    return rows;
  }

  async findById(id) {
    const [rows] = await pool.query(`
      SELECT f.*, 
             s.code as section_code, s.name as section_name,
             t.code as target_code, t.name as target_name, t.target_type, t.institution_id
      FROM form_fields f
      LEFT JOIN form_sections s ON f.form_section_id = s.id
      LEFT JOIN form_targets t ON f.form_target_id = t.id
      WHERE f.id = ?
    `, [id]);
    
    if (rows.length === 0) return null;
    
    const row = rows[0];
    const [options] = await pool.query('SELECT * FROM form_field_options WHERE form_field_id = ? ORDER BY sort_order ASC, id ASC', [id]);
    row.options = options;
    return row;
  }

  async checkDuplicateCode(targetId, fieldCode, ignoreId = null) {
    let q = 'SELECT id FROM form_fields WHERE form_target_id = ? AND field_code = ?';
    let params = [targetId, fieldCode];
    if (ignoreId) {
      q += ' AND id != ?';
      params.push(ignoreId);
    }
    const [rows] = await pool.query(q, params);
    return rows.length > 0;
  }
}
module.exports = new FormFieldRepository();
