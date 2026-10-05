const applicationService = require('../services/applicationService');
const applicationStatusService = require('../services/applicationStatusService');
const { successResponse, successListResponse, errorResponse } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

class ApplicationController {
  getApplications = asyncHandler(async (req, res) => {
    const params = {
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
      status: req.query.status,
      registrationType: req.query.registrationType,
      formalInstitutionId: req.query.formalInstitutionId,
      pondokInstitutionId: req.query.pondokInstitutionId,
      admissionPeriodId: req.query.admissionPeriodId,
      admissionWaveId: req.query.admissionWaveId,
      gender: req.query.gender,
      informationSourceId: req.query.informationSourceId,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      sortBy: req.query.sortBy,
      sortOrder: req.query.sortOrder
    };

    const result = await applicationService.getApplications(params, req.user);
    
    return successListResponse(res, 200, 'Applications retrieved successfully', result.data, result.meta);
  });

  exportData = asyncHandler(async (req, res) => {
    const params = {
      search: req.query.search,
      status: req.query.status,
      registrationType: req.query.registrationType,
      formalInstitutionId: req.query.formalInstitutionId,
      pondokInstitutionId: req.query.pondokInstitutionId,
      admissionPeriodId: req.query.admissionPeriodId,
      admissionWaveId: req.query.admissionWaveId,
      gender: req.query.gender,
      informationSourceId: req.query.informationSourceId,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      sortBy: req.query.sortBy,
      sortOrder: req.query.sortOrder
    };

    const result = await applicationService.exportApplications(params, req.user);
    
    return successResponse(res, 200, 'Applications export data retrieved successfully', result);
  });

  getApplicationDetail = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    try {
      const result = await applicationService.getApplicationDetail(id, req.user);
      return successResponse(res, 200, 'Application detail retrieved successfully', result);
    } catch (error) {
      if (error.statusCode) {
        return errorResponse(res, error.statusCode, error.message);
      }
      throw error;
    }
  });

  getApplicationByRegistrationNumber = asyncHandler(async (req, res) => {
    const { registrationNumber } = req.params;
    
    try {
      const result = await applicationService.getApplicationDetail(registrationNumber, req.user, true);
      return successResponse(res, 200, 'Application detail retrieved successfully', result);
    } catch (error) {
      if (error.statusCode) {
        return errorResponse(res, error.statusCode, error.message);
      }
      throw error;
    }
  });

  getStatusHistory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    try {
      const result = await applicationService.getStatusHistory(id, req.user);
      return successResponse(res, 200, 'Status history retrieved successfully', result);
    } catch (error) {
      if (error.statusCode) {
        return errorResponse(res, error.statusCode, error.message);
      }
      throw error;
    }
  });

  updateStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['DRAFT', 'SUBMITTED', 'CANCELLED'].includes(status)) {
      return errorResponse(res, 422, 'Invalid status');
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    try {
      const result = await applicationStatusService.updateStatus(id, status, req.user, ipAddress, userAgent);
      return successResponse(res, 200, 'Status updated successfully', { status: result.status });
    } catch (error) {
      if (error.statusCode) {
        return errorResponse(res, error.statusCode, error.message);
      }
      throw error;
    }
  });
}

module.exports = new ApplicationController();
