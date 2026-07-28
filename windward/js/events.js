'use strict';

// Event op fields: text (required), gold: n or [a,b] (negative = cost), hull: n,
// healAll: n, crew: raceId|'random', loseCrew: true, weapon: id|'random',
// combat: {tier?, id?, elite?}
// Choice: {label, req: {race|sys:{id,level}}, op: {...}} or {label, req, outcomes: [[weight, op], ...]}

W.EVENTS = [
  {
    id: 'wreck', title: 'Drifting Wreck',
    text: 'A merchant ship wallows in the swell, dismasted — her masts snapped off and dragging alongside in a tangle of rope. Gulls have claimed what\'s left. There could be cargo below — or something that never left.',
    choices: [
      { label: 'Board her and search the hold.', outcomes: [
        [0.55, { text: 'Sodden crates, but the strongbox is intact.', gold: [12, 26] }],
        [0.25, { text: 'The hold is empty — and rigged. A powder trap scorches your boarding party.', hull: -1, gold: [0, 5] }],
        [0.20, { text: 'Corsairs were waiting for scavengers like you.', combat: { tier: 0 } }],
      ]},
      { label: '◆ Send your diver under the hull.', req: { race: 'tideborn' }, op:
        { text: 'Your diver slips beneath the waterline and returns with the captain\'s sealed chest, dry as bone.', gold: [24, 40] } },
      { label: 'Leave her to the sea.', op: { text: 'You note her position in the log and sail on.' } },
    ],
  },
  {
    id: 'convoy', title: 'Merchant Convoy',
    text: 'Three fat merchant ships under full sail head east, their naval escort nowhere in sight. Their signal flags ask your intentions.',
    choices: [
      { label: 'Escort them through the strait.', outcomes: [
        [0.7, { text: 'A dull afternoon of station-keeping. Their purser is grateful, and their cook generous.', gold: [10, 18], provisions: 2 }],
        [0.3, { text: 'Corsairs hit the convoy at dusk — and you are the escort.', combat: { tier: 0 }, gold: [15, 25] }],
      ]},
      { label: 'Run up false colors and demand a toll.', outcomes: [
        [0.5, { text: 'They pay rather than test you.', gold: [18, 32] }],
        [0.5, { text: 'Their "merchantman" runs out her guns. A privateer decoy!', combat: { tier: 0 } }],
      ]},
      { label: 'Pass them by.', op: { text: 'Their wakes cross yours and are gone.' } },
    ],
  },
  {
    id: 'kraken', title: 'A Shadow Below',
    text: 'The sea goes glass-calm. Something vast slides beneath the keel — long as three ships, patient as winter. The crew stops breathing.',
    choices: [
      { label: 'Hold course. Slowly.', outcomes: [
        [0.6, { text: '"She sounds!" the lookout breathes — diving, deep — and the shadow sinks away into the dark. Nobody speaks for an hour.', }],
        [0.4, { text: 'A tentacle tests the hull, almost gently, then withdraws.', hull: -2 }],
      ]},
      { label: '◆ Send your diver over the side for a look.', req: { race: 'tideborn' }, op:
        { text: 'Your diver slips under without a splash, hangs there a long minute, and comes up with an armful of ambergris — mouthing: do not wake it. You alter course by a point and leave it sleeping.', gold: [25, 45] } },
      { label: 'Pile on sail and run.', outcomes: [
        [0.5, { text: 'You outrun it. Probably it was never chasing.', }],
        [0.5, { text: 'Your wake wakes it. A flick of one limb snaps spars.', hull: -3 }],
      ]},
    ],
  },
  {
    id: 'ghost', title: 'The Deadlight Barque',
    text: 'A barque crosses your bow with no crew at the rails and lanterns burning green. Her name-board reads backwards, as if seen in a mirror.',
    choices: [
      { label: 'Board her.', outcomes: [
        [0.5, { text: 'The galley fire is warm and no one is aboard. In the great cabin: a chart weighted with coins.', gold: [15, 30] }],
        [0.5, { text: 'Your boarding party returns pale and older. They will not say what they saw.', healAll: -25 }],
      ]},
      { label: '◆ Send the marines across in good order.', req: { race: 'stormtouched' }, op:
        { text: 'The marines board by the book, bayonets fixed, nerves iron. The derelict gives up nothing worse than silence — and a crated gun, sound as the day it was stowed.', weapon: 'random' } },
      { label: 'Turn away and get clear.', op: { text: 'Some prizes are bait. You put her astern and keep your eyes forward.' } },
    ],
  },
  {
    id: 'bottle', title: 'Message in a Bottle',
    text: 'A lookout fishes a wax-sealed bottle from the floating weed. Inside, a torn piece of chart marks buried goods under a lightning-split palm — a short detour from your course.',
    choices: [
      { label: 'Follow the chart.', outcomes: [
        [0.55, { text: 'Under the split palm: a rotted chest of doubloons.', gold: [20, 38] }],
        [0.25, { text: 'The cache is long since looted. Sand and crab shells.', }],
        [0.20, { text: 'The chart was a lure. A corsair cutter slips the cove.', combat: { tier: 0 } }],
      ]},
      { label: 'Toss it back.', op: { text: 'Let some other fool chase palm trees.' } },
    ],
  },
  {
    id: 'shanty', title: 'Night Watch Shanty',
    text: 'Becalmed under strange stars, the watch strikes up a shanty older than the Armada. Even the marines unbend enough to hum.',
    choices: [
      { label: 'Break out the good rum and join in.', op: { text: 'Spirits mend faster than timber. The crew stands taller come dawn.', healAll: 30 } },
      { label: 'Keep the watch quiet.', op: { text: 'Discipline holds. The sea stays silent.' } },
    ],
  },
  {
    id: 'lighthouse', title: 'The Last Lighthouse',
    text: 'A lighthouse on a drowned spire, its keeper an old woman who has watched the Maelstrom eat the western sea. She trades in timber and news.',
    choices: [
      { label: 'Buy repairs from her stores. (10 doubloons)', req: { gold: 10 }, op:
        { text: 'Good dry oak and iron nails. Her price is fair and her hands sure.', gold: -10, hull: 6 } },
      { label: 'Ask what she knows of the Leviathan.', op:
        { text: '"She sails wrapped in smoke screen three banks deep, and her fire-pots arc over any smoke you raise, aimed at your masts. Silence her gun deck first, or you\'ll wish you had."' } },
      { label: 'Leave her to her light.', op: { text: 'The beam sweeps you out of the shallows.' } },
    ],
  },
  {
    id: 'cache', title: 'Smugglers\' Marks',
    text: 'Fresh cuts on a reef buoy — smugglers\' marks, pointing into a maze of sandbars. Somewhere in there is a cache. So, probably, are the smugglers.',
    choices: [
      { label: '◆ Navigate the sandbars by dead reckoning.', req: { sys: { id: 'helm', level: 2 } }, op:
        { text: 'Dead reckoning — steering by clock, compass, and nerve, with nothing to see — and your helmsman reads the water like scripture besides. In the cache: powder, shot, and a crated weapon.', weapon: 'random' } },
      { label: 'Feel your way in.', outcomes: [
        [0.45, { text: 'You scrape through and find the cache half-flooded.', gold: [15, 28] }],
        [0.30, { text: 'You run aground on a sandbar and have to winch the ship off — slow, sweaty, and hard on the hull.', hull: -2 }],
        [0.25, { text: 'The smugglers were home.', combat: { tier: 0 } }],
      ]},
      { label: 'Not worth the keel.', op: { text: 'You leave the marks for braver fools.' } },
    ],
  },
  {
    id: 'castaway', title: 'The Castaway',
    text: 'A raft of lashed spars, a scrap of sail, and one sunburnt figure waving with the last of their strength.',
    choices: [
      { label: 'Bring them aboard.', outcomes: [
        [0.7, { text: 'They kiss the deck and sign on with your crew on the spot.', crew: 'random' }],
        [0.3, { text: 'Overnight they help themselves to the purser\'s chest and vanish at the next islet.', gold: -10 }],
      ]},
      { label: 'Leave water and keep your distance.', op: { text: 'Charity at a cable\'s length. The sea keeps its own accounts.' } },
    ],
  },
  {
    id: 'checkpoint', title: 'Armada Checkpoint',
    text: 'An Armada warship sits across the channel, gun ports open. Her signal flags climb the halyard one by one. "Heave to," your helmsman reads aloud — the command to stop and be boarded. "For inspection. By order of the Crown." Your hold carries the Heart of the Storm.',
    choices: [
      { label: 'Bribe the boarding officer. (15 doubloons)', req: { gold: 15 }, outcomes: [
        [0.8, { text: 'The officer weighs the purse and discovers your papers in perfect order.', gold: -15 }],
        [0.2, { text: 'The officer pockets your purse — and signals the gun crews anyway.', gold: -15, combat: { id: 'patrol' } }],
      ]},
      { label: '◆ Pile on sail and outrun them.', req: { sys: { id: 'sails', level: 3 } }, op:
        { text: 'You simply outrun them. Their shot falls into your wake, further behind with every minute.' } },
      { label: 'Open the gun ports and fight.', op: { text: 'No inspection today.', combat: { id: 'patrol' } } },
    ],
  },
  {
    id: 'squall', title: 'Black Squall',
    text: 'The barometer drops like a stone. A storm front rolls down on you, green-black and full of lightning the wrong color.',
    choices: [
      { label: '◆ Ride it out under storm canvas.', req: { sys: { id: 'sails', level: 3 } }, op:
        { text: '"Reef her down to handkerchiefs," your oldest hand says — sails shortened to scraps that the wind can\'t tear. The rigging holds. The squall rolls over you like thunder and is gone.' } },
      { label: 'Batten down and endure.', outcomes: [
        [0.5, { text: 'A hard night. The pumps run until dawn.', hull: -2 }],
        [0.3, { text: 'St. Elmo\'s fire walks the yards and drips burning to the deck.', hull: -1 }],
        [0.2, { text: 'You find the squall\'s quiet eye and slip through untouched.', }],
      ]},
    ],
  },
  {
    id: 'automaton', title: 'The Marooned Shipwright',
    text: 'A signal fire on a nameless key: a marooned man in the rags of a guild coat, half-starved, guarding a sea chest of tools as if it were his child.',
    choices: [
      { label: '◆ Have your carpenter read his guild-marks.', req: { race: 'brass' }, op:
        { text: 'The marks are true — a master shipwright, wrecked and left for dead. He signs on for passage and pride, and your hull is the better for it.', crew: 'brass' } },
      { label: 'Take him aboard on charity.', outcomes: [
        [0.6, { text: 'He proves handy enough once fed, and quieter than most.', crew: 'human' }],
        [0.4, { text: 'His nerves are gone for the sea. At the next islet he pays his passage in good tools and goes ashore for good.', gold: [15, 25] }],
      ]},
      { label: 'Leave him the water you can spare.', op: { text: 'He does not wave as you go. The fire burns a long time behind you.' } },
    ],
  },
  {
    id: 'whalefall', title: 'The Dead Whale',
    text: 'A great sperm whale floats belly-up like a grey island, gulls already staking claims. Whalers\' boats will come by dusk, but you are first.',
    choices: [
      { label: 'Harvest the carcass.', op: { text: 'Grim work, good pay. Whale oil, bone, and meat fill the casks.', gold: [15, 28], provisions: 2 } },
      { label: '◆ Send your diver into the carcass.', req: { race: 'tideborn' }, op:
        { text: 'Deep in the whale\'s gut your diver finds what every whaler prays for: ambergris, a fortune in a sack.', gold: [30, 50] } },
      { label: 'Give it sea-room.', op: { text: 'Some feasts belong to the gulls.' } },
    ],
  },
  {
    id: 'burning', title: 'Ship Afire', distress: true,
    text: 'A brigantine burns to the waterline, her boats already gone or never launched. Figures still move on her quarterdeck.',
    choices: [
      { label: 'Run in and take off survivors.', outcomes: [
        [0.6, { text: 'You haul four souls off the quarterdeck. One, steadied and fed, asks to sign on.', crew: 'random' }],
        [0.4, { text: 'Her powder magazine explodes as you close in. Burning debris rains across your deck.', hull: -2 }],
      ]},
      { label: 'Salvage what floats.', op: { text: 'You fish casks and cordage from the slick, and try not to look at the quarterdeck.', gold: [8, 18] } },
      { label: 'Stand off.', op: { text: 'The pillar of smoke follows you below the horizon.' } },
    ],
  },
  {
    id: 'plague', title: 'The Yellow Jack', distress: true,
    text: 'A schooner flying the yellow jack — plague aboard. A thin voice begs for a surgeon across the water.',
    choices: [
      { label: '◆ Send your surgeon\'s best across.', req: { sys: { id: 'surgeon', level: 2 } }, op:
        { text: 'Your surgery knows this fever. Three days of hard nursing and the schooner\'s master empties her strongbox in gratitude.', gold: [25, 40] } },
      { label: 'Board and help as you can.', outcomes: [
        [0.5, { text: 'You do more good than harm, and they pay what they can.', gold: [8, 15], healAll: -15 }],
        [0.5, { text: 'The fever crosses with the boarding party.', healAll: -30 }],
      ]},
      { label: 'Stand well clear.', op: { text: 'The yellow jack dwindles astern. The wind feels colder.' } },
    ],
  },
  {
    id: 'doldrums', title: 'The Doldrums', distress: true,
    text: 'You find a becalmed fishing smack, sails slack for nine days, her crew sun-blasted and out of water.',
    choices: [
      { label: 'Take her under tow to the current.', op: { text: 'Two days\' hard pulling. Her master pays in smoked fish and silver.', gold: [10, 20], provisions: 3 } },
      { label: 'Pass over water casks and move on.', op: { text: 'They bless your name. It costs you nothing but time.', healAll: 10 } },
    ],
  },
];

