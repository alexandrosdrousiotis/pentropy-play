import { h, button, numberInput, segmented, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, payoutLine } from './common.js';
import { user } from '../api.js';
import { diceMultiplier, diceChanceFromMultiplier, diceThreshold, DICE_MIN_CHANCE, DICE_MAX_CHANCE } from '../../shared/math.js';
import { sound, ticker, tween, ease, flashGreen, flashRed, sparkle } from '../fx.js';
import { attach as attachAuto } from './autobet.js';

export function mount(root, meta) {
  const L = layout(root);
  let chance = 50, over = true, busy = false, lastLost = false;
  const amount = betAmount(10, () => reality.update());
  const slider = h('input', { type: 'range', min: String(DICE_MIN_CHANCE), max: String(DICE_MAX_CHANCE), step: '0.01', value: String(chance), 'aria-label': 'Win chance' });
  const chanceField = numberInput({ label: 'Win chance', value: chance, min: DICE_MIN_CHANCE, max: DICE_MAX_CHANCE, step: 0.01, unit: '%', onChange: (v) => setChance(v) });
  const multField = numberInput({ label: 'Multiplier', value: diceMultiplier(chance), min: 1.0102, max: 9900, step: 0.01, unit: 'x', onChange: (v) => setChance(diceChanceFromMultiplier(v), 'mult') });
  const dir = segmented([{ value: true, label: 'Roll over' }, { value: false, label: 'Roll under' }], over, (v) => { over = v; draw(); reality.update(); sound.play('tick'); }, { block: true });
  const play = button('Roll', { kind: 'primary', size: 'lg block', onClick: () => go() });
  const martingale = button('Double after loss', { kind: 'ghost', size: 'sm', onClick: () => { if (lastLost) amount.set(Math.min(Math.floor((user()?.balance ?? 0) * 100) / 100, Math.round(amount.get() * 200) / 100)); reality.update(); } });
  L.controls.append(amount, h('div', { class: 'field' }, h('label', {}, 'Win chance'), slider), h('div', { class: 'two' }, chanceField, multField), dir, play, martingale);
  slider.addEventListener('input', () => setChance(Number(slider.value), 'slider'));
  function setChance(v, src) {
    chance = Math.max(DICE_MIN_CHANCE, Math.min(DICE_MAX_CHANCE, Math.round(v * 100) / 100));
    if (src !== 'slider') slider.value = String(chance);
    chanceField.set(chance.toFixed(2)); multField.set(diceMultiplier(chance).toFixed(2));
    draw(); reality.update();
  }

  const zoneLose = h('div', { class: 'zone lose' }), zoneWin = h('div', { class: 'zone win' });
  const markerNum = h('b', { class: 'num' }, '—');
  const marker = h('div', { class: 'marker', style: { left: '50%' } }, markerNum);
  const track = h('div', { class: 'dice-track' }, zoneLose, zoneWin, marker);
  const scale = h('div', { class: 'scale' }, ...[0, 25, 50, 75, 100].map((n) => h('span', {}, n)));
  const thr = h('div', { class: 'bubble num' });
  L.stage.append(h('div', { class: 'stack', style: { width: '100%', justifyItems: 'center', gap: '16px' } }, track, scale, thr));
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(h('h3', {}, 'Recent rolls'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => ({ winChance: chance / 100, multiplier: diceMultiplier(chance), note: `${fmtPct(chance / 100, 2)} × ${fmtMult(diceMultiplier(chance))} = 0.99, at every setting on the slider.` }));
  L.reality.append(reality);
  function draw() {
    const t = diceThreshold(chance, over);
    if (over) { zoneLose.style.left = '0'; zoneLose.style.width = `${t}%`; zoneWin.style.left = `${t}%`; zoneWin.style.width = `${100 - t}%`; }
    else { zoneWin.style.left = '0'; zoneWin.style.width = `${t}%`; zoneLose.style.left = `${t}%`; zoneLose.style.width = `${100 - t}%`; }
    thr.textContent = over ? `Win if the roll is ${t.toFixed(2)} or higher` : `Win if the roll is below ${t.toFixed(2)}`;
  }
  draw();
  async function go(amt = amount.get()) {
    if (busy) return null;
    busy = true; play.disabled = true; sound.play('click');
    const out = await tryBet('dice', amt, { chance, over }, { defer: true });
    if (!out) { busy = false; play.disabled = false; return null; }
    const { round } = out;
    const roll = round.outcome.roll;
    const win = round.multiplier > 0;
    marker.className = 'marker';
    const from = parseFloat(marker.style.left) || 50, clamp = (v) => Math.max(0, Math.min(100, v));
    const over1 = clamp(roll + (roll >= from ? 7 : -7));
    const sweep = tween(560, (e) => { marker.style.left = `${clamp(from + (over1 - from) * e)}%`; }, ease.outCubic)
      .then(() => tween(320, (e) => { marker.style.left = `${clamp(over1 + (roll - over1) * e)}%`; }, ease.outBack));
    await Promise.all([sweep, ticker(markerNum, roll, 820, (v) => Math.max(0, Math.min(99.99, v)).toFixed(2), { noise: 30 })]);
    marker.style.left = `${roll}%`;
    marker.classList.add(win ? 'win' : 'loss');
    const zone = win ? zoneWin : zoneLose; zone.classList.add('lit'); setTimeout(() => zone.classList.remove('lit'), 700);
    if (win) sparkle(marker, L.board, { color: '#3ccf8f', count: 12, spread: 50 });
    if (win) { sound.play(round.multiplier >= 10 ? 'bigwin' : 'win'); flashGreen(L.board); } else { sound.play('lose'); flashRed(L.board); }
    banner.show(win ? `WIN ${payoutLine(round)}` : `${roll.toFixed(2)} · −${fmt(round.amount)} AGT`, win);
    strip.push(roll.toFixed(2), win);
    lastLost = !win;
    out.commit();
    busy = false; play.disabled = false;
    return round;
  }
  attachAuto({ panel: L.controls, amount, manual: [play, martingale], playRound: (a) => go(a), rtp: () => 0.99 });
  return { unmount() {} };
}
