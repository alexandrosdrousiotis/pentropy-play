import { h, button, segmented, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, payoutLine, sleep } from './common.js';
import { KENO_NUMBERS, KENO_RISKS, kenoTable, kenoRtp, hypergeometric } from '../../shared/math.js';
import { mulberry32 } from '../verify-rng.js';

export function mount(root, meta) {
  const L = layout(root);
  let risk = 'classic', picks = [], busy = false, cancelled = false;
  const amount = betAmount(10, () => reality.update());
  const riskSeg = segmented(KENO_RISKS.map((r) => ({ value: r, label: r })), risk, (v) => { risk = v; table(); reality.update(); }, { block: true });
  const play = button('Draw', { kind: 'primary', size: 'lg block', disabled: true, onClick: () => go() });
  const auto = button('Auto pick', { kind: 'tertiary', size: 'sm', onClick: () => { const r = mulberry32(Date.now()); const n = picks.length || 5; picks = []; while (picks.length < n) { const x = Math.floor(r() * KENO_NUMBERS); if (!picks.includes(x)) picks.push(x); } paint(); table(); reality.update(); } });
  const clear = button('Clear', { kind: 'ghost', size: 'sm', onClick: () => { picks = []; paint(); table(); reality.update(); } });
  const payEl = h('div');
  L.controls.append(amount, h('div', { class: 'field' }, h('label', {}, 'Risk'), riskSeg), h('div', { class: 'row' }, auto, clear), play, payEl,
    h('p', { class: 'help' }, 'Pick 1 to 10 numbers, 10 of 40 are drawn. Every pay table here returns 99.0% over time; risk only changes how lumpy the ride is.'));

  const grid = h('div', { class: 'keno-grid' });
  const cells = Array.from({ length: KENO_NUMBERS }, (_, i) => h('button', { class: 'cell num', type: 'button', onClick: () => toggle(i) }, i + 1));
  grid.append(...cells);
  L.stage.append(grid);
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(h('h3', {}, 'Recent draws'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => {
    if (!picks.length) return { rtp: 0.99, note: 'Pick some numbers to see the odds.' };
    const t = kenoTable(risk, picks.length);
    const pWin = t.reduce((a, m, hh) => a + (m > 1 ? hypergeometric(picks.length, hh) : 0), 0);
    return { rtp: kenoRtp(risk, picks.length), winChance: pWin, note: `With ${picks.length} picks on ${risk}, ${fmtPct(pWin, 2)} of draws pay more than the stake. Hitting all ${picks.length} happens ${fmtPct(hypergeometric(picks.length, picks.length), picks.length > 5 ? 8 : 4)} of the time.` };
  });
  L.reality.append(reality);

  function toggle(i) {
    if (busy) return;
    if (picks.includes(i)) picks = picks.filter((x) => x !== i); else if (picks.length < 10) picks.push(i);
    paint(); table(); reality.update();
  }
  function paint(draw = [], done = false) {
    cells.forEach((c, i) => {
      c.className = 'cell num';
      if (picks.includes(i)) c.classList.add('pick');
      if (draw.includes(i)) c.classList.add(picks.includes(i) ? 'hit' : 'drawn');
      if (done && picks.includes(i) && !draw.includes(i)) c.classList.add('miss');
    });
    play.disabled = !picks.length || busy;
    play.querySelector('span').textContent = picks.length ? `Draw (${picks.length} pick${picks.length > 1 ? 's' : ''})` : 'Pick numbers';
  }
  function table(hits = -1) {
    if (!picks.length) { payEl.replaceChildren(); return; }
    const t = kenoTable(risk, picks.length);
    payEl.replaceChildren(h('table', { class: 'paytable' }, h('thead', {}, h('tr', {}, h('th', {}, 'Hits'), h('th', {}, 'Pays'), h('th', {}, 'Chance'))),
      h('tbody', {}, ...t.map((m, hh) => h('tr', { class: hh === hits ? 'hit' : '' }, h('td', {}, hh), h('td', {}, fmtMult(m)), h('td', {}, fmtPct(hypergeometric(picks.length, hh), 3)))))));
  }
  async function go() {
    if (busy || !picks.length) return;
    busy = true; paint(); amount.setDisabled(true); riskSeg.setDisabled(true);
    const out = await tryBet('keno', amount.get(), { picks: [...picks], risk }, { defer: true });
    if (!out) { busy = false; paint(); amount.setDisabled(false); riskSeg.setDisabled(false); return; }
    const { round } = out;
    const draw = round.outcome.draw;
    const shown = [];
    for (const n of draw) { if (cancelled) break; shown.push(n); paint(shown); await sleep(110); }
    paint(draw, true);
    const win = round.multiplier > 1;
    table(round.outcome.hits);
    banner.show(`${round.outcome.hits} hit${round.outcome.hits === 1 ? '' : 's'} · ${payoutLine(round)}`, round.multiplier >= 1);
    strip.push(`${round.outcome.hits}/${picks.length}`, win);
    out.commit();
    busy = false; paint(draw, true); amount.setDisabled(false); riskSeg.setDisabled(false);
  }
  paint(); table();
  return { unmount() { cancelled = true; } };
}
