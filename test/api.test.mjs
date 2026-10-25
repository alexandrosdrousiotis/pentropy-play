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
    rateLimit: { general: { windowMs: 60e3, max: 100000 }, auth: { windowMs: 60e3, max: 100000 }, play: { windowMs: 60e3, max: 100000 }, chat: { windowMs: 60e3, max: 100000 }, live: { windowMs: 60e3, max: 100000 } }, social: { ambient: false, chatKeep: 500 } });
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

test('rewards: rakeback accrues as a share of the edge, tiers promote on lifetime wager with a bonus, claim credits the balance', async () => {
  const c = client('ivy');
  await c('POST', '/api/auth/signup', { username: 'ivy', password: 'orbital yvi phrase 9' });
  let me = (await c('GET', '/api/me')).json;
  assert.equal(me.rewards.tier, 'bronze'); assert.equal(me.rewards.rate, 0);
  // wager 1,000 at 99% to reach Silver: 10 limbo bets of 100 at target 1.01 (almost always win, keeps balance)
  for (let i = 0; i < 10; i++) assert.equal((await c('POST', '/api/rounds', { game: 'limbo', amount: 100, params: { target: 1.01 } })).status, 201);
  me = (await c('GET', '/api/me')).json;
  assert.equal(me.rewards.tier, 'silver'); assert.equal(me.rewards.rate, 0.05); assert.equal(me.rewards.bonuses, 10, 'level-up bonus credited');
  assert.equal(me.rewards.wagered, 1000);
  const before = me.user.balance;
  // one more bet at silver: edge = 100 * 0.01 = 1.00, rebate 5% = 0.05
  await c('POST', '/api/rounds', { game: 'limbo', amount: 100, params: { target: 1.01 } });
  const rw = (await c('GET', '/api/rewards')).json;
  assert.ok(rw.rebatePending >= 0.05 - 1e-9 && rw.rebatePending < 0.06, `pending ${rw.rebatePending}`);
  assert.equal((await c('POST', '/api/rewards/claim')).status, 400, 'below one token');
  for (let i = 0; i < 20; i++) await c('POST', '/api/rounds', { game: 'limbo', amount: 100, params: { target: 1.01 } });
  const rw2 = (await c('GET', '/api/rewards')).json;
  assert.ok(rw2.rebatePending >= 1, `pending ${rw2.rebatePending}`);
  const claim = await c('POST', '/api/rewards/claim');
  assert.equal(claim.status, 200); assert.equal(claim.json.rebatePending, 0); assert.ok(claim.json.rebateClaimed >= 1);
  const w = (await c('GET', '/api/wallet')).json;
  assert.ok(w.history.some((h) => h.type === 'rebate') && w.history.some((h) => h.type === 'bonus'));
});

test('social: settled bets appear in the feed, ghost mode hides the name, chat is validated and rate limited', async () => {
  const a = client('soc-a'), b = client('soc-b');
  await a('POST', '/api/auth/signup', { username: 'socialA', password: 'a very fine passphrase' });
  await b('POST', '/api/auth/signup', { username: 'socialB', password: 'a very fine passphrase' });
  const r = await a('POST', '/api/rounds', { game: 'dice', amount: 5, params: { chance: 50, over: true } });
  assert.equal(r.status, 201);
  let s = await b('GET', '/api/social');
  assert.equal(s.status, 200);
  const mine = s.json.bets.find((x) => x.username === 'socialA');
  assert.ok(mine && mine.bot === false && mine.game === 'dice' && mine.amount === 5);
  assert.ok(typeof s.json.online === 'number' && s.json.online >= 2);
  // ghost mode
  await a('PATCH', '/api/me', { ghost: true });
  await a('POST', '/api/rounds', { game: 'dice', amount: 5, params: { chance: 50, over: true } });
  s = await b('GET', '/api/social');
  assert.ok(!s.json.bets.some((x) => x.username === 'socialA'));
  assert.ok(s.json.bets.some((x) => x.username === 'Hidden'));
  const lead = await b('GET', '/api/social/leaders');
  assert.ok(lead.json.leaders.some((l) => l.username === 'Hidden' && l.bets === 2));
  // chat
  const bad = await a('POST', '/api/social/chat', { text: 'hi\u0000there' });
  assert.equal(bad.status, 400);
  const ok = await a('POST', '/api/social/chat', { text: '  gg   everyone <b>x</b> ' });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.message.text, 'gg everyone <b>x</b>');
  const fast = await a('POST', '/api/social/chat', { text: 'again' });
  assert.equal(fast.status, 429);
  s = await b('GET', '/api/social?chat=0');
  assert.ok(s.json.chat.some((m) => m.username === 'socialA' && m.text === 'gg everyone <b>x</b>'));
  const anon = await fetch(base + '/api/social');
  assert.equal(anon.status, 401);
});

