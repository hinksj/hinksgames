# WINDWARD — Outrun the Maelstrom

A browser roguelike in the mold of FTL: Faster Than Light, re-themed to
Nelson-era men-o'-war with a thread of European folk magic — witch-fog, selkies,
shipwrights' golems, St. Elmo's fire — rather than sci-fi.
Premise: the Heart of the Storm is the charm the Crown's weather-witches use to
steer the Maelstrom — a storm they aim at coastlines like a weapon. You stole it
because the Free Isles, your home, were next on its path. Now the witches drive
the storm after you to take it back; deliver the Heart to the Isles, whose own
witches can unmake it. The flagship HMS Crown Leviathan blockades the last strait.

## Design pillars

1. **FTL's loop, intact.** Real-time-with-pause tactical combat; a node map you
   cross under pressure from an advancing threat; scrap-economy upgrades; permadeath.
2. **Theme does mechanical work.** The re-skin isn't paint: oxygen becomes *flooding*
   (water comes IN instead of air going OUT), and water extinguishes fires, which
   creates trade-offs FTL doesn't have.
3. **One sitting.** A run is 20–40 minutes: three "reaches" (sectors) and a boss.

## FTL → Windward mapping

| FTL | Windward |
|---|---|
| Spaceship | Sailing ship |
| FTL jump | Setting sail between islands (waypoints) |
| Rebel fleet advance | The Maelstrom front sweeping the chart west→east |
| Scrap | Doubloons |
| Reactor power | The ship's company — unnamed hands mustered between stations |
| Shields (bubbles) | Witch-Fog — a weather-worker's fog banks that swallow incoming shot |
| Engines (evasion) | Sails & rigging |
| Piloting | The Helm (must be manned to dodge) |
| Weapons system | Gun Deck |
| Oxygen loss | **Flooding** — breaches let water in; Bilge Pumps drain it |
| Medbay | Surgeon's Berth |
| Fires | Fires (spread; water >40% puts them out) |
| Hull breach | Below-waterline breach (floods that room) |
| Bombs (bypass shields) | Fire-Pot Mortar (lobbed over the fog, aimed at the masts) |
| Crew races | Human, Selkie, Golem, Stormtouched |
| Stores | Free ports |
| Boss (Rebel Flagship) | HMS Crown Leviathan, the Armada flagship |

## Ship systems

- **Helm** (subsystem, no power): evasion requires a crewed helm. Level 2+ grants a
  half-effect "lashed wheel" autopilot.
- **Sails** (1–4): each power bar = +5% evasion; drives escape speed in combat.
- **Witch-Fog** (1–6): the fog-caller's charms wrap the ship in banks of unnatural
  fog. Every 2 hands = 1 fog bank (max 3). Each bank swallows one incoming ball and
  rolls back in ~5s (faster if the charms are tended by an officer). No shields on a
  sailing ship — just weather bent to your side, which is why mortars lobbed high and
  aimed at the masts clear it entirely. (Internal system key remains `ward`.)
- **Gun Deck** (1–6): power pool that individual weapons draw from, FTL-style.
  Manned: +10% charge speed.
- **Bilge Pumps** (1–3): global drain rate vs. breach inflow.
- **Surgeon's Berth** (1–2): heals crew standing in it while powered.

## Weapons

Four classes, mapping FTL's weapon categories to period gunnery and hexwork:

- **Round shot** (lasers): rolled against evasion, swallowed by fog banks.
- **Mortars** (missiles): arc over any fog, aimed at the masts — but eat one
  **shell** per shot. Shells are bought from pursers and looted from prizes.
