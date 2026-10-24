// Motion and sound layer. One set of easing curves and durations so every game moves the same way.
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const ease = {
  linear: (t) => t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inCubic: (t) => t * t * t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outExpo: (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
  outBack: (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2,
  outElastic: (t) => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  outBounce: (t) => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; },
};

/** Drive `fn(progress)` over `ms` with an easing; resolves when done. Honours reduced motion. */
export function tween(ms, fn, easing = ease.outCubic) {
  if (reduced()) { fn(1); return Promise.resolve(); }
  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      fn(easing(k), k);
      if (k < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, reduced() ? 0 : ms));

/** Animate a number in an element: 1.00x → 2.16x, or balance 1,000.00 → 989.80. */
export function countTo(el, from, to, ms, format, easing = ease.outExpo) {
  return tween(ms, (e) => { el.textContent = format(from + (to - from) * e); }, easing).then(() => { el.textContent = format(to); });
}

/** Slot-style digit ticker: spins through noise before settling (used by Limbo and Dice). */
export async function ticker(el, to, ms, format, { noise = 6 } = {}) {
  if (reduced()) { el.textContent = format(to); return; }
  const t0 = performance.now();
  await new Promise((resolve) => {
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = ease.outExpo(k);
      const jitter = (1 - e) * noise;
      el.textContent = format(to + (Math.random() - 0.5) * 2 * jitter * (1 - e));
      if (k < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
  el.textContent = format(to);
}

/* ---- element effects (CSS-class driven, see app.css "fx") ---- */
const retrigger = (el, cls, ms) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), ms); };
export const shake = (el) => retrigger(el, 'fx-shake', 450);
export const pulse = (el) => retrigger(el, 'fx-pulse', 500);
export const flashRed = (el) => retrigger(el, 'fx-flash-red', 600);
export const flashGreen = (el) => retrigger(el, 'fx-flash-green', 700);
export const popIn = (el, delay = 0) => { el.style.animationDelay = `${delay}ms`; retrigger(el, 'fx-pop', 600 + delay); };

/**
 * Deal an element from a source point to where it now sits (FLIP). The element must already be in
 * the DOM at its final position. `from` is an element (its centre is used) or {x, y} in viewport px.
 */
export async function dealFrom(el, from, { delay = 0, ms = 420, rotate = -10, flipUp = true } = {}) {
  if (reduced()) { if (flipUp) el.dataset.face = 'up'; return; }
  const rect = el.getBoundingClientRect();
  const src = from instanceof Element ? (() => { const r = from.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })() : from;
  const dx = src.x - (rect.left + rect.width / 2), dy = src.y - (rect.top + rect.height / 2);
  el.style.transition = 'none';
  el.style.transform = `translate(${dx}px, ${dy}px) rotate(${rotate}deg) scale(.9)`;
  el.style.opacity = '0';
  void el.offsetWidth;
  await sleep(delay);
  el.style.transition = `transform ${ms}ms cubic-bezier(.2,.8,.2,1), opacity ${ms * 0.4}ms ease-out`;
  el.style.transform = 'translate(0,0) rotate(0) scale(1)';
  el.style.opacity = '1';
  if (flipUp) setTimeout(() => { el.dataset.face = 'up'; }, ms * 0.55);
  await sleep(ms);
  el.style.transition = ''; el.style.transform = '';
}

/** Slide an element off to the side and remove it (HiLo history). */
export async function slideOut(el, dx = -140, ms = 320) {
  if (reduced()) { el.remove(); return; }
  el.style.transition = `transform ${ms}ms cubic-bezier(.4,0,.2,1), opacity ${ms}ms`;
  el.style.transform = `translateX(${dx}px) scale(.8)`; el.style.opacity = '0';
  await sleep(ms); el.remove();
}

/* ---- sound: tiny synthesized cues, no assets, muted until the first click ---- */
let ctx = null;
const SOUND_KEY = 'pentropy.sound';
export const sound = {
  get enabled() { try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; } },
  set enabled(v) { try { localStorage.setItem(SOUND_KEY, v ? 'on' : 'off'); } catch { /* ignore */ } },
  play(name) {
    if (!this.enabled) return;
    try {
      ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      const t = ctx.currentTime;
      const tone = (freq, dur, type = 'sine', gain = 0.08, start = 0, slide = 0) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, t + start);
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + start + dur);
        g.gain.setValueAtTime(0, t + start); g.gain.linearRampToValueAtTime(gain, t + start + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
        o.connect(g).connect(ctx.destination); o.start(t + start); o.stop(t + start + dur + 0.02);
      };
      const noise = (dur, gain = 0.05, start = 0, hp = 1200) => {
        const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate); const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        const s = ctx.createBufferSource(); s.buffer = buf; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
        const g = ctx.createGain(); g.gain.value = gain; s.connect(f).connect(g).connect(ctx.destination); s.start(t + start);
      };
      switch (name) {
        case 'click': tone(1800, 0.03, 'square', 0.03); break;
        case 'tick': tone(1200, 0.02, 'triangle', 0.02); break;
        case 'deal': noise(0.06, 0.06, 0, 2500); tone(500, 0.04, 'triangle', 0.02); break;
        case 'flip': noise(0.05, 0.04, 0, 3000); break;
        case 'reveal': tone(880, 0.08, 'sine', 0.05); tone(1320, 0.12, 'sine', 0.04, 0.05); break;
        case 'bomb': noise(0.35, 0.18, 0, 150); tone(90, 0.35, 'sawtooth', 0.12, 0, -60); break;
        case 'win': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.06, i * 0.07)); break;
        case 'bigwin': [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.25, 'triangle', 0.07, i * 0.08)); break;
        case 'lose': tone(220, 0.25, 'sawtooth', 0.04, 0, -80); break;
        case 'cashout': tone(1046, 0.1, 'sine', 0.06); tone(1568, 0.16, 'sine', 0.05, 0.08); noise(0.08, 0.03, 0.08, 4000); break;
        case 'peg': tone(2400 + Math.random() * 600, 0.025, 'sine', 0.025); break;
        case 'land': tone(300, 0.1, 'triangle', 0.06, 0, -120); break;
        case 'launch': tone(200, 0.4, 'sawtooth', 0.03, 0, 400); break;
        case 'crash': noise(0.4, 0.2, 0, 200); tone(120, 0.5, 'sawtooth', 0.1, 0, -90); break;
        default: break;
      }
    } catch { /* audio unavailable */ }
  },
};

