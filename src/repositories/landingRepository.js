const pool = require('../config/database');

class LandingRepository {
  async getInstitutionBySlug(slug) {
    const [rows] = await pool.query(`
      SELECT id, code, slug, name, institution_type, gender_scope, logo_url, kop_url, is_active
      FROM institutions
      WHERE slug = ? AND is_active = 1
      LIMIT 1
    `, [slug]);
    return rows[0] || null;
  }

  async getProfile(institutionId) {
    const [rows] = await pool.query(`
      SELECT headline, tagline, short_description, full_profile, banner_url, address, phone, email, whatsapp_contact
      FROM institution_profiles
      WHERE institution_id = ? AND is_published = 1
      LIMIT 1
    `, [institutionId]);
    return rows[0] || null;
  }

  async getFeaturedPrograms(institutionId) {
    const [rows] = await pool.query(`
      SELECT id, title, description, icon, order_index
      FROM institution_featured_programs
      WHERE institution_id = ? AND is_published = 1
      ORDER BY order_index ASC, id ASC
    `, [institutionId]);
    return rows;
  }

  async getStats(institutionId) {
    // Total applicants for this institution (either formal or pondok)
    const [totalRows] = await pool.query(`
      SELECT COUNT(DISTINCT a.id) as total_applicants,
             COUNT(DISTINCT CASE WHEN a.status = 'SUBMITTED' THEN a.id END) as verified_applicants
      FROM applications a
      WHERE (a.formal_institution_id = ? OR a.pondok_institution_id = ?)
    `, [institutionId, institutionId]);

    // Majors count
    const [majorRows] = await pool.query(`
      SELECT COUNT(*) as total_majors
      FROM majors
      WHERE institution_id = ? AND is_active = 1
    `, [institutionId]);

    return {
      totalApplicants: totalRows[0]?.total_applicants || 0,
      confirmedApplicants: totalRows[0]?.verified_applicants || 0,
      totalPrograms: majorRows[0]?.total_majors || 0
    };
  }

  async getActiveWaves(institutionId) {
    const nowStr = new Date().toISOString().split('T')[0];
    const [rows] = await pool.query(`
      SELECT w.id, w.name, w.start_date, w.end_date, w.is_active,
             p.name as period_name, p.academic_year
      FROM admission_waves w
      JOIN admission_periods p ON w.admission_period_id = p.id
      WHERE p.is_active = 1 AND w.is_active = 1
      ORDER BY w.start_date ASC
    `);
    return rows;
  }

  // Admin methods
  async updateProfile(institutionId, data) {
    const [existing] = await pool.query("SELECT id FROM institution_profiles WHERE institution_id = ?", [institutionId]);
    if (existing.length === 0) {
      await pool.query(`
        INSERT INTO institution_profiles (institution_id, headline, tagline, short_description, full_profile, banner_url, address, phone, email, whatsapp_contact, is_published)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        institutionId,
        data.headline || null,
        data.tagline || null,
        data.short_description || null,
        data.full_profile || null,
        data.banner_url || null,
        data.address || null,
        data.phone || null,
        data.email || null,
        data.whatsapp_contact || null,
        data.is_published !== undefined ? (data.is_published ? 1 : 0) : 1
      ]);
    } else {
      await pool.query(`
        UPDATE institution_profiles
        SET headline = ?, tagline = ?, short_description = ?, full_profile = ?, banner_url = ?, address = ?, phone = ?, email = ?, whatsapp_contact = ?, is_published = ?
        WHERE institution_id = ?
      `, [
        data.headline,
        data.tagline,
        data.short_description,
        data.full_profile,
        data.banner_url,
        data.address,
        data.phone,
        data.email,
        data.whatsapp_contact,
        data.is_published !== undefined ? (data.is_published ? 1 : 0) : 1,
        institutionId
      ]);
    }
    return true;
  }

  async getProgramsAdmin(institutionId) {
    const [rows] = await pool.query(`
      SELECT * FROM institution_featured_programs
      WHERE institution_id = ?
      ORDER BY order_index ASC, id ASC
    `, [institutionId]);
    return rows;
  }

  async addProgram(institutionId, data) {
    const [res] = await pool.query(`
      INSERT INTO institution_featured_programs (institution_id, title, description, icon, order_index, is_published)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      institutionId,
      data.title,
      data.description,
      data.icon || 'BookOpen',
      data.order_index || 1,
      data.is_published !== undefined ? (data.is_published ? 1 : 0) : 1
    ]);
    return res.insertId;
  }

  async updateProgram(id, data) {
    await pool.query(`
      UPDATE institution_featured_programs
      SET title = ?, description = ?, icon = ?, order_index = ?, is_published = ?
      WHERE id = ?
    `, [
      data.title,
      data.description,
      data.icon,
      data.order_index,
      data.is_published ? 1 : 0,
      id
    ]);
    return true;
  }

  async deleteProgram(id) {
    await pool.query(`DELETE FROM institution_featured_programs WHERE id = ?`, [id]);
    return true;
  }
}

module.exports = new LandingRepository();
