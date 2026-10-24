// Accounts and sessions: scrypt passwords, hashed opaque session tokens, lockout on brute force.
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError, newToken, hashToken } from './security.js';
import { randomHex, sha256Hex } from './fairness.js';

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}
export function verifyPassword(password, stored) {
  try {
    const [, N, salt, hash] = stored.split('$');
    const got = scryptSync(password, Buffer.from(salt, 'base64url'), 32, { ...SCRYPT, N: Number(N) });
    return timingSafeEqual(got, Buffer.from(hash, 'base64url'));
  } catch { return false; }
}
// Hash used to equalise timing when the username does not exist.
const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'));

export const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
export function checkPasswordPolicy(password, username) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) throw new HttpError(400, 'Password must be 10–128 characters.');
  if (password.toLowerCase().includes(username.toLowerCase())) throw new HttpError(400, 'Password must not contain the username.');
  if (/^(.)\1+$/.test(password) || /^(0123456789|1234567890|password|qwertyuiop)/i.test(password)) throw new HttpError(400, 'Choose a less predictable password.');
}

export function createAuth(db, config, seedCipher) {
  const q = {
    userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    insertUser: db.prepare('INSERT INTO users (username, pass_hash, balance, created_at) VALUES (?, ?, ?, ?)'),
    insertSeeds: db.prepare('INSERT INTO seeds (user_id, server_seed_enc, server_seed_hash, client_seed, nonce) VALUES (?, ?, ?, ?, 0)'),
    recordFail: db.prepare('UPDATE users SET failed_logins = failed_logins + 1, locked_until = ? WHERE id = ?'),
    clearFail: db.prepare('UPDATE users SET failed_logins = 0, locked_until = 0 WHERE id = ?'),
    insertSession: db.prepare('INSERT INTO sessions (id_hash, user_id, created_at, last_seen, start_balance) VALUES (?, ?, ?, ?, ?)'),
    sessionByHash: db.prepare('SELECT * FROM sessions WHERE id_hash = ?'),
    touchSession: db.prepare('UPDATE sessions SET last_seen = ? WHERE id_hash = ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE id_hash = ?'),
    deleteUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE last_seen < ? OR created_at < ?'),
    deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
  };

  function signUp(username, password) {
    if (!USERNAME_RE.test(username)) throw new HttpError(400, 'Username: 3–20 letters, numbers or underscores.');
    checkPasswordPolicy(password, username);
    if (q.userByName.get(username)) throw new HttpError(409, 'That username is unavailable.');
    const now = Date.now();
    const info = q.insertUser.run(username, hashPassword(password), config.tokens.start, now);
    const userId = Number(info.lastInsertRowid);
    const serverSeed = randomHex(32);
    q.insertSeeds.run(userId, seedCipher.encrypt(serverSeed), sha256Hex(serverSeed), randomHex(8));
    return q.userById.get(userId);
  }

  function logIn(username, password) {
    const user = USERNAME_RE.test(username) ? q.userByName.get(username) : null;
    const now = Date.now();
    if (user && user.locked_until > now) throw new HttpError(429, 'Too many attempts. Try again later.');
    const ok = verifyPassword(password, user ? user.pass_hash : DUMMY_HASH) && Boolean(user);
    if (!ok) {
      if (user) {
        const fails = user.failed_logins + 1;
        const lock = fails >= config.lockout.threshold ? now + Math.min(config.lockout.maxMs, config.lockout.baseMs * 2 ** (fails - config.lockout.threshold)) : 0;
        q.recordFail.run(lock, user.id);
      }
      throw new HttpError(401, 'Invalid username or password.');
    }
    q.clearFail.run(user.id);
    return user;
  }

  function startSession(user) {
    const token = newToken();
    const now = Date.now();
    q.insertSession.run(hashToken(token), user.id, now, now, user.balance);
    if (Math.random() < 0.05) q.purgeSessions.run(now - config.sessionIdleMs, now - config.sessionAbsoluteMs);
    return token;
  }

  function resolveSession(token) {
    if (typeof token !== 'string' || token.length < 40 || token.length > 64) return null;
    const row = q.sessionByHash.get(hashToken(token));
    if (!row) return null;
    const now = Date.now();
    if (now - row.last_seen > config.sessionIdleMs || now - row.created_at > config.sessionAbsoluteMs) { q.deleteSession.run(row.id_hash); return null; }
    if (now - row.last_seen > 60e3) q.touchSession.run(now, row.id_hash);
    const user = q.userById.get(row.user_id);
    return user ? { user, session: row } : null;
  }

  const endSession = (token) => q.deleteSession.run(hashToken(token));
  const endAllSessions = (userId) => q.deleteUserSessions.run(userId);
  function deleteAccount(user, password) {
    if (!verifyPassword(password, user.pass_hash)) throw new HttpError(401, 'Invalid password.');
    q.deleteUser.run(user.id);
  }

  return { signUp, logIn, startSession, resolveSession, endSession, endAllSessions, deleteAccount };
}
