
const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');

const targetController = require('../controllers/formTargetController');
const sectionController = require('../controllers/formSectionController');
const fieldController = require('../controllers/formFieldController');
const configController = require('../controllers/formConfigController');

router.use(authenticate);

// Target
router.get('/form-targets', targetController.getAll);
router.get('/form-targets/:id', targetController.getById);
router.post('/form-targets', targetController.create);
router.put('/form-targets/:id', targetController.update);
router.patch('/form-targets/:id/status', targetController.updateStatus);

// Section
router.get('/form-sections', sectionController.getAll);
router.get('/form-sections/:id', sectionController.getById);
router.post('/form-sections', sectionController.create);
router.put('/form-sections/:id', sectionController.update);
router.patch('/form-sections/:id/status', sectionController.updateStatus);
router.delete('/form-sections/:id', sectionController.delete);

// Field
router.get('/form-fields', fieldController.getAll);
router.get('/form-fields/:id', fieldController.getById);
router.post('/form-fields', fieldController.create);
router.put('/form-fields/:id', fieldController.update);
router.patch('/form-fields/:id/status', fieldController.updateStatus);
router.patch('/form-fields/:id/required', fieldController.updateRequired);
router.patch('/form-fields/:id/order', fieldController.updateOrder);
router.delete('/form-fields/:id', fieldController.delete);

// Config
router.get('/form-config/effective', configController.getEffectiveForm);

module.exports = router;
