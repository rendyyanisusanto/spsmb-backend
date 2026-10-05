const express = require('express');
const router = express.Router();
const institutionController = require('../controllers/institutionController');
const settingController = require('../controllers/settingController');
const publicRegistrationController = require('../controllers/publicRegistrationController');
const programController = require('../controllers/programController');
const publicLookupController = require('../controllers/publicLookupController');
const publicApplicationController = require('../controllers/publicApplicationController');
const publicApplicationFormController = require('../controllers/publicApplicationFormController');

router.get('/institutions', institutionController.getPublicInstitutions);
router.get('/settings', settingController.getPublicSettings);
router.get('/registration-period', publicRegistrationController.getCurrentPeriod);
router.get('/institutions/:institutionId/programs', programController.getPublicPrograms);

router.get('/information-sources', publicLookupController.getInformationSources);
router.post('/applications', publicApplicationController.createApplication);
router.get('/applications/:registrationNumber/receipt', publicApplicationController.getReceipt);

// Application Form (Sprint 19)
router.get('/applications/:registrationNumber/form', publicApplicationFormController.getForm);
router.put('/applications/:registrationNumber/form/sections/:sectionId', publicApplicationFormController.saveSection);

// Documents (Sprint 20)
const multer = require('multer');
const upload = multer({ dest: require('os').tmpdir() });
const publicDocumentController = require('../controllers/publicDocumentController');

router.get('/applications/:registrationNumber/documents', (req, res, next) => publicDocumentController.getDocuments(req, res, next));
router.post('/applications/:registrationNumber/documents/:documentTypeId', upload.single('file'), (req, res, next) => publicDocumentController.uploadDocument(req, res, next));
router.put('/applications/:registrationNumber/documents/:documentTypeId', upload.single('file'), (req, res, next) => publicDocumentController.uploadDocument(req, res, next));
router.delete('/applications/:registrationNumber/documents/:documentTypeId', (req, res, next) => publicDocumentController.deleteDocument(req, res, next));
router.get('/applications/:registrationNumber/documents/:documentTypeId/file', (req, res, next) => publicDocumentController.viewDocument(req, res, next));

// Final Submit & Status (Sprint 21)
const publicApplicationSubmitController = require('../controllers/publicApplicationSubmitController');
router.get('/applications/:registrationNumber/completeness', (req, res, next) => publicApplicationSubmitController.getCompleteness(req, res, next));
router.get('/applications/:registrationNumber/review', (req, res, next) => publicApplicationSubmitController.getReview(req, res, next));
router.get('/applications/:registrationNumber/status', (req, res, next) => publicApplicationSubmitController.getStatus(req, res, next));
router.get('/applications/:registrationNumber/summary', (req, res, next) => publicApplicationSubmitController.getReview(req, res, next)); // alias to review
router.post('/applications/:registrationNumber/submit', (req, res, next) => publicApplicationSubmitController.submitApplication(req, res, next));

module.exports = router;
