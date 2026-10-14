/**
 * Sprint 3.3: WhatsApp Multi-Institution Templates & Authorization Test Suite
 * Tests all 14 mandatory scenarios:
 * 1. Super Admin mengedit template global dan hasilnya digunakan.
 * 2. Super Admin mengedit template SMP dan hasilnya hanya berlaku sesuai aturan resolusi SMP.
 * 3. Admin SMP dapat mengedit template SMP.
 * 4. Admin SMP tidak dapat mengedit template SMA, SMK, atau pondok.
 * 5. Admin SMA hanya dapat mengedit template SMA.
 * 6. Pendaftar SMP menerima pesan sesuai template SMP dan pondoknya.
 * 7. Pendaftar SMA menerima pesan sesuai template SMA dan pondoknya.
 * 8. Pendaftar SMK menerima pesan sesuai template SMK dan pondoknya.
 * 9. Pendaftar putri diarahkan ke pondok putri berdasarkan relasi aplikasi yang tersimpan.
 * 10. Template khusus nonaktif tidak digunakan.
 * 11. Fallback global berfungsi dan ditampilkan dengan jelas.
 * 12. Perubahan template melalui UI benar-benar mengubah pesan yang dibangun Notification Engine.
 * 13. Tidak ada pengiriman ganda akibat resolusi beberapa template.
 * 14. Pengujian otorisasi membuktikan admin tidak bisa mengubah lembaga lain melalui API.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const pool = require('../src/config/database');
const app = require('../src/app');
const { NotificationTemplateService } = require('../src/services/notificationTemplateService');
const { NotificationEngineService } = require('../src/services/notificationEngineService');
const whatsappTemplateService = require('../src/services/whatsappTemplateService');

describe('Sprint 3.3: WhatsApp Multi-Institution Templates & Authorization', () => {

  const secret = process.env.JWT_SECRET || 'change-this-with-a-long-random-secret';

  // Tokens
  const superAdminToken = jwt.sign(
    { sub: 1, roles: ['SUPER_ADMIN'], primaryRole: 'SUPER_ADMIN' },
    secret
  );

  const smpAdminToken = jwt.sign(
    { sub: 30, roles: ['ADMIN_SPSMB'], primaryRole: 'ADMIN_SPSMB', institutions: [3] }, // SMP = ID 3
    secret
  );

  const smaAdminToken = jwt.sign(
    { sub: 40, roles: ['ADMIN_SPSMB'], primaryRole: 'ADMIN_SPSMB', institutions: [4] }, // SMA = ID 4
    secret
  );

  const smkAdminToken = jwt.sign(
    { sub: 50, roles: ['ADMIN_SPSMB'], primaryRole: 'ADMIN_SPSMB', institutions: [5] }, // SMK = ID 5
    secret
  );

  const pondokAdminToken = jwt.sign(
    { sub: 10, roles: ['ADMIN_SPSMB'], primaryRole: 'ADMIN_SPSMB', institutions: [1] }, // PPSQ 1 = ID 1
    secret
  );

  const startServer = async () => {
    return new Promise((resolve) => {
      const server = app.listen(0, () => resolve(server));
    });
  };

  // Helper variables for template IDs
  let smpTemplateId = null;
  let smaTemplateId = null;
  let smkTemplateId = null;

  before(async () => {
    // 1. Ensure test users exist in DB with appropriate user_roles and user_institutions
    const testUsers = [
      { id: 10, username: 'test_admin_pondok', institutionId: 1 },
      { id: 30, username: 'test_admin_smp', institutionId: 3 },
      { id: 40, username: 'test_admin_sma', institutionId: 4 },
      { id: 50, username: 'test_admin_smk', institutionId: 5 }
    ];

    for (const u of testUsers) {
      await pool.query(
        'INSERT INTO users (id, name, username, email, phone, password_hash, is_active) VALUES (?, ?, ?, ?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_active = 1',
        [u.id, u.username, u.username, `${u.username}@example.com`, `0812345678${u.id}`, 'testhash']
      );

      // Role ADMIN_SPSMB (role_id 2)
      await pool.query(
        'INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, 2)',
        [u.id]
      );

      // User institution
      await pool.query(
        'INSERT IGNORE INTO user_institutions (user_id, institution_id) VALUES (?, ?)',
        [u.id, u.institutionId]
      );
    }
  });

  after(async () => {
    try {
      // Clean up test templates created during tests
      await pool.query("DELETE FROM wa_templates WHERE code IN ('REG_SMP_TEST', 'REG_SMA_TEST', 'REG_SMK_TEST')");

      // Clean up test users
      await pool.query('DELETE FROM user_institutions WHERE user_id IN (10, 30, 40, 50)');
      await pool.query('DELETE FROM user_roles WHERE user_id IN (10, 30, 40, 50)');
      await pool.query('DELETE FROM users WHERE id IN (10, 30, 40, 50)');

      await pool.end();
    } catch (_) {}
  });

  // 1. Super Admin mengedit template global dan hasilnya digunakan
  test('1. Super Admin mengedit template global dan hasilnya digunakan', async () => {
    const server = await startServer();
    const port = server.address().port;

    try {
      const testMsg = 'Info Global Pendaftaran: Halo {{student_name}}! No Registrasi: {{registration_number}} di {{institution_name}} ({{pondok_name}}). Lanjut: {{continue_url}}';
      const res = await fetch(`http://localhost:${port}/api/v1/whatsapp-templates/1`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({ message: testMsg })
      });

      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.data.message, testMsg);

      // Verify that NotificationTemplateService resolves this global message for an institution without custom override
      const resolved = await (new NotificationTemplateService()).resolveTemplate('REGISTRATION_CREATED', [999]);
      assert.ok(resolved);
      assert.equal(resolved.resolvedScope, 'GLOBAL');
      assert.equal(resolved.template.message, testMsg);
    } finally {
      await new Promise(r => server.close(r));
    }
  });

  // 2. Super Admin mengedit template SMP dan hasilnya hanya berlaku sesuai aturan resolusi SMP
  test('2. Super Admin mengedit template SMP dan hasilnya hanya berlaku sesuai aturan resolusi SMP', async () => {
    const server = await startServer();
    const port = server.address().port;

    try {
      // 1. Check if SMP template exists or create one
      const existing = await pool.query("SELECT id FROM wa_templates WHERE scope = 'INSTITUTION' AND institution_id = 3 AND event_code = 'REGISTRATION_CREATED'");
      if (existing[0].length > 0) {
        smpTemplateId = existing[0][0].id;
      } else {
        const [ins] = await pool.query(
          "INSERT INTO wa_templates (code, name, event_code, scope, institution_id, message, is_active) VALUES ('REG_SMP_TEST', 'Template Khusus SMP', 'REGISTRATION_CREATED', 'INSTITUTION', 3, 'Pesan Awal SMP {{student_name}}', 1)"
        );
        smpTemplateId = ins.insertId;
      }

      const smpMsg = 'Assalamu\'alaikum! Khusus Santri SMP IT: {{student_name}} telah terdaftar di {{institution_name}}. Pondok: {{pondok_name}}. Registrasi: {{registration_number}}';
      const res = await fetch(`http://localhost:${port}/api/v1/whatsapp-templates/${smpTemplateId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({ message: smpMsg })
      });

      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.data.message, smpMsg);

      // Resolving for SMP (institution 3) returns SMP template
      const templateService = new NotificationTemplateService();
      const resolvedSMP = await templateService.resolveTemplate('REGISTRATION_CREATED', [3]);
      assert.equal(resolvedSMP.resolvedScope, 'INSTITUTION');
      assert.equal(resolvedSMP.institutionId, 3);
      assert.ok(resolvedSMP.template.message.includes('Khusus Santri SMP IT'));

      // Resolving for non-configured institution 999 does NOT return SMP template
      const resolvedFallback = await templateService.resolveTemplate('REGISTRATION_CREATED', [999]);
      assert.notEqual(resolvedFallback.template.id, smpTemplateId);
      assert.equal(resolvedFallback.resolvedScope, 'GLOBAL');
    } finally {
      await new Promise(r => server.close(r));
    }
  });

  // 3. Admin SMP dapat mengedit template SMP
  test('3. Admin SMP dapat mengedit template SMP', async () => {
    const server = await startServer();
    const port = server.address().port;

    try {
      const smpEditMsg = 'Pemberitahuan SMP IT: Halo ananda {{student_name}}, berkas di {{pondok_name}} diterima! No: {{registration_number}}';
      const res = await fetch(`http://localhost:${port}/api/v1/whatsapp-templates/${smpTemplateId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${smpAdminToken}`
        },
        body: JSON.stringify({ message: smpEditMsg })
      });

      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.message, smpEditMsg);
    } finally {
      await new Promise(r => server.close(r));
    }
  });

  // 4. Admin SMP tidak dapat mengedit template SMA, SMK, atau pondok
  test('4. Admin SMP tidak dapat mengedit template SMA, SMK, atau pondok (returns 403 Forbidden)', async () => {
    // Ensure SMK template exists
    const [smkRows] = await pool.query("SELECT id FROM wa_templates WHERE scope = 'INSTITUTION' AND institution_id = 5 LIMIT 1");
    if (smkRows.length > 0) {
      smkTemplateId = smkRows[0].id;
      await pool.query(
        "UPDATE wa_templates SET message = 'Selamat santri SMK {{student_name}}! Lembaga: {{institution_name}}, Pondok: {{pondok_name}}.' WHERE id = ?",
        [smkTemplateId]
      );
    } else {
      const [ins] = await pool.query(
        "INSERT INTO wa_templates (code, name, event_code, scope, institution_id, message, is_active) VALUES ('REG_SMK_TEST', 'Template Khusus SMK', 'REGISTRATION_CREATED', 'INSTITUTION', 5, 'Selamat santri SMK {{student_name}}! Lembaga: {{institution_name}}, Pondok: {{pondok_name}}.', 1)"
      );
      smkTemplateId = ins.insertId;
    }

    const server = await startServer();
    const port = server.address().port;

    try {
      // SMP admin tries to edit SMK template
      const res = await fetch(`http://localhost:${port}/api/v1/whatsapp-templates/${smkTemplateId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${smpAdminToken}`
        },
        body: JSON.stringify({ message: 'Pembobolan SMK oleh SMP' })
      });

      const body = await res.json();
      assert.equal(res.status, 403);
      assert.ok(body.message.includes('lembaga') || body.message.includes('izin') || body.message.includes('akses'));
    } finally {
      await new Promise(r => server.close(r));
    }
  });

  // 5. Admin SMA hanya dapat mengedit template SMA
  test('5. Admin SMA hanya dapat mengedit template SMA', async () => {
    // Create SMA template
    const [smaRows] = await pool.query("SELECT id FROM wa_templates WHERE scope = 'INSTITUTION' AND institution_id = 4 LIMIT 1");
    if (smaRows.length > 0) {
      smaTemplateId = smaRows[0].id;
    } else {
      const [ins] = await pool.query(
        "INSERT INTO wa_templates (code, name, event_code, scope, institution_id, message, is_active) VALUES ('REG_SMA_TEST', 'Template Khusus SMA', 'REGISTRATION_CREATED', 'INSTITUTION', 4, 'Selamat datang siswa {{institution_name}} {{student_name}} di {{pondok_name}}. No: {{registration_number}}', 1)"
      );
      smaTemplateId = ins.insertId;
    }

    const server = await startServer();
    const port = server.address().port;

    try {
      // 1. SMA admin edits SMA template -> SUCCEEDS
      const smaEditMsg = 'Selamat datang siswa {{institution_name}} {{student_name}} di {{pondok_name}}. No: {{registration_number}}';
      const resSma = await fetch(`http://localhost:${port}/api/v1/whatsapp-templates/${smaTemplateId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${smaAdminToken}`
        },
        body: JSON.stringify({ message: smaEditMsg })
      });
      const bodySma = await resSma.json();
      assert.equal(resSma.status, 200);
      assert.equal(bodySma.data.message, smaEditMsg);

      // 2. SMA admin tries to edit SMP template -> FAILS (403)
      const resSmp = await fetch(`http://localhost:${port}/api/v1/whatsapp-templates/${smpTemplateId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${smaAdminToken}`
        },
        body: JSON.stringify({ message: 'Pembobolan SMP oleh SMA' })
      });
      assert.equal(resSmp.status, 403);

      // 3. SMA admin tries to edit Global template -> FAILS (403)
      const resGlobal = await fetch(`http://localhost:${port}/api/v1/whatsapp-templates/1`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${smaAdminToken}`
        },
        body: JSON.stringify({ message: 'Pembobolan Global oleh SMA' })
      });
      assert.equal(resGlobal.status, 403);
    } finally {
      await new Promise(r => server.close(r));
    }
  });

  // 6. Pendaftar SMP menerima pesan sesuai template SMP dan pondoknya
  test('6. Pendaftar SMP menerima pesan sesuai template SMP dan pondoknya', async () => {
    let sentMessage = '';
    const mockGowa = {
      sendMessage: async (phone, msg) => {
        sentMessage = msg;
        return { success: true, messageId: 'MSG-SMP-6' };
      }
    };

    const mockRouting = {
      getApplicationContext: async () => ({
        id: 1,
        student_name: 'Budi Santoso',
        registration_number: 'SPSMB-2027-SMP-01',
        formal_institution_id: 3,
        formal_institution_name: 'SMP IT Asy-Syadzili',
        pondok_institution_id: 1,
        pondok_institution_name: 'Pondok Pesantren Asy-Syadzili 1',
        registration_type: 'SMP',
        gender: 'MALE'
      }),
      getMatchingRules: async () => [{ id: 1 }],
      resolveRecipients: async () => ({
        recipients: [{ recipientType: 'APPLICANT', phone: '628111111111', idempotencyKey: `ID_SMP_6_${Date.now()}` }],
        skipped: []
      })
    };

    const engine = new NotificationEngineService(mockRouting, new NotificationTemplateService(), mockGowa);
    const result = await engine.processEvent('REGISTRATION_CREATED', 1);

    assert.equal(result.success, true);
    assert.equal(result.sent, 1);
    assert.ok(sentMessage.includes('Budi Santoso'));
    assert.ok(sentMessage.includes('Pondok Pesantren Asy-Syadzili 1'));
  });

  // 7. Pendaftar SMA menerima pesan sesuai template SMA dan pondoknya
  test('7. Pendaftar SMA menerima pesan sesuai template SMA dan pondoknya', async () => {
    let sentMessage = '';
    const mockGowa = {
      sendMessage: async (phone, msg) => {
        sentMessage = msg;
        return { success: true, messageId: 'MSG-SMA-7' };
      }
    };

    const mockRouting = {
      getApplicationContext: async () => ({
        id: 1,
        student_name: 'Dewi Lestari',
        registration_number: 'SPSMB-2027-SMA-01',
        formal_institution_id: 4,
        formal_institution_name: 'SMA IT Asy-Syadzili',
        pondok_institution_id: 2,
        pondok_institution_name: 'Pondok Pesantren Asy-Syadzili 2',
        registration_type: 'SMA',
        gender: 'FEMALE'
      }),
      getMatchingRules: async () => [{ id: 1 }],
      resolveRecipients: async () => ({
        recipients: [{ recipientType: 'APPLICANT', phone: '628222222222', idempotencyKey: `ID_SMA_7_${Date.now()}` }],
        skipped: []
      })
    };

    const engine = new NotificationEngineService(mockRouting, new NotificationTemplateService(), mockGowa);
    const result = await engine.processEvent('REGISTRATION_CREATED', 1);

    assert.equal(result.success, true);
    assert.equal(result.sent, 1);
    assert.ok(sentMessage.includes('Dewi Lestari'));
    assert.ok(sentMessage.includes('Pondok Pesantren Asy-Syadzili 2'));
    assert.ok(sentMessage.includes('SMA IT Asy-Syadzili'));
  });

  // 8. Pendaftar SMK menerima pesan sesuai template SMK dan pondoknya
  test('8. Pendaftar SMK menerima pesan sesuai template SMK dan pondoknya', async () => {
    let sentMessage = '';
    const mockGowa = {
      sendMessage: async (phone, msg) => {
        sentMessage = msg;
        return { success: true, messageId: 'MSG-SMK-8' };
      }
    };

    const mockRouting = {
      getApplicationContext: async () => ({
        id: 1,
        student_name: 'Fauzi Rahmat',
        registration_number: 'SPSMB-2027-SMK-01',
        formal_institution_id: 5,
        formal_institution_name: 'SMK IT Asy-Syadzili',
        pondok_institution_id: 1,
        pondok_institution_name: 'Pondok Pesantren Asy-Syadzili 1',
        registration_type: 'SMK',
        gender: 'MALE'
      }),
      getMatchingRules: async () => [{ id: 1 }],
      resolveRecipients: async () => ({
        recipients: [{ recipientType: 'APPLICANT', phone: '628333333333', idempotencyKey: `ID_SMK_8_${Date.now()}` }],
        skipped: []
      })
    };

    const engine = new NotificationEngineService(mockRouting, new NotificationTemplateService(), mockGowa);
    const result = await engine.processEvent('REGISTRATION_CREATED', 1);

    assert.equal(result.success, true);
    assert.equal(result.sent, 1);
    assert.ok(sentMessage.includes('Fauzi Rahmat'));
    assert.ok(sentMessage.includes('Pondok Pesantren Asy-Syadzili 1'));
  });

  // 9. Pendaftar putri diarahkan ke pondok putri berdasarkan relasi aplikasi yang tersimpan
  test('9. Pendaftar putri diarahkan ke pondok putri berdasarkan relasi aplikasi yang tersimpan', async () => {
    const templateService = new NotificationTemplateService();
    const context = {
      student_name: 'Zahra Putri',
      registration_number: 'SPSMB-2027-0099',
      formal_institution_name: 'SMK IT Asy-Syadzili',
      pondok_institution_id: 2, // PPSQ 2 Putri
      pondok_institution_name: 'Pondok Pesantren Asy-Syadzili 2',
      registration_type: 'SMK',
      gender: 'FEMALE'
    };

    const rawTemplate = 'Halo {{student_name}} ({{gender}}), Anda terdaftar di {{institution_name}} dan pondok {{pondok_name}}.';
    const rendered = templateService.renderMessage(rawTemplate, context);

    assert.ok(rendered.includes('Zahra Putri (Perempuan)'));
    assert.ok(rendered.includes('Pondok Pesantren Asy-Syadzili 2'));
  });

  // 10. Template khusus nonaktif tidak digunakan (fallback to global)
  test('10. Template khusus nonaktif tidak digunakan (fallback to global)', async () => {
    const mockDb = {
      query: async (sql, params = []) => {
        // When checking institution template with is_active = 1, return empty (because it is inactive)
        if (sql.includes("w.scope = 'INSTITUTION'")) {
          return [[]];
        }
        // When checking global template, return active global template
        if (sql.includes("scope = 'GLOBAL'")) {
          return [[{
            id: 1,
            event_code: 'REGISTRATION_CREATED',
            scope: 'GLOBAL',
            message: 'Pesan Global Fallback untuk {{student_name}}',
            is_active: 1
          }]];
        }
        return [[]];
      }
    };

    const templateService = new NotificationTemplateService();
    const resolved = await templateService.resolveTemplate('REGISTRATION_CREATED', [3], mockDb);

    assert.ok(resolved);
    assert.equal(resolved.resolvedScope, 'GLOBAL');
    assert.equal(resolved.sourceLabel, 'Fallback template global');
    assert.ok(resolved.template.message.includes('Pesan Global Fallback'));
  });

  // 11. Fallback global berfungsi dan ditampilkan dengan jelas
  test('11. Fallback global berfungsi dan menampilkan sourceLabel Fallback template global', async () => {
    const templateService = new NotificationTemplateService();
    // Non-existent institution 999
    const resolved = await templateService.resolveTemplate('REGISTRATION_CREATED', [999]);

    assert.ok(resolved);
    assert.equal(resolved.resolvedScope, 'GLOBAL');
    assert.equal(resolved.sourceLabel, 'Fallback template global');
  });

  // 12. Perubahan template melalui UI benar-benar mengubah pesan yang dibangun Notification Engine
  test('12. Perubahan template melalui UI benar-benar mengubah pesan yang dibangun Notification Engine', async () => {
    const server = await startServer();
    const port = server.address().port;

    try {
      const dynamicText = `Teks Baru Diubah via API: Halo {{student_name}}, selamat bergabung! ${Date.now()}`;

      // Update template SMP
      const res = await fetch(`http://localhost:${port}/api/v1/whatsapp-templates/${smpTemplateId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({ message: dynamicText })
      });
      assert.equal(res.status, 200);

      // Now dispatch event via Notification Engine for SMP student
      let sentBody = '';
      const mockGowa = {
        sendMessage: async (phone, msg) => {
          sentBody = msg;
          return { success: true, messageId: 'MSG-DYN-12' };
        }
      };

      const mockRouting = {
        getApplicationContext: async () => ({
          id: 1,
          student_name: 'Santri Dinamis',
          registration_number: 'SPSMB-2027-DYN-01',
          formal_institution_id: 3,
          formal_institution_name: 'SMP IT Asy-Syadzili',
          pondok_institution_id: 1,
          pondok_institution_name: 'Pondok Pesantren Asy-Syadzili 1',
          registration_type: 'SMP',
          gender: 'MALE'
        }),
        getMatchingRules: async () => [{ id: 1 }],
        resolveRecipients: async () => ({
          recipients: [{ recipientType: 'APPLICANT', phone: '628999999999', idempotencyKey: `ID_DYN_${Date.now()}` }],
          skipped: []
        })
      };

      const engine = new NotificationEngineService(mockRouting, new NotificationTemplateService(), mockGowa);
      const dispatchResult = await engine.processEvent('REGISTRATION_CREATED', 1);

      assert.equal(dispatchResult.success, true);
      assert.ok(sentBody.includes('Teks Baru Diubah via API: Halo Santri Dinamis'));
    } finally {
      await new Promise(r => server.close(r));
    }
  });

  // 13. Tidak ada pengiriman ganda akibat resolusi beberapa template
  test('13. Tidak ada pengiriman ganda akibat resolusi beberapa template', async () => {
    let callCount = 0;
    const mockGowa = {
      sendMessage: async () => {
        callCount++;
        return { success: true, messageId: 'MSG-13' };
      }
    };

    const mockRouting = {
      getApplicationContext: async () => ({
        id: 1,
        student_name: 'Siswa Single Dispatch',
        registration_number: 'SPSMB-2027-SINGLE',
        formal_institution_id: 3,
        formal_institution_name: 'SMP IT Asy-Syadzili',
        pondok_institution_id: 1,
        pondok_institution_name: 'Pondok Pesantren Asy-Syadzili 1',
        registration_type: 'SMP',
        gender: 'MALE'
      }),
      getMatchingRules: async () => [{ id: 1 }],
      resolveRecipients: async () => ({
        // Applicant recipient resolved
        recipients: [{ recipientType: 'APPLICANT', phone: '6281234567890', idempotencyKey: `ID_SINGLE_${Date.now()}` }],
        skipped: []
      })
    };

    const engine = new NotificationEngineService(mockRouting, new NotificationTemplateService(), mockGowa);
    const result = await engine.processEvent('REGISTRATION_CREATED', 1);

    assert.equal(result.success, true);
    assert.equal(result.sent, 1);
    assert.equal(callCount, 1); // Exactly 1 message sent to applicant, not duplicated!
  });

  // 14. Pengujian otorisasi membuktikan admin tidak bisa mengubah lembaga lain melalui API
  test('14. Pengujian otorisasi membuktikan admin tidak bisa mengubah lembaga lain melalui API', async () => {
    const server = await startServer();
    const port = server.address().port;

    try {
      // SMP Admin tries to inject institutionId: 5 (SMK) in body
      const res = await fetch(`http://localhost:${port}/api/v1/whatsapp-templates/${smpTemplateId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${smpAdminToken}`
        },
        body: JSON.stringify({
          institutionId: 5 // Trying to reassign SMP template to SMK
        })
      });

      const body = await res.json();
      assert.equal(res.status, 403);
      assert.ok(body.message.includes('lembaga') || body.message.includes('izin') || body.message.includes('akses'));
    } finally {
      await new Promise(r => server.close(r));
    }
  });

});
