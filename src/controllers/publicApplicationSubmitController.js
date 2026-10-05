const appRepo = require('../repositories/applicationRepository');
const continueTokenService = require('../services/continueTokenService');
const applicationCompletenessService = require('../services/applicationCompletenessService');
const finalSubmissionService = require('../services/finalSubmissionService');
const publicApplicationStatusService = require('../services/publicApplicationStatusService');
const pool = require('../config/database');

class PublicApplicationSubmitController {
  async validateAccess(req, res) {
    const { registrationNumber } = req.params;
    const continueToken = req.headers['x-continue-token'] || req.query.token;

    if (!continueToken) {
      throw { status: 401, message: 'Token lanjutan tidak ditemukan' };
    }

    const [applications] = await pool.query(
      `SELECT a.*, f.name as formal_institution_name, p.name as pondok_institution_name
       FROM applications a
       LEFT JOIN institutions f ON a.formal_institution_id = f.id
       LEFT JOIN institutions p ON a.pondok_institution_id = p.id
       WHERE a.registration_number = ?`,
      [registrationNumber]
    );

    if (applications.length === 0) {
      throw { status: 404, message: 'Pendaftaran tidak ditemukan' };
    }

    const application = applications[0];

    if (!continueTokenService.verifyToken(continueToken, application.continue_token_hash)) {
      throw { status: 401, message: 'Sesi anda tidak valid, silakan login kembali' };
    }

    if (new Date() > new Date(application.continue_token_expires_at)) {
      throw { status: 401, message: 'Sesi pendaftaran telah berakhir. Silakan hubungi panitia SPSMB.' };
    }

    return application;
  }

  async getCompleteness(req, res, next) {
    try {
      const application = await this.validateAccess(req, res);
      const data = await applicationCompletenessService.getCompleteness(application);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async getReview(req, res, next) {
    try {
      const application = await this.validateAccess(req, res);
      const data = await publicApplicationStatusService.getReview(application);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async getStatus(req, res, next) {
    try {
      const application = await this.validateAccess(req, res);
      const data = await publicApplicationStatusService.getStatus(application);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async submitApplication(req, res, next) {
    try {
      const application = await this.validateAccess(req, res);
      const result = await finalSubmissionService.submitApplication(application);
      
      if (result.alreadySubmitted) {
        return res.json({ success: true, message: result.message });
      }

      // Re-fetch application after submit
      const submittedApp = await this.validateAccess(req, res);
      const reviewData = await publicApplicationStatusService.getReview(submittedApp);

      res.json({
        success: true,
        message: 'Pendaftaran berhasil dikirim.',
        data: reviewData.application
      });
    } catch (err) {
      if (err.errors) {
        return res.status(err.status || 422).json({
          success: false,
          message: err.message,
          errors: err.errors
        });
      }
      next(err);
    }
  }
}

module.exports = new PublicApplicationSubmitController();
