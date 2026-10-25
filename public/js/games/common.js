// Shared pieces for every game: the bet panel, the "reality" tiles, and settlement plumbing.
import { haptic } from '../fx.js';
import { api, user, me } from '../api.js';
import { svgUse, h, numberInput, fmt, fmtPct, fmtMult, toast, button } from '../ui.js';
import { expectedLoss } from '../../shared/math.js';

export const MIN_BET = 0.1;

/** A bet-amount field with ½ / 2× / max helpers. */
export function betAmount(initial = 10, onChange = () => {}) {
  const balance = user()?.balance ?? initial;
  let amount = Math.max(MIN_BET, Math.min(initial, Math.floor(balance * 100) / 100));
  const field = numberInput({
    label: 'Bet amount', value: amount, min: MIN_BET, step: 0.1, unit: 'AGT',
    onChange: (v) => { amount = Math.round(v * 100) / 100; onChange(amount); },
    helpers: [
      { label: '½', fn: (v) => Math.max(MIN_BET, Math.round(v * 50) / 100) },
      { label: '2×', fn: (v) => Math.min(Math.floor((user()?.balance ?? v) * 100) / 100, Math.round(v * 200) / 100) },
      { label: 'Max', fn: () => Math.floor((user()?.balance ?? 0) * 100) / 100 },
    ],
  });
  field.classList.add('amount');
  field.get = () => amount;
  field.set = (v) => { amount = Math.round(Number(v) * 100) / 100; field.input.value = String(amount); };
  field.setDisabled = (d) => field.querySelectorAll('input,button').forEach((el) => (el.disabled = d));
  return field;
}

/**
 * The reality panel: live expected loss for the configured bet.
 * `calc()` returns { winChance, multiplier, note } for the current configuration.
 */
export function realityPanel(game, getAmount, calc) {
  const root = h('div', { class: 'reality bar' });
  const TIPS = { RTP: 'Return to player: the share of every bet the game pays back over the long run. The rest is the house edge.', 'Win chance': 'How often this exact bet wins. Multiply by the payout and you get the RTP, never more.', 'Expected loss': 'What this bet costs on average: stake times the house edge. Some rounds you win, but this is the price per spin.', 'Per 100 bets': 'The expected loss over a hundred bets of this size, in the euro value you set for a token.' };
  const tile = (v, l, d, cls = '') => h('span', { class: `rf tip-wide ${cls}`, 'data-tip': TIPS[l] || null, tabindex: '0' }, h('span', { class: 'l' }, l), h('b', { class: 'v num' }, v), d && h('small', { class: 'd' }, d));
  const links = h('span', { class: 'rf-links' }, h('a', { href: '#/fair' }, svgUse('ph-shield-check'), 'Fairness'), h('a', { href: '#/learn' }, svgUse('ph-info'), 'Game info'));
  const update = () => {
    const amt = getAmount() || 0;
    const c = calc() || {};
    const rtp = c.rtp ?? game.rtp;
    const el = expectedLoss(amt, rtp);
    const notional = user()?.notional ?? 1;
    root.replaceChildren(...[
      tile(fmtPct(rtp, 2), 'RTP', `${fmtPct(1 - rtp, 2)} house edge`),
      c.winChance != null && tile(fmtPct(c.winChance, c.winChance < 0.001 ? 5 : 2), 'Win chance', c.multiplier ? `pays ${fmtMult(c.multiplier)}` : null),
      tile('−' + fmt(el, el < 0.01 ? 4 : 2), 'Expected loss', 'per bet'),
      tile('−€' + fmt(el * 100 * notional), 'Per 100 bets', `at €${fmt(notional)} / AGT`),
      links,
    ].filter(Boolean));
  };
  update();
  root.update = update;
  return root;
}

/** Standard controls column: bet field, play button, reality panel wiring. */
export function controlsPanel(...children) {
  return h('div', { class: 'panel' }, ...children);
}

