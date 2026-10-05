const express = require('express');
const router = express.Router();
const settingController = require('../controllers/settingController');
const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');

router.use(authenticate);
router.use(authorize('SUPER_ADMIN'));

router.get('/', settingController.getSettings);
router.put('/', settingController.updateSettings);

module.exports = router;
