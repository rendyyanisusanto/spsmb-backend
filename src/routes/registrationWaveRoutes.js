
const express = require('express');
const router = express.Router();
const controller = require('../controllers/registrationWaveController');
const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');

router.use(authenticate);

router.get('/', authorize('SUPER_ADMIN', 'ADMIN_SPSMB'), controller.getAll);
router.get('/:id', authorize('SUPER_ADMIN', 'ADMIN_SPSMB'), controller.getById);

router.post('/', authorize('SUPER_ADMIN'), controller.create);
router.put('/:id', authorize('SUPER_ADMIN'), controller.update);
router.patch('/:id/status', authorize('SUPER_ADMIN'), controller.updateStatus);

module.exports = router;
