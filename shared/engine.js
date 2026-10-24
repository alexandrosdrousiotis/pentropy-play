// Game engines. Pure state machines: (params, rng, state, action) -> result. Money is handled by routes.js.
// Every multiplier is settled at exactly the 2-decimal value shown to the player.
import { v, bad } from './validate.js';
import * as M from './math.js';
import { replay } from './replay.js';

const r2 = M.round2;
const settled = (multiplier, outcome) => ({ settled: true, multiplier, outcome });
const open = (state, extraUnits = 0) => ({ settled: false, state, extraUnits });

/* ---------------- Limbo ---------------- */
const limbo = {
  rtp: () => M.LIMBO_RTP,
  params: (raw) => v.object(raw, { target: v.number({ min: 1.01, max: M.LIMBO_MAX, decimals: 2 }) }),
  start(p, rng) {
    const { point } = replay.limbo(rng.take(1));
    return settled(point >= p.target ? p.target : 0, { point });
  },
};

/* ---------------- Dice ---------------- */
const dice = {
  rtp: () => M.DICE_RTP,
  params: (raw) => v.object(raw, { chance: v.number({ min: M.DICE_MIN_CHANCE, max: M.DICE_MAX_CHANCE, decimals: 2 }), over: v.boolean() }),
  start(p, rng) {
    const { roll } = replay.dice(rng.take(1));
    const win = M.diceWins(roll, p.chance, p.over);
    return settled(win ? M.diceMultiplier(p.chance) : 0, { roll, threshold: M.diceThreshold(p.chance, p.over), multiplier: M.diceMultiplier(p.chance) });
  },
};

/* ---------------- Crash ---------------- */
const crash = {
  rtp: () => M.LIMBO_RTP,
  params: (raw) => v.object(raw, { autoCashout: v.number({ min: 0, max: M.LIMBO_MAX, decimals: 2, optional: true, default: 0 }) }),
  start(p, rng, now) {
    if (p.autoCashout && p.autoCashout < 1.01) throw bad('autoCashout must be 0 or at least 1.01');
    const { point } = replay.crash(rng.take(1));
    return open({ point, startedAt: now });
  },
  view(s) { return { startedAt: s.startedAt, elapsed: Date.now() - s.startedAt, k: M.CRASH_K }; },
  action(s, p, name, payload, rng, now) {
    const elapsed = now - s.startedAt;
    const crashAt = M.crashTimeFor(s.point);
    const autoAt = p.autoCashout ? M.crashTimeFor(p.autoCashout) : Infinity;
    if (name === 'cashout') {
      // Auto-cashout fires on the server clock even if the click arrives later.
      if (p.autoCashout && p.autoCashout < s.point && elapsed >= autoAt) return settled(p.autoCashout, { point: s.point, cashedAt: p.autoCashout, auto: true });
      const m = M.crashMultiplierAt(elapsed);
      if (elapsed >= crashAt || m >= s.point) return settled(0, { point: s.point, cashedAt: null });
      return settled(m, { point: s.point, cashedAt: m });
    }
    if (name === 'poll') {
      if (p.autoCashout && p.autoCashout < s.point && elapsed >= autoAt) return settled(p.autoCashout, { point: s.point, cashedAt: p.autoCashout, auto: true });
      if (elapsed >= crashAt) return settled(0, { point: s.point, cashedAt: null });
      return open(s);
    }
    throw bad('Unknown action');
  },
};

