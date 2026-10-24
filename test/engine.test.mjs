import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../shared/engine.js';
import { FairRng } from '../server/fairness.js';
import { replayRound, canonicalOutcome, floatsAtStart } from '../shared/replay.js';
import * as M from '../shared/math.js';

const rngFor = (nonce, skip = 0) => new FairRng('seed', 'client', nonce, skip);

test('one-shot games settle on start and their outcomes replay from the floats', () => {
  const cases = [
    ['limbo', { target: 2 }], ['dice', { chance: 49.5, over: true }], ['plinko', { rows: 16, risk: 'high' }], ['keno', { picks: [1, 2, 3, 4, 5], risk: 'classic' }],
  ];
  for (const [id, raw] of cases) {
    for (let nonce = 0; nonce < 50; nonce++) {
      const g = GAMES[id]; const p = g.params(raw);
      const rng = rngFor(nonce);
      const r = g.start(p, rng, 0);
      assert.ok(r.settled);
      assert.ok(r.multiplier >= 0);
      const floats = rngFor(nonce).take(rng.used);
      assert.deepEqual(replayRound(id, floats, p, r.outcome), canonicalOutcome(id, r.outcome), `${id} replay`);
      assert.equal(rng.used, floatsAtStart[id](p));
    }
  }
});

test('Mines: layout hidden until settled, cashout and bust paths, replay', () => {
  const g = GAMES.mines; const p = g.params({ mines: 3 });
  const rng = rngFor(1); const start = g.start(p, rng, 0);
  assert.equal(start.settled, false);
  assert.equal(start.state.layout.length, 3);
  const view = g.view(start.state, p);
  assert.ok(!('layout' in view));
  const safe = [...Array(25).keys()].filter((i) => !start.state.layout.includes(i));
  let st = start.state; let r;
  r = g.action(st, p, 'reveal', { index: safe[0] }, rng); assert.equal(r.settled, false);
  r = g.action(st, p, 'reveal', { index: safe[1] }, rng); assert.equal(r.settled, false);
  assert.throws(() => g.action(st, p, 'reveal', { index: safe[1] }, rng), /Already/);
  assert.throws(() => g.action(st, p, 'reveal', { index: 25 }, rng), /between/);
  r = g.action(st, p, 'cashout', {}, rng);
  assert.equal(r.settled, true);
  assert.equal(r.multiplier, M.round2(M.minesMultiplier(3, 2)));
  assert.deepEqual(replayRound('mines', rngFor(1).take(3), p, r.outcome), canonicalOutcome('mines', r.outcome));
  // bust
  const s2 = g.start(p, rngFor(2), 0).state;
  const bust = g.action(s2, p, 'reveal', { index: s2.layout[0] });
  assert.equal(bust.settled, true); assert.equal(bust.multiplier, 0);
  // clear the whole board
  const s3 = g.start(g.params({ mines: 24 }), rngFor(3), 0).state;
  const only = [...Array(25).keys()].find((i) => !s3.layout.includes(i));
  const win = g.action(s3, { mines: 24 }, 'reveal', { index: only });
  assert.equal(win.settled, true); assert.equal(win.multiplier, 24.75);
});

test('Dragon Tower: climbing, ceiling and replay', () => {
  const g = GAMES.tower; const p = g.params({ level: 'master' });
  const rng = rngFor(4); const { state } = g.start(p, rng, 0);
  let r;
  for (let row = 0; row < 9; row++) {
    r = g.action(state, p, 'pick', { tile: state.layout[row][0] }, rng);
    if (row < 8) assert.equal(r.settled, false);
  }
  assert.equal(r.settled, true);
  assert.equal(r.multiplier, 256901.12);
  assert.deepEqual(replayRound('tower', rngFor(4).take(9), p, r.outcome), canonicalOutcome('tower', r.outcome));
  const s2 = g.start(p, rngFor(5), 0).state;
  const wrong = [0, 1, 2, 3].find((t) => !s2.layout[0].includes(t));
  assert.equal(g.action(s2, p, 'pick', { tile: wrong }).multiplier, 0);
});

test('HiLo: guesses compound, invalid guesses rejected, cards replay', () => {
  const g = GAMES.hilo; const p = {};
  const rng = rngFor(6); const { state } = g.start(p, rng, 0);
  assert.throws(() => g.action(state, p, 'cashout', {}, rng), /at least one/);
  const cur = state.cards[0];
  if (cur.rank === 1) assert.throws(() => g.action(state, p, 'guess', { choice: 'lower' }, rng), /not available/);
  const choice = cur.rank <= 7 ? 'higher' : 'lower';
  const r = g.action(state, p, 'guess', { choice }, rng);
  const floats = rngFor(6).take(rng.used);
  if (r.settled) assert.equal(r.multiplier, 0);
  else assert.equal(state.multiplier, M.round2(M.hiloStepMultiplier(cur.rank, choice)));
  const out = r.settled ? r.outcome : { cards: state.cards };
  assert.deepEqual(replayRound('hilo', floats, p, out), canonicalOutcome('hilo', out));
});

test('Video Poker: hold all keeps the hand, draw replaces exactly the discarded cards without duplicates', () => {
  const g = GAMES.videopoker; const p = {};
  for (let n = 0; n < 40; n++) {
    const rng = rngFor(100 + n); const { state } = g.start(p, rng, 0);
    const hold = state.initial.map((_, i) => (i + n) % 3 !== 0);
    const r = g.action(state, p, 'draw', { hold }, rng);
    assert.equal(new Set(r.outcome.final).size, 5, 'no duplicate cards');
    r.outcome.final.forEach((c, i) => { if (hold[i]) assert.equal(c, state.initial[i]); });
    const floats = rngFor(100 + n).take(rng.used);
    assert.deepEqual(replayRound('videopoker', floats, p, r.outcome), canonicalOutcome('videopoker', r.outcome));
    assert.equal(r.multiplier, M.vpPayout(r.outcome.rank));
  }
});

