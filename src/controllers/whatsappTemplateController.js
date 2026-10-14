const service = require('../services/whatsappTemplateService');
const auditService = require('../services/auditService');
const { AUDIT_ACTIONS } = require('../constants/auditActions');
const resolver = require('../services/whatsappTemplateResolver');
const events = require('../constants/whatsappEvents');
const { allVariables } = require('../constants/whatsappVariables');
const { renderTemplate } = require('../utils/templateRenderer');

exports.getAll = async (req, res, next) => {
  try {
    const result = await service.getAll(req.query, req.user);
    res.json({ success: true, message: 'Data berhasil dimuat', data: result.data });
  } catch (error) { next(error); }
};

exports.getById = async (req, res, next) => {
  try {
    const result = await service.getById(req.params.id, req.user);
    res.json({ success: true, message: 'Data berhasil dimuat', data: result });
  } catch (error) { next(error); }
};

exports.create = async (req, res, next) => {
  try {
    const result = await service.create(req.body, req.user);
    await auditService.log(AUDIT_ACTIONS.WHATSAPP_TEMPLATE_CREATE, 'WHATSAPP_TEMPLATE', result.id, 'Template WhatsApp dibuat.', req);
    res.status(201).json({ success: true, message: 'Template berhasil dibuat', data: result });
  } catch (error) { next(error); }
};

exports.update = async (req, res, next) => {
  try {
    const result = await service.update(req.params.id, req.body, req.user);
    await auditService.log(AUDIT_ACTIONS.WHATSAPP_TEMPLATE_UPDATE, 'WHATSAPP_TEMPLATE', req.params.id, 'Template WhatsApp diperbarui.', req);
    res.json({ success: true, message: 'Template berhasil diperbarui', data: result });
  } catch (error) { next(error); }
};

exports.updateStatus = async (req, res, next) => {
  try {
    const result = await service.updateStatus(req.params.id, req.body.isActive, req.user);
    await auditService.log(AUDIT_ACTIONS.WHATSAPP_TEMPLATE_UPDATE, 'WHATSAPP_TEMPLATE', req.params.id, `Status template WhatsApp diubah menjadi ${req.body.isActive}.`, req);
    res.json({ success: true, message: 'Status berhasil diperbarui', data: result });
  } catch (error) { next(error); }
};

exports.duplicate = async (req, res, next) => {
  try {
    const result = await service.duplicate(req.params.id, req.body, req.user);
    await auditService.log(AUDIT_ACTIONS.WHATSAPP_TEMPLATE_CREATE, 'WHATSAPP_TEMPLATE', result.id, 'Template WhatsApp diduplikasi.', req);
    res.status(201).json({ success: true, message: 'Template berhasil diduplikasi', data: result });
  } catch (error) { next(error); }
};

exports.useGlobal = async (req, res, next) => {
  try {
    const result = await service.useGlobal(req.params.id, req.user);
    await auditService.log(AUDIT_ACTIONS.WHATSAPP_TEMPLATE_UPDATE, 'WHATSAPP_TEMPLATE', req.params.id, 'Template lembaga dinonaktifkan.', req);
    res.json({ success: true, message: 'Template lembaga dinonaktifkan, menggunakan template global', data: result });
  } catch (error) { next(error); }
};

exports.remove = async (req, res, next) => {
  try {
    await service.remove(req.params.id, req.user);
    await auditService.log(AUDIT_ACTIONS.WHATSAPP_TEMPLATE_DELETE, 'WHATSAPP_TEMPLATE', req.params.id, 'Template WhatsApp dihapus.', req);
    res.json({ success: true, message: 'Template berhasil dihapus' });
  } catch (error) { next(error); }
};

exports.getEvents = async (req, res, next) => {
  const primaryEvents = events.filter(e => !e.value.includes('LEGACY') && e.value !== 'INITIAL_REGISTRATION_SUCCESS' && e.value !== 'FULL_REGISTRATION_SUBMITTED');
  res.json({ success: true, data: primaryEvents });
};

exports.getVariables = async (req, res, next) => {
  // In a real app we might filter by event, but for now return all to make UI simpler or filter if requested
  let vars = allVariables;
  if (req.query.event) {
    const { variablesMap } = require('../constants/whatsappVariables');
    const allowedKeys = variablesMap[req.query.event];
    if (allowedKeys) {
      vars = allVariables.filter(v => allowedKeys.includes(v.key));
    }
  }
  
  const formatted = vars.map(v => ({
    key: v.key,
    token: `{{${v.key}}}`,
    label: v.label
  }));
  res.json({ success: true, data: formatted });
};

exports.preview = async (req, res, next) => {
  try {
    const { message, eventCode } = req.body;
    const { extractVariables } = require('../utils/templateRenderer');
    const { allVariables } = require('../constants/whatsappVariables');

    const knownKeys = allVariables.map(v => v.key);
    const usedVariables = extractVariables(message);
    const unknownVariables = usedVariables.filter(v => !knownKeys.includes(v));

    const frontendBaseUrl = (process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',')[0].trim() : 'http://localhost:5173').replace(/\/+$/, '');

    // Comprehensive mock data covering all registration placeholders
    const mockData = {
      registration_number: 'SPSMB-2027-00001',
      student_name: 'Ahmad Fauzan',
      registration_type: 'SMK IT Asy-Syadzili',
      gender: 'Laki-laki',
      institution_name: 'SMK IT Asy-Syadzili',
      pondok_name: 'Pondok Pesantren Asy-Syadzili 1',
      continue_url: `${frontendBaseUrl}/pendaftaran/lanjut/sample-preview-token`,
      parent_name: 'Abdul Karim',
      whatsapp: '081234567890',
      previous_school: 'SMP Negeri 1 Contoh',
      registration_status: 'Pendaftaran Awal',
      document_name: 'Kartu Keluarga',
      revision_note: 'Dokumen kurang jelas',
      announcement_title: 'Informasi SPSMB',
      announcement_message: 'Silakan melengkapi data berkas.',
      registration_date: '1 Oktober 2026'
    };

    const renderedMessage = renderTemplate(message, mockData);
    res.json({
      success: true,
      data: {
        originalMessage: message,
        renderedMessage,
        usedVariables,
        unknownVariables
      }
    });
  } catch (error) { next(error); }
};

const composer = require('../services/whatsappTemplateComposer');

exports.previewComposed = async (req, res, next) => {
  try {
    const { eventCode, pondokInstitutionId, formalInstitutionId, customGlobal, customPondok, customFormal } = req.body;
    const result = await composer.composePreview({
      eventCode: eventCode || 'REGISTRATION_CREATED',
      pondokInstitutionId: pondokInstitutionId ? parseInt(pondokInstitutionId) : 1,
      formalInstitutionId: formalInstitutionId !== undefined && formalInstitutionId !== null ? parseInt(formalInstitutionId) : 3,
      customGlobal,
      customPondok,
      customFormal
    });
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
};

exports.resolve = async (req, res, next) => {
  try {
    const { event, institutionId } = req.query;
    if (!event) throw { status: 422, message: 'Event wajib' };
    const result = await resolver.resolveTemplate(event, institutionId ? parseInt(institutionId) : null);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
};
