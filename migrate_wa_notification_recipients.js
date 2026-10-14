/**
 * Migration & Seed Script: wa_notification_recipients & wa_templates event_code
 * Ensures default recipients exist for REGISTRATION_CREATED and REGISTRATION_SUBMITTED rules.
 * Safe and idempotent.
 */

const pool = require('./src/config/database');

async function migrate() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    console.log('[Migration] Checking wa_templates event_code...');
    await connection.query(`
      UPDATE wa_templates SET event_code = code WHERE event_code IS NULL
    `);

    console.log('[Migration] Checking wa_notification_recipients...');
    // Ensure rule 1 recipients
    const rule1Recipients = [
      { type: 'SUPER_ADMIN', source: 'NONE', sort: 1 },
      { type: 'INSTITUTION_ADMIN', source: 'PONDOK', sort: 2 },
      { type: 'INSTITUTION_ADMIN', source: 'FORMAL', sort: 3 },
      { type: 'APPLICANT', source: 'NONE', sort: 4 }
    ];

    for (const r of rule1Recipients) {
      await connection.query(`
        INSERT INTO wa_notification_recipients (rule_id, recipient_type, institution_source, is_active, sort_order)
        SELECT 1, ?, ?, 1, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM wa_notification_recipients 
          WHERE rule_id = 1 AND recipient_type = ? AND institution_source = ?
        )
      `, [r.type, r.source, r.sort, r.type, r.source]);
    }

    // Ensure rule 2 recipients
    const rule2Recipients = [
      { type: 'SUPER_ADMIN', source: 'NONE', sort: 1 },
      { type: 'INSTITUTION_ADMIN', source: 'PONDOK', sort: 2 },
      { type: 'INSTITUTION_ADMIN', source: 'FORMAL', sort: 3 },
      { type: 'APPLICANT', source: 'NONE', sort: 4 },
      { type: 'GUARDIAN', source: 'NONE', sort: 5 }
    ];

    for (const r of rule2Recipients) {
      await connection.query(`
        INSERT INTO wa_notification_recipients (rule_id, recipient_type, institution_source, is_active, sort_order)
        SELECT 2, ?, ?, 1, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM wa_notification_recipients 
          WHERE rule_id = 2 AND recipient_type = ? AND institution_source = ?
        )
      `, [r.type, r.source, r.sort, r.type, r.source]);
    }

    await connection.commit();
    console.log('[Migration] Successfully seeded default notification recipients!');
  } catch (error) {
    await connection.rollback();
    console.error('[Migration] Failed:', error);
    process.exit(1);
  } finally {
    connection.release();
    process.exit(0);
  }
}

migrate();
