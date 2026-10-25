import { h, button, numberInput, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, payoutLine } from './common.js';
import { limboWinChance, LIMBO_MAX } from '../../shared/math.js';
import { sound, tween, ease, flashGreen, flashRed, winBurst } from '../fx.js';
import { attach as attachAuto } from './autobet.js';

export function mount(root, meta) {
  const L = layout(root);
  let target = 2, busy = false;
  const amount = betAmount(10, () => reality.update());
  const targetField = numberInput({ label: 'Target multiplier', value: target, min: 1.01, max: LIMBO_MAX, step: 0.01, unit: 'x', onChange: (v) => { target = Math.min(LIMBO_MAX, Math.max(1.01, Math.round(v * 100) / 100)); chanceField.set((limboWinChance(target) * 100).toFixed(2)); reality.update(); } });
  const chanceField = numberInput({ label: 'Win chance', value: (limboWinChance(target) * 100).toFixed(2), min: 0.0001, max: 98.02, step: 0.01, unit: '%', onChange: (v) => { const t = Math.max(1.01, Math.min(LIMBO_MAX, Math.floor((99 / Math.max(0.0001, v)) * 100) / 100)); target = t; targetField.set(t); reality.update(); } });
  const play = button('Bet', { kind: 'primary', size: 'lg block', onClick: () => go() });
  L.controls.append(amount, targetField, chanceField, play);

  const big = h('div', { class: 'bignum num' }, '1.00x');
  const sub = h('div', { class: 'bubble' }, 'place a bet to roll');
  L.stage.append(h('div', { class: 'limbo-stage' }, h('div', { class: 'stack', style: { justifyItems: 'center', gap: '14px' } }, big, sub)));
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(h('h3', {}, 'Recent results'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => ({ winChance: limboWinChance(target), multiplier: target, note: `Expected value of this bet = ${fmtPct(limboWinChance(target), 2)} × ${fmtMult(target)} = 0.99. It never changes, whatever you target.` }));
  L.reality.append(reality);

  async function go(amt = amount.get()) {
    if (busy) return null;
    busy = true; play.disabled = true; amount.setDisabled(true); sound.play('click');
    const out = await tryBet('limbo', amt, { target }, { defer: true });
    if (!out) { busy = false; play.disabled = false; amount.setDisabled(false); return null; }
    const { round } = out;
    const point = round.outcome.point;
    // one clean move: the number climbs on a log scale and settles without overshoot, then takes its colour
    big.className = 'bignum num rolling';
    sub.textContent = `target ${fmtMult(target)}`; sub.className = 'bubble';
    const t0 = performance.now(); const spin = setInterval(() => { if (performance.now() - t0 < 650) sound.play('tick'); }, 80);
    const lg = Math.log(Math.max(1, point));
    await tween(1150, (e) => { big.textContent = fmtMult(Math.exp(lg * e)); }, ease.outQuint);
    big.textContent = fmtMult(point);
    clearInterval(spin);
    const win = round.multiplier > 0;
    big.className = `bignum num ${win ? 'win' : 'loss'}`;
    if (win) { sound.play(round.multiplier >= 10 ? 'bigwin' : 'win'); flashGreen(L.board); if (round.multiplier >= 10) winBurst(L.board); } else { sound.play('lose'); flashRed(L.board); }
    sub.className = `bubble ${win ? 'win' : 'lose'}`;
    banner.show(win ? `WIN ${payoutLine(round)}` : `${fmtMult(point)} < ${fmtMult(target)} · −${fmt(round.amount)} AGT`, win);
    strip.push(fmtMult(point), win);
    out.commit();
    busy = false; play.disabled = false; amount.setDisabled(false);
    return round;
  }
  attachAuto({ panel: L.controls, amount, manual: [play], playRound: (a) => go(a), rtp: () => 0.99 });
  return { unmount() {} };
}
