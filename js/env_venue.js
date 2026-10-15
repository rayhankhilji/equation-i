// Equation I - the venue: grandstands with crowd round the whole lap, hospitality marquees, the BRDC clubhouse, car parks
// full of cars, camp sites, the Dadford Road industrial estate, access roads, perimeter fence with gates, light towers and
// the Stowe inner circuit. Layout first (occupancy grid), then a handful of merged / instanced meshes.
window.EI = window.EI || {};
(function () {
  const U = EI.U, Env = EI.Env;
  const V = {};
  const C = Env.C;

  // ================================================================ layout
  V.layout = function (E) {
    const t = E.t, sc = E.sc, OCC = Env.OCC, D = t.data.scenery;
    // ---- existing map features
    for (const w of D.water) if (w.length >= 3) E.markPoly(w, OCC.WATER, 2);
    for (const b of D.buildings) if (b.p.length >= 3 && Math.abs(U.polyArea(b.p)) >= 30) E.markPoly(b.p, OCC.BUILT, 3);
    for (const g of D.grandstands) if (g.p.length >= 3) E.markPoly(g.p, OCC.BUILT, 3);
    for (const w of D.woods.concat(E.data.woods || [])) E.markPoly(w, OCC.WOOD);
    // the Wing + paddock behind it
    const pit = t.data.pit;
    if (pit && pit.length > 3) {
      const a = pit[Math.floor(pit.length * 0.2)], b = pit[Math.floor(pit.length * 0.8)]; const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      let dx = b[0] - a[0], dz = b[1] - a[1]; const len = Math.hypot(dx, dz); dx /= len; dz /= len; const pr = t.project(mid[0], mid[1], null); const side = pr.lat > 0 ? 1 : -1;
      const nx = t.nx[pr.i] * side, nz = t.nz[pr.i] * side; const L = Math.min(len * 0.9, 320);
      E.paddock = E.markRect(mid[0] + nx * 52, mid[1] + nz * 52, dx, dz, L / 2 + 14, 54, OCC.BUILT);
      // keep the pit lane itself and its entry / exit clear of everything
      E.markLine(pit, 12, OCC.BUILT);
      // pit.js builds the lane, garages and pit wall parallel to the start / finish straight (about wall + 3 .. wall + 38 m):
      // that corridor stays empty
      for (let ds = -215; ds <= 225; ds += 3) { const i = t.idxAtS(t.sf + ds); const w = E.wallCap(i, side); for (let d = w + 0.5; d <= w + 40; d += 2) E.mark(t.x[i] + t.nx[i] * side * d, t.z[i] + t.nz[i] * side * d, OCC.BUILT); }
      E.pitSide = side;
    }
    // ---- roads: perimeter service road (outside), infield service road, public / gate roads from the data
    E.roads = [];
    const lines = Env.contours(E, E.dF, 118);
    let perim = null, best = 0;
    for (const l of lines) { if (!l.closed) continue; const L = Env.polyLength(l, true); let out = 0; for (let i = 0; i < l.length; i += 7) if (!E.inside(l[i][0], l[i][1])) out++; if (out > l.length / 14 && L > best) { best = L; perim = l; } }
    if (perim) { perim = Env.smoothLine(perim, true, 2, 8); E.perimeter = perim; E.roads.push({ name: 'perimeter', w: 6.5, kind: 'estate', line: perim.concat([perim[0]]), closed: true }); }
    const inner = Env.contours(E, E.dF, 46); let inl = null; best = 0;
    for (const l of inner) { const L = Env.polyLength(l, l.closed); let ins = 0; for (let i = 0; i < l.length; i += 5) if (E.inside(l[i][0], l[i][1])) ins++; if (ins > l.length / 5 * 0.9 && L > best) { best = L; inl = l; } }
    if (inl) {
      const sm = Env.smoothLine(inl, inl.closed, 2, 8); if (inl.closed) sm.push(sm[0]);
      // split where it would run through the paddock / buildings
      let cur = [];
      for (const p of sm) { if (E.occAt(p[0], p[1]) & (OCC.BUILT | OCC.WATER)) { if (cur.length > 6) E.roads.push({ name: 'infield', w: 5.5, kind: 'estate', line: cur }); cur = []; } else cur.push(p); }
      if (cur.length > 6) E.roads.push({ name: 'infield', w: 5.5, kind: 'estate', line: cur });
    }
    for (const r of E.data.roads || []) {
      let pts = r.pts.map(p => p.slice());
      if (r.snap && perim) { const last = pts[pts.length - 1]; let bd = Infinity, bp = null; for (const p of perim) { const d = (p[0] - last[0]) ** 2 + (p[1] - last[1]) ** 2; if (d < bd) { bd = d; bp = p; } } if (bp) pts.push([bp[0], bp[1]]); }
      const line = Env.smoothLine(pts, false, 2, 10);
      E.roads.push({ name: r.name, w: r.w, kind: r.kind, line });
    }
    // industrial estate access
    const ind = E.data.industrial; if (ind) E.roads.push({ name: 'estate road', w: 7, kind: 'estate', line: Env.smoothLine([[(ind.x0 + ind.x1) / 2, ind.z0 + 10], [(ind.x0 + ind.x1) / 2, (ind.z0 + ind.z1) / 2], [ind.x1 + 75, (ind.z0 + ind.z1) / 2 + 20]], false, 1, 10) });
    for (const r of E.roads) E.markLine(r.line, r.w / 2 + 1.5, OCC.ROAD);
    // ---- Stowe inner circuit
    if (E.data.stowe) {
      const pts = E.data.stowe.map(p => new THREE.Vector3(p[0], 0, p[1])); const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal'); const sp = curve.getSpacedPoints(Math.round(curve.getLength() / 4));
      let okc = true; for (const p of sp) { if (E.fAt(p.x, p.z) < 16 || (E.occAt(p.x, p.z) & (OCC.BUILT | OCC.WATER))) { okc = false; break; } }
      if (okc) { E.stowe = sp.map(p => [p.x, p.z]); E.markLine(E.stowe, 9, OCC.ROAD); }
    }
    // ---- grandstand runs
    V.layoutStands(E);
    // ---- industrial estate sheds
    E.sheds = [];
    if (ind) {
      const mx = (ind.x0 + ind.x1) / 2; const rng = U.rng(66);
      for (const sideX of [-1, 1]) {
        let z = ind.z0 + 12;
        while (z < ind.z1 - 30) {
          const d = 34 + rng() * 34; const w = (sideX < 0 ? mx - 10 - ind.x0 : ind.x1 - mx - 10) * (0.75 + rng() * 0.2); if (z + d > ind.z1 - 6) break;
          const cx = sideX < 0 ? mx - 10 - w / 2 : mx + 10 + w / 2, cz = z + d / 2;
          if (E.rectFree(cx, cz, 1, 0, w / 2, d / 2, OCC.ROAD | OCC.BUILT | OCC.WATER) > 0.9) { E.sheds.push({ cx, cz, w, d, h: 8 + rng() * 5, door: sideX < 0 ? 1 : -1 }); E.markRect(cx, cz, 1, 0, w / 2 + 4, d / 2 + 4, OCC.BUILT); }
          z += d + 10 + rng() * 10;
        }
      }
      E.markRect(mx, (ind.z0 + ind.z1) / 2, 1, 0, (ind.x1 - ind.x0) / 2, (ind.z1 - ind.z0) / 2, OCC.KEEP);
    }
    // ---- hospitality marquees and the BRDC clubhouse
    E.hosp = []; const rngH = U.rng(808);
    const trackPt = (s, side, off) => { const i = t.idxAtS(s); const d = E.wallCap(i, side) + off; return { x: t.x[i] + t.nx[i] * side * d, z: t.z[i] + t.nz[i] * side * d, tx: t.tx[i], tz: t.tz[i], nx: t.nx[i] * side, nz: t.nz[i] * side, i }; };
    if (E.data.brdc) {
      const [s, side, off] = E.data.brdc;
      for (const dd of [0, 12, 24, -10, 36]) { const p = trackPt(s, side, off + dd); const cx = p.x + p.nx * 12, cz = p.z + p.nz * 12; if (E.rectFree(cx, cz, p.tx, p.tz, 34, 14, OCC.ROAD | OCC.BUILT | OCC.WATER) < 0.95) continue; E.brdc = { cx, cz, tx: p.tx, tz: p.tz, nx: p.nx, nz: p.nz }; E.markRect(cx, cz, p.tx, p.tz, 36, 16, OCC.BUILT); break; }
    }
    for (const [s, side, off, units] of E.data.hospitality || []) {
      let placed = 0;
      for (let u = 0; u < units * 3 && placed < units; u++) {
        const ds = (u - units * 1.5) * 26 + (rngH() - 0.5) * 6; const p = trackPt(s + ds, side, off + (u % 3) * 16); const L = 22 + rngH() * 18, Dd = 12 + rngH() * 6;
        const cx = p.x + p.nx * Dd / 2, cz = p.z + p.nz * Dd / 2;
        if (E.fAt(cx, cz) < 20 || E.rectFree(cx, cz, p.tx, p.tz, L / 2 + 2, Dd / 2 + 2, OCC.ROAD | OCC.BUILT | OCC.WATER | OCC.PARK) < 0.97) continue;
        E.hosp.push({ cx, cz, tx: p.tx, tz: p.tz, nx: p.nx, nz: p.nz, L, D: Dd, kind: rngH() < 0.3 ? 'deck' : 'marquee' }); E.markRect(cx, cz, p.tx, p.tz, L / 2 + 3, Dd / 2 + 3, OCC.BUILT); placed++;
      }
    }
    // ---- car parks (rows of cars) and camp sites in free grass inside the estate and in the fields next to it
    E.parks = []; E.camps = []; const rngP = U.rng(5150);
    const tryRect = (cx, cz, ax, az, hl, hd, list, maxF) => {
      if (Math.abs(cx) > 1700 || Math.abs(cz) > 1700) return false; const f = E.fAt(cx, cz); if (f < 60 || f > maxF) return false;
      if (E.rectFree(cx, cz, ax, az, hl + 4, hd + 4, OCC.ROAD | OCC.BUILT | OCC.WATER | OCC.WOOD | OCC.PARK | OCC.KEEP) < 0.96) return false;
      // all corners well clear of the track
      for (const [a, b] of [[-hl, -hd], [hl, -hd], [hl, hd], [-hl, hd]]) if (E.fAt(cx + ax * a - az * b, cz + az * a + ax * b) < 45) return false;
      list.push({ cx, cz, ax, az, hl, hd }); E.markRect(cx, cz, ax, az, hl + 3, hd + 3, OCC.PARK); return true;
    };
    for (const [x, z] of E.data.campsites || []) {
      for (let k = 0; k < 10; k++) { const a = rngP() * Math.PI, ox = (rngP() - 0.5) * 90 * (k / 3), oz = (rngP() - 0.5) * 90 * (k / 3); if (tryRect(x + ox, z + oz, Math.cos(a), Math.sin(a), 55 + rngP() * 20, 35 + rngP() * 12, E.camps, 900)) break; }
    }
    const cand = [];
    for (let s = 0; s < t.length; s += 38) for (const side of [1, -1]) for (const off of side > 0 ? [130, 160, 205, 245, 290, 340] : [70, 100, 135, 170]) cand.push([s, side, off, rngP()]);
    cand.sort((a, b) => a[3] - b[3]);
    for (const [s, side, off] of cand) {
      if (E.parks.length >= 18) break; const p = trackPt(s, side, off); const hl = 45 + rngP() * 30, hd = 24 + rngP() * 14;
      tryRect(p.x + p.nx * hd, p.z + p.nz * hd, p.tx, p.tz, hl, hd, E.parks, 420);
    }
    // ---- perimeter fence (venue boundary) with gaps + gates where roads cross it
    E.fence = []; E.gates = [];
    const fl = Env.contours(E, E.dF, E.VENUE_F); let fline = null; best = 0;
    for (const l of fl) { if (!l.closed) continue; const L = Env.polyLength(l, true); if (L > best) { best = L; fline = l; } }
    if (fline) {
      const pts = Env.smoothLine(fline, true, 2, 3.2); let cur = []; let gap = 0;
      for (let i = 0; i <= pts.length; i++) {
        const p = pts[i % pts.length]; const blocked = (E.occAt(p[0], p[1]) & (OCC.ROAD | OCC.BUILT | OCC.WATER | OCC.PARK)) || Math.abs(p[0]) > 1750 || Math.abs(p[1]) > 1750;
        if (blocked) { if (cur.length > 1) E.fence.push(cur); cur = []; gap++; if (E.occAt(p[0], p[1]) & OCC.ROAD && gap === 1) { const q = pts[(i + 1) % pts.length]; E.gates.push({ x: p[0], z: p[1], tx: q[0] - p[0], tz: q[1] - p[1] }); } }
        else { gap = 0; cur.push(p); }
      }
      if (cur.length > 1) E.fence.push(cur);
      // a tree line just outside the fence (every third stretch)
      for (let i = 0; i + 12 < pts.length; i += 12) if (Env.hash2(i, 3, 5) < 0.45) { const a = pts[i], b = pts[i + 12]; const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; const dl = Math.hypot(b[0] - a[0], b[1] - a[1]); let nx = -(b[1] - a[1]) / dl, nz = (b[0] - a[0]) / dl; if (E.fAt(mx + nx * 10, mz + nz * 10) < E.fAt(mx, mz)) { nx = -nx; nz = -nz; } E.treeLines.push([a[0] + nx * 9, a[1] + nz * 9, b[0] + nx * 9, b[1] + nz * 9]); }
    }
    E.stats.venue = { roads: E.roads.length, parks: E.parks.length, camps: E.camps.length, hosp: E.hosp.length, sheds: E.sheds.length, gates: E.gates.length, fenceRuns: E.fence.length, standBlocks: E.blocks.length };
  };

  // ---- grandstand runs -> straight blocks following the lap
  V.layoutStands = function (E) {
    const t = E.t, OCC = Env.OCC; E.blocks = []; E.treeLines = E.treeLines || []; E.standPolys = [];
    const spots = (EI.Infra && EI.Infra.SPOTS) || []; const kk = t.smooth(t.k, 10);
    const near = (s, side) => { for (const [ss, sd, half] of spots) { if (sd && sd !== side) continue; let d = Math.abs(U.mod(s - ss, t.length)); d = Math.min(d, t.length - d); if (d < half) return true; } return false; };
    for (const run of E.data.standRuns || []) {
      const [s0, s1, side, gap, rows, roof, seat] = run; let s = s0; let first = true; const runBlocks = [];
      while (s < s1 - 6) {
        const i0 = t.idxAtS(s); const R = 1 / (Math.abs(kk[i0]) + 1e-5); const step = U.clamp(R * 0.3, 10, 26); const sb = Math.min(s1, s + step);
        const ia = t.idxAtS(s), ib = t.idxAtS(sb); let wmax = 0; for (let i = ia; i !== (ib + 1) % t.n; i = (i + 1) % t.n) wmax = Math.max(wmax, E.wallCap(i, side));
        const d = wmax + gap; const inner = (kk[i0] > 0) === (side > 0); if (inner && d > R * 0.8) { s = sb; continue; }
        const A = [t.x[ia] + t.nx[ia] * side * d, t.z[ia] + t.nz[ia] * side * d], B = [t.x[ib] + t.nx[ib] * side * d, t.z[ib] + t.nz[ib] * side * d];
        let ax = B[0] - A[0], az = B[1] - A[1]; const L = Math.hypot(ax, az); ax /= L; az /= L; let nx = -az, nz = ax; const im = t.idxAtS((s + sb) / 2);
        if (nx * t.nx[im] * side + nz * t.nz[im] * side < 0) { nx = -nx; nz = -nz; }
        const len = L - 0.5; const depth = 0.4 + rows * 0.82 + 0.6; const cx = (A[0] + B[0]) / 2, cz = (A[1] + B[1]) / 2;
        const ok = len > 6 && !near((s + sb) / 2, side) && E.rectFree(cx + nx * depth / 2, cz + nz * depth / 2, ax, az, len / 2, depth / 2 + (roof ? 1 : 0), OCC.BUILT | OCC.WATER | OCC.ROAD) > 0.9 && E.fsAt(cx + nx * depth, cz + nz * depth) > 4 && E.fAt(cx + nx * depth, cz + nz * depth) > -60;
        if (ok) {
          const blk = { cx, cz, ax, az, nx, nz, len, rows, roof, seat, y: t.y[im] - 0.03, s: (s + sb) / 2, first: false, last: false };
          if (first || !runBlocks.length) blk.first = true; first = false;
          runBlocks.push(blk); E.blocks.push(blk); E.standPolys.push(E.markRect(cx + nx * depth / 2, cz + nz * depth / 2, ax, az, len / 2, depth / 2, OCC.BUILT));
          E.treeLines.push([A[0] + nx * (depth + 10), A[1] + nz * (depth + 10), B[0] + nx * (depth + 10), B[1] + nz * (depth + 10)]);
        } else if (runBlocks.length) { runBlocks[runBlocks.length - 1].last = true; first = true; }
        s = sb;
      }
      if (runBlocks.length) runBlocks[runBlocks.length - 1].last = true;
    }
  };

  // ================================================================ field-map overlay (woods floor, roads, car parks, camp sites, yards)
  V.paint = function (E) {
    return (ctx, path) => {
      const OCC = Env.OCC;
      // woodland floor: dark, soft edge
      ctx.fillStyle = 'rgb(28,36,20)'; for (const w of E.allWoods || []) { path(w); ctx.fill(); }
      ctx.strokeStyle = 'rgba(28,36,20,0.6)'; ctx.lineWidth = 6; for (const w of E.allWoods || []) { path(w); ctx.stroke(); }
      // copses
      for (const [k, poly] of E.fieldPolys || []) { if (E.fType[k] !== 8) continue; const R = 45 + E.fTone[k] * 35; ctx.fillStyle = 'rgb(30,40,22)'; if (Math.max(Math.abs(E.seedX[k]), Math.abs(E.seedZ[k])) > Env.CARD_HALF) { path(poly); ctx.fill(); continue; } ctx.beginPath(); ctx.ellipse(E.seedX[k], E.seedZ[k], R * 1.25, R * 0.9, 0, 0, 6.283); ctx.fill(); }
      // car parks: worn grass with tyre-track aisles; camp sites: trampled grass
      for (const p of E.parks) {
        ctx.save(); ctx.translate(p.cx, p.cz); ctx.rotate(Math.atan2(p.az, p.ax)); ctx.fillStyle = 'rgba(112,108,72,0.55)'; ctx.fillRect(-p.hl - 3, -p.hd - 3, p.hl * 2 + 6, p.hd * 2 + 6);
        ctx.fillStyle = 'rgba(100,90,64,0.7)'; for (let b = -p.hd + 4.6 * 2 + 3.5; b < p.hd; b += 16.2) ctx.fillRect(-p.hl, b - 3.5, p.hl * 2, 7); ctx.restore();
      }
      for (const p of E.camps) { ctx.save(); ctx.translate(p.cx, p.cz); ctx.rotate(Math.atan2(p.az, p.ax)); ctx.fillStyle = 'rgba(100,104,64,0.5)'; ctx.fillRect(-p.hl, -p.hd, p.hl * 2, p.hd * 2); ctx.restore(); }
      // industrial yards (tarmac / concrete aprons round the sheds)
      for (const s of E.sheds) { ctx.fillStyle = 'rgb(128,128,122)'; ctx.fillRect(s.cx - s.w / 2 - 6, s.cz - s.d / 2 - 6, s.w + 12, s.d + 12); ctx.fillStyle = 'rgb(84,86,88)'; ctx.fillRect(s.cx + (s.door > 0 ? s.w / 2 : -s.w / 2 - 18), s.cz - s.d / 2, 18, s.d); }
      // hospitality / stand footprints get a trampled apron
      ctx.fillStyle = 'rgba(100,104,68,0.55)'; for (const h of E.hosp) { ctx.save(); ctx.translate(h.cx, h.cz); ctx.rotate(Math.atan2(h.tz, h.tx)); ctx.fillRect(-h.L / 2 - 5, -h.D / 2 - 5, h.L + 10, h.D + 10); ctx.restore(); }
      // roads (also drawn as geometry; the map copy keeps them readable in the distance and from the air)
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const r of E.roads) { ctx.strokeStyle = r.kind === 'public' ? 'rgb(70,72,76)' : 'rgb(86,88,90)'; ctx.lineWidth = r.w + 1.6; ctx.beginPath(); r.line.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); }
      if (E.stowe) { ctx.strokeStyle = 'rgb(92,92,96)'; ctx.lineWidth = 12; path(E.stowe); ctx.stroke(); }
      // worn footpaths from the gates towards the stands
      ctx.strokeStyle = 'rgba(110,100,72,0.45)'; ctx.lineWidth = 3; const rng = U.rng(17);
      for (const b of E.blocks) { if (rng() < 0.6) continue; const x0 = b.cx + b.nx * 20, z0 = b.cz + b.nz * 20; ctx.beginPath(); ctx.moveTo(x0, z0); ctx.quadraticCurveTo(x0 + b.nx * 40 + (rng() - 0.5) * 40, z0 + b.nz * 40 + (rng() - 0.5) * 40, x0 + b.nx * 90 + (rng() - 0.5) * 60, z0 + b.nz * 90 + (rng() - 0.5) * 60); ctx.stroke(); }
    };
  };

  // ================================================================ textures
  function roadTexture() {
    // three columns: public road (edge lines + dashed centre), estate road (plain), circuit (solid white edges)
    const [c, ctx] = Env.canvas(384, 512); const r = U.rng(12);
    ctx.fillStyle = '#3e3f42'; ctx.fillRect(0, 0, 384, 512);
    for (let i = 0; i < 9000; i++) { const v = 40 + r() * 50; ctx.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 3) + ',0.5)'; ctx.fillRect(r() * 384, r() * 512, 1.5, 1.5); }
    for (let i = 0; i < 30; i++) { ctx.fillStyle = 'rgba(30,30,32,0.35)'; ctx.fillRect(r() * 384, r() * 512, 10 + r() * 50, 6 + r() * 30); }
    ctx.fillStyle = '#e8e8e2'; ctx.fillRect(6, 0, 4, 512); ctx.fillRect(118, 0, 4, 512); for (let y = 0; y < 512; y += 128) ctx.fillRect(62, y, 4, 42);
    ctx.fillStyle = 'rgba(120,118,104,0.5)'; ctx.fillRect(128, 0, 5, 512); ctx.fillRect(251, 0, 5, 512);
    ctx.fillStyle = '#f0f0ea'; ctx.fillRect(258, 0, 7, 512); ctx.fillRect(375, 0, 7, 512); ctx.fillStyle = 'rgba(25,25,28,0.35)'; ctx.fillRect(300, 0, 40, 512);
    const t = Env.tex(c, true, 8); t.wrapS = THREE.ClampToEdgeWrapping; return t;
  }
  function crowdAtlas() {
    const [c, ctx] = Env.canvas(1024, 256); ctx.clearRect(0, 0, 1024, 256); const r = U.rng(4321);
    const shirts = ['#b8141c', '#d0702a', '#24467e', '#ededed', '#dcdcdc', '#161616', '#222428', '#3b404a', '#5c6370', '#8b8f98', '#c4c4c4', '#c81010', '#2b5ba8', '#0d5e52', '#b8962a', '#4a2f6b', '#f4f4f4', '#1b2a4a', '#6d1f1f', '#9aa7b8'];
    const skins = ['#f1c7a5', '#e0ac87', '#c68a62', '#8d5a3b', '#f5d3b8', '#d49a72'];
    const hairs = ['#2a1d14', '#4b3020', '#111', '#a07a4a', '#d9b46a', '#6b6b6b'];
    const hx = 155, vy = 116; // px per metre in a 1.65 x 1.1 m cell of 256 x 128
    for (let cell = 0; cell < 8; cell++) {
      const ox = (cell % 4) * 256, oy = Math.floor(cell / 4) * 128;
      for (let k = 0; k < 3; k++) {
        if (r() < 0.08) continue; const x = ox + 43 + k * 85 + (r() - 0.5) * 10; const stand = r() < 0.18; const base = oy + 128; const torsoH = (0.5 + r() * 0.08) * vy, torsoW = (0.36 + r() * 0.08) * hx; const top = base - (stand ? 0.62 : 0.45) * vy - torsoH;
        const shirt = shirts[Math.floor(r() * shirts.length)], skin = skins[Math.floor(r() * skins.length)];
        // torso with rounded shoulders
        ctx.fillStyle = shirt; ctx.beginPath(); ctx.moveTo(x - torsoW / 2, base); ctx.lineTo(x - torsoW / 2, top + 8); ctx.quadraticCurveTo(x - torsoW / 2, top, x - torsoW / 2 + 9, top); ctx.lineTo(x + torsoW / 2 - 9, top); ctx.quadraticCurveTo(x + torsoW / 2, top, x + torsoW / 2, top + 8); ctx.lineTo(x + torsoW / 2, base); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x + torsoW * 0.15, top + 4, torsoW * 0.35, base - top);
        // arms: down, one raised waving, or both up
        const pose = r(); ctx.strokeStyle = shirt; ctx.lineWidth = 9; ctx.lineCap = 'round';
        if (pose < 0.2) { for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + sd * torsoW / 2, top + 6); ctx.lineTo(x + sd * (torsoW / 2 + 8), top - 30); ctx.stroke(); ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(x + sd * (torsoW / 2 + 8), top - 34, 5, 0, 6.283); ctx.fill(); } }
        else if (pose < 0.32) { ctx.beginPath(); ctx.moveTo(x + torsoW / 2, top + 6); ctx.lineTo(x + torsoW / 2 + 14, top - 26); ctx.stroke(); const fc = shirts[Math.floor(r() * shirts.length)]; ctx.fillStyle = '#5a4a3a'; ctx.fillRect(x + torsoW / 2 + 12, top - 62, 3, 40); ctx.fillStyle = fc; ctx.fillRect(x + torsoW / 2 + 15, top - 62, 34, 22); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x + torsoW / 2 + 15, top - 54, 34, 5); }
        else { ctx.lineWidth = 8; for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + sd * (torsoW / 2 - 3), top + 8); ctx.lineTo(x + sd * (torsoW / 2 + 1), top + torsoH * 0.8); ctx.stroke(); } }
        // head, hair or cap, sunglasses now and then
        const hy = top - 0.13 * vy; ctx.fillStyle = skin; ctx.fillRect(x - 4, hy + 8, 8, 10); ctx.beginPath(); ctx.ellipse(x, hy, 0.1 * hx, 0.12 * vy, 0, 0, 6.283); ctx.fill();
        const hat = r(); if (hat < 0.3) { ctx.fillStyle = shirts[Math.floor(r() * shirts.length)]; ctx.beginPath(); ctx.ellipse(x, hy - 6, 0.105 * hx, 0.07 * vy, 0, Math.PI, 0); ctx.fill(); ctx.fillRect(x - 2, hy - 7, 0.15 * hx, 4); }
        else { ctx.fillStyle = hairs[Math.floor(r() * hairs.length)]; ctx.beginPath(); ctx.ellipse(x, hy - 4, 0.1 * hx, 0.09 * vy, 0, Math.PI, 0); ctx.fill(); }
        if (r() < 0.3) { ctx.fillStyle = '#111'; ctx.fillRect(x - 10, hy - 2, 20, 4); }
      }
    }
    return Env.cutout(c, { aniso: 4 });
  }
  function sponsorTexture() {
    const [c, ctx] = Env.canvas(2048, 128);
    const brands = [['EQUATION I', '#e10600', '#fff'], ['EIRELLI', '#ffd500', '#111'], ['SILVERSTONE', '#0b3d2e', '#fff'], ['DRS', '#1a73e8', '#fff'], ['KINETIK', '#0e0e0e', '#00e701'], ['EI', '#fff', '#e10600'], ['VECTOR', '#1434cb', '#fff'], ['APEX FUELS', '#f2f2f2', '#0c2b63']];
    brands.forEach((b, k) => { const x = k * 256; ctx.fillStyle = b[1]; ctx.fillRect(x, 0, 256, 128); ctx.fillStyle = b[2]; ctx.font = 'italic 900 ' + (b[0].length > 8 ? 36 : 48) + 'px Arial Black, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b[0], x + 128, 62); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 252, 0, 4, 128); });
    return Env.tex(c, true, 8);
  }
  function fenceTexture() {
    const [c, ctx] = Env.canvas(64, 64); ctx.clearRect(0, 0, 64, 64); ctx.strokeStyle = 'rgba(48,66,52,0.95)'; ctx.lineWidth = 1.6;
    for (let i = -64; i < 128; i += 8) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 64, 64); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i + 64, 0); ctx.lineTo(i, 64); ctx.stroke(); }
    ctx.fillStyle = 'rgba(40,56,44,1)'; ctx.fillRect(0, 0, 64, 3); ctx.fillRect(0, 61, 64, 3);
    return Env.cutout(c, { repeat: true });
  }

  // ================================================================ build
  V.build = function (E) {
    const sc = E.sc, t = E.t, T0 = performance.now(); const stats = E.stats;
    const B = new Env.Builder();     // stands, roofs, structures (vertex colours)
    const H = new Env.Builder();     // hospitality, buildings, sheds, gates, light towers
    const fronts = [], crowd = [], flags = [];
    const conc = C(0xd6d7d3), concDark = C(0xa9aaa6), clad = C(0x3c4654), white = C(0xeef0f2), steel = C(0x9aa0a6), dark = C(0x2a2d33), red = C(0xc8102e), glass = C(0x50657e), roofGrey = C(0xc9ccd0);
    // ---- grandstand blocks (added runs + the OSM stands)
    const blocks = E.blocks.slice();
    const pr = {};
    for (const st of t.data.scenery.grandstands) {
      const poly = st.p; if (poly.length < 3) continue; let cx = 0, cz = 0; for (const q of poly) { cx += q[0]; cz += q[1]; } cx /= poly.length; cz /= poly.length;
      t.project(cx, cz, null, pr); if (pr.dist < t.halfWidth + 8) continue; const i = pr.i, side = pr.lat > 0 ? 1 : -1; const tx = t.tx[i], tz = t.tz[i], nx = t.nx[i] * side, nz = t.nz[i] * side;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity; for (const q of poly) { const dx = q[0] - cx, dz = q[1] - cz; const a = dx * tx + dz * tz, b = dx * nx + dz * nz; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
      const len = a1 - a0, depth = Math.min(b1 - b0, 24); if (len < 10 || depth < 5) continue; const rows = U.clamp(Math.floor((depth - 1) / 0.82), 5, 22);
      const fx = cx + tx * (a0 + a1) / 2 + nx * b0, fz = cz + tz * (a0 + a1) / 2 + nz * b0;
      blocks.push({ cx: fx, cz: fz, ax: tx, az: tz, nx, nz, len, rows, roof: true, seat: [0x24418f, 0x8c1d24, 0x2b3a55][Math.floor(Math.abs(cx) % 3)], y: E.ground(cx, cz) - 0.4, first: true, last: true, osm: true });
    }
    const rng = U.rng(777); let seats = 0;
    for (const b of blocks) {
      const m = Env.frame(b.cx, b.y, b.cz, b.ax, b.az, b.nx, b.nz); const L = b.len, hl = L / 2, rows = b.rows;
      const seatC = C(b.seat), seatD = C(b.seat).multiplyScalar(0.55), rise = 0.42, tread = 0.82, y0 = 1.4, z0 = 0.4;
      const P = (x, y, z) => Env.xf(m, x, y, z);
      // front wall + sponsor board
      B.box(m, L, y0, 0.3, 0, 0, 0.15, conc);
      const strip = new THREE.PlaneGeometry(L, 1.0); strip.rotateY(Math.PI); const suv = strip.attributes.uv; const u0 = rng() * 8; for (let v = 0; v < suv.count; v++) suv.setXY(v, u0 + suv.getX(v) * L / 5, suv.getY(v)); strip.translate(0, 0.72, -0.02); strip.applyMatrix4(m); fronts.push(strip);
      // tiers: riser (dark seat backs) + tread (seat colour), aisles every ~14 m
      const aisles = []; for (let a = -hl + 7; a < hl - 4; a += 14) aisles.push(a);
      for (let r = 0; r < rows; r++) {
        const y = y0 + r * rise, za = z0 + r * tread, zb = za + tread;
        B.quad(P(-hl, y + rise, za), P(hl, y + rise, za), P(hl, y, za), P(-hl, y, za), seatD);
        B.quad(P(-hl, y + rise, za), P(-hl, y + rise, zb), P(hl, y + rise, zb), P(hl, y + rise, za), r % 2 ? seatC : C(b.seat).multiplyScalar(0.85));
        for (const a of aisles) B.quad(P(a - 0.6, y + rise + 0.01, za), P(a - 0.6, y + rise + 0.01, zb), P(a + 0.6, y + rise + 0.01, zb), P(a + 0.6, y + rise + 0.01, za), concDark);
        // crowd: quads of three seats
        for (let a = -hl + 0.9; a < hl - 0.8; a += 1.65) {
          let inAisle = false; for (const q of aisles) if (Math.abs(a - q) < 1.4) inAisle = true; if (inAisle || rng() < 0.1) continue;
          crowd.push([P(a, y + rise, za + 0.42), b.ax, b.az, b.nx, b.nz, Math.floor(rng() * 8), 0.78 + rng() * 0.3]); seats += 3;
        }
      }
      const yTop = y0 + rows * rise, zBack = z0 + rows * tread;
      // back wall (both faces), rail band, underside and end panels
      B.quad(P(hl, yTop + 1.2, zBack), P(-hl, yTop + 1.2, zBack), P(-hl, 0, zBack), P(hl, 0, zBack), clad);
      B.quad(P(-hl, yTop + 1.2, zBack - 0.02), P(hl, yTop + 1.2, zBack - 0.02), P(hl, yTop, zBack - 0.02), P(-hl, yTop, zBack - 0.02), concDark);
      B.quad(P(-hl, yTop + 0.9, zBack + 0.02), P(hl, yTop + 0.9, zBack + 0.02), P(hl, yTop + 1.25, zBack + 0.02), P(-hl, yTop + 1.25, zBack + 0.02), red);
      B.quad(P(hl, y0, z0), P(hl, yTop, zBack), P(-hl, yTop, zBack), P(-hl, y0, z0), concDark);
      for (const sx of [-hl, hl]) { const f = sx < 0 ? 1 : -1; const a1 = P(sx, 0, 0), a2 = P(sx, y0, 0), a3 = P(sx, yTop + 1.2, zBack), a4 = P(sx, 0, zBack); if (f > 0) { B.quad(a4, a3, a2, a1, conc); } else B.quad(a1, a2, a3, a4, conc); }
      // vertical ribs on the back cladding
      for (let a = -hl + 3; a < hl - 1; a += 6) B.box(m, 0.25, yTop + 1.2, 0.25, a, 0, zBack + 0.14, steel);
      // roof: cantilevered slab on rear columns with a truss and a coloured fascia
      if (b.roof) {
        const ry = yTop + 4.0, front = -1.6;
        B.box(m, L + 0.4, 0.32, zBack - front + 1.0, 0, ry, (front + zBack + 1.0) / 2, roofGrey, { top: white, bottom: true });
        B.box(m, L + 0.42, 0.8, 0.18, 0, ry - 0.45, front - 0.02, red);
        for (let a = -hl + 1; a <= hl - 0.9; a += Math.max(7, L / Math.max(1, Math.round(L / 9)))) {
          B.box(m, 0.36, ry, 0.36, a, 0, zBack + 0.5, steel);
          B.beam(m, [a, ry - 0.05, zBack + 0.5], [a, ry - 1.4, zBack - 3], 0.16, steel); B.beam(m, [a, ry - 1.4, zBack - 3], [a, ry - 0.1, front + 0.6], 0.14, steel);
        }
      }
      // stair towers at the ends of each run
      for (const [flag, sx] of [[b.first, -hl - 1.9], [b.last, hl + 1.9]]) {
        if (!flag) continue; B.box(m, 3.4, yTop + 2.4, 4.0, sx, 0, zBack - 2.0, C(0xb5b8bd));
        for (let y = 2.2; y < yTop + 1; y += 2.2) B.box(m, 3.6, 0.2, 4.2, sx, y, zBack - 2.0, C(0x8e9196));
        B.box(m, 1.2, 2.1, 0.1, sx, 0, zBack + 0.02, dark); B.box(m, 3.6, 0.3, 4.2, sx, yTop + 2.4, zBack - 2.0, white);
      }
      // flag poles behind roofed stands
      if (b.roof && !b.osm) for (let a = -hl + 4; a < hl - 2; a += 12) { B.box(m, 0.12, 9.5, 0.12, a, 0, zBack + 2.4, steel); flags.push([P(a, 8.0, zBack + 2.4), Math.atan2(b.nx, b.nz)]); }
    }
    stats.standTris = B.count / 3; stats.crowdQuads = crowd.length; sc.crowdCount = seats;
    // ---- hospitality marquees (white tent roofs) and decks
    for (const h of E.hosp) {
      const y = E.ground(h.cx, h.cz) - 0.05; const m = Env.frame(h.cx, y, h.cz, h.tx, h.tz, h.nx, h.nz); const L = h.L, D = h.D, P = (x, yy, z) => Env.xf(m, x, yy, z);
      if (h.kind === 'marquee') {
        const wall = 3.2, ridge = 2.6;
        H.box(m, L, wall, D, 0, 0, 0, C(0xe9eaea)); H.box(m, L + 0.05, 1.3, D + 0.05, 0, 1.0, 0, C(0x5d6f84));
        const a = P(-L / 2 - 0.4, wall, -D / 2 - 0.4), bb = P(L / 2 + 0.4, wall, -D / 2 - 0.4), c = P(L / 2 + 0.4, wall, D / 2 + 0.4), d = P(-L / 2 - 0.4, wall, D / 2 + 0.4), r1 = P(-L / 2 - 0.4, wall + ridge, 0), r2 = P(L / 2 + 0.4, wall + ridge, 0);
        H.quad(a, r1, r2, bb, C(0xf6f7f7)); H.quad(c, r2, r1, d, C(0xeceeee)); H.tri(bb, r2, c, C(0xe4e6e6)); H.tri(d, r1, a, C(0xe4e6e6));
        for (let x = -L / 2 + 4; x < L / 2; x += 5) { H.tri(P(x, wall + 0.02, -D / 2 - 0.42), P(x + 0.3, wall + ridge + 0.02, 0), P(x + 0.15, wall + 0.02, -D / 2 - 0.42), C(0xd0d3d4)); }
      } else {
        H.box(m, L, 3.4, D, 0, 0, 0, C(0x2d3138)); H.box(m, L + 0.1, 2.2, D + 0.1, 0, 0.8, 0, C(0x4a6280)); H.box(m, L, 3.0, D, 0, 3.4, 0, C(0xf1f2f3)); H.box(m, L + 0.1, 1.6, D + 0.1, 0, 4.0, 0, C(0x5d7592));
        H.box(m, L + 2, 0.3, D + 3, 0, 6.4, -1, C(0xf7f8f8), { bottom: true }); for (const sx of [-L / 2, L / 2]) H.box(m, 0.25, 6.4, 0.25, sx, 0, -D / 2 - 2.2, steel);
      }
    }
    // ---- BRDC clubhouse: two storeys of glass under a deep white roof, a corner tower
    if (E.brdc) {
      const b = E.brdc; const y = E.ground(b.cx, b.cz) - 0.05; const m = Env.frame(b.cx, y, b.cz, b.tx, b.tz, b.nx, b.nz);
      H.box(m, 64, 4.2, 22, 0, 0, 0, C(0x34404f)); H.box(m, 64.1, 2.6, 22.1, 0, 0.8, 0, glass); H.box(m, 62, 4.0, 20, 0, 4.2, 0.6, white); H.box(m, 62.1, 2.4, 20.1, 0, 5.0, 0.6, glass);
      H.box(m, 70, 0.5, 30, 0, 8.2, -1.5, white, { bottom: true }); H.box(m, 70.1, 0.9, 0.3, 0, 7.9, -16.5, C(0x0b3d2e));
      H.box(m, 8, 13, 8, 30, 0, 6, white); H.box(m, 8.1, 3, 8.1, 30, 9, 6, glass); for (const sx of [-34, -12, 12, 34]) H.box(m, 0.4, 8.2, 0.4, sx, 0, -16, steel);
    }
    // ---- industrial sheds: pale cladding, shallow pitched roofs, loading doors, an office front, parked trailers
    for (const s of E.sheds) {
      const y = E.ground(s.cx, s.cz) - 0.1; const m = Env.frame(s.cx, y, s.cz, 0, 1, s.door > 0 ? -1 : 1, 0); // +x along z (shed depth), +z towards the estate road
      const Lz = s.d, Wx = s.w, h = s.h, P = (x, yy, z) => Env.xf(m, x, yy, z); const wallC = C([0xc9ccd0, 0xd7d8d3, 0xb9c2c9, 0xdad5c8][Math.floor(Math.abs(s.cx * 7 + s.cz) % 4)]);
      H.box(m, Lz, h, Wx, 0, 0, 0, wallC); H.box(m, Lz + 0.05, 0.6, Wx + 0.05, 0, h - 0.6, 0, C(0x7b8a99));
      const r = h + Wx * 0.06; const a = P(-Lz / 2 - 0.3, h, -Wx / 2 - 0.3), b = P(Lz / 2 + 0.3, h, -Wx / 2 - 0.3), c = P(Lz / 2 + 0.3, h, Wx / 2 + 0.3), d = P(-Lz / 2 - 0.3, h, Wx / 2 + 0.3), r1 = P(-Lz / 2 - 0.3, r, 0), r2 = P(Lz / 2 + 0.3, r, 0);
      const roofC = C(0xb4b9bd); H.quad(a, r1, r2, b, roofC); H.quad(c, r2, r1, d, C(0xa9aeb2)); H.tri(b, r2, c, wallC); H.tri(d, r1, a, wallC);
      for (let x = -Lz / 2 + 6; x < Lz / 2 - 4; x += 9) H.box(m, 4.5, 5, 0.2, x, 0, Wx / 2 + 0.05, C(0x5e6a74));
      H.box(m, Math.min(16, Lz * 0.4), h * 0.75, 6, -Lz / 2 + 8, 0, Wx / 2 + 3, C(0xe3e5e8)); H.box(m, Math.min(16, Lz * 0.4) + 0.05, 1.4, 6.05, -Lz / 2 + 8, 2.4, Wx / 2 + 3, glass);
      // parked articulated lorries on the yard
      for (let k = 0; k < 3; k++) { const tz = Wx / 2 + 14, tx = -Lz / 2 + 14 + k * 7; if (tx > Lz / 2 - 8) break; H.box(m, 2.5, 3.0, 13.6, tx, 1.0, tz + 2, C([0xf2f2f2, 0x2b4c7e, 0xc8102e][k % 3])); H.box(m, 2.4, 2.6, 2.3, tx, 0.6, tz - 6.3, C(0xe8e8e8)); H.box(m, 2.3, 0.9, 12, tx, 0.1, tz + 2, C(0x26282c)); }
    }
    // ---- light towers in the car parks and camp sites
    for (const p of E.parks.concat(E.camps)) {
      for (const sx of [-0.55, 0.55]) {
        const x = p.cx + p.ax * p.hl * sx, z = p.cz + p.az * p.hl * sx; const y = E.ground(x, z); const m = Env.frame(x, y, z, p.ax, p.az, -p.az, p.ax);
        H.box(m, 0.35, 16, 0.35, 0, 0, 0, C(0x8d9298)); H.box(m, 2.6, 1.0, 0.5, 0, 16, 0, C(0x2a2d31)); H.box(m, 2.4, 0.8, 0.1, 0, 16.1, 0.26, C(0xf4f1e2)); H.box(m, 1.2, 0.8, 0.8, 0, 0, 0, C(0xa0a39f));
      }
    }
    // ---- gates: two pillars, a banner beam and a ticket booth
    E.gates.forEach((g, k) => {
      const L = Math.hypot(g.tx, g.tz) || 1; const tx = g.tx / L, tz = g.tz / L; const y = E.ground(g.x, g.z); const m = Env.frame(g.x, y, g.z, tx, tz, -tz, tx);
      for (const sx of [-6.5, 6.5]) { H.box(m, 1.0, 6.2, 1.0, sx, 0, 0, C(0x2a2d33)); }
      H.box(m, 14, 1.6, 0.6, 0, 5.0, 0, C(k % 2 ? 0xc8102e : 0x0b3d2e)); H.box(m, 14.1, 0.25, 0.65, 0, 6.6, 0, white);
      H.box(m, 3, 2.6, 2.4, 9.5, 0, 0, C(0xe9eaea)); H.box(m, 3.1, 0.9, 2.5, 9.5, 1.1, 0, glass); H.box(m, 3.6, 0.25, 3.0, 9.5, 2.6, 0, C(0xc8102e));
    });
    const standMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.05 });
    const sm = new THREE.Mesh(B.geometry(), standMat); sm.castShadow = true; sm.receiveShadow = true; sm.name = 'stands'; sc.group.add(sm);
    if (H.count) { const hm = new THREE.Mesh(H.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.08 })); hm.castShadow = true; hm.receiveShadow = true; hm.name = 'venueBuildings'; sc.group.add(hm); stats.venueTris = H.count / 3; }
    if (fronts.length) { const fm = new THREE.Mesh(Env.merge(fronts), new THREE.MeshStandardMaterial({ map: sponsorTexture(), roughness: 0.5 })); fm.name = 'standBoards'; sc.group.add(fm); }
    V.crowd(E, crowd); V.flags(E, flags);
    V.roads(E); V.fence(E); V.cars(E); V.camps(E);
    E.timings.venue = Math.round(performance.now() - T0);
  };

  // ---- crowd: one InstancedMesh of 3-seat cards from an 8-variant atlas
  V.crowd = function (E, list) {
    if (!list.length) return; const sc = E.sc; const atlas = crowdAtlas();
    const geo = new THREE.PlaneGeometry(1.65, 1.1); geo.translate(0, 0.55, 0); geo.rotateY(Math.PI); // faces -z (the track) in the block frame
    const nr = geo.attributes.normal; for (let i = 0; i < nr.count; i++) nr.setXYZ(i, 0, 0.55, -0.83);
    const cells = new Float32Array(list.length * 2); geo.setAttribute('ccell', new THREE.InstancedBufferAttribute(cells, 2));
    const patch = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 ccell;').replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_UV\nvUv = (vec2(1.0 - uv.x, uv.y) * vec2(0.996, 0.99) + vec2(0.002, 0.005) + ccell) * vec2(0.25, 0.5);\n#endif'); };
    const mat = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.5, roughness: 0.85, metalness: 0 }); mat.onBeforeCompile = patch; mat.customProgramCacheKey = () => 'crowd-atlas';
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas, alphaTest: 0.5 }); depth.onBeforeCompile = patch; depth.customProgramCacheKey = () => 'crowd-depth';
    const inst = new THREE.InstancedMesh(geo, mat, list.length); const m = new THREE.Matrix4(); const col = new THREE.Color();
    list.forEach((c, k) => { const [p, ax0, az0, nx, nz, cell, br] = c; const flip = -az0 * nx + ax0 * nz < 0 ? -1 : 1; const ax = ax0 * flip, az = az0 * flip; m.set(ax, 0, nx, p[0], 0, 1, 0, p[1], az, 0, nz, p[2], 0, 0, 0, 1); inst.setMatrixAt(k, m); cells[k * 2] = cell % 4; cells[k * 2 + 1] = 1 - Math.floor(cell / 4); inst.setColorAt(k, col.setRGB(br, br, br)); });
    inst.instanceMatrix.needsUpdate = true; inst.instanceColor.needsUpdate = true; Env.fitInstances(inst, 5);
    inst.customDepthMaterial = depth; inst.castShadow = false; inst.name = 'crowd'; sc.group.add(inst);
  };
  V.flags = function (E, list) {
    if (!list.length) return; const sc = E.sc;
    const [fc, fctx] = Env.canvas(64, 128); fctx.fillStyle = '#ffffff'; fctx.fillRect(0, 0, 64, 128); const fg = fctx.createLinearGradient(0, 0, 64, 0); fg.addColorStop(0, 'rgba(0,0,0,0.25)'); fg.addColorStop(0.3, 'rgba(255,255,255,0)'); fg.addColorStop(0.7, 'rgba(0,0,0,0.12)'); fg.addColorStop(1, 'rgba(0,0,0,0.3)'); fctx.fillStyle = fg; fctx.fillRect(0, 0, 64, 128);
    fctx.fillStyle = 'rgba(255,255,255,0.85)'; fctx.font = 'italic 900 34px Arial Black, Arial'; fctx.textAlign = 'center'; fctx.textBaseline = 'middle'; fctx.fillText('EI', 32, 64);
    const fgeo = new THREE.PlaneGeometry(1.6, 3.2, 6, 1); const fp = fgeo.attributes.position; for (let v = 0; v < fp.count; v++) { const x = fp.getX(v); fp.setZ(v, Math.sin((x + 0.8) * 3.6) * 0.16); } fgeo.translate(0.8, 0, 0); fgeo.computeVertexNormals();
    const inst = new THREE.InstancedMesh(fgeo, new THREE.MeshStandardMaterial({ map: Env.tex(fc), side: THREE.DoubleSide, roughness: 0.8 }), list.length);
    const teams = EI.TEAMS || [{ primary: '#e10600' }]; const col = new THREE.Color(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0); const rng = U.rng(5);
    list.forEach((f, k) => { v.set(f[0][0], f[0][1], f[0][2]); q.setFromAxisAngle(up, f[1] + Math.PI / 2 + (rng() - 0.5) * 0.5); m.compose(v, q, s); inst.setMatrixAt(k, m); inst.setColorAt(k, col.set(teams[Math.floor(rng() * teams.length)].primary)); });
    inst.instanceColor.needsUpdate = true; Env.fitInstances(inst, 4); inst.name = 'flags'; sc.group.add(inst); sc.flagCount = list.length;
  };

  // ---- roads + Stowe circuit as ribbons on the ground
  V.roads = function (E) {
    const sc = E.sc; const pos = [], uv = [], nrm = [], idx = [];
    const ribbon = (line, w, u0, u1, closed) => {
      let v = 0; const base = pos.length / 3; const n = line.length;
      for (let i = 0; i < n; i++) {
        const a = line[Math.max(0, i - 1)], b = line[Math.min(n - 1, i + 1)]; let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; const nx = -dz, nz = dx;
        if (i > 0) v += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]) / 12;
        for (const sd of [-1, 1]) { const x = line[i][0] + nx * sd * w / 2, z = line[i][1] + nz * sd * w / 2; pos.push(x, E.ground(x, z) + 0.07, z); uv.push(sd < 0 ? u0 : u1, v); nrm.push(0, 1, 0); }
        if (i > 0) { const k = base + (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
    };
    for (const r of E.roads) {
      // never across the circuit: cut the line where it gets inside the barriers
      let cur = []; const flush = () => { if (cur.length > 1) ribbon(cur, r.w, r.kind === 'public' ? 0.0 : 1 / 3, r.kind === 'public' ? 1 / 3 : 2 / 3); cur = []; };
      for (const p of r.line) { if (E.fAt(p[0], p[1]) < 6) flush(); else cur.push(p); } flush();
    }
    if (E.stowe) ribbon(E.stowe.concat([E.stowe[0]]), 10, 2 / 3, 1);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); geo.setIndex(idx); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: roadTexture(), roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })); m.receiveShadow = true; m.name = 'roads'; sc.group.add(m);
    E.stats.roadTris = idx.length / 3;
  };
  // ---- perimeter fence: green mesh panels on posts
  V.fence = function (E) {
    const sc = E.sc; if (!E.fence.length) return; const pos = [], uv = [], nrm = [], idx = []; const posts = [];
    for (const run of E.fence) {
      let u = 0; const base = pos.length / 3;
      run.forEach((p, i) => { const y = E.ground(p[0], p[1]); if (i) u += Math.hypot(p[0] - run[i - 1][0], p[1] - run[i - 1][1]) / 2.4; pos.push(p[0], y - 0.1, p[1], p[0], y + 2.4, p[1]); uv.push(u, 0, u, 1); nrm.push(0, 1, 0, 0, 1, 0); if (i) { const k = base + (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } if (i % 1 === 0) posts.push([p[0], y, p[1]]); });
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); geo.setIndex(idx); geo.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({ map: fenceTexture(), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.7, metalness: 0.2 }); mat.onBeforeCompile = Env.noFlip;
    const fm = new THREE.Mesh(geo, mat); fm.name = 'perimeterFence'; sc.group.add(fm);
    const pg = new THREE.CylinderGeometry(0.06, 0.06, 2.6, 4, 1, true); pg.translate(0, 1.2, 0); const inst = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ color: 0x3a4a3e, roughness: 0.6, metalness: 0.4 }), posts.length); const m = new THREE.Matrix4();
    posts.forEach((p, k) => { m.makeTranslation(p[0], p[1], p[2]); inst.setMatrixAt(k, m); }); inst.instanceMatrix.needsUpdate = true; Env.fitInstances(inst, 3); inst.name = 'perimeterPosts'; sc.group.add(inst);
    E.stats.fencePosts = posts.length;
  };
  // ---- parked cars: rows nose to nose with aisles, varied paint, tilted to the ground
  V.cars = function (E) {
    const sc = E.sc, rng = U.rng(3131); const list = [];
    for (const p of E.parks) {
      const fill = 0.5 + rng() * 0.38;
      for (let b = -p.hd + 2.3; b < p.hd - 2; b += 16.2) for (const row of [0, 1]) {
        const off = b + row * 4.6; if (off > p.hd - 2.2) continue;
        for (let a = -p.hl + 1.4; a < p.hl - 1.2; a += 2.65) {
          if (rng() > fill) continue; const x = p.cx + p.ax * a - p.az * off, z = p.cz + p.az * a + p.ax * off;
          list.push([x, z, Math.atan2(p.ax, p.az) * 0 + Math.atan2(-p.az, p.ax) + Math.PI / 2 + (row ? Math.PI : 0) + (rng() - 0.5) * 0.12]);
        }
      }
    }
    for (const c of E.camps) for (let k = 0; k < 18; k++) { const a = (rng() - 0.5) * 2 * c.hl, b = c.hd + 6 + rng() * 4; list.push([c.cx + c.ax * a - c.az * b, c.cz + c.az * a + c.ax * b, Math.atan2(-c.az, c.ax) + (rng() - 0.5) * 0.3]); }
    if (!list.length) return;
    // car: body + glasshouse, vertex colour 1 = paint (instance colour), dark = glass / tyres
    const Bd = new Env.Builder(); const I = new THREE.Matrix4(); const paint = new THREE.Color(1, 1, 1), glassC = new THREE.Color(0.06, 0.07, 0.09), tyre = new THREE.Color(0.03, 0.03, 0.03);
    Bd.box(I, 4.3, 0.62, 1.78, 0, 0.3, 0, paint); void tyre;
    // glasshouse: roof + windscreen / rear screen + side glass (no hidden faces)
    const P = (x, y, z) => [x, y, z]; const r0 = 0.92, r1 = 1.42;
    Bd.quad(P(-1.25, r1, -0.72), P(-1.25, r1, 0.72), P(0.55, r1, 0.72), P(0.55, r1, -0.72), paint);
    Bd.quad(P(0.55, r1, -0.72), P(0.55, r1, 0.72), P(1.2, r0, 0.82), P(1.2, r0, -0.82), glassC);
    Bd.quad(P(-1.25, r1, 0.72), P(-1.25, r1, -0.72), P(-1.75, r0, -0.82), P(-1.75, r0, 0.82), glassC);
    Bd.quad(P(-1.75, r0, 0.82), P(1.2, r0, 0.82), P(0.55, r1, 0.72), P(-1.25, r1, 0.72), glassC);
    Bd.quad(P(1.2, r0, -0.82), P(-1.75, r0, -0.82), P(-1.25, r1, -0.72), P(0.55, r1, -0.72), glassC);
    const geo = Bd.geometry(); const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.4 });
    const inst = new THREE.InstancedMesh(geo, mat, list.length); const m = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3(); const col = new THREE.Color();
    const pal = [0xf2f2f2, 0xf2f2f2, 0x15171a, 0x15171a, 0x9ea3a8, 0x9ea3a8, 0x5c6168, 0x1d3557, 0x8c1d24, 0x2f5fa8, 0xd8d8d4, 0x40454c, 0x7a1f2b, 0x2b4a3a, 0xc9b28a, 0xe0661c];
    list.forEach((c, k) => {
      const [x, z, yaw] = c; const y = E.ground(x, z); const hx = E.ground(x + 1.5, z) - E.ground(x - 1.5, z), hz = E.ground(x, z + 1.5) - E.ground(x, z - 1.5); nrm.set(-hx / 3, 1, -hz / 3).normalize();
      q.setFromAxisAngle(up, yaw); q2.setFromUnitVectors(up, nrm); q.premultiply(q2); p.set(x, y, z); m.compose(p, q, s); inst.setMatrixAt(k, m);
      col.setHex(pal[Math.floor(rng() * pal.length)]).convertSRGBToLinear(); inst.setColorAt(k, col);
    });
    inst.instanceMatrix.needsUpdate = true; inst.instanceColor.needsUpdate = true; Env.fitInstances(inst, 5); inst.receiveShadow = true; inst.name = 'parkedCars'; sc.group.add(inst);
    E.stats.cars = list.length;
  };
  // ---- camp sites: dome and ridge tents, campervans, a few gazebos
  V.camps = function (E) {
    const sc = E.sc, rng = U.rng(919); if (!E.camps.length) return;
    const tents = []; const vans = new Env.Builder();
    for (const c of E.camps) {
      for (let a = -c.hl + 4; a < c.hl - 3; a += 7.5) for (let b = -c.hd + 4; b < c.hd - 3; b += 7.5) {
        if (rng() < 0.22) continue; const x = c.cx + c.ax * (a + (rng() - 0.5) * 3) - c.az * (b + (rng() - 0.5) * 3), z = c.cz + c.az * (a + (rng() - 0.5) * 3) + c.ax * (b + (rng() - 0.5) * 3);
        if (rng() < 0.16) { const y = E.ground(x, z); const yaw = Math.atan2(-c.az, c.ax) + (rng() - 0.5) * 0.4; const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z); campervan(vans, m, C([0xe63946, 0x457b9d, 0xffb703, 0x2a9d8f, 0x6a4c93, 0xf77f00][Math.floor(rng() * 6)])); }
        else tents.push([x, z, rng() * 6.283, rng() < 0.6 ? 0 : 1, 0.8 + rng() * 0.6]);
      }
    }
    // tent shapes: 0 dome (low pyramid on an octagon), 1 ridge tent (prism)
    const dome = new Env.Builder(), ridge = new Env.Builder(); const w1 = new THREE.Color(1, 1, 1), w2 = new THREE.Color(0.7, 0.7, 0.7);
    for (let k = 0; k < 8; k++) { const a0 = k / 8 * 6.283, a1 = (k + 1) / 8 * 6.283; dome.tri([Math.cos(a0) * 1.4, 0, Math.sin(a0) * 1.4], [Math.cos(a1) * 1.4, 0, Math.sin(a1) * 1.4], [0, 1.3, 0], k % 2 ? w1 : w2); dome.tri([Math.cos(a1) * 1.4, 0, Math.sin(a1) * 1.4], [Math.cos(a0) * 1.4, 0, Math.sin(a0) * 1.4], [Math.cos((a0 + a1) / 2) * 1.0, 0.9, Math.sin((a0 + a1) / 2) * 1.0], w1); }
    ridge.quad([-1.2, 0, -1.6], [-1.2, 0, 1.6], [0, 1.4, 1.6], [0, 1.4, -1.6], w1); ridge.quad([1.2, 0, 1.6], [1.2, 0, -1.6], [0, 1.4, -1.6], [0, 1.4, 1.6], w2); ridge.tri([-1.2, 0, 1.6], [1.2, 0, 1.6], [0, 1.4, 1.6], w2); ridge.tri([1.2, 0, -1.6], [-1.2, 0, -1.6], [0, 1.4, -1.6], w2);
    const tcols = [0x2f6db5, 0x3c8d3f, 0xe06c1b, 0xd8c23a, 0xb02e2e, 0x6c757d, 0x1f3a5f, 0x8a5a9e, 0xe9e9e9, 0x2a9d8f];
    [dome, ridge].forEach((bld, kind) => {
      const list = tents.filter(tn => tn[3] === kind); if (!list.length) return;
      const inst = new THREE.InstancedMesh(bld.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }), list.length); const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
      list.forEach((tn, k) => { p.set(tn[0], E.ground(tn[0], tn[1]) - 0.02, tn[1]); q.setFromAxisAngle(up, tn[2]); s.set(tn[4], tn[4], tn[4]); m.compose(p, q, s); inst.setMatrixAt(k, m); inst.setColorAt(k, col.setHex(tcols[Math.floor(rng() * tcols.length)]).convertSRGBToLinear()); });
      inst.instanceMatrix.needsUpdate = true; inst.instanceColor.needsUpdate = true; Env.fitInstances(inst, 3); inst.name = 'tents'; sc.group.add(inst);
    });
    if (vans.count) { const vm = new THREE.Mesh(vans.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1 })); vm.castShadow = true; vm.receiveShadow = true; vm.name = 'campervans'; sc.group.add(vm); }
    E.stats.tents = tents.length;
  };
  function campervan(B, m, color) {
    const white = C(0xf3f3f0), glass = C(0x3b4a5a), tyre = C(0x232426);
    B.box(m, 6.2, 2.1, 2.3, 0, 0.7, 0, white); B.box(m, 2.2, 1.6, 2.2, 2.6, 0.5, 0, white); B.box(m, 6.24, 0.5, 2.34, 0, 1.5, 0, color);
    B.box(m, 0.3, 0.8, 2.0, 3.6, 1.2, 0, glass); B.box(m, 1.8, 0.6, 2.34, -1.5, 2.0, 0, glass); B.box(m, 5.8, 0.4, 2.0, 0, 0.1, 0, tyre);
  }

  EI.EnvVenue = V;
})();
