// Equation I - Spa-Francorchamps infrastructure (SPA-MODELS): the white start-line sign gantry and the timing tower beside it
// (bus_stop_ing_gantry_timing_lines_straight - this is the pit straight), the Raidillon marshal / observation tower (raidillon_wet_marshal_
// tower_redwhite_barrier_conifers) and the TV camera platform at the crest, the Speaker's Corner PA / TV mast, the pedestrian footbridges
// (stair towers + truss + partner panels) where the track data has no sponsor bridge of its own, and the concrete culvert headwalls where the
// streams (the Eau Rouge) pass under the circuit. Legs / walls / towers stand on the drawn ground (sc.height); nothing between the barriers
// except the gantry / footbridge decks (>= 7.5 m of clearance).
(function () {
  const Sp = EI.EnvSpa; if (!Sp) return;
  const U = EI.U, Env = EI.Env, K = Sp.K, C = Sp.C, Mz = EI.EnvMonza;
  const In = {}; const I4 = () => Env.frame(0, 0, 0, 1, 0, 0, 1);

  // footprints are reserved at layout so trees / boards keep off them
  In.layout = function (E) {
    const t = E.t, OCC = Env.OCC; E.spInfra = [];
    const put = (kind, s, side, off, hl, hd, extra) => { const i = t.idxAtS(s); const d = E.wallCap(i, side) + off; const p = Sp.at(t, s, side, d); if (E.fsAt(p.x, p.z) < 0.5) return null;
      const poly = E.markRect(p.x, p.z, p.tx, p.tz, hl, hd, OCC.BUILT); E.standPolys.push(poly); const o = Object.assign({ kind, s, side, d, p }, extra || {}); E.spInfra.push(o); return o; };
    const s3 = Sp.cs(t, 3), s4 = Sp.cs(t, 4), s9 = Sp.cs(t, 9);
    put('marshalTower', s3 + 45, Sp.outside(t, s3), 3.2, 2.5, 2.5);
    put('camPlatform', s4 + 18, -Sp.outside(t, s4 + 18), 3.0, 2, 2);
    put('paMast', s9 + 25, Sp.outside(t, s9), 4.0, 1.5, 1.5);
  };

  In.build = function (E, BK, out) {
    const st = out.infra = {};
    for (const [k, fn] of [['gantry', startGantry], ['towers', towers], ['footbridges', footbridges], ['culverts', culverts]]) { try { st[k] = fn(E, BK); } catch (e) { console.error('EnvSpa infra ' + k, e); } }
  };

  // ---- the start-line sign gantry: a full-width WHITE box truss on two grey lattice legs beyond the barriers (the pit side leg on the
  // pit-wall strip), partner banner panels on both faces, just past js/track.js's start-light bar (lamps stay there: they change colour);
  // the black timing screen on a grey lattice tower beside the outer edge (the pit side has no room: the lane is right behind the wall)
  function startGantry(E, BK) {
    const { B, S, F: Fd, A } = BK; const t = E.t, sc = E.sc; const F = t.data.furniture || {};
    const s = t.sf + (F.startGantry != null ? F.startGantry : 6) + 3.4; const i = t.idxAtS(s);
    const PF = Sp.pitFrame(E); const pside = PF ? PF.side : -1;
    const dP = (pside < 0 ? t.wallL[i] : t.wallR[i]) + 0.05, dO = (pside < 0 ? t.wallR[i] : t.wallL[i]) + 1.4;   // the pit-side leg stands ON the pit wall (the lane is right behind it)
    const A0 = Sp.at(t, s, pside, dP), A1 = Sp.at(t, s, -pside, dO); const ty = A0.y;
    const ux = A1.x - A0.x, uz = A1.z - A0.z, span = Math.hypot(ux, uz), ax = ux / span, az = uz / span; const tx = A0.tx, tz = A0.tz;
    const W = (u, y, v) => [A0.x + ax * u + tx * v, ty + y, A0.z + az * u + tz * v];
    // (SPA-UPGRADE) graphite truss: the 2022+ gantry is a red title-partner box (spa_main_straight_moet_board_cars)
    const white = C(0x5b6066), grey = C(0x8c9399), I = I4(); const yD = 8.9, dep = 2.2, hw = 0.8;
    // legs: twin lattice columns per side down to the drawn ground
    for (const [u, sg] of [[-0.45, -1], [span + 0.6, 1]]) {
      const g = sc.height(...[W(u, 0, 0)[0], W(u, 0, 0)[2]]) - ty - 0.3;
      for (const v of [-hw, hw]) for (const du of [-0.35, 0.35]) S.beam(I, W(u + du, g, v), W(u + du, yD + dep, v), 0.16, grey);
      for (let y = g + 1.0; y < yD; y += 1.2) for (const v of [-hw, hw]) Fd.beam(I, W(u - 0.35, y, v), W(u + 0.35, y + 1.2, v), 0.06, grey);
      B.box(Env.frame(...W(u, 0, 0).map((q, k) => k === 1 ? q + g : q), ax, az, tx, tz), 1.0, 0.6, 2.2, 0, 0, 0, C(0xa9adb0));   // footing
    }
    // the white box truss: four chords, verticals and diagonals on both faces, a deck
    const ua = -1.0, ub = span + 1.2;
    for (const y of [yD, yD + dep]) for (const v of [-hw, hw]) S.beam(I, W(ua, y, v), W(ub, y, v), 0.2, white);
    const nb = Math.max(4, Math.round((ub - ua) / 2.2)), bl = (ub - ua) / nb;
    for (const v of [-hw, hw]) for (let k = 0; k < nb; k++) { const u = ua + k * bl; Fd.beam(I, W(u, yD, v), W(u, yD + dep, v), 0.1, white); Fd.beam(I, W(u, yD, v), W(u + bl, yD + dep, v), 0.08, white); }
    K.dq(B, W(ua, yD - 0.05, -hw), W(ub, yD - 0.05, -hw), W(ub, yD - 0.05, hw), W(ua, yD - 0.05, hw), C(0xd9dcde));
    // partner panels on both faces (EI.Ads start banner)
    // the faces carry the event title partner's board (VENUES.spa.bridge.intake2 = Moet & Chandon: red, white serif wordmark), as in the photos
    const r = A.region('spGantryBanner', 1024, 96, (x2, w, h) => { if (EI.Ads && EI.Ads.paintBridge) EI.Ads.paintBridge(x2, 'intake2', w, h, (ub - ua - 1) / (dep - 0.5)); else if (EI.Ads && EI.Ads.paintBanner) EI.Ads.paintBanner(x2, w, h, (ub - ua - 1) / (dep - 0.5)); else Mz.paintText(x2, w, h, 'SPA-FRANCORCHAMPS', { bg: '#ffffff', fg: '#111' }); });
    for (const v of [-hw - 0.05, hw + 0.05]) { const a = W(ua + 0.5, yD + 0.25, v), b = W(ub - 0.5, yD + 0.25, v), c = W(ub - 0.5, yD + dep - 0.25, v), d = W(ua + 0.5, yD + dep - 0.25, v); const want = [tx * Math.sign(v), 0, tz * Math.sign(v)];
      // read left -> right from the side it faces
      Sp.faceA(A, r, a, b, c, d, want); }
    // timing tower beside the outer edge: grey lattice, black screen facing the cars on the approach
    { const u = span + 3.4, v = -6; const p = W(u, 0, v); const g = sc.height(p[0], p[2]) - ty - 0.3; const yT = 10.5;
      for (const [du, dv] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) S.beam(I, W(u + du, g, v + dv), W(u + du, yT, v + dv), 0.12, grey);
      for (let y = g + 1; y < yT - 1; y += 1.3) Fd.beam(I, W(u - 0.5, y, v - 0.5), W(u + 0.5, y + 1.3, v - 0.5), 0.05, grey);
      const sw = 1.9, sh = 3.6, yS = yT - 0.2; B.box(Env.frame(...W(u, yS, v - 0.2), ax, az, tx, tz), sw + 0.3, sh + 0.3, 0.5, 0, 0, 0, C(0x1b1d22));
      const sr = A.region('spTiming', 96, 192, (x2, w, h) => { x2.fillStyle = '#0b0c0e'; x2.fillRect(0, 0, w, h); x2.font = '700 18px Arial'; x2.textAlign = 'left'; const rowsT = ['1 ANT', '2 RUS', '3 VER', '4 NOR', '5 LEC', '6 PIA', '7 HAM', '8 ALB']; rowsT.forEach((q, k) => { x2.fillStyle = k ? '#e8e8e8' : '#ffd200'; x2.fillText(q, 8, 22 + k * 21); }); });
      const vv = v - 0.48; Sp.faceA(A, sr, W(u - sw / 2, yS + 0.15, vv), W(u + sw / 2, yS + 0.15, vv), W(u + sw / 2, yS + 0.15 + sh, vv), W(u - sw / 2, yS + 0.15 + sh, vv), [-tx, 0, -tz]); }
    return { s: +s.toFixed(1), span: +span.toFixed(1) };
  }

  // ---- towers: Raidillon marshal / observation tower, the crest camera platform, the Speaker's Corner PA / TV mast
  function towers(E, BK) {
    const { B, S, G, F: Fd } = BK; const sc = E.sc; let n = 0; const I = I4();
    for (const o of E.spInfra || []) {
      const p = o.p, g = sc.height(p.x, p.z); const m = Env.frame(p.x, g, p.z, p.tx, p.tz, p.nx, p.nz); const P = (x, y, z) => Env.xf(m, x, y, z);
      let gmin = Infinity; for (const [x, z] of [[-1.6, -1.6], [1.6, -1.6], [1.6, 1.6], [-1.6, 1.6]]) { const q = P(x, 0, z); gmin = Math.min(gmin, sc.height(q[0], q[2]) - g); }
      if (o.kind === 'marshalTower') {
        const grey = C(0x8d939a), cab = C(0xa9aeb3), white = C(0xf2f3f1), yC = 6.0;
        for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [1.3, 1.3], [-1.3, 1.3]]) S.beam(m, [x, gmin - 0.3, z], [x, yC, z], 0.22, grey);
        for (let y = gmin + 1.2; y < yC - 0.5; y += 1.6) for (const [a, b] of [[[-1.3, -1.3], [1.3, -1.3]], [[1.3, -1.3], [1.3, 1.3]], [[1.3, 1.3], [-1.3, 1.3]], [[-1.3, 1.3], [-1.3, -1.3]]]) Fd.beam(m, [a[0], y, a[1]], [b[0], y + 1.6, b[1]], 0.07, grey);
        B.box(m, 3.4, 0.25, 3.4, 0, yC, 0, grey, { bottom: true }); B.box(m, 3.2, 1.0, 3.2, 0, yC + 0.25, 0, cab);
        for (const z of [-1.62, 1.62]) K.dq(G, P(-1.5, yC + 1.25, z), P(1.5, yC + 1.25, z), P(1.5, yC + 2.4, z), P(-1.5, yC + 2.4, z), C(0x33424e));
        for (const x of [-1.62, 1.62]) K.dq(G, P(x, yC + 1.25, -1.5), P(x, yC + 1.25, 1.5), P(x, yC + 2.4, 1.5), P(x, yC + 2.4, -1.5), C(0x33424e));
        for (const [x, z] of [[-1.55, -1.55], [1.55, -1.55], [1.55, 1.55], [-1.55, 1.55]]) S.beam(m, [x, yC + 1.2, z], [x, yC + 2.5, z], 0.12, cab);
        B.box(m, 4.2, 0.3, 4.2, 0, yC + 2.5, 0, white, { bottom: true });
        for (let y = gmin; y < yC; y += 0.35) Fd.box(m, 0.9, 0.06, 0.28, 1.95, y, -1.0 + (y - gmin) / yC * 2.2, C(0x6d737a));   // the stair
        n++;
      } else if (o.kind === 'camPlatform') {
        const tube = C(0xa3a8ae), H = 5.2;
        for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [1.2, 1.2], [-1.2, 1.2]]) S.beam(m, [x, gmin - 0.2, z], [x, H + 1.1, z], 0.09, tube);
        for (let y = gmin + 0.8; y < H; y += 1.4) { Fd.beam(m, [-1.2, y, -1.2], [1.2, y + 1.4, -1.2], 0.05, tube); Fd.beam(m, [-1.2, y, 1.2], [1.2, y + 1.4, 1.2], 0.05, tube); }
        B.box(m, 2.8, 0.1, 2.8, 0, H, 0, C(0x8a6d4a), { bottom: true });
        for (const y of [H + 0.55, H + 1.05]) { Fd.beam(m, [-1.2, y, -1.2], [1.2, y, -1.2], 0.04, tube); Fd.beam(m, [-1.2, y, -1.2], [-1.2, y, 1.2], 0.04, tube); Fd.beam(m, [1.2, y, -1.2], [1.2, y, 1.2], 0.04, tube); }
        B.box(m, 0.35, 0.36, 0.7, 0, H + 1.35, -0.4, C(0x1a1b1e)); S.beam(m, [0.6, H, 0.6], [0.6, H + 2.6, 0.6], 0.04, C(0x2a2d31)); K.cyl(B, m, 0.6, 0.6, H + 2.55, 0.12, 1.2, 8, C(0xc8102e), C(0xc8102e));
        n++;
      } else if (o.kind === 'paMast') {
        K.lattice(S, m, 0, 0, gmin - 0.3, 14, 1.2, 0.5, C(0xb9bec4), 0.09);
        for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; S.box(m, 0.5, 0.7, 0.35, Math.cos(a) * 0.5, 12.6, Math.sin(a) * 0.5, C(0xdfe2e4)); }
        B.box(m, 1.6, 2.2, 1.2, 0, gmin - 0.2, 1.6, C(0xd8d9d6));
        n++;
      }
    }
    return n;
  }

  // ---- pedestrian footbridges (stair towers clad in grey ribbed panels + a box truss with partner panels) at the Kemmel straight and on the
  // run to Blanchimont - only where the track data has no sponsor bridge of its own within 40 m (SPA-DRESS / GEN own data.furniture.bridges)
  function footbridges(E, BK) {
    // positions: data.furniture.footbridges ([s, partner]) when SPA-DRESS lists them; while the data still asks js/track.js for its own
    // sponsor box bridges (furniture.bridges) none are built here (no doubles); otherwise the Kemmel / Blanchimont defaults
    const t = E.t, F = t.data.furniture || {}; let list = F.footbridges;
    if (!list) list = (F.bridges && F.bridges.length) ? [] : [[Sp.cs(t, 4) + 580, 'lumi'], [Sp.cs(t, 15) + 460, 'intake']];
    let n = 0; for (const [s, which] of list) if (footbridge(E, BK, s, which || 'lumi')) n++;
    return n;
  }
  function footbridge(E, BK, s, which) {
    const t = E.t, sc = E.sc, { B, S, F: Fd, A } = BK; const i = t.idxAtS(s); const q = Sp.at(t, s, 1, 0);
    const wl = t.wallL[i] + 3.0, wr = t.wallR[i] + 3.0; const y0 = q.y; const I = I4();
    const W = (u, y, v) => [q.x + t.nx[i] * u + q.tx * v, y0 + y, q.z + t.nz[i] * u + q.tz * v];
    const yD = 7.6, dep = 2.6, hw = 1.4; const ua = -wl, ub = wr; const cl = C(0x9ea4a9), clD = C(0x7b8187), steel = C(0x8b9298);
    for (const uc of [ua - 2.6, ub + 2.6]) {
      const g = sc.height(...[W(uc, 0, 0)[0], W(uc, 0, 0)[2]]) - y0; let gm = g; for (const [du, dv] of [[-2.5, -2.5], [2.5, -2.5], [2.5, 2.5], [-2.5, 2.5]]) { const p = W(uc + du, 0, dv); gm = Math.min(gm, sc.height(p[0], p[2]) - y0); }
      if (yD - gm > 30) return false;
      const H = yD + dep + 0.6;
      for (const [p0, p1] of [[[-2.5, -2.5], [2.5, -2.5]], [[2.5, -2.5], [2.5, 2.5]], [[2.5, 2.5], [-2.5, 2.5]], [[-2.5, 2.5], [-2.5, -2.5]]]) {
        let k = 0; for (let y = gm - 0.4; y < H - 0.01; y += 1.0, k++) K.dq(B, W(uc + p0[0], y, p0[1]), W(uc + p1[0], y, p1[1]), W(uc + p1[0], Math.min(H, y + 1.0), p1[1]), W(uc + p0[0], Math.min(H, y + 1.0), p0[1]), k % 2 ? cl : clD);
      }
      K.dq(B, W(uc - 2.7, H, -2.7), W(uc + 2.7, H, -2.7), W(uc + 2.7, H, 2.7), W(uc - 2.7, H, 2.7), C(0xc8ccd0));
    }
    K.dq(B, W(ua, yD, -hw), W(ub, yD, -hw), W(ub, yD, hw), W(ua, yD, hw), C(0x2b2f35)); K.dq(B, W(ua, yD + dep, -hw), W(ub, yD + dep, -hw), W(ub, yD + dep, hw), W(ua, yD + dep, hw), C(0xeef0f0));
    const span = ub - ua, nb = Math.max(4, Math.round(span / 3.2)), bl = span / nb;
    for (const v of [-hw, hw]) { S.beam(I, W(ua, yD, v), W(ub, yD, v), 0.18, steel); S.beam(I, W(ua, yD + dep, v), W(ub, yD + dep, v), 0.18, steel); for (let k = 0; k <= nb; k++) Fd.beam(I, W(ua + k * bl, yD, v), W(ua + k * bl, yD + dep, v), 0.12, steel); }
    const r = A.region('spBridge_' + which, 1024, 96, (x2, w, h) => { if (EI.Ads && EI.Ads.paintBridge) { x2.fillStyle = '#ffffff'; x2.fillRect(0, 0, w, h); EI.Ads.paintBridge(x2, which, w, h, (span - 1) / (dep - 0.6)); } else Mz.paintText(x2, w, h, 'trylumi.co', { bg: '#1b1530', fg: '#ffffff' }); });
    for (const v of [-hw - 0.04, hw + 0.04]) Sp.faceA(A, r, W(ua + 0.5, yD + 0.3, v), W(ub - 0.5, yD + 0.3, v), W(ub - 0.5, yD + dep - 0.3, v), W(ua + 0.5, yD + dep - 0.3, v), [q.tx * Math.sign(v), 0, q.tz * Math.sign(v)]);
    E.markRect(q.x, q.z, t.nx[i], t.nz[i], span / 2 + 6, 4, Env.OCC.BUILT);
    return true;
  }

  // ---- culverts: concrete headwalls with a dark mouth where a stream passes under the circuit (the Eau Rouge at the dip)
  function culverts(E, BK) {
    const { B } = BK; const sc = E.sc; let n = 0; const conc = C(0xa8a69e), mouth = C(0x1c1d1b), R = 1400;
    for (const r of E.data.rivers || []) {
      if (!r.pts || r.pts.length < 2) continue; const P = Env.smoothLine(r.pts, false, 0, 4);
      let prevOk = null;
      for (let i = 0; i < P.length; i++) {
        const [x, z] = P[i]; const ok = Math.abs(x) < R && Math.abs(z) < R && E.fsAt(x, z) > 3 && !(E.occAt(x, z) & Env.OCC.ROAD);
        if (prevOk !== null && ok !== prevOk && Math.abs(x) < R && Math.abs(z) < R) {
          // the headwall stands at the outer sample (ok), facing along the stream away from the road
          const o = ok ? P[i] : P[i - 1], q = ok ? P[i - 1] : P[i]; let tx = o[0] - q[0], tz = o[1] - q[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
          if (E.fsAt(q[0], q[1]) < 3 && E.dcAt(o[0], o[1]) < 120) {
            const g = sc.height(o[0], o[1]); const m = Env.frame(o[0], g, o[1], -tz, tx, tx, tz); const Pm = (a, y, b) => Env.xf(m, a, y, b);
            B.box(m, 5.0, 2.2, 0.6, 0, -0.8, -0.3, conc); for (const sx of [-1, 1]) B.box(m, 0.4, 1.6, 2.4, sx * 2.6, -0.8, 0.6, conc);
            const want = [tx, 0, tz]; Sp.face(B, Pm(-0.9, -0.3, 0.02), Pm(0.9, -0.3, 0.02), Pm(0.9, 0.9, 0.02), Pm(-0.9, 0.9, 0.02), mouth, want); n++;
          }
        }
        prevOk = ok;
      }
    }
    return n;
  }

  Sp.Infra = In;
})();
