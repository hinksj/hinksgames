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
    cutter:  { name: 'Cutter',  hull: 16, guns: 5,  art: 'cutter' },
    sloop:   { name: 'Sloop',   hull: 22, guns: 7,  art: 'sloop' },
    brig:    { name: 'Brig',    hull: 28, guns: 9,  art: 'brig' },
    frigate: { name: 'Frigate', hull: 36, guns: 13, art: 'frigate' },
  },

  TRAITS: {
    gunnery:   { name: 'Gunnery Master', desc: '+20% broadside weight.' },
    boarder:   { name: 'Boarder',        desc: 'Twice as likely to carry a ship by boarding.' },
    ironsides: { name: 'Old Ironsides',  desc: 'His crew\'s morale never breaks below 20 while he stands.' },
    weatherly: { name: 'Weatherly',      desc: 'Better odds of holding the weather gauge at the start.' },
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

  makeShip(cls, name, captName, trait, side) {
    const c = this.CLASSES[cls];
    return {
      cls, name, side,
      hull: c.hull, hullMax: c.hull, guns: c.guns,
      morale: side === 'player' ? 70 : 64,
      struck: false, sunk: false, rakeDone: false,
      order: { tactic: 'engage', target: 0 },
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
    this.ships.forEach((s, i) => { s.order = { tactic: 'engage', target: Math.min(i, 2) }; });
    this.planName = null;
    this.round = 0; this.roundT = 0;
    this.log = [];
    this.signals = 2; this.pendingSignal = null; this.closerRounds = 0;
    this.crisisUsed = false; this.pendingCrisis = false; this.crisisModalShown = false;
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
    const weatherly = this.ships.filter(s => s.captain.trait === 'weatherly' && s.captain.alive).length;
    this.gauge = W.chance(0.5 + 0.2 * weatherly);
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

    // your ships fight their orders
    for (const a of mine) {
      const b = this.targetOf(a);
      if (b) this.fireOn(a, b);
    }
    // enemy ships pick their marks: whoever engages them, else the flagship
    const flag = this.ships[0];
    for (const b of this.alive(this.enemy)) {
      let mark = mine.find(s => this.targetOf(s) === b) || flag;
      if (mark.struck || mark.sunk) mark = this.alive(this.ships)[0];
      if (!mark) break;
      // a screening ship takes fire meant for the flagship
      if (mark === flag) {
        const screen = mine.find(s => s.order.tactic === 'screen' && s !== flag);
        if (screen && W.chance(0.45)) {
          mark = screen;
          this.say(`${screen.name} puts herself between the enemy and the flag.`);
        }
      }
      this.fireOn(b, mark);
    }

    // boarding attempts
    for (const a of mine) {
      if (a.order.tactic !== 'board' || this.round < 2) continue;
      const b = this.targetOf(a);
      if (!b || b.struck || b.sunk) continue;
      let odds = (b.morale < 55 ? 0.22 : 0.07) * (this.closerRounds > 0 ? 1.5 : 1);
      if (a.captain.trait === 'boarder' && a.captain.alive) odds *= 2;
      if (W.chance(odds)) {
        b.struck = true;
        this.say(`${a.name} grapples and boards ${b.name} — her colors come down!`);
        this.fxAt(b, 'boom');
      }
    }

    this.checkStrikes(this.ships);
    this.checkStrikes(this.enemy);

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

  fireOn(a, b) {
    const aIsMine = a.side === 'player';
    const tac = aIsMine ? a.order.tactic : 'engage';
    const victimTac = b.side === 'player' ? b.order.tactic : 'engage';

    let dmg = a.guns * W.rand(0.75, 1.25) * 0.42;
    if (aIsMine) dmg *= 1.16; // drill tells
    if (a.captain.trait === 'gunnery' && a.captain.alive) dmg *= 1.2;
    if (aIsMine && this.closerRounds > 0) dmg *= 1.18;
    if (this.gauge) dmg *= aIsMine ? 1.1 : 0.92;

    let rake = false;
    if (aIsMine) {
      if (tac === 'cut') {
        if (this.round <= 2) dmg *= 0.35;
        else if (!a.rakeDone) { a.rakeDone = true; rake = true; dmg *= 2.2; }
        else dmg *= 1.05;
      }
      if (tac === 'range') dmg *= 0.6;
      if (tac === 'board') dmg *= 1.1;
      if (tac === 'screen') dmg *= 0.7;
    }
    // how hard the victim is to hurt depends on HER orders — but a refusing
    // line cannot refuse forever: the enemy comes down on her, round by round
    if (victimTac === 'range') dmg *= Math.min(1, 0.4 + Math.max(0, this.round - 4) * 0.15);
    if (victimTac === 'cut' && this.round <= 2) dmg *= this.gauge ? 1.25 : 1.45;
    if (victimTac === 'board') dmg *= 1.15;

    dmg = Math.max(0.4, dmg);
    b.hull -= dmg;
    let moraleHit = dmg * 1.2;
    if (rake) {
      moraleHit += 22;
      this.say(`${a.name} cuts the line and rakes ${b.name} stem to stern!`);
      this.floatAt(b, 'RAKED!', '#a02418');
    }
    if (aIsMine && tac === 'range') moraleHit += 4; // harried without reply
    b.morale -= moraleHit;
    const floor = (b.captain.trait === 'ironsides' && b.captain.alive) ? 20 : 0;
    b.morale = Math.max(floor, b.morale);
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

  // --- the crisis: fire aboard the flagship, handled by hand ---
  startCrisis() {
    this.pendingCrisis = false;
    this.crisisModalShown = false;
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
      this.say('The fire is beaten out — the line cheers the flag.');
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

  finishBattle(kind) {
    if (this.result) return;
    const flag = this.ships[0];
    const myAlive = this.alive(this.ships).length;
    const theirAlive = this.alive(this.enemy).length;
    const prizes = this.enemy.filter(s => s.struck).length;
    const win = kind !== 'withdraw' && theirAlive === 0 && !flag.struck && !flag.sunk;
    this.result = win ? 'victory' : (kind === 'withdraw' ? 'withdraw' : 'defeat');
    this.summary = {
      win, withdraw: kind === 'withdraw',
      rounds: this.round, prizes,
      lost: this.ships.filter(s => s.struck || s.sunk).length,
      remaining: myAlive,
      gold: win ? 30 + prizes * 25 : 0,
    };
    this.say(win ? `The enemy line is broken. ${prizes} prize${prizes === 1 ? '' : 's'} taken.`
      : (kind === 'withdraw' ? 'You bring the squadron off intact enough to fight again.'
        : 'The action is lost.'));
    this.phase = 'done';
  },

  close() {
    this.active = false;
    this.phase = null;
    this.result = null;
  },
};
