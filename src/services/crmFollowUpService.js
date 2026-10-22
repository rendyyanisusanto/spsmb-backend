const crmLeadRepository = require('../repositories/crmLeadRepository');
const crmTemplateRepository = require('../repositories/crmTemplateRepository');
const crmActivityRepository = require('../repositories/crmActivityRepository');
const defaultGowaService = require('./gowaService');
const auditService = require('./auditService');
const { AUDIT_ACTIONS } = require('../constants/auditActions');
const { CRM_ACTIVITY_TYPES, CRM_CONTACT_METHODS, CRM_MESSAGE_STATUSES } = require('../constants/crmActivityTypes');
const { renderTemplate } = require('../utils/crmTemplateRenderer');

class CrmFollowUpService {
  constructor(gowaService = null) {
    this.gowaService = gowaService || defaultGowaService;
  }

  _getInstitutionScope(user) {
    if (!user) return [];
    const isSuperAdmin = (user.roles && user.roles.includes('SUPER_ADMIN')) || user.primaryRole === 'SUPER_ADMIN';
    if (isSuperAdmin) {
      return null; // Unlimited scope
    }

    const institutions = user.institutions || [];
    return institutions.map(i => (typeof i === 'object' && i !== null ? i.id : i));
  }

  _checkScope(lead, scope) {
    if (scope === null) return true;
    if (!scope || scope.length === 0) return false;
    return scope.map(Number).includes(Number(lead.institution_id));
  }

