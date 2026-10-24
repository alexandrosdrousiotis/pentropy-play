// Request hardening: headers, rate limiting, body parsing, cookies, CSRF and input validation.
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
export const bad = (msg, extra) => new HttpError(400, msg, extra);

/* ---------------- security headers ---------------- */
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

export function securityHeaders(res, { https }) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Origin-Agent-Cluster', '?1');
  if (https) res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.removeHeader('X-Powered-By');
}

/* ---------------- rate limiting (sliding window, in memory) ---------------- */
export class RateLimiter {
  constructor({ windowMs, max }) { this.windowMs = windowMs; this.max = max; this.hits = new Map(); this.lastSweep = Date.now(); }
  /** Returns true if the request is allowed. */
  allow(key) {
    const now = Date.now();
    if (now - this.lastSweep > this.windowMs) this.#sweep(now);
    let list = this.hits.get(key);
    if (!list) { list = []; this.hits.set(key, list); }
    while (list.length && list[0] <= now - this.windowMs) list.shift();
    if (list.length >= this.max) return false;
    list.push(now);
    return true;
  }
  #sweep(now) {
    for (const [k, list] of this.hits) {
      while (list.length && list[0] <= now - this.windowMs) list.shift();
      if (!list.length) this.hits.delete(k);
    }
    this.lastSweep = now;
  }
}

export function clientIp(req, trustProxy) {
  if (trustProxy) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff) return xff.split(',')[0].trim().slice(0, 64);
  }
  return req.socket.remoteAddress || 'unknown';
}

/* ---------------- body parsing ---------------- */
export function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (type !== 'application/json') return reject(new HttpError(415, 'Expected application/json'));
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) return reject(new HttpError(413, 'Body too large'));
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'Body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return reject(bad('Expected a JSON object'));
        resolve(parsed);
      } catch { reject(bad('Malformed JSON')); }
    });
    req.on('error', () => reject(bad('Body read failed')));
  });
}

/* ---------------- CSRF: same-origin fetch only ---------------- */
export function assertSameOrigin(req) {
  // Custom header cannot be sent cross-site without CORS preflight, which we never answer.
  if (req.headers['x-requested-with'] !== 'pentropy') throw new HttpError(403, 'Forbidden');
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') throw new HttpError(403, 'Forbidden');
  const origin = req.headers.origin;
  if (origin) {
    const host = req.headers.host;
    let o;
    try { o = new URL(origin); } catch { throw new HttpError(403, 'Forbidden'); }
    if (!host || o.host !== host) throw new HttpError(403, 'Forbidden');
  }
}

/* ---------------- cookies ---------------- */
export function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
export function sessionCookie(value, { secure, maxAgeSec }) {
  const prefix = secure ? '__Host-' : '';
  return `${prefix}sid=${value}; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}; Max-Age=${maxAgeSec}`;
}
export const cookieName = (secure) => (secure ? '__Host-sid' : 'sid');

export const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = (t) => createHash('sha256').update(t).digest('hex');
export function safeEqual(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/* ---------------- validation (whitelist everything) ---------------- */
export const v = {
  object(input, shape) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw bad('Expected an object');
    for (const k of Object.keys(input)) if (!(k in shape) || k === '__proto__' || k === 'constructor' || k === 'prototype') throw bad(`Unexpected field: ${k}`);
    const out = {};
    for (const [k, rule] of Object.entries(shape)) {
      const has = Object.prototype.hasOwnProperty.call(input, k) && input[k] !== undefined;
      if (!has) { if (rule.optional) { if ('default' in rule) out[k] = rule.default; continue; } throw bad(`Missing field: ${k}`); }
      out[k] = rule.check(input[k], k);
    }
    return out;
  },
  string({ min = 0, max = 256, pattern, optional, default: def } = {}) {
    return { optional, default: def, check: (x, k) => {
      if (typeof x !== 'string') throw bad(`${k} must be a string`);
      if (x.length < min || x.length > max) throw bad(`${k} must be ${min}–${max} characters`);
      if (pattern && !pattern.test(x)) throw bad(`${k} has an invalid format`);
      return x;
    } };
  },
  number({ min = -Infinity, max = Infinity, decimals, integer = false, optional, default: def } = {}) {
    return { optional, default: def, check: (x, k) => {
      if (typeof x !== 'number' || !Number.isFinite(x)) throw bad(`${k} must be a number`);
      if (integer && !Number.isInteger(x)) throw bad(`${k} must be an integer`);
      if (decimals != null && Math.abs(Math.round(x * 10 ** decimals) - x * 10 ** decimals) > 1e-6) throw bad(`${k} allows at most ${decimals} decimals`);
      if (x < min || x > max) throw bad(`${k} must be between ${min} and ${max}`);
      return x;
    } };
  },
  boolean({ optional, default: def } = {}) {
    return { optional, default: def, check: (x, k) => { if (typeof x !== 'boolean') throw bad(`${k} must be true or false`); return x; } };
  },
  oneOf(values, { optional, default: def } = {}) {
    return { optional, default: def, check: (x, k) => { if (!values.includes(x)) throw bad(`${k} must be one of ${values.join(', ')}`); return x; } };
  },
  array(item, { min = 0, max = 100, optional, default: def } = {}) {
    return { optional, default: def, check: (x, k) => {
      if (!Array.isArray(x) || x.length < min || x.length > max) throw bad(`${k} must be a list of ${min}–${max} items`);
      return x.map((e, i) => item.check(e, `${k}[${i}]`));
    } };
  },
  obj(shape, { optional, default: def } = {}) {
    return { optional, default: def, check: (x) => v.object(x, shape) };
  },
};