W.Events = {
  pick(distress) {
    let pool = W.EVENTS.filter(e => (distress ? e.distress : !e.distress) && !e.used);
    if (!pool.length) pool = W.EVENTS.filter(e => (distress ? e.distress : !e.distress));
    const ev = W.pick(pool);
    ev.used = true;
    return ev;
  },

  reqMet(req) {
    if (!req) return true;
    if (req.race) return W.player.crew.some(c => c.race === req.race && c.hp > 0);
    if (req.sys) {
      const s = W.player.systems[req.sys.id];
      return !!s && s.level >= req.sys.level;
    }
    if (req.gold) return W.state.gold >= req.gold;
    return true;
  },

  resolve(ev, choiceIdx) {
    const ch = ev.choices[choiceIdx];
    let op = ch.op;
    if (ch.outcomes) {
      const total = ch.outcomes.reduce((s, o) => s + o[0], 0);
      let roll = Math.random() * total;
      for (const [wgt, o] of ch.outcomes) {
        roll -= wgt;
        if (roll <= 0) { op = o; break; }
      }
      if (!op) op = ch.outcomes[ch.outcomes.length - 1][1];
    }
    return this.apply(op);
  },

  apply(op) {
    const lines = [op.text];
    let combat = null;
    const P = W.player;

    if (op.provisions) {
      W.state.provisions = W.clamp((W.state.provisions | 0) + op.provisions, 0, 20);
      lines.push(op.provisions > 0 ? `+${op.provisions} provisions.` : `${op.provisions} provisions.`);
    }
    if (op.gold != null) {
      const g = Array.isArray(op.gold) ? W.randi(op.gold[0], op.gold[1]) : op.gold;
      W.state.gold = Math.max(0, W.state.gold + g);
      if (g > 0) lines.push(`+${g} doubloons.`);
      else if (g < 0) lines.push(`${g} doubloons.`);
    }
    if (op.hull) {
      P.hull = W.clamp(P.hull + op.hull, 1, P.hullMax);
      lines.push(op.hull > 0 ? `Hull repaired +${op.hull}.` : `Hull damaged ${op.hull}.`);
    }
    if (op.healAll) {
      P.crew.forEach(c => { c.hp = W.clamp(c.hp + op.healAll, 1, c.maxHp); });
      lines.push(op.healAll > 0 ? 'The crew recovers.' : 'The crew is worse for it.');
    }
    if (op.crew) {
      if (P.crew.length >= 6) {
        W.state.gold += 15;
        lines.push('No berths left — they pay 15 doubloons for passage instead.');
      } else {
        const race = op.crew === 'random' ? W.pick(Object.keys(W.RACES)) : op.crew;
        const c = P.addCrewSpec({ race });
        lines.push(`${c.name} the ${W.RACES[race].name} joins your crew.`);
      }
    }
    if (op.loseCrew && P.crew.length > 1) {
      const c = W.pick(P.crew);
      P.crew = P.crew.filter(x => x !== c);
      lines.push(`${c.name} is lost.`);
    }
    if (op.weapon) {
      const id = op.weapon === 'random' ? W.pick(Object.keys(W.WEAPONS)) : op.weapon;
      if (P.weapons.length < 4) {
        P.weapons.push(new W.Weapon(id));
        lines.push(`Weapon acquired: ${W.WEAPONS[id].name}.`);
      } else {
        const val = Math.floor(W.WEAPONS[id].cost / 2);
        W.state.gold += val;
        lines.push(`No gun-deck space for the ${W.WEAPONS[id].name} — sold for ${val} doubloons.`);
      }
    }
    if (op.combat) {
      const tier = op.combat.tier != null
        ? W.clamp(W.GameMap.sector + op.combat.tier, 1, 3)
        : W.GameMap.sector;
      combat = { id: op.combat.id || W.pickEnemy(tier), elite: !!op.combat.elite };
    }
    return { lines, combat };
  },
};
