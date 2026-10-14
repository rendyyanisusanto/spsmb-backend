/**
 * WhatsApp Log Repository
 * Manages records in wa_logs table
 */

const pool = require('../config/database');

class WhatsappLogRepository {
  async create(data) {
    const query = `
      INSERT INTO wa_logs (
        application_id,
        template_id,
        event_code,
        recipient_type,
        phone_number,
        message,
        status,
        provider_message_id,
        provider_response,
        error_message,
        attempt_count,
        idempotency_key,
        sent_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.query(query, [
      data.application_id || null,
      data.template_id || null,
      data.event_code || 'TEST_MESSAGE',
      data.recipient_type || 'TEST',
      data.phone_number,
      data.message,
      data.status || 'PENDING',
      data.provider_message_id || null,
      data.provider_response ? JSON.stringify(data.provider_response) : null,
      data.error_message || null,
      data.attempt_count || 1,
      data.idempotency_key || null,
      data.sent_at || (data.status === 'SENT' ? new Date() : null)
    ]);

    return result.insertId;
  }

  async findAll({ page = 1, limit = 20, status = null, search = null }) {
    const offset = (page - 1) * limit;
    let query = 'SELECT * FROM wa_logs WHERE 1=1';
    const params = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (search) {
      query += ' AND (phone_number LIKE ? OR message LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows] = await pool.query(query, params);
    return rows;
  }
}

module.exports = new WhatsappLogRepository();
