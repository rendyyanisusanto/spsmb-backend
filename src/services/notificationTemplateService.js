/**
 * Notification Template Service
 * Resolves templates with institution override priority and safely renders placeholders.
 */

const pool = require('../config/database');

class NotificationTemplateService {
  /**
   * Resolve template with institution override priority:
   * 1. Check for active INSTITUTION template matching event and institutionId
   * 2. Fallback to active GLOBAL template matching event
   */
  async resolveTemplate(eventCode, institutionIds = null, connection = null) {
    const db = connection || pool;

    // Normalizing event aliases
    const eventAliases = [eventCode];
    if (eventCode === 'REGISTRATION_CREATED') eventAliases.push('INITIAL_REGISTRATION_SUCCESS');
    if (eventCode === 'REGISTRATION_SUBMITTED') eventAliases.push('FULL_REGISTRATION_SUBMITTED');
    if (eventCode === 'INITIAL_REGISTRATION_SUCCESS') eventAliases.push('REGISTRATION_CREATED');
    if (eventCode === 'FULL_REGISTRATION_SUBMITTED') eventAliases.push('REGISTRATION_SUBMITTED');

    const ids = Array.isArray(institutionIds)
      ? institutionIds.filter(Boolean)
      : (institutionIds ? [institutionIds] : []);

    // 1. Check for active INSTITUTION override template matching event and institution ID
    for (const instId of ids) {
      const [institutionTemplates] = await db.query(
        `SELECT w.*, i.name as institution_name, i.code as institution_code 
         FROM wa_templates w
         LEFT JOIN institutions i ON w.institution_id = i.id
         WHERE (w.event_code IN (?) OR w.code IN (?))
           AND w.scope = 'INSTITUTION' 
           AND w.institution_id = ? 
           AND w.is_active = 1 
         LIMIT 1`,
        [eventAliases, eventAliases, instId]
      );

      if (institutionTemplates.length > 0) {
        const tpl = institutionTemplates[0];
        return {
          template: tpl,
          resolvedScope: 'INSTITUTION',
          institutionId: instId,
          institutionName: tpl.institution_name,
          sourceLabel: `Template khusus ${tpl.institution_name || 'Lembaga'}`
        };
      }
    }

    // 2. Fallback to active GLOBAL template matching event
    const [globalTemplates] = await db.query(
      `SELECT * FROM wa_templates 
       WHERE (event_code IN (?) OR code IN (?))
         AND scope = 'GLOBAL' 
         AND is_active = 1 
       LIMIT 1`,
      [eventAliases, eventAliases]
    );

    if (globalTemplates.length > 0) {
      return {
        template: globalTemplates[0],
        resolvedScope: 'GLOBAL',
        sourceLabel: 'Fallback template global'
      };
    }

    return null;
  }

  /**
   * Render placeholders into message string safely
   */
  renderMessage(templateMessage, context, options = {}) {
    if (!templateMessage || typeof templateMessage !== 'string') {
      return '';
    }

    const frontendBaseUrl = (process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',')[0].trim() : 'http://localhost:5173').replace(/\/+$/, '');
    const continueUrl = options.continueToken 
      ? `${frontendBaseUrl}/pendaftaran/lanjut/${options.continueToken}`
      : (options.continueUrl || `${frontendBaseUrl}/pendaftaran/formulir`);

    const formatRegType = (type) => {
      const map = {
        'NON_FORMAL': 'Non Formal',
        'SMP': 'SMP IT Asy-Syadzili',
        'SMA': 'SMA IT Asy-Syadzili',
        'SMK': 'SMK IT Asy-Syadzili'
      };
      return map[type] || type || '-';
    };

    const guardianName = (context.guardians && context.guardians.length > 0)
      ? (context.guardians.find(g => g.name)?.name || context.guardians[0].name || '')
      : '';

    const replacements = {
      '{{student_name}}': context.student_name || '',
      '{{registration_number}}': context.registration_number || '',
      '{{registration_type}}': formatRegType(context.registration_type),
      '{{gender}}': context.gender === 'MALE' ? 'Laki-laki' : (context.gender === 'FEMALE' ? 'Perempuan' : ''),
      '{{institution_name}}': context.formal_institution_name || (context.registration_type === 'NON_FORMAL' ? 'Non Formal' : '-'),
      '{{pondok_name}}': context.pondok_institution_name || '-',
      '{{continue_url}}': continueUrl,
      '{{parent_name}}': guardianName,
      '{{whatsapp}}': context.applicant_whatsapp || '',
      '{{previous_school}}': context.previous_school || ''
    };

    let rendered = templateMessage;
    for (const [key, value] of Object.entries(replacements)) {
      rendered = rendered.split(key).join(value);
    }

    // Clean up any remaining unknown {{placeholder}} tags
    rendered = rendered.replace(/\{\{[^}]+\}\}/g, '').trim();

    return rendered;
  }
}

const defaultInstance = new NotificationTemplateService();

module.exports = defaultInstance;
module.exports.NotificationTemplateService = NotificationTemplateService;
