
const repo = require('../repositories/whatsappTemplateRepository');
const resolver = require('./whatsappTemplateResolver');
const { validateVariables, extractVariables } = require('../utils/templateRenderer');
const events = require('../constants/whatsappEvents');
const { variablesMap, allVariables } = require('../constants/whatsappVariables');

class WhatsappTemplateService {
  format(row) {
    const eventObj = events.find(e => e.value === row.event_code);
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      eventCode: row.event_code,
      eventLabel: eventObj ? eventObj.label : row.event_code,
      scope: row.scope,
      sectionType: row.section_type || (row.scope === 'GLOBAL' ? 'GLOBAL' : 'FORMAL'),
      institution: row.institution_id ? {
        id: row.institution_id,
        code: row.institution_code,
        name: row.institution_name
      } : null,
      message: row.message,
      variables: extractVariables(row.message),
      isActive: !!row.is_active,
      createdBy: row.created_by || null,
      updatedBy: row.updated_by || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  hasAccessToTemplate(template, user) {
    if (user.roles.includes('SUPER_ADMIN')) return true;
    if (template.scope === 'GLOBAL' || template.section_type === 'GLOBAL' || template.sectionType === 'GLOBAL') return false; // Read-only handled in controller/getAll
    const userInst = user.institutions || [];
    return userInst.includes(template.institution_id || template.institution?.id);
  }

  async getAll(query, user) {
    const isSuper = user.roles.includes('SUPER_ADMIN');
    const userInst = user.institutions || [];
    
    // If a non-super admin explicitly queries an institutionId they don't belong to, reject with 403
    if (!isSuper && query.institutionId) {
      const targetInst = parseInt(query.institutionId);
      if (!userInst.includes(targetInst)) {
        throw { status: 403, message: 'Akses ditolak: Anda tidak memiliki akses ke lembaga ini' };
      }
    }

    const filters = {};
    if (query.event) filters.event = query.event;
    if (query.scope) filters.scope = query.scope;
    if (query.sectionType) filters.sectionType = query.sectionType;
    if (query.institutionId) filters.institutionId = parseInt(query.institutionId);
    if (query.status !== undefined) filters.status = parseInt(query.status);
    if (query.search) filters.search = query.search;
    
    const rows = await repo.findAll(filters);
    
    let filtered = rows;
    if (!isSuper) {
      filtered = rows.filter(r => 
        r.scope === 'GLOBAL' || 
        (r.scope === 'INSTITUTION' && userInst.includes(r.institution_id))
      );
    }
    
    return { data: filtered.map(r => this.format(r)) };
  }

  async getById(id, user) {
    const row = await repo.findById(id);
    if (!row) throw { status: 404, message: 'Template tidak ditemukan' };
    
    const isSuper = user.roles.includes('SUPER_ADMIN');
    if (!isSuper && row.scope === 'INSTITUTION' && !(user.institutions || []).includes(row.institution_id)) {
      throw { status: 403, message: 'Akses ditolak: Anda tidak memiliki akses ke template lembaga ini' };
    }
    
    return this.format(row);
  }

  async create(data, user) {
    const isSuper = user.roles.includes('SUPER_ADMIN');
    const userInst = user.institutions || [];
    
    if (data.scope === 'GLOBAL' && !isSuper) {
      throw { status: 403, message: 'Hanya Super Admin yang dapat membuat template global' };
    }
    if (data.scope === 'INSTITUTION') {
      if (!data.institutionId) throw { status: 422, message: 'Institution ID wajib untuk scope INSTITUTION' };
      const targetInst = parseInt(data.institutionId);
      if (!isSuper && !userInst.includes(targetInst)) {
        throw { status: 403, message: 'Akses ditolak: Anda tidak memiliki akses ke lembaga ini' };
      }
      data.institutionId = targetInst;
    }

    if (!data.code || !data.name || !data.eventCode || !data.message) {
      throw { status: 422, message: 'Data tidak lengkap' };
    }

    if (!data.name.trim() || !data.message.trim()) {
      throw { status: 422, message: 'Nama template dan isi pesan tidak boleh kosong' };
    }

    if (!events.find(e => e.value === data.eventCode)) {
      throw { status: 422, message: 'Event tidak valid' };
    }

    const valResult = validateVariables(data.message, data.eventCode);
    if (!valResult.isValid) {
      throw { status: 422, message: 'Template mengandung variable yang tidak dikenal.', errors: { message: valResult.errors } };
    }

    const existing = await repo.findByCode(data.code, data.scope, data.institutionId);
    if (existing) throw { status: 409, message: 'Kode sudah digunakan pada scope/lembaga ini' };
    
    if (data.isActive) {
      const activeDuplicate = await repo.getActiveTemplate(data.eventCode, data.scope, data.institutionId);
      if (activeDuplicate) {
        throw { status: 409, message: 'Template aktif untuk event dan scope tersebut sudah tersedia.' };
      }
    }

    const insertId = await repo.create({
      code: data.code.toUpperCase(),
      name: data.name.trim(),
      event_code: data.eventCode,
      scope: data.scope,
      section_type: data.sectionType || (data.scope === 'GLOBAL' ? 'GLOBAL' : 'FORMAL'),
      institution_id: data.scope === 'INSTITUTION' ? data.institutionId : null,
      message: data.message.trim(),
      is_active: data.isActive ? 1 : 0,
      created_by: user.id,
      updated_by: user.id
    });

    return this.getById(insertId, user);
  }

  async update(id, data, user) {
    const existing = await repo.findById(id);
    if (!existing) throw { status: 404, message: 'Template tidak ditemukan' };
    
    if (!this.hasAccessToTemplate(existing, user)) {
      throw { status: 403, message: 'Anda tidak memiliki akses untuk mengedit template ini' };
    }

    const isSuper = user.roles.includes('SUPER_ADMIN');

    // Prevent non-super admin from altering template identity, scope, or section type
    if (!isSuper) {
      if (data.code !== undefined && data.code !== existing.code) {
        throw { status: 403, message: 'Anda tidak diizinkan mengubah kode template' };
      }
      if (data.scope !== undefined && data.scope !== existing.scope) {
        throw { status: 403, message: 'Anda tidak diizinkan mengubah scope template' };
      }
      if (data.sectionType !== undefined && data.sectionType !== existing.section_type) {
        throw { status: 403, message: 'Anda tidak diizinkan mengubah jenis bagian template' };
      }
      if (data.institutionId !== undefined && data.institutionId !== existing.institution_id) {
        throw { status: 403, message: 'Anda tidak diizinkan mengubah lembaga template' };
      }
    }

    const updateData = {};
    if (isSuper && data.sectionType !== undefined) {
      updateData.section_type = data.sectionType;
    }
    if (data.name !== undefined) {
      if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
        throw { status: 422, message: 'Nama template tidak boleh kosong' };
      }
      updateData.name = data.name.trim();
    }
    if (data.eventCode !== undefined) {
      if (!events.find(e => e.value === data.eventCode)) throw { status: 422, message: 'Event tidak valid' };
      updateData.event_code = data.eventCode;
    }
    if (data.message !== undefined) {
      if (!data.message || typeof data.message !== 'string' || data.message.trim() === '') {
        throw { status: 422, message: 'Isi pesan template tidak boleh kosong' };
      }
      const eventToValidate = data.eventCode || existing.event_code;
      const valResult = validateVariables(data.message, eventToValidate);
      if (!valResult.isValid) {
        throw { status: 422, message: 'Template mengandung variable yang tidak dikenal.', errors: { message: valResult.errors } };
      }
      updateData.message = data.message.trim();
    }
    
    if (data.isActive !== undefined) {
      const activeVal = data.isActive ? 1 : 0;
      if (activeVal === 1) {
        const eventCode = data.eventCode || existing.event_code;
        const activeDuplicate = await repo.getActiveTemplate(eventCode, existing.scope, existing.institution_id);
        if (activeDuplicate && activeDuplicate.id !== parseInt(id)) {
          throw { status: 409, message: 'Template aktif untuk event dan scope tersebut sudah tersedia.' };
        }
      }
      updateData.is_active = activeVal;
    }

    updateData.updated_by = user.id;
    
    if (Object.keys(updateData).length > 0) {
      await repo.update(id, updateData);
    }
    return this.getById(id, user);
  }

