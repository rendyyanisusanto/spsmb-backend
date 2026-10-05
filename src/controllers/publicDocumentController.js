const service = require('../services/publicDocumentService');
const appRepo = require('../repositories/applicationRepository');
const tokenService = require('../services/continueTokenService');

class PublicDocumentController {
  async validateAccess(req, res) {
    const { registrationNumber } = req.params;
    const continueToken = req.headers['x-continue-token'] || req.query.token;

    if (!continueToken) {
      throw { status: 401, message: 'Token lanjutan tidak ditemukan' };
    }

    const application = await appRepo.findByRegistrationNumber(registrationNumber);
    if (!application) {
      throw { status: 404, message: 'Pendaftaran tidak ditemukan' };
    }

    const isValid = tokenService.verifyToken(continueToken, application.continue_token_hash);
    if (!isValid) {
      throw { status: 401, message: 'Sesi anda tidak valid, silakan login kembali' };
    }

    if (new Date() > new Date(application.continue_token_expires_at)) {
      throw { status: 401, message: 'Sesi anda telah berakhir, silakan login kembali' };
    }

    return application;
  }

  async getDocuments(req, res, next) {
    try {
      const application = await this.validateAccess(req, res);
      const data = await service.getDocuments(application);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async uploadDocument(req, res, next) {
    try {
      const application = await this.validateAccess(req, res);
      const { documentTypeId } = req.params;
      
      if (!req.file) {
        throw { status: 400, message: 'File tidak ditemukan' };
      }

      await service.uploadDocument(application, documentTypeId, req.file);
      res.json({ success: true, message: 'Dokumen berhasil diupload' });
    } catch (err) {
      next(err);
    }
  }

  async deleteDocument(req, res, next) {
    try {
      const application = await this.validateAccess(req, res);
      const { documentTypeId } = req.params;

      await service.deleteDocument(application, documentTypeId);
      res.json({ success: true, message: 'Dokumen berhasil dihapus' });
    } catch (err) {
      next(err);
    }
  }

  async viewDocument(req, res, next) {
    try {
      const application = await this.validateAccess(req, res);
      const { documentTypeId } = req.params;

      await service.viewDocument(application, documentTypeId, res);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new PublicDocumentController();
