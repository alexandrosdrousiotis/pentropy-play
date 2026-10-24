// Social layer: live bet feed, big wins, leaders, chat and the online count.
// Everything real comes from the rounds table; simulated players live in memory and are flagged.
import { HttpError } from './security.js';
import { botRound } from '../shared/social-bots.js';

const agt = (c) => c / 100;
const name = (row) => (row.ghost ? 'Hidden' : row.username);

export function createSocial(db, config) {
  const q = {
    feed: db.prepare(`SELECT r.id, r.game, r.amount, r.multiplier, r.payout, r.settled_at, u.username, u.ghost FROM rounds r JOIN users u ON u.id = r.user_id
      WHERE r.status = 'settled' AND r.settled_at > ? ORDER BY r.settled_at DESC, r.id DESC LIMIT ?`),
    big: db.prepare(`SELECT r.id, r.game, r.amount, r.multiplier, r.payout, r.settled_at, u.username, u.ghost FROM rounds r JOIN users u ON u.id = r.user_id
      WHERE r.status = 'settled' AND r.settled_at > ? AND r.payout > r.amount ORDER BY r.payout DESC LIMIT ?`),
    leaders: db.prepare(`SELECT u.username, u.ghost, COUNT(*) AS bets, SUM(r.amount) AS wagered, SUM(r.payout - r.amount) AS net, MAX(r.multiplier) AS best
      FROM rounds r JOIN users u ON u.id = r.user_id WHERE r.status = 'settled' AND r.settled_at > ? GROUP BY u.id ORDER BY wagered DESC LIMIT ?`),
    online: db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM sessions WHERE last_seen > ?'),
    chatAfter: db.prepare('SELECT id, username, text, at FROM chat WHERE id > ? ORDER BY id DESC LIMIT ?'),
    chatInsert: db.prepare('INSERT INTO chat (user_id, username, text, at) VALUES (?, ?, ?, ?)'),
    chatLastByUser: db.prepare('SELECT at FROM chat WHERE user_id = ? ORDER BY id DESC LIMIT 1'),
    chatPrune: db.prepare('DELETE FROM chat WHERE id <= (SELECT MAX(id) FROM chat) - ?'),
  };
  const pub = (r) => ({ id: r.id, at: r.settled_at, username: name(r), bot: false, game: r.game, amount: agt(r.amount), multiplier: r.multiplier, payout: agt(r.payout), net: agt(r.payout - r.amount) });

  // ambient players: a ring buffer refilled on a timer; never persisted, never counted in any stat
  const bots = [];
  let timer = null;
  const ambient = config.social?.ambient !== false;
  function tick() {
    if (ambient) { bots.push(botRound()); while (bots.length > 200) bots.shift(); }
    timer = setTimeout(tick, 700 + Math.random() * 2200); timer.unref?.();
  }
  if (ambient) { for (let i = 0; i < 24; i++) bots.push(botRound(Math.random, Date.now() - (24 - i) * 1500)); tick(); }

  return {
    ambient,
    /** Bets settled after `after` (ms), newest first. */
    feed(after = 0, limit = 40) {
      const real = q.feed.all(after, limit).map(pub);
      const sim = bots.filter((b) => b.at > after).slice(-limit);
      return [...real, ...sim].sort((a, b) => b.at - a.at).slice(0, limit);
    },
    big(limit = 12) {
      const since = Date.now() - 24 * 3600e3;
      const real = q.big.all(since, limit).map(pub);
      const sim = bots.filter((b) => b.payout > b.amount);
      return [...real, ...sim].sort((a, b) => b.payout - a.payout).slice(0, limit);
    },
    leaders(limit = 10) {
      const since = Date.now() - 24 * 3600e3;
      const real = q.leaders.all(since, limit).map((r) => ({ username: name(r), bot: false, bets: r.bets, wagered: agt(r.wagered), net: agt(r.net), best: r.best }));
      const agg = {};
      for (const b of bots) { const a = (agg[b.username] ||= { username: b.username, bot: true, bets: 0, wagered: 0, net: 0, best: 0 }); a.bets++; a.wagered += b.amount; a.net += b.net; a.best = Math.max(a.best, b.multiplier); }
      const sim = Object.values(agg).map((a) => ({ ...a, wagered: Math.round(a.wagered * 100) / 100, net: Math.round(a.net * 100) / 100 }));
      return [...real, ...sim].sort((a, b) => b.wagered - a.wagered).slice(0, limit);
    },
    online() { return q.online.get(Date.now() - 5 * 60e3).n + (ambient ? 11 + (Math.floor(Date.now() / 60e3) % 7) : 0); },
    chat(after = 0, limit = 60) { return q.chatAfter.all(after, limit).reverse(); },
    say(user, text) {
      const last = q.chatLastByUser.get(user.id);
      if (last && Date.now() - last.at < 1500) throw new HttpError(429, 'Slow down.');
      const clean = text.replace(/\s+/g, ' ').trim();
      if (!clean) throw new HttpError(400, 'Say something.');
      const at = Date.now();
      const id = Number(q.chatInsert.run(user.id, user.username, clean, at).lastInsertRowid);
      q.chatPrune.run(config.social?.chatKeep ?? 500);
      return { id, username: user.username, text: clean, at };
    },
    close() { clearTimeout(timer); },
  };
}
