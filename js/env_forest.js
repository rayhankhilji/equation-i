// Equation I - forest ground (SPA-STITCH): the ground of a hill circuit in the woods (Spa-Francorchamps, ~107 m of relief, Raidillon ~18 %).
// Switched on by ENVDATA.<id>.forest (js/data/spa_stitch.js); the env kind stays 'park' (no generated estate roads / fences / car parks).
//   * terrain heights from a real terrain grid (forest.dem near 20 m / far 120 m, relative to the start line), pulled to the road's own level
//     along the lap (the DEM and the surveyed road profile differ by a few metres) and fading back to the DEM over ~250 m;
//   * near the circuit a shelf and banks: inside the barriers the ground stays under the road / verge; beyond them it may rise at most like the
//     road cap of env.js buildTerrain (12 cm per m for 14 m, then 1.5 : 1) and fall at most 1.1 : 1, so cut banks and drops follow the hill;
//   * the 12 m terrain grid with the exact road cap (env.js 'fine' path, E.dem set), a narrow draped verge (track.js / env_veg.js hooks use
//     forestVergeW) and sc.height = forestGround: the surface actually drawn (terrain mesh, or the verge where it lies above it) - every
//     placement (trees, grass, props, stands) stands on what is visible, never on the centre line's level;
//   * ground colour from the ground-cover rasters (4 m over the lap from satellite colour classes, 16 m OSM landuse beyond): spruce / beech
//     canopy (crown mosaic, the dark forest floor under the near trees), pasture, rough fen grass, paved, gravel, water.
// Methods are added to Env.Ctx; env.js routes initForest / terrainHeight / fieldRGB / paintFieldMap / groundMaterial here when forestOn.
// Other hill circuits (COTA-STITCH): ENVDATA.<id>.forest.planter names the planting module (EI[planter], default EI.SpaForest: build /
// openWindows); its optional `ground` record sets the per-circuit options (pal / mow colours, gs / kin / ring terrain grid, flat shelf, level
// classes, fallback class, rgb / base colour hooks). Without them every default below is Spa's.
window.EI = window.EI || {};
(function () {
  const U = EI.U, Env = EI.Env, Ctx = Env.Ctx;
  const F = {}; EI.EnvForest = F;
  // ground-cover classes
  const C = { SPRUCE: 0, BEECH: 1, PASTURE: 2, ROUGH: 3, PAVED: 5, GRAVEL: 6, WATER: 7 };
  F.C = C;
  // sRGB albedo, muted like env.js PAL (main.js grades with a saturation boost): spruce canopy blue-green, beech mid green, pasture, fen, paved...
  const PAL = { 0: [24, 36, 27], 1: [38, 52, 29], 2: [62, 76, 39], 3: [80, 80, 54], 4: [62, 76, 39], 5: [104, 104, 100], 6: [126, 119, 100], 7: [38, 50, 54] };
  const MOW_A = [54, 64, 37], MOW_B = [60, 70, 41];
  F.PAL = PAL;
  // RLE: one byte per run = class << 5 | (run - 1), rows of z
  F.decodeCover = function (G) {
    const b = Env.b64bytes(G.rle); const n = G.nx * G.nz, cls = new Uint8Array(n); let k = 0;
    for (let i = 0; i < b.length && k < n; i++) { const c = b[i] >> 5, r = (b[i] & 31) + 1; for (let j = 0; j < r && k < n; j++) cls[k++] = c; }
    return { x0: G.x0, z0: G.z0, cell: G.cell, nx: G.nx, nz: G.nz, cls };
  };
  const hash = (i, j, s) => Env.hash2(i, j, s);

  Ctx.prototype.initForest = function () {
    const D = this.data.forest, t = this.t; this.forestOn = true;
    const PL = this.forestPlanter(), O = (PL && PL.ground) || {}; this.fGround = O;   // per-circuit options (none for Spa)
    this.fPal = O.pal ? Object.assign({}, PAL, O.pal) : PAL; this.fMow = O.mow || [MOW_A, MOW_B];
    const decD = (g) => ({ h: g.h, step: g.step, n: g.n, a: Env.decodeI16(g.d) });
    this.dem = { near: decD(D.dem.near), far: decD(D.dem.far) }; this.demZ0 = 0;   // heights are already relative to the start line
    this.fcov = F.decodeCover(D.cover); this.fcovFar = D.coverFar ? F.decodeCover(D.coverFar) : null;
    if (PL && PL.openWindows) PL.openWindows(this);   // (open pasture windows cut into the cover before anything samples it)
    this.terrainGS = O.gs || D.gs || 16; this.terrainKin = O.kin || D.kin || 88; this.terrainRing = O.ring || D.ring || 24; this.terrainQuads = true; this.terrainRingHalves = !!O.ringHalves;   // 16 m grid inside +-1.4 km (the lap is +-0.65 x +-1.05 km; the DEM is 20 m), a ring out to ~3.4 km, 8 tiles: Low budget <= 6 draws / 90 k tris in view
    this.forestFlat = O.flat || 2.5;   // the verge stays level for 2.5 m behind the barrier (debris fence, boards, Armco posts), then drapes   // 12 m grid inside +-1.4 km (the lap is +-0.65 x +-1.05 km): fewer terrain triangles than Monaco's +-1.8 km
    // distance-field grids (10 m): the nearest sample's road level, and the road-minus-DEM offset (smoothed along the lap, fading out by 250 m, blurred)
    const DN = Math.round(Math.sqrt(this.dC.length)); const n = DN * DN; this._DN = DN;
    const off = new Float32Array(t.n); for (let i = 0; i < t.n; i++) off[i] = t.y[i] - this.demAt(t.x[i], t.z[i]);
    const offS = t.smooth ? t.smooth(off, 10) : off;
    this.fTy = new Float32Array(n); let fo = new Float32Array(n);
    for (let k = 0; k < n; k++) { const i = this.dIdx[k]; this.fTy[k] = t.y[i]; fo[k] = offS[i] * (1 - U.smoothstep(30, 250, this.dC[k])); }
    for (let pass = 0; pass < 3; pass++) {   // separable box blur x3 (~gaussian, sigma ~25 m): no seams where the nearest stretch changes
      const tmp = new Float32Array(n); const R = 2;
      for (let j = 0; j < DN; j++) for (let i = 0; i < DN; i++) { let s = 0, c = 0; for (let d = -R; d <= R; d++) { const ii = i + d; if (ii < 0 || ii >= DN) continue; s += fo[j * DN + ii]; c++; } tmp[j * DN + i] = s / c; }
      for (let j = 0; j < DN; j++) for (let i = 0; i < DN; i++) { let s = 0, c = 0; for (let d = -R; d <= R; d++) { const jj = j + d; if (jj < 0 || jj >= DN) continue; s += tmp[jj * DN + i]; c++; } fo[j * DN + i] = s / c; }
    }
    this.fOff = fo;
    // paved / built ground (paddocks, car parks, the pit complex): levelled - the DEM eased towards its ~70 m average there
    const pav = new Float32Array(n), dm = new Float32Array(n), DH = (DN - 1) * 5;
    for (let gz = 0; gz < DN; gz++) for (let gx = 0; gx < DN; gx++) { const x = -DH + gx * 10, z = -DH + gz * 10, k = gz * DN + gx; dm[k] = this.demAt(x, z); const c = this.forestClass(x, z); pav[k] = (O.level ? O.level.indexOf(c) >= 0 : c === C.PAVED) ? 1 : 0; }
    const blur = (src, R, passes) => { let a = src; for (let pass = 0; pass < passes; pass++) { const tmp = new Float32Array(n), out = new Float32Array(n);
      for (let j = 0; j < DN; j++) for (let i = 0; i < DN; i++) { let s2 = 0, c2 = 0; for (let d = -R; d <= R; d++) { const ii = i + d; if (ii < 0 || ii >= DN) continue; s2 += a[j * DN + ii]; c2++; } tmp[j * DN + i] = s2 / c2; }
      for (let j = 0; j < DN; j++) for (let i = 0; i < DN; i++) { let s2 = 0, c2 = 0; for (let d = -R; d <= R; d++) { const jj = j + d; if (jj < 0 || jj >= DN) continue; s2 += tmp[jj * DN + i]; c2++; } out[j * DN + i] = s2 / c2; } a = out; } return a; };
    const pb = blur(pav, 1, 2), db = blur(dm, 3, 2); this.fFlat = new Float32Array(n);
    for (let k = 0; k < n; k++) this.fFlat[k] = (db[k] - dm[k]) * U.smoothstep(0.25, 0.65, pb[k]) * (1 - U.smoothstep(400, 700, this.dC[k]));
    // the visible ground for every placement (Scenery.prototype.height stays for the other circuits)
    const E = this; this.sc.height = (x, z) => E.forestGround(x, z);
    this.stats.forest = { dem: [D.dem.near.n, D.dem.far.n], cover: [this.fcov.nx, this.fcov.nz] };
  };

  // the planting module of this circuit (ENVDATA.<id>.forest.planter, default Spa's)
  Ctx.prototype.forestPlanter = function () { const D = this.data.forest; return D && D.planter ? EI[D.planter] : EI.SpaForest; };
  // ground-cover class at (x, z): the 4 m raster over the lap, the 16 m one beyond, then pasture / forest by a smooth noise
  Ctx.prototype.forestClass = function (x, z) {
    for (const g of [this.fcov, this.fcovFar]) {
      if (!g) continue; const i = Math.floor((x - g.x0) / g.cell), j = Math.floor((z - g.z0) / g.cell);
      if (i >= 0 && j >= 0 && i < g.nx && j < g.nz) return g.cls[j * g.nx + i];
    }
    if (this.fGround.fallback) return this.fGround.fallback(this, x, z);
    return U.fbm(x / 900 + 3.3, z / 900 + 1.7, 3) < 0.52 ? C.SPRUCE : C.PASTURE;
  };
  Ctx.prototype.isCanopy = function (x, z) { const c = this.forestClass(x, z); return c === C.SPRUCE || c === C.BEECH; };

  // natural ground (DEM) pulled to the road level near the lap
  Ctx.prototype.forestDem = function (x, z) { return this.demAt(x, z) + this._bil(this.fOff, x, z, 0) + this._bil(this.fFlat, x, z, 0); };
  // terrain height: shelf + banks near the barriers, the hills beyond
  Ctx.prototype.forestHeight = function (x, z) {
    const G = this.forestDem(x, z); const f = this.fsAt(x, z); if (f > 300) return G;
    const ty = this._bil(this.fTy, x, z, 0);
    if (f <= 0) return ty - 0.35;
    const up = ty - 0.35 + (f < 14 ? f * 0.12 : 1.68 + (f - 14) * 1.5);
    const dn = ty - 0.35 - Math.max(0, f - this.forestFlat - 0.5) * 1.1;
    return Math.min(up, Math.max(dn, G));
  };

  // verge widths per side [L, R] (track.js draped verge ribbon, env_veg grass): a narrow mown band behind the barriers (the terrain carries the
  // same field map beyond it), cut 2 m short of another stretch of the lap
  Ctx.prototype.forestVergeW = function () {
    if (this._fvw) return this._fvw; const t = this.t, n = t.n, MAX = this.data.forest.verge || 6; const out = [new Float32Array(n), new Float32Array(n)];
    for (const [k, side] of [[0, -1], [1, 1]]) {
      const wall = side < 0 ? t.wallL : t.wallR; const raw = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let w = MAX;
        for (let d = 1; d <= MAX + 2; d += 1.5) {
          const l = wall[i] + d; const px = t.x[i] + t.nx[i] * side * l, pz = t.z[i] + t.nz[i] * side * l; const kk = this._near(px, pz); const j = this.dIdx[kk];
          let di = Math.abs(j - i); di = Math.min(di, n - di);
          if (di > 25 && this.dC[kk] < Math.max(t.wallL[j], t.wallR[j]) + 3) { w = Math.max(0.5, d - 2); break; }
        }
        raw[i] = w;
      }
      const er = new Float32Array(n); for (let i = 0; i < n; i++) { let m = MAX; for (let j = -4; j <= 4; j++) m = Math.min(m, raw[(i + j + n) % n]); er[i] = m; }
      out[k] = t.smooth ? t.smooth(er, 3) : er;
    }
    return (this._fvw = out);
  };
  // the draped verge ribbon exactly as track.js builds it (Track.strip: columns at wall + vw x [0, .1, .3, .6, 1] per side, kFold-clamped, y = road
  // level inside wall + forestFlat, else min(road, terrain + 0.25); quads (prev c, cur c, prev c+1) / (prev c+1, cur c, cur c+1), drawn 3 cm low),
  // as a triangle soup in an 8 m cell hash. Built on first use once the terrain mesh exists (the verge samples it).
  const VFL = [1, 0.6, 0.3, 0.1, 0];
  Ctx.prototype._vergeTris = function () {
    if (this._vt) return this._vt; const t = this.t, sc = this.sc, n = t.n; if (!sc.heights) return null;
    const VW = this.forestVergeW(), FL = this.forestFlat, K = 10; const lat = new Float32Array(n * K), yy = new Float32Array(n * K);
    for (let ii = 0; ii < n; ii++) {
      const kf = t.kFold[ii], cap = Math.max(2, 0.9 / (Math.abs(kf) + 1e-6));
      for (let c = 0; c < K; c++) {
        let l = c < 5 ? -(t.wallL[ii] + VW[0][ii] * VFL[c]) : t.wallR[ii] + VW[1][ii] * VFL[K - 1 - c]; if (kf > 0) l = Math.min(l, cap); else l = Math.max(l, -cap);
        const w = l < 0 ? t.wallL[ii] : t.wallR[ii]; let y = 0;
        if (Math.abs(l) >= w + FL) { const g = sc.gridHeight(t.x[ii] + t.nx[ii] * l, t.z[ii] + t.nz[ii] * l) - t.y[ii] + 0.25; y = Math.max(-40, Math.min(0, g)); }
        lat[ii * K + c] = l; yy[ii * K + c] = t.y[ii] + y - 0.03;
      }
    }
    const P = (ii, c) => [t.x[ii] + t.nx[ii] * lat[ii * K + c], yy[ii * K + c], t.z[ii] + t.nz[ii] * lat[ii * K + c]];
    const tris = []; const cell = new Map(), CS = 8;
    const add = (A, B, C) => {
      // (near-vertical slivers where a folded / steeply draped ribbon stands on edge are not ground)
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], wx = C[0] - A[0], wy = C[1] - A[1], wz = C[2] - A[2]; const ny = uz * wx - ux * wz, nl = Math.hypot(uy * wz - uz * wy, ny, ux * wy - uy * wx); if (!(nl > 1e-9) || Math.abs(ny) / nl < 0.3) return;
      const id = tris.length; tris.push([A, B, C]); const x0 = Math.min(A[0], B[0], C[0]), x1 = Math.max(A[0], B[0], C[0]), z0 = Math.min(A[2], B[2], C[2]), z1 = Math.max(A[2], B[2], C[2]);
      for (let gx = Math.floor(x0 / CS); gx <= Math.floor(x1 / CS); gx++) for (let gz = Math.floor(z0 / CS); gz <= Math.floor(z1 / CS); gz++) { const k = gx * 100003 + gz; let l = cell.get(k); if (!l) cell.set(k, l = []); l.push(id); }
    };
    for (let i = 0; i < n; i++) { const a = i, b = (i + 1) % n; for (let c = 0; c < K - 1; c++) { add(P(a, c), P(b, c), P(a, c + 1)); add(P(a, c + 1), P(b, c), P(b, c + 1)); } }
    return (this._vt = { tris, cell, CS });
  };
  // highest verge surface over (x, z) (-Infinity where the ribbon does not cover it)
  Ctx.prototype.vergeAt = function (x, z) {
    const V = this._vergeTris(); if (!V) return -Infinity; const l = V.cell.get(Math.floor(x / V.CS) * 100003 + Math.floor(z / V.CS)); let best = -Infinity; if (!l) return best;
    for (const id of l) {
      const [A, B, C] = V.tris[id]; const d = (B[2] - C[2]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[2] - C[2]); if (Math.abs(d) < 1e-9) continue;
      const a = ((B[2] - C[2]) * (x - C[0]) + (C[0] - B[0]) * (z - C[2])) / d, b = ((C[2] - A[2]) * (x - C[0]) + (A[0] - C[0]) * (z - C[2])) / d, c = 1 - a - b;
      if (a < -1e-4 || b < -1e-4 || c < -1e-4) continue; const y = a * A[1] + b * B[1] + c * C[1]; if (y > best) best = y;
    }
    return best;
  };
  // the surface actually drawn at (x, z): the terrain mesh, or the verge ribbon (road level between the barriers, draped beyond) where it lies above
  // it. Before the terrain exists (layout time) the road level between the barriers stands in for the ribbon.
  Ctx.prototype.forestGround = function (x, z) {
    const sc = this.sc, t = this.t; const g = sc.gridHeight(x, z);
    if (sc.heights) return Math.max(g, this.vergeAt(x, z));   // (no distance shortcut: a wide run-off of another stretch can reach further than the nearest one's barrier)
    if (this.fsAt(x, z) > 20) return g;
    const p = t.project(x, z, null, this._fgp || (this._fgp = {})); const side = p.lat < 0 ? -1 : 1;
    return p.dist <= this.wallCap(p.i, side) + 0.5 ? Math.max(g, t.y[p.i] - 0.03) : g;
  };

  // ground colour (sRGB bytes into out): the class colour with a crown mosaic on canopy, mown stripes in a narrow band behind the barriers
  Ctx.prototype.forestRGB = function (x, z, out, fpre) {
    out = out || [0, 0, 0]; if (this.fGround.rgb) return this.fGround.rgb(this, x, z, out, fpre); const f = this.fsAt(x, z);
    const n1 = this._coarse ? 0.5 : U.noise2(x / 47 + 3.3, z / 47 + 7.1);
    if (f < 7 && f > -40) { const c = (Math.floor((this.dcAt(x, z) - this.t.halfWidth) / 7.5) & 1) ? this.fMow[0] : this.fMow[1]; const k = 0.94 + n1 * 0.1; out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k; return out; }
    let cl = this.forestClass(x, z); if (cl === C.PAVED && f < 35 && f > 0) cl = C.ROUGH;   // (bare run-off fringes behind the barriers read as rough grass, not car parks)
    const c = this.fPal[cl] || this.fPal[2]; let k = 0.9 + n1 * 0.2;
    if (cl <= 1) { const ci = Math.floor(x / 5), cj = Math.floor(z / 5); k *= 0.72 + 0.5 * hash(ci, cj, cl + 3); }
    else if (cl === 2) k *= 0.94 + 0.12 * U.noise2(x / 140 + 1.1, z / 140 + 4.7);
    out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k; return out;
  };
  // paint the field map base from the cover rasters (pixel space ctx, before the venue overlays): far raster, then the 4 m one with a crown mosaic
  Ctx.prototype.forestBase = function (ctx, S, H) {
    if (this.fGround.base) return this.fGround.base(this, ctx, S, H);
    const ppm = S / (2 * H); const PAL = this.fPal;
    const draw = (g, crown) => {
      if (!g) return; const [c, cx] = Env.canvas(g.nx, g.nz); const im = cx.createImageData(g.nx, g.nz), d = im.data;
      for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
        const o = j * g.nx + i; let cl = g.cls[o]; if (crown && cl === C.PAVED) { const f = this.fsAt(g.x0 + (i + 0.5) * g.cell, g.z0 + (j + 0.5) * g.cell); if (f > 0 && f < 35) cl = C.ROUGH; } const p = PAL[cl] || PAL[2]; let v = 0.92 + 0.14 * hash(i, j, 11);
        if (cl <= 1 && crown) v = 0.68 + 0.56 * hash(i, j, cl + 5);   // crowns ~4 m: lit tops and dark gaps
        else if (cl <= 1) v = 0.8 + 0.3 * hash(i, j, 9);
        d[o * 4] = p[0] * v; d[o * 4 + 1] = p[1] * v; d[o * 4 + 2] = p[2] * v; d[o * 4 + 3] = 255;
      }
      cx.putImageData(im, 0, 0);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(c, (g.x0 + H) * ppm, (g.z0 + H) * ppm, g.nx * g.cell * ppm, g.nz * g.cell * ppm); ctx.restore();
    };
    draw(this.fcovFar, false); draw(this.fcov, true);
  };
})();
(function () {
  const Env = EI.Env, Ctx = Env.Ctx, F = EI.EnvForest;
  // grass tufts (env_veg buildGrass): beyond the barrier not on paved / gravel / water ground and only a few under the canopy away from its edge
  Ctx.prototype.forestGrassOk = function (x, z, beyond) {
    if (this.occAt(x, z) & Env.OCC.ROAD) return false;   // (roads / service roads drawn over the ground, also inside the wide run-offs)
    const t = this.t; const p = t.project(x, z, null, this._fgo || (this._fgo = {})); const side = p.lat < 0 ? -1 : 1, i = p.i;
    if (beyond <= 0) return Math.abs(t.kFold ? t.kFold[i] : 0) < 0.02;   // inside the barriers the track's own strips decide; none in hairpins (folded ribbons)
    // not on the outer edge of the draped verge (the ribbon's last step and the terrain mesh differ by up to its 0.25 m lift)
    const wc = this.wallCap(i, side), e = p.dist - wc - this.forestVergeW()[side < 0 ? 0 : 1][i]; if (e > -1.2 && e < 0.8) return false;
    // nor on the draped part of the verge where it drops steeply (the ribbon's steps and its quads between two cross-sections differ there)
    if (e <= -1.2 && p.dist > wc + this.forestFlat - 0.3) { const a = this.forestGround(x - t.nx[i] * side * 0.8, z - t.nz[i] * side * 0.8), b = this.forestGround(x + t.nx[i] * side * 0.8, z + t.nz[i] * side * 0.8); if (Math.abs(a - b) > 0.5) return false; }
    const c = this.forestClass(x, z); if (c === F.C.PAVED || c === F.C.GRAVEL || c === F.C.WATER) return false;
    if (c <= 1 && beyond > 5) return Env.hash2(Math.round(x * 3), Math.round(z * 3), 61) < 0.2;
    if (c === 4) return Env.hash2(Math.round(x * 3), Math.round(z * 3), 63) < 0.3;   // (bare caliche / limestone, COTA: a few tufts; no such class on Spa)
    return true;
  };
})();
