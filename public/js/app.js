// Shell, router and pages. Games are lazy-loaded modules in ./games/.
import { api, state, me, user, subscribe, sessionNet, sessionMinutes } from './api.js';
import { h, svgUse, button, fmt, fmtAgt, fmtSigned, fmtPct, fmtMult, fmtMoney, fmtDuration, modal, toast, numberInput, segmented } from './ui.js';
import { CATALOG, gameById } from './games/index.js';
import * as edu from './edu.js';
import { replayFloats, sha256Hex } from './verify-rng.js';
import { replayRound, canonicalOutcome } from '../shared/replay.js';
import { gameHeader } from './games/common.js';

const app = document.getElementById('app');
const side = document.getElementById('side');
const top = document.getElementById('top');
const tabbar = document.getElementById('tabbar');
const footer = document.getElementById('footer');
let activeGame = null; // { module, unmount }

/* ---------------- shell ---------------- */
const NAV = [
  ['#/', 'Home', 'i-home'], ['#/learn', 'Learn', 'i-book'], ['#/stats', 'Stats', 'i-chart'], ['#/fair', 'Fairness', 'i-shield'], ['#/account', 'Account', 'i-user'],
];
const isCurrent = (href, route) => route === href || (href !== '#/' && route.startsWith(href));
const GAME_DOT = { limbo: '#5f8bff', mines: '#8a97b3', dice: '#7b6cff', crash: '#ff6b7f', tower: '#1fd690', hilo: '#ff5c72', plinko: '#4cc3ff', keno: '#f6b73c', videopoker: '#8ef0d8', blackjack: '#f3c969' };

