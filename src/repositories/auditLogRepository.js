const pool = require('../config/database');

class AuditLogRepository {
  async create(logData, connection = pool) {
    const [result] = await connection.query(
      `INSERT INTO audit_logs 
        (user_id, action, entity_type, entity_id, description, ip_address, user_agent, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        logData.user_id,
        logData.action,
        logData.entity_type,
        logData.entity_id,
        logData.description,
        logData.ip_address,
        logData.user_agent
      ]
    );
    return result.insertId;
  }

  async findByEntity(entityType, entityId, action = null) {
    let query = `
      SELECT 
        al.id, 
        al.action,
        al.description, 
        al.created_at as createdAt,
        u.id as user_id,
        u.name as user_name
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.entity_type = ? AND al.entity_id = ?
    `;
    const params = [entityType, entityId];

    if (action) {
      query += ` AND al.action = ?`;
      params.push(action);
    }

    query += ` ORDER BY al.created_at DESC`;

    const [rows] = await pool.query(query, params);
    return rows;
  }
}

module.exports = new AuditLogRepository();
