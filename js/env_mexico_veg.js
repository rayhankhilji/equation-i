// Equation I - the ground and planting of the Autodromo Hermanos Rodriguez in the Magdalena Mixhuca sports city, Mexico City (MEX-STITCH).
// Runs on the ground machinery of js/env_forest.js (ENVDATA.mexico.forest from js/data/mexico_stitch.js, planter 'MexicoVeg': sc.height = the
// drawn ground, shelf + draped verge, levelled paving / car parks), with a flat DEM (the old lake bed of the Valley of Mexico).
//   * ground colour (EI.MexicoVeg.ground rgb / base hooks of env_forest.js): the park - mown lawns and sports fields (end of the rainy season:
//     olive-green), dry olive / tan grass, dusty bare earth, grey paving and asphalt, dark crowns of the eucalyptus / casuarina stands - inside the
//     Ciudad Deportiva outline (OSM); beyond it the city from above: a roof mosaic of terracotta, raw concrete, cream and grey, dark streets;
//   * planting from the 4 m cover raster (satellite colour classes) and the 16 m one beyond: EUCALYPTUS (POPLAR column of the 'mexico' atlas:
//     tall, pale trunk, an open blue-grey crown high up) and CASUARINA (PINE column: dark fine drooping 'needles', an irregular cone) - the two
//     species documented in the park (staging/mexico_refs/FACTS.md 17) - with a generic broad-crowned filler (OAK column, <= 25 %, unnamed),
//     clipped shrubs / bougainvillea clumps (SHRUB column); the city's street trees (generic broad crowns); one record list -> Veg.instance (one
//     near + one far draw, shared atlas), stand edges -> E.innerStrips (Low / Medium beyond the billboard range);
//   * the city edge: low proxy blocks (one merged, cell-chunked static layer) on the city roofs beyond the park and beyond the OSM buildings,
//     each standing on the lowest drawn ground under its footprint.
// Never in the drivable corridor (occupancy + E.clearOfTrack + the verge edge rule, as Spa / COTA).
window.EI = window.EI || {};
(function () {
  const U = EI.U, Env = EI.Env;
  const MV = {}; EI.MexicoVeg = MV;
  // cover classes (js/data/mexico_stitch.js; env_forest.js keeps 0 / 1 = canopy, 5 paved, 6 'gravel' (here asphalt: no tufts), 7 water)
  const C = { CANOPY: 0, TREES: 1, LAWN: 2, DRY: 3, BARE: 4, PAVED: 5, ASPH: 6, WATER: 7 };
  MV.C = C;
  // sRGB albedo, muted like env.js PAL (main.js grades with a saturation boost) - MEX-PLAN SPEC 4.7 starting values; colour constants are MEX-BEAUTY's
  const PAL = { 0: [30, 48, 38], 1: [48, 62, 36], 2: [66, 92, 52], 3: [98, 100, 62], 4: [134, 120, 96], 5: [108, 106, 100], 6: [74, 74, 72], 7: [48, 66, 76] };
  const LAWN = [[64, 90, 50], [72, 98, 55]];        // sports fields / lawns: cool park green (MEX-BEAUTY, race photos), two tones in broad patches
  const DRY = [[98, 100, 62], [110, 106, 66]];       // unwatered grass: olive straw, greener after the rains (MEX-BEAUTY)
  const MOWN = [[66, 92, 52], [72, 98, 56]];        // the mown circuit grass behind the barriers, stripes 7.5 m (a touch below SPEC 4.7's values: they read lime under the stub grade)
  const CROWN_A = [28, 44, 34], CROWN_B = [44, 56, 36];   // casuarina-dark / eucalyptus grey-green crowns from above
  // the city from above (roofs: flat concrete slabs, terracotta, cream render, grey; water tanks read as specks), streets dark
  const ROOFS = [[150, 98, 76], [156, 150, 138], [176, 168, 150], [120, 118, 112], [136, 116, 100], [164, 140, 122], [100, 100, 98], [144, 136, 120]];
  const STREET = [70, 70, 68];
  // sector table keyed by turn number (SPEC 4.7): [from turn, ds, to turn, ds, tree density factor] near the lap only (the cover raster decides
  // beyond), relative to 0.35; skipped while the track has no turn numbers
  const SECTORS = [[17, -300, 1, 0, 0.35], [1, 0, 3, 100, 0.15], [3, 100, 7, 0, 0.5], [7, 0, 11, 100, 0.7], [11, 100, 12, 0, 0.3], [12, 0, 16, 0, 0.0], [16, 0, 17, 0, 0.35]];
  MV.SECTORS = SECTORS;
  // per-instance colour multipliers (Veg.instance record [8])
  const EUC_C = [0.9, 0.96, 0.98], CAS_C = [0.78, 0.86, 0.8], BRD_C = [0.84, 0.9, 0.76], STR_C = [0.86, 0.92, 0.8], SHR_C = [0.9, 0.92, 0.82];
  const hash = (i, j, s) => Env.hash2(i, j, s);
  const mix3 = (a, b, t, out) => { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; return out; };

  // ---------------------------------------------------------------- the park outline (OSM 'Ciudad Deportiva Magdalena Mixhuca') as an 8 m mask
  const PK = { H: 2600, S: 8, N: 650 };
  function parkMask(E) {
    if (E._mxPark) return E._mxPark; const P = E.data.forest.park || [], N = PK.N, m = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) {   // scanline fill: crossings of the row centre with the outline's edges
      const z = -PK.H + (j + 0.5) * PK.S; const xs = [];
      for (let k = 0, l = P.length - 1; k < P.length; l = k++) { const a = P[l], b = P[k]; if ((a[1] > z) !== (b[1] > z)) xs.push(a[0] + (z - a[1]) * (b[0] - a[0]) / (b[1] - a[1])); }
      xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2) { const i0 = Math.max(0, Math.ceil((xs[q] + PK.H) / PK.S - 0.5)), i1 = Math.min(N - 1, Math.floor((xs[q + 1] + PK.H) / PK.S - 0.5)); for (let i = i0; i <= i1; i++) m[j * N + i] = 1; }
    }
    return (E._mxPark = m);
  }
  const inPark = (E, x, z) => { const m = parkMask(E); const i = Math.floor((x + PK.H) / PK.S), j = Math.floor((z + PK.H) / PK.S); return i >= 0 && j >= 0 && i < PK.N && j < PK.N && m[j * PK.N + i] === 1; };
  MV.inPark = inPark;

  // roof colour of the city block at (x, z): ~11 m lots in ~60 m blocks (a hash per lot, a tint per block)
  function roof(x, z, v, out) {
    const bi = Math.floor(x / 11), bj = Math.floor(z / 11); const c = ROOFS[Math.floor(hash(bi, bj, 31) * ROOFS.length) % ROOFS.length]; const k = (0.86 + 0.2 * hash(Math.floor(x / 60), Math.floor(z / 60), 33)) * (0.92 + 0.14 * v);
    out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k; return out;
  }
  // class colour (sRGB) with a per-cell variation v (0..1, hash) and the crown mosaic (crown: 0 coarse, 1 field map, 2 point)
  function classRGB(E, cl, x, z, fs, v, crown, out) {
    if (cl === C.LAWN || cl === C.DRY) {
      const pal = cl === C.LAWN ? LAWN : DRY; const a = E._coarse ? 0.5 : U.noise2(x / 95 + 7.7, z / 95 + 1.9); mix3(pal[0], pal[1], U.smoothstep(0.3, 0.7, a), out);
      const mk = 1 - U.smoothstep(30, 120, fs); if (mk > 0 && cl === C.DRY) { out[0] += (MOWN[0][0] - out[0]) * mk * 0.6; out[1] += (MOWN[0][1] - out[1]) * mk * 0.6; out[2] += (MOWN[0][2] - out[2]) * mk * 0.6; }   // (dry grass near the circuit is mown)
      const k = 0.95 + 0.08 * v; out[0] *= k; out[1] *= k; out[2] *= k; return out;
    }
    if (cl === C.PAVED && !inPark(E, x, z)) return roof(x, z, v, out);
    if (cl <= 1) { const p = hash(Math.floor(x / 9), Math.floor(z / 9), 41) < 0.45 ? CROWN_A : CROWN_B; const k = crown ? 0.66 + 0.6 * v : 0.8 + 0.3 * v; out[0] = p[0] * k; out[1] = p[1] * k; out[2] = p[2] * k; return out; }   // crowns ~4 m: lit tops and dark gaps
    const p = cl === C.ASPH && !inPark(E, x, z) ? STREET : PAL[cl] || PAL[2]; const k = cl === C.ASPH ? 0.94 + 0.1 * v : 0.9 + 0.16 * v;
    out[0] = p[0] * k; out[1] = p[1] * k; out[2] = p[2] * k; return out;
  }
  MV.ground = {
    pal: PAL, mow: MOWN,
    gs: 16, kin: 64, ring: 24, ringHalves: true,          // 16 m grid inside +-1.02 km (the lap is about +-0.73 x +-0.52 km), 6 tiles (2 x 2 fine + the ring in 2 halves: <= 6 draws / 62 k tris)
    level: [C.PAVED, C.ASPH],           // paddock, plazas, the stadium, car parks and streets levelled (the ground is flat anyway)
    flat: 2.5,
    // beyond the 16 m raster (+-2.6 km): the city, with street trees and the odd park
    fallback: (E, x, z) => U.fbm(x / 500 + 3.3, z / 500 + 1.7, 3) < 0.3 ? C.CANOPY : U.noise2(x / 23 + 0.7, z / 23 + 2.1) < 0.22 ? C.ASPH : C.PAVED,
    // ground colour at a point (venue pixels near the lap, far terrain vertex colours)
    rgb(E, x, z, out) {
      const f = E.fsAt(x, z); const n1 = E._coarse ? 0.5 : U.noise2(x / 47 + 3.3, z / 47 + 7.1);
      if (f < 7 && f > -40) { const c = (Math.floor((E.dcAt(x, z) - E.t.halfWidth) / 7.5) & 1) ? MOWN[0] : MOWN[1]; const k = 0.94 + n1 * 0.1; out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k; return out; }
      const cl = E.forestClass(x, z);
      return classRGB(E, cl, x, z, f, E._coarse ? 0.5 : hash(Math.floor(x / 4), Math.floor(z / 4), 11), E._coarse ? 0 : 2, out);
    },
    // the field map base from the cover rasters (pixel space ctx, before the venue overlays): far raster, then the 4 m one with the crown mosaic
    base(E, ctx, S, H) {
      const ppm = S / (2 * H); const col = [0, 0, 0];
      const draw = (g, crown) => {
        if (!g) return; const [c, cx] = Env.canvas(g.nx, g.nz); const im = cx.createImageData(g.nx, g.nz), d = im.data;
        for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
          const o = j * g.nx + i, x = g.x0 + (i + 0.5) * g.cell, z = g.z0 + (j + 0.5) * g.cell; const cl = g.cls[o]; const fs = E.fsAt(x, z);
          classRGB(E, cl, x, z, fs, hash(i, j, crown ? 5 + cl : 9), crown ? 1 : 0, col);
          d[o * 4] = col[0]; d[o * 4 + 1] = col[1]; d[o * 4 + 2] = col[2]; d[o * 4 + 3] = 255;
        }
        cx.putImageData(im, 0, 0);
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(c, (g.x0 + H) * ppm, (g.z0 + H) * ppm, g.nx * g.cell * ppm, g.nz * g.cell * ppm); ctx.restore();
      };
      draw(E.fcovFar, false); draw(E.fcov, true);
      // crowns as round blobs over the lawns (4 m cells drawn as flat squares read as a grid from the air) and white water tanks / dark
      // courtyards speckling the city roofs
      { const G = E.fcov; ctx.save(); ctx.setTransform(ppm, 0, 0, ppm, S / 2, S / 2); const paths = [[], [], [], []];
        for (let j = 0; j < G.nz; j += 1) for (let i = 0; i < G.nx; i++) {
          const c = G.cls[j * G.nx + i]; const x = G.x0 + (i + 0.5) * G.cell, z = G.z0 + (j + 0.5) * G.cell; const v = hash(i, j, 51);
          if (c <= 1) { let edge = false; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + a, jj = j + b; if (ii >= 0 && jj >= 0 && ii < G.nx && jj < G.nz && G.cls[jj * G.nx + ii] > 1) edge = true; } if (!edge || v > 0.6) continue; paths[v < 0.3 ? 0 : 1].push(x + (hash(i, j, 52) - 0.5) * 3, z + (hash(i, j, 53) - 0.5) * 3, 2 + 1.6 * hash(i, j, 54)); }
          else if (c === C.PAVED && v < 0.07 && !inPark(E, x, z)) paths[v < 0.035 ? 2 : 3].push(x + (hash(i, j, 52) - 0.5) * 3, z + (hash(i, j, 53) - 0.5) * 3, 0.7 + 0.6 * hash(i, j, 54));
        }
        const cols = ['rgb(26,40,30)', 'rgb(40,52,34)', 'rgb(206,204,196)', 'rgb(52,50,48)'];
        paths.forEach((P, k) => { if (!P.length) return; ctx.fillStyle = cols[k]; ctx.globalAlpha = k < 2 ? 0.85 : 0.8; ctx.beginPath(); for (let q = 0; q < P.length; q += 3) { ctx.moveTo(P[q] + P[q + 2], P[q + 1]); ctx.arc(P[q], P[q + 1], P[q + 2], 0, 6.283); } ctx.fill(); });
        ctx.restore(); }
    },
  };

  // ---------------------------------------------------------------- the 'mexico' tree atlas (env_veg.js paintAtlas variant; same 512 px cells)
  const APAL = {
    broad: { dark: [20, 28, 16], mid: [48, 62, 32], light: [88, 100, 54], glow: [128, 136, 82], leaf: 5, density: 0.07, holes: 5 },
    broad2: { dark: [24, 30, 18], mid: [56, 66, 36], light: [98, 106, 62], glow: [140, 144, 94], leaf: 4.8, density: 0.065, holes: 7 },
    euc: { dark: [22, 32, 24], mid: [52, 70, 52], light: [92, 112, 82], glow: [134, 150, 106], leaf: 3.6, density: 0.095, holes: 11 },
    euc2: { dark: [26, 34, 25], mid: [58, 74, 52], light: [100, 118, 82], glow: [142, 154, 106], leaf: 3.6, density: 0.09, holes: 12 },
    cas: { dark: [16, 25, 18], mid: [38, 54, 38], light: [70, 86, 60], glow: [104, 118, 86], leaf: 2.6, density: 0.15, holes: 14 },
    cas2: { dark: [18, 26, 18], mid: [42, 58, 38], light: [76, 90, 62], glow: [110, 122, 88], leaf: 2.6, density: 0.14, holes: 16 },
    hedge: { dark: [20, 28, 16], mid: [46, 60, 32], light: [84, 98, 54], glow: [124, 134, 80], leaf: 4.6, density: 0.08 },
    bougain: { dark: [70, 18, 40], mid: [150, 42, 92], light: [196, 74, 130], glow: [226, 120, 170], leaf: 3.6, density: 0.05 },
  };
  function paintMexico(h) {
    const { CW, rowA, rowB, rowT, cell, lobe, trunk, branch, oakSide, shrubSide, top } = h;
    // eucalyptus: a tall straight pale trunk (smooth cream-grey bark, darker shed strips), a few long forked limbs, an open crown of hanging
    // blue-grey clumps in the upper half with a lot of sky through it (the card is ~2.4 x taller than wide: clumps painted flat)
    const euc = (ox, oy, seed, pal) => {
      const r = U.rng(seed); trunk(ox, oy, 256, 512, 120, 26, 10, '#857d6e'); trunk(ox, oy, 262, 512, 180, 7, 3, '#a39b88'); trunk(ox, oy, 249, 480, 240, 5, 2, '#5e574b');
      for (let b = 0; b < 6; b++) { const dir = b % 2 ? 1 : -1; const y0 = 300 - b * 34; branch(ox, oy, 256 + dir * 3, y0, 256 + dir * (60 + r() * 120), y0 - 90 - r() * 70, 9 - b, '#7e7668'); }
      const lobes = []; for (let i = 0; i < 26; i++) { const a = r() * 6.283, d = Math.pow(r(), 0.7); const x = Math.cos(a) * d * 210, y = 150 + Math.sin(a) * d * 120 + Math.abs(x) * 0.25; lobes.push({ x: 256 + x, y, rx: 34 + r() * 32, ry: 16 + r() * 12 }); }
      for (let i = 0; i < 5; i++) { const sd = i % 2 ? 1 : -1; lobes.push({ x: 256 + sd * (70 + r() * 90), y: 300 + r() * 50, rx: 30 + r() * 20, ry: 14 + r() * 8 }); }   // (a few lower hanging clumps)
      lobes.sort((a, b) => a.y - b.y); const global = (y) => 1.1 - U.clamp((y - 40) / 330, 0, 1) * 0.55;
      for (const L of lobes) lobe(r, ox, oy, L, pal, global);
    };
    // casuarina (Australian pine): a dark brown stem, an irregular soft cone of fine dark-green drooping 'needles' from about a quarter up,
    // ragged gaps between the tiers
    const cas = (ox, oy, seed, pal) => {
      const r = U.rng(seed); trunk(ox, oy, 256, 512, 90, 22, 6, '#4a3b2e');
      const global = (y) => 1.04 - U.clamp((y - 20) / 420, 0, 1) * 0.5;
      for (let k = 0; k < 22; k++) {
        const y = 30 + k * 16.5 + r() * 8; const u = U.clamp((y - 20) / 360, 0, 1); const hwid = 40 + 190 * Math.pow(u, 0.7) * (0.75 + r() * 0.3);
        if (y > 400) break; const n = 2 + Math.floor(r() * 2);
        for (let q = 0; q < n; q++) lobe(r, ox, oy, { x: 256 + (r() - 0.5) * hwid * 1.1, y: y + r() * 10, rx: hwid * (0.32 + r() * 0.2), ry: 12 + u * 10 }, pal, global);
      }
    };
    // park shrubs: clipped hedge dome; bougainvillea clump (green dome with magenta-pink bract masses)
    const bougain = (ox, oy, seed) => { shrubSide(ox, oy, seed, APAL.hedge); const r = U.rng(seed + 1); const g = () => 1; for (let i = 0; i < 9; i++) { const a = Math.PI + r() * Math.PI, d = Math.sqrt(r()) * 0.75; lobe(r, ox, oy, { x: 256 + Math.cos(a) * d * 190, y: 410 + Math.sin(a) * d * 190, rx: 34 + r() * 26, ry: 24 + r() * 18 }, APAL.bougain, g); } };
    cell(0, rowA, () => oakSide(0, rowA, 61, APAL.broad, false)); cell(0, rowB, () => oakSide(0, rowB, 67, APAL.broad2, true)); cell(0, rowT, () => top(0, rowT, 5, APAL.broad, 200, 12));
    cell(CW, rowA, () => euc(CW, rowA, 71, APAL.euc)); cell(CW, rowB, () => euc(CW, rowB, 77, APAL.euc2)); cell(CW, rowT, () => top(CW, rowT, 7, APAL.euc, 190, 11));
    cell(CW * 2, rowA, () => cas(CW * 2, rowA, 81, APAL.cas)); cell(CW * 2, rowB, () => cas(CW * 2, rowB, 87, APAL.cas2)); cell(CW * 2, rowT, () => top(CW * 2, rowT, 9, APAL.cas, 150, 10, true));
    cell(CW * 3, rowA, () => shrubSide(CW * 3, rowA, 91, APAL.hedge)); cell(CW * 3, rowB, () => bougain(CW * 3, rowB, 97)); cell(CW * 3, rowT, () => top(CW * 3, rowT, 13, APAL.hedge, 200, 12));
  }
  MV.atlas = 'mexico';
  if (EI.EnvVeg) { EI.EnvVeg.atlas = EI.EnvVeg.atlas || {}; EI.EnvVeg.atlas.mexico = { cols: [0, 1, 2, 3], paint: paintMexico }; }

  // ---------------------------------------------------------------- planting
  MV.build = function (E, Veg) {
    const T0 = performance.now(); const t = E.t, sc = E.sc, SP = Veg.SP, OCC = Env.OCC, rng = U.rng(1968); const trees = [];
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
    const n = { eucalyptus: 0, casuarina: 0, broad: 0, street: 0, shrub: 0, far: 0 };
    // species: [sp, width, height, variant, tint, colour] (tint -1..1 darkens / lightens the instance, env_veg br = 0.82 + tint * 0.3)
    const eucalyptus = () => { const s = 0.75 + rng() * 0.5; return [SP.POPLAR, 11 * s, 25 * s, rng() < 0.5 ? 0 : 1, -0.15 + rng() * 0.4, EUC_C, 'eucalyptus']; };
    const casuarina = () => { const s = 0.75 + rng() * 0.45; return [SP.PINE, 7.5 * s, 17 * s, rng() < 0.5 ? 0 : 1, -0.4 + rng() * 0.35, CAS_C, 'casuarina']; };
    const broad = () => { const s = 0.8 + rng() * 0.4; return [SP.OAK, 10 * s, 12 * s, rng() < 0.6 ? 0 : 1, -0.25 + rng() * 0.4, BRD_C, 'broad']; };
    const street = () => { const s = 0.7 + rng() * 0.45; return [SP.OAK, 8 * s, 9.5 * s, rng() < 0.5 ? 0 : 1, -0.25 + rng() * 0.4, STR_C, 'street']; };
    const shrub = () => { const s = 0.7 + rng() * 0.6; return [SP.SHRUB, 3.2 * s, 2.2 * s, rng() < 0.8 ? 0 : 1, -0.2 + rng() * 0.4, SHR_C, 'shrub']; };
    const plant = (x, z, kind, interior) => { const [sp, w, h, v, tint, cm, nm] = kind(); if (!free(x, z, w * 0.5)) return false; trees.push([x, z, sp, w, h, v, tint, interior ? 1 : 0, cm]); n[nm]++; return true; };
    // a park stand: eucalyptus and casuarina in stands of ~120 m, the broad filler in between (<= ~25 %)
    const parkTree = (px, pz) => { const st = U.noise2(px / 120 + 5.3, pz / 120 + 2.1), q = rng(); return q < 0.2 ? broad : q < 0.2 + 0.8 * (0.25 + 0.5 * st) ? eucalyptus : casuarina; };
    // ---- 4 m raster: jittered 5 m lattice
    const ST = 5; const x0 = G.x0, z0 = G.z0, X1 = G.x0 + nx * A, Z1 = G.z0 + nz * A; const pr = {};
    for (let z = z0 + 2; z < Z1; z += ST) for (let x = x0 + 2 + ((Math.round(z / ST) & 1) ? ST / 2 : 0); x < X1; x += ST) {
      const px = x + (rng() - 0.5) * ST * 0.8, pz = z + (rng() - 0.5) * ST * 0.8; const i = Math.floor((px - x0) / A), j = Math.floor((pz - z0) / A); if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
      const k = j * nx + i, c = cl[k]; const fs = E.fsAt(px, pz); if (fs < 3) continue;
      let sf = 1; if (fs < 220 && sect.length) { t.project(px, pz, null, pr); sf = U.lerp(U.clamp(facAt(pr.s) / 0.35, 0.0, 2), 1, U.smoothstep(60, 220, fs)); }
      const far = fs > 700 ? 0.35 : fs > 350 ? 0.65 : 1;   // (PERF: thinner far stands, the crown mosaic of the field map carries them)
      const rr = rng(); const park = inPark(E, px, pz);
      if (c <= 1) {
        const de = ed[k];
        if (!park) { if (rr > (de <= 6 ? 0.3 : 0.12) * far) continue; plant(px, pz, rng() < 0.85 ? street : eucalyptus, false); n.street += 0; continue; }   // street trees and small parks of the city
        const p = (de <= 8 ? 0.4 : de <= 20 ? 0.2 : 0.09) * sf * far; if (rr > p) continue;
        if (!plant(px, pz, parkTree(px, pz), de > 12)) continue;
        // shrubs at the stand edge (clipped hedges, a bougainvillea now and then)
        if (de <= 6 && fs < 400 && rng() < 0.22) plant(px + (rng() - 0.5) * 5, pz + (rng() - 0.5) * 5, shrub, false);
      } else if (park && (c === C.LAWN || c === C.DRY)) {
        // lone trees and small clumps on the lawns and the dry grass; none in the circuit's mown grass near the barriers, none mid-pitch
        if (fs < 25 || rr > (c === C.DRY ? 0.004 : 0.0012) * sf * far) continue; const q = rng();
        if (q < 0.6) plant(px, pz, parkTree(px, pz), false);
        else { const kind = parkTree(px, pz); for (let m = 0; m < 2 + Math.floor(rng() * 3); m++) plant(px + (rng() - 0.5) * 16, pz + (rng() - 0.5) * 16, kind, false); }
      }
    }
    // ---- beyond the satellite window: the 16 m raster (edges and a thin interior out to the billboard range)
    const GF = E.fcovFar;
    if (GF) {
      const H = Env.CARD_HALF - 100;
      for (let j = 0; j < GF.nz; j++) for (let i = 0; i < GF.nx; i++) {
        const cx = GF.x0 + (i + 0.5) * GF.cell, cz = GF.z0 + (j + 0.5) * GF.cell; if (cx >= x0 && cx < X1 && cz >= z0 && cz < Z1) continue; if (Math.abs(cx) > H || Math.abs(cz) > H) continue;
        const c = GF.cls[j * GF.nx + i]; if (c > 1) continue;
        let edge = false; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= GF.nx || jj >= GF.nz || GF.cls[jj * GF.nx + ii] > 1) edge = true; }
        const m = edge ? 1 : (rng() < 0.3 ? 1 : 0);
        for (let q = 0; q < m; q++) { const px = cx + (rng() - 0.5) * GF.cell, pz = cz + (rng() - 0.5) * GF.cell; if (plant(px, pz, rng() < 0.8 ? street : eucalyptus, !edge)) n.far++; }
      }
    }
    E.stats.trees = Object.assign({ total: trees.length }, n);
    sc.treeCount = trees.length;
    // ---- stand-edge contours for the tree-line strips (Low / Medium beyond the billboard range): canopy fraction on the 10 m distance-field grid
    E.innerStrips = []; E.allWoods = [];
    const DN = E._DN, DH = (DN - 1) * 5; const can = new Float32Array(DN * DN);
    for (let gz = 0; gz < DN; gz++) for (let gx = 0; gx < DN; gx++) { const x = -DH + gx * 10, z = -DH + gz * 10; let s = 0; for (const [a, b] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) s += E.isCanopy(x + a, z + b) ? 1 : 0; can[gz * DN + gx] = s / 4; }
    for (const line of Env.contours(E, can, 0.5)) {
      if (line.length < 4) continue; const L = Env.polyLength(line, line.closed); if (L < 80) continue;
      const pts = Env.smoothLine(line, line.closed, 1, 20); if (line.closed && pts.length) pts.push(pts[0]);
      let run = []; const flush = () => { if (run.length > 2) E.innerStrips.push([run, inPark(E, run[0][0], run[0][1]) ? 18 : 10]); run = []; };
      for (const p of pts) { if (E.fsAt(p[0], p[1]) < 14) { flush(); continue; } run.push(p); } flush();
    }
    Veg.instance(E, trees);
    Veg.strips(E);
    MV.city(E);
    E.timings.trees = Math.round(performance.now() - T0);
  };

  // ---------------------------------------------------------------- the city edge: low proxy blocks beyond the park
  // Mexico City round the sports city is a dense low-rise grid (1-4 storeys, flat roofs). On the city-roof cells of the cover rasters beyond the
  // park outline (>= 150 m from the barriers), on the lots GEN's OSM buildings leave free (OCC.BUILT), one box per ~38 m lot on a jittered grid,
  // 4-13 m high, walls in pastel render / raw concrete, flat roofs; 4 merged meshes (one per quadrant, so the frustum drops the ones behind),
  // the statics program (same 'env-static-rm' shader, no new program). Each block stands on the lowest drawn ground under it, sunk 0.3 m.
  MV.city = function (E) {
    const D = E.data.forest; if (!D || D.cityRing === false) return; const sc = E.sc, rng = U.rng(2240);
    const R0 = D.cityMin || 0, R1 = D.cityMax || 2500, LOT = 38;   // (from the park edge out; GEN's OSM buildings (OCC.BUILT) keep their lots; beyond R1 the fog)
    const WALLS = [[201, 169, 122], [201, 138, 138], [127, 155, 181], [176, 172, 162], [188, 176, 150], [150, 146, 138], [214, 200, 172], [170, 122, 96]];
    const Q = [0, 1, 2, 3].map(() => ({ pos: [], col: [], n: 0, nNear: 0 })); let nb = 0; const LOWR = 1500, lots = []; const BAD = Env.OCC.ROAD | Env.OCC.BUILT | Env.OCC.WATER;
    const box = (q, cx, cz, a, hw, hd, h, y0, c) => {
      if (Math.hypot(cx, cz) <= LOWR) q.nNear++;
      const ca = Math.cos(a), sa = Math.sin(a); const pos = q.pos, col = q.col;
      const P = (lx, lz, y) => pos.push(cx + lx * ca - lz * sa, y, cz + lx * sa + lz * ca);
      const K = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
      const quad = (A, B, Cc, Dd, k, cc) => { for (const v of [A, Cc, B, A, Dd, Cc]) { P(v[0], v[1], v[2]); col.push(cc[0] * k, cc[1] * k, cc[2] * k); } };   // (non-indexed, outward faces)
      for (let f = 0; f < 4; f++) { const [ax, az] = K[f], [bx, bz] = K[(f + 1) % 4]; quad([ax, az, y0], [bx, bz, y0], [bx, bz, y0 + h], [ax, az, y0 + h], 0.9, c); }
      const rc = rng() < 0.3 ? [0.59, 0.4, 0.31] : [0.64, 0.62, 0.58]; const rk = 0.9 + 0.15 * rng(); quad([K[0][0], K[0][1], y0 + h], [K[1][0], K[1][1], y0 + h], [K[2][0], K[2][1], y0 + h], [K[3][0], K[3][1], y0 + h], rk, rc);
      q.n++; nb++;
    };
    for (let z = -R1; z <= R1; z += LOT) for (let x = -R1; x <= R1; x += LOT) {
      const px = x + (rng() - 0.5) * 10, pz = z + (rng() - 0.5) * 10; const rad = Math.hypot(px, pz); if (rad < R0 || rad > R1) continue;
      if (rng() < 0.12) continue;   // (open lots, courtyards)
      if (E.forestClass(px, pz) !== C.PAVED || inPark(E, px, pz) || E.fsAt(px, pz) < 150 || (E.occAt(px, pz) & BAD)) continue;
      const hw = 7 + rng() * 5, hd = 7 + rng() * 5, h = 4 + Math.floor(rng() * 3.2) * 3 + (rng() < 0.08 ? 6 : 0); const a = (D.cityAngle || 0) + (rng() - 0.5) * 0.1;
      // footprint corners on city roofs, clear of streets, OSM buildings and water; the base on the lowest ground under them
      let lo = Infinity, ok = true; const ca = Math.cos(a), sa = Math.sin(a);
      for (const [lx, lz] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [0, 0]]) { const qx = px + lx * ca - lz * sa, qz = pz + lx * sa + lz * ca; if (E.forestClass(qx, qz) === C.WATER || (E.occAt(qx, qz) & BAD)) { ok = false; break; } lo = Math.min(lo, sc.height(qx, qz)); }
      if (!ok) continue;
      const c = WALLS[Math.floor(rng() * WALLS.length)]; const v = (0.85 + rng() * 0.2) / 255, g = (c[0] + c[1] + c[2]) / 3;   // (render washed by sun and smog: 35 % toward grey)
      lots.push({ rad, q: (px >= 0 ? 1 : 0) + (pz >= 0 ? 2 : 0), args: [px, pz, a, hw, hd, h, lo - 0.3, [(c[0] * 0.65 + g * 0.35) * v, (c[1] * 0.65 + g * 0.35) * v, (c[2] * 0.65 + g * 0.35) * v]] });
    }
    lots.sort((A, B) => A.rad - B.rad); for (const L of lots) box(Q[L.q], ...L.args);   // nearest first: the Low tier draws only the first nNear blocks (the rest lies beyond its fog)
    if (!nb) return;
    // the statics material's program (env.js Statics: per-vertex roughness / metalness 'rm')
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 rm;\nvarying vec2 vRM;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = rm;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRM;').replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;').replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;');
    };
    mat.customProgramCacheKey = () => 'env-static-rm';
    let tris = 0; E.cityEdge = [];
    for (const q of Q) {
      if (!q.n) continue; const nv = q.pos.length / 3; const cl = new Float32Array(q.col.length); for (let k = 0; k < cl.length; k++) cl[k] = Math.pow(q.col[k], 2.2);
      const rm = new Float32Array(nv * 2); for (let k = 0; k < nv; k++) { rm[k * 2] = 0.9; rm[k * 2 + 1] = 0; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(q.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(cl, 3)); g.setAttribute('rm', new THREE.BufferAttribute(rm, 2)); g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
      const m = new THREE.Mesh(g, mat); m.name = 'cityEdge'; m.receiveShadow = true; m.matrixAutoUpdate = false; m.userData.box = g.boundingBox; m.userData.nearVerts = q.nNear * 30; sc.group.add(m); E.cityEdge.push(m); tris += nv / 3;
    }
    E.stats.cityBlocks = nb; E.stats.cityTris = tris;
  };
  // Low: the city-edge blocks beyond LOWR (1.5 km, ~80 % into Low's fog) are not drawn (the blocks are sorted nearest first, so a draw range does it)
  { const oSQ = EI.Scenery && EI.Scenery.prototype.setQuality;
    if (oSQ) EI.Scenery.prototype.setQuality = function (q) { const r = oSQ.apply(this, arguments); const ce = this.env && this.env.cityEdge; if (ce) for (const m of ce) m.geometry.setDrawRange(0, q === 'low' ? m.userData.nearVerts : Infinity); return r; }; }
})();
