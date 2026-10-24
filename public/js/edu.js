// The anti-gambling layer: lessons, reality checks, milestones and the bankruptcy flow.
import { api, me, user, sessionNet, sessionMinutes, subscribe } from './api.js';
import { h, modal, toast, fmt, fmtSigned, fmtMoney, button } from './ui.js';

export const LESSONS = [
  {
    id: 'rtp', title: 'What “99% RTP” really means', unlock: 0,
    summary: 'Return to player is an average over millions of bets, not a promise to you.',
    body: [
      'RTP (return to player) says that, across an enormous number of bets, the game pays back 99 tokens for every 100 wagered. The missing 1 is the house edge.',
      'It does not mean you keep 99% of your money. It means that every single bet you place has a negative expected value: on average you lose 1% of the stake, every time, no matter what you do.',
      'Every game here shows its edge and your expected loss before you click. Watch the “expected loss” tile and compare it to the “actual” one in your stats after a few hundred bets.',
    ],
  },
  {
    id: 'turnover', title: 'The edge compounds with turnover', unlock: 10,
    summary: 'A 1% edge on a stake is a 1% edge every time the same tokens are re-bet.',
    body: [
      'Say you have 1,000 tokens and bet 10 per round at 99% RTP. The edge takes about 0.10 per round. After 1,000 rounds (an evening of fast play), you have wagered 10,000 tokens in total and the expected loss is 100 tokens: 10% of your bankroll, from a “tiny” 1% edge.',
      'Casinos do not need a big edge. They need you to keep re-betting. Speed, auto-bet and “one more round” all exist to increase turnover.',
      'The number that matters is not the RTP; it is how much you cycle through the game. Check “Total wagered” on your stats page; it is probably far bigger than you think.',
    ],
  },
  {
    id: 'ceiling', title: 'The 1,000,000x ceiling is a decoy', unlock: 25,
    summary: 'Huge maximum multipliers do not change the expected return. They change how it feels.',
    body: [
      'Limbo at 1,000,000x pays exactly 99% on average, the same as a 1.1x target. The chance of hitting 1,000,000x is 0.000099%. You would need, on average, about one million bets to see it once, losing 99% of them along the way.',
      'High ceilings do one thing: they make the losses feel like a path to something. Your brain remembers the one 50x hit and forgets the two hundred losses that paid for it.',
      'Compare the games in the lobby: ceilings range from 2.5x to 5,148,297x and the RTP barely moves. The ceiling is marketing. The edge is the product.',
    ],
  },
  {
    id: 'fallacy', title: 'Dice have no memory', unlock: 50,
    summary: 'Five losses in a row does not make a win more likely. Each round is independent.',
    body: [
      'Every outcome here is derived from a fresh HMAC of the server seed, your client seed and a nonce. Nothing about the last roll leaks into the next one. A game that is “due” is a feeling, not a fact.',
      'The gambler’s fallacy drives the most expensive behaviour in gambling: raising stakes after losses (“Martingale”). Doubling after each loss turns a 1% edge into a guaranteed bankroll wipe, because the losing streak that exceeds your balance will eventually come, and the sequence that precedes it is just losses.',
      'Try it in Dice with the “double after loss” helper button and watch how fast the balance curve bends down on the stats page.',
    ],
  },
  {
    id: 'chasing', title: 'Chasing losses', unlock: 100,
    summary: 'The urge to “win it back” is the single most predictable response to losing, and the most harmful.',
    body: [
      'After a loss, players bet larger and faster. This is called loss-chasing and it is the behaviour that turns entertainment into harm. The maths does not care how much you are down: the next bet still has the same negative expectation.',
      'Signs you are chasing: betting more than you planned, playing to get back to even, feeling relief rather than joy when you win.',
      'The limits page lets you set a loss limit and a session timer for yourself. Real casinos offer the same tools, buried in a menu. Use them.',
    ],
  },
  {
    id: 'design', title: 'How the design works on you', unlock: 150,
    summary: 'Near-misses, speed, tiny stakes, big numbers, and auto-bet are engineered features.',
    body: [
      'Near-misses (the crash at 1.98x when you set 2.00x, the mine next to your last gem) activate the same reward circuits as wins. They are not evidence that you were close. In Plinko the 10,000x bin is one row away from 182x and the ball lands there by pure chance.',
      'Speed matters: a 3-second round at 99% RTP loses money twenty times faster than a 60-second one. Auto-bet exists to remove the only friction left: your decision.',
      'Tiny minimum stakes, token-ised balances and multipliers instead of money make the loss feel abstract. That is why your stats page converts every number back into “if this were real money”.',
    ],
  },
  {
    id: 'fair', title: '“Provably fair” is not “fair odds”', unlock: 200,
    summary: 'You can verify every outcome here, and every outcome is still built to take 1%.',
    body: [
      'Provably fair cryptography proves the operator did not rig a specific roll. It says nothing about the pay table. A game can be perfectly fair in that sense and still be certain to beat you over time, because the edge is in the rules, not in the dice.',
      'Use the fairness page to replay any bet in your history from the seeds. You will find that it matches every time. Then look at the result: the game did not need to cheat.',
    ],
  },
  {
    id: 'skill', title: 'Skill games are still negative', unlock: 300,
    summary: 'Blackjack and video poker reward good decisions, but perfect play still loses.',
    body: [
      'Blackjack at 99.43% RTP and 9/6 Jacks or Better at 99.54% are the best odds in any casino. Those numbers assume perfect play on every hand. Every mistake lowers them, and most players make many.',
      'Even perfect play has a negative expectation. Skill in these games means losing more slowly. It is never the path to winning.',
      'A real card counter in a real casino with real deck penetration can tilt the edge slightly positive, and will be asked to leave. Online games reshuffle every hand to make that impossible. The one in this platform draws from an infinite shoe for exactly that reason.',
    ],
  },
  {
    id: 'help', title: 'If this stopped being a game', unlock: 0,
    summary: 'Help exists, it is free, and it works.',
    body: [
      'If gambling with real money is causing you or someone close to you harm, talk to someone. These services are confidential and free:',
      h('ul', {},
        h('li', {}, 'UK: GamCare National Gambling Helpline, 0808 8020 133 (24/7), gamcare.org.uk'),
        h('li', {}, 'US: National Problem Gambling Helpline, 1‑800‑GAMBLER (call or text), ncpgambling.org'),
        h('li', {}, 'Australia: Gambling Help Online, 1800 858 858, gamblinghelponline.org.au'),
        h('li', {}, 'Ireland: Gambling Awareness Trust, gamblingcare.ie'),
        h('li', {}, 'Elsewhere: search for “gambling helpline” plus your country. Gamblers Anonymous meets in most countries.'),
      ),
      'Self-exclusion schemes (GAMSTOP in the UK, for example) block you from every licensed operator at once. Blocking software such as Gamban works on devices.',
    ],
  },
];

