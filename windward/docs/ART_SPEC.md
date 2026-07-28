# Windward — Outside Art Specification

What painted/drawn art the game needs to go past its procedural ceiling, in
priority order, with exact dimensions so anything produced drops straight in.
Works for a commissioned artist, AI generation, or hand-drawn-and-scanned art
(ink drawings would suit the chart and events especially well).

**Global style notes.** Painterly with clean silhouettes — readability beats
detail (FTL's core trick). Muted period palette: tar-black, oak brown, sailcloth
cream, brass gold, deep sea blue-greens; accent red reserved for the enemy and
danger. Light from upper right. All sprites: transparent PNG at 2× the display
size listed. No text baked into images.

---

## 1. Ship hull paintings (highest impact)

Side view, **bow facing right** (the code mirrors enemies), waterline near the
bottom edge. The art replaces the procedural hull, masts-and-sails stay
procedural (they animate — billow, furl, burn), and the room grid is drawn ON
the hull by code, so the deck area must read as a flat, uncluttered surface.

Per class — display size (make PNGs at 2×):

| Ship | File | Display px | Room-grid zone (x, y, w, h within image) |
|---|---|---|---|
| Sloop (player) | `assets/art/hull_sloop.png` | 392 × 190 | 60, 34, 272, 136 |
| Cutter | `assets/art/hull_cutter.png` | 324 × 190 | 60, 34, 204, 136 |
| Brig | `assets/art/hull_brig.png` | 324 × 190 | 60, 34, 204, 136 |
| Frigate | `assets/art/hull_frigate.png` | 324 × 190 | 60, 34, 204, 136 |
| Leviathan (boss) | `assets/art/hull_leviathan.png` | 392 × 190 | 60, 34, 272, 136 |

Waterline sits at y=178 of the display image (code overlays animated sea from
there down). Wanted per hull: curved sheer line, stern gallery with lit windows,
gun ports along the side, bowsprit, figurehead, a gold wale stripe; the
Leviathan grander and more ornate (Admiralty black-and-gold), corsair hulls
rougher and patched. Optional: one battle-damage overlay per hull (same size,
scorch and splinter marks, drawn on transparency).

## 2. Sector backdrops

Full-canvas painted seascapes, 1000 × 460 each, **horizon at y = 205**. Dark
enough that light UI text stays readable. Four moods:

- `bg_fair.png` — dawn gold, calm (Reach 1)
- `bg_squall.png` — grey-green overcast (Reach 2)
- `bg_gloom.png` — violet dusk, unnatural (Reach 3)
- `bg_storm.png` — inside the Maelstrom

Optional split per backdrop into sky layer + sea layer for parallax.

## 3. Crew portraits

Bust portraits for the crew panel and hire screen, 48 × 48 display (96 × 96
PNG): Human sailor ×3 variants, Selkie ×2, Golem ×2, Stormtouched ×2
(9 total). Style: painted, period dress; Selkies with sea-dark eyes and seal
sleekness; Golems kiln-fired clay with an inscribed brow; Stormtouched with
faint lightning-scar patterning (Lichtenberg figures).

## 4. Event spot illustrations

Landscape scenes shown atop event text, 620 × 200 display. Ink-and-wash on
parchment tone matches the modals. Eight cover all sixteen events:
wreck/salvage · ghost ship · the shadow below · burning ship · port/lighthouse
· storm · the dead whale · a golem adrift.

## 5. Weapon and station icons

- Weapon mount sprites (replace/extend the Kenney cannon): long gun, carronade,
  mortar, ballista, swivel, culverin — 6 sprites, ~30 × 18 display, side view
  facing right.
- Station icons to replace unicode glyphs: helm wheel, sail, fog-charm, crossed
  guns, pump, surgeon's kit — 6 icons at 18 × 18 display, single-color-friendly.

## 6. Chart dressing (nice-to-have)

Hand-inked island stamps ×8 (80 × 80), a fine compass rose, a cartouche frame
for the reach title, one sea-monster vignette. The current SVG versions work;
these would add hand-drawn charm.

---

## Integration contract

Drop files into `assets/art/` with the names above and tell Claude — the
renderer keeps procedural drawing as the fallback for any missing file (the
same pattern already used for the Kenney sprites), so art can land one piece
at a time in any order.
