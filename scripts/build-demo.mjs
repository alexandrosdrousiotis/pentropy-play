// Builds dist-demo/: the client plus the browser-only demo runtime, as a content-only page for publishing.
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(new URL('..', import.meta.url).pathname);
const out = resolve(root, 'dist-demo');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(resolve(root, 'public/css'), resolve(out, 'css'), { recursive: true });
cpSync(resolve(root, 'public/js'), resolve(out, 'js'), { recursive: true });
cpSync(resolve(root, 'shared'), resolve(out, 'shared'), { recursive: true });
cpSync(resolve(root, 'public/favicon.svg'), resolve(out, 'favicon.svg'));
if (existsSync(resolve(root, 'public/art'))) cpSync(resolve(root, 'public/art'), resolve(out, 'art'), { recursive: true });
const html = readFileSync(resolve(root, 'public/index.html'), 'utf8');
// Content-only page: the publishing host wraps it in its own document skeleton.
const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
const page = `<title>Pentropy Play</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="pentropy-mode" content="demo">
<meta name="color-scheme" content="dark">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap">
<link rel="stylesheet" href="css/app.css">
<style>html,body{height:auto}.demo-ribbon{position:fixed;left:0;right:0;top:0;z-index:40;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;text-align:center;padding:3px 8px;background:#f6b73c;color:#1a1405}.shell{padding-top:22px}.top{top:22px}.side{top:22px;height:calc(100vh - 22px)}</style>
<div class="demo-ribbon">Demo build · runs entirely in your browser · the production deployment is server-side</div>
${body}`;
writeFileSync(resolve(out, 'index.html'), page);
// standalone copy for local preview outside the publishing host
writeFileSync(resolve(out, 'preview.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${page.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')}</body></html>`);
console.log('built', out);
