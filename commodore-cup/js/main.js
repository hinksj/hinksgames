// COMMODORE CUP — menu, lobby and mode wiring.
(function (G) {
  'use strict';
  var E = G.engine, ui = G.ui, net = G.net;
  var $ = function (id) { return document.getElementById(id); };

  var BOT_NAMES = ['Bunny Marlowe', 'Chip Vandermast', 'Coco Delacroix', 'Rex Halyard',
    'Muffy St. Cloud', 'Dirk Spinnaker'];
  function botNames(n) {
    var pool = BOT_NAMES.slice();
    var out = [];
    for (var i = 0; i < n; i++) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return out;
  }
  function myName() { return ($('mName').value || 'Skipper').trim().slice(0, 16); }
  function err(msg) { $('mErr').textContent = msg || ''; }

  // ---------- solo ----------
  $('btnSolo').addEventListener('click', function () {
    var bots = parseInt($('mBots').value, 10);
    var names = [{ name: myName(), isAI: false }].concat(
      botNames(bots).map(function (n) { return { name: n, isAI: true }; }));
    var st = E.newGame({ names: names, target: parseInt($('mTarget').value, 10) });
    ui.begin(st, 0, {});
  });

  // ---------- host ----------
  var lobby = { guests: [] }; // guests: [{conn, name}]
  $('btnHost').addEventListener('click', function () {
    err('');
    var room = net.cleanRoom($('mRoom').value) || net.randomRoom();
    $('btnHost').disabled = true;
    net.host(room, function (e) {
      $('btnHost').disabled = false;
      if (e) { err(e); return; }
      openLobby(room);
    });
  });

  function openLobby(room) {
    var modal = $('modal'), box = $('modalBox');
    lobby.guests = [];
    function draw() {
      var list = '<li>' + escName(myName()) + ' (host)</li>' + lobby.guests.map(function (g) {
        return '<li>' + escName(g.name) + '</li>';
      }).join('');
      box.innerHTML = '<h3>Table ' + room + '</h3>' +
        '<div class="sub">friends open this page and join with code <b style="color:var(--gold)">' +
        room + '</b><br>waiting for skippers… (' + (1 + lobby.guests.length) + '/6 seated)</div>' +
        '<ul style="list-style:none;line-height:1.9">' + list + '</ul>' +
        '<label style="color:var(--dim)">Fill empty seats with AI rivals: ' +
        '<select id="lBots"><option>0</option><option selected>1</option><option>2</option><option>3</option></select>' +
        '</label><br><br>' +
        '<button class="gold" id="lStart">Start the race</button> ' +
        '<button class="ghost" onclick="location.reload()">Cancel</button>';
      $('lStart').addEventListener('click', function () { startHosted(room); });
      modal.className = 'open';
    }
    net.onEvent = function (kind, conn, msg) {
      if (kind === 'data' && msg && msg.type === 'hello') {
        if (lobby.started) { net.sendTo(conn, { type: 'full' }); return; }
        if (lobby.guests.length >= 5) { net.sendTo(conn, { type: 'full' }); return; }
        lobby.guests.push({ conn: conn, name: String(msg.name || 'Guest').slice(0, 16) });
        net.sendTo(conn, { type: 'hello-wait' });
        draw();
      } else if (kind === 'leave') {
        if (!lobby.started) {
          lobby.guests = lobby.guests.filter(function (g) { return g.conn !== conn; });
          draw();
        } else {
          var seat = net.seatOf.get(conn);
          if (seat !== undefined && ui.st && !ui.st.players[seat].isAI) {
            ui.st.players[seat].isAI = true;
            ui.st.log.push(ui.st.players[seat].name + ' drifts off — an AI takes the wheel.');
            broadcast();
            ui.pumpNow();
          }
        }
      } else if (kind === 'data' && msg && msg.type === 'chat') {
        var seatC = net.seatOf.get(conn);
        var nm = (seatC !== undefined && ui.st) ? ui.st.players[seatC].name : 'Guest';
        var txtC = String(msg.text || '').trim().slice(0, 140);
        if (txtC) pushChat(nm, txtC);
      } else if (kind === 'data' && msg && msg.type === 'action') {
        var seat2 = net.seatOf.get(conn);
        if (seat2 === undefined || !validFrom(seat2, msg.action)) return;
        var e2 = ui.applyRemote(msg.action);
        if (e2) net.sendTo(conn, { type: 'err', msg: e2 });
        else broadcast();
      }
    };
    draw();
  }
  function validFrom(seat, action) {
    var st = ui.st;
    if (!st || !action) return false;
    if (action.t === 'nextRound') return false; // host only
    if (st.pending && st.pending.type === 'passAll') {
      return action.t === 'resolve' && action.player === seat;
    }
    return E.actor(st) === seat;
  }

  function startHosted(room) {
    lobby.started = true;
    var nBots = parseInt($('lBots').value, 10);
    var maxBots = Math.min(nBots, 6 - 1 - lobby.guests.length);
    var names = [{ name: myName(), isAI: false }];
    lobby.guests.forEach(function (g) { names.push({ name: g.name, isAI: false }); });
    botNames(Math.max(0, maxBots)).forEach(function (n) { names.push({ name: n, isAI: true }); });
    if (names.length < 2) { ui.toast('Need at least one guest or AI rival.'); lobby.started = false; return; }
    var st = E.newGame({ names: names, target: parseInt($('mTarget').value, 10) });
    lobby.guests.forEach(function (g, i) {
      net.seatOf.set(g.conn, i + 1);
      net.sendTo(g.conn, { type: 'start', seat: i + 1, room: room, state: st });
    });
    $('modal').className = '';
    ui.begin(st, 0, { room: room, onLocalAction: broadcast });
  }
  function broadcast() {
    net.broadcast({ type: 'state', state: ui.st });
  }

  // ---------- table chat (rides the host-authoritative log) ----------
  function pushChat(name, text) {
    if (!ui.st) return;
    ui.st.log.push('💬 ' + name + ': ' + text);
    broadcast();
    ui.pumpNow();
  }
  function sendChat() {
    var inp = $('chatInput');
    var text = (inp.value || '').trim().slice(0, 140);
    if (!text || !ui.st || !ui.roomCode) return;
    inp.value = '';
    if (ui.isGuest) net.send({ type: 'chat', text: text });
    else pushChat(myName(), text);
  }
  $('chatSend').addEventListener('click', sendChat);
  $('chatInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') sendChat();
  });

  // ---------- join ----------
  $('btnJoin').addEventListener('click', function () {
    err('');
    var room = net.cleanRoom($('mRoom').value);
    if (!room) { err('Enter the room code the host gave you.'); return; }
    $('btnJoin').disabled = true;
    err('Hailing the club launch…');
    net.join(room, myName(), {
      error: function (m) { $('btnJoin').disabled = false; err(m); },
      data: function (msg) {
        if (msg.type === 'start') {
          err('');
          ui.begin(msg.state, msg.seat, {
            guest: true, room: msg.room,
            send: function (action) { net.send({ type: 'action', action: action }); }
          });
        } else if (msg.type === 'state') {
          if (G.ui.st) ui.setState(msg.state);
        } else if (msg.type === 'err') {
          ui.toast(msg.msg);
        } else if (msg.type === 'full') {
          $('btnJoin').disabled = false; err('That table is full or already racing.');
        } else if (msg.type === 'hello-wait') {
          err('Seated — waiting for the host to start…');
        }
      }
    });
  });

  // ---------- misc ----------
  function drawSoundBtn() {
    var s = (G.sound && G.sound.isMuted()) ? '🔇' : '🔊';
    var mOp = (G.music && G.music.isOn()) ? '1' : '0.35';
    if ($('btnTrack')) {
    $('btnTrack').style.display = (G.music && G.music.hasTracks()) ? '' : 'none';
    $('btnTrack').addEventListener('click', function () { if (G.music) G.music.next(); });
  }
  ['btnSound', 'btnSound2'].forEach(function (id) { if ($(id)) $(id).textContent = s; });
    ['btnMusic', 'btnMusic2'].forEach(function (id) { if ($(id)) $(id).style.opacity = mOp; });
  }
  ['btnMusic', 'btnMusic2'].forEach(function (id) {
    if ($(id)) $(id).addEventListener('click', function () {
      if (G.music) G.music.toggle();
      drawSoundBtn();
    });
  });
  if ($('btnTrack')) {
    $('btnTrack').style.display = (G.music && G.music.hasTracks()) ? '' : 'none';
    $('btnTrack').addEventListener('click', function () { if (G.music) G.music.next(); });
  }
  ['btnSound', 'btnSound2'].forEach(function (id) {
    if ($(id)) $(id).addEventListener('click', function () {
      if (G.sound) G.sound.toggle();
      drawSoundBtn();
    });
  });
  drawSoundBtn();
  // menu art gallery: slow rotation through the full card art
  (function gallery() {
    if (!window.requestAnimationFrame) return; // headless shims skip this
    var img = $('galleryImg');
    if (!img) return;
    var arts = Object.keys(G.data.CARDS).map(function (id) { return G.data.CARDS[id].art; });
    for (var i = arts.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arts[i]; arts[i] = arts[j]; arts[j] = t;
    }
    var at = 0;
    function next() {
      if ($('menu').style.display === 'none') return; // stop once a game starts
      img.className = '';
      setTimeout(function () {
        img.src = arts[at % arts.length];
        at++;
        img.onload = function () { img.className = 'on'; };
      }, 650);
      setTimeout(next, 4600);
    }
    img.src = arts[0]; at = 1;
    img.onload = function () { img.className = 'on'; };
    setTimeout(next, 4600);
  }());
  $('btnTour').addEventListener('click', function () {
    $('btnSolo').click();
    setTimeout(function () { if (G.tour) G.tour.start(); }, 700);
  });
  $('btnTourTop').addEventListener('click', function () { if (G.tour) G.tour.start(); });
  $('btnRules').addEventListener('click', function () { window.open('RULES.md', '_blank'); });
  $('btnQuit').addEventListener('click', function () { location.reload(); });
  function escName(s) { return String(s).replace(/[<>&]/g, ''); }
}(window.CC = window.CC || {}));
