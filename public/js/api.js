// Thin, authenticated fetch wrapper. The server is the only authority; this module just mirrors its answers.
const listeners = new Set();
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = (type, payload) => listeners.forEach((fn) => fn(type, payload));

export const state = { me: null, loading: true };

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function call(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-requested-with': 'pentropy' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    if (res.status === 401 && state.me) { state.me = null; emit('auth'); }
    throw new ApiError(res.status, json?.error || `Request failed (${res.status})`);
  }
  return json;
}

const applyMe = (me) => { state.me = me; state.loading = false; emit('me'); return me; };
const applyBalance = (balance, delta) => {
  if (!state.me) return;
  state.me.user.balance = balance;
  emit('balance', { balance, delta });
};

export const api = {
  async boot() {
    try { applyMe(await call('GET', '/api/me')); } catch { state.me = null; state.loading = false; emit('me'); }
  },
  async signUp(username, password) { applyMe(await call('POST', '/api/auth/signup', { username, password })); emit('auth'); },
  async logIn(username, password) { applyMe(await call('POST', '/api/auth/login', { username, password })); emit('auth'); },
  async logOut() { await call('POST', '/api/auth/logout').catch(() => {}); state.me = null; emit('auth'); emit('me'); },
  async deleteAccount(password) { await call('DELETE', '/api/me', { password }); state.me = null; emit('auth'); emit('me'); },
  refresh: () => call('GET', '/api/me').then(applyMe),
  async updateProfile(patch) { applyMe(await call('PATCH', '/api/me', patch)); },
  stats: () => call('GET', '/api/stats'),
  rounds: (limit = 50) => call('GET', `/api/rounds?limit=${limit}`),
  current: () => call('GET', '/api/rounds/current'),
  /**
   * Open a round. With `defer`, the response is returned untouched and `out.commit()` applies the
   * balance change and settlement events later, so a game can animate before the numbers move.
   */
  async bet(game, amount, params, { defer = false } = {}) {
    const before = state.me?.user.balance ?? 0;
    const out = await call('POST', '/api/rounds', { game, amount, params });
    if (!defer) applyBalance(before - amount, -amount);
    const commit = () => {
      applyBalance(out.balance, out.balance - (state.me?.user.balance ?? before));
      if (out.round.status === 'settled') { state.me.openRound = null; bumpStats(out.round); emit('settle', out.round); }
      else state.me.openRound = out.round;
    };
    if (defer) out.commit = commit; else commit();
    return out;
  },
  async act(action, payload = {}, { defer = false } = {}) {
    const before = state.me?.user.balance ?? 0;
    const out = await call('POST', '/api/rounds/current/action', { action, payload });
    const commit = () => {
      applyBalance(out.balance, out.balance - (state.me?.user.balance ?? before));
      if (out.round.status === 'settled') { state.me.openRound = null; bumpStats(out.round); emit('settle', out.round); }
      else state.me.openRound = out.round;
    };
    if (defer) out.commit = commit; else commit();
    return out;
  },
  seeds: () => call('GET', '/api/seeds'),
  async rotateSeeds(clientSeed) { const out = await call('POST', '/api/seeds/rotate', clientSeed ? { clientSeed } : {}); if (state.me) state.me.seeds = out.current; emit('seeds'); return out; },
  async readLesson(id) { const out = await call('POST', '/api/lessons/read', { id }); if (state.me) state.me.user.lessonsRead = out.lessonsRead; emit('me'); return out; },
  async refill(lessonId) { const out = await call('POST', '/api/refill', { id: lessonId }); await api.refresh(); emit('balance', { balance: out.balance, delta: out.balance, refill: true }); return out; },
};

function bumpStats(round) {
  const s = state.me?.stats;
  if (!s) return;
  s.bets++; s.wagered += round.amount; s.returned += round.payout; s.net = s.returned - s.wagered;
  s.expectedLoss += round.amount * (1 - round.rtp);
  if (round.net > 0) s.wins++; else s.losses++;
  s.biggestWin = Math.max(s.biggestWin, round.net); s.biggestLoss = Math.max(s.biggestLoss, -round.net);
}

export const me = () => state.me;
export const user = () => state.me?.user ?? null;
export const sessionNet = () => (state.me ? state.me.user.balance - state.me.session.startBalance : 0);
export const sessionMinutes = () => (state.me ? (Date.now() - state.me.session.startedAt) / 60000 : 0);