/* ---------------- Mines ---------------- */
const mines = {
  rtp: () => M.MINES_RTP,
  params: (raw) => v.object(raw, { mines: v.number({ min: 1, max: 24, integer: true }) }),
  start(p, rng) {
    const { layout } = replay.mines(rng.take(p.mines), p);
    return open({ layout, revealed: [] });
  },
  view(s, p) {
    const k = s.revealed.length;
    return { revealed: s.revealed, gems: k, multiplier: k ? r2(M.minesMultiplier(p.mines, k)) : 1, next: r2(M.minesMultiplier(p.mines, k + 1)), nextSafeChance: M.minesNextSafeChance(p.mines, k), total: M.MINES_CELLS - p.mines };
  },
  action(s, p, name, payload) {
    if (name === 'reveal') {
      const { index } = v.object(payload, { index: v.number({ min: 0, max: 24, integer: true }) });
      if (s.revealed.includes(index)) throw bad('Already revealed');
      if (s.layout.includes(index)) return settled(0, { layout: s.layout, revealed: s.revealed, hit: index });
      s.revealed.push(index);
      if (s.revealed.length === M.MINES_CELLS - p.mines) return settled(r2(M.minesMultiplier(p.mines, s.revealed.length)), { layout: s.layout, revealed: s.revealed, cleared: true });
      return open(s);
    }
    if (name === 'cashout') {
      if (!s.revealed.length) throw bad('Reveal at least one tile first');
      return settled(r2(M.minesMultiplier(p.mines, s.revealed.length)), { layout: s.layout, revealed: s.revealed });
    }
    throw bad('Unknown action');
  },
};

/* ---------------- Dragon Tower ---------------- */
const tower = {
  rtp: () => M.TOWER_RTP,
  params: (raw) => v.object(raw, { level: v.oneOf(Object.keys(M.TOWER_LEVELS)) }),
  start(p, rng) {
    const { layout } = replay.tower(rng.take(M.towerFloatsNeeded(p.level)), p);
    return open({ layout, row: 0, picks: [] });
  },
  view(s, p) {
    const { tiles, safe } = M.TOWER_LEVELS[p.level];
    return { row: s.row, picks: s.picks, tiles, safe, multiplier: s.row ? r2(M.towerMultiplier(p.level, s.row)) : 1, next: r2(M.towerMultiplier(p.level, s.row + 1)), ladder: Array.from({ length: M.TOWER_ROWS }, (_, i) => r2(M.towerMultiplier(p.level, i + 1))) };
  },
  action(s, p, name, payload) {
    const { tiles } = M.TOWER_LEVELS[p.level];
    if (name === 'pick') {
      const { tile } = v.object(payload, { tile: v.number({ min: 0, max: tiles - 1, integer: true }) });
      if (!s.layout[s.row].includes(tile)) return settled(0, { layout: s.layout, picks: [...s.picks, tile], row: s.row });
      s.picks.push(tile); s.row++;
      if (s.row === M.TOWER_ROWS) return settled(r2(M.towerMultiplier(p.level, s.row)), { layout: s.layout, picks: s.picks, row: s.row, cleared: true });
      return open(s);
    }
    if (name === 'cashout') {
      if (!s.row) throw bad('Climb at least one row first');
      return settled(r2(M.towerMultiplier(p.level, s.row)), { layout: s.layout, picks: s.picks, row: s.row });
    }
    throw bad('Unknown action');
  },
};

/* ---------------- HiLo ---------------- */
const hilo = {
  rtp: () => M.HILO_RTP,
  params: (raw) => v.object(raw, {}),
  start(p, rng) {
    const card = M.cardFromFloat(rng.one());
    return open({ cards: [card], multiplier: 1, steps: [], correct: 0 });
  },
  view(s) {
    const cur = s.cards[s.cards.length - 1];
    const opts = {};
    for (const c of ['higher', 'lower', 'same']) {
      const ch = M.hiloChance(cur.rank, c);
      if (ch > 0) opts[c] = { chance: ch, multiplier: r2(s.multiplier * M.hiloStepMultiplier(cur.rank, c)) };
    }
    return { card: cur, history: s.steps, multiplier: s.multiplier, correct: s.correct, options: opts, cap: M.HILO_MAX };
  },
  action(s, p, name, payload, rng) {
    const cur = s.cards[s.cards.length - 1];
    if (name === 'guess') {
      const { choice } = v.object(payload, { choice: v.oneOf(['higher', 'lower', 'same']) });
      if (M.hiloChance(cur.rank, choice) <= 0) throw bad('That guess is not available for this card');
      const next = M.cardFromFloat(rng.one());
      s.cards.push(next);
      const ok = M.hiloCorrect(cur.rank, next.rank, choice);
      s.steps.push({ from: cur, to: next, choice, ok });
      if (!ok) return settled(0, { cards: s.cards, steps: s.steps });
      s.correct++;
      s.multiplier = r2(s.multiplier * M.hiloStepMultiplier(cur.rank, choice));
      if (s.multiplier >= M.HILO_MAX) return settled(M.HILO_MAX, { cards: s.cards, steps: s.steps, capped: true });
      return open(s);
    }
    if (name === 'skip') {
      const next = M.cardFromFloat(rng.one());
      s.cards.push(next);
      s.steps.push({ from: cur, to: next, choice: 'skip', ok: true });
      return open(s);
    }
    if (name === 'cashout') {
      if (!s.correct) throw bad('Make at least one correct call first');
      return settled(s.multiplier, { cards: s.cards, steps: s.steps });
    }
    throw bad('Unknown action');
  },
};

