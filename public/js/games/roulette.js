// Roulette, live: one wheel for the whole table. Bets open for fifteen seconds, lock, the wheel
// spins once, and every player is paid off the same number.
import { h, button, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt, toast } from '../ui.js';
import { betAmount, realityPanel, layout } from './common.js';
import { api } from '../api.js';
import { ROULETTE_RED, ROULETTE_RTP, roulettePayout } from '../../shared/math.js';
import { sound, tween, ease, flashGreen, flashRed, winBurst, haptic, sparkle } from '../fx.js';
import { livePoller, phaseBar, playersPanel, fairLine, historyStrip } from './live-ui.js';

const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const colourOf = (n) => (n === 0 ? '#166534' : ROULETTE_RED.has(n) ? '#b91c1c' : '#111827');
const chipColour = (n) => (n === 0 ? 'rgba(60,207,143,.35)' : ROULETTE_RED.has(n) ? 'rgba(255,92,122,.35)' : 'var(--surface-3)');
const keyOf = (b) => `${b.type}:${b.value ?? 0}`;
const labelOf = (b) => ({ straight: String(b.value), red: 'Red', black: 'Black', odd: 'Odd', even: 'Even', low: '1–18', high: '19–36', dozen: `${['1st', '2nd', '3rd'][b.value - 1]} 12`, column: `Col ${b.value}` })[b.type];
const paysOf = (b) => (b.type === 'straight' ? 36 : b.type === 'dozen' || b.type === 'column' ? 3 : 2);

