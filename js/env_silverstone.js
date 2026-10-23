// Equation I - Silverstone (SILVERSTONE-UPGRADE): the venue checked against the F1 photo set (swarm/staging/silverstone_refs, 115 photos,
// 2015-2026). This file holds what is Silverstone's own and hooks into the shared passes only when the track is Silverstone:
//  * The Wing (pit + paddock building on the Hamilton Straight), rebuilt after the photos (ref_039 / 045 / 078 / 037): a long, low glazed
//    building whose blade roof zig-zags along the straight - white fascia with a thin red line under it, dark-grey roof - rising at the
//    Club end into the tall prow whose end face carries the chequered dark-grey panels; grey cladding with the DHL band over the garages,
//    glazed hospitality floors with balconies leaning out over the pit lane, closed garages either side of the team boxes. It follows the
//    straight's gradient (the old block was level and stood ~3 m off the ground at both ends). Static, merged into the lap-wide statics
//    (no extra draw call) plus one textured band (it replaces the old roof-name mesh: same call count).
//  * The Silverstone Wheel (observation wheel outside the Hamilton Straight, ref_035 / 078 / 088): merged statics, no extra call.
// Everything is built once at load: no per-frame work.
window.EI = window.EI || {};
(function () {
  const U = EI.U, Env = EI.Env; if (!Env) return;
  const C = (h) => new THREE.Color(h).convertSRGBToLinear();
  const isSil = (t) => !!(t && t.data && t.data.id === 'silverstone');
  const Sv = EI.EnvSilverstone = { isSil };

  // ================================================================ shared frame along the start / finish straight
  // x: metres along the straight from the line, + towards Abbey (down the lap); y: metres above the track at the line; z: metres from the
  // centre line towards the pit side. P() adds the straight's gradient so the building sits on its own ground along its length.
  function wingFrame(t) {
    const pit = t.data.pit; if (!pit || pit.length < 4) return null;
    let lat = 0; const pr = {}; for (const p of pit) { t.project(p[0], p[1], null, pr); lat += pr.lat; } const side = lat < 0 ? -1 : 1;
    let maxWall = 0; for (let s = -180; s <= 180; s += 4) { const i = t.idxAtS(t.sf + s); maxWall = Math.max(maxWall, side < 0 ? t.wallL[i] : t.wallR[i]); }
    const latC = maxWall + 2.9 + 0.35 + 6.0;   // pit lane centre (js/pit.js)
    const i0 = t.idxAtS(t.sf), y0 = t.y[i0];
    const m = Env.frame(t.x[i0], y0, t.z[i0], t.tx[i0], t.tz[i0], t.nx[i0] * side, t.nz[i0] * side);
    const e = m.elements; const dirX = (e[0] * t.tx[i0] + e[2] * t.tz[i0]) > 0 ? 1 : -1;
    const yA = (x) => { const f = U.mod((t.sf + x) / t.ds, t.n), i = Math.floor(f), j = (i + 1) % t.n; return U.lerp(t.y[i], t.y[j], f - i) - y0; };
    const P = (x, y, z) => Env.xf(m, x * dirX, y + yA(x), z);
    const o = Env.xf(m, 0, 0, 0);
    const dirW = (v) => { const q = Env.xf(m, v[0] * dirX, v[1], v[2]); return [q[0] - o[0], q[1] - o[1], q[2] - o[2]]; };
    return { side, latC, m, dirX, y0, i0, yA, P, dirW, zG: latC + 7.8, zGB: latC + 17.8 };
  }
  Sv.wingFrame = wingFrame;
  // quad from four local points, wound so that its normal points along `want` (local direction): robust whatever the frame's handedness
  function mkQ(F) {
    return (Bd, a, b, c, d, col, want) => {
      const A = F.P(a[0], a[1], a[2]), B = F.P(b[0], b[1], b[2]), Cc = F.P(c[0], c[1], c[2]), D = F.P(d[0], d[1], d[2]);
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = Cc[0] - A[0], vy = Cc[1] - A[1], vz = Cc[2] - A[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const w = F.dirW(want);
      if (nx * w[0] + ny * w[1] + nz * w[2] >= 0) Bd.quad(A, B, Cc, D, col); else Bd.quad(D, Cc, B, A, col);
    };
  }
  // axis box in the straight frame (x0..x1 along, y0..y1, z0..z1), outward faces; bottom omitted
  function mkBox(Q) {
    return (Bd, x0, x1, y0, y1, z0, z1, col, top) => {
      Q(Bd, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], top || col, [0, 1, 0]);
      Q(Bd, [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], col, [0, 0, -1]);
      Q(Bd, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], col, [0, 0, 1]);
      Q(Bd, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], col, [-1, 0, 0]);
      Q(Bd, [x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], col, [1, 0, 0]);
    };
  }
  // thin beam between two local points (square section) in the straight frame
  function mkBeam(F) {
    return (Bd, a, b, th, col) => { const A = F.P(a[0], a[1], a[2]), B = F.P(b[0], b[1], b[2]); Bd.beam(IDM, A, B, th, col); };
  }
  const IDM = new THREE.Matrix4();

  // ================================================================ The Wing
  // roofline: the fascia's top edge (m above the line) along the straight, Club end (x < 0) -> Abbey end. Knots after ref_039 (seen across
  // the straight: tall prow, a deep V, a second crest, then the long low run) and ref_045 / 078 (seen along it from the Club end).
  const L0 = -206, L1 = 196;
  const RK = [[L0, 38.0], [L0 + 12, 34.5], [-150, 18.8], [-96, 31.0], [-42, 18.9], [60, 18.4], [150, 18.0], [L1, 17.4]];   // (crest raised after the first comparison: ref_039's V reads as deep as the building is tall)
  const roofY = (x) => { if (x <= RK[0][0]) return RK[0][1]; for (let k = 0; k + 1 < RK.length; k++) { const a = RK[k], b = RK[k + 1]; if (x <= b[0]) return U.lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0])); } return RK[RK.length - 1][1]; };
  Sv.roofY = roofY;
  Sv.buildWing = function (sc, grp) {
    const t = sc.track; const F = wingFrame(t); if (!F || !sc.statics) return;
    const Q = mkQ(F), BX = mkBox(Q), BM = mkBeam(F);
    const B = new Env.Builder(), G = new Env.Builder(), D = new Env.Builder();   // structure / glass / fine detail (clutter layer)
    const zG = F.zG, zGB = F.zGB;
    const NB = Math.max(10, (EI.TEAMS || []).length || 11), half = NB * 18 / 2;   // the team garages (js/pit.js), centred on the line
    const white = C(0xf2f3f1), clad = C(0xa8adb2), cladD = C(0x8c9298), shutter = C(0x8f969d), slat = C(0x7b8289), frameC = C(0xd3d6d9), redL = C(0xc8102e),
      lip = C(0x2a2d32), roofC = C(0x6f747a), soffit = C(0xd2d5d8), glassA = C(0x1f2d3c), glassB = C(0x182533), backC = C(0xd6d8d9), steelW = C(0xe9eaea),
      chkA = C(0x2a2c30), chkB = C(0x3d4045), paleA = C(0xdcd5c9), paleB = C(0xcfc8bb), black = C(0x1d1f23);
    const yG = 4.8, yS1 = 10.35, depthB = zG + 22;   // (the paddock trucks of js/infra.js start ~26 m behind the garage fronts)              // garage top, first slab, back face of the building
    const zle = zG - 7.0;                                     // roof leading edge (overhangs the pit lane)
    const lean = 2.0; const frontZ = (y) => zG - 0.8 - lean * U.clamp((y - yS1) / 12, 0, 1.6);   // the glazing leans out towards the track
    const glassTop = (x) => roofY(x) - 1.75;
    const backY = (x) => 15.6 + 0.35 * (roofY(x) - 18);       // the roof's back edge: the folds of the front edge show as a folded plate
    const xs = []; for (let x = L0; x < L1 - 0.01; x += 6) xs.push(x); xs.push(L1); for (const k of RK) if (k[0] > L0 && k[0] < L1 && xs.indexOf(k[0]) < 0) xs.push(k[0]); xs.sort((a, b) => a - b);
    // ---- closed garages either side of the team boxes: grey roller shutters in light-grey frames
    for (const [a0, a1] of [[L0 + 2, -half], [half, L1 - 2]]) {
      for (let x = a0; x < a1 - 1; x += 9) {
        const w = Math.min(9, a1 - x), xa = x, xb = x + w;
        BX(B, xa, xb, yG, yG + 0.6, zG - 0.1, zGB, white);                       // header
        BX(B, xa, xa + 0.45, -1.2, yG, zG - 0.05, zG + 0.6, frameC);             // pilaster
        Q(B, [xa + 0.45, -1.2, zG + 0.3], [xb, -1.2, zG + 0.3], [xb, yG, zG + 0.3], [xa + 0.45, yG, zG + 0.3], shutter, [0, 0, -1]);
        for (let y = 0.4; y < yG - 0.1; y += 0.42) Q(D, [xa + 0.5, y, zG + 0.27], [xb - 0.05, y, zG + 0.27], [xb - 0.05, y + 0.06, zG + 0.27], [xa + 0.5, y + 0.06, zG + 0.27], slat, [0, 0, -1]);
      }
      Q(B, [a0, -1.2, zGB], [a1, -1.2, zGB], [a1, yG, zGB], [a0, yG, zGB], cladD, [0, 0, 1]);
    }
    // ---- level 1 over the whole frontage (the garages' upper floor): grey cladding with panel joints, the slab and balcony at 10.35 m
    for (let k = 0; k + 1 < xs.length; k++) {
      const xa = xs[k], xb = xs[k + 1];
      Q(B, [xa, yG, zG + 0.05], [xb, yG, zG + 0.05], [xb, yS1, zG + 0.05], [xa, yS1, zG + 0.05], k % 2 ? clad : C(0xa1a6ab), [0, 0, -1]);
      Q(D, [xa, yG, zG + 0.0], [xa + 0.12, yG, zG + 0.0], [xa + 0.12, yS1, zG + 0.0], [xa, yS1, zG + 0.0], cladD, [0, 0, -1]);
      // slab edge (white band), balcony soffit and floor, glass balustrade
      const zb = zG - 2.4;
      Q(B, [xa, yS1 - 0.45, zb], [xb, yS1 - 0.45, zb], [xb, yS1, zb], [xa, yS1, zb], white, [0, 0, -1]);
      Q(B, [xa, yS1 - 0.45, zb], [xb, yS1 - 0.45, zb], [xb, yS1 - 0.45, zG + 0.05], [xa, yS1 - 0.45, zG + 0.05], soffit, [0, -1, 0]);
      Q(B, [xa, yS1, zb], [xb, yS1, zb], [xb, yS1, frontZ(yS1)], [xa, yS1, frontZ(yS1)], C(0x8d9196), [0, 1, 0]);
      Q(G, [xa, yS1, zb + 0.05], [xb, yS1, zb + 0.05], [xb, yS1 + 1.05, zb + 0.05], [xa, yS1 + 1.05, zb + 0.05], C(0x6f8496), [0, 0, -1]);
      Q(D, [xa, yS1 + 1.05, zb], [xb, yS1 + 1.05, zb], [xb, yS1 + 1.12, zb], [xa, yS1 + 1.12, zb], steelW, [0, 0, -1]);
    }
    // ---- glazed hospitality / media floors: leaning glass up to under the roof, slab bands at 14.2 and 18.05 m with balconies
    const floors = [yS1, 14.2, 18.05, 21.9, 25.75, 29.6, 33.45, 37.3];
    for (let k = 0; k + 1 < xs.length; k++) {
      const xa = xs[k], xb = xs[k + 1]; const ta = glassTop(xa), tb = glassTop(xb);
      for (let f = 0; f + 1 < floors.length; f++) {
        const y0 = floors[f] + 0.05; if (y0 > Math.max(ta, tb) - 0.3) break;
        const ya1 = Math.min(ta, floors[f + 1]), yb1 = Math.min(tb, floors[f + 1]); if (ya1 <= y0 + 0.2 && yb1 <= y0 + 0.2) continue;
        const za0 = frontZ(y0), za1 = frontZ(Math.max(y0, ya1)), zb1 = frontZ(Math.max(y0, yb1));
        Q(G, [xa, y0, za0], [xb, y0, za0], [xb, Math.max(y0, yb1), zb1], [xa, Math.max(y0, ya1), za1], f % 2 ? glassA : glassB, [0, 0, -1]);
        if (f > 0) {   // slab band + a narrow balcony with its rail
          const yy = floors[f], zf = frontZ(yy) - 1.3;
          Q(B, [xa, yy - 0.4, zf], [xb, yy - 0.4, zf], [xb, yy, zf], [xa, yy, zf], white, [0, 0, -1]);
          Q(B, [xa, yy - 0.4, zf], [xb, yy - 0.4, zf], [xb, yy - 0.4, frontZ(yy)], [xa, yy - 0.4, frontZ(yy)], soffit, [0, -1, 0]);
          Q(D, [xa, yy + 1.0, zf], [xb, yy + 1.0, zf], [xb, yy + 1.07, zf], [xa, yy + 1.07, zf], steelW, [0, 0, -1]);
        }
      }
      // mullions every 3 m
      for (let x = xa; x < xb - 0.1; x += 3) { const tp = glassTop(x); if (tp > yS1 + 0.5) BM(D, [x, yS1 + 0.1, frontZ(yS1 + 0.1) - 0.06], [x, tp, frontZ(tp) - 0.06], 0.09, C(0x7d848b)); }
    }
    // ---- the blade roof: fascia (white over a thin red line and a dark lip), dark-grey folded top, pale soffit back to the glazing
    for (let k = 0; k + 1 < xs.length; k++) {
      const xa = xs[k], xb = xs[k + 1]; const ra = roofY(xa), rb = roofY(xb);
      Q(B, [xa, ra - 1.25, zle], [xb, rb - 1.25, zle], [xb, rb, zle], [xa, ra, zle], white, [0, 0, -1]);
      Q(B, [xa, ra - 1.43, zle - 0.01], [xb, rb - 1.43, zle - 0.01], [xb, rb - 1.25, zle - 0.01], [xa, ra - 1.25, zle - 0.01], redL, [0, 0, -1]);
      Q(B, [xa, ra - 1.8, zle + 0.05], [xb, rb - 1.8, zle + 0.05], [xb, rb - 1.43, zle], [xa, ra - 1.43, zle], lip, [0, 0, -1]);
      Q(B, [xa, ra, zle], [xb, rb, zle], [xb, backY(xb), depthB], [xa, backY(xa), depthB], k % 3 === 1 ? C(0x767b81) : roofC, [0, 1, 0]);
      Q(B, [xa, ra - 1.8, zle + 0.05], [xb, rb - 1.8, zle + 0.05], [xb, glassTop(xb), frontZ(glassTop(xb))], [xa, glassTop(xa), frontZ(glassTop(xa))], soffit, [0, -1, 0]);
      // the back of the building (paddock side): pale cladding with a dark window band
      Q(B, [xa, -1.2, depthB], [xb, -1.2, depthB], [xb, backY(xb), depthB], [xa, backY(xa), depthB], backC, [0, 0, 1]);
      Q(G, [xa, 11.2, depthB + 0.05], [xb, 11.2, depthB + 0.05], [xb, 13.4, depthB + 0.05], [xa, 13.4, depthB + 0.05], glassB, [0, 0, 1]);
      // downlights under the overhang
      if (k % 2 === 0) { const xm = (xa + xb) / 2, rr = roofY(xm) - 1.82; Q(D, [xm - 0.3, rr, zle + 2.0], [xm + 0.3, rr, zle + 2.0], [xm + 0.3, rr, zle + 2.6], [xm - 0.3, rr, zle + 2.6], C(0xfff6e2), [0, -1, 0]); }
    }
    // ---- slim white steel under the overhang: a V-strut pair every 24 m from the balcony slab to the roof lip (ref_078 / 037)
    for (let x = L1 - 70; x < L1 - 6; x += 24) { const rr = roofY(x) - 1.8; for (const d of [-3.5, 3.5]) BM(D, [x, yS1 + 0.05, zG - 2.2], [x + d, rr, zle + 1.2], 0.2, C(0xb9473f)); }   // the red bracing at the Abbey end (ref_037)
    // ---- Abbey end (ref_037): grey cladding to the first floor, dark glazing above, and the blade roof running on 7 m past the end, its
    // fascia wrapping round the tip (white over the red line), so the end reads as the roof's overhang rather than a flat wall
    { const zf = frontZ(glassTop(L1)), xe = L1 + 7, re = roofY(L1) + 0.6;
      Q(B, [L1, -1.2, zG], [L1, -1.2, depthB], [L1, yS1, depthB], [L1, yS1, zG], cladD, [1, 0, 0]);
      Q(G, [L1, yS1, zf + 0.6], [L1, yS1, depthB], [L1, backY(L1) - 0.4, depthB], [L1, glassTop(L1), zf], glassB, [1, 0, 0]);
      for (let z = zf + 3; z < depthB - 1; z += 3) BM(D, [L1 + 0.05, yS1, z], [L1 + 0.05, U.lerp(glassTop(L1), backY(L1) - 0.4, (z - zf) / (depthB - zf)), z], 0.09, C(0x7d848b));
      const ra = roofY(L1);
      Q(B, [L1, ra, zle], [xe, re, zle + 1.5], [xe, backY(L1) + 0.4, depthB - 4], [L1, backY(L1), depthB], roofC, [0, 1, 0]);
      Q(B, [L1, ra - 1.8, zle + 0.05], [xe, re - 1.6, zle + 1.55], [xe, backY(L1) - 1.0, depthB - 4], [L1, backY(L1) - 1.2, depthB], soffit, [0, -1, 0]);
      Q(B, [L1, ra - 1.25, zle], [xe, re - 1.15, zle + 1.5], [xe, re, zle + 1.5], [L1, ra, zle], white, [0, 0, -1]);
      Q(B, [L1, ra - 1.43, zle - 0.01], [xe, re - 1.33, zle + 1.49], [xe, re - 1.15, zle + 1.49], [L1, ra - 1.25, zle - 0.01], redL, [0, 0, -1]);
      Q(B, [xe, re - 1.15, zle + 1.5], [xe, backY(L1) - 0.6, depthB - 4], [xe, backY(L1) + 0.4, depthB - 4], [xe, re, zle + 1.5], white, [1, 0, 0]);
      Q(B, [xe, re - 1.6, zle + 1.55], [xe, backY(L1) - 1.0, depthB - 4], [xe, backY(L1) - 0.6, depthB - 4], [xe, re - 1.15, zle + 1.5], redL, [1, 0, 0]); }
    // ---- the prow (Club end): its end face, from the roof's sloping end edge (high at the track side, low at the back) down to the first
    // floor, chequered dark-grey panels below a pale band under the edge (ref_045), framed by a black fascia with a red line and white top
    {
      const x = L0, top0 = roofY(L0), z0 = zle + 0.6, z1 = depthB; const topAt = (z) => U.lerp(top0 - 0.2, backY(L0), (z - z0) / (z1 - z0));
      const cell = 2.5; let iz = 0;
      for (let z = z0; z < z1 - 0.01; z += cell, iz++) {
        const za = z, zb = Math.min(z1, z + cell); const ta = topAt(za), tb = topAt(zb); let iy = 0;
        for (let y = 4.8; y < Math.max(ta, tb) - 0.05; y += cell, iy++) {
          const ya = y, yb1 = Math.min(ta, y + cell), yb2 = Math.min(tb, y + cell); if (yb1 <= ya + 0.02 && yb2 <= ya + 0.02) continue;
          const band = Math.min(ta, tb) - (y + cell / 2) < 6.5 + 4.5 * (1 - (za - z0) / (z1 - z0));
          const col = band ? ((iz + iy) % 2 ? paleA : paleB) : ((iz + iy) % 2 ? chkA : chkB);
          Q(B, [x, ya, za], [x, ya, zb], [x, Math.max(ya, yb2), zb], [x, Math.max(ya, yb1), za], col, [-1, 0, 0]);
        }
      }
      // fascia along the sloping top edge and down the front edge
      Q(B, [x - 0.15, top0 - 1.2, z0], [x - 0.15, backY(L0) - 1.0, z1], [x - 0.15, backY(L0) - 0.05, z1], [x - 0.15, top0 - 0.2, z0], black, [-1, 0, 0]);
      Q(B, [x - 0.18, top0 - 1.45, z0], [x - 0.18, backY(L0) - 1.25, z1], [x - 0.18, backY(L0) - 1.0, z1], [x - 0.18, top0 - 1.2, z0], redL, [-1, 0, 0]);
      Q(B, [x - 0.12, top0 - 0.2, z0], [x - 0.12, backY(L0) - 0.05, z1], [x - 0.12, backY(L0) + 0.5, z1], [x - 0.12, top0 + 0.4, z0], white, [-1, 0, 0]);
      Q(B, [x - 0.15, 4.8, z0], [x - 0.15, 4.8, z0 + 1.1], [x - 0.15, top0 - 1.2, z0 + 1.1], [x - 0.15, top0 - 1.2, z0], black, [-1, 0, 0]);
      // the roof's end edge (its thickness) and the garages' end wall under the prow
      Q(B, [x, top0 - 1.8, zle], [x, top0, zle], [x, top0 - 0.2, z0], [x, top0 - 1.8, z0], white, [-1, 0, 0]);
      Q(B, [x, -1.2, zG], [x, -1.2, z1], [x, 4.8, z1], [x, 4.8, zG], cladD, [-1, 0, 0]);
      // the podium balcony recess under the prow: a white curved-front deck at the first floor (ref_045 "F1" balcony)
      BX(B, x + 1, x + 13, 6.2, 7.4, z0 - 1.2, z0 + 4, white);
    }
    // ---- paddock-side service cores (dark glass slots) every ~90 m
    for (let x = L0 + 40; x < L1 - 30; x += 90) { BX(B, x - 4, x + 4, -1.2, backY(x) + 1.2, depthB, depthB + 2.5, backC); Q(G, [x - 0.7, 2, depthB + 2.55], [x + 0.7, 2, depthB + 2.55], [x + 0.7, backY(x) - 1, depthB + 2.55], [x - 0.7, backY(x) - 1, depthB + 2.55], glassB, [0, 0, 1]); }
    sc.statics.add(B.geometry(), 0.55, 0.08, 'main'); sc.statics.add(G.geometry(), 0.18, 0.2, 'main'); sc.statics.add(D.geometry(), 0.5, 0.3, 'clutter');
    // ---- the DHL band along the first floor (one textured mesh, replaces the old roof-name sign): 2 m boards, 4:1
    {
      const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256; const x2 = cv.getContext('2d');
      x2.fillStyle = '#fecc00'; x2.fillRect(0, 0, 1024, 256);
      try { if (EI.Ads && EI.Ads.partnerBoard) EI.Ads.partnerBoard(x2, 'dhl', 1024, 256, { lh: 0.62 }); } catch (e) { x2.fillStyle = '#d40511'; x2.font = 'italic 900 150px Arial'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText('DHL', 512, 130); }
      const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8; tex.wrapS = THREE.RepeatWrapping;
      const pos = [], uv = []; const yb = 6.9, yt = 8.9, zz = zG - 0.12;
      for (let x = L0 + 14; x < L1 - 4; x += 8) {
        const xb = Math.min(L1 - 4, x + 8); const p = [F.P(x, yb, zz), F.P(xb, yb, zz), F.P(xb, yt, zz), F.P(x, yt, zz)];
        const u0 = 0, u1 = (xb - x) / 8;
        // the board faces the track; reading direction left to right as seen from the track
        const ua = F.dirX * F.side > 0 ? [u1, u0] : [u0, u1];
        for (const [pi, uu, vv] of [[0, ua[0], 0], [1, ua[1], 0], [2, ua[1], 1], [0, ua[0], 0], [2, ua[1], 1], [3, ua[0], 1]]) { pos.push(...p[pi]); uv.push(uu, vv); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide })); mesh.name = 'wingSign'; mesh.receiveShadow = true; grp.add(mesh);
    }
    sc.wingInfo = { L0, L1, F };
  };

  // ================================================================ The Silverstone Wheel: a ~40 m observation wheel in the fan zone outside the
  // Hamilton Straight towards Abbey (seen over the stands from the grid, ref_078; behind the GA bank, ref_035 with the coral hub sign)
  Sv.buildWheel = function (E) {
    const t = E.t, sc = E.sc; const F = wingFrame(t); if (!F) return;
    const OCC = Env.OCC; const R = 19.5, hubY = 22.5;
    // outside of the straight (away from the pit side); search out from behind the stands for free, dry, road-free ground
    let spot = null;
    for (const xs of [150, 120, 175, 95]) for (let d = 70; d <= 170 && !spot; d += 6) {
      const s = t.sf + xs, i = t.idxAtS(s), sd = -F.side; const cx = t.x[i] + t.nx[i] * sd * d, cz = t.z[i] + t.nz[i] * sd * d;
      // the wheel's plane at 45 degrees to the straight: seen face-on from the grid and from across the straight
      const ax = (t.tx[i] + t.nx[i] * sd) * Math.SQRT1_2, az = (t.tz[i] + t.nz[i] * sd) * Math.SQRT1_2;
      if (E.fsAt(cx, cz) < 30) continue;
      if (E.rectFree(cx, cz, ax, az, 12, 7, OCC.BUILT | OCC.ROAD | OCC.WATER | OCC.TRACK) < 0.98) continue;
      if (E.rectFree(cx, cz, ax, az, R + 1.5, 2.5, OCC.BUILT) < 0.98) continue;
      spot = { cx, cz, ax, az };
    }
    if (!spot) { E.stats.wheel = 'no spot'; return; }
    const y = E.ground(spot.cx, spot.cz);
    const m = Env.frame(spot.cx, y, spot.cz, spot.ax, spot.az, -spot.az, spot.ax);
    const B = new Env.Builder(), D = new Env.Builder();
    const whiteS = C(0xeeeeec), steel = C(0xb7bcc1), steelD = C(0x7d838a), hubC = C(0xf08a78), base = C(0x5d6268);
    const N = 32, W = 1.3;   // rim segments, half the axle width
    const rim = (k, r) => { const a = k / N * Math.PI * 2; return [Math.cos(a) * r, hubY + Math.sin(a) * r]; };
    for (const zz of [-W, W]) for (let k = 0; k < N; k++) { const a = rim(k, R), b = rim(k + 1, R); B.beam(m, [a[0], a[1], zz], [b[0], b[1], zz], 0.42, whiteS); const ai = rim(k, R - 1.6), bi = rim(k + 1, R - 1.6); D.beam(m, [ai[0], ai[1], zz], [bi[0], bi[1], zz], 0.2, whiteS); D.beam(m, [a[0], a[1], zz], [bi[0], bi[1], zz], 0.12, steel); }
    for (let k = 0; k < N; k += 2) { const a = rim(k, R - 0.2); for (const zz of [-W, W]) B.beam(m, [0, hubY, zz * 0.6], [a[0], a[1], zz], 0.16, whiteS); const b = rim(k, R); D.beam(m, [b[0], b[1], -W], [b[0], b[1], W], 0.16, steel); }
    // the hub drum and its coral sign disc both sides
    for (const zz of [-W - 0.3, W + 0.3]) { const n = 16; for (let k = 0; k < n; k++) { const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2; const rr = 5.2;
      const p0 = Env.xf(m, 0, hubY, zz), p1 = Env.xf(m, Math.cos(a0) * rr, hubY + Math.sin(a0) * rr, zz), p2 = Env.xf(m, Math.cos(a1) * rr, hubY + Math.sin(a1) * rr, zz); if (zz > 0) B.tri(p0, p1, p2, hubC); else B.tri(p0, p2, p1, hubC); } }
    B.box(m, 2.4, 2.4, 2 * W + 1.2, 0, hubY - 1.2, 0, steelD);
    // gondolas: white cabins hanging under the rim
    for (let k = 0; k < N; k += 2) { const a = rim(k, R + 0.2); B.box(m, 1.7, 2.0, 1.6, a[0], a[1] - 2.3, 0, whiteS, { top: C(0xdedfdd), bottom: true }); D.box(m, 1.72, 0.7, 1.62, a[0], a[1] - 1.5, 0, C(0x3c4a5a)); D.beam(m, [a[0], a[1], 0], [a[0], a[1] - 0.3, 0], 0.12, steel); }
    // A-frame legs both sides, cross bracing, the base deck with the boarding stairs
    for (const zz of [-W - 1.2, W + 1.2]) { for (const sx of [-1, 1]) B.beam(m, [sx * 9.5, 0.2, zz * 2.2], [0, hubY, zz], 0.9, steel); D.beam(m, [-6.3, 7.5, zz * 1.8], [6.3, 7.5, zz * 1.8], 0.35, steel); }
    B.box(m, 22, 1.2, 12, 0, -0.6, 0, base, { top: C(0x8a8f95) }); B.box(m, 6, 3.0, 4, 0, 0.6, 5.5, C(0x24324a));
    sc.statics.add(B.geometry(), 0.45, 0.4, 'main'); sc.statics.add(D.geometry(), 0.45, 0.4, 'clutter');
    E.markRect(spot.cx, spot.cz, spot.ax, spot.az, 12, 7, OCC.BUILT);
    E.stats.wheel = [Math.round(spot.cx), Math.round(spot.cz)];
  };

  // ================================================================ hooks (Silverstone only; every other circuit runs the shared code untouched)
  if (EI.Scenery) {
    const oWing = EI.Scenery.prototype.buildWing;
    EI.Scenery.prototype.buildWing = function (grp, side) { if (!isSil(this.track)) return oWing.call(this, grp, side); try { Sv.buildWing(this, grp); } catch (e) { console.error('EnvSilverstone wing', e); } };
  }
  // js/pit.js leaves the upper facade of the team garages to the venue file that owns the pit building: the Wing above does it here
  if (EI.EnvMonza) { const oOwn = EI.EnvMonza.ownsPitFacade; EI.EnvMonza.ownsPitFacade = (t) => (oOwn ? oOwn(t) : false) || isSil(t); }
  const V = EI.EnvVenue;
  if (V) {
    const oBuild = V.build;
    V.build = function (E) {
      const r = oBuild.call(this, E);
      if (isSil(E.t)) { try { Sv.buildWheel(E); } catch (e) { console.error('EnvSilverstone wheel', e); } }
      return r;
    };
  }
})();
