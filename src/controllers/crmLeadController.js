const crmLeadService = require('../services/crmLeadService');
const { successResponse, successListResponse, errorResponse } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

class CrmLeadController {
  getLeads = asyncHandler(async (req, res) => {
    const params = {
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
      status: req.query.status,
      institutionId: req.query.institutionId,
      leadByUserId: req.query.leadByUserId,
      sortBy: req.query.sortBy,
      sortOrder: req.query.sortOrder
    };

    const result = await crmLeadService.getLeads(params, req.user);
    return successListResponse(res, 200, 'Data lead berhasil diambil.', result.data, result.meta);
  });

  getLeadStats = asyncHandler(async (req, res) => {
    const params = {
      institutionId: req.query.institutionId,
      leadByUserId: req.query.leadByUserId,
      search: req.query.search
    };

    const stats = await crmLeadService.getLeadStats(params, req.user);
    return successResponse(res, 200, 'Statistik lead berhasil diambil.', stats);
  });

  getLeadById = asyncHandler(async (req, res) => {
    const lead = await crmLeadService.getLeadById(req.params.id, req.user);
    return successResponse(res, 200, 'Detail lead berhasil diambil.', lead);
  });

  createLead = asyncHandler(async (req, res) => {
    const lead = await crmLeadService.createLead(req.body, req.user, req);
    return successResponse(res, 201, 'Lead baru berhasil ditambahkan.', lead);
  });

  updateLead = asyncHandler(async (req, res) => {
    const lead = await crmLeadService.updateLead(req.params.id, req.body, req.user, req);
    return successResponse(res, 200, 'Data lead berhasil diperbarui.', lead);
  });

  updateLeadStatus = asyncHandler(async (req, res) => {
    const { status, notes } = req.body;
    const lead = await crmLeadService.updateLeadStatus(req.params.id, { status, notes }, req.user, req);
    return successResponse(res, 200, 'Status lead berhasil diperbarui.', lead);
  });

  deleteLead = asyncHandler(async (req, res) => {
    await crmLeadService.deleteLead(req.params.id, req.user, req);
    return successResponse(res, 200, 'Lead berhasil dihapus.');
  });

  getStatusHistories = asyncHandler(async (req, res) => {
    const histories = await crmLeadService.getStatusHistories(req.params.id, req.user);
    return successResponse(res, 200, 'Riwayat status lead berhasil diambil.', histories);
  });

  getStatusOptions = asyncHandler(async (req, res) => {
    const statuses = crmLeadService.getStatusOptions();
    return successResponse(res, 200, 'Daftar status lead berhasil diambil.', statuses);
  });

  getOfficerOptions = asyncHandler(async (req, res) => {
    const officers = await crmLeadService.getOfficerOptions(req.user);
    return successResponse(res, 200, 'Daftar petugas lead berhasil diambil.', officers);
  });

  importLeads = asyncHandler(async (req, res) => {
    const result = await crmLeadService.importLeads(req.body, req.file, req.user, req);
    return successResponse(res, 200, `Berhasil memproses import: ${result.importedCount} lead tersimpan.`, result);
  });

  downloadTemplate = asyncHandler(async (req, res) => {
    const buffer = crmLeadService.generateImportTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Template_Import_Lead_SPSMB.xlsx"');
    return res.send(buffer);
  });
}

module.exports = new CrmLeadController();
