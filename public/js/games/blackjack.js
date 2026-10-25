import { h, button, cardEl, outcomeBanner, resultsStrip, fmt } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, tryAct, openRoundFor } from './common.js';
import { bjTotal } from '../../shared/math.js';
import { dealFrom, sleep, sound, shake, flashGreen, flashRed, winBurst } from '../fx.js';
import { attach as attachAuto } from './autobet.js';

export function mount(root, meta) {
  const L = layout(root);
  let round = null, busy = false, dead = false, lastSettled = null;
  const amount = betAmount(10, () => reality.update());
  const deal = button('Deal', { kind: 'primary', size: 'lg block', onClick: () => start() });
  const actions = h('div', { class: 'stack' });
  L.controls.append(amount, deal, actions);

  const shoe = h('div', { class: 'shoe', 'aria-hidden': 'true' });
  const dealerEl = h('div', { class: 'hand' });
  const dealerBubble = h('span', { class: 'bubble' }, 'Dealer');
  const playerEl = h('div', { class: 'row', style: { justifyContent: 'center', gap: '28px', alignItems: 'flex-start' } });
  L.board.classList.add('table-felt');
  L.stage.append(shoe, h('div', { class: 'stack', style: { gap: '20px', width: '100%', justifyItems: 'center' } }, dealerBubble, dealerEl, playerEl));
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(h('h3', {}, 'Recent hands'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => ({ rtp: 0.9943, note: 'The ceiling is 2.5x and the edge is 0.57%. Even the best odds in the building are odds against you: every 100 AGT wagered costs 0.57 on average, more with every deviation from basic strategy.' }));
  L.reality.append(reality);

  // DOM state: persistent card elements so new cards animate in and nothing re-renders
  let dealerCards = [], hands = []; // hands: [{ wrap, handEl, bubble, cards: [] }]
  let holeShown = false;

  const totalOf = (cards) => { const t = bjTotal(cards); return `${t.soft && t.total <= 21 ? 'soft ' : ''}${t.total}`; };
  function handWrap(i) {
    const handEl = h('div', { class: 'hand' });
    const bubble = h('span', { class: 'bubble' }, '');
    const wrap = h('div', { class: 'stack fx-rise', style: { gap: '8px', justifyItems: 'center' } }, handEl, bubble);
    return { wrap, handEl, bubble, cards: [] };
  }
  async function addCard(target, card, { faceDown = false, delay = 0 } = {}) {
    const el = cardEl(card, { faceDown: true });
    target.handEl.append(el);
    target.cards.push(el);
    sound.play('deal');
    await dealFrom(el, shoe, { delay, flipUp: !faceDown });
    return el;
  }
  function syncBubbles(v) {
    v.hands.forEach((hd, i) => {
      const b = hands[i]?.bubble; if (!b) return;
      const t = bjTotal(hd.cards).total;
      b.textContent = `${totalOf(hd.cards)}${hd.doubled ? ' · doubled' : ''} · ${fmt(round.base * hd.stake)} AGT`;
      b.className = `bubble${t > 21 ? ' bust' : ''}${v.phase === 'play' && v.hands.length > 1 && i === v.active ? ' active' : ''}`;
      hands[i].wrap.style.opacity = v.phase === 'play' && v.hands.length > 1 && i !== v.active && !hd.done ? '.6' : '1';
    });
    dealerBubble.textContent = v.phase === 'settled' ? `Dealer · ${bjTotal(v.dealer).total}${bjTotal(v.dealer).total > 21 ? ' bust' : ''}` : `Dealer · ${v.dealerTotal} showing`;
    dealerBubble.className = `bubble${v.phase === 'settled' && bjTotal(v.dealer).total > 21 ? ' bust' : ''}`;
    if (v.insurance) dealerBubble.textContent += ` · insured ${fmt(round.base * v.insurance)}`;
  }
  function renderActions(v) {
    actions.replaceChildren();
    if (v.phase === 'insurance') {
      actions.append(h('p', { class: 'help warn' }, `Dealer shows an Ace. Insurance costs ${fmt(round.base / 2)} AGT and pays 2:1 if the dealer has blackjack. It is a side bet with a 7.4% house edge.`),
        h('div', { class: 'two' }, button('Take insurance', { kind: 'tertiary', onClick: () => act('insurance', { take: true }) }), button('No insurance', { kind: 'accent', onClick: () => act('insurance', { take: false }) })));
    } else if (v.phase === 'play') {
      const can = v.can;
      actions.append(h('div', { class: 'two' },
        button('Hit', { kind: 'accent', disabled: !can.includes('hit'), onClick: () => act('hit') }),
        button('Stand', { kind: 'tertiary', disabled: !can.includes('stand'), onClick: () => act('stand') }),
        button('Double', { kind: 'orange', disabled: !can.includes('double'), onClick: () => act('double') }),
        button('Split', { kind: 'purple', disabled: !can.includes('split'), onClick: () => act('split') })));
    }
    deal.disabled = Boolean(round); amount.setDisabled(Boolean(round));
  }

  /** Bring the table to match `v`, animating whatever is new. */
  async function reconcile(v, { initial = false } = {}) {
    // split: hands went from 1 to 2 → rebuild player area
    if (v.hands.length !== hands.length) {
      playerEl.replaceChildren(); hands = [];
      for (let i = 0; i < v.hands.length; i++) { const hw = handWrap(i); hands.push(hw); playerEl.append(hw.wrap); }
      for (let i = 0; i < v.hands.length; i++) for (const c of v.hands[i].cards) await addCard(hands[i], c, { delay: 0 });
    } else {
      for (let i = 0; i < v.hands.length; i++) {
        const hw = hands[i];
        for (let k = hw.cards.length; k < v.hands[i].cards.length; k++) await addCard(hw, v.hands[i].cards[k]);
      }
    }
    // dealer: the server sends only the up card while the hand is live; a face-down placeholder sits beside it
    const dealerTarget = { handEl: dealerEl, cards: dealerCards };
    if (initial) {
      await addCard(dealerTarget, v.dealer[0], { delay: 0 });
      await addCard(dealerTarget, null, { faceDown: true });
      holeShown = false;
    }
    if (v.phase === 'settled') {
      const hole = dealerCards[1];
      if (hole && !holeShown) { hole.setCard(v.dealer[1]); await sleep(150); sound.play('flip'); hole.flip(true); holeShown = true; await sleep(420); }
      for (let k = 2; k < v.dealer.length; k++) { await sleep(120); await addCard(dealerTarget, v.dealer[k]); }
    }
    dealerCards = dealerTarget.cards;
    syncBubbles(v);
  }

  function resetTable() {
    dealerEl.replaceChildren(); playerEl.replaceChildren(); dealerCards = []; hands = [];
    const hw = handWrap(0); hands.push(hw); playerEl.append(hw.wrap);
  }
  async function start() {
    if (busy || round) return;
    busy = true; deal.disabled = true;
    const out = await tryBet('blackjack', amount.get(), {}, { defer: true });
    if (!out) { busy = false; deal.disabled = false; return; }
    banner.hide(); resetTable();
    round = out.round;
    const v = round.status === 'settled' ? viewFromOutcome(round) : round.view;
    renderActions({ phase: 'dealing' });
    // deal order: player, dealer, player, dealer (hole)
    await addCard(hands[0], v.hands[0].cards[0]);
    await addCard({ handEl: dealerEl, cards: dealerCards }, v.dealer[0]);
    await addCard(hands[0], v.hands[0].cards[1]);
    await addCard({ handEl: dealerEl, cards: dealerCards }, null, { faceDown: true });
    holeShown = false;
    syncBubbles(v);
    busy = false;
    if (round.status === 'settled') { await reconcile(v); out.commit(); return finish(round); }
    out.commit(); renderActions(v);
  }
  async function act(name, payload = {}) {
    if (busy || !round) return;
    busy = true; actions.querySelectorAll('button').forEach((b) => (b.disabled = true));
    sound.play('click');
    const out = await tryAct(name, payload, { defer: true });
    if (!out) { busy = false; renderActions(round.view); return; }
    round = out.round;
    const v = round.status === 'settled' ? viewFromOutcome(round) : round.view;
    await reconcile(v);
    busy = false;
    out.commit();
    if (round.status === 'settled') return finish(round);
    renderActions(v);
  }
  function viewFromOutcome(r) {
    const o = r.outcome;
    return { phase: 'settled', dealer: o.dealer, dealerTotal: bjTotal(o.dealer).total, hands: o.hands.map((hd) => ({ ...hd })), active: -1, insurance: o.insurance, can: [] };
  }
  function finish(r) {
    lastSettled = r;
    const reason = { blackjack: 'Blackjack · pays 3:2', dealer_blackjack: 'Dealer blackjack', push: 'Push', showdown: null }[r.outcome.result.reason];
    const net = r.net;
    const text = reason || (net > 0 ? 'You win' : net < 0 ? 'Dealer wins' : 'Push');
    if (net > 0) { sound.play(r.outcome.result.reason === 'blackjack' ? 'bigwin' : 'win'); flashGreen(L.board); if (r.outcome.result.reason === 'blackjack') winBurst(L.board); hands.forEach((hw, i) => { if (bjTotal(r.outcome.hands[i].cards).total <= 21) hw.cards.forEach((c) => c.classList.add('win')); }); }
    else if (net < 0) { sound.play('lose'); }
    banner.show(`${text} · ${net >= 0 ? '+' : '−'}${fmt(Math.abs(net))} AGT`, net > 0 ? true : net === 0 ? 'push' : false);
    strip.push(net > 0 ? `+${fmt(net, 0)}` : net < 0 ? `−${fmt(-net, 0)}` : 'push', net > 0);
    round = null; deal.disabled = false; amount.setDisabled(false); actions.replaceChildren();
  }
  /** Basic strategy, the short table: splits of aces and eights, doubles on 10 and 11, stand on stiff hands against a weak dealer. */
  function basic(v) {
    const hd = v.hands[v.active]; const t = bjTotal(hd.cards); const up = bjTotal([v.dealer[0]]).total; const can = v.can;
    const r1 = hd.cards[0]?.rank, r2 = hd.cards[1]?.rank;
    if (can.includes('split') && hd.cards.length === 2 && r1 === r2 && (r1 === 1 || r1 === 8)) return 'split';
    if (can.includes('double') && !t.soft && (t.total === 11 || (t.total === 10 && up <= 9))) return 'double';
    if (t.soft && t.total <= 21) { if (t.total <= 17) return 'hit'; if (t.total === 18) return up <= 8 ? 'stand' : 'hit'; return 'stand'; }
    if (t.total <= 11) return 'hit';
    if (t.total <= 16) return up <= 6 ? 'stand' : 'hit';
    return 'stand';
  }
  async function playAuto() {
    if (busy || round) return null;
    lastSettled = null;
    await start(); if (!round) return null;
    let guard = 0;
    while (round && guard++ < 14) {
      const v = round.view;
      if (v.phase === 'insurance') await act('insurance', { take: false });
      else if (v.phase === 'play') await act(basic(v));
      else break;
    }
    return lastSettled;
  }
  attachAuto({ panel: L.controls, amount, manual: [deal, actions], playRound: playAuto, canStart: () => (round ? 'Finish the current hand first.' : null), rtp: () => 0.9943, note: 'Auto plays basic strategy: never insures, splits aces and eights, doubles on 10 and 11, stands on stiff hands when the dealer shows a six or less.' });
  const existing = openRoundFor('blackjack');
  resetTable();
  if (existing) { round = existing; amount.set(existing.amount); reconcile(existing.view, { initial: true }).then(() => renderActions(existing.view)); }
  else { dealerEl.append(cardEl(null, { back: true }), cardEl(null, { back: true })); hands[0].handEl.append(cardEl(null, { back: true }), cardEl(null, { back: true })); dealerBubble.textContent = 'Dealer'; hands[0].bubble.textContent = 'You'; }
  return { unmount() { dead = true; } };
}
