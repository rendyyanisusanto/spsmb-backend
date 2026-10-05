const pool = require('../config/database');

class PondokResolverService {
  async resolvePondokInstitution(gender) {
    const [institutions] = await pool.query(
      `SELECT id FROM institutions WHERE institution_type = 'PONDOK' AND is_active = 1 AND (gender_scope = ? OR gender_scope = 'ALL')`,
      [gender]
    );

    if (institutions.length === 0) {
      const error = new Error('Konfigurasi pondok untuk jenis kelamin yang dipilih belum tersedia. Silakan hubungi panitia SPSMB.');
      error.status = 422;
      throw error;
    }

    if (institutions.length > 1) {
      const error = new Error('Terdapat lebih dari satu pilihan pondok yang sesuai. Konfigurasi pendaftaran perlu diperiksa oleh administrator.');
      error.status = 409;
      throw error;
    }

    return institutions[0].id;
  }
}

module.exports = new PondokResolverService();
