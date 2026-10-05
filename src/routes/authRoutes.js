const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');

router.post('/login', authController.login);
router.get('/me', authenticate, authController.me);
router.post('/logout', authenticate, authController.logout);

// Test routes (can be removed later)
router.get('/test-super-admin', authenticate, authorize('SUPER_ADMIN'), (req, res) => {
  res.json({ success: true, message: 'Super Admin Access OK' });
});

router.get('/test-admin', authenticate, authorize('SUPER_ADMIN', 'ADMIN_SPSMB'), (req, res) => {
  res.json({ success: true, message: 'Admin SPSMB Access OK' });
});

module.exports = router;
