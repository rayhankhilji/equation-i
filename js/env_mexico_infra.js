// Equation I - Autodromo Hermanos Rodriguez infrastructure (MEX-MODELS):
//  * the PODIUM inside the stadium section near Turn 13: on the Foro Sol annex beside the T12-T13 run, facing the track and the bowl -
//    the stage deck, the 2-1-3 rostrum, the backdrop wall (GRAN PREMIO DE LA CIUDAD DE MEXICO, F1, partner tiles, marigold border), two
//    flanking LED screens, the big TV screen above on a truss frame, the truss canopy, flag masts, marigold garlands, papel picado
//    strings over the annex (never over the lap); the two PADDOCK CLUB blocks flanking it (two storeys, white + glass, roof sails);
//  * the start-line sign gantry (cantilevered from the grandstand side) and the timing tower;
//  * the pedestrian footbridges at GEN's OSM bridge lines (stair towers clear of the pit lane, deck >= 7.6 m over the road);
//  * the PALACIO DE LOS DEPORTES (1968, Candela): the low copper dome of faceted panels on its ring wall, the four entrance buttresses;
//  * the VELODROMO OLIMPICO: the grey oval drum under its flat roof ring.
// Legs / walls / towers stand on the drawn ground (sc.height, re-read after the terrain); nothing between the barriers except the gantry /
// footbridge decks.
(function () {
  const Mx = EI.EnvMexico; if (!Mx) return;
  const U = EI.U, Env = EI.Env, K = Mx.K, C = Mx.C, Mz = EI.EnvMonza;
  const In = {}; const I4 = Mx.I4;

  // ---------------------------------------------------------------- layout: reserve footprints (trees / boards / generic boxes keep off)
  In.layout = function (E) {
    const t = E.t, OCC = Env.OCC, lm = E.data.landmarks || {}; E.mxInfra = {};
    const reserve = (poly) => { E.markPoly(poly, OCC.BUILT, 1); E.standPolys.push(poly); E.mxOwnPolys.push(poly); };
    // a spot on the pit-straight-side of the T12-T13 run (right of travel = the Foro Sol annex): candidates by s / offset from the barrier
    const spotAt = (sA, sB, side, offs, hl, hd) => {
      for (let s = sA; s <= sB; s += 6) for (const off of offs) {
        const i = t.idxAtS(s); const w = E.wallCap(i, side); const p = Mx.at(t, s, side, w + off + hd); const ax = p.tx, az = p.tz;
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [p.x + ax * u * hl + p.nx * v * hd, p.z + az * u * hl + p.nz * v * hd]);
        if (corners.some(q => E.fsAt(q[0], q[1]) < 6 || Mx.nearPit(E, q[0], q[1]) < 10)) continue;
        // (the generic venue paddock reservation covers the annex: only water and this file's own footprints block here)
        if (E.rectFree(p.x, p.z, ax, az, hl + 1, hd + 1, OCC.WATER) < 0.95 || corners.concat([[p.x, p.z]]).some(q => E.mxOwnPolys.some(P => U.pointInPoly(q[0], q[1], P)))) continue;
        { let hit = false; for (const P of E.mxOwnPolys) for (const q of P) { const dx = q[0] - p.x, dz = q[1] - p.z; if (Math.abs(dx * ax + dz * az) < hl && Math.abs(dx * p.nx + dz * p.nz) < hd) hit = true; } if (hit) continue; }
        // the front of the item faces the track: frame x along the lap, z away from it
        return { cx: p.x, cz: p.z, ax, az, nx: p.nx, nz: p.nz, hl, hd, s, y: 0, gmax: 0 };
      }
      return null;
    };
    const fit = (o) => { let gmin = Infinity, gmax = -Infinity; for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) { const g = E.sc.height(o.cx + o.ax * u * o.hl + o.nx * v * o.hd, o.cz + o.az * u * o.hl + o.nz * v * o.hd); gmin = Math.min(gmin, g); gmax = Math.max(gmax, g); } o.y = gmin; o.gmax = gmax; };
    const box = (o, pad) => E.rectPoly(o.cx, o.cz, o.ax, o.az, o.hl + pad, o.hd + pad);
    if (lm.foroSol) {
      const s13 = Mx.cs(t, 13), s12 = Mx.cs(t, 12);
      const side = -1;                                   // the right of travel on the T12-T13 run = the annex side (s12 kept for the log)
      E.mxInfra.s12 = s12;
      const pod = spotAt(s13 - 74, s13 - 40, side, [8, 10, 12, 14], 10, 7.5) || spotAt(s13 - 95, s13 - 40, side, [8, 10, 12, 14], 10, 7.5);
      if (pod) { fit(pod); reserve(box(pod, 2)); E.mxInfra.podium = pod;
        const pc = [spotAt(pod.s - 44, pod.s - 26, side, [5, 7, 9, 12], 14, 6.5) || spotAt(pod.s - 40, pod.s - 22, side, [5, 7, 9, 12], 10, 6.5), spotAt(pod.s + 26, pod.s + 70, side, [5, 7, 9, 12, 16], 14, 6.5) || spotAt(pod.s + 22, pod.s + 70, side, [5, 7, 9, 12, 16], 10, 6.5)];
        E.mxInfra.clubs = pc.filter(Boolean); for (const c of E.mxInfra.clubs) { fit(c); reserve(box(c, 1.5)); } }
    }
    // footbridges: GEN's OSM bridge lines (the deck crosses where the line crosses the lap), unless the track data lists its own
    const F = t.data.furniture || {}; const list = F.footbridges ? F.footbridges.map(([s, which]) => ({ s, which })) : (F.bridges && F.bridges.length ? [] : (lm.bridges || []).map(b => ({ s: b.s, turn: b.turn })));
    const who = ['lumi', 'intake', 'lumi2', 'intake2'];
    E.mxInfra.bridges = list.map((b, k) => Object.assign({ which: b.which || who[k % 4] }, b));
    for (const b of E.mxInfra.bridges) { const i = t.idxAtS(b.s); const q = Mx.at(t, b.s, 1, 0); b.u = {};
      for (const sd of [1, -1]) { let d = E.wallCap(i, sd) + 5.6; for (let k = 0; k < 24 && Mx.nearPit(E, q.x + t.nx[i] * sd * d, q.z + t.nz[i] * sd * d) < 9; k++) d += 2; b.u[sd] = d; reserve(E.rectPoly(q.x + t.nx[i] * sd * d, q.z + t.nz[i] * sd * d, t.nx[i], t.nz[i], 3.5, 3.5)); } }
    // the landmarks with their own footprints
    for (const k of ['palacioDeportes', 'velodrome']) if (lm[k] && lm[k].p) reserve(lm[k].p);
  };
  In.refit = function (E) {
    const I = E.mxInfra; if (!I) return; const sc = E.sc;
    for (const o of [I.podium].concat(I.clubs || [])) { if (!o) continue; let gmin = Infinity, gmax = -Infinity; for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) { const g = sc.height(o.cx + o.ax * u * o.hl + o.nx * v * o.hd, o.cz + o.az * u * o.hl + o.nz * v * o.hd); gmin = Math.min(gmin, g); gmax = Math.max(gmax, g); } o.y = gmin; o.gmax = gmax; }
    // the guests on the Paddock Club terraces: standing people in the shared crowd (shade sentinel 0.999, shade in the accessory alpha)
    const recs = E.mxBankRecs = []; const rng = U.rng(1313); const cols = ['#e8e8e4', '#1a1a1a', '#2a2b2e', '#3b404a', '#1b2a4a', '#8a1c22', '#c9b28a', '#ff6a00', '#c8102e', '#e0d8c8'].map(h => { const c = C(h); return [c.r, c.g, c.b]; });
    for (const o of I.clubs || []) { const m = frameOf(o); const L = o.hl * 2 - 1, D = o.hd * 2 - 1; const y1 = 4.0 + (o.gmax - o.y) + 0.12; const f = Mx.dir(Env.xf(m, 0, 0, 0), Env.xf(m, 0, 0, -1)); const yaw = Math.atan2(f[0], f[2]);
      for (let x = -L / 2 + 0.8; x < L / 2 - 0.8; x += 0.75) for (const z of [-D / 2 + 0.6, -D / 2 + 1.5, -D / 2 + 2.6]) { if (rng() > (z < -D / 2 + 1 ? 0.8 : 0.45)) continue; const p = Env.xf(m, x + (rng() - 0.5) * 0.3, y1, z + (rng() - 0.5) * 0.3); const sh = cols[Math.floor(rng() * cols.length)], ac = cols[Math.floor(rng() * cols.length)];
        recs.push([[p[0], p[1], p[2], yaw + (rng() - 0.5) * 0.5], [10 + Math.floor(rng() * 4), 0.93 + rng() * 0.12, rng(), rng() < 0.2 ? 1 : 0], [sh[0], sh[1], sh[2], 0.999], [ac[0], ac[1], ac[2], 0.82]]); } }
  };

  In.build = function (E, BK, out) {
    const st = out.infra = {};
    for (const [k, fn] of [['lampMasts', lampMasts], ['podium', podium], ['clubs', clubs], ['gantry', startGantry], ['footbridges', footbridges], ['palacio', palacio], ['velodrome', velodrome]]) { try { st[k] = fn(E, BK); } catch (e) { console.error('EnvMexico infra ' + k, e); } }
  };

  // ---------------------------------------------------------------- tall lamp masts with a curved arm along the run to Turn 1 (photo
  // mex_start_pack_smoke_trees_barrier), on the grandstand side, 5 m beyond the barrier, every 45 m; the poles are the main layer, the arms clutter
  function lampMasts(E, BK) {
    const t = E.t, sc = E.sc, { S, F: Fd, B } = BK; const PF = Mx.pitFrame(E); const side = PF ? -PF.side : 1; let n = 0; const grey = C(0x8f969c);
    for (let s = 260; s <= Mx.cs(t, 1) - 60; s += 45) { const i = t.idxAtS(s); const d = E.wallCap(i, side) + 5.0; const p = Mx.at(t, s, side, d); if (E.fsAt(p.x, p.z) < 3 || (E.occAt(p.x, p.z) & Env.OCC.BUILT) || Mx.nearPit(E, p.x, p.z) < 10) continue;
      const g = sc.height(p.x, p.z) - 0.3, H = 16; S.beam(I4(), [p.x, g, p.z], [p.x, g + H, p.z], 0.28, grey);
      const ax = -p.nx, az = -p.nz; let prev = [p.x, g + H, p.z]; for (let k = 1; k <= 3; k++) { const f = k / 3; const q = [p.x + ax * 2.6 * f, g + H + 1.1 * Math.sin(f * Math.PI * 0.6), p.z + az * 2.6 * f]; Fd.beam(I4(), prev, q, 0.14, grey); prev = q; }
      B.box(Env.frame(prev[0], prev[1] - 0.35, prev[2], ax, az, -az, ax), 0.9, 0.3, 0.45, 0, 0, 0, C(0x3a3d42)); n++; }
    return n;
  }
  // an item frame: x along the lap, z away from the track (+z = back), y from the item's lowest ground
  const frameOf = (o) => Env.frame(o.cx, o.y, o.cz, o.ax, o.az, o.nx, o.nz);

  // ---------------------------------------------------------------- the podium
  function podium(E, BK) {
    const I = E.mxInfra; const o = I && I.podium; if (!o) return 0; const { B, S, G, F: Fd, H, A } = BK;
    const m = frameOf(o); const P = (x, y, z) => Env.xf(m, x, y, z); const lift = o.gmax - o.y; const fwd = Mx.dir(P(0, 0, 0), P(0, 0, -1));
    // the frame may be mirrored by Env.frame (x flips): 'right as seen by the crowd' = the sign that makes x run left->right facing the stage
    const xs = (() => { const a = P(0, 0, 0), b = P(1, 0, 0); const rx = fwd[2], rz = -fwd[0]; return ((b[0] - a[0]) * rx + (b[2] - a[2]) * rz) >= 0 ? 1 : -1; })();
    const zF = -o.hd + 1.0, yD = 1.2 + lift;   // stage front, deck level
    const black = C(0x1b1c1f), deckC = C(0x2b2e33), steel = C(0x8d939a), truss = C(0xb3b8bc), marigold = C(0xe8820c), marigoldD = C(0xc96f0a), magenta = C(0xc2326e);
    // deck + skirt, front steps, the marigold garland along the front edge
    B.box(m, 16, yD + 0.3, 8, 0, -0.3, zF + 4, black, { top: deckC });
    for (let k = 0; k < 3; k++) B.box(m, 7, (k + 1) * yD / 4 + 0.3, 0.45, 0, -0.3, zF - 0.45 * (3 - k) + 0.2, C(0x24272c), { top: C(0x3a3d42) });
    for (let x = -7.8; x < 7.8; x += 0.8) Fd.beam(I4(), P(x, yD - 0.15, zF - 0.05), P(x + 0.8, yD - 0.35 - 0.15 * Math.sin((x + 7.8) / 0.8 * Math.PI) * 0 - 0.12, zF - 0.06), 0.22, (Math.floor(x / 0.8) % 2) ? marigold : marigoldD);
    // the rostrum 2 - 1 - 3 (P2 on the crowd's left), white tops, numbers on the fronts (atlas digits)
    const digR = A.region('mxPodDig', 192, 64, (x2, w, h) => { x2.fillStyle = '#1d2025'; x2.fillRect(0, 0, w, h); x2.fillStyle = '#e4e5e6'; x2.font = '900 50px Arial'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; for (let k = 0; k < 3; k++) x2.fillText(String(k + 1), k * 64 + 32, h * 0.56); });
    for (const [pos, dx, h] of [[2, -2.6, 0.75], [1, 0, 1.0], [3, 2.6, 0.5]]) { const xm = dx * xs; B.box(m, 2.4, h, 1.8, xm, yD, zF + 3.2, C(0x24272c), { top: C(0xd5d8da) });
      const k = pos - 1; Mx.faceA(A, digR, P(xm - xs * 0.5, yD + 0.08, zF + 2.29), P(xm + xs * 0.5, yD + 0.08, zF + 2.29), P(xm + xs * 0.5, yD + h - 0.08, zF + 2.29), P(xm - xs * 0.5, yD + h - 0.08, zF + 2.29), fwd, k / 3 + 0.02, (k + 1) / 3 - 0.02, 0, 1); }
    // the backdrop wall (atlas), its steel frame
    const bw = 13, bh = 6.4, zB = zF + 5.4;
    const bR = A.region('mxPodWall', 448, 224, (x2, w, h) => {
      const g = x2.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#123f27'); g.addColorStop(1, '#1f7a4a'); x2.fillStyle = g; x2.fillRect(0, 0, w, h);
      // papel picado along the top, a marigold border along the foot
      const pc = ['#e8820c', '#c2326e', '#2a8fd6', '#ffd23f', '#3fae5a', '#e04848', '#9a4fd0', '#f2f2f2']; for (let k = 0; k < 14; k++) { x2.fillStyle = pc[k % 8]; const x = k * w / 14; x2.beginPath(); x2.moveTo(x + 2, 6); x2.lineTo(x + w / 14 - 2, 6); x2.lineTo(x + w / 14 - 2, 40); x2.lineTo(x + w / 28, 48); x2.lineTo(x + 2, 40); x2.fill(); x2.fillStyle = 'rgba(27,21,48,0.6)'; x2.beginPath(); x2.arc(x + w / 28, 24, 6, 0, 7); x2.fill(); }
      x2.fillStyle = '#e8820c'; for (let k = 0; k < 40; k++) { x2.beginPath(); x2.arc((k + 0.5) * w / 40, h - 12, 9, 0, 7); x2.fill(); }
      x2.fillStyle = '#ffffff'; x2.fillRect(w * 0.36, h * 0.2, w * 0.28, h * 0.2); if (EI.Ads && EI.Ads.drawF1) EI.Ads.drawF1(x2, w * 0.5, h * 0.3, w * 0.24, h * 0.16); else Mz.paintText(x2, w * 0.28, h * 0.2, 'F1', { bg: '#ffffff', fg: '#e10600' });
      x2.save(); x2.translate(0, h * 0.44); Mz.paintText(x2, w, h * 0.16, 'GRAN PREMIO DE LA CIUDAD DE MÉXICO', { bg: 'rgba(0,0,0,0)', fg: '#f2efe6', size: 0.7, font: '800 ' }); x2.restore();
      x2.fillStyle = '#006847'; x2.fillRect(w * 0.2, h * 0.62, w * 0.2, 6); x2.fillStyle = '#e9e9e6'; x2.fillRect(w * 0.4, h * 0.62, w * 0.2, 6); x2.fillStyle = '#ce1126'; x2.fillRect(w * 0.6, h * 0.62, w * 0.2, 6);
      if (EI.Ads && EI.Ads.paintTile) for (let k = 0; k < 4; k++) { const tw = w * 0.2, th = tw / 5; x2.save(); EI.Ads.paintTile(x2, k, w * 0.08 + k * w * 0.215, h * 0.7, tw, th, 5); x2.restore(); }
    });
    Mx.faceA(A, bR, P(-xs * bw / 2, yD, zB), P(xs * bw / 2, yD, zB), P(xs * bw / 2, yD + bh, zB), P(-xs * bw / 2, yD + bh, zB), fwd);
    B.box(m, bw + 0.6, yD + bh + 0.4, 0.5, 0, -0.3, zB + 0.3, C(0x15171a));
    // two flanking LED screens on truss legs, the big TV screen above the backdrop (atlas: the broadcast picture), the truss canopy
    const scrR = A.region('mxPodScreen', 320, 180, (x2, w, h) => { x2.fillStyle = '#0b0c0f'; x2.fillRect(0, 0, w, h); const g = x2.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#2a3f5f'); g.addColorStop(0.55, '#5b7da6'); g.addColorStop(1, '#c9a35a'); x2.fillStyle = g; x2.fillRect(10, 10, w - 20, h - 20);
      x2.fillStyle = 'rgba(20,20,24,0.85)'; x2.fillRect(10, h - 50, w - 20, 40); x2.fillStyle = '#e10600'; x2.fillRect(10, h - 50, 8, 40); x2.fillStyle = '#ffffff'; x2.font = '800 17px Arial'; x2.textAlign = 'left'; x2.textBaseline = 'middle'; x2.fillText('PODIO  ·  GP DE LA CIUDAD DE MÉXICO', 28, h - 30);
      x2.fillStyle = '#e8820c'; x2.beginPath(); x2.moveTo(w * 0.2, h * 0.7); for (let k = 0; k <= 12; k++) x2.lineTo(w * (0.2 + k * 0.05), h * (0.62 - 0.18 * Math.sin(k * 0.6))); x2.lineTo(w * 0.8, h * 0.7); x2.fill(); });
    for (const sx of [-1, 1]) { const xc = sx * 11.8; const y0 = yD + 1.4, sw = 8, sh = 4.5;
      for (const dx of [-3.6, 3.6]) S.beam(I4(), P(xc + dx, -0.3, zF + 3.6), P(xc + dx, y0 + sh + 0.6, zF + 3.6), 0.35, truss);
      B.box(m, sw + 0.4, sh + 0.4, 0.4, xc, y0 - 0.2, zF + 3.9, C(0x15171a)); Mx.faceA(A, scrR, P(xc - xs * sw / 2, y0, zF + 3.68), P(xc + xs * sw / 2, y0, zF + 3.68), P(xc + xs * sw / 2, y0 + sh, zF + 3.68), P(xc - xs * sw / 2, y0 + sh, zF + 3.68), fwd); }
    { const sw = 15, sh = 8.4, y0 = yD + bh + 1.6, z = zB + 0.6; for (const dx of [-8.3, 8.3]) { S.beam(I4(), P(dx, -0.3, z + 0.5), P(dx, y0 + sh + 0.8, z + 0.5), 0.6, truss); Fd.beam(I4(), P(dx, -0.3, z + 3.5), P(dx, y0 + sh * 0.6, z + 0.6), 0.25, truss); }
      B.box(m, sw + 0.6, sh + 0.6, 0.6, 0, y0 - 0.3, z + 0.3, C(0x15171a)); Mx.faceA(A, scrR, P(-xs * sw / 2, y0, z - 0.02), P(xs * sw / 2, y0, z - 0.02), P(xs * sw / 2, y0 + sh, z - 0.02), P(-xs * sw / 2, y0 + sh, z - 0.02), fwd); }
    { const yT = yD + bh + 1.0; for (const x of [-7.8, 7.8]) for (const z of [zF + 0.4, zB - 0.4]) S.beam(I4(), P(x, yD, z), P(x, yT, z), 0.32, truss);
      for (const z of [zF + 0.4, zB - 0.4]) { S.beam(I4(), P(-7.8, yT, z), P(7.8, yT, z), 0.4, truss); for (let x = -7.8; x < 7.7; x += 1.95) Fd.beam(I4(), P(x, yT - 0.5, z), P(x + 1.95, yT, z), 0.1, truss); Fd.beam(I4(), P(-7.8, yT - 0.5, z), P(7.8, yT - 0.5, z), 0.14, truss); }
      for (const x of [-7.8, -2.6, 2.6, 7.8]) Fd.beam(I4(), P(x, yT, zF + 0.4), P(x, yT, zB - 0.4), 0.2, truss);
      for (let x = -6.5; x <= 6.5; x += 2.6) H.box(m, 0.5, 0.4, 0.5, x, yT - 0.75, zF + 0.6, C(0x2a2d33)); }
    // flag masts either side of the stage (Mexico and Mexico + the chequered flag for the winner)
    const fl = Mx.flagRegions(A); const chq = A.region('mxFlagChq', 96, 64, (x2, w, h) => { for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) { x2.fillStyle = (i + j) % 2 ? '#111' : '#e9e9e9'; x2.fillRect(i * w / 6, j * h / 4, w / 6 + 1, h / 4 + 1); } });
    for (const [x, r] of [[-17.2, fl[0]], [17.2, fl[0]], [-15.4, chq], [15.4, fl[0]]]) { const p0 = P(x, -0.3, zF + 6.5), p1 = P(x, 14.5, zF + 6.5); S.beam(I4(), p0, p1, 0.16, C(0xc9cdd1)); if (Mz.Stands && Mz.Stands.flag) Mz.Stands.flag(A, r, P(x, 14.4, zF + 6.5), Math.atan2(fwd[0], fwd[2]) + Math.PI / 2, 3.2, 2.0); }
    // marigold urns + a magenta bougainvillea bank at the deck corners
    for (const sx of [-1, 1]) { B.box(m, 2.2, yD + 0.5, 2.2, sx * 9.4, -0.3, zF + 1.0, marigoldD, { top: marigold }); B.box(m, 1.4, yD + 1.1, 1.4, sx * 9.4, -0.3, zF + 1.0, magenta); }
    // the crowd barrier round the pen in front of the stage (on the annex, clear of the circuit wall)
    for (let x = -12; x < 12; x += 2.4) Fd.box(m, 2.3, 1.1, 0.12, x + 1.2, -0.2, zF - 3.0, C(0x9aa0a6));
    // papel picado strings over the annex (between the two masts at the stage ends and the backdrop frame; never over the lap)
    { const pc = ['#e8820c', '#c2326e', '#2a8fd6', '#ffd23f', '#3fae5a', '#e04848', '#9a4fd0', '#e9e9e6']; const R = pc.map((c, k) => A.region('mxPicado' + k, 32, 40, (x2, w, h) => { x2.clearRect(0, 0, w, h); x2.fillStyle = c; x2.beginPath(); x2.moveTo(0, 0); x2.lineTo(w, 0); x2.lineTo(w, h * 0.8); x2.lineTo(w / 2, h); x2.lineTo(0, h * 0.8); x2.fill(); x2.fillStyle = 'rgba(0,0,0,0.35)'; x2.beginPath(); x2.arc(w / 2, h * 0.4, w * 0.18, 0, 7); x2.fill(); }));
      for (const [a, b] of [[P(-17.2, 13.6, zF + 6.5), P(-8.3, yD + bh + 10.2, zB + 1.1)], [P(8.3, yD + bh + 10.2, zB + 1.1), P(17.2, 13.6, zF + 6.5)], [P(-17.2, 12.4, zF + 6.5), P(-7.8, yD + bh + 1.0, zF + 0.4)], [P(7.8, yD + bh + 1.0, zF + 0.4), P(17.2, 12.4, zF + 6.5)]]) {
        const L = Math.hypot(b[0] - a[0], b[2] - a[2]); const n = Math.max(4, Math.round(L / 0.55));
        for (let k = 0; k < n; k++) { const u = (k + 0.5) / n; const sag = Math.sin(u * Math.PI) * 1.4; const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u - sag, z = a[2] + (b[2] - a[2]) * u; const tx = (b[0] - a[0]) / L * 0.18, tz = (b[2] - a[2]) / L * 0.18;
          const q0 = [x - tx, y, z - tz], q1 = [x + tx, y, z + tz], q2 = [x + tx, y - 0.42, z + tz], q3 = [x - tx, y - 0.42, z - tz]; A.quad(R[k % 8], q3, q2, q1, q0); A.quad(R[k % 8], q2, q3, q0, q1); }
        // the string follows the same sag
        for (let k = 0; k < 8; k++) { const u0 = k / 8, u1 = (k + 1) / 8; const pt = (u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - Math.sin(u * Math.PI) * 1.4 + 0.01, a[2] + (b[2] - a[2]) * u]; Fd.beam(I4(), pt(u0), pt(u1), 0.03, C(0x6b6f74)); } } }
    E.stats.mexico.podium = { x: Math.round(o.cx), z: Math.round(o.cz), s: Math.round(o.s), y: +o.y.toFixed(2) };
    return 1;
  }
  // ---------------------------------------------------------------- the Paddock Club blocks flanking the podium (photo mex_stadium_green_heineken_kerb):
  // long two-storey white blocks, a glazed ground floor, an open first-floor terrace full of guests under the flat white roof, a deep BLACK
  // fascia ('F1 PADDOCK CLUB', the event lettering), a black mid band ('WHERE ADRENALINE MEETS ELEGANCE'), one Heineken-green bay
  function clubs(E, BK) {
    const I = E.mxInfra; let n = 0; const { B, G, S, F: Fd, A } = BK;
    const fasR = A.region('mxClubFascia', 512, 48, (x2, w, h) => { x2.fillStyle = '#121316'; x2.fillRect(0, 0, w, h); if (EI.Ads && EI.Ads.drawF1) EI.Ads.drawF1(x2, h * 1.1, h * 0.5, h * 1.6, h * 0.5, '#e8e8e8'); x2.fillStyle = '#e8e8e8'; x2.font = '800 ' + Math.round(h * 0.42) + 'px Arial'; x2.textAlign = 'left'; x2.textBaseline = 'middle'; x2.fillText('PADDOCK CLUB', h * 2.1, h * 0.53); x2.fillStyle = '#ce1126'; x2.fillRect(w * 0.62, h * 0.2, 3, h * 0.6); x2.fillStyle = '#d8d8d8'; x2.font = '700 ' + Math.round(h * 0.36) + 'px Arial'; x2.fillText('MÉXICO CITY', w * 0.65, h * 0.53); });
    const midR = A.region('mxClubMid', 512, 24, (x2, w, h) => { x2.fillStyle = '#121316'; x2.fillRect(0, 0, w, h); x2.fillStyle = '#e2e2e2'; x2.font = '700 ' + Math.round(h * 0.62) + 'px Arial'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText('WHERE  ADRENALINE  MEETS  ELEGANCE', w / 2, h * 0.55); });
    const heiR = A.region('mxClubHei', 256, 48, (x2, w, h) => { x2.fillStyle = '#1f8a4c'; x2.fillRect(0, 0, w, h); if (EI.Ads && EI.Ads.drawPartner) EI.Ads.drawPartner(x2, 'heineken', w / 2, h / 2, w * 0.8, h * 0.62, { tone: 'white' }); else Mz.paintText(x2, w, h, 'Heineken', { bg: '#1f8a4c', fg: '#ffffff' }); });
    for (const o of (I && I.clubs) || []) {
      const m = frameOf(o); const P = (x, y, z) => Env.xf(m, x, y, z); const lift = o.gmax - o.y; const L = o.hl * 2 - 1, D = o.hd * 2 - 1, hl = L / 2, hd = D / 2;
      const white = C(0xcdd0d2), whiteS = C(0xc4c7c9), glass = C(0x2a3846), glassL = C(0x3d5265), frame = C(0xb3b8bc), black = C(0x16171a), green = C(0x1f7a4a);
      const F = Mx.dir(P(0, 0, 0), P(0, 0, -1)); const y1 = 4.0 + lift, yB = y1 + 0.9, y2 = y1 + 4.2;
      // ground floor box (glazed front towards the track), the first-floor slab, the back + end walls of the terrace, the roof slab
      B.box(m, L, y1 + 0.3, D, 0, -0.3, 0, whiteS, { top: C(0xb9bcbe) });
      Mx.face(G, P(-hl + 0.6, lift + 0.4, -hd - 0.03), P(hl - 0.6, lift + 0.4, -hd - 0.03), P(hl - 0.6, y1 - 0.4, -hd - 0.03), P(-hl + 0.6, y1 - 0.4, -hd - 0.03), glassL, F);
      B.box(m, L, y2 - y1, 0.4, 0, y1, hd - 0.2, white); for (const sx of [-1, 1]) B.box(m, 0.4, y2 - y1, D, sx * (hl - 0.2), y1, 0, white);
      Mx.face(G, P(-hl + 0.6, y1 + 1.2, hd - 0.42), P(hl - 0.6, y1 + 1.2, hd - 0.42), P(hl - 0.6, y2 - 0.6, hd - 0.42), P(-hl + 0.6, y2 - 0.6, hd - 0.42), glass, F);
      B.box(m, L + 1.0, 0.5, D + 1.6, 0, y2, -0.6, white, { bottom: true, top: C(0x959a9e) });
      for (let x = -hl + 4; x < hl - 2; x += 6) S.beam(Mx.I4(), P(x, y1, -hd + 0.4), P(x, y2, -hd + 0.4), 0.3, frame);
      // the terrace rail (glass) with the black mid band below it; the deep black fascia on the roof edge (signs in the atlas)
      Mx.face(G, P(-hl, y1 + 0.02, -hd - 0.05), P(hl, y1 + 0.02, -hd - 0.05), P(hl, yB + 0.1, -hd - 0.05), P(-hl, yB + 0.1, -hd - 0.05), C(0x8aa7b2), F);
      Mx.face(B, P(-hl, y1 - 0.7, -hd - 0.06), P(hl, y1 - 0.7, -hd - 0.06), P(hl, y1 + 0.02, -hd - 0.06), P(-hl, y1 + 0.02, -hd - 0.06), black, F);
      Mx.face(B, P(-hl - 0.5, y2 - 1.1, -hd - 1.42), P(hl + 0.5, y2 - 1.1, -hd - 1.42), P(hl + 0.5, y2 + 0.5, -hd - 1.42), P(-hl - 0.5, y2 + 0.5, -hd - 1.42), black, F);
      const nb = Math.max(2, Math.floor(L / 9)); const hb = Math.floor(nb * 0.7);
      for (let k = 0; k < nb; k++) { const xa = -hl + k * L / nb + 0.3, xb = -hl + (k + 1) * L / nb - 0.3; const [l, r] = Mx.lr(F, P(xa, 0, -hd - 1.45), P(xb, 0, -hd - 1.45)); const y0 = o.y + y2 - 1.0, yt = o.y + y2 + 0.4;
        Mx.faceA(A, k === hb ? heiR : fasR, [l[0], y0, l[2]], [r[0], y0, r[2]], [r[0], yt, r[2]], [l[0], yt, l[2]], F);
        const [l2, r2] = Mx.lr(F, P(xa, 0, -hd - 0.08), P(xb, 0, -hd - 0.08)); Mx.faceA(A, midR, [l2[0], o.y + y1 - 0.62, l2[2]], [r2[0], o.y + y1 - 0.62, r2[2]], [r2[0], o.y + y1 - 0.08, r2[2]], [l2[0], o.y + y1 - 0.08, l2[2]], F);
        if (k === hb) { B.box(m, xb - xa, y2 - y1 - 0.2, 0.3, (xa + xb) / 2, y1, hd - 0.6, green); for (const x of [xa, xb]) B.box(m, 0.5, y2 - lift + 0.3, 0.5, x, -0.3, -hd + 0.2, green); } }
      n++;
    }
    return n;
  }

  // ---------------------------------------------------------------- the start-line sign gantry + timing tower (as COTA: a cantilever from the
  // grandstand side; nothing stands on the pit side - the strip between the pit wall and the lane, and the lane itself, stay clear)
  function startGantry(E, BK) {
    const { B, S, F: Fd, A } = BK; const t = E.t, sc = E.sc; const F = t.data.furniture || {};
    const s = t.sf + (F.startGantry != null ? F.startGantry : 6) + 3.4; const i = t.idxAtS(s);
    const PF = Mx.pitFrame(E); const pside = PF ? PF.side : -1;
    const dP = (pside < 0 ? t.wallL[i] : t.wallR[i]) - 0.3, dO = (pside < 0 ? t.wallR[i] : t.wallL[i]) + 1.4;
    const A0 = Mx.at(t, s, pside, dP), A1 = Mx.at(t, s, -pside, dO); const ty = A0.y;
    const ux = A1.x - A0.x, uz = A1.z - A0.z, span = Math.hypot(ux, uz), ax = ux / span, az = uz / span; const tx = A0.tx, tz = A0.tz;
    const W = (u, y, v) => [A0.x + ax * u + tx * v, ty + y, A0.z + az * u + tz * v];
    const white = C(0xd9dcdd), grey = C(0x8c9399), I = I4(); const yD = 8.9, dep = 2.2, hw = 0.8;
    { const u = span + 0.9; const hv = 1.6; let g = Infinity; for (const v of [-hv, hv]) for (const du of [-0.5, 0.5]) { const p = W(u + du, 0, v); g = Math.min(g, sc.height(p[0], p[2]) - ty - 0.3); }
      for (const v of [-hv, hv]) for (const du of [-0.5, 0.5]) S.beam(I, W(u + du, g, v), W(u + du, yD + dep, v), 0.2, grey);
      for (let y = g + 1.0; y < yD; y += 1.2) for (const v of [-hv, hv]) Fd.beam(I, W(u - 0.5, y, v), W(u + 0.5, y + 1.2, v), 0.07, grey);
      const ub2 = u + 6.0; const pb = W(ub2, 0, 0); const gb = sc.height(pb[0], pb[2]) - ty - 0.3; for (const v of [-hv, hv]) S.beam(I, W(u + 0.5, yD + dep, v), W(ub2, gb + 0.3, v * 0.6), 0.18, grey);
      B.box(Env.frame(...W(u, 0, 0).map((q, k) => k === 1 ? q + g : q), ax, az, tx, tz), 1.6, 0.6, 4.0, 0, 0, 0, C(0xa9adb0));
      B.box(Env.frame(...W(ub2, 0, 0).map((q, k) => k === 1 ? q + gb : q), ax, az, tx, tz), 1.2, 0.6, 2.6, 0, 0, 0, C(0xa9adb0)); }
    const ua = -0.2, ub = span + 1.4;
    for (const y of [yD, yD + dep]) for (const v of [-hw, hw]) S.beam(I, W(ua, y, v), W(ub, y, v), 0.2, white);
    const nb = Math.max(4, Math.round((ub - ua) / 2.2)), bl = (ub - ua) / nb;
    for (const v of [-hw, hw]) for (let k = 0; k < nb; k++) { const u = ua + k * bl; Fd.beam(I, W(u, yD, v), W(u, yD + dep, v), 0.1, white); Fd.beam(I, W(u, yD, v), W(u + bl, yD + dep, v), 0.08, white); }
    K.dq(B, W(ua, yD - 0.05, -hw), W(ub, yD - 0.05, -hw), W(ub, yD - 0.05, hw), W(ua, yD - 0.05, hw), C(0xc9cccf));
    const r = A.region('mxGantryBanner', 1024, 80, (x2, w, h) => { if (EI.Ads && EI.Ads.paintBanner) EI.Ads.paintBanner(x2, w, h, (ub - ua - 1) / (dep - 0.5)); else Mx.paintBand(x2, w, h, 'GRAN PREMIO DE LA CIUDAD DE MÉXICO'); });
    for (const v of [-hw - 0.05, hw + 0.05]) { const want = [tx * Math.sign(v), 0, tz * Math.sign(v)]; const [l, rr] = Mx.lr(want, W(ua + 0.5, yD + 0.25, v), W(ub - 0.5, yD + 0.25, v)); Mx.faceA(A, r, l, rr, [rr[0], ty + yD + dep - 0.25, rr[2]], [l[0], ty + yD + dep - 0.25, l[2]], want); }
    // timing tower beside the outer edge, before the line: grey lattice, black screen facing the cars on the approach
    { const u = span + 3.4, v = -6; const p = W(u, 0, v); const g = sc.height(p[0], p[2]) - ty - 0.3; const yT = 10.5;
      for (const [du, dv] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) S.beam(I, W(u + du, g, v + dv), W(u + du, yT, v + dv), 0.12, grey);
      for (let y = g + 1; y < yT - 1; y += 1.3) Fd.beam(I, W(u - 0.5, y, v - 0.5), W(u + 0.5, y + 1.3, v - 0.5), 0.05, grey);
      const sw = 1.9, sh = 3.6, yS = yT - 0.2; B.box(Env.frame(...W(u, yS, v - 0.2), ax, az, tx, tz), sw + 0.3, sh + 0.3, 0.5, 0, 0, 0, C(0x1b1d22));
      B.box(Env.frame(...W(u, yS + sh + 0.3, v - 0.2), ax, az, tx, tz), sw + 0.5, 0.4, 0.7, 0, 0, 0, C(0x2a2d33));
      const sr = A.region('mxTiming', 64, 128, (x2, w, h) => { x2.fillStyle = '#0b0c0e'; x2.fillRect(0, 0, w, h); x2.font = '700 12px Arial'; x2.textAlign = 'left'; ['1 VER', '2 NOR', '3 LEC', '4 RUS', '5 HAM', '6 PIA', '7 ANT', '8 PER'].forEach((q, k) => { x2.fillStyle = k ? '#e8e8e8' : '#ffd200'; x2.fillText(q, 5, 15 + k * 14); }); });
      const vv = v - 0.48; Mx.faceA(A, sr, W(u - sw / 2, yS + 0.15, vv), W(u + sw / 2, yS + 0.15, vv), W(u + sw / 2, yS + 0.15 + sh, vv), W(u - sw / 2, yS + 0.15 + sh, vv), [-tx, 0, -tz]); }
    return { s: +s.toFixed(1), span: +span.toFixed(1) };
  }

  // ---------------------------------------------------------------- pedestrian footbridges (stair towers + box truss + partner panels)
  function footbridges(E, BK) { let n = 0; for (const b of (E.mxInfra && E.mxInfra.bridges) || []) if (footbridge(E, BK, b)) n++; return n; }
  function footbridge(E, BK, br) {
    const t = E.t, sc = E.sc, { B, S, F: Fd, A } = BK; const s = br.s; const i = t.idxAtS(s); const q = Mx.at(t, s, 1, 0); const I = I4();
    const wl = br.u[1] - 2.6, wr = br.u[-1] - 2.6;
    const W0 = (u, v) => [q.x + t.nx[i] * u + q.tx * v, q.z + t.nz[i] * u + q.tz * v];
    let yRoad = q.y; for (let u = -wr; u <= wl; u += 2) { const p = W0(u, 0); yRoad = Math.max(yRoad, sc.height(p[0], p[1])); }
    const y0 = yRoad; const W = (u, y, v) => [q.x + t.nx[i] * u + q.tx * v, y0 + y, q.z + t.nz[i] * u + q.tz * v];
    const yD = 7.6, dep = 2.6, hw = 1.4; const ua = -wr, ub = wl; const main = br.turn === 16 ? C(0xa8262d) : C(0xa9a8a3), mainD = br.turn === 16 ? C(0x7e1d22) : C(0x8d8c87), cl = C(0xb0aea8), clD = C(0x9a9891), accent = br.turn === 16 ? C(0xb8232b) : C(0x9aa0a6);
    for (const uc of [ua - 2.6, ub + 2.6]) {
      let gm = Infinity; for (const [du, dv] of [[-2.5, -2.5], [2.5, -2.5], [2.5, 2.5], [-2.5, 2.5], [0, 0]]) { const p = W(uc + du, 0, dv); gm = Math.min(gm, sc.height(p[0], p[2]) - y0); }
      if (yD - gm > 30) return false;
      const Ht = yD + dep + 0.6;
      for (const [p0, p1] of [[[-2.5, -2.5], [2.5, -2.5]], [[2.5, -2.5], [2.5, 2.5]], [[2.5, 2.5], [-2.5, 2.5]], [[-2.5, 2.5], [-2.5, -2.5]]]) { let k = 0; for (let y = gm - 0.4; y < Ht - 0.01; y += 1.0, k++) K.dq(B, W(uc + p0[0], y, p0[1]), W(uc + p1[0], y, p1[1]), W(uc + p1[0], Math.min(Ht, y + 1.0), p1[1]), W(uc + p0[0], Math.min(Ht, y + 1.0), p0[1]), k % 2 ? cl : clD); }
      K.dq(B, W(uc - 2.7, Ht, -2.7), W(uc + 2.7, Ht, -2.7), W(uc + 2.7, Ht, 2.7), W(uc - 2.7, Ht, 2.7), accent);
    }
    K.dq(B, W(ua, yD, -hw), W(ub, yD, -hw), W(ub, yD, hw), W(ua, yD, hw), C(0x2b2f35)); K.dq(B, W(ua, yD + dep, -hw), W(ub, yD + dep, -hw), W(ub, yD + dep, hw), W(ua, yD + dep, hw), main);
    const span = ub - ua, nb = Math.max(4, Math.round(span / 3.2)), bl = span / nb;
    for (const v of [-hw, hw]) { S.beam(I, W(ua, yD, v), W(ub, yD, v), 0.3, main); S.beam(I, W(ua, yD + dep, v), W(ub, yD + dep, v), 0.3, main); for (let k = 0; k <= nb; k++) Fd.beam(I, W(ua + k * bl, yD, v), W(ua + k * bl, yD + dep, v), 0.14, mainD); for (let k = 0; k < nb; k++) Fd.beam(I, W(ua + k * bl, yD, v), W(ua + (k + 1) * bl, yD + dep, v), 0.1, mainD); }
    const r = br.turn === 16 ? A.region('mxBridgeMX', 640, 60, (x2, w, h) => { x2.fillStyle = '#b8232b'; x2.fillRect(0, 0, w, h); x2.fillStyle = '#f2efe9'; x2.font = 'italic 800 ' + Math.round(h * 0.62) + 'px Arial'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText('MEXICO CITY', w * 0.42, h * 0.52); x2.font = '700 ' + Math.round(h * 0.3) + 'px Arial'; x2.fillText('#MexicoGP', w * 0.84, h * 0.55); }) : A.region('mxBridge_' + br.which, 640, 60, (x2, w, h) => { if (EI.Ads && EI.Ads.paintBridge) { x2.fillStyle = '#ffffff'; x2.fillRect(0, 0, w, h); EI.Ads.paintBridge(x2, br.which, w, h, (span - 1) / (dep - 0.6)); } else Mz.paintText(x2, w, h, 'trylumi.co', { bg: '#1b1530', fg: '#ffffff' }); });
    for (const v of [-hw - 0.04, hw + 0.04]) { const want = [q.tx * Math.sign(v), 0, q.tz * Math.sign(v)]; const [l, rr] = Mx.lr(want, W(ua + 0.5, yD + 0.35, v), W(ub - 0.5, yD + 0.35, v)); Mx.faceA(A, r, l, rr, [rr[0], y0 + yD + dep - 0.35, rr[2]], [l[0], y0 + yD + dep - 0.35, l[2]], want); }
    return true;
  }

  // ---------------------------------------------------------------- the Palacio de los Deportes: the copper dome on its ring wall
  function palacio(E, BK) {
    const lm = E.data.landmarks && E.data.landmarks.palacioDeportes; if (!lm || !lm.p) return 0; const { B, S, F: Fd } = BK; const sc = E.sc;
    const c = Mx.centroid(lm.p); const ds = lm.p.map(q => Math.hypot(q[0] - c[0], q[1] - c[1])).sort((a, b) => a - b); const R = ds[Math.floor(ds.length * 0.35)];
    let g = Infinity; for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; g = Math.min(g, sc.height(c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R)); } g -= 0.4;
    const Hd = Math.max(26, lm.h || 35), yW = 7.5; const NSEG = 40, NR = 7;
    const cu = [C(0x614737), C(0x5a4234), C(0x553e31), C(0x674c3b)], ring = C(0xa9a59b), ringD = C(0x8e8a81), glass = C(0x2a3540);
    const Q = (a, r, y) => [c[0] + Math.cos(a) * r, g + y, c[1] + Math.sin(a) * r];
    // the ring wall (concrete with a glazed band), a slight batter
    for (let k = 0; k < NSEG; k++) { const a0 = k / NSEG * Math.PI * 2, a1 = (k + 1) / NSEG * Math.PI * 2, am = (a0 + a1) / 2; const out = [Math.cos(am), 0, Math.sin(am)];
      Mx.face(B, Q(a0, R + 1.0, 0), Q(a1, R + 1.0, 0), Q(a1, R, yW), Q(a0, R, yW), k % 2 ? ring : ringD, out); Mx.face(B, Q(a0, R + 0.9, 1.2), Q(a1, R + 0.9, 1.2), Q(a1, R + 0.45, 4.6), Q(a0, R + 0.45, 4.6), glass, out); }
    // the dome: a shallow cap (spherical section through the ring top and the crown), faceted panels in alternating copper tones
    const hc = Hd - yW; const Rs = (R * R + hc * hc) / (2 * hc); const yc = yW + hc - Rs;
    const ringR = (j) => { const th = Math.asin(Math.min(1, R / Rs)) * (1 - j / NR); return [Rs * Math.sin(th), yc + Rs * Math.cos(th)]; };
    for (let j = 0; j < NR; j++) { const [r0, y0] = ringR(j), [r1, y1] = ringR(j + 1); const nseg = j >= NR - 2 ? NSEG / 2 : NSEG;
      for (let k = 0; k < nseg; k++) { const a0 = k / nseg * Math.PI * 2 + (j % 2) * Math.PI / nseg, a1 = (k + 1) / nseg * Math.PI * 2 + (j % 2) * Math.PI / nseg, am = (a0 + a1) / 2; const up = [Math.cos(am) * 0.5, 1, Math.sin(am) * 0.5]; const col = cu[(k + j * 3) % 4];
        if (j === NR - 1) Mx.tri(B, Q(a0, r0, y0), Q(a1, r0, y0), Q(am, r1, y1), col, up); else { const mid = Q(am, (r0 + r1) / 2 * 1.002, (y0 + y1) / 2 + 0.25); Mx.tri(B, Q(a0, r0, y0), Q(a1, r0, y0), mid, col, up); Mx.tri(B, Q(a1, r0, y0), Q(a1, r1, y1), mid, cu[(k + j * 3 + 1) % 4], up); Mx.tri(B, Q(a1, r1, y1), Q(a0, r1, y1), mid, col, up); Mx.tri(B, Q(a0, r1, y1), Q(a0, r0, y0), mid, cu[(k + j * 3 + 2) % 4], up); } } }
    // the eaves ring and ribs (the panel seams: the clutter layer)
    for (let k = 0; k < NSEG; k++) { const a0 = k / NSEG * Math.PI * 2, a1 = (k + 1) / NSEG * Math.PI * 2; Mx.face(B, Q(a0, R + 0.6, yW - 0.4), Q(a1, R + 0.6, yW - 0.4), Q(a1, R + 0.6, yW + 0.3), Q(a0, R + 0.6, yW + 0.3), C(0x6f5032), [Math.cos(a0), 0, Math.sin(a0)]); }
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; for (let j = 0; j < NR; j++) { const [r0, y0] = ringR(j), [r1, y1] = ringR(j + 1); Fd.beam(I4(), Q(a, r0 + 0.1, y0 + 0.15), Q(a, r1 + 0.1, y1 + 0.15), 0.35, C(0x6f5032)); } }
    // the entrance buttresses at the footprint's spurs (the points well beyond the ring)
    let nb = 0; for (const q of lm.p) { const d = Math.hypot(q[0] - c[0], q[1] - c[1]); if (d < R + 14) continue; const a = Math.atan2(q[1] - c[1], q[0] - c[0]); const gq = sc.height(q[0], q[1]) - 0.3; const p0 = Q(a, R + 0.5, yW + 2), p1 = [q[0], gq + 0.0, q[1]];
      // an entrance ramp / buttress: a sloped wedge from the ground at the spur up to the ring wall's top, two side faces
      const ca = Math.cos(a), sa = Math.sin(a), px = -sa * 2.4, pz = ca * 2.4; const top = [c[0] + ca * (R + 0.6), g + yW, c[1] + sa * (R + 0.6)];
      const A0 = [p1[0] + px, gq, p1[2] + pz], A1 = [p1[0] - px, gq, p1[2] - pz], T0 = [top[0] + px, top[1], top[2] + pz], T1 = [top[0] - px, top[1], top[2] - pz], F0 = [top[0] + px, g, top[2] + pz], F1 = [top[0] - px, g, top[2] - pz];
      Mx.face(B, A0, A1, T1, T0, ring, [ca, 1, sa]); Mx.tri(B, A0, F0, T0, ringD, [-sa, 0, ca]); Mx.tri(B, A1, F1, T1, ringD, [sa, 0, -ca]); nb++; if (nb >= 8) break; }
    E.stats.mexico.palacio = { x: Math.round(c[0]), z: Math.round(c[1]), R: +R.toFixed(1), H: Hd };
    return 1;
  }
  // ---------------------------------------------------------------- the Velodromo Olimpico: the oval drum, the roof ring, a low centre dome
  function velodrome(E, BK) {
    const lm = E.data.landmarks && E.data.landmarks.velodrome; if (!lm || !lm.p) return 0; const { B, F: Fd } = BK; const sc = E.sc;
    const P = lm.p; const c = Mx.centroid(P); let g = Infinity; for (const q of P) g = Math.min(g, sc.height(q[0], q[1])); g -= 0.4; const Hh = Math.min(22, lm.h || 18);
    const wall = [C(0xa7a9a6), C(0x9a9c99)], band = C(0x3a4148), roof = C(0x8f9497), roofT = C(0xb9bdbf);
    const n = P.length;
    for (let k = 0; k < n; k++) { const a = P[k], b = P[(k + 1) % n]; const ex = b[0] - a[0], ez = b[1] - a[1]; const el = Math.hypot(ex, ez) || 1; let ox = ez / el, oz = -ex / el; if (U.pointInPoly((a[0] + b[0]) / 2 + ox * 0.5, (a[1] + b[1]) / 2 + oz * 0.5, P)) { ox = -ox; oz = -oz; } const out = [ox, 0, oz];
      Mx.face(B, [a[0], g, a[1]], [b[0], g, b[1]], [b[0], g + Hh, b[1]], [a[0], g + Hh, a[1]], wall[k % 2], out); Mx.face(B, [a[0], g + Hh * 0.55, a[1]], [b[0], g + Hh * 0.55, b[1]], [b[0], g + Hh * 0.68, b[1]], [a[0], g + Hh * 0.68, a[1]], band, [out[0] * 1.001, 0, out[2] * 1.001]);
      const ia = [c[0] + (a[0] - c[0]) * 0.55, c[1] + (a[1] - c[1]) * 0.55], ib = [c[0] + (b[0] - c[0]) * 0.55, c[1] + (b[1] - c[1]) * 0.55];
      Mx.face(B, [a[0], g + Hh, a[1]], [b[0], g + Hh, b[1]], [ib[0], g + Hh + 2.5, ib[1]], [ia[0], g + Hh + 2.5, ia[1]], roofT, [0, 1, 0]);
      Mx.tri(B, [ia[0], g + Hh + 2.5, ia[1]], [ib[0], g + Hh + 2.5, ib[1]], [c[0], g + Hh + 6, c[1]], roof, [0, 1, 0]); }
    return 1;
  }

  Mx.Infra = In;
})();
