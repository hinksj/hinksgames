// Simulation report: plays full cruises under two policies and prints what
// the data says about balance, crises, economy, and skill expression.
// Run: node test/sim_report.js [cruisesPerPolicy]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ctx = { console };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['util.js', 'data.js', 'model.js', 'combat.js', 'fleet.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), ctx, { filename: f });
}
const W = ctx.W;
const N = +(process.argv[2] || 30);

function greedyOrders() {
  const F = W.Fleet;
  const assigned = {};
  F.ships.forEach(ship => {
    let best = null;
    F.enemy.forEach((foe, ti) => {
      if (foe.struck || foe.sunk) return;
      const herTac = foe.intel && foe.order ? foe.order.tactic : 'engage';
      const hers = F.throwWeight(foe, herTac);
      for (const tac of ['engage', 'cut', 'range', 'board']) {
        const ratio = F.throwWeight(Object.assign({}, ship, { order: { tactic: tac, target: ti } }), tac) /
          Math.max(0.01, hers);
        let score = ratio;
        if (tac === 'board') {
          score += foe.morale <= 60 ? 0.5 : -0.25;
          if (ship.captain.trait === 'boarder' && ship.captain.alive) score += 0.4;
        }
        if (tac === 'cut') score += hers > F.throwWeight(ship, 'engage') * 1.15 ? 0.35 : -0.15;
        if (tac === 'range') score += ratio < 0.7 ? 0.55 : -0.35;
        if (assigned[ti]) score += 0.25; // doubling pays
        // the finale plan, as any gunroom knows it
        if (foe.isEnemyFlag) {
          const escortsUp = F.enemy.some(e => !e.isEnemyFlag && !e.struck && !e.sunk);
          if (escortsUp) score -= 0.6;          // break the escorts first
          if (tac === 'cut') score += 0.45;     // she cannot punish the approach
          if (tac === 'board') score -= 1.0;    // her sides are a cliff
        }
        if (best === null || score > best.score) best = { score, tac, ti };
      }
    });
    if (best) {
      ship.order = { tactic: best.tac, target: best.ti };
      assigned[best.ti] = true;
    }
  });
  F.planName = 'Greedy Orders';
}

function clearCrisis() {
  W.player.rooms.forEach(r => { r.fire = 0; r.breach = false; r.water = 0; });
  W.player.intruders.forEach(c => { c.hp = 0; });
  Object.values(W.player.systems).forEach(s => { s.damage = 0; });
}

function runCruise(policy) {
  const F = W.Fleet;
  const out = {
    result: null, deathStage: 0, actions: 0, crises: [], prizesTaken: 0,
    prizesSold: 0, goldEnd: 0, withdraws: 0, maxSquadron: 3, distinguished: 0,
  };
  F.startCampaign();
  let guard = 0;
  while (guard++ < 14) {
    if (policy === 'greedy') greedyOrders();
    else F.applyPreset(W.pick(Object.keys(F.PRESETS)));
    F.begin();
    out.actions++;
    let t = 0;
    let hoisted = false;
    while (!F.result && t < 600) {
      F.tick(0.1);
      if (policy === 'greedy' && !hoisted && F.round >= 8 &&
          F.alive(F.ships).length < F.alive(F.enemy).length && F.signals > 0) {
        F.hoist('breakoff');
        hoisted = true;
        out.withdraws++;
      }
      if (F.pendingCrisis) {
        const kind = F.crisisKind;
        F.startCrisis();
        // the sim's damage party is competent but not perfect
        if (Math.random() < 0.8) clearCrisis();
        let ct = 0;
        while (F.phase === 'crisis' && ct < 700) { F.crisisTick(0.1); ct += 0.1; }
        out.crises.push({ kind, outcome: F.lastCrisisOutcome });
      }
      t += 0.1;
    }
    const s = F.summary;
    if (!s) break;
    if (s.stage >= F.STAGES.length) {
      out.finaleAttempts = (out.finaleAttempts || 0) + 1;
      if (s.win) out.finaleWins = (out.finaleWins || 0) + 1;
    }
    if (s.flagLost) { out.result = 'lost'; out.deathStage = s.stage; break; }
    if (s.win && s.finalStage) { out.result = 'made'; break; }
    F.settleAction();
    const c = F.campaign;
    while (s.prizeShips.length) {
      const cls = s.prizeShips.shift();
      if (F.ships.length < 4 && c.captains.length && F.takePrize(cls)) out.prizesTaken++;
      else { F.sellPrize(cls); out.prizesSold++; }
    }
    out.maxSquadron = Math.max(out.maxSquadron, F.ships.length);
    if (c.lieutenantOffer && c.gold >= 60) F.hireLieutenant();
    while (c.gold >= 30 && c.hands < 60) F.hireHands(10);
    for (const sh of F.ships) {
      while (c.gold >= 10 && sh.hull < sh.hullMax) { if (!F.repairShip(sh, 5)) break; }
      while (c.gold >= 8 && sh.guns < sh.gunsMax) { if (!F.remountGun(sh)) break; }
      while (c.hands > 0 && sh.hands < sh.complement) { if (!F.moveHands(sh, 10)) break; }
    }
    if (policy === 'greedy') {
      for (const sh of F.ships) {
        while (c.gold >= 90) { if (!F.buyGun(sh)) break; } // keep a reserve, arm up
      }
    }
    // storm passage when the squadron is battered and it's offered
    const avgHull = F.ships.reduce((a, sh) => a + sh.hull / sh.hullMax, 0) / F.ships.length;
    const stormIdx = c.actionOptions.findIndex(o => o.type === 'storm');
    let choice = c.actionOptions.findIndex(o => o.type === 'battle');
    if (policy === 'greedy' && avgHull < 0.5 && stormIdx >= 0) choice = stormIdx;
    const outc = F.chooseAction(choice);
    if (outc === 'stormcrisis') {
      const kind = F.crisisKind;
      F.startCrisis();
      if (Math.random() < 0.8) clearCrisis();
      let ct = 0;
      while (F.phase === 'crisis' && ct < 700) { F.crisisTick(0.1); ct += 0.1; }
      out.crises.push({ kind, outcome: F.lastCrisisOutcome });
      F.pendingRefitReturn = false;
      if (F.phase === 'done') { out.result = 'lost'; out.deathStage = F.campaign.stage; break; }
    }
  }
  out.goldEnd = F.campaign ? F.campaign.gold : 0;
  out.distinguished = F.ships.filter(sh => sh.captain.distinguished).length;
  if (!out.result) out.result = 'stalled';
  F.close();
  return out;
}

