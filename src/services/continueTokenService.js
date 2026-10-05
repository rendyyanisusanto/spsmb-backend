const crypto = require('crypto');

class ContinueTokenService {
  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  verifyToken(rawToken, hashedToken) {
    if (!rawToken || !hashedToken) return false;
    const hash = this.hashToken(rawToken);
    return hash === hashedToken;
  }

  getExpirationDate() {
    const ttlDays = parseInt(process.env.CONTINUE_TOKEN_TTL_DAYS || '30', 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + ttlDays);
    return expiresAt;
  }
}

module.exports = new ContinueTokenService();
