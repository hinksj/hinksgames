# Tiki Tempest — design recovery notes (July 2026)

Designed and physically printed in 2024 ("PRINTED — mechanics incomplete" per
the project ontology). Recovered sources:

| Source | What it holds |
|---|---|
| `~/Documents/Tiki Tempest/Completed or Close Cards PNG Files/` | Finished card art (recipes, ingredients, specials, beer, two card backs) + PSDs in sibling folder |
| `~/Documents/tiki tempest beach happy hour list.xlsx` | Final deck list: 9 recipes with ingredient requirements, deck ratios — 162 cards total |
| `~/Downloads/Commodore Cup/tiki tempest card explanations.docx` | Card explanations for Storm Surge, Make It a Double, Thieving Seagull, Tiki Torch, Tidal Handover, Island Breeze, Pirate's Plunder, Paper Umbrella |
| ChatGPT export `2024-Q1_part1.json`, conversation "Tiki Tempest" | The design conversation: Sushi Go inspiration, common/rare cocktails, beer bottles as the pudding mechanic, Last Call as game-ender |

## The printed deck (canon)

**Recipe deck (22 cards, tiki-hut back):**

| Cocktail | Recipe (as printed) | Points | Copies |
|---|---|---|---|
| Caribbean Sunset | 2 Rum, 1 Pineapple | 4 | 3 |
| Piña Colada | 1 Rum, 1 Pineapple, 1 Coconut Cream | 4 | 3 |
| Coconut Fizz | 1 Rum, 2 Coconut Cream | 4 | 3 |
| Lime Daquiri *(printed spelling)* | 1 Rum, 2 Lime | 4 | 3 |
| Mai Tai | 2 Rum, 1 Lime, 1 Orange Liqueur | 6 | 2 |
| Blue Hawaiian | 1 Rum, 2 Pineapple, 1 Blue Curaçao | 6 | 2 |
| Painkiller | 1 Rum, 1 Pineapple, 1 Coconut Cream, 1 Nutmeg | 6 | 2 |
| Bahama Mama | 1 Rum, 1 Coconut Cream, 1 Pineapple, 1 Grenadine | 6 | 2 |
| Planter's Punch | 1 Rum, 1 Lime, 1 Grenadine, 1 Orange Liqueur | 6 | 2 |

**Main deck (135 cards, tiki-mask back):**

- Ingredients (91): Rum ×20, Pineapple ×18, Coconut Cream ×16, Lime ×16
  (commons); Orange Liqueur ×5, Blue Curaçao ×5, Nutmeg ×5, Grenadine ×6
  (rares — labeled on the cards)
- Beer ×16 (no text; the Sushi Go "pudding": end-game most/fewest bonus)
- Specials (28): Thieving Seagull ×4, Paper Umbrella ×4, Guest Bartender ×3,
  Tiki Torchlight ×3, Pirate('s) Plunder ×3, Tidal Handover ×3, Island Breeze
  ×3, Make It a Double ×3, Last Call ×1, Storm Surge ×1

**Printed special-card text (canon):**

- Guest Bartender: "You may demand a specific ingredient from one player. If
  they have it, that card is now yours."
- Tiki Torchlight: "Reveal 3 cards from the main deck and add one to your hand"
- Pirate Plunder: "Steal a random card from an opponent's hand."
- Tidal Handover: "Each player passes one card from their hand to the player on
  their right"
- Last Call: "This is the last round of play — tell the patrons to drink up."
- Thieving Seagull: "Take any Ingredient Card off the table."
- Paper Umbrella: "Protects from seagulls. Adds a point to cocktails. Once
  played, must remain."
- Island Breeze: "All players draw 2 cards from the main deck"
- Make It a Double: "Play when a cocktail is 'served' to double its points."
- Storm Surge: "This card must be played immediately when drawn and ends the
  round. *If this card is drawn in your initial hand, reshuffle it to the
  bottom half of the deck and take a replacement"

The xlsx also lists "One side blank ×5" (filler, not gameplay). 162 total.

## Mechanics finalized in v1.0 (the 2024 design left these open)

See RULES.md Designer's Notes. Headlines: turn = draw 2 / play up to 2 with
free serves; a face-up 4-recipe Drink Menu; ingredients build your Bar
(tableau); serving consumes Bar ingredients and claims the menu card; rounds
are 10 turns per player (Storm Surge cuts one short, Last Call marks the last);
2 rounds by default; beers persist across rounds and score most +10 / fewest −5
at game end; Paper Umbrella shields your whole Bar from Seagulls and adds +1 to
the cocktail it garnishes.
