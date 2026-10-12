const settingService = require('../services/settingService');
const auditService = require('../services/auditService');
const { AUDIT_ACTIONS } = require('../constants/auditActions');

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
    
    // Log each setting that was updated
    for (const key of Object.keys(req.body)) {
      const isSecret = key.includes('wa_api_key') || key.includes('token') || key.includes('secret');
      const desc = isSecret ? 'Konfigurasi WhatsApp diperbarui.' : `Setting "${key}" diperbarui.`;
      
      await auditService.log(
        AUDIT_ACTIONS.SETTING_UPDATE,
        'SETTING',
        null, // or the setting ID, but we might not have it in req.body
        desc,
        req
      );
    }

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
