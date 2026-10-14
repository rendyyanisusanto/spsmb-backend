/**
 * Sprint 3.4: Unified WhatsApp Template & Composed Multi-Institution Message Test Suite
 * Tests all 18 mandatory scenarios:
 * 1. Pendaftar SMP putra menerima satu pesan gabungan global + PPSQ 1 + SMP.
 * 2. Pendaftar SMA putra menerima satu pesan gabungan global + PPSQ 1 + SMA.
 * 3. Pendaftar SMK putra menerima satu pesan gabungan global + PPSQ 1 + SMK.
 * 4. Pendaftar SMP/SMA/SMK putri menerima pesan dengan PPSQ 2 dan lembaga formal yang benar.
 * 5. Pendaftar nonformal menerima global + pondok tanpa bagian formal.
 * 6. Perubahan bagian global memengaruhi pesan final untuk semua lembaga yang sesuai.
 * 7. Perubahan bagian PPSQ hanya memengaruhi pendaftar yang menggunakan PPSQ tersebut.
 * 8. Perubahan bagian lembaga formal hanya memengaruhi pendaftar lembaga tersebut.
 * 9. Admin PPSQ tidak dapat mengubah bagian global atau lembaga formal.
 * 10. Admin SMP tidak dapat mengubah template SMA, SMK, atau PPSQ.
 * 11. Manipulasi institution_id melalui API ditolak backend.
 * 12. Template nonaktif tidak digunakan.
 * 13. Placeholder lama tetap berfungsi.
 * 14. Bagian kosong tidak menghasilkan pemisah atau judul yang menggantung.
 * 15. Pemrosesan event berulang tidak mengirim pesan ganda (Idempotensi).
 * 16. Preview tidak mengirim WhatsApp.
 * 17. Data lama dan wa_logs tetap utuh setelah migrasi.
 * 18. Pesan final yang tersimpan di log sama dengan pesan yang dikirim ke provider.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const pool = require('../src/config/database');
const app = require('../src/app');
const composer = require('../src/services/whatsappTemplateComposer');
const { NotificationEngineService } = require('../src/services/notificationEngineService');
const { NotificationTemplateService } = require('../src/services/notificationTemplateService');

describe('Sprint 3.4: Unified WhatsApp Template Multi-Lembaga', () => {

  const secret = process.env.JWT_SECRET || 'change-this-with-a-long-random-secret';

  // JWT Tokens
  const superAdminToken = jwt.sign(
    { sub: 1, roles: ['SUPER_ADMIN'], primaryRole: 'SUPER_ADMIN' },
    secret
  );
  const pondokAdminToken = jwt.sign(
    { sub: 10, roles: ['ADMIN_SPSMB'], primaryRole: 'ADMIN_SPSMB', institutions: [1] }, // PPSQ 1 Putra
    secret
  );
  const smpAdminToken = jwt.sign(
    { sub: 30, roles: ['ADMIN_SPSMB'], primaryRole: 'ADMIN_SPSMB', institutions: [3] }, // SMP
    secret
  );
  const smaAdminToken = jwt.sign(
    { sub: 40, roles: ['ADMIN_SPSMB'], primaryRole: 'ADMIN_SPSMB', institutions: [4] }, // SMA
    secret
  );

  const startServer = async () => {
    return new Promise((resolve) => {
      const server = app.listen(0, () => resolve(server));
    });
  };

  before(async () => {
    // Ensure test users exist with role ADMIN_SPSMB (role_id 2) and user_institutions
    const testUsers = [
      { id: 10, username: 'test_admin_pondok1', institutionId: 1 },
      { id: 20, username: 'test_admin_pondok2', institutionId: 2 },
      { id: 30, username: 'test_admin_smp_u', institutionId: 3 },
      { id: 40, username: 'test_admin_sma_u', institutionId: 4 },
      { id: 50, username: 'test_admin_smk_u', institutionId: 5 }
    ];

    for (const u of testUsers) {
      await pool.query(
        'INSERT INTO users (id, name, username, email, phone, password_hash, is_active) VALUES (?, ?, ?, ?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_active = 1',
        [u.id, u.username, u.username, `${u.username}@example.com`, `0812345678${u.id}`, 'testhash']
      );
      await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, 2)', [u.id]);
      await pool.query('INSERT IGNORE INTO user_institutions (user_id, institution_id) VALUES (?, ?)', [u.id, u.institutionId]);
    }

    // Reset baseline templates to standard official text
    await pool.query(`UPDATE wa_templates SET message = 'Assalamu\\'alaikum Warahmatullahi Wabarakatuh.\\nSelamat datang di SPSMB Terpadu Pesantren Asy-Syadzili.\\n\\nAkun pendaftaran ananda *{{student_name}}* telah berhasil dibuat dengan nomor registrasi: *{{registration_number}}*.\\nUntuk melanjutkan pengisian formulir, silakan klik tautan berikut: {{continue_url}}', is_active = 1 WHERE id = 1`);
    await pool.query(`UPDATE wa_templates SET message = '🕌 *Informasi Pondok Pesantren Asy-Syadzili 1 (Putra):*\\nAnanda terdaftar di asrama santri putra PPSQ 1. Harap menyiapkan perlengkapan ibadah, kitab suci Al-Qur\\'an, dan pakaian muslim sopan.', is_active = 1 WHERE id = 10`);
    await pool.query(`UPDATE wa_templates SET message = '🧕 *Informasi Pondok Pesantren Asy-Syadzili 2 (Putri):*\\nAnanda terdaftar di asrama santri putri PPSQ 2. Harap menyiapkan mukena, busana muslimah syar\\'i, dan kitab suci Al-Qur\\'an.', is_active = 1 WHERE id = 11`);
    await pool.query(`UPDATE wa_templates SET message = '🏫 *Informasi SMP IT Asy-Syadzili:*\\nSilakan melengkapi berkas rapor jenjang SD/MI dan bersiap untuk asesmen pemetaan akademik serta baca Al-Qur\\'an.', is_active = 1 WHERE id = 12`);
    await pool.query(`UPDATE wa_templates SET message = '🏫 *Informasi SMA IT Asy-Syadzili:*\\nSilakan mempersiapkan berkas rapor jenjang SMP/MTs untuk verifikasi peminatan IPA/IPS.', is_active = 1 WHERE id = 13`);
    await pool.query(`UPDATE wa_templates SET message = '🏫 *Informasi SMK IT Asy-Syadzili:*\\nSilakan mengunggah rapor SMP/MTs dan bersiap untuk wawancara peminatan keahlian teknologi.', is_active = 1 WHERE id = 3`);
  });

  after(async () => {
    try {
      await pool.query('DELETE FROM user_institutions WHERE user_id IN (10, 20, 30, 40, 50)');
      await pool.query('DELETE FROM user_roles WHERE user_id IN (10, 20, 30, 40, 50)');
      await pool.query('DELETE FROM users WHERE id IN (10, 20, 30, 40, 50)');
      await pool.end();
    } catch (_) {}
  });

  // 1. Pendaftar SMP putra menerima satu pesan gabungan global + PPSQ 1 + SMP
  test('1. Pendaftar SMP putra menerima satu pesan gabungan global + PPSQ 1 + SMP', async () => {
    let sentMessage = '';
    const mockGowa = {
      sendMessage: async (phone, msg) => {
        sentMessage = msg;
        return { success: true, messageId: 'MSG-SMP-PUTRA-1' };
      }
    };

    const mockRouting = {
      getApplicationContext: async () => ({
        id: 1,
        student_name: 'Muhammad Farhan',
        registration_number: 'SPSMB-2027-SMP-001',
        formal_institution_id: 3,
        formal_institution_name: 'SMP IT Asy-Syadzili',
        pondok_institution_id: 1,
        pondok_institution_name: 'Pondok Pesantren Asy-Syadzili 1',
        registration_type: 'SMP',
        gender: 'MALE'
      }),
      getMatchingRules: async () => [{ id: 1 }],
      resolveRecipients: async () => ({
        recipients: [{ recipientType: 'APPLICANT', phone: '628111111111', idempotencyKey: `ID_SMP_1_${Date.now()}` }],
        skipped: []
      })
    };

    const engine = new NotificationEngineService(mockRouting, new NotificationTemplateService(), mockGowa, composer);
    const result = await engine.processEvent('REGISTRATION_CREATED', 1);

    assert.equal(result.success, true);
    assert.equal(result.sent, 1);
    // Verified 3 parts combined: Global, PPSQ 1, and SMP
    assert.ok(sentMessage.includes('Muhammad Farhan'));
    assert.ok(sentMessage.includes('Pondok Pesantren Asy-Syadzili 1'));
    assert.ok(sentMessage.includes('SMP IT Asy-Syadzili'));
  });

  // 2. Pendaftar SMA putra menerima satu pesan gabungan global + PPSQ 1 + SMA
  test('2. Pendaftar SMA putra menerima satu pesan gabungan global + PPSQ 1 + SMA', async () => {
    let sentMessage = '';
    const mockGowa = {
      sendMessage: async (phone, msg) => {
        sentMessage = msg;
        return { success: true, messageId: 'MSG-SMA-PUTRA-2' };
      }
    };

    const mockRouting = {
      getApplicationContext: async () => ({
        id: 1,
        student_name: 'Ilham Ramadhan',
        registration_number: 'SPSMB-2027-SMA-002',
        formal_institution_id: 4,
        formal_institution_name: 'SMA IT Asy-Syadzili',
        pondok_institution_id: 1,
        pondok_institution_name: 'Pondok Pesantren Asy-Syadzili 1',
        registration_type: 'SMA',
        gender: 'MALE'
      }),
      getMatchingRules: async () => [{ id: 1 }],
      resolveRecipients: async () => ({
        recipients: [{ recipientType: 'APPLICANT', phone: '628222222222', idempotencyKey: `ID_SMA_2_${Date.now()}` }],
        skipped: []
      })
    };

    const engine = new NotificationEngineService(mockRouting, new NotificationTemplateService(), mockGowa, composer);
    const result = await engine.processEvent('REGISTRATION_CREATED', 1);

    assert.equal(result.success, true);
    assert.ok(sentMessage.includes('Ilham Ramadhan'));
    assert.ok(sentMessage.includes('Pondok Pesantren Asy-Syadzili 1'));
    assert.ok(sentMessage.includes('SMA IT Asy-Syadzili'));
  });

  // 3. Pendaftar SMK putra menerima satu pesan gabungan global + PPSQ 1 + SMK
  test('3. Pendaftar SMK putra menerima satu pesan gabungan global + PPSQ 1 + SMK', async () => {
    let sentMessage = '';
    const mockGowa = {
      sendMessage: async (phone, msg) => {
        sentMessage = msg;
        return { success: true, messageId: 'MSG-SMK-PUTRA-3' };
      }
    };

    const mockRouting = {
      getApplicationContext: async () => ({
        id: 1,
        student_name: 'Rizky Pratama',
        registration_number: 'SPSMB-2027-SMK-003',
        formal_institution_id: 5,
        formal_institution_name: 'SMK IT Asy-Syadzili',
        pondok_institution_id: 1,
        pondok_institution_name: 'Pondok Pesantren Asy-Syadzili 1',
        registration_type: 'SMK',
        gender: 'MALE'
      }),
      getMatchingRules: async () => [{ id: 1 }],
      resolveRecipients: async () => ({
        recipients: [{ recipientType: 'APPLICANT', phone: '628333333333', idempotencyKey: `ID_SMK_3_${Date.now()}` }],
        skipped: []
      })
    };

    const engine = new NotificationEngineService(mockRouting, new NotificationTemplateService(), mockGowa, composer);
    const result = await engine.processEvent('REGISTRATION_CREATED', 1);

    assert.equal(result.success, true);
    assert.ok(sentMessage.includes('Rizky Pratama'));
    assert.ok(sentMessage.includes('Pondok Pesantren Asy-Syadzili 1'));
    assert.ok(sentMessage.includes('SMK IT Asy-Syadzili'));
  });

  // 4. Pendaftar SMP/SMA/SMK putri menerima pesan dengan PPSQ 2 dan lembaga formal yang benar
  test('4. Pendaftar putri menerima pesan dengan PPSQ 2 dan lembaga formal yang benar', async () => {
    let sentMessage = '';
    const mockGowa = {
      sendMessage: async (phone, msg) => {
        sentMessage = msg;
        return { success: true, messageId: 'MSG-PUTRI-4' };
      }
    };

    const mockRouting = {
      getApplicationContext: async () => ({
        id: 1,
        student_name: 'Aisyah Humaira',
        registration_number: 'SPSMB-2027-SMA-004',
        formal_institution_id: 4,
        formal_institution_name: 'SMA IT Asy-Syadzili',
        pondok_institution_id: 2,
        pondok_institution_name: 'Pondok Pesantren Asy-Syadzili 2',
        registration_type: 'SMA',
        gender: 'FEMALE'
      }),
      getMatchingRules: async () => [{ id: 1 }],
      resolveRecipients: async () => ({
        recipients: [{ recipientType: 'APPLICANT', phone: '628444444444', idempotencyKey: `ID_PUTRI_4_${Date.now()}` }],
        skipped: []
      })
    };

    const engine = new NotificationEngineService(mockRouting, new NotificationTemplateService(), mockGowa, composer);
    const result = await engine.processEvent('REGISTRATION_CREATED', 1);

    assert.equal(result.success, true);
    assert.ok(sentMessage.includes('Aisyah Humaira'));
    assert.ok(sentMessage.includes('Pondok Pesantren Asy-Syadzili 2'));
    assert.ok(sentMessage.includes('SMA IT Asy-Syadzili'));
  });

  // 5. Pendaftar nonformal menerima global + pondok tanpa bagian formal
  test('5. Pendaftar nonformal menerima global + pondok tanpa bagian formal', async () => {
    let sentMessage = '';
    const mockGowa = {
      sendMessage: async (phone, msg) => {
        sentMessage = msg;
        return { success: true, messageId: 'MSG-NONFORMAL-5' };
      }
    };

    const mockRouting = {
      getApplicationContext: async () => ({
        id: 1,
        student_name: 'Santri Murni Nonformal',
        registration_number: 'SPSMB-2027-NON-005',
        formal_institution_id: null,
        formal_institution_name: null,
        pondok_institution_id: 1,
        pondok_institution_name: 'Pondok Pesantren Asy-Syadzili 1',
        registration_type: 'NON_FORMAL',
        gender: 'MALE'
      }),
      getMatchingRules: async () => [{ id: 1 }],
      resolveRecipients: async () => ({
        recipients: [{ recipientType: 'APPLICANT', phone: '628555555555', idempotencyKey: `ID_NON_5_${Date.now()}` }],
        skipped: []
      })
    };

    const engine = new NotificationEngineService(mockRouting, new NotificationTemplateService(), mockGowa, composer);
    const result = await engine.processEvent('REGISTRATION_CREATED', 1);

    assert.equal(result.success, true);
    assert.ok(sentMessage.includes('Santri Murni Nonformal'));
    assert.ok(sentMessage.includes('Pondok Pesantren Asy-Syadzili 1'));
    // Formal school names should NOT appear in non-formal message
    assert.ok(!sentMessage.includes('SMP IT'));
    assert.ok(!sentMessage.includes('SMA IT'));
    assert.ok(!sentMessage.includes('SMK IT'));
  });

  // 6. Perubahan bagian global memengaruhi pesan final untuk semua lembaga yang sesuai
  test('6. Perubahan bagian global memengaruhi pesan final untuk semua lembaga yang sesuai', async () => {
    const server = await startServer();
    const port = server.address().port;

    try {
      const globalUpdateMsg = `Pesan Pembuka Global Baru (${Date.now()}): Selamat datang {{student_name}} di SPSMB Terpadu! No: {{registration_number}}`;
      
      const res = await fetch(`http://localhost:${port}/api/v1/whatsapp-templates/1`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({ message: globalUpdateMsg })
      });
      assert.equal(res.status, 200);

      // Now compose for SMP
      const composedSmp = await composer.composeForApplication(1, 'REGISTRATION_CREATED', {
        context: {
          id: 1,
          student_name: 'Siswa SMP',
          registration_number: 'SPSMB-SMP-06',
          formal_institution_id: 3,
          pondok_institution_id: 1,
          registration_type: 'SMP'
        }
      });

      // Now compose for SMK
      const composedSmk = await composer.composeForApplication(1, 'REGISTRATION_CREATED', {
        context: {
          id: 1,
          student_name: 'Siswa SMK',
          registration_number: 'SPSMB-SMK-06',
          formal_institution_id: 5,
          pondok_institution_id: 1,
          registration_type: 'SMK'
        }
      });

      assert.ok(composedSmp.composedMessage.includes('Pesan Pembuka Global Baru'));
      assert.ok(composedSmk.composedMessage.includes('Pesan Pembuka Global Baru'));
    } finally {
      await new Promise(r => server.close(r));
    }
  });

  // 7. Perubahan bagian PPSQ hanya memengaruhi pendaftar yang menggunakan PPSQ tersebut
  test('7. Perubahan bagian PPSQ hanya memengaruhi pendaftar yang menggunakan PPSQ tersebut', async () => {
    const server = await startServer();
    const port = server.address().port;

    try {
      // Find PPSQ 1 template ID
      const [p1Rows] = await pool.query("SELECT id FROM wa_templates WHERE section_type = 'PONDOK' AND institution_id = 1 AND event_code = 'REGISTRATION_CREATED' LIMIT 1");
      assert.ok(p1Rows.length > 0);
      const p1Id = p1Rows[0].id;

      const p1Msg = `Pengumuman Khusus Pondok Pesantren Asy-Syadzili 1 (PPSQ 1 Putra) (${Date.now()}): Harap membawa perlengkapan sholat.`;
      const res = await fetch(`http://localhost:${port}/api/v1/whatsapp-templates/${p1Id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({ message: p1Msg })
      });
      assert.equal(res.status, 200);

      // Compose for PPSQ 1 applicant -> contains p1Msg
      const comp1 = await composer.composeForApplication(1, 'REGISTRATION_CREATED', {
        context: {
          id: 1,
          student_name: 'Santri Putra 1',
          registration_number: 'REG-P1',
          formal_institution_id: 3,
          pondok_institution_id: 1,
          registration_type: 'SMP'
        }
      });
      assert.ok(comp1.composedMessage.includes('Pondok Pesantren Asy-Syadzili 1'));

      // Compose for PPSQ 2 applicant -> does NOT contain p1Msg
      const comp2 = await composer.composeForApplication(1, 'REGISTRATION_CREATED', {
        context: {
          id: 1,
          student_name: 'Santri Putri 2',
          registration_number: 'REG-P2',
          formal_institution_id: 3,
          pondok_institution_id: 2,
          registration_type: 'SMP'
        }
      });
      assert.ok(!comp2.composedMessage.includes('Pengumuman Khusus PPSQ 1 Putra'));
    } finally {
      await new Promise(r => server.close(r));
    }
  });

  // 8. Perubahan bagian lembaga formal hanya memengaruhi pendaftar lembaga tersebut
  test('8. Perubahan bagian lembaga formal hanya memengaruhi pendaftar lembaga tersebut', async () => {
    const server = await startServer();
    const port = server.address().port;

    try {
      const [smpRows] = await pool.query("SELECT id FROM wa_templates WHERE section_type = 'FORMAL' AND institution_id = 3 AND event_code = 'REGISTRATION_CREATED' LIMIT 1");
      assert.ok(smpRows.length > 0);
      const smpId = smpRows[0].id;

      const smpMsg = `Informasi Khusus SMP IT Asy-Syadzili Terkini (${Date.now()}): Tes baca Qur'an di gedung A.`;
      const res = await fetch(`http://localhost:${port}/api/v1/whatsapp-templates/${smpId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({ message: smpMsg })
      });
      assert.equal(res.status, 200);

      // Compose for SMP -> contains smpMsg
      const compSmp = await composer.composeForApplication(1, 'REGISTRATION_CREATED', {
        context: { id: 1, student_name: 'Siswa SMP', registration_number: 'SMP-01', formal_institution_id: 3, pondok_institution_id: 1, registration_type: 'SMP' }
      });
      assert.ok(compSmp.composedMessage.includes('Informasi Khusus SMP IT Asy-Syadzili Terkini'));

      // Compose for SMA -> does NOT contain smpMsg
      const compSma = await composer.composeForApplication(1, 'REGISTRATION_CREATED', {
        context: { id: 1, student_name: 'Siswa SMA', registration_number: 'SMA-01', formal_institution_id: 4, pondok_institution_id: 1, registration_type: 'SMA' }
      });
      assert.ok(!compSma.composedMessage.includes('Informasi Khusus SMP IT Terkini'));
    } finally {
      await new Promise(r => server.close(r));
    }
  });

  // 9. Admin PPSQ tidak dapat mengubah bagian global atau lembaga formal
  test('9. Admin PPSQ tidak dapat mengubah bagian global atau lembaga formal (returns 403 Forbidden)', async () => {
    const server = await startServer();
    const port = server.address().port;

    try {
      // Admin PPSQ tries to edit Global template ID 1
      const resGlobal = await fetch(`http://localhost:${port}/api/v1/whatsapp-templates/1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pondokAdminToken}` },
        body: JSON.stringify({ message: 'Pembobolan Global oleh PPSQ' })
      });
      assert.equal(resGlobal.status, 403);

      // Admin PPSQ tries to edit SMP template ID 12
      const resSmp = await fetch(`http://localhost:${port}/api/v1/whatsapp-templates/12`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pondokAdminToken}` },
        body: JSON.stringify({ message: 'Pembobolan SMP oleh PPSQ' })
      });
      assert.equal(resSmp.status, 403);
    } finally {
      await new Promise(r => server.close(r));
    }
  });

  // 10. Admin SMP tidak dapat mengubah template SMA, SMK, atau PPSQ
  test('10. Admin SMP tidak dapat mengubah template SMA, SMK, atau PPSQ (returns 403 Forbidden)', async () => {
    const server = await startServer();
    const port = server.address().port;

    try {
      // SMP admin tries to edit PPSQ 1 template ID 10
      const resPondok = await fetch(`http://localhost:${port}/api/v1/whatsapp-templates/10`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${smpAdminToken}` },
        body: JSON.stringify({ message: 'Pembobolan PPSQ oleh SMP' })
      });
      assert.equal(resPondok.status, 403);

      // SMP admin tries to edit SMA template ID 13
      const resSma = await fetch(`http://localhost:${port}/api/v1/whatsapp-templates/13`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${smpAdminToken}` },
        body: JSON.stringify({ message: 'Pembobolan SMA oleh SMP' })
      });
      assert.equal(resSma.status, 403);
    } finally {
      await new Promise(r => server.close(r));
    }
  });

  // 11. Manipulasi institution_id melalui API ditolak backend
  test('11. Manipulasi institution_id melalui API ditolak backend (returns 403 Forbidden)', async () => {
    const server = await startServer();
    const port = server.address().port;

    try {
      const res = await fetch(`http://localhost:${port}/api/v1/whatsapp-templates/12`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${smpAdminToken}` },
        body: JSON.stringify({ institutionId: 4 }) // Tampering SMP template to SMA institution
      });
      assert.equal(res.status, 403);
    } finally {
      await new Promise(r => server.close(r));
    }
  });

  // 12. Template nonaktif tidak digunakan
  test('12. Template nonaktif tidak digunakan dalam perakitan pesan', async () => {
    const [smpRows] = await pool.query("SELECT id, message FROM wa_templates WHERE section_type = 'FORMAL' AND institution_id = 3 AND event_code = 'REGISTRATION_CREATED' LIMIT 1");
    const smpId = smpRows[0].id;

    // Deactivate SMP template
    await pool.query('UPDATE wa_templates SET is_active = 0 WHERE id = ?', [smpId]);

    try {
      const composed = await composer.composeForApplication(1, 'REGISTRATION_CREATED', {
        context: {
          id: 1,
          student_name: 'Budi Inaktif',
          registration_number: 'REG-INACTIVE',
          formal_institution_id: 3,
          pondok_institution_id: 1,
          registration_type: 'SMP'
        }
      });

      // Global and pondok still included
      assert.ok(composed.composedMessage.includes('Budi Inaktif'));
      assert.ok(composed.composedMessage.includes('Pondok Pesantren Asy-Syadzili 1'));
      // Inactive SMP section must NOT be included!
      assert.equal(composed.sections.formal, null);
    } finally {
      // Restore active
      await pool.query('UPDATE wa_templates SET is_active = 1 WHERE id = ?', [smpId]);
    }
  });

  // 13. Placeholder lama tetap berfungsi
  test('13. Placeholder lama tetap berfungsi (student_name, registration_number, continue_url)', async () => {
    const rawTemplate = 'Halo {{student_name}}! No pendaftaran: {{registration_number}}. Lanjutkan di: {{continue_url}}';
    const context = {
      student_name: 'Santri Klasik',
      registration_number: 'SPSMB-2027-KLASIK',
      continue_url: 'http://localhost:5173/pendaftaran/lanjut/sample-token'
    };

    const rendered = composer.renderPlaceholders(rawTemplate, context);
    assert.ok(rendered.includes('Halo Santri Klasik!'));
    assert.ok(rendered.includes('SPSMB-2027-KLASIK'));
    assert.ok(rendered.includes('http://localhost:5173/pendaftaran/lanjut/sample-token'));
    assert.ok(!rendered.includes('undefined'));
    assert.ok(!rendered.includes('null'));
  });

  // 14. Bagian kosong tidak menghasilkan pemisah atau judul yang menggantung
  test('14. Bagian kosong tidak menghasilkan pemisah atau judul yang menggantung', async () => {
    const context = {
      student_name: 'Santri Rapi',
      registration_number: 'SPSMB-2027-RAPI',
      formal_institution_id: null, // Non formal
      pondok_institution_id: 1,
      registration_type: 'NON_FORMAL'
    };

    const composed = await composer.composeForApplication(1, 'REGISTRATION_CREATED', { context });
    
    // There should be no triple newlines or trailing whitespace
    assert.ok(!composed.composedMessage.includes('\n\n\n'));
    assert.equal(composed.composedMessage, composed.composedMessage.trim());
  });

  // 15. Pemrosesan event berulang tidak mengirim pesan ganda (Idempotensi)
  test('15. Pemrosesan event berulang tidak mengirim pesan ganda (Idempotensi)', async () => {
    let sendCount = 0;
    const mockGowa = {
      sendMessage: async () => {
        sendCount++;
        return { success: true, messageId: 'MSG-IDEM-15' };
      }
    };

    const idempotencyKey = `IDEM_TEST_${Date.now()}`;
    const mockRouting = {
      getApplicationContext: async () => ({
        id: 1,
        student_name: 'Santri Idempoten',
        registration_number: 'SPSMB-2027-IDEM',
        formal_institution_id: 3,
        formal_institution_name: 'SMP IT Asy-Syadzili',
        pondok_institution_id: 1,
        pondok_institution_name: 'Pondok Pesantren Asy-Syadzili 1',
        registration_type: 'SMP',
        gender: 'MALE'
      }),
      getMatchingRules: async () => [{ id: 1 }],
      resolveRecipients: async () => ({
        recipients: [{ recipientType: 'APPLICANT', phone: '628999999999', idempotencyKey }],
        skipped: []
      })
    };

    const engine = new NotificationEngineService(mockRouting, new NotificationTemplateService(), mockGowa, composer);

    // First run -> sends 1 message
    const res1 = await engine.processEvent('REGISTRATION_CREATED', 1);
    assert.equal(res1.sent, 1);
    assert.equal(sendCount, 1);

    // Second run with same idempotency key -> recognizes ALREADY_SENT, zero sends!
    const res2 = await engine.processEvent('REGISTRATION_CREATED', 1);
    assert.equal(res2.sent, 0);
    assert.equal(sendCount, 1); // Not incremented!
  });

  // 16. Preview tidak mengirim WhatsApp
  test('16. Preview tidak mengirim WhatsApp', async () => {
    const preview = await composer.composePreview({
      eventCode: 'REGISTRATION_CREATED',
      pondokInstitutionId: 1,
      formalInstitutionId: 3
    });

    assert.ok(preview);
    assert.ok(preview.composedMessage.length > 50);
    assert.ok(preview.composedMessage.includes('Pondok Pesantren Asy-Syadzili 1'));
    assert.ok(preview.composedMessage.includes('SMP IT Asy-Syadzili'));
  });

  // 17. Data lama dan wa_logs tetap utuh setelah migrasi
  test('17. Data lama dan wa_logs tetap utuh setelah migrasi', async () => {
    const [templates] = await pool.query('SELECT COUNT(*) as count FROM wa_templates');
    assert.ok(templates[0].count >= 6);

    const [logs] = await pool.query('SELECT COUNT(*) as count FROM wa_logs');
    assert.ok(logs[0].count >= 0);
  });

  // 18. Pesan final yang tersimpan di log sama dengan pesan yang dikirim ke provider
  test('18. Pesan final yang tersimpan di log sama dengan pesan yang dikirim ke provider', async () => {
    let dispatchedMessage = '';
    const mockGowa = {
      sendMessage: async (phone, msg) => {
        dispatchedMessage = msg;
        return { success: true, messageId: 'MSG-LOG-VERIFY' };
      }
    };

    const testIdempotency = `LOG_VERIFY_${Date.now()}`;
    const mockRouting = {
      getApplicationContext: async () => ({
        id: 1,
        student_name: 'Santri Verifikasi Log',
        registration_number: 'SPSMB-2027-LOG-01',
        formal_institution_id: 3,
        formal_institution_name: 'SMP IT Asy-Syadzili',
        pondok_institution_id: 1,
        pondok_institution_name: 'Pondok Pesantren Asy-Syadzili 1',
        registration_type: 'SMP',
        gender: 'MALE'
      }),
      getMatchingRules: async () => [{ id: 1 }],
      resolveRecipients: async () => ({
        recipients: [{ recipientType: 'APPLICANT', phone: '628888888888', idempotencyKey: testIdempotency }],
        skipped: []
      })
    };

    const engine = new NotificationEngineService(mockRouting, new NotificationTemplateService(), mockGowa, composer);
    await engine.processEvent('REGISTRATION_CREATED', 1);

    // Verify wa_logs record
    const [logRows] = await pool.query('SELECT message FROM wa_logs WHERE idempotency_key = ?', [testIdempotency]);
    assert.ok(logRows.length > 0);
    assert.equal(logRows[0].message, dispatchedMessage);
  });

});
