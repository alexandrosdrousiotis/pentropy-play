// Shell, router and pages. Games are lazy-loaded modules in ./games/.
import { api, state, me, user, subscribe, sessionNet, sessionMinutes } from './api.js';
import { h, svgUse, button, fmt, fmtAgt, fmtSigned, fmtPct, fmtMult, fmtMoney, fmtDuration, modal, toast, numberInput, segmented } from './ui.js';
import { CATALOG, CATEGORIES, GAME_COLOR, ART, BANNERS, gameById } from './games/index.js';
import * as edu from './edu.js';
import { replayFloats, sha256Hex } from './verify-rng.js';
import { replayRound, canonicalOutcome } from '../shared/replay.js';
import { gameHeader, gameIcon } from './games/common.js';
import { countTo, sound } from './fx.js';
import { openWallet } from './wallet.js';

const app = document.getElementById('app');
const side = document.getElementById('side');
const top = document.getElementById('top');
const tabbar = document.getElementById('tabbar');
const footer = document.getElementById('footer');
let activeGame = null; // { module, unmount }

/* ---------------- shell ---------------- */
const NAV = [
  ['#/', 'Home', 'ph-house'], ['#/learn', 'Learn', 'ph-book-open'], ['#/stats', 'Stats', 'ph-chart-bar'], ['#/fair', 'Fairness', 'ph-shield-check'], ['#/account', 'Account', 'ph-user'],
];
const isCurrent = (href, route) => route === href || (href !== '#/' && route.startsWith(href));
const GAME_DOT = GAME_COLOR;

