/**
 * Notification Engine Service
 * Central coordinator that processes registration events, resolves dynamic recipients,
 * renders message templates, sends via GOWA, and records delivery logs with idempotency.
 */

const pool = require('../config/database');
const defaultRouting = require('./notificationRoutingService');
const defaultTemplate = require('./notificationTemplateService');
const defaultGowa = require('./gowaService');
const defaultComposer = require('./whatsappTemplateComposer');

class NotificationEngineService {
  constructor(routingService = null, templateService = null, gowa = null, composer = null) {
    this.routing = routingService || defaultRouting;
    this.template = templateService || defaultTemplate;
    this.gowa = gowa || defaultGowa;
    this.composer = composer || defaultComposer;
  }

  /**
   * Main entry point to process a registration notification event.
   * 
   * @param {string} eventCode e.g. 'REGISTRATION_CREATED' or 'REGISTRATION_SUBMITTED'
   * @param {number|string} applicationId ID of the application
   * @param {object} options Optional parameters (continueToken, connection)
   * @returns {Promise<object>} Processing summary
   */
  async processEvent(eventCode, applicationId, options = {}) {
    const db = options.connection || pool;
    const summary = {
      success: false,
      eventCode,
      applicationId,
      totalRecipients: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      details: [],
      reason: null
    };

    try {
      // 1. Fetch application context
      const context = await this.routing.getApplicationContext(applicationId, db);
      if (!context) {
        summary.reason = 'APPLICATION_NOT_FOUND';
        return summary;
      }

      // 2. Find matching notification rules
      const rules = await this.routing.getMatchingRules(
        eventCode,
        context.registration_type,
        context.gender,
        db
      );

      if (!rules || rules.length === 0) {
        summary.success = true;
        summary.reason = 'NO_ACTIVE_RULES';
        return summary;
      }

      // 3. Resolve dynamic recipients
      const { recipients, skipped } = await this.routing.resolveRecipients(context, rules, {
        eventCode,
        connection: db
      });

      summary.skipped = skipped.length;
      summary.details.push(...skipped.map(s => ({
        recipientType: s.recipientType,
        name: s.name || null,
        phone: s.phone || null,
        status: 'SKIPPED',
        reason: s.reason
      })));

      if (!recipients || recipients.length === 0) {
        summary.success = true;
        summary.reason = 'NO_VALID_RECIPIENTS';
        return summary;
      }

      summary.totalRecipients = recipients.length;

      // 4. Resolve WhatsApp template
      // For parents/applicants (APPLICANT, GUARDIAN), compose unified message from 3 sections
      let composedResult = null;
      try {
        composedResult = await this.composer.composeForApplication(applicationId, eventCode, {
          context,
          connection: db,
          continueToken: options.continueToken,
          continueUrl: options.continueUrl
        });
      } catch (cErr) {
        console.warn('[NotificationEngine] Warning composing unified message:', cErr.message);
      }

      // Also resolve standard template for fallback / internal admin
      const candidateInstitutionIds = [
        context.formal_institution_id,
        context.pondok_institution_id
      ].filter(Boolean);
      const templateResult = await this.template.resolveTemplate(
        eventCode,
        candidateInstitutionIds,
        db
      );

      const hasComposedMessage = composedResult && composedResult.composedMessage && composedResult.composedMessage.trim().length > 0;
      const hasStandardTemplate = templateResult && templateResult.template;

      if (!hasComposedMessage && !hasStandardTemplate) {
        summary.reason = 'NO_TEMPLATE_FOUND';
        // Log to wa_logs as failed so administrators can audit the missing template
        for (const recipient of recipients) {
          await this._recordLog({
            applicationId: context.id,
            templateId: null,
            eventCode,
            recipientType: recipient.recipientType,
            phoneNumber: recipient.phone,
            message: '',
            status: 'FAILED',
            errorMessage: `Template pesan untuk event ${eventCode} tidak ditemukan atau belum aktif.`,
            idempotencyKey: recipient.idempotencyKey,
            db
          });
        }
        return summary;
      }

      const activeTemplate = (templateResult && templateResult.template) || { id: composedResult?.primaryTemplateId || 1, message: '' };
      const standardRenderedMessage = hasStandardTemplate ? this.template.renderMessage(activeTemplate.message, context, options) : '';

      // 5. Process each recipient with idempotency protection
      for (const recipient of recipients) {
        const isParentOrApplicant = recipient.recipientType === 'APPLICANT' || recipient.recipientType === 'GUARDIAN';
        
        let messageToSend = '';
        if (isParentOrApplicant) {
          messageToSend = hasComposedMessage ? composedResult.composedMessage : standardRenderedMessage;
        } else {
          // Internal admin (SUPER_ADMIN, INSTITUTION_ADMIN): detail pendaftar lengkap statis
          const adminCustomMsg = this.formatAdminMessage(context, eventCode, recipient);
          messageToSend = adminCustomMsg || standardRenderedMessage || (hasComposedMessage ? composedResult.composedMessage : '');
        }

        if (!messageToSend || messageToSend.trim() === '') {
          continue;
        }

        const itemResult = await this._dispatchToRecipient({
          context,
          template: activeTemplate,
          eventCode,
          recipient,
          message: messageToSend,
          db
        });

        if (itemResult.status === 'SENT') {
          summary.sent++;
        } else if (itemResult.status === 'FAILED') {
          summary.failed++;
        } else if (itemResult.status === 'ALREADY_SENT' || itemResult.status === 'SKIPPED') {
          summary.skipped++;
        }

        summary.details.push(itemResult);
      }

      summary.success = true;
      return summary;

    } catch (err) {
      console.error(`[NotificationEngine] Error processing event ${eventCode} for app ${applicationId}:`, err);
      summary.success = false;
      summary.reason = `INTERNAL_ENGINE_ERROR: ${err.message}`;
      return summary;
    }
  }

