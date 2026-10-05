const pool = require('../config/database');

const findAll = async () => {
  const [rows] = await pool.query('SELECT setting_key, setting_value, setting_type FROM settings');
  return rows;
};

const findByKey = async (key) => {
  const [rows] = await pool.query('SELECT * FROM settings WHERE setting_key = ?', [key]);
  return rows[0];
};

const saveAll = async (connection, settingsArray) => {
  // settingsArray = [{ key, value, type }]
  if (settingsArray.length === 0) return;
  const values = settingsArray.map(s => [s.key, s.value, s.type || 'string']);
  // Using INSERT ... ON DUPLICATE KEY UPDATE
  const query = `
    INSERT INTO settings (setting_key, setting_value, setting_type)
    VALUES ?
    ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), setting_type = VALUES(setting_type)
  `;
  await connection.query(query, [values]);
};

module.exports = {
  findAll,
  findByKey,
  saveAll
};
