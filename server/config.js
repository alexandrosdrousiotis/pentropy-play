// Runtime configuration. Everything comes from the environment; nothing is hard-coded.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const env = process.env;
const isProd = env.NODE_ENV === 'production';
const dataDir = resolve(env.DATA_DIR || './data');

function loadSecret() {
  if (env.SECRET_KEY) {
    if (env.SECRET_KEY.length < 32) throw new Error('SECRET_KEY must be at least 32 characters');
    return env.SECRET_KEY;
  }
  if (isProd) throw new Error('SECRET_KEY is required in production (>= 32 random characters)');
  // Development: persist a random key next to the database so seeds survive restarts.
  const file = resolve(dataDir, 'secret.key');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  mkdirSync(dirname(file), { recursive: true });
  const key = randomBytes(48).toString('base64url');
  writeFileSync(file, key, { mode: 0o600 });
  try { chmodSync(file, 0o600); } catch { /* best effort */ }
  return key;
}

export const config = Object.freeze({
  isProd,
  port: Number(env.PORT || 8080),
  host: env.HOST || '127.0.0.1',
  dataDir,
  dbPath: env.DB_PATH || resolve(dataDir, 'pentropy.sqlite'),
  secret: loadSecret(),
  // Set TRUST_PROXY=1 only when a reverse proxy you control sets X-Forwarded-For / X-Forwarded-Proto.
  trustProxy: env.TRUST_PROXY === '1',
  // Serve TLS directly if both are provided; otherwise terminate TLS at your proxy.
  tlsCert: env.TLS_CERT ? readFileSync(env.TLS_CERT) : null,
  tlsKey: env.TLS_KEY ? readFileSync(env.TLS_KEY) : null,
  // Cookies are marked Secure in production or when TLS/proxy indicates HTTPS.
  cookieSecure: isProd || env.COOKIE_SECURE === '1' || Boolean(env.TLS_CERT),
  sessionIdleMs: 7 * 24 * 3600e3,
  sessionAbsoluteMs: 30 * 24 * 3600e3,
  bodyLimit: 8 * 1024,
  rateLimit: { general: { windowMs: 60e3, max: 240 }, auth: { windowMs: 60e3, max: 12 }, play: { windowMs: 10e3, max: 60 }, chat: { windowMs: 10e3, max: 6 } },
  social: { ambient: env.SOCIAL_AMBIENT !== '0', chatKeep: 500 },
  lockout: { threshold: 5, baseMs: 60e3, maxMs: 6 * 3600e3 },
  tokens: { start: 1000_00, refill: 1000_00, minBet: 10, maxBet: 1_000_000_00, faucetPerDay: 1000_00 }, // integer cents
});
