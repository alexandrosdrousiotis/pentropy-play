// Shared rounds: one Crash flight and one Roulette spin at a time, for everybody at the table.
// The engine is a pure state machine over a clock and a few hooks, so the server and the browser
// demo run the exact same code. Fairness is commit-reveal per round: the seed's hash is shown while
// bets are open and the seed itself is revealed the moment the round ends.
import { hmacSha256, sha256, toHex } from './sha256.js';
import { crashPoint, roulettePayout, ROULETTE_RTP, CRASH_K, ROULETTE_BETS } from './math.js';
import { BOT_HANDLES } from './social-bots.js';

export const LIVE = {
  crash: { betting: 7000, ending: 3800, rtp: 0.99 },
  roulette: { betting: 15000, spin: 5800, ending: 4200, rtp: ROULETTE_RTP, maxBets: 12 },
};
const bytesToFloat = (b0, b1, b2, b3) => b0 / 256 + b1 / 65536 + b2 / 16777216 + b3 / 4294967296;
export const liveFloat = (seed, msg) => { const b = hmacSha256(seed, msg); return bytesToFloat(b[0], b[1], b[2], b[3]); };
export const liveCrashPoint = (seed, roundId) => crashPoint(liveFloat(seed, `crash:${roundId}`));
export const liveRouletteNumber = (seed, roundId) => Math.floor(liveFloat(seed, `roulette:${roundId}`) * 37);
export const seedHash = (seed) => toHex(sha256(seed));
export const crashMultAt = (ms) => Math.max(1, Math.floor(Math.exp(CRASH_K * (ms / 1000)) * 100) / 100);
export const crashTimeFor = (mult) => (Math.log(mult) / CRASH_K) * 1000;
const round2 = (x) => Math.round(x * 100) / 100;

/** Validate a roulette bet from the wire. */
export function rouletteBet(raw) {
  const type = String(raw?.type ?? '');
  if (!ROULETTE_BETS.includes(type)) throw new Error('Unknown bet');
  let value = 0;
  if (type === 'straight') { value = Number(raw.value); if (!Number.isInteger(value) || value < 0 || value > 36) throw new Error('Pick a number from 0 to 36'); }
  if (type === 'dozen' || type === 'column') { value = Number(raw.value); if (![1, 2, 3].includes(value)) throw new Error('Pick 1, 2 or 3'); }
  return { type, value };
}

/**
 * hooks: { now(), seed() → hex, nextId() → int, debit(ctx, cents, meta) → balanceCents, settle(bet, round, payoutCents, outcome), refund(bet), bots: bool }
 * Bets carry `userId`, `username`, `amount` (cents), `params`, `auto`, `cashout`, `payout`, `bot`.
 */
