
const service = require('../services/documentTypeService');

exports.getAll = async (req, res, next) => {
  try {
    const result = await service.getAll(req.query);
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
    res.status(201).json({ success: true, message: 'Document Type berhasil dibuat', data: result });
  } catch (error) { next(error); }
};

exports.update = async (req, res, next) => {
  try {
    const result = await service.update(req.params.id, req.body, req.user);
    res.json({ success: true, message: 'Document Type berhasil diperbarui', data: result });
  } catch (error) { next(error); }
};

exports.updateStatus = async (req, res, next) => {
  try {
    const result = await service.updateStatus(req.params.id, req.body.isActive, req.user);
    res.json({ success: true, message: 'Status berhasil diperbarui', data: result });
  } catch (error) { next(error); }
};

exports.remove = async (req, res, next) => {
  try {
    await service.remove(req.params.id, req.user);
    res.json({ success: true, message: 'Document Type berhasil dihapus' });
  } catch (error) { next(error); }
};
