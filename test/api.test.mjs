import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server/index.js';

let srv, base;
const jar = new Map(); // per-client cookie jars
function client(name = 'default') {
  const cookies = jar.get(name) || new Map();
  jar.set(name, cookies);
  return async (method, path, body, { headers = {}, raw = false, origin } = {}) => {
    const h = { ...headers };
    if (!raw) { h['content-type'] = 'application/json'; h['x-requested-with'] = 'pentropy'; }
    if (origin) h.origin = origin;
    if (cookies.size) h.cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body), redirect: 'manual' });
    for (const sc of res.headers.getSetCookie?.() || []) {
      const [pair, ...attrs] = sc.split(';');
      const [k, v] = pair.split('=');
      if (attrs.some((a) => a.trim() === 'Max-Age=0')) cookies.delete(k.trim()); else cookies.set(k.trim(), v);
    }
    let json = null;
    try { json = await res.json(); } catch { /* not json */ }
    return { status: res.status, json, headers: res.headers };
  };
}

before(async () => {
  srv = createServer({ dbPath: ':memory:', secret: 't'.repeat(40), cookieSecure: false, isProd: false,
    rateLimit: { general: { windowMs: 60e3, max: 100000 }, auth: { windowMs: 60e3, max: 100000 }, play: { windowMs: 60e3, max: 100000 } } });
  await new Promise((r) => srv.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.server.address().port}`;
});
after(() => srv.close());

test('static: index served with strict headers; traversal and dotfiles are 404', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin');
  for (const p of ['/../package.json', '/..%2fpackage.json', '/.git/config', '/server/config.js', '/data/pentropy.sqlite', '/shared/../server/config.js', '/package.json', '/js/', '/nope.html']) {
    const r = await fetch(base + p);
    assert.equal(r.status, 404, p);
  }
  assert.equal((await fetch(base + '/js/app.js')).status, 200);
  assert.equal((await fetch(base + '/shared/math.js')).status, 200);
  assert.equal((await fetch(base + '/', { method: 'PUT' })).status, 404);
});

test('auth: policy, signup, duplicate, login, lockout, logout', async () => {
  const c = client('alice');
  assert.equal((await c('POST', '/api/auth/signup', { username: 'al', password: 'longenoughpass1' })).status, 400);
  assert.equal((await c('POST', '/api/auth/signup', { username: 'alice', password: 'short' })).status, 400);
  assert.equal((await c('POST', '/api/auth/signup', { username: 'alice', password: 'alice12345678' })).status, 400);
  assert.equal((await c('POST', '/api/auth/signup', { username: 'alice', password: 'correct horse battery', extra: 1 })).status, 400);
  const s = await c('POST', '/api/auth/signup', { username: 'alice', password: 'correct horse battery' });
  assert.equal(s.status, 201);
  assert.equal(s.json.user.balance, 1000);
  assert.equal(s.json.seeds.nonce, 0);
  assert.equal((await c('POST', '/api/auth/signup', { username: 'ALICE', password: 'another good pass' })).status, 409);
  assert.equal((await c('POST', '/api/auth/logout')).status, 200);
  assert.equal((await c('GET', '/api/me')).status, 401);
  for (let i = 0; i < 5; i++) assert.equal((await c('POST', '/api/auth/login', { username: 'alice', password: 'wrong password!!' })).status, 401);
  assert.equal((await c('POST', '/api/auth/login', { username: 'alice', password: 'correct horse battery' })).status, 429, 'locked after 5 failures');
  assert.equal((await c('POST', '/api/auth/login', { username: 'nobody', password: 'whatever12345' })).status, 401);
});

test('csrf: state changes need the custom header and a same-origin Origin', async () => {
  const c = client('bob');
  const r1 = await c('POST', '/api/auth/signup', JSON.stringify({ username: 'bob', password: 'orbital walrus phrase 9' }), { raw: true, headers: { 'content-type': 'application/json' } });
  assert.equal(r1.status, 403);
  const r2 = await c('POST', '/api/auth/signup', { username: 'bob', password: 'orbital walrus phrase 9' }, { origin: 'https://evil.example' });
  assert.equal(r2.status, 403);
  const r3 = await c('POST', '/api/auth/signup', { username: 'bob', password: 'orbital walrus phrase 9' }, { origin: base });
  assert.equal(r3.status, 201);
  const sc = r3.headers.getSetCookie()[0];
  assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/);
  assert.equal((await c('POST', '/api/auth/logout', 'not json', { raw: true, headers: { 'content-type': 'text/plain', 'x-requested-with': 'pentropy' } })).status, 415);
  assert.equal((await c('POST', '/api/auth/logout', '{bad', { raw: true, headers: { 'content-type': 'application/json', 'x-requested-with': 'pentropy' } })).status, 400);
  assert.equal((await c('POST', '/api/auth/logout', 'x'.repeat(10000), { raw: true, headers: { 'content-type': 'application/json', 'x-requested-with': 'pentropy' } })).status, 413);
});

test('play: every game settles server-side, balances move exactly, tampering is refused', async () => {
  const c = client('carol');
  await c('POST', '/api/auth/signup', { username: 'carol', password: 'orbital lorac phrase 9' });
  let balance = 1000;
  const bet = async (game, amount, params) => {
    const r = await c('POST', '/api/rounds', { game, amount, params });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return r.json;
  };
  const act = async (action, payload) => { const r = await c('POST', '/api/rounds/current/action', { action, payload }); assert.equal(r.status, 200, JSON.stringify(r.json)); return r.json; };

  // one-shot games
  for (const [game, params] of [['limbo', { target: 2 }], ['dice', { chance: 50, over: false }], ['plinko', { rows: 8, risk: 'low' }], ['keno', { picks: [0, 1, 2], risk: 'low' }]]) {
    const { round, balance: b } = await bet(game, 10, params);
    assert.equal(round.status, 'settled');
    assert.equal(b, Math.round((balance - 10 + round.payout) * 100) / 100);
    balance = b;
    assert.equal(round.payout, Math.round(10 * round.multiplier * 100) / 100);
  }
  // tampering
  assert.equal((await c('POST', '/api/rounds', { game: 'limbo', amount: 10, params: { target: 2 }, multiplier: 100 })).status, 400);
  assert.equal((await c('POST', '/api/rounds', { game: 'limbo', amount: -10, params: { target: 2 } })).status, 400);
  assert.equal((await c('POST', '/api/rounds', { game: 'limbo', amount: 10.001, params: { target: 2 } })).status, 400);
  assert.equal((await c('POST', '/api/rounds', { game: 'limbo', amount: 1e9, params: { target: 2 } })).status, 400);
  assert.equal((await c('POST', '/api/rounds', { game: 'roulette', amount: 10, params: {} })).status, 400);
  assert.equal((await c('POST', '/api/rounds', { game: 'limbo', amount: 10, params: { target: 2, point: 1e6 } })).status, 400);

  // mines: layout hidden, bet locked, cashout
  const m = await bet('mines', 20, { mines: 1 });
  assert.equal(m.round.status, 'open');
  assert.ok(!JSON.stringify(m.round.view).includes('layout'));
  assert.equal((await c('POST', '/api/rounds', { game: 'limbo', amount: 10, params: { target: 2 } })).status, 409, 'one open round at a time');
  assert.equal((await c('POST', '/api/rounds/current/action', { action: 'cashout' })).status, 400, 'cannot cash out before a reveal');
  let r = await act('reveal', { index: 0 });
  if (r.round.status === 'open') { r = await act('cashout'); assert.equal(r.round.multiplier, 1.03); }
  assert.equal(r.round.status, 'settled');
  assert.equal((await c('GET', '/api/rounds/current')).json.round, null);

  // blackjack: play a hand through
  const bj = await bet('blackjack', 10, {});
  let round = bj.round; let guard = 0;
  while (round.status === 'open' && guard++ < 10) {
    if (round.view.phase === 'insurance') round = (await act('insurance', { take: false })).round;
    else round = (await act(round.view.hands[round.view.active].total < 17 ? 'hit' : 'stand')).round;
  }
  assert.equal(round.status, 'settled');
  assert.ok([0, 1, 2, 2.5].includes(round.multiplier) || round.amount > round.base);

  // video poker, tower, hilo, crash quickly
  await bet('videopoker', 5, {}); round = (await act('draw', { hold: [true, true, true, true, true] })).round; assert.equal(round.status, 'settled');
  await bet('tower', 5, { level: 'easy' }); round = (await act('pick', { tile: 0 })).round; if (round.status === 'open') round = (await act('cashout')).round; assert.equal(round.status, 'settled');
  await bet('hilo', 5, {}); round = (await act('skip')).round; round = (await act('guess', { choice: round.view.card.rank > 7 ? 'lower' : 'higher' })).round; if (round.status === 'open') round = (await act('cashout')).round; assert.equal(round.status, 'settled');
  await bet('crash', 5, {}); round = (await act('cashout')).round; assert.equal(round.status, 'settled');

  // stats agree with the ledger
  const stats = (await c('GET', '/api/stats')).json;
  const me = (await c('GET', '/api/me')).json;
  assert.equal(stats.stats.bets, 10);
  assert.equal(Math.round((1000 + stats.stats.net) * 100) / 100, me.user.balance);
  assert.ok(stats.history.every((h) => h.serverSeedHash && typeof h.nonce === 'number'));
});

test('seeds: rotation reveals the old server seed, whose hash matches, and refuses while a round is open', async () => {
  const c = client('dave');
  await c('POST', '/api/auth/signup', { username: 'dave', password: 'orbital evad phrase 9' });
  const before = (await c('GET', '/api/seeds')).json.current;
  await c('POST', '/api/rounds', { game: 'mines', amount: 1, params: { mines: 1 } });
  assert.equal((await c('POST', '/api/seeds/rotate', {})).status, 409);
  await c('POST', '/api/rounds/current/action', { action: 'reveal', payload: { index: 3 } });
  const cur = (await c('GET', '/api/rounds/current')).json.round;
  if (cur) await c('POST', '/api/rounds/current/action', { action: 'cashout' });
  const rot = await c('POST', '/api/seeds/rotate', { clientSeed: 'my-seed' });
  assert.equal(rot.status, 200);
  assert.equal(rot.json.previous.serverSeedHash, before.serverSeedHash);
  const { createHash } = await import('node:crypto');
  assert.equal(createHash('sha256').update(rot.json.previous.serverSeed).digest('hex'), before.serverSeedHash);
  assert.equal(rot.json.current.clientSeed, 'my-seed');
  assert.equal((await c('POST', '/api/seeds/rotate', { clientSeed: 'bad seed!' })).status, 400);
});

test('limits and refill are enforced server-side', async () => {
  const c = client('erin');
  await c('POST', '/api/auth/signup', { username: 'erin', password: 'orbital nire phrase 9' });
  assert.equal((await c('PATCH', '/api/me', { limits: { lossLimit: 5, sessionMinutes: 0, realityEvery: 25 } })).status, 200);
  assert.equal((await c('PATCH', '/api/me', { limits: { lossLimit: 5 } })).status, 400, 'partial limits object rejected');
  assert.equal((await c('POST', '/api/refill', { id: 'rtp' })).status, 400, 'cannot refill with tokens left');
  // lose until the limit trips: bet 5 at 1.01x... use dice at 0.01% chance to lose almost surely
  let status = 201, tripped = false;
  for (let i = 0; i < 20 && !tripped; i++) {
    const r = await c('POST', '/api/rounds', { game: 'dice', amount: 5, params: { chance: 0.01, over: true } });
    status = r.status; if (status === 403) tripped = true;
  }
  assert.ok(tripped, 'loss limit enforced');
  assert.equal((await c('PATCH', '/api/me', { limits: { lossLimit: 0, sessionMinutes: 0, realityEvery: 25 } })).status, 200);
  // burn the balance
  let me = (await c('GET', '/api/me')).json;
  let guard = 0;
  while (me.user.balance >= 0.1 && guard++ < 400) {
    const amt = Math.round(me.user.balance * 100) / 100;
    const r = await c('POST', '/api/rounds', { game: 'dice', amount: amt, params: { chance: 0.01, over: true } });
    me = { user: { balance: r.json.balance } };
  }
  assert.ok(me.user.balance < 0.1);
  assert.equal((await c('POST', '/api/refill', { id: 'bogus' })).status, 400);
  const rf = await c('POST', '/api/refill', { id: 'rtp' });
  assert.equal(rf.status, 200); assert.equal(rf.json.balance, 1000);
  me = (await c('GET', '/api/me')).json;
  assert.equal(me.user.refills, 1); assert.deepEqual(me.user.lessonsRead, ['rtp']);
});

test('sessions: another user cannot see or act on my round; delete needs the password', async () => {
  const a = client('frank'), b = client('grace');
  await a('POST', '/api/auth/signup', { username: 'frank', password: 'orbital knarf phrase 9' });
  await b('POST', '/api/auth/signup', { username: 'grace', password: 'orbital ecarg phrase 9' });
  await a('POST', '/api/rounds', { game: 'mines', amount: 1, params: { mines: 1 } });
  assert.equal((await b('GET', '/api/rounds/current')).json.round, null);
  assert.equal((await b('POST', '/api/rounds/current/action', { action: 'cashout' })).status, 404);
  assert.equal((await a('DELETE', '/api/me', { password: 'nope nope nope' })).status, 401);
  // forged cookie
  const forged = client('forged'); jar.get('forged').set('sid', 'A'.repeat(43));
  assert.equal((await forged('GET', '/api/me')).status, 401);
  assert.equal((await fetch(base + '/api/unknown')).status, 404);
  assert.equal((await fetch(base + '/api/me', { method: 'POST' })).status, 404, 'wrong method is indistinguishable from unknown route');
});

test('wallet: faucet deposits are capped per day, withdraw moves tokens to the vault and back', async () => {
  const c = client('hank');
  await c('POST', '/api/auth/signup', { username: 'hank', password: 'orbital knah phrase 9' });
  const w0 = (await c('GET', '/api/wallet')).json;
  assert.equal(w0.faucetAvailable, 1000); assert.match(w0.address, /^agt1[0-9a-f]{38}$/);
  assert.equal((await c('POST', '/api/wallet/deposit', { amount: 600 })).status, 200);
  assert.equal((await c('POST', '/api/wallet/deposit', { amount: 500 })).status, 400, 'over the daily cap');
  const w1 = (await c('POST', '/api/wallet/deposit', { amount: 400 })).json;
  assert.equal(w1.balance, 2000); assert.equal(w1.deposited, 1000); assert.equal(w1.faucetAvailable, 0);
  assert.equal((await c('POST', '/api/wallet/withdraw', { amount: 5000 })).status, 400);
  const w2 = (await c('POST', '/api/wallet/withdraw', { amount: 1500 })).json;
  assert.equal(w2.balance, 500); assert.equal(w2.vault, 1500);
  const w3 = (await c('POST', '/api/wallet/deposit', { amount: 300, source: 'vault' })).json;
  assert.equal(w3.balance, 800); assert.equal(w3.vault, 1200); assert.equal(w3.deposited, 1000, 'vault moves do not count as deposits');
  assert.equal(w3.history.length, 4); assert.ok(w3.history.every((h) => /^[0-9a-f]{40}$/.test(h.txid)));
  assert.equal((await c('POST', '/api/wallet/deposit', { amount: 0.5 })).status, 400);
  assert.equal((await c('POST', '/api/wallet/deposit', { amount: 10, source: 'bank' })).status, 400);
  await c('POST', '/api/rounds', { game: 'mines', amount: 1, params: { mines: 1 } });
  assert.equal((await c('POST', '/api/wallet/withdraw', { amount: 10 })).status, 409, 'no withdrawals mid-round');
  const me = (await c('GET', '/api/me')).json;
  assert.equal(me.user.vault, 1200); assert.equal(me.user.deposited, 1000);
});
