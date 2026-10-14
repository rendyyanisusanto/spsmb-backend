/**
 * GOWA WhatsApp Gateway v9 Service
 * Handles communication with GOWA v9 REST API.
 * Ensures strict security (no credential leaking, timeout protection, safe logging).
 */

const getGowaConfig = require('../config/gowaConfig');

class GowaService {
  constructor(customFetch = null) {
    this.fetchClient = customFetch || globalThis.fetch.bind(globalThis);
  }

  /**
   * Helper to normalize Indonesian and international phone numbers
   * Supports:
   * - 081234567890 -> 6281234567890
   * - +6281234567890 -> 6281234567890
   * - 81234567890 -> 6281234567890
   * - 6281234567890 -> 6281234567890
   * - 6281234567890@s.whatsapp.net -> 6281234567890
   * 
   * @param {string} phone 
   * @returns {string} Normalized phone number with country code (e.g., 6281234567890)
   */
  normalizePhoneNumber(phone) {
    if (!phone || typeof phone !== 'string') {
      throw new Error('Nomor telepon harus berupa string yang valid.');
    }

    // Strip @s.whatsapp.net if present
    let cleaned = phone.replace(/@s\.whatsapp\.net$/i, '').trim();

    // Remove any character that is not a digit or leading plus
    cleaned = cleaned.replace(/[^\d+]/g, '');

    // Remove leading plus
    if (cleaned.startsWith('+')) {
      cleaned = cleaned.substring(1);
    }

    // Handle Indonesian standard prefix
    if (cleaned.startsWith('08')) {
      cleaned = '62' + cleaned.substring(1);
    } else if (cleaned.startsWith('8')) {
      cleaned = '62' + cleaned;
    }

    // Must be numeric only now
    if (!/^\d+$/.test(cleaned)) {
      throw new Error('Nomor telepon hanya boleh berisi angka.');
    }

    // Length check: Indonesian and E.164 phone numbers are between 9 and 16 digits
    if (cleaned.length < 9 || cleaned.length > 16) {
      throw new Error(`Panjang nomor telepon tidak valid (${cleaned.length} digit). Diperlukan antara 9-16 digit.`);
    }

    return cleaned;
  }

