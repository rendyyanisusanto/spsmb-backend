const path = require('path');
const fs = require('fs');
const crmSchoolTargetService = require('../services/crmSchoolTargetService');
const { successResponse, successListResponse } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

class CrmSchoolTargetController {
  // --- Target Sekolah ---
  getTargets = asyncHandler(async (req, res) => {
    const params = {
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
      status: req.query.status,
      educationLevel: req.query.educationLevel,
      cityRegency: req.query.cityRegency,
      district: req.query.district,
      scheduled: req.query.scheduled,
      sortBy: req.query.sortBy,
      sortOrder: req.query.sortOrder
    };

    const result = await crmSchoolTargetService.getTargets(params);
    return successListResponse(res, 200, 'Data target sekolah berhasil diambil.', result.data, result.meta);
  });

  getTargetStats = asyncHandler(async (req, res) => {
    const params = {
      search: req.query.search,
      educationLevel: req.query.educationLevel,
      cityRegency: req.query.cityRegency,
      district: req.query.district
    };
    const stats = await crmSchoolTargetService.getTargetStats(params);
    return successResponse(res, 200, 'Statistik target sekolah berhasil diambil.', stats);
  });

  checkDuplicate = asyncHandler(async (req, res) => {
    const { name, city, excludeId } = req.query;
    const duplicates = await crmSchoolTargetService.checkDuplicate(name, city, excludeId);
    return successResponse(res, 200, 'Pemeriksaan potensi duplikat selesai.', {
      has_potential_duplicate: duplicates.length > 0,
      duplicates
    });
  });

  getTargetById = asyncHandler(async (req, res) => {
    const target = await crmSchoolTargetService.getTargetById(req.params.id);
    return successResponse(res, 200, 'Detail target sekolah berhasil diambil.', target);
  });

  createTarget = asyncHandler(async (req, res) => {
    const target = await crmSchoolTargetService.createTarget(req.body, req.user, req);
    return successResponse(res, 201, 'Target sekolah baru berhasil ditambahkan.', target);
  });

  updateTarget = asyncHandler(async (req, res) => {
    const target = await crmSchoolTargetService.updateTarget(req.params.id, req.body, req.user, req);
    return successResponse(res, 200, 'Data target sekolah berhasil diperbarui.', target);
  });

  updateStatus = asyncHandler(async (req, res) => {
    const target = await crmSchoolTargetService.updateStatus(req.params.id, req.body, req.user, req);
    return successResponse(res, 200, 'Status target sekolah berhasil diperbarui.', target);
  });

  deleteTarget = asyncHandler(async (req, res) => {
    const result = await crmSchoolTargetService.deleteTarget(req.params.id, req.user, req);
    return successResponse(res, 200, result.message);
  });

  getStatusHistories = asyncHandler(async (req, res) => {
    const histories = await crmSchoolTargetService.getStatusHistories(req.params.id);
    return successResponse(res, 200, 'Riwayat status target sekolah berhasil diambil.', histories);
  });

  // --- Letter Settings ---
  getActiveLetterSettings = asyncHandler(async (req, res) => {
    const settings = await crmSchoolTargetService.getActiveLetterSettings();
    return successResponse(res, 200, 'Konfigurasi surat presentasi berhasil diambil.', settings);
  });

  updateLetterSettings = asyncHandler(async (req, res) => {
    const payload = { ...req.body };

    // Process uploaded logo, full letterhead banner, and signature images if present
    if (req.files) {
      if (req.files.letterhead_image && req.files.letterhead_image[0]) {
        const file = req.files.letterhead_image[0];
        payload.letterhead_image_path = `/storage/crm-school/letterheads/${file.filename}`;
      }
      if (req.files.logo && req.files.logo[0]) {
        const file = req.files.logo[0];
        payload.letterhead_logo_path = `/storage/crm-school/letterheads/${file.filename}`;
      }
      if (req.files.principal_signature && req.files.principal_signature[0]) {
        const file = req.files.principal_signature[0];
        payload.principal_signature_path = `/storage/crm-school/signatures/${file.filename}`;
      }
      if (req.files.spmb_chair_signature && req.files.spmb_chair_signature[0]) {
        const file = req.files.spmb_chair_signature[0];
        payload.spmb_chair_signature_path = `/storage/crm-school/signatures/${file.filename}`;
      }
    }

    if (payload.remove_letterhead_image === 'true' || payload.remove_letterhead_image === true) {
      payload.letterhead_image_path = null;
    }

    const updated = await crmSchoolTargetService.updateLetterSettings(payload, req.user, req);
    return successResponse(res, 200, 'Konfigurasi surat berhasil diperbarui.', updated);
  });

