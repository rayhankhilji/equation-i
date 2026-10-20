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
    // the High-tier detail group follows the quality setting
    const oSQ = EI.Scenery.prototype.setQuality;
    EI.Scenery.prototype.setQuality = function (q) { const r = oSQ.apply(this, arguments); if (isMonza(this.track) && this.group) { const g = this.group.getObjectByName('monzaHigh'); if (g) g.visible = q === 'high'; } return r; };
    const oBB = EI.Scenery.prototype.buildBuildings;
    EI.Scenery.prototype.buildBuildings = function () {
      const sc = this.track.data.scenery; if (!isMonza(this.track)) return oBB.call(this);
      const all = sc.buildings; const f = Mz.fit(this.track); const own = Object.values(EI.MONZA_OSM.buildings).map(p => { const q = f.poly(p); let x = 0, z = 0; for (const v of q) { x += v[0]; z += v[1]; } return [x / q.length, z / q.length]; });
      const pr = {}; const t = this.track;
      // and the park's farmsteads / the towns beyond ~420 m of the circuit: hidden by the woods and the haze, they cost ~2/3 of the
      // generic buildings' triangles in every view (WAVE 6 frame rate)
      sc.buildings = all.filter(b => { if (!b.p || b.p.length < 3) return true; let x = 0, z = 0; for (const v of b.p) { x += v[0]; z += v[1]; } x /= b.p.length; z /= b.p.length; t.project(x, z, null, pr); if (pr.dist > 420) return false; return !own.some(o => Math.hypot(o[0] - x, o[1] - z) < 12) && !(b.n && /Box|Podio|Hospitality|Medic|Esposizioni|rimesse/i.test(b.n)); });
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
    const xTow = xPod + (xPod - 20 > x0 + 8 ? -19 : 19);
    const yA = (x) => { const f = U.mod((t.sf + x) / t.ds, t.n), i = Math.floor(f), j = (i + 1) % t.n; return U.lerp(t.y[i], t.y[j], f - i) - t.y[i0]; };   // the straight's slope under the building
    return (E._mzPF = { side, maxWall, latC, m, dirX, y0: t.y[i0], i0, half, x0, x1, xPod, xTow, zG: latC + 7.8, zGB: latC + 17.8, X: (x) => x * dirX, yA });
  };
  Mz.layoutPit = function (E) {
    const F = Mz.pitFrame(E); if (!F) return; const OCC = Env.OCC;
    // paddock + building behind the garages
    const P = (x, z) => Env.xf(F.m, F.X(x), 0, z);
    const poly = [P(F.x0 - 4, F.zG - 1), P(F.x1 + 4, F.zG - 1), P(F.x1 + 4, F.zGB + 16), P(F.x0 - 4, F.zGB + 16)].map(p => [p[0], p[2]]);
    E.markPoly(poly, OCC.BUILT, 2); E.mzPitPoly = poly; if (E.standPolys) E.standPolys.push(poly);
    // the other circuit buildings round the paddock (OSM footprints, massing only)
    const f = Mz.fit(E.t); for (const k in OSMB) { const p0 = EI.MONZA_OSM.buildings[k]; if (p0 && p0.length >= 3) E.markPoly(f.poly(p0), OCC.BUILT, 2); }
  };
  // OSM footprints round the paddock that the generic buildings pass skips (they are listed in EI.MONZA_OSM): simple massing with a
  // flat roof and a parapet - medical centre, old garages, the exhibition pavilion, two service buildings (seen from the TV cameras)
  const OSMB = { 'Centro Medico': [7.5, 0xe9e9e4, 0xb9bcbd], 'Vecchie rimesse': [6.0, 0xc8a27c, 0x6c6f72], 'Padiglione Esposizioni': [9.5, 0xdfe1e1, 0xa9adb0], '193647799': [8.0, 0xc4c7c9, 0x9a9ea2], '193647800': [6.0, 0xe4e3de, 0xa3a7aa] };
  function buildOSMBuildings(E, BK) {
    const { B } = BK; const f = Mz.fit(E.t); let n = 0;
    for (const k in OSMB) {
      const p0 = EI.MONZA_OSM.buildings[k]; if (!p0 || p0.length < 3) continue; const [h, wc, rc] = OSMB[k]; const q = f.poly(p0); const N = (q.length > 3 && Math.hypot(q[0][0] - q[q.length - 1][0], q[0][1] - q[q.length - 1][1]) < 0.5) ? q.length - 1 : q.length;
      let cx = 0, cz = 0, yg = Infinity; for (let i = 0; i < N; i++) { cx += q[i][0] / N; cz += q[i][1] / N; yg = Math.min(yg, E.ground(q[i][0], q[i][1])); } if (!Number.isFinite(yg)) continue;
      const yt = yg + h, wall = C(wc), roof = C(rc);
      for (let i = 0; i < N; i++) { const a = q[i], b = q[(i + 1) % N]; K.dq(B, [a[0], yg - 0.6, a[1]], [b[0], yg - 0.6, b[1]], [b[0], yt + 0.6, b[1]], [a[0], yt + 0.6, a[1]], wall);
        const c0 = [cx, yt, cz], a1 = [a[0], yt, a[1]], b1 = [b[0], yt, b[1]]; const ny = (a1[2] - c0[2]) * (b1[0] - c0[0]) - (a1[0] - c0[0]) * (b1[2] - c0[2]); if (ny >= 0) B.tri(c0, a1, b1, roof); else B.tri(c0, b1, a1, roof); }
      n++;
    }
    E.stats.monza.osmBuildings = n;
  }

  // ================================================================ build (after the venue)
  Mz.build = function (E) {
    const T0 = performance.now(); const out = E.stats.monza = {}; const sc = E.sc, ST = sc.statics;
    const A = new Atlas();
    // builders: concrete / painted (main), steel (main, metallic), glass (main, glossy), fine detail (clutter: dropped far away on low)
    const BK = { B: new Env.Builder(), S: new Env.Builder(), G: new Env.Builder(), F: new Env.Builder(), H: new Env.Builder(), A };   // H: High-tier-only detail
    const tc = () => (BK.B.count + BK.S.count + BK.G.count + BK.F.count + BK.H.count) / 3 + A.geo.p.length / 9; out.tc = {};
    const step = (k, fn) => { const t0 = performance.now(), c0 = tc(); try { fn(); } catch (e) { console.error('EnvMonza ' + k, e); } out['ms_' + k] = Math.round(performance.now() - t0); out.tc[k] = Math.round(tc() - c0); };
    step('pit', () => buildPit(E, BK, out)); const PF = Mz.pitFrame(E);
    if (PF) { step('podium', () => buildPodium(E, BK, PF)); step('tower', () => buildTower(E, BK, PF)); step('paddock', () => buildPaddock(E, BK, PF)); }
    step('osmb', () => buildOSMBuildings(E, BK));
    if (Mz.Stands) step('stands', () => Mz.Stands.build(E, BK, out));
    if (Mz.Park) step('park', () => Mz.Park.build(E, BK, out));
    ST.add(BK.B.geometry(), 0.82, 0.03, 'main'); ST.add(BK.S.geometry(), 0.4, 0.6, 'main'); ST.add(BK.G.geometry(), 0.08, 0.55, 'main'); ST.add(BK.F.geometry(), 0.5, 0.35, 'clutter');
    out.tris = { main: BK.B.count / 3, steel: BK.S.count / 3, glass: BK.G.count / 3, fine: BK.F.count / 3, high: BK.H.count / 3 };
    // High tier only: a chunked group of its own (distance-culled like the clutter, hidden on Low / Medium by the setQuality hook below)
    if (BK.H.count) { const st = new Env.Statics(); st.add(BK.H.geometry(), 0.45, 0.4, 'clutter'); const g = new THREE.Group(); g.name = 'monzaHigh'; st.build(g); g.children.forEach(c => { c.name = 'monzaHi'; c.userData.clutter = true; }); sc.group.add(g); }
    const am = A.mesh('monzaSigns'); if (am) { sc.group.add(am); out.signTris = am.geometry.attributes.position.count / 3; }
    out.ms = Math.round(performance.now() - T0);
  };

  // ================================================================ pit building, podium, race-control tower, paddock
  // After pit_1 / pit_6 (refs2) and pit_building_facade: garages at lane level (pit.js builds the team boxes and, at Monza, leaves the
  // upper facade to this file - EnvMonza.ownsPitFacade), closed garages either side with ribbed grey shutters carrying big pale-blue
  // numbers; a flat aluminium header band; a curved grey band rolling out into the continuous RAKED MIRROR-GLASS wall (two storeys of
  // big panes + a row of top-hung vents each, silver mullions every 2.5 m, the top leaning ~1.6 m out over the lane); a white eave with
  // slim white tubular outriggers over the lane (pit_6); the roof terrace with a glass balustrade and the Paddock Club's white tensile
  // membrane roof (peaked bays on slim posts, pit_1). The building follows the straight's slope bay by bay (it falls 2.7 m over 430 m).
  Mz.ownsPitFacade = (t) => isMonza(t);
  function buildPit(E, BK, out) {
    const F = Mz.pitFrame(E); if (!F) return; const t = E.t; const { B, S, G, F: Fd, A } = BK;
    const m = F.m, X = F.X, zG = F.zG, zGB = F.zGB, yA = F.yA; const P = (x, y, z) => Env.xf(m, X(x), y + yA(x), z);
    const e = m.elements, LANE = [-e[8], -e[9], -e[10]], UP = [0, 1, 0];
    // a quad that faces `want` (world direction): the winding is chosen from its own normal
    const face = (Bd, a, b, c, d, col, want) => { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2]; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; if (nx * want[0] + ny * want[1] + nz * want[2] >= 0) Bd.quad(a, b, c, d, col); else Bd.quad(d, c, b, a, col); };
    const faceA = (r, a, b, c, d, u0, u1, v0, v1) => { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2]; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; if (nx * LANE[0] + ny * LANE[1] + nz * LANE[2] >= 0) A.quad(r, a, b, c, d, u0, u1, v0, v1); else A.quad(r, b, a, d, c, u1, u0, v0, v1); };
    const alu = C(0xc3c8cc), aluD = C(0x9da3a9), white = C(0xf0f1ef), offW = C(0xdcdedd), shutterC = C(0x8f969d), red = C(0xc8102e), steel = C(0xe4e7e9), glassD = C(0x1e2a36);
    const half = F.half, x0 = F.x0, x1 = F.x1; const rng = U.rng(5150);
    // the façade bays (9 m), split at the race-control tower so its glazing is not cut by the building's
    const bays = []; for (let x = x0; x < x1 - 0.01; x += 9) bays.push([x, Math.min(x1, x + 9)]);
    // ---- closed garages beyond the team boxes: aluminium piers, a ribbed shutter per 4.5 m with its number, a red line at the foot
    const shR = A.region('mzShutter', 96, 128, (x2, w, h) => { x2.fillStyle = '#8d949b'; x2.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 4) { x2.fillStyle = 'rgba(255,255,255,0.10)'; x2.fillRect(0, y, w, 1); x2.fillStyle = 'rgba(0,0,0,0.16)'; x2.fillRect(0, y + 2, w, 1); } x2.fillStyle = 'rgba(0,0,0,0.25)'; x2.fillRect(0, h - 6, w, 6); });
    const digR = A.region('mzDigits', 640, 96, (x2, w, h) => { x2.fillStyle = '#8d949b'; x2.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 4) { x2.fillStyle = 'rgba(0,0,0,0.12)'; x2.fillRect(0, y + 2, w, 1); } x2.fillStyle = '#4f8fd6'; x2.font = 'italic 700 88px Arial, sans-serif'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; for (let k = 0; k < 10; k++) x2.fillText(String(k), k * 64 + 32, h * 0.54); });
    let shutters = 0;
    for (const [a0, a1] of [[x0, -half], [half, x1]]) {
      if (a0 >= a1 - 1) continue;
      for (let x = a0; x < a1 - 1; x += 9) {
        const w = Math.min(9, a1 - x), cx = x + w / 2, yb = yA(cx);
        for (const ex of [x, x + w]) B.box(m, 0.55, 4.8, 0.7, X(ex), yA(ex), zG + 0.05, alu);
        const ns = w > 6 ? 2 : 1;
        for (let k = 0; k < ns; k++) {
          const sa = x + 0.3 + k * (w - 0.6) / ns, sb = x + 0.3 + (k + 1) * (w - 0.6) / ns, zs = zG + 0.3;
          faceA(shR, P(sa, 0.02, zs), P(sb, 0.02, zs), P(sb, 4.7, zs), P(sa, 4.7, zs), 0, 1, 0, 1); shutters++;
          // the number, two digits, pale blue, upper half of the shutter
          const n = 1 + Math.floor((sa - x0) / 4.5); const ds = String(n).padStart(2, '0'); const dw = 0.95, dh = 1.45, xm = (sa + sb) / 2, zd = zs - 0.02;
          // u runs left to right as seen from the lane (local +x is the lane viewer's left): the tens digit on the left
          for (let j = 0; j < 2; j++) { const d = +ds[j]; const u0 = d / 10 + 0.004, u1 = (d + 1) / 10 - 0.004; const lft = F.dirX > 0 ? xm + dw - j * dw : xm - dw + j * dw, rgt = F.dirX > 0 ? lft - dw : lft + dw;
            faceA(digR, P(lft, 2.3, zd), P(rgt, 2.3, zd), P(rgt, 2.3 + dh, zd), P(lft, 2.3 + dh, zd), u0, u1, 0, 1); }
          if (k + 1 < ns) Fd.box(m, 0.12, 4.7, 0.1, X(sb + 0.0), yA(sb), zs - 0.06, aluD);
        }
        face(B, P(x, 0, zG - 0.36), P(x + w, 0, zG - 0.36), P(x + w, 0.16, zG - 0.36), P(x, 0.16, zG - 0.36), red, LANE);
        // the pale concrete working lane in front of the closed boxes (pit.js paints the lane only to the team boxes' width here)
        face(B, P(x, 0.035, F.latC + 4.0), P(x + w, 0.035, F.latC + 4.0), P(x + w, 0.035, zG - 0.36), P(x, 0.035, zG - 0.36), C(0xa9aaa6), UP);
      }
    }
    // ---- the façade above the garages, bay by bay
    const yH0 = 4.8, yH1 = 6.6, yC1 = 7.3, zC = zG - 0.75, yT = 13.4, lean = 1.6, ySp = 10.25;   // header, curve, glass top, lean, spandrel
    const gz = (y) => zC - lean * (y - yC1) / (yT - yC1);        // z of the raked glass plane at height y
    const mirA = C(0x44596d), mirB = C(0x657d93), mirS = C(0x9fb6c6), vent = C(0x2d3a47), mull = C(0xd5d9dc);   // mirror glass: darker low (trees), lighter high (sky)
    for (const [xa, xb] of bays) {
      const xc = (xa + xb) / 2, w = xb - xa;
      // header band (flat, flush with the garage line; the team signs of pit.js sit just in front of it)
      B.box(m, w, yH1 - yH0, 1.2, X(xc), yA(xc) + yH0, zG + 0.55, alu, { bottom: true });
      // the rolled band: three facets from the header out to the foot of the glass
      const cv = [[zG - 0.05, yH1], [zG - 0.32, yH1 + 0.28], [zG - 0.58, yH1 + 0.52], [zC, yC1]];
      for (let k = 0; k + 1 < cv.length; k++) face(B, P(xa, cv[k][1], cv[k][0]), P(xb, cv[k][1], cv[k][0]), P(xb, cv[k + 1][1], cv[k + 1][0]), P(xa, cv[k + 1][1], cv[k + 1][0]), k === 1 ? aluD : alu, LANE);
      // glass: per 2.5 m column, per storey a big mirror pane and a row of vents; mullions (silver strips) and the spandrel band
      const nc = Math.max(1, Math.round(w / 2.5));
      for (let c = 0; c < nc; c++) {
        const ca = xa + c * w / nc, cb = ca + w / nc; const tone = 0.9 + rng() * 0.2;
        for (const [y0, y1, yv] of [[yC1, ySp - 0.15, ySp - 0.15 - 0.8], [ySp + 0.15, yT, yT - 0.8]]) {
          const col = (y0 > ySp ? mirB : mirA).clone().multiplyScalar(tone);
          face(G, P(ca, y0, gz(y0)), P(cb, y0, gz(y0)), P(cb, yv, gz(yv)), P(ca, yv, gz(yv)), col, LANE);
          face(G, P(ca, yv + 0.06, gz(yv + 0.06)), P(cb, yv + 0.06, gz(yv + 0.06)), P(cb, y1, gz(y1)), P(ca, y1, gz(y1)), rng() < 0.04 ? mirS : vent, LANE);
        }
        const mz = (y) => gz(y) - 0.04; face(S, P(ca - 0.05, yC1, mz(yC1)), P(ca + 0.05, yC1, mz(yC1)), P(ca + 0.05, yT, mz(yT)), P(ca - 0.05, yT, mz(yT)), mull, LANE);
      }
      for (const [y0, y1, cc] of [[ySp - 0.15, ySp + 0.15, mull], [ySp - 0.98, ySp - 0.92, mull], [yT - 0.86, yT - 0.8, mull]]) face(S, P(xa, y0, gz(y0) - 0.04), P(xb, y0, gz(y0) - 0.04), P(xb, y1, gz(y1) - 0.04), P(xa, y1, gz(y1) - 0.04), cc, LANE);
      // eave (white, overhanging the glass), roof slab of the building, back wall to the paddock
      B.box(m, w, 0.55, zGB + 6 - gz(yT) + 0.5, X(xc), yA(xc) + yT, (gz(yT) - 0.5 + zGB + 6) / 2, white, { top: C(0xb8bcbf), bottom: true });
      K.dq(B, P(xa, -0.3, zGB + 6), P(xb, -0.3, zGB + 6), P(xb, yT + 0.55, zGB + 6), P(xa, yT + 0.55, zGB + 6), offW);
      // slim white outriggers over the lane (pit_6), one per 4.5 m
      for (let x = xa + 0.6; x < xb - 0.3; x += 4.5) S.beam(m, [X(x), yT + 0.45 + yA(x), gz(yT) + 0.1], [X(x), yT + 1.35 + yA(x), gz(yT) - 4.4], 0.13, steel);
      S.beam(m, [X(xa), yT + 1.35 + yA(xa), gz(yT) - 4.4], [X(xb), yT + 1.35 + yA(xb), gz(yT) - 4.4], 0.12, steel);
      // terrace: glass balustrade with a white handrail
      face(G, P(xa, yT + 0.55, gz(yT) + 0.2), P(xb, yT + 0.55, gz(yT) + 0.2), P(xb, yT + 1.6, gz(yT) + 0.2), P(xa, yT + 1.6, gz(yT) + 0.2), C(0x9ec0c8), LANE);
      Fd.beam(m, [X(xa), yT + 1.62 + yA(xa), gz(yT) + 0.2], [X(xb), yT + 1.62 + yA(xb), gz(yT) + 0.2], 0.07, white);
    }
    // back wall glazing of the upper floor (paddock side) and the end walls
    for (const xe of [x0, x1]) K.dq(B, P(xe, -0.3, zG - 0.4), P(xe, -0.3, zGB + 6), P(xe, yT + 0.55, zGB + 6), P(xe, yT + 0.55, gz(yT) - 0.5), offW);
    // ---- Paddock Club: white membrane roof in peaked 10 m bays over the terrace, eave over the glass, slim posts and a valance
    const tz0 = gz(yT) - 1.2, tz1 = zGB + 4.5, tyF = yT + 4.6, tyB = yT + 4.0, tyP = yT + 6.6, mw = 10; const mem = C(0xf6f7f6), memU = C(0xd9dcdc);
    for (let x = x0 + 2; x < x1 - mw + 0.1; x += mw) {
      const xa = x, xb = x + mw, xm = x + mw / 2, zm = (tz0 + tz1) / 2 - 1.5;
      const pk = P(xm, tyP, zm), c4 = [P(xa, tyF, tz0), P(xb, tyF, tz0), P(xb, tyB, tz1), P(xa, tyB, tz1)];
      for (let k = 0; k < 4; k++) { const a = c4[k], b = c4[(k + 1) % 4]; const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = pk[0] - a[0], vy = pk[1] - a[1], vz = pk[2] - a[2]; const ny = uz * vx - ux * vz; if (ny >= 0) { B.tri(a, b, pk, mem); B.tri(pk, b, a, memU); } else { B.tri(pk, b, a, mem); B.tri(a, b, pk, memU); } }
      face(B, P(xa, tyF - 0.7, tz0), P(xb, tyF - 0.7, tz0), P(xb, tyF, tz0), P(xa, tyF, tz0), white, LANE);
      for (const [zz, yy] of [[tz0 + 0.4, tyF], [tz1 - 0.4, tyB]]) S.beam(m, [X(xa), yT + 0.55 + yA(xa), zz], [X(xa), yy + yA(xa), zz], 0.14, steel);
      BK.H.beam(m, [X(xm), yT + 0.55 + yA(xm), zm], [X(xm), tyP + yA(xm), zm], 0.1, steel);
    }
    // the circuit's name on the eave over the team boxes
    const nameR = A.region('mzPitName', 1024, 64, (x2, w, h) => { Mz.paintText(x2, w, h, 'AUTODROMO NAZIONALE MONZA', { bg: '#f0f1ef', fg: '#b3121f', size: 0.7 }); });
    { const xn0 = Math.max(x0 + 10, -half + 6), xn1 = Math.min(x1 - 10, xn0 + 64); const yy = yT + 0.03, zz = gz(yT) - 0.52;
      const a = P(xn0, yy, zz), b = P(xn1, yy, zz), c = P(xn1, yy + 0.5, zz), d = P(xn0, yy + 0.5, zz); if (F.dirX > 0) A.quad(nameR, b, a, d, c, 0, 1, 0, 1); else A.quad(nameR, a, b, c, d, 0, 1, 0, 1); }
    out.pit = { x0: Math.round(x0), x1: Math.round(x1), latC: +F.latC.toFixed(1), xPod: Math.round(F.xPod), shutters };
    // the starter's raised blue steel platform on the pit-wall strip at the line (refs2 start_1): four posts, a deck with railings,
    // a stair down the strip and a white parasol roof
    { const zs = F.maxWall + 1.6, ys = 4.4, blue = C(0x1f6fb5); const xs = 9, i = t.idxAtS(t.sf + xs); const yb = t.y[i] - F.y0 - 0.05;
      for (const [dx, dz] of [[-1.2, -1], [1.2, -1], [-1.2, 1], [1.2, 1]]) S.beam(m, [X(xs + dx), yb, zs + dz], [X(xs + dx), yb + ys + 1.1, zs + dz], 0.14, blue);
      S.box(m, 3.0, 0.2, 2.6, X(xs), yb + ys, zs, blue, { bottom: true });
      for (const dz of [-1.25, 1.25]) Fd.beam(m, [X(xs - 1.4), yb + ys + 1.05, zs + dz], [X(xs + 1.4), yb + ys + 1.05, zs + dz], 0.06, blue);
      for (const dx of [-1.4, 1.4]) Fd.beam(m, [X(xs + dx), yb + ys + 1.05, zs - 1.25], [X(xs + dx), yb + ys + 1.05, zs + 1.25], 0.06, blue);
      for (let y = 0.4; y < ys; y += 0.4) Fd.beam(m, [X(xs + 1.55), yb + y, zs - 0.35], [X(xs + 1.55), yb + y, zs + 0.35], 0.05, blue);
      S.beam(m, [X(xs + 0.6), yb + ys, zs + 0.3], [X(xs + 0.6), yb + ys + 3.0, zs + 0.3], 0.07, C(0xd9dde0)); K.cyl(B, m, X(xs + 0.6), zs + 0.3, yb + ys + 2.85, 0.15, 1.6, 10, C(0xf3f3f1), C(0xf3f3f1)); }
  }
  // the podium over the track (refs podium_structure_bare / podium_over_crowd_a,b / podium_platform_close): a flat steel deck cantilevered
  // from ONE big round grey column on the pit-wall strip, a red tube along its underside edge, a railing with flower boxes round the
  // rounded tip, the rostrum and the tall backdrop (partner wall + flag screens) at the outer end over the track; the photographers'
  // walkway back into the building
  function buildPodium(E, BK, F) {
    const t = E.t, { B, S, G, F: Fd, A } = BK; const m = F.m, X = F.X; const P = (x, y, z) => Env.xf(m, X(x), y, z);
    const grey = C(0x8d939a), greyL = C(0xb4b9be), dark = C(0x24272c), steel = C(0xc9cdd1), red = C(0xc8102e), flowR = C(0xc0182a), flowW = C(0xf2f2f2), leaf = C(0x2f5a2a);
    const xc = F.xPod, W = 15, hw = W / 2; const i = t.idxAtS(t.sf + xc); const yTr = t.y[i] - F.y0;   // track level here, frame-relative
    const zTip = Math.max(-t.halfWidth * 0.2, -2), zBack = F.zG - 1.4; let zCol = F.maxWall + 1.5;
    // as the race-control column: the straight start-line frame drifts off the lap here, the column stood inside the barrier (FIT-AUDIT)
    { const pq = {}; for (let it = 0; it < 4; it++) { const w = Env.xf(m, X(xc), 0, zCol); t.project(w[0], w[2], null, pq); const need = (F.side < 0 ? t.wallL[pq.i] : t.wallR[pq.i]) + 1.6 - pq.lat * F.side; if (need <= 0.05) break; zCol = Math.min(zCol + need, zBack - 2); } }
    const yU = yTr + 8.6, th = 0.7, yD = yU + th; const R = hw * 0.75;            // deck underside / top; radius of the rounded tip
    // the column and its head
    K.cyl(S, m, X(xc), zCol, yTr - 0.3, yU - 1.2 - yTr + 0.3, 1.15, 16, grey);
    S.box(m, 3.4, 1.2, 4.6, X(xc), yU - 1.2, zCol, greyL, { bottom: true });
    // two box girders under the deck along z, the deck plate (rectangle + rounded tip), red tube on the underside edge
    for (const dx of [-hw + 2.2, hw - 2.2]) S.box(m, 0.8, 0.9, zBack - zTip - 1, X(xc + dx), yU - 0.9, (zTip + zBack) / 2 + 0.5, greyL, { bottom: true });
    const zT0 = zTip + R;                        // where the round tip starts
    B.box(m, W, th, zBack - zT0, X(xc), yU, (zT0 + zBack) / 2, greyL, { top: C(0x6f757b), bottom: true });
    const N = 12, tip = []; for (let k = 0; k <= N; k++) { const a = Math.PI * k / N; tip.push([xc - Math.cos(a) * hw, zT0 - Math.sin(a) * R]); }
    for (let k = 0; k < N; k++) { const p = tip[k], q = tip[k + 1];
      K.dq(B, P(xc, yD, zT0), P(p[0], yD, p[1]), P(q[0], yD, q[1]), P(xc, yD, zT0), C(0x6f757b)); K.dq(B, P(xc, yU, zT0), P(p[0], yU, p[1]), P(q[0], yU, q[1]), P(xc, yU, zT0), greyL);
      K.dq(B, P(p[0], yU, p[1]), P(q[0], yU, q[1]), P(q[0], yD, q[1]), P(p[0], yD, p[1]), greyL);
      S.beam(m, [X(p[0]), yU - 0.3, p[1]], [X(q[0]), yU - 0.3, q[1]], 0.55, red);
      // railing + flower boxes (red / white geraniums) round the tip
      Fd.beam(m, [X(p[0]), yD + 1.05, p[1]], [X(q[0]), yD + 1.05, q[1]], 0.07, steel); Fd.beam(m, [X(p[0]), yD, p[1]], [X(p[0]), yD + 1.05, p[1]], 0.05, steel);
      const pm = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; const ox = (pm[0] - xc), oz = (pm[1] - zT0); const ol = Math.hypot(ox, oz) || 1;
      const fb = [pm[0] - ox / ol * 0.35, pm[1] - oz / ol * 0.35]; B.box(m, 1.6, 0.35, 0.45, X(fb[0]), yD + 0.65, fb[1], leaf);
      for (let j = 0; j < 4; j++) Fd.box(m, 0.28, 0.2, 0.3, X(fb[0] - 0.6 + j * 0.4), yD + 0.98, fb[1], j % 2 ? flowW : flowR);
    }
    for (const sd of [-1, 1]) { S.beam(m, [X(xc + sd * hw), yU - 0.3, zT0], [X(xc + sd * hw), yU - 0.3, zBack], 0.55, red); Fd.beam(m, [X(xc + sd * hw), yD + 1.05, zT0], [X(xc + sd * hw), yD + 1.05, zBack], 0.07, steel); }
    // rostrum (2 - 1 - 3) in front of the backdrop
    const zr = zT0 + 2.2;
    for (const [dx, h] of [[-2.6, 0.55], [0, 0.95], [2.6, 0.35]]) S.box(m, 2.4, h, 2.2, X(xc + dx), yD, zr, C(0xc5c9cd));   // chequer-plate aluminium steps (podium_1)
    // backdrop: the partner wall (EI.Ads tiles) with three flag screens above, on a dark frame, facing the main straight
    const zb = zr + 2.4, bw = 13, bh = 7.0;
    B.box(m, bw + 0.8, bh + 0.6, 0.7, X(xc), yD - 0.05, zb + 0.4, dark);
    const bdR = A.region('mzPodiumWall', 448, 240, (x2, w, h) => {
      x2.fillStyle = '#111317'; x2.fillRect(0, 0, w, h); const fh = h * 0.26;
      [['#000000', '#dd0000', '#ffce00'], ['#009246', '#f4f5f0', '#ce2b37'], ['#c8102e', '#ffffff', '#012169']].forEach((c3, k) => { const x0 = 14 + k * (w - 28) / 3, ww = (w - 28) / 3 - 10; for (let j = 0; j < 3; j++) { x2.fillStyle = c3[j]; if (k === 1) x2.fillRect(x0 + j * ww / 3, 8, ww / 3 + 1, fh); else x2.fillRect(x0, 8 + j * fh / 3, ww, fh / 3 + 1); } });
      const ty = fh + 22, cw = (w - 20) / 4, ch = (h - ty - 8) / 3;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { const x0 = 10 + c * cw, y0 = ty + r * ch; if (r === 1 && (c === 1 || c === 2)) continue; if (EI.Ads && EI.Ads.paintTile) EI.Ads.paintTile(x2, 0, x0 + 4, y0 + 4, cw - 8, ch - 8, (cw - 8) / (ch - 8)); else Mz.paintText(x2, cw - 8, ch - 8, 'MONZA', { bg: '#ffd200', fg: '#111' }); }
      x2.save(); x2.translate(10 + cw + 4, ty + ch + 4); if (EI.Ads && EI.Ads.drawF1) { x2.fillStyle = '#111317'; x2.fillRect(0, 0, cw * 2 - 8, ch - 8); EI.Ads.drawF1(x2, (cw * 2 - 8) * 0.3, (ch - 8) / 2, (cw * 2 - 8) * 0.4, (ch - 8) * 0.7); } x2.fillStyle = '#ffffff'; x2.font = '800 ' + Math.round(ch * 0.2) + 'px Arial'; x2.textBaseline = 'middle'; x2.fillText("GRAN PREMIO D'ITALIA", (cw * 2 - 8) * 0.52, (ch - 8) / 2); x2.restore();
    });
    { const a = P(xc - bw / 2, yD + 0.25, zb), b = P(xc + bw / 2, yD + 0.25, zb), c = P(xc + bw / 2, yD + 0.25 + bh, zb), d = P(xc - bw / 2, yD + 0.25 + bh, zb); if (F.dirX > 0) A.quad(bdR, b, a, d, c); else A.quad(bdR, a, b, c, d); }
    for (const sd of [-1, 1]) S.beam(m, [X(xc + sd * (bw / 2 + 0.2)), yD, zb + 0.9], [X(xc + sd * (bw / 2 + 0.2)), yD + bh + 0.6, zb + 0.9], 0.3, dark);
    // walkway to the building's upper floor (covered, glazed sides) and stairs down to the pit-wall strip at the column
    G.box(m, 4.6, 2.6, zBack - zb - 1, X(xc), yD, (zb + 1 + zBack) / 2, C(0x6f8496)); B.box(m, 5.2, 0.3, zBack - zb - 0.6, X(xc), yD + 2.6, (zb + 0.8 + zBack) / 2, C(0xeef0f0), { bottom: true });
    E.stats.monza.podium = { x: Math.round(xc), zTip: +zTip.toFixed(1), y: +(yU).toFixed(1) };
  }
  // the race-control tower beside the podium (refs race_control_tower, refs2 pit_2 / pit_3 / podium_1): it stands on the pit-wall strip
  // like the podium, raised on ONE white column - a grey panel-clad box, three glazed storeys (vision glass + dark spandrel bands,
  // white mullions), a plain rendered band, a glazed lantern under a thin overhanging cap; the plan is a "D": the end towards the
  // podium is a half-round, the other end square with an exposed stair down to the strip.
  function buildTower(E, BK, F) {
    const { B, G, S, F: Fd } = BK; const t = E.t; const m = F.m, X = F.X;
    const xc = F.xTow; let zc = F.maxWall + 1.6;
    // the start-line frame is straight but the lap drifts ~5 m off it this far down the straight: the column stood inside the barriers,
    // a metre off the track edge (FIT-AUDIT) - slide it out until it clears the wall line where it actually stands
    { const pq = {}; for (let it = 0; it < 4; it++) { const w = Env.xf(m, X(xc), 0, zc); t.project(w[0], w[2], null, pq); const need = (F.side < 0 ? t.wallL[pq.i] : t.wallR[pq.i]) + 1.6 - pq.lat * F.side; if (need <= 0.05) break; zc += need; } }
    const i = t.idxAtS(t.sf + xc); const yg = t.y[i] - F.y0 - 0.05;   // ground (strip) level
    const P = (x, y, z) => Env.xf(m, X(xc + x), yg + y, zc + z);
    const hw = 4.4, hd = 3.3, rs = Math.sign(F.xPod - xc) || -1;          // rs: the rounded end points at the podium
    // plan (x along, z across), counter-clockwise: the square end, then the half-round
    const plan = [[-rs * hw, -hd], [-rs * hw, hd]]; for (let k = 0; k <= 8; k++) { const th = Math.PI * k / 8; plan.push([rs * (hw - hd) + rs * hd * Math.sin(th), hd * Math.cos(th)]); }
    const ring = (Bd, y0, y1, col, g) => { g = g || 0; for (let k = 0; k < plan.length; k++) { const p = plan[k], q = plan[(k + 1) % plan.length]; const f = (v) => [v[0] * (1 + g / hw), v[1] * (1 + g / hd)]; const a = f(p), b = f(q); K.dq(Bd, P(a[0], y0, a[1]), P(b[0], y0, b[1]), P(b[0], y1, b[1]), P(a[0], y1, a[1]), col); } };
    const cap = (y, col, g) => { for (let k = 0; k < plan.length; k++) { const p = plan[k], q = plan[(k + 1) % plan.length]; const f = (v) => [v[0] * (1 + g / hw), v[1] * (1 + g / hd)]; K.dq(B, P(0, y, 0), P(f(p)[0], y, f(p)[1]), P(f(q)[0], y, f(q)[1]), P(0, y, 0), col); } };
    const white = C(0xeef0ee), clad = C(0xa7adb5), cladB = C(0x8c96a6), vis = C(0x5f8c92), spand = C(0x34434b), render = C(0xd3d6d6), mull = C(0xe2e5e6);
    K.cyl(B, m, X(xc), zc, yg - 0.3, 5.6, 0.95, 12, white);                      // the column
    ring(B, 5.2, 8.0, cladB); cap(5.2, clad, 0);                                   // panel-clad box + soffit
    for (let k = 0; k < 3; k++) { const y = 8.0 + k * 3.1; ring(G, y, y + 0.9, spand); ring(G, y + 0.9, y + 3.1, vis); }
    ring(B, 17.3, 19.6, render, -0.15); cap(17.3, render, 0);
    ring(G, 19.6, 21.9, vis, -0.35); cap(21.9, C(0xe6e7e4), 0.45); ring(B, 21.9, 22.35, C(0xe6e7e4), 0.45); cap(22.35, C(0xb9bcbe), 0.45);
    // mullions: a white strip at every plan vertex and every ~1.1 m along the straight faces (clutter layer)
    for (let k = 0; k < plan.length; k++) { const p = plan[k], q = plan[(k + 1) % plan.length]; const L = Math.hypot(q[0] - p[0], q[1] - p[1]); const n = Math.max(1, Math.round(L / 1.1));
      for (let j = 0; j < n; j++) { const f = j / n; const x = (p[0] + (q[0] - p[0]) * f) * 1.012, z = (p[1] + (q[1] - p[1]) * f) * 1.012; Fd.box(m, 0.09, 9.3, 0.09, X(xc + x), yg + 8.0, zc + z, mull); } }
    // the exposed stair down to the strip from the square end, white, with a steel rail
    { const xs = -rs * hw, xe = xs - rs * 10, zs0 = zc + hd - 1.5, zs1 = zc + hd; const Q = (x, y, z) => Env.xf(m, X(xc + x), yg + y, z);
      K.dq(B, Q(xs, 8.0, zs0), Q(xe, 0.0, zs0), Q(xe, 0.0, zs1), Q(xs, 8.0, zs1), white);                       // the flight
      for (const zz of [zs0, zs1]) K.dq(B, Q(xs, 8.0, zz), Q(xe, 0.0, zz), Q(xe, -0.5, zz), Q(xs, 7.3, zz), C(0xd9dbda));   // stringers
      B.box(m, 1.6, 0.25, 1.6, X(xc + xs - rs * 0.8), yg + 7.8, (zs0 + zs1) / 2, white);                       // landing
      Fd.beam(m, [X(xc + xs), yg + 9.0, zs1], [X(xc + xe), yg + 1.0, zs1], 0.06, C(0xb9bec4)); }
    S.beam(m, [X(xc + rs * 1.0), yg + 22.35, zc], [X(xc + rs * 1.0), yg + 27, zc], 0.1, C(0xd9dde0));
  }
  // paddock: rows of team motorhomes / hospitality units and tents behind the building (on the paddock side only)
  function buildPaddock(E, BK, F) {
    const { B, G } = BK; const m = F.m, X = F.X; const rng = U.rng(4401);
    const teams = EI.TEAMS || []; const zr = F.zGB + 34;
    for (let x = F.x0 + 6, k = 0; x < F.x1 - 14; x += 22, k++) {
      const tm = teams[k % Math.max(1, teams.length)] || { primary: '#333333' }; const tc = C(tm.primary); const L = 18, D = 8; const yb = F.yA(x + L / 2) - 0.2;
      if (Math.abs(x + L / 2 - (F.xPod < 0 ? F.xPod + 26 : F.xPod - 26)) < 16) continue;   // the tower
      B.box(m, L, 3.4, D, X(x + L / 2), yb, zr, C(0xe9eaeb)); G.box(m, L - 0.4, 1.6, D + 0.05, X(x + L / 2), yb + 1.4, zr, C(0x2c3d4e));
      B.box(m, L, 3.0, D - 1, X(x + L / 2), yb + 3.4, zr + 0.5, rng() < 0.5 ? tc : C(0x30343a)); B.box(m, L + 1, 0.3, D + 2.5, X(x + L / 2), yb + 6.4, zr - 0.6, C(0xf6f7f7), { bottom: true });
    }
  }

  EI.EnvMonza = Mz;
})();