test('Blackjack: plays out legally over many deals; payouts are in {0, 1, 2, 2.5, …} units', () => {
  const g = GAMES.blackjack; const p = {};
  let bj = 0, settledImmediately = 0;
  for (let n = 0; n < 400; n++) {
    const rng = rngFor(1000 + n);
    let r = g.start(p, rng, 0);
    if (r.settled) { settledImmediately++; if (r.outcome.result.reason === 'blackjack') { bj++; assert.equal(r.multiplierUnits, 2.5); } continue; }
    let state = r.state; let guard = 0;
    while (!r.settled && guard++ < 20) {
      if (state.phase === 'insurance') { r = g.action(state, p, 'insurance', { take: n % 2 === 0 }, rng); continue; }
      const can = g.allowed(state);
      const hand = state.hands[state.active];
      const total = M.bjTotal(hand.cards).total;
      const act = can.includes('split') && n % 3 === 0 ? 'split' : can.includes('double') && total >= 9 && total <= 11 ? 'double' : total < 17 ? 'hit' : 'stand';
      r = g.action(state, p, act, {}, rng);
    }
    assert.ok(r.settled, 'round finished');
    const units = r.multiplierUnits;
    assert.ok(units >= 0 && units <= 8.5);
    const floats = rngFor(1000 + n).take(rng.used);
    assert.deepEqual(replayRound('blackjack', floats, p, r.outcome).cards, canonicalOutcome('blackjack', r.outcome).cards);
  }
  assert.ok(bj > 5, 'some naturals dealt');
  assert.ok(settledImmediately > bj, 'dealer naturals also settle immediately');
});

test('Blackjack: dealer stands on soft 17, player blackjack beats dealer 21, insurance pays 2:1', () => {
  const g = GAMES.blackjack;
  // craft via state directly: dealer A+6 (soft 17) must not draw
  const s = { cards: [], dealer: [{ rank: 1, suit: 0 }, { rank: 6, suit: 0 }], hands: [{ cards: [{ rank: 10, suit: 0 }, { rank: 8, suit: 0 }], stake: 1, done: true }], active: 0, phase: 'play', insurance: 0 };
  const r = g.advance(s, rngFor(1));
  assert.equal(s.dealer.length, 2);
  assert.equal(r.multiplierUnits, 2); // 18 beats 17
  const s2 = { cards: [], dealer: [{ rank: 1, suit: 0 }, { rank: 13, suit: 0 }], hands: [{ cards: [{ rank: 9, suit: 0 }, { rank: 9, suit: 1 }], stake: 1, done: false }], active: 0, phase: 'insurance', insurance: 0 };
  const r2 = g.action(s2, {}, 'insurance', { take: true }, rngFor(1));
  assert.equal(r2.settled, true); assert.equal(r2.extraUnits, 0.5); assert.equal(r2.multiplierUnits, 1.5);
});

test('Crash: server clock decides; cashout before the point pays the displayed multiplier', () => {
  const g = GAMES.crash;
  const p = g.params({});
  const rng = rngFor(42); const { state } = g.start(p, rng, 1000);
  const point = state.point;
  assert.ok(!('point' in g.view(state)));
  if (point > 1.3) {
    const t = 1000 + M.crashTimeFor(1.2);
    const r = g.action(structuredClone(state), p, 'cashout', {}, rng, t);
    assert.equal(r.settled, true); assert.equal(r.multiplier, 1.2);
  }
  const late = g.action(structuredClone(state), p, 'cashout', {}, rng, 1000 + M.crashTimeFor(point) + 1);
  assert.equal(late.multiplier, 0);
  const poll = g.action(structuredClone(state), p, 'poll', {}, rng, 1000);
  assert.equal(poll.settled, false);
  const auto = g.params({ autoCashout: 1.5 });
  const s2 = g.start(auto, rngFor(43), 0).state;
  const r2 = g.action(structuredClone(s2), auto, 'poll', {}, rng, M.crashTimeFor(1.5) + 1);
  assert.equal(r2.settled, true);
  assert.equal(r2.multiplier, s2.point > 1.5 ? 1.5 : 0);
});

test('params are whitelisted: unknown fields and out-of-range values are rejected', () => {
  assert.throws(() => GAMES.limbo.params({ target: 2, evil: 1 }), /Unexpected/);
  assert.throws(() => GAMES.limbo.params({ target: 1 }), /between/);
  assert.throws(() => GAMES.limbo.params({ target: 2.005 }), /decimals/);
  assert.throws(() => GAMES.dice.params({ chance: 99, over: true }), /between/);
  assert.throws(() => GAMES.mines.params({ mines: 25 }), /between/);
  assert.throws(() => GAMES.mines.params({ mines: 2.5 }), /integer/);
  assert.throws(() => GAMES.keno.params({ picks: [1, 1], risk: 'high' }), /distinct/);
  assert.throws(() => GAMES.keno.params({ picks: [], risk: 'high' }), /list/);
  assert.throws(() => GAMES.plinko.params({ rows: 7, risk: 'high' }), /one of/);
  assert.throws(() => GAMES.tower.params({ level: 'god' }), /one of/);
  assert.throws(() => GAMES.limbo.params(JSON.parse('{"__proto__":{"x":1},"target":2}')), /Unexpected/);
});
