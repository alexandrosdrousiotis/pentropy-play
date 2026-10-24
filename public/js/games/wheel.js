import { h, button, segmented, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, payoutLine } from './common.js';
import { WHEEL_SEGMENTS, WHEEL_RISKS, wheelTable, wheelRtp } from '../../shared/math.js';
import { sound, tween, ease, flashGreen, winBurst } from '../fx.js';
import { attach as attachAuto } from './autobet.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const colour = (m) => (m === 0 ? '#2a2d33' : m >= 20 ? '#f0616d' : m >= 5 ? '#f5ac37' : m >= 2 ? '#4f7bff' : m >= 1.5 ? '#27ad75' : '#9ca3af');
export function mount(root, meta) {
  const L = layout(root);
  let segments = 30, risk = 'medium', busy = false, angle = 0;
  const amount = betAmount(10, () => reality.update());
  const riskSeg = segmented(WHEEL_RISKS.map((r) => ({ value: r, label: r })), risk, (v) => { if (busy) { riskSeg.set(risk); return; } risk = v; build(); reality.update(); }, { block: true });
  const segSeg = segmented(WHEEL_SEGMENTS.map((s) => ({ value: s, label: String(s) })), segments, (v) => { if (busy) { segSeg.set(segments); return; } segments = v; build(); reality.update(); }, { block: true });
  const play = button('Spin', { kind: 'primary', size: 'lg block', onClick: () => go() });
  L.controls.append(amount, h('div', { class: 'field' }, h('label', {}, 'Risk'), riskSeg), h('div', { class: 'field' }, h('label', {}, 'Segments'), segSeg), play);
  const wrap = h('div', { class: 'wheel-wrap' });
  const svg = el('svg', { viewBox: '-100 -100 200 200' });
  const disc = el('g', {});
  svg.append(disc, el('circle', { r: 58, fill: 'var(--surface)' }));
  const pointer = h('div', { class: 'wheel-pointer' });
  const readout = h('div', { class: 'wheel-readout num' }, '—');
  wrap.append(svg, pointer, readout);
  const legend = h('div', { class: 'wheel-legend' });
  L.stage.append(h('div', { class: 'stack', style: { justifyItems: 'center', width: '100%', gap: '12px' } }, wrap, legend));
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(h('h3', {}, 'Recent spins'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => { const t = wheelTable(risk, segments); return { rtp: wheelRtp(risk, segments), winChance: t.filter((m) => m > 1).length / segments }; });
  L.reality.append(reality);
  function build() {
    const t = wheelTable(risk, segments);
    disc.replaceChildren();
    const step = (2 * Math.PI) / segments;
    t.forEach((m, i) => {
      const a0 = i * step - Math.PI / 2, a1 = a0 + step;
      const p = (a, r) => `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`;
      disc.append(el('path', { d: `M${p(a0, 96)} A96,96 0 0 1 ${p(a1, 96)} L${p(a1, 62)} A62,62 0 0 0 ${p(a0, 62)} Z`, fill: colour(m), stroke: 'var(--bg)', 'stroke-width': 1.2 }));
    });
    const uniq = [...new Set(t)].sort((a, b) => b - a);
    legend.replaceChildren(...uniq.map((m) => h('span', { class: 'chip', style: { background: colour(m), color: m === 0 ? 'var(--fg-3)' : '#0a0b0d' } }, fmtMult(m))));
    disc.style.transform = `rotate(${angle}deg)`;
  }
  build();
  async function go(amt = amount.get()) {
    if (busy) return null;
    busy = true; play.disabled = true; amount.setDisabled(true); sound.play('click');
    const out = await tryBet('wheel', amt, { segments, risk }, { defer: true });
    if (!out) { busy = false; play.disabled = false; amount.setDisabled(false); return null; }
    const { round } = out; const idx = round.outcome.index; const t = wheelTable(risk, segments);
    const step = 360 / segments;
    const target = 360 * 5 + (360 - (idx * step + step / 2)); // segment idx lands under the top pointer
    const from = angle % 360;
    const to = from + target;
    let lastTick = -1;
    await tween(3200, (e) => { const a = from + (to - from) * e; disc.style.transform = `rotate(${a}deg)`; const tick = Math.floor(a / step); if (tick !== lastTick) { lastTick = tick; sound.play('tick'); } }, ease.outCubic);
    angle = to % 360; disc.style.transform = `rotate(${angle}deg)`;
    const win = round.multiplier > 1;
    readout.textContent = fmtMult(t[idx]); readout.className = `wheel-readout num ${win ? 'good' : round.multiplier === 0 ? 'bad' : ''}`;
    if (win) { sound.play(round.multiplier >= 5 ? 'bigwin' : 'win'); flashGreen(L.board); if (round.multiplier >= 10) winBurst(L.board); } else if (round.multiplier === 0) sound.play('lose'); else sound.play('reveal');
    banner.show(`${fmtMult(t[idx])} · ${payoutLine(round)}`, round.multiplier > 1 ? true : round.multiplier === 1 ? 'push' : false);
    strip.push(fmtMult(t[idx]), win);
    out.commit(); busy = false; play.disabled = false; amount.setDisabled(false);
    return round;
  }
  attachAuto({ panel: L.controls, amount, manual: [play], playRound: (a) => go(a), rtp: () => wheelRtp(risk, segments) });
  return { unmount() {} };
}
