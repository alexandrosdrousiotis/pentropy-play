import { h, button, segmented, cardEl, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, payoutLine } from './common.js';
import { BACCARAT_RTP, BACCARAT_PAYOUT } from '../../shared/math.js';
import { dealFrom, sleep, sound, flashGreen, flashRed, winBurst } from '../fx.js';
import { attach as attachAuto } from './autobet.js';

export function mount(root, meta) {
  const L = layout(root);
  let bet = 'player', busy = false, dead = false;
  const amount = betAmount(10, () => reality.update());
  const betSeg = segmented([{ value: 'player', label: 'Player 1:1' }, { value: 'banker', label: 'Banker 0.95:1' }, { value: 'tie', label: 'Tie 8:1' }], bet, (v) => { bet = v; reality.update(); }, { block: true });
  const play = button('Deal', { kind: 'primary', size: 'lg block', onClick: () => go() });
  L.controls.append(amount, h('div', { class: 'field' }, h('label', {}, 'Bet on'), betSeg), play);
  const shoe = h('div', { class: 'shoe', 'aria-hidden': 'true' });
  const pHand = h('div', { class: 'hand' }), bHand = h('div', { class: 'hand' });
  const pB = h('span', { class: 'bubble' }, 'Player'), bB = h('span', { class: 'bubble' }, 'Banker');
  L.board.classList.add('table-felt');
  L.stage.append(shoe, h('div', { class: 'bacc' }, h('div', { class: 'stack', style: { justifyItems: 'center', gap: '8px' } }, pB, pHand), h('div', { class: 'stack', style: { justifyItems: 'center', gap: '8px' } }, bB, bHand)));
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(h('h3', {}, 'Recent coups'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => ({ rtp: BACCARAT_RTP[bet], winChance: { player: 0.4462, banker: 0.4586, tie: 0.0952 }[bet], multiplier: BACCARAT_PAYOUT[bet] }));
  L.reality.append(reality);
  const idle = () => { pHand.replaceChildren(cardEl(null, { back: true }), cardEl(null, { back: true })); bHand.replaceChildren(cardEl(null, { back: true }), cardEl(null, { back: true })); pB.textContent = 'Player'; bB.textContent = 'Banker'; pB.className = bB.className = 'bubble'; };
  async function go(amt = amount.get()) {
    if (busy) return null;
    busy = true; play.disabled = true; amount.setDisabled(true); betSeg.setDisabled(true); sound.play('click');
    const out = await tryBet('baccarat', amt, { bet }, { defer: true });
    if (!out) { busy = false; play.disabled = false; amount.setDisabled(false); betSeg.setDisabled(false); return null; }
    const { round } = out; const o = round.outcome;
    pHand.replaceChildren(); bHand.replaceChildren(); pB.textContent = 'Player'; bB.textContent = 'Banker'; pB.className = bB.className = 'bubble';
    const order = [[pHand, o.player[0]], [bHand, o.banker[0]], [pHand, o.player[1]], [bHand, o.banker[1]]];
    if (o.player[2]) order.push([pHand, o.player[2]]); if (o.banker[2]) order.push([bHand, o.banker[2]]);
    for (const [hand, c] of order) { if (dead) return null; const el = cardEl(c, { faceDown: true }); hand.append(el); sound.play('deal'); await dealFrom(el, shoe, { ms: 400 }); }
    pB.textContent = `Player · ${o.playerTotal}`; bB.textContent = `Banker · ${o.bankerTotal}`;
    if (o.winner === 'player') pB.className = 'bubble win'; else if (o.winner === 'banker') bB.className = 'bubble win';
    const win = round.multiplier > 1, push = round.multiplier === 1;
    if (win) { sound.play(bet === 'tie' ? 'bigwin' : 'win'); flashGreen(L.board); if (bet === 'tie') winBurst(L.board); } else if (!push) { sound.play('lose'); flashRed(L.board); }
    banner.show(`${o.winner === 'tie' ? 'Tie' : `${o.winner[0].toUpperCase()}${o.winner.slice(1)} wins`} ${o.playerTotal}–${o.bankerTotal} · ${payoutLine(round)}`, win ? true : push ? 'push' : false);
    strip.push(o.winner[0].toUpperCase(), win);
    out.commit(); busy = false; play.disabled = false; amount.setDisabled(false); betSeg.setDisabled(false);
    return round;
  }
  idle();
  attachAuto({ panel: L.controls, amount, manual: [play], playRound: (a) => go(a), rtp: () => BACCARAT_RTP[bet] });
  return { unmount() { dead = true; } };
}
