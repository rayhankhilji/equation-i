// Equation I - Yas Marina architecture after the reference photos: the white tensile sail canopies over every grandstand and the
// pit building, the pit building's glazed hospitality decks, the paddock's marina-facing team buildings with their rows of white
// peaked tents, the two race control towers (white tapered shafts, a dark glass band under a flared cap), the white tube bridge over
// the pit straight that carries the start lights, and the floodlight towers every ~60 m round the lap. Every light source registers
// with EI.Night (floods baked into the light map, glow sprites); lit surfaces use the street kit's per-vertex emissive.
// Called from EI.EnvYas.build with its helpers; everything static is written into the batches it passes (one mesh, one draw call).
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  const C = (h) => new THREE.Color(h).convertSRGBToLinear();
  const Arch = {};
  const SKx = () => EI.StreetKit;
  const NI = () => EI.Night;
  const isNight = () => !!(EI.Night && EI.Night.on);
  const glow = (p, size, col, opts) => { if (isNight()) NI().addGlow(p[0], p[1], p[2], size, col, opts); };
  const flood = (p, opts) => { if (isNight()) NI().addFlood(p[0], p[1], p[2], opts); };
  const xf = (m, x, y, z) => EI.Env.xf(m, x, y, z);

  // ---------------------------------------------------------------- data hooks (at load): the North (hairpin) and West (Turns 6-7)
  // grandstands wrap their corners, so the venue's straight block from the footprint's centroid does not fit them: they become
  // stand runs following the lap instead. Sail canopies replace the venue's flat stand roofs.
  const ED = EI.ENVDATA && EI.ENVDATA.abudhabi;
  if (ED) {
    ED.sailRoofs = true;
    ED.standRuns = (ED.standRuns || []).concat([
      [2380, 2712, -1, 3, 15, false, 0x8c1d24],   // West Grandstand at the Turn 6-7 chicane
    ]);
    // the North Grandstand: one continuous horseshoe round the outside of the Turn 5 hairpin under one scalloped tent roof (u5)
    ED.northStand = { s0: 1196, s1: 1492, side: -1, gap: 3.4, rows: 22, seat: 0x33507a, chord: 7.5 };
  }
  // the horseshoe: the venue's straight stand blocks cannot follow the hairpin, so the stand is cut into short chords along a
  // smoothed line just behind the barrier; the venue builds their tiers, crowd and front walls, this file fills the wedges between
  // them and builds the continuous roof, back and stair towers (EI.EnvYasArch.build -> northStand)
  if (EI.EnvVenue) {
    const origLS = EI.EnvVenue.layoutStands;
    EI.EnvVenue.layoutStands = function (E) {
      const r = origLS.call(this, E);
      if (E.data.kind === 'desert' && E.data.northStand) { try { northLayout(E, E.data.northStand); } catch (e) { console.error('EnvYasArch northLayout', e); } }
      return r;
    };
  }
  function northLayout(E, N) {
    const t = E.t, OCC = EI.Env.OCC, pr = {};
    // the front line: barrier + gap, smoothed, resampled into equal chords
    let P = []; let ySum = 0, yN = 0;
    for (let s = N.s0; s <= N.s1 + 0.01; s += 2) { const f = lapFrame(t, s, N.side); const d = E.wallCap(f.i, N.side) + N.gap; P.push([f.x + f.nx * d, f.z + f.nz * d]); ySum += f.y; yN++; }
    yN = ySum / yN - 0.03;
    for (let it = 0; it < 4; it++) P = P.map((p, k) => k === 0 || k === P.length - 1 ? p : [(P[k - 1][0] + 2 * p[0] + P[k + 1][0]) / 4, (P[k - 1][1] + 2 * p[1] + P[k + 1][1]) / 4]);
    const cum = [0]; for (let k = 1; k < P.length; k++) cum.push(cum[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
    const Lt = cum[cum.length - 1], K = Math.max(2, Math.round(Lt / N.chord)); const F = [];
    for (let k = 0, j = 0; k <= K; k++) { const a = Lt * k / K; while (j < P.length - 2 && cum[j + 1] < a) j++; const u = (a - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]); F.push([U.lerp(P[j][0], P[j + 1][0], u), U.lerp(P[j][1], P[j + 1][1], u)]); }
    // chord frames (normal away from the track)
    const ch = [];
    for (let k = 0; k < K; k++) {
      const A = F[k], B = F[k + 1]; let ax = B[0] - A[0], az = B[1] - A[1]; const L = Math.hypot(ax, az); ax /= L; az /= L; let nx = -az, nz = ax;
      const mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2; t.project(mx, mz, null, pr); if (nx * (mx - t.x[pr.i]) + nz * (mz - t.z[pr.i]) < 0) { nx = -nx; nz = -nz; }
      ch.push({ A, B, L, ax, az, nx, nz, tA: 0, tB: 0, s: N.s0 + (N.s1 - N.s0) * (k + 0.5) / K });
    }
    // concave joints (the line bending towards the stand's back): trim both chords so the backs of the tiers do not overlap
    const zBack = 0.4 + N.rows * 0.82;
    for (let k = 1; k < K; k++) { const a = ch[k - 1], b = ch[k]; const ux = a.ax + b.ax, uz = a.az + b.az, ul = Math.hypot(ux, uz) || 1; const open = ((b.nx - a.nx) * ux + (b.nz - a.nz) * uz) / ul * zBack;
      if (open < 0) { const tr = -open / 2 + 0.08; a.tB = tr; b.tA = tr; } }
    const depth = zBack + 0.6; const blocks = [];
    for (let k = 0; k < K; k++) {
      const c = ch[k]; const len = c.L - c.tA - c.tB - 0.04; if (len < 2) continue; const off = (c.tA - c.tB) / 2;
      const cx = (c.A[0] + c.B[0]) / 2 + c.ax * off, cz = (c.A[1] + c.B[1]) / 2 + c.az * off;
      const blk = { cx, cz, ax: c.ax, az: c.az, nx: c.nx, nz: c.nz, len, rows: N.rows, roof: false, seat: N.seat, y: yN, s: c.s, first: k === 0, last: k === K - 1, north: k };
      E.blocks.push(blk); blocks.push(blk);
      E.standPolys.push(E.markRect(cx + c.nx * (depth + 5) / 2, cz + c.nz * (depth + 5) / 2, c.ax, c.az, len / 2 + 0.5, (depth + 5) / 2, OCC.BUILT));
    }
    E.north = { F, K, Lt, y: yN, rows: N.rows, zBack, blocks, nrm: ch.map(c => [c.nx, c.nz]) };
  }
  // the venue marks every grandstand footprint as built ground before it lays out the stand runs: the two corner stands (whose
  // footprint centroids project onto the track, so the venue never builds them as blocks) would block their own runs
  if (EI.EnvVenue) {
    const orig = EI.EnvVenue.layout;
    EI.EnvVenue.layout = function (E) {
      if (E.data.kind !== 'desert') return orig.call(this, E);
      const S = E.t.data.scenery, all = S.grandstands, pr = {};
      S.grandstands = all.filter(g => { let cx = 0, cz = 0; for (const q of g.p) { cx += q[0]; cz += q[1]; } cx /= g.p.length; cz /= g.p.length; E.t.project(cx, cz, null, pr); return pr.dist >= E.t.halfWidth + 8; });
      try { return orig.call(this, E); } finally { S.grandstands = all; }
    };
  }

  // ---------------------------------------------------------------- footprints modelled here (skipped by the generic box buildings):
  // the OSM pit building and the paddock team buildings behind it
  const area = (p) => Math.abs(U.polyArea(p));
  const cen = (p) => { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; };
  function paddockInfo(b, t) {
    const c = cen(b.p); const pr = t.project(c[0], c[1], null, {}); let s = pr.s; if (s > t.length / 2) s -= t.length; const pitSide = pitSideOf(t);
    return { s, lat: pr.lat * pitSide, a: area(b.p) };
  }
  let _pitSide = null, _pitT = null;
  function pitSideOf(t) { if (_pitT === t) return _pitSide; const p = t.data.pit; let sum = 0; for (let k = 0; k < p.length; k += 2) sum += t.project(p[k][0], p[k][1], null, {}).lat; _pitT = t; _pitSide = sum < 0 ? -1 : 1; return _pitSide; }
  Arch.owns = function (b, t) {
    if (!t.data || t.data.id !== 'abudhabi') return false;
    const q = paddockInfo(b, t);
    if (q.s > -280 && q.s < 340 && q.lat > 28 && q.lat < 72 && q.a > 4000) return 'pit';
    if (q.s > -280 && q.s < 340 && q.lat > 55 && q.lat < 112 && q.a > 120 && q.a < 700) return 'paddock';
    return false;
  };

  // ---------------------------------------------------------------- atlas regions
  let RG = null;
  function regions() {
    if (RG) return RG; const AT = SKx().Atlas;
    // hospitality glass at night: dark panes, warm lit rooms (some dark), white floor slabs every 3.3 m
    const glassN = AT.region('yasGlassN', 256, 256, (x, w, h) => {
      const r = U.rng(77); x.fillStyle = '#16202a'; x.fillRect(0, 0, w, h);
      for (let f = 0; f < 4; f++) for (let b = 0; b < 8; b++) { const on = r() < 0.72; const k = 0.75 + r() * 0.35; x.fillStyle = on ? 'rgb(' + (255 * k | 0) + ',' + (214 * k | 0) + ',' + (160 * k | 0) + ')' : '#223040'; x.fillRect(b * 32 + 2, f * 64 + 16, 28, 46); if (on && r() < 0.5) { x.fillStyle = 'rgba(255,255,240,0.6)'; x.fillRect(b * 32 + 2, f * 64 + 16, 28, 6); } }
      for (let f = 0; f < 4; f++) { x.fillStyle = '#d9d6cf'; x.fillRect(0, f * 64, w, 13); }
      x.fillStyle = 'rgba(200,205,210,0.9)'; for (let i = 0; i < 8; i++) x.fillRect(i * 32, 0, 2, h);
    });
    // marina terraces: warm limestone, deep window reveals with dark glass by day / lit rooms at night, a cornice band
    const marina = AT.region('yasMarinaStone', 256, 128, (x, w, h) => {
      const night = isNight(); const r = U.rng(19); x.fillStyle = '#e3d3b4'; x.fillRect(0, 0, w, h);
      x.fillStyle = 'rgba(150,120,80,0.18)'; for (let y = 0; y < h; y += 16) x.fillRect(0, y, w, 1.5);
      for (let f = 0; f < 2; f++) for (let b = 0; b < 4; b++) { const on = night && r() < 0.8; const X = b * 64 + 14, Y = f * 64 + 14; x.fillStyle = '#8a7255'; x.fillRect(X - 3, Y - 3, 42, 44); x.fillStyle = on ? '#ffd9a0' : '#2a3540'; x.fillRect(X, Y, 36, 38); if (!on) { x.fillStyle = 'rgba(190,210,225,0.25)'; x.fillRect(X + 4, Y, 8, 38); } }
      x.fillStyle = '#f2e7d2'; x.fillRect(0, 0, w, 6); x.fillRect(0, 62, w, 4);
    });
    // roll-up garage shutters with a white header and team colour band
    const shutter = AT.region('yasShutter', 256, 128, (x, w, h) => {
      x.fillStyle = '#e9ebec'; x.fillRect(0, 0, w, h); for (let b = 0; b < 2; b++) { const X = b * 128 + 10; x.fillStyle = '#8d949b'; x.fillRect(X, 40, 108, 88); x.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 44; y < h; y += 6) x.fillRect(X, y, 108, 1.5); }
      x.fillStyle = '#1b2430'; x.fillRect(0, 10, w, 22);
    });
    // the dark glass band of the control towers
    const towerG = AT.region('yasTowerGlass', 128, 64, (x, w, h) => { const night = isNight(); x.fillStyle = night ? '#203a66' : '#14203a'; x.fillRect(0, 0, w, h); x.fillStyle = night ? 'rgba(170,210,255,0.55)' : 'rgba(150,180,220,0.25)'; for (let i = 0; i < w; i += 16) x.fillRect(i, 0, 2, h); x.fillStyle = night ? '#9fd0ff' : '#33507a'; x.fillRect(0, h * 0.42, w, 3); });
    // the bridge's sign panel: our partners, white on dark navy
    // f1-BRAND: the start gantry beam (16 x 1.5 m per repeat) and its raised panel (18.4 x 3.8 m) carry the F1 event branding from EI.Ads
    // (F1 logo, Etihad Airways, Abu Dhabi Grand Prix, TAG Heuer), each region at its own aspect; the hand-set lettering is the fallback
    const signP = EI.Ads && EI.Ads.paintEventPanel ? AT.region('yasGantryPanel', 512, 106, (x, w, h) => EI.Ads.paintEventPanel(x, w, h, 18.4 / 3.8), null, null, 'none') : null;
    const sign = AT.region('yasBridgeSign', 512, 64, (x, w, h) => {
      if (EI.Ads && EI.Ads.paintBanner) { EI.Ads.paintBanner(x, w, h, 16 / 1.5); return; }
      x.fillStyle = '#0b0c0f'; x.fillRect(0, 0, w, h); const A = EI.Ads;
      // chequered flag ends
      for (const x0 of [0, w - 40]) for (let i = 0; i < 5; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2) { x.fillStyle = '#f2f2f0'; x.fillRect(x0 + i * 8, j * 8, 8, 8); }
      x.save(); x.fillStyle = '#ffffff'; x.font = '800 34px "Plus Jakarta Sans", Arial, sans-serif'; x.textBaseline = 'middle'; x.textAlign = 'center';
      x.fillText('trylumi.co', w * 0.25, h / 2 + 2); x.fillText('intake.ink', w * 0.75, h / 2 + 2); x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(w / 2 - 1, 10, 2, h - 20); x.restore();
      if (A && A.lumiMark) try { A.lumiMark(x, 52, 12, 40, null, true); } catch (e) { }
    });
    // the underside of the flat cantilever roofs (u4 / r14): dark steel deck, a rib every 3 m, purlins, a grid of round downlights
    // every 1.5 m (12 x 6 m tile; emissive at night so the lamps halo)
    const soffit = AT.region('yasSoffit', 256, 128, (x, w, h) => {
      x.fillStyle = '#2e3238'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(255,255,255,0.05)'; for (let y = 0; y < h; y += 16) x.fillRect(0, y, w, 2);
      x.fillStyle = '#4b5159'; for (let i = 0; i < 4; i++) x.fillRect(i * 64, 0, 6, h);
      for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) { const cx = i * 32 + 19, cy = j * 32 + 16; const g = x.createRadialGradient(cx, cy, 0, cx, cy, 9); g.addColorStop(0, 'rgba(255,246,222,1)'); g.addColorStop(0.35, 'rgba(255,236,200,0.95)'); g.addColorStop(1, 'rgba(255,230,190,0)'); x.fillStyle = g; x.fillRect(cx - 9, cy - 9, 18, 18); }
    });
    RG = { glassN, marina, shutter, towerG, sign, signP, soffit }; return RG;
  }

  // ---------------------------------------------------------------- membrane: a tensile fabric surface over a local rectangle,
  // y = hf(u, v) (u across 0..1, v front to back 0..1), both faces (the underside lit at night), returns the vertex grid
  function membrane(B, m, x0, x1, z0, z1, hf, nu, nv, cTop, cBot, eBot) {
    const P = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const u = i / nu, v = j / nv; P.push(xf(m, x0 + (x1 - x0) * u, hf(u, v), z0 + (z1 - z0) * v)); }
    const a = P[0], b = P[1], c = P[nu + 2]; const up = ((b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2])) > 0;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const A = P[j * (nu + 1) + i], Bq = P[j * (nu + 1) + i + 1], Cq = P[(j + 1) * (nu + 1) + i + 1], Dq = P[(j + 1) * (nu + 1) + i];
      B.set('white', 0.55, 0, 0); if (up) B.quad(A, Bq, Cq, Dq, cTop); else B.quad(A, Dq, Cq, Bq, cTop);
      B.set('white', 0.7, 0, eBot || 0); if (up) B.quad(A, Dq, Cq, Bq, cBot); else B.quad(A, Bq, Cq, Dq, cBot);
    }
    return P;
  }
  // a row of peaked sail modules over a local strip [x0, x1] x [zF, zB]: the front edge lifted towards the track, each module pulled
  // up into a peak, the seams low; masts behind the seams with stay cables to the peaks; at night a lit fascia strip under the
  // front edge, downlight glows and floods on the stand and the track
  const fabric = C(0xffffff), fabricU = C(0xfffaf0), steel = C(0xc9ced3), warm = C(0xfff0d6);
  // A row of tensile canopy modules over a local strip [x0, x1] x [zF, zB] (zF towards the track). Each module is a white PTFE
  // membrane pulled up into a cone peak by a ring hung from a mast behind, its four corners held by the front cantilever arms (high,
  // towards the track) and the back beam; free edges scallop inwards between the corners and the valleys between modules dip, so
  // the silhouette reads as the row of peaked tents in the photos. Underneath: raking steel truss arms from the masts to the front
  // corners, a lit edge strip. At night the underside glows (downlights wash the fabric) and floods light the stand and the track.
  function sailRow(B, LN, m, x0, x1, zF, zB, yB, lift, Pk, aimW, lightPow) {
    const T = EI.EnvYasTex.regions(); const night = isNight();
    const L = x1 - x0, nm = Math.max(1, Math.round(L / 14)), w = L / nm, D = zB - zF;
    const yF = yB + lift, scal = Math.min(D * 0.14, w * 0.18), sagY = 0.9, valley = 0.55;
    const NU = 10, NV = 7; const cable = C(0xaab1b8);
    const zM = zB + 1.2, mastTop = yB + Pk + 6.0;
    for (let k = 0; k < nm; k++) {
      const a0 = x0 + k * w, a1 = a0 + w;
      const pt = (u, v) => {
        const e4 = 4 * u * (1 - u);
        // plan: the front and back edges pulled in between the corners
        const zFe = zF + scal * e4, zBe = zB - scal * 0.6 * e4; const z = zFe + (zBe - zFe) * v;
        let y = yF + (yB - yF) * Math.pow(v, 0.9);
        y -= sagY * e4 * (1 - v) * (1 - v);                     // front edge sags between the arms
        y -= valley * (1 - e4) * 4 * v * (1 - v);               // valleys along the module seams
        const du = (u - 0.5) / 0.5, dv = (v - 0.45) / 0.55; const d = Math.min(1, Math.sqrt(du * du * 0.9 + dv * dv));
        y += Pk * Math.pow(1 - d, 1.9);                         // the cone up to the peak ring
        return EI.Env.xf(m, a0 + w * u, y, z);
      };
      const G = []; for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) G.push(pt(i / NU, j / NV));
      const at = (i, j) => G[j * (NU + 1) + i];
      for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
        const A = at(i, j), Bq = at(i + 1, j), Cq = at(i + 1, j + 1), Dq = at(i, j + 1);
        const uv = [i / NU * w / 10, j / NV * D / 10, (i + 1) / NU * w / 10, j / NV * D / 10, (i + 1) / NU * w / 10, (j + 1) / NV * D / 10, i / NU * w / 10, (j + 1) / NV * D / 10];
        // top face (up) and underside: the street kit quad keeps the winding given, so emit both orders
        const ny = (Bq[2] - A[2]) * (Dq[0] - A[0]) - (Bq[0] - A[0]) * (Dq[2] - A[2]);
        B.set(T.fabric, 0.55, 0, 0);
        if (ny > 0) B.quad(A, Bq, Cq, Dq, fabric, uv); else B.quad(A, Dq, Cq, Bq, fabric, [uv[0], uv[1], uv[6], uv[7], uv[4], uv[5], uv[2], uv[3]]);
        B.set(T.fabric, 0.75, 0, night ? 0.62 : 0);
        if (ny > 0) B.quad(A, Dq, Cq, Bq, fabricU, [uv[0], uv[1], uv[6], uv[7], uv[4], uv[5], uv[2], uv[3]]); else B.quad(A, Bq, Cq, Dq, fabricU, uv);
      }
      // peak ring, cables from the masts behind to the ring and to the front corners, the front edge cable
      const peak = pt(0.5, 0.45); B.set('white', 0.4, 0.6, 0); B.col(new THREE.Matrix4().makeTranslation(peak[0], peak[1] - 0.2, peak[2]), 0, 0, 0, 0.45, 0.55, 0.45, 8, steel, true);
      const mA = EI.Env.xf(m, a0, mastTop, zM), mB = EI.Env.xf(m, a1, mastTop, zM);
      LN.seg(mA, peak, cable); LN.seg(mB, peak, cable); LN.seg(mA, pt(0, 0), cable); if (k === nm - 1) LN.seg(mB, pt(1, 0), cable);
      for (let i = 0; i < NU; i++) LN.seg(pt(i / NU, 0), pt((i + 1) / NU, 0), steel);
      // raking truss arm under the seam, from the mast foot line to the front corner
      const bot = EI.Env.xf(m, a0, yB - 1.2, zB - 0.5), tip = pt(0, 0); B.set('white', 0.45, 0.55, 0); B.beam(new THREE.Matrix4(), bot, [tip[0], tip[1] - 0.25, tip[2]], 0.32, steel);
      const mid = [(bot[0] + tip[0]) / 2, (bot[1] + tip[1]) / 2 - 1.1, (bot[2] + tip[2]) / 2]; B.beam(new THREE.Matrix4(), bot, mid, 0.18, steel); B.beam(new THREE.Matrix4(), mid, [tip[0], tip[1] - 0.25, tip[2]], 0.18, steel);
      // lights: downlights along the front of the module (glow sprites) and a flood on the stand / track below
      const fy = pt(0.5, 0.06)[1] - 0.5; const fp = EI.Env.xf(m, (a0 + a1) / 2, fy, zF + scal + 1.2);
      if (lightPow) flood(fp, { power: lightPow, aim: aimW, spread: 1.15, range: 55 });
      for (const q of [0.2, 0.5, 0.8]) { const g = pt(q, 0.08); glow([g[0], g[1] - 0.35, g[2]], 1.3, [1.0, 0.94, 0.82]); }
    }
    if (k0Final(B, m, x1, zB, zM, mastTop, nm, w, x0, steel)) { /* masts written */ }
  }
  // masts behind every seam (tapered steel tubes with a cap)
  function k0Final(B, m, x1, zB, zM, mastTop, nm, w, x0, steel) { B.set('white', 0.45, 0.55, 0); for (let k = 0; k <= nm; k++) B.col(m, x0 + k * w, zM, 0, mastTop, 0.42, 0.22, 10, steel, true); return true; }

  // ---------------------------------------------------------------- grandstand canopies (every stand block the venue built)
  function standSails(E, B, LN) {
    const blocks = E.standBlocks || []; let n = 0;
    for (const b of blocks) {
      if (b.north != null) continue;   // the North Grandstand horseshoe has its own continuous roof (northStand)
      const m = EI.Env.frame(b.cx, b.y, b.cz, b.ax, b.az, b.nx, b.nz); const hl = b.len / 2, rows = b.rows;
      const yTop = 1.4 + rows * 0.42, zBack = 0.4 + rows * 0.82;
      // the venue's bare stair towers at the run ends: clad them like the stand backs
      if (b.first) cladTower(B, m, -hl - 1.9, zBack - 2.0, yTop, -1);
      if (b.last) cladTower(B, m, hl + 1.9, zBack - 2.0, yTop, 1);
      // flat cantilevered roofs (u4, r14); the tent sails are kept for the North Grandstand (northStand) and the paddock
      flatRoof(B, m, -hl - 0.3, hl + 0.3, -3.4, zBack + 1.2, yTop + 4.6, yTop + 3.6, [-b.nx, -b.nz], 0.14, 9); n++;
      // the back of the stand: pale composite cladding over a lit concourse of kiosks and fans (instead of the bare dark wall)
      const TX = EI.EnvYasTex.regions(), zc = zBack + 0.07, yC = 3.6, yT = yTop + 1.2;
      const Q = (x, y, z) => xf(m, x, y, z);
      B.set(TX.clad, 0.6, 0.15, 0); B.quad(Q(-hl, yC, zc), Q(hl, yC, zc), Q(hl, yT, zc), Q(-hl, yT, zc), C(0xffffff), [0, 0, b.len / 12, 0, b.len / 12, (yT - yC) / 6, 0, (yT - yC) / 6]);
      B.set(TX.concourse, 0.7, 0, isNight() ? 1.05 : 0); B.quad(Q(-hl, 0, zc), Q(hl, 0, zc), Q(hl, yC, zc), Q(-hl, yC, zc), C(0xffffff), [0, 0, b.len / 12, 0, b.len / 12, 1, 0, 1]);
      B.set('white', 0.5, 0.4, isNight() ? 1.6 : 0); B.box(m, b.len, 0.14, 0.18, 0, yC - 0.1, zc + 0.12, isNight() ? C(0x7fd6ff) : C(0xdfe5ea));
      if (isNight()) { for (let a = -hl + 4; a < hl; a += 9) glow(Q(a, 2.6, zc + 1.2), 2.2, [1.0, 0.85, 0.6]); flood(Q(0, 6, zc + 6), { power: 0.06 * Math.max(1, b.len / 30), range: 30, color: [1.0, 0.86, 0.66] }); }
      // a second, weaker flood back over the crowd
      flood(xf(m, 0, yTop + 4, zBack * 0.5), { power: 0.05 * Math.max(1, b.len / 25), range: 40 });
      // flags on slim poles along the back of the stand (u4 / u5): the UAE flag, both faces
      for (let a = -hl + 6; a < hl - 2; a += 24) {
        const y0 = yTop + 1.2, y1 = y0 + 9; B.set('white', 0.4, 0.5, 0); B.col(m, a, zBack + 1.0, y0 - 1.0, y1, 0.09, 0.06, 6, C(0xe8e8ea), true);
        const F = (u, v) => xf(m, a + 0.1 + u * 2.7 + 0.25 * Math.sin(u * 3.0 + a), y1 - 0.15 - v * 1.35, zBack + 1.0 + 0.35 * Math.sin(u * 2.4 + a * 0.3));
        const band = (u0, u1, v0, v1, col) => { const A = F(u0, v0), Bq = F(u1, v0), Cq = F(u1, v1), D = F(u0, v1); B.quad(A, Bq, Cq, D, col); B.quad(A, D, Cq, Bq, col); };
        B.set('white', 0.7, 0, isNight() ? 0.25 : 0); band(0, 0.25, 0, 1, C(0xc8102e)); band(0.25, 1, 0, 1 / 3, C(0x00843d)); band(0.25, 1, 1 / 3, 2 / 3, C(0xf4f4f4)); band(0.25, 1, 2 / 3, 1, C(0x111111));
      }
    }
    return n;
  }

  // quad wound to face world direction w (the world material is single sided)
  function qW(B, a, b, c, d, col, uv, w) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    if ((uy * vz - uz * vy) * w[0] + (uz * vx - ux * vz) * w[1] + (ux * vy - uy * vx) * w[2] >= 0) B.quad(a, b, c, d, col, uv);
    else B.quad(a, d, c, b, col, uv ? [uv[0], uv[1], uv[6], uv[7], uv[4], uv[5], uv[2], uv[3]] : null);
  }
  // the venue's stair tower at a stand end (3.4 x 4 m box at local (x, z), yTop + 2.4 tall) wrapped in the pale panel cladding,
  // a lit glazed stair slot on the outer face, a dark door at the foot; out = the local x side facing away from the stand
  function cladTower(B, m, x, z, yTop, out) {
    const TX = EI.EnvYasTex.regions(), night = isNight(); const h = yTop + 2.3, hw = 1.9, hd = 2.2;
    B.set(TX.clad, 0.6, 0.15, 0); B.box(m, hw * 2, h, hd * 2, x, 0, z, C(0xffffff), { tile: 6 });
    const o = xf(m, 0, 0, 0), ex = xf(m, out, 0, 0); const w = [ex[0] - o[0], 0, ex[2] - o[2]]; const X = x + out * (hw + 0.04);
    B.set('white', 0.15, 0.3, night ? 1.3 : 0); qW(B, xf(m, X, 1.0, z - 0.6), xf(m, X, 1.0, z + 0.6), xf(m, X, h - 1.0, z + 0.6), xf(m, X, h - 1.0, z - 0.6), night ? C(0xffe2b4) : C(0x5d7385), null, w);
    B.set('white', 0.5, 0.3, 0); qW(B, xf(m, X + out * 0.01, 0, z - 0.7), xf(m, X + out * 0.01, 0, z + 0.7), xf(m, X + out * 0.01, 0.9, z + 0.7), xf(m, X + out * 0.01, 0.9, z - 0.7), C(0x2a2f36), null, w);
    if (night) glow(xf(m, X + out * 0.8, h * 0.5, z), 1.8, [1.0, 0.86, 0.62]);
  }
  // a UAE flag on a slim pole from base up h metres, flying along world direction d
  function uaeFlag(B, base, h, d) {
    const top = [base[0], base[1] + h, base[2]]; B.set('white', 0.4, 0.5, 0); B.beam(I4, base, top, 0.12, C(0xe8e8ea), 6);
    const ph = base[0] * 0.37 + base[2] * 0.11; const F = (u, v) => [top[0] + d[0] * (0.1 + u * 2.7) - d[2] * 0.3 * Math.sin(u * 2.4 + ph), top[1] - 0.15 - v * 1.35 + 0.1 * Math.sin(u * 3 + ph), top[2] + d[2] * (0.1 + u * 2.7) + d[0] * 0.3 * Math.sin(u * 2.4 + ph)];
    const band = (u0, u1, v0, v1, col) => { const A = F(u0, v0), Bq = F(u1, v0), Cq = F(u1, v1), D = F(u0, v1); B.quad(A, Bq, Cq, D, col); B.quad(A, D, Cq, Bq, col); };
    B.set('white', 0.7, 0, isNight() ? 0.25 : 0); band(0, 0.25, 0, 1, C(0xc8102e)); band(0.25, 1, 0, 1 / 3, C(0x00843d)); band(0.25, 1, 1 / 3, 2 / 3, C(0xf4f4f4)); band(0.25, 1, 2 / 3, 1, C(0x111111));
  }
  const I4 = new THREE.Matrix4();
  // flat cantilevered roof (u4, r14) over local [x0, x1] x [zF, zB] (zF towards the track), rising slightly towards the track: a
  // ribbed underside full of downlights, pale metal top, a dark steel fascia carrying an LED partner band, columns along the back
  // with the girders running out under the deck (visible ribs). Lights: downlight glows along the front, floods on the stand and
  // the track
  function flatRoof(B, m, x0, x1, zF, zB, yF, yB, aimW, lightPow, colStep) {
    const Rr = regions(), TX = EI.EnvYasTex.regions(), night = isNight(); const Q = (x, y, z) => xf(m, x, y, z);
    const o = Q(0, 0, 0), ex = Q(1, 0, 0), ez = Q(0, 0, 1); const wx = [ex[0] - o[0], 0, ex[2] - o[2]], wz = [ez[0] - o[0], 0, ez[2] - o[2]];
    const yAt = (z) => yF + (yB - yF) * (z - zF) / (zB - zF); const D = zB - zF, th = 0.45;
    B.set(Rr.soffit, 0.6, 0.3, night ? 1.6 : 0);
    qW(B, Q(x0, yF, zF), Q(x1, yF, zF), Q(x1, yB, zB), Q(x0, yB, zB), C(0xffffff), [x0 / 12, 0, x1 / 12, 0, x1 / 12, D / 6, x0 / 12, D / 6], [0, -1, 0]);
    B.set(TX.clad, 0.45, 0.35, 0); qW(B, Q(x0, yF + th, zF), Q(x1, yF + th, zF), Q(x1, yB + th, zB), Q(x0, yB + th, zB), C(0xc4c9ce), [x0 / 6, 0, x1 / 6, 0, x1 / 6, D / 4, x0 / 6, D / 4], [0, 1, 0]);
    // fascia (front), back edge, ends
    const fas = C(0x1f2328);
    B.set('white', 0.5, 0.5, 0); qW(B, Q(x0, yF - 0.75, zF), Q(x1, yF - 0.75, zF), Q(x1, yF + th + 0.1, zF), Q(x0, yF + th + 0.1, zF), fas, null, [-wz[0], 0, -wz[2]]);
    qW(B, Q(x0, yF - 0.75, zF), Q(x1, yF - 0.75, zF), Q(x1, yF, zF + 0.6), Q(x0, yF, zF + 0.6), fas, null, [0, -1, 0]);
    qW(B, Q(x0, yB - 0.2, zB), Q(x1, yB - 0.2, zB), Q(x1, yB + th, zB), Q(x0, yB + th, zB), fas, null, wz);
    for (const [x, s] of [[x0, -1], [x1, 1]]) qW(B, Q(x, yF - 0.75, zF), Q(x, yF + th + 0.1, zF), Q(x, yB + th, zB), Q(x, yB - 0.2, zB), fas, null, [wx[0] * s, 0, wx[2] * s]);
    B.set(TX.led, 0.4, 0, night ? 1.25 : 0.2); const L = x1 - x0;
    qW(B, Q(x0 + 0.3, yF - 0.55, zF - 0.03), Q(x1 - 0.3, yF - 0.55, zF - 0.03), Q(x1 - 0.3, yF + th - 0.05, zF - 0.03), Q(x0 + 0.3, yF + th - 0.05, zF - 0.03), C(0xffffff), [0, 0, (L - 0.6) / 12.8, 0, (L - 0.6) / 12.8, 1, 0, 1], [-wz[0], 0, -wz[2]]);
    // columns and the girders under the deck
    const n = Math.max(1, Math.round(L / colStep)), st = L / n; const steelC = C(0xb9bfc5);
    for (let k = 0; k <= n; k++) {
      const x = x0 + Math.min(L - 0.3, Math.max(0.3, k * st)); B.set('white', 0.45, 0.55, 0);
      B.beam(I4, Q(x, 0, zB - 0.4), Q(x, yB - 0.1, zB - 0.4), 0.55, steelC, 8);
      B.beam(I4, Q(x, yB - 0.25, zB - 0.4), Q(x, yF - 0.3, zF + 0.4), 0.42, steelC);
      B.beam(I4, Q(x, yB - 1.6, zB - 0.4), Q(x, yAt(zF + D * 0.45) - 0.35, zF + D * 0.45), 0.24, steelC);
    }
    for (let x = x0 + 2.5; x < x1 - 1; x += 5) glow(Q(x, yF - 0.25, zF + 1.0), 1.1, [1.0, 0.95, 0.84]);
    for (let x = x0 + 12; x < x1; x += 24) { if (lightPow) flood(Q(x, yF - 0.6, zF + 1.5), { power: lightPow, aim: aimW, spread: 1.15, range: 55 }); flood(Q(x, yAt(zF + D * 0.5) - 1, zF + D * 0.5), { power: 0.05, range: 30 }); }
  }

  // ---------------------------------------------------------------- the North Grandstand (u5): the horseshoe of tiers round the
  // hairpin (the venue built them as chords, northLayout) closed into one stand, one continuous white tent roof over it all: a row
  // of tall cone peaks with capped rings, valley cables down every seam, the front edge scalloped between the cantilever tips
  // facing the track, steel truss arms under each seam from the columns along the back, UAE flags on the tips; the back clad in
  // pale panels over a lit concourse. Stations along the front line carry the outward normals; everything is laid out in
  // (a = arc length along the front, y up, z out from the front) and mapped through them, so it follows the curve.
  function northStand(E, B, LN, out) {
    const NS = E.north; if (!NS || !NS.blocks.length) return 0;
    const F = NS.F, K = NS.K, y0 = NS.y, rows = NS.rows, night = isNight(), TX = EI.EnvYasTex.regions();
    const rise = 0.42, tread = 0.82, yT0 = 1.4, z0 = 0.4, yTop = yT0 + rows * rise, zBack = NS.zBack;
    // stations: front points, cumulative arc length, outward normals (mean of the chords either side)
    const A = [0]; for (let k = 1; k <= K; k++) A.push(A[k - 1] + Math.hypot(F[k][0] - F[k - 1][0], F[k][1] - F[k - 1][1]));
    const Nn = []; for (let k = 0; k <= K; k++) { const a = NS.nrm[Math.max(0, k - 1)], b = NS.nrm[Math.min(K - 1, k)]; const x = a[0] + b[0], z = a[1] + b[1], l = Math.hypot(x, z) || 1; Nn.push([x / l, z / l]); }
    const Lt = A[K];
    const map = (a, y, z) => {
      let k = 0; if (a >= Lt) k = K - 1; else if (a > 0) { let lo = 0, hi = K - 1; while (lo < hi) { const md = (lo + hi + 1) >> 1; if (A[md] <= a) lo = md; else hi = md - 1; } k = lo; }
      const f = (a - A[k]) / (A[k + 1] - A[k]); let nx = U.lerp(Nn[k][0], Nn[k + 1][0], f), nz = U.lerp(Nn[k][1], Nn[k + 1][1], f); const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      return [U.lerp(F[k][0], F[k + 1][0], f) + nx * z, y0 + y, U.lerp(F[k][1], F[k + 1][1], f) + nz * z];
    };
    const nAt = (a) => { const p = map(a, 0, 0), q = map(a, 0, 1); return [q[0] - p[0], 0, q[2] - p[2]]; };
    // ---- wedges between the chords: treads, risers, front wall and parapet (an aisle every other joint)
    const byIdx = {}; for (const b of NS.blocks) byIdx[b.north] = b;
    const seat = C(NS.blocks[0].seat), seatL = C(NS.blocks[0].seat).multiplyScalar(0.85), seatD = C(NS.blocks[0].seat).multiplyScalar(0.55);
    const concD = C(0xa9aaa6), concR = C(0x8a8b88), conc = C(0xd6d7d3), up = [0, 1, 0];
    const endP = (b, J) => { const m = EI.Env.frame(b.cx, b.y, b.cz, b.ax, b.az, b.nx, b.nz), hl = b.len / 2; const p = xf(m, hl, 0, 0), q = xf(m, -hl, 0, 0); const sx = Math.hypot(p[0] - J[0], p[2] - J[1]) < Math.hypot(q[0] - J[0], q[2] - J[1]) ? hl : -hl; return (y, z) => xf(m, sx, y, z); };
    B.set('white', 0.8, 0, 0);
    for (let k = 1; k < K; k++) {
      const bi = byIdx[k - 1], bj = byIdx[k]; if (!bi || !bj) continue; const Pi = endP(bi, F[k]), Pj = endP(bj, F[k]); const aisle = k % 2 === 0;
      const tw = [-(bi.nx + bj.nx), 0, -(bi.nz + bj.nz)];
      qW(B, Pi(0, 0), Pj(0, 0), Pj(yT0, 0), Pi(yT0, 0), conc, null, tw);
      for (let r = 0; r < rows; r++) {
        const y = yT0 + r * rise, za = z0 + r * tread, zb = za + tread;
        qW(B, Pi(y + rise, za), Pj(y + rise, za), Pj(y + rise, zb), Pi(y + rise, zb), aisle ? concD : (r % 2 ? seat : seatL), null, up);
        qW(B, Pi(y, za), Pj(y, za), Pj(y + rise, za), Pi(y + rise, za), aisle ? concR : seatD, null, tw);
      }
      qW(B, Pi(yTop, zBack - 0.02), Pj(yTop, zBack - 0.02), Pj(yTop + 1.2, zBack - 0.02), Pi(yTop + 1.2, zBack - 0.02), concD, null, tw);
    }
    // ---- the back: pale panels over a lit concourse, an LED line between, columns carrying the roof
    const zc = zBack + 0.12, yC = 3.6;
    for (let k = 0; k < K; k++) {
      const a0 = A[k], a1 = A[k + 1]; const w = nAt((a0 + a1) / 2);
      B.set(TX.clad, 0.6, 0.15, 0); qW(B, map(a0, yC, zc), map(a1, yC, zc), map(a1, yTop + 1.2, zc), map(a0, yTop + 1.2, zc), C(0xffffff), [a0 / 12, 0, a1 / 12, 0, a1 / 12, (yTop + 1.2 - yC) / 6, a0 / 12, (yTop + 1.2 - yC) / 6], w);
      B.set(TX.concourse, 0.7, 0, night ? 1.05 : 0); qW(B, map(a0, 0, zc), map(a1, 0, zc), map(a1, yC, zc), map(a0, yC, zc), C(0xffffff), [a0 / 12, 0, a1 / 12, 0, a1 / 12, 1, a0 / 12, 1], w);
      B.set('white', 0.5, 0.4, night ? 1.6 : 0); qW(B, map(a0, yC - 0.12, zc + 0.05), map(a1, yC - 0.12, zc + 0.05), map(a1, yC + 0.06, zc + 0.05), map(a0, yC + 0.06, zc + 0.05), night ? C(0x7fd6ff) : C(0xdfe5ea), null, w);
    }
    if (night) for (let a = 4; a < Lt; a += 10) glow(map(a, 2.6, zc + 1.2), 2.2, [1.0, 0.85, 0.6]);
    for (let a = 10; a < Lt; a += 40) { flood(map(a, 6, zc + 6), { power: 0.08, range: 30, color: [1.0, 0.86, 0.66] }); flood(map(a, yTop + 4, zBack * 0.5), { power: 0.08, range: 40 }); }
    // stair towers at the two ends (the venue's boxes, clad)
    for (const b of [byIdx[0], byIdx[K - 1]]) { if (!b) continue; const m = EI.Env.frame(b.cx, b.y, b.cz, b.ax, b.az, b.nx, b.nz), hl = b.len / 2; if (b.first) cladTower(B, m, -hl - 1.9, zBack - 2.0, yTop, -1); if (b.last) cladTower(B, m, hl + 1.9, zBack - 2.0, yTop, 1); }
    // ---- the roof
    const zF = -4.6, zB = zBack + 1.6, yB = yTop + 2.8, yF = yB + 4.0, Pk = 7.4, sagY = 1.3, valley = 0.9;
    const nm = Math.max(1, Math.round(Lt / 15)), w = Lt / nm, D = zB - zF, scal = Math.min(D * 0.14, w * 0.2);
    const NU = 12, NV = 8, cable = C(0xaab1b8), white = C(0xf6f6f3);
    const pt = (a0, u, v) => {
      const e4 = 4 * u * (1 - u);
      const zFe = zF + scal * e4, zBe = zB - scal * 0.5 * e4, z = zFe + (zBe - zFe) * v;
      let y = yF + (yB - yF) * Math.pow(v, 0.9);
      y -= sagY * e4 * (1 - v) * (1 - v);
      y -= valley * (1 - e4) * 4 * v * (1 - v);
      const du = (u - 0.5) / 0.5, dv = (v - 0.45) / 0.55; const d = Math.min(1, Math.sqrt(du * du * 0.9 + dv * dv));
      y += Pk * Math.pow(1 - d, 2.1);
      return map(a0 + w * u, y, z);
    };
    for (let k = 0; k < nm; k++) {
      const a0 = k * w; const G = []; for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) G.push(pt(a0, i / NU, j / NV));
      const at = (i, j) => G[j * (NU + 1) + i];
      for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
        const Aq = at(i, j), Bq = at(i + 1, j), Cq = at(i + 1, j + 1), Dq = at(i, j + 1);
        const uv = [i / NU * w / 10, j / NV * D / 10, (i + 1) / NU * w / 10, j / NV * D / 10, (i + 1) / NU * w / 10, (j + 1) / NV * D / 10, i / NU * w / 10, (j + 1) / NV * D / 10];
        B.set(TX.fabric, 0.55, 0, 0); qW(B, Aq, Bq, Cq, Dq, fabric, uv, up);
        B.set(TX.fabric, 0.75, 0, night ? 0.62 : 0); qW(B, Aq, Bq, Cq, Dq, fabricU, uv, [0, -1, 0]);
      }
      // the peak: a steel ring with a white cap
      const pk = pt(a0, 0.5, 0.45); const mP = new THREE.Matrix4().makeTranslation(pk[0], pk[1], pk[2]);
      B.set('white', 0.4, 0.6, 0); B.col(mP, 0, 0, -0.25, 0.25, 0.62, 0.62, 10, steel, false); B.set('white', 0.5, 0.1, 0); B.col(mP, 0, 0, 0.25, 1.0, 0.56, 0.05, 10, white, true);
      // cables: the front edge, peak to the corners
      for (let i = 0; i < NU; i++) LN.seg(pt(a0, i / NU, 0), pt(a0, (i + 1) / NU, 0), steel);
      for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) LN.seg(pk, pt(a0, u, v), cable);
      // lights under the front edge: downlights and a flood on the stand / track
      const fp = map(a0 + w / 2, pt(a0, 0.5, 0.06)[1] - y0 - 0.5, zF + scal + 1.2); flood(fp, { power: 0.16, aim: (() => { const n = nAt(a0 + w / 2); return [-n[0], -n[2]]; })(), spread: 1.15, range: 55 });
      for (const q of [0.2, 0.5, 0.8]) { const g = pt(a0, q, 0.08); glow([g[0], g[1] - 0.35, g[2]], 1.3, [1.0, 0.94, 0.82]); }
    }
    // seams: valley cable, the truss arm under it (top chord along the seam, a straight bottom chord, zig-zag diagonals), the back
    // column; a flag on every third front tip
    for (let k = 0; k <= nm; k++) {
      const a = k * w; const seam = []; for (let j = 0; j <= NV; j++) seam.push(pt(a, 0, j / NV));
      for (let j = 0; j < NV; j++) LN.seg(seam[j], seam[j + 1], cable);
      const colTop = map(a, yB - 0.8, zB - 1.2), colLow = map(a, yB - 3.4, zB - 1.2), tip = seam[0];
      B.set('white', 0.45, 0.55, 0); B.beam(I4, map(a, 0, zB - 1.2), colTop, 0.62, steel, 8);
      const tc = seam.map(p => [p[0], p[1] - 0.35, p[2]]);
      for (let j = 0; j < NV; j++) B.beam(I4, tc[j], tc[j + 1], 0.3, steel);
      B.beam(I4, colTop, tc[NV], 0.3, steel);
      const bc = (f) => [U.lerp(colLow[0], tip[0], f), U.lerp(colLow[1], tip[1] - 0.4, f), U.lerp(colLow[2], tip[2], f)];
      B.beam(I4, colLow, bc(1), 0.24, steel);
      for (let j = 1; j < NV; j++) { const f = 1 - j / NV; B.beam(I4, bc(f), tc[j], 0.12, steel); }
      if (k % 3 === 1) { const n = nAt(a); const tg = [-n[2], 0, n[0]]; uaeFlag(B, [tip[0], tip[1] - 0.2, tip[2]], 7.5, tg); }
    }
    out.northRoof = { modules: nm, length: Math.round(Lt), chords: NS.blocks.length };
    return nm;
  }

  // ---------------------------------------------------------------- the row of tall white tent peaks seen past the end of the
  // straight (u4, a18): five pyramid tents on white posts over a glazed lit hospitality deck, on the first free ground straight ahead
  // of the pit straight beyond Turn 1
  function tentRow(E, B, LN, out) {
    const t = E.t, OCC = EI.Env.OCC, night = isNight(), TX = EI.EnvYasTex.regions(); const pr = {};
    const f0 = lapFrame(t, t.sf + 150, 1), o = lapFrame(t, t.sf + 200, 1); const nT = 5, sz = 21, L = nT * sz, Dp = sz;
    let best = null;
    for (let d = 110; d <= 320 && !best; d += 15) for (const lat of [0, -25, 25, -50, 50, -75, 75]) {
      const cx = o.x + f0.tx * d + f0.tz * lat, cz = o.z + f0.tz * d - f0.tx * lat;
      // the row faces back down the straight: its long axis across the view
      const ax = -f0.tz, az = f0.tx;
      if (E.rectFree(cx, cz, ax, az, L / 2 + 3, Dp / 2 + 3, OCC.BUILT | OCC.WATER | OCC.ROAD | OCC.TRACK) < 0.97) continue;
      if (E.isSea && E.isSea(cx, cz)) continue;
      let ok = true; for (const [a, b] of [[-L / 2, -Dp / 2], [L / 2, -Dp / 2], [-L / 2, Dp / 2], [L / 2, Dp / 2], [0, 0]]) { t.project(cx + ax * a - az * b, cz + az * a + ax * b, null, pr); if (pr.dist < Math.max(t.wallL[pr.i], t.wallR[pr.i]) + 18) ok = false; }
      if (ok) { best = { cx, cz, ax, az }; break; }
    }
    if (!best) { out.tentRow = 0; return; }
    const y0 = E.ground(best.cx, best.cz) - 0.2; const m = EI.Env.frame(best.cx, y0, best.cz, best.ax, best.az, -best.az, best.ax);
    E.markRect(best.cx, best.cz, best.ax, best.az, L / 2 + 2, Dp / 2 + 2, OCC.BUILT);
    const white = C(0xf5f5f2), deckH = 6.2, eave = deckH + 3.6, pk = 14;
    // the deck: lit lounge glazing all round, a white slab roof
    B.set(TX.hosp, 0.12, 0.35, night ? 1.0 : 0); B.box(m, L - 1, deckH, Dp - 1, 0, 0, 0, C(0xffffff), { tile: 12 });
    B.set('white', 0.7, 0, 0); B.box(m, L + 0.6, 0.45, Dp + 0.6, 0, deckH, 0, white, { bottom: true });
    for (let k = 0; k < nT; k++) {
      const x0 = -L / 2 + k * sz + 0.15, x1 = x0 + sz - 0.3, z0 = -Dp / 2 + 0.15, z1 = Dp / 2 - 0.15;
      membrane(B, m, x0, x1, z0, z1, (u, v) => { const d = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 2; return eave + pk * Math.pow(Math.max(0, 1 - d), 1.6); }, 8, 8, fabric, fabricU, night ? 0.55 : 0);
      const c = xf(m, (x0 + x1) / 2, eave + pk, 0); const mP = new THREE.Matrix4().makeTranslation(c[0], c[1], c[2]);
      B.set('white', 0.5, 0.2, 0); B.col(mP, 0, 0, 0, 2.2, 0.16, 0.05, 6, white, true);
      for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) { B.set('white', 0.5, 0.3, 0); B.col(m, cx, cz, deckH, eave, 0.14, 0.12, 6, white, true); LN.seg(xf(m, cx, eave, cz), c, steel); }
      if (night) { glow(xf(m, (x0 + x1) / 2, eave + 1.5, 0), 3.6, [1.0, 0.88, 0.66]); flood(xf(m, (x0 + x1) / 2, eave, 0), { power: 0.08, range: 30, color: [1.0, 0.88, 0.7] }); }
    }
    out.tentRow = nT;
  }

  // ---------------------------------------------------------------- the pit building: closed garages either side of the pit.js
  // garages, three glazed hospitality decks with balconies and lit ceilings, the sail canopy reaching out over the pit lane
  function lapFrame(t, s, side) {
    const L = t.length; const f = U.mod(s / t.ds, t.n); const i = Math.floor(f), j = (i + 1) % t.n, u = f - i;
    const x = U.lerp(t.x[i], t.x[j], u), z = U.lerp(t.z[i], t.z[j], u), y = U.lerp(t.y[i], t.y[j], u);
    return { x, y, z, tx: t.tx[i], tz: t.tz[i], nx: t.nx[i] * side, nz: t.nz[i] * side, i };
  }
  function pitBuilding(E, B, LN, R, Rr, out) {
    const t = E.t, side = pitSideOf(t); let maxWall = 0;
    for (let s = -180; s <= 180; s += 4) { const i = t.idxAtS(U.mod(t.sf + s, t.length)); maxWall = Math.max(maxWall, side < 0 ? t.wallL[i] : t.wallR[i]); }
    const latC = maxWall + 3.25 + 6.0, gF = latC + 7.8, gB = gF + 10, L0 = gB + 1.2, L1 = L0 + 21;
    const S0 = -232, S1 = 238, ST = 12;
    const P = (s, lat, y) => { const f = lapFrame(t, t.sf + s, side); return [f.x + f.nx * lat, f.y - 0.05 + y, f.z + f.nz * lat]; };
    const night = isNight();
    const stone = C(0xf0ece4), white = C(0xf4f4f1), slab = C(0xe9e9e6), warmL = C(0xffe9c8);
    const TX = EI.EnvYasTex.regions();
    // facades per segment
    for (let s = S0; s < S1; s += ST) {
      const s2 = Math.min(S1, s + ST); const u0 = (s - S0) / 8, u1 = (s2 - S0) / 8;
      // track side: podium (stone with the dark glass ground floor band), three glazed decks
      B.set(R.stone, 0.75, 0); wq(B, P(s, L0, 0), P(s2, L0, 0), P(s2, L0, 5.2), P(s, L0, 5.2), u0, u1, 0, 5.2 / 5.2);
      B.set(TX.hosp, 0.12, 0.35, night ? 1.15 : 0); wq(B, P(s, L0 + 1.5, 5.2), P(s2, L0 + 1.5, 5.2), P(s2, L0 + 1.5, 19.6), P(s, L0 + 1.5, 19.6), (s - S0) / 12, (s2 - S0) / 12, 0, 1);
      // marina side
      B.set(TX.hosp, 0.12, 0.35, night ? 1.0 : 0); wq(B, P(s2, L1, 5.2), P(s, L1, 5.2), P(s, L1, 19.6), P(s2, L1, 19.6), (s - S0) / 12, (s2 - S0) / 12, 0, 1);
      // slim white fins up the glass every 6 m, the partners' LED band along the roof edge facing the track
      for (let f = s; f < s2 - 0.5; f += 6) { B.set('white', 0.6, 0.1, 0); boxQ(B, P, f, f + 0.35, L0 + 1.0, L0 + 1.9, 5.2, 19.6, white); }
      B.set(TX.led, 0.4, 0, night ? 1.3 : 0.15); wq(B, P(s, L0 - 3.05, 20.15), P(s2, L0 - 3.05, 20.15), P(s2, L0 - 3.05, 21.6), P(s, L0 - 3.05, 21.6), (s - S0) / 22.4, (s2 - S0) / 22.4, 0, 1);
      B.set('white', 0.6, 0.1, 0); boxQ(B, P, s, s2, L0 - 3.0, L0 - 2.6, 20.1, 21.6, C(0x20252b));
      B.set(R.stone, 0.75, 0); wq(B, P(s2, L1, 0), P(s, L1, 0), P(s, L1, 5.2), P(s2, L1, 5.2), u0, u1, 0, 1);
      // balconies: slabs reaching 3 m towards the track, a glass balustrade, a lit ceiling strip under each
      for (const y of [5.2, 10.0, 14.8]) {
        B.set('white', 0.7, 0); boxQ(B, P, s, s2, L0 - 3, L0 + 1.5, y - 0.35, y, slab);
        B.set('white', 0.15, 0.2, night ? 0.25 : 0); wq(B, P(s, L0 - 3, y), P(s2, L0 - 3, y), P(s2, L0 - 3, y + 1.1), P(s, L0 - 3, y + 1.1), 0, 1, 0, 1, C(0x9fb6c6));
        if (night) { B.set('white', 0.4, 0, 2.2); boxQ(B, P, s, s2, L0 - 2.4, L0 - 1.9, y - 0.5, y - 0.35, warmL); glow(P((s + s2) / 2, L0 - 2.2, y - 0.6), 1.6, [1, 0.9, 0.72]); }
      }
      // roof slab
      B.set('white', 0.7, 0); boxQ(B, P, s, s2, L0 - 3, L1 + 0.5, 19.6, 20.1, white);
      // closed garages ahead of the building where pit.js has none (its ten garages sit within ~95 m of the line)
      if (s2 <= -96 || s >= 96) {
        B.set(Rr.shutter, 0.7, 0.05); wq(B, P(s, gF, 0), P(s2, gF, 0), P(s2, gF, 6.4), P(s, gF, 6.4), (s - S0) / 18, (s2 - S0) / 18, 0, 1);
        B.set('white', 0.7, 0); boxQ(B, P, s, s2, gF, L0, 6.4, 7.0, white);
        if (night) { B.set('white', 0.4, 0, 1.6); boxQ(B, P, s, s2, gF - 0.3, gF, 6.0, 6.2, warmL); }
      }
    }
    // end walls
    for (const [s, f] of [[S0, 1], [S1, -1]]) { B.set(R.stone, 0.75, 0); const a = P(s, L0, 0), b = P(s, L1, 0), c = P(s, L1, 20), d = P(s, L0, 20); if (f > 0) B.quad(a, d, c, b, stone); else B.quad(a, b, c, d, stone); }
    // the canopy: a flat cantilevered roof from over the pit lane to behind the building, rising towards the track (u4)
    for (let s = S0; s < S1; s += 40) {
      const s2 = Math.min(S1, s + 40); const f = lapFrame(t, t.sf + (s + s2) / 2, side);
      const m = EI.Env.frame(f.x, f.y, f.z, f.tx, f.tz, f.nx, f.nz);
      flatRoof(B, m, -(s2 - s) / 2 - 0.02, (s2 - s) / 2 + 0.02, latC + 1, L1 + 2, 24.0, 21.6, [-f.nx, -f.nz], 0.14, 10);
    }
    // the pit lane itself under the canopy
    for (let s = S0 + 10; s < S1; s += 33) flood(P(s, latC + 4, 24), { power: 0.12, aim: [-lapFrame(t, t.sf + s, side).nx, -lapFrame(t, t.sf + s, side).nz], spread: 1.2, range: 60 });
    out.pit = { latC: +latC.toFixed(1), L0: +L0.toFixed(1), L1: +L1.toFixed(1) };
    return { latC, L0, L1, P };
  }
  function wq(B, a, b, c, d, u0, u1, v0, v1, col) { B.quad(a, b, c, d, col || C(0xffffff), [u0, v0, u1, v0, u1, v1, u0, v1]); B.quad(a, d, c, b, col || C(0xffffff), [u0, v0, u0, v1, u1, v1, u1, v0]); }
  function boxQ(B, P, s0, s1, l0, l1, y0, y1, col) {
    const c = [P(s0, l0, y0), P(s1, l0, y0), P(s1, l1, y0), P(s0, l1, y0), P(s0, l0, y1), P(s1, l0, y1), P(s1, l1, y1), P(s0, l1, y1)];
    const f = (a, b, cc, d) => { B.quad(c[a], c[b], c[cc], c[d], col); B.quad(c[a], c[d], c[cc], c[b], col); };
    f(4, 5, 6, 7); f(0, 1, 2, 3); f(0, 1, 5, 4); f(3, 2, 6, 7); f(0, 3, 7, 4); f(1, 2, 6, 5);
  }

  // ---------------------------------------------------------------- the paddock: marina-facing team buildings, limestone, two
  // storeys, each roof carrying white peaked tents (the row of tents seen across the marina)
  function paddock(E, B, LN, R, Rr, H, out) {
    const t = E.t; const list = t.data.scenery.buildings.filter(b => Arch.owns(b, t) === 'paddock'); let tents = 0;
    const stone = C(0xffffff), tentC = C(0xfbfaf6), tentU = C(0xf3ead6); const night = isNight();
    for (const b of list) {
      const p = b.p; let y0 = Infinity; for (const q of p) y0 = Math.min(y0, E.ground(q[0], q[1])); y0 -= 0.3; const h = 8.6;
      B.set(Rr.marina, 0.8, 0, night ? 0.55 : 0); H.prism(B, p, y0, y0 + h, stone, 16, 8.6);
      B.set('white', 0.8, 0); H.cap(B, p, y0 + h, C(0xe8dcc6), true);
      // oriented rectangle from the longest edge
      let best = 0, ax = 1, az = 0; for (let i = 0; i < p.length; i++) { const a = p[i], q = p[(i + 1) % p.length]; const l = Math.hypot(q[0] - a[0], q[1] - a[1]); if (l > best) { best = l; ax = (q[0] - a[0]) / l; az = (q[1] - a[1]) / l; } }
      const c = cen(p); let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity; for (const q of p) { const dx = q[0] - c[0], dz = q[1] - c[1]; const u = dx * ax + dz * az, v = -dx * az + dz * ax; a0 = Math.min(a0, u); a1 = Math.max(a1, u); b0 = Math.min(b0, v); b1 = Math.max(b1, v); }
      const m = EI.Env.frame(c[0], y0 + h, c[1], ax, az, -az, ax); const len = a1 - a0, dep = b1 - b0; const nT = Math.max(1, Math.round(len / 8.5)), w = len / nT;
      for (let k = 0; k < nT; k++) {
        const x0 = a0 + k * w + 0.4, x1 = x0 + w - 0.8; const pk = 3.6 + 0.4 * Math.min(1, w / 9);
        membrane(B, m, x0, x1, b0 + 0.6, b1 - 0.6, (u, v) => { const d = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 2; return 1.2 + pk * Math.pow(Math.max(0, 1 - d), 1.7); }, 6, 6, tentC, tentU, night ? 0.45 : 0);
        B.set('white', 0.45, 0.4, 0); B.col(m, (x0 + x1) / 2, (b0 + b1) / 2, 0, 1.2 + pk + 1.6, 0.08, 0.05, 6, C(0xcfd3d7), true); tents++;
        for (const [cx, cz] of [[x0, b0 + 0.6], [x1, b0 + 0.6], [x0, b1 - 0.6], [x1, b1 - 0.6]]) B.col(m, cx, cz, 0, 1.2, 0.07, 0.07, 5, C(0xcfd3d7));
        if (night) glow(xf(m, (x0 + x1) / 2, 1.0, (b0 + b1) / 2), 3.5, [1.0, 0.86, 0.62]);
      }
      if (night) flood(xf(m, 0, 2, 0), { power: 0.12, range: 30, color: [1.0, 0.86, 0.66] });
    }
    out.paddock = { buildings: list.length, tents };
  }

  // ---------------------------------------------------------------- race control towers (a05): a waisted shaft of dark glass behind a
  // white diamond lattice, carrying the control room as a big inverted cone of dark glass, a white disc roof with a light open
  // crown of raking posts, a mast with the aircraft light (two: Turn 1 and the marina)
  function tower(B, R, Rr, x, z, y0, k) {
    const m = new THREE.Matrix4().makeTranslation(x, y0, z); const white = C(0xf6f6f3); const night = isNight();
    const s = (v) => v * k; const H = 24;
    const rr = (y) => y < 13 ? 5 + 2 * Math.pow((13 - y) / 13, 2) : 5 + 3.5 * Math.pow((y - 13) / 11, 2);
    // the glass core
    B.set(Rr.towerG, 0.15, 0.3, night ? 0.55 : 0);
    for (let j = 0; j < 8; j++) { const ya = H * j / 8, yb = H * (j + 1) / 8; B.col(m, 0, 0, s(ya), s(yb), s(rr(ya)), s(rr(yb)), 20, C(0xffffff)); }
    // the white diamond lattice: two families of helical members
    const N = 18, NS = 8; const P = (a, y) => { const r = s(rr(y) + 0.18); return [x + Math.cos(a) * r, y0 + s(y), z + Math.sin(a) * r]; };
    B.set('white', 0.5, 0.1, night ? 0.15 : 0);
    for (let i = 0; i < N; i++) for (const tw of [1, -1]) for (let j = 0; j < NS; j++) {
      const ya = H * j / NS, yb = H * (j + 1) / NS, a0 = 2 * Math.PI * i / N;
      B.beam(I4, P(a0 + tw * j * Math.PI / N, ya), P(a0 + tw * (j + 1) * Math.PI / N, yb), s(0.32), white);
    }
    for (let j = 0; j <= NS; j += 2) { const y = H * j / NS; for (let i = 0; i < N * 2; i++) B.beam(I4, P(Math.PI * i / N, y), P(Math.PI * (i + 1) / N, y), s(0.22), white); }
    // control room: the inverted cone of dark glass, a white sill
    B.set(Rr.towerG, 0.1, 0.35, night ? 0.95 : 0); B.col(m, 0, 0, s(H), s(H + 9.5), s(8.6), s(14), 28, C(0xffffff));
    B.set('white', 0.5, 0.05); B.col(m, 0, 0, s(H - 0.4), s(H), s(8.4), s(8.7), 28, white);
    // the disc roof and its crown
    B.col(m, 0, 0, s(H + 9.5), s(H + 10.0), s(14), s(15.2), 28, white); B.col(m, 0, 0, s(H + 10.0), s(H + 10.5), s(15.2), s(15.2), 28, white, true);
    B.col(m, 0, 0, s(H + 10.5), s(H + 12.4), s(8), s(7.4), 20, white, true);
    const nc = 24; const cr = (a, r, y) => [x + Math.cos(a) * s(r), y0 + s(y), z + Math.sin(a) * s(r)];
    B.set('white', 0.5, 0.2);
    for (let i = 0; i < nc; i++) { const a = 2 * Math.PI * i / nc, a2 = 2 * Math.PI * (i + 1) / nc; B.beam(I4, cr(a, 13.8, H + 10.5), cr(a + 0.08, 16.2, H + 13.2), s(0.22), white); B.beam(I4, cr(a + 0.08, 16.2, H + 13.2), cr(a2 + 0.08, 16.2, H + 13.2), s(0.18), white); B.beam(I4, cr(a, 13.8, H + 10.5), cr(a2 + 0.08, 16.2, H + 13.2), s(0.12), white); }
    B.set('white', 0.4, 0.6); B.col(m, 0, 0, s(H + 12.4), s(H + 19), s(0.2), s(0.07), 6, C(0xc9ccd0), true);
    glow([x, y0 + s(H + 19.2), z], 1.8, [1.0, 0.12, 0.08], { pulse: 0.5 });   // aircraft warning light
    if (night) { for (let a = 0; a < 8; a++) glow([x + Math.cos(a * 0.785) * s(14.6), y0 + s(H + 9.2), z + Math.sin(a * 0.785) * s(14.6)], 2.4, [0.75, 0.88, 1.0]); flood([x, y0 + s(H), z], { power: 0.25, range: 45, color: [0.75, 0.85, 1.0] }); }
  }
  function towers(E, B, R, Rr, pit, out) {
    const t = E.t; const tw = t.data.scenery.buildings.filter(b => b.n === 'Control Tower'); const done = [];
    for (const b of tw) { const c = cen(b.p); let y0 = Infinity; for (const q of b.p) y0 = Math.min(y0, E.ground(q[0], q[1])); tower(B, R, Rr, c[0], c[1], y0 - 0.3, 1); done.push(c); }
    // the marina tower: on the quay between the paddock and the W hotel (searched: dry, clear ground nearest that line)
    const H = E.data.hotel && E.data.hotel.parts && E.data.hotel.parts.length ? cen(E.data.hotel.parts[0].p) : null;
    const pads = t.data.scenery.buildings.filter(b => Arch.owns(b, t) === 'paddock').map(b => cen(b.p));
    if (H && pads.length) {
      let far = pads[0], fd = -1; for (const p of pads) { const d = -Math.hypot(p[0] - H[0], p[1] - H[1]); if (d > fd) { fd = d; far = p; } }
      let best = null; const OCC = EI.Env.OCC;
      for (let k = 0; k <= 20; k++) for (let r = -30; r <= 30; r += 6) {
        const x = far[0] + (H[0] - far[0]) * k / 20 + r, z = far[1] + (H[1] - far[1]) * k / 20 - r * 0.5;
        if (E.isSea && E.isSea(x, z)) continue; if (E.occAt(x, z) & (OCC.BUILT | OCC.ROAD)) continue; const pr = t.project(x, z, null, {}); if (pr.dist < Math.max(t.wallL[pr.i], t.wallR[pr.i]) + 15) continue;
        if (done.some(d => Math.hypot(d[0] - x, d[1] - z) < 120)) continue;
        const sc = Math.abs(k - 7);
        if (!best || sc < best.sc) best = { x, z, sc };
      }
      if (best) { tower(B, R, Rr, best.x, best.z, E.ground(best.x, best.z) - 0.3, 0.92); done.push([best.x, best.z]); }
    }
    out.towers = done.map(d => d.map(v => Math.round(v)));
  }

  // ---------------------------------------------------------------- the white tube bridge over the pit straight (the start lights
  // hang from it), a glazed officials' pod on the pit side, the partners' panel facing the grid
  function bridge(E, B, R, Rr, out) {
    // the start gantry (u4; ABUDHABI-UPGRADE after the 2024-25 photos #026 / #028: a WHITE portal frame - two legs and a top beam - round
    // the black sign panels): the white box beam over the grid carrying the partners' sign, the taller black panel above it between the
    // legs with the title partner in white between chequered ends, a strip of LED downlights along its underside (the start lights hang
    // below it, track.js)
    const t = E.t; const f = lapFrame(t, t.sf + 6, 1); const night = isNight();
    const wl = t.wallL[f.i] + 2.5, wr = t.wallR[f.i] + 2.5; const y = f.y;
    const P = (lat, h, a) => [f.x + f.nx * lat + f.tx * (a || 0), y + h, f.z + f.nz * lat + f.tz * (a || 0)];
    const black = C(0x15161a), trim = C(0xb4b8be), frameW = C(0xeeeeeb);
    // an axis-aligned box in (lat, h, a): six faces wound outward (the world material is single sided)
    const boxL = (l0, l1, h0, h1, a0, a1, col, faces) => {
      const c = (l, h, a) => P(l, h, a); const mid = P((l0 + l1) / 2, (h0 + h1) / 2, (a0 + a1) / 2);
      const F = { top: [c(l0, h1, a0), c(l1, h1, a0), c(l1, h1, a1), c(l0, h1, a1)], bot: [c(l0, h0, a0), c(l0, h0, a1), c(l1, h0, a1), c(l1, h0, a0)],
        front: [c(l0, h0, a0), c(l1, h0, a0), c(l1, h1, a0), c(l0, h1, a0)], back: [c(l0, h0, a1), c(l0, h1, a1), c(l1, h1, a1), c(l1, h0, a1)],
        left: [c(l0, h0, a0), c(l0, h1, a0), c(l0, h1, a1), c(l0, h0, a1)], right: [c(l1, h0, a0), c(l1, h0, a1), c(l1, h1, a1), c(l1, h1, a0)] };
      for (const k of faces || Object.keys(F)) { let [A, Bq, Cq, D] = F[k]; const ux = Bq[0] - A[0], uy = Bq[1] - A[1], uz = Bq[2] - A[2], vx = D[0] - A[0], vy = D[1] - A[1], vz = D[2] - A[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const ox = (A[0] + Cq[0]) / 2 - mid[0], oy = (A[1] + Cq[1]) / 2 - mid[1], oz = (A[2] + Cq[2]) / 2 - mid[2];
        if (nx * ox + ny * oy + nz * oz < 0) B.quad(A, D, Cq, Bq, col); else B.quad(A, Bq, Cq, D, col); }
    };
    B.set('white', 0.5, 0.2); boxL(-wl - 0.6, wr + 0.6, 8.9, 10.9, -0.9, 0.9, frameW);
    // the sign on both faces of the beam (repeated) and of the raised panel
    const signQ = (l0, l1, h0, h1, a, rep, flip) => { const A = P(l0, h0, a), Bq = P(l1, h0, a), Cq = P(l1, h1, a), D = P(l0, h1, a); const uv = flip ? [rep, 0, 0, 0, 0, 1, rep, 1] : [0, 0, rep, 0, rep, 1, 0, 1];
      const ux = Bq[0] - A[0], uz = Bq[2] - A[2], vy = D[1] - A[1]; const nz = ux * vy, nx = -uz * vy; const fx = f.tx * a, fz = f.tz * a; if (nx * fx + nz * fz >= 0) B.quad(A, Bq, Cq, D, C(0xffffff), uv); else B.quad(A, D, Cq, Bq, C(0xffffff), [uv[0], uv[1], uv[6], uv[7], uv[4], uv[5], uv[2], uv[3]]); };
    B.set(Rr.sign, 0.5, 0.1, night ? 0.9 : 0.15); const span = wl + wr; const rep = Math.max(1, Math.round(span / 16));
    for (const a of [-0.92, 0.92]) signQ(-wl + 0.2, wr - 0.2, 9.15, 10.65, a, rep, a < 0);
    B.set('white', 0.55, 0.3); boxL(-9.5, 9.5, 10.9, 15.2, -0.55, 0.55, black, ['top', 'left', 'right', 'front', 'back']);
    for (const [l0, l1] of [[-wl + 0.1, -9.5], [9.5, wr - 0.1]]) if (l1 - l0 > 0.5) boxL(l0, l1, 10.9, 15.2, -0.5, 0.5, black, ['front', 'back']);
    B.set('white', 0.5, 0.2); boxL(-wl - 1.3, wr + 1.3, 15.2, 16.1, -0.75, 0.75, frameW);
    B.set(Rr.signP || Rr.sign, 0.5, 0.1, night ? 1.0 : 0.2); for (const a of [-0.57, 0.57]) signQ(-9.2, 9.2, 11.15, 14.95, a, 1, a < 0);
    // trim lines and columns
    B.set('white', 0.5, 0.4); for (const a of [-0.92, 0.92]) { boxL(-wl - 0.6, wr + 0.6, 10.9, 11.05, a - 0.04, a + 0.04, trim); boxL(-wl - 0.6, wr + 0.6, 8.75, 8.9, a - 0.04, a + 0.04, trim); }
    B.set('white', 0.5, 0.2); for (const lat of [-wl - 0.6, wr + 0.6]) boxL(lat - 0.7, lat + 0.7, -0.5, 15.2, -0.75, 0.75, frameW, ['left', 'right', 'front', 'back']);
    // LED downlights under the beam
    B.set('white', 0.3, 0, night ? 2.2 : 0.4); for (let lat = -wl + 1.5; lat < wr - 1; lat += 2.5) boxL(lat - 0.25, lat + 0.25, 8.8, 8.9, -0.2, 0.2, C(0xfff6e8), ['bot']);
    if (night) for (let lat = -wl + 3; lat < wr - 2; lat += 5) glow(P(lat, 8.6, 0), 1.4, [1, 0.96, 0.9]);
    out.bridge = true;
  }

  // ---------------------------------------------------------------- floodlight poles (u1-u3): slim white poles 30-35 m tall,
  // the head a tree-like cluster of small lamps on short arms aimed at the track, a red aviation light on top. Every ~48 m
  // a side, ~34 m along the marina and the hotel. Three instanced meshes (poles, head frames, lamps + aviation lights with
  // vertex colours); each head is a flood in the light map and a glow
  function floodlights(E, out) {
    const t = E.t, sc = E.sc, OCC = EI.Env.OCC; const spots = []; const L = t.length; const pr = {};
    const near = (x, z, r) => spots.some(s => Math.hypot(s[0] - x, s[2] - z) < r);
    const H = E.data.hotel; const hp0 = H && H.parts && H.parts.length ? H.parts[0].p[0] : null;
    // dense where the track runs by the water or the hotel
    const dense = (s) => { const i = t.idxAtS(s); for (const side of [1, -1]) for (const o of [25, 45, 70]) { const x = t.x[i] + t.nx[i] * side * o, z = t.z[i] + t.nz[i] * side * o; if (E.isSea && E.isSea(x, z)) return true; } return !!(hp0 && Math.hypot(t.x[i] - hp0[0], t.z[i] - hp0[1]) < 260); };
    for (const side of [1, -1]) { let s = side > 0 ? 8 : 29; while (s < L) {
      const dn = dense(s); const step = dn ? 34 : 48;
      for (const off of [3.6, 5, 8, 12, 17, 24, 32]) {
        const i = t.idxAtS(s); const wall = E.wallCap ? E.wallCap(i, side) : (side < 0 ? t.wallL[i] : t.wallR[i]); const d = wall + off;
        const x = t.x[i] + t.nx[i] * side * d, z = t.z[i] + t.nz[i] * side * d;
        if (E.occAt(x, z) & (OCC.BUILT | OCC.ROAD | OCC.WATER)) continue; if (E.isSea && E.isSea(x, z)) continue;
        t.project(x, z, null, pr); if (pr.dist < Math.max(t.wallL[pr.i], t.wallR[pr.i]) + 4) continue; if (near(x, z, step * 0.62)) continue;
        let ax = t.x[pr.i] - x, az = t.z[pr.i] - z; const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
        spots.push([x, E.ground(x, z), z, Math.atan2(ax, az), 30 + ((s * 7) % 6), ax, az, step]); break;
      }
      s += step; } }
    if (!spots.length) return;
    const night = isNight();
    // the head: a short mast, three tiers of arms fanning towards the track, a lamp on every arm end (5 + 4 + 3 lamps)
    const tilt = new THREE.Matrix4().makeRotationX(0.32); const frame = [], lampG = [], cols = [];
    const mast = new THREE.CylinderGeometry(0.12, 0.16, 5.2, 6, 1); mast.translate(0, 0.4, 0); frame.push(mast);
    const lampW = new THREE.Color(1.0, 0.97, 0.9), red = new THREE.Color(1.0, 0.06, 0.03);
    const pushLamp = (g, c) => { const n = g.attributes.position.count; const ca = new Float32Array(n * 3); for (let k = 0; k < n; k++) { ca[k * 3] = c.r; ca[k * 3 + 1] = c.g; ca[k * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(ca, 3)); lampG.push(g); };
    [[5, 2.2, 1.0], [4, 1.0, 0.9], [3, -0.2, 0.75]].forEach(([nl, y, sp]) => {
      for (let k = 0; k < nl; k++) {
        const a = (k - (nl - 1) / 2) * 0.42 * sp, r = 1.15 + 0.25 * Math.abs(k - (nl - 1) / 2); const lx = Math.sin(a) * r, lz = Math.cos(a) * r;
        const arm = new THREE.BoxGeometry(0.08, 0.08, r); arm.translate(0, 0, r / 2); arm.applyMatrix4(new THREE.Matrix4().makeRotationY(a)); arm.translate(0, y, 0); frame.push(arm);
        const box = new THREE.BoxGeometry(0.5, 0.42, 0.26); box.applyMatrix4(tilt); box.applyMatrix4(new THREE.Matrix4().makeRotationY(a)); box.translate(lx, y, lz); frame.push(box);
        const face = new THREE.PlaneGeometry(0.44, 0.36); face.translate(0, 0, 0.14); face.applyMatrix4(tilt); face.applyMatrix4(new THREE.Matrix4().makeRotationY(a)); face.translate(lx, y, lz); pushLamp(face, lampW);
      }
    });
    const av = new THREE.SphereGeometry(0.2, 6, 4); av.translate(0, 3.15, 0); pushLamp(av, red);
    const headG = EI.Env.merge(frame), lampsG = EI.Env.merge(lampG);
    const col = new THREE.CylinderGeometry(0.17, 0.36, 1, 8, 1); col.translate(0, 0.5, 0);
    const mPy = new THREE.MeshStandardMaterial({ color: 0xeceef0, roughness: 0.5, metalness: 0.25 });
    const lampK = night ? 3.2 : 1.1;
    const mLamp = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(lampK, lampK, lampK), toneMapped: false }); mLamp.userData.nightEmissive = true;
    const n = spots.length;
    const iPole = new THREE.InstancedMesh(col, mPy, n), iHead = new THREE.InstancedMesh(headG, mPy, n), iL = new THREE.InstancedMesh(lampsG, mLamp, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1), sp = new THREE.Vector3();
    spots.forEach((S, k) => {
      const [x, y, z, yaw, Hh, ax, az, step] = S; e.set(0, yaw, 0); q.setFromEuler(e);
      m.compose(p.set(x, y - 0.2, z), q, sp.set(1, Hh, 1)); iPole.setMatrixAt(k, m);
      m.compose(p.set(x, y + Hh, z), q, s1); iHead.setMatrixAt(k, m); iL.setMatrixAt(k, m);
      const hp = [x + ax * 1.2, y + Hh + 1.0, z + az * 1.2];
      flood(hp, { power: 0.95 * step / 62, aim: [ax, az], spread: 1.0, range: 120 });
      glow(hp, 4.5, [1.0, 0.97, 0.9]); glow([x, y + Hh + 3.15, z], 1.6, [1.0, 0.12, 0.06], { pulse: 0.5 });
    });
    const bb = new THREE.Box3(); for (const S of spots) bb.expandByPoint(p.set(S[0], S[1], S[2])); bb.max.y += 42; const bs = bb.getBoundingSphere(new THREE.Sphere());
    for (const im of [iPole, iHead, iL]) { im.instanceMatrix.needsUpdate = true; im.castShadow = false; im.receiveShadow = false; im.geometry = im.geometry.clone(); im.geometry.boundingSphere = bs.clone(); }
    iPole.name = 'yasFloodPoles'; iHead.name = 'yasFloodHeads'; iL.name = 'yasFloodLamps';
    sc.group.add(iPole); sc.group.add(iHead); sc.group.add(iL); out.floodlights = n; out.floodTris = n * (16 + (headG.attributes.position.count + lampsG.attributes.position.count) / 3);
  }

  // ---------------------------------------------------------------- entry point (from EI.EnvYas.build, before the world is built)
  // H: helpers from env_yas.js { W, R, prism, cap, batchMesh, statics }
  Arch.build = function (E, H, out) {
    const SK = SKx(); const B = new SK.Batch(), LN = new SK.Lines(); const Rr = regions(); const R = H.R;
    const step = (k, fn) => { const t0 = performance.now(); try { fn(); } catch (e) { console.error('EnvYasArch ' + k, e); } out['ms_arch_' + k] = Math.round(performance.now() - t0); };
    step('sails', () => { out.standSails = standSails(E, B, LN); });
    step('north', () => northStand(E, B, LN, out));
    let pit = null; step('pit', () => { pit = pitBuilding(E, B, LN, R, Rr, out); });
    step('paddock', () => paddock(E, B, LN, R, Rr, H, out));
    step('towers', () => towers(E, B, R, Rr, pit, out));
    step('bridge', () => bridge(E, B, R, Rr, out));
    step('tents', () => tentRow(E, B, LN, out));
    step('flood', () => floodlights(E, out));
    H.W.add(B, 'main'); H.W.add(LN, 'lines'); out.archTris = B.count / 3;
  };
  Arch.regions = regions;
  EI.EnvYasArch = Arch;
})();
