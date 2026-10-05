const pool = require('../config/database');

const findUsers = async ({ search, role, status, institutionId, page, limit }) => {
  let query = `
    SELECT u.id, u.name, u.username, u.email, u.phone, u.is_active as isActive, u.last_login_at as lastLoginAt,
           (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', r.id, 'name', r.name)) 
            FROM user_roles ur 
            JOIN roles r ON ur.role_id = r.id 
            WHERE ur.user_id = u.id) as roles,
           (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', i.id, 'name', i.name)) 
            FROM user_institutions ui 
            JOIN institutions i ON ui.institution_id = i.id 
            WHERE ui.user_id = u.id) as institutions
    FROM users u
  `;
  
  const conditions = [];
  const params = [];
  
  if (search) {
    conditions.push(`(u.name LIKE ? OR u.username LIKE ? OR u.email LIKE ?)`);
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  
  if (role) {
    conditions.push(`EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = u.id AND r.name = ?)`);
    params.push(role);
  }
  
  if (status) {
    const isActive = status === 'ACTIVE' ? 1 : 0;
    conditions.push(`u.is_active = ?`);
    params.push(isActive);
  }
  
  if (institutionId) {
    conditions.push(`EXISTS (SELECT 1 FROM user_institutions ui WHERE ui.user_id = u.id AND ui.institution_id = ?)`);
    params.push(institutionId);
  }
  
  if (conditions.length > 0) {
    query += ` WHERE ` + conditions.join(' AND ');
  }
  
  const countQuery = `SELECT COUNT(*) as total FROM users u ` + (conditions.length > 0 ? `WHERE ` + conditions.join(' AND ') : '');
  
  query += ` ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
  const offset = (page - 1) * limit;
  
  const [countResult] = await pool.query(countQuery, params);
  const total = countResult[0].total;
  
  params.push(Number(limit), Number(offset));
  const [rows] = await pool.query(query, params);
  
  // Clean null outputs from JSON_ARRAYAGG for empty relations
  const cleanRows = rows.map(r => ({
    ...r,
    roles: r.roles && r.roles[0]?.id ? r.roles : [],
    institutions: r.institutions && r.institutions[0]?.id ? r.institutions : [],
    isActive: !!r.isActive
  }));
  
  return { data: cleanRows, total };
};

const findById = async (id) => {
  const query = `
    SELECT u.id, u.name, u.username, u.email, u.phone, u.is_active as isActive, u.last_login_at as lastLoginAt,
           (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', r.id, 'name', r.name)) 
            FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = u.id) as roles,
           (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', i.id, 'name', i.name)) 
            FROM user_institutions ui JOIN institutions i ON ui.institution_id = i.id WHERE ui.user_id = u.id) as institutions
    FROM users u
    WHERE u.id = ?
  `;
  const [rows] = await pool.query(query, [id]);
  if (!rows[0]) return null;
  const user = rows[0];
  user.roles = user.roles && user.roles[0]?.id ? user.roles : [];
  user.institutions = user.institutions && user.institutions[0]?.id ? user.institutions : [];
  user.isActive = !!user.isActive;
  return user;
};

const findByUsername = async (username) => {
  const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
  return rows[0];
};

const findByEmail = async (email) => {
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  return rows[0];
};

const createUser = async (connection, userData) => {
  const [result] = await connection.query(`
    INSERT INTO users (name, username, email, phone, password_hash, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [userData.name, userData.username, userData.email || null, userData.phone || null, userData.password_hash, userData.is_active ? 1 : 0]);
  return result.insertId;
};

const addRoles = async (connection, userId, roleIds) => {
  if (!roleIds || roleIds.length === 0) return;
  const values = roleIds.map(id => [userId, id]);
  await connection.query('INSERT INTO user_roles (user_id, role_id) VALUES ?', [values]);
};

const addInstitutions = async (connection, userId, institutionIds) => {
  if (!institutionIds || institutionIds.length === 0) return;
  const values = institutionIds.map(id => [userId, id]);
  await connection.query('INSERT INTO user_institutions (user_id, institution_id) VALUES ?', [values]);
};

const updateUser = async (connection, id, userData) => {
  await connection.query(`
    UPDATE users SET name=?, username=?, email=?, phone=?, is_active=? WHERE id=?
  `, [userData.name, userData.username, userData.email || null, userData.phone || null, userData.is_active ? 1 : 0, id]);
};

const updateStatus = async (id, isActive) => {
  await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
};

const updatePassword = async (id, passwordHash) => {
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id]);
};

const clearRoles = async (connection, userId) => {
  await connection.query('DELETE FROM user_roles WHERE user_id = ?', [userId]);
};

const clearInstitutions = async (connection, userId) => {
  await connection.query('DELETE FROM user_institutions WHERE user_id = ?', [userId]);
};

const countSuperAdmins = async () => {
  const [rows] = await pool.query(`
    SELECT COUNT(DISTINCT u.id) as total 
    FROM users u 
    JOIN user_roles ur ON u.id = ur.user_id 
    JOIN roles r ON ur.role_id = r.id 
    WHERE r.name = 'SUPER_ADMIN' AND u.is_active = 1
  `);
  return rows[0].total;
};

const getRoles = async () => {
  const [rows] = await pool.query('SELECT id, name FROM roles');
  return rows;
};

module.exports = {
  findUsers,
  findById,
  findByUsername,
  findByEmail,
  createUser,
  addRoles,
  addInstitutions,
  updateUser,
  updateStatus,
  updatePassword,
  clearRoles,
  clearInstitutions,
  countSuperAdmins,
  getRoles
};
