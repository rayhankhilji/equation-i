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
    const decD = (g) => ({ h: g.h, step: g.step, n: g.n, a: Env.decodeI16(g.d) });
    this.dem = { near: decD(D.dem.near), far: decD(D.dem.far) }; this.demZ0 = 0;   // heights are already relative to the start line
    this.fcov = F.decodeCover(D.cover); this.fcovFar = D.coverFar ? F.decodeCover(D.coverFar) : null;
    this.terrainKin = D.kin || 118;   // 12 m grid inside +-1.4 km (the lap is +-0.65 x +-1.05 km): fewer terrain triangles than Monaco's +-1.8 km
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
    // the visible ground for every placement (Scenery.prototype.height stays for the other circuits)
    const E = this; this.sc.height = (x, z) => E.forestGround(x, z);
    this.stats.forest = { dem: [D.dem.near.n, D.dem.far.n], cover: [this.fcov.nx, this.fcov.nz] };
  };

  // ground-cover class at (x, z): the 4 m raster over the lap, the 16 m one beyond, then pasture / forest by a smooth noise
  Ctx.prototype.forestClass = function (x, z) {
    for (const g of [this.fcov, this.fcovFar]) {
      if (!g) continue; const i = Math.floor((x - g.x0) / g.cell), j = Math.floor((z - g.z0) / g.cell);
      if (i >= 0 && j >= 0 && i < g.nx && j < g.nz) return g.cls[j * g.nx + i];
    }
    return U.fbm(x / 900 + 3.3, z / 900 + 1.7, 3) < 0.52 ? C.SPRUCE : C.PASTURE;
  };
  Ctx.prototype.isCanopy = function (x, z) { const c = this.forestClass(x, z); return c === C.SPRUCE || c === C.BEECH; };

  // natural ground (DEM) pulled to the road level near the lap
  Ctx.prototype.forestDem = function (x, z) { return this.demAt(x, z) + this._bil(this.fOff, x, z, 0); };
  // terrain height: shelf + banks near the barriers, the hills beyond
  Ctx.prototype.forestHeight = function (x, z) {
    const G = this.forestDem(x, z); const f = this.fsAt(x, z); if (f > 300) return G;
    const ty = this._bil(this.fTy, x, z, 0);
    if (f <= 0) return ty - 0.35;
    const up = ty - 0.35 + (f < 14 ? f * 0.12 : 1.68 + (f - 14) * 1.5);
    const dn = ty - 0.35 - Math.max(0, f - 1.5) * 1.1;
    return Math.min(up, Math.max(dn, G));
  };

  // verge widths per side [L, R] (track.js draped verge ribbon, env_veg grass): a narrow mown band behind the barriers (the terrain carries the
  // same field map beyond it), cut 2 m short of another stretch of the lap
  Ctx.prototype.forestVergeW = function () {
    if (this._fvw) return this._fvw; const t = this.t, n = t.n, MAX = this.data.forest.verge || 9; const out = [new Float32Array(n), new Float32Array(n)];
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
  // the draped verge's height at lateral distance d (beyond the barrier) of sample i on a side - same steps as track.js (VF 0, .1, .3, .6, 1 of
  // the width, each at min(road, grid + 0.25)), null outside the ribbon
  const VF = [0, 0.1, 0.3, 0.6, 1];
  Ctx.prototype._vergeY = function (i, side, d) {
    const t = this.t, sc = this.sc; const VW = this.forestVergeW(); const vw = VW[side < 0 ? 0 : 1][i], w = side < 0 ? t.wallL[i] : t.wallR[i];
    const kf = t.kFold ? t.kFold[i] : 0; const cap = Math.max(2, 0.9 / (Math.abs(kf) + 1e-6)); const folded = (kf > 0) === (side > 0);
    const W0 = folded ? Math.min(w, cap) : w, W1 = folded ? Math.min(w + vw, cap) : w + vw;
    if (d > W1 + 0.01) return null; if (d <= W0 + 0.5) return t.y[i];
    const yAt = (l) => { if (l < w + 0.5) return t.y[i]; const g = sc.gridHeight(t.x[i] + t.nx[i] * side * l, t.z[i] + t.nz[i] * side * l) - t.y[i] + 0.25; return t.y[i] + Math.max(-40, Math.min(0, g)); };
    for (let k = 0; k + 1 < VF.length; k++) { let a = w + vw * VF[k], b = w + vw * VF[k + 1]; if (folded) { a = Math.min(a, cap); b = Math.min(b, cap); } if (d <= b) { const u = b > a ? (d - a) / (b - a) : 0; return yAt(a) + (yAt(b) - yAt(a)) * U.clamp(u, 0, 1); } }
    return null;
  };
  // the surface actually drawn at (x, z): road level between the barriers (road / run-off / verge), the draped verge where it lies above the
  // terrain mesh, the terrain mesh elsewhere
  Ctx.prototype.forestGround = function (x, z) {
    const sc = this.sc, t = this.t; const g = sc.gridHeight(x, z);
    if (this.fsAt(x, z) > 20) return g;
    const p = t.project(x, z, null, this._fgp || (this._fgp = {})); const side = p.lat < 0 ? -1 : 1; const d = p.dist;
    const i = p.i, j = p.along >= 0 ? (i + 1) % t.n : (i - 1 + t.n) % t.n; const u = U.clamp(Math.abs(p.along) / t.ds, 0, 1);
    const wi = side < 0 ? t.wallL[i] : t.wallR[i];
    if (d <= wi + 0.5) return Math.max(g, t.y[i] + (t.y[j] - t.y[i]) * u - 0.03);
    if (!sc.heights) return g;   // before the terrain is built: no verge yet
    const a = this._vergeY(i, side, d), b = this._vergeY(j, side, d);
    if (a == null && b == null) return g;
    const v = a == null ? b : b == null ? a : a + (b - a) * u;
    return Math.max(g, v - 0.03);
  };

  // ground colour (sRGB bytes into out): the class colour with a crown mosaic on canopy, mown stripes in a narrow band behind the barriers
  Ctx.prototype.forestRGB = function (x, z, out, fpre) {
    out = out || [0, 0, 0]; const f = this.fsAt(x, z);
    const n1 = this._coarse ? 0.5 : U.noise2(x / 47 + 3.3, z / 47 + 7.1);
    if (f < 7 && f > -40) { const c = (Math.floor((this.dcAt(x, z) - this.t.halfWidth) / 7.5) & 1) ? MOW_A : MOW_B; const k = 0.94 + n1 * 0.1; out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k; return out; }
    const cl = this.forestClass(x, z); const c = PAL[cl] || PAL[2]; let k = 0.9 + n1 * 0.2;
    if (cl <= 1) { const ci = Math.floor(x / 5), cj = Math.floor(z / 5); k *= 0.72 + 0.5 * hash(ci, cj, cl + 3); }
    else if (cl === 2) k *= 0.94 + 0.12 * U.noise2(x / 140 + 1.1, z / 140 + 4.7);
    out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k; return out;
  };
  // paint the field map base from the cover rasters (pixel space ctx, before the venue overlays): far raster, then the 4 m one with a crown mosaic
  Ctx.prototype.forestBase = function (ctx, S, H) {
    const ppm = S / (2 * H);
    const draw = (g, crown) => {
      if (!g) return; const [c, cx] = Env.canvas(g.nx, g.nz); const im = cx.createImageData(g.nx, g.nz), d = im.data;
      for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
        const o = j * g.nx + i, cl = g.cls[o]; const p = PAL[cl] || PAL[2]; let v = 0.92 + 0.14 * hash(i, j, 11);
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
