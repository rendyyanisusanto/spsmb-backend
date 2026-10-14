/**
 * Migration Sprint 3.4: Unified WhatsApp Template Multi-Institution Sections
 * Adds section_type, created_by, updated_by to wa_templates and seeds baseline sections.
 */

const pool = require('./src/config/database');

async function migrate() {
  console.log('--- Starting Migration Sprint 3.4: Unified WhatsApp Templates ---');
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Check if section_type column exists
    const [cols] = await connection.query("SHOW COLUMNS FROM wa_templates LIKE 'section_type'");
    if (cols.length === 0) {
      console.log('Adding section_type, created_by, updated_by to wa_templates...');
      await connection.query(`
        ALTER TABLE wa_templates
        ADD COLUMN section_type ENUM('GLOBAL', 'PONDOK', 'FORMAL') NOT NULL DEFAULT 'GLOBAL' AFTER scope,
        ADD COLUMN created_by BIGINT UNSIGNED NULL AFTER is_active,
        ADD COLUMN updated_by BIGINT UNSIGNED NULL AFTER created_by,
        ADD INDEX idx_wa_template_section (event_code, section_type, institution_id, is_active)
      `);
      console.log('Columns and indexes added successfully.');
    } else {
      console.log('Column section_type already exists, skipping ALTER TABLE.');
    }

    // 2. Add foreign keys if not exist
    try {
      await connection.query(`
        ALTER TABLE wa_templates
        ADD CONSTRAINT fk_wa_template_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        ADD CONSTRAINT fk_wa_template_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
      `);
      console.log('Foreign keys for created_by and updated_by added.');
    } catch (fkErr) {
      // FK might already exist, ignore
      console.log('FKs note:', fkErr.message);
    }

    // 3. Update existing records in wa_templates based on institution_type
    console.log('Updating existing rows to set appropriate section_type...');
    await connection.query(`
      UPDATE wa_templates w
      JOIN institutions i ON w.institution_id = i.id
      SET w.section_type = 'PONDOK'
      WHERE i.institution_type = 'PONDOK'
    `);

    await connection.query(`
      UPDATE wa_templates w
      JOIN institutions i ON w.institution_id = i.id
      SET w.section_type = 'FORMAL'
      WHERE i.institution_type IN ('SMP', 'SMA', 'SMK')
    `);

    await connection.query(`
      UPDATE wa_templates
      SET section_type = 'GLOBAL'
      WHERE scope = 'GLOBAL' OR institution_id IS NULL
    `);

    // 4. Seed baseline section templates for REGISTRATION_CREATED and REGISTRATION_SUBMITTED
    const baselineSections = [
      // REGISTRATION_CREATED
      {
        code: 'SEC_REG_CREATED_GLOBAL',
        name: 'Pendaftaran Dibuat - Info Umum Global',
        event_code: 'REGISTRATION_CREATED',
        scope: 'GLOBAL',
        section_type: 'GLOBAL',
        institution_id: null,
        message: "Assalamu'alaikum Warahmatullahi Wabarakatuh.\nSelamat datang di SPSMB Terpadu Pesantren Asy-Syadzili.\n\nAkun pendaftaran ananda *{{student_name}}* telah berhasil dibuat dengan nomor registrasi: *{{registration_number}}*.\nUntuk melanjutkan pengisian formulir, silakan klik tautan berikut: {{continue_url}}",
        is_active: 1
      },
      {
        code: 'SEC_REG_CREATED_PPSQ1',
        name: 'Pendaftaran Dibuat - Info Pondok Putra (PPSQ 1)',
        event_code: 'REGISTRATION_CREATED',
        scope: 'INSTITUTION',
        section_type: 'PONDOK',
        institution_id: 1, // PPSQ 1
        message: "🕌 *Informasi Pondok Pesantren Asy-Syadzili 1 (Putra):*\nAnanda terdaftar di asrama santri putra PPSQ 1. Harap menyiapkan perlengkapan ibadah, kitab suci Al-Qur'an, dan pakaian muslim sopan.",
        is_active: 1
      },
      {
        code: 'SEC_REG_CREATED_PPSQ2',
        name: 'Pendaftaran Dibuat - Info Pondok Putri (PPSQ 2)',
        event_code: 'REGISTRATION_CREATED',
        scope: 'INSTITUTION',
        section_type: 'PONDOK',
        institution_id: 2, // PPSQ 2
        message: "🧕 *Informasi Pondok Pesantren Asy-Syadzili 2 (Putri):*\nAnanda terdaftar di asrama santri putri PPSQ 2. Harap menyiapkan mukena, busana muslimah syar'i, dan kitab suci Al-Qur'an.",
        is_active: 1
      },
      {
        code: 'SEC_REG_CREATED_SMP',
        name: 'Pendaftaran Dibuat - Info SMP IT',
        event_code: 'REGISTRATION_CREATED',
        scope: 'INSTITUTION',
        section_type: 'FORMAL',
        institution_id: 3, // SMP
        message: "🏫 *Informasi SMP IT Asy-Syadzili:*\nSilakan melengkapi berkas rapor jenjang SD/MI dan bersiap untuk asesmen pemetaan akademik serta baca Al-Qur'an.",
        is_active: 1
      },
      {
        code: 'SEC_REG_CREATED_SMA',
        name: 'Pendaftaran Dibuat - Info SMA IT',
        event_code: 'REGISTRATION_CREATED',
        scope: 'INSTITUTION',
        section_type: 'FORMAL',
        institution_id: 4, // SMA
        message: "🏫 *Informasi SMA IT Asy-Syadzili:*\nSilakan mempersiapkan berkas rapor jenjang SMP/MTs untuk verifikasi peminatan IPA/IPS.",
        is_active: 1
      },
      {
        code: 'SEC_REG_CREATED_SMK',
        name: 'Pendaftaran Dibuat - Info SMK IT',
        event_code: 'REGISTRATION_CREATED',
        scope: 'INSTITUTION',
        section_type: 'FORMAL',
        institution_id: 5, // SMK
        message: "🏫 *Informasi SMK IT Asy-Syadzili:*\nSilakan mengunggah rapor SMP/MTs dan bersiap untuk wawancara peminatan keahlian teknologi.",
        is_active: 1
      },

      // REGISTRATION_SUBMITTED
      {
        code: 'SEC_REG_SUBMITTED_GLOBAL',
        name: 'Pendaftaran Terkirim - Info Umum Global',
        event_code: 'REGISTRATION_SUBMITTED',
        scope: 'GLOBAL',
        section_type: 'GLOBAL',
        institution_id: null,
        message: "Assalamu'alaikum Warahmatullahi Wabarakatuh.\nAlhamdulillah, formulir pendaftaran ananda *{{student_name}}* (No. Reg: *{{registration_number}}*) telah resmi dikirimkan dan masuk tahap verifikasi panitia SPSMB.",
        is_active: 1
      },
      {
        code: 'SEC_REG_SUBMITTED_PPSQ1',
        name: 'Pendaftaran Terkirim - Petunjuk Berkas PPSQ 1',
        event_code: 'REGISTRATION_SUBMITTED',
        scope: 'INSTITUTION',
        section_type: 'PONDOK',
        institution_id: 1,
        message: "🕌 *Petunjuk Asrama Putra (PPSQ 1):*\nBerkas fisik pendaftaran santri putra harap diserahkan saat kedatangan observasi di kantor sekretariat PPSQ 1.",
        is_active: 1
      },
      {
        code: 'SEC_REG_SUBMITTED_PPSQ2',
        name: 'Pendaftaran Terkirim - Petunjuk Berkas PPSQ 2',
        event_code: 'REGISTRATION_SUBMITTED',
        scope: 'INSTITUTION',
        section_type: 'PONDOK',
        institution_id: 2,
        message: "🧕 *Petunjuk Asrama Putri (PPSQ 2):*\nBerkas fisik pendaftaran santri putri harap diserahkan saat kedatangan observasi di kantor sekretariat PPSQ 2.",
        is_active: 1
      },
      {
        code: 'SEC_REG_SUBMITTED_SMP',
        name: 'Pendaftaran Terkirim - Seleksi SMP IT',
        event_code: 'REGISTRATION_SUBMITTED',
        scope: 'INSTITUTION',
        section_type: 'FORMAL',
        institution_id: 3,
        message: "🏫 *Jadwal Seleksi SMP IT Asy-Syadzili:*\nJadwal observasi dan tes baca Al-Qur'an akan diumumkan melalui dashboard akun pendaftaran.",
        is_active: 1
      },
      {
        code: 'SEC_REG_SUBMITTED_SMA',
        name: 'Pendaftaran Terkirim - Seleksi SMA IT',
        event_code: 'REGISTRATION_SUBMITTED',
        scope: 'INSTITUTION',
        section_type: 'FORMAL',
        institution_id: 4,
        message: "🏫 *Jadwal Seleksi SMA IT Asy-Syadzili:*\nTes potensi akademik dan psikotes akan dilaksanakan sesuai jadwal gelombang pendaftaran.",
        is_active: 1
      },
      {
        code: 'SEC_REG_SUBMITTED_SMK',
        name: 'Pendaftaran Terkirim - Seleksi SMK IT',
        event_code: 'REGISTRATION_SUBMITTED',
        scope: 'INSTITUTION',
        section_type: 'FORMAL',
        institution_id: 5,
        message: "🏫 *Jadwal Seleksi SMK IT Asy-Syadzili:*\nWawancara kompetensi keahlian dan uji kesehatan akan dilaksanakan sesuai jadwal gelombang pendaftaran.",
        is_active: 1
      }
    ];

    console.log('Seeding baseline section templates...');
    for (const sec of baselineSections) {
      // Check if template with same code or same (event_code, section_type, institution_id) exists
      const [existing] = await connection.query(`
        SELECT id FROM wa_templates 
        WHERE code = ? OR (
          event_code = ? 
          AND section_type = ? 
          AND (institution_id = ? OR (institution_id IS NULL AND ? IS NULL))
        )
        LIMIT 1
      `, [sec.code, sec.event_code, sec.section_type, sec.institution_id, sec.institution_id]);

      if (existing.length === 0) {
        await connection.query(`
          INSERT INTO wa_templates (
            code, name, event_code, scope, section_type, institution_id, message, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          sec.code, sec.name, sec.event_code, sec.scope, sec.section_type, sec.institution_id, sec.message, sec.is_active
        ]);
        console.log(`+ Seeded: ${sec.code} (${sec.name})`);
      } else {
        // Update section_type on existing record if it was null
        await connection.query(`
          UPDATE wa_templates 
          SET section_type = ? 
          WHERE id = ? AND (section_type IS NULL OR section_type = 'GLOBAL')
        `, [sec.section_type, existing[0].id]);
        console.log(`= Existing: ${sec.code} (id ${existing[0].id})`);
      }
    }

    await connection.commit();
    console.log('--- Migration Sprint 3.4 Completed Successfully ---');
  } catch (err) {
    await connection.rollback();
    console.error('Migration Sprint 3.4 failed, rolled back:', err);
    throw err;
  } finally {
    connection.release();
    process.exit(0);
  }
}

migrate().catch(() => process.exit(1));
