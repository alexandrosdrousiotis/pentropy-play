// Sign-up and log-in, built the way an acquisition page is built: a welcome package, social proof,
// a referral field and one big button. The copy tells you that is what it is.
import { api } from './api.js';
import { h, svgUse, button, fmt, fmtMult, modal } from './ui.js';
import { gameById } from './games/index.js';
import { REFERRAL } from '../shared/tiers.js';
import { sound, haptic } from './fx.js';

const REF_KEY = 'pentropy.ref';
export const rememberRef = (code) => { if (code && /^[A-Za-z0-9]{8}$/.test(code)) { try { localStorage.setItem(REF_KEY, code.toUpperCase()); } catch { /* ignore */ } } };
const savedRef = () => { try { return localStorage.getItem(REF_KEY) || ''; } catch { return ''; } };

function strength(pw) {
  let s = 0; if (pw.length >= 10) s++; if (pw.length >= 14) s++; if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++; if (/\d/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}

function promo(isSignup, pulseEl, winsEl) {
  const bullets = isSignup ? [
    [`${fmt(1000, 0)} AGT the second you sign up`, 'ph-coins'],
    [`+${REFERRAL.bonus} AGT with a friend's code`, 'ph-gift'],
    ['Hourly, daily and weekly rebates, a chest every 6 hours', 'ph-medal'],
    ['19 provably fair games, 99% RTP originals', 'ph-shield-check'],
    ['Live tables: one Crash flight and one wheel for everyone', 'ph-users-three'],
  ] : [['Your tokens, chest and rebates are where you left them', 'ph-coins'], ['Live tables run around the clock', 'ph-users-three'], ['Provably fair, verify any round in your browser', 'ph-shield-check']];
  return h('section', { class: 'auth-promo' },
    h('div', { class: 'ap-body' },
      h('div', { class: 'eyebrow' }, isSignup ? 'Welcome package' : 'Welcome back'),
      h('h1', {}, isSignup ? '1,000 free tokens. Every game. Real odds.' : 'Pick up where you left off.'),
      h('ul', { class: 'promo-list' }, ...bullets.map(([t, ic]) => h('li', {}, svgUse(ic), t))),
      pulseEl, winsEl,
      h('p', { class: 'promo-fine' }, 'Everything on this page is the real playbook: the package, the counter, the friend code. The tokens are free because they are worth nothing, and the maths inside is the same as on the sites that charge.')));
}

export function authPage(mode, note, { onSwitch = null, onDone = null } = {}) {
  const isSignup = mode === 'signup';
  const userIn = h('input', { type: 'text', autocomplete: 'username', placeholder: 'Pick a username', maxlength: '20', pattern: '[A-Za-z0-9_]{3,20}', required: true, autocapitalize: 'off', spellcheck: 'false' });
  const passIn = h('input', { type: 'password', autocomplete: isSignup ? 'new-password' : 'current-password', placeholder: isSignup ? 'At least 10 characters' : 'Password', minlength: isSignup ? '10' : '1', required: true });
  const meter = h('div', { class: 'pw-meter' }, ...[0, 1, 2, 3].map(() => h('i')));
  passIn.addEventListener('input', () => { const s = strength(passIn.value); meter.className = `pw-meter s${s}`; });
  const refIn = h('input', { type: 'text', placeholder: '8-character code', maxlength: '8', autocapitalize: 'characters', spellcheck: 'false', value: savedRef() });
  const refWrap = h('div', { class: 'field ref-field', hidden: !savedRef() }, h('label', {}, 'Referral code'), h('div', { class: 'input' }, svgUse('ph-gift', 'inline-ic'), refIn), h('p', { class: 'help' }, `A friend's code adds ${REFERRAL.bonus} AGT to your package. They get ${(REFERRAL.rate * 100).toFixed(0)}% of the edge you pay, for as long as you play.`));
  const refToggle = h('button', { type: 'button', class: 'link-btn', hidden: Boolean(savedRef()), onClick: () => { refWrap.hidden = false; refToggle.hidden = true; refIn.focus(); } }, 'Have a referral code?');
  const err = h('p', { class: 'help bad', role: 'alert' });
  const agree = isSignup && h('label', { class: 'check-row' }, h('input', { type: 'checkbox', required: true }), h('span', {}, 'I understand the tokens are play money with no cash value, and that this site exists to show me how the house edge works.'));
  const submit = button(isSignup ? `Create account · claim ${fmt(1000, 0)} AGT` : 'Log in', { kind: 'primary', size: 'xl block', attrs: { type: 'submit' } });
  const form = h('form', { class: 'panel auth', novalidate: false, onSubmit: async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    submit.disabled = true; err.textContent = '';
    try {
      if (isSignup) {
        const ref = refIn.value.trim();
        const out = await api.signUp(userIn.value, passIn.value, ref || undefined);
        rememberRef(''); try { localStorage.removeItem(REF_KEY); } catch { /* ignore */ }
        sound.play('coins'); haptic([10, 30, 10]);
        onDone?.(); location.hash = '#/';
        welcome(out?.welcome || { tokens: 1000, referralBonus: 0 });
      } else { await api.logIn(userIn.value, passIn.value); onDone?.(); location.hash = '#/'; }
    } catch (ex) { err.textContent = ex.message; submit.disabled = false; }
  } },
    h('div', { class: 'auth-head' }, h('h2', {}, isSignup ? 'Create your account' : 'Log in'), isSignup ? h('span', { class: 'tag green' }, svgUse('ph-lightning'), '10 seconds · no email') : null),
    note && h('p', { class: 'help warn' }, note),
    h('div', { class: 'field' }, h('label', {}, 'Username'), h('div', { class: 'input' }, svgUse('ph-user', 'inline-ic'), userIn)),
    h('div', { class: 'field' }, h('label', {}, 'Password'), h('div', { class: 'input' }, svgUse('ph-lock', 'inline-ic'), passIn), isSignup ? meter : null),
    isSignup ? refToggle : null, isSignup ? refWrap : null,
    agree, err, submit,
    isSignup ? h('div', { class: 'auth-trust' }, h('span', {}, svgUse('ph-shield-check'), 'Provably fair'), h('span', {}, svgUse('ph-lock'), 'Nothing to pay, ever'), h('span', {}, svgUse('ph-eye'), 'No email, no tracking')) : null,
    h('p', { class: 'help' }, isSignup ? ['Already have an account? ', h('a', { href: '#/login', onClick: (e) => { if (onSwitch) { e.preventDefault(); onSwitch('login'); } } }, 'Log in')] : ['New here? ', h('a', { href: '#/signup', onClick: (e) => { if (onSwitch) { e.preventDefault(); onSwitch('signup'); } } }, 'Claim 1,000 free tokens')]));
  const pulseEl = h('div', { class: 'promo-pulse' }, h('i', { class: 'dot' }), h('span', {}, 'Loading the room…'));
  const winsEl = h('div', { class: 'promo-wins' });
  api.pulse().then((p) => {
    pulseEl.replaceChildren(h('i', { class: 'dot' }), h('span', {}, h('b', {}, p.online), ' online · ', h('b', {}, p.bets), ' bets in the last hour'));
    winsEl.replaceChildren(...p.wins.slice(0, 4).map((w) => h('span', { class: 'tchip' }, h('b', {}, w.username), ` ${fmtMult(w.multiplier)} on ${gameById(w.game)?.name ?? w.game} `, h('span', { class: 'good' }, `+${fmt(w.net, 0)}`))));
  }).catch(() => { pulseEl.replaceChildren(); });
  return h('div', { class: 'auth-wrap' }, promo(isSignup, pulseEl, winsEl), form);
}

