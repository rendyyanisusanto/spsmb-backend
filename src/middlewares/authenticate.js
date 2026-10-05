const jwt = require('jsonwebtoken');
const authRepository = require('../repositories/authRepository');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Anda harus login terlebih dahulu.'
      });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Session telah berakhir. Silakan login kembali.'
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Session tidak valid.'
      });
    }

    const userId = decoded.sub;
    const user = await authRepository.findUserById(userId);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Session tidak valid.'
      });
    }

    if (user.is_active === 0) {
      return res.status(403).json({
        success: false,
        message: 'Akun Anda tidak aktif. Silakan hubungi administrator.'
      });
    }

    const institutions = await authRepository.findUserInstitutions(userId);

    req.user = {
      id: user.id,
      roles: decoded.roles,
      primaryRole: decoded.primaryRole,
      institutions: institutions.map(i => i.id)
    };
    
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = authenticate;
