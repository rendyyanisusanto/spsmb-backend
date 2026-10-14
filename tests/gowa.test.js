/**
 * Test Suite for GOWA WhatsApp Gateway v9
 * Covers the 10 test requirements specified in Sprint 2:
 * 1. Server GOWA aktif
 * 2. Server GOWA tidak dapat diakses
 * 3. Basic Auth salah atau tidak valid
 * 4. WhatsApp terhubung dan login
 * 5. WhatsApp belum terhubung atau belum login
 * 6. Nomor tujuan tidak valid
 * 7. Pesan berhasil dikirim
 * 8. Request timeout
 * 9. Respons GOWA gagal atau tidak sesuai format
 * 10. User tanpa hak akses mencoba mengirim pesan uji coba
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { GowaService } = require('../src/services/gowaService');
const app = require('../src/app');

describe('GOWA WhatsApp Gateway v9 Test Suite', () => {

  // Test 1: Server GOWA aktif
  test('1. Server GOWA aktif (checkHealth returns isHealthy: true)', async () => {
    const mockFetch = async (url) => {
      assert.ok(url.includes('/health'));
      return {
        status: 200,
        ok: true,
        text: async () => 'OK'
      };
    };

    const service = new GowaService(mockFetch);
    const result = await service.checkHealth();

    assert.equal(result.isHealthy, true);
    assert.equal(result.status, 'OK');
    assert.ok(result.latencyMs >= 0);
  });

  // Test 2: Server GOWA tidak dapat diakses
  test('2. Server GOWA tidak dapat diakses (handles network error gracefully)', async () => {
    const mockFetch = async () => {
      throw new Error('fetch failed: connect ECONNREFUSED 127.0.0.1:9999');
    };

    const service = new GowaService(mockFetch);
    const result = await service.checkHealth();

    assert.equal(result.isHealthy, false);
    assert.equal(result.status, 'GOWA_UNREACHABLE');
    assert.ok(result.error.includes('Gagal menghubungi server GOWA'));
  });

  // Test 3: Basic Auth salah atau tidak valid
  test('3. Basic Auth salah atau tidak valid (handles 401 Unauthorized)', async () => {
    const mockFetch = async (url) => {
      if (url.includes('/health')) {
        return { status: 200, ok: true, text: async () => 'OK' };
      }
      if (url.includes('/app/status')) {
        return {
          status: 401,
          ok: false,
          statusText: 'Unauthorized',
          text: async () => 'Unauthorized'
        };
      }
      throw new Error(`Unhandled path: ${url}`);
    };

    const service = new GowaService(mockFetch);
    const result = await service.getConnectionStatus();

    assert.equal(result.server.authError, true);
    assert.equal(result.whatsapp.statusLabel, 'AUTH_FAILED');
    assert.ok(result.error.includes('401 Unauthorized'));
  });

  // Test 4: WhatsApp terhubung dan login
  test('4. WhatsApp terhubung dan login (returns connected & logged in with JID)', async () => {
    const mockFetch = async (url) => {
      if (url.includes('/health')) {
        return { status: 200, ok: true, text: async () => 'OK' };
      }
      if (url.includes('/app/status')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            code: 'SUCCESS',
            message: 'Connection status retrieved',
            results: {
              device_id: 'device-test-123',
              is_connected: true,
              is_logged_in: true,
              jid: '628123456789@s.whatsapp.net'
            }
          })
        };
      }
      if (url.includes('/app/info')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            results: { version: 'v9.6.0' }
          })
        };
      }
      throw new Error(`Unhandled path: ${url}`);
    };

    const service = new GowaService(mockFetch);
    const result = await service.getConnectionStatus();

    assert.equal(result.whatsapp.isConnected, true);
    assert.equal(result.whatsapp.isLoggedIn, true);
    assert.equal(result.whatsapp.statusLabel, 'CONNECTED');
    assert.equal(result.whatsapp.phoneNumber, '628123456789');
    assert.equal(result.whatsapp.deviceId, 'device-test-123');
  });

  // Test 5: WhatsApp belum terhubung atau belum login
  test('5. WhatsApp belum terhubung atau belum login (returns DISCONNECTED)', async () => {
    const mockFetch = async (url) => {
      if (url.includes('/health')) {
        return { status: 200, ok: true, text: async () => 'OK' };
      }
      if (url.includes('/app/status')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            code: 'SUCCESS',
            message: 'Connection status retrieved',
            results: {
              device_id: 'device-test-123',
              is_connected: false,
              is_logged_in: false,
              jid: ''
            }
          })
        };
      }
      if (url.includes('/app/info')) {
        return { status: 200, ok: true, json: async () => ({ results: { version: 'v9' } }) };
      }
      throw new Error(`Unhandled path: ${url}`);
    };

    const service = new GowaService(mockFetch);
    const result = await service.getConnectionStatus();

    assert.equal(result.whatsapp.isConnected, false);
    assert.equal(result.whatsapp.isLoggedIn, false);
    assert.equal(result.whatsapp.statusLabel, 'DISCONNECTED');
  });

  // Test 6: Nomor tujuan tidak valid
  test('6. Nomor tujuan tidak valid (throws validation error on bad format)', async () => {
    const service = new GowaService();

    // Test cases for invalid numbers
    assert.throws(() => service.normalizePhoneNumber(''), /Nomor telepon/);
    assert.throws(() => service.normalizePhoneNumber('abcde'), /Nomor telepon hanya boleh berisi angka/);
    assert.throws(() => service.normalizePhoneNumber('1234'), /Panjang nomor telepon tidak valid/);
    assert.throws(() => service.normalizePhoneNumber('1234567890123456789'), /Panjang nomor telepon tidak valid/);

    // Test valid normalization
    assert.equal(service.normalizePhoneNumber('081234567890'), '6281234567890');
    assert.equal(service.normalizePhoneNumber('+6281234567890'), '6281234567890');
    assert.equal(service.normalizePhoneNumber('81234567890'), '6281234567890');
    assert.equal(service.normalizePhoneNumber('0812-3456-7890'), '6281234567890');
    assert.equal(service.normalizePhoneNumber('6281234567890@s.whatsapp.net'), '6281234567890');
  });

  // Test 7: Pesan berhasil dikirim
  test('7. Pesan berhasil dikirim (returns messageId and status SENT)', async () => {
    let capturedBody = null;
    let capturedHeaders = null;

    const mockFetch = async (url, options) => {
      assert.ok(url.includes('/send/message'));
      capturedBody = JSON.parse(options.body);
      capturedHeaders = options.headers;

      return {
        status: 200,
        ok: true,
        json: async () => ({
          code: 'SUCCESS',
          message: 'Success',
          results: {
            message_id: 'MSG-TEST-UUID-999',
            status: 'sent'
          }
        })
      };
    };

    const service = new GowaService(mockFetch);
    const result = await service.sendMessage('081234567890', 'Halo, ini pesan uji coba.');

    assert.equal(result.success, true);
    assert.equal(result.messageId, 'MSG-TEST-UUID-999');
    assert.equal(result.recipient, '6281234567890');
    assert.equal(capturedBody.phone, '6281234567890');
    assert.equal(capturedBody.message, 'Halo, ini pesan uji coba.');
    assert.ok(capturedHeaders.Authorization.startsWith('Basic '));
  });

  // Test 8: Request timeout
  test('8. Request timeout (handles request exceeding timeoutMs)', async () => {
    const mockFetch = async (url, options) => {
      // Simulate delay exceeding timeout
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    };

    const service = new GowaService(mockFetch);
    await assert.rejects(
      async () => {
        await service.sendMessage('081234567890', 'Pesan timeout test', { timeoutMs: 50 });
      },
      (err) => {
        assert.equal(err.code, 'GOWA_TIMEOUT');
        assert.equal(err.status, 504);
        return true;
      }
    );
  });

  // Test 9: Respons GOWA gagal atau tidak sesuai format
  test('9. Respons GOWA gagal atau tidak sesuai format (handles non-JSON or error codes)', async () => {
    // Sub-case 9a: Error code returned by GOWA
    const mockFetchError = async () => ({
      status: 400,
      ok: false,
      json: async () => ({
        code: 'VALIDATION_ERROR',
        message: 'phone: cannot be blank.'
      })
    });

    const serviceError = new GowaService(mockFetchError);
    await assert.rejects(
      async () => {
        await serviceError.sendMessage('081234567890', 'Test error');
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.ok(err.message.includes('phone: cannot be blank'));
        return true;
      }
    );

    // Sub-case 9b: Non-JSON HTML error returned (e.g. 502 Bad Gateway proxy error)
    const mockFetchHtml = async () => ({
      status: 502,
      ok: false,
      json: async () => { throw new Error('Unexpected token < in JSON'); },
      text: async () => '<html><body>502 Bad Gateway</body></html>'
    });

    const serviceHtml = new GowaService(mockFetchHtml);
    await assert.rejects(
      async () => {
        await serviceHtml.sendMessage('081234567890', 'Test HTML response');
      },
      (err) => {
        assert.equal(err.code, 'INVALID_RESPONSE');
        return true;
      }
    );
  });

  // Test 10: User tanpa hak akses mencoba mengirim pesan uji coba
  test('10. User tanpa hak akses mencoba mengirim pesan uji coba (returns 401 Unauthorized)', async () => {
    // Start server on random free port
    const server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const port = server.address().port;

    try {
      const response = await fetch(`http://localhost:${port}/api/v1/gowa/test-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '081234567890', message: 'Test unauthorized' })
      });

      const body = await response.json();

      assert.equal(response.status, 401);
      assert.equal(body.success, false);
      assert.ok(body.message.includes('login terlebih dahulu'));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

});
