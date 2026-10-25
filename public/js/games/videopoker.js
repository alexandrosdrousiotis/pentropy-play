import { h, button, cardEl, outcomeBanner, resultsStrip, fmt } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, tryAct, payoutLine, openRoundFor } from './common.js';
import { VP_PAYTABLE, cardOf, evaluatePoker } from '../../shared/math.js';
import { dealFrom, sleep, sound, flashGreen, winBurst, pulse, popIn, sparkle } from '../fx.js';
import { attach as attachAuto } from './autobet.js';

export function mount(root, meta) {
  const L = layout(root);
  let round = null, hold = [false, false, false, false, false], busy = false, cards = [], dead = false, lastSettled = null;
  const amount = betAmount(10, () => reality.update());
  const deal = button('Deal', { kind: 'primary', size: 'lg block', onClick: () => start() });
  const draw = button('Draw', { kind: 'accent', size: 'lg block', disabled: true, onClick: () => doDraw() });
  const payEl = h('table', { class: 'paytable' });
  L.controls.append(amount, deal, draw, payEl);

  const shoe = h('div', { class: 'shoe', 'aria-hidden': 'true' });
  const hand = h('div', { class: 'hand', style: { gap: '12px', minHeight: '110px' } });
  const label = h('div', { class: 'bubble' }, 'deal to start');
  L.board.classList.add('table-felt');
  L.stage.append(shoe, h('div', { class: 'stack', style: { gap: '26px', width: '100%', justifyItems: 'center' } }, hand, label));
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(h('h3', {}, 'Recent hands'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => ({ rtp: 0.9954, note: 'A royal flush (800x) shows up about once per 40,000 hands with perfect play. Bad holds cost around 2–5% of RTP each, which is why the real figure for most players is well under 99%.' }));
  L.reality.append(reality);

  function table(hit = null) {
    payEl.replaceChildren(h('thead', {}, h('tr', {}, h('th', {}, 'Hand'), h('th', {}, 'Pays'))), h('tbody', {}, ...VP_PAYTABLE.map(([n, m]) => h('tr', { class: n === hit ? 'hit' : '' }, h('td', {}, n), h('td', {}, `${m}x`)))));
  }
  function toggleHold(i) {
    if (busy || !round) return;
    hold[i] = !hold[i]; cards[i].classList.toggle('held', hold[i]); sound.play('click');
  }
  async function dealHand(initial) {
    hand.replaceChildren(); cards = [];
    for (let i = 0; i < 5; i++) {
      const el = cardEl(initial[i], { faceDown: true, selectable: true, onClick: () => toggleHold(i) });
      hand.append(el); cards.push(el);
    }
    for (let i = 0; i < 5; i++) { if (dead) return; sound.play('deal'); dealFrom(cards[i], shoe, { ms: 420 }); await sleep(110); }
    await sleep(360);
  }
  async function start() {
    if (busy || round) return;
    busy = true; deal.disabled = true; amount.setDisabled(true);
    const out = await tryBet('videopoker', amount.get(), {});
    if (!out) { busy = false; deal.disabled = false; amount.setDisabled(false); return; }
    round = out.round; hold = [false, false, false, false, false]; banner.hide(); table();
    label.textContent = 'dealing'; label.className = 'bubble';
    await dealHand(round.view.hand);
    const now = evaluatePoker(round.view.hand);
    label.textContent = now ? `Dealt: ${now}. Choose what to hold.` : 'Choose what to hold.';
    if (now) pulse(label);
    busy = false; draw.disabled = false;
  }
  async function doDraw() {
    if (busy || !round) return;
    busy = true; draw.disabled = true; sound.play('click');
    const out = await tryAct('draw', { hold }, { defer: true });
    if (!out) { busy = false; draw.disabled = false; return; }
    const r = out.round;
    const final = r.outcome.final.map(cardOf);
    // discards flip face down, then come back as the new cards
    const swap = [];
    for (let i = 0; i < 5; i++) if (!hold[i]) swap.push(i);
    for (const i of swap) { sound.play('flip'); cards[i].flip(false); await sleep(70); }
    await sleep(380);
    for (const i of swap) { cards[i].setCard(final[i]); sound.play('flip'); cards[i].flip(true); await sleep(110); }
    await sleep(380);
    cards.forEach((c, i) => { c.classList.remove('held', 'sel'); c.onclick = null; });
    hold = [false, false, false, false, false];
    const win = r.multiplier >= 1;
    label.textContent = r.outcome.rank || 'Nothing';
    label.className = `bubble ${r.multiplier > 1 ? 'win' : r.multiplier === 1 ? '' : 'lose'}`;
    table(r.outcome.rank);
    if (r.multiplier > 1) { sound.play(r.multiplier >= 25 ? 'bigwin' : 'win'); flashGreen(L.board); cards.forEach((c, i) => setTimeout(() => { c.classList.add('win'); popIn(c); sparkle(c, L.board, { color: '#e6b655', count: 6, spread: 36 }); }, i * 90)); if (r.multiplier >= 25) winBurst(L.board); }
    else if (r.multiplier === 1) sound.play('reveal'); else sound.play('lose');
    banner.show(r.outcome.rank ? `${r.outcome.rank} · ${payoutLine(r)}` : `No hand · −${fmt(r.amount)} AGT`, r.multiplier > 1 ? true : r.multiplier === 1 ? 'push' : false);
    strip.push(r.outcome.rank ? `${r.multiplier}x` : '—', r.multiplier > 1);
    out.commit();
    lastSettled = r;
    round = null; busy = false; deal.disabled = false; amount.setDisabled(false);
  }
  /** Hold pairs and better, else four to a flush, else jacks or better. */
  function autoHold(hand) {
    const byRank = {}; hand.forEach((c, i) => (byRank[c.rank] ||= []).push(i));
    const paired = Object.values(byRank).filter((a) => a.length >= 2).flat();
    if (paired.length) return hand.map((_, i) => paired.includes(i));
    const bySuit = {}; hand.forEach((c, i) => (bySuit[c.suit] ||= []).push(i));
    const four = Object.values(bySuit).find((a) => a.length >= 4);
    if (four) return hand.map((_, i) => four.includes(i));
    return hand.map((c) => c.rank === 1 || c.rank >= 11);
  }
  async function playAuto() {
    if (busy || round) return null;
    lastSettled = null;
    await start(); if (!round) return null;
    hold = autoHold(round.view.hand); cards.forEach((c, i) => c.classList.toggle('held', hold[i]));
    await sleep(350);
    await doDraw();
    return lastSettled;
  }
  table();
  attachAuto({ panel: L.controls, amount, manual: [deal, draw], playRound: playAuto, canStart: () => (round ? 'Finish the current hand first.' : null), rtp: () => 0.9954, note: 'Auto holds pairs and better, then four to a flush, then jacks or better.' });
  const existing = openRoundFor('videopoker');
  if (existing) {
    round = existing; amount.set(existing.amount); deal.disabled = true; amount.setDisabled(true); draw.disabled = false; label.textContent = 'Choose what to hold.';
    hand.replaceChildren(); cards = existing.view.hand.map((c, i) => { const el = cardEl(c, { selectable: true, onClick: () => toggleHold(i) }); hand.append(el); return el; });
  } else hand.replaceChildren(...Array.from({ length: 5 }, () => cardEl(null, { back: true })));
  return { unmount() { dead = true; } };
}
