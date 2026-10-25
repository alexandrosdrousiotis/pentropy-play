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
import { TIERS, tierById, DRIP_IDS } from '../shared/tiers.js';
import { liveBets, winTicker, chatButton, startSocial, stopSocial, closeChatForLogout, toggleChat } from './social.js';
import { chestCard, chestPill } from './chest.js';
import { heroCarousel, liveSlide, gameOfDaySlide, topTen, liveChip } from './lobby.js';
import { authPage, rememberRef } from './signup.js';
import { userMenu, accountBody } from './menu.js';
import { REFERRAL } from '../shared/tiers.js';

const app = document.getElementById('app');
const side = document.getElementById('side');
const top = document.getElementById('top');
const tabbar = document.getElementById('tabbar');
const footer = document.getElementById('footer');
let activeGame = null; // { module, unmount }

/* ---------------- shell ---------------- */
const NAV = [
  ['#/', 'Home', 'ph-house'], ['#/rebates', 'Rebates', 'ph-gift'], ['#/stats', 'Stats', 'ph-chart-bar'], ['#/learn', 'Learn', 'ph-book-open'], ['#/fair', 'Fairness', 'ph-shield-check'],
];
const isCurrent = (href, route) => route === href || (href !== '#/' && route.startsWith(href));

function renderChrome() {
  const u = user();
  const route = (location.hash || '#/').split('?')[0];
  const navItem = (href, label, icon) => h('a', { class: 'nav-item', href, 'aria-current': isCurrent(href, route) ? 'page' : null }, svgUse(icon), label);
  side.replaceChildren(
    h('a', { class: 'logo', href: '#/' }, h('span', { class: 'mark' }, svgUse('ph-lightning')), h('span', {}, h('b', {}, 'Pentropy'), h('small', {}, 'Play money casino'))),
    h('div', { class: 'group' }, ...NAV.map(([href, label, icon]) => navItem(href, label, icon))),
    ...CATEGORIES.map((cat) => h('div', { class: 'group' }, h('div', { class: 'group-title' }, cat.label), ...CATALOG.filter((g) => g.cat === cat.id).map((g) => h('a', { class: 'nav-item', href: `#/play/${g.id}`, 'aria-current': route === `#/play/${g.id}` ? 'page' : null }, svgUse(gameIcon(g.id)), g.name)))),
    u && me()?.rewards ? tierFoot(me().rewards) : h('div', { class: 'foot' }, svgUse('ph-info'), 'Tokens have no cash value'),
  );
  const playing = /^#\/play\//.test(route);
  const searchIn = h('input', { type: 'search', placeholder: 'Search games', 'aria-label': 'Search games', autocomplete: 'off' });
  searchIn.addEventListener('keydown', (e) => { if (e.key === 'Enter' && searchIn.value.trim()) { location.hash = `#/games?q=${encodeURIComponent(searchIn.value.trim())}`; searchIn.blur(); } });
  const sessNet = u ? sessionNet() : 0;
  top.replaceChildren(
    h('a', { class: 'logo brand-sm', href: '#/' }, h('span', { class: 'mark' }, svgUse('ph-lightning'))),
    playing ? h('a', { href: '#/', class: 'crumb-back', 'aria-label': 'Back to games', 'data-tip': 'Back to games' }, svgUse('ph-caret-left')) : h('span', { class: 'crumb-gap', hidden: true }),
    h('label', { class: 'top-search' }, svgUse('ph-search'), searchIn),
    h('div', { class: 'spacer' }),
    u ? h('div', { class: 'row', style: { gap: '10px' } },
      h('div', { class: 'wallet', id: 'balance', 'data-tip': 'Play money balance. Tap to open the wallet.', role: 'button', tabindex: '0', onClick: (e) => { if (!e.target.closest('.go')) openWallet('history'); } },
        svgUse('ph-coins', 'ic'), h('span', { class: 'amt num' }, fmt(u.balance)),
        h('span', { class: `delta ${sessNet > 0 ? 'up' : sessNet < 0 ? 'down' : ''}`, id: 'session-delta', 'data-tip': 'Net this session' }, fmtSigned(sessNet)),
        h('button', { type: 'button', class: 'go', 'data-tip': 'Deposit or withdraw', onClick: () => openWallet('deposit') }, 'Wallet')),
      h('span', { class: 'top-tools row' }, chatButton()),
      h('button', { type: 'button', class: 'avatar', 'aria-haspopup': 'menu', 'data-tip': u.username, onClick: (e) => userMenu(e.currentTarget) }, u.username.slice(0, 2)))
      : h('div', { class: 'row', style: { gap: '8px' } }, h('a', { class: 'btn ghost sm', href: '#/login' }, h('span', {}, 'Log in')), h('a', { class: 'btn primary sm', href: '#/signup' }, h('span', {}, 'Sign up'))),
  );
  tabbar.hidden = !u;
  // phone tab bar: the four places a player actually goes, plus chat. Learn and Fairness live under Account.
  const TABS = [['#/', 'Home', 'ph-house'], ['#/rebates', 'Rebates', 'ph-gift'], ['chat', 'Chat', 'ph-chat-circle-dots'], ['#/stats', 'Stats', 'ph-chart-bar'], ['#/account', 'You', 'ph-user']];
  tabbar.replaceChildren(...TABS.map(([href, label, icon]) => href === 'chat'
    ? h('button', { type: 'button', class: 'tab-chat', onClick: () => toggleChat() }, svgUse(icon), label)
    : h('a', { href, 'aria-current': isCurrent(href, route) ? 'page' : null }, svgUse(icon), label)));
}
function tierFoot(rw) {
  const t = tierById(rw.tier);
  return h('a', { class: 'foot tierfoot', href: '#/rebates' },
    h('span', { class: 'tier-badge', style: { color: t.colour } }, svgUse('ph-medal'), t.name),
    rw.next ? h('div', { class: 'tier-prog' }, h('div', { class: 'progress' }, h('i', { style: { width: `${rw.next.progress * 100}%` } })), h('span', {}, `${fmt(rw.next.remaining, 0)} to ${rw.next.name}`)) : h('span', {}, 'Top tier'),
    rw.rebatePending >= 1 ? h('span', { class: 'tag green' }, `${fmt(rw.rebatePending)} to claim`) : null);
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
  [/^#\/rebates$/, rewardsPage],
  [/^#\/games$/, gamesPage],
  [/^#\/rewards$/, () => { location.hash = '#/rebates'; return null; }],
];
async function render() {
  if (activeGame) { try { await activeGame.unmount?.(); } catch { /* ignore */ } activeGame = null; }
  const full = location.hash || '#/';
  const hash = full.split('?')[0];
  const qs = new URLSearchParams(full.split('?')[1] || '');
  if (qs.get('ref')) rememberRef(qs.get('ref'));
  const found = routes.find(([re]) => re.test(hash));
  document.body.classList.toggle('playing', /^#\/play\//.test(hash));
  renderChrome();
  if (!found) { location.hash = '#/'; return; }
  const needsAuth = /^#\/(play|stats|fair|account|rewards|rebates)/.test(hash);
  if (needsAuth && !user()) { app.replaceChildren(...[authPage('login', 'Sign in to continue.')].flat().filter(Boolean)); return; }
  const [re, page] = found;
  const out = await page(...hash.match(re).slice(1));
  if ((location.hash || '#/').split('?')[0] !== hash) return; // navigated away while loading
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
    return h('section', { class: 'grow stack section' }, h('div', { class: 'section-head' }, h('h2', {}, title), h('span', { class: 't-desc' }, `${games.length} games`)), cards);
  };
  return h('div', { class: 'stack page landing' },
    h('section', { class: 'hero-banner' },
      heroPicture(true),
      h('div', { class: 'hero-copy' },
        h('div', { class: 'eyebrow' }, '19 games · play money · real odds'),
        h('h1', {}, 'The casino, with the price tag showing'),
        h('p', { class: 'lead' }, '1,000 free tokens. The same games and the same odds as the real sites, with the cost of every bet shown before you place it.'),
        h('div', { class: 'row' }, h('a', { class: 'btn primary lg', href: '#/signup' }, h('span', {}, 'Play free')), h('a', { class: 'hero-link', href: '#/learn' }, 'How it works')))),
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
  const art = h('div', { class: `art ${g.id}` }, svgUse(gameIcon(g.id)));
  art.style.setProperty('--c', GAME_COLOR[g.id]);
  if (ART.has(g.id)) {
    const img = h('img', { src: `art/${g.id}.webp`, alt: '', loading: 'lazy', decoding: 'async' });
    img.addEventListener('load', () => art.classList.add('has-img'));
    img.addEventListener('error', () => img.remove());
    art.append(img);
  }
  art.append(h('span', { class: 'rtp-chip' }, fmtPct(g.rtp, g.rtp === 0.99 || g.rtp === 0.98 ? 0 : 2)), h('div', { class: 'name' }, g.name, h('small', {}, 'Pentropy')));
  return h(linked || href ? 'a' : 'div', { class: 'card', href: href || (linked ? `#/play/${g.id}` : null) }, art);
}
/** A horizontally scrolling row with arrow buttons. */
function gameRow(title, games, linked, sub, viewAll = null) {
  if (!games.length) return null;
  const cards = h('div', { class: 'cards' }, ...games.map((g) => gameTile(g, linked)));
  const scroll = (dir) => cards.scrollBy({ left: dir * cards.clientWidth * 0.8, behavior: 'smooth' });
  return h('section', { class: 'grow stack section' },
    h('div', { class: 'section-head' }, h('h2', {}, title), h('div', { class: 'head-tools' }, viewAll ? h('a', { class: 'view-all', href: viewAll }, 'View all') : sub ? h('span', { class: 't-desc' }, sub) : null, h('div', { class: 'row-arrows' }, h('button', { type: 'button', 'aria-label': 'Scroll left', onClick: () => scroll(-1) }, svgUse('ph-caret-left')), h('button', { type: 'button', 'aria-label': 'Scroll right', onClick: () => scroll(1) }, svgUse('ph-caret-right'))))),
    cards);
}
/** Wide category card: one line of copy and a big tinted glyph. A card, not a button. */
function catCard({ title, text, href, art, colour, extra = null }) {
  const el = h('a', { class: 'cat-card', href }, h('img', { class: 'cc-img', src: `art/${art}.webp`, alt: '', loading: 'lazy', decoding: 'async' }), extra, h('div', { class: 'cc-body' }, h('h3', {}, title), h('p', {}, text)));
  el.style.setProperty('--c', colour);
  return el;
}
/** The painted casino floor behind the hero, with a taller crop for phones. */
function heroPicture(eager = false) {
  return h('picture', { class: 'hero-pic' },
    h('source', { media: '(max-width: 860px)', srcset: 'art/lobby-hero-mobile.webp' }),
    h('img', { class: 'hero-img', src: 'art/lobby-hero.webp', alt: '', decoding: 'async', fetchpriority: eager ? 'high' : null }));
}
/** The lobby hero: whichever reward is live right now, with one call to action. */
function promoHero(m) {
  const c = m.rewards?.chest, d = m.rewards?.drips || {};
  const chestReady = c && (c.ready || Date.now() >= c.nextAt) && c.wagered > 0;
  const drip = Object.entries(d).find(([, x]) => x.ready && x.available > 0);
  const until = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60); return hh ? `${hh}h ${mm}m` : `${mm}m`; };
  let eyebrow, title, text, cta;
  if (chestReady) { eyebrow = 'Your chest is ready'; title = `About ${fmt(c.expected)} AGT inside`; text = 'A random 0.3% to 1.2% of what you wagered since it last opened. Expected value on the label.'; cta = button('Open chest', { kind: 'primary', size: 'lg', onClick: async () => { const { openChestFlow } = await import('./chest.js'); await openChestFlow(c.wagered); render(); } }); }
  else if (drip) { eyebrow = `${drip[1].label} unlocked`; title = `${fmt(drip[1].available)} AGT to claim`; text = drip[1].blurb; cta = button(`Claim ${fmt(drip[1].available)} AGT`, { kind: 'primary', size: 'lg', onClick: async () => { try { await api.claimDrip(drip[0]); toast('Claimed.', 'good'); render(); } catch (e) { toast(e.message, 'bad'); } } }); }
  else { const t = tierById(m.rewards?.tier); eyebrow = `Welcome back, ${m.user.username}`; title = c && c.wagered > 0 ? `Chest opens in ${until(c.nextAt - Date.now())}` : 'Play to fill the chest'; text = `${t.name} · ${(t.rate * 100).toFixed(1)}% rakeback · hourly, daily and weekly rebates on what you wager.`; cta = h('a', { class: 'btn primary lg', href: '#/rebates' }, h('span', {}, 'Rebates')); }
  return { key: 'promo', img: heroPicture(), copy: h('div', { class: 'hero-copy' }, h('div', { class: 'eyebrow' }, eyebrow), h('h1', {}, title), h('p', { class: 'lead' }, text), h('div', { class: 'row' }, cta)), thumb: 'art/lobby-hero.webp', label: 'Rebates' };
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
    const isle = h(linked ? 'a' : 'div', { class: `island${hasBanner ? ' has-img' : ''}${i === 0 ? ' lead' : ''}`, href: linked ? `#/play/${f.id}` : '#/signup' },
      hasBanner ? h('img', { class: 'island-img', src: `art/${f.id}-banner.webp`, alt: '', decoding: 'async' }) : h('div', { class: 'island-art' }, svgUse(gameIcon(f.id))),
      h('div', { class: 'island-body' }, h('div', { class: 'island-kicker' }, `${fmtPct(g.rtp, 2)} RTP · max ${g.ceiling}`), h('h3', {}, f.title), h('p', {}, f.text), h('span', { class: 'btn white sm' }, h('span', {}, 'Play'))));
    isle.style.setProperty('--c', GAME_COLOR[f.id]);
    return isle;
  }));
}
const TRENDING = ['crash', 'mines', 'plinko', 'chicken', 'dice', 'roulette', 'limbo', 'wheel'];
/** Search + category chips + rows + full grid. `recent` is a list of game ids from the player's history. */
function gamesBoard(linked = true, recent = [], initialCat = 'all', initialQuery = '') {
  let query = initialQuery, cat = initialCat;
  const input = h('input', { type: 'search', placeholder: 'Search games', 'aria-label': 'Search games', autocomplete: 'off', value: initialQuery });
  const chips = h('div', { class: 'chips' });
  const rows = h('div', { class: 'stack page' });
  const paintChips = () => chips.replaceChildren(...[{ id: 'all', label: 'All', icon: 'ph-squares-four' }, ...CATEGORIES.map((c) => ({ id: c.id, label: c.label, icon: c.id === 'table' ? 'ph-spade' : c.id === 'chains' ? 'ph-lightning' : 'ph-sparkle' }))].map((c) => h('button', { type: 'button', 'aria-pressed': String(cat === c.id), onClick: () => { cat = c.id; paintChips(); paint(); } }, svgUse(c.icon), c.label)));
  const paint = () => {
    const q = query.trim().toLowerCase();
    const filtered = CATALOG.filter((g) => (cat === 'all' || g.cat === cat) && (!q || g.name.toLowerCase().includes(q) || g.blurb.toLowerCase().includes(q)));
    if (q || cat !== 'all') {
      rows.replaceChildren(h('section', { class: 'all-games stack section' }, h('div', { class: 'section-head' }, h('h2', {}, q ? `Results for “${query.trim()}”` : CATEGORIES.find((c) => c.id === cat)?.label), h('span', { class: 't-desc' }, `${filtered.length} games`)),
        filtered.length ? h('div', { class: 'cards' }, ...filtered.map((g) => gameTile(g, linked))) : h('p', { class: 'help' }, 'No games match.')));
      return;
    }
    rows.replaceChildren(...[
      featured(linked),
      gameRow('Trending', TRENDING.map(gameById), linked, 'most played'),
      recent.length ? gameRow('Recently played', recent.map(gameById).filter(Boolean), linked) : null,
      ...CATEGORIES.map((c) => gameRow(c.label, CATALOG.filter((g) => g.cat === c.id), linked, `${CATALOG.filter((g) => g.cat === c.id).length} games`)),
      h('section', { class: 'all-games stack section' }, h('div', { class: 'section-head' }, h('h2', {}, 'All games'), h('span', { class: 't-desc' }, `${CATALOG.length} games`)), h('div', { class: 'cards' }, ...CATALOG.map((g) => gameTile(g, linked)))),
    ].filter(Boolean));
  };
  input.addEventListener('input', () => { query = input.value; paint(); });
  paintChips(); paint();
  return h('div', { class: 'stack page' }, h('div', { class: 'lobby-top' }, h('label', { class: 'search' }, svgUse('ph-search'), input), chips), rows);
}
function gamesGrid(linked = true, recent = []) { return gamesBoard(linked, recent); }

