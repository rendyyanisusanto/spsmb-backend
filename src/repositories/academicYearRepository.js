
const pool = require('../config/database');

class AcademicYearRepository {
  async findAll({ search, status, limit, offset }) {
    let query = 'SELECT * FROM academic_years WHERE 1=1';
    const params = [];
    if (search) {
      query += ' AND name LIKE ?';
      params.push('%' + search + '%');
    }
    if (status) {
      query += ' AND is_active = ?';
      params.push(status === 'ACTIVE' ? 1 : 0);
    }
    query += ' ORDER BY start_year DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const [rows] = await pool.query(query, params);
    
    let countQuery = 'SELECT COUNT(*) as total FROM academic_years WHERE 1=1';
    const countParams = [];
    if (search) { countQuery += ' AND name LIKE ?'; countParams.push('%' + search + '%'); }
    if (status) { countQuery += ' AND is_active = ?'; countParams.push(status === 'ACTIVE' ? 1 : 0); }
    const [[{ total }]] = await pool.query(countQuery, countParams);
    
    return { rows, total };
  }

  async findById(id) {
    const [rows] = await pool.query('SELECT * FROM academic_years WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async findActive() {
    const [rows] = await pool.query('SELECT * FROM academic_years WHERE is_active = 1 LIMIT 1');
    return rows[0] || null;
  }

  async create(data) {
    const [result] = await pool.query('INSERT INTO academic_years SET ?', [data]);
    return result.insertId;
  }

  async update(id, data) {
    await pool.query('UPDATE academic_years SET ? WHERE id = ?', [data, id]);
  }

  async deactivateAllActive() {
    await pool.query('UPDATE academic_years SET is_active = 0 WHERE is_active = 1');
  }

  async deactivateAllActiveExcept(id) {
    await pool.query('UPDATE academic_years SET is_active = 0 WHERE is_active = 1 AND id != ?', [id]);
  }
}
module.exports = new AcademicYearRepository();
