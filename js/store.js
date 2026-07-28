'use strict';

W.Store = {
  stock: null,
  crewCost: { human: 40, tideborn: 45, stormtouched: 55, brass: 65 },

  gen() {
    const ids = Object.keys(W.WEAPONS);
    const picks = [];
    while (picks.length < 3) {
      const id = W.pick(ids);
      if (!picks.includes(id)) picks.push(id);
    }
    const race = W.pick(Object.keys(W.RACES));
    this.stock = {
      weapons: picks.map(id => ({ id, sold: false })),
      crew: { race, name: W.nameFor(race), sold: false },
    };
  },

  upgradeCost(id) { return 20 + W.player.systems[id].level * 15; },
  reactorCost() { return 30 + (W.player.reactor - 8) * 6; },

  buyWeapon(i) {
    const item = this.stock.weapons[i];
    const def = W.WEAPONS[item.id];
    if (item.sold || W.state.gold < def.cost || W.player.weapons.length >= 4) return false;
    W.state.gold -= def.cost;
    W.player.weapons.push(new W.Weapon(item.id));
    item.sold = true;
    return true;
  },

  buyCrew() {
    const item = this.stock.crew;
    const cost = this.crewCost[item.race];
    if (item.sold || W.state.gold < cost || W.player.crew.length >= 6) return false;
    W.state.gold -= cost;
    W.player.addCrewSpec({ race: item.race, name: item.name });
    item.sold = true;
    return true;
  },

  repairOne(n) {
    n = n || 1;
    const P = W.player;
    n = Math.min(n, P.hullMax - P.hull, Math.floor(W.state.gold / 2));
    if (n <= 0) return false;
    W.state.gold -= n * 2;
    P.hull += n;
    return true;
  },

  upgrade(id) {
    const s = W.player.systems[id];
    if (!s || s.level >= W.SYS[id].max) return false;
    const cost = this.upgradeCost(id);
    if (W.state.gold < cost) return false;
    W.state.gold -= cost;
    s.level++;
    return true;
  },

  buyReactor() {
    if (W.player.reactor >= 15) return false;
    const cost = this.reactorCost();
    if (W.state.gold < cost) return false;
    W.state.gold -= cost;
    W.player.reactor++;
    return true;
  },

  buyShells() {
    if ((W.state.shells | 0) >= 20 || W.state.gold < 10) return false;
    W.state.gold -= 10;
    W.state.shells = Math.min(20, (W.state.shells | 0) + 4);
    return true;
  },

  buyProvisions() {
    if ((W.state.provisions | 0) >= 20 || W.state.gold < 8) return false;
    W.state.gold -= 8;
    W.state.provisions = Math.min(20, (W.state.provisions | 0) + 5);
    return true;
  },
};
