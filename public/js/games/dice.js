import { h, button, numberInput, segmented, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, payoutLine } from './common.js';
import { user } from '../api.js';
import { diceMultiplier, diceChanceFromMultiplier, DICE_MIN_CHANCE, DICE_MAX_CHANCE } from '../../shared/math.js';
import { sound, ticker, tween, ease, flashGreen, flashRed, sparkle } from '../fx.js';
import { attach as attachAuto } from './autobet.js';

const MODES = [{ value: 'over', label: 'Over' }, { value: 'under', label: 'Under' }, { value: 'inside', label: 'Inside' }, { value: 'outside', label: 'Outside' }];
const r2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function mount(root, meta) {
  const L = layout(root);
  // over/under keep one edge (the threshold); inside/outside keep two (lo, hi)
  let mode = 'over', chance = 50, lo = 25, hi = 75, busy = false, lastLost = false;
  const amount = betAmount(10, () => reality.update());
  const chanceField = numberInput({ label: 'Win chance', value: chance, min: DICE_MIN_CHANCE, max: DICE_MAX_CHANCE, step: 0.01, unit: '%', onChange: (v) => setChance(v) });
  const multField = numberInput({ label: 'Multiplier', value: diceMultiplier(chance), min: 1.0102, max: 9900, step: 0.01, unit: 'x', onChange: (v) => setChance(diceChanceFromMultiplier(v)) });
  const modeSeg = segmented(MODES, mode, (v) => { setMode(v); sound.play('tick'); }, { block: true });
  const play = button('Roll', { kind: 'primary', size: 'lg block', onClick: () => go() });
  const martingale = button('Double after loss', { kind: 'ghost', size: 'sm', onClick: () => { if (lastLost) amount.set(Math.min(Math.floor((user()?.balance ?? 0) * 100) / 100, Math.round(amount.get() * 200) / 100)); reality.update(); } });
  L.controls.append(amount, h('div', { class: 'field' }, h('label', {}, 'Win zone'), modeSeg), h('div', { class: 'two' }, chanceField, multField), play, martingale);

  const two = () => mode === 'inside' || mode === 'outside';
  const winChance = () => (two() ? (mode === 'inside' ? r2(hi - lo) : r2(100 - (hi - lo))) : chance);
  const params = () => (two() ? { mode, lo, hi } : { chance, over: mode === 'over' });
  /** Set the win chance from the fields: moves the threshold, or widens the zone around its centre. */
  function setChance(v) {
    const c = clamp(r2(v), DICE_MIN_CHANCE, DICE_MAX_CHANCE);
    if (!two()) chance = c;
    else { const span = mode === 'inside' ? c : r2(100 - c); const mid = (lo + hi) / 2; lo = clamp(r2(mid - span / 2), 0, 100 - span); hi = r2(lo + span); }
    paint();
  }
  function setMode(v) { mode = v; if (two()) { const span = clamp(mode === 'inside' ? chance : r2(100 - chance), 0.01, 99.99); lo = clamp(r2(50 - span / 2), 0, 100 - span); hi = r2(lo + span); } else chance = clamp(winChance(), DICE_MIN_CHANCE, DICE_MAX_CHANCE); paint(); }

  /* ---- the track: zones, draggable handles, result marker ---- */
  const zones = [0, 1, 2].map(() => h('div', { class: 'zone' }));
  const handles = [0, 1].map((i) => h('div', { class: 'handle', role: 'slider', tabindex: '0', 'aria-label': i ? 'Upper edge' : 'Lower edge' }));
  const markerNum = h('b', { class: 'num' }, '—');
  const marker = h('div', { class: 'marker', style: { left: '50%' }, hidden: true }, markerNum); // shown from the first roll
  const rail = h('div', { class: 'rail' }, ...zones, ...handles, marker);
  const track = h('div', { class: 'dice-track' }, rail);
  const scale = h('div', { class: 'scale' }, ...[0, 25, 50, 75, 100].map((n) => h('span', {}, n)));
  const thr = h('div', { class: 'bubble num' });
  L.stage.append(h('div', { class: 'stack dice-stage' }, track, scale, thr));
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(h('h3', {}, 'Recent rolls'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => ({ winChance: winChance() / 100, multiplier: diceMultiplier(winChance()), note: `${fmtPct(winChance() / 100, 2)} × ${fmtMult(diceMultiplier(winChance()))} = 0.99, wherever you put the zone.` }));
  L.reality.append(reality);

  /** Edges of the win zone as positions on the rail. */
  function edges() { if (mode === 'over') return [r2(100 - chance), 100]; if (mode === 'under') return [0, chance]; return [lo, hi]; }
  function paint() {
    const [a, b] = edges();
    const segs = [[0, a], [a, b], [b, 100]];
    const winMid = mode === 'inside' || mode === 'over' || mode === 'under';
    segs.forEach(([x, y], i) => { const z = zones[i]; z.style.left = `${x}%`; z.style.width = `${Math.max(0, y - x)}%`; z.className = `zone ${(i === 1) === winMid ? 'win' : 'lose'}`; z.hidden = y - x <= 0; });
    handles[0].style.left = `${mode === 'under' ? b : a}%`; handles[0].setAttribute('aria-valuenow', String(mode === 'under' ? b : a));
    handles[1].hidden = !two(); handles[1].style.left = `${b}%`; handles[1].setAttribute('aria-valuenow', String(b));
    thr.textContent = mode === 'over' ? `Win if the roll is ${a.toFixed(2)} or higher` : mode === 'under' ? `Win if the roll is below ${b.toFixed(2)}` : mode === 'inside' ? `Win if the roll lands from ${a.toFixed(2)} up to ${b.toFixed(2)}` : `Win if the roll lands below ${a.toFixed(2)} or at ${b.toFixed(2)} and above`;
    const c = winChance();
    chanceField.set(c.toFixed(2)); multField.set(diceMultiplier(c).toFixed(2));
    modeSeg.set?.(mode);
    reality.update();
  }
  /** Drag a handle (or press anywhere on the rail to pull the nearest one there). Whole-number steps while dragging. */
  function posOf(ev) { const r = rail.getBoundingClientRect(); return clamp(Math.round(((ev.clientX - r.left) / r.width) * 100), 0, 100); }
  function moveEdge(which, x) {
    if (mode === 'over') chance = clamp(r2(100 - x), DICE_MIN_CHANCE, DICE_MAX_CHANCE);
    else if (mode === 'under') chance = clamp(r2(x), DICE_MIN_CHANCE, DICE_MAX_CHANCE);
    else {
      const minSpan = mode === 'inside' ? DICE_MIN_CHANCE : r2(100 - DICE_MAX_CHANCE), maxSpan = mode === 'inside' ? DICE_MAX_CHANCE : r2(100 - DICE_MIN_CHANCE);
      if (which === 0) lo = clamp(x, Math.max(0, hi - maxSpan), hi - minSpan); else hi = clamp(x, lo + minSpan, Math.min(100, lo + maxSpan));
      lo = r2(lo); hi = r2(hi);
    }
    paint();
  }
  let drag = null;
  rail.addEventListener('pointerdown', (ev) => {
    if (busy) return;
    const x = posOf(ev);
    const [a, b] = edges();
    const target = ev.target.closest('.handle');
    let which = target ? handles.indexOf(target) : (two() && Math.abs(x - b) < Math.abs(x - a) ? 1 : 0);
    if (!two()) which = 0;
    drag = which; rail.setPointerCapture(ev.pointerId); handles[which].classList.add('grab'); moveEdge(which, x); ev.preventDefault();
  });
  rail.addEventListener('pointermove', (ev) => { if (drag == null) return; moveEdge(drag, posOf(ev)); });
  const endDrag = (ev) => { if (drag == null) return; handles[drag].classList.remove('grab'); drag = null; sound.play('tick'); };
  rail.addEventListener('pointerup', endDrag); rail.addEventListener('pointercancel', endDrag);
  handles.forEach((hd, i) => hd.addEventListener('keydown', (ev) => { const d = ev.key === 'ArrowLeft' ? -1 : ev.key === 'ArrowRight' ? 1 : 0; if (!d) return; ev.preventDefault(); const [a, b] = edges(); moveEdge(i, (i === 1 || mode === 'under' ? b : a) + d); }));
  paint();

  async function go(amt = amount.get()) {
    if (busy) return null;
    busy = true; play.disabled = true; rail.classList.add('locked'); sound.play('click');
    const out = await tryBet('dice', amt, params(), { defer: true });
    if (!out) { busy = false; play.disabled = false; rail.classList.remove('locked'); return null; }
    const { round } = out;
    const roll = round.outcome.roll;
    const win = round.multiplier > 0;
    marker.className = 'marker'; marker.hidden = false;
    const from = parseFloat(marker.style.left) || 50;
    const over1 = clamp(roll + (roll >= from ? 7 : -7), 0, 100);
    const sweep = tween(560, (e) => { marker.style.left = `${clamp(from + (over1 - from) * e, 0, 100)}%`; }, ease.outCubic)
      .then(() => tween(320, (e) => { marker.style.left = `${clamp(over1 + (roll - over1) * e, 0, 100)}%`; }, ease.outBack));
    await Promise.all([sweep, ticker(markerNum, roll, 820, (v) => Math.max(0, Math.min(99.99, v)).toFixed(2), { noise: 30 })]);
    marker.style.left = `${roll}%`;
    marker.classList.add(win ? 'win' : 'loss');
    const litZones = zones.filter((z) => !z.hidden && z.classList.contains(win ? 'win' : 'lose')); litZones.forEach((z) => z.classList.add('lit')); setTimeout(() => litZones.forEach((z) => z.classList.remove('lit')), 700);
    if (win) sparkle(marker, L.board, { color: '#3ccf8f', count: 12, spread: 50 });
    if (win) { sound.play(round.multiplier >= 10 ? 'bigwin' : 'win'); flashGreen(L.board); } else { sound.play('lose'); flashRed(L.board); }
    banner.show(win ? `WIN ${payoutLine(round)}` : `${roll.toFixed(2)} · −${fmt(round.amount)} AGT`, win);
    strip.push(roll.toFixed(2), win);
    lastLost = !win;
    out.commit();
    busy = false; play.disabled = false; rail.classList.remove('locked');
    return round;
  }
  attachAuto({ panel: L.controls, amount, manual: [play, martingale], playRound: (a) => go(a), rtp: () => 0.99 });
  return { unmount() {} };
}