function renderChrome() {
  const u = user();
  const route = location.hash || '#/';
  const navItem = (href, label, icon) => h('a', { class: 'nav-item', href, 'aria-current': isCurrent(href, route) ? 'page' : null }, svgUse(icon), label);
  side.replaceChildren(
    h('a', { class: 'logo', href: '#/' }, h('span', { class: 'mark' }, svgUse('i-logo')), h('span', {}, h('b', {}, 'Pentropy Play'), h('small', {}, 'No-money casino lab'))),
    h('div', { class: 'group' }, ...NAV.map(([href, label, icon]) => navItem(href, label, icon))),
    h('div', { class: 'group-title' }, 'Games'),
    h('div', { class: 'group' }, ...CATALOG.map((g) => h('a', { class: 'nav-item', href: `#/play/${g.id}`, 'aria-current': route === `#/play/${g.id}` ? 'page' : null }, h('span', { class: 'dot', style: { background: GAME_DOT[g.id] } }), g.name, h('span', { class: 'r' }, fmtPct(g.rtp, g.rtp === 0.99 || g.rtp === 0.98 ? 0 : 2))))),
    h('div', { class: 'foot' }, h('b', {}, 'AGT has no value'), 'Tokens cannot be bought, sold or withdrawn. Every game here pays less than it takes. That is the point.'),
  );
  const crumb = (() => {
    const g = route.match(/^#\/play\/([a-z]+)$/);
    if (g) return [h('span', {}, 'Games'), h('span', {}, '/'), h('b', {}, gameById(g[1])?.name ?? '')];
    const found = NAV.find(([href]) => isCurrent(href, route));
    if (route === '#/signup') return [h('b', {}, 'Create account')];
    if (route === '#/login') return [h('b', {}, 'Log in')];
    return [h('b', {}, found ? found[1] : 'Home')];
  })();
  const sessNet = u ? sessionNet() : 0;
  top.replaceChildren(
    h('a', { class: 'logo brand-sm', href: '#/' }, h('span', { class: 'mark' }, svgUse('i-logo'))),
    h('div', { class: 'crumb' }, ...crumb),
    h('div', { class: 'spacer' }),
    u ? h('div', { class: 'row', style: { gap: '10px' } },
      h('div', { class: 'wallet', id: 'balance', title: 'Anti-gambling tokens. Imaginary. No value.' },
        h('span', { class: 'amt num' }, fmt(u.balance)), h('span', { class: 'cur' }, 'AGT'),
        h('span', { class: `delta ${sessNet > 0 ? 'up' : sessNet < 0 ? 'down' : ''}`, id: 'session-delta' }, `${fmtSigned(sessNet)} today`)),
      h('a', { class: 'avatar', href: '#/account', title: u.username }, u.username.slice(0, 2)))
      : h('div', { class: 'row', style: { gap: '8px' } }, h('a', { class: 'btn ghost sm', href: '#/login' }, h('span', {}, 'Log in')), h('a', { class: 'btn primary sm', href: '#/signup' }, h('span', {}, 'Get 1,000 AGT'))),
  );
  tabbar.replaceChildren(...NAV.map(([href, label, icon]) => h('a', { href, 'aria-current': isCurrent(href, route) ? 'page' : null }, svgUse(icon), label)));
}
function renderFooter() {
  footer.replaceChildren(
    h('p', {}, 'Pentropy Play is an educational simulator. Anti-gambling tokens (AGT) are imaginary: they cannot be bought, sold, withdrawn or exchanged for anything. Nothing here is a gambling service.'),
    h('p', {}, 'If gambling with real money is causing harm, free confidential help exists: see the “If this stopped being a game” lesson. Every outcome on this site is provably fair and still built to lose.'),
  );
}

/* ---------------- router ---------------- */
const routes = [
  [/^#\/$/, () => (user() ? lobbyPage() : landingPage())],
  [/^#\/signup$/, () => authPage('signup')],
  [/^#\/login$/, () => authPage('login')],
  [/^#\/play\/([a-z]+)$/, (id) => gamePage(id)],
  [/^#\/stats$/, statsPage],
  [/^#\/learn$/, learnPage],
  [/^#\/fair$/, fairPage],
  [/^#\/account$/, accountPage],
];
async function render() {
  if (activeGame) { try { await activeGame.unmount?.(); } catch { /* ignore */ } activeGame = null; }
  const hash = location.hash || '#/';
  const found = routes.find(([re]) => re.test(hash));
  renderChrome();
  if (!found) { location.hash = '#/'; return; }
  const needsAuth = /^#\/(play|stats|fair|account)/.test(hash);
  if (needsAuth && !user()) { app.replaceChildren(...[authPage('login', 'Sign in to continue.')].flat().filter(Boolean)); return; }
  const [re, page] = found;
  const out = await page(...hash.match(re).slice(1));
  if ((location.hash || '#/') !== hash) return; // navigated away while loading
  app.replaceChildren(...[out].flat().filter(Boolean));
  window.scrollTo({ top: 0 });
}
window.addEventListener('hashchange', render);

/* ---------------- landing ---------------- */
const tile = (v, l, d, cls = '') => h('div', { class: `tile ${cls}` }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l), d && h('div', { class: 'd' }, d));
const feature = (icon, title, text) => h('div', { class: 'feature' }, h('span', { class: 'ic' }, svgUse(icon)), h('b', {}, title), h('p', {}, text));

function landingPage() {
  const demo = demoWalletCard();
  return h('div', { class: 'stack', style: { gap: '36px' } },
    h('section', { class: 'hero-grid' },
      h('div', { class: 'hero' },
        h('div', { class: 'eyebrow' }, 'Ten casino games · zero money · full transparency'),
        h('h1', {}, 'The house edge, shown to you before every bet'),
        h('p', { class: 'lead' }, 'Sign up and receive 1,000 anti-gambling tokens. Play the exact games real sites run, at the exact same odds, and watch the edge take them back. Every round is provably fair. Every figure is converted to money. Nothing has value.'),
        h('div', { class: 'row', style: { marginTop: '6px' } }, h('a', { class: 'btn primary lg', href: '#/signup' }, h('span', {}, 'Get 1,000 AGT')), h('a', { class: 'btn secondary lg', href: '#/learn' }, h('span', {}, 'Read the lessons')))),
      demo),
    h('section', { class: 'features' },
      feature('i-chart', 'Live expected loss', 'Every bet shows what it costs on average, in tokens and in money, before you click.'),
      feature('i-shield', 'Provably fair', 'HMAC-SHA256 seeds you can rotate and replay in your browser. Fair dice, fixed edge.'),
      feature('i-lock', 'Server-side everything', 'Outcomes, balances and seeds never leave the server until a round is settled.'),
      feature('i-coin', 'Zero value, by design', 'No deposits, no cash-out, no leaderboard. Running out of tokens requires reading a lesson.')),
    gamesGrid(false));
}

function demoWalletCard() {
  return h('div', { class: 'wallet-card' },
    h('div', { class: 't-label' }, 'Example · 100 bets of 10 AGT at 99% RTP'),
    h('div', { class: 'big num' }, '1,000.00', h('small', {}, 'AGT')),
    h('div', { class: 'chips' }, h('span', { class: 'delta-chip down' }, '−10.00 expected'), h('span', { class: 'delta-chip' }, '1,000 wagered'), h('span', { class: 'delta-chip' }, '1.00% edge')),
    h('div', { class: 'mini-grid' },
      h('div', {}, h('div', { class: 'l' }, 'If 1 AGT = €1'), h('div', { class: 'v bad' }, '−€10.00')),
      h('div', {}, h('div', { class: 'l' }, 'Ceiling'), h('div', { class: 'v' }, '1,000,000x')),
      h('div', {}, h('div', { class: 'l' }, 'Odds of ceiling'), h('div', { class: 'v' }, '0.000099%'))));
}

function gamesGrid(linked = true) {
  return h('section', { class: 'stack', style: { gap: '14px' } },
    h('div', { class: 'section-head' }, h('h2', {}, 'Games'), h('span', { class: 't-desc' }, 'Ordered by how good the odds look. They all lose.')),
    h('div', { class: 'cards' }, ...CATALOG.map((g, i) => h(linked ? 'a' : 'div', { class: 'card', href: linked ? `#/play/${g.id}` : null },
      h('div', { class: `art ${g.id}` }, h('span', { class: 'n' }, String(i + 1).padStart(2, '0')), svgUse(`g-${g.id}`)),
      h('div', { class: 'body' },
        h('h4', {}, g.name),
        h('p', { class: 'sub' }, g.blurb),
        h('div', { class: 'meta' }, h('span', { class: 'tag' }, `RTP ${fmtPct(g.rtp, 2)}`), h('span', { class: 'tag hot' }, `max ${g.ceiling}`)))))));
}

/* ---------------- lobby ---------------- */
function lobbyPage() {
  const m = me();
  const s = m.stats;
  const open = m.openRound;
  const net = s.net;
  const sessNet = sessionNet();
  return h('div', { class: 'stack', style: { gap: '28px' } },
    h('section', { class: 'hero-grid' },
      h('div', { class: 'hero' },
        h('div', { class: 'eyebrow' }, `Signed in as ${m.user.username}`),
        h('h1', {}, s.bets ? `${fmt(s.wagered, 0)} AGT has passed through the house` : 'Pick a game. Watch the edge.'),
        h('p', { class: 'lead' }, s.bets
          ? `Across ${s.bets} bets the edge expected to take ${fmt(s.expectedLoss)} AGT. Your actual result is ${fmtSigned(net)} AGT. ${net > -s.expectedLoss ? 'Variance is being kind to you. It does not last.' : 'The maths is doing what it said it would.'}`
          : 'Every game shows its return-to-player, the chance your bet wins, and what it costs on average before you click. Nothing here is hidden.'),
        open && h('div', { class: 'banner' }, h('b', {}, 'Unfinished round'), h('span', {}, `An open ${gameById(open.game)?.name} round for ${fmtAgt(open.amount)} is waiting.`), h('div', { class: 'spacer' }), h('a', { class: 'btn accent sm', href: `#/play/${open.game}` }, h('span', {}, 'Resume')))),
      h('div', { class: 'wallet-card' },
        h('div', { class: 't-label' }, 'Balance'),
        h('div', { class: 'big num' }, fmt(m.user.balance), h('small', {}, 'AGT')),
        h('div', { class: 'chips' },
          h('span', { class: `delta-chip ${sessNet > 0 ? 'up' : sessNet < 0 ? 'down' : ''}` }, `${fmtSigned(sessNet)} this session`),
          h('span', { class: `delta-chip ${net > 0 ? 'up' : net < 0 ? 'down' : ''}` }, `${fmtSigned(net)} all time`),
          h('span', { class: 'delta-chip' }, `${fmtMoney(m.user.notional)} per token`)),
        h('div', { class: 'mini-grid' },
          h('div', {}, h('div', { class: 'l' }, 'Wagered'), h('div', { class: 'v' }, fmt(s.wagered, 0))),
          h('div', {}, h('div', { class: 'l' }, 'Edge predicted'), h('div', { class: 'v bad' }, '−' + fmt(s.expectedLoss))),
          h('div', {}, h('div', { class: 'l' }, 'In money'), h('div', { class: `v ${net >= 0 ? 'good' : 'bad'}` }, (net < 0 ? '−' : '') + fmtMoney(Math.abs(net) * m.user.notional)))))),
    gamesGrid(true));
}

/* ---------------- auth ---------------- */
function authPage(mode, note) {
  const isSignup = mode === 'signup';
  const userIn = h('input', { type: 'text', autocomplete: 'username', placeholder: 'username', maxlength: '20', pattern: '[A-Za-z0-9_]{3,20}', required: true, autocapitalize: 'off', spellcheck: 'false' });
  const passIn = h('input', { type: 'password', autocomplete: isSignup ? 'new-password' : 'current-password', placeholder: isSignup ? 'at least 10 characters' : 'password', minlength: isSignup ? '10' : '1', required: true });
  const err = h('p', { class: 'help bad', role: 'alert' });
  const agree = isSignup && h('label', { class: 'check-row' }, h('input', { type: 'checkbox', required: true }), h('span', {}, 'I understand the tokens are imaginary, have no value, and exist to show me how these games lose.'));
  const submit = button(isSignup ? 'Create account & get 1,000 AGT' : 'Log in', { kind: 'primary', size: 'lg block', attrs: { type: 'submit' } });
  const form = h('form', { class: 'panel auth', novalidate: false, onSubmit: async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    submit.disabled = true; err.textContent = '';
    try {
      if (isSignup) await api.signUp(userIn.value, passIn.value); else await api.logIn(userIn.value, passIn.value);
      edu.resetRealityClock();
      location.hash = '#/';
    } catch (ex) { err.textContent = ex.message; submit.disabled = false; }
  } },
    h('h2', {}, isSignup ? 'Create your account' : 'Log in'),
    note && h('p', { class: 'help warn' }, note),
    h('div', { class: 'field' }, h('label', {}, 'Username'), h('div', { class: 'input' }, userIn)),
    h('div', { class: 'field' }, h('label', {}, 'Password'), h('div', { class: 'input' }, passIn)),
    agree, err, submit,
    h('p', { class: 'help' }, isSignup ? ['Already have an account? ', h('a', { href: '#/login' }, 'Log in')] : ['New here? ', h('a', { href: '#/signup' }, 'Create an account')]),
    isSignup && h('p', { class: 'help muted' }, 'We store a username and a scrypt password hash. No email, no payment details, no tracking.'));
  return h('div', { class: 'stack', style: { gap: '24px' } },
    h('div', { class: 'hero', style: { textAlign: 'center', justifyItems: 'center', padding: '8px 0' } }, h('div', { class: 'eyebrow' }, 'Pentropy Play'), h('h1', {}, isSignup ? '1,000 tokens. Zero value.' : 'Welcome back')),
    form);
}

/* ---------------- game page ---------------- */
async function gamePage(id) {
  const meta = gameById(id);
  if (!meta) { location.hash = '#/'; return h('div'); }
  const m = me();
  const foreign = m.openRound && m.openRound.game !== id ? m.openRound : null;
  const root = h('div', { class: 'stack', style: { gap: '20px' } },
    gameHeader(meta),
    foreign && h('div', { class: 'banner' }, h('b', {}, 'Unfinished round'), h('span', {}, `Finish your ${gameById(foreign.game)?.name} round before starting another game.`), h('div', { class: 'spacer' }), h('a', { class: 'btn accent sm', href: `#/play/${foreign.game}` }, h('span', {}, 'Go there'))));
  const mountPoint = h('div');
  root.append(mountPoint);
  const mod = await meta.load();
  activeGame = mod.mount(mountPoint, meta) || {};
  return root;
}

/* ---------------- stats ---------------- */
async function statsPage() {
  const data = await api.stats();
  const m = me();
  const s = data.stats;
  const notional = m.user.notional;
  const notionalField = numberInput({ label: 'If one token were worth', value: notional, min: 0, max: 1000, step: 0.5, unit: '€', onChange: async (v) => { try { await api.updateProfile({ notional: Math.round(v * 100) / 100 }); location.hash = '#/stats'; render(); } catch (e) { toast(e.message, 'bad'); } } });
  const curve = data.curve;
  const expectedCurve = (() => {
    // expected balance: start minus cumulative expected loss, aligned to each settled round
    let exp = 1000; const out = [{ t: curve[0]?.t ?? Date.now(), b: 1000 }];
    for (const r of [...data.history].reverse()) { exp -= r.amount * (1 - r.rtp); out.push({ t: r.settledAt, b: exp }); }
    return out;
  })();
  return h('div', { class: 'stack', style: { gap: '24px' } },
    h('div', { class: 'row between' }, h('h2', { class: 'gt' }, 'Your stats'), h('span', { class: 't-desc' }, `Playing since ${new Date(m.user.createdAt).toLocaleDateString()}`)),
    h('div', { class: 'stat-grid' },
      tile(fmt(m.user.balance), 'Balance', 'AGT'),
      tile(fmt(s.wagered), 'Total wagered', `${s.bets} bets`),
      tile(fmtSigned(s.net), 'Net result', 'returned − wagered', s.net >= 0 ? 'good' : 'bad'),
      tile('−' + fmt(s.expectedLoss), 'Expected by the edge', 'Σ stake × (1 − RTP)'),
      tile(s.wagered ? fmtPct(s.returned / s.wagered, 2) : '—', 'Your realised RTP', 'returned ÷ wagered'),
      tile(fmtSigned(s.biggestWin), 'Biggest single win', 'net of stake', 'good'),
      tile('−' + fmt(s.biggestLoss), 'Biggest single loss', 'one bet', 'bad'),
      tile(fmtDuration(s.playMs), 'Time signed in', 'all sessions'),
      tile(String(m.user.refills), 'Times bankrupt', 'refilled after a lesson')),
    h('section', { class: 'plate' },
      h('div', { class: 'row between' }, h('h3', {}, 'Balance over time, against what the edge predicted'), h('span', { class: 't-desc' }, data.history.length >= 100 ? 'expected line uses the last 100 rounds' : '')),
      balanceChart(curve, expectedCurve)),
    h('section', { class: 'plate' },
      h('h3', {}, 'In money'),
      h('div', { class: 'two' },
        notionalField,
        h('div', { class: 'reality' },
          tile(fmtMoney(s.wagered * notional), 'Turned over', 'total wagered'),
          tile((s.net < 0 ? '−' : '') + fmtMoney(Math.abs(s.net) * notional), s.net < 0 ? 'Lost' : 'Won', 'net result', s.net >= 0 ? 'good' : 'bad'),
          tile('−' + fmtMoney(s.expectedLoss * notional), 'Edge predicted', 'the price of playing'))),
      h('p', { class: 'help' }, 'Real sites show tokens, chips, multipliers, anything except money. This converts every number back, so the abstraction stops working.')),
    h('section', { class: 'plate' },
      h('h3', {}, 'By game'),
      data.byGame.length ? h('table', { class: 'data' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Game'), h('th', {}, 'Bets'), h('th', {}, 'Wagered'), h('th', {}, 'Returned'), h('th', {}, 'Net'), h('th', {}, 'Realised RTP'), h('th', {}, 'Best hit'))),
        h('tbody', {}, ...data.byGame.sort((a, b) => b.wagered - a.wagered).map((g) => h('tr', {},
          h('td', {}, gameById(g.game)?.name ?? g.game), h('td', {}, g.bets), h('td', {}, fmt(g.wagered)), h('td', {}, fmt(g.returned)),
          h('td', { class: g.returned - g.wagered >= 0 ? 'good' : 'bad' }, fmtSigned(g.returned - g.wagered)), h('td', {}, fmtPct(g.returned / g.wagered, 2)), h('td', {}, fmtMult(g.best || 0))))))
        : h('p', { class: 'help' }, 'No bets yet.')),
    h('section', { class: 'plate' },
      h('h3', {}, 'Recent rounds'),
      data.history.length ? h('table', { class: 'data' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Game'), h('th', {}, 'Stake'), h('th', {}, 'Result'), h('th', {}, 'Net'), h('th', {}, 'Nonce'))),
        h('tbody', {}, ...data.history.slice(0, 40).map((r) => h('tr', {}, h('td', {}, gameById(r.game)?.name), h('td', {}, fmt(r.amount)), h('td', {}, fmtMult(r.multiplier)), h('td', { class: r.net >= 0 ? 'good' : 'bad' }, fmtSigned(r.net)), h('td', { class: 'mono' }, r.nonce)))))
        : h('p', { class: 'help' }, 'Nothing yet.'),
      h('p', { class: 'help' }, 'Verify any of these on the ', h('a', { href: '#/fair' }, 'fairness page'), '.')));
}

function balanceChart(actual, expected) {
  const W = 720, H = 220, px = 44, py = 16;
  const all = [...actual, ...expected];
  if (all.length < 2) return h('p', { class: 'help' }, 'Place a few bets and the curve appears here.');
  const t0 = Math.min(...all.map((p) => p.t)), t1 = Math.max(...all.map((p) => p.t)) || t0 + 1;
  const rawMax = Math.max(...all.map((p) => p.b)) * 1.05 || 1;
  const step = 10 ** Math.floor(Math.log10(rawMax)) / 2;
  const bMin = Math.min(0, ...all.map((p) => p.b)), bMax = Math.ceil(rawMax / step) * step;
  const x = (t) => px + ((t - t0) / Math.max(1, t1 - t0)) * (W - px - 8);
  const y = (b) => py + (1 - (b - bMin) / (bMax - bMin)) * (H - py - 20);
  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.b).toFixed(1)}`).join(' ');
  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, text) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Balance over time compared with the expected balance' });
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const b = bMin + ((bMax - bMin) * i) / ticks;
    svg.append(el('line', { x1: px, x2: W - 8, y1: y(b), y2: y(b), stroke: 'rgba(255,255,255,.08)', 'stroke-width': 1 }));
    svg.append(el('text', { x: px - 6, y: y(b) + 4, 'text-anchor': 'end', fill: 'rgba(255,255,255,.4)', 'font-size': 10, 'font-family': 'JetBrains Mono, monospace' }, fmt(b, 0)));
  }
  svg.append(el('path', { d: path(expected), fill: 'none', stroke: 'rgba(255,255,255,.45)', 'stroke-width': 2, 'stroke-dasharray': '6 5', 'stroke-linejoin': 'round' }));
  svg.append(el('path', { d: path(actual), fill: 'none', stroke: '#7b6cff', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  for (const p of actual.filter((q) => q.refill)) svg.append(el('circle', { cx: x(p.t), cy: y(p.b), r: 4, fill: '#f3c969', stroke: '#0c1017', 'stroke-width': 2 }));
  const last = actual[actual.length - 1];
  svg.append(el('circle', { cx: x(last.t), cy: y(last.b), r: 4, fill: '#7b6cff', stroke: '#0c1017', 'stroke-width': 2 }));
  svg.append(el('text', { x: Math.min(x(last.t) + 8, W - 60), y: y(last.b) - 8, fill: '#fff', 'font-size': 11, 'font-weight': 700, 'font-style': 'italic' }, `Actual ${fmt(last.b, 0)}`));
  const le = expected[expected.length - 1];
  svg.append(el('text', { x: Math.min(x(le.t) + 8, W - 70), y: y(le.b) + 14, fill: 'rgba(255,255,255,.6)', 'font-size': 11, 'font-weight': 700, 'font-style': 'italic' }, `Expected ${fmt(le.b, 0)}`));
  const tip = h('div', { class: 'tip' });
  const wrap = h('div', { class: 'chart' },
    h('div', { class: 'legend' }, h('span', {}, h('i', { style: { background: '#7b6cff' } }), 'Actual balance'), h('span', {}, h('i', { style: { background: 'rgba(255,255,255,.45)', height: '0', borderTop: '2px dashed rgba(255,255,255,.6)' } }), 'Expected balance'), h('span', {}, h('i', { style: { background: '#f3c969', width: '8px', height: '8px', borderRadius: '50%' } }), 'Refill')),
    svg, tip);
  svg.addEventListener('mousemove', (e) => {
    const rect = svg.getBoundingClientRect();
    const t = t0 + ((e.clientX - rect.left) / rect.width * W - px) / (W - px - 8) * (t1 - t0);
    const near = actual.reduce((a, p) => (Math.abs(p.t - t) < Math.abs(a.t - t) ? p : a), actual[0]);
    const exp = expected.reduce((a, p) => (Math.abs(p.t - t) < Math.abs(a.t - t) ? p : a), expected[0]);
    tip.style.display = 'block'; tip.style.left = `${Math.min(e.clientX - rect.left + 12, rect.width - 160)}px`; tip.style.top = `${e.clientY - rect.top - 10}px`;
    tip.replaceChildren(...[h('div', {}, new Date(near.t).toLocaleTimeString()), h('div', {}, `Actual ${fmt(near.b)}`), h('div', { class: 'muted' }, `Expected ${fmt(exp.b)}`)].flat().filter(Boolean));
  });
  svg.addEventListener('mouseleave', () => (tip.style.display = 'none'));
  return wrap;
}

/* ---------------- learn ---------------- */
function learnPage() {
  const m = me();
  const read = m?.user.lessonsRead ?? [];
  const done = edu.LESSONS.filter((l) => read.includes(l.id)).length;
  return h('div', { class: 'stack', style: { gap: '24px' } },
    h('div', { class: 'row between' }, h('h2', { class: 'gt' }, 'Lessons'), h('span', { class: 't-desc' }, m ? `${done} of ${edu.LESSONS.length} read` : 'Sign in to track progress')),
    m && h('div', { class: 'progress' }, h('i', { style: { width: `${(done / edu.LESSONS.length) * 100}%` } })),
    h('p', { class: 'lead' }, 'Short, specific, and about the games you just played. Lessons unlock as you place bets, because the point lands harder once you have felt it.'),
    h('div', { class: 'cards' }, ...edu.LESSONS.map((l) => {
      const unlocked = !m || edu.lessonUnlocked(l, m);
      const isRead = read.includes(l.id);
      return h('div', { class: `card lesson${unlocked ? '' : ' locked'}` },
        h('div', { class: 'row between' }, h('h4', {}, l.title), isRead ? h('span', { class: 'tag green' }, 'read') : unlocked ? h('span', { class: 'tag' }, 'new') : h('span', { class: 'tag' }, `after ${l.unlock} bets`)),
        h('p', { class: 'sub' }, l.summary),
        h('div', {}, button(unlocked ? 'Read' : 'Locked', { kind: unlocked ? (isRead ? 'tertiary' : 'accent') : 'dimmed', size: 'sm', disabled: !unlocked, onClick: async () => { await edu.openLesson(l); render(); } })));
    })));
}

/* ---------------- fairness ---------------- */
async function fairPage() {
  const [seeds, rounds] = await Promise.all([api.seeds(), api.rounds(100)]);
  const clientIn = h('input', { type: 'text', value: seeds.current.clientSeed, maxlength: '64', pattern: '[A-Za-z0-9_-]+', spellcheck: 'false' });
  const result = h('div', { class: 'stack' });
  const revealedMap = new Map(seeds.revealed.map((r) => [r.serverSeedHash, r]));
  const verifiable = rounds.rounds.filter((r) => revealedMap.has(r.serverSeedHash));
  async function verify(r) {
    const rev = revealedMap.get(r.serverSeedHash);
    const hashOk = (await sha256Hex(rev.serverSeed)) === r.serverSeedHash;
    const floats = await replayFloats(rev.serverSeed, r.clientSeed, r.nonce, r.floatsUsed);
    const recomputed = replayRound(r.game, floats, r.params, r.outcome);
    const recorded = canonicalOutcome(r.game, r.outcome);
    const match = JSON.stringify(recomputed) === JSON.stringify(recorded);
    result.replaceChildren(
      h('div', { class: 'row' }, h('span', { class: `tag ${hashOk ? 'green' : 'red'}` }, hashOk ? 'seed hash matches' : 'seed hash mismatch'), h('span', { class: `tag ${match ? 'green' : 'red'}` }, match ? 'outcome reproduced' : 'outcome differs')),
      h('div', { class: 'code' }, `game        ${r.game}  nonce ${r.nonce}\nserver seed ${rev.serverSeed}\nsha256      ${r.serverSeedHash}\nclient seed ${r.clientSeed}\nfloats      ${floats.slice(0, 8).map((f) => f.toFixed(8)).join(' ')}${floats.length > 8 ? ' …' : ''}\nparams      ${JSON.stringify(r.params)}\nrecomputed  ${JSON.stringify(recomputed)}\nrecorded    ${JSON.stringify(recorded)}\nresult      ${fmtMult(r.multiplier)} on ${fmt(r.amount)} AGT`));
  }
  return h('div', { class: 'stack', style: { gap: '24px' } },
    h('h2', { class: 'gt' }, 'Provably fair'),
    h('p', { class: 'lead' }, 'Each round is derived from HMAC-SHA256(server seed, "client seed : nonce : cursor"). You see the hash of the server seed before you play and the seed itself after you rotate. Fair randomness, fixed edge: this page proves the first and the stats page shows the second.'),
    h('div', { class: 'two' },
      h('div', { class: 'panel' },
        h('h3', {}, 'Active seed pair'),
        h('div', { class: 'kv' }, h('span', {}, 'Server seed (hashed)'), h('b', { class: 'mono', style: { fontSize: '11px', wordBreak: 'break-all' } }, seeds.current.serverSeedHash)),
        h('div', { class: 'kv' }, h('span', {}, 'Bets on this pair'), h('b', {}, seeds.current.nonce)),
        h('div', { class: 'field' }, h('label', {}, 'Client seed (yours to change)'), h('div', { class: 'input' }, clientIn)),
        button('Rotate seeds & reveal the current server seed', { kind: 'accent', onClick: async () => {
          try { await api.rotateSeeds(clientIn.value.trim() || undefined); toast('Rotated. The previous server seed is now revealed below.', 'good'); render(); }
          catch (e) { toast(e.message, 'bad'); }
        } }),
        h('p', { class: 'help' }, 'Rotating is only possible between rounds. The revealed seed lets you check every bet made with it.')),
      h('div', { class: 'panel' },
        h('h3', {}, 'Verify a round'),
        verifiable.length ? h('div', { class: 'stack' },
          h('div', { class: 'input' }, (() => {
            const sel = h('select', {}, ...verifiable.map((r) => h('option', { value: String(r.id) }, `#${r.id} ${gameById(r.game)?.name} · ${fmtMult(r.multiplier)} · nonce ${r.nonce}`)));
            sel.addEventListener('change', () => verify(verifiable.find((r) => String(r.id) === sel.value)));
            queueMicrotask(() => verify(verifiable[0]));
            return sel;
          })()),
          result)
          : h('p', { class: 'help' }, seeds.revealed.length ? 'No rounds on a revealed seed in your recent history.' : 'Place some bets, then rotate the seeds. Rounds played on the revealed seed become verifiable here.'))),
    seeds.revealed.length ? h('section', { class: 'plate' },
      h('h3', {}, 'Revealed server seeds'),
      h('table', { class: 'data' }, h('thead', {}, h('tr', {}, h('th', {}, 'Revealed'), h('th', {}, 'Server seed'), h('th', {}, 'Client seed'), h('th', {}, 'Bets'))),
        h('tbody', {}, ...seeds.revealed.map((r) => h('tr', {}, h('td', {}, new Date(r.revealedAt).toLocaleString()), h('td', { class: 'mono', style: { fontSize: '11px', wordBreak: 'break-all', textAlign: 'left' } }, r.serverSeed), h('td', { class: 'mono' }, r.clientSeed), h('td', {}, r.nonces)))))) : null,
    h('section', { class: 'plate' },
      h('h3', {}, 'How each game reads the floats'),
      h('div', { class: 'code' }, `float      = b0/256 + b1/256² + b2/256³ + b3/256⁴ from HMAC-SHA256(serverSeed, clientSeed:nonce:cursor)
limbo      point = max(1, floor(0.99 / (1 − f) · 100) / 100), capped at 1,000,000    (P(point ≥ t) = 0.99 / t)
crash      same point; multiplier = floor(e^(0.12·seconds) · 100) / 100 on the server clock
dice       roll = floor(f · 10000) / 100, 10,000 equally likely outcomes; win chance p pays 99 / p
mines      partial Fisher–Yates over 25 tiles using one float per mine
tower      one float per egg per row, 9 rows
hilo       card = floor(f · 52) → rank = i mod 13 + 1, suit = i div 13 (infinite deck)
plinko     one float per row: < 0.5 left, ≥ 0.5 right; bin = number of rights
keno       partial Fisher–Yates over 40 numbers, 10 draws
videopoker 5 floats deal from a 52-card deck, then one float per discarded card from the remaining deck
blackjack  one float per card from an infinite shoe, dealt player, dealer, player, dealer, then as requested`)));
}

