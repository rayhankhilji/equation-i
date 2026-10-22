// Equation I - Texas Hill Country ground and planting at the Circuit of the Americas (COTA-STITCH). Runs on the hill ground of js/env_forest.js
// (ENVDATA.cota.forest from js/data/cota_stitch.js, planter 'CotaVeg': sc.height = the drawn ground, shelf + draped verge, levelled car parks).
//   * ground colour (EI.CotaVeg.ground rgb / base hooks of env_forest.js): late-October prairie - straw-gold / tan / olive tall grass in broad
//     patches, mown tan-green circuit grass near the lap, dark juniper and live-oak crowns, speckled mesquite brush, pale caliche / limestone,
//     grey paving, trampled grass / gravel car parks;
//   * planting from the 4 m cover raster (satellite colour classes) and the 16 m one beyond: live-oak motts and creek woods (OAK column of the
//     'texas' atlas: broad low live oak, side B a more open cedar elm), ashe juniper thickets (POPLAR column: dark blue-green cone), mesquite on
//     the brush and lone in the grass (PINE column: crooked stems, airy pale crown), prairie brush / yaupon clumps (SHRUB column); one record
//     list -> Veg.instance (one near + one far draw, shared atlas), wood edges -> E.innerStrips (Low / Medium beyond the billboard range);
//   * limestone outcrops: a few hundred low faceted rocks on the caliche and the steeper grass banks, one instanced draw gathered round the eye,
//     each bedded on the lowest ground under it (never floating, at most ~30 % of its height in the ground).
// Never in the drivable corridor (occupancy + E.clearOfTrack + the verge edge rule, as Spa).
window.EI = window.EI || {};
(function () {
  const U = EI.U, Env = EI.Env;
  const CV = {}; EI.CotaVeg = CV;
  // cover classes (js/data/cota_stitch.js; env_forest.js keeps 0 / 1 = canopy, 5 paved, 6 'gravel', 7 water)
  const C = { EVER: 0, WOOD: 1, GRASS: 2, BRUSH: 3, CALICHE: 4, PAVED: 5, LOT: 6, WATER: 7 };
  CV.C = C;
  // sRGB albedo, muted like env.js PAL (main.js grades with a saturation boost)
  const PAL = { 0: [26, 37, 29], 1: [36, 46, 26], 2: [110, 90, 63], 3: [94, 80, 56], 4: [152, 145, 124], 5: [116, 114, 108], 6: [122, 107, 75], 7: [40, 54, 56] };
  // (COTA-UPGRADE: the photos' sunlit verges and infield read a duller, browner straw (~163,127,81 / 125,96,64 on screen) than the game's
  // ochre (206,176,86): two calibrated steps, ~15 % less value, a touch more red than green, more blue - i.e. less saturated)
  const PRAIRIE = [[124, 95, 66], [110, 86, 63], [100, 88, 62]];   // straw gold, tan-brown, olive straw (October: dormant warm-season grass)
  const MOWN = [[108, 90, 64], [113, 94, 67]];                     // the mown circuit grass, stripes 7.5 m (COTA-BEAUTY: warmer / +12 % so the verges read sun-cured gold at eye height)
  const BRUSHC = [58, 60, 38], CROWN_EVER = [24, 35, 28], CROWN_WOOD = [34, 44, 24];
  // sector table keyed by turn number (SPEC 4.8): [from turn, ds, to turn, ds, tree density factor] - applied near the lap only (the cover
  // raster decides beyond), relative to 0.35
  const SECTORS = [[20, -300, 1, 0, 0.05], [1, 0, 2, 150, 0.2], [2, 150, 9, 0, 0.35], [9, 0, 11, 0, 0.15], [11, 0, 12, -300, 0.1], [12, 0, 15, 0, 0.3], [15, 0, 19, 0, 0.5], [19, 0, 20, 100, 0.2]];
  CV.SECTORS = SECTORS;
  // per-instance colour multipliers (Veg.instance record [8])
  const OAK_C = [0.74, 0.82, 0.72], ELM_C = [0.86, 0.9, 0.76], JUN_C = [0.74, 0.84, 0.86], MESQ_C = [0.92, 0.96, 0.84], BRUSH_C = [0.9, 0.9, 0.8];
  const hash = (i, j, s) => Env.hash2(i, j, s);
  const mix3 = (a, b, t, out) => { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; return out; };
  const _pc = [0, 0, 0], _pm = [0, 0, 0];
  // prairie colour at (x, z): broad patches of gold / tan / olive (60-300 m), mown tan-green near the circuit (fs = metres beyond the barrier)
  function prairie(x, z, fs, out) {
    const a = U.noise2(x / 210 + 7.7, z / 210 + 1.9), b = U.noise2(x / 75 + 2.3, z / 75 + 5.1);
    mix3(PRAIRIE[0], PRAIRIE[1], U.smoothstep(0.35, 0.75, a), _pc); mix3(_pc, PRAIRIE[2], U.smoothstep(0.55, 0.85, b) * 0.7, _pc);
    const mk = 1 - U.smoothstep(40, 170, fs); if (mk > 0) { mix3(MOWN[0], MOWN[1], b, _pm); mix3(_pc, _pm, mk, _pc); }
    out[0] = _pc[0]; out[1] = _pc[1]; out[2] = _pc[2]; return out;
  }
  // class colour (sRGB) with a per-cell variation v (0..1, hash) and the crown / brush mosaic
  function classRGB(E, cl, x, z, fs, v, crown, out) {
    if (cl === C.GRASS || cl === C.BRUSH) {
      prairie(x, z, fs, out); let k = 0.96 + 0.07 * v;
      if (cl === C.BRUSH && crown === 2 && v < 0.42) { const c = BRUSHC; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; k = 0.75 + 0.5 * v; }   // shrub / mesquite crowns in the brush (point colour; the field map draws them as round blobs)
      else if (cl === C.BRUSH) k *= 0.9;
      out[0] *= k; out[1] *= k; out[2] *= k; return out;
    }
    const p = cl === C.EVER ? CROWN_EVER : cl === C.WOOD ? CROWN_WOOD : PAL[cl] || PAL[2]; let k = 0.92 + 0.14 * v;
    if (cl <= 1) k = crown ? 0.66 + 0.6 * v : 0.8 + 0.3 * v;   // crowns ~4 m: lit tops and dark gaps
    else if (cl === C.CALICHE) { if (crown === 1) { prairie(x, z, fs, out); return out; } k = 0.84 + 0.26 * v; }   // (field map: prairie under the round caliche patches)
    out[0] = p[0] * k; out[1] = p[1] * k; out[2] = p[2] * k; return out;
  }
  CV.ground = {
    pal: PAL, mow: MOWN,
    gs: 16, kin: 76, ring: 24, ringHalves: true,          // 16 m grid inside +-1.2 km (the lap is +-0.91 x +-0.52 km), 6 tiles (2 x 2 fine + the ring in 2 halves: <= 6 draws / 80 k tris)
    level: [C.PAVED, C.LOT],            // paddock, plaza and every car park (gravel / grass lots) levelled
    // beyond the 16 m raster (+-2.6 km): prairie with wooded draws
    fallback: (E, x, z) => U.fbm(x / 700 + 3.3, z / 700 + 1.7, 3) < 0.36 ? C.WOOD : C.GRASS,
    // ground colour at a point (venue pixels near the lap, far terrain vertex colours)
    rgb(E, x, z, out) {
      const f = E.fsAt(x, z); const n1 = E._coarse ? 0.5 : U.noise2(x / 47 + 3.3, z / 47 + 7.1);
      if (f < 7 && f > -40) { const c = (Math.floor((E.dcAt(x, z) - E.t.halfWidth) / 7.5) & 1) ? MOWN[0] : MOWN[1]; const k = 0.94 + n1 * 0.1; out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k; return out; }
      let cl = E.forestClass(x, z); if (cl === C.PAVED && f < 35 && f > 0) cl = C.GRASS;   // (bare run-off fringes behind the barriers read as grass, not paving)
      if (cl === C.CALICHE && f < 25) cl = C.GRASS;
      return classRGB(E, cl, x, z, f, E._coarse ? 0.5 : hash(Math.floor(x / 4), Math.floor(z / 4), 11), E._coarse ? 0 : 2, out);
    },
    // the field map base from the cover rasters (pixel space ctx, before the venue overlays): far raster, then the 4 m one with the crown mosaic
    base(E, ctx, S, H) {
      const ppm = S / (2 * H); const col = [0, 0, 0];
      const draw = (g, crown) => {
        if (!g) return; const [c, cx] = Env.canvas(g.nx, g.nz); const im = cx.createImageData(g.nx, g.nz), d = im.data;
        for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
          const o = j * g.nx + i, x = g.x0 + (i + 0.5) * g.cell, z = g.z0 + (j + 0.5) * g.cell; let cl = g.cls[o]; const fs = E.fsAt(x, z);
          if (crown && cl === C.PAVED && fs > 0 && fs < 35) cl = C.GRASS; if (cl === C.CALICHE && fs < 25) cl = C.GRASS;
          classRGB(E, cl, x, z, fs, hash(i, j, crown ? 5 + cl : 9), crown ? 1 : 0, col);
          d[o * 4] = col[0]; d[o * 4 + 1] = col[1]; d[o * 4 + 2] = col[2]; d[o * 4 + 3] = 255;
        }
        cx.putImageData(im, 0, 0);
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(c, (g.x0 + H) * ppm, (g.z0 + H) * ppm, g.nx * g.cell * ppm, g.nz * g.cell * ppm); ctx.restore();
      };
      draw(E.fcovFar, false); draw(E.fcov, true);
      // brush crowns and caliche / limestone patches as round blobs (4 m cells drawn as flat squares read as a grid from the air)
      { const G = E.fcov; ctx.save(); ctx.setTransform(ppm, 0, 0, ppm, S / 2, S / 2); const paths = [[], [], [], []];
        for (let j = 0; j < G.nz; j++) for (let i = 0; i < G.nx; i++) {
          const c = G.cls[j * G.nx + i]; if (c !== C.BRUSH && c !== C.CALICHE) continue; const x = G.x0 + (i + 0.5) * G.cell, z = G.z0 + (j + 0.5) * G.cell; const v = hash(i, j, 5 + c);
          if (c === C.BRUSH && v >= 0.42) continue; if (c === C.CALICHE && E.fsAt(x, z) < 25) continue;
          const jx = (hash(i, j, 21) - 0.5) * 3, jz = (hash(i, j, 22) - 0.5) * 3, r = c === C.BRUSH ? 1.3 + 1.3 * hash(i, j, 23) : 2.2 + 1.4 * hash(i, j, 23);
          paths[(c === C.BRUSH ? 0 : 2) + (v < 0.21 ? 0 : 1)].push(x + jx, z + jz, r);
        }
        const cols = ['rgb(46,49,31)', 'rgb(66,67,42)', 'rgb(140,132,110)', 'rgb(158,150,126)'];
        paths.forEach((P, k) => { if (!P.length) return; ctx.fillStyle = cols[k]; ctx.globalAlpha = k < 2 ? 0.85 : 0.7; ctx.beginPath(); for (let q = 0; q < P.length; q += 3) { ctx.moveTo(P[q] + P[q + 2], P[q + 1]); ctx.arc(P[q], P[q + 1], P[q + 2], 0, 6.283); } ctx.fill(); });
        ctx.restore(); }
      // creeks (OSM waterways): in late October mostly dry - a dark riparian band with a pale limestone-cobble bed, broken under the circuit
      ctx.save(); ctx.setTransform(ppm, 0, 0, ppm, S / 2, S / 2); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const [style, wk, w0] of [['rgba(38,46,27,0.5)', 0.9, 7], ['rgba(146,138,116,0.75)', 0.22, 1.8]]) {
        ctx.strokeStyle = style;
        for (const r of E.data.rivers || []) {
          if (!r.pts || r.pts.length < 2) continue; ctx.lineWidth = Math.max(w0, (r.w || 3) * wk); ctx.beginPath(); let pen = false;
          for (const [x, z] of r.pts) { if (Math.abs(x) > H || Math.abs(z) > H || E.fsAt(x, z) < 4) { pen = false; continue; } if (pen) ctx.lineTo(x, z); else ctx.moveTo(x, z); pen = true; }
          ctx.stroke();
        }
      }
      ctx.restore();
    },
  };

  // ---------------------------------------------------------------- the 'texas' tree atlas (env_veg.js paintAtlas variant; same 512 px cells)
  const APAL = {
    liveoak: { dark: [13, 19, 12], mid: [31, 41, 23], light: [54, 66, 37], glow: [82, 92, 54], leaf: 4.4, density: 0.09, holes: 3 },
    elm: { dark: [24, 29, 17], mid: [56, 63, 34], light: [98, 102, 58], glow: [140, 138, 88], leaf: 4.4, density: 0.065, holes: 9 },
    juniper: { dark: [11, 19, 16], mid: [28, 40, 31], light: [52, 66, 48], glow: [80, 94, 70], leaf: 3.8, density: 0.13 },
    juniper2: { dark: [13, 20, 15], mid: [33, 44, 31], light: [60, 72, 50], glow: [90, 100, 72], leaf: 3.8, density: 0.13 },
    mesquite: { dark: [36, 42, 26], mid: [74, 84, 50], light: [118, 126, 80], glow: [156, 160, 108], leaf: 3.4, density: 0.05, holes: 16 },
    brush: { dark: [24, 28, 17], mid: [54, 60, 35], light: [90, 94, 57], glow: [128, 128, 84], leaf: 4.4, density: 0.08 },
    brush2: { dark: [38, 36, 23], mid: [78, 74, 45], light: [118, 110, 69], glow: [158, 146, 98], leaf: 4.2, density: 0.075 },
  };
  function paintTexas(h) {
    const { CW, rowA, rowB, rowT, cell, lobe, trunk, branch, oakSide, shrubSide, top } = h; const bark = '#3a3029', barkL = '#57493b';
    // live oak: short thick trunk, heavy limbs reaching out sideways, a broad low dome much wider than tall that hangs down at the sides
    const liveOak = (ox, oy, seed) => {
      const r = U.rng(seed); trunk(ox, oy, 256, 512, 380, 40, 26, bark); trunk(ox, oy, 264, 512, 400, 12, 7, barkL);
      for (let b = 0; b < 8; b++) { const dir = b % 2 ? 1 : -1; branch(ox, oy, 256 + dir * 6, 400 - b * 6, 256 + dir * (70 + r() * 90), 320 - r() * 70, 13 - b, bark); }   // (limbs end inside the crown: no bare sticks past its edge)
      const lobes = []; for (let i = 0; i < 26; i++) { const a = r() * 6.283, d = Math.pow(r(), 0.55) * 0.86; let x = Math.cos(a) * d * 236, y = Math.sin(a) * d * 128; if (y > 0) y *= 0.8 + 0.35 * Math.abs(x) / 236; lobes.push({ x: 256 + x, y: 250 + y, rx: 46 + r() * 36, ry: 36 + r() * 24 }); }
      lobes.sort((a, b) => a.y - b.y); const global = (y) => 1.1 - U.clamp((y - 110) / 300, 0, 1) * 0.66;
      for (const L of lobes) lobe(r, ox, oy, L, APAL.liveoak, global);
    };
    // ashe juniper: dense, dark blue-green, a rounded irregular cone from near the ground, a few short stems below
    const juniper = (ox, oy, seed, pal) => {
      const r = U.rng(seed); trunk(ox, oy, 248, 512, 440, 12, 8, bark); trunk(ox, oy, 266, 512, 448, 10, 6, bark);
      const global = (y) => 1.02 - U.clamp((y - 30) / 450, 0, 1) * 0.5;
      for (let k = 0; k < 24; k++) {
        const y = 40 + k * 17.2 + r() * 6; const u = U.clamp((y - 30) / 430, 0, 1); const hwid = 52 + 176 * Math.pow(u, 0.55) * (0.8 + r() * 0.2) * (u > 0.9 ? 0.92 : 1);   // (rounded, bushy top - not a spruce spire)
        lobe(r, ox, oy, { x: 256 + (r() - 0.5) * hwid * 0.5, y, rx: hwid * (0.7 + r() * 0.25), ry: 18 + u * 14 }, pal, global);
        if (u > 0.2 && r() < 0.6) { const sd = r() < 0.5 ? -1 : 1; lobe(r, ox, oy, { x: 256 + sd * hwid * 0.55, y: y + 8, rx: hwid * 0.42, ry: 16 + u * 10 }, pal, global); }
      }
    };
    // mesquite: two or three crooked dark stems forking low, an open feathery pale-green crown, wide and flat-topped, lots of sky through it
    const mesquite = (ox, oy, seed) => {
      const r = U.rng(seed); const pal = APAL.mesquite;
      for (let k = 0; k < 3; k++) { const x1 = 256 + (k - 1) * (60 + r() * 50), y1 = 300 - r() * 40; branch(ox, oy, 252 + (k - 1) * 8, 512, x1, y1, 15 - k * 3, bark); branch(ox, oy, x1, y1, x1 + (r() - 0.5) * 100, 215 - r() * 40, 7, bark); }
      const lobes = []; for (let i = 0; i < 24; i++) { const a = r() * 6.283, d = Math.sqrt(r()); lobes.push({ x: 256 + Math.cos(a) * d * 210, y: 200 + Math.sin(a) * d * 70 + Math.abs(Math.cos(a)) * d * 18, rx: 40 + r() * 34, ry: 24 + r() * 16 }); }
      lobes.sort((a, b) => a.y - b.y); const global = (y) => 1.08 - U.clamp((y - 120) / 190, 0, 1) * 0.5;
      for (const L of lobes) lobe(r, ox, oy, L, pal, global);
    };
    cell(0, rowA, () => liveOak(0, rowA, 111)); cell(0, rowB, () => oakSide(0, rowB, 23, APAL.elm, true)); cell(0, rowT, () => top(0, rowT, 5, APAL.liveoak, 210, 14));
    cell(CW, rowA, () => juniper(CW, rowA, 131, APAL.juniper)); cell(CW, rowB, () => juniper(CW, rowB, 137, APAL.juniper2)); cell(CW, rowT, () => top(CW, rowT, 7, APAL.juniper, 140, 10, true));
    cell(CW * 2, rowA, () => mesquite(CW * 2, rowA, 141)); cell(CW * 2, rowB, () => mesquite(CW * 2, rowB, 147)); cell(CW * 2, rowT, () => top(CW * 2, rowT, 9, APAL.mesquite, 190, 13));
    cell(CW * 3, rowA, () => shrubSide(CW * 3, rowA, 53, APAL.brush)); cell(CW * 3, rowB, () => shrubSide(CW * 3, rowB, 59, APAL.brush2)); cell(CW * 3, rowT, () => top(CW * 3, rowT, 13, APAL.brush, 200, 12));
  }
  CV.atlas = 'texas';
  if (EI.EnvVeg) { EI.EnvVeg.atlas = EI.EnvVeg.atlas || {}; EI.EnvVeg.atlas.texas = { cols: [0, 1, 2, 3], paint: paintTexas }; }

  // ---------------------------------------------------------------- planting
  CV.build = function (E, Veg) {
    const T0 = performance.now(); const t = E.t, sc = E.sc, SP = Veg.SP, OCC = Env.OCC, rng = U.rng(2025); const trees = [];
    const cs = (k) => { const c = (t.data.corners || []).find(q => q.t === k); return c ? c.s : null; };
    const sect = []; for (const [a, da, b, db, f] of SECTORS) { const s0 = cs(a), s1 = cs(b); if (s0 == null || s1 == null) continue; sect.push([U.mod(s0 + da, t.length), U.mod(s1 + db, t.length), f]); }
    const facAt = (s) => { for (const [a, b, f] of sect) if (a <= b ? s >= a && s < b : s >= a || s < b) return f; return 0.35; };
    const BLOCK = OCC.ROAD | OCC.BUILT | OCC.PARK | OCC.WATER | OCC.KEEP;
    const VW = E.forestVergeW(), fp = {};
    // never in the corridor, not on the outer edge of the draped verge (its last step floats up to 0.25 m over the terrain mesh)
    const free = (x, z, r) => { if (E.occAt(x, z) & BLOCK) return false; if (E.fsAt(x, z) < r + 2.5 || !E.clearOfTrack(x, z, r + 2.5)) return false; t.project(x, z, null, fp); const sd = fp.lat < 0 ? -1 : 1; const e = fp.dist - E.wallCap(fp.i, sd) - VW[sd < 0 ? 0 : 1][fp.i]; return e < -1.2 || e > 1.2; };
    const G = E.fcov, nx = G.nx, nz = G.nz, cl = G.cls, A = G.cell; const ed = new Float32Array(nx * nz);
    // edge distance (metres to the nearest open cell) on the 4 m raster: two-pass chamfer
    for (let k = 0; k < nx * nz; k++) ed[k] = cl[k] <= 1 ? 1e4 : 0;
    const B = A * 1.4142;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (!ed[k]) continue; let v = ed[k]; if (i > 0) v = Math.min(v, ed[k - 1] + A); if (j > 0) { v = Math.min(v, ed[k - nx] + A); if (i > 0) v = Math.min(v, ed[k - nx - 1] + B); if (i < nx - 1) v = Math.min(v, ed[k - nx + 1] + B); } ed[k] = v; }
    for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const k = j * nx + i; if (!ed[k]) continue; let v = ed[k]; if (i < nx - 1) v = Math.min(v, ed[k + 1] + A); if (j < nz - 1) { v = Math.min(v, ed[k + nx] + A); if (i < nx - 1) v = Math.min(v, ed[k + nx + 1] + B); if (i > 0) v = Math.min(v, ed[k + nx - 1] + B); } ed[k] = v; }
    const n = { oak: 0, elm: 0, juniper: 0, mesquite: 0, brush: 0, far: 0 };
    // species: [sp, width, height, variant, tint, colour] (tint -1..1 darkens / lightens the instance, env_veg br = 0.82 + tint * 0.3)
    const liveOak = () => { const s = 0.8 + rng() * 0.45; return [SP.OAK, 13 * s, 9.5 * s, 0, -0.35 + rng() * 0.4, OAK_C, 'oak']; };
    const elm = () => { const s = 0.8 + rng() * 0.4; return [SP.OAK, 10 * s, 12 * s, 1, -0.1 + rng() * 0.4, ELM_C, 'elm']; };
    const juniper = () => { const s = 0.75 + rng() * 0.5; return [SP.POPLAR, 4.6 * s, 7.6 * s, rng() < 0.5 ? 0 : 1, -0.5 + rng() * 0.35, JUN_C, 'juniper']; };
    const mesquite = () => { const s = 0.75 + rng() * 0.5; return [SP.PINE, 8 * s, 6.2 * s, rng() < 0.5 ? 0 : 1, -0.1 + rng() * 0.4, MESQ_C, 'mesquite']; };
    const brush = () => { const s = 0.7 + rng() * 0.6; return [SP.SHRUB, 3.4 * s, 2.4 * s, rng() < 0.55 ? 0 : 1, -0.3 + rng() * 0.4, BRUSH_C, 'brush']; };
    const plant = (x, z, kind, interior) => { const [sp, w, h, v, tint, cm, nm] = kind(); if (!free(x, z, w * 0.5)) return false; trees.push([x, z, sp, w, h, v, tint, interior ? 1 : 0, cm]); n[nm]++; return true; };
    // ---- 4 m raster: jittered 5 m lattice
    const ST = 5; const x0 = G.x0, z0 = G.z0, X1 = G.x0 + nx * A, Z1 = G.z0 + nz * A; const pr = {};
    for (let z = z0 + 2; z < Z1; z += ST) for (let x = x0 + 2 + ((Math.round(z / ST) & 1) ? ST / 2 : 0); x < X1; x += ST) {
      const px = x + (rng() - 0.5) * ST * 0.8, pz = z + (rng() - 0.5) * ST * 0.8; const i = Math.floor((px - x0) / A), j = Math.floor((pz - z0) / A); if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
      const k = j * nx + i, c = cl[k]; const fs = E.fsAt(px, pz); if (fs < 3) continue;
      let sf = 1; if (fs < 220) { t.project(px, pz, null, pr); sf = U.lerp(U.clamp(facAt(pr.s) / 0.35, 0.15, 1.5), 1, U.smoothstep(60, 220, fs)); }
      const far = fs > 700 ? 0.35 : fs > 350 ? 0.65 : 1;   // (PERF: thinner far stands, the crown mosaic of the field map carries them)
      const rr = rng();
      if (c <= 1) {
        const de = ed[k]; const p = (de <= 8 ? 0.42 : de <= 20 ? 0.2 : 0.09) * sf * far; if (rr > p) continue;
        const stand = U.noise2(px / 140 + 5.3, pz / 140 + 2.1);   // oak motts vs juniper brakes in stands of ~100 m
        const q = rng(); let kind;
        if (c === C.EVER) kind = q < 0.25 + 0.5 * stand ? liveOak : juniper;
        else kind = q < 0.55 ? liveOak : q < 0.82 ? elm : q < 0.92 ? juniper : mesquite;
        if (!plant(px, pz, kind, de > 12)) continue;
        // understory at the wood edge: brush and young juniper
        if (de <= 6 && fs < 400 && rng() < 0.3) plant(px + (rng() - 0.5) * 4, pz + (rng() - 0.5) * 4, rng() < 0.6 ? brush : juniper, false);
      } else if (c === C.BRUSH) {
        if (rr > 0.07 * sf * far) continue; const q = rng(); plant(px, pz, q < 0.5 ? mesquite : q < 0.85 ? brush : juniper, false);
      } else if (c === C.GRASS) {
        // lone mesquite / live oak out in the prairie, a clump now and then; none inside the circuit's mown grass near the barriers
        if (fs < 25 || rr > 0.0028 * sf * far) continue; const q = rng();
        if (q < 0.5) plant(px, pz, mesquite, false);
        else if (q < 0.8) { plant(px, pz, liveOak, false); for (let m = 0; m < 2 + Math.floor(rng() * 4); m++) plant(px + (rng() - 0.5) * 18, pz + (rng() - 0.5) * 18, rng() < 0.7 ? liveOak : brush, false); }
        else plant(px, pz, brush, false);
      }
    }
    // ---- beyond the satellite window: the 16 m raster (edges and a thin interior out to the billboard range)
    const GF = E.fcovFar;
    if (GF) {
      const H = Env.CARD_HALF - 100;
      for (let j = 0; j < GF.nz; j++) for (let i = 0; i < GF.nx; i++) {
        const cx = GF.x0 + (i + 0.5) * GF.cell, cz = GF.z0 + (j + 0.5) * GF.cell; if (cx >= x0 && cx < X1 && cz >= z0 && cz < Z1) continue; if (Math.abs(cx) > H || Math.abs(cz) > H) continue;
        const c = GF.cls[j * GF.nx + i]; if (c > 1 && c !== C.BRUSH) continue;
        let edge = false; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= GF.nx || jj >= GF.nz || GF.cls[jj * GF.nx + ii] > 1) edge = true; }
        const m = c === C.BRUSH ? (rng() < 0.25 ? 1 : 0) : edge ? 2 : (rng() < 0.25 ? 1 : 0);
        for (let q = 0; q < m; q++) { const px = cx + (rng() - 0.5) * GF.cell, pz = cz + (rng() - 0.5) * GF.cell; if (plant(px, pz, c === C.BRUSH ? mesquite : rng() < 0.6 ? liveOak : juniper, !edge)) n.far++; }
      }
    }
    E.stats.trees = Object.assign({ total: trees.length }, n);
    sc.treeCount = trees.length;
    // ---- wood-edge contours for the tree-line strips (Low / Medium beyond the billboard range): canopy fraction on the 10 m distance-field grid
    E.innerStrips = []; E.allWoods = [];
    const DN = E._DN, DH = (DN - 1) * 5; const can = new Float32Array(DN * DN);
    for (let gz = 0; gz < DN; gz++) for (let gx = 0; gx < DN; gx++) { const x = -DH + gx * 10, z = -DH + gz * 10; let s = 0; for (const [a, b] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) s += E.isCanopy(x + a, z + b) ? 1 : 0; can[gz * DN + gx] = s / 4; }
    for (const line of Env.contours(E, can, 0.5)) {
      if (line.length < 4) continue; const L = Env.polyLength(line, line.closed); if (L < 80) continue;
      const pts = Env.smoothLine(line, line.closed, 1, 20); if (line.closed && pts.length) pts.push(pts[0]);
      let run = []; const flush = () => { if (run.length > 2) E.innerStrips.push([run, 11]); run = []; };
      for (const p of pts) { if (E.fsAt(p[0], p[1]) < 14) { flush(); continue; } run.push(p); } flush();
    }
    Veg.instance(E, trees);
    Veg.strips(E);
    CV.rocks(E);
    E.timings.trees = Math.round(performance.now() - T0);
  };

  // ---------------------------------------------------------------- limestone outcrops
  // one low faceted rock (icosahedron, flattened, a flat bedded base): 20 faces, flat normals (non-indexed), unit size
  function rockGeometry() {
    const g = new THREE.IcosahedronGeometry(1, 0); const p = g.attributes.position; const r = U.rng(77);
    const seen = new Map(); for (let i = 0; i < p.count; i++) { const key = p.getX(i).toFixed(3) + ',' + p.getY(i).toFixed(3) + ',' + p.getZ(i).toFixed(3); let k = seen.get(key); if (!k) seen.set(key, k = 0.82 + r() * 0.36); let y = p.getY(i); y = y < 0 ? y * 0.25 : y * 0.85; p.setXYZ(i, p.getX(i) * k, (y + 0.25) * k, p.getZ(i) * k); }
    const ng = g.index ? g.toNonIndexed() : g; ng.computeVertexNormals(); return ng;
  }
  CV.rocks = function (E) {
    const sc = E.sc, t = E.t, OCC = Env.OCC, rng = U.rng(4242); const G = E.fcov; if (!G) return;
    const BLOCK = OCC.ROAD | OCC.BUILT | OCC.PARK | OCC.WATER | OCC.KEEP; const VW = E.forestVergeW(), fp = {};
    const free = (x, z, r) => { if (E.occAt(x, z) & BLOCK) return false; if (E.fsAt(x, z) < r + 4 || !E.clearOfTrack(x, z, r + 4)) return false; t.project(x, z, null, fp); const sd = fp.lat < 0 ? -1 : 1; const e = fp.dist - E.wallCap(fp.i, sd) - VW[sd < 0 ? 0 : 1][fp.i]; return e < -1.2 || e > 1.6; };
    const recs = []; const R = 1500;
    const add = (x, z, s) => {
      const sx = s * (0.8 + rng() * 0.6), sz = s * (0.7 + rng() * 0.5), sy = s * (0.35 + rng() * 0.3); const r = Math.max(sx, sz) * 1.1;
      if (!free(x, z, r)) return false; const yaw = rng() * Math.PI * 2, ca = Math.cos(yaw), sa = Math.sin(yaw);
      // bed: the lowest drawn ground under the footprint (a flat base never hangs over a falling bank), sunk 12 % of its height
      let lo = Infinity, hi = -Infinity; for (const [a, b] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) { const lx = a * sx * 1.1, lz = b * sz * 1.1; const h = sc.height(x + lx * ca - lz * sa, z + lx * sa + lz * ca); lo = Math.min(lo, h); hi = Math.max(hi, h); }
      if (hi - lo > sy * 0.9) return false;   // (too steep for this size: it would be buried on the uphill side)
      const v = 0.86 + rng() * 0.22, warm = (rng() - 0.5) * 0.08;
      recs.push([x, lo - sy * 0.12, z, yaw, sx, sy, sz, (0.66 + warm) * v, 0.63 * v, (0.56 - warm) * v]); return true;
    };
    for (let j = 0; j < G.nz; j++) for (let i = 0; i < G.nx; i++) {
      const c = G.cls[j * G.nx + i]; const x = G.x0 + (i + 0.5) * G.cell, z = G.z0 + (j + 0.5) * G.cell; if (Math.abs(x) > R || Math.abs(z) > R) continue;
      let p = c === C.CALICHE ? 0.05 : c === C.GRASS || c === C.BRUSH ? 0.0009 : 0; if (!p) continue;
      if (c !== C.CALICHE) { const h = E.sc.gridHeight(x + 6, z) - E.sc.gridHeight(x - 6, z), v = E.sc.gridHeight(x, z + 6) - E.sc.gridHeight(x, z - 6); const sl = Math.hypot(h, v) / 12; p *= U.smoothstep(0.04, 0.12, sl) * 4; }   // (outcrops on the banks and cuts)
      if (rng() > p) continue;
      const m = 1 + Math.floor(rng() * 4); for (let q = 0; q < m; q++) add(x + (rng() - 0.5) * 7, z + (rng() - 0.5) * 7, 0.45 + Math.pow(rng(), 2) * 1.5);
    }
    if (!recs.length) return;
    const set = new Env.CellSet([16, 3], 60); const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
    for (const r of recs) { P.set(r[0], r[1], r[2]); Q.setFromAxisAngle(UP, r[3]); S.set(r[4], r[5], r[6]); M.compose(P, Q, S); set.push(r[0], r[2], [M.elements, [r[7], r[8], r[9]]]); }
    set.finalize(); const N = recs.length;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.93, metalness: 0 });
    const inst = new THREE.InstancedMesh(rockGeometry(), mat, N); inst.setColorAt(0, new THREE.Color(1, 1, 1)); inst.count = 0; inst.frustumCulled = false; inst.name = 'rocks'; inst.receiveShadow = true;
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage); inst.instanceColor.setUsage(THREE.DynamicDrawUsage); sc.group.add(inst);
    const RANGE = { low: 240, medium: 480, high: 800 }; const last = new Float64Array(5).fill(1e9); const tgt = [inst.instanceMatrix.array, inst.instanceColor.array];
    sc.cotaRocks = {
      inst, set,
      // regather when an eye moved > 25 m or the tier changed (no allocation per frame; the gather itself runs only then)
      update(x, z) {
        const ey = Env.eyes, x2 = ey && ey[1] ? ey[1][0] : 1e9, z2 = ey && ey[1] ? ey[1][1] : 1e9; const r = RANGE[sc.quality] || RANGE.medium;
        if (r === last[4] && Math.hypot(x - last[0], z - last[1]) < 25 && (x2 === 1e9 || Math.hypot(x2 - last[2], z2 - last[3]) < 25)) return;
        last[0] = x; last[1] = z; last[2] = x2; last[3] = z2; last[4] = r;
        const k = set.gather(x, z, 0, r, tgt); inst.count = k; inst.visible = k > 0;
        for (const [a, st] of [[inst.instanceMatrix, 16], [inst.instanceColor, 3]]) { a.updateRange.offset = 0; a.updateRange.count = Math.max(1, k * st); a.needsUpdate = true; }
      },
    };
    E.stats.rocks = N;
  };
  // the rocks ride on the scenery's per-frame LOD pass (only when this circuit built them)
  if (EI.Scenery && EI.Scenery.prototype.updateLod) { const oU = EI.Scenery.prototype.updateLod; EI.Scenery.prototype.updateLod = function (dt, x, z) { const r = oU.apply(this, arguments); if (this.cotaRocks) this.cotaRocks.update(x, z); return r; }; }
})();
