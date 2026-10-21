// Equation I - Circuit of the Americas grandstands, amphitheatre seating and spectator banks (COTA-MODELS). Each stand becomes chords that
// EI.EnvVenue builds (tiers, front wall + boards, crowd); this file chooses where - the OSM grandstand footprints (scenery.grandstands, keyed
// by their centroid x/z) and the runs OSM does not map (keyed by TURN NUMBER) - fits every chord to the slope (the floor steps with the drawn
// ground, no row below the hillside, skirts down to the ground where it falls away; re-fitted after the terrain is built) and adds what
// makes them COTA:
//  * the MAIN GRANDSTAND opposite the pits: ~310 m of lower tier, and over the middle 150 m the three-level stand - the glazed club level,
//    the upper tier, the suites, a ~23 m high back wall - under the white TENSILE FABRIC canopy (8 swept bays on raked masts with stays);
//  * the TURN 1 stand raked into the hill above Big Red, the Turn 15 and Turn 19 permanent stands (concrete backs, end walls), the uncovered
//    scaffold stands at T12, T13, T15 and T18, the two Bold Stadium stands facing their pitch;
//  * the Germania Insurance Amphitheater: curved concrete tiers in front of the stage at the Tower's foot (polar tiers, own geometry);
//  * spectator banks on the GA hills (Turn 1 climb, the Esses, T9, the T11 field, T19): people in the shared instanced crowd, flag poles.
(function () {
  const Ct = EI.EnvCota; if (!Ct) return;
  const U = EI.U, Env = EI.Env, K = Ct.K, C = Ct.C, Mz = EI.EnvMonza;
  const St = {};
  const RISE = 0.42, TREAD = 0.82, Y0 = 1.4, Z0 = 0.4;
  const PERM = { main: 1, perm: 1 };
  // OSM grandstand footprints by centroid (x, z) within 30 m -> style. Faces the track unless `face` names a landmark (Bold Stadium pitch).
  const POLY_PLAN = [
    { at: [-302, 604], style: 'perm', label: 'TURN 1', seat: 0x24508f, maxRows: 30 },
    { at: [-161, -348], style: 'temp', label: 'TURN 12', seat: 0x2356a6, maxRows: 24 },
    { at: [-366, -326], style: 'temp', label: 'TURN 12', seat: 0x3d5f8f, maxRows: 20 },
    { at: [-422, -215], style: 'temp', label: 'TURN 15', seat: 0x2356a6, maxRows: 24 },
    { at: [-372, -98], style: 'perm', label: 'TURN 15', seat: 0x24508f, maxRows: 26 },
    { at: [-757, -148], style: 'perm', label: 'TURN 19', seat: 0x8c2a2f, maxRows: 24 },
    { at: [-536, -166], style: 'temp', label: 'BOLD STADIUM', seat: 0x3a4048, face: 'boldStadium', fill: 0.22, maxRows: 16 },
    { at: [-477, -87], style: 'temp', label: 'BOLD STADIUM', seat: 0x3a4048, face: 'boldStadium', fill: 0.22, maxRows: 6 },
  ];
  // the Main Grandstand: the OSM stand run on the side opposite the pits along the straight (ENVDATA.cota.standRuns), as lap chords
  const MAIN = { style: 'main', label: 'MAIN GRANDSTAND', seat: 0x2d3e63, rows: 20, gap: 6, fill: 0.92, core: 150 };
  // runs OSM does not map: anchor = turn number, ds0 / ds1 metres from its turn-in, side 'out' / 'in' / +1 / -1
  const EXTRA = [
    // the T13 stand: on the inside between T13 and T14, close to the T14 apex (OSM has no footprint); the outside of T17 / T18 is the
    // paved service area (OSM roads over the whole run-off band), so no T18 bleachers there
    { anchor: 14, ds0: -24, ds1: 46, side: 'in', gaps: [4, 8, 12], rows: 10, style: 'temp', seat: 0x2356a6, label: 'TURN 13' },
  ];
  // spectator banks (GA hills): [anchor, ds0, ds1, side, depth (m of bank), fill]
  const BANKS = [
    // (COTA-UPGRADE, photos grandstand_pack_kerb_flag / grid_start_grandstand / flag_stands_mclaren: the whole hill beside the last ~230 m of the
    // climb is packed solid, row on row, up to the crest; step / row = the spacing along / across in m)
    // (side 'opp': on the straight 'out' resolved to the pit side, so the old bank stood on the pit building's roof line; the hill is the
    // outside of the Turn 1 left-hander = the Main Grandstand side)
    { anchor: 1, ds0: -235, ds1: -18, side: 'opp', depth: 36, fill: 0.98, step: 0.95, row: 1.0, even: true, label: 'Turn 1 hill' },
    { anchor: 2, ds0: -40, ds1: 60, side: 'in', depth: 20, fill: 0.45, label: 'Turn 2' },
    { anchor: 5, ds0: -60, ds1: 90, side: 'in', depth: 24, fill: 0.45, label: 'Esses GA' },
    { anchor: 9, ds0: -30, ds1: 120, side: 'out', depth: 22, fill: 0.45, label: 'Turn 9' },
    { anchor: 11, ds0: -70, ds1: 50, side: 'in', depth: 26, fill: 0.5, label: 'Turn 11 field' },
    { anchor: 19, ds0: -110, ds1: -10, side: 'in', depth: 20, fill: 0.45, label: 'Turn 19' },
  ];
  const sideOf = (t, sd, s0, s1) => { if (sd === 'pit' || sd === 'opp') return (sd === 'pit' ? 1 : -1) * (t.data.pitSide || 1); if (sd === 'out' || sd === 'in') { const o = Ct.outside(t, (s0 + s1) / 2); return sd === 'out' ? o : -o; } return sd; };

  // ================================================================ layout (inside EnvVenue.layoutStands: the venue builds tiers + crowd)
  St.layout = function (E) {
    const t = E.t, L = t.length; E.ctRuns = []; E.standPolys = E.standPolys || [];
    const why = E.stats.cotaWhy = {};
    // the Main Grandstand from the OSM run opposite the pits
    const PF = Ct.pitFrame(E); const oppSide = PF ? -PF.side : -1;
    let main = null; for (const r of E.ctStandRuns || E.data.standRuns || []) { if (r[2] !== oppSide) continue; const span = U.mod(r[1] - r[0], L); if (span < 150) continue; const a = U.mod(r[0] - t.sf + L / 2, L) - L / 2; if (a > 0 || a < -500) continue; main = { s0: t.sf + a, s1: t.sf + a + span }; }
    if (main) { const run = St.run(E, Object.assign({}, MAIN, { name: MAIN.label, s0: main.s0, s1: main.s1, side: oppSide })); run.core = [main.s0 + (main.s1 - main.s0) / 2 - MAIN.core / 2, main.s0 + (main.s1 - main.s0) / 2 + MAIN.core / 2]; E.ctMain = run;
      // the core's club / upper tier / suites / masts / stay anchors reach ~52 m behind the front: reserve it (trees, generic boxes off)
      for (const b of run.blocks) if (b.s >= run.core[0] - 1 && b.s <= run.core[1] + 1) { const poly = E.markRect(b.cx + b.nx * 27, b.cz + b.nz * 27, b.ax, b.az, b.len / 2 + 0.5, 26, Env.OCC.BUILT); E.standPolys.push(poly); E.ctOwnPolys.push(poly); } }
    // the OSM footprints
    const gs = E._ctGs || t.data.scenery.grandstands || [];
    for (const g of gs) {
      if (!g.p || g.p.length < 3) continue; let cx = 0, cz = 0; for (const q of g.p) { cx += q[0]; cz += q[1]; } cx /= g.p.length; cz /= g.p.length;
      const plan = POLY_PLAN.find(p => Math.hypot(p.at[0] - cx, p.at[1] - cz) < 30); if (!plan) { why['nomatch' + Math.round(cx) + ',' + Math.round(cz)] = 1; continue; }
      St.polyRun(E, g.p, plan);
    }
    for (const x of EXTRA) { const c = Ct.cs(t, x.anchor); const s0 = c + x.ds0, s1 = c + x.ds1; for (const gap of x.gaps || [x.gap]) { const run = St.run(E, Object.assign({}, x, { gap, name: x.label, s0, s1, side: sideOf(t, x.side, s0, s1) })); if (run.blocks.length) break; } }
    St.layoutAmph(E);
    St.layoutBanks(E);
    E.stats.cotaStands = { runs: E.ctRuns.length, blocks: E.ctRuns.reduce((n, r) => n + r.blocks.length, 0), bankPeople: (E.ctBankRecs || []).length };
  };
  const addBlock = (E, R, run, blk, depth) => {
    St.fitY(E, blk); if (R.fill != null) blk.fill = R.fill;
    if (!PERM[R.style]) { blk.first = !run.blocks.length; blk.last = false; }
    E.blocks.push(blk); run.blocks.push(blk);
    const poly = E.markRect(blk.cx + blk.nx * depth / 2, blk.cz + blk.nz * depth / 2, blk.ax, blk.az, blk.len / 2 + 0.4, depth / 2 + 0.4, Env.OCC.BUILT); E.standPolys.push(poly); E.ctOwnPolys.push(poly);
  };
  // one lap run -> chords; each chord shorter where the lap curves or climbs (the floor is level within a chord: <= ~1 m of fall along it)
  St.run = function (E, R) {
    const t = E.t, OCC = Env.OCC; const kk = t.smooth(t.k, 10); const side = R.side; const why = E.stats.cotaWhy;
    const run = { R, blocks: [] }; let s = R.s0; const rows = R.rows || 12; const depth = Z0 + rows * TREAD + 0.8;
    while (s < R.s1 - 5) {
      const i0 = t.idxAtS(s); const Rr = 1 / (Math.abs(kk[i0]) + 1e-5);
      const grade = Math.abs(t.y[t.idxAtS(s + 10)] - t.y[i0]) / 10; let step = U.clamp(Math.min(Rr * 0.24, 1.0 / Math.max(grade, 0.01)), 8, 30); let sb = Math.min(R.s1, s + step); if (R.s1 - sb < 6) sb = R.s1;
      let wmax = 0; for (let q = s; q <= sb + 0.01; q += 2) wmax = Math.max(wmax, E.wallCap(t.idxAtS(q), side));
      const d = wmax + (R.gap != null ? R.gap : 4);
      const inner = (kk[i0] > 0) === (side > 0); if (inner && d > Rr * 0.8) { s = sb; continue; }
      const A = Ct.at(t, s, side, d), Bq = Ct.at(t, sb, side, d);
      let ax = Bq.x - A.x, az = Bq.z - A.z; const len = Math.hypot(ax, az); if (!(len >= 5)) { s = sb; continue; } ax /= len; az /= len;
      const im = t.idxAtS((s + sb) / 2); let nx = -az, nz = ax; if (nx * t.nx[im] * side + nz * t.nz[im] * side < 0) { nx = -nx; nz = -nz; }
      const cx = (A.x + Bq.x) / 2, cz = (A.z + Bq.z) / 2, hl = len / 2 - 0.15;
      const W = (x, z) => [cx + ax * x + nx * z, cz + az * x + nz * z];
      if (!St.clear(E, W, hl, depth)) { why[R.label + ':clear'] = (why[R.label + ':clear'] || 0) + 1; s = sb; continue; }
      if (R.style !== 'main' && E.rectFree(cx + nx * depth / 2, cz + nz * depth / 2, ax, az, hl, depth / 2, OCC.BUILT | OCC.WATER | OCC.ROAD) < 0.85) { why[R.label + ':occ'] = (why[R.label + ':occ'] || 0) + 1; s = sb; continue; }
      const blk = { cx, cz, ax, az, nx, nz, len: hl * 2, rows, roof: false, seat: R.seat, y: 0, s: (s + sb) / 2, first: false, last: false, name: R.label || R.name, ct: { R, run } };
      addBlock(E, R, run, blk, depth); s = sb;
    }
    if (run.blocks.length) { if (!PERM[R.style]) run.blocks[run.blocks.length - 1].last = true; E.ctRuns.push(run); }
    return run;
  };
  // a chord (local W(x, z): x along, z into the stand) is clear when its front corners are >= 1 m and every other sample (back corners,
  // middles, the scaffold stair towers at the ends) >= 2 m beyond the rendered barrier of whatever stretch of the lap is nearest
  St.clear = function (E, W, hl, depth) {
    const t = E.t; const pts = [[-hl, 0, 1], [hl, 0, 1], [0, 0, 1], [-hl, depth, 2], [hl, depth, 2], [0, depth, 2], [-hl, depth / 2, 2], [hl, depth / 2, 2], [-hl - 3.6, depth - 2, 2], [hl + 3.6, depth - 2, 2]];
    for (const [x, z, need] of pts) { const P = W(x, z); if (E.fsAt(P[0], P[1]) < need) return false; if (z > 0 && E.dcAt(P[0], P[1]) < t.halfWidth + t.kerbWidth + 4) return false; }
    return true;
  };
  // an OSM footprint -> its oriented box (longest edge = the front axis), the front = the long side nearer the track (or the landmark it
  // faces), chords of <= 26 m along it; rows from the footprint depth; slid out of the barriers if a corner reaches them
  St.polyRun = function (E, poly, plan) {
    const t = E.t, sc = E.sc, pr = {}; const why = E.stats.cotaWhy;
    let bl = 0, ax = 1, az = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; const l = Math.hypot(q[0] - p[0], q[1] - p[1]); if (l > bl) { bl = l; ax = (q[0] - p[0]) / l; az = (q[1] - p[1]) / l; } }
    let cx = 0, cz = 0; for (const q of poly) { cx += q[0]; cz += q[1]; } cx /= poly.length; cz /= poly.length;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity; const bx = -az, bz = ax;
    for (const q of poly) { const dx = q[0] - cx, dz = q[1] - cz; const a = dx * ax + dz * az, b = dx * bx + dz * bz; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
    const mx = cx + ax * (a0 + a1) / 2 + bx * (b0 + b1) / 2, mz = cz + az * (a0 + a1) / 2 + bz * (b0 + b1) / 2; const len = a1 - a0, dep = b1 - b0;
    // which long side faces the track (or the landmark)
    let sgn;
    const lm = plan.face && E.data.landmarks && E.data.landmarks[plan.face];
    if (lm && lm.p) { let lx = 0, lz = 0; for (const q of lm.p) { lx += q[0]; lz += q[1]; } lx /= lm.p.length; lz /= lm.p.length; sgn = ((lx - mx) * bx + (lz - mz) * bz) > 0 ? 1 : -1; }
    else sgn = E.dcAt(mx + bx * dep / 2, mz + bz * dep / 2) < E.dcAt(mx - bx * dep / 2, mz - bz * dep / 2) ? 1 : -1;
    // front edge midpoint, depth direction (into the stand) = -sgn * b
    let fx = mx + bx * sgn * dep / 2, fz = mz + bz * sgn * dep / 2; const nx = -bx * sgn, nz = -bz * sgn;
    const rows = U.clamp(Math.floor((dep - Z0 - 0.8) / TREAD), 6, plan.maxRows || 26); const depth = Z0 + rows * TREAD + 0.8;
    // the front must clear the barriers it faces (1.5 m + its own skirt): slide back along -n... i.e. away from the track
    for (let it = 0; it < 4; it++) { let need = 0; for (const u of [-0.5, 0, 0.5]) { const px = fx + ax * len * u, pz = fz + az * len * u; t.project(px, pz, null, pr); const side = pr.lat < 0 ? -1 : 1; need = Math.max(need, E.wallCap(pr.i, side) + 2.0 - pr.dist); } if (need <= 0.05) break; fx += nx * need; fz += nz * need; }
    const R = Object.assign({ rows }, plan, { name: plan.label }); const run = { R, blocks: [] };
    const nch = Math.max(1, Math.ceil(len / 26)), cl = len / nch;
    for (let k = 0; k < nch; k++) {
      const u = -len / 2 + (k + 0.5) * cl; const bxc = fx + ax * u, bzc = fz + az * u; const hl = cl / 2 - 0.1;
      const W = (x, z) => [bxc + ax * x + nx * z, bzc + az * x + nz * z];
      if (!St.clear(E, W, hl, depth)) { why[plan.label + ':pclear'] = (why[plan.label + ':pclear'] || 0) + 1; continue; }
      t.project(bxc, bzc, null, pr);
      const blk = { cx: bxc, cz: bzc, ax, az, nx, nz, len: hl * 2, rows, roof: false, seat: plan.seat, y: 0, s: pr.s, first: false, last: false, name: plan.label, ct: { R, run } };
      addBlock(E, R, run, blk, depth);
    }
    if (run.blocks.length) { if (!PERM[R.style]) run.blocks[run.blocks.length - 1].last = true; E.ctRuns.push(run); }
    return run;
  };
  // the floor level of a chord: the front no more than 0.5 m into the ground at its high end, every row >= 0.3 m clear of a rising hillside.
  // Called at layout and again just before the venue builds (St.refit): the drawn ground (sc.height) is final only after the terrain / verge.
  St.fitY = function (E, b) {
    const sc = E.sc, hl = b.len / 2, zBack = Z0 + b.rows * TREAD; let gF = -Infinity, need = -Infinity;
    for (const x of [-hl, -hl / 2, 0, hl / 2, hl]) for (const z of [0, zBack * 0.33, zBack * 0.66, zBack]) { const g = sc.height(b.cx + b.ax * x + b.nx * z, b.cz + b.az * x + b.nz * z); if (z === 0) gF = Math.max(gF, g); need = Math.max(need, g + 0.3 - (Y0 + z / TREAD * RISE)); }
    b.y = Math.max(gF - 0.5, need);
  };
  St.refit = function (E) {
    const sc = E.sc;
    for (const run of E.ctRuns || []) for (const b of run.blocks) St.fitY(E, b);
    const off = E.ctBankOff || []; (E.ctBankRecs || []).forEach((r, k) => { r[0][1] = sc.height(r[0][0], r[0][2]) - (off[k] || 0); });
    for (const f of E.ctBankFlags || []) f[1] = sc.height(f[0], f[2]);
    St.fitAmph(E);
    St.mainSeats(E);
    St.amphSeats(E);
  };
  // a thin race-day audience on the amphitheatre tiers (they look across at T16-T18 over the stage): seat records in the shared crowd
  St.amphSeats = function (E) {
    const Am = E.ctAmph; if (!Am) return; const rng = U.rng(4242); const recs = E.ctSeatRecs = E.ctSeatRecs || [];
    const cols = ['#d8d8d4', '#1a1a1a', '#3b404a', '#1b2a4a', '#2a4a78', '#8a1c22', '#f2f2f2', '#c9b28a', '#ff6a00', '#c8102e'].map(h => { const c = C(h); return [c.r, c.g, c.b]; });
    const SEATED = [0, 0, 1, 2, 3, 4, 8, 8, 9]; let n = 0;
    for (let r = 0; r < Am.rows; r++) { const y = Am.y + Y0 + (r + 1) * RISE, rr = Am.r0 + Z0 + r * TREAD + 0.5; const n0 = Math.floor(2 * Am.half * rr / 0.55);
      for (let k = 0; k < n0; k++) { if (rng() > 0.22 * (0.4 + 1.2 * U.noise2(k * 0.13 + 7, r * 0.3))) continue; const a = Am.ang - Am.half + (k + 0.5) / n0 * 2 * Am.half;
        const x = Am.cx + Math.cos(a) * rr, z = Am.cz + Math.sin(a) * rr; const yaw = Math.atan2(-Math.cos(a), -Math.sin(a)); const sh = cols[Math.floor(rng() * cols.length)], ac = cols[Math.floor(rng() * cols.length)];
        recs.push([[x, y, z, yaw + (rng() - 0.5) * 0.3], [SEATED[Math.floor(rng() * SEATED.length)], 0.93 + rng() * 0.13, rng(), 0], [sh[0], sh[1], sh[2], 0.999], [ac[0], ac[1], ac[2], 0]]); n++; } }
    E.stats.cotaAmphPeople = n;
  };

  // ================================================================ the Germania Insurance Amphitheater: polar tiers facing the stage
  // The OSM footprint is a curved band 50-68 m from the Tower (the pavilion behind the reserved seats): its centre angle gives the
  // direction from the Tower to the audience; the stage stands at the Tower's foot, the tiers rise away from it between r 24 and r 46.
  St.layoutAmph = function (E) {
    const lm = E.data.landmarks || {}; const tw = lm.tower, am = lm.amphitheatre; E.ctAmph = null; if (!tw || !am || !am.p) return;
    let ang = 0, sx = 0, sz = 0, rmin = Infinity, rmax = 0, amin = Infinity, amax = -Infinity;
    for (const q of am.p) { sx += q[0] - tw.x; sz += q[1] - tw.z; } ang = Math.atan2(sz, sx);
    const st = { cx: tw.x + Math.cos(ang) * 6, cz: tw.z + Math.sin(ang) * 6 };    // the stage front centre (the audience's focus)
    for (const q of am.p) { const dx = q[0] - st.cx, dz = q[1] - st.cz; const r = Math.hypot(dx, dz); rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); const a = U.wrapAngle(Math.atan2(dz, dx) - ang); amin = Math.min(amin, a); amax = Math.max(amax, a); }
    const half = U.clamp(Math.max(-amin, amax) + 0.3, 0.6, 1.0);
    const A = { ang, half, cx: st.cx, cz: st.cz, r0: 22, rows: 24, band: [Math.max(40, rmin - 2), Math.min(rmax, rmin + 18)], tower: tw, y: 0 };
    A.r1 = A.r0 + Z0 + A.rows * TREAD;
    // reserve the bowl + pavilion (trees / boards / generic boxes off)
    const poly = []; for (let k = 0; k <= 12; k++) { const a = ang - half + 2 * half * k / 12; poly.push([st.cx + Math.cos(a) * (A.band[1] + 3), st.cz + Math.sin(a) * (A.band[1] + 3)]); } poly.push([tw.x, tw.z]);
    E.markPoly(poly, Env.OCC.BUILT, 1); E.standPolys.push(poly); E.ctOwnPolys.push(poly);
    E.ctAmph = A; St.fitAmph(E);
  };
  St.fitAmph = function (E) {
    const A = E.ctAmph; if (!A) return; const sc = E.sc; let gmin = Infinity, gmax = -Infinity, need = -Infinity;
    for (let k = 0; k <= 8; k++) { const a = A.ang - A.half + 2 * A.half * k / 8; for (const r of [A.r0, (A.r0 + A.r1) / 2, A.r1]) { const g = sc.height(A.cx + Math.cos(a) * r, A.cz + Math.sin(a) * r); gmin = Math.min(gmin, g); gmax = Math.max(gmax, g); need = Math.max(need, g + 0.3 - (Y0 + (r - A.r0) / TREAD * RISE)); } }
    A.y = Math.max(gmin - 0.3, need); A.gmin = gmin; A.gmax = gmax;
  };

  // ================================================================ the Main Grandstand's upper level (own tiers + seat records)
  // in each core chord's frame (origin = the lower tier's floor): lower tier to yTop 9.8 / zBack 16.8 (20 rows), the club level above its
  // back (glass at z 16.9, y 11.05 .. 13.3), the upper tier (12 rows, rise 0.45) from z 17.4, the suites box z 27.2 .. 31, the back wall z 31
  const UP = { y0: 13.8, z0: 17.4, rows: 12, rise: 0.45, tread: 0.82, zBox: 31.0, ySuite: 23.4 };
  UP.yTop = UP.y0 + UP.rows * UP.rise; UP.zBack = UP.z0 + UP.rows * UP.tread;
  const inCore = (E, b) => { const M = E.ctMain; if (!M || !M.core || b.ct.run !== M) return false; return b.s >= M.core[0] - 1 && b.s <= M.core[1] + 1; };
  St.mainSeats = function (E) {
    const M = E.ctMain; E.ctSeatRecs = []; if (!M) return; const rng = U.rng(9000);
    const everyday = ['#d8d8d4', '#1a1a1a', '#2a2b2e', '#3b404a', '#6c717a', '#1b2a4a', '#2a4a78', '#7d8ea4', '#8a1c22', '#3c5a3a', '#b39a4a', '#f2f2f2', '#c9b28a', '#ff6a00', '#c8102e'].map(h => { const c = C(h); return [c.r, c.g, c.b]; });
    const SEATED = [0, 0, 0, 1, 2, 3, 3, 4, 5, 8, 8, 9];
    for (const b of M.blocks) {
      if (!inCore(E, b)) continue; const m = Env.frame(b.cx, b.y, b.cz, b.ax, b.az, b.nx, b.nz); const hl = b.len / 2;
      const o = Env.xf(m, 0, 0, 0), f = Env.xf(m, 0, 0, -1); const yaw = Math.atan2(f[0] - o[0], f[2] - o[2]);
      for (let r = 0; r < UP.rows; r++) { const y = UP.y0 + (r + 1) * UP.rise, z = UP.z0 + r * UP.tread + 0.5;
        for (let a = -hl + 0.45; a < hl - 0.4; a += 0.55) { if (Math.abs(((a + hl) % 14) - 7) < 0.8) continue; if (rng() > 0.86 * (0.65 + 0.7 * U.noise2(a / 6 + b.s, r * 0.37))) continue;
          const p = Env.xf(m, a + (rng() - 0.5) * 0.1, y, z + (rng() - 0.5) * 0.08); const sh = everyday[Math.floor(rng() * everyday.length)], ac = everyday[Math.floor(rng() * everyday.length)]; const pose = SEATED[Math.floor(rng() * SEATED.length)];
          E.ctSeatRecs.push([[p[0], p[1], p[2], yaw + (rng() - 0.5) * 0.25], [pose, 0.93 + rng() * 0.13, rng(), 0], [sh[0], sh[1], sh[2], 0.999], [ac[0], ac[1], ac[2], 0]]); } }
    }
  };

  // ================================================================ spectator banks (GA hills): standing / sitting fans on the drawn ground
  St.layoutBanks = function (E) {
    const t = E.t, OCC = Env.OCC, sc = E.sc; const rng = U.rng(1836); const recs = E.ctBankRecs = []; const offs = E.ctBankOff = []; E.ctBankFlags = [];
    // race-day Austin crowd (photos crowd_aerial_track_curve, crowd_blur_ferrari, mclaren_stands_flag): papaya / Dutch orange first, then white,
    // black, Ferrari red, navy and team blues, white and tan cowboy hats (the accent colour)
    const shirts = ['#f47b20', '#ff6a13', '#f26b1d', '#e8e8e4', '#f2f2f2', '#1a1a1a', '#2a2b2e', '#c8102e', '#b8141c', '#1b2a4a', '#2f6db5', '#00a19c', '#6c717a', '#c9b28a', '#1f6e4a', '#e8c21c'].map(h => { const c = C(h); return [c.r, c.g, c.b]; });
    const STAND = [10, 11, 12, 13, 14, 15], SIT = [0, 1, 2, 3, 4, 8]; const by = E.stats.cotaBanks = {};
    for (const Bk of BANKS) {
      const c = Ct.cs(t, Bk.anchor); const side = sideOf(t, Bk.side, c + Bk.ds0, c + Bk.ds1); const n0 = recs.length;
      const stp = Bk.step || 1.25, row = Bk.row || 1.3;
      for (let s = c + Bk.ds0; s < c + Bk.ds1; s += stp) {
        const i = t.idxAtS(s); const w = E.wallCap(i, side); const ty = t.y[i];
        for (let d = w + 5 + rng() * 0.6; d < w + 5 + Bk.depth; d += row + rng() * 0.4) {
          const p = Ct.at(t, s + (rng() - 0.5) * 0.8, side, d); if (E.fsAt(p.x, p.z) < 3.5 || (E.occAt(p.x, p.z) & (OCC.BUILT | OCC.ROAD | OCC.WATER))) continue;
          const g = sc.height(p.x, p.z); if (g < ty - 2.0) continue;
          const g2 = sc.height(p.x + p.nx * 1.5, p.z + p.nz * 1.5); if (Math.abs(g2 - g) > 1.2) continue;
          const dens = Bk.fill * (Bk.even ? 0.9 + 0.2 * U.noise2(p.x / 9 + 11, p.z / 9 - 3) : 0.5 + 0.9 * U.noise2(p.x / 9 + 11, p.z / 9 - 3)); if (rng() > dens) continue;
          const sit = rng() < 0.35; const pose = sit ? SIT[Math.floor(rng() * SIT.length)] : STAND[Math.floor(rng() * STAND.length)];
          const sh = shirts[Math.floor(rng() * shirts.length)], ac = shirts[Math.floor(rng() * shirts.length)]; const yaw = Math.atan2(-p.nx, -p.nz) + (rng() - 0.5) * 0.6;
          offs.push(sit ? 0.42 : 0.02); recs.push([[p.x, g - (sit ? 0.42 : 0.02), p.z, yaw], [pose, 0.92 + rng() * 0.14, rng(), pose >= 11 && rng() < 0.4 ? 2 : 0], [sh[0], sh[1], sh[2], 0.999], [ac[0], ac[1], ac[2], 0]]);
        }
        if (rng() < stp / 24) { const p = Ct.at(t, s, side, w + 5 + Bk.depth * (0.3 + rng() * 0.6)); if (E.fsAt(p.x, p.z) > 3.5 && !(E.occAt(p.x, p.z) & (OCC.BUILT | OCC.ROAD))) E.ctBankFlags.push([p.x, sc.height(p.x, p.z), p.z, Math.atan2(p.tx, p.tz), Math.floor(rng() * 4)]); }
      }
      const line = []; for (let s = c + Bk.ds0; s <= c + Bk.ds1; s += 6) { const i = t.idxAtS(s); const p = Ct.at(t, s, side, E.wallCap(i, side) + 5 + Bk.depth / 2); line.push([p.x, p.z]); }
      if (recs.length > n0 && line.length > 1) E.markLine(line, Bk.depth / 2 + 3, OCC.KEEP);
      by[Bk.label] = recs.length - n0;
    }
  };

  // ================================================================ dressing
  St.flip = (b) => (-b.az * b.nx + b.ax * b.nz) < 0;
  St.build = function (E, BK, out) {
    const { B, S, G, F: Fd, H, A } = BK; const sc = E.sc;
    const conc = C(0xb3b5b1), concD = C(0x989b9c), skirtT = C(0x3b403d), steel = C(0x9aa1a8), dark = C(0x2a2d33), navy = C(0x1d2640);
    let skirts = 0;
    for (const run of E.ctRuns) {
      const R = run.R; const perm = !!PERM[R.style];
      for (const b of run.blocks) {
        const m = Env.frame(b.cx, b.y, b.cz, b.ax, b.az, b.nx, b.nz); const P = (x, y, z) => Env.xf(m, x, y, z); const hl = b.len / 2;
        const yTop = Y0 + b.rows * RISE, zBack = Z0 + b.rows * TREAD; b.ct.yTop = yTop; b.ct.zBack = zBack; b.ct.m = m;
        const gl = (x, z) => { const p = P(x, 0, z); return sc.height(p[0], p[2]) - b.y; };
        const fwd = Ct.dir(P(0, 0, 0), P(0, 0, -1)), bwd = [-fwd[0], 0, -fwd[2]];
        const xs = []; { const nseg = Math.max(4, Math.ceil(b.len / 4)); for (let k = 0; k <= nseg; k++) xs.push(-hl - 0.1 + (b.len + 0.2) * k / nseg); }
        // ---- skirts where the ground falls below the floor: front, back, both ends (concrete on permanent stands, dark fabric on scaffold)
        const sk = perm ? concD : skirtT;
        for (let k = 0; k + 1 < xs.length; k++) { const ga = gl(xs[k], 0.05), gb = gl(xs[k + 1], 0.05); if (Math.min(ga, gb) < -0.05 && gl((xs[k] + xs[k + 1]) / 2, 0.05) < 0.0) { Ct.face(B, P(xs[k], Math.min(0, ga - 0.3), -0.02), P(xs[k + 1], Math.min(0, gb - 0.3), -0.02), P(xs[k + 1], 0.02, -0.02), P(xs[k], 0.02, -0.02), sk, fwd); skirts++; } }
        for (let k = 0; k + 1 < xs.length; k++) { const ga = gl(xs[k], zBack), gb = gl(xs[k + 1], zBack); if (Math.min(ga, gb) < -0.05 && gl((xs[k] + xs[k + 1]) / 2, zBack) < 0.0) { Ct.face(B, P(xs[k], Math.min(0, ga - 0.3), zBack + 0.16), P(xs[k + 1], Math.min(0, gb - 0.3), zBack + 0.16), P(xs[k + 1], 0.02, zBack + 0.16), P(xs[k], 0.02, zBack + 0.16), sk, bwd); skirts++; } }
        for (const sx of [-hl - 0.08, hl + 0.08]) { const zz = []; { const nz = Math.max(2, Math.ceil(zBack / 3)); for (let k = 0; k <= nz; k++) zz.push((zBack + 0.16) * k / nz); } const want = Ct.dir(P(0, 0, 0), P(Math.sign(sx), 0, 0));
          for (let k = 0; k + 1 < zz.length; k++) { const ga = gl(sx, zz[k]), gb = gl(sx, zz[k + 1]); if (Math.min(ga, gb) < -0.05 && gl(sx, (zz[k] + zz[k + 1]) / 2) < 0.0) Ct.face(B, P(sx, Math.min(0, ga - 0.3), zz[k]), P(sx, Math.min(0, gb - 0.3), zz[k + 1]), P(sx, 0.02, zz[k + 1]), P(sx, 0.02, zz[k]), sk, want); } }
        if (!perm) {
          // the venue's scaffold stair towers stand on the floor level: where the ground is lower there, a dark skirt box carries them down
          for (const [flag, sx] of [[b.first, -hl - 1.9], [b.last, hl + 1.9]]) { if (!flag) continue; let g = Infinity, gx = -Infinity; for (const [dx, dz] of [[-1.7, -2], [1.7, -2], [1.7, 2], [-1.7, 2], [0, 0]]) { const q = gl(sx + dx, zBack - 2 + dz); g = Math.min(g, q); gx = Math.max(gx, q); } if (g < -0.05) { const top = Math.max(0.02, gx + 0.04); B.box(m, 3.5, top - g + 0.3, 4.1, sx, g - 0.3, zBack - 2.0, skirtT); skirts++; } }
        }
        { const bi = E.blocks.indexOf(b) + 1; if (!b.first && !b.last && b.rows >= 10 && bi % 3 === 0 && b.len > 12) { let g = Infinity, gx = -Infinity; for (const [dx, dz] of [[-1.6, 0.5], [1.6, 0.5], [1.6, 3.5], [-1.6, 3.5], [0, 2]]) { const q = gl(dx, zBack + dz); g = Math.min(g, q); gx = Math.max(gx, q); } if (g < -0.05) { const top = Math.max(0.02, gx + 0.04); B.box(m, 3.4, top - g + 0.3, 3.2, 0, g - 0.3, zBack + 2.0, perm ? concD : skirtT); skirts++; } } }
        if (!perm) continue;
        const core = inCore(E, b);
        // ---- permanent stands: back wall from the drawn ground (concrete with a dark window band and pilasters), end walls, stair doors
        const gB = Math.min(gl(-hl, zBack), gl(0, zBack), gl(hl, zBack), 0) - 0.4, yW = yTop + 1.25;
        if (!core) { Ct.face(B, P(-hl - 0.1, gB, zBack + 0.14), P(hl + 0.1, gB, zBack + 0.14), P(hl + 0.1, yW, zBack + 0.14), P(-hl - 0.1, yW, zBack + 0.14), conc, bwd);
          { const yw = Math.max(1.2, yTop * 0.5); Ct.face(B, P(-hl, yw, zBack + 0.17), P(hl, yw, zBack + 0.17), P(hl, yw + 0.9, zBack + 0.17), P(-hl, yw + 0.9, zBack + 0.17), C(0x3a4148), bwd); }
          for (let a = -hl + 2.5; a < hl - 1; a += 5) B.box(m, 0.45, yW - gB, 0.35, a, gB, zBack + 0.34, concD);
          for (let a = -hl + 7; a < hl - 4; a += 14) B.box(m, 1.8, 2.3, 0.06, a, Math.max(0, gl(a, zBack)), zBack + 0.18, dark); }
        const first = b === run.blocks[0], last = b === run.blocks[run.blocks.length - 1]; const fs = St.flip(b) ? -1 : 1;
        for (const [flag, sx] of [[first, -fs * (hl + 0.1)], [last, fs * (hl + 0.1)]]) if (flag) { const g0 = Math.min(gl(sx, 0), gl(sx, zBack), 0) - 0.3; const want = Ct.dir(P(0, 0, 0), P(Math.sign(sx), 0, 0));
          Ct.face(B, P(sx, g0, -0.08), P(sx, g0, zBack + 0.14), P(sx, yW, zBack + 0.14), P(sx, Y0 + 0.2, -0.08), concD, want);
          // (COTA-UPGRADE, photos grid_start_grandstand / grandstand_pack_kerb_flag: the Turn 1 stand's end walls carry a big stars-and-stripes
          // graphic - red field, a navy wedge, a white star) on the upper rear of the end wall, just proud of it
          if (R.label === 'TURN 1') { const z0 = zBack * 0.3, sxo = sx + Math.sign(sx) * 0.04, yb = Math.max(g0 + 0.3, 0.6), ys = (z) => Y0 + 0.2 + (yW - Y0 - 0.2) * (z + 0.08) / (zBack + 0.22);
            const mr = A.region('ctT1Mural', 132, 72, (x2, w, h) => { x2.fillStyle = '#9c1f26'; x2.fillRect(0, 0, w, h); x2.fillStyle = '#1d2a57'; x2.beginPath(); x2.moveTo(w * 0.52, h); x2.lineTo(w, 0); x2.lineTo(w, h); x2.closePath(); x2.fill();
              x2.fillStyle = '#e8e6df'; x2.fillRect(0, h * 0.86, w, h * 0.06); Ct.star(x2, w * 0.82, h * 0.6, h * 0.24, '#e8e6df'); });
            Ct.faceA(A, mr, P(sxo, yb, z0), P(sxo, yb, zBack + 0.1), P(sxo, yW - 0.1, zBack + 0.1), P(sxo, ys(z0) - 0.1, z0), want); } }
        if (core) St.mainCore(E, BK, b, run);
      }
      // wedges between consecutive chords of a curved / stepped permanent run (close the gaps in the backs and treads)
      for (let k = 0; k + 1 < run.blocks.length && perm; k++) {
        const a = run.blocks[k], b = run.blocks[k + 1]; const fa = St.flip(a) ? -1 : 1, fb = St.flip(b) ? -1 : 1;
        const pa = (y, z) => Env.xf(a.ct.m, fa * (a.len / 2 + 0.1), y, z), pb = (y, z) => Env.xf(b.ct.m, -fb * (b.len / 2 + 0.1), y, z);
        const zB = a.ct.zBack, yT = a.ct.yTop; K.dq(B, pa(Y0, 0.15), pb(Y0, 0.15), pb(yT, zB), pa(yT, zB), C(a.seat).multiplyScalar(0.8)); K.dq(B, pa(-0.3, 0.15), pb(-0.3, 0.15), pb(Y0, 0.15), pa(Y0, 0.15), conc); K.dq(B, pa(0, zB + 0.14), pb(0, zB + 0.14), pb(yT + 1.25, zB + 0.14), pa(yT + 1.25, zB + 0.14), conc);
      }
    }
    if (E.ctMain) St.mainRoof(E, BK, E.ctMain);
    St.buildAmph(E, BK); St.buildBankFlags(E, BK);
    Object.assign(out, { standSkirts: skirts, seatRecs: (E.ctSeatRecs || []).length });
  };
  // ---- one core chord of the Main Grandstand: the club level glass over the lower tier's back, the upper tier (own risers / treads, the
  // seats are crowd records), its parapet with a board band, the suites box, the tall back wall with the Velocity Lounge glass band
  St.mainCore = function (E, BK, b, run) {
    const { B, S, G, F: Fd, A } = BK; const m = b.ct.m, hl = b.len / 2; const P = (x, y, z) => Env.xf(m, x, y, z); const sc = E.sc;
    const gl = (x, z) => { const p = P(x, 0, z); return sc.height(p[0], p[2]) - b.y; };
    const fwd = Ct.dir(P(0, 0, 0), P(0, 0, -1)), bwd = [-fwd[0], 0, -fwd[2]];
    const seat = C(b.seat), seatD = C(b.seat).multiplyScalar(0.55), concD = C(0x989b9c), conc = C(0xb3b5b1), glass = C(0x2a3846), glassL = C(0x3d5265), clad = C(0x8f959b), navy = C(0x1d2640), red = C(0xc8102e);
    const zL = b.ct.zBack, yL = b.ct.yTop;   // the lower tier's back / top
    // club level: glass between the lower tier's rear rail (yL + 1.25) and the upper tier's parapet floor, set just behind the rail
    Ct.face(G, P(-hl, yL + 1.25, zL + 0.25), P(hl, yL + 1.25, zL + 0.25), P(hl, UP.y0 - 0.5, zL + 0.25), P(-hl, UP.y0 - 0.5, zL + 0.25), glass, fwd);
    for (let a = -hl; a <= hl + 0.01; a += b.len / Math.max(1, Math.round(b.len / 4))) Ct.face(Fd, P(a - 0.05, yL + 1.25, zL + 0.2), P(a + 0.05, yL + 1.25, zL + 0.2), P(a + 0.05, UP.y0 - 0.5, zL + 0.2), P(a - 0.05, UP.y0 - 0.5, zL + 0.2), C(0xb9bec2), fwd);
    // upper tier floor slab edge + parapet (navy with the red line), risers / treads
    Ct.hex(B, [P(-hl, UP.y0 - 0.5, zL + 0.1), P(hl, UP.y0 - 0.5, zL + 0.1), P(hl, UP.y0 - 0.5, UP.z0), P(-hl, UP.y0 - 0.5, UP.z0), P(-hl, UP.y0 + 0.9, zL + 0.1), P(hl, UP.y0 + 0.9, zL + 0.1), P(hl, UP.y0 + 0.9, UP.z0), P(-hl, UP.y0 + 0.9, UP.z0)], navy, concD, false);
    Ct.face(B, P(-hl, UP.y0 - 0.52, zL + 0.08), P(hl, UP.y0 - 0.52, zL + 0.08), P(hl, UP.y0 - 0.36, zL + 0.08), P(-hl, UP.y0 - 0.36, zL + 0.08), red, fwd);
    for (let r = 0; r < UP.rows; r++) { const y = UP.y0 + r * UP.rise, za = UP.z0 + r * UP.tread, zb = za + UP.tread;
      B.quad(P(-hl, y + UP.rise, za), P(hl, y + UP.rise, za), P(hl, y, za), P(-hl, y, za), seatD);
      B.quad(P(-hl, y + UP.rise, za), P(-hl, y + UP.rise, zb), P(hl, y + UP.rise, zb), P(hl, y + UP.rise, za), r % 2 ? seat : C(b.seat).multiplyScalar(0.85)); }
    for (let a = -hl + 7; a < hl - 4; a += 14) Ct.face(B, P(a - 0.6, UP.y0 + 0.02, UP.z0), P(a + 0.6, UP.y0 + 0.02, UP.z0), P(a + 0.6, UP.yTop + 0.02, UP.zBack), P(a - 0.6, UP.yTop + 0.02, UP.zBack), concD, [0, 1, 0]);
    // suites box: dark glass band, slab top, then the tall back wall from the drawn ground (cladding, the Velocity Lounge glass at level 2)
    Ct.face(G, P(-hl, UP.yTop, UP.zBack + 0.05), P(hl, UP.yTop, UP.zBack + 0.05), P(hl, UP.ySuite - 0.4, UP.zBack + 0.05), P(-hl, UP.ySuite - 0.4, UP.zBack + 0.05), glassL, fwd);
    Ct.hex(B, [P(-hl, UP.ySuite - 0.4, UP.zBack - 0.4), P(hl, UP.ySuite - 0.4, UP.zBack - 0.4), P(hl, UP.ySuite - 0.4, UP.zBox + 0.3), P(-hl, UP.ySuite - 0.4, UP.zBox + 0.3), P(-hl, UP.ySuite, UP.zBack - 0.4), P(hl, UP.ySuite, UP.zBack - 0.4), P(hl, UP.ySuite, UP.zBox + 0.3), P(-hl, UP.ySuite, UP.zBox + 0.3)], C(0xc4c7c9), C(0x8d9297), false);
    Ct.face(B, P(-hl, UP.yTop - 0.02, UP.zBack - 0.02), P(hl, UP.yTop - 0.02, UP.zBack - 0.02), P(hl, UP.yTop + 1.1, UP.zBack - 0.02), P(-hl, UP.yTop + 1.1, UP.zBack - 0.02), conc, fwd);
    const gB = Math.min(gl(-hl, UP.zBox), gl(0, UP.zBox), gl(hl, UP.zBox), 0) - 0.4;
    Ct.face(B, P(-hl - 0.05, gB, UP.zBox), P(hl + 0.05, gB, UP.zBox), P(hl + 0.05, UP.ySuite, UP.zBox), P(-hl - 0.05, UP.ySuite, UP.zBox), clad, bwd);
    for (const [ya, yb] of [[3.0, 5.6], [10.2, 13.0], [UP.yTop + 0.4, UP.ySuite - 0.8]]) Ct.face(G, P(-hl + 0.4, ya, UP.zBox + 0.04), P(hl - 0.4, ya, UP.zBox + 0.04), P(hl - 0.4, yb, UP.zBox + 0.04), P(-hl + 0.4, yb, UP.zBox + 0.04), glass, bwd);
    for (let a = -hl + 3; a < hl - 1; a += 6) S.box(m, 0.4, UP.ySuite - gB, 0.4, a, gB, UP.zBox + 0.25, C(0xa9aeb3));
    // the floor of the club / concourse behind the lower tier's back (closes the view down between the tiers' back and the back wall)
    Ct.face(B, P(-hl, yL + 0.02, zL + 0.15), P(hl, yL + 0.02, zL + 0.15), P(hl, yL + 0.02, UP.zBox), P(-hl, yL + 0.02, UP.zBox), concD, [0, 1, 0]);
    // end walls of the core section (profile: club + upper tier + suites)
    const M = E.ctMain; const ends = []; if (b === M.blocks.find(q => inCore(E, q))) ends.push(-1); { const cs = M.blocks.filter(q => inCore(E, q)); if (b === cs[cs.length - 1]) ends.push(1); }
    const fs = St.flip(b) ? -1 : 1;
    for (const e of ends) { const sx = e * fs * (hl + 0.05); const want = Ct.dir(P(0, 0, 0), P(Math.sign(sx), 0, 0)); const g0 = Math.min(gl(sx, zL), gl(sx, UP.zBox), 0) - 0.3;
      // the side profile (club + upper tier + suites) as a fan from its bottom-rear corner
      const V = [[zL + 0.1, g0], [UP.zBox, g0], [UP.zBox, UP.ySuite], [UP.zBack - 0.4, UP.ySuite], [UP.zBack - 0.4, UP.yTop + 1.1], [UP.z0, UP.y0 + 0.9], [zL + 0.1, UP.y0 + 0.9]].map(([z, y]) => P(sx, y, z));
      for (let k = 2; k < V.length; k++) St.tri(B, V[1], V[k], k + 1 < V.length ? V[k + 1] : V[0], conc, want);
      const gF = Math.min(gl(sx, 0), gl(sx, zL), 0) - 0.3; Ct.face(B, P(sx, gF, -0.08), P(sx, gF, zL + 0.14), P(sx, yL + 1.25, zL + 0.14), P(sx, Y0 + 0.2, -0.08), concD, want); }
    // the board band along the upper parapet (partner tiles in the atlas)
    const tiles = St.tilesFor(A);
    const th = 0.75, tw = th * 5; const nt = Math.floor((b.len - 0.4) / tw); const x0 = -nt * tw / 2;
    for (let k = 0; k < nt; k++) { const xa = x0 + k * tw; const r = tiles[U.mod(k + Math.round(b.s), 8)]; Ct.faceA(A, r, P(xa + tw, UP.y0 + 0.08, zL + 0.06), P(xa, UP.y0 + 0.08, zL + 0.06), P(xa, UP.y0 + 0.08 + th, zL + 0.06), P(xa + tw, UP.y0 + 0.08 + th, zL + 0.06), fwd); }
  };
  St.tri = function (Bd, a, b, c, col, want) { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; if (nx * want[0] + ny * want[1] + nz * want[2] >= 0) Bd.tri(a, b, c, col); else Bd.tri(a, c, b, col); };
  St.tilesFor = function (A) { const out = []; for (let k = 0; k < 8; k++) out.push(A.region('ctTile' + k, 320, 64, (x2, w, h) => Mz.paintAd(x2, w, h, k, 5))); return out; };
  // ---- the white tensile fabric canopy over the core: 8 bays between raked steel masts behind the back wall; each bay a membrane that
  // lifts at the masts and sags between them (scalloped front edge), stays from the mast heads to the front edge and to ground anchors
  St.mainRoof = function (E, BK, M) {
    const { B, S, F: Fd, H } = BK; const sc = E.sc; const cs = M.blocks.filter(q => inCore(E, q)); if (!cs.length) return;
    // the roof follows one straight frame across the core (the straight is straight): from the first to the last core chord
    const b0 = cs[0], b1 = cs[cs.length - 1]; const p0 = Env.xf(b0.ct.m, (St.flip(b0) ? 1 : -1) * b0.len / 2, 0, 0), p1 = Env.xf(b1.ct.m, (St.flip(b1) ? -1 : 1) * b1.len / 2, 0, 0);
    let ax = p1[0] - p0[0], az = p1[2] - p0[2]; const len = Math.hypot(ax, az); ax /= len; az /= len; const nx = b0.nx, nz = b0.nz; const yB = Math.max(b0.y, b1.y);
    const m = Env.frame((p0[0] + p1[0]) / 2, yB, (p0[2] + p1[2]) / 2, ax, az, nx, nz); const P = (x, y, z) => Env.xf(m, x, y, z); const hl = len / 2;
    // (COTA-UPGRADE, photo cota_stand_canopy_car_blur + grid_start_grandstand: the fabric is a warm cream / beige, and each bay is a peaked
    // tent: the front edge rises to a point at every mast and sags deeply between them, ~5 m peak to trough; the back stays above the suites)
    const top = C(0xd5ccb6), under = [C(0xc4b9a0), C(0xb6ab92)], mastC = C(0xa9aeb3), cable = C(0x7d838a), rib = C(0x9aa0a6);
    const zF = -3.2, zR = UP.zBox + 1.2, yF = 28.6, yRr = 25.6, nb = 8, bw = len / nb, NU = 6, NV = 3; const zM = UP.zBox + 3.0, yM = 35.5;
    const hgt = (u, v) => { const yEdge = yF + (yRr - yF) * v; const sag = Math.pow(Math.sin(Math.PI * u), 0.75) * (5.0 - 4.0 * v); return yEdge - sag; };
    for (let k = 0; k < nb; k++) {
      const xa = -hl + k * bw; const X = (u) => xa + u * bw; const Z = (v) => zF + (zR - zF) * v;
      for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
        const u0 = i / NU, u1 = (i + 1) / NU, v0 = j / NV, v1 = (j + 1) / NV;
        const a = P(X(u0), hgt(u0, v0), Z(v0)), b = P(X(u1), hgt(u1, v0), Z(v0)), c = P(X(u1), hgt(u1, v1), Z(v1)), d = P(X(u0), hgt(u0, v1), Z(v1));
        Ct.face(B, a, b, c, d, top, [0, 1, 0]); Ct.face(B, a, b, c, d, under[(i + k) % 2], [0, -1, 0]);
      }
      // front edge tube (follows the scallop), the edge stays from the mast head
      for (let i = 0; i < NU; i++) S.beam(Env.frame(0, 0, 0, 1, 0, 0, 1), P(X(i / NU), hgt(i / NU, 0) - 0.1, zF), P(X((i + 1) / NU), hgt((i + 1) / NU, 0) - 0.1, zF), 0.28, mastC);
    }
    // masts: raked tubes from the ground behind the back wall to the head above the membrane's rear, front stays + back stays to anchors;
    // under each mast line a steel rib follows the membrane from the front tip to the back (the roof's structure, seen from the track)
    for (let k = 0; k <= nb; k++) {
      const x = -hl + k * bw;
      for (let j = 0; j < NV; j++) S.beam(Env.frame(0, 0, 0, 1, 0, 0, 1), P(x, hgt(0, j / NV) - 0.35, zF + (zR - zF) * j / NV), P(x, hgt(0, (j + 1) / NV) - 0.35, zF + (zR - zF) * (j + 1) / NV), 0.45, rib); const gb = (() => { const p = P(x, 0, zM + 4); return sc.height(p[0], p[2]) - yB; })();
      S.beam(Env.frame(0, 0, 0, 1, 0, 0, 1), P(x, gb - 0.3, zM + 4.0), P(x, yM, zM), 0.7, mastC);
      Fd.beam(Env.frame(0, 0, 0, 1, 0, 0, 1), P(x, yM, zM), P(x, hgt(0, 0), zF), 0.09, cable);
      Fd.beam(Env.frame(0, 0, 0, 1, 0, 0, 1), P(x, yM, zM), P(x, hgt(0, 0.5), (zF + zR) / 2), 0.07, cable);
      const ga = (() => { const p = P(x, 0, zM + 16); return sc.height(p[0], p[2]) - yB; })();
      Fd.beam(Env.frame(0, 0, 0, 1, 0, 0, 1), P(x, yM, zM), P(x, ga + 0.3, zM + 16), 0.09, cable);
      B.box(m, 1.4, 0.8, 1.4, x, ga - 0.4, zM + 16, C(0x8d9196));
      if (k < nb) H.beam(Env.frame(0, 0, 0, 1, 0, 0, 1), P(x, yM, zM), P(x + bw / 2, hgt(0.5, 0.4), zF + (zR - zF) * 0.4), 0.06, cable);
    }
    // High only: seam cables under the membrane along each bay's ridge line, a lamp row under the front edge
    for (let k = 0; k < nb; k++) { const xa = -hl + k * bw; for (let j = 0; j < NV; j++) H.beam(Env.frame(0, 0, 0, 1, 0, 0, 1), P(xa + bw / 2, hgt(0.5, j / NV) - 0.12, zF + (zR - zF) * j / NV), P(xa + bw / 2, hgt(0.5, (j + 1) / NV) - 0.12, zF + (zR - zF) * (j + 1) / NV), 0.06, cable);
      for (const u of [0.25, 0.75]) H.box(m, 0.6, 0.18, 0.35, xa + u * bw, hgt(u, 0.12) - 0.45, zF + (zR - zF) * 0.12, C(0xfff4dc)); }
    // (COTA-UPGRADE, photo cota_grid_start_grandstand) the row of small cream shade sails over the front rows: hypar sails, 2 per bay, low
    // corners 4.7 m / high 5.9 m over the frame base, 1.8 m in front of the tiers to 3.2 m over them (the 4th row's heads stay ~0.7 m below),
    // the front corners on raked posts to the ground, the back corners tied down to the tiers
    { const sail = C(0xd2c8b0), sailU = C(0xbdb197), post = C(0xa9aeb3); const zA = -1.8, zB = 3.2, yLo = 4.7, yHi = 5.9; const ns = nb * 2, sw = len / ns;
      for (let k = 0; k < ns; k++) { const x0 = -hl + k * sw + 0.35, x1 = x0 + sw - 0.7; const a = P(x0, yLo, zA), b = P(x1, yHi, zA), c = P(x1, yLo, zB), d = P(x0, yHi, zB);
        Ct.face(B, a, b, c, d, sail, [0, 1, 0]); Ct.face(B, a, b, c, d, sailU, [0, -1, 0]);
        for (const [x, y] of [[x0, yLo], [x1, yHi]]) { const g = (() => { const p = P(x, 0, zA - 0.6); return sc.height(p[0], p[2]) - yB; })(); S.beam(Env.frame(0, 0, 0, 1, 0, 0, 1), P(x, g - 0.3, zA - 0.6), P(x, y, zA), 0.14, post); }
        for (const x of [x0, x1]) Fd.beam(Env.frame(0, 0, 0, 1, 0, 0, 1), P(x, 2.6, zB), P(x, x === x0 ? yHi : yLo, zB), 0.06, post); } }
    E.stats.cota.mainRoof = { bays: nb, len: +len.toFixed(1) };
  };
  // ---- the amphitheatre: polar tiers (riser + tread per segment), a back wall + skirt to the ground, the radial end walls, two aisles; the
  // curved pavilion behind (the OSM footprint: a long low roof on columns), a few seated fans
  St.buildAmph = function (E, BK) {
    const Am = E.ctAmph; if (!Am) return; const { B, S, F: Fd } = BK; const sc = E.sc;
    const seg = 18, rows = Am.rows; const seat = C(0x6f747a), seatD = C(0x4d5257), conc = C(0xb3b5b1), concD = C(0x989b9c);
    const Q = (a, r, y) => [Am.cx + Math.cos(a) * r, Am.y + y, Am.cz + Math.sin(a) * r];
    const A0 = Am.ang - Am.half, dA = 2 * Am.half / seg;
    for (let r = 0; r < rows; r++) { const y = Y0 + r * RISE, ra = Am.r0 + Z0 + r * TREAD, rb = ra + TREAD;
      for (let k = 0; k < seg; k++) { const a0 = A0 + k * dA, a1 = a0 + dA; const aisle = k === Math.floor(seg / 3) || k === Math.floor(2 * seg / 3);
        Ct.face(B, Q(a0, ra, y), Q(a1, ra, y), Q(a1, ra, y + RISE), Q(a0, ra, y + RISE), aisle ? concD : seatD, [Am.cx - Q((a0 + a1) / 2, ra, 0)[0], 0, Am.cz - Q((a0 + a1) / 2, ra, 0)[2]]);
        Ct.face(B, Q(a0, ra, y + RISE), Q(a1, ra, y + RISE), Q(a1, rb, y + RISE), Q(a0, rb, y + RISE), aisle ? concD : (r % 2 ? seat : C(0x62676d)), [0, 1, 0]); } }
    // front wall (stage side) and the back wall / ends down to the ground
    const r1 = Am.r0 + Z0 + rows * TREAD, yT = Y0 + rows * RISE;
    for (let k = 0; k < seg; k++) { const a0 = A0 + k * dA, a1 = a0 + dA; const mid = (a0 + a1) / 2;
      const gf = Math.min(sc.height(...[Q(a0, Am.r0, 0)[0], Q(a0, Am.r0, 0)[2]]), sc.height(...[Q(a1, Am.r0, 0)[0], Q(a1, Am.r0, 0)[2]])) - Am.y - 0.3;
      Ct.face(B, Q(a0, Am.r0, Math.min(0, gf)), Q(a1, Am.r0, Math.min(0, gf)), Q(a1, Am.r0, Y0 + 0.9), Q(a0, Am.r0, Y0 + 0.9), conc, [-Math.cos(mid), 0, -Math.sin(mid)]);
      Ct.face(B, Q(a0, Am.r0, Y0 + 0.9), Q(a1, Am.r0, Y0 + 0.9), Q(a1, Am.r0 + Z0, Y0), Q(a0, Am.r0 + Z0, Y0), concD, [0, 1, 0]);
      const gb = Math.min(sc.height(...[Q(a0, r1, 0)[0], Q(a0, r1, 0)[2]]), sc.height(...[Q(a1, r1, 0)[0], Q(a1, r1, 0)[2]])) - Am.y - 0.4;
      Ct.face(B, Q(a0, r1, gb), Q(a1, r1, gb), Q(a1, r1, yT + 1.1), Q(a0, r1, yT + 1.1), conc, [Math.cos(mid), 0, Math.sin(mid)]);
      Ct.face(B, Q(a0, r1 - 0.3, yT + 1.1), Q(a1, r1 - 0.3, yT + 1.1), Q(a1, r1, yT + 1.1), Q(a0, r1, yT + 1.1), concD, [0, 1, 0]);
      Ct.face(B, Q(a0, r1 - 0.3, yT), Q(a1, r1 - 0.3, yT), Q(a1, r1 - 0.3, yT + 1.1), Q(a0, r1 - 0.3, yT + 1.1), concD, [-Math.cos(mid), 0, -Math.sin(mid)]); }
    for (const a of [A0, A0 + 2 * Am.half]) { const sg = a === A0 ? -1 : 1; const want = [-Math.sin(a) * sg, 0, Math.cos(a) * sg]; const g0 = Math.min(sc.height(...[Q(a, Am.r0, 0)[0], Q(a, Am.r0, 0)[2]]), sc.height(...[Q(a, r1, 0)[0], Q(a, r1, 0)[2]])) - Am.y - 0.3;
      Ct.face(B, Q(a, Am.r0, g0), Q(a, r1, g0), Q(a, r1, yT + 1.1), Q(a, Am.r0, Y0 + 0.9), concD, want); }
    // the pavilion: a curved low roof (7 m) on slim columns over the band of the OSM footprint, a rear wall
    const [p0, p1] = Am.band; const seg2 = 12; const ty = (a, r) => sc.height(Am.cx + Math.cos(a) * r, Am.cz + Math.sin(a) * r);
    let gp = Infinity; for (let k = 0; k <= seg2; k++) { const a = A0 + 2 * Am.half * k / seg2; gp = Math.min(gp, ty(a, p0), ty(a, p1)); }
    const yRoof = gp + 7.0; const R2 = (a, r, y) => [Am.cx + Math.cos(a) * r, y, Am.cz + Math.sin(a) * r];
    for (let k = 0; k < seg2; k++) { const a0 = A0 + 2 * Am.half * k / seg2, a1 = A0 + 2 * Am.half * (k + 1) / seg2; const mid = (a0 + a1) / 2;
      Ct.face(B, R2(a0, p0 - 2, yRoof), R2(a1, p0 - 2, yRoof), R2(a1, p1 + 1, yRoof + 0.8), R2(a0, p1 + 1, yRoof + 0.8), C(0xc9ccce), [0, 1, 0]);
      Ct.face(B, R2(a0, p0 - 2, yRoof - 0.02), R2(a1, p0 - 2, yRoof - 0.02), R2(a1, p1 + 1, yRoof + 0.78), R2(a0, p1 + 1, yRoof + 0.78), C(0x8f9499), [0, -1, 0]);
      Ct.face(B, R2(a0, p0 - 2, yRoof - 0.6), R2(a1, p0 - 2, yRoof - 0.6), R2(a1, p0 - 2, yRoof + 0.05), R2(a0, p0 - 2, yRoof + 0.05), C(0x1d2640), [-Math.cos(mid), 0, -Math.sin(mid)]);
      const gw = Math.min(ty(a0, p1), ty(a1, p1)) - 0.4; Ct.face(B, R2(a0, p1, gw), R2(a1, p1, gw), R2(a1, p1, yRoof + 0.75), R2(a0, p1, yRoof + 0.75), C(0x9a9fa4), [Math.cos(mid), 0, Math.sin(mid)]);
      const gc = ty(a0, p0 - 1.2) - 0.3; S.box(Env.frame(...R2(a0, p0 - 1.2, gc), 1, 0, 0, 1), 0.35, yRoof - gc, 0.35, 0, 0, 0, C(0xa9aeb3)); }
    E.stats.cota.amph = { y: +Am.y.toFixed(1), ang: +Am.ang.toFixed(2), half: +Am.half.toFixed(2), band: Am.band.map(v => +v.toFixed(1)) };
  };
  // flag poles on the banks (US, Texas, Dutch, orange), static rippled flags in the sign atlas
  St.buildBankFlags = function (E, BK) {
    const L = E.ctBankFlags || []; if (!L.length || !Mz.Stands || !Mz.Stands.flag) return; const { A } = BK;
    const fl = Ct.flagRegions(A); const R = [fl[0], fl[1], fl[2], fl[4]];
    const pole = A.region('ctPole', 8, 8, (x2, w, h) => { x2.fillStyle = '#c9cdd1'; x2.fillRect(0, 0, w, h); });
    for (const [x, y, z, yaw, k] of L) { for (const [dx, dz] of [[0.045, 0], [0, 0.045]]) { const a = [x - dx, y - 0.3, z - dz], b = [x + dx, y - 0.3, z + dz], c = [x + dx, y + 5.2, z + dz], d = [x - dx, y + 5.2, z - dz]; A.quad(pole, a, b, c, d); A.quad(pole, b, a, d, c); } Mz.Stands.flag(A, R[k % 4], [x, y + 5.15, z], yaw, 2.2, 1.45); }
    E.stats.cota.bankFlags = L.length;
  };

  Ct.Stands = St;
})();