function renderChrome() {
  const u = user();
  const route = location.hash || '#/';
  const navItem = (href, label, icon) => h('a', { class: 'nav-item', href, 'aria-current': isCurrent(href, route) ? 'page' : null }, svgUse(icon), label);
  side.replaceChildren(
    h('a', { class: 'logo', href: '#/' }, h('span', { class: 'mark' }, svgUse('ph-lightning')), h('span', {}, h('b', {}, 'Pentropy'), h('small', {}, 'Play money casino'))),
    h('div', { class: 'group' }, ...NAV.map(([href, label, icon]) => navItem(href, label, icon))),
    ...CATEGORIES.map((cat) => h('div', { class: 'group' }, h('div', { class: 'group-title' }, cat.label), ...CATALOG.filter((g) => g.cat === cat.id).map((g) => h('a', { class: 'nav-item', href: `#/play/${g.id}`, 'aria-current': route === `#/play/${g.id}` ? 'page' : null }, h('span', { class: 'dot', style: { background: GAME_DOT[g.id] } }), g.name, h('span', { class: 'r' }, fmtPct(g.rtp, g.rtp === 0.99 || g.rtp === 0.98 ? 0 : 2)))))),
    h('div', { class: 'foot' }, svgUse('ph-info'), 'Tokens have no cash value'),
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
    h('a', { class: 'logo brand-sm', href: '#/' }, h('span', { class: 'mark' }, svgUse('ph-lightning'))),
    h('div', { class: 'crumb' }, ...crumb),
    h('div', { class: 'spacer' }),
    u ? h('div', { class: 'row', style: { gap: '10px' } },
      h('div', { class: 'wallet', id: 'balance', title: 'Play money. No cash value.', role: 'button', tabindex: '0', onClick: (e) => { if (!e.target.closest('.go')) openWallet('deposit'); } },
        svgUse('ph-coins', 'ic'), h('span', { class: 'amt num' }, fmt(u.balance)),
        h('span', { class: `delta ${sessNet > 0 ? 'up' : sessNet < 0 ? 'down' : ''}`, id: 'session-delta' }, fmtSigned(sessNet)),
        h('button', { type: 'button', class: 'go', onClick: () => openWallet('deposit') }, 'Wallet')),
      soundToggle(),
      h('a', { class: 'avatar', href: '#/account', title: u.username }, u.username.slice(0, 2)))
      : h('div', { class: 'row', style: { gap: '8px' } }, h('a', { class: 'btn ghost sm', href: '#/login' }, h('span', {}, 'Log in')), h('a', { class: 'btn primary sm', href: '#/signup' }, h('span', {}, 'Sign up'))),
  );
  tabbar.hidden = !u;
  tabbar.replaceChildren(...NAV.map(([href, label, icon]) => h('a', { href, 'aria-current': isCurrent(href, route) ? 'page' : null }, svgUse(icon), label)));
}
function soundToggle() {
  const b = h('button', { type: 'button', class: 'sound-toggle', 'aria-pressed': String(sound.enabled), title: 'Sound', 'aria-label': 'Toggle sound' });
  const paint = () => { b.setAttribute('aria-pressed', String(sound.enabled)); b.replaceChildren(svgUse(sound.enabled ? 'ph-speaker-high' : 'ph-speaker-slash')); };
  b.addEventListener('click', () => { sound.enabled = !sound.enabled; paint(); if (sound.enabled) sound.play('click'); });
  paint();
  return b;
}
function renderFooter() {
  footer.replaceChildren(
    h('p', {}, 'Pentropy is a play-money simulator. Tokens have no cash value and cannot be bought, sold or withdrawn. If gambling is causing you harm, see ', h('a', { href: '#/learn' }, 'Get help'), '.'),
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

function landingPage() {
  const rowsOf = (cat) => CATALOG.filter((g) => g.cat === cat.id);
  const tileRow = (title, games) => {
    const cards = h('div', { class: 'cards' }, ...games.map((g) => gameTile(g, false, '#/signup')));
    return h('section', { class: 'grow stack', style: { gap: '10px' } }, h('div', { class: 'section-head' }, h('h2', {}, title), h('span', { class: 't-desc' }, `${games.length} games`)), cards);
  };
  return h('div', { class: 'stack landing', style: { gap: '28px' } },
    h('section', { class: 'hero-banner' },
      h('img', { class: 'hero-img', src: 'art/roulette-banner.webp', alt: '', decoding: 'async', fetchpriority: 'high' }),
      h('div', { class: 'hero-copy' },
        h('div', { class: 'eyebrow' }, '19 games · play money · real odds'),
        h('h1', {}, 'The casino, with the price tag showing'),
        h('p', { class: 'lead' }, '1,000 free tokens. The same games and the same odds as the real sites, with the cost of every bet shown before you place it.'),
        h('div', { class: 'row' }, h('a', { class: 'btn primary lg', href: '#/signup' }, h('span', {}, 'Play free')), h('a', { class: 'btn white lg', href: '#/learn' }, h('span', {}, 'How it works'))))),
    h('div', { class: 'reality' },
      tile('99%', 'Return to player', 'same as the real thing'),
      tile('−€1', 'Per 100 AGT wagered', 'shown before every bet'),
      tile('Fair', 'Every round', 'verify in your browser'),
      tile('€0', 'Token value', 'ever')),
    tileRow('Originals', rowsOf(CATEGORIES[0])),
    tileRow('Streak games', rowsOf(CATEGORIES[1])),
    tileRow('Table games', rowsOf(CATEGORIES[2])),
    h('section', { class: 'cta-card' },
      h('div', {}, h('h2', {}, 'Start with 1,000 AGT'), h('p', { class: 'help' }, 'No email. No card. Nothing to withdraw, because nothing is worth anything.')),
      h('a', { class: 'btn primary lg', href: '#/signup' }, h('span', {}, 'Create account'))));
}

/** Game tile: artwork image when public/art/<id>.webp is listed in ART, otherwise the flat colour field with the icon. */
function gameTile(g, linked, href = null) {
  const art = h('div', { class: `art ${g.id}`, style: { background: GAME_COLOR[g.id] } }, svgUse(gameIcon(g.id)));
  if (ART.has(g.id)) {
    const img = h('img', { src: `art/${g.id}.webp`, alt: '', loading: 'lazy', decoding: 'async' });
    img.addEventListener('load', () => art.classList.add('has-img'));
    img.addEventListener('error', () => img.remove());
    art.append(img);
  }
  art.append(h('span', { class: 'rtp-chip' }, fmtPct(g.rtp, g.rtp === 0.99 || g.rtp === 0.98 ? 0 : 2)), h('div', { class: 'name' }, g.name));
  return h(linked || href ? 'a' : 'div', { class: 'card', href: href || (linked ? `#/play/${g.id}` : null) }, art);
}
/** A horizontally scrolling row with arrow buttons. */
function gameRow(title, games, linked, sub) {
  if (!games.length) return null;
  const cards = h('div', { class: 'cards' }, ...games.map((g) => gameTile(g, linked)));
  const scroll = (dir) => cards.scrollBy({ left: dir * cards.clientWidth * 0.8, behavior: 'smooth' });
  return h('section', { class: 'grow stack', style: { gap: '10px' } },
    h('div', { class: 'section-head' }, h('h2', {}, title), h('div', { class: 'row', style: { gap: '10px' } }, sub && h('span', { class: 't-desc' }, sub), h('div', { class: 'row-arrows' }, h('button', { type: 'button', 'aria-label': 'Scroll left', onClick: () => scroll(-1) }, svgUse('ph-caret-left')), h('button', { type: 'button', 'aria-label': 'Scroll right', onClick: () => scroll(1) }, svgUse('ph-caret-right'))))),
    cards);
}
const FEATURED = [
  { id: 'roulette', title: 'Roulette', text: 'European single zero. Every bet pays 36 to 37.' },
  { id: 'chicken', title: 'Chicken', text: 'New. Cross 25 lanes of traffic. Cash out any time.' },
  { id: 'crash', title: 'Crash', text: 'Up to 1,000,000x if you hold your nerve.' },
];
function featured(linked) {
  return h('div', { class: 'islands' }, ...FEATURED.map((f, i) => {
    const g = gameById(f.id);
    const hasBanner = BANNERS.has(f.id);
    return h(linked ? 'a' : 'div', { class: `island${hasBanner ? ' has-img' : ''}${i === 0 ? ' lead' : ''}`, href: linked ? `#/play/${f.id}` : '#/signup', style: { background: GAME_COLOR[f.id] } },
      hasBanner ? h('img', { class: 'island-img', src: `art/${f.id}-banner.webp`, alt: '', decoding: 'async' }) : h('div', { class: 'island-art' }, svgUse(gameIcon(f.id))),
      h('div', { class: 'island-body' }, h('div', { class: 'island-kicker' }, `${fmtPct(g.rtp, 2)} RTP · max ${g.ceiling}`), h('h3', {}, f.title), h('p', {}, f.text), h('span', { class: 'btn white sm' }, h('span', {}, 'Play'))));
  }));
}
const TRENDING = ['crash', 'mines', 'plinko', 'chicken', 'dice', 'roulette', 'limbo', 'wheel'];
/** Search + category chips + rows + full grid. `recent` is a list of game ids from the player's history. */
function gamesBoard(linked = true, recent = []) {
  let query = '', cat = 'all';
  const input = h('input', { type: 'search', placeholder: 'Search games', 'aria-label': 'Search games', autocomplete: 'off' });
  const chips = h('div', { class: 'chips' });
  const rows = h('div', { class: 'stack', style: { gap: '24px' } });
  const paintChips = () => chips.replaceChildren(...[{ id: 'all', label: 'All', icon: 'ph-squares-four' }, ...CATEGORIES.map((c) => ({ id: c.id, label: c.label, icon: c.id === 'table' ? 'ph-spade' : c.id === 'chains' ? 'ph-lightning' : 'ph-sparkle' }))].map((c) => h('button', { type: 'button', 'aria-pressed': String(cat === c.id), onClick: () => { cat = c.id; paintChips(); paint(); } }, svgUse(c.icon), c.label)));
  const paint = () => {
    const q = query.trim().toLowerCase();
    const filtered = CATALOG.filter((g) => (cat === 'all' || g.cat === cat) && (!q || g.name.toLowerCase().includes(q) || g.blurb.toLowerCase().includes(q)));
    if (q || cat !== 'all') {
      rows.replaceChildren(h('section', { class: 'all-games stack', style: { gap: '10px' } }, h('div', { class: 'section-head' }, h('h2', {}, q ? `Results for “${query.trim()}”` : CATEGORIES.find((c) => c.id === cat)?.label), h('span', { class: 't-desc' }, `${filtered.length} games`)),
        filtered.length ? h('div', { class: 'cards' }, ...filtered.map((g) => gameTile(g, linked))) : h('p', { class: 'help' }, 'No games match.')));
      return;
    }
    rows.replaceChildren(...[
      featured(linked),
      gameRow('Trending', TRENDING.map(gameById), linked, 'most played'),
      recent.length ? gameRow('Recently played', recent.map(gameById).filter(Boolean), linked) : null,
      ...CATEGORIES.map((c) => gameRow(c.label, CATALOG.filter((g) => g.cat === c.id), linked, `${CATALOG.filter((g) => g.cat === c.id).length} games`)),
      h('section', { class: 'all-games stack', style: { gap: '10px' } }, h('div', { class: 'section-head' }, h('h2', {}, 'All games'), h('span', { class: 't-desc' }, `${CATALOG.length} games`)), h('div', { class: 'cards' }, ...CATALOG.map((g) => gameTile(g, linked)))),
    ].filter(Boolean));
  };
  input.addEventListener('input', () => { query = input.value; paint(); });
  paintChips(); paint();
  return h('div', { class: 'stack', style: { gap: '18px' } }, h('div', { class: 'lobby-top' }, h('label', { class: 'search' }, svgUse('ph-search'), input), chips), rows);
}
function gamesGrid(linked = true, recent = []) { return gamesBoard(linked, recent); }

/* ---------------- lobby ---------------- */
async function lobbyPage() {
  const m = me();
  const s = m.stats;
  const open = m.openRound;
  const net = s.net;
  const sessNet = sessionNet();
  let recent = [];
  try { const r = await api.rounds(60); recent = [...new Set(r.rounds.map((x) => x.game))].slice(0, 8); } catch { /* fine */ }
  const stat = (l, v, cls = '') => h('div', { class: 'stat' }, h('span', { class: 'l' }, l), h('span', { class: `v ${cls}` }, v));
  return h('div', { class: 'stack', style: { gap: '20px' } },
    h('div', { class: 'balance-row' },
      h('div', { class: 'big num' }, fmt(m.user.balance), h('small', {}, 'AGT')),
      h('div', { class: 'sep' }),
      stat('Session', fmtSigned(sessNet), sessNet > 0 ? 'good' : sessNet < 0 ? 'bad' : ''),
      stat('All time', fmtSigned(net), net > 0 ? 'good' : net < 0 ? 'bad' : ''),
      stat('Deposited', fmt(m.user.deposited ?? 0, 0)),
      stat('Vault', fmt(m.user.vault ?? 0, 0)),
      stat('Edge taken', '−' + fmt(s.expectedLoss), 'bad'),
      h('div', { class: 'spacer' }),
      button('Deposit', { kind: 'primary', size: 'sm', onClick: () => openWallet('deposit') }),
      button('Withdraw', { kind: 'tertiary', size: 'sm', onClick: () => openWallet('withdraw') })),
    open && h('div', { class: 'banner' }, h('b', {}, 'Round in progress'), h('span', {}, `${gameById(open.game)?.name} · ${fmtAgt(open.amount)}`), h('div', { class: 'spacer' }), h('a', { class: 'btn accent sm', href: `#/play/${open.game}` }, h('span', {}, 'Resume'))),
    gamesBoard(true, recent));
}

/* ---------------- auth ---------------- */
function authPage(mode, note) {
  const isSignup = mode === 'signup';
  const userIn = h('input', { type: 'text', autocomplete: 'username', placeholder: 'username', maxlength: '20', pattern: '[A-Za-z0-9_]{3,20}', required: true, autocapitalize: 'off', spellcheck: 'false' });
  const passIn = h('input', { type: 'password', autocomplete: isSignup ? 'new-password' : 'current-password', placeholder: isSignup ? 'at least 10 characters' : 'password', minlength: isSignup ? '10' : '1', required: true });
  const err = h('p', { class: 'help bad', role: 'alert' });
  const agree = isSignup && h('label', { class: 'check-row' }, h('input', { type: 'checkbox', required: true }), h('span', {}, 'I understand the tokens are play money with no cash value.'));
  const submit = button(isSignup ? 'Sign up' : 'Log in', { kind: 'primary', size: 'lg block', attrs: { type: 'submit' } });
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
    note && h('p', { class: 'help warn' }, note),
    h('div', { class: 'field' }, h('label', {}, 'Username'), h('div', { class: 'input' }, userIn)),
    h('div', { class: 'field' }, h('label', {}, 'Password'), h('div', { class: 'input' }, passIn)),
    agree, err, submit,
    h('p', { class: 'help' }, isSignup ? ['Already have an account? ', h('a', { href: '#/login' }, 'Log in')] : ['New here? ', h('a', { href: '#/signup' }, 'Create an account')]),
    isSignup && h('p', { class: 'help muted' }, 'No email needed.'));
  return h('div', { class: 'stack', style: { gap: '24px' } },
    h('div', { class: 'hero', style: { textAlign: 'center', justifyItems: 'center', padding: '8px 0' } }, h('h1', {}, isSignup ? 'Create account' : 'Log in')),
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
    foreign && h('div', { class: 'banner' }, h('b', {}, 'Round in progress'), h('span', {}, `${gameById(foreign.game)?.name} · ${fmtAgt(foreign.amount)}`), h('div', { class: 'spacer' }), h('a', { class: 'btn accent sm', href: `#/play/${foreign.game}` }, h('span', {}, 'Resume'))));
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
  const notionalField = numberInput({ label: 'Value per token', value: notional, min: 0, max: 1000, step: 0.5, unit: '€', onChange: async (v) => { try { await api.updateProfile({ notional: Math.round(v * 100) / 100 }); location.hash = '#/stats'; render(); } catch (e) { toast(e.message, 'bad'); } } });
  const curve = data.curve;
  const expectedCurve = (() => {
    // expected balance: start minus cumulative expected loss, aligned to each settled round
    let exp = 1000; const out = [{ t: curve[0]?.t ?? Date.now(), b: 1000 }];
    for (const r of [...data.history].reverse()) { exp -= r.amount * (1 - r.rtp); out.push({ t: r.settledAt, b: exp }); }
    return out;
  })();
  return h('div', { class: 'stack', style: { gap: '24px' } },
    h('div', { class: 'row between' }, h('h2', {}, 'Wallet'), h('span', { class: 't-desc' }, `Since ${new Date(m.user.createdAt).toLocaleDateString()}`)),
    h('div', { class: 'stat-grid' },
      tile(fmt(m.user.balance), 'Balance', 'AGT'),
      tile(fmt(s.wagered), 'Wagered', `${s.bets} bets`),
      tile(fmtSigned(s.net), 'Net', null, s.net >= 0 ? 'good' : 'bad'),
      tile('−' + fmt(s.expectedLoss), 'House edge taken', 'expected'),
      tile(s.wagered ? fmtPct(s.returned / s.wagered, 2) : '—', 'Your RTP', 'so far'),
      tile(fmtSigned(s.biggestWin), 'Best win', null, 'good'),
      tile('−' + fmt(s.biggestLoss), 'Worst loss', null, 'bad'),
      tile(fmtDuration(s.playMs), 'Time played'),
      tile(String(m.user.refills), 'Refills'),
      tile(fmt(m.user.deposited ?? 0), 'Deposited', 'lifetime'),
      tile(fmt(m.user.vault ?? 0), 'In vault', 'withdrawn')),
    h('section', { class: 'plate' },
      h('div', { class: 'row between' }, h('h3', {}, 'Balance vs. expected'), h('span', { class: 't-desc' }, data.history.length >= 100 ? 'last 100 rounds' : '')),
      balanceChart(curve, expectedCurve)),
    h('section', { class: 'plate' },
      h('h3', {}, 'In money'),
      h('div', { class: 'two' },
        notionalField,
        h('div', { class: 'reality' },
          tile(fmtMoney(s.wagered * notional), 'Wagered'),
          tile((s.net < 0 ? '−' : '') + fmtMoney(Math.abs(s.net) * notional), s.net < 0 ? 'Lost' : 'Won', null, s.net >= 0 ? 'good' : 'bad'),
          tile('−' + fmtMoney(s.expectedLoss * notional), 'House edge'))),
      h('p', { class: 'help' }, 'Everything above, converted at the rate you choose.')),
    h('section', { class: 'plate' },
      h('h3', {}, 'By game'),
      data.byGame.length ? h('table', { class: 'data' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Game'), h('th', {}, 'Bets'), h('th', {}, 'Wagered'), h('th', {}, 'Returned'), h('th', {}, 'Net'), h('th', {}, 'RTP'), h('th', {}, 'Best'))),
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
      h('p', { class: 'help' }, h('a', { href: '#/fair' }, 'Verify a round'))));
}

function balanceChart(actual, expected) {
  const narrow = window.innerWidth < 860;
  const W = narrow ? 380 : 720, H = narrow ? 200 : 220, px = narrow ? 36 : 44, py = 16;
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
  svg.append(el('path', { d: path(actual), fill: 'none', stroke: '#4f7bff', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  for (const p of actual.filter((q) => q.refill)) svg.append(el('circle', { cx: x(p.t), cy: y(p.b), r: 4, fill: '#f5ac37', stroke: '#0c1017', 'stroke-width': 2 }));
  const last = actual[actual.length - 1];
  svg.append(el('circle', { cx: x(last.t), cy: y(last.b), r: 4, fill: '#4f7bff', stroke: '#0c1017', 'stroke-width': 2 }));
  svg.append(el('text', { x: Math.min(x(last.t) + 8, W - 60), y: y(last.b) - 8, fill: '#fff', 'font-size': 11, 'font-weight': 700, 'font-style': 'italic' }, `Actual ${fmt(last.b, 0)}`));
  const le = expected[expected.length - 1];
  svg.append(el('text', { x: Math.min(x(le.t) + 8, W - 70), y: y(le.b) + 14, fill: 'rgba(255,255,255,.6)', 'font-size': 11, 'font-weight': 700, 'font-style': 'italic' }, `Expected ${fmt(le.b, 0)}`));
  const tip = h('div', { class: 'tip' });
  const wrap = h('div', { class: 'chart' },
    h('div', { class: 'legend' }, h('span', {}, h('i', { style: { background: '#4f7bff' } }), 'Actual balance'), h('span', {}, h('i', { style: { background: 'rgba(255,255,255,.45)', height: '0', borderTop: '2px dashed rgba(255,255,255,.6)' } }), 'Expected balance'), h('span', {}, h('i', { style: { background: '#f5ac37', width: '8px', height: '8px', borderRadius: '50%' } }), 'Refill')),
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
  const clientIn = h('input', { type: 'text', value: seeds.current.clientSeed, maxlength: '64', pattern: '[A-Za-z0-9_\\-]+', spellcheck: 'false' });
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
    h('p', { class: 'lead' }, 'Every result comes from HMAC-SHA256 of a server seed, your client seed and a nonce. Rotate to reveal the server seed and verify any round below.'),
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
      const amt = el.querySelector('.amt');
      const from = Number(amt.textContent.replace(/,/g, '')) || user().balance;
      countTo(amt, from, user().balance, 650, (v) => fmt(v));
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
