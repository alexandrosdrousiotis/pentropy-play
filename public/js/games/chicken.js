// Chicken: a top-down road crossing. 25 lanes, each a column of traffic; the chicken hops right.
import { h, button, segmented, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt, svgUse } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, tryAct, payoutLine, openRoundFor } from './common.js';
import { CHICKEN_LEVELS, TRACK_LEN, trackMultiplier, trackNextSafeChance, round2 } from '../../shared/math.js';
import { sound, sleep, shake, flashRed, flashGreen, winBurst, pulse, tween, ease } from '../fx.js';

const LANE_W = 72;
export function mount(root, meta) {
  const L = layout(root);
  let level = 'medium', round = null, busy = false, dead = false;
  const amount = betAmount(10, () => reality.update());
  const levelSeg = segmented(Object.entries(CHICKEN_LEVELS).map(([k, v]) => ({ value: k, label: v.label })), level, (v) => { level = v; build(); reality.update(); }, { block: true });
  const play = button('Start', { kind: 'primary', size: 'lg block', onClick: () => start() });
  const step = button('Cross', { kind: 'accent', size: 'lg block', disabled: true, onClick: () => cross() });
  const cash = button('Cash out', { kind: 'orange', size: 'lg block', disabled: true, onClick: () => cashout() });
  L.controls.append(amount, h('div', { class: 'field' }, h('label', {}, 'Difficulty'), levelSeg), play, step, cash);

  const world = h('div', { class: 'road-world' });
  const view = h('div', { class: 'road-view' }, world);
  const mult = h('div', { class: 'bignum num', style: { fontSize: '44px' } }, '1.00x');
  const hint = h('div', { class: 'bubble' }, 'start to play');
  L.stage.append(h('div', { class: 'stack', style: { width: '100%', justifyItems: 'center', gap: '12px' } }, mult, view, hint));
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(h('h3', {}, 'Recent crossings'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => { const hz = CHICKEN_LEVELS[level].hazards; const k = round?.view?.lane ?? 0; return { winChance: trackNextSafeChance(hz, k), multiplier: round2(trackMultiplier(hz, k + 1)) }; });
  L.reality.append(reality);

  let lanes = [], chicken = null, pos = 0; // pos: 0 = start kerb, 1..25 = lane index+1, 26 = far kerb
  const car = (delay, dur, flip) => h('div', { class: `car${flip ? ' flip' : ''}`, style: { animationDelay: `${delay}s`, animationDuration: `${dur}s`, background: ['#f0616d', '#4f7bff', '#f5ac37', '#27ad75', '#c084fc', '#e5e7eb'][Math.floor(Math.random() * 6)] } }, h('i'), h('i'));
  function build(outcome = null) {
    const hz = CHICKEN_LEVELS[level].hazards; const k = round?.view?.lane ?? outcome?.lane ?? 0;
    world.replaceChildren(); lanes = [];
    world.append(h('div', { class: 'kerb start' }, h('span', {}, 'Start')));
    for (let i = 0; i < TRACK_LEN; i++) {
      const lane = h('div', { class: `lane${i < k ? ' crossed' : ''}${i === k && round ? ' next' : ''}` },
        h('div', { class: 'dash' }), h('span', { class: 'lm num' }, i < TRACK_LEN - hz ? fmtMult(round2(trackMultiplier(hz, i + 1))) : ''));
      if (!(outcome && outcome.layout.includes(i))) { const n = 1 + (i % 2); for (let c = 0; c < n; c++) lane.append(car(-(Math.random() * 6), 4 + Math.random() * 5, i % 2 === 1)); }
      if (outcome && outcome.layout.includes(i)) { lane.classList.add(i === outcome.hit ? 'hit' : 'hazard'); lane.append(h('div', { class: 'car parked' }, h('i'), h('i'))); }
      world.append(lane); lanes.push(lane);
    }
    world.append(h('div', { class: 'kerb end' }, h('span', {}, 'Safe')));
    chicken = h('div', { class: 'chick' }, svgUse('ph-bird'));
    world.append(chicken);
    pos = round ? k : outcome ? outcome.lane : 0;
    placeChicken(false);
    mult.textContent = fmtMult(round?.view?.multiplier ?? 1); mult.className = 'bignum num'; mult.style.fontSize = '44px';
    paintControls();
  }
  const xOf = (p) => (p === 0 ? LANE_W * 0.5 : p <= TRACK_LEN ? LANE_W * (p - 0.5) + LANE_W : LANE_W * (TRACK_LEN + 1.5));
  function placeChicken(animate = true) {
    const x = xOf(pos);
    chicken.style.left = `${x}px`;
    const vw = view.clientWidth || 600;
    world.style.transition = animate ? 'transform .45s cubic-bezier(.2,.75,.2,1)' : 'none';
    world.style.transform = `translateX(${Math.max(Math.min(0, vw / 2 - x), vw - LANE_W * (TRACK_LEN + 2))}px)`;
  }
  async function hop(to) {
    pos = to; chicken.classList.remove('hop'); void chicken.offsetWidth; chicken.classList.add('hop'); placeChicken(true); sound.play('tick'); await sleep(380);
  }
  function paintControls() {
    const v = round?.view; const live = Boolean(round);
    play.disabled = live; amount.setDisabled(live); levelSeg.setDisabled(live);
    step.disabled = !live || busy; cash.disabled = !live || busy || !(v?.lane > 0);
    step.querySelector('span').textContent = live ? `Cross · ${fmtMult(v.next)} (${fmtPct(v.nextSafeChance, 0)} safe)` : 'Cross';
    cash.querySelector('span').textContent = live && v?.lane ? `Cash out ${fmt(round.amount * v.multiplier)} AGT` : 'Cash out';
    hint.textContent = live ? `Lane ${v.lane} of ${v.safe}` : 'start to play';
  }
  async function start() {
    if (busy || round) return;
    busy = true; play.disabled = true;
    const out = await tryBet('chicken', amount.get(), { level });
    busy = false;
    if (!out) { play.disabled = false; return; }
    round = out.round; banner.hide(); sound.play('click'); build(); reality.update();
  }
  async function cross() {
    if (busy || !round) return;
    busy = true; paintControls();
    const k = round.view.lane;
    const out = await tryAct('step', {}, { defer: true });
    if (!out) { busy = false; paintControls(); return; }
    await hop(k + 1);
    if (out.round.status === 'settled' && !out.round.outcome.cleared) {
      const lane = lanes[k]; lane.classList.add('hit'); lane.classList.remove('next');
      const truck = h('div', { class: 'car crash' }, h('i'), h('i')); lane.append(truck);
      await sleep(260); chicken.classList.add('squish'); chicken.replaceChildren(svgUse('ph-skull')); sound.play('bomb'); shake(view); flashRed(L.board); await sleep(500);
      out.commit(); return finish(out.round);
    }
    lanes[k].classList.add('crossed'); lanes[k].classList.remove('next'); sound.play('reveal');
    round = out.round;
    if (round.status === 'settled') { out.commit(); return finish(round); }
    lanes[k + 1]?.classList.add('next'); mult.textContent = fmtMult(round.view.multiplier); pulse(mult);
    out.commit(); busy = false; paintControls(); reality.update();
  }
  async function cashout() {
    if (busy || !round) return;
    busy = true; paintControls();
    const out = await tryAct('cashout', {}, { defer: true });
    if (!out) { busy = false; paintControls(); return; }
    for (let p = pos + 1; p <= TRACK_LEN + 1; p += Math.max(1, Math.ceil((TRACK_LEN + 1 - pos) / 4))) await hop(Math.min(p, TRACK_LEN + 1));
    await hop(TRACK_LEN + 1);
    out.commit(); finish(out.round);
  }
  function finish(r) {
    const win = r.multiplier > 0; round = null;
    if (win) { sound.play(r.multiplier >= 5 ? 'bigwin' : 'cashout'); flashGreen(L.board); if (r.multiplier >= 5) winBurst(L.board); chicken.classList.add('safe'); }
    banner.show(win ? `WIN ${payoutLine(r)}` : `Hit on lane ${r.outcome.lane + 1} · −${fmt(r.amount)} AGT`, win);
    strip.push(win ? fmtMult(r.multiplier) : '✗', win);
    r.outcome.layout.forEach((i) => { if (i !== r.outcome.hit && lanes[i]) { lanes[i].classList.add('hazard'); lanes[i].append(h('div', { class: 'car parked' }, h('i'), h('i'))); } });
    mult.textContent = fmtMult(win ? r.multiplier : 0); mult.className = `bignum num ${win ? 'win' : 'loss'}`; mult.style.fontSize = '44px';
    busy = false; paintControls(); reality.update();
  }
  const existing = openRoundFor('chicken');
  if (existing) { round = existing; level = existing.params.level; levelSeg.set(level); amount.set(existing.amount); }
  build();
  requestAnimationFrame(() => placeChicken(false));
  return { unmount() { dead = true; } };
}
