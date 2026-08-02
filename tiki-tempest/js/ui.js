// TIKI TEMPEST — table renderer + interaction. Same architecture as
// commodore-cup: drives the engine locally (solo/host) or mirrors a host (guest).
(function (G) {
  'use strict';
  var E = null, ai = null, data = G.data, CARDS = data.CARDS;
  var $ = function (id) { return document.getElementById(id); };
  var SEAT_COLORS = ['#ffcf5c', '#4fd8c4', '#ff8c42', '#8dff9e', '#c39bff', '#ff6b6b'];

  var ui = {
    st: null, mySeat: 0, isGuest: false, roomCode: '',
    send: null, onLocalAction: null,
    sel: null, handOrder: [], drag: null, pinned: null,
    serveChoice: null,
    pumping: false, logLen: 0
  };

  ui.begin = function (st, mySeat, opts) {
    ui.st = st; ui.mySeat = mySeat;
    E = st.mode === 'draft' ? G.engineDraft : G.engineClassic;
    ai = st.mode === 'draft' ? G.aiDraft : G.aiClassic;
    ui.sel2 = null;
    ui.isGuest = !!(opts && opts.guest);
    ui.send = (opts && opts.send) || null;
    ui.onLocalAction = (opts && opts.onLocalAction) || null;
    ui.roomCode = (opts && opts.room) || '';
    ui.sel = null; ui.logLen = 0; ui.handOrder = []; ui.knownServes = null;
    $('menu').style.display = 'none';
    $('table').style.display = 'block';
    $('tNet').textContent = ui.roomCode ? 'room ' + ui.roomCode : '';
    if ($('chatBox')) $('chatBox').style.display = ui.roomCode ? 'flex' : 'none';
    bindZoom();
    render();
    pump();
  };
  ui.setState = function (st) {
    ui.st = st;
    if (ui.sel && myHand().indexOf(ui.sel) < 0) ui.sel = null;
    render();
  };

  // ---------- serve reveal: cocktails sweep in big ----------
  var srEl = null, srTimer = null;
  function serveReveal(entry, who) {
    if (!srEl) {
      srEl = document.createElement('div');
      srEl.id = 'serveReveal';
      srEl.addEventListener('click', function () { srEl.className = ''; });
      document.body.appendChild(srEl);
    }
    var c = CARDS[entry.card];
    srEl.innerHTML = '<div class="mr"><img src="' + c.art + '">' +
      '<div class="cap">' + esc(who) + ' serves ' + esc(c.name) + ' — ' + entry.pts + ' points' +
      (entry.doubled ? ' · DOUBLED!' : '') + (entry.umbrella ? ' ☂️' : '') + '</div></div>';
    srEl.className = 'show';
    clearTimeout(srTimer);
    srTimer = setTimeout(function () { srEl.className = ''; }, 3000);
  }
  function checkServeReveals(st) {
    var counts = st.players.map(function (p) { return p.servedTotal; });
    if (!ui.knownServes) { ui.knownServes = counts; return; }
    for (var i = 0; i < st.players.length; i++) {
      if (counts[i] > (ui.knownServes[i] || 0) && st.players[i].served.length) {
        serveReveal(st.players[i].served[st.players[i].served.length - 1], st.players[i].name);
      }
    }
    ui.knownServes = counts;
  }

  // ---------- zoom ----------
  var zoomEl = null;
  var ART2CARD = {};
  Object.keys(CARDS).forEach(function (id) { ART2CARD[CARDS[id].art] = CARDS[id]; });
  function showZoom(src, side) {
    if (!zoomEl) return;
    var c = ART2CARD[src];
    var cap = '';
    if (c && (c.text || c.pts !== undefined)) {
      cap = '<div class="zcap"><b>' + esc(c.name) + (c.pts !== undefined ? ' (' + (c.pts >= 0 ? '+' : '') + c.pts + ')' : '') +
        '</b>' + (c.text ? ' — ' + esc(c.text) : '') + '</div>';
    }
    zoomEl.innerHTML = '<img src="' + src + '">' + cap;
    zoomEl.className = 'show ' + side;
  }
  function hideZoom() { if (zoomEl) zoomEl.className = ''; }
  function bindZoom() {
    if (bindZoom.done) return;
    bindZoom.done = true;
    zoomEl = document.createElement('div');
    zoomEl.id = 'zoom';
    document.body.appendChild(zoomEl);
    document.addEventListener('mouseover', function (e) {
      if (ui.drag) return;
      var t = e.target;
      if (!t || t.tagName !== 'IMG') return;
      var src = t.getAttribute('src') || '';
      if (src.indexOf('assets/cards/') !== 0 || src.indexOf('back-') >= 0) return;
      showZoom(src, e.clientX > window.innerWidth / 2 ? 'left' : 'right');
    });
    document.addEventListener('mouseout', function (e) {
      if (e.target && e.target.tagName === 'IMG') {
        if (ui.pinned) showZoom(ui.pinned, 'right'); else hideZoom();
      }
    });
  }

  // ---------- act / pump ----------
  function act(action) {
    if (ui.isGuest) { ui.send(action); return; }
    try {
      E.apply(ui.st, action);
    } catch (e) { toast(e.message); return; }
    if (ui.sel && myHand().indexOf(ui.sel) < 0) { ui.sel = null; ui.pinned = null; hideZoom(); }
    if (ui.onLocalAction) ui.onLocalAction();
    render();
    pump();
  }
  ui.act = act;
  ui.applyRemote = function (action) {
    try { E.apply(ui.st, action); } catch (e) { return String(e.message); }
    if (ui.onLocalAction) ui.onLocalAction();
    render();
    pump();
    return null;
  };
  function needsHuman(st) {
    if (st.phase === 'roundEnd' || st.phase === 'gameEnd') return true;
    if (!st.pending && st.mode === 'draft') {
      if (st.phase !== 'pick') return true;
      // AI seats pick freely; wait only when every unpicked seat is human
      for (var d = 0; d < st.players.length; d++) {
        if (st.players[d].isAI && st.players[d].hand.length && st.picks[d] === undefined) return false;
      }
      return true;
    }
    if (st.pending && st.pending.type === 'passAll') {
      for (var i = 0; i < st.players.length; i++) {
        if (st.pending.need[i] && st.pending.chosen[i] === undefined && !st.players[i].isAI) return true;
      }
      return false;
    }
    return !st.players[E.actor(st)].isAI;
  }
  function pump() {
    if (ui.isGuest || ui.pumping) return;
    var st = ui.st;
    if (st.phase === 'gameEnd') { render(); return; }
    if (needsHuman(st)) return;
    ui.pumping = true;
    setTimeout(function () {
      ui.pumping = false;
      var a = ai.decide(st);
      if (a) act(a);
    }, st.pending ? 350 : 550);
  }
  ui.pumpNow = function () { render(); pump(); };
  ui.eng = function () { return E; };

  // ---------- helpers ----------
  function myHand() { return ui.st.players[ui.mySeat].hand; }
  function me() { return ui.st.players[ui.mySeat]; }
  function isMyTurn() { return ui.st.turn === ui.mySeat && !ui.st.pending; }
  function sfx(name) { if (G.sound) G.sound.play(name); }

  // ---------- render ----------
  function render() {
    var st = ui.st;
    if (st.mode === 'draft') {
      if (st.phase === 'pick' && st.picks[ui.mySeat] === undefined && me().hand.length) {
        var bellKey = 'd' + st.round + ':' + me().hand.length;
        if (ui.lastTurnKey !== bellKey) { ui.lastTurnKey = bellKey; sfx('turn'); }
      }
    } else if (st.turn === ui.mySeat && st.phase === 'draw' && ui.lastTurnKey !== st.round + ':' + st.turnsThisRound) {
      ui.lastTurnKey = st.round + ':' + st.turnsThisRound;
      sfx('turn');
    }
    if (st.mode === 'draft') {
      $('tRound').textContent = 'round ' + st.round + '/' + (st.finalRound ? st.round : st.rounds) +
        ' · pick ' + Math.min(st.passes, (st.passCount || 0) + 1) + '/' + st.passes +
        ' · passing ' + (st.dir === 1 ? '⟵ left' : 'right ⟶') +
        (st.finalRound ? ' · LAST CALL' : '');
    } else {
      var turnsLeft = Math.max(0, data.TURNS_PER_ROUND * st.players.length - st.turnsThisRound);
      $('tRound').textContent = 'round ' + st.round + '/' + (st.finalRound ? st.round : st.rounds) +
        ' · ' + turnsLeft + ' turns till closing' + (st.finalRound ? ' · LAST CALL' : '');
    }
    checkServeReveals(st);
    renderOpponents(st);
    renderPiles(st);
    renderMenu(st);
    renderLog(st);
    if (!ui.drag) renderHand(st);
    renderPrompt(st);
    renderModal(st);
  }

  function renderOpponents(st) {
    var row = $('oppRow');
    row.innerHTML = '';
    var seagullMine = st.pending && st.pending.type === 'seagull' && st.pending.by === ui.mySeat;
    st.players.forEach(function (p) {
      var d = document.createElement('div');
      var active = st.mode === 'draft'
        ? (st.phase === 'pick' && p.hand.length > 0 && st.picks[p.i] === undefined)
        : (st.turn === p.i && st.phase !== 'roundEnd' && st.phase !== 'gameEnd');
      d.className = 'opp' + (active ? ' active' : '');
      var fan = '';
      for (var k = 0; k < Math.min(p.hand.length, 12); k++) fan += '<img src="' + data.BACK_MAIN + '" alt="">';
      var barImgs = p.bar.map(function (id) {
        var stealable = seagullMine && !p.umbrellas.length;
        return '<img src="' + CARDS[id].art + '" title="' + esc(CARDS[id].name) + '"' +
          (stealable ? ' class="steal" data-p="' + p.i + '" data-c="' + id + '"' : '') + '>';
      }).join('');
      var servedImgs = p.served.map(function (e) {
        return '<img src="' + CARDS[e.card].art + '" title="' + esc(CARDS[e.card].name + ' — ' + e.pts + ' pts') + '">';
      }).join('');
      d.innerHTML =
        '<div class="nm"><span class="seatdot" style="background:' + SEAT_COLORS[p.i % 6] + '"></span>' +
        esc(p.name) + (p.i === ui.mySeat ? ' <span class="you">(you)</span>' : '') +
        (p.umbrellas && p.umbrellas.length ? ' <span class="umb" title="Bar protected by ' +
          p.umbrellas.length + ' Paper Umbrella(s)">' + new Array(p.umbrellas.length + 1).join('☂️') + '</span>' : '') +
        (st.mode === 'draft' && st.phase === 'pick' && p.hand.length && st.picks[p.i] !== undefined
          ? ' <span class="umb" title="Pick locked in">✔</span>' : '') + '</div>' +
        '<div class="backfan" title="' + p.hand.length + ' cards in hand">' + fan + '</div>' +
        '<div class="meta">' + p.score + ' pts · 🍺' + p.beers.length + ' · ' + p.servedTotal + ' served</div>' +
        '<div class="zone"><span class="zlabel">bar</span>' + (barImgs || '—') + '</div>' +
        '<div class="zone"><span class="zlabel">served</span>' + (servedImgs || '—') + '</div>' +
        (st.mode === 'draft' && p.banked.length
          ? '<div class="zone"><span class="zlabel">set aside</span>' + p.banked.map(function (id) {
              return '<img src="' + CARDS[id].art + '" title="' + esc(CARDS[id].name) + '">';
            }).join('') + '</div>' : '');
      row.appendChild(d);
    });
    if (seagullMine) {
      row.querySelectorAll('img.steal').forEach(function (img) {
        img.addEventListener('click', function () {
          act({ t: 'resolve', player: parseInt(img.dataset.p, 10), card: img.dataset.c });
        });
      });
    }
  }

  function renderPiles(st) {
    var el = $('piles');
    el.innerHTML = '';
    if (st.mode === 'draft') {
      el.appendChild(pile('Deck', data.BACK_MAIN, st.deck.length, false, null));
    } else {
      var canDraw = isMyTurn() && st.phase === 'draw';
      el.appendChild(pile('Draw 2', data.BACK_MAIN, st.deck.length, canDraw, function () {
        act({ t: 'draw' });
      }));
    }
    var top = st.discard[st.discard.length - 1];
    el.appendChild(pile('Discard', top ? CARDS[top].art : null, st.discard.length, false, null));
    el.appendChild(pile('Recipes', data.BACK_RECIPE, st.recipeDeck.length, false, null));
  }
  function pile(label, art, count, clickable, onclick) {
    var d = document.createElement('div');
    d.className = 'pile' + (clickable ? ' clickable' : '');
    var img = art ? '<img src="' + art + '">' : '<div class="cardimg" style="background:#0006"></div>';
    d.innerHTML = '<div class="stack">' + img + '<span class="count">' + count + '</span></div>' + label;
    if (clickable && onclick) d.querySelector('.stack').addEventListener('click', onclick);
    return d;
  }

  var ING_NAME = {};
  data.INGREDIENTS.forEach(function (ing) { ING_NAME[ing.id] = ing.name; });
  function recipeCaption(r) {
    var have = {};
    me().bar.forEach(function (id) { have[CARDS[id].ing] = (have[CARDS[id].ing] || 0) + 1; });
    return Object.keys(r.needs).map(function (k) {
      var need = r.needs[k], got = Math.min(have[k] || 0, need);
      var cls = got >= need ? 'got' : (got > 0 ? 'part' : '');
      var txt = need + ' ' + ING_NAME[k] + (got > 0 && got < need ? ' (' + got + ')' : '');
      return '<div class="ri ' + cls + '">' + esc(txt) + '</div>';
    }).join('') + '<div class="ptsline">' + r.pts + ' pts</div>';
  }
  function renderMenu(st) {
    var el = $('menuCards');
    el.innerHTML = '';
    var canAct = st.mode === 'draft'
      ? (st.phase === 'pick' || st.phase === 'reveal')
      : (isMyTurn() && st.phase === 'main');
    st.menu.forEach(function (recId) {
      var d = document.createElement('div');
      var servable = canAct && E.canServe(st, me(), recId);
      d.className = 'mrec' + (servable ? ' servable' : '');
      d.innerHTML = '<div class="rcp">' + recipeCaption(CARDS[recId]) + '</div>' +
        '<img src="' + CARDS[recId].art + '" title="' +
        esc(CARDS[recId].name + ' — ' + CARDS[recId].pts + ' pts') + '">';
      if (servable) {
        d.title = 'Serve ' + CARDS[recId].name + '!';
        d.addEventListener('click', function () { wantServe(recId); });
      }
      el.appendChild(d);
    });
    if (!st.menu.length) el.innerHTML = '<div style="color:#8a5a34;margin:auto">the menu is drunk dry</div>';
  }

  function wantServe(recId) {
    var hasDouble = ui.st.mode === 'draft'
      ? me().banked.some(function (id) { return CARDS[id].fx === 'double'; })
      : myHand().some(function (id) { return CARDS[id].fx === 'double'; });
    if (!hasDouble) { act({ t: 'serve', seat: ui.mySeat, recipe: recId }); return; }
    ui.serveChoice = recId;
    render();
  }

  function renderLog(st) {
    var el = $('log');
    if (ui.logLen > st.log.length) { el.innerHTML = ''; ui.logLen = 0; }
    for (var i = ui.logLen; i < st.log.length; i++) {
      var d = document.createElement('div');
      var line = st.log[i];
      if (line.indexOf('💬') === 0) {
        d.className = 'chatline';
        d.textContent = line;
        el.appendChild(d);
        if (line.indexOf('💬 ' + me().name + ':') !== 0) { toast(line, 4000); sfx('pluck'); }
        continue;
      }
      if (line.indexOf(me().name) === 0) d.className = 'me';
      d.textContent = line;
      el.appendChild(d);
      // table-shaking events get a banner for everyone, not just a log line
      if (line.indexOf('⛈') >= 0) { toast(line, 6500); sfx('bad'); }
      else if (line.indexOf('🔔') >= 0 || line.indexOf('📖') >= 0) { toast(line, 5500); sfx('round'); }
      // fizzled effects look like bugs if they only whisper in the log
      else if (line.indexOf('The seagull finds') === 0 || line.indexOf('The torch gutters') === 0 ||
               line.indexOf('No hands worth plundering') === 0 || line.indexOf("doesn't have it") >= 0) {
        toast('💨 ' + line, 4500); sfx('skip');
      }
      else if (line.indexOf(me().name + ' sets aside Make It a Double') === 0) {
        toast('✌️ Make It a Double set aside — spend it when you serve a cocktail', 6000);
      }
      var idx = line.indexOf(me().name);
      var tableWide = ['👐', '—', '🌴', '🌊', '🔔', '⛈', '🏆', '📖'].indexOf(line.charAt(0)) >= 0 ||
        line.indexOf('Round ') === 0;
      var personal = idx > 0 && !tableWide &&
        (st.mode === 'draft' || st.turn !== ui.mySeat);
      if (personal) {
        toast('⚠️ ' + line, 5000);
        sfx('alert');
      } else {
        var s = soundForLine(line);
        if (s) sfx(s);
      }
    }
    ui.logLen = st.log.length;
    el.scrollTop = el.scrollHeight;
  }
  function soundForLine(line) {
    if (line.indexOf('Master Mixologist') >= 0) return 'fanfare';
    if (line.indexOf('STORM SURGE') >= 0) return 'bad';
    if (line.indexOf('LAST CALL') >= 0) return 'round';
    if (line.indexOf('— Round') === 0) return 'round';
    if (line.indexOf(' serves a ') >= 0) return 'good';
    if (line.indexOf(' plays ') >= 0) return 'special';
    if (line.indexOf(' shelves a beer') >= 0) return 'discard';
    if (line.indexOf(' stocks ') >= 0) return 'pluck';
    if (line.indexOf('👐') === 0) return 'pluck';
    if (line.indexOf('🌊') === 0 || line.indexOf('🌴') === 0) return 'special';
    if (line.indexOf('seagull swipes') >= 0) return 'special';
    if (line.indexOf(' plunders ') >= 0) return 'special';
    if (line.indexOf('hands it over') >= 0) return 'bad';
    if (line.indexOf(' demands ') >= 0) return 'special';
    if (line.indexOf('torchlight') >= 0) return 'draw';
    if (line.indexOf(' sets aside ') >= 0) return 'pluck';
    if (line.indexOf('paper umbrella') >= 0) return 'pluck';
    if (line.indexOf(' ends (') >= 0) return 'round';
    if (line.indexOf(' draws ') >= 0 || line.indexOf('draws 2') >= 0) return 'draw';
    return null;
  }

  // ---------- hand ----------
  function orderedHand() {
    var hand = myHand();
    if (ui.st.mode === 'draft') {
      // draft hands churn every pass — keep them permanently sorted
      ui.handOrder = hand.slice().sort(cmpCards);
      return ui.handOrder;
    }
    var order = ui.handOrder.filter(function (id) { return hand.indexOf(id) >= 0; });
    hand.forEach(function (id) { if (order.indexOf(id) < 0) order.push(id); });
    ui.handOrder = order;
    return order;
  }
  var KIND_ORDER = { ing: 0, beer: 1, special: 2 };
  function cmpCards(a, b) {
    var ca = CARDS[a], cb = CARDS[b];
    if (ca.kind !== cb.kind) return KIND_ORDER[ca.kind] - KIND_ORDER[cb.kind];
    if (ca.name !== cb.name) return ca.name < cb.name ? -1 : 1;
    return a < b ? -1 : 1;
  }
  function sortHand() {
    ui.handOrder = orderedHand().slice().sort(cmpCards);
    render();
  }

  function handChooseMode(st) {
    var pend = st.pending;
    if (pend && pend.type === 'passAll' && pend.need[ui.mySeat] && pend.chosen[ui.mySeat] === undefined) return pend;
    return null;
  }

  function renderHand(st) {
    var el = $('handRow');
    el.innerHTML = '';
    var hand = orderedHand();
    var chooseMode = handChooseMode(st);
    var now = Date.now();
    ui.newCards = ui.newCards || {};
    if (ui.knownHand) {
      hand.forEach(function (id) { if (ui.knownHand.indexOf(id) < 0) ui.newCards[id] = now; });
    }
    ui.knownHand = hand.slice();
    hand.forEach(function (id, idx) {
      var c = CARDS[id];
      var d = document.createElement('div');
      var fresh = ui.newCards[id] && now - ui.newCards[id] < 3500;
      var picked = st.mode === 'draft' && st.phase === 'pick' && st.picks[ui.mySeat] !== undefined;
      d.className = 'hcard' + (ui.sel === id || ui.sel2 === id ? ' sel' : '') +
        (fresh ? ' fresh' : '') + (picked ? ' dim' : '');
      d.style.zIndex = String(200 - idx);
      if (d.style.setProperty) {
        var mid = (hand.length - 1) / 2;
        d.style.setProperty('--rot', ((idx - mid) * Math.min(2.4, 16 / Math.max(1, hand.length))).toFixed(2) + 'deg');
        d.style.setProperty('--arc', (Math.pow(Math.abs(idx - mid), 1.6) * 2.1).toFixed(1) + 'px');
      }
      d.innerHTML = '<img draggable="false" src="' + c.art + '" title="' +
        esc(c.name + (c.text ? ' — ' + c.text : '')) + '">';
      d.addEventListener('click', function () { onHandClick(st, id, chooseMode); });
      d.draggable = st.mode !== 'draft'; // draft auto-sorts; no manual order to keep
      d.addEventListener('dragstart', function (e) {
        ui.drag = id; hideZoom();
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
    // my bar
    var p = me();
    $('barCards').innerHTML = (p.umbrellas && p.umbrellas.length
      ? '<span class="umbBadge" title="' + p.umbrellas.length + ' Paper Umbrella(s) protect your bar">' +
        new Array(p.umbrellas.length + 1).join('☂️') + '</span>' : '') +
      p.bar.map(function (id) {
        return '<img src="' + CARDS[id].art + '" title="' + esc(CARDS[id].name) + '">';
      }).join('') + (p.bar.length ? '' : '<span style="color:#8a5a34"> empty — stock ingredients here</span>');
    $('myStatus').innerHTML =
      '<div>' + esc(p.name) + ' — ' + p.score + ' pts · 🍺' + p.beers.length + ' beers · ' +
      p.servedTotal + ' drinks served · ' +
      (st.mode === 'draft'
        ? '<span style="opacity:.6">hand auto-sorts</span>'
        : '<button class="ghost" id="sortBtn">sort hand</button>' +
          '<span style="opacity:.6"> · drag to rearrange</span>') + '</div>' +
      '<div>' + (p.banked || []).map(function (id) {
        return '<img style="width:30px;border-radius:3px;margin-left:3px;vertical-align:middle;outline:2px solid var(--gold)" src="' +
          CARDS[id].art + '" title="' + esc(CARDS[id].name + ' (set aside)') + '">';
      }).join('') + p.served.map(function (e) {
        return '<img style="width:30px;border-radius:3px;margin-left:3px;vertical-align:middle" src="' +
          CARDS[e.card].art + '" title="' + esc(CARDS[e.card].name + ' — ' + e.pts + ' pts') + '">';
      }).join('') + '</div>';
    if ($('sortBtn') && st.mode !== 'draft') $('sortBtn').addEventListener('click', sortHand);
  }

  function onHandClick(st, id, chooseMode) {
    if (chooseMode) { act({ t: 'resolve', player: ui.mySeat, card: id }); return; }
    if (st.mode === 'draft') {
      if (st.phase !== 'pick' || st.picks[ui.mySeat] !== undefined) return;
      var hasGB = me().banked.some(function (b) { return CARDS[b].fx === 'demand'; });
      if (ui.sel === id) { ui.sel = ui.sel2; ui.sel2 = null; }
      else if (ui.sel2 === id) { ui.sel2 = null; }
      else if (!ui.sel) { ui.sel = id; }
      else if (hasGB && !ui.sel2 && myHand().length >= 2) { ui.sel2 = id; }
      else { ui.sel = id; ui.sel2 = null; }
      ui.pinned = ui.sel ? CARDS[ui.sel].art : null;
      if (ui.pinned) showZoom(ui.pinned, 'right'); else hideZoom();
      render();
      return;
    }
    if (!isMyTurn() || st.phase !== 'main') return;
    if (ui.sel === id) { ui.sel = null; ui.pinned = null; hideZoom(); }
    else {
      ui.sel = id;
      ui.pinned = CARDS[id].art;
      showZoom(ui.pinned, 'right');
    }
    render();
  }

  // ---------- prompt ----------
  function renderPrompt(st) {
    var el = $('prompt');
    el.innerHTML = '';
    var mode = handChooseMode(st);
    if (mode) {
      el.innerHTML = '<span class="msg">Tidal Handover — click a card to pass right</span>';
      return;
    }
    var pend = st.pending;
    if (pend && pend.type === 'seagull' && pend.by === ui.mySeat) {
      el.innerHTML = '<span class="msg">🕊 Your seagull is circling — click an ingredient on any unprotected bar above</span>';
      return;
    }
    if (pend || st.phase === 'roundEnd' || st.phase === 'gameEnd') {
      if (pend && pend.by !== ui.mySeat) {
        el.innerHTML = '<span class="msg">Waiting on ' + esc(st.players[E.actor(st)].name) + '…</span>';
      }
      return;
    }
    if (st.mode === 'draft') {
      if (st.phase !== 'pick') return;
      var mine = me();
      if (!mine.hand.length) { el.innerHTML = '<span class="msg">Out of cards — watching the tide…</span>'; return; }
      if (st.picks[ui.mySeat] !== undefined) {
        var waitingOn = st.players.filter(function (pl) {
          return pl.hand.length && st.picks[pl.i] === undefined;
        }).map(function (pl) { return pl.name; });
        el.innerHTML = '<span class="msg">Pick locked in ✔ — waiting on ' +
          esc(waitingOn.join(', ') || 'the reveal') + '…</span>';
        return;
      }
      var kb = [];
      var verb = 'Play';
      if (ui.sel) {
        var sk = CARDS[ui.sel].kind;
        verb = sk === 'ing' ? 'Stock' : (sk === 'beer' ? 'Shelve' : 'Play');
      }
      kb.push(btn(ui.sel ? verb + ' ' + CARDS[ui.sel].name : 'Select a card…', !!ui.sel, function () {
        var c1 = ui.sel; ui.sel = null; ui.sel2 = null; ui.pinned = null; hideZoom();
        act({ t: 'pick', seat: ui.mySeat, card: c1 });
      }));
      var sp = document.createElement('span');
      sp.className = 'msg';
      sp.textContent = 'Pick a card · glowing drinks are servable';
      el.appendChild(sp);
      kb.forEach(function (x) { el.appendChild(x); });
      return;
    }
    if (!isMyTurn()) {
      el.innerHTML = '<span class="msg">' + esc(st.players[st.turn].name) + ' is mixing…</span>';
      return;
    }
    if (st.phase === 'draw') {
      el.innerHTML = '<span class="msg">Your turn — click the deck to draw 2</span>';
      return;
    }
    var c = ui.sel ? CARDS[ui.sel] : null;
    var plays = st.playsLeft;
    var b = [];
    b.push(btn('Stock bar', !!(c && c.kind === 'ing' && plays > 0), function () {
      var id = ui.sel; ui.sel = null; ui.pinned = null; hideZoom();
      act({ t: 'stock', card: id });
    }));
    b.push(btn('Shelve beer', !!(c && c.kind === 'beer' && plays > 0), function () {
      var id = ui.sel; ui.sel = null; ui.pinned = null; hideZoom();
      act({ t: 'beer', card: id });
    }));
    b.push(btn('Play special', !!(c && c.kind === 'special' && c.fx !== 'double' && plays > 0), function () {
      var id = ui.sel; ui.sel = null; ui.pinned = null; hideZoom();
      act({ t: 'special', card: id });
    }, c && c.fx === 'double' ? 'Make It a Double is played by serving a cocktail from the menu' : ''));
    b.push(btn('End turn', true, function () {
      ui.sel = null; ui.pinned = null; hideZoom();
      act({ t: 'endTurn' });
    }));
    var span = document.createElement('span');
    span.className = 'msg';
    span.textContent = plays + ' play' + (plays === 1 ? '' : 's') + ' left · glowing menu drinks are servable free';
    el.appendChild(span);
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

  // ---------- modal ----------
  function renderModal(st) {
    var modal = $('modal'), box = $('modalBox');
    var pend = st.pending;

    if (st.phase === 'gameEnd') {
      var w = st.players[st.winner];
      box.innerHTML = '<h3>' + esc(w.name) + ' is Master Mixologist! 🏆</h3>' +
        '<div class="sub">' + w.score + ' points after the beer count</div>' +
        scoreTable(st, true) +
        '<button class="gold" onclick="location.reload()">Back to the beach</button>';
      modal.className = 'open';
      return;
    }
    if (st.phase === 'roundEnd') {
      box.innerHTML = '<h3>Round ' + st.round + ' — the till</h3>' + scoreTable(st, false) +
        (ui.isGuest ? '<div class="sub">waiting for the host to open the next round…</div>'
          : '<button class="gold" id="mNext">Open the next round</button>');
      modal.className = 'open';
      if (!ui.isGuest) $('mNext').addEventListener('click', function () { act({ t: 'nextRound' }); });
      return;
    }
    if (ui.serveChoice && (st.mode === 'draft' || isMyTurn())) {
      var rec = CARDS[ui.serveChoice];
      box.innerHTML = '<h3>Serve the ' + esc(rec.name) + '?</h3>' +
        '<div class="bigcard"><img style="width:200px;border-radius:12px" src="' + rec.art + '"></div>' +
        '<div class="choices">' +
        '<button class="big" id="mServe">Serve — ' + rec.pts + ' pts</button>' +
        '<button class="big gold" id="mServeD">Make It a Double — ' + (rec.pts * 2) + ' pts</button>' +
        '<button class="ghost" id="mCancel">Not yet</button></div>';
      modal.className = 'open';
      $('mServe').addEventListener('click', function () {
        var r = ui.serveChoice; ui.serveChoice = null;
        act({ t: 'serve', seat: ui.mySeat, recipe: r });
      });
      $('mServeD').addEventListener('click', function () {
        var r = ui.serveChoice; ui.serveChoice = null;
        act({ t: 'serve', seat: ui.mySeat, recipe: r, double: true });
      });
      $('mCancel').addEventListener('click', function () { ui.serveChoice = null; render(); });
      return;
    }
    if (!pend || pend.by !== ui.mySeat || pend.type === 'seagull' || pend.type === 'passAll') {
      modal.className = '';
      return;
    }
    if (pend.type === 'chooseTarget') {
      box.innerHTML = '<h3>Pirate Plunder</h3><div class="sub">steal a random card from whom?</div>' +
        '<div class="choices" id="mCh"></div>';
      var ch = box.querySelector('#mCh');
      st.players.forEach(function (p) {
        if (p.i === ui.mySeat || !p.hand.length) return;
        var x = document.createElement('button');
        x.className = 'big';
        x.textContent = p.name + ' — ' + p.hand.length + ' cards';
        x.addEventListener('click', function () { act({ t: 'resolve', target: p.i }); });
        ch.appendChild(x);
      });
      modal.className = 'open';
      return;
    }
    if (pend.type === 'demand') {
      var html = '<h3>Guest Bartender</h3><div class="sub">demand which ingredient, from whom?</div>' +
        '<div class="choices" id="mIng"></div><div class="sub" id="mPicked" style="margin-top:10px"></div>' +
        '<div class="choices" id="mWho"></div>';
      box.innerHTML = html;
      var ingEl = box.querySelector('#mIng'), whoEl = box.querySelector('#mWho');
      var pickedIng = null;
      data.INGREDIENTS.forEach(function (ing) {
        var d = document.createElement('div');
        d.className = 'ch';
        d.innerHTML = '<img src="assets/cards/ing-' + ing.id + '.jpg" title="' + esc(ing.name) + '">';
        d.addEventListener('click', function () {
          pickedIng = ing.id;
          box.querySelector('#mPicked').textContent = 'Demanding: ' + ing.name + ' — now pick a player';
        });
        ingEl.appendChild(d);
      });
      st.players.forEach(function (p) {
        if (p.i === ui.mySeat) return;
        var x = document.createElement('button');
        x.textContent = p.name + ' — ' + p.hand.length + ' cards';
        x.addEventListener('click', function () {
          if (!pickedIng) { toast('Pick an ingredient first'); return; }
          act({ t: 'resolve', target: p.i, ing: pickedIng });
        });
        whoEl.appendChild(x);
      });
      modal.className = 'open';
      return;
    }
    if (pend.type === 'handOver') {
      var demander = st.players[pend.from];
      box.innerHTML = '<h3>' + esc(demander.name) + ' demands your ' + esc(CARDS[pend.card].name) + '!</h3>' +
        '<div class="sub">the Guest Bartender is very persuasive</div>' +
        '<div class="bigcard"><img style="width:200px;border-radius:12px" src="' + CARDS[pend.card].art + '"></div>' +
        '<div class="choices"><button class="big gold" id="mHand">Hand it over 😩</button></div>';
      modal.className = 'open';
      $('mHand').addEventListener('click', function () {
        sfx('bad');
        act({ t: 'resolve' });
      });
      return;
    }
    if (pend.type === 'torch') {
      box.innerHTML = '<h3>Tiki Torchlight</h3><div class="sub">keep one — the rest hit the discard</div>' +
        '<div class="choices" id="mCh"></div>';
      var tch = box.querySelector('#mCh');
      pend.cards.forEach(function (id) {
        var d = document.createElement('div');
        d.className = 'ch';
        d.innerHTML = '<img src="' + CARDS[id].art + '" title="' + esc(CARDS[id].name) + '">';
        d.addEventListener('click', function () { act({ t: 'resolve', keep: id }); });
        tch.appendChild(d);
      });
      modal.className = 'open';
      return;
    }
    modal.className = '';
  }

  function scoreTable(st, final) {
    var bonus = final && st.beerBonuses ? st.beerBonuses : null;
    var html = '<table><tr><th>bartender</th><th>drinks this round</th><th>round pts</th>' +
      '<th>🍺 beers</th>' + (bonus ? '<th>beer bonus</th>' : '') + '<th class="total">total</th></tr>';
    st.players.forEach(function (p) {
      html += '<tr><td>' + esc(p.name) + '</td><td>' +
        (p.served.map(function (e) { return esc(CARDS[e.card].name); }).join(', ') || '—') +
        '</td><td>' + p.roundScore + '</td><td>' + p.beers.length + '</td>' +
        (bonus ? '<td>' + (bonus[p.i] >= 0 ? '+' : '') + bonus[p.i] + '</td>' : '') +
        '<td class="total">' + p.score + '</td></tr>';
    });
    return html + '</table>';
  }

  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.style.display = 'none'; }, ms || 2600);
  }
  ui.toast = toast;
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
    });
  }

  G.ui = ui;
}(window.TT = window.TT || {}));
