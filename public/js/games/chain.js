// Shared UI for streak games with a 50/50 step (Flip, Rock Paper Scissors).
import { h, button, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt, svgUse } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, tryAct, payoutLine, openRoundFor } from './common.js';
import { CHAIN_STEP, round2 } from '../../shared/math.js';
import { sound, sleep, shake, flashRed, flashGreen, winBurst, popIn, pulse } from '../fx.js';

export function mountChain(root, meta, { id, action, choices, icons, historyKey, resultOf, labelOf, startLabel }) {
  const L = layout(root);
  let round = null, busy = false;
  const amount = betAmount(10, () => reality.update());
  const play = button(startLabel, { kind: 'primary', size: 'lg block', onClick: () => start() });
  const cash = button('Cash out', { kind: 'orange', size: 'lg block', disabled: true, onClick: () => cashout() });
  L.controls.append(amount, play, cash);
  const mult = h('div', { class: 'bignum num', style: { fontSize: '56px' } }, '1.00x');
  const face = h('div', { class: 'chain-face' }, svgUse(icons.idle));
  const btns = h('div', { class: 'chain-choices' }, ...choices.map((c) => button([svgUse(icons[c]), h('span', {}, c)], { kind: 'tertiary', size: 'lg', disabled: true, onClick: () => go(c) })));
  const trail = h('div', { class: 'results' });
  L.stage.append(h('div', { class: 'stack', style: { width: '100%', justifyItems: 'center', gap: '16px' } }, mult, face, btns, trail));
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(h('h3', {}, 'Recent streaks'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => ({ winChance: 0.5, multiplier: round2((round?.view?.multiplier ?? 1) * CHAIN_STEP) }));
  L.reality.append(reality);
  function paint() {
    const v = round?.view; const live = Boolean(round);
    play.disabled = live; amount.setDisabled(live);
    btns.querySelectorAll('button').forEach((b) => (b.disabled = !live || busy));
    const streak = v ? v[historyKey].filter((x) => resultOf(x) === 'win').length : 0;
    cash.disabled = !live || busy || !streak;
    cash.querySelector('span').textContent = live && streak ? `Cash out ${fmt(round.amount * v.multiplier)} AGT` : 'Cash out';
    mult.textContent = fmtMult(v?.multiplier ?? 1);
    trail.replaceChildren(...(v?.[historyKey] ?? []).slice(-14).map((x) => h('span', { class: `chip ${resultOf(x) === 'win' ? 'win' : resultOf(x) === 'lose' ? 'loss' : ''}` }, labelOf(x))));
  }
  async function start() {
    if (busy || round) return;
    busy = true; play.disabled = true;
    const out = await tryBet(id, amount.get(), {});
    busy = false;
    if (!out) { play.disabled = false; return; }
    round = out.round; banner.hide(); sound.play('click'); mult.className = 'bignum num'; mult.style.fontSize = '56px'; face.replaceChildren(svgUse(icons.idle)); paint();
  }
  async function go(choice) {
    if (busy || !round) return;
    busy = true; paint(); sound.play('flip');
    face.classList.add('spin');
    const out = await tryAct(action, { choice }, { defer: true });
    await sleep(500); face.classList.remove('spin');
    if (!out) { busy = false; paint(); return; }
    const hist = out.round.status === 'settled' ? out.round.outcome[historyKey] : out.round.view[historyKey];
    const last = hist[hist.length - 1]; const res = resultOf(last);
    face.replaceChildren(svgUse(icons[last.result ?? last.house])); popIn(face);
    if (res === 'win') { sound.play('reveal'); flashGreen(L.board); pulse(mult); }
    else if (res === 'lose') { sound.play('lose'); flashRed(L.board); shake(face); }
    else sound.play('tick');
    busy = false;
    if (out.round.status === 'settled') { out.commit(); return finish(out.round); }
    round = out.round; out.commit(); paint(); reality.update();
  }
  async function cashout() {
    if (busy || !round) return;
    busy = true; paint();
    const out = await tryAct('cashout', {}, { defer: true });
    if (!out) { busy = false; paint(); return; }
    out.commit(); finish(out.round);
  }
  function finish(r) {
    const win = r.multiplier > 0; const hist = r.outcome[historyKey];
    round = null;
    if (win) { sound.play(r.multiplier >= 8 ? 'bigwin' : 'cashout'); if (r.multiplier >= 8) winBurst(L.board); }
    mult.textContent = fmtMult(win ? r.multiplier : 0); mult.className = `bignum num ${win ? 'win' : 'loss'}`; mult.style.fontSize = '56px';
    banner.show(win ? `WIN ${payoutLine(r)}` : `Lost after ${hist.length} · −${fmt(r.amount)} AGT`, win);
    strip.push(fmtMult(win ? r.multiplier : 0), win);
    paint(); trail.replaceChildren(...hist.slice(-14).map((x) => h('span', { class: `chip ${resultOf(x) === 'win' ? 'win' : resultOf(x) === 'lose' ? 'loss' : ''}` }, labelOf(x))));
    reality.update();
  }
  const existing = openRoundFor(id);
  if (existing) { round = existing; amount.set(existing.amount); }
  paint();
  return { unmount() {} };
}
