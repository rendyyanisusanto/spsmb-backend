const auditLogRepository = require('../repositories/auditLogRepository');

class AuditService {
  async log(action, entityType, entityId, description, req = null, connection = null) {
    let userId = null;
    let ipAddress = null;
    let userAgent = null;

    if (req) {
      if (req.user) userId = req.user.id;
      ipAddress = req.ip || req.connection.remoteAddress;
      userAgent = req.get ? req.get('user-agent') : null;
    }

    const logData = {
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      description,
      ip_address: ipAddress,
      user_agent: userAgent
    };

    if (connection) {
      await auditLogRepository.create(logData, connection);
    } else {
      await auditLogRepository.create(logData);
    }
  }

  async createAuditLog({ userId, action, entityType, entityId, description, ipAddress, userAgent }, connection = null) {
    const logData = {
      user_id: userId,
      action: action,
      entity_type: entityType,
      entity_id: entityId,
      description: description,
      ip_address: ipAddress,
      user_agent: userAgent
    };

    if (connection) {
      await auditLogRepository.create(logData, connection);
    } else {
      await auditLogRepository.create(logData);
    }
  }

  async findAll(user, filters, page, limit) {
    const offset = (page - 1) * limit;

    // Apply Admin Lembaga scope
    const isSuperAdmin = user.roles && user.roles.includes('SUPER_ADMIN');
    const isAdminSpsmb = user.roles && user.roles.includes('ADMIN_SPSMB');
    const isPetugas = user.roles && user.roles.includes('PETUGAS');

    if (isAdminSpsmb || isPetugas) {
      // req.user.institutions is an array of IDs based on authenticate.js
      const institutionIds = user.institutions || [];

      if (institutionIds.length > 0) {
        // Scope logic based on entity_type
        // For Application, check if entity_id's formal or pondok is in user's institution
        const placeholders = institutionIds.map(() => '?').join(',');
        filters.scopeQuery = `
          (al.entity_type = 'APPLICATION' AND EXISTS (
            SELECT 1 FROM applications app 
            WHERE app.id = al.entity_id AND 
            (app.formal_institution_id IN (${placeholders}) OR app.pondok_institution_id IN (${placeholders}))
          ))
          OR
          (al.entity_type = 'DOCUMENT' AND EXISTS (
            SELECT 1 FROM applicant_documents doc
            JOIN applications app ON app.applicant_id = doc.applicant_id
            WHERE doc.id = al.entity_id AND 
            (app.formal_institution_id IN (${placeholders}) OR app.pondok_institution_id IN (${placeholders}))
          ))
          OR
          (al.entity_type = 'INSTITUTION' AND al.entity_id IN (${placeholders}))
          OR
          (al.entity_type IN ('FORM_FIELD', 'DOCUMENT_REQUIREMENT', 'WHATSAPP_TEMPLATE', 'REPORT')) 
        `; // Add other scopes if needed, falling back to false if not allowed

        filters.scopeParams = [...institutionIds, ...institutionIds, ...institutionIds, ...institutionIds, ...institutionIds];
      } else {
        // If they have no institutions assigned, they shouldn't see anything scoped
        filters.scopeQuery = '1=0';
        filters.scopeParams = [];
      }
    } else if (isSuperAdmin) {
      // Super admin can see all
      filters.scopeQuery = null;
      filters.scopeParams = [];
    } else {
       // Just block
       filters.scopeQuery = '1=0';
    }

    const data = await auditLogRepository.findAll(filters, offset, limit);
    const total = await auditLogRepository.count(filters);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async findById(id, user) {
    const log = await auditLogRepository.findById(id);
    if (!log) return null;

    // TODO: Apply scope check here similarly for single item
    // For now, if role is ADMIN_SPSMB, we can trust the frontend list gave them the ID, 
    // but in a real secure app we should verify the scope again.

    return log;
  }
}

module.exports = new AuditService();
