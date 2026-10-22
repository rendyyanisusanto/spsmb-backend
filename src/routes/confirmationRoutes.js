const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const confirmationController = require('../controllers/confirmationController');
const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(process.cwd(), 'storage', 'payments');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `proof_${Date.now()}_${Math.floor(Math.random() * 1000)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'ADMIN_SPSMB', 'PETUGAS'));

// Master Tracks
router.get('/tracks', confirmationController.getTracks);
router.post('/tracks', authorize('SUPER_ADMIN', 'ADMIN_SPSMB'), confirmationController.createTrack);
router.put('/tracks/:id', authorize('SUPER_ADMIN', 'ADMIN_SPSMB'), confirmationController.updateTrack);
router.delete('/tracks/:id', authorize('SUPER_ADMIN', 'ADMIN_SPSMB'), confirmationController.deleteTrack);

// Master Fee Components
router.get('/fee-components', confirmationController.getFeeComponents);
router.post('/fee-components', authorize('SUPER_ADMIN', 'ADMIN_SPSMB'), confirmationController.createFeeComponent);
router.put('/fee-components/:id', authorize('SUPER_ADMIN', 'ADMIN_SPSMB'), confirmationController.updateFeeComponent);
router.delete('/fee-components/:id', authorize('SUPER_ADMIN', 'ADMIN_SPSMB'), confirmationController.deleteFeeComponent);

// Confirmation Process
router.get('/applicants', confirmationController.getApplicants);
router.get('/applicants/:applicationId', confirmationController.getConfirmationDetail);
router.post('/start', confirmationController.startConfirmation);
router.post('/:confirmationId/documents/verify', confirmationController.verifyDocument);
router.post('/:confirmationId/payments', upload.single('proof'), confirmationController.addPayment);
router.post('/payments/:paymentId/verify', confirmationController.verifyPayment);
router.post('/:confirmationId/finalize', authorize('SUPER_ADMIN', 'ADMIN_SPSMB'), confirmationController.finalizeAdmission);
router.post('/:confirmationId/cancel', authorize('SUPER_ADMIN', 'ADMIN_SPSMB'), confirmationController.cancelAdmission);

// Official Students List
router.get('/official-students', confirmationController.getOfficialStudents);

module.exports = router;