export const lessonById = (id) => LESSONS.find((l) => l.id === id);
export const lessonUnlocked = (lesson, m = me()) => (m?.stats.bets ?? 0) >= lesson.unlock;

/* ---------------- reality checks ---------------- */
let lastRealityBets = 0;
let lastRealityTime = Date.now();
let realityOpen = false;

export function resetRealityClock() {
  lastRealityBets = me()?.stats.bets ?? 0;
  lastRealityTime = Date.now();
}

export function summaryBody(m = me()) {
  const s = m.stats;
  const p = m.user;
  const net = s.returned - s.wagered;
  const sessNet = sessionNet();
  return h('div', { class: 'stack' },
    h('div', { class: 'stat-grid' },
      tile('This session', fmtSigned(sessNet) + ' AGT', sessNet >= 0 ? 'good' : 'bad'),
      tile('Minutes this session', Math.round(sessionMinutes())),
      tile('All-time wagered', fmt(s.wagered)),
      tile('All-time net', fmtSigned(net) + ' AGT', net >= 0 ? 'good' : 'bad'),
      tile('House edge expected', '−' + fmt(s.expectedLoss) + ' AGT'),
      tile('If 1 AGT = ' + fmtMoney(p.notional), fmtMoney(net * p.notional).replace('€-', '−€'), net >= 0 ? 'good' : 'bad'),
    ),
    h('p', { class: 'help' }, net < 0
      ? `Your actual result (${fmtSigned(net)}) is close to what the house edge predicts (−${fmt(s.expectedLoss)}). Variance moves it around; the edge sets the direction.`
      : `You are ahead of expectation by ${fmt(net + s.expectedLoss)} AGT. That gap is variance. The expected line is −${fmt(s.expectedLoss)} and it only goes one way.`),
  );
}

const tile = (l, v, cls = '') => h('div', { class: 'tile' }, h('div', { class: `v ${cls}` }, v), h('div', { class: 'l' }, l));

export async function maybeRealityCheck() {
  const m = me();
  if (!m || realityOpen) return;
  const every = m.user.limits.realityEvery || 25;
  const byBets = m.stats.bets - lastRealityBets >= every;
  const byTime = Date.now() - lastRealityTime >= 10 * 60000 && m.stats.bets > lastRealityBets;
  if (!byBets && !byTime) return;
  realityOpen = true;
  await modal({
    title: 'Reality check',
    body: h('div', { class: 'stack' },
      h('p', { class: 'lead' }, `You have placed ${m.stats.bets - lastRealityBets} bets since the last check. Here is where you stand.`),
      summaryBody(m)),
    actions: [{ label: 'Take a break', kind: 'primary', value: 'break' }, { label: 'Continue', kind: 'tertiary', value: 'go' }],
    dismissible: false,
  }).then((v) => { if (v === 'break') location.hash = '#/stats'; });
  realityOpen = false;
  resetRealityClock();
}

