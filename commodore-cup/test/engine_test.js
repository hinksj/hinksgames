// Headless smoke test: node test/engine_test.js
// Unit-checks meld rules, then plays full AI-vs-AI games at 2/3/4/6 seats
// across many seeds, asserting card conservation and termination throughout.
'use strict';
var path = require('path');
var M = require(path.join(__dirname, '..', 'js', 'ai.js'));
var E = M.engine, data = M.data, ai = M.ai;
var CARDS = data.CARDS;

var failures = 0;
function ok(cond, msg) {
  if (!cond) { failures++; console.error('FAIL: ' + msg); }
}

// ---- meld rules ----
ok(E.meldType(['party-A', 'yacht-A', 'cocktail-A']) === 'set', 'set of 3 letters');
ok(E.meldType(['party-A', 'yacht-A', 'cocktail-A', 'cruise-A']) === 'set', 'set of 4');
ok(E.meldType(['party-A', 'yacht-A', 'party-B']) === null, 'mixed letters no set');
ok(E.meldType(['party-A', 'party-B', 'party-C']) === 'run', 'run A-B-C');
ok(E.meldType(['party-C', 'party-A', 'party-B']) === 'run', 'run out of order');
ok(E.meldType(['party-K', 'party-L', 'party-A']) === null, 'no wraparound');
ok(E.meldType(['party-A', 'yacht-B', 'party-C']) === null, 'mixed suit no run');
ok(E.meldType(['party-A', 'party-B']) === null, 'two cards insufficient');

// ---- deck composition ----
ok(data.CLUB_DECK.length === 59, 'club deck is 59');
ok(data.MEMBER_DECK.length === 25, 'member deck is 25');
ok(Object.keys(CARDS).length === 84, '84 cards total');

// ---- conservation check ----
function conserved(st) {
  var club = 0, mem = 0;
  st.players.forEach(function (p) {
    club += p.hand.length + p.played.length;
    mem += p.members.length;
  });
  st.melds.forEach(function (m) { club += m.cards.length; });
  club += st.drawPile.length + st.discard.length;
  if (st.pending && st.pending.type === 'gossip') club += st.pending.cards.length;
  mem += st.memberPile.length;
  return club === 59 && mem === 25;
}

// ---- full games ----
function playGame(nPlayers, seed) {
  var st = E.newGame({
    seed: seed, target: 50,
    names: Array.from({ length: nPlayers }, function (_, i) {
      return { name: 'Bot' + i, isAI: true };
    })
  });
  var steps = 0;
  while (st.phase !== 'gameEnd') {
    var a = ai.decide(st);
    ok(a, 'AI produced an action (seed ' + seed + ', step ' + steps + ', phase ' + st.phase + ')');
    if (!a) return null;
    try {
      E.apply(st, a);
    } catch (e) {
      ok(false, 'apply threw: ' + e.message + ' on ' + JSON.stringify(a) +
        ' (seed ' + seed + ', phase ' + st.phase + ', pending ' + JSON.stringify(st.pending) + ')');
      return null;
    }
    ok(conserved(st), 'cards conserved (seed ' + seed + ', step ' + steps + ')');
    steps++;
    if (steps > 100000) { ok(false, 'game did not terminate (seed ' + seed + ')'); return null; }
  }
  ok(st.winner >= 0, 'winner declared');
  ok(st.players[st.winner].score >= 50, 'winner reached target');
  ok(st.players[st.winner].supporters >= data.MEMBERS_TO_WIN, 'winner has club support');
  return { steps: steps, rounds: st.round, winner: st.winner,
    scores: st.players.map(function (p) { return p.score; }) };
}

var games = 0, totalRounds = 0;
[2, 3, 4, 6].forEach(function (n) {
  for (var seed = 1; seed <= 25; seed++) {
    var r = playGame(n, seed * 1000 + n);
    if (r) { games++; totalRounds += r.rounds; }
  }
});

console.log('meld rules, deck composition, conservation: checked');
console.log('full games completed: ' + games + ' (avg rounds ' + (totalRounds / games).toFixed(1) + ')');
if (failures) { console.error(failures + ' FAILURES'); process.exit(1); }
console.log('ALL PASS');
