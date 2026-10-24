import { h, button, numberInput, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, payoutLine, sleep } from './common.js';
import { limboWinChance, LIMBO_MAX } from '../../shared/math.js';

export function mount(root, meta) {
  const L = layout(root);
  let target = 2, busy = false, cancelled = false;
  const amount = betAmount(10, () => reality.update());
  const targetField = numberInput({ label: 'Target multiplier', value: target, min: 1.01, max: LIMBO_MAX, step: 0.01, unit: 'x', onChange: (v) => { target = Math.min(LIMBO_MAX, Math.max(1.01, Math.round(v * 100) / 100)); chanceField.set((limboWinChance(target) * 100).toFixed(2)); reality.update(); } });
  const chanceField = numberInput({ label: 'Win chance', value: (limboWinChance(target) * 100).toFixed(2), min: 0.0001, max: 98.02, step: 0.01, unit: '%', onChange: (v) => { const t = Math.max(1.01, Math.min(LIMBO_MAX, Math.floor((99 / Math.max(0.0001, v)) * 100) / 100)); target = t; targetField.set(t); reality.update(); } });
  const play = button('Bet', { kind: 'primary', size: 'lg block', onClick: () => go() });
  L.controls.append(amount, targetField, chanceField, play, h('p', { class: 'help' }, 'The round draws a number. You win your target if the number is at least as high. 1% of rounds come up 1.00x and lose every target.'));

  const big = h('div', { class: 'bignum num' }, '1.00x');
  const sub = h('div', { class: 't-desc' }, 'Place a bet to roll');
  L.stage.append(h('div', { class: 'stack', style: { justifyItems: 'center', gap: '6px' } }, big, sub));
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(h('h3', {}, 'Recent results'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => ({ winChance: limboWinChance(target), multiplier: target, note: `Expected value of this bet = ${fmtPct(limboWinChance(target), 2)} × ${fmtMult(target)} = 0.99. It never changes, whatever you target.` }));
  L.reality.append(reality);

  async function go() {
    if (busy) return;
    busy = true; play.disabled = true; amount.setDisabled(true);
    const out = await tryBet('limbo', amount.get(), { target }, { defer: true });
    if (!out) { busy = false; play.disabled = false; amount.setDisabled(false); return; }
    const { round } = out;
    const point = round.outcome.point;
    big.className = 'bignum num';
    sub.textContent = `target ${fmtMult(target)}`;
    // count up with ease-out, then snap to the exact point
    const t0 = performance.now(), dur = 650, from = 1, to = point;
    const ease = (x) => 1 - (1 - x) ** 3;
    await new Promise((r) => { const step = (t) => { if (cancelled) return r(); const k = Math.min(1, (t - t0) / dur); big.textContent = fmtMult(from + (to - from) * ease(k)); if (k < 1) requestAnimationFrame(step); else r(); }; requestAnimationFrame(step); });
    big.textContent = fmtMult(point);
    const win = round.multiplier > 0;
    big.classList.add(win ? 'win' : 'loss');
    banner.show(win ? `WIN ${payoutLine(round)}` : `${fmtMult(point)} < ${fmtMult(target)} · −${fmt(round.amount)} AGT`, win);
    strip.push(fmtMult(point), win);
    out.commit();
    busy = false; play.disabled = false; amount.setDisabled(false);
  }
  return { unmount() { cancelled = true; } };
}
