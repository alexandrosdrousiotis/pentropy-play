// Lobby furniture: a rotating hero with a live Crash slide, a ranked Top 10 row, and a live chip.
// One Crash poller is shared by every widget on the page and stops itself when they leave the DOM.
import { h, svgUse, fmt, fmtMult, fmtPct } from './ui.js';
import { CATALOG, gameById, ART, BANNERS, GAME_COLOR } from './games/index.js';
import { livePoller } from './games/live-ui.js';
import { crashMultAt } from '../shared/live.js';
import { socialBets, socialOnline, onSocial } from './social.js';

/* ---------------- shared Crash watcher ---------------- */
let watch = null;
export function crashWatch() {
  if (watch && !watch.dead) return watch;
  const subs = new Set(); let state = null, tick = 0;
  const p = livePoller('crash', (s) => { state = s; }, { fast: 700, slow: 1200 });
  const w = {
    dead: false,
    /** `fn(state, now)` every 120 ms while `el` is on the page. */
    on(fn, el) { const s = { fn, el }; subs.add(s); return () => subs.delete(s); },
  };
  const alive = () => {
    for (const s of subs) if (!s.el.isConnected) subs.delete(s);
    if (subs.size) return true;
    p.stop(); clearInterval(tick); w.dead = true; return false;
  };
  tick = setInterval(() => { if (!alive() || !state) return; const now = p.clock.now(); for (const s of subs) { try { s.fn(state, now); } catch { /* widget gone */ } } }, 120);
  watch = w; return w;
}
/** Phase, text and tone for a Crash snapshot at `now`. */
function crashRead(s, now) {
  const r = s.round;
  if (s.phase === 'betting') { const rem = (r.bettingEnds - now) / 1000; return rem > 0.05 ? { tone: 'betting', big: `${rem.toFixed(1)}s`, label: 'Next flight in', cta: 'Bet on this flight' } : { tone: 'running', big: '', label: 'Taking off…', cta: 'Watch the flight' }; }
  if (s.phase === 'running') return { tone: 'running', big: fmtMult(crashMultAt(Math.max(0, now - r.startedAt))), label: 'Flying', cta: 'Watch the flight' };
  return { tone: r.result >= 2 ? 'win' : 'bust', big: fmtMult(r.result), label: 'Crashed at', cta: 'Next round opens soon' };
}

/* ---------------- hero carousel ---------------- */
const liveDot = () => h('i', { class: 'live-dot', 'aria-hidden': 'true' });
/** The live slide: the real Crash round, counting down and flying in the hero. */
export function liveSlide() {
  const count = h('span', { class: 'tag dark' }, '…');
  const label = h('div', { class: 'eyebrow' }, liveDot(), 'Live table · Crash · ', count);
  const big = h('h1', { class: 'hero-live num' }, 'Connecting to the table…');
  const lead = h('p', { class: 'lead' }, 'Everyone bets on the same round, with one seed committed before it starts.');
  const cta = h('a', { class: 'btn primary lg', href: '#/play/crash' }, h('span', {}, 'Join the table'));
  const copy = h('div', { class: 'hero-copy' }, label, big, lead, h('div', { class: 'row' }, cta));
  let last = '';
  crashWatch().on((s, now) => {
    const r = crashRead(s, now);
    big.textContent = `${r.label} ${r.big}`; big.className = `hero-live num ${r.tone}`;
    count.textContent = `${s.bets.length} in this round`;
    cta.firstChild.textContent = r.cta; cta.classList.toggle('disabled', s.phase === 'ended');
    const hist = s.history.slice(0, 6).map((x) => fmtMult(x.result)).join(' · ');
    if (hist !== last) { last = hist; lead.textContent = hist ? `Last flights: ${hist}` : lead.textContent; }
  }, copy);
  return { key: 'live', img: h('img', { class: 'hero-img', src: 'art/crash-banner.webp', alt: '', decoding: 'async' }), copy, thumb: 'art/crash-banner.webp', label: 'Live Crash' };
}
/** Game of the day: a different painted game on top every day, picked from the calendar. */
export function gameOfDaySlide() {
  const painted = CATALOG.filter((g) => ART.has(g.id));
  const day = Math.floor(Date.now() / 864e5);
  const g = painted[day % painted.length] || CATALOG[0];
  const src = BANNERS.has(g.id) ? `art/${g.id}-banner.webp` : `art/${g.id}.webp`;
  const copy = h('div', { class: 'hero-copy' },
    h('div', { class: 'eyebrow' }, 'Game of the day'),
    h('h1', {}, g.name),
    h('p', { class: 'lead' }, `${g.blurb} RTP ${fmtPct(g.rtp, 2)} · pays up to ${g.ceiling}.`),
    h('div', { class: 'row' }, h('a', { class: 'btn primary lg', href: `#/play/${g.id}` }, h('span', {}, `Play ${g.name}`))));
  const back = h('img', { class: 'hero-img gotd-back', src, alt: '', decoding: 'async' });
  const card = h('div', { class: 'gotd-card' }, h('img', { src: `art/${g.id}.webp`, alt: '', decoding: 'async' }));
  back.style.setProperty('--c', GAME_COLOR[g.id] || '#334'); card.style.setProperty('--c', GAME_COLOR[g.id] || '#334');
  return { key: 'gotd', img: [back, card], copy, thumb: `art/${g.id}.webp`, label: g.name };
}
/** Rotating hero. Each slide is `{ key, img, copy, thumb, label }`. Thumbnails steer it on desktop, dots on phones, swipes everywhere. */
export function heroCarousel(slides, { interval = 7000 } = {}) {
  let i = 0, timer = 0, paused = false;
  const els = slides.map((s) => h('div', { class: 'slide', 'data-key': s.key }, s.img, s.copy));
  const thumbs = slides.map((s, k) => h('button', { type: 'button', 'aria-label': s.label, onClick: () => go(k, true) }, h('img', { src: s.thumb, alt: '', loading: 'lazy', decoding: 'async' })));
  const dots = slides.map((s, k) => h('button', { type: 'button', 'aria-label': s.label, onClick: () => go(k, true) }));
  const root = h('section', { class: 'hero-banner promo carousel', tabindex: '0', 'aria-roledescription': 'carousel' }, ...els, h('div', { class: 'hero-nav' }, ...thumbs), h('div', { class: 'hero-dots' }, ...dots));
  function paint() {
    els.forEach((el, k) => el.classList.toggle('on', k === i));
    thumbs.forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
    dots.forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
  }
  function go(k, manual = false) { i = (k + slides.length) % slides.length; paint(); if (manual) arm(); }
  function arm() { clearInterval(timer); timer = setInterval(() => { if (!root.isConnected) return clearInterval(timer); if (!paused && !document.hidden) go(i + 1); }, interval); }
  root.addEventListener('mouseenter', () => { paused = true; }); root.addEventListener('mouseleave', () => { paused = false; });
  root.addEventListener('focusin', () => { paused = true; }); root.addEventListener('focusout', () => { paused = false; });
  root.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') go(i + 1, true); if (e.key === 'ArrowLeft') go(i - 1, true); });
  let x0 = null;
  root.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  root.addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1), true); }, { passive: true });
  paint(); arm();
  return root;
}

