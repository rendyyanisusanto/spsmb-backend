/**
 * Repository for wa_notification_rules and wa_notification_recipients
 */

const pool = require('../config/database');

class WaNotificationRuleRepository {
  /**
   * Find matching active rules for an event, registration type, and gender.
   * Supports NULL as wildcards. Specific matches take priority.
   */
  async findMatchingRules(eventCode, registrationType, gender, connection = null) {
    const db = connection || pool;
    const query = `
      SELECT * FROM wa_notification_rules
      WHERE event_code = ?
        AND is_active = 1
        AND (registration_type = ? OR registration_type IS NULL)
        AND (gender = ? OR gender IS NULL)
      ORDER BY 
        (CASE 
          WHEN registration_type IS NOT NULL AND gender IS NOT NULL THEN 1
          WHEN registration_type IS NOT NULL THEN 2
          WHEN gender IS NOT NULL THEN 3
          ELSE 4 
        END) ASC,
        sort_order ASC,
        id ASC
    `;

    const [rows] = await db.query(query, [eventCode, registrationType, gender]);
    return rows;
  }

  /**
   * Get active recipients for given rule IDs.
   */
  async findRecipientsByRuleIds(ruleIds, connection = null) {
    if (!ruleIds || ruleIds.length === 0) return [];
    const db = connection || pool;
    const placeholders = ruleIds.map(() => '?').join(',');
    const query = `
      SELECT * FROM wa_notification_recipients
      WHERE rule_id IN (${placeholders})
        AND is_active = 1
      ORDER BY sort_order ASC, id ASC
    `;

    const [rows] = await db.query(query, ruleIds);
    return rows;
  }
}

module.exports = new WaNotificationRuleRepository();
