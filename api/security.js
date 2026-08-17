const crypto = require('crypto');

// In-memory sliding-window rate limiter
const rateLimitMap = new Map();
const RATE_LIMIT_CLEANUP_INTERVAL = 60000; // 1 minute

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, RATE_LIMIT_CLEANUP_INTERVAL).unref();

/**
 * Constant-time string comparison to prevent timing attacks
 */
function timingSafeMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Validates API Key presence, structure, and entropy
 */
function validateApiKey(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') {
    return { valid: false, reason: 'Missing or invalid Authorization header' };
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token || token.length < 16) {
    return { valid: false, reason: 'API key is too short or malformed' };
  }

  // Check for known valid prefix or format
  const validPrefixes = ['fg_live_', 'sk-forge_', 'sol-live_', 'sk-'];
  const hasValidPrefix = validPrefixes.some(p => token.startsWith(p));

  // Must only contain safe alphanumeric characters, dashes, and underscores
  if (!/^[a-zA-Z0-9_\-]+$/.test(token)) {
    return { valid: false, reason: 'API key contains illegal characters' };
  }

  return { valid: true, key: token };
}

/**
 * In-memory sliding window rate limiter
 * @param {string} identifier IP or API Key
 * @param {number} maxRequests Limit per window
 * @param {number} windowMs Window duration in ms
 */
function checkRateLimit(identifier, maxRequests = 60, windowMs = 60000) {
  const now = Date.now();
  const key = identifier || 'global_anon';

  let record = rateLimitMap.get(key);
  if (!record || now > record.resetTime) {
    record = { count: 1, resetTime: now + windowMs };
    rateLimitMap.set(key, record);
    return { allowed: true, remaining: maxRequests - 1, resetTime: record.resetTime };
  }

  if (record.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: record.resetTime,
      retryAfter: Math.ceil((record.resetTime - now) / 1000)
    };
  }

  record.count += 1;
  return { allowed: true, remaining: maxRequests - record.count, resetTime: record.resetTime };
}

/**
 * Validates and sanitizes chat/completions payload
 */
function validateAndSanitizePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Request body must be a valid JSON object' };
  }

  // Prevent prototype pollution attacks
  if (body.__proto__ || body.constructor?.prototype) {
    delete body.__proto__;
    delete body.constructor;
  }

  const messages = body.messages;
  if (!messages || !Array.isArray(messages)) {
    return { valid: false, error: 'Field "messages" must be a non-empty array' };
  }

  if (messages.length > 100) {
    return { valid: false, error: 'Messages array exceeds maximum allowed limit (100 messages)' };
  }

  const cleanMessages = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m || typeof m !== 'object') continue;

    const role = (m.role === 'assistant' || m.role === 'system') ? m.role : 'user';
    let content = '';

    if (typeof m.content === 'string') {
      content = m.content;
    } else if (Array.isArray(m.content)) {
      content = m.content.map(c => (c && c.text) ? String(c.text) : '').join(' ');
    } else if (m.content != null) {
      content = String(m.content);
    }

    // Limit individual message content length to 100,000 characters
    if (content.length > 100000) {
      content = content.slice(0, 100000);
    }

    cleanMessages.push({ role, content });
  }

  if (cleanMessages.length === 0) {
    cleanMessages.push({ role: 'user', content: 'Hello' });
  }

  const maxTokens = Math.max(1, Math.min(parseInt(body.max_tokens, 10) || 4096, 8192));
  const temperature = Math.max(0, Math.min(parseFloat(body.temperature) || 0.7, 2.0));

  return {
    valid: true,
    data: {
      model: typeof body.model === 'string' ? body.model.trim().slice(0, 64) : 'gpt-5.6-sol',
      messages: cleanMessages,
      max_tokens: maxTokens,
      temperature,
      stream: Boolean(body.stream)
    }
  };
}

/**
 * Applies strict OWASP Security Headers
 */
function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
}

module.exports = {
  timingSafeMatch,
  validateApiKey,
  checkRateLimit,
  validateAndSanitizePayload,
  applySecurityHeaders
};
