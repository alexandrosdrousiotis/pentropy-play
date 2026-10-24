import { h, button, segmented, toy, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, tryAct, payoutLine, openRoundFor } from './common.js';
import { TOWER_LEVELS, TOWER_ROWS, towerMultiplier, round2 } from '../../shared/math.js';

export function mount(root, meta) {
  const L = layout(root);
  let level = 'medium', round = null, busy = false;
  const amount = betAmount(10, () => reality.update());
  const levelSeg = segmented(Object.entries(TOWER_LEVELS).map(([k, v]) => ({ value: k, label: v.label })), level, (v) => { level = v; build(); reality.update(); }, { block: true });
  const play = button('Start climb', { kind: 'primary', size: 'lg block', onClick: () => start() });
  const cash = button('Cash out', { kind: 'orange', size: 'lg block', disabled: true, onClick: () => cashout() });
  L.controls.append(amount, h('div', { class: 'field' }, h('label', {}, 'Difficulty'), levelSeg), play, cash,
    h('p', { class: 'help' }, 'Each row multiplies by 0.98 ÷ P(safe). Harder modes climb faster and fall sooner. Master pays 256,901x for nine perfect picks: a 1 in 262,144 event.'));

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

  let rows = [];
  function build(outcome = null) {
    const { tiles } = TOWER_LEVELS[level];
    const v = round?.view;
    tower.replaceChildren();
    rows = [];
    for (let r = TOWER_ROWS - 1; r >= 0; r--) {
      const rowEl = h('div', { class: 'trow', style: { gridTemplateColumns: `repeat(${tiles},1fr)` } });
      const active = round && v.row === r;
      if (active) rowEl.classList.add('active');
      for (let t = 0; t < tiles; t++) {
        const c = h('button', { class: 'cell', type: 'button', disabled: !active || busy, 'aria-label': `Row ${r + 1} tile ${t + 1}`, onClick: () => pick(t) });
        const picked = (v?.picks ?? outcome?.picks ?? [])[r];
        if (outcome) {
          const isEgg = outcome.layout[r].includes(t);
          if (r < outcome.row || (r === outcome.row && picked === t)) {
            if (picked === t) { c.classList.add(isEgg ? 'gem' : 'mine'); c.append(toy(isEgg ? 'dragon' : 'bomb', 22)); }
            else if (isEgg) { c.classList.add('dim'); c.append(toy('dragon', 18)); }
            else c.classList.add('dim');
          } else if (isEgg) { c.classList.add('dim'); c.append(toy('dragon', 18)); } else c.classList.add('dim');
        } else if (v && r < v.row) { if (picked === t) { c.classList.add('gem'); c.append(toy('dragon', 22)); } else c.classList.add('dim'); }
        rowEl.append(c);
      }
      rowEl.append(h('div', { class: 'mult num' }, fmtMult(round2(towerMultiplier(level, r + 1)))));
      tower.append(rowEl);
      rows[r] = rowEl;
    }
    const live = Boolean(round);
    play.disabled = live; amount.setDisabled(live); levelSeg.setDisabled(live);
    cash.disabled = !live || !(v?.row > 0);
    cash.querySelector('span').textContent = live && v?.row ? `Cash out ${fmt(round.amount * v.multiplier)} AGT (${fmtMult(v.multiplier)})` : 'Cash out';
  }

  async function start() {
    if (busy || round) return;
    busy = true;
    const out = await tryBet('tower', amount.get(), { level });
    busy = false;
    if (!out) return;
    round = out.round; banner.hide(); build(); reality.update();
  }
  async function pick(t) {
    if (busy || !round) return;
    busy = true; build();
    const out = await tryAct('pick', { tile: t });
    busy = false;
    if (!out) { build(); return; }
    if (out.round.status === 'settled') return finish(out.round);
    round = out.round; build(); reality.update();
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
    round = null;
    build(r.outcome);
    banner.show(win ? `WIN ${payoutLine(r)}` : `Fell on row ${r.outcome.row + 1} · −${fmt(r.amount)} AGT`, win);
    strip.push(win ? fmtMult(r.multiplier) : `row ${r.outcome.row + 1}`, win);
    reality.update();
  }

  const existing = openRoundFor('tower');
  if (existing) { round = existing; level = existing.params.level; levelSeg.set(level); amount.set(existing.amount); }
  build();
  return { unmount() {} };
}