  /**
   * Format message for internal administrator notification
   */
  formatAdminMessage(context, eventCode, recipient) {
    if (this.composer && typeof this.composer.formatAdminNotification === 'function') {
      return this.composer.formatAdminNotification(context, eventCode, recipient);
    }
    return defaultComposer.formatAdminNotification(context, eventCode, recipient);
  }

  /**
   * Dispatch single recipient with idempotency and log recording
   */
  async _dispatchToRecipient({ context, template, eventCode, recipient, message, db }) {
    const idempotencyKey = recipient.idempotencyKey;

    try {
      // Check existing log by idempotency key
      const [existingLogs] = await db.query(
        `SELECT id, status, provider_message_id, attempt_count 
         FROM wa_logs 
         WHERE idempotency_key = ? 
         LIMIT 1`,
        [idempotencyKey]
      );

      if (existingLogs.length > 0) {
        const existing = existingLogs[0];
        if (existing.status === 'SENT') {
          return {
            recipientType: recipient.recipientType,
            name: recipient.name,
            phone: recipient.phone,
            status: 'ALREADY_SENT',
            providerMessageId: existing.provider_message_id,
            logId: existing.id
          };
        }
      }

      // Send via GOWA service
      let sendResult = null;
      let sendError = null;

      try {
        sendResult = await this.gowa.sendMessage(recipient.phone, message);
      } catch (err) {
        sendError = err;
      }

      if (sendResult && sendResult.success) {
        const logId = await this._recordLog({
          applicationId: context.id,
          templateId: template.id,
          eventCode,
          recipientType: recipient.recipientType,
          phoneNumber: recipient.phone,
          message,
          status: 'SENT',
          providerMessageId: sendResult.messageId,
          providerResponse: sendResult.rawResults,
          idempotencyKey,
          db
        });

        return {
          recipientType: recipient.recipientType,
          name: recipient.name,
          phone: recipient.phone,
          status: 'SENT',
          providerMessageId: sendResult.messageId,
          logId
        };
      } else {
        const errorMsg = sendError?.message || 'Gagal mengirim pesan melalui gateway GOWA.';
        const logId = await this._recordLog({
          applicationId: context.id,
          templateId: template.id,
          eventCode,
          recipientType: recipient.recipientType,
          phoneNumber: recipient.phone,
          message,
          status: 'FAILED',
          errorMessage: errorMsg,
          providerResponse: sendError?.raw || null,
          idempotencyKey,
          db
        });

        return {
          recipientType: recipient.recipientType,
          name: recipient.name,
          phone: recipient.phone,
          status: 'FAILED',
          error: errorMsg,
          logId
        };
      }

    } catch (dispatchErr) {
      console.error(`[NotificationEngine] Failed dispatching to ${recipient.phone}:`, dispatchErr.message);
      return {
        recipientType: recipient.recipientType,
        name: recipient.name,
        phone: recipient.phone,
        status: 'FAILED',
        error: dispatchErr.message
      };
    }
  }

  /**
   * Safe upsert into wa_logs
   */
  async _recordLog({
    applicationId,
    templateId,
    eventCode,
    recipientType,
    phoneNumber,
    message,
    status,
    providerMessageId = null,
    providerResponse = null,
    errorMessage = null,
    idempotencyKey,
    db
  }) {
    try {
      const providerResponseStr = providerResponse ? JSON.stringify(providerResponse) : null;
      const sentAt = status === 'SENT' ? new Date() : null;

      const query = `
        INSERT INTO wa_logs (
          application_id, template_id, event_code, recipient_type,
          phone_number, message, status, provider_message_id,
          provider_response, error_message, attempt_count,
          idempotency_key, sent_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          provider_message_id = VALUES(provider_message_id),
          provider_response = VALUES(provider_response),
          error_message = VALUES(error_message),
          attempt_count = attempt_count + 1,
          sent_at = VALUES(sent_at),
          updated_at = NOW()
      `;

      const [res] = await db.query(query, [
        applicationId,
        templateId,
        eventCode,
        recipientType,
        phoneNumber,
        message,
        status,
        providerMessageId,
        providerResponseStr,
        errorMessage,
        idempotencyKey,
        sentAt
      ]);

      return res.insertId;
    } catch (err) {
      console.error('[NotificationEngine] Gagal menyimpan wa_logs:', err.message);
      return null;
    }
  }
}

const defaultInstance = new NotificationEngineService();

module.exports = defaultInstance;
module.exports.NotificationEngineService = NotificationEngineService;
