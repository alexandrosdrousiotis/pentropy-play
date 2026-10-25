import { h, button, segmented, toy, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, tryAct, payoutLine, openRoundFor } from './common.js';
import { TOWER_LEVELS, TOWER_ROWS, towerMultiplier, round2 } from '../../shared/math.js';
import { egg3d } from '../solid.js';
import { sleep, sound, shake, flashRed, flashGreen, winBurst, popIn, pulse, sparkle, shockwave } from '../fx.js';

export function mount(root, meta) {
  const L = layout(root);
  let level = 'medium', round = null, busy = false, dead = false;
  const amount = betAmount(10, () => reality.update());
  const levelSeg = segmented(Object.entries(TOWER_LEVELS).map(([k, v]) => ({ value: k, label: v.label })), level, (v) => { level = v; build(); reality.update(); }, { block: true });
  const play = button('Start climb', { kind: 'primary', size: 'lg block', onClick: () => start() });
  const cash = button('Cash out', { kind: 'orange', size: 'lg block', disabled: true, onClick: () => cashout() });
  L.controls.append(amount, h('div', { class: 'field' }, h('label', {}, 'Difficulty'), levelSeg), play, cash);

  const tower = h('div', { class: 'tower' });
  L.stage.append(tower);
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(h('h3', {}, 'Recent climbs'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => {
    const { tiles, safe } = TOWER_LEVELS[level];
    const row = round?.view?.row ?? 0;
    return { winChance: safe / tiles, multiplier: round2(towerMultiplier(level, row + 1)), rtp: 0.98, note: round ? `Standing at ${fmtMult(round.view.multiplier)}. The next row is safe ${fmtPct(safe / tiles, 1)} of the time.` : `Reaching the top on ${TOWER_LEVELS[level].label} happens ${fmtPct((safe / tiles) ** TOWER_ROWS, 4)} of the time and pays ${fmtMult(round2(towerMultiplier(level, TOWER_ROWS)))}.` };
  });
  L.reality.append(reality);

  let rows = []; // rows[r] = { el, cells }
  function build() {
    const { tiles } = TOWER_LEVELS[level];
    const v = round?.view;
    tower.replaceChildren(); rows = [];
    for (let r = TOWER_ROWS - 1; r >= 0; r--) {
      const rowEl = h('div', { class: 'trow', style: { gridTemplateColumns: `repeat(${tiles},1fr)` } });
      const cellsR = [];
      for (let t = 0; t < tiles; t++) {
        const c = h('button', { class: 'cell', type: 'button', disabled: true, 'aria-label': `Row ${r + 1} tile ${t + 1}`, onClick: () => pick(r, t) });
        rowEl.append(c); cellsR.push(c);
      }
      rowEl.append(h('div', { class: 'mult num' }, fmtMult(round2(towerMultiplier(level, r + 1)))));
      tower.append(rowEl); rows[r] = { el: rowEl, cells: cellsR };
    }
    if (v) { for (let r = 0; r < v.row; r++) { markEgg(r, v.picks[r], false); rows[r].el.classList.add('done'); } setActive(v.row); }
    paintControls();
  }
  function setActive(r) {
    rows.forEach((row, i) => { row.el.classList.toggle('active', i === r); row.cells.forEach((c) => { if (!c.classList.contains('gem') && !c.classList.contains('mine')) c.disabled = i !== r || busy; }); });
  }
  function markEgg(r, t, animate = true) { const c = rows[r].cells[t]; c.className = 'cell gem'; c.replaceChildren(egg3d('#f5c45a', 40)); c.disabled = true; if (animate) { c.firstChild.classList.add('crack'); popIn(c.firstChild); sparkle(c, L.board, { color: '#3ccf8f', count: 9, spread: 44 }); } }
  function markBomb(r, t) { const c = rows[r].cells[t]; c.className = 'cell mine hitcell'; c.replaceChildren(toy('bomb', 26)); c.disabled = true; popIn(c.firstChild); shockwave(c, L.board); }
  function paintControls() {
    const v = round?.view; const live = Boolean(round);
    play.disabled = live; amount.setDisabled(live); levelSeg.setDisabled(live);
    cash.disabled = !live || busy || !(v?.row > 0);
    cash.querySelector('span').textContent = live && v?.row ? `Cash out ${fmt(round.amount * v.multiplier)} AGT (${fmtMult(v.multiplier)})` : 'Cash out';
  }
  async function revealLayout(outcome) {
    for (let r = 0; r < TOWER_ROWS; r++) {
      if (dead) return;
      const picked = outcome.picks[r];
      rows[r].cells.forEach((c, t) => {
        if (c.classList.contains('gem') || c.classList.contains('mine')) return;
        const egg = outcome.layout[r].includes(t);
        c.className = `cell ${egg ? 'gem' : 'mine'} dim`; c.replaceChildren(egg ? egg3d('#f5c45a', 30) : toy('bomb', 20)); c.disabled = true;
      });
      rows[r].el.classList.remove('active');
      sound.play('tick'); await sleep(45);
    }
  }
  async function start() {
    if (busy || round) return;
    busy = true; play.disabled = true;
    const out = await tryBet('tower', amount.get(), { level });
    busy = false;
    if (!out) { play.disabled = false; return; }
    round = out.round; banner.hide(); sound.play('click'); build(); reality.update();
  }
  async function pick(r, t) {
    if (busy || !round || r !== round.view.row) return;
    busy = true; setActive(-1);
    const out = await tryAct('pick', { tile: t }, { defer: true });
    if (!out) { busy = false; setActive(round.view.row); paintControls(); return; }
    if (out.round.status === 'settled' && !out.round.outcome.cleared) {
      markBomb(r, t); sound.play('bomb'); shake(tower); flashRed(L.board); await sleep(450);
      out.commit(); return finish(out.round);
    }
    markEgg(r, t); sound.play('reveal'); rows[r].el.classList.add('done');
    if (out.round.status === 'settled') { out.commit(); return finish(out.round); }
    round = out.round; out.commit(); busy = false; setActive(round.view.row); paintControls(); pulse(cash); reality.update();
  }
  async function cashout() {
    if (busy || !round) return;
    busy = true; paintControls(); setActive(-1);
    const out = await tryAct('cashout', {}, { defer: true });
    if (!out) { busy = false; setActive(round.view.row); paintControls(); return; }
    out.commit(); finish(out.round);
  }
  async function finish(r) {
    const win = r.multiplier > 0;
    round = null;
    if (win) { sound.play(r.multiplier >= 5 ? 'bigwin' : 'cashout'); flashGreen(L.board); if (r.outcome.cleared || r.multiplier >= 5) winBurst(L.board); }
    banner.show(win ? `WIN ${payoutLine(r)}` : `Fell on row ${r.outcome.row + 1} · −${fmt(r.amount)} AGT`, win);
    strip.push(win ? fmtMult(r.multiplier) : `row ${r.outcome.row + 1}`, win);
    cash.disabled = true; cash.querySelector('span').textContent = 'Cash out';
    if (win) { for (let k = 0; k < r.outcome.row; k++) { const c = rows[k]?.cells[r.outcome.picks[k]]; if (c) { popIn(c.firstChild || c); sparkle(c, L.board, { color: '#e6b655', count: 6, spread: 34 }); } await sleep(70); } }
    await revealLayout(r.outcome);
    busy = false; paintControls(); reality.update();
  }
  const existing = openRoundFor('tower');
  if (existing) { round = existing; level = existing.params.level; levelSeg.set(level); amount.set(existing.amount); }
  build();
  return { unmount() { dead = true; } };
}
