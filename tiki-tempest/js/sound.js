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

  // ---------- generative soundtrack: island exotica — marimba calypso ----------
  var music = { on: true, timer: null, nextT: 0, barIdx: 0, bus: null };
  try { music.on = localStorage.getItem('tt-music') !== '0'; } catch (e) {}
  function midiFreq(n) { return 440 * Math.pow(2, (n - 69) / 12); }
  var PROG = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]]; // C Am F G
  var SPB = 60 / 96;
  var PATTERN = [0, 1.5, 2, 2.5, 3.5]; // syncopated calypso hits (in beats)
  function mbus() {
    if (!music.bus) {
      music.bus = ctx.createGain();
      music.bus.gain.value = 0.5;
      music.bus.connect(ctx.destination);
    }
    return music.bus;
  }
  function marimba(freq, t) {
    [1, 2].forEach(function (h, i) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq * h;
      var v = i === 0 ? 0.05 : 0.015;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g); g.connect(mbus());
      o.start(t); o.stop(t + 0.55);
    });
  }
  function shaker(t, vol) {
    var len = Math.floor(ctx.sampleRate * 0.05);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource(); src.buffer = buf;
    var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 8000; f.Q.value = 1.5;
    var g = ctx.createGain(); g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(f); f.connect(g); g.connect(mbus());
    src.start(t); src.stop(t + 0.06);
  }
  function conga(freq, t) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.7, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(mbus());
    o.start(t); o.stop(t + 0.2);
  }
  function scheduleBar(t, chord, barIdx) {
    PATTERN.forEach(function (beat, i) {
      var note = chord[(i + barIdx) % 3] + (i % 2 === 1 ? 12 : 0);
      marimba(midiFreq(note), t + beat * SPB);
    });
    for (var e = 0; e < 8; e++) shaker(t + e * SPB / 2, e % 2 ? 0.012 : 0.02);
    conga(180, t);
    conga(140, t + 2.5 * SPB);
    if (barIdx % 4 === 3) marimba(midiFreq(chord[0] + 24), t + 3.75 * SPB);
  }
  function musicTick() {
    if (!music.on || !ctx) return;
    var horizon = ctx.currentTime + 1.4;
    if (music.nextT < ctx.currentTime) music.nextT = ctx.currentTime + 0.1;
    while (music.nextT < horizon) {
      scheduleBar(music.nextT, PROG[music.barIdx % PROG.length], music.barIdx);
      music.nextT += SPB * 4;
      music.barIdx++;
    }
    music.timer = setTimeout(musicTick, 350);
  }
  // uploaded soundtrack (assets/music/playlist.js) takes over from the synth
  var audio = null, trackOrder = null, trackIdx = -1;
  function playlist() {
    return (G.PLAYLIST && G.PLAYLIST.length) ? G.PLAYLIST : null;
  }
  function startTracks() {
    var pl = playlist();
    if (!pl || typeof Audio === 'undefined') return false;
    if (!audio) {
      audio = new Audio();
      audio.volume = 0.45;
      audio.addEventListener('ended', function () { nextTrack(); });
    }
    if (!trackOrder || trackOrder.length !== pl.length) {
      trackOrder = pl.map(function (_, i) { return i; });
      for (var i = trackOrder.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = trackOrder[i]; trackOrder[i] = trackOrder[j]; trackOrder[j] = t;
      }
      trackIdx = 0;
    }
    var tr = pl[trackOrder[trackIdx % trackOrder.length]];
    var src = tr.file || tr;
    if (audio.src.indexOf(src) < 0) audio.src = src;
    audio.play().catch(function () {});
    G.music.nowPlaying = tr.title || String(src).split('/').pop();
    return true;
  }
  function nextTrack() {
    if (!playlist()) return;
    trackIdx++;
    if (audio) audio.src = '';
    startTracks();
  }
  function startMusic() {
    if (startTracks()) return; // uploaded soundtrack wins
    if (!ensureCtx() || music.timer) return;
    musicTick();
  }
  function stopMusic() {
    if (music.timer) { clearTimeout(music.timer); music.timer = null; }
    if (music.bus) { music.bus.gain.value = 0; music.bus = null; }
    if (audio) audio.pause();
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('click', function () { if (music.on) startMusic(); });
  }
  G.music = {
    toggle: function () {
      music.on = !music.on;
      try { localStorage.setItem('tt-music', music.on ? '1' : '0'); } catch (e) {}
      if (music.on) startMusic(); else stopMusic();
      return music.on;
    },
    isOn: function () { return music.on; },
    next: function () { if (music.on) nextTrack(); },
    hasTracks: function () { return !!playlist(); }
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
