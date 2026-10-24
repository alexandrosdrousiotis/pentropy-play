import { h, button, cardEl, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, tryAct, payoutLine, openRoundFor } from './common.js';
import { RANKS } from '../../shared/math.js';
import { dealFrom, slideOut, sleep, sound, flashGreen, flashRed, shake, popIn, winBurst } from '../fx.js';

export function mount(root, meta) {
  const L = layout(root);
  let round = null, busy = false;
  const amount = betAmount(10, () => reality.update());
  const play = button('Deal', { kind: 'primary', size: 'lg block', onClick: () => start() });
  const cash = button('Cash out', { kind: 'orange', size: 'lg block', disabled: true, onClick: () => cashout() });
  L.controls.append(amount, play, cash);

  const shoe = h('div', { class: 'shoe', 'aria-hidden': 'true' });
  const slot = h('div', { class: 'card-slot', style: { position: 'relative', width: '112px', height: '158px' } });
  const label = h('div', { class: 'bubble' }, 'deal to start');
  const choices = h('div', { class: 'choices' });
  const trail = h('div', { class: 'hand', style: { minHeight: '60px', justifyContent: 'flex-start', gap: '6px' } });
  L.board.classList.add('table-felt');
  L.stage.append(shoe, h('div', { class: 'stack', style: { width: '100%', gap: '20px' } }, h('div', { class: 'hilo' }, h('div', { class: 'stack', style: { justifyItems: 'center', gap: '10px' } }, slot, label), choices), trail));
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

  let current = null; // the big card element
  async function showCard(card, { animate = true } = {}) {
    const el = cardEl(card, { big: true, faceDown: true });
    el.style.position = 'absolute'; el.style.inset = '0';
    slot.append(el);
    if (animate) { sound.play('deal'); await dealFrom(el, shoe, { ms: 460 }); } else el.flip(true);
    current = el;
    return el;
  }
  function trailAdd(step) {
    const mark = step.choice === 'skip' ? 'skip' : step.ok ? '✓' : '✗';
    const wrap = h('div', { class: 'stack', style: { gap: '2px', justifyItems: 'center' } }, cardEl(step.from), h('span', { class: `t-desc ${step.ok && step.choice !== 'skip' ? 'good' : step.choice === 'skip' ? '' : 'bad'}` }, mark));
    trail.append(wrap); popIn(wrap);
    while (trail.children.length > 14) trail.firstChild.remove();
  }
  function paintControls() {
    const v = round?.view;
    label.textContent = v ? `${fmtMult(v.multiplier)} so far` : 'deal to start';
    label.className = `bubble${v && v.correct ? ' win' : ''}`;
    choices.replaceChildren(...(v ? [
      ...['higher', 'same', 'lower'].filter((c) => v.options[c]).map((c) => button([h('span', {}, c), h('small', {}, `${fmtPct(v.options[c].chance, 1)} · ${fmtMult(v.options[c].multiplier)}`)], { kind: c === 'same' ? 'tertiary' : 'accent', disabled: busy, onClick: () => guess(c) })),
      button('Skip card', { kind: 'ghost', size: 'sm', disabled: busy, onClick: () => skip() }),
    ] : []));
    const live = Boolean(round);
    play.disabled = live; amount.setDisabled(live);
    cash.disabled = !live || busy || !(v?.correct > 0);
    cash.querySelector('span').textContent = live && v?.correct ? `Cash out ${fmt(round.amount * v.multiplier)} AGT` : 'Cash out';
    reality.update();
  }
  async function advance(step) {
    // old card slides into the trail, new card deals in
    const old = current;
    if (old) { trailAdd(step); await slideOut(old, -120, 280); }
    await showCard(step.to);
  }
  async function start() {
    if (busy || round) return;
    busy = true; play.disabled = true;
    const out = await tryBet('hilo', amount.get(), {});
    if (!out) { busy = false; play.disabled = false; return; }
    round = out.round; banner.hide(); trail.replaceChildren(); slot.replaceChildren(); current = null;
    await showCard(round.view.card);
    busy = false; paintControls();
  }
  async function guess(choice) {
    if (busy || !round) return;
    busy = true; paintControls(); sound.play('click');
    const out = await tryAct('guess', { choice }, { defer: true });
    if (!out) { busy = false; paintControls(); return; }
    const steps = out.round.status === 'settled' ? out.round.outcome.steps : out.round.view.history;
    const step = steps[steps.length - 1];
    const arrow = h('div', { class: `hilo-arrow ${choice}` }, choice === 'higher' ? '↑' : choice === 'lower' ? '↓' : '=');
    slot.append(arrow); popIn(arrow); await sleep(380);
    arrow.classList.add(step.ok ? 'ok' : 'bad'); await sleep(220); arrow.remove();
    await advance(step);
    if (step.ok) { sound.play('reveal'); flashGreen(L.board); } else { sound.play('lose'); flashRed(L.board); shake(slot); }
    busy = false;
    if (out.round.status === 'settled') { out.commit(); return finish(out.round); }
    round = out.round; out.commit(); paintControls();
  }
  async function skip() {
    if (busy || !round) return;
    busy = true; paintControls(); sound.play('click');
    const out = await tryAct('skip', {}, { defer: true });
    if (!out) { busy = false; paintControls(); return; }
    const steps = out.round.view.history; await advance(steps[steps.length - 1]);
    round = out.round; out.commit(); busy = false; paintControls();
  }
  async function cashout() {
    if (busy || !round) return;
    busy = true; paintControls();
    const out = await tryAct('cashout');
    busy = false;
    if (out) finish(out.round); else paintControls();
  }
  function finish(r) {
    const win = r.multiplier > 0;
    const last = r.outcome.steps[r.outcome.steps.length - 1];
    round = null;
    label.textContent = win ? `cashed out at ${fmtMult(r.multiplier)}` : r.outcome.capped ? 'cap reached' : `wrong: ${last.choice} from ${RANKS[last.from.rank - 1]} → ${RANKS[last.to.rank - 1]}`;
    label.className = `bubble ${win ? 'win' : 'lose'}`;
    if (win) { sound.play(r.multiplier >= 10 ? 'bigwin' : 'cashout'); winBurst(L.board); current?.classList.add('win'); }
    choices.replaceChildren();
    play.disabled = false; amount.setDisabled(false); cash.disabled = true; cash.querySelector('span').textContent = 'Cash out';
    banner.show(win ? `WIN ${payoutLine(r)}` : `Wrong call · −${fmt(r.amount)} AGT`, win);
    strip.push(win ? fmtMult(r.multiplier) : '✗', win);
    reality.update();
  }
  const existing = openRoundFor('hilo');
  if (existing) { round = existing; amount.set(existing.amount); for (const s of existing.view.history) trailAdd(s); showCard(existing.view.card, { animate: false }); }
  else { const back = cardEl(null, { back: true, big: true }); back.style.position = 'absolute'; back.style.inset = '0'; slot.append(back); }
  paintControls();
  return { unmount() {} };
}
