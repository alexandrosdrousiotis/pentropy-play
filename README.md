# Pentropy Play

A no-money gaming platform that teaches how casino-style games lose. People sign up, receive
1,000 imaginary **anti-gambling tokens (AGT)**, and play ten games at exactly the odds real sites
use. Every bet shows its return-to-player, its win chance, and its expected loss in money before
it is placed. Every outcome is provably fair and still built to lose. That is the lesson.

| Game | RTP | Ceiling | Notes |
|------|-----|---------|-------|
| Limbo, Slide | 99% | 1,000,000x | P(result ≥ t) = 0.99 / t |
| Mines | 99% | 5,148,297x | 25 tiles, 1–24 mines, multiplier = 0.99 · C(25,k)/C(25−m,k) |
| Chicken, Pump | 99% | 3,236,072x | same maths on an ordered 25-step track with 1, 3, 5 or 10 hazards |
| Dice | 99% | 9,900x | 10,000 outcomes, win chance 0.01–98%, pays 99 / chance |
| Crash | 99% | 1,000,000x | same point formula as Limbo; multiplier = e^(0.12·s) on the server clock |
| Dragon Tower | 98% | 256,901x | 9 rows, five difficulties, multiplier = 0.98 · (tiles/safe)^rows |
| HiLo | 99% | 100,000x | infinite deck, each call compounds by 0.99 / P(correct) |
| Flip, Rock Paper Scissors | 99% | 100,000x | 1.98x per correct 50/50 call; RPS ties are free |
| Plinko | 99% | 10,000x | 8–16 rows, three risk levels, tables solved to 99.0% at 2 decimals |
| Keno | 99% | 1,000x | 40 numbers, 10 drawn, four risk levels, tables solved to 99.0% |
| Wheel | 99% | 49.5x | 10–50 segments, three risk levels, tables solved to 99.0% |
| Diamonds | 99% | 50x | five gems in seven colours, exact hand probabilities |
| Video Poker | 99.54% | 800x | 9/6 Jacks or Better, full-pay |
| Blackjack | 99.43% | 2.5x | infinite shoe, S17, 3:2, double any two, one split, insurance 2:1 |
| Baccarat | 98.94% banker / 98.76% player / 85.64% tie | 9x | standard drawing rules, 5% commission on banker |
| Roulette | 97.30% | 36x | European single zero, all standard bets |

Auto bet (number of bets, on-win/on-loss adjustment, stop on profit/loss) is available on every
game that settles in one round, plus Crash with auto cash-out and Mines with pre-selected tiles.

The displayed RTP for Plinko and Keno is the true RTP of the exact 2-decimal table that settles
the bet (within ±0.03% of 99%), not an asserted figure. `npm test` proves every number above.

## The anti-gambling layer

* **Reality panel on every game**: RTP, house edge, chance this bet wins, expected loss for this
  bet, and the same loss over 100 bets converted to money at a rate the player sets.
* **Reality checks** every N bets or 10 minutes, with session and lifetime figures.
* **Stats**: balance curve against the curve the house edge predicted, realised RTP, turnover,
  biggest win and loss, everything converted back to money.
* **Lessons** that unlock with play: RTP, turnover, the ceiling decoy, the gambler's fallacy,
  loss-chasing, design tricks, "provably fair ≠ fair odds", skill games, and where to get help.
* **Bankruptcy flow**: running out of tokens requires reading a lesson before a refill, and the
  refill count is permanent on the profile.
* **Self-set limits** (loss per session, session time, reality-check cadence) enforced by the
  server on every bet, not by the client.

## Wallet, rewards and tiers

* **Wallet**: a daily play-money allowance (1,000 AGT), withdrawals into a vault and back, a
  lifetime "deposited" counter that only goes up, transaction ids and history.
* **Tiers**: Bronze → Silver (1,000 wagered) → Gold (5,000) → Platinum (25,000) → Diamond
  (100,000), earned by lifetime wager. Each level-up credits a bonus.
* **Rakeback**: a share of the house edge on every settled bet (5% at Silver up to 15% at
  Diamond) accrues and can be claimed from 1 AGT. The Rebates page shows the edge taken, the slice
  returned, and the net cost side by side, because that arithmetic is the lesson.

## Live tables: one round for everyone

