import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../shared/math.js';
import { GAMES, GAME_IDS } from '../shared/engine.js';
import { FairRng } from '../server/fairness.js';
import { replayRound, canonicalOutcome, floatsAtStart } from '../shared/replay.js';
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const rngFor = (n, skip = 0) => new FairRng('w2', 'c', n, skip);

test('catalog has 19 games', () => { assert.equal(GAME_IDS.length, 19); for (const id of GAME_IDS) assert.ok(GAMES[id]); });

test('Chicken and Pump: track multipliers pay 99% at every step; ceilings', () => {
  for (const h of [1, 3, 5, 10]) for (let k = 1; k <= 25 - h; k++) close((M.choose(25 - h, k) / M.choose(25, k)) * M.trackMultiplier(h, k), 0.99, 1e-9, `h=${h} k=${k}`);
  assert.equal(Math.round(M.trackMultiplier(10, 15)), 3236072);
  const g = GAMES.chicken; const p = g.params({ level: 'hard' });
  const rng = rngFor(1); const { state } = g.start(p, rng, 0);
  let r; for (let i = 0; i < 25; i++) { r = g.action(state, p, 'step', {}, rng); if (r.settled) break; }
  assert.ok(r.settled);
  assert.deepEqual(replayRound('chicken', rngFor(1).take(5), p, r.outcome), canonicalOutcome('chicken', r.outcome));
  assert.throws(() => GAMES.pump.params({ level: 'daredevil' }), /one of/);
});

test('Flip and RPS: 1.98 per 50/50 step, ties free, cap 100,000x', () => {
  close(0.5 * M.CHAIN_STEP, 0.99, 1e-9, 'flip ev');
  const g = GAMES.flip; const rng = rngFor(2); const { state } = g.start({}, rng, 0);
  let r = g.action(state, {}, 'flip', { choice: 'heads' }, rng);
  assert.deepEqual(replayRound('flip', rngFor(2).take(rng.used), {}, r.settled ? r.outcome : { flips: state.flips }), canonicalOutcome('flip', r.settled ? r.outcome : { flips: state.flips }));
  const s2 = { rounds: [], multiplier: 1, wins: 0 };
  const rr = GAMES.rps.action(s2, {}, 'throw', { choice: 'rock' }, rngFor(3));
  const last = s2.rounds[0];
  if (last.result === 'tie') { assert.equal(rr.settled, false); assert.equal(s2.multiplier, 1); }
  if (last.result === 'win') assert.equal(s2.multiplier, 1.98);
  if (last.result === 'lose') assert.equal(rr.multiplier, 0);
  // win rate given not tie is exactly 1/2
  let w = 0, t = 0, N = 30000; const rng3 = rngFor(4);
  for (const u of rng3.take(N)) { const res = M.rpsResult('paper', M.rpsOutcome(u)); if (res === 'win') w++; else if (res === 'tie') t++; }
  close(w / (N - t), 0.5, 0.02, 'rps conditional win rate');
});

test('Wheel: every table pays 99.00% ± 0.1% at 2dp; high risk has one winning segment', () => {
  for (const risk of M.WHEEL_RISKS) for (const seg of M.WHEEL_SEGMENTS) {
    const t = M.wheelTable(risk, seg);
    assert.equal(t.length, seg); t.forEach((m) => assert.equal(m, M.round2(m)));
    close(M.wheelRtp(risk, seg), 0.99, 0.001, `${risk} ${seg}`);
  }
  assert.equal(M.wheelTable('high', 10).filter((m) => m > 0).length, 1);
  assert.equal(M.wheelTable('high', 50)[0], 49.5);
});

