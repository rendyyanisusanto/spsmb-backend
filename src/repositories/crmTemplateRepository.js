const pool = require('../config/database');

class CrmTemplateRepository {
  async findTemplates(params = {}) {
    const {
      page = 1,
      limit = 10,
      search,
      institutionId,
      institutionScope, // array of IDs user has access to
      includeGlobal = true,
      eventKey,
      isActive,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = params;

    const offset = (page - 1) * limit;
    const conditions = [];
    const values = [];

    // Search filter
    if (search && search.trim() !== '') {
      conditions.push('(t.name LIKE ? OR t.message_body LIKE ?)');
      const searchPattern = `%${search.trim()}%`;
      values.push(searchPattern, searchPattern);
    }

    // Category / event_key filter
    if (eventKey && eventKey.trim() !== '') {
      conditions.push('t.event_key = ?');
      values.push(eventKey.trim());
    }

    // Active status filter
    if (isActive !== undefined && isActive !== null && isActive !== '') {
      conditions.push('t.is_active = ?');
      values.push(Number(isActive) === 1 ? 1 : 0);
    }

    // Institution filter & Scope
    if (institutionId) {
      if (includeGlobal) {
        conditions.push('(t.institution_id = ? OR t.institution_id IS NULL)');
        values.push(Number(institutionId));
      } else {
        conditions.push('t.institution_id = ?');
        values.push(Number(institutionId));
      }
    } else if (institutionScope && Array.isArray(institutionScope)) {
      if (institutionScope.length === 0) {
        if (includeGlobal) {
          conditions.push('t.institution_id IS NULL');
        } else {
          return [];
        }
      } else {
        const placeholders = institutionScope.map(() => '?').join(', ');
        if (includeGlobal) {
          conditions.push(`(t.institution_id IN (${placeholders}) OR t.institution_id IS NULL)`);
        } else {
          conditions.push(`t.institution_id IN (${placeholders})`);
        }
        values.push(...institutionScope.map(Number));
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const allowedSortColumns = {
      id: 't.id',
      name: 't.name',
      event_key: 't.event_key',
      institution_name: 'i.name',
      is_active: 't.is_active',
      created_at: 't.created_at',
      updated_at: 't.updated_at'
    };

    const sortCol = allowedSortColumns[sortBy] || 't.created_at';
    const sortDir = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const query = `
      SELECT 
        t.id,
        t.institution_id,
        t.name,
        t.event_key,
        t.message_body,
        t.is_active,
        t.created_by_user_id,
        t.updated_by_user_id,
        t.created_at,
        t.updated_at,
        i.name AS institution_name,
        i.code AS institution_code,
        cu.name AS created_by_name,
        uu.name AS updated_by_name
      FROM crm_wa_templates t
      LEFT JOIN institutions i ON t.institution_id = i.id
      LEFT JOIN users cu ON t.created_by_user_id = cu.id
      LEFT JOIN users uu ON t.updated_by_user_id = uu.id
      ${whereClause}
      ORDER BY ${sortCol} ${sortDir}
      LIMIT ? OFFSET ?
    `;

    values.push(Number(limit), Number(offset));

    const [rows] = await pool.query(query, values);
    return rows;
  }

  async countTemplates(params = {}) {
    const {
      search,
      institutionId,
      institutionScope,
      includeGlobal = true,
      eventKey,
      isActive
    } = params;

    const conditions = [];
    const values = [];

    if (search && search.trim() !== '') {
      conditions.push('(t.name LIKE ? OR t.message_body LIKE ?)');
      const searchPattern = `%${search.trim()}%`;
      values.push(searchPattern, searchPattern);
    }

    if (eventKey && eventKey.trim() !== '') {
      conditions.push('t.event_key = ?');
      values.push(eventKey.trim());
    }

    if (isActive !== undefined && isActive !== null && isActive !== '') {
      conditions.push('t.is_active = ?');
      values.push(Number(isActive) === 1 ? 1 : 0);
    }

    if (institutionId) {
      if (includeGlobal) {
        conditions.push('(t.institution_id = ? OR t.institution_id IS NULL)');
        values.push(Number(institutionId));
      } else {
        conditions.push('t.institution_id = ?');
        values.push(Number(institutionId));
      }
    } else if (institutionScope && Array.isArray(institutionScope)) {
      if (institutionScope.length === 0) {
        if (includeGlobal) {
          conditions.push('t.institution_id IS NULL');
        } else {
          return 0;
        }
      } else {
        const placeholders = institutionScope.map(() => '?').join(', ');
        if (includeGlobal) {
          conditions.push(`(t.institution_id IN (${placeholders}) OR t.institution_id IS NULL)`);
        } else {
          conditions.push(`t.institution_id IN (${placeholders})`);
        }
        values.push(...institutionScope.map(Number));
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `
      SELECT COUNT(*) AS total
      FROM crm_wa_templates t
      ${whereClause}
    `;

    const [rows] = await pool.query(query, values);
    return rows[0]?.total || 0;
  }

  async findTemplateById(id, connection = null) {
    const db = connection || pool;
    const query = `
      SELECT 
        t.id,
        t.institution_id,
        t.name,
        t.event_key,
        t.message_body,
        t.is_active,
        t.created_by_user_id,
        t.updated_by_user_id,
        t.created_at,
        t.updated_at,
        i.name AS institution_name,
        i.code AS institution_code,
        cu.name AS created_by_name,
        cu.username AS created_by_username,
        uu.name AS updated_by_name,
        uu.username AS updated_by_username
      FROM crm_wa_templates t
      LEFT JOIN institutions i ON t.institution_id = i.id
      LEFT JOIN users cu ON t.created_by_user_id = cu.id
      LEFT JOIN users uu ON t.updated_by_user_id = uu.id
      WHERE t.id = ?
    `;

    const [rows] = await db.query(query, [id]);
    return rows[0] || null;
  }

  async createTemplate(data, connection = null) {
    const db = connection || pool;
    const query = `
      INSERT INTO crm_wa_templates (
        institution_id,
        name,
        event_key,
        message_body,
        is_active,
        created_by_user_id,
        updated_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      data.institution_id !== undefined && data.institution_id !== null && data.institution_id !== ''
        ? Number(data.institution_id)
        : null,
      data.name,
      data.event_key,
      data.message_body,
      data.is_active !== undefined ? (Number(data.is_active) ? 1 : 0) : 1,
      data.created_by_user_id || null,
      data.updated_by_user_id || data.created_by_user_id || null
    ];

    const [result] = await db.query(query, values);
    return result.insertId;
  }

  async updateTemplate(id, data, connection = null) {
    const db = connection || pool;
    const fields = [];
    const values = [];

    if (data.institution_id !== undefined) {
      fields.push('institution_id = ?');
      values.push(
        data.institution_id !== null && data.institution_id !== ''
          ? Number(data.institution_id)
          : null
      );
    }
    if (data.name !== undefined) {
      fields.push('name = ?');
      values.push(data.name);
    }
    if (data.event_key !== undefined) {
      fields.push('event_key = ?');
      values.push(data.event_key);
    }
    if (data.message_body !== undefined) {
      fields.push('message_body = ?');
      values.push(data.message_body);
    }
    if (data.is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(Number(data.is_active) ? 1 : 0);
    }
    if (data.updated_by_user_id !== undefined) {
      fields.push('updated_by_user_id = ?');
      values.push(data.updated_by_user_id);
    }

    if (fields.length === 0) return 0;

    values.push(id);
    const query = `UPDATE crm_wa_templates SET ${fields.join(', ')} WHERE id = ?`;
    const [result] = await db.query(query, values);
    return result.affectedRows;
  }

  async deleteTemplate(id, connection = null) {
    const db = connection || pool;
    const [result] = await db.query('DELETE FROM crm_wa_templates WHERE id = ?', [id]);
    return result.affectedRows;
  }
}

module.exports = new CrmTemplateRepository();
