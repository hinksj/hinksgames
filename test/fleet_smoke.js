// Headless test for the Line of Battle prototype: every doctrine fights many
// actions to completion, crises resolve, and both outcomes occur.
// Run: node test/fleet_smoke.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const ctx = { console };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['util.js', 'data.js', 'model.js', 'combat.js', 'fleet.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), ctx, { filename: f });
}
const W = ctx.W;

const tally = {};
let crises = 0;
for (const doctrine of Object.keys(W.Fleet.DOCTRINES)) {
  const results = { victory: 0, defeat: 0 };
  for (let i = 0; i < 12; i++) {
    W.Fleet.newSkirmish();
    W.Fleet.begin(doctrine);
    let t = 0;
    while (!W.Fleet.result && t < 600) {
      W.Fleet.tick(0.1);
      if (W.Fleet.pendingCrisis) {
        crises++;
        W.Fleet.startCrisis();
        // a competent damage party, abstracted: fires out, leak plugged
        W.player.rooms.forEach(r => { r.fire = 0; r.breach = false; });
        W.Fleet.crisisTick(0.1);
        assert.strictEqual(W.Fleet.phase, 'battle', 'crisis did not return to battle');
      }
      t += 0.1;
    }
    assert.ok(W.Fleet.result, `${doctrine}: action never resolved`);
    assert.ok(W.Fleet.summary && W.Fleet.summary.rounds > 0, 'no summary');
    results[W.Fleet.result]++;
    W.Fleet.close();
  }
  tally[doctrine] = results;
  console.log(`${doctrine}: victory×${results.victory} defeat×${results.defeat}`);
}
const wins = Object.values(tally).reduce((s, r) => s + r.victory, 0);
const losses = Object.values(tally).reduce((s, r) => s + r.defeat, 0);
assert.ok(wins > 0 && losses > 0, 'battles should be winnable AND losable');
assert.ok(crises > 0, 'the flagship crisis never triggered across 36 actions');
console.log(`total: ${wins}W/${losses}L across 36 actions, ${crises} flagship crises`);
console.log('\nFLEET SMOKE TEST PASSED');
