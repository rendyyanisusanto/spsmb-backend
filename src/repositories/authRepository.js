const pool = require('../config/database');

const findUserByUsername = async (username) => {
  const query = `
    SELECT id, name, username, email, phone, password_hash, is_active, last_login_at
    FROM users
    WHERE username = ?
  `;
  const [rows] = await pool.query(query, [username]);
  return rows[0] || null;
};

const findUserById = async (id) => {
  const query = `
    SELECT id, name, username, email, phone, password_hash, is_active, last_login_at
    FROM users
    WHERE id = ?
  `;
  const [rows] = await pool.query(query, [id]);
  return rows[0] || null;
};

const findUserRoles = async (userId) => {
  const query = `
    SELECT r.name
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = ?
  `;
  const [rows] = await pool.query(query, [userId]);
  return rows.map(r => r.name);
};

const findUserInstitutions = async (userId) => {
  const query = `
    SELECT i.id, i.name
    FROM user_institutions ui
    JOIN institutions i ON ui.institution_id = i.id
    WHERE ui.user_id = ?
  `;
  const [rows] = await pool.query(query, [userId]);
  return rows;
};

const updateLastLogin = async (userId) => {
  const query = `
    UPDATE users
    SET last_login_at = NOW()
    WHERE id = ?
  `;
  await pool.query(query, [userId]);
};

module.exports = {
  findUserByUsername,
  findUserById,
  findUserRoles,
  findUserInstitutions,
  updateLastLogin
};
