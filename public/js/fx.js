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

/* ---- sound: a small synth with a master bus (compressor + short delay), no assets, muted until the first click ---- */
let ctx = null, bus = null;
const SOUND_KEY = 'pentropy.sound', VOL_KEY = 'pentropy.volume', HAPTIC_KEY = 'pentropy.haptics';
const store = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
function ensureBus() {
  ctx ||= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  if (bus) return bus;
  const master = ctx.createGain(); master.gain.value = sound.volume;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.18;
  master.connect(comp).connect(ctx.destination);
  const delay = ctx.createDelay(0.6); delay.delayTime.value = 0.17;
  const fb = ctx.createGain(); fb.gain.value = 0.24; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
  const wet = ctx.createGain(); wet.gain.value = 0.2;
  delay.connect(fb).connect(lp).connect(delay); delay.connect(wet).connect(master);
  bus = { master, delay };
  return bus;
}
/** One oscillator voice with an attack/decay envelope, optional pitch slide, filter and send to the delay. */
function tone({ freq, dur = 0.2, type = 'sine', gain = 0.08, at = 0, slide = 0, attack = 0.006, filter = 0, q = 1, send = 0, detune = 0 }) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.detune.value = detune + (Math.random() - 0.5) * 6;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(filter, t); f.frequency.exponentialRampToValueAtTime(Math.max(80, filter * 0.25), t + dur); f.Q.value = q; o.connect(f); node = f; }
  node.connect(g).connect(bus.master);
  if (send) { const sg = ctx.createGain(); sg.gain.value = send; g.connect(sg).connect(bus.delay); }
  o.start(t); o.stop(t + dur + 0.05);
}
/** Filtered noise burst: `hp`/`lp` set the band, `sweep` slides the lowpass over the duration. */
function noise({ dur = 0.1, gain = 0.05, at = 0, hp = 200, lp = 12000, sweep = 0, decay = true, send = 0 }) {
  const t = ctx.currentTime + at;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate); const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (decay ? 1 - i / d.length : 1);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp;
  const l = ctx.createBiquadFilter(); l.type = 'lowpass'; l.frequency.setValueAtTime(lp, t); if (sweep) l.frequency.exponentialRampToValueAtTime(Math.max(60, sweep), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(h).connect(l).connect(g).connect(bus.master);
  if (send) { const sg = ctx.createGain(); sg.gain.value = send; g.connect(sg).connect(bus.delay); }
  src.start(t);
}
const coin = (at, f = 2400 + Math.random() * 1600, gain = 0.05) => { tone({ freq: f, dur: 0.14, type: 'sine', gain, at, send: 0.3 }); tone({ freq: f * 2.76, dur: 0.07, type: 'sine', gain: gain * 0.4, at }); };
const CUES = {
  click: () => { noise({ dur: 0.02, gain: 0.05, hp: 2500 }); tone({ freq: 1900, dur: 0.035, type: 'square', gain: 0.02 }); },
  tick: () => { tone({ freq: 820 + Math.random() * 80, dur: 0.03, type: 'triangle', gain: 0.03 }); noise({ dur: 0.012, gain: 0.03, hp: 1800, lp: 6000 }); },
  deal: () => { noise({ dur: 0.11, gain: 0.07, hp: 600, lp: 1200, sweep: 5200, decay: false }); tone({ freq: 420, dur: 0.04, type: 'triangle', gain: 0.025, at: 0.06 }); },
  flip: () => { noise({ dur: 0.07, gain: 0.05, hp: 2200, lp: 9000 }); tone({ freq: 1200, dur: 0.04, type: 'triangle', gain: 0.02, slide: 500 }); },
  reveal: () => { tone({ freq: 1046, dur: 0.28, gain: 0.05, send: 0.45 }); tone({ freq: 2093, dur: 0.18, gain: 0.025, at: 0.01, send: 0.3 }); tone({ freq: 3136, dur: 0.1, gain: 0.012, at: 0.02 }); },
  win: () => { [523, 659, 784, 1046].forEach((f, i) => { tone({ freq: f, dur: 0.22, type: 'triangle', gain: 0.06, at: i * 0.07, send: 0.35 }); tone({ freq: f * 2, dur: 0.12, gain: 0.015, at: i * 0.07 }); }); noise({ dur: 0.25, gain: 0.02, hp: 6000, at: 0.2 }); },
  bigwin: () => {
    const chords = [[523, 659, 784], [587, 740, 880], [659, 831, 988], [784, 988, 1175, 1568]];
    chords.forEach((c, i) => c.forEach((f) => tone({ freq: f, dur: i === 3 ? 0.9 : 0.3, type: 'sawtooth', gain: 0.03, at: i * 0.16, filter: 2800, q: 1.2, send: 0.4 })));
    for (let i = 0; i < 10; i++) coin(0.55 + i * 0.05, 3000 + Math.random() * 2500, 0.03);
    noise({ dur: 0.8, gain: 0.025, hp: 7000, at: 0.5, send: 0.4 });
  },
  lose: () => { tone({ freq: 110, dur: 0.32, type: 'sine', gain: 0.1, slide: -55 }); tone({ freq: 330, dur: 0.18, type: 'triangle', gain: 0.03, slide: -20 }); noise({ dur: 0.18, gain: 0.05, hp: 60, lp: 320 }); },
  cashout: () => { coin(0, 2637, 0.06); coin(0.07, 3136, 0.05); coin(0.14, 3951, 0.05); noise({ dur: 0.12, gain: 0.03, hp: 5000, at: 0.1 }); },
  coins: () => { for (let i = 0; i < 9; i++) coin(i * 0.045, 2200 + Math.random() * 2200, 0.045); },
  peg: () => { tone({ freq: 2300 + Math.random() * 900, dur: 0.03, gain: 0.025 }); },
  land: () => { tone({ freq: 190, dur: 0.14, type: 'triangle', gain: 0.07, slide: -100 }); noise({ dur: 0.08, gain: 0.05, hp: 80, lp: 700 }); },
  launch: () => { tone({ freq: 140, dur: 0.6, type: 'sawtooth', gain: 0.035, slide: 520, filter: 900, q: 2 }); noise({ dur: 0.6, gain: 0.03, hp: 300, lp: 600, sweep: 6000, decay: false }); },
  crash: () => { noise({ dur: 0.55, gain: 0.28, hp: 40, lp: 3200, sweep: 180 }); tone({ freq: 85, dur: 0.6, type: 'sine', gain: 0.16, slide: -55 }); noise({ dur: 0.3, gain: 0.08, hp: 1500, lp: 6000, at: 0.03 }); },
  bomb: () => { noise({ dur: 0.4, gain: 0.22, hp: 50, lp: 2400, sweep: 150 }); tone({ freq: 95, dur: 0.4, type: 'sawtooth', gain: 0.1, slide: -60, filter: 500 }); },
  pop: () => { tone({ freq: 640, dur: 0.05, type: 'sine', gain: 0.06, slide: -320 }); noise({ dur: 0.03, gain: 0.05, hp: 1200 }); },
  chest: () => { tone({ freq: 130, dur: 0.55, type: 'sawtooth', gain: 0.035, slide: 70, filter: 420, q: 4 }); [0, 0.12, 0.26, 0.42].forEach((at) => noise({ dur: 0.02, gain: 0.04, hp: 900, lp: 3000, at })); },
  beep: () => { tone({ freq: 880, dur: 0.06, type: 'square', gain: 0.025 }); },
  whoosh: () => { noise({ dur: 0.3, gain: 0.05, hp: 400, lp: 900, sweep: 7000, decay: false }); },
};
export const sound = {
  get enabled() { return read(SOUND_KEY) !== 'off'; },
  set enabled(v) { store(SOUND_KEY, v ? 'on' : 'off'); },
  get volume() { const v = Number(read(VOL_KEY)); return Number.isFinite(v) && v > 0 ? Math.min(1, v) : 0.8; },
  set volume(v) { store(VOL_KEY, String(v)); if (bus) bus.master.gain.value = v; },
  play(name) {
    if (!this.enabled) return;
    try { ensureBus(); CUES[name]?.(); } catch { /* audio unavailable */ }
    const hp = { bomb: [30, 30, 60], crash: [30, 30, 60], bigwin: [15, 30, 15, 30, 40], win: 18, cashout: 18, lose: 35, coins: [10, 20, 10], land: 10 }[name];
    if (hp) haptic(hp);
  },
};
/** Haptic tap on devices that have it (phones). Follows the sound toggle. */
export function haptic(pattern = 12) {
  if (read(HAPTIC_KEY) === 'off' || !sound.enabled) return;
  try { navigator.vibrate?.(pattern); } catch { /* ignore */ }
}

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