export class LiveTable {
  constructor(game, hooks) {
    this.game = game; this.h = hooks; this.cfg = LIVE[game];
    this.history = []; this.round = null; this.seq = 0;
    this.newRound();
  }
  newRound() {
    const t = this.h.now();
    const seed = this.h.seed(), hash = seedHash(seed);
    this.round = { id: this.h.nextId(seed, hash), seed, seedHash: hash, phase: 'betting', openedAt: t, bettingEnds: t + this.cfg.betting, startedAt: null, endsAt: null, result: null, bets: [] };
    if (this.h.bots) this.addBots();
  }
  addBots() {
    const n = 3 + Math.floor(Math.random() * 7);
    for (let i = 0; i < n; i++) {
      const username = BOT_HANDLES[Math.floor(Math.random() * BOT_HANDLES.length)];
      if (this.round.bets.some((b) => b.username === username)) continue;
      const amount = Math.round(Math.exp(Math.log(0.5) + Math.random() * (Math.log(400) - Math.log(0.5))) * 100);
      const params = this.game === 'crash' ? { auto: round2(1.05 + Math.random() ** 2.2 * 9) } : this.randomRouletteBet();
      this.round.bets.push({ id: ++this.seq, userId: null, username, bot: true, amount, params, auto: params.auto ?? 0, cashout: null, payout: null, placedAt: this.h.now() + Math.random() * this.cfg.betting * 0.8 });
    }
  }
  randomRouletteBet() {
    const r = Math.random();
    if (r < 0.45) return { type: ['red', 'black', 'odd', 'even', 'low', 'high'][Math.floor(Math.random() * 6)], value: 0 };
    if (r < 0.7) return { type: Math.random() < 0.5 ? 'dozen' : 'column', value: 1 + Math.floor(Math.random() * 3) };
    return { type: 'straight', value: Math.floor(Math.random() * 37) };
  }
  /** Advance the clock. Call often (every ~250 ms). */
  tick() {
    const t = this.h.now(), r = this.round;
    if (r.phase === 'betting' && t >= r.bettingEnds) {
      r.phase = 'running'; r.startedAt = t;
      if (this.game === 'crash') { r.result = liveCrashPoint(r.seed, r.id); r.endsAt = t + crashTimeFor(r.result); }
      else { r.result = liveRouletteNumber(r.seed, r.id); r.endsAt = t + this.cfg.spin; }
    }
    if (r.phase === 'running') {
      if (this.game === 'crash') {
        const m = crashMultAt(t - r.startedAt);
        for (const b of r.bets) if (b.bot && b.cashout == null && b.auto >= 1.01 && b.auto <= m && b.auto < r.result) { b.cashout = b.auto; b.payout = Math.round(b.amount * b.auto); }
      }
      if (t >= r.endsAt) this.end();
    }
    if (r.phase === 'ended' && t >= r.endsAt + this.cfg.ending) { this.newRound(); }
  }
  end() {
    const r = this.round; r.phase = 'ended';
    for (const b of r.bets) {
      if (b.cashout != null) continue;
      let mult = 0;
      if (this.game === 'crash') { if (b.auto >= 1.01 && b.auto < r.result) mult = b.auto; }
      else mult = roulettePayout(b.params.type, b.params.value, r.result);
      b.cashout = mult > 0 ? mult : 0; b.payout = Math.round(b.amount * mult);
    }
    for (const b of r.bets) if (!b.bot) this.h.settle(b, r, b.payout, this.game === 'crash' ? { point: r.result, cashout: b.cashout, auto: b.auto } : { number: r.result, bet: b.params });
    this.h.ended?.(r);
    this.history.unshift({ id: r.id, result: r.result, seedHash: r.seedHash, seed: r.seed, at: r.endsAt });
    if (this.history.length > 40) this.history.length = 40;
  }
  /** Place a bet for the round that is taking bets. `ctx` is whatever the host needs to debit (user + session). */
  bet(ctx, user, amountCents, rawParams) {
    const r = this.round;
    if (r.phase !== 'betting') throw new Error('Bets are closed for this round. The next one opens in a moment.');
    const mine = r.bets.filter((b) => b.userId === user.id);
    let params, auto = 0;
    if (this.game === 'crash') {
      if (mine.length) throw new Error('You already have a bet on this round.');
      auto = Number(rawParams?.auto) || 0; if (auto && (auto < 1.01 || auto > 1_000_000)) throw new Error('Auto cash out must be at least 1.01x.');
      params = { auto };
    } else {
      if (mine.length >= this.cfg.maxBets) throw new Error(`At most ${this.cfg.maxBets} bets per spin.`);
      params = rouletteBet(rawParams);
    }
    const { balance, ref } = this.h.debit(ctx, amountCents, { round: r, params, auto });
    const b = { id: ++this.seq, ref, userId: user.id, username: user.username, bot: false, amount: amountCents, params, auto, cashout: null, payout: null, placedAt: this.h.now() };
    r.bets.push(b);
    return { bet: this.pubBet(b, true), balance };
  }
  /** Crash only: take the money at this instant's multiplier. */
  cashout(user) {
    const r = this.round;
    if (this.game !== 'crash' || r.phase !== 'running') throw new Error('Nothing to cash out.');
    const b = r.bets.find((x) => x.userId === user.id && x.cashout == null);
    if (!b) throw new Error('No open bet.');
    const m = crashMultAt(this.h.now() - r.startedAt);
    if (m >= r.result) throw new Error(`Too late: it crashed at ${r.result.toFixed(2)}x.`);
    b.cashout = m; b.payout = Math.round(b.amount * m);
    const balance = this.h.settle(b, r, b.payout, { point: null, cashout: m, auto: b.auto });
    return { bet: this.pubBet(b, true), balance };
  }
  /** Roulette: take back every bet I placed this spin while bets are still open. */
  clear(user) {
    const r = this.round;
    if (r.phase !== 'betting') throw new Error('Bets are locked.');
    const mine = r.bets.filter((b) => b.userId === user.id);
    if (!mine.length) throw new Error('No bets to clear.');
    let balance = null;
    for (const b of mine) balance = this.h.refund(b, r);
    r.bets = r.bets.filter((b) => b.userId !== user.id);
    return { balance };
  }
  pubBet(b, mine = false) {
    return { id: b.id, username: b.username, bot: b.bot, amount: b.amount / 100, params: b.params, auto: b.auto, cashout: b.cashout, payout: b.payout == null ? null : b.payout / 100, mine };
  }
  /** Snapshot for a client. The seed is included only once the round has ended. */
  state(userId = null) {
    const r = this.round, t = this.h.now();
    const visible = r.bets.filter((b) => !b.bot || b.placedAt <= t);
    return {
      game: this.game, now: t, phase: r.phase,
      round: { id: r.id, seedHash: r.seedHash, seed: r.phase === 'ended' ? r.seed : null, openedAt: r.openedAt, bettingEnds: r.bettingEnds, startedAt: r.startedAt, endsAt: r.endsAt, result: r.phase === 'ended' || (this.game === 'roulette' && r.phase === 'running') ? r.result : null },
      bets: visible.map((b) => this.pubBet(b, b.userId != null && b.userId === userId)).sort((a, b) => b.amount - a.amount),
      mine: r.bets.filter((b) => b.userId === userId).map((b) => this.pubBet(b, true)),
      history: this.history.slice(0, 24).map((x) => ({ id: x.id, result: x.result, seedHash: x.seedHash, seed: x.seed })),
      timing: this.cfg,
    };
  }
}
