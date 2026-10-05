const settingService = require('../services/settingService');

const getSettings = async (req, res) => {
  try {
    const data = await settingService.getSettings();
    res.json({ success: true, message: 'Pengaturan berhasil dimuat.', data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal memuat pengaturan.', errors: error.message });
  }
};

const getPublicSettings = async (req, res) => {
  try {
    const data = await settingService.getPublicSettings();
    res.json({ success: true, message: 'Pengaturan berhasil dimuat.', data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal memuat pengaturan.', errors: error.message });
  }
};

const updateSettings = async (req, res) => {
  try {
    const data = await settingService.updateSettings(req.body);
    res.json({ success: true, message: 'Pengaturan berhasil disimpan.', data });
  } catch (error) {
    res.status(422).json({ success: false, message: 'Data tidak valid.', errors: error.message });
  }
};

module.exports = {
  getSettings,
  getPublicSettings,
  updateSettings
};
