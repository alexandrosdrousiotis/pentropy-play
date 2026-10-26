// Chicken: a top-down road crossing. 25 lanes of traffic, each a column; the chicken hops right.
// Everything on screen is drawn in CSS: vehicles with windows and lights, a chicken with a comb and
// a shadow, grass kerbs, a camera that follows. The maths is untouched: one server step per lane.
import { h, button, segmented, numberInput, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt } from '../ui.js';
import { attach as attachAuto } from './autobet.js';
import { betAmount, realityPanel, layout, tryBet, tryAct, payoutLine, openRoundFor } from './common.js';
import { CHICKEN_LEVELS, TRACK_LEN, trackMultiplier, trackNextSafeChance, round2 } from '../../shared/math.js';
import { sound, sleep, shake, flashRed, flashGreen, winBurst, pulse, floatText, sparkle, haptic } from '../fx.js';

const LANE_W = 76;
const COLOURS = ['#ff5c7a', '#8b9cff', '#e6b655', '#3ccf8f', '#c084fc', '#e5e7eb', '#f0a040', '#38bdf8'];
const TYPES = ['car', 'car', 'car', 'truck', 'bus'];
// top-down sprites, front of the vehicle at the top; lanes that drive upward rotate them
const WHEELS = (ys, h = 14) => ys.map((y) => `<rect x="1" y="${y}" width="7" height="${h}" rx="2" fill="#14161c"/><rect x="40" y="${y}" width="7" height="${h}" rx="2" fill="#14161c"/>`).join('');
const VEH_SVG = {
  car: `<svg viewBox="0 0 48 80" aria-hidden="true">${WHEELS([10, 54])}<rect x="5" y="2" width="38" height="76" rx="11" fill="currentColor"/><rect x="5" y="2" width="38" height="76" rx="11" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/><rect x="10" y="24" width="28" height="32" rx="6" fill="rgba(0,0,0,.22)"/><path d="M11 25h26l-4-11H15z" fill="#cfe7ff"/><path d="M12 55h24l-3 8H15z" fill="#a9cbe8"/><rect x="9" y="3" width="8" height="4" rx="2" fill="#fff4c2"/><rect x="31" y="3" width="8" height="4" rx="2" fill="#fff4c2"/><rect x="9" y="73" width="8" height="4" rx="2" fill="#ff5c5c"/><rect x="31" y="73" width="8" height="4" rx="2" fill="#ff5c5c"/></svg>`,
  truck: `<svg viewBox="0 0 48 110" aria-hidden="true">${WHEELS([8, 46, 86])}<rect x="5" y="2" width="38" height="32" rx="8" fill="currentColor"/><rect x="5" y="2" width="38" height="32" rx="8" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/><path d="M11 22h26l-4-10H15z" fill="#cfe7ff"/><rect x="9" y="3" width="8" height="4" rx="2" fill="#fff4c2"/><rect x="31" y="3" width="8" height="4" rx="2" fill="#fff4c2"/><rect x="4" y="36" width="40" height="72" rx="5" fill="#d9dde6"/><rect x="4" y="36" width="40" height="72" rx="5" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/><rect x="8" y="40" width="32" height="64" rx="3" fill="none" stroke="rgba(0,0,0,.12)" stroke-width="1.5"/><rect x="9" y="103" width="8" height="4" rx="2" fill="#ff5c5c"/><rect x="31" y="103" width="8" height="4" rx="2" fill="#ff5c5c"/></svg>`,
  bus: `<svg viewBox="0 0 48 120" aria-hidden="true">${WHEELS([14, 90])}<rect x="4" y="2" width="40" height="116" rx="9" fill="currentColor"/><rect x="4" y="2" width="40" height="116" rx="9" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/><path d="M10 20h28l-3-12H13z" fill="#cfe7ff"/><rect x="16" y="26" width="16" height="84" rx="4" fill="rgba(255,255,255,.14)"/>${[30, 46, 62, 78, 94].map((y) => `<rect x="7" y="${y}" width="6" height="10" rx="1.5" fill="#cfe7ff"/><rect x="35" y="${y}" width="6" height="10" rx="1.5" fill="#cfe7ff"/>`).join('')}<rect x="8" y="3" width="9" height="4" rx="2" fill="#fff4c2"/><rect x="31" y="3" width="9" height="4" rx="2" fill="#fff4c2"/><rect x="8" y="113" width="9" height="4" rx="2" fill="#ff5c5c"/><rect x="31" y="113" width="9" height="4" rx="2" fill="#ff5c5c"/></svg>`,
};
// the chicken from above, facing right
const CHICK_SVG = `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M11 24c-4-2-7-6-9-11 4 2 7 5 10 8zM11 24c-4 2-7 6-9 11 4-2 7-5 10-8zM10 24c-5 0-8-1-10-1 2 2 5 3 10 3z" fill="#d9deea"/><ellipse cx="23" cy="24" rx="15" ry="12.5" fill="#f4f5f8"/><path d="M11 17c7-5 15-5 22-1-4 3-9 5-14 5-4 0-6-1-8-4z" fill="#e0e4ee"/><path d="M11 31c7 5 15 5 22 1-4-3-9-5-14-5-4 0-6 1-8 4z" fill="#e0e4ee"/><circle cx="36" cy="24" r="9" fill="#fafbfd"/><path d="M28.5 24c1-2.5 2.5-3.5 4-2.5 1-2.5 3-2.5 4 0 1-2.5 3-2.5 4 0 1.5-1 3-.5 4 2.5z" fill="#ff4d5e"/><rect x="29" y="23" width="14" height="3.5" rx="1.75" fill="#ff4d5e"/><circle cx="38.5" cy="18.5" r="1.6" fill="#15171c"/><circle cx="38.5" cy="29.5" r="1.6" fill="#15171c"/><path d="M44.5 21l7 3-7 3z" fill="#ffa03a"/></svg>`;


