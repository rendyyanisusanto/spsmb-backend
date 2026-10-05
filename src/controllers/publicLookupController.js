const informationSourceRepo = require('../repositories/informationSourceRepository');

class PublicLookupController {
  async getInformationSources(req, res, next) {
    try {
      const data = await informationSourceRepo.getActiveSources();
      res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PublicLookupController();
