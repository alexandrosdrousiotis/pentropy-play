import { h, button, segmented, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, payoutLine } from './common.js';
import { PLINKO_ROWS, PLINKO_RISKS, plinkoTable, plinkoRtp, binomialProbs } from '../../shared/math.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const binColor = (m) => (m >= 100 ? 'var(--down)' : m >= 10 ? 'var(--warn)' : m >= 2 ? 'var(--gold)' : m >= 1 ? 'var(--up)' : 'var(--fg-3)');

export function mount(root, meta) {
  const L = layout(root);
  let rows = 16, risk = 'medium', busy = 0, cancelled = false;
  const amount = betAmount(10, () => reality.update());
  const riskSeg = segmented(PLINKO_RISKS.map((r) => ({ value: r, label: r })), risk, (v) => { risk = v; build(); reality.update(); }, { block: true });
  const rowsSeg = segmented(PLINKO_ROWS.map((r) => ({ value: r, label: String(r) })), rows, (v) => { rows = v; build(); reality.update(); }, { block: true });
  const play = button('Drop ball', { kind: 'primary', size: 'lg block', onClick: () => go() });
  L.controls.append(amount, h('div', { class: 'field' }, h('label', {}, 'Risk'), riskSeg), h('div', { class: 'field' }, h('label', {}, 'Rows'), rowsSeg), play,
    h('p', { class: 'help' }, 'Left or right at every peg, 50/50. The edge bins pay thousands because the ball almost never gets there; the middle bins pay less than your stake because it almost always does.'));

  const board = h('div', { class: 'plinko' });
  const bins = h('div', { class: 'bins' });
  L.stage.append(h('div', { class: 'stack', style: { width: '100%', justifyItems: 'center', gap: '6px' } }, board, bins));
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(h('h3', {}, 'Recent drops'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => {
    const t = plinkoTable(risk, rows), p = binomialProbs(rows);
    const pWin = t.reduce((a, m, k) => a + (m > 1 ? p[k] : 0), 0);
    return { rtp: plinkoRtp(risk, rows), winChance: pWin, note: `The ${fmtMult(t[0])} edge bin comes up ${fmtPct(p[0], 4)} of the time. The centre bin pays ${fmtMult(t[Math.floor(rows / 2)])} and comes up ${fmtPct(p[Math.floor(rows / 2)], 1)} of the time.` };
  });
  L.reality.append(reality);

  let svg, pegPos = [], W = 100, H = 95;
  function build() {
    const t = plinkoTable(risk, rows);
    svg = el('svg', { viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    pegPos = [];
    const dx = W / (rows + 2), dy = (H - 8) / rows;
    for (let r = 0; r < rows; r++) {
      const n = r + 3; const row = [];
      for (let i = 0; i < n; i++) {
        const x = W / 2 + (i - (n - 1) / 2) * dx, y = 6 + r * dy;
        row.push({ x, y });
        svg.append(el('circle', { cx: x, cy: y, r: Math.max(0.7, dx * 0.12), class: 'peg' }));
      }
      pegPos.push(row);
    }
    board.replaceChildren(...[svg].flat().filter(Boolean));
    bins.style.gridTemplateColumns = `repeat(${rows + 1},1fr)`;
    bins.replaceChildren(...t.map((m) => h('div', { class: 'bin num', style: { background: binColor(m) } }, m >= 1000 ? `${Math.round(m / 1000)}k` : m >= 100 ? Math.round(m) : m.toFixed(m >= 10 ? 1 : m < 1 ? 2 : 1))));
  }
  build();

  async function go() {
    if (busy >= 3) return; // up to three balls in flight, like the real thing
    busy++;
    const t = plinkoTable(risk, rows);
    const out = await tryBet('plinko', amount.get(), { rows, risk }, { defer: true });
    if (!out) { busy--; return; }
    const { round } = out;
    const ball = el('circle', { r: Math.max(1.2, (W / (rows + 2)) * 0.28), class: 'ball', cx: W / 2, cy: 0 });
    svg.append(ball);
    let pos = (rows - 1) / 2 + 1; // index relative to first row of 3 pegs: start between pegs 1 and 2
    let x = W / 2, y = 0;
    const dirs = round.outcome.dirs;
    const stepMs = Math.max(90, 1500 / rows);
    for (let r = 0; r < rows; r++) {
      if (cancelled) break;
      const row = pegPos[r];
      const dx = W / (rows + 2);
      // the ball sits between peg (pos) and (pos+1) above row r: hit peg then bounce left/right
      const pegX = row[Math.floor((row.length - 1) / 2)].x + (x - W / 2);
      const targetX = x + (dirs[r] ? dx / 2 : -dx / 2);
      const targetY = row[0].y;
      await tween(ball, x, y, pegX, targetY - 1.2, stepMs * 0.55);
      await tween(ball, pegX, targetY - 1.2, targetX, targetY + 1.5, stepMs * 0.45, true);
      x = targetX; y = targetY + 1.5;
    }
    await tween(ball, x, y, x, H, 160);
    ball.remove();
    const bin = round.outcome.bin;
    const binEl = bins.children[bin];
    binEl.classList.add('hit'); setTimeout(() => binEl.classList.remove('hit'), 300);
    const win = round.multiplier >= 1;
    banner.show(`${fmtMult(t[bin])} · ${payoutLine(round)}`, round.multiplier > 1);
    strip.push(fmtMult(round.multiplier), round.multiplier > 1);
    out.commit();
    busy--;
  }
  function tween(node, x0, y0, x1, y1, ms, arc = false) {
    return new Promise((r) => {
      const t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / ms);
        const e = arc ? k : k * k; // fall accelerates, bounce is linear
        const x = x0 + (x1 - x0) * e, y = y0 + (y1 - y0) * e - (arc ? Math.sin(k * Math.PI) * 1.2 : 0);
        node.setAttribute('cx', x.toFixed(2)); node.setAttribute('cy', y.toFixed(2));
        if (k < 1 && !cancelled) requestAnimationFrame(step); else r();
      };
      requestAnimationFrame(step);
    });
  }
  return { unmount() { cancelled = true; } };
}
