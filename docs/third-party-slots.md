# Adding third-party slots to Pentropy

Pentropy's own games are pure functions over a seeded RNG, so the house edge is auditable to the cent. Third-party slots are different: the provider runs the game on their servers, you never see the RNG, and your platform becomes a wallet that the provider debits and credits. This is how every real casino works, and it is the single biggest piece of work on the way to looking like one.

## 0. Decide whether you can, legally

- Content studios (Pragmatic Play, Hacksaw, Nolimit City, Play'n GO, NetEnt, Push Gaming) license to operators, not to individuals. Almost all require a gaming licence (Malta, Isle of Man, UKGC, Curaçao, Kahnawake, Anjouan) before they sign, even for free-play.
- Pentropy is play money with no cash value. That is a "social casino" in most jurisdictions and needs no gambling licence, but it does **not** exempt you from the studio's commercial terms. Some studios do have social-casino deals (Playtika, SciPlay and Huuuge all license real slot IP on free-to-play terms). Expect a minimum monthly fee or a revenue share on in-app purchases.
- The honest route for an educational project: use an **aggregator's demo-mode catalogue** (see step 1), or build your own slot engine on the provably-fair RNG already in `shared/`. The second option is a week of work and fits the mission better: the pay table and RTP are published, and the verifier can replay every spin.

## 1. Pick an aggregator, not individual studios

One contract and one integration instead of forty. Each aggregator exposes hundreds of studios behind a single API:

| Aggregator | Notes |
| --- | --- |
| SoftSwiss (Game Aggregator) | Largest crypto-casino footprint; the one Stake-style sites use. |
| Slotegrator (APIgrator) | Cheapest entry, good docs, allows demo-mode launches. |
| EveryMatrix (CasinoEngine) | Enterprise; expensive; strong compliance tooling. |
| Pariplay (Fusion) | Mid-market; good North American coverage. |
| Relax Gaming (Powered By) | Studio-first; good if you want their own content too. |
| Hub88 | Clean REST API, crypto-friendly, fast onboarding. |

You will go through: NDA, commercial terms (monthly minimum, usually 500 to 5,000 EUR, plus a share of GGR, which for play money is zero so expect the minimum to be enforced), KYB on your company, and a technical questionnaire. Budget 4 to 12 weeks before you get staging credentials.

## 2. Understand the seamless-wallet contract

Every aggregator uses the same shape. The provider never holds a balance. Your server exposes four callbacks and the provider calls them during play:

| Callback | When | What you do |
| --- | --- | --- |
| `balance` | Game load, after each spin | Return the player's balance in the game currency, as an integer in minor units. |
| `bet` (debit) | Spin starts | Atomically check funds, deduct, record the round, return the new balance. **Idempotent on `transaction_id`.** |
| `win` (credit) | Spin resolves, bonus rounds, jackpots | Credit the amount against the round. Idempotent. A win can arrive seconds or hours after the bet. |
| `rollback` (refund) | Provider could not complete a bet | Reverse a specific debit if it exists, no-op if it does not. Idempotent. |

Requests are signed (HMAC-SHA256 over the body, or an RSA signature, or a shared secret in a header depending on the vendor) and carry: `player_id`, `session_id`, `game_id`, `round_id`, `transaction_id`, `amount`, `currency`, `timestamp`. The aggregator will also call `getPlayerInfo` once per session.

Non-negotiables they test for during certification:

- Idempotency: the same `transaction_id` twice must return the same answer and change nothing.
- Atomicity: `bet` must never over-draw. Use `BEGIN IMMEDIATE` and the integer-cents arithmetic already in `server/routes.js`.
- Ordering: a `win` may arrive before you have processed the `bet` (retries). Store it, do not reject it.
- Clock: timestamps must be within a window (usually 60 s) of the provider's clock.
- Latency: most contracts require a p99 under 300 ms for `balance` and `bet`.
- Availability: a failing callback stops every game on the site. They will ask for an SLA.

## 3. Map Pentropy onto that contract

Everything needed already exists; it is a matter of exposing it on a second, provider-facing surface.

1. **Currency.** Register `AGT` as a custom currency with the aggregator (most support "fun" or "play" currencies with a defined exchange rate for reporting). Minor unit = cents, which is what the DB already stores.
2. **Player identity.** Send the provider an opaque id (`users.id` hashed with the server secret) rather than the username. Map it back on each callback.
3. **Game launch.** Add `GET /api/providers/:provider/launch?game=<id>`: create a short-lived launch token (random 32 bytes, stored hashed with a 60 s expiry, bound to the user), call the aggregator's launch endpoint with it, and return the iframe URL. Lobby tiles link to `#/play/ext/<game>`, which renders the iframe inside the existing board layout so the reality panel, limits and session clock still frame it.
4. **Callbacks.** Add `server/providers/<name>.js` exposing `POST /provider/<name>/*` on a separate path prefix that bypasses the cookie session, CSRF and the browser rate limiter, and instead verifies the vendor signature and an IP allow-list. Each callback maps to:
   - `balance` → `users.balance`.
   - `bet` → insert a `rounds` row with `game = 'ext:<provider>:<game_id>'`, `status = 'open'`, `amount`, and a new `provider_tx` table `(provider, tx_id UNIQUE, round_id, kind, amount, at)` for idempotency.
   - `win` → settle the round (`payout`, `multiplier = payout / amount`, `settled_at`), run `accrueRewards` so rakeback, tiers, drips and the live feed all keep working unchanged.
   - `rollback` → if the debit exists and is unsettled, refund and mark the round `void`; always 200.
5. **RTP for the reality panel.** The aggregator's game list carries each slot's certified RTP (typically 94 to 96.5 %, far below Pentropy's 99 %). Store it in a `provider_games` table and feed it into `realityPanel` so "expected loss per 100 bets" is honest for every slot. That gap, 4 % versus 1 %, is itself the lesson.
6. **Fairness page.** Provider rounds cannot be replayed from seeds. Show them in history with a "provider RNG, certified by <lab>" badge and the certificate link, and keep the verifier for native games only. Do not pretend otherwise.
7. **Limits and reality checks.** The `bet` callback must run `checkLimits` before debiting, and the iframe page must keep the session timer and reality-check modal running on top of the provider's canvas.
8. **Demo mode.** The browser artifact cannot host provider games (CSP and no backend). Keep slots server-only, and show a "needs the full server" card in the demo lobby.

## 4. Security changes the callbacks force

- The CSP must allow the provider's iframe origin in `frame-src` and nothing else. Keep `default-src 'none'` for your own pages.
- Callbacks are unauthenticated from the browser's point of view, so: verify the signature before parsing anything else, reject bodies over 8 KB, pin the provider's IP ranges, and log every request with its `transaction_id`.
- Rotate the shared secret from an environment variable, never the DB.
- Add a reconciliation job: once an hour, pull the provider's transaction report and diff it against `provider_tx`. Mismatches are the number-one source of disputes.

## 5. Certification and go-live

1. Implement against the aggregator's staging environment with their test wallet scripts (every vendor ships a Postman collection that fires the idempotency, rollback and out-of-order cases).
2. Pass their checklist review (usually a shared spreadsheet of 40 to 80 items, each with a screenshot or a log line).
3. Soft launch with a handful of games behind a feature flag; watch p99 latency and reconciliation diffs for a week.
4. Full catalogue, then ongoing: game list sync nightly, RTP changes mirrored, provider maintenance windows surfaced in the lobby.

## 6. The cheaper alternative: build the slot

If the point is to teach rather than to carry a licence, a native slot on the existing engine interface is one file:

- `shared/math.js`: reel strips (5 reels × 3 rows, 20 to 40 symbols per strip), pay lines or ways-to-win, a pay table solved to a target RTP with `nudgeToTarget` like Plinko and Keno already are.
- `shared/engine.js`: `start(p, rng)` draws one float per reel for the stop position, evaluates lines, returns `settled(multiplier, { stops, lines })`.
- `public/js/games/slot.js`: spinning reel strips (the Slide reel from `slide.js` is 80 % of it), per-line win highlights, a bonus free-spins state in `action()`.
- Verifier: works out of the box because the outcome is a pure function of the seeds.

That version is provably fair, carries no contract, and shows the player exactly why a 96 % slot costs four times what a 99 % dice roll does.
