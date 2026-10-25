// Shared UI for the ordered-hazard games (Chicken, Pump).
import { h, button, segmented, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt, svgUse } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, tryAct, payoutLine, openRoundFor } from './common.js';
import { trackMultiplier, trackNextSafeChance, TRACK_LEN, round2 } from '../../shared/math.js';
import { sound, sleep, shake, flashRed, flashGreen, winBurst, popIn, pulse } from '../fx.js';

export function mountTrack(root, meta, { id, levels, stepAction, unit, bustKey, stepLabel, icon, hazardIcon, safeIcon }) {
  const L = layout(root);
  let level = Object.keys(levels)[1] || Object.keys(levels)[0], round = null, busy = false, dead = false;
  const amount = betAmount(10, () => reality.update());
  const levelSeg = segmented(Object.entries(levels).map(([k, v]) => ({ value: k, label: v.label })), level, (v) => { level = v; build(); reality.update(); }, { block: true });
  const step = button(stepLabel, { kind: 'accent', size: 'lg block', disabled: true, onClick: () => doStep() });
  const play = button('Start', { kind: 'primary', size: 'lg block', onClick: () => start() });
  const cash = button('Cash out', { kind: 'orange', size: 'lg block', disabled: true, onClick: () => cashout() });
  L.controls.append(amount, h('div', { class: 'field' }, h('label', {}, 'Difficulty'), levelSeg), play, step, cash);
  const track = h('div', { class: 'track' });
  const mult = h('div', { class: 'bignum num', style: { fontSize: '48px' } }, '1.00x');
  const hint = h('div', { class: 'bubble' }, 'start to play');
  L.stage.append(h('div', { class: 'stack', style: { width: '100%', justifyItems: 'center', gap: '14px' } }, mult, track, hint));
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(h('h3', {}, 'Recent runs'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => { const hz = levels[level].hazards; const k = round?.view?.[unit] ?? 0; return { winChance: trackNextSafeChance(hz, k), multiplier: round2(trackMultiplier(hz, k + 1)) }; });
  L.reality.append(reality);
  let cells = [];
  function build(outcome = null) {
    const hz = levels[level].hazards; const k = round?.view?.[unit] ?? outcome?.[unit] ?? 0;
    track.replaceChildren(); cells = [];
    for (let i = 0; i < TRACK_LEN; i++) {
      const c = h('div', { class: 'tcell' + (i < k ? ' done' : i === k && round ? ' next' : '') }, h('span', { class: 'm num' }, i < TRACK_LEN - hz ? fmtMult(round2(trackMultiplier(hz, i + 1))) : ''));
      if (i < k) c.prepend(svgUse(safeIcon));
      if (outcome) { if (outcome.layout.includes(i)) { c.classList.add(i === outcome[bustKey] ? 'bust' : 'hazard'); c.prepend(svgUse(hazardIcon)); } }
      track.append(c); cells.push(c);
    }
    mult.textContent = fmtMult(round?.view?.multiplier ?? 1);
    paintControls();
    cells[Math.max(0, k - 1)]?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }
  function paintControls() {
    const v = round?.view; const live = Boolean(round);
    play.disabled = live; amount.setDisabled(live); levelSeg.setDisabled(live);
    step.disabled = !live || busy; cash.disabled = !live || busy || !(v?.[unit] > 0);
    step.querySelector('span').textContent = live ? `${stepLabel} · next ${fmtMult(v.next)} (${fmtPct(v.nextSafeChance, 0)} safe)` : stepLabel;
    cash.querySelector('span').textContent = live && v?.[unit] ? `Cash out ${fmt(round.amount * v.multiplier)} AGT` : 'Cash out';
    hint.textContent = live ? `${v[unit]} of ${v.safe} safe` : 'start to play';
  }
  async function start() {
    if (busy || round) return;
    busy = true; play.disabled = true;
    const out = await tryBet(id, amount.get(), { level });
    busy = false;
    if (!out) { play.disabled = false; return; }
    round = out.round; banner.hide(); sound.play('click'); build(); reality.update();
  }
  async function doStep() {
    if (busy || !round) return;
    busy = true; paintControls();
    const k = round.view[unit];
    const out = await tryAct(stepAction, {}, { defer: true });
    if (!out) { busy = false; paintControls(); return; }
    if (out.round.status === 'settled' && !out.round.outcome.cleared) {
      cells[k].classList.add('bust'); cells[k].prepend(svgUse(hazardIcon)); popIn(cells[k]); sound.play('bomb'); shake(track); flashRed(L.board); await sleep(450);
      out.commit(); return finish(out.round);
    }
    cells[k].classList.add('done'); cells[k].classList.remove('next'); cells[k].prepend(svgUse(safeIcon)); popIn(cells[k]); sound.play('reveal');
    round = out.round;
    if (round.status === 'settled') { out.commit(); return finish(round); }
    cells[k + 1]?.classList.add('next'); mult.textContent = fmtMult(round.view.multiplier); pulse(mult);
    out.commit(); busy = false; paintControls(); reality.update();
    cells[k + 1]?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }
  async function cashout() {
    if (busy || !round) return;
    busy = true; paintControls();
    const out = await tryAct('cashout', {}, { defer: true });
    if (!out) { busy = false; paintControls(); return; }
    out.commit(); finish(out.round);
  }
  function finish(r) {
    const win = r.multiplier > 0; round = null;
    if (win) { sound.play(r.multiplier >= 5 ? 'bigwin' : 'cashout'); flashGreen(L.board); if (r.multiplier >= 5) winBurst(L.board); }
    banner.show(win ? `WIN ${payoutLine(r)}` : `${bustKey === 'hit' ? 'Hit' : 'Popped'} at ${r.outcome[unit] + 1} · −${fmt(r.amount)} AGT`, win);
    strip.push(fmtMult(win ? r.multiplier : 0), win);
    build(r.outcome); mult.textContent = fmtMult(win ? r.multiplier : 0); mult.className = `bignum num ${win ? 'win' : 'loss'}`; mult.style.fontSize = '48px';
    busy = false; paintControls(); reality.update();
  }
  const existing = openRoundFor(id);
  if (existing) { round = existing; level = existing.params.level; levelSeg.set(level); amount.set(existing.amount); }
  build();
  return { unmount() { dead = true; } };
}
