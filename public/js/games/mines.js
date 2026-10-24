import { h, button, numberInput, toy, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, tryAct, payoutLine, openRoundFor } from './common.js';
import { minesMultiplier, minesNextSafeChance, round2, MINES_CELLS } from '../../shared/math.js';
import { me } from '../api.js';

export function mount(root, meta) {
  const L = layout(root);
  let mines = 3, round = null, busy = false;
  const amount = betAmount(10, () => reality.update());
  const minesField = numberInput({ label: 'Mines', value: mines, min: 1, max: 24, step: 1, unit: `of ${MINES_CELLS}`, onChange: (v) => { mines = Math.max(1, Math.min(24, Math.round(v))); reality.update(); } });
  const play = button('Start round', { kind: 'primary', size: 'lg block', onClick: () => start() });
  const cash = button('Cash out', { kind: 'orange', size: 'lg block', disabled: true, onClick: () => cashout() });
  const status = h('div', { class: 'stack', style: { gap: '4px' } });
  L.controls.append(amount, minesField, play, cash, status, h('p', { class: 'help' }, 'Each gem multiplies by 0.99 ÷ P(safe). The next-tile chance is shown live. The moment you stop is the only decision that matters.'));

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

  function paint() {
    const v = round?.view;
    cells.forEach((c, i) => {
      c.className = 'cell'; c.replaceChildren(); c.disabled = !round;
      if (v?.revealed.includes(i)) { c.classList.add('gem'); c.disabled = true; c.append(toy('gem', 28)); }
    });
    const live = Boolean(round);
    play.disabled = live; amount.setDisabled(live); minesField.input.disabled = live;
    cash.disabled = !live || !(v?.gems > 0);
    cash.querySelector('span').textContent = live && v?.gems ? `Cash out ${fmt(round.amount * v.multiplier)} AGT (${fmtMult(v.multiplier)})` : 'Cash out';
    status.replaceChildren(...(live ? [h('div', { class: 'kv' }, h('span', {}, 'Next tile'), h('b', {}, `${fmtMult(v.next)} · ${fmtPct(v.nextSafeChance, 1)} safe`))] : []));
    reality.update();
  }
  function showLayout(outcome, hitIndex) {
    cells.forEach((c, i) => {
      c.disabled = true;
      if (outcome.layout.includes(i)) { c.classList.add('mine'); if (i !== hitIndex) c.classList.add('dim'); c.replaceChildren(...[toy('bomb', 28)].flat().filter(Boolean)); }
      else if (outcome.revealed.includes(i)) { c.classList.add('gem'); c.replaceChildren(...[toy('gem', 28)].flat().filter(Boolean)); }
      else { c.classList.add('dim'); c.replaceChildren(...[toy('gem', 22)].flat().filter(Boolean)); }
    });
  }

  async function start() {
    if (busy || round) return;
    busy = true;
    const out = await tryBet('mines', amount.get(), { mines });
    busy = false;
    if (!out) return;
    round = out.round; banner.hide(); paint();
  }
  async function reveal(i) {
    if (busy || !round) return;
    busy = true;
    const out = await tryAct('reveal', { index: i });
    busy = false;
    if (!out) return;
    if (out.round.status === 'settled') return finish(out.round, i);
    round = out.round; paint();
  }
  async function cashout() {
    if (busy || !round) return;
    busy = true;
    const out = await tryAct('cashout');
    busy = false;
    if (out) finish(out.round);
  }
  function finish(r, hitIndex = -1) {
    const win = r.multiplier > 0;
    round = null;
    showLayout(r.outcome, hitIndex);
    play.disabled = false; amount.setDisabled(false); minesField.input.disabled = false; cash.disabled = true; cash.querySelector('span').textContent = 'Cash out';
    banner.show(win ? `WIN ${payoutLine(r)}` : `Mine on tile ${hitIndex + 1} · −${fmt(r.amount)} AGT`, win);
    strip.push(win ? fmtMult(r.multiplier) : '💥', win);
    status.replaceChildren(); reality.update();
  }

  const existing = openRoundFor('mines');
  if (existing) { round = existing; mines = existing.params.mines; minesField.set(mines); amount.set(existing.amount); }
  paint();
  return { unmount() {} };
}
