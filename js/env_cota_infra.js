// Equation I - Circuit of the Americas infrastructure (COTA-MODELS):
//  * the OBSERVATION TOWER (OSM landmark `tower`, 77 m): the warm-grey concrete core with the external double-helix stair, the glazed
//    observation deck at 70 m under its roof, and the red VEIL - 18 steel tubes that splay over the amphitheatre stage at the foot, close in
//    round the core on the way up and flare out over the deck (Miro Rivera); one assembly in the main statics (never range-culled: the
//    'main' layer is drawn to the far plane), ~2.5 k tris;
//  * the Germania Insurance Amphitheater stage under the veil (the seating is js/env_cota_stands.js);
//  * the start-line sign gantry (white box truss on grey lattice legs, partner banners) and the timing tower beside the straight;
//  * the pedestrian footbridges at GEN's OSM bridge lines (T3 red, T10 white, T16 blue), stair towers on the drawn ground, >= 7.5 m clearance;
//  * COTALAND (Ferris wheel + coaster + booths, the infield beyond T19/T20), the Super Stage between T11 and T12, the Grand Plaza reflecting
//    pool and flag ring, the Velocity Plaza fan zone behind the Main Grandstand (shade sails, kiosks).
// Legs / walls / towers stand on the drawn ground (sc.height, re-read after the terrain); nothing between the barriers except the gantry /
// footbridge decks.
(function () {
  const Ct = EI.EnvCota; if (!Ct) return;
  const U = EI.U, Env = EI.Env, K = Ct.K, C = Ct.C, Mz = EI.EnvMonza;
  const In = {}; const I4 = () => Env.frame(0, 0, 0, 1, 0, 0, 1);
  const RED = 0xc6261d;

  // ---------------------------------------------------------------- layout: reserve footprints (trees / boards / generic boxes keep off)
  In.layout = function (E) {
    const t = E.t, OCC = Env.OCC, lm = E.data.landmarks || {}; E.ctInfra = { items: [] };
    const reserve = (poly) => { E.markPoly(poly, OCC.BUILT, 1); E.standPolys.push(poly); E.ctOwnPolys.push(poly); };
    const circle = (x, z, r, n) => { const p = []; for (let k = 0; k < (n || 12); k++) { const a = k / (n || 12) * Math.PI * 2; p.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); } return p; };
    if (lm.tower) reserve(circle(lm.tower.x, lm.tower.z, 16));
    // a flat free spot: candidates (x, z) -> the first whose rectangle is free and whose ground varies < maxDh
    const spot = (cands, hl, hd, maxDh, minFs) => {
      for (const [x, z, ax, az] of cands) {
        if (E.fsAt(x, z) < (minFs || 30) || E.rectFree(x, z, ax, az, hl + 2, hd + 2, OCC.BUILT | OCC.ROAD | OCC.WATER) < 0.95) continue;
        let gmin = Infinity, gmax = -Infinity; for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]]) { const g = E.sc.height(x + ax * u * hl - az * v * hd, z + az * u * hl + ax * v * hd); gmin = Math.min(gmin, g); gmax = Math.max(gmax, g); }
        if (gmax - gmin > maxDh) continue; return { cx: x, cz: z, ax, az, hl, hd, y: gmin, gmax };
      }
      return null;
    };
    const inPolyCands = (poly, step, ax, az) => { const out = []; if (!poly) return out; let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, cx = 0, cz = 0; for (const p of poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); cx += p[0]; cz += p[1]; } cx /= poly.length; cz /= poly.length;
      for (let x = x0; x <= x1; x += step) for (let z = z0; z <= z1; z += step) if (U.pointInPoly(x, z, poly)) out.push([x, z, ax, az, Math.hypot(x - cx, z - cz)]); out.sort((a, b) => a[4] - b[4]); return out; };
    // COTALAND: the Ferris wheel (axis across the circuit's view), the coaster loop, a row of booths
    if (lm.cotaland && lm.cotaland.p) {
      let wheel = null; const cands = inPolyCands(lm.cotaland.p, 12, 1, 0).filter(c => { const f = E.fsAt(c[0], c[1]); return f > 45 && f < 240; });
      for (const c of cands) { const pr = {}; t.project(c[0], c[1], null, pr); const ax = t.tx[pr.i], az = t.tz[pr.i]; const s = spot([[c[0], c[1], ax, az]], 12, 8, 2.0, 45); if (s) { wheel = s; break; } }
      if (wheel) { reserve(E.rectPoly(wheel.cx, wheel.cz, wheel.ax, wheel.az, 14, 10)); E.ctInfra.wheel = wheel;
        const coaster = spot(cands.filter(c => Math.hypot(c[0] - wheel.cx, c[1] - wheel.cz) > 55).map(c => [c[0], c[1], wheel.ax, wheel.az]), 30, 14, 3.5, 45); if (coaster) { reserve(E.rectPoly(coaster.cx, coaster.cz, coaster.ax, coaster.az, 32, 16)); E.ctInfra.coaster = coaster; }
        const booths = spot(cands.filter(c => Math.hypot(c[0] - wheel.cx, c[1] - wheel.cz) > 30 && Math.hypot(c[0] - wheel.cx, c[1] - wheel.cz) < 90).map(c => [c[0], c[1], wheel.ax, wheel.az]), 22, 5, 2.0, 40); if (booths) { reserve(E.rectPoly(booths.cx, booths.cz, booths.ax, booths.az, 23, 6)); E.ctInfra.booths = booths; } }
    }
    // the Super Stage: on the infield field between T11 and T12, facing back towards the T11 field (the GA bank there)
    { const s11 = Ct.cs(t, 11); const cands = []; const side = -Ct.outside(t, s11 + 40); for (const ds of [60, 100, 140, 180, 240, 300, 380, 460, 560, 660]) for (const off of [60, 80, 100, 125, 150, 180]) { const i = t.idxAtS(s11 + ds); const p = Ct.at(t, s11 + ds, side, E.wallCap(i, side) + off); cands.push([p.x, p.z, p.tx, p.tz]); }
      const st = spot(cands, 22, 10, 3.5, 45); E.stats.cotaSuperStage = st ? 1 : -cands.length; if (st) { const pr = {}; t.project(st.cx, st.cz, null, pr); let fx = t.x[pr.i] - st.cx, fz = t.z[pr.i] - st.cz; const l = Math.hypot(fx, fz) || 1; st.fx = fx / l; st.fz = fz / l; reserve(E.rectPoly(st.cx, st.cz, st.ax, st.az, 24, 12)); E.ctInfra.superStage = st; } }
    // the Grand Plaza: the reflecting pool and a ring of flag poles on the flattest free part of the plaza
    if (lm.grandPlaza && lm.grandPlaza.p) { const P = lm.grandPlaza.p; let bl = 0, ax = 1, az = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; const l = Math.hypot(q[0] - p[0], q[1] - p[1]); if (l > bl) { bl = l; ax = (q[0] - p[0]) / l; az = (q[1] - p[1]) / l; } }
      const pool = spot(inPolyCands(P, 8, ax, az).map(c => [c[0], c[1], ax, az]), 26, 6, 0.9, 40); if (pool) { reserve(E.rectPoly(pool.cx, pool.cz, ax, az, 28, 8)); E.ctInfra.pool = pool; } }
    // Velocity Plaza: the fan zone behind the Main Grandstand (shade sails over kiosks), 60-110 m behind its front
    { const M = E.ctMain; if (M && M.blocks.length) { const b = M.blocks[Math.floor(M.blocks.length / 2)]; const cands = []; for (const d of [62, 75, 90, 105]) for (const u of [0, -40, 40, -80, 80]) cands.push([b.cx + b.ax * u + b.nx * d, b.cz + b.az * u + b.nz * d, b.ax, b.az]);
      const vp = spot(cands, 30, 10, 2.0, 40); if (vp) { reserve(E.rectPoly(vp.cx, vp.cz, vp.ax, vp.az, 32, 12)); E.ctInfra.plaza = vp; } } }
    // footbridges: GEN's OSM bridge lines (the deck crosses where the line crosses the lap), unless the track data lists its own
    const F = t.data.furniture || {}; let list = F.footbridges ? F.footbridges.map(([s, which]) => ({ s, which })) : (F.bridges && F.bridges.length ? [] : (lm.bridges || []).map(b => ({ s: b.s, turn: b.turn, pts: b.pts })));
    const col = { 3: 0xa8322b, 16: 0x2a5aa8 }; const who = ['lumi', 'intake', 'lumi2', 'intake2'];
    E.ctInfra.bridges = list.map((b, k) => Object.assign({ col: col[b.turn] || 0xc9cdd1, which: b.which || who[k % 4] }, b));
    for (const b of E.ctInfra.bridges) { const i = t.idxAtS(b.s); const q = Ct.at(t, b.s, 1, 0); const wl = t.wallL[i] + 3.0, wr = t.wallR[i] + 3.0; for (const u of [-wl - 2.6, wr + 2.6]) reserve(E.rectPoly(q.x + t.nx[i] * u, q.z + t.nz[i] * u, t.nx[i], t.nz[i], 3.5, 3.5)); }
  };
  In.refit = function (E) {
    const I = E.ctInfra; if (!I) return; const sc = E.sc;
    for (const k of ['wheel', 'coaster', 'booths', 'superStage', 'pool', 'plaza']) { const s = I[k]; if (!s) continue; let gmin = Infinity, gmax = -Infinity; for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]]) { const g = sc.height(s.cx + s.ax * u * s.hl - s.az * v * s.hd, s.cz + s.az * u * s.hl + s.ax * v * s.hd); gmin = Math.min(gmin, g); gmax = Math.max(gmax, g); } s.y = gmin; s.gmax = gmax; }
  };

  In.build = function (E, BK, out) {
    const st = out.infra = {};
    for (const [k, fn] of [['tower', tower], ['stage', stage], ['gantry', startGantry], ['footbridges', footbridges], ['cotaland', cotaland], ['superStage', superStage], ['plazas', plazas]]) { try { st[k] = fn(E, BK); } catch (e) { console.error('EnvCota infra ' + k, e); } }
  };

  // ---------------------------------------------------------------- the Observation Tower
  // core r 3.6 to 70 m (warm grey), the helix stair band at r 4.4 (two flights, 3.5 turns each), the deck (r 9.5, glass rail band, dark
  // glazing, white roof at 76 m with a red rim) and the 18 tubes of the veil, each a polyline in (r, y) around the axis at its own angle
  // round the stage direction; ties between the tubes at the waist; the lift lobby at the foot
  function towerFrame(E) {
    const lm = E.data.landmarks || {}; const tw = lm.tower; if (!tw) return null; const sc = E.sc;
    let g = Infinity; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; g = Math.min(g, sc.height(tw.x + Math.cos(a) * 6, tw.z + Math.sin(a) * 6)); } g = Math.min(g, sc.height(tw.x, tw.z));
    const Am = E.ctAmph; let ang = Am ? Am.ang : 0; if (!Am) { const pr = {}; E.t.project(tw.x, tw.z, null, pr); ang = Math.atan2(tw.z - E.t.z[pr.i], tw.x - E.t.x[pr.i]); }
    return { x: tw.x, z: tw.z, g, ang, H: Math.max(60, tw.h || 76.5) };
  }
  function tower(E, BK) {
    const T = towerFrame(E); if (!T) return 0; const { B, S, G, F: Fd, H } = BK; const sc = E.sc; const I = I4();
    const core = C(0xbfbcb4), coreD = C(0xa5a39c), red = C(RED), redD = C(0x9e1e17), glass = C(0x2a3846), rail = C(0x9cb8c2), roof = C(0xd3d6d8), steel = C(0x8d939a);
    const W = (r, a, y) => [T.x + Math.cos(T.ang + a) * r, T.g + y, T.z + Math.sin(T.ang + a) * r];
    const m = Env.frame(T.x, T.g, T.z, 1, 0, 0, 1); const yD = T.H - 6.5, yRf = T.H - 0.6;
    // core (16 sides, from just below the ground), the lift lobby box at the foot (its door towards the stage)
    for (let k = 0; k < 16; k++) { const a0 = k / 16 * Math.PI * 2, a1 = (k + 1) / 16 * Math.PI * 2; Ct.face(B, W(3.6, a0, -0.6), W(3.6, a1, -0.6), W(3.6, a1, yD), W(3.6, a0, yD), k % 2 ? core : coreD, [Math.cos(T.ang + (a0 + a1) / 2), 0, Math.sin(T.ang + (a0 + a1) / 2)]); }
    { const mm = Env.frame(T.x, T.g, T.z, Math.cos(T.ang), Math.sin(T.ang), -Math.sin(T.ang), Math.cos(T.ang)); B.box(mm, 9, 4.2, 9, -1.5, -0.4, 0, coreD, { top: C(0x8f9397) }); Ct.face(G, Env.xf(mm, 3.02, 0.2, -2), Env.xf(mm, 3.02, 0.2, 2), Env.xf(mm, 3.02, 3.4, 2), Env.xf(mm, 3.02, 3.4, -2), glass, [Math.cos(T.ang), 0, Math.sin(T.ang)]); }
    // the double-helix stair: two thin bands (outer stringer face + the underside) climbing at r 4.0 .. 4.9
    for (const ph of [0, Math.PI]) { const N = 64, turns = 3.5; for (let k = 0; k < N; k++) { const f0 = k / N, f1 = (k + 1) / N; const a0 = ph + f0 * turns * Math.PI * 2, a1 = ph + f1 * turns * Math.PI * 2; const y0 = 4.5 + f0 * (yD - 6), y1 = 4.5 + f1 * (yD - 6);
      const am = (a0 + a1) / 2; const out = [Math.cos(T.ang + am), 0, Math.sin(T.ang + am)];
      Ct.face(S, W(4.7, a0, y0 - 0.1), W(4.7, a1, y1 - 0.1), W(4.7, a1, y1 + 0.55), W(4.7, a0, y0 + 0.55), k % 2 ? C(0xa9aeb3) : C(0x9aa0a6), out);
      Ct.face(S, W(3.6, a0, y0 - 0.1), W(3.6, a1, y1 - 0.1), W(4.7, a1, y1 - 0.1), W(4.7, a0, y0 - 0.1), C(0x7d838a), [0, -1, 0]); } }
    // the observation deck: floor slab, the glass rail band, the glazed room, roof with a red rim
    const seg = 24; for (let k = 0; k < seg; k++) { const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2; const out = [Math.cos(T.ang + (a0 + a1) / 2), 0, Math.sin(T.ang + (a0 + a1) / 2)];
      Ct.face(B, W(3.6, a0, yD), W(3.6, a1, yD), W(9.5, a1, yD), W(9.5, a0, yD), C(0x8d9297), [0, -1, 0]);
      Ct.face(B, W(9.5, a0, yD), W(9.5, a1, yD), W(9.5, a1, yD + 0.6), W(9.5, a0, yD + 0.6), coreD, out);
      Ct.face(G, W(9.45, a0, yD + 0.6), W(9.45, a1, yD + 0.6), W(9.45, a1, yD + 1.7), W(9.45, a0, yD + 1.7), rail, out);
      Ct.face(G, W(7.2, a0, yD + 0.6), W(7.2, a1, yD + 0.6), W(7.6, a1, yRf - 0.6), W(7.6, a0, yRf - 0.6), glass, out);
      Ct.face(B, W(3.6, a0, yRf - 0.6), W(3.6, a1, yRf - 0.6), W(10.5, a1, yRf - 0.2), W(10.5, a0, yRf - 0.2), C(0x8d9297), [0, -1, 0]);
      Ct.face(B, W(3.6, a0, yRf + 0.3), W(3.6, a1, yRf + 0.3), W(10.5, a1, yRf - 0.2), W(10.5, a0, yRf - 0.2), roof, [0, 1, 0]);
      Ct.face(B, W(10.5, a0, yRf - 0.75), W(10.5, a1, yRf - 0.75), W(10.5, a1, yRf - 0.2), W(10.5, a0, yRf - 0.2), red, out); }
    // High only: the deck's rail posts
    for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2; H.beam(I, W(9.4, a, yD + 0.6), W(9.4, a, yD + 1.75), 0.05, C(0x8d939a)); }
    // the veil: 18 tubes; angle k round the stage direction, spread wide at the deck and over the stage, narrow at the waist
    const PY = [T.H + 1.2, T.H - 2.0, yD - 3.0, yD - 14, 44, 33, 25.5, 21.0, 18.6, 17.4], PR = [12.0, 11.6, 9.0, 6.9, 6.2, 6.8, 9.8, 15.5, 22.0, 27.5];
    const SP = [1.0, 1.0, 0.95, 0.8, 0.62, 0.5, 0.46, 0.46, 0.47, 0.48]; const NT = 18, A0 = 1.45;
    const tips = [];
    for (let k = 0; k < NT; k++) {
      const f = (k / (NT - 1)) * 2 - 1; const pts = PY.map((y, j) => { const a = f * A0 * SP[j] + Math.sin(j * 0.55 + k * 0.3) * 0.015; const r = PR[j] * (1 - 0.06 * f * f * (j > 5 ? 1 : 0)); return W(r, a, y); });
      for (let j = 0; j + 1 < pts.length; j++) S.beam(I, pts[j], pts[j + 1], 0.62, k % 2 ? red : C(0xb8231b));
      tips.push(pts);
    }
    // ties: rings across the tubes at the waist and the stage canopy edge (thin, red), the canopy edge beam
    for (const j of [3, 5, 7, 9]) for (let k = 0; k + 1 < NT; k++) (j === 9 ? S : Fd).beam(I, tips[k][j], tips[k + 1][j], j === 9 ? 0.4 : 0.22, redD);
    for (const j of [1, 2]) for (let k = 0; k + 1 < NT; k += 2) H.beam(I, tips[k][j], tips[k + 1][j], 0.18, redD);
    // the veil's deck brackets: struts from the core to the tubes at the waist and the deck (they carry it)
    for (let k = 0; k < NT; k += 3) for (const j of [2, 4]) S.beam(I, W(3.6, (k / (NT - 1) * 2 - 1) * A0 * SP[j], PY[j]), tips[k][j], 0.3, C(0x9e1e17));
    E.stats.cota.tower = { x: Math.round(T.x), z: Math.round(T.z), g: +T.g.toFixed(1), H: T.H };
    return 1;
  }
  // ---- the amphitheatre stage under the veil's canopy: deck 1.6 m, black back wall towards the tower, side PA towers, a lighting truss
  function stage(E, BK) {
    const T = towerFrame(E); if (!T) return 0; const { B, S, F: Fd } = BK; const sc = E.sc; const black = C(0x1b1c1f), deck = C(0x3a3d42), truss = C(0x9aa0a6);
    const ca = Math.cos(T.ang), sa = Math.sin(T.ang); const m = Env.frame(T.x + ca * 13, 0, T.z + sa * 13, -sa, ca, ca, sa);
    const P = (x, y, z) => Env.xf(m, x, y, z); let g = Infinity, gmax = -Infinity; for (const [x, z] of [[-14, -7], [14, -7], [14, 7], [-14, 7], [0, 0]]) { const p = P(x, 0, z); const h = sc.height(p[0], p[2]); g = Math.min(g, h); gmax = Math.max(gmax, h); }
    const m2 = Env.frame(T.x + ca * 13, g, T.z + sa * 13, -sa, ca, ca, sa); const Q = (x, y, z) => Env.xf(m2, x, y, z); const top = gmax - g + 1.6;
    B.box(m2, 28, top + 0.3, 14, 0, -0.3, 0, black, { top: deck });
    B.box(m2, 28, 8 + top, 0.6, 0, -0.3, -7.2, C(0x3a3d42));                    // back wall (towards the tower)
    for (const sx of [-15.5, 15.5]) B.box(m2, 3, 9 + top, 3, sx, -0.3, 4, black);   // PA towers
    for (const z of [-4, 2, 6.5]) Fd.beam(I4(), Q(-14, top + 9, z), Q(14, top + 9, z), 0.35, truss);
    for (const sx of [-14, 14]) for (const z of [-4, 6.5]) Fd.beam(I4(), Q(sx, top, z), Q(sx, top + 9, z), 0.3, truss);
    Ct.face(B, Q(-8, top + 1.5, -6.85), Q(8, top + 1.5, -6.85), Q(8, top + 6.8, -6.85), Q(-8, top + 6.8, -6.85), C(0x15171a), [ca, 0, sa]);
    return 1;
  }

  // ---------------------------------------------------------------- the start-line sign gantry + timing tower
  function startGantry(E, BK) {
    const { B, S, F: Fd, A } = BK; const t = E.t, sc = E.sc; const F = t.data.furniture || {};
    const s = t.sf + (F.startGantry != null ? F.startGantry : 6) + 3.4; const i = t.idxAtS(s);
    const PF = Ct.pitFrame(E); const pside = PF ? PF.side : -1;
    // a cantilever: the truss springs from a twin lattice column beyond the grandstand-side barrier and ends over the pit wall (nothing stands
    // on the pit side: the strip between the pit wall and the lane, and the lane itself, stay clear)
    const dP = (pside < 0 ? t.wallL[i] : t.wallR[i]) - 0.3, dO = (pside < 0 ? t.wallR[i] : t.wallL[i]) + 1.4;
    const A0 = Ct.at(t, s, pside, dP), A1 = Ct.at(t, s, -pside, dO); const ty = A0.y;
    const ux = A1.x - A0.x, uz = A1.z - A0.z, span = Math.hypot(ux, uz), ax = ux / span, az = uz / span; const tx = A0.tx, tz = A0.tz;
    const W = (u, y, v) => [A0.x + ax * u + tx * v, ty + y, A0.z + az * u + tz * v];
    const white = C(0xd9dcdd), grey = C(0x8c9399), navy = C(0x1d2640), I = I4(); const yD = 8.9, dep = 2.2, hw = 0.8;
    { const u = span + 0.9; const hv = 1.6; let g = Infinity; for (const v of [-hv, hv]) for (const du of [-0.5, 0.5]) { const p = W(u + du, 0, v); g = Math.min(g, sc.height(p[0], p[2]) - ty - 0.3); }
      for (const v of [-hv, hv]) for (const du of [-0.5, 0.5]) S.beam(I, W(u + du, g, v), W(u + du, yD + dep, v), 0.2, grey);
      for (let y = g + 1.0; y < yD; y += 1.2) for (const v of [-hv, hv]) Fd.beam(I, W(u - 0.5, y, v), W(u + 0.5, y + 1.2, v), 0.07, grey);
      for (let y = g + 1.0; y < yD; y += 2.4) for (const du of [-0.5, 0.5]) Fd.beam(I, W(u + du, y, -hv), W(u + du, y + 2.4, hv), 0.07, grey);
      // the back stay: a raked strut from the column head down to a footing behind it (it carries the cantilever)
      const ub2 = u + 6.5; const pb = W(ub2, 0, 0); const gb = sc.height(pb[0], pb[2]) - ty - 0.3; for (const v of [-hv, hv]) S.beam(I, W(u + 0.5, yD + dep, v), W(ub2, gb + 0.3, v * 0.6), 0.18, grey);
      B.box(Env.frame(...W(u, 0, 0).map((q, k) => k === 1 ? q + g : q), ax, az, tx, tz), 1.6, 0.6, 4.0, 0, 0, 0, C(0xa9adb0));
      B.box(Env.frame(...W(ub2, 0, 0).map((q, k) => k === 1 ? q + gb : q), ax, az, tx, tz), 1.2, 0.6, 2.6, 0, 0, 0, C(0xa9adb0)); }
    const ua = -0.2, ub = span + 1.4;
    for (const y of [yD, yD + dep]) for (const v of [-hw, hw]) S.beam(I, W(ua, y, v), W(ub, y, v), 0.2, white);
    const nb = Math.max(4, Math.round((ub - ua) / 2.2)), bl = (ub - ua) / nb;
    for (const v of [-hw, hw]) for (let k = 0; k < nb; k++) { const u = ua + k * bl; Fd.beam(I, W(u, yD, v), W(u, yD + dep, v), 0.1, white); Fd.beam(I, W(u, yD, v), W(u + bl, yD + dep, v), 0.08, white); }
    K.dq(B, W(ua, yD - 0.05, -hw), W(ub, yD - 0.05, -hw), W(ub, yD - 0.05, hw), W(ua, yD - 0.05, hw), C(0xc9cccf));
    const r = A.region('ctGantryBanner', 1024, 96, (x2, w, h) => { if (EI.Ads && EI.Ads.paintBanner) EI.Ads.paintBanner(x2, w, h, (ub - ua - 1) / (dep - 0.5)); else Ct.paintCota(x2, w, h, 'CIRCUIT OF THE AMERICAS'); });
    for (const v of [-hw - 0.05, hw + 0.05]) { const a = W(ua + 0.5, yD + 0.25, v), b = W(ub - 0.5, yD + 0.25, v), c = W(ub - 0.5, yD + dep - 0.25, v), d = W(ua + 0.5, yD + dep - 0.25, v); Ct.faceA(A, r, a, b, c, d, [tx * Math.sign(v), 0, tz * Math.sign(v)]); }
    // timing tower beside the outer edge: grey lattice, black screen facing the cars on the approach, a navy cap
    { const u = span + 3.4, v = -6; const p = W(u, 0, v); const g = sc.height(p[0], p[2]) - ty - 0.3; const yT = 10.5;
      for (const [du, dv] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) S.beam(I, W(u + du, g, v + dv), W(u + du, yT, v + dv), 0.12, grey);
      for (let y = g + 1; y < yT - 1; y += 1.3) Fd.beam(I, W(u - 0.5, y, v - 0.5), W(u + 0.5, y + 1.3, v - 0.5), 0.05, grey);
      const sw = 1.9, sh = 3.6, yS = yT - 0.2; B.box(Env.frame(...W(u, yS, v - 0.2), ax, az, tx, tz), sw + 0.3, sh + 0.3, 0.5, 0, 0, 0, C(0x1b1d22));
      B.box(Env.frame(...W(u, yS + sh + 0.3, v - 0.2), ax, az, tx, tz), sw + 0.5, 0.4, 0.7, 0, 0, 0, navy);
      const sr = A.region('ctTiming', 96, 192, (x2, w, h) => { x2.fillStyle = '#0b0c0e'; x2.fillRect(0, 0, w, h); x2.font = '700 18px Arial'; x2.textAlign = 'left'; ['1 VER', '2 NOR', '3 LEC', '4 RUS', '5 HAM', '6 PIA', '7 ANT', '8 ALB'].forEach((q, k) => { x2.fillStyle = k ? '#e8e8e8' : '#ffd200'; x2.fillText(q, 8, 22 + k * 21); }); });
      const vv = v - 0.48; Ct.faceA(A, sr, W(u - sw / 2, yS + 0.15, vv), W(u + sw / 2, yS + 0.15, vv), W(u + sw / 2, yS + 0.15 + sh, vv), W(u - sw / 2, yS + 0.15 + sh, vv), [-tx, 0, -tz]); }
    return { s: +s.toFixed(1), span: +span.toFixed(1) };
  }

  // ---------------------------------------------------------------- pedestrian footbridges (stair towers + box truss + partner panels)
  function footbridges(E, BK) { let n = 0; for (const b of (E.ctInfra && E.ctInfra.bridges) || []) if (footbridge(E, BK, b)) n++; return n; }
  function footbridge(E, BK, br) {
    const t = E.t, sc = E.sc, { B, S, F: Fd, A } = BK; const s = br.s; const i = t.idxAtS(s); const q = Ct.at(t, s, 1, 0);
    const wl = t.wallL[i] + 3.0, wr = t.wallR[i] + 3.0; const I = I4();
    // the deck level: >= 7.6 m over the road everywhere under it (the lap may be cross-sloped / climbing here)
    const W0 = (u, v) => [q.x + t.nx[i] * u + q.tx * v, q.z + t.nz[i] * u + q.tz * v];
    let yRoad = q.y; for (let u = -wl; u <= wr; u += 2) { const p = W0(u, 0); yRoad = Math.max(yRoad, sc.height(p[0], p[1])); }
    const y0 = yRoad; const W = (u, y, v) => [q.x + t.nx[i] * u + q.tx * v, y0 + y, q.z + t.nz[i] * u + q.tz * v];
    const yD = 7.6, dep = 2.6, hw = 1.4; const ua = -wl, ub = wr; const main = C(br.col), mainD = C(br.col).multiplyScalar(0.78), cl = C(0x9ea4a9), clD = C(0x7b8187);
    for (const uc of [ua - 2.6, ub + 2.6]) {
      let gm = Infinity; for (const [du, dv] of [[-2.5, -2.5], [2.5, -2.5], [2.5, 2.5], [-2.5, 2.5], [0, 0]]) { const p = W(uc + du, 0, dv); gm = Math.min(gm, sc.height(p[0], p[2]) - y0); }
      if (yD - gm > 30) return false;
      const Ht = yD + dep + 0.6;
      for (const [p0, p1] of [[[-2.5, -2.5], [2.5, -2.5]], [[2.5, -2.5], [2.5, 2.5]], [[2.5, 2.5], [-2.5, 2.5]], [[-2.5, 2.5], [-2.5, -2.5]]]) {
        let k = 0; for (let y = gm - 0.4; y < Ht - 0.01; y += 1.0, k++) K.dq(B, W(uc + p0[0], y, p0[1]), W(uc + p1[0], y, p1[1]), W(uc + p1[0], Math.min(Ht, y + 1.0), p1[1]), W(uc + p0[0], Math.min(Ht, y + 1.0), p0[1]), k % 2 ? cl : clD);
      }
      K.dq(B, W(uc - 2.7, Ht, -2.7), W(uc + 2.7, Ht, -2.7), W(uc + 2.7, Ht, 2.7), W(uc - 2.7, Ht, 2.7), main);
    }
    K.dq(B, W(ua, yD, -hw), W(ub, yD, -hw), W(ub, yD, hw), W(ua, yD, hw), C(0x2b2f35)); K.dq(B, W(ua, yD + dep, -hw), W(ub, yD + dep, -hw), W(ub, yD + dep, hw), W(ua, yD + dep, hw), main);
    const span = ub - ua, nb = Math.max(4, Math.round(span / 3.2)), bl = span / nb;
    for (const v of [-hw, hw]) { S.beam(I, W(ua, yD, v), W(ub, yD, v), 0.3, main); S.beam(I, W(ua, yD + dep, v), W(ub, yD + dep, v), 0.3, main); for (let k = 0; k <= nb; k++) Fd.beam(I, W(ua + k * bl, yD, v), W(ua + k * bl, yD + dep, v), 0.14, mainD); for (let k = 0; k < nb; k++) Fd.beam(I, W(ua + k * bl, yD, v), W(ua + (k + 1) * bl, yD + dep, v), 0.1, mainD); }
    const r = A.region('ctBridge_' + br.which, 1024, 96, (x2, w, h) => { if (EI.Ads && EI.Ads.paintBridge) { x2.fillStyle = '#ffffff'; x2.fillRect(0, 0, w, h); EI.Ads.paintBridge(x2, br.which, w, h, (span - 1) / (dep - 0.6)); } else Mz.paintText(x2, w, h, 'trylumi.co', { bg: '#1b1530', fg: '#ffffff' }); });
    for (const v of [-hw - 0.04, hw + 0.04]) Ct.faceA(A, r, W(ua + 0.5, yD + 0.35, v), W(ub - 0.5, yD + 0.35, v), W(ub - 0.5, yD + dep - 0.35, v), W(ua + 0.5, yD + dep - 0.35, v), [q.tx * Math.sign(v), 0, q.tz * Math.sign(v)]);
    return true;
  }

  // ---------------------------------------------------------------- COTALAND: Ferris wheel, coaster loop, booths
  function cotaland(E, BK) {
    const I = E.ctInfra; if (!I || !I.wheel) return 0; const { B, S, F: Fd, H } = BK; const Wh = I.wheel; const sc = E.sc; const I0 = I4();
    const m = Env.frame(Wh.cx, Wh.y, Wh.cz, Wh.ax, Wh.az, -Wh.az, Wh.ax); const P = (x, y, z) => Env.xf(m, x, y, z); const lift = Wh.gmax - Wh.y;
    const R = 16, yc = R + 3.5 + lift, white = C(0xd9dcdd), red = C(0xc8102e), blue = C(0x2a5aa8), yellow = C(0xe8c21c), steel = C(0x9aa0a6);
    const N = 24; for (const z of [-1.4, 1.4]) for (let k = 0; k < N; k++) { const a0 = k / N * Math.PI * 2, a1 = (k + 1) / N * Math.PI * 2; S.beam(I0, P(Math.cos(a0) * R, yc + Math.sin(a0) * R, z), P(Math.cos(a1) * R, yc + Math.sin(a1) * R, z), 0.35, white); if (k % 2 === 0) Fd.beam(I0, P(0, yc, z), P(Math.cos(a0) * R, yc + Math.sin(a0) * R, z), 0.1, white); }
    for (const z of [-3.2, 3.2]) for (const x of [-8, 8]) S.beam(I0, P(x, -0.3, z), P(0, yc, Math.sign(z) * 1.6), 0.5, steel);
    S.beam(I0, P(0, yc, -1.8), P(0, yc, 1.8), 0.9, steel);
    const cols = [red, blue, yellow, white]; for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; const p = P(Math.cos(a) * R, yc + Math.sin(a) * R - 1.6, 0); B.box(Env.frame(p[0], p[1], p[2], Wh.ax, Wh.az, -Wh.az, Wh.ax), 1.8, 1.6, 2.2, 0, 0, 0, cols[k % 4]); }
    B.box(m, 10, 0.6 + lift, 8, 0, -0.3, 6.5, C(0x8f9397)); B.box(m, 4, 3 + lift, 3, -7, -0.3, 6.5, white, { top: red });
    let n = 1;
    if (I.coaster) { const Cq = I.coaster; const m2 = Env.frame(Cq.cx, Cq.y, Cq.cz, Cq.ax, Cq.az, -Cq.az, Cq.ax); const Q = (x, y, z) => Env.xf(m2, x, y, z); const lift2 = Cq.gmax - Cq.y;
      const pts = []; const M = 36; for (let k = 0; k <= M; k++) { const a = k / M * Math.PI * 2; const x = Math.cos(a) * 26, z = Math.sin(a) * 11 + Math.sin(a * 3) * 2; const y = lift2 + 6 + 8 * Math.max(0, Math.sin(a + 0.6)) + 4 * Math.max(0, Math.sin(2 * a - 1)); pts.push([x, y, z]); }
      for (let k = 0; k < M; k++) { S.beam(I0, Q(...pts[k]), Q(...pts[k + 1]), 0.45, C(0x2a5aa8)); if (k % 3 === 0) { const [x, y, z] = pts[k]; const gp = Q(x, 0, z); const g = sc.height(gp[0], gp[2]) - Cq.y; Fd.beam(I0, Q(x, g - 0.3, z), Q(x, y, z), 0.25, white); } }
      for (let k = 0; k < M; k += 6) { const [x, y, z] = pts[k]; const gp = Q(x, 0, z); const g = sc.height(gp[0], gp[2]) - Cq.y; S.beam(I0, Q(x, g - 0.3, z), Q(x, y, z), 0.4, white); }
      n++; }
    if (I.booths) { const Bo = I.booths; const m3 = Env.frame(Bo.cx, Bo.y, Bo.cz, Bo.ax, Bo.az, -Bo.az, Bo.ax); const lift3 = Bo.gmax - Bo.y; const tops = [red, white, blue, yellow];
      for (let k = 0; k < 7; k++) { const x = -19 + k * 6.3; B.box(m3, 5, 2.8 + lift3, 4, x, -0.3, 0, white, { top: tops[k % 4] }); Ct.face(B, Env.xf(m3, x - 2.7, 2.5 + lift3, -2.5), Env.xf(m3, x + 2.7, 2.5 + lift3, -2.5), Env.xf(m3, x + 2.7, 3.4 + lift3, 0), Env.xf(m3, x - 2.7, 3.4 + lift3, 0), tops[k % 4], [0, 1, 0]); }
      n++; }
    return n;
  }
  // ---------------------------------------------------------------- the Super Stage: black stage box, truss towers + roof, a screen
  function superStage(E, BK) {
    const I = E.ctInfra; const St0 = I && I.superStage; if (!St0) return 0; const { B, S, F: Fd } = BK; const I0 = I4();
    // frame: x along the stage front, z from the front backwards (away from the field / track)
    const m = Env.frame(St0.cx, St0.y, St0.cz, St0.fz, -St0.fx, -St0.fx, -St0.fz); const P = (x, y, z) => Env.xf(m, x, y, z); const lift = St0.gmax - St0.y;
    const black = C(0x1b1c1f), truss = C(0x9aa0a6), roof = C(0x2b2e33);
    B.box(m, 36, 2.2 + lift, 16, 0, -0.3, 8, black, { top: C(0x3a3d42) }); B.box(m, 36, 18 + lift, 0.6, 0, -0.3, 16, black);
    for (const x of [-18, 18]) for (const z of [0.5, 15.5]) S.beam(I0, P(x, -0.3, z), P(x, 19 + lift, z), 0.8, truss);
    B.box(m, 38, 1.4, 17, 0, 19 + lift, 8, roof, { bottom: true });
    for (const x of [-18, 18]) Fd.beam(I0, P(x, 19 + lift, 0.5), P(x, 19 + lift, 15.5), 0.6, truss);
    for (const sx of [-1, 1]) { B.box(m, 9, 6, 0.4, sx * 24, 6 + lift, 3, black); S.beam(I0, P(sx * 24, -0.3, 3.3), P(sx * 24, 6 + lift, 3.3), 0.5, truss); }
    return 1;
  }
  // ---------------------------------------------------------------- the Grand Plaza pool + flag ring, the Velocity Plaza shade sails
  function plazas(E, BK) {
    const I = E.ctInfra; if (!I) return 0; const { B, S, F: Fd, A } = BK; let n = 0; const I0 = I4();
    if (I.pool) { const Pq = I.pool; const m = Env.frame(Pq.cx, Pq.y, Pq.cz, Pq.ax, Pq.az, -Pq.az, Pq.ax); const P = (x, y, z) => Env.xf(m, x, y, z); const h = Pq.gmax - Pq.y + 0.25;
      B.box(m, Pq.hl * 2, h + 0.2, Pq.hd * 2, 0, -0.2, 0, C(0xb9b5aa), { top: C(0xc4c0b5) });
      Ct.face(B, P(-Pq.hl + 0.5, h + 0.02, -Pq.hd + 0.5), P(Pq.hl - 0.5, h + 0.02, -Pq.hd + 0.5), P(Pq.hl - 0.5, h + 0.02, Pq.hd - 0.5), P(-Pq.hl + 0.5, h + 0.02, Pq.hd - 0.5), C(0x2f4a5c), [0, 1, 0]);
      const fl = Ct.flagRegions(A); for (let k = 0; k < 10; k++) { const x = -Pq.hl + 1 + k * (Pq.hl * 2 - 2) / 9; for (const sz of [-1, 1]) { if ((k + (sz > 0 ? 1 : 0)) % 2) continue; const base = P(x, 0, sz * (Pq.hd + 2)); const g = E.sc.height(base[0], base[2]); Fd.beam(I0, [base[0], g - 0.3, base[2]], [base[0], g + 9, base[2]], 0.12, C(0xc9cdd1)); if (Mz.Stands && Mz.Stands.flag) Mz.Stands.flag(A, fl[k % 2], [base[0], g + 8.9, base[2]], Math.atan2(Pq.ax, Pq.az) - Math.PI / 2, 2.4, 1.6); } }
      n++; }
    if (I.plaza) { const Vp = I.plaza; const m = Env.frame(Vp.cx, Vp.y, Vp.cz, Vp.ax, Vp.az, -Vp.az, Vp.ax); const P = (x, y, z) => Env.xf(m, x, y, z); const lift = Vp.gmax - Vp.y; const sails = [C(0xd9dcdd), C(0xc8102e), C(0x1d2640)];
      for (let k = 0; k < 5; k++) { const x = -24 + k * 12; const sc0 = sails[k % 3];
        for (const [px, pz, ph] of [[-5, -5, 5.5], [5, -5, 4.2], [5, 5, 5.5], [-5, 5, 4.2]]) S.beam(I0, P(x + px, -0.3, pz), P(x + px, ph + lift, pz), 0.18, C(0x9aa0a6));
        Ct.face(B, P(x - 5, 5.5 + lift, -5), P(x + 5, 4.2 + lift, -5), P(x + 5, 5.5 + lift, 5), P(x - 5, 4.2 + lift, 5), sc0, [0, 1, 0]); Ct.face(B, P(x - 5, 5.5 + lift, -5), P(x + 5, 4.2 + lift, -5), P(x + 5, 5.5 + lift, 5), P(x - 5, 4.2 + lift, 5), sc0, [0, -1, 0]);
        B.box(m, 4, 2.6 + lift, 2.5, x, -0.3, (k % 2 ? 1 : -1) * 2, C(0xcfd2d4), { top: C(0x8f9397) }); }
      n++; }
    return n;
  }

  Ct.Infra = In;
})();