for (const policy of ['random', 'greedy']) {
  const runs = [];
  for (let i = 0; i < N; i++) runs.push(runCruise(policy));
  const made = runs.filter(r => r.result === 'made').length;
  const lost = runs.filter(r => r.result === 'lost').length;
  const deaths = {};
  runs.forEach(r => { if (r.deathStage) deaths[r.deathStage] = (deaths[r.deathStage] || 0) + 1; });
  const crisisKinds = {}, crisisOutcomes = {};
  let cruisesWithCrisis = 0, totalCrises = 0;
  runs.forEach(r => {
    if (r.crises.length) cruisesWithCrisis++;
    totalCrises += r.crises.length;
    r.crises.forEach(cr => {
      crisisKinds[cr.kind] = (crisisKinds[cr.kind] || 0) + 1;
      crisisOutcomes[cr.outcome] = (crisisOutcomes[cr.outcome] || 0) + 1;
    });
  });
  const avg = (f) => (runs.reduce((a, r) => a + f(r), 0) / runs.length).toFixed(1);
  console.log(`\n=== POLICY: ${policy.toUpperCase()} (${N} cruises) ===`);
  console.log(`cruises made: ${made} (${Math.round(100 * made / N)}%) · squadron lost: ${lost} · death stages: ${JSON.stringify(deaths)}`);
  console.log(`actions fought (avg): ${avg(r => r.actions)} · withdraws used: ${runs.reduce((a, r) => a + r.withdraws, 0)}`);
  console.log(`crises: ${totalCrises} total · avg/cruise ${avg(r => r.crises.length)} · cruises with ≥1: ${Math.round(100 * cruisesWithCrisis / N)}%`);
  console.log(`  kinds: ${JSON.stringify(crisisKinds)}`);
  console.log(`  outcomes: ${JSON.stringify(crisisOutcomes)}`);
  console.log(`prizes: taken ${avg(r => r.prizesTaken)}/cruise, sold ${avg(r => r.prizesSold)} · max squadron seen: ${Math.max(...runs.map(r => r.maxSquadron))}`);
  console.log(`gold at end (avg): ${avg(r => r.goldEnd)} · distinguished captains (avg): ${avg(r => r.distinguished)}`);
  const fa = runs.reduce((a, r) => a + (r.finaleAttempts || 0), 0);
  const fw = runs.reduce((a, r) => a + (r.finaleWins || 0), 0);
  console.log(`finale actions: ${fa} fought, ${fw} won (${fa ? Math.round(100 * fw / fa) : 0}%)`);
}
console.log('\nSIM REPORT COMPLETE');
