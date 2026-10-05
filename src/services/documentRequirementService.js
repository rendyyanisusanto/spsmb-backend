
const repo = require('../repositories/documentRequirementRepository');
const targetRepo = require('../repositories/formTargetRepository');
const docTypeRepo = require('../repositories/documentTypeRepository');
const docTypeService = require('./documentTypeService');

class DocumentRequirementService {
  format(row) {
    return {
      id: row.id,
      isRequired: !!row.is_required,
      sortOrder: row.sort_order,
      target: {
        id: row.form_target_id,
        code: row.target_code,
        name: row.target_name,
        targetType: row.target_type,
        institutionId: row.institution_id
      },
      documentType: {
        id: row.document_type_id,
        code: row.doc_code,
        name: row.doc_name,
        description: row.description,
        allowedExtensions: docTypeService.formatExtensions(row.allowed_extensions),
        maxSizeMb: row.max_size_mb,
        isActive: !!row.doc_is_active
      }
    };
  }

  hasAccessToTarget(target, user) {
    if (user.roles.includes('SUPER_ADMIN')) return true;
    
    if (target.target_type === 'COMMON' || target.target_type === 'PONDOK_COMMON') {
      return false; // read-only access is handled separately, write access is false
    }
    
    const userInst = user.institutions || [];
    return userInst.some(id => String(id) === String(target.institution_id));
  }

  async getAll(query, user) {
    const isSuper = user.roles.includes('SUPER_ADMIN');
    const userInst = user.institutions || [];
    
    const rows = await repo.findAll({ targetId: query.targetId });
    
    let filtered = rows;
    if (!isSuper) {
      filtered = rows.filter(r => 
        r.target_type === 'COMMON' || 
        r.target_type === 'PONDOK_COMMON' || 
        (r.target_type === 'INSTITUTION' && userInst.some(id => String(id) === String(r.institution_id)))
      );
    }
    
    return { data: filtered.map(r => this.format(r)) };
  }
  
  async getEffective(query, user) {
    const isSuper = user.roles.includes('SUPER_ADMIN');
    const userInst = user.institutions || [];
    
    let targetInstId = query.institutionId ? parseInt(query.institutionId) : null;
    let includePondok = query.includePondok === 'true' || query.includePondok === true;
    
    if (!isSuper && targetInstId && !userInst.includes(targetInstId)) {
      throw { status: 403, message: 'Anda tidak memiliki akses ke lembaga ini' };
    }
    
    // Fetch all requirements
    const allReqs = await repo.findAll({});
    
    // Filter out inactive document types
    const activeReqs = allReqs.filter(r => !!r.doc_is_active);
    
    const commonReqs = activeReqs.filter(r => r.target_type === 'COMMON');
    const pondokReqs = includePondok ? activeReqs.filter(r => r.target_type === 'PONDOK_COMMON') : [];
    const instReqs = targetInstId ? activeReqs.filter(r => r.target_type === 'INSTITUTION' && r.institution_id === targetInstId) : [];
    
    const map = new Map();
    
    // Helper to merge
    const mergeIntoMap = (reqs, sourceLabel) => {
      for (const r of reqs) {
        const docId = r.document_type_id;
        if (!map.has(docId)) {
          map.set(docId, {
             documentTypeId: docId,
             code: r.doc_code,
             name: r.doc_name,
             description: r.description,
             required: !!r.is_required,
             allowedExtensions: docTypeService.formatExtensions(r.allowed_extensions),
             maxSizeMb: r.max_size_mb,
             sortOrder: r.sort_order,
             source: sourceLabel,
             _targetType: r.target_type // For sorting
          });
        } else {
          // Resolve duplicate: required = true wins
          const existing = map.get(docId);
          if (r.is_required) existing.required = true;
          // Most specific target source logic
          const specificity = { 'INSTITUTION': 3, 'PONDOK_COMMON': 2, 'COMMON': 1 };
          if (specificity[r.target_type] > specificity[existing._targetType]) {
            existing.source = sourceLabel;
            existing._targetType = r.target_type;
            existing.sortOrder = r.sort_order;
          }
        }
      }
    };
    
    mergeIntoMap(commonReqs, 'COMMON');
    mergeIntoMap(pondokReqs, 'PONDOK_COMMON');
    mergeIntoMap(instReqs, 'INSTITUTION');
    
    const requirements = Array.from(map.values());
    requirements.sort((a, b) => {
      const specA = { 'INSTITUTION': 3, 'PONDOK_COMMON': 2, 'COMMON': 1 }[a._targetType];
      const specB = { 'INSTITUTION': 3, 'PONDOK_COMMON': 2, 'COMMON': 1 }[b._targetType];
      if (specA !== specB) return specB - specA;
      return a.sortOrder - b.sortOrder;
    });
    
    requirements.forEach(r => delete r._targetType);
    
    return {
       data: {
         institution: targetInstId ? { id: targetInstId } : null,
         requirements
       }
    };
  }

