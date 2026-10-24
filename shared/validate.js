// Whitelist validators shared by the server API and the game engines (pure, no Node dependencies).
export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
export const bad = (msg, extra) => new HttpError(400, msg, extra);

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
