const pool = require('./src/config/database');

async function migrate() {
  console.log('--- Starting Sprint 4 Modul D Migration: Konfirmasi Siswa/Santri ---');
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Table confirmation_tracks
    await connection.query(`
      CREATE TABLE IF NOT EXISTS confirmation_tracks (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        institution_id BIGINT UNSIGNED NOT NULL,
        name VARCHAR(100) NOT NULL,
        code VARCHAR(50) NULL,
        academic_year VARCHAR(20) NOT NULL DEFAULT '2027/2028',
        description TEXT NULL,
        start_date DATE NULL,
        end_date DATE NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_by BIGINT UNSIGNED NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_ct_institution (institution_id),
        INDEX idx_ct_year (academic_year),
        INDEX idx_ct_active (is_active),
        CONSTRAINT fk_ct_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('+ confirmation_tracks table ready.');

    // 2. Table confirmation_fee_components
    await connection.query(`
      CREATE TABLE IF NOT EXISTS confirmation_fee_components (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        institution_id BIGINT UNSIGNED NOT NULL,
        confirmation_track_id BIGINT UNSIGNED NULL,
        name VARCHAR(150) NOT NULL,
        description TEXT NULL,
        amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        is_required TINYINT(1) NOT NULL DEFAULT 1,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        order_index INT NOT NULL DEFAULT 1,
        created_by BIGINT UNSIGNED NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_cfc_institution (institution_id),
        INDEX idx_cfc_track (confirmation_track_id),
        CONSTRAINT fk_cfc_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
        CONSTRAINT fk_cfc_track FOREIGN KEY (confirmation_track_id) REFERENCES confirmation_tracks(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('+ confirmation_fee_components table ready.');

    // 3. Table application_confirmations
    await connection.query(`
      CREATE TABLE IF NOT EXISTS application_confirmations (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        application_id BIGINT UNSIGNED NOT NULL UNIQUE,
        institution_id BIGINT UNSIGNED NOT NULL,
        confirmation_track_id BIGINT UNSIGNED NOT NULL,
        academic_year VARCHAR(20) NOT NULL DEFAULT '2027/2028',
        status ENUM('PROSES', 'TERVERIFIKASI', 'DITERIMA', 'DITOLAK', 'BATAL') NOT NULL DEFAULT 'PROSES',
        document_verification_status ENUM('BELUM_LENGKAP', 'MENUNGGU_VERIFIKASI', 'TERVERIFIKASI', 'DITOLAK') NOT NULL DEFAULT 'BELUM_LENGKAP',
        payment_status ENUM('BELUM_BAYAR', 'SEBAGIAN', 'LUNAS') NOT NULL DEFAULT 'BELUM_BAYAR',
        total_bill_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        total_paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        official_student_number VARCHAR(50) NULL,
        decision_date DATETIME NULL,
        decided_by BIGINT UNSIGNED NULL,
        notes TEXT NULL,
        created_by BIGINT UNSIGNED NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_ac_application (application_id),
        INDEX idx_ac_institution (institution_id),
        INDEX idx_ac_track (confirmation_track_id),
        INDEX idx_ac_status (status),
        CONSTRAINT fk_ac_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
        CONSTRAINT fk_ac_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
        CONSTRAINT fk_ac_track FOREIGN KEY (confirmation_track_id) REFERENCES confirmation_tracks(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('+ application_confirmations table ready.');

    // 4. Table confirmation_bill_items (snapshot of bills per participant)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS confirmation_bill_items (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        confirmation_id BIGINT UNSIGNED NOT NULL,
        fee_component_id BIGINT UNSIGNED NULL,
        name VARCHAR(150) NOT NULL,
        amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        is_required TINYINT(1) NOT NULL DEFAULT 1,
        is_paid TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_cbi_conf (confirmation_id),
        CONSTRAINT fk_cbi_conf FOREIGN KEY (confirmation_id) REFERENCES application_confirmations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('+ confirmation_bill_items table ready.');

    // 5. Table confirmation_payments
    await connection.query(`
      CREATE TABLE IF NOT EXISTS confirmation_payments (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        confirmation_id BIGINT UNSIGNED NOT NULL,
        payment_number VARCHAR(50) NOT NULL UNIQUE,
        amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        payment_date DATE NOT NULL,
        payment_method ENUM('TRANSFER', 'CASH', 'VA', 'OTHER') NOT NULL DEFAULT 'TRANSFER',
        proof_file_path VARCHAR(500) NULL,
        status ENUM('PENDING', 'VERIFIED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
        verification_notes TEXT NULL,
        verified_by BIGINT UNSIGNED NULL,
        verified_at DATETIME NULL,
        created_by BIGINT UNSIGNED NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_cp_conf (confirmation_id),
        INDEX idx_cp_status (status),
        CONSTRAINT fk_cp_conf FOREIGN KEY (confirmation_id) REFERENCES application_confirmations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('+ confirmation_payments table ready.');

    // 6. Table confirmation_document_verifications
    await connection.query(`
      CREATE TABLE IF NOT EXISTS confirmation_document_verifications (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        confirmation_id BIGINT UNSIGNED NOT NULL,
        document_type_id BIGINT UNSIGNED NOT NULL,
        applicant_document_id BIGINT UNSIGNED NULL,
        status ENUM('BELUM_UNGGAH', 'MENUNGGU_VERIFIKASI', 'TERVERIFIKASI', 'DITOLAK') NOT NULL DEFAULT 'BELUM_UNGGAH',
        notes TEXT NULL,
        verified_by BIGINT UNSIGNED NULL,
        verified_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_conf_doc (confirmation_id, document_type_id),
        INDEX idx_cdv_conf (confirmation_id),
        CONSTRAINT fk_cdv_conf FOREIGN KEY (confirmation_id) REFERENCES application_confirmations(id) ON DELETE CASCADE,
        CONSTRAINT fk_cdv_doctype FOREIGN KEY (document_type_id) REFERENCES document_types(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('+ confirmation_document_verifications table ready.');

    // Seed initial tracks and fee components per institution if empty
    const [existingTracks] = await connection.query("SELECT COUNT(*) as count FROM confirmation_tracks");
    if (existingTracks[0].count === 0) {
      console.log('Seeding initial confirmation tracks & fee components...');

      // 1: PPSQ1, 2: PPSQ2, 3: SMP, 4: SMA, 5: SMK
      // SMK: Reguler & JOTA JOTI
      const [smkTrackReg] = await connection.query(`
        INSERT INTO confirmation_tracks (institution_id, name, code, academic_year, description, is_active)
        VALUES (5, 'Jalur Reguler', 'REG-SMK', '2027/2028', 'Jalur penerimaan reguler SMK IT Asy-Syadzili', 1)
      `);
      const [smkTrackJota] = await connection.query(`
        INSERT INTO confirmation_tracks (institution_id, name, code, academic_year, description, is_active)
        VALUES (5, 'Jalur JOTA JOTI', 'JOTA-SMK', '2027/2028', 'Jalur khusus keikutsertaan kepramukaan JOTA JOTI SMK IT', 1)
      `);

      // SMP, SMA, PPSQ1, PPSQ2: Reguler
      await connection.query(`
        INSERT INTO confirmation_tracks (institution_id, name, code, academic_year, description, is_active)
        VALUES 
        (3, 'Jalur Reguler', 'REG-SMP', '2027/2028', 'Jalur penerimaan reguler SMP IT Asy-Syadzili', 1),
        (4, 'Jalur Reguler', 'REG-SMA', '2027/2028', 'Jalur penerimaan reguler SMA IT Asy-Syadzili', 1),
        (1, 'Jalur Reguler', 'REG-PPSQ1', '2027/2028', 'Jalur penerimaan santri reguler PPSQ 1 Putra', 1),
        (2, 'Jalur Reguler', 'REG-PPSQ2', '2027/2028', 'Jalur penerimaan santri reguler PPSQ 2 Putri', 1)
      `);

      // Seed fee components for SMK IT
      await connection.query(`
        INSERT INTO confirmation_fee_components (institution_id, confirmation_track_id, name, description, amount, is_required, is_active, order_index)
        VALUES 
        (5, NULL, 'Daftar Ulang & Administrasi', 'Biaya administrasi dan pendaftaran ulang santri baru', 500000.00, 1, 1, 1),
        (5, NULL, 'Paket Seragam Sekolah & Santri', 'Seragam formal, jas almamater, pakaian olahraga & atribut', 750000.00, 1, 1, 2),
        (5, NULL, 'Kegiatan MOS & Masa Orientasi', 'Orientasi kepesantrenan dan pengenalan lingkungan sekolah', 250000.00, 1, 1, 3),
        (5, NULL, 'Infaq Pengembangan Sarana (Opsional)', 'Infaq sukarela fasilitas pendidikan pesantren', 500000.00, 0, 1, 4)
      `);

      // Seed fee components for SMP IT
      await connection.query(`
        INSERT INTO confirmation_fee_components (institution_id, confirmation_track_id, name, description, amount, is_required, is_active, order_index)
        VALUES 
        (3, NULL, 'Daftar Ulang & Administrasi', 'Biaya administrasi dan pendaftaran ulang SMP IT', 450000.00, 1, 1, 1),
        (3, NULL, 'Paket Seragam SMP IT', 'Seragam formal, olahraga, dan atribut sekolah', 700000.00, 1, 1, 2)
      `);

      console.log('+ Initial confirmation tracks and fee components seeded.');
    }

    await connection.commit();
    console.log('--- Sprint 4 Modul D Migration completed successfully ---');
  } catch (error) {
    await connection.rollback();
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    connection.release();
    process.exit(0);
  }
}

migrate();
