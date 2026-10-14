/**
 * Sprint 3.1: WhatsApp Template Integration & Notification Engine Test Suite
 * Tests all 12 mandatory scenarios:
 * 1. Daftar template berhasil dimuat dari database.
 * 2. Isi pesan berhasil diedit dan disimpan.
 * 3. Setelah halaman dimuat ulang, isi terbaru tetap muncul.
 * 4. Template yang dinonaktifkan tidak digunakan untuk pengiriman baru.
 * 5. Notification Engine memakai isi template terbaru.
 * 6. Template global digunakan sesuai aturan fallback.
 * 7. Template khusus lembaga dipilih sesuai prioritas yang telah ditentukan.
 * 8. Pengguna tanpa hak akses tidak dapat mengubah template.
 * 9. Admin lembaga tidak dapat mengubah template lembaga lain.
 * 10. Admin lembaga tidak dapat mengubah routing penerima.
 * 11. Template kosong atau placeholder tidak dikenal ditangani dengan benar.
 * 12. Perubahan template tidak merusak pengiriman GOWA yang sudah berjalan.
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const pool = require('../src/config/database');
const app = require('../src/app');
const templateService = require('../src/services/whatsappTemplateService');
const { NotificationTemplateService } = require('../src/services/notificationTemplateService');
const { NotificationEngineService } = require('../src/services/notificationEngineService');

describe('Sprint 3.1: WhatsApp Template Integration & Notification Engine', () => {

  const secret = process.env.JWT_SECRET || 'change-this-with-a-long-random-secret';

  const superAdminToken = jwt.sign(
    { sub: 1, roles: ['SUPER_ADMIN'], primaryRole: 'SUPER_ADMIN' },
    secret
  );

  const smkAdminToken = jwt.sign(
    { sub: 3, roles: ['ADMIN_SPSMB'], primaryRole: 'ADMIN_SPSMB', institutions: [5] },
    secret
  );

  const smpAdminToken = jwt.sign(
    { sub: 4, roles: ['ADMIN_SPSMB'], primaryRole: 'ADMIN_SPSMB', institutions: [3] },
    secret
  );

  // Helper to start ephemeral test server
  const startServer = async () => {
    return new Promise((resolve) => {
      const server = app.listen(0, () => resolve(server));
    });
  };

  // Case 1: Daftar template berhasil dimuat dari database
  test('1. Daftar template berhasil dimuat dari database', async () => {
    const server = await startServer();
    const port = server.address().port;

    try {
      const res = await fetch(`http://localhost:${port}/api/v1/whatsapp-templates`, {
        headers: { Authorization: `Bearer ${superAdminToken}` }
      });

      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data));
      assert.ok(body.data.length >= 2);

      const codes = body.data.map(t => t.eventCode);
      assert.ok(codes.includes('REGISTRATION_CREATED'));
      assert.ok(codes.includes('REGISTRATION_SUBMITTED'));
    } finally {
      await new Promise(r => server.close(r));
    }
  });

  // Case 2: Isi pesan berhasil diedit dan disimpan
  test('2. Isi pesan berhasil diedit dan disimpan', async () => {
    const server = await startServer();
    const port = server.address().port;

    const testMessage = 'Assalamu\'alaikum {{student_name}}. No Reg Anda: {{registration_number}}. Lanjut: {{continue_url}}';

    try {
      const res = await fetch(`http://localhost:${port}/api/v1/whatsapp-templates/1`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({
          name: 'Pendaftaran Awal Berhasil (Diperbarui)',
          message: testMessage,
          isActive: true
        })
      });

      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.message, testMessage);
      assert.equal(body.data.name, 'Pendaftaran Awal Berhasil (Diperbarui)');
    } finally {
      await new Promise(r => server.close(r));
    }
  });

  // Case 3: Setelah halaman dimuat ulang, isi terbaru tetap muncul
  test('3. Setelah dimuat ulang, isi terbaru tetap muncul di database', async () => {
    const server = await startServer();
    const port = server.address().port;

    try {
      const res = await fetch(`http://localhost:${port}/api/v1/whatsapp-templates/1`, {
        headers: { Authorization: `Bearer ${superAdminToken}` }
      });

      const body = await res.json();
      assert.equal(res.status, 200);
      assert.ok(body.data.message.includes('No Reg Anda: {{registration_number}}'));
    } finally {
      await new Promise(r => server.close(r));
    }
  });

  // Case 4: Template yang dinonaktifkan tidak digunakan untuk pengiriman baru
  test('4. Template yang dinonaktifkan tidak digunakan untuk pengiriman baru', async () => {
    const customTemplateService = new NotificationTemplateService();

    // Stub DB where all templates are inactive
    const inactiveDb = {
      query: async (sql) => {
        return [[]]; // No active templates returned
      }
    };

    const resolved = await customTemplateService.resolveTemplate('REGISTRATION_CREATED', [5], inactiveDb);
    assert.equal(resolved, null);

    // Notification Engine should fail gracefully without sending
    let gowaCalled = false;
    const mockGowa = { sendMessage: async () => { gowaCalled = true; } };
    const mockRouting = {
      getApplicationContext: async () => ({ id: 401, registration_type: 'SMK', gender: 'MALE' }),
      getMatchingRules: async () => [{ id: 1 }],
      resolveRecipients: async () => ({
        recipients: [{ recipientType: 'APPLICANT', phone: '62811111111', idempotencyKey: 'ID_401' }],
        skipped: []
      })
    };

    const engine = new NotificationEngineService(mockRouting, customTemplateService, mockGowa);
    const result = await engine.processEvent('REGISTRATION_CREATED', 401, { connection: inactiveDb });

    assert.equal(result.success, false);
    assert.equal(result.reason, 'NO_TEMPLATE_FOUND');
    assert.equal(gowaCalled, false);
  });

  // Case 5: Notification Engine memakai isi template terbaru
  test('5. Notification Engine memakai isi template terbaru yang diedit', async () => {
    const updatedTemplateText = 'Pemberitahuan Resmi: Selamat {{student_name}}, Anda terdaftar di {{institution_name}} dengan nomor {{registration_number}}. Tautan: {{continue_url}}';

    const mockDb = {
      query: async (sql, params = []) => {
        if (sql.includes('FROM wa_templates')) {
          return [[{
            id: 1,
            code: 'REGISTRATION_CREATED',
            event_code: 'REGISTRATION_CREATED',
            scope: 'GLOBAL',
            message: updatedTemplateText,
            is_active: 1
          }]];
        }
        if (sql.includes('FROM wa_logs') && sql.includes('idempotency_key = ?')) {
          return [[]];
        }
        if (sql.includes('INSERT INTO wa_logs')) {
          return [{ insertId: 501 }];
        }
        return [[]];
      }
    };

    let deliveredText = '';
    const mockGowa = {
      sendMessage: async (phone, msg) => {
        deliveredText = msg;
        return { success: true, messageId: 'MSG-501' };
      }
    };

    const mockRouting = {
      getApplicationContext: async () => ({
        id: 501,
        student_name: 'Ahmad Fauzan',
        registration_number: 'SPSMB-2027-0501',
        formal_institution_name: 'SMK IT Asy-Syadzili',
        registration_type: 'SMK',
        gender: 'MALE'
      }),
      getMatchingRules: async () => [{ id: 1 }],
      resolveRecipients: async () => ({
        recipients: [{ recipientType: 'APPLICANT', phone: '628199999999', idempotencyKey: 'ID_501' }],
        skipped: []
      })
    };

    const engine = new NotificationEngineService(mockRouting, new NotificationTemplateService(), mockGowa);
    const result = await engine.processEvent('REGISTRATION_CREATED', 501, {
      continueToken: 'token-501-abc',
      connection: mockDb
    });

    assert.equal(result.success, true);
    assert.equal(result.sent, 1);
    assert.ok(deliveredText.includes('Pemberitahuan Resmi: Selamat Ahmad Fauzan'));
    assert.ok(deliveredText.includes('SMK IT Asy-Syadzili dengan nomor SPSMB-2027-0501'));
    assert.ok(deliveredText.includes('token-501-abc'));
  });

  // Case 6: Template global digunakan sesuai aturan fallback
  test('6. Template global digunakan sesuai aturan fallback saat lembaga tidak memiliki override', async () => {
    const templateResolver = new NotificationTemplateService();

    const mockDb = {
      query: async (sql, params = []) => {
        if (sql.includes("scope = 'INSTITUTION'")) {
          return [[]]; // No override for institution 4 (SMA)
        }
        if (sql.includes("scope = 'GLOBAL'")) {
          return [[{
            id: 2,
            event_code: 'REGISTRATION_SUBMITTED',
            scope: 'GLOBAL',
            message: 'Pesan Global Submisi {{student_name}}',
            is_active: 1
          }]];
        }
        return [[]];
      }
    };

    const resolved = await templateResolver.resolveTemplate('REGISTRATION_SUBMITTED', [4], mockDb);
    assert.ok(resolved);
    assert.equal(resolved.resolvedScope, 'GLOBAL');
    assert.equal(resolved.template.id, 2);
  });

  // Case 7: Template khusus lembaga dipilih sesuai prioritas yang telah ditentukan
  test('7. Template khusus lembaga dipilih sesuai prioritas yang telah ditentukan', async () => {
    const templateResolver = new NotificationTemplateService();

    const mockDb = {
      query: async (sql, params = []) => {
        if (sql.includes("scope = 'INSTITUTION'")) {
          return [[{
            id: 99,
            event_code: 'REGISTRATION_CREATED',
            scope: 'INSTITUTION',
            institution_id: 5,
            message: 'Pesan Khusus SMK untuk {{student_name}}',
            is_active: 1
          }]];
        }
        if (sql.includes("scope = 'GLOBAL'")) {
          return [[{
            id: 1,
            event_code: 'REGISTRATION_CREATED',
            scope: 'GLOBAL',
            message: 'Pesan Global',
            is_active: 1
          }]];
        }
        return [[]];
      }
    };

    const resolved = await templateResolver.resolveTemplate('REGISTRATION_CREATED', [5], mockDb);
    assert.ok(resolved);
    assert.equal(resolved.resolvedScope, 'INSTITUTION');
    assert.equal(resolved.template.id, 99);
    assert.ok(resolved.template.message.includes('Pesan Khusus SMK'));
  });

  // Case 8: Pengguna tanpa hak akses tidak dapat mengubah template
  test('8. Pengguna tanpa hak akses tidak dapat mengubah template (returns 401)', async () => {
    const server = await startServer();
    const port = server.address().port;

    try {
      const res = await fetch(`http://localhost:${port}/api/v1/whatsapp-templates/1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hack template' })
      });

      assert.equal(res.status, 401);
    } finally {
      await new Promise(r => server.close(r));
    }
  });

  // Case 9: Admin lembaga tidak dapat mengubah template lembaga lain
  test('9. Admin lembaga tidak dapat mengubah template lembaga lain atau template global (returns 403)', async () => {
    // SMP Admin (institution 3) tries to edit Global Template (id 1)
    const server = await startServer();
    const port = server.address().port;

    try {
      const res = await fetch(`http://localhost:${port}/api/v1/whatsapp-templates/1`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${smpAdminToken}`
        },
        body: JSON.stringify({ message: 'Pesan ubahan SMP' })
      });

      const body = await res.json();
      assert.equal(res.status, 403);
      assert.ok(body.message.includes('akses') || body.message.includes('izin'));
    } finally {
      await new Promise(r => server.close(r));
    }
  });

  // Case 10: Admin lembaga tidak dapat mengubah routing penerima
  test('10. Admin lembaga tidak dapat mengubah routing penerima (returns 403)', async () => {
    const server = await startServer();
    const port = server.address().port;

    try {
      const res = await fetch(`http://localhost:${port}/api/v1/notification-rules/1`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${smkAdminToken}`
        },
        body: JSON.stringify({ name: 'Ubah Routing oleh Admin SMK' })
      });

      const body = await res.json();
      assert.equal(res.status, 403);
      assert.ok(body.message.includes('izin'));
    } finally {
      await new Promise(r => server.close(r));
    }
  });

  // Case 11: Template kosong atau placeholder tidak dikenal ditangani dengan benar
  test('11. Template kosong atau placeholder tidak dikenal ditangani dengan benar (returns 422)', async () => {
    const server = await startServer();
    const port = server.address().port;

    try {
      // 1. Empty message validation
      const emptyRes = await fetch(`http://localhost:${port}/api/v1/whatsapp-templates/1`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({ message: '   ' })
      });
      const emptyBody = await emptyRes.json();
      assert.equal(emptyRes.status, 422);
      assert.ok(emptyBody.message.includes('tidak boleh kosong'));

      // 2. Unknown variable validation
      const badVarRes = await fetch(`http://localhost:${port}/api/v1/whatsapp-templates/1`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({ message: 'Halo {{unknown_hack_variable}}' })
      });
      const badVarBody = await badVarRes.json();
      assert.equal(badVarRes.status, 422);
      assert.ok(badVarBody.message.includes('variable yang tidak dikenal'));
    } finally {
      await new Promise(r => server.close(r));
    }
  });

  // Case 12: Perubahan template tidak merusak pengiriman GOWA yang sudah berjalan
  test('12. Perubahan template tidak merusak pengiriman GOWA yang sudah berjalan', async () => {
    let sentToGowa = false;
    let targetPhone = '';
    let payloadMessage = '';

    const mockGowa = {
      sendMessage: async (phone, msg) => {
        sentToGowa = true;
        targetPhone = phone;
        payloadMessage = msg;
        return { success: true, messageId: 'MSG-GOWA-12' };
      }
    };

    const mockDb = {
      query: async (sql, params = []) => {
        if (sql.includes('FROM wa_templates')) {
          return [[{
            id: 1,
            code: 'REGISTRATION_CREATED',
            event_code: 'REGISTRATION_CREATED',
            scope: 'GLOBAL',
            message: 'Halo {{student_name}}, registrasi Anda nomor {{registration_number}} di {{institution_name}} berhasil.',
            is_active: 1
          }]];
        }
        if (sql.includes('FROM wa_logs') && sql.includes('idempotency_key = ?')) {
          return [[]];
        }
        if (sql.includes('INSERT INTO wa_logs')) {
          return [{ insertId: 1201 }];
        }
        return [[]];
      }
    };

    const mockRouting = {
      getApplicationContext: async () => ({
        id: 12,
        student_name: 'Fatimah Az-Zahra',
        registration_number: 'SPSMB-2027-0012',
        formal_institution_name: 'SMK IT Asy-Syadzili',
        registration_type: 'SMK',
        gender: 'FEMALE'
      }),
      getMatchingRules: async () => [{ id: 1 }],
      resolveRecipients: async () => ({
        recipients: [{ recipientType: 'APPLICANT', phone: '6281234567890', idempotencyKey: 'ID_12' }],
        skipped: []
      })
    };

    const engine = new NotificationEngineService(mockRouting, new NotificationTemplateService(), mockGowa);
    const result = await engine.processEvent('REGISTRATION_CREATED', 12, { connection: mockDb });

    assert.equal(result.success, true);
    assert.equal(result.sent, 1);
    assert.equal(sentToGowa, true);
    assert.equal(targetPhone, '6281234567890');
    assert.ok(payloadMessage.includes('Halo Fatimah Az-Zahra'));
    assert.ok(payloadMessage.includes('SPSMB-2027-0012'));
  });

  // Clean up database connection pool
  after(async () => {
    try {
      await pool.end();
    } catch (_) {}
  });

});
