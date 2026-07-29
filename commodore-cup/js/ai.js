// COMMODORE CUP — AI skipper. Given a state where actor() is an AI seat,
// returns the next action. Heuristic, not clairvoyant: sees only public info
// plus its own hand (steals are random; peeks are acknowledged and forgotten).
(function (G) {
  'use strict';
  var E = G.engine, CARDS;

  // usefulness of a card to a hand: pairs, adjacency, extension potential
  function usefulness(st, hand, id) {
    var c = CARDS[id];
    if (c.kind === 'special') return 2.5; // playable for value
    var u = 1;
    hand.forEach(function (o) {
      if (o === id) return;
      var oc = CARDS[o];
      if (oc.kind !== 'suit') return;
      if (oc.letter === c.letter && oc.suit !== c.suit) u += 1.2;
      if (oc.suit === c.suit && Math.abs(oc.rank - c.rank) === 1) u += 1.3;
      if (oc.suit === c.suit && Math.abs(oc.rank - c.rank) === 2) u += 0.5;
    });
    st.melds.forEach(function (m) {
      if (E.canExtend(m, id)) u += 2;
    });
    return u;
  }
  function worstCard(st, hand) {
    var best = null, bestU = Infinity;
    hand.forEach(function (id) {
      var u = usefulness(st, hand, id);
      if (CARDS[id].kind === 'special') u += 1; // prefer keeping specials to play
      if (u < bestU) { bestU = u; best = id; }
    });
    return best;
  }
  function bestCard(st, hand) {
    var best = null, bestU = -1;
    hand.forEach(function (id) {
      var u = usefulness(st, hand, id);
      if (u > bestU) { bestU = u; best = id; }
    });
    return best;
  }
  function leader(st, notMe) {
    var best = -Infinity, bi = -1;
    st.players.forEach(function (p) {
      if (p.i === notMe) return;
      var s = p.score + p.roundScore;
      if (s > best || (s === best && bi >= 0 && p.hand.length < st.players[bi].hand.length)) { best = s; bi = p.i; }
    });
    return bi;
  }
  function richestHand(st, notMe) {
    var bi = -1, n = -1;
    st.players.forEach(function (p) {
      if (p.i === notMe || !p.hand.length) return;
      if (p.hand.length > n) { n = p.hand.length; bi = p.i; }
    });
    return bi >= 0 ? bi : leader(st, notMe);
  }

  function resolvePending(st, me) {
    var p = st.pending;
    switch (p.type) {
      case 'chooseTarget': {
        var t;
        switch (p.then) {
          case 'forceDraw': case 'skip': t = leader(st, p.by); break;
          case 'steal': case 'peek': case 'swapHands': t = richestHand(st, p.by); break;
          case 'forceDiscard': {
            // aim at the leader unless our own hand is bloated with junk
            t = st.players[p.by].hand.length > 8 ? p.by : leader(st, p.by);
            if (t < 0 || !st.players[t].hand.length) {
              t = p.by;
              if (!st.players[t].hand.length) {
                st.players.some(function (pl) { if (pl.hand.length) { t = pl.i; return true; } return false; });
              }
            }
            break;
          }
          case 'giveTo': t = leader(st, p.by); break;
          default: t = leader(st, p.by);
        }
        if (t === p.by && !p.allowSelf) t = leftOf(st, p.by);
        if (p.needCards && p.then !== 'peek' && !st.players[t].hand.length) {
          t = richestHand(st, p.then === 'forceDiscard' && st.players[p.by].hand.length ? -1 : p.by);
        }
        return { t: 'resolve', target: t };
      }
      case 'chooseCard': {
        var hand = st.players[p.from].hand;
        return { t: 'resolve', card: worstCard(st, hand) };
      }
      case 'pickDiscard': {
        var pick = null, u = -1;
        st.discard.forEach(function (id) {
          var v = usefulness(st, st.players[p.by].hand, id);
          if (v > u) { u = v; pick = id; }
        });
        return { t: 'resolve', card: pick };
      }
      case 'gossip': {
        var keep = null, ku = -1;
        p.cards.forEach(function (id) {
          var v = usefulness(st, st.players[p.by].hand, id);
          if (v > ku) { ku = v; keep = id; }
        });
        return { t: 'resolve', keep: keep };
      }
      case 'passAll': {
        // pick for the first seat still owing a card (the UI only asks the
        // brain when the choice is an AI's; headless drivers use it for any seat)
        for (var i = 0; i < st.players.length; i++) {
          if (p.need[i] && p.chosen[i] === undefined) {
            return { t: 'resolve', player: i, card: worstCard(st, st.players[i].hand) };
          }
        }
        return null;
      }
      case 'reveal':
        return { t: 'resolve' };
    }
    return null;
  }
  function leftOf(st, i) { return (i + 1) % st.players.length; }

  function specialWorthPlaying(st, me, id) {
    var fx = CARDS[id].fx;
    var p = st.players[me];
    switch (fx.type) {
      case 'draw': return true;
      case 'gossip': return true;
      case 'steal': return true;
      case 'forceDraw': return true;
      case 'skipNext': return true;
      case 'takeDiscard': {
        var good = st.discard.some(function (d) {
          return usefulness(st, p.hand, d) >= 2.4;
        });
        return good;
      }
      case 'forceDiscard': return true;
      case 'swapHands': {
        var t = richestHand(st, me);
        return t >= 0 && st.players[t].hand.length > p.hand.length + 1;
      }
      case 'passAll': return p.hand.length >= 2;
      default: return true;
    }
  }

  // decide the next action for the current actor (must be an AI seat)
  function decide(st) {
    CARDS = E.CARDS;
    var seat = E.actor(st);
    var me = st.players[seat];

    if (st.pending) return resolvePending(st, seat);

    if (st.phase === 'roundEnd') return { t: 'nextRound' };

    if (st.phase === 'draw') {
      var top = st.discard[st.discard.length - 1];
      if (top && usefulness(st, me.hand, top) >= 2.4) return { t: 'draw', from: 'discard' };
      return { t: 'draw', from: 'pile' };
    }

    // main phase: meld > special > extend > court > discard
    var melds = E.findMelds(me.hand);
    if (melds.length) return { t: 'meldNew', cards: melds[0] };

    if (!st.specialUsed) {
      for (var i = 0; i < me.hand.length; i++) {
        var id = me.hand[i];
        if (CARDS[id].kind === 'special' && specialWorthPlaying(st, seat, id)) {
          return { t: 'playSpecial', card: id };
        }
      }
    }

    for (var j = 0; j < me.hand.length; j++) {
      for (var k = 0; k < st.melds.length; k++) {
        if (E.canExtend(st.melds[k], me.hand[j])) {
          return { t: 'extend', meldId: st.melds[k].id, card: me.hand[j] };
        }
      }
    }

    if (st.newMeldThisTurn && !st.courted && st.memberPile.length) {
      // you can't win without the members: court until the votes are in,
      // then keep pushing the luck only while trailing
      if (me.supporters < st.membersToWin) return { t: 'court' };
      var lead = leader(st, seat);
      var myScore = me.score + me.roundScore;
      var theirs = lead >= 0 ? st.players[lead].score + st.players[lead].roundScore : 0;
      if (myScore <= theirs + 4) return { t: 'court' };
    }

    if (!me.hand.length) return null; // went out mid-phase; engine will have ended round
    var pool = me.hand.filter(function (id) { return id !== st.tookFromDiscard; });
    if (!pool.length) pool = me.hand;
    return { t: 'discard', card: worstCard(st, pool) };
  }

  G.ai = { decide: decide };
}(typeof window !== 'undefined' ? (window.CC = window.CC || {}) : (module.exports = require('./engine.js'))));
