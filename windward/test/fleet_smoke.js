// Headless test for Line of Battle: preset plans, custom per-ship orders, the
// withdraw hoist, and the flagship crisis all resolve; both outcomes occur.
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

let crises = 0;
function runBattle(setup) {
  W.Fleet.newSkirmish();
  W.Fleet.campaign.stage = 3;  // measure doctrine spread on the mid-cruise line
  W.Fleet.setupAction();
  setup();
  W.Fleet.begin();
  let t = 0;
  while (!W.Fleet.result && t < 600) {
    W.Fleet.tick(0.1);
    if (W.Fleet.pendingCrisis) {
      crises++;
      W.Fleet.startCrisis();
      W.player.rooms.forEach(r => { r.fire = 0; r.breach = false; });
      W.Fleet.crisisTick(0.1);
      assert.strictEqual(W.Fleet.phase, 'battle', 'crisis did not return to battle');
    }
    t += 0.1;
  }
  assert.ok(W.Fleet.result, 'action never resolved');
  assert.ok(W.Fleet.summary && W.Fleet.summary.rounds >= 0, 'no summary');
  const r = W.Fleet.result;
  W.Fleet.close();
  return r;
}

const tally = { victory: 0, defeat: 0, withdraw: 0 };
for (const preset of Object.keys(W.Fleet.PRESETS)) {
  const results = { victory: 0, defeat: 0, withdraw: 0 };
  for (let i = 0; i < 12; i++) {
    results[runBattle(() => W.Fleet.applyPreset(preset))]++;
  }
  Object.keys(results).forEach(k => { tally[k] += results[k]; });
  console.log(`${preset}: victory×${results.victory} defeat×${results.defeat}`);
}

// a mixed hand-set plan resolves too
for (let i = 0; i < 6; i++) {
  tally[runBattle(() => {
    W.Fleet.ships[0].order = { tactic: 'cut', target: 2 };
    W.Fleet.ships[1].order = { tactic: 'board', target: 1 };
    W.Fleet.ships[2].order = { tactic: 'screen', target: 0 };
  })]++;
}
console.log('mixed orders: OK');

// the withdraw hoist ends an action in good order
{
  W.Fleet.newSkirmish();
  W.Fleet.applyPreset('gauge');
  W.Fleet.begin();
  let t = 0;
  while (!W.Fleet.result && t < 600) {
    W.Fleet.tick(0.1);
    if (W.Fleet.round >= 2 && W.Fleet.signals === 2) {
      assert.ok(W.Fleet.hoist('breakoff'), 'hoist refused');
    }
    if (W.Fleet.pendingCrisis) {
      W.Fleet.startCrisis();
      W.player.rooms.forEach(r => { r.fire = 0; r.breach = false; });
      W.Fleet.crisisTick(0.1);
    }
    t += 0.1;
  }
  assert.strictEqual(W.Fleet.result, 'withdraw', 'breakoff did not withdraw: ' + W.Fleet.result);
  assert.ok(W.Fleet.summary.withdraw, 'summary not marked withdraw');
  console.log('withdraw hoist: OK');
  W.Fleet.close();
}

assert.ok(tally.victory > 0 && tally.defeat > 0, 'battles should be winnable AND losable');
assert.ok(crises > 0, 'the flagship crisis never triggered');
console.log(`total: ${tally.victory}W/${tally.defeat}L/${tally.withdraw}D across 42 actions, ${crises} crises`);

// --- full cruises: prizes, refits, captains, hands, escalation ---
const cruises = { made: 0, flagLost: 0 };
let prizesTaken = 0, maxSquadron = 3;
for (let run = 0; run < 8; run++) {
  W.Fleet.startCampaign();
  let guard = 0;
  while (guard++ < 12) {
    W.Fleet.applyPreset(W.pick(Object.keys(W.Fleet.PRESETS)));
    W.Fleet.begin();
    let t = 0;
    while (!W.Fleet.result && t < 600) {
      W.Fleet.tick(0.1);
      if (W.Fleet.pendingCrisis) {
        W.Fleet.startCrisis();
        W.player.rooms.forEach(r => { r.fire = 0; r.breach = false; });
        W.Fleet.crisisTick(0.1);
      }
      t += 0.1;
    }
    const s = W.Fleet.summary;
    assert.ok(s, 'cruise action had no summary');
    if (s.flagLost) { cruises.flagLost++; break; }
    if (s.win && s.finalStage) { cruises.made++; break; }
    // a sensible commodore's refit, automated
    W.Fleet.settleAction();
    const c = W.Fleet.campaign;
    while (s.prizeShips.length) {
      const cls = s.prizeShips.shift();
      if (W.Fleet.ships.length < 4 && c.captains.length && W.Fleet.takePrize(cls)) prizesTaken++;
      else W.Fleet.sellPrize(cls);
    }
    maxSquadron = Math.max(maxSquadron, W.Fleet.ships.length);
    if (c.lieutenantOffer && c.gold >= 60) W.Fleet.hireLieutenant();
    while (c.gold >= 30 && c.hands < 60) W.Fleet.hireHands(10);
    for (const sh of W.Fleet.ships) {
      while (c.gold >= 10 && sh.hull < sh.hullMax) { if (!W.Fleet.repairShip(sh, 5)) break; }
      while (c.gold >= 8 && sh.guns < sh.gunsMax) { if (!W.Fleet.remountGun(sh)) break; }
      while (c.hands > 0 && sh.hands < sh.complement) { if (!W.Fleet.moveHands(sh, 10)) break; }
    }
    assert.ok(c.actionOptions && c.actionOptions.length >= 1, 'no assignments offered');
    const battleIdx = c.actionOptions.findIndex(o => o.type === 'battle');
    assert.ok(battleIdx >= 0, 'no battle assignment offered');
    assert.strictEqual(W.Fleet.chooseAction(battleIdx), 'battle');
  }
  W.Fleet.close();
}
assert.ok(cruises.made + cruises.flagLost === 8, 'every cruise must end');
assert.ok(prizesTaken > 0, 'no prize was ever taken into service');
console.log(`cruises: ${cruises.made} made / ${cruises.flagLost} flag lost; ` +
  `${prizesTaken} prizes taken into service; biggest squadron ${maxSquadron}`);
console.log('\nFLEET SMOKE TEST PASSED');
