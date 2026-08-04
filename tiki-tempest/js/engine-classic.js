// TIKI TEMPEST — pure game engine. No DOM. Same architecture as commodore-cup:
// all change through E.apply(state, action); decisions surface as state.pending.
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
    if (st.log.length > 200) st.log.shift();
  }

  function newGame(opts) {
    var st = {
      mode: 'classic',
      deckIds: opts.deckIds || data.DECKS.stocked, // the tuned 125-card bar
      aiLevel: opts.aiLevel || 'regular',
      houseFavorite: opts.houseFavorite !== false, favSeen: {},
      seed: opts.seed || Math.floor(Math.random() * 1e9),
      rounds: opts.rounds || data.ROUNDS_DEFAULT,
      round: 0, finalRound: false, surgeStruck: false,
      players: opts.names.map(function (p, i) {
        return { i: i, name: p.name, isAI: !!p.isAI, avatar: p.avatar || null,
          hand: [], bar: [], beers: [], served: [], umbrellas: [],
          score: 0, roundScore: 0, servedTotal: 0 };
      }),
      deck: [], discard: [], removed: [],
      recipeDeck: [], recipeSpent: [], menu: [],
      turn: 0, phase: 'draw', playsLeft: 0, turnsThisRound: 0, refills: 0,
      pending: null, winner: -1, log: [], _rndCalls: 0,
      roundStarter: 0
    };
    // bigger tables get a wider menu: 4 recipes up at 2-3 players, 5 at 4+
    st.menuSize = opts.menuSize || (st.players.length >= 4 ? 5 : data.MENU_SIZE);
    st.recipeDeck = shuffleSt(st, data.RECIPE_DECK.slice());
    for (var m = 0; m < st.menuSize; m++) st.menu.push(st.recipeDeck.pop());
    startRound(st, 0);
    return st;
  }


  // top the menu up by one; when the recipe deck is spent entirely, the drinks
  // served in past rounds are reshuffled into a fresh deck
  function refillMenuCard(st) {
    if (!st.recipeDeck.length && st.recipeSpent.length) {
      st.recipeDeck = shuffleSt(st, st.recipeSpent);
      st.recipeSpent = [];
      log(st, '📖 The recipe book is rewritten — past drinks rejoin the deck.');
    }
    if (!st.recipeDeck.length) return false;
    st.menu.push(st.recipeDeck.pop());
    return true;
  }
  function startRound(st, starter) {
    st.round++;
    st.roundStarter = starter % st.players.length;
    // rebuild the main deck from everything not permanently out of the game
    var out = {};
    st.removed.forEach(function (id) { out[id] = 1; });
    // served drinks retire to the spent pile; the recipe deck runs continuously
    // across the whole game and only rewrites itself when it runs out entirely
    st.players.forEach(function (p) {
      p.served.forEach(function (e) { st.recipeSpent.push(e.card); });
    });
    while (st.menu.length < (st.menuSize || data.MENU_SIZE)) {
      if (!refillMenuCard(st)) break;
    }
    st.players.forEach(function (p) {
      p.beers.forEach(function (id) { out[id] = 1; }); // beers stay shelved
      p.hand = []; p.bar = []; p.served = []; p.umbrellas = [];
      p.roundScore = 0;
    });
    st.deck = shuffleSt(st, st.deckIds.filter(function (id) { return !out[id]; }));
    st.discard = [];
    st.players.forEach(function (p) {
      for (var i = 0; i < data.HAND_SIZE; i++) p.hand.push(st.deck.pop());
      // printed on Storm Surge: if dealt, reshuffle into the bottom half, redraw
      for (var k = 0; k < p.hand.length; k++) {
        if (CARDS[p.hand[k]].fx === 'surge') {
          var surge = p.hand.splice(k, 1)[0];
          var pos = Math.floor(rnd(st) * (st.deck.length / 2));
          st.deck.splice(pos, 0, surge);
          p.hand.push(st.deck.pop());
          k--;
        }
      }
    });
    st.turn = st.roundStarter;
    st.phase = 'draw'; st.playsLeft = 0; st.turnsThisRound = 0; st.refills = 0;
    st.pending = null;
    log(st, '— Round ' + st.round + (st.finalRound ? ' (LAST CALL)' : '') + ' — ' +
      st.players[st.turn].name + ' opens the bar');
  }

  function cur(st) { return st.players[st.turn]; }
  function removeFrom(arr, id) {
    var i = arr.indexOf(id);
    if (i < 0) throw new Error('card not there: ' + id);
    arr.splice(i, 1);
  }
  function drawOne(st, p) {
    // returns false if the round ended (surge or dry deck)
    if (!st.deck.length) refill(st);
    if (!st.deck.length) { endRound(st, 'the taps run dry'); return false; }
    var id = st.deck.pop();
    if (CARDS[id].fx === 'surge') {
      st.removed.push(id);
      st.surgeStruck = true;
      log(st, '⛈ STORM SURGE! ' + p.name + ' draws it — the squall clears the beach!');
      endRound(st, 'storm surge');
      return false;
    }
    p.hand.push(id);
    return true;
  }
  function refill(st) {
    if (st.discard.length === 0) return;
    if (st.refills >= 1) return; // second dry deck ends the round (checked by caller)
    st.refills++;
    st.deck = shuffleSt(st, st.discard);
    st.discard = [];
    log(st, 'The discard pile is shuffled back into the deck.');
  }

  // can player p serve recipe card recId from their bar?
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
      doubleCard = p.hand.filter(function (id) { return CARDS[id].fx === 'double'; })[0];
      if (!doubleCard) throw new Error('no Make It a Double in hand');
    }
    // pay ingredients
    Object.keys(r.needs).forEach(function (ing) {
      for (var n = 0; n < r.needs[ing]; n++) {
        var id = p.bar.filter(function (b) { return CARDS[b].ing === ing; })[0];
        removeFrom(p.bar, id);
        st.discard.push(id);
      }
    });
    removeFrom(st.menu, recId);
    refillMenuCard(st);
    var entry = { card: recId, pts: r.pts, doubled: false, umbrella: false };
    if (doubleCard) {
      removeFrom(p.hand, doubleCard);
      st.discard.push(doubleCard);
      entry.doubled = true;
      entry.pts *= 2;
    }
    if (st.houseFavorite && !st.favSeen[r.rec]) {
      st.favSeen[r.rec] = 1;
      entry.pts += 2;
      entry.fav = true;
      log(st, '⭐ First ' + r.name + ' of the night — house favorite, +2!');
    }
    if (p.umbrellas.length) {
      entry.umbrella = true;
      entry.pts += 1;
      st.removed.push(p.umbrellas.pop()); // one garnish per drink, out of the deck
    }
    p.served.push(entry);
    p.servedTotal++;
    p.roundScore = p.served.reduce(function (n, e) { return n + e.pts; }, 0);
    log(st, p.name + ' serves a ' + r.name + ' for ' + entry.pts + ' points' +
      (entry.doubled ? ' (doubled!)' : '') + (entry.umbrella ? ' (umbrella garnish)' : ''));
  }

  // ---------- specials ----------
  function playSpecial(st, p, id) {
    var c = CARDS[id];
    log(st, p.name + ' plays ' + c.name);
    removeFrom(p.hand, id);
    switch (c.fx) {
      case 'umbrella':
        p.umbrellas.push(id); // umbrellas stack; each stays out of the deck while in play
        log(st, p.name + "'s bar is under " + p.umbrellas.length + ' paper umbrella' +
          (p.umbrellas.length > 1 ? 's' : ''));
        return;
      case 'seagull': {
        st.discard.push(id);
        var any = st.players.some(function (pl) {
          return pl.bar.length && !pl.umbrellas.length;
        });
        if (!any) { log(st, 'No unprotected ingredients on any bar — the gull flies off.'); return; }
        st.pending = { type: 'seagull', by: p.i };
        return;
      }
      case 'demand':
        st.discard.push(id);
        st.pending = { type: 'demand', by: p.i };
        return;
      case 'torch': {
        st.discard.push(id);
        var seen = [];
        for (var i = 0; i < 3 && (st.deck.length || st.discard.length); i++) {
          if (!st.deck.length) refill(st);
          if (!st.deck.length) break;
          var t = st.deck.pop();
          if (CARDS[t].fx === 'surge') {
            st.removed.push(t);
            st.surgeStruck = true;
            seen.forEach(function (sid) { st.discard.push(sid); });
            log(st, '⛈ The torchlight reveals STORM SURGE — the squall hits!');
            endRound(st, 'storm surge');
            return;
          }
          seen.push(t);
        }
        if (!seen.length) return;
        st.pending = { type: 'torch', by: p.i, cards: seen };
        return;
      }
      case 'plunder': {
        st.discard.push(id);
        var targets = st.players.filter(function (pl) { return pl.i !== p.i && pl.hand.length; });
        if (!targets.length) { log(st, 'No hands to plunder.'); return; }
        st.pending = { type: 'chooseTarget', by: p.i, then: 'plunder' };
        return;
      }
      case 'tidal': {
        st.discard.push(id);
        var need = st.players.map(function (pl) { return pl.hand.length > 0; });
        st.pending = { type: 'passAll', by: p.i, need: need, chosen: {} };
        return;
      }
      case 'breeze':
        st.discard.push(id);
        for (var pi = 0; pi < st.players.length; pi++) {
          var order = (st.turn + pi) % st.players.length;
          for (var d = 0; d < 2; d++) {
            if (!drawOne(st, st.players[order])) return;
          }
        }
        log(st, 'Island Breeze — everyone draws 2.');
        return;
      case 'double': // guarded in handlers.special; never reached
        throw new Error('play Make It a Double while serving');
      case 'lastcall':
        st.discard.push(id);
        st.finalRound = true;
        log(st, '🔔 LAST CALL — this round ends the night!');
        return;
      case 'surge':
        throw new Error('storm surge plays itself');
      default:
        throw new Error('unknown special');
    }
  }

  // ---------- round / game end ----------
  function endRound(st, why) {
    st.pending = null;
    st.players.forEach(function (p) {
      p.roundScore = p.served.reduce(function (n, e) { return n + e.pts; }, 0);
      p.score += p.roundScore;
      while (p.umbrellas.length) st.discard.push(p.umbrellas.pop()); // wash away
    });
    st.lastRoundWhy = why;
    var isLast = st.finalRound || st.round >= st.rounds;
    log(st, 'Round ' + st.round + ' ends (' + why + ').');
    if (isLast) {
      finishGame(st);
    } else {
      st.phase = 'roundEnd';
    }
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

  function advanceTurn(st) {
    st.turnsThisRound++;
    if (st.turnsThisRound >= data.TURNS_PER_ROUND * st.players.length) {
      endRound(st, 'closing time');
      return;
    }
    st.turn = (st.turn + 1) % st.players.length;
    st.phase = 'draw';
    st.playsLeft = 0;
  }

  // ---------- actions ----------
  var handlers = {
    draw: function (st) {
      requireTurn(st, 'draw');
      var p = cur(st);
      for (var i = 0; i < 2; i++) {
        if (!drawOne(st, p)) return;
      }
      log(st, p.name + ' draws 2 cards');
      st.phase = 'main';
      st.playsLeft = data.PLAYS_PER_TURN;
    },
    stock: function (st, a) {
      requirePlay(st);
      var p = cur(st);
      if (CARDS[a.card].kind !== 'ing') throw new Error('not an ingredient');
      removeFrom(p.hand, a.card);
      p.bar.push(a.card);
      st.playsLeft--;
      log(st, p.name + ' stocks ' + CARDS[a.card].name);
    },
    beer: function (st, a) {
      requirePlay(st);
      var p = cur(st);
      if (CARDS[a.card].kind !== 'beer') throw new Error('not a beer');
      removeFrom(p.hand, a.card);
      p.beers.push(a.card);
      st.playsLeft--;
      log(st, p.name + ' shelves a beer (' + p.beers.length + ')');
    },
    special: function (st, a) {
      requirePlay(st);
      var p = cur(st);
      var c = CARDS[a.card];
      if (c.kind !== 'special') throw new Error('not a special');
      if (c.fx === 'double') throw new Error('play Make It a Double while serving');
      st.playsLeft--;
      playSpecial(st, p, a.card);
    },
    serve: function (st, a) {
      requireMain(st);
      serve(st, cur(st), a.recipe, a.double);
    },
    endTurn: function (st) {
      requireMain(st);
      advanceTurn(st);
    },
    nextRound: function (st) {
      if (st.phase !== 'roundEnd') throw new Error('round not over');
      startRound(st, st.roundStarter + 1);
    },
    resolve: function (st, a) {
      var pend = st.pending;
      if (!pend) throw new Error('nothing pending');
      var keep = resolvers[pend.type](st, pend, a);
      if (!keep && st.pending === pend) st.pending = null;
    }
  };

  var resolvers = {
    chooseTarget: function (st, pend, a) {
      var tp = st.players[a.target];
      if (!tp || a.target === pend.by) throw new Error('bad target');
      var by = st.players[pend.by];
      if (pend.then === 'plunder') {
        if (!tp.hand.length) throw new Error('empty hand');
        var i = Math.floor(rnd(st) * tp.hand.length);
        var id = tp.hand.splice(i, 1)[0];
        by.hand.push(id);
        log(st, by.name + ' plunders a card from ' + tp.name);
        st.pending = null;
        drawOne(st, tp); // printed clarification: victim draws a replacement
        return true; // pending already handled (and endRound may have fired)
      }
      throw new Error('bad then');
    },
    seagull: function (st, pend, a) {
      var tp = st.players[a.player];
      if (!tp) throw new Error('bad player');
      if (tp.umbrellas.length) throw new Error('that bar is under an umbrella');
      if (tp.bar.indexOf(a.card) < 0) throw new Error('card not on that bar');
      removeFrom(tp.bar, a.card);
      st.players[pend.by].hand.push(a.card);
      log(st, st.players[pend.by].name + "'s seagull swipes " + CARDS[a.card].name +
        ' from ' + tp.name + "'s bar");
    },
    demand: function (st, pend, a) {
      var tp = st.players[a.target];
      if (!tp || a.target === pend.by) throw new Error('bad target');
      var by = st.players[pend.by];
      var held = tp.hand.filter(function (id) { return CARDS[id].ing === a.ing; })[0];
      if (held) {
        st.pending = { type: 'handOver', by: a.target, from: pend.by, card: held };
        log(st, by.name + ' demands ' + a.ing.replace(/-/g, ' ') + ' from ' + tp.name + '…');
      } else {
        log(st, by.name + ' demands ' + a.ing.replace(/-/g, ' ') + ' — ' + tp.name + " doesn't have it.");
      }
    },
    handOver: function (st, pend) {
      var tp = st.players[pend.by], by = st.players[pend.from];
      removeFrom(tp.hand, pend.card);
      by.hand.push(pend.card);
      log(st, tp.name + ' hands it over 😩 — ' + CARDS[pend.card].name + ' goes to ' + by.name);
    },
    torch: function (st, pend, a) {
      if (pend.cards.indexOf(a.keep) < 0) throw new Error('bad keep');
      var p = st.players[pend.by];
      p.hand.push(a.keep);
      pend.cards.forEach(function (id) { if (id !== a.keep) st.discard.push(id); });
      log(st, p.name + ' keeps one card from the torchlight');
    },
    passAll: function (st, pend, a) {
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
        // pass to the right: each receives from their left (i+1)
        var srcIdx = (pl.i + 1) % st.players.length;
        var id = pend.chosen[srcIdx];
        if (id !== undefined) pl.hand.push(id);
      });
      log(st, 'The tide hands cards to the right.');
    }
  };

  function requireTurn(st, ph) {
    if (st.pending) throw new Error('resolve pending first');
    if (st.phase !== ph) throw new Error('wrong phase: ' + st.phase);
  }
  function requireMain(st) { requireTurn(st, 'main'); }
  function requirePlay(st) {
    requireMain(st);
    if (st.playsLeft <= 0) throw new Error('no plays left — end your turn');
  }

  function apply(st, action) {
    if (st.phase === 'gameEnd') throw new Error('game over');
    var h = handlers[action.t];
    if (!h) throw new Error('unknown action ' + action.t);
    h(st, action);
    return st;
  }

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
    return st.turn;
  }

  G.engineClassic = {
    newGame: newGame, apply: apply, actor: actor,
    canServe: canServe, beerBonus: beerBonus, CARDS: CARDS
  };
}(typeof window !== 'undefined' ? (window.TT = window.TT || {}) : (module.exports = require('./data.js'))));
