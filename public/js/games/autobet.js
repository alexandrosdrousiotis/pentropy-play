// Auto-bet controller shared by the games that support it. Mirrors the standard casino options:
// number of bets, on-win / on-loss adjustment, stop on profit, stop on loss.
import { h, button, numberInput, segmented, fmt, fmtSigned, toast } from '../ui.js';
import { user } from '../api.js';
import { sound } from '../fx.js';

const MIN_BET = 0.1;

/**
 * attach({ panel, amount, manual, playRound, canStart, rtp })
 *  panel     the controls panel element (tabs are inserted at its top)
 *  amount    the bet amount field from betAmount()
 *  manual    nodes that belong to manual play (hidden in Auto mode)
 *  playRound async (amountAgt) => settled round ({ net, amount, multiplier }) or null when refused
 *  canStart  () => string | null   a reason auto cannot start, or null
 *  rtp       () => number           for the live expected-loss readout
 */
export function attach({ panel, amount, manual = [], playRound, canStart = () => null, rtp = () => 0.99, onModeChange = () => {}, onStop = () => {}, extra = [], note = null }) {
  let mode = 'manual', running = false, stopRequested = false;
  const cfg = { count: 0, onWin: 'reset', onWinPct: 0, onLoss: 'reset', onLossPct: 0, stopProfit: 0, stopLoss: 0 };
  const stats = { bets: 0, profit: 0, expected: 0, wagered: 0 };

  const tabs = segmented([{ value: 'manual', label: 'Manual' }, { value: 'auto', label: 'Auto' }], mode, (v) => setMode(v), { block: true });
  tabs.classList.add('auto-tabs');
  const countField = numberInput({ label: 'Number of bets', value: 0, min: 0, max: 10000, step: 1, unit: '0 = ∞', onChange: (v) => { cfg.count = Math.max(0, Math.round(v)); } });
  const winSeg = segmented([{ value: 'reset', label: 'Reset' }, { value: 'increase', label: 'Increase by' }], 'reset', (v) => { cfg.onWin = v; winPct.hidden = v !== 'increase'; }, { block: true });
  const winPct = numberInput({ label: 'On win, increase by', value: 0, min: 0, max: 1000, step: 1, unit: '%', onChange: (v) => { cfg.onWinPct = Math.max(0, v); } }); winPct.hidden = true;
  const lossSeg = segmented([{ value: 'reset', label: 'Reset' }, { value: 'increase', label: 'Increase by' }], 'reset', (v) => { cfg.onLoss = v; lossPct.hidden = v !== 'increase'; }, { block: true });
  const lossPct = numberInput({ label: 'On loss, increase by', value: 0, min: 0, max: 1000, step: 1, unit: '%', onChange: (v) => { cfg.onLossPct = Math.max(0, v); } }); lossPct.hidden = true;
  const stopProfit = numberInput({ label: 'Stop on profit', value: 0, min: 0, max: 1e7, step: 1, unit: 'AGT', onChange: (v) => { cfg.stopProfit = Math.max(0, v); } });
  const stopLoss = numberInput({ label: 'Stop on loss', value: 0, min: 0, max: 1e7, step: 1, unit: 'AGT', onChange: (v) => { cfg.stopLoss = Math.max(0, v); } });
  const startBtn = button('Start auto bet', { kind: 'primary', size: 'lg block', onClick: () => (running ? stop() : start()) });
  const readout = h('div', { class: 'auto-stats' });
  const section = h('div', { class: 'stack auto-section', hidden: true },
    ...extra, note ? h('p', { class: 'help' }, note) : null,
    countField,
    h('div', { class: 'field' }, h('label', {}, 'On win'), winSeg), winPct,
    h('div', { class: 'field' }, h('label', {}, 'On loss'), lossSeg), lossPct,
    h('div', { class: 'two' }, stopProfit, stopLoss),
    startBtn, readout);
  panel.prepend(tabs);
  panel.append(section);

  function setMode(v) {
    if (running) { tabs.set(mode); return; }
    mode = v;
    manual.forEach((el) => { el.hidden = mode === 'auto'; });
    section.hidden = mode !== 'auto';
    onModeChange(mode);
    sound.play('tick');
  }
  function paintReadout() {
    readout.replaceChildren(
      h('span', {}, h('b', {}, String(stats.bets)), ' bets'),
      h('span', { class: stats.profit > 0 ? 'good' : stats.profit < 0 ? 'bad' : '' }, h('b', {}, fmtSigned(stats.profit)), ' profit'),
      h('span', { class: 'bad' }, h('b', {}, '−' + fmt(stats.expected)), ' expected'),
    );
  }
  const setFormDisabled = (d) => { section.querySelectorAll('input,button').forEach((el) => { if (el !== startBtn) el.disabled = d; }); amount.setDisabled(d); tabs.setDisabled(d); };
  const waitForModals = async () => { while (document.querySelector('.modal-bg')) await new Promise((r) => setTimeout(r, 300)); };

  async function start() {
    const reason = canStart();
    if (reason) { toast(reason, 'warn'); return; }
    const base = amount.get();
    if (!(base >= MIN_BET)) { toast('Set a bet amount first.', 'warn'); return; }
    running = true; stopRequested = false;
    Object.assign(stats, { bets: 0, profit: 0, expected: 0, wagered: 0 });
    startBtn.querySelector('span').textContent = 'Stop auto bet'; startBtn.className = 'btn danger lg block';
    setFormDisabled(true); paintReadout();
    let current = base;
    try {
      while (!stopRequested) {
        if (cfg.count > 0 && stats.bets >= cfg.count) break;
        await waitForModals();
        if (stopRequested) break;
        const balance = user()?.balance ?? 0;
        if (current > balance) { if (balance >= MIN_BET) current = Math.floor(balance * 100) / 100; else { toast('Out of tokens.', 'bad'); break; } }
        amount.set(current);
        const round = await playRound(current);
        if (!round) break;
        stats.bets++; stats.profit += round.net; stats.wagered += round.amount; stats.expected += round.amount * (1 - rtp());
        paintReadout();
        if (cfg.stopProfit > 0 && stats.profit >= cfg.stopProfit) { toast(`Stopped: profit target ${fmt(cfg.stopProfit)} reached.`, 'good'); break; }
        if (cfg.stopLoss > 0 && -stats.profit >= cfg.stopLoss) { toast(`Stopped: loss limit ${fmt(cfg.stopLoss)} reached.`, 'warn'); break; }
        const won = round.net > 0;
        if (won) current = cfg.onWin === 'increase' ? current * (1 + cfg.onWinPct / 100) : base;
        else current = cfg.onLoss === 'increase' ? current * (1 + cfg.onLossPct / 100) : base;
        current = Math.max(MIN_BET, Math.round(current * 100) / 100);
        await new Promise((r) => setTimeout(r, 350));
      }
    } finally {
      running = false;
      startBtn.querySelector('span').textContent = 'Start auto bet'; startBtn.className = 'btn primary lg block';
      setFormDisabled(false); amount.set(base);
      onStop(stats);
    }
  }
  function stop() { stopRequested = true; startBtn.disabled = true; setTimeout(() => (startBtn.disabled = false), 400); }

  return { get mode() { return mode; }, get running() { return running; }, stop, setMode };
}
