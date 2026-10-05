
const service = require('../services/whatsappTemplateService');
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
    res.status(201).json({ success: true, message: 'Template berhasil dibuat', data: result });
  } catch (error) { next(error); }
};

exports.update = async (req, res, next) => {
  try {
    const result = await service.update(req.params.id, req.body, req.user);
    res.json({ success: true, message: 'Template berhasil diperbarui', data: result });
  } catch (error) { next(error); }
};

exports.updateStatus = async (req, res, next) => {
  try {
    const result = await service.updateStatus(req.params.id, req.body.isActive, req.user);
    res.json({ success: true, message: 'Status berhasil diperbarui', data: result });
  } catch (error) { next(error); }
};

exports.duplicate = async (req, res, next) => {
  try {
    const result = await service.duplicate(req.params.id, req.body, req.user);
    res.status(201).json({ success: true, message: 'Template berhasil diduplikasi', data: result });
  } catch (error) { next(error); }
};

exports.useGlobal = async (req, res, next) => {
  try {
    const result = await service.useGlobal(req.params.id, req.user);
    res.json({ success: true, message: 'Template lembaga dinonaktifkan, menggunakan template global', data: result });
  } catch (error) { next(error); }
};

exports.remove = async (req, res, next) => {
  try {
    await service.remove(req.params.id, req.user);
    res.json({ success: true, message: 'Template berhasil dihapus' });
  } catch (error) { next(error); }
};

exports.getEvents = async (req, res, next) => {
  res.json({ success: true, data: events });
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
    // mock data
    const mockData = {
      registration_number: 'SPSMB-2027-00001',
      student_name: 'Ahmad Fauzan',
      gender: 'Laki-laki',
      parent_name: 'Abdul Karim',
      whatsapp: '081234567890',
      previous_school: 'SMP Contoh',
      institution_name: 'SMK IT Asy-Syadzili',
      registration_status: 'Pendaftaran Awal',
      document_name: 'Kartu Keluarga',
      revision_note: 'Dokumen kurang jelas',
      announcement_title: 'Informasi SPSMB',
      announcement_message: 'Silakan melengkapi data.',
      registration_date: '1 Oktober 2026'
    };
    const renderedMessage = renderTemplate(message, mockData);
    res.json({ success: true, data: { renderedMessage } });
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
