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

import { GAME_ICON, ART, GAME_COLOR } from './index.js';
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
  const results = h('div');
  root.replaceChildren(...[h('div', { class: 'game-grid' }, controls, board), reality, results].flat().filter(Boolean));
  return { controls, board, stage, reality, results };
}
export const payoutLine = (round) => `${fmtMult(round.multiplier)} · ${round.net >= 0 ? '+' : '−'}${fmt(Math.abs(round.net))} AGT`;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const hasBalance = () => (user()?.balance ?? 0) >= MIN_BET;
export const openRoundFor = (gameId) => { const r = me()?.openRound; return r && r.game === gameId ? r : null; };
