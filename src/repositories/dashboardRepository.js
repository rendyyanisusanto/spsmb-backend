const pool = require('../config/database');

class DashboardRepository {
  async getDashboardStats(institutionId = null) {
    let appCondition = 'WHERE 1=1';
    const params = [];
    
    if (institutionId) {
      appCondition += ' AND (a.formal_institution_id = ? OR a.pondok_institution_id = ?)';
      params.push(institutionId, institutionId);
    }
    
    // Total applicants
    const [totalRows] = await pool.query(`SELECT COUNT(*) as total FROM applications a ${appCondition}`, params);
    const totalApplicants = totalRows[0].total;
    
    // Today applicants
    const todayCondition = `${appCondition} AND DATE(a.created_at) = CURDATE()`;
    const [todayRows] = await pool.query(`SELECT COUNT(*) as total FROM applications a ${todayCondition}`, params);
    const todayApplicants = todayRows[0].total;
    
    // Total users
    const [userRows] = await pool.query(`SELECT COUNT(*) as total FROM users`);
    const totalUsers = userRows[0].total;
    
    // Stats by lembaga
    let statsByLembaga = {};
    if (!institutionId) {
      const [lembagaRows] = await pool.query(`
        SELECT i.name, COUNT(a.id) as count
        FROM applications a
        JOIN institutions i ON a.formal_institution_id = i.id
        GROUP BY i.name
      `);
      lembagaRows.forEach(row => {
        statsByLembaga[row.name] = row.count;
      });
    } else {
      const [lembagaRows] = await pool.query(`
        SELECT i.name, COUNT(a.id) as count
        FROM applications a
        JOIN institutions i ON a.formal_institution_id = i.id
        WHERE i.id = ?
        GROUP BY i.name
      `, [institutionId]);
      lembagaRows.forEach(row => {
        statsByLembaga[row.name] = row.count;
      });
    }
    
    // Recent pendaftar (limit 10)
    let recentQuery = `
      SELECT 
        a.id,
        ap.full_name as nama,
        ap.whatsapp as no_hp,
        i.name as lembaga_pendidikan,
        a.created_at
      FROM applications a
      JOIN applicants ap ON a.applicant_id = ap.id
      LEFT JOIN institutions i ON a.formal_institution_id = i.id
      ${appCondition}
      ORDER BY a.created_at DESC
      LIMIT 10
    `;
    const [recentRows] = await pool.query(recentQuery, params);
    
    return {
      totalApplicants,
      todayApplicants,
      totalUsers,
      statsByLembaga,
      recent: recentRows
    };
  }
}

module.exports = new DashboardRepository();
