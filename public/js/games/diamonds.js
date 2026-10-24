import { h, button, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt, svgUse } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, payoutLine } from './common.js';
import { DIAMOND_HANDS, DIAMOND_PAYTABLE, DIAMOND_PROBS, diamondsRtp } from '../../shared/math.js';
import { sound, sleep, popIn, flashGreen, winBurst, sparkle } from '../fx.js';
import { attach as attachAuto } from './autobet.js';

const COLOURS = ['#ff5c7a', '#f0a040', '#f5d35e', '#3ccf8f', '#38bdf8', '#8b9cff', '#c084fc'];
export function mount(root, meta) {
  const L = layout(root);
  let busy = false;
  const amount = betAmount(10, () => reality.update());
  const play = button('Deal', { kind: 'primary', size: 'lg block', onClick: () => go() });
  const payEl = h('table', { class: 'paytable' });
  L.controls.append(amount, play, payEl);
  const row = h('div', { class: 'gem-row' });
  const label = h('div', { class: 'bubble' }, 'deal to start');
  L.stage.append(h('div', { class: 'stack', style: { justifyItems: 'center', gap: '18px', width: '100%' } }, row, label));
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(h('h3', {}, 'Recent hands'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => ({ rtp: diamondsRtp(), winChance: DIAMOND_HANDS.filter((n) => DIAMOND_PAYTABLE[n] > 1).reduce((a, n) => a + DIAMOND_PROBS[n], 0) }));
  L.reality.append(reality);
  function table(hit = null) { payEl.replaceChildren(h('thead', {}, h('tr', {}, h('th', {}, 'Hand'), h('th', {}, 'Pays'), h('th', {}, 'Chance'))), h('tbody', {}, ...DIAMOND_HANDS.map((n) => h('tr', { class: n === hit ? 'hit' : '' }, h('td', {}, n), h('td', {}, fmtMult(DIAMOND_PAYTABLE[n])), h('td', {}, fmtPct(DIAMOND_PROBS[n], 2)))))); }
  const gem = (c, blank = false) => h('div', { class: 'gem', style: { color: blank ? 'var(--surface-3)' : COLOURS[c] } }, svgUse('ph-diamond'));
  function idle() { row.replaceChildren(...Array.from({ length: 5 }, () => gem(0, true))); }
  async function go(amt = amount.get()) {
    if (busy) return null;
    busy = true; play.disabled = true; amount.setDisabled(true); sound.play('click');
    const out = await tryBet('diamonds', amt, {}, { defer: true });
    if (!out) { busy = false; play.disabled = false; amount.setDisabled(false); return null; }
    const { round } = out;
    idle(); table(); label.textContent = 'dealing'; label.className = 'bubble';
    const cols = round.outcome.colours;
    for (let i = 0; i < 5; i++) {
      const g = row.children[i]; g.classList.add('spin');
      for (let s = 0; s < 5 + i * 2; s++) { g.style.color = COLOURS[Math.floor(Math.random() * COLOURS.length)]; sound.play('tick'); await sleep(55); }
      g.classList.remove('spin'); g.style.color = COLOURS[cols[i]]; popIn(g); sound.play('reveal'); await sleep(80);
    }
    const counts = cols.reduce((a, c) => { a[c] = (a[c] || 0) + 1; return a; }, {});
    const matched = [...row.children].filter((g, i) => counts[cols[i]] >= 2);
    matched.forEach((g, i) => setTimeout(() => { g.classList.add('match'); if (round.multiplier > 1) sparkle(g, L.board, { color: COLOURS[cols[[...row.children].indexOf(g)]], count: 8, spread: 40 }); }, i * 90));
    await sleep(260);
    const win = round.multiplier > 1;
    label.textContent = round.outcome.hand; label.className = `bubble ${win ? 'win' : round.multiplier > 0 ? '' : 'lose'}`;
    table(round.outcome.hand);
    if (win) { sound.play(round.multiplier >= 5 ? 'bigwin' : 'win'); flashGreen(L.board); if (round.multiplier >= 5) winBurst(L.board); } else sound.play(round.multiplier > 0 ? 'tick' : 'lose');
    banner.show(`${round.outcome.hand} · ${payoutLine(round)}`, win ? true : round.multiplier === 1 ? 'push' : false);
    strip.push(fmtMult(round.multiplier), win);
    out.commit(); busy = false; play.disabled = false; amount.setDisabled(false);
    return round;
  }
  idle(); table();
  attachAuto({ panel: L.controls, amount, manual: [play], playRound: (a) => go(a), rtp: () => diamondsRtp() });
  return { unmount() {} };
}
