/**
 * Notification Routing Service
 * Resolves recipients dynamically based on event, gender, pondok, and formal institutions.
 * Handles deduplication, normalization, and graceful handling of missing data.
 */

const pool = require('../config/database');
const ruleRepo = require('../repositories/waNotificationRuleRepository');
const gowaService = require('./gowaService');

class NotificationRoutingService {
  /**
   * Get full application context including applicant, institutions, and guardians
   */
  async getApplicationContext(applicationId, connection = null) {
    const db = connection || pool;
    const query = `
      SELECT 
        a.id, a.registration_number, a.applicant_id, a.registration_type,
        a.formal_institution_id, a.pondok_institution_id, a.status,
        a.step_completed, a.continue_token_hash, a.continue_token_expires_at,
        ap.full_name as student_name, ap.gender, ap.whatsapp as applicant_whatsapp,
        ap.address as applicant_address, ap.previous_school,
        fi.name as formal_institution_name, fi.code as formal_institution_code,
        pi.name as pondok_institution_name, pi.code as pondok_institution_code
      FROM applications a
      JOIN applicants ap ON a.applicant_id = ap.id
      LEFT JOIN institutions fi ON a.formal_institution_id = fi.id
      LEFT JOIN institutions pi ON a.pondok_institution_id = pi.id
      WHERE a.id = ?
    `;

    const [rows] = await db.query(query, [applicationId]);
    if (rows.length === 0) return null;

    const application = rows[0];

    // Fetch guardians
    const [guardians] = await db.query(
      `SELECT * FROM applicant_guardians 
       WHERE applicant_id = ? 
       ORDER BY FIELD(relationship, 'FATHER', 'MOTHER', 'GUARDIAN'), id ASC`,
      [application.applicant_id]
    );

    application.guardians = guardians;
    return application;
  }

  /**
   * Match active notification rules for the given event, registration type, and gender
   */
  async getMatchingRules(eventCode, registrationType, gender, connection = null) {
    return ruleRepo.findMatchingRules(eventCode, registrationType, gender, connection);
  }

