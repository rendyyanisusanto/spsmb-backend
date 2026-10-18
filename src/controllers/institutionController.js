const institutionService = require('../services/institutionService');
const auditService = require('../services/auditService');
const { AUDIT_ACTIONS } = require('../constants/auditActions');

const getInstitutions = async (req, res) => {
  try {
    const data = await institutionService.getInstitutions(req.user, req.query);
    res.json({ success: true, message: 'Data berhasil dimuat', data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal memuat data', errors: error.message });
  }
};

const getPublicInstitutions = async (req, res) => {
  try {
    const data = await institutionService.getPublicInstitutions();
    res.json({ success: true, message: 'Data berhasil dimuat', data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal memuat data', errors: error.message });
  }
};

const getInstitutionById = async (req, res) => {
  try {
    const data = await institutionService.getInstitutionById(req.user, req.params.id);
    res.json({ success: true, message: 'Data berhasil dimuat', data });
  } catch (error) {
    if (error.message === 'FORBIDDEN') return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    if (error.message === 'NOT_FOUND') return res.status(404).json({ success: false, message: 'Data tidak ditemukan.' });
    res.status(500).json({ success: false, message: 'Gagal memuat data', errors: error.message });
  }
};

const createInstitution = async (req, res) => {
  try {
    const body = { ...req.body };

    if (req.files) {
      if (req.files.logo && req.files.logo[0]) {
        body.logo_url = `/storage/institutions/temp/${req.files.logo[0].filename}`;
      }
      if (req.files.kop && req.files.kop[0]) {
        body.kop_url = `/storage/institutions/temp/${req.files.kop[0].filename}`;
      }
    }

    let data = await institutionService.createInstitution(req.user, body);

    if (data && (body.logo_url || body.kop_url)) {
      const moved = await institutionService.moveTempFiles(data.id, body.logo_url, body.kop_url);
      if (moved.logo_url || moved.kop_url) {
        data = await institutionService.updateInstitution(req.user, data.id, {
          logo_url: moved.logo_url || data.logo_url,
          kop_url: moved.kop_url || data.kop_url
        });
      }
    }
    
    await auditService.log(
      AUDIT_ACTIONS.CREATE,
      'INSTITUTION',
      data.id,
      `Data lembaga "${data.name}" berhasil dibuat.`,
      req
    );

    res.status(201).json({ success: true, message: 'Lembaga berhasil dibuat', data });
  } catch (error) {
    if (error.message === 'FORBIDDEN') return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    res.status(422).json({ success: false, message: 'Data tidak valid', errors: error.message });
  }
};

const updateInstitution = async (req, res) => {
  try {
    const id = req.params.id;
    const body = { ...req.body };

    if (req.files) {
      if (req.files.logo && req.files.logo[0]) {
        body.logo_url = `/storage/institutions/${id}/${req.files.logo[0].filename}`;
      }
      if (req.files.kop && req.files.kop[0]) {
        body.kop_url = `/storage/institutions/${id}/${req.files.kop[0].filename}`;
      }
    }

    if (body.delete_logo === 'true' || body.delete_logo === true) {
      body.logo_url = null;
    }
    if (body.delete_kop === 'true' || body.delete_kop === true) {
      body.kop_url = null;
    }

    const data = await institutionService.updateInstitution(req.user, id, body);
    
    await auditService.log(
      AUDIT_ACTIONS.UPDATE,
      'INSTITUTION',
      req.params.id,
      `Data lembaga "${data.name}" diperbarui.`,
      req
    );

    res.json({ success: true, message: 'Lembaga berhasil diperbarui', data });
  } catch (error) {
    if (error.message === 'FORBIDDEN') return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    if (error.message === 'NOT_FOUND') return res.status(404).json({ success: false, message: 'Data tidak ditemukan.' });
    res.status(422).json({ success: false, message: 'Data tidak valid', errors: error.message });
  }
};

const updateStatus = async (req, res) => {
  try {
    const { isActive } = req.body;
    await institutionService.updateStatus(req.user, req.params.id, isActive);
    
    await auditService.log(
      AUDIT_ACTIONS.UPDATE,
      'INSTITUTION',
      req.params.id,
      `Status lembaga diperbarui menjadi ${isActive ? 'aktif' : 'tidak aktif'}.`,
      req
    );

    res.json({ success: true, message: 'Status lembaga berhasil diperbarui' });
  } catch (error) {
    if (error.message === 'FORBIDDEN') return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    if (error.message === 'NOT_FOUND') return res.status(404).json({ success: false, message: 'Data tidak ditemukan.' });
    res.status(422).json({ success: false, message: 'Gagal memperbarui status', errors: error.message });
  }
};

module.exports = {
  getInstitutions,
  getPublicInstitutions,
  getInstitutionById,
  createInstitution,
  updateInstitution,
  updateStatus
};
