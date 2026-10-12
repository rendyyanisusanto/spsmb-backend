const authService = require('../services/authService');
const { successResponse } = require('../utils/response');
const auditService = require('../services/auditService');
const { AUDIT_ACTIONS } = require('../constants/auditActions');

const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(422).json({
        success: false,
        message: 'Data login tidak valid.',
        errors: {
          ...( !username && { username: ['Username wajib diisi.'] } ),
          ...( !password && { password: ['Password wajib diisi.'] } )
        }
      });
    }

    const result = await authService.login(username, password);
    
    // Audit Log: Login Berhasil
    await auditService.createAuditLog({
      userId: result.user.id,
      action: AUDIT_ACTIONS.LOGIN,
      entityType: 'AUTH',
      entityId: null,
      description: `User "${username}" berhasil login.`,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent')
    });

    return successResponse(res, 200, 'Login berhasil.', result);
  } catch (error) {
    const username = req.body && req.body.username ? req.body.username : 'unknown';
    if (error.status) {
      await auditService.createAuditLog({
        userId: null,
        action: AUDIT_ACTIONS.LOGIN,
        entityType: 'AUTH',
        entityId: null,
        description: `Percobaan login gagal untuk username "${username}".`,
        ipAddress: req.ip || (req.connection && req.connection.remoteAddress) || null,
        userAgent: req.get ? req.get('user-agent') : null
      });

      return res.status(error.status).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
};

const me = async (req, res, next) => {
  try {
    const userProfile = await authService.getUserProfile(req.user.id);
    return successResponse(res, 200, 'Data pengguna berhasil dimuat.', { user: userProfile });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    await auditService.log(
      AUDIT_ACTIONS.LOGOUT,
      'AUTH',
      null,
      `User "${req.user.primaryRole}" melakukan logout.`,
      req
    );

    return successResponse(res, 200, 'Logout berhasil.');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  me,
  logout
};
