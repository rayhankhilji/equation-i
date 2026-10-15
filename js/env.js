// Equation I - environment core: track distance field, occupancy grid, field patchwork, terrain and ground shading.
// Shared by env_veg.js (trees, hedges, grass cards) and env_venue.js (stands, car parks, roads, fences...).
// Everything is deterministic (EI.U.rng / hashed noise) and built once at load.
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  const Env = {};

  // ---------------------------------------------------------------- geometry helpers (vertex-coloured merge, boxes, beams)
  Env.merge = function (geos) {
    let count = 0; const list = [];
    for (const ge of geos) { const g = ge.index ? ge.toNonIndexed() : ge; list.push([g, ge.userData.color]); count += g.attributes.position.count; }
    const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3), uv = new Float32Array(count * 2), col = new Float32Array(count * 3);
    let o = 0;
    for (const [g, c] of list) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      if (g.attributes.color && !c) col.set(g.attributes.color.array, o * 3);
      else { const r = c ? c.r : 1, gg = c ? c.g : 1, b = c ? c.b : 1; for (let i = 0; i < n; i++) { col[(o + i) * 3] = r; col[(o + i) * 3 + 1] = gg; col[(o + i) * 3 + 2] = b; } }
      o += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  };
  // fast builder for big merged meshes: raw arrays of triangles with per-vertex colour
  class Builder {
    constructor() { this.p = []; this.n = []; this.c = []; this.uv = []; }
    get count() { return this.p.length / 3; }
    tri(a, b, c, col, uvs) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      this.n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
      const cc = col.length === 3 && typeof col[0] === 'object' ? col : [col, col, col];
      for (const k of cc) this.c.push(k.r, k.g, k.b);
      if (uvs) this.uv.push(uvs[0], uvs[1], uvs[2], uvs[3], uvs[4], uvs[5]); else this.uv.push(0, 0, 0, 0, 0, 0);
    }
    quad(a, b, c, d, col, uvs) { this.tri(a, b, c, col, uvs ? [uvs[0], uvs[1], uvs[2], uvs[3], uvs[4], uvs[5]] : null); this.tri(a, c, d, col, uvs ? [uvs[0], uvs[1], uvs[4], uvs[5], uvs[6], uvs[7]] : null); }
    // axis-aligned box in a local frame m (Matrix4 elements), 6 faces minus optional bottom
    box(m, w, h, d, x, y, z, col, opts) {
      const hw = w / 2, hd = d / 2; const P = (lx, ly, lz) => Env.xf(m, x + lx, y + ly, z + lz);
      const a = P(-hw, 0, -hd), b = P(hw, 0, -hd), c = P(hw, 0, hd), e = P(-hw, 0, hd), A = P(-hw, h, -hd), B = P(hw, h, -hd), C = P(hw, h, hd), E = P(-hw, h, hd);
      const top = (opts && opts.top) || col;
      // counter-clockwise seen from outside (front faces), in a right-handed frame
      this.quad(A, E, C, B, top); this.quad(a, A, B, b, col); this.quad(b, B, C, c, col); this.quad(c, C, E, e, col); this.quad(e, E, A, a, col);
      if (opts && opts.bottom) this.quad(a, b, c, e, col);
    }
    // beam between two local points (square section)
    beam(m, p0, p1, th, col) {
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2]; const L = Math.hypot(dx, dy, dz); if (L < 0.01) return;
      const ax = [dx / L, dy / L, dz / L]; let up = Math.abs(ax[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      let s = [ax[1] * up[2] - ax[2] * up[1], ax[2] * up[0] - ax[0] * up[2], ax[0] * up[1] - ax[1] * up[0]]; let sl = Math.hypot(s[0], s[1], s[2]); s = s.map(v => v / sl * th / 2);
      let u = [ax[1] * s[2] - ax[2] * s[1], ax[2] * s[0] - ax[0] * s[2], ax[0] * s[1] - ax[1] * s[0]]; const ul = Math.hypot(u[0], u[1], u[2]); u = u.map(v => v / ul * th / 2);
      const corner = (p, i) => { const sx = i & 1 ? 1 : -1, ux = i & 2 ? 1 : -1; return Env.xf(m, p[0] + s[0] * sx + u[0] * ux, p[1] + s[1] * sx + u[1] * ux, p[2] + s[2] * sx + u[2] * ux); };
      const A = [0, 1, 3, 2].map(i => corner(p0, i)), B = [0, 1, 3, 2].map(i => corner(p1, i));
      const c0 = Env.xf(m, (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
      for (let k = 0; k < 4; k++) {
        const k2 = (k + 1) % 4; const a = A[k], b = A[k2], c = B[k2], d = B[k];
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const mx = (a[0] + c[0]) / 2 - c0[0], my = (a[1] + c[1]) / 2 - c0[1], mz = (a[2] + c[2]) / 2 - c0[2];
        if (nx * mx + ny * my + nz * mz >= 0) this.quad(a, b, c, d, col); else this.quad(d, c, b, a, col);
      }
    }
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.computeBoundingSphere(); return g;
    }
  }
  Env.Builder = Builder;
  // transform a local point by a Matrix4 (column-major elements)
  Env.xf = function (m, x, y, z) { const e = m.elements; return [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]]; };
  // local frame: +x along (tx,tz), +y up, +z = (nx,nz) (unit, horizontal), origin (x,y,z)
  // always right-handed (x cross y = z): when (t, n) would be mirrored, x is flipped, so front faces keep their winding
  Env.frame = function (x, y, z, tx, tz, nx, nz) { if (-tz * nx + tx * nz < 0) { tx = -tx; tz = -tz; } const m = new THREE.Matrix4(); m.set(tx, 0, nx, x, 0, 1, 0, y, tz, 0, nz, z, 0, 0, 0, 1); return m; };
  Env.C = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  // 2D canvases are drawn once on the CPU and read back; willReadFrequently keeps them off the GPU (much faster for thousands of small paths)
  Env.canvas = function (w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d', { willReadFrequently: true })]; };
  // alpha-cutout texture from a canvas: transparent texels get the colour of the nearest opaque ones (push-pull fill),
  // so mipmapped foliage / crowd edges do not fade to black. Rows are flipped to match CanvasTexture's flipY.
  Env.cutout = function (c, opts) {
    opts = opts || {}; const W = c.width, H = c.height; const src = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    // pyramid of weighted colour sums
    const levels = []; let w = W, h = H; const n0 = W * H; const R0 = new Float32Array(n0), G0 = new Float32Array(n0), B0 = new Float32Array(n0), A0 = new Float32Array(n0);
    for (let i = 0; i < n0; i++) { const al = src[i * 4 + 3] > 24 ? 1 : 0; A0[i] = al; R0[i] = src[i * 4] * al; G0[i] = src[i * 4 + 1] * al; B0[i] = src[i * 4 + 2] * al; }
    levels.push({ w, h, r: R0, g: G0, b: B0, a: A0 });
    while (w > 1 || h > 1) {
      const w2 = Math.max(1, w >> 1), h2 = Math.max(1, h >> 1), L = levels[levels.length - 1]; const R = new Float32Array(w2 * h2), G = new Float32Array(w2 * h2), B = new Float32Array(w2 * h2), A = new Float32Array(w2 * h2);
      for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) { const o = y * w2 + x; for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const k = Math.min(h - 1, y * 2 + dy) * w + Math.min(w - 1, x * 2 + dx); R[o] += L.r[k]; G[o] += L.g[k]; B[o] += L.b[k]; A[o] += L.a[k]; } }
      levels.push({ w: w2, h: h2, r: R, g: G, b: B, a: A }); w = w2; h = h2;
    }
    // pull: every texel becomes an average colour; empty texels inherit their parent's
    const top = levels[levels.length - 1]; if (top.a[0] > 0) { top.r[0] /= top.a[0]; top.g[0] /= top.a[0]; top.b[0] /= top.a[0]; } else { top.r[0] = top.g[0] = top.b[0] = 128; }
    for (let l = levels.length - 2; l >= 0; l--) {
      const L = levels[l], P = levels[l + 1];
      for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
        const o = y * L.w + x; const k = L.a[o];
        if (k > 0) { L.r[o] /= k; L.g[o] /= k; L.b[o] /= k; } else { const po = Math.min(P.h - 1, y >> 1) * P.w + Math.min(P.w - 1, x >> 1); L.r[o] = P.r[po]; L.g[o] = P.g[po]; L.b[o] = P.b[po]; }
      }
    }
    const out = new Uint8Array(n0 * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, o = ((H - 1 - y) * W + x) * 4; out[o] = R0[i]; out[o + 1] = G0[i]; out[o + 2] = B0[i]; out[o + 3] = src[i * 4 + 3]; }
    const t = new THREE.DataTexture(out, W, H, THREE.RGBAFormat); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = opts.aniso || 4;
    if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; t.encoding = THREE.sRGBEncoding; return t;
  };
  Env.tex = function (c, repeat, aniso) { const t = new THREE.CanvasTexture(c); if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso || 8; return U.srgb(t); };
  // double-sided cards: keep the authored normal on back faces (no flip) so foliage / crowd stay lit from both sides
  Env.noFlip = function (sh) { sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal = normal * faceDirection;', '').replace('normal = normal * ( float( gl_FrontFacing ) * 2.0 - 1.0 );', '')); };
  // give an InstancedMesh a bounding sphere that covers all instances (r128 culls instanced meshes by the base geometry only)
  Env.fitInstances = function (inst, pad) {
    const a = inst.instanceMatrix.array; let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < inst.count; i++) { const x = a[i * 16 + 12], y = a[i * 16 + 13], z = a[i * 16 + 14]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    if (!inst.count) { inst.visible = false; return; }
    const g = inst.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
    // the geometry must not be shared with another InstancedMesh (the sphere is per mesh); objects stay at the identity transform
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + g.boundingSphere.radius + (pad || 0));
  };

  // ---------------------------------------------------------------- the environment context (per scenery build)
  const DG = 10, DHALF = 2400, DN = DHALF * 2 / DG + 1;         // track distance field
  const OG = 4, OHALF = 2000, ON = OHALF * 2 / OG;               // occupancy grid
  const MAP_HALF = 2300, MAP_PX = 2048;                          // field-map texture (2.25 m / texel)
  const FC = 240;                                                // field (Voronoi) cell size
  const OCC = { ROAD: 1, BUILT: 2, PARK: 4, WOOD: 8, WATER: 16, TRACK: 32, KEEP: 64, HEDGE: 128 };
  Env.OCC = OCC; Env.MAP_HALF = MAP_HALF; Env.CARD_HALF = 1800; // billboard trees inside CARD_HALF, tree-line strips beyond

  class Ctx {
    constructor(scenery) {
      this.sc = scenery; this.t = scenery.track; this.data = (EI.ENVDATA && EI.ENVDATA[this.t.data.id]) || {};
      this.stats = {}; this.timings = {};
      this.VENUE_F = 185;
      this.buildDistanceField();
      this.buildFields();
      this.occ = new Uint8Array(ON * ON);
    }
    // rendered barrier distance on a side (the track ribbon clamps offsets on the inside of tight corners)
    wallCap(i, side, off) {
      const t = this.t; let d = (side < 0 ? t.wallL[i] : t.wallR[i]) + (off || 0);
      const kf = t.kFold ? t.kFold[i] : 0; const cap = Math.max(2, 0.9 / (Math.abs(kf) + 1e-6));
      if ((kf > 0 && side > 0) || (kf < 0 && side < 0)) d = Math.min(d, cap);
      return d;
    }
    // ------------------------------------------------ distance field: distance to the centreline, beyond the (max) barrier, side, nearest sample
    buildDistanceField() {
      const t = this.t, n = DN * DN; this.dC = new Float32Array(n); this.dF = new Float32Array(n); this.dFs = new Float32Array(n); this.dSide = new Int8Array(n); this.dIdx = new Uint16Array(n);
      const pr = {};
      for (let gz = 0; gz < DN; gz++) for (let gx = 0; gx < DN; gx++) {
        const x = -DHALF + gx * DG, z = -DHALF + gz * DG; t.project(x, z, null, pr); const k = gz * DN + gx;
        const side = pr.lat < 0 ? -1 : 1; this.dC[k] = pr.dist; this.dF[k] = pr.dist - Math.max(t.wallL[pr.i], t.wallR[pr.i]); this.dFs[k] = pr.dist - this.wallCap(pr.i, side); this.dSide[k] = side; this.dIdx[k] = pr.i;
      }
      // centreline polygon for robust inside tests (coarse)
      this.loop = []; for (let i = 0; i < t.n; i += 3) this.loop.push([t.x[i], t.z[i]]);
    }
    _bil(arr, x, z, far) {
      const fx = (x + DHALF) / DG, fz = (z + DHALF) / DG; if (fx < 0 || fz < 0 || fx >= DN - 1 || fz >= DN - 1) return far;
      const ix = fx | 0, iz = fz | 0, u = fx - ix, v = fz - iz, k = iz * DN + ix;
      return (arr[k] * (1 - u) + arr[k + 1] * u) * (1 - v) + (arr[k + DN] * (1 - u) + arr[k + DN + 1] * u) * v;
    }
    fAt(x, z) { return this._bil(this.dF, x, z, 5000); }        // metres beyond the outermost barrier (conservative)
    fsAt(x, z) { return this._bil(this.dFs, x, z, 5000); }      // metres beyond the rendered barrier on this side
    dcAt(x, z) { return this._bil(this.dC, x, z, 5000); }
    _near(x, z) { const gx = U.clamp(Math.round((x + DHALF) / DG), 0, DN - 1), gz = U.clamp(Math.round((z + DHALF) / DG), 0, DN - 1); return gz * DN + gx; }
    idxAt(x, z) { return this.dIdx[this._near(x, z)]; }
    // inside the circuit loop: the nearest-point side test is exact for a simple closed curve
    inside(x, z) { const k = this._near(x, z); return this.dSide[k] < 0 && this.dC[k] < 1500; }
    isVenue(x, z) { const f = this.fAt(x, z); return f < this.VENUE_F || (f < 900 && this.inside(x, z)); }
    // precise test for "outside the barriers by margin" (spec: project().dist > max(wallL, wallR) + margin)
    clearOfTrack(x, z, margin) { const t = this.t; const p = t.project(x, z, null, this._pr || (this._pr = {})); return p.dist > Math.max(t.wallL[p.i], t.wallR[p.i]) + margin; }
    // visible ground: the verge ribbons near the track (track level), terrain beyond
    ground(x, z) { return this.sc.height(x, z); }

    // ------------------------------------------------ occupancy grid
    oi(x, z) { const gx = Math.floor((x + OHALF) / OG), gz = Math.floor((z + OHALF) / OG); if (gx < 0 || gz < 0 || gx >= ON || gz >= ON) return -1; return gz * ON + gx; }
    occAt(x, z) { const k = this.oi(x, z); return k < 0 ? 0 : this.occ[k]; }
    mark(x, z, bit) { const k = this.oi(x, z); if (k >= 0) this.occ[k] |= bit; }
    markPoly(poly, bit, pad) {
      const b = U.polyBounds(poly); pad = pad || 0;
      for (let z = Math.floor((b.z0 - pad) / OG) * OG + OG / 2; z <= b.z1 + pad; z += OG) for (let x = Math.floor((b.x0 - pad) / OG) * OG + OG / 2; x <= b.x1 + pad; x += OG) {
        if (U.pointInPoly(x, z, poly) || (pad && this.distToPoly(x, z, poly) < pad)) this.mark(x, z, bit);
      }
    }
    distToPoly(x, z, poly) { let best = Infinity; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { best = Math.min(best, segDist(x, z, poly[j][0], poly[j][1], poly[i][0], poly[i][1])); } return best; }
    // oriented rectangle: centre, unit axis (ax,az), half-length along axis hl, half-depth hd
    rectPoly(cx, cz, ax, az, hl, hd) { const bx = -az, bz = ax; return [[cx - ax * hl - bx * hd, cz - az * hl - bz * hd], [cx + ax * hl - bx * hd, cz + az * hl - bz * hd], [cx + ax * hl + bx * hd, cz + az * hl + bz * hd], [cx - ax * hl + bx * hd, cz - az * hl + bz * hd]]; }
    markRect(cx, cz, ax, az, hl, hd, bit) { const p = this.rectPoly(cx, cz, ax, az, hl, hd); this.markPoly(p, bit); return p; }
    // fraction of a rectangle's sample points that are free of `mask` (and clear of the track by `margin`)
    rectFree(cx, cz, ax, az, hl, hd, mask, margin) {
      const bx = -az, bz = ax; let ok = 0, tot = 0; const st = 4;
      for (let a = -hl; a <= hl + 0.01; a += Math.max(st, hl / 12)) for (let b = -hd; b <= hd + 0.01; b += Math.max(st, hd / 8)) {
        const x = cx + ax * a + bx * b, z = cz + az * a + bz * b; tot++;
        if (this.occAt(x, z) & mask) continue; if (margin != null && this.fAt(x, z) < margin) continue; ok++;
      }
      return tot ? ok / tot : 0;
    }
    markLine(pts, halfW, bit) {
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const nx = -(b[1] - a[1]) / (L || 1), nz = (b[0] - a[0]) / (L || 1);
        for (let s = 0; s <= L; s += OG * 0.5) for (let w = -halfW; w <= halfW + 0.01; w += OG * 0.5) { const u = s / (L || 1); this.mark(a[0] + (b[0] - a[0]) * u + nx * w, a[1] + (b[1] - a[1]) * u + nz * w, bit); }
      }
    }

    // ------------------------------------------------ field patchwork (jittered Voronoi), types and hedge boundaries
    buildFields() {
      const R = Math.ceil(6800 / FC) + 1; this.FR = R; const W = R * 2 + 1; this.FW = W;
      this.seedX = new Float32Array(W * W); this.seedZ = new Float32Array(W * W); this.fType = new Uint8Array(W * W); this.fAng = new Float32Array(W * W); this.fTone = new Float32Array(W * W);
      // field types: 0 pasture, 1 pasture dark, 2 wheat (golden), 3 barley (pale gold), 4 green crop, 5 ploughed, 6 stubble, 7 rapeseed, 8 copse (wood)
      const pick = [0, 0, 0, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 5, 6, 6, 7, 0, 1, 2];
      for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) {
        const k = (cz + R) * W + (cx + R); const h1 = hash2(cx, cz, 1), h2 = hash2(cx, cz, 2), h3 = hash2(cx, cz, 3);
        this.seedX[k] = (cx + 0.05 + 0.9 * h1) * FC; this.seedZ[k] = (cz + 0.05 + 0.9 * h2) * FC;
        const big = hash2(cx >> 1, cz >> 1, 7) < 0.45; const ht = big ? hash2(cx >> 1, cz >> 1, 3) : h3;
        let ty = pick[Math.floor(ht * pick.length) % pick.length];
        const r = Math.hypot(this.seedX[k], this.seedZ[k] - 60); if (r > 1300 && hash2(cx, cz, 9) < 0.09) ty = 8;
        this.fType[k] = ty; this.fAng[k] = hash2(cx, cz, 4) * Math.PI; this.fTone[k] = hash2(cx, cz, 5);
      }
    }
      // is there a hedge on the field boundary a-b? (none between two cells of the same crop in a merged block)
    hedgeOn(a, b, cell) {
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; this.cellAt(mx, mz, cell); if (cell.k2 < 0) return true;
      return !(this.fType[cell.k] === this.fType[cell.k2] && hash2(Math.round(mx), Math.round(mz), 13) < 0.85);
    }
  // nearest two field seeds: returns cell key, and distance to the boundary (bisector)
    cellAt(x, z, out) {
      const R = this.FR, W = this.FW; const cx0 = Math.floor(x / FC), cz0 = Math.floor(z / FC); let d1 = Infinity, d2 = Infinity, k1 = -1, k2 = -1;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const cx = cx0 + dx, cz = cz0 + dz; if (cx < -R || cx > R || cz < -R || cz > R) continue; const k = (cz + R) * W + (cx + R);
        const d = (this.seedX[k] - x) ** 2 + (this.seedZ[k] - z) ** 2;
        if (d < d1) { d2 = d1; k2 = k1; d1 = d; k1 = k; } else if (d < d2) { d2 = d; k2 = k; }
      }
      out = out || {}; out.k = k1; out.k2 = k2;
      if (k2 >= 0) { const sx = this.seedX[k2] - this.seedX[k1], sz = this.seedZ[k2] - this.seedZ[k1]; out.edge = (d2 - d1) / (2 * Math.hypot(sx, sz)); } else out.edge = 999;
      return out;
    }
  }
  function segDist(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az; const l2 = dx * dx + dz * dz || 1; const u = U.clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1); return Math.hypot(px - ax - dx * u, pz - az - dz * u); }
  function hash2(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  Env.hash2 = hash2; Env.segDist = segDist;
  Env.Ctx = Ctx;

  // ---------------------------------------------------------------- marching squares contours of a grid field
  Env.contours = function (ctx, arr, level, mask) {
    const N = DN; const segs = []; const pt = (k, x, z) => [x, z];
    const val = (gx, gz) => arr[gz * N + gx];
    const edgePt = (ax, az, va, bx, bz, vb) => { const u = (level - va) / (vb - va); return [-DHALF + (ax + (bx - ax) * u) * DG, -DHALF + (az + (bz - az) * u) * DG]; };
    const map = new Map();
    const addSeg = (ka, pa, kb, pb) => { const s = { a: ka, b: kb, pa, pb, used: false }; segs.push(s); for (const kk of [ka, kb]) { let l = map.get(kk); if (!l) map.set(kk, l = []); l.push(s); } };
    for (let gz = 0; gz < N - 1; gz++) for (let gx = 0; gx < N - 1; gx++) {
      if (mask && !mask(gx, gz)) continue;
      const v0 = val(gx, gz), v1 = val(gx + 1, gz), v2 = val(gx + 1, gz + 1), v3 = val(gx, gz + 1);
      const c = (v0 > level ? 1 : 0) | (v1 > level ? 2 : 0) | (v2 > level ? 4 : 0) | (v3 > level ? 8 : 0); if (c === 0 || c === 15) continue;
      // edges: 0 top (0-1), 1 right (1-2), 2 bottom (3-2), 3 left (0-3)
      const E = [
        () => [(gz * N + gx) * 2, edgePt(gx, gz, v0, gx + 1, gz, v1)], () => [(gz * N + gx + 1) * 2 + 1, edgePt(gx + 1, gz, v1, gx + 1, gz + 1, v2)],
        () => [((gz + 1) * N + gx) * 2, edgePt(gx, gz + 1, v3, gx + 1, gz + 1, v2)], () => [(gz * N + gx) * 2 + 1, edgePt(gx, gz, v0, gx, gz + 1, v3)]];
      const T = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[0, 2]], 10: [[0, 1], [2, 3]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[0, 3]] }[c];
      for (const [ea, eb] of T) { const A = E[ea](), B = E[eb](); addSeg(A[0], A[1], B[0], B[1]); }
    }
    const lines = [];
    for (const s of segs) {
      if (s.used) continue; s.used = true; const line = [s.pa, s.pb]; let head = s.b, tail = s.a; let closed = false;
      const grow = (key, front) => { for (;;) { const l = map.get(key); let nx = null; if (l) for (const q of l) if (!q.used) { nx = q; break; } if (!nx) return; nx.used = true; const fwd = nx.a === key; const p = fwd ? nx.pb : nx.pa; key = fwd ? nx.b : nx.a; if (front) line.push(p); else line.unshift(p); if (key === (front ? tail : head)) { closed = true; return; } if (front) head = key; else tail = key; } };
      grow(head, true); if (!closed) grow(tail, false);
      line.closed = closed; lines.push(line);
    }
    return lines;
  };
  Env.polyLength = function (pts, closed) { let L = 0; for (let i = 0; i + 1 < pts.length; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); if (closed) L += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]); return L; };
  // Chaikin smoothing + uniform resampling
  Env.smoothLine = function (pts, closed, iters, step) {
    let p = pts.slice();
    for (let it = 0; it < (iters || 0); it++) {
      const q = []; const n = p.length; const lim = closed ? n : n - 1; if (!closed) q.push(p[0]);
      for (let i = 0; i < lim; i++) { const a = p[i], b = p[(i + 1) % n]; q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
      if (!closed) q.push(p[n - 1]); p = q;
    }
    if (!step) return p;
    const out = []; const n = p.length; const segs = closed ? n : n - 1; let carry = 0; out.push(p[0]);
    for (let i = 0; i < segs; i++) {
      const a = p[i], b = p[(i + 1) % n]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); let s = step - carry;
      while (s <= L) { const u = s / L; out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]); s += step; }
      carry = L - (s - step);
    }
    if (closed && out.length > 2) { const f = out[0], l = out[out.length - 1]; if (Math.hypot(f[0] - l[0], f[1] - l[1]) < step * 0.5) out.pop(); }
    else if (!closed) { const l = p[n - 1]; const o = out[out.length - 1]; if (Math.hypot(o[0] - l[0], o[1] - l[1]) > step * 0.3) out.push(l); }
    out.closed = closed; return out;
  };

  // ---------------------------------------------------------------- terrain: non-uniform grid out to the horizon, field-map + detail shading
  // grid coordinate for index k (|k| <= K): 20 m cells inside +-1800, then geometrically growing cells out to ~6.6 km
  const KIN = 75, KTOT = 102, GS = 24;
  function gridPos(k) { const a = Math.abs(k); if (a <= KIN) return k * GS; let p = KIN * GS, st = GS; for (let j = KIN; j < a; j++) { st *= 1.125; p += st; } return Math.sign(k) * p; }
  Env.gridPos = gridPos;
  Ctx.prototype.heightRaw = function (x, z) {
    const r = Math.hypot(x + 40, z - 60);
    const amp = 10 + 26 * U.smoothstep(1400, 4200, r);
    return (U.fbm(x / 900 + 10, z / 900 + 10, 4) - 0.5) * amp * 2 + (U.fbm(x / 260, z / 260, 3) - 0.5) * 5 + 34 * U.smoothstep(3800, 6200, r) * (0.6 + 0.4 * U.fbm(x / 1500 + 3, z / 1500 + 7, 2));
  };
  // terrain height: flat at track level near the circuit (and a touch below the verge ribbons), rolling countryside beyond
  Ctx.prototype.terrainHeight = function (x, z) {
    const t = this.t; const f = this.fAt(x, z), fs = this.fsAt(x, z); const ty = t.y[this.idxAt(x, z)];
    const w = U.smoothstep(25, 220, f);
    return ty + this.heightRaw(x, z) * w - 0.14 * (1 - U.smoothstep(36, 52, fs));
  };

  Ctx.prototype.buildTerrain = function () {
    const sc = this.sc; const K = KTOT, W = K * 2 + 1;
    const pos = new Float32Array(W * W * 3), col = new Float32Array(W * W * 3), uv = new Float32Array(W * W * 2);
    const heights = new Float32Array((KIN * 2 + 1) * (KIN * 2 + 1)); const HW = KIN * 2 + 1;
    const tmp = new THREE.Color(), cell = {};
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      const x = gridPos(i - K), z = gridPos(j - K); const k = j * W + i;
      const h = this.terrainHeight(x, z); pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      if (Math.abs(i - K) <= KIN && Math.abs(j - K) <= KIN) heights[(j - K + KIN) * HW + (i - K + KIN)] = h;
      const c = this.fieldRGB(x, z, cell); tmp.setRGB(c[0] / 255, c[1] / 255, c[2] / 255).convertSRGBToLinear();
      col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
      uv[k * 2] = (x + MAP_HALF) / (MAP_HALF * 2); uv[k * 2 + 1] = 1 - (z + MAP_HALF) / (MAP_HALF * 2);
    }
    const idx = []; for (let j = 0; j < W - 1; j++) for (let i = 0; i < W - 1; i++) { const a = j * W + i, b = a + 1, c = a + W, d = c + 1; idx.push(a, c, b, b, c, d); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals(); geo.computeBoundingSphere();
    sc.heights = heights; sc.hHalf = KIN * GS; sc.hN = HW; sc.hCell = GS;
    const mat = this.groundMaterial(false); mat.polygonOffset = true; mat.polygonOffsetFactor = 4; mat.polygonOffsetUnits = 8;
    const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.name = 'terrainMesh'; sc.group.add(m);
    this.stats.terrainTris = idx.length / 3;
    // compatibility for track.js, which samples the 'terrain' vertex colours on a uniform tSize x tSegs grid just beyond its verge:
    // an invisible carrier of the field-map colours (linear) on such a grid
    const TS = 2 * MAP_HALF, TG = 230, TW = TG + 1; const tc = new Float32Array(TW * TW * 3); const cc = new THREE.Color();
    for (let j = 0; j < TW; j++) for (let i = 0; i < TW; i++) { this.mapColor(-MAP_HALF + i * TS / TG, -MAP_HALF + j * TS / TG, cc); const o = (j * TW + i) * 3; tc[o] = cc.r; tc[o + 1] = cc.g; tc[o + 2] = cc.b; }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('color', new THREE.BufferAttribute(tc, 3)); cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    const carrier = new THREE.Mesh(cg, new THREE.MeshBasicMaterial()); carrier.visible = false; carrier.name = 'terrain'; sc.group.add(carrier); sc.tSize = TS; sc.tSegs = TG;
  };

  // ---------------------------------------------------------------- grass detail texture: tileable blades, mean 0.5 per channel (used as a x2 multiplier)
  Env.grassDetail = function () {
    const S = 512; const [c, ctx] = Env.canvas(S, S); const r = U.rng(4711);
    ctx.fillStyle = 'rgb(120,126,110)'; ctx.fillRect(0, 0, S, S);
    // soft clumps (mid frequency)
    for (let i = 0; i < 260; i++) { const x = r() * S, y = r() * S, rad = 10 + r() * 34, l = r() < 0.5 ? 'rgba(80,92,64,' : 'rgba(170,176,140,'; ctx.fillStyle = l + (0.08 + r() * 0.12).toFixed(2) + ')'; for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { ctx.beginPath(); ctx.ellipse(x + ox, y + oy, rad, rad * (0.6 + r() * 0.4), r() * 3, 0, 6.283); ctx.fill(); } }
    // blades: short curved strokes batched by colour / width class (a few paths instead of thousands)
    const cols = ['rgba(40,50,30,0.7)', 'rgba(150,166,112,0.65)', 'rgba(180,190,134,0.65)', 'rgba(200,198,150,0.6)', 'rgba(210,186,118,0.65)'];
    const weights = [0.38, 0.25, 0.17, 0.13, 0.07];
    for (let ci = 0; ci < cols.length; ci++) for (const lw of [0.9, 1.5, 2.1]) {
      ctx.strokeStyle = cols[ci]; ctx.lineWidth = lw; ctx.beginPath(); const n = Math.round(16000 * weights[ci] / 3);
      for (let i = 0; i < n; i++) {
        const x = r() * S, y = r() * S, len = 5 + r() * 13, ang = -Math.PI / 2 + (r() - 0.5) * 2.2; const ex = Math.cos(ang) * len, ey = Math.sin(ang) * len, bend = (r() - 0.5) * 3;
        for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { if (x + ox < -20 || x + ox > S + 20 || y + oy < -20 || y + oy > S + 20) continue; ctx.moveTo(x + ox, y + oy); ctx.quadraticCurveTo(x + ox + ex * 0.5 + bend, y + oy + ey * 0.5, x + ox + ex, y + oy + ey); }
      }
      ctx.stroke();
    }
    // normalise to a 0.5 mean per channel; alpha carries tileable low-frequency mottling for the macro variation
    const img = ctx.getImageData(0, 0, S, S); const d = img.data; const sum = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) { sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; }
    const n = d.length / 4; const k = sum.map(s => 128 / (s / n));
    const P = 8, hsh = (x, y, o) => Env.hash2(((x % P) + P) % P, ((y % P) + P) % P, o);
    const vn = (x, y, o) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); return U.lerp(U.lerp(hsh(xi, yi, o), hsh(xi + 1, yi, o), u), U.lerp(hsh(xi, yi + 1, o), hsh(xi + 1, yi + 1, o), u), v); };
    const out = new Uint8Array(S * S * 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4; const fx = x / S * P, fy = y / S * P; const m = vn(fx, fy, 1) * 0.6 + vn(fx * 2, fy * 2, 2) * 0.3 + vn(fx * 4, fy * 4, 3) * 0.1;
      out[i] = U.clamp(d[i] * k[0], 0, 255); out[i + 1] = U.clamp(d[i + 1] * k[1], 0, 255); out[i + 2] = U.clamp(d[i + 2] * k[2], 0, 255); out[i + 3] = U.clamp(m * 255, 0, 255);
    }
    const t = new THREE.DataTexture(out, S, S, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true;
    return t; // linear data (a multiplier), not sRGB
  };

  Ctx.prototype.groundMaterial = function (tinted) {
    if (!this._detail) this._detail = Env.grassDetail();
    const det = this._detail;
    const mat = new THREE.MeshStandardMaterial({ map: this.fieldTex, vertexColors: true, roughness: 0.96, metalness: 0.0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.detailMap = { value: det };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D detailMap;')
        .replace('#include <map_fragment>', [
          'vec4 fm = mapTexelToLinear(texture2D(map, vUv));',
          'vec2 qd = abs(vUv - 0.5); float inMap = 1.0 - smoothstep(0.465, 0.497, max(qd.x, qd.y));',
          tinted ? 'diffuseColor.rgb *= fm.rgb * vColor;' : 'diffuseColor.rgb *= mix(vColor, fm.rgb, inMap);',
          'vec2 wq = vWPos.xz;',
          'vec3 d1 = texture2D(detailMap, wq * 0.62).rgb;',
          'vec3 d2 = texture2D(detailMap, vec2(wq.x * 0.6 - wq.y * 0.8, wq.x * 0.8 + wq.y * 0.6) * 0.15).rgb;',
          'vec3 d3 = texture2D(detailMap, wq * 0.031 + 0.37).rgb;',
          'float mac = texture2D(detailMap, wq * 0.0071).a * 0.65 + texture2D(detailMap, vec2(-wq.y, wq.x) * 0.0023 + 0.5).a * 0.35;',
          'diffuseColor.rgb *= (d1 * 0.5 + d2 * 0.3 + d3 * 0.2) * 2.0 * (0.78 + 0.44 * mac);'].join('\n'))
        .replace('#include <color_fragment>', '');
    };
    mat.customProgramCacheKey = () => tinted ? 'ground-tint' : 'ground';
    return mat;
  };

  // ---------------------------------------------------------------- field colour (sRGB bytes) at a point: circuit grass, venue grass, farm fields
  // albedo (sRGB). Kept muted: main.js grades the frame with a strong saturation boost.
  const PAL = {
    mowA: [52, 61, 37], mowB: [59, 68, 42], venue: [56, 63, 38], venueDry: [80, 79, 55], wood: [30, 36, 22],
    // 0 pasture, 1 pasture dark, 2 wheat, 3 barley, 4 green crop, 5 ploughed, 6 stubble, 7 rapeseed, 8 copse
    fields: [[56, 64, 38], [47, 55, 33], [120, 106, 74], [128, 119, 92], [60, 70, 37], [80, 68, 54], [122, 113, 93], [132, 124, 62], [33, 40, 27]],
    hedge: [27, 33, 21],
  };
  Env.PAL = PAL;
  // writes sRGB bytes into `out` (reused array) and returns it
  // venue grass colour, or false when (x, z) is out in the farmland
  Ctx.prototype.venueRGB = function (x, z, out) {
    const f = this.fAt(x, z); if (!(f < this.VENUE_F || (f < 900 && this.inside(x, z)))) return false;
    return this.fieldRGB(x, z, null, out, f);
  };
  Ctx.prototype.fieldRGB = function (x, z, cell, out, fpre) {
    out = out || [0, 0, 0];
    const f = fpre != null ? fpre : this.fAt(x, z); const n1 = U.noise2(x / 61 + 3.3, z / 61 + 7.1);
    let c, k;
    if (f < 48) {
      const dc = this.dcAt(x, z); c = (Math.floor((dc - this.t.halfWidth) / 7.5) & 1) ? PAL.mowA : PAL.mowB; k = 0.94 + n1 * 0.1;
      out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k; return out;
    }
    if (f < this.VENUE_F || (f < 900 && this.inside(x, z))) {
      const dry = U.smoothstep(0.55, 0.8, U.noise2(x / 140 + 9, z / 140 + 4)) * 0.6;
      const stripe = f < 150 ? ((Math.floor(this.dcAt(x, z) / 11) & 1) ? 0.96 : 1.03) : 1; k = (0.92 + n1 * 0.14) * stripe;
      const a = PAL.venue, b = PAL.venueDry; out[0] = (a[0] + (b[0] - a[0]) * dry) * k; out[1] = (a[1] + (b[1] - a[1]) * dry) * k; out[2] = (a[2] + (b[2] - a[2]) * dry) * k; return out;
    }
    cell = this.cellAt(x, z, cell);
    if (cell.edge < 2.2 && cell.k2 >= 0 && this.fType[cell.k] !== this.fType[cell.k2]) { c = PAL.hedge; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; return out; }
    const ty = this.fType[cell.k]; c = PAL.fields[ty];
    k = 0.88 + this.fTone[cell.k] * 0.16 + (n1 - 0.5) * 0.12;
    if (ty === 5) { const a = this.fAng[cell.k]; const u = x * Math.cos(a) + z * Math.sin(a); if ((((u % 3) + 3) % 3) < 1.1) k *= 0.86; }
    else if (ty >= 2 && ty <= 7) {
      // tramlines and a headland round the edge of arable fields
      if (cell.edge < 9) k *= 0.95;
      else { const a = this.fAng[cell.k]; const u = x * Math.cos(a) + z * Math.sin(a); const m = ((u % 24) + 24) % 24; if (Math.abs(m - 11) < 0.9 || Math.abs(m - 13) < 0.9) k *= 0.8; }
    }
    out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k; return out;
  };
  function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  // Voronoi cell polygon of field seed k (clip a square by the bisectors with the 5x5 neighbourhood)
  Ctx.prototype.fieldPoly = function (k) {
    const R = this.FR, W = this.FW; const cx = (k % W) - R, cz = Math.floor(k / W) - R; const sx = this.seedX[k], sz = this.seedZ[k];
    let poly = [[sx - FC * 2, sz - FC * 2], [sx + FC * 2, sz - FC * 2], [sx + FC * 2, sz + FC * 2], [sx - FC * 2, sz + FC * 2]];
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if (!dx && !dz) continue; const x2 = cx + dx, z2 = cz + dz; if (x2 < -R || x2 > R || z2 < -R || z2 > R) continue; const j = (z2 + R) * W + (x2 + R);
      const ax = this.seedX[j] - sx, az = this.seedZ[j] - sz, c = (this.seedX[j] ** 2 + this.seedZ[j] ** 2 - sx * sx - sz * sz) / 2;
      const inside = p => p[0] * ax + p[1] * az <= c; const out = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length]; const ia = inside(a), ib = inside(b);
        if (ia) out.push(a);
        if (ia !== ib) { const da = a[0] * ax + a[1] * az - c, db = b[0] * ax + b[1] * az - c; const u = da / (da - db); out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]); }
      }
      poly = out; if (poly.length < 3) return poly;
    }
    return poly;
  };
  // paint the field map: farm fields as vector polygons, the venue grass per pixel, then vector overlays (woods, roads, car parks...)
  Ctx.prototype.paintFieldMap = function (overlays) {
    const S = MAP_PX, H = MAP_HALF, ppm = S / (H * 2); const [c, ctx] = Env.canvas(S, S);
    const rgb = (a, k) => 'rgb(' + (U.clamp(a[0] * k, 0, 255) | 0) + ',' + (U.clamp(a[1] * k, 0, 255) | 0) + ',' + (U.clamp(a[2] * k, 0, 255) | 0) + ')';
    this._mt = performance.now(); ctx.fillStyle = rgb(PAL.fields[0], 1); ctx.fillRect(0, 0, S, S);
    ctx.setTransform(ppm, 0, 0, ppm, S / 2, S / 2);
    const path = (poly) => { ctx.beginPath(); ctx.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]); ctx.closePath(); };
    const R = this.FR, W = this.FW; const polys = []; this.fieldPolys = polys;
    for (let k = 0; k < W * W; k++) {
      const sx = this.seedX[k], sz = this.seedZ[k]; if (Math.abs(sx) > H + FC * 1.5 || Math.abs(sz) > H + FC * 1.5) continue;
      const poly = this.fieldPoly(k); if (poly.length < 3) continue; polys.push([k, poly]);
      const ty = this.fType[k], tone = this.fTone[k]; path(poly); ctx.fillStyle = rgb(PAL.fields[ty], 0.88 + tone * 0.16); ctx.fill();
      if (ty >= 2 && ty <= 7) {
        ctx.save(); path(poly); ctx.clip(); const a = this.fAng[k], ca = Math.cos(a), sa = Math.sin(a);
        if (ty === 5) { ctx.strokeStyle = 'rgba(50,34,20,0.22)'; ctx.lineWidth = 1.1; ctx.beginPath(); for (let u = -FC * 2; u < FC * 2; u += 3) { ctx.moveTo(sx + ca * u - sa * FC * 2, sz + sa * u + ca * FC * 2); ctx.lineTo(sx + ca * u + sa * FC * 2, sz + sa * u - ca * FC * 2); } ctx.stroke(); }
        else {
          ctx.strokeStyle = 'rgba(60,66,34,0.35)'; ctx.lineWidth = 1.2; ctx.beginPath();
          for (let u = -FC * 2; u < FC * 2; u += 24) for (const o of [-0.9, 0.9]) { const uu = u + o + (tone * 24); ctx.moveTo(sx + ca * uu - sa * FC * 2, sz + sa * uu + ca * FC * 2); ctx.lineTo(sx + ca * uu + sa * FC * 2, sz + sa * uu - ca * FC * 2); }
          ctx.stroke();
          path(poly); ctx.strokeStyle = 'rgba(90,100,52,0.25)'; ctx.lineWidth = 16; ctx.stroke(); // headland
        }
        ctx.restore();
      }
    }
    const T = () => { if (EI.ENV_LOG) { const n = performance.now(); console.log('ENV  map step ' + Math.round(n - (this._mt || n))); this._mt = n; } }; T();
    // large-scale tonal variation (soil moisture, cloud of slightly different growth)
    { const [nc, nctx] = Env.canvas(128, 128); const ni = nctx.createImageData(128, 128); for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) { const v = U.fbm(i / 11 + 4.1, j / 11 + 2.7, 4) * 255; const o = (j * 128 + i) * 4; ni.data[o] = ni.data[o + 1] = ni.data[o + 2] = v; ni.data[o + 3] = 255; } nctx.putImageData(ni, 0, 0);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 0.22; ctx.globalCompositeOperation = 'soft-light'; ctx.imageSmoothingEnabled = true; ctx.drawImage(nc, 0, 0, S, S); ctx.restore(); }
    T();
    // hedgerow lines along every field boundary
    ctx.strokeStyle = rgb(PAL.hedge, 1); ctx.lineWidth = 3.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath(); const cell = {};
    for (const [k, poly] of polys) for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; if (!this.hedgeOn(a, b, cell)) continue; ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
    T();
    // venue grass (mown circuit grass, infield) per pixel over its bounding box
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; const t = this.t;
    for (let i = 0; i < t.n; i++) { x0 = Math.min(x0, t.x[i]); x1 = Math.max(x1, t.x[i]); z0 = Math.min(z0, t.z[i]); z1 = Math.max(z1, t.z[i]); }
    const pad = this.VENUE_F + 80; const i0 = U.clamp(Math.floor((x0 - pad + H) * ppm), 0, S - 1), i1 = U.clamp(Math.ceil((x1 + pad + H) * ppm), 0, S - 1), j0 = U.clamp(Math.floor((z0 - pad + H) * ppm), 0, S - 1), j1 = U.clamp(Math.ceil((z1 + pad + H) * ppm), 0, S - 1);
    const img = ctx.getImageData(i0, j0, i1 - i0 + 1, j1 - j0 + 1); const d = img.data; const col = [0, 0, 0]; const iw = i1 - i0 + 1;
    for (let j = j0; j <= j1; j++) { const z = -H + (j + 0.5) / ppm; for (let i = i0; i <= i1; i++) { const x = -H + (i + 0.5) / ppm; if (!this.venueRGB(x, z, col)) continue; const o = ((j - j0) * iw + (i - i0)) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; } }
    ctx.putImageData(img, i0, j0);
    T();
    // world -> canvas transform for vector overlays
    ctx.setTransform(ppm, 0, 0, ppm, S / 2, S / 2);
    for (const fn of overlays) { ctx.save(); fn(ctx, path); ctx.restore(); }
    const tex = new THREE.CanvasTexture(c); tex.anisotropy = 8; tex.encoding = THREE.sRGBEncoding; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    this.fieldTex = tex; this.fieldCanvas = c;
    T();
    this.fieldPixels = ctx.getImageData(0, 0, S, S).data; T(); // kept for sampling colours of grass cards / tree tints
    return tex;
  };
  // sample the painted field map (linear 0..1 RGB) at a world point
  Ctx.prototype.mapColor = function (x, z, out) {
    const S = MAP_PX; const i = U.clamp(Math.floor((x + MAP_HALF) / (MAP_HALF * 2) * S), 0, S - 1), j = U.clamp(Math.floor((z + MAP_HALF) / (MAP_HALF * 2) * S), 0, S - 1); const o = (j * S + i) * 4; const d = this.fieldPixels;
    out = out || new THREE.Color(); return out.setRGB(d[o] / 255, d[o + 1] / 255, d[o + 2] / 255).convertSRGBToLinear();
  };

  // ---------------------------------------------------------------- verge overlay ribbons: same ground shading right up to the kerbs, with a worn band at the edge
  Ctx.prototype.buildVerge = function () {
    const t = this.t, hw = t.halfWidth, kw = t.kerbWidth; const parts = [];
    const dirt = new THREE.Color(1.12, 0.86, 0.66), worn = new THREE.Color(1.06, 0.94, 0.82), clean = new THREE.Color(1, 1, 1), tmp = new THREE.Color();
    for (const side of [-1, 1]) {
      const wall = side < 0 ? t.wallL : t.wallR;
      const bands = [[() => hw - 0.05, () => hw + kw * 0.7, dirt, worn], [() => hw + kw * 0.7, () => hw + kw + 3.2, worn, clean], [() => hw + kw + 3.2, i => Math.max(hw + kw + 4, wall[i] + 42), clean, clean]];
      for (const [a, b, ca, cb] of bands) {
        const geo = t.ribbon(i => side * a(i), i => side * b(i), { y: -0.02, colorFn: (i, s) => { const n = 0.92 + U.noise2(i * 0.07, side * 5 + s) * 0.16; return tmp.copy(s === 0 ? ca : cb).multiplyScalar(n).clone(); } });
        parts.push(geo);
      }
    }
    // merge indexed ribbons
    let nv = 0, ni = 0; for (const g of parts) { nv += g.attributes.position.count; ni += g.index.count; }
    const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni); let ov = 0, oi = 0;
    for (const g of parts) {
      pos.set(g.attributes.position.array, ov * 3); col.set(g.attributes.color.array, ov * 3); nrm.set(g.attributes.normal.array, ov * 3);
      const ia = g.index.array; for (let i = 0; i < ia.length; i++) idx[oi + i] = ia[i] + ov; ov += g.attributes.position.count; oi += ia.length;
    }
    for (let i = 0; i < nv; i++) { uv[i * 2] = (pos[i * 3] + MAP_HALF) / (MAP_HALF * 2); uv[i * 2 + 1] = 1 - (pos[i * 3 + 2] + MAP_HALF) / (MAP_HALF * 2); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeBoundingSphere();
    const mat = this.groundMaterial(true); mat.polygonOffset = true; mat.polygonOffsetFactor = 2; mat.polygonOffsetUnits = 4;
    const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.name = 'envVerge'; this.sc.group.add(m); this.vergeMesh = m;
    this.stats.vergeTris = ni / 3;
  };

  EI.Env = Env;
})();
