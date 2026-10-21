// Equation I - Spa-Francorchamps grandstands and spectator banks (SPA-MODELS). Each stand becomes chords along the lap that EI.EnvVenue
// builds (tiers, front wall + boards, crowd); this file chooses where (OSM standRuns of ENVDATA.spa + the runs OSM misses, keyed by TURN
// NUMBER), fits every chord to the slope (the floor steps with the drawn ground, no row below the hillside, skirts down to the ground where
// it falls away) and adds what makes them Spa:
//  * TRIBUNE F1 (Gold 1, opposite the pits): the big flat RED STEEL roof on raked red columns with red diamond braces over grey concrete
//    tiers, a ribbed grey back wall with red X-bracing (grandstand_across_pitlane_red_roof_ing_wall, grandstand_redsteel_frame_access_road);
//  * the Raidillon crest: two long LOW stands with thin flat WHITE roofs on slim posts and blue seats, the white customs chalet with a dark
//    gable roof behind them, a white hospitality marquee on the infield (raidillon_redyellow_kerb_blue_seat_stand_conifers, raidillon_wide_*);
//  * the permanent covered Endurance stand (grey roof language of the Tribune F1, green seats), Silver 1, RX, La Source, Gold 4, the Combes
//    C1-C4, the Bus Stop Gold 6 and the Gold 11 VIP stand (temporary scaffold stands keep the venue's galvanised look);
//  * spectator banks on the steep grass (Kemmel, Pouhon, Blanchimont): standing / sitting fans in the shared instanced crowd, flag poles
//    with Belgian / Dutch / orange flags (blanchimont_hillside_view_forest_flags_crowd, blanchimont_spectator_bank_in_forest_rock_outcrop).
(function () {
  const Sp = EI.EnvSpa; if (!Sp) return;
  const U = EI.U, Env = EI.Env, K = Sp.K, C = Sp.C, Mz = EI.EnvMonza;
  const St = {};
  // OSM standRuns (ENVDATA.spa.standRuns: [s0, s1, side, gap, rows, roof, seat, name, osm]) -> style. A plan entry may split a run (parts),
  // extend it (ext0 / ext1, metres) or override rows / gap.
  const OSM_PLAN = [
    [/^Tribune F1$/, { style: 'redsteel', label: 'TRIBUNE F1', seat: 0x8e9399, rows: 24, gap: 5, ext0: -62, fill: 0.95 }],
    [/Silver 1/, { style: 'temp', label: 'SILVER 1', seat: 0x2b5ba8, rows: 18 }],
    [/Endurance/, { style: 'covered', roofC: 0x9ea3a8, fascia: 0xdfe2e3, label: 'ENDURANCE', seat: 0x2e7d3a, rows: 24, gap: 6 }],
    [/Tribune RX/, { style: 'temp', label: 'RX', seat: 0x3d5f8f, rows: 16, gap: 30, roof: true }],
    [/Raidillon/, { style: 'covered', roofC: 0xdcdfe0, fascia: 0xdcdfe0, label: 'RAIDILLON', seat: 0x1f5bc4, rows: 10, gap: 3, parts: [[0, 0.46], [0.56, 1]], low: true }],
  ];
  // runs OSM does not map: anchor = turn number (or 'line'), ds0 / ds1 metres from its turn-in, side 'out' / 'in' / +1 / -1
  const EXTRA = [
    { anchor: 1, ds0: 14, ds1: 62, side: 1, gap: 6, rows: 18, style: 'temp', roof: true, seat: 0x2356a6, label: 'GOLD 7' },        // the three OSM La Source stands, one curved run
    { anchor: 'line', ds0: 30, ds1: 118, side: 1, gap: 5, rows: 12, style: 'temp', seat: 0x1f4fa8, label: 'GOLD 9' },
    { anchor: 3, ds0: 30, ds1: 82, side: 1, gap: 4, rows: 12, style: 'temp', roof: true, seat: 0x1f5bc4, label: 'GOLD 4' },
    { anchor: 5, ds0: -150, ds1: -96, side: 1, gap: 5, rows: 12, style: 'temp', seat: 0x2356a6, label: 'COMBES C1' },
    { anchor: 5, ds0: -86, ds1: -26, side: 1, gap: 5, rows: 14, style: 'covered', roofC: 0xa9aeb2, fascia: 0xe9ebec, seat: 0x8c1d24, label: 'COMBES C2' },
    { anchor: 5, ds0: -16, ds1: 36, side: 1, gap: 5, rows: 14, style: 'covered', roofC: 0xa9aeb2, fascia: 0xe9ebec, seat: 0x2356a6, label: 'COMBES C3' },
    { anchor: 7, ds0: 40, ds1: 100, side: 1, gap: 5, rows: 10, style: 'temp', seat: 0x3d5f8f, label: 'COMBES C4' },
    { anchor: 18, ds0: -95, ds1: 15, side: 1, gap: 5, rows: 12, style: 'temp', seat: 0x1f4fa8, label: 'GOLD 6' },
    { anchor: 19, ds0: 60, ds1: 118, side: 1, gap: 5, rows: 8, style: 'covered', roofC: 0xdcdfe0, fascia: 0xdcdfe0, seat: 0x1b1d22, label: 'GOLD 11', vip: true },
  ];
  // spectator banks: [anchor, ds0, ds1, side, depth (m of bank), fill]
  const BANKS = [
    { anchor: 4, ds0: 200, ds1: 330, side: 1, depth: 18, fill: 0.5, label: 'Kemmel' },
    { anchor: 10, ds0: -90, ds1: 110, side: 1, depth: 22, fill: 0.55, label: 'Pouhon' },
    { anchor: 16, ds0: -120, ds1: 140, side: 1, depth: 26, fill: 0.6, label: 'Blanchimont' },
    { anchor: 2, ds0: -120, ds1: -40, side: 1, depth: 16, fill: 0.5, label: 'Eau Rouge' },
  ];
  const PERM = { redsteel: 1, covered: 1 };
  const RISE = 0.42, TREAD = 0.82, Y0 = 1.4, Z0 = 0.4;

  // ================================================================ layout (inside EnvVenue.layoutStands: the venue builds tiers + crowd)
  St.layout = function (E) {
    const t = E.t, L = t.length; E.spRuns = []; E.spOwnPolys = E.spOwnPolys || []; E.standPolys = E.standPolys || [];
    const sideOf = (sd, s0, s1) => { if (sd === 'out' || sd === 'in') { const o = Sp.outside(t, (s0 + s1) / 2); return sd === 'out' ? o : -o; } return sd; };
    for (const r of E.spStandRuns || E.data.standRuns || []) {
      const [s0, s1, side, gap, rows, roof, seat, name] = r; let plan = null; for (const [re, p] of OSM_PLAN) if (re.test(name || '')) { plan = p; break; } if (!plan) continue;
      const a = s0 + (plan.ext0 || 0), b = s1 + (plan.ext1 || 0); const parts = plan.parts || [[0, 1]];
      for (const [f0, f1] of parts) St.run(E, Object.assign({ gap, rows, seat, roof: !!roof }, plan, { name, s0: a + (b - a) * f0, s1: a + (b - a) * f1, side }));
    }
    for (const x of EXTRA) { const c = Sp.cs(t, x.anchor); const s0 = c + x.ds0, s1 = c + x.ds1; St.run(E, Object.assign({}, x, { name: x.label, s0, s1, side: sideOf(x.side, s0, s1) })); }
    St.layoutExtras(E);
    St.layoutBanks(E);
    E.stats.spaStands = { runs: E.spRuns.length, blocks: E.spRuns.reduce((n, r) => n + r.blocks.length, 0), bankPeople: (E.spBankRecs || []).length };
  };
  // one run -> chords; each chord is shorter where the lap curves or climbs (the floor is level within a chord: <= ~1 m of fall along it)
  St.run = function (E, R) {
    const t = E.t, OCC = Env.OCC, sc = E.sc; const kk = t.smooth(t.k, 10); const side = R.side;
    const run = { R, blocks: [] }; let s = R.s0, k = 0; const rows = R.rows || 12; const zBack = Z0 + rows * TREAD, depth = zBack + 0.8;
    while (s < R.s1 - 5) {
      const i0 = t.idxAtS(s); const Rr = 1 / (Math.abs(kk[i0]) + 1e-5);
      const grade = Math.abs(t.y[t.idxAtS(s + 10)] - t.y[i0]) / 10; let step = U.clamp(Math.min(Rr * 0.24, 1.0 / Math.max(grade, 0.01)), 8, 34); let sb = Math.min(R.s1, s + step); if (R.s1 - sb < 6) sb = R.s1;
      let wmax = 0; for (let q = s; q <= sb + 0.01; q += 2) wmax = Math.max(wmax, E.wallCap(t.idxAtS(q), side));
      const d = wmax + (R.gap != null ? R.gap : 4);
      const inner = (kk[i0] > 0) === (side > 0); if (inner && d > Rr * 0.8) { s = sb; continue; }
      const A = Sp.at(t, s, side, d), Bq = Sp.at(t, sb, side, d);
      let ax = Bq.x - A.x, az = Bq.z - A.z; const len = Math.hypot(ax, az); if (!(len >= 5)) { s = sb; continue; } ax /= len; az /= len;
      const im = t.idxAtS((s + sb) / 2); let nx = -az, nz = ax; if (nx * t.nx[im] * side + nz * t.nz[im] * side < 0) { nx = -nx; nz = -nz; }
      const cx = (A.x + Bq.x) / 2, cz = (A.z + Bq.z) / 2, hl = len / 2 - 0.15;
      // clear of the barriers (front) and of the other legs (back), free ground (no water / road / building)
      const W = (x, z) => [cx + ax * x + nx * z, cz + az * x + nz * z];
      const why = (k2) => { const D = E.stats.spaWhy = E.stats.spaWhy || {}; D[R.label + ':' + k2] = (D[R.label + ':' + k2] || 0) + 1; };
      if ([W(-hl, 0), W(hl, 0)].some(P => E.fsAt(P[0], P[1]) < 1) || [W(-hl, depth), W(hl, depth), W(0, depth)].some(P => E.dcAt(P[0], P[1]) < t.halfWidth + t.kerbWidth + 4)) { why('clear'); s = sb; k++; continue; }
      if (E.rectFree(cx + nx * depth / 2, cz + nz * depth / 2, ax, az, hl, depth / 2, OCC.BUILT | OCC.WATER) < 0.85) { why('occ' + E.rectFree(cx + nx * depth / 2, cz + nz * depth / 2, ax, az, hl, depth / 2, OCC.BUILT).toFixed(1)); s = sb; k++; continue; }
      // the floor level: the front no more than 0.5 m into the ground at its high end, every row >= 0.3 m clear of a rising hillside
      const blk = { cx, cz, ax, az, nx, nz, len: hl * 2, rows, roof: !PERM[R.style] && !!R.roof, seat: R.seat, y: 0, s: (s + sb) / 2, first: false, last: false, name: R.label || R.name, sp: { R, run, k } };
      St.fitY(E, blk);
      if (R.fill != null) blk.fill = R.fill;
      if (!PERM[R.style]) { blk.first = !run.blocks.length; blk.last = sb >= R.s1 - 0.01; }
      E.blocks.push(blk); run.blocks.push(blk);
      const poly = E.markRect(cx + nx * depth / 2, cz + nz * depth / 2, ax, az, hl + 0.4, depth / 2 + 0.4, OCC.BUILT); E.standPolys.push(poly); E.spOwnPolys.push(poly);
      k++; s = sb;
    }
    if (run.blocks.length) { if (!PERM[R.style]) run.blocks[run.blocks.length - 1].last = true; E.spRuns.push(run); }
    return run;
  };
  // the floor level of a chord: the front no more than 0.5 m into the ground at its high end, every row >= 0.3 m clear of a rising hillside.
  // Called at layout and again just before the venue builds (St.refit): the drawn ground (sc.height) is final only after the terrain / verge.
  St.fitY = function (E, b) {
    const sc = E.sc, hl = b.len / 2, zBack = Z0 + b.rows * TREAD; let gF = -Infinity, need = -Infinity;
    for (const x of [-hl, 0, hl]) for (const z of [0, zBack * 0.33, zBack * 0.66, zBack]) { const g = sc.height(b.cx + b.ax * x + b.nx * z, b.cz + b.az * x + b.nz * z); if (z === 0) gF = Math.max(gF, g); need = Math.max(need, g + 0.3 - (Y0 + z / TREAD * RISE)); }
    b.y = Math.max(gF - 0.5, need);
  };
  St.refit = function (E) {
    const sc = E.sc;
    for (const run of E.spRuns || []) for (const b of run.blocks) St.fitY(E, b);
    const off = E.spBankOff || []; (E.spBankRecs || []).forEach((r, k) => { r[0][1] = sc.height(r[0][0], r[0][2]) - (off[k] || 0); });
    for (const f of E.spBankFlags || []) f[1] = sc.height(f[0], f[2]);
    const c = E.spChalet; if (c && c.poly) { let g = Infinity; for (const p of c.poly) g = Math.min(g, sc.height(p[0], p[1])); c.y = g; }
    for (const T of E.spTents || []) { let gmin = Infinity, gmax = -Infinity; for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) { const g = sc.height(T.cx + T.ax * u * T.L / 2 - T.az * v * T.D / 2, T.cz + T.az * u * T.L / 2 + T.ax * v * T.D / 2); gmin = Math.min(gmin, g); gmax = Math.max(gmax, g); } T.y = gmin; T.gmax = gmax; }
  };
  // the chalet (OSM 'Ancienne douane', the old customs house at the Raidillon) and the white marquee on the Raidillon infield
  St.layoutExtras = function (E) {
    const t = E.t, OCC = Env.OCC, sc = E.sc; E.spChalet = null; E.spMarquee = null;
    const b = (t.data.scenery.buildings || []).find(q => q.n === 'Ancienne douane');
    if (b && b.p && b.p.length >= 3) { let x = 0, z = 0; for (const p of b.p) { x += p[0]; z += p[1]; } x /= b.p.length; z /= b.p.length;
      // principal axis of the footprint
      let bl = 0, ax = 1, az = 0; for (let i = 0; i < b.p.length; i++) { const p = b.p[i], q = b.p[(i + 1) % b.p.length]; const l = Math.hypot(q[0] - p[0], q[1] - p[1]); if (l > bl) { bl = l; ax = (q[0] - p[0]) / l; az = (q[1] - p[1]) / l; } }
      let hl = 0, hd = 0; for (const p of b.p) { hl = Math.max(hl, Math.abs((p[0] - x) * ax + (p[1] - z) * az)); hd = Math.max(hd, Math.abs(-(p[0] - x) * az + (p[1] - z) * ax)); }
      let gmin = Infinity; for (const p of b.p) gmin = Math.min(gmin, sc.height(p[0], p[1]));
      E.spChalet = { cx: x, cz: z, ax, az, hl: Math.max(5, hl), hd: Math.max(4, hd), y: gmin, poly: b.p }; E.spOwnPolys.push(b.p); }
    // marquee 12 x 25 m: the flattest free spot on the Raidillon infield beside the kerb (the inside of T3)
    const s3 = Sp.cs(t, 3), side = -Sp.outside(t, s3 + 20); let best = null;
    for (let s = s3 - 40; s <= s3 + 160; s += 10) for (const off of [6, 12, 20, 30, 42]) {
      const i = t.idxAtS(s); const p = Sp.at(t, s, side, E.wallCap(i, side) + off + 6); const hl = 12.5, hd = 6;
      if (E.fsAt(p.x, p.z) < 4 || E.rectFree(p.x, p.z, p.tx, p.tz, hl + 2, hd + 2, OCC.BUILT | OCC.WATER) < 0.9) { E.stats.spaMq = (E.stats.spaMq || 0) + 1; continue; }
      let gmin = Infinity, gmax = -Infinity; for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) { const g = sc.height(p.x + p.tx * u * hl + p.nx * v * hd, p.z + p.tz * u * hl + p.nz * v * hd); gmin = Math.min(gmin, g); gmax = Math.max(gmax, g); }
      const sc2 = gmax - gmin + off * 0.02; if (!best || sc2 < best.score) best = { score: sc2, cx: p.x, cz: p.z, ax: p.tx, az: p.tz, L: 25, D: 12, y: gmin, gmax };
    }
    if (best && best.gmax - best.y < 3.2) { const tp = E.markRect(best.cx, best.cz, best.ax, best.az, best.L / 2 + 2, best.D / 2 + 2, OCC.BUILT); E.standPolys.push(tp); E.spOwnPolys.push(tp); (E.spTents = E.spTents || []).push(best); E.spMarquee = best; }
  };
  // spectator banks: people standing / sitting on the drawn ground behind the fence, facing the track; trees kept off (OCC.KEEP)
  St.layoutBanks = function (E) {
    const t = E.t, OCC = Env.OCC, sc = E.sc; const rng = U.rng(4711); const recs = E.spBankRecs = []; const offs = E.spBankOff = []; E.spBankFlags = [];
    const shirts = ['#d8d8d4', '#1a1a1a', '#2a2b2e', '#3b404a', '#6c717a', '#1b2a4a', '#2a4a78', '#7d8ea4', '#8a1c22', '#3c5a3a', '#b39a4a', '#f2f2f2', '#c9b28a'].map(h => { const c = C(h); return [c.r, c.g, c.b]; });
    const STAND = [10, 11, 12, 13, 14, 15], SIT = [0, 1, 2, 3, 4, 8];
    for (const Bk of BANKS) {
      const c = Sp.cs(t, Bk.anchor); const side = Bk.side; let n0 = recs.length;
      for (let s = c + Bk.ds0; s < c + Bk.ds1; s += 1.25) {
        const i = t.idxAtS(s); const w = E.wallCap(i, side); const ty = t.y[i];
        for (let d = w + 4.5 + rng() * 0.6; d < w + 4.5 + Bk.depth; d += 1.3 + rng() * 0.4) {
          const p = Sp.at(t, s + (rng() - 0.5) * 0.8, side, d); if (E.fsAt(p.x, p.z) < 3 || (E.occAt(p.x, p.z) & (OCC.BUILT | OCC.ROAD | OCC.WATER))) continue;
          const g = sc.height(p.x, p.z); if (g < ty - 1.5) continue;   // not down in a ditch below the road
          const g2 = sc.height(p.x + p.nx * 1.5, p.z + p.nz * 1.5); if (Math.abs(g2 - g) > 1.6) continue;   // too steep to stand
          const dens = Bk.fill * (0.55 + 0.9 * U.noise2(p.x / 9 + 11, p.z / 9 - 3)); if (rng() > dens) continue;
          const sit = rng() < 0.3; const pose = sit ? SIT[Math.floor(rng() * SIT.length)] : STAND[Math.floor(rng() * STAND.length)];
          const sh = shirts[Math.floor(rng() * shirts.length)], ac = shirts[Math.floor(rng() * shirts.length)]; const yaw = Math.atan2(-p.nx, -p.nz) + (rng() - 0.5) * 0.6;
          // seated poses are drawn for a seat 0.45 m high: on the grass they sit lower
          offs.push(sit ? 0.42 : 0.02); recs.push([[p.x, g - (sit ? 0.42 : 0.02), p.z, yaw], [pose, 0.92 + rng() * 0.14, rng(), pose >= 11 && rng() < 0.4 ? 2 : 0], [sh[0], sh[1], sh[2], 0.999], [ac[0], ac[1], ac[2], 0]]);
        }
        // a flag pole every ~22 m along the bank
        if (rng() < 1.25 / 22) { const p = Sp.at(t, s, side, w + 4.5 + Bk.depth * (0.3 + rng() * 0.6)); if (E.fsAt(p.x, p.z) > 3 && !(E.occAt(p.x, p.z) & (OCC.BUILT | OCC.ROAD))) E.spBankFlags.push([p.x, sc.height(p.x, p.z), p.z, Math.atan2(p.tx, p.tz), Math.floor(rng() * 3)]); }
      }
      // keep the bank clear of trees (a ribbon over the occupied stretch)
      const line = []; for (let s = c + Bk.ds0; s <= c + Bk.ds1; s += 6) { const i = t.idxAtS(s); const p = Sp.at(t, s, side, E.wallCap(i, side) + 4.5 + Bk.depth / 2); line.push([p.x, p.z]); }
      if (recs.length > n0 && line.length > 1) E.markLine(line, Bk.depth / 2 + 3, OCC.KEEP);
    }
  };

  // ================================================================ dressing
  St.flip = (b) => (-b.az * b.nx + b.ax * b.nz) < 0;
  St.build = function (E, BK, out) {
    const { B, S, G, F: Fd, H, A } = BK; const t = E.t, sc = E.sc; const rng = U.rng(1938);
    const conc = C(0xb9bbb7), concD = C(0x9a9ea2), skirtT = C(0x3b403d), red = C(0xb02a2f), redD = C(0x8e1f25), rib = [C(0xb7bbbe), C(0x8a8f94)], steel = C(0x9aa1a8), dark = C(0x2a2d33);
    const tiles = []; for (let k = 0; k < 8; k++) tiles.push(A.region('spTile' + k, 320, 64, (x2, w, h) => Mz.paintAd(x2, w, h, k, 5)));
    let roofs = 0, skirts = 0;
    for (const run of E.spRuns) {
      const R = run.R; const perm = !!PERM[R.style];
      for (const b of run.blocks) {
        const m = Env.frame(b.cx, b.y, b.cz, b.ax, b.az, b.nx, b.nz); const P = (x, y, z) => Env.xf(m, x, y, z); const hl = b.len / 2;
        const yTop = Y0 + b.rows * RISE, zBack = Z0 + b.rows * TREAD; b.sp.yTop = yTop; b.sp.zBack = zBack; b.sp.m = m;
        const gl = (x, z) => { const p = P(x, 0, z); return sc.height(p[0], p[2]) - b.y; };   // drawn ground in block-local height
        const fwd = (() => { const o = P(0, 0, 0), f = P(0, 0, -1); return [f[0] - o[0], 0, f[2] - o[2]]; })(), bwd = [-fwd[0], 0, -fwd[2]];
        const xs = [-hl - 0.1, -hl / 2, 0, hl / 2, hl + 0.1];
        // ---- skirts where the ground falls below the floor: front, back, both ends (concrete on permanent stands, dark fabric on scaffold)
        const sk = perm ? concD : skirtT;
        for (let k = 0; k + 1 < xs.length; k++) { const ga = gl(xs[k], 0.05), gb = gl(xs[k + 1], 0.05); if (Math.min(ga, gb) < -0.05) { Sp.face(B, P(xs[k], Math.min(0, ga - 0.3), -0.02), P(xs[k + 1], Math.min(0, gb - 0.3), -0.02), P(xs[k + 1], 0.02, -0.02), P(xs[k], 0.02, -0.02), sk, fwd); skirts++; } }
        for (let k = 0; k + 1 < xs.length; k++) { const ga = gl(xs[k], zBack), gb = gl(xs[k + 1], zBack); if (Math.min(ga, gb) < -0.05) { Sp.face(B, P(xs[k], Math.min(0, ga - 0.3), zBack + 0.16), P(xs[k + 1], Math.min(0, gb - 0.3), zBack + 0.16), P(xs[k + 1], 0.02, zBack + 0.16), P(xs[k], 0.02, zBack + 0.16), sk, bwd); skirts++; } }
        for (const sx of [-hl - 0.08, hl + 0.08]) { const zz = [0, zBack / 2, zBack + 0.16]; const want = (() => { const o = P(0, 0, 0), q = P(Math.sign(sx), 0, 0); return [q[0] - o[0], 0, q[2] - o[2]]; })();
          for (let k = 0; k + 1 < zz.length; k++) { const ga = gl(sx, zz[k]), gb = gl(sx, zz[k + 1]); if (Math.min(ga, gb) < -0.05) Sp.face(B, P(sx, Math.min(0, ga - 0.3), zz[k]), P(sx, Math.min(0, gb - 0.3), zz[k + 1]), P(sx, 0.02, zz[k + 1]), P(sx, 0.02, zz[k]), sk, want); } }
        if (!perm) continue;
        // ---- permanent stands: back wall from the drawn ground (ribbed grey on the red-steel stand, concrete elsewhere), end walls, stair doors
        const gB = Math.min(gl(-hl, zBack), gl(0, zBack), gl(hl, zBack), 0) - 0.4, yW = yTop + 1.25;
        if (R.style === 'redsteel') { let k = 0; for (let y = gB; y < yW - 0.01; y += 1.0, k++) Sp.face(B, P(-hl - 0.1, y, zBack + 0.14), P(hl + 0.1, y, zBack + 0.14), P(hl + 0.1, Math.min(yW, y + 1.0), zBack + 0.14), P(-hl - 0.1, Math.min(yW, y + 1.0), zBack + 0.14), rib[k % 2], bwd);
          // red X-bracing on the back
          for (let a = -hl; a < hl - 2; a += 8) { const a2 = Math.min(hl, a + 8); S.beam(m, [a, Math.max(gB, 0) + 0.3, zBack + 0.32], [a2, yW - 0.3, zBack + 0.32], 0.2, red); S.beam(m, [a2, Math.max(gB, 0) + 0.3, zBack + 0.32], [a, yW - 0.3, zBack + 0.32], 0.2, red); } }
        else { Sp.face(B, P(-hl - 0.1, gB, zBack + 0.14), P(hl + 0.1, gB, zBack + 0.14), P(hl + 0.1, yW, zBack + 0.14), P(-hl - 0.1, yW, zBack + 0.14), conc, bwd);
          { const yw = Math.max(1.2, yTop * 0.5); Sp.face(B, P(-hl, yw, zBack + 0.17), P(hl, yw, zBack + 0.17), P(hl, yw + 0.9, zBack + 0.17), P(-hl, yw + 0.9, zBack + 0.17), C(0x3a4148), bwd); }
          for (let a = -hl + 2.5; a < hl - 1; a += 5) B.box(m, 0.45, yW - gB, 0.35, a, gB, zBack + 0.34, concD); }
        for (let a = -hl + 7; a < hl - 4; a += 14) B.box(m, 1.8, 2.3, 0.06, a, Math.max(0, gl(a, zBack)), zBack + 0.18, dark);
        const first = b === run.blocks[0], last = b === run.blocks[run.blocks.length - 1]; const fs = St.flip(b) ? -1 : 1;
        for (const [flag, sx] of [[first, -fs * (hl + 0.1)], [last, fs * (hl + 0.1)]]) if (flag) { const g0 = Math.min(gl(sx, 0), gl(sx, zBack), 0) - 0.3; const want = (() => { const o = P(0, 0, 0), q = P(Math.sign(sx), 0, 0); return [q[0] - o[0], 0, q[2] - o[2]]; })();
          Sp.face(B, P(sx, g0, -0.08), P(sx, g0, zBack + 0.14), P(sx, yW, zBack + 0.14), P(sx, Y0 + 0.2, -0.08), R.style === 'redsteel' ? rib[1] : concD, want); }
      }
      // wedges between consecutive chords of a curved / stepped permanent run (close the gap in the backs and treads)
      for (let k = 0; k + 1 < run.blocks.length && perm; k++) {
        const a = run.blocks[k], b = run.blocks[k + 1]; const fa = St.flip(a) ? -1 : 1, fb = St.flip(b) ? -1 : 1;
        const pa = (y, z) => Env.xf(a.sp.m, fa * (a.len / 2 + 0.1), y, z), pb = (y, z) => Env.xf(b.sp.m, -fb * (b.len / 2 + 0.1), y, z);
        const zB = a.sp.zBack, yT = a.sp.yTop; K.dq(B, pa(Y0, Z0), pb(Y0, Z0), pb(yT, zB), pa(yT, zB), C(a.seat).multiplyScalar(0.8)); K.dq(B, pa(0, zB + 0.14), pb(0, zB + 0.14), pb(yT + 1.25, zB + 0.14), pa(yT + 1.25, zB + 0.14), R.style === 'redsteel' ? rib[0] : conc);
      }
      // ---- roofs
      if (R.style === 'redsteel') { for (const b of run.blocks) { St.redRoof(E, BK, b); roofs++; } }
      else if (R.style === 'covered') { for (const b of run.blocks) { St.flatRoof(E, BK, b, R, tiles, rng); roofs++; } }
    }
    St.buildChalet(E, BK); St.buildBankFlags(E, BK);
    Object.assign(out, { standRoofs: roofs, standSkirts: skirts });
  };
  // the Tribune F1 roof: flat red steel roof (red soffit, thin red fascia, grey top) cantilevered from raked red columns at the front and
  // straight columns behind the back wall, a red diamond of braces at the head of each front column; lamp row under the fascia
  St.redRoof = function (E, BK, b) {
    const { B, S, F: Fd, H } = BK; const m = b.sp.m, hl = b.len / 2; const P = (x, y, z) => Env.xf(m, x, y, z); const sc = E.sc;
    const red = C(0xb02a2f), redD = C(0x8e1f25), top = C(0x8f9397);
    const yR = b.sp.yTop + 4.2, zF = -2.6, zR = b.sp.zBack + 1.2; const gl = (x, z) => { const p = P(x, 0, z); return sc.height(p[0], p[2]) - b.y; };
    B.box(m, b.len + 0.12, 0.45, zR - zF, 0, yR, (zF + zR) / 2, redD, { top, bottom: true });
    Sp.face(B, P(-hl - 0.06, yR - 0.35, zF - 0.02), P(hl + 0.06, yR - 0.35, zF - 0.02), P(hl + 0.06, yR + 0.5, zF - 0.02), P(-hl - 0.06, yR + 0.5, zF - 0.02), red, (() => { const o = P(0, 0, 0), f = P(0, 0, -1); return [f[0] - o[0], 0, f[2] - o[2]]; })());
    // columns: raked front columns from the foot of the front wall up to the roof edge, back columns behind the wall, diamond braces
    const n = Math.max(1, Math.round(b.len / 10)); for (let k = 0; k <= n; k++) {
      const a = -hl + 0.4 + k * (b.len - 0.8) / n; const g0 = Math.min(0, gl(a, -1.2));
      S.beam(m, [a, g0 - 0.2, -1.2], [a, yR - 0.1, zF + 1.0], 0.34, red);
      const gb = Math.min(0, gl(a, b.sp.zBack + 0.9)); S.beam(m, [a, gb - 0.2, b.sp.zBack + 0.9], [a, yR, b.sp.zBack + 0.9], 0.38, red);
      const yd = yR - 2.6, zd = zF + 1.0; S.beam(m, [a, yd, zd + 0.1], [a, yR - 0.1, zd + 2.2], 0.16, red); S.beam(m, [a, yd, zd + 0.1], [a, yR - 0.1, zd - 1.8], 0.16, red);
      // roof girder over each column (front to back), under the soffit
      S.beam(m, [a, yR - 0.35, zF + 0.3], [a, yR - 0.35, zR - 0.3], 0.3, redD);
    }
    for (let a = -hl + 3; a < hl - 1; a += 6) Fd.box(m, 0.5, 0.12, 0.3, a, yR - 0.14, zF + 1.4, C(0xfff4dc));
  };
  // flat thin roof on slim posts (the Raidillon whites, the grey Endurance / Combes roofs): roof slab, fascia with partner tiles, back
  // columns behind the wall, slim front posts every ~12 m (the photos show them at the front of the low Raidillon stands)
  St.flatRoof = function (E, BK, b, R, tiles, rng) {
    const { B, S, F: Fd, A } = BK; const m = b.sp.m, hl = b.len / 2; const P = (x, y, z) => Env.xf(m, x, y, z); const sc = E.sc;
    const roofC = C(R.roofC || 0xdcdfe0), fasc = C(R.fascia || 0xdcdfe0), soffit = R.low ? C(0xd9dbdc) : C(0x5a5c5e), postC = R.low ? C(0xe9ebec) : C(0x8d939a);
    const yR = b.sp.yTop + (R.low ? 2.7 : 3.2), zF = R.low ? -0.8 : -1.6, zR = b.sp.zBack + 0.6; const gl = (x, z) => { const p = P(x, 0, z); return sc.height(p[0], p[2]) - b.y; };
    B.box(m, b.len + 0.1, 0.28, zR - zF, 0, yR, (zF + zR) / 2, soffit, { top: roofC, bottom: true });
    const fw = (() => { const o = P(0, 0, 0), f = P(0, 0, -1); return [f[0] - o[0], 0, f[2] - o[2]]; })();
    Sp.face(B, P(-hl - 0.05, yR - 0.62, zF - 0.02), P(hl + 0.05, yR - 0.62, zF - 0.02), P(hl + 0.05, yR + 0.3, zF - 0.02), P(-hl - 0.05, yR + 0.3, zF - 0.02), fasc, fw);
    if (!R.low) { const th = 0.6, tw = th * 5; const nt = Math.floor((b.len - 1) / (tw + 1.5)); const x0 = -(nt * (tw + 1.5) - 1.5) / 2;
      for (let k = 0; k < nt; k++) { const xa = x0 + k * (tw + 1.5); const r = tiles[Math.floor(rng() * 8)]; Sp.faceA(A, r, P(xa + tw, yR - 0.55, zF - 0.06), P(xa, yR - 0.55, zF - 0.06), P(xa, yR + 0.05, zF - 0.06), P(xa + tw, yR + 0.05, zF - 0.06), fw); } }
    for (let a = -hl + 1.2; a <= hl - 1.1; a += Math.max(6, b.len / Math.max(1, Math.round(b.len / 8)))) { const g0 = Math.min(0, gl(a, b.sp.zBack + 0.35)); S.box(m, 0.26, yR - g0 + 0.2, 0.26, a, g0 - 0.2, b.sp.zBack + 0.35, postC); }
    for (let a = -hl + 4; a <= hl - 3; a += 12) S.beam(m, [a, Y0, 0.3], [a, yR, 0.3], 0.12, postC);
    Fd.beam(m, [-hl, yR - 0.12, zF + 1.0], [hl, yR - 0.12, zF + 1.0], 0.1, C(0x70757b));
    // the VIP stand (Gold 11): a glazed hospitality box behind the top row
    if (R.vip) { const g0 = Math.min(0, gl(0, b.sp.zBack + 3)); B.box(m, b.len - 1, yR - g0 - 0.3, 4.6, 0, g0 - 0.2, b.sp.zBack + 2.9, C(0xeef0f0)); Sp.face(BK.G, P(-hl + 1, b.sp.yTop - 0.5, b.sp.zBack + 0.55), P(hl - 1, b.sp.yTop - 0.5, b.sp.zBack + 0.55), P(hl - 1, yR - 0.4, b.sp.zBack + 0.55), P(-hl + 1, yR - 0.4, b.sp.zBack + 0.55), C(0x2e4152), fw); }
  };
  // the old customs house at the Raidillon (white render, dark slate gable roof, chimney) - raidillon_redyellow_kerb_blue_seat_stand_conifers
  St.buildChalet = function (E, BK) {
    const c = E.spChalet; if (!c) return; const { B } = BK; const m = Env.frame(c.cx, c.y, c.cz, c.ax, c.az, -c.az, c.ax); const P = (x, y, z) => Env.xf(m, x, y, z);
    const hl = c.hl, hd = c.hd, wh = 6.2 + 0.5, rh = wh + hd * 0.75; const white = C(0xf0eee8), slate = C(0x3a3d42), slateD = C(0x2c2e33);
    let gmax = -Infinity; for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p = P(u * hl, 0, v * hd); gmax = Math.max(gmax, E.sc.height(p[0], p[2]) - c.y); }
    const w0 = wh + gmax;
    B.box(m, hl * 2, w0 + 0.3, hd * 2, 0, -0.3, 0, white);
    for (const sz of [-1, 1]) Sp.face(B, P(-hl - 0.4, w0, sz * (hd + 0.5)), P(hl + 0.4, w0, sz * (hd + 0.5)), P(hl + 0.4, w0 + hd * 0.75, 0), P(-hl - 0.4, w0 + hd * 0.75, 0), sz > 0 ? slate : slateD, [0, 1, 0]);
    for (const sx of [-1, 1]) { const o = P(0, 0, 0), q = P(sx, 0, 0); Sp.face(B, P(sx * hl, w0, -hd), P(sx * hl, w0, hd), P(sx * hl, w0 + hd * 0.75, 0), P(sx * hl, w0 + hd * 0.75, 0), white, [q[0] - o[0], 0, q[2] - o[2]]); }
    // windows: dark rectangles on the long walls, two rows
    for (const sz of [-1, 1]) { const o = P(0, 0, 0), q = P(0, 0, sz); const want = [q[0] - o[0], 0, q[2] - o[2]]; for (let x = -hl + 1.5; x < hl - 1; x += 2.6) for (const y of [gmax + 1.0, gmax + 3.8]) Sp.face(B, P(x, y, sz * (hd + 0.02)), P(x + 1.1, y, sz * (hd + 0.02)), P(x + 1.1, y + 1.5, sz * (hd + 0.02)), P(x, y + 1.5, sz * (hd + 0.02)), C(0x2a3036), want); }
    B.box(m, 0.8, 2.2, 0.8, hl * 0.4, w0 + hd * 0.3, 0, C(0x8c8a84));
    E.stats.spa.chalet = 1;
  };
  // flag poles on the banks (Belgian, Dutch, orange), static rippled flags in the sign atlas
  St.buildBankFlags = function (E, BK) {
    const L = E.spBankFlags || []; if (!L.length || !Mz.Stands || !Mz.Stands.flag) return; const { F: Fd, A } = BK; const I = Env.frame(0, 0, 0, 1, 0, 0, 1);
    const R = [A.region('spFlagBE', 96, 64, Sp.paintFlagBE), A.region('spFlagNL', 96, 64, Sp.paintFlagNL), A.region('spFlagOr', 96, 64, Sp.paintFlagOrange)];
    const pole = A.region('spPole', 8, 8, (x2, w, h) => { x2.fillStyle = '#c9cdd1'; x2.fillRect(0, 0, w, h); });
    // the pole is drawn in the atlas mesh too (two crossed strips), so flag + pole are one assembly standing on the ground
    for (const [x, y, z, yaw, k] of L) { for (const [dx, dz] of [[0.045, 0], [0, 0.045]]) { const a = [x - dx, y - 0.3, z - dz], b = [x + dx, y - 0.3, z + dz], c = [x + dx, y + 5.2, z + dz], d = [x - dx, y + 5.2, z - dz]; A.quad(pole, a, b, c, d); A.quad(pole, b, a, d, c); } Mz.Stands.flag(A, R[k], [x, y + 5.15, z], yaw, 2.2, 1.45); }
    E.stats.spa.bankFlags = L.length;
  };

  Sp.Stands = St;
})();
