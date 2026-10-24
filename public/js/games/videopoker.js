import { h, button, cardEl, fmtMult, fmtPct, outcomeBanner, resultsStrip, fmt } from '../ui.js';
import { betAmount, realityPanel, layout, tryBet, tryAct, payoutLine, openRoundFor, sleep } from './common.js';
import { VP_PAYTABLE, cardOf, evaluatePoker } from '../../shared/math.js';

export function mount(root, meta) {
  const L = layout(root);
  let round = null, hold = [false, false, false, false, false], busy = false, cancelled = false;
  const amount = betAmount(10, () => reality.update());
  const deal = button('Deal', { kind: 'primary', size: 'lg block', onClick: () => start() });
  const draw = button('Draw', { kind: 'accent', size: 'lg block', disabled: true, onClick: () => doDraw() });
  const payEl = h('table', { class: 'paytable' });
  L.controls.append(amount, deal, draw, payEl, h('p', { class: 'help' }, '9/6 Jacks or Better, the full-pay table. 99.54% with perfect strategy, which almost nobody plays. Click cards to hold them.'));

  const hand = h('div', { class: 'hand' });
  const label = h('div', { class: 't-label', style: { textAlign: 'center', minHeight: '18px' } });
  L.stage.append(h('div', { class: 'stack', style: { gap: '26px', width: '100%' } }, hand, label));
  const banner = outcomeBanner(L.board);
  const strip = resultsStrip();
  L.results.append(h('h3', {}, 'Recent hands'), strip.el);
  const reality = realityPanel(meta, () => amount.get(), () => ({ rtp: 0.9954, note: 'A royal flush (800x) shows up about once per 40,000 hands with perfect play. Bad holds cost around 2–5% of RTP each, which is why the real figure for most players is well under 99%.' }));
  L.reality.append(reality);

  function table(hit = null) {
    payEl.replaceChildren(h('thead', {}, h('tr', {}, h('th', {}, 'Hand'), h('th', {}, 'Pays'))), h('tbody', {}, ...VP_PAYTABLE.map(([n, m]) => h('tr', { class: n === hit ? 'hit' : '' }, h('td', {}, n), h('td', {}, `${m}x`)))));
  }
  function paint(cards, { selectable = false } = {}) {
    hand.replaceChildren(...cards.map((c, i) => cardEl(c, { held: hold[i], selectable, onClick: selectable ? () => { hold[i] = !hold[i]; paint(cards, { selectable }); } : null })));
  }
  async function start() {
    if (busy || round) return;
    busy = true;
    const out = await tryBet('videopoker', amount.get(), {});
    busy = false;
    if (!out) return;
    round = out.round; hold = [false, false, false, false, false]; banner.hide(); table();
    deal.disabled = true; amount.setDisabled(true);
    hand.replaceChildren();
    for (let i = 0; i < 5; i++) { if (cancelled) return; hand.append(cardEl(round.view.hand[i])); await sleep(90); }
    paint(round.view.hand, { selectable: true });
    const now = evaluatePoker(round.view.hand);
    label.textContent = now ? `Dealt: ${now}. Choose what to hold.` : 'Choose what to hold.';
    draw.disabled = false;
  }
  async function doDraw() {
    if (busy || !round) return;
    busy = true; draw.disabled = true;
    const out = await tryAct('draw', { hold }, { defer: true });
    if (!out) { busy = false; draw.disabled = false; return; }
    const r = out.round;
    const final = r.outcome.final.map(cardOf);
    for (let i = 0; i < 5; i++) { if (hold[i]) continue; if (cancelled) break; hold[i] = false; const prev = [...hand.children]; prev[i].replaceWith(cardEl(final[i])); await sleep(120); }
    hold = [false, false, false, false, false];
    paint(final);
    const win = r.multiplier >= 1;
    label.textContent = r.outcome.rank || 'Nothing';
    table(r.outcome.rank);
    banner.show(r.outcome.rank ? `${r.outcome.rank} · ${payoutLine(r)}` : `No hand · −${fmt(r.amount)} AGT`, r.multiplier > 1);
    strip.push(r.outcome.rank ? `${r.multiplier}x` : '—', r.multiplier > 1);
    out.commit();
    round = null; busy = false; deal.disabled = false; amount.setDisabled(false);
  }
  table();
  const existing = openRoundFor('videopoker');
  if (existing) { round = existing; amount.set(existing.amount); deal.disabled = true; amount.setDisabled(true); paint(existing.view.hand, { selectable: true }); draw.disabled = false; label.textContent = 'Choose what to hold.'; }
  else hand.replaceChildren(...[...Array.from({ length: 5 }, () => cardEl(null, { back: true }))].flat().filter(Boolean));
  return { unmount() { cancelled = true; } };
}
