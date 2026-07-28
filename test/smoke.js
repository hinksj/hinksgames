// Headless smoke test: loads the DOM-free game modules in a vm sandbox and
// simulates map generation, a full combat, event resolution, and the store.
// Run: node test/smoke.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const FILES = ['util.js', 'data.js', 'model.js', 'combat.js', 'map.js', 'events.js', 'store.js'];

const ctx = { console };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of FILES) {
  const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
  vm.runInContext(src, ctx, { filename: f });
}
const W = ctx.W;

// --- map generation ---
W.GameMap.gen(1);
assert.ok(W.GameMap.nodes.length === 11, 'expected 11 nodes, got ' + W.GameMap.nodes.length);
assert.ok(W.GameMap.nodes.some(n => n.type === 'store'), 'no store in sector');
assert.ok(W.GameMap.nodes.some(n => n.type === 'exit'), 'no exit in sector');
const start = W.GameMap.node(W.GameMap.curr);
assert.ok(start.edges.length >= 1, 'start node has no edges');
// every node reachable from start (BFS over edges)
{
  const seen = new Set([start.id]);
  const q = [start.id];
  while (q.length) {
    for (const e of W.GameMap.node(q.shift()).edges) {
      if (!seen.has(e)) { seen.add(e); q.push(e); }
    }
  }
  assert.strictEqual(seen.size, 11, 'map not fully connected: ' + seen.size);
}
console.log('map gen: OK');

// --- player ship sanity ---
W.player = W.makePlayerShip();
W.state.gold = 20;
assert.strictEqual(W.player.rooms.length, 7);
assert.ok(W.player.rooms.every(r => r.adj.length > 0), 'orphan room in sloop layout');
assert.strictEqual(W.player.crew.length, 3);
assert.ok(W.player.powerUsed() <= W.player.reactor, 'over reactor budget');
assert.strictEqual(W.player.maxWard(), 1);
assert.ok(W.player.evasion() > 0, 'player should have evasion with manned helm');
// pathfinding across the ship
const p = W.player.pathBetween(0, 5);
assert.ok(p.length >= 2 && p[p.length - 1] === 5, 'bad path: ' + JSON.stringify(p));
console.log('player ship: OK');

// --- full combat sim vs each enemy type ---
// The sim player approximates a competent human: all guns volleyed on the enemy
// gun deck, and everyone piles onto boarders when they appear.
function simCombat(makeShip, enemyId) {
  W.player = makeShip();
  W.Combat.start(enemyId);
  W.paused = false;
  const gunRoom = W.Combat.enemy.roomOf('cannons') || W.Combat.enemy.rooms[0];
  W.player.weapons.forEach((w) => { w.target = gunRoom.idx; });
  let t = 0;
  while (t < 600 && !W.Combat.result) {
    W.Combat.tick(0.05);
    W.paused = false; // boarding autopauses; keep simming
    if (W.player.intruders.length) {
      const rm = W.player.intruders[0].roomIdx;
      for (const c of W.player.crew) {
        if (c.roomIdx !== rm && !c.path.length) c.orderTo(rm);
      }
    }
    t += 0.05;
  }
  // A 10-minute unresolved fight is a stalemate, not a bug — in the real game
  // the player re-targets (e.g. chainshot the sails) or flees. Count it as data.
  if (W.Combat.result === 'win' || W.Combat.result === 'victory') {
    assert.ok(W.Combat.loot && W.Combat.loot.gold >= 0, 'no loot on win');
  }
  const out = { result: W.Combat.result || 'timeout', hull: Math.max(0, W.player.hull), t };
  W.Combat.finish();
  assert.ok(W.player.rooms.every(r => r.fire === 0 && r.water === 0 && !r.breach), 'combat cleanup failed');
  return out;
}

function simMatchup(label, makeShip, enemyId, trials) {
  const results = {};
  let last = null;
  for (let i = 0; i < trials; i++) {
    last = simCombat(makeShip, enemyId);
    results[last.result] = (results[last.result] || 0) + 1;
  }
  console.log(`${label} vs ${enemyId} (tier ${W.ENEMIES[enemyId].tier}): ` +
    Object.entries(results).map(([k, v]) => `${k}×${v}`).join(' ') +
    ` (last: hull ${last.hull.toFixed(1)} at ${last.t.toFixed(0)}s)`);
  return results;
}

