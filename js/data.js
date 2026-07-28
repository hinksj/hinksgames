'use strict';

// Crew are organized by DIVISION (specialty), as a real ship's company was.
// Internal keys are legacy. fireRes/waterRes scale environmental damage
// (0 = unharmed): professional resilience, not magic.
W.RACES = {
  human:        { name: 'Able Seaman', hp: 100, repair: 1,    combat: 1,   speed: 1,    fireRes: 1,    waterRes: 1,    color: '#e8c07a', desc: 'The backbone of any watch. No bonuses, no weaknesses.' },
  tideborn:     { name: 'Diver',       hp: 90,  repair: 1,    combat: 0.9, speed: 1.1,  fireRes: 1,    waterRes: 0,    color: '#58c7c7', desc: 'Salvage diver — works in flooded compartments without drowning. Quick on their feet, no brawler.' },
  brass:        { name: 'Carpenter',   hp: 130, repair: 1.2,  combat: 1.2, speed: 0.85, fireRes: 0.35, waterRes: 0.35, color: '#c4784f', desc: 'Ship\'s carpenter — the fastest repairs afloat, tough as oak, and has seen every fire and flood there is.' },
  stormtouched: { name: 'Marine',      hp: 90,  repair: 0.85, combat: 1.5, speed: 1.1,  fireRes: 1,    waterRes: 1,    color: '#d05438', desc: 'Sea-soldier — deadly in a boarding brawl and drilled to stand fire. No use with a hammer.' },
};

// "Power" is the ship's company: unnamed hands mustered from station to station.
// NOTE: 'ward' is a legacy internal key — the system is the Witch-Fog: a
// weather-worker's charm that wraps the ship in banks of unnatural fog.
W.SYS = {
  helm:    { name: 'Helm',            icon: '☸', max: 3, sub: true, desc: 'Man the helm to dodge. Level 2+: a lashed wheel gives half evasion unmanned.' },
  sails:   { name: 'Sails',           icon: '⛵', max: 4, desc: 'Each hand aloft: +5% evasion. Drives your escape speed.' },
  ward:    { name: 'Smoke Screen',    icon: '☁', max: 6, desc: 'Every 2 hands tending the smoke-pots = 1 covering bank (max 3). A bank absorbs one incoming shot, then re-forms after ~5 seconds.' },
  cannons: { name: 'Gun Deck',        icon: '⚔', max: 6, desc: 'Hands for the gun crews — each weapon needs its listed number. An officer in the room: +10% charge speed.' },
  pumps:   { name: 'Bilge Pumps',     icon: '≋', max: 3, desc: 'Hands on the chain pumps. Breaches let the sea in until plugged.' },
  surgeon: { name: "Surgeon's Berth", icon: '✚', max: 2, desc: 'Heals crew standing here while the surgery is staffed.' },
};