/* ---------------- lobby ---------------- */
async function lobbyPage() {
  const m = me();
  const open = m.openRound;
  let recent = [];
  try { const r = await api.rounds(60); recent = [...new Set(r.rounds.map((x) => x.game))].slice(0, 8); } catch { /* fine */ }
  const by = (id) => CATALOG.filter((g) => g.cat === id);
  return h('div', { class: 'stack page' },
    heroCarousel([promoHero(m), liveSlide(), gameOfDaySlide()]),
    open && h('div', { class: 'banner' }, h('b', {}, 'Round in progress'), h('span', {}, `${gameById(open.game)?.name} · ${fmtAgt(open.amount)}`), h('div', { class: 'spacer' }), h('a', { class: 'btn accent sm', href: `#/play/${open.game}` }, h('span', {}, 'Resume'))),
    h('div', { class: 'cat-cards' },
      catCard({ title: 'Live tables', text: 'One Crash flight and one wheel, for everyone at once.', href: '#/play/crash', art: 'cat-live', colour: GAME_COLOR.crash, extra: liveChip() }),
      catCard({ title: 'Originals', text: `${CATALOG.length} provably fair games. Verify any round in your browser.`, href: '#/games', art: 'cat-originals', colour: GAME_COLOR.dice })),
    topTen((g) => gameTile(g, true)),
    gameRow('Originals', by('originals'), true, null, '#/games?cat=originals'),
    recent.length ? gameRow('Recently played', recent.map(gameById).filter(Boolean), true) : null,
    gameRow('Streak games', by('chains'), true, null, '#/games?cat=chains'),
    gameRow('Table games', by('table'), true, null, '#/games?cat=table'),
    liveBets());
}
/** All games: search, category chips, every tile. Linked from the rows' View all. */
function gamesPage() {
  const qs = new URLSearchParams((location.hash.split('?')[1]) || '');
  return h('div', { class: 'stack page' }, h('h2', { class: 'gt' }, 'Games'), gamesBoard(Boolean(user()), [], qs.get('cat') || 'all', qs.get('q') || ''));
}

