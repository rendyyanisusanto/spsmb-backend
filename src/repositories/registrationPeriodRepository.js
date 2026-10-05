
const pool = require('../config/database');

class RegistrationPeriodRepository {
  async findAll({ search, status, limit, offset }) {
    let query = `
      SELECT p.*, a.name as academic_year_name, a.id as academic_year_id 
      FROM admission_periods p
      LEFT JOIN academic_years a ON p.academic_year = a.id
      WHERE 1=1
    `;
    const params = [];
    if (search) {
      query += ' AND (p.name LIKE ? OR a.name LIKE ?)';
      params.push('%' + search + '%', '%' + search + '%');
    }
    if (status) {
      query += ' AND p.is_active = ?';
      params.push(status === 'ACTIVE' ? 1 : 0);
    }
    query += ' ORDER BY p.id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const [rows] = await pool.query(query, params);
    
    let countQuery = `
      SELECT COUNT(*) as total FROM admission_periods p 
      LEFT JOIN academic_years a ON p.academic_year = a.id 
      WHERE 1=1
    `;
    const countParams = [];
    if (search) { countQuery += ' AND (p.name LIKE ? OR a.name LIKE ?)'; countParams.push('%' + search + '%', '%' + search + '%'); }
    if (status) { countQuery += ' AND p.is_active = ?'; countParams.push(status === 'ACTIVE' ? 1 : 0); }
    const [[{ total }]] = await pool.query(countQuery, countParams);
    
    return { rows, total };
  }

  async findById(id) {
    const [rows] = await pool.query(`
      SELECT p.*, a.name as academic_year_name, a.id as academic_year_id 
      FROM admission_periods p
      LEFT JOIN academic_years a ON p.academic_year = a.id
      WHERE p.id = ?`, [id]);
    return rows[0] || null;
  }
}
module.exports = new RegistrationPeriodRepository();
