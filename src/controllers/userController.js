const userService = require('../services/userService');
const auditService = require('../services/auditService');
const { AUDIT_ACTIONS } = require('../constants/auditActions');

const getUsers = async (req, res) => {
  try {
    const result = await userService.getUsers(req.query);
    res.json({
      success: true,
      message: 'Data pengguna berhasil dimuat.',
      data: result.data,
      meta: result.meta
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal memuat pengguna.', errors: error.message });
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await userService.getUserById(req.params.id);
    res.json({
      success: true,
      message: 'Data pengguna berhasil dimuat.',
      data: user
    });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};

const createUser = async (req, res) => {
  try {
    const user = await userService.createUser(req.body);
    
    await auditService.log(
      AUDIT_ACTIONS.USER_CREATE,
      'USER',
      user.id,
      `Data user "${user.username}" berhasil dibuat.`,
      req
    );

    res.status(201).json({
      success: true,
      message: 'User berhasil dibuat.',
      data: user
    });
  } catch (error) {
    res.status(422).json({ success: false, message: 'Data tidak valid.', errors: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const user = await userService.updateUser(req.params.id, req.body);

    await auditService.log(
      AUDIT_ACTIONS.USER_UPDATE,
      'USER',
      user.id,
      `Data user "${user.username}" diperbarui.`,
      req
    );

    res.json({
      success: true,
      message: 'User berhasil diperbarui.',
      data: user
    });
  } catch (error) {
    res.status(422).json({ success: false, message: 'Data tidak valid.', errors: error.message });
  }
};

const updateStatus = async (req, res) => {
  try {
    const { isActive } = req.body;
    await userService.updateStatus(req.params.id, isActive, req.user.id);
    
    await auditService.log(
      AUDIT_ACTIONS.USER_STATUS_CHANGE,
      'USER',
      req.params.id,
      `Status user diperbarui menjadi ${isActive ? 'aktif' : 'tidak aktif'}.`,
      req
    );

    res.json({
      success: true,
      message: 'Status user berhasil diperbarui.'
    });
  } catch (error) {
    res.status(422).json({ success: false, message: 'Gagal memperbarui status.', errors: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { password, passwordConfirmation } = req.body;
    await userService.resetPassword(req.params.id, password, passwordConfirmation);
    
    await auditService.log(
      AUDIT_ACTIONS.USER_PASSWORD_RESET,
      'USER',
      req.params.id,
      `Password user direset.`,
      req
    );

    res.json({
      success: true,
      message: 'Password berhasil direset.'
    });
  } catch (error) {
    res.status(422).json({ success: false, message: 'Gagal mereset password.', errors: error.message });
  }
};

const getRoles = async (req, res) => {
  try {
    const roles = await userService.getRoles();
    res.json({
      success: true,
      message: 'Role berhasil dimuat.',
      data: roles
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal memuat role.' });
  }
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
