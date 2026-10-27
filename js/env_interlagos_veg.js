// Equation I - the ground, planting and urban edge of the Autodromo Jose Carlos Pace, Interlagos, Sao Paulo (BRA-STITCH).
// Runs on the ground machinery of js/env_forest.js (ENVDATA.interlagos.forest from js/data/interlagos_stitch.js, planter 'BraziliaVeg': sc.height =
// the drawn ground, shelf + draped verge, levelled paving) with BRA-GEN's DEM (PMSP LiDAR + Copernicus): a lap in a bowl of hills, 43 m of relief.
//   * ground colour (EI.BraziliaVeg.ground rgb / base hooks): lush mown verges, green lawns and rough grass, red earth, grey paving and asphalt,
//     dark crowns of the infield woods, the wooded marsh of the infield basin (OSM natural=wetland), the city's yards and streets between the houses;
//   * planting from the 4 m cover raster (satellite colour classes) and the 16 m one beyond: broad subtropical evergreens (OAK column of the
//     'brazil' atlas), eucalyptus (POPLAR column), queen / royal palms (PINE column), large-leaf shrubs and reeds (SHRUB column); street trees;
//   * the urban edge: every OSM building footprint (PMSP LiDAR heights) as a house - walls in painted render / raw brick / grey block with a window
//     facade, hipped terracotta-tile roofs, flat concrete slabs and fibre-cement sheets with water tanks (favela texture where the footprints are
//     small, dense and grey-roofed), the few OSM mid-rises as apartment blocks; merged per sector (frustum-culled), nearest first (Low draws
//     the first ~1.15 km); each standing on the lowest drawn ground under its footprint, walls facing away from the lap left out.
//   * water: the OSM lake NE of Descida do Lago (outside the lap) and the rivers (GEN's scenery.water, Scenery.buildWater) get a sunk bed.
// Never in the drivable corridor (occupancy + E.clearOfTrack + the verge edge rule, as Spa / COTA / Mexico). Everything is gated to interlagos.
window.EI = window.EI || {};
(function () {
  const U = EI.U, Env = EI.Env;
  const BV = {}; EI.BraziliaVeg = BV;
  const isI = (t) => !!(t && t.data && t.data.id === 'interlagos');
  // cover classes (js/data/interlagos_stitch.js; env_forest.js keeps 0 / 1 = canopy, 5 paved, 6 'gravel' (here asphalt: no tufts), 7 water)
  const C = { CANOPY: 0, TREES: 1, LAWN: 2, ROUGH: 3, BARE: 4, PAVED: 5, ASPH: 6, WATER: 7 };
  BV.C = C;
  // sRGB albedo, muted like env.js PAL (main.js grades with a saturation boost) - SPEC 4.8 starting values; colour constants are BRA-BEAUTY's
  const PAL = { 0: [26, 50, 32], 1: [50, 72, 40], 2: [72, 104, 52], 3: [88, 104, 58], 4: [128, 86, 60], 5: [112, 110, 104], 6: [70, 70, 68], 7: [40, 58, 46] };
  const LAWN = [[64, 98, 50], [72, 104, 54]];       // lawns / mown banks: lush wet-season green, two tones in broad patches
  const ROUGH = [[80, 98, 54], [92, 104, 58]];      // rough grass and the dry patches of the infield (greener in November than the imagery)
  const MOWN = [[62, 96, 48], [68, 102, 52]];       // the mown circuit grass behind the barriers, stripes 7.5 m
  const MARSH = [[54, 74, 48], [62, 80, 50]];        // waterlogged grass of the infield basin
  const CROWN_A = [24, 44, 30], CROWN_B = [40, 60, 34];
  // the city from above between the houses: yards, slabs, streets (the 3D houses stand on it); beyond the OSM houses the roof mosaic itself
  const YARDS = [[118, 104, 92], [104, 100, 94], [128, 112, 98], [96, 92, 86], [120, 94, 78]];
  const ROOFS = [[160, 92, 64], [150, 86, 60], [172, 104, 72], [148, 144, 136], [128, 82, 62], [166, 98, 70], [136, 132, 126], [156, 96, 70]];
  const STREET = [72, 72, 70];
  const TROP_C = [0.86, 0.94, 0.8], EUC_C = [0.9, 0.96, 0.98], PALM_C = [0.9, 0.96, 0.86], STR_C = [0.86, 0.94, 0.8], SHR_C = [0.9, 0.96, 0.84], REED_C = [1.0, 1.0, 0.9];
  const hash = (i, j, s) => Env.hash2(i, j, s);
  const mix3 = (a, b, t, out) => { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; return out; };

  // ---------------------------------------------------------------- masks: urban (16 m raster), marsh (OSM wetland, 4 m scanline fill)
  function urbanMask(E) {
    if (E._brUrban) return E._brUrban; const G = E.data.forest.urban; E._brUrban = G ? EI.EnvForest.decodeCover(G) : null; return E._brUrban;
  }
  const isUrban = (E, x, z) => { const G = urbanMask(E); if (!G) return false; const i = Math.floor((x - G.x0) / G.cell), j = Math.floor((z - G.z0) / G.cell); if (i < 0 || j < 0 || i >= G.nx || j >= G.nz) return true; return G.cls[j * G.nx + i] === 1; };
  BV.isUrban = isUrban;
  const MK = { H: 1000, S: 4, N: 500 };
  function marshMask(E) {
    if (E._brMarsh) return E._brMarsh; const N = MK.N, m = new Uint8Array(N * N);
    for (const P of E.data.forest.marsh || []) for (let j = 0; j < N; j++) {
      const z = -MK.H + (j + 0.5) * MK.S; const xs = [];
      for (let k = 0, l = P.length - 1; k < P.length; l = k++) { const a = P[l], b = P[k]; if ((a[1] > z) !== (b[1] > z)) xs.push(a[0] + (z - a[1]) * (b[0] - a[0]) / (b[1] - a[1])); }
      xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2) { const i0 = Math.max(0, Math.ceil((xs[q] + MK.H) / MK.S - 0.5)), i1 = Math.min(N - 1, Math.floor((xs[q + 1] + MK.H) / MK.S - 0.5)); for (let i = i0; i <= i1; i++) m[j * N + i] = 1; }
    }
    return (E._brMarsh = m);
  }
  const inMarsh = (E, x, z) => { const i = Math.floor((x + MK.H) / MK.S), j = Math.floor((z + MK.H) / MK.S); return i >= 0 && j >= 0 && i < MK.N && j < MK.N && marshMask(E)[j * MK.N + i] === 1; };
  BV.inMarsh = inMarsh;

  function roofMosaic(x, z, v, out) {
    const bi = Math.floor(x / 10), bj = Math.floor(z / 10); const c = ROOFS[Math.floor(hash(bi, bj, 31) * ROOFS.length) % ROOFS.length]; const k = (0.84 + 0.2 * hash(Math.floor(x / 60), Math.floor(z / 60), 33)) * (0.92 + 0.14 * v);
    out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k; return out;
  }
  // class colour (sRGB) with a per-cell variation v (0..1) and the crown mosaic (crown: 0 coarse, 1 field map, 2 point)
  function classRGB(E, cl, x, z, fs, v, crown, out) {
    if (cl === C.LAWN || cl === C.ROUGH) {
      const marsh = inMarsh(E, x, z); const pal = marsh ? MARSH : cl === C.LAWN ? LAWN : ROUGH; const a = E._coarse ? 0.5 : U.noise2(x / 95 + 7.7, z / 95 + 1.9); mix3(pal[0], pal[1], U.smoothstep(0.3, 0.7, a), out);
      const mk = marsh ? 0 : 1 - U.smoothstep(30, 120, fs); if (mk > 0 && cl === C.ROUGH) { out[0] += (MOWN[0][0] - out[0]) * mk * 0.6; out[1] += (MOWN[0][1] - out[1]) * mk * 0.6; out[2] += (MOWN[0][2] - out[2]) * mk * 0.6; }
      const k = 0.95 + 0.08 * v; out[0] *= k; out[1] *= k; out[2] *= k; return out;
    }
    if (cl === C.PAVED && isUrban(E, x, z)) {
      const r = Math.hypot(x, z); if (r > 1700) return roofMosaic(x, z, v, out);
      const c = YARDS[Math.floor(hash(Math.floor(x / 9), Math.floor(z / 9), 37) * YARDS.length) % YARDS.length]; const k = 0.9 + 0.16 * v; out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
      if (r > 1500) { const t = (r - 1500) / 200; const q = roofMosaic(x, z, v, [0, 0, 0]); mix3(out, q, t, out); }
      return out;
    }
    if (cl <= 1) { const p = hash(Math.floor(x / 8), Math.floor(z / 8), 41) < 0.5 ? CROWN_A : CROWN_B; const k = crown ? 0.66 + 0.6 * v : 0.8 + 0.3 * v; out[0] = p[0] * k; out[1] = p[1] * k; out[2] = p[2] * k; return out; }
    if (cl === C.BARE) { const k = 0.88 + 0.18 * v; const g = E._coarse ? 0.5 : U.noise2(x / 30 + 1.3, z / 30 + 5.1); out[0] = PAL[4][0] * k * (0.92 + 0.12 * g); out[1] = PAL[4][1] * k; out[2] = PAL[4][2] * k; return out; }
    const p = cl === C.ASPH && isUrban(E, x, z) ? STREET : PAL[cl] || PAL[2]; const k = cl === C.ASPH ? 0.94 + 0.1 * v : 0.9 + 0.16 * v;
    out[0] = p[0] * k; out[1] = p[1] * k; out[2] = p[2] * k; return out;
  }
  BV.ground = {
    pal: PAL, mow: MOWN,
    gs: 20, kin: 80, ring: 16, ringHalves: true,          // 20 m grid (= the DEM's) inside +-1.6 km, the ring to ~2.6 km (houses beyond use BV.groundAt): 6 tiles / 74 k tris
    level: [C.PAVED],                  // paddock, plazas, car parks levelled (the city's own slopes are the DEM's: houses step down the hills)
    flat: 2.5,
    fallback: (E, x, z) => U.fbm(x / 500 + 3.3, z / 500 + 1.7, 3) < 0.3 ? C.CANOPY : U.noise2(x / 23 + 0.7, z / 23 + 2.1) < 0.2 ? C.ASPH : C.PAVED,
    rgb(E, x, z, out) {
      const f = E.fsAt(x, z); const n1 = E._coarse ? 0.5 : U.noise2(x / 47 + 3.3, z / 47 + 7.1);
      if (f < 7 && f > -40) { const c = (Math.floor((E.dcAt(x, z) - E.t.halfWidth) / 7.5) & 1) ? MOWN[0] : MOWN[1]; const k = 0.94 + n1 * 0.1; out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k; return out; }
      const cl = E.forestClass(x, z);
      return classRGB(E, cl, x, z, f, E._coarse ? 0.5 : hash(Math.floor(x / 4), Math.floor(z / 4), 11), E._coarse ? 0 : 2, out);
    },
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
      // crowns as round blobs at the wood edges (4 m squares read as a grid from the air), dark puddles / reed clumps in the marsh
      { const G = E.fcov; ctx.save(); ctx.setTransform(ppm, 0, 0, ppm, S / 2, S / 2); const paths = [[], [], [], []];
        for (let j = 0; j < G.nz; j += 1) for (let i = 0; i < G.nx; i++) {
          const c = G.cls[j * G.nx + i]; const x = G.x0 + (i + 0.5) * G.cell, z = G.z0 + (j + 0.5) * G.cell; const v = hash(i, j, 51);
          if (c <= 1) { let edge = false; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + a, jj = j + b; if (ii >= 0 && jj >= 0 && ii < G.nx && jj < G.nz && G.cls[jj * G.nx + ii] > 1) edge = true; } if (!edge || v > 0.6) continue; paths[v < 0.3 ? 0 : 1].push(x + (hash(i, j, 52) - 0.5) * 3, z + (hash(i, j, 53) - 0.5) * 3, 2 + 1.6 * hash(i, j, 54)); }
          else if ((c === C.LAWN || c === C.ROUGH) && v < 0.12 && Math.abs(x) < MK.H && Math.abs(z) < MK.H && inMarsh(E, x, z)) paths[v < 0.05 ? 2 : 3].push(x + (hash(i, j, 52) - 0.5) * 3, z + (hash(i, j, 53) - 0.5) * 3, 1.2 + 1.4 * hash(i, j, 54));
        }
        const cols = ['rgb(22,40,28)', 'rgb(36,56,32)', 'rgb(40,52,44)', 'rgb(78,88,52)'];
        paths.forEach((P, k) => { if (!P.length) return; ctx.fillStyle = cols[k]; ctx.globalAlpha = 0.85; ctx.beginPath(); for (let q = 0; q < P.length; q += 3) { ctx.moveTo(P[q] + P[q + 2], P[q + 1]); ctx.arc(P[q], P[q + 1], P[q + 2], 0, 6.283); } ctx.fill(); });
        ctx.restore(); }
    },
  };

  // ---------------------------------------------------------------- water beds: under GEN's water polygons (the OSM lake, rivers, ponds) the ground
  // sinks to (polygon level - 1.2 m), level = the lowest natural ground on its shore, so Scenery.buildWater's plane (lowest shore + 0.25 m) is
  // never pierced by DEM noise; a 4 m mask (polygon id + weight), the weight eased over ~12 m at the shore
  function waterMask(E) {
    if (E._brWater !== undefined) return E._brWater; const N = 1200, S = 4, H = 2400; const m = new Float32Array(N * N), id = new Int16Array(N * N).fill(-1); const polys = [];
    for (const P of (E.t.data.scenery && E.t.data.scenery.water) || []) {
      if (!P || P.length < 3) continue; const pi = polys.length; polys.push(P);
      for (let j = 0; j < N; j++) {
        const z = -H + (j + 0.5) * S; const xs = [];
        for (let k = 0, l = P.length - 1; k < P.length; l = k++) { const a = P[l], b = P[k]; if ((a[1] > z) !== (b[1] > z)) xs.push(a[0] + (z - a[1]) * (b[0] - a[0]) / (b[1] - a[1])); }
        xs.sort((a, b) => a - b);
        for (let q = 0; q + 1 < xs.length; q += 2) { const i0 = Math.max(0, Math.ceil((xs[q] + H) / S - 0.5)), i1 = Math.min(N - 1, Math.floor((xs[q + 1] + H) / S - 0.5)); for (let i = i0; i <= i1; i++) { m[j * N + i] = 1; id[j * N + i] = pi; } }
      }
    }
    if (!polys.length) return (E._brWater = null);
    for (let pass = 0; pass < 3; pass++) { const o = new Float32Array(N * N); for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) { const k = j * N + i; o[k] = m[k] ? Math.min(m[k], (m[k - 1] + m[k + 1] + m[k - N] + m[k + N]) / 4) : 0; } m.set(o); }
    return (E._brWater = { m, id, N, S, H, polys, level: new Float32Array(polys.length).fill(NaN) });
  }
  { const Ctx = Env.Ctx, oDem = Ctx.prototype.forestDem;
    Ctx.prototype.forestDem = function (x, z) {
      const h = oDem.call(this, x, z); if (!isI(this.t)) return h; const W = waterMask(this); if (!W) return h;
      const i = Math.round((x + W.H) / W.S - 0.5), j = Math.round((z + W.H) / W.S - 0.5); if (i < 0 || j < 0 || i >= W.N || j >= W.N) return h;
      const k = j * W.N + i, pi = W.id[k]; if (pi < 0) return h;
      const fx = (x + W.H) / W.S - 0.5, fz = (z + W.H) / W.S - 0.5, i0 = Math.min(W.N - 2, Math.max(0, Math.floor(fx))), j0 = Math.min(W.N - 2, Math.max(0, Math.floor(fz))); const u = fx - i0, v = fz - j0, m = W.m, N = W.N;
      const w = (m[j0 * N + i0] * (1 - u) + m[j0 * N + i0 + 1] * u) * (1 - v) + (m[(j0 + 1) * N + i0] * (1 - u) + m[(j0 + 1) * N + i0 + 1] * u) * v;
      if (Number.isNaN(W.level[pi])) { let lo = Infinity; for (const q of W.polys[pi]) lo = Math.min(lo, oDem.call(this, q[0], q[1])); W.level[pi] = lo; }
      return h - w * Math.max(0, h - (W.level[pi] - 1.2));
    }; }

  // ---------------------------------------------------------------- the 'brazil' tree atlas (env_veg.js paintAtlas variant; same 512 px cells)
  const APAL = {
    trop: { dark: [16, 30, 16], mid: [40, 64, 30], light: [80, 108, 52], glow: [124, 150, 82], leaf: 5.4, density: 0.08, holes: 4 },
    trop2: { dark: [20, 32, 16], mid: [48, 70, 32], light: [92, 116, 56], glow: [138, 158, 88], leaf: 4.6, density: 0.075, holes: 6 },
    euc: { dark: [22, 32, 24], mid: [52, 70, 52], light: [92, 112, 82], glow: [134, 150, 106], leaf: 3.6, density: 0.095, holes: 11 },
    euc2: { dark: [26, 34, 25], mid: [58, 74, 52], light: [100, 118, 82], glow: [142, 154, 106], leaf: 3.6, density: 0.09, holes: 12 },
    palm: { dark: [22, 36, 18], mid: [52, 78, 34], light: [96, 124, 58], glow: [146, 166, 92], leaf: 3.2, density: 0.11 },
    bush: { dark: [16, 30, 14], mid: [42, 70, 30], light: [86, 118, 52], glow: [132, 160, 86], leaf: 7.5, density: 0.05, holes: 3 },
    reed: { dark: [44, 52, 26], mid: [86, 96, 48], light: [128, 134, 74], glow: [170, 168, 108], leaf: 2.4, density: 0.12 },
  };
  function paintBrazil(h) {
    const { ctx, CW, rowA, rowB, rowT, cell, lobe, trunk, branch, oakSide, shrubSide, top } = h;
    // eucalyptus (common round Sao Paulo, planted belts): tall pale trunk, open blue-grey crown high up
    const euc = (ox, oy, seed, pal) => {
      const r = U.rng(seed); trunk(ox, oy, 256, 512, 120, 26, 10, '#857d6e'); trunk(ox, oy, 262, 512, 180, 7, 3, '#a39b88');
      for (let b = 0; b < 6; b++) { const dir = b % 2 ? 1 : -1; const y0 = 300 - b * 34; branch(ox, oy, 256 + dir * 3, y0, 256 + dir * (60 + r() * 120), Math.max(95, y0 - 90 - r() * 70), 9 - b, '#7e7668'); }
      const lobes = []; for (let i = 0; i < 26; i++) { const a = r() * 6.283, d = Math.pow(r(), 0.7); const x = Math.cos(a) * d * 210, y = 150 + Math.sin(a) * d * 120 + Math.abs(x) * 0.25; lobes.push({ x: 256 + x, y, rx: 34 + r() * 32, ry: 16 + r() * 12 }); }
      lobes.sort((a, b) => a.y - b.y); const global = (y) => 1.1 - U.clamp((y - 40) / 330, 0, 1) * 0.55;
      for (const L of lobes) lobe(r, ox, oy, L, pal, global);
    };
    // queen / royal palm: a slim pale-grey ringed stem, a green crownshaft, a crown of arching feather fronds with drooping leaflets
    const palm = (ox, oy, seed, pal, royal) => {
      const r = U.rng(seed); const topY = 120;
      trunk(ox, oy, 256, 512, topY + 30, royal ? 30 : 22, royal ? 22 : 18, royal ? '#8f8a80' : '#7a7266');
      ctx.strokeStyle = 'rgba(40,36,30,0.35)'; ctx.lineWidth = 1.5; for (let y = topY + 40; y < 505; y += 9) { ctx.beginPath(); ctx.moveTo(ox + 256 - 12, oy + y); ctx.lineTo(ox + 256 + 12, oy + y + 1); ctx.stroke(); }
      if (royal) { ctx.fillStyle = 'rgb(70,96,48)'; ctx.fillRect(ox + 256 - 12, oy + topY - 10, 24, 52); }
      const fr = royal ? 13 : 15; const global = (y) => 1.05 - U.clamp((y - 20) / 260, 0, 1) * 0.5;
      for (let k = 0; k < fr; k++) {
        const a = -Math.PI / 2 + (k / (fr - 1) - 0.5) * Math.PI * 1.75 + (r() - 0.5) * 0.2; const L = 150 + r() * 70; const droop = 0.6 + r() * 0.5;
        const pts = []; for (let q = 0; q <= 10; q++) { const u = q / 10; const x = Math.cos(a) * L * u; const y = Math.sin(a) * L * u + droop * L * u * u * 0.9; pts.push([256 + x, topY + y]); }
        ctx.strokeStyle = 'rgb(72,84,44)'; ctx.lineWidth = 3; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(ox + p[0], oy + p[1]) : ctx.moveTo(ox + p[0], oy + p[1])); ctx.stroke();
        for (let q = 1; q < 10; q++) { const p = pts[q]; lobe(r, ox, oy, { x: p[0], y: p[1] + 10 + q * 1.5, rx: 13 + (10 - q) * 1.6, ry: 9 + q * 1.4 }, pal, global); }
      }
    };
    // large-leaf tropical bush (bananeira / philodendron / bamboo clumps at the corners, photos bra_004 / bra_020): a lush dome of big leaves
    const bush = (ox, oy, seed) => { shrubSide(ox, oy, seed, APAL.bush); const r = U.rng(seed + 3); ctx.strokeStyle = 'rgba(96,130,58,0.9)'; ctx.lineWidth = 6; ctx.lineCap = 'round'; for (let i = 0; i < 7; i++) { const x0 = 256 + (r() - 0.5) * 200, y0 = 330 + r() * 80; const a = -Math.PI / 2 + (r() - 0.5) * 1.6; ctx.beginPath(); ctx.moveTo(ox + x0, oy + y0); ctx.quadraticCurveTo(ox + x0 + Math.cos(a) * 60, oy + y0 + Math.sin(a) * 70, ox + x0 + Math.cos(a) * 110, oy + y0 + Math.sin(a) * 40 + 40); ctx.stroke(); } };
    // reeds / tall marsh grass (taboa): a clump of thin upright blades with brown seed heads
    const reeds = (ox, oy, seed) => {
      const r = U.rng(seed); for (let i = 0; i < 160; i++) { const x0 = 256 + (r() - 0.5) * 360 * Math.sqrt(r()); const h0 = 220 + r() * 230; const lean = (r() - 0.5) * 70; const lt = r(); ctx.strokeStyle = 'rgb(' + (60 + lt * 70 | 0) + ',' + (74 + lt * 66 | 0) + ',' + (34 + lt * 36 | 0) + ')'; ctx.lineWidth = 2 + r() * 2.5; ctx.beginPath(); ctx.moveTo(ox + x0, oy + 510); ctx.quadraticCurveTo(ox + x0 + lean * 0.3, oy + 510 - h0 * 0.6, ox + x0 + lean, oy + 510 - h0); ctx.stroke();
        if (r() < 0.12) { ctx.fillStyle = 'rgb(92,62,38)'; ctx.beginPath(); ctx.ellipse(ox + x0 + lean, oy + 510 - h0 + 14, 4, 16, 0, 0, 6.283); ctx.fill(); } }
    };
    cell(0, rowA, () => oakSide(0, rowA, 61, APAL.trop, false)); cell(0, rowB, () => oakSide(0, rowB, 67, APAL.trop2, true)); cell(0, rowT, () => top(0, rowT, 5, APAL.trop, 200, 13));
    cell(CW, rowA, () => euc(CW, rowA, 71, APAL.euc)); cell(CW, rowB, () => euc(CW, rowB, 77, APAL.euc2)); cell(CW, rowT, () => top(CW, rowT, 7, APAL.euc, 190, 11));
    cell(CW * 2, rowA, () => palm(CW * 2, rowA, 81, APAL.palm, false)); cell(CW * 2, rowB, () => palm(CW * 2, rowB, 87, APAL.palm, true)); cell(CW * 2, rowT, () => top(CW * 2, rowT, 9, APAL.palm, 150, 9, true));
    cell(CW * 3, rowA, () => bush(CW * 3, rowA, 91)); cell(CW * 3, rowB, () => reeds(CW * 3, rowB, 97)); cell(CW * 3, rowT, () => top(CW * 3, rowT, 13, APAL.bush, 200, 12));
  }
  BV.atlas = 'brazil';
  if (EI.EnvVeg) { EI.EnvVeg.atlas = EI.EnvVeg.atlas || {}; EI.EnvVeg.atlas.brazil = { cols: [0, 1, 2, 3], paint: paintBrazil }; }

  // ---------------------------------------------------------------- planting
  BV.build = function (E, Veg) {
    const T0 = performance.now(); const t = E.t, sc = E.sc, SP = Veg.SP, OCC = Env.OCC, rng = U.rng(1972); const trees = [];
    const BLOCK = OCC.ROAD | OCC.BUILT | OCC.PARK | OCC.WATER | OCC.KEEP;
    const VW = E.forestVergeW(), fp = {};
    const free = (x, z, r) => { if (E.occAt(x, z) & BLOCK) return false; if (E.fsAt(x, z) < r + 2.5 || !E.clearOfTrack(x, z, r + 2.5)) return false; t.project(x, z, null, fp); const sd = fp.lat < 0 ? -1 : 1; const e = fp.dist - E.wallCap(fp.i, sd) - VW[sd < 0 ? 0 : 1][fp.i]; return e < -1.2 || e > 1.2; };
    const G = E.fcov, nx = G.nx, nz = G.nz, cl = G.cls, A = G.cell; const ed = new Float32Array(nx * nz);
    for (let k = 0; k < nx * nz; k++) ed[k] = cl[k] <= 1 ? 1e4 : 0;
    const B = A * 1.4142;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (!ed[k]) continue; let v = ed[k]; if (i > 0) v = Math.min(v, ed[k - 1] + A); if (j > 0) { v = Math.min(v, ed[k - nx] + A); if (i > 0) v = Math.min(v, ed[k - nx - 1] + B); if (i < nx - 1) v = Math.min(v, ed[k - nx + 1] + B); } ed[k] = v; }
    for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const k = j * nx + i; if (!ed[k]) continue; let v = ed[k]; if (i < nx - 1) v = Math.min(v, ed[k + 1] + A); if (j < nz - 1) { v = Math.min(v, ed[k + nx] + A); if (i < nx - 1) v = Math.min(v, ed[k + nx + 1] + B); if (i > 0) v = Math.min(v, ed[k + nx - 1] + B); } ed[k] = v; }
    const n = { tropical: 0, eucalyptus: 0, palm: 0, street: 0, bush: 0, reed: 0, far: 0 };
    // species: [sp, width, height, variant, tint, colour, name]
    const tropical = () => { const s = 0.75 + rng() * 0.55; return [SP.OAK, 11 * s, 12 * s, rng() < 0.55 ? 0 : 1, -0.3 + rng() * 0.45, TROP_C, 'tropical']; };
    const eucalyptus = () => { const s = 0.75 + rng() * 0.5; return [SP.POPLAR, 11 * s, 24 * s, rng() < 0.5 ? 0 : 1, -0.15 + rng() * 0.4, EUC_C, 'eucalyptus']; };
    const palm = () => { const royal = rng() < 0.4; const s = 0.8 + rng() * 0.4; return [SP.PINE, (royal ? 7.5 : 8) * s, (royal ? 17 : 12) * s, royal ? 1 : 0, -0.15 + rng() * 0.3, PALM_C, 'palm']; };
    const street = () => { const s = 0.65 + rng() * 0.45; return [SP.OAK, 9 * s, 9.5 * s, rng() < 0.5 ? 0 : 1, -0.25 + rng() * 0.4, STR_C, 'street']; };
    const bush = () => { const s = 0.7 + rng() * 0.6; return [SP.SHRUB, 4.2 * s, 3.0 * s, 0, -0.25 + rng() * 0.4, SHR_C, 'bush']; };
    const reed = () => { const s = 0.7 + rng() * 0.5; return [SP.SHRUB, 3.2 * s, 2.2 * s, 1, -0.1 + rng() * 0.3, REED_C, 'reed']; };
    const plant = (x, z, kind, interior) => { const [sp, w, h, v, tint, cm, nm] = kind(); if (!free(x, z, sp === SP.SHRUB ? w * 0.35 : w * 0.5)) return false; trees.push([x, z, sp, w, h, v, tint, interior ? 1 : 0, cm]); n[nm]++; return true; };
    const woodTree = (px, pz) => { const q = rng(), st = U.noise2(px / 140 + 5.3, pz / 140 + 2.1); return q < 0.06 ? palm : q < 0.06 + 0.3 * st ? eucalyptus : tropical; };
    const ST = 5; const x0 = G.x0, z0 = G.z0, X1 = G.x0 + nx * A, Z1 = G.z0 + nz * A;
    for (let z = z0 + 2; z < Z1; z += ST) for (let x = x0 + 2 + ((Math.round(z / ST) & 1) ? ST / 2 : 0); x < X1; x += ST) {
      const px = x + (rng() - 0.5) * ST * 0.8, pz = z + (rng() - 0.5) * ST * 0.8; const i = Math.floor((px - x0) / A), j = Math.floor((pz - z0) / A); if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
      const k = j * nx + i, c = cl[k]; if (c > 3) continue; const fs = E.fsAt(px, pz); if (fs < 3) continue;
      const far = fs > 900 ? 0.3 : fs > 450 ? 0.55 : 1;   // (PERF: thinner far stands, the crown mosaic of the field map carries them)
      const rr = rng(); const city = isUrban(E, px, pz);
      if (c <= 1) {
        const de = ed[k];
        if (city) { if (rr > (de <= 6 ? 0.2 : 0.07) * far) continue; plant(px, pz, rng() < 0.82 ? street : rng() < 0.5 ? palm : eucalyptus, false); continue; }   // street trees, yards and pracas
        const p = (de <= 8 ? 0.4 : de <= 20 ? 0.2 : 0.09) * far; if (rr > p) continue;
        if (!plant(px, pz, woodTree(px, pz), de > 12)) continue;
        // the lush understorey at the wood edge near the circuit (large-leaf bushes right behind the barriers, photos bra_004 / bra_020)
        if (de <= 6 && fs < 300 && rng() < 0.4) plant(px + (rng() - 0.5) * 5, pz + (rng() - 0.5) * 5, bush, false);
      } else if (!city && (c === C.LAWN || c === C.ROUGH)) {
        const marsh = inMarsh(E, px, pz);
        if (marsh) { if (rr < 0.05 * far) plant(px, pz, reed, false); else if (rr < 0.058) plant(px, pz, tropical, false); continue; }
        if (fs < 22 || rr > (c === C.ROUGH ? 0.003 : 0.0012) * far) continue; const q = rng();
        if (q < 0.55) plant(px, pz, woodTree(px, pz), false);
        else if (q < 0.7) plant(px, pz, bush, false);
        else { const kind = woodTree(px, pz); for (let m = 0; m < 2 + Math.floor(rng() * 3); m++) plant(px + (rng() - 0.5) * 16, pz + (rng() - 0.5) * 16, kind, false); }
      }
    }
    // beyond the satellite window: the 16 m raster (crown edges and a thin interior out to the billboard range)
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
    // stand-edge contours for the tree-line strips (Low / Medium beyond the billboard range)
    E.innerStrips = []; E.allWoods = [];
    const DN = E._DN, DH = (DN - 1) * 5; const can = new Float32Array(DN * DN);
    for (let gz = 0; gz < DN; gz++) for (let gx = 0; gx < DN; gx++) { const x = -DH + gx * 10, z = -DH + gz * 10; let s = 0; for (const [a, b] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) s += E.isCanopy(x + a, z + b) ? 1 : 0; can[gz * DN + gx] = s / 4; }
    for (const line of Env.contours(E, can, 0.5)) {
      if (line.length < 4) continue; const L = Env.polyLength(line, line.closed); if (L < 80) continue;
      const pts = Env.smoothLine(line, line.closed, 1, 20); if (line.closed && pts.length) pts.push(pts[0]);
      let run = []; const flush = () => { if (run.length > 2) E.innerStrips.push([run, isUrban(E, run[0][0], run[0][1]) ? 10 : 16]); run = []; };
      for (const p of pts) { if (E.fsAt(p[0], p[1]) < 14) { flush(); continue; } run.push(p); } flush();
    }
    Veg.instance(E, trees);
    Veg.strips(E);
    E.timings.trees = Math.round(performance.now() - T0);
  };

  // ---------------------------------------------------------------- the urban edge: the OSM houses
  // facade / roof atlas (512 x 512, near-white, tinted per vertex): rows (canvas y) 0..255 two-storey house front (16 m x 6 m, upper storey
  // 0..110, ground storey 110..230, plinth 230..255), 256..383 clay tile rows (16 m x 4 m of slope), 384..447 fibre-cement sheet ribs,
  // 448..511 plain render (halls, slabs, tanks). wrapS repeats along the walls; v stays inside a row band.
  const VB = { top: 1, mid: 1 - 110 / 512, base: 1 - 255 / 512, tile0: 1 - 381 / 512, tile1: 1 - 259 / 512, rib0: 1 - 445 / 512, rib1: 1 - 386 / 512, plain: 1 - 480 / 512 };
  function houseTex() {
    const [c, x] = Env.canvas(512, 512); const r = U.rng(5);
    x.fillStyle = '#ececea'; x.fillRect(0, 0, 512, 512);
    // render grime and streaks
    for (let i = 0; i < 900; i++) { x.fillStyle = 'rgba(0,0,0,' + (0.02 + r() * 0.04) + ')'; x.fillRect(r() * 512, r() * 250, 1 + r() * 3, 2 + r() * 14); }
    x.fillStyle = 'rgba(60,50,40,0.18)'; x.fillRect(0, 214, 512, 16);
    x.fillStyle = '#9a958c'; x.fillRect(0, 230, 512, 26);   // plinth / pavement edge
    x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(0, 106, 512, 5);   // slab edge between storeys
    // openings along 16 m: [x, w, kind] kinds 0 window, 1 door, 2 garage gate
    const win = (px, py, w, h, bars) => { x.fillStyle = '#d8d8d4'; x.fillRect(px - 3, py - 3, w + 6, h + 6); x.fillStyle = '#2b3138'; x.fillRect(px, py, w, h); x.fillStyle = 'rgba(160,180,200,0.25)'; x.fillRect(px, py, w, h * 0.35);
      if (bars) { x.fillStyle = 'rgba(30,30,30,0.85)'; for (let q = px + 4; q < px + w; q += 7) x.fillRect(q, py, 2, h); } };
    const lay = [[24, 58, 0], [112, 40, 1], [190, 58, 0], [290, 110, 2], [430, 58, 0]];
    for (const [px, w, k] of lay) {
      if (k === 0) win(px, 140, w, 52, r() < 0.6);
      else if (k === 1) { x.fillStyle = '#5a4434'; x.fillRect(px, 128, w, 102); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(px + w - 6, 128, 6, 102); }
      else { x.fillStyle = '#b8bab8'; x.fillRect(px, 132, w, 98); x.fillStyle = 'rgba(0,0,0,0.22)'; for (let q = 136; q < 230; q += 8) x.fillRect(px, q, w, 3); }
    }
    for (const px of [30, 150, 270, 400]) win(px, 28, 64, 56, false);
    x.fillStyle = 'rgba(40,40,40,0.5)'; x.fillRect(250, 96, 120, 6);   // a balcony slab + rail
    // clay tile rows (colonial / roman tiles): dark joints every 16 px, a lit crown on each row, vertical tile edges
    for (let y = 256; y < 384; y += 16) { x.fillStyle = 'rgba(0,0,0,0.32)'; x.fillRect(0, y, 512, 3); x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(0, y + 5, 512, 4); for (let q = (y / 16 & 1) * 10; q < 512; q += 20) { x.fillStyle = 'rgba(0,0,0,0.14)'; x.fillRect(q, y + 3, 3, 13); } }
    for (let i = 0; i < 400; i++) { x.fillStyle = 'rgba(' + (r() < 0.5 ? '0,0,0,' : '255,255,255,') + (0.05 + r() * 0.08) + ')'; x.fillRect(r() * 512, 256 + r() * 128, 6 + r() * 20, 4 + r() * 8); }
    // fibre-cement ribs
    for (let q = 0; q < 512; q += 12) { x.fillStyle = 'rgba(0,0,0,0.2)'; x.fillRect(q, 384, 4, 64); x.fillStyle = 'rgba(255,255,255,0.15)'; x.fillRect(q + 6, 384, 3, 64); }
    for (let i = 0; i < 120; i++) { x.fillStyle = 'rgba(40,40,30,' + (0.05 + r() * 0.1) + ')'; x.fillRect(r() * 512, 384 + r() * 64, 10 + r() * 30, 4 + r() * 10); }
    // plain
    for (let i = 0; i < 300; i++) { x.fillStyle = 'rgba(0,0,0,' + (0.02 + r() * 0.04) + ')'; x.fillRect(r() * 512, 448 + r() * 64, 4 + r() * 16, 2 + r() * 6); }
    return Env.tex(c, true, 8);
  }
  // apartment facade (mid-rise accents): one storey per 3 m, a 3 m window bay per 64 px; tinted per block
  function aptTex() {
    const [c, x] = Env.canvas(256, 128); x.fillStyle = '#e4e3df'; x.fillRect(0, 0, 256, 128);
    for (let f = 0; f < 2; f++) for (let b = 0; b < 4; b++) { const px = b * 64 + 10, py = f * 64 + 14; x.fillStyle = '#2c333b'; x.fillRect(px, py, 44, 32); x.fillStyle = 'rgba(170,190,210,0.22)'; x.fillRect(px, py, 44, 10); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(px - 4, py + 34, 52, 4); }
    x.fillStyle = 'rgba(0,0,0,0.1)'; x.fillRect(0, 60, 256, 4); x.fillRect(0, 124, 256, 4);
    x.fillStyle = '#d6d6d2'; x.fillRect(0, 0, 8, 8);
    return Env.tex(c, true, 8);
  }
  // wall colours (sRGB): cream, peach, blue, ochre, salmon, raw red brick, grey block, mint (photos bra_058 / bra_064: blue / peach / white walls)
  const WALL = [[214, 206, 190], [222, 178, 148], [124, 152, 180], [210, 182, 118], [208, 146, 132], [150, 86, 64], [146, 142, 134], [152, 178, 150]];
  const ROOFC = { tile: [[176, 94, 60], [160, 84, 54], [186, 108, 70], [140, 80, 58], [168, 100, 66]], slab: [[150, 146, 138], [136, 132, 126], [160, 156, 148]], sheet: [[164, 162, 156], [146, 146, 142], [120, 122, 120]], hall: [[150, 152, 150], [128, 132, 134]] };
  const TANK = [[58, 104, 168], [70, 112, 170], [120, 124, 126], [40, 44, 48]];
  const APT = [[206, 200, 186], [190, 184, 172], [176, 180, 182], [212, 196, 170]];
  function decodeHouses(D) {
    const b = Env.b64bytes(D.d); const dv = new DataView(b.buffer); const out = new Array(D.n);
    for (let k = 0, o = 0; k < D.n; k++, o += 9) out[k] = { x: dv.getInt16(o, true) / 10, z: dv.getInt16(o + 2, true) / 10, hl: b[o + 4] * 0.2, hd: b[o + 5] * 0.2, a: b[o + 6] / 256 * Math.PI, h: b[o + 7] * 0.4, f: b[o + 8] };
    return out;
  }
  BV.decodeHouses = decodeHouses;
  // the drawn ground beyond the fine terrain grid (sc.height is the analytic terrain there; the coarse ring mesh interpolates its own nodes)
  function groundAt(E, x, z) {
    const sc = E.sc; if (sc.heights && Math.abs(x) < sc.hHalf && Math.abs(z) < sc.hHalf) return sc.height(x, z);
    if (!E._brRing) { const KIN = E.terrainKin, GS = E.terrainGS, K = KIN + E.terrainRing; const g = []; for (let k = -K; k <= K; k++) g.push(Env.gridPos(k, KIN, GS)); E._brRing = g; }
    const g = E._brRing; const find = (v) => { let lo = 0, hi = g.length - 2; if (v <= g[0]) return 0; if (v >= g[hi + 1]) return hi; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (g[m] <= v) lo = m; else hi = m - 1; } return lo; };
    const i = find(x), j = find(z); const tx = U.clamp((x - g[i]) / (g[i + 1] - g[i]), 0, 1), tz = U.clamp((z - g[j]) / (g[j + 1] - g[j]), 0, 1);
    const h00 = E.terrainHeight(g[i], g[j]), h10 = E.terrainHeight(g[i + 1], g[j]), h01 = E.terrainHeight(g[i], g[j + 1]), h11 = E.terrainHeight(g[i + 1], g[j + 1]);
    if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  }
  BV.groundAt = groundAt;

  BV.LOWR = 1150;   // Low draws the houses nearer than this (its far plane is ~1.3 km)
  BV.city = function (E, keepPolys) {
    const D = E.data.forest; if (!D || !D.houses || D.cityRing === false) return; const T0 = performance.now(); const sc = E.sc, t = E.t, rng = U.rng(3141);
    const H = decodeHouses(D.houses); const OCC = Env.OCC; const BAD = OCC.ROAD | OCC.WATER | OCC.KEEP;
    const lm = E.data.landmarks || {}; const own = (E.standPolys || []).slice().concat(keepPolys || []);
    for (const k of ['pitBuilding', 'kart', 'station']) if (lm[k] && lm[k].p) own.push(lm[k].p);
    for (const k of ['grandstandsOSM', 'waterTanks']) for (const q of lm[k] || []) if (q && q.p) own.push(q.p);
    const ownBB = own.map(p => { let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity; for (const q of p) { a = Math.min(a, q[0]); b = Math.max(b, q[0]); c = Math.min(c, q[1]); d = Math.max(d, q[1]); } return [a - 2, b + 2, c - 2, d + 2]; });
    const inOwn = (x, z) => { for (let k = 0; k < own.length; k++) { const b = ownBB[k]; if (x < b[0] || x > b[1] || z < b[2] || z > b[3]) continue; if (U.pointInPoly(x, z, own[k])) return true; } return false; };
    const lapPoly = (t.data.center || []).map(p => [p[0], p[1]]);
    const NS = 8; const Q = []; for (let s = 0; s < NS; s++) Q.push({ pos: [], uv: [], col: [], nNear: 0, n: 0 });
    const QA = { pos: [], uv: [], col: [], n: 0 };   // apartment blocks (own facade texture)
    const tmp = new THREE.Color(); const lin = (c, k, out) => { tmp.setRGB(U.clamp(c[0] * k / 255, 0, 1), U.clamp(c[1] * k / 255, 0, 1), U.clamp(c[2] * k / 255, 0, 1)).convertSRGBToLinear(); out[0] = tmp.r; out[1] = tmp.g; out[2] = tmp.b; return out; };
    const pr = {}; let nb = 0, nSkip = 0, nTank = 0, tris = 0; const lots = [];
    for (const h of H) {
      const rad = Math.hypot(h.x, h.z); if (h.hl < 1.2 || h.hd < 1.0) continue;
      const ca = Math.cos(h.a), sa = Math.sin(h.a); const corner = (lx, lz) => [h.x + lx * ca - lz * sa, h.z + lx * sa + lz * ca];
      const K4 = [corner(-h.hl, -h.hd), corner(h.hl, -h.hd), corner(h.hl, h.hd), corner(-h.hl, h.hd)];
      // clear of the corridor (barrier + 6 m), roads / water / reserved ground, modelled buildings and stands
      // (houses front the street directly: only the inner half of the footprint must be clear of the road raster, which is drawn with a margin)
      let ok = true; for (const p of K4.map(q => [h.x + (q[0] - h.x) * 0.5, h.z + (q[1] - h.z) * 0.5]).concat([[h.x, h.z]])) { if (E.fsAt(p[0], p[1]) < 6 || (E.occAt(p[0], p[1]) & BAD)) { ok = false; break; } }
      if (ok) for (const p of K4) if (E.fsAt(p[0], p[1]) < 6 || (E.occAt(p[0], p[1]) & (OCC.WATER | OCC.KEEP))) { ok = false; break; }
      if (ok) { t.project(h.x, h.z, null, pr); const sd = pr.lat < 0 ? -1 : 1; if (pr.dist < E.wallCap(pr.i, sd) + 6 + Math.max(h.hl, h.hd)) { for (const p of K4) { t.project(p[0], p[1], null, pr); if (pr.dist < E.wallCap(pr.i, pr.lat < 0 ? -1 : 1) + 6) { ok = false; break; } } } }
      if (ok && inOwn(h.x, h.z)) ok = false;
      if (!ok) { nSkip++; continue; }
      let lo = Infinity, gc = 0; for (const p of K4) lo = Math.min(lo, groundAt(E, p[0], p[1])); gc = groundAt(E, h.x, h.z); lo = Math.min(lo, gc);
      lots.push({ h, rad, K4, lo, gc, inLap: lapPoly.length > 3 && U.pointInPoly(h.x, h.z, lapPoly), fs: E.fsAt(h.x, h.z), s: Math.floor(((Math.atan2(h.z, h.x) / (2 * Math.PI)) + 1) * NS) % NS });
    }
    lots.sort((a, b) => a.rad - b.rad);
    const cW = [0, 0, 0], cR = [0, 0, 0], cT = [0, 0, 0];
    for (const L of lots) {
      const h = L.h, f = h.f, roof = f & 3, fav = !!(f & 4), mid = !!(f & 8), wc = (f >> 4) & 7; const q = mid ? QA : Q[L.s]; const P = q.pos, UV = q.uv, CO = q.col; const before = P.length;
      const y0 = L.lo - 0.3; const k = 0.86 + 0.18 * rng();
      if (mid) lin(APT[Math.floor(rng() * APT.length)], k, cW); else lin(WALL[wc], k * (fav ? 0.92 : 1), cW);
      // roof form: hip (clay tiles), flat slab (+ water tank), mono-pitch sheet, flat hall roof
      const pitch = roof === 0 ? Math.min(2.4, h.hd * 0.5) : roof === 2 ? Math.min(0.9, h.hd * 0.18) : 0;
      const eave = Math.max(L.gc + 2.5, L.gc + h.h - pitch); const yTop = eave;
      const rc = roof === 0 ? ROOFC.tile : roof === 1 ? ROOFC.slab : roof === 2 ? ROOFC.sheet : ROOFC.hall; lin(rc[Math.floor(rng() * rc.length)], 0.88 + 0.2 * rng(), cR);
      const tri = (A, B, Cc, ua, ub, uc, c) => { P.push(A[0], A[1], A[2], B[0], B[1], B[2], Cc[0], Cc[1], Cc[2]); UV.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]); for (let r = 0; r < 3; r++) CO.push(c[0], c[1], c[2]); };
      // walls (outward faces, counter-clockwise from outside); a wall facing away from the lap is left out (never seen from the track), except
      // inside the lap where the circuit is on every side
      const storeys2 = h.h - pitch > 5.2 || mid || roof === 3; const vTop = mid ? (yTop - y0) / 3 * 0.5 : roof === 3 ? VB.plain + 0.02 : storeys2 ? VB.top - 0.003 : VB.mid, vBot = mid ? 0 : roof === 3 ? VB.plain : VB.base;
      t.project(h.x, h.z, null, pr); const tx = t.x[pr.i] - h.x, tz = t.z[pr.i] - h.z; const tl = Math.hypot(tx, tz) || 1;
      let u = rng() * 16;
      for (let e = 0; e < 4; e++) {
        const a = L.K4[e], b = L.K4[(e + 1) % 4]; const ex = b[0] - a[0], ez = b[1] - a[1]; const len = Math.hypot(ex, ez); const nxw = ez / len, nzw = -ex / len;   // (outward for the corner order above)
        if (!L.inLap && L.fs > 80 && (nxw * tx + nzw * tz) / tl < -0.5) { u += len; continue; }   // (the stands / TV towers see the near houses from above and behind)
        const uS = mid ? 1 / 12 : 1 / 16; const u0 = u * uS, u1 = (u + len) * uS; u += len;
        const ya = yTop + (roof === 2 && e < 2 ? pitch : 0), yb = yTop + (roof === 2 && (e === 0 || e === 3) ? pitch : 0);   // (mono-pitch: the -z side is the high eave)
        tri([a[0], y0, a[1]], [b[0], yb, b[1]], [b[0], y0, b[1]], [u0, vBot], [u1, vTop], [u1, vBot], cW);
        tri([a[0], y0, a[1]], [a[0], ya, a[1]], [b[0], yb, b[1]], [u0, vBot], [u0, vTop], [u1, vTop], cW);
      }
      // roof
      const ca = Math.cos(h.a), sa = Math.sin(h.a); const W = (lx, lz, y) => [h.x + lx * ca - lz * sa, y, h.z + lx * sa + lz * ca];
      if (roof === 0) {
        const o = 0.35, hl = h.hl + o, hd = h.hd + o, rl = Math.max(0, h.hl - h.hd), yr = eave + pitch, yE = eave - o * pitch / Math.max(0.5, h.hd);
        const A0 = W(-hl, -hd, yE), A1 = W(hl, -hd, yE), A2 = W(hl, hd, yE), A3 = W(-hl, hd, yE), R0 = W(-rl, 0, yr), R1 = W(rl, 0, yr);
        const s0 = VB.tile0, s1 = VB.tile1, U2 = (lx) => lx / 16;
        tri(A0, R1, A1, [U2(-hl), s0], [U2(rl), s1], [U2(hl), s0], cR); tri(A0, R0, R1, [U2(-hl), s0], [U2(-rl), s1], [U2(rl), s1], cR);   // slope -z
        tri(A2, R0, A3, [U2(hl), s0], [U2(-rl), s1], [U2(-hl), s0], cR); tri(A2, R1, R0, [U2(hl), s0], [U2(rl), s1], [U2(-rl), s1], cR);   // slope +z
        tri(A1, R1, A2, [0, s0], [hd / 16, s1], [2 * hd / 16, s0], cR); tri(A3, R0, A0, [0, s0], [hd / 16, s1], [2 * hd / 16, s0], cR);     // hip ends
      } else {
        const hiZ = roof === 2 ? pitch : 0; const A0 = W(-h.hl, -h.hd, yTop + hiZ), A1 = W(h.hl, -h.hd, yTop + hiZ), A2 = W(h.hl, h.hd, yTop), A3 = W(-h.hl, h.hd, yTop);
        const vv = roof === 2 ? [VB.rib0, VB.rib1] : [VB.plain, VB.plain + 0.03]; const uR = mid ? 0 : h.hl / 8;
        if (mid) { tri(A0, A2, A1, [0.01, 0.98], [0.02, 0.98], [0.02, 0.97], cR); tri(A0, A3, A2, [0.01, 0.98], [0.01, 0.97], [0.02, 0.98], cR); }
        else { tri(A0, A2, A1, [0, vv[0]], [uR, vv[1]], [uR, vv[0]], cR); tri(A0, A3, A2, [0, vv[0]], [0, vv[1]], [uR, vv[1]], cR); }
        // a water tank on the slab (blue polyethylene / grey fibre-cement), near houses only
        if (roof === 1 && !mid && L.rad < 900 && rng() < 0.55) {
          lin(TANK[Math.floor(rng() * TANK.length)], 0.9 + 0.2 * rng(), cT); const tw = 0.75, th = 1.1, lx = (rng() - 0.5) * Math.max(0, h.hl - 1.2) * 1.6, lz = (rng() - 0.5) * Math.max(0, h.hd - 1.2) * 1.6;
          const b0 = W(lx - tw, lz - tw, yTop), b1 = W(lx + tw, lz - tw, yTop), b2 = W(lx + tw, lz + tw, yTop), b3 = W(lx - tw, lz + tw, yTop); const T = (p) => [p[0], p[1] + th, p[2]]; const pv = [VB.plain, VB.plain + 0.02];
          for (const [a, b] of [[b0, b1], [b1, b2], [b2, b3], [b3, b0]]) { tri(a, T(b), b, [0, pv[0]], [0.1, pv[1]], [0.1, pv[0]], cT); tri(a, T(a), T(b), [0, pv[0]], [0, pv[1]], [0.1, pv[1]], cT); }
          tri(T(b0), T(b2), T(b1), [0, pv[0]], [0.1, pv[1]], [0.1, pv[0]], cT); tri(T(b0), T(b3), T(b2), [0, pv[0]], [0, pv[1]], [0.1, pv[1]], cT); nTank++;
        }
      }
      if (L.rad <= BV.LOWR) q.nNear = P.length / 3; q.n++; nb++; tris += (P.length - before) / 9;
      // trees and grass keep off the house (OCC.BUILT, padded 1 m)
      E.markPoly(L.K4, OCC.BUILT, 1);
    }
    const mat = new THREE.MeshStandardMaterial({ map: houseTex(), vertexColors: true, roughness: 0.85, metalness: 0.05 });   // (= the generic OSM building material: same program)
    const matA = new THREE.MeshStandardMaterial({ map: aptTex(), vertexColors: true, roughness: 0.85, metalness: 0.05 });
    E.cityEdge = [];
    const mk = (q, m, name) => {
      if (!q.pos.length) return; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(q.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(q.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(q.col, 3));
      g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
      const me = new THREE.Mesh(g, m); me.name = name; me.receiveShadow = true; me.castShadow = false; me.matrixAutoUpdate = false; me.updateMatrix(); me.userData.nearVerts = q.nNear != null ? q.nNear : Infinity; sc.group.add(me); E.cityEdge.push(me);
    };
    Q.forEach((q, i) => mk(q, mat, 'braHouses'));
    QA.nNear = Infinity; mk(QA, matA, 'braMidrise');
    E.stats.houses = { built: nb, skipped: nSkip, tanks: nTank, tris: Math.round(tris), meshes: E.cityEdge.length, ms: Math.round(performance.now() - T0) };
  };

  if (EI.Scenery) {
    // the generic OSM boxes keep only the named buildings on interlagos (the houses, halls and blocks are drawn above, from the same OSM footprints)
    const oBB = EI.Scenery.prototype.buildBuildings;
    EI.Scenery.prototype.buildBuildings = function () {
      if (!isI(this.track) || !this.env || !this.env.forestOn || !(this.env.data.forest || {}).houses) return oBB.call(this);
      const sc = this.track.data.scenery, all = sc.buildings; const keep = all.filter(b => b && b.n);
      sc.buildings = keep;
      try { oBB.call(this); } finally { sc.buildings = all; }
      BV.city(this.env, keep.map(b => b.p).filter(p => p && p.length > 2));
    };
    // Low: the houses beyond BV.LOWR are not drawn (nearest first per sector, so a draw range does it)
    const oSQ = EI.Scenery.prototype.setQuality;
    EI.Scenery.prototype.setQuality = function (q) { const r = oSQ.apply(this, arguments); const ce = isI(this.track) && this.env && this.env.cityEdge; if (ce) for (const m of ce) m.geometry.setDrawRange(0, q === 'low' ? m.userData.nearVerts : Infinity); return r; };
  }
})();
