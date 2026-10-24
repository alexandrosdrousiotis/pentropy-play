import { h, button, cardEl, fmtPct, outcomeBanner, resultsStrip, fmt } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, tryAct, openRoundFor } from './common.js';

export function mount(root, meta) {
  const L = layout(root);
  let round = null, busy = false;
  const amount = betAmount(10, () => reality.update());
  const deal = button('Deal', { kind: 'primary', size: 'lg block', onClick: () => start() });
  const actions = h('div', { class: 'stack' });
  L.controls.append(amount, deal, actions, h('p', { class: 'help' }, 'Infinite shoe, dealer stands on all 17s, blackjack pays 3:2, double on any two cards, one split, insurance pays 2:1. 99.43% with perfect basic strategy.'));

  const dealerEl = h('div', { class: 'hand' });
  const dealerLabel = h('div', { class: 't-label', style: { textAlign: 'center' } }, 'Dealer');
  const playerEl = h('div', { class: 'row', style: { justifyContent: 'center', gap: '24px', alignItems: 'flex-start' } });
  const playerLabel = h('div', { class: 't-label', style: { textAlign: 'center' } }, 'You');
  L.stage.append(h('div', { class: 'stack', style: { gap: '18px', width: '100%' } }, dealerLabel, dealerEl, playerEl, playerLabel));
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(h('h3', {}, 'Recent hands'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => ({ rtp: 0.9943, note: 'The ceiling is 2.5x and the edge is 0.57%. Even the best odds in the building are odds against you: every 100 AGT wagered costs 0.57 on average, more with every deviation from basic strategy.' }));
  L.reality.append(reality);

  function paint() {
    const v = round?.view;
    if (!v) return;
    dealerEl.replaceChildren(...[...v.dealer.map((c) => cardEl(c)), v.phase !== 'settled' ? cardEl(null, { back: true }) : null].flat().filter(Boolean));
    dealerLabel.textContent = `Dealer · ${v.dealerTotal}${v.phase !== 'settled' ? ' showing' : ''}`;
    playerEl.replaceChildren(...v.hands.map((hd, i) => h('div', { class: 'stack', style: { gap: '6px', justifyItems: 'center', opacity: v.hands.length > 1 && i !== v.active && !hd.done ? .7 : 1 } },
      h('div', { class: 'hand' }, ...hd.cards.map((c) => cardEl(c))),
      h('div', { class: 't-desc' }, `${hd.soft && hd.total <= 21 ? 'soft ' : ''}${hd.total}${hd.total > 21 ? ' · bust' : ''}${hd.doubled ? ' · doubled' : ''} · ${fmt(round.base * hd.stake)} AGT`, v.hands.length > 1 && i === v.active && v.phase === 'play' ? ' ◀' : ''))));
    playerLabel.textContent = v.insurance ? `You · insurance ${fmt(round.base * v.insurance)} AGT` : 'You';
    actions.replaceChildren();
    if (v.phase === 'insurance') {
      actions.append(h('p', { class: 'help warn' }, `Dealer shows an Ace. Insurance costs ${fmt(round.base / 2)} AGT and pays 2:1 if the dealer has blackjack. (It is a side bet with a 7.4% house edge.)`),
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
  async function start() {
    if (busy || round) return;
    busy = true;
    const out = await tryBet('blackjack', amount.get(), {});
    busy = false;
    if (!out) return;
    banner.hide();
    if (out.round.status === 'settled') { round = out.round; round.view = viewFromOutcome(out.round); paint(); return finish(out.round); }
    round = out.round; paint();
  }
  async function act(name, payload = {}) {
    if (busy || !round) return;
    busy = true;
    const out = await tryAct(name, payload);
    busy = false;
    if (!out) return;
    round = out.round;
    if (round.status === 'settled') { round.view = viewFromOutcome(round); paint(); return finish(round); }
    paint();
  }
  const total = (cards) => { let t = 0, a = 0; for (const c of cards) { t += c.rank === 1 ? 11 : Math.min(10, c.rank); if (c.rank === 1) a++; } while (t > 21 && a) { t -= 10; a--; } return { total: t, soft: a > 0 }; };
  function viewFromOutcome(r) {
    const o = r.outcome;
    return { phase: 'settled', dealer: o.dealer, dealerTotal: total(o.dealer).total, hands: o.hands.map((hd) => ({ ...hd, ...total(hd.cards) })), active: -1, insurance: o.insurance, can: [] };
  }
  function finish(r) {
    const reason = { blackjack: 'Blackjack! Pays 3:2', dealer_blackjack: 'Dealer blackjack', push: 'Push', showdown: null }[r.outcome.result.reason];
    const net = r.net;
    const text = reason || (net > 0 ? 'You win' : net < 0 ? 'Dealer wins' : 'Push');
    banner.show(`${text} · ${net >= 0 ? '+' : '−'}${fmt(Math.abs(net))} AGT`, net > 0);
    strip.push(net > 0 ? `+${fmt(net, 0)}` : net < 0 ? `−${fmt(-net, 0)}` : 'push', net > 0);
    round = null; deal.disabled = false; amount.setDisabled(false); actions.replaceChildren();
  }
  const existing = openRoundFor('blackjack');
  if (existing) { round = existing; amount.set(existing.amount); paint(); }
  else { dealerEl.replaceChildren(...[cardEl(null, { back: true }), cardEl(null, { back: true })].flat().filter(Boolean)); playerEl.replaceChildren(...[h('div', { class: 'hand' }, cardEl(null, { back: true }), cardEl(null, { back: true }))].flat().filter(Boolean)); }
  return { unmount() {} };
}
