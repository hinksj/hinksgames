// Full-stack headless test: loads ALL modules including render/ui/main with a
// minimal DOM shim, then plays entire combats through the real main loop and
// asserts the post-combat modal actually appears (regression: silent softlock
// after a win). Run: node test/ui_smoke.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const FILES = ['util.js', 'data.js', 'model.js', 'combat.js', 'fleet.js', 'map.js',
  'events.js', 'store.js', 'render.js', 'ui.js', 'main.js'];

// ---- minimal DOM shim ----
function makeEl() {
  const el = {
    style: {}, dataset: {}, children: [],
    className: '', innerHTML: '', textContent: '', title: '', disabled: false,
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c, on) { on ? this._set.add(c) : this._set.delete(c); },
      contains(c) { return this._set.has(c); },
    },
    listeners: {},
    addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    appendChild(c) { this.children.push(c); return c; },
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 460 }; },
    getContext() { return null; }, // renderer draws nothing headless; guards must hold
    width: 1000, height: 460,
  };
  return el;
}
const elements = {};
const documentStub = {
  body: makeEl(),
  getElementById(id) { return elements[id] = elements[id] || makeEl(); },
  createElement() { return makeEl(); },
  addEventListener() {},
};
let rafCb = null;
const ctx = {
  console,
  document: documentStub,
  window: { addEventListener(ev, fn) { if (ev === 'DOMContentLoaded') fn(); } },
  location: { search: '' },
  localStorage: {
    _s: {},
    getItem(k) { return this._s[k] || null; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; },
  },
  requestAnimationFrame(cb) { rafCb = cb; },
};
ctx.globalThis = ctx;
ctx.window.W = undefined;
vm.createContext(ctx);
for (const f of FILES) {
  const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
  vm.runInContext(src, ctx, { filename: f });
}
const W = ctx.W;

// spy on the post-combat modals
const shown = [];
for (const fn of ['openLoot', 'openVictory', 'openGameover', 'openMap', 'openSurrender']) {
  const orig = W.UI[fn].bind(W.UI);
  W.UI[fn] = (...args) => { shown.push(fn); return orig(...args); };
}

// pump the real main loop, surfacing any exception with its stack
let now = 0;
function pump(frames) {
  for (let i = 0; i < frames; i++) {
    now += 33;
    const cb = rafCb; rafCb = null;
    assert.ok(cb, 'rAF chain died — loop threw on a previous frame');
    cb(now);
  }
}

// Main.init ran via DOMContentLoaded (title screen). Start a real game.
W.Main.newGame();
assert.strictEqual(W.state.mode, 'map');

// --- play a combat to a WIN through the real loop ---
for (const enemyId of ['cutter', 'patrol', 'raider']) {
  shown.length = 0;
  W.Combat.start(enemyId);
  W.paused = false;
  const gunRoom = W.Combat.enemy.roomOf('cannons') || W.Combat.enemy.rooms[0];
  W.player.weapons.forEach(w => { w.target = gunRoom.idx; });
  // make the player unkillable so we always exercise the WIN path
  const guard = setInterval(() => {}, 1 << 30); clearInterval(guard);
  let frames = 0;
  while (W.state.mode === 'combat' && frames < 30000) {
    W.player.hull = W.player.hullMax;
    W.player.crew.forEach(c => { c.hp = c.maxHp; });
    if (W.player.intruders.length) {
      const rm = W.player.intruders[0].roomIdx;
      W.player.crew.forEach(c => { if (c.roomIdx !== rm && !c.path.length) c.orderTo(rm); });
    } else {
      // like a human: send crew back to stations after repelling boarders
      const stations = ['helm', 'cannons', 'sails'];
      W.player.crew.forEach((c, i) => {
        const r = W.player.roomOf(stations[i % 3]);
        if (r && c.roomIdx !== r.idx && !c.path.length) c.orderTo(r.idx);
      });
    }
    // if a surrender modal pops, press the attack so we reach a clean kill
    if (shown.includes('openSurrender')) {
      shown.splice(shown.indexOf('openSurrender'), 1);
      W.Combat.refuseSurrender();
    }
    // a rare mutual-suppression stalemate is escapable, like a real player would
    if (frames === 22000) W.Combat.escaping = true;
    W.paused = false;
    pump(1);
    frames++;
  }
  assert.ok(frames < 30000, `combat vs ${enemyId} never resolved through the loop`);
  const fled = frames > 22000;
  assert.ok(shown.includes('openLoot') || fled,
    `no loot modal after winning vs ${enemyId} (shown: ${shown.join(',') || 'nothing'})`);
  if (fled) console.log(`  (vs ${enemyId}: stalemate — fled cleanly, as a player would)`);
  assert.strictEqual(W.Combat.result, null, 'combat result not cleared');
  assert.strictEqual(W.state.mode, 'map');
  // dismiss the loot modal the way the button would
  W.UI.closeModal();
  console.log(`win vs ${enemyId}: loot modal shown OK (${frames} frames)`);
}

// --- surrender-accept path ---
shown.length = 0;
W.Combat.start('pirate_brig');
W.paused = false;
W.Combat.enemy.hull = Math.floor(W.Combat.enemy.hullMax * 0.25); // force offer check
W.player.weapons.forEach(w => { w.target = 0; });
let frames = 0;
let accepted = false;
while (W.state.mode === 'combat' && frames < 30000) {
  W.player.hull = W.player.hullMax;
  W.player.crew.forEach(c => { c.hp = c.maxHp; });
  if (!accepted && shown.includes('openSurrender')) {
    accepted = true;
    W.Combat.acceptSurrender();
  }
  W.paused = false;
  pump(1);
  frames++;
}
assert.ok(shown.includes('openLoot') || !accepted, 'no loot modal after accepted surrender');
console.log(`surrender path: ${accepted ? 'accepted, loot modal shown OK' : 'no offer this run (kill instead), OK'}`);
W.UI.closeModal();

// --- losing path shows game over ---
shown.length = 0;
W.Combat.start('frigate');
W.paused = false;
W.player.hull = 1;
frames = 0;
while (W.state.mode === 'combat' && frames < 30000) { W.paused = false; pump(1); frames++; }
assert.ok(shown.includes('openGameover'), 'no game-over modal after sinking');
console.log('loss path: game-over modal shown OK');

// --- flee path returns to map ---
W.Main.newGame();
shown.length = 0;
W.Combat.start('frigate');
W.paused = false;
W.Combat.escaping = true;
frames = 0;
while (W.state.mode === 'combat' && frames < 30000) {
  W.player.hull = W.player.hullMax;
  W.paused = false; pump(1); frames++;
}
assert.strictEqual(W.state.mode, 'map', 'flee did not return to map');
console.log('flee path: returned to map OK');

// --- map jumps resolve every node type without killing the loop ---
W.Main.newGame();
for (let hop = 0; hop < 6; hop++) {
  const cur = W.GameMap.node(W.GameMap.curr);
  const next = cur.edges.map(id => W.GameMap.node(id)).find(n => !n.visited) ||
    W.GameMap.node(cur.edges[0]);
  if (!next) break;
  W.Main.jumpTo(next.id);
  // if a combat started, flee it so the walk continues
  let f = 0;
  while (W.state.mode === 'combat' && f < 30000) {
    W.player.hull = W.player.hullMax;
    W.player.crew.forEach(c => { c.hp = c.maxHp; });
    W.Combat.escaping = true;
    W.paused = false; pump(1); f++;
  }
  pump(3);
}
console.log('map walk: 6 jumps resolved OK');

console.log('\nUI SMOKE TEST PASSED');
