// COMMODORE CUP — table renderer + interaction. Drives the engine locally
// (solo/host) or mirrors a host's state (guest). window.CC.ui
(function (G) {
  'use strict';
  var E = G.engine, data = G.data, CARDS = data.CARDS;
  var $ = function (id) { return document.getElementById(id); };

  function avSlug(name) {
    return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  function avatarChip(p) {
    var slug = avSlug(p.name);
    G._avErr = G._avErr || {};
    var img = G._avErr[slug] ? '' :
      '<img src="assets/avatars/' + slug + '.png" onerror="window.CC._avErr[\'' + slug + '\']=1;this.remove()">';
    return '<span class="avatar" style="background:' + SEAT_COLORS[p.i % 6] + '">' +
      '<span class="ae">' + (p.avatar || esc(String(p.name).charAt(0).toUpperCase())) + '</span>' + img + '</span>';
  }
  var SEAT_COLORS = ['#ffd166', '#5fd6ff', '#ff5fb2', '#8dff9e', '#c39bff', '#ffa25f'];

  var ui = {
    st: null,          // current state (authoritative if !isGuest)
    mySeat: 0,
    isGuest: false,
    roomCode: '',
    send: null,        // guest: fn(action) -> host
    onLocalAction: null, // host: called after each apply to broadcast
    sel: [],           // selected hand card ids
    handOrder: [],     // local visual order of my hand (drag/sort; never sent anywhere)
    drag: null,
    pumping: false,
    logLen: 0
  };

  // ---------- entry ----------
  ui.begin = function (st, mySeat, opts) {
    ui.st = st; ui.mySeat = mySeat;
    ui.isGuest = !!(opts && opts.guest);
    ui.send = (opts && opts.send) || null;
    ui.onLocalAction = (opts && opts.onLocalAction) || null;
    ui.roomCode = (opts && opts.room) || '';
    ui.sel = []; ui.logLen = 0; ui.knownMembers = null;
    $('menu').style.display = 'none';
    $('table').style.display = 'block';
    $('tNet').textContent = ui.roomCode ? 'room ' + ui.roomCode : '';
    if ($('chatBox')) $('chatBox').style.display = ui.roomCode ? 'flex' : 'none';
    bindZoom();
    render();
    pump();
  };

  // ---------- member reveal: courted members sweep in big ----------
  var mrEl = null, mrTimer = null;
  function memberReveal(cardId, who) {
    if (!mrEl) {
      mrEl = document.createElement('div');
      mrEl.id = 'memberReveal';
      mrEl.addEventListener('click', hideMemberReveal);
      document.body.appendChild(mrEl);
    }
    var c = CARDS[cardId];
    mrEl.innerHTML = '<div class="mr"><img src="' + c.art + '">' +
      '<div class="cap">' + esc(who) + ' courts ' + esc(c.name) + ' — ' +
      (c.pts >= 0 ? '+' : '') + c.pts + ' points</div></div>';
    mrEl.className = 'show';
    // if a theme song exists for this character, it plays (drop files in
    // assets/music/themes/<member-slug>.mp3 — no manifest needed)
    if (G.music && G.music.sting) {
      G.music.sting('assets/music/themes/' + cardId.replace(/^mb-/, '') + '.mp3');
    }
    clearTimeout(mrTimer);
    mrTimer = setTimeout(hideMemberReveal, 12000); // linger — the characters deserve reading
  }
  function hideMemberReveal() {
    if (mrEl) mrEl.className = '';
    clearTimeout(mrTimer);
  }
  function checkMemberReveals(st) {
    var counts = st.players.map(function (p) { return p.members.length; });
    if (!ui.knownMembers) { ui.knownMembers = counts; return; }
    for (var i = 0; i < st.players.length; i++) {
      if (counts[i] > (ui.knownMembers[i] || 0)) {
        memberReveal(st.players[i].members[st.players[i].members.length - 1], st.players[i].name);
      }
    }
    ui.knownMembers = counts;
  }

  // ---------- hand-swap spectacle: card backs fly across the table ----------
  var swEl = null;
  function swapAnim(caption) {
    if (!swEl) {
      swEl = document.createElement('div');
      swEl.id = 'swapFx';
      document.body.appendChild(swEl);
    }
    var backs = '<img src="' + data.BACK_GENERAL + '"><img src="' + data.BACK_GENERAL +
      '"><img src="' + data.BACK_GENERAL + '">';
    swEl.innerHTML = '<div class="sw a">' + backs + '</div><div class="sw b">' + backs + '</div>' +
      '<div class="swcap">' + esc(caption) + '</div>';
    swEl.className = 'show';
    setTimeout(function () { swEl.className = ''; }, 2600);
  }

  // hover or select any card to see it full size (the printed text is small at table scale)
  var zoomEl = null;
  var ART2CARD = {};
  Object.keys(CARDS).forEach(function (id) { ART2CARD[CARDS[id].art] = CARDS[id]; });
  function showZoom(src, side, pinned) {
    if (!zoomEl) return;
    var c = ART2CARD[src];
    var cap = '';
    if (c && (c.text || c.pts !== undefined)) {
      cap = '<div class="zcap"><b>' + esc(c.name) + (c.pts !== undefined ? ' (' + (c.pts >= 0 ? '+' : '') + c.pts + ')' : '') +
        '</b>' + (c.text ? ' — ' + esc(c.text) : '') + '</div>';
    }
    zoomEl.innerHTML = '<img src="' + src + '">' + cap;
    // hover: big and centered; pinned (a selected card): docked right so the
    // table stays visible and clickable for melds / the menu
    zoomEl.className = 'show' + (pinned ? ' pinned' : '');
  }
  function hideZoom() { if (zoomEl) zoomEl.className = ''; }
  function bindZoom() {
    if (bindZoom.done) return;
    bindZoom.done = true;
    zoomEl = document.createElement('div');
    zoomEl.id = 'zoom';
    document.body.appendChild(zoomEl);
    document.addEventListener('mouseover', function (e) {
      if (ui.drag) return; // no popup while rearranging the hand
      var t = e.target;
      if (!t || t.tagName !== 'IMG') return;
      var src = t.getAttribute('src') || '';
      if (src.indexOf('assets/cards/') !== 0 || src.indexOf('back-') >= 0) return;
      showZoom(src, e.clientX > window.innerWidth / 2 ? 'left' : 'right', !!ui.pinned);
    });
    document.addEventListener('mouseout', function (e) {
      if (e.target && e.target.tagName === 'IMG') {
        // fall back to the pinned (selected) card instead of hiding
        if (ui.pinned) showZoom(ui.pinned, 'right', true);
        else hideZoom();
      }
    });
  }

  ui.setState = function (st) { // guest path: fresh state from host
    ui.st = st;
    ui.sel = ui.sel.filter(function (id) { return myHand().indexOf(id) >= 0; });
    render();
  };

  // ---------- local action application ----------
  function act(action) {
    var st = ui.st;
    if (ui.isGuest) { ui.send(action); return; }
    try {
      E.apply(st, action);
    } catch (e) {
      toast(e.message);
      return;
    }
    ui.sel = ui.sel.filter(function (id) { return myHand().indexOf(id) >= 0; });
    if (!ui.sel.length && ui.pinned) { ui.pinned = null; hideZoom(); }
    if (ui.onLocalAction) ui.onLocalAction();
    render();
    pump();
  }
  ui.act = act;

  // host: accept an action from a network guest (validated there), then pump
  ui.applyRemote = function (action) {
    try { E.apply(ui.st, action); } catch (e) { return String(e.message); }
    if (ui.onLocalAction) ui.onLocalAction();
    render();
    pump();
    return null;
  };

  // ---------- AI pump ----------
  function humanSeat(st, seat) { return !st.players[seat].isAI; }
  function needsHuman(st) {
    if (st.phase === 'roundEnd' || st.phase === 'gameEnd') return true;
    var seat = E.actor(st);
    if (st.pending && st.pending.type === 'passAll') {
      // AI turns in passAll are handled by decide; human only when a human seat is unchosen
      for (var i = 0; i < st.players.length; i++) {
        if (st.pending.need[i] && st.pending.chosen[i] === undefined && !st.players[i].isAI) return true;
      }
      return false;
    }
    return humanSeat(st, seat);
  }
  function pump() {
    if (ui.isGuest || ui.pumping) return;
    var st = ui.st;
    if (st.phase === 'gameEnd') { render(); return; }
    if (needsHuman(st)) return;
    ui.pumping = true;
    setTimeout(function () {
      ui.pumping = false;
      var a = G.ai.decide(st);
      if (a) act(a);
    }, st.pending ? 600 : 950); // unhurried — humans need to SEE the table
  }

  // ---------- rendering ----------
  function myHand() { return ui.st.players[ui.mySeat].hand; }
  function me() { return ui.st.players[ui.mySeat]; }
  function isMyTurn() { return ui.st.turn === ui.mySeat && !ui.st.pending; }

  function render() {
    var st = ui.st;
    if (st.turn === ui.mySeat && st.phase === 'draw' && ui.lastTurnKey !== st.round + ':' + st.turnsThisRound) {
      ui.lastTurnKey = st.round + ':' + st.turnsThisRound;
      sfx('turn');
    }
    $('tRound').textContent = 'round ' + st.round + ' · first to ' + st.target;
    checkMemberReveals(st);
    renderOpponents(st);
    renderPiles(st);
    renderMelds(st);
    renderLog(st);
    if (!ui.drag) renderHand(st); // don't yank the hand out from under a drag
    renderPrompt(st);
    renderModal(st);
  }

  function renderOpponents(st) {
    var row = $('oppRow');
    row.innerHTML = '';
    st.players.forEach(function (p) {
      var d = document.createElement('div');
      d.className = 'opp' + (st.turn === p.i && st.phase !== 'roundEnd' && st.phase !== 'gameEnd' ? ' active' : '') + (p.eliminated ? ' out' : '');
      var chips = p.members.map(function (id) {
        return '<img src="' + CARDS[id].art + '" title="' + CARDS[id].name + ' (' +
          (CARDS[id].pts >= 0 ? '+' : '') + CARDS[id].pts + ')">';
      }).join('');
      var nBacks = Math.min(p.hand.length, 12);
      var fan = '';
      for (var k = 0; k < nBacks; k++) fan += '<img src="' + data.BACK_GENERAL + '" alt="">';
      if (p.hand.length > 12) fan += '<span class="more">+' + (p.hand.length - 12) + '</span>';
      d.innerHTML =
        '<div class="nm">' + avatarChip(p) +
        esc(p.name) + (p.i === ui.mySeat ? ' <span class="you">(you)</span>' : '') +
        (p.skip ? ' 💤' : '') + '</div>' +
        '<div class="backfan" title="' + p.hand.length + ' cards in hand">' + fan + '</div>' +
        '<div class="meta">' + p.hand.length + ' cards · ' + p.score + ' pts · ⚓' +
        p.supporters + '/' + st.membersToWin + (p.eliminated ? ' · <b style="color:#ff8484">OUT</b>' : '') + '</div>' +
        '<div class="memberchips">' + chips + '</div>';
      row.appendChild(d);
    });
  }

  function renderPiles(st) {
    var el = $('piles');
    el.innerHTML = '';
    var canDraw = !ui.isGuestBlocked() && isMyTurn() && st.phase === 'draw';
    // draw pile
    el.appendChild(pile('Draw', data.BACK_GENERAL, st.drawPile.length, canDraw, function () {
      act({ t: 'draw', from: 'pile' });
    }));
    // discard
    var top = st.discard[st.discard.length - 1];
    el.appendChild(pile('Discard', top ? CARDS[top].art : null, st.discard.length,
      canDraw && !!top, function () { act({ t: 'draw', from: 'discard' }); }));
    // members — an exhausted pile shows as an empty slot, not a zero
    if (st.memberPile.length) {
      el.appendChild(pile('Members', data.BACK_MEMBER, st.memberPile.length, false, null));
    } else {
      var gone = pile('rolls closed', null, null, false, null);
      el.appendChild(gone);
    }
  }
  function pile(label, art, count, clickable, onclick) {
    var d = document.createElement('div');
    d.className = 'pile' + (clickable ? ' clickable' : '');
    var img = art ? '<img src="' + art + '">' : '<div class="cardimg" style="background:#0006"></div>';
    d.innerHTML = '<div class="stack">' + img +
      (count === null ? '' : '<span class="count">' + count + '</span>') + '</div>' + label;
    if (clickable && onclick) d.querySelector('.stack').addEventListener('click', onclick);
    return d;
  }

  function renderMelds(st) {
    var el = $('melds');
    el.innerHTML = '';
    var extendCard = ui.sel.length === 1 && CARDS[ui.sel[0]].kind === 'suit' ? ui.sel[0] : null;
    var canAct = !ui.isGuestBlocked() && isMyTurn() && st.phase === 'main';
    st.melds.forEach(function (m) {
      var d = document.createElement('div');
      var extendable = canAct && extendCard && E.canExtend(m, extendCard);
      d.className = 'meld' + (extendable ? ' extendable' : '');
      d.innerHTML = m.cards.map(function (e, idx) {
        // z-order decreases left→right: each card tucks UNDER its neighbor,
        // keeping every upper-right corner letter visible
        return '<div class="mc" style="z-index:' + (99 - idx) + '">' +
          '<img src="' + CARDS[e.card].art + '" title="' + esc(CARDS[e.card].name) + '">' +
          '<span class="who" style="background:' + SEAT_COLORS[e.by % 6] + '"></span></div>';
      }).join('');
      if (extendable) {
        d.title = 'Add ' + CARDS[extendCard].name + ' to this ' + m.type;
        d.addEventListener('click', function () {
          act({ t: 'extend', meldId: m.id, card: extendCard });
          ui.sel = [];
        });
      }
      // dragging a card from your hand onto a meld also plays it there
      d.addEventListener('dragover', function (e) {
        if (ui.drag && canAct && E.canExtend(m, ui.drag)) {
          e.preventDefault();
          d.classList.add('extendable');
        }
      });
      d.addEventListener('dragleave', function () {
        if (!extendable) d.classList.remove('extendable');
      });
      d.addEventListener('drop', function (e) {
        e.preventDefault();
        if (ui.drag && canAct && E.canExtend(m, ui.drag)) {
          var c2 = ui.drag;
          ui.drag = null;
          ui.sel = [];
          act({ t: 'extend', meldId: m.id, card: c2 });
        }
      });
      el.appendChild(d);
    });
    if (!st.melds.length) {
      el.innerHTML = '<div style="color:#6a4bb0;margin:auto">no melds on the table yet — ' +
        'sets are 3-4 matching letters, runs are 3+ letters in a row in one suit</div>';
    }
  }

  function sfx(name) { if (G.sound) G.sound.play(name); }
  function soundForLine(line) {
    if (line.indexOf('COMMODORE') >= 0) return 'fanfare';
    if (line.indexOf('— Round') === 0) return 'round';
    if (line.indexOf(' courts ') >= 0) return line.indexOf('(+') >= 0 ? 'good' : 'bad';
    if (line.indexOf(' melds a ') >= 0) return 'meld';
    if (line.indexOf(' adds ') >= 0) return 'pluck';
    if (line.indexOf(' plays ') >= 0) return 'special';
    if (line.indexOf('sit') >= 0 && line.indexOf('out') >= 0) return 'skip';
    if (line.indexOf(' discards ') >= 0) return 'discard';
    if (line.indexOf(' draws ') >= 0 || line.indexOf(' takes ') >= 0) return 'draw';
    if (line.indexOf(' steals ') >= 0 || line.indexOf(' swaps hands ') >= 0 ||
        line.indexOf(' hands a card ') >= 0) return 'special';
    if (line.indexOf(' retrieves ') >= 0 || line.indexOf(' whisper') >= 0) return 'special';
    if (line.indexOf(' ends ') >= 0 || line.indexOf('stock is spent') >= 0) return 'round';
    return null;
  }

  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  // paint every player-name mention in its seat color
  function colorizeLine(line) {
    var html = esc(line);
    var ps = ui.st.players.slice().sort(function (a, b) { return b.name.length - a.name.length; });
    ps.forEach(function (p) {
      var nameEsc = esc(p.name);
      var re = new RegExp('(^|[^\\w])(' + escRe(nameEsc) + ')(?=[^\\w]|$)', 'g');
      html = html.replace(re, function (m, pre, nm) {
        return pre + '<span style="color:' + SEAT_COLORS[p.i % 6] + ';font-weight:600">' + nm + '</span>';
      });
    });
    return html;
  }
  function renderLog(st) {
    var el = $('log');
    if (ui.logLen > st.log.length) { el.innerHTML = ''; ui.logLen = 0; ui.logQueue = []; }
    ui.logQueue = ui.logQueue || [];
    for (var qi = ui.logLen; qi < st.log.length; qi++) {
      var ln = st.log[qi];
      ui.logQueue.push({ t: ln, quiet: immediateFx(st, ln) });
    }
    ui.logLen = st.log.length;
    pumpLog();
  }
  // events that touch cards or players fire their spectacle the moment they
  // HAPPEN (state time); only the text line waits its turn in the ticker
  function immediateFx(st, line) {
    if (line.indexOf('💬') === 0) return false;
    if (line.indexOf(' swaps hands with ') >= 0) {
      swapAnim(line);
      sfx('special');
      if (line.indexOf(me().name) >= 0) { toast('⚠️ ' + line, 5000); sfx('alert'); }
      return true;
    }
    if (line.indexOf('Cards slide') === 0) {
      toast('🔁 ' + line + ' — your new card is glowing', 4200);
      sfx('special');
      return true;
    }
    if (line.indexOf(me().name) >= 0 && st.turn !== ui.mySeat &&
        line.indexOf('— Round') !== 0 && line.indexOf(me().name) !== 0) {
      toast('⚠️ ' + line, 5000);
      sfx('alert');
      return true;
    }
    return false;
  }
  // engine bursts emit many lines at once; drip them at reading pace so the
  // narration lines up with what the table is doing (sounds fire per line)
  function pumpLog() {
    if (ui.logTimer || !ui.logQueue || !ui.logQueue.length) return;
    var step = function () {
      ui.logTimer = null;
      if (!ui.logQueue.length) return;
      displayLogLine(ui.st, ui.logQueue.shift());
      var urgent = ui.st.pending || ui.st.phase === 'roundEnd' || ui.st.phase === 'gameEnd';
      var delay = urgent ? 60 : (ui.logQueue.length > 6 ? 160 : 420);
      ui.logTimer = setTimeout(step, delay);
    };
    step();
  }
  function displayLogLine(st, entry) {
    var el = $('log');
    var line = entry.t;
    var d = document.createElement('div');
    if (line.indexOf('💬') === 0) {
      d.className = 'chatline';
      d.innerHTML = colorizeLine(line);
      el.appendChild(d);
      if (line.indexOf('💬 ' + me().name + ':') !== 0) { toast(line, 4000); sfx('pluck'); }
      el.scrollTop = el.scrollHeight;
      return;
    }
    if (line.indexOf(me().name) === 0) d.className = 'me';
    d.innerHTML = colorizeLine(line);
    el.appendChild(d);
    if (!entry.quiet) {
      var snd = soundForLine(line);
      if (snd) sfx(snd);
    }
    el.scrollTop = el.scrollHeight;
  }

  // my hand in local visual order: keep prior order, append new draws at the end
  function orderedHand() {
    var hand = myHand();
    var order = ui.handOrder.filter(function (id) { return hand.indexOf(id) >= 0; });
    hand.forEach(function (id) { if (order.indexOf(id) < 0) order.push(id); });
    ui.handOrder = order;
    return order;
  }
  var SUIT_ORDER = { party: 0, yacht: 1, cocktail: 2, cruise: 3 };
  function sortHand(mode) {
    ui.handOrder = orderedHand().slice().sort(function (a, b) {
      var ca = CARDS[a], cb = CARDS[b];
      if (ca.kind !== cb.kind) return ca.kind === 'special' ? 1 : -1; // specials to the right
      if (ca.kind === 'special') return ca.name < cb.name ? -1 : 1;
      return mode === 'letter'
        ? (ca.rank - cb.rank) || (SUIT_ORDER[ca.suit] - SUIT_ORDER[cb.suit])
        : (SUIT_ORDER[ca.suit] - SUIT_ORDER[cb.suit]) || (ca.rank - cb.rank);
    });
    render();
  }

  function renderHand(st) {
    var el = $('handRow');
    el.innerHTML = '';
    var hand = orderedHand();
    var chooseMode = handChooseMode(st);
    // cards that just arrived (draws, passes, steals-back) pulse for a moment
    var now = Date.now();
    ui.newCards = ui.newCards || {};
    if (ui.knownHand) {
      hand.forEach(function (id) {
        if (ui.knownHand.indexOf(id) < 0) ui.newCards[id] = now;
      });
    }
    ui.knownHand = hand.slice();
    hand.forEach(function (id, idx) {
      var c = CARDS[id];
      var d = document.createElement('div');
      var fresh = ui.newCards[id] && now - ui.newCards[id] < 3500;
      var outgoing = st.pending && st.pending.type === 'passAll' &&
        st.pending.chosen && st.pending.chosen[ui.mySeat] === id;
      d.className = 'hcard' + (ui.sel.indexOf(id) >= 0 ? ' sel' : '') + (fresh ? ' fresh' : '') + (outgoing ? ' outgoing' : '');
      d.style.zIndex = String(200 - idx);
      if (d.style.setProperty) {
        var mid = (hand.length - 1) / 2;
        d.style.setProperty('--rot', ((idx - mid) * Math.min(2.4, 16 / Math.max(1, hand.length))).toFixed(2) + 'deg');
        d.style.setProperty('--arc', (Math.pow(Math.abs(idx - mid), 1.6) * 2.1).toFixed(1) + 'px');
      } // tuck rightward: corner letters stay visible
      d.innerHTML = '<img draggable="false" src="' + c.art + '" title="' +
        esc(c.name + (c.text ? ' — ' + c.text : '')) + '">';
      d.addEventListener('click', function () { onHandClick(st, id, chooseMode); });
      d.draggable = true;
      d.addEventListener('dragstart', function (e) {
        ui.drag = id;
        hideZoom();
        if (e.dataTransfer) e.dataTransfer.setData('text/plain', id);
      });
      d.addEventListener('dragend', function () { ui.drag = null; render(); });
      d.addEventListener('dragover', function (e) { e.preventDefault(); });
      d.addEventListener('drop', function (e) {
        e.preventDefault();
        if (!ui.drag || ui.drag === id) return;
        var o = ui.handOrder;
        o.splice(o.indexOf(ui.drag), 1);
        o.splice(o.indexOf(id), 0, ui.drag);
        ui.drag = null;
        render();
      });
      el.appendChild(d);
    });
    var p = me();
    var chips = p.members.map(function (id) {
      return '<img src="' + CARDS[id].art + '" title="' + esc(CARDS[id].name) + ' (' +
        (CARDS[id].pts >= 0 ? '+' : '') + CARDS[id].pts + ')">';
    }).join('') + p.played.map(function (id) {
      return '<img src="' + CARDS[id].art + '" title="' + esc(CARDS[id].name) + ' (played, +2)">';
    }).join('');
    $('myStatus').innerHTML =
      '<div>' + esc(p.name) + ' — ' + p.score + ' pts · ⚓' + p.supporters + '/' +
      st.membersToWin + ' members backing you' + (p.eliminated ? ' · OUT OF THE RUNNING' : '') + ' · ' +
      '<button class="ghost" id="sortSuit" title="Group by suit — spot runs">sort by suit</button> ' +
      '<button class="ghost" id="sortAZ" title="Group by letter — spot sets">sort A–L</button>' +
      '<span style="opacity:.6"> · drag cards to rearrange</span></div>' +
      '<div class="chips">' + chips + '</div>';
    $('sortSuit').addEventListener('click', function () { sortHand('suit'); });
    $('sortAZ').addEventListener('click', function () { sortHand('letter'); });
  }

  // which inline hand-choose is active for me?
  function handChooseMode(st) {
    var pend = st.pending;
    if (!pend) return null;
    if (pend.type === 'chooseCard' && pend.by === ui.mySeat) return pend;
    if (pend.type === 'passAll' && pend.need[ui.mySeat] && pend.chosen[ui.mySeat] === undefined) return pend;
    return null;
  }

  function onHandClick(st, id, chooseMode) {
    if (chooseMode) {
      if (chooseMode.type === 'passAll') act({ t: 'resolve', player: ui.mySeat, card: id });
      else act({ t: 'resolve', card: id });
      return;
    }
    if (!isMyTurn() || st.phase !== 'main') return;
    var i = ui.sel.indexOf(id);
    if (i >= 0) ui.sel.splice(i, 1);
    else ui.sel.push(id);
    // pin a large preview of the newest selected card (works on touch too)
    ui.pinned = ui.sel.length ? CARDS[ui.sel[ui.sel.length - 1]].art : null;
    if (ui.pinned) showZoom(ui.pinned, 'right', true); else hideZoom();
    render();
  }

  function renderPrompt(st) {
    var el = $('prompt');
    el.innerHTML = '';
    var pend = st.pending;
    var mode = handChooseMode(st);
    if (st.pending && st.pending.type === 'passAll' &&
        st.pending.chosen && st.pending.chosen[ui.mySeat] !== undefined) {
      var waitingOnP = st.players.filter(function (pl) {
        return st.pending.need[pl.i] && st.pending.chosen[pl.i] === undefined;
      }).map(function (pl) { return pl.name; });
      el.innerHTML = '<span class="msg">🔒 Your card is locked in (dashed outline) — waiting on ' +
        esc(waitingOnP.join(', ') || 'the pass') + '…</span>';
      return;
    }
    if (mode) {
      var what = mode.type === 'passAll'
        ? 'Choose a card to pass ' + (mode.dir === 1 ? 'left' : 'right') + ' — everyone passes one'
        : (mode.mode === 'discard' ? 'You alone must discard one card' : 'Choose a card to give');
      el.innerHTML = '<span class="msg">' + what + ' (' + esc(mode.source || '') + ') — click a card</span>';
      return;
    }
    if (pend || st.phase === 'roundEnd' || st.phase === 'gameEnd') {
      if (pend && pend.by !== ui.mySeat) {
        el.innerHTML = '<span class="msg">Waiting on ' + esc(st.players[E.actor(st)].name) + '…</span>';
      }
      return;
    }
    if (!isMyTurn()) {
      el.innerHTML = '<span class="msg">' + esc(st.players[st.turn].name) + ' has the helm…</span>';
      return;
    }
    if (st.phase === 'draw') {
      el.innerHTML = '<span class="msg">Your turn — draw from the pile or take the discard</span>';
      return;
    }
    // main phase controls
    var selType = E.meldType(ui.sel);
    var one = ui.sel.length === 1 ? CARDS[ui.sel[0]] : null;
    var b = [];
    b.push(btn('Meld ' + (selType ? '(' + selType + ')' : ''), !!selType, function () {
      var cards = ui.sel.slice(); ui.sel = [];
      act({ t: 'meldNew', cards: cards });
    }));
    b.push(btn('Play special', !!(one && one.kind === 'special' && !st.specialUsed), function () {
      var id = ui.sel[0]; ui.sel = [];
      act({ t: 'playSpecial', card: id });
    }));
    var canCourt = st.meldedThisTurn && !st.courted && st.memberPile.length > 0;
    var courtBtn = btn('Court a member ⚓', canCourt, function () {
      act({ t: 'court' });
    }, canCourt ? 'You melded this turn — press your luck with the member deck (before you discard!)'
       : 'Meld or extend first, then press your luck with the member deck');
    if (canCourt) courtBtn.className = 'court-ready';
    b.push(courtBtn);
    b.push(btn('Discard & end turn', !!(one && one.id !== st.tookFromDiscard || (one && myHand().length === 1)), function () {
      var id = ui.sel[0]; ui.sel = [];
      act({ t: 'discard', card: id });
    }));
    b.push(btn('Hint', true, function () {
      var ms = E.findMelds(myHand());
      if (ms.length) { ui.sel = ms[0].slice(); render(); toast('A meld is ready — hit Meld!'); }
      else {
        var ext = null;
        myHand().forEach(function (id) {
          st.melds.forEach(function (m) { if (!ext && E.canExtend(m, id)) ext = id; });
        });
        if (ext) { ui.sel = [ext]; render(); toast('That card can extend a meld on the table — click the glowing meld.'); }
        else toast('No meld yet — build sets (same letter) or runs (same suit, letters in a row).');
      }
    }));
    b.forEach(function (x) { el.appendChild(x); });
  }
  function btn(label, enabled, fn, title) {
    var x = document.createElement('button');
    x.textContent = label;
    x.disabled = !enabled;
    if (title) x.title = title;
    x.addEventListener('click', fn);
    return x;
  }

  ui.isGuestBlocked = function () { return false; }; // both guest+host act through act()
  ui.pumpNow = function () { render(); pump(); };

  // ---------- modal ----------
  function renderModal(st) {
    var pend = st.pending;
    var modal = $('modal'), box = $('modalBox');

    if (st.phase === 'gameEnd') {
      var w = st.players[st.winner];
      box.innerHTML = '<h3>' + esc(w.name) + ' is Commodore! 🏆</h3>' +
        '<div class="sub">the burgee is hoisted — ' + w.score + ' points, ' +
        w.supporters + ' members in support</div>' +
        scoreTable(st) +
        '<button class="gold" onclick="location.reload()">Back to the clubhouse</button>';
      modal.className = 'open';
      return;
    }
    if (st.phase === 'roundEnd') {
      box.innerHTML = '<h3>Round ' + st.round + ' — scores</h3>' + scoreTable(st) +
        (ui.isGuest
          ? '<div class="sub">waiting for the host to deal the next round…</div>'
          : '<button class="gold" id="mNext">Deal the next round</button>');
      modal.className = 'open';
      if (!ui.isGuest) $('mNext').addEventListener('click', function () { act({ t: 'nextRound' }); });
      return;
    }
    if (!pend || (pend.by !== ui.mySeat && pend.type !== 'passAll')) { modal.className = ''; return; }

    if (pend.type === 'chooseTarget' && pend.by === ui.mySeat) {
      var opts = st.players.filter(function (p) {
        if (p.eliminated) return false;
        if (p.i === ui.mySeat && !pend.allowSelf) return false;
        if (pend.needCards && pend.then !== 'peek' && !p.hand.length) return false;
        return true;
      });
      var subs = {
        forceDiscard: 'choose ONE player — they alone discard one card of their choice (picking yourself slims your own hand)',
        steal: 'choose one player to steal a random card from',
        peek: 'choose one player whose hand you\'ll see',
        swapHands: 'choose one player to swap entire hands with',
        forceDraw: 'choose one player who must draw 2 cards',
        skip: 'choose one player to sit out their next turn',
        giveTo: 'choose one player to receive your card'
      };
      box.innerHTML = '<h3>' + esc(pend.source) + '</h3><div class="sub">' +
        (subs[pend.then] || 'choose a player') + '</div>' +
        '<div class="choices" id="mCh"></div>';
      var ch = box.querySelector('#mCh');
      opts.forEach(function (p) {
        var x = document.createElement('button');
        x.className = 'big';
        x.textContent = p.name + (p.i === ui.mySeat ? ' (you)' : '') + ' — ' + p.hand.length + ' cards';
        x.addEventListener('click', function () { act({ t: 'resolve', target: p.i }); });
        ch.appendChild(x);
      });
      modal.className = 'open';
      return;
    }
    if (pend.type === 'pickDiscard' && pend.by === ui.mySeat) {
      box.innerHTML = '<h3>' + esc(pend.source) + '</h3><div class="sub">take any card from the discard pile</div>' +
        '<div class="choices" id="mCh"></div>';
      cardChoices(box.querySelector('#mCh'), st.discard, function (id) {
        act({ t: 'resolve', card: id });
      });
      modal.className = 'open';
      return;
    }
    if (pend.type === 'gossip' && pend.by === ui.mySeat) {
      box.innerHTML = '<h3>Dockside Gossip</h3><div class="sub">keep one — the others hit the discard pile</div>' +
        '<div class="choices" id="mCh"></div>';
      cardChoices(box.querySelector('#mCh'), pend.cards, function (id) {
        act({ t: 'resolve', keep: id });
      });
      modal.className = 'open';
      return;
    }
    if (pend.type === 'reveal' && pend.by === ui.mySeat) {
      box.innerHTML = '<h3>' + esc(st.players[pend.target].name) + "'s hand</h3>" +
        '<div class="choices">' + pend.cards.map(function (id) {
          return '<img src="' + CARDS[id].art + '" style="width:100px;border-radius:8px" title="' + esc(CARDS[id].name) + '">';
        }).join('') + '</div><br><button class="gold" id="mOk">Got it</button>';
      modal.className = 'open';
      $('mOk').addEventListener('click', function () { act({ t: 'resolve' }); });
      return;
    }
    modal.className = ''; // e.g. passAll handled inline; others not mine
  }

  function cardChoices(el, ids, onPick) {
    ids.forEach(function (id) {
      var d = document.createElement('div');
      d.className = 'ch';
      d.innerHTML = '<img src="' + CARDS[id].art + '" title="' + esc(CARDS[id].name) + '">';
      d.addEventListener('click', function () { onPick(id); });
      el.appendChild(d);
    });
  }

  function scoreTable(st) {
    var rows = st.lastScores || E.scoreRound(st);
    var html = '<table><tr><th>skipper</th><th>melds</th><th>size bonus</th><th>specials</th><th>members</th>' +
      '<th>toast</th><th>hand</th><th>round</th><th class="total">total</th><th>⚓ support</th></tr>';
    rows.forEach(function (r) {
      var p = st.players[r.player];
      html += '<tr><td>' + esc(r.name) + '</td><td>' + r.melded + '</td><td>' + (r.bonus || 0) +
        '</td><td>' + r.specials +
        '</td><td>' + r.members + '</td><td>' + r.toast + '</td><td>' + r.hand +
        '</td><td>' + r.total + '</td><td class="total">' + p.score + '</td><td>' +
        p.supporters + '/' + st.membersToWin + '</td></tr>';
    });
    return html + '</table>';
  }

  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.style.display = 'none'; }, ms || 3800);
  }
  ui.toast = toast;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
    });
  }

  G.ui = ui;
}(window.CC = window.CC || {}));
