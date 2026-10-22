const pool = require('./src/config/database');

async function migrate() {
  console.log('--- Starting Sprint 3 Modul C Migration ---');
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Add slug column to institutions if not exists
    const [colsSlug] = await connection.query("SHOW COLUMNS FROM institutions LIKE 'slug'");
    if (colsSlug.length === 0) {
      console.log('Adding slug column to institutions...');
      await connection.query(`
        ALTER TABLE institutions
        ADD COLUMN slug VARCHAR(50) NULL UNIQUE AFTER code
      `);
      console.log('+ slug column added.');
    } else {
      console.log('= slug column already exists.');
    }

    // Populate slugs based on existing institutions
    await connection.query(`UPDATE institutions SET slug = 'ppsq-1' WHERE code = 'PPSQ1' OR id = 1`);
    await connection.query(`UPDATE institutions SET slug = 'ppsq-2' WHERE code = 'PPSQ2' OR id = 2`);
    await connection.query(`UPDATE institutions SET slug = 'smp' WHERE code = 'SMP' OR id = 3`);
    await connection.query(`UPDATE institutions SET slug = 'sma' WHERE code = 'SMA' OR id = 4`);
    await connection.query(`UPDATE institutions SET slug = 'smk' WHERE code = 'SMK' OR id = 5`);
    console.log('+ Institution slugs populated.');

    // 2. Create faqs table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS faqs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        scope ENUM('GLOBAL', 'INSTITUTION') NOT NULL DEFAULT 'GLOBAL',
        institution_id BIGINT UNSIGNED NULL,
        category VARCHAR(50) NOT NULL DEFAULT 'UMUM',
        question VARCHAR(255) NOT NULL,
        answer TEXT NOT NULL,
        order_index INT NOT NULL DEFAULT 1,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_by BIGINT UNSIGNED NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_faq_scope (scope),
        INDEX idx_faq_institution (institution_id),
        INDEX idx_faq_active (is_active),
        CONSTRAINT fk_faq_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('+ faqs table ready.');

    // 3. Create institution_profiles table for landing page content
    await connection.query(`
      CREATE TABLE IF NOT EXISTS institution_profiles (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        institution_id BIGINT UNSIGNED NOT NULL UNIQUE,
        headline VARCHAR(255) NULL,
        tagline VARCHAR(255) NULL,
        short_description TEXT NULL,
        full_profile LONGTEXT NULL,
        banner_url VARCHAR(500) NULL,
        address TEXT NULL,
        phone VARCHAR(50) NULL,
        email VARCHAR(100) NULL,
        whatsapp_contact VARCHAR(50) NULL,
        is_published TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        CONSTRAINT fk_profile_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('+ institution_profiles table ready.');

    // 4. Create institution_featured_programs table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS institution_featured_programs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        institution_id BIGINT UNSIGNED NOT NULL,
        title VARCHAR(150) NOT NULL,
        description TEXT NOT NULL,
        icon VARCHAR(100) NULL,
        order_index INT NOT NULL DEFAULT 1,
        is_published TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_program_institution (institution_id),
        CONSTRAINT fk_feat_prog_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('+ institution_featured_programs table ready.');

    // Seed default Global FAQs if empty
    const [existingFaqs] = await connection.query("SELECT COUNT(*) as count FROM faqs WHERE scope = 'GLOBAL'");
    if (existingFaqs[0].count === 0) {
      console.log('Seeding initial Global FAQs...');
      const globalFaqs = [
        ['GLOBAL', null, 'PENDAFTARAN', 'Bagaimana alur pendaftaran santri dan murid baru di SPSMB Asy-Syadzili?', 'Alur pendaftaran dimulai dengan mengisi Form Pendaftaran Awal secara online, konfirmasi melalui WhatsApp, melengkapi berkas biodata pada link pendaftaran lanjutan, verifikasi berkas oleh panitia, dan pengumuman seleksi.', 1, 1],
        ['GLOBAL', null, 'PERSYARATAN', 'Apa saja dokumen yang perlu disiapkan untuk pendaftaran?', 'Dokumen yang disiapkan meliputi Kartu Keluarga (KK), Akta Kelahiran, Ijazah atau Surat Keterangan Lulus (SKL), Pas Foto formal, dan Surat Keterangan Sehat dari dokter/puskesmas.', 2, 1],
        ['GLOBAL', null, 'UMUM', 'Apakah bisa mendaftar secara online penuh bagi pendaftar luar daerah?', 'Ya, seluruh tahapan pengisian formulir, unggah berkas persyaratan, hingga tes wawancara dapat dilakukan secara online untuk memudahkan calon santri dari luar daerah/kota.', 3, 1],
        ['GLOBAL', null, 'BIAYA', 'Bagaimana mekanisme pembayaran biaya pendaftaran?', 'Setelah pengisian formulir pendaftaran selesai, calon santri akan memperoleh rincian pembayaran serta nomor rekening Virtual Account resmi pada kwitansi pendaftaran.', 4, 1],
        ['GLOBAL', null, 'PENDAFTARAN', 'Bagaimana cara melanjutkan pengisian formulir yang belum selesai?', 'Gunakan nomor registrasi yang didapatkan saat pendaftaran awal serta nomor WhatsApp yang terdaftar untuk melanjutkan pengisian form.', 5, 1]
      ];

      for (const faq of globalFaqs) {
        await connection.query(
          `INSERT INTO faqs (scope, institution_id, category, question, answer, order_index, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          faq
        );
      }
      console.log('+ Initial Global FAQs seeded.');
    }

    // Seed initial institution profiles and sample featured programs for institutions
    const [institutions] = await connection.query("SELECT id, code, name FROM institutions WHERE is_active = 1");
    for (const inst of institutions) {
      const [profiles] = await connection.query("SELECT id FROM institution_profiles WHERE institution_id = ?", [inst.id]);
      if (profiles.length === 0) {
        let headline = `Penerimaan Santri & Siswa Baru ${inst.name}`;
        let tagline = 'Membentuk Generasi Berakhlak Qurani, Unggul, dan Berdaya Saing Global';
        let desc = `${inst.name} merupakan unit pendidikan unggulan di bawah naungan Yayasan Pondok Pesantren Asy-Syadzili yang memadukan kurikulum nasional dan nilai-nilai kepesantrenan.`;
        let phone = '081234567890';
        let email = `info.${inst.code.toLowerCase()}@asy-syadzili.sch.id`;

        await connection.query(`
          INSERT INTO institution_profiles (institution_id, headline, tagline, short_description, full_profile, address, phone, email, whatsapp_contact, is_published)
          VALUES (?, ?, ?, ?, ?, 'Sumberpasir, Pakis, Malang, Jawa Timur', ?, ?, ?, 1)
        `, [inst.id, headline, tagline, desc, desc, phone, email, phone]);
      }

      // Sample FAQ per institution if none exists
      const [instFaqs] = await connection.query("SELECT id FROM faqs WHERE institution_id = ?", [inst.id]);
      if (instFaqs.length === 0) {
        await connection.query(`
          INSERT INTO faqs (scope, institution_id, category, question, answer, order_index, is_active)
          VALUES 
          ('INSTITUTION', ?, 'PENDAFTARAN', CONCAT('Kapan batas akhir pendaftaran di ', ?), 'Pendaftaran dibuka sesuai gelombang yang sedang aktif. Kami menyarankan untuk segera mendaftar sebelum kuota pendaftaran terpenuhi.', 1, 1),
          ('INSTITUTION', ?, 'PERSYARATAN', CONCAT('Apa kriteria khusus untuk diterima di ', ?), 'Calon peserta didik wajib memenuhi syarat administrasi, mengikuti tes seleksi kemampuan dasar / wawancara, dan siap mematuhi tata tertib pesantren & sekolah.', 2, 1)
        `, [inst.id, inst.name, inst.id, inst.name]);
      }

      // Sample featured programs
      const [progs] = await connection.query("SELECT id FROM institution_featured_programs WHERE institution_id = ?", [inst.id]);
      if (progs.length === 0) {
        await connection.query(`
          INSERT INTO institution_featured_programs (institution_id, title, description, icon, order_index, is_published)
          VALUES 
          (?, 'Tahfidz & Kajian Kitab Kuning', 'Program penguatan hafalan Al-Qur an dan penguasaan kitab turots klasik dengan bimbingan ustadz berpengalaman.', 'BookOpen', 1, 1),
          (?, 'Penguatan Bahasa & Karakter', 'Pengembangan keterampilan bahasa Arab & Inggris serta penanaman adab dan kemandirian santri.', 'Globe', 2, 1),
          (?, 'Ekstrakurikuler & Prestasi', 'Penyaluran minat dan bakat santri di bidang akademik, sains, kepramukaan, seni, dan olahraga.', 'Award', 3, 1)
        `, [inst.id, inst.id, inst.id]);
      }
    }
    console.log('+ Initial institution profiles & programs seeded.');

    await connection.commit();
    console.log('--- Migration completed successfully ---');
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
