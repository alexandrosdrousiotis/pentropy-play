# Art prompts: the Inferno series, in nineteen colours

Nineteen game images plus featured banners, all in the style of the Inferno Roulette reference.
Every prompt uses your template unchanged; only the four fields vary. Generate each game twice:
once at 3:4 for lobby tiles, once at 16:9 for banners and headers.

The first batch came back with the same violet smoke and navy object in every frame, so the
lobby read as one purple wall. This revision keeps the reference's tonal structure and changes
the hues: each game owns a hue family, the smoke takes a darker shade of that family (or its
complement), and the lobby rows are laid out so no two neighbouring tiles share a family.

## Palette logic

What makes the reference work is its tonal structure, not its hues:

| Layer | Role | What stays fixed | What varies per game |
|---|---|---|---|
| Base | the empty space where the name sits | near-black, top 35–40% of the frame | the black is tinted 5% toward the game's hue |
| Glow | the single light source behind the centrepiece | position, size, softness | hue, from the table below |
| Smoke | the counterweight in the lower corners | shape, density, painterly edges | hue: a deeper shade of the glow, or its complement where noted |
| Object | the centrepiece, lit from the glow | one object, scale, rim light | material and local colour, from the table |
| Accents | two small sparks at most | count and size | hue, from the table |

Rules that apply to every image:

- No text, logos, numbers on chips, or UI. Names are set in code.
- Portrait (3:4) images keep the top 35% free of objects but fully textured, for the name.
- Banner (16:9) images keep the left third free, for the title and copy.
- One centrepiece per image, bottom-centre for banners, centre-low for portraits.
- Floating secondary objects are the game's own pieces, never the reference's chips and dice,
  unless listed.
- Match the reference's glow brightness and saturation so no tile shouts louder than another.
  Light-palette tiles (Dice, Flip) keep the same dark base; only the object and glow are light.
- Never use the reference's violet smoke unless the table says so. Roulette is the only game that
  keeps the reference palette unchanged.

Fields shared by every prompt:

```
Color combination [ Base near-black tinted toward HUE in the upper area; lower-corner smoke in
SMOKE exactly where the reference has its violet smoke; GLOW replaces the reference's orange fire;
centrepiece in OBJECT with a rim light from the glow; at most two small accents in ACCENTS ]
Detail density [ Minimal to moderate, relying on bold, smooth shapes and soft gradients rather than
intricate line-work or complex details ]
Empty space [ 16:9: the left third and the top 40% are free of objects but fully textured. 3:4: the
top 35% and the bottom 25% are free of objects but fully textured ]
Aspect ratio [ 16:9 ]   or   [ 3:4 ]
```

Substitute HUE, SMOKE, GLOW, OBJECT and ACCENTS from the game's row and paste its Elements field.

## Lobby colour map

Rows in lobby order, so you can check that neighbours differ:

| Row | Tiles |
|---|---|
| Originals | Limbo (blue) · Mines (steel + ember) · Dice (ivory) · Crash (scarlet) · Dragon Tower (jade) · Plinko (lime) · Keno (indigo) · Wheel (magenta) · Slide (ice cyan) · Diamonds (prismatic) |
| Streak | Chicken (sunset orange) · Pump (bubblegum pink) · HiLo (burgundy) · Flip (gold) · Rock Paper Scissors (turquoise) |
| Table | Blackjack (forest felt) · Video Poker (arcade teal) · Baccarat (noir and gold) · Roulette (reference fire) |

## Originals

