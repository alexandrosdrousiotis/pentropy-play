import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../shared/math.js';
import { FairRng } from '../server/fairness.js';
import { mulberry32 } from '../public/js/verify-rng.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);

test('Limbo/Crash: P(point ≥ t) = 0.99/t, so every target pays 99%', () => {
  for (const t of [1.01, 1.5, 2, 10, 100, 1000]) {
    const rtp = M.limboWinChance(t) * t;
    close(rtp, 0.99, 1e-9, `target ${t}`);
  }
  assert.equal(M.crashPoint(0), 1);
  assert.equal(M.crashPoint(0.5), 1.98);
  assert.equal(M.crashPoint(1 - 1e-12), M.LIMBO_MAX);
  // exact enumeration over a fine grid of u
  const N = 200000; let wins = 0; const t = 2;
  for (let i = 0; i < N; i++) if (M.crashPoint((i + 0.5) / N) >= t) wins++;
  close((wins / N) * t, 0.99, 0.002, 'grid RTP at 2x');
});

test('Dice: exactly 10,000 outcomes, win count = 100·chance, RTP 99% for every chance', () => {
  for (const chance of [0.01, 1, 33.33, 49.5, 50, 98]) {
    for (const over of [true, false]) {
      let wins = 0;
      for (let i = 0; i < 10000; i++) if (M.diceWins(i / 100, chance, over)) wins++;
      assert.equal(wins, Math.round(chance * 100), `wins for ${chance}% ${over ? 'over' : 'under'}`);
      close((wins / 10000) * M.diceMultiplier(chance), 0.99, 0.0005, `rtp ${chance}`);
    }
  }
  assert.equal(M.diceMultiplier(0.01), 9900);
});

test('Mines: multiplier × P(survive) = 0.99; ceiling 5,148,297x', () => {
  for (const mines of [1, 3, 5, 12, 24]) {
    for (let gems = 1; gems <= 25 - mines; gems++) {
      const pSurvive = M.choose(25 - mines, gems) / M.choose(25, gems);
      close(pSurvive * M.minesMultiplier(mines, gems), 0.99, 1e-9, `m=${mines} g=${gems}`);
    }
  }
  assert.equal(Math.round(M.minesMultiplier(12, 13)), 5148297);
  assert.equal(Math.round(M.minesMultiplier(13, 12)), 5148297);
});

test('Dragon Tower: 98% at every rung, Master ceiling 256,901x', () => {
  for (const level of Object.keys(M.TOWER_LEVELS)) {
    const { tiles, safe } = M.TOWER_LEVELS[level];
    for (let r = 1; r <= 9; r++) close((safe / tiles) ** r * M.towerMultiplier(level, r), 0.98, 1e-9, `${level} r=${r}`);
  }
  assert.equal(Math.floor(M.towerMultiplier('master', 9)), 256901);
});

test('HiLo: each step pays 99% of fair odds', () => {
  for (let rank = 1; rank <= 13; rank++) for (const c of ['higher', 'lower', 'same']) {
    const p = M.hiloChance(rank, c);
    if (p > 0) close(p * M.hiloStepMultiplier(rank, c), 0.99, 1e-9, `${rank} ${c}`);
  }
  assert.equal(M.hiloChance(1, 'lower'), 0);
  assert.equal(M.hiloChance(13, 'higher'), 0);
});

test('Plinko: every table is 2dp, symmetric, and pays 99% ± 0.05%; 16-row high ceiling is 10,000x', () => {
  for (const risk of M.PLINKO_RISKS) for (const rows of M.PLINKO_ROWS) {
    const t = M.plinkoTable(risk, rows);
    assert.equal(t.length, rows + 1);
    t.forEach((m, k) => { assert.equal(m, M.round2(m), `2dp ${risk} ${rows} bin ${k}`); assert.equal(m, t[rows - k], 'symmetric'); });
    close(M.plinkoRtp(risk, rows), 0.99, 0.0005, `${risk} ${rows}`);
  }
  assert.equal(M.plinkoTable('high', 16)[0], 10000);
});

