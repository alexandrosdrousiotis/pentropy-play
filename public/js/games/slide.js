import { h, button, numberInput, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, payoutLine } from './common.js';
import { limboWinChance, LIMBO_MAX } from '../../shared/math.js';
import { sound, tween, flashGreen, flashRed, winBurst, popIn } from '../fx.js';
import { attach as attachAuto } from './autobet.js';

const TILE = 84, GAP = 6, PITCH = TILE + GAP, N = 56, R = 46; // reel geometry: result tile sits at index R
const samplePoint = () => Math.min(10000, Math.max(1, Math.floor((99 / (100 * (1 - Math.random()))) * 100) / 100));
const tier = (m) => (m < 1.5 ? 'c1' : m < 2 ? 'c2' : m < 5 ? 'c3' : m < 10 ? 'c4' : 'c5');
const short = (m) => (m >= 1000 ? `${Math.round(m / 1000)}k×` : m >= 100 ? `${Math.round(m)}×` : `${m.toFixed(2)}×`);
const spinEase = (t) => 1 - (1 - t) ** 5;
export function mount(root, meta) {
  const L = layout(root);
  let target = 2, busy = false;
  const amount = betAmount(10, () => reality.update());
  const targetField = numberInput({ label: 'Target multiplier', value: target, min: 1.01, max: LIMBO_MAX, step: 0.01, unit: 'x', onChange: (v) => { target = Math.min(LIMBO_MAX, Math.max(1.01, Math.round(v * 100) / 100)); drawTarget(); reality.update(); } });
  const play = button('Slide', { kind: 'primary', size: 'lg block', onClick: () => go() });
  L.controls.append(amount, targetField, play);
  const reel = h('div', { class: 'slide-reel' });
  const needle = h('div', { class: 'slide-needle' });
  const view = h('div', { class: 'slide-view' }, reel, needle);
  const readout = h('div', { class: 'bignum num', style: { fontSize: '56px' } }, '1.00x');
  const sub = h('div', { class: 'bubble' }, `target ${fmtMult(target)}`);
  L.stage.append(h('div', { class: 'stack', style: { width: '100%', justifyItems: 'center', gap: '18px' } }, readout, view, sub));
  let tiles = [], values = [];
  /** Fill the reel with random outcomes and put the real one at index R. */
  function buildReel(point) {
    values = Array.from({ length: N }, () => samplePoint());
    if (point != null) values[R] = point;
    tiles = values.map((m) => h('div', { class: `stile num ${tier(m)}${m >= target ? ' ok' : ''}` }, short(m)));
    reel.replaceChildren(...tiles);
    reel.style.transition = 'none';
    reel.style.transform = `translateX(${(view.clientWidth || 600) / 2 - (2 * PITCH + TILE / 2)}px)`;
  }
  function markOk() { tiles.forEach((t, i) => t.classList.toggle('ok', values[i] >= target)); }
  const banner = outcomeBanner(L.board);
  const results = resultsStrip();
  L.results.append(h('h3', {}, 'Recent slides'), results.el);
  const reality = realityPanel(meta, () => amount.get(), () => ({ winChance: limboWinChance(target), multiplier: target }));
  L.reality.append(reality);
  function drawTarget() { sub.textContent = `target ${fmtMult(target)}`; markOk(); }
  buildReel(null); drawTarget();
  requestAnimationFrame(() => buildReel(null));
  async function go(amt = amount.get()) {
    if (busy) return null;
    busy = true; play.disabled = true; amount.setDisabled(true); sound.play('click');
    const out = await tryBet('slide', amt, { target }, { defer: true });
    if (!out) { busy = false; play.disabled = false; amount.setDisabled(false); return null; }
    const { round } = out; const point = round.outcome.point;
    readout.className = 'bignum num'; readout.style.fontSize = '56px';
    buildReel(point);
    const centre = (view.clientWidth || 600) / 2;
    const x0 = centre - (2 * PITCH + TILE / 2);
    const x1 = centre - (R * PITCH + TILE / 2) + (Math.random() - 0.5) * TILE * 0.7;
    let last = -1;
    await tween(2800, (e) => {
      const x = x0 + (x1 - x0) * e; reel.style.transform = `translateX(${x}px)`;
      const under = Math.floor((centre - x) / PITCH);
      if (under !== last) { last = under; sound.play('tick'); readout.textContent = fmtMult(values[Math.max(0, Math.min(N - 1, under))] ?? 1); }
    }, spinEase);
    tiles[R].classList.add('land'); popIn(tiles[R]);
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
