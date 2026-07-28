'use strict';

W.Main = {
  SAVE_KEY: 'windward_save_v1',
  last: 0,

  init() {
    W.Render.init();
    W.UI.init();

    // debug hooks for quick visual checks: ?test=combat / ?test=map
    const test = (location.search.match(/test=(\w+)/) || [])[1];
    if (test) {
      this.newGame();
      if (test === 'combat') {
        W.UI.closeModal();
        W.Combat.start('patrol');
        const gun = W.Combat.enemy.roomOf('cannons') || W.Combat.enemy.rooms[0];
        W.player.weapons.forEach(w => { w.target = gun.idx; });
        W.paused = false;
      } else if (test === 'glossary') {
        W.UI.openGlossary();
      } else if (test === 'fleet') {
        W.UI.closeModal();
        W.Fleet.newSkirmish();
        W.Fleet.applyPreset('breakline');
        W.Fleet.ships[2].order = { tactic: 'screen', target: 0 };
        W.Fleet.begin();
      }
    } else {
      W.UI.openTitle();
    }
    requestAnimationFrame((t) => this.loop(t));
  },

  newGame() {
    W.player = W.makePlayerShip();
    W.state.gold = 20;
    W.state.shells = 4;
    W.state.provisions = 10;
    W.state.hungerJumps = 0;
    W.EVENTS.forEach(e => { delete e.used; });
    W.GameMap.gen(1);
    W.state.mode = 'map';
    W.paused = false;
    W.UI.sel.crew = null; W.UI.sel.wep = null;
    this.save();
    W.UI.openMap();
  },

  jumpTo(id) {
    if (!W.GameMap.canJump(id)) return;
    // every sail eats provisions; sailing on empty casks starves the crew
    const starving = (W.state.provisions | 0) <= 0;
    if (!starving) {
      W.state.provisions--;
      W.state.hungerJumps = 0;
    } else {
      W.state.hungerJumps = (W.state.hungerJumps | 0) + 1;
    }
    const res = W.GameMap.jump(id);
    res.starving = starving;
    W.UI.closeModal();
    this.save();
    this.resolveNode(res);
  },

  resolveNode({ node, stormed, first, starving }) {
    if (starving && !(stormed && node.type !== 'boss')) {
      this.resolveStarving(node, first);
      return;
    }
    if (stormed && node.type !== 'boss') {
      W.player.hull = Math.max(1, W.player.hull - 2);
      const tier = Math.min(3, W.GameMap.sector + 1);
      W.UI.modal({
        title: '🌀 Inside the Maelstrom',
        body: `<p>The sky is the wrong color and the rain falls sideways. This waypoint belongs
          to the storm now — and the storm has teeth. Rigging tears loose (−2 hull) as an
          Armada hunter looms out of the murk.</p>`,
        buttons: [{
          label: 'To quarters!',
          fn: () => { W.UI.closeModal(); W.Combat.start(W.pickEnemy(tier), { elite: true }); },
        }],
      });
      return;
    }

    this.resolveNodeContent(node, first);
  },

  // Empty casks: the crew starves a little every sail, and mutiny brews.
  resolveStarving(node, first) {
    W.player.crew.forEach(c => { c.hp = Math.max(1, c.hp - 10); });
    const continueOn = () => { W.UI.closeModal(); this.resolveNodeContent(node, first); };
    const mutinyOdds = 0.25 + 0.25 * ((W.state.hungerJumps | 0) - 1);
    if (!W.chance(mutinyOdds)) {
      W.UI.modal({
        title: 'Empty Casks',
        body: `<p>No biscuit, no salt beef, no water but what the rain brings. The crew weakens,
          and the looks they trade on deck are getting long. Find provisions — a port, a captured
          ship, anyone's charity — before the looks become knives.</p>`,
        buttons: [{ label: 'Sail on, hungry', fn: continueOn }],
      });
      return;
    }
    const buttons = [];
    if (W.player.crew.some(c => c.race === 'stormtouched' && c.hp > 0)) {
      buttons.push({
        label: '◆ Post the marines on the quarterdeck.', blue: true,
        fn: () => {
          W.UI.modal({
            title: 'Mutiny Averted',
            body: `<p>The marines stand to with fixed bayonets, hungry as anyone and steady as the
              mast. That is what marines are for, and every hand aboard knows it. The moment passes.</p>`,
            buttons: [{ label: 'Sail on', fn: continueOn }],
          });
        },
      });
    }
    buttons.push({
      label: 'Face them down.',
      fn: () => {
        if (W.chance(0.6)) {
          W.UI.modal({
            title: 'The Moment Passes',
            body: '<p>You stand at the quarterdeck rail and say nothing at all. One by one they find somewhere else to look.</p>',
            buttons: [{ label: 'Sail on', fn: continueOn }],
          });
        } else {
          W.player.crew.forEach(c => { c.hp = Math.max(1, c.hp - 25); });
          W.UI.modal({
            title: 'Blood Amidships',
            body: '<p>It comes to fists and belaying pins before order holds. Everyone is the worse for it.</p>',
            buttons: [{ label: 'Sail on', fn: continueOn }],
          });
        }
      },
    });
    if (W.state.gold >= 12) {
      buttons.push({
        label: 'Break out the last of the rum and your own table. (12 doubloons)',
        fn: () => {
          W.state.gold -= 12;
          W.player.crew.forEach(c => { c.hp = Math.min(c.maxHp, c.hp + 10); });
          W.UI.modal({
            title: 'Bought Peace',
            body: '<p>Your private stores and the good rum go into the common pot. It buys quiet — for now.</p>',
            buttons: [{ label: 'Sail on', fn: continueOn }],
          });
        },
      });
    }
    W.UI.modal({
      title: '⚑ Mutiny Brewing',
      body: `<p>The casks have been empty too long. Hollow-eyed sailors gather mid-deck, and
        your own bosun won't meet your eye. Someone has been collecting names for a mutiny.</p>`,
      buttons,
    });
  },

  resolveNodeContent(node, first) {
    if (!first) {
      W.UI.modal({
        title: 'Charted Waters',
        body: '<p>You have been this way before. Empty sea and your own old wake.</p>',
        buttons: [{ label: 'Sail on', fn: () => { W.UI.closeModal(); W.UI.openMap(); } }],
      });
      return;
    }

    switch (node.type) {
      case 'combat':
        W.Combat.start(W.pickEnemy(W.GameMap.sector));
        break;
      case 'event':
        W.UI.openEvent(W.Events.pick(false));
        break;
      case 'distress':
        W.UI.openEvent(W.Events.pick(true));
        break;
      case 'store':
        W.Store.gen();
        W.UI.openStore();
        break;
      case 'empty':
        if (W.chance(0.2)) {
          W.UI.modal({
            title: 'Ambush!',
            body: '<p>A sail detaches itself from a fogbank, running out her guns as she comes.</p>',
            buttons: [{
              label: 'To quarters!',
              fn: () => { W.UI.closeModal(); W.Combat.start(W.pickEnemy(W.GameMap.sector)); },
            }],
          });
        } else {
          W.UI.modal({
            title: 'Open Water',
            body: '<p>Nothing but sea, sky, and the long grey line of the horizon. The crew breathes easier.</p>',
            buttons: [{ label: 'Sail on', fn: () => { W.UI.closeModal(); W.UI.openMap(); } }],
          });
        }
        break;
      case 'exit':
        W.UI.openSector();
        break;
      case 'boss':
        W.UI.modal({
          title: '👑 The Crown Leviathan',
          body: `<p>She lies across the mouth of the last strait like a fortress that learned to
            float: wrapped in her own gun-smoke three banks deep, a gun deck like a cliff face, and the
            Maelstrom coiling at her back.</p>
            <p>There is no way around. There never was.</p>`,
          buttons: [{
            label: 'Beat to quarters',
            fn: () => { W.UI.closeModal(); W.Combat.start('leviathan'); },
          }],
        });
        break;
      default:
        W.UI.openMap();
    }
  },

  afterCombat() {
    const r = W.Combat.result;
    const loot = W.Combat.loot || { gold: 0, weapon: null };

    if (r === 'win') {
      if (loot.weapon) {
        if (W.player.weapons.length < 4) {
          W.player.weapons.push(new W.Weapon(loot.weapon));
          loot.weaponTaken = loot.weapon;
        } else {
          loot.weaponGold = Math.floor(W.WEAPONS[loot.weapon].cost / 2);
          loot.weaponSold = loot.weapon;
          loot.gold += loot.weaponGold;
        }
      }
      W.state.gold += loot.gold;
      if (loot.shells) W.state.shells = Math.min(20, (W.state.shells | 0) + loot.shells);
      if (loot.provisions) W.state.provisions = Math.min(20, (W.state.provisions | 0) + loot.provisions);
      W.Combat.finish();
      W.state.mode = 'map';
      this.save();
      W.UI.openLoot(loot);
    } else if (r === 'victory') {
      W.Combat.finish();
      W.state.mode = 'map';
      this.clearSave();
      W.UI.openVictory();
    } else if (r === 'flee') {
      W.Combat.finish();
      W.state.mode = 'map';
      this.save();
      W.UI.modal({
        title: 'A Clean Pair of Heels',
        body: '<p>Every sail fills and the Petrel leans hard into the wind. Their shot lands behind you, then falls short, then stops coming at all.</p>',
        buttons: [{ label: 'Sail on', fn: () => { W.UI.closeModal(); W.UI.openMap(); } }],
      });
    } else if (r === 'lose') {
      W.Combat.finish();
      W.state.mode = 'map';
      this.clearSave();
      W.UI.openGameover('The Petrel takes her last sea aboard and slips under, guns still warm.');
    } else if (r === 'crewdead') {
      W.Combat.finish();
      W.state.mode = 'map';
      this.clearSave();
      W.UI.openGameover('The Petrel sails on with no hand at her helm — a new ghost for the Shattered Sea.');
    }
  },

  loop(now) {
    const dt = W.clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now;

    // A thrown exception must never kill the animation loop — that strands the
    // player on a frozen screen with no message. Catch, surface, sail on.
    try {
      if (W.state.mode === 'combat' && W.Combat.active && !W.paused) {
        W.Combat.tick(dt);
      }
      if (W.state.mode === 'fleet' && W.Fleet.active && !W.paused) {
        W.Fleet.tick(dt);
      }
      if (W.state.mode === 'crisis' && !W.paused) {
        W.Fleet.crisisTick(dt);
      }
      if (W.Fleet.pendingCrisis) {
        W.Fleet.pendingCrisis = false;
        W.UI.openCrisisIntro();
      }
      if (W.Fleet.active && W.Fleet.phase === 'done' && W.Fleet.summary && !W.Fleet.summaryShown) {
        W.Fleet.summaryShown = true;
        W.UI.openFleetEnd();
      }
      if (W.Fleet.phase !== 'done') W.Fleet.summaryShown = false;
      if (W.Combat.surrenderPending) {
        W.Combat.surrenderPending = false;
        W.UI.openSurrender();
      }
      if (W.Combat.result) this.afterCombat();

      // Watchdog: combat mode with no live combat and no pending result means a
      // transition failed half-way (e.g. a modal never opened). Self-heal to the
      // chart instead of leaving the player with no way to continue.
      if (W.state.mode === 'combat' && !W.Combat.active && !W.Combat.result) {
        W.state.mode = 'map';
        W.UI.openMap();
      }

      W.Render.draw(dt);
      W.UI.update();
    } catch (err) {
      this.lastErr = (err && err.message) || String(err);
      console.error('Windward frame error:', err);
    }
    requestAnimationFrame((t) => this.loop(t));
  },

  // ---------- persistence ----------
  save() {
    try {
      const P = W.player, M = W.GameMap;
      const data = {
        gold: W.state.gold,
        shells: W.state.shells | 0,
        provisions: W.state.provisions | 0,
        hungerJumps: W.state.hungerJumps | 0,
        sector: M.sector, maelstrom: M.maelstrom, curr: M.curr,
        trail: M.trail || [],
        nodes: M.nodes.map(n => ({
          id: n.id, col: n.col, row: n.row, x: n.x, y: n.y,
          type: n.type, edges: n.edges, visited: n.visited,
        })),
        usedEvents: W.EVENTS.filter(e => e.used).map(e => e.id),
        ship: {
          hull: P.hull, hullMax: P.hullMax, reactor: P.reactor,
          sys: Object.fromEntries(Object.entries(P.systems).map(([id, s]) => [id, s.level])),
          power: Object.fromEntries(Object.entries(P.systems).map(([id, s]) => [id, s.power])),
          weapons: P.weapons.map(w => ({ type: w.type, on: w.on })),
          crew: P.crew.map(c => ({ race: c.race, name: c.name, hp: Math.round(c.hp) })),
        },
      };
      localStorage.setItem(this.SAVE_KEY, JSON.stringify(data));
    } catch (e) { /* private browsing / storage full — play on without saves */ }
  },

  hasSave() {
    try { return !!localStorage.getItem(this.SAVE_KEY); } catch (e) { return false; }
  },

  clearSave() {
    try { localStorage.removeItem(this.SAVE_KEY); } catch (e) { /* ignore */ }
  },

  load() {
    let data;
    try { data = JSON.parse(localStorage.getItem(this.SAVE_KEY)); } catch (e) { data = null; }
    if (!data) { this.newGame(); return; }

    W.player = new W.Ship({
      name: 'The Petrel', layout: 'sloop', faction: 'player',
      hull: data.ship.hull, hullMax: data.ship.hullMax, reactor: data.ship.reactor,
      sys: data.ship.sys, power: data.ship.power,
      weapons: data.ship.weapons, crew: data.ship.crew,
    });
    W.state.gold = data.gold;
    W.state.shells = data.shells != null ? data.shells : 4;
    W.state.provisions = data.provisions != null ? data.provisions : 10;
    W.state.hungerJumps = data.hungerJumps | 0;
    const M = W.GameMap;
    M.sector = data.sector;
    M.maelstrom = data.maelstrom;
    M.curr = data.curr;
    M.nodes = data.nodes;
    M.trail = data.trail || [data.curr];
    W.EVENTS.forEach(e => { e.used = (data.usedEvents || []).includes(e.id); });
    W.state.mode = 'map';
    W.paused = false;
    W.UI.openMap();
  },
};

window.addEventListener('DOMContentLoaded', () => W.Main.init());
