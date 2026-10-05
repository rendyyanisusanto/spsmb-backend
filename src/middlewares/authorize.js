const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.roles) {
      return res.status(403).json({
        success: false,
        message: 'Anda tidak memiliki izin untuk mengakses fitur ini.'
      });
    }

    const hasRole = req.user.roles.some(role => allowedRoles.includes(role));
    if (!hasRole) {
      return res.status(403).json({
        success: false,
        message: 'Anda tidak memiliki izin untuk mengakses fitur ini.'
      });
    }

    next();
  };
};

module.exports = authorize;