/* ---------------- milestones ---------------- */
const MILESTONES = [
  { id: 'first', at: 1, text: 'First bet placed. From here on, every tile marked “expected” is what the maths predicts you will lose.' },
  { id: 'b10', at: 10, lesson: 'turnover' },
  { id: 'b25', at: 25, lesson: 'ceiling' },
  { id: 'b50', at: 50, lesson: 'fallacy' },
  { id: 'b100', at: 100, lesson: 'chasing' },
  { id: 'b150', at: 150, lesson: 'design' },
  { id: 'b200', at: 200, lesson: 'fair' },
  { id: 'b300', at: 300, lesson: 'skill' },
];
const seenKey = () => `pentropy.milestones.${user()?.username}`;
function markMilestone(id) {
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem(seenKey())) || []; } catch { /* unavailable */ }
  if (seen.includes(id)) return false;
  seen.push(id);
  try { localStorage.setItem(seenKey(), JSON.stringify(seen)); } catch { /* unavailable */ }
  return true;
}
export function checkMilestones() {
  const m = me();
  if (!m) return;
  for (const ms of MILESTONES) {
    if (m.stats.bets >= ms.at && markMilestone(ms.id)) {
      if (ms.lesson) toast(`New lesson unlocked: “${lessonById(ms.lesson).title}”`, 'good', 4500);
      else if (ms.text) toast(ms.text, '', 5000);
    }
  }
  if (m.stats.wagered >= 10000 && markMilestone('w10k')) toast('You have now wagered 10,000 AGT in total. Ten times your starting balance has passed through the house.', 'warn', 6000);
}

/* ---------------- bankruptcy ---------------- */
const START = 1000, REFILL = 1000;
let bankruptOpen = false;
export async function maybeBankrupt() {
  const m = me();
  if (!m || bankruptOpen || m.user.balance >= 0.1 || m.openRound) return;
  bankruptOpen = true;
  const s = m.stats, p = m.user;
  const unread = LESSONS.filter((l) => lessonUnlocked(l, m) && !p.lessonsRead.includes(l.id));
  const lesson = unread[0] || LESSONS[p.refills % LESSONS.length];
  const lost = START + p.refills * REFILL;
  let readOk = false;
  const readBtn = button('Read: ' + lesson.title, { kind: 'accent', onClick: async () => { await openLesson(lesson); readOk = true; refillBtn.disabled = false; } });
  const refillBtn = button(`Refill ${fmt(REFILL, 0)} AGT`, { kind: 'primary', disabled: true, onClick: async () => {
    if (!readOk) return;
    try { await api.refill(lesson.id); bg.remove(); bankruptOpen = false; toast('Refilled. This is the part real casinos do not offer.', 'warn'); }
    catch (e) { toast(e.message, 'bad'); }
  } });
  const body = h('div', { class: 'modal', role: 'dialog' },
    h('h2', { class: 'gt' }, p.refills === 0 ? 'You are out of tokens' : `Out of tokens, again (${p.refills + 1})`),
    h('p', { class: 'lead' }, `It took ${s.bets} bets and ${fmt(s.wagered)} AGT of total wagering to lose ${fmt(lost, 0)} AGT. If one token had been ${fmtMoney(p.notional)}, that is ${fmtMoney(lost * p.notional)} gone.`),
    summaryBody(m),
    h('p', { class: 't-body' }, 'Tokens here are free and imaginary. The point of running out is to feel the shape of it without the consequences. Read one lesson to refill.'),
    h('div', { class: 'actions' }, readBtn, refillBtn, button('Go to stats', { kind: 'ghost', onClick: () => { bg.remove(); bankruptOpen = false; location.hash = '#/stats'; } })));
  const bg = h('div', { class: 'modal-bg' }, body);
  document.body.append(bg);
}

export function openLesson(lesson) {
  if (user() && !user().lessonsRead.includes(lesson.id)) api.readLesson(lesson.id).catch(() => {});
  return modal({
    title: lesson.title,
    body: h('div', { class: 'lesson' }, h('p', { class: 'lead' }, lesson.summary), h('div', { class: 'body' }, ...lesson.body.map((b) => (typeof b === 'string' ? h('p', {}, b) : b)))),
    actions: [{ label: 'Done', kind: 'primary' }],
  });
}

/** Wire everything to the store. Call once at boot. */
export function install() {
  subscribe(async (type) => {
    if (type !== 'settle') return;
    checkMilestones();
    await maybeBankrupt();
    await maybeRealityCheck();
  });
  resetRealityClock();
}