  async getById(id) {
    const row = await repo.findById(id);
    if (!row) throw { status: 404, message: 'Persyaratan tidak ditemukan' };
    return this.format(row);
  }

  async create(data, user) {
    const target = await targetRepo.findById(data.formTargetId);
    if (!target) throw { status: 404, message: 'Target tidak ditemukan' };
    
    if (!this.hasAccessToTarget(target, user)) {
      throw { status: 403, message: 'Akses ditolak untuk mengelola target ini' };
    }
    
    const docType = await docTypeRepo.findById(data.documentTypeId);
    if (!docType) throw { status: 404, message: 'Document Type tidak ditemukan' };
    
    if (!docType.is_active) {
      throw { status: 422, message: 'Document Type sedang tidak aktif' };
    }

    const duplicate = await repo.findByTargetAndDoc(data.formTargetId, data.documentTypeId);
    if (duplicate) {
      throw { status: 409, message: 'Dokumen tersebut sudah menjadi persyaratan pada target ini.' };
    }

    const insertId = await repo.create({
      form_target_id: data.formTargetId,
      document_type_id: data.documentTypeId,
      is_required: data.isRequired ? 1 : 0,
      sort_order: data.sortOrder || 1
    });

    return this.getById(insertId);
  }

  async update(id, data, user) {
    const existing = await repo.findById(id);
    if (!existing) throw { status: 404, message: 'Persyaratan tidak ditemukan' };
    
    if (!this.hasAccessToTarget({ target_type: existing.target_type, institution_id: existing.institution_id }, user)) {
      throw { status: 403, message: 'Akses ditolak' };
    }

    const updateData = {};
    if (data.isRequired !== undefined) updateData.is_required = data.isRequired ? 1 : 0;
    if (data.sortOrder !== undefined) updateData.sort_order = data.sortOrder;
    
    if (Object.keys(updateData).length > 0) {
      await repo.update(id, updateData);
    }
    return this.getById(id);
  }

  async updateRequired(id, isRequired, user) {
    return this.update(id, { isRequired }, user);
  }

  async updateOrder(id, sortOrder, user) {
    return this.update(id, { sortOrder }, user);
  }
  
  async reorder(requirements, user) {
    // Basic implementation that updates one by one and checks permissions
    for (const req of requirements) {
      const existing = await repo.findById(req.id);
      if (existing && this.hasAccessToTarget({ target_type: existing.target_type, institution_id: existing.institution_id }, user)) {
        await repo.update(req.id, { sort_order: req.sortOrder });
      }
    }
    return { success: true };
  }

  async remove(id, user) {
    const existing = await repo.findById(id);
    if (!existing) throw { status: 404, message: 'Persyaratan tidak ditemukan' };

    if (!this.hasAccessToTarget({ target_type: existing.target_type, institution_id: existing.institution_id }, user)) {
      throw { status: 403, message: 'Akses ditolak' };
    }

    await repo.remove(id);
    return { success: true };
  }
}
module.exports = new DocumentRequirementService();
