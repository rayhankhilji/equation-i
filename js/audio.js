// Equation I - synthesized sound: layered V6-style engine with shift cuts, start lights, impacts
window.EI = window.EI || {};
(function () {
  let ctx = null, master = null, muted = false;
  const engines = [];
  function ensure() {
    if (ctx) return true;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination); } catch (e) { ctx = null; return false; }
    return true;
  }
  function resume() { if (ensure() && ctx.state === 'suspended') ctx.resume(); }
  function makeDistortion(k) { const n = 4096, curve = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x)); } const ws = ctx.createWaveShaper(); ws.curve = curve; ws.oversample = '2x'; return ws; }
  function createEngine() {
    if (!ensure()) return null;
    const out = ctx.createGain(); out.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 1.2;
    const dist = makeDistortion(12);
    const mix = ctx.createGain(); mix.gain.value = 0.5;
    // harmonic stack: fundamental (saw), 2nd (square), 3rd (saw) and a sub for the low rumble
    const parts = [['sawtooth', 1, 0.5], ['square', 2, 0.22], ['sawtooth', 3, 0.16], ['triangle', 0.5, 0.35]].map(([type, mul, g]) => { const o = ctx.createOscillator(); o.type = type; const og = ctx.createGain(); og.gain.value = g; o.connect(og); og.connect(mix); o.start(); return { o, mul }; });
    // intake / turbo hiss: filtered noise
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource(); noise.buffer = nb; noise.loop = true; const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 2500; nf.Q.value = 0.7; const ng = ctx.createGain(); ng.gain.value = 0; noise.connect(nf); nf.connect(ng); ng.connect(out); noise.start();
    mix.connect(dist); dist.connect(lp); lp.connect(out); out.connect(master);
    const e = { parts, lp, out, ng, noise, lastGear: 0, cutUntil: 0 };
    engines.push(e); return e;
  }
  function setEngine(e, rpm, throttle, vol, gear) {
    if (!e || !ctx) return;
    const t = ctx.currentTime;
    // base frequency follows rpm (4000..12500) with a slight wobble at idle
    const f = 48 + rpm * 230;
    for (const p of e.parts) p.o.frequency.setTargetAtTime(f * p.mul, t, 0.015);
    // gear shift: short ignition cut
    if (gear != null && gear !== e.lastGear && gear > e.lastGear && gear > 1) { e.cutUntil = t + 0.07; }
    if (gear != null) e.lastGear = gear;
    const cut = t < e.cutUntil ? 0.25 : 1;
    e.lp.frequency.setTargetAtTime((700 + rpm * 2600 + throttle * 900) * cut, t, 0.03);
    e.out.gain.setTargetAtTime((0.1 + rpm * 0.16 + throttle * 0.08) * vol * cut, t, 0.04);
    e.ng.gain.setTargetAtTime((0.01 + throttle * 0.05 * rpm) * vol, t, 0.05);
  }
  function beep(freq, dur, vol, type) {
    if (!ensure()) return;
    const o = ctx.createOscillator(); o.type = type || 'square'; o.frequency.value = freq; const g = ctx.createGain(); g.gain.value = vol || 0.3; o.connect(g); g.connect(master);
    const t = ctx.currentTime; o.start(t); g.gain.setValueAtTime(vol || 0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.stop(t + dur + 0.02);
  }
  function thud(strength) {
    if (!ensure()) return;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.18, ctx.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.5);
    const s = ctx.createBufferSource(); s.buffer = buf; const g = ctx.createGain(); g.gain.value = Math.min(0.9, 0.25 + strength * 0.6); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 350; s.connect(lp); lp.connect(g); g.connect(master); s.start();
  }
  function pop() {
    if (!ensure()) return; const buf = ctx.createBuffer(1, ctx.sampleRate * 0.07, ctx.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.5);
    const s = ctx.createBufferSource(); s.buffer = buf; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 260 + Math.random() * 200; bp.Q.value = 1.2; const g = ctx.createGain(); g.gain.value = 0.35; s.connect(bp); bp.connect(g); g.connect(master); s.start();
  }
  function clack() { beep(1800, 0.03, 0.12, 'square'); setTimeout(() => beep(900, 0.04, 0.1, 'square'), 25); }
  // soft sine chime: notes [[freq, delay s], ...] with a quick attack and ~0.16 s decay
  function chime(notes, vol) {
    if (!ensure()) return; const t = ctx.currentTime;
    for (const [f, d] of notes) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = ctx.createGain(); const t0 = t + d;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.17);
      o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 0.2);
    }
  }
  // DRS cues: rising two-note chime when the flap opens, falling when it closes, a double pip when DRS is armed at detection
  function drs(open) { chime(open ? [[880, 0], [1320, 0.07]] : [[990, 0], [660, 0.07]], 0.07); }
  function drsArmed() { chime([[1175, 0], [1175, 0.11]], 0.05); }
  function toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.5; return muted; }
  function stopAll() { for (const e of engines) { try { e.parts.forEach(p => p.o.stop()); e.noise.stop(); } catch (err) { } } engines.length = 0; }
  EI.Audio = { resume, createEngine, setEngine, beep, thud, pop, clack, drs, drsArmed, toggleMute, stopAll, get muted() { return muted; } };
})();
