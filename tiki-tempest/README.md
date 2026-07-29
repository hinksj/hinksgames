# TIKI TEMPEST — the online card game

*The 1970s beach-happy-hour cocktail mixer, designed and printed in 2024 — now
playable in a browser, solo against AI rivals or online with friends.*

**Play it live:** https://hinksj.github.io/hinksgames/tiki-tempest/

Stock your bar with ingredients, serve cocktails off the shared **Drink Menu**
(common drinks 4 pts, rares 6), shelve beers for the end-game count, and watch
the sky — **Storm Surge** ends a round the moment it's drawn, and someone will
eventually ring **Last Call**. Thieving Seagulls raid unprotected bars; Paper
Umbrellas keep them off. Full rules in [`RULES.md`](RULES.md); recovery notes
in [`docs/DESIGN-RECOVERY.md`](docs/DESIGN-RECOVERY.md).

## Run it

No build step, no dependencies (PeerJS from a CDN for online play only):

```
python3 -m http.server        # in this folder
open http://localhost:8000
```

## Play online with friends

Host a bar, share the room code, friends join from anywhere — the host's
browser referees (same host-authoritative PeerJS setup as Commodore Cup).
Dropped guests are replaced by AI.

## Dev notes

Plain JS, global `TT` namespace (`data → sound → engine → ai → net → ui →
main`), DOM-free sim layer, headless tests:

```
node test/engine_test.js   # deck composition + 100 full AI games, conservation checked
node test/ui_smoke.js      # full games through the real UI layer against a DOM shim
```

All card art is the original 2024 print art; sources live in
`~/Documents/Tiki Tempest/` (PSDs + full-res PNGs).
