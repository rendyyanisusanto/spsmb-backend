
const express = require('express');
const router = express.Router();
const controller = require('../controllers/whatsappTemplateController');
const authenticate = require('../middlewares/authenticate');

router.use(authenticate);

router.get('/events', controller.getEvents);
router.get('/variables', controller.getVariables);
router.post('/preview', controller.preview);
router.get('/resolve', controller.resolve);

router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.patch('/:id/status', controller.updateStatus);
router.post('/:id/duplicate', controller.duplicate);
router.post('/:id/use-global', controller.useGlobal);
router.delete('/:id', controller.remove);

module.exports = router;
