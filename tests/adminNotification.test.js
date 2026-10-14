const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { NotificationRoutingService } = require('../src/services/notificationRoutingService');
const { NotificationEngineService } = require('../src/services/notificationEngineService');
const composer = require('../src/services/whatsappTemplateComposer');

describe('Notifikasi Admin: Detail Pendaftar Lengkap & Routing Lembaga SMP', () => {

  const createMockDb = () => {
    return {
      query: async (sql, params = []) => {
        // Query wa_notification_recipients
        if (sql.includes('FROM wa_notification_recipients')) {
          return [[
            { rule_id: 1, recipient_type: 'SUPER_ADMIN', institution_source: 'NONE', is_active: 1, sort_order: 1 },
            { rule_id: 1, recipient_type: 'INSTITUTION_ADMIN', institution_source: 'PONDOK', is_active: 1, sort_order: 2 },
            { rule_id: 1, recipient_type: 'INSTITUTION_ADMIN', institution_source: 'FORMAL', is_active: 1, sort_order: 3 },
            { rule_id: 1, recipient_type: 'APPLICANT', institution_source: 'NONE', is_active: 1, sort_order: 4 }
          ]];
        }

        // Query SUPER_ADMIN users
        if (sql.includes("r.name = 'SUPER_ADMIN'")) {
          return [[{ id: 1, name: 'Super Admin Pusat', phone: '08111111111' }]];
        }

        // Query INSTITUTION_ADMIN users
        if (sql.includes('FROM users u') && sql.includes('JOIN user_institutions ui')) {
          const instId = params[0];
          if (instId === 1) return [[{ id: 10, name: 'Admin PPSQ Putra', phone: '08122222222' }]];
          if (instId === 2) return [[{ id: 20, name: 'Admin PPSQ Putri', phone: '08133333333' }]];
          if (instId === 3) return [[{ id: 30, name: 'Admin SMP', phone: '08144444444' }]];
          return [[]];
        }

        // Query wa_logs for idempotency
        if (sql.includes('FROM wa_logs') && sql.includes('idempotency_key = ?')) {
          return [[]];
        }

        // Insert into wa_logs
        if (sql.includes('INSERT INTO wa_logs')) {
          return [{ insertId: 9001 }];
        }

        return [[]];
      }
    };
  };

  test('1. Pendaftar siswa laki-laki SMP dirutekan ke Admin PPSQ 1 Putra dan Admin SMP', async () => {
    const mockDb = createMockDb();
    const routing = new NotificationRoutingService();

    const context = {
      id: 501,
      applicant_id: 301,
      registration_number: 'SPSMB-2027-SMP-001',
      student_name: 'Ahmad Zaki',
      gender: 'MALE',
      registration_type: 'SMP',
      formal_institution_id: 3,
      formal_institution_name: 'SMP IT Asy-Syadzili',
      pondok_institution_id: 1,
      pondok_institution_name: 'Pondok Pesantren Asy-Syadzili 1',
      applicant_whatsapp: '081234567890',
      applicant_address: 'Jl. Pesantren No. 10, Malang',
      previous_school: 'SDN 1 Pakis',
      birth_place: 'Malang',
      birth_date: '2012-05-15',
      created_at: '2026-10-14T20:00:00.000Z',
      guardians: [
        { name: 'H. Sulaiman', phone: '081987654321', relationship: 'FATHER' }
      ]
    };

    const rules = [{ id: 1, event_code: 'REGISTRATION_CREATED' }];
    const { recipients } = await routing.resolveRecipients(context, rules, {
      eventCode: 'REGISTRATION_CREATED',
      connection: mockDb
    });

    const pondokAdmin = recipients.find(r => r.institutionSource === 'PONDOK');
    const formalAdmin = recipients.find(r => r.institutionSource === 'FORMAL');
    const applicantRec = recipients.find(r => r.recipientType === 'APPLICANT');

    assert.ok(pondokAdmin, 'Pondok admin harus ditemukan');
    assert.equal(pondokAdmin.name, 'Admin PPSQ Putra');
    assert.equal(pondokAdmin.institutionId, 1);
    assert.equal(pondokAdmin.phone, '628122222222');

    assert.ok(formalAdmin, 'SMP admin harus ditemukan');
    assert.equal(formalAdmin.name, 'Admin SMP');
    assert.equal(formalAdmin.institutionId, 3);
    assert.equal(formalAdmin.phone, '628144444444');

    assert.ok(applicantRec, 'Applicant harus ditemukan');
  });

  test('2. Admin menerima pesan statis detail pendaftar yang lengkap, bukan template sambutan santri', async () => {
    const mockDb = createMockDb();
    const sentMessages = [];

    const mockGowa = {
      sendMessage: async (phone, message) => {
        sentMessages.push({ phone, message });
        return { success: true, messageId: `MSG-${Date.now()}` };
      }
    };

    const context = {
      id: 502,
      applicant_id: 302,
      registration_number: 'SPSMB-2027-SMP-002',
      student_name: 'Farhan Maulana',
      gender: 'MALE',
      registration_type: 'SMP',
      formal_institution_id: 3,
      formal_institution_name: 'SMP IT Asy-Syadzili',
      pondok_institution_id: 1,
      pondok_institution_name: 'Pondok Pesantren Asy-Syadzili 1',
      applicant_whatsapp: '081234567891',
      applicant_address: 'Jl. Melati No. 5, Malang',
      previous_school: 'SD Islam Al-Azhar',
      birth_place: 'Malang',
      birth_date: '2012-08-20',
      created_at: '2026-10-14T20:10:00.000Z',
      guardians: [
        { name: 'Bambang Irawan', phone: '081999888777', relationship: 'FATHER' }
      ]
    };

    const mockRouting = {
      getApplicationContext: async () => context,
      getMatchingRules: async () => [{ id: 1 }],
      resolveRecipients: async () => ({
        recipients: [
          { recipientType: 'INSTITUTION_ADMIN', institutionSource: 'PONDOK', name: 'Admin PPSQ Putra', phone: '62812222222', idempotencyKey: 'KEY_PONDOK' },
          { recipientType: 'INSTITUTION_ADMIN', institutionSource: 'FORMAL', name: 'Admin SMP', phone: '62814444444', idempotencyKey: 'KEY_SMP' },
          { recipientType: 'APPLICANT', institutionSource: 'NONE', name: 'Farhan', phone: '6281234567891', idempotencyKey: 'KEY_APP' }
        ],
        skipped: []
      })
    };

    const mockTemplate = {
      resolveTemplate: async () => ({
        template: { id: 1, message: 'Selamat datang santri {{student_name}} klik tautan ini: {{continue_url}}' }
      }),
      renderMessage: (msg, ctx) => `Selamat datang santri ${ctx.student_name} klik tautan ini: http://localhost:5173/pendaftaran/formulir`
    };

    const engine = new NotificationEngineService(mockRouting, mockTemplate, mockGowa, composer);
    const result = await engine.processEvent('REGISTRATION_CREATED', 502, { connection: mockDb });

    assert.equal(result.success, true);
    assert.equal(sentMessages.length, 3);

    const pondokMsg = sentMessages.find(m => m.phone === '62812222222');
    const smpMsg = sentMessages.find(m => m.phone === '62814444444');
    const applicantMsg = sentMessages.find(m => m.phone === '6281234567891');

    // Admin message assertions
    for (const adminItem of [pondokMsg, smpMsg]) {
      const msg = adminItem.message;
      assert.ok(msg.includes('NOTIFIKASI PENDAFTAR BARU'), 'Harus berisi header notifikasi pendaftar baru');
      assert.ok(msg.includes('SPSMB-2027-SMP-002'), 'Harus berisi nomor registrasi');
      assert.ok(msg.includes('Farhan Maulana'), 'Harus berisi nama pendaftar');
      assert.ok(msg.includes('Laki-laki'), 'Harus berisi jenis kelamin');
      assert.ok(msg.includes('081234567891'), 'Harus berisi nomor WhatsApp');
      assert.ok(msg.includes('SD Islam Al-Azhar'), 'Harus berisi asal sekolah');
      assert.ok(msg.includes('Jl. Melati No. 5, Malang'), 'Harus berisi alamat');
      assert.ok(msg.includes('SMP IT Asy-Syadzili'), 'Harus berisi nama lembaga SMP');
      assert.ok(msg.includes('Pondok Pesantren Asy-Syadzili 1'), 'Harus berisi nama pondok putra');
      assert.ok(msg.includes('Bambang Irawan'), 'Harus berisi nama wali');
      assert.ok(msg.includes('081999888777'), 'Harus berisi nomor telepon wali');

      // Admin message should NOT contain applicant greeting action text
      assert.ok(!msg.includes('klik tautan berikut:'), 'Admin tidak boleh menerima link formulir sambutan santri');
    }

    // Applicant message should receive the applicant greeting
    assert.ok(applicantMsg.message.includes('Selamat datang santri Farhan Maulana'), 'Applicant menerima pesan sambutan pendaftar');
  });

  test('3. Pendaftar siswi perempuan SMP dirutekan ke PPSQ 2 Putri dan SMP dengan data lengkap', async () => {
    const mockDb = createMockDb();
    const sentMessages = [];

    const mockGowa = {
      sendMessage: async (phone, message) => {
        sentMessages.push({ phone, message });
        return { success: true, messageId: `MSG-${Date.now()}` };
      }
    };

    const context = {
      id: 503,
      applicant_id: 303,
      registration_number: 'SPSMB-2027-SMP-003',
      student_name: 'Aisyah Humaira',
      gender: 'FEMALE',
      registration_type: 'SMP',
      formal_institution_id: 3,
      formal_institution_name: 'SMP IT Asy-Syadzili',
      pondok_institution_id: 2,
      pondok_institution_name: 'Pondok Pesantren Asy-Syadzili 2',
      applicant_whatsapp: '081555666777',
      applicant_address: 'Jl. Candi Mendut No. 12',
      previous_school: 'MI Miftahul Huda',
      birth_place: 'Surabaya',
      birth_date: '2012-11-03',
      guardians: [
        { name: 'Khadijah', phone: '081555000111', relationship: 'MOTHER' }
      ]
    };

    const adminMessage = composer.formatAdminNotification(context, 'REGISTRATION_CREATED');

    assert.ok(adminMessage.includes('Aisyah Humaira'));
    assert.ok(adminMessage.includes('Perempuan'));
    assert.ok(adminMessage.includes('SMP IT Asy-Syadzili'));
    assert.ok(adminMessage.includes('Pondok Pesantren Asy-Syadzili 2'));
    assert.ok(adminMessage.includes('Khadijah'));
    assert.ok(adminMessage.includes('Surabaya'));
  });

});
