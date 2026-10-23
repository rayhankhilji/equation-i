// Equation I - Monaco's signature landmarks (MONACO-LANDMARKS), on top of the city (js/env_city.js) and the harbour (js/env_street.js):
// Port Hercule's outer harbour - the cruise ship moored along the outside of the semi-floating breakwater (the Digue) and the fleet of
// superyachts swinging at anchor in the bay during race week. Gated to Monaco (track id); every other circuit is untouched.
// Everything is written into the street world's chunked batches (js/street_kit.js SK.World): no new material, no new draw call beyond
// the world's own cells; the distant pieces go into the 'main' layer (cheap massing, drawn on every tier), the close-up detail into
// 'detail' (dropped beyond the tier's mid range, 250 m on Low).
window.EI = window.EI || {};
(function () {
  const U = EI.U, Env = EI.Env; if (!U || !Env) return;
  const L = EI.EnvMonacoLandmarks = {};
  const C = (h) => new THREE.Color(h).convertSRGBToLinear();
  const isMonaco = (E) => !!(E && E.t && E.t.data && E.t.data.id === 'monaco');
  L.isMonaco = isMonaco;
  const polyArea = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; } return a / 2; };
  const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1]; const l2 = dx * dx + dz * dz || 1; const u = U.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1); return Math.hypot(a[0] + dx * u - x, a[1] + dz * u - z); };
  // a quad wound to face the world direction `want` (uv order follows a, b, c, d)
  const fq = (B, a, b, c, d, col, uv, want) => { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; if (nx * want[0] + ny * want[1] + nz * want[2] >= 0) B.quad(a, b, c, d, col, uv); else B.quad(d, c, b, a, col, uv ? [uv[6], uv[7], uv[4], uv[5], uv[2], uv[3], uv[0], uv[1]] : null); };
  const ft = (B, a, b, c, col, want) => { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]; const ny = uz * vx - ux * vz, nx = uy * vz - uz * vy, nz = ux * vy - uy * vx; if (nx * want[0] + ny * want[1] + nz * want[2] >= 0) B.tri(a, b, c, col); else B.tri(a, c, b, col); };
  const polyD = (x, z, p) => { let d = Infinity; for (let i = 0; i < p.length; i++) d = Math.min(d, segD(x, z, p[i], p[(i + 1) % p.length])); return d; };

  // ================================================================ hook: after the street pass (water, harbour, street kit), before the world is merged
  const ST = EI.EnvStreet;
  if (ST && ST.build) {
    const oBuild = ST.build;
    ST.build = function (E) {
      const r = oBuild.apply(this, arguments);
      if (isMonaco(E)) { const T0 = performance.now(); try { L.build(E); } catch (e) { console.error('EnvMonacoLandmarks', e); } E.timings.monacoLandmarks = Math.round(performance.now() - T0); }
      return r;
    };
  }

  // the trees on the slope in front of the ramparts (they hid the wall from the harbour): the vegetation pass drops every tree whose crown
  // would rise above the foot of the wall within 32 m in front of it (E.mlmWalls, written by L.rocher before the vegetation is planted)
  const VG = EI.EnvVeg;
  if (VG && VG.instance) {
    const oInst = VG.instance;
    VG.instance = function (E, trees) {
      if (isMonaco(E) && E.mlmWalls && E.mlmWalls.length && trees && trees.length) {
        try {
          const G = 12, H = new Map(); for (const w of E.mlmWalls) { const k = Math.floor(w.x / G) * 8192 + Math.floor(w.z / G); let l = H.get(k); if (!l) H.set(k, l = []); l.push(w); }
          const keep = []; let cut = 0;
          for (const tr of trees) {
            const x = tr[0], z = tr[1]; let drop = false; const gx = Math.floor(x / G), gz = Math.floor(z / G);
            for (let a = -3; a <= 3 && !drop; a++) for (let b = -3; b <= 3 && !drop; b++) { const l = H.get((gx + a) * 8192 + gz + b); if (!l) continue; for (const w of l) { const vx = x - w.x, vz = z - w.z; const al = vx * w.ox + vz * w.oz, la = Math.abs(-vx * w.oz + vz * w.ox); if (al > -9 && al < 32 && la < 7 + al * 0.3 && E.sc.height(x, z) + tr[4] > w.yb + 1) { drop = true; break; } } }
            if (drop) cut++; else keep.push(tr);
          }
          if (E.stats.mlm) E.stats.mlm.treesCleared = cut; trees = keep;
        } catch (e) { console.error('EnvMonacoLandmarks trees', e); }
      }
      return oInst.call(this, E, trees);
    };
  }

  L.build = function (E) {
    const SK = EI.StreetKit; if (!SK || !SK.world) return;
    E.stats.mlm = {}; L.debug = {};
    const lap = (k, f) => { const t0 = performance.now(); try { f(); } catch (e) { console.error('EnvMonacoLandmarks ' + k, e); E.stats.mlm['err_' + k] = String(e); } E.stats.mlm['ms_' + k] = Math.round(performance.now() - t0); };
    lap('harbour', () => L.outerHarbour(E)); lap('pool', () => L.pool(E)); lap('rocher', () => L.rocher(E));
  };

  // ================================================================ the Rocher: ramparts along the top of the cliffs over the port, round bastions,
  // the Monaco flag over the Prince's Palace. The plateau (E.plateaus[0]) is flat from ~12 m inside its outline; the wall runs along that
  // top edge wherever the ground in front drops away as a cliff, stops short of every building, and keeps well clear of the circuit.
  L.rocher = function (E) {
    const Pl = (E.plateaus || [])[0]; if (!Pl || !Pl.p || Pl.p.length < 4) return; const sc = E.sc, t = E.t, SKx = SK(); const W = SKx.world(sc);
    const ring = Pl.p; const edge = Pl.edge || 30; const inset = edge * 0.38;
    const stone = SKx.stone ? SKx.stone() : 'white';
    // building footprints on a 16 m hash
    const H = new Map(), G = 16; const hk = (x, z) => Math.floor(x / G) * 8192 + Math.floor(z / G);
    const bb = U.polyBounds(ring); const blds = (t.data.scenery.buildings || []).concat(Env.decodeCity(E.data.city), Env.decodeCity(E.data.cityFill)).map(b => b.p).concat(Object.values(E.data.landmarks || {}));
    for (const p of blds) { if (!p || p.length < 3) continue; const b = U.polyBounds(p); if (b.x1 < bb.x0 - 20 || b.x0 > bb.x1 + 20 || b.z1 < bb.z0 - 20 || b.z0 > bb.z1 + 20) continue; for (let x = Math.floor((b.x0 - 4) / G); x <= Math.floor((b.x1 + 4) / G); x++) for (let z = Math.floor((b.z0 - 4) / G); z <= Math.floor((b.z1 + 4) / G); z++) { const k = x * 8192 + z; let l = H.get(k); if (!l) H.set(k, l = []); l.push(p); } }
    const nearB = (x, z, r) => { const l = H.get(hk(x, z)); if (!l) return false; for (const p of l) if (U.pointInPoly(x, z, p) || polyD(x, z, p) < r) return true; return false; };
    const Bm = new SKx.Batch(), Bd = new SKx.Batch(); const lime = C(0xf3ead6), limeTop = C(0xd9cdb4); let nW = 0, nT = 0, len = 0;
    // the wall stands on the upper break of the slope: its outer face DOUT m outside the plateau outline, the walkway level with the
    // plateau DIN m inside it, so the face shows ~8-12 m of dressed stone over the cliff below (a low parapet on the top read as nothing)
    const DIN = 4, DOUT = 3; const runs = []; let cur = null; const n = ring.length;
    for (let i = 0; i < n; i++) {
      const a = ring[i], b = ring[(i + 1) % n]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 1) continue; const tx = (b[0] - a[0]) / l, tz = (b[1] - a[1]) / l;
      // inward normal (towards the plateau's inside)
      let nx = -tz, nz = tx; if (!U.pointInPoly((a[0] + b[0]) / 2 + nx * 4, (a[1] + b[1]) / 2 + nz * 4, ring)) { nx = -nx; nz = -nz; }
      for (let d = 0; d < l; d += 2.5) {
        const px = a[0] + tx * d, pz = a[1] + tz * d; const ix = px + nx * DIN, iz = pz + nz * DIN, ox = px - nx * DOUT, oz = pz - nz * DOUT;
        const gI = sc.gridHeight(ix, iz), gO = Math.min(sc.gridHeight(ox, oz), sc.gridHeight(ox - nx * 2, oz - nz * 2)); const gF = sc.gridHeight(px - nx * 26, pz - nz * 26);
        // only the faces that look over the port and the circuit (north-west round to east); the sea cliffs behind are not seen from the lap
        const ok = -nz < 0.35 && U.pointInPoly(ix, iz, ring) && gI - gF > 14 && gI - gO > 3 && E.dcAt(ox, oz) > 28 && E.dcAt(px - nx * 26, pz - nz * 26) > 12 && !nearB(ix, iz, 2.2) && !nearB(px, pz, 2) && !nearB(ox, oz, 2);
        if (ok) { if (!cur) runs.push(cur = []); cur.push({ ix, iz, x: ox, z: oz, gI, gO, ox: -nx, oz: -nz }); } else cur = null;
      }
      cur = null;
    }
    const I4 = new THREE.Matrix4(); const UP = [0, 1, 0]; const walls = E.mlmWalls = [];
    const turret = (x, z, yb, yt, r) => { Bm.set(stone, 0.95, 0); Bm.col(I4, x, z, yb, yt, r, r, 12, lime, true); Bd.set(stone, 0.95, 0); for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; const mm = Env.frame(x + Math.cos(a) * (r - 0.35), yt, z + Math.sin(a) * (r - 0.35), -Math.sin(a), Math.cos(a), Math.cos(a), Math.sin(a)); Bd.box(mm, 0.9, 0.85, 0.6, 0, 0, 0, lime, { top: limeTop }); } nT++; };
    const PT = 0.6;   // parapet thickness
    for (const R of runs) {
      if (R.length < 6) continue; let acc = 0;
      for (const q of R) { q.yT = q.gI + 1.4; q.yW = q.gI + 0.15; q.yb = q.gO - 1.5; walls.push(q); }
      for (let k = 0; k + 1 < R.length; k++) {
        const p = R[k], q = R[k + 1]; const l = Math.hypot(q.x - p.x, q.z - p.z); if (l > 5) continue; acc += l; len += l;
        const ox = (p.ox + q.ox) / 2, oz = (p.oz + q.oz) / 2; const u0 = acc / 4 - l / 4, u1 = acc / 4; Bm.set(stone, 0.95, 0);
        const A = [p.x, p.z], B = [q.x, q.z], Ap = [p.x - ox * PT, p.z - oz * PT], Bp = [q.x - ox * PT, q.z - oz * PT];
        // outer face: from below the slope surface up to the parapet top
        fq(Bm, [A[0], p.yb, A[1]], [B[0], q.yb, B[1]], [B[0], q.yT, B[1]], [A[0], p.yT, A[1]], lime, [u0, p.yb / 4, u1, q.yb / 4, u1, q.yT / 4, u0, p.yT / 4], [ox, 0, oz]);
        // parapet top and its inner face, the walkway back to the plateau, the low inner face
        fq(Bm, [A[0], p.yT, A[1]], [B[0], q.yT, B[1]], [Bp[0], q.yT, Bp[1]], [Ap[0], p.yT, Ap[1]], limeTop, null, UP);
        fq(Bm, [Ap[0], p.yW, Ap[1]], [Bp[0], q.yW, Bp[1]], [Bp[0], q.yT, Bp[1]], [Ap[0], p.yT, Ap[1]], lime, [u0, 0, u1, 0, u1, 0.35, u0, 0.35], [-ox, 0, -oz]);
        fq(Bm, [Ap[0], p.yW, Ap[1]], [Bp[0], q.yW, Bp[1]], [q.ix, q.yW, q.iz], [p.ix, p.yW, p.iz], limeTop, null, UP);
        fq(Bm, [p.ix, p.gI - 0.6, p.iz], [q.ix, q.gI - 0.6, q.iz], [q.ix, q.yW, q.iz], [p.ix, p.yW, p.iz], lime, [u0, 0, u1, 0, u1, 0.2, u0, 0.2], [-ox, 0, -oz]);
        // a merlon on every 2.5 m sample (detail layer)
        const mm = Env.frame((A[0] + B[0]) / 2 - ox * PT / 2, (p.yT + q.yT) / 2, (A[1] + B[1]) / 2 - oz * PT / 2, (B[0] - A[0]) / l, (B[1] - A[1]) / l, ox, oz);
        Bd.set(stone, 0.95, 0); Bd.box(mm, 1.1, 0.75, PT, 0, 0, 0, lime, { top: limeTop });
        if (acc > 110 && k < R.length - 12) { acc = 0; turret(q.x + ox * 1.2, q.z + oz * 1.2, q.yb - 1, q.yT + 1.6, 3.2); }
        nW++;
      }
      // the run's two ends closed (solid wall block between the outer face and the plateau)
      for (const [e, sg] of [[R[0], -1], [R[R.length - 1], 1]]) { const nb = R[sg < 0 ? 1 : R.length - 2]; const dx = e.x - nb.x, dz = e.z - nb.z; Bm.set(stone, 0.95, 0); fq(Bm, [e.x, e.yb, e.z], [e.ix, e.gI - 0.6, e.iz], [e.ix, e.yT, e.iz], [e.x, e.yT, e.z], lime, [0, e.yb / 4, 2, e.yb / 4, 2, e.yT / 4, 0, e.yT / 4], [dx, 0, dz]); }
      const e0 = R[0], e1 = R[R.length - 1]; if (R.length >= 16) { turret(e0.x + e0.ox * 1.2, e0.z + e0.oz * 1.2, e0.yb - 1, e0.yT + 1.8, 3.6); turret(e1.x + e1.ox * 1.2, e1.z + e1.oz * 1.2, e1.yb - 1, e1.yT + 1.8, 3.6); }
    }
    // the Monaco flag (red over white) on a tall pole over the Palace
    const pal = (E.data.landmarks || {}).palace;
    if (pal) {
      let cx = 0, cz = 0; for (const q of pal) { cx += q[0] / pal.length; cz += q[1] / pal.length; }
      if (U.pointInPoly(cx, cz, pal)) { const g = sc.gridHeight(cx, cz); const y0 = g + 3.6 * 3 + 4.4 - 3, y1 = y0 + 13; Bm.set('white', 0.5, 0.3); Bm.beam(I4, [cx, y0, cz], [cx, y1, cz], 0.22, C(0xe8e8e4), 6);
        const fl = (yA, yB, c) => { const a = [cx, yA, cz], b = [cx + 4.2, yA, cz + 1.2], c2 = [cx + 4.2, yB, cz + 1.2], d = [cx, yB, cz]; Bm.set('white', 0.85, 0); fq(Bm, a, b, c2, d, c, null, [-0.27, 0, 0.96]); fq(Bm, a, b, c2, d, c, null, [0.27, 0, -0.96]); };
        fl(y1 - 0.2, y1 - 1.6, C(0xce1126)); fl(y1 - 1.6, y1 - 3.0, C(0xf4f4f4)); E.stats.mlm.palaceFlag = [Math.round(cx), Math.round(cz), Math.round(y1)]; }
    }
    L.debug.ramparts = runs.filter(R => R.length >= 6).map(R => R.map(q => [Math.round(q.x), Math.round(q.z)]));
    W.add(Bm, 'main'); W.add(Bd, 'detail'); E.stats.mlm.ramparts = [runs.length, nW, Math.round(len), nT]; if (walls.length) { const hs = walls.map(w => w.yT - w.yb); E.stats.mlm.wallFace = [Math.round(Math.min(...hs)), Math.round(hs.reduce((a, b) => a + b, 0) / hs.length), Math.round(Math.max(...hs))]; }
  };

  // ================================================================ the Stade Nautique Rainier III: racing lanes on the basin built by the city pass
  // (E.poolInfo): lane ropes of red / white / blue floats, starting blocks along the deep end, backstroke flags across both ends
  L.pool = function (E) {
    const P = E.poolInfo; if (!P) return; const SKx = SK(); const W = SKx.world(E.sc); const Bd = new SKx.Batch(), Bf = new SKx.Batch();
    const wl = P.L / 2 - 2, ww = P.W / 2 - 1.5, yw = P.y - 0.35; if (wl < 8 || ww < 4) return;
    const m = Env.frame(P.cx, 0, P.cz, P.tx, P.tz, P.nx, P.nz);
    // the frame may have flipped the across axis: lanes are symmetric, so only the long axis matters
    const nL = Math.max(4, Math.min(10, Math.round(ww * 2 / 2.5))); const lw = ww * 2 / nL;
    const red = C(0xc8202a), white = C(0xf4f4f2), blue = C(0x1f4fa8), yel = C(0xf2c21a);
    for (let k = 1; k < nL; k++) {
      const z = -ww + k * lw; const edge = k === 1 || k === nL - 1;
      for (let x = -wl + 0.2; x < wl - 0.2; x += 1.0) {
        const u = (x + wl) / (2 * wl); const c = (u < 0.1 || u > 0.9) ? red : edge ? blue : (Math.floor((x + wl) / 1.0) % 2 ? white : (k % 2 ? blue : yel));
        const wp = Env.xf(m, x + 0.5, 0, z); if (E.sc.height(wp[0], wp[2]) > yw + 0.2) continue;
        Bd.set('white', 0.35, 0); Bd.box(m, 0.92, 0.15, 0.15, x + 0.5, yw, z, c);
      }
    }
    // starting blocks at one end, lane numbers implied by the blocks' white tops
    for (let k = 0; k < nL; k++) { const z = -ww + (k + 0.5) * lw; Bf.set('white', 0.5, 0.05); Bf.box(m, 0.55, 0.72, 0.5, -wl - 0.45, P.y, z, white, { top: C(0xdfe6ea) }); Bf.beam(m, [-wl - 0.75, P.y + 0.72, z - 0.22], [-wl - 0.75, P.y + 0.72, z + 0.22], 0.05, C(0x9aa0a6)); }
    // backstroke flags: a line of little pennants across the basin 5 m from each end, hung from a cord between two posts
    for (const sx of [-1, 1]) {
      const x = sx * (wl - 5); Bf.set('white', 0.5, 0.05); for (const sz of [-1, 1]) Bf.beam(m, [x, P.y, sz * (ww + 0.6)], [x, P.y + 1.95, sz * (ww + 0.6)], 0.07, white);
      Bf.beam(m, [x, P.y + 1.88, -ww - 0.6], [x, P.y + 1.88, ww + 0.6], 0.025, white);
      for (let z = -ww; z < ww - 0.4; z += 0.6) { const q = Math.floor((z + ww) / 0.6) % 3; const c = q === 0 ? red : q === 1 ? white : blue; Bf.set('white', 0.8, 0); const a = Env.xf(m, x, P.y + 1.89, z), b = Env.xf(m, x, P.y + 1.89, z + 0.5), c2 = Env.xf(m, x, P.y + 1.55, z + 0.25); Bf.tri(a, b, c2, c); Bf.tri(b, a, c2, c); }
    }
    W.add(Bd, 'detail'); W.add(Bf, 'fine'); E.stats.mlm.poolLanes = nL;
  };

  // ================================================================ the outer harbour: cruise ship on the Digue, superyachts at anchor in the bay
  // the Digue: the long thin strip of the coastline reaching out NE from the Rocher (its outer face looks at the open sea)
  function findDigue(E) {
    const coast = (E.data.coast || [])[0]; if (!coast || !E.seaPoly) return null; const dbg = E.stats.mlm.dg = [coast.length, 0, 0, 0];
    let best = null;
    for (let i = 0; i + 1 < coast.length; i++) {
      const a = coast[i], b = coast[i + 1]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 250 || l > 500) continue;
      dbg[1]++; if (E.dcAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) < 150) continue; dbg[2]++;
      const tx = (b[0] - a[0]) / l, tz = (b[1] - a[1]) / l; let nx = -tz, nz = tx; const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      // the sea side: 30 m out must be open sea and outside every harbour basin
      const inHarb = (x, z) => (E.waterPolys || []).some(w => w !== E.seaPoly && Math.abs(polyArea(w)) > 4000 && U.pointInPoly(x, z, w));
      const seaAt = (x, z) => U.pointInPoly(x, z, E.seaPoly) && !inHarb(x, z) && E.sc.gridHeight(x, z) < E.seaY + 0.8;
      let side = 0; for (const sd of [1, -1]) { if ([4, 12, 30].every(d => seaAt(mx + nx * sd * d, mz + nz * sd * d))) { side = sd; break; } }
      if (!side) continue; dbg[3]++; nx *= side; nz *= side;
      // a thin breakwater: the harbour basin lies just behind it (within ~50 m on the other side)
      const hd = Math.min(...(E.waterPolys || []).filter(w => w !== E.seaPoly && Math.abs(polyArea(w)) > 4000).map(w => polyD(mx, mz, w)));
      if (!(hd < 50)) continue;
      if (!best || l > best.l) best = { a, b, l, tx, tz, nx, nz, mx, mz };
    }
    return best;
  }

  // a cruise ship: dark-blue hull with a white superstructure of balcony decks, the bridge with its wings forward, a funnel aft.
  // Local frame: +x to the bow, y up from the waterline, z across.
  function cruiseShip(B, Bd, m, o) {
    const X = (x, y, z) => Env.xf(m, x, y, z); const Lh = o.L, Bh = o.B; const hl = Lh / 2;
    const O = X(0, 0, 0); const Dw = (x, y, z) => { const p = X(x, y, z); return [p[0] - O[0], p[1] - O[1], p[2] - O[2]]; }; const UP = [0, 1, 0];
    const hullC = C(o.hull), white = C(0xf4f5f3), boot = C(0x8a1f22), deckC = C(0xc9cdd0), glass = C(0x1d2a36), funC = C(o.funnel);
    // hull half width along the length (u 0 stern .. 1 bow), the bow's stem raked
    const w = (u) => Bh / 2 * (u < 0.62 ? 1 : Math.pow(Math.max(0, Math.cos((u - 0.62) / 0.38 * Math.PI / 2)), 0.7)) + 0.3;
    const NS = 16, us = []; for (let k = 0; k <= NS; k++) us.push(k / NS);
    const yH = o.hullH, yB = -1.5;
    // hull sides: boot top band, the dark hull with a porthole band, a white sheer strip
    for (let k = 0; k < NS; k++) {
      const u0 = us[k], u1 = us[k + 1]; const x0 = -hl + u0 * Lh, x1 = -hl + u1 * Lh; const rk0 = u0 > 0.9 ? (u0 - 0.9) * 40 : 0, rk1 = u1 > 0.9 ? (u1 - 0.9) * 40 : 0;
      for (const sd of [-1, 1]) {
        const P = (x, y, z) => X(x, y, sd * z);
        const q = (ya, yb, c, reg, va, vb) => {
          const a = P(x0 - rk0 * (1 - ya / yH), ya, w(u0)), b = P(x1 - rk1 * (1 - ya / yH), ya, w(u1)), c2 = P(x1 - rk1 * (1 - yb / yH) + 0.0, yb, w(u1) * (yb > yH * 0.6 ? 1.02 : 1)), d = P(x0 - rk0 * (1 - yb / yH), yb, w(u0) * (yb > yH * 0.6 ? 1.02 : 1));
          B.set(reg || 'white', reg ? 0.4 : 0.35, 0.05); const uv = reg ? [x0 / 6, va, x1 / 6, va, x1 / 6, vb, x0 / 6, vb] : null;
          fq(B, a, b, c2, d, c, uv, Dw(0, 0, sd));
        };
        q(yB, 0.6, boot); q(0.6, yH - 3.2, hullC, o.porthole ? 'mlmPorthole' : null, 0, 1); q(yH - 3.2, yH, hullC);
      }
    }
    // the bow's flat deck and the stern transom
    B.set('white', 0.6, 0);
    for (let k = 0; k < NS; k++) { const u0 = us[k], u1 = us[k + 1]; const x0 = -hl + u0 * Lh, x1 = -hl + u1 * Lh; const rk0 = u0 > 0.9 ? (u0 - 0.9) * 40 : 0, rk1 = u1 > 0.9 ? (u1 - 0.9) * 40 : 0; fq(B, X(x0, yH, -w(u0)), X(x0, yH, w(u0)), X(x1 - rk1, yH, w(u1)), X(x1 - rk1, yH, -w(u1)), deckC, null, UP); }
    fq(B, X(-hl, yB, w(0)), X(-hl, yB, -w(0)), X(-hl, yH, -w(0)), X(-hl, yH, w(0)), hullC, null, Dw(-1, 0, 0));
    // superstructure: two blocks of balcony decks (the lower one full width, the upper one set in), rounded forward face
    const block = (xa, xb, hw, y0, y1, reg, front) => {
      const ring = [[xa, -hw], [xb - hw * 0.5, -hw]]; for (let a = -Math.PI / 2 + 0.3; a < Math.PI / 2 - 0.29; a += 0.3) ring.push([xb - hw * 0.5 + Math.cos(a) * hw * 0.5, Math.sin(a) * hw]); ring.push([xb - hw * 0.5, hw]); ring.push([xa, hw]);
      let ua = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); const ub = ua + l / 4.5;
        const isFront = a[0] >= xb - hw * 0.5 - 0.01 && b[0] >= xb - hw * 0.5 - 0.01; const isBack = i === ring.length - 1;
        B.set(isBack ? 'white' : (isFront && front ? front : reg), 0.35, 0.05);
        const mx = (a[0] + b[0]) / 2 - (xa + xb) / 2, mz = (a[1] + b[1]) / 2;
        fq(B, X(a[0], y0, a[1]), X(b[0], y0, b[1]), X(b[0], y1, b[1]), X(a[0], y1, a[1]), white, isBack ? null : [ua, 0, ub, 0, ub, (y1 - y0) / 3, ua, (y1 - y0) / 3], Dw(mx, 0, mz)); ua = ub;
      }
      B.set('white', 0.7, 0); for (let i = 1; i + 1 < ring.length; i++) ft(B, X(ring[0][0], y1, ring[0][1]), X(ring[i + 1][0], y1, ring[i + 1][1]), X(ring[i][0], y1, ring[i][1]), deckC, UP);
      return ring;
    };
    const nLo = o.decks[0], nHi = o.decks[1]; const y1 = yH + nLo * 3, y2 = y1 + nHi * 3;
    block(-hl + 8, hl - Lh * 0.17, Bh / 2 - 0.4, yH, y1, 'mlmCabins', 'mlmCabins');
    block(-hl + 22, hl - Lh * 0.24, Bh / 2 - 2.2, y1, y2, 'mlmCabins', 'mlmBridge');
    // the bridge wings either side at the front of the upper block
    B.set('white', 0.4, 0.05); const xbw = hl - Lh * 0.24 - Bh * 0.25; B.box(m, 6, 2.6, Bh + 1.2, xbw, y2 - 3, 0, white);
    B.set('mlmBridge', 0.2, 0.3); fq(B, X(xbw + 3.01, y2 - 2.6, -Bh / 2 - 0.6), X(xbw + 3.01, y2 - 2.6, Bh / 2 + 0.6), X(xbw + 3.01, y2 - 0.6, Bh / 2 + 0.6), X(xbw + 3.01, y2 - 0.6, -Bh / 2 - 0.6), white, [0, 0, 8, 0, 8, 1, 0, 1], Dw(1, 0, 0));
    // the sun deck: a glass windbreak, the pool, the funnel aft, the mast over the bridge
    B.set('white', 0.15, 0.4); const fx = -hl + Lh * 0.22;
    for (const sd of [-1, 1]) for (const s2 of [-1, 1]) fq(B, X(-hl + 26, y2, sd * (Bh / 2 - 2.6)), X(hl - Lh * 0.3, y2, sd * (Bh / 2 - 2.6)), X(hl - Lh * 0.3, y2 + 1.3, sd * (Bh / 2 - 2.6)), X(-hl + 26, y2 + 1.3, sd * (Bh / 2 - 2.6)), C(0x7d96a8), null, Dw(0, 0, s2));
    B.set('white', 0.08, 0.1); B.box(m, 14, 0.05, 7, fx + 30, y2, 0, C(0x2fa9c8));
    B.set('white', 0.45, 0.1);
    const fr = [[-9, -4.2], [8, -3.4], [10, 0], [8, 3.4], [-9, 4.2]]; const fy0 = y2, fy1 = y2 + 9;
    for (let i = 0; i < fr.length; i++) { const a = fr[i], b = fr[(i + 1) % fr.length]; fq(B, X(fx + a[0], fy0, a[1]), X(fx + b[0], fy0, b[1]), X(fx + b[0] - 1.2, fy1, b[1] * 0.92), X(fx + a[0] - 1.2, fy1, a[1] * 0.92), funC, null, Dw((a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2)); }
    for (let i = 1; i + 1 < fr.length; i++) ft(B, X(fx + fr[0][0] - 1.2, fy1, fr[0][1] * 0.92), X(fx + fr[i + 1][0] - 1.2, fy1, fr[i + 1][1] * 0.92), X(fx + fr[i][0] - 1.2, fy1, fr[i][1] * 0.92), C(0x15171a), UP);
    B.beam(m, [xbw - 4, y2, 0], [xbw - 4.6, y2 + 11, 0], 0.6, white);
    // detail (near only): lifeboats along the lower block's top edge, the white rail lines along every deck
    if (Bd) {
      Bd.set('white', 0.5, 0.05); const lb = C(0xf28c1a);
      for (const sd of [-1, 1]) for (let x = -hl + 30; x < hl - Lh * 0.32; x += 13) { Bd.box(m, 10, 2.6, 3.4, x, yH + 3 * 2 + 0.3, sd * (Bh / 2 + 0.9), lb, { top: white }); Bd.beam(m, [x - 4, yH + 3 * 3.2, sd * (Bh / 2 - 0.5)], [x - 4, yH + 3 * 3.2, sd * (Bh / 2 + 1.6)], 0.25, white); Bd.beam(m, [x + 4, yH + 3 * 3.2, sd * (Bh / 2 - 0.5)], [x + 4, yH + 3 * 3.2, sd * (Bh / 2 + 1.6)], 0.25, white); }
    }
    return { y2 };
  }
  const SK = () => EI.StreetKit;

  // atlas regions: balcony cabin rows (3 m deck x 4.5 m cabin per tile), the bridge's dark window band, a porthole row
  function regions() {
    const A = SK().Atlas;
    A.region('mlmCabins', 64, 64, (x, w, h) => {
      x.fillStyle = '#f2f3f1'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#26323e'; x.fillRect(3, 10, w - 6, 34);           // balcony glass doors
      x.fillStyle = 'rgba(160,190,210,0.45)'; x.fillRect(3, 10, w - 6, 6);
      x.fillStyle = '#d7dbdd'; x.fillRect(0, 40, w, 4);                 // the balcony slab edge
      x.fillStyle = 'rgba(110,130,150,0.55)'; x.fillRect(0, 44, w, 13);  // glass balustrade
      x.fillStyle = '#ffffff'; x.fillRect(0, 44, w, 2); x.fillRect(0, 57, w, 7); x.fillRect(0, 0, 3, 64); x.fillRect(w - 3, 0, 3, 64);
    }, (x, w, h) => { x.fillStyle = 'rgb(128,128,128)'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgb(96,96,96)'; x.fillRect(3, 10, w - 6, 34); x.fillStyle = 'rgb(160,160,160)'; x.fillRect(0, 40, w, 4); },
    (x, w, h) => { x.fillStyle = 'rgb(128,128,128)'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgb(30,30,30)'; x.fillRect(3, 10, w - 6, 34); x.fillRect(0, 44, w, 13); }, 'uv');
    A.region('mlmBridge', 64, 32, (x, w, h) => { x.fillStyle = '#f2f3f1'; x.fillRect(0, 0, w, h); x.fillStyle = '#141c24'; x.fillRect(0, 6, w, 20); x.fillStyle = 'rgba(140,170,190,0.35)'; x.fillRect(0, 6, w, 5); x.fillStyle = '#e6e8e8'; for (let k = 0; k < w; k += 16) x.fillRect(k, 6, 2, 20); },
      null, (x, w, h) => { x.fillStyle = 'rgb(128,128,128)'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgb(25,25,25)'; x.fillRect(0, 6, w, 20); }, 'uv');
    A.region('mlmPorthole', 64, 32, (x, w, h) => { x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(10,14,20,0.85)'; for (let k = 0; k < 4; k++) { x.beginPath(); x.arc(8 + k * 16, h * 0.62, 3.2, 0, 7); x.fill(); } },
      null, null, 'uv');
  }

  L.outerHarbour = function (E) {
    const sc = E.sc, SKx = SK(); if (!E.seaPoly || E.seaY == null) return; const seaY = E.seaY;
    regions();
    const W = SKx.world(sc); const Bm = new SKx.Batch(), Bd = new SKx.Batch(); const st = E.stats.mlm;
    // ---- the cruise ship along the outside of the Digue
    const dg = findDigue(E); const keep = [];
    if (dg) {
      const Lh = Math.min(240, dg.l * 0.7), Bh = 30; const off = Bh / 2 + 4;
      const cx = dg.mx + dg.nx * off - dg.tx * dg.l * 0.05, cz = dg.mz + dg.nz * off - dg.tz * dg.l * 0.05;
      // bow towards the open end of the breakwater (away from the Rocher: the end further from the circuit's harbour)
      let tx = dg.tx, tz = dg.tz; if (E.dcAt(dg.b[0], dg.b[1]) < E.dcAt(dg.a[0], dg.a[1])) { tx = -tx; tz = -tz; }
      const m = Env.frame(cx, seaY, cz, tx, tz, -tz, tx);
      cruiseShip(Bm, Bd, m, { L: Lh, B: Bh, hullH: 13, decks: [6, 4], hull: 0x1c2638, funnel: 0x23262a, porthole: true });
      keep.push({ x: cx, z: cz, r: Lh / 2 + 25 }); L.debug.cruise = [cx, cz, tx, tz, Lh, Bh]; st.cruise = [Math.round(Lh), Math.round(cx), Math.round(cz)];
    }
    // ---- superyachts swinging at anchor in the bay (race week: several dozen off the harbour mouth and Larvotto)
    const harb = (E.waterPolys || []).filter(w => w !== E.seaPoly && Math.abs(polyArea(w)) > 4000);
    const ST2 = EI.EnvStreet; let nA = 0; const pts = [];
    if (ST2 && ST2.yachtKit) {
      // the kit writes every boat twice (near detail + far hull): only the far hulls are kept, the near writes go nowhere
      const dummy = new SKx.Batch(); dummy._grow = () => {}; dummy._v = () => {}; const dl = new SKx.Lines(), dl2 = new SKx.Lines(); dl.seg = dl2.seg = () => {}; const refl = [];
      const K = ST2.yachtKit(dummy, Bm, dl, dl2, refl); const rng = U.rng(1929);
      const rej = st.rej = [0, 0, 0, 0, 0];
      for (let k = 0; k < 2400 && nA < 34; k++) {
        const x = 520 + rng() * 1100, z = -720 + rng() * 1400;
        // (the street pass anchors its own few inside 300..1000 x 150..800: that box is left to it)
        if (x < 1030 && z > 120) { rej[0]++; continue; }
        if (!U.pointInPoly(x, z, E.seaPoly) || harb.some(w => U.pointInPoly(x, z, w))) { rej[0]++; continue; }
        if (E.dcAt(x, z) < 230) { rej[1]++; continue; } if (harb.some(w => polyD(x, z, w) < 55)) { rej[2]++; continue; }
        if ([[0, 0], [40, 0], [-40, 0], [0, 40], [0, -40]].some(q => sc.gridHeight(x + q[0], z + q[1]) > seaY + 0.8)) { rej[3]++; continue; }
        if (keep.some(q => Math.hypot(q.x - x, q.z - z) < q.r) || pts.some(p => Math.hypot(p[0] - x, p[1] - z) < 70)) { rej[4]++; continue; }
        const Ly = 36 + Math.pow(rng(), 1.6) * 60; const yaw = 0.55 + (rng() - 0.5) * 0.5;
        pts.push([x, z]); K.superyacht(new THREE.Matrix4().makeRotationY(yaw).setPosition(x, seaY, z), Ly, rng, rng() < 0.5); nA++;
      }
    }
    st.anchored = nA; L.debug.anchored = pts;
    W.add(Bm, 'main'); W.add(Bd, 'detail');
    st.harbourTris = Math.round((Bm.count + Bd.count) / 3);
  };
})();
