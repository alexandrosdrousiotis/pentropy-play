// Solids drawn in CSS 3D: a coin with a reeded edge and a cut gem with crown, table and pavilion.
// No library, no canvas; every facet is a div in a preserve-3d box, lit by its angle to one lamp.
import { h, svgUse } from './ui.js';

const DEG = 180 / Math.PI;
/** Brightness of a facet at `deg` around the axis, lamp up-front-left. */
const lamp = (deg, lo = 0.35, hi = 1) => { const c = Math.cos((deg - 330) / DEG); return (lo + (hi - lo) * (0.5 + 0.5 * c)).toFixed(3); };

/** A brilliant-cut gem of `size` px in `colour`. Add `.spin` for a fast turn, `.match` for the win pulse. */
export function gem3d(colour = '#3ccf8f', size = 84) {
  const R = size / 2, N = 8, T = 0.5, H1 = size * 0.26, H2 = size * 0.44;
  const a = R * Math.cos(Math.PI / N), b = 2 * R * Math.sin(Math.PI / N), at = a * T, bt = b * T;
  const root = h('div', { class: 'gem3d', 'aria-hidden': 'true' });
  root.style.width = root.style.height = `${size}px`; root.style.setProperty('--g', colour);
  const body = h('div', { class: 'g-body' });
  const s1 = Math.hypot(H1, a - at), s2 = Math.hypot(H2, a);
  const inset = (((b - bt) / 2 / b) * 100).toFixed(2);
  for (let i = 0; i < N; i++) {
    const th = (360 / N) * i;
    const c = h('i', { class: 'g-f crown' });
    Object.assign(c.style, { width: `${b}px`, height: `${s1}px`, left: `${R - b / 2}px`, top: `${R - s1}px`, clipPath: `polygon(${inset}% 0, ${100 - inset}% 0, 100% 100%, 0 100%)`, transformOrigin: '50% 100%', transform: `rotateY(${th}deg) translateZ(${a}px) rotateX(${(Math.atan2(a - at, H1) * DEG).toFixed(2)}deg)` });
    c.style.setProperty('--l', lamp(th, 0.45, 1));
    const p = h('i', { class: 'g-f pav' });
    Object.assign(p.style, { width: `${b}px`, height: `${s2}px`, left: `${R - b / 2}px`, top: `${R}px`, clipPath: 'polygon(0 0, 100% 0, 50% 100%)', transformOrigin: '50% 0', transform: `rotateY(${th + 22.5}deg) translateZ(${a}px) rotateX(${(-Math.atan2(a, H2) * DEG).toFixed(2)}deg)` });
    p.style.setProperty('--l', lamp(th + 22.5, 0.2, 0.8));
    body.append(c, p);
  }
  const d = 2 * at / Math.cos(Math.PI / N);
  const table = h('i', { class: 'g-f table' });
  Object.assign(table.style, { width: `${d}px`, height: `${d}px`, left: `${R - d / 2}px`, top: `${R - d / 2}px`, clipPath: 'polygon(29.3% 0, 70.7% 0, 100% 29.3%, 100% 70.7%, 70.7% 100%, 29.3% 100%, 0 70.7%, 0 29.3%)', transform: `translateY(${-H1}px) rotateX(90deg)` });
  table.style.setProperty('--l', '1');
  body.append(table);
  root.append(h('i', { class: 'g-glow' }), body, h('i', { class: 'g-shadow' }));
  return root;
}

/** A coin of `size` px. `set(side, extraTurns)` tosses it end over end and lands on `side`. */
export function coin3d({ size = 140, thick = 12, heads = 'ph-crown', tails = 'ph-lightning' } = {}) {
  const R = size / 2, N = 48, w = (2 * Math.PI * R) / N + 0.8;
  const inner = h('div', { class: 'c-inner' });
  const face = (cls, icon, tf) => { const f = h('div', { class: `c-face ${cls}` }, h('i', { class: 'c-ring' }), svgUse(icon)); f.style.transform = tf; return f; };
  inner.append(face('heads', heads, `translateZ(${thick / 2}px)`), face('tails', tails, `rotateX(180deg) translateZ(${thick / 2}px)`));
  for (let i = 0; i < N; i++) {
    const th = (360 / N) * i;
    const s = h('i', { class: 'c-slat' });
    Object.assign(s.style, { width: `${w}px`, height: `${thick}px`, left: `${R - w / 2}px`, top: `${R - thick / 2}px`, transform: `rotateZ(${th}deg) translateY(${-R * Math.cos(Math.PI / N)}px) rotateX(90deg)` });
    s.style.setProperty('--l', String((Number(lamp(th + 90, 0.3, 1)) * (i % 2 ? 0.82 : 1)).toFixed(3)));
    inner.append(s);
  }
  const tilt = h('div', { class: 'c-tilt' }, inner);
  const root = h('div', { class: 'coin3d', 'aria-hidden': 'true' }, tilt, h('i', { class: 'c-shadow' }));
  root.style.width = root.style.height = `${size}px`;
  let turns = 0;
  return {
    el: root,
    /** keep turning while we wait for the server */
    spin(on) { root.classList.toggle('spin', on); },
    /** land on `side` after `extra` full end-over-end turns, with the toss arc */
    set(side, extra = 0, animate = true) {
      turns += extra;
      inner.style.transition = animate ? 'transform 1.4s cubic-bezier(.22,.9,.3,1)' : 'none';
      inner.style.transform = `rotateX(${turns * 360 + (side === 'tails' ? 180 : 0)}deg)`;
      if (animate && extra) { root.classList.remove('toss'); void root.offsetWidth; root.classList.add('toss'); }
    },
  };
}
