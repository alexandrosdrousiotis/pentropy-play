import { h, button, segmented, fmtMult, fmtPct, outcomeBanner, resultsStrip } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, payoutLine } from './common.js';
import { PLINKO_ROWS, PLINKO_RISKS, plinkoTable, plinkoRtp, binomialProbs } from '../../shared/math.js';
import { sound, tween, ease, flashGreen, winBurst } from '../fx.js';
import { attach as attachAuto } from './autobet.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const binColor = (m) => (m >= 100 ? 'var(--down)' : m >= 10 ? 'var(--warn)' : m >= 2 ? 'var(--gold)' : m >= 1 ? 'var(--up)' : 'var(--fg-3)');

export function mount(root, meta) {
  const L = layout(root);
  let rows = 16, risk = 'medium', inFlight = 0, dead = false;
  const amount = betAmount(10, () => reality.update());
  const riskSeg = segmented(PLINKO_RISKS.map((r) => ({ value: r, label: r })), risk, (v) => { if (inFlight) { riskSeg.set(risk); return; } risk = v; build(); reality.update(); }, { block: true });
  const rowsSeg = segmented(PLINKO_ROWS.map((r) => ({ value: r, label: String(r) })), rows, (v) => { if (inFlight) { rowsSeg.set(rows); return; } rows = v; build(); reality.update(); }, { block: true });
  const play = button('Drop ball', { kind: 'primary', size: 'lg block', onClick: () => go() });
  L.controls.append(amount, h('div', { class: 'field' }, h('label', {}, 'Risk'), riskSeg), h('div', { class: 'field' }, h('label', {}, 'Rows'), rowsSeg), play);

  const board = h('div', { class: 'plinko' });
  const bins = h('div', { class: 'bins' });
  L.stage.append(h('div', { class: 'stack', style: { width: '100%', justifyItems: 'center', gap: '8px' } }, board, bins));
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(h('h3', {}, 'Recent drops'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => {
    const t = plinkoTable(risk, rows), p = binomialProbs(rows);
    const pWin = t.reduce((a, m, k) => a + (m > 1 ? p[k] : 0), 0);
    return { rtp: plinkoRtp(risk, rows), winChance: pWin, note: `The ${fmtMult(t[0])} edge bin comes up ${fmtPct(p[0], 4)} of the time. The centre bin pays ${fmtMult(t[Math.floor(rows / 2)])} and comes up ${fmtPct(p[Math.floor(rows / 2)], 1)} of the time.` };
  });
  L.reality.append(reality);

  let svg, pegs = [], W = 100, H = 95, dx = 0, dy = 0, pegR = 1;
  function build() {
    const t = plinkoTable(risk, rows);
    svg = el('svg', { viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    pegs = [];
    dx = W / (rows + 2); dy = (H - 10) / rows; pegR = Math.max(0.75, dx * 0.13);
    for (let r = 0; r < rows; r++) {
      const n = r + 3; const row = [];
      for (let i = 0; i < n; i++) {
        const x = W / 2 + (i - (n - 1) / 2) * dx, y = 6 + r * dy;
        const peg = el('circle', { cx: x, cy: y, r: pegR, class: 'peg' });
        row.push({ x, y, el: peg }); svg.append(peg);
      }
      pegs.push(row);
    }
    board.replaceChildren(svg);
    bins.style.gridTemplateColumns = `repeat(${rows + 1},1fr)`;
    bins.replaceChildren(...t.map((m) => h('div', { class: 'bin num', style: { background: binColor(m) } }, m >= 1000 ? `${Math.round(m / 1000)}k` : m >= 100 ? Math.round(m) : m.toFixed(m >= 10 ? 1 : m < 1 ? 2 : 1))));
  }
  build();

  /** Kinematic drop: each hop is a gravity arc from one peg to the next, timed by fall height. */
  async function drop(dirs, bin, onDone) {
    const ballR = Math.max(1.3, dx * 0.3);
    const ball = el('circle', { r: ballR, class: 'ball', cx: W / 2, cy: -2 });
    svg.append(ball);
    let x = W / 2, y = -2, col = 1; // column index of the gap the ball is above (row 0 has 3 pegs → gaps 0..1 around the middle peg)
    const hop = (x0, y0, x1, y1, ms, bounce) => tween(ms, (e, k) => {
      const px = x0 + (x1 - x0) * e;
      const py = y0 + (y1 - y0) * (k * k) - (bounce ? Math.sin(k * Math.PI) * bounce : 0);
      ball.setAttribute('cx', px.toFixed(2)); ball.setAttribute('cy', py.toFixed(2));
    }, ease.linear);
    // fall onto the first peg
    await hop(x, y, pegs[0][1].x, pegs[0][1].y - pegR - ballR, 260, 0);
    x = pegs[0][1].x; y = pegs[0][1].y - pegR - ballR;
    for (let r = 0; r < rows; r++) {
      if (dead) break;
      const rowPegs = pegs[r];
      // ball sits on peg `col` of row r; bounce to the gap, then land on peg col or col+1 of row r+1
      const peg = rowPegs[col];
      peg.el.classList.add('lit'); setTimeout(() => peg.el.classList.remove('lit'), 300);
      sound.play('peg');
      const nextCol = col + (dirs[r] ? 1 : 0);
      const target = r + 1 < rows ? pegs[r + 1][nextCol] : { x: peg.x + (dirs[r] ? dx / 2 : -dx / 2), y: H + 2 };
      const tx = target.x, ty = target.y - pegR - ballR;
      const ms = 150 + Math.sqrt(Math.max(1, ty - y)) * 28;
      await hop(x, y, tx, ty, ms, dx * 0.28);
      x = tx; y = ty; col = nextCol;
    }
    ball.remove();
    onDone();
  }
  async function go(amt = amount.get()) {
    if (inFlight >= 3) return null;
    inFlight++; play.disabled = inFlight >= 3; sound.play('click');
    const t = plinkoTable(risk, rows);
    const out = await tryBet('plinko', amt, { rows, risk }, { defer: true });
    if (!out) { inFlight--; play.disabled = false; return null; }
    const { round } = out;
    await drop(round.outcome.dirs, round.outcome.bin, () => {
      const bin = round.outcome.bin;
      const binEl = bins.children[bin];
      binEl.classList.add('hit'); setTimeout(() => binEl.classList.remove('hit'), 260);
      sound.play('land');
      const big = round.multiplier >= 10;
      if (round.multiplier > 1) { sound.play(big ? 'bigwin' : 'win'); if (big) { flashGreen(L.board); winBurst(L.board); } }
      banner.show(`${fmtMult(t[bin])} · ${payoutLine(round)}`, round.multiplier > 1 ? true : round.multiplier === 1 ? 'push' : false);
      strip.push(fmtMult(round.multiplier), round.multiplier > 1);
      out.commit();
    });
    inFlight--; play.disabled = false;
    return round;
  }
  attachAuto({ panel: L.controls, amount, manual: [play], playRound: (a) => go(a), rtp: () => plinkoRtp(risk, rows) });
  return { unmount() { dead = true; } };
}
