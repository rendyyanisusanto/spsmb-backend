const authService = require('../services/authService');
const { successResponse } = require('../utils/response');

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
    
    return successResponse(res, 200, 'Login berhasil.', result);
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
