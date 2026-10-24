import { h, button, numberInput, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, payoutLine } from './common.js';
import { limboWinChance, LIMBO_MAX } from '../../shared/math.js';
import { sound, tween, ease, flashGreen, flashRed, winBurst } from '../fx.js';
import { attach as attachAuto } from './autobet.js';

const STOPS = [1, 1.1, 1.25, 1.5, 2, 3, 5, 10, 25, 100, 1000, 10000];
const pos = (m) => { // multiplier → 0..1 on a log strip
  const lo = Math.log(1), hi = Math.log(10000); return Math.min(1, Math.max(0, (Math.log(Math.max(1, m)) - lo) / (hi - lo)));
};
export function mount(root, meta) {
  const L = layout(root);
  let target = 2, busy = false;
  const amount = betAmount(10, () => reality.update());
  const targetField = numberInput({ label: 'Target multiplier', value: target, min: 1.01, max: LIMBO_MAX, step: 0.01, unit: 'x', onChange: (v) => { target = Math.min(LIMBO_MAX, Math.max(1.01, Math.round(v * 100) / 100)); drawTarget(); reality.update(); } });
  const play = button('Slide', { kind: 'primary', size: 'lg block', onClick: () => go() });
  L.controls.append(amount, targetField, play);
  const strip = h('div', { class: 'slide-strip' });
  const ticks = h('div', { class: 'slide-ticks' }, ...STOPS.map((m) => h('span', { style: { left: `${pos(m) * 100}%` } }, fmtMult(m).replace('.00', ''))));
  const needle = h('div', { class: 'slide-needle' });
  const marker = h('div', { class: 'slide-target' });
  const readout = h('div', { class: 'bignum num', style: { fontSize: '56px' } }, '1.00x');
  const sub = h('div', { class: 'bubble' }, `target ${fmtMult(target)}`);
  strip.append(ticks, marker, needle);
  L.stage.append(h('div', { class: 'stack', style: { width: '100%', justifyItems: 'center', gap: '18px' } }, readout, strip, sub));
  const banner = outcomeBanner(L.board);
  const results = resultsStrip();
  L.results.append(h('h3', {}, 'Recent slides'), results.el);
  const reality = realityPanel(meta, () => amount.get(), () => ({ winChance: limboWinChance(target), multiplier: target }));
  L.reality.append(reality);
  function drawTarget() { marker.style.left = `${pos(target) * 100}%`; sub.textContent = `target ${fmtMult(target)}`; }
  drawTarget();
  async function go(amt = amount.get()) {
    if (busy) return null;
    busy = true; play.disabled = true; amount.setDisabled(true); sound.play('click');
    const out = await tryBet('slide', amt, { target }, { defer: true });
    if (!out) { busy = false; play.disabled = false; amount.setDisabled(false); return null; }
    const { round } = out; const point = round.outcome.point;
    readout.className = 'bignum num'; readout.style.fontSize = '56px';
    const from = parseFloat(needle.style.left) / 100 || 0, to = pos(point);
    const overshoot = Math.min(1, to + 0.08);
    await tween(900, (e) => { const x = from + (overshoot - from) * e; needle.style.left = `${x * 100}%`; readout.textContent = fmtMult(Math.exp(x * Math.log(10000))); }, ease.outCubic);
    await tween(350, (e) => { const x = overshoot + (to - overshoot) * e; needle.style.left = `${x * 100}%`; }, ease.outBack);
    readout.textContent = fmtMult(point);
    const win = round.multiplier > 0;
    readout.classList.add(win ? 'win' : 'loss');
    if (win) { sound.play(round.multiplier >= 10 ? 'bigwin' : 'win'); flashGreen(L.board); if (round.multiplier >= 10) winBurst(L.board); } else { sound.play('lose'); flashRed(L.board); }
    banner.show(win ? `WIN ${payoutLine(round)}` : `${fmtMult(point)} < ${fmtMult(target)} · −${fmt(round.amount)} AGT`, win);
    results.push(fmtMult(point), win);
    out.commit(); busy = false; play.disabled = false; amount.setDisabled(false);
    return round;
  }
  attachAuto({ panel: L.controls, amount, manual: [play], playRound: (a) => go(a), rtp: () => 0.99 });
  return { unmount() {} };
}
