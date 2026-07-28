# COMMODORE CUP — the online card game

*The 1980s vaporwave yacht-club card game, designed and printed in 2024 — now
playable in a browser, solo against AI rivals or online with friends.*

Melds, martinis, members: draw and meld suit cards (sets of matching letters,
runs within a suit), fire off one-of-a-kind Special Actions, and — after a fresh
meld — press your luck courting the club's 25 Members, who bring +8 glory or a
−6 bar tab but always add to your **Club Support**. First to **50 points with
5 members backing them** is named **Commodore**. Full rules in
[`RULES.md`](RULES.md); how the design was recovered in
[`docs/DESIGN-RECOVERY.md`](docs/DESIGN-RECOVERY.md).

**Play it live:** https://hinksj.github.io/hinksgames/commodore-cup/

## Run it

No build step, no dependencies (PeerJS loads from a CDN for online play only):

```
python3 -m http.server        # in this folder
open http://localhost:8000
```

or just double-click `index.html` (solo play works from file://; online play
needs http/https).

## Play online with friends

1. Put the folder on any static host (GitHub Pages is perfect: push the repo,
   enable Pages, share the URL).
2. One player clicks **Host a table**, gets a room code (e.g. `TIKI42`).
3. Friends open the same page anywhere in the world, enter the code, **Join**.
4. Host fills empty seats with AI rivals if desired and starts the race.

The host's browser is the referee — it runs the engine and validates every
move; guests mirror its state over a direct WebRTC connection (PeerJS public
broker handles the introduction). If a guest drops, an AI takes their wheel.

## The cards

All 84 cards use the original printed art (from the July 2024 print run):

- **Club Deck (59):** 4 suits × 12 lettered cards (Theme Parties, Yachts,
  Cocktails, Cruise-Outs) + 11 unique Special Actions
- **Member Deck (25):** the club roster, Podium Pete to Seasick Susie

## Dev notes

Plain JS, no framework — files attach to a global `CC` namespace
(`data → engine → ai → net → ui → main`). The sim layer (`data/engine/ai`) is
DOM-free and covered by headless tests:

```
node test/engine_test.js   # meld rules + 100 full AI-vs-AI games, invariants checked
node test/ui_smoke.js      # full games through the real UI layer against a DOM shim
```

`engine.js` is a pure state machine: every change goes through
`CC.engine.apply(state, action)`, and decisions that need player input surface
as `state.pending` — which is what lets the same engine drive solo play, AI
turns, and networked guests identically.

Card art was generated with Midjourney in 2024 for the physical print run;
sources live in `~/Downloads/Commodore Cup` (PSDs + full-res PNGs).
