// TIKI TEMPEST — AI bartender for draft mode. Values each pass-by card
// against the shared menu, serves greedily, banks doubles for the rares.
(function (G) {
  'use strict';
  var E = G.engineDraft, data = G.data, CARDS;

  function ingValue(st, p, ing) {
    var v = 0, have = {};
    p.bar.forEach(function (id) { have[CARDS[id].ing] = (have[CARDS[id].ing] || 0) + 1; });
    st.menu.forEach(function (recId) {
      var r = CARDS[recId], missTotal = 0, missThis = 0;
      Object.keys(r.needs).forEach(function (k) {
        var m = Math.max(0, r.needs[k] - (have[k] || 0));
        missTotal += m;
        if (k === ing) missThis = m;
      });
      if (missThis) v += r.pts / Math.max(1, missTotal);
    });
    return v;
  }
  function beerRank(st, p) {
    var mine = p.beers.length, most = 0;
    st.players.forEach(function (pl) { if (pl.i !== p.i) most = Math.max(most, pl.beers.length); });
    return mine <= most ? 1.6 : 0.9; // chase the pudding when behind
  }
  function cardValue(st, p, id) {
    var c = CARDS[id];
    if (c.kind === 'ing') return 0.6 + ingValue(st, p, c.ing) + (c.rare ? 0.3 : 0);
    if (c.kind === 'beer') return beerRank(st, p);
    switch (c.fx) {
      case 'seagull': {
        var target = st.players.some(function (pl) { return pl.i !== p.i && pl.bar.length && !pl.umbrella; });
        return target ? 2.1 : 0.5;
      }
      case 'umbrella': return p.bar.length >= 2 && !p.umbrella ? 1.9 : 1.1;
      case 'double': return p.banked.some(function (b) { return CARDS[b].fx === 'double'; }) ? 0.8 : 2.2;
      case 'demand': return p.banked.some(function (b) { return CARDS[b].fx === 'demand'; }) ? 0.6 : 1.9;
      case 'breeze': return 1.6;
      case 'torch': return st.deck.length ? 1.7 : 0.3;
      case 'plunder': return 1.7;
      case 'tidal': return 1.0;
      case 'lastcall': {
        var lead = true, me = p.score + p.roundScore;
        st.players.forEach(function (pl) {
          if (pl.i !== p.i && pl.score + pl.roundScore >= me) lead = false;
        });
        return lead ? 3.2 : 0.4;
      }
    }
    return 1;
  }
  function worstHandCard(st, p, hand) {
    var worst = null, wv = Infinity;
    hand.forEach(function (id) {
      var v = cardValue(st, p, id);
      if (v < wv) { wv = v; worst = id; }
    });
    return worst;
  }
  function bestOf(st, p, ids) {
    var best = null, bv = -1;
    ids.forEach(function (id) {
      var v = cardValue(st, p, id);
      if (v > bv) { bv = v; best = id; }
    });
    return { card: best, value: bv };
  }

  function resolvePending(st) {
    var pend = st.pending;
    var by = st.players[pend.by];
    switch (pend.type) {
      case 'chooseTarget': { // plunder
        var best = -1, bi = -1;
        st.players.forEach(function (pl) {
          if (pl.i === pend.by || !pl.hand.length) return;
          if (pl.hand.length > best) { best = pl.hand.length; bi = pl.i; }
        });
        return bi >= 0 ? { t: 'resolve', target: bi } : null;
      }
      case 'seagull': {
        var pick = null, pv = -1;
        st.players.forEach(function (pl) {
          if (pl.umbrella) return;
          pl.bar.forEach(function (id) {
            var v = ingValue(st, by, CARDS[id].ing) + (pl.i === pend.by ? -0.5 : 0.5);
            if (v > pv) { pv = v; pick = { player: pl.i, card: id }; }
          });
        });
        return pick ? { t: 'resolve', player: pick.player, card: pick.card } : null;
      }
      case 'torch':
        return { t: 'resolve', keep: bestOf(st, by, pend.cards).card };
      case 'passAll': {
        for (var i = 0; i < st.players.length; i++) {
          if (pend.need[i] && pend.chosen[i] === undefined) {
            return { t: 'resolve', player: i, card: worstHandCard(st, st.players[i], st.players[i].hand) };
          }
        }
        return null;
      }
    }
    return null;
  }

  // decide for the first AI seat that owes input (humans act via clicks)
  function decide(st) {
    CARDS = E.CARDS;
    if (st.pending) return resolvePending(st);
    if (st.phase === 'roundEnd') return { t: 'nextRound' };
    if (st.phase !== 'pick') return null;

    for (var i = 0; i < st.players.length; i++) {
      var p = st.players[i];
      if (!p.isAI || !p.hand.length || st.picks[p.i] !== undefined) continue;
      // serve everything possible before picking
      for (var mi = 0; mi < st.menu.length; mi++) {
        if (E.canServe(st, p, st.menu[mi])) {
          var hasDouble = p.banked.some(function (id) { return CARDS[id].fx === 'double'; });
          return { t: 'serve', seat: p.i, recipe: st.menu[mi],
            double: hasDouble && CARDS[st.menu[mi]].pts >= 6 };
        }
      }
      var first = bestOf(st, p, p.hand);
      var action = { t: 'pick', seat: p.i, card: first.card };
      // spend a banked Guest Bartender when two strong cards pass by together
      var hasGB = p.banked.some(function (id) { return CARDS[id].fx === 'demand'; });
      if (hasGB && p.hand.length >= 3) {
        var rest = p.hand.filter(function (id) { return id !== first.card; });
        var second = bestOf(st, p, rest);
        if (second.value >= 1.8 && first.value >= 1.8) action.second = second.card;
      }
      return action;
    }
    return null;
  }

  G.aiDraft = { decide: decide };
}(typeof window !== 'undefined' ? (window.TT = window.TT || {}) : (module.exports = require('./engine-draft.js'))));
