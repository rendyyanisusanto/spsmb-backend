const express = require('express');
const router = express.Router();
const crmLeadController = require('../controllers/crmLeadController');
const crmFollowUpController = require('../controllers/crmFollowUpController');
const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');

const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'ADMIN_SPSMB', 'PETUGAS'));

// Import endpoints (Placed before /:id)
router.get('/import/template', crmLeadController.downloadTemplate);
router.post('/import', upload.single('file'), crmLeadController.importLeads);

// Lookup endpoints
router.get('/statuses', crmLeadController.getStatusOptions);
router.get('/officers', crmLeadController.getOfficerOptions);

// Lead CRUD & Status
router.get('/', crmLeadController.getLeads);
router.post('/', crmLeadController.createLead);
router.get('/:id', crmLeadController.getLeadById);
router.put('/:id', crmLeadController.updateLead);
router.delete('/:id', crmLeadController.deleteLead);
router.patch('/:id/status', crmLeadController.updateLeadStatus);
router.get('/:id/status-histories', crmLeadController.getStatusHistories);

// Lead Follow-up & WhatsApp (Sprint 2)
router.get('/:id/activities', crmFollowUpController.getActivities);
router.post('/:id/activities', crmFollowUpController.addActivity);
router.post('/:id/schedule', crmFollowUpController.updateSchedule);
router.post('/:id/preview-message', crmFollowUpController.previewMessage);
router.post('/:id/whatsapp', crmFollowUpController.sendWhatsApp);

module.exports = router;
