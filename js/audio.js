// Equation I - tiny synthesized sound: engines, start lights, impacts
window.EI = window.EI || {};
(function () {
  let ctx = null, master = null, muted = false;
  const engines = [];
  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination);
    } catch (e) { ctx = null; return false; }
    return true;
  }
  function resume() { if (ensure() && ctx.state === 'suspended') ctx.resume(); }
  function createEngine() {
    if (!ensure()) return null;
    const g = ctx.createGain(); g.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200; lp.Q.value = 2;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; const o2 = ctx.createOscillator(); o2.type = 'square';
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(master);
    o1.start(); o2.start();
    const e = { o1, o2, lp, g, rpm: 0.1, vol: 0 };
    engines.push(e); return e;
  }
  function setEngine(e, rpm, throttle, vol) {
    if (!e || !ctx) return;
    const f = 55 + rpm * 420; // Hz
    const t = ctx.currentTime;
    e.o1.frequency.setTargetAtTime(f, t, 0.02); e.o2.frequency.setTargetAtTime(f * 0.5 + 1, t, 0.02);
    e.lp.frequency.setTargetAtTime(500 + rpm * 2600 + throttle * 800, t, 0.03);
    e.g.gain.setTargetAtTime((0.08 + rpm * 0.14 + throttle * 0.06) * vol, t, 0.05);
  }
  function beep(freq, dur, vol, type) {
    if (!ensure()) return;
    const o = ctx.createOscillator(); o.type = type || 'square'; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = vol || 0.3; o.connect(g); g.connect(master);
    const t = ctx.currentTime; o.start(t); g.gain.setValueAtTime(vol || 0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.stop(t + dur + 0.02);
  }
  function thud(strength) {
    if (!ensure()) return;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const s = ctx.createBufferSource(); s.buffer = buf; const g = ctx.createGain(); g.gain.value = Math.min(0.8, 0.2 + strength * 0.5);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; s.connect(lp); lp.connect(g); g.connect(master); s.start();
  }
  function toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.5; return muted; }
  function stopAll() { for (const e of engines) { try { e.o1.stop(); e.o2.stop(); } catch (err) { } } engines.length = 0; }
  EI.Audio = { resume, createEngine, setEngine, beep, thud, toggleMute, stopAll, get muted() { return muted; } };
})();
