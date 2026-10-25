// Wallet sheet: deposit (daily play-money allowance, or from the vault), withdraw (to the vault), history.
import { api, user, me } from './api.js';
import { h, button, svgUse, fmt, fmtSigned, toast } from './ui.js';
import { sound, sleep, countTo } from './fx.js';
import { tierById } from '../shared/tiers.js';

const TYPE_LABEL = { deposit: 'Deposit', withdraw: 'Withdraw', vault_in: 'From vault', refill: 'Refill' };

export async function openWallet(initialTab = 'deposit') {
  if (!user()) { location.hash = '#/login'; return; }
  let w;
  try { w = await api.wallet(); } catch (e) { toast(e.message, 'bad'); return; }
  let tab = initialTab, busy = false;
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape' && !busy) close(); };

  const tabs = h('div', { class: 'tabs wtabs', role: 'tablist' });
  const body = h('div', { class: 'wbody' });
  const head = h('div', { class: 'whead' }, h('div', { class: 'wtitle' }, svgUse('ph-wallet'), h('b', {}, 'Wallet')), h('button', { type: 'button', class: 'wclose', 'aria-label': 'Close', onClick: () => { if (!busy) close(); } }, svgUse('ph-x')));
  const balances = h('div', { class: 'wbalances' });
  const sheet = h('div', { class: 'wsheet', role: 'dialog', 'aria-modal': 'true' }, head, balances, tabs, body);
  const bg = h('div', { class: 'modal-bg', onClick: (e) => { if (e.target === bg && !busy) close(); } }, sheet);

  let curve = null; // balance after each of the last rounds, oldest first
  const sparkline = () => {
    const pts = curve && curve.length > 1 ? curve : [w.balance, w.balance];
    const lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
    const W = 160, H = 44;
    const xy = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - 4 - ((v - lo) / span) * (H - 8)]);
    const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const up = pts[pts.length - 1] >= pts[0];
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', `wspark ${up ? 'up' : 'down'}`); svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = `<defs><linearGradient id="wsg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".35"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><path class="fill" d="${d} L${W} ${H} L0 ${H} Z" fill="url(#wsg)"/><path class="line" d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${xy[xy.length - 1][0]}" cy="${xy[xy.length - 1][1]}" r="3" fill="currentColor"/>`;
    return svg;
  };
  const paintBalances = () => {
    const m = me(), t = tierById(m?.rewards?.tier);
    const delta = curve && curve.length > 1 ? curve[curve.length - 1] - curve[0] : null;
    balances.replaceChildren(
      h('div', { class: 'wstrip' },
        h('div', {},
          h('div', { class: 'l' }, 'Balance'),
          h('div', { class: 'wbig num' }, fmt(w.balance), h('small', {}, 'AGT')),
          h('div', { class: 'wsub' }, h('span', { style: { color: t.colour } }, svgUse('ph-medal'), t.name), h('i'), `Vault ${fmt(w.vault)}`, h('i'), `Deposited ${fmt(w.deposited)}`)),
        h('div', { class: 'wshow-side' }, sparkline(), h('span', { class: `wdelta num ${delta > 0 ? 'good' : delta < 0 ? 'bad' : ''}` }, delta == null ? 'no bets yet' : `${fmtSigned(delta)} last ${curve.length - 1} bets`))));
  };
  // the curve: walk back from the current balance through the last rounds' nets
  api.rounds(40).then((r) => { const nets = r.rounds.map((x) => x.net ?? ((x.payout ?? 0) - x.amount)); let b = w.balance; const pts = [b]; for (const n of nets) { b -= n; pts.push(b); } curve = pts.reverse(); paintBalances(); }).catch(() => {});

  const paintTabs = () => tabs.replaceChildren(...['deposit', 'withdraw', 'history'].map((t) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === t), onClick: () => { if (busy) return; tab = t; sound.play('tick'); paintTabs(); paintBody(); } }, t[0].toUpperCase() + t.slice(1))));

  /** One huge centred amount, the way every wallet app draws it. */
  function amountHero({ max, onChange }) {
    const input = h('input', { type: 'number', inputmode: 'decimal', min: '1', step: '1', placeholder: '0', 'aria-label': 'Amount', autocomplete: 'off' });
    const fit = () => { const n = (input.value || '0').length; input.style.fontSize = `${n > 7 ? 40 : n > 5 ? 48 : 60}px`; };
    input.addEventListener('input', () => { fit(); onChange(Number(input.value)); });
    const quick = h('div', { class: 'wquick' }, ...[100, 250, 500, 'max'].map((q) => h('button', { type: 'button', class: 'wchip', onClick: () => { input.value = String(q === 'max' ? Math.floor(max() * 100) / 100 : Math.min(q, max())); fit(); onChange(Number(input.value)); sound.play('tick'); } }, q === 'max' ? 'Max' : String(q))));
    const el = h('div', { class: 'whero' }, h('div', { class: 'wfield' }, input, h('span', { class: 'wunit' }, 'AGT')), h('div', { class: 'wreal' }, 'play money · worth €0.00'), quick);
    fit();
    return { el, input, reset() { input.value = ''; fit(); } };
  }
  /** A list row with a chevron: icon, title, subtitle. `onClick` makes it a button. */
  const row = ({ icon, title, sub, right = null, onClick = null }) => h(onClick ? 'button' : 'div', { type: onClick ? 'button' : null, class: 'wlrow', onClick },
    h('span', { class: 'wlicon' }, svgUse(icon)), h('span', { class: 'wltext' }, h('b', {}, title), h('small', {}, sub)), right ?? (onClick ? svgUse('ph-caret-right', 'wlchev') : null));
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
      h('div', { class: 'row', style: { justifyContent: 'center' } }, button(cta || 'Done', { kind: 'primary', onClick: close }), button('Another', { kind: 'tertiary', onClick: paintBody }))));
    sound.play('cashout');
  }

  function paintBody() {
    body.replaceChildren();
    if (tab === 'deposit') {
      let amt = 0, source = w.vault > 0 ? 'vault' : 'faucet';
      const stage = h('div', { class: 'wstage' });
      const max = () => (source === 'vault' ? w.vault : w.faucetAvailable);
      const hero = amountHero({ max, onChange: (v) => { amt = v; update(); } });
      const go = button('Deposit', { kind: 'primary', size: 'lg block', disabled: true, onClick: async () => {
        if (busy) return; sound.play('click');
        try {
          await processing(stage, ['Request signed', 'Broadcast to the play-money network', 'Confirmed · 1 of 1']);
          const res = await api.deposit(amt, source); w = res; paintBalances();
          receipt(stage, { title: 'Deposit complete', amount: amt, txid: res.history[0]?.txid || '', note: source === 'faucet' ? `Lifetime deposited: ${fmt(w.deposited)} AGT. This number only ever goes up.` : null, cta: 'Play' });
        } catch (e) { toast(e.message, 'bad'); render(); }
      } });
      const update = () => { go.disabled = !(amt >= 1 && amt <= max()); go.querySelector('span').textContent = amt >= 1 ? `Deposit ${fmt(amt)} AGT` : 'Deposit'; };
      const sourceRow = () => row({ icon: source === 'vault' ? 'ph-lock' : 'ph-hand-coins', title: source === 'vault' ? 'From your vault' : 'From the daily allowance', sub: source === 'vault' ? `${fmt(w.vault)} AGT in the vault` : `${fmt(w.faucetAvailable, 0)} of ${fmt(w.faucetPerDay, 0)} left today`, onClick: w.vault > 0 ? () => { source = source === 'vault' ? 'faucet' : 'vault'; amt = 0; hero.reset(); update(); render(); sound.play('tick'); } : null });
      const render = () => { stage.replaceChildren(hero.el, sourceRow(), go, h('p', { class: 'wfine' }, 'No fee · arrives instantly · 1,000 AGT a day · no cash value'), addressRow(w.address, 'Deposit address')); update(); };
      render(); body.append(stage);
    } else if (tab === 'withdraw') {
      let amt = 0;
      const stage = h('div', { class: 'wstage' });
      const hero = amountHero({ max: () => w.balance, onChange: (v) => { amt = v; update(); } });
      const go = button('Withdraw', { kind: 'primary', size: 'lg block', disabled: true, onClick: async () => {
        if (busy) return; sound.play('click');
        try {
          await processing(stage, ['Request signed', 'Moved to your vault', 'Confirmed · 1 of 1']);
          const res = await api.withdraw(amt); w = res; paintBalances();
          receipt(stage, { title: 'Withdrawal complete', amount: amt, txid: res.history[0]?.txid || '', note: `Vault balance: ${fmt(w.vault)} AGT. Tokens in the vault cannot be bet until you deposit them back.` });
        } catch (e) { toast(e.message, 'bad'); render(); }
      } });
      const update = () => { go.disabled = !(amt >= 1 && amt <= w.balance); go.querySelector('span').textContent = amt >= 1 ? `Withdraw ${fmt(amt)} AGT` : 'Withdraw'; };
      const render = () => { stage.replaceChildren(hero.el, row({ icon: 'ph-lock', title: 'To your vault', sub: `${fmt(w.vault)} AGT there now · ${fmt(w.balance)} available` }), go, h('p', { class: 'wfine' }, 'Tokens in the vault cannot be bet. Moving them out of play is the one move the house never promotes.'), addressRow(w.address, 'Vault address')); update(); };
      render(); body.append(stage);
    } else {
      body.append(w.history.length ? h('div', { class: 'whist' }, ...w.history.map((e) => h('div', { class: 'wrow' },
        h('span', { class: `wicon ${e.type}` }, svgUse(e.type === 'withdraw' ? 'ph-arrow-up' : 'ph-arrow-down')),
        h('div', { class: 'wmeta' }, h('b', {}, TYPE_LABEL[e.type] || e.type), h('span', {}, new Date(e.at).toLocaleString(), ' · ', h('code', {}, e.txid.slice(0, 10)))),
        h('span', { class: `wamt2 num ${e.type === 'withdraw' ? '' : 'good'}` }, `${e.type === 'withdraw' ? '−' : '+'}${fmt(e.amount)}`))))
        : h('div', { class: 'wempty' }, svgUse('ph-receipt'), h('b', {}, 'No transactions yet'), h('span', {}, 'Deposits and withdrawals show up here.')));
    }
  }
  paintBalances(); paintTabs(); paintBody();
  document.body.append(bg); document.addEventListener('keydown', onKey);
  sound.play('click');
}
