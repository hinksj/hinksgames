// TIKI TEMPEST — pure game engine, v2: Sushi Go-style simultaneous draft.
// Everyone picks one card from their hand, all reveal at once, hands pass on.
// All change through E.apply(state, action); decisions surface as state.pending.
(function (G) {
  'use strict';
  var data = G.data || (typeof require !== 'undefined' && require('./data.js').data);
  var CARDS = data.CARDS;

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function rnd(st) {
    st._rndCalls++;
    return mulberry32(st.seed + st.round * 7919 + st._rndCalls * 104729)();
  }
  function shuffleSt(st, arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd(st) * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function log(st, msg) {
    st.log.push(msg);
    if (st.log.length > 250) st.log.shift();
  }

  function handSize(st) { return Math.max(6, st.handBase - st.players.length); }

  function newGame(opts) {
    var st = {
      mode: 'draft',
      deckIds: opts.deckIds || data.MAIN_DECK,
      handBase: opts.handBase || data.HAND_BASE,
      passes: opts.passes || data.PASSES_PER_ROUND,
      seed: opts.seed || Math.floor(Math.random() * 1e9),
      rounds: opts.rounds || data.ROUNDS_DEFAULT,
      round: 0, finalRound: false,
      players: opts.names.map(function (p, i) {
        return { i: i, name: p.name, isAI: !!p.isAI,
          hand: [], bar: [], beers: [], served: [], banked: [], umbrella: null,
          score: 0, roundScore: 0, servedTotal: 0 };
      }),
      deck: [], discard: [], removed: [],
      recipeDeck: [], menu: [],
      phase: 'pick', dir: 1, picks: {}, fxQueue: [],
      pending: null, winner: -1, log: [], _rndCalls: 0
    };
    st.recipeDeck = shuffleSt(st, data.RECIPE_DECK.slice());
    for (var m = 0; m < data.MENU_SIZE; m++) st.menu.push(st.recipeDeck.pop());
    startRound(st);
    return st;
  }

  function startRound(st) {
    st.round++;
    st.dir = (st.round % 2 === 1) ? 1 : -1; // pass left, then right, alternating
    var out = {};
    st.removed.forEach(function (id) { out[id] = 1; });
    st.players.forEach(function (p) {
      p.beers.forEach(function (id) { out[id] = 1; });
      p.hand = []; p.bar = []; p.served = []; p.banked = []; p.umbrella = null;
      p.roundScore = 0;
    });
    st.deck = shuffleSt(st, st.deckIds.filter(function (id) { return !out[id]; }));
    st.discard = [];
    var hs = handSize(st);
    st.players.forEach(function (p) {
      for (var i = 0; i < hs; i++) p.hand.push(st.deck.pop());
      // printed on Storm Surge: if dealt, reshuffle into the bottom half, redraw
      for (var k = 0; k < p.hand.length; k++) {
        if (CARDS[p.hand[k]].fx === 'surge') {
          var surge = p.hand.splice(k, 1)[0];
          var pos = Math.floor(rnd(st) * Math.max(1, st.deck.length / 2));
          st.deck.splice(pos, 0, surge);
          p.hand.push(st.deck.pop());
          k--;
        }
      }
    });
    st.phase = 'pick'; st.picks = {}; st.fxQueue = []; st.pending = null;
    st.passCount = 0;
    log(st, '— Round ' + st.round + ' — hands pass to the ' + (st.dir === 1 ? 'left' : 'right') +
      (st.finalRound ? ' (LAST CALL)' : ''));
    autoPicks(st);
  }

  function removeFrom(arr, id) {
    var i = arr.indexOf(id);
    if (i < 0) throw new Error('card not there: ' + id);
    arr.splice(i, 1);
  }

  function refill(st) {
    if (st.deck.length || !st.discard.length) return;
    st.deck = shuffleSt(st, st.discard);
    st.discard = [];
    log(st, 'The discard pile is shuffled back into the stock.');
  }
  // draw from the leftover deck into `dest`; a surge strikes the round
  function drawFromDeck(st, dest, who) {
    if (!st.deck.length) refill(st);
    if (!st.deck.length) return false;
    var id = st.deck.pop();
    if (CARDS[id].fx === 'surge') {
      st.removed.push(id);
      log(st, '⛈ STORM SURGE surfaces' + (who ? ' on ' + who : '') + ' — the squall ends the round!');
      endRound(st, 'storm surge');
      return null; // round over
    }
    dest.push(id);
    return true;
  }

  // seats holding exactly one card have no choice — auto-commit it
  function autoPicks(st) {
    st.players.forEach(function (p) {
      if (p.hand.length === 1 && st.picks[p.i] === undefined) {
        st.picks[p.i] = { card: p.hand[0] };
      }
    });
    maybeReveal(st);
  }

  function allPicked(st) {
    return st.players.every(function (p) {
      return p.hand.length === 0 || st.picks[p.i] !== undefined;
    });
  }

  function maybeReveal(st) {
    if (st.phase !== 'pick' || st.pending || !allPicked(st)) return;
    if (st.players.every(function (p) { return p.hand.length === 0; })) {
      endRound(st, 'the hands are drunk dry');
      return;
    }
    // reveal all picks
    st.phase = 'reveal';
    var lines = st.players.filter(function (p) { return st.picks[p.i]; }).map(function (p) {
      var pk = st.picks[p.i];
      return p.name + ' keeps ' + CARDS[pk.card].name +
        (pk.second ? ' + ' + CARDS[pk.second].name : '');
    });
    log(st, '👐 ' + lines.join(' · '));
    // resolve picks in seat order, removing each from hand only as it resolves
    // (an early round end then leaves unresolved picks safely in hands)
    st.fxQueue = [];
    for (var i = 0; i < st.players.length; i++) {
      var p = st.players[i];
      var pk = st.picks[p.i];
      if (!pk) continue;
      removeFrom(p.hand, pk.card);
      resolveKeep(st, p, pk.card);
      if (st.phase === 'roundEnd' || st.phase === 'gameEnd') return;
      if (pk.second) {
        removeFrom(p.hand, pk.second);
        // the Guest Bartender goes back into the hand being passed on (chopsticks)
        var gb = p.banked.filter(function (id) { return CARDS[id].fx === 'demand'; })[0];
        if (gb) { removeFrom(p.banked, gb); p.hand.push(gb); }
        resolveKeep(st, p, pk.second);
        if (st.phase === 'roundEnd' || st.phase === 'gameEnd') return;
      }
    }
    st.picks = {};
    processQueue(st);
  }

  function resolveKeep(st, p, id) {
    var c = CARDS[id];
    if (c.kind === 'ing') { p.bar.push(id); return; }
    if (c.kind === 'beer') { p.beers.push(id); log(st, p.name + ' shelves a beer (' + p.beers.length + ')'); return; }
    // specials
    switch (c.fx) {
      case 'umbrella':
        if (p.umbrella) st.discard.push(p.umbrella);
        p.umbrella = id;
        log(st, p.name + "'s bar goes under the paper umbrella ☂️");
        return;
      case 'double':
      case 'demand': // Guest Bartender is banked: spend later to keep 2 cards at once
        p.banked.push(id);
        log(st, p.name + ' sets aside ' + c.name);
        return;
      case 'lastcall':
        st.discard.push(id);
        st.finalRound = true;
        log(st, '🔔 ' + p.name + ' rings LAST CALL — this round ends the night!');
        return;
      case 'breeze': {
        st.discard.push(id);
        for (var i = 0; i < st.players.length; i++) {
          var pl = st.players[(p.i + i) % st.players.length];
          for (var d = 0; d < 2; d++) {
            var r = drawFromDeck(st, pl.hand, pl.name);
            if (r === null) return; // surge ended the round
            if (r === false) { log(st, 'The leftover deck is empty.'); return; }
          }
        }
        log(st, '🌴 Island Breeze — every hand grows by 2.');
        return;
      }
      case 'seagull':
        st.discard.push(id);
        st.fxQueue.push({ type: 'seagull', by: p.i });
        return;
      case 'torch':
        st.discard.push(id);
        st.fxQueue.push({ type: 'torchStart', by: p.i });
        return;
      case 'plunder':
        st.discard.push(id);
        st.fxQueue.push({ type: 'plunder', by: p.i });
        return;
      case 'tidal':
        st.discard.push(id);
        st.fxQueue.push({ type: 'tidal', by: p.i });
        return;
      default:
        throw new Error('unknown keep ' + c.fx);
    }
  }

  function processQueue(st) {
    if (st.pending) return;
    while (st.fxQueue.length) {
      var fx = st.fxQueue.shift();
      if (startFx(st, fx)) return; // pending set (or round ended)
      if (st.phase === 'roundEnd' || st.phase === 'gameEnd') return;
    }
    // all effects done: pass the hands on
    passHands(st);
  }

  function startFx(st, fx) {
    var by = st.players[fx.by];
    switch (fx.type) {
      case 'seagull': {
        var any = st.players.some(function (pl) { return pl.bar.length && !pl.umbrella; });
        if (!any) { log(st, 'The seagull finds every bar covered — it flies off.'); return false; }
        st.pending = { type: 'seagull', by: fx.by };
        return true;
      }
      case 'torchStart': {
        var seen = [];
        for (var i = 0; i < 3; i++) {
          if (!st.deck.length) break;
          var t = st.deck.pop();
          if (CARDS[t].fx === 'surge') {
            st.removed.push(t);
            seen.forEach(function (sid) { st.discard.push(sid); });
            log(st, '⛈ The torchlight reveals STORM SURGE — the squall hits!');
            endRound(st, 'storm surge');
            return true;
          }
          seen.push(t);
        }
        if (!seen.length) { log(st, 'The torch gutters — the deck is spent.'); return false; }
        st.pending = { type: 'torch', by: fx.by, cards: seen };
        return true;
      }
      case 'plunder': {
        var targets = st.players.filter(function (pl) { return pl.i !== fx.by && pl.hand.length; });
        if (!targets.length) { log(st, 'No hands worth plundering.'); return false; }
        st.pending = { type: 'chooseTarget', by: fx.by, then: 'plunder' };
        return true;
      }
      case 'tidal': {
        var need = st.players.map(function (pl) { return pl.hand.length > 0; });
        if (!need.some(Boolean)) return false;
        st.pending = { type: 'passAll', by: fx.by, need: need, chosen: {} };
        return true;
      }
    }
    return false;
  }

  function passHands(st) {
    st.passCount++;
    if (st.passCount >= st.passes) {
      endRound(st, 'closing time');
      return;
    }
    var hands = st.players.map(function (p) { return p.hand; });
    st.players.forEach(function (p) {
      // receive from the neighbor opposite the passing direction
      var src = (p.i - st.dir + st.players.length) % st.players.length;
      p.hand = hands[src];
    });
    // pass PLUS draw: every hand tops up by one from the stock, so picks
    // always offer a real choice (and Storm Surge can surface any pass)
    for (var i = 0; i < st.players.length; i++) {
      var r = drawFromDeck(st, st.players[i].hand, st.players[i].name);
      if (r === null) return; // surge struck
    }
    st.phase = 'pick';
    st.picks = {};
    autoPicks(st);
  }

  // ---------- serving (any time during the pick phase, free) ----------
  function canServe(st, p, recId) {
    var r = CARDS[recId];
    if (!r || r.kind !== 'recipe') return false;
    if (st.menu.indexOf(recId) < 0) return false;
    var have = {};
    p.bar.forEach(function (id) { have[CARDS[id].ing] = (have[CARDS[id].ing] || 0) + 1; });
    return Object.keys(r.needs).every(function (ing) { return (have[ing] || 0) >= r.needs[ing]; });
  }
  function serve(st, p, recId, useDouble) {
    var r = CARDS[recId];
    if (!canServe(st, p, recId)) throw new Error('cannot serve that cocktail');
    var doubleCard = null;
    if (useDouble) {
      doubleCard = p.banked.filter(function (id) { return CARDS[id].fx === 'double'; })[0];
      if (!doubleCard) throw new Error('no Make It a Double set aside');
    }
    Object.keys(r.needs).forEach(function (ing) {
      for (var n = 0; n < r.needs[ing]; n++) {
        var id = p.bar.filter(function (b) { return CARDS[b].ing === ing; })[0];
        removeFrom(p.bar, id);
        st.discard.push(id);
      }
    });
    removeFrom(st.menu, recId);
    if (st.recipeDeck.length) st.menu.push(st.recipeDeck.pop());
    var entry = { card: recId, pts: r.pts, doubled: false, umbrella: false };
    if (doubleCard) {
      removeFrom(p.banked, doubleCard);
      st.discard.push(doubleCard);
      entry.doubled = true;
      entry.pts *= 2;
    }
    if (p.umbrella) {
      entry.umbrella = true;
      entry.pts += 1;
      st.removed.push(p.umbrella);
      p.umbrella = null;
    }
    p.served.push(entry);
    p.servedTotal++;
    p.roundScore = p.served.reduce(function (n, e) { return n + e.pts; }, 0);
    log(st, p.name + ' serves a ' + r.name + ' for ' + entry.pts + ' points' +
      (entry.doubled ? ' — MAKE IT A DOUBLE!' : '') + (entry.umbrella ? ' (umbrella garnish)' : ''));
  }

  // ---------- round / game end ----------
  function endRound(st, why) {
    st.pending = null; st.fxQueue = []; st.picks = {};
    st.players.forEach(function (p) {
      p.roundScore = p.served.reduce(function (n, e) { return n + e.pts; }, 0);
      p.score += p.roundScore;
      if (p.umbrella) { st.discard.push(p.umbrella); p.umbrella = null; }
      while (p.banked.length) st.discard.push(p.banked.pop());
      while (p.hand.length) st.discard.push(p.hand.pop());
    });
    st.lastRoundWhy = why;
    log(st, 'Round ' + st.round + ' ends (' + why + ').');
    if (st.finalRound || st.round >= st.rounds) finishGame(st);
    else st.phase = 'roundEnd';
  }
  function beerBonus(st) {
    var counts = st.players.map(function (p) { return p.beers.length; });
    var most = Math.max.apply(null, counts), fewest = Math.min.apply(null, counts);
    return st.players.map(function (p) {
      var b = 0;
      if (most > 0 && p.beers.length === most) b += data.BEER_MOST;
      if (st.players.length > 2 && p.beers.length === fewest && fewest < most) b += data.BEER_FEWEST;
      return b;
    });
  }
  function finishGame(st) {
    var bonus = beerBonus(st);
    st.beerBonuses = bonus;
    st.players.forEach(function (p) { p.score += bonus[p.i]; });
    var top = st.players.slice().sort(function (a, b) {
      return b.score - a.score || b.servedTotal - a.servedTotal;
    });
    st.winner = top[0].i;
    st.phase = 'gameEnd';
    log(st, '🏆 ' + top[0].name + ' is Master Mixologist with ' + top[0].score + ' points!');
  }

  // ---------- actions ----------
  var handlers = {
    pick: function (st, a) {
      if (st.phase !== 'pick') throw new Error('not the pick phase');
      if (st.pending) throw new Error('resolve pending first');
      var p = st.players[a.seat];
      if (!p) throw new Error('bad seat');
      if (st.picks[p.i] !== undefined) throw new Error('already picked');
      if (p.hand.indexOf(a.card) < 0) throw new Error('card not in hand');
      var pk = { card: a.card };
      if (a.second !== undefined && a.second !== null) {
        var hasGB = p.banked.some(function (id) { return CARDS[id].fx === 'demand'; });
        if (!hasGB) throw new Error('no Guest Bartender set aside');
        if (p.hand.indexOf(a.second) < 0 || a.second === a.card) throw new Error('bad second card');
        pk.second = a.second;
      }
      st.picks[p.i] = pk;
      maybeReveal(st);
    },
    serve: function (st, a) {
      if (st.phase !== 'pick' && st.phase !== 'reveal') throw new Error('serve during the pick phase');
      var p = st.players[a.seat];
      if (!p) throw new Error('bad seat');
      serve(st, p, a.recipe, a.double);
    },
    nextRound: function (st) {
      if (st.phase !== 'roundEnd') throw new Error('round not over');
      startRound(st);
    },
    resolve: function (st, a) {
      var pend = st.pending;
      if (!pend) throw new Error('nothing pending');
      var keep = resolvers[pend.type](st, pend, a);
      if (!keep && st.pending === pend) st.pending = null;
      if (!st.pending && st.phase !== 'roundEnd' && st.phase !== 'gameEnd') processQueue(st);
    }
  };

  var resolvers = {
    chooseTarget: function (st, pend, a) { // plunder
      var tp = st.players[a.target];
      if (!tp || a.target === pend.by || !tp.hand.length) throw new Error('bad target');
      var by = st.players[pend.by];
      var i = Math.floor(rnd(st) * tp.hand.length);
      var stolen = tp.hand.splice(i, 1)[0];
      st.pending = null;
      log(st, by.name + ' plunders a card from ' + tp.name + "'s hand");
      resolveKeep(st, by, stolen); // the loot is kept immediately
      if (st.phase === 'roundEnd' || st.phase === 'gameEnd') return true;
      drawFromDeck(st, tp.hand, tp.name); // victim draws a replacement
      return true;
    },
    seagull: function (st, pend, a) {
      var tp = st.players[a.player];
      if (!tp) throw new Error('bad player');
      if (tp.umbrella) throw new Error('that bar is under an umbrella');
      if (tp.bar.indexOf(a.card) < 0) throw new Error('card not on that bar');
      removeFrom(tp.bar, a.card);
      st.players[pend.by].bar.push(a.card);
      log(st, st.players[pend.by].name + "'s seagull swipes " + CARDS[a.card].name +
        ' from ' + tp.name + "'s bar 🕊");
    },
    torch: function (st, pend, a) {
      if (pend.cards.indexOf(a.keep) < 0) throw new Error('bad keep');
      var p = st.players[pend.by];
      pend.cards.forEach(function (id) { if (id !== a.keep) st.discard.push(id); });
      st.pending = null;
      log(st, p.name + ' takes a card from the torchlight');
      resolveKeep(st, p, a.keep);
      return true;
    },
    passAll: function (st, pend, a) { // tidal handover, on drafting hands
      var p = st.players[a.player];
      if (pend.chosen[a.player] !== undefined) throw new Error('already chosen');
      if (!pend.need[a.player]) throw new Error('no card needed');
      if (p.hand.indexOf(a.card) < 0) throw new Error('card not in hand');
      pend.chosen[a.player] = a.card;
      var waiting = st.players.some(function (pl) {
        return pend.need[pl.i] && pend.chosen[pl.i] === undefined;
      });
      if (waiting) return true;
      st.players.forEach(function (pl) {
        var id = pend.chosen[pl.i];
        if (id !== undefined) removeFrom(pl.hand, id);
      });
      st.players.forEach(function (pl) {
        var srcIdx = (pl.i + 1) % st.players.length; // pass right: receive from left
        var id = pend.chosen[srcIdx];
        if (id !== undefined) pl.hand.push(id);
      });
      log(st, '🌊 The tide hands cards to the right.');
    }
  };

  function apply(st, action) {
    if (st.phase === 'gameEnd') throw new Error('game over');
    var h = handlers[action.t];
    if (!h) throw new Error('unknown action ' + action.t);
    h(st, action);
    return st;
  }

  // whose input is needed right now? (pick phase: first unpicked seat)
  function actor(st) {
    if (st.pending) {
      var p = st.pending;
      if (p.type === 'passAll') {
        for (var i = 0; i < st.players.length; i++) {
          if (p.need[i] && p.chosen[i] === undefined) return i;
        }
      }
      return p.by;
    }
    if (st.phase === 'pick') {
      for (var j = 0; j < st.players.length; j++) {
        if (st.players[j].hand.length && st.picks[j] === undefined) return j;
      }
    }
    return 0;
  }

  G.engineDraft = {
    newGame: newGame, apply: apply, actor: actor,
    canServe: canServe, beerBonus: beerBonus, handSize: handSize, CARDS: CARDS
  };
}(typeof window !== 'undefined' ? (window.TT = window.TT || {}) : (module.exports = require('./data.js'))));
