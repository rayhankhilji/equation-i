// Equation I - Monza grandstands. Layout from the OSM footprints (js/env_monza_osm.js) + a few runs OSM misses (Curva Biassono, Lesmo):
// each stand becomes chords along the lap (EI.EnvVenue builds their tiers, front walls, boards and the crowd); this file adds what makes
// them Monza: the 1938 Tribuna Centrale (two tiers of white seats, thin cantilevered concrete roof, the drum-shaped control tower and
// the antenna masts on top), the long covered Laterali (blue seats, thin flat roof on slim columns, white fascia), the big open concrete
// Parabolica stands, concrete backs / ends for every permanent stand, flag poles with tricolours and tifosi banners. The temporary
// scaffold stands (Prima Variante, Alta Velocita, Roggia, Ascari, Lesmo, Biassono) keep the venue's galvanised scaffold look.
(function () {
  const Mz = EI.EnvMonza; if (!Mz) return;
  const U = EI.U, Env = EI.Env, K = Mz.K, C = K.C;
  const St = {};
  // OSM name -> style. centrale: two tiers + roof + drum; covered: flat roof on columns; open: concrete, no roof; temp: scaffold (venue)
  const PLAN = [
    [/^Tribuna Centrale$/, { style: 'centrale', seat: 0xe8e8e3, label: 'CENTRALE' }],
    [/Laterale (Destra|Sinistra)/, { style: 'covered', seat: 0x2356a6 }],
    [/Piscina/, { style: 'covered', seat: 0x2356a6, label: 'PISCINA' }],
    [/Vedano/, { style: 'open', seat: 0x2356a6, label: 'VEDANO' }],
    [/^Tribuna Parabolica$/, { style: 'covered', seat: 0x2d5fb0, label: 'PARABOLICA', maxRows: 30 }],   // grandstand 22: covered permanent (FACTS 11)
    [/Laterale Parabolica/, { style: 'open', seat: 0xb4b8bc, label: 'PARABOLICA' }],   // refs2 stands_3: long open terraces of grey aluminium benches
    [/Parabolica interna/, { style: 'open', seat: 0xb8202a, label: 'PARABOLICA' }],
    [/Alta Velocit/, { style: 'temp', roof: true, seat: 0x2356a6, label: 'ALTA VELOCITA', sMax: 588, maxRows: 18 }],   // grandstand 6A-C inside T1: steel stand, partly covered; it stops before the apex (MONZA-DRESS: no blank walls facing the straight)
    [/Prima Variante/, { style: 'temp', seat: 0x3d5f8f, label: 'PRIMA VARIANTE', maxRows: 22 }],
    [/Seconda Variante|Roggia/, { style: 'temp', seat: 0x8c1d24, label: 'ROGGIA' }],
    [/Ascari|Museo|Amici/, { style: 'temp', seat: 0x3d5f8f, label: 'ASCARI' }],
  ];
  // runs OSM does not map (research lap s, side 'out' = outside of the corner): temporary stands on the grass banks
  const EXTRA = [
    // grandstand 10BIS "Lesmo 2 Interno" on the INSIDE of Lesmo 2 (refs2 lesmo_1-3); no stands overlook Lesmo 1 or Curva Biassono
    { s0: 2560, s1: 2612, side: 'in', gap: 7, rows: 10, style: 'temp', seat: 0x9aa3ad, label: 'LESMO' },
  ];
  const PERM = { centrale: 1, covered: 1, open: 1 };

  // ================================================================ layout (inside EnvVenue.layoutStands, so the venue builds the tiers + crowd)
  St.layout = function (E) {
    const t = E.t, f = Mz.fit(t), pr = {}; E.mzRuns = []; const L = t.length;
    for (const st of EI.MONZA_OSM.stands) {
      let plan = null; for (const [re, p] of PLAN) if (re.test(st.n)) { plan = p; break; } if (!plan) continue;
      if (st.n === '' ) continue;
      const poly = f.poly(st.p); let cx = 0, cz = 0; for (const p of poly) { cx += p[0]; cz += p[1]; } cx /= poly.length; cz /= poly.length;
      t.project(cx, cz, null, pr); const sc = pr.s, side = pr.lat > 0 ? 1 : -1;
      let a = Infinity, b = -Infinity, dmin = Infinity, dmax = -Infinity;
      for (const p of poly) { t.project(p[0], p[1], null, pr); const ds = U.mod(pr.s - sc + L / 2, L) - L / 2; a = Math.min(a, ds); b = Math.max(b, ds); const d = pr.lat * side; dmin = Math.min(dmin, d); dmax = Math.max(dmax, d); }
      if (b - a < 8 || dmax - dmin < 5) continue;
      let s0 = sc + a, s1 = sc + b; if (plan.sMax != null && U.mod(s1, L) > plan.sMax && U.mod(s0, L) < plan.sMax + 200) s1 = s0 + (plan.sMax - U.mod(s0, L)); if (s1 - s0 < 8) continue;
      St.run(E, Object.assign({ name: st.n, s0, s1, side, dmin, dmax }, plan));
    }
    for (const x of EXTRA) {
      const s0 = f.s(x.s0), s1 = s0 + U.mod(f.s(x.s1) - s0, L); const kk = t.smooth(t.k, 12); const im = t.idxAtS((s0 + s1) / 2); const out = kk[im] > 0 ? -1 : 1; const side = x.side === 'out' ? out : x.side === 'in' ? -out : x.side;
      St.run(E, Object.assign({ name: x.label, s0, s1, side, gapW: x.gap, rowsFix: x.rows }, x));
    }
    E.stats.monzaStands = { runs: E.mzRuns.length, blocks: E.mzRuns.reduce((n, r) => n + r.blocks.length, 0) };
  };
  // one run -> chords following the lap (straight blocks, max ~40 m on the straights, shorter in the curves)
  St.run = function (E, R) {
    const t = E.t, OCC = Env.OCC; const kk = t.smooth(t.k, 10); const side = R.side; const perm = !!PERM[R.style];
    const run = { R, blocks: [], tiers: [] }; let s = R.s0, k = 0;
    while (s < R.s1 - 5) {
      const i0 = t.idxAtS(s); const Rr = 1 / (Math.abs(kk[i0]) + 1e-5); const step = U.clamp(Rr * 0.24, 8, R.style === 'centrale' ? 36 : 40); let sb = Math.min(R.s1, s + step); if (R.s1 - sb < 6) sb = R.s1;
      let wmax = 0; for (let q = s; q <= sb + 0.01; q += 2) wmax = Math.max(wmax, E.wallCap(t.idxAtS(q), side));
      const d = R.gapW != null ? wmax + R.gapW : Math.max(R.dmin != null ? R.dmin : 0, wmax + 2.6);
      const inner = (kk[i0] > 0) === (side > 0); if (inner && d > Rr * 0.8) { s = sb; continue; }
      const ia = t.idxAtS(s), ib = t.idxAtS(sb);
      const A = [t.x[ia] + t.nx[ia] * side * d, t.z[ia] + t.nz[ia] * side * d], B = [t.x[ib] + t.nx[ib] * side * d, t.z[ib] + t.nz[ib] * side * d];
      let ax = B[0] - A[0], az = B[1] - A[1]; const len = Math.hypot(ax, az); if (!(len >= 5)) { s = sb; continue; } ax /= len; az /= len;
      let nx = -az, nz = ax; const im = t.idxAtS((s + sb) / 2); if (nx * t.nx[im] * side + nz * t.nz[im] * side < 0) { nx = -nx; nz = -nz; }
      const avail = R.rowsFix ? R.rowsFix * 0.82 + 1.6 : (R.dmax != null ? R.dmax - d : 14);
      // every corner clear of the barriers: through the Rettifilo chicane the chords crossed the other leg onto the track (FIT-AUDIT)
      if ([A, B].some(P => E.fsAt(P[0], P[1]) < 1 || E.dcAt(P[0] + nx * Math.max(avail, 2), P[1] + nz * Math.max(avail, 2)) < t.halfWidth + t.kerbWidth + 4)) { s = sb; continue; }
      const y = t.y[im] - 0.03; const cx = (A[0] + B[0]) / 2, cz = (A[1] + B[1]) / 2;
      const mk = (rows, off, dy, tier) => {
        const blk = { cx: cx + nx * off, cz: cz + nz * off, ax, az, nx, nz, len: len - 0.3, rows, roof: false, seat: R.seat, y: y + dy, s: (s + sb) / 2, first: false, last: false, name: R.label || R.name.replace(/^Tribuna /, '').toUpperCase(), mz: { tier, run, k } };
        if (!perm) { blk.first = k === 0; blk.last = sb >= R.s1 - 0.01; }
        const sdr = St.dressOf(E.t, blk.name); if (sdr) { if (sdr.fill != null) blk.fill = sdr.fill; if (sdr.red != null) blk.red = sdr.red; }   // data.dress.stands (js/data/monza_dress.js)
        const depth = 0.4 + rows * 0.82 + 0.6;
        E.blocks.push(blk); run.blocks.push(blk); E.standPolys.push(E.markRect(blk.cx + nx * depth / 2, blk.cz + nz * depth / 2, ax, az, blk.len / 2 + 0.3, depth / 2 + 0.3, OCC.BUILT));
        return blk;
      };
      if (R.style === 'centrale') {
        // refs2 start_3: ONE tier of white seats raised over a glazed ground storey, a glazed band and the thin roof above it
        const rows = U.clamp(Math.floor((Math.min(avail, 24) - 1.6) / 0.82), 10, 13); const b = mk(rows, 0, St.RAISE, 0); b.mz.raise = St.RAISE;
      } else {
        const rows = U.clamp(Math.floor((Math.min(avail, 40) - 1.6) / 0.82), 6, R.maxRows || 28);
        mk(rows, 0, 0, 0);
      }
      k++; s = sb;
    }
    if (run.blocks.length) E.mzRuns.push(run);
    return run;
  };

  // data.dress.stands[name] = { fill (seat occupancy 0..1), red (share of red shirts), flags (m per flag pole), banners (chance per block) }
  St.RAISE = 3.6;   // the Centrale's ground storey
  St.dressOf = function (t, name) { const D = t.data.dress && t.data.dress.stands; return D && name ? (D[name] || null) : null; };

  // ================================================================ dressing
  St.flip = (b) => (-b.az * b.nx + b.ax * b.nz) < 0;
  St.build = function (E, BK, out) {
    const { B, S, G, F: Fd, A } = BK; const t = E.t; const rng = U.rng(938);
    const conc = C(0xd9d3c3), concD = C(0xb7b1a2), cream = C(0xe6dfcc), soffit = C(0x5a5c5e), white = C(0xf2f2ef), steel = C(0x9aa1a8), dark = C(0x2a2d33), navy = C(0x1c2740);
    // atlas: partner tiles for the roof fascias (5:1), tifosi banners, flags
    const tiles = []; for (let k = 0; k < 8; k++) tiles.push(A.region('mzTile' + k, 320, 64, (x2, w, h) => Mz.paintAd(x2, w, h, k, 5)));
    const BANNERS = [['FORZA FERRARI', '#d40000', '#ffd200'], ['TIFOSI', '#d40000', '#ffffff'], ['GRAZIE MONZA', '#111111', '#ff2a2a'], ['FORZA ROSSA', '#ffd200', '#c00000'], ['SCUDERIA CLUB', '#c00000', '#ffffff'], ['ITALIA', '#009246', '#ffffff']];
    const bannerR = BANNERS.map(([txt, bg, fg], k) => A.region('mzBanner' + k, 256, 48, (x2, w, h) => { Mz.paintText(x2, w, h, txt, { bg, fg, size: 0.66 }); x2.strokeStyle = fg; x2.lineWidth = 3; x2.strokeRect(3, 3, w - 6, h - 6); }));
    const flagR = St.flagRegions(A);
    let roofs = 0, flags = 0, banners = 0;
    const flagAt = (P0, yaw, r) => { St.flag(A, r, P0, yaw); flags++; };
    for (const run of E.mzRuns) {
      const R = run.R; const perm = !!PERM[R.style];
      const bl = run.blocks.filter(b => b.mz.tier === 0), up = run.blocks.filter(b => b.mz.tier === 1);
      for (const b of run.blocks) {
        const m = Env.frame(b.cx, b.y, b.cz, b.ax, b.az, b.nx, b.nz); const P = (x, y, z) => Env.xf(m, x, y, z); const hl = b.len / 2;
        const yTop = 1.4 + b.rows * 0.42, zBack = 0.4 + b.rows * 0.82; b.mz.yTop = yTop; b.mz.zBack = zBack; b.mz.m = m;
        if (!perm) continue;
        // concrete back wall (hides the venue's scaffold frames) with pilasters, a plinth down into the ground, end walls at the run ends
        const yb = -2.0 - (b.mz.raise || 0);
        K.dq(B, P(-hl - 0.1, yb, zBack + 0.14), P(hl + 0.1, yb, zBack + 0.14), P(hl + 0.1, yTop + 1.25, zBack + 0.14), P(-hl - 0.1, yTop + 1.25, zBack + 0.14), conc);
        for (let a = -hl + 2.5; a < hl - 1; a += 5) B.box(m, 0.5, yTop + 1.25 - yb, 0.4, a, yb, zBack + 0.36, concD);
        // the back is not a blank slab: a band of concourse windows and a darker plinth course (cheap: two strips)
        { const yw = Math.max(1.0, yTop * 0.55); K.dq(B, P(-hl, yw, zBack + 0.16), P(hl, yw, zBack + 0.16), P(hl, yw + 1.1, zBack + 0.16), P(-hl, yw + 1.1, zBack + 0.16), C(0x3a4148));
          K.dq(B, P(-hl, yb, zBack + 0.16), P(hl, yb, zBack + 0.16), P(hl, 0.6, zBack + 0.16), P(-hl, 0.6, zBack + 0.16), concD); }
        { const yp = b.mz.raise ? -b.mz.raise - 0.4 : 0.05; K.dq(B, P(-hl - 0.1, yb, -0.06), P(hl + 0.1, yb, -0.06), P(hl + 0.1, yp, -0.06), P(-hl - 0.1, yp, -0.06), concD); }
        const firstK = b === run.blocks[0] || (b.mz.tier === 1 && b === up[0]), lastK = b === bl[bl.length - 1] || (b.mz.tier === 1 && b === up[up.length - 1]);
        const fs = St.flip(b) ? -1 : 1;   // Env.frame mirrors x when the chord frame would be left-handed: the run's start is then at +x
        for (const [flag, sx] of [[firstK, -fs * (hl + 0.1)], [lastK, fs * (hl + 0.1)]]) if (flag) { K.dq(B, P(sx, yb, -0.08), P(sx, yb, zBack + 0.14), P(sx, yTop + 1.25, zBack + 0.14), P(sx, 1.6, -0.08), concD); const so = sx > 0 ? 0.03 : -0.03; K.dq(B, P(sx + so, 0, zBack * 0.55), P(sx + so, 0, zBack * 0.55 + 1.8), P(sx + so, 2.4, zBack * 0.55 + 1.8), P(sx + so, 2.4, zBack * 0.55), dark); }   // end wall + a stair door
        // stair doors / vomitories in the back wall
        for (let a = -hl + 7; a < hl - 4; a += 14) B.box(m, 1.8, 2.3, 0.06, a, 0, zBack + 0.17, dark);
      }
      // wedges between consecutive chords of a curved run (the backs open up on the convex side)
      for (const list of [bl, up]) for (let k = 0; k + 1 < list.length && perm; k++) {
        const a = list[k], b = list[k + 1]; const ma = a.mz.m, mb = b.mz.m; const ha = a.len / 2, hb = b.len / 2;
        const fa = St.flip(a) ? -1 : 1, fb = St.flip(b) ? -1 : 1; const pa = (y, z) => Env.xf(ma, fa * (ha + 0.1), y, z), pb = (y, z) => Env.xf(mb, -fb * (hb + 0.1), y, z);
        const yT = a.mz.yTop, zB = a.mz.zBack, ybw = -2 - (a.mz.raise || 0);
        K.dq(B, pa(ybw, zB + 0.14), pb(ybw, zB + 0.14), pb(yT + 1.25, zB + 0.14), pa(yT + 1.25, zB + 0.14), conc);
        K.dq(B, pa(1.4, 0.4), pb(1.4, 0.4), pb(yT, zB), pa(yT, zB), C(a.seat).multiplyScalar(0.8));
        K.dq(B, pa(ybw, -0.06), pb(ybw, -0.06), pb(1.4, -0.06), pa(1.4, -0.06), concD);
      }
      // ---- covered stands: thin flat roof on slim front and back columns, dark soffit, white fascia with partner tiles
      if (R.style === 'covered' || R.roof) {
        for (const b of bl) {
          const m = b.mz.m, hl = b.len / 2, P = (x, y, z) => Env.xf(m, x, y, z); const yR = b.mz.yTop + 3.1, zF = -1.4, zR = b.mz.zBack + 0.6;
          B.box(m, b.len + 0.1, 0.32, zR - zF, 0, yR, (zF + zR) / 2, soffit, { top: C(0xb9bcbf), bottom: true });
          K.dq(B, P(-hl - 0.05, yR - 0.75, zF - 0.02), P(hl + 0.05, yR - 0.75, zF - 0.02), P(hl + 0.05, yR + 0.34, zF - 0.02), P(-hl - 0.05, yR + 0.34, zF - 0.02), white);
          // partner tiles along the fascia, 5:1, centred
          const th = 0.8, tw = th * 5; const n = Math.floor((b.len - 1) / (tw + 1.5)); const x0 = -(n * (tw + 1.5) - 1.5) / 2;
          for (let k = 0; k < n; k++) { const xa = x0 + k * (tw + 1.5); const r = tiles[Math.floor(rng() * 8)]; A.quad(r, P(xa + tw, yR - 0.72, zF - 0.06), P(xa, yR - 0.72, zF - 0.06), P(xa, yR + 0.08, zF - 0.06), P(xa + tw, yR + 0.08, zF - 0.06)); }
          // columns: steel back row, slim front posts every ~12 m
          for (let a = -hl + 1.5; a <= hl - 1.4; a += Math.max(6, b.len / Math.max(1, Math.round(b.len / 9)))) S.box(m, 0.3, yR + 2, 0.3, a, -2, b.mz.zBack + 0.35, steel);
          for (let a = -hl + 4; a <= hl - 3; a += 12) S.beam(m, [a, 1.4, 0.35], [a, yR, 0.35], 0.14, C(0x3a3f46));
          Fd.beam(m, [-hl, yR - 0.15, zF + 1.2], [hl, yR - 0.15, zF + 1.2], 0.12, C(0x70757b));
          // lamp masts on the roof (tifosi_invasion_2011: floodlight-style masts along the covered stands)
          if (b.len > 14) { const zM = (zF + zR) * 0.6; S.beam(m, [0, yR + 0.32, zM], [0, yR + 6.5, zM], 0.16, C(0xb7bcc1)); S.box(m, 2.2, 0.7, 0.5, 0, yR + 6.3, zM - 0.2, C(0x34383d)); }
          for (let a = -hl + 3; a < hl - 1; a += 6) Fd.box(m, 0.5, 0.12, 0.3, a, yR - 0.14, zF + 1.8, C(0xfff4dc));
          roofs++;
        }
      }
      // ---- the Tribuna Centrale (refs2 start_3, 1938 rationalist): white seats over a glazed ground storey, yellow stair aisles, a glazed
      // band under a deep thin cream roof, the drum-shaped control tower on the roof with its tapering bay down into the seats, masts
      if (R.style === 'centrale' && bl.length) {
        const creamS = C(0xebe5d3), glassC = C(0x2e4152), yel = C(0xe8b417), frame = C(0xf2f1ec);
        for (const b of bl) {
          const m = b.mz.m, hl = b.len / 2, P = (x, y, z) => Env.xf(m, x, y, z); const yT = b.mz.yTop, zB = b.mz.zBack, rz = b.mz.raise || 0;
          const yR = yT + 3.0, zF = -7.0, zR = zB + 2.6; b.mz.yR = yR;
          // the roof slab: cream soffit (it reads light in the photos), grey top; a thin cream fascia
          B.box(m, b.len + 0.1, 0.5, zR - zF, 0, yR, (zF + zR) / 2, creamS, { top: C(0xb9bcbf), bottom: true });
          // glazed band between the top row and the roof, white sill / head, mullions
          K.dq(G, P(-hl, yT + 0.25, zB - 0.25), P(hl, yT + 0.25, zB - 0.25), P(hl, yR, zB - 0.25), P(-hl, yR, zB - 0.25), glassC);
          B.box(m, b.len, 0.3, 0.5, 0, yT, zB - 0.2, frame);
          for (let a = -hl + 1.0; a < hl - 0.5; a += 2.0) BK.H.box(m, 0.1, yR - yT - 0.3, 0.08, a, yT + 0.3, zB - 0.32, frame);
          // the glazed ground storey under the tier, white frame band, mullions
          K.dq(G, P(-hl, -rz - 0.4, 0.3), P(hl, -rz - 0.4, 0.3), P(hl, -0.1, 0.3), P(-hl, -0.1, 0.3), C(0x34485a));
          B.box(m, b.len, 0.45, 0.5, 0, -0.45, 0.25, frame);
          for (let a = -hl + 1.5; a < hl - 0.5; a += 3.0) Fd.box(m, 0.14, rz, 0.1, a, -rz - 0.4, 0.2, frame);
          // yellow stair aisles (the venue's aisles every 14 m): treads and risers painted
          for (let a = -hl + 7; a < hl - 4; a += 14) for (let r = 0; r < b.rows; r++) {
            const y = 1.4 + r * 0.42, za = 0.4 + r * 0.82, zb = za + 0.82;
            B.quad(P(a - 0.6, y + 0.42 + 0.02, za), P(a - 0.6, y + 0.42 + 0.02, zb), P(a + 0.6, y + 0.42 + 0.02, zb), P(a + 0.6, y + 0.42 + 0.02, za), yel);
            B.quad(P(a - 0.6, y + 0.42, za - 0.02), P(a + 0.6, y + 0.42, za - 0.02), P(a + 0.6, y, za - 0.02), P(a - 0.6, y, za - 0.02), C(0xc99a10));
          }
          for (let a = -hl + 1.5; a <= hl - 1.4; a += Math.max(6, b.len / Math.max(1, Math.round(b.len / 9)))) B.box(m, 0.6, yR + 2.0 + rz, 2.2, a, -2 - rz, zB + 0.9, cream);
          roofs++;
        }
        // the drum at the run's middle
        const bm = bl[Math.floor((bl.length - 1) / 2)], bn = bl[Math.min(bl.length - 1, Math.floor(bl.length / 2))];
        const m = bm.mz.m; const xm = bm === bn ? 0 : (St.flip(bm) ? -1 : 1) * bm.len / 2; const yR = bm.mz.yR, zD = -3.6, yT = bm.mz.yTop;   // start_3: the drum stands on the roof's FRONT edge, its bay dropping in front of the seats
        K.cyl(B, m, xm, zD, yR + 0.5, 1.1, 3.3, 16, cream);                               // base
        K.cyl(G, m, xm, zD, yR + 1.6, 2.3, 4.0, 16, C(0x52687a));                         // glazed band
        for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; Fd.beam(m, [xm + Math.cos(a) * 4.05, yR + 1.6, zD + Math.sin(a) * 4.05], [xm + Math.cos(a) * 4.05, yR + 3.9, zD + Math.sin(a) * 4.05], 0.1, white); }
        K.cyl(B, m, xm, zD, yR + 3.9, 0.4, 4.7, 16, cream, cream);                        // overhanging cap
        K.cyl(B, m, xm, zD, yR + 4.3, 0.9, 1.8, 10, cream, cream);                        // lantern
        S.beam(m, [xm + 0.8, yR + 5.2, zD], [xm + 0.8, yR + 9.5, zD], 0.1, C(0xb9bec4));   // aerial
        // the bay: a tapering cylinder under the drum from the roof down to the middle of the tier (radius 3.4 at the roof, 2.2 low down)
        const yBot = 1.4 + bm.rows * 0.42 * 0.45;
        for (let k = 0; k < 12; k++) { const a0 = Math.PI * 0.75 + k / 12 * Math.PI * 1.5, a1 = Math.PI * 0.75 + (k + 1) / 12 * Math.PI * 1.5;
          const p = (a, y) => { const r = 2.2 + 1.2 * (y - yBot) / (yR - yBot); return Env.xf(m, xm + Math.cos(a) * r, y, zD + Math.sin(a) * r); };
          K.dq(B, p(a0, yBot), p(a1, yBot), p(a1, yR), p(a0, yR), cream);
          if (k === 5 || k === 6) K.dq(G, p(a0 + 0.06, yBot + 1.2), p(a1 - 0.06, yBot + 1.2), p(a1 - 0.06, yR - 0.8), p(a0 + 0.06, yR - 0.8), C(0x2c3e50)); }
        K.disc(B, m, xm, zD, yBot, 0, 2.3, 8, cream);
        // the centre stair from the ground up to the seats' front, white with steel rails
        { const rz = bm.mz.raise || 0; for (let k = 0; k < 6; k++) { const f = k / 6; B.box(m, 2.6, 0.3, 0.9, xm, -rz - 0.4 + f * (rz + 1.4), -2.4 + f * 2.6, frame); }
          for (const sx of [-1.35, 1.35]) Fd.beam(m, [xm + sx, -rz + 0.6, -2.6], [xm + sx, 2.4, 0.2], 0.06, C(0xb9bec4)); }
        // lattice antenna masts with panel heads either side of the drum, two light poles with cell panels between
        let am = 0; for (const b of bl) { const hl = b.len / 2; for (const a of [-hl * 0.55, hl * 0.55]) { if (am >= 4) break; const mm = b.mz.m; const yRb = b.mz.yR + 0.5;
          if (am % 2 === 0) K.lattice(S, mm, a, b.mz.zBack - 0.5, yRb, yRb + 13, 1.0, 0.5, C(0xb9bec4), 0.09); else S.beam(mm, [a, yRb, b.mz.zBack - 0.5], [a, yRb + 10, b.mz.zBack - 0.5], 0.3, C(0xb9bec4));
          for (let k = 0; k < 3; k++) { const ang = k / 3 * Math.PI * 2; S.box(mm, 0.3, 1.6, 0.12, a + Math.cos(ang) * 0.5, yRb + (am % 2 ? 8.2 : 11.2), b.mz.zBack - 0.5 + Math.sin(ang) * 0.5, C(0xdfe2e4)); } am++; } }
        out.centrale = { blocks: run.blocks.length, rows: bm.rows };
      }
      // ---- flags: tricolours on poles behind the permanent stands, tifosi flags on the temporary ones; banners on the front walls
      for (const b of bl) {
        const m = b.mz.m, hl = b.len / 2, P = (x, y, z) => Env.xf(m, x, y, z); const o = Env.xf(m, 0, 0, 0), fw = Env.xf(m, 0, 0, -1); const yaw = Math.atan2(fw[0] - o[0], fw[2] - o[2]);
        const topY = R.style === 'covered' || R.style === 'centrale' ? b.mz.yTop + 3.6 : b.mz.yTop + 1.3;
        const sdr = St.dressOf(t, b.name) || {};
        const nf = sdr.flags != null ? Math.floor(b.len / sdr.flags + rng()) : perm ? Math.max(1, Math.floor(b.len / 16)) : (rng() < 0.6 ? 1 : 0);   // flags: one pole per N m
        for (let k = 0; k < nf; k++) { const a = -hl + (k + 0.5) * b.len / nf; const zP = b.mz.zBack + (perm ? 0.5 : 0.3); S.beam(m, [a, topY - 1, zP], [a, topY + 5.2, zP], 0.09, C(0xd9dde0)); flagAt(P(a, topY + 5.1, zP), yaw + Math.PI / 2, flagR[perm ? (k % 3 === 2 ? 1 : 0) : 1 + Math.floor(rng() * 3)]); }
        if (rng() < (sdr.banners != null ? sdr.banners : 0.55) && b.len > 10) { const r = bannerR[Math.floor(rng() * bannerR.length)]; const bw = 5.5 + rng() * 2, a0 = (rng() - 0.5) * (b.len - bw - 1); const yy = 1.25, zz = -0.09; A.quad(r, P(a0 + bw / 2, yy - 1.05, zz), P(a0 - bw / 2, yy - 1.05, zz), P(a0 - bw / 2, yy, zz), P(a0 + bw / 2, yy, zz)); banners++; }
      }
    }
    Object.assign(out, { standRoofs: roofs, flags, banners });
  };

  // ================================================================ flags (static, rippled, in the sign atlas: no extra draw call)
  St.flagRegions = function (A) {
    return [
      A.region('mzFlagIt', 96, 64, (x2, w, h) => Mz.paintTricolore(x2, w, h)),
      A.region('mzFlagRed', 96, 64, (x2, w, h) => { x2.fillStyle = '#d40000'; x2.fillRect(0, 0, w, h); x2.fillStyle = '#ffd200'; x2.beginPath(); x2.moveTo(w * 0.36, h * 0.2); x2.lineTo(w * 0.64, h * 0.2); x2.lineTo(w * 0.64, h * 0.56); x2.quadraticCurveTo(w * 0.62, h * 0.74, w * 0.5, h * 0.82); x2.quadraticCurveTo(w * 0.38, h * 0.74, w * 0.36, h * 0.56); x2.closePath(); x2.fill(); x2.fillStyle = '#009246'; x2.fillRect(w * 0.36, h * 0.2, w * 0.093, h * 0.06); x2.fillStyle = '#ffffff'; x2.fillRect(w * 0.453, h * 0.2, w * 0.094, h * 0.06); x2.fillStyle = '#ce2b37'; x2.fillRect(w * 0.547, h * 0.2, w * 0.093, h * 0.06); x2.fillStyle = '#111'; x2.fillRect(w * 0.47, h * 0.34, w * 0.06, h * 0.32); }),
      A.region('mzFlagYel', 96, 64, (x2, w, h) => { x2.fillStyle = '#ffd200'; x2.fillRect(0, 0, w, h); x2.fillStyle = '#d40000'; x2.fillRect(0, 0, w, h * 0.16); x2.fillRect(0, h * 0.84, w, h * 0.16); x2.fillStyle = '#111'; x2.font = 'italic 900 22px Arial'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText('FORZA', w / 2, h / 2); }),
      A.region('mzFlagChq', 96, 64, (x2, w, h) => { for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) { x2.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4'; x2.fillRect(i * w / 6, j * h / 4, w / 6 + 1, h / 4 + 1); } }),
    ];
  };
  // a 2.4 x 1.6 m flag hanging from (P0) along yaw, rippled (3 bends), both faces
  St.flag = function (A, r, P0, yaw, wd, ht) {
    wd = wd || 2.4; ht = ht || 1.6; const cx = Math.cos(yaw), sz = -Math.sin(yaw); const nxp = Math.sin(yaw), nzp = Math.cos(yaw);
    const N = 4; for (let k = 0; k < N; k++) {
      const u0 = k / N, u1 = (k + 1) / N; const w0 = Math.sin(u0 * 7.5) * 0.18 * u0, w1 = Math.sin(u1 * 7.5) * 0.18 * u1; const sag0 = u0 * u0 * 0.25, sag1 = u1 * u1 * 0.25;
      const p = (u, w, sg, y) => [P0[0] + cx * u * wd + nxp * w, P0[1] + y - sg, P0[2] + sz * u * wd + nzp * w];
      const a = p(u0, w0, sag0, -ht), b = p(u1, w1, sag1, -ht), c = p(u1, w1, sag1, 0), d = p(u0, w0, sag0, 0);
      A.quad(r, a, b, c, d, u0, u1, 0, 1); A.quad(r, b, a, d, c, u1, u0, 0, 1);
    }
  };

  Mz.Stands = St;
})();
