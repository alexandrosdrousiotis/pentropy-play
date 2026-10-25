// Social layer: live bets, big wins, leaders and chat. One poller feeds every widget on the page.
// The feed is part of the lesson: most rows are red, and the "big wins" tab is the survivorship
// filter every casino pins to the top. Simulated players are always marked.
import { api, user, DEMO } from './api.js';
import { h, svgUse, button, fmt, fmtMult } from './ui.js';
import { gameById, ART } from './games/index.js';
import { gameIcon } from './games/common.js';
import { sound } from './fx.js';

const listeners = new Set();
const emit = () => listeners.forEach((f) => { try { f(); } catch { /* widget gone */ } });
export const onSocial = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const socialBets = () => bets;
export const socialOnline = () => online;

let bets = [], chat = [], online = 0, ambient = true, lastAt = 0, lastChat = 0, timer = 0, running = false, unread = 0, seen = new Set();
const CHAT_KEY = 'pentropy.chat.open';
let chatOpen = (() => { try { return localStorage.getItem(CHAT_KEY) === '1'; } catch { return false; } })();

async function poll() {
  if (!running || !user()) return;
  if (!document.hidden) {
    try {
      const r = await api.social(lastAt, lastChat);
      if (r.bets.length) {
        const fresh = lastAt > 0;
        bets = [...r.bets.map((b) => ({ ...b, fresh })), ...bets].slice(0, 80);
        lastAt = Math.max(lastAt, ...r.bets.map((b) => b.at));
      }
      const incoming = r.chat.filter((m) => !seen.has(m.id));
      if (incoming.length) {
        incoming.forEach((m) => seen.add(m.id));
        chat = [...chat, ...incoming].slice(-150);
        lastChat = Math.max(lastChat, ...incoming.map((m) => m.id));
        if (!chatOpen) unread += incoming.filter((m) => m.username !== user()?.username).length;
      }
      online = r.online; ambient = r.ambient;
      emit();
    } catch { /* offline for a moment; the next tick retries */ }
  }
  timer = setTimeout(poll, DEMO ? 2200 : 3000);
}
export function startSocial() { if (running) return; running = true; poll(); }
export function stopSocial() { running = false; clearTimeout(timer); bets = []; chat = []; seen = new Set(); lastAt = 0; lastChat = 0; unread = 0; emit(); }
document.addEventListener('visibilitychange', () => { if (!document.hidden && running) { clearTimeout(timer); poll(); } });

