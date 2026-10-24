// Browser-side copy of the fair RNG, used only to verify revealed rounds. Mirrors server/fairness.js.
const subtle = globalThis.crypto?.subtle ?? (typeof process !== 'undefined' ? (await import('node:crypto')).webcrypto.subtle : null);
const enc = new TextEncoder();
const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(text) {
  return toHex(new Uint8Array(await subtle.digest('SHA-256', enc.encode(text))));
}
async function hmac(keyText, message) {
  const key = await subtle.importKey('raw', enc.encode(keyText), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle.sign('HMAC', key, enc.encode(message)));
}
const bytesToFloat = (b0, b1, b2, b3) => b0 / 256 + b1 / 65536 + b2 / 16777216 + b3 / 4294967296;

export async function replayFloats(serverSeed, clientSeed, nonce, count) {
  const out = [];
  for (let cursor = 0; out.length < count; cursor++) {
    const bytes = await hmac(serverSeed, `${clientSeed}:${nonce}:${cursor}`);
    for (let i = 0; i < 32 && out.length < count; i += 4) out.push(bytesToFloat(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]));
  }
  return out;
}

/** Fast non-cryptographic PRNG for client-side "what if" projections only. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
