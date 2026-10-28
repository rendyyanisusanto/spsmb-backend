const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crmSchoolTargetController = require('../controllers/crmSchoolTargetController');
const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');

// --- Multer Storage Configuration ---
const createDirIfNotExist = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Storage for Letter Settings (logo & signature images)
const letterSettingsStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    let subfolder = 'letterheads';
    if (file.fieldname.includes('signature')) {
      subfolder = 'signatures';
    }
    const targetDir = path.join(process.cwd(), 'storage', 'crm-school', subfolder);
    createDirIfNotExist(targetDir);
    cb(null, targetDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const cleanField = file.fieldname.replace(/[^a-zA-Z0-9_-]/g, '');
    cb(null, `${cleanField}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`);
  }
});

const imageFileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const err = new Error('Format file tidak didukung. Harap unggah gambar bertipe PNG, JPG, JPEG, WEBP, atau SVG.');
    err.statusCode = 422;
    cb(err, false);
  }
};

const uploadLetterAssets = multer({
  storage: letterSettingsStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: imageFileFilter
}).fields([
  { name: 'logo', maxCount: 1 },
  { name: 'letterhead_image', maxCount: 1 },
  { name: 'principal_signature', maxCount: 1 },
  { name: 'spmb_chair_signature', maxCount: 1 }
]);

// Storage for Presentation Documentation Photos
const photoStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const targetDir = path.join(process.cwd(), 'storage', 'crm-school', 'photos');
    createDirIfNotExist(targetDir);
    cb(null, targetDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `pres_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`);
  }
});

const uploadReportPhotos = multer({
  storage: photoStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per photo
  fileFilter: imageFileFilter
}).array('photos', 10);

// Global Middleware: Authentication required for all routes
router.use(authenticate);

// -------------------------------------------------------------
// 1. LETTER SETTINGS (Order matters: put specific routes before :id)
// -------------------------------------------------------------
router.get(
  '/letter-settings/active',
  authorize('SUPER_ADMIN', 'ADMIN_SPSMB', 'PETUGAS'),
  crmSchoolTargetController.getActiveLetterSettings
);

router.put(
  '/letter-settings',
  authorize('SUPER_ADMIN', 'ADMIN_SPSMB'), // Restricted: only SUPER_ADMIN & ADMIN_SPSMB
  uploadLetterAssets,
  crmSchoolTargetController.updateLetterSettings
);

// -------------------------------------------------------------
// 2. GENERAL LOOKUPS & STATS
// -------------------------------------------------------------
router.get(
  '/stats',
  authorize('SUPER_ADMIN', 'ADMIN_SPSMB', 'PETUGAS'),
  crmSchoolTargetController.getTargetStats
);

router.get(
  '/check-duplicate',
  authorize('SUPER_ADMIN', 'ADMIN_SPSMB', 'PETUGAS'),
  crmSchoolTargetController.checkDuplicate
);

// Single letter lookup by letter ID
router.get(
  '/letters/:letterId',
  authorize('SUPER_ADMIN', 'ADMIN_SPSMB', 'PETUGAS'),
  crmSchoolTargetController.getLetterById
);

// Single report lookup / update / delete by report ID
router.get(
  '/reports/:reportId',
  authorize('SUPER_ADMIN', 'ADMIN_SPSMB', 'PETUGAS'),
  crmSchoolTargetController.getReportById
);

router.put(
  '/reports/:reportId',
  authorize('SUPER_ADMIN', 'ADMIN_SPSMB', 'PETUGAS'),
  crmSchoolTargetController.updateReport
);

router.delete(
  '/reports/:reportId',
  authorize('SUPER_ADMIN', 'ADMIN_SPSMB', 'PETUGAS'),
  crmSchoolTargetController.deleteReport
);

// Upload photos to a report
router.post(
  '/reports/:reportId/photos',
  authorize('SUPER_ADMIN', 'ADMIN_SPSMB', 'PETUGAS'),
  uploadReportPhotos,
  crmSchoolTargetController.uploadPhotos
);

// Delete photo
router.delete(
  '/photos/:photoId',
  authorize('SUPER_ADMIN', 'ADMIN_SPSMB', 'PETUGAS'),
  crmSchoolTargetController.deletePhoto
);

// -------------------------------------------------------------
// 3. TARGET SEKOLAH CRUD
// -------------------------------------------------------------
router.get(
  '/',
  authorize('SUPER_ADMIN', 'ADMIN_SPSMB', 'PETUGAS'),
  crmSchoolTargetController.getTargets
);

router.post(
  '/',
  authorize('SUPER_ADMIN', 'ADMIN_SPSMB', 'PETUGAS'),
  crmSchoolTargetController.createTarget
);

router.get(
  '/:id',
  authorize('SUPER_ADMIN', 'ADMIN_SPSMB', 'PETUGAS'),
  crmSchoolTargetController.getTargetById
);

router.put(
  '/:id',
  authorize('SUPER_ADMIN', 'ADMIN_SPSMB', 'PETUGAS'),
  crmSchoolTargetController.updateTarget
);

router.patch(
  '/:id/status',
  authorize('SUPER_ADMIN', 'ADMIN_SPSMB', 'PETUGAS'),
  crmSchoolTargetController.updateStatus
);

router.delete(
  '/:id',
  authorize('SUPER_ADMIN', 'ADMIN_SPSMB', 'PETUGAS'),
  crmSchoolTargetController.deleteTarget
);

router.get(
  '/:id/status-histories',
  authorize('SUPER_ADMIN', 'ADMIN_SPSMB', 'PETUGAS'),
  crmSchoolTargetController.getStatusHistories
);

// -------------------------------------------------------------
// 4. LETTERS (FOR A SPECIFIC TARGET)
// -------------------------------------------------------------
router.post(
  '/:id/letters/preview',
  authorize('SUPER_ADMIN', 'ADMIN_SPSMB', 'PETUGAS'),
  crmSchoolTargetController.previewLetter
);

router.post(
  '/:id/letters',
  authorize('SUPER_ADMIN', 'ADMIN_SPSMB', 'PETUGAS'),
  crmSchoolTargetController.issueLetter
);

router.get(
  '/:id/letters',
  authorize('SUPER_ADMIN', 'ADMIN_SPSMB', 'PETUGAS'),
  crmSchoolTargetController.getLetters
);

// -------------------------------------------------------------
// 5. REPORTS (FOR A SPECIFIC TARGET)
// -------------------------------------------------------------
router.get(
  '/:id/reports',
  authorize('SUPER_ADMIN', 'ADMIN_SPSMB', 'PETUGAS'),
  crmSchoolTargetController.getReports
);

router.post(
  '/:id/reports',
  authorize('SUPER_ADMIN', 'ADMIN_SPSMB', 'PETUGAS'),
  crmSchoolTargetController.createReport
);

module.exports = router;
