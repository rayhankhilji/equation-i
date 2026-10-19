// Equation I - performance readout (F key, or Settings > Perf overlay): frame rate, frame time (average and 1 % high), CPU time
// per part of the frame, GPU time per frame (where the browser exposes WebGL timer queries), input-to-frame latency, and the
// draw-call / triangle count and resolution. main.js marks the parts of its frame (EI.Perf.begin / to / push / pop / end); all of
// it is a few performance.now() calls a frame, and the text is rewritten twice a second (one DOM write), only while it is shown.
window.EI = window.EI || {};
(function () {
  const N = 600, ft = new Float32Array(N), srt = new Float32Array(N); let fi = 0, fc = 0, last = 0;   // frame intervals (ms), last 600
  // CPU parts of the frame (main.js names them): exclusive time, so a nested part (the shadow pass inside a view) is not counted twice
  const PARTS = ['sim', 'cars', 'cam', 'mirror', 'hud', 'scenery', 'shadow', 'draw', 'post', 'other'];
  const LABEL = { sim: 'sim', cars: 'cars', cam: 'cam', mirror: 'mirr', hud: 'hud', scenery: 'scen', shadow: 'shad', draw: 'draw', post: 'post', other: 'misc' };
  const acc = {}, win = {}; for (const p of PARTS) { acc[p] = 0; win[p] = 0; }
  const stack = []; let tMark = 0, tBegin = 0, inFrame = false, winFrames = 0, winCpu = 0, winT = 0;
  let el = null, shown = false, collecting = false;
  const stats = { fps: 0, avg: 0, p99: 0, max: 0, cpu: 0, parts: {}, gpu: -1, lat: -1, latLast: -1, latIn: -1, latCpu: -1, latGpu: -1, calls: 0, tris: 0, res: '' };
  // GPU time: EXT_disjoint_timer_query_webgl2 around the whole frame (a few queries in flight, read when available)
  let gl = null, tq = null; const qFree = [], qBusy = []; let qOpen = null, gpuSum = 0, gpuN = 0;
  // input latency: an input event (key / pointer down or up) -> the frame that reads the input -> that frame submitted -> the GPU
  // done with it (a fence, polled from fresh tasks: WebGL updates a fence's status only between tasks). The display's scan-out
  // comes on top (up to one refresh with VSync; less with the low-latency canvas) and is not visible to the page.
  let pend = null; const lat = []; const LAT_N = 20;
  const mc = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
  function onInput(e) { if (!(shown || collecting) || pend || e.repeat) return; const t = e.timeStamp; pend = { t0: t > 0 && t <= performance.now() + 1 ? t : performance.now(), tIn: 0, tSub: 0, fence: null, until: 0 }; }
  ['keydown', 'keyup', 'pointerdown', 'pointerup'].forEach(ev => window.addEventListener(ev, onInput, { capture: true, passive: true }));
  function pollFence() {
    if (!pend || !pend.fence || !gl) return; const now = performance.now();
    let done = false; try { done = gl.getSyncParameter(pend.fence, gl.SYNC_STATUS) === gl.SIGNALED; } catch (e) { done = true; }
    if (!done && now < pend.until) { if (mc) mc.port1.postMessage(0); else setTimeout(pollFence, 0); return; }
    try { gl.deleteSync(pend.fence); } catch (e) { }
    if (done) { lat.push([now - pend.t0, pend.tIn - pend.t0, pend.tSub - pend.tIn, now - pend.tSub]); if (lat.length > LAT_N) lat.shift(); }
    pend = null;
  }
  if (mc) mc.port2.onmessage = pollFence;

  function ensureEl() {
    if (el) return el;
    el = document.createElement('pre'); el.id = 'perf-hud';
    // top centre, between the timing tower and the session panel (the start lights sit lower, the HUD panels are at the sides)
    el.style.cssText = 'position:fixed;left:50%;top:6px;transform:translateX(-50%);z-index:60;margin:0;padding:4px 7px;font:10px/1.3 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;' +
      'color:#e8edf2;background:rgba(8,10,14,0.66);border-radius:3px;pointer-events:none;white-space:pre;display:none;font-variant-numeric:tabular-nums';
    document.body.appendChild(el); return el;
  }
  function setShown(v) {
    shown = !!v; ensureEl().style.display = shown ? 'block' : 'none'; try { localStorage.setItem('ei-perf', shown ? '1' : '0'); } catch (e) { }
    const sel = document.getElementById('opt-perf'); if (sel) sel.value = shown ? 'on' : 'off'; winT = 0;
    if (!shown && !collecting) { pend = null; closeQuery(); }
  }
  // the timer query pool (only while the readout is shown or a profiler collects)
  function closeQuery() { if (qOpen && gl && tq) { gl.endQuery(tq.TIME_ELAPSED_EXT); qBusy.push(qOpen); qOpen = null; } }
  function readQueries() {
    if (!tq) return; const disjoint = gl.getParameter(tq.GPU_DISJOINT_EXT);
    while (qBusy.length) {
      const q = qBusy[0]; if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break; qBusy.shift();
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT); if (!disjoint) { gpuSum += ns / 1e6; gpuN++; } qFree.push(q);
    }
  }

  const P = {
    get shown() { return shown; }, toggle() { setShown(!shown); }, setShown, PARTS, stats,
    // profilers (swarm tools) can collect without showing the readout; sync() (when set) runs at every part boundary, so a
    // profiler can make each part include its GPU work (a 1-pixel readPixels)
    collect(v) { collecting = !!v; }, sync: null, onFrame: null,
    attach(renderer) {
      gl = renderer.getContext(); const isGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
      tq = isGL2 ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null; stats.gpu = tq ? 0 : -1;
      // the sun's shadow pass runs inside a view's render: wrap it, so it shows as its own part
      const sm = renderer.shadowMap, orig = sm.render; sm.render = function () { P.push('shadow'); try { return orig.apply(this, arguments); } finally { P.pop(); } };
      let on = false; try { on = localStorage.getItem('ei-perf') === '1'; } catch (e) { } if (on) setShown(true);
      const sel = document.getElementById('opt-perf'); if (sel) { sel.value = shown ? 'on' : 'off'; sel.addEventListener('change', () => setShown(sel.value === 'on')); }
    },
    begin(now) {
      if (last) { const d = now - last; if (d > 0 && d < 1000) { ft[fi] = d; fi = (fi + 1) % N; if (fc < N) fc++; } } last = now;
      if (inFrame) closeQuery();   // the last frame returned early (loading)
      inFrame = shown || collecting; if (!inFrame) return;
      tBegin = tMark = performance.now(); stack.length = 0; stack.push('other');
      if (tq && !qOpen) { readQueries(); const q = qFree.pop() || gl.createQuery(); if (qBusy.length < 6) { gl.beginQuery(tq.TIME_ELAPSED_EXT, q); qOpen = q; } else qFree.push(q); }
    },
    // the frame's input has just been read
    inputRead() { if (pend && !pend.tIn) pend.tIn = performance.now(); },
    _mark() { if (P.sync) P.sync(stack[stack.length - 1]); const t = performance.now(); acc[stack[stack.length - 1]] += t - tMark; tMark = t; },
    to(part) { if (!inFrame) return; P._mark(); stack[stack.length - 1] = part; },
    push(part) { if (!inFrame) return; P._mark(); stack.push(part); },
    pop() { if (!inFrame || stack.length < 2) return; P._mark(); stack.pop(); },
    end(renderer, res) {
      if (!inFrame) return; P._mark(); inFrame = false; const t = performance.now();
      if (qOpen) closeQuery();
      if (pend && pend.tIn && !pend.fence && gl && gl.fenceSync) { pend.tSub = t; pend.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush(); pend.until = t + 150; if (mc) mc.port1.postMessage(0); else setTimeout(pollFence, 0); }
      if (P.onFrame) P.onFrame(acc, t - tBegin);   // profilers: this frame's parts
      winCpu += t - tBegin; winFrames++; for (const p of PARTS) { win[p] += acc[p]; acc[p] = 0; }
      if (t - winT < 500) return; winT = t;
      // the window's summary: frame rate and frame times over the last ~2 s (at least 30 frames), CPU parts over the window
      const n = Math.min(fc, Math.max(30, Math.round(2000 / Math.max(1, stats.avg || 16.7)))); let s = 0, mx = 0;
      for (let k = 0; k < n; k++) { const v = ft[(fi - 1 - k + N) % N]; srt[k] = v; s += v; if (v > mx) mx = v; }
      const sub = srt.subarray(0, n); sub.sort(); stats.avg = n ? s / n : 0; stats.fps = stats.avg ? 1000 / stats.avg : 0; stats.max = mx;
      stats.p99 = n ? sub[Math.min(n - 1, Math.floor(n * 0.99))] : 0;
      stats.cpu = winFrames ? winCpu / winFrames : 0; for (const p of PARTS) { stats.parts[p] = winFrames ? win[p] / winFrames : 0; win[p] = 0; } winCpu = 0; winFrames = 0;
      if (tq) { readQueries(); if (gpuN) stats.gpu = gpuSum / gpuN; gpuSum = 0; gpuN = 0; }
      if (lat.length) { let a = 0, b = 0, c = 0, d = 0; for (const l of lat) { a += l[0]; b += l[1]; c += l[2]; d += l[3]; } const m = lat.length; stats.lat = a / m; stats.latIn = b / m; stats.latCpu = c / m; stats.latGpu = d / m; stats.latLast = lat[m - 1][0]; }
      if (renderer) { stats.calls = renderer.info.render.calls; stats.tris = renderer.info.render.triangles; } stats.res = typeof res === 'function' ? res() : (res || '');
      if (shown) draw();
    },
    latency: () => lat.slice(), frameTimes: () => { const o = []; for (let k = 0; k < fc; k++) o.push(ft[(fi - fc + k + N) % N]); return o; },
  };
  const f1 = (v) => v.toFixed(1);
  function draw() {
    const S = stats; let parts = '', n = 0; for (const p of PARTS) { const v = S.parts[p]; if (v >= 0.05) { parts += (n && n % 5 === 0 ? '\n  ' : ' ') + LABEL[p] + ' ' + f1(v); n++; } }
    el.textContent = Math.round(S.fps) + ' fps  ' + f1(S.avg) + ' ms  1% high ' + f1(S.p99) + ' ms\n' +
      'CPU ' + f1(S.cpu) + ' ms   GPU ' + (S.gpu < 0 ? 'n/a' : f1(S.gpu) + ' ms') + '\n ' + parts + '\n' +
      'input->frame ' + (S.lat < 0 ? '(press a key)' : f1(S.lat) + ' ms (CPU ' + f1(S.latCpu) + ' GPU ' + f1(S.latGpu) + ')') + '\n' +
      S.res + '  ' + S.calls + ' calls ' + (S.tris / 1e6).toFixed(2) + 'M';
  }
  EI.Perf = P;
})();