- **Raking fire** (beams): a full deck fired down her length — sweeps several
  rooms and cannot miss, but any fog bank defeats it outright (and isn't consumed).
- **Hexwork** (ion): a binding-curse that seizes the struck station for a few
  seconds — no power flows — harming neither timber nor souls. Self-expires;
  crew can't repair it away.

| Weapon | Class | Pwr | Charge | Damage | Notes |
|---|---|---|---|---|---|
| Long Nine | ball | 1 | 9s | 1 | reliable bow chaser |
| Chain-Shot | ball | 1 | 11s | 1 | double system damage |
| Swivel Battery | ball | 2 | 11s | 1×3 | three balls — beats gaps through fog |
| Carronade | ball | 2 | 14s | 2 | fire + breach chance |
| Grape-Shot | ball | 1 | 10s | 0×2 | anti-crew canister, spares timber |
| Harpoon Ballista | ball | 2 | 16s | 2 | 80% breach — flood them out |
| Fire-Pot Mortar | mortar | 2 | 13s | 0 | 85% fire; 1 shell/shot |
| Long Mortar | mortar | 2 | 17s | 3 | 30% breach; 1 shell/shot |
| Stern-Rake Battery | rake | 2 | 15s | 1×3 rooms | never misses; blocked by fog |
| Hex-Shot Culverin | hex | 1 | 10s | 0 | seizes station 7s (stacks) |

## Crew

| Race | HP | Traits |
|---|---|---|
| Human | 100 | no bonuses, no weaknesses |
| Selkie | 90 | seal-folk — cannot drown; fast |
| Golem | 130 | blessed clay: fireproof, cannot drown, best repairs, slow |
| Stormtouched | 80 | 1.5× melee, fast, fragile, poor repairs |

Crew auto-act in their room (fight boarders > plug breach > douse fire > repair >
man station); the player gives movement orders, FTL-style. Some events have
"blue options" gated on crew race or system levels.

## Combat

Real-time with pause (SPACE). Click a weapon, then click an enemy room to target;
charged weapons fire automatically at their target. Weapons laid on the same room
synchronize into a single broadside (the volley-timing FTL makes you do by hand),
so concentrated fire can break a regenerating ward while split fire suppresses
multiple systems. Hits roll target evasion, then
fog banks, then apply hull damage, system damage, fire/breach chances, and hurt
crew in the room. Some enemies grapple and board. Enemies at low hull may strike
their colors — accept the surrender for bonus gold, or press the attack.
You can escape any fight by raising full sail (a timer driven by sails power).

Weather: each reach has its own sky — fair dawn, rain squalls with lightning,
then the violet gloom of the Deadlight Deep with fog scraps adrift. Fights inside
the Maelstrom's swallowed waters are storm-lashed regardless of reach.

## The run

Three reaches of ~11 waypoints each (fight / event / distress / port / open sea /
strait to the next reach). Every departure advances the Maelstrom ~2/3 of a column;
arriving at a swallowed waypoint costs hull and forces an elite fight. The third
reach ends at the Crown Leviathan: 28 hull, witch-fog three banks deep, heavy guns,
boarders — but a fortress, not a racer: her evasion is poor. Sink her and the
Free Isles are yours.

Economy: doubloons from fights and events; free ports sell weapons, crew, hull
repair, system upgrades, more hands, mortar shells, and provisions.

**Provisions** (a mechanic FTL doesn't have — its fuel, with teeth): every sail
eats one. Run dry and the crew starves a little each jump, and each hungry jump
raises the odds of **mutiny** — face it down, buy peace with rum and gold, or
let the golems stand every watch (clay hands neither eat nor mutiny). Some
events and captured prizes yield provisions.

## Cut from v1 (roadmap)

- Sound/music (WebAudio sea ambience + cannon thumps)
- Door/venting micromanagement (FTL's airlock game doesn't map 1:1 to flooding —
  a "scuttle valve" per room to deliberately flood a burning room would)
- Player-initiated boarding, crew skill growth, multiple playable ships/unlocks
- More reaches, faction variety (ghost fleet, leviathan pods), hazard nodes
  (reefs = asteroid fields, doldrums = nebulas)
- Mobile/touch layout
