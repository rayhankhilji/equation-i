// Equation I - Autodromo Hermanos Rodriguez grandstands (MEX-MODELS): the Foro Sol / Estadio GNP Seguros bowl, the Estadio Alfredo
// Harp Helu shell, the Main Grandstand, the temporary 'Blue Grandstands' 3-6 at Turn 1, 5A, 6A, 9-11 and the Peraltada stand.
//  * bowl() = ONE lofted-ribbon builder for the stadium stands: a front line (the inner edge of the OSM stand footprint, corners
//    filleted) sampled into stations; at every station the same cross-section - the field wall with its board band, the lower deck
//    (green 'VE' sections), the covered concourse with its vomitories, the cantilevered upper deck (orange 'NA', the brown 'Cafe' band,
//    the GNP rows at the top) and the outer facade - is lofted to the next station, so the decks curve with the footprint without gaps.
//    The 2024 roof covers the back half of the rows (cantilever trusses from masts behind the facade). Seats are the concrete steps +
//    the crowd (records in the shared instanced crowd, painted far strips in the venue's crowd carpet). Stations that would come
//    within 3 m of a barrier, the lap corridor or the pit lane are dropped (the ribbon splits / ends there, an end wall closes it).
//  * The same builder makes the Main Grandstand (one covered deck along the pit straight, the suites box, a flat cantilevered roof on
//    raked masts) and the Harp Helu shell (one deck in an arc round home plate under a row of white peaked canvas roof modules).
//  * The temporary stands are lap chords that EI.EnvVenue builds (tiers, scaffold, boards, crowd), keyed by TURN NUMBER, re-fitted
//    to the drawn ground after the terrain exists.
(function () {
  const Mx = EI.EnvMexico; if (!Mx) return;
  const U = EI.U, Env = EI.Env, K = Mx.K, C = Mx.C, Mz = EI.EnvMonza;
  const St = {};
  const RISE = 0.42, TREAD = 0.82, Y0 = 1.4, Z0 = 0.4;   // the venue's chord tiers

  // ================================================================ plans
  // temporary chord stands (EnvVenue builds them): anchor = turn number, ds from its turn-in, side +1 / -1 (+lat = left of travel) or
  // 'out' / 'in'; gaps tried in order (m beyond the widest barrier of the chord)
  const TEMP = [
    { anchor: 1, ds0: -175, ds1: -35, side: 1, gaps: [5, 11, 17, 24], rows: 24, seat: 0x2356a6, label: 'GRADA 3' },
    { anchor: 1, ds0: -30, ds1: 70, side: 1, gaps: [5, 11, 17, 24, 32], rows: 22, seat: 0x2356a6, label: 'GRADA 4' },
    { anchor: 3, ds0: -60, ds1: 40, side: 1, gaps: [5, 11, 17, 24, 32], rows: 22, seat: 0x24508f, label: 'GRADA 5' },
    { anchor: 3, ds0: 45, ds1: 190, side: 1, gaps: [5, 11, 17, 24], rows: 20, seat: 0x2356a6, label: 'GRADA 6' },
    { anchor: 3, ds0: 30, ds1: 95, side: -1, gaps: [5, 9, 14], rows: 10, seat: 0x3d5f8f, label: 'GRADA 5A' },
    { anchor: 3, ds0: 300, ds1: 370, side: -1, gaps: [5, 9, 14, 20], rows: 12, seat: 0x2356a6, label: 'GRADA 6A' },
    { anchor: 4, ds0: -70, ds1: -5, side: 'out', gaps: [5, 9, 14, 20], rows: 12, seat: 0x2356a6, label: 'GRADA 9' },
    { anchor: 5, ds0: -10, ds1: 55, side: 'out', gaps: [5, 9, 14, 20], rows: 12, seat: 0x3d5f8f, label: 'GRADA 10' },
    { anchor: 6, ds0: 15, ds1: 85, side: 'out', gaps: [5, 9, 14, 20], rows: 12, seat: 0x2356a6, label: 'GRADA 11' },
    { anchor: 17, ds0: -75, ds1: 55, side: 'out', gaps: [5, 9, 14, 20], rows: 14, seat: 0x24508f, label: 'PERALTADA' },
  ];
  const sideOf = (t, sd, s0, s1) => { if (sd === 'out' || sd === 'in') { const o = Mx.outside(t, (s0 + s1) / 2); return sd === 'out' ? o : -o; } return sd; };

  // ================================================================ layout
  St.layout = function (E) {
    const t = E.t; E.mxRuns = []; E.mxRibbons = []; E.standPolys = E.standPolys || []; const why = E.stats.mexicoWhy = {};
    for (const x of TEMP) { const c = Mx.cs(t, x.anchor); const s0 = c + x.ds0, s1 = c + x.ds1; const side = sideOf(t, x.side, s0, s1); let best = null; for (const gap of x.gaps) { const run = St.run(E, Object.assign({}, x, { gap, s0, s1, side })); if (!best || run.blocks.length > best.blocks.length) best = run; if (run.blocks.length >= Math.max(1, Math.floor((x.ds1 - x.ds0) / 30))) break; } if (best && best.blocks.length) St.accept(E, best); else why[x.label] = 'none'; }
    try { St.layoutMain(E); } catch (e) { console.error('EnvMexico main GS', e); }
    try { St.layoutForoSol(E); } catch (e) { console.error('EnvMexico Foro Sol', e); }
    try { St.layoutHarp(E); } catch (e) { console.error('EnvMexico Harp Helu', e); }
    E.stats.mexicoStands = { runs: E.mxRuns.map(r => r.R.label + ':' + r.blocks.length).join(' '), ribbons: E.mxRibbons.map(r => r.name + ':' + r.st.length).join(' ') };
  };
  // one lap run -> chords (as COTA): each chord shorter where the lap curves
  St.run = function (E, R) {
    const t = E.t, OCC = Env.OCC; const kk = t.smooth(t.k, 10); const side = R.side;
    const run = { R, blocks: [], polys: [] }; let s = R.s0; const rows = R.rows || 12; const depth = Z0 + rows * TREAD + 0.8;
    while (s < R.s1 - 5) {
      const i0 = t.idxAtS(s); const Rr = 1 / (Math.abs(kk[i0]) + 1e-5);
      let step = U.clamp(Rr * 0.24, 8, 26); let sb = Math.min(R.s1, s + step); if (R.s1 - sb < 6) sb = R.s1;
      let wmax = 0; for (let q = s; q <= sb + 0.01; q += 2) wmax = Math.max(wmax, E.wallCap(t.idxAtS(q), side));
      const d = wmax + R.gap;
      const inner = (kk[i0] > 0) === (side > 0); if (inner && d > Rr * 0.8) { s = sb; continue; }
      const A = Mx.at(t, s, side, d), Bq = Mx.at(t, sb, side, d);
      let ax = Bq.x - A.x, az = Bq.z - A.z; const len = Math.hypot(ax, az); if (!(len >= 5)) { s = sb; continue; } ax /= len; az /= len;
      const im = t.idxAtS((s + sb) / 2); let nx = -az, nz = ax; if (nx * t.nx[im] * side + nz * t.nz[im] * side < 0) { nx = -nx; nz = -nz; }
      const cx = (A.x + Bq.x) / 2, cz = (A.z + Bq.z) / 2, hl = len / 2 - 0.15;
      const W = (x, z) => [cx + ax * x + nx * z, cz + az * x + nz * z];
      const why = E.stats.mexicoWhy, wk = R.label + '@' + R.gap;
      if (!St.clear(E, W, hl, depth)) { why[wk + ':clear'] = (why[wk + ':clear'] || 0) + 1; s = sb; continue; }
      if (E.rectFree(cx + nx * depth / 2, cz + nz * depth / 2, ax, az, hl + 2, depth / 2 + 1, OCC.BUILT | OCC.WATER) < 0.9 || E.rectFree(cx + nx * depth / 2, cz + nz * depth / 2, ax, az, hl, depth / 2, OCC.ROAD) < 0.6) { why[wk + ':occ'] = (why[wk + ':occ'] || 0) + 1; s = sb; continue; }
      const blk = { cx, cz, ax, az, nx, nz, len: hl * 2, rows, roof: false, seat: R.seat, y: 0, s: (s + sb) / 2, first: !run.blocks.length, last: false, name: R.label, mx: { R, run } };
      St.fitY(E, blk); run.blocks.push(blk);
      s = sb;
    }
    return run;
  };
  // accept a run: the venue builds its chords; the footprints (+ the stair towers at the ends) are reserved only now, so a rejected
  // attempt leaves no marks behind for the next gap
  St.accept = function (E, run) {
    const depth = Z0 + run.R.rows * TREAD + 0.8; run.blocks[run.blocks.length - 1].last = true;
    for (const b of run.blocks) { E.blocks.push(b); const ex = (b.first || b.last) ? 4.0 : 0.3; const poly = E.markRect(b.cx + b.nx * depth / 2, b.cz + b.nz * depth / 2, b.ax, b.az, b.len / 2 + ex, depth / 2 + 0.8, Env.OCC.BUILT); E.standPolys.push(poly); E.mxOwnPolys.push(poly); }
    E.mxRuns.push(run);
  };
  // every sample of a chord (front corners >= 1.5 m, the rest >= 2.5 m beyond the rendered barrier; the stair towers at the ends too)
  St.clear = function (E, W, hl, depth) {
    const t = E.t; const why = E.stats.mexicoWhy; const pts = [[-hl, 0, 1.5], [hl, 0, 1.5], [0, 0, 1.5], [-hl, depth, 2.5], [hl, depth, 2.5], [0, depth, 2.5], [-hl, depth / 2, 2.5], [hl, depth / 2, 2.5], [-hl - 3.6, depth - 2, 2.5], [hl + 3.6, depth - 2, 2.5]];
    for (const [x, z, need] of pts) { const P = W(x, z); if (E.fsAt(P[0], P[1]) < need) { why._fs = (why._fs || 0) + 1; return false; } if (E.dcAt(P[0], P[1]) < t.halfWidth + t.kerbWidth + 4) { why._dc = (why._dc || 0) + 1; return false; } if (Mx.nearPit(E, P[0], P[1]) < 10) { why._pit = (why._pit || 0) + 1; return false; } }
    return true;
  };
  // chord floor level: the front no more than 0.5 m into the ground, every row >= 0.3 m clear of the ground (re-run after the terrain)
  St.fitY = function (E, b) {
    const sc = E.sc, hl = b.len / 2, zBack = Z0 + b.rows * TREAD; let gF = -Infinity, need = -Infinity;
    for (const x of [-hl, -hl / 2, 0, hl / 2, hl]) for (const z of [0, zBack * 0.33, zBack * 0.66, zBack]) { const g = sc.height(b.cx + b.ax * x + b.nx * z, b.cz + b.az * x + b.nz * z); if (z === 0) gF = Math.max(gF, g); need = Math.max(need, g + 0.3 - (Y0 + z / TREAD * RISE)); }
    b.y = Math.max(gF - 0.5, need);
  };

  // ================================================================ ribbons: stations along a front line
  // a polyline [x, z] -> the same line with every corner sharper than ~20 deg replaced by an arc of radius R (points every 12 deg)
  St.fillet = function (pts, R) {
    const out = [pts[0]];
    for (let i = 1; i + 1 < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1]; let ux = a[0] - b[0], uz = a[1] - b[1], vx = c[0] - b[0], vz = c[1] - b[1]; const lu = Math.hypot(ux, uz), lv = Math.hypot(vx, vz); if (lu < 0.1 || lv < 0.1) continue; ux /= lu; uz /= lu; vx /= lv; vz /= lv;
      const cosT = U.clamp(ux * vx + uz * vz, -1, 1); const th = Math.acos(cosT); const turn = Math.PI - th; if (turn < 0.35) { out.push(b); continue; }
      const tl = Math.min(R / Math.tan(th / 2), lu * 0.45, lv * 0.45); const r = tl * Math.tan(th / 2);
      const p0 = [b[0] + ux * tl, b[1] + uz * tl], p1 = [b[0] + vx * tl, b[1] + vz * tl];
      let bx = ux + vx, bz = uz + vz; const lb = Math.hypot(bx, bz) || 1; bx /= lb; bz /= lb; const dc = r / Math.sin(th / 2); const cx = b[0] + bx * dc, cz = b[1] + bz * dc;
      const a0 = Math.atan2(p0[1] - cz, p0[0] - cx), a1 = Math.atan2(p1[1] - cz, p1[0] - cx); const da = U.wrapAngle(a1 - a0); const n = Math.max(2, Math.ceil(Math.abs(da) / 0.21));
      for (let k = 0; k <= n; k++) { const aa = a0 + da * k / n; out.push([cx + Math.cos(aa) * r, cz + Math.sin(aa) * r]); }
    }
    out.push(pts[pts.length - 1]); return out;
  };
  // resample a polyline: straight runs every `step` m, bends keep their points (arcs from fillet())
  St.resample = function (pts, step) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) { const a = out[out.length - 1], b = pts[i]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 1.0) continue; const n = Math.max(1, Math.round(l / step)); for (let k = 1; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
    return out;
  };
  // stations from a front polyline: unit normal into the stand (the side where `into(x, z)` is true, else `nsign`), miter factor
  St.stations = function (pts, into, nsign) {
    const n = pts.length; const segN = [];
    for (let i = 0; i + 1 < n; i++) { const a = pts[i], b = pts[i + 1]; let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; segN.push([-dz, dx]); }
    // orient: the majority vote of the segment midpoints
    let vote = 0; for (let i = 0; i + 1 < n; i++) { const a = pts[i], b = pts[i + 1]; const mx = (a[0] + b[0]) / 2 + segN[i][0] * 3, mz = (a[1] + b[1]) / 2 + segN[i][1] * 3; vote += into ? (into(mx, mz) ? 1 : -1) : nsign; }
    const sg = vote >= 0 ? 1 : -1;
    const st = [];
    for (let i = 0; i < n; i++) {
      const a = segN[Math.max(0, i - 1)], b = segN[Math.min(n - 2, i)]; let nx = (a[0] + b[0]) * sg, nz = (a[1] + b[1]) * sg; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      const cosH = U.clamp((a[0] * nx + a[1] * nz) * sg, 0.5, 1); st.push({ x: pts[i][0], z: pts[i][1], nx, nz, m: 1 / cosH });
    }
    return st;
  };
  // GEN's barriers reach deep into the stadium field where the run-off is wide (T13 / T14: 45-48 m): slide each station's front back
  // along its normal until it is >= `need` m beyond the rendered barrier (smoothed along the line so the front stays fair), <= maxS m
  St.pushBack = function (E, st, need, maxS) {
    const sh = st.map(s => { let d = 0; for (let k = 0; k < 40; k++) { let ok = true; for (const z of [0, 2.5, 5]) { const x = s.x + s.nx * (d + z), zz = s.z + s.nz * (d + z); if (E.fsAt(x, zz) < need) { ok = false; break; } } if (ok) break; d += 0.5; } return Math.min(d, maxS); });
    const n = st.length, sm = new Float32Array(n);
    for (let i = 0; i < n; i++) { let m = 0; for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) m = Math.max(m, sh[j] - Math.abs(i - j) * 1.2); sm[i] = m; }
    for (let i = 0; i < n; i++) { st[i].x += st[i].nx * sm[i]; st[i].z += st[i].nz * sm[i]; st[i].push = sm[i]; }
    return st;
  };
  // drop stations whose cross-section footprint is not clear; returns the runs of consecutive good stations (>= 2 each)
  St.trim = function (E, st, depth, front, backPit) {
    const t = E.t; const ok = st.map(s => {
      for (const [z, need] of [[0, front], [depth * 0.25, front + 1], [depth * 0.5, 2.5], [depth, 2.5]]) { const x = s.x + s.nx * z * s.m, zz = s.z + s.nz * z * s.m; if (E.fsAt(x, zz) < need || E.dcAt(x, zz) < t.halfWidth + t.kerbWidth + 6) return false; if (Mx.nearPit(E, x, zz) < (z > depth * 0.4 ? backPit : 10)) return false; }
      return true; });
    const runs = []; let cur = [];
    for (let i = 0; i < st.length; i++) { if (ok[i]) cur.push(st[i]); else { if (cur.length >= 2) runs.push(cur); cur = []; } }
    if (cur.length >= 2) runs.push(cur); return runs;
  };
  // the cross-section point (z into the stand, y above the ribbon floor) at station s
  const SP = (R, s, z, y) => [s.x + s.nx * z * s.m, R.y + y, s.z + s.nz * z * s.m];
  St.reserve = function (E, R, depth) {
    const st = R.st; const poly = []; for (const s of st) poly.push([s.x - s.nx * 1.0, s.z - s.nz * 1.0]); for (let i = st.length - 1; i >= 0; i--) { const s = st[i]; poly.push([s.x + s.nx * (depth + 2) * s.m, s.z + s.nz * (depth + 2) * s.m]); }
    E.markPoly(poly, Env.OCC.BUILT, 2); E.standPolys.push(poly); E.mxOwnPolys.push(poly); R.poly = poly;
  };
  St.fitRibbon = function (E, R) {
    const sc = E.sc; let gF = -Infinity, gmin = Infinity; for (const s of R.st) { const g = sc.height(s.x, s.z); gF = Math.max(gF, g); for (const z of [0, R.depth * 0.5, R.depth]) gmin = Math.min(gmin, sc.height(s.x + s.nx * z * s.m, s.z + s.nz * z * s.m)); }
    R.y = gF + (R.lift || 0); R.gmin = gmin;
    R.g = R.st.map(s => [sc.height(s.x, s.z) - R.y, sc.height(s.x + s.nx * R.depth * s.m, s.z + s.nz * R.depth * s.m) - R.y]);
  };

  // ================================================================ Foro Sol / Estadio GNP Seguros
  // decks (z from the field wall, y from the field level); numbers chosen so the whole section fits the OSM footprints (~34 m deep)
  const FS = { wallH: 1.5, low: { z0: 0.35, y0: 1.5, rows: 15, rise: 0.45, tread: 0.85 }, aisle: 1.8, aisleRise: 1.15, up: { rise: 0.5, tread: 0.85 } };
  St.layoutForoSol = function (E) {
    const lm = E.data.landmarks || {}; const halves = lm.foroSolStands; if (!halves || !halves.length) return;
    // the bowl centre: the mean of both footprints' vertices (the open side of the C faces the T13 annex / the podium)
    let cx = 0, cz = 0, n = 0; for (const h of halves) for (const q of h.p) { cx += q[0]; cz += q[1]; n++; } cx /= n; cz /= n; E.mxBowlC = [cx, cz];
    E.mxBowls = [];
    halves.forEach((h, hk) => {
      const P = h.p; const N = P.length; const inner = P.map(v => { let dx = cx - v[0], dz = cz - v[1]; const l = Math.hypot(dx, dz) || 1; return !U.pointInPoly(v[0] + dx / l * 2.5, v[1] + dz / l * 2.5, P); });
      // the longest cyclic run of inner vertices = the front line
      let best = null; for (let s0 = 0; s0 < N; s0++) { if (!inner[s0] || inner[(s0 - 1 + N) % N]) continue; const run = []; for (let k = 0; k < N && inner[(s0 + k) % N]; k++) run.push(P[(s0 + k) % N]); if (!best || run.length > best.length) best = run; }
      if (!best || best.length < 2) return;
      const front = St.resample(St.fillet(best, 12), 8.5);
      const st = St.stations(front, (x, z) => U.pointInPoly(x, z, P), 1);
      // the deck depth: the footprint depth along the normals (median), the upper deck rows fitted to it
      const ds = st.map(s => { let d = 0; for (let z = 4; z < 60; z += 0.5) { if (!U.pointInPoly(s.x + s.nx * z, s.z + s.nz * z, P)) break; d = z; } return d; }).filter(d => d > 10).sort((a, b) => a - b);
      const dep = ds.length ? ds[Math.floor(ds.length / 2)] : 32;
      const lowEnd = FS.low.z0 + FS.low.rows * FS.low.tread; const upZ0 = lowEnd + FS.aisle; const upRows = U.clamp(Math.floor((dep + 1.0 - upZ0 - 0.6) / FS.up.tread), 8, 26);
      const depth = upZ0 + upRows * FS.up.tread + 0.6;
      St.pushBack(E, st, 3.2, 14);
      const runs = St.trim(E, st, depth, 3.0, 9);
      for (const r of runs) { const R = { name: 'foroSol' + hk + '_' + E.mxRibbons.length, kind: 'foroSol', half: hk, st: r, depth, upRows, upZ0, lowEnd, y: 0 }; St.reserve(E, R, depth); St.fitRibbon(E, R); E.mxRibbons.push(R); E.mxBowls.push(R); }
    });
    // the field + concourse annex between the halves stay clear of trees (KEEP) - the outline itself
    if (lm.foroSol && lm.foroSol.p) E.markPoly(lm.foroSol.p, Env.OCC.KEEP, 0);
  };

  // ================================================================ the Main Grandstand (opposite the pits): one covered deck
  const MG = { wallH: 1.6, rows: 22, rise: 0.44, tread: 0.82, z0: 0.35 };
  St.layoutMain = function (E) {
    const t = E.t, L = t.length; const PF = Mx.pitFrame(E); const opp = PF ? -PF.side : 1;
    // the OSM main-grandstand runs opposite the pits within 450 m of the line -> one span (gaps between them are bridged)
    let a0 = Infinity, a1 = -Infinity, gap = 11.5;
    for (const r of E.mxStandRuns || []) { if (r[2] !== opp) continue; const s0 = U.mod(r[0] - t.sf + L / 2, L) - L / 2, span = U.mod(r[1] - r[0], L); if (s0 < -450 || s0 > 300) continue; a0 = Math.min(a0, s0); a1 = Math.max(a1, s0 + span); gap = Math.min(gap, r[3] || gap); }
    if (!Number.isFinite(a0)) return;
    const pts = []; const q = {};
    for (let s = a0; s <= a1 + 0.01; s += 10) { let w = 0; for (let ds = -12; ds <= 12; ds += 3) w = Math.max(w, E.wallCap(t.idxAtS(t.sf + s + ds), opp)); const p = Mx.at(t, t.sf + s, opp, w + gap, q); pts.push([p.x, p.z]); }
    const st = St.stations(pts, null, 1);
    // the normal must point away from the track
    { const s = st[Math.floor(st.length / 2)]; if (E.dcAt(s.x + s.nx * 5, s.z + s.nz * 5) < E.dcAt(s.x, s.z)) for (const o of st) { o.nx = -o.nx; o.nz = -o.nz; } }
    const depth = MG.z0 + MG.rows * MG.tread + 9.0;
    const runs = St.trim(E, st, depth, 3.0, 9);
    for (const r of runs) { const R = { name: 'mainGS' + E.mxRibbons.length, kind: 'main', st: r, depth, y: 0 }; St.reserve(E, R, depth + 6); St.fitRibbon(E, R); E.mxRibbons.push(R); }
  };

  const HH = { rows: 28, r0: 30 };
  // ================================================================ Estadio Alfredo Harp Helu (the Diablos Rojos' park): the shell
  // one deck in an arc round home plate facing the field; home plate on the footprint's side towards the main straight
  St.layoutHarp = function (E) {
    const lm = E.data.landmarks || {}; const H = lm.harpHelu; if (!H || !H.p) return; const P = H.p;
    const c = Mx.centroid(P); let best = null;
    // home plate: the point 62 m inside the footprint edge nearest the main straight / T1 corner, field towards the centroid
    let fx = 0, fz = 0; { const t = E.t; const p = Mx.at(t, Mx.cs(t, 1) - 120, 1, 0); fx = p.x - c[0]; fz = p.z - c[1]; const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l; }
    let dEdge = 0; for (let d = 0; d < 300; d += 1) { if (!U.pointInPoly(c[0] + fx * d, c[1] + fz * d, P)) break; dEdge = d; }
    const hp = [c[0] + fx * Math.max(10, dEdge - HH.r0 - HH.rows * 0.82 - 14), c[1] + fz * Math.max(10, dEdge - HH.r0 - HH.rows * 0.82 - 14)];
    const r0 = HH.r0, half = 1.85, ang = Math.atan2(fz, fx); const pts = [];
    for (let k = 0; k <= 26; k++) { const a = ang - half + 2 * half * k / 26; pts.push([hp[0] + Math.cos(a) * r0, hp[1] + Math.sin(a) * r0]); }
    const st = pts.map(p => { let nx = p[0] - hp[0], nz = p[1] - hp[1]; const l = Math.hypot(nx, nz) || 1; return { x: p[0], z: p[1], nx: nx / l, nz: nz / l, m: 1 }; });
    const depth = 0.35 + HH.rows * 0.82 + 3.0;
    const runs = St.trim(E, st, depth, 3.0, 9);
    for (const r of runs) { if (r.length < 6) continue; const R = { name: 'harp' + E.mxRibbons.length, kind: 'harp', st: r, depth, y: 0, hp, r0 }; St.reserve(E, R, depth + 2); St.fitRibbon(E, R); E.mxRibbons.push(R); best = R; }
    if (best) { const poly = []; for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; poly.push([hp[0] + Math.cos(a) * 18, hp[1] + Math.sin(a) * 18]); } E.markPoly(P, Env.OCC.KEEP, 0); }
  };

  St.refit = function (E) {
    for (const run of E.mxRuns || []) for (const b of run.blocks) St.fitY(E, b);
    for (const R of E.mxRibbons || []) St.fitRibbon(E, R);
    E.mxSeatRecs = []; E.mxCarpet = { p: [], n: [], c: [], uv: [] };
    for (const R of E.mxRibbons || []) { try { St.people(E, R); } catch (e) { console.error('EnvMexico people ' + R.name, e); } }
  };

  // ================================================================ people (crowd records) and their far painted strips
  // rows: [z of the riser foot, y of the tread, tread depth, fill, shade] per row; people at 0.55-0.6 m along each row between the aisles
  St.rowsOf = function (R) {
    const out = [];
    if (R.kind === 'foroSol') {
      const L = FS.low; for (let r = 0; r < L.rows; r++) out.push({ z: L.z0 + r * L.tread, y: L.y0 + (r + 1) * L.rise, tr: L.tread, fill: 0.84, sh: 0.96, pitch: 0.66 });
      const up = FS.up, yU = FS.low.y0 + FS.low.rows * FS.low.rise + FS.aisleRise; const zr = R.upZ0 + R.upRows * up.tread * 0.14;
      for (let r = 0; r < R.upRows; r++) { const z = R.upZ0 + r * up.tread; out.push({ z, y: yU + (r + 1) * up.rise, tr: up.tread, fill: 0.64, sh: z > zr ? 0.72 : 0.95, pitch: 0.72 }); }
    } else if (R.kind === 'main') {
      for (let r = 0; r < MG.rows; r++) out.push({ z: MG.z0 + r * MG.tread, y: MG.wallH + (r + 1) * MG.rise, tr: MG.tread, fill: 0.5, sh: r < 2 ? 0.9 : 0.72, pitch: 0.7 });
    } else if (R.kind === 'harp') {
      for (let r = 0; r < HH.rows; r++) out.push({ z: 0.35 + r * 0.82, y: 1.8 + (r + 1) * 0.44, tr: 0.82, fill: 0.4, sh: r > HH.rows * 0.45 ? 0.76 : 0.96, pitch: 0.68 });
    }
    return out;
  };
  St.people = function (E, R) {
    const rng = U.rng(4300 + E.mxRibbons.indexOf(R)); const recs = E.mxSeatRecs; const st = R.st;
    const everyday = ['#d8d8d4', '#1a1a1a', '#2a2b2e', '#3b404a', '#6c717a', '#1b2a4a', '#2a4a78', '#7d8ea4', '#8a1c22', '#3c5a3a', '#b39a4a', '#e8e8e4', '#c9b28a', '#ff6a00', '#c8102e', '#006847'].map(h => { const c = C(h); return [c.r, c.g, c.b]; });
    const SEATED = [0, 0, 0, 1, 2, 3, 3, 4, 5, 8, 8, 9], STANDING = [10, 11, 12, 13, 14, 15];
    const rows = St.rowsOf(R); let n = 0;
    for (let i = 0; i + 1 < st.length; i++) {
      const a = st[i], b = st[i + 1];
      for (const row of rows) {
        const zc = row.z + 0.5; const pa = SP(R, a, zc, row.y), pb = SP(R, b, zc, row.y); const len = Math.hypot(pb[0] - pa[0], pb[2] - pa[2]); if (len < 1) continue;
        // facing: towards the field (minus the station normal)
        const nx = -(a.nx + b.nx) / 2, nz = -(a.nz + b.nz) / 2; const yaw = Math.atan2(nx, nz);
        const aisleA = i % 2 === 0 ? 0.75 : 0.2, aisleB = (i + 1) % 2 === 0 ? 0.75 : 0.2;   // aisles at the even stations
        const nrm = [nx * 0.83, 0.55, nz * 0.83];
        const u0 = aisleA / len, u1 = 1 - aisleB / len; if (u1 <= u0) continue;
        Mx.carpetRow(E, [pa[0] + (pb[0] - pa[0]) * u0, pa[1], pa[2] + (pb[2] - pa[2]) * u0], [pa[0] + (pb[0] - pa[0]) * u1, pa[1], pa[2] + (pb[2] - pa[2]) * u1], nrm, row.sh * (0.9 + rng() * 0.15), rng);
        for (let u = aisleA + 0.25; u < len - aisleB - 0.2; u += row.pitch) {
          const f = u / len; const x = pa[0] + (pb[0] - pa[0]) * f, z = pa[2] + (pb[2] - pa[2]) * f; const occ = row.fill * (0.66 + 0.6 * U.noise2(x / 7 + i * 0.7, z / 7 + row.z * 0.21)); if (rng() > occ) continue;
          const standZ = U.noise2(x / 12 + 40, z / 12 + 7) > 0.72; const pose = (standZ ? rng() < 0.8 : rng() < 0.05) ? STANDING[Math.floor(rng() * STANDING.length)] : SEATED[Math.floor(rng() * SEATED.length)];
          const sh = everyday[Math.floor(rng() * everyday.length)], ac = everyday[Math.floor(rng() * everyday.length)];
          const mo = (pose === 11 || pose === 12 || pose === 14 || pose === 15) ? (rng() < 0.55 ? 2 : 1) : rng() < 0.02 ? 1 : 0;
          recs.push([[x + (rng() - 0.5) * 0.08, pa[1], z + (rng() - 0.5) * 0.08, yaw + (rng() - 0.5) * 0.25], [pose, 0.93 + rng() * 0.13, rng(), mo], [sh[0], sh[1], sh[2], 0.999], [ac[0], ac[1], ac[2], row.sh]]); n++;
        }
      }
    }
    R.people = n;
  };

  // ================================================================ build
  St.build = function (E, BK, out) {
    const res = out.stands = {};
    St.buildTemp(E, BK, res);
    const tiles = St.tilesFor(BK.A);
    const tcount = () => Math.round((BK.B.count + BK.S.count + BK.G.count) / 3), fcount = () => Math.round((BK.F.count + BK.H.count) / 3), acount = () => Math.round(BK.A.geo.p.length / 9);
    for (const R of E.mxRibbons || []) { const m0 = tcount(), f0 = fcount(), a0 = acount(); try { if (R.kind === 'foroSol') St.buildForoSol(E, BK, R, tiles); else if (R.kind === 'main') St.buildMain(E, BK, R, tiles); else if (R.kind === 'harp') St.buildHarp(E, BK, R); res[R.name] = { st: R.st.length, people: R.people, y: +R.y.toFixed(2), main: tcount() - m0, fine: fcount() - f0, sign: acount() - a0 }; } catch (e) { console.error('EnvMexico ribbon ' + R.name, e); } }
    { const m0 = tcount(), f0 = fcount(); try { St.buildTowers(E, BK, res); } catch (e) { console.error('EnvMexico towers', e); } res.towerTris = [tcount() - m0, fcount() - f0]; }
    res.seatRecs = (E.mxSeatRecs || []).length;
  };
  St.tilesFor = function (A) { const out = []; for (let k = 0; k < 8; k++) out.push(A.region('mxTile' + k, 320, 64, (x2, w, h) => Mz.paintAd(x2, w, h, k, 5))); return out; };
  // the temporary chord stands: dark skirts where the ground falls below the floor (flat site: rarely), a navy-blue fascia name board
  St.buildTemp = function (E, BK, res) {
    const { B } = BK; const sc = E.sc; const skirtT = C(0x3b403d); let skirts = 0;
    for (const run of E.mxRuns || []) for (const b of run.blocks) {
      const m = Env.frame(b.cx, b.y, b.cz, b.ax, b.az, b.nx, b.nz); const P = (x, y, z) => Env.xf(m, x, y, z); const hl = b.len / 2; const zBack = Z0 + b.rows * TREAD;
      const gl = (x, z) => { const p = P(x, 0, z); return sc.height(p[0], p[2]) - b.y; };
      const fwd = Mx.dir(P(0, 0, 0), P(0, 0, -1)), bwd = [-fwd[0], 0, -fwd[2]];
      for (const [z, want, dz] of [[0, fwd, -0.02], [zBack, bwd, 0.16]]) { const ga = gl(-hl - 0.1, z), gb = gl(hl + 0.1, z); if (Math.min(ga, gb) < -0.05 && Math.max(ga, gb, gl(0, z)) < 0.0) { Mx.face(B, P(-hl - 0.1, Math.min(0, ga - 0.3), z + dz), P(hl + 0.1, Math.min(0, gb - 0.3), z + dz), P(hl + 0.1, 0.02, z + dz), P(-hl - 0.1, 0.02, z + dz), skirtT, want); skirts++; } }
      for (const [flag, sx] of [[b.first, -hl - 1.9], [b.last, hl + 1.9]]) { if (!flag) continue; let g = Infinity, gx = -Infinity; for (const [dx, dz] of [[-1.7, -2], [1.7, -2], [1.7, 2], [-1.7, 2], [0, 0]]) { const q = gl(sx + dx, zBack - 2 + dz); g = Math.min(g, q); gx = Math.max(gx, q); } if (g < -0.05) { B.box(m, 3.5, Math.max(0.02, gx + 0.04) - g + 0.3, 4.1, sx, g - 0.3, zBack - 2.0, skirtT); skirts++; } }
    }
    res.tempRuns = (E.mxRuns || []).map(r => r.R.label + ':' + r.blocks.length + '@' + r.R.gap).join(' '); res.tempSkirts = skirts;
  };

  // the crowd mass under the fan sprites: each tread segment (station gap x row) gets a muted mixed-clothing tone (dark / white / orange /
  // red / green / blue), so the gaps between the sprites read as a packed stand from any distance instead of bare concrete (0 cost)
  const MASS = [0x4d4a47, 0x5b5652, 0x6e6a66, 0x8d8a86, 0xa9a6a1, 0x9a6a46, 0xa45a2e, 0x7a3a34, 0x3f5a46, 0x40506a, 0x5e5a50, 0x7d7368].map(h => C(h));
  St.massC = (i, r, k) => { const h = Math.abs(Math.sin(i * 12.9898 + r * 78.233 + (k || 0) * 3.17) * 43758.5453) % 1; const c = MASS[Math.floor(h * MASS.length)].clone(); return c.multiplyScalar(0.88 + (h * 7.3 % 1) * 0.2); };
  // ---------------------------------------------------------------- generic loft helpers
  // quad between station i and i+1 for the cross-section segment (za, ya) -> (zb, yb), wound to face `want(i)`
  const loftQ = (Bd, R, i, za, ya, zb, yb, col, want) => { const a = R.st[i], b = R.st[i + 1]; Mx.face(Bd, SP(R, a, za, ya), SP(R, b, za, ya), SP(R, b, zb, yb), SP(R, a, zb, yb), col, want); };
  const nrmOf = (R, i) => { const a = R.st[i], b = R.st[i + 1]; return [(a.nx + b.nx) / 2, 0, (a.nz + b.nz) / 2]; };
  // an end wall: the polygon under a cross-section polyline (z, y) down to the drawn ground at station s, facing `want`
  const endWall = (Bd, R, s, prof, gy, col, want) => { for (let k = 0; k + 1 < prof.length; k++) { const [za, ya] = prof[k], [zb, yb] = prof[k + 1]; if (Math.abs(zb - za) < 0.01) continue; Mx.face(Bd, SP(R, s, za, gy), SP(R, s, zb, gy), SP(R, s, zb, yb), SP(R, s, za, ya), col, want); } };
  const endWant = (R, k) => { const st = R.st; const a = k === 0 ? st[0] : st[st.length - 1], b = k === 0 ? st[1] : st[st.length - 2]; return Mx.dir([b.x, 0, b.z], [a.x, 0, a.z]); };

  // ---------------------------------------------------------------- the Foro Sol stand ribbon
  St.buildForoSol = function (E, BK, R, tiles) {
    const { B, S, G, F: Fd, H, A } = BK; const st = R.st, NS = st.length; const sc = E.sc;
    // photos (PHOTOS-A, MEX-BEAUTY round 0): grey concrete steps under a packed crowd, the section colours only as accents; one continuous
    // canopy over the back rows with a RUST / terracotta underside and radial ribs, rising towards the field; a dark navy LED fascia with
    // white partner logos under its front edge; a dark LED band along the field wall; the canopy dips towards each gateway
    const conc = C(0x9f9c95), treadC = [C(0xb0aea8), C(0xa7a59f)], concL = C(0xbdbab2), concD = C(0x8f8c85), facadeD = C(0xa8a397), dark = C(0x2b2d31);
    const green = C(0x2f7a4a), orange = C(0xd9772b), cafe = C(0x8a5a3c), gnp = C(0x5d6f86), steel = C(0x5e4a40);
    const rustU = [C(0x9c5a3e), C(0x93553b)], rustT = C(0x6e4433), rib = C(0x5a3a2c), navy = C(0x1e2a44);
    const L = FS.low, up = FS.up; const yL = L.y0 + L.rows * L.rise, zL = R.lowEnd;          // the lower block's top / back = the cross-aisle
    const zU0 = R.upZ0, yU0 = yL + FS.aisleRise, yUT = yU0 + R.upRows * up.rise, zUB = zU0 + R.upRows * up.tread;
    const yPar = yUT + 1.1, zBk = zUB + 0.6, yFac = yPar + 0.6;
    const zF = zU0 + R.upRows * up.tread * 0.14, zRb = zBk + 1.4;                               // canopy: front edge over the upper block's first third, back over the facade
    // per-station canopy heights: the front edge rises 7.5 m over the facade top, less (dipping) over the last 2.5 stations of each end
    const dip = st.map((s, i) => U.clamp(Math.min(i, NS - 1 - i) / 2.5, 0, 1)); const yFr = dip.map(e => yFac + 3.6 + 3.9 * e), yBk = dip.map(e => yFac + 1.6 + 0.6 * e);
    const CP = (i, z, y) => SP(R, st[i], z, y);
    const ledR = St.ledRegions(A);
    for (let i = 0; i + 1 < NS; i++) {
      const N = nrmOf(R, i), F = [-N[0], 0, -N[2]], UP = [0, 1, 0], DN = [0, -1, 0];
      const ga = Math.min(R.g[i][0], R.g[i + 1][0]) - 0.4, gb = Math.min(R.g[i][1], R.g[i + 1][1]) - 0.4;
      // the field wall with its dark LED band (partner logos), the cap
      loftQ(B, R, i, 0, ga, 0, FS.wallH, concD, F); loftQ(B, R, i, 0, FS.wallH, L.z0, FS.wallH, concL, UP);
      St.stripQ(A, R, i, -0.03, 0.2, FS.wallH - 0.15, ledR[(i + R.half * 2) % ledR.length], F, 8.0);
      // the lower block: risers + grey treads
      for (let r = 0; r < L.rows; r++) { const z = L.z0 + r * L.tread, y = L.y0 + r * L.rise; loftQ(B, R, i, z, y, z, y + L.rise, conc, F); loftQ(B, R, i, z, y + L.rise, z + L.tread, y + L.rise, St.massC(i, r, R.half), UP); }
      // the cross-aisle (walkway) and the wall behind it: concrete with the dark vomitory openings at the odd stations, a cafe-brown band
      loftQ(B, R, i, zL, yL, zU0, yL, concL, UP); loftQ(B, R, i, zU0, yL, zU0, yU0, i % 2 ? dark : conc, F);
      if (i % 2 === 0) loftQ(B, R, i, zU0 - 0.02, yU0 - 0.32, zU0 - 0.02, yU0 - 0.05, cafe, F);
      // the upper block, the top GNP rows a cooler grey-blue at the riser edge
      for (let r = 0; r < R.upRows; r++) { const z = zU0 + r * up.tread, y = yU0 + r * up.rise; loftQ(B, R, i, z, y, z, y + up.rise, r >= R.upRows - 4 ? C(0x8f949a) : conc, F); loftQ(B, R, i, z, y + up.rise, z + up.tread, y + up.rise, r >= R.upRows - 2 ? treadC[r % 2] : St.massC(i, r + 40, R.half), UP); }
      // the top: rear parapet, cap, the outer facade (atlas bays + pilasters) down to the drawn ground
      loftQ(B, R, i, zUB, yUT, zUB, yPar, concD, F); loftQ(B, R, i, zUB, yPar, zBk, yPar, concL, UP);
      { const a = st[i], b = st[i + 1]; const fA = SP(R, a, zBk, 0), fB = SP(R, b, zBk, 0); const yb0 = R.y + gb, yb1 = R.y + yFac; Mx.faceA(A, St.facadeR(A, i), [fA[0], yb0, fA[2]], [fB[0], yb0, fB[2]], [fB[0], yb1, fB[2]], [fA[0], yb1, fA[2]], N, 0, 1, 0, 1); }
      loftQ(B, R, i, zBk - 0.6, yFac, zBk, yFac, concL, UP); loftQ(B, R, i, zBk - 0.6, yPar, zBk - 0.6, yFac, concD, F);
      // under the rake (seen through the vomitories / from the ends): a dark soffit from the cross-aisle to the facade
      loftQ(B, R, i, zU0, 0.6, zBk, yUT - 1.0, C(0x55524c), DN);
      // the canopy: rust underside (two tones), dark top, the front LED fascia (navy, white partner logos), the back edge
      { const a0 = CP(i, zF, yFr[i]), a1 = CP(i + 1, zF, yFr[i + 1]), b1 = CP(i + 1, zRb, yBk[i + 1]), b0 = CP(i, zRb, yBk[i]);
        Mx.face(B, a0, a1, b1, b0, rustU[i % 2], DN); const t0 = [a0[0], a0[1] + 0.55, a0[2]], t1 = [a1[0], a1[1] + 0.55, a1[2]], u1 = [b1[0], b1[1] + 0.45, b1[2]], u0 = [b0[0], b0[1] + 0.45, b0[2]]; Mx.face(B, t0, t1, u1, u0, rustT, UP);
        Mx.face(B, [a0[0], a0[1] - 0.05, a0[2]], [a1[0], a1[1] - 0.05, a1[2]], t1, t0, rustT, F); Mx.face(B, [b0[0], b0[1] - 0.1, b0[2]], [b1[0], b1[1] - 0.1, b1[2]], u1, u0, concD, N);
        // the LED fascia: hung under the front edge (2.3 m), its own navy back
        const f0 = CP(i, zF + 0.15, yFr[i] - 0.1), f1 = CP(i + 1, zF + 0.15, yFr[i + 1] - 0.1); const g0 = [f0[0], f0[1] - 2.3, f0[2]], g1 = [f1[0], f1[1] - 2.3, f1[2]];
        Mx.faceA(A, ledR[(i + 1 + R.half * 2) % ledR.length], St.lr(F, g0, g1)[0], St.lr(F, g0, g1)[1], St.lr(F, f0, f1)[1], St.lr(F, f0, f1)[0], F);
        Mx.face(B, [g0[0], g0[1], g0[2]], [g1[0], g1[1], g1[2]], [f1[0], f1[1], f1[2]], [f0[0], f0[1], f0[2]], navy, N);
        Mx.face(B, [g0[0], g0[1], g0[2]], [g1[0], g1[1], g1[2]], CP(i + 1, zF + 0.45, yFr[i + 1] - 2.3), CP(i, zF + 0.45, yFr[i] - 2.3), navy, DN); }
      // stair aisles at the even stations: concrete strips with coloured nosings (green below the cross-aisle, orange above) + rails
      if (i % 2 === 0 && i > 0) St.aisle(BK, R, i, 1.1, (row) => row.z < zL ? green : orange);
      // field-level white umbrellas (the hospitality 'palcos' along the stands' foot) where the strip in front of the wall is wide enough
      { const a = st[i], b = st[i + 1]; const mx = (a.x + b.x) / 2 - N[0] * 1.7, mz = (a.z + b.z) / 2 - N[2] * 1.7; if (E.fsAt(mx - N[0] * 1.3, mz - N[2] * 1.3) > 1.0 && E.fsAt(mx, mz) > 1.6) { const g = sc.height(mx, mz); const m = Env.frame(mx, g, mz, -N[2], N[0], N[0], N[2]); Fd.beam(m, [0, -0.2, 0], [0, 2.3, 0], 0.07, C(0x9aa0a6)); const r0 = 1.25, yC2 = 2.25, yA = 2.85; const c = [Env.xf(m, -r0, yC2, -r0), Env.xf(m, r0, yC2, -r0), Env.xf(m, r0, yC2, r0), Env.xf(m, -r0, yC2, r0)], ap = Env.xf(m, 0, yA, 0); for (let k = 0; k < 4; k++) { const p = c[k], q = c[(k + 1) % 4]; Mx.tri(Fd, p, q, ap, C(0xd3d5d4), [(p[0] + q[0]) / 2 - ap[0], 1.2, (p[2] + q[2]) / 2 - ap[2]]); } } }
    }
    // the canopy structure: a rib under every station from the back edge to the front, a pylon behind the facade at every second station
    // (from the drawn ground to above the back edge) with a tie to the front edge; secondary purlins (clutter)
    for (let i = 0; i < NS; i++) {
      const s = st[i]; const gB = R.g[i][1];
      S.beam(Mx.I4(), CP(i, zRb - 0.3, yBk[i] - 0.25), CP(i, zF + 0.3, yFr[i] - 0.3), 0.42, rib);
      if (i % 2 === 0) { const zM = zBk + 1.0, top = yBk[i] + 4.5; S.beam(Mx.I4(), SP(R, s, zM, gB - 0.3), SP(R, s, zM, top), 0.8, steel); Fd.beam(Mx.I4(), SP(R, s, zM, top), CP(i, zF + 0.6, yFr[i] + 0.5), 0.12, steel); Fd.beam(Mx.I4(), SP(R, s, zM, top), CP(i, (zF + zRb) / 2, (yFr[i] + yBk[i]) / 2 + 0.5), 0.1, steel); }
      if (i + 1 < NS) for (const f of [0.33, 0.66]) H.beam(Mx.I4(), CP(i, zF + (zRb - zF) * f, yFr[i] + (yBk[i] - yFr[i]) * f - 0.2), CP(i + 1, zF + (zRb - zF) * f, yFr[i + 1] + (yBk[i + 1] - yFr[i + 1]) * f - 0.2), 0.16, rib);
    }
    // end walls: the cross-section down to the ground; the canopy's end fascia; an exposed stair ramp beside each end (photos)
    const prof = [[0, FS.wallH], [L.z0, FS.wallH]]; for (let r = 0; r < L.rows; r++) { const z = L.z0 + r * L.tread, y = L.y0 + (r + 1) * L.rise; prof.push([z, y], [z + L.tread, y]); }
    prof.push([zU0, yL], [zU0, yU0]); for (let r = 0; r < R.upRows; r++) { const z = zU0 + r * up.tread, y = yU0 + (r + 1) * up.rise; prof.push([z, y], [z + up.tread, y]); } prof.push([zUB, yPar], [zBk, yFac]);
    for (const k of [0, 1]) { const ii = k === 0 ? 0 : NS - 1; const s = st[ii]; const gy = Math.min(R.g[ii][0], R.g[ii][1]) - 0.4; const want = endWant(R, k); endWall(B, R, s, prof, gy, facadeD, want);
      Mx.face(B, CP(ii, zF, yFr[ii] - 2.3), CP(ii, zRb, yBk[ii] - 0.1), CP(ii, zRb, yBk[ii] + 0.45), CP(ii, zF, yFr[ii] + 0.55), rustT, want);
      // the stair ramp: a sloped slab + side wall rising from the ground at the front to the cross-aisle, just outside the end wall
      const o = (z, y, d) => { const p = SP(R, s, z, y); return [p[0] + want[0] * d, p[1], p[2] + want[2] * d]; };
      if ([[2, 0.6], [zL, 0.6], [2, 3.0], [zL, 3.0]].some(([z, d]) => { const p = o(z, 0, d); return E.fsAt(p[0], p[2]) < 2.5; })) continue;
      Mx.face(B, o(1.5, gy + 0.4, 0.2), o(1.5, gy + 0.4, 2.8), o(zL, yL, 2.8), o(zL, yL, 0.2), concL, [0, 1, 0]); Mx.face(B, o(1.5, gy, 2.8), o(zL, gy, 2.8), o(zL, yL + 1.1, 2.8), o(1.5, gy + 1.5, 2.8), concD, want);
      Fd.beam(Mx.I4(), o(1.5, gy + 1.5, 2.75), o(zL, yL + 1.1, 2.75), 0.06, C(0x9aa0a6)); }
    // the stadium's name on the outer facade (the long straight run: towards the pit straight / the back straight)
    { let bi = -1, bl = 0; for (let i = 0; i + 4 < NS; i++) { const a = st[i], b = st[i + 4]; const l = Math.hypot(b.x - a.x, b.z - a.z); const straight = Math.abs(a.nx * b.nx + a.nz * b.nz) > 0.995; if (straight && l > bl) { bl = l; bi = i; } }
      if (bi >= 0) { const a = st[bi], b = st[bi + 4]; const N = [(a.nx + b.nx) / 2, 0, (a.nz + b.nz) / 2]; const nr = A.region('mxGNPname', 1024, 80, (x2, w, h) => { x2.fillStyle = '#c4bfb2'; x2.fillRect(0, 0, w, h); Mz.paintText(x2, w, h, 'ESTADIO GNP SEGUROS', { bg: 'rgba(0,0,0,0)', fg: '#1d3d6e', size: 0.66, font: '800 ' }); });
        const zz = zBk + 0.08; const lr = St.lr(N, SP(R, a, zz, yFac - 4.0), SP(R, b, zz, yFac - 4.0)); Mx.faceA(A, nr, lr[0], lr[1], [lr[1][0], R.y + yFac - 1.0, lr[1][2]], [lr[0][0], R.y + yFac - 1.0, lr[0][2]], N); } }
    R.prof = { yFac, zBk, zF, yFr, zRb };
    E.stats.mexico.foroSol = (E.stats.mexico.foroSol || 0) + 1;
  };
  // two points of a sign on a face that faces `want` -> [left, right] as seen by someone in front of it (atlas text reads left to right)
  St.lr = function (want, p, q) { const rx = want[2], rz = -want[0]; return ((q[0] - p[0]) * rx + (q[2] - p[2]) * rz) >= 0 ? [p, q] : [q, p]; };
  // a sign strip along a ribbon gap (z = const, y0 .. y1), centred, at most `wmax` m long, reading left to right from the front
  St.stripQ = function (A, R, i, z, y0, y1, reg, want, wmax) {
    const a = R.st[i], b = R.st[i + 1]; const pa = SP(R, a, z, 0), pb = SP(R, b, z, 0); const len = Math.hypot(pb[0] - pa[0], pb[2] - pa[2]); const w = Math.min(len - 0.3, wmax || 8); if (w < 1.5) return;
    const f0 = 0.5 - w / len / 2, f1 = 0.5 + w / len / 2; const P0 = [pa[0] + (pb[0] - pa[0]) * f0, 0, pa[2] + (pb[2] - pa[2]) * f0], P1 = [pa[0] + (pb[0] - pa[0]) * f1, 0, pa[2] + (pb[2] - pa[2]) * f1];
    const [l, r] = St.lr(want, P0, P1); Mx.faceA(A, reg, [l[0], R.y + y0, l[2]], [r[0], R.y + y0, r[2]], [r[0], R.y + y1, r[2]], [l[0], R.y + y1, l[2]], want);
  };
  // LED strips (dark navy, white partner logos): the F1 partners seen on the stadium (MSC, Salesforce, Heineken, LVMH) + Lumi / Intake
  St.ledRegions = function (A) {
    const ids = ['msccruises', 'salesforce', 'heineken', 'msccruises', 'lvmh', 'L', 'salesforce', 'I'];
    return ids.map((id, k) => A.region('mxLED' + k, 384, 40, (x2, w, h) => {
      const asp = 7.0; x2.save(); x2.scale(w / (h * asp), 1);
      if ((id === 'L' || id === 'I') && EI.Ads && EI.Ads.paintBrandTile) EI.Ads.paintBrandTile(x2, id === 'L' ? 1 : 7, 0, 0, h * asp, h, asp);
      else if (EI.Ads && EI.Ads.partnerBoard) EI.Ads.partnerBoard(x2, id, h * asp, h, { dark: true });
      else Mz.paintText(x2, h * asp, h, id.toUpperCase(), { bg: '#1e2a44', fg: '#e8e8e8', size: 0.6, font: '700 ' });
      x2.restore(); if (id !== 'L' && id !== 'I') { x2.save(); x2.globalCompositeOperation = 'lighten'; x2.fillStyle = '#1e2a44'; x2.fillRect(0, 0, w, h); x2.restore(); }
    }));
  };
  // the outer facade bay (atlas): pale concrete, two rows of arched openings onto the concourses, a pilaster at the bay edge
  St.facadeR = function (A, i) {
    // three concourse levels: deep openings between pilasters, a band at each floor, the section colour stripe on the middle band
    return A.region('mxFacade' + (i % 2), 48, 160, (x2, w, h) => {
      x2.fillStyle = '#c4bfb2'; x2.fillRect(0, 0, w, h); x2.fillStyle = 'rgba(0,0,0,0.05)'; for (let y = 0; y < h; y += 12) x2.fillRect(0, y, w, 1);
      for (const [y0, y1] of [[0.08, 0.27], [0.4, 0.58], [0.7, 0.9]]) { x2.fillStyle = '#34363a'; x2.fillRect(9, h * y0, w - 18, h * (y1 - y0)); x2.fillStyle = '#4a4c50'; x2.fillRect(9, h * y1 - 3, w - 18, 3); x2.fillStyle = 'rgba(160,160,150,0.5)'; x2.fillRect(w / 2 - 1, h * y0, 2, h * (y1 - y0)); }
      x2.fillStyle = '#aaa597'; x2.fillRect(0, 0, 7, h); x2.fillRect(w - 7, 0, 7, h); x2.fillRect(0, h * 0.3, w, 5); x2.fillRect(0, h * 0.62, w, 5); x2.fillRect(0, h * 0.93, w, h * 0.07);
      x2.fillStyle = i % 2 ? '#2f7a4a' : '#d9772b'; x2.fillRect(0, h * 0.34, w, 4);
    });
  };
  // an aisle at station i: a light strip over every tread of the ribbon's decks, a centre handrail (clutter)
  St.aisle = function (BK, R, i, w, noseOf) {
    const { B, F: Fd } = BK; const s = R.st[i]; const prev = R.st[i - 1], next = R.st[i + 1]; let ax = next.x - prev.x, az = next.z - prev.z; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l;
    const P = (z, y, u) => { const p = SP(R, s, z, y); return [p[0] + ax * u, p[1], p[2] + az * u]; };
    const col = C(0xc6c2b8), nose = C(0xd8b23a); const rows = St.rowsOf(R);
    for (const row of rows) { const z0 = row.z, z1 = row.z + row.tr; Mx.face(B, P(z0, row.y + 0.012, -w / 2), P(z0, row.y + 0.012, w / 2), P(z1, row.y + 0.012, w / 2), P(z1, row.y + 0.012, -w / 2), col, [0, 1, 0]); Mx.face(Fd, P(z0, row.y + 0.02, -w / 2), P(z0, row.y + 0.02, w / 2), P(z0 + 0.09, row.y + 0.02, w / 2), P(z0 + 0.09, row.y + 0.02, -w / 2), noseOf ? noseOf(row) : nose, [0, 1, 0]); }
    if (rows.length > 1) { let k0 = 0; for (let k = 1; k <= rows.length; k++) { if (k < rows.length && Math.abs((rows[k].y - rows[k - 1].y) - (rows[1].y - rows[0].y)) < 0.2 && rows[k].z - rows[k - 1].z < 1.0) continue; const a = rows[k0], b = rows[k - 1]; if (k - 1 > k0) Fd.beam(Mx.I4(), P(a.z + 0.3, a.y + 0.95, 0), P(b.z + 0.3, b.y + 0.95, 0), 0.05, C(0x9aa0a6)); k0 = k; } }
  };

  // ---------------------------------------------------------------- the Main Grandstand ribbon
  St.buildMain = function (E, BK, R, tiles) {
    const { B, S, G, F: Fd, H, A } = BK; const st = R.st, NS = st.length;
    const conc = C(0xb3b5b1), concD = C(0x989b9c), concL = C(0xc2c4c1), seat = [C(0x2a4a7a), C(0x24426e)], glass = C(0x2a3846), clad = C(0xa9adb0), steel = C(0x9aa1a8), roofT = C(0x959a9e), roofU = [C(0xb8bcbe), C(0xaeb2b5)];
    const yT = MG.wallH + MG.rows * MG.rise, zT = MG.z0 + MG.rows * MG.tread; const zS = zT + 0.4, ySt = yT + 1.1, ySu = yT + 4.6, zW = zT + 6.0;   // suites box
    const yRf = ySu + 3.6, yRb = ySu + 2.4, zRf = -2.0, zRb = zW + 0.8;
    for (let i = 0; i + 1 < NS; i++) {
      const N = nrmOf(R, i), F = [-N[0], 0, -N[2]], UP = [0, 1, 0], DN = [0, -1, 0];
      const ga = Math.min(R.g[i][0], R.g[i + 1][0]) - 0.4, gb = Math.min(R.g[i][1], R.g[i + 1][1]) - 0.4;
      loftQ(B, R, i, 0, ga, 0, MG.wallH, concD, F); loftQ(B, R, i, 0, MG.wallH, MG.z0, MG.wallH, concL, UP);
      St.stripQ(A, R, i, -0.03, 0.3, 1.3, tiles[(i + 2) % 8], F, 5.0);
      for (let r = 0; r < MG.rows; r++) { const z = MG.z0 + r * MG.tread, y = MG.wallH + r * MG.rise; loftQ(B, R, i, z, y, z, y + MG.rise, conc, F); loftQ(B, R, i, z, y + MG.rise, z + MG.tread, y + MG.rise, (i + r) % 3 ? St.massC(i, r, 7) : seat[r % 2], UP); }
      // the suites box behind the top row: a glazed front, its slab, the back wall to the ground (cladding + a glass band)
      loftQ(B, R, i, zT, yT, zT, ySt, concD, F); loftQ(G, R, i, zS, ySt, zS, ySu, glass, F); loftQ(B, R, i, zT, ySt, zS, ySt, concL, UP); loftQ(B, R, i, zS - 0.4, ySu, zW, ySu + 0.4, clad, F); loftQ(B, R, i, zS - 0.4, ySu + 0.4, zW, ySu + 0.4, C(0x8d9297), UP);
      loftQ(B, R, i, zW, gb, zW, ySu + 0.4, clad, N); loftQ(G, R, i, zW + 0.03, 3.0, zW + 0.03, 5.2, glass, N); loftQ(G, R, i, zW + 0.03, ySt + 0.6, zW + 0.03, ySu - 0.4, glass, N);
      loftQ(B, R, i, MG.z0, MG.wallH, zW, ySt * 0.45, C(0x7d8186), DN);
      // the roof: a flat light-grey deck from over the front row to behind the back wall, a deep fascia with partner tiles, a silver underside
      loftQ(B, R, i, zRf, yRf, zRb, yRb, roofT, UP); loftQ(B, R, i, zRf, yRf - 0.2, zRb, yRb - 0.2, roofU[i % 2], DN); loftQ(B, R, i, zRf, yRf - 1.3, zRf, yRf, C(0x3a3f45), F); loftQ(B, R, i, zRb, yRb - 0.6, zRb, yRb, clad, N);
      St.stripQ(A, R, i, zRf - 0.04, yRf - 1.2, yRf - 0.1, tiles[(i * 5 + 3) % 8], F, 5.5);
      if (i % 2 === 0 && i > 0) St.aisle(BK, R, i, 1.1);
    }
    // masts behind the back wall at every second station, raked over the roof, stays to the front edge; a steel rib under the deck
    for (let i = 0; i < NS; i += 2) { const s = st[i]; const gB = R.g[i][1]; const zM = zW + 2.2;
      S.beam(Mx.I4(), SP(R, s, zM, gB - 0.3), SP(R, s, zM, yRf + 6.5), 0.55, steel); Fd.beam(Mx.I4(), SP(R, s, zM, yRf + 6.5), SP(R, s, zRf + 0.4, yRf + 0.05), 0.08, C(0x7d838a)); Fd.beam(Mx.I4(), SP(R, s, zM, yRf + 6.5), SP(R, s, (zRf + zRb) / 2, yRf - 0.5), 0.07, C(0x7d838a));
      S.beam(Mx.I4(), SP(R, s, zRf + 0.3, yRf - 0.5), SP(R, s, zRb, yRb - 0.5), 0.35, C(0x8f969c)); H.box(Env.frame(...SP(R, s, zRf + 1.4, yRf - 0.9), 1, 0, 0, 1), 0.6, 0.18, 0.35, 0, 0, 0, C(0xfff4dc)); }
    const prof = [[0, MG.wallH], [MG.z0, MG.wallH]]; for (let r = 0; r < MG.rows; r++) { const z = MG.z0 + r * MG.tread, y = MG.wallH + (r + 1) * MG.rise; prof.push([z, y], [z + MG.tread, y]); } prof.push([zT, ySt], [zS - 0.4, ySu], [zW, ySu + 0.4]);
    for (const k of [0, 1]) { const s = k === 0 ? st[0] : st[NS - 1]; const gy = Math.min(R.g[k === 0 ? 0 : NS - 1][0], R.g[k === 0 ? 0 : NS - 1][1]) - 0.4; const want = endWant(R, k); endWall(B, R, s, prof, gy, concD, want); Mx.face(B, SP(R, s, zRf, yRf - 1.3), SP(R, s, zRb, yRb - 0.6), SP(R, s, zRb, yRb), SP(R, s, zRf, yRf), C(0x3a3f45), want); }
    R.prof = { yRf, zRb };
  };

  // ---------------------------------------------------------------- the Harp Helu shell: one deck + white peaked canvas roof modules
  St.buildHarp = function (E, BK, R) {
    const { B, S, F: Fd, H } = BK; const st = R.st, NS = st.length;
    const conc = C(0xb6b2a8), concD = C(0x9b978e), seat = [C(0x9e2a2b), C(0x8c2526)], canvas = C(0xd4d6d6), canvasU = C(0xb9bcbd), steel = C(0x9aa1a8), facade = C(0xb9b4a8);
    const rows = HH.rows, rise = 0.44, tread = 0.82, wallH = 1.8; const yT = wallH + rows * rise, zT = 0.35 + rows * tread, zB = R.depth; const yF = yT + 1.4;
    for (let i = 0; i + 1 < NS; i++) {
      const N = nrmOf(R, i), F = [-N[0], 0, -N[2]], UP = [0, 1, 0], DN = [0, -1, 0]; const ga = Math.min(R.g[i][0], R.g[i + 1][0]) - 0.4, gb = Math.min(R.g[i][1], R.g[i + 1][1]) - 0.4;
      loftQ(B, R, i, 0, ga, 0, wallH, concD, F); loftQ(B, R, i, 0, wallH, 0.35, wallH, conc, UP);
      for (let r = 0; r < rows; r++) { const z = 0.35 + r * tread, y = wallH + r * rise; loftQ(B, R, i, z, y, z, y + rise, conc, F); loftQ(B, R, i, z, y + rise, z + tread, y + rise, seat[r % 2], UP); }
      loftQ(B, R, i, zT, yT, zT, yF, concD, F); loftQ(B, R, i, zT, yF, zB, yF, conc, UP); loftQ(B, R, i, zB, gb, zB, yF, facade, N);
      // the canvas: a pyramid per bay over the back half of the rows (four faces up, the underside), a steel post to the apex
      const a = st[i], b = st[i + 1]; const z0 = zT * 0.45, z1 = zB + 1.0, yb = yF + 5.0, ya = yb + 6.5;
      const c0 = SP(R, a, z0, yb), c1 = SP(R, b, z0, yb), c2 = SP(R, b, z1, yb), c3 = SP(R, a, z1, yb); const mx = (z0 + z1) / 2; const apex = [(c0[0] + c1[0] + c2[0] + c3[0]) / 4, R.y + ya, (c0[2] + c1[2] + c2[2] + c3[2]) / 4];
      for (const [p, q] of [[c0, c1], [c1, c2], [c2, c3], [c3, c0]]) { const m = [(p[0] + q[0]) / 2 - apex[0], 0, (p[2] + q[2]) / 2 - apex[2]]; Mx.tri(B, p, q, apex, canvas, [m[0], 3, m[2]]); Mx.tri(B, p, q, [apex[0], apex[1] - 0.25, apex[2]], canvasU, [-m[0], -3, -m[2]]); }
      S.beam(Mx.I4(), SP(R, a, zB + 0.8, gb - 0.3), SP(R, a, zB + 0.8, yb), 0.5, steel); Fd.beam(Mx.I4(), [apex[0], R.y + yb - 2.5, apex[2]], [apex[0], R.y + ya, apex[2]], 0.18, steel);
      if (i === NS - 2) S.beam(Mx.I4(), SP(R, b, zB + 0.8, gb - 0.3), SP(R, b, zB + 0.8, yb), 0.5, steel);
      Fd.beam(Mx.I4(), SP(R, a, z0, yb), SP(R, a, z0, yT + 0.2 + (z0 / zT) * 0), 0.18, steel);
    }
    const prof = [[0, wallH], [0.35, wallH]]; for (let r = 0; r < rows; r++) { const z = 0.35 + r * tread, y = wallH + (r + 1) * rise; prof.push([z, y], [z + tread, y]); } prof.push([zT, yF], [zB, yF]);
    for (const k of [0, 1]) { const s = k === 0 ? st[0] : st[NS - 1]; const gy = Math.min(R.g[k === 0 ? 0 : NS - 1][0], R.g[k === 0 ? 0 : NS - 1][1]) - 0.4; endWall(B, R, s, prof, gy, concD, endWant(R, k)); }
    // light towers round the field: four lattice masts on the outfield side
    const T = E.mxTowers = E.mxTowers || []; const hp = R.hp; const mid = st[Math.floor(NS / 2)]; const fa = Math.atan2(-mid.nz, -mid.nx);
    for (const da of [-1.1, -0.45, 0.45, 1.1]) { const a = fa + da, rr = 125; const x = hp[0] + Math.cos(a) * rr, z = hp[1] + Math.sin(a) * rr; if (!U.pointInPoly(x, z, E.data.landmarks.harpHelu.p) || E.fsAt(x, z) < 8) continue; T.push({ x, z, h: 38, fx: hp[0] - x, fz: hp[1] - z, kind: 'harp' }); }
  };

  // ---------------------------------------------------------------- light towers (Foro Sol: behind the facades; the Harp Helu outfield)
  St.buildTowers = function (E, BK, res) {
    const { B, S, F: Fd } = BK; const sc = E.sc; const T = E.mxTowers = E.mxTowers || []; const c = E.mxBowlC;
    for (const R of E.mxBowls || []) { const n = R.st.length; const ks = n >= 12 ? [1, n - 2] : []; for (const k of ks) { const s = R.st[k]; const d = (R.prof ? R.prof.zBk : R.depth) + 7; const x = s.x + s.nx * d * s.m, z = s.z + s.nz * d * s.m; if (E.fsAt(x, z) < 6 || Mx.nearPit(E, x, z) < 9) continue; T.push({ x, z, h: 42, fx: c[0] - x, fz: c[1] - z, kind: 'foro' }); } }
    const steel = C(0x7b8189), lamp = C(0xe9e6d8), head = C(0x3a3d42); let n = 0;
    for (const tw of T) {
      const g = Math.min(sc.height(tw.x, tw.z), sc.height(tw.x + 1.5, tw.z + 1.5), sc.height(tw.x - 1.5, tw.z - 1.5)) - 0.3; const l = Math.hypot(tw.fx, tw.fz) || 1; const fx = tw.fx / l, fz = tw.fz / l;
      const m = Env.frame(tw.x, g, tw.z, -fz, fx, fx, fz); const H = tw.h;
      // lattice: four legs tapering 3.2 -> 1.4 m, K-braces (the bracing is clutter)
      const lv = (y) => { const w = (3.2 + (1.4 - 3.2) * y / H) / 2; return [[-w, y, -w], [w, y, -w], [w, y, w], [-w, y, w]]; };
      const A0 = lv(0), A1 = lv(H); for (let k = 0; k < 4; k++) S.beam(m, A0[k], A1[k], 0.32, steel);
      for (let y = 0; y < H - 0.1; y += 3.0) { const a = lv(y), b = lv(Math.min(H, y + 3.0)); for (let k = 0; k < 4; k++) Fd.beam(m, a[k], b[(k + 1) % 4], 0.12, steel); }
      B.box(m, 4.4, 0.8, 4.4, 0, -0.3, 0, C(0x9b978e));
      // the head: a frame of lamp rows facing the field, tilted down
      const hw = 5.0, hh = 4.2, y0 = H - 0.5; B.box(m, hw * 2 + 0.4, 0.35, 1.2, 0, y0, 0.2, head); B.box(m, hw * 2 + 0.4, 0.35, 1.2, 0, y0 + hh, 0.6, head);
      for (const sx of [-hw, hw]) S.beam(m, [sx, y0, 0.2], [sx, y0 + hh, 0.6], 0.25, head);
      B.box(m, hw * 2, hh - 0.35, 0.3, 0, y0 + 0.35, 0.62, head);
      for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) { const x = -hw + 0.9 + k * (2 * hw - 1.8) / 5, y = y0 + 0.75 + r * 1.25, z = 0.765; Mx.face(B, Env.xf(m, x - 0.62, y - 0.5, z + 0.02), Env.xf(m, x + 0.62, y - 0.5, z + 0.02), Env.xf(m, x + 0.62, y + 0.5, z + 0.02), Env.xf(m, x - 0.62, y + 0.5, z + 0.02), lamp, [fx, 0, fz]); }
      n++;
    }
    res.towers = n;
  };

  Mx.lr = St.lr;
  Mx.Stands = St;
})();