import { GAME_ICON, ART, GAME_COLOR, CATEGORIES, gameById } from './index.js';
export const gameIcon = (id) => GAME_ICON[id] || 'ph-sparkle';
export function gameHeader(game) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${gameIcon(game.id)}`); svg.append(use);
  return h('div', { class: `game-head${ART.has(game.id) ? ' has-art' : ''}`, style: ART.has(game.id) ? { backgroundImage: `url(art/${game.id}.webp)` } : {} },
    h('div', { class: 'title' },
      ART.has(game.id) ? h('img', { class: 'icon thumb', src: `art/${game.id}.webp`, alt: '', decoding: 'async' }) : h('span', { class: `icon art ${game.id}` }, svg),
      h('div', {}, h('h2', {}, game.name), h('div', { class: 'sub' }, game.blurb))),
    h('div', { class: 'row' },
      h('span', { class: 'tag' }, `RTP ${fmtPct(game.rtp, 2)}`),
      h('span', { class: 'tag hot' }, `Max ${game.ceiling}`)));
}

/** Open a round; shows a toast on refusal and returns null. */
export async function tryBet(game, amount, params, opts) {
  haptic(8);
  try { return await api.bet(game, amount, params, opts); }
  catch (e) { toast(e.message, 'bad'); return null; }
}
export async function tryAct(action, payload, opts) {
  try { return await api.act(action, payload, opts); }
  catch (e) { toast(e.message, 'bad'); return null; }
}

/** Standard two-column game layout. */
export function layout(root) {
  const controls = h('div', { class: 'panel controls' });
  const stage = h('div', { class: 'stage' });
  const board = h('div', { class: 'board' }, stage);
  const id = root.dataset?.game;
  if (id) { board.style.setProperty('--c', GAME_COLOR[id] || '#334'); if (ART.has(id)) { board.classList.add('has-art'); board.style.setProperty('--art', `url(art/${id}.webp)`); } }
  const reality = h('div');
  const results = h('div', { class: 'game-recent' });
  const meta = id ? gameById(id) : null;
  root.replaceChildren(h('div', { class: 'game-wrap' }, h('div', { class: 'game-grid' }, controls, board), reality, results, meta ? gameInfo(meta) : null));
  return { controls, board, stage, reality, results };
}

/* ---------------- the strip under the window: name, tags, description, my bets, big wins, fairness ---------------- */
const HOW = {
  limbo: 'Name a target multiplier. The server draws a number from a curve where the chance of reaching x is 0.99 ÷ x, so every target has the same expected return.\nLow targets win often and pay little; a 1,000x target wins about once in a thousand rolls.',
  mines: 'Twenty-five tiles hide the mines you asked for. Every safe tile you uncover multiplies the stake; cash out whenever you like, or lose it all on a mine.\nThe multiplier for each step is 0.99 ÷ (chance the tile is safe), compounded across the tiles you have opened.',
  dice: 'Slide the win chance anywhere between 0.01% and 98%, pick over or under, and roll a number from 0 to 100.\nThe payout is always 99 ÷ win chance, so the house keeps one percent whatever odds you choose.',
  crash: 'Everyone bets on the same flight. The multiplier climbs from 1.00x and crashes at a point committed before the round starts; cash out before it does.\nAuto cash out is exactly a Limbo bet: cashing out at 2x wins 49.5% of the time.',
  tower: 'Climb nine rows, one egg per row. The difficulty sets how many tiles per row and how many of them are safe.\nEach row multiplies by 0.98 ÷ (safe ÷ tiles). Cash out between rows, or fall when you pick a dragon.',
  plinko: 'A ball drops through rows of pegs, bouncing left or right at each one, and lands in a bin with a multiplier. The outside bins are rare and large; the middle ones are common and small.\nThe bin probabilities follow the binomial distribution, and the paytable is built so the total return is 99%.',
  keno: 'Pick up to ten numbers out of forty. Ten are drawn. The more of yours that come up, the more it pays, on a table that changes with the risk setting.\nThe chance of each hit count is fixed by combinatorics; the paytable is scaled to return 99%.',
  wheel: 'Spin a wheel of coloured segments; the risk setting changes how many segments pay and how much.\nHigh risk puts almost everything into one segment that comes up once per spin count; low risk pays often and small.',
  slide: 'Pick a target multiplier. A marker slides along a rail and stops on a value drawn from the same curve as Limbo; you win if it clears your target.',
  diamonds: 'Five gems are dealt from seven colours. Pairs, three of a kind, full houses and five of a kind pay on a fixed table.\nThe chances are plain counting over 7⁵ combinations, and the table returns 99%.',
  chicken: 'Cross twenty-five lanes of traffic. Some lanes hold a truck; the difficulty sets how many. Each safe lane multiplies the stake, and you can cash out on any kerb.',
  pump: 'Pump a balloon. Each pump multiplies the stake; one pump too many and it pops. The difficulty sets how many pumps are hiding the pin.',
  hilo: 'A card is shown. Call the next one higher or lower; the server tells you the exact chance of each call and pays 0.99 ÷ that chance. Skip a card for free, cash out whenever.',
  flip: 'Call heads or tails. Every correct call multiplies by 1.98; one wrong call loses the stake. Cash out after any win.',
  rps: 'Play rock, paper, scissors against the house. A win multiplies by 1.98, a tie replays for free, a loss ends the streak.',
  blackjack: 'Standard blackjack from an infinite shoe: dealer stands on 17, blackjack pays 3 to 2, double on any two cards, split once, insurance offered.\nPlayed perfectly the edge is 0.57%; every deviation from basic strategy adds to it.',
  videopoker: 'Jacks or Better on a 9/6 paytable. Hold any of the five cards, draw the rest, and the final hand pays on the table.\nPerfect play returns 99.54%; most players hold wrong often enough to give back a few percent more.',
  baccarat: 'Bet on player, banker or tie. Two hands are dealt by fixed rules; the closer to nine wins. Banker pays 0.95 to 1, player 1 to 1, tie 8 to 1.',
  roulette: 'European single zero. Everyone bets on the same spin; the number is committed before bets open and revealed with the seed afterwards.\nEvery square on the table returns 97.3%: 36 ÷ 37 of the stake, on average, whatever you cover.',
};
const fact = (l, v) => h('div', { class: 'gi-fact' }, h('span', { class: 'l' }, l), h('b', {}, v));
export function gameInfo(g) {
  const cat = CATEGORIES.find((c) => c.id === g.cat)?.label || 'Originals';
  const art = ART.has(g.id) ? h('img', { class: 'gi-thumb', src: `art/${g.id}.webp`, alt: '', loading: 'lazy', decoding: 'async' }) : h('span', { class: 'gi-thumb glyph' }, svgUse(gameIcon(g.id)));
  const head = h('div', { class: 'gi-head' }, art, h('div', { class: 'gi-title' }, h('h2', {}, g.name), h('div', { class: 'gi-tags' },
    h('span', { class: 'tag' }, 'Pentropy Original'), h('span', { class: 'tag' }, cat), h('span', { class: 'tag' }, `RTP ${fmtPct(g.rtp, 2)}`), h('span', { class: 'tag' }, `Max win ${g.ceiling}`), h('span', { class: 'tag green' }, svgUse('ph-shield-check'), 'Provably fair'))));
  const tabs = h('div', { class: 'gi-tabs', role: 'tablist' });
  const body = h('div', { class: 'gi-body' });
  const when = (t) => new Date(t).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
  const table = (heads, rows) => h('div', { class: 'tscroll' }, h('table', { class: 'data' }, h('thead', {}, h('tr', {}, ...heads.map((x) => h('th', {}, x)))), h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map((c) => h('td', {}, c)))))));
  const empty = (t) => h('p', { class: 'help gi-empty' }, t);
  const views = {
    description: () => h('div', { class: 'gi-text' },
      h('p', { class: 'gi-lead' }, g.blurb),
      ...(HOW[g.id] || '').split('\n').filter(Boolean).map((p) => h('p', {}, p)),
      h('div', { class: 'gi-facts' }, fact('House edge', fmtPct(1 - g.rtp, 2)), fact('Max win', g.ceiling), fact('Min bet', '0.10 AGT'), fact('Provider', 'Pentropy Originals'))),
    bets: async () => {
      let rows = [];
      try { rows = (await api.rounds(200)).rounds.filter((x) => x.game === g.id).slice(0, 20); } catch { /* signed out */ }
      return rows.length ? table(['When', 'Bet', 'Multiplier', 'Net'], rows.map((x) => [when(x.settledAt), `${fmt(x.amount)} AGT`, fmtMult(x.multiplier), h('span', { class: `num ${x.net > 0 ? 'good' : x.net < 0 ? 'bad' : ''}` }, `${x.net >= 0 ? '+' : '−'}${fmt(Math.abs(x.net))}`)])) : empty(user() ? 'No bets on this game yet.' : 'Sign in to see your bets here.');
    },
    wins: async () => {
      let rows = [];
      try { rows = (await api.socialBig()).bets.filter((x) => x.game === g.id).slice(0, 10); } catch { /* fine */ }
      return rows.length ? table(['Player', 'Bet', 'Multiplier', 'Won'], rows.map((x) => [x.username, `${fmt(x.amount)} AGT`, fmtMult(x.multiplier), h('span', { class: 'num good' }, `+${fmt(x.net)}`)])) : empty('No big wins on this game in the last day.');
    },
    fairness: () => h('div', { class: 'gi-text' },
      h('p', {}, 'Every round is drawn from a server seed, your client seed and a nonce. The server commits to a hash of its seed before you bet, so it cannot change the outcome after seeing your stake; rotate the seed and the old one is revealed for you to check.'),
      h('p', {}, h('a', { href: '#/fair' }, 'Open the fairness page'), ' to see your seeds, verify any past round, or rotate the server seed.')),
  };
  let current = 'description';
  const show = async (k) => {
    current = k;
    tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.k === k)));
    body.replaceChildren(h('p', { class: 'help' }, 'Loading…'));
    const v = await views[k]();
    if (current === k) body.replaceChildren(v);
  };
  tabs.append(...[['description', 'Description'], ['bets', 'My bets'], ['wins', 'Big wins'], ['fairness', 'Fairness']].map(([k, l]) => h('button', { type: 'button', role: 'tab', 'data-k': k, 'aria-selected': String(k === current), onClick: () => show(k) }, l)));
  show('description');
  return h('section', { class: 'game-info' }, head, tabs, body);
}
export const payoutLine = (round) => `${fmtMult(round.multiplier)} · ${round.net >= 0 ? '+' : '−'}${fmt(Math.abs(round.net))} AGT`;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Resolve once `pred()` is true, checking every `every` ms. */
export const waitFor = (pred, every = 150) => new Promise((res) => { const t = setInterval(() => { if (pred()) { clearInterval(t); res(true); } }, every); });
export const hasBalance = () => (user()?.balance ?? 0) >= MIN_BET;
export const openRoundFor = (gameId) => { const r = me()?.openRound; return r && r.game === gameId ? r : null; };