/** A small particle burst inside a positioned container (wins). */
export function winBurst(container, { count = 18, colors = ['#f3c969', '#1fd690', '#7b6cff', '#fff'] } = {}) {
  if (reduced()) return;
  const root = document.createElement('div'); root.className = 'win-burst';
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    const a = (Math.PI * 2 * i) / count + Math.random() * 0.4, d = 90 + Math.random() * 120;
    p.style.setProperty('--bx', `${Math.cos(a) * d}px`); p.style.setProperty('--by', `${Math.sin(a) * d - 40}px`);
    p.style.background = colors[i % colors.length]; p.style.animationDelay = `${Math.random() * 80}ms`;
    root.append(p);
  }
  container.append(root); setTimeout(() => root.remove(), 1100);
}

/** Small particle burst centred on `el`, drawn inside `container` (a positioned ancestor). */
export function sparkle(el, container, { count = 10, color = '#3ccf8f', spread = 60 } = {}) {
  if (reduced() || !el || !container) return;
  const cr = container.getBoundingClientRect(), r = el.getBoundingClientRect();
  const root = document.createElement('div'); root.className = 'win-burst';
  const cx = r.left + r.width / 2 - cr.left, cy = r.top + r.height / 2 - cr.top;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    const a = Math.random() * Math.PI * 2, d = spread * (0.5 + Math.random());
    p.style.left = `${cx}px`; p.style.top = `${cy}px`;
    p.style.setProperty('--bx', `${Math.cos(a) * d}px`); p.style.setProperty('--by', `${Math.sin(a) * d}px`);
    p.style.background = color; p.style.width = p.style.height = `${3 + Math.random() * 4}px`;
    root.append(p);
  }
  container.append(root); setTimeout(() => root.remove(), 1000);
}
/** Expanding ring from the centre of `el` (explosions, impacts). */
export function shockwave(el, container, color = 'rgba(255,92,122,.75)') {
  if (reduced() || !el || !container) return;
  const cr = container.getBoundingClientRect(), r = el.getBoundingClientRect();
  const ring = document.createElement('div'); ring.className = 'shockwave';
  ring.style.left = `${r.left + r.width / 2 - cr.left}px`; ring.style.top = `${r.top + r.height / 2 - cr.top}px`; ring.style.borderColor = color;
  container.append(ring); setTimeout(() => ring.remove(), 700);
}
/** Text that rises and fades from a point inside `container` ("+1.29x"). */
export function floatText(container, x, y, text, cls = '') {
  if (!container) return;
  const t = document.createElement('div'); t.className = `float-text ${cls}`; t.textContent = text;
  t.style.left = `${x}px`; t.style.top = `${y}px`;
  container.append(t); setTimeout(() => t.remove(), 1000);
}
