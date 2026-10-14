/**
 * GOWA WhatsApp Gateway Routes
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/gowaController');
const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');

// Require authentication for all GOWA endpoints
router.use(authenticate);

// Health check endpoint: GET /api/v1/gowa/health
router.get(
  '/health',
  authorize('SUPER_ADMIN', 'ADMIN_SPSMB'),
  controller.getHealth.bind(controller)
);

// Connection & login status endpoint: GET /api/v1/gowa/status
router.get(
  '/status',
  authorize('SUPER_ADMIN', 'ADMIN_SPSMB'),
  controller.getStatus.bind(controller)
);

// Send test message: POST /api/v1/gowa/test-message
// Restricted to administrators only
router.post(
  '/test-message',
  authorize('SUPER_ADMIN', 'ADMIN_SPSMB'),
  controller.sendTestMessage.bind(controller)
);

module.exports = router;
