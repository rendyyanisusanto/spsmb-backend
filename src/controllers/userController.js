const userService = require('../services/userService');

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
