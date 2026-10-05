const pool = require('../config/database');

class InformationSourceRepository {
  async getActiveSources() {
    const [rows] = await pool.query(
      'SELECT id, name FROM information_sources WHERE is_active = 1 ORDER BY sort_order ASC'
    );
    return rows;
  }
}

module.exports = new InformationSourceRepository();