| Game | HUE | GLOW | SMOKE | OBJECT | ACCENTS | Elements |
|---|---|---|---|---|---|---|
| Limbo | electric blue | electric blue #3b82f6 fading to #1d4ed8 | deep navy #0b1a3a to #142a5c | white-and-silver rocket #e5e7eb with a black nose cone | cyan #67e8f9 flame core, warm white #fff5d6 sparks | A sleek white rocket rising from the bottom centre on a column of stylised blue-white flame, a few small silver chips tumbling in its wake, thin motion streaks |
| Mines | cold steel | steel grey #94a3b8 fading to #475569, with one ember-orange #ff7a3d spark at the centre | charcoal #1e2530 to #2b3442 with a faint orange underlight | gunmetal tiles #334155 with brushed edges | emerald #34d399 gems, ember orange #ff7a3d fuse | A 5 by 5 grid of gunmetal tiles seen at a low angle, three tiles lifted to reveal emerald gems, one lifted tile revealing a small round bomb with a lit fuse as the only warm light |
| Dice | ivory | warm ivory #fff1d6 fading to #e8c98a | warm sand #5a4a2e to #8a6a3a | black lacquer dice #111111 with red #ef4444 pips | red #ef4444 pips, cream #fff8e7 highlights | Two large black lacquered dice mid-tumble at the bottom centre with red pips, three smaller dice trailing behind, soft motion blur, the ivory glow catching their polished faces |
| Crash | scarlet | scarlet #ff3b3b fading to orange #ff8a1f at the peak | deep maroon #3a0a12 to #6b1020 | matte black rocket with a red stripe | yellow #ffd21f flame tips, white #ffffff spark | A steep glowing line chart rising from bottom-left to top-right and bursting into stylised flame at its peak, a small black rocket at the tip, chips scattered below the curve |
| Dragon Tower | jade | jade #2dd4a0 fading to #0f9b6e | dark teal #062e2a to #0c4a40 | dark basalt stone #1a2a26 with mossy edges | gold #f5c45a eggs, orange #ff8a3d dragon-fire glow from the cracked egg | A tall stepped stone tower rising from the bottom centre, each tier holding a glowing gold egg, one egg cracked with orange dragon-fire spilling out against the jade light |
| Plinko | lime | acid lime #b6f23a fading to #4d9a12 | dark olive #1a2a0a to #2d4210 | matte black board #0f1410 with chrome pegs | hot pink #ff4fa3 ball, white #ffffff peg highlights | A triangular field of chrome pegs on a black board lit from below in lime, a single hot-pink ball bouncing down between them with a short motion trail, three small catch bins glowing at the base |
| Keno | indigo | indigo #6366f1 fading to #312e81 | midnight violet #15103a to #2a1f5e | frosted white balls #f1f5f9 with a faint blue core | gold #fbbf24 on the ten lit balls, lavender #c4b5fd haze | A loose cloud of blank frosted balls drifting upward from a glowing bowl at the bottom centre, ten of them lit gold from inside |
| Wheel | magenta | magenta #ff3fb4 fading to #b4157c | plum #3a0a2e to #6a1555 | wheel segments in candy colours: magenta, yellow #ffe14d, cyan #4dd8ff, black | white #ffffff pointer, yellow #ffe14d rim highlight | A large segmented fortune wheel seen face-on and slightly tilted at the bottom centre, segments alternating magenta, yellow, cyan and black, a single white pointer above it, motion blur on the rim |
| Slide | ice cyan | ice cyan #5de4ff fading to #0e7490 | slate blue #0f2430 to #1c3a4a | frosted glass rail #cfefff with chrome tick marks | white #ffffff marker streak, pale aqua #a5f3fc frost | A long horizontal frosted-glass rail with tick marks sweeping across the lower frame, a bright white marker sliding along it with a motion streak, small ice chips bouncing off the rail |
| Diamonds | prismatic | pale iridescent white #f8f4ff shifting to lilac #c7b6ff and mint #a7f3d0 at the edges | dark slate #141821 to #232a38 | five cut gems in emerald #27ad75, ruby #ff4d6d, sapphire #3b82f6, amber #f5ac37 and amethyst #a855f7 | rainbow refractions on the floor, tiny white #ffffff sparkles | Five large cut gems in a loose arc at the bottom centre in emerald, ruby, sapphire, amber and amethyst, light refracting through them in rainbow streaks across a dark slate floor, a few tiny gem fragments floating |

