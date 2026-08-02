'use strict';

W.Render = {
  cv: null, ctx: null, t: 0,
  hitRooms: [], // {ship, idx, x, y, w, h} rebuilt each frame for click handling
  specks: [],
  SYS_TINT: {
    helm: 'rgba(217,169,74,0.16)', sails: 'rgba(200,180,130,0.14)',
    ward: 'rgba(165,178,190,0.16)', cannons: 'rgba(200,90,60,0.15)',
    pumps: 'rgba(70,180,165,0.15)', surgeon: 'rgba(110,200,120,0.15)',
  },

  SPRITE_SRC: {
    cannon: 'assets/cannon.png', ball: 'assets/ball.png',
    explosion1: 'assets/explosion1.png', explosion2: 'assets/explosion2.png', explosion3: 'assets/explosion3.png',
    fire1: 'assets/fire1.png', fire2: 'assets/fire2.png',
    smoke1: 'assets/smoke1.png', smoke2: 'assets/smoke2.png', smoke3: 'assets/smoke3.png',
    smoke4: 'assets/smoke4.png', smoke5: 'assets/smoke5.png',
    // generated/painted art (scripts/gen_art.py) — optional, procedural fallback
    hull_sloop: 'assets/art/hull_sloop.png', hull_cutter: 'assets/art/hull_cutter.png',
    hull_brig: 'assets/art/hull_brig.png', hull_frigate: 'assets/art/hull_frigate.png',
    hull_leviathan: 'assets/art/hull_leviathan.png',
    bg_fair: 'assets/art/bg_fair.jpg', bg_squall: 'assets/art/bg_squall.jpg',
    bg_gloom: 'assets/art/bg_gloom.jpg', bg_storm: 'assets/art/bg_storm.jpg',
    isle1: 'assets/art/isle1.png', isle2: 'assets/art/isle2.png', isle3: 'assets/art/isle3.png',
    isle4: 'assets/art/isle4.png', isle5: 'assets/art/isle5.png', isle6: 'assets/art/isle6.png',
    seal: 'assets/art/seal.png', rose: 'assets/art/rose.png', serpent: 'assets/art/serpent.png',
    parchment: 'assets/art/parchment.jpg',
  },

  // Per-hull source-crop calibration for generated hull paintings: sy = deck
  // rail top, sb = where hull meets water, as fractions of image height.
  // Tuned by eye per generated asset.
  HULL_CAL: {
    sloop: { sy: 0.15, sb: 0.64 },
    cutter: { sy: 0.15, sb: 0.64 },
    brig: { sy: 0.15, sb: 0.64 },
    frigate: { sy: 0.15, sb: 0.64 },
    leviathan: { sy: 0.12, sb: 0.66 },
  },
  img: {},

  init() {
    this.cv = document.getElementById('game');
    try { this.ctx = this.cv.getContext('2d'); } catch (e) { this.ctx = null; }
    this.specks = [];
    for (let i = 0; i < 40; i++) {
      this.specks.push({ x: W.rand(0, 1000), y: W.rand(215, 448), sp: W.rand(4, 14), s: W.rand(1, 2.2) });
    }
    if (typeof Image !== 'undefined') {
      for (const [k, src] of Object.entries(this.SPRITE_SRC)) {
        const im = new Image();
        im.onerror = () => {};
        im.src = src;
        this.img[k] = im;
      }
    }
  },

  // returns the sprite only when actually loaded; callers fall back to vector art
  spr(k) {
    const im = this.img[k];
    return (im && im.complete && im.naturalWidth > 0) ? im : null;
  },

  HORIZON: 205,

  shipOrigin(ship) {
    const T = W.TILE, L = ship.layout;
    const bob = Math.sin(this.t * 1.15 + (ship.isPlayer ? 0 : 2.3)) * 3;
    // hulls ride at the waterline: bottoms in the sea, masts against the sky
    const y = 338 - L.h * T + bob;
    if (ship.isPlayer) {
      const x = (W.Combat.active) ? 55 : (1000 - L.w * T) / 2;
      return { x, y };
    }
    return { x: 1000 - 55 - L.w * T, y };
  },

  roomRect(ship, r) {
    const T = W.TILE, o = this.shipOrigin(ship), L = ship.layout;
    const rx = ship.isPlayer ? o.x + r.x * T : o.x + (L.w - r.x - r.w) * T;
    return { x: rx, y: o.y + r.y * T, w: r.w * T, h: r.h * T };
  },

  roomCenter(ship, idx) {
    const rr = this.roomRect(ship, ship.rooms[idx]);
    return { x: rr.x + rr.w / 2, y: rr.y + rr.h / 2 };
  },

  crewPos(ship, c) {
    const T = W.TILE, o = this.shipOrigin(ship), L = ship.layout;
    const x = ship.isPlayer ? o.x + c.px * T : o.x + (L.w - c.px) * T;
    return { x, y: o.y + c.py * T };
  },

  // Four fixed crew stations per room, FTL-style, assigned by seniority of
  // arrival (stable id order). A fifth body squeezes into the middle.
  fanOffset(ship, c) {
    if (c.path.length) return { dx: 0, dy: 0 };
    const others = [...ship.crew, ...ship.intruders]
      .filter(o => o.hp > 0 && o.roomIdx === c.roomIdx && !o.path.length)
      .sort((a, b) => a.id - b.id);
    const SLOTS = [[-9, -5], [9, -5], [-9, 11], [9, 11], [0, 3]];
    const s = SLOTS[Math.min(others.indexOf(c), SLOTS.length - 1)];
    return { dx: s[0], dy: s[1] };
  },

  draw(dt) {
    const ctx = this.ctx;
    if (!ctx) return;
    // hard reset: a mid-frame exception must never leave a rotation, offset,
    // or alpha behind to compound next frame (the "spinning scene" bug)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    this.t += dt;
    this.hitRooms = [];
    ctx.clearRect(0, 0, 1000, 460);
    this.drawSea(dt);

    ctx.save();
    try {
    if (W.shake > 0) {
      W.shake = Math.max(0, W.shake - 20 * dt);
      ctx.translate(W.rand(-W.shake, W.shake), W.rand(-W.shake, W.shake));
    }

    if (W.state.mode === 'fleet' && W.Fleet && W.Fleet.active) {
      this.drawFleet(dt);
      return;
    }
    if (W.state.mode === 'crisis' && W.player) {
      this.drawShip(W.player, dt);
      this.drawParts(dt);
      ctx.fillStyle = 'rgba(6,13,21,0.65)';
      ctx.fillRect(230, 6, 540, 56);
      ctx.fillStyle = '#ff8a5c';
      ctx.font = 'bold 16px "IM Fell English", Georgia';
      ctx.textAlign = 'center';
      const cdef = W.Fleet.CRISIS_DEFS[W.Fleet.crisisKind || 'fire'];
      ctx.fillText(`${cdef.banner} — ${Math.max(0, Math.ceil(W.Fleet.crisisTimer))}s`, 500, 24);
      ctx.font = '12px "IM Fell English", Georgia';
      ctx.fillStyle = '#cfe3f0';
      ctx.fillText(cdef.sub, 500, 40);
      // the running to-do list: what still stands between you and 'saved'
      {
        const P = W.player;
        const fires = P.rooms.filter(rm => rm.fire > 0).length;
        const leaks = P.rooms.filter(rm => rm.breach).length;
        const wet = P.rooms.filter(rm => rm.water > 30).length;
        const foes = P.intruders.filter(cc => cc.hp > 0).length;
        const sailsBad = P.systems.sails && P.systems.sails.damage > 0;
        const parts = [];
        if (foes) parts.push(`${foes} boarder${foes > 1 ? 's' : ''} to cut down`);
        if (fires) parts.push(`${fires} room${fires > 1 ? 's' : ''} burning`);
        if (leaks) parts.push(`${leaks} hole${leaks > 1 ? 's' : ''} to plug`);
        if (wet) parts.push(`water in ${wet} room${wet > 1 ? 's' : ''}`);
        if (sailsBad && (W.Fleet.crisisKind === 'mast')) parts.push('sails to mend (crew to the Sails room)');
        ctx.fillStyle = parts.length ? '#8fe3a8' : '#cfe3f0';
        ctx.font = 'bold 12px "IM Fell English", Georgia';
        ctx.fillText(parts.length ? 'STILL TO DO: ' + parts.join(' · ') : 'ALL CLEAR — she is saved…', 500, 57);
      }
      return;
    }

    if (W.player) this.drawShip(W.player, dt);
    if (W.Combat.active && W.Combat.enemy) {
      this.drawShip(W.Combat.enemy, dt);
      this.drawEnemyHeader(W.Combat.enemy);
      this.drawProjectiles();
    }
    this.drawParts(dt);

    // floating text
    for (const f of W.fx) {
      f.t += dt;
      ctx.globalAlpha = W.clamp(1 - f.t / 1.2, 0, 1);
      ctx.fillStyle = f.color;
      ctx.font = 'bold 15px "IM Fell English", Georgia';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y - 26 * f.t);
    }
    ctx.globalAlpha = 1;
    W.fx = W.fx.filter(f => f.t < 1.2);
    } finally { ctx.restore(); }

    if (W.paused && W.state.mode === 'combat') {
      ctx.fillStyle = 'rgba(6,13,21,0.55)';
      ctx.fillRect(330, 8, 340, 34);
      ctx.fillStyle = '#e9c46a';
      ctx.font = 'bold 16px "IM Fell English", Georgia';
      ctx.textAlign = 'center';
      ctx.fillText('⏸ PAUSED — give orders, SPACE to sail on', 500, 30);
    }
    if (W.UI && W.UI.sel.wep != null) {
      ctx.fillStyle = '#e9c46a';
      ctx.font = 'italic 14px "IM Fell English", Georgia';
      ctx.textAlign = 'center';
      ctx.fillText('Click an enemy room to lay the gun on it (ESC to cancel)', 500, 452);
    }

    // vignette
    const vg = ctx.createRadialGradient(500, 230, 300, 500, 230, 620);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.24)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, 1000, 460);
  },

  // Weather: each reach has its own sky; fights inside the Maelstrom are storms.
  weather() {
    if (W.Combat.active && W.Combat.elite) return 'storm';
    return ['fair', 'squall', 'gloom'][(W.GameMap.sector || 1) - 1] || 'fair';
  },

  drawSea(dt) {
    const ctx = this.ctx;
    const wx = this.weather();
    const HOR = this.HORIZON;
    const pal = {
      fair:   { sky: ['#3a5069', '#182c42'], sea: ['#14304a', '#0b1a29', '#071320'], orb: 'sun' },
      squall: { sky: ['#414b58', '#1b2733'], sea: ['#17273a', '#0f1b25', '#0a141c'], orb: 'none' },
      gloom:  { sky: ['#312a4f', '#1b1636'], sea: ['#1c1738', '#100e23', '#0a0918'], orb: 'moon' },
      storm:  { sky: ['#252c35', '#121a22'], sea: ['#101a25', '#0a1119', '#060b10'], orb: 'none' },
    }[wx];

    // painted backdrop when the art exists; procedural sky/sea otherwise
    const bg = this.spr('bg_' + wx);
    if (bg) {
      // source-crop a band whose horizon (~45% down the painting) lands at HOR
      const sw = bg.naturalWidth;
      const sh = sw * 460 / 1000;
      const sy = Math.max(0, bg.naturalHeight * 0.45 - HOR * (sh / 460));
      ctx.drawImage(bg, 0, sy, sw, Math.min(sh, bg.naturalHeight - sy), 0, 0, 1000, 460);
    }

    if (!bg) {
    // sky
    let g = ctx.createLinearGradient(0, 0, 0, HOR);
    g.addColorStop(0, pal.sky[0]);
    g.addColorStop(1, pal.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1000, HOR);

    if (pal.orb === 'sun') {
      const sg = ctx.createRadialGradient(830, 78, 6, 830, 78, 70);
      sg.addColorStop(0, 'rgba(255,222,160,0.9)');
      sg.addColorStop(0.25, 'rgba(255,210,130,0.35)');
      sg.addColorStop(1, 'rgba(255,210,130,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(760, 8, 140, 140);
      ctx.beginPath(); ctx.arc(830, 78, 15, 0, Math.PI * 2);
      ctx.fillStyle = '#ffe9c4'; ctx.fill();
    } else if (pal.orb === 'moon') {
      ctx.beginPath(); ctx.arc(820, 66, 13, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(215,222,255,0.85)'; ctx.fill();
      ctx.beginPath(); ctx.arc(826, 62, 12, 0, Math.PI * 2);
      ctx.fillStyle = pal.sky[0]; ctx.fill();
    }

    // clouds adrift in the sky band
    if (!this.clouds) {
      this.clouds = [];
      for (let i = 0; i < 4; i++) {
        this.clouds.push({ x: W.rand(0, 1000), y: W.rand(15, 130), sz: W.rand(130, 260), sp: W.rand(3, 8), a: W.rand(0.07, 0.14) });
      }
    }
    for (const c of this.clouds) {
      c.x -= c.sp * dt;
      if (c.x < -c.sz) { c.x = 1000 + c.sz; c.y = W.rand(15, 130); }
      const im = this.spr('smoke' + (1 + (this.clouds.indexOf(c) % 5)));
      if (im) {
        ctx.globalAlpha = c.a * (wx === 'storm' ? 1.6 : 1);
        ctx.drawImage(im, c.x - c.sz / 2, c.y - c.sz / 4, c.sz, c.sz * 0.5);
        ctx.globalAlpha = 1;
      }
    }

    // sea
    g = ctx.createLinearGradient(0, HOR, 0, 460);
    g.addColorStop(0, pal.sea[0]);
    g.addColorStop(0.4, pal.sea[1]);
    g.addColorStop(1, pal.sea[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, HOR, 1000, 460 - HOR);
    ctx.fillStyle = 'rgba(215,235,250,0.12)';
    ctx.fillRect(0, HOR, 1000, 2);

    // slow rolling swells, below the horizon
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(110,170,215,${0.06 - i * 0.014})`;
      ctx.lineWidth = 8 - i * 2;
      for (let x = 0; x <= 1000; x += 20) {
        const y = HOR + 55 + i * 85 + Math.sin(x / 150 + this.t * 0.45 + i * 2.2) * 12;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // fine wave lines, spacing widening toward the fore
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(120,180,220,0.07)';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      for (let x = 0; x <= 1000; x += 25) {
        const y = HOR + 14 + i * i * 4 + i * 22 + Math.sin(x / 90 + this.t * 0.8 + i * 2) * 5;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // sun-glitter: a broken path of light on the water under the sun
    if (pal.orb === 'sun') {
      ctx.fillStyle = 'rgba(255,220,150,0.14)';
      for (let i = 0; i < 22; i++) {
        const gy = HOR + 6 + i * 9;
        const gx = 830 + Math.sin(this.t * (1.1 + i * 0.13) + i * 2.7) * (14 + i * 2.2);
        ctx.fillRect(gx - (4 + i * 0.5), gy, 8 + i, 1.6);
      }
    }
    } // end procedural sky/sea (skipped when a painted backdrop is loaded)
    // drifting foam flecks
    ctx.fillStyle = 'rgba(190,220,240,0.12)';
    for (const s of this.specks) {
      s.x -= s.sp * dt;
      if (s.x < -4) { s.x = 1004; s.y = W.rand(30, 445); }
      ctx.fillRect(s.x, s.y, s.s, s.s * 0.7);
    }

    // loose fog scraps drifting through the deadlight reaches
    if (wx === 'gloom' || wx === 'storm') {
      if (!this.scraps) {
        this.scraps = [];
        for (let i = 0; i < 5; i++) {
          this.scraps.push({ x: W.rand(0, 1000), y: W.rand(40, 380), sp: W.rand(6, 14), sz: W.rand(150, 320), a: W.rand(0.05, 0.1) });
        }
      }
      for (const f of this.scraps) {
        f.x -= f.sp * dt;
        if (f.x < -f.sz) { f.x = 1000 + f.sz; f.y = W.rand(this.HORIZON, 400); }
        const im = this.spr('smoke' + (1 + (this.scraps.indexOf(f) % 5)));
        if (im) {
          ctx.globalAlpha = f.a;
          ctx.drawImage(im, f.x - f.sz / 2, f.y - f.sz / 3, f.sz, f.sz * 0.66);
          ctx.globalAlpha = 1;
        }
      }
    }

    // rain
    if (wx === 'squall' || wx === 'storm') {
      if (!this.drops) {
        this.drops = [];
        for (let i = 0; i < 80; i++) {
          this.drops.push({ x: W.rand(0, 1050), y: W.rand(0, 460), sp: W.rand(320, 520), len: W.rand(8, 16) });
        }
      }
      const n = wx === 'storm' ? this.drops.length : 45;
      ctx.strokeStyle = 'rgba(170,195,220,0.26)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const d = this.drops[i];
        d.y += d.sp * dt; d.x -= d.sp * 0.25 * dt;
        if (d.y > 462) { d.y = -10; d.x = W.rand(0, 1080); }
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.len * 0.25, d.y - d.len);
      }
      ctx.stroke();
    }

    // lightning
    if (wx !== 'fair') {
      if (this.boltT == null) this.boltT = W.rand(4, 12);
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.flash = 0.45;
        this.boltT = wx === 'storm' ? W.rand(3, 8) : W.rand(9, 20);
      }
      if (this.flash > 0) {
        this.flash = Math.max(0, this.flash - dt * 1.6);
        ctx.fillStyle = wx === 'gloom'
          ? `rgba(203,184,255,${this.flash * 0.3})` : `rgba(235,242,250,${this.flash * 0.3})`;
        ctx.fillRect(0, 0, 1000, 460);
      }
    }
  },

  hullPath(o, bw, bh, isPlayer) {
    const ctx = this.ctx;
    const top = o.y - 10, bot = o.y + bh + 10, mid = o.y + bh / 2;
    const rear = isPlayer ? o.x - 14 : o.x + bw + 14;
    const front = isPlayer ? o.x + bw + 4 : o.x - 4;
    const tip = isPlayer ? o.x + bw + 36 : o.x - 36;
    ctx.beginPath();
    ctx.moveTo(rear, top + 6);
    ctx.quadraticCurveTo((rear + front) / 2, top - 3, front, top + 2);
    ctx.quadraticCurveTo(tip - (isPlayer ? -6 : 6) * 0.4, top + 8, tip, mid);
    ctx.quadraticCurveTo(tip - (isPlayer ? -6 : 6) * 0.4, bot - 8, front, bot - 2);
    ctx.quadraticCurveTo((rear + front) / 2, bot + 3, rear, bot - 6);
    ctx.quadraticCurveTo(rear + (isPlayer ? -7 : 7), mid, rear, top + 6);
    ctx.closePath();
  },

  drawShip(ship, dt) {
    dt = dt || 0.016;
    const ctx = this.ctx, o = this.shipOrigin(ship), L = ship.layout;
    const bw = L.w * W.TILE, bh = L.h * W.TILE;
    const dir = ship.isPlayer ? 1 : -1;

    // gentle roll; a beaten ship lists over and slides under
    const sinkP = (!ship.isPlayer && W.Combat.sinking)
      ? Math.min(1, W.Combat.sinking.t / W.Combat.sinking.dur) : 0;
    const roll = Math.sin(this.t * 0.9 + (ship.isPlayer ? 0 : 2.1)) * 0.014;
    const pivotX = o.x + bw / 2, pivotY = o.y + bh + 4;
    ctx.save();
    ctx.translate(pivotX, pivotY + sinkP * sinkP * 90);
    ctx.rotate(roll + sinkP * dir * -0.35);
    ctx.translate(-pivotX, -pivotY);
    if (sinkP > 0.6) ctx.globalAlpha = Math.max(0, 1 - (sinkP - 0.6) / 0.4);
    try {

    // masts and sails rise behind the deck plan
    this.drawMasts(ship, o, bw, dir);

    const hullSpr = this.spr('hull_' + ship.layoutId);
    if (hullSpr) {
      // painted hull: source-crop rail→waterline per calibration, anchor the
      // painted waterline at ours, keep aspect within sane bounds
      const cal = this.HULL_CAL[ship.layoutId] || { sy: 0.15, sb: 0.64 };
      const iw = hullSpr.naturalWidth, ih = hullSpr.naturalHeight;
      const srcY = ih * cal.sy, srcH = ih * (cal.sb - cal.sy);
      const dw = bw + 120, dx = o.x - 60;
      const dh = W.clamp(dw * srcH / iw, 120, 185);
      const wlY = o.y + bh + 8;
      const dy = wlY - dh;
      ctx.save();
      if (!ship.isPlayer) {
        ctx.translate(dx + dw / 2, 0);
        ctx.scale(-1, 1);
        ctx.translate(-(dx + dw / 2), 0);
      }
      ctx.drawImage(hullSpr, 0, srcY, iw, srcH, dx, dy, dw, dh);
      ctx.restore();
    } else {
    // wooden hull
    const wood = ctx.createLinearGradient(0, o.y - 10, 0, o.y + bh + 10);
    wood.addColorStop(0, ship.isPlayer ? '#5a4530' : '#553328');
    wood.addColorStop(1, ship.isPlayer ? '#30251a' : '#2e1c18');
    this.hullPath(o, bw, bh, ship.isPlayer);
    ctx.fillStyle = wood;
    ctx.fill();
    // planking inside the hull
    ctx.save();
    this.hullPath(o, bw, bh, ship.isPlayer);
    ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    for (let y = o.y - 8; y < o.y + bh + 10; y += 9) {
      ctx.beginPath();
      ctx.moveTo(o.x - 50, y + Math.sin(y) * 1.5);
      ctx.lineTo(o.x + bw + 50, y + Math.sin(y * 1.3) * 1.5);
      ctx.stroke();
    }
    // gold wale stripe
    ctx.strokeStyle = 'rgba(217,169,74,0.35)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(o.x - 40, o.y + bh + 1);
    ctx.lineTo(o.x + bw + 40, o.y + bh + 1);
    ctx.stroke();
    ctx.restore();
    this.hullPath(o, bw, bh, ship.isPlayer);
    ctx.strokeStyle = ship.isPlayer ? '#77603f' : '#75473c';
    ctx.lineWidth = 2;
    ctx.stroke();

    // lit stern-gallery windows
    const sternWx = ship.isPlayer ? o.x - 2 : o.x + bw + 2;
    ctx.fillStyle = 'rgba(255,217,138,0.85)';
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(sternWx, o.y + bh - 28 + k * 9, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    } // end procedural hull (skipped when painted hull art is loaded)

    // rooms (deck plan)
    for (const r of ship.rooms) {
      const rr = this.roomRect(ship, r);
      this.hitRooms.push({ ship, idx: r.idx, x: rr.x, y: rr.y, w: rr.w, h: rr.h });

      if (hullSpr) {
        // deck-plan style over painted hulls: dark glass, not colored boxes
        ctx.fillStyle = 'rgba(8,12,16,0.42)';
        ctx.fillRect(rr.x, rr.y, rr.w, rr.h);
        if (r.sys && this.SYS_TINT[r.sys]) {
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = this.SYS_TINT[r.sys];
          ctx.fillRect(rr.x, rr.y, rr.w, rr.h);
          ctx.globalAlpha = 1;
        }
      } else {
        ctx.fillStyle = ship.isPlayer ? '#182a3c' : '#2c1d22';
        ctx.fillRect(rr.x, rr.y, rr.w, rr.h);
        if (r.sys && this.SYS_TINT[r.sys]) {
          ctx.fillStyle = this.SYS_TINT[r.sys];
          ctx.fillRect(rr.x, rr.y, rr.w, rr.h);
        }
        // deck boards
        ctx.strokeStyle = 'rgba(0,0,0,0.22)';
        ctx.lineWidth = 1;
        for (let x = rr.x + 11; x < rr.x + rr.w; x += 11) {
          ctx.beginPath(); ctx.moveTo(x, rr.y + 1); ctx.lineTo(x, rr.y + rr.h - 1); ctx.stroke();
        }
      }

      const sys = r.sys ? ship.systems[r.sys] : null;
      const dam = sys ? Math.ceil(sys.damage - 1e-6) : 0;
      const dead = sys && dam >= sys.level;
      if (dead) {
        ctx.fillStyle = 'rgba(140,35,30,0.16)';
        ctx.fillRect(rr.x, rr.y, rr.w, rr.h);
      }

      // flooding, with a live wave along the surface
      if (r.water > 0.5) {
        const wh = rr.h * (r.water / 100);
        const y0 = rr.y + rr.h - wh;
        const wat = ctx.createLinearGradient(0, y0, 0, rr.y + rr.h);
        wat.addColorStop(0, 'rgba(60,140,205,0.45)');
        wat.addColorStop(1, 'rgba(25,80,150,0.8)');
        ctx.fillStyle = wat;
        ctx.beginPath();
        ctx.moveTo(rr.x, rr.y + rr.h);
        ctx.lineTo(rr.x, y0);
        for (let x = 0; x <= rr.w; x += 6) {
          ctx.lineTo(rr.x + x, y0 + Math.sin(this.t * 3.2 + (rr.x + x) / 9) * 1.8);
        }
        ctx.lineTo(rr.x + rr.w, rr.y + rr.h);
        ctx.closePath();
        ctx.fill();
        if (r.breach && Math.random() < dt * 8) {
          W.parts.push({
            type: 'dot', x: rr.x + 12 + W.rand(-4, 4), y: rr.y + rr.h - 8,
            vx: W.rand(-4, 4), vy: -28, age: 0, life: 0.6, size: 1.8, color: '#9fd8ff',
          });
        }
      }

      // fire: glow plus licking flames (sprite frames when loaded)
      if (r.fire > 0) {
        ctx.fillStyle = `rgba(255,110,40,${0.1 + r.fire / 300})`;
        ctx.fillRect(rr.x, rr.y, rr.w, rr.h);
        const fireSpr = this.spr(Math.floor(this.t * 8 + r.idx) % 2 ? 'fire2' : 'fire1');
        if (fireSpr) {
          for (let k = 0; k < 2; k++) {
            const fx = rr.x + rr.w * (0.3 + 0.4 * k);
            const fh = (16 + 6 * Math.sin(this.t * 9 + k * 2.7 + r.idx)) * (0.5 + r.fire / 140);
            ctx.globalAlpha = 0.9;
            ctx.drawImage(fireSpr, fx - fh * 0.4, rr.y + rr.h - 4 - fh, fh * 0.8, fh);
            ctx.globalAlpha = 1;
          }
        } else {
          for (let k = 0; k < 3; k++) {
            const fx = rr.x + rr.w * (0.22 + 0.28 * k);
            const fy = rr.y + rr.h - 5;
            const fh = (9 + 5 * Math.sin(this.t * 11 + k * 2.7 + r.idx)) * (0.4 + r.fire / 120);
            const sway = Math.sin(this.t * 7 + k) * 2.5;
            ctx.fillStyle = 'rgba(255,120,30,0.75)';
            ctx.beginPath();
            ctx.moveTo(fx - 4.5, fy); ctx.lineTo(fx + 4.5, fy); ctx.lineTo(fx + sway, fy - fh);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(255,225,100,0.85)';
            ctx.beginPath();
            ctx.moveTo(fx - 2.2, fy); ctx.lineTo(fx + 2.2, fy); ctx.lineTo(fx + sway * 0.7, fy - fh * 0.55);
            ctx.closePath(); ctx.fill();
          }
        }
        if (Math.random() < dt * 5) {
          W.parts.push({
            type: 'dot', x: rr.x + W.rand(6, rr.w - 6), y: rr.y + rr.h - 10,
            vx: W.rand(-6, 6), vy: -42, age: 0, life: 0.7, size: 1.6, color: '#ffae4a',
          });
        }
      }

      if (r.breach) {
        ctx.fillStyle = '#070c12';
        ctx.beginPath();
        ctx.arc(rr.x + rr.w - 12, rr.y + rr.h - 11, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#5cc8ff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      if (hullSpr) {
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(rr.x, rr.y, rr.w, rr.h);
        ctx.strokeStyle = 'rgba(238,222,186,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(rr.x, rr.y, rr.w, rr.h);
      } else {
        ctx.strokeStyle = ship.isPlayer ? '#43607c' : '#7a464e';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(rr.x, rr.y, rr.w, rr.h);
      }

      // system chip in the corner stays readable even with crew in the room
      if (r.sys) {
        const hexed = sys && sys.hex > 0;
        const cx = rr.x + 3, cy = rr.y + 3;
        ctx.fillStyle = 'rgba(7,14,23,0.88)';
        ctx.fillRect(cx, cy, 18, 18);
        ctx.strokeStyle = dead ? '#a33b2b' : (hexed ? '#7d97a8' : (dam > 0 ? '#b07a2a' : '#3d5871'));
        ctx.lineWidth = 1.2;
        ctx.strokeRect(cx, cy, 18, 18);
        ctx.fillStyle = dead ? '#ff5c5c' : (hexed ? '#c9d4dc' : (dam > 0 ? '#ffb44a' : '#9fc0d8'));
        ctx.font = '12px "IM Fell English", Georgia';
        ctx.textAlign = 'center';
        ctx.fillText(W.SYS[r.sys].icon, cx + 9, cy + 14);
        if (dead) {
          ctx.strokeStyle = 'rgba(255,80,80,0.9)';
          ctx.beginPath();
          ctx.moveTo(cx + 3, cy + 3); ctx.lineTo(cx + 15, cy + 15);
          ctx.moveTo(cx + 15, cy + 3); ctx.lineTo(cx + 3, cy + 15);
          ctx.stroke();
        }
      }
    }

    // covering smoke: banks rolling around the hull from the smoke-pots
    const layers = ship.wardLayers;
    if (layers > 0) {
      const cx = o.x + bw / 2, cy = o.y + bh / 2;
      const smokeLoaded = this.spr('smoke1');
      if (smokeLoaded) {
        // a soft haze under the rolling banks
        ctx.fillStyle = 'rgba(195,210,222,0.06)';
        ctx.beginPath();
        ctx.ellipse(cx, cy, bw / 2 + 40 + layers * 10, bh / 2 + 36 + layers * 8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < layers; i++) {
        const rx = bw / 2 + 36 + i * 12, ry = bh / 2 + 32 + i * 9;
        if (smokeLoaded) {
          for (let j = 0; j < 11; j++) {
            const a = j * Math.PI * 2 / 11 + this.t * 0.11 * (i % 2 ? -1 : 1) + i * 0.45;
            const px = cx + Math.cos(a) * rx;
            const py = cy + Math.sin(a) * ry;
            const im = this.spr('smoke' + ((i * 3 + j) % 5 + 1));
            const sz = 48 + 9 * Math.sin(this.t * 1.6 + j * 1.7 + i * 2.4);
            ctx.globalAlpha = (ship.wardFlash > 0 ? 0.72 : 0.45) - i * 0.06;
            if (im) ctx.drawImage(im, px - sz / 2, py - sz / 2, sz, sz);
          }
          ctx.globalAlpha = 1;
        } else {
          ctx.beginPath();
          ctx.strokeStyle = ship.wardFlash > 0
            ? 'rgba(230,238,242,0.9)' : `rgba(175,190,200,${0.4 - i * 0.07})`;
          ctx.lineWidth = 6;
          ctx.setLineDash([20, 14]);
          ctx.lineDashOffset = this.t * (14 + i * 6) * (i % 2 ? -1 : 1);
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // targeting overlays
    if (!ship.isPlayer && W.player) {
      const colors = ['#ffd24a', '#7ad7ff', '#ff8a5c', '#c59fff'];
      W.player.weapons.forEach((w, i) => {
        if (w.target == null || !ship.rooms[w.target]) return;
        const rr = this.roomRect(ship, ship.rooms[w.target]);
        ctx.strokeStyle = colors[i % 4];
        ctx.lineWidth = 2;
        const m = 4 + (i % 4) * 3;
        ctx.strokeRect(rr.x + m, rr.y + m, rr.w - m * 2, rr.h - m * 2);
      });
    }
    if (ship.isPlayer && W.Combat.active && W.Combat.enemy) {
      for (const w of W.Combat.enemy.weapons) {
        if (w.target == null || !ship.rooms[w.target]) continue;
        if (w.charge / w.def.charge < 0.7) continue; // telegraph only near-ready guns
        const rr = this.roomRect(ship, ship.rooms[w.target]);
        ctx.strokeStyle = `rgba(255,80,80,${0.25 + 0.3 * Math.sin(this.t * 6)})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(rr.x + 2, rr.y + 2, rr.w - 4, rr.h - 4);
      }
    }

    this.drawMounts(ship, o, bw, bh, dir);

    for (const c of ship.crew) this.drawPerson(ship, c, false);
    for (const c of ship.intruders) this.drawPerson(ship, c, true);

    } finally { ctx.restore(); } // the roll/sink transform ALWAYS unwinds

    // the hull sits IN the sea: a foreground water band across the lower hull
    const wl = o.y + bh + 4;
    ctx.beginPath();
    ctx.moveTo(o.x - 55, wl + 26);
    ctx.lineTo(o.x - 55, wl);
    for (let x = -55; x <= bw + 55; x += 10) {
      ctx.lineTo(o.x + x, wl + Math.sin(this.t * 2.4 + (o.x + x) / 26) * 2.5);
    }
    ctx.lineTo(o.x + bw + 55, wl + 26);
    ctx.closePath();
    const wg = ctx.createLinearGradient(0, wl, 0, wl + 26);
    wg.addColorStop(0, 'rgba(19,44,68,0.8)');
    wg.addColorStop(1, 'rgba(11,26,41,0.12)');
    ctx.fillStyle = wg;
    ctx.fill();
    ctx.beginPath();
    for (let x = -50; x <= bw + 50; x += 10) {
      const y = wl + Math.sin(this.t * 2.4 + (o.x + x) / 26) * 2.5;
      if (x === -50) ctx.moveTo(o.x + x, y); else ctx.lineTo(o.x + x, y);
    }
    ctx.strokeStyle = 'rgba(220,240,250,0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // wake trailing astern
    const sternX = ship.isPlayer ? o.x - 20 : o.x + bw + 20;
    const wakeDir = ship.isPlayer ? -1 : 1;
    ctx.strokeStyle = 'rgba(200,225,240,0.15)';
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(sternX, wl + 4 + k * 5);
      ctx.quadraticCurveTo(sternX + wakeDir * 40, wl + 7 + k * 5,
        sternX + wakeDir * (70 + k * 28), wl + 2 + k * 6);
      ctx.stroke();
    }

    // nameplate and (for the player) live status
    if (sinkP > 0) return;
    const bot = o.y + bh;
    ctx.fillStyle = ship.isPlayer ? '#8fa9bd' : '#c9909a';
    ctx.font = 'italic 13px "IM Fell English", Georgia';
    ctx.textAlign = ship.isPlayer ? 'left' : 'right';
    ctx.fillText(ship.name, ship.isPlayer ? o.x : o.x + bw, bot + 30);
    if (ship.isPlayer) {
      ctx.font = '12px "IM Fell English", Georgia';
      ctx.fillStyle = '#7d9cb5';
      const status = `evasion ${ship.evasion()}%  ·  smoke ${ship.wardLayers}/${ship.maxWard()}`;
      ctx.fillText(status, o.x, bot + 46);
      if (W.Combat.active && W.Combat.escaping) {
        ctx.fillStyle = '#e9c46a';
        ctx.fillText(`raising full sail… ${Math.floor(W.Combat.escape * 100)}%`, o.x + 180, bot + 46);
      }
    }
  },

  // Guns mounted along the hull band, barrels toward the enemy. They glow when
  // charged, recoil when the broadside goes off.
  mountPos(ship, i) {
    const o = this.shipOrigin(ship), L = ship.layout;
    const bw = L.w * W.TILE;
    const dir = ship.isPlayer ? 1 : -1;
    const frontX = ship.isPlayer ? o.x + bw - 16 : o.x + 16;
    // guns sit on the weather deck, above the room plan and clear of the sea
    return { x: frontX - dir * i * 30, y: o.y - 24, dir };
  },

  drawMounts(ship, o, bw, bh, dir) {
    const ctx = this.ctx;
    const cannonSpr = this.spr('cannon');
    ship.weapons.forEach((w, i) => {
      const m = this.mountPos(ship, i);
      w._recoil = Math.max(0, (w._recoil || 0) - 3 * (1 / 60));
      const kick = -dir * 7 * (w._recoil || 0);
      const ready = w.powered && w.charge >= w.def.charge;
      if (ready) {
        ctx.fillStyle = `rgba(240,208,96,${0.25 + 0.15 * Math.sin(this.t * 7)})`;
        ctx.beginPath();
        ctx.arc(m.x + kick, m.y + 8, 13, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = w.powered ? 1 : 0.45;
      if (cannonSpr) {
        ctx.save();
        ctx.translate(m.x + kick, m.y);
        if (!ship.isPlayer) ctx.scale(-1, 1);
        ctx.drawImage(cannonSpr, -14, 0, 29, 16);
        ctx.restore();
      } else {
        ctx.fillStyle = '#22282e';
        ctx.fillRect(m.x + kick - 10, m.y + 4, 20, 7);
        ctx.fillRect(m.x + kick + dir * 6, m.y + 5, dir * 8, 5);
      }
      ctx.globalAlpha = 1;
    });
  },

  drawMasts(ship, o, bw, dir) {
    const ctx = this.ctx;
    const deck = o.y - 8;
    const full = ship.eff('sails') > 0;
    [0.3, 0.64].forEach((frac, mi) => {
      const mx = o.x + bw * frac;
      ctx.strokeStyle = '#3c2e1e';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(mx, deck + 4); ctx.lineTo(mx, deck - 56); ctx.stroke();
      // yard
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(mx - 24, deck - 45); ctx.lineTo(mx + 24, deck - 45); ctx.stroke();
      if (full) {
        const billow = dir * (9 + 2 * Math.sin(this.t * 1.8 + mi * 1.7));
        ctx.fillStyle = 'rgba(230,223,203,0.85)';
        ctx.strokeStyle = 'rgba(60,50,35,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(mx - 23, deck - 44);
        ctx.lineTo(mx + 23, deck - 44);
        ctx.bezierCurveTo(mx + 23 + billow, deck - 32, mx + 21 + billow, deck - 20, mx + 17 + billow * 0.8, deck - 11);
        ctx.lineTo(mx - 17 + billow * 0.8, deck - 11);
        ctx.bezierCurveTo(mx - 21 + billow, deck - 20, mx - 23 + billow, deck - 32, mx - 23, deck - 44);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      } else {
        ctx.fillStyle = '#4a3c26';
        ctx.fillRect(mx - 21, deck - 48, 42, 6);
      }
      if (mi === 0) {
        // pennant
        const flut = Math.sin(this.t * 5) * 3;
        ctx.fillStyle = ship.isPlayer ? '#e9c46a' : '#c2482e';
        ctx.beginPath();
        ctx.moveTo(mx, deck - 56);
        ctx.quadraticCurveTo(mx + dir * 9, deck - 58 + flut, mx + dir * 17, deck - 54 + flut);
        ctx.lineTo(mx, deck - 51);
        ctx.closePath();
        ctx.fill();
      }
    });

    // standing rigging: bowsprit, jib, stays, and shrouds with ratlines
    const foreFrac = dir === 1 ? 0.64 : 0.3;
    const aftFrac = dir === 1 ? 0.3 : 0.64;
    const foreMx = o.x + bw * foreFrac, aftMx = o.x + bw * aftFrac;
    const bowBaseX = dir === 1 ? o.x + bw + 2 : o.x - 2;
    const tipX = bowBaseX + dir * 40, tipY = deck - 22;
    ctx.strokeStyle = '#3c2e1e';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(bowBaseX, deck + 8); ctx.lineTo(tipX, tipY); ctx.stroke();
    // jib sail stretched from bowsprit to the foremast head
    if (ship.eff('sails') > 0) {
      const bl = 3 + Math.sin(this.t * 1.9) * 1.5;
      ctx.fillStyle = 'rgba(230,223,203,0.8)';
      ctx.strokeStyle = 'rgba(60,50,35,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tipX - dir * 4, tipY + 2);
      ctx.lineTo(foreMx, deck - 52);
      ctx.quadraticCurveTo(foreMx + dir * 22 + dir * bl, deck - 26, tipX - dir * 8, tipY + 6);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(38,29,18,0.65)';
    ctx.lineWidth = 1;
    // forestay and backstay
    ctx.beginPath(); ctx.moveTo(foreMx, deck - 56); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(aftMx, deck - 56);
    ctx.lineTo(dir === 1 ? o.x - 6 : o.x + bw + 6, deck + 6); ctx.stroke();
    // shrouds with ratline rungs on each mast
    [foreMx, aftMx].forEach((mx) => {
      const footA = mx - 17, footB = mx + 17;
      ctx.beginPath();
      ctx.moveTo(mx, deck - 54); ctx.lineTo(footA, deck + 4);
      ctx.moveTo(mx, deck - 54); ctx.lineTo(footB, deck + 4);
      ctx.stroke();
      for (let r = 1; r <= 4; r++) {
        const f = r / 5;
        ctx.beginPath();
        ctx.moveTo(W.lerp(mx, footA, f), W.lerp(deck - 54, deck + 4, f));
        ctx.lineTo(W.lerp(mx, footB, f), W.lerp(deck - 54, deck + 4, f));
        ctx.stroke();
      }
    });
  },

  drawPerson(ship, c, isIntruder) {
    const ctx = this.ctx;
    const base = this.crewPos(ship, c);
    const fan = this.fanOffset(ship, c);
    const x = base.x + fan.dx, y = base.y + fan.dy;
    const col = W.RACES[c.race].color;

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x, y + 9, 6, 2.2, 0, 0, Math.PI * 2); ctx.fill();

    if (W.UI && W.UI.sel.crew === c) {
      ctx.beginPath();
      ctx.arc(x, y, 13 + Math.sin(this.t * 6), 0, Math.PI * 2);
      ctx.strokeStyle = '#e9c46a';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // meeple: body capsule + head (Brass get a square head).
    // Intruders are unmistakable: enemy red, marked FOE.
    ctx.fillStyle = isIntruder ? '#a02418' : col;
    ctx.strokeStyle = isIntruder ? '#ff3b3b' : '#0a1018';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - 5.5, y - 2, 11, 10.5, 4);
    else ctx.rect(x - 5.5, y - 2, 11, 10.5);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    if (c.race === 'brass') ctx.rect(x - 3.6, y - 9.6, 7.2, 7.2);
    else ctx.arc(x, y - 6, 4.1, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    if (isIntruder) {
      ctx.fillStyle = '#ff6a5c';
      ctx.font = 'bold 9px Georgia';
      ctx.textAlign = 'center';
      ctx.fillText('FOE', x, y - 14);
    }

    const frac = W.clamp(c.hp / c.maxHp, 0, 1);
    ctx.fillStyle = '#0a141f';
    ctx.fillRect(x - 8, y + 11, 16, 3);
    ctx.fillStyle = frac > 0.4 ? '#63d68a' : '#e2683e';
    ctx.fillRect(x - 8, y + 11, 16 * frac, 3);
  },

  // --- Line of Battle: the admiral's plan, animated ---
  // Bird's-eye ink-on-parchment, after Nelson's own battle sketches. Each
  // doctrine IS a set of drawn routes; ships slide along them as rounds pass.
  fleetProgress() {
    const F = W.Fleet;
    if (F.phase !== 'battle' && F.phase !== 'done' && F.phase !== 'crisis') return 0;
    return (F.battleT || 0) / F.ROUND_S;
  },

  bez(pts, t) {
    const [a, b, c, d] = pts;
    const u = 1 - t;
    return {
      x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
      y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
    };
  },

  enemyRouteFor(i) {
    const F = W.Fleet;
    const e = (F.enemy || [])[i];
    const a = this.enemyAnchor(i);
    if (!e) return { dur: 4.5, pts: [a, a, a, a] };
    const o = e.order || { tactic: 'engage', target: 0 };
    const pIdx = W.clamp(o.target | 0, 0, Math.max(0, (F.ships || []).length - 1));
    // aim where her target will be, not where he started
    const aim = (F.ships && F.ships[pIdx]) ? this.routeFor(pIdx).pts[3] : { x: 400, y: a.y };
    switch (o.tactic) {
      case 'cut':
        // she means to break YOUR line: out of her station, across his bow,
        // down his unengaged side — her crossing lands with her rake
        return { dur: e.trait === 'flyer' ? 2.6 : 3.8, pts: [a,
          { x: a.x - 110, y: a.y - 14 },
          { x: aim.x + 34, y: aim.y - 56 },
          { x: aim.x - 56, y: aim.y + 22 }] };
      case 'board':
        // straight at him until the hulls touch
        return { dur: 2.7, pts: [a,
          { x: a.x - 90, y: a.y + 6 },
          { x: aim.x + 130, y: aim.y + 4 },
          { x: aim.x + 30, y: aim.y }] };
      case 'range':
        // she keeps her distance, edging away down the line
        return { dur: 3.2, pts: [a,
          { x: a.x + 26, y: a.y + 14 },
          { x: a.x + 48, y: a.y + 30 },
          { x: a.x + 62, y: a.y + 46 }] };
      default:
        // stand on in line ahead, edging down toward the action
        return { dur: 4.5, pts: [a,
          { x: a.x - 8, y: a.y + 18 },
          { x: a.x - 18, y: a.y + 36 },
          { x: a.x - 28, y: a.y + 54 }] };
    }
  },

  enemyAnchor(i) {
    const n = (W.Fleet.enemy || []).length || 3;
    const gap = n > 3 ? 96 : 122;
    return { x: 640 + i * 22, y: 226 - ((n - 1) / 2) * gap + i * gap };
  },

  playerStart(i) {
    const n = (W.Fleet.ships || []).length || 3;
    const gap = n > 3 ? 92 : 100;
    return { x: 105, y: 218 - ((n - 1) / 2) * gap + i * gap };
  },

  // every ship's ORDER draws her own route on the plan
  routeFor(i) {
    const F = W.Fleet;
    const s = F.ships[i];
    const start = this.playerStart(i);
    const o = (s && s.order) || { tactic: 'engage', target: Math.min(i, 2) };
    const tgt = this.enemyAnchor(W.clamp(o.target | 0, 0, 2));
    switch (o.tactic) {
      case 'cut':
        // the classic: pierce the gap astern of her, rake as you cross, come
        // up her far side — timed so the crossing lands as the rake fires
        return { dur: s && s.trait === 'flyer' ? 2.6 : 3.8, pts: [start,
          { x: 370, y: start.y - 10 },
          { x: tgt.x - 34, y: tgt.y - 58 },
          { x: tgt.x + 54, y: tgt.y + 26 }] };
      case 'range':
        return { dur: 3, pts: [start,
          { x: 220, y: start.y + 6 },
          { x: 300, y: start.y + 14 },
          { x: 330, y: start.y + 18 }] };
      case 'board':
        // run straight in until the hulls touch
        return { dur: 2.7, pts: [start,
          { x: 330, y: start.y },
          { x: tgt.x - 150, y: tgt.y - 6 },
          { x: tgt.x - 28, y: tgt.y }] };
      case 'screen': {
        const fp = i === 0 ? { x: 330, y: 200 } : this.routeFor(0).pts[3];
        return { dur: 3.5, pts: [start,
          { x: 280, y: start.y },
          { x: fp.x - 90, y: fp.y + 42 },
          { x: fp.x - 48, y: fp.y + 30 }] };
      }
      default:
        return { dur: 3.5, pts: [start,
          { x: 330, y: start.y },
          { x: tgt.x - 170, y: tgt.y - 12 },
          { x: tgt.x - 48, y: tgt.y + 4 }] };
    }
  },

  // a ship's own clock stops when she strikes or sinks; until then both
  // sides are under way
  shipProg(s) {
    const F = W.Fleet;
    let bt = F.battleT || 0;
    if (s.struck && s.struckAt != null) bt = Math.min(bt, s.struckAt);
    if (s.sunk && s.sunkAt != null) bt = Math.min(bt, s.sunkAt);
    return bt / F.ROUND_S;
  },

  // colors down: she falls out of the line and drifts to leeward
  wreckDrift(s, p) {
    const F = W.Fleet;
    if (s.struck && s.struckAt != null) {
      const d = Math.min(26, Math.max(0, (F.battleT || 0) - s.struckAt) * 1.1);
      p.x += d * 0.8;
      p.y += d * 0.5;
    }
    return p;
  },

  fleetPos(ship) {
    const F = W.Fleet;
    if (ship.side === 'enemy') {
      const i = F.enemy.indexOf(ship);
      if (i < 0) return null;
      if (F.phase === 'muster') {
        const a = this.enemyAnchor(i);
        return { x: a.x, y: a.y, h: Math.PI / 2 };
      }
      const r = this.enemyRouteFor(i);
      const tt = W.clamp(this.shipProg(ship) / r.dur, 0, 0.999);
      const pos = this.bez(r.pts, tt);
      const ahead = this.bez(r.pts, Math.min(0.9999, tt + 0.01));
      const h = Math.atan2(ahead.y - pos.y, ahead.x - pos.x);
      const bob = tt >= 0.99 ? Math.sin(this.t * 0.6 + i) * 2 : 0;
      return this.wreckDrift(ship, { x: pos.x + bob, y: pos.y, h });
    }
    const i = F.ships.indexOf(ship);
    if (i < 0) return null;
    if (F.phase === 'muster') {
      const s = this.playerStart(i);
      return { x: s.x, y: s.y, h: 0 };
    }
    const r = this.routeFor(i);
    const tt = W.clamp(this.shipProg(ship) / r.dur, 0, 0.999);
    const pos = this.bez(r.pts, tt);
    const ahead = this.bez(r.pts, Math.min(0.9999, tt + 0.01));
    const h = Math.atan2(ahead.y - pos.y, ahead.x - pos.x);
    const bobX = tt >= 0.99 ? Math.sin(this.t * 0.8 + i) * 2 : 0;
    return this.wreckDrift(ship, { x: pos.x + bobX, y: pos.y, h });
  },

  drawShipMarker(ctx, p, len, ink, struck, sunk, sails, s) {
    const F = W.Fleet;
    const since = (at) => (at != null ? Math.max(0, (F.battleT || 0) - at) : 99);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.h);
    if (sunk) {
      const dt = s ? since(s.sunkAt) : 99;
      if (dt < 2.2) {
        // she settles: tilting, fading, the sea ringing her
        ctx.rotate(dt * 0.3);
        ctx.globalAlpha = Math.max(0.15, 1 - dt / 2.2);
        const w = len * 0.3;
        ctx.beginPath();
        ctx.moveTo(len * 0.52, 0);
        ctx.quadraticCurveTo(len * 0.16, w * 0.9, -len * 0.48, w * 0.55);
        ctx.lineTo(-len * 0.48, -w * 0.55);
        ctx.quadraticCurveTo(len * 0.16, -w * 0.9, len * 0.52, 0);
        ctx.closePath();
        ctx.fillStyle = 'rgba(245,238,216,0.8)';
        ctx.fill();
        ctx.strokeStyle = ink;
        ctx.stroke();
        ctx.rotate(-dt * 0.3);
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#3a2a17';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, len * 0.35 + dt * 14, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        return;
      }
      ctx.strokeStyle = '#a02418';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-8, -8); ctx.lineTo(8, 8);
      ctx.moveTo(8, -8); ctx.lineTo(-8, 8);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (struck) {
      const dt = s ? since(s.struckAt) : 99;
      ctx.globalAlpha = dt < 1.4 ? 1 - 0.5 * (dt / 1.4) : 0.5;
      if (dt < 1.4) {
        // her colors come down the halyard
        ctx.rotate(-p.h);
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(0, -4); ctx.stroke();
        const fy = -22 + 16 * (dt / 1.4);
        ctx.fillStyle = '#a02418';
        ctx.fillRect(0.5, fy, 9, 5);
        ctx.rotate(p.h);
      }
    }
    const w = len * 0.3;
    ctx.beginPath();
    ctx.moveTo(len * 0.52, 0);
    ctx.quadraticCurveTo(len * 0.16, w * 0.9, -len * 0.48, w * 0.55);
    ctx.lineTo(-len * 0.48, -w * 0.55);
    ctx.quadraticCurveTo(len * 0.16, -w * 0.9, len * 0.52, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(245,238,216,0.92)';
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    // masts as inked dots, square-sail crossbars when under way
    const masts = len > 48 ? 3 : 2;
    for (let m = 0; m < masts; m++) {
      const mx = len * (0.22 - m * 0.3);
      ctx.beginPath();
      ctx.arc(mx, 0, 2, 0, Math.PI * 2);
      ctx.fillStyle = ink;
      ctx.fill();
      if (sails) {
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(mx, -w * 0.85);
        ctx.lineTo(mx, w * 0.85);
        ctx.stroke();
      }
    }
    if (struck) {
      ctx.rotate(-p.h);
      ctx.font = '12px Georgia';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#5a4020';
      ctx.fillText('⚑', 0, -14);
    }
    ctx.restore();
  },

  drawFleet(dt) {
    const ctx = this.ctx;
    const F = W.Fleet;
    const INK = '#3a2a17', RED = '#a02418';

    // the plan is drawn on parchment
    const parch = this.spr('parchment');
    if (parch) ctx.drawImage(parch, 0, 0, parch.naturalWidth, parch.naturalHeight, 0, 0, 1000, 460);
    else ctx.fillStyle = '#e2d3a8', ctx.fillRect(0, 0, 1000, 460);
    ctx.strokeStyle = 'rgba(107,79,42,0.12)';
    ctx.lineWidth = 1;
    for (let x = 60; x < 1000; x += 72) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 460); ctx.stroke();
    }
    for (let y = 44; y < 460; y += 72) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1000, y); ctx.stroke();
    }

    // the enemy's line of battle, ruled in red
    ctx.strokeStyle = 'rgba(160,36,24,0.5)';
    ctx.setLineDash([7, 6]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const a0 = this.enemyAnchor(0), a2 = this.enemyAnchor(2);
    ctx.moveTo(a0.x, a0.y - 55);
    ctx.lineTo(a2.x, a2.y + 55);
    ctx.stroke();

    // your intended routes, sketched as the admiral drew them
    if (F.phase !== 'muster') {
      ctx.strokeStyle = 'rgba(58,42,23,0.45)';
      ctx.setLineDash([5, 6]);
      ctx.lineWidth = 1.5;
      F.ships.forEach((s, i) => {
        const r = this.routeFor(i);
        ctx.beginPath();
        for (let k = 0; k <= 24; k++) {
          const pt = this.bez(r.pts, k / 24);
          if (k === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
        // arrowhead
        const tip = r.pts[3], back = this.bez(r.pts, 0.93);
        const ang = Math.atan2(tip.y - back.y, tip.x - back.x);
        ctx.save();
        ctx.translate(tip.x, tip.y); ctx.rotate(ang);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(-8, -4); ctx.moveTo(0, 0); ctx.lineTo(-8, 4);
        ctx.stroke();
        ctx.restore();
        ctx.setLineDash([5, 6]);
      });
    }
    ctx.setLineDash([]);

    // the enemy's courses: the wake she has sailed is fact; her intention
    // is sketched ahead only when your lookouts have read her
    if (F.phase !== 'muster') {
      F.enemy.forEach((e, i) => {
        if (e.sunk) return;
        const r = this.enemyRouteFor(i);
        const tt = W.clamp(this.shipProg(e) / r.dur, 0, 0.999);
        ctx.strokeStyle = 'rgba(160,36,24,0.4)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        for (let k = 0; k <= 24; k++) {
          const pt = this.bez(r.pts, (k / 24) * tt);
          if (k === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
        if (e.intel && !e.struck && tt < 0.95) {
          ctx.setLineDash([4, 7]);
          ctx.strokeStyle = 'rgba(160,36,24,0.28)';
          ctx.beginPath();
          for (let k = 0; k <= 16; k++) {
            const pt = this.bez(r.pts, tt + (k / 16) * (0.999 - tt));
            if (k === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });
    }

    // ships as inked markers with labels and twin bars (hull, morale)
    const LEN = { cutter: 34, sloop: 40, brig: 46, frigate: 54 };
    for (const list of [F.ships, F.enemy]) {
      for (const s of list) {
        const p = this.fleetPos(s);
        if (!p) continue;
        const ink = s.side === 'player' ? INK : RED;
        this.drawShipMarker(ctx, p, LEN[s.cls] || 40, ink, s.struck, s.sunk, !s.struck && !s.sunk, s);
        if (s.sunk) continue;
        const lx = s.side === 'player' ? p.x - 26 : p.x + 26;
        ctx.textAlign = s.side === 'player' ? 'right' : 'left';
        ctx.fillStyle = s.struck ? 'rgba(90,74,50,0.6)' : '#4a3517';
        ctx.font = 'italic 12px "IM Fell English", Georgia';
        ctx.fillText(s.name + (s.captain.alive ? '' : ' †'), lx, p.y - 6);
        const bx = s.side === 'player' ? lx - 44 : lx;
        ctx.fillStyle = 'rgba(107,79,42,0.25)';
        ctx.fillRect(bx, p.y + 1, 44, 3);
        ctx.fillStyle = RED;
        ctx.fillRect(bx, p.y + 1, 44 * W.clamp(s.hull / s.hullMax, 0, 1), 3);
        ctx.fillStyle = 'rgba(107,79,42,0.25)';
        ctx.fillRect(bx, p.y + 6, 44, 2);
        ctx.fillStyle = '#8a6a1a';
        ctx.fillRect(bx, p.y + 6, 44 * W.clamp(s.morale / 70, 0, 1), 2);
      }
    }

    // broadsides in flight: lobbed arcs of iron, drawn in ink
    for (const shot of (F.shots || [])) {
      if (shot.done) continue;
      const pa = this.fleetPos(shot.a), pb = this.fleetPos(shot.b);
      if (!pa || !pb) continue;
      const frac = W.clamp(shot.t / shot.dur, 0, 1);
      const x = W.lerp(pa.x, pb.x, frac);
      const arc = -26 * Math.sin(frac * Math.PI);
      const y = W.lerp(pa.y, pb.y, frac) + arc;
      ctx.strokeStyle = 'rgba(58,42,23,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const bfrac = Math.max(0, frac - 0.12);
      ctx.moveTo(W.lerp(pa.x, pb.x, bfrac), W.lerp(pa.y, pb.y, bfrac) - 26 * Math.sin(bfrac * Math.PI));
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, shot.a.cls === 'shipofline' ? 3.4 : 2.4, 0, Math.PI * 2);
      ctx.fillStyle = shot.a.side === 'player' ? '#3a2a17' : '#a02418';
      ctx.fill();
    }

    // who fights whom: a thin line from each of your ships to her target
    if (F.phase === 'battle') {
      ctx.strokeStyle = 'rgba(160,36,24,0.22)';
      ctx.lineWidth = 1;
      for (const s of F.alive(F.ships)) {
        const b = F.targetOf(s);
        if (!b) continue;
        const pa = this.fleetPos(s), pb = this.fleetPos(b);
        if (!pa || !pb) continue;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
    }

    // floating words on the plan (RAKED!, STRUCK, and the rest)
    for (const f of W.fx) {
      f.t += dt;
      ctx.globalAlpha = W.clamp(1 - f.t / 1.6, 0, 1);
      ctx.fillStyle = f.color;
      ctx.font = 'bold 15px "IM Fell English", Georgia';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y - 18 * f.t);
    }
    ctx.globalAlpha = 1;
    W.fx = W.fx.filter(f => f.t < 1.6);

    // signal targeting: while the concentrate hoist waits on a target, ring the choices
    const selConc = W.UI && W.UI.sel && W.UI.sel.concentrate;
    if (selConc) {
      for (const e of F.enemy) {
        if (e.struck || e.sunk) continue;
        const p = this.fleetPos(e);
        if (!p) continue;
        ctx.strokeStyle = 'rgba(160,36,24,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 30 + Math.sin(this.t * 5) * 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = '#a02418';
      ctx.font = 'bold 14px "IM Fell English", Georgia';
      ctx.fillText('Click the ship the line should concentrate on — click open water to belay.', 500, 44);
    }
    if (F.concentrateT > 0 && F.concentrateTarget && !F.concentrateTarget.struck && !F.concentrateTarget.sunk) {
      const p = this.fleetPos(F.concentrateTarget);
      if (p) {
        ctx.strokeStyle = 'rgba(160,36,24,0.6)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 32, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // legend, so the plan explains itself
    ctx.textAlign = 'right';
    ctx.font = 'italic 11.5px "IM Fell English", Georgia';
    ctx.fillStyle = 'rgba(74,53,23,0.75)';
    ctx.fillText('red bar: hull · gold bar: spirit · dashed: planned course · solid red: her course as sailed · thin red line: her target', 985, 448);

    // header + the running log, in the log-keeper's hand
    ctx.textAlign = 'center';
    ctx.fillStyle = '#5a4020';
    ctx.font = 'bold 15px "IM Fell English", Georgia';
    if ((F.phase === 'battle' || F.phase === 'done') && F.planName) {
      const gaugeNote = F.gauge ? 'you hold the weather gauge' : 'they hold the weather gauge';
      const mm = Math.floor((F.battleT || 0) / 60), ss = String(Math.floor((F.battleT || 0) % 60)).padStart(2, '0');
      ctx.fillText(`THE PLAN, AS FOUGHT — ${F.planName} — ${mm}:${ss} — ${gaugeNote}`, 500, 24);
    }
    ctx.textAlign = 'left';
    ctx.font = '12.5px "IM Fell English", Georgia';
    const lines = F.log.slice(-4);
    lines.forEach((l, i) => {
      ctx.fillStyle = `rgba(74,53,23,${0.4 + 0.6 * (i / Math.max(1, lines.length - 1))})`;
      ctx.fillText(l, 30, 396 + i * 16);
    });
    this.drawParts(dt);
  },

  fleetHitTest(x, y) {
    const F = W.Fleet;
    if (!F.active || !F.enemy) return null;
    for (const e of F.enemy) {
      if (e.struck || e.sunk) continue;
      const p = this.fleetPos(e);
      if (p && Math.hypot(x - p.x, y - p.y) < 34) return e;
    }
    return null;
  },

  drawEnemyHeader(E) {
    const ctx = this.ctx;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#cfe3f0';
    ctx.font = 'bold 14px "IM Fell English", Georgia';
    ctx.fillText(E.name, 985, 26);
    const bw = 220, x = 985 - bw, y = 34;
    ctx.fillStyle = '#1a2635';
    ctx.fillRect(x, y, bw, 10);
    ctx.fillStyle = '#c2482e';
    ctx.fillRect(x, y, bw * W.clamp(E.hull / E.hullMax, 0, 1), 10);
    ctx.strokeStyle = '#3a5065';
    ctx.strokeRect(x, y, bw, 10);
    const smokeSpr = this.spr('smoke1');
    for (let i = 0; i < E.wardLayers; i++) {
      if (smokeSpr) {
        ctx.globalAlpha = 0.85;
        ctx.drawImage(smokeSpr, x + i * 18, y + 14, 16, 16);
        ctx.globalAlpha = 1;
      } else {
        ctx.beginPath();
        ctx.arc(x + 8 + i * 16, y + 22, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#cfd8dd';
        ctx.fill();
      }
    }
    ctx.fillStyle = '#8fa9bd';
    ctx.font = '12px "IM Fell English", Georgia';
    ctx.fillText(`evasion ${E.evasion()}%`, 985, y + 27);
  },

  drawProjectiles() {
    const ctx = this.ctx;
    for (const p of W.Combat.proj) {
      if (p.t < 0) continue;
      const from = (p.wepIndex != null && p.shooter.weapons[p.wepIndex])
        ? this.mountPos(p.shooter, p.wepIndex)
        : this.roomCenter(p.shooter, (p.shooter.roomOf('cannons') || p.shooter.rooms[0]).idx);
      if (!p.flashed) {
        p.flashed = true;
        const wep = p.shooter.weapons[p.wepIndex];
        if (wep) wep._recoil = 1;
        W.burst(from.x, from.y + 6, '#ffd98a', 6, 85, 0.25, 2);
        for (let s = 0; s < 2; s++) {
          W.parts.push({
            type: 'puff', key: 'smoke' + W.randi(1, 5),
            x: from.x + W.rand(-4, 4), y: from.y + W.rand(0, 8),
            vx: (p.shooter.isPlayer ? 1 : -1) * W.rand(12, 26), vy: W.rand(-14, -4),
            age: 0, life: 1.1, s0: 10, s1: 34,
          });
        }
      }
      const frac = W.clamp(p.t / p.dur, 0, 1);
      const targetRoom = p.target.rooms[p.roomIdx] || p.target.rooms[0];
      const to = this.roomCenter(p.target, targetRoom.idx);
      const x = W.lerp(from.x, to.x, frac);
      // mortars arc high; balls fly flat
      const arc = p.def.bypassWard ? -80 * Math.sin(frac * Math.PI) : -14 * Math.sin(frac * Math.PI);
      const y = W.lerp(from.y, to.y, frac) + arc;
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.moveTo(W.lerp(from.x, to.x, Math.max(0, frac - 0.07)),
        W.lerp(from.y, to.y, Math.max(0, frac - 0.07)) + arc);
      ctx.lineTo(x, y);
      ctx.stroke();
      const r = p.def.dmg >= 2 ? 5.5 : 4;
      const ballSpr = this.spr('ball');
      if (ballSpr) {
        ctx.drawImage(ballSpr, x - r, y - r, r * 2, r * 2);
      } else {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = p.def.color; ctx.fill();
      }
      // tracer tint so you can tell whose iron is whose
      ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = p.def.color; ctx.fill();
    }
  },

  drawParts(dt) {
    const ctx = this.ctx;
    for (const p of W.parts) {
      p.age += dt;
      if (p.type === 'dot') {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 130 * dt;
      }
    }
    W.parts = W.parts.filter(p => p.age < p.life);
    for (const p of W.parts) {
      const a = W.clamp(1 - p.age / p.life, 0, 1);
      if (p.type === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = a * 0.9;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r0 + (p.age / p.life) * 28, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.type === 'boom') {
        const frame = Math.min(3, 1 + Math.floor((p.age / p.life) * 3));
        const im = this.spr('explosion' + frame);
        const sz = p.size * (0.7 + (p.age / p.life) * 0.6);
        if (im) {
          ctx.globalAlpha = a;
          ctx.drawImage(im, p.x - sz / 2, p.y - sz / 2, sz, sz);
        } else {
          ctx.globalAlpha = a * 0.8;
          ctx.fillStyle = frame === 1 ? '#ffe08a' : '#ff8a3c';
          ctx.beginPath(); ctx.arc(p.x, p.y, sz / 2.6, 0, Math.PI * 2); ctx.fill();
        }
      } else if (p.type === 'puff') {
        const im = this.spr(p.key);
        p.x += p.vx * dt; p.y += p.vy * dt;
        const sz = W.lerp(p.s0, p.s1, p.age / p.life);
        if (im) {
          ctx.globalAlpha = a * 0.5;
          ctx.drawImage(im, p.x - sz / 2, p.y - sz / 2, sz, sz);
        }
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  },

  hitTest(x, y) {
    for (const h of this.hitRooms) {
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
    }
    return null;
  },

  crewHitTest(x, y) {
    if (!W.player) return null;
    for (const c of W.player.crew) {
      const p = this.crewPos(W.player, c);
      const fan = this.fanOffset(W.player, c);
      if (Math.hypot(x - p.x - fan.dx, y - p.y - fan.dy - 1) <= 12) return c;
    }
    return null;
  },
};
