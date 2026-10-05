const bcrypt = require('bcryptjs');
const authRepository = require('../repositories/authRepository');
const { signAccessToken } = require('../utils/jwt');

const getPrimaryRole = (roles) => {
  if (roles.includes('SUPER_ADMIN')) return 'SUPER_ADMIN';
  if (roles.includes('ADMIN_SPSMB')) return 'ADMIN_SPSMB';
  if (roles.includes('PETUGAS')) return 'PETUGAS';
  return null;
};

const login = async (username, password) => {
  const user = await authRepository.findUserByUsername(username);
  if (!user) {
    throw { status: 401, message: 'Username atau password salah.' };
  }

  if (user.is_active === 0) {
    throw { status: 403, message: 'Akun Anda tidak aktif. Silakan hubungi administrator.' };
  }

  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    throw { status: 401, message: 'Username atau password salah.' };
  }

  const roles = await authRepository.findUserRoles(user.id);
  const primaryRole = getPrimaryRole(roles);
  
  let institutions = [];
  let globalAccess = false;
  
  if (primaryRole === 'SUPER_ADMIN') {
    globalAccess = true;
  } else {
    institutions = await authRepository.findUserInstitutions(user.id);
  }

  const accessToken = signAccessToken({
    sub: user.id,
    roles,
    primaryRole
  });

  await authRepository.updateLastLogin(user.id);

  return {
    accessToken,
    tokenType: 'Bearer',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      phone: user.phone,
      roles,
      primaryRole,
      globalAccess,
      institutions,
      lastLoginAt: new Date().toISOString()
    }
  };
};

const getUserProfile = async (userId) => {
  const user = await authRepository.findUserById(userId);
  if (!user || user.is_active === 0) {
    throw { status: 403, message: 'Akun Anda tidak aktif. Silakan hubungi administrator.' };
  }

  const roles = await authRepository.findUserRoles(user.id);
  const primaryRole = getPrimaryRole(roles);
  
  let institutions = [];
  let globalAccess = false;
  
  if (primaryRole === 'SUPER_ADMIN') {
    globalAccess = true;
  } else {
    institutions = await authRepository.findUserInstitutions(user.id);
  }

  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    phone: user.phone,
    roles,
    primaryRole,
    globalAccess,
    institutions,
    lastLoginAt: user.last_login_at
  };
};

module.exports = {
  login,
  getUserProfile
};
