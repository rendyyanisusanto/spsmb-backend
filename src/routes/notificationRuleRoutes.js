/**
 * Notification Rule Routes
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/notificationRuleController');
const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');

router.use(authenticate);

// View routes (SUPER_ADMIN and ADMIN_SPSMB)
router.get('/', authorize('SUPER_ADMIN', 'ADMIN_SPSMB'), controller.getAll.bind(controller));
router.get('/:id', authorize('SUPER_ADMIN', 'ADMIN_SPSMB'), controller.getById.bind(controller));

// Modify routes (SUPER_ADMIN ONLY)
router.put('/:id', authorize('SUPER_ADMIN'), controller.updateRule.bind(controller));
router.post('/:id/recipients', authorize('SUPER_ADMIN'), controller.setRecipients.bind(controller));

module.exports = router;
