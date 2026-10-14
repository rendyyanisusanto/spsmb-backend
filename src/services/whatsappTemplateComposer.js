/**
 * WhatsApp Template Composer Service
 * Sprint 3.4: Assembles a single unified message from three logical sections:
 * 1. Global / Super Admin section
 * 2. Pondok / PPSQ section (PPSQ 1 Putra or PPSQ 2 Putri)
 * 3. Formal Institution section (SMP, SMA, SMK - omitted if Non-Formal or not selected)
 * 
 * Safely renders placeholders and avoids hanging separators or empty sections.
 */

const pool = require('../config/database');
const defaultRouting = require('./notificationRoutingService');

class WhatsAppTemplateComposer {
  constructor(routingService = null) {
    this.routing = routingService || defaultRouting;
  }

  /**
   * Helper to normalize event code aliases
   */
  _getEventAliases(eventCode) {
    const aliases = [eventCode];
    if (eventCode === 'REGISTRATION_CREATED') aliases.push('INITIAL_REGISTRATION_SUCCESS');
    if (eventCode === 'REGISTRATION_SUBMITTED') aliases.push('FULL_REGISTRATION_SUBMITTED');
    if (eventCode === 'INITIAL_REGISTRATION_SUCCESS') aliases.push('REGISTRATION_CREATED');
    if (eventCode === 'FULL_REGISTRATION_SUBMITTED') aliases.push('REGISTRATION_SUBMITTED');
    return aliases;
  }

  /**
   * Safely render placeholders into template text without leaving undefined/null/raw tokens
   */
  renderPlaceholders(templateText, context, options = {}) {
    if (!templateText || typeof templateText !== 'string') {
      return '';
    }

    const frontendBaseUrl = (process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',')[0].trim() : 'http://localhost:5173').replace(/\/+$/, '');
    const continueUrl = options.continueToken 
      ? `${frontendBaseUrl}/pendaftaran/lanjut/${options.continueToken}`
      : (options.continueUrl || context.continue_url || `${frontendBaseUrl}/pendaftaran/formulir`);

    const formatGender = (gender) => {
      if (!gender) return '';
      if (gender === 'MALE' || gender === 'L' || gender === 'Laki-laki') return 'Laki-laki';
      if (gender === 'FEMALE' || gender === 'P' || gender === 'Perempuan') return 'Perempuan';
      return gender;
    };

    const formatRegType = (type) => {
      const map = {
        'NON_FORMAL': 'Non Formal',
        'SMP': 'SMP IT Asy-Syadzili',
        'SMA': 'SMA IT Asy-Syadzili',
        'SMK': 'SMK IT Asy-Syadzili'
      };
      return map[type] || type || '';
    };

    const guardianName = (context.guardians && context.guardians.length > 0)
      ? (context.guardians.find(g => g.name)?.name || context.guardians[0].name || '')
      : (context.parent_name || context.guardian_name || '');

    const guardianPhone = (context.guardians && context.guardians.length > 0)
      ? (context.guardians.find(g => g.phone)?.phone || context.guardians[0].phone || '')
      : (context.guardian_phone || '');

    const tokenMap = {
      student_name: context.student_name || context.applicant_name || context.full_name || '',
      applicant_name: context.student_name || context.applicant_name || context.full_name || '',
      registration_number: context.registration_number || '',
      registration_type: formatRegType(context.registration_type),
      institution_name: context.formal_institution_name || context.institution_name || '',
      formal_institution_name: context.formal_institution_name || context.institution_name || '',
      pondok_name: context.pondok_institution_name || context.pondok_name || '',
      gender: formatGender(context.gender),
      continue_url: continueUrl,
      parent_name: guardianName,
      guardian_name: guardianName,
      guardian_phone: guardianPhone,
      whatsapp: context.applicant_whatsapp || context.whatsapp || '',
      address: context.applicant_address || context.address || '',
      applicant_address: context.applicant_address || context.address || '',
      previous_school: context.previous_school || '',
      status: context.status || context.registration_status || '',
      registration_status: context.status || context.registration_status || '',
      registration_date: context.created_at ? new Date(context.created_at).toLocaleDateString('id-ID') : (context.registration_date || ''),
      created_at: context.created_at ? new Date(context.created_at).toLocaleDateString('id-ID') : (context.registration_date || '')
    };

    let rendered = templateText;
    for (const [key, val] of Object.entries(tokenMap)) {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      rendered = rendered.replace(regex, val !== null && val !== undefined ? String(val) : '');
    }

