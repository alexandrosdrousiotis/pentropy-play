import { h, button, numberInput, toy, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, tryAct, payoutLine, openRoundFor } from './common.js';
import { minesMultiplier, minesNextSafeChance, round2, MINES_CELLS } from '../../shared/math.js';
import { sleep, sound, shake, flashRed, flashGreen, winBurst, pulse, sparkle, shockwave } from '../fx.js';
import { attach as attachAuto } from './autobet.js';
import { gem3d } from '../solid.js';

export function mount(root, meta) {
  const L = layout(root);
  let mines = 3, round = null, busy = false, dead = false, autoPicks = [], autoCtl = null;
  const amount = betAmount(10, () => reality.update());
  const minesField = numberInput({ label: 'Mines', value: mines, min: 1, max: 24, step: 1, unit: `of ${MINES_CELLS}`, onChange: (v) => { mines = Math.max(1, Math.min(24, Math.round(v))); reality.update(); } });
  const play = button('Start round', { kind: 'primary', size: 'lg block', onClick: () => start() });
  const cash = button('Cash out', { kind: 'orange', size: 'lg block', disabled: true, onClick: () => cashout() });
  const status = h('div', { class: 'stack', style: { gap: '4px' } });
  L.controls.append(amount, minesField, play, cash, status);

  const grid = h('div', { class: 'grid5', role: 'grid' });
  const cells = Array.from({ length: MINES_CELLS }, (_, i) => h('button', { class: 'cell', type: 'button', disabled: true, 'aria-label': `Tile ${i + 1}`, onClick: () => reveal(i) }));
  grid.append(...cells);
  L.stage.append(grid);
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(h('h3', {}, 'Recent rounds'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => {
    const k = round?.view?.gems ?? 0;
    return { winChance: minesNextSafeChance(mines, k), multiplier: round2(minesMultiplier(mines, k + 1)), note: round ? `Cashing out now pays ${fmtMult(round.view.multiplier)}. The next tile is safe ${fmtPct(minesNextSafeChance(mines, k), 1)} of the time and would pay ${fmtMult(round.view.next)}.` : `Clearing every safe tile with ${mines} mines pays ${fmtMult(round2(minesMultiplier(mines, MINES_CELLS - mines)))}; the chance of doing it is ${fmtPct(0.99 / minesMultiplier(mines, MINES_CELLS - mines), 6)}.` };
  });
  L.reality.append(reality);

  const setCell = (c, kind, { dim = false, hit = false } = {}) => {
    c.className = `cell flip ${kind}${dim ? ' dim' : ''}${hit ? ' hitcell' : ''}`;
    c.replaceChildren(kind === 'gem' ? gem3d('#3ccf8f', null) : toy('bomb', 34));
    c.disabled = true;
  };
  function resetGrid(enabled) {
    const picking = autoCtl?.mode === 'auto' && !round && !autoCtl.running;
    cells.forEach((c, i) => { c.className = `cell${picking && autoPicks.includes(i) ? ' autopick' : ''}`; c.replaceChildren(); c.disabled = !(enabled || picking); });
  }
  function paintControls() {
    const v = round?.view;
    const live = Boolean(round);
    play.disabled = live; amount.setDisabled(live); minesField.input.disabled = live;
    cash.disabled = !live || busy || !(v?.gems > 0);
    cash.querySelector('span').textContent = live && v?.gems ? `Cash out ${fmt(round.amount * v.multiplier)} AGT (${fmtMult(v.multiplier)})` : 'Cash out';
    status.replaceChildren(...(live ? [h('div', { class: 'kv' }, h('span', {}, 'Next tile'), h('b', {}, `${fmtMult(v.next)} · ${fmtPct(v.nextSafeChance, 1)} safe`))] : []));
    reality.update();
  }
  async function revealAll(outcome, hitIndex) {
    // cascade outward from the hit tile (or from the centre on a cash out)
    const origin = hitIndex >= 0 ? hitIndex : 12;
    const ox = origin % 5, oy = Math.floor(origin / 5);
    const order = cells.map((_, i) => i).filter((i) => i !== hitIndex && !outcome.revealed.includes(i)).sort((a, b) => Math.hypot(a % 5 - ox, Math.floor(a / 5) - oy) - Math.hypot(b % 5 - ox, Math.floor(b / 5) - oy));
    for (const i of order) {
      if (dead) return;
      setCell(cells[i], outcome.layout.includes(i) ? 'mine' : 'gem', { dim: true });
      sound.play('tick');
      await sleep(28);
    }
  }
  async function start() {
    if (busy || round) return;
    busy = true; play.disabled = true;
    const out = await tryBet('mines', amount.get(), { mines });
    busy = false;
    if (!out) { play.disabled = false; return; }
    round = out.round; banner.hide(); resetGrid(true); sound.play('click'); paintControls();
  }
  async function reveal(i) {
    if (!round && autoCtl?.mode === 'auto' && !autoCtl.running) {
      autoPicks = autoPicks.includes(i) ? autoPicks.filter((x) => x !== i) : [...autoPicks, i];
      sound.play('tick'); resetGrid(false); return;
    }
    if (busy || !round) return;
    busy = true; cells[i].disabled = true; paintControls();
    const out = await tryAct('reveal', { index: i }, { defer: true });
    if (!out) { busy = false; cells[i].disabled = false; paintControls(); return; }
    if (out.round.status === 'settled') {
      if (out.round.outcome.hit === i) {
        setCell(cells[i], 'mine', { hit: true }); sound.play('bomb'); shake(grid); flashRed(L.board); shockwave(cells[i], L.board);
        await sleep(500);
      } else { setCell(cells[i], 'gem'); sound.play('reveal'); sparkle(cells[i], L.board, { color: '#3ccf8f', count: 9, spread: 46 }); }
      out.commit(); return finish(out.round, out.round.outcome.hit ?? -1);
    }
    setCell(cells[i], 'gem'); sound.play('reveal'); sparkle(cells[i], L.board, { color: '#3ccf8f', count: 9, spread: 46 });
    round = out.round; out.commit(); busy = false; paintControls(); pulse(cash);
  }
  async function cashout() {
    if (busy || !round) return;
    busy = true; paintControls();
    const out = await tryAct('cashout', {}, { defer: true });
    if (!out) { busy = false; paintControls(); return; }
    out.commit(); finish(out.round, -1);
  }
  async function finish(r, hitIndex) {
    const win = r.multiplier > 0;
    round = null;
    if (win) { sound.play(r.multiplier >= 5 ? 'bigwin' : 'cashout'); flashGreen(L.board); if (r.multiplier >= 3) winBurst(L.board); }
    banner.show(win ? `WIN ${payoutLine(r)}` : `Mine on tile ${hitIndex + 1} · −${fmt(r.amount)} AGT`, win);
    strip.push(fmtMult(win ? r.multiplier : 0), win);
    play.disabled = true; cash.disabled = true; cash.querySelector('span').textContent = 'Cash out'; status.replaceChildren();
    await revealAll(r.outcome, hitIndex);
    busy = false; play.disabled = false; amount.setDisabled(false); minesField.input.disabled = false; reality.update();
  }
  /** One automatic round: start, reveal the chosen tiles in order, cash out if still alive. */
  async function playAuto(amt) {
    if (busy || round) return null;
    busy = true; play.disabled = true;
    const out = await tryBet('mines', amt, { mines });
    busy = false;
    if (!out) { play.disabled = false; return null; }
    round = out.round; banner.hide(); resetGrid(true); paintControls();
    let settled = null;
    for (const i of autoPicks) {
      if (dead) return null;
      busy = true; cells[i].disabled = true;
      const r = await tryAct('reveal', { index: i }, { defer: true });
      if (!r) { busy = false; return null; }
      if (r.round.status === 'settled') {
        if (r.round.outcome.hit === i) { setCell(cells[i], 'mine', { hit: true }); sound.play('bomb'); shake(grid); flashRed(L.board); shockwave(cells[i], L.board); await sleep(400); }
        else setCell(cells[i], 'gem');
        r.commit(); await finish(r.round, r.round.outcome.hit ?? -1); settled = r.round; break;
      }
      setCell(cells[i], 'gem'); sound.play('reveal');
      round = r.round; r.commit(); busy = false; paintControls();
      await sleep(140);
    }
    if (!settled) {
      busy = true;
      const r = await tryAct('cashout', {}, { defer: true });
      if (!r) { busy = false; return null; }
      r.commit(); await finish(r.round, -1); settled = r.round;
    }
    return settled;
  }
  autoCtl = attachAuto({ panel: L.controls, amount, manual: [play, cash], playRound: playAuto, canStart: () => (autoPicks.length ? null : 'Tap the tiles to reveal each round, then start.'), rtp: () => 0.99, onModeChange: () => resetGrid(Boolean(round)), onStop: () => { if (!round) resetGrid(false); } });
  const existing = openRoundFor('mines');
  if (existing) { round = existing; mines = existing.params.mines; minesField.set(mines); amount.set(existing.amount); resetGrid(true); existing.view.revealed.forEach((i) => setCell(cells[i], 'gem')); }
  else resetGrid(false);
  paintControls();
  return { unmount() { dead = true; } };
}
