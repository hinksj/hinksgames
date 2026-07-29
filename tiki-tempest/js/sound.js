// COMMODORE CUP — synthesized sound effects (WebAudio, no assets).
// Everything is generated: little synth plucks, arpeggios and noise swishes
// in keeping with the 1980s synthwave look. CC.sound.play(name).
(function (G) {
  'use strict';
  var AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
  var ctx = null, muted = false;
  try { muted = localStorage.getItem('tt-muted') === '1'; } catch (e) {}

  function ensureCtx() {
    if (!AC) return null;
    if (!ctx) { try { ctx = new AC(); } catch (e) { return null; } }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // one oscillator note: freq (Hz), start offset (s), dur (s)
  function tone(freq, at, dur, type, vol, slideTo) {
    var c = ctx, t0 = c.currentTime + at;
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.08, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  // filtered noise burst: card handling sounds
  function noise(at, dur, freq, vol) {
    var c = ctx, t0 = c.currentTime + at;
    var len = Math.max(1, Math.floor(c.sampleRate * dur));
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var src = c.createBufferSource(); src.buffer = buf;
    var f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    var g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(t0); src.stop(t0 + dur);
  }

  var FX = {
    draw:    function () { noise(0, 0.09, 2400, 0.05); },
    discard: function () { noise(0, 0.06, 1200, 0.06); tone(220, 0, 0.05, 'sine', 0.04); },
    pluck:   function () { tone(523, 0, 0.12, 'triangle', 0.07); },
    meld:    function () { [523, 659, 784].forEach(function (f, i) { tone(f, i * 0.07, 0.18, 'sawtooth', 0.045); }); },
    special: function () { tone(880, 0, 0.22, 'square', 0.035, 1760); tone(1320, 0.08, 0.18, 'sine', 0.05); },
    good:    function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.09, 0.22, 'triangle', 0.06); }); },
    bad:     function () { tone(220, 0, 0.28, 'sawtooth', 0.06, 180); tone(165, 0.26, 0.42, 'sawtooth', 0.06, 124); },
    alert:   function () { tone(880, 0, 0.09, 'sine', 0.08); tone(880, 0.14, 0.09, 'sine', 0.08); },
    turn:    function () { tone(660, 0, 0.4, 'sine', 0.06); tone(1320, 0, 0.3, 'sine', 0.02); },
    skip:    function () { tone(330, 0, 0.2, 'sawtooth', 0.05, 262); },
    round:   function () { [392, 523, 659].forEach(function (f, i) { tone(f, i * 0.11, 0.35, 'triangle', 0.06); }); },
    fanfare: function () {
      [523, 659, 784, 1047, 784, 1047].forEach(function (f, i) { tone(f, i * 0.14, 0.3, 'sawtooth', 0.05); });
      [262, 330, 392, 523, 392, 523].forEach(function (f, i) { tone(f, i * 0.14, 0.3, 'triangle', 0.05); });
    }
  };

  var lastPlayed = {};
  G.sound = {
    play: function (name) {
      if (muted || !FX[name] || !ensureCtx()) return;
      var now = Date.now();
      if (lastPlayed[name] && now - lastPlayed[name] < 150) return; // debounce bursts
      lastPlayed[name] = now;
      try { FX[name](); } catch (e) {}
    },
    toggle: function () {
      muted = !muted;
      try { localStorage.setItem('tt-muted', muted ? '1' : '0'); } catch (e) {}
      return muted;
    },
    isMuted: function () { return muted; }
  };
}(typeof window !== 'undefined' ? (window.TT = window.TT || {}) : (module.exports = {})));
