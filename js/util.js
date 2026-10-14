// Equation I - small helpers shared by every module
window.EI = window.EI || {};
(function () {
  const U = {};
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.smoothstep = (a, b, x) => { const t = U.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  U.wrapAngle = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  U.sign = (v) => (v < 0 ? -1 : 1);
  U.mod = (a, n) => ((a % n) + n) % n;
  // deterministic PRNG so grids and bot personalities are reproducible per seed
  U.rng = function (seed) {
    let s = seed >>> 0 || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  };
  U.fmtTime = function (t, blank) {
    if (t == null || !isFinite(t) || t < 0) return blank || '--:--.---';
    const m = Math.floor(t / 60); const s = t - m * 60;
    return (m > 0 ? m + ':' : '') + (m > 0 && s < 10 ? '0' : '') + s.toFixed(3);
  };
  U.fmtGap = (t) => (t < 0.0005 ? '' : '+' + t.toFixed(3));
  U.ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  U.hex = (c) => '#' + ('000000' + (c >>> 0).toString(16)).slice(-6);
  U.mixHex = function (a, b, t) {
    const ca = new THREE.Color(a), cb = new THREE.Color(b); ca.lerp(cb, t); return ca.getHex();
  };
  // noise canvas texture (asphalt / grass)
  U.noiseTexture = function (size, base, variance, repeat, opts) {
    opts = opts || {};
    const c = document.createElement('canvas'); c.width = c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const d = img.data; const r = U.rng(opts.seed || 7);
    const b = new THREE.Color(base);
    for (let i = 0; i < size * size; i++) {
      const n = (r() - 0.5) * 2 * variance;
      d[i * 4] = U.clamp((b.r + n) * 255, 0, 255);
      d[i * 4 + 1] = U.clamp((b.g + n * (opts.gMul || 1)) * 255, 0, 255);
      d[i * 4 + 2] = U.clamp((b.b + n) * 255, 0, 255);
      d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    if (opts.blur) { ctx.filter = 'blur(' + opts.blur + 'px)'; ctx.drawImage(c, 0, 0); ctx.filter = 'none'; }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
    tex.anisotropy = 4;
    return tex;
  };
  // text texture for boards / signs
  U.textTexture = function (text, opts) {
    opts = opts || {};
    const w = opts.w || 512, h = opts.h || 128;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = opts.bg || '#ffffff'; ctx.fillRect(0, 0, w, h);
    if (opts.stripe) { ctx.fillStyle = opts.stripe; ctx.fillRect(0, 0, w, h * 0.12); ctx.fillRect(0, h * 0.88, w, h * 0.12); }
    ctx.fillStyle = opts.color || '#111';
    ctx.font = (opts.weight || '900') + ' ' + (opts.size || h * 0.5) + 'px ' + (opts.font || 'Arial Black, Arial, sans-serif');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + (opts.dy || 0));
    const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4; return tex;
  };
  // point-in-polygon (xz)
  U.pointInPoly = function (x, z, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  };
  U.polyArea = function (poly) {
    let a = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2;
  };
  U.polyBounds = function (poly) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of poly) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1]; }
    return { x0, x1, z0, z1 };
  };
  U.isTouch = () => ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  EI.U = U;
})();
