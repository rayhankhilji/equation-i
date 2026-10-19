// Equation I - Monza (Autodromo Nazionale Monza): the venue's own architecture after the reference photos. This file is the entry point:
// the frame fit (OpenStreetMap features of js/env_monza_osm.js -> the track data's frame), the hooks into the shared venue / scenery
// passes, the shared geometry kit, and the pit building with the podium over the track, the race-control tower and the paddock.
// The stands are in js/env_monza_stands.js, the old banking, the bridges over the track and the tifosi flags in js/env_monza_park.js.
// Everything static is vertex-coloured and goes into the scenery's merged, chunked statics (no extra materials); the few textured
// pieces (signs, podium screen, flags) share one canvas atlas (one mesh) and one instanced flag mesh.
window.EI = window.EI || {};
(function () {
  const U = EI.U, Env = EI.Env;
  const C = (h) => new THREE.Color(h).convertSRGBToLinear();
  const Mz = {};
  const isMonza = (t) => !!(t && t.data && t.data.id === 'monza');
  Mz.isMonza = isMonza;

  // ================================================================ frame fit: research frame (start-lights node origin, +x east,
  // +z south) -> the track data's frame. Uses the data's own projection origin when it has one (data.geo), then refines the
  // translation by fitting the OSM lap onto the track centreline (a few least-squares passes along the normals).
  Mz.fit = function (t) {
    if (t._mzFit) return t._mzFit;
    const O = EI.MONZA_OSM; const R = 6371000; let dx = 0, dz = 0;
    const g = t.data.geo;
    if (g && g.lat0 != null && g.lon0 != null) {
      const kx = g.mPerDegLon || Math.PI / 180 * R * Math.cos(g.lat0 * Math.PI / 180), kz = g.mPerDegLat || Math.PI / 180 * R;
      dx = (O.lon0 - g.lon0) * kx; dz = -(O.lat0 - g.lat0) * kz;
    } else {
      // centroids: the OSM lap (length weighted) vs the track samples (uniform in s)
      const L = O.lap; let sx = 0, sz = 0, sl = 0;
      for (let k = 0; k < L.length; k++) { const a = L[k], b = L[(k + 1) % L.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); sx += (a[0] + b[0]) / 2 * l; sz += (a[1] + b[1]) / 2 * l; sl += l; }
      let tx = 0, tz = 0; for (let i = 0; i < t.n; i++) { tx += t.x[i]; tz += t.z[i]; }
      dx = tx / t.n - sx / sl; dz = tz / t.n - sz / sl;
    }
    // refinement: resample the OSM lap every 8 m, project onto the centreline, shift by the mean residual
    const pts = []; const L = O.lap;
    for (let k = 0; k < L.length; k++) { const a = L[k], b = L[(k + 1) % L.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.ceil(l / 8)); for (let j = 0; j < n; j++) pts.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]); }
    const pr = {}; let res = 0;
    for (let it = 0; it < 6; it++) {
      let rx = 0, rz = 0, c = 0; res = 0;
      for (const p of pts) { t.project(p[0] + dx, p[1] + dz, null, pr); if (pr.dist > 30) continue; rx -= t.nx[pr.i] * pr.lat; rz -= t.nz[pr.i] * pr.lat; res += Math.abs(pr.lat); c++; }
      if (!c) break; dx += rx / c; dz += rz / c; res /= c; if (Math.hypot(rx / c, rz / c) < 0.05) break;
    }
    // research lap s -> game s: the research lap's cumulative length (rescaled to its true 5794.3 m) at each point, mapped through the track
    const cum = [0]; for (let k = 1; k < L.length; k++) cum.push(cum[k - 1] + Math.hypot(L[k][0] - L[k - 1][0], L[k][1] - L[k - 1][1]));
    const Ltot = cum[cum.length - 1] + Math.hypot(L[0][0] - L[L.length - 1][0], L[0][1] - L[L.length - 1][1]);
    const f = t._mzFit = {
      dx, dz, res,
      W: (p) => [p[0] + dx, p[1] + dz],
      poly: (P) => P.map(p => [p[0] + dx, p[1] + dz]),
      // research lap distance -> game lap distance
      s: (sr) => { const a = U.mod(sr, 5794.3) / 5794.3 * Ltot; let k = 0; while (k < cum.length - 1 && cum[k + 1] < a) k++; const A = L[k], B = L[(k + 1) % L.length]; const l = (k + 1 < cum.length ? cum[k + 1] : Ltot) - cum[k]; const u = l > 0 ? (a - cum[k]) / l : 0; t.project(A[0] + (B[0] - A[0]) * u + dx, A[1] + (B[1] - A[1]) * u + dz, null, pr); return pr.s; },
    };
    return f;
  };

  // ================================================================ geometry kit (shared by the Monza files)
  const K = Mz.K = {
    C,
    // both windings (thin panels seen from both sides, or frames whose x may be mirrored)
    dq(B, a, b, c, d, col) { B.quad(a, b, c, d, col); B.quad(d, c, b, a, col); },
    // vertical cylinder (open bottom) in frame m
    cyl(B, m, x, z, y0, h, r, seg, col, capCol) {
      const P = (xx, yy, zz) => Env.xf(m, xx, yy, zz);
      for (let k = 0; k < seg; k++) {
        const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2;
        const p0 = [x + Math.cos(a0) * r, z + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, z + Math.sin(a1) * r];
        K.dq(B, P(p0[0], y0, p0[1]), P(p1[0], y0, p1[1]), P(p1[0], y0 + h, p1[1]), P(p0[0], y0 + h, p0[1]), col);
        if (capCol) K.dq(B, P(x, y0 + h, z), P(p0[0], y0 + h, p0[1]), P(p1[0], y0 + h, p1[1]), P(x, y0 + h, z), capCol);
      }
    },
    // flat ring / disc (y = const) in frame m, both faces
    disc(B, m, x, z, y, r0, r1, seg, col) {
      const P = (xx, zz) => Env.xf(m, xx, y, zz);
      for (let k = 0; k < seg; k++) { const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2;
        K.dq(B, P(x + Math.cos(a0) * r0, z + Math.sin(a0) * r0), P(x + Math.cos(a0) * r1, z + Math.sin(a0) * r1), P(x + Math.cos(a1) * r1, z + Math.sin(a1) * r1), P(x + Math.cos(a1) * r0, z + Math.sin(a1) * r0), col); }
    },
    // a lattice mast (square, tapering) from y0 to y1 in frame m
    lattice(B, m, x, z, y0, y1, w0, w1, col, th) {
      const lv = (y) => { const f = (y - y0) / (y1 - y0); const w = (w0 + (w1 - w0) * f) / 2; return [[x - w, y, z - w], [x + w, y, z - w], [x + w, y, z + w], [x - w, y, z + w]]; };
      const A = lv(y0), Bt = lv(y1); for (let k = 0; k < 4; k++) B.beam(m, A[k], Bt[k], th, col);
      const st = Math.max(1.2, (w0 + w1) * 0.9);
      for (let y = y0; y < y1 - 0.1; y += st) { const a = lv(y), b = lv(Math.min(y1, y + st)); for (let k = 0; k < 4; k++) B.beam(m, a[k], b[(k + 1) % 4], th * 0.6, col); }
    },
  };
  // lap frame at distance s on `side` (+1 / -1 as track.nx), lateral d from the centreline
  Mz.at = function (t, s, side, d) {
    const f = U.mod(s / t.ds, t.n); const i = Math.floor(f), j = (i + 1) % t.n, u = f - i;
    const x = U.lerp(t.x[i], t.x[j], u), z = U.lerp(t.z[i], t.z[j], u), y = U.lerp(t.y[i], t.y[j], u);
    const nx = t.nx[i] * side, nz = t.nz[i] * side;
    return { x: x + nx * d, z: z + nz * d, y, tx: t.tx[i], tz: t.tz[i], nx, nz, i };
  };

  // ================================================================ text / sign atlas (one textured mesh for the whole venue)
  // regions are allocated by name on a 2048 x 1024 canvas; quads map their uv into the region
  class Atlas {
    constructor() { [this.cv, this.cx] = Env.canvas(2048, 1024); this.cx.fillStyle = '#808080'; this.cx.fillRect(0, 0, 2048, 1024); this.x = 0; this.y = 0; this.rowH = 0; this.R = {}; this.geo = { p: [], n: [], uv: [] }; }
    region(name, w, h, paint) {
      if (this.R[name]) return this.R[name];
      if (this.x + w > 2048) { this.x = 0; this.y += this.rowH + 2; this.rowH = 0; }
      const r = { x: this.x, y: this.y, w, h }; this.x += w + 2; this.rowH = Math.max(this.rowH, h);
      if (r.y + h > 1024) { console.warn('EnvMonza atlas full', name); r.y = 0; }
      this.cx.save(); this.cx.translate(r.x, r.y); this.cx.beginPath(); this.cx.rect(0, 0, w, h); this.cx.clip(); try { paint(this.cx, w, h); } catch (e) { console.error('EnvMonza atlas paint ' + name, e); } this.cx.restore();
      r.uv = (u, v) => [(r.x + 0.5 + u * (r.w - 1)) / 2048, 1 - (r.y + 0.5 + (1 - v) * (r.h - 1)) / 1024];
      return (this.R[name] = r);
    }
    // a quad a-b-c-d (counter-clockwise seen from its front) showing region r (u 0..1 along a->b, v 0..1 along a->d)
    quad(r, a, b, c, d, u0, u1, v0, v1) {
      u0 = u0 || 0; u1 = u1 == null ? 1 : u1; v0 = v0 || 0; v1 = v1 == null ? 1 : v1;
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const T = [[a, u0, v0], [b, u1, v0], [c, u1, v1], [a, u0, v0], [c, u1, v1], [d, u0, v1]];
      for (const [p, u, v] of T) { this.geo.p.push(p[0], p[1], p[2]); this.geo.n.push(nx, ny, nz); const q = r.uv(u, v); this.geo.uv.push(q[0], q[1]); }
    }
    mesh(name) {
      if (!this.geo.p.length) return null;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.geo.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.geo.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.geo.uv, 2)); g.computeBoundingSphere();
      const tex = Env.tex(this.cv, false, 8); tex.generateMipmaps = true;
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.05 })); m.name = name; m.receiveShadow = true; return m;
    }
  }
  Mz.Atlas = Atlas;
  // painters for the atlas
  Mz.paintText = function (x2, w, h, text, o) {
    o = o || {}; x2.fillStyle = o.bg || '#ffffff'; x2.fillRect(0, 0, w, h);
    if (o.band) { x2.fillStyle = o.band; x2.fillRect(0, h * 0.86, w, h * 0.14); }
    x2.fillStyle = o.fg || '#111111'; const fs = Math.round(h * (o.size || 0.62)); x2.font = (o.font || 'italic 900 ') + fs + 'px "Titillium Web", Arial, sans-serif'; x2.textBaseline = 'middle'; x2.textAlign = 'center';
    let tw = x2.measureText(text).width; const sx = Math.min(1, (w * 0.92) / Math.max(1, tw));
    x2.save(); x2.translate(w / 2, h * (o.band ? 0.45 : 0.52)); x2.scale(sx, 1); x2.fillText(text, 0, 0); x2.restore();
  };
  // Italian tricolore stripe (vertical bands)
  Mz.paintTricolore = function (x2, w, h) { x2.fillStyle = '#009246'; x2.fillRect(0, 0, w / 3, h); x2.fillStyle = '#f4f5f0'; x2.fillRect(w / 3, 0, w / 3 + 1, h); x2.fillStyle = '#ce2b37'; x2.fillRect(2 * w / 3, 0, w / 3 + 1, h); };
  // a partner tile (EI.Ads) or a fallback text board
  Mz.paintAd = function (x2, w, h, k, aspect) { if (EI.Ads && EI.Ads.paintTile) { x2.fillStyle = '#ffffff'; x2.fillRect(0, 0, w, h); EI.Ads.paintTile(x2, k, 0, 0, w, h, aspect || w / h); } else Mz.paintText(x2, w, h, k % 2 ? 'trylumi.co' : 'intake.ink', { bg: '#1b1530', fg: '#ffffff' }); };

  // ================================================================ hooks into the shared passes (Monza only; other circuits untouched)
  const V = EI.EnvVenue;
  if (V) {
    // venue layout: the OSM grandstand footprints are laid out by js/env_monza_stands.js (the generic per-footprint block would face the
    // wrong way on the curved stands and give every stand Silverstone's scaffold roof); the pit building and banking reserve their ground
    const oLayout = V.layout;
    V.layout = function (E) {
      if (!isMonza(E.t)) return oLayout.call(this, E);
      const S = E.t.data.scenery; E._mzGs = S.grandstands; S.grandstands = [];
      // the generator's per-footprint stand runs are replaced by js/env_monza_stands.js (styles, two-tier centrale, roofs)
      const runs = E.data.standRuns; E.data.standRuns = [];
      try { return oLayout.call(this, E); } finally { E.data.standRuns = runs; }
    };
    const oLS = V.layoutStands;
    V.layoutStands = function (E) {
      const r = oLS.call(this, E);
      if (isMonza(E.t)) { try { if (Mz.Stands) Mz.Stands.layout(E); if (Mz.Park && Mz.Park.layout) Mz.Park.layout(E); Mz.layoutPit(E); } catch (e) { console.error('EnvMonza layout', e); } }
      return r;
    };
    const oBuild = V.build;
    V.build = function (E) {
      const r = oBuild.call(this, E);
      if (isMonza(E.t)) { try { Mz.build(E); } catch (e) { console.error('EnvMonza build', e); } finally { if (E._mzGs) E.t.data.scenery.grandstands = E._mzGs; } }
      return r;
    };
    // tifosi: a red sea - re-tint the venue's spectator records before the crowd mesh takes them
    const oCrowd = V.crowd;
    V.crowd = function (E, set, carpet) {
      if (isMonza(E.t) && set && set.data) { try { tifosi(set); } catch (e) { console.error('EnvMonza crowd', e); } }
      return oCrowd.call(this, E, set, carpet);
    };
  }
  function tifosi(set) {
    const S = set.data[2], A = set.data[3], N = set.n, D = set.data[1]; const rng = U.rng(1929);
    const reds = [C(0xd40000), C(0xc20a0a), C(0xe01b1b), C(0xb00010)], yel = C(0xffd200), wht = C(0xf2f2f2), grn = C(0x009246), blk = C(0x161616);
    for (let i = 0; i < N; i++) {
      const r = rng(); let c = null;
      if (r < 0.46) c = reds[Math.floor(rng() * 4)]; else if (r < 0.5) c = yel; else if (r < 0.53) c = blk;
      if (c) { S[i * 4] = c.r; S[i * 4 + 1] = c.g; S[i * 4 + 2] = c.b; }
      // what they hold / wear on their heads: red caps and flags, some tricolours and yellow Ferrari flags
      const pose = D[i * 4]; const q = rng(); let a = null;
      if (pose === 14 || pose === 6) a = q < 0.62 ? reds[0] : q < 0.76 ? yel : q < 0.86 ? grn : wht; else if (q < 0.5) a = reds[1];
      if (a) { A[i * 4] = a.r; A[i * 4 + 1] = a.g; A[i * 4 + 2] = a.b; }
    }
  }
  if (EI.Scenery) {
    // Silverstone's Wing is built for venues without a kind: never at Monza (the pit building is ours)
    const oWing = EI.Scenery.prototype.buildWing;
    EI.Scenery.prototype.buildWing = function (grp, side) { if (isMonza(this.track)) return; return oWing.call(this, grp, side); };
    // the generic box buildings skip the footprints modelled here (pit building, podium, hospitality, medical centre)
    const oBB = EI.Scenery.prototype.buildBuildings;
    EI.Scenery.prototype.buildBuildings = function () {
      const sc = this.track.data.scenery; if (!isMonza(this.track)) return oBB.call(this);
      const all = sc.buildings; const f = Mz.fit(this.track); const own = Object.values(EI.MONZA_OSM.buildings).map(p => { const q = f.poly(p); let x = 0, z = 0; for (const v of q) { x += v[0]; z += v[1]; } return [x / q.length, z / q.length]; });
      sc.buildings = all.filter(b => { if (!b.p || b.p.length < 3) return true; let x = 0, z = 0; for (const v of b.p) { x += v[0]; z += v[1]; } x /= b.p.length; z /= b.p.length; return !own.some(o => Math.hypot(o[0] - x, o[1] - z) < 12) && !(b.n && /Box|Podio|Hospitality|Medic/i.test(b.n)); });
      try { return oBB.call(this); } finally { sc.buildings = all; }
    };
  }

  // ================================================================ the pit building frame (shared with the podium / tower / paddock)
  // pit.js lays the lane parallel to the start / finish straight (sf +- 180 m) at latC from the centreline, garages 7.8 .. 17.8 m beyond
  // the lane centre; the team boxes (18 m each) are centred on the straight's middle. The building follows the same frame.
  Mz.pitFrame = function (E) {
    const t = E.t; if (E._mzPF !== undefined) return E._mzPF;
    const pit = t.data.pit; if (!pit || pit.length < 4) return (E._mzPF = null);
    let lat = 0; const pr = {}; for (const p of pit) { t.project(p[0], p[1], null, pr); lat += pr.lat; } const side = lat < 0 ? -1 : 1;
    const wallOf = (i) => side < 0 ? t.wallL[i] : t.wallR[i];
    let maxWall = 0; for (let s = -180; s <= 180; s += 4) maxWall = Math.max(maxWall, wallOf(t.idxAtS(t.sf + s)));
    const latC = maxWall + 2.9 + 0.35 + 6.0;
    const i0 = t.idxAtS(t.sf); const m = Env.frame(t.x[i0], t.y[i0], t.z[i0], t.tx[i0], t.tz[i0], t.nx[i0] * side, t.nz[i0] * side);
    const e = m.elements; const dirX = (e[0] * t.tx[i0] + e[2] * t.tz[i0]) > 0 ? 1 : -1;
    const NB = Math.max(10, (EI.TEAMS || []).length || 11); const half = NB * 18 / 2;
    // the real pit building (OSM "Palazzina Box") and podium tower along the straight (x, metres from the line, + down the lap)
    const f = Mz.fit(t); const along = (p) => { const q = f.W(p); const dx = q[0] - t.x[i0], dz = q[1] - t.z[i0]; return dx * t.tx[i0] + dz * t.tz[i0]; };
    const box = EI.MONZA_OSM.buildings['Palazzina Box'].map(along); const podio = EI.MONZA_OSM.buildings['Podio']; let pc = [0, 0]; for (const p of podio) { pc[0] += p[0] / podio.length; pc[1] += p[1] / podio.length; }
    let xPod = along(pc);
    // building extent: the team garages plus the real footprint, inside the lane's straight part
    let x0 = Math.max(-340, Math.min(-half - 30, Math.min(...box) - 4)), x1 = Math.min(200, Math.max(half + 30, Math.max(...box) + 4));
    // the podium stands at the pit wall: keep it off the team boxes (their pit-wall stands) and inside the building
    if (Math.abs(xPod) < half + 14) xPod = (xPod < 0 ? -1 : 1) * (half + 16);
    xPod = U.clamp(xPod, x0 + 14, x1 - 14);
    return (E._mzPF = { side, maxWall, latC, m, dirX, y0: t.y[i0], i0, half, x0, x1, xPod, zG: latC + 7.8, zGB: latC + 17.8, X: (x) => x * dirX });
  };
  Mz.layoutPit = function (E) {
    const F = Mz.pitFrame(E); if (!F) return; const OCC = Env.OCC;
    // paddock + building behind the garages
    const P = (x, z) => Env.xf(F.m, F.X(x), 0, z);
    const poly = [P(F.x0 - 4, F.zG - 1), P(F.x1 + 4, F.zG - 1), P(F.x1 + 4, F.zGB + 16), P(F.x0 - 4, F.zGB + 16)].map(p => [p[0], p[2]]);
    E.markPoly(poly, OCC.BUILT, 2); E.mzPitPoly = poly; if (E.standPolys) E.standPolys.push(poly);
  };

  // ================================================================ build (after the venue)
  Mz.build = function (E) {
    const T0 = performance.now(); const out = E.stats.monza = {}; const sc = E.sc, ST = sc.statics;
    const A = new Atlas();
    // builders: concrete / painted (main), steel (main, metallic), glass (main, glossy), fine detail (clutter: dropped far away on low)
    const BK = { B: new Env.Builder(), S: new Env.Builder(), G: new Env.Builder(), F: new Env.Builder(), A };
    const step = (k, fn) => { const t0 = performance.now(); try { fn(); } catch (e) { console.error('EnvMonza ' + k, e); } out['ms_' + k] = Math.round(performance.now() - t0); };
    step('pit', () => buildPit(E, BK, out));
    if (Mz.Stands) step('stands', () => Mz.Stands.build(E, BK, out));
    if (Mz.Park) step('park', () => Mz.Park.build(E, BK, out));
    ST.add(BK.B.geometry(), 0.82, 0.03, 'main'); ST.add(BK.S.geometry(), 0.4, 0.6, 'main'); ST.add(BK.G.geometry(), 0.08, 0.55, 'main'); ST.add(BK.F.geometry(), 0.5, 0.35, 'clutter');
    out.tris = { main: BK.B.count / 3, steel: BK.S.count / 3, glass: BK.G.count / 3, fine: BK.F.count / 3 };
    const am = A.mesh('monzaSigns'); if (am) { sc.group.add(am); out.signTris = am.geometry.attributes.position.count / 3; }
    out.ms = Math.round(performance.now() - T0);
  };

  // ================================================================ pit building, podium, race-control tower, paddock
  // After m_pitlane / m15_party / m15_confetti and the FIA podium map: garages at track level (pit.js builds the eleven team boxes;
  // closed boxes either side here), a continuous upper floor of angled MIRROR glass leaning out over the lane, a row of white tubular
  // cantilever brackets above it, white tensile tent roofs of the Paddock Club on the roof terrace; the PODIUM cantilevered from the
  // building over the pit lane and the right part of the track (big dark backdrop screen, white arched tubes, glass balustrade); the
  // glazed race-control tower behind it; motorhome rows and tents in the paddock.
  function buildPit(E, BK, out) {
    const F = Mz.pitFrame(E); if (!F) return; const t = E.t; const { B, S, G, F: Fd, A } = BK;
    const m = F.m, X = F.X, zG = F.zG, zGB = F.zGB; const P = (x, y, z) => Env.xf(m, X(x), y, z);
    const white = C(0xf0f1ef), offW = C(0xdcdedd), grey = C(0xa9adb1), dark = C(0x2a2e34), shutter = C(0x8f969d), red = C(0xc8102e), mirror = C(0x9fb3c4), mirrorD = C(0x6f8496), glassD = C(0x1e2a36), steel = C(0xd9dde0), conc = C(0xc9c8c2);
    const half = F.half, x0 = F.x0, x1 = F.x1; const dq = (Bd, a, b, c, d, col) => K.dq(Bd, a, b, c, d, col);
    // ---- closed garages beyond the team boxes, same rhythm as pit.js (shutter, header, recessed glass band, slab with a red edge)
    for (const [a0, a1] of [[x0, -half], [half, x1]]) {
      for (let x = a0; x < a1 - 1; x += 9) {
        const w = Math.min(9, a1 - x), cx = x + w / 2;
        B.box(m, w, 1.8, zGB - zG + 0.3, X(cx), 4.8, (zG + zGB) / 2, white);
        B.box(m, w, 4.8, 0.25, X(cx), 0, zGB, offW);
        for (const e of [x, x + w]) B.box(m, 0.45, 4.8, 0.6, X(e), 0, zG, white);
        B.box(m, w - 0.5, 4.75, 0.08, X(cx), 0.02, zG + 0.25, shutter);
        for (let y = 0.35; y < 4.7; y += 0.32) Fd.box(m, w - 0.55, 0.04, 0.05, X(cx), y, zG + 0.2, C(0x7c838a));
        B.box(m, w, 0.28, 0.1, X(cx), 4.5, zG - 0.06, red);
        G.box(m, w, 3.2, zGB - zG - 1.0, X(cx), 6.6, zG + 1.1 + (zGB - zG - 1.0) / 2, glassD);
        B.box(m, w, 0.35, zGB - zG + 3.6, X(cx), 9.8, zG - 3.0 + (zGB - zG + 3.6) / 2, white, { bottom: true });
        B.box(m, w, 0.5, 0.2, X(cx), 9.75, zG - 2.9, red);
      }
    }
    // ---- the upper floor: angled mirror glass (two rows of panels, leaning out 1.6 m at the top), white mullions every 3 m
    const yb = 10.15, yt = 15.2, lean = 1.6, zf = zG - 0.6; const fz = (y) => zf - lean * (y - yb) / (yt - yb);
    for (let x = x0; x < x1 - 0.01; x += 6) {
      const xb = Math.min(x1, x + 6);
      for (const [ya, yb2, col] of [[yb + 0.3, 12.7, mirror], [12.75, yt - 0.25, mirrorD]]) G.quad(P(x, ya, fz(ya)), P(xb, ya, fz(ya)), P(xb, yb2, fz(yb2)), P(x, yb2, fz(yb2)), col), G.quad(P(x, yb2, fz(yb2)), P(xb, yb2, fz(yb2)), P(xb, ya, fz(ya)), P(x, ya, fz(ya)), col);
      for (let xm = x; xm < xb - 0.01; xm += 3) Fd.beam(m, [X(xm), yb + 0.2, fz(yb + 0.2) - 0.05], [X(xm), yt, fz(yt) - 0.05], 0.1, white);
      Fd.beam(m, [X(x), 12.72, fz(12.72) - 0.05], [X(xb), 12.72, fz(12.72) - 0.05], 0.12, white);
    }
    // sill + head bands, the back wall and the roof slab of the upper floor
    dq(B, P(x0, yb, zf + 0.3), P(x1, yb, zf + 0.3), P(x1, yb + 0.3, fz(yb + 0.3)), P(x0, yb + 0.3, fz(yb + 0.3)), white);
    B.box(m, x1 - x0, 0.55, zGB + 6 - fz(yt) + 0.6, X((x0 + x1) / 2), yt, (fz(yt) - 0.6 + zGB + 6) / 2, white, { top: C(0xb8bcbf), bottom: true });
    dq(B, P(x0, 0, zGB + 6), P(x1, 0, zGB + 6), P(x1, yt + 0.55, zGB + 6), P(x0, yt + 0.55, zGB + 6), offW);
    for (const yw of [6.8, 11.4]) dq(G, P(x0 + 2, yw, zGB + 6.05), P(x1 - 2, yw, zGB + 6.05), P(x1 - 2, yw + 2.2, zGB + 6.05), P(x0 + 2, yw + 2.2, zGB + 6.05), glassD);
    for (const xe of [x0, x1]) dq(B, P(xe, 0, zG - 0.6), P(xe, 0, zGB + 6), P(xe, yt + 0.55, zGB + 6), P(xe, yt + 0.55, fz(yt) - 0.6), offW);
    // the white tubular brackets cantilevered over the lane (every 4.5 m), an edge tube and a mid tube, slim struts back to the glass
    const zt = fz(yt) - 6.2;
    for (let x = x0 + 1; x <= x1 - 0.5; x += 4.5) { S.beam(m, [X(x), yt + 0.3, fz(yt) + 0.2], [X(x), yt + 1.5, zt], 0.16, steel); Fd.beam(m, [X(x), yt - 1.2, fz(yt - 1.2) - 0.1], [X(x), yt + 0.9, (fz(yt) + zt) / 2], 0.08, steel); }
    for (const [yy, zz] of [[yt + 1.5, zt], [yt + 0.9, (fz(yt) + zt) / 2]]) S.beam(m, [X(x0 + 1), yy, zz], [X(x1 - 0.5), yy, zz], 0.14, steel);
    // Paddock Club terrace: glass balustrade, white tensile tent roofs (peaked modules on a frame) over the back two thirds of the roof
    Fd.beam(m, [X(x0), yt + 1.6, fz(yt) + 0.4], [X(x1), yt + 1.6, fz(yt) + 0.4], 0.07, white);
    dq(G, P(x0, yt + 0.55, fz(yt) + 0.45), P(x1, yt + 0.55, fz(yt) + 0.45), P(x1, yt + 1.6, fz(yt) + 0.45), P(x0, yt + 1.6, fz(yt) + 0.45), C(0x9ec0c8));
    const tz0 = fz(yt) + 3.5, tz1 = zGB + 5.5, tyE = yt + 3.4, tyP = yt + 6.2, mw = 10;
    for (let x = x0 + 2; x < x1 - mw + 0.1; x += mw) {
      const xa = x, xb = x + mw, xm = x + mw / 2, zm = (tz0 + tz1) / 2; const mem = C(0xf6f7f6), memU = C(0xd7dadb);
      const pk = P(xm, tyP, zm), c4 = [P(xa, tyE, tz0), P(xb, tyE, tz0), P(xb, tyE, tz1), P(xa, tyE, tz1)];
      for (let k = 0; k < 4; k++) { B.tri(c4[k], c4[(k + 1) % 4], pk, mem); B.tri(pk, c4[(k + 1) % 4], c4[k], memU); }
      for (const [xx, zz] of [[xa, tz0], [xb, tz0], [xa, tz1], [xb, tz1]]) S.beam(m, [X(xx), yt + 0.5, zz], [X(xx), tyE, zz], 0.12, steel);
      S.beam(m, [X(xm), yt + 0.5, zm], [X(xm), tyP + 0.6, zm], 0.1, steel);
    }
    // name on the head band facing the track
    const nameR = A.region('mzPitName', 1024, 64, (x2, w, h) => { Mz.paintText(x2, w, h, 'AUTODROMO NAZIONALE MONZA', { bg: '#f0f1ef', fg: '#b3121f', size: 0.7 }); });
    { const xn0 = Math.max(x0 + 10, -half + 6), xn1 = Math.min(x1 - 10, xn0 + 64); const yy = yt + 0.04; const zz = fz(yt) - 0.62; const a = P(xn0, yy, zz), b = P(xn1, yy, zz), c = P(xn1, yy + 0.5, zz), d = P(xn0, yy + 0.5, zz); if (F.dirX > 0) A.quad(nameR, b, a, d, c, 0, 1, 0, 1); else A.quad(nameR, a, b, c, d, 0, 1, 0, 1); }
    out.pit = { x0: Math.round(x0), x1: Math.round(x1), latC: +F.latC.toFixed(1), xPod: Math.round(F.xPod) };
    buildPodium(E, BK, F);
    buildTower(E, BK, F);
    buildPaddock(E, BK, F);
  }
  // the podium over the track
  function buildPodium(E, BK, F) {
    const t = E.t, { B, S, G, F: Fd, A } = BK; const m = F.m, X = F.X; const P = (x, y, z) => Env.xf(m, X(x), y, z);
    const white = C(0xf1f2f2), grey = C(0x8e949a), dark = C(0x1b1e23), steel = C(0xe3e6e8), red = C(0xd0121f), green = C(0x009246);
    const xc = F.xPod, W = 24, hw = W / 2; const i = t.idxAtS(t.sf + xc * F.dirX); const yTr = t.y[i] - F.y0;   // track level here, frame-relative
    const zTip = Math.max(-1, t.halfWidth * 0.15 - 3), zBack = F.zG - 1.2;      // over the right part of the track .. into the building
    const yU = yTr + 11.2, yD = yU + 1.8;                                       // deck underside / top
    // deck: a white box with a red-white-green band along its nose, dark soffit
    B.box(m, W, yD - yU, zBack - zTip, X(xc), yU, (zTip + zBack) / 2, white, { top: C(0xcfd3d6), bottom: true });
    const nose = (y0, y1, col) => K.dq(B, P(xc - hw, y0, zTip - 0.03), P(xc + hw, y0, zTip - 0.03), P(xc + hw, y1, zTip - 0.03), P(xc - hw, y1, zTip - 0.03), col);
    nose(yU + 0.2, yU + 0.5, green); nose(yU + 0.5, yU + 0.8, white); nose(yU + 0.8, yU + 1.1, red);
    // two raking legs on the strip between the circuit barrier and the pit wall, and a truss back to the roof
    const zLeg = F.maxWall + 1.4;
    for (const dx of [-hw + 2.5, hw - 2.5]) { S.beam(m, [X(xc + dx), yTr, zLeg], [X(xc + dx), yU, zLeg], 0.9, steel); S.beam(m, [X(xc + dx), yU + 0.2, zTip + 1], [X(xc + dx), yD + 5.8, zBack - 2], 0.35, steel); }
    S.box(m, 0.7, 0.9, 0.7, X(xc - hw + 2.5), yTr, zLeg, grey); S.box(m, 0.7, 0.9, 0.7, X(xc + hw - 2.5), yTr, zLeg, grey);
    // podium steps (2 - 1 - 3) at the front, glass balustrade along the nose
    for (const [dx, h] of [[-3.2, 0.6], [0, 1.0], [3.2, 0.35]]) B.box(m, 3.0, h, 2.6, X(xc + dx), yD, zTip + 4.0, dark);
    Fd.beam(m, [X(xc - hw), yD + 1.1, zTip + 0.2], [X(xc + hw), yD + 1.1, zTip + 0.2], 0.08, steel);
    K.dq(G, P(xc - hw, yD, zTip + 0.25), P(xc + hw, yD, zTip + 0.25), P(xc + hw, yD + 1.1, zTip + 0.25), P(xc - hw, yD + 1.1, zTip + 0.25), C(0x9ec0c8));
    // backdrop: the big dark screen wall behind the drivers (event panel art), framed by two white arched tubes
    const sb0 = zTip + 7.5, sw = W - 3, sh = 7.0;
    B.box(m, sw + 0.6, sh + 0.6, 0.6, X(xc), yD - 0.1, sb0 + 0.35, dark);
    const scrR = A.region('mzPodiumScreen', 512, 160, (x2, w, h) => { if (EI.Ads && EI.Ads.paintEventPanel) EI.Ads.paintEventPanel(x2, w, h, sw / sh); else Mz.paintText(x2, w, h, "GRAN PREMIO D'ITALIA", { bg: '#15151e', fg: '#ffffff' }); });
    { const a = P(xc - sw / 2, yD + 0.2, sb0), b = P(xc + sw / 2, yD + 0.2, sb0), c = P(xc + sw / 2, yD + 0.2 + sh, sb0), d = P(xc - sw / 2, yD + 0.2 + sh, sb0); if (F.dirX > 0) A.quad(scrR, b, a, d, c); else A.quad(scrR, a, b, c, d); }
    for (const sd of [-1, 1]) { let prev = null; for (let k = 0; k <= 10; k++) { const u = k / 10; const ang = u * Math.PI; const x = xc + sd * (hw - 0.5) - sd * Math.sin(ang) * 1.2; const y = yD + 0.2 + Math.sin(ang * 0.5) * (sh + 3.2); const z = zTip + 1.0 + u * (sb0 - zTip - 0.5); const p = [X(x), y, z]; if (prev) S.beam(m, prev, p, 0.3, steel); prev = p; } }
    // the bridge deck back into the building (photographers' walkway), red underside band
    B.box(m, 8, 0.9, 3, X(xc), yU + 0.4, zBack + 1.5, white);
    E.stats.monza.podium = { x: Math.round(xc), zTip: +zTip.toFixed(1), y: +(yU).toFixed(1) };
  }
  // glazed race-control / timing tower behind the podium (m15_party): stacked white floor bands, dark glass, a crown with a sign
  function buildTower(E, BK, F) {
    const { B, G, S, A } = BK; const m = F.m, X = F.X; const P = (x, y, z) => Env.xf(m, X(x), y, z);
    const xc = U.clamp(F.xPod + (F.xPod < 0 ? 26 : -26), F.x0 + 8, F.x1 - 8), zc = F.zGB + 14, w = 16, d = 12, nF = 7, fh = 3.6;
    for (let k = 0; k < nF; k++) { const y = k * fh; B.box(m, w + 0.6, 0.5, d + 0.6, X(xc), y + fh - 0.5, zc, C(0xf3f4f2)); G.box(m, w, fh - 0.5, d, X(xc), y, zc, k % 2 ? C(0x3c5468) : C(0x2f4558)); }
    B.box(m, w + 1.4, 1.2, d + 1.4, X(xc), nF * fh, zc, C(0xf3f4f2), { bottom: true }); S.beam(m, [X(xc + 4), nF * fh + 1.2, zc], [X(xc + 4), nF * fh + 9, zc], 0.18, C(0xd9dde0));
    const sR = A.region('mzTowerName', 512, 96, (x2, w2, h2) => { x2.fillStyle = '#c8102e'; x2.fillRect(0, 0, w2, h2); Mz.paintText(x2, w2, h2 * 0.98, 'MONZA', { bg: '#c8102e', fg: '#ffffff', size: 0.78 }); });
    const zf = zc - d / 2 - 0.72, y0 = nF * fh + 0.05; const a = P(xc - w / 2 + 0.5, y0, zf), b = P(xc + w / 2 - 0.5, y0, zf), c = P(xc + w / 2 - 0.5, y0 + 1.1, zf), dd = P(xc - w / 2 + 0.5, y0 + 1.1, zf);
    if (F.dirX > 0) A.quad(sR, b, a, dd, c); else A.quad(sR, a, b, c, dd);
  }
  // paddock: rows of team motorhomes / hospitality units and tents behind the building (on the paddock side only)
  function buildPaddock(E, BK, F) {
    const { B, G } = BK; const m = F.m, X = F.X; const rng = U.rng(4401);
    const teams = EI.TEAMS || []; const zr = F.zGB + 34;
    for (let x = F.x0 + 6, k = 0; x < F.x1 - 14; x += 22, k++) {
      const tm = teams[k % Math.max(1, teams.length)] || { primary: '#333333' }; const tc = C(tm.primary); const L = 18, D = 8;
      if (Math.abs(x + L / 2 - (F.xPod < 0 ? F.xPod + 26 : F.xPod - 26)) < 16) continue;   // the tower
      B.box(m, L, 3.4, D, X(x + L / 2), 0, zr, C(0xe9eaeb)); G.box(m, L - 0.4, 1.6, D + 0.05, X(x + L / 2), 1.4, zr, C(0x2c3d4e));
      B.box(m, L, 3.0, D - 1, X(x + L / 2), 3.4, zr + 0.5, rng() < 0.5 ? tc : C(0x30343a)); B.box(m, L + 1, 0.3, D + 2.5, X(x + L / 2), 6.4, zr - 0.6, C(0xf6f7f7), { bottom: true });
    }
  }

  EI.EnvMonza = Mz;
})();
