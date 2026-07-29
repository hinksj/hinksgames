// COMMODORE CUP — pure game engine. No DOM. Drives solo, hotseat and network play.
// State advances only through E.apply(state, action). Interrupts that need a
// decision surface as state.pending; resolve with {t:'resolve', ...}.
(function (G) {
  'use strict';
  var data = G.data || (typeof require !== 'undefined' && require('./data.js').data);
  var CARDS = data.CARDS;

  // ---------- seeded rng ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rnd) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  // ---------- construction ----------
  function newGame(opts) {
    var names = opts.names; // [{name, isAI}]
    var st = {
      seed: opts.seed || Math.floor(Math.random() * 1e9),
      target: opts.target || data.TARGET_DEFAULT,
      round: 0,
      membersToWin: opts.membersToWin != null ? opts.membersToWin : data.MEMBERS_TO_WIN,
      players: names.map(function (p, i) {
        return { i: i, name: p.name, isAI: !!p.isAI, netId: p.netId || null,
          hand: [], played: [], members: [], supporters: 0, skip: false,
          score: 0, roundScore: 0, toast: false };
      }),
      melds: [], drawPile: [], discard: [], memberPile: [],
      turn: 0, phase: 'draw', specialUsed: false, newMeldThisTurn: false,
      courted: false, pending: null, outBy: -1, winner: -1, log: [],
      _rndCalls: 0
    };
    startRound(st, 0);
    return st;
  }

  function rnd(st) {
    // derive a fresh generator each call from seed + call counter: keeps state serializable
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

  function startRound(st, firstPlayer) {
    st.round++;
    st.melds = [];
    st.pending = null;
    st.outBy = -1;
    st.drawPile = shuffleSt(st, data.CLUB_DECK.slice());
    st.memberPile = shuffleSt(st, data.MEMBER_DECK.slice());
    st.discard = [];
    st.players.forEach(function (p) {
      p.hand = []; p.played = []; p.members = []; p.skip = false;
      p.roundScore = 0; p.toast = false;
    });
    st.players.forEach(function (p) {
      for (var i = 0; i < data.HAND_SIZE; i++) p.hand.push(st.drawPile.pop());
    });
    // flip a suit card to start the discard; bury specials
    while (st.drawPile.length) {
      var c = st.drawPile.pop();
      if (CARDS[c].kind === 'suit') { st.discard.push(c); break; }
      st.drawPile.unshift(c);
    }
    st.turn = firstPlayer % st.players.length;
    st.phase = 'draw'; st.specialUsed = false; st.newMeldThisTurn = false; st.courted = false;
    st.refills = 0; st.turnsThisRound = 0; st.tookFromDiscard = null;
    log(st, '— Round ' + st.round + ' — ' + st.players[st.turn].name + ' leads off');
  }

  function log(st, msg) {
    st.log.push(msg);
    if (st.log.length > 200) st.log.shift();
  }

  // ---------- meld validation ----------
  function isSet(cards) {
    if (cards.length < 3 || cards.length > 4) return false;
    var letter = null, suits = {};
    for (var i = 0; i < cards.length; i++) {
      var c = CARDS[cards[i]];
      if (!c || c.kind !== 'suit') return false;
      if (letter === null) letter = c.letter;
      if (c.letter !== letter || suits[c.suit]) return false;
      suits[c.suit] = true;
    }
    return true;
  }
  function isRun(cards) {
    if (cards.length < 3) return false;
    var suit = null, ranks = [];
    for (var i = 0; i < cards.length; i++) {
      var c = CARDS[cards[i]];
      if (!c || c.kind !== 'suit') return false;
      if (suit === null) suit = c.suit;
      if (c.suit !== suit) return false;
      ranks.push(c.rank);
    }
    ranks.sort(function (a, b) { return a - b; });
    for (var j = 1; j < ranks.length; j++) if (ranks[j] !== ranks[j - 1] + 1) return false;
    return true;
  }
  function meldType(cards) {
    if (isSet(cards)) return 'set';
    if (isRun(cards)) return 'run';
    return null;
  }
  // can `cardId` legally extend table meld m?
  function canExtend(m, cardId) {
    var c = CARDS[cardId];
    if (!c || c.kind !== 'suit') return false;
    var ids = m.cards.map(function (e) { return e.card; });
    if (m.type === 'set') {
      if (ids.length >= 4) return false;
      var first = CARDS[ids[0]];
      if (c.letter !== first.letter) return false;
      return !ids.some(function (id) { return CARDS[id].suit === c.suit; });
    }
    var suit = CARDS[ids[0]].suit;
    if (c.suit !== suit) return false;
    var ranks = ids.map(function (id) { return CARDS[id].rank; }).sort(function (a, b) { return a - b; });
    return c.rank === ranks[0] - 1 || c.rank === ranks[ranks.length - 1] + 1;
  }

  // Greedy meld finder (AI + hint button): returns array of card-id arrays.
  function findMelds(hand) {
    var suitCards = hand.filter(function (id) { return CARDS[id].kind === 'suit'; });
    var best = [];
    // try runs first then sets, and the reverse; keep whichever melds more cards
    [['run', 'set'], ['set', 'run']].forEach(function (order) {
      var pool = suitCards.slice(), found = [];
      order.forEach(function (kind) {
        var got = true;
        while (got) {
          got = false;
          var m = kind === 'run' ? findRun(pool) : findSet(pool);
          if (m) {
            found.push(m);
            pool = pool.filter(function (id) { return m.indexOf(id) < 0; });
            got = true;
          }
        }
      });
      var count = found.reduce(function (n, m) { return n + m.length; }, 0);
      var bestCount = best.reduce(function (n, m) { return n + m.length; }, 0);
      if (count > bestCount) best = found;
    });
    return best;
  }
  function findRun(pool) {
    var bySuit = {};
    pool.forEach(function (id) {
      var c = CARDS[id];
      (bySuit[c.suit] = bySuit[c.suit] || []).push(id);
    });
    var bestRun = null;
    Object.keys(bySuit).forEach(function (s) {
      var ids = bySuit[s].sort(function (a, b) { return CARDS[a].rank - CARDS[b].rank; });
      var run = [ids[0]];
      for (var i = 1; i <= ids.length; i++) {
        if (i < ids.length && CARDS[ids[i]].rank === CARDS[run[run.length - 1]].rank + 1) {
          run.push(ids[i]);
        } else {
          if (run.length >= 3 && (!bestRun || run.length > bestRun.length)) bestRun = run.slice();
          if (i < ids.length) run = [ids[i]];
        }
      }
    });
    return bestRun;
  }
  function findSet(pool) {
    var byLetter = {};
    pool.forEach(function (id) {
      var c = CARDS[id];
      (byLetter[c.letter] = byLetter[c.letter] || []).push(id);
    });
    var bestSet = null;
    Object.keys(byLetter).forEach(function (L) {
      var seen = {}, set = [];
      byLetter[L].forEach(function (id) {
        if (!seen[CARDS[id].suit]) { seen[CARDS[id].suit] = 1; set.push(id); }
      });
      if (set.length >= 3 && (!bestSet || set.length > bestSet.length)) bestSet = set;
    });
    return bestSet;
  }

  // ---------- helpers ----------
  function cur(st) { return st.players[st.turn]; }
  function removeFromHand(p, id) {
    var i = p.hand.indexOf(id);
    if (i < 0) throw new Error(p.name + ' does not hold ' + id);
    p.hand.splice(i, 1);
  }
  function drawFromPile(st, p, n, why) {
    for (var i = 0; i < n; i++) {
      if (!st.drawPile.length) refillDrawPile(st);
      if (!st.drawPile.length) { log(st, 'The bar is dry — no cards to draw.'); return; }
      p.hand.push(st.drawPile.pop());
    }
    log(st, p.name + ' draws ' + n + ' card' + (n > 1 ? 's' : '') + (why ? ' (' + why + ')' : ''));
  }
  function refillDrawPile(st) {
    if (st.discard.length <= 1) return;
    st.refills++;
    var top = st.discard.pop();
    st.drawPile = shuffleSt(st, st.discard);
    st.discard = [top];
    log(st, 'The discard pile is shuffled into a fresh draw pile.');
  }
  function leftOf(st, i) { return (i + 1) % st.players.length; }
  function rightOf(st, i) { return (i - 1 + st.players.length) % st.players.length; }
  function acrossFrom(st, i) { return (i + Math.floor(st.players.length / 2)) % st.players.length; }

  function checkOut(st) {
    if (st.pending || st.outBy >= 0) return;
    for (var i = 0; i < st.players.length; i++) {
      if (st.players[i].hand.length === 0) {
        st.outBy = i;
        if (i === st.turn) st.players[i].toast = true;
        endRound(st);
        return;
      }
    }
  }

  // ---------- scoring ----------
  function scoreRound(st) {
    var rows = st.players.map(function (p) {
      var melded = 0;
      st.melds.forEach(function (m) {
        m.cards.forEach(function (e) { if (e.by === p.i) melded++; });
      });
      var memberPts = p.members.reduce(function (n, id) { return n + CARDS[id].pts; }, 0);
      var handPenalty = p.hand.reduce(function (n, id) {
        return n - (CARDS[id].kind === 'special' ? 2 : 1);
      }, 0);
      var row = {
        player: p.i, name: p.name, melded: melded,
        specials: p.played.length * 2, members: memberPts,
        toast: p.toast ? 5 : 0, hand: handPenalty
      };
      row.total = melded + row.specials + memberPts + row.toast + handPenalty;
      return row;
    });
    return rows;
  }
  function endRound(st) {
    var rows = scoreRound(st);
    rows.forEach(function (r) {
      var p = st.players[r.player];
      p.roundScore = r.total;
      p.score += r.total;
    });
    st.lastScores = rows;
    // to be named Commodore you need the points AND the members' support
    var qualified = st.players.filter(function (p) {
      return p.score >= st.target && p.supporters >= st.membersToWin;
    });
    st.players.forEach(function (p) {
      if (p.score >= st.target && p.supporters < st.membersToWin) {
        log(st, p.name + ' has the points but not the votes — ' +
          p.supporters + '/' + st.membersToWin + ' members backing them.');
      }
    });
    if (qualified.length) {
      qualified.sort(function (a, b) { return b.score - a.score || b.supporters - a.supporters; });
      if (qualified.length > 1 && qualified[0].score === qualified[1].score &&
          qualified[0].supporters === qualified[1].supporters) {
        st.phase = 'roundEnd'; // sail-off: another round
        log(st, 'Tied at the top — a sail-off round is called!');
      } else {
        st.winner = qualified[0].i;
        st.phase = 'gameEnd';
        log(st, qualified[0].name + ' is named COMMODORE — ' + qualified[0].score +
          ' points and ' + qualified[0].supporters + ' members in support!');
        return;
      }
    } else {
      st.phase = 'roundEnd';
    }
    log(st, 'Round ' + st.round + ' ends — ' + (st.outBy >= 0 ? st.players[st.outBy].name + ' goes out.' : 'deck exhausted.'));
  }

  // ---------- effect machinery ----------
  // Queue an interrupt. by = player index making the choice.
  function ask(st, pend) { st.pending = pend; }

  function startEffect(st, by, fx, sourceName) {
    var p = st.players[by];
    switch (fx.type) {
      case 'draw':
        drawFromPile(st, p, fx.n, sourceName);
        break;
      case 'forceDraw':
        ask(st, { type: 'chooseTarget', by: by, fx: fx, source: sourceName,
          allowSelf: false, then: 'forceDraw' });
        break;
      case 'steal':
        ask(st, { type: 'chooseTarget', by: by, fx: fx, source: sourceName,
          allowSelf: false, then: 'steal', needCards: true });
        break;
      case 'peek':
        ask(st, { type: 'chooseTarget', by: by, fx: fx, source: sourceName,
          allowSelf: false, then: 'peek', needCards: true });
        break;
      case 'swapHands':
        ask(st, { type: 'chooseTarget', by: by, fx: fx, source: sourceName,
          allowSelf: false, then: 'swapHands' });
        break;
      case 'skipNext': {
        var t = leftOf(st, by);
        st.players[t].skip = true;
        log(st, st.players[t].name + ' will sit the next one out (' + sourceName + ')');
        break;
      }
      case 'skipChoose':
        ask(st, { type: 'chooseTarget', by: by, fx: fx, source: sourceName,
          allowSelf: false, then: 'skip' });
        break;
      case 'skipSelf':
        p.skip = true;
        log(st, p.name + ' will skip their own next turn (' + sourceName + ')');
        break;
      case 'forceDiscard':
        ask(st, { type: 'chooseTarget', by: by, fx: fx, source: sourceName,
          allowSelf: true, then: 'forceDiscard', needCards: true });
        break;
      case 'selfDiscard':
        if (p.hand.length) ask(st, { type: 'chooseCard', by: by, from: by, source: sourceName, mode: 'discard' });
        break;
      case 'give': {
        if (!p.hand.length) break;
        if (fx.dir === 'choose') {
          ask(st, { type: 'chooseTarget', by: by, fx: fx, source: sourceName,
            allowSelf: false, then: 'giveTo' });
        } else {
          var to = fx.dir === 'across' ? acrossFrom(st, by) : (fx.dir === 1 ? leftOf(st, by) : rightOf(st, by));
          if (to === by) break;
          ask(st, { type: 'chooseCard', by: by, from: by, to: to, source: sourceName, mode: 'give' });
        }
        break;
      }
      case 'takeDiscard':
        if (st.discard.length) ask(st, { type: 'pickDiscard', by: by, source: sourceName });
        break;
      case 'gossip': {
        var seen = [];
        for (var i = 0; i < 3; i++) {
          if (!st.drawPile.length) refillDrawPile(st);
          if (st.drawPile.length) seen.push(st.drawPile.pop());
        }
        if (!seen.length) break;
        ask(st, { type: 'gossip', by: by, cards: seen, source: sourceName });
        break;
      }
      case 'passAll': {
        var need = st.players.map(function (pl) { return pl.hand.length > 0; });
        ask(st, { type: 'passAll', by: by, dir: fx.dir, source: sourceName,
          chosen: {}, need: need });
        break;
      }
      default:
        throw new Error('unknown fx ' + fx.type);
    }
  }

  // ---------- actions ----------
  var handlers = {
    draw: function (st, a) {
      requirePhase(st, 'draw');
      var p = cur(st);
      if (a.from === 'discard') {
        if (!st.discard.length) throw new Error('discard empty');
        var id = st.discard.pop();
        p.hand.push(id);
        st.tookFromDiscard = id;
        log(st, p.name + ' takes ' + CARDS[id].name + ' from the discard pile');
      } else {
        drawFromPile(st, p, 1, null);
      }
      st.phase = 'main';
    },

    playSpecial: function (st, a) {
      requirePhase(st, 'main');
      if (st.specialUsed) throw new Error('one special per turn');
      var p = cur(st);
      var c = CARDS[a.card];
      if (!c || c.kind !== 'special') throw new Error('not a special');
      removeFromHand(p, a.card);
      p.played.push(a.card);
      st.specialUsed = true;
      log(st, p.name + ' plays ' + c.name + ' — ' + c.text);
      startEffect(st, st.turn, c.fx, c.name);
      checkOut(st);
    },

    meldNew: function (st, a) {
      requirePhase(st, 'main');
      var p = cur(st);
      var type = meldType(a.cards);
      if (!type) throw new Error('not a legal set or run');
      a.cards.forEach(function (id) { removeFromHand(p, id); });
      st.melds.push({
        id: 'm' + (st.melds.length + 1) + '-' + st.round, type: type,
        cards: a.cards.slice().sort(function (x, y) { return CARDS[x].rank - CARDS[y].rank; })
          .map(function (id) { return { card: id, by: p.i }; })
      });
      st.newMeldThisTurn = true;
      log(st, p.name + ' melds a ' + type + ': ' +
        a.cards.map(function (id) { return CARDS[id].letter + '·' + CARDS[id].name; }).join(', '));
      checkOut(st);
    },

    extend: function (st, a) {
      requirePhase(st, 'main');
      var p = cur(st);
      var m = st.melds.filter(function (x) { return x.id === a.meldId; })[0];
      if (!m) throw new Error('no such meld');
      if (!canExtend(m, a.card)) throw new Error('cannot extend');
      removeFromHand(p, a.card);
      m.cards.push({ card: a.card, by: p.i });
      m.cards.sort(function (x, y) { return CARDS[x.card].rank - CARDS[y.card].rank; });
      log(st, p.name + ' adds ' + CARDS[a.card].name + ' to a ' + m.type);
      checkOut(st);
    },

    court: function (st) {
      requirePhase(st, 'main');
      if (!st.newMeldThisTurn) throw new Error('meld a new set or run first');
      if (st.courted) throw new Error('one member per turn');
      if (!st.memberPile.length) throw new Error('member deck empty');
      var p = cur(st);
      st.courted = true;
      var id = st.memberPile.pop();
      p.members.push(id);
      p.supporters++;
      var c = CARDS[id];
      log(st, p.name + ' courts ' + c.name + ' (' + (c.pts >= 0 ? '+' : '') + c.pts +
        ') — support ' + p.supporters + '/' + st.membersToWin);
      startEffect(st, st.turn, c.fx, c.name);
      checkOut(st);
    },

    discard: function (st, a) {
      requirePhase(st, 'main');
      var p = cur(st);
      if (a.card === st.tookFromDiscard && p.hand.length > 1) {
        throw new Error('cannot discard the card you just took from the discard pile');
      }
      removeFromHand(p, a.card);
      st.discard.push(a.card);
      log(st, p.name + ' discards ' + CARDS[a.card].name);
      checkOut(st);
      if (st.phase !== 'roundEnd' && st.phase !== 'gameEnd') advanceTurn(st);
    },

    nextRound: function (st) {
      if (st.phase !== 'roundEnd') throw new Error('round not over');
      startRound(st, (st.outBy >= 0 ? st.outBy + 1 : st.turn + 1) % st.players.length);
    },

    resolve: function (st, a) {
      var pend = st.pending;
      if (!pend) throw new Error('nothing pending');
      var keep = resolvers[pend.type](st, pend, a); // truthy = still collecting input
      if (!keep && st.pending === pend) st.pending = null;
      checkOut(st);
    }
  };

  var resolvers = {
    chooseTarget: function (st, pend, a) {
      var t = a.target;
      if (typeof t !== 'number' || t < 0 || t >= st.players.length) throw new Error('bad target');
      if (t === pend.by && !pend.allowSelf) throw new Error('cannot target yourself');
      if (pend.needCards && !st.players[t].hand.length && pend.then !== 'peek') throw new Error('target has no cards');
      var by = st.players[pend.by], tp = st.players[t];
      switch (pend.then) {
        case 'forceDraw':
          st.pending = null;
          drawFromPile(st, tp, pend.fx.n, pend.source);
          break;
        case 'steal': {
          st.pending = null;
          var i = Math.floor(rnd(st) * tp.hand.length);
          var id = tp.hand.splice(i, 1)[0];
          by.hand.push(id);
          log(st, by.name + ' steals a card from ' + tp.name + ' (' + pend.source + ')');
          break;
        }
        case 'peek':
          st.pending = { type: 'reveal', by: pend.by, target: t,
            cards: tp.hand.slice(), source: pend.source };
          log(st, by.name + ' looks at ' + tp.name + "'s hand (" + pend.source + ')');
          break;
        case 'swapHands': {
          st.pending = null;
          var h = by.hand; by.hand = tp.hand; tp.hand = h;
          log(st, by.name + ' swaps hands with ' + tp.name + ' (' + pend.source + ')');
          break;
        }
        case 'skip':
          st.pending = null;
          tp.skip = true;
          log(st, tp.name + ' will sit the next one out (' + pend.source + ')');
          break;
        case 'forceDiscard':
          st.pending = { type: 'chooseCard', by: t, from: t, source: pend.source, mode: 'discard' };
          break;
        case 'giveTo':
          st.pending = { type: 'chooseCard', by: pend.by, from: pend.by, to: t,
            source: pend.source, mode: 'give' };
          break;
        default: throw new Error('bad then');
      }
    },

    chooseCard: function (st, pend, a) {
      var from = st.players[pend.from];
      if (from.hand.indexOf(a.card) < 0) throw new Error('card not in hand');
      removeFromHand(from, a.card);
      if (pend.mode === 'discard') {
        st.discard.push(a.card);
        log(st, from.name + ' discards ' + CARDS[a.card].name + ' (' + pend.source + ')');
      } else {
        st.players[pend.to].hand.push(a.card);
        log(st, from.name + ' hands a card to ' + st.players[pend.to].name + ' (' + pend.source + ')');
      }
    },

    pickDiscard: function (st, pend, a) {
      var i = st.discard.indexOf(a.card);
      if (i < 0) throw new Error('card not in discard');
      st.discard.splice(i, 1);
      st.players[pend.by].hand.push(a.card);
      log(st, st.players[pend.by].name + ' retrieves ' + CARDS[a.card].name + ' (' + pend.source + ')');
    },

    gossip: function (st, pend, a) {
      if (pend.cards.indexOf(a.keep) < 0) throw new Error('bad keep');
      var p = st.players[pend.by];
      p.hand.push(a.keep);
      pend.cards.forEach(function (id) { if (id !== a.keep) st.discard.push(id); });
      log(st, p.name + ' keeps one whisper, discards ' + (pend.cards.length - 1) + ' (' + pend.source + ')');
    },

    passAll: function (st, pend, a) {
      // a: {player, card} — collect one per player with cards, then rotate
      var p = st.players[a.player];
      if (pend.chosen[a.player] !== undefined) throw new Error('already chosen');
      if (!pend.need[a.player]) throw new Error('no card needed');
      if (p.hand.indexOf(a.card) < 0) throw new Error('card not in hand');
      pend.chosen[a.player] = a.card;
      var waiting = st.players.some(function (pl) {
        return pend.need[pl.i] && pend.chosen[pl.i] === undefined;
      });
      if (waiting) return true; // keep pending until every player has chosen
      st.players.forEach(function (pl) {
        var id = pend.chosen[pl.i];
        if (id !== undefined) removeFromHand(pl, id);
      });
      st.players.forEach(function (pl) {
        var srcIdx = pend.dir === 1 ? rightOf(st, pl.i) : leftOf(st, pl.i);
        var id = pend.chosen[srcIdx];
        if (id !== undefined) pl.hand.push(id);
      });
      st.pending = null;
      log(st, 'Cards slide to the ' + (pend.dir === 1 ? 'left' : 'right') + ' (' + pend.source + ')');
    },

    reveal: function (st) {
      st.pending = null; // acknowledged
    }
  };

  function requirePhase(st, ph) {
    if (st.pending) throw new Error('resolve pending first');
    if (st.phase !== ph) throw new Error('wrong phase: ' + st.phase + ' (need ' + ph + ')');
    if (st.outBy >= 0) throw new Error('round over');
  }

  function advanceTurn(st) {
    st.turnsThisRound++;
    // stock exhausted twice (or a marathon stall): the round ends where it stands
    if (st.refills >= 2 || st.turnsThisRound >= 400) {
      log(st, 'The stock is spent — the round ends where it stands.');
      endRound(st);
      return;
    }
    st.turn = leftOf(st, st.turn);
    st.phase = 'draw'; st.specialUsed = false; st.newMeldThisTurn = false; st.courted = false;
    st.tookFromDiscard = null;
    var p = cur(st);
    if (p.skip) {
      p.skip = false;
      log(st, p.name + ' sits this one out.');
      advanceTurn(st);
    }
  }

  function apply(st, action) {
    if (st.phase === 'gameEnd') throw new Error('game over');
    var h = handlers[action.t];
    if (!h) throw new Error('unknown action ' + action.t);
    h(st, action);
    return st;
  }

  // who must act right now?
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

  G.engine = {
    newGame: newGame, apply: apply, actor: actor,
    meldType: meldType, canExtend: canExtend, findMelds: findMelds,
    scoreRound: scoreRound, CARDS: CARDS
  };
}(typeof window !== 'undefined' ? (window.CC = window.CC || {}) : (module.exports = require('./data.js'))));
