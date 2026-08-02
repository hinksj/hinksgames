'use strict';

W.UI = {
  sel: { crew: null, wep: null, concentrate: false },
  els: {},
  crewSig: '', powerSig: '', wepRefs: [],

  init() {
    const $ = (id) => document.getElementById(id);
    this.els = {
      hullfill: $('hullfill'), hulltext: $('hulltext'), gold: $('gold'),
      resources: $('resources'),
      sector: $('sectorlabel'), pausehint: $('pausehint'),
      crewlist: $('crewlist'), power: $('powerpanel'), weapons: $('weaponpanel'),
      escape: $('escapebtn'), modal: $('modal-root'), canvas: $('game'),
      fleetui: $('fleetui'), sigCloser: $('sigCloser'), sigBreak: $('sigBreak'), sigCount: $('sigCount'),
      sigConc: $('sigConc'), sigWear: $('sigWear'),
    };

    // rich tooltips: any element with data-tip shows a styled explainer box
    this.tipEl = document.createElement('div');
    this.tipEl.id = 'tooltip';
    this.tipEl.className = 'hidden';
    document.body.appendChild(this.tipEl);
    document.addEventListener('mouseover', (e) => {
      const el = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
      if (!el) { this.tipEl.classList.add('hidden'); return; }
      this.tipEl.innerHTML = el.dataset.tip;
      this.tipEl.classList.remove('hidden');
      const r = el.getBoundingClientRect();
      const tw = this.tipEl.offsetWidth, th = this.tipEl.offsetHeight;
      const x = W.clamp(r.left + r.width / 2 - tw / 2, 6, window.innerWidth - tw - 6);
      let y = r.top - th - 8;
      if (y < 4) y = r.bottom + 8;
      this.tipEl.style.left = x + 'px';
      this.tipEl.style.top = y + 'px';
    });

    if (W.Sound) {
      W.Sound.init();
      const mute = document.getElementById('mutebtn');
      if (mute) {
        mute.classList.toggle('off', !W.Sound.on);
        mute.textContent = W.Sound.on ? '🔊' : '🔇';
        mute.addEventListener('click', () => {
          const on = W.Sound.toggle();
          mute.classList.toggle('off', !on);
          mute.textContent = on ? '🔊' : '🔇';
        });
      }
      // audio contexts need a user gesture; arm on the first click anywhere
      document.addEventListener('pointerdown', () => { if (W.Sound.on) W.Sound.ensure(); }, { once: true });
    }
    const help = document.getElementById('helpbtn');
    if (help) help.addEventListener('click', () => {
      if (W.state.mode === 'combat') W.paused = true;
      this.openGlossary(() => this.closeModal());
    });

    this.els.escape.dataset.tip = '<b>Raise full sail</b> — run from this fight. A timer fills ' +
      '(faster with more hands in the Sails); when it completes you escape to the chart. No loot for running.';

    if (this.els.sigCloser) {
      this.els.sigCloser.addEventListener('click', () => W.Fleet.hoist('closer'));
      this.els.sigBreak.addEventListener('click', () => W.Fleet.hoist('breakoff'));
      if (this.els.sigConc) this.els.sigConc.addEventListener('click', () => {
        this.sel.concentrate = !this.sel.concentrate;
      });
      if (this.els.sigWear) this.els.sigWear.addEventListener('click', () => W.Fleet.hoist('wear'));
      this.els.sigCloser.dataset.tip = '<b>Engage the enemy more closely</b> — for a while the whole ' +
        'line loads faster and fights harder. One of your three hoists.';
      if (this.els.sigConc) this.els.sigConc.dataset.tip = '<b>Concentrate fire</b> — pick one enemy ' +
        'ship; every captain lays his guns on her until she yields (ships screening the flag keep ' +
        'their station). One of your three hoists.';
      if (this.els.sigWear) this.els.sigWear.dataset.tip = '<b>Wear together</b> — the line turns as ' +
        'one, showing the enemy her stoutest timbers. Their fire tells for less a while; yours a ' +
        'little too. One of your three hoists.';
      this.els.sigBreak.dataset.tip = '<b>Discontinue the action</b> — the squadron withdraws in good ' +
        'order. No prizes, no rout. One of your three hoists.';
    }
    this.els.canvas.addEventListener('click', (e) => this.onCanvasClick(e));
    this.els.escape.addEventListener('click', () => {
      if (W.Combat.active) W.Combat.toggleEscape();
    });
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (['combat', 'crisis', 'fleet'].includes(W.state.mode)) W.paused = !W.paused;
      } else if (e.key === 'Escape') {
        this.sel.wep = null; this.sel.crew = null; this.sel.concentrate = false;
      } else if ('1234'.includes(e.key) && W.state.mode === 'combat') {
        const w = W.player.weapons[+e.key - 1];
        if (w) this.sel.wep = w;
      }
    });
  },

  divPortrait(c) {
    const pre = { human: 'seaman', tideborn: 'diver', brass: 'carpenter', stormtouched: 'marine' }[c.race] || 'seaman';
    const v = 1 + (c.id % 2);
    return `<img class="cportrait" src="assets/art/portrait_${pre}${v}.png" onerror="this.style.display='none'">`;
  },

  // ship thumbnails at consistent RELATIVE scale — a cutter is small because
  // a cutter is small; players learn the rates by eye
  SHIP_SCALE: { cutter: 0.5, sloop: 0.62, brig: 0.78, frigate: 0.95, shipofline: 1.2 },

  shipThumb(cls) {
    const w = Math.round(170 * (this.SHIP_SCALE[cls] || 0.7));
    const h = Math.round(w * 0.34);
    return `<canvas class="shipthumb" data-cls="${cls}" width="${w}" height="${h}"></canvas>`;
  },

  drawThumbs(el) {
    if (!el || !el.querySelectorAll || !W.Render || !W.Render.spr) return;
    el.querySelectorAll('canvas.shipthumb').forEach(cv => {
      try {
        const cls = cv.dataset.cls;
        const art = (W.Fleet.CLASSES[cls] || { art: cls }).art || cls;
        const spr = W.Render.spr('hull_' + art);
        const ctx2 = cv.getContext('2d');
        if (!spr || !ctx2) return;
        const cal = W.Render.HULL_CAL[art] || { sy: 0.15, sb: 0.64 };
        const iw = spr.naturalWidth, ih = spr.naturalHeight;
        const srcY = ih * cal.sy, srcH = ih * (cal.sb - cal.sy);
        const dh = Math.min(cv.height, cv.width * srcH / iw);
        ctx2.drawImage(spr, 0, srcY, iw, srcH, 0, cv.height - dh, cv.width, dh);
      } catch (e) { /* thumbnail is decoration */ }
    });
  },

  captPortrait(name, size) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return `<img class="captportrait${size === 'sm' ? ' sm' : ''}" ` +
      `src="assets/art/portrait_capt${1 + h % 6}.png" onerror="this.style.display='none'">`;
  },

  canvasXY(e) {
    const r = this.els.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (this.els.canvas.width / r.width),
      y: (e.clientY - r.top) * (this.els.canvas.height / r.height),
    };
  },

  onCanvasClick(e) {
    const { x, y } = this.canvasXY(e);
    if (W.state.mode === 'fleet') {
      if (this.sel.concentrate) {
        const foe = W.Render.fleetHitTest(x, y);
        if (foe) W.Fleet.hoist('concentrate', foe);
        this.sel.concentrate = false;
      }
      return;
    }
    const crew = W.Render.crewHitTest(x, y);
    const hit = W.Render.hitTest(x, y);

    if (this.sel.wep != null && hit && !hit.ship.isPlayer) {
      this.sel.wep.target = hit.idx;
      this.sel.wep = null;
      return;
    }
    if (crew) {
      this.sel.crew = (this.sel.crew === crew) ? null : crew;
      return;
    }
    if (this.sel.crew && hit && hit.ship.isPlayer) {
      // a room berths four: count everyone standing there or already headed there
      const headed = W.player.crew.filter(c => c !== this.sel.crew &&
        ((c.roomIdx === hit.idx && !c.path.length) ||
         (c.path.length && c.path[c.path.length - 1] === hit.idx))).length;
      if (headed >= 4) {
        const p = W.Render.roomCenter(hit.ship, hit.idx);
        W.addFx(p.x, p.y, 'FULL', '#ffb44a');
        return;
      }
      this.sel.crew.orderTo(hit.idx);
      this.sel.crew = null;
      return;
    }
    this.sel.wep = null;
    this.sel.crew = null;
  },

  update() {
    const els = this.els;
    if (els.fleetui) {
      const showSig = W.state.mode === 'fleet' && W.Fleet.active && W.Fleet.phase === 'battle';
      els.fleetui.classList.toggle('hidden', !showSig);
      if (showSig) {
        const spent = W.Fleet.signals <= 0 || !!W.Fleet.pendingSignal;
        els.sigCloser.disabled = spent;
        els.sigBreak.disabled = spent;
        if (els.sigConc) {
          els.sigConc.disabled = spent;
          els.sigConc.classList.toggle('arming', this.sel.concentrate);
          els.sigConc.textContent = this.sel.concentrate ? '⚑ Click her on the plan…' : '⚑ Concentrate on…';
        }
        if (els.sigWear) els.sigWear.disabled = spent;
        els.sigCount.textContent = `hoists left: ${W.Fleet.signals}`;
      } else {
        this.sel.concentrate = false;
      }
    }
    if (!W.player) return;
    const P = W.player;

    const frac = W.clamp(P.hull / P.hullMax, 0, 1);
    els.hullfill.style.width = (frac * 100) + '%';
    els.hullfill.className = frac < 0.35 ? 'low' : '';
    els.hulltext.textContent = `${Math.max(0, Math.ceil(P.hull))}/${P.hullMax}`;
    els.gold.textContent = `⚜ ${W.state.gold}`;
    const prov = W.state.provisions | 0;
    els.resources.textContent = `shells ${W.state.shells | 0} · provisions ${prov}`;
    els.resources.className = prov <= 2 ? 'low' : '';
    els.sector.textContent = `Reach ${W.GameMap.sector}/3 — ${W.SECTOR_NAMES[W.GameMap.sector - 1] || ''}`;
    if (W.Main.lastErr) {
      els.pausehint.textContent = `⚠ error: ${W.Main.lastErr} (please report)`;
      els.pausehint.className = 'paused';
    } else {
      const pmode = W.state.mode === 'combat' || W.state.mode === 'crisis';
      els.pausehint.textContent = W.paused && pmode ? '⏸ PAUSED — SPACE to begin' : 'SPACE to pause';
      els.pausehint.className = W.paused && pmode ? 'paused' : '';
    }

    els.escape.classList.toggle('hidden', !(W.state.mode === 'combat' && W.Combat.active));
    els.escape.classList.toggle('escaping', W.Combat.escaping);
    els.escape.textContent = W.Combat.escaping
      ? `FLEEING… ${Math.floor(W.Combat.escape * 100)}%` : 'RAISE FULL SAIL';

    this.updateCrew(P);
    this.updatePower(P);
    this.updateWeapons(P);
  },

  updateCrew(P) {
    // rebuild only when the roster or selection changes; portraits must not be
    // recreated every frame or they never finish decoding
    const sig = P.crew.map(c => c.id).join(',') + '|' +
      (this.sel.crew ? this.sel.crew.id : 0) + '|' + (P.intruders.length ? 1 : 0);
    if (sig !== this.crewSig) {
      this.crewSig = sig;
      const box = this.els.crewlist;
      box.innerHTML = '';
      this.crewRefs = [];
      for (const c of P.crew) {
        const race = W.RACES[c.race];
        const div = document.createElement('div');
        div.className = 'crewitem' + (this.sel.crew === c ? ' sel' : '');
        div.dataset.tip = `<b>${c.name}</b> — ${race.name}<br>${race.desc}<br>` +
          `<span class="tchips">repairs ×${race.repair} · fights ×${race.combat} · speed ×${race.speed}` +
          `${race.waterRes === 0 ? ' · cannot drown' : ''}${race.fireRes < 1 ? ' · shrugs off fire and flood' : ''}</span><br>` +
          `Click them, then click a room, to send them there. They act on their own once they arrive.`;
        div.innerHTML =
          this.divPortrait(c) +
          `<div class="cbody"><span class="cdot" style="background:${race.color}"></span><b>${c.name}</b>` +
          `<span class="crace">${race.name}</span>` +
          `<div class="chp"><div class="chpfill"></div></div>` +
          `<span class="cstatus"></span></div>`;
        div.addEventListener('click', () => { this.sel.crew = (this.sel.crew === c) ? null : c; });
        box.appendChild(div);
        this.crewRefs.push({ c, fill: div.querySelector('.chpfill'), status: div.querySelector('.cstatus') });
      }
      if (P.intruders.length) {
        const div = document.createElement('div');
        div.className = 'crewitem';
        div.style.borderColor = '#a33b2b';
        div.innerHTML = `<b style="color:#ff7a5c">⚠ boarders aboard!</b>`;
        box.appendChild(div);
      }
    }
    for (const r of (this.crewRefs || [])) {
      r.fill.style.width = W.clamp(r.c.hp / r.c.maxHp * 100, 0, 100) + '%';
      r.status.textContent = r.c.status;
    }
  },

  updatePower(P) {
    const parts = [`${P.reactor - P.powerUsed()}/${P.reactor}`];
    for (const [id, s] of Object.entries(P.systems)) {
      parts.push(`${id}:${s.level}:${s.power}:${Math.ceil(s.damage - 1e-6)}:${s.hex > 0 ? 1 : 0}`);
    }
    const sig = parts.join('|');
    if (sig === this.powerSig) return;
    this.powerSig = sig;

    const box = this.els.power;
    box.innerHTML = '';
    const reactorRow = document.createElement('div');
    reactorRow.className = 'reactorrow';
    const free = P.reactor - P.powerUsed();
    reactorRow.textContent = `SHIP'S COMPANY — ${free} of ${P.reactor} hands idle`;
    box.appendChild(reactorRow);

    for (const [id, s] of Object.entries(P.systems)) {
      const def = W.SYS[id];
      const row = document.createElement('div');
      row.className = 'prow';
      const dam = Math.ceil(s.damage - 1e-6);
      const usable = Math.max(0, s.level - dam);
      let state = '';
      if (s.hex > 0) state = '<br><span class="tstate" style="color:#5d7a8c">SUPPRESSED — the crew are down behind the bulwarks until the iron stops (a few seconds). It cannot be repaired away.</span>';
      else if (usable === 0) state = '<br><span class="tstate" style="color:#a33b2b">WRECKED — send crew to the room to repair it.</span>';
      else if (dam > 0) state = '<br><span class="tstate" style="color:#a3742a">Damaged — red slots are unusable until crew repair the room.</span>';
      row.dataset.tip = `<b>${def.name}</b><br>${def.desc}${state}<br>` +
        `<span class="tchips">${def.sub ? 'Needs no hands — but see the glossary (?) for how the helm works.'
          : 'Use + / − to muster hands in or out. Green slots are hands at work; empty slots are unstaffed capacity.'}</span>`;
      const hexed = s.hex > 0;
      let bars = '';
      for (let i = 0; i < s.level; i++) {
        if (i >= usable) bars += '<span class="bar dmg"></span>';
        else if (i < (def.sub ? usable : s.power)) bars += `<span class="bar ${hexed ? 'hexed' : 'filled'}"></span>`;
        else bars += '<span class="bar empty"></span>';
      }
      row.innerHTML =
        `<span class="picon">${def.icon}</span><span class="pname">${def.name}</span>` +
        (def.sub
          ? `<span class="subnote">needs no hands</span><div class="pbars">${bars}</div>`
          : `<button data-d="-1">−</button><div class="pbars">${bars}</div><button data-d="1">+</button>`);
      if (!def.sub) {
        row.querySelectorAll('button').forEach(b => {
          b.addEventListener('click', () => { P.setPower(id, +b.dataset.d); });
        });
      }
      box.appendChild(row);
    }
  },

  updateWeapons(P) {
    const box = this.els.weapons;
    if (this.wepRefs.length !== P.weapons.length ||
        this.wepRefs.some((r, i) => r.w !== P.weapons[i])) {
      box.innerHTML = '';
      this.wepRefs = P.weapons.map((w, i) => {
        const card = document.createElement('div');
        card.className = 'wcard';
        const CLASS_HELP = {
          ball: 'A standard cannonball: the enemy can dodge it, and a smoke bank will absorb it.',
          mortar: 'Flies over smoke entirely, so it always gets through — but uses one shell per shot.',
          rake: 'Hits several rooms in a line and cannot miss — but if ANY smoke bank is up, it does nothing.',
          hex: 'Sweeps the station\'s crew into cover for a few seconds — it simply stops. No damage; passes on its own.',
        };
        card.dataset.tip = `<b>${w.def.name}</b> — ${W.WEAPON_CLASS[w.def.class] || ''}<br>` +
          `${w.def.desc}<br>${CLASS_HELP[w.def.class] || ''}<br>` +
          `<span class="tchips">${W.weaponInfo(w.def).join(' · ')}</span>`;
        card.innerHTML =
          `<div class="wname"><span class="wkey">[${i + 1}]</span> ${w.def.name}</div>` +
          `<div class="wtag"></div>` +
          `<div class="chargebar"><div class="chargefill"></div></div>` +
          `<div class="wbtns"><button class="pwr">CREW</button><button class="tgt">TARGET</button></div>`;
        const fill = card.querySelector('.chargefill');
        const tag = card.querySelector('.wtag');
        const pwrBtn = card.querySelector('.pwr');
        const tgtBtn = card.querySelector('.tgt');
        pwrBtn.addEventListener('click', () => P.toggleWeapon(w));
        tgtBtn.addEventListener('click', () => {
          this.sel.wep = (this.sel.wep === w) ? null : w;
        });
        box.appendChild(card);
        return { w, card, fill, tag, tgtBtn };
      });
    }
    for (const r of this.wepRefs) {
      const frac = W.clamp(r.w.charge / r.w.def.charge, 0, 1);
      const noShell = r.w.def.shell && (W.state.shells | 0) <= 0;
      r.fill.style.width = (frac * 100) + '%';
      r.fill.className = 'chargefill' + (frac >= 1 ? ' ready' : '');
      r.card.className = 'wcard' + (r.w.powered && !noShell ? '' : ' off');
      r.tag.textContent = noShell
        ? 'MORTAR — NO SHELLS' : (W.WEAPON_CLASS[r.w.def.class] || '');
      r.tag.className = 'wtag' + (noShell ? ' noshell' : '');
      r.tgtBtn.className = 'tgt' +
        (this.sel.wep === r.w ? ' targeting' : (r.w.target != null ? ' hastarget' : ''));
      r.tgtBtn.textContent = this.sel.wep === r.w ? 'CLICK ROOM' : (r.w.target != null ? 'TARGETED' : 'TARGET');
    }
  },

  // ---------- modals ----------
  modal(opts) {
    const root = this.els.modal;
    root.classList.remove('hidden');
    root.innerHTML = '';
    const m = document.createElement('div');
    m.className = 'modal' + (opts.wide ? ' wide' : '');
    let html = '';
    if (opts.titleHtml) html += opts.titleHtml;
    else if (opts.title) html += `<h2>${opts.title}</h2>`;
    if (opts.sub) html += `<div class="sub">${opts.sub}</div>`;
    if (opts.body) html += opts.body;
    m.innerHTML = html;
    if (opts.buttons && opts.buttons.length) {
      const btns = document.createElement('div');
      btns.className = 'mbtns' + (opts.row ? ' row' : '');
      for (const b of opts.buttons) {
        const btn = document.createElement('button');
        btn.innerHTML = b.label;
        if (b.blue) btn.className = 'blue';
        if (b.disabled) btn.disabled = true;
        if (b.title) btn.title = b.title;
        btn.addEventListener('click', () => b.fn && b.fn());
        btns.appendChild(btn);
      }
      m.appendChild(btns);
    }
    root.appendChild(m);
    this.drawThumbs(m);
    return m;
  },
  closeModal() {
    this.els.modal.classList.add('hidden');
    this.els.modal.innerHTML = '';
  },

  openTitle() {
    const hasSave = W.Main.hasSave();
    const buttons = [
      { label: '⛵ New Voyage', fn: () => { this.closeModal(); W.Main.newGame(); } },
    ];
    if (hasSave) buttons.unshift({
      label: '⚓ Continue Voyage', fn: () => { this.closeModal(); W.Main.load(); },
    });
    if (W.Fleet.hasCruise()) {
      buttons.push({
        label: '⚔ Resume the cruise',
        fn: () => {
          this.closeModal();
          if (W.Fleet.loadCruise()) this.openRefit();
          else { W.Fleet.newSkirmish(); this.openMuster(); }
        },
      });
    }
    buttons.push({
      label: '⚔ Line of Battle — a commodore\'s cruise (prototype)',
      fn: () => { this.closeModal(); W.Fleet.clearCruise(); this.openCommission(); },
    });
    buttons.push({ label: 'How to Play', fn: () => this.openHowto(() => this.openTitle()) });
    buttons.push({ label: "Captain's Glossary", fn: () => this.openGlossary(() => this.openTitle()) });
    this.modal({
      titleHtml: '<div class="titlecard"><h1>WINDWARD</h1><div class="tag">Outrun the Maelstrom</div></div>',
      body: `<p>The <b>Heart of the Storm</b> is the Admiralty's dearest secret — the instrument
        by which the Crown foretells, and some swear steers, the <b>Maelstrom</b>: a storm that
        has been aimed at one rebellious coastline after another. You stole it from the Admiralty
        vault, because your home — the <b>Free Isles</b> — was marked next on its charts.</p>
        <p>Now the Maelstrom itself drives east behind you, swallowing the sea as you run —
        chance, or pursuit; no sailor aboard will say the second word aloud. Cross the three
        reaches of the Shattered Sea before it closes over your masts. At the last strait, the
        flagship <b>HMS Crown Leviathan</b> lies in blockade.</p>
        <p>Reach the Free Isles, where the Heart can be studied, or broken — and the storm's
        aim with it.</p>
        <p class="sub">A tribute to FTL: Faster Than Light, under sail.</p>`,
      buttons,
    });
  },

  openGlossary(backFn) {
    const back = backFn || (() => this.closeModal());
    const wlist = Object.values(W.WEAPONS).map(def =>
      `<div class="gterm"><b>${def.name}</b> <span class="wclasstag">${W.WEAPON_CLASS[def.class]}</span> — ${def.desc}<br>
       <span class="wchips">${W.weaponInfo(def).join(' · ')}</span></div>`).join('');
    const rlist = Object.entries(W.RACES).map(([key, r]) =>
      `<div class="gterm"><span class="gdot${key === 'brass' ? ' square' : ''}" style="background:${r.color}"></span><b>${r.name}</b> — ${r.desc}<br>
       <span class="wchips">repairs ×${r.repair} · fights ×${r.combat} · speed ×${r.speed}${r.waterRes === 0 ? ' · cannot drown' : ''}${r.fireRes < 1 ? ' · shrugs off fire and flood' : ''}</span></div>`).join('');

    const pipelineSvg = `
      <svg viewBox="0 0 720 100" width="100%" height="105">
        <circle cx="18" cy="34" r="5" fill="#ffd24a"/>
        <path d="M26 34 H86" stroke="#ffd24a" stroke-dasharray="4 4" fill="none"/>
        <rect x="92" y="18" width="40" height="32" fill="none" stroke="#9fb8c9" transform="rotate(9 112 34)"/>
        <text x="72" y="76" fill="#9fb8c9" font-size="11" text-anchor="middle">1 · DODGED? (their evasion %)</text>
        <text x="72" y="91" fill="#56718a" font-size="10" text-anchor="middle">the ball splashes wide</text>
        <text x="172" y="38" fill="#56718a" font-size="16">→</text>
        <circle cx="212" cy="34" r="5" fill="#ffd24a"/>
        <path d="M220 34 H272" stroke="#ffd24a" stroke-dasharray="4 4" fill="none"/>
        <circle cx="296" cy="30" r="14" fill="#cfd8dd" opacity=".5"/>
        <circle cx="313" cy="38" r="11" fill="#cfd8dd" opacity=".4"/>
        <circle cx="283" cy="41" r="10" fill="#cfd8dd" opacity=".35"/>
        <text x="298" y="76" fill="#9fb8c9" font-size="11" text-anchor="middle">2 · SMOKE BANK? It swallows the ball</text>
        <text x="298" y="91" fill="#56718a" font-size="10" text-anchor="middle">the bank re-forms in ~5s</text>
        <text x="392" y="38" fill="#56718a" font-size="16">→</text>
        <circle cx="432" cy="34" r="5" fill="#ffd24a"/>
        <path d="M440 34 H512" stroke="#ffd24a" stroke-dasharray="4 4" fill="none"/>
        <rect x="516" y="16" width="44" height="36" fill="#7a2f24" stroke="#ff8a5c"/>
        <text x="538" y="41" font-size="15" text-anchor="middle">💥</text>
        <text x="560" y="76" fill="#9fb8c9" font-size="11" text-anchor="middle">3 · IT STRIKES: hull + station damage</text>
        <text x="560" y="91" fill="#56718a" font-size="10" text-anchor="middle">…and maybe a fire, or a leak below the waterline</text>
      </svg>`;

    const classSvg = `
      <svg viewBox="0 0 720 232" width="100%" height="235">
        <text x="10" y="22" fill="#e9c46a" font-size="12" font-weight="bold">ROUND SHOT</text>
        <rect x="120" y="18" width="26" height="12" fill="#39424c"/>
        <path d="M152 24 H260" stroke="#ffd24a" stroke-dasharray="4 4" fill="none"/>
        <circle cx="286" cy="22" r="12" fill="#cfd8dd" opacity=".5"/>
        <circle cx="299" cy="28" r="9" fill="#cfd8dd" opacity=".4"/>
        <text x="330" y="28" fill="#9fb8c9" font-size="11">smoke swallows it — or they dodge — otherwise it lands</text>
        <text x="10" y="80" fill="#ff8a5c" font-size="12" font-weight="bold">MORTAR</text>
        <path d="M120 88 Q 300 30 480 84" stroke="#ff8a5c" stroke-dasharray="5 4" fill="none"/>
        <circle cx="300" cy="84" r="12" fill="#cfd8dd" opacity=".5"/>
        <rect x="474" y="70" width="40" height="24" fill="#7a2f24" stroke="#ff8a5c"/>
        <text x="530" y="86" fill="#9fb8c9" font-size="11">arcs clean over the smoke · eats 1 shell per shot</text>
        <text x="10" y="138" fill="#ffe9a8" font-size="12" font-weight="bold">RAKING FIRE</text>
        <path d="M120 146 H438" stroke="#ffe9a8" fill="none"/>
        <rect x="440" y="132" width="40" height="28" fill="#5a2a20" stroke="#ffe9a8"/>
        <rect x="482" y="132" width="40" height="28" fill="#5a2a20" stroke="#ffe9a8"/>
        <rect x="524" y="132" width="40" height="28" fill="#5a2a20" stroke="#ffe9a8"/>
        <text x="580" y="142" fill="#9fb8c9" font-size="11">sweeps 3 rooms, cannot miss…</text>
        <circle cx="260" cy="176" r="11" fill="#cfd8dd" opacity=".5"/>
        <text x="278" y="181" fill="#ff7a5c" font-size="11">…but ANY smoke bank stops the whole rake cold</text>
        <text x="10" y="214" fill="#c9d4dc" font-size="12" font-weight="bold">LANGRAGE</text>
        <path d="M120 210 H438" stroke="#c9a0ff" stroke-dasharray="4 4" fill="none"/>
        <rect x="440" y="196" width="44" height="28" fill="none" stroke="#7d97a8" stroke-width="2"/>
        <rect x="448" y="202" width="8" height="16" fill="#7d97a8"/>
        <rect x="460" y="202" width="8" height="16" fill="#7d97a8"/>
        <text x="494" y="216" fill="#c9d4dc" font-size="11">7s</text>
        <text x="530" y="214" fill="#9fb8c9" font-size="11">station seized — wears off; can't be repaired</text>
      </svg>`;

    this.modal({
      wide: true,
      title: "Captain's Glossary",
      sub: 'Every strange word on this ship, explained. (The ? button up top opens this anywhere.)',
      body: `
        <div class="gsec"><h4>READING YOUR SHIP</h4>
        <div class="gterm"><b>Rooms & decks</b> — the ship is a side cutaway: the top row is the
          weather deck (sails, smoke-pots, helm), the bottom row is below the waterline
          (gun deck, surgery, and the bilge pumps — lowest, as bilges are). Each room
          berths up to <b>four</b> crew. The corner chip shows the room's station.
          <b style="color:#a3742a">Amber</b> chip: damaged. <b style="color:#a33b2b">Red</b>: wrecked (send crew to fix).
          <b style="color:#5d7a8c">Slate</b>: crew suppressed by langrage (wait it out).</div>
        <div class="gterm"><b>Hands</b> (bottom panel) — your unnamed sailors, assigned between stations with +/−:
          <span class="bar filled" style="display:inline-block"></span> at work ·
          <span class="bar empty" style="display:inline-block"></span> unstaffed ·
          <span class="bar dmg" style="display:inline-block"></span> damaged ·
          <span class="bar hexed" style="display:inline-block"></span> hexed.
          Your named characters are officers — they man rooms, fight, and repair.</div>
        <div class="gterm"><b>Fire 🔥</b> — spreads, damages the station, burns crew. Crew stamp it out; deep water drowns it.</div>
        <div class="gterm"><b>Leak (breach)</b> — the dark hole: the sea pours in until crew plug it. Water drowns those who can drown, and halves repair speed.</div>
        <div class="gterm"><b>Evasion</b> — your chance to dodge: sails power + a hand at the helm. Nobody steering = no dodging.</div>
        <div class="gterm"><b>Smoke Screen</b> — the grey ring around a ship: each bank swallows one incoming ball, then rolls back in ~5s. Every 2 hands at the smoke-pots = 1 bank.</div></div>
        <div class="gsec"><h4>HOW A SHOT LANDS</h4>${pipelineSvg}</div>
        <div class="gsec"><h4>THE FOUR KINDS OF GUN</h4>${classSvg}${wlist}</div>
        <div class="gsec"><h4>YOUR PEOPLE</h4>${rlist}
        <div class="gterm"><b>What the little words mean</b> — <i>Manning</i>: at their station (helm/sails/guns bonuses).
          <i>Repairing / Firefighting / Plugging leak</i>: fixing the room they stand in. <i>Fighting</i>: brawling boarders.
          <i>Healing</i>: recovering in the Surgeon's Berth. Red-ringed figures are enemy boarders.</div></div>
        <div class="gsec"><h4>SEA-SPEAK — as your oldest hand would explain it</h4>
        <div class="gterm"><b>"Heave to"</b> — stop the ship and wait. Flag-signaled by warships who mean to board you. There are no radios out here: ships talk in signal flags, speaking-trumpets, and guns.</div>
        <div class="gterm"><b>"Strike your colors"</b> — haul down your flag: surrender. A ship that strikes expects mercy.</div>
        <div class="gterm"><b>"Reef" / "storm canvas"</b> — shorten sail so a gale can't tear it away. Less speed, more ship afterwards.</div>
        <div class="gterm"><b>"Dead reckoning"</b> — navigating blind, by compass, clock, and your last known position.</div>
        <div class="gterm"><b>"Rake her"</b> — cross an enemy's bow or stern and fire down her whole length, where no guns answer back.</div>
        <div class="gterm"><b>"Magazine"</b> — the powder store. When it catches, there is no ship afterwards.</div>
        <div class="gterm"><b>"She sounds"</b> — a whale (or worse) diving deep.</div>
        <div class="gterm"><b>"Ensign"</b> — the flag that says who you are. Upside-down, it says <i>help</i>.</div>
        <div class="gterm"><b>"Bosun" / "purser"</b> — the officer who runs the deck; the one who runs the stores and the money.</div>
        <div class="gterm"><b>"Run aground"</b> — stuck on a sandbar or reef. Winching her off by her own anchor is called kedging, and nobody enjoys it.</div></div>
        <div class="gsec"><h4>THE RATES, AT SCALE</h4>
        ${Object.entries(W.Fleet.CLASSES).map(([cls, c]) =>
          `<div class="gterm" style="display:flex;align-items:flex-end;gap:10px">${this.shipThumb(cls)}
           <span><b>${c.name}</b> — ${c.guns} guns, ${c.hull} hull, ${W.Fleet.COMPLEMENTS[cls]} hands</span></div>`).join('')}
        <div class="gcap">Drawn to a common scale: what you see is what she is.</div></div>
        <div class="gsec"><h4>THE FLEET ACTION (Line of Battle)</h4>
        <div class="gterm"><b>Orders</b> — every ship gets a target and a tactic in the muster; each order is drawn as a dashed course on the plan, and the battle then fights itself in rounds.</div>
        <div class="gterm"><b>Fighting spirit</b> — the gold bar. Broadsides, rakes, and a fallen captain break it; a ship whose spirit breaks <b>strikes her colors</b> (surrenders). Struck enemies are prizes.</div>
        <div class="gterm"><b>The weather gauge</b> — the upwind position, rolled as battle joins. Holding it makes everything you do bite a little harder.</div>
        <div class="gterm"><b>Signal hoists</b> — your only voice mid-battle, three per action, chosen from the signal book: ENGAGE MORE CLOSELY (the line fights harder), CONCENTRATE ON ONE SHIP (every gun on her), WEAR TOGETHER (a defensive turn), and DISCONTINUE THE ACTION (withdraw in good order — no prizes, no rout).</div>
        <div class="gterm"><b>The crisis</b> — if the flagship is badly hurt, you take command below decks: the full ship interior, fires and flooding, your own hands on it.</div></div>
        <div class="gsec"><h4>THE LONG GAME</h4>
        <div class="gterm"><b>Long guns & carronades</b> — guns were not all alike. Long guns keep their full weight of metal at any range. Carronades — sailors called them smashers — are short, light guns that hit terribly hard once ships lie alongside, but tell for little at a distance. A ship's size also sets the weight of each ball: a cutter throws little 6-pound shot, a frigate 18s, a ship of the line 32s — that is the 'weight of metal' in the muster's matchup lines.</div>
        <div class="gterm"><b>⚜ Doubloons</b> — money, from prizes and events. Spent at free ports.</div>
        <div class="gterm"><b>Provisions</b> — one is eaten every sail. At zero the crew starves and <b>mutiny</b> brews.</div>
        <div class="gterm"><b>Shells</b> — ammunition for mortar-class guns only. Everything else shoots free.</div>
        <div class="gterm"><b>Reach</b> — one of the three chart screens you must cross. Escape each through the strait (⛯) at its eastern edge.</div>
        <div class="gterm"><b>🌀 The Maelstrom</b> — the storm swallowing the chart from the west, one column at a time, every time you sail. Purple waypoints are gone; landing on one costs hull and means a storm-fight.</div>
        <div class="gterm"><b>Striking colors</b> — a beaten enemy may surrender: take the bonus gold, or sink her anyway.</div>
        <div class="gterm"><b>Hull</b> — the ship's life. At zero, the sea takes everything. Repair at ports and lighthouses.</div></div>`,
      buttons: [{ label: 'Back', fn: back }],
    });
  },

  openHowto(backFn) {
    this.modal({
      title: 'How to Play',
      body: `
        <h4>THE CHART</h4>
        <p>Click a connected waypoint to sail there. Every departure the Maelstrom advances —
        purple waypoints are swallowed (arriving there costs hull and means a hard fight).
        Reach the strait at the eastern edge before it reaches you.</p>
        <h4>COMBAT</h4>
        <p><b>SPACE</b> pauses; orders can be given while paused. Click a weapon's
        <b>TARGET</b> button (or keys <b>1–4</b>), then click an enemy room. Charged weapons
        fire at their target automatically. <b>CREW</b> assigns or stands down that gun's crew.</p>
        <p>Guns laid on the <b>same room</b> hold fire until all are charged, then loose
        together as a broadside — the way to punch through a re-forming smoke bank.
        Guns on different rooms fire independently.</p>
        <p>Hits are dodged by evasion, then swallowed by <b>smoke screen</b>, then damage
        hull and systems, and can start <b>fires</b> or <b>breaches</b>. Breaches flood the
        room; deep water drowns crew who can drown — but also puts out fires.</p>
        <h4>GUNNERY — four kinds of gun</h4>
        <p><b>Round shot</b> — standard cannonballs. Can be dodged; absorbed by smoke banks.
        <b>Mortars</b> — fly over smoke entirely, so they always get through, but each shot uses
        one <b>shell</b> (buy them at ports). <b>Raking fire</b> — hits 3 rooms in a line and
        never misses, but does nothing if any smoke bank is up. <b>Langrage</b> — scrap-shot that drives
        the crew of the station it hits into cover for a few seconds; no damage, passes on its own.</p>
        <h4>PROVISIONS</h4>
        <p>Every sail eats one provision. Run dry and the crew starves — and mutiny brews.
        Buy provisions at free ports, and keep an eye on the purser's count in the top bar.</p>
        <h4>CREW</h4>
        <p>Click a sailor (portrait or figure), then a room, to send them there. In a room they
        automatically fight boarders, plug leaks, douse fires, repair, and man the station.
        The helm must be manned to dodge. The Surgeon's Berth heals crew standing in it.</p>
        <h4>POWER</h4>
        <p>Your ship's company is a limited pool of hands — the +/− buttons muster them
        between stations. Every 2 hands tending the Smoke Screen keep one smoke bank rolling.</p>
        <p>You can flee any fight with <b>RAISE FULL SAIL</b> — faster with more sail power.</p>`,
      buttons: [{ label: 'Back', fn: () => backFn ? backFn() : this.closeModal() }],
    });
  },

  // A small seeded PRNG shapes each waypoint into an irregular inked islet,
  // stable across re-renders of the chart.
  islandPath(cx, cy, seed, r0) {
    let s = seed >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const n = 9;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      const r = r0 * (0.72 + rnd() * 0.5);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.82]);
    }
    let d = `M ${(pts[0][0] + pts[n - 1][0]) / 2} ${(pts[0][1] + pts[n - 1][1]) / 2}`;
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      d += ` Q ${p[0]} ${p[1]} ${(p[0] + q[0]) / 2} ${(p[1] + q[1]) / 2}`;
    }
    return d + ' Z';
  },

  // stipple shading off the coast and the odd palm, in the chartmaker's hand
  islandTrim(cx, cy, seed, stormed) {
    let s = (seed ^ 0x9e3779b9) >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    let out = '';
    for (let k = 0; k < 6; k++) {
      const a = 0.2 + rnd() * 1.4;
      const r = 24 + rnd() * 7;
      out += `<circle cx="${cx + Math.cos(a) * r}" cy="${cy + Math.sin(a) * r * 0.85}" r="0.9" fill="#6b4f2a" opacity=".5"/>`;
    }
    if (!stormed && rnd() < 0.55) {
      out += `<g stroke="#55663d" fill="none" stroke-width="1.2" transform="translate(${cx - 8 + rnd() * 5},${cy - 12})">` +
        `<path d="M0 6 Q1 1 0 -2"/>` +
        `<path d="M0 -2 q-4 -3 -6 -1 M0 -2 q4 -3 6 -1 M0 -2 q-1 -4 -4 -4 M0 -2 q1 -4 4 -4"/></g>`;
    }
    return out;
  },

  nodeBadge(type, cx, cy) {
    const ink = '#4a3517';
    const ship = (scale) =>
      `<g transform="translate(${cx},${cy}) scale(${scale})">` +
      `<path d="M-8 3 Q0 9 8 3 L6 7 L-6 7 Z" fill="${ink}"/>` +
      `<line x1="0" y1="-9" x2="0" y2="3" stroke="${ink}" stroke-width="1.4"/>` +
      `<path d="M1.5 -8 Q8 -4 1.5 0 Z" fill="${ink}"/>` +
      `<path d="M-0.5 -9 l-5 1.5 l5 1.5 Z" fill="#a82a1e"/></g>`;
    switch (type) {
      case 'start':
        return `<text x="${cx}" y="${cy + 5}" font-size="13" text-anchor="middle" fill="${ink}">⚓</text>`;
      case 'combat':
        return ship(1);
      case 'boss':
        return ship(1.5);
      case 'store':
        return `<g fill="${ink}" transform="translate(${cx},${cy})">` +
          `<rect x="-9" y="-1" width="7" height="6"/><path d="M-10.5 -1 L-5.5 -6.5 L-0.5 -1 Z"/>` +
          `<rect x="2" y="0" width="7" height="5"/><path d="M0.5 0 L5.5 -5 L10.5 0 Z"/></g>`;
      case 'exit':
        return `<g transform="translate(${cx},${cy})">` +
          `<path d="M-3 9 L-1.5 -7 L1.5 -7 L3 9 Z" fill="#a82a1e" stroke="${ink}" stroke-width="0.8"/>` +
          `<rect x="-2.6" y="-10.5" width="5.2" height="3.8" fill="${ink}"/>` +
          `<circle cx="0" cy="-8.6" r="1.6" fill="#ffd24a"/></g>`;
      case 'distress':
        return `<text x="${cx}" y="${cy + 6}" font-size="16" font-weight="bold" text-anchor="middle" fill="#a82a1e">!</text>`;
      case 'event':
        return `<text x="${cx}" y="${cy + 5}" font-size="14" font-style="italic" text-anchor="middle" fill="${ink}">?</text>`;
      default:
        return `<circle cx="${cx}" cy="${cy}" r="1.6" fill="${ink}"/>`;
    }
  },

  isleName(n, seed) {
    if (n.type === 'start') return 'Anchorage';
    if (n.type === 'exit') return 'The Strait';
    if (n.type === 'boss') return 'Deadlight Roads';
    const A = ['Gull', 'Salt', 'Black', 'Low', 'Bone', 'Amber', 'Wren', 'Grey', 'Broken', 'Hollow', 'Kettle', 'Morwen\'s'];
    const B = ['Rock', 'Key', 'Holm', 'Head', 'Sound', 'Islet', 'Bar', 'Haven', 'Point', 'Teeth'];
    return A[seed % A.length] + ' ' + B[(seed >> 4) % B.length];
  },

  openMap() {
    const M = W.GameMap;
    const seedOf = (n) => ((n.id + 1) * 7349 + M.sector * 131071) >>> 0;
    let nodes = '';
    let isles = '';
    // the wake you have already sailed, plotted in the log-keeper's ink
    let trail = '';
    const T = M.trail || [];
    for (let i = 0; i + 1 < T.length; i++) {
      const a = M.node(T[i]), b = M.node(T[i + 1]);
      if (!a || !b) continue;
      trail += `<path d="M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${(a.y + b.y) / 2 - 12} ${b.x} ${b.y}" ` +
        `stroke="#8a4a2a" stroke-width="2" fill="none" opacity=".55"/>`;
    }
    for (const n of M.nodes) {
      const reachable = M.canJump(n.id);
      const stormed = M.stormed(n);
      const visited = n.visited && n.id !== M.curr;
      const big = n.type === 'boss' || n.type === 'exit';
      const isleIdx = 1 + seedOf(n) % 6;
      const isleImg = W.Render && W.Render.spr && W.Render.spr('isle' + isleIdx);
      const isz = big ? 68 : 56;
      isles += `<g opacity="${visited ? 0.5 : 1}">`;
      if (isleImg) {
        isles += `<image href="assets/art/isle${isleIdx}.png" x="${n.x - isz / 2}" y="${n.y - isz / 2 - 2}" ` +
          `width="${isz}" height="${isz}" preserveAspectRatio="xMidYMid meet"${stormed ? ' opacity="0.55"' : ''}/>`;
        if (stormed) {
          isles += `<path d="${this.islandPath(n.x, n.y, seedOf(n), big ? 26 : 21)}" ` +
            `fill="rgba(90,66,120,0.4)" stroke="#5d4a7a" stroke-width="1"/>`;
        }
      } else {
        isles += `<path d="${this.islandPath(n.x, n.y, seedOf(n), big ? 27 : 21)}" ` +
          `fill="${stormed ? '#8d7fa8' : '#e9d7a8'}" stroke="${stormed ? '#5d4a7a' : '#6b4f2a'}" stroke-width="1.5"/>` +
          this.islandTrim(n.x, n.y, seedOf(n), stormed);
      }
      isles +=
        (stormed
          ? `<text x="${n.x}" y="${n.y + 5}" font-size="15" text-anchor="middle">🌀</text>`
          : this.nodeBadge(n.type, n.x, n.y)) +
        (stormed ? '' :
          `<text x="${n.x}" y="${n.y + 40}" font-size="10.5" font-style="italic" text-anchor="middle" ` +
          `fill="#6b4f2a" opacity=".85">${this.isleName(n, seedOf(n))}</text>`) +
        `</g>`;
      if (reachable) {
        isles += `<circle cx="${n.x}" cy="${n.y}" r="28" fill="none" stroke="#a82a1e" stroke-width="1.5" stroke-dasharray="4 4"/>`;
      }
      if (n.id === M.curr) {
        isles += (W.Render && W.Render.spr && W.Render.spr('seal'))
          ? `<image href="assets/art/seal.png" x="${n.x + 5}" y="${n.y - 27}" width="25" height="25"/>`
          : `<circle cx="${n.x + 16}" cy="${n.y - 14}" r="6" fill="#a82a1e" stroke="#6d180f" stroke-width="1.5"/>`;
      }
      const tips = {
        start: '<b>Your anchorage</b> — where this reach began.',
        combat: '<b>Hostile sail</b> — a fight. Sink or force her surrender for doubloons and salvage.',
        event: '<b>The unknown</b> — something on the water. Usually a choice; sometimes a fight.',
        distress: '<b>Distress signal</b> — an ensign flown upside-down, or a signal gun heard over the water. Someone needs help; whether you give it is up to you.',
        store: '<b>Free port</b> — buy weapons, crew, repairs, hands, shells, and provisions.',
        empty: '<b>Open water</b> — likely nothing. Likely.',
        exit: '<b>The strait east</b> — escape this reach into the next.',
        boss: '<b>The Crown Leviathan</b> — the Armada flagship. The end of the run, one way or the other.',
      };
      const tip = stormed
        ? '<b>Swallowed by the Maelstrom</b> — arriving here costs hull and means a hard fight in the storm.'
        : (tips[n.type] || '');
      nodes += `<div class="mapnode${reachable ? ' reachable' : ''}" data-id="${n.id}" ` +
        `style="left:${n.x}px;top:${n.y}px" data-tip="${tip.replace(/"/g, '&quot;')}"></div>`;
    }
    // decorative islets and a sea-serpent, as any honest chart has
    const ds = (M.sector * 2654435761) >>> 0;
    const deco = (x, y, k, sz) => (W.Render && W.Render.spr && W.Render.spr('isle' + k))
      ? `<image href="assets/art/isle${k}.png" x="${x - sz / 2}" y="${y - sz / 2}" width="${sz}" height="${sz}" opacity=".55"/>`
      : `<path d="${this.islandPath(x, y, ds ^ k, sz / 3)}" fill="#e9d7a8" stroke="#6b4f2a" opacity=".55"/>`;
    isles += deco(140 + (ds % 50), 36, 1 + (ds % 6), 30);
    isles += deco(540 + (ds % 70), 386, 1 + ((ds >> 3) % 6), 26);
    isles += (W.Render && W.Render.spr && W.Render.spr('serpent'))
      ? `<image href="assets/art/serpent.png" x="${800 - (ds % 90)}" y="34" width="74" height="50" opacity=".5"/>`
      : `<g stroke="#6b4f2a" fill="none" opacity=".45" transform="translate(${820 - (ds % 90)},52)">` +
        `<path d="M0 0 q6 -9 12 0 t12 0"/><circle cx="27" cy="-3" r="2" fill="#6b4f2a" stroke="none"/></g>`;
    let edges = '';
    const seen = new Set();
    for (const n of M.nodes) for (const eid of n.edges) {
      const key = [Math.min(n.id, eid), Math.max(n.id, eid)].join('-');
      if (seen.has(key)) continue;
      seen.add(key);
      const b = M.node(eid);
      edges += `<line x1="${n.x}" y1="${n.y}" x2="${b.x}" y2="${b.y}" stroke="#8a6a42" stroke-width="1.5" stroke-dasharray="5 5"/>`;
    }
    const stormW = W.clamp((M.maelstrom + 1) / 5, 0, 1) * 1050;
    this.modal({
      wide: true,
      title: `${W.SECTOR_NAMES[M.sector - 1]} — Reach ${M.sector} of 3`,
      sub: `Click a connected waypoint to set sail. The Maelstrom advances every time you do — and every sail eats one of your ${W.state.provisions | 0} provisions.`,
      body: `<div class="mapwrap"${(W.Render && W.Render.spr && W.Render.spr('parchment'))
        ? ` style="background-image: repeating-linear-gradient(0deg, rgba(107,79,42,.05) 0 1px, transparent 1px 64px),` +
          ` repeating-linear-gradient(90deg, rgba(107,79,42,.05) 0 1px, transparent 1px 64px),` +
          ` url('assets/art/parchment.jpg'); background-size: auto, auto, cover;"` : ''}>
          <svg width="1050" height="410">${edges}${trail}${isles}</svg>
          ${(W.Render && W.Render.spr && W.Render.spr('rose'))
            ? '<svg class="compassrose" width="90" height="90"><image href="assets/art/rose.png" width="90" height="90"/></svg>'
            : `<svg class="compassrose" width="86" height="86" viewBox="0 0 86 86">
            <g stroke="#6b4f2a" fill="none" stroke-width="1.5">
              <circle cx="43" cy="46" r="20"/>
              <circle cx="43" cy="46" r="26" stroke-width="0.75"/>
              <path d="M43 8 L48 41 L43 46 L38 41 Z" fill="#6b4f2a"/>
              <path d="M43 84 L48 51 L43 46 L38 51 Z"/>
              <path d="M5 46 L38 41 L43 46 L38 51 Z"/>
              <path d="M81 46 L48 41 L43 46 L48 51 Z" fill="#6b4f2a"/>
            </g>
            <text x="43" y="7" fill="#6b4f2a" font-size="9" text-anchor="middle">N</text>
          </svg>`}
          ${stormW > 4 ? `<div class="stormshade" style="width:${stormW}px"></div>` : ''}
          ${nodes}
        </div>
        <div class="maplegend">red wax seal = you are here · red dashed ring = within reach · ship = a fight ·
        ? = something unknown · ! = distress · houses = free port · lighthouse = the strait east ·
        big ship = the Leviathan · 🌀 = swallowed by the Maelstrom</div>`,
      buttons: [
        { label: 'How to Play', fn: () => this.openHowto(() => this.openMap()) },
        { label: "Captain's Glossary", fn: () => this.openGlossary(() => this.openMap()) },
      ],
      row: true,
    });
    this.els.modal.querySelectorAll('.mapnode').forEach(el => {
      const id = +el.dataset.id;
      if (M.canJump(id)) el.addEventListener('click', () => W.Main.jumpTo(id));
    });
  },

  openEvent(ev) {
    const buttons = ev.choices
      .filter(ch => W.Events.reqMet(ch.req))
      .map(ch => ({
        label: ch.label,
        blue: !!ch.req,
        fn: () => {
          const res = W.Events.resolve(ev, ev.choices.indexOf(ch));
          this.openOutcome(ev.title, res);
        },
      }));
    this.modal({ title: ev.title, body: `<p>${ev.text}</p>`, buttons });
  },

  openOutcome(title, res) {
    this.modal({
      title,
      body: res.lines.map(l => `<p>${l}</p>`).join(''),
      buttons: [{
        label: res.combat ? 'To quarters!' : 'Sail on',
        fn: () => {
          this.closeModal();
          if (res.combat) W.Combat.start(res.combat.id, { elite: res.combat.elite });
          else { W.Main.save(); this.openMap(); }
        },
      }],
    });
  },

  openStore() {
    const S = W.Store, P = W.player;
    const st = S.stock;
    let body = `<p class="goldnote">You have ⚜ ${W.state.gold} doubloons.</p><h4>WEAPONS</h4>`;
    st.weapons.forEach((it, i) => {
      const def = W.WEAPONS[it.id];
      body += `<div class="storerow"><b>${def.name}</b><span class="wclasstag">${W.WEAPON_CLASS[def.class] || ''}</span>
        <span class="sdesc">${def.desc}<br><i class="wchips">${W.weaponInfo(def).join(' · ')}</i></span>
        <button data-act="wep" data-i="${i}" ${it.sold || W.state.gold < def.cost || P.weapons.length >= 4 ? 'disabled' : ''}>
        ${it.sold ? 'SOLD' : '⚜ ' + def.cost}</button></div>`;
    });
    const race = W.RACES[st.crew.race];
    body += `<h4>CREW FOR HIRE</h4>
      <div class="storerow"><b>${st.crew.name}</b><span class="sdesc">${race.name} — ${race.desc}</span>
      <button data-act="crew" ${st.crew.sold || W.state.gold < S.crewCost[st.crew.race] || P.crew.length >= 6 ? 'disabled' : ''}>
      ${st.crew.sold ? 'HIRED' : '⚜ ' + S.crewCost[st.crew.race]}</button></div>`;
    body += `<h4>PURSER</h4>
      <div class="storerow"><b>Mortar shells ×4</b><span class="sdesc">Ammunition for mortar-class guns; nothing else needs ammo (${W.state.shells | 0}/20)</span>
        <button data-act="shells" ${(W.state.shells | 0) >= 20 || W.state.gold < 10 ? 'disabled' : ''}>⚜ 10</button></div>
      <div class="storerow"><b>Provisions ×5</b><span class="sdesc">Biscuit, salt beef, water. One is eaten every sail — run dry and mutiny brews (${W.state.provisions | 0}/20)</span>
        <button data-act="prov" ${(W.state.provisions | 0) >= 20 || W.state.gold < 8 ? 'disabled' : ''}>⚜ 8</button></div>`;
    body += `<h4>SHIPWRIGHT</h4>
      <div class="storerow"><b>Hull repair</b><span class="sdesc">2 doubloons per point (hull ${Math.ceil(P.hull)}/${P.hullMax})</span>
        <button data-act="rep1" ${P.hull >= P.hullMax || W.state.gold < 2 ? 'disabled' : ''}>+1 (⚜2)</button>
        <button data-act="rep5" ${P.hull >= P.hullMax || W.state.gold < 2 ? 'disabled' : ''}>+5 (⚜10)</button></div>
      <div class="storerow"><b>Muster more hands</b><span class="sdesc">One more pair of hands for the ship's company (${P.reactor}/15)</span>
        <button data-act="reactor" ${P.reactor >= 15 || W.state.gold < S.reactorCost() ? 'disabled' : ''}>⚜ ${S.reactorCost()}</button></div>`;
    for (const [id, s] of Object.entries(P.systems)) {
      const def = W.SYS[id];
      if (s.level >= def.max) continue;
      body += `<div class="storerow"><b>${def.icon} ${def.name} → ${s.level + 1}</b>
        <span class="sdesc">${def.desc}</span>
        <button data-act="up" data-sys="${id}" ${W.state.gold < S.upgradeCost(id) ? 'disabled' : ''}>⚜ ${S.upgradeCost(id)}</button></div>`;
    }
    const m = this.modal({
      title: '⚜ Free Port', sub: 'No flags asked, no names given. Coin talks.',
      body,
      buttons: [{ label: 'Weigh anchor', fn: () => { this.closeModal(); W.Main.save(); this.openMap(); } }],
    });
    m.querySelectorAll('.storerow button').forEach(b => {
      b.addEventListener('click', () => {
        const act = b.dataset.act;
        if (act === 'wep') W.Store.buyWeapon(+b.dataset.i);
        else if (act === 'shells') W.Store.buyShells();
        else if (act === 'prov') W.Store.buyProvisions();
        else if (act === 'crew') W.Store.buyCrew();
        else if (act === 'rep1') W.Store.repairOne(1);
        else if (act === 'rep5') W.Store.repairOne(5);
        else if (act === 'reactor') W.Store.buyReactor();
        else if (act === 'up') W.Store.upgrade(b.dataset.sys);
        this.openStore(); // re-render
      });
    });
  },

  openLoot(loot) {
    let body = `<p>${loot.surrender ? 'Her captain hands over the strongbox with shaking hands.'
      : 'You pick over the flotsam and haul the strongbox aboard.'}</p>
      <p class="goldnote">+${loot.gold} doubloons</p>`;
    if (loot.weaponTaken) body += `<p>Salvaged from the wreck: <b>${W.WEAPONS[loot.weaponTaken].name}</b>!</p>`;
    if (loot.weaponSold) body += `<p>A salvaged ${W.WEAPONS[loot.weaponSold].name} wouldn't fit the gun deck — broken up for ${loot.weaponGold} extra doubloons.</p>`;
    if (loot.shells) body += `<p>+${loot.shells} mortar shells from her magazine.</p>`;
    if (loot.provisions) body += `<p>+${loot.provisions} provisions from her hold.</p>`;
    this.modal({
      title: loot.surrender ? 'They Strike Their Colors' : 'Prize Taken',
      body,
      buttons: [{ label: 'Sail on', fn: () => { this.closeModal(); this.openMap(); } }],
    });
  },

  // --- Line of Battle (fleet prototype) ---
  // a live miniature of the plan, drawn from the same geometry as the battle
  musterSketch() {
    const F = W.Fleet, R = W.Render;
    const sx = 0.3, sy = 0.3;
    let out = '';
    for (let i = 0; i < F.enemy.length; i++) {
      const a = R.enemyAnchor(i);
      out += `<circle cx="${a.x * sx}" cy="${a.y * sy}" r="7" fill="none" stroke="#a02418" stroke-width="1.5"/>` +
        `<text x="${a.x * sx}" y="${a.y * sy + 3.5}" font-size="9" text-anchor="middle" fill="#a02418">${i + 1}</text>`;
    }
    // what the lookouts know of HER intentions, sketched faint
    F.enemy.forEach((e, i) => {
      if (!e.intel) return;
      const r = R.enemyRouteFor(i);
      let d = '';
      for (let k = 0; k <= 20; k++) {
        const p = R.bez(r.pts, k / 20);
        d += (k ? ' L ' : 'M ') + (p.x * sx).toFixed(1) + ' ' + (p.y * sy).toFixed(1);
      }
      out += `<path d="${d}" fill="none" stroke="#a02418" stroke-width="1.1" stroke-dasharray="3 4" opacity="0.65"/>`;
    });
    F.ships.forEach((s, i) => {
      const r = R.routeFor(i);
      let d = '';
      for (let k = 0; k <= 20; k++) {
        const p = R.bez(r.pts, k / 20);
        d += (k ? ' L ' : 'M ') + (p.x * sx).toFixed(1) + ' ' + (p.y * sy).toFixed(1);
      }
      out += `<path d="${d}" fill="none" stroke="#3a2a17" stroke-width="1.4" stroke-dasharray="4 3"/>` +
        `<circle cx="${r.pts[0].x * sx}" cy="${r.pts[0].y * sy}" r="3.5" fill="#3a2a17"/>` +
        `<text x="${r.pts[0].x * sx - 6}" y="${r.pts[0].y * sy + 3}" font-size="8.5" text-anchor="end" fill="#3a2a17">${i + 1}</text>`;
    });
    return `<svg viewBox="0 0 300 138" width="300" height="138" ` +
      `style="background:#eadcb4;border:1px solid #8a6a42;border-radius:4px">${out}</svg>`;
  },

  openMuster() {
    const F = W.Fleet;
    const spiritWord = (m) => m >= 68 ? 'steady' : (m >= 61 ? 'seasoned' : 'green');
    let body = `<p>The enemy's topsails are on the horizon. Give each of your captains a target
      and a tactic — the sketch and the matchup lines redraw as you change the orders.</p>
      <h4>THE ENEMY LINE — what the glass shows</h4>`;
    F.enemy.forEach((s, i) => {
      const t = F.TRAITS[s.captain.trait];
      const st = F.SHIP_TRAITS[s.trait];
      body += `<div class="storerow">${this.captPortrait(s.captain.name)}<b>${i + 1}. ${s.name}</b>
        ${this.shipThumb(s.cls)}
        <span class="sdesc"><b>${F.CLASSES[s.cls].name}</b> — ${s.guns} guns
        <span data-tip="${F.BATTERIES[s.battery || 'long'].desc}">(<i>${F.BATTERIES[s.battery || 'long'].name.toLowerCase()}</i>)</span>,
        ${s.hullMax} hull,
        ${spiritWord(s.morale)} crew · <i>${st.name}</i> (${st.desc})
        · Capt. ${s.captain.name}, <i>${t.name}</i>: ${t.desc}<br>
        <b style="color:#a02418">${s.intel ? 'Your glass says she ' + F.intentWord(s.order.tactic) + '.' : 'Her intent is unclear.'}</b>
        ${s.isEnemyFlag ? `<br><b>What every gunroom knows of her:</b> she wears too slowly to punish a
        cutting approach; her sides are too high to board; and her people's heart is in her
        escorts — break them, and she will know she is alone.` : ''}</span></div>`;
    });
    body += `
      <div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:6px">
        <div>${this.musterSketch()}
          <div class="gcap">Your plan, as it will be fought — the enemy line ①②③ in red,
          your ships ①②③ setting out from the left.</div></div>
        <div class="gterm" style="flex:1"><b>How an action works:</b> you give the orders, then
        the battle fights itself in rounds — once the guns speak your only voice is
        <b>three signal hoists</b> (top-right of the battle). Ships surrender — <i>strike</i> —
        when their <b>fighting spirit</b> (the gold bar) breaks, not only when their hull gives;
        struck enemies are your prizes. The <b>weather gauge</b> — the upwind position, rolled
        as battle joins — puts a thumb on the scale for whoever holds it. If the flagship gets
        into trouble, you'll be called below decks to fight the fire yourself.</div>
      </div>
      <h4>YOUR LINE AND ORDERS (van to rear)</h4>`;
    const tacOpts = (sel) => Object.entries(F.TACTICS)
      .map(([id, tc]) => `<option value="${id}"${id === sel ? ' selected' : ''}>${tc.name}</option>`).join('');
    const tgtOpts = (sel) => F.enemy
      .map((s, i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${i + 1}. ${s.name} (${F.CLASSES[s.cls].name})</option>`).join('');
    F.ships.forEach((s, i) => {
      const t = F.TRAITS[s.captain.trait];
      const mu = F.matchup(s);
      const handsPct = Math.round(100 * s.hands / s.complement);
      body += `<div class="storerow">${this.captPortrait(s.captain.name)}<b>${i + 1}. ${s.name}</b>
        ${this.shipThumb(s.cls)}
        <span class="sdesc"><b>${F.CLASSES[s.cls].name}</b> — ${s.guns} guns
        <span data-tip="${F.BATTERIES[s.battery || 'long'].desc}">(<i>${F.BATTERIES[s.battery || 'long'].name.toLowerCase()}</i>)</span>,
        hull ${Math.ceil(s.hull)}/${s.hullMax},
        crew ${handsPct}%${handsPct < 60 ? ' <b style="color:#a02418">(short-handed)</b>' : ''}
        · <i>${F.SHIP_TRAITS[s.trait].name}</i>
        · Capt. ${s.captain.name}${s.captain.distinguished ? ' ★' : ''},
        <i>${F.captTraitsText(s.captain)}</i>: ${t.desc}${s.captain.learned ? ' ' + F.TRAITS[s.captain.learned].desc : ''}<br>
        <label>Target <select data-tgt="${i}">${tgtOpts(s.order.target)}</select></label>
        <label style="margin-left:8px">Tactic <select data-tac="${i}">${tacOpts(s.order.tactic)}</select></label>
        ${mu ? `<br><i class="wchips">She throws ~${Math.round(mu.hers * 24)} lb of metal to your
        ~${Math.round(mu.mine * 24)} — ${mu.verdict}.${mu.hint ? ' ' + mu.hint : ''}</i>` : ''}</span>
        ${i > 0 ? `<button data-swap="${i}">move up</button>` : ''}</div>`;
    });
    body += `<div class="gcap" style="margin:4px 0 8px">${Object.entries(F.TACTICS)
      .map(([id, tc]) => `<b>${tc.name}</b>: ${tc.desc}`).join(' ')}</div>`;
    body += `<h4>OR SET A CLASSIC PLAN</h4>
      <div class="mbtns row" style="margin-top:4px">
        ${Object.entries(F.PRESETS).map(([id, p]) =>
          `<button data-preset="${id}">${p.name}</button>`).join('')}
      </div>`;
    const m = this.modal({
      wide: true,
      title: `⚔ Muster — Action ${W.Fleet.campaign ? W.Fleet.campaign.stage : 1} of ${W.Fleet.STAGES.length}`,
      body,
      buttons: [
        { label: '⚑ Engage the enemy', fn: () => { this.closeModal(); F.begin(); } },
        { label: 'Strike below (back to title)', fn: () => { F.close(); W.state.mode = 'title'; this.openTitle(); } },
      ],
      row: true,
    });
    m.querySelectorAll('[data-swap]').forEach(b => {
      b.addEventListener('click', () => { F.swapLine(+b.dataset.swap, +b.dataset.swap - 1); this.openMuster(); });
    });
    m.querySelectorAll('[data-preset]').forEach(b => {
      b.addEventListener('click', () => { F.applyPreset(b.dataset.preset); this.openMuster(); });
    });
    m.querySelectorAll('select[data-tgt]').forEach(sel => {
      sel.addEventListener('change', () => {
        F.ships[+sel.dataset.tgt].order.target = +sel.value;
        F.planName = 'Your Own Plan';
        this.openMuster();
      });
    });
    m.querySelectorAll('select[data-tac]').forEach(sel => {
      sel.addEventListener('change', () => {
        F.ships[+sel.dataset.tac].order.tactic = sel.value;
        F.planName = 'Your Own Plan';
        this.openMuster();
      });
    });
  },

  openCrisisIntro() {
    if (W.Sound) W.Sound.play('alarm');
    const def = W.Fleet.CRISIS_DEFS[W.Fleet.crisisKind || 'fire'];
    this.modal({
      title: `⚠ ${def.banner.charAt(0) + def.banner.slice(1).toLowerCase()}!`,
      body: `<p>${def.intro}</p>
        <p><b>How to fight it:</b> ${def.how}</p>
        <p class="sub">You begin paused — press SPACE when you have read the deck.
        The line holds formation while you fight it.</p>`,
      buttons: [{ label: 'Below decks!', fn: () => { this.closeModal(); W.Fleet.startCrisis(); } }],
    });
  },

  gazetteBlock(won) {
    const g = W.Fleet.gazette(won);
    return `<div style="border:3px double #8a6a42;padding:10px 16px;margin:10px 0;background:#f2e7c8;color:#3a2a17">
      <div style="text-align:center;font-weight:bold;letter-spacing:3px;font-size:12px">THE NAVAL GAZETTE</div>
      <div style="text-align:center;font-size:19px;font-weight:bold;margin:4px 0">${g.head}</div>
      ${g.lines.map(l => `<div style="font-size:13.5px;line-height:1.5">${l}</div>`).join('')}
    </div>`;
  },

  foughtFor(rounds) {
    const sec = Math.max(3, (rounds | 0) * 3);
    return sec >= 60 ? `${Math.floor(sec / 60)} minute${sec >= 120 ? 's' : ''} ${sec % 60 ? (sec % 60) + ' seconds' : ''}`.trim()
      : `${sec} seconds`;
  },

  openFleetEnd() {
    const s = W.Fleet.summary;
    if (W.Sound) W.Sound.play(s.win ? 'stingWin' : (s.withdraw ? 'bell' : 'stingLoss'));
    const chronicle = () => {
      const ch = (W.Fleet.campaign && W.Fleet.campaign.chronicle) || [];
      if (!ch.length) return '';
      return `<h4>THE CRUISE, AS THE LOG TELLS IT</h4>
        <div style="max-height:220px;overflow-y:auto;font-size:13.5px;line-height:1.5">
        ${ch.map(e => `<div><b style="color:#8a6a42">S${e.stage}</b> — ${e.text}</div>`).join('')}</div>`;
    };
    if (s.flagLost) {
      const report = this.gazetteBlock(false) + chronicle();
      W.Fleet.clearCruise();
      this.modal({
        title: 'The Squadron Is Lost',
        body: `<p>The last of your ships is taken or gone under, at action ${s.stage} of
          ${W.Fleet.STAGES.length}. The Admiralty will write letters. The sea will not read them.</p>${report}`,
        buttons: [
          { label: 'Begin a new cruise', fn: () => { this.closeModal(); this.openCommission(); } },
          { label: 'Back to the title', fn: () => { W.Fleet.close(); W.state.mode = 'title'; this.openTitle(); } },
        ],
      });
      return;
    }
    if (s.win && s.finalStage) {
      const report = this.gazetteBlock(true) + chronicle();
      W.Fleet.clearCruise();
      this.modal({
        title: '⚑ The Cruise Is Made',
        body: `<p>Five actions, and the last of them against a ship of the line — beaten.
          You bring ${s.remaining} ship${s.remaining === 1 ? '' : 's'} home with prize-flags
          flying.</p>
          <p class="goldnote">Final purse: ⚜ ${W.Fleet.campaign.gold + s.gold}</p>${report}`,
        buttons: [
          { label: 'Begin a new cruise', fn: () => { this.closeModal(); this.openCommission(); } },
          { label: 'Back to the title', fn: () => { W.Fleet.close(); W.state.mode = 'title'; this.openTitle(); } },
        ],
      });
      return;
    }
    this.modal({
      title: s.win ? '⚑ The Enemy Line Is Broken'
        : (s.withdraw ? 'Off in Good Order' : 'The Action Is Lost'),
      body: `<p>${s.win
        ? `After ${this.foughtFor(s.rounds)} of it, the last of them yields. You take ${s.prizes}
           prize${s.prizes === 1 ? '' : 's'} and lose ${s.lost} of your own ships.`
        : (s.withdraw
          ? `You discontinue the action after ${this.foughtFor(s.rounds)} and bring ${s.remaining}
             ship${s.remaining === 1 ? '' : 's'} off to fight another day. No prizes — and no widows
             you didn't have to make.`
          : `After ${this.foughtFor(s.rounds)}, the action is lost. You bring ${s.remaining}
             ship${s.remaining === 1 ? '' : 's'} out of it.`)}</p>
        ${s.win ? `<p class="goldnote">Prize money: ⚜ ${s.gold} (not yet banked — prototype)</p>` : ''}
        <p>${s.casualties ? `The butcher's bill: ${s.casualties} hands.` : ''}</p>`,
      buttons: [
        { label: 'To the refit', fn: () => this.openRefit() },
      ],
    });
  },

  // fitting out: the Admiralty's allowance, a yard of hulls, a slate of captains
  openCommission() {
    const F = W.Fleet;
    if (!this.commission) {
      this.commission = F.buildCommission();
      this.commission.bought = [];
      this.commission.ownTrait = 'gunnery';
    }
    const cm = this.commission;
    const spent = cm.bought.reduce((a, b) => a + cm.yard[b.yardIdx].price, 0);
    const left = cm.budget - spent;
    const traitOpts = (sel) => Object.keys(F.TRAITS).map(k =>
      `<option value="${k}"${k === sel ? ' selected' : ''}>${F.TRAITS[k].name}</option>`).join('');
    const takenCapts = new Set(cm.bought.map(b => b.captName).filter(Boolean));
    let body = `<p class="goldnote">The Admiralty allows you <b>⚜ ${cm.budget}</b> to fit out a
      squadron of two to four ships. What you do not spend sails with you as the purse.
      <b>⚜ ${left}</b> remains.</p>
      <p><b>Your own commission</b> — you command the first ship you buy. Your gift as a captain:
      <select data-owntrait>${traitOpts(cm.ownTrait)}</select><br>
      <i class="sdesc">${({
        gunnery: 'Your broadsides throw 20% more metal and your gun crews reload faster.',
        boarder: 'Twice as likely to carry a ship when you lead the boarders over the rail.',
        ironsides: 'Your crew\'s morale never breaks below 20 while you stand the quarterdeck.',
        weatherly: 'Better odds of holding the weather gauge — the upwind advantage — as an action opens.',
      })[cm.ownTrait]}</i></p>
      <p class="sdesc"><b>A captain's gift</b>, for reading the slate below: ${Object.keys(F.TRAITS)
        .map(k => `<b>${F.TRAITS[k].name}</b> — ${F.TRAITS[k].desc}`).join(' · ')}</p>
      <h4>THE YARD</h4>`;
    cm.yard.forEach((h, i) => {
      const b = cm.bought.find(x => x.yardIdx === i);
      const isFlag = b && cm.bought[0] === b;
      body += `<div class="storerow">${this.shipThumb(h.cls)}<b>${F.CLASSES[h.cls].name}</b>
        <span class="sdesc">${F.SHIP_TRAITS[h.trait].name} — ${F.SHIP_TRAITS[h.trait].desc}
        · <span data-tip="${F.BATTERIES[h.battery].desc}"><i>${F.BATTERIES[h.battery].name.toLowerCase()}</i></span>
        · ⚜${h.price}</span>`;
      if (b) {
        body += `<span class="ctlgrp">${isFlag ? '<b>⚑ your flag</b>' : ''}
          name <input data-shipname="${i}" value="${b.name}" maxlength="18" style="width:110px">`;
        if (!isFlag) {
          const capOpts = cm.slate.map(cp =>
            `<option value="${cp.name}"${cp.name === b.captName ? ' selected' : ''}` +
            `${takenCapts.has(cp.name) && cp.name !== b.captName ? ' disabled' : ''}>` +
            `${cp.name} — ${F.TRAITS[cp.trait].name}</option>`).join('');
          body += ` Capt. <select data-shipcapt="${i}"><option value="">choose…</option>${capOpts}</select>`;
        }
        body += `</span><button data-return="${i}">Return her</button>`;
      } else {
        const afford = h.price <= left && cm.bought.length < 4;
        body += `<button data-buy="${i}" ${afford ? '' : 'disabled'}>Buy ⚜${h.price}</button>`;
      }
      body += '</div>';
    });
    body += `<p class="sdesc">Captains not given a ship: the first waits ashore for a prize;
      the rest find other berths. Every ship sails with a full complement.</p>`;
    const flagOk = cm.bought.length >= 2 && cm.bought.length <= 4;
    const captsOk = cm.bought.slice(1).every(b => b.captName);
    const m = this.modal({
      wide: true,
      title: '⚓ Fitting Out — a commodore\'s commission',
      sub: 'Pick your hulls and your officers. Ships, hands, and captains persist for the whole cruise.',
      body,
      buttons: [
        { label: flagOk && captsOk ? '⚑ Put to sea' : '⚑ Put to sea (need 2–4 ships, every ship a captain)',
          fn: () => {
            if (!flagOk || !captsOk) return;
            const specs = cm.bought.map((b, i) => {
              const h = cm.yard[b.yardIdx];
              const captain = i === 0
                ? { name: 'You', trait: cm.ownTrait, alive: true }
                : cm.slate.find(cp => cp.name === b.captName);
              return { cls: h.cls, trait: h.trait, battery: h.battery, name: b.name, captain };
            });
            const ashore = cm.slate.filter(cp => !takenCapts.has(cp.name));
            this.commission = null;
            this.closeModal();
            F.startCustom(specs, cm.budget - spent, ashore);
            this.openMuster();
          } },
        { label: 'Take the standing squadron (quick start)',
          fn: () => { this.commission = null; this.closeModal(); F.startCampaign(); this.openMuster(); } },
        { label: 'Back', fn: () => { this.commission = null; this.closeModal(); this.openTitle(); } },
      ],
    });
    this.drawThumbs(m);
    const own = m.querySelector('[data-owntrait]');
    if (own) own.addEventListener('change', () => { cm.ownTrait = own.value; this.openCommission(); });
    m.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.buy;
      let nm = F.suggestName(), guard = 0;
      while (cm.bought.some(x => x.name === nm) && guard++ < 20) nm = F.suggestName();
      cm.bought.push({ yardIdx: i, name: nm, captName: '' });
      this.openCommission();
    }));
    m.querySelectorAll('[data-return]').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.return;
      cm.bought = cm.bought.filter(x => x.yardIdx !== i);
      this.openCommission();
    }));
    m.querySelectorAll('[data-shipname]').forEach(inp => inp.addEventListener('input', () => {
      const b = cm.bought.find(x => x.yardIdx === +inp.dataset.shipname);
      if (b) b.name = inp.value;
    }));
    m.querySelectorAll('[data-shipcapt]').forEach(sel => sel.addEventListener('change', () => {
      const b = cm.bought.find(x => x.yardIdx === +sel.dataset.shipcapt);
      if (b) b.captName = sel.value;
      this.openCommission();
    }));
  },

  // between actions: repairs, prize decisions, captains, and the muster of hands
  // the cruise so far, as a course pricked out on the chart
  cruiseChart() {
    const F = W.Fleet, c = F.campaign;
    if (!c) return '';
    const n = F.STAGES.length;
    const ch = c.chronicle || [];
    const px = (i) => 50 + i * ((520 - 60) / (n - 1));
    let out = '';
    // a suggestion of coastline along the top, and soundings for flavor
    out += `<path d="M 8 18 Q 90 6 180 16 T 340 12 T 512 18" fill="none" stroke="#8a6a42" stroke-width="1.2" opacity="0.55"/>`;
    [70, 205, 330, 455].forEach((x, i) => {
      out += `<text x="${x}" y="${30 + (i % 2) * 5}" font-size="7" fill="#8a6a42" opacity="0.6">${[12, 9, 14, 7][i]}</text>`;
    });
    // the course, dashed between stations
    for (let i = 0; i < n - 1; i++) {
      out += `<path d="M ${px(i)} 52 Q ${(px(i) + px(i + 1)) / 2} ${i % 2 ? 44 : 60} ${px(i + 1)} 52"
        fill="none" stroke="#5a4020" stroke-width="1.2" stroke-dasharray="4 4" opacity="${i < c.stage - 1 ? 0.8 : 0.3}"/>`;
    }
    for (let i = 0; i < n; i++) {
      const stage = i + 1;
      const donePart = stage < c.stage;
      const here = stage === c.stage;
      const entries = ch.filter(e => e.stage === stage);
      const prizes = entries.filter(e => /Took a|Sent in a/.test(e.text)).length;
      const crisis = entries.some(e => /Crisis/.test(e.text));
      const storm = entries.some(e => /storm passage/.test(e.text));
      out += `<circle cx="${px(i)}" cy="52" r="5" fill="${donePart ? '#5a4020' : 'none'}"
        stroke="#5a4020" stroke-width="1.4" opacity="${donePart || here ? 1 : 0.35}"/>`;
      if (here) out += `<circle cx="${px(i)}" cy="52" r="9" fill="none" stroke="#a02418" stroke-width="1.4"/>`;
      out += `<text x="${px(i)}" y="76" font-size="9" text-anchor="middle" fill="#5a4020"
        opacity="${donePart || here ? 1 : 0.45}">${stage === n ? 'the last' : 'action ' + stage}</text>`;
      let glyphs = '';
      if (storm) glyphs += '≈';
      if (prizes) glyphs += '⚑'.repeat(Math.min(prizes, 3));
      if (crisis) glyphs += '⚠';
      if (glyphs) out += `<text x="${px(i)}" y="40" font-size="9" text-anchor="middle" fill="#8a6a42">${glyphs}</text>`;
    }
    return `<svg viewBox="0 0 520 84" width="520" height="84"
      style="background:#eadcb4;border:1px solid #8a6a42;border-radius:4px;display:block;margin:2px 0 8px"
      data-tip="<b>The cruise</b> — your course, pricked out station by station. ⚑ prizes taken or sent in · ⚠ an emergency fought · ≈ a storm passage run.">${out}</svg>`;
  },

  openPortEvent() {
    const F = W.Fleet, c = F.campaign;
    const ev = F.PORT_EVENTS[c.portEvent];
    if (!ev) { c.portEvent = null; return this.openRefit(); }
    const done = (r) => this.modal({
      title: `⚓ ${ev.name}`,
      body: `<p>${r}</p>`,
      buttons: [{ label: 'To the refit', fn: () => this.openRefit() }],
    });
    this.modal({
      title: `⚓ In port — ${ev.name}`,
      body: `<p>${ev.text}</p>`,
      buttons: [
        { label: ev.a.label, fn: () => done(F.portChoice('a')) },
        { label: ev.b.label, fn: () => done(F.portChoice('b')) },
      ],
    });
  },

  openRefit() {
    const F = W.Fleet, c = F.campaign, s = F.summary;
    if (s && !s.settled) F.settleAction();
    if (c.portEvent) return this.openPortEvent();
    const capNames = () => c.captains.map(x =>
      `${x.name}${x.distinguished ? ' ★' : ''} (${F.captTraitsText(x)})`).join(', ') || 'none';
    let body = this.cruiseChart() + `<p class="goldnote">⚜ ${c.gold} in the purse · ${c.hands} hands in the pool ·
      captains ashore: ${capNames()}</p>`;
    if (s && s.prizeShips && s.prizeShips.length) {
      body += '<h4>PRIZES TAKEN</h4>';
      s.prizeShips.forEach((cls, i) => {
        const canTake = F.ships.length < 4 && c.captains.length > 0;
        // swap in: hand one of your own ships to the yard and shift her people aboard
        const swapOpts = F.ships.map((sh, si) =>
          `<option value="${si}">${sh.name} (yard pays ⚜${F.shipValue(sh)})</option>`).join('');
        body += `<div class="storerow">${this.shipThumb(cls)}<b>${F.CLASSES[cls].name}</b>
          <span class="sdesc">Christen her: <input data-pname="${i}" value="${F.suggestName()}"
            maxlength="18" style="width:110px"> — then take her into service (needs a captain
          ashore and a prize crew), <b>trade up</b> (send one of yours into port; her captain and
          hands shift into the prize), or send her in for ⚜ ${F.PRIZE_VALUE[cls]}.</span>
          <button data-take="${i}" ${canTake ? '' : 'disabled'}
            data-tip="<b>Take into service</b> — a captain from the pool ashore commands her. She joins at 45% hull with no hands until you give her some.">Take into service</button>
          <span class="ctlgrp" data-tip="<b>Trade up</b> — the chosen ship goes into port and the yard pays for her; her captain and hands carry over. The prize starts at 45% hull.">
            <select data-swapsel="${i}">${swapOpts}</select>
            <button data-swap="${i}">Trade up</button>
          </span>
          <button data-sell="${i}" data-tip="<b>Send her in</b> — sell the prize to the Admiralty for coin.">Send her in ⚜${F.PRIZE_VALUE[cls]}</button></div>`;
      });
    }
    body += '<h4>THE SQUADRON</h4>';
    F.ships.forEach((sh, i) => {
      const allCapts = [sh.captain]
        .concat(F.ships.filter(x => x !== sh).map(x => x.captain))
        .concat(c.captains);
      const capOpts = allCapts.map(cp =>
        `<option value="${cp.name}"${cp.name === sh.captain.name ? ' selected' : ''}>` +
        `${cp.name}${cp.distinguished ? ' ★' : ''} — ${F.captTraitsText(cp)}</option>`).join('');
      body += `<div class="storerow">${this.captPortrait(sh.captain.name, 'sm')}${this.shipThumb(sh.cls)}<b>${sh.name}</b>
        <span class="sdesc">${F.CLASSES[sh.cls].name} ·
          hull ${Math.ceil(sh.hull)}/${sh.hullMax} ·
          guns ${sh.guns}/${sh.gunsMax}${sh.guns < sh.gunsMax ? ' <b style="color:#a02418">(dismounted)</b>' : ''}
          (<i>${F.BATTERIES[sh.battery || 'long'].name.toLowerCase()}</i>) ·
          hands ${sh.hands}/${sh.complement}${sh.hands < sh.complement * 0.6 ? ' <b style="color:#a02418">(short-handed)</b>' : ''}
          · Capt. <select data-capt="${i}">${capOpts}</select>
          ${sh.captain.alive ? '' : ' †'}
          ${sh.captain.learned ? `<i class="wchips">(${F.TRAITS[sh.captain.trait].name} + ${F.TRAITS[sh.captain.learned].name})</i>` : ''}</span>
        <span class="rowctl">
          <span class="ctlgrp" data-tip="<b>Hull repairs</b> — ⚜1 per point. <i>full</i> repairs as much as the purse allows.">
            <i>repair</i>
            <button data-rep1="${i}" ${sh.hull >= sh.hullMax || c.gold < 2 ? 'disabled' : ''}>+1 ⚜1</button>
            <button data-rep="${i}" ${sh.hull >= sh.hullMax || c.gold < 2 ? 'disabled' : ''}>+5 ⚜5</button>
            <button data-repfull="${i}" ${sh.hull >= sh.hullMax || c.gold < 2 ? 'disabled' : ''}>full</button>
          </span>
          <span class="ctlgrp" data-tip="<b>Hands</b> — move crew between ship and shore pool, free. <i>fill</i> tops up her complement. Short-handed ships serve their guns slowly.">
            <i>hands</i>
            <button data-hminus="${i}" ${sh.hands <= 0 ? 'disabled' : ''}>−10</button>
            <button data-hminus5="${i}" ${sh.hands <= 0 ? 'disabled' : ''}>−5</button>
            <button data-hplus5="${i}" ${c.hands <= 0 || sh.hands >= sh.complement ? 'disabled' : ''}>+5</button>
            <button data-hplus="${i}" ${c.hands <= 0 || sh.hands >= sh.complement ? 'disabled' : ''}>+10</button>
            <button data-hfill="${i}" ${c.hands <= 0 || sh.hands >= sh.complement ? 'disabled' : ''}>fill</button>
          </span>
          <span class="ctlgrp" data-tip="<b>Guns</b> — <i>remount</i> restores a dismounted gun (⚜8); <i>add</i> pierces her for a new one, permanent (⚜45, +2 max).">
            <i>guns</i>
            ${sh.guns < sh.gunsMax ? `<button data-gun="${i}" ${c.gold < 8 ? 'disabled' : ''}>remount ⚜8</button>` : ''}
            ${sh.gunsMax < (F.CLASSES[sh.cls].guns + 2) ? `<button data-buygun="${i}" ${c.gold < 45 ? 'disabled' : ''}>add ⚜45</button>` : ''}
            <button data-rearm="${i}" ${c.gold < 25 ? 'disabled' : ''}
              data-tip="<b>Re-arm</b> — swap her battery: ${F.BATTERIES[(sh.battery || 'long') === 'long' ? 'carronade' : 'long'].desc}">
              → ${(sh.battery || 'long') === 'long' ? 'carronades' : 'long guns'} ⚜25</button>
          </span>
          ${i > 0 ? `<button data-flag="${i}" data-tip="<b>Shift your flag</b> — this ship becomes the flagship: hers are the crises you fight by hand.">hoist flag here</button>` : ''}
        </span></div>`;
    });
    body += `<h4>RECRUITING</h4>
      <div class="storerow"><b>Muster hands</b><span class="sdesc">Volunteers and the press: ⚜3 a head.</span>
        <button data-hire="3" ${c.gold < 9 ? 'disabled' : ''}>+3 (⚜9)</button>
        <button data-hire="10" ${c.gold < 30 ? 'disabled' : ''}>+10 (⚜30)</button></div>`;
    if (c.lieutenantOffer) {
      body += `<div class="storerow"><b>A passed-over lieutenant</b><span class="sdesc">Seeks a command.
        Competent, hungry, ⚜60.</span>
        <button data-lt="1" ${c.gold < 60 ? 'disabled' : ''}>Give him his step (⚜60)</button></div>`;
    }
    if (c.lastPassage) {
      body = `<p><i>${c.lastPassage}</i></p>` + body;
      c.lastPassage = null;
    }
    body += '<h4>NEXT ORDERS — choose your assignment</h4>';
    (c.actionOptions || []).forEach((o, i) => {
      body += `<div class="storerow"><b>${o.name}</b><span class="sdesc">${o.desc}</span>
        <button data-go="${i}">⚑ Make it so</button></div>`;
    });
    const m = this.modal({
      wide: true,
      title: `⚓ Refit — after Action ${c.stage} of ${F.STAGES.length}`,
      sub: 'Ships, hands, and captains persist for the whole cruise. Spend well, choose well.',
      body,
      buttons: [
        { label: 'The log so far', fn: () => {
          const ch = (c.chronicle || []).map(e => `<div><b style="color:#8a6a42">S${e.stage}</b> — ${e.text}</div>`).join('')
            || '<p>Nothing worth the ink, yet.</p>';
          this.modal({
            title: '📖 The Cruise Log',
            body: `<div style="max-height:340px;overflow-y:auto;font-size:14px;line-height:1.55">${ch}</div>`,
            buttons: [{ label: 'Back to the refit', fn: () => this.openRefit() }],
          });
        } },
        { label: 'Abandon the cruise', fn: () => { W.Fleet.clearCruise(); W.Fleet.close(); W.state.mode = 'title'; this.openTitle(); } },
      ],
      row: true,
    });
    W.Fleet.saveCruise();
    m.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
      const outcome = F.chooseAction(+b.dataset.go);
      if (outcome === 'battle') { this.closeModal(); this.openMuster(); }
      else if (outcome === 'stormcrisis') { this.closeModal(); this.openCrisisIntro(); }
      else this.openRefit();
    }));
    m.querySelectorAll('[data-gun]').forEach(b => b.addEventListener('click', () => {
      F.remountGun(F.ships[+b.dataset.gun]);
      this.openRefit();
    }));
    m.querySelectorAll('[data-buygun]').forEach(b => b.addEventListener('click', () => {
      F.buyGun(F.ships[+b.dataset.buygun]);
      this.openRefit();
    }));
    m.querySelectorAll('[data-rearm]').forEach(b => b.addEventListener('click', () => {
      F.reArm(F.ships[+b.dataset.rearm]);
      this.openRefit();
    }));
    m.querySelectorAll('[data-take]').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.take;
      const nameEl = m.querySelector(`[data-pname="${i}"]`);
      if (F.takePrize(s.prizeShips[i], nameEl && nameEl.value)) s.prizeShips.splice(i, 1);
      this.openRefit();
    }));
    m.querySelectorAll('[data-swap]').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.swap;
      const selEl = m.querySelector(`[data-swapsel="${i}"]`);
      const nameEl = m.querySelector(`[data-pname="${i}"]`);
      if (F.swapPrize(s.prizeShips[i], selEl ? +selEl.value : 0, nameEl && nameEl.value)) {
        s.prizeShips.splice(i, 1);
      }
      this.openRefit();
    }));
    m.querySelectorAll('[data-sell]').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.sell;
      F.sellPrize(s.prizeShips[i]);
      s.prizeShips.splice(i, 1);
      this.openRefit();
    }));
    m.querySelectorAll('[data-rep]').forEach(b => b.addEventListener('click', () => {
      F.repairShip(F.ships[+b.dataset.rep], 5);
      this.openRefit();
    }));
    m.querySelectorAll('[data-rep1]').forEach(b => b.addEventListener('click', () => {
      F.repairShip(F.ships[+b.dataset.rep1], 1);
      this.openRefit();
    }));
    m.querySelectorAll('[data-repfull]').forEach(b => b.addEventListener('click', () => {
      F.repairShip(F.ships[+b.dataset.repfull], 999);
      this.openRefit();
    }));
    m.querySelectorAll('[data-hplus]').forEach(b => b.addEventListener('click', () => {
      F.moveHands(F.ships[+b.dataset.hplus], 10);
      this.openRefit();
    }));
    m.querySelectorAll('[data-hminus]').forEach(b => b.addEventListener('click', () => {
      F.moveHands(F.ships[+b.dataset.hminus], -10);
      this.openRefit();
    }));
    m.querySelectorAll('[data-hplus5]').forEach(b => b.addEventListener('click', () => {
      F.moveHands(F.ships[+b.dataset.hplus5], 5);
      this.openRefit();
    }));
    m.querySelectorAll('[data-hminus5]').forEach(b => b.addEventListener('click', () => {
      F.moveHands(F.ships[+b.dataset.hminus5], -5);
      this.openRefit();
    }));
    m.querySelectorAll('[data-hfill]').forEach(b => b.addEventListener('click', () => {
      F.moveHands(F.ships[+b.dataset.hfill], 999);
      this.openRefit();
    }));
    m.querySelectorAll('[data-hire]').forEach(b => b.addEventListener('click', () => {
      F.hireHands(+b.dataset.hire);
      this.openRefit();
    }));
    m.querySelectorAll('[data-lt]').forEach(b => b.addEventListener('click', () => {
      F.hireLieutenant();
      this.openRefit();
    }));
    m.querySelectorAll('[data-flag]').forEach(b => b.addEventListener('click', () => {
      W.Fleet.hoistFlag(+b.dataset.flag);
      this.openRefit();
    }));
    m.querySelectorAll('select[data-capt]').forEach(sel => sel.addEventListener('change', () => {
      F.swapCaptain(+sel.dataset.capt, sel.value);
      this.openRefit();
    }));
  },

  openSurrender() {
    this.modal({
      title: 'They Strike Their Colors!',
      body: `<p>Their ensign comes rattling down the mast — struck colors, the oldest signal of
        surrender a ship can make. Their captain waves a white shirt from the quarterdeck and
        offers their strongbox in exchange for their lives.</p>`,
      buttons: [
        { label: 'Accept the surrender (bonus gold)', fn: () => { this.closeModal(); W.Combat.acceptSurrender(); } },
        { label: 'Press the attack — sink her', fn: () => { this.closeModal(); W.Combat.refuseSurrender(); } },
      ],
    });
  },

  openSector() {
    this.modal({
      title: `The Strait — leaving ${W.SECTOR_NAMES[W.GameMap.sector - 1]}`,
      body: `<p>You slip the strait with the Maelstrom howling at your back, and the sea opens
        ahead: ${W.SECTOR_NAMES[W.GameMap.sector] || 'open water'}.</p>`,
      buttons: [{
        label: 'Sail east',
        fn: () => {
          W.GameMap.gen(W.GameMap.sector + 1);
          W.Main.save();
          this.openMap();
        },
      }],
    });
  },

  openGameover(msg) {
    if (W.Sound) W.Sound.play('stingLoss');
    this.modal({
      title: 'Lost With All Hands',
      body: `<p>${msg}</p><p class="sub">The Heart of the Storm sinks into the dark, and the
        Maelstrom closes over the Shattered Sea.</p>`,
      buttons: [{ label: 'New Voyage', fn: () => { this.closeModal(); W.Main.newGame(); } }],
    });
  },

  openVictory() {
    this.modal({
      title: '⚑ The Leviathan Burns',
      body: `<p>The Crown Leviathan rolls over and goes down by the head, her smoke screen torn
        away rag by rag. Beyond her wreck the clouds break — the Free Isles, gold in the morning.</p>
        <p>The Maelstrom, robbed of its flagship and its prize, spins itself to rags against
        the open sea. The scholars of the Isles are waiting on the quay to break the Heart open —
        and the storm's aim with it.</p>
        <p class="goldnote">You made it. ⚜ ${W.state.gold} doubloons in the hold.</p>`,
      buttons: [{ label: 'Sail again', fn: () => { this.closeModal(); W.Main.newGame(); } }],
    });
  },
};
