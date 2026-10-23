// Equation I - the Ardennes forest at Spa-Francorchamps (SPA-STITCH). Replaces Veg.build's generic woodland loop when the forest ground is on
// (E.forestOn, js/env_forest.js): trees are planted from the ground-cover rasters (4 m satellite colour classes over the lap, 16 m OSM landuse
// beyond), dense along every forest edge (the walls behind the barriers, the Kemmel tunnel), sparse inside (a canopy from above; beyond ~60 m
// into the wood the tree-line strips and the crown mosaic of the field map carry it), lone trees and clumps on the Fagnes / Campus fen and
// pasture. Species per stand from the canopy colour class (spruce dark / beech lighter) nudged by the sector table (SPEC 4.14); Norway spruce
// is the atlas' poplar column on this ground (no texture growth). One record list -> Veg.instance (one near + one far draw, shared atlas),
// forest-edge contours -> E.innerStrips (Low / Medium beyond the billboard range). Also the Eau Rouge brook: a thin water ribbon on the ground.
window.EI = window.EI || {};
(function () {
  const U = EI.U, Env = EI.Env;
  const SF = {}; EI.SpaForest = SF;
  // ground options for js/env_forest.js (SPA-UPGRADE, PERF): the coarse terrain ring in 2 halves (north / south) instead of 4 strips, as COTA / Mexico:
  // 6 terrain tiles instead of 8 (the Medium Pouhon cockpit view drew 165 calls at the 165 cap)
  SF.ground = { ringHalves: true };
  // sectors (SPEC 4.14): [from turn, ds, to turn, ds, conifer share] - turn-in s from EI.TRACKS.spa.corners by turn number t
  const SECTORS = [[18, -250, 1, -350, 0.5], [1, -350, 2, 100, 0.4], [2, 100, 4, 130, 0.75], [4, 130, 5, -50, 0.7], [5, -50, 8, 0, 0.45],
    [8, 0, 10, -70, 0.75], [10, -70, 12, -200, 0.7], [12, -200, 16, -300, 0.25], [16, -300, 18, -250, 0.6]];
  SF.SECTORS = SECTORS;
  // per-instance colour multipliers (Veg.instance record [8]): Norway spruce cool blue-green, beech a deep green, the understory between
  // (SPA-UPGRADE: a step darker - the F1 photos spa_eau_rouge_aerial_crowd_trees / spa_valley_hillside_view show near-black spruce walls and deep beech,
  // the sunlit broadleaf crowns read lime in the Low shots)
  const SPRUCE_C = [0.7, 0.85, 0.95], BEECH_C = [0.66, 0.75, 0.62], SHRUB_C = [0.82, 0.9, 0.82];

  // the lap's open breather (SPEC 4.8 / BEAUTY): Stavelot - Paul Frere on the OUTSIDE of the bends, 75 m of pasture behind the barrier with a few lone
  // trees (canopy cells of the 4 m cover there become pasture, so the field map and the planting agree)
  const OPEN = [[12, -200, 16, -300, 75]];
  SF.openWindows = function (E) {
    const t = E.t, G = E.fcov; if (!G) return; const cs = (k) => { const c = (t.data.corners || []).find(q => q.t === k); return c ? c.s : null; }; const pr = {}; let n = 0;
    for (const [a, da, b, db, W] of OPEN) {
      const s0 = cs(a), s1 = cs(b); if (s0 == null || s1 == null) continue; const A = U.mod(s0 + da, t.length), B = U.mod(s1 + db, t.length);
      const inS = (s) => (A <= B ? s >= A && s < B : s >= A || s < B);
      let kSum = 0; for (let s = A; inS(s) && s < A + t.length; s += 4) { kSum += t.kFold[t.idxAtS(s)]; if (s - A > 4000) break; }
      const outSide = kSum > 0 ? -1 : 1;   // (k > 0 bends towards +lat: the outside is -lat)
      for (let j = 0; j < G.nz; j++) for (let i = 0; i < G.nx; i++) {
        const k = j * G.nx + i; if (G.cls[k] > 1) continue; const x = G.x0 + (i + 0.5) * G.cell, z = G.z0 + (j + 0.5) * G.cell;
        if (E.fsAt(x, z) > W) continue; t.project(x, z, null, pr); if (!inS(pr.s) || (pr.lat < 0 ? -1 : 1) !== outSide) continue;
        if (Env.hash2(i, j, 71) < 0.03) continue; G.cls[k] = 2; n++;
      }
    }
    E.stats.openCells = n;
  };
  SF.build = function (E, Veg) {
    const T0 = performance.now(); const t = E.t, sc = E.sc, SP = Veg.SP, OCC = Env.OCC, rng = U.rng(2026); const trees = [];
    const cs = (k) => { const c = (t.data.corners || []).find(q => q.t === k); return c ? c.s : null; };
    const sect = []; for (const [a, da, b, db, con] of SECTORS) { const s0 = cs(a), s1 = cs(b); if (s0 == null || s1 == null) continue; sect.push([U.mod(s0 + da, t.length), U.mod(s1 + db, t.length), con]); }
    const conAt = (s) => { for (const [a, b, c] of sect) if (a <= b ? s >= a && s < b : s >= a || s < b) return c; return 0.55; };
    const BLOCK = OCC.ROAD | OCC.BUILT | OCC.PARK | OCC.WATER | OCC.KEEP;
    const VW = E.forestVergeW(), fp = {};
    // never in the corridor, not on the outer edge of the draped verge (its last step floats up to 0.25 m over the terrain mesh)
    const free = (x, z, r) => { if (E.occAt(x, z) & BLOCK) return false; if (E.fsAt(x, z) < r + 2.5 || !E.clearOfTrack(x, z, r + 2.5)) return false; t.project(x, z, null, fp); const sd = fp.lat < 0 ? -1 : 1; const e = fp.dist - E.wallCap(fp.i, sd) - VW[sd < 0 ? 0 : 1][fp.i]; return e < -1.2 || e > 1.2; };
    // ---- edge distance (metres to the nearest open cell) on the 4 m raster: two-pass chamfer
    const G = E.fcov, nx = G.nx, nz = G.nz, cl = G.cls; const ed = new Float32Array(nx * nz);
    for (let k = 0; k < nx * nz; k++) ed[k] = cl[k] <= 1 ? 1e4 : 0;
    const A = G.cell, B = G.cell * 1.4142;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (!ed[k]) continue; let v = ed[k]; if (i > 0) v = Math.min(v, ed[k - 1] + A); if (j > 0) { v = Math.min(v, ed[k - nx] + A); if (i > 0) v = Math.min(v, ed[k - nx - 1] + B); if (i < nx - 1) v = Math.min(v, ed[k - nx + 1] + B); } ed[k] = v; }
    for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const k = j * nx + i; if (!ed[k]) continue; let v = ed[k]; if (i < nx - 1) v = Math.min(v, ed[k + 1] + A); if (j < nz - 1) { v = Math.min(v, ed[k + nx] + A); if (i < nx - 1) v = Math.min(v, ed[k + nx + 1] + B); if (i > 0) v = Math.min(v, ed[k + nx - 1] + B); } ed[k] = v; }
    // the track corridor counts as open: the walls face the circuit (cells inside the barriers are paved / gravel classes anyway)
    const pr = {};
    const spruce = (x, z, big) => [SP.POPLAR, 6.2 + rng() * 2.6, (big ? 25 : 23) + rng() * 7];
    const beech = (x, z) => { const s = 0.85 + rng() * 0.3; return [SP.OAK, 12 * s, 20 * s + rng() * 3]; };
    let nEdge = 0, nIn = 0, nShrub = 0, nOpen = 0;
    const plant = (x, z, conif, edge, fs) => {
      const [sp, w, h] = conif ? spruce(x, z, !edge) : beech(x, z); if (!free(x, z, w * 0.5)) return false;
      trees.push([x, z, sp, w, h, rng() < 0.5 ? 0 : 1, conif ? -0.85 + rng() * 0.35 : -0.6 + rng() * 0.3, edge ? 0 : 1, conif ? SPRUCE_C : BEECH_C]); if (edge) nEdge++; else nIn++; return true;
    };
    // ---- 4 m raster: jittered 4.5 m lattice over the canopy
    const ST = 4.6; const x0 = G.x0, z0 = G.z0, X1 = G.x0 + nx * A, Z1 = G.z0 + nz * A;
    for (let z = z0 + 2; z < Z1; z += ST) for (let x = x0 + 2 + ((Math.round(z / ST) & 1) ? ST / 2 : 0); x < X1; x += ST) {
      const px = x + (rng() - 0.5) * ST * 0.8, pz = z + (rng() - 0.5) * ST * 0.8; const i = Math.floor((px - x0) / A), j = Math.floor((pz - z0) / A); if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
      const k = j * nx + i, c = cl[k]; const fs = E.fsAt(px, pz); if (fs < 3) continue;
      if (c <= 1) {
        const de = ed[k]; const near = fs < 260;
        const p = de <= 9 ? (near ? 1 : fs < 600 ? 0.55 : 0.3) : de <= 22 ? (near ? 0.55 : 0.15) : fs < 110 ? 0.3 : fs < 320 ? 0.07 : 0.02;   // (deep interior: the crown mosaic + strips carry it; PERF far-billboard budget)
        if (rng() > p) continue;
        t.project(px, pz, null, pr); const con = conAt(pr.s); const conif = c === 0 ? rng() < 0.75 + 0.25 * con : rng() < con * 0.7;   // (SPEC v2 4.11: spruce-dominated)
        if (!plant(px, pz, conif, de <= 9, fs)) continue;
        // the walls along the circuit: a second, staggered tree (closed canopy, no sky between the crowns)
        if (de <= 9 && fs < 160 && rng() < 0.55) plant(px + (rng() - 0.5) * 4, pz + (rng() - 0.5) * 4, rng() < 0.5 ? conif : !conif, true, fs);
        // understory at the walls facing the circuit: shrubs and young spruce in front of the trunks
        if (de <= 6 && fs < 70 && rng() < 0.45) { const sx = px + (rng() - 0.5) * 3, sz = pz + (rng() - 0.5) * 3; const sw = 3.6 + rng() * 2.6; if (free(sx, sz, sw * 0.5)) { trees.push([sx, sz, rng() < 0.55 ? SP.SHRUB : SP.POPLAR, sw, rng() < 0.55 ? 3 + rng() * 2.5 : 6 + rng() * 4, rng() < 0.5 ? 0 : 1, -0.5 + rng() * 0.4, 0, SHRUB_C]); nShrub++; } }
      } else if (c === 2 || c === 3) {
        // pasture / fen: lone trees, birch-spruce clumps on the rough ground
        const p = c === 3 ? 0.012 : 0.0025; if (rng() > p || fs < 12) continue; t.project(px, pz, null, pr);
        const n = c === 3 ? 1 + Math.floor(rng() * 4) : 1;
        for (let q = 0; q < n; q++) { const qx = px + (rng() - 0.5) * 9, qz = pz + (rng() - 0.5) * 9; if (plant(qx, qz, rng() < conAt(pr.s), true, fs)) nOpen++; }
      }
    }
    // ---- beyond the satellite window: the 16 m OSM raster, edges and a thin interior out to the billboard range
    const GF = E.fcovFar; let nFar = 0;
    if (GF) {
      const H = Env.CARD_HALF - 100;
      for (let j = 0; j < GF.nz; j++) for (let i = 0; i < GF.nx; i++) {
        const cx = GF.x0 + (i + 0.5) * GF.cell, cz = GF.z0 + (j + 0.5) * GF.cell; if (cx >= x0 && cx < X1 && cz >= z0 && cz < Z1) continue; if (Math.abs(cx) > H || Math.abs(cz) > H) continue;
        const c = GF.cls[j * GF.nx + i]; if (c > 1) continue;
        let edge = false; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= GF.nx || jj >= GF.nz || GF.cls[jj * GF.nx + ii] > 1) edge = true; }
        const n = edge ? 3 : (rng() < 0.2 ? 1 : 0);
        for (let q = 0; q < n; q++) { const px = cx + (rng() - 0.5) * GF.cell, pz = cz + (rng() - 0.5) * GF.cell; if (plant(px, pz, c === 0 ? rng() < 0.85 : rng() < 0.25, edge, 1e3)) nFar++; }
      }
    }
    E.stats.trees = { edge: nEdge, interior: nIn, shrub: nShrub, open: nOpen, far: nFar, total: trees.length };
    sc.treeCount = trees.length;
    // ---- forest-edge contours for the tree-line strips (Low / Medium beyond the billboard range): canopy fraction on the 10 m distance-field grid
    E.innerStrips = []; E.allWoods = [];
    const DN = E._DN, DH = (DN - 1) * 5; const can = new Float32Array(DN * DN);
    for (let gz = 0; gz < DN; gz++) for (let gx = 0; gx < DN; gx++) { const x = -DH + gx * 10, z = -DH + gz * 10; let s = 0; for (const [a, b] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) s += E.isCanopy(x + a, z + b) ? 1 : 0; can[gz * DN + gx] = s / 4; }
    for (const line of Env.contours(E, can, 0.5)) {
      if (line.length < 4) continue; const L = Env.polyLength(line, line.closed); if (L < 60) continue;
      const pts = Env.smoothLine(line, line.closed, 1, 20); if (line.closed && pts.length) pts.push(pts[0]);
      // keep the strip a few metres inside the wood (the canopy side of the 0.5 contour), never across the circuit
      let run = []; const flush = () => { if (run.length > 2) E.innerStrips.push([run, 23]); run = []; };
      for (const p of pts) { if (E.fsAt(p[0], p[1]) < 12) { flush(); continue; } run.push(p); } flush();
    }
    Veg.instance(E, trees);
    Veg.strips(E);
    SF.brook(E);
    E.timings.trees = Math.round(performance.now() - T0);
  };

  // the Eau Rouge brook (and the other OSM streams near the circuit): a 2-3 m water ribbon a few cm over the visible ground, culverted under the
  // circuit (no ribbon inside the barriers + 3 m)
  SF.brook = function (E) {
    const sc = E.sc; const pos = [], idx = []; const R = 1400;
    for (const r of E.data.rivers || []) {
      if (!r.pts || r.pts.length < 2) continue; const P = Env.smoothLine(r.pts, false, 0, 4); const hw = Math.min(1.6, (r.w || 3) / 2);
      let prev = -1;
      for (let i = 0; i < P.length; i++) {
        const [x, z] = P[i]; const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)]; let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
        const ok = Math.abs(x) < R && Math.abs(z) < R && E.fsAt(x, z) > 3 && !(E.occAt(x, z) & Env.OCC.ROAD);
        if (!ok) { prev = -1; continue; }
        const v = pos.length / 3; for (const sd of [-1, 1]) { const px = x - tz * hw * sd, pz = z + tx * hw * sd; pos.push(px, sc.height(px, pz) + 0.06, pz); }
        if (prev >= 0) idx.push(prev, prev + 1, v, prev + 1, v + 1, v);
        prev = v;
      }
    }
    if (!idx.length) return;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const nr = g.attributes.normal; for (let i = 0; i < nr.count; i++) nr.setXYZ(i, 0, 1, 0);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x3a3226, roughness: 0.12, metalness: 0.3, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
    m.name = 'brook'; m.receiveShadow = true; sc.group.add(m); E.stats.brookTris = idx.length / 3;
  };
})();
