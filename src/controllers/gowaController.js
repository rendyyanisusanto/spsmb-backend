/**
 * GOWA WhatsApp Gateway Controller
 */

const gowaService = require('../services/gowaService');
const whatsappLogRepository = require('../repositories/whatsappLogRepository');
const auditService = require('../services/auditService');
const { successResponse, errorResponse } = require('../utils/response');

class GowaController {
  /**
   * Check GOWA server health
   */
  async getHealth(req, res) {
    try {
      const health = await gowaService.checkHealth();
      return successResponse(res, 200, 'Pemeriksaan kesehatan server GOWA selesai.', health);
    } catch (error) {
      return errorResponse(res, 500, 'Gagal memeriksa kesehatan server GOWA.', {
        error: error.message
      });
    }
  }

  /**
   * Get WhatsApp connection & login status
   */
  async getStatus(req, res) {
    try {
      const status = await gowaService.getConnectionStatus();
      return successResponse(res, 200, 'Status koneksi WhatsApp GOWA berhasil diambil.', status);
    } catch (error) {
      return errorResponse(res, 500, 'Gagal mengambil status koneksi WhatsApp GOWA.', {
        error: error.message
      });
    }
  }

  /**
   * Send Test Message (Restricted to Authorized Admin)
   */
  async sendTestMessage(req, res) {
    const { phone, message } = req.body;

    if (!phone || typeof phone !== 'string' || phone.trim() === '') {
      return errorResponse(res, 400, 'Nomor WhatsApp tujuan wajib diisi.');
    }

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return errorResponse(res, 400, 'Isi pesan uji coba wajib diisi.');
    }

    let normalizedPhone = null;
    try {
      normalizedPhone = gowaService.normalizePhoneNumber(phone);
    } catch (validationErr) {
      return errorResponse(res, 400, validationErr.message);
    }

    try {
      const sendResult = await gowaService.sendMessage(normalizedPhone, message);

      // Record successful log into wa_logs
      try {
        await whatsappLogRepository.create({
          phone_number: sendResult.recipient,
          message: message.trim(),
          status: 'SENT',
          provider_message_id: sendResult.messageId,
          provider_response: sendResult.rawResults,
          sent_at: new Date()
        });
      } catch (logErr) {
        // Silently log to avoid breaking the response if wa_logs insert encounters an issue
        console.error('[GOWA] Gagal menyimpan log pesan ke wa_logs:', logErr.message);
      }

      // Record audit log
      try {
        await auditService.log(
          'SEND_TEST_MESSAGE',
          'WHATSAPP_GATEWAY',
          null,
          `Mengirim pesan uji coba ke ${sendResult.recipient} (MsgID: ${sendResult.messageId || '-'})`,
          req
        );
      } catch (auditErr) {
        console.error('[GOWA] Gagal mencatat audit log:', auditErr.message);
      }

      return successResponse(res, 200, 'Pesan WhatsApp uji coba berhasil dikirim.', sendResult);
    } catch (err) {
      // Record failed log into wa_logs
      try {
        await whatsappLogRepository.create({
          phone_number: normalizedPhone || phone,
          message: message.trim(),
          status: 'FAILED',
          error_message: err.message,
          provider_response: err.raw || null
        });
      } catch (_) {}

      // Record audit log for failure
      try {
        await auditService.log(
          'SEND_TEST_MESSAGE',
          'WHATSAPP_GATEWAY',
          null,
          `Gagal mengirim pesan uji coba ke ${normalizedPhone || phone}: ${err.message}`,
          req
        );
      } catch (_) {}

      const statusCode = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
      return errorResponse(res, statusCode, err.message, {
        code: err.code || 'SEND_ERROR',
        details: err.raw || null
      });
    }
  }
}

module.exports = new GowaController();
