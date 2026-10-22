const pool = require('../config/database');

class FaqRepository {
  async getActiveGlobalFaqs(search = '') {
    let query = `
      SELECT id, scope, category, question, answer, order_index, updated_at
      FROM faqs
      WHERE scope = 'GLOBAL' AND is_active = 1
    `;
    const params = [];
    if (search && search.trim()) {
      query += ` AND (question LIKE ? OR answer LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }
    query += ` ORDER BY order_index ASC, id ASC`;
    const [rows] = await pool.query(query, params);
    return rows;
  }

  async getActiveInstitutionFaqs(institutionId) {
    const [rows] = await pool.query(`
      SELECT id, scope, institution_id, category, question, answer, order_index, updated_at
      FROM faqs
      WHERE scope = 'INSTITUTION' AND institution_id = ? AND is_active = 1
      ORDER BY order_index ASC, id ASC
    `, [institutionId]);
    return rows;
  }

  async getAllFaqsAdmin(scope = null, institutionId = null, search = '') {
    let query = `
      SELECT f.*, i.name as institution_name, i.code as institution_code
      FROM faqs f
      LEFT JOIN institutions i ON f.institution_id = i.id
      WHERE 1=1
    `;
    const params = [];

    if (scope) {
      query += ` AND f.scope = ?`;
      params.push(scope);
    }

    if (institutionId) {
      query += ` AND f.institution_id = ?`;
      params.push(institutionId);
    }

    if (search && search.trim()) {
      query += ` AND (f.question LIKE ? OR f.answer LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }

    query += ` ORDER BY f.scope ASC, f.institution_id ASC, f.order_index ASC, f.id DESC`;
    const [rows] = await pool.query(query, params);
    return rows;
  }

  async findById(id) {
    const [rows] = await pool.query(`
      SELECT f.*, i.name as institution_name
      FROM faqs f
      LEFT JOIN institutions i ON f.institution_id = i.id
      WHERE f.id = ?
    `, [id]);
    return rows[0] || null;
  }

  async create(data) {
    const [result] = await pool.query(`
      INSERT INTO faqs (scope, institution_id, category, question, answer, order_index, is_active, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      data.scope || 'GLOBAL',
      data.scope === 'GLOBAL' ? null : (data.institution_id || null),
      data.category || 'UMUM',
      data.question,
      data.answer,
      data.order_index || 1,
      data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
      data.created_by || null
    ]);
    return result.insertId;
  }

  async update(id, data) {
    const updates = [];
    const params = [];

    if (data.category !== undefined) {
      updates.push('category = ?');
      params.push(data.category);
    }
    if (data.question !== undefined) {
      updates.push('question = ?');
      params.push(data.question);
    }
    if (data.answer !== undefined) {
      updates.push('answer = ?');
      params.push(data.answer);
    }
    if (data.order_index !== undefined) {
      updates.push('order_index = ?');
      params.push(data.order_index);
    }
    if (data.is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(data.is_active ? 1 : 0);
    }
    if (data.institution_id !== undefined && data.scope === 'INSTITUTION') {
      updates.push('institution_id = ?');
      params.push(data.institution_id);
    }

    if (updates.length === 0) return true;

    params.push(id);
    await pool.query(`UPDATE faqs SET ${updates.join(', ')} WHERE id = ?`, params);
    return true;
  }

  async delete(id) {
    await pool.query(`DELETE FROM faqs WHERE id = ?`, [id]);
    return true;
  }
}

module.exports = new FaqRepository();
