const pool = require('./src/config/database');

async function migrateSprint2() {
  console.log('--- Migrating Sprint 2: CRM Follow-up & WhatsApp GOWA Tables ---');
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Create crm_wa_templates table
    console.log('Checking crm_wa_templates table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`crm_wa_templates\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`institution_id\` BIGINT UNSIGNED NULL,
        \`name\` VARCHAR(150) NOT NULL,
        \`event_key\` VARCHAR(80) NOT NULL,
        \`message_body\` TEXT NOT NULL,
        \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
        \`created_by_user_id\` BIGINT UNSIGNED NULL,
        \`updated_by_user_id\` BIGINT UNSIGNED NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_crm_tpl_institution\` (\`institution_id\`),
        INDEX \`idx_crm_tpl_event_key\` (\`event_key\`),
        INDEX \`idx_crm_tpl_is_active\` (\`is_active\`),
        INDEX \`idx_crm_tpl_created_by\` (\`created_by_user_id\`),
        CONSTRAINT \`fk_crm_tpl_institution\` FOREIGN KEY (\`institution_id\`) REFERENCES \`institutions\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`fk_crm_tpl_created_by\` FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT \`fk_crm_tpl_updated_by\` FOREIGN KEY (\`updated_by_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
    `);
    console.log('+ crm_wa_templates table ready.');

    // 2. Create crm_lead_activities table
    console.log('Checking crm_lead_activities table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`crm_lead_activities\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`lead_id\` BIGINT UNSIGNED NOT NULL,
        \`institution_id\` BIGINT UNSIGNED NOT NULL,
        \`activity_type\` VARCHAR(50) NOT NULL,
        \`subject\` VARCHAR(150) NULL,
        \`description\` TEXT NULL,
        \`contact_method\` VARCHAR(50) NULL,
        \`template_id\` BIGINT UNSIGNED NULL,
        \`message_content\` TEXT NULL,
        \`message_status\` VARCHAR(30) NULL,
        \`provider_message_id\` VARCHAR(255) NULL,
        \`created_by_user_id\` BIGINT UNSIGNED NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_crm_act_lead\` (\`lead_id\`),
        INDEX \`idx_crm_act_institution\` (\`institution_id\`),
        INDEX \`idx_crm_act_type\` (\`activity_type\`),
        INDEX \`idx_crm_act_method\` (\`contact_method\`),
        INDEX \`idx_crm_act_created_at\` (\`created_at\`),
        INDEX \`idx_crm_act_user\` (\`created_by_user_id\`),
        CONSTRAINT \`fk_crm_act_lead\` FOREIGN KEY (\`lead_id\`) REFERENCES \`crm_leads\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`fk_crm_act_institution\` FOREIGN KEY (\`institution_id\`) REFERENCES \`institutions\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`fk_crm_act_template\` FOREIGN KEY (\`template_id\` ) REFERENCES \`crm_wa_templates\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT \`fk_crm_act_user\` FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
    `);
    console.log('+ crm_lead_activities table ready.');

    // 3. Seed initial default templates if empty
    const [existingCount] = await connection.query('SELECT COUNT(*) AS total FROM crm_wa_templates');
    if (existingCount[0].total === 0) {
      console.log('Seeding initial CRM WhatsApp templates...');
      const seeds = [
        [
          null,
          'Sapaan & Perkenalan Awal',
          'INTRO',
          'Halo Kak {{nama}}, terima kasih atas minat Kakak pada {{lembaga}}.\n\nKami dari tim pendaftaran siap membantu memberikan informasi seputar penerimaan siswa/santri baru dan program unggulan kami. Apakah ada yang ingin Kakak tanyakan?',
          1
        ],
        [
          null,
          'Informasi Jurusan & Minat',
          'MAJOR_INFO',
          'Assalamualaikum Kak {{nama}} dari {{sekolah_asal}},\n\nTerima kasih atas ketertarikan Kakak pada program {{jurusan}} di {{lembaga}}. Kami memiliki kurikulum berbasis industri dan asrama yang siap mengasah keterampilan terbaik Kakak.\n\nBolehkah kami jadwalkan waktu untuk konsultasi lebih lanjut?',
          1
        ],
        [
          null,
          'Undangan Konsultasi & Kunjungan',
          'CONSULTATION',
          'Halo Kak {{nama}},\n\nKami mengundang Kakak beserta Ayah Bunda (Bpk. {{nama_ayah}} / Ibu {{nama_ibu}}) untuk berkunjung langsung ke kampus {{lembaga}} guna konsultasi pendidikan dan melihat fasilitas sekolah.\n\nKapan sekiranya Kakak dan keluarga ada waktu luang?',
          1
        ],
        [
          null,
          'Pengingat Pendaftaran & Link SPSMB',
          'REGISTRATION_INFO',
          'Halo Kak {{nama}},\n\nPendaftaran peserta didik baru di {{lembaga}} saat ini sedang dibuka! Kakak bisa melakukan pendaftaran secara online melalui link berikut:\n{{link_pendaftaran}}\n\nJika butuh panduan dalam pengisian formulir, silakan balas pesan ini ya.\n\nSalam hormat,\n{{nama_petugas}}',
          1
        ],
        [
          null,
          'Pengingat Tindak Lanjut (Follow-up)',
          'FOLLOW_UP_REMINDER',
          'Assalamualaikum Kak {{nama}},\n\nMenindaklanjuti komunikasi kita sebelumnya mengenai pendaftaran di {{lembaga}}, apakah Kakak sudah siap untuk langkah berikutnya?\n\nJika ada pertanyaan mengenai biaya, berkas, atau kuota jurusan, jangan ragu untuk tanyakan kepada kami.',
          1
        ]
      ];

      for (const seed of seeds) {
        await connection.query(`
          INSERT INTO crm_wa_templates (institution_id, name, event_key, message_body, is_active)
          VALUES (?, ?, ?, ?, ?)
        `, seed);
      }
      console.log(`+ Seeded ${seeds.length} starter CRM templates.`);
    }

    await connection.commit();
    console.log('--- Migration Sprint 2 completed successfully ---');
  } catch (err) {
    await connection.rollback();
    console.error('Migration Sprint 2 failed:', err);
    process.exit(1);
  } finally {
    connection.release();
    process.exit(0);
  }
}

migrateSprint2();
