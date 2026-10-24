// Tiny DOM helpers, formatting, modal and toast.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string' && k !== 'value') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || typeof c === 'boolean') continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
export const svgUse = (id, cls = '') => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  if (cls) s.setAttribute('class', cls);
  const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  u.setAttribute('href', `#${id}`);
  s.append(u);
  return s;
};
const TOY_ICON = { gem: 'ph-diamond', bomb: 'ph-bomb', dragon: 'ph-egg', gold: 'ph-coins', coin: 'ph-currency-circle-dollar' };
export const toy = (kind, size = 56, extra = '') => h('div', { class: `toy ${kind} ${extra}`, style: { width: `${size}px`, height: `${size}px` } }, svgUse(TOY_ICON[kind] || 'ph-sparkle'));

export const fmt = (n, d = 2) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtAgt = (n) => `${fmt(n)} AGT`;
export const fmtSigned = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;
export const fmtPct = (p, d = 2) => `${(p * 100).toFixed(d)}%`;
export const fmtMult = (m) => (m >= 1000 ? Math.round(m).toLocaleString() : m >= 100 ? m.toFixed(1) : m.toFixed(2)) + 'x';
export const fmtMoney = (n, cur = '€') => `${cur}${fmt(n)}`;
export const fmtDuration = (ms) => {
  const m = Math.floor(ms / 60000), hh = Math.floor(m / 60);
  return hh ? `${hh}h ${m % 60}m` : `${m}m`;
};

/* ---- buttons ---- */
export const button = (label, { kind = 'tertiary', size = '', onClick, disabled = false, attrs = {} } = {}) =>
  h('button', { class: `btn ${kind} ${size}`.trim(), type: 'button', onClick, disabled, ...attrs }, h('span', {}, label));

/* ---- segmented control ---- */
export function segmented(options, value, onChange, { block = false } = {}) {
  const root = h('div', { class: `seg${block ? ' block' : ''}`, role: 'group' });
  const render = () => {
    root.replaceChildren(...options.map((o) => h('button', {
      type: 'button', 'aria-pressed': String(o.value === value), disabled: o.disabled,
      onClick: () => { if (o.value === value) return; value = o.value; render(); onChange(value); },
    }, o.label)));
  };
  render();
  root.set = (v) => { value = v; render(); };
  root.setDisabled = (d) => root.querySelectorAll('button').forEach((b) => (b.disabled = d));
  return root;
}

/* ---- numeric input with helpers ---- */
export function numberInput({ label, value, min = 0, max, step = 0.01, unit = '', onChange, helpers = [] }) {
  const input = h('input', { type: 'number', value: String(value), min: String(min), step: String(step), inputmode: 'decimal' });
  if (max != null) input.max = String(max);
  const fire = () => onChange(Number(input.value));
  input.addEventListener('change', fire);
  input.addEventListener('input', fire);
  const box = h('div', { class: 'input' }, input, unit && h('span', { class: 'unit' }, unit),
    ...helpers.map((hp) => h('button', { class: 'mini', type: 'button', onClick: () => { input.value = String(hp.fn(Number(input.value))); fire(); } }, hp.label)));
  const field = h('div', { class: 'field' }, label && h('label', {}, label), box);
  field.input = input;
  field.set = (v) => { input.value = String(v); };
  return field;
}

/* ---- modal ---- */
export function modal({ title, body, actions = [], dismissible = true }) {
  return new Promise((resolve) => {
    const close = (v) => { bg.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape' && dismissible) close(null); };
    const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
      title && h('h2', { class: 'gt' }, title),
      typeof body === 'string' ? h('p', { class: 't-body' }, body) : body,
      actions.length && h('div', { class: 'actions' }, ...actions.map((a) => button(a.label, { kind: a.kind || 'tertiary', onClick: () => close(a.value ?? a.label) }))));
    const bg = h('div', { class: 'modal-bg', onClick: (e) => { if (e.target === bg && dismissible) close(null); } }, box);
    document.body.append(bg);
    document.addEventListener('keydown', onKey);
    box.querySelector('button')?.focus();
  });
}

/* ---- toast ---- */
let toastRoot;
export function toast(text, kind = '', ms = 3200) {
  toastRoot ||= document.body.appendChild(h('div', { class: 'toasts', 'aria-live': 'polite' }));
  const t = h('div', { class: `toast ${kind}` }, text);
  toastRoot.append(t);
  setTimeout(() => t.remove(), ms);
}

/* ---- outcome banner inside a board ---- */
export function outcomeBanner(board) {
  const el = h('div', { class: 'outcome' });
  board.append(el);
  let timer;
  return {
    show(text, win) {
      el.textContent = text;
      el.className = `outcome show ${win === 'push' ? 'push' : win ? 'win' : 'loss'}`;
      clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove('show'), 2600);
    },
    hide() { el.classList.remove('show'); },
  };
}

/* ---- recent results strip ---- */
export function resultsStrip(max = 14) {
  const root = h('div', { class: 'results', 'aria-label': 'Recent results' });
  return {
    el: root,
    push(label, win) {
      root.prepend(h('span', { class: `chip ${win ? 'win' : 'loss'}` }, label));
      while (root.children.length > max) root.lastChild.remove();
    },
  };
}

/* ---- playing card: a 3D flip card. data-face="up|down" drives the rotation ---- */
import { RANKS, SUITS } from '../shared/math.js';
export function cardEl(card, { big = false, back = false, held = false, selectable = false, onClick, faceDown = false } = {}) {
  const red = card && (card.suit === 1 || card.suit === 2);
  const front = card
    ? h('div', { class: 'face front' }, h('span', { class: 'r' }, RANKS[card.rank - 1]), h('span', { class: 's' }, SUITS[card.suit]), h('span', { class: 'r b' }, RANKS[card.rank - 1]))
    : h('div', { class: 'face front' });
  const el = h('button', {
    type: 'button',
    class: `pcard${red ? ' red' : ''}${big ? ' big' : ''}${held ? ' held' : ''}${selectable ? ' sel' : ''}`,
    'data-face': back || faceDown || !card ? 'down' : 'up',
    'aria-label': card ? `${RANKS[card.rank - 1]} of ${['spades', 'hearts', 'diamonds', 'clubs'][card.suit]}` : 'Face-down card',
    onClick,
  }, h('div', { class: 'inner' }, front, h('div', { class: 'face back' })));
  el.flip = (up = true) => { el.dataset.face = up ? 'up' : 'down'; };
  el.setCard = (c) => {
    const r2 = c.suit === 1 || c.suit === 2;
    el.classList.toggle('red', r2);
    front.replaceChildren(h('span', { class: 'r' }, RANKS[c.rank - 1]), h('span', { class: 's' }, SUITS[c.suit]), h('span', { class: 'r b' }, RANKS[c.rank - 1]));
    el.setAttribute('aria-label', `${RANKS[c.rank - 1]} of ${['spades', 'hearts', 'diamonds', 'clubs'][c.suit]}`);
  };
  return el;
}
