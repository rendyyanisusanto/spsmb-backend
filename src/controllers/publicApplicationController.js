const applicationService = require('../services/publicApplicationService');
const pool = require('../config/database');

class PublicApplicationController {
  async createApplication(req, res, next) {
    try {
      // 1. Check if registration is enabled
      const [[settings]] = await pool.query("SELECT setting_value FROM settings WHERE setting_key = 'registration.enabled' LIMIT 1");
      const isRegistrationEnabled = settings ? settings.setting_value === 'true' : true;
      if (!isRegistrationEnabled) {
        return res.status(403).json({
          success: false,
          message: 'Pendaftaran SPSMB saat ini ditutup.'
        });
      }

      // 2. Validate input
      const {
        fullName, gender, whatsapp, parentName, address,
        previousSchool, registrationType, formalInstitutionId,
        informationSourceId, informationSourceOther, birthPlace, birthDate
      } = req.body;

      if (!fullName || !fullName.trim()) return res.status(422).json({ success: false, message: 'Nama Lengkap wajib diisi.' });
      if (!gender || !['MALE', 'FEMALE'].includes(gender)) return res.status(422).json({ success: false, message: 'Jenis Kelamin tidak valid.' });
      if (!birthPlace || !birthPlace.trim()) return res.status(422).json({ success: false, message: 'Tempat Lahir wajib diisi.' });
      if (!birthDate) return res.status(422).json({ success: false, message: 'Tanggal Lahir wajib diisi.' });
      if (!whatsapp || !whatsapp.trim()) return res.status(422).json({ success: false, message: 'No. WhatsApp wajib diisi.' });
      if (!parentName || !parentName.trim()) return res.status(422).json({ success: false, message: 'Nama Orang Tua / Wali wajib diisi.' });
      if (!address || !address.trim()) return res.status(422).json({ success: false, message: 'Alamat Lengkap wajib diisi.' });
      if (!previousSchool || !previousSchool.trim()) return res.status(422).json({ success: false, message: 'Sekolah Asal wajib diisi.' });
      if (!registrationType || !['SMP', 'SMA', 'SMK', 'NON_FORMAL'].includes(registrationType)) return res.status(422).json({ success: false, message: 'Tipe Pendaftaran tidak valid.' });
      if (['SMP', 'SMA', 'SMK'].includes(registrationType) && !formalInstitutionId) return res.status(422).json({ success: false, message: 'Lembaga Pendidikan wajib dipilih.' });
      if (registrationType === 'NON_FORMAL' && formalInstitutionId) return res.status(422).json({ success: false, message: 'Lembaga Pendidikan harus kosong untuk pendaftaran Non Formal.' });
      if (!informationSourceId) return res.status(422).json({ success: false, message: 'Sumber Informasi wajib dipilih.' });

      // Cek "Lainnya" case (optional implementation for now based on name, or simply accept if front-end sends it)
      
      const result = await applicationService.createInitialApplication({
        fullName: fullName.trim().substring(0, 150),
        gender,
        whatsapp,
        parentName: parentName.trim().substring(0, 150),
        address: address.trim(),
        previousSchool: previousSchool.trim().substring(0, 200),
        registrationType,
        formalInstitutionId,
        informationSourceId,
        informationSourceOther,
        birthPlace: birthPlace.trim().substring(0, 100),
        birthDate
      });

      const receipt = await applicationService.getReceipt(result.registrationNumber, result.continueToken);

      res.status(201).json({
        success: true,
        message: 'Pendaftaran awal berhasil.',
        data: {
          registrationNumber: result.registrationNumber,
          continueToken: result.continueToken,
          receipt
        }
      });
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  async getReceipt(req, res, next) {
    try {
      const registrationNumber = req.params.registrationNumber;
      const rawToken = req.headers['x-continue-token'];

      if (!rawToken) {
        return res.status(401).json({
          success: false,
          message: 'Token tidak ditemukan.'
        });
      }

      const receipt = await applicationService.getReceipt(registrationNumber, rawToken);

      res.status(200).json({
        success: true,
        data: receipt
      });
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({ success: false, message: error.message });
      }
      next(error);
    }
  }
}

module.exports = new PublicApplicationController();
