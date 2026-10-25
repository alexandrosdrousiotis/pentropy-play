# Art prompts: the Inferno series

Nineteen game images plus featured banners, all in the style of the Inferno Roulette reference.
Every prompt below uses your template unchanged; only the four fields vary. Generate each game
twice: once at 16:9 for banners and headers, once at 3:4 for lobby tiles.

## Palette logic

The reference works because of a fixed tonal structure, not its specific hues:

| Layer | Reference value | Role |
|---|---|---|
| Base | near-black #0a0b0d, top 40% of the frame | the empty space, where text sits |
| Glow | salmon-orange #ff7a5c fading to #d9435a | the single light source behind the centrepiece |
| Smoke | violet-blue #5b57e8 to #8a7dff in the lower corners | the cool counterweight, always the same |
| Object | dark navy #1b2340 with warm rim light | the centrepiece, lit from the glow |
| Accents | emerald #27ad75 gems, pale blue #8fd3ff chips | small sparks of colour, two at most |

Keep base, smoke, object and accent values constant across the whole series. Vary only the glow
hue per game, and pick it from the game's existing tile colour so a player can still find a game
by colour in the lobby. Keep glow saturation and brightness matched to the reference so no tile
shouts louder than another. Two exceptions: Mines and Blackjack use a cooler, desaturated glow on
purpose, because a fully warm set gets monotonous and those two are the "serious" games.

Rules that apply to every image:

- No text, logos, numbers on chips, or UI. Names are set in code.
- Portrait (3:4) images keep the lower quarter free of objects but fully textured, for the name.
- Banner (16:9) images keep the left third free, for the title and copy.
- One centrepiece per image, bottom-centre for banners, centre-low for portraits.
- Floating secondary objects are the game's own pieces, never chips and dice from the reference,
  unless listed.

Fields shared by every prompt:

```
Color combination [ Base near-black #0a0b0d in the upper area; lower-corner smoke in violet-blue
#5b57e8 to #8a7dff exactly as the reference; GLOW replaces the reference's orange fire; centrepiece
in dark navy #1b2340 with a warm rim light from the glow; at most two small accents in emerald
#27ad75 and pale blue #8fd3ff ]
Detail density [ Minimal to moderate, relying on bold, smooth shapes and soft gradients rather than
intricate line-work or complex details ]
Empty space [ 16:9: the left third and the top 40% are free of objects but fully textured. 3:4: the
top 35% and the bottom 25% are free of objects but fully textured ]
Aspect ratio [ 16:9 ]   or   [ 3:4 ]
```

Substitute each game's GLOW value from the table, and paste its Elements field.

## Originals

| Game | GLOW | Elements |
|---|---|---|
| Limbo | royal blue #2f6bff fading to #1d4ed8 | A sleek dark rocket rising from the bottom centre on a column of stylised neon flame, a few small navy chips tumbling in its wake, thin motion streaks |
| Mines | cool steel #8a97b3 fading to #4b5468, with a single ember-orange spark #ff7a5c at the centre | A 5 by 5 grid of dark navy tiles seen at a low angle, three tiles lifted to reveal emerald gems, one lifted tile revealing a small round bomb with a lit fuse as the only warm light |
| Dice | indigo #6d5df5 fading to #4338ca | Two large dark navy dice mid-tumble at the bottom centre with pale blue pips, three smaller dice trailing behind, soft motion blur |
| Crash | crimson #ff4d6d fading to #be123c | A steep glowing line chart rising from bottom-left to top-right and bursting into stylised flame at its peak, a small dark rocket at the tip, chips scattered below the curve |
| Dragon Tower | emerald #27ad75 fading to #047857 | A tall stepped stone tower in dark navy rising from the bottom centre, each tier holding a glowing egg, one egg cracked with green light spilling out |
| Plinko | sky blue #38bdf8 fading to #0369a1 | A triangular field of dark navy pegs lit from below, a single golden ball bouncing down between them with a short motion trail, three small catch bins glowing at the base |
| Keno | amber #f5ac37 fading to #b45309 | A loose cloud of numbered-looking but blank dark navy balls drifting upward from a glowing bowl at the bottom centre, ten of them lit from inside |
| Wheel | violet #a855f7 fading to #7e22ce | A large segmented fortune wheel seen face-on and slightly tilted at the bottom centre, segments alternating dark navy and pale blue, a single pointer above it, motion blur on the rim |
| Slide | teal #22d3ee fading to #0e7490 | A long horizontal glowing rail with tick marks sweeping across the lower frame, a bright marker sliding along it with a motion streak, small chips bouncing off the rail |
| Diamonds | cyan #22b8e6 fading to #0891b2 | Five large cut gems in a loose arc at the bottom centre in emerald, pale blue, amber, violet and crimson, light refracting through them, a few tiny gem fragments floating |

## Streak games

