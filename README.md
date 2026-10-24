# Pentropy Play

A no-money gaming platform that teaches how casino-style games lose. People sign up, receive
1,000 imaginary **anti-gambling tokens (AGT)**, and play ten games at exactly the odds real sites
use. Every bet shows its return-to-player, its win chance, and its expected loss in money before
it is placed. Every outcome is provably fair and still built to lose. That is the lesson.

| # | Game | RTP | Ceiling | Notes |
|---|------|-----|---------|-------|
| 1 | Limbo | 99% | 1,000,000x | P(result ≥ t) = 0.99 / t |
| 2 | Mines | 99% | 5,148,297x | 25 tiles, 1–24 mines, multiplier = 0.99 · C(25,k)/C(25−m,k) |
| 3 | Dice | 99% | 9,900x | 10,000 outcomes, win chance 0.01–98%, pays 99 / chance |
| 4 | Crash | 99% | 1,000,000x | same point formula as Limbo; multiplier = e^(0.12·s) on the server clock |
| 5 | Dragon Tower | 98% | 256,901x | 9 rows, five difficulties, multiplier = 0.98 · (tiles/safe)^rows |
| 6 | HiLo | 99% | 100,000x | infinite deck, each call compounds by 0.99 / P(correct) |
| 7 | Plinko | 99% | 10,000x | 8–16 rows, three risk levels, tables solved to 99.0% at 2 decimals |
| 8 | Keno | 99% | 1,000x | 40 numbers, 10 drawn, four risk levels, tables solved to 99.0% |
| 9 | Video Poker | 99.54% | 800x | 9/6 Jacks or Better, full-pay |
| 10 | Blackjack | 99.43% | 2.5x | infinite shoe, S17, 3:2, double any two, one split, insurance 2:1 |

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
