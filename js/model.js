'use strict';

W.Weapon = class {
  constructor(type) {
    this.id = W.uid();
    this.type = type;
    this.charge = 0;
    this.on = true;
    this.powered = false;
    this.target = null; // room index on the foe's ship
  }
  get def() { return W.WEAPONS[this.type]; }
};

W.Crew = class {
  constructor(race, name, faction) {
    this.id = W.uid();
    this.race = race;
    this.name = name;
    this.faction = faction; // 'player' | 'enemy'
    this.maxHp = W.RACES[race].hp;
    this.hp = this.maxHp;
    this.roomIdx = 0;
    this.px = 0; this.py = 0; // tile coords within the ship layout
    this.path = [];           // room indices still to walk through
    this.status = 'Idle';
    this.ship = null;
  }
  orderTo(roomIdx) {
    if (!this.ship || this.hp <= 0) return;
    this.path = this.ship.pathBetween(this.roomIdx, roomIdx);
  }
};

W.Ship = class {
  constructor(cfg) {
    this.id = W.uid();
    this.name = cfg.name;
    this.faction = cfg.faction || 'player';
    this.isPlayer = this.faction === 'player';
    this.layoutId = cfg.layout;
    this.layout = W.LAYOUTS[cfg.layout];
    this.rooms = this.layout.rooms.map((r, i) => ({
      idx: i, sys: r.sys, x: r.x, y: r.y, w: r.w, h: r.h,
      fire: 0, water: 0, breach: false, breachWork: 0, spreadT: 0, adj: [],
    }));
    this.computeAdjacency();

    this.systems = {};
    for (const [id, lvl] of Object.entries(cfg.sys)) {
      this.systems[id] = { level: lvl, damage: 0, power: 0, hex: 0 };
    }
    this.reactor = cfg.reactor;
    this.hullMax = cfg.hullMax || cfg.hull;
    this.hull = cfg.hull;

    this.weapons = (cfg.weapons || []).map(w =>
      typeof w === 'string' ? new W.Weapon(w)
        : Object.assign(new W.Weapon(w.type), { on: w.on !== false }));

    this.wardLayers = 0; this.wardTimer = 0; this.wardFlash = 0;
    this.crew = [];
    this.intruders = []; // hostile boarders standing on THIS ship
    this.aiT = 0;

    if (cfg.power) {
      for (const [id, p] of Object.entries(cfg.power)) {
        if (this.systems[id]) this.systems[id].power = Math.min(p, this.systems[id].level);
      }
    } else if (!this.isPlayer) {
      for (const s of Object.values(this.systems)) s.power = s.level;
    } else {
      this.defaultPower();
    }

    (cfg.crew || []).forEach(spec => this.addCrewSpec(spec));
    this.clampAll();
    this.wardLayers = this.maxWard();
  }

  computeAdjacency() {
    const overlap = (a1, a2, b1, b2) => Math.min(a2, b2) - Math.max(a1, b1) >= 1;
    for (const a of this.rooms) for (const b of this.rooms) {
      if (a.idx >= b.idx) continue;
      const vertTouch = (a.x + a.w === b.x || b.x + b.w === a.x) && overlap(a.y, a.y + a.h, b.y, b.y + b.h);
      const horzTouch = (a.y + a.h === b.y || b.y + b.h === a.y) && overlap(a.x, a.x + a.w, b.x, b.x + b.w);
      if (vertTouch || horzTouch) { a.adj.push(b.idx); b.adj.push(a.idx); }
    }
  }

  defaultPower() {
    for (const id of ['ward', 'sails', 'cannons', 'pumps', 'surgeon']) {
      const s = this.systems[id];
      if (!s) continue;
      while (s.power < s.level && this.powerUsed() < this.reactor) s.power++;
    }
  }

  sysObj(id) { return this.systems[id] || null; }
  usable(id) {
    const s = this.systems[id];
    return s ? Math.max(0, s.level - Math.ceil(s.damage - 1e-6)) : 0;
  }
  eff(id) {
    const s = this.systems[id];
    if (!s) return 0;
    if (s.hex > 0) return 0; // a hexed station is seized: nothing flows
    if (W.SYS[id].sub) return this.usable(id); // subsystems need no power
    return Math.min(s.power, this.usable(id));
  }
  destroyed(id) { return this.systems[id] ? this.usable(id) === 0 : true; }
  roomOf(id) { return this.rooms.find(r => r.sys === id) || null; }
  center(r) { return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }

  occupants(roomIdx) {
    return this.crew.filter(c => c.roomIdx === roomIdx && c.hp > 0 && c.path.length === 0);
  }
  intrudersIn(roomIdx) {
    return this.intruders.filter(c => c.roomIdx === roomIdx && c.hp > 0);
  }
  manned(id) {
    const r = this.roomOf(id);
    if (!r) return false;
    return this.occupants(r.idx).length > 0 && this.intrudersIn(r.idx).length === 0 && r.water < 70;
  }

  maxWard() { return Math.min(3, Math.floor(this.eff('ward') / 2)); }

  evasion() {
    if (!this.sysObj('helm') || this.destroyed('helm')) return 0;
    if (this.systems.helm.hex > 0) return 0; // wheel crew suppressed
    const manned = this.manned('helm');
    if (!manned && this.usable('helm') < 2) return 0;
    let ev = this.eff('sails') * 5 + (manned ? 5 * this.systems.helm.level : 0);
    if (!manned) ev *= 0.5; // lashed wheel
    if (this.manned('sails')) ev += 3;
    return W.clamp(Math.round(ev), 0, 45);
  }

  powerUsed() {
    return Object.entries(this.systems)
      .filter(([id]) => !W.SYS[id].sub)
      .reduce((sum, [, s]) => sum + s.power, 0);
  }
  setPower(id, d) {
    const s = this.systems[id];
    if (!s || W.SYS[id].sub) return;
    if (d > 0 && s.power < this.usable(id) && this.powerUsed() < this.reactor) s.power++;
    if (d < 0 && s.power > 0) s.power--;
  }

  weaponPowerUsed() {
    return this.weapons.filter(w => w.on).reduce((sum, w) => sum + w.def.power, 0);
  }
  toggleWeapon(w) {
    if (w.on) { w.on = false; return; }
    if (this.weaponPowerUsed() + w.def.power <= this.eff('cannons')) w.on = true;
  }

  // Power assignments are player INTENT and persist through damage — eff()
  // already caps live output at what the damaged system can hold, and weapons
  // resume charging on their own once the gun deck is repaired. This only
  // guards the reactor budget as a safety net.
  clampAll() {
    let guard = 32;
    while (this.powerUsed() > this.reactor && guard-- > 0) {
      const over = Object.entries(this.systems)
        .find(([id, s]) => !W.SYS[id].sub && s.power > 0);
      if (!over) break;
      over[1].power--;
    }
  }

  addCrewSpec(spec) {
    const c = new W.Crew(spec.race, spec.name || W.nameFor(spec.race), this.faction);
    if (spec.hp != null) c.hp = Math.min(c.maxHp, spec.hp);
    c.ship = this;
    let room = null;
    for (const sysId of ['helm', 'cannons', 'sails', 'ward', 'pumps', 'surgeon']) {
      const r = this.roomOf(sysId);
      if (r && this.occupants(r.idx).length === 0) { room = r; break; }
    }
    if (!room) room = W.pick(this.rooms);
    c.roomIdx = room.idx;
    const ctr = this.center(room);
    c.px = ctr.x; c.py = ctr.y;
    this.crew.push(c);
    return c;
  }

  aliveCrew() { return this.crew.filter(c => c.hp > 0); }

  pathBetween(a, b) {
    if (a === b) return [];
    const prev = {}; const seen = new Set([a]); const q = [a];
    while (q.length) {
      const cur = q.shift();
      for (const n of this.rooms[cur].adj) {
        if (seen.has(n)) continue;
        seen.add(n); prev[n] = cur;
        if (n === b) {
          const path = [b];
          let p = b;
          while (prev[p] !== undefined && prev[p] !== a) { p = prev[p]; path.unshift(p); }
          return path;
        }
        q.push(n);
      }
    }
    return [];
  }

  tick(dt) {
    this.clampAll();

    // hexes wear off on their own; they are curses, not damage
    for (const s of Object.values(this.systems)) {
      if (s.hex > 0) s.hex = Math.max(0, s.hex - dt);
    }

    // ward regen
    const mw = this.maxWard();
    if (this.wardLayers > mw) this.wardLayers = mw;
    if (this.wardLayers < mw) {
      this.wardTimer += dt * (this.manned('ward') ? 1.25 : 1);
      if (this.wardTimer >= 5) { this.wardTimer = 0; this.wardLayers++; }
    } else this.wardTimer = 0;
    this.wardFlash = Math.max(0, this.wardFlash - dt);

    // room environment: fire, flooding, damage to occupants
    for (const r of this.rooms) {
      if (r.fire > 0) {
        r.fire = Math.min(100, r.fire + 5 * dt);
        if (r.sys && this.systems[r.sys]) {
          const s = this.systems[r.sys];
          s.damage = Math.min(s.level, s.damage + 0.25 * dt);
        }
        r.spreadT += dt;
        if (r.spreadT > 4) {
          r.spreadT = 0;
          for (const a of r.adj) {
            if (this.rooms[a].fire === 0 && W.chance(r.fire / 300)) this.rooms[a].fire = 20;
          }
        }
        if (r.water > 40) r.fire = Math.max(0, r.fire - 30 * dt);
      }
      if (r.breach) r.water = Math.min(100, r.water + Math.max(2, 14 - this.eff('pumps') * 3) * dt);
      else r.water = Math.max(0, r.water - (4 + this.eff('pumps') * 4) * dt);

      for (const c of [...this.crew, ...this.intruders]) {
        if (c.roomIdx !== r.idx || c.hp <= 0) continue;
        const race = W.RACES[c.race];
        if (r.fire > 20) c.hp -= 8 * dt * (race.fireRes != null ? race.fireRes : 1);
        if (r.water > 50) c.hp -= 6 * dt * (race.waterRes != null ? race.waterRes : 1);
      }
    }

    this.tickCrewList(this.crew, dt, false);
    this.tickCrewList(this.intruders, dt, true);
    this.crew = this.crew.filter(c => c.hp > 0);
    this.intruders = this.intruders.filter(c => c.hp > 0);

    if (!this.isPlayer) this.crewAI(dt);

    // weapon charging
    const gunEff = this.eff('cannons');
    const gunManned = this.manned('cannons');
    let used = 0;
    for (const w of this.weapons) {
      const powered = w.on && (used + w.def.power <= gunEff);
      if (powered) {
        used += w.def.power;
        w.charge = Math.min(w.def.charge, w.charge + dt * (gunManned ? 1.1 : 1));
      } else {
        w.charge = Math.max(0, w.charge - 2 * dt);
      }
      w.powered = powered;
    }
  }

  tickCrewList(list, dt, isIntruder) {
    for (const c of list) {
      if (c.hp <= 0) continue;
      const race = W.RACES[c.race];

      if (c.path.length) {
        const next = this.rooms[c.path[0]];
        const ctr = this.center(next);
        const dx = ctr.x - c.px, dy = ctr.y - c.py;
        const dist = Math.hypot(dx, dy);
        const step = 2.2 * race.speed * dt;
        if (dist <= step || dist < 0.05) {
          c.px = ctr.x; c.py = ctr.y;
          c.roomIdx = next.idx;
          c.path.shift();
        } else {
          c.px += dx / dist * step; c.py += dy / dist * step;
        }
        c.status = 'Moving';
        continue;
      }

      const r = this.rooms[c.roomIdx];
      const hostiles = isIntruder ? this.occupants(r.idx) : this.intrudersIn(r.idx);
      if (hostiles.length) {
        c.status = 'Fighting';
        // boarders swing a little lighter so an ungrouped crew isn't wiped instantly
        hostiles[0].hp -= 10 * race.combat * dt * (isIntruder ? 0.8 : 1);
        continue;
      }

      if (isIntruder) {
        if (r.sys && this.systems[r.sys] && !this.destroyed(r.sys)) {
          const s = this.systems[r.sys];
          s.damage = Math.min(s.level, s.damage + 0.5 * dt);
          c.status = 'Wrecking';
        } else {
          const target = this.rooms.find(x => x.sys && this.systems[x.sys] && !this.destroyed(x.sys));
          if (target) c.path = this.pathBetween(c.roomIdx, target.idx);
          c.status = 'Prowling';
        }
        continue;
      }

      const repSpeed = race.repair * (r.water > 50 ? 0.5 : 1);
      if (r.breach) {
        r.breachWork += repSpeed * dt;
        c.status = 'Plugging leak';
        if (r.breachWork >= 3) { r.breach = false; r.breachWork = 0; }
        continue;
      }
      if (r.fire > 0) {
        r.fire = Math.max(0, r.fire - 14 * repSpeed * dt);
        c.status = 'Firefighting';
        continue;
      }
      if (r.sys && this.systems[r.sys] && this.systems[r.sys].damage > 0) {
        const s = this.systems[r.sys];
        s.damage = Math.max(0, s.damage - 0.35 * repSpeed * dt);
        c.status = 'Repairing';
        continue;
      }
      if (r.sys === 'surgeon' && this.eff('surgeon') > 0 && c.hp < c.maxHp) {
        c.hp = Math.min(c.maxHp, c.hp + 8 * this.eff('surgeon') * dt);
        c.status = 'Healing';
        continue;
      }
      c.status = r.sys ? 'Manning' : 'Idle';
    }
  }

  // simple crew AI for enemy ships: keep the helm manned, repair the worst system
  crewAI(dt) {
    this.aiT += dt;
    if (this.aiT < 1) return;
    this.aiT = 0;
    const alive = this.aliveCrew();
    if (!alive.length) return;

    const heading = (roomIdx) => alive.some(c =>
      c.roomIdx === roomIdx && !c.path.length || (c.path.length && c.path[c.path.length - 1] === roomIdx));

    const helmRoom = this.roomOf('helm');
    if (helmRoom && !this.destroyed('helm') && !heading(helmRoom.idx)) {
      const idle = alive.find(c => !c.path.length && ['Idle', 'Manning'].includes(c.status));
      if (idle) idle.orderTo(helmRoom.idx);
    }

    let worst = null;
    for (const [id, s] of Object.entries(this.systems)) {
      if (s.damage > 0.5 && (!worst || s.damage > this.systems[worst].damage)) worst = id;
    }
    const needsCrew = (r) => r.breach || r.fire > 0 || (r.sys && this.systems[r.sys] && this.systems[r.sys].damage > 0.5);
    const trouble = worst ? this.roomOf(worst) : this.rooms.find(needsCrew);
    if (trouble && !heading(trouble.idx)) {
      const fixer = alive.find(c => !c.path.length && c.roomIdx !== (helmRoom && helmRoom.idx) &&
        ['Idle', 'Manning'].includes(c.status));
      if (fixer) fixer.orderTo(trouble.idx);
    }
  }
};

W.makePlayerShip = function () {
  return new W.Ship({
    name: 'The Petrel', layout: 'sloop', faction: 'player',
    hull: 30, hullMax: 30, reactor: 8,
    sys: { helm: 1, sails: 2, ward: 2, cannons: 3, pumps: 1, surgeon: 1 },
    power: { sails: 2, ward: 2, cannons: 2, pumps: 1, surgeon: 1 },
    weapons: ['longnine', 'chainshot'],
    crew: [
      { race: 'human', name: 'Silas' },
      { race: 'human', name: 'Nan' },
      { race: 'tideborn', name: 'Kerensa' },
    ],
  });
};
