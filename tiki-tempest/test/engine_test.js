// Headless smoke test: node test/engine_test.js
'use strict';
var path = require('path');
var M = require(path.join(__dirname, '..', 'js', 'ai.js'));
var E = M.engine, data = M.data, ai = M.ai;
var CARDS = data.CARDS;

var failures = 0;
function ok(cond, msg) {
  if (!cond) { failures++; console.error('FAIL: ' + msg); }
}

ok(data.MAIN_DECK.length === 135, 'main deck is 135, got ' + data.MAIN_DECK.length);
ok(data.RECIPE_DECK.length === 22, 'recipe deck is 22, got ' + data.RECIPE_DECK.length);

// conservation within a round: every main-deck card is in exactly one zone
function conserved(st) {
  var n = st.deck.length + st.discard.length + st.removed.length;
  st.players.forEach(function (p) {
    n += p.hand.length + p.bar.length + p.beers.length;
    if (p.umbrella) n++;
  });
  if (st.pending && st.pending.type === 'torch') n += st.pending.cards.length;
  var recipes = st.menu.length + st.recipeDeck.length +
    st.players.reduce(function (s, p) { return s + p.servedTotal; }, 0);
  return n === 135 && recipes === 22;
}

function playGame(nPlayers, seed, rounds) {
  var st = E.newGame({
    seed: seed, rounds: rounds,
    names: Array.from({ length: nPlayers }, function (_, i) {
      return { name: 'Bot' + i, isAI: true };
    })
  });
  var steps = 0;
  while (st.phase !== 'gameEnd') {
    var a = ai.decide(st);
    ok(a, 'AI action exists (seed ' + seed + ' phase ' + st.phase + ' pending ' +
      JSON.stringify(st.pending && st.pending.type) + ')');
    if (!a) return null;
    try {
      E.apply(st, a);
    } catch (e) {
      ok(false, 'apply threw: ' + e.message + ' on ' + JSON.stringify(a) + ' (seed ' + seed + ')');
      return null;
    }
    ok(conserved(st), 'conservation (seed ' + seed + ', step ' + steps + ')');
    if (!conserved(st)) return null;
    steps++;
    if (steps > 50000) { ok(false, 'no termination (seed ' + seed + ')'); return null; }
  }
  ok(st.winner >= 0, 'winner declared (seed ' + seed + ')');
  var served = st.players.reduce(function (s, p) { return s + p.servedTotal; }, 0);
  return { steps: steps, rounds: st.round, served: served,
    scores: st.players.map(function (p) { return p.score; }) };
}

var games = 0, totalServed = 0, totalRounds = 0;
[2, 3, 4, 5].forEach(function (n) {
  for (var seed = 1; seed <= 25; seed++) {
    var r = playGame(n, seed * 131 + n, 2);
    if (r) { games++; totalServed += r.served; totalRounds += r.rounds; }
  }
});
console.log('games completed: ' + games + ' (avg cocktails served ' +
  (totalServed / games).toFixed(1) + ', avg rounds ' + (totalRounds / games).toFixed(1) + ')');
if (failures) { console.error(failures + ' FAILURES'); process.exit(1); }
console.log('ALL PASS');
