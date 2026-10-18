// Equation I - Yas Marina (Abu Dhabi) landmarks: the W hotel and its LED gridshell over the track, Ferrari World's red roof,
// the marina and its yachts, the Etihad Arena; the circuit architecture (stand sails, pit building, paddock, control towers,
// floodlight towers) is in env_yas_arch.js and the fan zone in env_yas_fan.js. Built for track data kind 'desert'.
// Static pieces go through the street kit's shared atlas / batched world (one material, a draw call per visible cell); the
// gridshell is its own mesh (no shadow), the floodlights two instanced meshes.
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  const C = (h) => new THREE.Color(h).convertSRGBToLinear();
  const Yas = {};
  const isDesert = (t) => ((EI.ENVDATA && EI.ENVDATA[t.data.id]) || {}).kind === 'desert';
  const isNight = () => !!(EI.Night && EI.Night.on);
  // night variants of the facade textures live with the architecture module's regions
  const TX = () => EI.EnvYasTex.regions();
  const NR = () => { const AT = EI.StreetKit.Atlas; return { glassN: AT.R.yasGlassN || AT.R.yasGlass }; };
  // footprints modelled here instead of by the scenery's generic box buildings (they still reserve their ground for the venue
  // layout and the trackside infrastructure: only the box-building pass skips them)
  const OWN = (b, t) => b.w || /^(Control Tower|Etihad Arena)$/.test(b.n || '') || !!(t && EI.EnvYasArch && EI.EnvYasArch.owns(b, t));
  if (EI.Scenery) {
    const orig = EI.Scenery.prototype.buildBuildings;
    EI.Scenery.prototype.buildBuildings = function () {
      const sc = this.track.data.scenery; if (!isDesert(this.track)) return orig.call(this);
      // the generic footprints are built by js/env_yas_city.js into the landmarks' static mesh (Gulf facades, lit at night);
      // the scenery pass here only reserves the pit complex
      const all = sc.buildings; const tr = this.track; this._yasGeneric = EI.EnvYasCity ? all.filter(b => !OWN(b, tr)) : [];
      sc.buildings = EI.EnvYasCity ? [] : all.filter(b => !OWN(b, tr));
      try { return orig.call(this); } finally { sc.buildings = all; }
    };
  }

  // ---------------------------------------------------------------- helpers
  const SKx = () => EI.StreetKit;
  const centroid = (p) => { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; };
  function segDist(px, pz, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1]; const L2 = dx * dx + dz * dz || 1; const t = U.clamp(((px - a[0]) * dx + (pz - a[1]) * dz) / L2, 0, 1); return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t); }
  function polyDist(x, z, p) { let d = Infinity; for (let i = 0; i < p.length; i++) d = Math.min(d, segDist(x, z, p[i], p[(i + 1) % p.length])); return d; }
  // atlas region painted with transparency (the atlas canvas starts opaque white: clear the slot it is about to get first)
  function alphaRegion(name, w, h, paint) {
    const AT = SKx().Atlas; if (!AT.cv) AT.reset(); if (AT.R[name]) return AT.R[name];
    const S = AT.S, G = AT.G, W = w + 2 * G, H = h + 2 * G; let x = AT.x, y = AT.y; if (x + W > S) { x = 0; y += AT.rowH; }
    AT.cx.clearRect(x, y, W, H);
    return AT.region(name, w, h, (c, ww, hh) => { c.clearRect(0, 0, ww, hh); paint(c, ww, hh); }, null, null, 'uv');
  }
  // signed distance raster (metres, > 0 inside) of a region given by an inside(x, z) test, two-pass chamfer on each side
  function sdf(x0, z0, x1, z1, st, inside) {
    const nx = Math.ceil((x1 - x0) / st) + 1, nz = Math.ceil((z1 - z0) / st) + 1, n = nx * nz; const ins = new Uint8Array(n);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) ins[j * nx + i] = inside(x0 + i * st, z0 + j * st) ? 1 : 0;
    const ch = (val) => {
      const d = new Float32Array(n); for (let k = 0; k < n; k++) d[k] = ins[k] === val ? 1e9 : 0; const D = Math.SQRT2;
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (!d[k]) continue; let v = d[k]; if (i > 0) v = Math.min(v, d[k - 1] + 1); if (j > 0) { v = Math.min(v, d[k - nx] + 1); if (i > 0) v = Math.min(v, d[k - nx - 1] + D); if (i < nx - 1) v = Math.min(v, d[k - nx + 1] + D); } d[k] = v; }
      for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const k = j * nx + i; if (!d[k]) continue; let v = d[k]; if (i < nx - 1) v = Math.min(v, d[k + 1] + 1); if (j < nz - 1) { v = Math.min(v, d[k + nx] + 1); if (i < nx - 1) v = Math.min(v, d[k + nx + 1] + D); if (i > 0) v = Math.min(v, d[k + nx - 1] + D); } d[k] = v; }
      return d;
    };
    const dI = ch(1), dO = ch(0); const d = new Float32Array(n); for (let k = 0; k < n; k++) d[k] = ins[k] ? (dI[k] - 0.5) * st : -(dO[k] - 0.5) * st;
    const at = (x, z) => { const fx = U.clamp((x - x0) / st, 0, nx - 1.001), fz = U.clamp((z - z0) / st, 0, nz - 1.001); const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * nx + i; return (d[k] * (1 - u) + d[k + 1] * u) * (1 - v) + (d[k + nx] * (1 - u) + d[k + nx + 1] * u) * v; };
    return { x0, z0, st, nx, nz, d, at };
  }
  // a height-field surface over an sdf region: grid vertices, the ones just outside snapped onto the outline, cells with an
  // inside corner become quads. f(x, z, din) -> y. emit(a, b, c, d) gets four [x, y, z] corners counter-clockwise from above
  function surface(F, f, emit) {
    const { nx, nz, st, x0, z0, d } = F; const V = new Array(nx * nz);
    const vert = (i, j) => {
      const k = j * nx + i; if (V[k]) return V[k]; let x = x0 + i * st, z = z0 + j * st; let dd = d[k];
      if (dd < 0) { const gx = F.at(x + st, z) - F.at(x - st, z), gz = F.at(x, z + st) - F.at(x, z - st); const gl = Math.hypot(gx, gz) || 1; x -= gx / gl * dd; z -= gz / gl * dd; dd = 0; }
      return (V[k] = [x, f(x, z, Math.max(0, dd)), z]);
    };
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const k = j * nx + i; if (d[k] < 0 && d[k + 1] < 0 && d[k + nx] < 0 && d[k + nx + 1] < 0) continue;
      emit(vert(i, j), vert(i, j + 1), vert(i + 1, j + 1), vert(i + 1, j));
    }
  }
  // the long axis of a set of footprints: centroid c and unit direction (dx, dz) of the largest spread (2x2 covariance)
  function principalAxis(polys) {
    let n = 0, mx = 0, mz = 0; for (const p of polys) for (const q of p) { mx += q[0]; mz += q[1]; n++; } mx /= n; mz /= n;
    let xx = 0, zz = 0, xz = 0; for (const p of polys) for (const q of p) { const a = q[0] - mx, b = q[1] - mz; xx += a * a; zz += b * b; xz += a * b; }
    const th = 0.5 * Math.atan2(2 * xz, xx - zz); return { c: [mx, mz], dx: Math.cos(th), dz: Math.sin(th) };
  }
  // surface() in a rotated frame with the vertices kept: F is an sdf over local (u, v), toW maps local to world (x, z),
  // f(u, v, din) -> y. Vertices are { p: [x, y, z], lu, lv, din }, shared between the quads that use them
  function surfaceGrid(F, f, toW) {
    const { nx, nz, st, x0, z0, d } = F; const V = new Array(nx * nz); const quads = [];
    const vert = (i, j) => {
      const k = j * nx + i; if (V[k]) return V[k]; let u = x0 + i * st, v = z0 + j * st; let dd = d[k];
      if (dd < 0) { const gu = F.at(u + st, v) - F.at(u - st, v), gv = F.at(u, v + st) - F.at(u, v - st); const gl = Math.hypot(gu, gv) || 1; u -= gu / gl * dd; v -= gv / gl * dd; dd = 0; }
      const w = toW(u, v); return (V[k] = { p: [w[0], f(u, v, Math.max(0, dd)), w[1]], lu: u, lv: v, din: Math.max(0, dd) });
    };
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const k = j * nx + i; if (d[k] < 0 && d[k + 1] < 0 && d[k + nx] < 0 && d[k + nx + 1] < 0) continue;
      quads.push([vert(i, j), vert(i, j + 1), vert(i + 1, j + 1), vert(i + 1, j)]);
    }
    return { V, quads, nx, nz };
  }
  // the W's bridge over the track: a smooth white pod lofted along the footprint's long axis (elliptic sections, ends rounded
  // as a superellipse), the big oval window of u1-u3 on both sides facing along the track, lit inside at night
  function pod(B, poly, y0, y1, night) {
    const ax = principalAxis([poly]); const L = (q) => [(q[0] - ax.c[0]) * ax.dx + (q[1] - ax.c[1]) * ax.dz, -(q[0] - ax.c[0]) * ax.dz + (q[1] - ax.c[1]) * ax.dx];
    const lp = poly.map(L); let u0 = Infinity, u1 = -Infinity; for (const q of lp) { u0 = Math.min(u0, q[0]); u1 = Math.max(u1, q[0]); }
    // the footprint's width across the axis at station u
    const span = (u) => { let a = Infinity, b = -Infinity; for (let i = 0; i < lp.length; i++) { const P = lp[i], Q = lp[(i + 1) % lp.length]; if ((P[0] - u) * (Q[0] - u) > 0 || P[0] === Q[0]) continue; const v = P[1] + (Q[1] - P[1]) * (u - P[0]) / (Q[0] - P[0]); a = Math.min(a, v); b = Math.max(b, v); } return a < b ? [a, b] : null; };
    const NS = 22, NA = 18, yc = (y0 + y1) / 2, hh = (y1 - y0) / 2; const P = [];
    let ref = span((u0 + u1) / 2) || [-6, 6];
    for (let s = 0; s <= NS; s++) {
      const t = s / NS, u = u0 + (u1 - u0) * (0.02 + 0.96 * t); const sp = span(u) || ref; ref = sp; const vc = (sp[0] + sp[1]) / 2, hw = (sp[1] - sp[0]) / 2 + 0.6;
      const e = Math.abs(t * 2 - 1); const k = Math.pow(Math.max(0, 1 - Math.pow(e, 5)), 1 / 5);   // superellipse end rounding
      const row = []; for (let a = 0; a <= NA; a++) { const th = a / NA * 6.2832; const cv = Math.cos(th), sv = Math.sin(th);
        // a slightly squared ellipse (flatter sides, the pod reads as a sculpted lozenge, not a tube)
        const sq = (x) => Math.sign(x) * Math.pow(Math.abs(x), 0.8); const lv = vc + sq(cv) * hw * k, ly = yc + sq(sv) * hh * (0.35 + 0.65 * k);
        row.push([ax.c[0] + ax.dx * u - ax.dz * lv, ly, ax.c[1] + ax.dz * u + ax.dx * lv, t, th]); }
      P.push(row);
    }
    const white = C(0xf4f3f0), N = (s, a) => { const r = P[s], A = r[(a + 1) % NA], Z = r[(a + NA - 1) % NA], S1 = P[Math.min(NS, s + 1)][a], S0 = P[Math.max(0, s - 1)][a];
      const ux = S1[0] - S0[0], uy = S1[1] - S0[1], uz = S1[2] - S0[2], vx = A[0] - Z[0], vy = A[1] - Z[1], vz = A[2] - Z[2]; let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const cx = ax.c[0] + ax.dx * (u0 + u1) / 2, cz = ax.c[1] + ax.dz * (u0 + u1) / 2; if (nx * (r[a][0] - cx) + ny * (r[a][1] - yc) + nz * (r[a][2] - cz) < 0) { nx = -nx; ny = -ny; nz = -nz; } const l = Math.hypot(nx, ny, nz) || 1; return [nx / l, ny / l, nz / l]; };
    const NN = P.map((r, s) => r.map((_, a) => N(s, a % NA)));
    // the window: the middle 70 % of the length, +-55 degrees round each side (the texture's white margin blends into the skin)
    const WT0 = 0.15, WT1 = 0.85, WA = 0.96; const winUV = (q, side) => { const th = side > 0 ? q[4] : q[4] - Math.PI; const aa = Math.atan2(Math.sin(th), Math.cos(th)); return [side > 0 ? (q[3] - WT0) / (WT1 - WT0) : 1 - (q[3] - WT0) / (WT1 - WT0), 0.5 + aa / (2 * WA) * side]; };
    for (let s = 0; s < NS; s++) for (let a = 0; a < NA; a++) {
      const A = P[s][a], Bq = P[s + 1][a], Cq = P[s + 1][a + 1], D = P[s][a + 1]; const nA = NN[s][a], nB = NN[s + 1][a], nC = NN[s + 1][a + 1], nD = NN[s][a + 1];
      const tm = (A[3] + Bq[3]) / 2, thm = (A[4] + D[4]) / 2; const dR = Math.abs(Math.atan2(Math.sin(thm), Math.cos(thm))), dL = Math.abs(Math.atan2(Math.sin(thm - Math.PI), Math.cos(thm - Math.PI)));
      const side = dR < WA ? 1 : dL < WA ? -1 : 0; let uv = null;
      if (side && tm > WT0 && tm < WT1) { B.set(TX().podWin, 0.25, 0.2, night ? 0.45 : 0); const q = [A, Bq, Cq, D].map(v => winUV(v, side)); uv = [q[0][0], q[0][1], q[1][0], q[1][1], q[2][0], q[2][1], q[3][0], q[3][1]]; }
      else B.set('white', 0.35, 0.15, night ? 0.06 : 0);
      // outward winding check against the smooth normal
      const ux = Bq[0] - A[0], uy = Bq[1] - A[1], uz = Bq[2] - A[2], vx = D[0] - A[0], vy = D[1] - A[1], vz = D[2] - A[2]; const f = (uy * vz - uz * vy) * nA[0] + (uz * vx - ux * vz) * nA[1] + (ux * vy - uy * vx) * nA[2];
      const pa = A.slice(0, 3), pb = Bq.slice(0, 3), pc = Cq.slice(0, 3), pd = D.slice(0, 3);
      if (f >= 0) { B.triN(pa, pb, pc, nA, nB, nC, white, white, white, uv && [uv[0], uv[1], uv[2], uv[3], uv[4], uv[5]]); B.triN(pa, pc, pd, nA, nC, nD, white, white, white, uv && [uv[0], uv[1], uv[4], uv[5], uv[6], uv[7]]); }
      else { B.triN(pa, pd, pc, nA, nD, nC, white, white, white, uv && [uv[0], uv[1], uv[6], uv[7], uv[4], uv[5]]); B.triN(pa, pc, pb, nA, nC, nB, white, white, white, uv && [uv[0], uv[1], uv[4], uv[5], uv[2], uv[3]]); }
    }
  }
  // a quad facing the horizontal direction (nx, nz): the world material is single sided
  function wallQuad(B, A, Bq, Cq, D, nx, nz, col, uv) {
    const ux = Bq[0] - A[0], uy = Bq[1] - A[1], uz = Bq[2] - A[2], vx = Cq[0] - A[0], vy = Cq[1] - A[1], vz = Cq[2] - A[2];
    const fx = uy * vz - uz * vy, fz = ux * vy - uy * vx;
    if (fx * nx + fz * nz >= 0) B.quad(A, Bq, Cq, D, col, uv); else B.quad(A, D, Cq, Bq, col, uv ? [uv[0], uv[1], uv[6], uv[7], uv[4], uv[5], uv[2], uv[3]] : null);
  }
  // outward normal of edge a-b of polygon p
  function outN(p, a, b) { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; let nx = (b[1] - a[1]) / l, nz = -(b[0] - a[0]) / l; if (U.pointInPoly((a[0] + b[0]) / 2 + nx * 0.3, (a[1] + b[1]) / 2 + nz * 0.3, p)) { nx = -nx; nz = -nz; } return [nx, nz]; }
  // extruded footprint: walls (u in metres along the outline / tile, v in metres / tile) between y0 and y1, optional roof
  function prism(B, p, y0, y1, col, tileU, tileV, roofCol, roofRect) {
    let u = 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 0.05) continue; const [nx, nz] = outN(p, a, b);
      wallQuad(B, [a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], nx, nz, col, [u / tileU, y0 / tileV, (u + l) / tileU, y0 / tileV, (u + l) / tileU, y1 / tileV, u / tileU, y1 / tileV]); u += l;
    }
    if (roofCol) { if (roofRect) B.set(roofRect, 0.8, 0); cap(B, p, y1, roofCol, true); }
  }
  function cap(B, p, y, col, up) {
    const tri = THREE.ShapeUtils.triangulateShape(p.map(q => new THREE.Vector2(q[0], q[1])), []);
    for (const [a, b, c] of tri) { const A = [p[a][0], y, p[a][1]], Bq = [p[b][0], y, p[b][1]], Cq = [p[c][0], y, p[c][1]]; const uv = [A[0] / 8, A[2] / 8, Bq[0] / 8, Bq[2] / 8, Cq[0] / 8, Cq[2] / 8];
      const ny = (Bq[2] - A[2]) * (Cq[0] - A[0]) - (Bq[0] - A[0]) * (Cq[2] - A[2]); if ((ny > 0) === up) B.tri(A, Bq, Cq, col, uv); else B.tri(A, Cq, Bq, col, [uv[0], uv[1], uv[4], uv[5], uv[2], uv[3]]); }
  }
  // a standalone mesh from street-kit batches, drawn with the world's shared material (same program, one draw call)
  function batchMesh(W, list, name, kind) {
    const S = 18; let n = 0; for (const B of list) n += B.n; const arr = new Float32Array(n * S); let o = 0; for (const B of list) { arr.set(B.f.subarray(0, B.n * S), o); o += B.n * S; }
    const ib = new THREE.InterleavedBuffer(arr, S); const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0)); g.setAttribute('normal', new THREE.InterleavedBufferAttribute(ib, 3, 3)); g.setAttribute('color', new THREE.InterleavedBufferAttribute(ib, 3, 6));
    g.setAttribute('uv', new THREE.InterleavedBufferAttribute(ib, 2, 9)); g.setAttribute('aRect', new THREE.InterleavedBufferAttribute(ib, 4, 11)); g.setAttribute('aRme', new THREE.InterleavedBufferAttribute(ib, 3, 15));
    g.computeBoundingSphere(); g.computeBoundingBox(); const m = new THREE.Mesh(g, W.mat(kind || 'solid')); m.name = name; m.matrixAutoUpdate = false; m.userData.tris = n / 3; return m;
  }
  // ---------------------------------------------------------------- textures (atlas regions)
  function regions() {
    const AT = SKx().Atlas;
    // curtain wall: blue-green glass with sky reflections, white floor slabs every 3.3 m, slim mullions (4 floors x 3 bays per tile)
    const glass = AT.region('yasGlass', 256, 256, (x, w, h) => {
      const r = U.rng(31); const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#5f7f93'); g.addColorStop(0.5, '#3c5a6c'); g.addColorStop(1, '#2b4352'); x.fillStyle = g; x.fillRect(0, 0, w, h);
      for (let k = 0; k < 14; k++) { x.fillStyle = 'rgba(210,225,235,' + (0.05 + r() * 0.1).toFixed(2) + ')'; const xx = r() * w; x.fillRect(xx, 0, 6 + r() * 20, h); }
      for (let f = 0; f < 4; f++) { const y = f * 64; x.fillStyle = '#ece9e2'; x.fillRect(0, y, w, 13); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, y + 13, w, 2); }
      x.fillStyle = 'rgba(220,226,230,0.85)'; for (let i = 0; i < 3; i++) x.fillRect(i * 85, 0, 3, h);
    }, (x, w, h) => { x.fillStyle = 'rgb(128,128,128)'; x.fillRect(0, 0, w, h); for (let f = 0; f < 4; f++) { x.fillStyle = 'rgb(170,170,170)'; x.fillRect(0, f * 64, w, 13); } },
    (x, w, h) => { x.fillStyle = 'rgb(40,40,40)'; x.fillRect(0, 0, w, h); for (let f = 0; f < 4; f++) { x.fillStyle = 'rgb(220,220,220)'; x.fillRect(0, f * 64, w, 15); } });
    // podium / control tower stone: pale limestone panels with a dark glass ground floor band
    const stone = AT.region('yasStone', 256, 128, (x, w, h) => {
      x.fillStyle = '#e9e1d2'; x.fillRect(0, 0, w, h); x.strokeStyle = 'rgba(120,110,95,0.35)'; x.lineWidth = 1.5; for (let y = 0; y < h; y += 32) { x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke(); } for (let xx = 0; xx < w; xx += 64) { x.beginPath(); x.moveTo(xx, 0); x.lineTo(xx, h); x.stroke(); }
      x.fillStyle = '#26323a'; x.fillRect(0, h - 40, w, 40); x.fillStyle = 'rgba(200,215,225,0.25)'; for (let xx = 4; xx < w; xx += 32) x.fillRect(xx, h - 38, 10, 36);
    }, null, (x, w, h) => { x.fillStyle = 'rgb(150,150,150)'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgb(50,50,50)'; x.fillRect(0, h - 40, w, 40); });
    // gridshell: steel diamond lattice (opaque) round glass panels that are cut out close up and read as a silvery veil far off
    const shell = alphaRegion('yasShell', 128, 128, (x, w, h) => {
      x.fillStyle = 'rgba(205,215,228,0.3)'; x.fillRect(0, 0, w, h);
      x.strokeStyle = '#aeb6bf'; x.lineWidth = 4; x.strokeRect(0, 0, w, h);
      x.fillStyle = '#ffffff'; for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h]]) { x.beginPath(); x.arc(cx, cy, 5, 0, 6.283); x.fill(); }
    });
    // Ferrari World roof: lacquered panels with fine seams
    const roof = AT.region('yasRoof', 128, 128, (x, w, h) => { x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(0,0,0,0.12)'; for (let k = 0; k < w; k += 32) { x.fillRect(k, 0, 2, h); x.fillRect(0, k, w, 2); } },
      (x, w, h) => { x.fillStyle = 'rgb(128,128,128)'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgb(100,100,100)'; for (let k = 0; k < w; k += 32) { x.fillRect(k, 0, 2, h); x.fillRect(0, k, w, 2); } });
    // the yellow shield with the tricolour band on the roof
    const shield = alphaRegion('yasShield', 128, 160, (x, w, h) => {
      const sh = () => { x.beginPath(); x.moveTo(6, 6); x.lineTo(w - 6, 6); x.lineTo(w - 6, h * 0.62); x.quadraticCurveTo(w - 8, h * 0.9, w / 2, h - 4); x.quadraticCurveTo(8, h * 0.9, 6, h * 0.62); x.closePath(); };
      sh(); x.fillStyle = '#ffd400'; x.fill(); x.save(); sh(); x.clip(); const bw = (w - 12) / 3; x.fillStyle = '#009246'; x.fillRect(6, 6, bw, 16); x.fillStyle = '#ffffff'; x.fillRect(6 + bw, 6, bw, 16); x.fillStyle = '#ce2b37'; x.fillRect(6 + 2 * bw, 6, bw, 16); x.restore();
      x.fillStyle = '#111'; x.beginPath(); x.ellipse(w / 2, h * 0.55, w * 0.18, h * 0.24, 0.25, 0, 6.283); x.fill(); x.fillStyle = '#ffd400'; x.beginPath(); x.ellipse(w / 2 + 6, h * 0.5, w * 0.08, h * 0.12, 0.25, 0, 6.283); x.fill();
      sh(); x.strokeStyle = '#111'; x.lineWidth = 4; x.stroke();
    });
    // Etihad Arena: vertical silver fins over dark glass
    const fins = AT.region('yasFins', 128, 128, (x, w, h) => { x.fillStyle = '#2a333b'; x.fillRect(0, 0, w, h); for (let i = 0; i < 8; i++) { const g = x.createLinearGradient(i * 16, 0, i * 16 + 10, 0); g.addColorStop(0, '#9aa3ab'); g.addColorStop(0.5, '#eef1f3'); g.addColorStop(1, '#8c959d'); x.fillStyle = g; x.fillRect(i * 16, 0, 10, h); } },
      (x, w, h) => { x.fillStyle = 'rgb(128,128,128)'; x.fillRect(0, 0, w, h); for (let i = 0; i < 8; i++) { x.fillStyle = 'rgb(170,170,170)'; x.fillRect(i * 16, 0, 2, h); x.fillStyle = 'rgb(90,90,90)'; x.fillRect(i * 16 + 8, 0, 2, h); } });
    return { glass, stone, shell, roof, shield, fins };
  }

  // ================================================================ the W Abu Dhabi - Yas Island
  function buildHotel(E, W, R, out) {
    const H = E.data.hotel; if (!H || !H.parts) return; const t = E.t, sc = E.sc; const night = isNight();
    const B = new (SKx().Batch)(); const parts = H.parts.filter(p => p.h > 1 && p.p.length >= 3);
    const ground = (p) => { let y = Infinity; for (const q of p) y = Math.min(y, E.ground(q[0], q[1])); return y - 0.3; };
    const white = C(0xf2f0eb), roofC = C(0xb8bcc0), glassTint = C(0xffffff);
    const wings = [];
    for (const p of parts) {
      const y0 = ground(p.p);
      // the low podium along the track (u1): warm-lit restaurant glazing under a white canopy band
      if (p.h <= 12) { const hg = Math.max(3.5, p.h - 1.4); B.set(TX().hosp, 0.12, 0.35, night ? 1.1 : 0); prism(B, p.p, y0, y0 + hg, white, 12, 13.5); B.set(R.stone, 0.75, 0); prism(B, p.p, y0 + hg, y0 + p.h, white, 16, 8, C(0xd6d2c8), 'white'); continue; }
      // the OSM height is the gridshell's crest: the glass blocks under it stop ~12 m lower (u1: two podium floors + ~8 room floors)
      const hb = Math.max(22, p.h - 12); wings.push({ p: p.p, h: hb, y0 });
      // track-level podium: two floors of warm-lit restaurant / lounge glazing (u1)
      B.set(TX().hosp, 0.12, 0.35, night ? 1.1 : 0); prism(B, p.p, y0, y0 + 9, white, 12, 13.5);
      B.set(night ? TX().whotel : TX().curtain, 0.16, 0.45, night ? 0.8 : 0); prism(B, p.p, y0 + 9, y0 + hb, glassTint, 9.6, 13.2, roofC, 'white');
    }
    // the bridge across the track (9 m clear), glazed sides, white soffit
    const br = H.bridge; let bridgeY = null;
    if (br && br.p.length >= 3) {
      const y0 = ground(br.p) + 0.3 + br.h0, y1 = ground(br.p) + 0.3 + br.h; bridgeY = [y0, y1];
      pod(B, br.p, y0, y1, night);
    }
    W.add(B, 'main'); out.hotelTris = B.count / 3;
    // ---- the gridshell: one flowing skin over both wings and the bridge, 6 m proud of them, its hem rising over the track
    const doms = wings.map(w => w.p).concat(br ? [br.p] : []); if (!doms.length) return;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const p of doms) for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    const PAD = 13, TAIL = 32; const pr = {};
    const latOf0 = (x, z) => { t.project(x, z, null, pr); return pr.lat; };
    const offTrack = (x, z, m) => { t.project(x, z, null, pr); return pr.dist > Math.max(t.wallL[pr.i], t.wallR[pr.i]) + m; };
    // each wing's own long axis; the ends away from the bridge carry a tail along which the skin sweeps down to the ground (u1)
    const bc = br ? centroid(br.p) : centroid(doms[0]);
    const tails = []; for (const w of wings) {
      const a = principalAxis([w.p]); let lo = Infinity, hi = -Infinity, bw = 0; for (const q of w.p) { const al = (q[0] - a.c[0]) * a.dx + (q[1] - a.c[1]) * a.dz, bl = -(q[0] - a.c[0]) * a.dz + (q[1] - a.c[1]) * a.dx; lo = Math.min(lo, al); hi = Math.max(hi, al); bw = Math.max(bw, Math.abs(bl)); }
      const ab = (bc[0] - a.c[0]) * a.dx + (bc[1] - a.c[1]) * a.dz; const ends = ab > lo && ab < hi ? [-1, 1] : [ab < lo ? 1 : -1];
      // each tail as long as it can be while its tip stays well clear of the barrier and out of the marina (u1: no piece of skin by the run-off)
      for (const sg of ends) { const e = sg > 0 ? hi : lo; let len = TAIL; const tipOk = (l) => { const x = a.c[0] + a.dx * (e + sg * l), z = a.c[1] + a.dz * (e + sg * l); return offTrack(x, z, 16) && !(E.isSea && E.isSea(x, z)); };
        while (len > 10 && !tipOk(len)) len -= 3; if (len > 10) tails.push({ a, end: e, sg, bw: bw + PAD, p: w.p, len }); }
    }
    // 0 on the wings, rising to 1 at a tail's tip (null: not in a tail)
    for (const T of tails) { const c = centroid(T.p); T.side = Math.sign(latOf0(c[0], c[1])) || 1; }
    const tailOf = (x, z) => { for (const T of tails) { const al = (x - T.a.c[0]) * T.a.dx + (z - T.a.c[1]) * T.a.dz, bl = -(x - T.a.c[0]) * T.a.dz + (z - T.a.c[1]) * T.a.dx; const e = (al - T.end) * T.sg; if (e > 0 && e <= T.len && Math.abs(bl) < T.bw * (1 - 0.55 * Math.pow(e / T.len, 1.4))) return T; } return null; };
    const tailE = (x, z) => { let best = null; for (const T of tails) { const al = (x - T.a.c[0]) * T.a.dx + (z - T.a.c[1]) * T.a.dz, bl = -(x - T.a.c[0]) * T.a.dz + (z - T.a.c[1]) * T.a.dx; const e = (al - T.end) * T.sg; if (e <= 0 || e > T.len) continue; const f = e / T.len;
      if (Math.abs(bl) < T.bw * (1 - 0.55 * Math.pow(f, 1.4))) best = Math.max(best || 0, f); } return best; };
    // tails stay on their wing's side of the track and off the water
    const inside = (x, z) => { for (const p of doms) if (U.pointInPoly(x, z, p) || polyDist(x, z, p) < PAD) return true; const te = tailOf(x, z); return te != null && offTrack(x, z, 10) && latOf0(x, z) * te.side > 0; };
    // the skin's own frame: along the hotel's long axis (s) and across it (q), so the lattice runs with the building
    const ax = principalAxis(doms); const toW = (u, v) => [ax.c[0] + ax.dx * u - ax.dz * v, ax.c[1] + ax.dz * u + ax.dx * v];
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity; for (const p of doms) for (const q of p) { const du = (q[0] - ax.c[0]) * ax.dx + (q[1] - ax.c[1]) * ax.dz, dv = -(q[0] - ax.c[0]) * ax.dz + (q[1] - ax.c[1]) * ax.dx; u0 = Math.min(u0, du); u1 = Math.max(u1, du); v0 = Math.min(v0, dv); v1 = Math.max(v1, dv); }
    const PADL = PAD + TAIL + 4; const F = sdf(u0 - PADL, v0 - PADL, u1 + PADL, v1 + PADL, 2.5, (u, v) => { const w = toW(u, v); return inside(w[0], w[1]); });
    const yBase = Math.min(...wings.map(w => w.y0));
    // crest a few metres over the roofs (inverse-distance blend between the wings), dipping where it bridges the gap between them
    const topAt = (x, z) => { let sw = 0, sh = 0, dm = Infinity; for (const w of wings) { const d = U.pointInPoly(x, z, w.p) ? 0 : polyDist(x, z, w.p); dm = Math.min(dm, d); const k = 1 / Math.pow(d + 6, 2.2); sw += k; sh += k * (w.y0 + w.h + 8); } return sh / sw - 7 * U.smoothstep(PAD, PAD + 14, dm); };
    // the ribbon: a hem 19 m up (24 m over the track), rising steeply to hug the walls, a long gentle wave along its length,
    // the ends sweeping down to the ground
    const yFn = (u, v, din) => {
      const [x, z] = toW(u, v); const overTrack = !offTrack(x, z, 4); const te = tailE(x, z); const f = te == null ? 0 : U.smoothstep(0, 1, te);
      const hem = yBase + (overTrack ? 24 : 19) * (1 - f) + 3.5 * f, top = topAt(x, z) * (1 - f) + (yBase + 7) * f;
      // a rounded shoulder that crests 6 m inside the walls, a low dome across the top and a long wave along the ribbon
      const k = Math.pow(Math.sin(Math.PI / 2 * Math.min(1, din / (PAD + 6))), 0.6), dome = 4 * U.smoothstep(PAD + 6, PAD + 26, din);
      return hem + (top + dome - hem) * k + (Math.sin(u / 47 + 0.6) * 3.5 + Math.sin(v / 23 - u / 53) * 0.8) * k * (1 - f);
    };
    const G = surfaceGrid(F, yFn, toW);
    // developed lattice coordinates: arc length along the grid rows (the long axis) and columns (across), so the diamonds keep
    // their size up the steep flanks instead of stretching
    const { V, nx: gx, nz: gz } = G;
    for (let j = 0; j < gz; j++) { let pv = null; for (let i = 0; i < gx; i++) { const vv = V[j * gx + i]; if (!vv) { pv = null; continue; } vv.U = pv ? pv.U + Math.hypot(vv.p[0] - pv.p[0], vv.p[1] - pv.p[1], vv.p[2] - pv.p[2]) * (vv.lu >= pv.lu ? 1 : -1) : vv.lu; pv = vv; } }
    for (let i = 0; i < gx; i++) { let pv = null; for (let j = 0; j < gz; j++) { const vv = V[j * gx + i]; if (!vv) { pv = null; continue; } vv.W = pv ? pv.W + Math.hypot(vv.p[0] - pv.p[0], vv.p[1] - pv.p[1], vv.p[2] - pv.p[2]) * (vv.lv >= pv.lv ? 1 : -1) : vv.lv; pv = vv; } }
    // the stretch each row / column picks up over the steep flanks differs from its neighbours': keep it as an offset from the plan
    // coordinate, centred on each run, and relax it across the grid so the lattice shears smoothly instead of tearing into stripes
    { const N = gx * gz, dU = new Float32Array(N), dW = new Float32Array(N), has = new Uint8Array(N);
      for (let k = 0; k < N; k++) { const vv = V[k]; if (vv) { has[k] = 1; dU[k] = vv.U - vv.lu; dW[k] = vv.W - vv.lv; } }
      const centre = (d, stride, outer, inner) => { for (let o = 0; o < outer; o++) { const ks = []; for (let q = 0; q < inner; q++) { const k = stride === 1 ? o * gx + q : q * gx + o; if (has[k]) ks.push(k); } if (!ks.length) continue; const m = d[ks[ks.length >> 1]]; for (const k of ks) d[k] -= m; } };
      centre(dU, 1, gz, gx); centre(dW, gx, gx, gz);
      const tmp = new Float32Array(N);
      for (const d of [dU, dW]) for (let it = 0; it < 40; it++) { for (let j = 0; j < gz; j++) for (let i = 0; i < gx; i++) { const k = j * gx + i; if (!has[k]) continue; let sum = d[k] * 2, w = 2; if (i > 0 && has[k - 1]) { sum += d[k - 1]; w++; } if (i < gx - 1 && has[k + 1]) { sum += d[k + 1]; w++; } if (j > 0 && has[k - gx]) { sum += d[k - gx]; w++; } if (j < gz - 1 && has[k + gx]) { sum += d[k + gx]; w++; } tmp[k] = sum / w; } d.set(tmp); }
      for (let k = 0; k < N; k++) if (has[k]) { V[k].U = V[k].lu + dU[k]; V[k].W = V[k].lv + dW[k]; } }
    const PU = 3.2, PW = 2.3;   // panel diagonals along / across the ribbon (m)
    const latOf = (vv) => [(vv.U / PU + vv.W / PW), (vv.U / PU - vv.W / PW)];
    let nq = G.quads.length;
    if (!night) {
      const S = new (SKx().Batch)(); const tA = C(0xe9eef6), tB = C(0xeadff8);
      for (const [a, b, c, d] of G.quads) {
        const col = Math.sin(a.p[0] / 37) * Math.cos(a.p[2] / 29) > 0.2 ? tB : tA; S.set(R.shell, 0.35, 0.55, 0.22);
        const ua = latOf(a), ub = latOf(b), uc = latOf(c), ud = latOf(d);
        S.quad(a.p, b.p, c.p, d.p, col, [ua[0], ua[1], ub[0], ub[1], uc[0], uc[1], ud[0], ud[1]]); S.quad(a.p, d.p, c.p, b.p, col, [ua[0], ua[1], ud[0], ud[1], uc[0], uc[1], ub[0], ub[1]]);
      }
      const shellMesh = batchMesh(W, [S], 'yasGridshell'); shellMesh.castShadow = false; shellMesh.receiveShadow = false; sc.group.add(shellMesh); out.shellTris = S.count / 3;
    } else {
      // ---- at night the skin is the light show of u1-u3: white diamond panels in a white frame, an LED at every node (thousands of
      // bright points that halo in the resolve pass), the panels washed by the LEDs, the colour drifting slowly through purple,
      // magenta, blue and lavender. One opaque, double-sided shader mesh (one draw call); the lattice is drawn in the fragment
      // shader from the developed coordinates, antialiased and fading to its average brightness in the distance (no shimmer).
      const idx = new Map(); const pos = [], lat = [], ind = [];
      const vid = (vv) => { let k = idx.get(vv); if (k == null) { k = pos.length / 3; idx.set(vv, k); pos.push(vv.p[0], vv.p[1], vv.p[2]); const l = latOf(vv); lat.push(l[0], l[1]); } return k; };
      for (const [a, b, c, d] of G.quads) { const A = vid(a), Bq = vid(b), Cq = vid(c), D = vid(d); ind.push(A, Bq, Cq, A, Cq, D); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('lat', new THREE.Float32BufferAttribute(lat, 2)); g.setIndex(ind); g.computeBoundingSphere();
      const mat = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uT: { value: 0 } }]), side: THREE.DoubleSide, fog: true,
        vertexShader: ['attribute vec2 lat; varying vec2 vL; varying vec3 vW;', '#include <fog_pars_vertex>',
          'void main() { vL = lat; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;', '#include <fog_vertex>', '}'].join('\n'),
        fragmentShader: ['uniform float uT; varying vec2 vL; varying vec3 vW;', '#include <fog_pars_fragment>',
          'vec3 pal(float t) { t = fract(t); vec3 a = vec3(0.56, 0.18, 1.0), b = vec3(0.95, 0.16, 0.85), c = vec3(0.26, 0.30, 1.0), d = vec3(0.70, 0.45, 1.0);',
          '  return t < 0.25 ? mix(a, b, smoothstep(0.0, 1.0, t * 4.0)) : t < 0.5 ? mix(b, c, smoothstep(0.0, 1.0, t * 4.0 - 1.0)) : t < 0.75 ? mix(c, d, smoothstep(0.0, 1.0, t * 4.0 - 2.0)) : mix(d, a, smoothstep(0.0, 1.0, t * 4.0 - 3.0)); }',
          'float band(float d, float w, float aa) { return 1.0 - smoothstep(w - aa, w + aa, d); }',
          'void main() {',
          '  vec2 f = fract(vL); vec2 e = min(f, 1.0 - f); vec2 fw2 = fwidth(vL); float fw = max(max(fw2.x, fw2.y), 1e-4);',
          '  float gap = band(min(e.x, e.y), 0.05, fw) * (1.0 - smoothstep(0.05, 0.14, fw));',   // dark joints, gone before they alias
          '  float dn = length(e);',                                                                // distance to the nearest node
          '  float rD = max(0.09, fw * 0.7); float dt = mix(band(dn, rD, fw * 0.8) * min(1.0, 0.0081 / (rD * rD) + 0.3), 0.05, smoothstep(0.35, 0.8, fw));',
          '  float hue = uT * 0.012 + vW.x * 0.0011 + vW.z * 0.0007 + vW.y * 0.0035;',
          '  vec3 c = pal(hue); float wave = 0.85 + 0.15 * sin(vW.x * 0.021 - vW.z * 0.013 - uT * 0.35);',
          '  vec3 panel = mix(vec3(0.9, 0.9, 0.98), c, 0.4) * (0.2 + 0.22 * mix(exp(-dn * dn * 6.0), 0.35, smoothstep(0.25, 0.6, fw)));',  // white panes washed by the LEDs
          '  vec3 col = mix(panel, vec3(0.07, 0.07, 0.08), gap) * wave + mix(c, vec3(1.0), 0.3) * 3.4 * dt;',
          '  if (!gl_FrontFacing) col *= 0.85;',
          '  gl_FragColor = vec4(col, 1.0);',
          '#include <tonemapping_fragment>', '#include <encodings_fragment>', '#include <fog_fragment>', '}'].join('\n'),
      });
      mat.extensions = { derivatives: true }; mat.userData.nightEmissive = true;
      const lm = new THREE.Mesh(g, mat); lm.name = 'yasShellLED'; lm.castShadow = false; lm.receiveShadow = false; sc.group.add(lm); out.shellTris = ind.length / 3;
      const uT = mat.uniforms.uT; EI.Night.onFrame((dt, tt) => { uT.value = tt; });
      // its colour spill on the track and the run-off is night.js' (volumes from this mesh's bounds); here only white track floods
      const hs = []; for (let s = 0; s < t.length; s += 4) { const i = t.idxAtS(s); for (const p of doms) if (polyDist(t.x[i], t.z[i], p) < 45) { hs.push(s); break; } }
      let last = -1e9; for (const s of hs) if (s - last >= 28) { last = s; const i = t.idxAtS(s); EI.Night.addFlood(t.x[i], t.y[i] + 14, t.z[i], { power: 0.4, range: 60, color: [0.95, 0.9, 1.0] }); }
      // slim white diagonal columns from the ground to the hem (u1): where the hem comes down near the ground, clear of the track
      const Cb = new (SKx().Batch)(); Cb.set('white', 0.4, 0.1, 0.05); const colW = C(0xf4f4f6); const mI = new THREE.Matrix4(); let ncol = 0; const placed = [];
      for (const [a] of G.quads) {
        if (a.din > 0.01 || ncol >= 22) continue; const P = a.p; if (placed.some(q => Math.hypot(q[0] - P[0], q[2] - P[2]) < 26)) continue;
        t.project(P[0], P[2], null, pr); if (pr.dist < Math.max(t.wallL[pr.i], t.wallR[pr.i]) + 3) continue;
        // lean the foot outward from the hotel by a third of the height
        const hc2 = centroid(doms[0]); let ox = P[0] - hc2[0], oz = P[2] - hc2[1]; const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
        const gy = E.ground(P[0], P[2]); const hh = P[1] - gy; if (hh < 6) continue; const fx = P[0] + ox * hh * 0.28, fz = P[2] + oz * hh * 0.28;
        t.project(fx, fz, null, pr); if (pr.dist < Math.max(t.wallL[pr.i], t.wallR[pr.i]) + 3) continue;
        Cb.beam(mI, [fx, E.ground(fx, fz) - 0.2, fz], [P[0], P[1] - 0.3, P[2]], 0.55, colW, 8); placed.push(P); ncol++;
      }
      if (ncol) W.add(Cb, 'main'); out.shellColumns = ncol;
    }
    out.shell = { quads: nq, bridgeY };
  }

  // ================================================================ Ferrari World
  function buildFerrari(E, W, R, out) {
    const P = E.data.ferrari; if (!P || P.length < 3) return; const B = new (SKx().Batch)();
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const q of P) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    const F = sdf(x0 - 12, z0 - 12, x1 + 12, z1 + 12, 9, (x, z) => U.pointInPoly(x, z, P));
    const c = centroid(P); let g0 = Infinity; for (let k = 0; k < P.length; k += 6) g0 = Math.min(g0, E.ground(P[k][0], P[k][1])); const yg = isFinite(g0) ? g0 : 0;
    // roof: low at the tips, a long rise to the middle, the central funnel dipping in
    const yFn = (x, z, din) => { const r = Math.hypot(x - c[0], z - c[1]); return yg + 5 + 41 * Math.pow(U.smoothstep(0, 150, din), 0.85) - 14 * (1 - U.smoothstep(18, 42, r)); };
    const night = isNight(); const red = C(0xc4120e), redD = C(0x9e0d0b); B.set(R.roof, 0.28, 0.12, night ? 0.16 : 0);
    surface(F, yFn, (a, b, cc, d) => { const uv = (p) => [p[0] / 32, p[2] / 32]; const ua = uv(a), ub = uv(b), uc = uv(cc), ud = uv(d); B.quad(a, b, cc, d, a[1] < yg + 9 ? redD : red, [ua[0], ua[1], ub[0], ub[1], uc[0], uc[1], ud[0], ud[1]]); });
    // glazed walls under the roof edge
    B.set('white', 0.15, 0.3, night ? 0.9 : 0); const dark = night ? C(0xffc98a) : C(0x2a3540);
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; const ya = yFn(a[0], a[1], 0), yb = yFn(b[0], b[1], 0); const A = [a[0], yg - 0.5, a[1]], Bq = [b[0], yg - 0.5, b[1]], Cq = [b[0], yb, b[1]], D = [a[0], ya, a[1]]; B.quad(A, Bq, Cq, D, dark); B.quad(A, D, Cq, Bq, dark); }
    // the shield, lying on the roof facing the circuit (south)
    const top = yFn(c[0], c[1] + 120, F.at(c[0], c[1] + 120)) + 0.6; const sx = c[0], sz = c[1] + 120, w = 34, h = 42;
    B.set(R.shield, 0.4, 0.05, night ? 1.3 : 0.1);
    if (night) { EI.Night.addFlood(sx, top + 30, sz, { power: 0.6, range: 160, color: [1.0, 0.35, 0.3] }); for (let k = 0; k < P.length; k += 12) EI.Night.addGlow(P[k][0], yFn(P[k][0], P[k][1], 0) + 0.5, P[k][1], 3.5, [1.0, 0.75, 0.5]); } B.quad([sx - w / 2, top, sz + h / 2], [sx + w / 2, top, sz + h / 2], [sx + w / 2, top + 6, sz - h / 2], [sx - w / 2, top + 6, sz - h / 2], C(0xffffff), [0, 0, 1, 0, 1, 1, 0, 1]);
    W.add(B, 'main'); out.ferrariTris = B.count / 3;
  }

  // ================================================================ Etihad Arena: silver fins round a glazed drum, a shallow dome
  function buildArena(E, W, R, out) {
    const b = E.t.data.scenery.buildings.find(q => q.n === 'Etihad Arena'); if (!b) return; const B = new (SKx().Batch)(); const p = b.p;
    let y0 = Infinity; for (const q of p) y0 = Math.min(y0, E.ground(q[0], q[1])); y0 -= 0.3; const h = 26; const c = centroid(p);
    const night = isNight(); B.set(R.fins, 0.3, 0.6, night ? 0.7 : 0); prism(B, p, y0, y0 + h, night ? C(0xc9a8ff) : C(0xffffff), 12, 13);
    if (night) { EI.Night.addFlood(centroid(p)[0], y0 + h + 10, centroid(p)[1], { power: 0.5, range: 120, color: [0.75, 0.55, 1.0] }); for (let k = 0; k < p.length; k += 2) EI.Night.addGlow(p[k][0], y0 + h + 1.2, p[k][1], 3, [0.8, 0.6, 1.0], { pulse: 0.3 }); }
    B.set('white', 0.45, 0.4); const rings = [[1.0, h + 1.2], [0.85, h + 5], [0.6, h + 8], [0.3, h + 9.5]];
    let prev = p.map(q => [q[0], y0 + h, q[1]]);
    for (const [k, y] of rings) { const cur = p.map(q => [c[0] + (q[0] - c[0]) * k, y0 + y, c[1] + (q[1] - c[1]) * k]); for (let i = 0; i < p.length; i++) { const j = (i + 1) % p.length; const A = prev[i], Bq = prev[j], Cq = cur[j], D = cur[i]; B.quad(A, Bq, Cq, D, C(0xdfe3e6)); B.quad(A, D, Cq, Bq, C(0xdfe3e6)); } prev = cur; }
    W.add(B, 'main'); out.arenaTris = B.count / 3;
  }

  // ================================================================ the marina: Gulf-blue water, quays and moored yachts
  function buildMarina(E, W, out) {
    const t = E.t, sc = E.sc; const ST = EI.EnvStreet; if (!ST || !ST.yachtKit) return;
    const polys = (t.data.scenery.water || []).filter(w => w.length >= 3);
    // water level: the environment's sea level when it has one, else just above the lowest shore (as the generic water did)
    const levels = polys.map(w => { let y = Infinity; for (const q of w) y = Math.min(y, E.ground(q[0], q[1])); return y + 0.25; });
    const generic = sc.group.getObjectByName('water'); if (generic) sc.group.remove(generic);
    const mat = ST.waterMaterial(E); const uni = E._waterUni; mat.color = C(0x1f6e76); mat.envMapIntensity = 1.1;   // Gulf turquoise
    const geos = []; polys.forEach((w, k) => {
      const wy = E.seaY != null ? E.seaY + 0.25 : levels[k];
      const shape = new THREE.Shape(); shape.moveTo(w[0][0], w[0][1]); for (let i = 1; i < w.length; i++) shape.lineTo(w[i][0], w[i][1]);
      const g = new THREE.ShapeGeometry(shape); g.rotateX(Math.PI / 2); g.translate(0, wy, 0); geos.push(g);
    });
    if (geos.length) { const m = new THREE.Mesh(EI.Env.merge(geos), mat); m.name = 'water'; m.receiveShadow = true; m.onBeforeRender = () => { uni.uTime.value = performance.now() / 1000; }; sc.group.add(m); }
    // the marina basin: the big water body's quay edges inside the marina near the circuit
    const sea = polys.reduce((a, w) => (Math.abs(U.polyArea(w)) > Math.abs(U.polyArea(a)) ? w : a), polys[0]); if (!sea) return;
    const seaY = E.seaY != null ? E.seaY + 0.25 : levels[polys.indexOf(sea)];
    const hotel = E.data.hotel && E.data.hotel.bridge ? centroid(E.data.hotel.bridge.p) : [100, 380];
    const SKk = SKx(); const N = new SKk.Batch(), Fb = new SKk.Batch(), LN = new SKk.Lines(), LF = new SKk.Lines(), Q = new SKk.Batch(); const refl = [];
    const K = ST.yachtKit(N, Fb, LN, LF, refl); const rng = U.rng(4242); const pr = {};
    const inSea = (x, z) => U.pointInPoly(x, z, sea);
    const lines = [];
    for (let i = 0; i < sea.length; i++) {
      const a = sea[i], b = sea[(i + 1) % sea.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 18) continue;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; const dh = Math.hypot(mx - hotel[0], mz - hotel[1]); if (dh > 520) continue;
      let nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l; if (!inSea(mx + nx * 4, mz + nz * 4)) { nx = -nx; nz = -nz; } if (!inSea(mx + nx * 4, mz + nz * 4)) continue;
      t.project(mx, mz, null, pr); if (pr.dist < Math.max(t.wallL[pr.i], t.wallR[pr.i]) + 8) continue;
      lines.push({ a, b, nx, nz, l, dh, y: Math.max(seaY + 1.0, E.ground(mx - nx * 2, mz - nz * 2)) });
    }
    lines.sort((p, q) => p.dh - q.dh);
    // quay walls along the edges (white concrete coping) where the ground stands above the water
    Q.set('white', 0.85, 0); const quayC = C(0xd8d4ca), copeC = C(0xf2f0ea);
    for (let i = 0; i < sea.length; i++) {
      const a = sea[i], b = sea[(i + 1) % sea.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 0.5 || l > 400) continue;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; if (Math.hypot(mx - hotel[0], mz - hotel[1]) > 650) continue;
      const ga = E.ground(a[0], a[1]), gb = E.ground(b[0], b[1]); if (Math.max(ga, gb) < seaY + 0.25) continue;
      const A = [a[0], seaY - 1, a[1]], Bq = [b[0], seaY - 1, b[1]], Cq = [b[0], gb + 0.12, b[1]], D = [a[0], ga + 0.12, a[1]];
      Q.quad(A, Bq, Cq, D, quayC); Q.quad(A, D, Cq, Bq, quayC);
    }
    const occ = new Set(); const OG = 3; const key = (x, z) => Math.floor(x / OG) * 8192 + Math.floor(z / OG);
    const free = (x, z, ax, az, Lb, Bm) => { for (let a = -Lb / 2; a <= Lb / 2; a += 2) for (let b = -Bm / 2; b <= Bm / 2; b += Math.max(1, Bm / 3)) { const px = x + ax * a - az * b, pz = z + az * a + ax * b; if (occ.has(key(px, pz)) || !inSea(px, pz)) return false; if (E.ground(px, pz) > seaY + 0.3 && !(E.isSea && E.isSea(px, pz))) return false; } return true; };
    const mark = (x, z, ax, az, Lb, Bm) => { for (let a = -Lb / 2 - 1; a <= Lb / 2 + 1; a += 1.5) for (let b = -Bm / 2 - 0.8; b <= Bm / 2 + 0.8; b += 1) occ.add(key(x + ax * a - az * b, z + az * a + ax * b)); };
    const beamOf = (k, Lb) => Lb * (k === 'super' ? 0.19 : k === 'bigsail' ? 0.21 : 0.31);
    let n = 0, nSuper = 0; const MAX = 64; const ropeC = C(0xd6cfbd);
    for (const ln of lines) {
      if (n >= MAX) break; const dx = ln.b[0] - ln.a[0], dz = ln.b[1] - ln.a[1]; const tx = dx / ln.l, tz = dz / ln.l; const heroQ = ln.dh < 260;
      for (let s = 2; s < ln.l - 2 && n < MAX;) {
        const r = rng(); let kind, Lb;
        if (heroQ && r < 0.58) { kind = 'super'; Lb = 40 + rng() * 36; } else if (r < 0.6) { kind = 'cruiser'; Lb = 14 + rng() * 14; } else if (r < 0.75) { kind = 'bigsail'; Lb = 24 + rng() * 16; } else if (r < 0.9) { kind = 'sail'; Lb = 11 + rng() * 9; } else { kind = 'sport'; Lb = 9 + rng() * 5; }
        const Bm = beamOf(kind, Lb); const along = s + Bm / 2; if (along > ln.l - Bm / 2) break;
        const sx = ln.a[0] + tx * along, sz = ln.a[1] + tz * along; const cx = sx + ln.nx * (Lb / 2 + 1.6), cz = sz + ln.nz * (Lb / 2 + 1.6);
        if (rng() < 0.12 || !free(cx, cz, ln.nx, ln.nz, Lb, Bm)) { s += Bm * 0.6 + 0.8; continue; }
        const yaw = Math.atan2(-ln.nz, ln.nx) + (rng() - 0.5) * 0.03; const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(cx, seaY, cz);
        const o = kind === 'super' ? K.superyacht(m, Lb, rng, Lb > 60) : kind === 'cruiser' ? K.cruiser(m, Lb, rng) : kind === 'sport' ? K.sport(m, Lb, rng) : K.sail(m, Lb, rng, kind === 'bigsail');
        mark(cx, cz, ln.nx, ln.nz, Lb, Bm); n++; if (kind === 'super') nSuper++; s += Bm + 0.7 + rng() * 0.9;
        // at night: deck and saloon lights along the boat, an anchor light at the masthead, blue underwater lights on the big ones
        if (isNight()) {
          const ux = ln.nx, uz = ln.nz; const deck = kind === 'super' ? [2.6, 5.2, 7.6] : kind === 'cruiser' ? [2.2, 4.0] : [1.6];
          for (const dy of deck) for (let a = -0.32; a <= 0.32; a += kind === 'super' ? 0.08 : 0.16) EI.Night.addGlow(cx + ux * a * Lb, seaY + dy, cz + uz * a * Lb, kind === 'super' ? 1.6 : 1.2, rng() < 0.75 ? [1.0, 0.85, 0.6] : [0.85, 0.9, 1.0]);
          if (kind === 'sail' || kind === 'bigsail') EI.Night.addGlow(cx, seaY + Lb * 1.15, cz, 1.4, [1, 1, 1]);
          if (kind === 'super') for (const sd of [-1, 1]) for (let a = -0.3; a <= 0.3; a += 0.15) EI.Night.addGlow(cx + ux * a * Lb - uz * sd * Bm * 0.55, seaY + 0.15, cz + uz * a * Lb + ux * sd * Bm * 0.55, 2.6, [0.2, 0.75, 1.0]);
        }
        if (o) { const S = o.S || K.hullShape(o); const sy = (S.hd ? S.hd(0) : 1) + seaY; for (const sd of [-1, 1]) { const st = [cx - ln.nx * Lb / 2 + tx * sd * Bm * 0.4, sy, cz - ln.nz * Lb / 2 + tz * sd * Bm * 0.4]; const q = [sx + tx * sd * (Bm * 0.5 + 1.2) - ln.nx * 0.6, ln.y + 0.2, sz + tz * sd * (Bm * 0.5 + 1.2) - ln.nz * 0.6]; LN.rope(st, q, 0.35, ropeC, 5); } }
      }
    }
    // promenade lamps along the quays round the marina: slim posts with a lantern, a warm pool of light each
    { const postC = C(0x2b2f35); Q.set('white', 0.5, 0.4); let nl = 0;
      for (const ln of lines) { if (ln.dh > 450) continue; for (let s = 6; s < ln.l - 3; s += 22) { const x = ln.a[0] + (ln.b[0] - ln.a[0]) * s / ln.l - ln.nx * 2.2, z = ln.a[1] + (ln.b[1] - ln.a[1]) * s / ln.l - ln.nz * 2.2; const yq = ln.y; const mm = new THREE.Matrix4().makeTranslation(x, yq, z);
        Q.col(mm, 0, 0, 0, 4.2, 0.09, 0.06, 6, postC); Q.set('white', 0.4, 0, isNight() ? 2.5 : 0.3); Q.box(mm, 0.4, 0.5, 0.4, 0, 4.2, 0, C(0xffe2b0)); Q.set('white', 0.5, 0.4);
        if (isNight()) { EI.Night.addGlow(x, yq + 4.45, z, 2.2, [1.0, 0.82, 0.55]); if (nl % 2 === 0) EI.Night.addFlood(x, yq + 4.4, z, { power: 0.08, range: 24, color: [1.0, 0.82, 0.58] }); } nl++; } }
      out.promenadeLamps = nl; }
    W.add(N, 'yNear'); W.add(Fb, 'yFar'); W.add(LN, 'lines'); W.add(LF, 'lines'); W.add(Q, 'main');   // rigging and ropes share the coarse line cells
    const keep = E.seaY; E.seaY = seaY; ST.buildReflections(E, refl, []); E.seaY = keep;
    out.yachts = n; out.superyachts = nSuper; out.seaY = +seaY.toFixed(2);
  }

  // ================================================================ entry point (after the venue)
  Yas.build = function (E) {
    const T0 = performance.now(); const out = E.stats.yas = {};
    if (!SKx() || !SKx().Batch) return;
    const sc = E.sc; const world = SKx().world(sc); const R = regions(); if (EI.EnvYasArch && EI.EnvYasArch.regions) EI.EnvYasArch.regions();
    // the landmarks' static geometry (hotel, tower, arena, quays, Ferrari World) is one mesh: a handful of buildings spread over
    // a kilometre would otherwise cost a draw call per 600 m world cell they touch; the yachts keep the world's near / far cells
    const statics = []; const W = { add: (b, layer) => { if (layer === 'main') { if (b && b.count) statics.push(b); } else world.add(b, layer); }, mat: (k) => world.mat(k) };
    const step = (k, fn) => { const t0 = performance.now(); try { fn(); } catch (e) { console.error('EnvYas ' + k, e); } out['ms_' + k] = Math.round(performance.now() - t0); };
    step('hotel', () => buildHotel(E, W, R, out));
    step('ferrari', () => buildFerrari(E, W, R, out));
    step('arena', () => buildArena(E, W, R, out));
    step('marina', () => buildMarina(E, W, out));
    // the circuit architecture after the reference photos: stand sails, pit building, paddock tents, control towers, the start
    // bridge, the floodlight towers (js/env_yas_arch.js); the concert fan zone (js/env_yas_fan.js)
    const Hh = { W, R, prism, cap, batchMesh, alphaRegion, centroid };
    if (EI.EnvYasArch) step('arch', () => EI.EnvYasArch.build(E, Hh, out));
    if (EI.EnvYasFan) step('fan', () => EI.EnvYasFan.build(E, Hh, out));
    if (EI.EnvYasCity) step('city', () => EI.EnvYasCity.build(E, Hh, out));
    // the street kit's world is otherwise built at the end of a street circuit's track build: do it here
    step('world', () => world.build());
    step('statics', () => { if (!statics.length) return; const m = batchMesh(world, statics, 'yasStatic'); m.castShadow = true; m.receiveShadow = true; m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); sc.group.add(m); out.staticTris = m.userData.tris; });
    out.worldTris = world.stats.tris; out.worldMeshes = world.stats.meshes; out.ms = Math.round(performance.now() - T0);
  };
  // palms and other planting for EI.EnvVeg: [x, z, species name, width, height]
  Yas.trees = function (E) { return []; };
  EI.EnvYas = Yas;
})();
