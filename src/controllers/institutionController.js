const institutionService = require('../services/institutionService');

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
    const data = await institutionService.createInstitution(req.user, req.body);
    res.status(201).json({ success: true, message: 'Lembaga berhasil dibuat', data });
  } catch (error) {
    if (error.message === 'FORBIDDEN') return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    res.status(422).json({ success: false, message: 'Data tidak valid', errors: error.message });
  }
};

const updateInstitution = async (req, res) => {
  try {
    const data = await institutionService.updateInstitution(req.user, req.params.id, req.body);
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