Crash and Roulette are shared tables, the way they are on the real sites. The server runs one round at a time per game (`shared/live.js`, the same state machine the browser demo runs): bets open for 7 s (Crash) or 15 s (Roulette), lock, the flight or spin plays out, and every player at the table is settled against the same result. Players see each other's bets and cash-outs as they happen, and the cash-out markers sit on the curve.

- **Fairness** is commit-reveal per round: the SHA-256 of the round seed is published while bets are open, the seed is revealed when the round ends, and the game page verifies `HMAC-SHA256(seed, "game:roundId")` in the browser.
- **Wallet integrity**: bets debit immediately into `live_bets`; settlement writes a normal `rounds` row (so stats, rakeback, drips, limits and the live feed all keep working) and marks the bet settled. A server restart refunds anything still riding.
- **Simulated players** join each round when ambient mode is on, flagged as always.

## Sign-up and referrals

The sign-up page is built like an acquisition page on purpose: welcome package, live counter, recent wins, a referral field, one big button, and a paragraph saying that this is the playbook. Referral codes (`#/signup?ref=CODE`) give the friend +50 AGT and the referrer 10% of the house edge the friend pays, forever, claimable from the Rebates page, which prints the per-friend table so the affiliate maths is visible.

## The room: live bets, chat, leaders

Real casinos sell the crowd as hard as the games, so Pentropy has one too, built to teach rather than to hook.

- **Live bets** on the lobby shows every settled bet on the site (`GET /api/social`, polled every 3 s). The footer counts how many of the rows on screen lost: the house edge in plain sight.
- **Big wins** is the survivorship filter every casino pins to the top. The losses that paid for it are one tab to the left.
- **Leaders** ranks by wager, the way real boards do, and says how many of the top ten are down.
- **Chat** is a drawer off the top bar. Messages are 1 to 200 printable characters, one per 1.5 s per user, six per 10 s per IP, kept to the last 500 rows. Rendering uses `textContent`, never HTML.
- **Ghost mode** (Account) replaces your name with "Hidden" in the feed and leaderboard. Chat always shows the name you post under.
- **The chest** (Rebates page and lobby): fills as you play and opens every six hours for a random 0.3% to 1.2% of what you wagered since it last opened. The expected value sits on the label; the random size and the timer are the hook.
- **Bonus drips** (Rebates page): hourly reload, daily and weekly bonus, each a fixed fraction of what you wagered in that window, claimable once the window has passed. Use it or lose it, like the real ones; the page says in so many words that the timer is the product.
- **Simulated players** keep the room from looking empty on a quiet server. They live in memory, never touch the database or any statistic, and every row and message they produce carries `bot: true` and a robot mark in the UI. Real sites fill their feeds the same way and never tell you; `SOCIAL_AMBIENT=0` turns them off.

See `docs/third-party-slots.md` for what it would take to add provider slots behind a seamless wallet.

## Architecture

Zero dependencies. Node 22+, built-in `node:sqlite` and `node:crypto`.

```
server/   HTTP(S) server, auth, sessions, fair RNG, seed encryption, game engines, JSON API
shared/   Pure game mathematics and replay logic, used by server, client and tests
public/   Static client: vanilla ES modules, GeoGuessr-derived design tokens, no build step
test/     node:test suites: analytic RTP checks, engine replay, API security
```

**Everything that matters runs on the server.** The browser never sees a server seed, a mine
layout, a crash point, a dealer hole card or a tower layout before the round is settled. It sends
`{game, amount, params}` and actions such as `reveal`, `cashout`, `hit`; the server validates,
draws from the per-user HMAC stream, settles in integer cents inside one synchronous SQLite
transaction, and returns only the public view.

### Security model

* Passwords: scrypt (N=2¹⁵, r=8, p=1), 16-byte salt, constant-time compare, dummy hash on
  unknown usernames so timing does not reveal account existence. Password policy: 10–128 chars,
  not containing the username, no trivial sequences.
* Brute force: per-IP sliding-window rate limits (auth 12/min, play 60/10s, general 240/min)
  and per-account lockout with exponential backoff after 5 failures.
* Sessions: 256-bit random token, stored only as SHA-256, cookie `__Host-sid` (`HttpOnly`,
  `Secure`, `SameSite=Strict`, `Path=/`), 7-day idle and 30-day absolute expiry, logout deletes.
