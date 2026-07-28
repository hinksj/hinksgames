# WINDWARD — Outrun the Maelstrom

A browser roguelike in the spirit of *FTL: Faster Than Light*, re-themed to
Nelson-era sail with a thread of European sea-magic — witch-fog, selkies,
shipwrights' golems. Real-time-with-pause ship combat, crew orders, mustering
hands between stations, fires and flooding, weather, an advancing storm on the
sector map, events, free ports, and a flagship boss.

See `DESIGN.md` for the full design document and the FTL → Windward mapping.

## Run it

No build step, no dependencies. Either:

- double-click `index.html`, or
- `python3 -m http.server` in this folder and open http://localhost:8000

Progress saves to localStorage automatically at each waypoint (one save slot;
death or victory clears it).

## Controls

| Input | Action |
|---|---|
| SPACE | pause / unpause combat (orders can be given while paused) |
| 1–4 or TARGET button | select a weapon, then click an enemy room to lay the gun on it |
| CREW button | assign or stand down a gun's crew |
| click sailor, then a room | send them there |
| +/− in the power panel | muster the ship's company between stations |
| RAISE FULL SAIL | flee the battle (no loot) |
| ESC | cancel targeting / selection |

Tactics that matter: guns laid on the **same room** fire together as a broadside
(the way through a rolling fog bank); chain-shot the **sails** of high-evasion
ships; harpoon the **bilge pumps** and let the sea do the work; grape-shot their
crew; hex their fog-charms and then rake her full length; group your own crew
before boarders find them separated. Watch the purser's count — every sail eats
a provision, and empty casks breed mutiny.

## Dev notes

Plain JS, no framework — script files attach to a global `W` namespace
(`util → data → model → combat → map → events → store → render → ui → main`).
The sim layer (`model/combat/map/events/store`) is DOM-free and covered by a
headless test:

```
node test/smoke.js
```

which exercises map generation, every enemy matchup (5 trials each, stock and
endgame loadouts), fleeing, boarding, every event outcome, and the store.

There is a second harness, `node test/ui_smoke.js`, that loads the full stack
(render/UI/main) against a DOM shim and plays whole combats through the real
game loop — it guards the win/surrender/loss/flee/map transitions against
softlocks.

Debug URLs: `index.html?test=combat` boots straight into a fight,
`?test=map` into the sector chart.

Sprite art (cannons, cannonballs, explosions, fire, smoke) is CC0 from
[Kenney.nl](https://kenney.nl) — see `assets/CREDITS.txt`. The renderer falls
back to vector drawing if the sprites are missing.
