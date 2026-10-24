import { h, button, cardEl, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, tryAct, payoutLine, openRoundFor } from './common.js';
import { RANKS, HILO_MAX } from '../../shared/math.js';

export function mount(root, meta) {
  const L = layout(root);
  let round = null, busy = false;
  const amount = betAmount(10, () => reality.update());
  const play = button('Deal', { kind: 'primary', size: 'lg block', onClick: () => start() });
  const cash = button('Cash out', { kind: 'orange', size: 'lg block', disabled: true, onClick: () => cashout() });
  L.controls.append(amount, play, cash, h('p', { class: 'help' }, 'Infinite deck: every card is drawn fresh from 52. “Higher” and “lower” are strict; “same” pays 12.87x. Skipping is free and changes nothing about the odds.'));

  const cardSlot = h('div', { class: 'stack', style: { justifyItems: 'center', gap: '8px' } });
  const choices = h('div', { class: 'choices' });
  const trail = h('div', { class: 'hand', style: { minHeight: '40px', justifyContent: 'flex-start' } });
  L.stage.append(h('div', { class: 'stack', style: { width: '100%', gap: '16px' } }, h('div', { class: 'hilo' }, cardSlot, choices), trail));
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(h('h3', {}, 'Recent hands'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => {
    const v = round?.view;
    if (!v) return { note: 'Each correct call multiplies by 0.99 ÷ P(correct). The chain is capped at 100,000x.' };
    const best = Object.entries(v.options).sort((a, b) => b[1].chance - a[1].chance)[0];
    return { winChance: best[1].chance, multiplier: best[1].multiplier, note: `Standing at ${fmtMult(v.multiplier)} after ${v.correct} correct call${v.correct === 1 ? '' : 's'}. Safest call: ${best[0]} at ${fmtPct(best[1].chance, 1)}.` };
  });
  L.reality.append(reality);

  function paint() {
    const v = round?.view;
    cardSlot.replaceChildren(...[v ? cardEl(v.card, { big: true }) : cardEl(null, { big: true, back: true }), h('div', { class: 't-label' }, v ? `${fmtMult(v.multiplier)} so far` : 'deal to start')].flat().filter(Boolean));
    choices.replaceChildren(...(v ? [
      ...['higher', 'same', 'lower'].filter((c) => v.options[c]).map((c) => button([h('span', {}, c), h('small', {}, `${fmtPct(v.options[c].chance, 1)} · ${fmtMult(v.options[c].multiplier)}`)], { kind: c === 'same' ? 'tertiary' : 'accent', onClick: () => guess(c) })),
      button('Skip card', { kind: 'ghost', size: 'sm', onClick: () => skip() }),
    ] : []));
    trail.replaceChildren(...(v?.history ?? []).slice(-12).map((s) => h('div', { class: 'stack', style: { gap: '2px', justifyItems: 'center' } }, cardEl(s.from), h('span', { class: 't-desc' }, s.choice === 'skip' ? 'skip' : s.ok ? '✓' : '✗'))));
    const live = Boolean(round);
    play.disabled = live; amount.setDisabled(live);
    cash.disabled = !live || !(v?.correct > 0);
    cash.querySelector('span').textContent = live && v?.correct ? `Cash out ${fmt(round.amount * v.multiplier)} AGT` : 'Cash out';
    reality.update();
  }
  async function start() {
    if (busy || round) return;
    busy = true;
    const out = await tryBet('hilo', amount.get(), {});
    busy = false;
    if (!out) return;
    round = out.round; banner.hide(); paint();
  }
  async function guess(choice) {
    if (busy || !round) return;
    busy = true;
    const out = await tryAct('guess', { choice });
    busy = false;
    if (!out) return;
    if (out.round.status === 'settled') return finish(out.round);
    round = out.round; paint();
  }
  async function skip() {
    if (busy || !round) return;
    busy = true;
    const out = await tryAct('skip');
    busy = false;
    if (out) { round = out.round; paint(); }
  }
  async function cashout() {
    if (busy || !round) return;
    busy = true;
    const out = await tryAct('cashout');
    busy = false;
    if (out) finish(out.round);
  }
  function finish(r) {
    const win = r.multiplier > 0;
    const last = r.outcome.steps[r.outcome.steps.length - 1];
    round = null;
    cardSlot.replaceChildren(...[cardEl(r.outcome.cards[r.outcome.cards.length - 1], { big: true }), h('div', { class: 't-label' }, win ? `cashed out at ${fmtMult(r.multiplier)}` : r.outcome.capped ? 'cap reached' : `wrong: ${last.choice} from ${RANKS[last.from.rank - 1]} → ${RANKS[last.to.rank - 1]}`)].flat().filter(Boolean));
    choices.replaceChildren();
    trail.replaceChildren(...r.outcome.steps.slice(-12).map((s) => h('div', { class: 'stack', style: { gap: '2px', justifyItems: 'center' } }, cardEl(s.from), h('span', { class: 't-desc' }, s.choice === 'skip' ? 'skip' : s.ok ? '✓' : '✗'))));
    play.disabled = false; amount.setDisabled(false); cash.disabled = true; cash.querySelector('span').textContent = 'Cash out';
    banner.show(win ? `WIN ${payoutLine(r)}` : `Wrong call · −${fmt(r.amount)} AGT`, win);
    strip.push(win ? fmtMult(r.multiplier) : '✗', win);
    reality.update();
  }
  const existing = openRoundFor('hilo');
  if (existing) { round = existing; amount.set(existing.amount); }
  paint();
  return { unmount() {} };
}
