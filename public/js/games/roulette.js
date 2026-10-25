import { h, button, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, payoutLine } from './common.js';
import { ROULETTE_RED, ROULETTE_RTP, roulettePayout } from '../../shared/math.js';
import { sound, tween, ease, flashGreen, flashRed, winBurst } from '../fx.js';
import { attach as attachAuto } from './autobet.js';

const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const colourOf = (n) => (n === 0 ? '#166534' : ROULETTE_RED.has(n) ? '#b91c1c' : '#111827');
export function mount(root, meta) {
  const L = layout(root);
  let bet = { type: 'red', value: 0 }, busy = false, angle = 0;
  const amount = betAmount(10, () => reality.update());
  const play = button('Spin', { kind: 'primary', size: 'lg block', onClick: () => go() });
  const picked = h('div', { class: 'bubble' }, 'Red · pays 2x');
  L.controls.append(amount, h('div', { class: 'field' }, h('label', {}, 'Your bet'), picked), play);
  // table
  const tableEl = h('div', { class: 'rtable' });
  const cellBtn = (label, b, cls = '') => h('button', { type: 'button', class: `rcell ${cls}`, onClick: (e) => select(b, label, e.currentTarget) }, label);
  const grid = h('div', { class: 'rgrid' });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 12; c++) { const n = c * 3 + (3 - r); grid.append(cellBtn(String(n), { type: 'straight', value: n }, ROULETTE_RED.has(n) ? 'red' : 'black')); }
  tableEl.append(h('div', { class: 'rzero' }, cellBtn('0', { type: 'straight', value: 0 }, 'green')), grid,
    h('div', { class: 'rcols' }, ...[3, 2, 1].map((v) => cellBtn('2:1', { type: 'column', value: v }, 'outside'))),
    h('div', { class: 'rdozens' }, ...[1, 2, 3].map((v) => cellBtn(`${v === 1 ? '1st' : v === 2 ? '2nd' : '3rd'} 12`, { type: 'dozen', value: v }, 'outside'))),
    h('div', { class: 'routs' }, cellBtn('1–18', { type: 'low' }, 'outside'), cellBtn('Even', { type: 'even' }, 'outside'), cellBtn('Red', { type: 'red' }, 'outside red'), cellBtn('Black', { type: 'black' }, 'outside black'), cellBtn('Odd', { type: 'odd' }, 'outside'), cellBtn('19–36', { type: 'high' }, 'outside')));
  // wheel
  const wrap = h('div', { class: 'wheel-wrap small' });
  const svg = el('svg', { viewBox: '-100 -100 200 200' }); const disc = el('g', {});
  const step = 360 / 37;
  ORDER.forEach((n, i) => { const a0 = (i * step - 90) * Math.PI / 180, a1 = a0 + step * Math.PI / 180; const p = (a, r) => `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`; disc.append(el('path', { d: `M${p(a0, 96)} A96,96 0 0 1 ${p(a1, 96)} L${p(a1, 66)} A66,66 0 0 0 ${p(a0, 66)} Z`, fill: colourOf(n), stroke: '#0a0b0d', 'stroke-width': .8 })); const am = (a0 + a1) / 2; const t = el('text', { x: (Math.cos(am) * 82).toFixed(2), y: (Math.sin(am) * 82).toFixed(2), 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#fff', 'font-size': 7, 'font-weight': 700, transform: `rotate(${(i * step + step / 2)} ${(Math.cos(am) * 82).toFixed(2)} ${(Math.sin(am) * 82).toFixed(2)})` }); t.textContent = String(n); disc.append(t); });
  const ball = el('circle', { r: 4.5, cx: 0, cy: -80, fill: '#fff', class: 'rball' });
  svg.append(disc, el('circle', { r: 62, fill: 'var(--surface)' }), ball);
  const pointer = h('div', { class: 'wheel-pointer' }); const readout = h('div', { class: 'wheel-readout num' }, '—');
  wrap.append(svg, pointer, readout);
  L.stage.append(h('div', { class: 'roulette-stage' }, wrap, tableEl));
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(h('h3', {}, 'Recent spins'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => { let wins = 0; for (let n = 0; n <= 36; n++) if (roulettePayout(bet.type, bet.value, n) > 0) wins++; return { rtp: ROULETTE_RTP, winChance: wins / 37, multiplier: bet.type === 'straight' ? 36 : bet.type === 'dozen' || bet.type === 'column' ? 3 : 2 }; });
  L.reality.append(reality);
  function select(b, label, cell) {
    if (busy) return;
    bet = { type: b.type, value: b.value ?? 0 };
    tableEl.querySelectorAll('.rcell').forEach((c) => c.classList.remove('sel'));
    const pays = bet.type === 'straight' ? 36 : bet.type === 'dozen' || bet.type === 'column' ? 3 : 2;
    picked.textContent = `${label} · pays ${pays}x`;
    cell?.classList.add('sel'); sound.play('tick'); reality.update();
  }
  async function go(amt = amount.get()) {
    if (busy) return null;
    busy = true; play.disabled = true; amount.setDisabled(true); sound.play('click');
    const out = await tryBet('roulette', amt, { bet: bet.type, value: bet.value }, { defer: true });
    if (!out) { busy = false; play.disabled = false; amount.setDisabled(false); return null; }
    const { round } = out; const n = round.outcome.number; const idx = ORDER.indexOf(n);
    const target = 360 * 4 + (360 - (idx * step + step / 2));
    const from = angle % 360, to = from + target; let lastTick = -1;
    // ball orbits the other way on the outer rim, decelerates, then drops into the pocket under the pointer
    const ballTurns = -(360 * 6 + 90);
    await tween(3600, (e, k) => {
      const a = from + (to - from) * e; disc.style.transform = `rotate(${a}deg)`;
      const ba = ballTurns * e; const r = 80 + 12 * (1 - Math.min(1, k * 1.25)) ** 2 + 10 * (k < 0.8 ? 1 : 0);
      ball.setAttribute('cx', (Math.cos((ba - 90) * Math.PI / 180) * r).toFixed(2)); ball.setAttribute('cy', (Math.sin((ba - 90) * Math.PI / 180) * r).toFixed(2));
      const tk = Math.floor(a / step); if (tk !== lastTick) { lastTick = tk; sound.play('tick'); }
    }, ease.outCubic);
    ball.setAttribute('cx', 0); ball.setAttribute('cy', -80); sound.play('land');
    await tween(380, (e, k) => { const b = Math.abs(Math.sin(k * Math.PI * 3)) * 6 * (1 - k); ball.setAttribute('cy', (-80 - b).toFixed(2)); }, ease.linear);
    angle = to % 360;
    const win = round.multiplier > 0;
    readout.textContent = String(n); readout.style.color = n === 0 ? '#27ad75' : ROULETTE_RED.has(n) ? '#f0616d' : '#fff';
    if (win) { sound.play(round.multiplier >= 36 ? 'bigwin' : 'win'); flashGreen(L.board); if (round.multiplier >= 36) winBurst(L.board); } else { sound.play('lose'); flashRed(L.board); }
    banner.show(`${n} ${n === 0 ? 'green' : ROULETTE_RED.has(n) ? 'red' : 'black'} · ${payoutLine(round)}`, win);
    strip.push(String(n), win);
    out.commit(); busy = false; play.disabled = false; amount.setDisabled(false);
    return round;
  }
  tableEl.querySelector('.rcell.outside.red')?.classList.add('sel');
  attachAuto({ panel: L.controls, amount, manual: [play], playRound: (a) => go(a), rtp: () => ROULETTE_RTP });
  return { unmount() {} };
}
