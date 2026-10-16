// Equation I - street furniture for the street circuit (Monaco): street lamps (tall two-arm columns, the cast-iron Casino lanterns,
// curved single-arm lamps), bollards, planters, pedestrian footbridges over the circuit, painted road markings (zebra crossings,
// yellow escape-road hatching), manholes and drain grates, stone retaining walls and the hairpin's planted island. Placement comes
// from the hand lists in the track data (data.street, lap metres + side + offset beyond the barrier). Built into the scenery's
// merged statics (one vertex-coloured material) plus a few textured batches.
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  const SK = EI.StreetKit = {};
  const C = (h) => new THREE.Color(h).convertSRGBToLinear();
  const inR = (s, a, b) => (a <= b ? s >= a && s <= b : s >= a || s <= b);

  // ---------------------------------------------------------------- the Grand Hotel hairpin: centre of the planted island inside the turn
  SK.hairpin = function (t) {
    if (t._hairpin !== undefined) return t._hairpin;
    const c = t.data.corners.find(cc => /hairpin/i.test(cc.name)); if (!c) return (t._hairpin = null);
    const kk = t.smooth(t.k, 4); let best = -1, bk = 0;
    for (let s = c.s - 20; s < c.s + 90; s += 1) { const i = t.idxAtS(s); if (Math.abs(kk[i]) > bk) { bk = Math.abs(kk[i]); best = i; } }
    if (bk < 0.04) return (t._hairpin = null);
    const side = kk[best] > 0 ? 1 : -1; let cx = 0, cz = 0, w = 0; const idx = [];
    for (let j = -40; j <= 40; j++) { const i = (best + j + t.n) % t.n; const k = Math.abs(kk[i]); if (k < bk * 0.6) continue; const R = 1 / k; cx += (t.x[i] + t.nx[i] * side * R) * k; cz += (t.z[i] + t.nz[i] * side * R) * k; w += k; idx.push(i); }
    cx /= w; cz /= w; let r = Infinity; for (let j = -60; j <= 60; j++) { const i = (best + j + t.n) % t.n; const d = Math.hypot(t.x[i] - cx, t.z[i] - cz) - t.halfWidth - 1.45; if (d < r) r = d; }
    const s0 = t.s[idx[0]] - 8, s1 = t.s[idx[idx.length - 1]] + 8;
    return (t._hairpin = r > 2 ? { cx, cz, r, side, s0, s1, y: t.y[best] } : null);
  };

  // ---------------------------------------------------------------- placement context
  function ctx(E) {
    const t = E.t, D = t.data, Z = t.streetZones ? t.streetZones() : null;
    // building footprints near the circuit on a 20 m hash, for "is this spot inside a building" tests
    const H = new Map(), G = 20; const key = (x, z) => Math.floor(x / G) * 4096 + Math.floor(z / G);
    for (const b of D.scenery.buildings.concat(D.scenery.grandstands)) {
      const p = b.p; if (!p || p.length < 3) continue; const bx = U.polyBounds(p); if (E.dcAt((bx.x0 + bx.x1) / 2, (bx.z0 + bx.z1) / 2) > 140) continue;
      for (let x = Math.floor(bx.x0 / G); x <= Math.floor(bx.x1 / G); x++) for (let z = Math.floor(bx.z0 / G); z <= Math.floor(bx.z1 / G); z++) { const k = x * 4096 + z; let l = H.get(k); if (!l) H.set(k, l = []); l.push(p); }
    }
    const inBuilding = (x, z, pad) => { for (const dx of [-pad, 0, pad]) for (const dz of [-pad, 0, pad]) { const l = H.get(key(x + dx, z + dz)); if (l) for (const p of l) if (U.pointInPoly(x + dx, z + dz, p)) return true; } return false; };
    const back = (i, side) => (Z ? Z[side].back[i] : 0);
    const wallAt = (i, side) => (side < 0 ? t.wallL[i] : t.wallR[i]);
    // point at lap distance s, `off` metres beyond the barrier line on `side` (interpolated), with the local axes
    const at = (s, side, off) => {
      const f = U.mod(s / t.ds, t.n); const i = Math.floor(f), j = (i + 1) % t.n, u = f - i;
      let d = U.lerp(wallAt(i, side), wallAt(j, side), u) + back(i, side) + off;
      const kf = t.kFold[i]; if ((kf > 0 && side > 0) || (kf < 0 && side < 0)) d = Math.min(d, Math.max(2, 0.88 / (Math.abs(kf) + 1e-6)));
      const x = U.lerp(t.x[i], t.x[j], u) + t.nx[i] * side * d, z = U.lerp(t.z[i], t.z[j], u) + t.nz[i] * side * d;
      return { x, z, y: E.ground(x, z), tx: t.tx[i], tz: t.tz[i], nx: t.nx[i] * side, nz: t.nz[i] * side, i, d };
    };
    const sideOf = (spec, a, b) => { if (spec === 1 || spec === -1) return spec; const kk = t.smooth(t.k, 12); let sum = 0; for (let s = a; s <= b; s += 2) sum += kk[t.idxAtS(s)]; const out = sum > 0 ? -1 : 1; return spec === 'out' ? out : -out; };
    const runs = (s0, s1, spacing, fn) => { const L = t.length; const len = U.mod(s1 - s0, L) || L; for (let a = spacing * 0.5; a < len; a += spacing) fn(U.mod(s0 + a, L)); };
    const inTunnel = (s) => D.tunnel && s > D.tunnel.s0 - 8 && s < D.tunnel.s1 + 8;
    return { t, D, Z, at, sideOf, runs, inBuilding, inTunnel, wallAt, back };
  }

  // ---------------------------------------------------------------- geometry helpers (local frames, vertex colours)
  // round column between heights y0 and y1 at local (x, z) of frame m
  function col(B, m, x, z, y0, y1, r0, r1, seg, c, cap) {
    const P = (lx, ly, lz) => EI.Env.xf(m, lx, ly, lz);
    for (let k = 0; k < seg; k++) {
      const a0 = k / seg * 6.2832, a1 = (k + 1) / seg * 6.2832;
      const A = P(x + Math.cos(a0) * r0, y0, z + Math.sin(a0) * r0), Bq = P(x + Math.cos(a1) * r0, y0, z + Math.sin(a1) * r0), Cq = P(x + Math.cos(a1) * r1, y1, z + Math.sin(a1) * r1), D = P(x + Math.cos(a0) * r1, y1, z + Math.sin(a0) * r1);
      B.quad(A, D, Cq, Bq, c);
      if (cap) B.tri(P(x, y1, z), Cq, D, c);
    }
  }
  // low-poly sphere / ellipsoid (lantern globes, shrub balls)
  function ball(B, m, x, y, z, rx, ry, rz, c, seg) {
    seg = seg || 6; const P = (lx, ly, lz) => EI.Env.xf(m, lx, ly, lz); const rows = Math.max(3, seg >> 1);
    for (let r = 0; r < rows; r++) for (let k = 0; k < seg; k++) {
      const p0 = r / rows * Math.PI, p1 = (r + 1) / rows * Math.PI, a0 = k / seg * 6.2832, a1 = (k + 1) / seg * 6.2832;
      const V = (p, a) => P(x + Math.sin(p) * Math.cos(a) * rx, y + Math.cos(p) * ry, z + Math.sin(p) * Math.sin(a) * rz);
      B.quad(V(p0, a0), V(p0, a1), V(p1, a1), V(p1, a0), c);
    }
  }
  SK.col = col; SK.ball = ball;

  // ---------------------------------------------------------------- street lamps
  function lampDouble(B, m, c) {
    // ~10.5 m tapered steel column, a pair of long arms at the top across the column, flat luminaires
    col(B, m, 0, 0, 0, 0.6, 0.2, 0.2, 8, c.dark);
    col(B, m, 0, 0, 0.6, 10.2, 0.12, 0.075, 8, c.steel, true);
    for (const sd of [-1, 1]) {
      B.beam(m, [0, 9.9, 0], [0, 10.25, sd * 2.1], 0.07, c.steel);
      B.box(m, 0.32, 0.13, 0.9, 0, 10.14, sd * 2.45, c.steel); B.box(m, 0.26, 0.02, 0.76, 0, 10.12, sd * 2.45, c.lamp);
    }
    B.beam(m, [0, 7.4, 0], [0, 7.6, 1.3], 0.05, c.steel); B.box(m, 0.25, 0.1, 0.55, 0, 7.55, 1.5, c.steel); B.box(m, 0.2, 0.02, 0.45, 0, 7.53, 1.5, c.lamp);
  }
  function lampCasino(B, m, c) {
    // cast-iron candelabra: plinth, fluted shaft, collar, crown of five lanterns with gilded finials
    B.box(m, 0.62, 0.55, 0.62, 0, 0, 0, c.iron); B.box(m, 0.5, 0.18, 0.5, 0, 0.55, 0, c.iron);
    col(B, m, 0, 0, 0.73, 3.4, 0.13, 0.085, 8, c.iron); col(B, m, 0, 0, 3.4, 3.6, 0.16, 0.16, 8, c.gold, true);
    col(B, m, 0, 0, 3.6, 4.4, 0.07, 0.06, 6, c.iron);
    for (let k = 0; k < 4; k++) { const a = k / 4 * 6.2832 + 0.4; const x = Math.cos(a) * 0.62, z = Math.sin(a) * 0.62; B.beam(m, [0, 3.85, 0], [x, 4.0, z], 0.05, c.iron); col(B, m, x, z, 4.0, 4.12, 0.1, 0.1, 6, c.iron, true); ball(B, m, x, 4.36, z, 0.19, 0.24, 0.19, c.globe, 6); B.box(m, 0.05, 0.12, 0.05, x, 4.6, z, c.gold); }
    ball(B, m, 0, 4.7, 0, 0.22, 0.28, 0.22, c.globe, 6); B.box(m, 0.06, 0.18, 0.06, 0, 4.98, 0, c.gold);
  }
  function lampArc(B, m, c) {
    // modern column with one long curved arm reaching over the road (+z towards the track)
    col(B, m, 0, 0, 0, 7.5, 0.1, 0.075, 8, c.steel, false);
    let p = [0, 7.5, 0]; for (let k = 1; k <= 6; k++) { const a = k / 6 * Math.PI * 0.5; const q = [0, 7.5 + Math.sin(a) * 1.6, (1 - Math.cos(a)) * 1.6 + k * 0.28]; B.beam(m, p, q, 0.07, c.steel); p = q; }
    B.box(m, 0.3, 0.12, 0.85, 0, p[1] - 0.06, p[2] + 0.3, c.steel); B.box(m, 0.24, 0.02, 0.7, 0, p[1] - 0.075, p[2] + 0.3, c.lamp);
  }

  // ---------------------------------------------------------------- footbridges over the circuit
  function footbridge(K, B, banners, s, style) {
    const t = K.t; const i = t.idxAtS(s); const pL = K.at(s, -1, 2.4), pR = K.at(s, 1, 2.4); const y = Math.max(t.y[i] + 6.4, pL.y + 6.4, pR.y + 6.4);
    const cx = (pL.x + pR.x) / 2, cz = (pL.z + pR.z) / 2; const span = Math.hypot(pR.x - pL.x, pR.z - pL.z);
    const m = EI.Env.frame(cx, t.y[i], cz, t.tx[i], t.tz[i], t.nx[i], t.nz[i]); const yy = y - t.y[i];
    const white = C(0xeceeee), steel = C(0x8e959c), glass = C(0x5d7a90), dark = C(0x2c3036), stone = C(0xd8ccb2);
    const deckW = style === 'casino' ? 3.4 : 2.8;
    // deck girder, floor, glazed / steel parapets and a light canopy on the pool bridge
    B.box(m, deckW, 1.0, span + 1.2, 0, yy - 1.0, 0, style === 'casino' ? stone : white, { bottom: true });
    for (const sd of [-1, 1]) { B.box(m, 0.08, 1.15, span + 1.2, sd * (deckW / 2 - 0.04), yy, 0, glass); B.box(m, 0.14, 0.1, span + 1.2, sd * (deckW / 2 - 0.04), yy + 1.15, 0, steel); }
    if (style === 'pool') { B.box(m, deckW + 0.6, 0.12, span + 1.2, 0, yy + 2.6, 0, white, { bottom: true }); for (let z = -span / 2; z <= span / 2 + 0.1; z += span / 4) for (const sd of [-1, 1]) B.beam(m, [sd * (deckW / 2), yy, z], [sd * (deckW / 2), yy + 2.6, z], 0.1, steel); }
    // stair towers beyond the fences on both sides
    for (const sd of [-1, 1]) {
      const zc = sd * (span / 2 + 2.2); B.box(m, 3.6, yy + 1.2, 3.2, 0, 0, zc, style === 'casino' ? stone : C(0xd5d8db)); B.box(m, 3.8, 0.25, 3.4, 0, yy + 1.2, zc, white);
      for (let h = 1.5; h < yy; h += 1.5) B.box(m, 3.7, 0.1, 3.3, 0, h, zc, dark);
    }
    // partner banners along both faces of the girder
    for (const face of [-1, 1]) banners.push({ m, x: face * (deckW / 2 + 0.03), y: yy - 0.95, w: span + 1.0, h: 0.9, face, k: Math.round(s) % 8 });
  }

  // ---------------------------------------------------------------- road paint (zebras, escape-road hatching), manholes and grates
  function paint(K, P, G) {
    const t = K.t, D = K.D, hw = t.halfWidth; const white = C(0xf1f1ee), yellow = C(0xf0c419), metal = C(0x4a4b4e);
    const quad = (Bt, pts, c, uvs) => { const base = Bt.p.length / 3; for (let k = 0; k < 4; k++) { const q = pts[k]; Bt.p.push(q[0], q[1], q[2]); Bt.c.push(c.r, c.g, c.b); Bt.uv.push(uvs ? uvs[k][0] : (k === 1 || k === 2 ? 1 : 0), uvs ? uvs[k][1] : (k >= 2 ? 1 : 0)); } Bt.i.push(base, base + 2, base + 1, base, base + 3, base + 2); };
    const pt = (s, lat, dy) => { const f = t.frameAt(s); return [f.x + f.nx * lat, f.y + (dy || 0.014), f.z + f.nz * lat]; };
    // zebra crossings: bars 0.5 m wide every metre across the road, running with the traffic
    for (const [s, w] of D.street.zebras || []) for (let lat = -hw + 0.55; lat < hw - 0.5; lat += 1.0) quad(P, [pt(s - w / 2, lat), pt(s + w / 2, lat), pt(s + w / 2, lat + 0.5), pt(s - w / 2, lat + 0.5)], white);
    // yellow hatching on the escape areas: a border line and 45 degree bars, from behind the kerb to short of the barrier
    for (const [s0, s1, spec] of D.street.yellow || []) {
      const sd = K.sideOf(spec, s0, s1); const wall = sd < 0 ? t.wallL : t.wallR; const a = hw + t.kerbWidth + 0.35;
      for (let s = s0; s < s1; s += 1.0) { const i = t.idxAtS(s); const b = wall[i] - 0.5; if (b - a < 1.2) continue; quad(P, [pt(s, sd * a), pt(s + 1.02, sd * a), pt(s + 1.02, sd * (a + 0.15)), pt(s, sd * (a + 0.15))], yellow); quad(P, [pt(s, sd * (b - 0.15)), pt(s + 1.02, sd * (b - 0.15)), pt(s + 1.02, sd * b), pt(s, sd * b)], yellow); }
      for (let s = s0; s < s1 - 2; s += 2.6) { const i = t.idxAtS(s); const b = wall[i] - 0.65; const w = b - a - 0.3; if (w < 1) continue; const steps = Math.ceil(w / 0.6); for (let k = 0; k < steps; k++) { const l0 = a + 0.15 + k * w / steps, l1 = a + 0.15 + (k + 1) * w / steps; const ds0 = (l0 - a) * 0.9, ds1 = (l1 - a) * 0.9; if (s + ds1 + 0.45 > s1) break; quad(P, [pt(s + ds0, sd * l0), pt(s + ds0 + 0.45, sd * l0), pt(s + ds1 + 0.45, sd * l1), pt(s + ds1, sd * l1)], yellow); } }
    }
    // drain grates along both gutters every ~18 m, manholes on the road every ~45 m (not in the tunnel's gutter-less stretch)
    const rng = U.rng(4545); const L = t.length;
    for (let s = 5; s < L; s += 16 + rng() * 6) for (const sd of [-1, 1]) { if (rng() < 0.3) continue; const lat = sd * (hw + 0.55); quad(G, [pt(s - 0.4, lat - 0.25, 0.016), pt(s + 0.4, lat - 0.25, 0.016), pt(s + 0.4, lat + 0.25, 0.016), pt(s - 0.4, lat + 0.25, 0.016)], C(0xffffff), [[0, 0], [1, 0], [1, 1], [0, 1]]); }
    for (let s = 20; s < L; s += 35 + rng() * 25) { const lat = (rng() - 0.5) * (hw * 1.4); const r = 0.36; const pts = []; const f = t.frameAt(s); for (let k = 0; k < 8; k++) { const a = k / 8 * 6.2832; pts.push([f.x + f.nx * (lat + Math.cos(a) * r) + f.tx * Math.sin(a) * r, f.y + 0.015, f.z + f.nz * (lat + Math.cos(a) * r) + f.tz * Math.sin(a) * r]); }
      const c0 = [f.x + f.nx * lat, f.y + 0.015, f.z + f.nz * lat]; for (let k = 0; k < 8; k++) { const base = P.p.length / 3; for (const q of [c0, pts[k], pts[(k + 1) % 8]]) { P.p.push(q[0], q[1], q[2]); P.c.push(metal.r, metal.g, metal.b); P.uv.push(q[0] * 0.8, q[2] * 0.8); } P.i.push(base, base + 2, base + 1); } }
  }
  function batchMesh(Bt, mat, name) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(Bt.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(Bt.c, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(Bt.uv, 2));
    const nr = new Float32Array(Bt.p.length); for (let i = 1; i < nr.length; i += 3) nr[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(nr, 3)); g.setIndex(Bt.i); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.name = name; m.receiveShadow = true; return m;
  }

  // ---------------------------------------------------------------- trees for the vegetation module: [x, z, species, width, height]
  // species names: 'pine' (umbrella / stone pine), 'palm', 'cypress', 'oleander', 'shrub', 'cactus'
  SK.trees = function (E) {
    const K = ctx(E), t = K.t, ST = K.D.street; if (!ST) return [];
    const out = []; const rng = U.rng(8181);
    const size = (sp) => sp === 'pine' ? [11 + rng() * 6, 12 + rng() * 5] : sp === 'palm' ? [6 + rng() * 2.5, 9 + rng() * 6] : sp === 'cypress' ? [2.6 + rng() * 1, 10 + rng() * 5] : sp === 'cactus' ? [1.6, 2.6 + rng() * 1.2] : [2.6 + rng() * 1.4, 2.2 + rng() * 1.2];
    // never on the pit lane, its entry / exit roads or the garages (the corridor beside the start straight on the pit side)
    const pit = K.D.pit || []; const pr = {}; const sf = t.sf || 0; const lapD = (a, b) => { const d = Math.abs(a - b) % t.length; return Math.min(d, t.length - d); };
    const onPit = (x, z) => { for (let k = 0; k + 1 < pit.length; k++) if (EI.Env.segDist ? EI.Env.segDist(x, z, pit[k][0], pit[k][1], pit[k + 1][0], pit[k + 1][1]) < 7 : false) return true; t.project(x, z, null, pr); const side = pr.lat < 0 ? -1 : 1; return side === E.pitSide && lapD(pr.s, sf) < 228 && pr.dist > K.wallAt(pr.i, side) + 2.4; };
    const ok = (x, z) => !K.inBuilding(x, z, 1.2) && E.fsAt(x, z) > 0.8 && !onPit(x, z);
    for (const [sp, s0, s1, side, off, spacing] of ST.plant || []) {
      K.runs(s0, s1, spacing, (s) => { if (K.inTunnel(s)) return; const p = K.at(s + (rng() - 0.5) * spacing * 0.3, side, off + rng() * 1.2); if (!ok(p.x, p.z)) return; const [w, h] = size(sp); out.push([p.x, p.z, sp, w, h]); });
    }
    // the hairpin island: a few palms and cacti among the flowers
    const isl = SK.hairpin(t); if (isl) { const r = isl.r; for (const [a, d, sp] of [[0.4, 0.45, 'palm'], [2.5, 0.35, 'palm'], [4.3, 0.5, 'palm'], [1.4, 0.6, 'cactus'], [3.3, 0.62, 'cactus'], [5.4, 0.3, 'oleander']]) { const [w, h] = size(sp); out.push([isl.cx + Math.cos(a) * r * d, isl.cz + Math.sin(a) * r * d, sp, sp === 'palm' ? w * 0.8 : w, sp === 'palm' ? h * 0.8 : h]); } }
    return out;
  };
  // species of a map street tree by stretch of the lap (data.street.treeRules)
  SK.treeSpecies = function (E, x, z) {
    const t = E.t, rules = (t.data.street || {}).treeRules || []; const p = t.project(x, z, null, {}); const side = p.lat < 0 ? -1 : 1;
    for (const [s0, s1, sd, sp] of rules) if (inR(p.s, s0, s1) && (!sd || sd === side)) return sp;
    return null;
  };

  // ---------------------------------------------------------------- build (called from EnvStreet.build, before the statics are merged)
  SK.build = function (E) {
    const T0 = performance.now(); const sc = E.sc, K = ctx(E), t = K.t, ST = K.D.street; if (!ST) return;
    const B = new EI.Env.Builder(), Bm = new EI.Env.Builder(), Bc = new EI.Env.Builder(); // main (stone, paint) / main metal / clutter layers
    const cl = { dark: C(0x3a3e44), steel: C(0x9aa1a8), lamp: C(0xfff4d6), iron: C(0x1f2622), gold: C(0xb08a3a), globe: C(0xf4f0e2) };
    let nLamp = 0, nBoll = 0, nPlant = 0;
    // ---- lamps: column on the pavement, arms reaching towards the road
    for (const [kind, s0, s1, side, off, spacing] of ST.lamps || []) K.runs(s0, s1, spacing, (s) => {
      if (K.inTunnel(s)) return; const p = K.at(s, side, off); if (K.inBuilding(p.x, p.z, 0.6)) return;
      const m = EI.Env.frame(p.x, p.y, p.z, p.tx, p.tz, -p.nx, -p.nz); // +z towards the track
      if (kind === 'double') lampDouble(Bm, m, cl); else if (kind === 'casino') lampCasino(Bm, m, cl); else lampArc(Bm, m, cl); nLamp++;
    });
    // ---- bollards (black posts with a steel cap) and planters (stone troughs with clipped shrubs or flowers)
    for (const [s0, s1, side, off, spacing] of ST.bollards || []) K.runs(s0, s1, spacing, (s) => { const p = K.at(s, side, off); if (K.inBuilding(p.x, p.z, 0.3)) return; const m = EI.Env.frame(p.x, p.y, p.z, p.tx, p.tz, -p.nx, -p.nz); col(Bc, m, 0, 0, 0, 0.85, 0.07, 0.07, 6, C(0x1d1f22)); col(Bc, m, 0, 0, 0.85, 0.95, 0.08, 0.05, 6, C(0xb7bcc0), true); nBoll++; });
    const rngP = U.rng(311);
    for (const [s0, s1, side, off, spacing] of ST.planters || []) K.runs(s0, s1, spacing, (s) => {
      const p = K.at(s, side, off); if (K.inBuilding(p.x, p.z, 0.8)) return; const m = EI.Env.frame(p.x, p.y, p.z, p.tx, p.tz, -p.nx, -p.nz);
      const stone = C([0xd9cdb4, 0xc9b79a, 0xb06a4a][Math.floor(rngP() * 3)]); B.box(m, 1.6, 0.62, 0.9, 0, 0, 0, stone); B.box(m, 1.5, 0.05, 0.8, 0, 0.6, 0, C(0x4a3a2a));
      const flowers = rngP() < 0.45; for (let k = 0; k < 3; k++) ball(B, m, -0.5 + k * 0.5, 0.82, 0, 0.32, 0.28, 0.32, flowers ? C([0xd23a6e, 0xe86a9a, 0xf2f0f0, 0xc81d3a][Math.floor(rngP() * 4)]) : C(0x3b5a2a), 5); nPlant++;
    });
    // ---- stone retaining walls behind the fences (rough-cut limestone, a balustrade on top)
    const W = { p: [], c: [], uv: [], i: [] };
    for (const [s0, s1, side, h] of ST.retaining || []) {
      let prev = null, u = 0;
      for (let s = s0; s <= s1 + 0.01; s += 2) {
        const p = K.at(s, side, 2.2); const y0 = p.y - 0.3, y1 = p.y + h;
        if (prev) { u += Math.hypot(p.x - prev.x, p.z - prev.z) / 4; const base = W.p.length / 3; for (const [q, uu] of [[prev, prev.u], [p, u]]) { W.p.push(q.x, q.y - 0.3, q.z, q.x, q.y + h, q.z); W.uv.push(uu, 0, uu, (h + 0.3) / 2); W.c.push(1, 1, 1, 1, 1, 1); } W.i.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
          const m = EI.Env.frame(p.x, y1, p.z, p.tx, p.tz, -p.nx, -p.nz); Bc.box(m, 2.05, 0.18, 0.6, 0, 0, -0.3, C(0xd8ccb2)); for (let k = -0.8; k <= 0.81; k += 0.4) Bc.box(m, 0.12, 0.8, 0.12, k, 0.18, -0.15, C(0xe2d7c0)); Bc.box(m, 2.05, 0.12, 0.25, 0, 0.98, -0.15, C(0xd8ccb2)); }
        prev = p; prev.u = u;
      }
    }
    if (W.p.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(W.p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(W.uv, 2)); g.setIndex(W.i); g.computeVertexNormals(); g.computeBoundingSphere();
      const tex = t.streetTextures().stone; const mm = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0, side: THREE.DoubleSide })); mm.name = 'retainingWalls'; mm.castShadow = true; mm.receiveShadow = true; sc.group.add(mm); }
    // ---- the hairpin island: raised planted bed inside a red / white kerb ring
    const isl = SK.hairpin(t);
    if (isl) {
      const I = new THREE.Matrix4(); const y = E.ground(isl.cx, isl.cz); const r = isl.r; const seg = 40; const red = C(0xc8102e), white = C(0xf2f2f0), soil = C(0x4a3a28), green = C(0x2f4a24);
      for (let k = 0; k < seg; k++) {
        const a0 = k / seg * 6.2832, a1 = (k + 1) / seg * 6.2832; const P = (a, rr, h) => [isl.cx + Math.cos(a) * rr, y + h, isl.cz + Math.sin(a) * rr];
        const c = (k >> 1) & 1 ? red : white;
        B.quad(P(a0, r + 0.6, 0.02), P(a1, r + 0.6, 0.02), P(a1, r, 0.2), P(a0, r, 0.2), c); B.quad(P(a0, r, 0.2), P(a1, r, 0.2), P(a1, r - 0.35, 0.22), P(a0, r - 0.35, 0.22), c);
        B.quad(P(a0, r - 0.35, 0.22), P(a1, r - 0.35, 0.22), P(a1, r - 0.4, 0.42), P(a0, r - 0.4, 0.42), C(0xd8d2c4));
        B.tri(P(a0, r - 0.4, 0.42), P(a1, r - 0.4, 0.42), [isl.cx, y + 0.62, isl.cz], k % 3 ? soil : green);
      }
      const rng = U.rng(77); for (let k = 0; k < 26; k++) { const a = rng() * 6.2832, d = Math.sqrt(rng()) * (r - 1.0); const cc = [C(0x3d6a2c), C(0xc8285a), C(0xe8d23a), C(0x4e7a34), C(0xd84a8a)][k % 5]; ball(B, I, isl.cx + Math.cos(a) * d, y + 0.75, isl.cz + Math.sin(a) * d, 0.45 + rng() * 0.35, 0.3 + rng() * 0.2, 0.45 + rng() * 0.35, cc, 5); }
      E.stats.hairpinIsland = Math.round(r * 10) / 10;
    }
    // ---- footbridges and their partner banners
    const banners = [];
    for (const [s, style] of ST.footbridges || []) footbridge(K, B, banners, s, style);
    if (banners.length) {
      const geos = []; for (const b of banners) { const g = new THREE.PlaneGeometry(b.w, b.h); g.rotateY(b.face * Math.PI / 2); const uv = g.attributes.uv; for (let v = 0; v < uv.count; v++) uv.setXY(v, uv.getX(v) * b.w / 8, 1 - (b.k + 1 - (0.03 + uv.getY(v) * 0.94)) / 8); g.translate(b.x, b.y + b.h / 2, 0); g.applyMatrix4(b.m); geos.push(g); }
      const tex = t.streetTextures().cover; const mm = new THREE.Mesh(EI.Env.merge(geos), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, side: THREE.DoubleSide })); mm.name = 'bridgeBanners'; sc.group.add(mm);
    }
    // ---- road paint and ironwork (decals on the asphalt)
    const P = { p: [], c: [], uv: [], i: [] }, G = { p: [], c: [], uv: [], i: [] }; paint(K, P, G); const X = t.streetTextures();
    if (P.p.length) sc.group.add(batchMesh(P, new THREE.MeshStandardMaterial({ map: X.paint, vertexColors: true, roughness: 0.62, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), 'streetPaint'));
    if (G.p.length) sc.group.add(batchMesh(G, new THREE.MeshStandardMaterial({ map: X.grate, roughness: 0.5, metalness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), 'streetGrates'));
    sc.statics.add(B.geometry(), 0.7, 0.05, 'main'); sc.statics.add(Bm.geometry(), 0.42, 0.55, 'main'); sc.statics.add(Bc.geometry(), 0.45, 0.5, 'clutter');
    E.stats.streetKit = { lamps: nLamp, bollards: nBoll, planters: nPlant, footbridges: (ST.footbridges || []).length, tris: Math.round((B.count + Bm.count + Bc.count) / 3) };
    E.timings.streetKit = Math.round(performance.now() - T0);
  };
})();