/* ---------------- account & limits ---------------- */
function accountPage() {
  const m = me();
  const l = m.user.limits;
  const loss = numberInput({ label: 'Loss limit per session (0 = off)', value: l.lossLimit, min: 0, max: 1000000, step: 10, unit: 'AGT', onChange: () => {} });
  const mins = numberInput({ label: 'Session time limit in minutes (0 = off)', value: l.sessionMinutes, min: 0, max: 1440, step: 5, unit: 'min', onChange: () => {} });
  const every = numberInput({ label: 'Reality check every N bets', value: l.realityEvery, min: 5, max: 500, step: 5, unit: 'bets', onChange: () => {} });
  const saveLimits = button('Save limits', { kind: 'primary', onClick: async () => {
    try {
      await api.updateProfile({ limits: { lossLimit: Number(loss.input.value), sessionMinutes: Math.round(Number(mins.input.value)), realityEvery: Math.round(Number(every.input.value)) } });
      toast('Limits saved. The server enforces them.', 'good');
    } catch (e) { toast(e.message, 'bad'); }
  } });
  return h('div', { class: 'stack', style: { gap: '24px' } },
    h('div', { class: 'row between' }, h('h2', { class: 'gt' }, m.user.username), button('Log out', { kind: 'tertiary', size: 'sm', onClick: async () => { await api.logOut(); location.hash = '#/'; } })),
    h('div', { class: 'two' },
      h('div', { class: 'panel' },
        h('h3', {}, 'Limits you set for yourself'),
        h('p', { class: 'help' }, `This session: ${fmtSigned(sessionNet())} AGT over ${Math.round(sessionMinutes())} minutes. Limits apply per login session and are checked by the server on every bet.`),
        loss, mins, every, saveLimits),
      h('div', { class: 'panel' },
        h('h3', {}, 'Account'),
        h('div', { class: 'kv' }, h('span', {}, 'Created'), h('b', {}, new Date(m.user.createdAt).toLocaleDateString())),
        h('div', { class: 'kv' }, h('span', {}, 'Balance'), h('b', {}, fmtAgt(m.user.balance))),
        h('div', { class: 'kv' }, h('span', {}, 'Refills'), h('b', {}, m.user.refills)),
        h('div', { class: 'kv' }, h('span', {}, 'Lessons read'), h('b', {}, `${m.user.lessonsRead.length} / ${edu.LESSONS.length}`)),
        h('p', { class: 'help' }, 'We hold a username, a password hash, your seeds and your bet history. Nothing else. Deleting the account removes all of it immediately.'),
        button('Delete account', { kind: 'danger', size: 'sm', onClick: async () => {
          const pass = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'password' });
          const ok = await modal({ title: 'Delete this account?', body: h('div', { class: 'stack' }, h('p', { class: 't-body' }, 'All history, seeds and tokens are erased. This cannot be undone.'), h('div', { class: 'input' }, pass)), actions: [{ label: 'Delete', kind: 'danger', value: 'yes' }, { label: 'Cancel', kind: 'tertiary', value: 'no' }] });
          if (ok !== 'yes') return;
          try { await api.deleteAccount(pass.value); toast('Account deleted.'); location.hash = '#/'; } catch (e) { toast(e.message, 'bad'); }
        } }))));
}

/* ---------------- boot ---------------- */
subscribe((type, payload) => {
  if (type === 'balance') {
    const el = document.getElementById('balance');
    if (el && user()) {
      el.querySelector('.amt').textContent = fmt(user().balance);
      const d = document.getElementById('session-delta'); const n = sessionNet();
      if (d) { d.textContent = `${fmtSigned(n)} today`; d.className = `delta ${n > 0 ? 'up' : n < 0 ? 'down' : ''}`; }
      el.classList.remove('flash-up', 'flash-down'); void el.offsetWidth;
      if (payload?.delta > 0) el.classList.add('flash-up'); else if (payload?.delta < 0) el.classList.add('flash-down');
    }
  }
  if (type === 'auth') { edu.resetRealityClock(); render(); }
});
edu.install();
renderFooter();
await api.boot();
await render();
