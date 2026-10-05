
const service = require('../services/documentRequirementService');

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
    res.status(201).json({ success: true, message: 'Persyaratan berhasil dibuat', data: result });
  } catch (error) { next(error); }
};

exports.update = async (req, res, next) => {
  try {
    const result = await service.update(req.params.id, req.body, req.user);
    res.json({ success: true, message: 'Persyaratan berhasil diperbarui', data: result });
  } catch (error) { next(error); }
};

exports.updateRequired = async (req, res, next) => {
  try {
    const result = await service.updateRequired(req.params.id, req.body.isRequired, req.user);
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
    res.json({ success: true, message: 'Urutan berhasil diperbarui' });
  } catch (error) { next(error); }
};

exports.remove = async (req, res, next) => {
  try {
    await service.remove(req.params.id, req.user);
    res.json({ success: true, message: 'Persyaratan berhasil dihapus' });
  } catch (error) { next(error); }
};