## Streak games

| Game | HUE | GLOW | SMOKE | OBJECT | ACCENTS | Elements |
|---|---|---|---|---|---|---|
| Chicken | sunset orange | sunset orange #ff8a3d fading to #ff4d2e near the horizon | dusk teal #0b2e33 to #155e63, the complement of the glow | asphalt grey road #2a2f36 with warm-white lane markings, green #3f8f3a grass kerbs | white #ffffff chicken with red #ef4444 comb, yellow #ffd21f headlights | A stylised grey road seen from above receding into a teal dusk, lane markings glowing warm, a small white chicken mid-hop on the nearest lane, two sleek cars as dark silhouettes with yellow headlights, green kerbs either side |
| Pump | bubblegum pink | bubblegum pink #ff6fc1 fading to #e0338f | cherry #4a0a2a to #7a1448 | translucent pink balloon #ffb3dd with the glow shining through it | sky blue #7dd3fc pump nozzle, white #ffffff highlight on the balloon | A large balloon stretched almost to bursting at the bottom centre, translucent pink with the glow shining through it, a small sky-blue pump nozzle at its base, a few tiny chips rising around it |
| HiLo | burgundy | burgundy #9f1239 fading to #4c0519, with a warm cream rim | wine #2a0612 to #4a0c22 | cream playing cards #fdf6e3 with burgundy backs | gold #f5c45a chevron of light, black #111111 pip | Two cream playing cards fanned at the bottom centre, faces blank except for a single black pip, one card lifting above the other with a motion trail, an upward gold chevron of light between them |
| Flip | gold | gold #ffc83d fading to #b8860b | bronze #3a260a to #6b4a14 | polished gold coin #ffd76a with a darker gold rim | white #ffffff edge glint, copper #c2410c shadow side | A single large gold coin mid-flip at the bottom centre with motion blur on its edge, blank faces catching the light, three smaller coins spinning behind it |
| Rock Paper Scissors | turquoise | turquoise #2dd4bf fading to #0d9488 | dark cyan #052e2b to #0b4a45 | matte stone hands #4b5563 with a thin turquoise rim light | coral #ff7a5c spark between the hands, white #ffffff rim | Three stylised matte-stone hand shapes in a row at the bottom centre, fist, open palm and two-finger, each with a thin turquoise rim of light, a small coral spark between them |

## Table games

| Game | HUE | GLOW | SMOKE | OBJECT | ACCENTS | Elements |
|---|---|---|---|---|---|---|
| Blackjack | forest felt | forest green #1f7a4d fading to #0b3d26, lower brightness than the rest | dark green #06231a to #0f3a2a | black card shoe #111111 with a brass lip, cream cards #fdf6e3 | gold #f5c45a chip stack, red #ef4444 ace outline | A black card shoe at the bottom centre on green felt with two cream cards sliding out, one face-up showing a red ace outline, a small stack of gold chips beside it, restrained and quiet |
| Video Poker | arcade teal | neon teal #14e3c8 fading to #0f766e | deep blue-black #061a2a to #0d3042 | black cards #0a0a0a with glowing teal suit outlines | hot pink #ff4fa3 glow behind the lifted card, white #ffffff edge highlights | Five black playing cards in a tight row at the bottom centre, faces blank except for faint glowing teal suit outlines, the middle card lifted slightly with a hot-pink glow behind it |
| Baccarat | noir and gold | champagne gold #e6c27a fading to #8a6a2a | pure black #000000 to #1a1a1a with a faint gold underlight | black lacquer table #0d0d0d with a gold divider line, cream cards #fdf6e3 | burgundy #7a1428 card backs, gold #f5c45a chip stack | Two small groups of face-down cards with burgundy backs at the bottom left-of-centre and right-of-centre, a thin glowing gold divider between them, a single tall black-and-gold chip stack behind |
| Roulette | reference | reference palette, unchanged | violet-blue #5b57e8 to #8a7dff as the reference | dark navy #1b2340 wheel | emerald #27ad75 gems, pale blue #8fd3ff chips | A large, elegant roulette wheel at the bottom center, surrounded by floating casino chips, playing dice, and small green gems, all set against a blazing backdrop of stylised neon flames and billowing smoke clouds in the lower corners |

