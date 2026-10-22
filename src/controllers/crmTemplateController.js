const crmTemplateService = require('../services/crmTemplateService');
const { successResponse, successListResponse } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

class CrmTemplateController {
  getTemplates = asyncHandler(async (req, res) => {
    const params = {
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
      institutionId: req.query.institutionId,
      eventKey: req.query.eventKey,
      isActive: req.query.isActive,
      includeGlobal: req.query.includeGlobal !== 'false',
      sortBy: req.query.sortBy,
      sortOrder: req.query.sortOrder
    };

    const result = await crmTemplateService.getTemplates(params, req.user);
    return successListResponse(res, 200, 'Daftar template WhatsApp CRM berhasil diambil.', result.data, result.meta);
  });

  getTemplateById = asyncHandler(async (req, res) => {
    const template = await crmTemplateService.getTemplateById(req.params.id, req.user);
    return successResponse(res, 200, 'Detail template WhatsApp CRM berhasil diambil.', template);
  });

  createTemplate = asyncHandler(async (req, res) => {
    const template = await crmTemplateService.createTemplate(req.body, req.user, req);
    return successResponse(res, 201, 'Template WhatsApp CRM baru berhasil dibuat.', template);
  });

  updateTemplate = asyncHandler(async (req, res) => {
    const template = await crmTemplateService.updateTemplate(req.params.id, req.body, req.user, req);
    return successResponse(res, 200, 'Template WhatsApp CRM berhasil diperbarui.', template);
  });

  toggleStatus = asyncHandler(async (req, res) => {
    const { isActive } = req.body;
    const template = await crmTemplateService.toggleStatus(req.params.id, isActive, req.user, req);
    return successResponse(res, 200, `Status template berhasil ${template.isActive ? 'diaktifkan' : 'dinonaktifkan'}.`, template);
  });

  deleteTemplate = asyncHandler(async (req, res) => {
    await crmTemplateService.deleteTemplate(req.params.id, req.user, req);
    return successResponse(res, 200, 'Template WhatsApp CRM berhasil dihapus.');
  });

  previewTemplate = asyncHandler(async (req, res) => {
    const { messageBody, overrides } = req.body;
    const result = crmTemplateService.previewTemplate(messageBody, overrides);
    return successResponse(res, 200, 'Hasil preview template berhasil diuji.', result);
  });

  getCategories = asyncHandler(async (req, res) => {
    const categories = crmTemplateService.getCategories();
    return successResponse(res, 200, 'Daftar kategori template berhasil diambil.', categories);
  });

  getPlaceholders = asyncHandler(async (req, res) => {
    const placeholders = crmTemplateService.getPlaceholders();
    return successResponse(res, 200, 'Daftar variabel template berhasil diambil.', placeholders);
  });
}

module.exports = new CrmTemplateController();
