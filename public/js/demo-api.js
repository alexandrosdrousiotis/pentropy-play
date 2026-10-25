// Browser-only demo runtime. Mirrors the server API (server/routes.js) against localStorage so the
// platform can be previewed without a backend. The real deployment never uses this file: it is only
// loaded when index.html carries <meta name="pentropy-mode" content="demo">.
import { GAMES, GAME_IDS } from '../shared/engine.js';
import { v, HttpError, bad } from '../shared/validate.js';
import { sha256, hmacSha256, toHex } from '../shared/sha256.js';
import { TIERS, tierFor, tierById, nextTier, DRIPS, DRIP_IDS, dripAmount } from '../shared/tiers.js';
import { botRound, BOT_HANDLES } from '../shared/social-bots.js';

const KEY = 'pentropy.demo.v2';
const START = 1000_00, REFILL = 1000_00, MIN_BET = 10, MAX_BET = 1_000_000_00;
const LESSON_IDS = ['rtp', 'turnover', 'ceiling', 'fallacy', 'chasing', 'design', 'fair', 'skill', 'help'];
const cents = (x) => Math.round(x * 100), agt = (c) => c / 100, now = () => Date.now();
const randomHex = (n = 32) => toHex(crypto.getRandomValues(new Uint8Array(n)));
const sha256Hex = (s) => toHex(sha256(s));

let db = load();
function load() { try { return JSON.parse(localStorage.getItem(KEY)) || { users: {}, session: null }; } catch { return { users: {}, session: null }; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage unavailable: demo keeps running in memory */ } }

function hashPassword(password, salt) { let h = `${salt}:${password}`; for (let i = 0; i < 2000; i++) h = sha256Hex(h); return h; }
const bytesToFloat = (b0, b1, b2, b3) => b0 / 256 + b1 / 65536 + b2 / 16777216 + b3 / 4294967296;
class FairRng {
  constructor(serverSeed, clientSeed, nonce, skip = 0) { Object.assign(this, { serverSeed, clientSeed, nonce, cursor: 0, buffer: [], used: 0 }); if (skip) this.take(skip); }
  take(n = 1) { const out = []; while (out.length < n) { if (!this.buffer.length) { const b = hmacSha256(this.serverSeed, `${this.clientSeed}:${this.nonce}:${this.cursor++}`); for (let i = 0; i < 32; i += 4) this.buffer.push(bytesToFloat(b[i], b[i + 1], b[i + 2], b[i + 3])); } out.push(this.buffer.shift()); } this.used += n; return out; }
  one() { return this.take(1)[0]; }
}

const current = () => (db.session ? db.users[db.session] : null);
const need = () => { const u = current(); if (!u) throw new HttpError(401, 'Sign in required'); return u; };
const openRound = (u) => u.rounds.find((r) => r.status === 'open') || null;

