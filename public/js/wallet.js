// Wallet sheet: deposit (daily play-money allowance, or from the vault), withdraw (to the vault), history.
import { api, user, me } from './api.js';
import { h, button, svgUse, fmt, fmtSigned, toast } from './ui.js';
import { sound, sleep, countTo } from './fx.js';

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

  const paintBalances = () => balances.replaceChildren(
    h('div', {}, h('div', { class: 'l' }, 'Balance'), h('div', { class: 'v num' }, fmt(w.balance))),
    h('div', {}, h('div', { class: 'l' }, 'Vault'), h('div', { class: 'v num' }, fmt(w.vault))),
    h('div', {}, h('div', { class: 'l' }, 'Deposited'), h('div', { class: 'v num' }, fmt(w.deposited))),
    h('div', {}, h('div', { class: 'l' }, 'Net of deposits'), h('div', { class: `v num ${w.balance + w.vault - w.deposited - 1000 >= 0 ? 'good' : 'bad'}` }, fmtSigned(w.balance + w.vault - w.deposited - 1000))));

  const paintTabs = () => tabs.replaceChildren(...['deposit', 'withdraw', 'history'].map((t) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === t), onClick: () => { if (busy) return; tab = t; sound.play('tick'); paintTabs(); paintBody(); } }, t[0].toUpperCase() + t.slice(1))));

  /** Big-amount input in the Base style: large number, asset chip, quick amounts. */
  function amountBox({ max, quick, onChange }) {
    const input = h('input', { type: 'number', inputmode: 'decimal', min: '1', step: '1', placeholder: '0', 'aria-label': 'Amount' });
    const row = h('div', { class: 'wamount' }, input, h('span', { class: 'wasset' }, svgUse('ph-coins'), 'AGT'));
    const quicks = h('div', { class: 'wquick' }, ...quick.map((q) => button(q === 'max' ? 'Max' : String(q), { kind: 'tertiary', size: 'sm', onClick: () => { input.value = String(q === 'max' ? Math.floor(max * 100) / 100 : Math.min(q, max)); onChange(Number(input.value)); } })));
    input.addEventListener('input', () => onChange(Number(input.value)));
    return { el: h('div', { class: 'stack', style: { gap: '10px' } }, row, quicks), input };
  }
  function addressBox(address, label) {
    const code = h('code', { class: 'waddr' }, address);
    const copy = button('Copy', { kind: 'tertiary', size: 'sm', onClick: async () => { try { await navigator.clipboard.writeText(address); toast('Address copied.', 'good'); } catch { const r = document.createRange(); r.selectNodeContents(code); getSelection().removeAllRanges(); getSelection().addRange(r); } } });
    return h('div', { class: 'field' }, h('label', {}, label), h('div', { class: 'waddr-row' }, code, copy));
  }
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
      const stage = h('div', { class: 'stack' });
      const sourceSeg = h('div', { class: 'seg block' });
      const paintSource = () => sourceSeg.replaceChildren(
        h('button', { type: 'button', 'aria-pressed': String(source === 'faucet'), onClick: () => { source = 'faucet'; paintSource(); render(); } }, `Daily allowance · ${fmt(w.faucetAvailable, 0)} left`),
        h('button', { type: 'button', 'aria-pressed': String(source === 'vault'), disabled: w.vault <= 0, onClick: () => { source = 'vault'; paintSource(); render(); } }, `Vault · ${fmt(w.vault, 0)}`));
      const box = amountBox({ max: source === 'vault' ? w.vault : w.faucetAvailable, quick: [100, 250, 500, 'max'], onChange: (v) => { amt = v; update(); } });
      const go = button('Deposit', { kind: 'primary', size: 'lg block', disabled: true, onClick: async () => {
        if (busy) return; sound.play('click');
        try {
          await processing(stage, ['Request signed', 'Broadcast to the play-money network', 'Confirmed · 1 of 1']);
          const res = await api.deposit(amt, source); w = res; paintBalances();
          receipt(stage, { title: 'Deposit complete', amount: amt, txid: res.history[0]?.txid || '', note: source === 'faucet' ? `Lifetime deposited: ${fmt(w.deposited)} AGT. This number only ever goes up.` : null, cta: 'Play' });
        } catch (e) { toast(e.message, 'bad'); render(); }
      } });
      const update = () => { const max = source === 'vault' ? w.vault : w.faucetAvailable; go.disabled = !(amt >= 1 && amt <= max); go.querySelector('span').textContent = amt >= 1 ? `Deposit ${fmt(amt)} AGT` : 'Deposit'; };
      const render = () => { amt = 0; box.input.value = ''; update(); stage.replaceChildren(sourceSeg, box.el, addressBox(w.address, 'Your deposit address'), h('div', { class: 'kv' }, h('span', {}, 'Network fee'), h('b', {}, '0.00 AGT')), h('div', { class: 'kv' }, h('span', {}, 'Arrives'), h('b', {}, 'instantly')), go, h('p', { class: 'help' }, 'Play money. Deposits are capped at 1,000 AGT a day and have no cash value.')); };
      paintSource(); render(); body.append(stage);
    } else if (tab === 'withdraw') {
      let amt = 0;
      const stage = h('div', { class: 'stack' });
      const box = amountBox({ max: w.balance, quick: [100, 250, 500, 'max'], onChange: (v) => { amt = v; update(); } });
      const go = button('Withdraw', { kind: 'primary', size: 'lg block', disabled: true, onClick: async () => {
        if (busy) return; sound.play('click');
        try {
          await processing(stage, ['Request signed', 'Moved to your vault', 'Confirmed · 1 of 1']);
          const res = await api.withdraw(amt); w = res; paintBalances();
          receipt(stage, { title: 'Withdrawal complete', amount: amt, txid: res.history[0]?.txid || '', note: `Vault balance: ${fmt(w.vault)} AGT. Tokens in the vault cannot be bet until you deposit them back.` });
        } catch (e) { toast(e.message, 'bad'); render(); }
      } });
      const update = () => { go.disabled = !(amt >= 1 && amt <= w.balance); go.querySelector('span').textContent = amt >= 1 ? `Withdraw ${fmt(amt)} AGT` : 'Withdraw'; };
      const render = () => { amt = 0; box.input.value = ''; update(); stage.replaceChildren(box.el, addressBox(w.address, 'Destination · your vault'), h('div', { class: 'kv' }, h('span', {}, 'Available'), h('b', {}, `${fmt(w.balance)} AGT`)), h('div', { class: 'kv' }, h('span', {}, 'Network fee'), h('b', {}, '0.00 AGT')), go, h('p', { class: 'help' }, 'Moving tokens out of play is the one move the house never promotes. Try it when you are ahead.')); };
      render(); body.append(stage);
    } else {
      body.append(w.history.length ? h('div', { class: 'whist' }, ...w.history.map((e) => h('div', { class: 'wrow' },
        h('span', { class: `wicon ${e.type}` }, svgUse(e.type === 'withdraw' ? 'ph-arrow-up-right' : 'ph-arrow-down-right')),
        h('div', { class: 'wmeta' }, h('b', {}, TYPE_LABEL[e.type] || e.type), h('span', {}, new Date(e.at).toLocaleString(), ' · ', h('code', {}, e.txid.slice(0, 10)))),
        h('span', { class: `wamt2 num ${e.type === 'withdraw' ? '' : 'good'}` }, `${e.type === 'withdraw' ? '−' : '+'}${fmt(e.amount)}`))))
        : h('p', { class: 'help', style: { padding: '20px 0', textAlign: 'center' } }, 'No transactions yet.'));
    }
  }
  paintBalances(); paintTabs(); paintBody();
  document.body.append(bg); document.addEventListener('keydown', onKey);
  sound.play('click');
}
