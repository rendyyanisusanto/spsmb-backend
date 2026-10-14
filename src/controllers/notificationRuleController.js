/**
 * Notification Rule Controller
 * Allows Super Admin to view and manage notification routing rules and recipients.
 */

const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/response');
const auditService = require('../services/auditService');

class NotificationRuleController {
  async getAll(req, res, next) {
    try {
      const [rules] = await pool.query(
        `SELECT * FROM wa_notification_rules ORDER BY sort_order ASC, id ASC`
      );

      const [recipients] = await pool.query(
        `SELECT * FROM wa_notification_recipients ORDER BY sort_order ASC, id ASC`
      );

      const result = rules.map(rule => ({
        ...rule,
        recipients: recipients.filter(r => r.rule_id === rule.id)
      }));

      return successResponse(res, 200, 'Berhasil mengambil aturan notifikasi.', result);
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const [rules] = await pool.query(
        `SELECT * FROM wa_notification_rules WHERE id = ?`,
        [id]
      );

      if (rules.length === 0) {
        return errorResponse(res, 404, 'Aturan notifikasi tidak ditemukan.');
      }

      const [recipients] = await pool.query(
        `SELECT * FROM wa_notification_recipients WHERE rule_id = ? ORDER BY sort_order ASC, id ASC`,
        [id]
      );

      const rule = {
        ...rules[0],
        recipients
      };

      return successResponse(res, 200, 'Berhasil mengambil detail aturan notifikasi.', rule);
    } catch (err) {
      next(err);
    }
  }

  async updateRule(req, res, next) {
    try {
      const { id } = req.params;
      const { name, description, registration_type, gender, is_active, sort_order } = req.body;

      const [rules] = await pool.query(`SELECT * FROM wa_notification_rules WHERE id = ?`, [id]);
      if (rules.length === 0) {
        return errorResponse(res, 404, 'Aturan notifikasi tidak ditemukan.');
      }

      await pool.query(
        `UPDATE wa_notification_rules 
         SET name = COALESCE(?, name),
             description = COALESCE(?, description),
             registration_type = ?,
             gender = ?,
             is_active = COALESCE(?, is_active),
             sort_order = COALESCE(?, sort_order)
         WHERE id = ?`,
        [
          name !== undefined ? name : null,
          description !== undefined ? description : null,
          registration_type !== undefined ? registration_type : rules[0].registration_type,
          gender !== undefined ? gender : rules[0].gender,
          is_active !== undefined ? is_active : null,
          sort_order !== undefined ? sort_order : null,
          id
        ]
      );

      await auditService.log(
        'UPDATE',
        'NOTIFICATION_RULE',
        id,
        `Memperbarui aturan notifikasi: ${name || rules[0].name}`,
        req
      );

      return successResponse(res, 200, 'Aturan notifikasi berhasil diperbarui.');
    } catch (err) {
      next(err);
    }
  }

  async setRecipients(req, res, next) {
    const connection = await pool.getConnection();
    try {
      const { id } = req.params;
      const { recipients } = req.body;

      if (!Array.isArray(recipients)) {
        return errorResponse(res, 400, 'Daftar penerima harus berupa array.');
      }

      const [rules] = await connection.query(`SELECT * FROM wa_notification_rules WHERE id = ?`, [id]);
      if (rules.length === 0) {
        return errorResponse(res, 404, 'Aturan notifikasi tidak ditemukan.');
      }

      await connection.beginTransaction();

      // Clear existing recipients for this rule
      await connection.query(`DELETE FROM wa_notification_recipients WHERE rule_id = ?`, [id]);

      // Insert new recipients
      for (let i = 0; i < recipients.length; i++) {
        const r = recipients[i];
        await connection.query(
          `INSERT INTO wa_notification_recipients 
           (rule_id, recipient_type, institution_source, is_active, sort_order) 
           VALUES (?, ?, ?, ?, ?)`,
          [
            id,
            r.recipient_type,
            r.institution_source || 'NONE',
            r.is_active !== undefined ? r.is_active : 1,
            r.sort_order !== undefined ? r.sort_order : i + 1
          ]
        );
      }

      await connection.commit();

      await auditService.log(
        'UPDATE',
        'NOTIFICATION_RULE_RECIPIENTS',
        id,
        `Memperbarui penerima pada aturan notifikasi ID ${id}`,
        req
      );

      return successResponse(res, 200, 'Daftar penerima notifikasi berhasil disimpan.');
    } catch (err) {
      await connection.rollback();
      next(err);
    } finally {
      connection.release();
    }
  }
}

module.exports = new NotificationRuleController();
