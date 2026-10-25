// Crash, live: one flight at a time for everyone at the table. Bets open for a few seconds, the
// curve climbs, each player cashes out when they like, and the whole table sees the same crash.
import { h, button, numberInput, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt, svgUse, toast } from '../ui.js';
import { betAmount, realityPanel, layout, waitFor } from './common.js';
import { attach as attachAuto } from './autobet.js';
import { api, user } from '../api.js';
import { limboWinChance, LIMBO_MAX, CRASH_K } from '../../shared/math.js';
import { crashMultAt } from '../../shared/live.js';
import { sound, flashGreen, flashRed, shake, winBurst, sparkle, shockwave, haptic } from '../fx.js';
import { livePoller, phaseBar, playersPanel, fairLine, historyStrip } from './live-ui.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const curveAt = (ms) => Math.exp(CRASH_K * (ms / 1000));
const pointColour = (m) => (m < 1.2 ? 'var(--surface-3)' : m < 2 ? 'rgba(60,207,143,.25)' : m < 10 ? 'rgba(230,182,85,.3)' : 'rgba(255,92,122,.3)');

export function mount(root, meta) {
  const L = layout(root);
  let auto = 0, state = null, raf = 0, busy = false, dead = false;
  const seen = new Set(); // my bets already announced
  const amount = betAmount(10, () => reality.update());
  const autoField = numberInput({ label: 'Auto cash out (0 = manual)', value: auto, min: 0, max: LIMBO_MAX, step: 0.01, unit: 'x', onChange: (v) => { auto = v > 0 ? Math.max(1.01, Math.round(v * 100) / 100) : 0; reality.update(); } });
  const play = button('Place bet', { kind: 'primary', size: 'lg block', onClick: () => bet() });
  const cash = button('Cash out', { kind: 'orange', size: 'xl block', disabled: true, onClick: () => cashout() });
  const hint = h('p', { class: 'help live-hint' });
  const liveHead = h('div', { class: 'ctl-head' }, h('i', { class: 'live-dot' }), h('b', {}, 'Live round'), h('span', { class: 'ctl-sub' }, 'one seed, everyone in'));
  L.controls.append(liveHead, amount, autoField, play, cash, hint);

  const bar = phaseBar();
  const hist = historyStrip('crash');
  const area = h('div', { class: 'crash-area' });
  const plot = h('div', { class: 'crash-plot' });
  const svg = el('svg', { viewBox: '0 0 100 60', preserveAspectRatio: 'none' });
  const grid = el('g', {});
  const fill = el('path', { d: '', class: 'fill' });
  const line = el('path', { d: '', class: 'line', fill: 'none', 'stroke-width': 3.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' });
  svg.append(grid, fill, line);
  // the tip rides the curve: the painted rocket sprite when the art exists, a plain dot otherwise
  const tip = h('div', { class: 'crash-tip' });
  tip.append(h('img', { src: 'art/crash-rocket.webp', alt: '', decoding: 'async', onError: (e) => { e.target.remove(); tip.classList.add('dot'); } }));
  const readout = h('div', { class: 'readout num' }, '1.00x', h('small', {}, 'waiting'));
  const ticksX = h('div', { class: 'ticks-x' }), ticksY = h('div', { class: 'ticks-y' });
  const wait = h('div', { class: 'crash-wait' }, h('div', { class: 'cw-num num' }, '—'), h('div', { class: 't-label' }, 'next launch'));
  const cashMarks = h('div', { class: 'cash-marks' });
  plot.append(svg, cashMarks, tip);
  area.append(plot, ticksX, ticksY, readout, wait);
  const players = playersPanel('All bets');
  const fair = fairLine('crash');
  L.stage.append(h('div', { class: 'stack live-stage' }, hist.el, bar.el, area, fair.el));
  L.board.classList.add('live-board');
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(h('h3', {}, 'My recent flights'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => (auto ? { winChance: limboWinChance(auto), multiplier: auto, note: `Auto cash out at ${fmtMult(auto)} is exactly a Limbo bet: ${fmtPct(limboWinChance(auto), 2)} × ${fmtMult(auto)} = 0.99.` } : { note: 'Whatever moment you pick, the expected return is 99%. Cashing out at 1.50x wins 66% of the time; at 10x, 9.9%. Same loss, different feeling.' }));
  L.reality.append(reality);

  /* ---- drawing ---- */
  let vT = 8000, vM = 2, tickKey = '';
  const fmtS = (ms) => `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
  function drawFrame(elapsed, m, { snap = false } = {}) {
    // the head of the curve sits near the top-right of the plot; the axes stretch to keep it there
    const tT = Math.max(4000, elapsed / 0.9), tM = Math.max(1.5, 1 + (m - 1) / 0.8);
    if (snap || elapsed === 0) { vT = tT; vM = tM; } else { vT += (tT - vT) * 0.1; vM += (tM - vM) * 0.1; }
    const T = vT, M = vM, pts = [], N = 120;
    for (let i = 0; i <= N; i++) { const t = (elapsed * i) / N; pts.push([(t / T) * 100, 60 - ((curveAt(t) - 1) / (M - 1)) * 60]); }
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(' ');
    line.setAttribute('d', d); fill.setAttribute('d', `${d} L${pts[N][0].toFixed(3)},60 L0,60 Z`);
    const rect = plot.getBoundingClientRect();
    const tipX = (pts[N][0] / 100) * rect.width, tipY = (pts[N][1] / 60) * rect.height;
    const prevX = (pts[N - 4][0] / 100) * rect.width, prevY = (pts[N - 4][1] / 60) * rect.height;
    const ang = elapsed > 0 ? Math.atan2(tipY - prevY, tipX - prevX) * 180 / Math.PI : -45;
    tip.classList.toggle('on', elapsed > 0); tip.style.left = `${tipX}px`; tip.style.top = `${tipY}px`; tip.style.transform = tip.classList.contains('dot') ? '' : `rotate(${ang + 45}deg)`;
    // cash-out markers of everyone who got out: a dot on the curve at their multiplier
    for (const mk of cashMarks.children) { const mm = Number(mk.dataset.m); const t = (Math.log(mm) / CRASH_K) * 1000; mk.style.left = `${(t / T) * rect.width}px`; mk.style.top = `${((60 - ((mm - 1) / (M - 1)) * 60) / 60) * rect.height}px`; mk.hidden = t > elapsed; }
    const xs = [0, .25, .5, .75, 1].map((f) => fmtS(T * f)), ys = [1, 1 + (M - 1) * .25, 1 + (M - 1) * .5, 1 + (M - 1) * .75, M].map((v) => fmtMult(v));
    const key = xs.join() + '|' + ys.join();
    if (key !== tickKey) { tickKey = key; ticksX.replaceChildren(...xs.map((s) => h('span', {}, s))); ticksY.replaceChildren(...ys.map((s) => h('span', {}, s))); if (!grid.childElementCount) grid.replaceChildren(...[.25, .5, .75].map((f) => el('line', { x1: 0, x2: 100, y1: 60 - 60 * f, y2: 60 - 60 * f, class: 'gl', 'vector-effect': 'non-scaling-stroke' })), ...[.25, .5, .75].map((f) => el('line', { x1: 100 * f, x2: 100 * f, y1: 0, y2: 60, class: 'gl', 'vector-effect': 'non-scaling-stroke' }))); }
  }
  let lastPhase = '', lastRound = 0;
  function frame() {
    if (dead) return;
    raf = requestAnimationFrame(frame);
    if (!state) return;
    const t = poller.clock.now(), r = state.round;
    if (state.phase === 'betting') {
      const rem = r.bettingEnds - t;
      bar.set('Place your bets', { remaining: rem, total: state.timing.betting, tone: 'open' });
      wait.firstChild.textContent = `${Math.max(0, rem / 1000).toFixed(1)}s`;
    } else if (state.phase === 'running') {
      const elapsed = Math.max(0, t - r.startedAt), m = crashMultAt(elapsed);
      readout.firstChild.textContent = fmtMult(m);
      const mine = state.mine[0];
      if (mine && mine.cashout == null) cash.querySelector('span').textContent = `Cash out ${fmt(mine.amount * m)} AGT`;
      bar.set('In flight', { tone: 'live' });
      drawFrame(elapsed, m);
    } else {
      const rem = r.endsAt + state.timing.ending - t;
      bar.set(`Crashed at ${fmtMult(r.result)}`, { remaining: rem, total: state.timing.ending, tone: 'over' });
    }
  }
  /* ---- state from the server ---- */
  function onState(s) {
    const prev = state; state = s;
    const r = s.round;
    if (r.id !== lastRound) { lastRound = r.id; seen.clear(); cashMarks.replaceChildren(); area.classList.remove('crashed'); readout.lastChild.textContent = 'waiting'; readout.firstChild.textContent = '1.00x'; drawFrame(0, 1, { snap: true }); banner.hide(); }
    if (s.phase !== lastPhase) {
      lastPhase = s.phase;
      area.classList.toggle('betting', s.phase === 'betting');
      if (s.phase === 'running') { sound.play('launch'); readout.lastChild.textContent = s.mine[0] ? (s.mine[0].auto ? `Auto cash out at ${fmtMult(s.mine[0].auto)}` : 'You are in') : 'Current payout'; }
      if (s.phase === 'ended') {
        const point = r.result, mine = s.mine[0];
        drawFrame((Math.log(point) / CRASH_K) * 1000, point, { snap: true });
        readout.firstChild.textContent = fmtMult(point);
        area.classList.add('crashed');
        if (mine && mine.cashout === 0) { sound.play('crash'); flashRed(L.board); readout.lastChild.textContent = 'Crashed · you were still in'; }
        else { sound.play(mine ? 'pop' : 'tick'); readout.lastChild.textContent = 'Crashed'; }
      }
    }
    // my settlements: announce once, then refresh stats quietly
    for (const b of s.mine) {
      if (b.payout == null || seen.has(b.id)) continue;
      seen.add(b.id);
      const win = b.payout > 0, net = b.payout - b.amount;
      banner.show(win ? `WIN ${fmtMult(b.cashout)} · +${fmt(net)} AGT` : `Crashed at ${fmtMult(r.result ?? 0)} · −${fmt(b.amount)} AGT`, win);
      strip.push(fmtMult(win ? b.cashout : 0), win);
      if (win) { sound.play(b.cashout >= 5 ? 'bigwin' : 'cashout'); flashGreen(L.board); if (b.cashout >= 5) winBurst(L.board); }
      api.refresh().catch(() => {});
    }
    // markers for everyone who cashed out
    for (const b of s.bets) if (b.cashout > 0 && !cashMarks.querySelector(`[data-id="${b.id}"]`)) { const mk = h('span', { class: `cash-mark${b.mine ? ' me' : ''}`, 'data-id': String(b.id), 'data-m': String(b.cashout), title: `${b.username} ${fmtMult(b.cashout)}` }); cashMarks.append(mk); if (!b.mine && prev) sound.play('tick'); }
    players.paint(s.bets, (b) => [h('span', { class: 'num' }, fmt(b.amount)), h('span', { class: `num ${b.cashout > 0 ? 'good' : b.cashout === 0 ? 'bad' : ''}` }, b.cashout > 0 ? fmtMult(b.cashout) : b.cashout === 0 ? '✗' : b.auto ? `auto ${fmtMult(b.auto)}` : '—'), h('span', { class: `num ${b.payout > 0 ? 'good' : b.payout === 0 ? 'bad' : ''}` }, b.payout == null ? '' : b.payout > 0 ? `+${fmt(b.payout - b.amount)}` : `−${fmt(b.amount)}`)]);
    hist.paint(s.history, pointColour);
    fair.paint(r);
    paintControls();
  }
  function paintControls() {
    const s = state; if (!s) return;
    const mine = s.mine[0];
    const open = s.phase === 'betting', flying = s.phase === 'running';
    play.disabled = busy || !open || Boolean(mine);
    play.querySelector('span').textContent = mine && open ? 'Bet placed' : open ? 'Place bet' : 'Bets closed';
    amount.setDisabled(Boolean(mine) && open); autoField.input.disabled = Boolean(mine) && open;
    cash.disabled = busy || !(flying && mine && mine.cashout == null);
    if (!(flying && mine && mine.cashout == null)) cash.querySelector('span').textContent = mine && mine.cashout > 0 ? `Cashed out ${fmtMult(mine.cashout)}` : 'Cash out';
    hint.textContent = open ? (mine ? 'Your bet is in. The flight starts when the timer ends.' : 'Bets are open. Everyone at the table rides the same curve.') : flying ? (mine ? (mine.cashout == null ? 'Tap cash out any time. Once it crashes, the bet is gone.' : 'You are out. Watch the rest ride.') : 'Watching this round. Bet on the next one.') : 'Next round opens in a moment.';
  }
  async function bet() {
    if (busy) return;
    busy = true; paintControls(); sound.play('click');
    try { const r = await api.liveBet('crash', { amount: amount.get(), auto }); state.mine = [r.bet]; state.bets = [r.bet, ...state.bets]; haptic(10); }
    catch (e) { toast(e.message, 'bad'); }
    busy = false; paintControls(); poller.kick();
  }
  async function cashout() {
    if (busy) return;
    busy = true; cash.disabled = true;
    try { const r = await api.liveCashout(); if (state?.mine[0]) Object.assign(state.mine[0], r.bet); sound.play('cashout'); flashGreen(L.board); haptic(18); }
    catch (e) { toast(e.message, 'bad'); }
    busy = false; paintControls(); poller.kick();
  }
  /** One automatic round: wait for bets to open, place the bet with the auto cash out, wait for it to settle. */
  async function playAuto(amt) {
    await waitFor(() => dead || (state && state.phase === 'betting' && !state.mine[0] && !busy));
    if (dead) return null;
    busy = true; paintControls();
    let bet;
    try { const r = await api.liveBet('crash', { amount: amt, auto }); bet = r.bet; state.mine = [bet]; state.bets = [bet, ...state.bets]; }
    catch (e) { toast(e.message, 'bad'); busy = false; paintControls(); return null; }
    busy = false; paintControls(); poller.kick();
    const roundId = state.round.id;
    await waitFor(() => dead || state.round.id !== roundId || state.mine.some((b) => b.id === bet.id && b.payout != null));
    if (dead) return null;
    const m = state.mine.find((b) => b.id === bet.id);
    if (!m || m.payout == null) return { net: 0, amount: amt, multiplier: 0 };
    return { net: m.payout - m.amount, amount: m.amount, multiplier: m.cashout || 0 };
  }
  attachAuto({ panel: L.controls, amount, manual: [play], playRound: playAuto, canStart: () => (auto >= 1.01 ? null : 'Set an auto cash out first. Auto bet rides every round and cashes out there.'), rtp: () => 0.99, note: 'Places this bet on every round and cashes out at your auto value.' });
  L.controls.append(players.el);
  const poller = livePoller('crash', onState);
  drawFrame(0, 1, { snap: true });
  raf = requestAnimationFrame(frame);
  return { unmount() { dead = true; cancelAnimationFrame(raf); poller.stop(); } };
}