// Weapon classes, mapping FTL's categories to period gunnery:
//   ball   — round shot: rolled against evasion, swallowed by fog banks
//   mortar — arcs over any fog, aimed at the masts; eats a shell per shot
//   rake   — a full deck fired in sequence down her length: sweeps several
//            rooms and cannot miss, but ANY fog bank defeats it outright
//   hex    — a binding-curse: seizes the struck station (no power flows) for
//            a few seconds; harms neither timber nor souls
W.WEAPON_CLASS = {
  ball:   'ROUND SHOT',
  mortar: 'MORTAR',
  rake:   'RAKING FIRE',
  hex:    'SUPPRESSION',
};
W.WEAPONS = {
  longnine:   { name: 'Long Nine',         class: 'ball',   cost: 40, power: 1, charge: 9,  shots: 1, dmg: 1, sysDmg: 1, fire: 0.10, breach: 0.05, color: '#ffd24a', desc: 'A reliable, quick-firing cannon. The basic gun.' },
  chainshot:  { name: 'Chain-Shot',        class: 'ball',   cost: 50, power: 1, charge: 11, shots: 1, dmg: 1, sysDmg: 2, fire: 0,    breach: 0,    color: '#9adcff', desc: 'Two balls on a chain, spinning. Shreds rigging and machinery.' },
  swivels:    { name: 'Swivel Battery',    class: 'ball',   cost: 55, power: 2, charge: 11, shots: 3, dmg: 1, sysDmg: 1, fire: 0.05, breach: 0,    color: '#ffef9e', desc: 'Three quick balls. Beats gaps through a smoke bank.' },
  carronade:  { name: 'Carronade',         class: 'ball',   cost: 65, power: 2, charge: 14, shots: 1, dmg: 2, sysDmg: 2, fire: 0.20, breach: 0.15, color: '#ff8a5c', desc: 'The smasher. Short, brutal, and prone to starting fires.' },
  grapeshot:  { name: 'Grape-Shot',        class: 'ball',   cost: 50, power: 1, charge: 10, shots: 2, dmg: 0, sysDmg: 0, crewDmg: 32, fire: 0, breach: 0, color: '#d8c8a8', desc: 'A canister of musket balls. Badly hurts crew; does no hull damage.' },
  harpoon:    { name: 'Harpoon Ballista',  class: 'ball',   cost: 70, power: 2, charge: 16, shots: 1, dmg: 2, sysDmg: 2, fire: 0,    breach: 0.80, color: '#b8ffd6', desc: 'Punches a hole below the waterline, flooding the room it hits.' },
  firepot:    { name: 'Fire-Pot Mortar',   class: 'mortar', cost: 60, power: 2, charge: 13, shots: 1, dmg: 0, sysDmg: 1, fire: 0.85, breach: 0, bypassWard: true, shell: true, color: '#ff5c3c', desc: 'Lobs a pot of burning pitch high over any smoke. Sets fires.' },
  longmortar: { name: 'Long Mortar',       class: 'mortar', cost: 75, power: 2, charge: 17, shots: 1, dmg: 3, sysDmg: 2, fire: 0.10, breach: 0.30, bypassWard: true, shell: true, color: '#ffb08a', desc: 'A siege mortar at sea. Slow and devastating; flies over smoke.' },
  rake:       { name: 'Stern-Rake Battery', class: 'rake',  cost: 80, power: 2, charge: 15, shots: 1, dmg: 1, sysDmg: 1, beam: 3, noEvade: true, color: '#ffe9a8', desc: 'Fires gun after gun down the enemy\'s whole length, hitting several rooms.' },
  hexshot:    { name: 'Langrage Gun',      class: 'hex',    cost: 60, power: 1, charge: 10, shots: 1, dmg: 0, sysDmg: 0, hexDur: 7, color: '#c9d4dc', desc: 'A charge of jagged scrap swept across her deck. The station\'s crew dive for cover.' },
};

// One-line rules summary per weapon, shown on cards and in stores.
W.weaponInfo = (def) => {
  const bits = [];
  if (def.beam) bits.push(`sweeps ${def.beam} rooms`, 'cannot miss', 'any smoke bank stops it');
  else if (def.bypassWard) bits.push('arcs over smoke');
  if (def.dmg > 0) bits.push(`${def.dmg} hull` + ((def.shots || 1) > 1 ? ` ×${def.shots}` : ''));
  else if (!def.hexDur && !def.crewDmg) bits.push('no hull harm');
  if ((def.shots || 1) > 1 && def.dmg === 0) bits.push(`×${def.shots} shots`);
  if (def.sysDmg > 0 && def.sysDmg !== def.dmg) bits.push(`${def.sysDmg} station dmg`);
  if (def.hexDur) bits.push(`suppresses station ${def.hexDur}s`, 'harms no one');
  if (def.crewDmg) bits.push('deadly to crew');
  if (def.fire >= 0.5) bits.push('fire-starter');
  else if (def.fire >= 0.15) bits.push(`${Math.round(def.fire * 100)}% fire`);
  if (def.breach >= 0.5) bits.push('breacher');
  else if (def.breach >= 0.15) bits.push(`${Math.round(def.breach * 100)}% breach`);
  if (def.shell) bits.push('1 shell/shot');
  bits.push(`${def.charge}s charge`, `${def.power} hand${def.power > 1 ? 's' : ''}`);
  return bits;
};

