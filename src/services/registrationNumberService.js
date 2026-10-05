const pool = require('../config/database');

class RegistrationNumberService {
  async generateFinalNumber(applicationId, academicYearName) {
    // Generate final registration number
    // Format: SPSMB-2027-00025 (prefix - year - padded ID)
    
    // Get prefix from settings
    const [[settings]] = await pool.query("SELECT setting_value FROM settings WHERE setting_key = 'registration_prefix' LIMIT 1");
    let prefix = 'SPSMB';
    if (settings && settings.setting_value) {
      prefix = settings.setting_value;
    }

    // Parse year from academicYearName, e.g., "2027/2028" -> "2027"
    let year = new Date().getFullYear().toString();
    if (academicYearName) {
      const parts = academicYearName.split('/');
      if (parts.length > 0) {
        year = parts[0];
      }
    }

    // Pad ID to 5 digits
    const paddedId = applicationId.toString().padStart(5, '0');

    return `${prefix}-${year}-${paddedId}`;
  }
}

module.exports = new RegistrationNumberService();
