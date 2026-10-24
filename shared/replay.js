// Reproduce a settled round's randomness from its floats. Used by the server (as the single source
// of the deterministic parts) and by the browser verifier (with the revealed server seed).
import {
  crashPoint, diceRoll, minesLayout, towerLayout, cardFromFloat, plinkoPath, kenoDraw, dealDistinct, cardOf,
} from './math.js';

export const replay = {
  limbo: (f) => ({ point: crashPoint(f[0]) }),
  crash: (f) => ({ point: crashPoint(f[0]) }),
  dice: (f) => ({ roll: diceRoll(f[0]) }),
  mines: (f, p) => ({ layout: minesLayout(f, p.mines).sort((a, b) => a - b) }),
  tower: (f, p) => ({ layout: towerLayout(f, p.level) }),
  hilo: (f) => ({ cards: f.map(cardFromFloat).map(({ rank, suit }) => ({ rank, suit })) }),
  plinko: (f, p) => plinkoPath(f, p.rows),
  keno: (f) => ({ draw: kenoDraw(f).sort((a, b) => a - b) }),
  videopoker: (f, p, outcome) => {
    const initial = dealDistinct(f.slice(0, 5), 5);
    const hold = outcome?.hold || [true, true, true, true, true];
    const n = hold.filter((x) => !x).length;
    const fresh = n ? dealDistinct(f.slice(5, 5 + n), n, initial) : [];
    let j = 0;
    const final = initial.map((c, i) => (hold[i] ? c : fresh[j++]));
    return { initial, final };
  },
  blackjack: (f) => ({ cards: f.map(cardFromFloat).map(({ rank, suit }) => ({ rank, suit })) }),
};

/** How many floats each game needs before any player action. */
export const floatsAtStart = {
  limbo: () => 1, crash: () => 1, dice: () => 1,
  mines: (p) => p.mines,
  tower: (p) => 9 * ({ easy: 3, medium: 2, hard: 1, expert: 1, master: 1 }[p.level]),
  hilo: () => 1, plinko: (p) => p.rows, keno: () => 10, videopoker: () => 5, blackjack: () => 4,
};

/** Canonical replay object for a settled round (what the verifier compares). */
export function replayRound(game, floats, params, outcome) {
  return replay[game](floats, params, outcome);
}

/** Extract the comparable part of a stored outcome. */
export function canonicalOutcome(game, outcome) {
  switch (game) {
    case 'limbo': case 'crash': return { point: outcome.point };
    case 'dice': return { roll: outcome.roll };
    case 'mines': return { layout: [...outcome.layout].sort((a, b) => a - b) };
    case 'tower': return { layout: outcome.layout };
    case 'hilo': return { cards: outcome.cards.map(({ rank, suit }) => ({ rank, suit })) };
    case 'plinko': return { dirs: outcome.dirs, bin: outcome.bin };
    case 'keno': return { draw: [...outcome.draw].sort((a, b) => a - b) };
    case 'videopoker': return { initial: outcome.initial, final: outcome.final };
    case 'blackjack': return { cards: outcome.cards.map(({ rank, suit }) => ({ rank, suit })) };
    default: return outcome;
  }
}
