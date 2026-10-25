import { h, button, numberInput, fmtMult, outcomeBanner, resultsStrip, fmt, svgUse } from '../ui.js';
import { attach as attachAuto } from './autobet.js';
import { betAmount, realityPanel, layout, tryBet, tryAct, payoutLine, openRoundFor } from './common.js';
import { CHAIN_STEP, round2 } from '../../shared/math.js';
import { sound, sleep, flashRed, flashGreen, winBurst, pulse } from '../fx.js';
import { coin3d } from '../solid.js';

export function mount(root, meta) {
  const L = layout(root);
  let round = null, busy = false, turns = 0, lastSettled = null, autoFlips = 1;
  const amount = betAmount(10, () => reality.update());
  const play = button('Start', { kind: 'primary', size: 'lg block', onClick: () => start() });
  const cash = button('Cash out', { kind: 'orange', size: 'lg block', disabled: true, onClick: () => cashout() });
  L.controls.append(amount, play, cash);
  const coin = coin3d({ size: 150, thick: 13 });
  const mult = h('div', { class: 'bignum num', style: { fontSize: '56px' } }, '1.00x');
  const btns = h('div', { class: 'chain-choices' }, ...['heads', 'tails'].map((c) => button([svgUse(c === 'heads' ? 'ph-crown' : 'ph-lightning'), h('span', {}, c)], { kind: 'tertiary', size: 'lg', disabled: true, onClick: () => flip(c) })));
  const trail = h('div', { class: 'results' });
  L.stage.append(h('div', { class: 'stack', style: { width: '100%', justifyItems: 'center', gap: '18px' } }, mult, coin.el, btns, trail));
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(h('h3', {}, 'Recent streaks'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => ({ winChance: 0.5, multiplier: round2((round?.view?.multiplier ?? 1) * CHAIN_STEP) }));
  L.reality.append(reality);
  const setFace = (side, extraTurns) => coin.set(side, extraTurns, extraTurns > 0);
  function paint() {
    const v = round?.view; const live = Boolean(round);
    play.disabled = live; amount.setDisabled(live);
    btns.querySelectorAll('button').forEach((b) => (b.disabled = !live || busy));
    const streak = v ? v.flips.length : 0;
    cash.disabled = !live || busy || !streak;
    cash.querySelector('span').textContent = live && streak ? `Cash out ${fmt(round.amount * v.multiplier)} AGT` : 'Cash out';
    mult.textContent = fmtMult(v?.multiplier ?? 1);
    trail.replaceChildren(...(v?.flips ?? []).slice(-14).map((x) => h('span', { class: `chip ${x.ok ? 'win' : 'loss'}` }, `${x.choice[0].toUpperCase()}→${x.result[0].toUpperCase()}`)));
  }
  async function start() {
    if (busy || round) return;
    busy = true; play.disabled = true;
    const out = await tryBet('flip', amount.get(), {});
    busy = false;
    if (!out) { play.disabled = false; return; }
    round = out.round; banner.hide(); sound.play('click'); mult.className = 'bignum num'; mult.style.fontSize = '56px'; paint();
  }
  async function flip(choice) {
    if (busy || !round) return;
    busy = true; paint(); sound.play('flip');
    const out = await tryAct('flip', { choice }, { defer: true });
    if (!out) { busy = false; paint(); return; }
    const flips = out.round.status === 'settled' ? out.round.outcome.flips : out.round.view.flips;
    const last = flips[flips.length - 1];
    setFace(last.result, 3); // one toss: three full turns in the air, landing on the called side
    await sleep(1550);
    if (last.ok) { sound.play('reveal'); flashGreen(L.board); pulse(mult); } else { sound.play('lose'); flashRed(L.board); }
    busy = false;
    if (out.round.status === 'settled') { out.commit(); return finish(out.round); }
    round = out.round; out.commit(); paint(); reality.update();
  }
  async function cashout() {
    if (busy || !round) return;
    busy = true; paint();
    const out = await tryAct('cashout', {}, { defer: true });
    if (!out) { busy = false; paint(); return; }
    out.commit(); return finish(out.round);
  }
  function finish(r) {
    lastSettled = r;
    const win = r.multiplier > 0; round = null;
    if (win) { sound.play(r.multiplier >= 8 ? 'bigwin' : 'cashout'); if (r.multiplier >= 8) winBurst(L.board); }
    mult.textContent = fmtMult(win ? r.multiplier : 0); mult.className = `bignum num ${win ? 'win' : 'loss'}`; mult.style.fontSize = '56px';
    banner.show(win ? `WIN ${payoutLine(r)}` : `Lost after ${r.outcome.flips.length} · −${fmt(r.amount)} AGT`, win);
    strip.push(fmtMult(win ? r.multiplier : 0), win);
    paint(); trail.replaceChildren(...r.outcome.flips.slice(-14).map((x) => h('span', { class: `chip ${x.ok ? 'win' : 'loss'}` }, `${x.choice[0].toUpperCase()}→${x.result[0].toUpperCase()}`)));
    reality.update();
  }
  async function playAuto() {
    if (busy || round) return null;
    lastSettled = null;
    await start(); if (!round) return null;
    for (let i = 0; i < autoFlips && round; i++) await flip(Math.random() < 0.5 ? 'heads' : 'tails');
    if (round) await cashout();
    return lastSettled;
  }
  const flipsField = numberInput({ label: 'Wins in a row before cashing out', value: autoFlips, min: 1, max: 20, step: 1, unit: 'flips', onChange: (v) => { autoFlips = Math.max(1, Math.min(20, Math.round(v))); } });
  attachAuto({ panel: L.controls, amount, manual: [play, cash], playRound: playAuto, canStart: () => (round ? 'Finish the current streak first.' : null), rtp: () => 0.99, extra: [flipsField], note: 'Auto calls a random side each flip and cashes out after the streak you set.' });
  const existing = openRoundFor('flip');
  if (existing) { round = existing; amount.set(existing.amount); }
  setFace('heads', 0); paint();
  return { unmount() {} };
}