/* ---------------- Plinko ---------------- */
const plinko = {
  rtp: (p) => M.plinkoRtp(p.risk, p.rows),
  params: (raw) => v.object(raw, { rows: v.oneOf(M.PLINKO_ROWS), risk: v.oneOf(M.PLINKO_RISKS) }),
  start(p, rng) {
    const { dirs, bin } = replay.plinko(rng.take(p.rows), p);
    return settled(M.plinkoTable(p.risk, p.rows)[bin], { dirs, bin });
  },
};

/* ---------------- Keno ---------------- */
const keno = {
  rtp: (p) => M.kenoRtp(p.risk, p.picks.length),
  params: (raw) => {
    const p = v.object(raw, { picks: v.array(v.number({ min: 0, max: M.KENO_NUMBERS - 1, integer: true }), { min: 1, max: 10 }), risk: v.oneOf(M.KENO_RISKS) });
    if (new Set(p.picks).size !== p.picks.length) throw bad('picks must be distinct');
    return p;
  },
  start(p, rng) {
    const { draw } = replay.keno(rng.take(M.KENO_DRAWN));
    const hits = p.picks.filter((n) => draw.includes(n)).length;
    return settled(M.kenoTable(p.risk, p.picks.length)[hits], { draw, hits });
  },
};

/* ---------------- Video Poker (9/6 Jacks or Better) ---------------- */
const videopoker = {
  rtp: () => M.VP_RTP_OPTIMAL,
  params: (raw) => v.object(raw, {}),
  start(p, rng) {
    const initial = M.dealDistinct(rng.take(5), 5);
    return open({ initial });
  },
  view(s) { return { hand: s.initial.map(M.cardOf), paytable: M.VP_PAYTABLE }; },
  action(s, p, name, payload, rng) {
    if (name !== 'draw') throw bad('Unknown action');
    const { hold } = v.object(payload, { hold: v.array(v.boolean(), { min: 5, max: 5 }) });
    const n = hold.filter((x) => !x).length;
    const fresh = n ? M.dealDistinct(rng.take(n), n, s.initial) : [];
    let j = 0;
    const final = s.initial.map((c, i) => (hold[i] ? c : fresh[j++]));
    const rank = M.evaluatePoker(final.map(M.cardOf));
    return settled(M.vpPayout(rank), { initial: s.initial, hold, final, rank });
  },
};