export function mount(root, meta) {
  const L = layout(root);
  let state = null, busy = false, dead = false, angle = 0, spunRound = 0, lastPhase = '', lastRound = 0, picked = { type: 'red', value: 0 };
  const seen = new Set();
  const amount = betAmount(10, () => reality.update());
  const clear = button('Clear my bets', { kind: 'tertiary', size: 'sm', onClick: () => clearBets() });
  const staked = h('div', { class: 'kv' }, h('span', {}, 'On the table'), h('b', { class: 'num' }, '0.00 AGT'));
  const hint = h('p', { class: 'help live-hint' }, 'Tap a square to put the bet amount on it. Tap again to add more.');
  L.controls.append(amount, staked, clear, hint);
  // table
  const tableEl = h('div', { class: 'rtable' });
  const cellMap = new Map();
  const cellBtn = (label, b, cls = '') => { const c = h('button', { type: 'button', class: `rcell ${cls}`, onClick: () => place(b) }, h('span', { class: 'rl' }, label), h('span', { class: 'rchip num', hidden: true })); cellMap.set(keyOf(b), c); return c; };
  const grid = h('div', { class: 'rgrid' });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 12; c++) { const n = c * 3 + (3 - r); grid.append(cellBtn(String(n), { type: 'straight', value: n }, ROULETTE_RED.has(n) ? 'red' : 'black')); }
  tableEl.append(h('div', { class: 'rzero' }, cellBtn('0', { type: 'straight', value: 0 }, 'green')), grid,
    h('div', { class: 'rcols' }, ...[3, 2, 1].map((v) => cellBtn('2:1', { type: 'column', value: v }, 'outside'))),
    h('div', { class: 'rdozens' }, ...[1, 2, 3].map((v) => cellBtn(`${v === 1 ? '1st' : v === 2 ? '2nd' : '3rd'} 12`, { type: 'dozen', value: v }, 'outside'))),
    h('div', { class: 'routs' }, cellBtn('1–18', { type: 'low', value: 0 }, 'outside'), cellBtn('Even', { type: 'even', value: 0 }, 'outside'), cellBtn('Red', { type: 'red', value: 0 }, 'outside red'), cellBtn('Black', { type: 'black', value: 0 }, 'outside black'), cellBtn('Odd', { type: 'odd', value: 0 }, 'outside'), cellBtn('19–36', { type: 'high', value: 0 }, 'outside')));
  // wheel
  const wrap = h('div', { class: 'wheel-wrap small' });
  const svg = el('svg', { viewBox: '-100 -100 200 200' }); const disc = el('g', {});
  const step = 360 / 37;
  ORDER.forEach((n, i) => { const a0 = (i * step - 90) * Math.PI / 180, a1 = a0 + step * Math.PI / 180; const p = (a, r) => `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`; disc.append(el('path', { d: `M${p(a0, 96)} A96,96 0 0 1 ${p(a1, 96)} L${p(a1, 66)} A66,66 0 0 0 ${p(a0, 66)} Z`, fill: colourOf(n), stroke: '#0a0b0d', 'stroke-width': .8 })); const am = (a0 + a1) / 2; const t = el('text', { x: (Math.cos(am) * 82).toFixed(2), y: (Math.sin(am) * 82).toFixed(2), 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#fff', 'font-size': 7, 'font-weight': 700, transform: `rotate(${(i * step + step / 2)} ${(Math.cos(am) * 82).toFixed(2)} ${(Math.sin(am) * 82).toFixed(2)})` }); t.textContent = String(n); disc.append(t); });
  const ball = el('circle', { r: 4.5, cx: 0, cy: -80, fill: '#fff', class: 'rball' });
  svg.append(disc, el('circle', { r: 62, fill: 'var(--surface)' }), ball);
  const pointer = h('div', { class: 'wheel-pointer' }); const readout = h('div', { class: 'wheel-readout num' }, '—');
  wrap.append(svg, pointer, readout);
  const bar = phaseBar();
  const hist = historyStrip('roulette');
  const fair = fairLine('roulette');
  const players = playersPanel();
  L.stage.append(h('div', { class: 'stack live-stage' }, hist.el, bar.el, h('div', { class: 'roulette-stage' }, wrap, tableEl), fair.el));
  L.board.classList.add('live-board');
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(players.el, h('h3', {}, 'My recent spins'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => { let wins = 0; for (let n = 0; n <= 36; n++) if (roulettePayout(picked.type, picked.value, n) > 0) wins++; return { rtp: ROULETTE_RTP, winChance: wins / 37, multiplier: paysOf(picked), note: `Last square tapped: ${labelOf(picked)} pays ${paysOf(picked)}x and wins ${fmtPct(wins / 37, 1)} of spins. Every square on this table returns 97.3%.` }; });
  L.reality.append(reality);

  function paintChips() {
    const totals = new Map();
    for (const b of state?.mine ?? []) totals.set(keyOf(b.params), (totals.get(keyOf(b.params)) || 0) + b.amount);
    for (const [k, c] of cellMap) { const t = totals.get(k); const chip = c.querySelector('.rchip'); chip.hidden = !t; chip.textContent = t ? fmt(t, t >= 100 ? 0 : 2) : ''; c.classList.toggle('has', Boolean(t)); }
    const total = [...totals.values()].reduce((a, b) => a + b, 0);
    staked.lastChild.textContent = `${fmt(total)} AGT`;
    clear.disabled = busy || !total || state?.phase !== 'betting';
  }
  async function place(b) {
    if (busy || !state || state.phase !== 'betting') { if (state && state.phase !== 'betting') toast('Bets are locked until the next spin.', 'bad'); return; }
    picked = b; reality.update();
    busy = true; paintChips(); sound.play('click');
    try { const r = await api.liveBet('roulette', { amount: amount.get(), type: b.type, value: b.value ?? 0 }); state.mine.push(r.bet); state.bets.unshift(r.bet); haptic(8); sparkle(cellMap.get(keyOf(b)), L.board, { color: '#e6b655', count: 6, spread: 26 }); }
    catch (e) { toast(e.message, 'bad'); }
    busy = false; paintChips(); poller.kick();
  }
  async function clearBets() {
    if (busy || !state) return;
    busy = true; paintChips();
    try { await api.liveClear(); state.mine = []; state.bets = state.bets.filter((x) => !x.mine); sound.play('tick'); }
    catch (e) { toast(e.message, 'bad'); }
    busy = false; paintChips(); poller.kick();
  }
  async function spinTo(n, ms) {
    const idx = ORDER.indexOf(n);
    const target = 360 * 4 + (360 - (idx * step + step / 2));
    const from = angle % 360, to = from + target; let lastTick = -1;
    const ballTurns = -(360 * 6 + 90);
    await tween(Math.max(1500, ms), (e, k) => {
      const a = from + (to - from) * e; disc.style.transform = `rotate(${a}deg)`;
      const ba = ballTurns * e; const r = 80 + 12 * (1 - Math.min(1, k * 1.25)) ** 2 + 10 * (k < 0.8 ? 1 : 0);
      ball.setAttribute('cx', (Math.cos((ba - 90) * Math.PI / 180) * r).toFixed(2)); ball.setAttribute('cy', (Math.sin((ba - 90) * Math.PI / 180) * r).toFixed(2));
      const tk = Math.floor(a / step); if (tk !== lastTick) { lastTick = tk; sound.play('tick'); }
    }, ease.outCubic);
    ball.setAttribute('cx', 0); ball.setAttribute('cy', -80); sound.play('land');
    await tween(380, (e, k) => { const b = Math.abs(Math.sin(k * Math.PI * 3)) * 6 * (1 - k); ball.setAttribute('cy', (-80 - b).toFixed(2)); }, ease.linear);
    angle = to % 360;
    readout.textContent = String(n); readout.style.color = n === 0 ? '#3ccf8f' : ROULETTE_RED.has(n) ? '#ff5c7a' : '#fff';
  }
  function frame() {
    if (dead) return;
    requestAnimationFrame(frame);
    if (!state) return;
    const t = poller.clock.now(), r = state.round;
    if (state.phase === 'betting') bar.set('Place your bets', { remaining: r.bettingEnds - t, total: state.timing.betting, tone: 'open' });
    else if (state.phase === 'running') bar.set('No more bets', { tone: 'live' });
    else bar.set(`${r.result} ${r.result === 0 ? 'green' : ROULETTE_RED.has(r.result) ? 'red' : 'black'}`, { remaining: r.endsAt + state.timing.ending - t, total: state.timing.ending, tone: 'over' });
  }
  function onState(s) {
    state = s; const r = s.round;
    if (r.id !== lastRound) { lastRound = r.id; seen.clear(); banner.hide(); readout.textContent = '—'; readout.style.color = ''; tableEl.querySelectorAll('.rcell.hit').forEach((c) => c.classList.remove('hit')); }
    if (s.phase === 'running' && spunRound !== r.id && r.result != null) { spunRound = r.id; spinTo(r.result, r.endsAt - poller.clock.now()); }
    if (s.phase !== lastPhase) {
      lastPhase = s.phase;
      if (s.phase === 'ended') {
        if (spunRound !== r.id) { spunRound = r.id; spinTo(r.result, 1500); }
        cellMap.get(`straight:${r.result}`)?.classList.add('hit');
      }
    }
    // my settlements, once per bet; one banner for the spin
    const fresh = s.mine.filter((b) => b.payout != null && !seen.has(b.id));
    if (fresh.length) {
      fresh.forEach((b) => seen.add(b.id));
      const stake = fresh.reduce((a, b) => a + b.amount, 0), paid = fresh.reduce((a, b) => a + b.payout, 0), net = paid - stake;
      setTimeout(() => {
        const win = net > 0;
        banner.show(win ? `WIN ${fmtMult(paid / stake)} · +${fmt(net)} AGT` : net === 0 ? `${r.result} · push` : `${r.result} ${r.result === 0 ? 'green' : ROULETTE_RED.has(r.result) ? 'red' : 'black'} · −${fmt(-net)} AGT`, win ? true : net === 0 ? 'push' : false);
        strip.push(String(r.result), win);
        if (win) { sound.play(paid / stake >= 10 ? 'bigwin' : 'win'); flashGreen(L.board); if (paid / stake >= 10) winBurst(L.board); } else if (net < 0) { sound.play('lose'); flashRed(L.board); }
        api.refresh().catch(() => {});
      }, 400);
    }
    players.paint(s.bets, (b) => [h('span', { class: 'rb' }, labelOf(b.params)), h('span', { class: 'num' }, fmt(b.amount)), h('span', { class: `num ${b.payout > 0 ? 'good' : b.payout === 0 ? 'bad' : ''}` }, b.payout == null ? '' : b.payout > 0 ? `+${fmt(b.payout - b.amount)}` : `−${fmt(b.amount)}`)]);
    hist.paint(s.history, chipColour);
    fair.paint(r);
    amount.setDisabled(s.phase !== 'betting');
    hint.textContent = s.phase === 'betting' ? (s.mine.length ? `${s.mine.length} bet${s.mine.length > 1 ? 's' : ''} on the table. Add more or clear until the timer ends.` : 'Tap a square to put the bet amount on it. Tap again to add more.') : s.phase === 'running' ? 'No more bets. The wheel is spinning for everyone.' : 'Paying out. The next spin opens in a moment.';
    paintChips();
  }
  const poller = livePoller('roulette', onState, { fast: 900, slow: 1000 });
  requestAnimationFrame(frame);
  return { unmount() { dead = true; poller.stop(); } };
}
