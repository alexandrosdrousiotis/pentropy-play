// Server-side provably-fair RNG (synchronous) and encryption of server seeds at rest.
import { createHmac, createHash, randomBytes, createCipheriv, createDecipheriv, hkdfSync } from 'node:crypto';

export const sha256Hex = (text) => createHash('sha256').update(text).digest('hex');
export const randomHex = (n = 32) => randomBytes(n).toString('hex');

export function bytesToFloat(b0, b1, b2, b3) {
  return b0 / 256 + b1 / 65536 + b2 / 16777216 + b3 / 4294967296;
}

/** Same construction as public/js/verify-rng.js: HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}:${cursor}`), 8 floats per block. */
export class FairRng {
  constructor(serverSeed, clientSeed, nonce, skip = 0) {
    this.serverSeed = serverSeed;
    this.clientSeed = clientSeed;
    this.nonce = nonce;
    this.cursor = 0;
    this.buffer = [];
    this.used = 0;
    if (skip) this.take(skip);
  }
  #fill() {
    const bytes = createHmac('sha256', this.serverSeed).update(`${this.clientSeed}:${this.nonce}:${this.cursor}`).digest();
    this.cursor++;
    for (let i = 0; i < 32; i += 4) this.buffer.push(bytesToFloat(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]));
  }
  take(n = 1) {
    const out = [];
    while (out.length < n) {
      if (!this.buffer.length) this.#fill();
      out.push(this.buffer.shift());
    }
    this.used += n;
    return out;
  }
  one() { return this.take(1)[0]; }
}

/* ---- seed encryption (AES-256-GCM, key derived from SECRET_KEY) ---- */
export function makeSeedCipher(secret) {
  const key = Buffer.from(hkdfSync('sha256', secret, 'pentropy-seeds', 'seed-encryption-v1', 32));
  return {
    encrypt(plain) {
      const iv = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', key, iv);
      const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
      return `${iv.toString('base64url')}.${ct.toString('base64url')}.${c.getAuthTag().toString('base64url')}`;
    },
    decrypt(blob) {
      const [iv, ct, tag] = blob.split('.').map((s) => Buffer.from(s, 'base64url'));
      const d = createDecipheriv('aes-256-gcm', key, iv);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
    },
  };
}
