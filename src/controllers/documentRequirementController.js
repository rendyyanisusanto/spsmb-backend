const service = require('../services/documentRequirementService');
const auditService = require('../services/auditService');
const { AUDIT_ACTIONS } = require('../constants/auditActions');

exports.getAll = async (req, res, next) => {
  try {
    const result = await service.getAll(req.query, req.user);
    res.json({ success: true, message: 'Data berhasil dimuat', data: result.data });
  } catch (error) { next(error); }
};

exports.getEffective = async (req, res, next) => {
  try {
    const result = await service.getEffective(req.query, req.user);
    res.json({ success: true, message: 'Data berhasil dimuat', data: result.data });
  } catch (error) { next(error); }
};

exports.getById = async (req, res, next) => {
  try {
    const result = await service.getById(req.params.id);
    res.json({ success: true, message: 'Data berhasil dimuat', data: result });
  } catch (error) { next(error); }
};

exports.create = async (req, res, next) => {
  try {
    const result = await service.create(req.body, req.user);
    await auditService.log(AUDIT_ACTIONS.DOCUMENT_REQUIREMENT_CREATE, 'DOCUMENT_REQUIREMENT', result.id, 'Persyaratan dokumen dibuat.', req);
    res.status(201).json({ success: true, message: 'Persyaratan berhasil dibuat', data: result });
  } catch (error) { next(error); }
};

exports.update = async (req, res, next) => {
  try {
    const result = await service.update(req.params.id, req.body, req.user);
    await auditService.log(AUDIT_ACTIONS.DOCUMENT_REQUIREMENT_UPDATE, 'DOCUMENT_REQUIREMENT', req.params.id, 'Persyaratan dokumen diperbarui.', req);
    res.json({ success: true, message: 'Persyaratan berhasil diperbarui', data: result });
  } catch (error) { next(error); }
};

exports.updateRequired = async (req, res, next) => {
  try {
    const result = await service.updateRequired(req.params.id, req.body.isRequired, req.user);
    await auditService.log(AUDIT_ACTIONS.DOCUMENT_REQUIREMENT_UPDATE, 'DOCUMENT_REQUIREMENT', req.params.id, `Status wajib persyaratan diubah menjadi ${req.body.isRequired}.`, req);
    res.json({ success: true, message: 'Status wajib berhasil diperbarui', data: result });
  } catch (error) { next(error); }
};

exports.updateOrder = async (req, res, next) => {
  try {
    const result = await service.updateOrder(req.params.id, req.body.sortOrder, req.user);
    res.json({ success: true, message: 'Urutan berhasil diperbarui', data: result });
  } catch (error) { next(error); }
};

exports.reorder = async (req, res, next) => {
  try {
    await service.reorder(req.body.requirements, req.user);
    await auditService.log(AUDIT_ACTIONS.DOCUMENT_REQUIREMENT_UPDATE, 'DOCUMENT_REQUIREMENT', null, 'Urutan persyaratan dokumen diperbarui.', req);
    res.json({ success: true, message: 'Urutan berhasil diperbarui' });
  } catch (error) { next(error); }
};

exports.remove = async (req, res, next) => {
  try {
    await service.remove(req.params.id, req.user);
    await auditService.log(AUDIT_ACTIONS.DOCUMENT_REQUIREMENT_DELETE, 'DOCUMENT_REQUIREMENT', req.params.id, 'Persyaratan dokumen dihapus.', req);
    res.json({ success: true, message: 'Persyaratan berhasil dihapus' });
  } catch (error) { next(error); }
};