test('bonus drips: hourly reload pays a slice of the window wager once per hour; nothing wagered means nothing to claim', async () => {
  const c = client('drip');
  await c('POST', '/api/auth/signup', { username: 'dripper', password: 'a very fine passphrase' });
  const empty = await c('POST', '/api/rewards/drip', { kind: 'hourly' });
  assert.equal(empty.status, 400);
  for (let i = 0; i < 4; i++) await c('POST', '/api/rounds', { game: 'dice', amount: 25, params: { chance: 50, over: true } });
  let rw = await c('GET', '/api/rewards');
  assert.equal(rw.json.drips.hourly.wagered, 100);
  assert.equal(rw.json.drips.hourly.available, 0.5);
  assert.equal(rw.json.drips.weekly.available, 1); // 1% of 100, floored to the 1 AGT minimum
  const before = (await c('GET', '/api/me')).json.user.balance;
  const claim = await c('POST', '/api/rewards/drip', { kind: 'hourly' });
  assert.equal(claim.status, 200);
  assert.equal(claim.json.claimed, 0.5);
  assert.equal(claim.json.balance, Math.round((before + 0.5) * 100) / 100);
  assert.equal(claim.json.bonuses, 0.5);
  const again = await c('POST', '/api/rewards/drip', { kind: 'hourly' });
  assert.equal(again.status, 400);
  assert.match(again.json.error, /unlocks in/);
  rw = await c('GET', '/api/rewards');
  assert.equal(rw.json.drips.hourly.ready, false);
  assert.ok(rw.json.drips.hourly.nextAt > Date.now());
  const bad = await c('POST', '/api/rewards/drip', { kind: 'monthly' });
  assert.equal(bad.status, 400);
});

test('chest: fills with wager, opens once per six hours for a random slice inside the published bounds', async () => {
  const c = client('chest');
  await c('POST', '/api/auth/signup', { username: 'chester', password: 'a very fine passphrase' });
  const empty = await c('POST', '/api/rewards/chest');
  assert.equal(empty.status, 400);
  for (let i = 0; i < 8; i++) await c('POST', '/api/rounds', { game: 'dice', amount: 50, params: { chance: 50, over: true } });
  let rw = await c('GET', '/api/rewards');
  assert.equal(rw.json.chest.wagered, 400);
  assert.equal(rw.json.chest.fill, 0.8);
  assert.equal(rw.json.chest.ready, true);
  const before = (await c('GET', '/api/me')).json.user.balance;
  const open = await c('POST', '/api/rewards/chest');
  assert.equal(open.status, 200);
  assert.ok(open.json.amount >= 1.2 && open.json.amount <= 4.8, `amount ${open.json.amount} within 0.3%..1.2% of 400`);
  assert.equal(open.json.balance, Math.round((before + open.json.amount) * 100) / 100);
  const again = await c('POST', '/api/rewards/chest');
  assert.equal(again.status, 400);
  assert.match(again.json.error, /opens in/);
  rw = await c('GET', '/api/rewards');
  assert.equal(rw.json.chest.ready, false);
  assert.equal(rw.json.chest.wagered, 0);
});

test('live crash: one shared round, bets lock, auto cash out and manual cash out settle against the same point, seed verifies', async () => {
  const { liveCrashPoint, crashMultAt, crashTimeFor } = await import('../shared/live.js');
  const a = client('live-a'), b = client('live-b');
  await a('POST', '/api/auth/signup', { username: 'liveA', password: 'a very fine passphrase' });
  await b('POST', '/api/auth/signup', { username: 'liveB', password: 'a very fine passphrase' });
  const table = srv.api.live.crash;
  let offset = 0; table.h.now = () => Date.now() + offset;
  table.newRound();
  let s = (await a('GET', '/api/live/crash')).json;
  assert.equal(s.phase, 'betting'); assert.ok(s.round.seedHash.length === 64 && s.round.seed === null);
  const r1 = await a('POST', '/api/live/crash/bet', { amount: 20, auto: 1.5 });
  assert.equal(r1.status, 201); assert.equal(r1.json.balance, 980);
  assert.equal((await a('POST', '/api/live/crash/bet', { amount: 20, auto: 1.5 })).status, 400); // one bet per round
  const r2 = await b('POST', '/api/live/crash/bet', { amount: 10, auto: 0 });
  assert.equal(r2.status, 201);
  s = (await b('GET', '/api/live/crash')).json;
  assert.ok(s.bets.some((x) => x.username === 'liveA' && x.amount === 20) && s.mine.length === 1);
  // bets close, the flight starts
  offset = table.cfg.betting + 10; table.tick();
  assert.equal(table.round.phase, 'running');
  assert.equal((await a('POST', '/api/live/crash/bet', { amount: 5 })).status, 400);
  const point = table.round.result;
  // B cashes out by hand at 1.2x if the point allows it
  if (point > 1.21) {
    offset = table.cfg.betting + 10 + crashTimeFor(1.2) + 5; table.tick();
    const co = await b('POST', '/api/live/crash/cashout');
    assert.equal(co.status, 200);
    assert.equal(co.json.bet.cashout, crashMultAt(table.h.now() - table.round.startedAt));
    assert.equal((await b('POST', '/api/live/crash/cashout')).status, 400);
  }
  // the crash
  offset = table.cfg.betting + 10 + crashTimeFor(point) + 50; table.tick();
  assert.equal(table.round.phase, 'ended');
  s = (await a('GET', '/api/live/crash')).json;
  assert.equal(s.round.result, point);
  assert.equal(liveCrashPoint(s.round.seed, s.round.id), point);
  const mineA = s.mine[0];
  assert.equal(mineA.payout, point > 1.5 ? 30 : 0);
  assert.equal(s.balance, point > 1.5 ? 1010 : 980);
  const hist = (await a('GET', '/api/rounds')).json.rounds;
  assert.ok(hist.some((r) => r.game === 'crash' && r.outcome.round === s.round.id && r.multiplier === (point > 1.5 ? 1.5 : 0)));
  // next round opens after the pause
  offset += table.cfg.ending + 10; table.tick();
  assert.equal(table.round.phase, 'betting'); assert.ok(table.round.id > s.round.id);
  table.h.now = Date.now;
});

