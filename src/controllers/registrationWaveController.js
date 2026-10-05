
const service = require('../services/registrationWaveService');

class RegistrationWaveController {
  async getAll(req, res, next) {
    try {
      const result = await service.getAll(req.query);
      res.json({ success: true, message: 'Data berhasil dimuat', ...result });
    } catch (err) { next(err); }
  }
  async getById(req, res, next) {
    try {
      const data = await service.getById(req.params.id);
      res.json({ success: true, message: 'Data berhasil dimuat', data });
    } catch (err) { next(err); }
  }
  async create(req, res, next) {
    try {
      const data = await service.create(req.body);
      res.status(201).json({ success: true, message: 'Data berhasil disimpan', data });
    } catch (err) { next(err); }
  }
  async update(req, res, next) {
    try {
      const data = await service.update(req.params.id, req.body);
      res.json({ success: true, message: 'Data berhasil diupdate', data });
    } catch (err) { next(err); }
  }
  async updateStatus(req, res, next) {
    try {
      const data = await service.updateStatus(req.params.id, req.body.isActive);
      res.json({ success: true, message: 'Status berhasil diupdate', data });
    } catch (err) { next(err); }
  }
}
module.exports = new RegistrationWaveController();