/* ---------------- Top 10 in the room ---------------- */
const PRIOR = ['crash', 'mines', 'plinko', 'chicken', 'dice', 'roulette', 'limbo', 'wheel', 'tower', 'keno', 'slide', 'pump', 'hilo', 'diamonds', 'flip', 'blackjack', 'rps', 'videopoker', 'baccarat'];
function ranking() {
  const n = {}; for (const b of socialBets()) n[b.game] = (n[b.game] || 0) + 1;
  const score = (id) => (n[id] || 0) * 100 - PRIOR.indexOf(id);
  return CATALOG.map((g) => g.id).sort((a, b) => score(b) - score(a)).slice(0, 10).map(gameById).filter(Boolean);
}
/** Ranked row with the big ghosted numerals. `tile(game)` draws one card. Re-ranks once the room feed arrives. */
export function topTen(tile) {
  const row = h('div', { class: 'cards ranked' });
  const sub = h('span', { class: 't-desc' }, 'by bets in the room');
  const paint = () => row.replaceChildren(...ranking().map((g, k) => h('div', { class: 'rk' }, h('span', { class: 'rk-num', 'aria-hidden': 'true' }, String(k + 1)), tile(g))));
  paint();
  if (!socialBets().length) { const off = onSocial(() => { if (!row.isConnected) return off(); if (socialBets().length) { paint(); off(); } }); }
  const scroll = (dir) => row.scrollBy({ left: dir * row.clientWidth * 0.8, behavior: 'smooth' });
  return h('section', { class: 'grow stack section' },
    h('div', { class: 'section-head' }, h('h2', {}, 'Top 10 right now'), h('div', { class: 'head-tools' }, sub, h('div', { class: 'row-arrows' }, h('button', { type: 'button', 'aria-label': 'Scroll left', onClick: () => scroll(-1) }, svgUse('ph-caret-left')), h('button', { type: 'button', 'aria-label': 'Scroll right', onClick: () => scroll(1) }, svgUse('ph-caret-right'))))),
    row);
}

/* ---------------- live chip for the Live tables card ---------------- */
export function liveChip() {
  const text = h('span', {}, 'Crash · connecting');
  const el = h('span', { class: 'cc-live' }, liveDot(), text);
  crashWatch().on((s, now) => { const r = crashRead(s, now); text.textContent = s.phase === 'betting' ? (r.big ? `Crash · bets close in ${r.big}` : 'Crash · taking off') : s.phase === 'running' ? `Crash · ${r.big}` : `Crash · ${r.big} · ${socialOnline()} online`; el.className = `cc-live ${r.tone}`; }, el);
  return el;
}
