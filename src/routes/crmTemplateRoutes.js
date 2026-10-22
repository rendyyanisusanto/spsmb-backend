const express = require('express');
const router = express.Router();
const crmTemplateController = require('../controllers/crmTemplateController');
const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');

router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'ADMIN_SPSMB', 'PETUGAS'));

// Metadata & preview endpoints
router.get('/categories', crmTemplateController.getCategories);
router.get('/placeholders', crmTemplateController.getPlaceholders);
router.post('/preview', crmTemplateController.previewTemplate);

// Template CRUD
router.get('/', crmTemplateController.getTemplates);
router.post('/', crmTemplateController.createTemplate);
router.get('/:id', crmTemplateController.getTemplateById);
router.put('/:id', crmTemplateController.updateTemplate);
router.patch('/:id/status', crmTemplateController.toggleStatus);
router.delete('/:id', crmTemplateController.deleteTemplate);

module.exports = router;