  /**
   * Resolve and deduplicate recipient list based on matching rules and application context
   */
  async resolveRecipients(context, rules, options = {}) {
    const db = options.connection || pool;
    if (!rules || rules.length === 0) {
      return { recipients: [], skipped: [] };
    }

    const ruleIds = rules.map(r => r.id);
    const ruleRecipients = await ruleRepo.findRecipientsByRuleIds(ruleIds, db);

    const candidates = [];
    const skipped = [];
    const seenRuleActions = new Set(); // To avoid duplicate action evaluations across rules

    for (const rr of ruleRecipients) {
      const actionKey = `${rr.recipient_type}:${rr.institution_source}`;
      if (seenRuleActions.has(actionKey)) {
        continue;
      }
      seenRuleActions.add(actionKey);

      switch (rr.recipient_type) {
        case 'SUPER_ADMIN': {
          const [superAdmins] = await db.query(`
            SELECT DISTINCT u.id, u.name, u.phone
            FROM users u
            JOIN user_roles ur ON u.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE r.name = 'SUPER_ADMIN'
              AND u.is_active = 1
          `);

          for (const sa of superAdmins) {
            candidates.push({
              recipientType: 'SUPER_ADMIN',
              name: sa.name,
              rawPhone: sa.phone,
              identifier: `user_${sa.id}`,
              userId: sa.id,
              institutionSource: 'NONE'
            });
          }
          break;
        }

        case 'INSTITUTION_ADMIN': {
          if (rr.institution_source === 'PONDOK') {
            if (context.pondok_institution_id) {
              const [pondokAdmins] = await db.query(`
                SELECT DISTINCT u.id, u.name, u.phone
                FROM users u
                JOIN user_institutions ui ON u.id = ui.user_id
                WHERE ui.institution_id = ?
                  AND u.is_active = 1
              `, [context.pondok_institution_id]);

              for (const pa of pondokAdmins) {
                candidates.push({
                  recipientType: 'INSTITUTION_ADMIN',
                  name: pa.name,
                  rawPhone: pa.phone,
                  identifier: `user_${pa.id}`,
                  userId: pa.id,
                  institutionSource: 'PONDOK',
                  institutionId: context.pondok_institution_id,
                  institutionName: context.pondok_institution_name
                });
              }
            } else {
              skipped.push({
                recipientType: 'INSTITUTION_ADMIN',
                institutionSource: 'PONDOK',
                reason: 'NO_PONDOK_INSTITUTION_ID'
              });
            }
          } else if (rr.institution_source === 'FORMAL') {
            if (context.formal_institution_id) {
              const [formalAdmins] = await db.query(`
                SELECT DISTINCT u.id, u.name, u.phone
                FROM users u
                JOIN user_institutions ui ON u.id = ui.user_id
                WHERE ui.institution_id = ?
                  AND u.is_active = 1
              `, [context.formal_institution_id]);

              for (const fa of formalAdmins) {
                candidates.push({
                  recipientType: 'INSTITUTION_ADMIN',
                  name: fa.name,
                  rawPhone: fa.phone,
                  identifier: `user_${fa.id}`,
                  userId: fa.id,
                  institutionSource: 'FORMAL',
                  institutionId: context.formal_institution_id,
                  institutionName: context.formal_institution_name
                });
              }
            } else {
              // NON_FORMAL or no formal institution - intentionally skipped
              skipped.push({
                recipientType: 'INSTITUTION_ADMIN',
                institutionSource: 'FORMAL',
                reason: 'NON_FORMAL_NO_FORMAL_INSTITUTION'
              });
            }
          }
          break;
        }

        case 'APPLICANT': {
          if (context.applicant_whatsapp) {
            candidates.push({
              recipientType: 'APPLICANT',
              name: context.student_name,
              rawPhone: context.applicant_whatsapp,
              identifier: `applicant_${context.applicant_id}`,
              applicantId: context.applicant_id,
              institutionSource: 'NONE'
            });
          } else {
            skipped.push({
              recipientType: 'APPLICANT',
              reason: 'NO_PHONE'
            });
          }
          break;
        }

        case 'GUARDIAN': {
          let foundGuardian = false;
          if (context.guardians && context.guardians.length > 0) {
            for (const g of context.guardians) {
              if (g.phone && g.phone.trim() !== '') {
                candidates.push({
                  recipientType: 'GUARDIAN',
                  name: g.name,
                  rawPhone: g.phone,
                  identifier: `guardian_${g.id}`,
                  guardianId: g.id,
                  relationship: g.relationship,
                  institutionSource: 'NONE'
                });
                foundGuardian = true;
                break; // Use the primary guardian with phone
              }
            }
          }
          if (!foundGuardian) {
            skipped.push({
              recipientType: 'GUARDIAN',
              reason: 'NO_PHONE'
            });
          }
          break;
        }
      }
    }

    // Deduplicate and Normalize Phone Numbers
    const validRecipients = [];
    const seenPhones = new Set();
    const seenIdentifiers = new Set();

    for (const c of candidates) {
      if (!c.rawPhone || c.rawPhone.trim() === '') {
        skipped.push({
          recipientType: c.recipientType,
          name: c.name,
          reason: 'NO_PHONE'
        });
        continue;
      }

      let normalizedPhone = null;
      try {
        normalizedPhone = gowaService.normalizePhoneNumber(c.rawPhone);
      } catch (err) {
        skipped.push({
          recipientType: c.recipientType,
          name: c.name,
          phone: c.rawPhone,
          reason: `INVALID_PHONE: ${err.message}`
        });
        continue;
      }

      if (seenPhones.has(normalizedPhone) || seenIdentifiers.has(c.identifier)) {
        skipped.push({
          recipientType: c.recipientType,
          name: c.name,
          phone: normalizedPhone,
          reason: 'DUPLICATE_RECIPIENT_OR_PHONE'
        });
        continue;
      }

      seenPhones.add(normalizedPhone);
      seenIdentifiers.add(c.identifier);

      validRecipients.push({
        ...c,
        phone: normalizedPhone,
        idempotencyKey: `${options.eventCode || 'NOTIFICATION'}:${context.id}:${c.recipientType}:${c.identifier}`
      });
    }

    return {
      recipients: validRecipients,
      skipped
    };
  }
}

const defaultInstance = new NotificationRoutingService();

module.exports = defaultInstance;
module.exports.NotificationRoutingService = NotificationRoutingService;