/* ---------------- Blackjack ---------------- */
const draw = (s, rng) => { const c = M.cardFromFloat(rng.one()); s.cards.push(c); return c; };
const blackjack = {
  rtp: () => M.BJ_RTP,
  params: (raw) => v.object(raw, {}),
  start(p, rng) {
    const s = { cards: [], dealer: [], hands: [{ cards: [], stake: 1, done: false, doubled: false, split: false }], active: 0, phase: 'play', insurance: 0, result: null };
    s.hands[0].cards.push(draw(s, rng)); s.dealer.push(draw(s, rng)); s.hands[0].cards.push(draw(s, rng)); s.dealer.push(draw(s, rng));
    if (s.dealer[0].rank === 1) { s.phase = 'insurance'; return open(s); }
    return this.afterPeek(s);
  },
  afterPeek(s) {
    const dealerBJ = M.bjIsBlackjack(s.dealer);
    const playerBJ = M.bjIsBlackjack(s.hands[0].cards);
    if (dealerBJ) {
      const units = (playerBJ ? 1 : 0) + (s.insurance ? s.insurance * 3 : 0);
      return this.finish(s, units, playerBJ ? 'push' : 'dealer_blackjack');
    }
    if (playerBJ) return this.finish(s, 2.5, 'blackjack');
    s.phase = 'play';
    return open(s);
  },
  finish(s, units, reason) {
    s.phase = 'settled';
    const totalUnits = s.hands.reduce((a, h) => a + h.stake, 0) + s.insurance;
    s.result = { payoutUnits: units, stakeUnits: totalUnits, reason };
    return { settled: true, multiplierUnits: units, outcome: { cards: s.cards, dealer: s.dealer, hands: s.hands, insurance: s.insurance, result: s.result } };
  },
  view(s) {
    const hideHole = s.phase !== 'settled';
    const dealer = hideHole ? [s.dealer[0]] : s.dealer;
    return {
      phase: s.phase, dealer, dealerTotal: hideHole ? M.bjValue(s.dealer[0].rank) : M.bjTotal(s.dealer).total,
      hands: s.hands.map((h) => ({ cards: h.cards, total: M.bjTotal(h.cards).total, soft: M.bjTotal(h.cards).soft, stake: h.stake, done: h.done, doubled: h.doubled, split: h.split })),
      active: s.active, insurance: s.insurance,
      can: this.allowed(s),
    };
  },
  allowed(s) {
    if (s.phase !== 'play') return [];
    const h = s.hands[s.active];
    if (!h || h.done) return [];
    const out = ['hit', 'stand'];
    if (h.cards.length === 2 && !h.doubled) out.push('double');
    if (h.cards.length === 2 && s.hands.length === 1 && M.bjValue(h.cards[0].rank) === M.bjValue(h.cards[1].rank)) out.push('split');
    return out;
  },
  advance(s, rng) {
    const next = s.hands.findIndex((h) => !h.done);
    if (next >= 0) { s.active = next; return open(s); }
    // dealer plays only if someone is still standing
    if (s.hands.some((h) => M.bjTotal(h.cards).total <= 21)) {
      while (M.bjTotal(s.dealer).total < 17) s.dealer.push(draw(s, rng));
    }
    const d = M.bjTotal(s.dealer).total;
    let units = 0;
    for (const h of s.hands) {
      const t = M.bjTotal(h.cards).total;
      if (t > 21) continue;
      if (d > 21 || t > d) units += 2 * h.stake;
      else if (t === d) units += h.stake;
    }
    return this.finish(s, units, 'showdown');
  },
  action(s, p, name, payload, rng) {
    if (s.phase === 'insurance') {
      if (name !== 'insurance') throw bad('Answer the insurance offer first');
      const { take } = v.object(payload, { take: v.boolean() });
      if (take) { s.insurance = 0.5; const r = this.afterPeek(s); r.extraUnits = 0.5; return r; }
      return this.afterPeek(s);
    }
    if (!this.allowed(s).includes(name)) throw bad('That action is not available');
    const h = s.hands[s.active];
    if (name === 'hit') {
      h.cards.push(draw(s, rng));
      if (M.bjTotal(h.cards).total >= 21) h.done = true;
      return this.advance(s, rng);
    }
    if (name === 'stand') { h.done = true; return this.advance(s, rng); }
    if (name === 'double') {
      h.stake = 2; h.doubled = true; h.cards.push(draw(s, rng)); h.done = true;
      const r = this.advance(s, rng); r.extraUnits = 1; return r;
    }
    if (name === 'split') {
      const [a, b] = h.cards;
      const aces = a.rank === 1;
      s.hands = [{ cards: [a], stake: 1, done: false, doubled: false, split: true }, { cards: [b], stake: 1, done: false, doubled: false, split: true }];
      s.hands[0].cards.push(draw(s, rng)); s.hands[1].cards.push(draw(s, rng));
      if (aces) s.hands.forEach((x) => (x.done = true));
      else s.hands.forEach((x) => { if (M.bjTotal(x.cards).total === 21) x.done = true; });
      const r = this.advance(s, rng); r.extraUnits = 1; return r;
    }
    throw bad('Unknown action');
  },
};