/** The sign-up and log-in sheet: opens over whatever page you are on, switches mode in place. */
let openSheet = null;
export function authModal(mode = 'signup', note = null) {
  if (openSheet) { openSheet.set(mode); return; }
  let current = mode;
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); openSheet = null; if (/^#\/(signup|login)/.test(location.hash)) history.replaceState(null, '', location.pathname + '#/'); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const body = h('div', { class: 'auth-body' });
  const tabs = h('div', { class: 'tabs auth-tabs', role: 'tablist' });
  const set = (m) => {
    current = m;
    tabs.replaceChildren(...[['signup', 'Register'], ['login', 'Log in']].map(([k, label]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(k === current), onClick: () => { if (k !== current) { sound.play('tick'); set(k); } } }, label)));
    body.replaceChildren(authPage(current, current === mode ? note : null, { onSwitch: set, onDone: close }));
    body.querySelector('input')?.focus();
  };
  const sheet = h('div', { class: 'auth-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Account' },
    h('div', { class: 'auth-sheet-head' }, h('span', { class: 'logo' }, h('span', { class: 'mark' }, svgUse('ph-lightning')), h('b', {}, 'Pentropy')), tabs, h('button', { type: 'button', class: 'wclose', 'aria-label': 'Close', onClick: close }, svgUse('ph-x'))),
    body);
  const bg = h('div', { class: 'modal-bg auth-bg', onClick: (e) => { if (e.target === bg) close(); } }, sheet);
  set(mode);
  document.body.append(bg); document.addEventListener('keydown', onKey);
  openSheet = { set, close };
}

function welcome(w) {
  const rows = [
    [svgUse('ph-coins'), `${fmt(w.tokens, 0)} AGT`, 'Starting balance, credited'],
    w.referralBonus ? [svgUse('ph-gift'), `+${fmt(w.referralBonus, 0)} AGT`, `Referral boost from ${w.referrer}`] : null,
    [svgUse('ph-medal'), 'Chest and rebates', 'Both start filling with your first bet'],
    [svgUse('ph-users-three'), 'Invite a friend', `You get ${(REFERRAL.rate * 100).toFixed(0)}% of the edge they pay. That is what every "join with my link" has ever been.`],
  ].filter(Boolean);
  modal({
    title: 'Welcome package credited',
    body: h('div', { class: 'welcome' }, ...rows.map(([ic, big, small]) => h('div', { class: 'welcome-row' }, h('span', { class: 'wi' }, ic), h('div', {}, h('b', {}, big), h('span', {}, small)))),
      h('p', { class: 'help' }, 'Every bet shows what it costs before you place it. The stats page keeps the running total. That is the whole lesson; the games are the practical.')),
    actions: [{ label: 'Play', kind: 'primary', value: 'play' }],
  });
}
