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
    const t = E.t, sc = E.sc, OCC = Env.OCC, D = t.data.scenery; const street = E.data.kind === 'street'; const park = E.data.kind === 'park';   // park (Monza): real roads / parking from the data, no generated estate roads, fence, car parks
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
    const lines = street || park ? [] : Env.contours(E, E.dF, 118);
    let perim = null, best = 0;
    for (const l of lines) { if (!l.closed) continue; const L = Env.polyLength(l, true); let out = 0; for (let i = 0; i < l.length; i += 7) if (!E.inside(l[i][0], l[i][1])) out++; if (out > l.length / 14 && L > best) { best = L; perim = l; } }
    if (perim) { perim = Env.smoothLine(perim, true, 2, 8); E.perimeter = perim; E.roads.push({ name: 'perimeter', w: 6.5, kind: 'estate', line: perim.concat([perim[0]]), closed: true }); }
    const inner = street || park ? [] : Env.contours(E, E.dF, 46); let inl = null; best = 0;
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
    if (!street && !park) for (let s = 0; s < t.length; s += 38) for (const side of [1, -1]) for (const off of side > 0 ? [130, 160, 205, 245, 290, 340] : [70, 100, 135, 170]) cand.push([s, side, off, rngP()]);
    cand.sort((a, b) => a[3] - b[3]);
    for (const [s, side, off] of cand) {
      if (E.parks.length >= 18) break; const p = trackPt(s, side, off); const hl = 45 + rngP() * 30, hd = 24 + rngP() * 14;
      tryRect(p.x + p.nx * hd, p.z + p.nz * hd, p.tx, p.tz, hl, hd, E.parks, 420);
    }
    E.fence = []; E.gates = [];
    if (!street && !park) {
    // ---- perimeter fence (venue boundary) with gaps + gates where roads cross it
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
    }
    E.stats.venue = { roads: E.roads.length, parks: E.parks.length, camps: E.camps.length, hosp: E.hosp.length, sheds: E.sheds.length, gates: E.gates.length, fenceRuns: E.fence.length, standBlocks: E.blocks.length };
  };

  // ---- grandstand runs -> straight blocks following the lap
  V.layoutStands = function (E) {
    const t = E.t, OCC = Env.OCC; E.blocks = []; E.treeLines = E.treeLines || []; E.standPolys = []; const pr = {};
    const spots = (EI.Infra && EI.Infra.SPOTS) || []; const kk = t.smooth(t.k, 10);
    const near = (s, side) => { for (const [ss, sd, half] of spots) { if (sd && sd !== side) continue; let d = Math.abs(U.mod(s - ss, t.length)); d = Math.min(d, t.length - d); if (d < half) return true; } return false; };
    for (const run of E.data.standRuns || []) {
      const [s0, s1, side, gap, rows, roof, seat] = run; let s = s0; let first = true; const runBlocks = [];
      while (s < s1 - 6) {
        const i0 = t.idxAtS(s); const R = 1 / (Math.abs(kk[i0]) + 1e-5); const step = U.clamp(R * 0.3, 10, 26); const sb = Math.min(s1, s + step);
        const ia = t.idxAtS(s), ib = t.idxAtS(sb); let wmax = 0; for (let i = ia; i !== (ib + 1) % t.n; i = (i + 1) % t.n) wmax = Math.max(wmax, E.wallCap(i, side));
        let d = wmax + gap; const inner = (kk[i0] > 0) === (side > 0); if (inner && d > R * 0.8) { s = sb; continue; }
        let A = [t.x[ia] + t.nx[ia] * side * d, t.z[ia] + t.nz[ia] * side * d], B = [t.x[ib] + t.nx[ib] * side * d, t.z[ib] + t.nz[ib] * side * d];
        // where the run-off widens fast (generic corners) the block's front still projected inside a neighbouring sample's barrier (stands
        // in the run-off at Silverstone's Chapel / Luffield): push the block out until its front clears every barrier it faces (FIT-AUDIT)
        for (let it = 0; it < 3; it++) { let need = 0; for (const u of [0, 0.5, 1]) { t.project(A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u, null, pr); const own = (pr.lat < 0 ? -1 : 1) === side; need = Math.max(need, E.wallCap(pr.i, side) + gap * 0.5 + (own ? -pr.dist : pr.dist)); }
          if (need <= 0.05) break; d += need; A = [t.x[ia] + t.nx[ia] * side * d, t.z[ia] + t.nz[ia] * side * d]; B = [t.x[ib] + t.nx[ib] * side * d, t.z[ib] + t.nz[ib] * side * d]; }
        let ax = B[0] - A[0], az = B[1] - A[1]; const L = Math.hypot(ax, az); ax /= L; az /= L; let nx = -az, nz = ax; const im = t.idxAtS((s + sb) / 2);
        if (nx * t.nx[im] * side + nz * t.nz[im] * side < 0) { nx = -nx; nz = -nz; }
        const len = L - 0.5; const depth = 0.4 + rows * 0.82 + 0.6; const cx = (A[0] + B[0]) / 2, cz = (A[1] + B[1]) / 2;
        const ok = len > 6 && !near((s + sb) / 2, side) && E.rectFree(cx + nx * depth / 2, cz + nz * depth / 2, ax, az, len / 2, depth / 2 + (roof ? 1 : 0), OCC.BUILT | OCC.WATER | OCC.ROAD) > 0.9 && E.fsAt(cx + nx * depth, cz + nz * depth) > 4 && E.fAt(cx + nx * depth, cz + nz * depth) > -60
          && [A, B].every(P => E.fsAt(P[0], P[1]) > 1 && E.dcAt(P[0] + nx * depth, P[1] + nz * depth) > t.halfWidth + t.kerbWidth + 4);   // every corner clear of the barriers (the back of a deep block reached the next leg of a chicane; FIT-AUDIT)
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
      ctx.fillStyle = 'rgb(28,36,20)'; for (const w of E.allWoods || []) { path(w); if (w.holes) { for (const h of w.holes) { ctx.moveTo(h[0][0], h[0][1]); for (let i = 1; i < h.length; i++) ctx.lineTo(h[i][0], h[i][1]); ctx.closePath(); } ctx.fill('evenodd'); } else ctx.fill(); }   // park woods: w.holes = clearings
      ctx.strokeStyle = 'rgba(28,36,20,0.6)'; ctx.lineWidth = 6; for (const w of E.allWoods || []) { if (w.core) continue; path(w); ctx.stroke(); }
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
  // ---------------------------------------------------------------- spectators
  // 16 poses painted procedurally (seated: hands on lap, arms crossed, phone, clapping, drink, leaning, small flag, binoculars,
  // long hair, child; standing: arms down, waving, both arms up, filming, flag, scarf). Atlas mode paints the shirt, accessory
  // (cap / flag / scarf), hair and skin as shaded greys plus a mask copy in the right half (R shirt, G accessory, B hair 0.5 /
  // skin 1.0) so every spectator gets its own colours in the shader; carpet mode paints real colours (distant crowd texture).
  const POSES = [
    { arms: 'lap', cap: 0 }, { arms: 'crossed', cap: 1 }, { arms: 'phone', long: 1 }, { arms: 'clap', cap: 0 }, { arms: 'drink', cap: 1, shades: 1 },
    { arms: 'lean', cap: 0 }, { arms: 'flag', cap: 1 }, { arms: 'bino', cap: 0 }, { arms: 'lap', long: 1, shades: 1 }, { arms: 'up1', kid: 1, cap: 1 },
    { stand: 1, arms: 'down', cap: 0 }, { stand: 1, arms: 'up1', cap: 1 }, { stand: 1, arms: 'up2', long: 1 }, { stand: 1, arms: 'phone', cap: 0, shades: 1 }, { stand: 1, arms: 'flag', cap: 1 }, { stand: 1, arms: 'scarf', cap: 0 },
  ];
  const TROUSERS = ['#2b3a55', '#1d1f24', '#6b6250', '#34445e', '#4a4d52', '#2b3a55', '#7a6a50', '#1d1f24'];
  // paint one spectator in a 128 x 320 cell (0.8 x 2.0 m, feet / seat base at the bottom) at (ox, oy) scaled by k
  function paintSpectator(ctx, mctx, ox, oy, k, pose, pal, r) {
    const st = pose.stand, kid = pose.kid ? 0.78 : 1; const S = k * kid; const cx = ox + 64 * k, by = oy + 320 * k;
    const X = (x) => cx + x * S, Y = (y) => by - y * S; // y: px above the base
    const hip = st ? 144 : 72, sh = hip + (st ? 88 : 86) - (pose.arms === 'lean' ? 12 : 0), headC = sh + 30, headR = 15;
    const fillCol = { shirt: pal.shirt, acc: pal.acc, hair: pal.hair, skin: pal.skin }, mcol = { shirt: '#ff0000', acc: '#00ff00', hair: '#000080', skin: '#0000ff' };
    const shadeGrad = (x0, x1, col) => { const g = ctx.createLinearGradient(X(x0), 0, X(x1), 0); g.addColorStop(0, shadeHex(col, 1.12)); g.addColorStop(0.4, col); g.addColorStop(1, shadeHex(col, 0.66)); return g; };
    const fillPath = (kind, path, x0, x1) => { const col = fillCol[kind] || kind; ctx.fillStyle = shadeGrad(x0, x1, col); path(ctx); ctx.fill(); if (mctx) { mctx.fillStyle = mcol[kind] || '#000000'; path(mctx); mctx.fill(); } };
    const limb = (kind, pts, w) => { const col = fillCol[kind] || kind; for (const [c, cc] of [[ctx, col], [mctx, mcol[kind] || '#000000']]) { if (!c) continue; c.strokeStyle = cc; c.lineWidth = w * S; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); c.moveTo(X(pts[0][0]), Y(pts[0][1])); for (let i = 1; i < pts.length; i++) c.lineTo(X(pts[i][0]), Y(pts[i][1])); c.stroke(); } };
    const blob = (kind, x, y, rx, ry) => fillPath(kind, (c) => { c.beginPath(); c.ellipse(X(x), Y(y), rx * S, ry * S, 0, 0, 6.283); }, x - rx, x + rx);
    const trousers = pal.trousers;
    // legs
    if (st) { for (const sd of [-1, 1]) fillPath(trousers, (c) => { c.beginPath(); c.moveTo(X(sd * 3), Y(hip)); c.lineTo(X(sd * 26), Y(hip)); c.lineTo(X(sd * 20), Y(8)); c.lineTo(X(sd * 6), Y(8)); c.closePath(); }, sd < 0 ? -26 : 3, sd < 0 ? -3 : 26); for (const sd of [-1, 1]) blob('#26221e', sd * 14, 5, 10, 6); }
    else {
      // seated: knees forward (a lighter band), shins down to the tread
      for (const sd of [-1, 1]) { fillPath(trousers, (c) => { c.beginPath(); c.moveTo(X(sd * 2), Y(hip + 8)); c.lineTo(X(sd * 25), Y(hip + 8)); c.lineTo(X(sd * 23), Y(hip - 14)); c.lineTo(X(sd * 3), Y(hip - 14)); c.closePath(); }, sd < 0 ? -25 : 2, sd < 0 ? -2 : 25); }
      const shorts = r() < 0.3;
      for (const sd of [-1, 1]) { fillPath(shorts ? 'skin' : trousers, (c) => { c.beginPath(); c.moveTo(X(sd * 5), Y(hip - 12)); c.lineTo(X(sd * 21), Y(hip - 12)); c.lineTo(X(sd * 19), Y(6)); c.lineTo(X(sd * 7), Y(6)); c.closePath(); }, sd < 0 ? -21 : 5, sd < 0 ? -5 : 21); blob('#2a2622', sd * 14, 4, 9, 5); }
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(X(-24), Y(hip - 10), 48 * S, 6 * S);
    }
    // long hair falls behind the shoulders
    if (pose.long) fillPath('hair', (c) => { c.beginPath(); c.ellipse(X(0), Y(headC - 18), 19 * S, 30 * S, 0, 0, 6.283); }, -19, 19);
    // torso: rounded shoulders, slight taper to the waist
    const tw = st ? 30 : 31, ww = st ? 25 : 27;
    fillPath('shirt', (c) => { c.beginPath(); c.moveTo(X(-ww), Y(hip - (st ? 4 : 0))); c.lineTo(X(-tw), Y(sh - 10)); c.quadraticCurveTo(X(-tw), Y(sh), X(-tw + 11), Y(sh + 2)); c.lineTo(X(tw - 11), Y(sh + 2)); c.quadraticCurveTo(X(tw), Y(sh), X(tw), Y(sh - 10)); c.lineTo(X(ww), Y(hip - (st ? 4 : 0))); c.closePath(); }, -tw, tw);
    // shirt details: collar shadow, a print / stripe now and then, fold shadow at the waist
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(X(0), Y(sh - 2), 9 * S, 5 * S, 0, 0, 6.283); ctx.fill();
    const print = r(); if (print < 0.35) { ctx.fillStyle = print < 0.15 ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.35)'; ctx.fillRect(X(-tw + 2), Y(sh - 30), (tw * 2 - 4) * S, 6 * S); } else if (print < 0.55) { ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(X(-8), Y(sh - 22), 16 * S, 12 * S); }
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(X(-ww), Y(hip + 8), ww * 2 * S, 8 * S);
    // neck + head (skin), ears, eyes, hair or cap
    fillPath('skin', (c) => { c.beginPath(); c.rect(X(-6), Y(sh + 12), 12 * S, 14 * S); }, -6, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(X(-6), Y(sh + 6), 12 * S, 4 * S);
    blob('skin', 0, headC, headR - 2, headR + 1); blob('skin', -headR + 1, headC, 3, 5); blob('skin', headR - 1, headC, 3, 5);
    ctx.fillStyle = 'rgba(40,24,16,0.85)'; ctx.fillRect(X(-7), Y(headC + 2), 4 * S, 2.5 * S); ctx.fillRect(X(3), Y(headC + 2), 4 * S, 2.5 * S);
    ctx.fillStyle = 'rgba(120,60,50,0.5)'; ctx.fillRect(X(-4), Y(headC - 8), 8 * S, 2 * S);
    if (pose.shades) { ctx.fillStyle = '#121214'; ctx.fillRect(X(-10), Y(headC + 4), 20 * S, 5 * S); }
    if (pose.cap) { fillPath('acc', (c) => { c.beginPath(); c.ellipse(X(0), Y(headC + 6), (headR + 1) * S, 11 * S, 0, Math.PI, 0); c.closePath(); }, -headR, headR); fillPath('acc', (c) => { c.beginPath(); c.rect(X(-headR - 1), Y(headC + 7), (headR * 2 + 7) * S, 4 * S); }, -headR, headR + 6); }
    else fillPath('hair', (c) => { c.beginPath(); c.ellipse(X(0), Y(headC + 7), headR * S, 11 * S, 0, Math.PI, 0); c.lineTo(X(headR), Y(headC + 2)); c.lineTo(X(-headR), Y(headC + 2)); c.closePath(); }, -headR, headR);
    // arms: shirt sleeve on the upper arm, skin forearm, a hand blob
    const arm = (sd, elbow, hand) => { limb('shirt', [[sd * (tw - 4), sh - 4], elbow], 13); limb('skin', [elbow, hand], 10); blob('skin', hand[0], hand[1], 6, 6); };
    const A = pose.arms, e = sh - 44;
    if (A === 'lap') { arm(-1, [-tw - 3, e], [-14, hip + 6]); arm(1, [tw + 3, e], [14, hip + 6]); }
    else if (A === 'crossed') { for (const sd of [-1, 1]) limb('shirt', [[sd * (tw - 4), sh - 4], [sd * (tw + 1), sh - 40]], 13); limb('skin', [[-tw, sh - 40], [tw - 6, sh - 34]], 11); limb('shirt', [[tw, sh - 42], [-tw + 6, sh - 36]], 12); }
    else if (A === 'phone') { arm(-1, [-tw - 3, e], [-14, hip + 6]); arm(1, [tw + 2, sh - 30], [10, headC + (st ? 34 : -2)]); ctx.fillStyle = '#16181c'; ctx.fillRect(X(2), Y(headC + (st ? 46 : 12)), 13 * S, 20 * S); ctx.fillStyle = 'rgba(160,190,230,0.6)'; ctx.fillRect(X(4), Y(headC + (st ? 44 : 10)), 9 * S, 15 * S); }
    else if (A === 'clap') { arm(-1, [-tw - 2, e + 4], [-3, sh - 22]); arm(1, [tw + 2, e + 4], [3, sh - 22]); }
    else if (A === 'drink') { arm(-1, [-tw - 3, e], [-14, hip + 6]); arm(1, [tw + 3, e + 2], [18, sh - 30]); ctx.fillStyle = r() < 0.5 ? '#f2f2f2' : '#c8102e'; ctx.fillRect(X(13), Y(sh - 18), 11 * S, 16 * S); }
    else if (A === 'lean') { arm(-1, [-22, hip + 2], [-8, headC - 18]); arm(1, [22, hip + 2], [8, headC - 18]); }
    else if (A === 'bino') { arm(-1, [-tw - 2, e + 6], [-9, headC - 2]); arm(1, [tw + 2, e + 6], [9, headC - 2]); ctx.fillStyle = '#1b1c1f'; ctx.fillRect(X(-13), Y(headC + 6), 26 * S, 9 * S); }
    else if (A === 'down') { arm(-1, [-tw - 4, e], [-tw - 2, hip - 6]); arm(1, [tw + 4, e], [tw + 2, hip - 6]); }
    else if (A === 'up1') { arm(-1, [-tw - 3, e], [-16, hip + 4]); arm(1, [tw + 12, sh + 30], [tw + 14, sh + 72]); }
    else if (A === 'up2') { arm(-1, [-tw - 12, sh + 30], [-tw - 10, sh + 70]); arm(1, [tw + 12, sh + 30], [tw + 10, sh + 70]); }
    else if (A === 'flag') {
      arm(-1, [-tw - 3, e], [-16, hip + 4]); arm(1, [tw + 10, sh + 26], [tw + 8, sh + 56]);
      const fx = tw + 8, fy = sh + 56; limb('#5a4a3a', [[fx, fy - 10], [fx, fy + 62]], 3); fillPath('acc', (c) => { c.beginPath(); c.moveTo(X(fx), Y(fy + 62)); c.quadraticCurveTo(X(fx - 22), Y(fy + 70), X(fx - 46), Y(fy + 58)); c.lineTo(X(fx - 44), Y(fy + 26)); c.quadraticCurveTo(X(fx - 22), Y(fy + 36), X(fx), Y(fy + 30)); c.closePath(); }, fx - 46, fx);
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(X(fx - 40), Y(fy + 48), 36 * S, 6 * S);
    }
    else if (A === 'scarf') { arm(-1, [-tw - 10, sh + 26], [-tw - 6, sh + 58]); arm(1, [tw + 10, sh + 26], [tw + 6, sh + 58]); fillPath('acc', (c) => { c.beginPath(); c.rect(X(-tw - 8), Y(sh + 66), (tw * 2 + 16) * S, 12 * S); }, -tw, tw); ctx.fillStyle = 'rgba(255,255,255,0.6)'; for (let x = -tw - 4; x < tw + 6; x += 12) ctx.fillRect(X(x), Y(sh + 64), 5 * S, 8 * S); }
  }
  function shadeHex(col, k) { const c = new THREE.Color(col); return 'rgb(' + Math.min(255, c.r * 255 * k | 0) + ',' + Math.min(255, c.g * 255 * k | 0) + ',' + Math.min(255, c.b * 255 * k | 0) + ')'; }
  function crowdAtlas() {
    const [c, ctx] = Env.canvas(1024, 1280); ctx.clearRect(0, 0, 1024, 1280); const r = U.rng(4321);
    const grey = '#bababa', pal = { shirt: grey, acc: grey, hair: '#9a9a9a', skin: '#b4b4b4' };
    POSES.forEach((pose, k) => {
      const ox = (k % 4) * 128, oy = Math.floor(k / 4) * 320; pal.trousers = TROUSERS[k % TROUSERS.length];
      ctx.save(); ctx.beginPath(); ctx.rect(ox + 1, oy + 1, 126, 318); ctx.rect(ox + 513, oy + 1, 126, 318); ctx.clip();
      // the mask copy lands 512 px to the right: a translated view of the same canvas
      const m = { set strokeStyle(v) { ctx.strokeStyle = v; }, set fillStyle(v) { ctx.fillStyle = v; }, set lineWidth(v) { ctx.lineWidth = v; }, set lineCap(v) { ctx.lineCap = v; }, set lineJoin(v) { ctx.lineJoin = v; },
        beginPath() { ctx.beginPath(); }, moveTo(x, y) { ctx.moveTo(x + 512, y); }, lineTo(x, y) { ctx.lineTo(x + 512, y); }, quadraticCurveTo(a, b, x, y) { ctx.quadraticCurveTo(a + 512, b, x + 512, y); }, closePath() { ctx.closePath(); },
        ellipse(x, y, rx, ry, rot, a0, a1) { ctx.ellipse(x + 512, y, rx, ry, rot, a0, a1); }, rect(x, y, w, h) { ctx.rect(x + 512, y, w, h); }, fill() { ctx.fill(); }, stroke() { ctx.stroke(); } };
      paintSpectator(ctx, m, ox, oy, 1, pose, pal, r);
      ctx.restore();
    });
    return Env.cutout(c, { aniso: 4 });
  }
  // distant crowd: a tiling strip of seated spectators in real colours (2048 px = 64 seats = 35.2 m, 128 px = 2.2 m)
  function crowdCarpetTexture(shirts) {
    const [c, ctx] = Env.canvas(2048, 128); ctx.clearRect(0, 0, 2048, 128); const r = U.rng(9191);
    const skins = ['#f1c7a5', '#e0ac87', '#c68a62', '#8d5a3b', '#f5d3b8'], hairs = ['#2a1d14', '#4b3020', '#141414', '#a07a4a', '#d9b46a', '#7a7a7a'];
    const k = 128 / 320 * 2.2 / 2.2 * (2.0 / 2.2); // card 2.0 m in a 2.2 m strip
    for (let i = 0; i < 64; i++) {
      if (r() < 0.08) continue; const pose = r() < 0.12 ? POSES[10 + Math.floor(r() * 6)] : POSES[Math.floor(r() * 10)];
      const pal = { shirt: shirts[Math.floor(r() * shirts.length)], acc: shirts[Math.floor(r() * shirts.length)], hair: hairs[Math.floor(r() * hairs.length)], skin: skins[Math.floor(r() * skins.length)], trousers: TROUSERS[Math.floor(r() * TROUSERS.length)] };
      const x = i * 32 + 16 - 64 * k + (r() - 0.5) * 4;
      for (const ox of [0, -2048, 2048]) { if (x + ox > 2048 || x + ox + 128 * k < 0) continue; ctx.save(); paintSpectator(ctx, null, x + ox, 128 - 320 * k, k, pose, pal, U.rng(i * 7 + 1)); ctx.restore(); }
    }
    const t = Env.cutout(c, { repeat: true, aniso: 4 }); t.wrapT = THREE.ClampToEdgeWrapping; return t;
  }
  function sponsorTexture() {
    // top half: sponsor boards (8 x 256 px); bottom half: fan banners (8 x 256 px)
    const [c, ctx] = Env.canvas(2048, 256);
    // the eight partner boards (EI.Ads.paintTile, 5:1 boards; one u period of the strips = all eight, 5 h each - f1-BRAND: was 5 h for all 8)
    // each design fills exactly the band the strips show (v 0.52..0.98 = rows 5..123), at 5:1
    for (let k = 0; k < 8; k++) { const x = k * 256; ctx.fillStyle = '#2a2d31'; ctx.fillRect(x, 0, 256, 128); EI.Ads.paintTile(ctx, k, x, 5, 256, 118, 5); }
    const teams = EI.TEAMS || []; const tc = (k, f) => (teams[k % Math.max(1, teams.length)] || {})[f] || ['#c8102e', '#1a73e8', '#ff8000', '#00843d'][k % 4];
    const ban = (k, draw) => { ctx.save(); ctx.translate(k * 256, 128); ctx.beginPath(); ctx.rect(0, 0, 256, 128); ctx.clip(); draw(); ctx.restore(); };
    const text = (str, col, size, y, stroke) => { ctx.font = 'italic 900 ' + size + 'px Arial Black, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; if (stroke) { ctx.lineWidth = 6; ctx.strokeStyle = stroke; ctx.strokeText(str, 128, y); } ctx.fillStyle = col; ctx.fillText(str, 128, y); };
    ban(0, () => { for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) { ctx.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4'; ctx.fillRect(x * 32, y * 32, 32, 32); } });
    ban(1, () => { ctx.fillStyle = '#012169'; ctx.fillRect(0, 0, 256, 128); ctx.strokeStyle = '#fff'; ctx.lineWidth = 24; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(256, 128); ctx.moveTo(256, 0); ctx.lineTo(0, 128); ctx.stroke(); ctx.strokeStyle = '#c8102e'; ctx.lineWidth = 8; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fillRect(108, 0, 40, 128); ctx.fillRect(0, 44, 256, 40); ctx.fillStyle = '#c8102e'; ctx.fillRect(116, 0, 24, 128); ctx.fillRect(0, 52, 256, 24); });
    ban(2, () => { ctx.fillStyle = tc(0, 'primary'); ctx.fillRect(0, 0, 256, 128); ctx.fillStyle = tc(0, 'secondary'); ctx.fillRect(0, 96, 256, 32); text('GO GO GO!', '#fff', 40, 50, 'rgba(0,0,0,0.5)'); });
    ban(3, () => { ctx.fillStyle = '#ffd500'; ctx.fillRect(0, 0, 256, 128); text('ALLEZ!', '#111', 56, 64); });
    ban(4, () => { ctx.fillStyle = '#f2f2f2'; ctx.fillRect(0, 0, 256, 128); ctx.fillStyle = tc(1, 'primary'); ctx.fillRect(0, 0, 256, 24); ctx.fillRect(0, 104, 256, 24); text('#1 FANS', tc(1, 'primary'), 46, 64); });
    ban(5, () => { ctx.fillStyle = '#c8102e'; ctx.fillRect(0, 0, 256, 128); text('FORZA', '#fff', 54, 64); });
    ban(6, () => { ctx.fillStyle = '#ff8000'; ctx.fillRect(0, 0, 256, 128); ctx.fillStyle = '#1b1b1b'; ctx.fillRect(0, 0, 256, 18); ctx.fillRect(0, 110, 256, 18); text('VAMOS!', '#fff', 50, 64, 'rgba(0,0,0,0.35)'); });
    ban(7, () => { const g = ctx.createLinearGradient(0, 0, 256, 0); g.addColorStop(0, tc(2, 'primary')); g.addColorStop(1, tc(3, 'primary')); ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 128); text('SILVERSTONE', '#fff', 30, 48, 'rgba(0,0,0,0.4)'); text('GRAND PRIX', '#fff', 26, 92, 'rgba(0,0,0,0.4)'); });
    return Env.tex(c, true, 8);
  }
  function fenceTexture() {
    const [c, ctx] = Env.canvas(64, 64); ctx.clearRect(0, 0, 64, 64); ctx.strokeStyle = 'rgba(48,66,52,0.95)'; ctx.lineWidth = 1.6;
    for (let i = -64; i < 128; i += 8) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 64, 64); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i + 64, 0); ctx.lineTo(i, 64); ctx.stroke(); }
    ctx.fillStyle = 'rgba(40,56,44,1)'; ctx.fillRect(0, 0, 64, 3); ctx.fillRect(0, 61, 64, 3);
    return Env.cutout(c, { repeat: true });
  }
  // galvanised tube-and-clamp scaffolding (the temporary stands' exposed backs and stair towers): one 512 px tile = 8 x 8 m,
  // standards every 2 m, ledgers every 2 m, zig-zag facade bracing in every other bay column, transoms / boards at the top lift
  function scaffoldTexture() {
    const [c, ctx] = Env.canvas(512, 512); ctx.clearRect(0, 0, 512, 512);
    const tube = (x0, y0, x1, y1, w, col) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'butt'; for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) { ctx.beginPath(); ctx.moveTo(x0 + ox, y0 + oy); ctx.lineTo(x1 + ox, y1 + oy); ctx.stroke(); } };
    // braces behind (darker, they sit in the inner face), ledgers, then the standards in front
    for (let bx = 0; bx < 4; bx += 2) for (let ly = 0; ly < 4; ly++) { const x0 = 64 + bx * 128, y0 = 64 + ly * 128; tube(ly % 2 ? x0 : x0 + 128, y0, ly % 2 ? x0 + 128 : x0, y0 + 128, 6, '#8d949b'); }
    for (let k = 0; k < 4; k++) { const y = 64 + k * 128; tube(0, y, 512, y, 7, '#a9b0b6'); tube(0, y - 2, 512, y - 2, 2, '#d4d9dd'); }
    for (let k = 0; k < 4; k++) { const x = 64 + k * 128; tube(x, 0, x, 512, 8, '#b4bbc1'); tube(x - 1, 0, x - 1, 512, 2.5, '#e3e7ea'); tube(x + 3, 0, x + 3, 512, 2, '#7d848b'); }
    ctx.fillStyle = '#5e656c'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) ctx.fillRect(64 + i * 128 - 6, 64 + j * 128 - 6, 12, 10);   // couplers
    return Env.cutout(c, { repeat: true, aniso: 8 });
  }
  // stand name boards (white on navy, like 'ABBEY' / 'CLUB' on the scaffold backs): 2 x 16 slots of 512 x 64
  function nameTexture(names) {
    const [c, ctx] = Env.canvas(1024, 1024); ctx.fillStyle = '#14213d'; ctx.fillRect(0, 0, 1024, 1024);
    names.forEach((n, k) => { const x = (k % 2) * 512, y = Math.floor(k / 2) * 64; ctx.fillStyle = '#14213d'; ctx.fillRect(x, y, 512, 64); ctx.fillStyle = '#c8102e'; ctx.fillRect(x, y + 58, 512, 6);
      ctx.fillStyle = '#ffffff'; ctx.font = '800 40px "Titillium Web", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(n.toUpperCase(), x + 256, y + 30, 480); });
    return Env.tex(c, false, 8);
  }

  // ================================================================ build
  V.build = function (E) {
    const sc = E.sc, t = E.t, T0 = performance.now(); const stats = E.stats; const ST = sc.statics;
    // street circuits write the stands into the street world's cells (shared atlas material) instead of the lap-wide statics
    const SKx = t.data.street && EI.StreetKit && EI.StreetKit.World ? EI.StreetKit : null;
    const B = SKx ? new SKx.Batch().mat(0.8, 0.04) : new Env.Builder();     // stands: concrete, seats, cladding, roofs (main layer)
    const M = SKx ? new SKx.Batch().mat(0.42, 0.65) : new Env.Builder();    // steel: columns, roof stays, cladding ribs (main layer, metallic)
    const MD = SKx ? new SKx.Batch().mat(0.45, 0.55) : new Env.Builder();   // fine steel + trim: handrails, under-roof lattice, purlins, lights, rear stairs, step nosings (clutter layer)
    const Sb = SKx ? new SKx.Batch() : null, Fr = SKx ? new SKx.Batch() : null; let seatR = null, sponR = null;
    if (SKx) {
      // seat texture: v 0.5..1 moulded backs (rounded, lighter rim), v 0..0.5 the pans; one seat per 0.5 m along u
      seatR = SKx.Atlas.region('seat', 64, 128, (x2, w, h) => { x2.clearRect(0, 0, w, h); const grad = x2.createLinearGradient(0, 0, 0, 64); grad.addColorStop(0, '#5f8ee0'); grad.addColorStop(0.5, '#2f66c4'); grad.addColorStop(1, '#1d4a99');
        x2.fillStyle = grad; x2.beginPath(); if (x2.roundRect) x2.roundRect(6, 4, 52, 58, 12); else x2.rect(6, 4, 52, 58); x2.fill(); x2.fillStyle = 'rgba(255,255,255,0.18)'; x2.fillRect(10, 8, 44, 5);
        x2.fillStyle = '#2a5cb4'; x2.beginPath(); if (x2.roundRect) x2.roundRect(6, 66, 52, 56, 10); else x2.rect(6, 66, 52, 56); x2.fill(); x2.fillStyle = 'rgba(0,0,0,0.25)'; x2.fillRect(6, 112, 52, 8); },
        (x2, w, h) => { const g2 = x2.createLinearGradient(0, 0, 0, 64); g2.addColorStop(0, 'rgb(170,170,170)'); g2.addColorStop(1, 'rgb(100,100,100)'); x2.fillStyle = g2; x2.fillRect(6, 4, 52, 58); }, null, 'u');
      sponR = SKx.Atlas.region('standSponsor', 1024, 64, (x2, w, h) => { for (let k = 0; k < 8; k++) EI.Ads.paintTile(x2, k, k * 128, 3, 128, 58, 5); }, null, null, 'u');
      Sb.set(seatR, 0.5, 0); Fr.set(sponR, 0.55, 0);
    }
    const H = new Env.Builder();     // hospitality, BRDC clubhouse, sheds (main layer)
    const D = new Env.Builder();     // clutter: light towers, gates, lorries, flag poles (dropped in the distance on low / medium)
    const fronts = [], flags = [], banners = [];
    const crowd = new Env.CellSet([4, 4, 4, 4], 50); const carpet = { p: [], n: [], c: [], uv: [] };
    const conc = C(0xd6d7d3), concDark = C(0xa9aaa6), clad = C(0x3c4654), white = C(0xeef0f2), steel = C(0x9aa0a6), dark = C(0x2a2d33), red = C(0xc8102e), glass = C(0x50657e), roofGrey = C(0xc9ccd0), yellow = C(0xe8c21c), steelDark = C(0x6d737a);
    // ---- grandstand blocks (added runs + the OSM stands)
    const blocks = E.blocks.slice();
    const pr = {};
    const street = !!t.data.street;
    for (const st of street ? [] : t.data.scenery.grandstands) {
      const poly = st.p; if (poly.length < 3) continue; let cx = 0, cz = 0; for (const q of poly) { cx += q[0]; cz += q[1]; } cx /= poly.length; cz /= poly.length;
      t.project(cx, cz, null, pr); if (pr.dist < t.halfWidth + 8) continue; const i = pr.i, side = pr.lat > 0 ? 1 : -1; const tx = t.tx[i], tz = t.tz[i], nx = t.nx[i] * side, nz = t.nz[i] * side;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity; for (const q of poly) { const dx = q[0] - cx, dz = q[1] - cz; const a = dx * tx + dz * tz, b = dx * nx + dz * nz; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
      const len = a1 - a0, depth = Math.min(b1 - b0, 24); if (len < 10 || depth < 5) continue; const rows = U.clamp(Math.floor((depth - 1) / 0.82), 5, 22);
      let fx = cx + tx * (a0 + a1) / 2 + nx * b0, fz = cz + tz * (a0 + a1) / 2 + nz * b0;
      // the block is straight but the lap curves under it: its ends came inside the barriers (Silverstone Village / Copse / Luffield) -
      // slide it out until the whole front clears them (FIT-AUDIT)
      for (let it = 0; it < 3; it++) { let need = 0; for (const u of [-0.5, 0, 0.5]) { t.project(fx + tx * len * u, fz + tz * len * u, null, pr); const own = (pr.lat < 0 ? -1 : 1) === side; need = Math.max(need, E.wallCap(pr.i, side) + 1.5 + (own ? -pr.dist : pr.dist)); } if (need <= 0.05) break; fx += nx * need; fz += nz * need; }
      blocks.push({ cx: fx, cz: fz, ax: tx, az: tz, nx, nz, len, rows, roof: !E.data.sailRoofs, seat: [0x24418f, 0x8c1d24, 0x2b3a55][Math.floor(Math.abs(cx) % 3)], y: E.ground(cx, cz) - 0.4, first: true, last: true, osm: true, name: st.n });
    }
    // spectator colours (sRGB): everyday clothes, a lot of team merchandise
    const teams = EI.TEAMS || [{ primary: '#e10600', secondary: '#ffffff' }];
    const everyday = ['#d8d8d4', '#cfd0cc', '#bfc0bc', '#1a1a1a', '#2a2b2e', '#2a2b2e', '#3b404a', '#4f5560', '#6c717a', '#8b8f98', '#1b2a4a', '#1f2f50', '#2a4a78', '#4a6a92', '#7d8ea4', '#8a1c22', '#a3262b', '#5a1f22', '#1f4d45', '#3c5a3a', '#8a7a4a', '#b39a4a', '#b0652e', '#4a3a5a', '#9a6a7e', '#a8987a', '#6a5440'];
    const REDS = ['#d40000', '#c20a0a', '#e01b1b', '#b00010', '#d8d8d4'];   // block.red (Monza tifosi): share of red shirts
    const merch = teams.map(tm => tm.primary).concat(teams.map(tm => tm.secondary || tm.primary));
    const flagCols = ['#c8102e', '#ffffff', '#012169', '#ffd500', '#ff8000', '#00843d', '#e10600', '#1a73e8'];
    const pick = (r, list) => list[Math.floor(r() * list.length)];
    const lin = (hex) => { const c = C(hex); return [c.r, c.g, c.b]; };
    const SEATED = [[0, 25], [1, 12], [2, 10], [3, 12], [4, 8], [5, 7], [6, 4], [7, 4], [8, 13], [9, 5]], STANDING = [[10, 30], [11, 20], [12, 14], [13, 12], [14, 14], [15, 10]];
    const wpick = (r, list) => { let tot = 0; for (const [, w] of list) tot += w; let x = r() * tot; for (const [k, w] of list) { x -= w; if (x <= 0) return k; } return list[0][0]; };
    const rng = U.rng(777); let seats = 0, people = 0, bi = 0;
    E.standBlocks = blocks;   // circuit dressing built afterwards (the Yas sail canopies) reads the stand frames
    // permanent-venue (non-street, non-desert) stands are temporary scaffold structures like Silverstone's: open galvanised
    // tube-and-clamp frames behind and under the decks (alpha-cut texture, one mesh), scaffold stair towers, a navy name board
    const galv = !street && E.data.kind !== 'desert';
    const SC = new Env.Builder(), NM = new Env.Builder(), names = [], W1 = C(0xffffff);
    const nameSlot = (n) => { if (!n) return -1; let k = names.indexOf(n); if (k < 0 && names.length < 32) { names.push(n); k = names.length - 1; } return k; };
    const cornerName = (s) => { let best = null, bd = 1e9; for (const c of t.data.corners || []) { let d = Math.abs(U.mod(s - c.s, t.length)); d = Math.min(d, t.length - d); if (d < bd) { bd = d; best = c.name; } } return best; };
    // scaffold quad in a block frame, uv in metres / 8 (one texture tile) from the given (u, v) metre coordinates per corner
    const scq = (m, a, b, c, d, ua, ub, uc, ud) => SC.quad(Env.xf(m, a[0], a[1], a[2]), Env.xf(m, b[0], b[1], b[2]), Env.xf(m, c[0], c[1], c[2]), Env.xf(m, d[0], d[1], d[2]), W1, [ua[0] / 8, ua[1] / 8, ub[0] / 8, ub[1] / 8, uc[0] / 8, uc[1] / 8, ud[0] / 8, ud[1] / 8]);
    const scBox = (m, w, h, d, x, z) => { const hw = w / 2, hd = d / 2; const c4 = [[x - hw, z - hd], [x + hw, z - hd], [x + hw, z + hd], [x - hw, z + hd]]; let u = 0;
      for (let k = 0; k < 4; k++) { const p = c4[k], q = c4[(k + 1) % 4]; const l = Math.hypot(q[0] - p[0], q[1] - p[1]); scq(m, [p[0], 0, p[1]], [q[0], 0, q[1]], [q[0], h, q[1]], [p[0], h, p[1]], [u, 0], [u + l, 0], [u + l, h], [u, h]); u += l; } };
    for (const b of blocks) {
      bi++;
      const m = Env.frame(b.cx, b.y, b.cz, b.ax, b.az, b.nx, b.nz); const L = b.len, hl = L / 2, rows = b.rows;
      const seatC = C(b.seat), seatD = C(b.seat).multiplyScalar(0.55), rise = 0.42, tread = 0.82, y0 = 1.4, z0 = 0.4;
      const P = (x, y, z) => Env.xf(m, x, y, z);
      const fwd = (() => { const o = P(0, 0, 0), f = P(0, 0, -1); return [f[0] - o[0], f[2] - o[2]]; })(); const yaw = Math.atan2(fwd[0], fwd[1]);
      const nrmW = (() => { const o = P(0, 0, 0), q = P(0, 0.55, -0.83); return [q[0] - o[0], q[1] - o[1], q[2] - o[2]]; })();
      // front wall + sponsor board, handrail along its top
      B.box(m, L, y0, 0.3, 0, 0, 0.15, conc);
      // a whole number of 5h-long boards, centred (no board is cut at the ends or stretched; f1-BRAND)
      const strip = (yb, h, zz) => { const nb = Math.floor(L / (5 * h)); if (nb < 1) return; const g = new THREE.PlaneGeometry(nb * 5 * h, h); g.rotateY(Math.PI); const suv = g.attributes.uv; const u0 = Math.floor(rng() * 8) / 8; for (let v = 0; v < suv.count; v++) suv.setXY(v, u0 + suv.getX(v) * nb / 8, 0.52 + suv.getY(v) * 0.46); g.translate(0, yb + h / 2, zz); g.applyMatrix4(m); fronts.push(g); };
      strip(0.22, 1.0, -0.02);
      for (let a = -hl + 0.2; a <= hl - 0.1; a += Math.max(2.8, (L - 0.3) / Math.max(1, Math.round((L - 0.3) / 3.3)))) MD.beam(m, [a, y0, 0.12], [a, y0 + 1.0, 0.12], 0.05, steelDark);
      MD.beam(m, [-hl, y0 + 1.0, 0.12], [hl, y0 + 1.0, 0.12], 0.07, steel); MD.beam(m, [-hl, y0 + 0.55, 0.12], [hl, y0 + 0.55, 0.12], 0.04, steelDark);
      // fan banners hung over the front wall
      for (let k = 0; k < (rng() < 0.45 ? 1 : 0) + (rng() < 0.15 ? 1 : 0); k++) { const bw = 2.4 + rng() * 1.6; const ax = (rng() - 0.5) * Math.max(0, L - bw - 1); banners.push([m, ax, bw, Math.floor(rng() * 8), (rng() - 0.5) * 0.06]); }
      // tiers: riser (dark seat backs) + tread (seat colour), aisles every ~14 m with step nosings and a centre handrail
      const aisles = []; for (let a = -hl + 7; a < hl - 4; a += 14) aisles.push(a);
      const roofShade = b.roof ? 0.74 : 0.95;
      // crowd character of this block: fill, a team section, standing patches
      const fill0 = 0.74 + rng() * 0.24; const fill = b.fill != null ? b.fill : fill0; const team = rng() < 0.45 ? teams[Math.floor(rng() * teams.length)] : null; const tsA = -hl + rng() * L * 0.7, tsL = 5 + rng() * 12, tsR = Math.floor(rng() * rows * 0.5);
      for (let r = 0; r < rows; r++) {
        const y = y0 + r * rise, za = z0 + r * tread, zb = za + tread;
        B.quad(P(-hl, y + rise, za), P(hl, y + rise, za), P(hl, y, za), P(-hl, y, za), seatD);
        B.quad(P(-hl, y + rise, za), P(-hl, y + rise, zb), P(hl, y + rise, zb), P(hl, y + rise, za), r % 2 ? seatC : C(b.seat).multiplyScalar(0.85));
        for (const a of aisles) { B.quad(P(a - 0.6, y + rise + 0.01, za), P(a - 0.6, y + rise + 0.01, zb), P(a + 0.6, y + rise + 0.01, zb), P(a + 0.6, y + rise + 0.01, za), concDark); MD.quad(P(a - 0.6, y + rise + 0.015, za), P(a - 0.6, y + rise + 0.015, za + 0.07), P(a + 0.6, y + rise + 0.015, za + 0.07), P(a + 0.6, y + rise + 0.015, za), yellow); }
        // spectators, one record per seat (0.55 m pitch)
        let segA = -hl + 0.15;
        const flushSeg = (a1) => { if (a1 - segA > 1.2) { const A0 = P(segA, y + rise, za + 0.5), A1 = P(a1, y + rise, za + 0.5); const sh = roofShade * (0.9 + rng() * 0.18); const u0 = rng() * 64, u1 = u0 + (a1 - segA) / 35.2; for (const [p0, p1, uu0, uu1] of [[A0, A1, u0, u1]]) { const q = [[p0[0], p0[1], p0[2], uu0, 0], [p1[0], p1[1], p1[2], uu1, 0], [p1[0], p1[1] + 2.2, p1[2], uu1, 1], [p0[0], p0[1] + 2.2, p0[2], uu0, 1]]; for (const k of [0, 1, 2, 0, 2, 3]) { carpet.p.push(q[k][0], q[k][1], q[k][2]); carpet.uv.push(q[k][3], q[k][4]); carpet.n.push(nrmW[0], nrmW[1], nrmW[2]); carpet.c.push(sh, sh, sh); } } } };
        for (const a of aisles) { flushSeg(a - 0.75); segA = a + 0.75; } flushSeg(hl - 0.15);
        for (let a = -hl + 0.45; a < hl - 0.4; a += 0.55) {
          let inAisle = false; for (const q of aisles) if (Math.abs(a - q) < 0.85) inAisle = true; if (inAisle) continue; seats++;
          const w = P(a, y + rise, za + 0.5); const occ = fill * (0.62 + 0.75 * U.noise2(w[0] / 6 + bi * 3.1, w[2] / 6 + r * 0.41));
          if (rng() > occ) continue;
          const inTeam = team && a > tsA && a < tsA + tsL && r >= tsR; const standZone = U.noise2(w[0] / 14 + 40, w[2] / 14 + 7) > 0.7;
          const standing = standZone ? rng() < 0.85 : rng() < 0.035;
          const pose = standing ? wpick(rng, STANDING) : wpick(rng, SEATED);
          const tr = rng(); const shirt = inTeam ? (tr < 0.72 ? team.primary : tr < 0.88 ? (team.secondary || team.primary) : pick(rng, everyday)) : (b.red != null && rng() < b.red) ? pick(rng, REDS) : (tr < 0.2 ? pick(rng, merch) : pick(rng, everyday));
          const acc = pose === 14 || pose === 6 ? (inTeam ? team.primary : pick(rng, flagCols)) : pose === 15 ? (inTeam ? team.primary : pick(rng, merch)) : (inTeam && rng() < 0.6 ? team.primary : pick(rng, rng() < 0.5 ? merch : everyday));
          const mo = (pose === 11 || pose === 12 || pose === 14 || pose === 15) ? (rng() < 0.55 ? 2 : 1) : pose === 6 ? 1 : rng() < 0.02 ? 1 : 0;
          const sv = lin(shirt), av = lin(acc); const shade = roofShade * (0.84 + rng() * 0.22) * (b.roof && r < 2 ? 1.18 : 1);
          const jx = (rng() - 0.5) * 0.1, jz = (rng() - 0.5) * 0.08; const pw = P(a + jx, y + rise, za + 0.5 + jz);
          crowd.push(pw[0], pw[2], [[pw[0], pw[1], pw[2], yaw + (rng() - 0.5) * 0.25], [pose, 0.93 + rng() * 0.13, rng(), mo], [sv[0], sv[1], sv[2], shade], [av[0], av[1], av[2], 0]]); people++;
        }
      }
      for (const a of aisles) { MD.beam(m, [a, y0 + rise + 0.95, z0 + 0.3], [a, y0 + rows * rise + 0.95, z0 + rows * tread - 0.3], 0.05, steel); for (let r = 1; r < rows; r += 4) MD.beam(m, [a, y0 + (r + 1) * rise, z0 + r * tread + 0.4], [a, y0 + (r + 1) * rise + 0.95, z0 + r * tread + 0.4], 0.045, steelDark); }
      const yTop = y0 + rows * rise, zBack = z0 + rows * tread;
      // back wall (both faces), rail band, underside and end panels
      if (!galv) B.quad(P(hl, yTop + 1.2, zBack), P(-hl, yTop + 1.2, zBack), P(-hl, 0, zBack), P(hl, 0, zBack), clad);
      else {
        // navy rear fascia over the top row only; below it the open scaffold: the outer frame, frames 2.5 m / 5 m in (parallax through
        // the bays), the end frames under the deck; the steel deck soffit shows through
        B.quad(P(hl, yTop + 1.2, zBack), P(-hl, yTop + 1.2, zBack), P(-hl, yTop - 0.3, zBack), P(hl, yTop - 0.3, zBack), C(0x1c2740));
        const u0 = Math.floor(rng() * 4) * 2;
        for (const dz of [0, 2.5, 5]) { const z = zBack - dz; if (dz && z < z0 + 2.5) continue; const hz = dz ? y0 + (z - z0) / tread * rise - 0.15 : yTop - 0.3;
          scq(m, [-hl, 0, z], [hl, 0, z], [hl, hz, z], [-hl, hz, z], [u0 - hl, 0], [u0 + hl, 0], [u0 + hl, hz], [u0 - hl, hz]); }
        for (const sx of [-hl + 0.05, hl - 0.05]) scq(m, [sx, 0, 0.35], [sx, 0, zBack], [sx, yTop - 0.3, zBack], [sx, y0, 0.35], [0.35, 0], [zBack, 0], [zBack, yTop - 0.3], [0.35, y0]);
        const nk = L >= 14 ? nameSlot(b.name || cornerName(b.s != null ? b.s : t.project(b.cx, b.cz, null, pr).s)) : -1;
        if (nk >= 0) { const bw = Math.min(9, L - 4), yb = yTop - 0.15, zz = zBack + 0.06, u0n = (nk % 2) * 0.5, v1 = 1 - Math.floor(nk / 2) * 64 / 1024, v0 = v1 - 64 / 1024;
          NM.quad(P(-bw / 2, yb, zz), P(bw / 2, yb, zz), P(bw / 2, yb + 1.15, zz), P(-bw / 2, yb + 1.15, zz), W1, [u0n + 0.004, v0, u0n + 0.496, v0, u0n + 0.496, v1, u0n + 0.004, v1]); }
      }
      B.quad(P(-hl, yTop + 1.2, zBack - 0.02), P(hl, yTop + 1.2, zBack - 0.02), P(hl, yTop, zBack - 0.02), P(-hl, yTop, zBack - 0.02), concDark);
      B.quad(P(-hl, yTop + 0.9, zBack + 0.02), P(hl, yTop + 0.9, zBack + 0.02), P(hl, yTop + 1.25, zBack + 0.02), P(-hl, yTop + 1.25, zBack + 0.02), red);
      B.quad(P(hl, y0, z0), P(hl, yTop, zBack), P(-hl, yTop, zBack), P(-hl, y0, z0), galv ? C(0x565c63) : concDark);
      if (!galv) for (const sx of [-hl, hl]) { const f = sx < 0 ? 1 : -1; const a1 = P(sx, 0, 0), a2 = P(sx, y0, 0), a3 = P(sx, yTop + 1.2, zBack), a4 = P(sx, 0, zBack); if (f > 0) { B.quad(a4, a3, a2, a1, conc); } else B.quad(a1, a2, a3, a4, conc); }
      // sponsor boards along the top of the back wall, facing the track over the crowd
      if (L > 8) strip(yTop + 0.15, 1.0, zBack - 0.06);
      // vertical ribs on the back cladding
      if (!galv) for (let a = -hl + 3; a < hl - 1; a += 6) M.box(m, 0.25, yTop + 1.2, 0.25, a, 0, zBack + 0.14, steel);
      // roof: cantilevered slab on rear columns with back stays, an under-roof lattice girder along the front edge,
      // purlins and a row of lights - all visible from the track
      if (b.roof) {
        const ry = yTop + 4.0, front = -1.6;
        // scaffold venues: a silver sheet roof with a white fascia carrying the stand's name (Club: the green-and-white striped roof)
        const club = galv && /club/i.test(b.name || cornerName(b.s != null ? b.s : t.project(b.cx, b.cz, null, pr).s) || '');
        // Silverstone (F1 photos ref_062 / 063 / 031, 2015-2026): white fabric canopies on dark steel trusses with a deep white valance
        const silC = galv && t.data.id === 'silverstone';
        B.box(m, L + 0.4, 0.32, zBack - front + 1.0, 0, ry, (front + zBack + 1.0) / 2, silC ? C(0xe4e4df) : galv ? C(0x9da4ab) : roofGrey, { top: silC ? C(0xf1f1ec) : galv ? C(0xc3c9cf) : white, bottom: true });
        if (silC && !club) B.box(m, L + 0.44, 0.55, 0.16, 0, ry - 1.0, front - 0.03, C(0xeeeeea));
        if (club) for (let a = -hl; a < hl - 0.1; a += 4) { const a2 = Math.min(hl, a + 2); B.quad(P(a, ry + 0.335, front - 0.2), P(a, ry + 0.335, zBack + 1.2), P(a2, ry + 0.335, zBack + 1.2), P(a2, ry + 0.335, front - 0.2), C(0x0f6b3a)); }
        B.box(m, L + 0.42, 0.8, 0.18, 0, ry - 0.45, front - 0.02, galv ? (club ? C(0x0f6b3a) : C(0xf2f3f3)) : red);
        const nkF = galv && L >= 14 ? nameSlot(b.name || cornerName(b.s != null ? b.s : t.project(b.cx, b.cz, null, pr).s)) : -1;
        if (nkF >= 0) { const bw = Math.min(8, L - 4), u0n = (nkF % 2) * 0.5, v1 = 1 - Math.floor(nkF / 2) * 64 / 1024, v0 = v1 - 64 / 1024, zz = front - 0.2;
          NM.quad(P(bw / 2, ry - 0.82, zz), P(-bw / 2, ry - 0.82, zz), P(-bw / 2, ry + 0.33, zz), P(bw / 2, ry + 0.33, zz), W1, [u0n + 0.004, v0, u0n + 0.496, v0, u0n + 0.496, v1, u0n + 0.004, v1]); }
        if (L > 12 && !galv) strip(ry - 0.85, 0.8, front - 0.14);   // partner ads along the roof fascia
        const span = Math.max(7, L / Math.max(1, Math.round(L / 9)));
        for (let a = -hl + 1; a <= hl - 0.9; a += span) {
          M.box(m, 0.36, ry, 0.36, a, 0, zBack + 0.5, steel);
          M.beam(m, [a, ry - 0.05, zBack + 0.5], [a, ry - 1.4, zBack - 3], 0.16, steel); M.beam(m, [a, ry - 1.4, zBack - 3], [a, ry - 0.1, front + 0.6], 0.14, steel);
          M.beam(m, [a, ry - 1.4, zBack - 3], [a, ry - 0.05, zBack - 3], 0.08, steel);
        }
        const gz = front + 0.7; MD.beam(m, [-hl, ry - 0.12, gz], [hl, ry - 0.12, gz], 0.14, steel); MD.beam(m, [-hl, ry - 1.1, gz], [hl, ry - 1.1, gz], 0.12, steel);
        let up = true; for (let a = -hl; a < hl - 0.1; a += 2.2) { const a2 = Math.min(hl, a + 2.2); MD.beam(m, [a, up ? ry - 1.1 : ry - 0.12, gz], [a2, up ? ry - 0.12 : ry - 1.1, gz], 0.06, steelDark); up = !up; }
        for (const pz of [(front + zBack) * 0.35, (front + zBack) * 0.7]) MD.beam(m, [-hl, ry - 0.2, pz], [hl, ry - 0.2, pz], 0.1, steelDark);
        for (let a = -hl + 3; a < hl - 1; a += 6) { MD.box(m, 0.5, 0.25, 0.3, a, ry - 1.38, gz, dark); MD.box(m, 0.4, 0.05, 0.22, a, ry - 1.42, gz - 0.02, C(0xfff6d8)); }
      }
      // stair towers at the ends of each run, rear stair towers along long runs
      for (const [flag, sx] of [[b.first, -hl - 1.9], [b.last, hl + 1.9]]) {
        if (!flag) continue;
        if (galv) {
          // open scaffold tower: the frame, a stair flight per lift switching back and forth (both faces), a handrail on each
          scBox(m, 3.4, yTop + 2.4, 4.0, sx, zBack - 2.0); const flt = C(0x7f858c);
          let k = 0; for (let y = 0; y < yTop + 0.5; y += 2.2, k++) { const xa = sx + (k % 2 ? 0.1 : -1.5), xb = xa + 1.4, za = zBack - 2 + (k % 2 ? 1.5 : -1.5), zb = zBack - 2 - (k % 2 ? 1.5 : -1.5), y2 = Math.min(yTop + 2.4, y + 2.2);
            const q = [P(xa, y, za), P(xb, y, za), P(xb, y2, zb), P(xa, y2, zb)]; B.quad(q[0], q[1], q[2], q[3], flt); B.quad(q[3], q[2], q[1], q[0], flt);
            MD.beam(m, [k % 2 ? xb : xa, y + 1.0, za], [k % 2 ? xb : xa, y2 + 1.0, zb], 0.05, steel); }
        } else B.box(m, 3.4, yTop + 2.4, 4.0, sx, 0, zBack - 2.0, C(0xb5b8bd));
        for (let y = 2.2; y < yTop + 1; y += 2.2) B.box(m, 3.6, 0.2, 4.2, sx, y, zBack - 2.0, C(0x8e9196));
        if (!galv) B.box(m, 1.2, 2.1, 0.1, sx, 0, zBack + 0.02, dark); B.box(m, 3.6, 0.3, 4.2, sx, yTop + 2.4, zBack - 2.0, white);
      }
      if (!b.first && !b.last && rows >= 10 && bi % 3 === 0 && L > 12) {
        const tz = zBack + 2.0, tw = 3.0; const H2 = yTop + 0.6;
        for (const [px, pz] of [[-tw / 2, tz - 1.4], [tw / 2, tz - 1.4], [-tw / 2, tz + 1.4], [tw / 2, tz + 1.4]]) MD.beam(m, [px, 0, pz], [px, H2 + 1.1, pz], 0.12, steelDark);
        let dir = 1; for (let yy = 0; yy < H2 - 0.5; yy += 2.4) { const y2 = Math.min(H2, yy + 2.4); MD.beam(m, [-dir * tw / 2 * 0.8, yy, tz], [dir * tw / 2 * 0.8, y2, tz], 0.5, C(0x8e9196)); MD.box(m, tw, 0.12, 2.8, 0, y2, tz, C(0x9a9da2)); MD.beam(m, [-tw / 2, y2 + 1.0, tz - 1.4], [tw / 2, y2 + 1.0, tz - 1.4], 0.04, steel); MD.beam(m, [-tw / 2, y2 + 1.0, tz + 1.4], [tw / 2, y2 + 1.0, tz + 1.4], 0.04, steel); dir = -dir; }
      }
      // flag poles behind roofed stands
      if (b.roof && !b.osm) for (let a = -hl + 4; a < hl - 2; a += 12) { D.box(m, 0.12, 9.5, 0.12, a, 0, zBack + 2.4, steel); flags.push([P(a, 8.0, zBack + 2.4), Math.atan2(b.nx, b.nz)]); }
    }
    // ---- street circuit (Monaco): temporary scaffold stands from the data (open, the covered Tribune K, and the pool stands built out
    // over the harbour): a white clad base, aluminium decks with rows of blue plastic seats, tube-and-clamp scaffolding under and
    // behind, mesh rails at the back, stair towers at the ends
    const SS = { p: [], uv: [], n: [], idx: [] };   // seat backs and pans (textured, alpha cut)
    if (street) {
      const seaY = E.seaY != null ? E.seaY : -3.6; const kk = t.smooth(t.k, 10);
      const deck = C(0xb9bec4), riser = C(0x5b6168), base = C(0xf1f2f0), baseD = C(0xd9dbd9), tube = C(0x9ea5ac), tubeD = C(0x737a82), rail = C(0xc2c8cd), roofW = C(0xf4f5f5), orange = C(0xe2771e);
      const seatQuad = Sb ? (a, b, c, d, u0, u1, v0, v1, nrm) => { const W1 = C(0xffffff); Sb.triN(a, b, c, nrm, nrm, nrm, W1, W1, W1, [u0, v0, u1, v0, u1, v1]); Sb.triN(a, c, d, nrm, nrm, nrm, W1, W1, W1, [u0, v0, u1, v1, u0, v1]); } : (a, b, c, d, u0, u1, v0, v1, nrm) => { const k = SS.p.length / 3; for (const q of [a, b, c, d]) SS.p.push(q[0], q[1], q[2]); SS.uv.push(u0, v0, u1, v0, u1, v1, u0, v1); for (let j = 0; j < 4; j++) SS.n.push(nrm[0], nrm[1], nrm[2]); SS.idx.push(k, k + 1, k + 2, k, k + 2, k + 3); };
      for (const st of t.data.scenery.grandstands) {
        if (st.s0 == null) continue; const side = st.side, style = st.style; const span = U.mod(st.s1 - st.s0, t.length);
        const rows = U.clamp(Math.floor((st.depth - 1.6) / 0.85), 6, 26); const rise = 0.46, tread = 0.85; const y0 = style === 'water' ? 1.9 : 2.5, z0 = 0.5;
        const seatHex = st.n === 'T1' ? 0xb3262e : st.n === 'Casino' ? 0x1f3f8f : 0x1d5bb5; const seatC = C(seatHex), seatD = C(seatHex).multiplyScalar(0.6);
        let s = st.s0, first = true; const segs = [];
        while (s < st.s0 + span - 4) {
          const i0 = t.idxAtS(s); const R = 1 / (Math.abs(kk[i0]) + 1e-5); const step = U.clamp(R * 0.28, 9, 22); const sb = Math.min(st.s0 + span, s + step);
          const ia = t.idxAtS(s), ib = t.idxAtS(sb); let wmax = 0; for (let q = s; q <= sb; q += 2) wmax = Math.max(wmax, E.wallCap(t.idxAtS(q), side));
          const d = wmax + st.gap; const inner = (kk[i0] > 0) === (side > 0); if (inner && d > R * 0.8) { s = sb; continue; }
          const A = [t.x[ia] + t.nx[ia] * side * d, t.z[ia] + t.nz[ia] * side * d], Bp = [t.x[ib] + t.nx[ib] * side * d, t.z[ib] + t.nz[ib] * side * d];
          let ax = Bp[0] - A[0], az = Bp[1] - A[1]; const L = Math.hypot(ax, az); if (L < 4) { s = sb; continue; } ax /= L; az /= L; let nx = -az, nz = ax; const im = t.idxAtS((s + sb) / 2);
          if (nx * t.nx[im] * side + nz * t.nz[im] * side < 0) { nx = -nx; nz = -nz; }
          segs.push({ cx: (A[0] + Bp[0]) / 2, cz: (A[1] + Bp[1]) / 2, ax, az, nx, nz, len: L + 0.3, y: t.y[im] - 0.03, first }); first = false; s = sb;
        }
        if (segs.length) segs[segs.length - 1].last = true;
        for (const b of segs) {
          bi++; const m = Env.frame(b.cx, b.y, b.cz, b.ax, b.az, b.nx, b.nz); const L = b.len, hl = L / 2; const P = (x, y, z) => Env.xf(m, x, y, z);
          const fwd = (() => { const o = P(0, 0, 0), f = P(0, 0, -1); return [f[0] - o[0], f[2] - o[2]]; })(); const yaw = Math.atan2(fwd[0], fwd[1]);
          const nrmW = (() => { const o = P(0, 0, 0), q = P(0, 0.55, -0.83); return [q[0] - o[0], q[1] - o[1], q[2] - o[2]]; })();
          const nBack = (() => { const o = P(0, 0, 0), q = P(0, 0.2, -1); const l = Math.hypot(q[0] - o[0], q[1] - o[1], q[2] - o[2]); return [(q[0] - o[0]) / l, (q[1] - o[1]) / l, (q[2] - o[2]) / l]; })();
          const yTop = y0 + rows * rise, zBack = z0 + rows * tread; const yFoot = style === 'water' ? seaY - b.y - 0.5 : 0;
          // base: white clad front wall below the first row (with a sponsor strip), grey underside of the decks
          B.box(m, L, y0, 0.25, 0, 0, 0.12, base); B.quad(P(-hl, y0 - 0.02, 0.26), P(hl, y0 - 0.02, 0.26), P(hl, 0.4, 0.26), P(-hl, 0.4, 0.26), baseD);
          if (style === 'water') for (let a = -hl + 1; a <= hl - 0.5; a += 3) M.box(m, 0.35, -yFoot + 0.4, 0.35, a, yFoot, 0.12, C(0xcfd2d4));
          const strip = (yb, h, zz) => { const nb = Math.floor(L / (5 * h)); if (nb < 1) return; const g = new THREE.PlaneGeometry(nb * 5 * h, h); g.rotateY(Math.PI); const suv = g.attributes.uv; const u0 = Math.floor(rng() * 8) / 8; for (let v = 0; v < suv.count; v++) suv.setXY(v, u0 + suv.getX(v) * nb / 8, Fr ? 0.04 + suv.getY(v) * 0.92 : 0.52 + suv.getY(v) * 0.46); g.translate(0, yb + h / 2, zz); g.applyMatrix4(m); if (Fr) Fr.geo(g, null, C(0xffffff)); else fronts.push(g); };
          strip(y0 - 1.2, 0.9, -0.01);
          // front rail (glass-less tube rail) on the first deck
          MD.beam(m, [-hl, y0 + 1.05, z0 - 0.2], [hl, y0 + 1.05, z0 - 0.2], 0.05, rail); MD.beam(m, [-hl, y0 + 0.55, z0 - 0.2], [hl, y0 + 0.55, z0 - 0.2], 0.035, rail);
          for (let a = -hl + 0.2; a <= hl; a += 1.8) MD.beam(m, [a, y0, z0 - 0.2], [a, y0 + 1.05, z0 - 0.2], 0.04, rail);
          const aisles = []; for (let a = -hl + 6; a < hl - 3; a += 12) aisles.push(a);
          const fill = 0.56 + rng() * 0.24; const team = rng() < 0.4 ? teams[Math.floor(rng() * teams.length)] : null; const tsA = -hl + rng() * L * 0.7, tsL = 5 + rng() * 10, tsR = Math.floor(rng() * rows * 0.5);
          for (let r = 0; r < rows; r++) {
            const y = y0 + r * rise, za = z0 + r * tread, zb = za + tread;
            B.quad(P(-hl, y + rise, za), P(hl, y + rise, za), P(hl, y, za), P(-hl, y, za), riser);
            B.quad(P(-hl, y + rise, za), P(-hl, y + rise, zb), P(hl, y + rise, zb), P(hl, y + rise, za), deck);
            // seats: a pan and a moulded back every 0.5 m (texture), aisles left clear
            let segA = -hl + 0.1; const segs2 = []; for (const a of aisles) { segs2.push([segA, a - 0.6]); segA = a + 0.6; } segs2.push([segA, hl - 0.1]);
            for (const [a0, a1] of segs2) { if (a1 - a0 < 0.6) continue; const u1 = (a1 - a0) / 0.5;
              seatQuad(P(a0, y + rise + 0.03, za + 0.62), P(a1, y + rise + 0.03, za + 0.62), P(a1, y + rise + 0.46, za + 0.72), P(a0, y + rise + 0.46, za + 0.72), 0, u1, 0.5, 1.0, nBack);
              seatQuad(P(a0, y + rise + 0.4, za + 0.3), P(a1, y + rise + 0.4, za + 0.3), P(a1, y + rise + 0.42, za + 0.66), P(a0, y + rise + 0.42, za + 0.66), 0, u1, 0.0, 0.5, [nBack[0] * 0.2, 0.98, nBack[2] * 0.2]); }
            for (const a of aisles) MD.quad(P(a - 0.6, y + rise + 0.012, za), P(a - 0.6, y + rise + 0.012, za + 0.06), P(a + 0.6, y + rise + 0.012, za + 0.06), P(a + 0.6, y + rise + 0.012, za), orange);
            // crowd strips beyond the sprite radius
            let sA = -hl + 0.15; const flushSeg = (a1) => { if (a1 - sA > 1.2) { const A0 = P(sA, y + rise, za + 0.5), A1 = P(a1, y + rise, za + 0.5); const sh = 0.95 * (0.9 + rng() * 0.18); const u0 = rng() * 64, u1 = u0 + (a1 - sA) / 35.2; const q = [[A0[0], A0[1], A0[2], u0, 0], [A1[0], A1[1], A1[2], u1, 0], [A1[0], A1[1] + 2.2, A1[2], u1, 1], [A0[0], A0[1] + 2.2, A0[2], u0, 1]]; for (const k of [0, 1, 2, 0, 2, 3]) { carpet.p.push(q[k][0], q[k][1], q[k][2]); carpet.uv.push(q[k][3], q[k][4]); carpet.n.push(nrmW[0], nrmW[1], nrmW[2]); carpet.c.push(sh, sh, sh); } } };
            for (const a of aisles) { flushSeg(a - 0.75); sA = a + 0.75; } flushSeg(hl - 0.15);
            for (let a = -hl + 0.35; a < hl - 0.3; a += 0.5) {
              let inAisle = false; for (const q of aisles) if (Math.abs(a - q) < 0.8) inAisle = true; if (inAisle) continue; seats++;
              const w = P(a, y + rise, za + 0.5); const occ = fill * (0.62 + 0.75 * U.noise2(w[0] / 6 + bi * 3.1, w[2] / 6 + r * 0.41)); if (rng() > occ) continue;
              const inTeam = team && a > tsA && a < tsA + tsL && r >= tsR; const standZone = U.noise2(w[0] / 14 + 40, w[2] / 14 + 7) > 0.72;
              const standing = standZone ? rng() < 0.85 : rng() < 0.035; const pose = standing ? wpick(rng, STANDING) : wpick(rng, SEATED);
              const tr = rng(); const shirt = inTeam ? (tr < 0.72 ? team.primary : tr < 0.88 ? (team.secondary || team.primary) : pick(rng, everyday)) : (tr < 0.2 ? pick(rng, merch) : pick(rng, everyday));
              const acc = pose === 14 || pose === 6 ? (inTeam ? team.primary : pick(rng, flagCols)) : pose === 15 ? (inTeam ? team.primary : pick(rng, merch)) : (inTeam && rng() < 0.6 ? team.primary : pick(rng, rng() < 0.5 ? merch : everyday));
              const mo = (pose === 11 || pose === 12 || pose === 14 || pose === 15) ? (rng() < 0.55 ? 2 : 1) : pose === 6 ? 1 : rng() < 0.02 ? 1 : 0;
              const sv = lin(shirt), av = lin(acc); const shade = (style === 'covered' ? 0.78 : 0.97) * (0.84 + rng() * 0.22);
              const jx = (rng() - 0.5) * 0.1, jz = (rng() - 0.5) * 0.08; const pw = P(a + jx, y + rise, za + 0.5 + jz);
              crowd.push(pw[0], pw[2], [[pw[0], pw[1], pw[2], yaw + (rng() - 0.5) * 0.25], [pose, 0.93 + rng() * 0.13, rng(), mo], [sv[0], sv[1], sv[2], shade], [av[0], av[1], av[2], 0]]); people++;
            }
          }
          // aisle handrails, the tall mesh rail along the back, side rails
          for (const a of aisles) MD.beam(m, [a, y0 + rise + 0.95, z0 + 0.3], [a, yTop + 0.95, zBack - 0.3], 0.045, rail);
          for (const hh of [1.1, 0.55]) MD.beam(m, [-hl, yTop + hh, zBack - 0.05], [hl, yTop + hh, zBack - 0.05], 0.045, rail);
          for (let a = -hl; a <= hl + 0.01; a += 2.0) MD.beam(m, [a, yTop, zBack - 0.05], [a, yTop + 1.15, zBack - 0.05], 0.04, rail);
          for (const sx of [-hl, hl]) MD.beam(m, [sx, y0 + 1.0, z0], [sx, yTop + 1.0, zBack], 0.045, rail);
          // scaffolding: standards every 2.5 m along and every second row in depth, ledgers at each 2 m lift, braces on the back and the ends
          const nA = Math.max(2, Math.round(L / 2.5)); const xs = []; for (let k = 0; k <= nA; k++) xs.push(-hl + k * L / nA);
          for (let r = 0; r <= rows; r += 2) { const z = z0 + r * tread - 0.1; const yTopR = y0 + r * rise; for (const x of xs) M.beam(m, [x, yFoot, z], [x, yTopR, z], 0.06, tube); for (let lv = 2; lv < yTopR - 0.3; lv += 2) M.beam(m, [-hl, lv, z], [hl, lv, z], 0.045, tubeD); }
          for (const x of xs) for (let lv = 2; lv < yTop - 0.5; lv += 2) MD.beam(m, [x, lv, z0], [x, lv, zBack - 0.1], 0.04, tubeD);
          for (let k = 0; k < nA; k++) { const xa = xs[k], xb = xs[k + 1]; for (let lv = Math.max(0, yFoot); lv < yTop - 1.5; lv += 2) MD.beam(m, [xa, lv, zBack - 0.1], [xb, Math.min(lv + 2, yTop), zBack - 0.1], 0.04, tubeD); }
          M.beam(m, [-hl, yTop, zBack - 0.1], [hl, yTop, zBack - 0.1], 0.07, tube);
          for (const sx of [-hl, hl]) for (let r = 0; r < rows - 1; r += 2) MD.beam(m, [sx, Math.max(yFoot, 0), z0 + r * tread], [sx, y0 + (r + 2) * rise, z0 + (r + 2) * tread], 0.04, tubeD);
          // stair towers at the ends of the run
          for (const [flag, sx] of [[b.first, -hl - 1.6], [b.last, hl + 1.6]]) {
            if (!flag) continue; for (const [px, pz] of [[sx - 1.3, zBack - 3], [sx + 1.3, zBack - 3], [sx - 1.3, zBack], [sx + 1.3, zBack]]) M.beam(m, [px, yFoot, pz], [px, yTop + 1.1, pz], 0.07, tube);
            let dir = 1; for (let yy = 0; yy < yTop - 0.3; yy += 2.3) { const y2 = Math.min(yTop, yy + 2.3); MD.beam(m, [sx - dir * 1.0, yy, zBack - 1.5], [sx + dir * 1.0, y2, zBack - 1.5], 0.55, C(0x8e9196)); B.box(m, 2.7, 0.1, 3.0, sx, y2, zBack - 1.5, deck); dir = -dir; }
          }
          // the covered Tribune K: a light steel roof on tall rear masts with forward ties
          if (style === 'covered') {
            const ry = yTop + 4.2, front = z0 + 1.2; B.box(m, L + 0.2, 0.22, zBack - front + 1.4, 0, ry, (front + zBack + 1.4) / 2, roofW, { top: roofW, bottom: true });
            B.box(m, L + 0.22, 0.5, 0.12, 0, ry - 0.3, front - 0.02, C(0x1d5bb5));
            for (let a = -hl + 1; a <= hl - 0.9; a += Math.max(6, L / Math.max(1, Math.round(L / 8)))) { M.beam(m, [a, yFoot, zBack + 0.6], [a, ry + 2.4, zBack + 0.6], 0.3, tube); M.beam(m, [a, ry + 2.4, zBack + 0.6], [a, ry + 0.1, front + 0.5], 0.06, tubeD); M.beam(m, [a, ry + 2.4, zBack + 0.6], [a, ry + 0.1, (front + zBack) / 2], 0.06, tubeD); }
            if (L > 12) strip(ry - 0.6, 0.6, front - 0.1);
          }
        }
      }
      if (SS.p.length) {
        // seat texture: v 0.5..1 moulded backs (rounded, lighter rim), v 0..0.5 the pans; one seat per 0.5 m along u
        const [c2, x2] = Env.canvas(64, 128); x2.clearRect(0, 0, 64, 128);
        const grad = x2.createLinearGradient(0, 0, 0, 64); grad.addColorStop(0, '#5f8ee0'); grad.addColorStop(0.5, '#2f66c4'); grad.addColorStop(1, '#1d4a99');
        x2.fillStyle = grad; x2.beginPath(); if (x2.roundRect) x2.roundRect(6, 4, 52, 58, 12); else x2.rect(6, 4, 52, 58); x2.fill(); x2.fillStyle = 'rgba(255,255,255,0.18)'; x2.fillRect(10, 8, 44, 5);
        x2.fillStyle = '#2a5cb4'; x2.beginPath(); if (x2.roundRect) x2.roundRect(6, 66, 52, 56, 10); else x2.rect(6, 66, 52, 56); x2.fill(); x2.fillStyle = 'rgba(0,0,0,0.25)'; x2.fillRect(6, 112, 52, 8);
        const stex = Env.cutout(c2, { repeat: true });
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(SS.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(SS.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(SS.uv, 2)); g.setIndex(SS.idx); g.computeBoundingSphere();
        const sm = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: stex, alphaTest: 0.5, roughness: 0.5, metalness: 0, side: THREE.DoubleSide })); sm.name = 'standSeats'; sm.castShadow = true; sm.receiveShadow = true; sc.group.add(sm);
        stats.seatQuads = SS.idx.length / 6;
      }
    }
    stats.standTris = (B.count + M.count) / 3; stats.standDetailTris = MD.count / 3; stats.crowdPeople = people; stats.seats = seats; sc.crowdCount = people;
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
    // ---- BRDC clubhouse (after the photos): a dark glazed ground floor, a teal-glass first floor behind a deep white balcony slab with
    // a glass balustrade, a set-back top floor with a terrace, all under a row of white peaked tensile canopies (the wavy roof), a
    // corner sign tower with the name board and a flag mast flying a union flag. +z points away from the track, x along it.
    if (E.brdc) {
      const b = E.brdc; const y = E.ground(b.cx, b.cz) - 0.05; const m = Env.frame(b.cx, y, b.cz, b.tx, b.tz, b.nx, b.nz); const P = (x, yy, z) => Env.xf(m, x, yy, z);
      const teal = C(0x4f7d84), tealD = C(0x34555c), balu = C(0x9cc2c6), memb = C(0xf7f8f8), membU = C(0xd9dcdd), Wl = 64, hw = Wl / 2;
      const quad2 = (a, b2, c, d, col, colB) => { H.quad(a, b2, c, d, col); H.quad(d, c, b2, a, colB || col); };
      // floors are stadium-shaped in plan (straight front and back, half-round glazed ends: the curved glass of the photos)
      const outline = (L, D, cz) => { const r = D / 2, a = Math.max(0, L / 2 - r), pts = [], N = 8;
        for (let k = 0; k <= N; k++) { const th = -Math.PI / 2 + Math.PI * k / N; pts.push([a + r * Math.cos(th), cz + r * Math.sin(th)]); }
        for (let k = 0; k <= N; k++) { const th = Math.PI / 2 + Math.PI * k / N; pts.push([-a + r * Math.cos(th), cz + r * Math.sin(th)]); } return pts; };
      const wall = (pts, cz, y0w, h, col, both) => { for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2 - cz;
        const A = P(p[0], y0w, p[1]), Bq = P(q[0], y0w, q[1]), Cq = P(q[0], y0w + h, q[1]), Dq = P(p[0], y0w + h, p[1]); const out = -(q[1] - p[1]) * mx + (q[0] - p[0]) * mz >= 0;
        if (both) quad2(A, Bq, Cq, Dq, col); else if (out) H.quad(A, Bq, Cq, Dq, col); else H.quad(Dq, Cq, Bq, A, col); } };
      const cap = (pts, cz, yc, up, col) => { const c = P(0, yc, cz); for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; const cr = (p[1] - cz) * q[0] - p[0] * (q[1] - cz);
        if ((cr > 0) === up) H.tri(c, P(p[0], yc, p[1]), P(q[0], yc, q[1]), col); else H.tri(c, P(q[0], yc, q[1]), P(p[0], yc, p[1]), col); } };
      const mull = (pts, y0w, h, col, step) => { for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; const l = Math.hypot(q[0] - p[0], q[1] - p[1]); const n = Math.max(1, Math.round(l / step));
        for (let k = 0; k < n; k++) { const u = k / n; H.box(m, 0.14, h, 0.14, p[0] + (q[0] - p[0]) * u, y0w, p[1] + (q[1] - p[1]) * u, col); } } };
      const g0 = outline(Wl, 22, 0), gG = outline(Wl + 0.2, 22.2, 0), s1 = outline(Wl + 2, 25.5, -1.6), f1 = outline(Wl - 1, 21, 0), f2 = outline(Wl - 8, 16, 2.5), bal = outline(Wl + 1.6, 25.1, -1.6);
      wall(g0, 0, 0, 4.0, C(0x2f3a44)); wall(gG, 0, 0.5, 2.9, tealD); mull(gG, 0.5, 2.9, C(0xc9ced2), 3);
      for (const ys of [4.0, 7.9]) { wall(s1, -1.6, ys, 0.5, white); cap(s1, -1.6, ys + 0.5, true, white); cap(s1, -1.6, ys, false, white); }
      wall(f1, 0, 4.5, 3.4, teal); mull(f1, 4.5, 3.4, white, 3);
      wall(f2, 2.5, 8.4, 2.8, teal); mull(f2, 8.4, 2.8, white, 3); wall(f2, 2.5, 11.2, 0.4, white); cap(f2, 2.5, 11.6, true, white);
      for (const yb of [4.5, 8.4]) { wall(bal, -1.6, yb, 1.1, balu, true); for (let i = 0; i < bal.length; i++) { const p = bal[i], q = bal[(i + 1) % bal.length]; MD.beam(m, [p[0], yb + 1.12, p[1]], [q[0], yb + 1.12, q[1]], 0.07, white); } }
      // the canopy: eight peaked membranes in a row, each rising to a crown at the mast line, the front edge scalloped between masts
      const nM = 8, mw = (Wl + 4) / nM, x0 = -(Wl + 4) / 2, zf = -15.2, zr = 9.5, NX = 6, NZ = 4;
      const cy = (x, z) => { const u = U.mod((x - x0) / mw, 1), w = Math.min(1, Math.abs(u - 0.5) * 2); const vz = (z - zf) / (zr - zf); const crown = 1 - Math.pow(1 - w, 1.6);
        return 12.9 + 2.6 * crown * (1 - 0.35 * vz) + 0.9 * Math.sin(Math.PI * vz) * (1 - crown * 0.6) - 1.2 * (1 - crown) * (1 - Math.sin(Math.PI * vz)); };
      for (let k = 0; k < nM; k++) for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
        const xa = x0 + (k + i / NX) * mw, xb = x0 + (k + (i + 1) / NX) * mw - (i === NX - 1 ? 0.001 : 0), za = zf + (zr - zf) * j / NZ, zb = zf + (zr - zf) * (j + 1) / NZ;
        const q = [P(xa, cy(xa, za), za), P(xb, cy(xb, za), za), P(xb, cy(xb, zb), zb), P(xa, cy(xa, zb), zb)]; H.quad(q[3], q[2], q[1], q[0], memb); H.quad(q[0], q[1], q[2], q[3], membU);
      }
      for (let k = 0; k <= nM; k++) { const x = x0 + k * mw; for (const z of [zf + 0.4, zr - 0.4]) MD.beam(m, [x, z < 0 ? 8.4 : 11.6, z], [x, cy(x - 0.001, z) + 0.6, z], 0.22, white); }
      // sign tower at the Woodcote end with the name board facing the track, flag mast on the roof
      H.box(m, 3.2, 16.5, 3.2, hw - 3, 0, -10, white); const nk = nameSlot('BRDC');
      if (nk >= 0) { const u0n = (nk % 2) * 0.5, v1 = 1 - Math.floor(nk / 2) * 64 / 1024, v0 = v1 - 64 / 1024; NM.quad(P(hw - 3 + 1.55, 14.2, -11.62), P(hw - 3 - 1.55, 14.2, -11.62), P(hw - 3 - 1.55, 16.0, -11.62), P(hw - 3 + 1.55, 16.0, -11.62), W1, [u0n + 0.33, v0, u0n + 0.67, v0, u0n + 0.67, v1, u0n + 0.33, v1]); }
      const fx = hw - 3, fh = 24; MD.beam(m, [fx, 16.5, -10], [fx, fh, -10], 0.16, white);
      { // union flag (simplified): blue field, white and red saltire, white and red cross; both faces
        const fw = 3.6, fhh = 1.8, fy = fh - 0.2 - fhh, fz = -10, fx0 = fx + 0.1; const F = (x, yy) => P(fx0 + x, fy + yy, fz);
        const rect = (xa, ya, xb, yb, col, dz) => { const a = Env.xf(m, fx0 + xa, fy + ya, fz + dz), b2 = Env.xf(m, fx0 + xb, fy + ya, fz + dz), c = Env.xf(m, fx0 + xb, fy + yb, fz + dz), d = Env.xf(m, fx0 + xa, fy + yb, fz + dz); quad2(a, b2, c, d, col); };
        const band = (xa, ya, xb, yb, wd, col, dz) => { const dx = xb - xa, dy = yb - ya, l = Math.hypot(dx, dy), ox = -dy / l * wd / 2, oy = dx / l * wd / 2;
          quad2(Env.xf(m, fx0 + xa - ox, fy + ya - oy, fz + dz), Env.xf(m, fx0 + xb - ox, fy + yb - oy, fz + dz), Env.xf(m, fx0 + xb + ox, fy + yb + oy, fz + dz), Env.xf(m, fx0 + xa + ox, fy + ya + oy, fz + dz), col); };
        void F; rect(0, 0, fw, fhh, C(0x012169), 0); band(0, 0, fw, fhh, 0.36, white, 0.01); band(0, fhh, fw, 0, 0.36, white, 0.01); band(0, 0, fw, fhh, 0.12, red, 0.02); band(0, fhh, fw, 0, 0.12, red, 0.02);
        rect(0, fhh / 2 - 0.3, fw, fhh / 2 + 0.3, white, 0.03); rect(fw / 2 - 0.3, 0, fw / 2 + 0.3, fhh, white, 0.03); rect(0, fhh / 2 - 0.18, fw, fhh / 2 + 0.18, red, 0.04); rect(fw / 2 - 0.18, 0, fw / 2 + 0.18, fhh, red, 0.04);
      }
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
      for (let k = 0; k < 3; k++) { const tz = Wx / 2 + 14, tx = -Lz / 2 + 14 + k * 7; if (tx > Lz / 2 - 8) break; D.box(m, 2.5, 3.0, 13.6, tx, 1.0, tz + 2, C([0xf2f2f2, 0x2b4c7e, 0xc8102e][k % 3])); D.box(m, 2.4, 2.6, 2.3, tx, 0.6, tz - 6.3, C(0xe8e8e8)); D.box(m, 2.3, 0.9, 12, tx, 0.1, tz + 2, C(0x26282c)); }
    }
    // ---- light towers in the car parks and camp sites (clutter layer)
    for (const p of E.parks.concat(E.camps)) {
      for (const sx of [-0.55, 0.55]) {
        const x = p.cx + p.ax * p.hl * sx, z = p.cz + p.az * p.hl * sx; const y = E.ground(x, z); const m = Env.frame(x, y, z, p.ax, p.az, -p.az, p.ax);
        D.box(m, 0.35, 16, 0.35, 0, 0, 0, C(0x8d9298)); D.box(m, 2.6, 1.0, 0.5, 0, 16, 0, C(0x2a2d31)); D.box(m, 2.4, 0.8, 0.1, 0, 16.1, 0.26, C(0xf4f1e2)); D.box(m, 1.2, 0.8, 0.8, 0, 0, 0, C(0xa0a39f));
      }
    }
    // ---- gates: two pillars, a banner beam and a ticket booth
    E.gates.forEach((g, k) => {
      const L = Math.hypot(g.tx, g.tz) || 1; const tx = g.tx / L, tz = g.tz / L; const y = E.ground(g.x, g.z); const m = Env.frame(g.x, y, g.z, tx, tz, -tz, tx);
      for (const sx of [-6.5, 6.5]) { D.box(m, 1.0, 6.2, 1.0, sx, 0, 0, C(0x2a2d33)); }
      D.box(m, 14, 1.6, 0.6, 0, 5.0, 0, C(k % 2 ? 0xc8102e : 0x0b3d2e)); D.box(m, 14.1, 0.25, 0.65, 0, 6.6, 0, white);
      D.box(m, 3, 2.6, 2.4, 9.5, 0, 0, C(0xe9eaea)); D.box(m, 3.1, 0.9, 2.5, 9.5, 1.1, 0, glass); D.box(m, 3.6, 0.25, 3.0, 9.5, 2.6, 0, C(0xc8102e));
    });
    if (SKx) { const W = SKx.world(sc); W.add(B, 'main'); W.add(M, 'detail'); W.add(MD, 'fine'); W.add(Sb, 'main'); W.add(Fr, 'detail'); stats.seatQuads = Sb.count / 6; }
    else { ST.add(B.geometry(), 0.8, 0.04, 'main'); ST.add(M.geometry(), 0.42, 0.65, 'main'); ST.add(MD.geometry(), 0.45, 0.55, 'clutter'); }
    if (H.count) { ST.add(H.geometry(), 0.6, 0.08, 'main'); stats.venueTris = H.count / 3; }
    if (D.count) ST.add(D.geometry(), 0.55, 0.25, 'clutter');
    // sponsor boards (top half of the atlas) and fan banners (bottom half) share one textured mesh
    for (const [m, ax, bw, k, tilt] of banners) { const g = new THREE.PlaneGeometry(bw, 1.15, 4, 1); g.rotateY(Math.PI); const uv = g.attributes.uv, pp = g.attributes.position; for (let v = 0; v < uv.count; v++) { uv.setXY(v, (k + 0.02 + uv.getX(v) * 0.96) / 8, 0.02 + uv.getY(v) * 0.46); pp.setZ(v, pp.getZ(v) - 0.05 - Math.sin(uv.getX(v) * 8 * Math.PI) * 0.02); } g.rotateZ(tilt); g.translate(ax, 0.2 + 0.575 + 0.05, -0.08); g.applyMatrix4(m); fronts.push(g); }
    if (SC.count) {
      // alpha-cut scaffold: alpha sharpened per pixel and lifted with the mip level so the thin tubes keep their coverage far away
      const sm = new THREE.MeshStandardMaterial({ map: scaffoldTexture(), vertexColors: true, alphaTest: 0.5, roughness: 0.42, metalness: 0.55, side: THREE.DoubleSide });
      sm.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', [
        '#ifdef USE_MAP', 'vec2 tdx = dFdx(vUv * 512.0), tdy = dFdy(vUv * 512.0); float tlod = max(0.0, 0.5 * log2(max(dot(tdx, tdx), dot(tdy, tdy))));', 'diffuseColor.a = min(1.0, diffuseColor.a * (1.0 + 0.45 * tlod));', '#endif',
        'diffuseColor.a = clamp((diffuseColor.a - 0.5) / max(fwidth(diffuseColor.a), 0.0001) + 0.5, 0.0, 1.0);', 'if (diffuseColor.a < 0.5) discard;'].join('\n')); };
      sm.extensions = { derivatives: true }; sm.customProgramCacheKey = () => 'venue-scaffold';
      const smesh = new THREE.Mesh(SC.geometry(), sm); smesh.name = 'standScaffold'; sc.group.add(smesh); stats.scaffoldTris = SC.count / 3;
    }
    if (NM.count) { const nmesh = new THREE.Mesh(NM.geometry(), new THREE.MeshStandardMaterial({ map: nameTexture(names), roughness: 0.6, metalness: 0.05 })); nmesh.name = 'standNames'; sc.group.add(nmesh); }
    if (fronts.length) { const fm = new THREE.Mesh(Env.merge(fronts), new THREE.MeshStandardMaterial({ map: sponsorTexture(), roughness: 0.55, side: THREE.DoubleSide })); fm.name = 'standBoards'; sc.group.add(fm); }
    V.crowd(E, crowd.finalize(), carpet); V.flags(E, flags);
    V.roads(E); V.fence(E); V.cars(E); V.camps(E);
    E.timings.venue = Math.round(performance.now() - T0);
  };

  // ---- crowd: per-spectator sprites near the eye (16 poses, own shirt / cap / skin / hair colours, a few bobbing and swaying),
  // a painted crowd strip on each row beyond (the two meet exactly at uLod.x, per spectator / per pixel)
  V.crowd = function (E, set, carpet) {
    const sc = E.sc; if (!set.n) return; const atlas = crowdAtlas(); const N = set.n;
    const uni = { uEye: { value: new THREE.Vector3() }, uLod: { value: new THREE.Vector2(400, 1e5) }, uTime: { value: 0 }, uThin: { value: 0 } };
    const L3 = (hex) => { const c = C(hex); return 'vec3(' + c.r.toFixed(4) + ',' + c.g.toFixed(4) + ',' + c.b.toFixed(4) + ')'; };
    const head = '#include <common>\nattribute vec4 cP;\nattribute vec4 cD;\nattribute vec4 cS;\nattribute vec4 cA;\nuniform vec3 uEye;\nuniform vec2 uLod;\nuniform float uThin;\nuniform float uTime;\nvarying vec3 vShirt;\nvarying vec3 vAcc;\nvarying vec3 vSkin;\nvarying vec3 vHair;\nvarying float vShade;\n';
    const place = [
      'vec2 fd = vec2(sin(cP.w), cos(cP.w)); vec2 tc = cameraPosition.xz - cP.xz; float tl = length(tc); vec2 td = tl > 0.01 ? tc / tl : fd;',
      'float ang = clamp(atan(fd.x * td.y - fd.y * td.x, dot(fd, td)), -0.7, 0.7); vec2 f2 = vec2(fd.x * cos(ang) - fd.y * sin(ang), fd.x * sin(ang) + fd.y * cos(ang));',
      'vec3 crt = vec3(f2.y, 0.0, -f2.x);'].join('\n');
    const body = [
      'float ph = cD.z * 6.283; float bob = cD.w > 1.5 ? max(0.0, sin(uTime * (6.0 + cD.z * 3.0) + ph)) * 0.07 : 0.0;',
      'vec3 transformed = cP.xyz + crt * position.x * 0.8 * cD.y + vec3(0.0, position.y * 2.0 * cD.y + bob, 0.0);',
      'if (cD.w > 0.5) transformed += crt * sin(uTime * 2.2 + ph) * 0.05 * position.y;',
      'if (distance(cP.xz, uEye.xz) >= uLod.x) transformed = cP.xyz;',
      // Low (PERF-2): every other spectator beyond uThin steps aside for the painted carpet, which starts there instead of at uLod.x
      'if (uThin > 0.0 && fract(cD.z * 5.31) >= 0.5 && distance(cP.xz, uEye.xz) >= uThin) transformed = cP.xyz;'].join('\n');
    const uvc = '#include <uv_vertex>\n#ifdef USE_UV\nfloat cc = cD.x; float ccol = mod(cc, 4.0), crow = floor(cc / 4.0 + 0.01);\nvUv = vec2((ccol + 0.01 + uv.x * 0.98) * 0.125, 1.0 - (crow + 1.0 - (0.004 + uv.y * 0.992)) * 0.25);\n#endif';
    const patch = (sh, depth) => {
      Object.assign(sh.uniforms, uni);
      let vs = sh.vertexShader.replace('#include <common>', head).replace('#include <uv_vertex>', uvc);
      if (depth) vs = vs.replace('#include <begin_vertex>', place + '\n' + body + '\nif (distance(cP.xz, uEye.xz) > 160.0) transformed = cP.xyz;');
      else vs = vs.replace('#include <beginnormal_vertex>', place + '\nvec3 objectNormal = normalize(vec3(f2.x, 0.0, f2.y) * 0.83 + vec3(0.0, 0.55, 0.0));').replace('#include <begin_vertex>', body + [
        '\nvShirt = cS.rgb; vAcc = cA.rgb; vShade = cS.w; float h1 = fract(cD.z * 7.31), h2 = fract(cD.z * 13.7);',
        'vSkin = (h1 < 0.5 ? ' + L3('#efc6a4') + ' : h1 < 0.75 ? ' + L3('#d9a47e') + ' : h1 < 0.88 ? ' + L3('#a86f4c') + ' : ' + L3('#6e4630') + ');',
        'vHair = (h2 < 0.3 ? ' + L3('#3a2a1c') + ' : h2 < 0.5 ? ' + L3('#1c1612') + ' : h2 < 0.66 ? ' + L3('#6b4a2e') + ' : h2 < 0.8 ? ' + L3('#c9a466') + ' : h2 < 0.92 ? ' + L3('#8a8a86') + ' : ' + L3('#8c4a2a') + ');'].join('\n'));
      sh.vertexShader = vs;
      if (!depth) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vShirt;\nvarying vec3 vAcc;\nvarying vec3 vSkin;\nvarying vec3 vHair;\nvarying float vShade;').replace('#include <map_fragment>', [
        'vec4 texelColor = mapTexelToLinear(texture2D(map, vUv)); vec4 mk = texture2D(map, vUv + vec2(0.5, 0.0));',
        'float skinW = smoothstep(0.62, 0.9, mk.b); float hairW = clamp(smoothstep(0.08, 0.2, mk.b) - skinW, 0.0, 1.0);',
        'vec3 cc = texelColor.rgb * mix(vec3(1.0), vShirt * 2.05, mk.r) * mix(vec3(1.0), vAcc * 2.05, mk.g) * mix(vec3(1.0), vSkin * 2.05, skinW) * mix(vec3(1.0), vHair * 2.05, hairW);',
        'diffuseColor *= vec4(cc * vShade, texelColor.a);'].join('\n'));
    };
    const base = new THREE.PlaneGeometry(1, 1); base.translate(0, 0.5, 0);
    const [g, attrs] = Env.instGeo(base, ['cP', 'cD', 'cS', 'cA'], N);
    const mat = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.5, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }); mat.onBeforeCompile = (sh) => patch(sh, false); mat.customProgramCacheKey = () => 'crowd-sprites';
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas, alphaTest: 0.5 }); depth.onBeforeCompile = (sh) => patch(sh, true); depth.customProgramCacheKey = () => 'crowd-sprites-depth';
    const inst = new THREE.Mesh(g, mat); inst.frustumCulled = false; inst.customDepthMaterial = depth; inst.castShadow = false; inst.name = 'crowd'; sc.group.add(inst);
    // distant crowd strips
    let cm = null;
    if (carpet.p.length) {
      const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(carpet.p, 3)); cg.setAttribute('normal', new THREE.Float32BufferAttribute(carpet.n, 3)); cg.setAttribute('color', new THREE.Float32BufferAttribute(carpet.c, 3)); cg.setAttribute('uv', new THREE.Float32BufferAttribute(carpet.uv, 2)); cg.computeBoundingSphere();
      const shirts = ['#f2f2f2', '#e6e6e6', '#1a1a1a', '#2a2b2e', '#3b404a', '#5c6370', '#1b2a4a', '#24467e', '#2b5ba8', '#b8141c', '#c81010', '#0d5e52', '#e0c341', '#ff8000', '#c9b28a', '#9aa7b8'].concat((EI.TEAMS || []).map(tm => tm.primary));
      const cmat = new THREE.MeshStandardMaterial({ map: crowdCarpetTexture(shirts), vertexColors: true, alphaTest: 0.5, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
      cmat.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, uni); sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = position;'); sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nuniform vec3 uEye;\nuniform vec2 uLod;\nuniform float uThin;').replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nfloat dC = distance(vWP.xz, uEye.xz); if (dC < (uThin > 0.0 ? min(uThin, uLod.x) : uLod.x) || dC > uLod.y) discard;'); };
      cmat.customProgramCacheKey = () => 'crowd-carpet';
      cm = new THREE.Mesh(cg, cmat); cm.name = 'crowdFar'; sc.group.add(cm); E.stats.crowdCarpetTris = carpet.p.length / 9;
    }
    const setCount = (n) => { g.instanceCount = n; inst.visible = n > 0; };
    const dyn = new Env.DynSet(set, attrs, setCount, 30);
    // Low tier crowd LOD (PERF-2, wave 9: Foro Sol drew ~18-21k sprites on Low): the set is split in two halves by the spectator's hash
    // (A = shown out to the sprite range, B = only within LOW_THIN, the shader drops B beyond it and the carpet fills in from there), and
    // cells more than LOW_NEAR away outside +-LOW_ANG of every camera's view are not gathered (Low mirrors hide the scenery group).
    // Regathered after a 30 m move or a LOW_TURN turn of any camera. Medium / High keep the plain DynSet above.
    const LOW_THIN = 60, LOW_NEAR = 40, LOW_ANG = 80 * Math.PI / 180, LOW_TURN = Math.cos(24 * Math.PI / 180);
    let halves = null; const lowCam = []; const _cd = new THREE.Vector3();
    const splitHalves = () => {
      const st = set.strides, A = new Env.CellSet(st, set.cell), B = new Env.CellSet(st, set.cell), D = set.data;
      for (let j = 0; j < set.n; j++) { const recs = st.map((s, k) => D[k].subarray(j * s, (j + 1) * s)); ((D[1][j * 4 + 2] * 5.31) % 1 >= 0.5 ? B : A).push(D[0][j * 4], D[0][j * 4 + 2], recs); }
      return [A.n ? A.finalize() : null, B.n ? B.finalize() : null];
    };
    const gatherCone = (S, r1, eyes, dirs, n0) => {
      if (!S) return 0; const h = S.cell * 0.7072, st = S.strides, cap = attrs[0].array.length / st[0]; let n = n0;
      for (const c of S.cells) {
        let take = false;
        for (let k = 0; k < eyes.length && !take; k++) { const dx = c.x - eyes[k][0], dz = c.z - eyes[k][1], d = Math.hypot(dx, dz); if (d - h > r1) continue; const f = dirs[k];
          if (d - h < LOW_NEAR || !f) { take = true; break; } take = (dx * f[0] + dz * f[1]) / d >= Math.cos(Math.min(Math.PI, LOW_ANG + Math.asin(Math.min(1, h / d)))); }
        if (!take || n + c.count > cap) continue;
        for (let k = 0; k < st.length; k++) attrs[k].array.set(S.data[k].subarray(c.start * st[k], (c.start + c.count) * st[k]), n * st[k]);
        n += c.count;
      }
      return n - n0;
    };
    const low = { last: null, dirs: null, r1: 0, n: 0,
      update(x, z) {
        const eyes = EI.Env.eyes ? EI.Env.eyes.map(e => [e[0], e[1]]) : [[x, z]]; const cams = (EI.debug && EI.debug.cameras) || [];
        const dirs = eyes.map((e, k) => { const cam = cams[k] || cams[0]; if (!cam) return null; cam.getWorldDirection(_cd); const l = Math.hypot(_cd.x, _cd.z); return l > 0.2 ? [_cd.x / l, _cd.z / l] : null; });
        const L = this.last, D0 = this.dirs;
        const still = L && L.length === eyes.length && eyes.every((e, k) => Math.hypot(e[0] - L[k][0], e[1] - L[k][1]) < 30) &&
          dirs.every((f, k) => { const o = D0[k]; return (!f && !o) || (f && o && f[0] * o[0] + f[1] * o[1] > LOW_TURN); });
        if (still) return false;
        if (!halves) halves = splitHalves();
        this.last = eyes; this.dirs = dirs;
        const na = this.r1 > 0 ? gatherCone(halves[0], this.r1, eyes, dirs, 0) : 0, nb = this.r1 > 0 ? gatherCone(halves[1], Math.min(this.r1, LOW_THIN + 40), eyes, dirs, na) : 0;
        const n = na + nb; for (const a of attrs) { a.updateRange.offset = 0; a.updateRange.count = Math.max(1, n * 4); a.needsUpdate = true; }
        this.n = n; setCount(n); return true;
      } };
    sc.crowdLod = {
      inst, carpet: cm, uni,
      setRange(spriteR, farR) { uni.uLod.value.set(spriteR, farR); dyn.range(0, spriteR + 40); if (cm) cm.visible = farR > spriteR; const lw = EI.quality === 'low'; uni.uThin.value = lw ? LOW_THIN : 0; low.r1 = spriteR + 40; low.last = null; this.lowOn = lw; if (!lw) dyn.last = null; },
      update(dt, x, z) { uni.uEye.value.set(x, 0, z); uni.uTime.value += dt; if (this.lowOn) low.update(x, z); else dyn.update(x, z); },
      get count() { return this.lowOn ? low.n : dyn.n; },
    };
    sc.crowdLod.setRange(400, 1e5);
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
    // posts (every other fence vertex, ~6.4 m) go to the clutter layer of the static chunks
    const PB = new Env.Builder(), I4 = new THREE.Matrix4(), pc = C(0x3a4a3e); posts.forEach((p, k) => { if (k % 2) return; PB.beam(I4, [p[0], p[1] - 0.1, p[2]], [p[0], p[1] + 2.5, p[2]], 0.08, pc); });
    sc.statics.add(PB.geometry(), 0.6, 0.4, 'clutter');
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
    // cell-sorted so the low / medium tiers only draw the car parks near the eye
    const set = new Env.CellSet([16, 3], 80);
    list.forEach((c) => {
      const [x, z, yaw] = c; const y = E.ground(x, z); const hx = E.ground(x + 1.5, z) - E.ground(x - 1.5, z), hz = E.ground(x, z + 1.5) - E.ground(x, z - 1.5); nrm.set(-hx / 3, 1, -hz / 3).normalize();
      q.setFromAxisAngle(up, yaw); q2.setFromUnitVectors(up, nrm); q.premultiply(q2); p.set(x, y, z); m.compose(p, q, s);
      col.setHex(pal[Math.floor(rng() * pal.length)]).convertSRGBToLinear(); set.push(x, z, [m.elements, [col.r, col.g, col.b]]);
    });
    set.finalize(); inst.setColorAt(0, col); inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage); inst.instanceColor.setUsage(THREE.DynamicDrawUsage);
    inst.frustumCulled = false; inst.receiveShadow = true; inst.name = 'parkedCars'; sc.group.add(inst);
    const dyn = new Env.DynSet(set, [inst.instanceMatrix, inst.instanceColor], (n) => { inst.count = n; inst.visible = n > 0; }, 60);
    sc.parkedCars = { inst, dyn }; dyn.range(0, 1e5);
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
      const inst = new THREE.InstancedMesh(bld.geometry(), sc.tentMat || (sc.tentMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide })), list.length); const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
      const set = new Env.CellSet([16, 3], 80);
      list.forEach((tn) => { p.set(tn[0], E.ground(tn[0], tn[1]) - 0.02, tn[1]); q.setFromAxisAngle(up, tn[2]); s.set(tn[4], tn[4], tn[4]); m.compose(p, q, s); col.setHex(tcols[Math.floor(rng() * tcols.length)]).convertSRGBToLinear(); set.push(tn[0], tn[1], [m.elements, [col.r, col.g, col.b]]); });
      set.finalize(); inst.setColorAt(0, col); inst.frustumCulled = false; inst.name = 'tents'; sc.group.add(inst);
      const dyn = new Env.DynSet(set, [inst.instanceMatrix, inst.instanceColor], (n) => { inst.count = n; inst.visible = n > 0; }, 60); dyn.range(0, 1e5);
      (sc.tents = sc.tents || []).push({ inst, dyn });
    });
    if (vans.count) sc.statics.add(vans.geometry(), 0.55, 0.1, 'clutter');
    E.stats.tents = tents.length;
  };
  function campervan(B, m, color) {
    const white = C(0xf3f3f0), glass = C(0x3b4a5a), tyre = C(0x232426);
    B.box(m, 6.2, 2.1, 2.3, 0, 0.7, 0, white); B.box(m, 2.2, 1.6, 2.2, 2.6, 0.5, 0, white); B.box(m, 6.24, 0.5, 2.34, 0, 1.5, 0, color);
    B.box(m, 0.3, 0.8, 2.0, 3.6, 1.2, 0, glass); B.box(m, 1.8, 0.6, 2.34, -1.5, 2.0, 0, glass); B.box(m, 5.8, 0.4, 2.0, 0, 0.1, 0, tyre);
  }

  EI.EnvVenue = V;
})();