  async updateStatus(id, isActive, user) {
    return this.update(id, { isActive }, user);
  }

  async duplicate(id, data, user) {
    const existing = await repo.findById(id);
    if (!existing) throw { status: 404, message: 'Template tidak ditemukan' };
    
    const isSuper = user.roles.includes('SUPER_ADMIN');
    const scope = data.scope || existing.scope;
    let institutionId = data.institutionId || existing.institution_id;
    
    if (scope === 'GLOBAL' && !isSuper) {
      throw { status: 403, message: 'Hanya Super Admin yang dapat membuat template global' };
    }
    if (scope === 'INSTITUTION') {
      if (!institutionId) throw { status: 422, message: 'Institution ID wajib' };
      if (!isSuper && !(user.institutions || []).includes(institutionId)) {
        throw { status: 403, message: 'Anda tidak memiliki akses ke lembaga ini' };
      }
    } else {
      institutionId = null;
    }
    
    const duplicateCode = data.code || `${existing.code}_COPY_${Date.now()}`;
    const checkCode = await repo.findByCode(duplicateCode, scope, institutionId);
    if (checkCode) throw { status: 409, message: 'Kode duplikat sudah digunakan pada scope/lembaga ini' };

    const insertId = await repo.create({
      code: duplicateCode.toUpperCase(),
      name: data.name || `Copy of ${existing.name}`,
      event_code: existing.event_code,
      scope: scope,
      institution_id: institutionId,
      message: existing.message,
      is_active: 0 // always inactive by default
    });

    return this.getById(insertId, user);
  }

  async useGlobal(id, user) {
    const existing = await repo.findById(id);
    if (!existing) throw { status: 404, message: 'Template tidak ditemukan' };
    
    if (existing.scope !== 'INSTITUTION') {
      throw { status: 422, message: 'Hanya template institution yang bisa di-fallback ke global' };
    }
    if (!this.hasAccessToTemplate(existing, user)) {
      throw { status: 403, message: 'Akses ditolak: Anda tidak memiliki akses ke template lembaga ini' };
    }
    
    await repo.update(id, { is_active: 0 });
    return this.getById(id, user);
  }

  async remove(id, user) {
    const existing = await repo.findById(id);
    if (!existing) throw { status: 404, message: 'Template tidak ditemukan' };

    const isSuper = user.roles.includes('SUPER_ADMIN');
    if (!isSuper) {
      if (existing.scope === 'GLOBAL') {
        throw { status: 403, message: 'Admin lembaga tidak diizinkan menghapus template global' };
      }
      if (existing.scope === 'INSTITUTION' && !(user.institutions || []).includes(existing.institution_id)) {
        throw { status: 403, message: 'Akses ditolak: Anda tidak memiliki akses ke template lembaga ini' };
      }
    }

    const inUse = await repo.checkUsage(id);
    if (inUse) {
      throw { status: 409, message: 'Template sudah digunakan pada riwayat WhatsApp dan tidak dapat dihapus. Nonaktifkan template sebagai gantinya.' };
    }

    await pool.query('DELETE FROM wa_templates WHERE id = ?', [id]);
    return { success: true };
  }
}

module.exports = new WhatsappTemplateService();
