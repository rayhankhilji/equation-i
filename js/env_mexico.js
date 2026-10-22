// Equation I - Autodromo Hermanos Rodriguez (MEX-MODELS): the venue's structures. This file is the entry point: lap helpers, the hooks
// into the shared venue / scenery passes (gated by isMexico, the other circuits are untouched) and the pit + paddock complex on the pit
// side of the start straight - the long two-storey garage block of the 2015 rebuild with the glazed Paddock Club level, the charcoal
// fascia with the green-white-red pin stripe, the flat light-grey roof canopy over the working lane, the taller race-control block at
// the Turn 1 end, and the team hospitality units / marquees in the paddock behind.
// The Foro Sol bowl, the Harp Helu shell and every grandstand are in js/env_mexico_stands.js; the podium on the stadium field, the
// Paddock Club blocks, light towers, start gantry, footbridges, the Palacio de los Deportes and the velodrome in js/env_mexico_infra.js.
// Mexico City's site is FLAT (3 m over the lap): everything still stands on the drawn ground (sc.height, re-read after the terrain is
// built), with walls / skirts down to it, so nothing floats or hangs over a drop.
// Static geometry is vertex-coloured into the scenery's merged chunked statics (no new material / program): B concrete / cladding,
// S steel, G glass (main layer = the Low massing), F fine detail (clutter layer, dropped beyond the tier's clutter range), H High-only
// detail in a 'mexHigh' group; signs, digits, screens and flags share one canvas atlas mesh (EnvMonza.Atlas).
window.EI = window.EI || {};
(function () {
  const U = EI.U, Env = EI.Env, Mz = EI.EnvMonza; if (!Env || !Mz) return;
  const K = Mz.K, C = K.C;
  const Mx = {}; const isMexico = (t) => !!(t && t.data && t.data.id === 'mexico');
  Mx.isMexico = isMexico; Mx.K = K; Mx.C = C;

  // ================================================================ lap helpers (as js/env_cota.js)
  Mx.cs = function (t, n) { if (n == null || n === 'line') return t.sf || 0; const c = t.data.corners.find(k => k.t === n); return c ? c.s : (t.sf || 0); };
  Mx.at = function (t, s, side, d, o) {
    o = o || {}; const f = U.mod(s / t.ds, t.n); const i = Math.floor(f), j = (i + 1) % t.n, u = f - i;
    let tx = U.lerp(t.tx[i], t.tx[j], u), tz = U.lerp(t.tz[i], t.tz[j], u); const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const nx = U.lerp(t.nx[i], t.nx[j], u) * side, nz = U.lerp(t.nz[i], t.nz[j], u) * side;
    o.x = U.lerp(t.x[i], t.x[j], u) + nx * d; o.z = U.lerp(t.z[i], t.z[j], u) + nz * d; o.y = U.lerp(t.y[i], t.y[j], u);
    o.tx = tx; o.tz = tz; o.nx = nx; o.nz = nz; o.i = u < 0.5 ? i : j; return o;
  };
  Mx.outside = function (t, s) { if (!t._mxKK) t._mxKK = t.smooth(t.k, 15); return t._mxKK[t.idxAtS(s)] > 0 ? -1 : 1; };
  Mx.face = function (Bd, a, b, c, d, col, want) { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2]; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; if (nx * want[0] + ny * want[1] + nz * want[2] >= 0) Bd.quad(a, b, c, d, col); else Bd.quad(d, c, b, a, col); };
  Mx.faceA = function (A, r, a, b, c, d, want, u0, u1, v0, v1) { u0 = u0 || 0; u1 = u1 == null ? 1 : u1; v0 = v0 || 0; v1 = v1 == null ? 1 : v1; const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2]; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; if (nx * want[0] + ny * want[1] + nz * want[2] >= 0) A.quad(r, a, b, c, d, u0, u1, v0, v1); else A.quad(r, b, a, d, c, u1, u0, v0, v1); };
  Mx.hex = function (Bd, c8, col, top, skipBottom) {
    let cx = 0, cy = 0, cz = 0; for (const p of c8) { cx += p[0] / 8; cy += p[1] / 8; cz += p[2] / 8; }
    const F = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
    F.forEach((f, k) => { if (k === 0 && skipBottom) return; const a = c8[f[0]], b = c8[f[1]], c = c8[f[2]], d = c8[f[3]]; const mx = (a[0] + c[0]) / 2 - cx, my = (a[1] + c[1]) / 2 - cy, mz = (a[2] + c[2]) / 2 - cz; Mx.face(Bd, a, b, c, d, k === 1 && top ? top : col, [mx, my, mz]); });
  };
  Mx.tri = function (Bd, a, b, c, col, want) { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; if (nx * want[0] + ny * want[1] + nz * want[2] >= 0) Bd.tri(a, b, c, col); else Bd.tri(a, c, b, col); };
  Mx.dir = (a, b) => { const x = b[0] - a[0], z = b[2] - a[2]; const l = Math.hypot(x, z) || 1; return [x / l, 0, z / l]; };
  Mx.I4 = () => Env.frame(0, 0, 0, 1, 0, 0, 1);
  Mx.centroid = (p) => { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; };
  // the lowest / highest drawn ground under a list of [x, z] points
  Mx.gmin = (sc, pts) => { let g = Infinity; for (const p of pts) g = Math.min(g, sc.height(p[0], p[1])); return g; };
  Mx.gmax = (sc, pts) => { let g = -Infinity; for (const p of pts) g = Math.max(g, sc.height(p[0], p[1])); return g; };
  // flags (atlas painters): Mexico (green-white-red with a simplified eagle disc), the Netherlands, GB, Italy, Verstappen orange, calavera
  Mx.paintFlagMX = (x2, w, h) => {
    x2.fillStyle = '#006847'; x2.fillRect(0, 0, w / 3 + 1, h); x2.fillStyle = '#e9e9e6'; x2.fillRect(w / 3, 0, w / 3 + 1, h); x2.fillStyle = '#ce1126'; x2.fillRect(2 * w / 3, 0, w / 3 + 1, h);
    const cx = w / 2, cy = h / 2, r = h * 0.17; x2.fillStyle = '#8a5a2b'; x2.beginPath(); x2.ellipse(cx, cy, r * 0.8, r, 0, 0, 7); x2.fill(); x2.fillStyle = '#3f6b2a'; x2.beginPath(); x2.ellipse(cx, cy + r * 0.8, r * 1.1, r * 0.35, 0, 0, Math.PI); x2.fill();
  };
  Mx.paintFlagNL = (x2, w, h) => { x2.fillStyle = '#ae1c28'; x2.fillRect(0, 0, w, h / 3 + 1); x2.fillStyle = '#ececec'; x2.fillRect(0, h / 3, w, h / 3 + 1); x2.fillStyle = '#21468b'; x2.fillRect(0, 2 * h / 3, w, h / 3 + 1); };
  Mx.paintFlagGB = (x2, w, h) => { x2.fillStyle = '#012169'; x2.fillRect(0, 0, w, h); x2.strokeStyle = '#ececec'; x2.lineWidth = 12; x2.beginPath(); x2.moveTo(0, 0); x2.lineTo(w, h); x2.moveTo(w, 0); x2.lineTo(0, h); x2.stroke(); x2.strokeStyle = '#c8102e'; x2.lineWidth = 5; x2.stroke(); x2.fillStyle = '#ececec'; x2.fillRect(w * 0.42, 0, w * 0.16, h); x2.fillRect(0, h * 0.38, w, h * 0.24); x2.fillStyle = '#c8102e'; x2.fillRect(w * 0.46, 0, w * 0.08, h); x2.fillRect(0, h * 0.44, w, h * 0.12); };
  Mx.paintFlagIT = (x2, w, h) => Mz.paintTricolore(x2, w, h);
  Mx.paintFlagOrange = (x2, w, h) => { x2.fillStyle = '#ff6a00'; x2.fillRect(0, 0, w, h); x2.fillStyle = '#ffffff'; x2.font = 'italic 900 ' + Math.round(h * 0.42) + 'px Arial'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText('MAX 1', w / 2, h / 2); };
  Mx.paintFlagCheco = (x2, w, h) => { x2.fillStyle = '#16181d'; x2.fillRect(0, 0, w, h); x2.fillStyle = '#006847'; x2.fillRect(0, h * 0.8, w / 3, h * 0.2); x2.fillStyle = '#e9e9e6'; x2.fillRect(w / 3, h * 0.8, w / 3, h * 0.2); x2.fillStyle = '#ce1126'; x2.fillRect(2 * w / 3, h * 0.8, w / 3 + 1, h * 0.2); x2.fillStyle = '#e9e9e6'; x2.font = 'italic 900 ' + Math.round(h * 0.38) + 'px Arial'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText('CHECO 11', w / 2, h * 0.42); };
  Mx.paintCalavera = (x2, w, h) => {
    x2.fillStyle = '#1b1530'; x2.fillRect(0, 0, w, h); const cx = w / 2, cy = h * 0.46, r = Math.min(w, h) * 0.34;
    x2.fillStyle = '#e8e2d4'; x2.beginPath(); x2.arc(cx, cy, r, Math.PI * 0.95, Math.PI * 2.05); x2.lineTo(cx + r * 0.62, cy + r * 1.05); x2.lineTo(cx - r * 0.62, cy + r * 1.05); x2.closePath(); x2.fill();
    for (const sx of [-1, 1]) { x2.fillStyle = '#1b1530'; x2.beginPath(); x2.arc(cx + sx * r * 0.4, cy + r * 0.12, r * 0.25, 0, 7); x2.fill(); x2.fillStyle = '#e8820c'; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; x2.beginPath(); x2.arc(cx + sx * r * 0.4 + Math.cos(a) * r * 0.32, cy + r * 0.12 + Math.sin(a) * r * 0.32, r * 0.07, 0, 7); x2.fill(); } }
    x2.fillStyle = '#c2326e'; x2.beginPath(); x2.moveTo(cx, cy + r * 0.4); x2.lineTo(cx - r * 0.1, cy + r * 0.62); x2.lineTo(cx + r * 0.1, cy + r * 0.62); x2.fill();
    x2.strokeStyle = '#1b1530'; x2.lineWidth = 2; for (let k = -3; k <= 3; k++) { x2.beginPath(); x2.moveTo(cx + k * r * 0.13, cy + r * 0.78); x2.lineTo(cx + k * r * 0.13, cy + r * 1.0); x2.stroke(); }
    x2.fillStyle = '#e8820c'; for (let k = 0; k < 9; k++) { x2.beginPath(); x2.arc(w * (k + 0.5) / 9, h * 0.94, h * 0.05, 0, 7); x2.fill(); }
  };
  Mx.flagRegions = (A) => [A.region('mxFlagMX', 120, 72, Mx.paintFlagMX), A.region('mxFlagNL', 96, 64, Mx.paintFlagNL), A.region('mxFlagGB', 96, 64, Mx.paintFlagGB), A.region('mxFlagIT', 96, 64, Mx.paintFlagIT), A.region('mxFlagOr', 96, 64, Mx.paintFlagOrange), A.region('mxFlagChe', 96, 64, Mx.paintFlagCheco)];
  // a dark band with light lettering and the tricolour pin stripe along its foot (fascias, the stadium name)
  Mx.paintBand = (x2, w, h, text, o) => {
    o = o || {}; x2.fillStyle = o.bg || '#2a2d33'; x2.fillRect(0, 0, w, h);
    const sh = h * 0.12; x2.fillStyle = '#006847'; x2.fillRect(0, h - sh, w / 3 + 1, sh); x2.fillStyle = '#e3e3e0'; x2.fillRect(w / 3, h - sh, w / 3 + 1, sh); x2.fillStyle = '#ce1126'; x2.fillRect(2 * w / 3, h - sh, w / 3 + 1, sh);
    Mz.paintText(x2, w, h - sh, text, { bg: 'rgba(0,0,0,0)', fg: o.fg || '#dfe1e2', size: o.size || 0.62, font: o.font || '700 ' });
  };

  // ================================================================ hooks into the shared passes (Mexico only)
  const V = EI.EnvVenue;
  if (V) {
    // venue layout: the generic stand runs (ENVDATA.mexico.standRuns) and the OSM grandstand boxes are replaced by js/env_mexico_stands.js
    const oLayout = V.layout;
    V.layout = function (E) {
      if (!isMexico(E.t)) return oLayout.call(this, E);
      const S = E.t.data.scenery; E._mxGs = S.grandstands; S.grandstands = []; const runs = E.data.standRuns; E.mxStandRuns = runs; E.data.standRuns = [];
      E.mxOwnPolys = [];
      try { return oLayout.call(this, E); } finally { E.data.standRuns = runs; }
    };
    const oLS = V.layoutStands;
    V.layoutStands = function (E) {
      const r = oLS.call(this, E);
      if (isMexico(E.t)) { E.mxOwnPolys = E.mxOwnPolys || []; for (const [k, fn] of [['pit', () => Mx.layoutPit(E)], ['stands', () => Mx.Stands && Mx.Stands.layout(E)], ['infra', () => Mx.Infra && Mx.Infra.layout && Mx.Infra.layout(E)]]) { try { fn(); } catch (e) { console.error('EnvMexico layout ' + k, e); } } }
      return r;
    };
    const oBuild = V.build;
    V.build = function (E) {
      // the drawn ground is final now (terrain + verge built): re-fit every Mexico floor / base before the venue builds the stands and crowd
      if (isMexico(E.t)) { try { E._mxPF = undefined; Mx.refit(E); if (Mx.Stands && Mx.Stands.refit) Mx.Stands.refit(E); if (Mx.Infra && Mx.Infra.refit) Mx.Infra.refit(E); } catch (e) { console.error('EnvMexico refit', e); } }
      const r = oBuild.call(this, E);
      if (isMexico(E.t)) { try { Mx.build(E); } catch (e) { console.error('EnvMexico build', e); } finally { if (E._mxGs) E.t.data.scenery.grandstands = E._mxGs; } }
      return r;
    };
    // the crowd: a Mexico race-day crowd (Verstappen orange, the national-team green and the tricolour, Ferrari red, papaya, Cadillac black
    // for Perez, straw hats); the stadium tiers / bank fans built here join the same instanced crowd (one draw call), and their painted
    // far strips join the venue's crowd carpet (one more call, already there)
    const oCrowd = V.crowd;
    V.crowd = function (E, set, carpet) {
      if (isMexico(E.t) && set && set.data) { try { set = Mx.crowd(E, set, carpet); } catch (e) { console.error('EnvMexico crowd', e); } }
      return oCrowd.call(this, E, set, carpet);
    };
  }
  Mx.SHIRTS = (() => {
    const L = (h) => C(h);
    return { orange: [L(0xff6a00), L(0xf47a1f), L(0xff8c1a)], mx: [L(0x006847), L(0x0b7a4f), L(0xe9e9e6), L(0xce1126)], red: L(0xc8102e), papaya: L(0xff8000), teal: L(0x00a19c), navy: L(0x1b2a4a), cad: [L(0x16181d), L(0xe2e3e4)], white: L(0xe6e6e3), straw: [L(0xc9a86a), L(0xb58f52), L(0xd8bf86)], pink: L(0xc2326e), marigold: L(0xe8820c) };
  })();
  Mx.crowd = function (E, set, carpet) {
    const rng = U.rng(1968); const N = set.n; const Sx = Mx.SHIRTS;
    const tint = (Sh, Ac, Dp, i) => {
      const r = rng(); let c = null;
      if (r < 0.24) c = Sx.orange[Math.floor(rng() * 3)]; else if (r < 0.37) c = Sx.mx[Math.floor(rng() * 4)]; else if (r < 0.48) c = Sx.red; else if (r < 0.55) c = Sx.papaya; else if (r < 0.6) c = Sx.cad[Math.floor(rng() * 2)];
      else if (r < 0.63) c = Sx.teal; else if (r < 0.66) c = Sx.navy; else if (r < 0.72) c = Sx.white;
      if (c) { Sh[i * 4] = c.r; Sh[i * 4 + 1] = c.g; Sh[i * 4 + 2] = c.b; }
      const pose = Dp[i * 4]; const q = rng(); let a = null;
      if (pose === 14 || pose === 6) a = q < 0.45 ? Sx.mx[0] : q < 0.6 ? Sx.mx[3] : q < 0.78 ? Sx.orange[0] : q < 0.88 ? Sx.red : Sx.cad[0];   // flags / scarves: the tricolour first
      else if (q < 0.14) a = Sx.straw[Math.floor(rng() * 3)]; else if (q < 0.3) a = Sx.orange[1]; else if (q < 0.36) a = Sx.mx[0];
      if (a) { Ac[i * 4] = a.r; Ac[i * 4 + 1] = a.g; Ac[i * 4 + 2] = a.b; }
    };
    for (let i = 0; i < N; i++) tint(set.data[2], set.data[3], set.data[1], i);
    // the far painted strips of the stadium tiers / stands built here
    const cp = E.mxCarpet; if (cp && carpet && cp.p.length) { for (let k = 0; k < cp.p.length; k++) carpet.p.push(cp.p[k]); for (let k = 0; k < cp.n.length; k++) carpet.n.push(cp.n[k]); for (let k = 0; k < cp.c.length; k++) carpet.c.push(cp.c[k]); for (let k = 0; k < cp.uv.length; k++) carpet.uv.push(cp.uv[k]); E.stats.mexicoCarpetTris = cp.p.length / 9; }
    const extra = (E.mxSeatRecs || []).concat(E.mxBankRecs || []); if (!extra.length) return set;
    const ns = new Env.CellSet(set.strides, set.cell); const st = set.strides;
    for (let i = 0; i < N; i++) { const recs = st.map((w, k) => Array.from(set.data[k].subarray(i * w, i * w + w))); ns.push(recs[0][0], recs[0][2], recs); }
    for (const r of extra) ns.push(r[0][0], r[0][2], r);
    ns.finalize();
    const S2 = ns.data[2], A2 = ns.data[3], D2 = ns.data[1];
    // tint only the added records (flagged by the shade sentinel 0.999 + their own shade in the accessory alpha)
    for (let i = 0; i < ns.n; i++) if (Math.abs(S2[i * 4 + 3] - 0.999) < 1e-4) { const sh = A2[i * 4 + 3] || 1; S2[i * 4 + 3] = sh * (0.84 + rng() * 0.2); A2[i * 4 + 3] = 0; tint(S2, A2, D2, i); }
    E.stats.mexicoExtraPeople = extra.length;
    return ns;
  };
  // a carpet strip (the venue's painted far crowd) along a tier row from a to b (world points on the tread), shade sh
  Mx.carpetRow = function (E, a, b, nrm, sh, rng) {
    const cp = E.mxCarpet || (E.mxCarpet = { p: [], n: [], c: [], uv: [] }); const len = Math.hypot(b[0] - a[0], b[2] - a[2]); if (len < 1.2) return;
    const u0 = rng() * 64, u1 = u0 + len / 35.2;
    const q = [[a[0], a[1], a[2], u0, 0], [b[0], b[1], b[2], u1, 0], [b[0], b[1] + 2.2, b[2], u1, 1], [a[0], a[1] + 2.2, a[2], u0, 1]];
    for (const k of [0, 1, 2, 0, 2, 3]) { cp.p.push(q[k][0], q[k][1], q[k][2]); cp.uv.push(q[k][3], q[k][4]); cp.n.push(nrm[0], nrm[1], nrm[2]); cp.c.push(sh, sh, sh); }
  };
  if (EI.Scenery) {
    // the generic OSM boxes skip the footprints modelled here (the pit building 'Paddock', the stadiums, the dome) and anything inside a
    // reserved Mexico polygon
    const oBB = EI.Scenery.prototype.buildBuildings;
    EI.Scenery.prototype.buildBuildings = function () {
      if (!isMexico(this.track)) return oBB.call(this);
      const sc = this.track.data.scenery, all = sc.buildings, E = this.env; const own = ((E && E.mxOwnPolys) || []).slice();
      const lm = (E && E.data.landmarks) || {}; for (const k of ['foroSol', 'harpHelu', 'palacioDeportes', 'velodrome', 'pitBuilding']) if (lm[k] && lm[k].p) own.push(lm[k].p);
      sc.buildings = all.filter(b => { if (!b.p || b.p.length < 3) return true; if (b.n && /^Paddock$/.test(b.n)) return false; let x = 0, z = 0; for (const v of b.p) { x += v[0]; z += v[1]; } x /= b.p.length; z /= b.p.length; return !own.some(p => U.pointInPoly(x, z, p)); });
      try { return oBB.call(this); } finally { sc.buildings = all; }
    };
    const oSQ = EI.Scenery.prototype.setQuality;
    EI.Scenery.prototype.setQuality = function (q) { const r = oSQ.apply(this, arguments); if (isMexico(this.track) && this.group) { const g = this.group.getObjectByName('mexHigh'); if (g) g.visible = q === 'high'; } return r; };
  }
  // js/pit.js leaves the upper facade of the team garages to the venue file that owns the pit building (EnvMonza.ownsPitFacade): Mexico too
  { const oOwn = Mz.ownsPitFacade; Mz.ownsPitFacade = (t) => (oOwn ? oOwn(t) : false) || isMexico(t); }

  // ================================================================ the pit building frame (js/pit.js's lane, as js/env_cota.js)
  // js/pit.js lays its lane along the straight at latC = (widest pit-side wall over sf +-180 m) + 9.25 m, the garages 7.8 .. 17.8 m beyond
  // the lane centre, the 11 team boxes (18 m) centred on the straight; the lane level is the track's, eased towards the ground. The
  // building uses the same frame, curvilinear: P(x, y, z) = x metres along the lap from the line, y above the lane level there, z metres
  // beyond the centre line on the pit side.
  Mx.pitFrame = function (E) {
    if (E._mxPF !== undefined) return E._mxPF;
    const t = E.t, sc = E.sc; const pit = t.data.pit; if (!pit || pit.length < 4) return (E._mxPF = null);
    const pr = {}; let lat = 0; for (const p of pit) { t.project(p[0], p[1], null, pr); lat += pr.lat; } const side = lat < 0 ? -1 : 1;
    const wallOf = (i) => side < 0 ? t.wallL[i] : t.wallR[i];
    let maxWall = 0; for (let s = 0; s <= 360; s += 4) maxWall = Math.max(maxWall, wallOf(t.idxAtS(U.mod(t.sf - 180, t.length) + s)));
    const latC = maxWall + 2.9 + 0.35 + 6.0, zG = latC + 7.8, zGB = latC + 17.8;
    const q = {};
    const W = (x, z) => { Mx.at(t, t.sf + x, side, z, q); return [q.x, q.z]; };
    const X0 = -240, X1 = 240, yTab = new Float32Array(X1 - X0 + 1), raw = new Float32Array(X1 - X0 + 1);
    for (let k = 0; k < raw.length; k++) { Mx.at(t, t.sf + X0 + k, side, latC, q); const ty = q.y; const w = U.smoothstep(wallOf(q.i) + 5, wallOf(q.i) + 30, latC); const th = sc.height(q.x, q.z); raw[k] = ty + U.clamp(th - ty, -0.5, 3) * w; }
    for (let k = 0; k < raw.length; k++) { let a = 0, c = 0; for (let j = -8; j <= 8; j++) { a += raw[U.clamp(k + j, 0, raw.length - 1)]; c++; } yTab[k] = a / c; }
    const yA = (x) => { const f = U.clamp(x - X0, 0, raw.length - 1.001); const k = Math.floor(f); return U.lerp(yTab[k], yTab[k + 1], f - k); };
    const P = (x, y, z) => { Mx.at(t, t.sf + x, side, z, q); return [q.x, yA(x) + y, q.z]; };
    const G = (x, z) => { const w = W(x, z); return sc.height(w[0], w[1]) - yA(x); };
    // the building's reach along the straight: the OSM 'Paddock' (pitBuilding) landmark clipped to the lane's straight part (+-176 m)
    const L = t.length; let a0 = Infinity, a1 = -Infinity; const lm = E.data.landmarks && E.data.landmarks.pitBuilding;
    if (lm && lm.p) for (const p of lm.p) { t.project(p[0], p[1], null, pr); const x = U.mod(pr.s - t.sf + L / 2, L) - L / 2; a0 = Math.min(a0, x); a1 = Math.max(a1, x); }
    const NB = Math.max(10, (EI.TEAMS || []).length || 11), half = NB * 9;
    const x0 = Math.max(-176, Math.min(-half - 20, Number.isFinite(a0) ? a0 : -176)), x1 = Math.min(176, Math.max(half + 20, Number.isFinite(a1) ? a1 : 140));
    const rc1 = x1 - 3, rc0 = rc1 - 30;                                                      // race control: the T1 end
    const ZB = zGB + 12;                                                                    // the paddock-side wall
    const dv = side < 0 ? -1 : 1;
    return (E._mxPF = { side, dv, maxWall, latC, zG, zGB, ZB, x0, x1, half, rc0, rc1, yA, P, W, G, a0, a1 });
  };
  Mx.layoutPit = function (E) {
    const F = Mx.pitFrame(E); if (!F) return; const OCC = Env.OCC;
    const poly = []; for (let x = F.x0 - 3; x <= F.x1 + 3.01; x += 12) poly.push(F.W(x, F.zG - 2)); for (let x = F.x1 + 3; x >= F.x0 - 3.01; x -= 12) poly.push(F.W(x, F.ZB + 3));
    E.markPoly(poly, OCC.BUILT, 2); E.standPolys.push(poly); E.mxOwnPolys.push(poly); E.mxPitPoly = poly;
    // the OSM 'Paddock' footprint is replaced: free it from BUILT for the paddock units, keep trees off (KEEP)
    { const lm = E.data.landmarks && E.data.landmarks.pitBuilding; if (lm && lm.p && E.occ) { let ax0 = Infinity, ax1 = -Infinity, az0 = Infinity, az1 = -Infinity; for (const p of lm.p) { ax0 = Math.min(ax0, p[0]); ax1 = Math.max(ax1, p[0]); az0 = Math.min(az0, p[1]); az1 = Math.max(az1, p[1]); }
      for (let x = ax0; x <= ax1; x += 1) for (let z = az0; z <= az1; z += 1) { if (!U.pointInPoly(x, z, lm.p)) continue; const k = E.oi(x, z); if (k >= 0) E.occ[k] = (E.occ[k] & ~OCC.BUILT) | OCC.KEEP; }
      E.markPoly(poly, OCC.BUILT, 2); } }
    // the paddock behind the building: team hospitality units (two-storey boxes, dark glass bands) in two rows, a few white marquees
    const rng = U.rng(2015); E.mxUnits = [];
    const tryUnit = (x, z, L, D, kind) => {
      const c = F.W(x, z), c2 = F.W(x + 1, z); let ax = c2[0] - c[0], az = c2[1] - c[1]; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l;
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].map(([u, v]) => [c[0] + ax * u * (L / 2 + 2) - az * v * (D / 2 + 2), c[1] + az * u * (L / 2 + 2) + ax * v * (D / 2 + 2)]);
      if (E.rectFree(c[0], c[1], ax, az, L / 2 + 2, D / 2 + 2, OCC.WATER | OCC.ROAD) < 0.9 || corners.some(q => E.fsAt(q[0], q[1]) < 14 || E.mxOwnPolys.some(p => U.pointInPoly(q[0], q[1], p)) || Mx.nearPit(E, q[0], q[1]) < 10)) return false;
      let gmin = Infinity, gmax = -Infinity; for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) { const g = E.sc.height(c[0] + ax * u * L / 2 - az * v * D / 2, c[1] + az * u * L / 2 + ax * v * D / 2); gmin = Math.min(gmin, g); gmax = Math.max(gmax, g); }
      if (gmax - gmin > 2.5) return false;
      const tp = E.markRect(c[0], c[1], ax, az, L / 2 + 1.5, D / 2 + 1.5, OCC.BUILT); E.standPolys.push(tp); E.mxOwnPolys.push(tp);
      E.mxUnits.push({ cx: c[0], cz: c[1], ax, az, L, D, y: gmin, gmax, kind }); return true;
    };
    const xa = F.x0 + 14, xb = F.x1 - 14; let nU = 0;
    for (let x = xa; x < xb - 20 && nU < 11; x += 26 + rng() * 4) if (tryUnit(x + 10, F.ZB + 14 + 7, 20, 12, 'unit')) nU++;
    for (let x = xa + 6; x < xb - 24 && E.mxUnits.length < 17; x += 34 + rng() * 8) tryUnit(x + 12, F.ZB + 14 + 14 + 12 + 9, 24 + rng() * 6, 14, rng() < 0.55 ? 'marquee' : 'unit');
  };
  // distance from (x, z) to the OSM pit-lane polyline (entry / exit roads included): structures keep >= 10 m off it
  Mx.nearPit = function (E, x, z) { const P = E.t.data.pit; if (!P) return 1e9; let d = Infinity; for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1]; const dx = b[0] - a[0], dz = b[1] - a[1]; const l2 = dx * dx + dz * dz || 1; const u = U.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1); d = Math.min(d, Math.hypot(x - a[0] - dx * u, z - a[1] - dz * u)); } return d; };
  Mx.refit = function (E) {
    for (const T of E.mxUnits || []) { let gmin = Infinity, gmax = -Infinity; for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) { const g = E.sc.height(T.cx + T.ax * u * T.L / 2 - T.az * v * T.D / 2, T.cz + T.az * u * T.L / 2 + T.ax * v * T.D / 2); gmin = Math.min(gmin, g); gmax = Math.max(gmax, g); } T.y = gmin; T.gmax = gmax; }
  };

  // ================================================================ the sign atlas: EnvMonza's 2048 x 1024 canvas with a shelf packer (several shelves stay
  // open, each region goes to the lowest shelf it fits), so the tall regions (facade bays, screens) do not waste a whole row each
  class MxAtlas extends Mz.Atlas {
    constructor() { super(); this.shelves = []; this.yTop = 0; this.full = 0; }
    region(name, w, h, paint) {
      if (this.R[name]) return this.R[name];
      let best = null; for (const s of this.shelves) if (s.h >= h && s.x + w <= 2048 && (!best || s.h < best.h)) best = s;
      if (best && best.h > h * 2.5 && this.yTop + h <= 900) best = null;
      if (!best) { if (this.yTop + h > 1024) { this.full++; console.warn('EnvMexico atlas full', name); best = { y: 0, h, x: 0 }; } else { best = { y: this.yTop, h, x: 0 }; this.shelves.push(best); this.yTop += h + 2; } }
      const r = { x: best.x, y: best.y, w, h }; best.x += w + 2;
      this.cx.save(); this.cx.translate(r.x, r.y); this.cx.beginPath(); this.cx.rect(0, 0, w, h); this.cx.clip(); try { paint(this.cx, w, h); } catch (e) { console.error('EnvMexico atlas paint ' + name, e); } this.cx.restore();
      r.uv = (u, v) => [(r.x + 0.5 + u * (r.w - 1)) / 2048, 1 - (r.y + 0.5 + (1 - v) * (r.h - 1)) / 1024];
      return (this.R[name] = r);
    }
  }
  Mx.Atlas = MxAtlas;

  // ================================================================ build (after the venue)
  Mx.build = function (E) {
    const T0 = performance.now(); const out = E.stats.mexico = {}; const sc = E.sc, ST = sc.statics;
    const A = new MxAtlas();
    const BK = { B: new Env.Builder(), S: new Env.Builder(), G: new Env.Builder(), F: new Env.Builder(), H: new Env.Builder(), A };
    const tc = () => (BK.B.count + BK.S.count + BK.G.count + BK.F.count + BK.H.count) / 3 + A.geo.p.length / 9; out.tc = {};
    const step = (k, fn) => { const t0 = performance.now(), c0 = tc(); try { fn(); } catch (e) { console.error('EnvMexico ' + k, e); } out['ms_' + k] = Math.round(performance.now() - t0); out.tc[k] = Math.round(tc() - c0); };
    const PF = Mx.pitFrame(E);
    if (PF) { step('pit', () => buildPit(E, BK, PF, out)); step('paddock', () => buildUnits(E, BK)); }
    if (Mx.Stands) step('stands', () => Mx.Stands.build(E, BK, out));
    if (Mx.Infra) step('infra', () => Mx.Infra.build(E, BK, out));
    ST.add(BK.B.geometry(), 0.82, 0.03, 'main'); ST.add(BK.S.geometry(), 0.42, 0.55, 'main'); ST.add(BK.G.geometry(), 0.08, 0.55, 'main'); ST.add(BK.F.geometry(), 0.5, 0.35, 'clutter');
    out.tris = { main: BK.B.count / 3, steel: BK.S.count / 3, glass: BK.G.count / 3, fine: BK.F.count / 3, high: BK.H.count / 3 };
    if (BK.H.count) { const st = new Env.Statics(); st.add(BK.H.geometry(), 0.45, 0.4, 'clutter'); const g = new THREE.Group(); g.name = 'mexHigh'; st.build(g); g.children.forEach(c => { c.name = 'mexHi'; c.userData.clutter = true; }); g.visible = EI.quality === 'high'; sc.group.add(g); }
    const am = A.mesh('mexicoSigns'); if (am) { sc.group.add(am); out.signTris = am.geometry.attributes.position.count / 3; } out.atlasUsed = A.yTop; out.atlasFull = A.full; out.atlasShelves = A.shelves.map(s => s.h + ':' + s.x).join(' ');
    out.ms = Math.round(performance.now() - T0);
  };

  // ================================================================ the pit + paddock building
  // ground floor = garages (mid-grey roller shutters, number boards; the team boxes' own fronts are js/pit.js's); a charcoal fascia band
  // with the green-white-red pin stripe; the first-floor balcony slab with a glass railing and the glazed gallery behind it between grey
  // columns; a light-grey spandrel band; the Paddock Club level glazed full height, leaning out a little; the flat light-grey roof canopy
  // cantilevered ~7 m out over the working lane on a deep edge. The paddock side is light cladding from the drawn ground with window
  // bands. Whites are kept <= 0xdcdfe0 (they clip under the grade otherwise; the COTA / Spa lesson - the altitude sun is harder still).
  function buildPit(E, BK, F, out) {
    const { B, S, G, F: Fd, H, A } = BK; const P = F.P, zG = F.zG, ZB = F.ZB;
    const x0 = F.x0, x1 = F.x1, half = F.half;
    const lane = (x) => { const a = P(x, 0, zG), b = P(x, 0, zG - 1); return [b[0] - a[0], 0, b[2] - a[2]]; };
    const back = (x) => { const v = lane(x); return [-v[0], 0, -v[2]]; };
    const pan = [C(0xb6b9bb), C(0xa9adb0)], conc = C(0xb3b7ba), concD = C(0x9a9ea1), fasc = C(0x2a2d33), green = C(0x006847), red = C(0xce1126), white = C(0xcdd0d2), offW = C(0xc4c8ca);
    const glass = C(0x26323d), glassL = C(0x3a4d5e), mull = C(0xb3b8bc), steel = C(0x8f969c), roofT = C(0x8e9295), soffit = C(0xaeb3b7), plinth = C(0x5d6166);
    const yH0 = 4.8, yH1 = 6.0, yB0 = 6.45, yB1 = 6.8, yL2 = 9.9, yS1 = 10.7, yT = 14.0, yR = 14.4, yR1 = 15.0;
    const zBal = zG - 1.8, zGal = zG + 1.4, zL2 = zG - 0.3, lean = 0.7, zR0 = zG - 7.2;
    const inRC = (x) => x > F.rc0 - 0.01 && x < F.rc1 + 0.01;
    const shR = A.region('mxShutter', 64, 96, (x2, w, h) => { x2.fillStyle = '#6b7075'; x2.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 4) { x2.fillStyle = 'rgba(255,255,255,0.12)'; x2.fillRect(0, y, w, 1); x2.fillStyle = 'rgba(0,0,0,0.2)'; x2.fillRect(0, y + 2, w, 1); } x2.fillStyle = 'rgba(0,0,0,0.3)'; x2.fillRect(0, h - 6, w, 6); });
    const digR = A.region('mxDigits', 480, 64, (x2, w, h) => { x2.fillStyle = '#e4e5e6'; x2.fillRect(0, 0, w, h); x2.fillStyle = '#111111'; x2.font = '700 54px Arial, sans-serif'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; for (let k = 0; k < 10; k++) x2.fillText(String(k), k * 48 + 24, h * 0.54); });
    const nameR = A.region('mxPitName', 1024, 64, (x2, w, h) => Mx.paintBand(x2, w, h, 'AUTÓDROMO HERMANOS RODRÍGUEZ'));
    const bays = []; for (let x = x0; x < x1 - 0.01; x += 9) bays.push([x, Math.min(x1, x + 9)]);
    let shutters = 0, gno = 1;
    for (let bi = 0; bi < bays.length; bi++) {
      const [xa, xb] = bays[bi];
      const xc = (xa + xb) / 2, w = xb - xa, LN = lane(xc), BKW = back(xc), team = xc > -half && xc < half, rc = inRC(xc);
      if (!team) {
        for (let x = xa; x <= xb + 0.01; x += 4.5) Mx.hex(B, [P(x - 0.3, -0.3, zG), P(x + 0.3, -0.3, zG), P(x + 0.3, -0.3, zG + 0.7), P(x - 0.3, -0.3, zG + 0.7), P(x - 0.3, yH0, zG), P(x + 0.3, yH0, zG), P(x + 0.3, yH0, zG + 0.7), P(x - 0.3, yH0, zG + 0.7)], conc, null, true);
        for (let x = xa; x < xb - 1; x += 4.5) {
          const sa = x + 0.3, sb = Math.min(xb, x + 4.5) - 0.3; if (sb - sa < 1) continue;
          if (rc) { Mx.face(B, P(sa, 0, zG + 0.45), P(sb, 0, zG + 0.45), P(sb, 0.9, zG + 0.45), P(sa, 0.9, zG + 0.45), concD, LN); Mx.face(G, P(sa, 0.9, zG + 0.45), P(sb, 0.9, zG + 0.45), P(sb, yH0, zG + 0.45), P(sa, yH0, zG + 0.45), glassL, LN); continue; }
          Mx.faceA(A, shR, P(sa, 0.02, zG + 0.4), P(sb, 0.02, zG + 0.4), P(sb, 4.5, zG + 0.4), P(sa, 4.5, zG + 0.4), LN); shutters++;
          const n = String(gno++ % 100).padStart(2, '0'); const xm = (sa + sb) / 2, dw = 0.36, yb = yH0 - 0.95, dh = 0.6, zd = zG + 0.37;
          Mx.face(Fd, P(xm - 0.85, yb - 0.05, zd + 0.01), P(xm + 0.85, yb - 0.05, zd + 0.01), P(xm + 0.85, yb + dh + 0.05, zd + 0.01), P(xm - 0.85, yb + dh + 0.05, zd + 0.01), offW, LN);
          for (let j = 0; j < 2; j++) { const d = +n[j]; const u0 = d / 10 + 0.004, u1 = (d + 1) / 10 - 0.004; const lft = xm - F.dv * dw + j * F.dv * dw, rgt = lft + F.dv * dw; Mx.faceA(A, digR, P(lft, yb, zd - 0.01), P(rgt, yb, zd - 0.01), P(rgt, yb + dh, zd - 0.01), P(lft, yb + dh, zd - 0.01), LN, u0, u1, 0, 1); }
        }
      }
      // ---- header: charcoal fascia with the tricolour pin stripe (the team signs of pit.js stand just in front of it over the team boxes)
      Mx.hex(B, [P(xa, yH0, zG), P(xb, yH0, zG), P(xb, yH0, zG + 1.0), P(xa, yH0, zG + 1.0), P(xa, yH1, zG), P(xb, yH1, zG), P(xb, yH1, zG + 1.0), P(xa, yH1, zG + 1.0)], fasc, null, false);
      { const k3 = Math.floor((bi % 3)); Mx.face(B, P(xa, yH0 - 0.02, zG - 0.02), P(xb, yH0 - 0.02, zG - 0.02), P(xb, yH0 + 0.14, zG - 0.02), P(xa, yH0 + 0.14, zG - 0.02), k3 === 0 ? green : k3 === 1 ? offW : red, LN); }
      Mx.face(B, P(xa, yH1, zG + 0.6), P(xb, yH1, zG + 0.6), P(xb, yB0, zG + 0.6), P(xa, yB0, zG + 0.6), concD, LN);
      // ---- first floor: balcony slab, glass railing, the gallery glazing between grey columns
      Mx.hex(B, [P(xa, yB0, zBal), P(xb, yB0, zBal), P(xb, yB0, zGal + 0.3), P(xa, yB0, zGal + 0.3), P(xa, yB1, zBal), P(xb, yB1, zBal), P(xb, yB1, zGal + 0.3), P(xa, yB1, zGal + 0.3)], offW, C(0x9ea3a7), false);
      Mx.face(G, P(xa, yB1, zBal + 0.08), P(xb, yB1, zBal + 0.08), P(xb, yB1 + 1.05, zBal + 0.08), P(xa, yB1 + 1.05, zBal + 0.08), C(0x8aa7b2), LN);
      Fd.beam(Mx.I4(), P(xa, yB1 + 1.08, zBal + 0.08), P(xb, yB1 + 1.08, zBal + 0.08), 0.07, steel);
      const nc = Math.max(1, Math.round(w / 1.5));
      for (let c = 0; c < nc; c++) { const ca = xa + c * w / nc, cb = ca + w / nc; Mx.face(G, P(ca, yB1, zGal), P(cb, yB1, zGal), P(cb, yL2, zGal), P(ca, yL2, zGal), (c % 3 ? glass : glassL), LN); if (c) Mx.face(Fd, P(ca - 0.04, yB1, zGal - 0.03), P(ca + 0.04, yB1, zGal - 0.03), P(ca + 0.04, yL2, zGal - 0.03), P(ca - 0.04, yL2, zGal - 0.03), mull, LN); }
      Mx.hex(S, [P(xa - 0.22, yB1, zBal + 0.5), P(xa + 0.22, yB1, zBal + 0.5), P(xa + 0.22, yB1, zBal + 0.94), P(xa - 0.22, yB1, zBal + 0.94), P(xa - 0.22, yL2, zBal + 0.5), P(xa + 0.22, yL2, zBal + 0.5), P(xa + 0.22, yL2, zBal + 0.94), P(xa - 0.22, yL2, zBal + 0.94)], C(0x80868c), null, true);
      Mx.face(B, P(xa, yL2, zBal), P(xb, yL2, zBal), P(xb, yL2, zGal), P(xa, yL2, zGal), concD, [0, -1, 0]);
      // ---- spandrel: light-grey band with a dark shadow line, then the Paddock Club level glazed full height (leaning out)
      Mx.face(B, P(xa, yL2, zBal), P(xb, yL2, zBal), P(xb, yS1, zBal), P(xa, yS1, zBal), pan[bi % 2], LN);
      Mx.face(Fd, P(xa, yL2 + 0.05, zBal - 0.02), P(xb, yL2 + 0.05, zBal - 0.02), P(xb, yL2 + 0.16, zBal - 0.02), P(xa, yL2 + 0.16, zBal - 0.02), C(0x3a3f45), LN);
      Mx.face(B, P(xa, yS1, zBal), P(xb, yS1, zBal), P(xb, yS1, zL2), P(xa, yS1, zL2), concD, [0, 1, 0]);
      for (let c = 0; c < nc; c++) { const ca = xa + c * w / nc, cb = ca + w / nc; Mx.face(G, P(ca, yS1, zL2), P(cb, yS1, zL2), P(cb, yT, zL2 - lean), P(ca, yT, zL2 - lean), c % 2 ? glassL : glass, LN); }
      for (let x = xa; x < xb - 0.1; x += 3) Mx.face(Fd, P(x - 0.06, yS1, zL2 - 0.04), P(x + 0.06, yS1, zL2 - 0.04), P(x + 0.06, yT, zL2 - lean - 0.04), P(x - 0.06, yT, zL2 - lean - 0.04), mull, LN);
      // ---- the roof canopy: flat light top, grey soffit, a deep front edge; the roof deck behind
      Mx.hex(B, [P(xa, yR, zR0), P(xb, yR, zR0), P(xb, yR, ZB + 0.4), P(xa, yR, ZB + 0.4), P(xa, yR1, zR0), P(xb, yR1, zR0), P(xb, yR1, ZB + 0.4), P(xa, yR1, ZB + 0.4)], soffit, roofT, false);
      Mx.face(B, P(xa, yR - 0.55, zR0 - 0.02), P(xb, yR - 0.55, zR0 - 0.02), P(xb, yR1, zR0 - 0.02), P(xa, yR1, zR0 - 0.02), white, LN);
      Mx.face(B, P(xa, yR - 0.55, zR0), P(xb, yR - 0.55, zR0), P(xb, yR, zL2 - lean), P(xa, yR, zL2 - lean), soffit, [0, -1, 0]);
      Mx.face(B, P(xa, yT, zL2 - lean), P(xb, yT, zL2 - lean), P(xb, yR, zL2 - lean), P(xa, yR, zL2 - lean), concD, LN);
      if (bi % 2 === 0) { H.beam(Mx.I4(), P(xa + 0.3, yT, zL2 - lean - 0.1), P(xa + 0.3, yR - 0.4, zR0 + 0.6), 0.08, steel); }
      Fd.beam(Mx.I4(), P(xa, yR1 + 1.0, zG + 2.0), P(xb, yR1 + 1.0, zG + 2.0), 0.05, steel);
      if (bi % 2 === 0) Fd.beam(Mx.I4(), P(xa + 0.2, yR1, zG + 2.0), P(xa + 0.2, yR1 + 1.0, zG + 2.0), 0.05, steel);
      // ---- the paddock side: light cladding from the drawn ground, window bands, a dark plinth
      const g0 = Math.min(F.G(xa, ZB), F.G(xb, ZB), 0) - 0.5;
      Mx.face(B, P(xa, g0, ZB), P(xb, g0, ZB), P(xb, Math.min(0.4, g0 + 2), ZB), P(xa, Math.min(0.4, g0 + 2), ZB), plinth, BKW);
      Mx.face(B, P(xa, Math.min(0.4, g0 + 2), ZB), P(xb, Math.min(0.4, g0 + 2), ZB), P(xb, yR, ZB), P(xa, yR, ZB), pan[bi % 2], BKW);
      for (const [ya, yb] of [[2.0, 4.2], [7.2, 9.2], [11.0, 13.4]]) Mx.face(G, P(xa + 0.6, ya, ZB + 0.03), P(xb - 0.6, ya, ZB + 0.03), P(xb - 0.6, yb, ZB + 0.03), P(xa + 0.6, yb, ZB + 0.03), glass, BKW);
      out.pitBays = (out.pitBays || 0) + 1;
    }
    // ---- High only: roof plant on the deck behind the canopy edge, a terrace rail along the club's roof edge
    { const H0 = Mx.I4(); for (let x = x0 + 12; x < x1 - 10; x += 23) { const p = P(x, yR1, ZB - 6); H.box(Env.frame(p[0], p[1], p[2], ...Mx.dir(P(x, 0, ZB - 6), P(x + 1, 0, ZB - 6)).filter((_, k) => k !== 1), ...Mx.dir(P(x, 0, ZB - 6), P(x, 0, ZB - 5)).filter((_, k) => k !== 1)), 6, 1.8, 3.2, 0, 0, 0, C(0x9ea3a7), { top: C(0x7d838a) }); }
      for (let x = x0; x < x1 - 0.1; x += 3) H.beam(H0, P(x, yR1, zG + 2.0), P(x, yR1 + 1.0, zG + 2.0), 0.05, steel); }
    // ---- end walls (cladding, down to the drawn ground), the roof canopy's end fascias
    for (const [xe, sg] of [[x0, -1], [x1, 1]]) {
      const want = Mx.dir(P(xe, 0, zG), P(xe + sg, 0, zG));
      const gE = Math.min(F.G(xe, zG), F.G(xe, ZB), 0) - 0.5;
      Mx.face(B, P(xe, gE, zBal), P(xe, gE, ZB), P(xe, yR, ZB), P(xe, yR, zBal), pan[0], want);
      Mx.face(B, P(xe, yR - 0.55, zR0), P(xe, yR - 0.55, ZB + 0.4), P(xe, yR1, ZB + 0.4), P(xe, yR1, zR0), white, want);
    }
    // ---- race-control block: one storey taller, glazed and leaning like the club level, a light cap, the antenna mast
    { const xa = F.rc0, xb = F.rc1, y0 = yR1, y1 = yR1 + 4.0, y2 = y1 + 0.6, za = zL2 + 1.5, zb = ZB - 5; const LN = lane((xa + xb) / 2);
      const nc = Math.round((xb - xa) / 1.6);
      for (let c = 0; c < nc; c++) { const ca = xa + c * (xb - xa) / nc, cb = ca + (xb - xa) / nc; Mx.face(G, P(ca, y0, za), P(cb, y0, za), P(cb, y1, za - 0.6), P(ca, y1, za - 0.6), c % 2 ? glassL : glass, LN); }
      for (let x = xa; x <= xb + 0.01; x += (xb - xa) / 8) Mx.face(Fd, P(x - 0.06, y0, za - 0.04), P(x + 0.06, y0, za - 0.04), P(x + 0.06, y1, za - 0.64), P(x - 0.06, y1, za - 0.64), mull, LN);
      for (const [xe, sg] of [[xa, -1], [xb, 1]]) { const want = Mx.dir(P(xe, 0, za), P(xe + sg, 0, za)); Mx.face(B, P(xe, y0, za), P(xe, y0, zb), P(xe, y1, zb), P(xe, y1, za - 0.6), pan[1], want); }
      Mx.face(B, P(xa, y0, zb), P(xb, y0, zb), P(xb, y1, zb), P(xa, y1, zb), pan[0], back((xa + xb) / 2));
      Mx.hex(B, [P(xa - 0.4, y1, za - 1.8), P(xb + 0.4, y1, za - 1.8), P(xb + 0.4, y1, zb + 0.4), P(xa - 0.4, y1, zb + 0.4), P(xa - 0.4, y2, za - 1.8), P(xb + 0.4, y2, za - 1.8), P(xb + 0.4, y2, zb + 0.4), P(xa - 0.4, y2, zb + 0.4)], soffit, roofT, false);
      Mx.face(B, P(xa - 0.4, y1 - 0.3, za - 1.82), P(xb + 0.4, y1 - 0.3, za - 1.82), P(xb + 0.4, y2, za - 1.82), P(xa - 0.4, y2, za - 1.82), fasc, LN);
      const xm = (xa + xb) / 2 + 5;
      { const p0 = P(xm, y2, (za + zb) / 2), p1 = P(xm, y2 + 10, (za + zb) / 2); S.beam(Mx.I4(), p0, p1, 0.16, C(0xc9cdd1)); for (let k = 0; k < 3; k++) Fd.box(Env.frame(p1[0], p1[1] - 2 - k * 1.6, p1[2], 1, 0, 0, 1), 0.8, 0.5, 0.12, 0, 0, 0, C(0xcfd3d6)); } }
    // ---- the circuit's name on the spandrel over the closed garages of the longer non-team stretch
    { const lenL = -half - x0, lenR = x1 - half; let xn0, xn1; if (lenL >= lenR) { xn0 = x0 + 6; xn1 = Math.min(-half - 4, xn0 + 60); } else { xn1 = Math.min(x1 - 6, F.rc0 - 2); xn0 = Math.max(half + 4, xn1 - 60); }
      if (xn1 - xn0 > 20) { const LN = lane((xn0 + xn1) / 2); const zz = zBal - 0.05; const lft = F.dv > 0 ? xn0 : xn1, rgt = F.dv > 0 ? xn1 : xn0; Mx.faceA(A, nameR, P(lft, yL2 + 0.1, zz), P(rgt, yL2 + 0.1, zz), P(rgt, yS1 - 0.08, zz), P(lft, yS1 - 0.08, zz), LN); } }
    // ---- a flag mast at each end of the roof (Mexico)
    { const fl = Mx.flagRegions(A); for (const xe of [x0 + 4, x1 - 4]) { const p0 = P(xe, yR1, ZB - 2), p1 = P(xe, yR1 + 9, ZB - 2); S.beam(Mx.I4(), p0, p1, 0.14, C(0xc9cdd1)); if (Mz.Stands && Mz.Stands.flag) { const LN = lane(xe); Mz.Stands.flag(A, fl[0], P(xe, yR1 + 8.9, ZB - 2), Math.atan2(LN[0], LN[2]) + Math.PI / 2, 3.0, 1.8); } } }
    out.pit = { x0: Math.round(x0), x1: Math.round(x1), latC: +F.latC.toFixed(1), zG: +zG.toFixed(1), shutters, osm: [Math.round(F.a0), Math.round(F.a1)] };
  }
  // ---- the paddock: team hospitality units (two-storey boxes with dark glass bands, a roof terrace rail) and white marquees
  function buildUnits(E, BK) {
    const { B, G, F: Fd } = BK; const white = C(0xd6d9da), whiteS = C(0xcdd0d2), frame = C(0xb3b8bc), glass = C(0x2a3642), grey = C(0x8a9095); let n = 0;
    for (const T of E.mxUnits || []) {
      const m = Env.frame(T.cx, T.y, T.cz, T.ax, T.az, -T.az, T.ax); const hl = T.L / 2, hd = T.D / 2; const P = (x, y, z) => Env.xf(m, x, y, z); const lift = T.gmax - T.y;
      if (T.kind === 'unit') {
        const h1 = 3.4 + lift, h2 = h1 + 3.2;
        B.box(m, T.L, h2 + 0.3, T.D, 0, -0.3, 0, whiteS, { top: grey });
        for (const sz of [-1, 1]) { const want = Mx.dir(P(0, 0, 0), P(0, 0, sz)); for (const [ya, yb] of [[lift + 0.9, h1 - 0.4], [h1 + 0.5, h2 - 0.5]]) Mx.face(G, P(-hl + 1, ya, sz * (hd + 0.03)), P(hl - 1, ya, sz * (hd + 0.03)), P(hl - 1, yb, sz * (hd + 0.03)), P(-hl + 1, yb, sz * (hd + 0.03)), glass, want); }
        Fd.box(m, T.L, 0.12, T.D, 0, h1 - 0.1, 0, frame); for (const sz of [-1, 1]) { Fd.beam(m, [-hl, h2 + 1.0, sz * hd], [hl, h2 + 1.0, sz * hd], 0.06, frame); for (let x = -hl; x <= hl + 0.01; x += T.L / 4) Fd.beam(m, [x, h2 - 0.05, sz * hd], [x, h2 + 1.03, sz * hd], 0.05, frame); }
      } else {
        const wh = 3.2 + lift, rh = wh + T.D * 0.28;
        B.box(m, T.L, wh + 0.3, T.D, 0, -0.3, 0, whiteS);
        for (const sz of [-1, 1]) Mx.face(B, P(-hl - 0.2, wh - 0.3, sz * (hd + 0.3)), P(hl + 0.2, wh - 0.3, sz * (hd + 0.3)), P(hl + 0.2, rh - 0.3, 0), P(-hl - 0.2, rh - 0.3, 0), white, [0, 1, 0]);
        for (const sx of [-1, 1]) Mx.face(B, P(sx * hl, wh - 0.3, -hd), P(sx * hl, wh - 0.3, hd), P(sx * hl, rh - 0.3, 0), P(sx * hl, rh - 0.3, 0), white, Mx.dir(P(0, 0, 0), P(sx, 0, 0)));
        for (let x = -hl; x <= hl + 0.01; x += 5) Fd.box(m, 0.12, 0.12, T.D + 0.1, x, wh - 0.45, 0, frame);
      }
      n++;
    }
    E.stats.mexico.units = n;
  }

  EI.EnvMexico = Mx;
})();
