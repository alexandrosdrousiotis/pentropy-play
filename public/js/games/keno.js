import { h, button, segmented, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, payoutLine } from './common.js';
import { KENO_NUMBERS, KENO_RISKS, kenoTable, kenoRtp, hypergeometric } from '../../shared/math.js';
import { mulberry32 } from '../verify-rng.js';
import { sleep, sound, flashGreen, winBurst, pulse } from '../fx.js';

export function mount(root, meta) {
  const L = layout(root);
  let risk = 'classic', picks = [], busy = false, dead = false;
  const amount = betAmount(10, () => reality.update());
  const riskSeg = segmented(KENO_RISKS.map((r) => ({ value: r, label: r })), risk, (v) => { risk = v; table(); reality.update(); }, { block: true });
  const play = button('Draw', { kind: 'primary', size: 'lg block', disabled: true, onClick: () => go() });
  const auto = button('Auto pick', { kind: 'tertiary', size: 'sm', onClick: () => { if (busy) return; const r = mulberry32(Date.now()); const n = picks.length || 5; picks = []; while (picks.length < n) { const x = Math.floor(r() * KENO_NUMBERS); if (!picks.includes(x)) picks.push(x); } sound.play('click'); paint(); table(); reality.update(); } });
  const clear = button('Clear', { kind: 'ghost', size: 'sm', onClick: () => { if (busy) return; picks = []; paint(); table(); reality.update(); } });
  const payEl = h('div');
  L.controls.append(amount, h('div', { class: 'field' }, h('label', {}, 'Risk'), riskSeg), h('div', { class: 'row' }, auto, clear), play, payEl);

  const grid = h('div', { class: 'keno-grid' });
  const cells = Array.from({ length: KENO_NUMBERS }, (_, i) => h('button', { class: 'cell num', type: 'button', onClick: () => toggle(i) }, i + 1));
  grid.append(...cells);
  const hitsBubble = h('div', { class: 'bubble' }, 'pick numbers');
  L.stage.append(h('div', { class: 'stack', style: { justifyItems: 'center', gap: '16px', width: '100%' } }, grid, hitsBubble));
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
    if (picks.includes(i)) picks = picks.filter((x) => x !== i); else if (picks.length < 10) picks.push(i); else return;
    sound.play('tick'); paint(); table(); reality.update();
  }
  function paint() {
    cells.forEach((c, i) => { c.className = 'cell num'; if (picks.includes(i)) c.classList.add('pick'); });
    play.disabled = !picks.length || busy;
    play.querySelector('span').textContent = picks.length ? `Draw (${picks.length} pick${picks.length > 1 ? 's' : ''})` : 'Pick numbers';
    hitsBubble.textContent = picks.length ? `${picks.length} of 10 picked` : 'pick numbers'; hitsBubble.className = 'bubble';
  }
  function table(hits = -1) {
    if (!picks.length) { payEl.replaceChildren(); return; }
    const t = kenoTable(risk, picks.length);
    payEl.replaceChildren(h('table', { class: 'paytable' }, h('thead', {}, h('tr', {}, h('th', {}, 'Hits'), h('th', {}, 'Pays'), h('th', {}, 'Chance'))),
      h('tbody', {}, ...t.map((m, hh) => h('tr', { class: hh === hits ? 'hit' : '' }, h('td', {}, hh), h('td', {}, fmtMult(m)), h('td', {}, fmtPct(hypergeometric(picks.length, hh), 3)))))));
  }
  async function go() {
    if (busy || !picks.length) return;
    busy = true; paint(); amount.setDisabled(true); riskSeg.setDisabled(true); sound.play('click');
    const out = await tryBet('keno', amount.get(), { picks: [...picks], risk }, { defer: true });
    if (!out) { busy = false; paint(); amount.setDisabled(false); riskSeg.setDisabled(false); return; }
    const { round } = out;
    let hits = 0;
    for (const n of round.outcome.draw) {
      if (dead) break;
      const isPick = picks.includes(n);
      cells[n].classList.add(isPick ? 'hit' : 'drawn');
      if (isPick) { hits++; sound.play('reveal'); hitsBubble.textContent = `${hits} hit${hits === 1 ? '' : 's'}`; hitsBubble.className = 'bubble win'; pulse(hitsBubble); } else sound.play('tick');
      await sleep(isPick ? 220 : 140);
    }
    picks.forEach((n) => { if (!round.outcome.draw.includes(n)) cells[n].classList.add('miss'); });
    table(round.outcome.hits);
    const win = round.multiplier > 1;
    if (win) { sound.play(round.multiplier >= 10 ? 'bigwin' : 'win'); flashGreen(L.board); if (round.multiplier >= 10) winBurst(L.board); } else if (round.multiplier === 1) sound.play('reveal'); else sound.play('lose');
    hitsBubble.textContent = `${round.outcome.hits} hit${round.outcome.hits === 1 ? '' : 's'} · ${fmtMult(round.multiplier)}`; hitsBubble.className = `bubble ${win ? 'win' : round.multiplier === 1 ? '' : 'lose'}`;
    banner.show(`${round.outcome.hits} hit${round.outcome.hits === 1 ? '' : 's'} · ${payoutLine(round)}`, round.multiplier > 1 ? true : round.multiplier === 1 ? 'push' : false);
    strip.push(`${round.outcome.hits}/${picks.length}`, win);
    out.commit();
    busy = false; play.disabled = false; amount.setDisabled(false); riskSeg.setDisabled(false);
  }
  paint(); table();
  return { unmount() { dead = true; } };
}
