// Equation I - Spa-Francorchamps (SPA-MODELS): the venue's structures after the reference photos (swarm/staging/spa_refs). This file is the
// entry point: lap helpers, the hooks into the shared venue / scenery passes (gated by isSpa, the other circuits are untouched), and the
// pit complex - the long grey RIBBED pit building with the glazed first-floor gallery and balcony, the podium balcony with its blue/white
// chequered backdrop, the taller race-control block with red-brick offices at its foot, the roof terrace and the white paddock marquees.
// The stands are in js/env_spa_stands.js, the start gantry / towers / footbridges / culvert in js/env_spa_infra.js.
// Spa is a SLOPE track: the pit straight climbs ~17 m along the building, the ground falls 1-9 m behind it; everything follows the lane's
// own level (the formula of js/pit.js) and drops its walls to the drawn ground (sc.height), so nothing floats or hangs over a drop.
// Static geometry is vertex-coloured into the scenery's merged chunked statics (no new material / program); signs, digits, the podium
// backdrop and flags share one canvas atlas mesh (EnvMonza.Atlas); High-only detail goes into a 'spaHigh' group hidden on Low / Medium.
window.EI = window.EI || {};
(function () {
  const U = EI.U, Env = EI.Env, Mz = EI.EnvMonza; if (!Env || !Mz) return;
  const K = Mz.K, C = K.C;
  const Sp = {}; const isSpa = (t) => !!(t && t.data && t.data.id === 'spa');
  Sp.isSpa = isSpa; Sp.K = K; Sp.C = C;

  // ================================================================ lap helpers
  // turn-in s of a corner by its TURN NUMBER (SPEC v2 §0: never by name or a hard-coded s); 'line' / null = the start line
  Sp.cs = function (t, n) { if (n == null || n === 'line') return t.sf || 0; const c = t.data.corners.find(k => k.t === n); return c ? c.s : (t.sf || 0); };
  // interpolated lap frame at s on `side` (+1 = the +lat side), lateral d from the centre line
  Sp.at = function (t, s, side, d, o) {
    o = o || {}; const f = U.mod(s / t.ds, t.n); const i = Math.floor(f), j = (i + 1) % t.n, u = f - i;
    let tx = U.lerp(t.tx[i], t.tx[j], u), tz = U.lerp(t.tz[i], t.tz[j], u); const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const nx = U.lerp(t.nx[i], t.nx[j], u) * side, nz = U.lerp(t.nz[i], t.nz[j], u) * side;
    o.x = U.lerp(t.x[i], t.x[j], u) + nx * d; o.z = U.lerp(t.z[i], t.z[j], u) + nz * d; o.y = U.lerp(t.y[i], t.y[j], u);
    o.tx = tx; o.tz = tz; o.nx = nx; o.nz = nz; o.i = u < 0.5 ? i : j; return o;
  };
  // the outside of the bend at s (+1 / -1 in lat terms), as track.js outsideAt
  Sp.outside = function (t, s) { if (!t._spKK) t._spKK = t.smooth(t.k, 15); return t._spKK[t.idxAtS(s)] > 0 ? -1 : 1; };
  // a quad facing `want` (a world direction): the winding follows from its own normal
  Sp.face = function (Bd, a, b, c, d, col, want) { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2]; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; if (nx * want[0] + ny * want[1] + nz * want[2] >= 0) Bd.quad(a, b, c, d, col); else Bd.quad(d, c, b, a, col); };
  // atlas quad facing `want` (u runs a->b as seen from the front)
  Sp.faceA = function (A, r, a, b, c, d, want, u0, u1, v0, v1) { u0 = u0 || 0; u1 = u1 == null ? 1 : u1; v0 = v0 || 0; v1 = v1 == null ? 1 : v1; const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2]; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; if (nx * want[0] + ny * want[1] + nz * want[2] >= 0) A.quad(r, a, b, c, d, u0, u1, v0, v1); else A.quad(r, b, a, d, c, u1, u0, v0, v1); };
  // a box given by its 8 corners (any shape: curved / sloped frames): faces wound outwards from the centroid
  Sp.hex = function (Bd, c8, col, top, skipBottom) {
    // c8: [x0y0z0, x1y0z0, x1y0z1, x0y0z1, x0y1z0, x1y1z0, x1y1z1, x0y1z1]
    let cx = 0, cy = 0, cz = 0; for (const p of c8) { cx += p[0] / 8; cy += p[1] / 8; cz += p[2] / 8; }
    const F = [[0, 1, 2, 3, 0], [4, 5, 6, 7, 1], [0, 1, 5, 4, 0], [1, 2, 6, 5, 0], [2, 3, 7, 6, 0], [3, 0, 4, 7, 0]];
    F.forEach((f, k) => { if (k === 0 && skipBottom) return; const a = c8[f[0]], b = c8[f[1]], c = c8[f[2]], d = c8[f[3]]; const mx = (a[0] + c[0]) / 2 - cx, my = (a[1] + c[1]) / 2 - cy, mz = (a[2] + c[2]) / 2 - cz; Sp.face(Bd, a, b, c, d, k === 1 && top ? top : col, [mx, my, mz]); });
  };
  Sp.paintFlagBE = (x2, w, h) => { x2.fillStyle = '#111111'; x2.fillRect(0, 0, w / 3 + 1, h); x2.fillStyle = '#fdda24'; x2.fillRect(w / 3, 0, w / 3 + 1, h); x2.fillStyle = '#ef3340'; x2.fillRect(2 * w / 3, 0, w / 3 + 1, h); };
  Sp.paintFlagNL = (x2, w, h) => { x2.fillStyle = '#ae1c28'; x2.fillRect(0, 0, w, h / 3 + 1); x2.fillStyle = '#ffffff'; x2.fillRect(0, h / 3, w, h / 3 + 1); x2.fillStyle = '#21468b'; x2.fillRect(0, 2 * h / 3, w, h / 3 + 1); };
  Sp.paintFlagOrange = (x2, w, h) => { x2.fillStyle = '#ff6a00'; x2.fillRect(0, 0, w, h); x2.fillStyle = '#ffffff'; x2.font = 'italic 900 ' + Math.round(h * 0.42) + 'px Arial'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText('GO MAX', w / 2, h / 2); };

  // ================================================================ hooks into the shared passes (Spa only)
  const V = EI.EnvVenue;
  if (V) {
    // venue layout: ENVDATA.spa.standRuns and the OSM grandstand footprints are laid out by js/env_spa_stands.js (styles, slopes)
    const oLayout = V.layout;
    V.layout = function (E) {
      if (!isSpa(E.t)) return oLayout.call(this, E);
      const S = E.t.data.scenery; E._spGs = S.grandstands; S.grandstands = []; const runs = E.data.standRuns; E.spStandRuns = runs; E.data.standRuns = [];
      try { return oLayout.call(this, E); } finally { E.data.standRuns = runs; }
    };
    const oLS = V.layoutStands;
    V.layoutStands = function (E) {
      const r = oLS.call(this, E);
      if (isSpa(E.t)) { for (const [k, fn] of [['pit', () => Sp.layoutPit(E)], ['stands', () => Sp.Stands && Sp.Stands.layout(E)], ['infra', () => Sp.Infra && Sp.Infra.layout && Sp.Infra.layout(E)]]) { try { fn(); } catch (e) { console.error('EnvSpa layout ' + k, e); } } }
      return r;
    };
    const oBuild = V.build;
    V.build = function (E) {
      // the drawn ground is final now (terrain + verge built): re-fit every Spa floor / base before the venue builds the stands and crowd
      if (isSpa(E.t)) { try { E._spPF = undefined; if (Sp.Stands && Sp.Stands.refit) Sp.Stands.refit(E); } catch (e) { console.error('EnvSpa refit', e); } }
      const r = oBuild.call(this, E);
      if (isSpa(E.t)) { try { Sp.build(E); } catch (e) { console.error('EnvSpa build', e); } finally { if (E._spGs) E.t.data.scenery.grandstands = E._spGs; } }
      if (isSpa(E.t)) { try { Sp.pitLod(E); } catch (e) { console.error('EnvSpa pitLod', e); } }
      return r;
    };
    // the crowd: Dutch orange and Belgian colours in the stands; the spectator banks (Kemmel, Pouhon, Blanchimont) join the same
    // instanced crowd (one draw call): the finalized set is rebuilt with the bank records appended
    const oCrowd = V.crowd;
    V.crowd = function (E, set, carpet) {
      if (isSpa(E.t) && set && set.data) { try { set = Sp.crowd(E, set); } catch (e) { console.error('EnvSpa crowd', e); } }
      return oCrowd.call(this, E, set, carpet);
    };
  }
  // far LOD for the pit complex (SPA-UPGRADE, PERF): js/pit.js keeps its team signs, lane text and screens (unlit MeshBasic draws) at any range;
  // seen from across the valley (the Pouhon descent looks straight at the paddock 1.5 km away) they are sub-pixel, so beyond 700 m from the
  // start line they are hidden, and only those this hook hid are shown again (pit.js's own crew / interior LOD is left alone). ~6 draws on Medium.
  Sp.pitLod = function (E) {
    const t = E.t, sc = E.sc; const i0 = t.idxAtS(t.sf || 0); const cx = t.x[i0], cz = t.z[i0]; let list = null, tries = 0, far = false; const hid = [];
    const find = () => { let r = sc.group; while (r && r.parent) r = r.parent; const p = r && r !== sc.group ? r.getObjectByName('pitlane') : null; if (!p) return false;
      list = p.children.filter(o => o.isMesh && !o.isInstancedMesh && o.material && o.material.isMeshBasicMaterial); return true; };
    const update = (x, z) => {
      if (!list) { if ((tries++ % 30) || !find()) return; }
      const f = Math.hypot(x - cx, z - cz) > 700; if (f === far) return; far = f;
      if (f) { for (const o of list) if (o.visible) { o.visible = false; hid.push(o); } } else { for (const o of hid) o.visible = true; hid.length = 0; }
    };
    sc.nearFar = sc.nearFar || []; sc.nearFar.push({ far: { range() {}, update }, near: { range() {}, update() {} } });
  };
  Sp.crowd = function (E, set) {
    const rng = U.rng(1965); const S = set.data[2], A = set.data[3], D = set.data[1], N = set.n;
    const oranges = [C(0xff6a00), C(0xf47a1f), C(0xff8c1a), C(0xe85d04)], be = [C(0x111111), C(0xfdda24), C(0xef3340)], red = C(0xc8102e);
    const tint = (Sh, Ac, Dp, i) => {
      const r = rng(); let c = null; if (r < 0.34) c = oranges[Math.floor(rng() * 4)]; else if (r < 0.4) c = be[Math.floor(rng() * 3)]; else if (r < 0.45) c = red;
      if (c) { Sh[i * 4] = c.r; Sh[i * 4 + 1] = c.g; Sh[i * 4 + 2] = c.b; }
      const pose = Dp[i * 4]; const q = rng(); let a = null;
      if (pose === 14 || pose === 6) a = q < 0.55 ? oranges[0] : q < 0.8 ? be[1] : red; else if (q < 0.3) a = oranges[1];
      if (a) { Ac[i * 4] = a.r; Ac[i * 4 + 1] = a.g; Ac[i * 4 + 2] = a.b; }
    };
    for (let i = 0; i < N; i++) tint(S, A, D, i);
    const bank = E.spBankRecs || []; if (!bank.length) return set;
    // rebuild: the existing records (already finalized, cell-sorted) + the bank spectators
    const ns = new Env.CellSet(set.strides, set.cell); const st = set.strides;
    for (let i = 0; i < N; i++) { const recs = st.map((w, k) => Array.from(set.data[k].subarray(i * w, i * w + w))); ns.push(recs[0][0], recs[0][2], recs); }
    for (const r of bank) ns.push(r[0][0], r[0][2], r);
    ns.finalize();
    const S2 = ns.data[2], A2 = ns.data[3], D2 = ns.data[1];
    // tint only the banks' records (flagged by the shade sentinel 0.999 written in js/env_spa_stands.js)
    for (let i = 0; i < ns.n; i++) if (Math.abs(S2[i * 4 + 3] - 0.999) < 1e-4) { S2[i * 4 + 3] = 0.86 + rng() * 0.2; tint(S2, A2, D2, i); }
    E.stats.spaBankPeople = bank.length;
    return ns;
  };
  if (EI.Scenery) {
    // the generic OSM boxes skip the footprints modelled here (pit building, endurance pits, the old customs chalet) and anything inside
    // a reserved Spa structure polygon (pit complex, stands)
    const oBB = EI.Scenery.prototype.buildBuildings;
    EI.Scenery.prototype.buildBuildings = function () {
      if (!isSpa(this.track)) return oBB.call(this);
      const sc = this.track.data.scenery, all = sc.buildings, E = this.env; const own = (E && E.spOwnPolys) || [];
      sc.buildings = all.filter(b => { if (!b.p || b.p.length < 3) return true; if (b.n && /^(Stand F1|Ancienne douane)$/.test(b.n)) return false; let x = 0, z = 0; for (const v of b.p) { x += v[0]; z += v[1]; } x /= b.p.length; z /= b.p.length; return !own.some(p => U.pointInPoly(x, z, p)); });
      try { return oBB.call(this); } finally { sc.buildings = all; }
    };
    const oSQ = EI.Scenery.prototype.setQuality;
    EI.Scenery.prototype.setQuality = function (q) { const r = oSQ.apply(this, arguments); if (isSpa(this.track) && this.group) { const g = this.group.getObjectByName('spaHigh'); if (g) g.visible = q === 'high'; } return r; };
  }
  // js/pit.js leaves the upper facade of the team garages to the venue file that owns the pit building (EnvMonza.ownsPitFacade): Spa too
  { const oOwn = Mz.ownsPitFacade; Mz.ownsPitFacade = (t) => (oOwn ? oOwn(t) : false) || isSpa(t); }

  // ================================================================ the pit building frame
  // js/pit.js lays its lane along the straight at latC = (widest pit-side wall over sf +-180 m) + 9.25 m, the garages 7.8 .. 17.8 m beyond
  // the lane centre, the 11 team boxes (18 m) centred on the straight; the lane level is the track's, eased towards the ground (weight
  // smoothstep(wall + 5, wall + 30, |lat|), clamped -0.5 .. +3 m) and averaged over +-8 m. The building uses the same frame, curvilinear:
  // P(x, y, z) = x metres along the lap from the line, y above the lane level there, z metres beyond the centre line on the pit side.
  Sp.pitFrame = function (E) {
    if (E._spPF !== undefined) return E._spPF;
    const t = E.t, sc = E.sc; const pit = t.data.pit; if (!pit || pit.length < 4) return (E._spPF = null);
    const pr = {}; let lat = 0; for (const p of pit) { t.project(p[0], p[1], null, pr); lat += pr.lat; } const side = lat < 0 ? -1 : 1;
    const wallOf = (i) => side < 0 ? t.wallL[i] : t.wallR[i];
    let maxWall = 0; for (let s = 0; s <= 360; s += 4) maxWall = Math.max(maxWall, wallOf(t.idxAtS(U.mod(t.sf - 180, t.length) + s)));
    const latC = maxWall + 2.9 + 0.35 + 6.0, zG = latC + 7.8, zGB = latC + 17.8;
    const q = {};
    const W = (x, z) => { Sp.at(t, t.sf + x, side, z, q); return [q.x, q.z]; };
    // the lane level (pit.js formula), tabulated every metre over the building's reach
    const X0 = -240, X1 = 240, yTab = new Float32Array(X1 - X0 + 1), raw = new Float32Array(X1 - X0 + 1);
    for (let k = 0; k < raw.length; k++) { Sp.at(t, t.sf + X0 + k, side, latC, q); const ty = q.y; const w = U.smoothstep(wallOf(q.i) + 5, wallOf(q.i) + 30, latC); const th = sc.height(q.x, q.z); raw[k] = ty + U.clamp(th - ty, -0.5, 3) * w; }
    for (let k = 0; k < raw.length; k++) { let a = 0, c = 0; for (let j = -8; j <= 8; j++) { a += raw[U.clamp(k + j, 0, raw.length - 1)]; c++; } yTab[k] = a / c; }
    const yA = (x) => { const f = U.clamp(x - X0, 0, raw.length - 1.001); const k = Math.floor(f); return U.lerp(yTab[k], yTab[k + 1], f - k); };
    const P = (x, y, z) => { Sp.at(t, t.sf + x, side, z, q); return [q.x, yA(x) + y, q.z]; };
    const G = (x, z) => { const w = W(x, z); return sc.height(w[0], w[1]) - yA(x); };          // the drawn ground, relative to the lane level
    // the building's reach along the straight: the OSM landmark (Stand F1) clipped to the lane's straight part (+-176 m)
    const L = t.length; let a0 = Infinity, a1 = -Infinity; const lm = E.data.landmarks && E.data.landmarks.pitBuilding;
    if (lm && lm.p) for (const p of lm.p) { t.project(p[0], p[1], null, pr); const x = U.mod(pr.s - t.sf + L / 2, L) - L / 2; a0 = Math.min(a0, x); a1 = Math.max(a1, x); }
    const NB = Math.max(10, (EI.TEAMS || []).length || 11), half = NB * 9;
    const x0 = -176, x1 = Math.min(176, Math.max(half + 20, Number.isFinite(a1) ? a1 : 140));
    // podium ~s 6830 (PARENT, SPEC v2 Q1), in front of the race-control block; both inside the building
    const xPod = U.clamp(U.mod(6830 - t.sf + L / 2, L) - L / 2, x0 + 16, x1 - 16);
    const rc0 = Math.max(x0, xPod - 17), rc1 = Math.min(x1, xPod + 17);
    const ZB = zGB + 12;                                                                    // the paddock-side wall
    // dv: the lap direction (+1 / -1 in x) of 'left to right' for someone on the track looking at the building (+lat is the LEFT of travel)
    const dv = side < 0 ? -1 : 1;
    return (E._spPF = { side, dv, maxWall, latC, zG, zGB, ZB, x0, x1, half, xPod, rc0, rc1, yA, P, W, G, a0, a1 });
  };
  Sp.layoutPit = function (E) {
    const F = Sp.pitFrame(E); if (!F) return; const OCC = Env.OCC;
    const poly = []; for (let x = F.x0 - 3; x <= F.x1 + 3.01; x += 12) poly.push(F.W(x, F.zG - 2)); for (let x = F.x1 + 3; x >= F.x0 - 3.01; x -= 12) poly.push(F.W(x, F.ZB + 3));
    E.markPoly(poly, OCC.BUILT, 2); E.standPolys = E.standPolys || []; E.standPolys.push(poly); E.spOwnPolys = (E.spOwnPolys || []).concat([poly]); E.spPitPoly = poly;
    // the OSM 'Stand F1' footprint (the whole paddock, marked BUILT by the venue for the generic box that is no longer built): free it for the
    // marquees, keep the trees off it (KEEP)
    { const lm = E.data.landmarks && E.data.landmarks.pitBuilding; if (lm && lm.p && E.occ) { let ax0 = Infinity, ax1 = -Infinity, az0 = Infinity, az1 = -Infinity; for (const p of lm.p) { ax0 = Math.min(ax0, p[0]); ax1 = Math.max(ax1, p[0]); az0 = Math.min(az0, p[1]); az1 = Math.max(az1, p[1]); }
      for (let x = ax0; x <= ax1; x += 1) for (let z = az0; z <= az1; z += 1) { if (!U.pointInPoly(x, z, lm.p)) continue; const k = E.oi(x, z); if (k >= 0) E.occ[k] = (E.occ[k] & ~OCC.BUILT) | OCC.KEEP; }
      E.markPoly(poly, OCC.BUILT, 2); } }
    // paddock marquees behind the building (white gabled tents, 6-8 m high): on even ground, clear of everything
    const rng = U.rng(812); E.spTents = [];
    for (let k = 0; k < 40 && E.spTents.length < 8; k++) {
      const x = F.x0 + 20 + rng() * (F.x1 - F.x0 - 40), z = F.ZB + 16 + rng() * 40, L = 22 + rng() * 10, D = 12 + (rng() < 0.5 ? 0 : 4);
      const c = F.W(x, z), c2 = F.W(x + 1, z); let ax = c2[0] - c[0], az = c2[1] - c[1]; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l;
      // (the venue marks the whole paddock BUILT for the generic pit complex: keep clear of water, the track and the Spa structures only)
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].map(([u, v]) => [c[0] + ax * u * (L / 2 + 3) - az * v * (D / 2 + 3), c[1] + az * u * (L / 2 + 3) + ax * v * (D / 2 + 3)]);
      if (E.rectFree(c[0], c[1], ax, az, L / 2 + 3, D / 2 + 3, OCC.WATER | OCC.ROAD) < 0.9 || corners.some(q => E.fsAt(q[0], q[1]) < 14 || E.spOwnPolys.some(p => U.pointInPoly(q[0], q[1], p)))) continue;
      let gmin = Infinity, gmax = -Infinity; for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) { const g = E.sc.height(c[0] + ax * u * L / 2 - az * v * D / 2, c[1] + az * u * L / 2 + ax * v * D / 2); gmin = Math.min(gmin, g); gmax = Math.max(gmax, g); }
      if (gmax - gmin > 3.0) continue;
      const tp = E.markRect(c[0], c[1], ax, az, L / 2 + 2, D / 2 + 2, OCC.BUILT); E.standPolys.push(tp); E.spOwnPolys.push(tp);
      E.spTents.push({ cx: c[0], cz: c[1], ax, az, L, D, y: gmin, gmax });
    }
  };

  // ================================================================ build (after the venue)
  Sp.build = function (E) {
    const T0 = performance.now(); const out = E.stats.spa = {}; const sc = E.sc, ST = sc.statics;
    const A = new Mz.Atlas();
    const BK = { B: new Env.Builder(), S: new Env.Builder(), G: new Env.Builder(), F: new Env.Builder(), H: new Env.Builder(), A };   // concrete / steel / glass / fine (clutter) / High-only
    const tc = () => (BK.B.count + BK.S.count + BK.G.count + BK.F.count + BK.H.count) / 3 + A.geo.p.length / 9; out.tc = {};
    const step = (k, fn) => { const t0 = performance.now(), c0 = tc(); try { fn(); } catch (e) { console.error('EnvSpa ' + k, e); } out['ms_' + k] = Math.round(performance.now() - t0); out.tc[k] = Math.round(tc() - c0); };
    const PF = Sp.pitFrame(E);
    if (PF) { step('pit', () => buildPit(E, BK, PF, out)); step('podium', () => buildPodium(E, BK, PF)); step('tents', () => buildTents(E, BK)); }
    if (Sp.Stands) step('stands', () => Sp.Stands.build(E, BK, out));
    if (Sp.Infra) step('infra', () => Sp.Infra.build(E, BK, out));
    ST.add(BK.B.geometry(), 0.82, 0.03, 'main'); ST.add(BK.S.geometry(), 0.42, 0.55, 'main'); ST.add(BK.G.geometry(), 0.08, 0.55, 'main'); ST.add(BK.F.geometry(), 0.5, 0.35, 'clutter');
    out.tris = { main: BK.B.count / 3, steel: BK.S.count / 3, glass: BK.G.count / 3, fine: BK.F.count / 3, high: BK.H.count / 3 };
    if (BK.H.count) { const st = new Env.Statics(); st.add(BK.H.geometry(), 0.45, 0.4, 'clutter'); const g = new THREE.Group(); g.name = 'spaHigh'; st.build(g); g.children.forEach(c => { c.name = 'spaHi'; c.userData.clutter = true; }); g.visible = EI.quality === 'high'; sc.group.add(g); }
    const am = A.mesh('spaSigns'); if (am) { sc.group.add(am); out.signTris = am.geometry.attributes.position.count / 3; }
    out.ms = Math.round(performance.now() - T0);
  };

  // ================================================================ the pit building
  // After pit_building_balcony_2009 / pit_building_podium_elms_4h_spa_a-f / pit_garages_ferrari_crane_ing_garage_5 / paddock_ferrari_tow_truck:
  // ground floor = garages (ribbed grey roller shutters, white number boards with black numerals above, light-grey concrete piers; red-brick
  // piers and orange doors at the office block under race control); a white fascia band; the first-floor balcony slab over the lane edge with
  // a glass-and-steel railing, the glazed gallery behind it between white concrete columns every 6 m; a grey horizontally RIBBED spandrel
  // band; the glazed second level; the roof terrace with a white canopy edge. The race-control block is a storey taller (glazed, white
  // pillars, ribbed cladding, antenna). The paddock side is ribbed cladding from the drawn ground up (the ground falls behind the building).
  function buildPit(E, BK, F, out) {
    const { B, S, G, F: Fd, H, A } = BK; const t = E.t; const P = F.P, zG = F.zG, ZB = F.ZB;
    const x0 = F.x0, x1 = F.x1, half = F.half;
    const lane = (x) => { const a = P(x, 0, zG), b = P(x, 0, zG - 1); return [b[0] - a[0], 0, b[2] - a[2]]; };   // world direction towards the track
    const back = (x) => { const v = lane(x); return [-v[0], 0, -v[2]]; };
    const rib = [C(0x9ca1a5), C(0x777d83)], ribM = C(0x8d9297), conc = C(0x868b90), concD = C(0x73787d), white = C(0xb4b8ba), offW = C(0x969ba0);   // (SPA-UPGRADE: a step darker again - the piers / header read as the only white slabs on the lap; refs spa_aerial_valley_grandstand: a grey-graphite building)   // greys read lighter under the Spa grade (BEAUTY): kept a step darker than the photo
    const glass = C(0x26323d), glassL = C(0x3e5263), mull = C(0x9aa0a5), steel = C(0x9aa0a6), brick = C(0x8f3a26), brickD = C(0x74301f), door = C(0xc9761a), roofC = C(0x8f9397), red = C(0xc8102e);
    const yH0 = 4.8, yH1 = 6.0, yB0 = 6.45, yB1 = 6.8, yL2 = 9.9, yS1 = 10.9, yT = 13.3, yR = 13.8;   // header, balcony slab, level 2 slab, spandrel top, roof
    const zBal = zG - 1.8, zGal = zG + 1.4, zL2 = zG - 0.3;
    const inRC = (x) => x > F.rc0 - 0.01 && x < F.rc1 + 0.01;
    // horizontally ribbed panel between (xa..xb) at lateral z, heights y0..y1, bands of `bw` m (two greys), facing `want`
    const ribbed = (Bd, xa, xb, y0, y1, z, want, bw) => { bw = bw || 0.9; let k = 0; for (let y = y0; y < y1 - 0.01; y += bw, k++) { const y2 = Math.min(y1, y + bw); Sp.face(Bd, P(xa, y, z), P(xb, y, z), P(xb, y2, z), P(xa, y2, z), rib[k % 2], want); } };
    // atlas regions: ribbed shutter, garage digits, the circuit's name
    const shR = A.region('spShutter', 96, 128, (x2, w, h) => { x2.fillStyle = '#6e7378'; x2.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 4) { x2.fillStyle = 'rgba(255,255,255,0.13)'; x2.fillRect(0, y, w, 1); x2.fillStyle = 'rgba(0,0,0,0.2)'; x2.fillRect(0, y + 2, w, 1); } x2.fillStyle = 'rgba(0,0,0,0.3)'; x2.fillRect(0, h - 6, w, 6); });
    const digR = A.region('spDigits', 640, 96, (x2, w, h) => { x2.fillStyle = '#ffffff'; x2.fillRect(0, 0, w, h); x2.fillStyle = '#111111'; x2.font = '700 80px Arial, sans-serif'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; for (let k = 0; k < 10; k++) x2.fillText(String(k), k * 64 + 32, h * 0.54); });
    const nameR = A.region('spPitName', 1024, 64, (x2, w, h) => Mz.paintText(x2, w, h, 'CIRCUIT DE SPA-FRANCORCHAMPS', { bg: '#f1f2f0', fg: '#1b1d22', size: 0.66, font: '700 ' }));
    const bays = []; for (let x = x0; x < x1 - 0.01; x += 9) bays.push([x, Math.min(x1, x + 9)]);
    let shutters = 0, gno = 1;
    for (const [xa, xb] of bays) {
      const xc = (xa + xb) / 2, w = xb - xa, LN = lane(xc), BKW = back(xc), team = xc > -half && xc < half, rc = inRC(xc);
      // ---- ground floor
      if (!team) {
        // closed garages / offices: piers every 4.5 m, shutters (or brick + doors under race control), the number boards above
        for (let x = xa; x <= xb + 0.01; x += 4.5) Sp.hex(rc ? B : B, [P(x - 0.3, -0.3, zG), P(x + 0.3, -0.3, zG), P(x + 0.3, -0.3, zG + 0.7), P(x - 0.3, -0.3, zG + 0.7), P(x - 0.3, yH0, zG), P(x + 0.3, yH0, zG), P(x + 0.3, yH0, zG + 0.7), P(x - 0.3, yH0, zG + 0.7)], rc ? brick : conc, null, true);
        for (let x = xa; x < xb - 1; x += 4.5) {
          const sa = x + 0.3, sb = Math.min(xb, x + 4.5) - 0.3; if (sb - sa < 1) continue;
          if (rc) { Sp.face(B, P(sa, 0, zG + 0.45), P(sb, 0, zG + 0.45), P(sb, yH0, zG + 0.45), P(sa, yH0, zG + 0.45), brickD, LN); const dm = (sa + sb) / 2; Sp.face(Fd, P(dm - 0.7, 0, zG + 0.43), P(dm + 0.7, 0, zG + 0.43), P(dm + 0.7, 2.4, zG + 0.43), P(dm - 0.7, 2.4, zG + 0.43), door, LN); Sp.face(G, P(sa + 0.3, 2.9, zG + 0.43), P(sb - 0.3, 2.9, zG + 0.43), P(sb - 0.3, 4.2, zG + 0.43), P(sa + 0.3, 4.2, zG + 0.43), glassL, LN); continue; }
          Sp.faceA(A, shR, P(sa, 0.02, zG + 0.4), P(sb, 0.02, zG + 0.4), P(sb, 4.5, zG + 0.4), P(sa, 4.5, zG + 0.4), LN); shutters++;
          // white number board with black numerals over the shutter
          const n = String(gno++).padStart(2, '0'); const xm = (sa + sb) / 2, dw = 0.3, yb = yH0 + 0.25, dh = 0.5, zd = zG - 0.03;
          Sp.face(B, P(xm - 0.72, yb - 0.05, zd + 0.01), P(xm + 0.72, yb - 0.05, zd + 0.01), P(xm + 0.72, yb + dh + 0.05, zd + 0.01), P(xm - 0.72, yb + dh + 0.05, zd + 0.01), white, LN);
          for (let j = 0; j < 2; j++) { const d = +n[j]; const u0 = d / 10 + 0.004, u1 = (d + 1) / 10 - 0.004;
            // u runs left -> right as seen from the lane (F.dv = the lap direction of the viewer's left -> right)
            const lft = xm - F.dv * dw + j * F.dv * dw, rgt = lft + F.dv * dw; Sp.faceA(A, digR, P(lft, yb, zd - 0.01), P(rgt, yb, zd - 0.01), P(rgt, yb + dh, zd - 0.01), P(lft, yb + dh, zd - 0.01), LN, u0, u1, 0, 1); }
        }
      }
      // ---- header band (the team signs of pit.js stand just in front of it over the team boxes)
      Sp.hex(B, [P(xa, yH0, zG), P(xb, yH0, zG), P(xb, yH0, zG + 1.0), P(xa, yH0, zG + 1.0), P(xa, yH1, zG), P(xb, yH1, zG), P(xb, yH1, zG + 1.0), P(xa, yH1, zG + 1.0)], offW, null, false);
      Sp.face(B, P(xa, yH0 - 0.02, zG - 0.02), P(xb, yH0 - 0.02, zG - 0.02), P(xb, yH0 + 0.12, zG - 0.02), P(xa, yH0 + 0.12, zG - 0.02), red, LN);
      // the wall between header and balcony slab (back of the gallery's floor)
      Sp.face(B, P(xa, yH1, zG + 0.6), P(xb, yH1, zG + 0.6), P(xb, yB0, zG + 0.6), P(xa, yB0, zG + 0.6), concD, LN);
      // ---- first floor: balcony slab, railing, gallery glass between white columns
      Sp.hex(B, [P(xa, yB0, zBal), P(xb, yB0, zBal), P(xb, yB0, zGal + 0.3), P(xa, yB0, zGal + 0.3), P(xa, yB1, zBal), P(xb, yB1, zBal), P(xb, yB1, zGal + 0.3), P(xa, yB1, zGal + 0.3)], white, C(0xa9adb0), false);
      Sp.face(G, P(xa, yB1, zBal + 0.08), P(xb, yB1, zBal + 0.08), P(xb, yB1 + 1.05, zBal + 0.08), P(xa, yB1 + 1.05, zBal + 0.08), C(0x8fb0bc), LN);
      Fd.beam(Env.frame(0, 0, 0, 1, 0, 0, 1), P(xa, yB1 + 1.08, zBal + 0.08), P(xb, yB1 + 1.08, zBal + 0.08), 0.07, steel);
      const nc = Math.max(1, Math.round(w / 1.5));
      for (let c = 0; c < nc; c++) { const ca = xa + c * w / nc, cb = ca + w / nc; Sp.face(G, P(ca, yB1, zGal), P(cb, yB1, zGal), P(cb, yL2, zGal), P(ca, yL2, zGal), (c % 3 ? glass : glassL), LN); Sp.face(S, P(ca - 0.04, yB1, zGal - 0.03), P(ca + 0.04, yB1, zGal - 0.03), P(ca + 0.04, yL2, zGal - 0.03), P(ca - 0.04, yL2, zGal - 0.03), mull, LN); }
      for (const x of [xa + 0.3, xa + w / 2]) if (w > 4) Sp.hex(B, [P(x - 0.25, yB1, zBal + 0.4), P(x + 0.25, yB1, zBal + 0.4), P(x + 0.25, yB1, zBal + 0.9), P(x - 0.25, yB1, zBal + 0.9), P(x - 0.25, yL2, zBal + 0.4), P(x + 0.25, yL2, zBal + 0.4), P(x + 0.25, yL2, zBal + 0.9), P(x - 0.25, yL2, zBal + 0.9)], white, null, true);
      // gallery ceiling (soffit of the level 2 slab over the balcony)
      Sp.face(B, P(xa, yL2, zBal), P(xb, yL2, zBal), P(xb, yL2, zGal), P(xa, yL2, zGal), concD, [0, -1, 0]);
      // ---- level 2: ribbed spandrel band flush with the balcony edge, glazed level, roof slab with a white canopy edge
      ribbed(B, xa, xb, yL2, yS1, zBal, LN, 0.5);
      Sp.face(B, P(xa, yL2, zBal), P(xb, yL2, zBal), P(xb, yL2, zL2), P(xa, yL2, zL2), concD, [0, 1, 0]);
      const top = rc ? yT : yT;
      for (let c = 0; c < nc; c++) { const ca = xa + c * w / nc, cb = ca + w / nc; Sp.face(G, P(ca, yS1, zL2), P(cb, yS1, zL2), P(cb, top, zL2), P(ca, top, zL2), c % 2 ? glassL : glass, LN); }
      for (let x = xa; x < xb - 0.1; x += 3) Sp.face(S, P(x - 0.06, yS1, zL2 - 0.03), P(x + 0.06, yS1, zL2 - 0.03), P(x + 0.06, top, zL2 - 0.03), P(x - 0.06, top, zL2 - 0.03), mull, LN);
      Sp.face(B, P(xa, yS1, zBal), P(xb, yS1, zBal), P(xb, yS1, zL2), P(xa, yS1, zL2), concD, [0, 1, 0]);
      // roof slab (+ white canopy edge over the terrace / lane), roof top
      const zR0 = zBal - 1.0;
      Sp.hex(B, [P(xa, yT, zR0), P(xb, yT, zR0), P(xb, yT, ZB + 0.3), P(xa, yT, ZB + 0.3), P(xa, yR, zR0), P(xb, yR, zR0), P(xb, yR, ZB + 0.3), P(xa, yR, ZB + 0.3)], white, roofC, false);
      Fd.beam(Env.frame(0, 0, 0, 1, 0, 0, 1), P(xa, yR + 1.0, zR0 + 0.4), P(xb, yR + 1.0, zR0 + 0.4), 0.06, steel);
      if (bays.indexOf(bays.find(bq => bq[0] === xa)) % 2 === 0) H.beam(Env.frame(0, 0, 0, 1, 0, 0, 1), P(xa + 0.2, yR, zR0 + 0.4), P(xa + 0.2, yR + 1.0, zR0 + 0.4), 0.06, steel);
      // ---- the paddock side: ribbed cladding from the drawn ground (it falls 1-9 m behind the building), two window bands, a dark plinth
      const g0 = Math.min(F.G(xa, ZB), F.G(xb, ZB), 0) - 0.5;
      Sp.face(B, P(xa, g0, ZB), P(xb, g0, ZB), P(xb, Math.min(0.4, g0 + 2), ZB), P(xa, Math.min(0.4, g0 + 2), ZB), C(0x5d6166), BKW);
      ribbed(B, xa, xb, Math.min(0.4, g0 + 2), yR, ZB, BKW, 1.2);
      for (const [ya, yb] of [[7.2, 8.6], [11.0, 12.4]]) Sp.face(G, P(xa + 0.6, ya, ZB + 0.03), P(xb - 0.6, ya, ZB + 0.03), P(xb - 0.6, yb, ZB + 0.03), P(xa + 0.6, yb, ZB + 0.03), glass, BKW);
      // the floor slab under the garages down to the ground on the paddock side (hidden from the lane, closes the gap underneath)
      out.pitBays = (out.pitBays || 0) + 1;
    }
    // ---- end walls (ribbed, down to the drawn ground)
    for (const [xe, sg] of [[x0, -1], [x1, 1]]) {
      const want = (() => { const a = P(xe, 0, zG), b = P(xe + sg, 0, zG); return [b[0] - a[0], 0, b[2] - a[2]]; })();
      const gE = Math.min(F.G(xe, zG), F.G(xe, ZB), 0) - 0.5;
      let k = 0; for (let y = gE; y < yR - 0.01; y += 1.2, k++) { const y2 = Math.min(yR, y + 1.2); Sp.face(B, P(xe, y, zBal), P(xe, y, ZB), P(xe, y2, ZB), P(xe, y2, zBal), y < 0 ? C(0x5d6166) : rib[k % 2], want); }
    }
    // ---- race-control block: one storey taller, glazed between white pillars, ribbed cladding cap, antenna mast
    { const xa = F.rc0, xb = F.rc1, y0 = yR, y1 = yR + 3.8, y2 = y1 + 0.6, za = zL2 + 0.5, zb = ZB - 4; const LN = lane((xa + xb) / 2);
      const nc = Math.round((xb - xa) / 1.6);
      for (let c = 0; c < nc; c++) { const ca = xa + c * (xb - xa) / nc, cb = ca + (xb - xa) / nc; Sp.face(G, P(ca, y0, za), P(cb, y0, za), P(cb, y1, za), P(ca, y1, za), c % 2 ? glassL : glass, LN); }
      for (let x = xa; x <= xb + 0.01; x += (xb - xa) / 6) Sp.hex(B, [P(x - 0.25, y0, za - 0.3), P(x + 0.25, y0, za - 0.3), P(x + 0.25, y0, za + 0.2), P(x - 0.25, y0, za + 0.2), P(x - 0.25, y1, za - 0.3), P(x + 0.25, y1, za - 0.3), P(x + 0.25, y1, za + 0.2), P(x - 0.25, y1, za + 0.2)], white, null, true);
      for (const [xe, sg] of [[xa, -1], [xb, 1]]) { const a = P(xe, 0, za), b = P(xe + sg, 0, za); ribbed(B, xe, xe, y0, y1, za, [b[0] - a[0], 0, b[2] - a[2]]); Sp.face(B, P(xe, y0, za), P(xe, y0, zb), P(xe, y1, zb), P(xe, y1, za), rib[0], [b[0] - a[0], 0, b[2] - a[2]]); }
      ribbed(B, xa, xb, y0, y1, zb, back((xa + xb) / 2));
      Sp.hex(B, [P(xa - 0.4, y1, za - 1.2), P(xb + 0.4, y1, za - 1.2), P(xb + 0.4, y1, zb + 0.4), P(xa - 0.4, y1, zb + 0.4), P(xa - 0.4, y2, za - 1.2), P(xb + 0.4, y2, za - 1.2), P(xb + 0.4, y2, zb + 0.4), P(xa - 0.4, y2, zb + 0.4)], white, roofC, false);
      ribbed(B, F.rc0, F.rc1, yS1, yT, zL2 - 0.05, lane((xa + xb) / 2), 0.45);   // the race-control front at level 2 is clad, not glazed (photo: ribbed grey block left of the podium)
      const xm = (xa + xb) / 2 + 6;
      { const p0 = P(xm, y2, (za + zb) / 2), p1 = P(xm, y2 + 9, (za + zb) / 2); S.beam(Env.frame(0, 0, 0, 1, 0, 0, 1), p0, p1, 0.16, C(0xd9dde0)); for (let k = 0; k < 3; k++) Fd.box(Env.frame(p1[0], p1[1] - 2 - k * 1.6, p1[2], 1, 0, 0, 1), 0.8, 0.5, 0.12, 0, 0, 0, C(0xdfe2e4)); } }
    // ---- the circuit's name on the ribbed spandrel over the closed garages at the La Source end
    { const xn1 = Math.min(x1 - 6, Math.max(half + 6, x1 - 60)), xn0 = Math.max(half + 4, xn1 - 44); if (xn1 - xn0 > 20) { const LN = lane((xn0 + xn1) / 2); const zz = zBal - 0.04; const lft = F.dv > 0 ? xn0 : xn1, rgt = F.dv > 0 ? xn1 : xn0; Sp.faceA(A, nameR, P(lft, yL2 + 0.12, zz), P(rgt, yL2 + 0.12, zz), P(rgt, yS1 - 0.12, zz), P(lft, yS1 - 0.12, zz), LN); } }
    out.pit = { x0: Math.round(x0), x1: Math.round(x1), latC: +F.latC.toFixed(1), zG: +zG.toFixed(1), xPod: Math.round(F.xPod), shutters, osm: [Math.round(F.a0), Math.round(F.a1)] };
  }
  // ---- the podium (podium_2009_checkered_backdrop_spa_francorchamps, pit_building_podium_elms_4h_spa_a-f): a balcony platform (~14 x 3.6 m)
  // cantilevered from the first-floor gallery over the working lane (5 m of clearance, no columns in the lane), a deep steel edge beam with a
  // black-on-white SPA FRANCORCHAMPS fascia, a glass railing with a red / white / yellow flower planter along the lip, the stepped 2-1-3
  // rostrum, the tall blue-and-white chequered backdrop (F1 + partner marks) against the gallery, flags on top (Belgium + the podium nations)
  function buildPodium(E, BK, F) {
    const { B, S, G, F: Fd, A } = BK; const P = F.P, zG = F.zG; const xc = F.xPod, hw = 7.2;
    const LN = (() => { const a = P(xc, 0, zG), b = P(xc, 0, zG - 1); return [b[0] - a[0], 0, b[2] - a[2]]; })();
    const yU = 5.6, yD = 6.15, zIn = zG - 1.8, zTip = zG - 5.4; const steel = C(0x5b6168), grey = C(0xb4b9be);
    Sp.hex(B, [P(xc - hw, yU, zTip), P(xc + hw, yU, zTip), P(xc + hw, yU, zIn + 1.5), P(xc - hw, yU, zIn + 1.5), P(xc - hw, yD, zTip), P(xc + hw, yD, zTip), P(xc + hw, yD, zIn + 1.5), P(xc - hw, yD, zIn + 1.5)], grey, C(0x7d838a), false);
    // fascia banner: SPA FRANCORCHAMPS, black on white
    const fR = A.region('spPodFascia', 768, 64, (x2, w, h) => Mz.paintText(x2, w, h, 'SPA FRANCORCHAMPS', { bg: '#ffffff', fg: '#111111', size: 0.72, font: '800 ' }));
    { const lft = xc - F.dv * hw, rgt = xc + F.dv * hw; Sp.faceA(A, fR, P(lft, yU - 0.6, zTip - 0.05), P(rgt, yU - 0.6, zTip - 0.05), P(rgt, yD + 0.02, zTip - 0.05), P(lft, yD + 0.02, zTip - 0.05), LN); }
    for (const sx of [-1, 1]) S.beam(Env.frame(0, 0, 0, 1, 0, 0, 1), P(xc + sx * (hw - 0.6), yU - 0.6, zTip + 0.2), P(xc + sx * (hw - 0.6), yU - 0.1, zIn + 2.0), 0.35, steel);
    // railing (glass) and the flower planter along the lip
    Sp.face(G, P(xc - hw, yD, zTip + 0.15), P(xc + hw, yD, zTip + 0.15), P(xc + hw, yD + 1.05, zTip + 0.15), P(xc - hw, yD + 1.05, zTip + 0.15), C(0x9ec0c8), LN);
    for (const sx of [-1, 1]) Sp.face(G, P(xc + sx * hw, yD, zTip + 0.15), P(xc + sx * hw, yD, zIn), P(xc + sx * hw, yD + 1.05, zIn), P(xc + sx * hw, yD + 1.05, zTip + 0.15), C(0x9ec0c8), [0, 0, 1]);
    Sp.hex(B, [P(xc - hw + 0.3, yD, zTip + 0.3), P(xc + hw - 0.3, yD, zTip + 0.3), P(xc + hw - 0.3, yD, zTip + 0.75), P(xc - hw + 0.3, yD, zTip + 0.75), P(xc - hw + 0.3, yD + 0.45, zTip + 0.3), P(xc + hw - 0.3, yD + 0.45, zTip + 0.3), P(xc + hw - 0.3, yD + 0.45, zTip + 0.75), P(xc - hw + 0.3, yD + 0.45, zTip + 0.75)], C(0x2f5a2a), null, true);
    const fl = [C(0xd8202a), C(0xf2f2f2), C(0xf2c218)]; for (let x = xc - hw + 0.5, k = 0; x < xc + hw - 0.5; x += 0.55, k++) { const p = P(x, yD + 0.47, zTip + 0.52); Fd.box(Env.frame(p[0], p[1], p[2], 1, 0, 0, 1), 0.34, 0.22, 0.34, 0, 0, 0, fl[k % 3]); }
    // rostrum 2 - 1 - 3 (grey steps)
    for (const [dx, h] of [[-2.3, 0.45], [0, 0.8], [2.3, 0.3]]) { const xm = xc + F.dv * dx; Sp.hex(B, [P(xm - 1.1, yD, zIn - 1.9), P(xm + 1.1, yD, zIn - 1.9), P(xm + 1.1, yD, zIn - 0.2), P(xm - 1.1, yD, zIn - 0.2), P(xm - 1.1, yD + h, zIn - 1.9), P(xm + 1.1, yD + h, zIn - 1.9), P(xm + 1.1, yD + h, zIn - 0.2), P(xm - 1.1, yD + h, zIn - 0.2)], C(0xc5c9cd), C(0xdfe2e4), true); }
    // the chequered backdrop (5 m x 12 m) against the gallery, F1 mark + partner tiles on it
    const bR = A.region('spPodWall', 480, 200, (x2, w, h) => {
      const n = 12, m = 5; for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { x2.fillStyle = (i + j) % 2 ? '#1d4fb8' : '#ffffff'; x2.fillRect(i * w / n, j * h / m, w / n + 1, h / m + 1); }
      x2.fillStyle = '#ffffff'; x2.fillRect(w * 0.3, h * 0.08, w * 0.4, h * 0.34); if (EI.Ads && EI.Ads.drawF1) EI.Ads.drawF1(x2, w * 0.5, h * 0.25, w * 0.34, h * 0.26); else Mz.paintText(x2, w * 0.4, h * 0.34, 'F1', { bg: '#ffffff', fg: '#e10600' });
      if (EI.Ads && EI.Ads.paintTile) for (let k = 0; k < 4; k++) { const tw = w * 0.2, th = tw / 5; x2.save(); EI.Ads.paintTile(x2, k, w * 0.08 + k * w * 0.215, h * 0.62, tw, th, 5); x2.restore(); }
    });
    { const zb = zIn + 0.1, y0 = yD + 0.05, y1 = yD + 5.05, bw = 6.2; const lft = xc - F.dv * bw, rgt = xc + F.dv * bw; Sp.faceA(A, bR, P(lft, y0, zb), P(rgt, y0, zb), P(rgt, y1, zb), P(lft, y1, zb), LN);
      Sp.hex(S, [P(xc - bw - 0.2, y0, zb + 0.05), P(xc + bw + 0.2, y0, zb + 0.05), P(xc + bw + 0.2, y0, zb + 0.4), P(xc - bw - 0.2, y0, zb + 0.4), P(xc - bw - 0.2, y1 + 0.2, zb + 0.05), P(xc + bw + 0.2, y1 + 0.2, zb + 0.05), P(xc + bw + 0.2, y1 + 0.2, zb + 0.4), P(xc - bw - 0.2, y1 + 0.2, zb + 0.4)], C(0x1b1d22), null, true);
      // flags on top: Belgium + three nations (static, rippled, both faces, in the atlas)
      const flags = [A.region('spFlagBE', 96, 64, Sp.paintFlagBE), A.region('spFlagNL', 96, 64, Sp.paintFlagNL), A.region('spFlagIt', 96, 64, (x2, w, h) => Mz.paintTricolore(x2, w, h)), A.region('spFlagGB', 96, 64, (x2, w, h) => { x2.fillStyle = '#012169'; x2.fillRect(0, 0, w, h); x2.strokeStyle = '#ffffff'; x2.lineWidth = 12; x2.beginPath(); x2.moveTo(0, 0); x2.lineTo(w, h); x2.moveTo(w, 0); x2.lineTo(0, h); x2.stroke(); x2.strokeStyle = '#c8102e'; x2.lineWidth = 5; x2.stroke(); x2.fillStyle = '#ffffff'; x2.fillRect(w * 0.42, 0, w * 0.16, h); x2.fillRect(0, h * 0.38, w, h * 0.24); x2.fillStyle = '#c8102e'; x2.fillRect(w * 0.46, 0, w * 0.08, h); x2.fillRect(0, h * 0.44, w, h * 0.12); })];
      for (let k = 0; k < 4; k++) { const x = xc - 4.5 + k * 3; const p0 = P(x, y1 + 0.2, zb + 0.2), p1 = P(x, y1 + 3.4, zb + 0.2); Fd.beam(Env.frame(0, 0, 0, 1, 0, 0, 1), p0, p1, 0.06, C(0xd9dde0)); const yaw = Math.atan2(LN[0], LN[2]) + Math.PI / 2; if (Mz.Stands && Mz.Stands.flag) Mz.Stands.flag(A, flags[k], P(x, y1 + 3.35, zb + 0.2), yaw, 1.6, 1.05); } }
    E.stats.spa.podium = { x: Math.round(xc), y: +yD.toFixed(1) };
  }
  // ---- paddock marquees (pit_straight_from_eau_rouge_white_tent_vodafone_boards: white gabled tents 6-8 m high, white trucks)
  function buildTents(E, BK) {
    const { B, F: Fd } = BK; const white = C(0xdcdfe0), whiteS = C(0xdfe2e3), frame = C(0xb9bec2); let n = 0;
    for (const T of E.spTents || []) {
      const m = Env.frame(T.cx, T.y, T.cz, T.ax, T.az, -T.az, T.ax); const hl = T.L / 2, hd = T.D / 2, wh = 3.2 + (T.gmax - T.y), rh = wh + T.D * 0.28;
      const P = (x, y, z) => Env.xf(m, x, y, z);
      B.box(m, T.L, wh, T.D, 0, -0.3, 0, whiteS);                                                   // walls (from just below the lowest corner)
      for (const sz of [-1, 1]) Sp.face(B, P(-hl - 0.2, wh - 0.3, sz * (hd + 0.3)), P(hl + 0.2, wh - 0.3, sz * (hd + 0.3)), P(hl + 0.2, rh - 0.3, 0), P(-hl - 0.2, rh - 0.3, 0), white, [0, 1, 0]);   // roof planes
      for (const sx of [-1, 1]) Sp.face(B, P(sx * hl, wh - 0.3, -hd), P(sx * hl, wh - 0.3, hd), P(sx * hl, rh - 0.3, 0), P(sx * hl, rh - 0.3, 0), white, Env.xf(m, sx, 0, 0).map((v, k) => v - P(0, 0, 0)[k]));
      for (let x = -hl; x <= hl + 0.01; x += 5) Fd.box(m, 0.12, 0.12, T.D + 0.1, x, wh - 0.45, 0, frame);
      n++;
    }
    E.stats.spa.tents = n;
  }

  EI.EnvSpa = Sp;
})();
