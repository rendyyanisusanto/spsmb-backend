
const repo = require('../repositories/documentTypeRepository');

class DocumentTypeService {
  formatExtensions(extString) {
    if (!extString) return [];
    return extString.split(',').map(e => e.trim().toLowerCase());
  }
  
  stringifyExtensions(extArr) {
    if (!extArr || !Array.isArray(extArr)) return '';
    return extArr.map(e => e.replace(/^\./, '').trim().toLowerCase()).join(',');
  }

  format(row) {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      allowedExtensions: this.formatExtensions(row.allowed_extensions),
      maxSizeMb: row.max_size_mb,
      isActive: !!row.is_active
    };
  }

  async getAll(query) {
    const filters = {};
    if (query.status !== undefined) filters.status = parseInt(query.status);
    if (query.search) filters.search = query.search;
    
    const rows = await repo.findAll(filters);
    return { data: rows.map(r => this.format(r)) };
  }

  async getById(id) {
    const row = await repo.findById(id);
    if (!row) throw { status: 404, message: 'Document Type tidak ditemukan' };
    return this.format(row);
  }

  async create(data, user) {

    if (!data.code || !data.name || !data.allowedExtensions || !data.maxSizeMb) {
      throw { status: 422, message: 'Data tidak lengkap' };
    }
    
    if (!Number.isInteger(data.maxSizeMb) || data.maxSizeMb <= 0) {
      throw { status: 422, message: 'Ukuran maksimum harus bilangan bulat > 0' };
    }

    const existing = await repo.findByCode(data.code);
    if (existing) throw { status: 409, message: 'Kode sudah digunakan' };

    const insertId = await repo.create({
      code: data.code.toUpperCase(),
      name: data.name,
      description: data.description || null,
      allowed_extensions: this.stringifyExtensions(data.allowedExtensions),
      max_size_mb: data.maxSizeMb,
      is_active: data.isActive !== undefined ? (data.isActive ? 1 : 0) : 1
    });

    return this.getById(insertId);
  }

  async update(id, data, user) {
    const isSuper = user.roles.includes('SUPER_ADMIN');
    if (!isSuper) throw { status: 403, message: 'Hanya Super Admin yang dapat mengubah document type' };

    const existing = await repo.findById(id);
    if (!existing) throw { status: 404, message: 'Document Type tidak ditemukan' };

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    
    if (data.allowedExtensions !== undefined) {
      updateData.allowed_extensions = this.stringifyExtensions(data.allowedExtensions);
    }
    if (data.maxSizeMb !== undefined) {
      if (!Number.isInteger(data.maxSizeMb) || data.maxSizeMb <= 0) {
        throw { status: 422, message: 'Ukuran maksimum harus bilangan bulat > 0' };
      }
      updateData.max_size_mb = data.maxSizeMb;
    }
    if (data.isActive !== undefined) updateData.is_active = data.isActive ? 1 : 0;
    
    // Code is immutable in Sprint 8 requirements
    
    if (Object.keys(updateData).length > 0) {
      await repo.update(id, updateData);
    }
    return this.getById(id);
  }

  async updateStatus(id, isActive, user) {
    const isSuper = user.roles.includes('SUPER_ADMIN');
    if (!isSuper) throw { status: 403, message: 'Hanya Super Admin yang dapat mengubah status' };

    const existing = await repo.findById(id);
    if (!existing) throw { status: 404, message: 'Document Type tidak ditemukan' };

    await repo.update(id, { is_active: isActive ? 1 : 0 });
    return this.getById(id);
  }

  async remove(id, user) {
    const isSuper = user.roles.includes('SUPER_ADMIN');
    if (!isSuper) throw { status: 403, message: 'Akses ditolak' };

    const existing = await repo.findById(id);
    if (!existing) throw { status: 404, message: 'Document Type tidak ditemukan' };

    const inUseByApplicant = await repo.checkUsage(id);
    if (inUseByApplicant) {
      throw { status: 409, message: 'Jenis dokumen sudah digunakan oleh pendaftar dan tidak dapat dihapus. Nonaktifkan dokumen sebagai gantinya.' };
    }
    
    const inUseByRequirement = await repo.checkRequirementUsage(id);
    if (inUseByRequirement) {
      throw { status: 409, message: 'Jenis dokumen ini masih digunakan dalam persyaratan. Hapus persyaratan terlebih dahulu.' };
    }

    await repo.remove(id);
    return { success: true };
  }
}
module.exports = new DocumentTypeService();
