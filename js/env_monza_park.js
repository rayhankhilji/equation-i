// Equation I - Monza park structures: the old high-speed ring's banked curves (Sopraelevata Nord / Sud, 1955) from the OSM polylines -
// pale grey weathered concrete, a flat apron with the yellow line, the surface steepening to the lip, a single guard rail on posts,
// a buttressed outer wall - and the bridge that carries the north banking over the GP track on the run down to Ascari (the circuit
// passes under it); the covered pedestrian footbridges over the back straight and the sign bridge at the Prima Variante exit.
// Everything is vertex-coloured into the merged statics; the bridge panels use the venue's sign atlas.
(function () {
  const Mz = EI.EnvMonza; if (!Mz) return;
  const U = EI.U, Env = EI.Env, K = Mz.K, C = K.C;
  const Pk = {};
  const RW = 14, APRON = 3.2, HB = 8.2, DS = 2.6;   // DS: depth of the bridge deck over the GP track (serraglio_1: a deep concrete box)            // ring width, flat apron, height of the lip above the apron at full banking

  // ================================================================ ring geometry (world), shared by layout and build
  function ring(E) {
    if (E.mzRing) return E.mzRing;
    const t = E.t, f = Mz.fit(t), O = EI.MONZA_OSM; const all = O.nord.concat(O.sud, O.east); let ox = 0, oz = 0; for (const p of all) { ox += p[0]; oz += p[1]; } ox /= all.length; oz /= all.length;
    const ctr = f.W([ox, oz]); const pr = {}; const kk = t.smooth(t.k, 6); const out = [];
    for (const [name, pts0] of [['nord', O.nord], ['sud', O.sud]]) {
      const curve = new THREE.CatmullRomCurve3(f.poly(pts0).map(p => new THREE.Vector3(p[0], 0, p[1])), false, 'centripetal'); curve.arcLengthDivisions = 4000;
      const Ltot = curve.getLength(); const n = Math.max(8, Math.round(Ltot / 6)); /* 6 m samples (the curves are 300+ m radius) */ const sp = curve.getSpacedPoints(n);
      const S = []; for (let i = 0; i <= n; i++) { const a = sp[Math.max(0, i - 1)], b = sp[Math.min(n, i + 1)]; let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; let nx = -tz, nz = tx; if (nx * (sp[i].x - ctr[0]) + nz * (sp[i].z - ctr[1]) < 0) { nx = -nx; nz = -nz; } S.push({ x: sp[i].x, z: sp[i].z, tx, tz, nx, nz, a: i * Ltot / n }); }
      // curvature -> banking (smoothed), so the straight run-outs at the ends stay flat
      const hd = S.map((q) => Math.atan2(q.tz, q.tx)); const kr = S.map((q, i) => i > 1 && i < S.length - 2 ? Math.abs(U.wrapAngle(hd[i + 2] - hd[i - 2])) / (4 * Ltot / n) : 0);
      for (let i = 0; i < S.length; i++) { let a = 0, c = 0; for (let j = -8; j <= 8; j++) { const q = kr[U.clamp(i + j, 0, S.length - 1)]; a += q; c++; } S[i].bank = U.clamp((a / c - 0.0009) / 0.0019, 0, 1); }
      // relation to the GP track: dist beyond the barrier; ends (junctions with the main straight) are clipped, the middle crossing is a bridge
      for (const q of S) { t.project(q.x, q.z, null, pr); const w = Math.max(t.wallL[pr.i], t.wallR[pr.i]); q.gp = pr.dist - w; q.gpI = pr.i; q.lat = pr.lat; q.end = Math.min(q.a, Ltot - q.a) < 200; }
      out.push({ name, S, Ltot });
    }
    // bridge spans: middle samples that pass over the GP track's corridor
    for (const r of out) {
      const S = r.S; r.spans = [];
      // a span only where the ring really crosses the circuit (the signed lateral flips); runs that merely pass close are clipped
      for (let i = 0; i < S.length; i++) if (S[i].gp < 4) { let j = i; while (j + 1 < S.length && S[j + 1].gp < 4) j++; let cross = false; for (let k = Math.max(1, i - 1); k <= Math.min(S.length - 1, j + 1); k++) if (Math.sign(S[k].lat) !== Math.sign(S[k - 1].lat) && Math.abs(S[k].lat) < 40) cross = true; if (!cross || S[i].end || S[j].end) { i = j; continue; }   /* the ring's ends merge into the main straight: no bridge there (MONZA-DRESS: a deck spanned the straight at s ~250) */ let yT = -Infinity; for (let k = i; k <= j; k++) yT = Math.max(yT, t.y[S[k].gpI]); r.spans.push({ i0: i, i1: j, yT, ac: (S[i].a + S[j].a) / 2 }); i = j; }
      // deck base: ground + 0.2, raised to clear the GP track near a span (ramps of 70 m either side)
      for (const q of S) {
        let y = E.ground(q.x, q.z) + 0.15;
        for (const sp of r.spans) { const d = Math.max(0, Math.abs(q.a - sp.ac) - (S[sp.i1].a - S[sp.i0].a) / 2 - 6); const w = 1 - U.smoothstep(0, 70, d); y = Math.max(y, U.lerp(y, sp.yT + 6.6, w)); q.sw = Math.max(q.sw || 0, 1 - U.smoothstep(0, 110, d)); }
        const inSpan = r.spans.some(sp => q === S[sp.i0] || (S.indexOf(q) >= sp.i0 && S.indexOf(q) <= sp.i1)); q.span = inSpan;
        q.y = y; q.skip = !inSpan && q.gp < (q.end ? 10 : 6);
      }
    }
    return (E.mzRing = out);
  }

  Pk.layout = function (E) {
    const OCC = Env.OCC; const R = ring(E);
    for (const r of R) for (const q of r.S) { if (q.skip) continue; if (!q.span && (E.occAt(q.x, q.z) & OCC.BUILT)) { q.skip = true; continue; } }
    for (const r of R) { let cur = []; for (const q of r.S) { if (q.skip) { if (cur.length > 1) E.markLine(cur, RW / 2 + 2.5, OCC.BUILT); cur = []; } else cur.push([q.x, q.z]); } if (cur.length > 1) E.markLine(cur, RW / 2 + 2.5, OCC.BUILT); }
  };

  // ================================================================ build
  Pk.build = function (E, BK, out) {
    const { B, S, G, F: Fd, A } = BK; const t = E.t;
    const R = ring(E); let n = 0, spans = 0;
    const conc = C(0xc9c7be), concD = C(0x8f8d86), concL = C(0xd8d6ce), moss = C(0x7c8466), yellow = C(0xe0b416), rail = C(0xb5bcc2), wallC = C(0xb4b1a7);
    const col = (base, k) => base.clone().multiplyScalar(k);
    const NU = 5; // banked strips across
    // quads that must face up (the surface, the line, the lip top): flip the winding when the sample order would make them face down
    const upQ = (a, b, c, d, cc) => { const ux = b[0] - a[0], uz = b[2] - a[2], vx = d[0] - a[0], vz = d[2] - a[2]; if (uz * vx - ux * vz >= 0) B.quad(a, b, c, d, cc); else B.quad(d, c, b, a, cc); };
    for (const r of R) {
      const Sm = r.S; const inSpan = (i) => r.spans.some(sp => i >= sp.i0 - 1 && i <= sp.i1 + 1);
      // cross-section points (world) for sample q: u from -RW/2 (inner) to +RW/2 (outer)
      const sec = (q) => {
        const pts = []; const H = (HB * q.bank + 0.4) * (1 - 0.5 * (q.sw || 0));   // lower over the Serraglio bridge (serraglio_1: ~3 m of wall above the hoarding)
        const us = [-RW / 2, -RW / 2 + APRON]; for (let k = 1; k <= NU; k++) us.push(-RW / 2 + APRON + (RW - APRON) * k / NU);
        for (const u of us) { const v = u <= -RW / 2 + APRON ? 0 : Math.pow((u + RW / 2 - APRON) / (RW - APRON), 1.7); pts.push([q.x + q.nx * u, q.y + H * v, q.z + q.nz * u]); }
        return pts;
      };
      let prev = null, prevQ = null, prevI = -1;
      for (let i = 0; i < Sm.length; i++) {
        const q = Sm[i]; if (q.skip) { prev = null; continue; }
        const cur = sec(q);
        if (prev && i === prevI + 1) {
          const nz = U.noise2(q.a * 0.035, r.name === 'nord' ? 3 : 9);
          for (let k = 0; k + 1 < cur.length; k++) {
            // weathering: darker tyre band in the middle of the banking, pale near the lip, green stains low on the apron
            const band = k >= 3 && k <= 5 ? 0.86 : 1; const cc = k === 0 ? col(moss, 0.95 + 0.1 * nz).lerp(conc, 0.55) : col(k >= cur.length - 2 ? concL : conc, (0.84 + 0.24 * nz) * band);
            upQ(prev[k], cur[k], cur[k + 1], prev[k + 1], cc);
          }
          // the yellow line: a third of the way up, where the slope starts to steepen (m_oldring / m_bank_a*)
          const yl = (p, f) => [p[2][0] + (p[3][0] - p[2][0]) * f, p[2][1] + (p[3][1] - p[2][1]) * f + 0.03, p[2][2] + (p[3][2] - p[2][2]) * f];
          upQ(yl(prev, 0.3), yl(cur, 0.3), yl(cur, 0.48), yl(prev, 0.48), yellow);
          // the lip: a 0.5 m upstand on the outer edge, the outer wall down to the ground (or to the deck soffit over a span), the inner face
          const L0 = prev[prev.length - 1], L1 = cur[cur.length - 1]; const up = (p, d) => [p[0], p[1] + d, p[2]];
          const o0 = [L0[0] + prevQ.nx * 0.45, L0[1], L0[2] + prevQ.nz * 0.45], o1 = [L1[0] + q.nx * 0.45, L1[1], L1[2] + q.nz * 0.45];
          K.dq(B, L0, L1, up(L1, 0.5), up(L0, 0.5), concL); upQ(up(L0, 0.5), up(L1, 0.5), up(o1, 0.5), up(o0, 0.5), concL);
          const span = inSpan(i) || inSpan(prevI);
          const g0 = span ? prevQ.y - DS : Math.min(E.ground(o0[0], o0[2]) - 0.4, prevQ.y - 0.2), g1 = span ? q.y - DS : Math.min(E.ground(o1[0], o1[2]) - 0.4, q.y - 0.2);
          K.dq(B, [o0[0], g0, o0[2]], [o1[0], g1, o1[2]], up(o1, 0.5), up(o0, 0.5), col(wallC, (0.86 + 0.12 * nz) * (0.9 + 0.14 * U.noise2(q.a * 0.45, 7.3))));
          const I0 = prev[0], I1 = cur[0]; const gi0 = span ? prevQ.y - DS : E.ground(I0[0], I0[2]) - 0.4, gi1 = span ? q.y - DS : E.ground(I1[0], I1[2]) - 0.4;
          if (Math.max(I0[1] - gi0, I1[1] - gi1) > 0.25) K.dq(B, [I0[0], gi0, I0[2]], [I1[0], gi1, I1[2]], I1, I0, col(wallC, 0.85));
          if (span) { // deck soffit, dark
            const s0a = [I0[0], prevQ.y - DS, I0[2]], s1a = [I1[0], q.y - DS, I1[2]];
            K.dq(B, s0a, s1a, [o1[0], q.y - DS, o1[2]], [o0[0], prevQ.y - DS, o0[2]], C(0x55534e));
          }
          // buttresses on the outer wall every ~12 m (not over the span)
          if (!span && i % 2 === 0) { const gb = E.ground(o1[0], o1[2]); const h = up(o1, 0)[1] - gb; if (h > 1) { const m = Env.frame(o1[0], gb - 0.3, o1[2], q.tx, q.tz, q.nx, q.nz); B.box(m, 0.9, h + 0.3, 1.6 + h * 0.25, 0, 0, 0.7 + h * 0.12, col(wallC, 0.82)); } }
          // guard rail: posts (clutter) and two rails on the lip (main)
          const r0 = up(L0, 0.5), r1 = up(L1, 0.5);
          if (i % 2 === 0) Fd.beam(Env.frame(0, 0, 0, 1, 0, 0, 1), r1, up(r1, 0.95), 0.1, C(0x7d848b));
          K.dq(S, up(r0, 0.62), up(r1, 0.62), up(r1, 0.92), up(r0, 0.92), rail);   // W-beam rail: a double-sided strip (cheaper than a square beam, same read)
          n++;
        } else if (prev === null && prevQ && prevQ.skip === false) { /* gap start handled below */ }
        // end caps where the ring is clipped (junction with the main straight): close the profile down to the ground
        if (!prev || i !== prevI + 1) { const cap = cur; const g = E.ground(q.x, q.z) - 0.4; for (let k = 0; k + 1 < cap.length; k++) K.dq(B, [cap[k][0], g, cap[k][2]], [cap[k + 1][0], g, cap[k + 1][2]], cap[k + 1], cap[k], wallC); }
        prev = cur; prevQ = q; prevI = i;
        if (i + 1 < Sm.length && Sm[i + 1].skip) { const g = E.ground(q.x, q.z) - 0.4; for (let k = 0; k + 1 < cur.length; k++) K.dq(B, [cur[k][0], g, cur[k][2]], [cur[k + 1][0], g, cur[k + 1][2]], cur[k + 1], cur[k], wallC); }
      }
      // ---- bridge spans over the GP track: abutment walls either side of the circuit, parapet rails, a name band on the fascia
      for (const sp of r.spans) {
        spans++;
        for (const ie of [Math.max(0, sp.i0 - 2), Math.min(Sm.length - 1, sp.i1 + 2)]) {
          const q = Sm[ie]; const gq = Math.min(E.ground(q.x, q.z), t.y[q.gpI]) - 0.6; const m = Env.frame(q.x, gq, q.z, q.tx, q.tz, q.nx, q.nz);
          B.box(m, 1.6, q.y - DS - gq + 0.05, RW + 1.4, 0, 0, 0.2, C(0xa9a69c));
          // the portal fascia facing the track (concrete band with dark stains)
          B.box(m, 0.4, DS, RW + 1.0, ie === sp.i0 - 2 ? 0.9 : -0.9, q.y - DS, 0.2, C(0x9a978e));
        }
        // the partner hoarding hung on both faces of the bridge over the GP track (m_bank_sop1/2: white panel with the partner's logo)
        { const ic = Math.round((sp.i0 + sp.i1) / 2); const q = Sm[ic]; const pw = 24, ph = 3.6;
          const r = A.region('mzBankSign', 768, 136, (x2, w, h) => { x2.fillStyle = '#ffffff'; x2.fillRect(0, 0, w, h); if (EI.Ads && EI.Ads.paintTile) EI.Ads.paintTile(x2, 0, 0, 0, w, h, pw / ph); else Mz.paintText(x2, w, h, 'trylumi.co', { bg: '#ffffff', fg: '#c8102e' }); x2.strokeStyle = '#d6d8da'; x2.lineWidth = 4; x2.strokeRect(2, 2, w - 4, h - 4); });
          for (const sd of [-1, 1]) {
            const off = RW / 2 + 0.55 + (sd > 0 ? 0.45 : 0); const cx = q.x + q.nx * sd * off, cz = q.z + q.nz * sd * off; const y0 = q.y - 2.35;   // banking_bridge_over_track_a: the panel covers the deck face
            const a = [cx - q.tx * pw / 2, y0, cz - q.tz * pw / 2], b = [cx + q.tx * pw / 2, y0, cz + q.tz * pw / 2], c = [b[0], y0 + ph, b[2]], d = [a[0], y0 + ph, a[2]];
            const nOut = (-q.tz) * q.nx * sd + q.tx * q.nz * sd; if (nOut > 0) A.quad(r, a, b, c, d); else A.quad(r, b, a, d, c);
            { const yr = y0 + ph + 0.9; Fd.beam(Env.frame(0, 0, 0, 1, 0, 0, 1), [a[0], yr, a[2]], [b[0], yr, b[2]], 0.08, C(0xeeeeee)); Fd.beam(Env.frame(0, 0, 0, 1, 0, 0, 1), [a[0], yr - 0.45, a[2]], [b[0], yr - 0.45, b[2]], 0.06, C(0xeeeeee));
              for (let k = 0; k <= 12; k++) { const f = k / 12; const pp = [a[0] + (b[0] - a[0]) * f, y0 + ph, a[2] + (b[2] - a[2]) * f]; Fd.beam(Env.frame(0, 0, 0, 1, 0, 0, 1), pp, [pp[0], yr, pp[2]], 0.07, C(0xe6e6e6)); } }
            K.dq(B, [a[0] - q.nx * sd * 0.1, y0 - 0.1, a[2] - q.nz * sd * 0.1], [b[0] - q.nx * sd * 0.1, y0 - 0.1, b[2] - q.nz * sd * 0.1], [b[0] - q.nx * sd * 0.1, y0 + ph + 0.1, b[2] - q.nz * sd * 0.1], [a[0] - q.nx * sd * 0.1, y0 + ph + 0.1, a[2] - q.nz * sd * 0.1], C(0xdfe1e2));
          } }
        // Armco on the deck's inner edge over the span
        for (let i = sp.i0 - 2; i <= sp.i1 + 2; i++) { const a = Sm[Math.max(0, i)], b = Sm[Math.min(Sm.length - 1, i + 1)]; if (!a || !b) continue; const p0 = [a.x - a.nx * RW / 2, a.y + 0.75, a.z - a.nz * RW / 2], p1 = [b.x - b.nx * RW / 2, b.y + 0.75, b.z - b.nz * RW / 2]; S.beam(Env.frame(0, 0, 0, 1, 0, 0, 1), p0, p1, 0.3, rail); }
      }
    }
    out.banking = { samples: n, spans };
    // ---- footbridges over the back straight (OSM, research s 4131 covered with stairs, 4424 with stairs), the Prima Variante sign bridge
    const f = Mz.fit(t); let fb = 0;
    const gen = ((t.data.furniture || {}).bridges || []).map(b => b[0]); const near = (s) => gen.some(g => { const d = Math.abs(U.mod(g - s, t.length)); return Math.min(d, t.length - d) < 40; });
    for (const [sr, kind] of [[4131, 'covered'], [4424, 'covered'], [745, 'sign']]) { const s = f.s(sr); if (kind === 'sign' && near(s)) continue; try { if (footbridge(E, BK, s, kind)) fb++; } catch (e) { console.error('EnvMonza footbridge', e); } }
    out.footbridges = fb;
    // TV camera cranes (t2_exit_gantry_gravel: a yellow telescopic boom on a truck, the camera basket high over the fence) at the
    // corner exits the world feed shoots from: Rettifilo exit, Roggia exit, Ascari exit, Parabolica exit (outside of the corner)
    let cr = 0; for (const sr of [705, 1905, 3860, 4990]) { try { if (crane(E, BK, f.s(sr))) cr++; } catch (e) { console.error('EnvMonza crane', e); } }
    out.cranes = cr;
  };

  function crane(E, BK, s) {
    const t = E.t, OCC = Env.OCC, { B, S } = BK; const kk = t.smooth(t.k, 20); const i = t.idxAtS(s); const side = kk[i] > 0 ? -1 : 1;
    let d = E.wallCap(i, side) + 7, x, z, tries = 0;
    for (; tries < 5; tries++, d += 5) { x = t.x[i] + t.nx[i] * side * d; z = t.z[i] + t.nz[i] * side * d; if (!(E.occAt(x, z) & (OCC.BUILT | OCC.WATER))) break; }
    if (tries >= 5) return false;
    const g = E.ground(x, z); if (!Number.isFinite(g)) return false;
    // frame: x along the lap, z away from the track
    const m = Env.frame(x, g, z, t.tx[i], t.tz[i], t.nx[i] * side, t.nz[i] * side);
    const yel = C(0xf0b400), white = C(0xeeeeec), dark = C(0x2a2d33), grey = C(0x7d838a);
    B.box(m, 9.0, 1.2, 2.5, 0, 0.5, 0, grey);                 // chassis
    B.box(m, 2.2, 2.0, 2.5, 3.6, 1.7, 0, white);              // cab
    B.box(m, 4.0, 1.2, 2.3, -1.5, 1.7, 0, yel);               // turret
    for (const sx of [-3.6, 3.4]) for (const sz of [-1.6, 1.6]) S.beam(m, [sx, 0.1, sz * 1.5], [sx, 1.0, sz], 0.25, dark);   // outriggers
    // the boom: two telescopic sections leaning out over the fence towards the track, the basket at the tip
    const p0 = [-1.5, 2.9, 0.3], p1 = [-1.5 + 3, 15.5, -6.5], p2 = [-1.5 + 5, 24.0, -11.5];
    S.beam(m, p0, p1, 0.9, yel); S.beam(m, p1, p2, 0.65, yel);
    B.box(m, 1.8, 1.1, 1.4, p2[0], p2[1] - 1.3, p2[2], yel); B.box(m, 0.7, 0.6, 0.9, p2[0], p2[1] - 0.2, p2[2] - 0.3, dark);   // basket + camera
    E.markRect(x, z, t.tx[i], t.tz[i], 6, 3, OCC.BUILT);
    return true;
  }

  // a pedestrian footbridge: two open steel stair towers beyond the barriers, a box truss walkway with partner panels on both faces
  // (the drivers see the faces square on), a roof; 'sign' = the slim green sign bridge after the first chicane (no stairs)
  function footbridge(E, BK, s, kind) {
    const t = E.t, { B, S, G, F: Fd, A } = BK; const i = t.idxAtS(s);
    const wl = t.wallL[i] + 2.2, wr = t.wallR[i] + 2.2; const y0 = t.y[i];
    // frame: x across the track (from the -1 side to the +1 side), z along the lap
    const ox = t.x[i], oz = t.z[i]; const ax = t.nx[i], az = t.nz[i];
    const W = (u, y, v) => [ox + ax * u + t.tx[i] * v, y0 + y, oz + az * u + t.tz[i] * v];
    const I = Env.frame(0, 0, 0, 1, 0, 0, 1); const steel = C(0x8c9399), white = C(0xeef0f0), dark = C(0x2b2f35), green = C(0x0c5a3a);
    const yD = kind === 'sign' ? 7.4 : 6.4, dep = kind === 'sign' ? 1.6 : 3.0, hw = kind === 'sign' ? 0.9 : 1.5;
    const u0 = -wl, u1 = wr;
    // towers / posts
    for (const [uc, sg] of [[u0 - (kind === 'sign' ? 0.5 : 2.6), -1], [u1 + (kind === 'sign' ? 0.5 : 2.6), 1]]) {
      const g = E.ground(...[W(uc, 0, 0)[0], W(uc, 0, 0)[2]]) - y0 - 0.1;
      if (kind === 'sign') { for (const v of [-0.5, 0.5]) S.beam(I, W(uc, g, v), W(uc, yD + dep, v), 0.32, kind === 'sign' ? green : steel); continue; }
      // stair tower clad in grey ribbed panels (back_1), a darker band at the walkway level, a flat roof
      const cl = C(0x9ea4a9), clD = C(0x7b8187), H = yD + dep + 0.6;
      for (const [p0, p1] of [[[-2.5, -2.5], [2.5, -2.5]], [[2.5, -2.5], [2.5, 2.5]], [[2.5, 2.5], [-2.5, 2.5]], [[-2.5, 2.5], [-2.5, -2.5]]]) {
        K.dq(B, W(uc + p0[0], g, p0[1]), W(uc + p1[0], g, p1[1]), W(uc + p1[0], H, p1[1]), W(uc + p0[0], H, p0[1]), cl);
        K.dq(B, W(uc + p0[0] * 1.01, yD - 0.2, p0[1] * 1.01), W(uc + p1[0] * 1.01, yD - 0.2, p1[1] * 1.01), W(uc + p1[0] * 1.01, yD + dep, p1[1] * 1.01), W(uc + p0[0] * 1.01, yD + dep, p0[1] * 1.01), clD);
        for (let k = 1; k < 8; k++) { const f = k / 8; const q = [uc + p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f]; Fd.beam(I, W(q[0] * 1.0, g, q[1] * 1.02), W(q[0], yD - 0.25, q[1] * 1.02), 0.06, clD); }
      }
      K.dq(B, W(uc - 2.7, H, -2.7), W(uc + 2.7, H, -2.7), W(uc + 2.7, H, 2.7), W(uc - 2.7, H, 2.7), C(0xc8ccd0));
    }
    // the walkway truss
    const ua = u0 - (kind === 'sign' ? 0.5 : 0.2), ub = u1 + (kind === 'sign' ? 0.5 : 0.2);
    K.dq(B, W(ua, yD, -hw), W(ub, yD, -hw), W(ub, yD, hw), W(ua, yD, hw), kind === 'sign' ? green : dark);
    K.dq(B, W(ua, yD + dep, -hw), W(ub, yD + dep, -hw), W(ub, yD + dep, hw), W(ua, yD + dep, hw), kind === 'sign' ? green : white);
    for (const v of [-hw, hw]) { S.beam(I, W(ua, yD, v), W(ub, yD, v), 0.18, kind === 'sign' ? green : steel); S.beam(I, W(ua, yD + dep, v), W(ub, yD + dep, v), 0.18, kind === 'sign' ? green : steel); }
    // partner panels on both faces (5:1 tiles; the sign bridge: one long panel per face from the bridge painter)
    const span = ub - ua;
    if (kind === 'sign') {
      const r = A.region('mzSignBridge', 1024, 96, (x2, w, h) => { if (EI.Ads && EI.Ads.paintBridge) { x2.fillStyle = '#0c5a3a'; x2.fillRect(0, 0, w, h); EI.Ads.paintBridge(x2, 'lumi2', w, h, (span - 1) / (dep - 0.3));   /* f1-BRAND: the venue's partner (EI.Ads.VENUES.monza.bridge.lumi2) */ } else Mz.paintText(x2, w, h, 'trylumi.co', { bg: '#0c5a3a', fg: '#ffffff' }); });
      for (const v of [-hw - 0.03, hw + 0.03]) { const a = W(ua + 0.5, yD + 0.15, v), b = W(ub - 0.5, yD + 0.15, v), c = W(ub - 0.5, yD + dep - 0.15, v), d = W(ua + 0.5, yD + dep - 0.15, v); if (v < 0) A.quad(r, b, a, d, c); else A.quad(r, a, b, c, d);   /* far face: u runs the other way in world space, so it reads correctly (f1-BRAND) */ }
    } else {
      // Warren / X truss sides in grey steel (back_1), grey parapet cladding along the deck, a dark lattice floor and a light roof
      const tr = C(0x8b9298), nb = Math.max(4, Math.round(span / 3.2)), bl = span / nb;
      for (const v of [-hw, hw]) {
        for (let k = 0; k <= nb; k++) S.beam(I, W(ua + k * bl, yD, v), W(ua + k * bl, yD + dep, v), 0.14, tr);
        for (let k = 0; k < nb; k++) { S.beam(I, W(ua + k * bl, yD, v), W(ua + (k + 1) * bl, yD + dep, v), 0.1, tr); S.beam(I, W(ua + k * bl, yD + dep, v), W(ua + (k + 1) * bl, yD, v), 0.1, tr); }
        K.dq(B, W(ua, yD + 0.05, v * 0.97), W(ub, yD + 0.05, v * 0.97), W(ub, yD + 1.05, v * 0.97), W(ua, yD + 1.05, v * 0.97), C(0x7f868c));
      }
      K.dq(B, W(ua - 0.2, yD + dep + 0.15, -hw - 0.25), W(ub + 0.2, yD + dep + 0.15, -hw - 0.25), W(ub + 0.2, yD + dep + 0.15, hw + 0.25), W(ua - 0.2, yD + dep + 0.15, hw + 0.25), C(0xb9bec2));
    }
    return true;
  }

  Mz.Park = Pk;
})();
