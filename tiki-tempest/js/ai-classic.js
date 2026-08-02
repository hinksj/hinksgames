// TIKI TEMPEST — AI bartender. Heuristic: chase the cheapest reachable menu
// cocktail, shelve beers opportunistically, use specials when they help.
(function (G) {
  'use strict';
  var E = G.engineClassic, data = G.data, CARDS;

  // how much closer does bar+hand get to each menu recipe; value ingredients
  // by how many menu recipes still miss them
  function missing(st, p, recId) {
    var r = CARDS[recId], have = {};
    p.bar.forEach(function (id) { have[CARDS[id].ing] = (have[CARDS[id].ing] || 0) + 1; });
    var miss = {}, total = 0;
    Object.keys(r.needs).forEach(function (ing) {
      var m = Math.max(0, r.needs[ing] - (have[ing] || 0));
      if (m) { miss[ing] = m; total += m; }
    });
    return { miss: miss, total: total };
  }
  function ingValue(st, p, ing) {
    var v = 0;
    st.menu.forEach(function (recId) {
      var m = missing(st, p, recId);
      if (m.miss[ing]) v += (CARDS[recId].pts / Math.max(1, m.total));
    });
    return v;
  }
  function targetRecipe(st, p) {
    // recipe with best pts per missing card, using bar + hand as resources
    var best = null, bestScore = -1;
    st.menu.forEach(function (recId) {
      var r = CARDS[recId], have = {};
      p.bar.concat(p.hand).forEach(function (id) {
        if (CARDS[id].kind === 'ing') have[CARDS[id].ing] = (have[CARDS[id].ing] || 0) + 1;
      });
      var need = 0;
      Object.keys(r.needs).forEach(function (ing) {
        need += Math.max(0, r.needs[ing] - (have[ing] || 0));
      });
      var score = r.pts / (need + 1);
      if (score > bestScore) { bestScore = score; best = recId; }
    });
    return best;
  }
  function worstHandCard(st, p, hand) {
    var worst = null, wv = Infinity;
    hand.forEach(function (id) {
      var c = CARDS[id], v;
      if (c.kind === 'ing') v = 1 + ingValue(st, p, c.ing);
      else if (c.kind === 'beer') v = 1.5;
      else v = c.fx === 'double' ? 3.5 : 2.5;
      if (v < wv) { wv = v; worst = id; }
    });
    return worst;
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
        return { t: 'resolve', target: bi };
      }
      case 'seagull': {
        var pick = null, pv = -1;
        st.players.forEach(function (pl) {
          if (pl.umbrellas.length) return;
          pl.bar.forEach(function (id) {
            var v = ingValue(st, by, CARDS[id].ing) + (pl.i === pend.by ? -0.5 : 0.5);
            if (v > pv) { pv = v; pick = { player: pl.i, card: id }; }
          });
        });
        if (!pick) return null;
        return { t: 'resolve', player: pick.player, card: pick.card };
      }
      case 'demand': {
        var rec = targetRecipe(st, by);
        var wantIng = 'rum';
        if (rec) {
          var m = missing(st, by, rec);
          var keys = Object.keys(m.miss);
          if (keys.length) wantIng = keys[0];
        }
        var richest = -1, ri = -1;
        st.players.forEach(function (pl) {
          if (pl.i === pend.by) return;
          if (pl.hand.length > richest) { richest = pl.hand.length; ri = pl.i; }
        });
        return { t: 'resolve', target: ri, ing: wantIng };
      }
      case 'torch': {
        var keep = null, kv = -1;
        pend.cards.forEach(function (id) {
          var c = CARDS[id];
          var v = c.kind === 'ing' ? 1 + ingValue(st, by, c.ing) : (c.kind === 'beer' ? 1.5 : 2.5);
          if (v > kv) { kv = v; keep = id; }
        });
        return { t: 'resolve', keep: keep };
      }
      case 'handOver':
        return { t: 'resolve' };
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

  function decide(st) {
    CARDS = E.CARDS;
    if (st.pending) return resolvePending(st);
    if (st.phase === 'roundEnd') return { t: 'nextRound' };
    if (st.phase === 'draw') return { t: 'draw' };

    var p = st.players[st.turn];

    // serve everything we can (free) — use a Double on 6-pointers
    for (var mi = 0; mi < st.menu.length; mi++) {
      if (E.canServe(st, p, st.menu[mi])) {
        var hasDouble = p.hand.some(function (id) { return CARDS[id].fx === 'double'; });
        return { t: 'serve', recipe: st.menu[mi],
          double: hasDouble && CARDS[st.menu[mi]].pts >= 6 };
      }
    }

    if (st.playsLeft > 0) {
      // umbrella if bar is worth protecting
      var umb = p.hand.filter(function (id) { return CARDS[id].fx === 'umbrella'; })[0];
      if (umb && p.bar.length >= 2 && p.umbrellas.length < 2) return { t: 'special', card: umb };
      // most valuable ingredient toward the target recipe
      var rec = targetRecipe(st, p);
      var bestIng = null, bv = 0;
      p.hand.forEach(function (id) {
        if (CARDS[id].kind !== 'ing') return;
        var v = ingValue(st, p, CARDS[id].ing);
        if (v > bv) { bv = v; bestIng = id; }
      });
      if (bestIng && bv > 0.4) return { t: 'stock', card: bestIng };
      // offensive/utility specials
      var order = ['seagull', 'demand', 'torch', 'plunder', 'breeze', 'lastcall', 'tidal'];
      for (var oi = 0; oi < order.length; oi++) {
        var fx = order[oi];
        if (fx === 'lastcall') {
          // call it when leading
          var meTot = p.score + p.roundScore, lead = true;
          st.players.forEach(function (pl) {
            if (pl.i !== p.i && pl.score + pl.roundScore >= meTot) lead = false;
          });
          if (!lead) continue;
        }
        if (fx === 'tidal' && p.hand.length < 3) continue;
        var sp = p.hand.filter(function (id) { return CARDS[id].fx === fx; })[0];
        if (sp) return { t: 'special', card: sp };
      }
      // beer, then any ingredient at all
      var beer = p.hand.filter(function (id) { return CARDS[id].kind === 'beer'; })[0];
      if (beer) return { t: 'beer', card: beer };
      if (bestIng) return { t: 'stock', card: bestIng };
      var anyIng = p.hand.filter(function (id) { return CARDS[id].kind === 'ing'; })[0];
      if (anyIng) return { t: 'stock', card: anyIng };
    }
    return { t: 'endTurn' };
  }

  G.aiClassic = { decide: decide };
}(typeof window !== 'undefined' ? (window.TT = window.TT || {}) : (module.exports = require('./engine-classic.js'))));