## Featured banners and the landing hero

Generate Roulette, Crash and Chicken at 16:9 with the left third empty; the code darkens that
third further for copy. Do not generate wide banners for the rest.

## Delivery

For each game save `public/art/<id>.webp` at 600 by 800 and, for featured games,
`public/art/<id>-banner.webp` at 1200 by 675, then add the id to the `ART` and `BANNERS` sets in
`public/js/games/index.js`. Ids: limbo, mines, dice, crash, tower, plinko, keno, wheel, slide,
diamonds, chicken, pump, hilo, flip, rps, blackjack, videopoker, baccarat, roulette.

Already delivered in the old all-violet palette and worth regenerating first, in order of how
much they clash in the lobby: limbo, mines, dice, tower, plinko, keno, wheel, slide, diamonds.
Crash and Chicken are warm already and can wait.

## One worked example

```
Use the uploaded reference image strictly as the visual-style and composition reference.
… (your template, unchanged) …

Color combination [ Base near-black tinted toward lime in the upper area; lower-corner smoke in
dark olive #1a2a0a to #2d4210 exactly where the reference has its violet smoke; acid lime #b6f23a
fading to #4d9a12 replaces the reference's orange fire; centrepiece a matte black board #0f1410
with chrome pegs, rim-lit from the glow; at most two small accents, a hot pink #ff4fa3 ball and
white #ffffff peg highlights ]

Elements [ A triangular field of chrome pegs on a black board lit from below in lime, a single
hot-pink ball bouncing down between them with a short motion trail, three small catch bins
glowing at the base ]

Detail density [ Minimal to moderate, relying on bold, smooth shapes and soft gradients rather
than intricate line-work or complex details ]

Empty space [ The top 35% and the bottom 25% are free of objects but fully textured ]

Aspect ratio [ 3:4 ]
```

## Extra pieces

### The chest (Rebates page and the opening modal, 1:1, transparent background)

**Color combination:** GLOW = molten gold (#f7d98a core, #e6b655 mid, #c9952f shadow). The chest body is deep walnut brown (#5a2e12 to #8f4f22) with charcoal shadows; gold bands and lock pick up the glow. Smoke, if any, is a thin warm amber haze, not violet.
**Elements:** A squat iron-banded treasure chest, three-quarter view from slightly above, lid open about 60 degrees, light pouring upward from inside; gold coins heaped to the rim, a few mid-air; a few chips in red, blue and green scattered at the base.
**Detail density:** High on the chest and coins, soft and painterly on the haze; no text.
**Empty space:** 20% margin on all sides so the UI can scale it; nothing touches the edges.
**Aspect ratio:** 1:1, deliver as PNG with alpha, 1024×1024. A second closed-lid variant for the "filling" state.

### Lobby hero (replaces the roulette banner on the landing page, 16:9)

**Color combination:** Base near-black; GLOW sweeps across the frame from scarlet #ff3b3b on the left through gold #ffc83d in the middle to electric blue #3b82f6 on the right, so every featured tile colour has a cousin in the hero. Smoke in the lower corners takes the local hue: maroon on the left, navy on the right.
**Elements:** A low, wide casino floor seen from table height: roulette wheel left, a crash curve drawn in light across the middle, a Plinko board and a mines grid fading into the smoke on the right; chips in red, gold and blue in the foreground; no people, no logos, no text.
**Detail density:** Dense in the lower third, dissolving to near-empty smoke in the upper third where the headline sits.
**Empty space:** Upper-left quarter kept clear for the headline and two buttons.
**Aspect ratio:** 16:9 at 2400×1350, plus a 4:5 crop for phones with the clear area at the top.
