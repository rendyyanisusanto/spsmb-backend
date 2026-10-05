
const service = require('../services/formFieldService');

class FormFieldController {
  async getAll(req, res, next) {
    try {
      const result = await service.getAll(req.query, req.user);
      res.json({ success: true, message: 'Data berhasil dimuat', data: result.data });
    } catch (err) { next(err); }
  }
  async getById(req, res, next) {
    try {
      const data = await service.getById(req.params.id, req.user);
      res.json({ success: true, message: 'Data berhasil dimuat', data });
    } catch (err) { next(err); }
  }
  async create(req, res, next) {
    try {
      const data = await service.create(req.body, req.user);
      res.status(201).json({ success: true, message: 'Data berhasil disimpan', data });
    } catch (err) { next(err); }
  }
  async update(req, res, next) {
    try {
      const data = await service.update(req.params.id, req.body, req.user);
      res.json({ success: true, message: 'Data berhasil diupdate', data });
    } catch (err) { next(err); }
  }
  async updateStatus(req, res, next) {
    try {
      const data = await service.updateStatus(req.params.id, req.body.isActive, req.user);
      res.json({ success: true, message: 'Status berhasil diupdate', data });
    } catch (err) { next(err); }
  }
  async updateRequired(req, res, next) {
    try {
      const data = await service.updateRequired(req.params.id, req.body.isRequired, req.user);
      res.json({ success: true, message: 'Status wajib isi berhasil diupdate', data });
    } catch (err) { next(err); }
  }
  async updateOrder(req, res, next) {
    try {
      const data = await service.updateOrder(req.params.id, req.body.sortOrder, req.user);
      res.json({ success: true, message: 'Urutan berhasil diupdate', data });
    } catch (err) { next(err); }
  }
  async delete(req, res, next) {
    try {
      await service.delete(req.params.id, req.user);
      res.json({ success: true, message: 'Data berhasil dihapus' });
    } catch (err) { next(err); }
  }
}
module.exports = new FormFieldController();