const publicRound = (r, view) => ({
  id: r.id, game: r.game, base: agt(r.base), amount: agt(r.amount), rtp: r.rtp, params: r.params, nonce: r.nonce, serverSeedHash: r.serverSeedHash, clientSeed: r.clientSeed, status: r.status,
  ...(r.status === 'settled' ? { multiplier: r.multiplier, payout: agt(r.payout), net: agt(r.payout - r.amount), outcome: r.outcome, floatsUsed: r.floatsUsed, settledAt: r.settledAt, balanceAfter: agt(r.balanceAfter) } : { view, openedAt: r.openedAt }),
});
const viewOf = (r) => GAMES[r.game].view(r.state, r.params);
function statsOf(u) {
  const s = u.rounds.filter((r) => r.status === 'settled');
  const wagered = s.reduce((a, r) => a + r.amount, 0), returned = s.reduce((a, r) => a + r.payout, 0);
  return { bets: s.length, wagered: agt(wagered), returned: agt(returned), net: agt(returned - wagered), wins: s.filter((r) => r.payout > r.amount).length, losses: s.filter((r) => r.payout <= r.amount).length,
    biggestWin: agt(Math.max(0, ...s.map((r) => r.payout - r.amount))), biggestLoss: agt(Math.max(0, ...s.map((r) => r.amount - r.payout))), expectedLoss: agt(s.reduce((a, r) => a + r.amount * (1 - r.rtp), 0)), playMs: now() - (db.sessionStart || now()) + (u.playMs || 0) };
}
const me = (u) => ({
  user: { username: u.username, balance: agt(u.balance), vault: agt(u.vault || 0), deposited: agt(u.deposited || 0), notional: agt(u.notionalCents), limits: u.limits, lessonsRead: u.lessons, refills: u.refills, createdAt: u.createdAt, ghost: Boolean(u.ghost) },
  session: { startedAt: db.sessionStart, startBalance: agt(db.startBalance) },
  seeds: { serverSeedHash: u.seeds.serverSeedHash, clientSeed: u.seeds.clientSeed, nonce: u.seeds.nonce },
  openRound: (() => { const r = openRound(u); return r ? publicRound(r, viewOf(r)) : null; })(),
  stats: statsOf(u),
  rewards: rewardsOf(u),
});
function checkLimits(u) {
  const l = u.limits;
  if (l.lossLimit > 0 && db.startBalance - u.balance >= cents(l.lossLimit)) throw new HttpError(403, 'You reached the loss limit you set for this session. Sign out and back in to start a new session.');
  if (l.sessionMinutes > 0 && now() - db.sessionStart >= l.sessionMinutes * 60e3) throw new HttpError(403, 'You reached the session time limit you set. Sign out to end the session.');
}

const S = {
  credentials: { username: v.string({ min: 3, max: 20, pattern: /^[a-zA-Z0-9_]+$/ }), password: v.string({ min: 1, max: 128 }) },
  profile: { notional: v.number({ min: 0, max: 1000, decimals: 2, optional: true }), limits: v.obj({ lossLimit: v.number({ min: 0, max: 1_000_000, decimals: 2 }), sessionMinutes: v.number({ min: 0, max: 1440, integer: true }), realityEvery: v.number({ min: 5, max: 500, integer: true }) }, { optional: true }), ghost: v.boolean({ optional: true }) },
  chat: { text: v.string({ min: 1, max: 200, pattern: /^[^\x00-\x1F\x7F]+$/ }) },
  lesson: { id: v.oneOf(LESSON_IDS) }, rotate: { clientSeed: v.string({ min: 1, max: 64, pattern: /^[a-zA-Z0-9_-]+$/, optional: true }) }, password: { password: v.string({ min: 1, max: 128 }) },
};
const rawObj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});

