'use strict';

// LINE OF BATTLE (prototype) — the fleet layer.
// An admiral's agency lives in the plan: every ship gets her own TARGET and
// TACTIC, the plan is drawn as routes on the chart, and once the guns speak
// your only voice is two signal hoists — everything else is your captains.

W.Fleet = {
  active: false,
  ROUND_S: 3.0,   // seconds per round — slow enough to read
  phase: null,          // 'muster' | 'battle' | 'crisis' | 'done'
  ships: [], enemy: [],
  planName: null, gauge: false,
  round: 0, roundT: 0, log: [],
  signals: 2, pendingSignal: null, closerRounds: 0,
  crisisUsed: false, pendingCrisis: false, crisisTimer: 0,
  result: null, summary: null,

  CLASSES: {
    cutter:     { name: 'Cutter',        hull: 16, guns: 5,  art: 'cutter' },
    sloop:      { name: 'Sloop',         hull: 22, guns: 7,  art: 'sloop' },
    brig:       { name: 'Brig',          hull: 28, guns: 9,  art: 'brig' },
    frigate:    { name: 'Frigate',       hull: 36, guns: 13, art: 'frigate' },
    shipofline: { name: 'Ship of the Line', hull: 48, guns: 18, art: 'leviathan' },
  },

  // the cruise: five actions, refit between each, prizes and losses persist
  STAGES: [
    ['cutter', 'cutter', 'brig'],
    ['cutter', 'brig', 'brig'],
    ['cutter', 'brig', 'frigate'],
    ['cutter', 'frigate', 'frigate'],
    ['frigate', 'frigate', 'shipofline'],
  ],
  ENEMY_NAMES: ['Alarm', 'Vulture', 'Basilisk', 'Harpy', 'Cerberus', 'Gorgon',
    'Spite', 'Tisiphone', 'Redoubt', 'Growler'],
  campaign: null,

  TRAITS: {
    gunnery:   { name: 'Gunnery Master', desc: '+20% broadside weight.' },
    boarder:   { name: 'Boarder',        desc: 'Twice as likely to carry a ship by boarding.' },
    ironsides: { name: 'Old Ironsides',  desc: 'His crew\'s morale never breaks below 20 while he stands.' },
    weatherly: { name: 'Weatherly',      desc: 'Better odds of holding the weather gauge at the start.' },
  },

  // hulls have characters of their own, visible to both sides
  SHIP_TRAITS: {
    weatherly: { name: 'Weatherly',  desc: 'A sweet sailer — better odds of the weather gauge.' },
    oak:       { name: 'Stout Oak',  desc: 'Thick-sided: shrugs off a share of every hit.' },
    chasers:   { name: 'Bow-chasers', desc: 'Keeps firing well on the way in — cutting the line costs her less.' },
    flyer:     { name: 'A Flyer',    desc: 'Fast: reaches her station a round sooner (rakes on round 2).' },
    dry:       { name: 'Dry Powder', desc: 'A well-kept magazine: +10% throw-weight.' },
    crank:     { name: 'Crank & Wet', desc: 'A poor, leaky sailer: −10% throw-weight and no help to the gauge.' },
  },

  // per-ship orders — the real vocabulary of the plan
  TACTICS: {
    engage: { name: 'Engage her',    desc: 'Lie alongside the target and trade broadsides. The honest duel.' },
    cut:    { name: 'Cut the line',  desc: 'Cross her stern for a devastating rake (3rd round) — but eat fire on the way in.' },
    range:  { name: 'Hold the range', desc: 'Stand off and harry her rigging. Little harm done to you — or quickly to her.' },
    board:  { name: 'Board her',     desc: 'Close fast and carry her by the sword, from the 2nd round.' },
    screen: { name: 'Screen the flag', desc: 'Stay by the flagship and take fire meant for her. Little of your own gunnery.' },
  },

  // the classic doctrines survive as quick-set templates over per-ship orders
  PRESETS: {
    breakline: {
      name: 'Break the Line',
      set: [{ tactic: 'cut', target: 1 }, { tactic: 'cut', target: 2 }, { tactic: 'engage', target: 0 }],
    },
    gauge: {
      name: 'Rake and Refuse',
      set: [{ tactic: 'range', target: 0 }, { tactic: 'range', target: 1 }, { tactic: 'range', target: 2 }],
    },
    close: {
      name: 'Close Action',
      set: [{ tactic: 'board', target: 0 }, { tactic: 'board', target: 1 }, { tactic: 'engage', target: 2 }],
    },
  },

  COMPLEMENTS: { cutter: 60, sloop: 80, brig: 110, frigate: 150, shipofline: 200 },
  PRIZE_VALUE: { cutter: 40, sloop: 60, brig: 80, frigate: 120, shipofline: 200 },

  makeShip(cls, name, captName, trait, side, shipTrait) {
    const c = this.CLASSES[cls];
    const comp = this.COMPLEMENTS[cls] || 100;
    return {
      cls, name, side,
      trait: shipTrait || W.pick(Object.keys(this.SHIP_TRAITS)),
      hull: c.hull, hullMax: c.hull, guns: c.guns, gunsMax: c.guns,
      complement: comp, hands: comp,
      morale: side === 'player' ? 70
        : ({ cutter: 56, sloop: 60, brig: 63, frigate: 68, shipofline: 72 }[cls] || 64),
      struck: false, sunk: false, rakeDone: false,
      order: { tactic: 'engage', target: 0 },
      captain: { name: captName, trait, alive: true },
    };
  },

  newSkirmish() { this.startCampaign(); },

  startCampaign() {
    this.campaign = {
      stage: 1, gold: 40, hands: 30,
      // your first lieutenant waits ashore, ready to command the first prize
      captains: [{ name: W.nameFor(), trait: W.pick(Object.keys(this.TRAITS)), alive: true }],
      lieutenantOffer: false,
    };
    this.ships = [
      this.makeShip('sloop', 'The Petrel (flag)', 'You', 'gunnery', 'player', 'weatherly'),
      this.makeShip('brig', 'Salt Haven', W.nameFor(), 'ironsides', 'player', 'oak'),
      this.makeShip('cutter', 'Wren', W.nameFor(), 'boarder', 'player', 'flyer'),
    ];
    this.setupAction();
  },

  setupAction() {
    const c = this.campaign;
    const traits = Object.keys(this.TRAITS);
    let line = this.STAGES[Math.min(c.stage, this.STAGES.length) - 1].slice();
    this.mod = this.pendingMod || 'patrol';
    this.pendingMod = null;
    if (this.mod === 'escort' && line.length > 2) line = line.slice(0, -1);
    let n = 0;
    const finale = c.stage >= this.STAGES.length;
    this.enemy = line.map(cls =>
      this.makeShip(cls, this.ENEMY_NAMES[(c.stage * 3 + n++) % this.ENEMY_NAMES.length],
        W.nameFor(), W.pick(traits), 'enemy'));
    if (finale) {
      const flag = this.enemy.find(e => e.cls === 'shipofline') || this.enemy[this.enemy.length - 1];
      flag.name = 'Sovereign Oak';
      flag.trait = 'oak';
      flag.captain = { name: 'Admiral Crayne', trait: 'ironsides', alive: true };
      flag.isEnemyFlag = true;
    }
    this.spineBroke = false;
    if (this.mod === 'hunt') this.enemy.forEach(e => { e.morale = Math.min(78, e.morale + 5); });
    this.enemy.forEach((e, i) => {
      let tactic = 'engage';
      if (e.cls === 'cutter') tactic = W.chance(0.5) ? 'board' : 'engage';
      else if (e.cls === 'brig') tactic = W.pick(['engage', 'engage', 'cut']);
      else if (e.cls === 'frigate' || e.cls === 'shipofline') tactic = W.pick(['engage', 'cut']);
      if (e.captain.trait === 'boarder') tactic = 'board';
      e.order = { tactic, target: Math.min(i, this.ships.length - 1) };
      e.intel = W.chance(0.75); // your lookouts read her rig and her history — usually
    });
    this.ships.forEach((s, i) => {
      s.order = { tactic: 'engage', target: Math.min(i, this.enemy.length - 1) };
      s.struck = false; s.sunk = false; s.rakeDone = false; s.deeds = {};
      // spirit rises with a full, rested complement — and sags with a thin one
      s.morale = Math.round(50 + 22 * (s.hands / s.complement));
    });
    this.planName = null;
    this.round = 0; this.roundT = 0;
    this.log = [];
    this.signals = 2; this.pendingSignal = null; this.closerRounds = 0;
    this.crisisUsed = false; this.pendingCrisis = false; this.crisisModalShown = false;
    this.flagShifted = false;
    this.result = null; this.summary = null;
    this.active = true;
    this.phase = 'muster';
    W.state.mode = 'fleet';
    W.paused = false;
  },

  swapLine(i, j) {
    if (this.ships[i] && this.ships[j]) {
      [this.ships[i], this.ships[j]] = [this.ships[j], this.ships[i]];
    }
  },

  applyPreset(id) {
    const p = this.PRESETS[id];
    if (!p) return;
    this.ships.forEach((s, i) => {
      const o = p.set[Math.min(i, p.set.length - 1)];
      s.order = { tactic: o.tactic, target: o.target };
    });
    this.planName = p.name;
  },

  begin() {
    const capW = this.ships.filter(s => s.captain.alive && this.capHas(s.captain, 'weatherly')).length;
    const mineW = this.ships.filter(s => s.trait === 'weatherly').length;
    const mineC = this.ships.filter(s => s.trait === 'crank').length;
    const theirW = this.enemy.filter(s => s.trait === 'weatherly').length;
    this.gauge = W.chance(W.clamp(0.5 + 0.15 * capW + 0.1 * mineW - 0.08 * theirW - 0.06 * mineC, 0.2, 0.85));
    if (!this.planName) this.planName = 'Your Own Plan';
    this.say(`The line forms — ${this.planName}. ` +
      (this.gauge ? 'You hold the weather gauge.' : 'The enemy holds the weather gauge.'));
    this.phase = 'battle';
  },

  say(text) {
    this.log.push(text);
    if (this.log.length > 60) this.log.shift();
  },

  alive(list) { return list.filter(s => !s.struck && !s.sunk); },

  // signal hoists: your only voice once battle is joined
  hoist(kind) {
    if (this.signals <= 0 || this.pendingSignal || this.phase !== 'battle') return false;
    this.signals--;
    this.pendingSignal = kind;
    this.say(kind === 'closer'
      ? 'The flags climb the halyard: ENGAGE THE ENEMY MORE CLOSELY.'
      : 'The flags climb the halyard: DISCONTINUE THE ACTION.');
    return true;
  },

  tick(dt) {
    if (this.phase !== 'battle' || this.result || this.pendingCrisis) return;
    this.roundT += dt;
    if (this.roundT >= this.ROUND_S) {
      this.roundT = 0;
      this.resolveRound();
    }
  },

  // steady-state broadside estimate — the number the muster reasons with
  throwWeight(ship, tactic) {
    let w = ship.guns * 0.42;
    if (ship.side === 'player') {
      w *= 1.16 * (0.55 + 0.45 * W.clamp(ship.hands / ship.complement, 0, 1));
    }
    if (ship.captain && this.capHas(ship.captain, 'gunnery')) w *= 1.2;
    if (ship.captain && ship.captain.distinguished) w *= 1.08;
    if (ship.trait === 'dry') w *= 1.1;
    if (ship.trait === 'crank') w *= 0.9;
    const out = { engage: 1, cut: 1.05, range: 0.6, board: 1.1, screen: 0.7 };
    if (tactic) w *= out[tactic] || 1;
    return w;
  },

  intentWord(tactic) {
    return {
      engage: 'means to lie alongside and trade broadsides',
      cut: 'means to cut YOUR line — expect a rake by the third round',
      range: 'will keep her distance and harry',
      board: 'means to close and board',
    }[tactic] || 'holds her course';
  },

  matchup(myShip) {
    const foe = this.enemy[myShip.order.target];
    if (!foe) return null;
    const mine = this.throwWeight(myShip, myShip.order.tactic);
    const hers = this.throwWeight(foe, foe.intel && foe.order ? foe.order.tactic : 'engage');
    const r = mine / Math.max(0.01, hers);
    let verdict;
    if (r >= 1.35) verdict = 'you have her badly outgunned';
    else if (r >= 1.0) verdict = 'a fair match of weight';
    else if (r >= 0.72) verdict = 'she outguns you';
    else verdict = 'she outguns you badly — do not trade broadsides';
    const hints = {
      engage: '',
      cut: 'Two rounds of fire on the way in, then the rake. Best against the heavy and slow.',
      range: 'Safe early — but she will have closed the distance by the fifth round.',
      board: foe.morale <= 60 ? 'Her crew is green; a boarding may carry her early.'
        : 'Her crew is steady; boarding will be bloody work.',
      screen: 'She gives up her own gunnery to take fire meant for the flag.',
    };
    return { mine, hers, verdict, hint: hints[myShip.order.tactic] || '' };
  },

  capHas(capt, trait) {
    return !!capt && (capt.trait === trait || capt.learned === trait);
  },

  captTraitsText(capt) {
    const parts = [this.TRAITS[capt.trait] ? this.TRAITS[capt.trait].name : ''];
    if (capt.learned && this.TRAITS[capt.learned]) parts.push(this.TRAITS[capt.learned].name);
    return parts.filter(Boolean).join(' + ');
  },

  // a live target for a ship whose ordered opponent is already out of it
  targetOf(s) {
    let t = this.enemy[s.order.target];
    if (!t || t.struck || t.sunk) {
      t = this.alive(this.enemy)[0] || null; // standing order: nearest that still flies colors
    }
    return t;
  },

  resolveRound() {
    this.round++;
    const mine = this.alive(this.ships);
    const theirs = this.alive(this.enemy);
    if (!mine.length || !theirs.length) return this.finishBattle();

    // signals take effect as the new round begins
    if (this.pendingSignal === 'breakoff') {
      this.pendingSignal = null;
      this.say('The squadron hauls off in good order.');
      return this.finishBattle('withdraw');
    }
    if (this.pendingSignal === 'closer') {
      this.pendingSignal = null;
      this.closerRounds = 3;
      this.ships.forEach(s => { s.morale = Math.min(80, s.morale + 5); });
      this.say('The line cheers and crowds sail.');
    }
    if (this.closerRounds > 0) this.closerRounds--;

    this.say(`— Round ${this.round} —`);
    if (W.Sound) W.Sound.play('cannon');

    // plan the round's fire, so doubling can be seen and rewarded
    const flag = this.ships[0];
    const attacks = [];
    for (const a of mine) {
      const b = this.targetOf(a);
      if (b) attacks.push([a, b]);
    }
    for (const b of this.alive(this.enemy)) {
      let mark = this.ships[b.order ? b.order.target : 0];
      if (!mark || mark.struck || mark.sunk) {
        mark = mine.find(s => this.targetOf(s) === b) || this.alive(this.ships)[0];
      }
      if (!mark) break;
      if (mark === flag) {
        const screen = mine.find(s => s.order.tactic === 'screen' && s !== flag);
        if (screen && W.chance(0.45)) {
          mark = screen;
          this.say(`${screen.name} puts herself between the enemy and the flag.`);
        }
      }
      attacks.push([b, mark]);
    }
    const count = new Map();
    for (const [a, b] of attacks) count.set(b, (count.get(b) || 0) + 1);
    this._doubled = new Set();
    for (const [a, b] of attacks) {
      if (count.get(b) >= 2) this._doubled.add(a);
    }
    const seenDouble = new Set();
    for (const [, b] of attacks) {
      if (count.get(b) >= 2 && !seenDouble.has(b) && b.side === 'enemy') {
        seenDouble.add(b);
        this.say(`${b.name} is doubled — fire pours in from both sides.`);
      }
    }
    for (const [a, b] of attacks) {
      if (!a.struck && !a.sunk && !b.struck && !b.sunk) this.fireOn(a, b);
    }

    // boarding attempts, from either line
    for (const [a, b] of attacks) {
      const tac = a.order ? a.order.tactic : 'engage';
      if (tac !== 'board' || this.round < 2 || a.struck || a.sunk || b.struck || b.sunk) continue;
      const aIsMine = a.side === 'player';
      let odds = (b.morale < 55 ? 0.22 : 0.07) * (aIsMine && this.closerRounds > 0 ? 1.5 : 1);
      if (b.cls === 'shipofline') odds *= 0.3; // her sides are a cliff
      if (!aIsMine) odds *= 0.6; // your people are drilled to repel them
      if (a.captain.alive && this.capHas(a.captain, 'boarder')) odds *= 2;
      if (W.chance(odds)) {
        b.struck = true;
        this.say(`${a.name} grapples and boards ${b.name} — her colors come down!`);
        this.floatAt(b, 'BOARDED', '#a02418');
        this.fxAt(b, 'boom');
      }
    }

    this.checkStrikes(this.ships);
    this.checkStrikes(this.enemy);

    // when the last escort strikes, the great ship's people know it's over
    const eFlag = this.enemy.find(e => e.isEnemyFlag);
    if (eFlag && !eFlag.struck && !eFlag.sunk && !this.spineBroke &&
        this.enemy.every(e => e === eFlag || e.struck || e.sunk)) {
      this.spineBroke = true;
      eFlag.morale -= 32;
      eFlag.captain.trait = 'gunnery'; // even Crayne's iron bends when the line is gone
      eFlag.spineBroken = true;
      this.say('The Sovereign Oak stands alone — and every soul aboard her knows it. Her fire slackens.');
      this.floatAt(eFlag, 'SHAKEN', '#5a4020');
    }

    // crises come from damage — or from plain sea-luck, which owes every
    // cruise at least one visit sooner or later
    const crisisAt = flag.trait === 'oak' ? 0.5 : 0.65;
    const hurt = flag.hull < flag.hullMax * crisisAt;
    const c = this.campaign || {};
    let fortune = 0;
    if (this.round === 3) {
      fortune = 0.12 + (c.stage >= 3 && !(c.crisesFaced > 0) ? 0.3 : 0);
      if (c.stage >= this.STAGES.length) fortune = Math.max(fortune, 0.5); // the finale tests everyone
    }
    if (!this.crisisUsed && !flag.struck && !flag.sunk && (hurt || W.chance(fortune))) {
      this.crisisUsed = true;
      this.pendingCrisis = true;
      this.crisisKind = hurt ? this.pickCrisisKind(flag)
        : W.pick(['fire', 'fire', 'mast', 'magazine']); // own wadding, parted stays
      return;
    }

    // the action ends only when a whole line is out of it — if the flag falls
    // and others still fly colors, the fight (and the cruise) goes on
    if (!this.alive(this.ships).length || !this.alive(this.enemy).length) {
      this.finishBattle();
    } else if ((flag.struck || flag.sunk) && !this.flagShifted) {
      this.flagShifted = true;
      const heir = this.alive(this.ships)[0];
      this.say(`The flag comes down with the ${flag.name} — and rises again aboard ${heir.name}.`);
    }
  },

  rakeRoundOf(ship) { return ship.trait === 'flyer' ? 2 : 3; },

  fireOn(a, b) {
    const aIsMine = a.side === 'player';
    const tac = a.order ? a.order.tactic : 'engage';
    const victimTac = b.order ? b.order.tactic : 'engage';

    let dmg = a.guns * W.rand(0.75, 1.25) * 0.42;
    if (aIsMine) {
      dmg *= 1.16; // drill tells
      dmg *= 0.55 + 0.45 * W.clamp(a.hands / a.complement, 0, 1); // short-handed guns fire slow
    }
    if (a.captain.alive && this.capHas(a.captain, 'gunnery')) dmg *= 1.2;
    if (a.captain.distinguished) dmg *= 1.08;
    if (a.trait === 'dry') dmg *= 1.1;
    if (a.trait === 'crank') dmg *= 0.9;
    if (a.spineBroken) dmg *= 0.75; // a great ship fighting alone, half-hearted
    if (aIsMine && this.closerRounds > 0) dmg *= 1.18;
    if (this.gauge) dmg *= aIsMine ? 1.1 : 0.92;
    if (this._doubled && this._doubled.has(a)) dmg *= 1.2;

    let rake = false;
    const myRakeRound = this.rakeRoundOf(a);
    if (tac === 'cut') {
      if (this.round < myRakeRound) dmg *= (a.trait === 'chasers' ? 0.7 : 0.35);
      else if (!a.rakeDone) { a.rakeDone = true; rake = true; dmg *= 2.2; }
      else dmg *= 1.05;
    }
    if (tac === 'range') dmg *= 0.6;
    if (tac === 'board') dmg *= 1.1;
    if (tac === 'screen') dmg *= 0.7;
    // how hard the victim is to hurt depends on HER orders — but a refusing
    // line cannot refuse forever: the enemy comes down on her, round by round
    if (victimTac === 'range') dmg *= Math.min(1, 0.4 + Math.max(0, this.round - 4) * 0.15);
    if (victimTac === 'cut' && this.round < this.rakeRoundOf(b)) {
      let pen = this.gauge === (b.side === 'player') ? 1.25 : 1.45;
      // a ship of the line wears too slowly to punish a cutting approach
      if (a.cls === 'shipofline') pen = 1 + (pen - 1) * 0.35;
      dmg *= pen;
    }
    if (victimTac === 'board') dmg *= 1.15;
    if (b.trait === 'oak') dmg *= 0.85;

    dmg = Math.max(0.4, dmg);
    b.hull -= dmg;
    if (b === this.ships[0] && b.side === 'player') {
      this.flagLastHit = { cls: a.cls, tactic: tac };
    }
    let moraleHit = dmg * 1.2;
    if (rake) {
      moraleHit += 22;
      if (aIsMine && a.deeds) a.deeds.raked = true;
      this.say(`${a.name} cuts the line and rakes ${b.name} stem to stern!`);
      this.floatAt(b, 'RAKED!', '#a02418');
    }
    if (tac === 'range') moraleHit += 4; // harried without reply
    b.morale -= moraleHit;
    const floor = (b.captain.alive && this.capHas(b.captain, 'ironsides')) ? 20 : 0;
    b.morale = Math.max(floor, b.morale);
    if (b.hull < b.hullMax * 0.5 && b.captain.alive && W.chance(0.04)) {
      b.captain.alive = false;
      b.morale -= 18;
      this.say(`${b.name}'s captain is down!`);
    }
    if (dmg >= 2.6 && b.guns > 2 && W.chance(0.22)) {
      b.guns--;
      this.say(`A gun is dismounted aboard ${b.name}.`);
    }
    this.fxAt(b, 'hit');
    if (b.hull <= 0) {
      if (W.chance(0.3)) {
        b.sunk = true;
        this.say(`${b.name} goes down by the head!`);
        this.fxAt(b, 'boom');
      } else {
        b.struck = true;
        if (W.Sound) W.Sound.play('bell');
        this.say(`${b.name} strikes her colors!`);
        this.floatAt(b, 'STRUCK', '#5a4020');
      }
    }
  },

  checkStrikes(list) {
    for (const s of list) {
      if (s.struck || s.sunk) continue;
      if (s.morale <= 25 && W.chance(0.4)) {
        s.struck = true;
        this.say(`${s.name}'s crew has had enough — she strikes!`);
        this.floatAt(s, 'STRUCK', '#5a4020');
      }
    }
  },

  floatAt(ship, text, color) {
    if (!W.Render || !W.Render.fleetPos) return;
    const p = W.Render.fleetPos(ship);
    if (p) W.addFx(p.x, p.y - 22, text, color);
  },

  fxAt(ship, kind) {
    if (!W.Render || !W.Render.fleetPos) return;
    const p = W.Render.fleetPos(ship);
    if (!p) return;
    if (kind === 'boom') W.boom(p.x, p.y, 40);
    else {
      W.boom(p.x + W.rand(-24, 24), p.y + W.rand(-8, 8), 24);
      W.burst(p.x, p.y, '#7d7f84', 5, 40, 0.8, 3);
    }
  },

  // --- the crisis: the flagship's trouble, handled by your own hands ---
  // The kind is not random: it grows out of what has been hitting her, what
  // she is made of, and who is aboard.
  pickCrisisKind(flag) {
    const hit = this.flagLastHit || {};
    const w = { fire: 3, flood: 2, boarders: 1, mast: 2, magazine: 1 };
    if (hit.cls === 'frigate' || hit.cls === 'shipofline') { w.fire += 2; w.mast += 2; }
    if (hit.tactic === 'cut') w.flood += 2;   // raked hulls take it below the line
    if (hit.tactic === 'board') w.boarders += 5;
    if (this.enemy.some(e => !e.struck && !e.sunk && e.order && e.order.tactic === 'board')) {
      w.boarders += 2;
    }
    if (flag.trait === 'dry') w.fire = Math.max(1, w.fire - 1);   // a well-kept magazine
    if (flag.trait === 'crank') w.flood += 2;                     // she was leaky before the war
    if (!this.gauge) w.mast += 1;                                 // fighting from leeward, rig exposed
    let total = 0;
    for (const k in w) total += w[k];
    let roll = Math.random() * total;
    for (const k in w) { roll -= w[k]; if (roll <= 0) return k; }
    return 'fire';
  },

  // the interior you fight the crisis in IS your flagship's class
  makeCrisisShip(cls) {
    const layoutId = { cutter: 'cutter', sloop: 'sloop', brig: 'brig',
      frigate: 'frigate', shipofline: 'leviathan' }[cls] || 'sloop';
    const levels = { helm: 1, sails: 2, ward: 2, cannons: 2, pumps: 2, surgeon: 1 };
    const present = new Set(W.LAYOUTS[layoutId].rooms.map(r => r.sys).filter(Boolean));
    const sys = {};
    for (const id of present) sys[id] = levels[id] || 1;
    return new W.Ship({
      name: 'The damage party', layout: layoutId, faction: 'player',
      hull: 30, reactor: 8, sys, crew: [],
    });
  },

  CRISIS_DEFS: {
    fire: {
      banner: 'FIRE ABOARD THE FLAGSHIP',
      sub: 'Send crew to the burning rooms and the leak. The line holds its breath.',
      intro: 'A shell has burst on the gun deck and the smoke coming up the hatches is the wrong '
        + 'color. Take command of the damage party before the fire finds the magazine.',
      saved: 'The fire is beaten out — the line cheers the flag.',
      failed: 'The fire reaches the orlop before it dies. The flagship is badly hurt.',
    },
    flood: {
      banner: 'THE FLAGSHIP IS TAKING WATER',
      sub: 'Plug the shot-holes and let the pumps gain. Divers and carpenters earn their pay now.',
      intro: 'Three shot have gone home below the waterline and the well is gaining fast. '
        + 'Take command of the damage party before she settles.',
      saved: 'The holes are plugged and the pumps gain. She swims — the line cheers the flag.',
      failed: 'She is saved, barely, waterlogged and wallowing. It costs hull and hands.',
    },
    boarders: {
      banner: 'BOARDERS ON THE FLAGSHIP',
      sub: 'They are over the rail. Marines to the fight; everyone else out of their way.',
      intro: 'Grappling hooks bite the rail and enemy boarders come over in a wave. '
        + 'Take command below — repel them hand to hand.',
      saved: 'The boarders are thrown back into the sea. The line cheers the flag.',
      failed: 'They are driven off at last, but they leave the flagship bloodied.',
    },
    mast: {
      banner: 'THE RIGGING IS SHOT THROUGH',
      sub: 'The sails station is wrecked and burning scraps are coming down. Repair it or lose her legs.',
      intro: 'A ball has gone through the mainmast\'s heart and the rigging is coming down in '
        + 'burning festoons. If the sails cannot be worked, the flagship is a floating target.',
      saved: 'Jury-rigged and drawing again — she answers her helm. The line cheers the flag.',
      failed: 'She fights the rest of the action half-crippled, slow and shaken.',
    },
    magazine: {
      banner: 'FIRE NEAR THE MAGAZINE',
      sub: 'Smoke in the hold, powder two rooms away. There is no second chance at this one.',
      intro: 'Burning wadding has fallen down a hatchway and the hold is alight — two rooms from '
        + 'the powder. Every second of this fire is borrowed.',
      saved: 'The hold is drowned and the powder never knew. The line breathes again.',
      failed: 'The fire brushes the magazine before it dies.',
    },
  },

  startCrisis() {
    this.pendingCrisis = false;
    this.crisisModalShown = false;
    if (this.campaign) this.campaign.crisesFaced = (this.campaign.crisesFaced || 0) + 1;
    const kind = this.crisisKind || 'fire';
    const flag = this.ships[0];
    W.player = this.makeCrisisShip(flag ? flag.cls : 'sloop');
    // the damage party reflects the flagship's muster: short-handed ships send
    // fewer; a full complement sends a specialist for the trouble at hand
    const ratio = flag ? flag.hands / flag.complement : 1;
    const party = [{ race: 'human' }, { race: 'human' }, { race: 'tideborn' }];
    if (ratio < 0.5) party.pop();
    if (ratio >= 0.85) {
      party.push({ race: { fire: 'brass', mast: 'brass', magazine: 'brass',
        flood: 'tideborn', boarders: 'stormtouched' }[kind] || 'human' });
    }
    party.forEach(spec => W.player.addCrewSpec(spec));
    if (kind === 'fire') {
      [W.pick(W.player.rooms), W.pick(W.player.rooms)].forEach(r => { r.fire = Math.max(r.fire, 55); });
      const leak = W.pick(W.player.rooms.filter(r => r.y >= 2));
      if (leak) { leak.breach = true; leak.breachWork = 0; }
      this.crisisTimer = 45;
    } else if (kind === 'flood') {
      const below = W.player.rooms.filter(r => r.y >= 2);
      for (let i = 0; i < 3; i++) {
        const r = below[i % below.length];
        r.breach = true; r.breachWork = 0; r.water = Math.max(r.water, 25);
      }
      this.crisisTimer = 50;
    } else if (kind === 'boarders') {
      for (let i = 0; i < 3; i++) {
        const room = W.pick(W.player.rooms);
        const race = W.pick(['stormtouched', 'human']);
        const b = new W.Crew(race, W.nameFor(), 'enemy');
        b.ship = W.player;
        b.roomIdx = room.idx;
        const ctr = W.player.center(room);
        b.px = ctr.x; b.py = ctr.y;
        W.player.intruders.push(b);
      }
      this.crisisTimer = 60;
    } else if (kind === 'mast') {
      const sails = W.player.systems.sails;
      if (sails) sails.damage = sails.level;
      const sailsRoom = W.player.roomOf('sails');
      if (sailsRoom) sailsRoom.fire = 35;
      const cannons = W.player.systems.cannons;
      if (cannons) cannons.damage = Math.min(cannons.level, 1);
      this.crisisTimer = 55;
    } else { // magazine
      const holds = W.player.rooms.filter(r => !r.sys);
      const seat = holds.length ? W.pick(holds) : W.pick(W.player.rooms);
      seat.fire = 70;
      const adj = seat.adj.length ? W.player.rooms[seat.adj[0]] : null;
      if (adj) adj.fire = Math.max(adj.fire, 35);
      this.crisisTimer = 30;
    }
    this.phase = 'crisis';
    W.state.mode = 'crisis';
    W.paused = false;
  },

  crisisTick(dt) {
    if (this.phase !== 'crisis') return;
    W.player.tick(dt);
    this.crisisTimer -= dt;
    const kind = this.crisisKind || 'fire';
    const burning = W.player.rooms.some(r => r.fire > 0);
    const leaking = W.player.rooms.some(r => r.breach);
    const awash = W.player.rooms.some(r => r.water > 30);
    const boarders = W.player.intruders.some(c => c.hp > 0);
    const sailsOk = !W.player.systems.sails || W.player.systems.sails.damage <= 0;
    const saved = kind === 'fire' ? (!burning && !leaking)
      : kind === 'flood' ? (!leaking && !awash)
      : kind === 'boarders' ? !boarders
      : kind === 'mast' ? (sailsOk && !burning)
      : !burning;
    if (saved) return this.endCrisis('saved');
    if (W.player.aliveCrew().length === 0) return this.endCrisis('lost');
    if (this.crisisTimer <= 0) return this.endCrisis('failed');
  },

  endCrisis(kind) {
    this.lastCrisisOutcome = kind;
    const flag = this.ships[0];
    const def = this.CRISIS_DEFS[this.crisisKind || 'fire'];
    if (kind === 'saved') {
      this.say(def.saved);
      this.ships.forEach(s => { s.morale = Math.min(80, s.morale + 8); });
    } else if (kind === 'failed') {
      this.say(def.failed);
      if (this.crisisKind === 'boarders') {
        flag.morale -= 18;
        flag.hands = Math.max(10, flag.hands - 10);
        flag.hull -= 2;
      } else if (this.crisisKind === 'flood') {
        flag.hull -= 5;
        flag.hands = Math.max(10, flag.hands - 6);
      } else if (this.crisisKind === 'mast') {
        flag.morale -= 12;
        flag.guns = Math.max(2, flag.guns - 1);
      } else if (this.crisisKind === 'magazine') {
        if (W.chance(0.35)) {
          flag.sunk = true;
          this.say('The magazine goes. There is a white flash, and then there is no flagship.');
        } else {
          flag.hull -= 8;
          flag.morale -= 15;
        }
      } else {
        flag.hull -= 6;
        flag.morale -= 15;
      }
      if (flag.hull <= 0) { flag.struck = true; this.say('The flagship strikes her colors!'); }
    } else {
      flag.sunk = true;
      this.say('The damage party is lost, and the flagship with it.');
    }
    if (this.crisisReturn === 'refit') {
      // a storm-bred crisis returns you to the anchorage, not to a battle
      this.crisisReturn = null;
      this.phase = 'muster';
      W.state.mode = 'fleet';
      if (flag.struck || flag.sunk) {
        this.ships = this.ships.filter(s => !s.struck && !s.sunk);
        if (!this.ships.length) {
          this.summary = { flagLost: true, stage: this.campaign.stage, rounds: 0, prizes: 0,
            lost: 1, remaining: 0, casualties: 0, win: false, finalStage: false, prizeShips: [], gold: 0 };
          this.result = 'defeat';
          this.phase = 'done';
          return;
        }
        this.say(`Your flag now flies aboard ${this.ships[0].name}.`);
      }
      this.pendingRefitReturn = true;
      this.saveCruise();
      return;
    }
    this.phase = 'battle';
    W.state.mode = 'fleet';
    if (flag.struck || flag.sunk) this.finishBattle();
  },

  finishBattle(kind) {
    if (this.result) return;
    const myAlive = this.alive(this.ships).length;
    const theirAlive = this.alive(this.enemy).length;
    const prizes = this.enemy.filter(s => s.struck).length;
    const win = kind !== 'withdraw' && theirAlive === 0 && myAlive > 0;
    this.result = win ? 'victory' : (kind === 'withdraw' ? 'withdraw' : 'defeat');
    // the butcher's bill: surviving ships lose hands with the damage they took
    let casualties = 0;
    for (const s of this.ships) {
      if (s.struck || s.sunk) continue;
      const lost = Math.max(0, Math.round(s.complement * (1 - s.hull / s.hullMax) * 0.15 * W.rand(0.6, 1.2)));
      const applied = Math.min(Math.max(0, s.hands - 10), lost);
      casualties += applied;
      s.hands -= applied;
    }
    this.summary = {
      win, withdraw: kind === 'withdraw',
      rounds: this.round, prizes,
      lost: this.ships.filter(s => s.struck || s.sunk).length,
      remaining: myAlive,
      casualties,
      flagLost: myAlive === 0,
      stage: this.campaign ? this.campaign.stage : 1,
      finalStage: this.campaign ? this.campaign.stage >= this.STAGES.length : true,
      prizeShips: win ? this.enemy.filter(s => s.struck).map(s => s.cls) : [],
      gold: win
        ? Math.round((30 + prizes * 20) * (this.mod === 'hunt' ? 1.5 : 1)) + (this.mod === 'escort' ? 30 : 0)
        : 0,
    };
    this.say(win ? `The enemy line is broken. ${prizes} prize${prizes === 1 ? '' : 's'} taken.`
      : (kind === 'withdraw' ? 'You bring the squadron off intact enough to fight again.'
        : 'The action is lost.'));
    this.phase = 'done';
  },

  // called once from the refit screen after every action the flagship survives
  ASSIGNMENTS: {
    patrol: { name: 'The patrol, as ordered', type: 'battle',
      desc: 'Meet the enemy line the Admiralty expects you to meet. No surprises either way.' },
    escort: { name: 'Convoy escort', type: 'battle',
      desc: 'The merchants pay ⚜30 for protection, and the enemy comes lighter by one ship — but there is less to take.' },
    hunt: { name: 'The commodore\'s hunt', type: 'battle',
      desc: 'Chase down a prize-rich line. Half again the prize money — against crews with their blood up.' },
    storm: { name: 'The storm passage', type: 'storm',
      desc: 'Run the weather instead of the enemy. No action at all — but the sea taxes hulls and hands, and storms breed emergencies of their own.' },
  },

  genOptions() {
    const c = this.campaign;
    const next = c.stage + 1;
    if (next >= this.STAGES.length) {
      return [Object.assign({ id: 'patrol' }, this.ASSIGNMENTS.patrol,
        { name: 'The last action', desc: 'The enemy flag is at sea with a ship of the line. There is only one order this could ever be.' })];
    }
    const pool = ['escort', 'hunt', 'storm'];
    const second = W.pick(pool);
    return [Object.assign({ id: 'patrol' }, this.ASSIGNMENTS.patrol),
      Object.assign({ id: second }, this.ASSIGNMENTS[second])];
  },

  chooseAction(idx) {
    const c = this.campaign;
    const o = (c.actionOptions || [])[idx];
    if (!o) return 'none';
    if (o.type === 'storm') {
      let toll = 0;
      for (const s of this.ships) {
        s.hull = Math.max(3, s.hull - Math.round(s.hullMax * W.rand(0.08, 0.16)));
        const lost = Math.min(Math.max(0, s.hands - 10), Math.round(s.complement * W.rand(0.02, 0.06)));
        s.hands -= lost; toll += lost;
      }
      c.stage++;
      c.lastPassage = `The passage is bad. Sprung seams all round, and the sea takes ${toll} hands.`;
      c.actionOptions = this.genOptions();
      if (W.chance(0.5)) {
        // the storm finds the weak plank
        this.crisisKind = W.pick(['flood', 'flood', 'mast']);
        this.crisisReturn = 'refit';
        this.pendingCrisis = true;
        this.crisisModalShown = false;
        return 'stormcrisis';
      }
      return 'refit';
    }
    this.pendingMod = o.id;
    c.stage++;
    this.setupAction();
    this.saveCruise();
    return 'battle';
  },

  settleAction() {
    const c = this.campaign;
    c.gold += this.summary.gold;
    for (const s of this.ships) {
      if (s.sunk && s.captain.alive && W.chance(0.4)) {
        c.captains.push(s.captain);
      }
    }
    // what an action teaches, a good officer keeps
    for (const s of this.ships) {
      if (s.struck || s.sunk || !s.captain.alive || s.captain.learned) continue;
      const d = s.deeds || {};
      const candidates = [];
      if (d.boarded) candidates.push('boarder');
      if (d.raked) candidates.push('gunnery');
      if (s.hull < s.hullMax * 0.35) candidates.push('ironsides');
      if (this.gauge && this.summary.win) candidates.push('weatherly');
      const pool = candidates.filter(tr => tr !== s.captain.trait);
      if (pool.length && W.chance(0.45)) {
        s.captain.learned = W.pick(pool);
        this.say(`Captain ${s.captain.name} comes out of it a better officer — ` +
          `${this.TRAITS[s.captain.learned].name}.`);
      }
    }

    // captains who took their ordered prize are mentioned in the Gazette
    for (const s of this.ships) {
      if (s.struck || s.sunk || !s.captain.alive || s.captain.distinguished) continue;
      const tgt = this.enemy[s.order.target];
      if (tgt && tgt.struck) {
        s.captain.distinguished = true;
        this.say(`Captain ${s.captain.name} will be mentioned in the Gazette.`);
      }
    }
    const oldFlag = this.ships[0];
    this.ships = this.ships.filter(s => !s.struck && !s.sunk);
    if (this.ships.length && this.ships[0] !== oldFlag) {
      this.say(`Your flag now flies aboard ${this.ships[0].name}.`);
    }
    c.lieutenantOffer = W.chance(0.45);
    c.actionOptions = this.genOptions();
    this.summary.settled = true;
    this.saveCruise();
  },

  takePrize(cls) {
    const c = this.campaign;
    if (this.ships.length >= 4 || !c.captains.length) return false;
    const capt = c.captains.shift();
    const ship = this.makeShip(cls, `Prize ${this.CLASSES[cls].name}`,
      capt.name, capt.trait, 'player');
    ship.captain = capt;
    ship.hull = Math.round(ship.hullMax * 0.45);
    ship.hands = 0; // she sails when you give her a prize crew
    this.ships.push(ship);
    return true;
  },

  sellPrize(cls) {
    this.campaign.gold += this.PRIZE_VALUE[cls] || 50;
  },

  hireLieutenant() {
    const c = this.campaign;
    if (!c.lieutenantOffer || c.gold < 60) return false;
    c.gold -= 60;
    c.lieutenantOffer = false;
    c.captains.push({ name: W.nameFor(), trait: W.pick(Object.keys(this.TRAITS)), alive: true });
    return true;
  },

  repairShip(s, pts) {
    const c = this.campaign;
    pts = Math.min(pts, s.hullMax - s.hull, Math.floor(c.gold / 2));
    if (pts <= 0) return false;
    c.gold -= pts * 2;
    s.hull += pts;
    return true;
  },

  // late gold converts to weight of metal: pierce her for another gun
  buyGun(s) {
    const c = this.campaign;
    const cap = (this.CLASSES[s.cls] ? this.CLASSES[s.cls].guns : s.gunsMax) + 2;
    if (s.gunsMax >= cap || c.gold < 45) return false;
    c.gold -= 45;
    s.gunsMax++;
    s.guns++;
    return true;
  },

  remountGun(s) {
    const c = this.campaign;
    if (s.guns >= s.gunsMax || c.gold < 8) return false;
    c.gold -= 8;
    s.guns++;
    return true;
  },

  hireHands(n) {
    const c = this.campaign;
    const cost = n * 3;
    if (c.gold < cost) return false;
    c.gold -= cost;
    c.hands += n;
    return true;
  },

  moveHands(s, n) {
    const c = this.campaign;
    if (n > 0) {
      n = Math.min(n, c.hands, s.complement - s.hands);
      if (n <= 0) return false;
      c.hands -= n; s.hands += n;
    } else {
      n = Math.min(-n, s.hands);
      if (n <= 0) return false;
      s.hands -= n; c.hands += n;
    }
    return true;
  },

  swapCaptain(shipIdx, captName) {
    const c = this.campaign;
    const ship = this.ships[shipIdx];
    if (!ship) return;
    const poolIdx = c.captains.findIndex(x => x.name === captName);
    if (poolIdx >= 0) {
      const incoming = c.captains.splice(poolIdx, 1)[0];
      if (ship.captain && ship.captain.alive) c.captains.push(ship.captain);
      ship.captain = incoming;
      return;
    }
    const other = this.ships.find(s => s !== ship && s.captain.name === captName);
    if (other) {
      const tmp = ship.captain;
      ship.captain = other.captain;
      other.captain = tmp;
    }
  },

  hoistFlag(i) {
    if (i > 0 && this.ships[i]) {
      [this.ships[0], this.ships[i]] = [this.ships[i], this.ships[0]];
    }
  },

  nextStage() {
    this.campaign.stage++;
    this.setupAction();
  },

  // --- the cruise survives a closed tab ---
  CRUISE_KEY: 'windward_cruise_v1',

  saveCruise() {
    try {
      const c = this.campaign;
      if (!c) return;
      localStorage.setItem(this.CRUISE_KEY, JSON.stringify({
        campaign: {
          stage: c.stage, gold: c.gold, hands: c.hands,
          captains: c.captains, lieutenantOffer: c.lieutenantOffer,
        },
        ships: this.ships.map(s => ({
          cls: s.cls, name: s.name, trait: s.trait, hull: Math.ceil(s.hull),
          guns: s.guns, gunsMax: s.gunsMax, hands: s.hands, captain: s.captain,
        })),
      }));
    } catch (e) { /* storage unavailable — sail on */ }
  },

  hasCruise() {
    try { return !!localStorage.getItem(this.CRUISE_KEY); } catch (e) { return false; }
  },

  clearCruise() {
    try { localStorage.removeItem(this.CRUISE_KEY); } catch (e) { /* ignore */ }
  },

  loadCruise() {
    let d;
    try { d = JSON.parse(localStorage.getItem(this.CRUISE_KEY)); } catch (e) { d = null; }
    if (!d || !d.ships || !d.ships.length) return false;
    this.campaign = Object.assign(
      { stage: 1, gold: 40, hands: 30, captains: [], lieutenantOffer: false }, d.campaign);
    this.ships = d.ships.map(sd => {
      const s = this.makeShip(sd.cls, sd.name, sd.captain.name, sd.captain.trait, 'player', sd.trait);
      s.hull = Math.min(s.hullMax, sd.hull);
      s.guns = sd.guns; s.gunsMax = sd.gunsMax; s.hands = sd.hands;
      s.captain = sd.captain;
      return s;
    });
    this.enemy = [];
    this.campaign.actionOptions = this.genOptions();
    this.summary = { settled: true, prizeShips: [], win: false, stage: this.campaign.stage };
    this.result = null;
    this.active = true;
    this.phase = 'muster';
    W.state.mode = 'fleet';
    W.paused = false;
    return true;
  },

  close() {
    this.active = false;
    this.phase = null;
    this.result = null;
  },
};
