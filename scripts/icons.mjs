// Extracts the Lucide icons the app uses from the upstream sprite into an inline <svg> block in public/index.html.
import { readFileSync, writeFileSync } from 'node:fs';
const sprite = readFileSync(process.argv[2], 'utf8');
const NAMES = ['house', 'book-open', 'chart-column', 'shield-check', 'user', 'chevron-left', 'zap', 'lock', 'eye', 'coins', 'volume-2', 'volume-x', 'info', 'check', 'x', 'gem', 'bomb', 'dice-5', 'flame', 'egg', 'layers', 'spade', 'club', 'rocket', 'trending-up', 'wallet', 'shuffle', 'history', 'log-out', 'trash-2', 'rotate-cw', 'sparkles', 'scale', 'triangle-alert', 'life-buoy', 'circle-dollar-sign', 'layout-grid', 'hand-coins', 'badge-percent', 'activity', 'pyramid', 'target', 'skull', 'search', 'bell', 'arrow-up-right', 'arrow-down-right', 'chevron-right', 'circle-help', 'hexagon', 'triangle'];
const out = [];
for (const n of NAMES) {
  const m = sprite.match(new RegExp(`<symbol id="${n}">([\\s\\S]*?)</symbol>`));
  if (!m) { console.error('missing', n); continue; }
  out.push(`    <symbol id="lu-${n}" viewBox="0 0 24 24">${m[1].replace(/\s+/g, ' ').trim()}</symbol>`);
}
const block = `<svg class="defs" width="0" height="0" aria-hidden="true" focusable="false">\n  <!-- Lucide icons v0.468.0, ISC license, https://lucide.dev -->\n  <defs>\n${out.join('\n')}\n  </defs>\n</svg>`;
const html = readFileSync('public/index.html', 'utf8');
const next = html.replace(/<svg class="defs"[\s\S]*?<\/svg>\n/, block + '\n');
writeFileSync('public/index.html', next);
console.log('icons', out.length);