const TRIALS = 5;
for (const enemyId of Object.keys(W.ENEMIES)) {
  simMatchup('stock ship', W.makePlayerShip, enemyId, TRIALS);
}

// An upgraded late-run loadout should handle tier 3 and have a real shot at the boss.
function makeEndgameShip() {
  return new W.Ship({
    name: 'The Petrel', layout: 'sloop', faction: 'player',
    hull: 30, hullMax: 30, reactor: 14,
    sys: { helm: 2, sails: 3, ward: 4, cannons: 6, pumps: 2, surgeon: 1 },
    power: { sails: 3, ward: 4, cannons: 6, pumps: 1 },
    weapons: ['carronade', 'swivels', 'longnine', 'chainshot'],
    crew: [
      { race: 'human', name: 'Moss' }, { race: 'human', name: 'Wren' },
      { race: 'tideborn', name: 'Brine' }, { race: 'brass', name: 'Ferrous' },
      { race: 'stormtouched', name: 'Gale' },
    ],
  });
}
for (const enemyId of ['frigate', 'corsair_frig', 'leviathan']) {
  simMatchup('endgame ship', makeEndgameShip, enemyId, TRIALS);
}

// --- fleeing works ---
W.player = W.makePlayerShip();
W.Combat.start('frigate');
W.paused = false;
W.Combat.escaping = true;
let t = 0;
while (t < 600 && !W.Combat.result) { W.Combat.tick(0.05); t += 0.05; }
assert.ok(W.Combat.result, 'flee combat never ended');
console.log(`flee attempt vs frigate: ${W.Combat.result} after ${t.toFixed(0)}s`);
W.Combat.finish();

// --- events: exercise every choice's ops without RNG surprises ---
W.player = W.makePlayerShip();
W.state.gold = 500;
let opsRun = 0;
for (const ev of W.EVENTS) {
  for (let ci = 0; ci < ev.choices.length; ci++) {
    const ch = ev.choices[ci];
    const ops = ch.outcomes ? ch.outcomes.map(o => o[1]) : [ch.op];
    for (const op of ops) {
      const res = W.Events.apply(op);
      assert.ok(res.lines.length >= 1, `event ${ev.id} choice ${ci} produced no text`);
      opsRun++;
    }
  }
  // full resolve path too
  const res = W.Events.resolve(ev, ev.choices.length - 1);
  assert.ok(res.lines.length >= 1);
}
assert.ok(W.player.hull >= 1 && W.player.hull <= W.player.hullMax, 'event hull out of range');
console.log(`events: OK (${W.EVENTS.length} events, ${opsRun} outcome ops applied)`);

// --- store ---
W.player = W.makePlayerShip();
W.state.gold = 1000;
W.GameMap.sector = 2;
W.Store.gen();
assert.strictEqual(W.Store.stock.weapons.length, 3);
assert.ok(W.Store.buyWeapon(0), 'weapon purchase failed');
assert.strictEqual(W.player.weapons.length, 3);
assert.ok(W.Store.buyCrew(), 'crew purchase failed');
assert.strictEqual(W.player.crew.length, 4);
W.player.hull = 10;
assert.ok(W.Store.repairOne(5), 'repair failed');
assert.strictEqual(W.player.hull, 15);
const lvl = W.player.systems.sails.level;
assert.ok(W.Store.upgrade('sails'), 'upgrade failed');
assert.strictEqual(W.player.systems.sails.level, lvl + 1);
assert.ok(W.Store.buyReactor(), 'reactor purchase failed');
console.log('store: OK');

// --- boarding actually lands boarders ---
W.player = W.makePlayerShip();
W.Combat.start('raider');
W.paused = false;
W.player.weapons.forEach((w) => { w.target = 0; });
t = 0;
let sawBoarders = false;
while (t < 600 && !W.Combat.result) {
  W.Combat.tick(0.05);
  W.paused = false; // boarding autopauses; keep simming
  if (W.player.intruders.length > 0) sawBoarders = true;
  t += 0.05;
}
assert.ok(sawBoarders, 'raider never boarded');
console.log(`boarding: OK (raider fight ended: ${W.Combat.result})`);
W.Combat.finish();

console.log('\nSMOKE TEST PASSED');
