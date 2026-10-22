const crmTemplateRepository = require('../repositories/crmTemplateRepository');
const auditService = require('./auditService');
const { AUDIT_ACTIONS } = require('../constants/auditActions');
const { CRM_TEMPLATE_CATEGORIES, getCrmTemplateCategoryOptions } = require('../constants/crmTemplateCategories');
const { getAvailablePlaceholders, renderSamplePreview, renderTemplate } = require('../utils/crmTemplateRenderer');

class CrmTemplateService {
  _getInstitutionScope(user) {
    if (!user) return [];
    const isSuperAdmin = (user.roles && user.roles.includes('SUPER_ADMIN')) || user.primaryRole === 'SUPER_ADMIN';
    if (isSuperAdmin) {
      return null; // Unlimited scope
    }

    const institutions = user.institutions || [];
    return institutions.map(i => (typeof i === 'object' && i !== null ? i.id : i));
  }

  _isSuperAdmin(user) {
    if (!user) return false;
    return (user.roles && user.roles.includes('SUPER_ADMIN')) || user.primaryRole === 'SUPER_ADMIN';
  }

  _isPondokAdmin(user) {
    if (this._isSuperAdmin(user)) return true;
    const insts = user?.institutions || [];
    return insts.some(i => {
      const type = (typeof i === 'object' ? i.institution_type : '') || '';
      const code = (typeof i === 'object' ? i.code : '') || '';
      const name = (typeof i === 'object' ? i.name : '') || '';
      return type === 'PONDOK' || code.includes('PPSQ') || name.toLowerCase().includes('pondok');
    });
  }

