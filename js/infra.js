// Equation I - trackside infrastructure: advertising hoardings, debris-fence posts, tyre stacks, big screens,
// camera towers, marshal posts, worn grass bands, the paddock and the car-park fields.
// Everything is built from merged vertex-coloured geometry or InstancedMeshes so the whole venue costs a few dozen draw calls.
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  const Infra = {};

  // ---------------------------------------------------------------- geometry helpers
  // merge a list of geometries (each may carry userData.color) into one non-indexed, vertex-coloured BufferGeometry
  function merge(geos) {
    let count = 0; const list = [];
    for (const ge of geos) { const g = ge.index ? ge.toNonIndexed() : ge; list.push([g, ge.userData.color]); count += g.attributes.position.count; }
    const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3), uv = new Float32Array(count * 2), col = new Float32Array(count * 3);
    let o = 0;
    for (const [g, c] of list) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      const r = c ? c.r : 1, gg = c ? c.g : 1, b = c ? c.b : 1;
      for (let i = 0; i < n; i++) { col[(o + i) * 3] = r; col[(o + i) * 3 + 1] = gg; col[(o + i) * 3 + 2] = b; }
      o += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return out;
  }
  const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0), _z = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();
  // local frame for trackside objects: +x runs along the track (left to right as seen from the track), +z faces the track
  function frame(m, px, py, pz, side, tx, tz, scale) {
    _z.set(-side * tz, 0, side * tx); _x.set(side * tx, 0, side * tz);
    m.makeBasis(_x, _y, _z); if (scale) m.scale(_s.set(scale, scale, scale)); m.setPosition(px, py, pz); return m;
  }
  // a box in a local frame: translated/rotated into world by `m`
  function box(arr, w, h, d, x, y, z, color, m, ry) {
    const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); if (m) g.applyMatrix4(m); g.userData.color = color; arr.push(g); return g;
  }
  // a square-section beam between two local points
  function beam(arr, a, b, th, color, m) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]; const len = Math.hypot(dx, dy, dz); if (len < 0.01) return;
    const g = new THREE.BoxGeometry(th, th, len); _q.setFromUnitVectors(_z.set(0, 0, 1), _x.set(dx / len, dy / len, dz / len)); g.applyMatrix4(_m2.makeRotationFromQuaternion(_q)); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    if (m) g.applyMatrix4(m); g.userData.color = color; arr.push(g);
  }
  function cyl(arr, r0, r1, h, seg, x, y, z, color, m) { const g = new THREE.CylinderGeometry(r0, r1, h, seg); g.translate(x, y, z); if (m) g.applyMatrix4(m); g.userData.color = color; arr.push(g); return g; }
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
  function tex(c, repeat) { const t = new THREE.CanvasTexture(c); if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } t.anisotropy = 8; return U.srgb(t); }
  const C = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  const stdMat = (opts) => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.75, metalness: 0.05 }, opts || {}));

  // ---------------------------------------------------------------- track-relative placement
  class Ctx {
    constructor(track, scenery) {
      this.t = track; this.sc = scenery; this.rng = U.rng(4242); this.group = new THREE.Group(); this.group.name = 'infra'; this.reserved = []; this.stats = {};
      const t = track; this.kk = t.smooth(t.k, 12); this.kw = t.smooth(t.k, 25);
      this.cornerAt = (s) => { let name = null; for (const c of t.data.corners) if (s >= c.s - 60) name = c.name; return name; };
      this.cornerIn = (list, s) => t.cornerIn(list, t.cornerObj(s));   // data lists take corner names and / or turn numbers (track.js cornerIn)
      // pit lane side and range (hoardings and screens stay off the pit wall side of the start straight)
      const pit = t.data.pit; const pm = t.project(pit[Math.floor(pit.length / 2)][0], pit[Math.floor(pit.length / 2)][1], null);
      this.pitSide = pm.lat > 0 ? 1 : -1; this.pitS0 = t.project(pit[0][0], pit[0][1], null).s; this.pitS1 = t.project(pit[pit.length - 1][0], pit[pit.length - 1][1], null).s;
      this.polys = []; for (const g of t.data.scenery.grandstands) this.polys.push(g.p); for (const b of t.data.scenery.buildings) if (b.p.length >= 3 && Math.abs(U.polyArea(b.p)) >= 60) this.polys.push(b.p);
      if (scenery.env && scenery.env.standPolys) for (const p of scenery.env.standPolys) this.polys.push(p);
      this.obstacles = this.polys.concat(t.data.scenery.woods, t.data.scenery.water);
      this.tyreCorners = t.data.tyreCorners || ['Copse', 'Stowe', 'Club', 'Village', 'Vale', 'Brooklands', 'Luffield']; this.F = t.data.furniture || {};
      this.desert = !!(scenery.env && scenery.env.data && scenery.env.data.kind === 'desert');
      if (t.data.tunnel) for (let s = t.data.tunnel.s0 - 10; s <= t.data.tunnel.s1 + 10; s += 20) { this.reserve(s, 1, 12); this.reserve(s, -1, 12); }
    }
    inPit(s, side) { const L = this.t.length; return side === this.pitSide && U.mod(s - this.pitS0, L) < U.mod(this.pitS1 - this.pitS0, L); }
    outsideSide(i) { return this.kk[i] > 0 ? -1 : 1; } // k > 0 turns towards +lat, so the outside is the -1 side
    inCorner(i) { return Math.abs(this.kk[i]) > 1 / 600; }
    tyreZone(i, side) { return this.inCorner(i) && this.cornerIn(this.tyreCorners, this.t.s[i]) && side === this.outsideSide(i); }
    reserve(s, side, half) { this.reserved.push([s, side, half]); }
    isReserved(s, side) { const L = this.t.length; for (const r of this.reserved) { if (r[1] !== side) continue; let d = Math.abs(s - r[0]); d = Math.min(d, L - d); if (d < r[2]) return true; } return false; }
    // interpolated point at distance s, lateral wall+off on `side` (y follows the track; the verge ribbon is at track level out to wall+40)
    // ground under a box footprint (axis ax, az; half-length hl, half-width hw): forest ground (Spa) = its lowest corner (no wheel in the air), else the centre as before
    footY(x, z, ax, az, hl, hw) { const h = (a, b) => this.sc.height(x + ax * a - az * b, z + az * a + ax * b); if (!(this.sc.env && this.sc.env.forestOn)) return h(0, 0); return Math.min(h(0, 0), h(hl, hw), h(hl, -hw), h(-hl, hw), h(-hl, -hw)); }
    // forest ground (Spa): the lowest drawn ground within +-2.4 m along the lap (board legs, tower feet; not across: the verge shelf ends in a bank)
    forestY(x, z, tx, tz, nx, nz) { const h = (a, b) => this.sc.height(x + tx * a + nx * b, z + tz * a + nz * b); const h0 = h(0, 0); return Math.max(h0 - 0.25, Math.min(h0, h(2.4, 0), h(-2.4, 0))); }
    at(s, side, off) {
      const t = this.t; const f = U.mod(s / t.ds, t.n); const i = Math.floor(f), j = (i + 1) % t.n, u = f - i;
      const wall = side < 0 ? U.lerp(t.wallL[i], t.wallL[j], u) : U.lerp(t.wallR[i], t.wallR[j], u); let d = wall + off;
      // inside of a corner: never place anything beyond the local radius (the normals cross there)
      if (t.kFold) { const kf = t.kFold[i]; if ((kf > 0 && side > 0) || (kf < 0 && side < 0)) d = Math.min(d, Math.max(2, 0.88 / (Math.abs(kf) + 1e-6))); }
      const px = U.lerp(t.x[i], t.x[j], u) + t.nx[i] * side * d, pz = U.lerp(t.z[i], t.z[j], u) + t.nz[i] * side * d; const fe = this.sc && this.sc.env && this.sc.env.forestOn;   // forest ground (Spa, SPA-STITCH): the drawn ground, not the road level
      return { x: px, y: fe ? this.forestY(px, pz, t.tx[i], t.tz[i], t.nx[i], t.nz[i]) : U.lerp(t.y[i], t.y[j], u) - 0.03, z: pz, tx: t.tx[i], tz: t.tz[i], nx: t.nx[i] * side, nz: t.nz[i] * side, i, wall, d };
    }
    // ground height for anything: verge level near the track, terrain beyond
    ground(x, z) { return this.sc.height(x, z); }
    inObstacle(x, z, list) { for (const p of list || this.polys) if (U.pointInPoly(x, z, p)) return true; return false; }
    // find a trackside spot of half-length `half` and depth `depth` beyond the wall that overlaps no stand/building; walks along s in both directions
    freeSpot(s, side, off, half, depth, maxSlide) {
      for (const ds of [0, 15, -15, 30, -30, 45, -45, 60, -60, 80, -80, 100, -100]) {
        if (maxSlide != null && Math.abs(ds) > maxSlide) break;
        const p = this.at(s + ds, side, off); let ok = !this.inPit(s + ds, side) && !this.isReserved(s + ds, side);
        for (const [a, b] of [[-half, 0], [half, 0], [-half, depth], [half, depth], [0, depth / 2]]) { const x = p.x + p.tx * a + p.nx * b, z = p.z + p.tz * a + p.nz * b; if (this.inObstacle(x, z) || this.inCorridor(x, z)) { ok = false; break; } }
        if (ok) { p.s = s + ds; if (this.sc && this.sc.env && this.sc.env.forestOn) { for (const [a, b] of [[-half, 0], [half, 0], [-half, depth], [half, depth]]) p.y = Math.min(p.y, this.sc.height(p.x + p.tx * a + p.nx * b, p.z + p.tz * a + p.nz * b)); } return p; }   // (forest: the footprint's lowest ground, no corner in the air)
      }
      return null;
    }
    // inside the rendered barriers of whichever stretch is nearest (the wall widens within a footprint's length at escape roads; FIT-AUDIT)
    inCorridor(x, z) { const E = this.sc && this.sc.env; if (!E) return false; const t = this.t; const q = t.project(x, z, null, this._cq || (this._cq = {})); return q.dist < E.wallCap(q.i, q.lat < 0 ? -1 : 1) + 0.5; }
    add(mesh, name) { mesh.name = name || mesh.name; this.group.add(mesh); return mesh; }
    // untextured vertex-coloured structures go to the scenery's merged, spatially chunked statics (one material for everything)
    // street circuits: everything goes into the street world's cells (shared atlas material) instead of the lap-wide statics
    kit() { const SKx = EI.StreetKit; return this.t.data.street && SKx && SKx.World && this.sc ? SKx : null; }
    textured(list, texture, region, w, h, rough) {
      const SKx = this.kit(); if (!SKx || !list.length) return false; const img = texture.image; const r = SKx.Atlas.region(region, w, h, (x, ww, hh) => x.drawImage(img, 0, 0, ww, hh), null, null, 'none');
      const B = new SKx.Batch().set(r, rough || 0.55, 0); const W1 = new THREE.Color(1, 1, 1); for (const g of list) B.geo(g, null, W1); SKx.world(this.sc).add(B, 'detail'); return true;
    }
    static(geos, rough, metal, layer, name) { if (!geos.length) return; const SKx = this.kit();
      if (SKx) { const B = new SKx.Batch().mat(rough, metal); const W1 = new THREE.Color(1, 1, 1); for (const g of geos) B.geo(g, null, g.userData.color || W1); SKx.world(this.sc).add(B, 'detail'); this.stats[name + 'Tris'] = B.count / 3; return; } const g = merge(geos); if (this.sc.statics) { this.sc.statics.add(g, rough, metal, layer); this.stats[name + 'Tris'] = g.attributes.position.count / 3; return; } const m = new THREE.Mesh(g, stdMat({ roughness: rough, metalness: metal })); m.castShadow = true; m.receiveShadow = true; this.add(m, name); }
  }

  // ---------------------------------------------------------------- 1. advertising hoardings
  // the eight board designs are the venue's partner boards (EI.Ads.paintTile: real F1 partners + the occasional Lumi / Intake), 1024 x 256
  // cells in a 2 x 4 atlas; the design fills the band the 5 x 1 m face shows (v 0.08..0.98 of the cell = rows 5..235) at its true 5:1
  // aspect, the cell's bottom strip is the dark frame (f1-BRAND: was 512 x 128 with the 5:1 design stretched 11 % and its descenders cut)
  const NBRANDS = 8;
  const HCELL = (k) => [(k % 2) * 1024, Math.floor(k / 2) * 256];
  Infra.hoardingAtlas = function (o) {
    const [c, ctx] = canvas(2048, 1024);
    for (let k = 0; k < NBRANDS; k++) { const [x, y] = HCELL(k); ctx.fillStyle = '#2a2d31'; ctx.fillRect(x, y, 1024, 256); EI.Ads.paintTile(ctx, k, x, y + 5, 1024, 230, 5, o); }
    return tex(c);
  };
  // Yas Marina: black sponsor boards with the partners' white logos (u2-u4), same layout (EI.Ads dark boards; Lumi / Intake as white lock-ups)
  Infra.hoardingAtlasDark = function () { return Infra.hoardingAtlas({ dark: true }); };
  // the 4:1 boards (sponsor walls 3.8 x 0.95 m, advertising-gantry panels): their own designs laid out for 4:1, 4 x 2 cells of 512 x 128,
  // so nothing is stretched or cropped (f1-BRAND)
  Infra.boardAtlas4 = function (o) {
    const [c, ctx] = canvas(2048, 256);
    for (let k = 0; k < NBRANDS; k++) EI.Ads.paintTile(ctx, k, (k % 4) * 512, Math.floor(k / 4) * 128, 512, 128, 4, o);
    return tex(c);
  };
  const boardAtlas4 = (cx) => cx.boardAtlas4 || (cx.boardAtlas4 = Infra.boardAtlas4(cx.desert ? { dark: true } : undefined));
  const hoardAtlas = (cx) => cx.hoardAtlas || (cx.hoardAtlas = cx.desert ? Infra.hoardingAtlasDark() : Infra.hoardingAtlas());
  function buildHoardings(cx) {
    const t = cx.t, rng = U.rng(901);
    const atlas = hoardAtlas(cx);
    const geo = new THREE.BoxGeometry(5.0, 1.0, 0.08); const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) { if (i >= 16 && i < 20) uv.setXY(i, uv.getX(i), 0.08 + uv.getY(i) * 0.9); else uv.setXY(i, 0.5, 0.03); }
    const spots = [];
    // data.furniture.hoardZones [[s0, s1, side (0 = both), spacing m], ...] (Spa): boards only on those stretches instead of on every metre of barrier
    const HZ = cx.F.hoardZones;
    for (const side of [-1, 1]) {
      if (HZ) { for (const [z0, z1, zs, step] of HZ) { if (zs && zs !== side) continue; const span = U.mod(z1 - z0, t.length);
        for (let u = 0; u < span; u += Math.max(5.35, step)) { const s = U.mod(z0 + u, t.length) + 2.6, i = t.idxAtS(s);
          if (cx.tyreZone(i, side) || cx.inPit(s, side) || cx.isReserved(s, side)) continue; spots.push([s, side]); } } continue; }
      for (let s = 0; s < t.length - 5; s += 5.35) {
        const i = t.idxAtS(s + 2.6);
        if (cx.tyreZone(i, side) || cx.inPit(s + 2.6, side) || cx.isReserved(s + 2.6, side)) continue;
        if (rng() < 0.05) continue;
        spots.push([s + 2.6, side]);
      }
    }
    const mat = stdMat({ map: atlas, vertexColors: false, roughness: 0.55, metalness: 0.0 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 tileOff;').replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_UV\n\tvUv = vUv * vec2(0.5, 0.25) + tileOff;\n#endif');
    };
    mat.customProgramCacheKey = () => 'hoarding';
    // night races: the boards are LED panels, lit from within
    if (EI.Night && EI.Night.on) { mat.emissive = new THREE.Color(1, 1, 1); mat.emissiveMap = atlas; mat.emissiveIntensity = cx.desert ? 0.6 : 0.95; }
    const inst = new THREE.InstancedMesh(geo, mat, spots.length);
    const tiles = new Float32Array(spots.length * 2);
    const leg = (x) => { const g = new THREE.CylinderGeometry(0.07, 0.07, 2.05, 4, 1, true); g.rotateY(Math.PI / 4); g.translate(x, 1.025, -0.1); g.userData.color = C(0x2a2d31); return g; };
    const postGeo = merge([leg(-2.3), leg(2.3)]);
    const posts = new THREE.InstancedMesh(postGeo, stdMat({ roughness: 0.6, metalness: 0.4 }), spots.length);
    let brand = 0, run = 0;
    // drop boards that would overlap the previous one on the same side (the clamped line on the inside of hairpins bunches up)
    const last = {}; const kept = [];
    for (const sp of spots) { const p = cx.at(sp[0], sp[1], 1.9); const l = last[sp[1]]; if (l && Math.hypot(p.x - l.x, p.z - l.z) < 4.8) continue; if (cx.inCorridor(p.x + p.tx * 2.5, p.z + p.tz * 2.5) || cx.inCorridor(p.x - p.tx * 2.5, p.z - p.tz * 2.5)) continue; last[sp[1]] = p; kept.push(sp); }   // never inside another stretch's barriers (FIT-AUDIT)
    spots.length = 0; spots.push(...kept);
    inst.count = spots.length; posts.count = spots.length;
    spots.forEach((sp, k) => {
      const p = cx.at(sp[0], sp[1], 1.9);
      if (cx.sc.env && cx.sc.env.forestOn) {   // forest ground (Spa): the board follows the grade, each leg on the drawn ground
        const sd = sp[1], hA = cx.sc.height(p.x + sd * p.tx * 2.3, p.z + sd * p.tz * 2.3), hB = cx.sc.height(p.x - sd * p.tx * 2.3, p.z - sd * p.tz * 2.3);
        frame(_m, p.x, (hA + hB) / 2 - 0.03, p.z, sd, p.tx, p.tz); _m.multiply(new THREE.Matrix4().makeRotationZ(Math.atan2(hA - hB, 4.6)));
      } else frame(_m, p.x, p.y, p.z, sp[1], p.tx, p.tz);
      posts.setMatrixAt(k, _m);
      _m.multiply(new THREE.Matrix4().makeTranslation(0, 1.5, 0)); inst.setMatrixAt(k, _m);
      // brands come in runs of 3-6 identical boards, like real sponsor blocks
      if (run-- <= 0) { brand = Math.floor(rng() * NBRANDS); run = 1 + Math.floor(rng() * 4); }
      tiles[k * 2] = (brand % 2) * 0.5; tiles[k * 2 + 1] = 0.75 - Math.floor(brand / 2) * 0.25;
    });
    geo.setAttribute('tileOff', new THREE.InstancedBufferAttribute(tiles, 2));
    inst.castShadow = true; inst.receiveShadow = true; posts.castShadow = true;
    cx.add(inst, 'hoardings'); cx.add(posts, 'hoardingPosts'); cx.stats.hoardings = spots.length;
  }

  // ---------------------------------------------------------------- 1b. billboards: 10 x 3.5 m partner boards on two posts behind the fences
  Infra.billboardAtlas = function () {
    const [c, ctx] = canvas(2048, 1024);
    for (let k = 0; k < 4; k++) EI.Ads.paintBillboard(ctx, k, (k % 2) * 1024, Math.floor(k / 2) * 512, 1024, 512);
    return tex(c);
  };
  function buildBillboards(cx) {
    const t = cx.t; const geos = [], panels = []; const steel = C(0x6f7479), dark = C(0x2a2d31);
    const atlas = Infra.billboardAtlas();
    const cell = (g, k) => { const uv = g.attributes.uv; for (let v = 0; v < uv.count; v++) uv.setXY(v, (k % 2) * 0.5 + 0.004 + uv.getX(v) * 0.492, 0.5 - Math.floor(k / 2) * 0.5 + 0.006 + uv.getY(v) * 0.488); };
    let n = 0;
    (cx.F.billboards || [330, 790, 1240, 1760, 2300, 2660, 3300, 3740, 4210, 4760, 5310, 5700]).forEach((s0, k) => {
      const i = t.idxAtS(s0 + 30); const side = cx.outsideSide(i);
      const p = cx.freeSpot(s0, side, 6.5, 6, 2.5); if (!p) return;
      if (cx.isReserved(p.s - 5.5, side) || cx.isReserved(p.s + 5.5, side)) return;   // its 10.4 m panel must not overlap a big screen / another board (f1-BRAND)
      frame(_m, p.x, p.y, p.z, side, p.tx, p.tz); const m = _m.clone();
      for (const x of [-3.8, 3.8]) { box(geos, 0.34, 5.8, 0.34, x, 2.9, 0, steel, m); box(geos, 1.2, 0.3, 1.2, x, 0.15, 0, C(0x8e8e8a), m); }
      box(geos, 10.4, 3.9, 0.22, 0, 7.45, 0, dark, m);
      for (const dir of [1, -1]) { const g = new THREE.PlaneGeometry(10, 3.5); cell(g, k % 4); if (dir < 0) g.rotateY(Math.PI); g.translate(0, 7.45, dir * 0.13); g.applyMatrix4(m); panels.push(g); }
      cx.reserve(p.s, side, 6); n++;
    });
    cx.static(geos, 0.5, 0.4, 'main', 'billboardPosts');
    if (panels.length && !cx.textured(panels, atlas, 'billboards', 1024, 512, 0.5)) { const bm = new THREE.Mesh(merge(panels), new THREE.MeshStandardMaterial(Object.assign({ map: atlas, roughness: 0.5 }, EI.Night && EI.Night.on ? { emissive: 0xffffff, emissiveMap: atlas, emissiveIntensity: 0.9 } : {}))); bm.castShadow = true; bm.receiveShadow = true; cx.add(bm, 'billboards'); }
    cx.stats.billboards = n;
  }

  // ---------------------------------------------------------------- 2. debris-fence posts and top rail
  function buildFencePosts(cx) {
    const t = cx.t; const n = t.n;
    const postGeo = new THREE.CylinderGeometry(0.1, 0.1, 3.6, 4, 1, true); postGeo.rotateY(Math.PI / 4); postGeo.translate(0, 1.8, 0);
    const railGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 4, 1, true); railGeo.rotateZ(Math.PI / 2); railGeo.translate(0.5, 3.44, 0);
    const mat = stdMat({ vertexColors: false, color: (t.data.fence && t.data.fence.postColor != null) ? t.data.fence.postColor : 0x4d5258, roughness: 0.5, metalness: 0.5 });   // data.fence.postColor (Spa: dark green)
    // posts follow the (clamped) debris-fence line at wall + 0.8; on the inside of hairpins that line collapses towards the
    // centre of curvature, so a post is only planted once it is at least 2.5 m from the previous one
    const pts = [];
    for (const side of [-1, 1]) {
      let prev = null, first = null; const sidePts = [];
      for (let i = 0; i < n; i++) {
        const p = cx.at(t.s[i], side, 0.8); if (prev && Math.hypot(p.x - prev.x, p.z - prev.z) < 2.5) continue;
        sidePts.push(p); prev = p; if (!first) first = p;
      }
      if (sidePts.length > 2 && Math.hypot(sidePts[sidePts.length - 1].x - first.x, sidePts[sidePts.length - 1].z - first.z) < 2.5) sidePts.pop();
      pts.push(sidePts);
    }
    const count = pts[0].length + pts[1].length;
    const posts = new THREE.InstancedMesh(postGeo, mat, count), rails = new THREE.InstancedMesh(railGeo, mat, count);
    let k = 0;
    for (const sidePts of pts) {
      for (let j = 0; j < sidePts.length; j++) {
        const a = sidePts[j], b = sidePts[(j + 1) % sidePts.length];
        _q.setFromAxisAngle(_y, -Math.atan2(a.tz, a.tx)); _p.set(a.x, a.y, a.z); _s.set(1, 1, 1); _m.compose(_p, _q, _s); posts.setMatrixAt(k, _m);
        const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz); _q.setFromAxisAngle(_y, -Math.atan2(dz, dx)); _s.set(Math.min(len, 12), 1, 1); _m.compose(_p, _q, _s);
        rails.setMatrixAt(k, _m); k++;
      }
    }
    posts.count = k; rails.count = k; posts.castShadow = true;
    cx.add(posts, 'fencePosts'); cx.add(rails, 'fenceRails'); cx.stats.fencePosts = k;
    // Yas: galvanised posts and the mesh itself - panels of chain-link with a frame every ~2.5 m above the concrete wall (u1-u3),
    // one transparent ribbon round the lap (mipmapped, so far off it fades to a light haze instead of shimmering)
    if (cx.desert) {
      mat.color.set(0xb4b9be);
      const [fc, fx] = canvas(128, 128); fx.clearRect(0, 0, 128, 128);
      fx.strokeStyle = 'rgba(205,210,214,0.95)'; fx.lineWidth = 1.6; for (let k2 = -128; k2 < 256; k2 += 14) { fx.beginPath(); fx.moveTo(k2, 0); fx.lineTo(k2 + 128, 128); fx.stroke(); fx.beginPath(); fx.moveTo(k2, 128); fx.lineTo(k2 + 128, 0); fx.stroke(); }
      fx.fillStyle = 'rgba(190,196,200,1)'; fx.fillRect(0, 0, 4, 128); fx.fillRect(0, 0, 128, 4); fx.fillRect(0, 62, 128, 3); fx.fillRect(0, 124, 128, 4);
      const ft = tex(fc, true);
      const pos = [], uv = []; let u = 0;
      for (const sidePts of pts) for (let j = 0; j < sidePts.length; j++) {
        const a = sidePts[j], b = sidePts[(j + 1) % sidePts.length]; const len = Math.hypot(b.x - a.x, b.z - a.z); if (len > 12) continue;
        const y0a = a.y + 1.05, y0b = b.y + 1.05, y1a = a.y + 3.45, y1b = b.y + 3.45; const u1 = u + len / 2.5;
        pos.push(a.x, y0a, a.z, b.x, y0b, b.z, b.x, y1b, b.z, a.x, y0a, a.z, b.x, y1b, b.z, a.x, y1a, a.z); uv.push(u, 0, u1, 0, u1, 1, u, 0, u1, 1, u, 1); u = u1;
      }
      const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); fg.computeVertexNormals(); fg.computeBoundingSphere();
      const fm = new THREE.MeshStandardMaterial({ map: ft, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.55, alphaTest: 0.02 });
      const mesh = new THREE.Mesh(fg, fm); mesh.castShadow = false; mesh.receiveShadow = false; cx.add(mesh, 'debrisFence'); cx.stats.fenceMeshTris = pos.length / 9;
    }
  }

  // ---------------------------------------------------------------- 3. tyre stacks at the big braking zones
  // Yas: TecPro barriers instead of tyres at the corners - red / white polyethylene blocks strapped in a line along the wall
  function buildTecPro(cx) {
    const t = cx.t; const g0 = new THREE.BoxGeometry(1.08, 1.18, 0.9); g0.translate(0, 0.59, 0);
    // a darker strap band round each block (vertex colour mask), and a lighter top
    const strap = new THREE.BoxGeometry(1.1, 0.1, 0.92); strap.translate(0, 0.85, 0); strap.userData.color = C(0x5a5a5a); g0.userData.color = C(0xffffff);
    const geo = merge([g0, strap]); const spots = [];
    for (const side of [-1, 1]) {
      let lp = null, run = 0;
      for (let s = 0; s < t.length; s += 0.5) {
        const i = t.idxAtS(s); if (!cx.tyreZone(i, side) || (cx.tecZone && !cx.tecZone(i, side))) { lp = null; continue; }
        const p = cx.at(s, side, -0.5); if (lp && Math.hypot(p.x - lp.x, p.z - lp.z) < 1.12) continue; lp = p; spots.push([p, side, run++]);
      }
    }
    const inst = new THREE.InstancedMesh(geo, stdMat({ roughness: 0.6, metalness: 0.0 }), spots.length);
    const TPC = t.data.tecProColors; const red = C(TPC ? TPC[0] : 0xd0151c), white = C(TPC ? TPC[1] : 0xeeeeea);   // data.tecProColors (Spa: red / yellow blocks, F1 photos)
    spots.forEach(([p, side, k], j) => { frame(_m, p.x, p.y + 0.01, p.z, side, p.tx, p.tz); inst.setMatrixAt(j, _m); inst.setColorAt(j, k % 2 ? white : red); });
    if (!spots.length) return; inst.instanceColor.needsUpdate = true; inst.castShadow = true; inst.receiveShadow = true;
    cx.add(inst, cx.tecZone ? 'tecPro' : 'tyreStacks'); cx.stats.tecPro = spots.length;
  }
  function buildTyreStacks(cx) {
    if (cx.desert) return buildTecPro(cx);
    // data.tecProCorners (Monza): those corners get red / white TecPro blocks instead of the tyre wall
    const TP = cx.t.data.tecProCorners;
    if (TP && TP.length) { cx.tecZone = (i, side) => cx.cornerIn(TP, cx.t.s[i]); buildTecPro(cx); }
    const t = cx.t, rng = U.rng(77);
    // one column: 4 tyres with dark gaps and a dark hub hole on top; vertex colour is a brightness mask, instance colour paints the rubber
    // a single 8-sided column with a banded texture (the dark gaps between the four tyres), a cap and a dark hub hole
    const parts = []; const bright = C(0xffffff), dark = C(0x2a2a2a);
    const side = new THREE.CylinderGeometry(0.33, 0.33, 0.98, 8, 1, true); side.translate(0, 0.49, 0); side.userData.color = bright; parts.push(side);
    const cap = new THREE.CircleGeometry(0.33, 8); cap.rotateX(-Math.PI / 2); cap.translate(0, 0.98, 0); const cuv = cap.attributes.uv; for (let i = 0; i < cuv.count; i++) cuv.setXY(i, 0.5, 0.5); cap.userData.color = bright; parts.push(cap);
    const hole = new THREE.CircleGeometry(0.17, 8); hole.rotateX(-Math.PI / 2); hole.translate(0, 0.985, 0); const huv = hole.attributes.uv; for (let i = 0; i < huv.count; i++) huv.setXY(i, 0.5, 0.5); hole.userData.color = dark; parts.push(hole);
    const geo = merge(parts);
    const [bc, bctx] = canvas(8, 64); bctx.fillStyle = '#ffffff'; bctx.fillRect(0, 0, 8, 64); bctx.fillStyle = '#3a3a3a'; for (let k = 1; k < 4; k++) bctx.fillRect(0, k * 16 - 1.5, 8, 3); bctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < 4; k++) bctx.fillRect(0, k * 16 + 6, 8, 4);
    const bandTex = new THREE.CanvasTexture(bc);
    const spots = [];
    for (const side of [-1, 1]) {
      let run = 0, lp = null;
      for (let s = 0; s < t.length; s += 0.69) {
        const i = t.idxAtS(s); if (!cx.tyreZone(i, side) || (cx.tecZone && cx.tecZone(i, side))) { run = 0; lp = null; continue; }
        const p = cx.at(s, side, -0.47); if (lp && Math.hypot(p.x - lp.x, p.z - lp.z) < 0.6) continue; lp = p;
        spots.push([s, side, run++]);
      }
    }
    const inst = new THREE.InstancedMesh(geo, stdMat({ roughness: 0.95, metalness: 0.0, map: bandTex }), spots.length);
    const black = C(0x111113), white = C(0xe6e6e2), red = C(0xc4151b);
    let pattern = 0;
    spots.forEach((sp, k) => {
      const p = cx.at(sp[0], sp[1], -0.47); const sc = 0.97 + rng() * 0.06;
      _q.setFromAxisAngle(_y, rng() * 6.283); _p.set(p.x, p.y + 0.01, p.z); _s.set(sc, 1, sc); _m.compose(_p, _q, _s); inst.setMatrixAt(k, _m);
      // colour pattern: long black runs with blocks of white and the odd red column (the conveyor-belt wrapped look)
      if (sp[2] % 6 === 0) pattern = rng();
      inst.setColorAt(k, pattern < 0.16 ? white : pattern < 0.22 ? red : black);
    });
    inst.instanceColor.needsUpdate = true; inst.castShadow = true; inst.receiveShadow = true;
    cx.add(inst, 'tyreStacks'); cx.stats.tyreStacks = spots.length;
  }

  // ---------------------------------------------------------------- 4. big screens and TV camera towers
  Infra.broadcastTexture = function (kind) {
    const [c, ctx] = canvas(1024, 576);
    const g = ctx.createLinearGradient(0, 0, 1024, 576); g.addColorStop(0, '#0d1220'); g.addColorStop(1, '#1b2740'); ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 576);
    if (kind === 'timing') {
      // header bug
      ctx.fillStyle = '#e10600'; ctx.fillRect(40, 30, 300, 54); ctx.fillStyle = '#fff'; ctx.font = 'italic 900 36px Arial Black, Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('EQUATION I', 58, 58);
      ctx.fillStyle = '#fff'; ctx.fillRect(340, 30, 190, 54); ctx.fillStyle = '#111'; ctx.font = '700 30px Arial'; ctx.fillText('LAP  12 / 52', 356, 58);
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(40, 100, 490, 440);
      const teams = EI.TEAMS || []; const order = [2, 0, 3, 1, 4, 6, 9, 5, 7, 8]; let gap = 0;
      order.forEach((ti, r) => {
        const team = teams[ti % Math.max(1, teams.length)] || { primary: '#888', drivers: [{ name: 'DRIVER' }] }; const y = 110 + r * 43;
        ctx.fillStyle = r % 2 ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.1)'; ctx.fillRect(40, y, 490, 41);
        ctx.fillStyle = '#fff'; ctx.font = '900 26px Arial'; ctx.textAlign = 'center'; ctx.fillText(String(r + 1), 70, y + 21);
        ctx.fillStyle = team.primary; ctx.fillRect(92, y + 6, 8, 29);
        ctx.fillStyle = '#fff'; ctx.font = '700 26px Arial'; ctx.textAlign = 'left'; ctx.fillText(team.drivers[0].name.split(' ').pop().toUpperCase().slice(0, 3), 112, y + 21);
        gap += r === 0 ? 0 : 0.6 + ((r * 7) % 5) * 0.55; ctx.fillStyle = r === 0 ? '#ffd500' : '#dfe3ea'; ctx.font = '500 24px Arial'; ctx.textAlign = 'right'; ctx.fillText(r === 0 ? 'LEADER' : '+' + gap.toFixed(3), 515, y + 21);
      });
      // right-hand side: the partners' panel in the picture slot
      EI.Ads.paintTimingSlot(ctx, 560, 100, 424, 300);
      ctx.fillStyle = '#fff'; ctx.font = '700 30px Arial'; ctx.textAlign = 'left'; ctx.fillText(((EI.TRACKS && EI.TRACKS[EI.trackId] && EI.TRACKS[EI.trackId].name) || 'Silverstone').toUpperCase() + '  ·  GRAND PRIX', 560, 450); ctx.fillStyle = '#9fb3d1'; ctx.font = '500 24px Arial'; ctx.fillText('DRS ENABLED   ·   TRACK TEMP 31°C', 560, 495);
    } else {
      // full-screen partner ad ('lumi' or 'intake')
      EI.Ads.paintScreen(ctx, kind, 1024, 576);
    }
    return tex(c);
  };
  function buildScreens(cx) {
    const t = cx.t; const frames = [], screens = [[], [], []];
    const steel = C(0x9ba1a8), dark = C(0x15171a), rail = C(0x6b7178);
    const want = cx.F.screens || [[3040, 'out'], [4990, 'out'], [2190, 'out'], [t.sf + 90, 'nonpit']];
    let placed = 0;
    want.forEach((w, k) => {
      const i0 = t.idxAtS(w[0]); const side = w[1] === 'out' ? cx.outsideSide(t.idxAtS(w[0] + 40)) : -cx.pitSide;
      const p = cx.freeSpot(w[0], side, 9, 8, 4); if (!p) return;
      frame(_m, p.x, p.y, p.z, side, p.tx, p.tz); const m = _m.clone();
      // two lattice columns, a cross truss under the screen, bezel and the panel itself
      for (const sx of [-5.8, 5.8]) {
        for (const [ox, oz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) beam(frames, [sx + ox, 0, oz], [sx + ox, 12.6, oz], 0.14, steel, m);
        for (let y = 1.2; y < 12.6; y += 1.9) { beam(frames, [sx - 0.45, y, -0.45], [sx + 0.45, y, -0.45], 0.08, steel, m); beam(frames, [sx - 0.45, y, 0.45], [sx + 0.45, y, 0.45], 0.08, steel, m); beam(frames, [sx - 0.45, y, -0.45], [sx - 0.45, y, 0.45], 0.08, steel, m); beam(frames, [sx + 0.45, y, -0.45], [sx + 0.45, y, 0.45], 0.08, steel, m); beam(frames, [sx - 0.45, y, 0.45], [sx + 0.45, y + 1.9, 0.45], 0.06, steel, m); beam(frames, [sx - 0.45, y, -0.45], [sx + 0.45, y + 1.9, -0.45], 0.06, steel, m); }
        box(frames, 1.6, 0.4, 1.6, sx, 0.2, 0, C(0x8e8e8a), m);
      }
      for (const y of [4.6, 12.5]) { beam(frames, [-6.3, y, -0.45], [6.3, y, -0.45], 0.14, steel, m); beam(frames, [-6.3, y, 0.45], [6.3, y, 0.45], 0.14, steel, m); }
      for (let x = -5.3; x < 5.3; x += 1.5) { beam(frames, [x, 4.6, -0.45], [x + 1.5, 4.6, 0.45], 0.06, steel, m); beam(frames, [x, 12.5, 0.45], [x + 1.5, 12.5, -0.45], 0.06, steel, m); }
      box(frames, 12.7, 7.5, 0.45, 0, 8.55, 0.35, dark, m);
      // maintenance walkway behind the screen
      box(frames, 12.7, 0.12, 1.0, 0, 4.75, -0.9, rail, m); for (let x = -6.2; x <= 6.2; x += 2.07) beam(frames, [x, 4.8, -1.4], [x, 5.9, -1.4], 0.05, rail, m); beam(frames, [-6.2, 5.9, -1.4], [6.2, 5.9, -1.4], 0.05, rail, m);
      const sg = new THREE.PlaneGeometry(12, 6.75); sg.translate(0, 8.55, 0.59); sg.applyMatrix4(m); screens[placed % 3].push(sg);
      cx.reserve(p.s, side, 9); placed++; (cx.stats.screenAt = cx.stats.screenAt || []).push([Math.round(p.s), side]);
    });
    if (!frames.length) return;
    cx.static(frames, 0.45, 0.5, 'main', 'screenFrames');
    screens.forEach((list, k) => { if (!list.length) return; const m = new THREE.Mesh(merge(list), new THREE.MeshBasicMaterial({ map: Infra.broadcastTexture(['timing', 'lumi', 'intake'][k]) })); cx.add(m, 'screen' + k); });
    cx.stats.screens = placed;
  }
  function buildCameraTowers(cx) {
    const t = cx.t; const geos = []; const steel = C(0x8d9298), dark = C(0x33363b), cam = C(0x1a1b1e);
    const want = cx.F.cameraTowers || [[3160, 1], [3900, 1], [5075, 1], [5705, -1], [2010, 1], [965, 1], [460, 1]];
    let placed = 0;
    for (const [s, which] of want) {
      const i = t.idxAtS(s + 20); const side = which > 0 ? -cx.outsideSide(i) : cx.outsideSide(i);
      const p = cx.freeSpot(s, side, 5.5, 2, 3); if (!p) continue;
      frame(_m, p.x, p.y, p.z, side, p.tx, p.tz); const m = _m.clone(); const H = 9 + (placed % 3) * 1.5;
      const legs = [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]];
      for (const [lx, lz] of legs) beam(geos, [lx, 0, lz], [lx * 0.6, H, lz * 0.6], 0.1, steel, m);
      const at = (y) => { const f = 1 - 0.4 * y / H; return legs.map(l => [l[0] * f, y, l[1] * f]); };
      for (let y = 1.6; y < H; y += 1.8) { const r = at(y), r2 = at(Math.min(H, y + 1.8)); beam(geos, r[0], r[1], 0.06, steel, m); beam(geos, r[2], r[3], 0.06, steel, m); beam(geos, r[0], r[2], 0.06, steel, m); beam(geos, r[1], r[3], 0.06, steel, m); beam(geos, r[0], r2[1], 0.05, steel, m); beam(geos, r[2], r2[3], 0.05, steel, m); beam(geos, r[1], r2[3], 0.05, steel, m); beam(geos, r[0], r2[2], 0.05, steel, m); }
      box(geos, 2.6, 0.14, 2.6, 0, H + 0.07, 0, dark, m);
      for (const [rx, rz] of [[-1.25, -1.25], [1.25, -1.25], [-1.25, 1.25], [1.25, 1.25]]) beam(geos, [rx, H + 0.1, rz], [rx, H + 1.2, rz], 0.05, steel, m);
      for (const [a, b] of [[[-1.25, H + 1.2, -1.25], [1.25, H + 1.2, -1.25]], [[-1.25, H + 1.2, 1.25], [1.25, H + 1.2, 1.25]], [[-1.25, H + 1.2, -1.25], [-1.25, H + 1.2, 1.25]], [[1.25, H + 1.2, -1.25], [1.25, H + 1.2, 1.25]]]) beam(geos, a, b, 0.05, steel, m);
      // tripod, camera body and lens pointing at the track
      beam(geos, [0, H + 0.1, 0], [0, H + 1.45, 0], 0.08, dark, m); box(geos, 0.5, 0.45, 0.9, 0, H + 1.7, 0.2, cam, m); const lens = new THREE.CylinderGeometry(0.12, 0.16, 0.5, 8); lens.rotateX(Math.PI / 2); lens.translate(0, H + 1.7, 0.85); lens.applyMatrix4(m); lens.userData.color = cam; geos.push(lens);
      box(geos, 0.55, 1.6, 0.4, 0.75, H + 0.94, -0.2, C(0x5a4a3a), m); // the operator (standing on the deck: was centred 1.1 m above it - FIT, SPA-STITCH)
      cyl(geos, 0.16, 0.16, 0.3, 6, 0.75, H + 1.88, -0.2, C(0xe2c3a8), m);
      // Yas: a small canopy over the platform (sun / dew), white with a dark trim
      if (cx.desert) { for (const [rx, rz] of [[-1.25, -1.25], [1.25, -1.25], [-1.25, 1.25], [1.25, 1.25]]) beam(geos, [rx, H + 1.2, rz], [rx, H + 3.1, rz], 0.05, steel, m); box(geos, 3.0, 0.1, 3.0, 0, H + 3.15, 0, C(0xf0f0ee), m); box(geos, 3.04, 0.22, 3.04, 0, H + 3.0, 0, C(0x1d2a44), m); }
      cx.reserve(p.s, side, 4); placed++; (cx.stats.towerAt = cx.stats.towerAt || []).push([Math.round(p.s), side]);
    }
    if (!geos.length) return;
    cx.static(geos, 0.5, 0.5, 'main', 'cameraTowers'); cx.stats.cameraTowers = placed;
  }

  // ---------------------------------------------------------------- 6. marshal posts with huts, flag marshals, number boards, flag racks and LED panels
  function numberAtlas() {
    const [c, ctx] = canvas(512, 768);
    for (let k = 0; k < 24; k++) { const x = (k % 4) * 128, y = Math.floor(k / 4) * 128; ctx.fillStyle = '#f6f6f2'; ctx.fillRect(x, y, 128, 128); ctx.fillStyle = '#111'; ctx.fillRect(x, y, 128, 6); ctx.fillRect(x, y + 122, 128, 6); ctx.font = '900 92px Arial Black, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(k + 1), x + 64, y + 66); }
    return tex(c);
  }
  // a low-poly person (local frame m: +z faces the track): orange overalls with reflective bands, white cap; pose 0 standing,
  // 1 waving a flag, 2 with a fire extinguisher, 3 camera operator (dark clothes)
  function person(geos, m, x, y, z, pose, flagCol) {
    const op = pose === 3; const suit = op ? C(0x2b2f36) : C(0xff6a00), band = C(0xd9dbd2), skin = C(0xd9a47e), boot = C(0x1c1c1c), cap = op ? C(0x1d3557) : C(0xf2f2ee);
    for (const sx of [-0.11, 0.11]) { box(geos, 0.16, 0.84, 0.2, x + sx, y + 0.48, z, suit, m); box(geos, 0.18, 0.1, 0.28, x + sx, y + 0.05, z + 0.03, boot, m); }
    box(geos, 0.46, 0.62, 0.26, x, y + 1.21, z, suit, m); if (!op) { box(geos, 0.47, 0.05, 0.27, x, y + 1.08, z, band, m); box(geos, 0.47, 0.05, 0.27, x, y + 1.34, z, band, m); }
    box(geos, 0.1, 0.08, 0.1, x, y + 1.56, z, skin, m); box(geos, 0.2, 0.24, 0.22, x, y + 1.71, z, skin, m); box(geos, 0.23, 0.08, 0.25, x, y + 1.85, z, cap, m); box(geos, 0.2, 0.02, 0.12, x, y + 1.82, z + 0.17, cap, m);
    box(geos, 0.12, 0.6, 0.14, x - 0.3, y + 1.18, z, suit, m);
    if (pose === 1) { beam(geos, [x + 0.29, y + 1.44, z], [x + 0.42, y + 1.98, z + 0.05], 0.12, suit, m); beam(geos, [x + 0.42, y + 1.9, z + 0.06], [x + 0.46, y + 2.75, z + 0.06], 0.03, C(0x5a4a3a), m); box(geos, 0.7, 0.46, 0.02, x + 0.82, y + 2.48, z + 0.06, flagCol || C(0xffd500), m); }
    else if (pose === 2) { box(geos, 0.12, 0.6, 0.14, x + 0.3, y + 1.18, z, suit, m); cyl(geos, 0.08, 0.08, 0.5, 6, x + 0.38, y + 0.6, z + 0.05, C(0xc8102e), m); }
    else if (pose === 3) { beam(geos, [x + 0.28, y + 1.44, z], [x + 0.2, y + 1.62, z + 0.32], 0.11, suit, m); beam(geos, [x - 0.28, y + 1.44, z], [x - 0.2, y + 1.62, z + 0.32], 0.11, suit, m); }
    else box(geos, 0.12, 0.6, 0.14, x + 0.3, y + 1.18, z, suit, m);
  }
  function buildMarshalPosts(cx) {
    const t = cx.t, rng = U.rng(616); const geos = [], boards = [];
    const white = C(0xf2f2ee), orange = C(0xff6a00), dark = C(0x1e2024), grey = C(0xcfd0cc), led = C(0x2c2f34), post = C(0x3a3d42), green = C(0x19c24a);
    const flagsC = [C(0xffd500), C(0x1a73e8), C(0xf4f4f4), C(0xc8102e), C(0x19a34a), C(0x111111)];
    // corner posts first (outside of each named corner), then fill every gap longer than ~300 m along the straights, alternating sides
    const spots = []; const seen = {};
    // data.furniture.marshals (Monza): explicit posts [s, side] (side = +-1, 'out' / 'in' = outside / inside of the bend there); replaces the generated set
    const MP = cx.F.marshals;
    if (MP) for (const [s0, w] of MP) {
      const sd = w === 'out' ? cx.outsideSide(t.idxAtS(s0 + 10)) : w === 'in' ? -cx.outsideSide(t.idxAtS(s0 + 10)) : w;
      const p = cx.freeSpot(s0, sd, 2.6, 3, 3, 30) || cx.freeSpot(s0, -sd, 2.6, 3, 3, 30); if (!p) continue;
      const q = Math.sign(p.nx * t.nx[p.i] + p.nz * t.nz[p.i]) || sd; spots.push([p, q]); cx.reserve(p.s, q, 5); cx.reserve(p.s + 14, q, 3);
    }
    for (const c of MP ? [] : t.data.corners) {
      if (/Straight/i.test(c.name) || seen[c.name]) continue; seen[c.name] = true;
      const i = t.idxAtS(c.s + 30); const side = cx.outsideSide(i); const p = cx.freeSpot(c.s - 28, side, 2.6, 3, 3); if (p) { spots.push([p, side]); cx.reserve(p.s, side, 5); cx.reserve(p.s + 14, side, 3); }
    }
    const gapAt = (s) => { let best = Infinity; for (const [p] of spots) { let d = Math.abs(U.mod(s - p.s, t.length)); d = Math.min(d, t.length - d); best = Math.min(best, d); } return best; };
    let alt = 1;
    // Yas: a post every ~190 m on BOTH sides (behind the walls, u2-u4)
    if (cx.desert && !MP) {
      const gapSide = (s, sd) => { let best = Infinity; for (const [p, q] of spots) { if (q !== sd) continue; let d = Math.abs(U.mod(s - p.s, t.length)); d = Math.min(d, t.length - d); best = Math.min(best, d); } return best; };
      for (let s = 0; s < t.length; s += 20) for (const side of [1, -1]) {
        if (gapSide(s, side) < 190 || cx.inPit(s, side)) continue; const p = cx.freeSpot(s, side, 2.6, 3, 3); if (!p) continue;
        spots.push([p, side]); cx.reserve(p.s, side, 5); cx.reserve(p.s + 14, side, 3);
      }
    }
    for (let s = 0; s < t.length; s += 20) {
      if (MP || cx.desert || gapAt(s) < 290) continue; alt = -alt; const side = cx.inPit(s, alt) ? -alt : alt;
      const p = cx.freeSpot(s, side, 2.6, 3, 3) || cx.freeSpot(s, -side, 2.6, 3, 3); if (!p) continue;
      const sd = Math.sign(p.nx * t.nx[p.i] + p.nz * t.nz[p.i]) || side; spots.push([p, sd]); cx.reserve(p.s, sd, 5); cx.reserve(p.s + 14, sd, 3);
    }
    spots.sort((a, b) => a[0].s - b[0].s); cx.stats.marshalAt = spots.map(([p, sd]) => [Math.round(p.s), sd]);
    let num = 0;
    for (const [p, side] of spots) {
      frame(_m, p.x, p.y, p.z, side, p.tx, p.tz); const m = _m.clone(); num++;
      // raised post: concrete plinth, low wall in front, hut on top with an orange band, dark window strip and a roof slab
      // forest ground (Spa): a concrete skirt down to the lowest ground under the plinth, so a post on a falling bank never hangs in the air
      if (cx.sc && cx.sc.env && cx.sc.env.forestOn) { let lo = 0; for (const [lx, lz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6], [0, 1.6], [0, -1.6]]) { const w = new THREE.Vector3(lx, 0, lz).applyMatrix4(m); lo = Math.min(lo, cx.sc.height(w.x, w.z) - p.y); }
        if (lo < -0.05) box(geos, 3.1, -lo + 0.2, 3.1, 0, lo / 2 - 0.05, 0, C(0xa9a9a4), m); }
      box(geos, 3.2, 1.0, 3.2, 0, 0.5, 0, C(0xb9b9b4), m); box(geos, 3.4, 0.9, 0.3, 0, 1.45, 1.5, grey, m); box(geos, 0.3, 0.9, 3.2, -1.55, 1.45, 0, grey, m);
      box(geos, 2.4, 2.1, 2.0, 0, 2.05, -0.2, white, m); box(geos, 2.44, 0.34, 2.04, 0, 3.1, -0.2, orange, m); box(geos, 2.1, 0.55, 0.1, 0, 2.55, 0.82, dark, m); box(geos, 0.08, 0.55, 2.0, 1.2, 2.55, -0.2, dark, m);
      box(geos, 2.9, 0.12, 2.5, 0, 3.33, -0.2, grey, m); box(geos, 2.6, 0.12, 0.3, 0, 3.1, -1.3, orange, m);
      // steps up to the platform and a handrail
      for (let k = 0; k < 3; k++) box(geos, 0.9, 0.12, 0.3, -2.1, 0.3 + k * 0.33, -0.9 + k * 0.3, grey, m);
      beam(geos, [-1.55, 1.0, -1.55], [-1.55, 1.95, -1.55], 0.05, post, m); beam(geos, [-1.55, 1.95, -1.55], [1.55, 1.95, -1.55], 0.05, post, m);
      // flag rack on the hut side: the six signal flags rolled out on a board
      box(geos, 0.05, 0.8, 1.3, -1.24, 2.1, -0.2, C(0x5b5e63), m); flagsC.forEach((fc, k) => box(geos, 0.04, 0.3, 0.36, -1.28, 2.32 - Math.floor(k / 3) * 0.4, -0.62 + (k % 3) * 0.42, fc, m));
      // number board on a post beside the hut
      box(geos, 0.08, 3.4, 0.08, 1.9, 1.7, 0.3, post, m);
      const b = new THREE.PlaneGeometry(0.9, 0.9); const uv = b.attributes.uv; const k = (num - 1) % 24; for (let v = 0; v < uv.count; v++) uv.setXY(v, (k % 4 + uv.getX(v)) / 4, 1 - (Math.floor(k / 4) + 1 - uv.getY(v)) / 6); b.translate(1.9, 3.75, 0.36); b.applyMatrix4(m); boards.push(b);
      // LED flag panel just behind the fence line, ahead of the post (green = track clear)
      const lp = cx.at(p.s + 14, side, 1.4); frame(_m, lp.x, lp.y, lp.z, side, lp.tx, lp.tz); const lm = _m.clone();
      box(geos, 0.12, 2.3, 0.12, 0, 1.15, 0, post, lm); box(geos, 1.1, 0.75, 0.2, 0, 2.5, 0.05, dark, lm); box(geos, 0.98, 0.63, 0.04, 0, 2.5, 0.17, led, lm);
      for (let r = 0; r < 3; r++) for (let q = 0; q < 5; q++) box(geos, 0.12, 0.12, 0.03, -0.36 + q * 0.18, 2.32 + r * 0.18, 0.2, green, lm);
      // marshals: a flag marshal at the wall, one on the platform, one by the steps with the extinguisher
      person(geos, m, -2.3, 0, 1.0, 1, flagsC[num % 3 === 0 ? 1 : 0]); person(geos, m, 0.7, 1.0, 1.0, 0); if (rng() < 0.7) person(geos, m, -2.6, 0, -1.4, 2);
    }
    if (!geos.length) return;
    cx.static(geos, 0.7, 0.05, 'clutter', 'marshalPosts');
    if (!cx.textured(boards, numberAtlas(), 'marshalNumbers', 256, 384, 0.6)) cx.add(new THREE.Mesh(merge(boards), new THREE.MeshStandardMaterial({ map: numberAtlas(), roughness: 0.6 })), 'marshalBoards');
    cx.stats.marshalPosts = num;
  }

  // ---------------------------------------------------------------- 7. TV: camera scaffolds with operators and umbrellas, camera cranes, advertising gantries
  // and the concrete spectator walls with sponsor covers behind the tyre walls
  function buildBroadcast(cx) {
    const t = cx.t, rng = U.rng(4545); const geos = [], boards = [];
    const tube = C(0xa3a8ae), plank = C(0x8a6d4a), cam = C(0x1a1b1e), dark = C(0x2a2d31);
    const atlas = boardAtlas4(cx);
    // a cell of the 4:1 board atlas (Infra.boardAtlas4); the board quads are exactly 4:1
    const tile = (geo, brand) => { const uv = geo.attributes.uv; for (let v = 0; v < uv.count; v++) uv.setXY(v, ((brand % 4) + 0.004 + uv.getX(v) * 0.992) * 0.25, 0.5 - Math.floor(brand / 4) * 0.5 + (0.008 + uv.getY(v) * 0.984) * 0.5); };
    // camera scaffolds: tube towers ~2.6 m with a plank deck, rails, tripod camera, operator and an umbrella
    let scaff = 0;
    for (const s0 of cx.F.scaffolds || [610, 1130, 1960, 2470, 3470, 3790, 4230, 5290, 5560, 760, 2860]) {
      const i = t.idxAtS(s0 + 20); const side = cx.outsideSide(i); const p = cx.freeSpot(s0, side, 4.2, 1.6, 2.4); if (!p) continue;
      frame(_m, p.x, p.y, p.z, side, p.tx, p.tz); const m = _m.clone(); const Hh = 2.4 + (scaff % 3) * 0.6;
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) beam(geos, [x, 0, z], [x, Hh + 1.05, z], 0.06, tube, m);
      for (const y of [0.15, Hh * 0.5]) { beam(geos, [-1, y, -1], [1, y, -1], 0.05, tube, m); beam(geos, [-1, y, 1], [1, y, 1], 0.05, tube, m); beam(geos, [-1, y, -1], [-1, y, 1], 0.05, tube, m); beam(geos, [1, y, -1], [1, y, 1], 0.05, tube, m); }
      beam(geos, [-1, 0.15, -1], [1, Hh, -1], 0.04, tube, m); beam(geos, [-1, 0.15, 1], [1, Hh, 1], 0.04, tube, m);
      box(geos, 2.3, 0.08, 2.3, 0, Hh, 0, plank, m); for (const y of [Hh + 0.55, Hh + 1.05]) { beam(geos, [-1, y, -1], [1, y, -1], 0.04, tube, m); beam(geos, [-1, y, -1], [-1, y, 1], 0.04, tube, m); beam(geos, [1, y, -1], [1, y, 1], 0.04, tube, m); }
      for (const [x, z] of [[0, 0.7], [-0.25, 0.2], [0.25, 0.2]]) beam(geos, [0.0, Hh + 1.35, 0.4], [x, Hh + 0.05, z], 0.03, dark, m);
      box(geos, 0.3, 0.32, 0.6, 0, Hh + 1.5, 0.45, cam, m); const lens = new THREE.CylinderGeometry(0.1, 0.13, 0.5, 8); lens.rotateX(Math.PI / 2); lens.translate(0, Hh + 1.52, 0.95); lens.applyMatrix4(m); lens.userData.color = cam; geos.push(lens);
      person(geos, m, 0.1, Hh + 0.04, -0.35, 3);
      beam(geos, [-0.7, Hh, -0.7], [-0.7, Hh + 2.6, -0.7], 0.04, dark, m); cyl(geos, 0.05, 1.15, 0.38, 8, -0.7, Hh + 2.75, -0.7, [C(0xc8102e), C(0xf2f2f2), C(0x1a73e8)][scaff % 3], m);
      cx.reserve(p.s, side, 4); scaff++;
    }
    // camera cranes (jibs): ballast base, mast, lattice arm reaching out over the debris fence, remote head at the tip
    let cranes = 0;
    for (const s0 of cx.F.cranes || [5130, 3330, 2290]) {
      const i = t.idxAtS(s0); const side = cx.outsideSide(t.idxAtS(s0 + 40)); const p = cx.freeSpot(s0, side, 7.5, 3, 4); if (!p) continue;
      frame(_m, p.x, p.y, p.z, side, p.tx, p.tz); const m = _m.clone();
      box(geos, 2.4, 0.9, 3.2, 0, 0.45, -1, C(0x3a3d42), m); for (const x of [-1, 1]) for (const z of [-2.4, 0.4]) cyl(geos, 0.3, 0.3, 0.25, 8, x * 1.25, 0.3, z, C(0x1c1c1c), m);
      beam(geos, [0, 0.9, -1], [0, 4.6, -1], 0.32, C(0x55595f), m); box(geos, 0.7, 0.5, 0.7, 0, 4.6, -1, dark, m);
      const a0 = [0, 5.0, -4.5], a1 = [0, 6.6, 6.2]; const dx = a1[1] - a0[1], dz = a1[2] - a0[2];
      for (const o of [-0.22, 0.22]) { beam(geos, [o, a0[1], a0[2]], [o, a1[1], a1[2]], 0.08, tube, m); beam(geos, [o, a0[1] - 0.35, a0[2]], [o, a1[1] - 0.3, a1[2]], 0.06, tube, m); }
      for (let u = 0; u < 1; u += 0.08) { const y = a0[1] + dx * u, z = a0[2] + dz * u, y2 = a0[1] + dx * (u + 0.08), z2 = a0[2] + dz * (u + 0.08); beam(geos, [-0.22, y, z], [0.22, y2 - 0.3, z2], 0.03, tube, m); beam(geos, [0.22, y - 0.3, z], [-0.22, y2, z2], 0.03, tube, m); }
      box(geos, 0.9, 0.9, 0.9, 0, a0[1] - 0.6, a0[2], C(0x8e9196), m); box(geos, 0.5, 0.6, 0.5, 0, a1[1] - 0.7, a1[2], dark, m); box(geos, 0.28, 0.3, 0.5, 0, a1[1] - 1.15, a1[2] + 0.1, cam, m);
      person(geos, m, 1.2, 0, -2.6, 3); cx.reserve(p.s, side, 5); cranes++;
    }
    // advertising gantries over the straights: two lattice towers outside the barriers, a box truss and sponsor panels both ways
    let gantries = 0;
    for (const s0 of cx.F.gantries || [1660, 4610]) {
      let ok = false, s = s0;
      for (const ds of [0, 30, -30, 60, -60]) { s = s0 + ds; if (!cx.isReserved(s, 1) && !cx.isReserved(s, -1) && !cx.inPit(s, 1) && !cx.inPit(s, -1)) { const A = cx.at(s, -1, 3.0), B = cx.at(s, 1, 3.0); if (!cx.inObstacle(A.x, A.z) && !cx.inObstacle(B.x, B.z)) { ok = true; break; } } }
      if (!ok) continue;
      const A = cx.at(s, -1, 3.0), Bp = cx.at(s, 1, 3.0); const i = t.idxAtS(s); const yDeck = t.y[i] + 7.2;
      const ux = Bp.x - A.x, uz = Bp.z - A.z, span = Math.hypot(ux, uz); const ax = ux / span, az = uz / span; const tx = t.tx[i], tz = t.tz[i];
      const W = (u, y, v) => [A.x + ax * u + tx * v, y, A.z + az * u + tz * v];
      const tw = (u) => { const g0 = cx.ground(A.x + ax * u, A.z + az * u); for (const [du, dv] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) beam(geos, W(u + du, g0, dv), W(u + du, yDeck + 1.6, dv), 0.14, tube); for (let y = g0 + 1.2; y < yDeck; y += 1.4) { beam(geos, W(u - 0.6, y, -0.6), W(u + 0.6, y + 1.4, -0.6), 0.05, tube); beam(geos, W(u - 0.6, y, 0.6), W(u + 0.6, y + 1.4, 0.6), 0.05, tube); beam(geos, W(u - 0.6, y, -0.6), W(u - 0.6, y + 1.4, 0.6), 0.05, tube); beam(geos, W(u + 0.6, y, -0.6), W(u + 0.6, y + 1.4, 0.6), 0.05, tube); } box(geos, 2.0, 0.4, 2.0, 0, 0.2, 0, C(0x8e8e8a), new THREE.Matrix4().makeTranslation(...W(u, g0, 0))); };
      tw(-1.2); tw(span + 1.2);
      for (const y of [yDeck, yDeck + 1.6]) for (const v of [-0.6, 0.6]) beam(geos, W(-1.8, y, v), W(span + 1.8, y, v), 0.12, tube);
      for (let u = -1.8; u < span + 1.8; u += 1.6) { beam(geos, W(u, yDeck, -0.6), W(u + 1.6, yDeck + 1.6, -0.6), 0.05, tube); beam(geos, W(u, yDeck, 0.6), W(u + 1.6, yDeck + 1.6, 0.6), 0.05, tube); beam(geos, W(u, yDeck, -0.6), W(u, yDeck, 0.6), 0.05, tube); }
      // sponsor panels on both faces, one brand tile per 5 m
      const n = Math.max(1, Math.round((span + 2) / 5)); const pl = (span + 2) / n; const brand0 = Math.floor(rng() * 8);
      for (const v of [-0.68, 0.68]) for (let k = 0; k < n; k++) {
        const g = new THREE.PlaneGeometry(pl - 0.05, (pl - 0.05) / 4); tile(g, (brand0 + k) % 8); const c0 = W(-1 + pl * (k + 0.5), yDeck + 0.8, v);
        const sg = v > 0 ? 1 : -1; const mm = new THREE.Matrix4().makeBasis(_x.set(sg * tz, 0, -sg * tx), _y.set(0, 1, 0), _z.set(sg * tx, 0, sg * tz)).setPosition(c0[0], c0[1], c0[2]); g.applyMatrix4(mm); boards.push(g);
      }
      cx.reserve(s, 1, 5); cx.reserve(s, -1, 5); gantries++;
    }
    // concrete spectator walls with sponsor covers behind the tyre walls (corners without hoardings)
    let walls = 0;
    for (const side of [-1, 1]) {
      let lp = null;
      for (let s = 0; s < t.length; s += 4.2) {
        const i = t.idxAtS(s); if (!cx.tyreZone(i, side) || cx.inPit(s, side) || cx.isReserved(s, side) || (cx.F.sponsorWallCorners && !cx.cornerIn(cx.F.sponsorWallCorners, s))) { lp = null; continue; }   // data.furniture.sponsorWallCorners (Spa): only at these corners
        const p = cx.at(s, side, 3.1); if (lp && Math.hypot(p.x - lp.x, p.z - lp.z) < 3.9) continue; if (cx.inObstacle(p.x, p.z)) { lp = null; continue; } lp = p;
        frame(_m, p.x, p.y, p.z, side, p.tx, p.tz); const m = _m.clone();
        box(geos, 4.0, 1.25, 0.35, 0, 0.625, 0, C(0xc9c9c4), m); box(geos, 4.0, 0.1, 0.45, 0, 1.27, 0, C(0xb0b0aa), m);
        const g = new THREE.PlaneGeometry(3.8, 0.95); tile(g, Math.floor(s / 21) % 8); g.translate(0, 0.62, 0.19); g.applyMatrix4(m); boards.push(g); walls++;
      }
    }
    cx.static(geos, 0.5, 0.35, 'clutter', 'broadcast');
    if (boards.length && !cx.textured(boards, atlas, 'boards4', 1024, 128, 0.55)) { const bm = new THREE.Mesh(merge(boards), new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.55, side: THREE.DoubleSide })); bm.receiveShadow = true; cx.add(bm, 'infraBoards'); }
    Object.assign(cx.stats, { cameraScaffolds: scaff, cranes, gantries, sponsorWalls: walls });
  }

  // ---------------------------------------------------------------- 8a. worn, dusty band along the outside of corners between the run-off and the fence
  function buildDirtBands(cx) {
    const t = cx.t; const hw = t.halfWidth, kw = t.kerbWidth;
    const [c, ctx] = canvas(256, 256); ctx.clearRect(0, 0, 256, 256); const r = U.rng(55);
    // dead, dusty grass: soft patches, dense against the run-off edge (u = 0) and fading out towards the fence
    for (let i = 0; i < 700; i++) { const x = r() * 256, y = r() * 256; const a = (1 - U.smoothstep(40, 230, x)) * (0.08 + r() * 0.22); ctx.fillStyle = 'rgba(' + (96 + r() * 22 | 0) + ',' + (92 + r() * 18 | 0) + ',' + (58 + r() * 14 | 0) + ',' + a.toFixed(2) + ')'; ctx.beginPath(); ctx.ellipse(x, y, 10 + r() * 30, 5 + r() * 14, r() * 3, 0, 6.283); ctx.fill(); }
    for (let i = 0; i < 300; i++) { const x = r() * 120, y = r() * 256; ctx.fillStyle = 'rgba(84,72,44,' + (0.05 + r() * 0.1).toFixed(2) + ')'; ctx.fillRect(x, y, 1 + r() * 2, 6 + r() * 30); }
    const dirt = tex(c, true);
    const mat = new THREE.MeshStandardMaterial({ map: dirt, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, roughness: 1.0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    const brown = new THREE.Color(0x7d7a52), tmp = new THREE.Color(); let tris = 0;
    for (const side of [-1, 1]) {
      const run = side < 0 ? t.runoffL : t.runoffR, grav = side < 0 ? t.gravelL : t.gravelR, wall = side < 0 ? t.wallL : t.wallR;
      const inner = i => Math.min(hw + kw + 14, wall[i] - 0.4), mask = i => run[i] && !grav[i] && wall[i] - inner(i) > 3;
      const geo = t.ribbon(i => side * (inner(i) - 0.3), i => side * Math.min(inner(i) + 6.5, wall[i] - 0.5), { mask, y: -0.006, vScale: 6.5, colorFn: (i) => tmp.copy(brown).multiplyScalar(0.8 + U.noise2(i * 0.05, side * 3) * 0.4) });
      if (!geo.index || !geo.index.count) continue; tris += geo.index.count / 3;
      geo.computeBoundingSphere(); cx.add(new THREE.Mesh(geo, mat), 'dirtBand' + (side < 0 ? 'L' : 'R'));
    }
    cx.stats.dirtTris = tris;
  }

  // ---------------------------------------------------------------- 8b. paddock: team trucks and motorhomes behind the pit complex; campervans in the car-park fields
  function truck(geos, m, team) {
    const white = C(0xf4f4f2), dark = C(0x1b1d20), tyre = C(0x222326), chassis = C(0x3a3c40), prim = C(team.primary), sec = C(team.secondary === team.primary ? team.accent : team.secondary);
    box(geos, 13.6, 2.9, 2.55, -1.2, 2.55, 0, white, m); // trailer body
    box(geos, 13.65, 0.8, 2.6, -1.2, 3.05, 0, prim, m); box(geos, 13.65, 0.22, 2.6, -1.2, 2.45, 0, sec, m); // livery stripes
    box(geos, 12.6, 0.5, 2.3, -1.2, 0.95, 0, chassis, m); box(geos, 13.6, 0.08, 2.4, -1.2, 4.02, 0, C(0xd9dadc), m); // chassis and roof trim
    box(geos, 2.3, 2.5, 2.5, 6.9, 2.3, 0, white, m); box(geos, 1.0, 0.9, 2.52, 6.9, 2.7, 0, prim, m); box(geos, 0.3, 1.0, 2.2, 8.0, 2.85, 0, dark, m); box(geos, 2.0, 0.8, 2.5, 6.9, 1.35, 0, chassis, m); // cab, cab stripe, windscreen
    for (const x of [6.9, -3.0, -4.4]) box(geos, 1.0, 1.0, 2.5, x, 0.5, 0, tyre, m); // axles (wheel pairs as one block)
  }
  function motorhome(geos, m, team) {
    const white = C(0xf0f1f2), glass = C(0x4a6382), prim = C(team.primary), rail = C(0xa8adb3);
    box(geos, 15, 6.0, 7, 0, 3.0, 0, white, m); box(geos, 15.06, 1.5, 7.06, 0, 4.4, 0, glass, m); box(geos, 15.06, 1.1, 7.06, 0, 1.8, 0, glass, m); box(geos, 15.1, 0.5, 7.1, 0, 5.75, 0, prim, m);
    box(geos, 6, 2.6, 3.5, 0, 1.3, 5.2, white, m); box(geos, 6.04, 0.9, 3.54, 0, 1.6, 5.2, glass, m); // entrance pod
    for (const z of [-3.4, 3.4]) beam(geos, [-7.4, 6.0, z], [7.4, 6.0, z], 0.05, rail, m); for (let x = -7.4; x <= 7.4; x += 1.85) { beam(geos, [x, 6.0, -3.4], [x, 7.0, -3.4], 0.04, rail, m); beam(geos, [x, 6.0, 3.4], [x, 7.0, 3.4], 0.04, rail, m); } beam(geos, [-7.4, 7.0, -3.4], [7.4, 7.0, -3.4], 0.05, rail, m); beam(geos, [-7.4, 7.0, 3.4], [7.4, 7.0, 3.4], 0.05, rail, m);
  }
  function campervan(geos, m, color) {
    const white = C(0xf3f3f0), glass = C(0x3b4a5a), tyre = C(0x232426);
    box(geos, 6.2, 2.1, 2.3, 0, 1.75, 0, white, m); box(geos, 2.2, 1.6, 2.2, 2.6, 1.3, 0, white, m); box(geos, 6.24, 0.5, 2.34, 0, 1.75, 0, color, m);
    box(geos, 0.3, 0.8, 2.0, 3.6, 1.6, 0, glass, m); box(geos, 1.8, 0.6, 2.34, -1.5, 2.3, 0, glass, m); box(geos, 5.8, 0.3, 2.0, 0, 0.6, 0, C(0x333), m);
    for (const [x, z] of [[2.4, -1.0], [2.4, 1.0], [-1.6, -1.0], [-1.6, 1.0]]) { const g = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 8); g.rotateX(Math.PI / 2); g.translate(x, 0.36, z); g.applyMatrix4(m); g.userData.color = tyre; geos.push(g); }
  }
  function buildPaddock(cx) {
    const t = cx.t, sc = cx.sc, rng = U.rng(313); const pit = t.data.pit; if (!pit || pit.length < 3 || !sc.pitBox) return;
    const teams = EI.TEAMS || [{ primary: '#c00', secondary: '#111', accent: '#fff' }];
    const a = pit[Math.floor(pit.length * 0.2)], b = pit[Math.floor(pit.length * 0.8)]; const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const len = Math.hypot(dx, dz); dx /= len; dz /= len;
    const pr = t.project(mid[0], mid[1], null); const side = pr.lat > 0 ? 1 : -1; const nx = t.nx[pr.i] * side, nz = t.nz[pr.i] * side;
    const L = Math.min(len * 0.9, 320);
    const geos = []; let trucks = 0, homes = 0;
    // data.furniture.paddockSnap (COTA): the lowest drawn ground over a dense grid under the footprint, so a vehicle never hangs over a dip between the 5 corner / centre samples
    const snap = !!(cx.F && cx.F.paddockSnap && sc.env && sc.env.forestOn);
    const lowY = (x, z, ax, az, hl, hw, nl, nw) => { let lo = Infinity; for (let i = 0; i <= nl; i++) for (let j = 0; j <= nw; j++) { const a = (i / nl * 2 - 1) * hl, b = (j / nw * 2 - 1) * hw; lo = Math.min(lo, sc.height(x + ax * a - az * b, z + az * a + ax * b)); } return lo; };
    const place = (al, zo) => [mid[0] + dx * al + nx * zo, mid[1] + dz * al + nz * zo];
    const okSpot = (x, z) => { const p = t.project(x, z, null); return p.dist > Math.max(t.wallL[p.i], t.wallR[p.i]) + 12 && !cx.inObstacle(x, z, cx.obstacles); };
    // two rows of transporters nose-in towards the garages, then a row of hospitality motorhomes behind
    const rows = [[42, 0], [60, Math.PI]];
    for (const [zo, flip] of rows) for (let al = -L / 2 + 8; al < L / 2 - 8; al += 4.6) {
      const [x, z] = place(al, zo); if (!okSpot(x, z)) continue;
      // truck +x (nose) points along n, away from the garages, for the first row; the second row faces it across an aisle
      _q.setFromAxisAngle(_y, Math.atan2(-nz, nx) + flip + (rng() - 0.5) * 0.04); _p.set(x, (snap ? lowY(x, z, nx, nz, 8.1, 1.3, 12, 2) : cx.footY(x, z, nx, nz, 8, 1.25)) - 0.04, z); _s.set(1, 1, 1); _m.compose(_p, _q, _s);
      truck(geos, _m, teams[trucks % teams.length]); trucks++;
    }
    for (let al = -L / 2 + 10; al < L / 2 - 10; al += 19) {
      const [x, z] = place(al, 82); if (!okSpot(x, z)) continue;
      _q.setFromAxisAngle(_y, Math.atan2(-dz, dx)); _p.set(x, (snap ? lowY(x, z, dx, dz, 7.6, 7.1, 6, 6) : cx.footY(x, z, dx, dz, 7.5, 7)) - 0.05, z); _s.set(1, 1, 1); _m.compose(_p, _q, _s);
      motorhome(geos, _m, teams[homes % teams.length]); homes++;
    }
    cx.static(geos, 0.5, 0.1, 'main', 'paddock');
    cx.stats.trucks = trucks; cx.stats.motorhomes = homes;
  }
  function buildCarParks(cx) {
    const t = cx.t, sc = cx.sc, rng = U.rng(515); const geos = []; let vans = 0;
    const palette = [0xe63946, 0x457b9d, 0xffb703, 0x2a9d8f, 0x6a4c93, 0xf77f00, 0x1d3557, 0x8ecae6, 0x386641, 0xbc4749];
    // fields outside Copse, Hangar Straight, Wellington Straight and Abbey, 110-130 m beyond the fence
    const fields = cx.F.carParks || [[3300, 1, 125], [4700, 1, 120], [1650, -1, 115], [560, 1, 120], [3850, -1, 120], [2400, 1, 130]];
    const cellOf = sc.cellOf || (() => 0);
    // a field candidate scores by how many of its 12 x 5 bays are open grass in one farm field (no woods, buildings, hedgerow boundaries or the paddock)
    const bays = (s0, side, dist) => {
      const i = t.idxAtS(s0); const wall = side < 0 ? t.wallL[i] : t.wallR[i]; const cx0 = t.x[i] + t.nx[i] * side * (wall + dist), cz0 = t.z[i] + t.nz[i] * side * (wall + dist);
      const tx = t.tx[i], tz = t.tz[i], nx = t.nx[i] * side, nz = t.nz[i] * side; const cell = cellOf(cx0, cz0); const out = [];
      for (let r = 0; r < 5; r++) for (let c = 0; c < 12; c++) {
        const al = (c - 5.5) * 4.0, zo = (r - 2) * 11; const x = cx0 + tx * al + nx * zo, z = cz0 + tz * al + nz * zo;
        const p = t.project(x, z, null); if (p.dist < Math.max(t.wallL[p.i], t.wallR[p.i]) + 70) continue;
        if (cellOf(x, z) !== cell || cx.inObstacle(x, z, cx.obstacles) || (sc.pitBox && Math.hypot(x - sc.pitBox.cx, z - sc.pitBox.cz) < sc.pitBox.r + 40)) continue;
        out.push([x, z, tx, tz, nx, nz]);
      }
      return out;
    };
    for (const [s0, side, dist] of fields) {
      let best = [];
      for (const ds of [0, 90, -90, 180]) for (const dd of [0, 40, 80, -30]) { const b = bays(s0 + ds, side, dist + dd); if (b.length > best.length) best = b; if (best.length >= 55) break; }
      if (best.length < 30) continue;
      for (const [x, z, tx, tz, nx, nz] of best) {
        if (rng() < 0.12) continue;
        const jx = x + tx * (rng() - 0.5) * 0.6 + nx * (rng() - 0.5) * 1.5, jz = z + tz * (rng() - 0.5) * 0.6 + nz * (rng() - 0.5) * 1.5;
        _q.setFromAxisAngle(_y, Math.atan2(-nz, nx) + (rng() > 0.5 ? Math.PI : 0) + (rng() - 0.5) * 0.15); _p.set(jx, sc.height(jx, jz) - 0.05, jz); _s.set(1, 1, 1); _m.compose(_p, _q, _s);
        campervan(geos, _m, C(palette[Math.floor(rng() * palette.length)])); vans++;
      }
    }
    cx.static(geos, 0.55, 0.1, 'clutter', 'carParks');
    cx.stats.campervans = vans;
  }

  function splitNearFar(cx, inst) {
    const Env = EI.Env; const n = inst.count, a = inst.instanceMatrix.array; const g0 = inst.geometry;
    const iattrs = Object.keys(g0.attributes).filter(k => g0.attributes[k].isInstancedBufferAttribute);
    const strides = [16].concat(inst.instanceColor ? [3] : [], iattrs.map(k => g0.attributes[k].itemSize));
    const set = new Env.CellSet(strides, 80);
    for (let i = 0; i < n; i++) {
      const recs = [Array.from(a.subarray(i * 16, i * 16 + 16))]; if (inst.instanceColor) recs.push(Array.from(inst.instanceColor.array.subarray(i * 3, i * 3 + 3)));
      for (const k of iattrs) { const at = g0.attributes[k]; recs.push(Array.from(at.array.subarray(i * at.itemSize, (i + 1) * at.itemSize))); }
      set.push(a[i * 16 + 12], a[i * 16 + 14], recs);
    }
    set.finalize();
    const make = (name, shadow) => {
      const g = new THREE.BufferGeometry(); g.index = g0.index; for (const k in g0.attributes) if (iattrs.indexOf(k) < 0) g.setAttribute(k, g0.attributes[k]);
      const ia = iattrs.map(k => { const at = new THREE.InstancedBufferAttribute(new Float32Array(n * g0.attributes[k].itemSize), g0.attributes[k].itemSize); at.setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, at); return at; });
      const m = new THREE.InstancedMesh(g, inst.material, n); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); if (inst.instanceColor) { m.setColorAt(0, _c.setRGB(1, 1, 1)); m.instanceColor.setUsage(THREE.DynamicDrawUsage); }
      m.count = 0; m.frustumCulled = false; m.castShadow = shadow; m.receiveShadow = inst.receiveShadow; m.customDepthMaterial = inst.customDepthMaterial; m.name = name; cx.group.add(m);
      const dyn = new Env.DynSet(set, [m.instanceMatrix].concat(inst.instanceColor ? [m.instanceColor] : [], ia), (k) => { m.count = k; m.visible = k > 0; }, shadow ? 30 : 60);
      return dyn;
    };
    const far = make(inst.name, false), near = make(inst.name + 'Near', inst.castShadow);
    cx.group.remove(inst);
    return { name: inst.name, far, near, count: n };
  }

  // ---------------------------------------------------------------- 1c. Dia de Muertos dressing (opt-in: data.furniture.fiesta, Mexico City; MEX-DRESS)
  // poles behind the board band with papel picado strings (8 pennant colours), marigold garlands and tricolour flags between / on them, plus calavera panels
  // (marigold frame, skull). One vertex-coloured geometry on the statics 'clutter' layer (no texture, no new program); everything stands on the drawn ground, at least
  // 3 m behind the wall, skips stands / reserved spots / the corridor, and never crosses the lap. Pennants face the track (single-sided).
  function buildFiesta(cx) {
    const t = cx.t, FI = cx.F.fiesta; if (!FI) return;
    const pos = [], nrm = [], col = [];
    const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();
    // a quad (4 world points, any order of a convex fan) facing `face` (x, z): the winding is flipped so the normal points that way
    function quad(p0, p1, p2, p3, color, fx, fz) {
      _a.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]); _b.set(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]); _n.crossVectors(_a, _b).normalize();
      const flip = _n.x * fx + _n.z * fz < 0; const tri = flip ? [[p0, p2, p1], [p0, p3, p2]] : [[p0, p1, p2], [p0, p2, p3]]; if (flip) _n.negate();
      for (const [a, b, c] of tri) for (const p of [a, b, c]) { pos.push(p[0], p[1], p[2]); nrm.push(_n.x, _n.y, _n.z); col.push(color.r, color.g, color.b); }
    }
    const tri3 = (p0, p1, p2, color, fx, fz) => { _a.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]); _b.set(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]); _n.crossVectors(_a, _b).normalize(); const flip = _n.x * fx + _n.z * fz < 0; if (flip) _n.negate(); for (const p of flip ? [p0, p2, p1] : [p0, p1, p2]) { pos.push(p[0], p[1], p[2]); nrm.push(_n.x, _n.y, _n.z); col.push(color.r, color.g, color.b); } };
    const PP = [0xb83a68, 0xd97a1c, 0x6a3f93, 0x2f8a52, 0xe0b82a, 0x2a9aa0, 0xb8262f, 0x2f5fa8].map(C);
    const MG = [0xdc7a14, 0xe9a31c, 0xcf6a10, 0xefb92a].map(C);
    const GREEN = C(0x0b6b47), WHITE = C(0xd2d4d1), RED = C(0xc0202f), POLE = C(0x5a5e63), CREAM = C(0xd8d0bb), INDIGO = C(0x232d5b), PLUM = C(0x4a2a5e), DARK = C(0x1a1a20), PINK = C(0xb83a68);
    // a vertical prism pole (4 sides) from y0 to y1
    function pole(x, z, y0, y1, th) { const h = th / 2; const c = [[x - h, z - h], [x + h, z - h], [x + h, z + h], [x - h, z + h]]; for (let k = 0; k < 4; k++) { const a = c[k], b = c[(k + 1) % 4]; quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], POLE, (a[0] + b[0]) / 2 - x, (a[1] + b[1]) / 2 - z); } }
    let spans = 0, flags = 0, panels = 0; const step = FI.step || 18; const HP = 5.6;
    const near = (s) => { for (const b of FI.avoid || []) { let d = Math.abs(U.mod(s - b, t.length)); d = Math.min(d, t.length - d); if (d < (FI.avoidHalf || 12)) return true; } return false; };   // keep clear of the footbridge legs
    for (const [s0, s1, side, kinds] of FI.runs || []) {
      const want = kinds.split(','); const span = U.mod(s1 - s0, t.length); const pts = [];
      for (let u = 0, k = 0; u <= span; u += step, k++) {
        const s = U.mod(s0 + u, t.length), i = t.idxAtS(s); const p = cx.at(s, side, 3.4);
        const ok = !near(s) && !cx.inObstacle(p.x, p.z) && !cx.inObstacle(p.x - p.nx * 4, p.z - p.nz * 4) && !cx.isReserved(s, side) && !cx.inCorridor(p.x, p.z) && !(cx.inPit(s, side));
        if (!ok) { pts.push(null); continue; }
        const g = cx.ground(p.x, p.z); pts.push({ x: p.x, z: p.z, g, nx: -p.nx, nz: -p.nz, tx: p.tx, tz: p.tz, k });
      }
      pts.forEach((q, j) => {
        if (!q) return;
        const tall = want.indexOf('flag') >= 0 && q.k % 3 === 0;
        pole(q.x, q.z, q.g - 0.05, q.g + (tall ? 7.4 : HP + 0.3), 0.14);
        if (tall) { flags++;   // a tricolour flag along the lap direction at the top of the pole, facing the track
          const y1 = q.g + 7.4, y0 = y1 - 1.35, w = 2.2, e = 0.05; const X = (a) => q.x + q.tx * (e + a), Zc = (a) => q.z + q.tz * (e + a);
          [GREEN, WHITE, RED].forEach((c, m) => quad([X(m * w / 3), y0, Zc(m * w / 3)], [X((m + 1) * w / 3), y0, Zc((m + 1) * w / 3)], [X((m + 1) * w / 3), y1, Zc((m + 1) * w / 3)], [X(m * w / 3), y1, Zc(m * w / 3)], c, q.nx, q.nz)); }
        const r = pts[j + 1]; if (!r) return;
        // never chord across the lap (a pole on the far side of a tight bend): the chord must stay behind the wall line
        const mid = [(q.x + r.x) / 2, (q.z + r.z) / 2]; if (cx.inCorridor(mid[0], mid[1]) || cx.inObstacle(mid[0], mid[1])) return;
        const L0 = Math.hypot(r.x - q.x, r.z - q.z); if (L0 > step * 1.6) return;
        const yA = q.g + HP, yB = r.g + HP; spans++;
        const at = (u) => [q.x + (r.x - q.x) * u, yA + (yB - yA) * u - (want.indexOf('mg') >= 0 && want.indexOf('pp') < 0 ? 1.15 : 0.7) * 4 * u * (1 - u), q.z + (r.z - q.z) * u];
        if (want.indexOf('pp') >= 0) { const nr = Math.max(2, Math.round(L0 / 3)); for (let m = 0; m < nr; m++) { const a = at(m / nr), b = at((m + 1) / nr); quad([a[0], a[1], a[2]], [b[0], b[1], b[2]], [b[0], b[1] + 0.06, b[2]], [a[0], a[1] + 0.06, a[2]], POLE, q.nx, q.nz); }   // the string itself, pole to pole
          const n = Math.max(5, Math.round(L0 / 1.45)); for (let m = 0; m < n; m++) { const a = at(m / n + 0.004), b = at((m + 1) / n - 0.004), hh = 0.62 + 0.16 * ((m * 7 + q.k * 3) % 3) / 2; const c = PP[(m + q.k * 3) % PP.length];
          quad([a[0], a[1], a[2]], [b[0], b[1], b[2]], [b[0], b[1] - hh, b[2]], [a[0], a[1] - hh, a[2]], c, q.nx, q.nz); } }
        else if (want.indexOf('mg') >= 0) { const n = Math.max(7, Math.round(L0 / 1.2)); for (let m = 0; m < n; m++) { const a = at(m / n), b = at((m + 1) / n); const c = MG[(m + q.k) % MG.length], hh = 0.3 + 0.08 * (m % 2);
          quad([a[0], a[1] + 0.05, a[2]], [b[0], b[1] + 0.05, b[2]], [b[0], b[1] - hh, b[2]], [a[0], a[1] - hh, a[2]], c, q.nx, q.nz); } }
      });
    }
    // calavera panels: a marigold frame round an indigo board with a cream skull (2.4 x 3.6 m board on two poles, 1.1 m off the ground)
    for (const [s0, w] of FI.panels || []) {
      const side = w === 'out' ? cx.outsideSide(t.idxAtS(s0 + 20)) : w; const p = cx.freeSpot(s0, side, 3.6, 2.2, 1.2, 45); if (!p || near(p.s)) continue;
      const gy = Math.min(cx.ground(p.x, p.z), cx.ground(p.x + p.tx * 1.9, p.z + p.tz * 1.9), cx.ground(p.x - p.tx * 1.9, p.z - p.tz * 1.9));
      const fx = -p.nx, fz = -p.nz; const P = (u, v, d) => [p.x + p.tx * u + fx * (d || 0), gy + 1.1 + v, p.z + p.tz * u + fz * (d || 0)];   // u along the lap, v up from the board's bottom edge
      const W2 = 1.8, H = 2.4; cx.reserve(p.s, side, 4);
      pole(p.x + p.tx * 1.2, p.z + p.tz * 1.2, gy - 0.05, gy + 1.2, 0.12); pole(p.x - p.tx * 1.2, p.z - p.tz * 1.2, gy - 0.05, gy + 1.2, 0.12);
      quad(P(-W2, 0, 0), P(W2, 0, 0), P(W2, H, 0), P(-W2, H, 0), INDIGO, fx, fz); quad(P(-W2, 0, -0.04), P(W2, 0, -0.04), P(W2, H, -0.04), P(-W2, H, -0.04), INDIGO, -fx, -fz);
      const d1 = 0.02, fr = 0.16;   // marigold frame
      quad(P(-W2, 0, d1), P(W2, 0, d1), P(W2, fr, d1), P(-W2, fr, d1), MG[0], fx, fz); quad(P(-W2, H - fr, d1), P(W2, H - fr, d1), P(W2, H, d1), P(-W2, H, d1), MG[0], fx, fz);
      quad(P(-W2, 0, d1), P(-W2 + fr, 0, d1), P(-W2 + fr, H, d1), P(-W2, H, d1), MG[0], fx, fz); quad(P(W2 - fr, 0, d1), P(W2, 0, d1), P(W2, H, d1), P(W2 - fr, H, d1), MG[0], fx, fz);
      const disc = (cu, cv, r, n, c, d) => { for (let k = 0; k < n; k++) { const a0 = k / n * 6.2832, a1 = (k + 1) / n * 6.2832; tri3(P(cu, cv, d), P(cu + Math.cos(a0) * r * 0.85, cv + Math.sin(a0) * r, d), P(cu + Math.cos(a1) * r * 0.85, cv + Math.sin(a1) * r, d), c, fx, fz); } };
      disc(0, 1.45, 0.78, 10, CREAM, 0.04);                                     // skull
      quad(P(-0.42, 0.52, 0.04), P(0.42, 0.52, 0.04), P(0.42, 0.95, 0.04), P(-0.42, 0.95, 0.04), CREAM, fx, fz);   // jaw
      disc(-0.3, 1.55, 0.2, 6, DARK, 0.06); disc(0.3, 1.55, 0.2, 6, DARK, 0.06);       // eye sockets
      tri3(P(-0.09, 1.28, 0.06), P(0.09, 1.28, 0.06), P(0, 1.45, 0.06), DARK, fx, fz);   // nose
      for (let k = -1; k <= 1; k++) quad(P(k * 0.2 - 0.014, 0.58, 0.06), P(k * 0.2 + 0.014, 0.58, 0.06), P(k * 0.2 + 0.014, 0.84, 0.06), P(k * 0.2 - 0.014, 0.84, 0.06), DARK, fx, fz);   // teeth
      disc(-0.52, 1.18, 0.1, 5, PINK, 0.06); disc(0.52, 1.18, 0.1, 5, PINK, 0.06); disc(0, 2.0, 0.1, 5, MG[3], 0.06);   // cheek flowers, a marigold on the brow
      for (const u of [-1.2, 1.2]) disc(u, 0.4, 0.14, 5, MG[1], 0.04);   // marigold border
      for (const u of [-1.2, 1.2]) disc(u, 2.0, 0.14, 5, PLUM, 0.04);
      panels++; (cx.stats.fiestaPanelAt = cx.stats.fiestaPanelAt || []).push([Math.round(p.s), side]);
    }
    if (!pos.length) return;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    if (cx.sc.statics) cx.sc.statics.add(geo, 0.85, 0.0, 'clutter'); else { const m = new THREE.Mesh(geo, stdMat({ roughness: 0.85, metalness: 0 })); m.castShadow = true; m.receiveShadow = true; cx.add(m, 'fiesta'); }
    Object.assign(cx.stats, { fiestaTris: pos.length / 9, fiestaSpans: spans, fiestaFlags: flags, fiestaPanels: panels });
  }

  // ---------------------------------------------------------------- build
  // trackside spots the environment keeps free of grandstands: [s, side (0 = both), half-length]
  Infra.SPOTS = [[3040, 0, 18], [4990, 0, 18], [2190, 0, 18], [350, 0, 18], [3160, 0, 8], [3900, 0, 8], [5075, 0, 8], [5705, 0, 8], [2010, 0, 8], [965, 0, 8], [460, 0, 8]];
  Infra.build = function (track, scenery) {
    const cx = new Ctx(track, scenery);
    // street circuits draw their own rails, block barriers, tyre walls and catch-fence posts (track.js) and have no grass to wear
    const street = !!track.data.street;
    if (!street) buildTyreStacks(cx);
    buildScreens(cx);
    buildBillboards(cx);
    buildCameraTowers(cx);
    buildMarshalPosts(cx);
    buildBroadcast(cx);
    if (!street) buildHoardings(cx);
    if (!street && !(track.data.fence && track.data.fence.posts)) buildFencePosts(cx);   // Monza: track.js already plants the catch-fence posts (data.fence.posts)
    if (!street) buildDirtBands(cx);
    buildPaddock(cx);
    if (cx.F.fiesta) buildFiesta(cx);   // opt-in (Mexico City: Dia de Muertos dressing); no other track sets data.furniture.fiesta
    // the lap-long instanced families are cut into ~600 m tiles with fitted bounds, so the camera and (above all) the shadow
    // camera only draw the tiles they can see instead of every board / post / tyre of the lap
    // lap-long instanced families: one mesh draws everything beyond ~100 m of the eye (no shadows, dropped beyond the tier's
    // clutter distance) and a small near set within ~200 m casts the shadows - the shadow pass no longer draws the whole lap
    cx.sc.nearFar = cx.sc.nearFar || [];
    for (const nm of ['tyreStacks', 'tecPro', 'hoardings', 'hoardingPosts', 'fencePosts', 'fenceRails']) { const o = cx.group.getObjectByName(nm); if (o && o.isInstancedMesh) cx.sc.nearFar.push(splitNearFar(cx, o)); }
    // triangle budget bookkeeping (instances x geometry)
    let tris = 0, draws = 0; cx.group.traverse(o => { if (!o.isMesh) return; draws++; const g = o.geometry; const n = g.index ? g.index.count : g.attributes.position.count; tris += (n / 3) * (o.isInstancedMesh ? o.count : 1); });
    cx.stats.triangles = Math.round(tris); cx.stats.meshes = draws;
    scenery.infraStats = cx.stats; scenery.infra = cx;
    return cx.group;
  };
  EI.Infra = Infra;
})();
