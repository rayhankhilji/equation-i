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
// ---- value noise (2D), used for terrain, clouds and textures
(function () {
  const U = EI.U;
  const P = new Uint8Array(512); const r = U.rng(1234);
  const perm = []; for (let i = 0; i < 256; i++) perm.push(i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) P[i] = perm[i & 255];
  const hash = (x, y) => P[(P[x & 255] + y) & 255] / 255;
  U.noise2 = function (x, y) {
    const xi = Math.floor(x), yi = Math.floor(y); const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return U.lerp(U.lerp(a, b, u), U.lerp(c, d, u), v);
  };
  U.fbm = function (x, y, oct, lac, gain) {
    let a = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < (oct || 4); i++) { a += U.noise2(x * f, y * f) * amp; norm += amp; amp *= (gain || 0.5); f *= (lac || 2); }
    return a / norm;
  };
  // cheap cube env map: sky above, ground below, used for car reflections
  U.makeEnvMap = function () {
    const faces = [];
    const mk = (top, bottom) => {
      const c = document.createElement('canvas'); c.width = c.height = 64; const ctx = c.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, top); g.addColorStop(1, bottom); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); return c;
    };
    const side = () => mk('#cfe0f2', '#4a5a3a');
    faces.push(side(), side(), mk('#eef4fa', '#b9d2ec'), mk('#3a4a2e', '#2d3a24'), side(), side());
    const tex = new THREE.CubeTexture(faces); tex.needsUpdate = true; return tex;
  };
})();
// ---- PBR helpers: procedural normal maps, sRGB tagging
(function () {
  const U = EI.U;
  U.srgb = function (tex) { tex.encoding = THREE.sRGBEncoding; return tex; };
  // normal map from fractal noise height field; strength in texel units
  U.normalTexture = function (size, scale, strength, repeat, seed) {
    const c = document.createElement('canvas'); c.width = c.height = size; const ctx = c.getContext('2d'); const img = ctx.createImageData(size, size); const d = img.data;
    const h = new Float32Array(size * size); const s0 = seed || 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      // tileable fbm by 4-corner blend
      const fx = x / size, fy = y / size, T = scale;
      const n = (u, v) => U.fbm(u + s0, v + s0 * 1.7, 5, 2.1, 0.55);
      h[y * size + x] = n(fx * T, fy * T) * (1 - fx) * (1 - fy) + n(fx * T - T, fy * T) * fx * (1 - fy) + n(fx * T, fy * T - T) * (1 - fx) * fy + n(fx * T - T, fy * T - T) * fx * fy;
    }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)], u = h[((y - 1 + size) % size) * size + x], dn = h[((y + 1) % size) * size + x];
      let nx = (l - r) * strength, ny = (u - dn) * strength, nz = 1; const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat, repeat); tex.anisotropy = 4; return tex;
  };
  // grain texture with a little colour variation (asphalt / concrete / gravel)
  U.grainTexture = function (size, base, variance, repeat, seed, speckle) {
    const c = document.createElement('canvas'); c.width = c.height = size; const ctx = c.getContext('2d'); const img = ctx.createImageData(size, size); const d = img.data; const r = U.rng(seed || 9);
    const b = new THREE.Color(base);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const n = (r() - 0.5) * 2 * variance + (U.fbm(x / 37 + seed, y / 37 + seed, 3) - 0.5) * variance; const i = (y * size + x) * 4;
      let rr = b.r + n, gg = b.g + n, bb = b.b + n;
      if (speckle && r() < speckle) { const s = 0.25 + r() * 0.4; rr = s; gg = s; bb = s * 1.05; }
      d[i] = U.clamp(rr * 255, 0, 255); d[i + 1] = U.clamp(gg * 255, 0, 255); d[i + 2] = U.clamp(bb * 255, 0, 255); d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat, repeat); tex.anisotropy = 8; return tex;
  };
})();
