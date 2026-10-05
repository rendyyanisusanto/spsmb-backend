const applicationRepository = require('../repositories/applicationRepository');
const auditLogRepository = require('../repositories/auditLogRepository');
const pool = require('../config/database');
const applicationService = require('./applicationService');

class ApplicationStatusService {
  async updateStatus(id, newStatus, user, ipAddress, userAgent) {
    const application = await applicationRepository.findApplicationById(id);
    
    if (!application) {
      const error = new Error('Application not found');
      error.statusCode = 404;
      throw error;
    }

    const scope = applicationService._getInstitutionScope(user);
    if (!applicationService._checkScope(application, scope)) {
      const error = new Error('Forbidden');
      error.statusCode = 403;
      throw error;
    }

    const oldStatus = application.status;

    // Validate transition
    if (oldStatus === newStatus) {
      return application; // Idempotent
    }

    const allowedTransitions = {
      'DRAFT': ['SUBMITTED', 'CANCELLED'],
      'SUBMITTED': ['CANCELLED'],
      'CANCELLED': []
    };

    if (!allowedTransitions[oldStatus] || !allowedTransitions[oldStatus].includes(newStatus)) {
      const error = new Error(`Invalid status transition from ${oldStatus} to ${newStatus}`);
      error.statusCode = 422;
      throw error;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Lock row
      const [rows] = await connection.query('SELECT * FROM applications WHERE id = ? FOR UPDATE', [id]);
      if (rows.length === 0) {
        throw new Error('Application not found during lock');
      }

      // Update status
      await applicationRepository.updateStatus(id, newStatus, connection);

      // Create audit log
      const description = `Status application berubah dari ${oldStatus} menjadi ${newStatus}.`;
      await auditLogRepository.create({
        user_id: user.id,
        action: 'STATUS_CHANGE',
        entity_type: 'APPLICATION',
        entity_id: id,
        description,
        ip_address: ipAddress,
        user_agent: userAgent
      }, connection);

      await connection.commit();

      // Return updated application structure roughly
      application.status = newStatus;
      if (newStatus === 'SUBMITTED' && !application.submitted_at) {
        application.submitted_at = new Date();
      }
      return application;

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = new ApplicationStatusService();
