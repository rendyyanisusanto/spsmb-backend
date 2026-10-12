const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');

// Only SUPER_ADMIN and ADMIN_SPSMB can access audit logs
router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'ADMIN_SPSMB'));

router.get('/', auditController.getAuditLogs);
router.get('/:id', auditController.getAuditLogById);

module.exports = router;
