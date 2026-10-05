const express = require('express');
const router = express.Router();
const institutionController = require('../controllers/institutionController');
const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');

router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'ADMIN_SPSMB'));

router.get('/', institutionController.getInstitutions);
router.post('/', institutionController.createInstitution);
router.get('/:id', institutionController.getInstitutionById);
router.put('/:id', institutionController.updateInstitution);
router.patch('/:id/status', institutionController.updateStatus);

module.exports = router;