export const GAMES = { limbo, dice, crash, mines, tower, hilo, plinko, keno, videopoker, blackjack };
export const GAME_IDS = Object.keys(GAMES);
export const isInteractive = (id) => typeof GAMES[id].action === 'function';

/* ======================= second wave ======================= */
/* ---------------- Chicken / Pump: ordered hazard track ---------------- */
function trackGame(levels, { stepAction, unit, bustKey }) {
  return {
    rtp: () => M.TRACK_RTP,
    params: (raw) => v.object(raw, { level: v.oneOf(Object.keys(levels)) }),
    start(p, rng) {
      const hazards = levels[p.level].hazards;
      const layout = M.trackLayout(rng.take(hazards), hazards);
      return open({ layout, k: 0 });
    },
    view(s, p) {
      const hazards = levels[p.level].hazards;
      return { [unit]: s.k, hazards, total: M.TRACK_LEN, safe: M.TRACK_LEN - hazards, multiplier: s.k ? r2(M.trackMultiplier(hazards, s.k)) : 1, next: r2(M.trackMultiplier(hazards, s.k + 1)), nextSafeChance: M.trackNextSafeChance(hazards, s.k), ladder: Array.from({ length: M.TRACK_LEN - hazards }, (_, i) => r2(M.trackMultiplier(hazards, i + 1))) };
    },
    action(s, p, name) {
      const hazards = levels[p.level].hazards;
      if (name === stepAction) {
        const lane = s.k; // the next position on the track is index k
        if (s.layout.includes(lane)) return settled(0, { layout: s.layout, [unit]: s.k, [bustKey]: lane });
        s.k++;
        if (s.k === M.TRACK_LEN - hazards) return settled(r2(M.trackMultiplier(hazards, s.k)), { layout: s.layout, [unit]: s.k, cleared: true });
        return open(s);
      }
      if (name === 'cashout') {
        if (!s.k) throw bad('Take at least one step first');
        return settled(r2(M.trackMultiplier(hazards, s.k)), { layout: s.layout, [unit]: s.k });
      }
      throw bad('Unknown action');
    },
  };
}
const chicken = trackGame(M.CHICKEN_LEVELS, { stepAction: 'step', unit: 'lane', bustKey: 'hit' });
const pump = trackGame(M.PUMP_LEVELS, { stepAction: 'pump', unit: 'pumps', bustKey: 'popped' });

/* ---------------- Flip: call heads or tails, 1.98x per correct call ---------------- */
const flip = {
  rtp: () => 0.99,
  params: (raw) => v.object(raw, {}),
  start() { return open({ flips: [], multiplier: 1 }); },
  view(s) { return { flips: s.flips, multiplier: s.multiplier, correct: s.flips.length, next: r2(s.multiplier * M.CHAIN_STEP), cap: M.CHAIN_CAP }; },
  action(s, p, name, payload, rng) {
    if (name === 'flip') {
      const { choice } = v.object(payload, { choice: v.oneOf(['heads', 'tails']) });
      const result = M.flipOutcome(rng.one());
      const ok = result === choice;
      s.flips.push({ choice, result, ok });
      if (!ok) return settled(0, { flips: s.flips });
      s.multiplier = r2(s.multiplier * M.CHAIN_STEP);
      if (s.multiplier >= M.CHAIN_CAP) return settled(M.CHAIN_CAP, { flips: s.flips, capped: true });
      return open(s);
    }
    if (name === 'cashout') { if (!s.flips.length) throw bad('Flip at least once first'); return settled(s.multiplier, { flips: s.flips }); }
    throw bad('Unknown action');
  },
};