* CSRF: every state-changing request must carry `X-Requested-With: pentropy` (impossible
  cross-site without a CORS preflight the server never answers), and `Origin` /
  `Sec-Fetch-Site` must be same-origin. The API never sets CORS headers.
* Input: every endpoint whitelists its fields with typed, bounded validators; unknown fields,
  prototype keys, wrong types, extra decimals and out-of-range values are rejected. JSON only,
  8 KB body limit, no form posts.
* Headers: strict CSP (`default-src 'none'`, no inline scripts), HSTS, `X-Frame-Options: DENY`,
  COOP/COEP/CORP, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `nosniff`.
* Enumeration: unknown routes and wrong methods are the same 404; static serving only answers
  whitelisted extensions under `public/` and `shared/`, resolves symlinks, and refuses dotfiles
  and traversal. No `Server` or `X-Powered-By` header. No stack traces in responses.
* Money: integer cents; one open round per user enforced by a partial unique index; stake
  deduction, nonce increment and settlement happen in a single `BEGIN IMMEDIATE` transaction;
  Node's single thread plus synchronous SQLite rules out double-spend races.
* Seeds: per-user server seed encrypted at rest with AES-256-GCM under a key derived (HKDF) from
  `SECRET_KEY`; only its SHA-256 is shown until the user rotates, which reveals it.
* Fairness: outcome = f(HMAC-SHA256(serverSeed, `clientSeed:nonce:cursor`)). The client
  verifier (`public/js/verify-rng.js` + `shared/replay.js`) reproduces any settled round in the
  browser from the revealed seed, and the tests assert it matches the server byte for byte.
* Privacy: only a username and password hash are stored. No email, no analytics, no third-party
  scripts; the only external origin is Google Fonts, allowed explicitly in the CSP.

## Run

```bash
npm start                 # http://127.0.0.1:8080 (development: a random SECRET_KEY is persisted in ./data)
npm test                  # math, engine and API suites
```

### Deploy

```bash
NODE_ENV=production SECRET_KEY='<32+ random characters>' HOST=0.0.0.0 PORT=8080 \
DATA_DIR=/var/lib/pentropy TRUST_PROXY=1 node --no-warnings=ExperimentalWarning server/index.js
```

Put it behind a TLS-terminating reverse proxy that sets `X-Forwarded-Proto` and
`X-Forwarded-For` (only then set `TRUST_PROXY=1`), or serve TLS directly with `TLS_CERT` and
`TLS_KEY`. Run exactly one process per database file. Back up `DATA_DIR` and keep `SECRET_KEY`
safe: without it the encrypted server seeds cannot be revealed. See `.env.example`.

A `Dockerfile` is included (`docker build -t pentropy . && docker run -e SECRET_KEY=... -p 8080:8080 pentropy`).

## Design

The interface copies the surface system of the large exchanges' dark modes rather than inventing
one: Coinbase's near-black page and card colours, hairline borders, pill buttons with a single blue
accent and its dark-mode green/red delta colours; Kraken Pro's 12px panel radius and density;
Binance's muted 12px labels above 16–20px tabular values. There are no gradients, glows or drop
shadows on surfaces; only modals and toasts cast a shadow. Icons are Lucide (ISC), inlined as an
SVG sprite by `scripts/icons.mjs`. Type is Inter with tabular numerals.

Motion lives in `public/js/fx.js`: one set of easing curves, FLIP-based deals from a shoe, 3D card
flips, tile flips, gravity arcs for Plinko, a live Crash curve, digit tickers and a balance
counter, plus synthesized sound cues with a mute toggle. Reduced-motion users get instant states.

## Not a gambling service

Tokens cannot be bought, sold, withdrawn, transferred or exchanged. There is no deposit, no
cash-out, no leaderboard and no referral mechanism, by design. If gambling with real money is
causing harm, the "If this stopped being a game" lesson lists free, confidential helplines.

## The lobby

The lobby borrows three ideas from the big entertainment lobbies. The hero rotates between the
rebate promo, the live Crash table (the real round, counting down and flying in the hero, fed by
the same poller the game uses) and a game of the day picked from the calendar; thumbnails steer it
on desktop, dots and swipes on phones. "Top 10 right now" ranks games by bets in the room feed
with Netflix-style ghosted numerals, and the Live tables card carries a live chip with the Crash
phase. One Crash poller is shared by every widget on the page and stops itself when they leave.
