// Builds the inline icon sprite in public/index.html from Phosphor Icons SVG files (MIT, https://phosphoricons.com).
// Usage: node scripts/icons.mjs <dir with phosphor svgs>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2];
const out = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith('.svg')).sort()) {
  const svg = readFileSync(join(dir, f), 'utf8');
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<rect[^>]*fill="none"[^>]*\/>/g, '').replace(/\s+/g, ' ').trim();
  const id = f.replace(/\.svg$/, '').replace(/-(fill|bold|regular)$/, '');
  out.push(`    <symbol id="ph-${id}" viewBox="0 0 256 256">${inner}</symbol>`);
}
const block = `<svg class="defs" width="0" height="0" aria-hidden="true" focusable="false">\n  <!-- Phosphor Icons v2.1.1 (fill/bold weights), MIT license, https://phosphoricons.com -->\n  <defs>\n${out.join('\n')}\n  </defs>\n</svg>`;
const html = readFileSync('public/index.html', 'utf8');
writeFileSync('public/index.html', html.replace(/<svg class="defs"[\s\S]*?<\/svg>\n/, block + '\n'));
console.log('icons', out.length);
