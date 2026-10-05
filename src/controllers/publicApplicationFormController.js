const publicApplicationFormService = require('../services/publicApplicationFormService');

class PublicApplicationFormController {
  async getForm(req, res, next) {
    try {
      const { registrationNumber } = req.params;
      const rawContinueToken = req.headers['x-continue-token'];

      if (!rawContinueToken) {
        return res.status(401).json({ success: false, message: 'Token otorisasi tidak ditemukan.' });
      }

      const form = await publicApplicationFormService.getForm(registrationNumber, rawContinueToken);
      
      res.json({
        success: true,
        data: form
      });
    } catch (error) {
      next(error);
    }
  }

  async saveSection(req, res, next) {
    try {
      const { registrationNumber, sectionId } = req.params;
      const rawContinueToken = req.headers['x-continue-token'];
      const { answers, isCompleteAction } = req.body;

      if (!rawContinueToken) {
        return res.status(401).json({ success: false, message: 'Token otorisasi tidak ditemukan.' });
      }

      const result = await publicApplicationFormService.saveSection(
        registrationNumber, 
        rawContinueToken, 
        sectionId, 
        answers || [],
        isCompleteAction
      );

      res.json({
        success: true,
        message: 'Data berhasil disimpan.',
        data: {
          stepCompleted: result.stepCompleted,
          lastSavedAt: result.lastSavedAt
        }
      });
    } catch (error) {
      if (error.status === 422 && error.errors) {
        return res.status(422).json({
          success: false,
          message: error.message,
          errors: error.errors
        });
      }
      next(error);
    }
  }
}

module.exports = new PublicApplicationFormController();
