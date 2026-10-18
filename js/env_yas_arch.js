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
      [1203, 1482, -1, 3, 19, false, 0x1d4f8f],   // North Grandstand round the Turn 5 hairpin
      [2380, 2712, -1, 3, 15, false, 0x8c1d24],   // West Grandstand at the Turn 6-7 chicane
    ]);
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
    const sign = AT.region('yasBridgeSign', 512, 64, (x, w, h) => {
      x.fillStyle = '#0b0c0f'; x.fillRect(0, 0, w, h); const A = EI.Ads;
      // chequered flag ends
      for (const x0 of [0, w - 40]) for (let i = 0; i < 5; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2) { x.fillStyle = '#f2f2f0'; x.fillRect(x0 + i * 8, j * 8, 8, 8); }
      x.save(); x.fillStyle = '#ffffff'; x.font = '800 34px "Plus Jakarta Sans", Arial, sans-serif'; x.textBaseline = 'middle'; x.textAlign = 'center';
      x.fillText('trylumi.co', w * 0.25, h / 2 + 2); x.fillText('intake.ink', w * 0.75, h / 2 + 2); x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(w / 2 - 1, 10, 2, h - 20); x.restore();
      if (A && A.lumiMark) try { A.lumiMark(x, 52, 12, 40, null, true); } catch (e) { }
    });
    RG = { glassN, marina, shutter, towerG, sign }; return RG;
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
      const m = EI.Env.frame(b.cx, b.y, b.cz, b.ax, b.az, b.nx, b.nz); const hl = b.len / 2, rows = b.rows;
      const yTop = 1.4 + rows * 0.42, zBack = 0.4 + rows * 0.82;
      sailRow(B, LN, m, -hl - 0.3, hl + 0.3, -4.2, zBack + 1.4, yTop + 3.4, 3.6, 3.0, [-b.nx, -b.nz], 0.16); n++;
      // the back of the stand: pale composite cladding over a lit concourse of kiosks and fans (instead of the bare dark wall)
      const TX = EI.EnvYasTex.regions(), zc = zBack + 0.07, yC = 3.6, yT = yTop + 1.2;
      const Q = (x, y, z) => xf(m, x, y, z);
      B.set(TX.clad, 0.6, 0.15, 0); B.quad(Q(-hl, yC, zc), Q(hl, yC, zc), Q(hl, yT, zc), Q(-hl, yT, zc), C(0xffffff), [0, 0, b.len / 12, 0, b.len / 12, (yT - yC) / 6, 0, (yT - yC) / 6]);
      B.set(TX.concourse, 0.7, 0, isNight() ? 1.05 : 0); B.quad(Q(-hl, 0, zc), Q(hl, 0, zc), Q(hl, yC, zc), Q(-hl, yC, zc), C(0xffffff), [0, 0, b.len / 12, 0, b.len / 12, 1, 0, 1]);
      B.set('white', 0.5, 0.4, isNight() ? 1.6 : 0); B.box(m, b.len, 0.14, 0.18, 0, yC - 0.1, zc + 0.12, isNight() ? C(0x7fd6ff) : C(0xdfe5ea));
      if (isNight()) { for (let a = -hl + 4; a < hl; a += 9) glow(Q(a, 2.6, zc + 1.2), 2.2, [1.0, 0.85, 0.6]); flood(Q(0, 6, zc + 6), { power: 0.06 * Math.max(1, b.len / 30), range: 30, color: [1.0, 0.86, 0.66] }); }
      // a second, weaker flood back over the crowd
      flood(xf(m, 0, yTop + 4, zBack * 0.5), { power: 0.05 * Math.max(1, b.len / 25), range: 40 });
    }
    return n;
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
    // the canopy: sail modules from over the pit lane to behind the building, rising towards the track
    for (let s = S0; s < S1; s += 40) {
      const s2 = Math.min(S1, s + 40); const f = lapFrame(t, t.sf + (s + s2) / 2, side);
      const m = EI.Env.frame(f.x, f.y, f.z, f.tx, f.tz, f.nx, f.nz);
      sailRow(B, LN, m, -(s2 - s) / 2 - 0.2, (s2 - s) / 2 + 0.2, latC + 1, L1 + 2, 21.5, 5.5, 3.2, [-f.nx, -f.nz], 0.14);
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

  // ---------------------------------------------------------------- race control towers: white tapered shaft on a podium, a flared
  // cup holding the dark glass control room band, a white conical cap and mast (two: Turn 1 and the marina)
  function tower(B, R, Rr, x, z, y0, k) {
    const m = new THREE.Matrix4().makeTranslation(x, y0, z); const white = C(0xf6f6f3), whiteD = C(0xdcdedf); const night = isNight();
    const s = (v) => v * k;
    B.set(R.stone, 0.7, 0); B.col(m, 0, 0, 0, s(6), s(9), s(8.5), 16, white);
    B.set('white', 0.55, 0.05); B.col(m, 0, 0, s(6), s(31), s(4.6), s(3.3), 16, white);
    // vertical slot windows up the shaft
    B.set(Rr.towerG, 0.2, 0.2, night ? 0.6 : 0); B.col(m, 0, 0, s(10), s(29), s(4.36), s(3.37), 4, C(0xffffff));
    B.set('white', 0.55, 0.05); B.col(m, 0, 0, s(31), s(33.5), s(3.3), s(6.2), 16, white);                       // the flare
    B.set(Rr.towerG, 0.12, 0.3, night ? 0.9 : 0); B.col(m, 0, 0, s(33.5), s(38.5), s(6.2), s(6.7), 20, C(0xffffff)); // control room glass
    B.set('white', 0.5, 0.05); B.col(m, 0, 0, s(38.5), s(39.6), s(7.0), s(7.0), 20, whiteD, true);
    B.col(m, 0, 0, s(39.6), s(46), s(6.8), s(0.4), 20, white, true);                                          // conical cap
    B.set('white', 0.4, 0.6); B.col(m, 0, 0, s(46), s(53), s(0.18), s(0.06), 6, C(0xc9ccd0), true);
    glow([x, y0 + s(53.2), z], 1.8, [1.0, 0.12, 0.08], { pulse: 0.5 });   // aircraft warning light
    if (night) { for (let a = 0; a < 6; a++) glow([x + Math.cos(a) * s(7.1), y0 + s(36), z + Math.sin(a) * s(7.1)], 3.2, [0.55, 0.75, 1.0]); flood([x, y0 + s(30), z], { power: 0.25, range: 45, color: [0.75, 0.85, 1.0] }); }
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
    // the start gantry (u4): a black box beam over the grid on black columns, a taller sign panel in the middle with our partners
    // in white between chequered ends, a strip of LED downlights along its underside (the start lights hang below it, track.js)
    const t = E.t; const f = lapFrame(t, t.sf + 6, 1); const night = isNight();
    const wl = t.wallL[f.i] + 2.5, wr = t.wallR[f.i] + 2.5; const y = f.y;
    const P = (lat, h, a) => [f.x + f.nx * lat + f.tx * (a || 0), y + h, f.z + f.nz * lat + f.tz * (a || 0)];
    const black = C(0x15161a), trim = C(0x2c2f35);
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
    B.set('white', 0.55, 0.3); boxL(-wl - 0.6, wr + 0.6, 8.9, 10.9, -0.9, 0.9, black);
    // the sign on both faces of the beam (repeated) and of the raised panel
    const signQ = (l0, l1, h0, h1, a, rep, flip) => { const A = P(l0, h0, a), Bq = P(l1, h0, a), Cq = P(l1, h1, a), D = P(l0, h1, a); const uv = flip ? [rep, 0, 0, 0, 0, 1, rep, 1] : [0, 0, rep, 0, rep, 1, 0, 1];
      const ux = Bq[0] - A[0], uz = Bq[2] - A[2], vy = D[1] - A[1]; const nz = ux * vy, nx = -uz * vy; const fx = f.tx * a, fz = f.tz * a; if (nx * fx + nz * fz >= 0) B.quad(A, Bq, Cq, D, C(0xffffff), uv); else B.quad(A, D, Cq, Bq, C(0xffffff), [uv[0], uv[1], uv[6], uv[7], uv[4], uv[5], uv[2], uv[3]]); };
    B.set(Rr.sign, 0.5, 0.1, night ? 0.9 : 0.15); const span = wl + wr; const rep = Math.max(1, Math.round(span / 16));
    for (const a of [-0.92, 0.92]) signQ(-wl + 0.2, wr - 0.2, 9.15, 10.65, a, rep, a > 0);
    B.set('white', 0.55, 0.3); boxL(-9.5, 9.5, 10.9, 15.2, -0.55, 0.55, black, ['top', 'left', 'right', 'front', 'back']);
    B.set(Rr.sign, 0.5, 0.1, night ? 1.0 : 0.2); for (const a of [-0.57, 0.57]) signQ(-9.2, 9.2, 11.15, 14.95, a, 1, a > 0);
    // trim lines and columns
    B.set('white', 0.5, 0.4); for (const a of [-0.92, 0.92]) { boxL(-wl - 0.6, wr + 0.6, 10.9, 11.05, a - 0.04, a + 0.04, trim); boxL(-wl - 0.6, wr + 0.6, 8.75, 8.9, a - 0.04, a + 0.04, trim); }
    for (const lat of [-wl - 0.6, wr + 0.6]) boxL(lat - 0.7, lat + 0.7, -0.5, 8.9, -0.7, 0.7, black, ['left', 'right', 'front', 'back']);
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
      glow(hp, 8.5, [1.0, 0.97, 0.9]); glow([x, y + Hh + 3.15, z], 1.6, [1.0, 0.12, 0.06], { pulse: 0.5 });
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
    let pit = null; step('pit', () => { pit = pitBuilding(E, B, LN, R, Rr, out); });
    step('paddock', () => paddock(E, B, LN, R, Rr, H, out));
    step('towers', () => towers(E, B, R, Rr, pit, out));
    step('bridge', () => bridge(E, B, R, Rr, out));
    step('flood', () => floodlights(E, out));
    H.W.add(B, 'main'); H.W.add(LN, 'lines'); out.archTris = B.count / 3;
  };
  Arch.regions = regions;
  EI.EnvYasArch = Arch;
})();
