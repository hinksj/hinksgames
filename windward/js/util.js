'use strict';
// Global namespace. Works in the browser and in the node smoke-test harness.
var W = (typeof window !== 'undefined') ? (window.W = {}) : (globalThis.W = {});

W.TILE = 34; // px per ship tile

W.rand = (a, b) => a + Math.random() * (b - a);
W.randi = (a, b) => Math.floor(W.rand(a, b + 1));
W.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
W.chance = (p) => Math.random() < p;
W.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
W.lerp = (a, b, t) => a + (b - a) * t;
W.uid = (() => { let n = 1; return () => n++; })();

// Floating combat text, consumed by the renderer.
W.fx = [];
W.addFx = (x, y, text, color) => { W.fx.push({ x, y, text, color: color || '#fff', t: 0 }); };

// Particles (debris bursts, smoke, splashes) and expanding rings (ward ripples).
// Simulated and drawn by the renderer; safe to spawn from headless code.
W.parts = [];
W.burst = (x, y, color, n, speed, life, size) => {
  n = n || 8; speed = speed || 70; life = life || 0.5; size = size || 2.5;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = W.rand(0.3, 1) * speed;
    W.parts.push({
      type: 'dot', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.25,
      age: 0, life: life * W.rand(0.6, 1.2), size: size * W.rand(0.7, 1.3), color,
    });
  }
  if (W.parts.length > 400) W.parts.splice(0, W.parts.length - 400);
};
W.ripple = (x, y, color, r0) => {
  W.parts.push({ type: 'ring', x, y, age: 0, life: 0.45, r0: r0 || 22, color });
};
// sprite explosion, drawn by the renderer if the sprite pack is loaded
W.boom = (x, y, size) => {
  W.parts.push({ type: 'boom', x, y, age: 0, life: 0.4, size: size || 36 });
};

W.shake = 0;      // screen shake magnitude
W.paused = false; // sim pause (orders still accepted)
W.state = { mode: 'title', gold: 0 };
