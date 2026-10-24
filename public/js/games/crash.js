import { h, button, numberInput, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt, svgUse } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, tryAct, payoutLine, openRoundFor } from './common.js';
import { api } from '../api.js';
import { crashMultiplierAt, limboWinChance, LIMBO_MAX } from '../../shared/math.js';
import { sound, flashGreen, flashRed, shake, winBurst, sparkle, shockwave } from '../fx.js';
import { attach as attachAuto } from './autobet.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

export function mount(root, meta) {
  const L = layout(root);
  let auto = 0, round = null, raf = 0, poll = 0, startedAt = 0, done = true, resolveRound = null;
  const amount = betAmount(10, () => reality.update());
  const autoField = numberInput({ label: 'Auto cash out (0 = manual)', value: auto, min: 0, max: LIMBO_MAX, step: 0.01, unit: 'x', onChange: (v) => { auto = v > 0 ? Math.max(1.01, Math.round(v * 100) / 100) : 0; reality.update(); } });
  const play = button('Launch', { kind: 'primary', size: 'lg block', onClick: () => start() });
  const cash = button('Cash out', { kind: 'orange', size: 'xl block', disabled: true, onClick: () => cashout() });
  L.controls.append(amount, autoField, play, cash);

  const area = h('div', { class: 'crash-area' });
  const svg = el('svg', { viewBox: '0 0 100 60', preserveAspectRatio: 'none' });
  const grid = el('g', {});
  const fill = el('path', { d: '', fill: 'url(#crashfill)', opacity: .5 });
  const line = el('path', { d: '', class: 'line', fill: 'none', stroke: '#e6b655', 'stroke-width': 1.3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' });
  const defs = el('defs', {});
  const grad = el('linearGradient', { id: 'crashfill', x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.append(el('stop', { offset: 0, 'stop-color': '#e6b655', 'stop-opacity': .45 }), el('stop', { offset: 1, 'stop-color': '#e6b655', 'stop-opacity': 0 }));
  defs.append(grad);
  svg.append(defs, grid, fill, line);
  const dot = h('div', { class: 'crash-ship' }, svgUse('ph-rocket-launch'), h('i', { class: 'flame' }));
  const readout = h('div', { class: 'readout num' }, '1.00x', h('small', {}, 'ready'));
  const ticksX = h('div', { class: 'ticks-x' }), ticksY = h('div', { class: 'ticks-y' });
  const stamp = h('div', { class: 'stamp' }, 'Crashed');
  area.append(svg, dot, ticksX, ticksY, readout, stamp);
  L.stage.append(area);
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(h('h3', {}, 'Recent crashes'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => (auto ? { winChance: limboWinChance(auto), multiplier: auto, note: `Auto cash out at ${fmtMult(auto)} is exactly a Limbo bet: ${fmtPct(limboWinChance(auto), 2)} × ${fmtMult(auto)} = 0.99.` } : { note: 'Whatever moment you pick, the expected return is 99%. Cashing out at 1.50x wins 66% of the time; at 10x, 9.9%. Same loss, different feeling.' }));
  L.reality.append(reality);

  const fmtS = (ms) => `${(ms / 1000).toFixed(0)}s`;
  function drawFrame(elapsed, m) {
    const T = Math.max(8000, elapsed * 1.08), M = Math.max(2, m * 1.15);
    const pts = [];
    const N = 80;
    for (let i = 0; i <= N; i++) { const t = (elapsed * i) / N; pts.push([(t / T) * 100, 60 - ((crashMultiplierAt(t) - 1) / (M - 1)) * 54]); }
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
    line.setAttribute('d', d);
    fill.setAttribute('d', `${d} L${pts[N][0].toFixed(2)},60 L0,60 Z`);
    const rect = area.getBoundingClientRect();
    const tipX = (pts[N][0] / 100) * rect.width, tipY = (pts[N][1] / 60) * rect.height;
    const prevX = (pts[N - 4][0] / 100) * rect.width, prevY = (pts[N - 4][1] / 60) * rect.height;
    const ang = elapsed > 0 ? Math.atan2(tipY - prevY, tipX - prevX) * 180 / Math.PI : -20;
    dot.classList.add('on'); dot.style.left = `${tipX}px`; dot.style.top = `${tipY}px`; dot.style.transform = `translate(-50%,-50%) rotate(${ang + 45}deg)`;
    // axes
    ticksX.replaceChildren(...[0, .25, .5, .75, 1].map((f) => h('span', {}, fmtS(T * f))));
    const ys = [1, 1 + (M - 1) * .25, 1 + (M - 1) * .5, 1 + (M - 1) * .75, M];
    ticksY.replaceChildren(...ys.map((v) => h('span', {}, fmtMult(v))));
    grid.replaceChildren(...[.25, .5, .75].map((f) => el('line', { x1: 0, x2: 100, y1: 60 - 54 * f, y2: 60 - 54 * f, stroke: 'rgba(255,255,255,.06)', 'stroke-width': .3 })));
  }
  function frame() {
    if (done) return;
    const elapsed = performance.now() - startedAt;
    const m = crashMultiplierAt(elapsed);
    readout.firstChild.textContent = fmtMult(m);
    cash.querySelector('span').textContent = `Cash out ${fmt(round.amount * m)} AGT`;
    drawFrame(elapsed, m);
    raf = requestAnimationFrame(frame);
  }
  function setLive(live) {
    play.disabled = live; amount.setDisabled(live); autoField.input.disabled = live; cash.disabled = !live;
    readout.classList.toggle('live', live);
    if (!live) cash.querySelector('span').textContent = 'Cash out';
  }
  async function start(amt = amount.get()) {
    if (round) return null;
    play.disabled = true; sound.play('click');
    const t0 = performance.now();
    const out = await tryBet('crash', amt, { autoCashout: auto });
    if (!out) { play.disabled = false; return null; }
    const settled = new Promise((r) => { resolveRound = r; });
    begin(out.round, performance.now() - t0);
    return settled;
  }
  function begin(r, latency = 0) {
    round = r; done = false;
    startedAt = performance.now() - (r.view.elapsed ?? 0) - latency / 2;
    area.classList.remove('crashed'); line.setAttribute('stroke', '#e6b655'); dot.classList.remove('boom');
    readout.lastChild.textContent = auto ? `auto at ${fmtMult(auto)}` : 'climbing';
    banner.hide(); setLive(true); sound.play('launch');
    raf = requestAnimationFrame(frame);
    let polling = false;
    poll = setInterval(async () => {
      if (!round || polling) return;
      polling = true;
      try { const o = await api.act('poll'); if (round && o.round.status === 'settled') finish(o.round); }
      catch { /* a poll that lands after settlement finds no round; that is fine */ }
      polling = false;
    }, 450);
  }
  async function cashout() {
    if (!round) return;
    cash.disabled = true; sound.play('click');
    const out = await tryAct('cashout');
    if (out) finish(out.round); else cash.disabled = false;
  }
  function finish(r) {
    if (!round) return;
    round = null; done = true; cancelAnimationFrame(raf); clearInterval(poll);
    const win = r.multiplier > 0;
    const point = r.outcome.point;
    const elapsedAtPoint = (Math.log(point) / 0.12) * 1000;
    drawFrame(elapsedAtPoint, point);
    readout.firstChild.textContent = fmtMult(win ? r.multiplier : point);
    readout.lastChild.textContent = win ? `cashed out${r.outcome.auto ? ' (auto)' : ''} · crashed at ${fmtMult(point)}` : `crashed at ${fmtMult(point)}`;
    if (!win) { sparkle(dot, L.board, { color: '#ff5c7a', count: 24, spread: 90 }); shockwave(dot, L.board); dot.classList.add('boom'); area.classList.add('crashed'); sound.play('crash'); shake(area); flashRed(L.board); }
    else { sparkle(dot, L.board, { color: '#3ccf8f', count: 14, spread: 60 }); sound.play(r.multiplier >= 5 ? 'bigwin' : 'cashout'); flashGreen(L.board); if (r.multiplier >= 5) winBurst(L.board); }
    banner.show(win ? `WIN ${payoutLine(r)}` : `Crashed at ${fmtMult(point)} · −${fmt(r.amount)} AGT`, win);
    strip.push(fmtMult(point), win);
    setLive(false);
    if (resolveRound) { const rr = resolveRound; resolveRound = null; rr(r); }
  }
  drawFrame(0, 1);
  attachAuto({ panel: L.controls, amount, manual: [play, cash], playRound: (a) => start(a), canStart: () => (auto > 0 ? null : 'Set an auto cash out multiplier to run auto bet.'), rtp: () => 0.99 });
  const existing = openRoundFor('crash');
  if (existing) { auto = existing.params.autoCashout || 0; autoField.set(auto); amount.set(existing.amount); begin(existing); }
  return { unmount() { done = true; cancelAnimationFrame(raf); clearInterval(poll); } };
}