  async getTemplates(params = {}, user) {
    const scope = this._getInstitutionScope(user);

    if (scope !== null) {
      if (params.institutionId) {
        const requestedId = Number(params.institutionId);
        if (!scope.map(Number).includes(requestedId)) {
          const err = new Error('Anda tidak memiliki izin untuk melihat template lembaga ini.');
          err.statusCode = 403;
          throw err;
        }
      } else {
        params.institutionScope = scope;
      }
    }

    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 10));
    params.page = page;
    params.limit = limit;

    const templates = await crmTemplateRepository.findTemplates(params);
    const total = await crmTemplateRepository.countTemplates(params);

    return {
      data: templates.map(t => ({
        id: t.id,
        institutionId: t.institution_id,
        institution: t.institution_id ? {
          id: t.institution_id,
          name: t.institution_name,
          code: t.institution_code
        } : null,
        name: t.name,
        eventKey: t.event_key,
        messageBody: t.message_body,
        isActive: Boolean(t.is_active),
        createdBy: t.created_by_user_id ? {
          id: t.created_by_user_id,
          name: t.created_by_name
        } : null,
        updatedBy: t.updated_by_user_id ? {
          id: t.updated_by_user_id,
          name: t.updated_by_name
        } : null,
        createdAt: t.created_at,
        updatedAt: t.updated_at
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async getTemplateById(id, user) {
    const template = await crmTemplateRepository.findTemplateById(id);
    if (!template) {
      const err = new Error('Template CRM tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }

    // Global templates (institution_id === null) are visible to everyone
    if (template.institution_id !== null) {
      const scope = this._getInstitutionScope(user);
      if (scope !== null && !scope.map(Number).includes(Number(template.institution_id))) {
        const err = new Error('Anda tidak memiliki izin untuk mengakses template lembaga ini.');
        err.statusCode = 403;
        throw err;
      }
    }

    return {
      id: template.id,
      institutionId: template.institution_id,
      institution: template.institution_id ? {
        id: template.institution_id,
        name: template.institution_name,
        code: template.institution_code
      } : null,
      name: template.name,
      eventKey: template.event_key,
      messageBody: template.message_body,
      isActive: Boolean(template.is_active),
      createdBy: template.created_by_user_id ? {
        id: template.created_by_user_id,
        name: template.created_by_name,
        username: template.created_by_username
      } : null,
      updatedBy: template.updated_by_user_id ? {
        id: template.updated_by_user_id,
        name: template.updated_by_name,
        username: template.updated_by_username
      } : null,
      createdAt: template.created_at,
      updatedAt: template.updated_at
    };
  }

  async createTemplate(data, user, req = null) {
    const isSuper = this._isSuperAdmin(user);
    const scope = this._getInstitutionScope(user);

    if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
      const err = new Error('Nama template wajib diisi.');
      err.statusCode = 422;
      throw err;
    }

    if (!data.event_key || !CRM_TEMPLATE_CATEGORIES[data.event_key]) {
      const err = new Error(`Kategori template tidak valid. Pilihan: ${Object.keys(CRM_TEMPLATE_CATEGORIES).join(', ')}`);
      err.statusCode = 422;
      throw err;
    }

    if (!data.message_body || typeof data.message_body !== 'string' || data.message_body.trim() === '') {
      const err = new Error('Isi pesan template wajib diisi.');
      err.statusCode = 422;
      throw err;
    }

    let institutionId = data.institution_id !== undefined && data.institution_id !== null && data.institution_id !== ''
      ? Number(data.institution_id)
      : null;

    // Non-superadmin cannot create global templates
    if (institutionId === null && !isSuper) {
      if (scope !== null && scope.length > 0) {
        institutionId = scope[0]; // Default to user's assigned institution
      } else {
        const err = new Error('Hanya Super Admin yang dapat membuat template pesan global.');
        err.statusCode = 403;
        throw err;
      }
    }

    // Verify institution scope for non-superadmin
    if (institutionId !== null && scope !== null) {
      if (!scope.map(Number).includes(institutionId)) {
        const err = new Error('Anda tidak memiliki izin untuk membuat template pada lembaga ini.');
        err.statusCode = 403;
        throw err;
      }
    }

    const templateId = await crmTemplateRepository.createTemplate({
      institution_id: institutionId,
      name: data.name.trim(),
      event_key: data.event_key,
      message_body: data.message_body.trim(),
      is_active: data.is_active !== undefined ? (Number(data.is_active) ? 1 : 0) : 1,
      created_by_user_id: user.id,
      updated_by_user_id: user.id
    });

    if (auditService && auditService.log) {
      await auditService.log({
        userId: user.id,
        action: AUDIT_ACTIONS.CRM_WA_TEMPLATE_CREATE,
        entityType: 'CRM_WA_TEMPLATE',
        entityId: templateId,
        institutionId: institutionId,
        newData: { name: data.name, event_key: data.event_key, institution_id: institutionId },
        ipAddress: req?.ip || null,
        userAgent: req?.get ? req.get('user-agent') : null
      });
    }

    return this.getTemplateById(templateId, user);
  }

  async updateTemplate(id, data, user, req = null) {
    const existing = await crmTemplateRepository.findTemplateById(id);
    if (!existing) {
      const err = new Error('Template CRM tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }

    const isSuper = this._isSuperAdmin(user);
    const scope = this._getInstitutionScope(user);

    // If template is global, only Super Admin can edit it
    if (existing.institution_id === null && !isSuper) {
      const err = new Error('Hanya Super Admin yang berwenang mengubah template global.');
      err.statusCode = 403;
      throw err;
    }

    // If template belongs to an institution, verify scope
    if (existing.institution_id !== null && scope !== null) {
      if (!scope.map(Number).includes(Number(existing.institution_id))) {
        const err = new Error('Anda tidak memiliki izin untuk mengubah template lembaga ini.');
        err.statusCode = 403;
        throw err;
      }
    }

    const updatePayload = {
      updated_by_user_id: user.id
    };

    if (data.name !== undefined) {
      if (typeof data.name !== 'string' || data.name.trim() === '') {
        const err = new Error('Nama template tidak boleh kosong.');
        err.statusCode = 422;
        throw err;
      }
      updatePayload.name = data.name.trim();
    }

    if (data.event_key !== undefined) {
      if (!CRM_TEMPLATE_CATEGORIES[data.event_key]) {
        const err = new Error(`Kategori template tidak valid.`);
        err.statusCode = 422;
        throw err;
      }
      updatePayload.event_key = data.event_key;
    }

    if (data.message_body !== undefined) {
      if (typeof data.message_body !== 'string' || data.message_body.trim() === '') {
        const err = new Error('Isi pesan template tidak boleh kosong.');
        err.statusCode = 422;
        throw err;
      }
      updatePayload.message_body = data.message_body.trim();
    }

    if (data.is_active !== undefined) {
      updatePayload.is_active = Number(data.is_active) ? 1 : 0;
    }

    // Changing institution
    if (data.institution_id !== undefined) {
      const newInstId = data.institution_id !== null && data.institution_id !== ''
        ? Number(data.institution_id)
        : null;

      if (newInstId === null && !isSuper) {
        const err = new Error('Hanya Super Admin yang dapat mengubah template menjadi template global.');
        err.statusCode = 403;
        throw err;
      }
      if (newInstId !== null && scope !== null && !scope.map(Number).includes(newInstId)) {
        const err = new Error('Anda tidak memiliki izin memindahkan template ke lembaga tersebut.');
        err.statusCode = 403;
        throw err;
      }
      updatePayload.institution_id = newInstId;
    }

    await crmTemplateRepository.updateTemplate(id, updatePayload);

    if (auditService && auditService.log) {
      await auditService.log({
        userId: user.id,
        action: AUDIT_ACTIONS.CRM_WA_TEMPLATE_UPDATE,
        entityType: 'CRM_WA_TEMPLATE',
        entityId: id,
        institutionId: existing.institution_id,
        oldData: { name: existing.name, is_active: existing.is_active },
        newData: updatePayload,
        ipAddress: req?.ip || null,
        userAgent: req?.get ? req.get('user-agent') : null
      });
    }

    return this.getTemplateById(id, user);
  }

  async toggleStatus(id, isActive, user, req = null) {
    return this.updateTemplate(id, { is_active: isActive }, user, req);
  }

  async deleteTemplate(id, user, req = null) {
    const existing = await crmTemplateRepository.findTemplateById(id);
    if (!existing) {
      const err = new Error('Template CRM tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }

    const isSuper = this._isSuperAdmin(user);
    const scope = this._getInstitutionScope(user);

    if (existing.institution_id === null && !isSuper) {
      const err = new Error('Hanya Super Admin yang berwenang menghapus template global.');
      err.statusCode = 403;
      throw err;
    }

    if (existing.institution_id !== null && scope !== null) {
      if (!scope.map(Number).includes(Number(existing.institution_id))) {
        const err = new Error('Anda tidak memiliki izin menghapus template lembaga ini.');
        err.statusCode = 403;
        throw err;
      }
    }

    await crmTemplateRepository.deleteTemplate(id);

    if (auditService && auditService.log) {
      await auditService.log({
        userId: user.id,
        action: AUDIT_ACTIONS.CRM_WA_TEMPLATE_DELETE,
        entityType: 'CRM_WA_TEMPLATE',
        entityId: id,
        institutionId: existing.institution_id,
        oldData: { name: existing.name },
        ipAddress: req?.ip || null,
        userAgent: req?.get ? req.get('user-agent') : null
      });
    }

    return true;
  }

  previewTemplate(templateText, customOverrides = {}) {
    if (!templateText) {
      return {
        renderedText: '',
        usedVariables: [],
        missingVariables: [],
        isValid: true
      };
    }

    const result = renderSamplePreview(templateText);
    return {
      renderedText: result.text,
      usedVariables: result.usedVariables,
      missingVariables: result.missingVariables,
      isValid: result.isValid
    };
  }

  getCategories() {
    return getCrmTemplateCategoryOptions();
  }

  getPlaceholders() {
    return getAvailablePlaceholders();
  }
}

module.exports = new CrmTemplateService();
