// Pure game mathematics shared by the games, the verifier and the tests.

export function choose(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

export const round2 = (x) => Math.round(x * 100) / 100;
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Pick `k` distinct indices out of `n` using a float stream (partial Fisher–Yates). */
export function drawDistinct(floats, n, k) {
  const pool = Array.from({ length: n }, (_, i) => i);
  const out = [];
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(floats[i] * (n - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
    out.push(pool[i]);
  }
  return out;
}

/* ---------------- Limbo / Crash ---------------- */
export const LIMBO_RTP = 0.99;
export const LIMBO_MAX = 1_000_000;
/** Shared crash-point formula: 1% of rounds bust at 1.00x; P(result >= t) = 0.99/t. */
export function crashPoint(u) {
  const raw = LIMBO_RTP / (1 - u);
  return Math.min(LIMBO_MAX, Math.max(1, Math.floor(raw * 100) / 100));
}
export const limboWinChance = (target) => Math.min(1, LIMBO_RTP / target);

/* ---------------- Dice ---------------- */
export const DICE_RTP = 0.99;
export const DICE_MIN_CHANCE = 0.01;
export const DICE_MAX_CHANCE = 98;
/** Roll in {0.00 … 99.99}, 10,000 equally likely outcomes. */
export const diceRoll = (u) => Math.floor(u * 10000) / 100;
export const diceMultiplier = (chance) => round2((DICE_RTP * 100) / chance);
export const diceChanceFromMultiplier = (m) => clamp(round2((DICE_RTP * 100) / m), DICE_MIN_CHANCE, DICE_MAX_CHANCE);
export function diceThreshold(chance, over) {
  return over ? round2(100 - chance) : round2(chance);
}
export function diceWins(roll, chance, over) {
  const t = diceThreshold(chance, over);
  return over ? roll >= t - 1e-9 : roll < t - 1e-9;
}

/* ---------------- Mines ---------------- */
export const MINES_RTP = 0.99;
export const MINES_CELLS = 25;
export function minesMultiplier(mines, gems) {
  if (gems === 0) return 1;
  return MINES_RTP * (choose(MINES_CELLS, gems) / choose(MINES_CELLS - mines, gems));
}
export const minesNextSafeChance = (mines, gems) => (MINES_CELLS - mines - gems) / (MINES_CELLS - gems);
export const minesLayout = (floats, mines) => drawDistinct(floats, MINES_CELLS, mines);

/* ---------------- Dragon Tower ---------------- */
export const TOWER_RTP = 0.98;
export const TOWER_ROWS = 9;
export const TOWER_LEVELS = {
  easy: { label: 'Easy', tiles: 4, safe: 3 },
  medium: { label: 'Medium', tiles: 3, safe: 2 },
  hard: { label: 'Hard', tiles: 2, safe: 1 },
  expert: { label: 'Expert', tiles: 3, safe: 1 },
  master: { label: 'Master', tiles: 4, safe: 1 },
};
export function towerMultiplier(level, rows) {
  const { tiles, safe } = TOWER_LEVELS[level];
  return TOWER_RTP * (tiles / safe) ** rows;
}
/** Which tiles are eggs on each row, given 9 * (tiles-1) floats at most. */
export function towerLayout(floats, level) {
  const { tiles, safe } = TOWER_LEVELS[level];
  const rows = [];
  let f = 0;
  for (let r = 0; r < TOWER_ROWS; r++) {
    rows.push(drawDistinct(floats.slice(f, f + safe), tiles, safe).sort((a, b) => a - b));
    f += safe;
  }
  return rows;
}
export const towerFloatsNeeded = (level) => TOWER_ROWS * TOWER_LEVELS[level].safe;

/* ---------------- HiLo ---------------- */
export const HILO_RTP = 0.99;
export const HILO_MAX = 100_000;
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUITS = ['♠', '♥', '♦', '♣'];
/** Infinite deck: one float → card {rank 1..13, suit 0..3}. */
export function cardFromFloat(u) {
  const i = Math.floor(u * 52);
  return { rank: (i % 13) + 1, suit: Math.floor(i / 13) };
}
export function hiloChance(rank, choice) {
  if (choice === 'higher') return (13 - rank) / 13;
  if (choice === 'lower') return (rank - 1) / 13;
  return 1 / 13; // same
}
export const hiloStepMultiplier = (rank, choice) => HILO_RTP / hiloChance(rank, choice);
export function hiloCorrect(prev, next, choice) {
  if (choice === 'higher') return next > prev;
  if (choice === 'lower') return next < prev;
  return next === prev;
}

/** Adjust `table[idx]` entries in 0.01 steps (symmetric pairs for Plinko) until Σ p·m is as close to `target` as possible. */
function nudgeToTarget(table, probs, idx, target) {
  const rtpOf = (t) => t.reduce((a, m, k) => a + m * probs[k], 0);
  for (let iter = 0; iter < 5000; iter++) {
    const cur = Math.abs(rtpOf(table) - target);
    let bestIdx = -1, bestDev = cur, bestVal = 0;
    for (const k of idx) {
      for (const dir of [0.01, -0.01]) {
        const trial = [...table];
        const v = round2(trial[k] + dir);
        if (v < 0.01) continue;
        trial[k] = v;
        const mirror = table.length - 1 - k;
        if (idx.includes(mirror) && mirror !== k && probs[mirror] === probs[k]) trial[mirror] = v;
        const dev = Math.abs(rtpOf(trial) - target);
        if (dev < bestDev - 1e-12) { bestDev = dev; bestIdx = k; bestVal = v; }
      }
    }
    if (bestIdx < 0) break;
    table[bestIdx] = bestVal;
    const mirror = table.length - 1 - bestIdx;
    if (idx.includes(mirror) && mirror !== bestIdx && probs[mirror] === probs[bestIdx]) table[mirror] = bestVal;
  }
  return table;
}

/* ---------------- Plinko ---------------- */
export const PLINKO_RTP = 0.99;
export const PLINKO_ROWS = [8, 9, 10, 11, 12, 13, 14, 15, 16];
export const PLINKO_RISKS = ['low', 'medium', 'high'];
// Edge-bin multipliers; interior bins are solved so the table pays exactly 99%.
const PLINKO_EDGE = {
  low: { 8: 5.6, 9: 5.6, 10: 8.9, 11: 8.4, 12: 10, 13: 8.1, 14: 7.1, 15: 15, 16: 16 },
  medium: { 8: 13, 9: 18, 10: 22, 11: 24, 12: 33, 13: 43, 14: 58, 15: 88, 16: 110 },
  high: { 8: 50, 9: 90, 10: 160, 11: 300, 12: 560, 13: 1000, 14: 2000, 15: 4500, 16: 10000 },
};
const PLINKO_CURVE = { low: 2.1, medium: 2.4, high: 3.0 };
export function binomialProbs(n) {
  const total = 2 ** n;
  return Array.from({ length: n + 1 }, (_, k) => choose(n, k) / total);
}
const plinkoCache = new Map();
export function plinkoTable(risk, rows) {
  const key = `${risk}:${rows}`;
  if (plinkoCache.has(key)) return plinkoCache.get(key);
  const probs = binomialProbs(rows);
  const edge = PLINKO_EDGE[risk][rows];
  const g = PLINKO_CURVE[risk];
  const half = rows / 2;
  const shape = probs.map((_, k) => Math.exp(Math.log(edge) * (Math.abs(k - half) / half) ** g));
  let interiorMass = 0;
  for (let k = 1; k < rows; k++) interiorMass += probs[k] * shape[k];
  const s = (PLINKO_RTP - 2 * probs[0] * edge) / interiorMass;
  const table = shape.map((v, k) => (k === 0 || k === rows ? edge : Math.max(0.1, round2(v * s))));
  // Every multiplier is a 2-decimal figure, exactly as displayed. Greedily nudge interior bins in 0.01
  // steps until the table's true RTP is as close to 99% as 2dp allows, then publish that true RTP.
  const interior = probs.map((_, k) => k).filter((k) => k > 0 && k < rows);
  const best = nudgeToTarget(table, probs, interior, PLINKO_RTP);
  plinkoCache.set(key, best);
  return best;
}
export const plinkoRtp = (risk, rows) => { const p = binomialProbs(rows); return plinkoTable(risk, rows).reduce((a, m, k) => a + m * p[k], 0); };
export function plinkoPath(floats, rows) {
  const dirs = floats.slice(0, rows).map((u) => (u < 0.5 ? 0 : 1));
  return { dirs, bin: dirs.reduce((a, b) => a + b, 0) };
}

/* ---------------- Keno ---------------- */
export const KENO_RTP = 0.99;
export const KENO_NUMBERS = 40;
export const KENO_DRAWN = 10;
export const KENO_RISKS = ['classic', 'low', 'medium', 'high'];
export function hypergeometric(picks, hits) {
  return (choose(KENO_DRAWN, hits) * choose(KENO_NUMBERS - KENO_DRAWN, picks - hits)) / choose(KENO_NUMBERS, picks);
}
// Each risk level: minimum hits that pay (as a fraction of picks) and the growth per extra hit.
const KENO_SHAPE = {
  classic: { minFrac: 0.3, growth: 3.2, cap: 1000 },
  low: { minFrac: 0.2, growth: 2.2, cap: 100 },
  medium: { minFrac: 0.4, growth: 4.0, cap: 1000 },
  high: { minFrac: 0.5, growth: 6.5, cap: 1000 },
};
const kenoCache = new Map();
export function kenoTable(risk, picks) {
  const key = `${risk}:${picks}`;
  if (kenoCache.has(key)) return kenoCache.get(key);
  const { minFrac, growth, cap } = KENO_SHAPE[risk];
  const probs = Array.from({ length: picks + 1 }, (_, h) => hypergeometric(picks, h));
  const minHits = Math.max(1, Math.ceil(picks * minFrac));
  const weights = probs.map((_, h) => (h < minHits ? 0 : growth ** (h - minHits)));
  // bisection on the scale so that Σ p(h)·min(s·w(h), cap) = RTP
  const rtpAt = (s) => probs.reduce((a, p, h) => a + p * Math.min(cap, s * weights[h]), 0);
  let lo = 0, hi = 1e9;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (rtpAt(mid) < KENO_RTP) lo = mid; else hi = mid;
  }
  const s = (lo + hi) / 2;
  const table = weights.map((w) => Math.min(cap, round2(s * w)));
  const paying = probs.map((_, h) => h).filter((h) => h >= minHits && table[h] < cap);
  nudgeToTarget(table, probs, paying, KENO_RTP);
  kenoCache.set(key, table);
  return table;
}
export const kenoRtp = (risk, picks) => kenoTable(risk, picks).reduce((a, m, h) => a + m * hypergeometric(picks, h), 0);
export const kenoDraw = (floats) => drawDistinct(floats, KENO_NUMBERS, KENO_DRAWN);

/* ---------------- Video Poker (9/6 Jacks or Better) ---------------- */
export const VP_PAYTABLE = [
  ['Royal Flush', 800], ['Straight Flush', 50], ['Four of a Kind', 25], ['Full House', 9], ['Flush', 6],
  ['Straight', 4], ['Three of a Kind', 3], ['Two Pair', 2], ['Jacks or Better', 1],
];
export const VP_RTP_OPTIMAL = 0.9954;
/** Deal from a real 52-card deck: returns `count` distinct card indices (0..51). */
export const dealDistinct = (floats, count, exclude = []) => {
  const pool = [];
  for (let i = 0; i < 52; i++) if (!exclude.includes(i)) pool.push(i);
  const idx = drawDistinct(floats, pool.length, count);
  return idx.map((i) => pool[i]);
};
export const cardOf = (i) => ({ rank: (i % 13) + 1, suit: Math.floor(i / 13), id: i });
export function evaluatePoker(cards) {
  const ranks = cards.map((c) => c.rank).sort((a, b) => a - b);
  const suits = cards.map((c) => c.suit);
  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const groups = Object.values(counts).sort((a, b) => b - a);
  const flush = suits.every((s) => s === suits[0]);
  const uniq = [...new Set(ranks)];
  const wheel = uniq.length === 5 && ranks.join() === '1,10,11,12,13';
  const straight = uniq.length === 5 && (ranks[4] - ranks[0] === 4 || wheel);
  if (straight && flush && wheel) return 'Royal Flush';
  if (straight && flush) return 'Straight Flush';
  if (groups[0] === 4) return 'Four of a Kind';
  if (groups[0] === 3 && groups[1] === 2) return 'Full House';
  if (flush) return 'Flush';
  if (straight) return 'Straight';
  if (groups[0] === 3) return 'Three of a Kind';
  if (groups[0] === 2 && groups[1] === 2) return 'Two Pair';
  if (groups[0] === 2) {
    const pairRank = Number(Object.keys(counts).find((r) => counts[r] === 2));
    if (pairRank === 1 || pairRank >= 11) return 'Jacks or Better';
  }
  return null;
}
export const vpPayout = (name) => (VP_PAYTABLE.find(([n]) => n === name) || [null, 0])[1];

/* ---------------- Blackjack ---------------- */
export const BJ_RTP = 0.9943;
export const bjValue = (rank) => (rank === 1 ? 11 : Math.min(10, rank));
export function bjTotal(cards) {
  let total = 0, aces = 0;
  for (const c of cards) { total += bjValue(c.rank); if (c.rank === 1) aces++; }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}
export const bjIsBlackjack = (cards) => cards.length === 2 && bjTotal(cards).total === 21;

/* ---------------- Expectation helpers ---------------- */
export const expectedLoss = (stake, rtp) => stake * (1 - rtp);
export const fmtMult = (m) => (m >= 1000 ? Math.round(m).toLocaleString() : m >= 100 ? m.toFixed(1) : m.toFixed(2)) + 'x';

/* ---------------- Crash timing (server-authoritative) ---------------- */
export const CRASH_K = 0.12; // multiplier = e^(k·seconds): 2x ≈ 5.8s, 10x ≈ 19s, 100x ≈ 38s
export const crashMultiplierAt = (ms) => Math.max(1, Math.floor(Math.exp(CRASH_K * (ms / 1000)) * 100) / 100);
export const crashTimeFor = (mult) => (Math.log(mult) / CRASH_K) * 1000;
