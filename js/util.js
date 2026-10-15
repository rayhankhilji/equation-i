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
// ---- tileable procedural surface textures (asphalt, grass, gravel, track-wear aux). All DataTextures, power-of-two, wrap-safe.
(function () {
  const U = EI.U;
  // integer hash -> [0,1)
  const ih = (a, b, s) => { let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(s | 0, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  U.hash2i = ih;
  // value noise on an integer lattice that wraps every px / py cells (tileable)
  U.tileNoise = function (x, y, px, py, seed) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py, x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = ih(x0, y0, seed), b = ih(x1, y0, seed), c = ih(x0, y1, seed), d = ih(x1, y1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  // tileable fbm grid (w x h), base periods px/py cells over the whole tile, doubling each octave
  U.fbmGrid = function (w, h, px, py, oct, gain, seed) {
    const out = new Float32Array(w * h); let norm = 0, amp = 1;
    for (let o = 0; o < oct; o++) {
      const fx = px << o, fy = py << o;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] += U.tileNoise(x / w * fx, y / h * fy, fx, fy, seed + o * 31) * amp;
      norm += amp; amp *= gain;
    }
    for (let i = 0; i < out.length; i++) out[i] /= norm;
    return out;
  };
  // bilinear, wrapping resample of a w0 x h0 field to w1 x h1
  U.resample = function (src, w0, h0, w1, h1) {
    const out = new Float32Array(w1 * h1);
    for (let y = 0; y < h1; y++) {
      const fy = y / h1 * h0, yi = Math.floor(fy), ty = fy - yi, ya = yi % h0, yb = (yi + 1) % h0;
      for (let x = 0; x < w1; x++) {
        const fx = x / w1 * w0, xi = Math.floor(fx), tx = fx - xi, xa = xi % w0, xb = (xi + 1) % w0;
        const a = src[ya * w0 + xa], b = src[ya * w0 + xb], c = src[yb * w0 + xa], d = src[yb * w0 + xb];
        out[y * w1 + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
      }
    }
    return out;
  };
  // DataTexture with mipmaps, repeat wrapping and anisotropy; opts.srgb tags it as colour data
  U.dataTex = function (data, w, h, opts) {
    opts = opts || {};
    const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.anisotropy = opts.anisotropy || 8; if (opts.srgb) t.encoding = THREE.sRGBEncoding; t.needsUpdate = true; return t;
  };
  // tangent-space normal map from a wrapping height field (strength in height units per texel)
  U.heightToNormal = function (hf, size, strength) {
    const d = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      const ym = ((y - 1 + size) % size) * size, yp = ((y + 1) % size) * size, yr = y * size;
      for (let x = 0; x < size; x++) {
        const xm = (x - 1 + size) % size, xp = (x + 1) % size;
        let nx = (hf[yr + xm] - hf[yr + xp]) * strength, ny = (hf[yp + x] - hf[ym + x]) * strength; const l = Math.sqrt(nx * nx + ny * ny + 1); nx /= l; ny /= l;
        const i = (yr + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
      }
    }
    return U.dataTex(d, size, size);
  };
  // stamp a round blob into height / colour buffers with wrapping
  function stamp(size, cx, cy, r, fn) {
    const r2 = r * r, x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r), y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy, q = (dx * dx + dy * dy) / r2; if (q > 1) continue;
      fn((((y % size) + size) % size) * size + (((x % size) + size) % size), q);
    }
  }
  U.stamp = stamp;

  // asphalt: aggregate in a bitumen matrix. Returns { map (sRGB), normalMap, roughnessMap (G channel) }
  U.asphaltMaps = function (size, opts) {
    opts = opts || {}; const seed = opts.seed || 17; const r = U.rng(seed); const N = size * size;
    const base = opts.base || [104, 102, 97];          // sRGB matrix colour (pale, aged UK asphalt)
    const hgt = new Float32Array(N), rough = new Float32Array(N), cr = new Float32Array(N), cg = new Float32Array(N), cb = new Float32Array(N);
    // matrix tone: two scales of tileable fbm
    const lo = U.resample(U.fbmGrid(128, 128, 4, 4, 4, 0.55, seed), 128, 128, size, size);
    const mid = U.resample(U.fbmGrid(256, 256, 24, 24, 3, 0.5, seed + 7), 256, 256, size, size);
    for (let i = 0; i < N; i++) {
      const t = (lo[i] - 0.5) * 0.16 + (mid[i] - 0.5) * 0.22 + (r() - 0.5) * 0.18;
      cr[i] = base[0] * (1 + t); cg[i] = base[1] * (1 + t); cb[i] = base[2] * (1 + t * 0.95);
      hgt[i] = mid[i] * 0.35 + r() * 0.25; rough[i] = 0.9 + (r() - 0.5) * 0.08;
    }
    // aggregate: many small stones (light granite / grey / a few dark), larger ones sparser
    const stones = Math.round(N * (opts.density || 0.075));
    for (let k = 0; k < stones; k++) {
      const big = r() < 0.12; const rad = big ? 1.4 + r() * 2.2 : 0.6 + r() * 1.1; const x = r() * size, y = r() * size;
      const kind = r(); let sc;
      const B = (base[0] + base[1] + base[2]) / 3, ct = opts.contrast || 1;
      if (kind < 0.55) { const v = B * (1 + (0.25 + r() * 0.35) * ct); sc = [v * 1.02, v, v * 0.96]; }   // light grey granite
      else if (kind < 0.8) { const v = B * (1 + (0.08 + r() * 0.25) * ct); sc = [v * 1.06, v * 0.99, v * 0.9]; } // beige / buff
      else if (kind < 0.93) { const v = B * (1 - (0.25 + r() * 0.2) * ct); sc = [v, v, v * 1.02]; }      // dark basalt
      else { const v = B * (1 + (0.3 + r() * 0.3) * ct); sc = [v * 1.08, v * 0.95, v * 0.9]; }            // pinkish
      const hh = 0.6 + r() * 0.6, ro = 0.55 + r() * 0.2;
      stamp(size, x, y, rad, (i, q) => { const e = Math.sqrt(1 - q); const w = Math.min(1, e * 2.2); cr[i] += (sc[0] - cr[i]) * w; cg[i] += (sc[1] - cg[i]) * w; cb[i] += (sc[2] - cb[i]) * w; hgt[i] = Math.max(hgt[i], 0.3 + hh * e); rough[i] = Math.min(rough[i], ro + (1 - e) * 0.3); });
    }
    // fine hairline cracks (sparse, dark, slightly sunken)
    for (let k = 0; k < (opts.cracks != null ? opts.cracks : 6); k++) {
      let x = r() * size, y = r() * size, a = r() * 6.283; const len = 60 + r() * 220;
      for (let s = 0; s < len; s++) { a += (r() - 0.5) * 0.5; x += Math.cos(a); y += Math.sin(a);
        stamp(size, x, y, 0.8, (i) => { cr[i] *= 0.55; cg[i] *= 0.55; cb[i] *= 0.56; hgt[i] -= 0.4; rough[i] = 0.95; }); }
    }
    const cd = new Uint8Array(N * 4), rd = new Uint8Array(N * 4);
    for (let i = 0; i < N; i++) {
      cd[i * 4] = U.clamp(cr[i], 0, 255); cd[i * 4 + 1] = U.clamp(cg[i], 0, 255); cd[i * 4 + 2] = U.clamp(cb[i], 0, 255); cd[i * 4 + 3] = 255;
      const rv = U.clamp(rough[i] * 255, 0, 255); rd[i * 4] = rv; rd[i * 4 + 1] = rv; rd[i * 4 + 2] = rv; rd[i * 4 + 3] = 255;
    }
    return { map: U.dataTex(cd, size, size, { srgb: true }), normalMap: U.heightToNormal(hgt, size, opts.bump || 2.2), roughnessMap: U.dataTex(rd, size, size) };
  };

  // track wear / variation aux map (linear data): R = macro fbm patches, G = longitudinal streaks (vary slowly along v),
  // B = speckles (0.4..0.5 light grit, ~1 dark rubber marbles), A = sealed crack network
  U.trackAuxTexture = function (size, seed) {
    seed = seed || 5; const r = U.rng(seed); const N = size * size; const d = new Uint8Array(N * 4);
    const R = U.resample(U.fbmGrid(128, 128, 3, 3, 5, 0.55, seed), 128, 128, size, size);
    const gw = size, gh = 32; const G0 = new Float32Array(gw * gh);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const u = x / gw, v = y / gh;
      G0[y * gw + x] = 0.55 * U.tileNoise(u * 96, v * 4, 96, 4, seed + 1) + 0.3 * U.tileNoise(u * 240, v * 8, 240, 8, seed + 2) + 0.15 * U.tileNoise(u * 24, v * 2, 24, 2, seed + 3);
    }
    const G = U.resample(G0, gw, gh, size, size);
    const B = new Float32Array(N);
    for (let k = 0; k < N * 0.02; k++) { const dark = r() < 0.3; const val = dark ? 1 : 0.42 + r() * 0.06; stamp(size, r() * size, r() * size, 0.7 + r() * (dark ? 1.1 : 0.8), (i) => { B[i] = Math.max(B[i], val); }); }
    const A = new Float32Array(N);
    for (let k = 0; k < 22; k++) {
      let x = r() * size, y = r() * size, a = r() * 6.283; const len = 80 + r() * 380; const w = 0.7 + r() * 0.9;
      for (let s = 0; s < len; s++) { a += (r() - 0.5) * 0.35; x += Math.cos(a); y += Math.sin(a); stamp(size, x, y, w, (i, q) => { A[i] = Math.max(A[i], 1 - q * 0.6); });
        if (r() < 0.01) a += (r() < 0.5 ? 1 : -1) * (0.8 + r()); }
    }
    for (let i = 0; i < N; i++) { d[i * 4] = U.clamp(R[i] * 255, 0, 255); d[i * 4 + 1] = U.clamp((G[i] - 0.2) * 1.7 * 255, 0, 255); d[i * 4 + 2] = B[i] * 255; d[i * 4 + 3] = A[i] * 255; }
    return U.dataTex(d, size, size, { anisotropy: 4 });
  };

  // short-cut grass: blades over a soil-flecked base. { map (sRGB), normalMap }
  U.grassMaps = function (size, opts) {
    opts = opts || {}; const seed = opts.seed || 23; const r = U.rng(seed); const N = size * size;
    const base = opts.base || [74, 110, 48];
    const cr = new Float32Array(N), cg = new Float32Array(N), cb = new Float32Array(N), hgt = new Float32Array(N);
    const lo = U.resample(U.fbmGrid(64, 64, 4, 4, 4, 0.55, seed), 64, 64, size, size);
    for (let i = 0; i < N; i++) { const t = (lo[i] - 0.5) * 0.3 + (r() - 0.5) * 0.2; cr[i] = base[0] * (1 + t * 1.2); cg[i] = base[1] * (1 + t); cb[i] = base[2] * (1 + t * 0.8); hgt[i] = r() * 0.3; }
    const blades = Math.round(N * 0.22);
    for (let k = 0; k < blades; k++) {
      let x = r() * size, y = r() * size; const a = r() * 6.283, len = 2 + r() * 6; const dx = Math.cos(a), dy = Math.sin(a);
      const tone = 0.75 + r() * 0.55, yel = r() < 0.12 ? 1.25 : 1;
      for (let s = 0; s < len; s++) { const xi = (((x | 0) % size) + size) % size, yi = (((y | 0) % size) + size) % size; const i = yi * size + xi; const f = 0.7 + 0.3 * (s / len);
        cr[i] = base[0] * tone * f * yel; cg[i] = base[1] * tone * f * (yel > 1 ? 1.05 : 1); cb[i] = base[2] * tone * f * 0.9; hgt[i] = 0.4 + 0.6 * s / len; x += dx; y += dy; }
    }
    for (let k = 0; k < N * 0.004; k++) stamp(size, r() * size, r() * size, 0.6 + r() * 1.2, (i) => { cr[i] = 92 + r() * 20; cg[i] = 80 + r() * 15; cb[i] = 58; hgt[i] = 0; });
    const cd = new Uint8Array(N * 4); for (let i = 0; i < N; i++) { cd[i * 4] = U.clamp(cr[i], 0, 255); cd[i * 4 + 1] = U.clamp(cg[i], 0, 255); cd[i * 4 + 2] = U.clamp(cb[i], 0, 255); cd[i * 4 + 3] = 255; }
    return { map: U.dataTex(cd, size, size, { srgb: true }), normalMap: U.heightToNormal(hgt, size, opts.bump || 1.6) };
  };

  // raked gravel trap: rounded stones with rake grooves along v (the track direction). { map (sRGB), normalMap }
  U.gravelMaps = function (size, opts) {
    opts = opts || {}; const seed = opts.seed || 41; const r = U.rng(seed); const N = size * size; const ridges = opts.ridges || 24;
    const cr = new Float32Array(N), cg = new Float32Array(N), cb = new Float32Array(N), hgt = new Float32Array(N);
    const base = opts.base || [170, 156, 128];
    for (let i = 0; i < N; i++) { const t = (r() - 0.5) * 0.15; cr[i] = base[0] * 0.62 * (1 + t); cg[i] = base[1] * 0.62 * (1 + t); cb[i] = base[2] * 0.62 * (1 + t); }
    const stones = Math.round(N * 0.06);
    for (let k = 0; k < stones; k++) {
      const x = r() * size, y = r() * size, rad = 1.2 + r() * 2.6; const kind = r(); let sc;
      if (kind < 0.5) sc = [base[0], base[1], base[2]]; else if (kind < 0.75) sc = [base[0] * 1.12, base[1] * 1.1, base[2] * 1.08]; else if (kind < 0.92) sc = [base[0] * 0.8, base[1] * 0.74, base[2] * 0.66]; else sc = [base[0] * 0.62, base[1] * 0.62, base[2] * 0.66];
      const v = 0.85 + r() * 0.3;
      stamp(size, x, y, rad, (i, q) => { const e = Math.sqrt(1 - q); if (e * 1.2 + 0.2 < hgt[i]) return; const sh = 0.75 + 0.25 * e; cr[i] = sc[0] * v * sh; cg[i] = sc[1] * v * sh; cb[i] = sc[2] * v * sh; hgt[i] = e * 1.2 + 0.2; });
    }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x; const g = Math.sin(x / size * ridges * 6.2832); hgt[i] = hgt[i] * 0.55 + g * 0.9; const sh = 0.9 + 0.1 * g; cr[i] *= sh; cg[i] *= sh; cb[i] *= sh;
    }
    const cd = new Uint8Array(N * 4); for (let i = 0; i < N; i++) { cd[i * 4] = U.clamp(cr[i], 0, 255); cd[i * 4 + 1] = U.clamp(cg[i], 0, 255); cd[i * 4 + 2] = U.clamp(cb[i], 0, 255); cd[i * 4 + 3] = 255; }
    return { map: U.dataTex(cd, size, size, { srgb: true }), normalMap: U.heightToNormal(hgt, size, opts.bump || 1.4) };
  };
})();
// ---- gravel bed maps and geometry merging (track surfaces / draw-call batching)
(function () {
  const U = EI.U;
  // gravel trap bed: packed rounded stones (varied size, tone and warm beige-grey hue) over darker fines, with crevice occlusion.
  // Tileable. { map (sRGB), normalMap, roughnessMap (R = stone height 0..1, G = roughness), mean (linear rgb) }
  U.gravelBedMaps = function (size, opts) {
    opts = opts || {}; const seed = opts.seed || 41; const r = U.rng(seed); const N = size * size; const sc = size / 1024;
    const hgt = new Float32Array(N), cr = new Float32Array(N), cg = new Float32Array(N), cb = new Float32Array(N), rough = new Float32Array(N);
    const fines = opts.fines || [80, 73, 64];
    const lo = U.resample(U.fbmGrid(64, 64, 4, 4, 4, 0.55, seed), 64, 64, size, size);
    for (let i = 0; i < N; i++) { const t = (lo[i] - 0.5) * 0.3 + (r() - 0.5) * 0.35; cr[i] = fines[0] * (1 + t); cg[i] = fines[1] * (1 + t); cb[i] = fines[2] * (1 + t * 0.9); hgt[i] = r() * 0.05 + lo[i] * 0.08; rough[i] = 0.97; }
    // sRGB stone tones with weights: light grey-beige, grey, warm beige, dark grey-beige, off-white quartz, tan / brown, dark flint
    const PAL = opts.palette || [[150, 143, 131, 0.26], [131, 128, 123, 0.2], [160, 148, 129, 0.15], [108, 102, 94, 0.15], [182, 176, 165, 0.07], [132, 113, 92, 0.1], [84, 82, 79, 0.07]];
    const pick = () => { let x = r(); for (const p of PAL) { x -= p[3]; if (x <= 0) return p; } return PAL[0]; };
    const stone = (cx, cy, rx, ry, ang, top, base) => {
      const p = pick(); const v = 0.86 + r() * 0.26, warm = (r() - 0.5) * 0.06; const col = [p[0] * v * (1 + warm), p[1] * v, p[2] * v * (1 - warm)];
      const ro = 0.62 + r() * 0.22; const ca = Math.cos(ang), sa = Math.sin(ang); const R = Math.max(rx, ry);
      const x0 = Math.floor(cx - R), x1 = Math.ceil(cx + R), y0 = Math.floor(cy - R), y1 = Math.ceil(cy + R);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy; const u = (dx * ca + dy * sa) / rx, w = (-dx * sa + dy * ca) / ry; const q = u * u + w * w; if (q > 1) continue;
        const e = Math.sqrt(1 - q); const h = base + top * Math.pow(e, 0.6); const i = (((y % size) + size) % size) * size + (((x % size) + size) % size);
        if (h <= hgt[i]) continue;
        hgt[i] = h; const sh = (0.8 + 0.2 * e) * (1 + (r() - 0.5) * 0.07); cr[i] = col[0] * sh; cg[i] = col[1] * sh; cb[i] = col[2] * sh; rough[i] = ro + (1 - e) * 0.12;
      }
    };
    // [count per megapixel, rMin, rMax, base height range]
    const passes = [[30000, 1.0, 2.0, 0.05], [28000, 2.0, 3.6, 0.12], [30000, 3.2, 7.0, 0.3], [140, 9, 16, 0.25]];
    for (const [cnt, a, b, bh] of passes) {
      const nS = Math.round(cnt * N / 1048576);
      for (let k = 0; k < nS; k++) { const rad = (a + (b - a) * Math.pow(r(), 1.4)) * sc; const asp = 0.62 + r() * 0.38; stone(r() * size, r() * size, rad, rad * asp, r() * Math.PI, (0.35 + rad / sc * 0.08) * (0.8 + r() * 0.4), r() * bh); }
    }
    // crevice occlusion: darken pixels lying below their neighbourhood (separable wrapping box blur of the height field)
    const blur = (src, rad) => { const tmp = new Float32Array(N), out = new Float32Array(N); const k = 2 * rad + 1;
      for (let y = 0; y < size; y++) { let s = 0; for (let x = -rad; x <= rad; x++) s += src[y * size + ((x + size) % size)]; for (let x = 0; x < size; x++) { tmp[y * size + x] = s / k; s += src[y * size + ((x + rad + 1) % size)] - src[y * size + ((x - rad + size) % size)]; } }
      for (let x = 0; x < size; x++) { let s = 0; for (let y = -rad; y <= rad; y++) s += tmp[((y + size) % size) * size + x]; for (let y = 0; y < size; y++) { out[y * size + x] = s / k; s += tmp[((y + rad + 1) % size) * size + x] - tmp[((y - rad + size) % size) * size + x]; } }
      return out; };
    const bl = blur(hgt, Math.max(2, Math.round(5 * sc)));
    let hMax = 0; for (let i = 0; i < N; i++) hMax = Math.max(hMax, hgt[i]);
    const cd = new Uint8Array(N * 4), rd = new Uint8Array(N * 4); const mean = [0, 0, 0];
    for (let i = 0; i < N; i++) {
      const ao = U.clamp(1 - (bl[i] - hgt[i]) * 0.9, 0.5, 1.05);
      const R = U.clamp(cr[i] * ao, 0, 255), G = U.clamp(cg[i] * ao, 0, 255), B = U.clamp(cb[i] * ao, 0, 255);
      cd[i * 4] = R; cd[i * 4 + 1] = G; cd[i * 4 + 2] = B; cd[i * 4 + 3] = 255;
      mean[0] += Math.pow(R / 255, 2.2); mean[1] += Math.pow(G / 255, 2.2); mean[2] += Math.pow(B / 255, 2.2);
      rd[i * 4] = U.clamp(hgt[i] / hMax * 255, 0, 255); rd[i * 4 + 1] = U.clamp(rough[i] * 255, 0, 255); rd[i * 4 + 2] = 0; rd[i * 4 + 3] = 255;
    }
    return { map: U.dataTex(cd, size, size, { srgb: true }), normalMap: U.heightToNormal(hgt, size, (opts.bump || 2.6) / sc), roughnessMap: U.dataTex(rd, size, size), mean: mean.map(v => v / N) };
  };

  // merge geometries into one indexed BufferGeometry. items: [{ geo, matrix (Matrix4, optional) }]. Attributes are the union over all items
  // (missing ones filled with 0, colour with 1, normal with +Y); positions / normals are transformed by the item matrix.
  U.mergeGeometries = function (items) {
    const sizes = {}; let nv = 0, ni = 0;
    for (const it of items) { const g = it.geo; for (const k in g.attributes) if (!sizes[k]) sizes[k] = g.attributes[k].itemSize; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const out = {}; for (const k in sizes) out[k] = new Float32Array(nv * sizes[k]);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    const nm = new THREE.Matrix3(), v = new THREE.Vector3(); let ov = 0, oi = 0;
    for (const it of items) {
      const g = it.geo, n = g.attributes.position.count, M = it.matrix || null; if (M) nm.getNormalMatrix(M);
      for (const k in sizes) {
        const sz = sizes[k], dst = out[k], a = g.attributes[k];
        if (!a) { const def = k === 'color' ? 1 : 0; for (let i = 0; i < n * sz; i++) dst[ov * sz + i] = def; if (k === 'normal') for (let i = 0; i < n; i++) dst[(ov + i) * 3 + 1] = 1; continue; }
        const src = a.array, isz = a.itemSize;
        if (M && (k === 'position' || k === 'normal')) {
          for (let i = 0; i < n; i++) { v.set(src[i * isz], src[i * isz + 1], src[i * isz + 2]); if (k === 'position') v.applyMatrix4(M); else v.applyMatrix3(nm).normalize(); dst[(ov + i) * 3] = v.x; dst[(ov + i) * 3 + 1] = v.y; dst[(ov + i) * 3 + 2] = v.z; }
        } else for (let i = 0; i < n; i++) for (let c = 0; c < sz; c++) dst[(ov + i) * sz + c] = c < isz ? src[i * isz + c] : 0;
      }
      if (g.index) { const ia = g.index.array; for (let j = 0; j < ia.length; j++) idx[oi + j] = ia[j] + ov; oi += ia.length; }
      else { for (let j = 0; j < n; j++) idx[oi + j] = ov + j; oi += n; }
      ov += n;
    }
    const geo = new THREE.BufferGeometry();
    for (const k in sizes) geo.setAttribute(k, new THREE.BufferAttribute(out[k], sizes[k]));
    geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeBoundingSphere(); geo.computeBoundingBox();
    return geo;
  };
})();
