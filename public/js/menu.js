// The avatar menu and the settings modal: account things happen in place, not on another page.
import { api, me, sessionNet, sessionMinutes } from './api.js';
import { h, svgUse, button, fmt, fmtSigned, fmtAgt, modal, toast, numberInput } from './ui.js';
import { tierById } from '../shared/tiers.js';
import { openWallet } from './wallet.js';
import { sound } from './fx.js';
import * as edu from './edu.js';

let pop = null;
function closeMenu() { if (!pop) return; pop.remove(); pop = null; document.removeEventListener('click', onDoc, true); document.removeEventListener('keydown', onKey); }
const onDoc = (e) => { if (pop && !pop.contains(e.target) && !e.target.closest('.avatar')) closeMenu(); };
const onKey = (e) => { if (e.key === 'Escape') closeMenu(); };

/** Popover under the avatar: who you are, what you have, where to go. */
export function userMenu(anchor) {
  if (pop) { closeMenu(); return; }
  const m = me(); if (!m) return;
  const u = m.user, t = tierById(m.rewards?.tier), net = sessionNet();
  const item = (icon, label, onClick, { keep = false, sub = null } = {}) => h('button', { type: 'button', class: 'menu-item', role: 'menuitem', onClick: () => { if (!keep) closeMenu(); onClick(); } }, svgUse(icon), h('span', { class: 'ml' }, label, sub ? h('small', {}, sub) : null));
  const soundItem = () => item(sound.enabled ? 'ph-speaker-high' : 'ph-speaker-slash', sound.enabled ? 'Sound on' : 'Sound off', () => { sound.enabled = !sound.enabled; if (sound.enabled) sound.play('click'); soundItem.el.replaceWith((soundItem.el = soundItem())); }, { keep: true });
  soundItem.el = soundItem();
  pop = h('div', { class: 'menu', role: 'menu' },
    h('div', { class: 'menu-head' }, h('span', { class: 'avatar' }, u.username.slice(0, 2)), h('div', { class: 'stack tight' }, h('b', {}, u.username), h('span', { class: 'tier-badge', style: { color: t.colour } }, svgUse('ph-medal'), `${t.name} · ${(t.rate * 100).toFixed(1)}% rakeback`))),
    h('div', { class: 'menu-bal', 'data-tip': 'Play money. No cash value, ever.' }, h('span', { class: 't-label' }, 'Balance'), h('b', { class: 'num' }, `${fmt(u.balance)} AGT`), h('span', { class: `delta ${net > 0 ? 'up' : net < 0 ? 'down' : ''}` }, `${fmtSigned(net)} this session`)),
    h('div', { class: 'menu-actions' }, button('Deposit', { kind: 'primary', size: 'sm', onClick: () => { closeMenu(); openWallet('deposit'); } }), button('Withdraw', { kind: 'tertiary', size: 'sm', onClick: () => { closeMenu(); openWallet('withdraw'); } })),
    h('div', { class: 'menu-sep' }),
    item('ph-wallet', 'Wallet', () => openWallet('home'), { sub: 'balance, vault, history' }),
    item('ph-gift', 'Rebates', () => { location.hash = '#/rebates'; }, { sub: m.rewards?.chest?.ready && m.rewards.chest.wagered > 0 ? 'chest ready' : 'chest, drips, referrals' }),
    item('ph-chart-bar', 'Statistics', () => { location.hash = '#/stats'; }),
    item('ph-shield-check', 'Fairness', () => { location.hash = '#/fair'; }),
    item('ph-sliders-horizontal', 'Settings', () => accountModal(), { sub: 'limits, ghost mode, account' }),
    soundItem.el,
    h('div', { class: 'menu-sep' }),
    item('ph-sign-out', 'Log out', async () => { await api.logOut(); location.hash = '#/'; }));
  const r = anchor.getBoundingClientRect();
  pop.style.top = `${r.bottom + 8}px`; pop.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
  document.body.append(pop);
  setTimeout(() => { document.addEventListener('click', onDoc, true); document.addEventListener('keydown', onKey); }, 0);
}

/** Limits, ghost mode and the account itself. Used by the settings modal and the account page. */
export function accountBody() {
  const m = me();
  const l = m.user.limits;
  const loss = numberInput({ label: 'Loss limit per session (0 = off)', value: l.lossLimit, min: 0, max: 1000000, step: 10, unit: 'AGT', onChange: () => {} });
  const mins = numberInput({ label: 'Session time limit in minutes (0 = off)', value: l.sessionMinutes, min: 0, max: 1440, step: 5, unit: 'min', onChange: () => {} });
  const every = numberInput({ label: 'Reality check every N bets', value: l.realityEvery, min: 5, max: 500, step: 5, unit: 'bets', onChange: () => {} });
  const saveLimits = button('Save limits', { kind: 'primary', onClick: async () => {
    try { await api.updateProfile({ limits: { lossLimit: Number(loss.input.value), sessionMinutes: Math.round(Number(mins.input.value)), realityEvery: Math.round(Number(every.input.value)) } }); toast('Limits saved. The server enforces them.', 'good'); }
    catch (e) { toast(e.message, 'bad'); }
  } });
  return h('div', { class: 'two settings' },
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
      h('label', { class: 'check-row' }, h('input', { type: 'checkbox', checked: Boolean(m.user.ghost), onChange: async (e) => { try { await api.updateProfile({ ghost: e.target.checked }); toast(e.target.checked ? 'Ghost mode on. The feed shows you as Hidden.' : 'Ghost mode off.', 'good'); } catch (x) { toast(x.message, 'bad'); } } }), h('span', {}, svgUse('ph-ghost', 'inline-ic'), ' Ghost mode: hide my name in the live feed and leaderboard.')),
      h('p', { class: 'help' }, 'We hold a username, a password hash, your seeds and your bet history. Nothing else. Deleting the account removes all of it immediately.'),
      button('Delete account', { kind: 'danger', size: 'sm', onClick: async () => {
        const pass = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'password' });
        const ok = await modal({ title: 'Delete this account?', body: h('div', { class: 'stack' }, h('p', { class: 't-body' }, 'All history, seeds and tokens are erased. This cannot be undone.'), h('div', { class: 'input' }, pass)), actions: [{ label: 'Delete', kind: 'danger', value: 'yes' }, { label: 'Cancel', kind: 'tertiary', value: 'no' }] });
        if (ok !== 'yes') return;
        try { await api.deleteAccount(pass.value); toast('Account deleted.'); location.hash = '#/'; } catch (e) { toast(e.message, 'bad'); }
      } })));
}
export function accountModal() { return modal({ title: 'Settings', body: accountBody(), actions: [{ label: 'Done', kind: 'tertiary', value: 'done' }] }); }
