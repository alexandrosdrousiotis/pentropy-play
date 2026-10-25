// The chest: a CSS-drawn treasure chest that fills as you play and opens every six hours.
// It is the oldest retention hook in the business, so the expected value sits right next to it.
import { api, me } from './api.js';
import { h, svgUse, button, fmt, toast } from './ui.js';
import { sound, sleep, countTo, winBurst, ease, haptic } from './fx.js';

const countdown = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60; return hh ? `${hh}h ${String(mm).padStart(2, '0')}m` : `${mm}:${String(ss).padStart(2, '0')}`; };
const isReady = (c) => c.ready || Date.now() >= c.nextAt;

/** The drawn chest. `size` scales it; the lid opens with the `.open` class. */
export function chestEl(size = 1) {
  const el = h('div', { class: 'chest', 'aria-hidden': 'true' },
    h('div', { class: 'glow' }),
    h('div', { class: 'lid' }, h('i', { class: 'band' }), h('i', { class: 'band r' })),
    h('div', { class: 'box' }, h('i', { class: 'band' }), h('i', { class: 'band r' }), h('i', { class: 'lock' })),
    h('div', { class: 'coins' }, ...Array.from({ length: 7 }, (_, i) => h('i', { class: `c c${i}` }))));
  el.style.setProperty('--sz', String(size));
  return el;
}

/** Full card for the Rebates page: chest, fill meter, countdown and the open button. */
export function chestCard(initial) {
  let c = initial; let timer = 0;
  const chest = chestEl(1.25);
  const meter = h('div', { class: 'progress chest-meter' }, h('i', {}));
  const status = h('div', { class: 'chest-status num' });
  const sub = h('p', { class: 'help' });
  const btn = button('Open chest', { kind: 'primary', size: 'lg', onClick: () => open() });
  const root = h('section', { class: 'plate chest-card' },
    h('div', { class: 'chest-stage' }, chest),
    h('div', { class: 'chest-info' },
      h('div', { class: 'row between' }, h('h3', {}, 'The chest'), h('span', { class: 't-desc' }, 'opens every 6 hours')),
      status, meter, sub, btn,
      h('p', { class: 'help' }, `Pays a random ${(c.minRate * 100).toFixed(1)}% to ${(c.maxRate * 100).toFixed(1)}% of what you wagered since it last opened, ${fmt(c.min)} to ${fmt(c.max)} AGT. Expected: ${((c.minRate + c.maxRate) * 50).toFixed(2)}% of wager, against an edge of 1%. The random size and the timer are the hook; the maths is on the label.`)));
  function paint() {
    const ready = isReady(c);
    chest.classList.toggle('ready', ready && c.wagered > 0);
    meter.firstChild.style.width = `${Math.round(c.fill * 100)}%`;
    status.replaceChildren(ready ? (c.wagered > 0 ? h('b', { class: 'good' }, `Ready · about ${fmt(c.expected)} AGT inside`) : h('b', {}, 'Ready, but empty')) : h('span', {}, 'Opens in ', h('b', {}, countdown(c.nextAt - Date.now()))));
    sub.textContent = c.wagered > 0 ? `${Math.round(c.fill * 100)}% full · ${fmt(c.wagered)} AGT wagered since it last opened.` : 'The chest fills as you play. Place bets to put something in it.';
    btn.disabled = !(ready && c.wagered > 0);
    btn.querySelector('span').textContent = ready ? (c.wagered > 0 ? 'Open chest' : 'Nothing inside yet') : `Opens in ${countdown(c.nextAt - Date.now())}`;
  }
  async function open() {
    btn.disabled = true;
    const r = await openChestFlow();
    if (r) c = r.chest;
    paint();
  }
  paint();
  timer = setInterval(() => { if (!root.isConnected) return clearInterval(timer); paint(); }, 1000);
  return root;
}

/** Compact pill for the lobby bar. */
export function chestPill(initial) {
  let c = initial;
  const label = h('span', { class: 'num' });
  const el = h('button', { type: 'button', class: 'chest-pill', onClick: async () => { if (isReady(c) && c.wagered > 0) { const r = await openChestFlow(); if (r) { c = r.chest; paint(); } } else location.hash = '#/rebates'; } }, svgUse('ph-gift'), label);
  function paint() {
    const ready = isReady(c);
    el.classList.toggle('ready', ready && c.wagered > 0);
    label.textContent = ready ? (c.wagered > 0 ? `Chest ready · ~${fmt(c.expected)}` : 'Chest empty') : `Chest ${countdown(c.nextAt - Date.now())}`;
  }
  paint();
  const t = setInterval(() => { if (!el.isConnected) return clearInterval(t); paint(); }, 1000);
  return el;
}

/** Open the chest: server decides the amount, the browser makes a show of it. Resolves with the new rewards or null. */
export async function openChestFlow() {
  const wageredBefore = me()?.rewards?.chest?.wagered ?? 0;
  let r;
  try { r = await api.openChest(); } catch (e) { toast(e.message, 'bad'); return null; }
  const chest = chestEl(1.6);
  const amt = h('div', { class: 'chest-amt num' }, '0.00');
  const done = button('Collect', { kind: 'primary', size: 'lg', onClick: () => bg.remove() });
  done.hidden = true;
  const box = h('div', { class: 'chest-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Chest opened' },
    h('div', { class: 'chest-stage big' }, chest),
    h('div', { class: 't-label' }, 'The chest paid'),
    amt, h('span', { class: 't-desc' }, 'AGT'),
    h('p', { class: 'help' }, `A ${(r.roll * 100).toFixed(0)}th-percentile roll on ${fmt(wageredBefore)} AGT wagered. Already in your balance.`),
    done);
  const bg = h('div', { class: 'modal-bg chest-bg' }, box);
  document.body.append(bg);
  sound.play('chest');
  chest.classList.add('shake'); await sleep(650);
  chest.classList.remove('shake'); chest.classList.add('open'); sound.play('coins'); haptic([20, 40, 60]);
  winBurst(box, { count: 26, colors: ['#e6b655', '#fff1c4', '#f0a040', '#fff'] });
  await countTo(amt, 0, r.amount, 900, (v) => fmt(v), ease.outExpo);
  if (r.amount >= 10) { sound.play('bigwin'); winBurst(box, { count: 20 }); }
  done.hidden = false; done.focus();
  return r;
}
