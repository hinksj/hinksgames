// COMMODORE CUP — online play over WebRTC (PeerJS public broker).
// Host-authoritative: the host's browser runs the engine; guests send actions
// and mirror state. Room code maps to a deterministic peer id.
(function (G) {
  'use strict';
  var net = { peer: null, conns: [], seatOf: new Map(), onEvent: null, room: '' };

  function peerId(room) { return 'commodore-cup-' + room.toLowerCase() + '-host'; }
  function cleanRoom(code) {
    return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  }
  net.cleanRoom = cleanRoom;
  net.randomRoom = function () {
    var salty = ['TIKI', 'BUOY', 'KEEL', 'MAST', 'REEF', 'JIBE', 'HELM', 'DOCK', 'WAKE', 'KNOT'];
    return salty[Math.floor(Math.random() * salty.length)] + Math.floor(10 + Math.random() * 90);
  };

  // ---------- host ----------
  net.host = function (room, cb) {
    net.room = room;
    var p = new Peer(peerId(room));
    net.peer = p;
    p.on('open', function () { cb(null); });
    p.on('error', function (e) {
      cb(e.type === 'unavailable-id' ? 'That room code is taken — try another.' : 'Connection error: ' + e.type);
    });
    p.on('connection', function (conn) {
      conn.on('data', function (msg) {
        if (net.onEvent) net.onEvent('data', conn, msg);
      });
      conn.on('open', function () { net.conns.push(conn); });
      conn.on('close', function () {
        net.conns = net.conns.filter(function (c) { return c !== conn; });
        if (net.onEvent) net.onEvent('leave', conn, null);
      });
    });
  };
  net.broadcast = function (msg) {
    net.conns.forEach(function (c) { if (c.open) c.send(msg); });
  };
  net.sendTo = function (conn, msg) { if (conn.open) conn.send(msg); };

  // ---------- guest ----------
  net.join = function (room, name, handlers) {
    net.room = room;
    var p = new Peer();
    net.peer = p;
    var conn = null, opened = false;
    p.on('error', function (e) {
      if (e.type === 'peer-unavailable') handlers.error('No table found with code ' + room + '.');
      else if (!opened) handlers.error('Connection error: ' + e.type);
    });
    p.on('open', function () {
      conn = p.connect(peerId(room), { reliable: true });
      conn.on('open', function () {
        opened = true;
        conn.send({ type: 'hello', name: name });
      });
      conn.on('data', function (msg) { handlers.data(msg); });
      conn.on('close', function () { handlers.error('The host closed the table.'); });
      net.send = function (msg) { if (conn && conn.open) conn.send(msg); };
    });
  };
  net.send = function () {};

  G.net = net;
}(window.CC = window.CC || {}));
