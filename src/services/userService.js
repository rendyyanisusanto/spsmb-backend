const bcrypt = require('bcryptjs');
const userRepository = require('../repositories/userRepository');
const pool = require('../config/database');

const getUsers = async (params) => {
  const page = parseInt(params.page) || 1;
  const limit = parseInt(params.limit) || 10;
  
  const result = await userRepository.findUsers({ ...params, page, limit });
  const totalPages = Math.ceil(result.total / limit);
  
  return {
    data: result.data,
    meta: {
      page,
      limit,
      total: result.total,
      totalPages
    }
  };
};

const getUserById = async (id) => {
  const user = await userRepository.findById(id);
  if (!user) throw new Error('User tidak ditemukan.');
  return user;
};

const validateUserRolesInstitutions = async (roleIds, institutionIds) => {
  const roles = await userRepository.getRoles();
  const validRoleIds = roles.map(r => r.id);
  const selectedRoles = roles.filter(r => roleIds.includes(r.id));
  
  if (selectedRoles.length === 0) throw new Error('Role tidak valid.');
  
  const hasAdminSPSMB = selectedRoles.some(r => r.name === 'ADMIN_SPSMB');
  if (hasAdminSPSMB && (!institutionIds || institutionIds.length === 0)) {
    throw new Error('Admin Lembaga harus memiliki minimal 1 lembaga.');
  }
};

const createUser = async (userData) => {
  const { name, username, password, email, phone, roleIds, institutionIds, isActive = true } = userData;
  
  if (!name || !username || !password || !roleIds || roleIds.length === 0) {
    throw new Error('Name, username, password, dan roleIds wajib diisi.');
  }
  
  const existingUsername = await userRepository.findByUsername(username);
  if (existingUsername) throw new Error('Username sudah digunakan.');
  
  if (email) {
    const existingEmail = await userRepository.findByEmail(email);
    if (existingEmail) throw new Error('Email sudah digunakan.');
  }

  await validateUserRolesInstitutions(roleIds, institutionIds);
  
  const passwordHash = await bcrypt.hash(password, 10);
  
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    
    const userId = await userRepository.createUser(connection, {
      name, username, email, phone, password_hash: passwordHash, is_active: isActive
    });
    
    await userRepository.addRoles(connection, userId, roleIds);
    await userRepository.addInstitutions(connection, userId, institutionIds);
    
    await connection.commit();
    return await userRepository.findById(userId);
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    if (connection) connection.release();
  }
};

const updateUser = async (id, userData) => {
  const { name, username, email, phone, roleIds, institutionIds, isActive } = userData;
  
  const existingUser = await userRepository.findById(id);
  if (!existingUser) throw new Error('User tidak ditemukan.');
  
  if (username && username !== existingUser.username) {
    const checkUsername = await userRepository.findByUsername(username);
    if (checkUsername) throw new Error('Username sudah digunakan.');
  }
  
  if (email && email !== existingUser.email) {
    const checkEmail = await userRepository.findByEmail(email);
    if (checkEmail) throw new Error('Email sudah digunakan.');
  }

  if (roleIds) {
    await validateUserRolesInstitutions(roleIds, institutionIds);
  }
  
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    
    await userRepository.updateUser(connection, id, {
      name: name || existingUser.name,
      username: username || existingUser.username,
      email: email !== undefined ? email : existingUser.email,
      phone: phone !== undefined ? phone : existingUser.phone,
      is_active: isActive !== undefined ? isActive : existingUser.isActive
    });
    
    if (roleIds) {
      await userRepository.clearRoles(connection, id);
      await userRepository.addRoles(connection, id, roleIds);
    }
    
    if (institutionIds !== undefined) {
      await userRepository.clearInstitutions(connection, id);
      await userRepository.addInstitutions(connection, id, institutionIds);
    }
    
    await connection.commit();
    return await userRepository.findById(id);
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    if (connection) connection.release();
  }
};

const updateStatus = async (id, isActive, currentUserId) => {
  if (id === currentUserId || id == currentUserId) {
    throw new Error('Anda tidak dapat menonaktifkan akun Anda sendiri.');
  }
  
  const existingUser = await userRepository.findById(id);
  if (!existingUser) throw new Error('User tidak ditemukan.');
  
  if (!isActive) {
    const hasSuperAdmin = existingUser.roles.some(r => r.name === 'SUPER_ADMIN');
    if (hasSuperAdmin) {
      const count = await userRepository.countSuperAdmins();
      if (count <= 1) {
        throw new Error('Sistem minimal harus memiliki satu SUPER_ADMIN aktif.');
      }
    }
  }
  
  await userRepository.updateStatus(id, isActive);
  return { success: true };
};

const resetPassword = async (id, password, passwordConfirmation) => {
  if (!password || password !== passwordConfirmation) {
    throw new Error('Password baru dan konfirmasi tidak cocok.');
  }
  
  const existingUser = await userRepository.findById(id);
  if (!existingUser) throw new Error('User tidak ditemukan.');
  
  const passwordHash = await bcrypt.hash(password, 10);
  await userRepository.updatePassword(id, passwordHash);
  
  return { success: true };
};

const getRoles = async () => {
  return await userRepository.getRoles();
};

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  updateStatus,
  resetPassword,
  getRoles
};
