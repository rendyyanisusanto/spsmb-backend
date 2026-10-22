const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const institutionController = require('../controllers/institutionController');
const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const instId = req.params.id || 'temp';
    const dir = path.join(process.cwd(), 'storage', 'institutions', instId.toString());
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const field = file.fieldname;
    cb(null, `${field}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

const uploadFields = upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'kop', maxCount: 1 }
]);

const publicLandingController = require('../controllers/publicLandingController');

router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'ADMIN_SPSMB'));

router.get('/', institutionController.getInstitutions);
router.post('/', uploadFields, institutionController.createInstitution);
router.get('/:id', institutionController.getInstitutionById);
router.put('/:id', uploadFields, institutionController.updateInstitution);
router.patch('/:id/status', institutionController.updateStatus);

// Sprint 3 Modul C: Landing page management per institution
router.get('/:id/landing-profile', publicLandingController.getAdminProfile);
router.put('/:id/landing-profile', publicLandingController.updateAdminProfile);
router.post('/:id/featured-programs', publicLandingController.addProgram);
router.put('/:id/featured-programs/:programId', publicLandingController.updateProgram);
router.delete('/:id/featured-programs/:programId', publicLandingController.deleteProgram);

module.exports = router;