/* ---------------- Rock Paper Scissors: win 1.98x per round, ties are free ---------------- */
const rps = {
  rtp: () => 0.99,
  params: (raw) => v.object(raw, {}),
  start() { return open({ rounds: [], multiplier: 1, wins: 0 }); },
  view(s) { return { rounds: s.rounds, multiplier: s.multiplier, wins: s.wins, next: r2(s.multiplier * M.CHAIN_STEP), cap: M.CHAIN_CAP }; },
  action(s, p, name, payload, rng) {
    if (name === 'throw') {
      const { choice } = v.object(payload, { choice: v.oneOf(M.RPS) });
      const house = M.rpsOutcome(rng.one());
      const result = M.rpsResult(choice, house);
      s.rounds.push({ pick: choice, house, result });
      if (result === 'lose') return settled(0, { rounds: s.rounds });
      if (result === 'win') { s.wins++; s.multiplier = r2(s.multiplier * M.CHAIN_STEP); if (s.multiplier >= M.CHAIN_CAP) return settled(M.CHAIN_CAP, { rounds: s.rounds, capped: true }); }
      return open(s);
    }
    if (name === 'cashout') { if (!s.wins) throw bad('Win at least one throw first'); return settled(s.multiplier, { rounds: s.rounds }); }
    throw bad('Unknown action');
  },
};

/* ---------------- Slide: Limbo on a strip ---------------- */
const slide = {
  rtp: () => M.LIMBO_RTP,
  params: (raw) => v.object(raw, { target: v.number({ min: 1.01, max: M.LIMBO_MAX, decimals: 2 }) }),
  start(p, rng) { const { point } = replay.slide(rng.take(1)); return settled(point >= p.target ? p.target : 0, { point }); },
};

/* ---------------- Wheel ---------------- */
const wheel = {
  rtp: (p) => M.wheelRtp(p.risk, p.segments),
  params: (raw) => v.object(raw, { segments: v.oneOf(M.WHEEL_SEGMENTS), risk: v.oneOf(M.WHEEL_RISKS) }),
  start(p, rng) { const { index } = replay.wheel(rng.take(1), p); const table = M.wheelTable(p.risk, p.segments); return settled(table[index], { index, multiplier: table[index] }); },
};

/* ---------------- Baccarat ---------------- */
const baccarat = {
  rtp: (p) => M.BACCARAT_RTP[p.bet],
  params: (raw) => v.object(raw, { bet: v.oneOf(['player', 'banker', 'tie']) }),
  start(p, rng) {
    const dealt = [];
    const coup = M.baccaratCoup(() => { const c = M.cardFromFloat(rng.one()); dealt.push(c); return c; });
    let mult = 0;
    if (coup.winner === p.bet) mult = M.BACCARAT_PAYOUT[p.bet];
    else if (coup.winner === 'tie') mult = 1; // player/banker bets push on a tie
    return settled(mult, { ...coup, dealt });
  },
};

/* ---------------- Roulette (one bet per spin) ---------------- */
const roulette = {
  rtp: () => M.ROULETTE_RTP,
  params: (raw) => {
    const p = v.object(raw, { bet: v.oneOf(M.ROULETTE_BETS), value: v.number({ min: 0, max: 36, integer: true, optional: true, default: 0 }) });
    if ((p.bet === 'dozen' || p.bet === 'column') && (p.value < 1 || p.value > 3)) throw bad('value must be 1, 2 or 3');
    return p;
  },
  start(p, rng) { const { number } = replay.roulette(rng.take(1)); return settled(M.roulettePayout(p.bet, p.value, number), { number, red: M.ROULETTE_RED.has(number) }); },
};

/* ---------------- Diamonds ---------------- */
const diamonds = {
  rtp: () => M.diamondsRtp(),
  params: (raw) => v.object(raw, {}),
  start(p, rng) { const { colours } = replay.diamonds(rng.take(5)); const hand = M.diamondHand(colours); return settled(M.DIAMOND_PAYTABLE[hand], { colours, hand }); },
};

Object.assign(GAMES, { chicken, pump, flip, rps, slide, wheel, baccarat, roulette, diamonds });
GAME_IDS.push('chicken', 'pump', 'flip', 'rps', 'slide', 'wheel', 'baccarat', 'roulette', 'diamonds');
