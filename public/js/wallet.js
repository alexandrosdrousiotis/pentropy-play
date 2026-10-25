// Wallet sheet: deposit (daily play-money allowance, or from the vault), withdraw (to the vault), history.
import { api, user, me } from './api.js';
import { h, button, svgUse, fmt, fmtSigned, toast } from './ui.js';
import { sound, sleep, countTo } from './fx.js';
import { tierById } from '../shared/tiers.js';

const TYPE_LABEL = { deposit: 'Deposit', withdraw: 'Withdraw', vault_in: 'From vault', refill: 'Refill' };

export async function openWallet(initialTab = 'home') {
  if (!user()) { location.hash = '#/login'; return; }
  let w;
  try { w = await api.wallet(); } catch (e) { toast(e.message, 'bad'); return; }
  let view = initialTab === 'history' ? 'history' : initialTab === 'withdraw' ? 'withdraw' : initialTab === 'deposit' ? 'deposit' : 'home', busy = false;
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape' && !busy) close(); };
  const TITLE = { home: 'Wallet', deposit: 'Deposit', withdraw: 'Withdraw', history: 'Transactions' };
  const back = h('button', { type: 'button', class: 'wclose wback', 'aria-label': 'Back', onClick: () => { if (!busy) go('home'); } }, svgUse('ph-caret-left'));
  const title = h('b', {}, 'Wallet');
  const head = h('div', { class: 'whead' }, h('div', { class: 'wtitle' }, back, title), h('button', { type: 'button', class: 'wclose', 'aria-label': 'Close', onClick: () => { if (!busy) close(); } }, svgUse('ph-x')));
  const body = h('div', { class: 'wbody' });
  const sheet = h('div', { class: 'wsheet', role: 'dialog', 'aria-modal': 'true' }, head, body);
  const bg = h('div', { class: 'modal-bg', onClick: (e) => { if (e.target === bg && !busy) close(); } }, sheet);
  let rounds = null; // settled rounds, newest first
  const nets = (n) => (rounds || []).slice(0, n).map((x) => x.net ?? ((x.payout ?? 0) - x.amount));
  const curveOf = (n) => { let b = w.balance; const pts = [b]; for (const v of nets(n)) { b -= v; pts.push(b); } return pts.reverse(); };
  function sparkline(pts, W = 360, H = 72) {
    if (pts.length < 2) pts = [w.balance, w.balance];
    const lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
    const xy = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - 3 - ((v - lo) / span) * (H - 6)]);
    const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const up = pts[pts.length - 1] >= pts[0];
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('class', `wspark ${up ? 'up' : 'down'}`); svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = `<defs><linearGradient id="wsg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".28"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><path d="${d} L${W} ${H} L0 ${H} Z" fill="url(#wsg)"/><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
    return svg;
  }
  const row = ({ icon, title, sub, right = null, onClick = null, tone = '' }) => h(onClick ? 'button' : 'div', { type: onClick ? 'button' : null, class: `wlrow ${tone}`, onClick },
    h('span', { class: 'wlicon' }, svgUse(icon)), h('span', { class: 'wltext' }, h('b', {}, title), sub ? h('small', {}, sub) : null), right != null ? h('span', { class: 'wlright num' }, right) : null, onClick ? svgUse('ph-caret-right', 'wlchev') : null);
  const txRow = (e) => h('div', { class: 'wlrow' },
    h('span', { class: `wlicon ${e.type === 'withdraw' ? '' : 'in'}` }, svgUse(e.type === 'withdraw' ? 'ph-arrow-up' : 'ph-arrow-down')),
    h('span', { class: 'wltext' }, h('b', {}, TYPE_LABEL[e.type] || e.type), h('small', {}, `${new Date(e.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · ${e.txid.slice(0, 8)}`)),
    h('span', { class: `wlright num ${e.type === 'withdraw' ? '' : 'good'}` }, `${e.type === 'withdraw' ? '−' : '+'}${fmt(e.amount)}`));

  /* ---- home: the balance, the curve, four actions, the accounts, the last transactions ---- */
  let range = 40;
  function home() {
    const m = me(), t = tierById(m?.rewards?.tier);
    const pts = curveOf(range), delta = pts.length > 1 ? pts[pts.length - 1] - pts[0] : 0, base = pts[0] || w.balance;
    const pct = base > 0 ? (delta / base) * 100 : 0;
    const chart = h('div', { class: 'wchart' }, sparkline(pts));
    const ranges = h('div', { class: 'wranges' }, ...[[10, '10 bets'], [40, '40 bets'], [200, '200 bets']].map(([n, l]) => h('button', { type: 'button', 'aria-pressed': String(range === n), onClick: () => { range = n; paint(); } }, l)));
    const act = (icon, label, onClick) => h('button', { type: 'button', class: 'wact', onClick }, h('span', {}, svgUse(icon)), label);
    return h('div', { class: 'whome' },
      h('div', { class: 'whb' },
        h('div', { class: 'l' }, `Available to play · ${t.name}`),
        h('div', { class: 'wbig num' }, fmt(w.balance), h('small', {}, 'AGT')),
        h('div', { class: `wchg num ${delta > 0 ? 'good' : delta < 0 ? 'bad' : ''}` }, rounds && rounds.length ? `${fmtSigned(delta)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%) over the last ${Math.min(range, rounds.length)} bets` : 'No bets yet. The curve starts with your first one.')),
      chart, ranges,
      h('div', { class: 'wacts' },
        act('ph-plus', 'Deposit', () => go('deposit')),
        act('ph-arrow-up', 'Withdraw', () => go('withdraw')),
        act('ph-gift', 'Rebates', () => { close(); location.hash = '#/rebates'; }),
        act('ph-clock-counter-clockwise', 'History', () => go('history'))),
      h('div', { class: 'wsection' }, h('div', { class: 'wsh' }, 'Accounts'),
        h('div', { class: 'wlist' },
          row({ icon: 'ph-coins', title: 'Balance', sub: 'in play', right: fmt(w.balance) }),
          row({ icon: 'ph-lock', title: 'Vault', sub: w.vault > 0 ? 'safe from bets · tap to deposit back' : 'nothing set aside', right: fmt(w.vault), onClick: w.vault > 0 ? () => go('deposit', 'vault') : null }),
          row({ icon: 'ph-hand-coins', title: 'Daily allowance', sub: `${fmt(w.faucetPerDay, 0)} a day · resets at midnight`, right: `${fmt(w.faucetAvailable, 0)} left`, onClick: () => go('deposit', 'faucet') }))),
      h('div', { class: 'wsection' }, h('div', { class: 'wsh' }, 'Transactions', w.history.length > 3 ? h('button', { type: 'button', class: 'wsee', onClick: () => go('history') }, 'See all') : null),
        w.history.length ? h('div', { class: 'wlist' }, ...w.history.slice(0, 3).map(txRow)) : h('div', { class: 'wlrow muted' }, h('span', { class: 'wlicon' }, svgUse('ph-receipt')), h('span', { class: 'wltext' }, h('b', {}, 'No transactions yet')))));
  }

  /* ---- deposit and withdraw: one big amount, chips, one source row, one button ---- */
  function amountHero({ max, onChange }) {
    const input = h('input', { type: 'number', inputmode: 'decimal', min: '1', step: '1', placeholder: '0', 'aria-label': 'Amount', autocomplete: 'off' });
    const fit = () => { const n = (input.value || '0').length; input.style.fontSize = `${n > 7 ? 40 : n > 5 ? 48 : 60}px`; };
    input.addEventListener('input', () => { fit(); onChange(Number(input.value)); });
    const quick = h('div', { class: 'wquick' }, ...[100, 250, 500, 'max'].map((q) => h('button', { type: 'button', class: 'wchip', onClick: () => { input.value = String(q === 'max' ? Math.floor(max() * 100) / 100 : Math.min(q, max())); fit(); onChange(Number(input.value)); sound.play('tick'); } }, q === 'max' ? 'Max' : String(q))));
    const el = h('div', { class: 'whero' }, h('div', { class: 'wfield' }, input), h('div', { class: 'wreal' }, 'play money · worth €0.00'), quick);
    fit();
    return { el, input, reset() { input.value = ''; fit(); }, focus() { input.focus(); } };
  }
  const addressRow = (address, label) => {
    const copy = button('Copy', { kind: 'tertiary', size: 'sm', onClick: async () => { try { await navigator.clipboard.writeText(address); toast('Address copied.', 'good'); } catch { toast(address); } } });
    return h('details', { class: 'wdetails' }, h('summary', {}, svgUse('ph-link'), label, svgUse('ph-caret-right', 'wlchev')), h('div', { class: 'waddr-row' }, h('code', { class: 'waddr' }, address), copy));
  };
  async function processing(stage, lines) {
    busy = true;
    const steps = lines.map((t) => h('div', { class: 'wstep' }, h('span', { class: 'dot' }), t));
    stage.replaceChildren(h('div', { class: 'wprocessing' }, ...steps));
    for (const s of steps) { await sleep(420); s.classList.add('done'); sound.play('tick'); }
    await sleep(250);
    busy = false;
  }
  function receipt(stage, { title, amount, txid, note, cta }) {
    stage.replaceChildren(h('div', { class: 'wreceipt' },
      h('span', { class: 'wcheck' }, svgUse('ph-check')),
      h('h3', {}, title), h('div', { class: 'wamt num' }, `${fmt(amount)} AGT`),
      h('div', { class: 'wtx' }, 'tx ', h('code', {}, txid)), note && h('p', { class: 'help' }, note),
      h('div', { class: 'row', style: { justifyContent: 'center' } }, button(cta || 'Done', { kind: 'primary', onClick: close }), button('Back to wallet', { kind: 'tertiary', onClick: () => go('home') }))));
    sound.play('cashout');
  }
  let preferSource = null;
  function deposit() {
    let amt = 0, source = preferSource || (w.vault > 0 ? 'vault' : 'faucet'); preferSource = null;
    const stage = h('div', { class: 'wstage' });
    const max = () => (source === 'vault' ? w.vault : w.faucetAvailable);
    const hero = amountHero({ max, onChange: (v) => { amt = v; update(); } });
    const goBtn = button('Deposit', { kind: 'primary', size: 'lg block', disabled: true, onClick: async () => {
      if (busy) return; sound.play('click');
      try {
        await processing(stage, ['Request signed', 'Broadcast to the play-money network', 'Confirmed · 1 of 1']);
        const res = await api.deposit(amt, source); w = res;
        receipt(stage, { title: 'Deposit complete', amount: amt, txid: res.history[0]?.txid || '', note: source === 'faucet' ? `Lifetime deposited: ${fmt(w.deposited)} AGT. This number only ever goes up.` : null, cta: 'Play' });
      } catch (e) { toast(e.message, 'bad'); render(); }
    } });
    const update = () => { goBtn.disabled = !(amt >= 1 && amt <= max()); goBtn.querySelector('span').textContent = amt >= 1 ? `Deposit ${fmt(amt)} AGT` : 'Deposit'; };
    const sourceRow = () => row({ icon: source === 'vault' ? 'ph-lock' : 'ph-hand-coins', title: source === 'vault' ? 'From your vault' : 'From the daily allowance', sub: source === 'vault' ? `${fmt(w.vault)} AGT in the vault` : `${fmt(w.faucetAvailable, 0)} of ${fmt(w.faucetPerDay, 0)} left today`, onClick: w.vault > 0 ? () => { source = source === 'vault' ? 'faucet' : 'vault'; amt = 0; hero.reset(); update(); render(); sound.play('tick'); } : null });
    const render = () => { stage.replaceChildren(hero.el, sourceRow(), goBtn, h('p', { class: 'wfine' }, 'No fee · arrives instantly · 1,000 AGT a day · no cash value'), addressRow(w.address, 'Deposit address')); update(); };
    render(); setTimeout(() => hero.focus(), 50);
    return stage;
  }
  function withdraw() {
    let amt = 0;
    const stage = h('div', { class: 'wstage' });
    const hero = amountHero({ max: () => w.balance, onChange: (v) => { amt = v; update(); } });
    const goBtn = button('Withdraw', { kind: 'primary', size: 'lg block', disabled: true, onClick: async () => {
      if (busy) return; sound.play('click');
      try {
        await processing(stage, ['Request signed', 'Moved to your vault', 'Confirmed · 1 of 1']);
        const res = await api.withdraw(amt); w = res;
        receipt(stage, { title: 'Withdrawal complete', amount: amt, txid: res.history[0]?.txid || '', note: `Vault balance: ${fmt(w.vault)} AGT. Tokens in the vault cannot be bet until you deposit them back.` });
      } catch (e) { toast(e.message, 'bad'); render(); }
    } });
    const update = () => { goBtn.disabled = !(amt >= 1 && amt <= w.balance); goBtn.querySelector('span').textContent = amt >= 1 ? `Withdraw ${fmt(amt)} AGT` : 'Withdraw'; };
    const render = () => { stage.replaceChildren(hero.el, row({ icon: 'ph-lock', title: 'To your vault', sub: `${fmt(w.vault)} AGT there now · ${fmt(w.balance)} available` }), goBtn, h('p', { class: 'wfine' }, 'Tokens in the vault cannot be bet. Moving them out of play is the one move the house never promotes.'), addressRow(w.address, 'Vault address')); update(); };
    render(); setTimeout(() => hero.focus(), 50);
    return stage;
  }
  const history = () => (w.history.length ? h('div', { class: 'wlist' }, ...w.history.map(txRow)) : h('div', { class: 'wempty' }, svgUse('ph-receipt'), h('b', {}, 'No transactions yet'), h('span', {}, 'Deposits and withdrawals show up here.')));

  function go(v, source = null) { if (source) preferSource = source; view = v; sound.play('tick'); paint(); }
  function paint() {
    title.textContent = TITLE[view]; back.hidden = view === 'home'; sheet.dataset.view = view;
    body.replaceChildren(view === 'home' ? home() : view === 'deposit' ? deposit() : view === 'withdraw' ? withdraw() : history());
  }
  api.rounds(200).then((r) => { rounds = r.rounds; if (view === 'home') paint(); }).catch(() => {});
  paint();
  document.body.append(bg); document.addEventListener('keydown', onKey);
  sound.play('click');
}