// Room coords are in tiles. Adjacency (shared edges) is computed at load.
// The view is a side cutaway, so rows mean decks: TOP row = the weather deck
// (sails, fog-charms, the helm on the quarterdeck); BOTTOM row = below the
// waterline (gun deck, the surgeon's orlop, and the bilge pumps — lowest,
// as bilges are). Each room berths up to four crew, FTL-style.
W.LAYOUTS = {
  sloop: { w: 8, h: 4, rooms: [
    { sys: null,      x: 0, y: 0, w: 2, h: 2 },  // cargo hold
    { sys: 'ward',    x: 2, y: 0, w: 2, h: 2 },
    { sys: 'sails',   x: 4, y: 0, w: 2, h: 2 },
    { sys: 'helm',    x: 6, y: 1, w: 2, h: 2 },
    { sys: 'pumps',   x: 0, y: 2, w: 2, h: 2 },
    { sys: 'cannons', x: 2, y: 2, w: 2, h: 2 },
    { sys: 'surgeon', x: 4, y: 2, w: 2, h: 2 },
  ]},
  cutter: { w: 6, h: 4, rooms: [
    { sys: 'sails',   x: 0, y: 0, w: 2, h: 2 },
    { sys: null,      x: 2, y: 0, w: 2, h: 2 },  // hold
    { sys: 'helm',    x: 4, y: 0, w: 2, h: 2 },
    { sys: 'pumps',   x: 0, y: 2, w: 2, h: 2 },
    { sys: 'cannons', x: 2, y: 2, w: 2, h: 2 },
  ]},
  brig: { w: 6, h: 4, rooms: [
    { sys: 'ward',    x: 0, y: 0, w: 2, h: 2 },
    { sys: 'sails',   x: 2, y: 0, w: 2, h: 2 },
    { sys: 'helm',    x: 4, y: 1, w: 2, h: 2 },
    { sys: 'pumps',   x: 0, y: 2, w: 2, h: 2 },
    { sys: 'cannons', x: 2, y: 2, w: 2, h: 2 },
  ]},
  frigate: { w: 6, h: 4, rooms: [
    { sys: 'ward',    x: 0, y: 0, w: 2, h: 2 },
    { sys: 'sails',   x: 2, y: 0, w: 2, h: 2 },
    { sys: 'helm',    x: 4, y: 0, w: 2, h: 2 },
    { sys: 'pumps',   x: 0, y: 2, w: 2, h: 2 },
    { sys: 'cannons', x: 2, y: 2, w: 2, h: 2 },
    { sys: 'surgeon', x: 4, y: 2, w: 2, h: 2 },
  ]},
  leviathan: { w: 8, h: 4, rooms: [
    { sys: 'ward',    x: 0, y: 0, w: 2, h: 2 },
    { sys: 'sails',   x: 2, y: 0, w: 2, h: 2 },
    { sys: null,      x: 4, y: 0, w: 2, h: 2 },  // barracks
    { sys: 'helm',    x: 6, y: 0, w: 2, h: 2 },
    { sys: 'pumps',   x: 0, y: 2, w: 2, h: 2 },
    { sys: 'cannons', x: 2, y: 2, w: 2, h: 2 },
    { sys: 'surgeon', x: 4, y: 2, w: 2, h: 2 },
    { sys: null,      x: 6, y: 2, w: 2, h: 2 },  // magazine hold
  ]},
};

