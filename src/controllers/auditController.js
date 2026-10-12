const auditService = require('../services/auditService');
const response = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

class AuditController {
  getAuditLogs = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 20;
    if (limit > 100) limit = 100;

    const filters = {
      action: req.query.action,
      entityType: req.query.entityType,
      userId: req.query.userId,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      search: req.query.search,
      sortBy: req.query.sortBy,
      sortOrder: req.query.sortOrder
    };

    const result = await auditService.findAll(req.user, filters, page, limit);

    return response.successListResponse(res, 200, 'Audit log berhasil diambil.', result.data, result.meta);
  });

  getAuditLogById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const log = await auditService.findById(id, req.user);

    if (!log) {
      return response.errorResponse(res, 404, 'Audit log tidak ditemukan.');
    }

    return response.successResponse(res, 200, 'Audit log berhasil diambil.', log);
  });
}

module.exports = new AuditController();
