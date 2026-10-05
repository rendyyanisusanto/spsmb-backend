const pool = require('./src/config/database');

async function migrate() {
  try {
    const [columns] = await pool.query("SHOW COLUMNS FROM wa_templates LIKE 'event_code'");
    if (columns.length === 0) {
      console.log('Migrating wa_templates...');
      await pool.query(`
        ALTER TABLE wa_templates
        MODIFY COLUMN code VARCHAR(100) NOT NULL,
        ADD COLUMN event_code VARCHAR(80) NULL AFTER name,
        ADD COLUMN scope ENUM('GLOBAL', 'INSTITUTION') NOT NULL DEFAULT 'GLOBAL' AFTER event_code,
        ADD COLUMN institution_id BIGINT UNSIGNED NULL AFTER scope,
        ADD INDEX idx_wa_template_event (event_code),
        ADD INDEX idx_wa_template_scope (scope),
        ADD INDEX idx_wa_template_institution (institution_id),
        ADD INDEX idx_wa_template_resolution (
            event_code,
            scope,
            institution_id,
            is_active
        ),
        ADD CONSTRAINT fk_wa_template_institution
            FOREIGN KEY (institution_id)
            REFERENCES institutions(id)
            ON DELETE RESTRICT
            ON UPDATE CASCADE;
      `);
      console.log('Migration successful.');
    } else {
      console.log('Migration already run.');
    }
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    process.exit();
  }
}

migrate();
