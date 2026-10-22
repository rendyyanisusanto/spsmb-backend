const crmFollowUpService = require('../services/crmFollowUpService');
const { successResponse } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

class CrmFollowUpController {
  getActivities = asyncHandler(async (req, res) => {
    const activities = await crmFollowUpService.getActivities(req.params.id, req.user);
    return successResponse(res, 200, 'Daftar riwayat follow-up lead berhasil diambil.', activities);
  });

  addActivity = asyncHandler(async (req, res) => {
    const activity = await crmFollowUpService.addActivity(req.params.id, req.body, req.user, req);
    return successResponse(res, 201, 'Aktivitas follow-up berhasil dicatat.', activity);
  });

  updateSchedule = asyncHandler(async (req, res) => {
    const result = await crmFollowUpService.updateSchedule(req.params.id, req.body, req.user, req);
    return successResponse(res, 200, 'Jadwal follow-up berhasil diperbarui.', result);
  });

  previewMessage = asyncHandler(async (req, res) => {
    const preview = await crmFollowUpService.previewLeadMessage(req.params.id, req.body, req.user);
    return successResponse(res, 200, 'Pratinjau pesan berhasil dibuat.', preview);
  });

  sendWhatsApp = asyncHandler(async (req, res) => {
    const result = await crmFollowUpService.sendManualWhatsApp(req.params.id, req.body, req.user, req);
    return successResponse(res, 200, result.message, result);
  });
}

module.exports = new CrmFollowUpController();
