import { h, button, numberInput, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, tryAct, payoutLine, openRoundFor } from './common.js';
import { CRASH_K, crashMultiplierAt, limboWinChance, LIMBO_MAX } from '../../shared/math.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

export function mount(root, meta) {
  const L = layout(root);
  let auto = 0, round = null, raf = 0, poll = 0, startedAt = 0, done = true;
  const amount = betAmount(10, () => reality.update());
  const autoField = numberInput({ label: 'Auto cash out (0 = manual)', value: auto, min: 0, max: LIMBO_MAX, step: 0.01, unit: 'x', onChange: (v) => { auto = v > 0 ? Math.max(1.01, Math.round(v * 100) / 100) : 0; reality.update(); } });
  const play = button('Launch', { kind: 'primary', size: 'lg block', onClick: () => start() });
  const cash = button('Cash out', { kind: 'orange', size: 'xl block', disabled: true, onClick: () => cashout() });
  L.controls.append(amount, autoField, play, cash,
    h('p', { class: 'help' }, 'The multiplier is e^(0.12·seconds) on the server clock. Cashing out is a request; the server decides what the multiplier was when it arrived. Auto cash out fires on the server even if your connection is slow.'));

  const area = h('div', { class: 'crash-area' });
  const svg = el('svg', { viewBox: '0 0 100 60', preserveAspectRatio: 'none' });
  const grid = el('g', {});
  for (let i = 1; i < 6; i++) grid.append(el('line', { x1: 0, x2: 100, y1: i * 10, y2: i * 10, stroke: 'rgba(255,255,255,.06)', 'stroke-width': .3 }));
  const area2 = el('path', { d: '', fill: 'url(#crashfill)', opacity: .35 });
  const line = el('path', { d: '', fill: 'none', stroke: '#a685ff', 'stroke-width': 1.1, 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' });
  const defs = el('defs', {});
  const grad = el('linearGradient', { id: 'crashfill', x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.append(el('stop', { offset: 0, 'stop-color': '#7950e5' }), el('stop', { offset: 1, 'stop-color': '#7950e5', 'stop-opacity': 0 }));
  defs.append(grad);
  svg.append(defs, grid, area2, line);
  const readout = h('div', { class: 'readout num' }, '1.00x', h('small', {}, 'ready'));
  area.append(svg, readout);
  L.stage.append(area);
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(h('h3', {}, 'Recent crashes'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => (auto ? { winChance: limboWinChance(auto), multiplier: auto, note: `Auto cash out at ${fmtMult(auto)} is exactly a Limbo bet: ${fmtPct(limboWinChance(auto), 2)} × ${fmtMult(auto)} = 0.99.` } : { note: 'Whatever moment you pick, the expected return is 99%. Cashing out at 1.50x wins 66% of the time; at 10x, 9.9%. Same loss, different feeling.' }));
  L.reality.append(reality);

  function frame() {
    if (done) return;
    const elapsed = performance.now() - startedAt;
    const m = crashMultiplierAt(elapsed);
    readout.firstChild.textContent = fmtMult(m);
    cash.querySelector('span').textContent = `Cash out ${fmt(round.amount * m)} AGT`;
    // curve: x = time, y = multiplier, with a window that grows
    const T = Math.max(6000, elapsed * 1.1), M = Math.max(2, m * 1.15);
    const pts = [];
    for (let i = 0; i <= 60; i++) { const t = (elapsed * i) / 60; pts.push([(t / T) * 100, 60 - ((crashMultiplierAt(t) - 1) / (M - 1)) * 56]); }
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
    line.setAttribute('d', d);
    area2.setAttribute('d', `${d} L${pts[pts.length - 1][0].toFixed(2)},60 L0,60 Z`);
    raf = requestAnimationFrame(frame);
  }
  function setLive(live) {
    play.disabled = live; amount.setDisabled(live); autoField.input.disabled = live; cash.disabled = !live;
    if (!live) cash.querySelector('span').textContent = 'Cash out';
  }
  async function start() {
    if (round) return;
    const t0 = performance.now();
    const out = await tryBet('crash', amount.get(), { autoCashout: auto });
    if (!out) return;
    begin(out.round, performance.now() - t0);
  }
  function begin(r, latency = 0) {
    round = r; done = false;
    startedAt = performance.now() - (r.view.elapsed ?? 0) - latency / 2;
    area.classList.remove('crashed');
    readout.lastChild.textContent = auto ? `auto at ${fmtMult(auto)}` : 'climbing';
    banner.hide(); setLive(true);
    raf = requestAnimationFrame(frame);
    poll = setInterval(async () => { if (!round) return; const o = await tryAct('poll'); if (o && o.round.status === 'settled') finish(o.round); }, 450);
  }
  async function cashout() {
    if (!round) return;
    cash.disabled = true;
    const out = await tryAct('cashout');
    if (out) finish(out.round); else cash.disabled = false;
  }
  function finish(r) {
    if (!round) return;
    round = null; done = true; cancelAnimationFrame(raf); clearInterval(poll);
    const win = r.multiplier > 0;
    const point = r.outcome.point;
    readout.firstChild.textContent = fmtMult(win ? r.multiplier : point);
    readout.lastChild.textContent = win ? `cashed out${r.outcome.auto ? ' (auto)' : ''} · crashed at ${fmtMult(point)}` : `crashed at ${fmtMult(point)}`;
    if (!win) area.classList.add('crashed');
    banner.show(win ? `WIN ${payoutLine(r)}` : `Crashed at ${fmtMult(point)} · −${fmt(r.amount)} AGT`, win);
    strip.push(fmtMult(point), win);
    setLive(false);
  }
  const existing = openRoundFor('crash');
  if (existing) { auto = existing.params.autoCashout || 0; autoField.set(auto); amount.set(existing.amount); begin(existing); }
  return { unmount() { done = true; cancelAnimationFrame(raf); clearInterval(poll); } };
}
