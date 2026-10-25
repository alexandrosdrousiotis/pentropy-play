// Shared widgets for the live tables: a synced clock, a poller, the phase bar, the players list and the fairness line.
import { api } from '../api.js';
import { h, svgUse, fmt, fmtMult } from '../ui.js';
import { liveCrashPoint, liveRouletteNumber } from '../../shared/live.js';

/** Poll a live table; `onState` gets every snapshot. The returned clock gives server time locally. */
export function livePoller(game, onState, { fast = 600, slow = 1000 } = {}) {
  let offset = 0, timer = 0, dead = false, inflight = false, phase = 'betting';
  const clock = { now: () => Date.now() + offset };
  async function poll() {
    if (dead) return;
    if (!document.hidden && !inflight) {
      inflight = true;
      try { const s = await api.live(game); offset = s.now - Date.now(); phase = s.phase; onState(s); } catch { /* next tick */ }
      inflight = false;
    }
    timer = setTimeout(poll, phase === 'running' ? fast : slow);
  }
  poll();
  return { clock, stop() { dead = true; clearTimeout(timer); }, kick() { clearTimeout(timer); poll(); } };
}

/** Phase bar: label on the left, countdown on the right, progress underneath. */
export function phaseBar() {
  const label = h('span', { class: 'lb-label' }), time = h('span', { class: 'lb-time num' });
  const bar = h('i', {});
  const el = h('div', { class: 'live-bar' }, h('div', { class: 'row between' }, label, time), h('div', { class: 'progress' }, bar));
  return {
    el,
    set(text, { remaining = 0, total = 1, tone = '' } = {}) {
      label.textContent = text; el.className = `live-bar ${tone}`;
      time.textContent = remaining > 0 ? `${(remaining / 1000).toFixed(1)}s` : '';
      bar.style.width = `${Math.max(0, Math.min(100, (remaining / total) * 100))}%`;
    },
  };
}

/** Players at the table this round. `render(bet)` returns the right-hand cells for one bet. */
export function playersPanel(title = 'This round') {
  const list = h('div', { class: 'players-list' });
  const count = h('span', { class: 't-desc' });
  const el = h('section', { class: 'panel players' }, h('div', { class: 'row between' }, h('h3', {}, title), count), list);
  return {
    el,
    paint(bets, cells) {
      count.textContent = `${bets.length} player${bets.length === 1 ? '' : 's'} · ${fmt(bets.reduce((a, b) => a + b.amount, 0), 0)} AGT`;
      list.replaceChildren(...bets.slice(0, 40).map((b) => h('div', { class: `player-row${b.mine ? ' me' : ''}${b.payout != null ? (b.payout > 0 ? ' won' : ' lost') : ''}` },
        h('span', { class: 'who' }, b.username, b.bot ? h('span', { class: 'sim', title: 'Simulated player' }, svgUse('ph-robot')) : null),
        ...cells(b))));
    },
  };
}

/** Round id, hash while open, seed and a local verification once it ends. */
export function fairLine(game) {
  const el = h('div', { class: 'fair-line' });
  return {
    el,
    paint(round) {
      const verified = round.seed ? (game === 'crash' ? liveCrashPoint(round.seed, round.id) === round.result : liveRouletteNumber(round.seed, round.id) === round.result) : null;
      el.replaceChildren(...[
        h('span', {}, `Round #${round.id}`),
        h('span', { class: 'mono', title: 'SHA-256 of the round seed, published before bets closed' }, `hash ${round.seedHash.slice(0, 16)}…`),
        round.seed ? h('span', { class: 'mono', title: 'Round seed, revealed when the round ended' }, `seed ${round.seed.slice(0, 16)}…`) : h('span', { class: 't-desc' }, 'seed revealed when the round ends'),
        round.seed ? h('span', { class: `tag ${verified ? 'green' : 'red'}` }, verified ? 'verified in your browser' : 'mismatch') : null].filter(Boolean));
    },
  };
}

/** The strip of recent results: crash points coloured by size, roulette numbers by colour. */
export function historyStrip(game) {
  const el = h('div', { class: 'live-history', 'aria-label': 'Recent rounds' });
  return {
    el,
    paint(history, colourOf) {
      el.replaceChildren(...history.slice(0, 18).map((x) => { const c = h('span', { class: 'hchip num', title: `Round #${x.id}` }, game === 'crash' ? fmtMult(x.result) : String(x.result)); c.style.background = colourOf(x.result); return c; }));
    },
  };
}
