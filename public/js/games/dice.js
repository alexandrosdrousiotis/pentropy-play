import { h, button, numberInput, segmented, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, payoutLine } from './common.js';
import { user } from '../api.js';
import { diceMultiplier, diceChanceFromMultiplier, diceThreshold, DICE_MIN_CHANCE, DICE_MAX_CHANCE } from '../../shared/math.js';

export function mount(root, meta) {
  const L = layout(root);
  let chance = 50, over = true, busy = false;
  const amount = betAmount(10, () => reality.update());
  const slider = h('input', { type: 'range', min: String(DICE_MIN_CHANCE), max: String(DICE_MAX_CHANCE), step: '0.01', value: String(chance), 'aria-label': 'Win chance' });
  const chanceField = numberInput({ label: 'Win chance', value: chance, min: DICE_MIN_CHANCE, max: DICE_MAX_CHANCE, step: 0.01, unit: '%', onChange: (v) => setChance(v) });
  const multField = numberInput({ label: 'Multiplier', value: diceMultiplier(chance), min: 1.0102, max: 9900, step: 0.01, unit: 'x', onChange: (v) => setChance(diceChanceFromMultiplier(v), 'mult') });
  const dir = segmented([{ value: true, label: 'Roll over' }, { value: false, label: 'Roll under' }], over, (v) => { over = v; draw(); reality.update(); }, { block: true });
  const play = button('Roll', { kind: 'primary', size: 'lg block', onClick: () => go() });
  const martingale = button('Double after loss', { kind: 'ghost', size: 'sm', onClick: () => { if (lastLost) amount.set(Math.min(Math.floor((user()?.balance ?? 0) * 100) / 100, Math.round(amount.get() * 200) / 100)); reality.update(); } });
  let lastLost = false;
  L.controls.append(amount, h('div', { class: 'field' }, h('label', {}, 'Win chance'), slider), h('div', { class: 'two' }, chanceField, multField), dir, play,
    h('p', { class: 'help' }, 'Multiplier = 99 ÷ win chance. The missing 1 of 100 is the house edge. The “double after loss” button is the Martingale system; try it and watch your balance curve.'));
  slider.addEventListener('input', () => setChance(Number(slider.value), 'slider'));

  function setChance(v, src) {
    chance = Math.max(DICE_MIN_CHANCE, Math.min(DICE_MAX_CHANCE, Math.round(v * 100) / 100));
    if (src !== 'slider') slider.value = String(chance);
    chanceField.set(chance.toFixed(2)); multField.set(diceMultiplier(chance).toFixed(2));
    draw(); reality.update();
  }

  const zoneLose = h('div', { class: 'zone lose' }), zoneWin = h('div', { class: 'zone win' });
  const marker = h('div', { class: 'marker', style: { left: '50%' } }, h('b', { class: 'num' }, '—'));
  const track = h('div', { class: 'dice-track' }, zoneLose, zoneWin, marker);
  const scale = h('div', { class: 'scale' }, ...[0, 25, 50, 75, 100].map((n) => h('span', {}, n)));
  const thr = h('div', { class: 't-desc num' });
  L.stage.append(h('div', { class: 'stack', style: { width: '100%', justifyItems: 'center', gap: '14px' } }, track, scale, thr));
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

  async function go() {
    if (busy) return;
    busy = true; play.disabled = true;
    const out = await tryBet('dice', amount.get(), { chance, over }, { defer: true });
    if (!out) { busy = false; play.disabled = false; return; }
    const { round } = out;
    const roll = round.outcome.roll;
    const win = round.multiplier > 0;
    marker.className = 'marker';
    marker.style.left = `${roll}%`;
    marker.querySelector('b').textContent = roll.toFixed(2);
    setTimeout(() => {
      marker.classList.add(win ? 'win' : 'loss');
      banner.show(win ? `WIN ${payoutLine(round)}` : `${roll.toFixed(2)} · −${fmt(round.amount)} AGT`, win);
      strip.push(roll.toFixed(2), win);
      lastLost = !win;
      out.commit();
      busy = false; play.disabled = false;
    }, 520);
  }
  L.controls.append(martingale);
  return { unmount() {} };
}
