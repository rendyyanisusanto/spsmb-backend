
const academicYearService = require('../services/academicYearService');

class AcademicYearController {
  async getAll(req, res, next) {
    try {
      const result = await academicYearService.getAll(req.query);
      res.json({ success: true, message: 'Data berhasil dimuat', ...result });
    } catch (err) { next(err); }
  }
  async getById(req, res, next) {
    try {
      const data = await academicYearService.getById(req.params.id);
      res.json({ success: true, message: 'Data berhasil dimuat', data });
    } catch (err) { next(err); }
  }
  async create(req, res, next) {
    try {
      const data = await academicYearService.create(req.body);
      res.status(201).json({ success: true, message: 'Data berhasil disimpan', data });
    } catch (err) { next(err); }
  }
  async update(req, res, next) {
    try {
      const data = await academicYearService.update(req.params.id, req.body);
      res.json({ success: true, message: 'Data berhasil diupdate', data });
    } catch (err) { next(err); }
  }
  async updateStatus(req, res, next) {
    try {
      const data = await academicYearService.updateStatus(req.params.id, req.body.isActive);
      res.json({ success: true, message: 'Status berhasil diupdate', data });
    } catch (err) { next(err); }
  }
}
module.exports = new AcademicYearController();
