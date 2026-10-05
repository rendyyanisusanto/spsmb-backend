
const express = require('express');
const router = express.Router();
const docTypeController = require('../controllers/documentTypeController');
const docReqController = require('../controllers/documentRequirementController');
const authenticate = require('../middlewares/authenticate');

router.use(authenticate);

// Document Types
router.get('/document-types', docTypeController.getAll);
router.get('/document-types/:id', docTypeController.getById);
router.post('/document-types', docTypeController.create);
router.put('/document-types/:id', docTypeController.update);
router.patch('/document-types/:id/status', docTypeController.updateStatus);
router.delete('/document-types/:id', docTypeController.remove);

// Document Requirements
router.get('/document-requirements/effective', docReqController.getEffective); // Must be before /:id
router.get('/document-requirements', docReqController.getAll);
router.get('/document-requirements/:id', docReqController.getById);
router.post('/document-requirements', docReqController.create);
router.put('/document-requirements/reorder', docReqController.reorder); // Must be before /:id ? No wait, let's change path if conflicts
// Actually, /document-requirements/reorder is matched, but let's be careful. Express matches in order.
router.put('/document-requirements/:id', docReqController.update);
router.patch('/document-requirements/:id/required', docReqController.updateRequired);
router.patch('/document-requirements/:id/order', docReqController.updateOrder);
router.delete('/document-requirements/:id', docReqController.remove);

module.exports = router;
