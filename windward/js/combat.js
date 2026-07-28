'use strict';

W.Combat = {
  active: false,
  enemy: null,
  templ: null,
  proj: [],
  escape: 0,
  escaping: false,
  boardT: -1,
  surrenderChecked: false,
  surrenderPending: false,
  result: null,   // null | 'win' | 'victory' | 'flee' | 'lose' | 'crewdead'
  loot: null,
  boss: false,
  elite: false,
  aiT: 0,
  sinking: null,       // {t, dur} while the beaten enemy goes down
  pendingResult: null,

  start(enemyId, opts = {}) {
    const t = W.ENEMIES[enemyId];
    this.templ = t;
    this.boss = !!t.boss;
    this.elite = !!opts.elite;
    const crewSpecs = [];
    for (let i = 0; i < t.crew; i++) {
      const race = W.pick(t.races);
      crewSpecs.push({ race, name: W.nameFor(race) });
    }
    this.enemy = new W.Ship({
      name: t.name, layout: t.layout, faction: 'enemy',
      hull: t.hull, reactor: 99,
      sys: Object.assign({}, t.sys),
      weapons: t.weapons.slice(),
      crew: crewSpecs,
    });
    this.active = true;
    this.proj = [];
    this.escape = 0; this.escaping = false;
    this.boardT = t.grapple ? 6 : -1;
    this.surrenderChecked = false; this.surrenderPending = false;
    this.result = null; this.loot = null;
    this.sinking = null; this.pendingResult = null;
    this.aiT = 0;
    W.player.weapons.forEach(w => { w.charge = 0; w.target = null; });
    W.player.wardLayers = W.player.maxWard();
    this.aiRetarget(true);
    W.state.mode = 'combat';
    W.paused = true; // start paused so the player can set targets
  },

  aiRetarget(all) {
    if (!this.enemy) return;
    const P = W.player;
    const roomIdxOf = (sysId) => { const r = P.roomOf(sysId); return r ? r.idx : null; };
    for (const w of this.enemy.weapons) {
      if (!all && w.target != null && !W.chance(0.35)) continue;
      const roll = Math.random();
      let idx = null;
      if (roll < 0.35) idx = roomIdxOf('cannons');
      else if (roll < 0.55) idx = roomIdxOf('ward');
      else if (roll < 0.70) idx = roomIdxOf('helm');
      else if (roll < 0.80) idx = roomIdxOf('sails');
      if (idx == null) idx = W.pick(P.rooms).idx;
      w.target = idx;
    }
  },

  tick(dt) {
    if (!this.active || this.result) return;
    // the kill deserves its moment: she lists, burns, and goes under
    if (this.sinking) {
      this.sinking.t += dt;
      if (W.Render && W.Render.roomCenter && this.enemy && Math.random() < dt * 26) {
        const r = W.pick(this.enemy.rooms);
        const p = W.Render.roomCenter(this.enemy, r.idx);
        if (Math.random() < 0.35) W.boom(p.x, p.y, 28);
        else if (Math.random() < 0.5) W.burst(p.x, p.y + 12, '#9fd8ff', 5, 40, 0.7, 2); // bubbles
        else W.burst(p.x, p.y, '#7d7f84', 5, 30, 1.1, 4); // smoke
      }
      if (this.sinking.t >= this.sinking.dur) {
        this.sinking = null;
        this.result = this.pendingResult;
      }
      return;
    }
    const P = W.player, E = this.enemy;

    P.tick(dt);
    E.tick(dt);
    this.fireReady(P, E);
    this.fireReady(E, P);

    for (const p of this.proj) {
      p.t += dt;
      if (p.t >= p.dur && !p.done) { p.done = true; this.resolveHit(p); }
    }
    this.proj = this.proj.filter(p => !p.done);

    if (this.boardT > 0) {
      this.boardT -= dt;
      if (this.boardT <= 0) this.spawnBoarders();
    }

    this.aiT += dt;
    if (this.aiT > 5) { this.aiT = 0; this.aiRetarget(false); }

    if (this.escaping) {
      if (P.manned('helm') || P.usable('helm') >= 2) {
        this.escape += (0.4 + 0.35 * P.eff('sails')) / 10 * dt;
      }
      if (this.escape >= 1) { this.end('flee'); return; }
    }

    if (!this.boss && !this.surrenderChecked && E.hull > 0 && E.hull <= E.hullMax * 0.3) {
      this.surrenderChecked = true;
      if (W.chance(0.55)) { this.surrenderPending = true; W.paused = true; }
    }

    if (E.hull <= 0) { this.end('win'); return; }
    if (P.hull <= 0) { this.end('lose'); return; }
    if (P.aliveCrew().length === 0) { this.end('crewdead'); return; }
  },

  // Weapons laid on the same room hold fire until all are charged, then loose
  // together as one broadside — so paired guns can punch through a regenerating ward.
  fireReady(ship, foe) {
    const groups = {};
    for (const w of ship.weapons) {
      if (!w.powered || w.target == null) continue;
      // a mortar with no shells holds its charge and doesn't hold up the volley
      if (w.def.shell && ship.isPlayer && (W.state.shells | 0) <= 0) continue;
      (groups[w.target] = groups[w.target] || []).push(w);
    }
    for (const ws of Object.values(groups)) {
      if (ws.some(w => w.charge < w.def.charge)) continue;
      let stagger = 0;
      for (const w of ws) {
        if (w.def.shell && ship.isPlayer) {
          if ((W.state.shells | 0) <= 0) continue;
          W.state.shells--;
        }
        const shots = w.def.shots || 1;
        for (let i = 0; i < shots; i++) {
          this.proj.push({
            shooter: ship, target: foe, roomIdx: w.target,
            def: w.def, wepIndex: ship.weapons.indexOf(w),
            t: -stagger, dur: 0.7, done: false,
          });
          stagger += 0.18;
        }
        w.charge = 0;
      }
    }
  },

  resolveHit(p) {
    const foe = p.target;
    if (!this.active || foe.hull <= 0) return;
    const room = foe.rooms[p.roomIdx] || W.pick(foe.rooms);
    const pos = (W.Render && W.Render.roomCenter) ? W.Render.roomCenter(foe, room.idx) : { x: 0, y: 0 };

    // raking fire: cannot miss, but any smoke bank defeats it outright (and is
    // not consumed — the rake simply fires blind into the grey)
    if (p.def.beam) {
      if (foe.wardLayers > 0) {
        W.addFx(pos.x, pos.y, 'LOST IN SMOKE', '#cfd8dd');
        return;
      }
      const roomsHit = [room];
      for (const a of room.adj) {
        if (roomsHit.length >= p.def.beam) break;
        roomsHit.push(foe.rooms[a]);
      }
      for (const r of roomsHit) {
        const rp = (W.Render && W.Render.roomCenter) ? W.Render.roomCenter(foe, r.idx) : { x: 0, y: 0 };
        foe.hull -= p.def.dmg;
        if (r.sys && foe.systems[r.sys]) {
          const s = foe.systems[r.sys];
          s.damage = Math.min(s.level, s.damage + p.def.sysDmg);
        }
        for (const c of [...foe.crew, ...foe.intruders]) {
          if (c.roomIdx === r.idx) c.hp -= 10;
        }
        W.addFx(rp.x, rp.y, '-' + p.def.dmg, '#ff7a5c');
        W.boom(rp.x, rp.y, 30);
      }
      if (foe.isPlayer) W.shake = 7;
      return;
    }

    if (!p.def.noEvade && W.chance(foe.evasion() / 100)) {
      W.addFx(pos.x, pos.y, 'MISS', '#9fb8c9');
      W.burst(pos.x + W.rand(-30, 30), pos.y + 46, '#bcd8e8', 7, 55, 0.5, 2); // splash
      return;
    }
    if (foe.wardLayers > 0 && !p.def.bypassWard) {
      foe.wardLayers--; foe.wardFlash = 0.35; foe.wardTimer = 0;
      W.addFx(pos.x, pos.y, 'SMOKE', '#cfd8dd');
      W.ripple(pos.x, pos.y, '#cfd8dd');
      W.burst(pos.x, pos.y, '#aab4bc', 8, 45, 0.8, 4);
      return;
    }
    // langrage: suppresses the station's crew, harms nothing else
    if (p.def.hexDur) {
      if (room.sys && foe.systems[room.sys]) {
        foe.systems[room.sys].hex += p.def.hexDur;
        W.addFx(pos.x, pos.y, 'COVER!', '#c9d4dc');
        W.ripple(pos.x, pos.y, '#c9d4dc', 14);
      } else {
        W.addFx(pos.x, pos.y, 'NO EFFECT', '#9fb8c9');
      }
      return;
    }
    if (p.def.dmg > 0) {
      foe.hull -= p.def.dmg;
      W.addFx(pos.x, pos.y, '-' + p.def.dmg, '#ff7a5c');
      W.boom(pos.x, pos.y, p.def.dmg >= 2 ? 48 : 36);
      W.burst(pos.x, pos.y, '#e8b06a', 10, 95, 0.45, 2.5);      // splinters
      W.burst(pos.x, pos.y, '#7d7f84', 6, 40, 0.9, 3.5);        // smoke
    } else {
      W.addFx(pos.x, pos.y, 'HIT', '#ffb45c');
      W.boom(pos.x, pos.y, 26);
      W.burst(pos.x, pos.y, '#ffb45c', 8, 70, 0.4, 2);
    }
    if (room.sys && foe.systems[room.sys]) {
      const s = foe.systems[room.sys];
      s.damage = Math.min(s.level, s.damage + p.def.sysDmg);
    }
    if (W.chance(p.def.fire)) {
      room.fire = Math.max(room.fire, 40);
      W.burst(pos.x, pos.y, '#ff8a3c', 10, 60, 0.6, 3);
    }
    if (W.chance(p.def.breach) && !room.breach) {
      room.breach = true; room.breachWork = 0;
      W.addFx(pos.x, pos.y + 14, 'BREACH', '#5cc8ff');
      W.burst(pos.x, pos.y + 10, '#5cc8ff', 9, 65, 0.6, 2.5);
    }
    const crewDmg = p.def.crewDmg != null ? p.def.crewDmg : 15 * (p.def.dmg || 0.5);
    for (const c of [...foe.crew, ...foe.intruders]) {
      if (c.roomIdx === room.idx) c.hp -= crewDmg;
    }
    if (foe.isPlayer) W.shake = 6;
  },

  spawnBoarders() {
    const t = this.templ;
    const n = 2;
    const races = t.boarders || ['human'];
    const room = W.pick(W.player.rooms);
    const ctr = W.player.center(room);
    for (let i = 0; i < n; i++) {
      const race = W.pick(races);
      const c = new W.Crew(race, W.nameFor(race), 'enemy');
      c.ship = W.player;
      c.roomIdx = room.idx;
      c.px = ctr.x; c.py = ctr.y;
      W.player.intruders.push(c);
    }
    const pos = (W.Render && W.Render.roomCenter) ? W.Render.roomCenter(W.player, room.idx) : { x: 0, y: 0 };
    W.addFx(pos.x, pos.y - 10, 'BOARDED!', '#ff5c5c');
    W.paused = true;
  },

  toggleEscape() { this.escaping = !this.escaping; },

  acceptSurrender() {
    this.surrenderPending = false;
    const g = this.templ.gold;
    this.loot = { gold: Math.round(W.rand(g[0], g[1]) * 1.25) + 8, weapon: null, surrender: true };
    this.result = 'win';
  },
  refuseSurrender() {
    this.surrenderPending = false;
    W.paused = false;
  },

  end(kind) {
    if (kind === 'win') {
      const g = this.templ.gold;
      this.loot = {
        gold: Math.round(W.rand(g[0], g[1]) * (this.elite ? 1.4 : 1)),
        weapon: (!this.boss && W.chance(0.15)) ? W.pick(Object.keys(W.WEAPONS)) : null,
        shells: W.chance(0.3) ? W.randi(1, 3) : 0,
        provisions: W.chance(0.35) ? W.randi(1, 3) : 0,
      };
      // sink her before the loot modal
      this.pendingResult = this.boss ? 'victory' : 'win';
      this.sinking = { t: 0, dur: 2.4 };
      this.proj = [];
      W.paused = false;
    } else {
      this.result = kind;
    }
  },

  // Called by Main after the result has been handled: reset transient combat state.
  finish() {
    this.active = false;
    this.enemy = null;
    this.templ = null;
    this.proj = [];
    this.result = null;
    this.sinking = null;
    this.pendingResult = null;
    this.escaping = false;
    const P = W.player;
    if (!P) return;
    P.intruders = [];
    for (const r of P.rooms) { r.fire = 0; r.water = 0; r.breach = false; r.breachWork = 0; }
    for (const s of Object.values(P.systems)) s.damage = 0;
    P.weapons.forEach(w => { w.charge = 0; w.target = null; });
    P.crew.forEach(c => { c.hp = Math.min(c.maxHp, c.hp + 15); });
    P.wardLayers = P.maxWard();
  },
};
