#!/usr/bin/env python3
"""Build public/art/*.webp from the masters in docs/art.

For every asset the newest revision wins: docs/art/<name>-v3.png over -v2.png over <name>.png.
Run after dropping new masters in:  python3 scripts/art.py   (needs Pillow)
"""
import os, re, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, OUT = os.path.join(ROOT, 'docs', 'art'), os.path.join(ROOT, 'public', 'art')
TILES = ['limbo', 'mines', 'dice', 'crash', 'tower', 'plinko', 'keno', 'wheel', 'slide', 'diamonds',
         'chicken', 'pump', 'hilo', 'flip', 'rps', 'blackjack', 'videopoker', 'baccarat', 'roulette']
BANNERS = ['roulette', 'chicken', 'crash']
# name -> (target size, fallback master if the named one is missing, crop anchor)
WIDE = {'lobby-hero': ((1200, 675), None, 0.5), 'lobby-hero-mobile': ((800, 1000), None, 0.5),
        'cat-live': ((900, 450), 'roulette-banner', 0.55), 'cat-originals': ((900, 450), 'plinko', 0.45)}

ALIAS = {'baccarat': ['poker'], 'videopoker': ['video-poker']}  # other names the same asset has arrived under

def readable(path):
    try: Image.open(path).load(); return True
    except Exception: return False

def master(name):
    """Newest readable revision of a master: name-v9.png, name-v2-3.png … name-v2.png, then name.png."""
    found = []
    for n in [name, *ALIAS.get(name, [])]:
        if os.path.exists(os.path.join(SRC, f'{n}.png')): found.append((0, 0, f'{n}.png'))
        for f in os.listdir(SRC):
            m = re.fullmatch(re.escape(n) + r'-v(\d+)(?:-(\d+))?\.png', f, re.I)
            if m: found.append((int(m.group(1)), int(m.group(2) or 0), f))
    for _, _, f in sorted(found, reverse=True):
        if readable(os.path.join(SRC, f)): return os.path.join(SRC, f)
    return None

def cover(im, w, h, anchor=0.5):
    s = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    l = round((im.width - w) * 0.5); t = round((im.height - h) * anchor)
    return im.crop((l, t, l + w, t + h))

def save(im, name, q=82):
    im.save(os.path.join(OUT, f'{name}.webp'), 'WEBP', quality=q, method=6)
    print(f'  {name}.webp  {im.width}x{im.height}')

def main():
    os.makedirs(OUT, exist_ok=True)
    missing = []
    for t in TILES:
        p = master(t)
        if not p: missing.append(t); continue
        save(cover(Image.open(p).convert('RGB'), 600, 800), t)
    for b in BANNERS:
        p = master(f'{b}-banner')
        if not p: missing.append(f'{b}-banner'); continue
        save(cover(Image.open(p).convert('RGB'), 1200, 675), f'{b}-banner')
    for name, ((w, h), fallback, anchor) in WIDE.items():
        p = master(name) or (fallback and master(fallback))
        if not p: missing.append(name); continue
        save(cover(Image.open(p).convert('RGB'), w, h, anchor), name)
    RW = ['hourly', 'daily', 'weekly', 'rakeback', 'wagered', 'edge', 'given', 'net', 'referral', 'bronze', 'silver', 'gold', 'platinum', 'diamond']
    os.makedirs(os.path.join(OUT, 'rw'), exist_ok=True)
    for r in RW:
        p = master(f'rw-{r}')
        if not p: continue
        im = Image.open(p).convert('RGBA'); im = im.crop(im.getbbox()); im.thumbnail((256, 256), Image.LANCZOS)
        im.save(os.path.join(OUT, 'rw', f'{r}.webp'), 'WEBP', quality=86, method=6); print(f'  rw/{r}.webp  {im.width}x{im.height}')
    for c, size in [('chest-open', 640), ('chest-closed', 640), ('crash-rocket', 256)]:
        p = master(c)
        if not p:
            if c != 'crash-rocket': missing.append(c)
            continue
        im = Image.open(p).convert('RGBA'); im = im.crop(im.getbbox()); im.thumbnail((size, size), Image.LANCZOS)
        save(im, c, 85)
    if missing: print('missing masters:', ', '.join(missing))
    used = {n: os.path.basename(master(n)) for n in TILES + ['chest-open', 'chest-closed', 'lobby-hero'] + [f'{b}-banner' for b in BANNERS] if master(n)}
    v2 = [f for f in used.values() if '-v' in f]
    print(f'{len(used)} tiles, {len(v2)} from a -v revision' + (': ' + ', '.join(sorted(v2)) if v2 else ''))

if __name__ == '__main__':
    sys.exit(main())
