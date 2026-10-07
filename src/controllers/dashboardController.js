const dashboardRepository = require('../repositories/dashboardRepository');

exports.getDashboardStats = async (req, res) => {
  try {
    const userRole = req.user.primaryRole;
    let institutionId = null;
    
    if (userRole === 'ADMIN_SPSMB') {
      if (req.user.institutions && req.user.institutions.length > 0) {
        institutionId = req.user.institutions[0];
      }
    }
    
    const stats = await dashboardRepository.getDashboardStats(institutionId);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
  }
};
