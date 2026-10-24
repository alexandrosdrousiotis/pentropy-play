import { h, button, segmented, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, tryAct, payoutLine, openRoundFor } from './common.js';
import { PUMP_LEVELS, TRACK_LEN, trackMultiplier, trackNextSafeChance, round2 } from '../../shared/math.js';
import { sound, sleep, shake, flashRed, flashGreen, winBurst, pulse } from '../fx.js';

export function mount(root, meta) {
  const L = layout(root);
  let level = 'medium', round = null, busy = false;
  const amount = betAmount(10, () => reality.update());
  const levelSeg = segmented(Object.entries(PUMP_LEVELS).map(([k, v]) => ({ value: k, label: v.label })), level, (v) => { level = v; paint(); reality.update(); }, { block: true });
  const play = button('Start', { kind: 'primary', size: 'lg block', onClick: () => start() });
  const pump = button('Pump', { kind: 'accent', size: 'lg block', disabled: true, onClick: () => doPump() });
  const cash = button('Cash out', { kind: 'orange', size: 'lg block', disabled: true, onClick: () => cashout() });
  L.controls.append(amount, h('div', { class: 'field' }, h('label', {}, 'Difficulty'), levelSeg), play, pump, cash);
  const balloon = h('div', { class: 'balloon' }, h('div', { class: 'shine' }));
  const shards = h('div', { class: 'shards' });
  const stage = h('div', { class: 'balloon-stage' }, balloon, h('div', { class: 'pump-nozzle' }), shards);
  const mult = h('div', { class: 'bignum num', style: { fontSize: '48px' } }, '1.00x');
  const hint = h('div', { class: 'bubble' }, 'start to play');
  L.stage.append(h('div', { class: 'stack', style: { width: '100%', justifyItems: 'center', gap: '8px' } }, mult, stage, hint));
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(h('h3', {}, 'Recent balloons'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => { const hz = PUMP_LEVELS[level].hazards; const k = round?.view?.pumps ?? 0; return { winChance: trackNextSafeChance(hz, k), multiplier: round2(trackMultiplier(hz, k + 1)) }; });
  L.reality.append(reality);
  const scaleFor = (k, safe) => 0.55 + (k / safe) * 1.6;
  function paint() {
    const v = round?.view; const live = Boolean(round);
    const k = v?.pumps ?? 0, safe = v?.safe ?? TRACK_LEN - PUMP_LEVELS[level].hazards;
    balloon.style.setProperty('--s', scaleFor(k, safe)); balloon.style.transform = `scale(${scaleFor(k, safe)})`;
    play.disabled = live; amount.setDisabled(live); levelSeg.setDisabled(live);
    pump.disabled = !live || busy; cash.disabled = !live || busy || !(k > 0);
    pump.querySelector('span').textContent = live ? `Pump · ${fmtMult(v.next)} (${fmtPct(v.nextSafeChance, 0)} safe)` : 'Pump';
    cash.querySelector('span').textContent = live && k ? `Cash out ${fmt(round.amount * v.multiplier)} AGT` : 'Cash out';
    hint.textContent = live ? `${k} of ${safe} pumps` : 'start to play';
    mult.textContent = fmtMult(v?.multiplier ?? 1);
  }
  async function start() {
    if (busy || round) return;
    busy = true; play.disabled = true;
    const out = await tryBet('pump', amount.get(), { level });
    busy = false;
    if (!out) { play.disabled = false; return; }
    round = out.round; banner.hide(); sound.play('click');
    balloon.className = 'balloon'; balloon.style.opacity = '1'; shards.replaceChildren(); mult.className = 'bignum num'; mult.style.fontSize = '48px';
    paint(); reality.update();
  }
  async function doPump() {
    if (busy || !round) return;
    busy = true; paint();
    const out = await tryAct('pump', {}, { defer: true });
    if (!out) { busy = false; paint(); return; }
    sound.play('launch');
    if (out.round.status === 'settled' && !out.round.outcome.cleared) {
      balloon.classList.add('wobble'); await sleep(250);
      balloon.classList.remove('wobble'); balloon.classList.add('pop'); sound.play('bomb'); shake(stage); flashRed(L.board);
      for (let i = 0; i < 14; i++) { const p = h('i'); const a = Math.random() * Math.PI * 2, d = 80 + Math.random() * 140; p.style.setProperty('--bx', `${Math.cos(a) * d}px`); p.style.setProperty('--by', `${Math.sin(a) * d}px`); shards.append(p); }
      await sleep(500);
      out.commit(); return finish(out.round);
    }
    round = out.round;
    balloon.classList.remove('wobble'); void balloon.offsetWidth; balloon.classList.add('wobble');
    paint(); pulse(mult);
    if (round.status === 'settled') { out.commit(); return finish(round); }
    out.commit(); busy = false; paint(); reality.update();
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
    if (win) { sound.play(r.multiplier >= 5 ? 'bigwin' : 'cashout'); flashGreen(L.board); if (r.multiplier >= 5) winBurst(L.board); }
    banner.show(win ? `WIN ${payoutLine(r)}` : `Popped on pump ${r.outcome.pumps + 1} · −${fmt(r.amount)} AGT`, win);
    strip.push(win ? fmtMult(r.multiplier) : '💥', win);
    mult.textContent = fmtMult(win ? r.multiplier : 0); mult.className = `bignum num ${win ? 'win' : 'loss'}`; mult.style.fontSize = '48px';
    busy = false; paint(); reality.update();
    mult.textContent = fmtMult(win ? r.multiplier : 0);
    if (!win) setTimeout(() => { if (!round) { balloon.className = 'balloon'; balloon.style.opacity = '1'; shards.replaceChildren(); } }, 1200);
  }
  const existing = openRoundFor('pump');
  if (existing) { round = existing; level = existing.params.level; levelSeg.set(level); amount.set(existing.amount); }
  paint();
  return { unmount() {} };
}
