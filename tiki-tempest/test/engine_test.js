// Headless smoke test for BOTH modes: node test/engine_test.js
'use strict';
var path = require('path');
var C = require(path.join(__dirname, '..', 'js', 'ai-classic.js'));
var D = require(path.join(__dirname, '..', 'js', 'ai-draft.js'));
var data = C.data;
var CARDS = data.CARDS;

var failures = 0;
function ok(cond, msg) {
  if (!cond) { failures++; console.error('FAIL: ' + msg); }
}

ok(data.MAIN_DECK.length === 135, 'printed deck is 135');
ok(data.DECKS.stocked.length === 121, 'stocked deck is 121, got ' + data.DECKS.stocked.length);
ok(data.RECIPE_DECK.length === 22, 'recipe deck is 22');

function conserved(st) {
  var n = st.deck.length + st.discard.length + st.removed.length;
  st.players.forEach(function (p) {
    n += p.hand.length + p.bar.length + p.beers.length + (p.banked ? p.banked.length : 0);
    if (p.umbrella) n++;
  });
  if (st.pending && st.pending.type === 'torch') n += st.pending.cards.length;
  if (st.mode === 'draft' && st.picks) {
    // picks stay in hands until reveal; nothing extra to count
  }
  var recipes = st.menu.length + st.recipeDeck.length + (st.recipeSpent || []).length +
    st.players.reduce(function (s, p) { return s + p.served.length; }, 0);
  return n === st.deckIds.length && recipes === 22;
}

function playGame(engine, ai, nPlayers, seed, deckIds, label) {
  var st = engine.newGame({
    seed: seed, rounds: 2, deckIds: deckIds,
    names: Array.from({ length: nPlayers }, function (_, i) {
      return { name: 'Bot' + i, isAI: true };
    })
  });
  var steps = 0;
  while (st.phase !== 'gameEnd') {
    var a = ai.decide(st);
    ok(a, label + ': AI action exists (seed ' + seed + ' phase ' + st.phase + ')');
    if (!a) return null;
    try {
      engine.apply(st, a);
    } catch (e) {
      ok(false, label + ': apply threw ' + e.message + ' on ' + JSON.stringify(a) + ' (seed ' + seed + ')');
      return null;
    }
    if (!conserved(st)) {
      ok(false, label + ': conservation (seed ' + seed + ', step ' + steps + ')');
      return null;
    }
    steps++;
    if (steps > 50000) { ok(false, label + ': no termination (seed ' + seed + ')'); return null; }
  }
  ok(st.winner >= 0, label + ': winner declared');
  return { served: st.players.reduce(function (s, p) { return s + p.servedTotal; }, 0) };
}

[['classic', C.engineClassic, C.aiClassic], ['draft', D.engineDraft, D.aiDraft]].forEach(function (mode) {
  var games = 0, served = 0;
  [2, 3, 4, 5].forEach(function (n) {
    for (var seed = 1; seed <= 15; seed++) {
      var deck = seed % 3 === 0 ? data.DECKS.stocked : data.DECKS.printed;
      var r = playGame(mode[1], mode[2], n, seed * 131 + n, deck, mode[0]);
      if (r) { games++; served += r.served; }
    }
  });
  console.log(mode[0] + ': ' + games + ' games, avg cocktails ' + (served / games).toFixed(1));
});

if (failures) { console.error(failures + ' FAILURES'); process.exit(1); }
console.log('ALL PASS');
