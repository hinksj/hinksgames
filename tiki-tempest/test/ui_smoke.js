// Full-stack headless test: loads all modules with a DOM shim and plays
// complete solo games through the real UI layer. Run: node test/ui_smoke.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = ['data.js', 'sound.js', 'engine-classic.js', 'engine-draft.js', 'ai-classic.js', 'ai-draft.js', 'net.js', 'ui.js', 'tour.js', 'main.js'];

function makeEl() {
  const el = {
    style: {}, dataset: {}, children: [], value: '', selected: false,
    className: '', innerHTML: '', textContent: '', title: '', disabled: false,
    scrollTop: 0, scrollHeight: 0, listeners: {},
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
const TT = ctx.TT;

let failures = 0;
function ok(cond, msg) { if (!cond) { failures++; console.error('FAIL: ' + msg); } }
function drainTimers(limit) {
  let n = 0;
  while (timers.length && n < limit) { timers.shift()(); n++; }
  return n;
}

function playSoloGame(seed, bots, mode) {
  const names = [{ name: 'Human', isAI: false }];
  for (let i = 0; i < bots; i++) names.push({ name: 'Bot' + i, isAI: true });
  const eng = mode === 'draft' ? TT.engineDraft : TT.engineClassic;
  const st = eng.newGame({ names, rounds: 2, seed });
  TT.ui.begin(st, 0, {});
  const brain = mode === 'draft' ? TT.aiDraft : TT.aiClassic;
  let steps = 0;
  while (st.phase !== 'gameEnd' && steps < 60000) {
    drainTimers(50);
    if (st.phase === 'gameEnd') break;
    const eng2 = mode === 'draft' ? TT.engineDraft : TT.engineClassic;
    const seat = eng2.actor(st);
    const isHumanTurn =
      (st.phase === 'roundEnd') || (!st.players[seat].isAI) ||
      (mode === 'draft' && st.phase === 'pick' && st.players[0].hand.length &&
        st.picks[0] === undefined) ||
      (st.pending && st.pending.type === 'passAll' &&
        st.pending.need[0] && st.pending.chosen[0] === undefined);
    if (isHumanTurn) {
      let a = brain.decide(st);
      if (mode === 'draft' && st.phase === 'pick' && !st.pending &&
          st.players[0].hand.length && st.picks[0] === undefined) {
        a = { t: 'pick', seat: 0, card: st.players[0].hand[0] };
      }
      ok(a, `human-seat action exists (seed ${seed} phase ${st.phase})`);
      if (!a) return null;
      TT.ui.act(a);
    }
    steps++;
  }
  ok(st.phase === 'gameEnd', `game finished (seed ${seed}, steps ${steps})`);
  ok(elements.modalBox.innerHTML.indexOf('Master Mixologist') >= 0, `victory modal (seed ${seed})`);
  return st;
}

for (let seed = 1; seed <= 5; seed++) {
  playSoloGame(seed * 77, 1 + (seed % 3) + 1, 'draft');
  playSoloGame(seed * 79, 1 + (seed % 3) + 1, 'classic');
}

documentStub.getElementById('mName').value = 'Tester';
documentStub.getElementById('mRounds').value = '1';
documentStub.getElementById('mBots').value = '2';
(documentStub.getElementById('btnSolo').listeners.click || []).forEach(fn => fn());
drainTimers(200000);
ok(TT.ui.st && TT.ui.st.players.length === 3, 'solo button starts a 3-seat game');

console.log('ui smoke: full games via real UI layer completed');
if (failures) { console.error(failures + ' FAILURES'); process.exit(1); }
console.log('ALL PASS');