  // --- Letter Issuance & Preview ---
  previewLetter = asyncHandler(async (req, res) => {
    const preview = await crmSchoolTargetService.previewLetter(req.params.id, req.body);
    return successResponse(res, 200, 'Pratinjau surat permohonan presentasi berhasil dibuat.', preview);
  });

  issueLetter = asyncHandler(async (req, res) => {
    const letter = await crmSchoolTargetService.issueLetter(req.params.id, req.body, req.user, req);
    return successResponse(res, 201, 'Surat permohonan presentasi berhasil diterbitkan.', letter);
  });

  getLetters = asyncHandler(async (req, res) => {
    const letters = await crmSchoolTargetService.getLetters(req.params.id);
    return successResponse(res, 200, 'Riwayat surat permohonan presentasi berhasil diambil.', letters);
  });

  getLetterById = asyncHandler(async (req, res) => {
    const letter = await crmSchoolTargetService.getLetterById(req.params.letterId);
    return successResponse(res, 200, 'Detail snapshot surat berhasil diambil.', letter);
  });

  // --- Presentation Reports ---
  getReports = asyncHandler(async (req, res) => {
    const reports = await crmSchoolTargetService.getReports(req.params.id);
    return successResponse(res, 200, 'Daftar laporan presentasi berhasil diambil.', reports);
  });

  getReportById = asyncHandler(async (req, res) => {
    const report = await crmSchoolTargetService.getReportById(req.params.reportId);
    return successResponse(res, 200, 'Detail laporan presentasi berhasil diambil.', report);
  });

  createReport = asyncHandler(async (req, res) => {
    const report = await crmSchoolTargetService.createReport(req.params.id, req.body, req.user, req);
    return successResponse(res, 201, 'Laporan presentasi berhasil ditambahkan.', report);
  });

  updateReport = asyncHandler(async (req, res) => {
    const report = await crmSchoolTargetService.updateReport(req.params.reportId, req.body, req.user, req);
    return successResponse(res, 200, 'Laporan presentasi berhasil diperbarui.', report);
  });

  deleteReport = asyncHandler(async (req, res) => {
    const result = await crmSchoolTargetService.deleteReport(req.params.reportId, req.user, req);
    return successResponse(res, 200, result.message);
  });

  // --- Photos ---
  uploadPhotos = asyncHandler(async (req, res) => {
    const reportId = req.params.reportId;
    if (!req.files || req.files.length === 0) {
      const err = new Error('Tidak ada file foto yang diunggah.');
      err.statusCode = 422;
      throw err;
    }

    const uploadedPhotos = [];
    const captions = req.body.captions || [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const caption = Array.isArray(captions) ? (captions[i] || '') : (captions || '');
      const photoRecord = await crmSchoolTargetService.addPhotoToReport(
        reportId,
        {
          file_path: `/storage/crm-school/photos/${file.filename}`,
          original_filename: file.originalname,
          mime_type: file.mimetype,
          file_size_bytes: file.size,
          caption,
          sort_order: i
        },
        req.user,
        req
      );
      uploadedPhotos.push(photoRecord);
    }

    return successResponse(res, 201, 'Foto dokumentasi berhasil diunggah.', uploadedPhotos);
  });

  deletePhoto = asyncHandler(async (req, res) => {
    const result = await crmSchoolTargetService.deletePhoto(req.params.photoId, req.user, req);
    return successResponse(res, 200, result.message);
  });
}

module.exports = new CrmSchoolTargetController();