test('Keno: every table is 2dp and pays 99% ± 0.05%; ceiling 1,000x', () => {
  for (const risk of M.KENO_RISKS) for (let picks = 1; picks <= 10; picks++) {
    const t = M.kenoTable(risk, picks);
    t.forEach((m) => assert.equal(m, M.round2(m)));
    close(M.kenoRtp(risk, picks), 0.99, 0.0005, `${risk} ${picks}`);
    assert.ok(Math.max(...t) <= 1000);
  }
  assert.equal(M.kenoTable('classic', 10)[10], 1000);
  // hypergeometric sums to 1
  for (let p = 1; p <= 10; p++) close(Array.from({ length: p + 1 }, (_, h) => M.hypergeometric(p, h)).reduce((a, b) => a + b, 0), 1, 1e-9, 'probs');
});

test('Video Poker: hand evaluator', () => {
  const c = (rank, suit) => ({ rank, suit });
  assert.equal(M.evaluatePoker([c(1, 0), c(10, 0), c(11, 0), c(12, 0), c(13, 0)]), 'Royal Flush');
  assert.equal(M.evaluatePoker([c(5, 1), c(6, 1), c(7, 1), c(8, 1), c(9, 1)]), 'Straight Flush');
  assert.equal(M.evaluatePoker([c(5, 0), c(5, 1), c(5, 2), c(5, 3), c(9, 1)]), 'Four of a Kind');
  assert.equal(M.evaluatePoker([c(5, 0), c(5, 1), c(5, 2), c(9, 3), c(9, 1)]), 'Full House');
  assert.equal(M.evaluatePoker([c(2, 2), c(5, 2), c(7, 2), c(9, 2), c(13, 2)]), 'Flush');
  assert.equal(M.evaluatePoker([c(1, 0), c(2, 1), c(3, 2), c(4, 3), c(5, 1)]), 'Straight');
  assert.equal(M.evaluatePoker([c(5, 0), c(5, 1), c(5, 2), c(8, 3), c(9, 1)]), 'Three of a Kind');
  assert.equal(M.evaluatePoker([c(5, 0), c(5, 1), c(8, 2), c(8, 3), c(9, 1)]), 'Two Pair');
  assert.equal(M.evaluatePoker([c(11, 0), c(11, 1), c(2, 2), c(8, 3), c(9, 1)]), 'Jacks or Better');
  assert.equal(M.evaluatePoker([c(10, 0), c(10, 1), c(2, 2), c(8, 3), c(9, 1)]), null);
  assert.equal(M.vpPayout('Royal Flush'), 800);
});

test('Blackjack: totals and naturals', () => {
  const c = (rank) => ({ rank, suit: 0 });
  assert.deepEqual(M.bjTotal([c(1), c(13)]), { total: 21, soft: true });
  assert.deepEqual(M.bjTotal([c(1), c(1), c(9)]), { total: 21, soft: true });
  assert.deepEqual(M.bjTotal([c(10), c(6), c(9)]), { total: 25, soft: false });
  assert.ok(M.bjIsBlackjack([c(1), c(12)]));
  assert.ok(!M.bjIsBlackjack([c(7), c(7), c(7)]));
});

test('RNG: deterministic, uniform-ish, and the browser verifier uses the same construction', async () => {
  const a = new FairRng('server', 'client', 7).take(20);
  const b = new FairRng('server', 'client', 7).take(20);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, new FairRng('server', 'client', 8).take(20));
  const skipped = new FairRng('server', 'client', 7, 5).take(15);
  assert.deepEqual(skipped, a.slice(5));
  const { replayFloats } = await import('../public/js/verify-rng.js');
  assert.deepEqual(await replayFloats('server', 'client', 7, 20), a);
  // crude uniformity: mean of 50k floats
  const rng = new FairRng('s', 'c', 0); let sum = 0; const N = 50000;
  for (const f of rng.take(N)) sum += f;
  close(sum / N, 0.5, 0.01, 'mean');
  assert.equal(typeof mulberry32(1)(), 'number');
});

test('Monte Carlo sanity: 200k Limbo bets at 2x return ≈ 99%', () => {
  const rng = new FairRng('mc', 'mc', 0); let ret = 0; const N = 200000;
  for (const u of rng.take(N)) if (M.crashPoint(u) >= 2) ret += 2;
  close(ret / N, 0.99, 0.01, 'limbo mc');
});