W.ENEMIES = {
  cutter: {
    name: 'Corsair Cutter', layout: 'cutter', hull: 8, tier: 1,
    sys: { sails: 2, cannons: 2, helm: 1, pumps: 1 },
    weapons: ['longnine'], crew: 2, races: ['human', 'stormtouched'], gold: [12, 20],
  },
  patrol: {
    name: 'Armada Patrol Brig', layout: 'brig', hull: 10, tier: 1,
    sys: { ward: 2, sails: 2, cannons: 2, helm: 1, pumps: 1 },
    weapons: ['longnine', 'longnine'], crew: 3, races: ['human'], gold: [15, 26],
  },
  pirate_brig: {
    name: 'Blackflag Brig', layout: 'brig', hull: 14, tier: 2,
    sys: { ward: 2, sails: 3, cannons: 3, helm: 2, pumps: 1 },
    weapons: ['carronade', 'chainshot'], crew: 3, races: ['human', 'stormtouched'], gold: [24, 38],
  },
  raider: {
    name: 'Raider Ketch', layout: 'brig', hull: 12, tier: 2, grapple: true,
    sys: { ward: 2, sails: 3, cannons: 4, helm: 1, pumps: 1 },
    weapons: ['swivels', 'firepot'], crew: 4, races: ['stormtouched', 'human'],
    boarders: ['stormtouched', 'human'], gold: [24, 40],
  },
  frigate: {
    name: 'Armada Frigate', layout: 'frigate', hull: 18, tier: 3,
    sys: { ward: 4, sails: 3, cannons: 5, helm: 2, pumps: 2, surgeon: 1 },
    weapons: ['carronade', 'longnine', 'harpoon'], crew: 4, races: ['human'], gold: [38, 60],
  },
  corsair_frig: {
    name: 'Corsair Warship', layout: 'frigate', hull: 16, tier: 3, grapple: true,
    sys: { ward: 2, sails: 4, cannons: 5, helm: 2, pumps: 2, surgeon: 1 },
    weapons: ['hexshot', 'carronade', 'firepot'], crew: 4, races: ['human', 'stormtouched'],
    boarders: ['stormtouched'], gold: [36, 58],
  },
  // The flagship is a fortress, not a racer: huge wards and guns, poor evasion.
  leviathan: {
    name: 'HMS Crown Leviathan', layout: 'leviathan', hull: 28, tier: 4, boss: true, grapple: true,
    sys: { ward: 6, sails: 2, cannons: 6, helm: 2, pumps: 2, surgeon: 2 },
    weapons: ['rake', 'harpoon', 'firepot'], crew: 5, races: ['human', 'brass'],
    boarders: ['brass', 'stormtouched'], gold: [0, 0],
  },
};

W.TIERS = {
  1: ['cutter', 'cutter', 'patrol'],
  2: ['pirate_brig', 'raider', 'patrol'],
  3: ['frigate', 'corsair_frig', 'raider'],
};
W.pickEnemy = (tier) => W.pick(W.TIERS[W.clamp(tier, 1, 3)]);

// One shared pool of grounded period names — Cornish, English, and the odd
// Puritan virtue-name, as any real muster book mixed them.
W.NAME_POOL = ['Ned', 'Silas', 'Nan', 'Bess', 'Jonas', 'Kezia', 'Ezra', 'Dora', 'Amos',
  'Winnie', 'Colm', 'Ines', 'Tobias', 'Marta', 'Duff', 'Pryce', 'Tully',
  'Old Garrick', 'Mags', 'Josiah', 'Petra', 'Anse', 'Tom Cole', 'Hattie',
  'Nerys', 'Jory', 'Eseld', 'Branok', 'Lowri', 'Tegen', 'Kerensa',
  'Morwen', 'Locryn', 'Senara', 'Ruan', 'Demelza',
  'Temperance', 'Constant', 'Verity', 'Prudence', 'Mercy', 'Patience',
  'Marek', 'Tessa', 'Ivo', 'Casimir', 'Maren', 'Aldous', 'Sibyl'];
W.nameFor = () => {
  for (let i = 0; i < 6; i++) {
    const name = W.pick(W.NAME_POOL);
    if (!W.player || !W.player.crew.some(c => c.name === name)) return name;
  }
  return W.pick(W.NAME_POOL);
};

W.SECTOR_NAMES = ['The Shallow Marches', 'The Broken Teeth', 'The Deadlight Deep'];
