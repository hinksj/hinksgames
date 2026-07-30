'use strict';

// Synthesized sound — no audio files, just WebAudio. Guarded everywhere so the
// game runs silent (and headless tests run clean) if audio is unavailable.
W.Sound = {
  ctx: null,
  on: true,
  _last: {},

  init() {
    try { this.on = localStorage.getItem('windward_sound') !== 'off'; } catch (e) { this.on = true; }
  },

  toggle() {
    this.on = !this.on;
    try { localStorage.setItem('windward_sound', this.on ? 'on' : 'off'); } catch (e) { /* ignore */ }
    if (this.on) this.play('bell');
    return this.on;
  },

  ensure() {
    if (typeof AudioContext === 'undefined') return null;
    if (!this.ctx) {
      try { this.ctx = new AudioContext(); } catch (e) { return null; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  },

  _noise(len) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  },

  _env(gainNode, t0, peak, len) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(peak, t0 + 0.012);
    g.exponentialRampToValueAtTime(0.0001, t0 + len);
  },

  play(name) {
    if (!this.on) return;
    const now = performance.now();
    if (this._last[name] && now - this._last[name] < 90) return;
    this._last[name] = now;
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0.5;
    out.connect(ctx.destination);
    try { this['_' + name](ctx, t0, out); } catch (e) { /* a dud round */ }
  },

  _cannon(ctx, t0, out) {
    const n = this._noise(0.4);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(500, t0);
    f.frequency.exponentialRampToValueAtTime(90, t0 + 0.35);
    const g = ctx.createGain();
    this._env(g, t0, 0.8, 0.4);
    n.connect(f).connect(g).connect(out);
    n.start(t0);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(60, t0);
    o.frequency.exponentialRampToValueAtTime(38, t0 + 0.2);
    const og = ctx.createGain();
    this._env(og, t0, 0.5, 0.22);
    o.connect(og).connect(out);
    o.start(t0); o.stop(t0 + 0.25);
  },

  _splash(ctx, t0, out) {
    const n = this._noise(0.3);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 900;
    const g = ctx.createGain();
    this._env(g, t0, 0.25, 0.3);
    n.connect(f).connect(g).connect(out);
    n.start(t0);
  },

  _bell(ctx, t0, out) {
    [587, 880].forEach((hz, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = hz;
      const g = ctx.createGain();
      this._env(g, t0 + i * 0.02, 0.2 / (i + 1), 1.1);
      o.connect(g).connect(out);
      o.start(t0); o.stop(t0 + 1.2);
    });
  },

  _alarm(ctx, t0, out) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(220, t0);
    o.frequency.linearRampToValueAtTime(330, t0 + 0.15);
    o.frequency.linearRampToValueAtTime(220, t0 + 0.3);
    o.frequency.linearRampToValueAtTime(330, t0 + 0.45);
    const g = ctx.createGain();
    this._env(g, t0, 0.12, 0.55);
    o.connect(g).connect(out);
    o.start(t0); o.stop(t0 + 0.6);
  },

  _clash(ctx, t0, out) {
    for (let i = 0; i < 2; i++) {
      const n = this._noise(0.12);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 2800 + i * 900;
      f.Q.value = 6;
      const g = ctx.createGain();
      this._env(g, t0 + i * 0.09, 0.22, 0.13);
      n.connect(f).connect(g).connect(out);
      n.start(t0 + i * 0.09);
    }
  },

  _stingWin(ctx, t0, out) {
    [392, 494, 587, 784].forEach((hz, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = hz;
      const g = ctx.createGain();
      this._env(g, t0 + i * 0.13, 0.18, 0.5);
      o.connect(g).connect(out);
      o.start(t0 + i * 0.13); o.stop(t0 + i * 0.13 + 0.55);
    });
  },

  _stingLoss(ctx, t0, out) {
    [440, 415, 349, 294].forEach((hz, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = hz;
      const g = ctx.createGain();
      this._env(g, t0 + i * 0.17, 0.15, 0.6);
      o.connect(g).connect(out);
      o.start(t0 + i * 0.17); o.stop(t0 + i * 0.17 + 0.65);
    });
  },
};
