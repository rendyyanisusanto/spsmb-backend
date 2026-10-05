
const repo = require('../repositories/formSectionRepository');

class FormSectionService {
  async getAll(query) {
    const rows = await repo.findAll({ search: query.search, status: query.status });
    return { data: rows.map(this.format) };
  }
  
  async getById(id) {
    const row = await repo.findById(id);
    if (!row) throw { status: 404, message: 'Section tidak ditemukan' };
    return this.format(row);
  }

  async create(data, user) {
    if (!user.roles.includes('SUPER_ADMIN')) throw { status: 403, message: 'Akses ditolak' };
    if (!data.code || !data.name) throw { status: 422, message: 'Data tidak lengkap' };
    
    if (await repo.findByCode(data.code)) throw { status: 409, message: 'Kode section sudah ada' };

    const insertId = await repo.create({
      code: data.code,
      name: data.name,
      sort_order: data.sortOrder || 99,
      is_active: data.isActive !== undefined ? (data.isActive ? 1 : 0) : 1
    });
    return this.getById(insertId);
  }

  async update(id, data, user) {
    if (!user.roles.includes('SUPER_ADMIN')) throw { status: 403, message: 'Akses ditolak' };
    const existing = await repo.findById(id);
    if (!existing) throw { status: 404, message: 'Section tidak ditemukan' };

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.sortOrder !== undefined) updateData.sort_order = data.sortOrder;
    if (data.code !== undefined && data.code !== existing.code) {
      if (await repo.findByCode(data.code)) throw { status: 409, message: 'Kode section sudah ada' };
      updateData.code = data.code;
    }
    if (data.isActive !== undefined) updateData.is_active = data.isActive ? 1 : 0;

    if (Object.keys(updateData).length > 0) {
      await repo.update(id, updateData);
    }
    return this.getById(id);
  }

  async updateStatus(id, isActive, user) {
    if (!user.roles.includes('SUPER_ADMIN')) throw { status: 403, message: 'Akses ditolak' };
    const existing = await repo.findById(id);
    if (!existing) throw { status: 404, message: 'Section tidak ditemukan' };
    
    await repo.update(id, { is_active: isActive ? 1 : 0 });
    return this.getById(id);
  }

  async delete(id, user) {
    if (!user.roles.includes('SUPER_ADMIN')) throw { status: 403, message: 'Akses ditolak' };
    const existing = await repo.findById(id);
    if (!existing) throw { status: 404, message: 'Section tidak ditemukan' };
    
    const hasFields = await repo.checkHasFields(id);
    if (hasFields) {
      throw { status: 409, message: 'Kelompok tidak dapat dihapus karena masih memiliki field pertanyaan. Hapus atau pindahkan field terlebih dahulu.' };
    }
    
    await repo.delete(id);
    return { success: true };
  }

  format(row) {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      sortOrder: row.sort_order,
      isActive: !!row.is_active
    };
  }
}
module.exports = new FormSectionService();
