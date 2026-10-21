// Equation I - Circuit of the Americas (COTA-MODELS): the venue's structures. This file is the entry point: lap helpers, the hooks into the
// shared venue / scenery passes (gated by isCota, the other circuits are untouched) and the pit + paddock complex on the pit side of the
// start straight - the long two-storey garage building with the glazed Paddock Club levels, the navy fascia with the COTA red line, the big
// white cantilevered roof canopy over the working lane, the taller race-control block at the Turn 1 end, the podium balcony (stars-and-
// stripes backdrop) facing the Main Grandstand, and the team hospitality units / marquees in the paddock behind.
// The grandstands are in js/env_cota_stands.js, the Observation Tower / amphitheatre / start gantry / footbridges / COTALAND in
// js/env_cota_infra.js. COTA is a SLOPE track: the straight is flat to the line, then climbs ~11 % to Turn 1; everything follows the pit
// lane's own level (the formula of js/pit.js) or the drawn ground (sc.height, re-read after the terrain is built), with walls / skirts down
// to the ground, so nothing floats or hangs over a drop.
// Static geometry is vertex-coloured into the scenery's merged chunked statics (no new material / program): B concrete / cladding, S steel,
// G glass (main layer = the Low massing), F fine detail (clutter layer, dropped beyond the tier's clutter range), H High-only detail in a
// 'cotaHigh' group; signs, digits, the podium backdrop and flags share one canvas atlas mesh (EnvMonza.Atlas).
window.EI = window.EI || {};
(function () {
  const U = EI.U, Env = EI.Env, Mz = EI.EnvMonza; if (!Env || !Mz) return;
  const K = Mz.K, C = K.C;
  const Ct = {}; const isCota = (t) => !!(t && t.data && t.data.id === 'cota');
  Ct.isCota = isCota; Ct.K = K; Ct.C = C;

  // ================================================================ lap helpers (as js/env_spa.js)
  // turn-in s of a corner by its TURN NUMBER (never by name or a hard-coded s); 'line' / null = the start line
  Ct.cs = function (t, n) { if (n == null || n === 'line') return t.sf || 0; const c = t.data.corners.find(k => k.t === n); return c ? c.s : (t.sf || 0); };
  // interpolated lap frame at s on `side` (+1 = the +lat side = left of travel), lateral d from the centre line
  Ct.at = function (t, s, side, d, o) {
    o = o || {}; const f = U.mod(s / t.ds, t.n); const i = Math.floor(f), j = (i + 1) % t.n, u = f - i;
    let tx = U.lerp(t.tx[i], t.tx[j], u), tz = U.lerp(t.tz[i], t.tz[j], u); const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const nx = U.lerp(t.nx[i], t.nx[j], u) * side, nz = U.lerp(t.nz[i], t.nz[j], u) * side;
    o.x = U.lerp(t.x[i], t.x[j], u) + nx * d; o.z = U.lerp(t.z[i], t.z[j], u) + nz * d; o.y = U.lerp(t.y[i], t.y[j], u);
    o.tx = tx; o.tz = tz; o.nx = nx; o.nz = nz; o.i = u < 0.5 ? i : j; return o;
  };
  // the outside of the bend at s (+1 / -1 in lat terms)
  Ct.outside = function (t, s) { if (!t._ctKK) t._ctKK = t.smooth(t.k, 15); return t._ctKK[t.idxAtS(s)] > 0 ? -1 : 1; };
  // a quad facing `want` (a world direction): the winding follows from its own normal
  Ct.face = function (Bd, a, b, c, d, col, want) { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2]; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; if (nx * want[0] + ny * want[1] + nz * want[2] >= 0) Bd.quad(a, b, c, d, col); else Bd.quad(d, c, b, a, col); };
  // atlas quad facing `want` (u runs a->b as seen from the front)
  Ct.faceA = function (A, r, a, b, c, d, want, u0, u1, v0, v1) { u0 = u0 || 0; u1 = u1 == null ? 1 : u1; v0 = v0 || 0; v1 = v1 == null ? 1 : v1; const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2]; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; if (nx * want[0] + ny * want[1] + nz * want[2] >= 0) A.quad(r, a, b, c, d, u0, u1, v0, v1); else A.quad(r, b, a, d, c, u1, u0, v0, v1); };
  // a box given by its 8 corners (curved / sloped frames): faces wound outwards from the centroid
  Ct.hex = function (Bd, c8, col, top, skipBottom) {
    let cx = 0, cy = 0, cz = 0; for (const p of c8) { cx += p[0] / 8; cy += p[1] / 8; cz += p[2] / 8; }
    const F = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
    F.forEach((f, k) => { if (k === 0 && skipBottom) return; const a = c8[f[0]], b = c8[f[1]], c = c8[f[2]], d = c8[f[3]]; const mx = (a[0] + c[0]) / 2 - cx, my = (a[1] + c[1]) / 2 - cy, mz = (a[2] + c[2]) / 2 - cz; Ct.face(Bd, a, b, c, d, k === 1 && top ? top : col, [mx, my, mz]); });
  };
  // horizontal unit direction a -> b of two world points
  Ct.dir = (a, b) => { const x = b[0] - a[0], z = b[2] - a[2]; const l = Math.hypot(x, z) || 1; return [x / l, 0, z / l]; };
  // flags (atlas painters)
  Ct.paintFlagUS = (x2, w, h) => {
    for (let k = 0; k < 13; k++) { x2.fillStyle = k % 2 ? '#ffffff' : '#b22234'; x2.fillRect(0, k * h / 13, w, h / 13 + 1); }
    x2.fillStyle = '#3c3b6e'; x2.fillRect(0, 0, w * 0.4, h * 7 / 13); x2.fillStyle = '#ffffff';
    for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) { x2.beginPath(); x2.arc(w * 0.4 * (c + 0.5) / 6, h * 7 / 13 * (r + 0.5) / 5, Math.max(0.8, h * 0.022), 0, 7); x2.fill(); }
  };
  Ct.star = (x2, x, y, r, fill) => { x2.fillStyle = fill; x2.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.4 : r; x2.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } x2.closePath(); x2.fill(); };
  Ct.paintFlagTX = (x2, w, h) => { x2.fillStyle = '#ffffff'; x2.fillRect(0, 0, w, h / 2); x2.fillStyle = '#bf0a30'; x2.fillRect(0, h / 2, w, h / 2 + 1); x2.fillStyle = '#002868'; x2.fillRect(0, 0, w / 3, h); Ct.star(x2, w / 6, h / 2, h * 0.2, '#ffffff'); };
  Ct.paintFlagNL = (x2, w, h) => { x2.fillStyle = '#ae1c28'; x2.fillRect(0, 0, w, h / 3 + 1); x2.fillStyle = '#ffffff'; x2.fillRect(0, h / 3, w, h / 3 + 1); x2.fillStyle = '#21468b'; x2.fillRect(0, 2 * h / 3, w, h / 3 + 1); };
  Ct.paintFlagGB = (x2, w, h) => { x2.fillStyle = '#012169'; x2.fillRect(0, 0, w, h); x2.strokeStyle = '#ffffff'; x2.lineWidth = 12; x2.beginPath(); x2.moveTo(0, 0); x2.lineTo(w, h); x2.moveTo(w, 0); x2.lineTo(0, h); x2.stroke(); x2.strokeStyle = '#c8102e'; x2.lineWidth = 5; x2.stroke(); x2.fillStyle = '#ffffff'; x2.fillRect(w * 0.42, 0, w * 0.16, h); x2.fillRect(0, h * 0.38, w, h * 0.24); x2.fillStyle = '#c8102e'; x2.fillRect(w * 0.46, 0, w * 0.08, h); x2.fillRect(0, h * 0.44, w, h * 0.12); };
  Ct.paintFlagOrange = (x2, w, h) => { x2.fillStyle = '#ff6a00'; x2.fillRect(0, 0, w, h); x2.fillStyle = '#ffffff'; x2.font = 'italic 900 ' + Math.round(h * 0.42) + 'px Arial'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText('GO MAX', w / 2, h / 2); };
  // the COTA wordmark band: white letters on navy with the red line
  Ct.paintCota = (x2, w, h, text) => { x2.fillStyle = '#1d2640'; x2.fillRect(0, 0, w, h); x2.fillStyle = '#c8102e'; x2.fillRect(0, h * 0.84, w, h * 0.16); Mz.paintText(x2, w, h * 0.84, text, { bg: 'rgba(0,0,0,0)', fg: '#e8e9ea', size: 0.62, font: '700 ' }); };
  Ct.flagRegions = (A) => [A.region('ctFlagUS', 120, 64, Ct.paintFlagUS), A.region('ctFlagTX', 96, 64, Ct.paintFlagTX), A.region('ctFlagNL', 96, 64, Ct.paintFlagNL), A.region('ctFlagGB', 96, 64, Ct.paintFlagGB), A.region('ctFlagOr', 96, 64, Ct.paintFlagOrange)];

  // ================================================================ hooks into the shared passes (COTA only)
  const V = EI.EnvVenue;
  if (V) {
    // venue layout: the generic stand runs (ENVDATA.cota.standRuns) and the OSM grandstand boxes are replaced by js/env_cota_stands.js
    const oLayout = V.layout;
    V.layout = function (E) {
      if (!isCota(E.t)) return oLayout.call(this, E);
      const S = E.t.data.scenery; E._ctGs = S.grandstands; S.grandstands = []; const runs = E.data.standRuns; E.ctStandRuns = runs; E.data.standRuns = [];
      try { return oLayout.call(this, E); } finally { E.data.standRuns = runs; }
    };
    const oLS = V.layoutStands;
    V.layoutStands = function (E) {
      const r = oLS.call(this, E);
      if (isCota(E.t)) { E.ctOwnPolys = E.ctOwnPolys || []; for (const [k, fn] of [['pit', () => Ct.layoutPit(E)], ['stands', () => Ct.Stands && Ct.Stands.layout(E)], ['infra', () => Ct.Infra && Ct.Infra.layout && Ct.Infra.layout(E)]]) { try { fn(); } catch (e) { console.error('EnvCota layout ' + k, e); } } }
      return r;
    };
    const oBuild = V.build;
    V.build = function (E) {
      // the drawn ground is final now (terrain + verge built): re-fit every COTA floor / base before the venue builds the stands and crowd
      if (isCota(E.t)) { try { E._ctPF = undefined; Ct.refit(E); if (Ct.Stands && Ct.Stands.refit) Ct.Stands.refit(E); if (Ct.Infra && Ct.Infra.refit) Ct.Infra.refit(E); } catch (e) { console.error('EnvCota refit', e); } }
      const r = oBuild.call(this, E);
      if (isCota(E.t)) { try { Ct.build(E); } catch (e) { console.error('EnvCota build', e); } finally { if (E._ctGs) E.t.data.scenery.grandstands = E._ctGs; } }
      return r;
    };
    // the crowd: a US race-day crowd (Verstappen orange, Ferrari red, papaya, Mercedes teal, stars and stripes); the spectator banks and
    // the upper tiers built here join the same instanced crowd (one draw call)
    const oCrowd = V.crowd;
    V.crowd = function (E, set, carpet) {
      if (isCota(E.t) && set && set.data) { try { set = Ct.crowd(E, set); } catch (e) { console.error('EnvCota crowd', e); } }
      return oCrowd.call(this, E, set, carpet);
    };
  }
  Ct.crowd = function (E, set) {
    const rng = U.rng(2012); const N = set.n;
    const oranges = [C(0xff6a00), C(0xf47a1f), C(0xff8c1a)], usa = [C(0xb22234), C(0xf2f2f2), C(0x3c3b6e)], red = C(0xc8102e), papaya = C(0xff8000), teal = C(0x00a19c), tan = C(0xa07a4a);
    const tint = (Sh, Ac, Dp, i) => {
      const r = rng(); let c = null; if (r < 0.2) c = oranges[Math.floor(rng() * 3)]; else if (r < 0.3) c = red; else if (r < 0.37) c = papaya; else if (r < 0.41) c = teal; else if (r < 0.47) c = usa[Math.floor(rng() * 3)];
      if (c) { Sh[i * 4] = c.r; Sh[i * 4 + 1] = c.g; Sh[i * 4 + 2] = c.b; }
      const pose = Dp[i * 4]; const q = rng(); let a = null;
      if (pose === 14 || pose === 6) a = q < 0.4 ? usa[0] : q < 0.6 ? oranges[0] : q < 0.75 ? usa[2] : red; else if (q < 0.12) a = tan; else if (q < 0.3) a = oranges[1];
      if (a) { Ac[i * 4] = a.r; Ac[i * 4 + 1] = a.g; Ac[i * 4 + 2] = a.b; }
    };
    for (let i = 0; i < N; i++) tint(set.data[2], set.data[3], set.data[1], i);
    const extra = (E.ctBankRecs || []).concat(E.ctSeatRecs || []); if (!extra.length) return set;
    // rebuild: the existing records (finalized, cell-sorted) + the bank spectators / upper-tier seats
    const ns = new Env.CellSet(set.strides, set.cell); const st = set.strides;
    for (let i = 0; i < N; i++) { const recs = st.map((w, k) => Array.from(set.data[k].subarray(i * w, i * w + w))); ns.push(recs[0][0], recs[0][2], recs); }
    for (const r of extra) ns.push(r[0][0], r[0][2], r);
    ns.finalize();
    const S2 = ns.data[2], A2 = ns.data[3], D2 = ns.data[1];
    // tint only the added records (flagged by the shade sentinel 0.999)
    for (let i = 0; i < ns.n; i++) if (Math.abs(S2[i * 4 + 3] - 0.999) < 1e-4) { S2[i * 4 + 3] = 0.84 + rng() * 0.2; tint(S2, A2, D2, i); }
    E.stats.cotaExtraPeople = extra.length;
    return ns;
  };
  if (EI.Scenery) {
    // the generic OSM boxes skip the footprints modelled here (pit garages, the amphitheatre) and anything inside a reserved COTA polygon
    const oBB = EI.Scenery.prototype.buildBuildings;
    EI.Scenery.prototype.buildBuildings = function () {
      if (!isCota(this.track)) return oBB.call(this);
      const sc = this.track.data.scenery, all = sc.buildings, E = this.env; const own = (E && E.ctOwnPolys) || [];
      sc.buildings = all.filter(b => { if (!b.p || b.p.length < 3) return true; if (b.n && /^(Pit Garages|Germania Insurance Amphi)/.test(b.n)) return false; let x = 0, z = 0; for (const v of b.p) { x += v[0]; z += v[1]; } x /= b.p.length; z /= b.p.length; return !own.some(p => U.pointInPoly(x, z, p)); });
      try { return oBB.call(this); } finally { sc.buildings = all; }
    };
    const oSQ = EI.Scenery.prototype.setQuality;
    EI.Scenery.prototype.setQuality = function (q) { const r = oSQ.apply(this, arguments); if (isCota(this.track) && this.group) { const g = this.group.getObjectByName('cotaHigh'); if (g) g.visible = q === 'high'; } return r; };
  }
  // js/pit.js leaves the upper facade of the team garages to the venue file that owns the pit building (EnvMonza.ownsPitFacade): COTA too
  { const oOwn = Mz.ownsPitFacade; Mz.ownsPitFacade = (t) => (oOwn ? oOwn(t) : false) || isCota(t); }

  // ================================================================ the pit building frame
  // js/pit.js lays its lane along the straight at latC = (widest pit-side wall over sf +-180 m) + 9.25 m, the garages 7.8 .. 17.8 m beyond
  // the lane centre, the 11 team boxes (18 m) centred on the straight; the lane level is the track's, eased towards the ground (weight
  // smoothstep(wall + 5, wall + 30, |lat|), clamped -0.5 .. +3 m) and averaged over +-8 m. The building uses the same frame, curvilinear:
  // P(x, y, z) = x metres along the lap from the line, y above the lane level there, z metres beyond the centre line on the pit side.
  Ct.pitFrame = function (E) {
    if (E._ctPF !== undefined) return E._ctPF;
    const t = E.t, sc = E.sc; const pit = t.data.pit; if (!pit || pit.length < 4) return (E._ctPF = null);
    const pr = {}; let lat = 0; for (const p of pit) { t.project(p[0], p[1], null, pr); lat += pr.lat; } const side = lat < 0 ? -1 : 1;
    const wallOf = (i) => side < 0 ? t.wallL[i] : t.wallR[i];
    let maxWall = 0; for (let s = 0; s <= 360; s += 4) maxWall = Math.max(maxWall, wallOf(t.idxAtS(U.mod(t.sf - 180, t.length) + s)));
    const latC = maxWall + 2.9 + 0.35 + 6.0, zG = latC + 7.8, zGB = latC + 17.8;
    const q = {};
    const W = (x, z) => { Ct.at(t, t.sf + x, side, z, q); return [q.x, q.z]; };
    const X0 = -240, X1 = 240, yTab = new Float32Array(X1 - X0 + 1), raw = new Float32Array(X1 - X0 + 1);
    for (let k = 0; k < raw.length; k++) { Ct.at(t, t.sf + X0 + k, side, latC, q); const ty = q.y; const w = U.smoothstep(wallOf(q.i) + 5, wallOf(q.i) + 30, latC); const th = sc.height(q.x, q.z); raw[k] = ty + U.clamp(th - ty, -0.5, 3) * w; }
    for (let k = 0; k < raw.length; k++) { let a = 0, c = 0; for (let j = -8; j <= 8; j++) { a += raw[U.clamp(k + j, 0, raw.length - 1)]; c++; } yTab[k] = a / c; }
    const yA = (x) => { const f = U.clamp(x - X0, 0, raw.length - 1.001); const k = Math.floor(f); return U.lerp(yTab[k], yTab[k + 1], f - k); };
    const P = (x, y, z) => { Ct.at(t, t.sf + x, side, z, q); return [q.x, yA(x) + y, q.z]; };
    const G = (x, z) => { const w = W(x, z); return sc.height(w[0], w[1]) - yA(x); };          // the drawn ground, relative to the lane level
    // the building's reach along the straight: the OSM 'Pit Garages' landmark clipped to the lane's straight part (+-176 m)
    const L = t.length; let a0 = Infinity, a1 = -Infinity; const lm = E.data.landmarks && E.data.landmarks.pitBuilding;
    if (lm && lm.p) for (const p of lm.p) { t.project(p[0], p[1], null, pr); const x = U.mod(pr.s - t.sf + L / 2, L) - L / 2; a0 = Math.min(a0, x); a1 = Math.max(a1, x); }
    const NB = Math.max(10, (EI.TEAMS || []).length || 11), half = NB * 9;
    const x0 = Math.max(-176, Math.min(-half - 20, Number.isFinite(a0) ? a0 : -176)), x1 = Math.min(176, Math.max(half + 20, Number.isFinite(a1) ? a1 : 140));
    // podium: facing the middle of the Main Grandstand (the OSM run opposite the pits), on the closed garages beyond the team boxes
    let xPod = -150; const runs = E.ctStandRuns || E.data.standRuns || [];
    for (const r of runs) if (r[2] === -side && U.mod(r[1] - r[0], L) > 150) { const mid = r[0] + U.mod(r[1] - r[0], L) / 2; const xm = U.mod(mid - t.sf + L / 2, L) - L / 2; if (Math.abs(xm) < 260) xPod = xm; }
    xPod = U.clamp(xPod, x0 + 16, x1 - 16); if (Math.abs(xPod) < half + 8) xPod = xPod < 0 ? -half - 8 : half + 8;
    // race control: the taller block at the Turn 1 end of the building
    const rc1 = x1 - 3, rc0 = rc1 - 28;
    const ZB = zGB + 12;                                                                    // the paddock-side wall
    // dv: the lap direction (+1 / -1 in x) of 'left to right' for someone on the track looking at the building
    const dv = side < 0 ? -1 : 1;
    return (E._ctPF = { side, dv, maxWall, latC, zG, zGB, ZB, x0, x1, half, xPod, rc0, rc1, yA, P, W, G, a0, a1 });
  };
  Ct.layoutPit = function (E) {
    const F = Ct.pitFrame(E); if (!F) return; const OCC = Env.OCC;
    const poly = []; for (let x = F.x0 - 3; x <= F.x1 + 3.01; x += 12) poly.push(F.W(x, F.zG - 2)); for (let x = F.x1 + 3; x >= F.x0 - 3.01; x -= 12) poly.push(F.W(x, F.ZB + 3));
    E.markPoly(poly, OCC.BUILT, 2); E.standPolys.push(poly); E.ctOwnPolys.push(poly); E.ctPitPoly = poly;
    // the OSM 'Pit Garages' footprint is replaced: free it from BUILT for the paddock units, keep trees off (KEEP)
    { const lm = E.data.landmarks && E.data.landmarks.pitBuilding; if (lm && lm.p && E.occ) { let ax0 = Infinity, ax1 = -Infinity, az0 = Infinity, az1 = -Infinity; for (const p of lm.p) { ax0 = Math.min(ax0, p[0]); ax1 = Math.max(ax1, p[0]); az0 = Math.min(az0, p[1]); az1 = Math.max(az1, p[1]); }
      for (let x = ax0; x <= ax1; x += 1) for (let z = az0; z <= az1; z += 1) { if (!U.pointInPoly(x, z, lm.p)) continue; const k = E.oi(x, z); if (k >= 0) E.occ[k] = (E.occ[k] & ~OCC.BUILT) | OCC.KEEP; }
      E.markPoly(poly, OCC.BUILT, 2); } }
    // the paddock behind the building: team hospitality units (two-storey white boxes, dark glass bands) in two rows, a few white marquees
    const rng = U.rng(2026); E.ctUnits = [];
    const tryUnit = (x, z, L, D, kind) => {
      const c = F.W(x, z), c2 = F.W(x + 1, z); let ax = c2[0] - c[0], az = c2[1] - c[1]; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l;
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].map(([u, v]) => [c[0] + ax * u * (L / 2 + 2) - az * v * (D / 2 + 2), c[1] + az * u * (L / 2 + 2) + ax * v * (D / 2 + 2)]);
      if (E.rectFree(c[0], c[1], ax, az, L / 2 + 2, D / 2 + 2, OCC.WATER | OCC.ROAD) < 0.9 || corners.some(q => E.fsAt(q[0], q[1]) < 14 || E.ctOwnPolys.some(p => U.pointInPoly(q[0], q[1], p)))) return false;
      let gmin = Infinity, gmax = -Infinity; for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) { const g = E.sc.height(c[0] + ax * u * L / 2 - az * v * D / 2, c[1] + az * u * L / 2 + ax * v * D / 2); gmin = Math.min(gmin, g); gmax = Math.max(gmax, g); }
      if (gmax - gmin > 2.5) return false;
      const tp = E.markRect(c[0], c[1], ax, az, L / 2 + 1.5, D / 2 + 1.5, OCC.BUILT); E.standPolys.push(tp); E.ctOwnPolys.push(tp);
      E.ctUnits.push({ cx: c[0], cz: c[1], ax, az, L, D, y: gmin, gmax, kind }); return true;
    };
    // row 1: hospitality units facing the building's paddock wall across a 14 m paddock street; row 2 behind (marquees / units)
    const xa = F.x0 + 14, xb = F.x1 - 14; let nU = 0;
    for (let x = xa; x < xb - 20 && nU < 11; x += 26 + rng() * 4) if (tryUnit(x + 10, F.ZB + 14 + 7, 20, 12, 'unit')) nU++;
    for (let x = xa + 6; x < xb - 24 && E.ctUnits.length < 17; x += 34 + rng() * 8) tryUnit(x + 12, F.ZB + 14 + 14 + 12 + 9, 24 + rng() * 6, 14, rng() < 0.55 ? 'marquee' : 'unit');
  };
  // after the terrain exists sc.height is exact: re-read the unit bases
  Ct.refit = function (E) {
    for (const T of E.ctUnits || []) { let gmin = Infinity, gmax = -Infinity; for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) { const g = E.sc.height(T.cx + T.ax * u * T.L / 2 - T.az * v * T.D / 2, T.cz + T.az * u * T.L / 2 + T.ax * v * T.D / 2); gmin = Math.min(gmin, g); gmax = Math.max(gmax, g); } T.y = gmin; T.gmax = gmax; }
  };

  // ================================================================ build (after the venue)
  Ct.build = function (E) {
    const T0 = performance.now(); const out = E.stats.cota = {}; const sc = E.sc, ST = sc.statics;
    const A = new Mz.Atlas();
    const BK = { B: new Env.Builder(), S: new Env.Builder(), G: new Env.Builder(), F: new Env.Builder(), H: new Env.Builder(), A };   // concrete / steel / glass / fine (clutter) / High-only
    const tc = () => (BK.B.count + BK.S.count + BK.G.count + BK.F.count + BK.H.count) / 3 + A.geo.p.length / 9; out.tc = {};
    const step = (k, fn) => { const t0 = performance.now(), c0 = tc(); try { fn(); } catch (e) { console.error('EnvCota ' + k, e); } out['ms_' + k] = Math.round(performance.now() - t0); out.tc[k] = Math.round(tc() - c0); };
    const PF = Ct.pitFrame(E);
    if (PF) { step('pit', () => buildPit(E, BK, PF, out)); step('podium', () => buildPodium(E, BK, PF)); step('paddock', () => buildUnits(E, BK)); }
    if (Ct.Stands) step('stands', () => Ct.Stands.build(E, BK, out));
    if (Ct.Infra) step('infra', () => Ct.Infra.build(E, BK, out));
    ST.add(BK.B.geometry(), 0.82, 0.03, 'main'); ST.add(BK.S.geometry(), 0.42, 0.55, 'main'); ST.add(BK.G.geometry(), 0.08, 0.55, 'main'); ST.add(BK.F.geometry(), 0.5, 0.35, 'clutter');
    out.tris = { main: BK.B.count / 3, steel: BK.S.count / 3, glass: BK.G.count / 3, fine: BK.F.count / 3, high: BK.H.count / 3 };
    if (BK.H.count) { const st = new Env.Statics(); st.add(BK.H.geometry(), 0.45, 0.4, 'clutter'); const g = new THREE.Group(); g.name = 'cotaHigh'; st.build(g); g.children.forEach(c => { c.name = 'cotaHi'; c.userData.clutter = true; }); g.visible = EI.quality === 'high'; sc.group.add(g); }
    const am = A.mesh('cotaSigns'); if (am) { sc.group.add(am); out.signTris = am.geometry.attributes.position.count / 3; }
    out.ms = Math.round(performance.now() - T0);
  };

  // ================================================================ the pit + paddock building
  // ground floor = garages (grey roller shutters, white number boards with black numerals; the team boxes' own fronts are js/pit.js's);
  // a navy fascia band with the COTA red line; the first-floor balcony slab with a glass railing and the glazed gallery behind it between
  // grey columns; a smooth silver spandrel band; the Paddock Club level glazed full height, its glass leaning out a little; the big flat
  // white roof canopy cantilevered ~7 m out over the working lane on a deep tapered edge. The paddock side is silver cladding from the drawn
  // ground with two window bands. Whites are kept <= 0xdcdfe0 (they clip under the grade otherwise; the Spa lesson).
  function buildPit(E, BK, F, out) {
    const { B, S, G, F: Fd, H, A } = BK; const P = F.P, zG = F.zG, ZB = F.ZB;
    const x0 = F.x0, x1 = F.x1, half = F.half;
    const lane = (x) => { const a = P(x, 0, zG), b = P(x, 0, zG - 1); return [b[0] - a[0], 0, b[2] - a[2]]; };   // world direction towards the track
    const back = (x) => { const v = lane(x); return [-v[0], 0, -v[2]]; };
    const pan = [C(0xa4a9ae), C(0x969ba0)], conc = C(0xb3b7ba), concD = C(0x9a9ea1), navy = C(0x1d2640), red = C(0xc8102e), white = C(0xcdd0d2), offW = C(0xc4c8ca);   // piers / fascia a step darker (BEAUTY 17:48: whites clip in the Texas sun)
    const glass = C(0x26323d), glassL = C(0x3a4d5e), mull = C(0xb3b8bc), steel = C(0x8f969c), roofT = C(0xc9ccce), soffit = C(0xaeb3b7), plinth = C(0x5d6166);
    const yH0 = 4.8, yH1 = 6.0, yB0 = 6.45, yB1 = 6.8, yL2 = 9.9, yS1 = 10.7, yT = 14.0, yR = 14.4, yR1 = 15.0;   // header, balcony slab, level 2 slab, spandrel top, roof
    const zBal = zG - 1.8, zGal = zG + 1.4, zL2 = zG - 0.3, lean = 0.7, zR0 = zG - 7.2;
    const inRC = (x) => x > F.rc0 - 0.01 && x < F.rc1 + 0.01;
    const shR = A.region('ctShutter', 96, 128, (x2, w, h) => { x2.fillStyle = '#6b7075'; x2.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 4) { x2.fillStyle = 'rgba(255,255,255,0.12)'; x2.fillRect(0, y, w, 1); x2.fillStyle = 'rgba(0,0,0,0.2)'; x2.fillRect(0, y + 2, w, 1); } x2.fillStyle = 'rgba(0,0,0,0.3)'; x2.fillRect(0, h - 6, w, 6); });
    const digR = A.region('ctDigits', 640, 96, (x2, w, h) => { x2.fillStyle = '#ffffff'; x2.fillRect(0, 0, w, h); x2.fillStyle = '#111111'; x2.font = '700 80px Arial, sans-serif'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; for (let k = 0; k < 10; k++) x2.fillText(String(k), k * 64 + 32, h * 0.54); });
    const nameR = A.region('ctPitName', 1024, 64, (x2, w, h) => Ct.paintCota(x2, w, h, 'CIRCUIT OF THE AMERICAS'));
    const bays = []; for (let x = x0; x < x1 - 0.01; x += 9) bays.push([x, Math.min(x1, x + 9)]);
    let shutters = 0, gno = 1;
    for (let bi = 0; bi < bays.length; bi++) {
      const [xa, xb] = bays[bi];
      const xc = (xa + xb) / 2, w = xb - xa, LN = lane(xc), BKW = back(xc), team = xc > -half && xc < half, rc = inRC(xc);
      // ---- ground floor: closed garages beyond the team boxes (piers, shutters, number boards); offices with glass under race control
      if (!team) {
        for (let x = xa; x <= xb + 0.01; x += 4.5) Ct.hex(B, [P(x - 0.3, -0.3, zG), P(x + 0.3, -0.3, zG), P(x + 0.3, -0.3, zG + 0.7), P(x - 0.3, -0.3, zG + 0.7), P(x - 0.3, yH0, zG), P(x + 0.3, yH0, zG), P(x + 0.3, yH0, zG + 0.7), P(x - 0.3, yH0, zG + 0.7)], conc, null, true);
        for (let x = xa; x < xb - 1; x += 4.5) {
          const sa = x + 0.3, sb = Math.min(xb, x + 4.5) - 0.3; if (sb - sa < 1) continue;
          if (rc) { Ct.face(B, P(sa, 0, zG + 0.45), P(sb, 0, zG + 0.45), P(sb, 0.9, zG + 0.45), P(sa, 0.9, zG + 0.45), concD, LN); Ct.face(G, P(sa, 0.9, zG + 0.45), P(sb, 0.9, zG + 0.45), P(sb, yH0, zG + 0.45), P(sa, yH0, zG + 0.45), glassL, LN); continue; }
          Ct.faceA(A, shR, P(sa, 0.02, zG + 0.4), P(sb, 0.02, zG + 0.4), P(sb, 4.5, zG + 0.4), P(sa, 4.5, zG + 0.4), LN); shutters++;
          const n = String(gno++ % 100).padStart(2, '0'); const xm = (sa + sb) / 2, dw = 0.36, yb = yH0 - 0.95, dh = 0.6, zd = zG + 0.37;
          Ct.face(Fd, P(xm - 0.85, yb - 0.05, zd + 0.01), P(xm + 0.85, yb - 0.05, zd + 0.01), P(xm + 0.85, yb + dh + 0.05, zd + 0.01), P(xm - 0.85, yb + dh + 0.05, zd + 0.01), offW, LN);
          for (let j = 0; j < 2; j++) { const d = +n[j]; const u0 = d / 10 + 0.004, u1 = (d + 1) / 10 - 0.004; const lft = xm - F.dv * dw + j * F.dv * dw, rgt = lft + F.dv * dw; Ct.faceA(A, digR, P(lft, yb, zd - 0.01), P(rgt, yb, zd - 0.01), P(rgt, yb + dh, zd - 0.01), P(lft, yb + dh, zd - 0.01), LN, u0, u1, 0, 1); }
        }
      }
      // ---- header: navy fascia with the red line (the team signs of pit.js stand just in front of it over the team boxes)
      Ct.hex(B, [P(xa, yH0, zG), P(xb, yH0, zG), P(xb, yH0, zG + 1.0), P(xa, yH0, zG + 1.0), P(xa, yH1, zG), P(xb, yH1, zG), P(xb, yH1, zG + 1.0), P(xa, yH1, zG + 1.0)], navy, null, false);
      Ct.face(B, P(xa, yH0 - 0.02, zG - 0.02), P(xb, yH0 - 0.02, zG - 0.02), P(xb, yH0 + 0.14, zG - 0.02), P(xa, yH0 + 0.14, zG - 0.02), red, LN);
      Ct.face(B, P(xa, yH1, zG + 0.6), P(xb, yH1, zG + 0.6), P(xb, yB0, zG + 0.6), P(xa, yB0, zG + 0.6), concD, LN);
      // ---- first floor: balcony slab, glass railing, the gallery glazing between grey columns
      Ct.hex(B, [P(xa, yB0, zBal), P(xb, yB0, zBal), P(xb, yB0, zGal + 0.3), P(xa, yB0, zGal + 0.3), P(xa, yB1, zBal), P(xb, yB1, zBal), P(xb, yB1, zGal + 0.3), P(xa, yB1, zGal + 0.3)], offW, C(0x9ea3a7), false);
      Ct.face(G, P(xa, yB1, zBal + 0.08), P(xb, yB1, zBal + 0.08), P(xb, yB1 + 1.05, zBal + 0.08), P(xa, yB1 + 1.05, zBal + 0.08), C(0x8aa7b2), LN);
      Fd.beam(Env.frame(0, 0, 0, 1, 0, 0, 1), P(xa, yB1 + 1.08, zBal + 0.08), P(xb, yB1 + 1.08, zBal + 0.08), 0.07, steel);
      const nc = Math.max(1, Math.round(w / 1.5));
      for (let c = 0; c < nc; c++) { const ca = xa + c * w / nc, cb = ca + w / nc; Ct.face(G, P(ca, yB1, zGal), P(cb, yB1, zGal), P(cb, yL2, zGal), P(ca, yL2, zGal), (c % 3 ? glass : glassL), LN); if (c) Ct.face(Fd, P(ca - 0.04, yB1, zGal - 0.03), P(ca + 0.04, yB1, zGal - 0.03), P(ca + 0.04, yL2, zGal - 0.03), P(ca - 0.04, yL2, zGal - 0.03), mull, LN); }
      Ct.hex(S, [P(xa - 0.22, yB1, zBal + 0.5), P(xa + 0.22, yB1, zBal + 0.5), P(xa + 0.22, yB1, zBal + 0.94), P(xa - 0.22, yB1, zBal + 0.94), P(xa - 0.22, yL2, zBal + 0.5), P(xa + 0.22, yL2, zBal + 0.5), P(xa + 0.22, yL2, zBal + 0.94), P(xa - 0.22, yL2, zBal + 0.94)], C(0x80868c), null, true);
      Ct.face(B, P(xa, yL2, zBal), P(xb, yL2, zBal), P(xb, yL2, zGal), P(xa, yL2, zGal), concD, [0, -1, 0]);
      // ---- spandrel: smooth silver band with a dark shadow line, then the Paddock Club level glazed full height (leaning out)
      Ct.face(B, P(xa, yL2, zBal), P(xb, yL2, zBal), P(xb, yS1, zBal), P(xa, yS1, zBal), pan[bi % 2], LN);
      Ct.face(Fd, P(xa, yL2 + 0.05, zBal - 0.02), P(xb, yL2 + 0.05, zBal - 0.02), P(xb, yL2 + 0.16, zBal - 0.02), P(xa, yL2 + 0.16, zBal - 0.02), C(0x3a3f45), LN);
      Ct.face(B, P(xa, yS1, zBal), P(xb, yS1, zBal), P(xb, yS1, zL2), P(xa, yS1, zL2), concD, [0, 1, 0]);
      for (let c = 0; c < nc; c++) { const ca = xa + c * w / nc, cb = ca + w / nc; Ct.face(G, P(ca, yS1, zL2), P(cb, yS1, zL2), P(cb, yT, zL2 - lean), P(ca, yT, zL2 - lean), c % 2 ? glassL : glass, LN); }
      for (let x = xa; x < xb - 0.1; x += 3) Ct.face(Fd, P(x - 0.06, yS1, zL2 - 0.04), P(x + 0.06, yS1, zL2 - 0.04), P(x + 0.06, yT, zL2 - lean - 0.04), P(x - 0.06, yT, zL2 - lean - 0.04), mull, LN);
      // ---- the roof canopy: flat white top, grey soffit, a deep front edge tapering to the facade; the roof deck behind
      Ct.hex(B, [P(xa, yR, zR0), P(xb, yR, zR0), P(xb, yR, ZB + 0.4), P(xa, yR, ZB + 0.4), P(xa, yR1, zR0), P(xb, yR1, zR0), P(xb, yR1, ZB + 0.4), P(xa, yR1, ZB + 0.4)], soffit, roofT, false);
      Ct.face(B, P(xa, yR - 0.55, zR0 - 0.02), P(xb, yR - 0.55, zR0 - 0.02), P(xb, yR1, zR0 - 0.02), P(xa, yR1, zR0 - 0.02), white, LN);
      Ct.face(B, P(xa, yR - 0.55, zR0), P(xb, yR - 0.55, zR0), P(xb, yR, zL2 - lean), P(xa, yR, zL2 - lean), soffit, [0, -1, 0]);
      Ct.face(B, P(xa, yT, zL2 - lean), P(xb, yT, zL2 - lean), P(xb, yR, zL2 - lean), P(xa, yR, zL2 - lean), concD, LN);
      if (bi % 2 === 0) { H.beam(Env.frame(0, 0, 0, 1, 0, 0, 1), P(xa + 0.3, yT, zL2 - lean - 0.1), P(xa + 0.3, yR - 0.4, zR0 + 0.6), 0.08, steel); }
      Fd.beam(Env.frame(0, 0, 0, 1, 0, 0, 1), P(xa, yR1 + 1.0, zG + 2.0), P(xb, yR1 + 1.0, zG + 2.0), 0.05, steel);
      if (bi % 2 === 0) Fd.beam(Env.frame(0, 0, 0, 1, 0, 0, 1), P(xa + 0.2, yR1, zG + 2.0), P(xa + 0.2, yR1 + 1.0, zG + 2.0), 0.05, steel);
      // ---- the paddock side: silver cladding from the drawn ground, two window bands, a dark plinth
      const g0 = Math.min(F.G(xa, ZB), F.G(xb, ZB), 0) - 0.5;
      Ct.face(B, P(xa, g0, ZB), P(xb, g0, ZB), P(xb, Math.min(0.4, g0 + 2), ZB), P(xa, Math.min(0.4, g0 + 2), ZB), plinth, BKW);
      Ct.face(B, P(xa, Math.min(0.4, g0 + 2), ZB), P(xb, Math.min(0.4, g0 + 2), ZB), P(xb, yR, ZB), P(xa, yR, ZB), pan[bi % 2], BKW);
      for (const [ya, yb] of [[2.0, 4.2], [7.2, 9.2], [11.0, 13.4]]) Ct.face(G, P(xa + 0.6, ya, ZB + 0.03), P(xb - 0.6, ya, ZB + 0.03), P(xb - 0.6, yb, ZB + 0.03), P(xa + 0.6, yb, ZB + 0.03), glass, BKW);
      out.pitBays = (out.pitBays || 0) + 1;
    }
    // ---- High only: roof plant (AC units, louvred boxes) on the deck behind the canopy edge, a terrace rail along the club's roof edge
    { const H0 = Env.frame(0, 0, 0, 1, 0, 0, 1); for (let x = x0 + 12; x < x1 - 10; x += 23) { const p = P(x, yR1, ZB - 6); H.box(Env.frame(p[0], p[1], p[2], ...Ct.dir(P(x, 0, ZB - 6), P(x + 1, 0, ZB - 6)).filter((_, k) => k !== 1), ...Ct.dir(P(x, 0, ZB - 6), P(x, 0, ZB - 5)).filter((_, k) => k !== 1)), 6, 1.8, 3.2, 0, 0, 0, C(0x9ea3a7), { top: C(0x7d838a) }); }
      for (let x = x0; x < x1 - 0.1; x += 3) H.beam(H0, P(x, yR1, zG + 2.0), P(x, yR1 + 1.0, zG + 2.0), 0.05, steel); }
    // ---- end walls (silver cladding, down to the drawn ground), the roof canopy's end fascias
    for (const [xe, sg] of [[x0, -1], [x1, 1]]) {
      const want = Ct.dir(P(xe, 0, zG), P(xe + sg, 0, zG));
      const gE = Math.min(F.G(xe, zG), F.G(xe, ZB), 0) - 0.5;
      Ct.face(B, P(xe, gE, zBal), P(xe, gE, ZB), P(xe, yR, ZB), P(xe, yR, zBal), pan[0], want);
      Ct.face(B, P(xe, yR - 0.55, zR0), P(xe, yR - 0.55, ZB + 0.4), P(xe, yR1, ZB + 0.4), P(xe, yR1, zR0), white, want);
    }
    // ---- race-control block: one storey taller, glazed and leaning like the club level, a white cap, the antenna mast
    { const xa = F.rc0, xb = F.rc1, y0 = yR1, y1 = yR1 + 4.0, y2 = y1 + 0.6, za = zL2 + 1.5, zb = ZB - 5; const LN = lane((xa + xb) / 2);
      const nc = Math.round((xb - xa) / 1.6);
      for (let c = 0; c < nc; c++) { const ca = xa + c * (xb - xa) / nc, cb = ca + (xb - xa) / nc; Ct.face(G, P(ca, y0, za), P(cb, y0, za), P(cb, y1, za - 0.6), P(ca, y1, za - 0.6), c % 2 ? glassL : glass, LN); }
      for (let x = xa; x <= xb + 0.01; x += (xb - xa) / 8) Ct.face(Fd, P(x - 0.06, y0, za - 0.04), P(x + 0.06, y0, za - 0.04), P(x + 0.06, y1, za - 0.64), P(x - 0.06, y1, za - 0.64), mull, LN);
      for (const [xe, sg] of [[xa, -1], [xb, 1]]) { const want = Ct.dir(P(xe, 0, za), P(xe + sg, 0, za)); Ct.face(B, P(xe, y0, za), P(xe, y0, zb), P(xe, y1, zb), P(xe, y1, za - 0.6), pan[1], want); }
      Ct.face(B, P(xa, y0, zb), P(xb, y0, zb), P(xb, y1, zb), P(xa, y1, zb), pan[0], back((xa + xb) / 2));
      Ct.hex(B, [P(xa - 0.4, y1, za - 1.8), P(xb + 0.4, y1, za - 1.8), P(xb + 0.4, y1, zb + 0.4), P(xa - 0.4, y1, zb + 0.4), P(xa - 0.4, y2, za - 1.8), P(xb + 0.4, y2, za - 1.8), P(xb + 0.4, y2, zb + 0.4), P(xa - 0.4, y2, zb + 0.4)], soffit, roofT, false);
      Ct.face(B, P(xa - 0.4, y1 - 0.3, za - 1.82), P(xb + 0.4, y1 - 0.3, za - 1.82), P(xb + 0.4, y2, za - 1.82), P(xa - 0.4, y2, za - 1.82), navy, LN);
      const xm = (xa + xb) / 2 + 5;
      { const p0 = P(xm, y2, (za + zb) / 2), p1 = P(xm, y2 + 10, (za + zb) / 2); S.beam(Env.frame(0, 0, 0, 1, 0, 0, 1), p0, p1, 0.16, C(0xc9cdd1)); for (let k = 0; k < 3; k++) Fd.box(Env.frame(p1[0], p1[1] - 2 - k * 1.6, p1[2], 1, 0, 0, 1), 0.8, 0.5, 0.12, 0, 0, 0, C(0xcfd3d6)); } }
    // ---- the circuit's name on the spandrel over the closed garages of the longer non-team stretch
    { const lenL = -half - x0, lenR = x1 - half; let xn0, xn1; if (lenL >= lenR) { xn0 = x0 + 6; xn1 = Math.min(-half - 4, xn0 + 60); } else { xn1 = Math.min(x1 - 6, F.rc0 - 2); xn0 = Math.max(half + 4, xn1 - 60); }
      if (xn1 - xn0 > 20) { const LN = lane((xn0 + xn1) / 2); const zz = zBal - 0.05; const lft = F.dv > 0 ? xn0 : xn1, rgt = F.dv > 0 ? xn1 : xn0; Ct.faceA(A, nameR, P(lft, yL2 + 0.1, zz), P(rgt, yL2 + 0.1, zz), P(rgt, yS1 - 0.08, zz), P(lft, yS1 - 0.08, zz), LN); } }
    out.pit = { x0: Math.round(x0), x1: Math.round(x1), latC: +F.latC.toFixed(1), zG: +zG.toFixed(1), xPod: Math.round(F.xPod), shutters, osm: [Math.round(F.a0), Math.round(F.a1)] };
  }
  // ---- the podium: a balcony platform (~14 x 3.6 m) cantilevered from the first-floor gallery over the working lane (no columns in the lane),
  // a deep navy edge beam with a UNITED STATES GRAND PRIX fascia, a glass railing, the stepped 2-1-3 rostrum, the tall backdrop (navy with
  // white stars over red / white stripes, the F1 mark and partner tiles) against the gallery, flags on top (USA, Texas and two podium nations)
  function buildPodium(E, BK, F) {
    const { B, S, G, F: Fd, A } = BK; const P = F.P, zG = F.zG; const xc = F.xPod, hw = 7.2;
    const LN = Ct.dir(P(xc, 0, zG), P(xc, 0, zG - 1));
    const yU = 5.6, yD = 6.15, zIn = zG - 1.8, zTip = zG - 5.4; const steel = C(0x4b5260), grey = C(0xb4b9be);
    Ct.hex(B, [P(xc - hw, yU, zTip), P(xc + hw, yU, zTip), P(xc + hw, yU, zIn + 1.5), P(xc - hw, yU, zIn + 1.5), P(xc - hw, yD, zTip), P(xc + hw, yD, zTip), P(xc + hw, yD, zIn + 1.5), P(xc - hw, yD, zIn + 1.5)], grey, C(0x7d838a), false);
    const fR = A.region('ctPodFascia', 768, 64, (x2, w, h) => Ct.paintCota(x2, w, h, 'UNITED STATES GRAND PRIX'));
    { const lft = xc - F.dv * hw, rgt = xc + F.dv * hw; Ct.faceA(A, fR, P(lft, yU - 0.6, zTip - 0.05), P(rgt, yU - 0.6, zTip - 0.05), P(rgt, yD + 0.02, zTip - 0.05), P(lft, yD + 0.02, zTip - 0.05), LN); }
    for (const sx of [-1, 1]) S.beam(Env.frame(0, 0, 0, 1, 0, 0, 1), P(xc + sx * (hw - 0.6), yU - 0.6, zTip + 0.2), P(xc + sx * (hw - 0.6), yU - 0.1, zIn + 2.0), 0.35, steel);
    Ct.face(G, P(xc - hw, yD, zTip + 0.15), P(xc + hw, yD, zTip + 0.15), P(xc + hw, yD + 1.05, zTip + 0.15), P(xc - hw, yD + 1.05, zTip + 0.15), C(0x9ec0c8), LN);
    for (const sx of [-1, 1]) Ct.face(G, P(xc + sx * hw, yD, zTip + 0.15), P(xc + sx * hw, yD, zIn), P(xc + sx * hw, yD + 1.05, zIn), P(xc + sx * hw, yD + 1.05, zTip + 0.15), C(0x9ec0c8), Ct.dir(P(xc, 0, zG), P(xc + sx, 0, zG)));
    // rostrum 2 - 1 - 3 (dark steps with white tops)
    for (const [dx, h] of [[-2.3, 0.45], [0, 0.8], [2.3, 0.3]]) { const xm = xc + F.dv * dx; Ct.hex(B, [P(xm - 1.1, yD, zIn - 1.9), P(xm + 1.1, yD, zIn - 1.9), P(xm + 1.1, yD, zIn - 0.2), P(xm - 1.1, yD, zIn - 0.2), P(xm - 1.1, yD + h, zIn - 1.9), P(xm + 1.1, yD + h, zIn - 1.9), P(xm + 1.1, yD + h, zIn - 0.2), P(xm - 1.1, yD + h, zIn - 0.2)], C(0x2b3245), C(0xd5d8da), true); }
    const bR = A.region('ctPodWall', 480, 200, (x2, w, h) => {
      for (let k = 0; k < 7; k++) { x2.fillStyle = k % 2 ? '#e9e9e9' : '#b22234'; x2.fillRect(0, h * 0.55 + k * h * 0.45 / 7, w, h * 0.45 / 7 + 1); }
      x2.fillStyle = '#1d2640'; x2.fillRect(0, 0, w, h * 0.55); for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) Ct.star(x2, (i + 0.5 + (j % 2) * 0.5) * w / 9.5, (j + 0.6) * h * 0.55 / 3.3, h * 0.035, '#e9e9e9');
      x2.fillStyle = '#ffffff'; x2.fillRect(w * 0.3, h * 0.1, w * 0.4, h * 0.3); if (EI.Ads && EI.Ads.drawF1) EI.Ads.drawF1(x2, w * 0.5, h * 0.25, w * 0.34, h * 0.24); else Mz.paintText(x2, w * 0.4, h * 0.3, 'F1', { bg: '#ffffff', fg: '#e10600' });
      if (EI.Ads && EI.Ads.paintTile) for (let k = 0; k < 4; k++) { const tw = w * 0.2, th = tw / 5; x2.save(); EI.Ads.paintTile(x2, k, w * 0.08 + k * w * 0.215, h * 0.66, tw, th, 5); x2.restore(); }
    });
    { const zb = zIn + 0.1, y0 = yD + 0.05, y1 = yD + 5.05, bw = 6.2; const lft = xc - F.dv * bw, rgt = xc + F.dv * bw; Ct.faceA(A, bR, P(lft, y0, zb), P(rgt, y0, zb), P(rgt, y1, zb), P(lft, y1, zb), LN);
      Ct.hex(S, [P(xc - bw - 0.2, y0, zb + 0.05), P(xc + bw + 0.2, y0, zb + 0.05), P(xc + bw + 0.2, y0, zb + 0.4), P(xc - bw - 0.2, y0, zb + 0.4), P(xc - bw - 0.2, y1 + 0.2, zb + 0.05), P(xc + bw + 0.2, y1 + 0.2, zb + 0.05), P(xc + bw + 0.2, y1 + 0.2, zb + 0.4), P(xc - bw - 0.2, y1 + 0.2, zb + 0.4)], C(0x1b1d22), null, true);
      const fl = Ct.flagRegions(A); const pick = [fl[0], fl[1], fl[2], fl[3]];
      for (let k = 0; k < 4; k++) { const x = xc - 4.5 + k * 3; const p0 = P(x, y1 + 0.2, zb + 0.2), p1 = P(x, y1 + 3.4, zb + 0.2); Fd.beam(Env.frame(0, 0, 0, 1, 0, 0, 1), p0, p1, 0.06, C(0xc9cdd1)); const yaw = Math.atan2(LN[0], LN[2]) + Math.PI / 2; if (Mz.Stands && Mz.Stands.flag) Mz.Stands.flag(A, pick[k], P(x, y1 + 3.35, zb + 0.2), yaw, 1.6, 1.05); } }
    E.stats.cota.podium = { x: Math.round(xc), y: +yD.toFixed(1) };
  }
  // ---- the paddock: team hospitality units (two-storey white boxes with dark glass bands, a roof terrace rail) and white marquees
  function buildUnits(E, BK) {
    const { B, G, F: Fd } = BK; const white = C(0xd6d9da), whiteS = C(0xcdd0d2), frame = C(0xb3b8bc), glass = C(0x2a3642), grey = C(0x8a9095); let n = 0;
    for (const T of E.ctUnits || []) {
      const m = Env.frame(T.cx, T.y, T.cz, T.ax, T.az, -T.az, T.ax); const hl = T.L / 2, hd = T.D / 2; const P = (x, y, z) => Env.xf(m, x, y, z); const lift = T.gmax - T.y;
      if (T.kind === 'unit') {
        const h1 = 3.4 + lift, h2 = h1 + 3.2;
        B.box(m, T.L, h2 + 0.3, T.D, 0, -0.3, 0, whiteS, { top: grey });
        for (const sz of [-1, 1]) { const want = Ct.dir(P(0, 0, 0), P(0, 0, sz)); for (const [ya, yb] of [[lift + 0.9, h1 - 0.4], [h1 + 0.5, h2 - 0.5]]) Ct.face(G, P(-hl + 1, ya, sz * (hd + 0.03)), P(hl - 1, ya, sz * (hd + 0.03)), P(hl - 1, yb, sz * (hd + 0.03)), P(-hl + 1, yb, sz * (hd + 0.03)), glass, want); }
        Fd.box(m, T.L, 0.12, T.D, 0, h1 - 0.1, 0, frame); Fd.beam(m, [-hl, h2 + 1.0, -hd], [hl, h2 + 1.0, -hd], 0.06, frame); Fd.beam(m, [-hl, h2 + 1.0, hd], [hl, h2 + 1.0, hd], 0.06, frame);
      } else {
        const wh = 3.2 + lift, rh = wh + T.D * 0.28;
        B.box(m, T.L, wh + 0.3, T.D, 0, -0.3, 0, whiteS);
        for (const sz of [-1, 1]) Ct.face(B, P(-hl - 0.2, wh - 0.3, sz * (hd + 0.3)), P(hl + 0.2, wh - 0.3, sz * (hd + 0.3)), P(hl + 0.2, rh - 0.3, 0), P(-hl - 0.2, rh - 0.3, 0), white, [0, 1, 0]);
        for (const sx of [-1, 1]) Ct.face(B, P(sx * hl, wh - 0.3, -hd), P(sx * hl, wh - 0.3, hd), P(sx * hl, rh - 0.3, 0), P(sx * hl, rh - 0.3, 0), white, Ct.dir(P(0, 0, 0), P(sx, 0, 0)));
        for (let x = -hl; x <= hl + 0.01; x += 5) Fd.box(m, 0.12, 0.12, T.D + 0.1, x, wh - 0.45, 0, frame);
      }
      n++;
    }
    E.stats.cota.units = n;
  }

  EI.EnvCota = Ct;
})();
