const pool = require('./src/config/database');

async function migrate() {
  console.log('--- Checking & Migrating CRM Leads Tables ---');
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Create crm_leads table
    console.log('Checking crm_leads table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`crm_leads\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`institution_id\` BIGINT UNSIGNED NOT NULL,
        \`full_name\` VARCHAR(150) NOT NULL,
        \`school_origin\` VARCHAR(200) NULL,
        \`address\` TEXT NULL,
        \`phone\` VARCHAR(30) NULL,
        \`father_name\` VARCHAR(150) NULL,
        \`mother_name\` VARCHAR(150) NULL,
        \`interest\` VARCHAR(255) NULL,
        \`status\` ENUM('NEW', 'CONTACTED', 'INTERESTED', 'FOLLOW_UP', 'READY_TO_REGISTER', 'CONVERTED', 'NOT_INTERESTED') NOT NULL DEFAULT 'NEW',
        \`lead_source\` VARCHAR(100) NULL,
        \`lead_by_user_id\` BIGINT UNSIGNED NULL,
        \`created_by_user_id\` BIGINT UNSIGNED NOT NULL,
        \`application_id\` BIGINT UNSIGNED NULL,
        \`last_contacted_at\` DATETIME NULL,
        \`next_follow_up_at\` DATETIME NULL,
        \`notes\` TEXT NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_crm_leads_institution\` (\`institution_id\`),
        INDEX \`idx_crm_leads_status\` (\`status\`),
        INDEX \`idx_crm_leads_lead_by\` (\`lead_by_user_id\`),
        INDEX \`idx_crm_leads_created_by\` (\`created_by_user_id\`),
        INDEX \`idx_crm_leads_application\` (\`application_id\`),
        INDEX \`idx_crm_leads_phone\` (\`phone\`),
        INDEX \`idx_crm_leads_created_at\` (\`created_at\`),
        CONSTRAINT \`fk_crm_leads_institution\` FOREIGN KEY (\`institution_id\`) REFERENCES \`institutions\` (\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`fk_crm_leads_lead_by\` FOREIGN KEY (\`lead_by_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT \`fk_crm_leads_created_by\` FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`fk_crm_leads_application\` FOREIGN KEY (\`application_id\`) REFERENCES \`applications\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
    `);
    console.log('+ crm_leads table ready.');

    // 2. Create crm_lead_status_histories table
    console.log('Checking crm_lead_status_histories table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`crm_lead_status_histories\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`lead_id\` BIGINT UNSIGNED NOT NULL,
        \`previous_status\` ENUM('NEW', 'CONTACTED', 'INTERESTED', 'FOLLOW_UP', 'READY_TO_REGISTER', 'CONVERTED', 'NOT_INTERESTED') NULL,
        \`new_status\` ENUM('NEW', 'CONTACTED', 'INTERESTED', 'FOLLOW_UP', 'READY_TO_REGISTER', 'CONVERTED', 'NOT_INTERESTED') NOT NULL,
        \`changed_by_user_id\` BIGINT UNSIGNED NOT NULL,
        \`notes\` TEXT NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_crm_histories_lead\` (\`lead_id\`),
        INDEX \`idx_crm_histories_user\` (\`changed_by_user_id\`),
        INDEX \`idx_crm_histories_created_at\` (\`created_at\`),
        CONSTRAINT \`fk_crm_histories_lead\` FOREIGN KEY (\`lead_id\`) REFERENCES \`crm_leads\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`fk_crm_histories_user\` FOREIGN KEY (\`changed_by_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
    `);
    console.log('+ crm_lead_status_histories table ready.');

    await connection.commit();
    console.log('--- Migration CRM Leads completed successfully ---');
  } catch (err) {
    await connection.rollback();
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    connection.release();
    process.exit(0);
  }
}

migrate();