| Game | GLOW | Elements |
|---|---|---|
| Chicken | burnt orange #ff8a3d fading to #c2410c | A stylised dark navy road seen from above receding into the smoke, lane markings glowing, a small white chicken mid-hop on the nearest lane, two sleek cars as dark silhouettes with glowing headlights |
| Pump | hot pink #ff5fa8 fading to #db2777 | A large balloon stretched almost to bursting at the bottom centre, translucent with the glow shining through it, a small pump nozzle at its base, a few tiny chips rising around it |
| HiLo | ruby #ff5c72 fading to #9f1239 | Two playing cards fanned at the bottom centre, faces blank except for a single pale blue pip, one card lifting above the other with a motion trail, an upward chevron of light between them |
| Flip | gold #ffc83d fading to #ca8a04 | A single large coin mid-flip at the bottom centre with motion blur on its edge, blank faces catching the glow, three smaller coins spinning behind it |
| Rock Paper Scissors | purple #a78bfa fading to #7c3aed | Three stylised dark navy hand shapes in a row at the bottom centre, fist, open palm and two-finger, each with a thin rim of light, a small spark between them |

## Table games

| Game | GLOW | Elements |
|---|---|---|
| Blackjack | muted gold #d4a650 fading to #7a5a1e, lower brightness than the rest | A dark navy card shoe at the bottom centre with two cards sliding out, one face-up showing a pale blue ace outline, a small stack of chips beside it, restrained and quiet |
| Video Poker | sea green #2dd4bf fading to #0f766e | Five playing cards in a tight row at the bottom centre, faces blank except for faint pale blue suit outlines, the middle card lifted slightly with a glow behind it |
| Baccarat | deep green #34d399 fading to #166534 | Two small groups of face-down cards at the bottom left-of-centre and right-of-centre with a thin glowing divider between them, a single tall dark chip stack behind |
| Roulette | reference palette, unchanged | A large, elegant roulette wheel at the bottom center, surrounded by floating casino chips, playing dice, and small green gems, all set against a blazing backdrop of stylised neon flames and billowing smoke clouds in the lower corners |

## Featured banners and the landing hero

The landing hero and featured cards are the only places where the reference composition is used
as-is. Generate Roulette, Crash and Chicken at 16:9 with the left third empty; the code darkens
that third further for copy. Do not generate wide banners for the rest.

## Delivery

For each game save `public/art/<id>.webp` at 600 by 800 and, for featured games,
`public/art/<id>-banner.webp` at 1200 by 600, then add the id to the `ART` and `BANNERS` sets in
`public/js/games/index.js`. Ids: limbo, mines, dice, crash, tower, plinko, keno, wheel, slide,
diamonds, chicken, pump, hilo, flip, rps, blackjack, videopoker, baccarat, roulette.

## One worked example

```
Use the uploaded reference image strictly as the visual-style and composition reference.
… (your template, unchanged) …

Color combination [ Base near-black #0a0b0d in the upper area; lower-corner smoke in violet-blue
#5b57e8 to #8a7dff exactly as the reference; crimson #ff4d6d fading to #be123c replaces the
reference's orange fire; centrepiece in dark navy #1b2340 with a warm rim light from the glow; at
most two small accents in emerald #27ad75 and pale blue #8fd3ff ]

Elements [ A steep glowing line chart rising from bottom-left to top-right and bursting into
stylised flame at its peak, a small dark rocket at the tip, chips scattered below the curve ]

Detail density [ Minimal to moderate, relying on bold, smooth shapes and soft gradients rather
than intricate line-work or complex details ]

Empty space [ The left third and the top 40% are free of objects but fully textured ]

Aspect ratio [ 16:9 ]
```

## Extra pieces

### The chest (Rebates page and the opening modal, 1:1, transparent background)

**Color combination:** Inferno base palette with GLOW = molten gold (#f7d98a core, #e6b655 mid, #c9952f shadow). The chest body is the reference's deep walnut brown (#5a2e12 to #8f4f22) with charcoal-navy shadows; gold bands and lock pick up the glow.
**Elements:** A squat iron-banded treasure chest, three-quarter view from slightly above, lid open about 60 degrees, light pouring upward from inside; gold coins heaped to the rim, a few mid-air; the same chips and dice from the roulette reference scattered at the base; thin violet smoke curling off the back edge.
**Detail density:** High on the chest and coins, soft and painterly on the smoke; no text.
**Empty space:** 20% margin on all sides so the UI can scale it; nothing touches the edges.
**Aspect ratio:** 1:1, deliver as PNG with alpha, 1024×1024. A second closed-lid variant for the "filling" state.

### Lobby hero (replaces the roulette banner on the landing page, 16:9)

**Color combination:** Inferno base; GLOW = coral flame (#ff6b5a) left blending to violet (#6d5bd0) right, so every featured tile colour sits comfortably on it.
**Elements:** A low, wide casino floor seen from table height: roulette wheel left, a crash curve drawn in light across the middle, a Plinko board and a mines grid fading into the smoke on the right; chips and dice in the foreground; no people, no logos, no text.
**Detail density:** Dense in the lower third, dissolving to near-empty smoke in the upper third where the headline sits.
**Empty space:** Upper-left quarter kept clear for the headline and two buttons.
**Aspect ratio:** 16:9 at 2400×1350, plus a 4:5 crop for phones with the clear area at the top.
