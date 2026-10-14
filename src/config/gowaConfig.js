/**
 * GOWA WhatsApp Gateway v9 Configuration
 * Reads configuration safely from environment variables without exposing sensitive credentials.
 */

function getGowaConfig() {
  const rawBaseUrl = process.env.GOWA_BASE_URL || 'https://wa.simsmk.sch.id';
  // Strip trailing slashes
  const baseUrl = rawBaseUrl.replace(/\/+$/, '');
  
  const username = process.env.GOWA_USERNAME || 'admin';
  const password = process.env.GOWA_PASSWORD || 'admin';
  const deviceId = (process.env.GOWA_DEVICE_ID || '').trim();
  const timeoutMs = parseInt(process.env.GOWA_TIMEOUT_MS, 10) || 15000;

  // Generate basic auth header value
  let basicAuthHeader = null;
  if (username && password) {
    const token = Buffer.from(`${username}:${password}`).toString('base64');
    basicAuthHeader = `Basic ${token}`;
  }

  // Create sanitized URL for public / frontend exposure (strip any embedded creds)
  let cleanUrl = baseUrl;
  try {
    const parsed = new URL(baseUrl);
    parsed.username = '';
    parsed.password = '';
    cleanUrl = parsed.origin + (parsed.pathname !== '/' ? parsed.pathname.replace(/\/+$/, '') : '');
  } catch (err) {
    cleanUrl = baseUrl.replace(/\/\/([^:]+):([^@]+)@/, '//');
  }

  return {
    baseUrl,
    cleanUrl,
    username,
    password,
    deviceId,
    timeoutMs,
    basicAuthHeader
  };
}

module.exports = getGowaConfig;
