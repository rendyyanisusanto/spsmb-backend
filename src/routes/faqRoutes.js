const express = require('express');
const router = express.Router();
const faqController = require('../controllers/faqController');
const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');

router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'ADMIN_SPSMB'));

router.get('/', faqController.getAllFaqs);
router.get('/:id', faqController.getFaqDetail);
router.post('/', faqController.createFaq);
router.put('/:id', faqController.updateFaq);
router.delete('/:id', faqController.deleteFaq);

module.exports = router;
