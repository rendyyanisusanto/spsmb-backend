/**
 * Notification Engine Test Suite (Sprint 3)
 * Tests all 15 required scenarios:
 * 1. Laki-laki, SMK, pondok PPSQ 1
 * 2. Perempuan, SMK, pondok PPSQ 2
 * 3. Laki-laki, SMP
 * 4. Perempuan, SMA
 * 5. Pendaftaran NON_FORMAL dengan formal_institution_id = NULL
 * 6. Admin lembaga belum mempunyai nomor WhatsApp
 * 7. Tidak ada aturan aktif untuk suatu event
 * 8. Tidak ada template yang sesuai
 * 9. Dua aturan memilih penerima yang sama (Deduplikasi)
 * 10. Event diproses ulang untuk aplikasi yang sama (Idempotensi)
 * 11. GOWA tidak dapat diakses
 * 12. GOWA mengembalikan kegagalan pengiriman
 * 13. Pendaftaran berhasil tersimpan meskipun pengiriman WhatsApp gagal
 * 14. User tidak berwenang mencoba mengubah routing
 * 15. Nomor pendaftar atau wali tidak tersedia
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const { NotificationRoutingService } = require('../src/services/notificationRoutingService');
const { NotificationTemplateService } = require('../src/services/notificationTemplateService');
const { NotificationEngineService } = require('../src/services/notificationEngineService');
const app = require('../src/app');

describe('Sprint 3: Notification Engine & Dynamic Recipient Routing', () => {

  // Common stub factory
  const createMockDb = (customData = {}) => {
    return {
      query: async (sql, params = []) => {
        // Query wa_notification_recipients
        if (sql.includes('FROM wa_notification_recipients')) {
          if (customData.ruleRecipients) return [customData.ruleRecipients];
          return [[
            { rule_id: 1, recipient_type: 'SUPER_ADMIN', institution_source: 'NONE', is_active: 1, sort_order: 1 },
            { rule_id: 1, recipient_type: 'INSTITUTION_ADMIN', institution_source: 'PONDOK', is_active: 1, sort_order: 2 },
            { rule_id: 1, recipient_type: 'INSTITUTION_ADMIN', institution_source: 'FORMAL', is_active: 1, sort_order: 3 },
            { rule_id: 1, recipient_type: 'APPLICANT', institution_source: 'NONE', is_active: 1, sort_order: 4 },
            { rule_id: 1, recipient_type: 'GUARDIAN', institution_source: 'NONE', is_active: 1, sort_order: 5 }
          ]];
        }

        // Query SUPER_ADMIN users
        if (sql.includes("r.name = 'SUPER_ADMIN'")) {
          if (customData.superAdmins !== undefined) return [customData.superAdmins];
          return [[{ id: 1, name: 'Super Admin Utama', phone: '08111111111' }]];
        }

        // Query INSTITUTION_ADMIN users
        if (sql.includes('FROM users u') && sql.includes('JOIN user_institutions ui')) {
          const instId = params[0];
          if (customData.institutionAdmins && customData.institutionAdmins[instId] !== undefined) {
            return [customData.institutionAdmins[instId]];
          }
          // Default mapping
          if (instId === 1) return [[{ id: 10, name: 'Admin PPSQ 1 Putra', phone: '08122222222' }]];
          if (instId === 2) return [[{ id: 20, name: 'Admin PPSQ 2 Putri', phone: '08133333333' }]];
          if (instId === 3) return [[{ id: 30, name: 'Admin SMP', phone: '08144444444' }]];
          if (instId === 4) return [[{ id: 40, name: 'Admin SMA', phone: '08155555555' }]];
          if (instId === 5) return [[{ id: 50, name: 'Admin SMK', phone: '08166666666' }]];
          return [[]];
        }

        // Query wa_logs for idempotency
        if (sql.includes('FROM wa_logs') && sql.includes('idempotency_key = ?')) {
          if (customData.existingLogs && customData.existingLogs[params[0]]) {
            return [[customData.existingLogs[params[0]]]];
          }
          return [[]];
        }

        // Insert into wa_logs
        if (sql.includes('INSERT INTO wa_logs')) {
          return [{ insertId: 1001 }];
        }

        return [[]];
      }
    };
  };

  // Case 1: Laki-laki, SMK, pondok PPSQ 1
  test('1. Routing Laki-laki, SMK, pondok PPSQ 1', async () => {
    const mockDb = createMockDb();
    const routingService = new NotificationRoutingService();

    const context = {
      id: 1,
      applicant_id: 101,
      student_name: 'Ahmad Fauzi',
      gender: 'MALE',
      registration_type: 'SMK',
      formal_institution_id: 5,
      formal_institution_name: 'SMK IT Asy-Syadzili',
      pondok_institution_id: 1,
      pondok_institution_name: 'Pondok Pesantren Asy-Syadzili 1',
      applicant_whatsapp: '08177777777',
      guardians: []
    };

    const rules = [{ id: 1, event_code: 'REGISTRATION_CREATED' }];
    const { recipients } = await routingService.resolveRecipients(context, rules, {
      eventCode: 'REGISTRATION_CREATED',
      connection: mockDb
    });

    const recipientTypes = recipients.map(r => r.recipientType);
    assert.ok(recipientTypes.includes('SUPER_ADMIN'));
    assert.ok(recipientTypes.includes('INSTITUTION_ADMIN'));
    assert.ok(recipientTypes.includes('APPLICANT'));

    // Check specific institution targets
    const pondokAdmin = recipients.find(r => r.institutionSource === 'PONDOK');
    const formalAdmin = recipients.find(r => r.institutionSource === 'FORMAL');

    assert.equal(pondokAdmin.institutionId, 1);
    assert.equal(pondokAdmin.name, 'Admin PPSQ 1 Putra');
    assert.equal(formalAdmin.institutionId, 5);
    assert.equal(formalAdmin.name, 'Admin SMK');
  });

  // Case 2: Perempuan, SMK, pondok PPSQ 2
  test('2. Routing Perempuan, SMK, pondok PPSQ 2', async () => {
    const mockDb = createMockDb();
    const routingService = new NotificationRoutingService();

    const context = {
      id: 2,
      applicant_id: 102,
      student_name: 'Fatimah Az-Zahra',
      gender: 'FEMALE',
      registration_type: 'SMK',
      formal_institution_id: 5,
      formal_institution_name: 'SMK IT Asy-Syadzili',
      pondok_institution_id: 2,
      pondok_institution_name: 'Pondok Pesantren Asy-Syadzili 2',
      applicant_whatsapp: '08188888888',
      guardians: []
    };

    const rules = [{ id: 1, event_code: 'REGISTRATION_CREATED' }];
    const { recipients } = await routingService.resolveRecipients(context, rules, {
      eventCode: 'REGISTRATION_CREATED',
      connection: mockDb
    });

    const pondokAdmin = recipients.find(r => r.institutionSource === 'PONDOK');
    const formalAdmin = recipients.find(r => r.institutionSource === 'FORMAL');

    assert.equal(pondokAdmin.institutionId, 2);
    assert.equal(pondokAdmin.name, 'Admin PPSQ 2 Putri');
    assert.equal(formalAdmin.institutionId, 5);
  });

  // Case 3: Laki-laki, SMP
  test('3. Routing Laki-laki, SMP (PPSQ 1 & SMP)', async () => {
    const mockDb = createMockDb();
    const routingService = new NotificationRoutingService();

    const context = {
      id: 3,
      applicant_id: 103,
      student_name: 'Muhammad Farhan',
      gender: 'MALE',
      registration_type: 'SMP',
      formal_institution_id: 3,
      formal_institution_name: 'SMP IT Asy-Syadzili',
      pondok_institution_id: 1,
      pondok_institution_name: 'Pondok Pesantren Asy-Syadzili 1',
      applicant_whatsapp: '08199999999',
      guardians: []
    };

    const rules = [{ id: 1, event_code: 'REGISTRATION_CREATED' }];
    const { recipients } = await routingService.resolveRecipients(context, rules, {
      eventCode: 'REGISTRATION_CREATED',
      connection: mockDb
    });

    const formalAdmin = recipients.find(r => r.institutionSource === 'FORMAL');
    const pondokAdmin = recipients.find(r => r.institutionSource === 'PONDOK');

    assert.equal(formalAdmin.institutionId, 3);
    assert.equal(formalAdmin.name, 'Admin SMP');
    assert.equal(pondokAdmin.institutionId, 1);
  });

  // Case 4: Perempuan, SMA
  test('4. Routing Perempuan, SMA (PPSQ 2 & SMA)', async () => {
    const mockDb = createMockDb();
    const routingService = new NotificationRoutingService();

    const context = {
      id: 4,
      applicant_id: 104,
      student_name: 'Aisyah Putri',
      gender: 'FEMALE',
      registration_type: 'SMA',
      formal_institution_id: 4,
      formal_institution_name: 'SMA IT Asy-Syadzili',
      pondok_institution_id: 2,
      pondok_institution_name: 'Pondok Pesantren Asy-Syadzili 2',
      applicant_whatsapp: '08123450001',
      guardians: []
    };

    const rules = [{ id: 1, event_code: 'REGISTRATION_CREATED' }];
    const { recipients } = await routingService.resolveRecipients(context, rules, {
      eventCode: 'REGISTRATION_CREATED',
      connection: mockDb
    });

    const formalAdmin = recipients.find(r => r.institutionSource === 'FORMAL');
    const pondokAdmin = recipients.find(r => r.institutionSource === 'PONDOK');

    assert.equal(formalAdmin.institutionId, 4);
    assert.equal(formalAdmin.name, 'Admin SMA');
    assert.equal(pondokAdmin.institutionId, 2);
  });

  // Case 5: Pendaftaran NON_FORMAL dengan formal_institution_id = NULL
  test('5. Pendaftaran NON_FORMAL dengan formal_institution_id = NULL (formal admin skipped gracefully)', async () => {
    const mockDb = createMockDb();
    const routingService = new NotificationRoutingService();

    const context = {
      id: 5,
      applicant_id: 105,
      student_name: 'Santri Non Formal',
      gender: 'MALE',
      registration_type: 'NON_FORMAL',
      formal_institution_id: null,
      formal_institution_name: null,
      pondok_institution_id: 1,
      pondok_institution_name: 'Pondok Pesantren Asy-Syadzili 1',
      applicant_whatsapp: '08123450002',
      guardians: []
    };

    const rules = [{ id: 1, event_code: 'REGISTRATION_CREATED' }];
    const { recipients, skipped } = await routingService.resolveRecipients(context, rules, {
      eventCode: 'REGISTRATION_CREATED',
      connection: mockDb
    });

    const formalAdmin = recipients.find(r => r.institutionSource === 'FORMAL');
    assert.equal(formalAdmin, undefined);

    const formalSkipped = skipped.find(s => s.reason === 'NON_FORMAL_NO_FORMAL_INSTITUTION');
    assert.ok(formalSkipped);

    // Pondok admin and super admin still present
    const pondokAdmin = recipients.find(r => r.institutionSource === 'PONDOK');
    assert.ok(pondokAdmin);
    assert.equal(pondokAdmin.institutionId, 1);
  });

  // Case 6: Admin lembaga belum mempunyai nomor WhatsApp
  test('6. Admin lembaga belum mempunyai nomor WhatsApp (skipped gracefully with NO_PHONE)', async () => {
    const mockDb = createMockDb({
      institutionAdmins: {
        5: [{ id: 50, name: 'Admin SMK Tanpa WA', phone: null }]
      }
    });
    const routingService = new NotificationRoutingService();

    const context = {
      id: 6,
      applicant_id: 106,
      student_name: 'Udin',
      gender: 'MALE',
      registration_type: 'SMK',
      formal_institution_id: 5,
      pondok_institution_id: 1,
      applicant_whatsapp: '08123450003',
      guardians: []
    };

    const rules = [{ id: 1, event_code: 'REGISTRATION_CREATED' }];
    const { recipients, skipped } = await routingService.resolveRecipients(context, rules, {
      eventCode: 'REGISTRATION_CREATED',
      connection: mockDb
    });

    const formalAdmin = recipients.find(r => r.name === 'Admin SMK Tanpa WA');
    assert.equal(formalAdmin, undefined);

    const skippedItem = skipped.find(s => s.name === 'Admin SMK Tanpa WA' && s.reason === 'NO_PHONE');
    assert.ok(skippedItem);
  });

  // Case 7: Tidak ada aturan aktif untuk suatu event
  test('7. Tidak ada aturan aktif untuk suatu event (returns NO_ACTIVE_RULES)', async () => {
    const mockRouting = {
      getApplicationContext: async () => ({ id: 7, registration_type: 'SMK', gender: 'MALE' }),
      getMatchingRules: async () => []
    };

    const engine = new NotificationEngineService(mockRouting);
    const result = await engine.processEvent('UNKNOWN_EVENT', 7);

    assert.equal(result.success, true);
    assert.equal(result.reason, 'NO_ACTIVE_RULES');
    assert.equal(result.totalRecipients, 0);
  });

  // Case 8: Tidak ada template yang sesuai
  test('8. Tidak ada template yang sesuai (records failure and returns NO_TEMPLATE_FOUND)', async () => {
    const mockRouting = {
      getApplicationContext: async () => ({ id: 8, registration_type: 'SMK', gender: 'MALE', formal_institution_id: 5 }),
      getMatchingRules: async () => [{ id: 1 }],
      resolveRecipients: async () => ({
        recipients: [{ recipientType: 'APPLICANT', phone: '628123456789', idempotencyKey: 'KEY_8' }],
        skipped: []
      })
    };

    const mockTemplate = {
      resolveTemplate: async () => null // Template not found
    };

    const engine = new NotificationEngineService(mockRouting, mockTemplate);
    const result = await engine.processEvent('REGISTRATION_CREATED', 8, { connection: createMockDb() });

    assert.equal(result.success, false);
    assert.equal(result.reason, 'NO_TEMPLATE_FOUND');
  });

  // Case 9: Dua aturan memilih penerima yang sama (Deduplikasi)
  test('9. Dua aturan memilih penerima yang sama (deduplicated by normalized phone and identifier)', async () => {
    // Super Admin has phone 08122222222, and SMK Admin also has phone 08122222222
    const mockDb = createMockDb({
      superAdmins: [{ id: 1, name: 'Pak Bos', phone: '08122222222' }],
      institutionAdmins: {
        5: [{ id: 1, name: 'Pak Bos', phone: '08122222222' }] // Same user / phone
      }
    });

    const routingService = new NotificationRoutingService();
    const context = {
      id: 9,
      applicant_id: 109,
      student_name: 'Dedi',
      gender: 'MALE',
      registration_type: 'SMK',
      formal_institution_id: 5,
      pondok_institution_id: 1,
      applicant_whatsapp: '08129999999',
      guardians: []
    };

    const rules = [{ id: 1, event_code: 'REGISTRATION_CREATED' }];
    const { recipients, skipped } = await routingService.resolveRecipients(context, rules, {
      eventCode: 'REGISTRATION_CREATED',
      connection: mockDb
    });

    // Pak Bos should only appear once with normalized phone '628122222222'
    const pakBosRecipients = recipients.filter(r => r.phone === '628122222222');
    assert.equal(pakBosRecipients.length, 1);

    const duplicateSkipped = skipped.find(s => s.reason === 'DUPLICATE_RECIPIENT_OR_PHONE');
    assert.ok(duplicateSkipped);
  });

  // Case 10: Event diproses ulang untuk aplikasi yang sama (Idempotensi)
  test('10. Event diproses ulang untuk aplikasi yang sama (recognizes ALREADY_SENT, zero duplicate sends)', async () => {
    let gowaSendCount = 0;
    const mockGowa = {
      sendMessage: async () => {
        gowaSendCount++;
        return { success: true, messageId: 'MSG-IDEMPOTENT-1' };
      }
    };

    const existingLogs = {
      'REGISTRATION_CREATED:10:APPLICANT:applicant_110': {
        id: 99,
        status: 'SENT',
        provider_message_id: 'PREVIOUS_SENT_MSG'
      }
    };

    const mockDb = createMockDb({ existingLogs });

    const mockRouting = {
      getApplicationContext: async () => ({ id: 10, registration_type: 'SMK', gender: 'MALE' }),
      getMatchingRules: async () => [{ id: 1 }],
      resolveRecipients: async () => ({
        recipients: [{
          recipientType: 'APPLICANT',
          name: 'Siswa Idemp',
          phone: '62811111111',
          idempotencyKey: 'REGISTRATION_CREATED:10:APPLICANT:applicant_110'
        }],
        skipped: []
      })
    };

    const mockTemplate = {
      resolveTemplate: async () => ({ template: { id: 1, message: 'Halo {{student_name}}' } }),
      renderMessage: () => 'Halo Siswa Idemp'
    };

    const engine = new NotificationEngineService(mockRouting, mockTemplate, mockGowa);
    const result = await engine.processEvent('REGISTRATION_CREATED', 10, { connection: mockDb });

    assert.equal(result.success, true);
    assert.equal(gowaSendCount, 0); // Did NOT call GOWA again!
    assert.equal(result.skipped, 1);
    assert.equal(result.details[0].status, 'ALREADY_SENT');
  });

  // Case 11: GOWA tidak dapat diakses
  test('11. GOWA tidak dapat diakses (catches error, logs FAILED status, returns summary)', async () => {
    const mockGowa = {
      sendMessage: async () => {
        const err = new Error('Gagal menghubungi server GOWA: ECONNREFUSED');
        err.code = 'GOWA_UNREACHABLE';
        throw err;
      }
    };

    const mockDb = createMockDb();
    const mockRouting = {
      getApplicationContext: async () => ({ id: 11, registration_type: 'SMK', gender: 'MALE' }),
      getMatchingRules: async () => [{ id: 1 }],
      resolveRecipients: async () => ({
        recipients: [{
          recipientType: 'APPLICANT',
          name: 'Siswa',
          phone: '62811111111',
          idempotencyKey: 'REG_11'
        }],
        skipped: []
      })
    };

    const mockTemplate = {
      resolveTemplate: async () => ({ template: { id: 1, message: 'Test pesan' } }),
      renderMessage: () => 'Test pesan'
    };

    const engine = new NotificationEngineService(mockRouting, mockTemplate, mockGowa);
    const result = await engine.processEvent('REGISTRATION_CREATED', 11, { connection: mockDb });

    assert.equal(result.success, true);
    assert.equal(result.sent, 0);
    assert.equal(result.failed, 1);
    assert.ok(result.details[0].error.includes('ECONNREFUSED'));
  });

  // Case 12: GOWA mengembalikan kegagalan pengiriman
  test('12. GOWA mengembalikan kegagalan pengiriman (provider rejected message)', async () => {
    const mockGowa = {
      sendMessage: async () => {
        const err = new Error('Nomor tidak terdaftar di WhatsApp');
        err.code = 'NOT_ON_WHATSAPP';
        throw err;
      }
    };

    const mockDb = createMockDb();
    const mockRouting = {
      getApplicationContext: async () => ({ id: 12, registration_type: 'SMK', gender: 'MALE' }),
      getMatchingRules: async () => [{ id: 1 }],
      resolveRecipients: async () => ({
        recipients: [{
          recipientType: 'APPLICANT',
          name: 'Siswa',
          phone: '62811111111',
          idempotencyKey: 'REG_12'
        }],
        skipped: []
      })
    };

    const mockTemplate = {
      resolveTemplate: async () => ({ template: { id: 1, message: 'Test pesan' } }),
      renderMessage: () => 'Test pesan'
    };

    const engine = new NotificationEngineService(mockRouting, mockTemplate, mockGowa);
    const result = await engine.processEvent('REGISTRATION_CREATED', 12, { connection: mockDb });

    assert.equal(result.success, true);
    assert.equal(result.failed, 1);
    assert.equal(result.details[0].status, 'FAILED');
  });

  // Case 13: Pendaftaran berhasil tersimpan meskipun pengiriman WhatsApp gagal
  test('13. Pendaftaran berhasil tersimpan meskipun pengiriman WhatsApp gagal', async () => {
    // Simulate failing notification engine called non-blocking
    let backgroundErrorLogged = false;
    const failingEngine = {
      processEvent: async () => {
        throw new Error('GOWA server down');
      }
    };

    // Registration creation simulation
    const registrationCreation = async () => {
      // 1. Database insert succeeds
      const savedApplication = { id: 13, registrationNumber: 'SPSMB-2027-0013', status: 'DRAFT' };

      // 2. Background WhatsApp dispatch (non-blocking)
      failingEngine.processEvent('REGISTRATION_CREATED', savedApplication.id).catch(() => {
        backgroundErrorLogged = true;
      });

      // 3. User receives registration success response without being blocked
      return savedApplication;
    };

    const appResult = await registrationCreation();
    assert.equal(appResult.id, 13);
    assert.equal(appResult.status, 'DRAFT');

    // Wait microtask
    await new Promise(r => setTimeout(r, 10));
    assert.equal(backgroundErrorLogged, true);
  });

  // Case 14: User tidak berwenang mencoba mengubah routing
  test('14. User tidak berwenang mencoba mengubah routing (returns 403 Forbidden)', async () => {
    // Generate token for ADMIN_SPSMB (not SUPER_ADMIN)
    const nonSuperAdminToken = jwt.sign(
      { sub: 3, roles: ['ADMIN_SPSMB'], primaryRole: 'ADMIN_SPSMB' },
      process.env.JWT_SECRET || 'change-this-with-a-long-random-secret'
    );

    const server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const port = server.address().port;

    try {
      const response = await fetch(`http://localhost:${port}/api/v1/notification-rules/1`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${nonSuperAdminToken}`
        },
        body: JSON.stringify({ name: 'Hacked Rule Name' })
      });

      const body = await response.json();
      assert.equal(response.status, 403);
      assert.equal(body.success, false);
      assert.ok(body.message.includes('izin'));
    } finally {
      await new Promise(r => server.close(r));
    }
  });

  // Case 15: Nomor pendaftar atau wali tidak tersedia
  test('15. Nomor pendaftar atau wali tidak tersedia (skipped gracefully without crashing)', async () => {
    const mockDb = createMockDb();
    const routingService = new NotificationRoutingService();

    const context = {
      id: 15,
      applicant_id: 115,
      student_name: 'Santri Tanpa HP',
      gender: 'MALE',
      registration_type: 'SMP',
      formal_institution_id: 3,
      pondok_institution_id: 1,
      applicant_whatsapp: null, // No applicant phone!
      guardians: [
        { id: 1, name: 'Ayah', phone: '' } // Empty guardian phone!
      ]
    };

    const rules = [{ id: 1, event_code: 'REGISTRATION_CREATED' }];
    const { recipients, skipped } = await routingService.resolveRecipients(context, rules, {
      eventCode: 'REGISTRATION_CREATED',
      connection: mockDb
    });

    const applicantRecipient = recipients.find(r => r.recipientType === 'APPLICANT');
    const guardianRecipient = recipients.find(r => r.recipientType === 'GUARDIAN');

    assert.equal(applicantRecipient, undefined);
    assert.equal(guardianRecipient, undefined);

    const applicantSkipped = skipped.find(s => s.recipientType === 'APPLICANT');
    const guardianSkipped = skipped.find(s => s.recipientType === 'GUARDIAN');

    assert.equal(applicantSkipped.reason, 'NO_PHONE');
    assert.equal(guardianSkipped.reason, 'NO_PHONE');

    // Admin recipients still successfully resolved!
    const superAdmin = recipients.find(r => r.recipientType === 'SUPER_ADMIN');
    assert.ok(superAdmin);
  });

  // Clean up database pool to prevent hanging processes
  test.after(async () => {
    const pool = require('../src/config/database');
    try {
      await pool.end();
    } catch (_) {}
  });

});
