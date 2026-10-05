const express = require('express');
const router = express.Router();
const applicationController = require('../controllers/applicationController');
const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');

router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'ADMIN_SPSMB'));

router.get('/', applicationController.getApplications);
router.get('/export', applicationController.exportData);
router.get('/:id', applicationController.getApplicationDetail);
router.get('/by-registration/:registrationNumber', applicationController.getApplicationByRegistrationNumber);
router.get('/:id/status-history', applicationController.getStatusHistory);
router.patch('/:id/status', applicationController.updateStatus);

module.exports = router;
