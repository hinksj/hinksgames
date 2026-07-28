# Commodore Cup — design recovery notes (July 2026)

The game was designed and physically printed in July 2024, but the rules were
never finished ("PRINTED — mechanics incomplete" per the project ontology).
This documents where everything was found and what was decided.

## Sources found on this machine

| Source | What it holds |
|---|---|
| `~/Downloads/Commodore Cup/` (327 files) | Finished card art: "<Name> on Template.png" full-res composites + PSDs for all 84 cards, two card backs, Midjourney source images |
| `~/Downloads/Commodore Card Game.xlsx` | Final card list: 4 suits × 12 (A–L), 11 special actions, 25 characters with point values — 84 total |
| `~/Downloads/chatgpt_chunks/2024-Q3_part1.json` | The full July 2024 design conversation ("Create Fun Yacht Club Game"): gin-rummy chassis, suit selection, character naming, the pivot from numbers to letters, final name lists |
| `~/Downloads/PROJECT_ONTOLOGY.md`, `PERSONAL_HANDOFF.md`, `JENNIFER_EMPIRE_TABLES.md` | Status notes: printed, physical cards in hand, mechanics incomplete |

## What is canon

**The printed cards.** Where the spreadsheet, the chat drafts and the printed
art disagree, the art wins — it's what's in the physical box. All 25 member
cards and 11 special cards were transcribed from the card images. Notable
differences vs. the spreadsheet:

- **Podium Pete**: printed "+5 and look at another player's hand" (sheet said
  +10 and draw).
- **Starboard Steve**: printed "Gain 2 points and hand a card to an opponent"
  (the sheet's rows for Charlotte/Steve were misaligned; chat draft said −2/skip).
- **Champagne Charlotte**: printed "−2 points, and hand one card to an opponent."
- **Party Penelope**: printed "draw an extra two cards" (sheet said one).
- **Party Foul**: printed "Discard one extra card" (sheet intent: "forces a
  discard") — the rules split the difference: target any player, self included.
- The **Yachts suit** is the marine-animal fleet (Albatross…Lobster), not the
  yacht manufacturers from the drafts. **Cruise-Outs** include Grand Cayman and
  Juan de Fuca (not the drafted "A Giants Game"/"Jack London Square").
- Two different card backs confirm the **Member deck is separate** from the
  Club deck.

## Mechanics finalized in v1.0

The 2024 drafts settled on: gin-rummy melds (sets = same letter across suits,
runs = consecutive letters in a suit), 1 point per melded card, a member deck
you draw from after melding, play to a point target. Left unresolved: hand
size, when/whether member draws are optional, special-card scoring, going out,
stall handling. `RULES.md` ("Designer's Notes") records each decision and why.

## Digital build

- `assets/cards/*.jpg` — 86 images resized to 640 px JPEG from the full-res
  PNGs (originals untouched in Downloads).
- Engine/AI/UI/network as described in `README.md`. Verified: 100 headless
  AI-vs-AI games (2–6 seats), full games through the UI layer under a DOM shim,
  and a live two-browser online session over PeerJS (lobby join, seat
  assignment, host-validated guest actions, state mirroring).
