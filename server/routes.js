// JSON API. Every money movement happens inside a single synchronous SQLite transaction.
import { HttpError, bad, v, assertSameOrigin, parseCookies, sessionCookie, cookieName } from './security.js';
import { transaction } from './db.js';
import { FairRng, randomHex, sha256Hex } from './fairness.js';
import { GAMES, GAME_IDS } from '../shared/engine.js';
import { LESSON_IDS } from './lessons.js';
import { TIERS, tierFor, tierById, nextTier, DRIPS, DRIP_IDS, dripAmount, CHEST, chestExpected, chestAmount, REFERRAL } from '../shared/tiers.js';
import { randomInt } from 'node:crypto';
import { LiveTable } from '../shared/live.js';

const cents = (agt) => Math.round(agt * 100);
const agt = (c) => c / 100;
const now = () => Date.now();

export function createApi({ db, config, auth, seedCipher, social }) {
  const q = {
    user: db.prepare('SELECT * FROM users WHERE id = ?'),
    setBalance: db.prepare('UPDATE users SET balance = ? WHERE id = ?'),
    setProfile: db.prepare('UPDATE users SET notional_cents = ?, limits = ?, ghost = ? WHERE id = ?'),
    setLessons: db.prepare('UPDATE users SET lessons = ? WHERE id = ?'),
    refill: db.prepare('UPDATE users SET balance = ?, refills = refills + 1, lessons = ? WHERE id = ?'),
    seeds: db.prepare('SELECT * FROM seeds WHERE user_id = ?'),
    bumpNonce: db.prepare('UPDATE seeds SET nonce = nonce + 1 WHERE user_id = ?'),
    replaceSeeds: db.prepare('UPDATE seeds SET server_seed_enc = ?, server_seed_hash = ?, client_seed = ?, nonce = 0 WHERE user_id = ?'),
    insertHistory: db.prepare('INSERT INTO seed_history (user_id, server_seed, server_seed_hash, client_seed, nonces, revealed_at) VALUES (?, ?, ?, ?, ?, ?)'),
    seedHistory: db.prepare('SELECT server_seed, server_seed_hash, client_seed, nonces, revealed_at FROM seed_history WHERE user_id = ? ORDER BY id DESC LIMIT 20'),
    openRound: db.prepare("SELECT * FROM rounds WHERE user_id = ? AND status = 'open'"),
    roundById: db.prepare('SELECT * FROM rounds WHERE id = ? AND user_id = ?'),
    insertRound: db.prepare(`INSERT INTO rounds (user_id, game, base, amount, rtp, params, nonce, server_seed_hash, client_seed, status, state, multiplier, payout, outcome, floats_used, balance_after, opened_at, settled_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    updateOpen: db.prepare("UPDATE rounds SET state = ?, amount = ?, floats_used = ? WHERE id = ? AND status = 'open'"),
    settleRound: db.prepare("UPDATE rounds SET status = 'settled', state = NULL, amount = ?, multiplier = ?, payout = ?, outcome = ?, floats_used = ?, balance_after = ?, settled_at = ? WHERE id = ? AND status = 'open'"),
    liveRoundInsert: db.prepare('INSERT INTO live_rounds (game, seed_hash, opened_at) VALUES (?, ?, ?)'),
    liveRoundEnd: db.prepare('UPDATE live_rounds SET seed = ?, result = ?, ended_at = ? WHERE id = ?'),
    liveBetInsert: db.prepare("INSERT INTO live_bets (game, round_id, user_id, amount, params, status, at) VALUES (?, ?, ?, ?, ?, 'open', ?)"),
    liveBetSet: db.prepare('UPDATE live_bets SET status = ? WHERE id = ?'),
    liveOpenBets: db.prepare("SELECT * FROM live_bets WHERE status = 'open'"),
    userByRef: db.prepare('SELECT * FROM users WHERE ref_code = ? COLLATE NOCASE'),
    setRefCode: db.prepare('UPDATE users SET ref_code = ? WHERE id = ? AND ref_code IS NULL'),
    setReferredBy: db.prepare('UPDATE users SET referred_by = ?, balance = ?, bonuses = bonuses + ? WHERE id = ?'),
    addRefPending: db.prepare('UPDATE users SET ref_pending = ref_pending + ? WHERE id = ?'),
    claimRef: db.prepare('UPDATE users SET ref_pending = ref_pending - ?, ref_claimed = ref_claimed + ?, balance = ? WHERE id = ?'),
    referrals: db.prepare(`SELECT u.id, u.username, u.created_at, COALESCE(SUM(r.amount),0) AS wagered, COALESCE(SUM(r.amount * (1 - r.rtp)),0) AS edge
      FROM users u LEFT JOIN rounds r ON r.user_id = u.id AND r.status = 'settled' WHERE u.referred_by = ? GROUP BY u.id ORDER BY u.created_at DESC LIMIT 100`),
    history: db.prepare("SELECT id, game, base, amount, rtp, params, nonce, server_seed_hash, client_seed, status, multiplier, payout, outcome, floats_used, balance_after, opened_at, settled_at FROM rounds WHERE user_id = ? AND status = 'settled' ORDER BY id DESC LIMIT ?"),
    stats: db.prepare(`SELECT COUNT(*) AS bets, COALESCE(SUM(amount),0) AS wagered, COALESCE(SUM(payout),0) AS returned,
                       COALESCE(SUM(CASE WHEN payout > amount THEN 1 ELSE 0 END),0) AS wins, COALESCE(MAX(payout - amount),0) AS biggestWin,
                       COALESCE(MAX(amount - payout),0) AS biggestLoss, COALESCE(SUM(amount * (1 - rtp)),0) AS expectedLoss
                       FROM rounds WHERE user_id = ? AND status = 'settled'`),
    byGame: db.prepare("SELECT game, COUNT(*) AS bets, SUM(amount) AS wagered, SUM(payout) AS returned, MAX(multiplier) AS best FROM rounds WHERE user_id = ? AND status = 'settled' GROUP BY game"),
    curve: db.prepare("SELECT settled_at AS t, balance_after AS b FROM rounds WHERE user_id = ? AND status = 'settled' ORDER BY id DESC LIMIT 1500"),
    events: db.prepare('SELECT type, amount, balance_after, at FROM events WHERE user_id = ? ORDER BY id DESC LIMIT 100'),
    insertEvent: db.prepare('INSERT INTO events (user_id, type, amount, balance_after, at) VALUES (?, ?, ?, ?, ?)'),
    playTime: db.prepare('SELECT COALESCE(SUM(last_seen - created_at),0) AS ms FROM sessions WHERE user_id = ?'),
    faucetToday: db.prepare("SELECT COALESCE(SUM(amount),0) AS c FROM events WHERE user_id = ? AND type = 'deposit' AND at > ?"),
    setWallet: db.prepare('UPDATE users SET balance = ?, vault = ?, deposited = ? WHERE id = ?'),
    walletEvents: db.prepare("SELECT id, type, amount, balance_after, at FROM events WHERE user_id = ? AND type IN ('deposit','withdraw','vault_in','refill','rebate','bonus','referral') ORDER BY id DESC LIMIT 50"),
    wageredOf: db.prepare("SELECT COALESCE(SUM(amount),0) AS w FROM rounds WHERE user_id = ? AND status = 'settled'"),
    wageredSince: db.prepare("SELECT COALESCE(SUM(amount),0) AS w FROM rounds WHERE user_id = ? AND status = 'settled' AND settled_at > ?"),
    setDrips: db.prepare('UPDATE users SET drips = ?, bonuses = ?, balance = ? WHERE id = ?'),
    setRewards: db.prepare('UPDATE users SET tier = ?, rebate_pending = ?, rebate_claimed = ?, bonuses = ?, balance = ? WHERE id = ?'),
  };

  const serverSeedOf = (userId) => {
    const row = q.seeds.get(userId);
    return { row, serverSeed: seedCipher.decrypt(row.server_seed_enc) };
  };

  const publicRound = (r, view) => ({
    id: r.id, game: r.game, base: agt(r.base), amount: agt(r.amount), rtp: r.rtp, params: JSON.parse(r.params), nonce: r.nonce,
    serverSeedHash: r.server_seed_hash, clientSeed: r.client_seed, status: r.status,
    ...(r.status === 'settled'
      ? { multiplier: r.multiplier, payout: agt(r.payout), net: agt(r.payout - r.amount), outcome: JSON.parse(r.outcome), floatsUsed: r.floats_used, settledAt: r.settled_at, balanceAfter: agt(r.balance_after) }
      : { view, openedAt: r.opened_at }),
  });

  const limitsOf = (user) => JSON.parse(user.limits);
  const me = (user, session) => ({
    user: { username: user.username, balance: agt(user.balance), vault: agt(user.vault), deposited: agt(user.deposited), notional: agt(user.notional_cents), limits: limitsOf(user), lessonsRead: JSON.parse(user.lessons), refills: user.refills, createdAt: user.created_at, ghost: Boolean(user.ghost) },
    session: { startedAt: session.created_at, startBalance: agt(session.start_balance) },
    seeds: (() => { const s = q.seeds.get(user.id); return { serverSeedHash: s.server_seed_hash, clientSeed: s.client_seed, nonce: s.nonce }; })(),
    openRound: (() => { const r = q.openRound.get(user.id); return r ? publicRound(r, GAMES[r.game].view(JSON.parse(r.state), JSON.parse(r.params))) : null; })(),
    stats: statsOf(user.id),
    rewards: rewardsOf(user),
  });

  function statsOf(userId) {
    const s = q.stats.get(userId);
    return { bets: s.bets, wagered: agt(s.wagered), returned: agt(s.returned), net: agt(s.returned - s.wagered), wins: s.wins, losses: s.bets - s.wins, biggestWin: agt(s.biggestWin), biggestLoss: agt(s.biggestLoss), expectedLoss: agt(s.expectedLoss), playMs: q.playTime.get(userId).ms };
  }

  function checkLimits(user, session) {
    const l = limitsOf(user);
    if (l.lossLimit > 0 && session.start_balance - user.balance >= cents(l.lossLimit)) throw new HttpError(403, 'You reached the loss limit you set for this session. Sign out and back in to start a new session.');
    if (l.sessionMinutes > 0 && now() - session.created_at >= l.sessionMinutes * 60e3) throw new HttpError(403, 'You reached the session time limit you set. Sign out to end the session.');
  }

  /** Accrue rakeback on a settled stake and promote the tier when lifetime wager crosses a threshold. Runs inside the settlement transaction. */
  function accrueRewards(userId, amountCents, rtp, balance) {
    const u = q.user.get(userId);
    const edge = amountCents * (1 - rtp);
    let pending = u.rebate_pending + edge * tierById(u.tier).rate;
    let tier = u.tier, bonuses = u.bonuses, bal = balance;
    const earned = tierFor(agt(q.wageredOf.get(userId).w));
    if (TIERS.findIndex((t) => t.id === earned.id) > TIERS.findIndex((t) => t.id === tier)) {
      // credit every level-up bonus passed, in order
      for (const t of TIERS) if (t.threshold > tierById(tier).threshold && t.threshold <= earned.threshold) { bal += cents(t.bonus); bonuses += cents(t.bonus); q.insertEvent.run(userId, 'bonus', cents(t.bonus), bal, now()); }
      tier = earned.id;
    }
    q.setRewards.run(tier, pending, u.rebate_claimed, bonuses, bal, userId);
    if (u.referred_by) q.addRefPending.run(edge * REFERRAL.rate, u.referred_by); // the affiliate's cut comes out of the edge, not the win
    return bal;
  }
  function rewardsOf(u) {
    const wagered = agt(q.wageredOf.get(u.id).w);
    const tier = tierById(u.tier), next = nextTier(u.tier);
    const edgePaid = agt(q.stats.get(u.id).expectedLoss);
    return { tier: tier.id, rate: tier.rate, wagered, next: next ? { id: next.id, name: next.name, threshold: next.threshold, remaining: Math.max(0, next.threshold - wagered), progress: Math.min(1, (wagered - tier.threshold) / (next.threshold - tier.threshold)) } : null,
      rebatePending: Math.floor(u.rebate_pending) / 100, rebateClaimed: agt(u.rebate_claimed), bonuses: agt(u.bonuses), edgePaid, tiers: TIERS, drips: dripsOf(u), chest: chestOf(u) };
  }
  /** Timed bonuses: what each window would pay now, and when it unlocks. Claims are stored as {kind: lastClaimMs}. */
  function dripsOf(u) {
    const last = JSON.parse(u.drips || '{}'), t = now(), out = {};
    for (const kind of DRIP_IDS) {
      const d = DRIPS[kind], at = last[kind] || 0, ready = t - at >= d.windowMs;
      const wagered = agt(q.wageredSince.get(u.id, Math.max(at, t - d.windowMs)).w);
      out[kind] = { label: d.label, blurb: d.blurb, rate: d.rate, min: d.min, max: d.max, windowMs: d.windowMs, wagered, available: ready ? dripAmount(kind, wagered) : 0, ready, nextAt: ready ? t : at + d.windowMs, claimedAt: at || null };
    }
    return out;
  }
  /* ---------------- referrals ---------------- */
  const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function refCodeOf(u) {
    if (u.ref_code) return u.ref_code;
    for (let i = 0; i < 20; i++) {
      const code = Array.from({ length: 8 }, () => REF_ALPHABET[randomInt(0, REF_ALPHABET.length)]).join('');
      try { q.setRefCode.run(code, u.id); return q.user.get(u.id).ref_code; } catch { /* collision, try again */ }
    }
    throw new HttpError(500, 'Could not issue a referral code.');
  }
  function referralsOf(u) {
    const referred = q.referrals.all(u.id).map((r) => ({ username: r.username, joinedAt: r.created_at, wagered: agt(r.wagered), edge: agt(r.edge) }));
    return { code: refCodeOf(u), rate: REFERRAL.rate, bonus: REFERRAL.bonus, minClaim: REFERRAL.minClaim, count: referred.length, pending: Math.floor(u.ref_pending) / 100, claimed: agt(u.ref_claimed), referred };
  }
  function attachReferral(user, code) {
    const ref = q.userByRef.get(code);
    if (!ref || ref.id === user.id) return null;
    return transaction(db, () => {
      const u = q.user.get(user.id);
      const boost = cents(REFERRAL.bonus), balance = u.balance + boost;
      q.setReferredBy.run(ref.id, balance, boost, u.id);
      q.insertEvent.run(u.id, 'bonus', boost, balance, now());
      return ref.username;
    });
  }
  function claimReferral(user) {
    return transaction(db, () => {
      const u = q.user.get(user.id);
      const c = Math.floor(u.ref_pending);
      if (c < cents(REFERRAL.minClaim)) throw bad(`Referral earnings can be claimed from ${REFERRAL.minClaim} AGT.`);
      const balance = u.balance + c;
      q.claimRef.run(c, c, balance, u.id);
      q.insertEvent.run(u.id, 'referral', c, balance, now());
      return { ...referralsOf(q.user.get(u.id)), balance: agt(balance) };
    });
  }
  function chestOf(u) {
    const last = JSON.parse(u.drips || '{}').chest || 0, t = now();
    const ready = t - last >= CHEST.windowMs;
    const wagered = agt(q.wageredSince.get(u.id, Math.max(last, t - CHEST.windowMs)).w);
    return { ready, nextAt: ready ? t : last + CHEST.windowMs, wagered, fill: Math.min(1, wagered / CHEST.fillAt), expected: chestExpected(wagered), min: CHEST.min, max: CHEST.max, minRate: CHEST.minRate, maxRate: CHEST.maxRate, windowMs: CHEST.windowMs, openedAt: last || null };
  }
  function openChest(user) {
    return transaction(db, () => {
      const u = q.user.get(user.id);
      const c = chestOf(u);
      if (!c.ready) throw bad(`The chest opens in ${Math.ceil((c.nextAt - now()) / 60000)} min.`);
      if (c.wagered <= 0) throw bad('The chest fills as you play. Nothing has been wagered since it last opened.');
      const roll = randomInt(0, 1_000_000) / 1_000_000;
      const amount = chestAmount(c.wagered, roll), cts = cents(amount), balance = u.balance + cts;
      const last = JSON.parse(u.drips || '{}'); last.chest = now();
      q.setDrips.run(JSON.stringify(last), u.bonuses + cts, balance, u.id);
      q.insertEvent.run(u.id, 'bonus', cts, balance, now());
      return { ...rewardsOf(q.user.get(u.id)), balance: agt(balance), amount, roll, kind: 'chest' };
    });
  }
  function claimDrip(user, kind) {
    return transaction(db, () => {
      const u = q.user.get(user.id);
      const d = dripsOf(u)[kind];
      if (!d.ready) throw bad(`${d.label} unlocks in ${Math.ceil((d.nextAt - now()) / 60000)} min.`);
      if (d.available <= 0) throw bad(`Nothing wagered in the window, so there is nothing to give back.`);
      const c = cents(d.available), balance = u.balance + c;
      const last = JSON.parse(u.drips || '{}'); last[kind] = now();
      q.setDrips.run(JSON.stringify(last), u.bonuses + c, balance, u.id);
      q.insertEvent.run(u.id, 'bonus', c, balance, now());
      return { ...rewardsOf(q.user.get(u.id)), balance: agt(balance), claimed: d.available, kind };
    });
  }
  function claimRebate(user) {
    return transaction(db, () => {
      const u = q.user.get(user.id);
      const c = Math.floor(u.rebate_pending);
      if (c < 100) throw bad('Rebates can be claimed from 1.00 AGT.');
      const balance = u.balance + c;
      q.setRewards.run(u.tier, u.rebate_pending - c, u.rebate_claimed + c, u.bonuses, balance, u.id);
      q.insertEvent.run(u.id, 'rebate', c, balance, now());
      return { ...rewardsOf(q.user.get(u.id)), balance: agt(balance) };
    });
  }

  /* ---------------- shared live rounds (crash, roulette) ---------------- */
  // A server restart refunds whatever was riding on a round that no longer exists.
  for (const b of q.liveOpenBets.all()) { transaction(db, () => { const u = q.user.get(b.user_id); if (u) q.setBalance.run(u.balance + b.amount, u.id); q.liveBetSet.run('refunded', b.id); }); }
  const liveHooks = (game) => ({
    now, bots: config.social?.ambient !== false,
    seed: () => randomHex(32),
    nextId: (seed, hash) => Number(q.liveRoundInsert.run(game, hash, now()).lastInsertRowid),
    ended: (r) => q.liveRoundEnd.run(r.seed, r.result, now(), r.id),
    debit: (ctx, cents, meta) => transaction(db, () => {
      const u = q.user.get(ctx.user.id);
      checkLimits(u, ctx.session);
      if (cents < config.tokens.minBet) throw bad(`Minimum bet is ${agt(config.tokens.minBet)} AGT.`);
      if (cents > config.tokens.maxBet) throw bad(`Maximum bet is ${agt(config.tokens.maxBet).toLocaleString()} AGT.`);
      if (cents > u.balance) throw bad('Not enough tokens.');
      const balance = u.balance - cents;
      q.setBalance.run(balance, u.id);
      const ref = Number(q.liveBetInsert.run(game, meta.round.id, u.id, cents, JSON.stringify({ ...meta.params, auto: meta.auto }), now()).lastInsertRowid);
      return { balance, ref };
    }),
    settle: (bet, round, payout, outcome) => transaction(db, () => {
      const u = q.user.get(bet.userId); if (!u) return 0;
      const rtp = game === 'crash' ? 0.99 : 36 / 37, t = now();
      let balance = u.balance + payout;
      q.setBalance.run(balance, u.id);
      q.insertRound.run(u.id, game, bet.amount, bet.amount, rtp, JSON.stringify({ ...bet.params, live: round.id }), 0, round.seedHash, `live:${round.id}`, 'settled', null, payout / bet.amount, payout, JSON.stringify({ ...outcome, round: round.id }), 0, balance, bet.placedAt, t);
      q.liveBetSet.run('settled', bet.ref);
      balance = accrueRewards(u.id, bet.amount, rtp, balance);
      return balance;
    }),
    refund: (bet) => transaction(db, () => { const u = q.user.get(bet.userId); const balance = u.balance + bet.amount; q.setBalance.run(balance, u.id); q.liveBetSet.run('refunded', bet.ref); return balance; }),
  });
  const live = { crash: new LiveTable('crash', liveHooks('crash')), roulette: new LiveTable('roulette', liveHooks('roulette')) };
  const liveTimer = setInterval(() => { for (const t of Object.values(live)) { try { t.tick(); } catch (e) { console.error('live tick', e); } } }, 250);
  liveTimer.unref?.();
  const liveCall = (fn) => { try { return fn(); } catch (e) { if (e instanceof HttpError) throw e; throw bad(e.message); } };
  const liveState = (game, user) => { const s = live[game].state(user.id); return { ...s, balance: agt(q.user.get(user.id).balance) }; };

  /* ---------------- round lifecycle ---------------- */
  function openRound(user, session, { game, amount, params }) {
    const engine = GAMES[game];
    const p = engine.params(params);
    const stake = cents(amount);
    return transaction(db, () => {
      const u = q.user.get(user.id);
      if (q.openRound.get(u.id)) throw new HttpError(409, 'Finish the current round first.');
      checkLimits(u, session);
      if (stake < config.tokens.minBet) throw bad(`Minimum bet is ${agt(config.tokens.minBet)} AGT.`);
      if (stake > config.tokens.maxBet) throw bad(`Maximum bet is ${agt(config.tokens.maxBet).toLocaleString()} AGT.`);
      if (stake > u.balance) throw bad('Not enough tokens.');
      const { row: seeds, serverSeed } = serverSeedOf(u.id);
      q.bumpNonce.run(u.id);
      const rng = new FairRng(serverSeed, seeds.client_seed, seeds.nonce);
      const t = now();
      const result = engine.start(p, rng, t);
      const rtp = engine.rtp(p);
      let balance = u.balance - stake;
      let roundId;
      if (result.settled) {
        const units = result.multiplierUnits ?? result.multiplier;
        const payout = Math.round(stake * units);
        balance += payout;
        const multiplier = payout / stake;
        roundId = Number(q.insertRound.run(u.id, game, stake, stake, rtp, JSON.stringify(p), seeds.nonce, seeds.server_seed_hash, seeds.client_seed, 'settled', null, multiplier, payout, JSON.stringify(result.outcome), rng.used, balance, t, t).lastInsertRowid);
        q.setBalance.run(balance, u.id);
        balance = accrueRewards(u.id, stake, rtp, balance);
      } else {
        roundId = Number(q.insertRound.run(u.id, game, stake, stake, rtp, JSON.stringify(p), seeds.nonce, seeds.server_seed_hash, seeds.client_seed, 'open', JSON.stringify(result.state), null, null, null, rng.used, null, t, null).lastInsertRowid);
      }
      q.setBalance.run(balance, u.id);
      const r = q.roundById.get(roundId, u.id);
      return { round: publicRound(r, result.settled ? null : engine.view(result.state, p)), balance: agt(balance) };
    });
  }

  function actOnRound(user, { action, payload }) {
    return transaction(db, () => {
      const u = q.user.get(user.id);
      const r = q.openRound.get(u.id);
      if (!r) throw new HttpError(404, 'No open round.');
      const engine = GAMES[r.game];
      if (!engine.action) throw bad('This game has no actions.');
      const p = JSON.parse(r.params);
      const state = JSON.parse(r.state);
      const { serverSeed } = serverSeedOf(u.id);
      const rng = new FairRng(serverSeed, r.client_seed, r.nonce, r.floats_used);
      const t = now();
      const result = engine.action(state, p, action, payload, rng, t);
      let balance = u.balance;
      let amount = r.amount;
      if (result.extraUnits) {
        const extra = Math.round(r.base * result.extraUnits);
        if (extra > balance) throw bad('Not enough tokens for that action.');
        balance -= extra; amount += extra;
      }
      if (result.settled) {
        const units = result.multiplierUnits ?? result.multiplier;
        const payout = Math.round(r.base * units);
        balance += payout;
        q.settleRound.run(amount, payout / amount, payout, JSON.stringify(result.outcome), rng.used, balance, t, r.id);
        q.setBalance.run(balance, u.id);
        balance = accrueRewards(u.id, amount, r.rtp, balance);
      } else {
        q.updateOpen.run(JSON.stringify(result.state), amount, rng.used, r.id);
      }
      q.setBalance.run(balance, u.id);
      const fresh = q.roundById.get(r.id, u.id);
      return { round: publicRound(fresh, result.settled ? null : engine.view(result.state, p)), balance: agt(balance) };
    });
  }

  function rotateSeeds(user, clientSeed) {
    return transaction(db, () => {
      if (q.openRound.get(user.id)) throw new HttpError(409, 'Finish the current round before rotating seeds.');
      const { row, serverSeed } = serverSeedOf(user.id);
      q.insertHistory.run(user.id, serverSeed, row.server_seed_hash, row.client_seed, row.nonce, now());
      const next = randomHex(32);
      q.replaceSeeds.run(seedCipher.encrypt(next), sha256Hex(next), clientSeed || randomHex(8), user.id);
      return { previous: { serverSeed, serverSeedHash: row.server_seed_hash, clientSeed: row.client_seed, nonces: row.nonce }, current: { serverSeedHash: sha256Hex(next), clientSeed: clientSeed || q.seeds.get(user.id).client_seed, nonce: 0 } };
    });
  }

  function refill(user, lessonId) {
    return transaction(db, () => {
      const u = q.user.get(user.id);
      if (q.openRound.get(u.id)) throw new HttpError(409, 'Finish the current round first.');
      if (u.balance >= config.tokens.minBet) throw bad('You still have tokens to play with.');
      const lessons = JSON.parse(u.lessons);
      if (!lessons.includes(lessonId)) lessons.push(lessonId);
      q.refill.run(config.tokens.refill, JSON.stringify(lessons), u.id);
      q.insertEvent.run(u.id, 'refill', config.tokens.refill, config.tokens.refill, now());
      return { balance: agt(config.tokens.refill) };
    });
  }

  /* ---------------- wallet: deposit (faucet or vault) and withdraw (to vault) ---------------- */
  const walletAddress = (u) => 'agt1' + sha256Hex(`addr:${u.username.toLowerCase()}`).slice(0, 38);
  function walletOf(u) {
    const used = q.faucetToday.get(u.id, now() - 24 * 3600e3).c;
    return { balance: agt(u.balance), vault: agt(u.vault), deposited: agt(u.deposited), faucetAvailable: agt(Math.max(0, config.tokens.faucetPerDay - used)), faucetPerDay: agt(config.tokens.faucetPerDay), address: walletAddress(u),
      history: q.walletEvents.all(u.id).map((e) => ({ id: e.id, type: e.type, amount: agt(e.amount), balanceAfter: agt(e.balance_after), at: e.at, txid: sha256Hex(`${u.id}:${e.id}:${e.at}`).slice(0, 40) })) };
  }
  function deposit(user, amountAgt, source) {
    const amount = cents(amountAgt);
    return transaction(db, () => {
      const u = q.user.get(user.id);
      if (q.openRound.get(u.id)) throw new HttpError(409, 'Finish the current round first.');
      let balance = u.balance, vault = u.vault, deposited = u.deposited;
      if (source === 'vault') {
        if (amount > vault) throw bad('Not enough in the vault.');
        vault -= amount; balance += amount;
        q.insertEvent.run(u.id, 'vault_in', amount, balance, now());
      } else {
        const used = q.faucetToday.get(u.id, now() - 24 * 3600e3).c;
        if (amount > config.tokens.faucetPerDay - used) throw bad(`Daily deposit limit is ${agt(config.tokens.faucetPerDay).toLocaleString()} AGT. ${agt(Math.max(0, config.tokens.faucetPerDay - used))} left today.`);
        balance += amount; deposited += amount;
        q.insertEvent.run(u.id, 'deposit', amount, balance, now());
      }
      q.setWallet.run(balance, vault, deposited, u.id);
      return walletOf(q.user.get(u.id));
    });
  }
  function withdraw(user, amountAgt) {
    const amount = cents(amountAgt);
    return transaction(db, () => {
      const u = q.user.get(user.id);
      if (q.openRound.get(u.id)) throw new HttpError(409, 'Finish the current round first.');
      if (amount > u.balance) throw bad('Not enough tokens.');
      const balance = u.balance - amount, vault = u.vault + amount;
      q.insertEvent.run(u.id, 'withdraw', amount, balance, now());
      q.setWallet.run(balance, vault, u.deposited, u.id);
      return walletOf(q.user.get(u.id));
    });
  }

  /* ---------------- schemas ---------------- */
  const S = {
    credentials: { username: v.string({ min: 3, max: 20, pattern: /^[a-zA-Z0-9_]+$/ }), password: v.string({ min: 1, max: 128 }) },
    signup: { username: v.string({ min: 3, max: 20, pattern: /^[a-zA-Z0-9_]+$/ }), password: v.string({ min: 1, max: 128 }), ref: v.string({ min: 8, max: 8, pattern: /^[A-Za-z0-9]+$/, optional: true }) },
    bet: { game: v.oneOf(GAME_IDS), amount: v.number({ min: 0.1, max: 1_000_000, decimals: 2 }), params: v.obj({}, { optional: true, default: {} }) },
    action: { action: v.string({ min: 1, max: 20, pattern: /^[a-z]+$/ }), payload: v.obj({}, { optional: true, default: {} }) },
    profile: {
      notional: v.number({ min: 0, max: 1000, decimals: 2, optional: true }),
      limits: v.obj({ lossLimit: v.number({ min: 0, max: 1_000_000, decimals: 2 }), sessionMinutes: v.number({ min: 0, max: 1440, integer: true }), realityEvery: v.number({ min: 5, max: 500, integer: true }) }, { optional: true }),
      ghost: v.boolean({ optional: true }),
    },
    chat: { text: v.string({ min: 1, max: 200, pattern: /^[^\x00-\x1F\x7F]+$/ }) },
    drip: { kind: v.oneOf(DRIP_IDS) },
    liveCrash: { amount: v.number({ min: 0.1, max: 1_000_000, decimals: 2 }), auto: v.number({ min: 0, max: 1_000_000, decimals: 2, optional: true, default: 0 }) },
    liveRoulette: { amount: v.number({ min: 0.1, max: 1_000_000, decimals: 2 }), type: v.string({ min: 1, max: 12, pattern: /^[a-z]+$/ }), value: v.number({ min: 0, max: 36, integer: true, optional: true, default: 0 }) },
    lesson: { id: v.oneOf(LESSON_IDS) },
    rotate: { clientSeed: v.string({ min: 1, max: 64, pattern: /^[a-zA-Z0-9_-]+$/, optional: true }) },
    password: { password: v.string({ min: 1, max: 128 }) },
    deposit: { amount: v.number({ min: 1, max: 1_000_000, decimals: 2 }), source: v.oneOf(['faucet', 'vault'], { optional: true, default: 'faucet' }) },
    withdraw: { amount: v.number({ min: 1, max: 1_000_000, decimals: 2 }) },
  };
  // `params` and `payload` are validated by the engine against the game's own whitelist.
  const rawObj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});

  /* ---------------- routes ---------------- */
  const routes = [];
  const route = (method, path, opts, handler) => routes.push({ method, path, auth: opts.auth !== false, limiter: opts.limiter || 'general', handler });

  route('POST', '/api/auth/signup', { auth: false, limiter: 'auth' }, (c) => {
    const { username, password, ref } = v.object(c.body, S.signup);
    let user = auth.signUp(username, password);
    const referrer = ref ? attachReferral(user, ref.toUpperCase()) : null;
    if (referrer) user = q.user.get(user.id);
    const token = auth.startSession(user);
    c.setCookie(token);
    return { status: 201, body: { ...me(user, { created_at: now(), start_balance: user.balance }), welcome: { tokens: agt(config.tokens.start), referralBonus: referrer ? REFERRAL.bonus : 0, referrer } } };
  });
  route('POST', '/api/auth/login', { auth: false, limiter: 'auth' }, (c) => {
    const { username, password } = v.object(c.body, S.credentials);
    const user = auth.logIn(username, password);
    const token = auth.startSession(user);
    c.setCookie(token);
    return { body: me(user, { created_at: now(), start_balance: user.balance }) };
  });
  route('POST', '/api/auth/logout', {}, (c) => { auth.endSession(c.token); c.clearCookie(); return { body: { ok: true } }; });

  route('GET', '/api/me', {}, (c) => ({ body: me(c.user, c.session) }));
  route('PATCH', '/api/me', {}, (c) => {
    const p = v.object(c.body, S.profile);
    const u = q.user.get(c.user.id);
    const limits = p.limits ? { ...limitsOf(u), ...p.limits } : limitsOf(u);
    q.setProfile.run(p.notional != null ? cents(p.notional) : u.notional_cents, JSON.stringify(limits), p.ghost == null ? u.ghost : p.ghost ? 1 : 0, u.id);
    return { body: me(q.user.get(u.id), c.session) };
  });
  route('DELETE', '/api/me', {}, (c) => {
    const { password } = v.object(c.body, S.password);
    auth.deleteAccount(c.user, password);
    c.clearCookie();
    return { body: { ok: true } };
  });

  route('GET', '/api/stats', {}, (c) => {
    const curve = [...q.curve.all(c.user.id).reverse(), ...q.events.all(c.user.id).map((e) => ({ t: e.at, b: e.balance_after, refill: e.type === 'refill', event: e.type }))].sort((a, b) => a.t - b.t);
    return { body: { stats: statsOf(c.user.id), byGame: q.byGame.all(c.user.id).map((g) => ({ ...g, wagered: agt(g.wagered), returned: agt(g.returned) })), curve: [{ t: c.user.created_at, b: config.tokens.start }, ...curve].map((p) => ({ ...p, b: agt(p.b) })), history: q.history.all(c.user.id, 100).map((r) => publicRound(r)) } };
  });
  route('GET', '/api/rounds', {}, (c) => ({ body: { rounds: q.history.all(c.user.id, Math.min(300, Number(c.query.get('limit')) || 50)).map((r) => publicRound(r)) } }));
  route('GET', '/api/rounds/current', {}, (c) => {
    const r = q.openRound.get(c.user.id);
    return { body: { round: r ? publicRound(r, GAMES[r.game].view(JSON.parse(r.state), JSON.parse(r.params))) : null, balance: agt(q.user.get(c.user.id).balance) } };
  });
  route('POST', '/api/rounds', { limiter: 'play' }, (c) => {
    const b = v.object({ ...c.body, params: rawObj(c.body.params) }, { ...S.bet, params: { optional: true, default: {}, check: rawObj } });
    return { status: 201, body: openRound(c.user, c.session, b) };
  });
  route('POST', '/api/rounds/current/action', { limiter: 'play' }, (c) => {
    const b = v.object({ ...c.body, payload: rawObj(c.body.payload) }, { ...S.action, payload: { optional: true, default: {}, check: rawObj } });
    return { body: actOnRound(c.user, b) };
  });

  route('GET', '/api/seeds', {}, (c) => {
    const s = q.seeds.get(c.user.id);
    return { body: { current: { serverSeedHash: s.server_seed_hash, clientSeed: s.client_seed, nonce: s.nonce }, revealed: q.seedHistory.all(c.user.id).map((r) => ({ serverSeed: r.server_seed, serverSeedHash: r.server_seed_hash, clientSeed: r.client_seed, nonces: r.nonces, revealedAt: r.revealed_at })) } };
  });
  route('POST', '/api/seeds/rotate', {}, (c) => ({ body: rotateSeeds(c.user, v.object(c.body, S.rotate).clientSeed) }));

  route('POST', '/api/lessons/read', {}, (c) => {
    const { id } = v.object(c.body, S.lesson);
    const u = q.user.get(c.user.id);
    const lessons = JSON.parse(u.lessons);
    if (!lessons.includes(id)) { lessons.push(id); q.setLessons.run(JSON.stringify(lessons), u.id); }
    return { body: { lessonsRead: lessons } };
  });
  route('POST', '/api/refill', {}, (c) => ({ body: refill(c.user, v.object(c.body, S.lesson).id) }));
  route('GET', '/api/wallet', {}, (c) => ({ body: walletOf(q.user.get(c.user.id)) }));
  route('GET', '/api/rewards', {}, (c) => ({ body: rewardsOf(q.user.get(c.user.id)) }));
  route('POST', '/api/rewards/claim', {}, (c) => ({ body: claimRebate(c.user) }));
  route('POST', '/api/rewards/drip', {}, (c) => ({ body: claimDrip(c.user, v.object(c.body, S.drip).kind) }));
  route('POST', '/api/rewards/chest', {}, (c) => ({ body: openChest(c.user) }));
  route('GET', '/api/referrals', {}, (c) => ({ body: referralsOf(q.user.get(c.user.id)) }));
  route('POST', '/api/referrals/claim', {}, (c) => ({ body: claimReferral(c.user) }));
  // public pulse for the sign-up page: nothing personal, nothing enumerable
  route('GET', '/api/pulse', { auth: false }, () => ({ body: { online: social.online(), bets: social.feed(now() - 3600e3, 40).length, wins: social.big(6).map((b) => ({ username: b.username, bot: b.bot, game: b.game, multiplier: b.multiplier, net: b.net })) } }));

  /* ---------------- live tables ---------------- */
  route('GET', '/api/live/crash', { limiter: 'live' }, (c) => ({ body: liveState('crash', c.user) }));
  route('GET', '/api/live/roulette', { limiter: 'live' }, (c) => ({ body: liveState('roulette', c.user) }));
  route('POST', '/api/live/crash/bet', { limiter: 'play' }, (c) => { const b = v.object(c.body, S.liveCrash); const out = liveCall(() => live.crash.bet({ user: c.user, session: c.session }, c.user, cents(b.amount), { auto: b.auto })); return { status: 201, body: { ...out, balance: agt(out.balance) } }; });
  route('POST', '/api/live/crash/cashout', { limiter: 'play' }, (c) => { const out = liveCall(() => live.crash.cashout(c.user)); return { body: { ...out, balance: agt(out.balance) } }; });
  route('POST', '/api/live/roulette/bet', { limiter: 'play' }, (c) => { const b = v.object(c.body, S.liveRoulette); const out = liveCall(() => live.roulette.bet({ user: c.user, session: c.session }, c.user, cents(b.amount), { type: b.type, value: b.value })); return { status: 201, body: { ...out, balance: agt(out.balance) } }; });
  route('POST', '/api/live/roulette/clear', { limiter: 'play' }, (c) => { const out = liveCall(() => live.roulette.clear(c.user)); return { body: { balance: agt(out.balance) } }; });
  route('POST', '/api/wallet/deposit', {}, (c) => { const b = v.object(c.body, S.deposit); return { body: deposit(c.user, b.amount, b.source) }; });
  route('POST', '/api/wallet/withdraw', {}, (c) => ({ body: withdraw(c.user, v.object(c.body, S.withdraw).amount) }));

  /* ---------------- social ---------------- */
  const num = (s, d = 0) => { const n = Number(s); return Number.isFinite(n) && n >= 0 ? n : d; };
  route('GET', '/api/social', {}, (c) => ({ body: { bets: social.feed(num(c.query.get('after'))), chat: social.chat(num(c.query.get('chat'))), online: social.online(), ambient: social.ambient, now: now() } }));
  route('GET', '/api/social/big', {}, () => ({ body: { bets: social.big() } }));
  route('GET', '/api/social/leaders', {}, () => ({ body: { leaders: social.leaders() } }));
  route('POST', '/api/social/chat', { limiter: 'chat' }, (c) => ({ status: 201, body: { message: social.say(c.user, v.object(c.body, S.chat).text) } }));

  /* ---------------- dispatcher ---------------- */
  const handleApi = async function handleApi(req, res, { body, ip, limiters, url }) {
    // Unknown path and wrong method are indistinguishable (both 404): nothing to enumerate.
    const match = routes.find((r) => r.path === url.pathname && r.method === req.method);
    if (!match) throw new HttpError(404, 'Not found');
    if (!limiters[match.limiter].allow(ip)) throw new HttpError(429, 'Too many requests');
    if (req.method !== 'GET') assertSameOrigin(req);

    const cookies = parseCookies(req);
    const token = cookies[cookieName(config.cookieSecure)];
    const resolved = token ? auth.resolveSession(token) : null;
    if (match.auth && !resolved) throw new HttpError(401, 'Sign in required');

    const ctx = {
      body: req.method === 'GET' ? {} : await body(), query: url.searchParams, ip, token,
      user: resolved?.user ?? null, session: resolved?.session ?? null,
      setCookie: (t) => res.setHeader('Set-Cookie', sessionCookie(t, { secure: config.cookieSecure, maxAgeSec: Math.floor(config.sessionIdleMs / 1000) })),
      clearCookie: () => res.setHeader('Set-Cookie', sessionCookie('', { secure: config.cookieSecure, maxAgeSec: 0 })),
    };
    const out = await match.handler(ctx);
    return { status: out.status || 200, body: out.body };
  };
  handleApi.close = () => clearInterval(liveTimer);
  handleApi.live = live;
  return handleApi;
}
