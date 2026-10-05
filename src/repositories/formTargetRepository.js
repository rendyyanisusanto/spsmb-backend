
const pool = require('../config/database');

class FormTargetRepository {
  async findAll({ targetType, institutionId, status, search }) {
    let q = 'SELECT t.*, i.name as institution_name, i.code as institution_code, i.institution_type FROM form_targets t LEFT JOIN institutions i ON t.institution_id = i.id WHERE 1=1';
    const params = [];
    
    if (targetType) {
      q += ' AND t.target_type = ?';
      params.push(targetType);
    }
    if (institutionId !== undefined) {
      if (institutionId === null) {
        q += ' AND t.institution_id IS NULL';
      } else {
        q += ' AND t.institution_id = ?';
        params.push(institutionId);
      }
    }
    if (status) {
      q += ' AND t.is_active = ?';
      params.push(status === 'ACTIVE' ? 1 : 0);
    }
    if (search) {
      q += ' AND t.name LIKE ?';
      params.push('%' + search + '%');
    }
    
    q += ' ORDER BY CASE WHEN t.target_type = "COMMON" THEN 1 WHEN t.target_type = "PONDOK_COMMON" THEN 2 ELSE 3 END, i.name ASC';
    
    const [rows] = await pool.query(q, params);
    return rows;
  }

  async findById(id) {
    const [rows] = await pool.query('SELECT t.*, i.name as institution_name, i.code as institution_code, i.institution_type FROM form_targets t LEFT JOIN institutions i ON t.institution_id = i.id WHERE t.id = ?', [id]);
    return rows[0] || null;
  }

  async findByCode(code) {
    const [rows] = await pool.query('SELECT * FROM form_targets WHERE code = ?', [code]);
    return rows[0] || null;
  }

  async create(data) {
    const [res] = await pool.query('INSERT INTO form_targets SET ?', [data]);
    return res.insertId;
  }

  async update(id, data) {
    await pool.query('UPDATE form_targets SET ? WHERE id = ?', [data, id]);
  }
}
module.exports = new FormTargetRepository();
