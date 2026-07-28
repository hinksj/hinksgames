// Full-stack headless test: loads data/engine/ai/net/ui/main with a minimal DOM
// shim and plays complete solo games through the real UI layer (render paths run
// on every action). The human seat is driven by the AI brain via CC.ui.act.
// Run: node test/ui_smoke.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = ['data.js', 'engine.js', 'ai.js', 'net.js', 'ui.js', 'main.js'];

function makeEl() {
  const el = {
    style: {}, dataset: {}, children: [], value: '', selected: false,
    className: '', innerHTML: '', textContent: '', title: '', disabled: false,
    scrollTop: 0, scrollHeight: 0,
    listeners: {},
    addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    appendChild(c) { this.children.push(c); return c; },
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
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

// queue timers; drained iteratively to avoid recursion
const timers = [];
const ctx = {
  console,
  document: documentStub,
  setTimeout(fn) { timers.push(fn); return timers.length; },
  clearTimeout() {},
  location: { search: '', reload() {} },
  Map: Map,
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of FILES) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), ctx, { filename: f });
}
const CC = ctx.CC;

let failures = 0;
function ok(cond, msg) { if (!cond) { failures++; console.error('FAIL: ' + msg); } }

function drainTimers(limit) {
  let n = 0;
  while (timers.length && n < limit) { timers.shift()(); n++; }
  return n;
}

function playSoloGame(seed, bots) {
  const names = [{ name: 'Human', isAI: false }];
  for (let i = 0; i < bots; i++) names.push({ name: 'Bot' + i, isAI: true });
  const st = CC.engine.newGame({ names, target: 50, seed });
  CC.ui.begin(st, 0, {});
  let steps = 0;
  while (st.phase !== 'gameEnd' && steps < 60000) {
    drainTimers(50); // let AI seats act through the real pump
    if (st.phase === 'gameEnd') break;
    const seat = CC.engine.actor(st);
    const isHumanTurn =
      (st.phase === 'roundEnd') ||
      (!st.players[seat].isAI) ||
      (st.pending && st.pending.type === 'passAll' &&
        st.pending.need[0] && st.pending.chosen[0] === undefined);
    if (isHumanTurn) {
      const a = CC.ai.decide(st); // drive the human seat with the same brain
      ok(a, `human-seat action exists (seed ${seed} phase ${st.phase})`);
      if (!a) return null;
      CC.ui.act(a);
    }
    steps++;
  }
  ok(st.phase === 'gameEnd', `game finished (seed ${seed}, steps ${steps})`);
  ok(elements.modalBox.innerHTML.indexOf('Commodore') >= 0, `victory modal shown (seed ${seed})`);
  return st;
}

for (let seed = 1; seed <= 8; seed++) {
  playSoloGame(seed * 77, 1 + (seed % 3) + 1);
}

// menu solo button wiring works
documentStub.getElementById('mName').value = 'Tester';
documentStub.getElementById('mTarget').value = '25';
documentStub.getElementById('mBots').value = '2';
(documentStub.getElementById('btnSolo').listeners.click || []).forEach(fn => fn());
drainTimers(200000);
ok(CC.ui.st && CC.ui.st.players.length === 3, 'solo button starts a 3-seat game');

console.log('ui smoke: full games via real UI layer completed');
if (failures) { console.error(failures + ' FAILURES'); process.exit(1); }
console.log('ALL PASS');