export function mount(root, meta) {
  const L = layout(root);
  let level = 'medium', round = null, busy = false, dead = false, lastSettled = null, autoLanes = 3;
  const amount = betAmount(10, () => reality.update());
  const levelSeg = segmented(Object.entries(CHICKEN_LEVELS).map(([k, v]) => ({ value: k, label: v.label })), level, (v) => { level = v; build(); reality.update(); }, { block: true });
  const play = button('Start', { kind: 'primary', size: 'lg block', onClick: () => start() });
  const step = button('Cross', { kind: 'accent', size: 'lg block', disabled: true, onClick: () => cross() });
  const cash = button('Cash out', { kind: 'orange', size: 'lg block', disabled: true, onClick: () => cashout() });
  L.controls.append(amount, h('div', { class: 'field' }, h('label', {}, 'Difficulty'), levelSeg), play, step, cash);

  const world = h('div', { class: 'road-world' });
  const view = h('div', { class: 'road-view' }, world);
  const mult = h('div', { class: 'bignum num' }, '1.00x');
  const hint = h('div', { class: 'bubble' }, 'start to play');
  L.stage.append(h('div', { class: 'stack chick-stage' }, mult, view, hint));
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(h('h3', {}, 'Recent crossings'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => { const hz = CHICKEN_LEVELS[level].hazards; const k = round?.view?.lane ?? 0; return { winChance: trackNextSafeChance(hz, k), multiplier: round2(trackMultiplier(hz, k + 1)) }; });
  L.reality.append(reality);

  let lanes = [], chicken = null, pos = 0; // pos: 0 = start kerb, 1..25 = lane index+1, 26 = far kerb
  // sprites: clean top-down SVG shapes now; a painted art/sprite-<name>.webp takes over when it exists
  const sprite = (name, svg) => {
    const el = h('div', { class: 'spr', html: svg });
    el.append(h('img', { src: `art/sprite-${name}.webp`, alt: '', decoding: 'async', onLoad: () => el.classList.add('painted'), onError: (e) => e.target.remove() }));
    return el;
  };
  const vehicle = (type, colour, { delay, dur, flip }) => {
    const v = h('div', { class: `veh ${type}${flip ? ' flip' : ''}` }, sprite(type, VEH_SVG[type]));
    v.style.setProperty('--c', colour); v.style.animationDelay = `${delay}s`; v.style.animationDuration = `${dur}s`;
    return v;
  };
  const chickenEl = () => h('div', { class: 'chick' }, h('i', { class: 'shadow' }), h('div', { class: 'sprite' }, sprite('chicken', CHICK_SVG)));
  function build(outcome = null) {
    const hz = CHICKEN_LEVELS[level].hazards; const k = round?.view?.lane ?? outcome?.lane ?? 0;
    world.replaceChildren(); lanes = [];
    world.append(h('div', { class: 'kerb start' }, h('span', {}, 'Start'), h('i', { class: 'flower f1' }), h('i', { class: 'flower f2' })));
    for (let i = 0; i < TRACK_LEN; i++) {
      const safeLane = i < TRACK_LEN - hz;
      const lane = h('div', { class: `lane${i % 2 ? ' alt' : ''}${i < k ? ' crossed' : ''}${i === k && round ? ' next' : ''}` }, h('span', { class: 'lm num' }, safeLane ? fmtMult(round2(trackMultiplier(hz, i + 1))) : ''));
      const hazard = outcome && outcome.layout.includes(i);
      if (!hazard) {
        const n = 1 + (i % 3 === 0 ? 1 : 0), dur = 3.2 + ((i * 7) % 5) * 0.9, flip = i % 2 === 1;
        for (let c = 0; c < n; c++) lane.append(vehicle(TYPES[(i + c * 2) % TYPES.length], COLOURS[(i * 3 + c) % COLOURS.length], { delay: -((i * 1.7 + c * 2.9) % dur), dur, flip }));
      } else {
        lane.classList.add(i === outcome.hit ? 'hit' : 'hazard');
        lane.append(h('i', { class: 'sign' }, '!'));
      }
      world.append(lane); lanes.push(lane);
    }
    world.append(h('div', { class: 'kerb end' }, h('span', {}, 'Safe'), h('i', { class: 'flower f1' }), h('i', { class: 'flower f3' })));
    chicken = chickenEl();
    world.append(chicken);
    pos = round ? k : outcome ? outcome.lane : 0;
    placeChicken(false);
    mult.textContent = fmtMult(round?.view?.multiplier ?? 1); mult.className = 'bignum num';
    paintControls();
  }
  const xOf = (p) => (p === 0 ? LANE_W * 0.5 : p <= TRACK_LEN ? LANE_W * (p - 0.5) + LANE_W : LANE_W * (TRACK_LEN + 1.5));
  function placeChicken(animate = true) {
    const x = xOf(pos);
    chicken.style.transition = animate ? 'left .42s cubic-bezier(.3,.9,.4,1)' : 'none';
    chicken.style.left = `${x}px`;
    const vw = view.clientWidth || 600;
    world.style.transition = animate ? 'transform .45s cubic-bezier(.2,.75,.2,1)' : 'none';
    world.style.transform = `translateX(${Math.max(Math.min(0, vw * 0.42 - x), vw - LANE_W * (TRACK_LEN + 2))}px)`;
  }
  async function hop(to, ms = 420) {
    pos = to; chicken.classList.remove('hop'); void chicken.offsetWidth; chicken.classList.add('hop'); placeChicken(true); sound.play('pop'); await sleep(ms);
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
    chicken.classList.add('ready'); setTimeout(() => chicken.classList.remove('ready'), 600);
  }
  async function cross() {
    if (busy || !round) return;
    busy = true; paintControls();
    const k = round.view.lane;
    const out = await tryAct('step', {}, { defer: true });
    if (!out) { busy = false; paintControls(); return; }
    lanes[k].classList.remove('next');
    if (!(out.round.status === 'settled' && !out.round.outcome.cleared)) lanes[k].classList.add('crossed'); // traffic clears as the chicken lands
    await hop(k + 1);
    if (out.round.status === 'settled' && !out.round.outcome.cleared) {
      // the lane was a trap: a truck comes down the lane and the chicken does not make it
      const lane = lanes[k]; lane.classList.add('hit');
      const truck = vehicle('truck', '#8b93a7', { delay: 0, dur: 0.32, flip: false }); truck.classList.add('crash'); lane.append(truck);
      sound.play('whoosh'); await sleep(260);
      chicken.classList.add('splat'); sparkle(chicken, L.board, { color: '#ffffff', count: 16, spread: 60 }); sound.play('bomb'); haptic([40, 30, 80]); shake(view); flashRed(L.board);
      await sleep(600);
      out.commit(); return finish(out.round);
    }
    lanes[k].classList.add('crossed'); sound.play('reveal');
    round = out.round;
    { const r = chicken.getBoundingClientRect(), vr = view.getBoundingClientRect(); floatText(view, r.left + r.width / 2 - vr.left, r.top - vr.top, fmtMult(round.view?.multiplier ?? out.round.multiplier), 'good'); }
    if (round.status === 'settled') { out.commit(); return finish(round); }
    lanes[k + 1]?.classList.add('next'); mult.textContent = fmtMult(round.view.multiplier); pulse(mult);
    out.commit(); busy = false; paintControls(); reality.update();
  }
  async function cashout() {
    if (busy || !round) return;
    busy = true; paintControls();
    const out = await tryAct('cashout', {}, { defer: true });
    if (!out) { busy = false; paintControls(); return; }
    // sprint for the far kerb: quick hops, then a little dance
    const stride = Math.max(1, Math.ceil((TRACK_LEN + 1 - pos) / 5));
    for (let p = pos + stride; p < TRACK_LEN + 1; p += stride) await hop(p, 180);
    await hop(TRACK_LEN + 1, 300);
    out.commit(); return finish(out.round);
  }
  function finish(r) {
    lastSettled = r;
    const win = r.multiplier > 0; round = null;
    if (win) { sound.play(r.multiplier >= 5 ? 'bigwin' : 'cashout'); flashGreen(L.board); if (r.multiplier >= 5) winBurst(L.board); chicken.classList.add('safe'); sparkle(chicken, L.board, { color: '#e6b655', count: 14, spread: 50 }); }
    banner.show(win ? `WIN ${payoutLine(r)}` : `Hit on lane ${r.outcome.lane + 1} · −${fmt(r.amount)} AGT`, win);
    strip.push(fmtMult(win ? r.multiplier : 0), win);
    r.outcome.layout.forEach((i) => { if (i !== r.outcome.hit && lanes[i]) { lanes[i].classList.add('hazard'); lanes[i].querySelectorAll('.veh').forEach((v) => v.remove()); lanes[i].append(h('i', { class: 'sign' }, '!')); } });
    mult.textContent = fmtMult(win ? r.multiplier : 0); mult.className = `bignum num ${win ? 'win' : 'loss'}`;
    busy = false; paintControls(); reality.update();
  }
  async function playAuto() {
    if (busy || round) return null;
    lastSettled = null;
    await start(); if (!round) return null;
    for (let i = 0; i < autoLanes && round && !dead; i++) await cross();
    if (round) await cashout();
    return lastSettled;
  }
  const lanesField = numberInput({ label: 'Lanes to cross before cashing out', value: autoLanes, min: 1, max: TRACK_LEN, step: 1, unit: 'lanes', onChange: (v) => { autoLanes = Math.max(1, Math.min(TRACK_LEN, Math.round(v))); } });
  attachAuto({ panel: L.controls, amount, manual: [play, step, cash], playRound: playAuto, canStart: () => (round ? 'Finish the current crossing first.' : null), rtp: () => 0.99, extra: [lanesField], note: 'Auto crosses the lanes you set, then cashes out.' });
  const existing = openRoundFor('chicken');
  if (existing) { round = existing; level = existing.params.level; levelSeg.set(level); amount.set(existing.amount); }
  build();
  requestAnimationFrame(() => placeChicken(false));
  return { unmount() { dead = true; } };
}