const FAUCET = 1000_00;
const walletOf = (u) => {
  const TYPES = ['deposit', 'withdraw', 'vault_in', 'refill', 'rebate', 'bonus'];
  const used = u.events.filter((e) => e.type === 'deposit' && e.at > now() - 24 * 3600e3).reduce((a, e) => a + e.amount, 0);
  return { balance: agt(u.balance), vault: agt(u.vault || 0), deposited: agt(u.deposited || 0), faucetAvailable: agt(Math.max(0, FAUCET - used)), faucetPerDay: agt(FAUCET), address: 'agt1' + sha256Hex(`addr:${u.username.toLowerCase()}`).slice(0, 38),
    history: [...u.events].reverse().filter((e) => TYPES.includes(e.type)).slice(0, 50).map((e, i) => ({ id: e.at, type: e.type, amount: agt(e.amount), balanceAfter: agt(e.balanceAfter), at: e.at, txid: sha256Hex(`${u.username}:${e.at}:${i}`).slice(0, 40) })) };
};
function accrue(u, amountCents, rtp) {
  u.tier ||= 'bronze'; u.rebatePending ||= 0; u.rebateClaimed ||= 0; u.bonuses ||= 0;
  u.rebatePending += amountCents * (1 - rtp) * tierById(u.tier).rate;
  const wagered = u.rounds.filter((r) => r.status === 'settled').reduce((a, r) => a + r.amount, 0) / 100;
  const earned = tierFor(wagered);
  if (TIERS.findIndex((t) => t.id === earned.id) > TIERS.findIndex((t) => t.id === u.tier)) {
    for (const t of TIERS) if (t.threshold > tierById(u.tier).threshold && t.threshold <= earned.threshold) { u.balance += cents(t.bonus); u.bonuses += cents(t.bonus); u.events.push({ type: 'bonus', amount: cents(t.bonus), balanceAfter: u.balance, at: now() }); }
    u.tier = earned.id;
  }
}
const rewardsOf = (u) => {
  u.tier ||= 'bronze'; u.rebatePending ||= 0;
  const wagered = u.rounds.filter((r) => r.status === 'settled').reduce((a, r) => a + r.amount, 0) / 100;
  const tier = tierById(u.tier), next = nextTier(u.tier);
  return { tier: tier.id, rate: tier.rate, wagered, next: next ? { id: next.id, name: next.name, threshold: next.threshold, remaining: Math.max(0, next.threshold - wagered), progress: Math.min(1, (wagered - tier.threshold) / (next.threshold - tier.threshold)) } : null,
    rebatePending: Math.floor(u.rebatePending) / 100, rebateClaimed: agt(u.rebateClaimed || 0), bonuses: agt(u.bonuses || 0), edgePaid: statsOf(u).expectedLoss, tiers: TIERS, drips: dripsOf(u) };
};
function dripsOf(u) {
  const last = u.drips || {}, t = now(), out = {};
  for (const kind of DRIP_IDS) {
    const d = DRIPS[kind], at = last[kind] || 0, ready = t - at >= d.windowMs, since = Math.max(at, t - d.windowMs);
    const wagered = u.rounds.filter((r) => r.status === 'settled' && r.settledAt > since).reduce((a, r) => a + r.amount, 0) / 100;
    out[kind] = { label: d.label, blurb: d.blurb, rate: d.rate, min: d.min, max: d.max, windowMs: d.windowMs, wagered, available: ready ? dripAmount(kind, wagered) : 0, ready, nextAt: ready ? t : at + d.windowMs, claimedAt: at || null };
  }
  return out;
}
/* ---- social: simulated room, real rounds from every local account, chat kept in storage ---- */
const bots = []; let botClock = now() - 36e3, chatSeq = Math.max(0, ...((load().chat || []).map((m) => m.id))), botChatAt = 0;
const LINES = ['gg', 'crash did 1.01x three times in a row lol', 'anyone else down bad today', 'chicken on hard is cruel', 'took the 2x and ran', 'claimed my rebate, still down 40 for the day', 'the edge never sleeps', 'plinko high risk is a donation box', 'how is everyone', 'tower expert is unplayable', 'roulette red red red red black', 'what is the point of martingale if the limit stops you', 'nice hit', 'one more and I stop', '2.00x on limbo is just a coin flip with extra steps', 'dice 50% is the honest one', 'hit 24x on wheel then gave it back in 10 minutes', 'the stats page is brutal', 'anyone up today?', 'lost the refill already'];
function tickBots() { while (botClock < now()) { botClock += 700 + Math.random() * 2200; bots.push(botRound(Math.random, botClock)); } while (bots.length > 200) bots.shift(); }
function botChat() { if (now() - botChatAt < 9000 || Math.random() > 0.5) return; botChatAt = now(); db.chat ||= []; db.chat.push({ id: ++chatSeq, username: BOT_HANDLES[Math.floor(Math.random() * BOT_HANDLES.length)], text: LINES[Math.floor(Math.random() * LINES.length)], at: now(), bot: true }); if (db.chat.length > 150) db.chat.splice(0, db.chat.length - 150); save(); }
const realBets = (after) => Object.values(db.users).flatMap((u) => u.rounds.filter((r) => r.status === 'settled' && r.settledAt > after).map((r) => ({ id: `r${u.username}${r.id}`, at: r.settledAt, username: u.ghost ? 'Hidden' : u.username, bot: false, game: r.game, amount: agt(r.amount), multiplier: r.multiplier, payout: agt(r.payout), net: agt(r.payout - r.amount) })));
const routes = {
  'GET /api/social': (b, qs) => {
    need(); tickBots(); botChat();
    const after = Number(qs.get('after')) || 0, chatAfter = Number(qs.get('chat')) || 0;
    const bets = [...realBets(after), ...bots.filter((x) => x.at > after)].sort((x, y) => y.at - x.at).slice(0, 40);
    const chat = (db.chat || []).filter((m) => m.id > chatAfter).slice(-60);
    return { body: { bets, chat, online: 14 + (Math.floor(now() / 60e3) % 7), ambient: true, now: now() } };
  },
  'GET /api/social/big': () => { need(); tickBots(); return { body: { bets: [...realBets(now() - 864e5), ...bots].filter((x) => x.payout > x.amount).sort((x, y) => y.payout - x.payout).slice(0, 12) } }; },
  'GET /api/social/leaders': () => {
    need(); tickBots();
    const agg = {};
    for (const x of [...realBets(now() - 864e5), ...bots]) { const a = (agg[x.username] ||= { username: x.username, bot: x.bot, bets: 0, wagered: 0, net: 0, best: 0 }); a.bets++; a.wagered += x.amount; a.net += x.net; a.best = Math.max(a.best, x.multiplier); }
    return { body: { leaders: Object.values(agg).sort((x, y) => y.wagered - x.wagered).slice(0, 10).map((a) => ({ ...a, wagered: Math.round(a.wagered * 100) / 100, net: Math.round(a.net * 100) / 100 })) } };
  },
  'POST /api/social/chat': (b) => {
    const u = need(); const { text } = v.object(b, S.chat); db.chat ||= [];
    const last = [...db.chat].reverse().find((m) => m.username === u.username && !m.bot);
    if (last && now() - last.at < 1500) throw new HttpError(429, 'Slow down.');
    const clean = text.replace(/\s+/g, ' ').trim(); if (!clean) throw bad('Say something.');
    const m = { id: ++chatSeq, username: u.username, text: clean, at: now() }; db.chat.push(m); if (db.chat.length > 150) db.chat.splice(0, db.chat.length - 150); save();
    return { status: 201, body: { message: m } };
  },
  'GET /api/rewards': () => ({ body: rewardsOf(need()) }),
  'POST /api/rewards/claim': () => { const u = need(); const c = Math.floor(u.rebatePending || 0); if (c < 100) throw bad('Rebates can be claimed from 1.00 AGT.'); u.rebatePending -= c; u.rebateClaimed = (u.rebateClaimed || 0) + c; u.balance += c; u.events.push({ type: 'rebate', amount: c, balanceAfter: u.balance, at: now() }); save(); return { body: { ...rewardsOf(u), balance: agt(u.balance) } }; },
  'POST /api/rewards/drip': (b) => { const u = need(); const { kind } = v.object(b, { kind: v.oneOf(DRIP_IDS) }); const d = dripsOf(u)[kind]; if (!d.ready) throw bad(`${d.label} unlocks in ${Math.ceil((d.nextAt - now()) / 60000)} min.`); if (d.available <= 0) throw bad('Nothing wagered in the window, so there is nothing to give back.'); const c = cents(d.available); u.balance += c; u.bonuses = (u.bonuses || 0) + c; u.drips = { ...(u.drips || {}), [kind]: now() }; u.events.push({ type: 'bonus', amount: c, balanceAfter: u.balance, at: now() }); save(); return { body: { ...rewardsOf(u), balance: agt(u.balance), claimed: d.available, kind } }; },
  'GET /api/wallet': () => ({ body: walletOf(need()) }),
  'POST /api/wallet/deposit': (b) => {
    const u = need(); const { amount, source } = v.object(b, { amount: v.number({ min: 1, max: 1_000_000, decimals: 2 }), source: v.oneOf(['faucet', 'vault'], { optional: true, default: 'faucet' }) });
    if (openRound(u)) throw new HttpError(409, 'Finish the current round first.');
    const c = cents(amount); u.vault ||= 0; u.deposited ||= 0;
    if (source === 'vault') { if (c > u.vault) throw bad('Not enough in the vault.'); u.vault -= c; u.balance += c; u.events.push({ type: 'vault_in', amount: c, balanceAfter: u.balance, at: now() }); }
    else { const w = walletOf(u); if (amount > w.faucetAvailable) throw bad(`Daily deposit limit is 1,000 AGT. ${w.faucetAvailable} left today.`); u.balance += c; u.deposited += c; u.events.push({ type: 'deposit', amount: c, balanceAfter: u.balance, at: now() }); }
    save(); return { body: walletOf(u) };
  },
  'POST /api/wallet/withdraw': (b) => {
    const u = need(); const { amount } = v.object(b, { amount: v.number({ min: 1, max: 1_000_000, decimals: 2 }) });
    if (openRound(u)) throw new HttpError(409, 'Finish the current round first.');
    const c = cents(amount); if (c > u.balance) throw bad('Not enough tokens.');
    u.vault = (u.vault || 0) + c; u.balance -= c; u.events.push({ type: 'withdraw', amount: c, balanceAfter: u.balance, at: now() }); save();
    return { body: walletOf(u) };
  },
  'POST /api/auth/signup': (b) => {
    const { username, password } = v.object(b, S.credentials);
    if (password.length < 10) throw bad('Password must be 10–128 characters.');
    if (password.toLowerCase().includes(username.toLowerCase())) throw bad('Password must not contain the username.');
    const key = username.toLowerCase();
    if (db.users[key]) throw new HttpError(409, 'That username is unavailable.');
    const salt = randomHex(8), serverSeed = randomHex(32);
    db.users[key] = { username, salt, hash: hashPassword(password, salt), balance: START, vault: 0, deposited: 0, notionalCents: 100, limits: { lossLimit: 0, sessionMinutes: 0, realityEvery: 25 }, lessons: [], refills: 0, createdAt: now(), seeds: { serverSeed, serverSeedHash: sha256Hex(serverSeed), clientSeed: randomHex(8), nonce: 0 }, seedHistory: [], rounds: [], events: [], nextId: 1, playMs: 0 };
    db.session = key; db.sessionStart = now(); db.startBalance = START; save();
    return { status: 201, body: me(db.users[key]) };
  },
  'POST /api/auth/login': (b) => {
    const { username, password } = v.object(b, S.credentials);
    const u = db.users[username.toLowerCase()];
    if (!u || hashPassword(password, u.salt) !== u.hash) throw new HttpError(401, 'Invalid username or password.');
    db.session = username.toLowerCase(); db.sessionStart = now(); db.startBalance = u.balance; save();
    return { body: me(u) };
  },
  'POST /api/auth/logout': () => { const u = current(); if (u) u.playMs = (u.playMs || 0) + (now() - db.sessionStart); db.session = null; save(); return { body: { ok: true } }; },
  'GET /api/me': () => ({ body: me(need()) }),
  'PATCH /api/me': (b) => { const u = need(); const p = v.object(b, S.profile); if (p.notional != null) u.notionalCents = cents(p.notional); if (p.limits) u.limits = { ...u.limits, ...p.limits }; if (p.ghost != null) u.ghost = p.ghost; save(); return { body: me(u) }; },
  'DELETE /api/me': (b) => { const u = need(); const { password } = v.object(b, S.password); if (hashPassword(password, u.salt) !== u.hash) throw new HttpError(401, 'Invalid password.'); delete db.users[db.session]; db.session = null; save(); return { body: { ok: true } }; },
  'GET /api/stats': () => {
    const u = need();
    const settled = u.rounds.filter((r) => r.status === 'settled');
    const curve = [{ t: u.createdAt, b: START }, ...settled.map((r) => ({ t: r.settledAt, b: r.balanceAfter })), ...u.events.map((e) => ({ t: e.at, b: e.balanceAfter, refill: e.type === 'refill', event: e.type }))].sort((a, b) => a.t - b.t).map((p) => ({ ...p, b: agt(p.b) }));
    const byGame = {};
    for (const r of settled) { const g = (byGame[r.game] ||= { game: r.game, bets: 0, wagered: 0, returned: 0, best: 0 }); g.bets++; g.wagered += r.amount; g.returned += r.payout; g.best = Math.max(g.best, r.multiplier); }
    return { body: { stats: statsOf(u), byGame: Object.values(byGame).map((g) => ({ ...g, wagered: agt(g.wagered), returned: agt(g.returned) })), curve, history: settled.slice(-100).reverse().map((r) => publicRound(r)) } };
  },
  'GET /api/rounds': (b, q) => { const u = need(); const n = Math.min(300, Number(q.get('limit')) || 50); return { body: { rounds: u.rounds.filter((r) => r.status === 'settled').slice(-n).reverse().map((r) => publicRound(r)) } }; },
  'GET /api/rounds/current': () => { const u = need(); const r = openRound(u); return { body: { round: r ? publicRound(r, viewOf(r)) : null, balance: agt(u.balance) } }; },
  'POST /api/rounds': (b) => {
    const u = need();
    const { game, amount } = v.object({ game: b.game, amount: b.amount }, { game: v.oneOf(GAME_IDS), amount: v.number({ min: 0.1, max: 1_000_000, decimals: 2 }) });
    const engine = GAMES[game]; const p = engine.params(rawObj(b.params)); const stake = cents(amount);
    if (openRound(u)) throw new HttpError(409, 'Finish the current round first.');
    checkLimits(u);
    if (stake < MIN_BET) throw bad('Minimum bet is 0.1 AGT.'); if (stake > MAX_BET) throw bad('Maximum bet is 1,000,000 AGT.'); if (stake > u.balance) throw bad('Not enough tokens.');
    const seeds = u.seeds; const nonce = seeds.nonce++;
    const rng = new FairRng(seeds.serverSeed, seeds.clientSeed, nonce);
    const t = now(); const result = engine.start(p, rng, t); const rtp = engine.rtp(p);
    let balance = u.balance - stake;
    const r = { id: u.nextId++, game, base: stake, amount: stake, rtp, params: p, nonce, serverSeedHash: seeds.serverSeedHash, clientSeed: seeds.clientSeed, status: 'open', state: null, floatsUsed: rng.used, openedAt: t };
    if (result.settled) { const units = result.multiplierUnits ?? result.multiplier; const payout = Math.round(stake * units); balance += payout; Object.assign(r, { status: 'settled', multiplier: payout / stake, payout, outcome: result.outcome, balanceAfter: balance, settledAt: t }); }
    else r.state = result.state;
    u.balance = balance; u.rounds.push(r); if (result.settled) { accrue(u, stake, rtp); balance = u.balance; } if (u.rounds.length > 400) u.rounds.splice(0, u.rounds.length - 400); save();
    return { status: 201, body: { round: publicRound(r, result.settled ? null : engine.view(result.state, p)), balance: agt(balance) } };
  },
  'POST /api/rounds/current/action': (b) => {
    const u = need(); const r = openRound(u);
    if (!r) throw new HttpError(404, 'No open round.');
    const { action } = v.object({ action: b.action }, { action: v.string({ min: 1, max: 20, pattern: /^[a-z]+$/ }) });
    const engine = GAMES[r.game]; const state = structuredClone(r.state);
    const rng = new FairRng(u.seeds.serverSeed, r.clientSeed, r.nonce, r.floatsUsed);
    const t = now(); const result = engine.action(state, r.params, action, rawObj(b.payload), rng, t);
    let balance = u.balance, amount = r.amount;
    if (result.extraUnits) { const extra = Math.round(r.base * result.extraUnits); if (extra > balance) throw bad('Not enough tokens for that action.'); balance -= extra; amount += extra; }
    if (result.settled) { const units = result.multiplierUnits ?? result.multiplier; const payout = Math.round(r.base * units); balance += payout; Object.assign(r, { status: 'settled', state: null, amount, multiplier: payout / amount, payout, outcome: result.outcome, floatsUsed: rng.used, balanceAfter: balance, settledAt: t }); }
    else Object.assign(r, { state: result.state, amount, floatsUsed: rng.used });
    u.balance = balance; if (result.settled) { accrue(u, amount, r.rtp); balance = u.balance; } save();
    return { body: { round: publicRound(r, result.settled ? null : engine.view(result.state, r.params)), balance: agt(balance) } };
  },
  'GET /api/seeds': () => { const u = need(); return { body: { current: { serverSeedHash: u.seeds.serverSeedHash, clientSeed: u.seeds.clientSeed, nonce: u.seeds.nonce }, revealed: u.seedHistory } }; },
  'POST /api/seeds/rotate': (b) => {
    const u = need(); const { clientSeed } = v.object(b, S.rotate);
    if (openRound(u)) throw new HttpError(409, 'Finish the current round before rotating seeds.');
    const old = u.seeds;
    u.seedHistory.unshift({ serverSeed: old.serverSeed, serverSeedHash: old.serverSeedHash, clientSeed: old.clientSeed, nonces: old.nonce, revealedAt: now() }); u.seedHistory.length = Math.min(u.seedHistory.length, 20);
    const next = randomHex(32);
    u.seeds = { serverSeed: next, serverSeedHash: sha256Hex(next), clientSeed: clientSeed || old.clientSeed, nonce: 0 }; save();
    return { body: { previous: { serverSeed: old.serverSeed, serverSeedHash: old.serverSeedHash, clientSeed: old.clientSeed, nonces: old.nonce }, current: { serverSeedHash: u.seeds.serverSeedHash, clientSeed: u.seeds.clientSeed, nonce: 0 } } };
  },
  'POST /api/lessons/read': (b) => { const u = need(); const { id } = v.object(b, S.lesson); if (!u.lessons.includes(id)) u.lessons.push(id); save(); return { body: { lessonsRead: u.lessons } }; },
  'POST /api/refill': (b) => {
    const u = need(); const { id } = v.object(b, S.lesson);
    if (openRound(u)) throw new HttpError(409, 'Finish the current round first.');
    if (u.balance >= MIN_BET) throw bad('You still have tokens to play with.');
    if (!u.lessons.includes(id)) u.lessons.push(id);
    u.balance = REFILL; u.refills++; u.events.push({ type: 'refill', amount: REFILL, balanceAfter: REFILL, at: now() }); save();
    return { body: { balance: agt(REFILL) } };
  },
};

/** Same contract as fetch-based call(): resolves with the body, rejects with {status, message}. */
export async function call(method, path, body = {}) {
  const url = new URL(path, 'http://demo');
  const handler = routes[`${method} ${url.pathname}`];
  if (!handler) throw new HttpError(404, 'Not found');
  await new Promise((r) => setTimeout(r, 40)); // a touch of latency so the UI behaves as it would online
  const out = handler(body || {}, url.searchParams);
  return structuredClone(out.body);
}
export const isDemo = true;
