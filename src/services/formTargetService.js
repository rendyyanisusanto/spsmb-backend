
const repo = require('../repositories/formTargetRepository');
const pool = require('../config/database');

class FormTargetService {
  async getAll(query, user) {
    const isSuper = user.roles.includes('SUPER_ADMIN');
    let targets = await repo.findAll({
      targetType: query.targetType,
      institutionId: query.institutionId ? parseInt(query.institutionId) : undefined,
      status: query.status,
      search: query.search
    });

    if (!isSuper) {
      const userInst = user.institutions || [];
      targets = targets.filter(t => 
        t.target_type === 'COMMON' || 
        t.target_type === 'PONDOK_COMMON' || 
        (t.target_type === 'INSTITUTION' && userInst.some(id => String(id) === String(t.institution_id)))
      );
    }
    
    return { data: targets.map(this.format) };
  }

  async getById(id, user) {
    const row = await repo.findById(id);
    if (!row) throw { status: 404, message: 'Target tidak ditemukan' };
    
    const isSuper = user.roles.includes('SUPER_ADMIN');
    if (!isSuper) {
      if (row.target_type === 'INSTITUTION' && !(user.institutions || []).some(id => String(id) === String(row.institution_id))) {
        throw { status: 403, message: 'Akses ditolak' };
      }
    }
    return this.format(row);
  }

  async create(data, user) {
    const isSuper = user.roles.includes('SUPER_ADMIN');
    if (!isSuper) throw { status: 403, message: 'Hanya Super Admin yang dapat membuat form target' };

    if (!data.code || !data.name || !data.targetType) throw { status: 422, message: 'Data tidak lengkap' };
    
    if (data.targetType === 'INSTITUTION' && !data.institutionId) {
      throw { status: 422, message: 'Lembaga wajib diisi untuk target INSTITUTION' };
    }
    if ((data.targetType === 'COMMON' || data.targetType === 'PONDOK_COMMON') && data.institutionId) {
      throw { status: 422, message: 'Lembaga harus kosong untuk target GLOBAL/COMMON' };
    }

    const existing = await repo.findByCode(data.code);
    if (existing) throw { status: 409, message: 'Kode target sudah digunakan' };

    const insertData = {
      code: data.code,
      name: data.name,
      target_type: data.targetType,
      institution_id: data.targetType === 'INSTITUTION' ? data.institutionId : null,
      is_active: data.isActive !== undefined ? (data.isActive ? 1 : 0) : 1
    };

    const insertId = await repo.create(insertData);
    return this.getById(insertId, user);
  }

  async update(id, data, user) {
    const isSuper = user.roles.includes('SUPER_ADMIN');
    if (!isSuper) throw { status: 403, message: 'Hanya Super Admin yang dapat mengubah form target' };

    const existing = await repo.findById(id);
    if (!existing) throw { status: 404, message: 'Target tidak ditemukan' };

    const updateData = {};
    if (data.code && data.code !== existing.code) {
      const codeCheck = await repo.findByCode(data.code);
      if (codeCheck) throw { status: 409, message: 'Kode target sudah digunakan' };
      updateData.code = data.code;
    }
    if (data.name !== undefined) updateData.name = data.name;
    // targetType & institutionId should ideally be immutable, but if needed, supervised by super_admin
    
    if (Object.keys(updateData).length > 0) {
      await repo.update(id, updateData);
    }
    return this.getById(id, user);
  }

  async updateStatus(id, isActive, user) {
    const isSuper = user.roles.includes('SUPER_ADMIN');
    if (!isSuper) throw { status: 403, message: 'Hanya Super Admin yang dapat mengubah status form target' };

    const existing = await repo.findById(id);
    if (!existing) throw { status: 404, message: 'Target tidak ditemukan' };

    await repo.update(id, { is_active: isActive ? 1 : 0 });
    return this.getById(id, user);
  }

  format(row) {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      targetType: row.target_type,
      isActive: !!row.is_active,
      institution: row.institution_id ? {
        id: row.institution_id,
        code: row.institution_code,
        name: row.institution_name,
        type: row.institution_type
      } : null
    };
  }
}
module.exports = new FormTargetService();