  async getActivities(leadId, user) {
    const lead = await crmLeadRepository.findLeadById(leadId);
    if (!lead) {
      const err = new Error('Data lead tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }

    const scope = this._getInstitutionScope(user);
    if (!this._checkScope(lead, scope)) {
      const err = new Error('Anda tidak memiliki izin untuk melihat aktivitas lead ini.');
      err.statusCode = 403;
      throw err;
    }

    const activities = await crmActivityRepository.findActivitiesByLeadId(leadId);

    return activities.map(a => ({
      id: a.id,
      leadId: a.lead_id,
      institutionId: a.institution_id,
      activityType: a.activity_type,
      subject: a.subject,
      description: a.description,
      contactMethod: a.contact_method,
      templateId: a.template_id,
      templateName: a.template_name,
      messageContent: a.message_content,
      messageStatus: a.message_status,
      providerMessageId: a.provider_message_id,
      createdBy: a.created_by_user_id ? {
        id: a.created_by_user_id,
        name: a.created_by_name,
        username: a.created_by_username
      } : null,
      createdAt: a.created_at
    }));
  }

  async addActivity(leadId, data, user, req = null) {
    const lead = await crmLeadRepository.findLeadById(leadId);
    if (!lead) {
      const err = new Error('Data lead tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }

    const scope = this._getInstitutionScope(user);
    if (!this._checkScope(lead, scope)) {
      const err = new Error('Anda tidak memiliki izin untuk menambah aktivitas pada lead ini.');
      err.statusCode = 403;
      throw err;
    }

    const activityType = data.activity_type || CRM_ACTIVITY_TYPES.NOTE;
    if (!CRM_ACTIVITY_TYPES[activityType]) {
      const err = new Error(`Jenis aktivitas tidak valid. Pilihan: ${Object.keys(CRM_ACTIVITY_TYPES).join(', ')}`);
      err.statusCode = 422;
      throw err;
    }

    const description = (data.description || '').trim();
    const subject = (data.subject || '').trim();

    if (!description && !subject) {
      const err = new Error('Deskripsi atau catatan follow-up wajib diisi.');
      err.statusCode = 422;
      throw err;
    }

    const contactMethod = data.contact_method || (
      activityType === CRM_ACTIVITY_TYPES.CALL ? CRM_CONTACT_METHODS.PHONE :
      activityType === CRM_ACTIVITY_TYPES.CONSULTATION ? CRM_CONTACT_METHODS.DIRECT :
      CRM_CONTACT_METHODS.SYSTEM
    );

    const activityId = await crmActivityRepository.createActivity({
      lead_id: lead.id,
      institution_id: lead.institution_id,
      activity_type: activityType,
      subject: subject || null,
      description: description || null,
      contact_method: contactMethod,
      template_id: null,
      message_content: null,
      message_status: null,
      provider_message_id: null,
      created_by_user_id: user.id
    });

    // If it's a contact activity (Call or Consultation), update last_contacted_at
    if (activityType === CRM_ACTIVITY_TYPES.CALL || activityType === CRM_ACTIVITY_TYPES.CONSULTATION) {
      await crmActivityRepository.updateLeadLastContacted(lead.id, new Date());
    }

    if (auditService && auditService.log) {
      await auditService.log({
        userId: user.id,
        action: AUDIT_ACTIONS.CRM_FOLLOW_UP_CREATE,
        entityType: 'CRM_LEAD_ACTIVITY',
        entityId: activityId,
        institutionId: lead.institution_id,
        newData: { leadId, activityType, subject },
        ipAddress: req?.ip || null,
        userAgent: req?.get ? req.get('user-agent') : null
      });
    }

    return crmActivityRepository.findActivityById(activityId);
  }

  async updateSchedule(leadId, data, user, req = null) {
    const lead = await crmLeadRepository.findLeadById(leadId);
    if (!lead) {
      const err = new Error('Data lead tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }

    const scope = this._getInstitutionScope(user);
    if (!this._checkScope(lead, scope)) {
      const err = new Error('Anda tidak memiliki izin untuk menjadwalkan lead ini.');
      err.statusCode = 403;
      throw err;
    }

    let nextFollowUpAt = null;
    if (data.next_follow_up_at) {
      const parsed = new Date(data.next_follow_up_at);
      if (isNaN(parsed.getTime())) {
        const err = new Error('Format tanggal jadwal tindak lanjut tidak valid.');
        err.statusCode = 422;
        throw err;
      }
      nextFollowUpAt = parsed;
    }

    await crmActivityRepository.updateLeadSchedule(lead.id, nextFollowUpAt);

    const notes = (data.notes || '').trim();
    const actionDesc = nextFollowUpAt
      ? `Jadwal follow-up berikutnya ditetapkan pada ${nextFollowUpAt.toLocaleString('id-ID')}.${notes ? ` Catatan: ${notes}` : ''}`
      : `Jadwal follow-up dibatalkan/dihapus.${notes ? ` Catatan: ${notes}` : ''}`;

    await crmActivityRepository.createActivity({
      lead_id: lead.id,
      institution_id: lead.institution_id,
      activity_type: CRM_ACTIVITY_TYPES.SCHEDULE,
      subject: nextFollowUpAt ? 'Penjadwalan Follow-up' : 'Pembatalan Jadwal Follow-up',
      description: actionDesc,
      contact_method: CRM_CONTACT_METHODS.SYSTEM,
      template_id: null,
      message_content: null,
      message_status: null,
      provider_message_id: null,
      created_by_user_id: user.id
    });

    if (auditService && auditService.log) {
      await auditService.log({
        userId: user.id,
        action: AUDIT_ACTIONS.CRM_SCHEDULE_UPDATE,
        entityType: 'CRM_LEAD',
        entityId: lead.id,
        institutionId: lead.institution_id,
        newData: { next_follow_up_at: nextFollowUpAt, notes },
        ipAddress: req?.ip || null,
        userAgent: req?.get ? req.get('user-agent') : null
      });
    }

    return {
      leadId: lead.id,
      nextFollowUpAt
    };
  }

  async previewLeadMessage(leadId, data = {}, user) {
    const lead = await crmLeadRepository.findLeadById(leadId);
    if (!lead) {
      const err = new Error('Data lead tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }

    const scope = this._getInstitutionScope(user);
    if (!this._checkScope(lead, scope)) {
      const err = new Error('Anda tidak memiliki izin untuk mengakses lead ini.');
      err.statusCode = 403;
      throw err;
    }

    let rawTemplateText = data.template_text || '';
    let templateName = null;

    if (data.template_id) {
      const tpl = await crmTemplateRepository.findTemplateById(data.template_id);
      if (tpl) {
        rawTemplateText = tpl.message_body;
        templateName = tpl.name;
      }
    }

    const renderResult = renderTemplate(rawTemplateText, lead, user, { keepMissingPlaceholders: true });

    return {
      templateName,
      renderedText: renderResult.text,
      usedVariables: renderResult.usedVariables,
      missingVariables: renderResult.missingVariables,
      isValid: renderResult.isValid,
      recipientPhone: lead.phone || null
    };
  }

  async sendManualWhatsApp(leadId, data, user, req = null, customGowa = null) {
    const gowa = customGowa || this.gowaService;

    const lead = await crmLeadRepository.findLeadById(leadId);
    if (!lead) {
      const err = new Error('Data lead tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }

    const scope = this._getInstitutionScope(user);
    if (!this._checkScope(lead, scope)) {
      const err = new Error('Anda tidak memiliki izin untuk mengirim WhatsApp ke lead lembaga ini.');
      err.statusCode = 403;
      throw err;
    }

    // Determine target phone number
    const targetPhone = (data.phone || lead.phone || '').trim();
    if (!targetPhone) {
      const err = new Error('Nomor WhatsApp tujuan tidak tersedia pada data lead ini.');
      err.statusCode = 422;
      throw err;
    }

    let normalizedPhone = '';
    try {
      normalizedPhone = gowa.normalizePhoneNumber(targetPhone);
    } catch (normErr) {
      const err = new Error(`Nomor telepon tidak valid: ${normErr.message}`);
      err.statusCode = 422;
      throw err;
    }

    // Determine message text
    let messageText = (data.message || '').trim();
    let templateId = data.template_id ? Number(data.template_id) : null;
    let templateObj = null;

    if (!messageText && templateId) {
      templateObj = await crmTemplateRepository.findTemplateById(templateId);
      if (!templateObj) {
        const err = new Error('Template WhatsApp tidak ditemukan.');
        err.statusCode = 404;
        throw err;
      }
      const rendered = renderTemplate(templateObj.message_body, lead, user, { keepMissingPlaceholders: false });
      messageText = rendered.text;
    } else if (templateId) {
      templateObj = await crmTemplateRepository.findTemplateById(templateId);
    }

    if (!messageText || messageText.trim().length === 0) {
      const err = new Error('Isi pesan WhatsApp tidak boleh kosong.');
      err.statusCode = 422;
      throw err;
    }

    // Double-check for remaining unrendered placeholders {{...}}
    const remainingPlaceholders = messageText.match(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g);
    if (remainingPlaceholders && remainingPlaceholders.length > 0 && !data.allow_unrendered) {
      const missingList = remainingPlaceholders.join(', ');
      const err = new Error(`Pesan masih mengandung placeholder yang belum terisi: ${missingList}. Silakan lengkapi atau edit sebelum mengirim.`);
      err.statusCode = 422;
      err.missingPlaceholders = remainingPlaceholders;
      throw err;
    }

    let gowaResult = null;
    let sendError = null;

    try {
      gowaResult = await gowa.sendMessage(normalizedPhone, messageText);
    } catch (err) {
      sendError = err;
    }

    // Determine message status based on GOWA actual response
    let messageStatus = CRM_MESSAGE_STATUSES.FAILED;
    let providerMsgId = null;

    if (gowaResult && gowaResult.success) {
      messageStatus = gowaResult.status || CRM_MESSAGE_STATUSES.SENT;
      providerMsgId = gowaResult.messageId || null;
    } else if (sendError && sendError.code === 'GOWA_TIMEOUT') {
      messageStatus = CRM_MESSAGE_STATUSES.UNKNOWN;
    } else {
      messageStatus = CRM_MESSAGE_STATUSES.FAILED;
    }

    // Record the activity in crm_lead_activities
    const activitySubject = templateObj ? `Kirim WA: ${templateObj.name}` : 'Kirim WhatsApp Manual';
    const activityDesc = sendError ? `Gagal mengirim WhatsApp: ${sendError.message}` : 'Pesan WhatsApp berhasil dikirim ke calon peserta.';

    const activityId = await crmActivityRepository.createActivity({
      lead_id: lead.id,
      institution_id: lead.institution_id,
      activity_type: CRM_ACTIVITY_TYPES.WHATSAPP,
      subject: activitySubject,
      description: activityDesc,
      contact_method: CRM_CONTACT_METHODS.WHATSAPP,
      template_id: templateId,
      message_content: messageText,
      message_status: messageStatus,
      provider_message_id: providerMsgId,
      created_by_user_id: user.id
    });

    // If message was successfully sent to provider, update lead's last_contacted_at
    if (messageStatus === CRM_MESSAGE_STATUSES.SENT || messageStatus === CRM_MESSAGE_STATUSES.DELIVERED) {
      await crmActivityRepository.updateLeadLastContacted(lead.id, new Date());
    }

    // Audit log
    if (auditService && auditService.log) {
      await auditService.log({
        userId: user.id,
        action: AUDIT_ACTIONS.CRM_WHATSAPP_SEND,
        entityType: 'CRM_LEAD_ACTIVITY',
        entityId: activityId,
        institutionId: lead.institution_id,
        newData: {
          leadId: lead.id,
          recipient: normalizedPhone,
          status: messageStatus,
          providerMessageId: providerMsgId
        },
        ipAddress: req?.ip || null,
        userAgent: req?.get ? req.get('user-agent') : null
      });
    }

    // If sending failed, throw error with recorded details
    if (sendError) {
      const err = new Error(sendError.message || 'Gagal mengirim pesan melalui gateway WhatsApp GOWA.');
      err.statusCode = sendError.status || 502;
      err.activityId = activityId;
      err.messageStatus = messageStatus;
      throw err;
    }

    return {
      success: true,
      activityId,
      status: messageStatus,
      messageId: providerMsgId,
      recipient: normalizedPhone,
      message: gowaResult.message || 'Pesan WhatsApp berhasil dikirim via gateway GOWA.'
    };
  }
}

module.exports = new CrmFollowUpService();
module.exports.CrmFollowUpService = CrmFollowUpService;
