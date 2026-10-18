const pool = require('../config/database');

const findInstitutions = async (params) => {
  let query = 'SELECT * FROM institutions';
  const conditions = [];
  const queryParams = [];

  if (params.type) {
    conditions.push('institution_type = ?');
    queryParams.push(params.type);
  }
  
  if (params.status) {
    const isActive = params.status === 'ACTIVE' ? 1 : 0;
    conditions.push('is_active = ?');
    queryParams.push(isActive);
  }

  // If ADMIN_SPSMB, limit to allowed institution IDs
  if (params.allowedInstitutionIds) {
    if (params.allowedInstitutionIds.length === 0) {
      return []; // Return empty if no access
    }
    conditions.push(`id IN (?)`);
    queryParams.push(params.allowedInstitutionIds);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at ASC';

  const [rows] = await pool.query(query, queryParams);
  return rows.map(r => ({ ...r, is_active: !!r.is_active }));
};

const findById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM institutions WHERE id = ?', [id]);
  if (!rows[0]) return null;
  rows[0].is_active = !!rows[0].is_active;
  return rows[0];
};

const findByCode = async (code) => {
  const [rows] = await pool.query('SELECT * FROM institutions WHERE code = ?', [code]);
  return rows[0];
};

const createInstitution = async (data) => {
  const isActive = data.is_active === true || data.is_active === 'true' || data.is_active === 1 || data.is_active === '1';
  const [result] = await pool.query(`
    INSERT INTO institutions (code, name, institution_type, gender_scope, logo_url, kop_url, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    data.code, 
    data.name, 
    data.institution_type, 
    data.gender_scope || 'ALL', 
    data.logo_url || null, 
    data.kop_url || null, 
    isActive ? 1 : 0
  ]);
  return result.insertId;
};

const updateInstitution = async (id, data) => {
  const fields = ['code = ?', 'name = ?', 'institution_type = ?', 'gender_scope = ?'];
  const values = [data.code, data.name, data.institution_type, data.gender_scope];

  if (data.logo_url !== undefined) {
    fields.push('logo_url = ?');
    values.push(data.logo_url);
  }
  if (data.kop_url !== undefined) {
    fields.push('kop_url = ?');
    values.push(data.kop_url);
  }
  if (data.is_active !== undefined) {
    const isActive = data.is_active === true || data.is_active === 'true' || data.is_active === 1 || data.is_active === '1';
    fields.push('is_active = ?');
    values.push(isActive ? 1 : 0);
  }

  values.push(id);
  await pool.query(`UPDATE institutions SET ${fields.join(', ')} WHERE id = ?`, values);
};

const updateStatus = async (id, isActive) => {
  await pool.query('UPDATE institutions SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
};

module.exports = {
  findInstitutions,
  findById,
  findByCode,
  createInstitution,
  updateInstitution,
  updateStatus
};
