
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
      institution: row.institution_id ? {
        id: row.institution_id,
        code: row.institution_code,
        name: row.institution_name
      } : null,
      message: row.message,
      variables: extractVariables(row.message),
      isActive: !!row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  hasAccessToTemplate(template, user) {
    if (user.roles.includes('SUPER_ADMIN')) return true;
    if (template.scope === 'GLOBAL') return false; // Read-only handled in controller/getAll
    const userInst = user.institutions || [];
    return userInst.includes(template.institution_id || template.institution?.id);
  }

  async getAll(query, user) {
    const isSuper = user.roles.includes('SUPER_ADMIN');
    const userInst = user.institutions || [];
    
    const filters = {};
    if (query.event) filters.event = query.event;
    if (query.scope) filters.scope = query.scope;
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
      throw { status: 403, message: 'Akses ditolak' };
    }
    
    return this.format(row);
  }

  async create(data, user) {
    const isSuper = user.roles.includes('SUPER_ADMIN');
    
    if (data.scope === 'GLOBAL' && !isSuper) {
      throw { status: 403, message: 'Hanya Super Admin yang dapat membuat template global' };
    }
    if (data.scope === 'INSTITUTION') {
      if (!data.institutionId) throw { status: 422, message: 'Institution ID wajib untuk scope INSTITUTION' };
      if (!isSuper && !(user.institutions || []).includes(data.institutionId)) {
        throw { status: 403, message: 'Anda tidak memiliki akses ke lembaga ini' };
      }
    }

    if (!data.code || !data.name || !data.eventCode || !data.message) {
      throw { status: 422, message: 'Data tidak lengkap' };
    }

    if (!events.find(e => e.value === data.eventCode)) {
      throw { status: 422, message: 'Event tidak valid' };
    }

    const valResult = validateVariables(data.message, data.eventCode);
    if (!valResult.isValid) {
      throw { status: 422, message: 'Template mengandung variable yang tidak dikenal.', errors: { message: valResult.errors } };
    }

    const existing = await repo.findByCode(data.code);
    if (existing) throw { status: 409, message: 'Kode sudah digunakan' };
    
    if (data.isActive) {
      const activeDuplicate = await repo.getActiveTemplate(data.eventCode, data.scope, data.institutionId);
      if (activeDuplicate) {
        throw { status: 409, message: 'Template aktif untuk event dan scope tersebut sudah tersedia.' };
      }
    }

    const insertId = await repo.create({
      code: data.code.toUpperCase(),
      name: data.name,
      event_code: data.eventCode,
      scope: data.scope,
      institution_id: data.scope === 'INSTITUTION' ? data.institutionId : null,
      message: data.message,
      is_active: data.isActive ? 1 : 0
    });

    return this.getById(insertId, user);
  }

  async update(id, data, user) {
    const existing = await repo.findById(id);
    if (!existing) throw { status: 404, message: 'Template tidak ditemukan' };
    
    if (!this.hasAccessToTemplate(existing, user)) {
      throw { status: 403, message: 'Akses ditolak' };
    }

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.eventCode !== undefined) {
      if (!events.find(e => e.value === data.eventCode)) throw { status: 422, message: 'Event tidak valid' };
      updateData.event_code = data.eventCode;
    }
    if (data.message !== undefined) {
      const eventToValidate = data.eventCode || existing.event_code;
      const valResult = validateVariables(data.message, eventToValidate);
      if (!valResult.isValid) {
        throw { status: 422, message: 'Template mengandung variable yang tidak dikenal.', errors: { message: valResult.errors } };
      }
      updateData.message = data.message;
    }
    
    if (data.isActive !== undefined) {
      if (data.isActive) {
        const eventCode = data.eventCode || existing.event_code;
        const activeDuplicate = await repo.getActiveTemplate(eventCode, existing.scope, existing.institution_id);
        if (activeDuplicate && activeDuplicate.id !== parseInt(id)) {
          throw { status: 409, message: 'Template aktif untuk event dan scope tersebut sudah tersedia.' };
        }
      }
      updateData.is_active = data.isActive ? 1 : 0;
    }
    
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
    const checkCode = await repo.findByCode(duplicateCode);
    if (checkCode) throw { status: 409, message: 'Kode duplikat sudah digunakan' };

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
      throw { status: 403, message: 'Akses ditolak' };
    }
    
    await repo.update(id, { is_active: 0 });
    return this.getById(id, user);
  }

  async remove(id, user) {
    const existing = await repo.findById(id);
    if (!existing) throw { status: 404, message: 'Template tidak ditemukan' };

    if (!this.hasAccessToTemplate(existing, user)) {
      throw { status: 403, message: 'Akses ditolak' };
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