  /**
   * Safe fetch with timeout and custom headers
   * Ensures Authorization and passwords are never logged
   */
  async _request(path, options = {}) {
    const config = getGowaConfig();
    const timeoutMs = options.timeoutMs || config.timeoutMs;
    const url = `${config.baseUrl}${path}`;

    const headers = {
      Accept: 'application/json, text/plain, */*',
      ...options.headers
    };

    // Add Basic Auth if available
    if (config.basicAuthHeader && !headers.Authorization) {
      headers.Authorization = config.basicAuthHeader;
    }

    // Add X-Device-Id if configured and not already set
    const deviceId = options.deviceId !== undefined ? options.deviceId : config.deviceId;
    if (deviceId && !headers['X-Device-Id']) {
      headers['X-Device-Id'] = deviceId;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await this.fetchClient(url, {
        ...options,
        headers,
        signal: controller.signal
      });
      clearTimeout(timer);
      return response;
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        const timeoutError = new Error(`Request ke GOWA (${config.cleanUrl}${path}) melebihi batas waktu (${timeoutMs} ms).`);
        timeoutError.code = 'GOWA_TIMEOUT';
        timeoutError.status = 504;
        throw timeoutError;
      }
      const networkError = new Error(`Gagal menghubungi server GOWA di ${config.cleanUrl}: ${err.message}`);
      networkError.code = 'GOWA_UNREACHABLE';
      networkError.status = 502;
      throw networkError;
    }
  }

  /**
   * Health Check GOWA Server
   * @returns {Promise<{ isHealthy: boolean, status: string, latencyMs: number, checkedAt: string }>}
   */
  async checkHealth() {
    const config = getGowaConfig();
    const start = Date.now();
    try {
      const res = await this._request('/health', { method: 'GET' });
      const latencyMs = Date.now() - start;
      const text = await res.text();
      const isHealthy = res.status === 200 && text.trim().toUpperCase().includes('OK');

      return {
        isHealthy,
        status: isHealthy ? 'OK' : `UNHEALTHY_STATUS_${res.status}`,
        httpStatus: res.status,
        latencyMs,
        serverUrl: config.cleanUrl,
        checkedAt: new Date().toISOString()
      };
    } catch (err) {
      const latencyMs = Date.now() - start;
      return {
        isHealthy: false,
        status: err.code || 'ERROR',
        error: err.message,
        latencyMs,
        serverUrl: config.cleanUrl,
        checkedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Check connection status of WhatsApp client on GOWA
   * Returns whether WhatsApp is connected and logged in, with device and account info
   */
  async getConnectionStatus() {
    const config = getGowaConfig();
    const healthResult = await this.checkHealth();

    if (!healthResult.isHealthy) {
      return {
        server: {
          url: config.cleanUrl,
          isHealthy: false,
          latencyMs: healthResult.latencyMs,
          status: healthResult.status,
          error: healthResult.error
        },
        whatsapp: {
          isConnected: false,
          isLoggedIn: false,
          deviceId: config.deviceId || null,
          jid: null,
          phoneNumber: null,
          statusLabel: 'SERVER_OFFLINE'
        },
        checkedAt: new Date().toISOString()
      };
    }

    try {
      const statusRes = await this._request('/app/status', { method: 'GET' });

      if (statusRes.status === 401) {
        return {
          server: {
            url: config.cleanUrl,
            isHealthy: true,
            latencyMs: healthResult.latencyMs,
            authError: true
          },
          whatsapp: {
            isConnected: false,
            isLoggedIn: false,
            deviceId: config.deviceId || null,
            jid: null,
            phoneNumber: null,
            statusLabel: 'AUTH_FAILED'
          },
          error: 'Autentikasi Basic Auth GOWA gagal (401 Unauthorized). Periksa GOWA_USERNAME dan GOWA_PASSWORD di .env backend.',
          checkedAt: new Date().toISOString()
        };
      }

      if (!statusRes.ok) {
        let errJson = null;
        try { errJson = await statusRes.json(); } catch (_) {}
        const errorMsg = errJson?.message || `HTTP ${statusRes.status} ${statusRes.statusText}`;
        return {
          server: {
            url: config.cleanUrl,
            isHealthy: true,
            latencyMs: healthResult.latencyMs
          },
          whatsapp: {
            isConnected: false,
            isLoggedIn: false,
            deviceId: config.deviceId || null,
            jid: null,
            phoneNumber: null,
            statusLabel: 'ERROR'
          },
          error: `GOWA status error: ${errorMsg}`,
          checkedAt: new Date().toISOString()
        };
      }

      const data = await statusRes.json();
      const results = data.results || {};
      const isConnected = Boolean(results.is_connected);
      const isLoggedIn = Boolean(results.is_logged_in);
      const jid = results.jid || null;
      let phoneNumber = null;
      if (jid) {
        phoneNumber = jid.split('@')[0];
      }

      // Determine human readable label
      let statusLabel = 'DISCONNECTED';
      if (isConnected && isLoggedIn) {
        statusLabel = 'CONNECTED';
      } else if (isConnected && !isLoggedIn) {
        statusLabel = 'CONNECTED_NOT_LOGGED_IN';
      }

      // Try fetching version / app info without blocking if fails
      let appInfo = null;
      try {
        const infoRes = await this._request('/app/info', { method: 'GET', timeoutMs: 5000 });
        if (infoRes.ok) {
          const infoData = await infoRes.json();
          appInfo = infoData.results || null;
        }
      } catch (_) {
        // App info is optional
      }

      return {
        server: {
          url: config.cleanUrl,
          isHealthy: true,
          latencyMs: healthResult.latencyMs,
          version: appInfo?.version || 'v9'
        },
        whatsapp: {
          isConnected,
          isLoggedIn,
          deviceId: results.device_id || config.deviceId || null,
          jid,
          phoneNumber,
          statusLabel
        },
        checkedAt: new Date().toISOString()
      };
    } catch (err) {
      return {
        server: {
          url: config.cleanUrl,
          isHealthy: true,
          latencyMs: healthResult.latencyMs
        },
        whatsapp: {
          isConnected: false,
          isLoggedIn: false,
          deviceId: config.deviceId || null,
          jid: null,
          phoneNumber: null,
          statusLabel: 'ERROR'
        },
        error: err.message,
        checkedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Verify if a phone number is registered on WhatsApp via GOWA
   * @param {string} rawPhone 
   * @returns {Promise<{ isOnWhatsapp: boolean, phone: string }>}
   */
  async checkPhoneNumber(rawPhone) {
    const normalized = this.normalizePhoneNumber(rawPhone);
    const res = await this._request(`/user/check?phone=${normalized}`, { method: 'GET' });

    if (!res.ok) {
      let errJson = null;
      try { errJson = await res.json(); } catch (_) {}
      throw new Error(errJson?.message || `Gagal mengecek nomor WhatsApp (HTTP ${res.status}).`);
    }

    const data = await res.json();
    return {
      isOnWhatsapp: Boolean(data.results?.is_on_whatsapp),
      phone: normalized
    };
  }

  /**
   * Send WhatsApp Message via GOWA v9 POST /send/message
   * @param {string} phoneNumber Destination phone number (raw or normalized)
   * @param {string} message Text message to be sent
   * @param {object} options Optional settings: deviceId, timeoutMs
   * @returns {Promise<{ success: boolean, messageId: string, recipient: string, status: string, message: string }>}
   */
  async sendMessage(phoneNumber, message, options = {}) {
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      const err = new Error('Isi pesan tidak boleh kosong.');
      err.code = 'INVALID_MESSAGE';
      err.status = 400;
      throw err;
    }

    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);

    const payload = {
      phone: normalizedPhone,
      message: message.trim()
    };

    const res = await this._request('/send/message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      timeoutMs: options.timeoutMs,
      deviceId: options.deviceId
    });

    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      const text = await res.text();
      const err = new Error(`Respon server GOWA tidak berformat JSON valid: ${text.substring(0, 100)}`);
      err.code = 'INVALID_RESPONSE';
      err.status = res.status || 502;
      throw err;
    }

    // Evaluate HTTP error status
    if (!res.ok) {
      const errorMsg = data?.message || `Gagal mengirim pesan (HTTP ${res.status}).`;
      const err = new Error(errorMsg);
      err.code = data?.code || `HTTP_${res.status}`;
      err.status = res.status;
      err.raw = data;
      throw err;
    }

    // Evaluate GOWA JSON response: GOWA v9 returns { code: "SUCCESS", message: "...", results: { message_id: "...", status: "..." } }
    if (data.code !== 'SUCCESS') {
      const err = new Error(data.message || 'Server GOWA melaporkan kegagalan pengiriman pesan.');
      err.code = data.code || 'SEND_FAILED';
      err.status = 400;
      err.raw = data;
      throw err;
    }

    return {
      success: true,
      messageId: data.results?.message_id || null,
      recipient: normalizedPhone,
      status: data.results?.status || 'SENT',
      message: data.message || 'Pesan berhasil dikirim via WhatsApp Gateway GOWA',
      rawResults: data.results || null
    };
  }
}

const defaultInstance = new GowaService();

module.exports = defaultInstance;
module.exports.GowaService = GowaService;