/* ---------------- helpers ---------------- */
const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 5 ? 'now' : s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`; };
const who = (b) => h('span', { class: 'who' }, b.username, b.bot ? h('span', { class: 'sim', title: 'Simulated player' }, svgUse('ph-robot')) : null);
const gameCell = (id) => { const g = gameById(id); return h('span', { class: 'gm' }, h('span', { class: 'gi' }, ART.has(id) ? h('img', { src: `art/${id}.webp`, alt: '', loading: 'lazy', decoding: 'async' }) : svgUse(gameIcon(id))), h('span', { class: 'gn' }, g?.name ?? id)); };

/* ---------------- live bets panel ---------------- */
export function liveBets() {
  let tab = 'all', extra = [], leaders = [], ticks = 0;
  const tabs = h('div', { class: 'seg lb-tabs' });
  const body = h('div', { class: 'lb-body' });
  const foot = h('p', { class: 'help lb-foot' });
  const onlineEl = h('span', { class: 'tag' }, svgUse('ph-users-three'), '—');
  const root = h('section', { class: 'panel live-bets' }, h('div', { class: 'section-head' }, h('div', { class: 'row' }, h('h2', {}, 'Live bets'), onlineEl), tabs), body, foot);
  const setTab = async (t) => { tab = t; paintTabs(); if (t === 'big') extra = (await api.socialBig().catch(() => ({ bets: [] }))).bets; if (t === 'leaders') leaders = (await api.socialLeaders().catch(() => ({ leaders: [] }))).leaders; paint(); };
  function paintTabs() {
    tabs.replaceChildren(...[['all', 'All bets'], ['big', 'Big wins'], ['leaders', 'Leaders']].map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(tab === k), onClick: () => setTab(k) }, l)));
  }
  const row = (b) => h('div', { class: `lb-row ${b.multiplier > 1 ? 'win' : b.multiplier === 1 ? 'push' : 'loss'}${b.fresh ? ' fresh' : ''}` },
    gameCell(b.game), who(b), h('span', { class: 'num t' }, ago(b.at)), h('span', { class: 'num bet' }, fmt(b.amount)), h('span', { class: 'num mult' }, fmtMult(b.multiplier)), h('span', { class: 'num pay' }, `${b.net >= 0 ? '+' : '−'}${fmt(Math.abs(b.net))}`));
  const head = (cols) => h('div', { class: 'lb-row head' }, ...cols.map((c) => h('span', {}, c)));
  function paint() {
    onlineEl.lastChild.textContent = ` ${online} online`;
    if (tab === 'all') {
      const list = bets.slice(0, 30);
      body.replaceChildren(head(['Game', 'Player', 'Time', 'Bet', 'Multiplier', 'Payout']), ...list.map(row));
      const lost = list.filter((b) => b.multiplier < 1).length;
      foot.textContent = list.length ? `${lost} of the last ${list.length} bets shown lost. That ratio is the house edge in plain sight.${ambient ? ' Rows marked with a robot are simulated so the room never looks empty; real sites do the same and never tell you.' : ''}` : 'No bets yet. Yours will show up here.';
    } else if (tab === 'big') {
      body.replaceChildren(head(['Game', 'Player', 'Time', 'Bet', 'Multiplier', 'Payout']), ...extra.map(row));
      foot.textContent = 'Only the winners make this list. The losses that paid for them are one tab to the left. This is the filter every casino lobby shows you first.';
    } else {
      body.replaceChildren(h('div', { class: 'lb-row head ldr' }, ...['#', 'Player', 'Bets', 'Wagered', 'Best', 'Net'].map((c) => h('span', {}, c))),
        ...leaders.map((l, i) => h('div', { class: 'lb-row ldr' }, h('span', { class: `rank ${i === 0 ? 'g' : i === 1 ? 's' : i === 2 ? 'b' : ''}` }, i + 1), who(l), h('span', { class: 'num' }, l.bets), h('span', { class: 'num' }, fmt(l.wagered, 0)), h('span', { class: 'num mult' }, fmtMult(l.best)), h('span', { class: `num ${l.net >= 0 ? 'good' : 'bad'}` }, `${l.net >= 0 ? '+' : '−'}${fmt(Math.abs(l.net), 0)}`))));
      const neg = leaders.filter((l) => l.net < 0).length;
      foot.textContent = leaders.length ? `Ranked by wager, the way real leaderboards are. ${neg} of ${leaders.length} are down: the more you play, the surer the edge gets.` : 'No one on the board yet today.';
    }
  }
  paintTabs(); paint();
  const off = onSocial(() => { ticks++; if (tab === 'all') paint(); else if (ticks % 5 === 0) setTab(tab); else onlineEl.lastChild.textContent = ` ${online} online`; });
  root.destroy = off;
  return root;
}

/* ---------------- recent wins strip ---------------- */
export function winTicker() {
  const track = h('div', { class: 'ticker-track' });
  const root = h('div', { class: 'ticker', 'aria-label': 'Recent wins' }, h('span', { class: 'ticker-label' }, svgUse('ph-sparkle'), 'Wins'), track);
  const shown = new Set();
  function paint() {
    const wins = bets.filter((b) => b.multiplier >= 2).slice(0, 8);
    for (const b of [...wins].reverse()) {
      if (shown.has(b.id)) continue; shown.add(b.id);
      const chip = h('span', { class: 'tchip' }, h('b', {}, b.username), ` ${fmtMult(b.multiplier)} on ${gameById(b.game)?.name ?? b.game} `, h('span', { class: 'good' }, `+${fmt(b.net, 0)}`));
      track.prepend(chip);
      while (track.children.length > 10) track.lastChild.remove();
    }
    root.hidden = !track.children.length;
  }
  paint();
  root.destroy = onSocial(paint);
  return root;
}

/* ---------------- chat drawer ---------------- */
let drawer = null, list = null, btn = null, onlineBadge = null, unreadBadge = null;
const CANNED_NOTE = 'Play money chat. Be kind. Nobody in here has a system that beats the edge.';
function paintChat() {
  if (!drawer) return;
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  const mine = user()?.username;
  list.replaceChildren(h('div', { class: 'msg sys' }, CANNED_NOTE), ...chat.map((m) => h('div', { class: `msg${m.username === mine ? ' me' : ''}${m.bot ? ' bot' : ''}` }, h('b', {}, m.username, m.bot ? h('span', { class: 'sim', title: 'Simulated player' }, svgUse('ph-robot')) : null), h('span', { class: 'txt' }, m.text), h('span', { class: 't' }, ago(m.at)))));
  if (atBottom) list.scrollTop = list.scrollHeight;
  if (onlineBadge) onlineBadge.textContent = `${online} online`;
  if (unreadBadge) { unreadBadge.textContent = unread > 9 ? '9+' : String(unread); unreadBadge.hidden = !unread || chatOpen; }
}
export function mountChat() {
  if (drawer) return drawer;
  list = h('div', { class: 'chat-list', role: 'log', 'aria-live': 'polite' });
  const input = h('input', { type: 'text', maxlength: '200', placeholder: 'Say something', autocomplete: 'off', 'aria-label': 'Message' });
  const send = h('button', { type: 'submit', class: 'chat-send', 'aria-label': 'Send' }, svgUse('ph-paper-plane-right'));
  const err = h('p', { class: 'help bad chat-err' });
  const form = h('form', { class: 'chat-form', onSubmit: async (e) => {
    e.preventDefault(); const text = input.value.trim(); if (!text) return;
    send.disabled = true; err.textContent = '';
    try { const m = await api.chatSend(text); if (!seen.has(m.id)) { seen.add(m.id); chat = [...chat, m].slice(-150); lastChat = Math.max(lastChat, m.id); } input.value = ''; sound.play('tick'); paintChat(); list.scrollTop = list.scrollHeight; }
    catch (x) { err.textContent = x.message; }
    send.disabled = false; input.focus();
  } }, input, send);
  onlineBadge = h('span', { class: 'tag' }, '— online');
  drawer = h('aside', { class: 'chat', id: 'chat', 'aria-label': 'Chat', hidden: !chatOpen },
    h('div', { class: 'chat-head' }, h('span', { class: 'chat-title' }, svgUse('ph-chat-circle-dots'), 'Chat', DEMO ? h('span', { class: 'tag' }, 'demo room') : null), onlineBadge, h('button', { type: 'button', class: 'wclose', 'aria-label': 'Close chat', onClick: () => toggleChat(false) }, svgUse('ph-x'))),
    list, err, form);
  let y0 = null;
  const head = drawer.querySelector('.chat-head');
  head.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
  head.addEventListener('touchmove', (e) => { if (y0 == null) return; const dy = e.touches[0].clientY - y0; drawer.style.transform = dy > 0 ? `translateY(${Math.min(dy, 160)}px)` : ''; }, { passive: true });
  head.addEventListener('touchend', (e) => { const dy = (e.changedTouches[0]?.clientY ?? y0) - (y0 ?? 0); drawer.style.transform = ''; if (y0 != null && dy > 70) toggleChat(false); y0 = null; });
  document.body.append(drawer);
  document.body.classList.toggle('chat-open', chatOpen);
  onSocial(paintChat);
  paintChat();
  return drawer;
}
export function toggleChat(force) {
  chatOpen = force == null ? !chatOpen : force;
  try { localStorage.setItem(CHAT_KEY, chatOpen ? '1' : '0'); } catch { /* ignore */ }
  if (!drawer) mountChat();
  drawer.hidden = !chatOpen;
  document.body.classList.toggle('chat-open', chatOpen);
  if (chatOpen) { unread = 0; paintChat(); list.scrollTop = list.scrollHeight; drawer.querySelector('input')?.focus(); }
  if (btn) btn.setAttribute('aria-pressed', String(chatOpen));
  paintChat();
}
export function chatButton() {
  unreadBadge = h('span', { class: 'badge', hidden: true }, '0');
  btn = h('button', { type: 'button', class: 'icon-btn chat-btn', title: 'Chat', 'aria-label': 'Toggle chat', 'aria-pressed': String(chatOpen), onClick: () => toggleChat() }, svgUse('ph-chat-circle-dots'), unreadBadge);
  paintChat();
  return btn;
}
export function closeChatForLogout() { if (drawer) { drawer.hidden = true; document.body.classList.remove('chat-open'); } }