    // Clean up any remaining unknown tokens {{...}} so no raw tokens or undefined display
    rendered = rendered.replace(/\{\{[^}]+\}\}/g, '');

    return rendered.trim();
  }

  /**
   * Compose a single unified WhatsApp message for a given application and event
   * 
   * @param {number|string} applicationId
   * @param {string} eventCode
   * @param {object} options
   * @returns {Promise<{ composedMessage: string, sections: object, primaryTemplateId: number|null }>}
   */
  async composeForApplication(applicationId, eventCode, options = {}) {
    const db = options.connection || pool;

    // 1. Fetch application context if not provided
    const context = options.context || await this.routing.getApplicationContext(applicationId, db);
    if (!context) {
      return {
        composedMessage: '',
        sections: {},
        primaryTemplateId: null,
        error: 'APPLICATION_NOT_FOUND'
      };
    }

    const eventAliases = this._getEventAliases(eventCode);

    // 2. Fetch Active Global Section
    const [globalRows] = await db.query(
      `SELECT * FROM wa_templates 
       WHERE (event_code IN (?) OR code IN (?))
         AND (section_type = 'GLOBAL' OR (scope = 'GLOBAL' AND institution_id IS NULL))
         AND is_active = 1 
       LIMIT 1`,
      [eventAliases, eventAliases]
    );
    const globalSection = globalRows[0] || null;

    // 3. Fetch Active Pondok Section
    let pondokSection = null;
    if (context.pondok_institution_id) {
      const [pondokRows] = await db.query(
        `SELECT w.*, i.name as institution_name 
         FROM wa_templates w
         LEFT JOIN institutions i ON w.institution_id = i.id
         WHERE (w.event_code IN (?) OR w.code IN (?))
           AND (w.section_type = 'PONDOK' OR (w.scope = 'INSTITUTION' AND i.institution_type = 'PONDOK'))
           AND w.institution_id = ?
           AND w.is_active = 1 
         LIMIT 1`,
        [eventAliases, eventAliases, context.pondok_institution_id]
      );
      if (pondokRows.length > 0) {
        pondokSection = pondokRows[0];
      }
    }

    // 4. Fetch Active Formal Section (omitted if NON_FORMAL or no formal_institution_id)
    let formalSection = null;
    if (context.formal_institution_id && context.registration_type !== 'NON_FORMAL') {
      const [formalRows] = await db.query(
        `SELECT w.*, i.name as institution_name 
         FROM wa_templates w
         LEFT JOIN institutions i ON w.institution_id = i.id
         WHERE (w.event_code IN (?) OR w.code IN (?))
           AND (w.section_type = 'FORMAL' OR (w.scope = 'INSTITUTION' AND i.institution_type IN ('SMP', 'SMA', 'SMK')))
           AND w.institution_id = ?
           AND w.is_active = 1 
         LIMIT 1`,
        [eventAliases, eventAliases, context.formal_institution_id]
      );
      if (formalRows.length > 0) {
        formalSection = formalRows[0];
      }
    }

    // 5. Render placeholders on each section
    const renderedParts = [];

    let renderedGlobal = '';
    if (globalSection && globalSection.message) {
      renderedGlobal = this.renderPlaceholders(globalSection.message, context, options);
      if (renderedGlobal) renderedParts.push(renderedGlobal);
    }

    let renderedPondok = '';
    if (pondokSection && pondokSection.message) {
      renderedPondok = this.renderPlaceholders(pondokSection.message, context, options);
      if (renderedPondok) renderedParts.push(renderedPondok);
    }

    let renderedFormal = '';
    if (formalSection && formalSection.message) {
      renderedFormal = this.renderPlaceholders(formalSection.message, context, options);
      if (renderedFormal) renderedParts.push(renderedFormal);
    }

    // 6. Assemble into single unified string separated by double newlines
    const composedMessage = renderedParts.filter(Boolean).join('\n\n').trim();

    return {
      composedMessage,
      sections: {
        global: globalSection ? { id: globalSection.id, name: globalSection.name, rendered: renderedGlobal } : null,
        pondok: pondokSection ? { id: pondokSection.id, name: pondokSection.name, institutionId: context.pondok_institution_id, rendered: renderedPondok } : null,
        formal: formalSection ? { id: formalSection.id, name: formalSection.name, institutionId: context.formal_institution_id, rendered: renderedFormal } : null
      },
      primaryTemplateId: globalSection?.id || pondokSection?.id || formalSection?.id || null
    };
  }

  /**
   * Preview a composed message with mock context data (safe, does not send WhatsApp)
   */
  async composePreview({ eventCode, pondokInstitutionId, formalInstitutionId, customGlobal, customPondok, customFormal, connection = null }) {
    const db = connection || pool;
    const eventAliases = this._getEventAliases(eventCode || 'REGISTRATION_CREATED');

    // Get institution names
    let pondokName = 'Pondok Pesantren Asy-Syadzili 1';
    let gender = 'Laki-laki';
    if (pondokInstitutionId) {
      const [pRows] = await db.query('SELECT name, gender_scope FROM institutions WHERE id = ?', [pondokInstitutionId]);
      if (pRows.length > 0) {
        pondokName = pRows[0].name;
        if (pRows[0].gender_scope === 'FEMALE') gender = 'Perempuan';
      }
    }

    let formalName = 'SMK IT Asy-Syadzili';
    let regType = 'SMK';
    if (formalInstitutionId) {
      const [fRows] = await db.query('SELECT name, institution_type FROM institutions WHERE id = ?', [formalInstitutionId]);
      if (fRows.length > 0) {
        formalName = fRows[0].name;
        regType = fRows[0].institution_type;
      }
    } else if (formalInstitutionId === null || formalInstitutionId === 0) {
      formalName = '';
      regType = 'NON_FORMAL';
    }

    const frontendBaseUrl = (process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',')[0].trim() : 'http://localhost:5173').replace(/\/+$/, '');

    const mockContext = {
      student_name: gender === 'Perempuan' ? 'Siti Aisyah' : 'Ahmad Fauzan',
      registration_number: 'SPSMB-2027-00123',
      registration_type: regType,
      formal_institution_name: formalName,
      pondok_institution_name: pondokName,
      gender: gender,
      continue_url: `${frontendBaseUrl}/pendaftaran/lanjut/sample-preview-token`,
      parent_name: 'H. Muhammad Ridwan',
      guardian_name: 'H. Muhammad Ridwan',
      guardian_phone: '081234567890',
      applicant_whatsapp: '081987654321',
      applicant_address: 'Pakis, Malang, Jawa Timur',
      previous_school: 'SMP Negeri 1 Contoh',
      status: 'SUBMITTED',
      created_at: new Date()
    };

    // Load templates if custom text not provided
    let globalText = customGlobal;
    if (globalText === undefined) {
      const [gRows] = await db.query(
        `SELECT message FROM wa_templates 
         WHERE (event_code IN (?) OR code IN (?))
           AND (section_type = 'GLOBAL' OR (scope = 'GLOBAL' AND institution_id IS NULL))
           AND is_active = 1 LIMIT 1`,
        [eventAliases, eventAliases]
      );
      globalText = gRows[0]?.message || '';
    }

    let pondokText = customPondok;
    if (pondokText === undefined && pondokInstitutionId) {
      const [pRows] = await db.query(
        `SELECT message FROM wa_templates 
         WHERE (event_code IN (?) OR code IN (?))
           AND (section_type = 'PONDOK' OR scope = 'INSTITUTION')
           AND institution_id = ?
           AND is_active = 1 LIMIT 1`,
        [eventAliases, eventAliases, pondokInstitutionId]
      );
      pondokText = pRows[0]?.message || '';
    }

    let formalText = customFormal;
    if (formalText === undefined && formalInstitutionId && regType !== 'NON_FORMAL') {
      const [fRows] = await db.query(
        `SELECT message FROM wa_templates 
         WHERE (event_code IN (?) OR code IN (?))
           AND (section_type = 'FORMAL' OR scope = 'INSTITUTION')
           AND institution_id = ?
           AND is_active = 1 LIMIT 1`,
        [eventAliases, eventAliases, formalInstitutionId]
      );
      formalText = fRows[0]?.message || '';
    }

    const renderedGlobal = this.renderPlaceholders(globalText, mockContext);
    const renderedPondok = pondokText ? this.renderPlaceholders(pondokText, mockContext) : '';
    const renderedFormal = (formalText && regType !== 'NON_FORMAL') ? this.renderPlaceholders(formalText, mockContext) : '';

    const parts = [renderedGlobal, renderedPondok, renderedFormal].filter(Boolean);
    const composedMessage = parts.join('\n\n').trim();

    return {
      composedMessage,
      mockContext,
      renderedSections: {
        global: renderedGlobal,
        pondok: renderedPondok,
        formal: renderedFormal
      }
    };
  }
}

const defaultInstance = new WhatsAppTemplateComposer();

module.exports = defaultInstance;
module.exports.WhatsAppTemplateComposer = WhatsAppTemplateComposer;
