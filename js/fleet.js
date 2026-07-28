'use strict';

// LINE OF BATTLE (prototype) — the fleet autobattler layer.
// All agency is in the muster: line order, captains, doctrine. Once the guns
// speak, signals are lost in the smoke and the plan must stand on its own —
// except when a crisis aboard the flagship drops you into the ship herself.

W.Fleet = {
  active: false,
  phase: null,          // 'muster' | 'battle' | 'crisis' | 'done'
  ships: [], enemy: [],
  doctrine: null, gauge: false,
  round: 0, roundT: 0, log: [],
  crisisUsed: false, pendingCrisis: false, crisisTimer: 0,
  result: null, summary: null,

  CLASSES: {
    cutter:  { name: 'Cutter',  hull: 16, guns: 5,  art: 'cutter' },
    sloop:   { name: 'Sloop',   hull: 22, guns: 7,  art: 'sloop' },
    brig:    { name: 'Brig',    hull: 28, guns: 9,  art: 'brig' },
    frigate: { name: 'Frigate', hull: 36, guns: 13, art: 'frigate' },
  },

  TRAITS: {
    gunnery:   { name: 'Gunnery Master', desc: '+20% broadside weight.' },
    boarder:   { name: 'Boarder',        desc: 'Twice as likely to force a surrender up close.' },
    ironsides: { name: 'Old Ironsides',  desc: 'His crew\'s morale never breaks below 20 while he stands.' },
    weatherly: { name: 'Weatherly',      desc: 'Better odds of holding the weather gauge at the start.' },
  },

  DOCTRINES: {
    breakline: {
      name: 'Break the Line',
      desc: 'Cut their line in two columns. You eat unanswered fire on the approach '
        + '(rounds 1–2), then rake them as you pass (round 3) and it becomes a brawl.',
    },
    gauge: {
      name: 'Rake and Refuse',
      desc: 'Hold the weather gauge and keep the range. Less damage both ways — but '
        + 'far less to you, and your chain-shot works on their rigging all day.',
    },
    close: {
      name: 'Close Action',
      desc: '"No captain can do very wrong if he places his ship alongside that of the '
        + 'enemy." Heavy fire both ways, and boarding from round 2.',
    },
  },

  makeShip(cls, name, captName, trait, side) {
    const c = this.CLASSES[cls];
    return {
      cls, name, side,
      hull: c.hull, hullMax: c.hull, guns: c.guns,
      // your crews are better drilled; corsair crews break sooner
      morale: side === 'player' ? 70 : 64,
      struck: false, sunk: false,
      captain: { name: captName, trait, alive: true },
    };
  },

  newSkirmish() {
    this.ships = [
      this.makeShip('sloop', 'The Petrel (flag)', 'You', 'gunnery', 'player'),
      this.makeShip('brig', 'Salt Haven', W.nameFor(), 'ironsides', 'player'),
      this.makeShip('cutter', 'Wren', W.nameFor(), 'boarder', 'player'),
    ];
    const traits = Object.keys(this.TRAITS);
    this.enemy = [
      this.makeShip('cutter', 'Alarm', W.nameFor(), W.pick(traits), 'enemy'),
      this.makeShip('brig', 'Vulture', W.nameFor(), W.pick(traits), 'enemy'),
      this.makeShip('frigate', 'Basilisk', W.nameFor(), W.pick(traits), 'enemy'),
    ];
    this.doctrine = null;
    this.round = 0; this.roundT = 0;
    this.log = [];
    this.crisisUsed = false; this.pendingCrisis = false;
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

  begin(doctrineId) {
    this.doctrine = doctrineId;
    const weatherly = this.ships.filter(s => s.captain.trait === 'weatherly' && s.captain.alive).length;
    this.gauge = W.chance(0.5 + 0.2 * weatherly);
    this.say(`The line forms. Doctrine: ${this.DOCTRINES[doctrineId].name}. ` +
      (this.gauge ? 'You hold the weather gauge.' : 'The enemy holds the weather gauge.'));
    this.phase = 'battle';
  },

  say(text) {
    this.log.push(text);
    if (this.log.length > 60) this.log.shift();
  },

  alive(list) { return list.filter(s => !s.struck && !s.sunk); },

  tick(dt) {
    if (this.phase !== 'battle' || this.result || this.pendingCrisis) return;
    this.roundT += dt;
    if (this.roundT >= 2.3) {
      this.roundT = 0;
      this.resolveRound();
    }
  },

  // one exchange of broadsides down the line
  resolveRound() {
    this.round++;
    const mine = this.alive(this.ships);
    const theirs = this.alive(this.enemy);
    if (!mine.length || !theirs.length) return this.finishBattle();
    this.say(`— Round ${this.round} —`);

    const d = this.doctrine;
    const approach = d === 'breakline' && this.round <= 2;
    const rakeRound = d === 'breakline' && this.round === 3;

    // pair off down the line; spare ships double up on the last opponent
    const pairs = [];
    const n = Math.max(mine.length, theirs.length);
    for (let i = 0; i < n; i++) {
      pairs.push([mine[Math.min(i, mine.length - 1)], theirs[Math.min(i, theirs.length - 1)]]);
    }

    for (const [a, b] of pairs) {
      this.fireOn(a, b, { approach, rakeRound });
      if (!b.struck && !b.sunk) this.fireOn(b, a, { counterApproach: approach });
    }

    // boarding under Close Action
    if (d === 'close' && this.round >= 2) {
      for (const [a, b] of pairs) {
        if (a.struck || a.sunk || b.struck || b.sunk) continue;
        let odds = b.morale < 55 ? 0.18 : 0.05;
        if (a.captain.trait === 'boarder' && a.captain.alive) odds *= 2;
        if (W.chance(odds)) {
          b.struck = true;
          this.say(`${a.name} grapples and boards ${b.name} — her colors come down!`);
          this.fxAt(b, 'boom');
        }
      }
    }

    this.checkStrikes(this.ships);
    this.checkStrikes(this.enemy);

    // crisis: the flagship in trouble drops you into the ship herself
    const flag = this.ships[0];
    if (!this.crisisUsed && !flag.struck && !flag.sunk && flag.hull < flag.hullMax * 0.65) {
      this.crisisUsed = true;
      this.pendingCrisis = true;
      return;
    }

    if (!this.alive(this.ships).length || !this.alive(this.enemy).length ||
        flag.struck || flag.sunk) {
      this.finishBattle();
    }
  },

  fireOn(a, b, opts) {
    let dmg = a.guns * W.rand(0.75, 1.25) * 0.42;
    if (a.side === 'player') dmg *= 1.08; // drill tells
    if (a.captain.trait === 'gunnery' && a.captain.alive) dmg *= 1.2;
    const d = this.doctrine;
    const aIsMine = a.side === 'player';
    if (aIsMine) {
      if (opts.approach) dmg *= 0.35;
      if (opts.rakeRound) dmg *= 2.2;
      if (d === 'gauge') dmg *= 0.9;
      if (d === 'close') dmg *= 1.25;
      if (this.gauge) dmg *= 1.1;
    } else {
      if (opts.counterApproach) dmg *= 1.3;
      if (d === 'gauge') dmg *= 0.75;
      if (d === 'close') dmg *= 1.25;
      if (this.gauge) dmg *= 0.92;
    }
    dmg = Math.max(0.5, dmg);
    b.hull -= dmg;
    let moraleHit = dmg * 1.2;
    if (opts.rakeRound && aIsMine) {
      moraleHit += 22;
      this.say(`${a.name} cuts the line and rakes ${b.name} stem to stern!`);
    }
    b.morale -= moraleHit;
    const floor = (b.captain.trait === 'ironsides' && b.captain.alive) ? 20 : 0;
    b.morale = Math.max(floor, b.morale);
    // captains are targets too
    if (b.hull < b.hullMax * 0.5 && b.captain.alive && W.chance(0.04)) {
      b.captain.alive = false;
      b.morale -= 18;
      this.say(`${b.name}'s captain is down!`);
    }
    this.fxAt(b, 'hit');
    if (b.hull <= 0) {
      if (W.chance(0.3)) {
        b.sunk = true;
        this.say(`${b.name} goes down by the head!`);
        this.fxAt(b, 'boom');
      } else {
        b.struck = true;
        this.say(`${b.name} strikes her colors!`);
      }
    }
  },

  checkStrikes(list) {
    for (const s of list) {
      if (s.struck || s.sunk) continue;
      if (s.morale <= 25 && W.chance(0.4)) {
        s.struck = true;
        this.say(`${s.name}'s crew has had enough — she strikes!`);
      }
    }
  },

  fxAt(ship, kind) {
    if (!W.Render || !W.Render.fleetPos) return;
    const p = W.Render.fleetPos(ship);
    if (!p) return;
    if (kind === 'boom') W.boom(p.x, p.y, 40);
    else {
      W.boom(p.x + W.rand(-30, 30), p.y + W.rand(-10, 10), 26);
      W.burst(p.x, p.y, '#7d7f84', 5, 40, 0.8, 3);
    }
  },

  // --- the crisis: fire aboard the flagship, handled by hand ---
  startCrisis() {
    this.pendingCrisis = false;
    W.player = W.makePlayerShip();
    const rooms = [W.pick(W.player.rooms), W.pick(W.player.rooms)];
    rooms.forEach(r => { r.fire = Math.max(r.fire, 55); });
    const leak = W.pick(W.player.rooms.filter(r => r.y >= 2));
    if (leak) { leak.breach = true; leak.breachWork = 0; }
    this.crisisTimer = 45;
    this.phase = 'crisis';
    W.state.mode = 'crisis';
    W.paused = false;
  },

  crisisTick(dt) {
    if (this.phase !== 'crisis') return;
    W.player.tick(dt);
    this.crisisTimer -= dt;
    const burning = W.player.rooms.some(r => r.fire > 0);
    const leaking = W.player.rooms.some(r => r.breach);
    if (!burning && !leaking) return this.endCrisis('saved');
    if (W.player.aliveCrew().length === 0) return this.endCrisis('lost');
    if (this.crisisTimer <= 0) return this.endCrisis('burned');
  },

  endCrisis(kind) {
    const flag = this.ships[0];
    if (kind === 'saved') {
      this.say('The fire is beaten out — the flag signals: ENGAGE THE ENEMY MORE CLOSELY. The line cheers.');
      this.ships.forEach(s => { s.morale = Math.min(80, s.morale + 8); });
    } else if (kind === 'burned') {
      flag.hull -= 6;
      flag.morale -= 15;
      this.say('The fire reaches the orlop before it dies. The flagship is badly hurt.');
      if (flag.hull <= 0) { flag.struck = true; this.say('The flagship strikes her colors!'); }
    } else {
      flag.sunk = true;
      this.say('The damage party is lost, and the flagship with it.');
    }
    this.phase = 'battle';
    W.state.mode = 'fleet';
    if (flag.struck || flag.sunk) this.finishBattle();
  },

  finishBattle() {
    if (this.result) return;
    const flag = this.ships[0];
    const myAlive = this.alive(this.ships).length;
    const theirAlive = this.alive(this.enemy).length;
    const prizes = this.enemy.filter(s => s.struck).length;
    const win = theirAlive === 0 && !flag.struck && !flag.sunk;
    this.result = win ? 'victory' : 'defeat';
    this.summary = {
      win, rounds: this.round, prizes,
      lost: this.ships.filter(s => s.struck || s.sunk).length,
      remaining: myAlive,
      gold: win ? 30 + prizes * 25 : 0,
    };
    this.say(win ? `The enemy line is broken. ${prizes} prize${prizes === 1 ? '' : 's'} taken.`
      : 'The squadron breaks off the action.');
    this.phase = 'done';
  },

  close() {
    this.active = false;
    this.phase = null;
    this.result = null;
  },
};
