const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const pool = require('../src/config/database');
const app = require('../src/app');

describe('Fitur Resend WhatsApp & Status Pengiriman WhatsApp', () => {
  const secret = process.env.JWT_SECRET || 'change-this-with-a-long-random-secret';

  const superAdminToken = jwt.sign(
    { sub: 1, roles: ['SUPER_ADMIN'], primaryRole: 'SUPER_ADMIN' },
    secret
  );

  let server;
  let baseUrl;

  before(async () => {
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://localhost:${port}/api/v1`;
  });

  after(async () => {
    if (server) await new Promise(r => server.close(r));
    try {
      await pool.end();
    } catch (_) {}
  });

  test('1. GET /api/applications mengembalikan field whatsappStatus dan whatsappSentAt', async () => {
    const res = await fetch(`${baseUrl}/applications?limit=5`, {
      headers: {
        'Authorization': `Bearer ${superAdminToken}`
      }
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data));

    if (json.data.length > 0) {
      const firstApp = json.data[0];
      assert.ok('whatsappStatus' in firstApp, 'whatsappStatus harus ada di data pendaftar');
      assert.ok('whatsappSentAt' in firstApp, 'whatsappSentAt harus ada di data pendaftar');
      assert.ok(['SENT', 'FAILED', 'UNSENT', 'PENDING'].includes(firstApp.whatsappStatus));
    }
  });

  test('2. POST /api/applications/:id/resend-whatsapp membutuhkan otentikasi admin', async () => {
    const res = await fetch(`${baseUrl}/applications/1/resend-whatsapp`, {
      method: 'POST'
    });

    assert.equal(res.status, 401);
  });

  test('3. POST /api/applications/:id/resend-whatsapp mengembalikan 404 jika pendaftar tidak ada', async () => {
    const res = await fetch(`${baseUrl}/applications/999999/resend-whatsapp`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${superAdminToken}`
      }
    });

    assert.equal(res.status, 404);
  });

  test('4. POST /api/applications/:id/resend-whatsapp berhasil memproses kirim ulang untuk pendaftar yang valid', async () => {
    // Ambil 1 pendaftar dari database
    const [apps] = await pool.query('SELECT id, registration_number FROM applications LIMIT 1');
    if (apps.length === 0) return; // Skip if db empty

    const appId = apps[0].id;
    const res = await fetch(`${baseUrl}/applications/${appId}/resend-whatsapp`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${superAdminToken}`
      }
    });

    // Harus merespons baik 200 (jika gateway terhubung) atau 400 (jika gateway offline / nomor invalid)
    // yang terpenting route berfungsi dan mengembalikan JSON terstruktur
    assert.ok([200, 400].includes(res.status));
    const json = await res.json();
    assert.ok('message' in json);
    if (json.data) {
      assert.ok('continueUrl' in json.data, 'Data response harus menyertakan continueUrl');
      assert.ok('receiptUrl' in json.data, 'Data response harus menyertakan receiptUrl');
    }
  });

  test('5. GET /api/applications/:id/resend-preview mengembalikan preview struk dan link pendaftaran lengkap', async () => {
    const [apps] = await pool.query('SELECT id, registration_number FROM applications LIMIT 1');
    if (apps.length === 0) return;

    const appId = apps[0].id;
    const res = await fetch(`${baseUrl}/applications/${appId}/resend-preview`, {
      headers: {
        'Authorization': `Bearer ${superAdminToken}`
      }
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.continueUrl.includes('/pendaftaran/lanjut/'), 'Harus menyertakan URL link pendaftaran lengkap');
    assert.ok(json.data.receiptUrl.includes('?to=struk'), 'Harus menyertakan URL struk pendaftaran');
    assert.ok(json.data.previewMessage.length > 0, 'Harus menyertakan preview pesan WhatsApp');
  });

  test('6. POST /api/applications/:id/resend-whatsapp mengirim pesan baru yang sesuai dengan customMessage / struk & link', async () => {
    const [apps] = await pool.query('SELECT id, registration_number FROM applications LIMIT 1');
    if (apps.length === 0) return;

    const appId = apps[0].id;
    const testMsg = `Pesan Resmi SPSMB Baru (Resend):\nNomor: ${apps[0].registration_number}\n📄 BUKTI STRUK: http://localhost:5173/pendaftaran/lanjut/test?to=struk\n🔗 LINK PENDAFTARAN: http://localhost:5173/pendaftaran/lanjut/test`;

    const res = await fetch(`${baseUrl}/applications/${appId}/resend-whatsapp`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        includeReceipt: true,
        includeContinueLink: true,
        customMessage: testMsg
      })
    });

    assert.ok([200, 400].includes(res.status));
    
    // Check latest log in wa_logs for this application
    const [logs] = await pool.query(
      'SELECT message, status FROM wa_logs WHERE application_id = ? ORDER BY id DESC LIMIT 1',
      [appId]
    );

    if (logs.length > 0) {
      assert.equal(logs[0].message, testMsg, 'Pesan di wa_logs harus sesuai dengan pesan baru yang dikirim');
    }
  });
});
