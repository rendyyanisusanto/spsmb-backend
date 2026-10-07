const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const authenticate = require('../middlewares/authenticate');

router.get('/stats', authenticate, dashboardController.getDashboardStats);

module.exports = router;