test('Baccarat: drawing rules, payouts and Monte Carlo RTP', () => {
  const c = (rank) => ({ rank, suit: 0 });
  // natural 9 vs 5: no draws
  let seq = [c(4), c(2), c(5), c(3)]; let i = 0;
  let coup = M.baccaratCoup(() => seq[i++]);
  assert.equal(coup.playerTotal, 9); assert.equal(coup.bankerTotal, 5); assert.equal(coup.winner, 'player'); assert.equal(coup.player.length, 2);
  // player 5 draws; banker 3 stands only against an 8
  seq = [c(3), c(2), c(1), c(2), c(8)]; i = 0; coup = M.baccaratCoup(() => seq[i++]);
  assert.equal(coup.player.length, 3); assert.equal(coup.banker.length, 2);
  const N = 60000; const ret = { player: 0, banker: 0, tie: 0 }; const rng = rngFor(5);
  for (let n = 0; n < N; n++) {
    const coupN = M.baccaratCoup(() => M.cardFromFloat(rng.one()));
    for (const bet of ['player', 'banker', 'tie']) ret[bet] += coupN.winner === bet ? M.BACCARAT_PAYOUT[bet] : coupN.winner === 'tie' ? 1 : 0;
  }
  close(ret.player / N, M.BACCARAT_RTP.player, 0.012, 'player rtp');
  close(ret.banker / N, M.BACCARAT_RTP.banker, 0.012, 'banker rtp');
  close(ret.tie / N, M.BACCARAT_RTP.tie, 0.04, 'tie rtp');
  const r = GAMES.baccarat.start({ bet: 'banker' }, rngFor(6), 0);
  assert.deepEqual(replayRound('baccarat', rngFor(6).take(r.outcome.dealt.length), { bet: 'banker' }, r.outcome), canonicalOutcome('baccarat', r.outcome));
});

test('Roulette: every bet type returns exactly 36/37', () => {
  const bets = [['straight', 17], ['red', 0], ['black', 0], ['odd', 0], ['even', 0], ['low', 0], ['high', 0], ['dozen', 2], ['column', 3]];
  for (const [bet, value] of bets) {
    let sum = 0; for (let n = 0; n <= 36; n++) sum += M.roulettePayout(bet, value, n);
    close(sum / 37, 36 / 37, 1e-9, bet);
  }
  assert.throws(() => GAMES.roulette.params({ bet: 'dozen', value: 0 }), /1, 2 or 3/);
  assert.equal(M.roulettePayout('even', 0, 0), 0);
});

test('Diamonds: probabilities sum to 1, hand evaluator, 99% table', () => {
  close(Object.values(M.DIAMOND_PROBS).reduce((a, b) => a + b, 0), 1, 1e-12, 'probs');
  assert.equal(M.diamondHand([1, 1, 1, 1, 1]), 'Five of a kind');
  assert.equal(M.diamondHand([1, 1, 2, 2, 2]), 'Full house');
  assert.equal(M.diamondHand([1, 2, 3, 4, 5]), 'Nothing');
  close(M.diamondsRtp(), 0.99, 0.0005, 'rtp');
  const r = GAMES.diamonds.start({}, rngFor(7), 0);
  assert.deepEqual(replayRound('diamonds', rngFor(7).take(5), {}, r.outcome), canonicalOutcome('diamonds', r.outcome));
});

test('Slide and Wheel settle on start and replay', () => {
  for (let n = 0; n < 20; n++) {
    const rs = GAMES.slide.start({ target: 3 }, rngFor(100 + n), 0); assert.ok(rs.settled);
    assert.deepEqual(replayRound('slide', rngFor(100 + n).take(1), { target: 3 }, rs.outcome), canonicalOutcome('slide', rs.outcome));
    const p = { segments: 30, risk: 'medium' }; const rw = GAMES.wheel.start(p, rngFor(200 + n), 0);
    assert.deepEqual(replayRound('wheel', rngFor(200 + n).take(1), p, rw.outcome), canonicalOutcome('wheel', rw.outcome));
    assert.equal(rw.multiplier, M.wheelTable('medium', 30)[rw.outcome.index]);
  }
  for (const id of GAME_IDS) assert.equal(typeof floatsAtStart[id], 'function', id);
});