test('live roulette: many bets per spin, clear refunds them, everyone is paid off the same number', async () => {
  const { liveRouletteNumber } = await import('../shared/live.js');
  const { roulettePayout } = await import('../shared/math.js');
  const a = client('live-a');
  const table = srv.api.live.roulette;
  let offset = 0; table.h.now = () => Date.now() + offset;
  table.newRound();
  assert.equal((await a('POST', '/api/live/roulette/bet', { amount: 10, type: 'red' })).status, 201);
  assert.equal((await a('POST', '/api/live/roulette/bet', { amount: 5, type: 'straight', value: 7 })).status, 201);
  assert.equal((await a('POST', '/api/live/roulette/bet', { amount: 5, type: 'straight', value: 99 })).status, 400);
  const before = (await a('GET', '/api/me')).json.user.balance;
  const cleared = await a('POST', '/api/live/roulette/clear');
  assert.equal(cleared.status, 200); assert.equal(cleared.json.balance, before + 15);
  assert.equal((await a('POST', '/api/live/roulette/bet', { amount: 10, type: 'black' })).status, 201);
  assert.equal((await a('POST', '/api/live/roulette/bet', { amount: 5, type: 'dozen', value: 2 })).status, 201);
  const start = (await a('GET', '/api/me')).json.user.balance;
  offset = table.cfg.betting + 10; table.tick();
  assert.equal(table.round.phase, 'running');
  offset += table.cfg.spin + 10; table.tick();
  assert.equal(table.round.phase, 'ended');
  const s = (await a('GET', '/api/live/roulette')).json;
  const n = s.round.result;
  assert.equal(liveRouletteNumber(s.round.seed, s.round.id), n);
  const expected = 10 * roulettePayout('black', 0, n) + 5 * roulettePayout('dozen', 2, n);
  assert.equal(s.balance, Math.round((start + expected) * 100) / 100);
  assert.equal(s.mine.length, 2);
  table.h.now = Date.now;
});

test('referrals: a code on sign-up boosts the friend, the referrer earns a cut of the edge the friend pays, and the pulse is public', async () => {
  const r1 = client('ref-1'), r2 = client('ref-2');
  await r1('POST', '/api/auth/signup', { username: 'refhost', password: 'a very fine passphrase' });
  const mine = await r1('GET', '/api/referrals');
  assert.equal(mine.status, 200); assert.match(mine.json.code, /^[A-Z2-9]{8}$/); assert.equal(mine.json.count, 0);
  const bad = await r2('POST', '/api/auth/signup', { username: 'reffriend', password: 'a very fine passphrase', ref: 'NOPE' });
  assert.equal(bad.status, 400);
  const ok = await r2('POST', '/api/auth/signup', { username: 'reffriend', password: 'a very fine passphrase', ref: mine.json.code.toLowerCase() });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.user.balance, 1050);
  assert.deepEqual(ok.json.welcome, { tokens: 1000, referralBonus: 50, referrer: 'refhost' });
  for (let i = 0; i < 4; i++) await r2('POST', '/api/rounds', { game: 'dice', amount: 100, params: { chance: 50, over: true } });
  const after = await r1('GET', '/api/referrals');
  assert.equal(after.json.count, 1);
  assert.equal(after.json.referred[0].username, 'reffriend');
  assert.equal(after.json.referred[0].wagered, 400);
  assert.equal(after.json.pending, 0.4); // 10% of the 1% edge on 400
  const early = await r1('POST', '/api/referrals/claim');
  assert.equal(early.status, 400);
  for (let i = 0; i < 6; i++) await r2('POST', '/api/rounds', { game: 'dice', amount: 100, params: { chance: 50, over: true } });
  const before = (await r1('GET', '/api/me')).json.user.balance;
  const claim = await r1('POST', '/api/referrals/claim');
  assert.equal(claim.status, 200);
  assert.equal(claim.json.balance, before + 1);
  assert.equal(claim.json.claimed, 1);
  const self = await r1('POST', '/api/auth/signup', { username: 'refhost2', password: 'a very fine passphrase', ref: mine.json.code });
  assert.equal(self.status, 201);
  const pulse = await fetch(base + '/api/pulse');
  assert.equal(pulse.status, 200);
  const p = await pulse.json();
  assert.ok(typeof p.online === 'number' && Array.isArray(p.wins));
});
