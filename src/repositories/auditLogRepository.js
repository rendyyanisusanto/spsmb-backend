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
  async findAll(filters, offset = 0, limit = 20) {
    let query = `
      SELECT 
        al.id,
        al.user_id,
        u.name as user_name,
        u.username as user_username,
        al.action,
        al.entity_type as entityType,
        al.entity_id as entityId,
        al.description,
        al.ip_address as ipAddress,
        al.user_agent as userAgent,
        al.created_at as createdAt
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
    `;
    const params = [];
    const whereConditions = [];

    if (filters.action) {
      whereConditions.push('al.action = ?');
      params.push(filters.action);
    }
    if (filters.entityType) {
      whereConditions.push('al.entity_type = ?');
      params.push(filters.entityType);
    }
    if (filters.userId) {
      whereConditions.push('al.user_id = ?');
      params.push(filters.userId);
    }
    if (filters.dateFrom) {
      whereConditions.push('al.created_at >= ?');
      params.push(filters.dateFrom + ' 00:00:00');
    }
    if (filters.dateTo) {
      whereConditions.push('al.created_at <= ?');
      params.push(filters.dateTo + ' 23:59:59');
    }
    if (filters.search) {
      whereConditions.push('(al.description LIKE ? OR u.name LIKE ? OR u.username LIKE ?)');
      const searchParam = `%${filters.search}%`;
      params.push(searchParam, searchParam, searchParam);
    }
    if (filters.scopeQuery) {
      whereConditions.push(`(${filters.scopeQuery})`);
      if (filters.scopeParams) {
        params.push(...filters.scopeParams);
      }
    }

    if (whereConditions.length > 0) {
      query += ` WHERE ` + whereConditions.join(' AND ');
    }

    const allowedSortColumns = {
      createdAt: 'al.created_at',
      action: 'al.action',
      entityType: 'al.entity_type',
      userName: 'u.name'
    };

    const sortBy = allowedSortColumns[filters.sortBy] || 'al.created_at';
    const sortOrder = (filters.sortOrder === 'ASC' || filters.sortOrder === 'DESC') ? filters.sortOrder : 'DESC';

    query += ` ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const [rows] = await pool.query(query, params);
    return rows;
  }

  async count(filters) {
    let query = `
      SELECT COUNT(*) as total
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
    `;
    const params = [];
    const whereConditions = [];

    if (filters.action) {
      whereConditions.push('al.action = ?');
      params.push(filters.action);
    }
    if (filters.entityType) {
      whereConditions.push('al.entity_type = ?');
      params.push(filters.entityType);
    }
    if (filters.userId) {
      whereConditions.push('al.user_id = ?');
      params.push(filters.userId);
    }
    if (filters.dateFrom) {
      whereConditions.push('al.created_at >= ?');
      params.push(filters.dateFrom + ' 00:00:00');
    }
    if (filters.dateTo) {
      whereConditions.push('al.created_at <= ?');
      params.push(filters.dateTo + ' 23:59:59');
    }
    if (filters.search) {
      whereConditions.push('(al.description LIKE ? OR u.name LIKE ? OR u.username LIKE ?)');
      const searchParam = `%${filters.search}%`;
      params.push(searchParam, searchParam, searchParam);
    }
    if (filters.scopeQuery) {
      whereConditions.push(`(${filters.scopeQuery})`);
      if (filters.scopeParams) {
        params.push(...filters.scopeParams);
      }
    }

    if (whereConditions.length > 0) {
      query += ` WHERE ` + whereConditions.join(' AND ');
    }

    const [rows] = await pool.query(query, params);
    return rows[0].total;
  }

  async findById(id) {
    const query = `
      SELECT 
        al.id,
        al.user_id,
        u.name as user_name,
        u.username as user_username,
        al.action,
        al.entity_type as entityType,
        al.entity_id as entityId,
        al.description,
        al.ip_address as ipAddress,
        al.user_agent as userAgent,
        al.created_at as createdAt
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE al.id = ?
    `;
    const [rows] = await pool.query(query, [id]);
    return rows[0] || null;
  }
}

module.exports = new AuditLogRepository();
