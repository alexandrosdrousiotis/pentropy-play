import { h, button, fmtMult, outcomeBanner, resultsStrip, fmt, svgUse } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, tryAct, payoutLine, openRoundFor } from './common.js';
import { CHAIN_STEP, round2 } from '../../shared/math.js';
import { sound, sleep, flashRed, flashGreen, winBurst, pulse } from '../fx.js';

const ICON = { rock: 'ph-hand-fist', paper: 'ph-cards', scissors: 'ph-x' };
export function mount(root, meta) {
  const L = layout(root);
  let round = null, busy = false;
  const amount = betAmount(10, () => reality.update());
  const play = button('Start', { kind: 'primary', size: 'lg block', onClick: () => start() });
  const cash = button('Cash out', { kind: 'orange', size: 'lg block', disabled: true, onClick: () => cashout() });
  L.controls.append(amount, play, cash);
  const you = h('div', { class: 'rps-hand' }, svgUse('ph-hand-fist')), house = h('div', { class: 'rps-hand house' }, svgUse('ph-hand-fist'));
  const count = h('div', { class: 'rps-count' }, '3');
  const stage = h('div', { class: 'rps-stage', style: { position: 'relative', width: '100%' } }, you, h('span', { class: 'rps-vs' }, 'VS'), house, count);
  const mult = h('div', { class: 'bignum num', style: { fontSize: '56px' } }, '1.00x');
  const btns = h('div', { class: 'chain-choices' }, ...['rock', 'paper', 'scissors'].map((c) => button([svgUse(ICON[c]), h('span', {}, c)], { kind: 'tertiary', size: 'lg', disabled: true, onClick: () => go(c) })));
  const trail = h('div', { class: 'results' });
  L.stage.append(h('div', { class: 'stack', style: { width: '100%', justifyItems: 'center', gap: '18px' } }, mult, stage, btns, trail));
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(h('h3', {}, 'Recent streaks'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => ({ winChance: 0.5, multiplier: round2((round?.view?.multiplier ?? 1) * CHAIN_STEP), note: 'Ties replay for free' }));
  L.reality.append(reality);
  const chip = (x) => h('span', { class: `chip ${x.result === 'win' ? 'win' : x.result === 'lose' ? 'loss' : ''}` }, `${x.pick[0].toUpperCase()} v ${x.house[0].toUpperCase()}`);
  function paint() {
    const v = round?.view; const live = Boolean(round);
    play.disabled = live; amount.setDisabled(live);
    btns.querySelectorAll('button').forEach((b) => (b.disabled = !live || busy));
    cash.disabled = !live || busy || !(v?.wins > 0);
    cash.querySelector('span').textContent = live && v?.wins ? `Cash out ${fmt(round.amount * v.multiplier)} AGT` : 'Cash out';
    mult.textContent = fmtMult(v?.multiplier ?? 1);
    trail.replaceChildren(...(v?.rounds ?? []).slice(-14).map(chip));
  }
  async function start() {
    if (busy || round) return;
    busy = true; play.disabled = true;
    const out = await tryBet('rps', amount.get(), {});
    busy = false;
    if (!out) { play.disabled = false; return; }
    round = out.round; banner.hide(); sound.play('click'); mult.className = 'bignum num'; mult.style.fontSize = '56px';
    you.className = 'rps-hand'; house.className = 'rps-hand house'; you.replaceChildren(svgUse('ph-hand-fist')); house.replaceChildren(svgUse('ph-hand-fist')); paint();
  }
  async function go(choice) {
    if (busy || !round) return;
    busy = true; paint();
    const out = await tryAct('throw', { choice }, { defer: true });
    if (!out) { busy = false; paint(); return; }
    you.className = 'rps-hand'; house.className = 'rps-hand house';
    you.replaceChildren(svgUse('ph-hand-fist')); house.replaceChildren(svgUse('ph-hand-fist'));
    you.classList.add('shake'); house.classList.add('shake');
    stage.classList.add('counting'); for (const n of ['3', '2', '1']) { count.textContent = n; count.classList.remove('show'); void count.offsetWidth; count.classList.add('show'); sound.play('tick'); await sleep(300); } stage.classList.remove('counting');
    you.classList.remove('shake'); house.classList.remove('shake');
    const rounds = out.round.status === 'settled' ? out.round.outcome.rounds : out.round.view.rounds;
    const last = rounds[rounds.length - 1];
    you.replaceChildren(svgUse(ICON[last.pick])); house.replaceChildren(svgUse(ICON[last.house])); sound.play('flip');
    await sleep(200);
    if (last.result === 'win') { you.classList.add('winner'); sound.play('reveal'); flashGreen(L.board); pulse(mult); }
    else if (last.result === 'lose') { house.classList.add('winner'); sound.play('lose'); flashRed(L.board); }
    else sound.play('tick');
    await sleep(500);
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
    const win = r.multiplier > 0; round = null;
    if (win) { sound.play(r.multiplier >= 8 ? 'bigwin' : 'cashout'); if (r.multiplier >= 8) winBurst(L.board); }
    mult.textContent = fmtMult(win ? r.multiplier : 0); mult.className = `bignum num ${win ? 'win' : 'loss'}`; mult.style.fontSize = '56px';
    banner.show(win ? `WIN ${payoutLine(r)}` : `Lost after ${r.outcome.rounds.length} · −${fmt(r.amount)} AGT`, win);
    strip.push(win ? fmtMult(r.multiplier) : '✗', win);
    paint(); trail.replaceChildren(...r.outcome.rounds.slice(-14).map(chip)); reality.update();
  }
  const existing = openRoundFor('rps');
  if (existing) { round = existing; amount.set(existing.amount); }
  paint();
  return { unmount() {} };
}