/* ---------------- auth ---------------- */
/* ---------------- referrals ---------------- */
function referralPanel(rf) {
  const link = `${location.origin}${location.pathname}#/signup?ref=${rf.code}`;
  const copy = button('Copy link', { kind: 'primary', size: 'sm', onClick: async () => { try { await navigator.clipboard.writeText(link); toast('Link copied.', 'good'); } catch { toast(link); } } });
  const claim = button(rf.pending >= rf.minClaim ? `Claim ${fmt(rf.pending)} AGT` : 'Nothing to claim yet', { kind: rf.pending >= rf.minClaim ? 'primary' : 'tertiary', size: 'sm', disabled: rf.pending < rf.minClaim, onClick: async () => { try { await api.claimReferral(); toast('Referral earnings claimed.', 'good'); render(); } catch (e) { toast(e.message, 'bad'); } } });
  return h('section', { class: 'plate ref-panel' },
    h('div', { class: 'row between' }, h('h3', {}, 'Refer a friend'), h('span', { class: 't-desc' }, `${rf.count} friend${rf.count === 1 ? '' : 's'} joined`)),
    h('div', { class: 'ref-grid' },
      h('div', { class: 'ref-link' },
        h('div', { class: 't-label' }, 'Your link'),
        h('div', { class: 'ref-code' }, h('span', { class: 'mono' }, link), copy),
        h('p', { class: 'help' }, `They get +${rf.bonus} AGT on sign-up. You get ${(rf.rate * 100).toFixed(0)}% of the house edge on every bet they ever place, paid into your balance.`)),
      h('div', { class: 'tile' }, h('div', { class: 'v num good' }, `+${fmt(rf.pending)}`), h('div', { class: 'l' }, 'To claim'), claim),
      h('div', { class: 'tile' }, h('div', { class: 'v num' }, fmt(rf.claimed)), h('div', { class: 'l' }, 'Claimed so far'), h('div', { class: 'd' }, 'your cut of their losses'))),
    rf.referred.length ? h('div', { class: 'tscroll' }, h('table', { class: 'data' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Friend'), h('th', {}, 'Joined'), h('th', {}, 'Wagered'), h('th', {}, 'Edge they paid'), h('th', {}, 'Your cut'))),
      h('tbody', {}, ...rf.referred.map((r) => h('tr', {}, h('td', {}, r.username), h('td', {}, new Date(r.joinedAt).toLocaleDateString()), h('td', { class: 'num' }, fmt(r.wagered)), h('td', { class: 'num bad' }, `−${fmt(r.edge)}`), h('td', { class: 'num good' }, `+${fmt(r.edge * rf.rate)}`)))))) : null,
    h('p', { class: 'help' }, 'This is affiliate marketing with the label left on. Every "join with my code" you have ever seen pays the person who posted it a share of what you lose. Here the share is printed in the table.'));
}

/* ---------------- game page ---------------- */
async function gamePage(id) {
  const meta = gameById(id);
  if (!meta) { location.hash = '#/'; return h('div'); }
  const m = me();
  const foreign = m.openRound && m.openRound.game !== id ? m.openRound : null;
  const root = h('div', { class: 'stack page' },
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
  return h('div', { class: 'stack page' },
    h('div', { class: 'row between' }, h('h2', {}, 'Stats'), h('span', { class: 't-desc' }, `Since ${new Date(m.user.createdAt).toLocaleDateString()}`)),
    (() => {
      const putIn = 1000 + (m.user.deposited ?? 0) + (m.user.refills ?? 0) * 1000;
      const have = m.user.balance + (m.user.vault ?? 0);
      const diff = have - putIn;
      return h('section', { class: 'summary' },
        h('div', { class: 'sum-row' },
          h('div', { class: 'sum-cell' }, h('div', { class: 'l' }, 'Put in'), h('div', { class: 'v num' }, fmt(putIn, 0))),
          h('div', { class: 'sum-cell' }, h('div', { class: 'l' }, 'Have now'), h('div', { class: 'v num' }, fmt(have, 0))),
          h('div', { class: 'sum-cell' }, h('div', { class: 'l' }, diff >= 0 ? 'Up' : 'Down'), h('div', { class: `v num ${diff >= 0 ? 'good' : 'bad'}` }, fmtSigned(Math.round(diff))))),
        h('p', { class: 'sum-line' }, s.bets
          ? `${s.bets} bets. The house edge took ${fmt(s.expectedLoss)} on average; rebates gave ${fmt((m.rewards?.rebateClaimed ?? 0) + (m.rewards?.bonuses ?? 0))} back. ${diff < 0 ? `At €${fmt(m.user.notional)} a token, that is €${fmt(-diff)} gone.` : 'Variance is ahead of the edge for now.'}`
          : 'No bets yet. Every bet shows its cost before you place it.'));
    })(),
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
      tile(fmt(m.user.vault ?? 0), 'In vault', 'withdrawn'),
      tile('+' + fmt((m.rewards?.rebateClaimed ?? 0) + (m.rewards?.bonuses ?? 0)), 'Rebates & bonuses', 'given back', 'good')),
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
      data.byGame.length ? h('div', { class: 'tscroll' }, h('table', { class: 'data' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Game'), h('th', {}, 'Bets'), h('th', {}, 'Wagered'), h('th', {}, 'Returned'), h('th', {}, 'Net'), h('th', {}, 'RTP'), h('th', {}, 'Best'))),
        h('tbody', {}, ...data.byGame.sort((a, b) => b.wagered - a.wagered).map((g) => h('tr', {},
          h('td', {}, gameById(g.game)?.name ?? g.game), h('td', {}, g.bets), h('td', {}, fmt(g.wagered)), h('td', {}, fmt(g.returned)),
          h('td', { class: g.returned - g.wagered >= 0 ? 'good' : 'bad' }, fmtSigned(g.returned - g.wagered)), h('td', {}, fmtPct(g.returned / g.wagered, 2)), h('td', {}, fmtMult(g.best || 0)))))))
        : h('p', { class: 'help' }, 'No bets yet.')),
    h('section', { class: 'plate' },
      h('h3', {}, 'Recent rounds'),
      data.history.length ? h('div', { class: 'tscroll' }, h('table', { class: 'data' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Game'), h('th', {}, 'Stake'), h('th', {}, 'Result'), h('th', {}, 'Net'), h('th', {}, 'Nonce'))),
        h('tbody', {}, ...data.history.slice(0, 20).map((r) => h('tr', {}, h('td', {}, gameById(r.game)?.name), h('td', {}, fmt(r.amount)), h('td', {}, fmtMult(r.multiplier)), h('td', { class: r.net >= 0 ? 'good' : 'bad' }, fmtSigned(r.net)), h('td', { class: 'mono' }, r.nonce))))))
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
  svg.append(el('path', { d: path(actual), fill: 'none', stroke: '#e6b655', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  for (const p of actual.filter((q) => q.refill)) svg.append(el('circle', { cx: x(p.t), cy: y(p.b), r: 4, fill: '#f5ac37', stroke: '#0c1017', 'stroke-width': 2 }));
  const last = actual[actual.length - 1];
  svg.append(el('circle', { cx: x(last.t), cy: y(last.b), r: 4, fill: '#e6b655', stroke: '#0a0c11', 'stroke-width': 2 }));
  svg.append(el('text', { x: Math.min(x(last.t) + 8, W - 60), y: y(last.b) - 8, fill: '#fff', 'font-size': 11, 'font-weight': 700, 'font-style': 'italic' }, `Actual ${fmt(last.b, 0)}`));
  const le = expected[expected.length - 1];
  svg.append(el('text', { x: Math.min(x(le.t) + 8, W - 70), y: y(le.b) + 14, fill: 'rgba(255,255,255,.6)', 'font-size': 11, 'font-weight': 700, 'font-style': 'italic' }, `Expected ${fmt(le.b, 0)}`));
  const tip = h('div', { class: 'tip' });
  const wrap = h('div', { class: 'chart' },
    h('div', { class: 'legend' }, h('span', {}, h('i', { style: { background: '#e6b655' } }), 'Actual balance'), h('span', {}, h('i', { style: { background: 'rgba(255,255,255,.45)', height: '0', borderTop: '2px dashed rgba(255,255,255,.6)' } }), 'Expected balance'), h('span', {}, h('i', { style: { background: '#8b9cff', width: '8px', height: '8px', borderRadius: '50%' } }), 'Refill')),
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
  return h('div', { class: 'stack page' },
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
  return h('div', { class: 'stack page' },
    h('h2', { class: 'gt' }, 'Provably fair'),
    h('p', { class: 'lead' }, 'Every result comes from HMAC-SHA256 of a server seed, your client seed and a nonce. Rotate to reveal the server seed and verify any round below.'),
    h('section', { class: 'plate' }, h('h3', {}, 'Live tables: Crash and Roulette'), h('p', { class: 't-body' }, 'Shared rounds use commit-reveal per round instead of your personal seeds. The SHA-256 hash of the round seed is shown while bets are open; the seed itself is revealed the moment the round ends, and the game page checks in your browser that HMAC-SHA256(seed, "game:roundId") reproduces the crash point or the number. Nobody, including the server, can change a result after the hash is published, and nobody can know it before the seed is revealed.')),
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

/* ---------------- rewards ---------------- */
async function rewardsPage() {
  const [rw, rf] = await Promise.all([api.rewards(), api.referrals().catch(() => null)]);
  const m = me();
  const t = tierById(rw.tier);
  const netCost = rw.edgePaid - rw.rebateClaimed - rw.rebatePending - rw.bonuses;
  const claim = button(rw.rebatePending >= 1 ? `Claim ${fmt(rw.rebatePending)} AGT` : 'Nothing to claim yet', { kind: 'primary', size: 'lg', disabled: rw.rebatePending < 1, onClick: async () => { try { await api.claimRebate(); toast('Rebate claimed.', 'good'); render(); } catch (e) { toast(e.message, 'bad'); } } });
  const ladder = h('div', { class: 'ladder' }, ...TIERS.map((tier, i) => {
    const reached = TIERS.findIndex((x) => x.id === rw.tier) >= i;
    return h('div', { class: `rung${reached ? ' reached' : ''}${tier.id === rw.tier ? ' current' : ''}` },
      h('span', { class: 'tier-badge', style: { color: tier.colour } }, svgUse('ph-medal'), tier.name),
      h('span', { class: 'rung-th num' }, tier.threshold ? `${fmt(tier.threshold, 0)} wagered` : 'start'),
      h('span', { class: 'rung-rate num' }, `${(tier.rate * 100).toFixed(1)}% rakeback`),
      h('span', { class: 'rung-bonus num' }, tier.bonus ? `+${fmt(tier.bonus, 0)} bonus` : '—'));
  }));
  const drips = h('div', { class: 'drips' });
  const countdown = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); const d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60; return d ? `${d}d ${hh}h` : hh ? `${hh}h ${String(mm).padStart(2, '0')}m` : `${mm}:${String(ss).padStart(2, '0')}`; };
  let dripState = rw.drips, dripTimer = 0;
  function paintDrips() {
    drips.replaceChildren(...DRIP_IDS.map((kind) => {
      const d = dripState[kind]; const ready = d.ready || Date.now() >= d.nextAt;
      return h('div', { class: `drip${ready && d.available > 0 ? ' ready' : ''}` },
        h('div', { class: 'row between' }, h('span', { class: 't-label' }, d.label), h('span', { class: `tag${ready ? ' green' : ''} num` }, svgUse(ready ? 'ph-gift' : 'ph-lock'), ready ? 'Unlocked' : countdown(d.nextAt - Date.now()))),
        h('div', { class: 'drip-amt num' }, fmt(ready ? d.available : dripAmountNow(d)), h('small', {}, 'AGT')),
        h('p', { class: 'help' }, `${d.blurb} You wagered ${fmt(d.wagered)}.`),
        button(ready ? (d.available > 0 ? `Claim ${fmt(d.available)} AGT` : 'Nothing to claim') : `Unlocks in ${countdown(d.nextAt - Date.now())}`, { kind: ready && d.available > 0 ? 'primary' : 'tertiary', size: 'sm', disabled: !(ready && d.available > 0), onClick: async () => { try { const r = await api.claimDrip(kind); dripState = r.drips; toast(`${d.label}: +${fmt(r.claimed)} AGT`, 'good'); render(); } catch (e) { toast(e.message, 'bad'); } } }));
    }));
  }
  const dripAmountNow = (d) => (d.wagered > 0 ? Math.min(d.max, Math.max(d.min, d.wagered * d.rate)) : 0);
  paintDrips();
  dripTimer = setInterval(() => { if (!drips.isConnected) return clearInterval(dripTimer); paintDrips(); }, 1000);
  const given = rw.rebateClaimed + rw.rebatePending + rw.bonuses;
  return h('div', { class: 'stack page' },
    h('div', { class: 'row between' }, h('h2', {}, 'Rebates'), h('span', { class: 'tier-badge lg', style: { color: t.colour } }, svgUse('ph-medal'), t.name)),
    chestCard(rw.chest),
    h('section', { class: 'plate' },
      h('div', { class: 'row between' }, h('h3', {}, 'Timed rebates'), h('span', { class: 't-desc' }, `${fmt(rw.bonuses)} AGT given so far`)),
      drips,
      h('p', { class: 'help' }, `Each drip returns a fraction of what you wagered in its window, and only if you come back in time. The edge took ${fmtPct(1 - 0.99, 0)} of every bet on the way; the hourly one gives back 0.5%. The timer is the product, not the money.`)),
    h('section', { class: 'rw-hero' },
      h('div', { class: 'rw-main' },
        h('div', { class: 't-label' }, 'Rakeback to claim'),
        h('div', { class: 'rw-big num' }, fmt(rw.rebatePending), h('small', {}, 'AGT')),
        h('p', { class: 'help' }, `${(t.rate * 100).toFixed(1)}% of the house edge on every bet comes back to you as ${t.name}.`),
        claim),
      rw.next ? h('div', { class: 'rw-next' },
        h('div', { class: 'row between' }, h('span', { class: 't-label' }, `Next: ${rw.next.name}`), h('span', { class: 't-desc num' }, `${fmt(rw.wagered, 0)} / ${fmt(rw.next.threshold, 0)}`)),
        h('div', { class: 'progress' }, h('i', { style: { width: `${rw.next.progress * 100}%` } })),
        h('p', { class: 'help' }, `Wager ${fmt(rw.next.remaining, 0)} more AGT for ${(tierById(rw.next.id).rate * 100).toFixed(1)}% rakeback and a ${fmt(tierById(rw.next.id).bonus, 0)} AGT bonus.`))
        : h('div', { class: 'rw-next' }, h('span', { class: 't-label' }, 'Top tier reached'))),
    h('section', { class: 'plate' },
      h('h3', {}, 'What the rebate is made of'),
      h('div', { class: 'flow' },
        h('div', { class: 'flow-step' }, h('div', { class: 'l' }, 'Wagered'), h('div', { class: 'v num' }, fmt(rw.wagered))),
        h('span', { class: 'flow-arrow' }, svgUse('ph-caret-right')),
        h('div', { class: 'flow-step bad' }, h('div', { class: 'l' }, 'Edge taken'), h('div', { class: 'v num' }, '−' + fmt(rw.edgePaid))),
        h('span', { class: 'flow-arrow' }, svgUse('ph-caret-right')),
        h('div', { class: 'flow-step good' }, h('div', { class: 'l' }, 'Given back'), h('div', { class: 'v num' }, '+' + fmt(rw.rebateClaimed + rw.rebatePending + rw.bonuses))),
        h('span', { class: 'flow-arrow' }, svgUse('ph-caret-right')),
        h('div', { class: 'flow-step' }, h('div', { class: 'l' }, 'Net cost of playing'), h('div', { class: `v num ${netCost > 0 ? 'bad' : ''}` }, '−' + fmt(Math.max(0, netCost))))),
      h('p', { class: 'help' }, rw.edgePaid > 0 ? `Rebates and bonuses returned ${fmtPct((rw.rebateClaimed + rw.rebatePending + rw.bonuses) / rw.edgePaid, 1)} of what the edge took. The rest is the price of the loyalty programme.` : 'Place bets to see the edge, and the slice of it that comes back.')),
    h('section', { class: 'plate' }, h('h3', {}, 'Tiers'), ladder,
      h('p', { class: 'help' }, 'Tiers are earned by lifetime wager, not by winning. The faster you climb, the more the edge has already taken.')),
    rf && referralPanel(rf));
}

/* ---------------- account & limits ---------------- */
function accountPage() {
  const m = me();
  return h('div', { class: 'stack page' },
    h('div', { class: 'row between' }, h('h2', { class: 'gt' }, m.user.username), h('div', { class: 'row' }, soundToggle(), button('Log out', { kind: 'tertiary', size: 'sm', onClick: async () => { await api.logOut(); location.hash = '#/'; } }))),
    accountBody(),
    h('div', { class: 'more-links' }, h('a', { class: 'btn tertiary sm', href: '#/learn' }, h('span', {}, 'Learn')), h('a', { class: 'btn tertiary sm', href: '#/fair' }, h('span', {}, 'Fairness')), h('a', { class: 'btn tertiary sm', href: '#/rebates' }, h('span', {}, 'Rebates'))));
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
  if (type === 'auth' || type === 'me') { if (user()) startSocial(); else { stopSocial(); closeChatForLogout(); } }
});
edu.install();
renderFooter();
await api.boot();
await render();
