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
      // pit lane side and range (hoardings and screens stay off the pit wall side of the start straight)
      const pit = t.data.pit; const pm = t.project(pit[Math.floor(pit.length / 2)][0], pit[Math.floor(pit.length / 2)][1], null);
      this.pitSide = pm.lat > 0 ? 1 : -1; this.pitS0 = t.project(pit[0][0], pit[0][1], null).s; this.pitS1 = t.project(pit[pit.length - 1][0], pit[pit.length - 1][1], null).s;
      this.polys = []; for (const g of t.data.scenery.grandstands) this.polys.push(g.p); for (const b of t.data.scenery.buildings) if (b.p.length >= 3 && Math.abs(U.polyArea(b.p)) >= 60) this.polys.push(b.p);
      if (scenery.env && scenery.env.standPolys) for (const p of scenery.env.standPolys) this.polys.push(p);
      this.obstacles = this.polys.concat(t.data.scenery.woods, t.data.scenery.water);
      this.tyreCorners = ['Copse', 'Stowe', 'Club', 'Village', 'Vale', 'Brooklands', 'Luffield'];
    }
    inPit(s, side) { const L = this.t.length; return side === this.pitSide && U.mod(s - this.pitS0, L) < U.mod(this.pitS1 - this.pitS0, L); }
    outsideSide(i) { return this.kk[i] > 0 ? -1 : 1; } // k > 0 turns towards +lat, so the outside is the -1 side
    inCorner(i) { return Math.abs(this.kk[i]) > 1 / 600; }
    tyreZone(i, side) { return this.inCorner(i) && this.tyreCorners.indexOf(this.cornerAt(this.t.s[i])) >= 0 && side === this.outsideSide(i); }
    reserve(s, side, half) { this.reserved.push([s, side, half]); }
    isReserved(s, side) { const L = this.t.length; for (const r of this.reserved) { if (r[1] !== side) continue; let d = Math.abs(s - r[0]); d = Math.min(d, L - d); if (d < r[2]) return true; } return false; }
    // interpolated point at distance s, lateral wall+off on `side` (y follows the track; the verge ribbon is at track level out to wall+40)
    at(s, side, off) {
      const t = this.t; const f = U.mod(s / t.ds, t.n); const i = Math.floor(f), j = (i + 1) % t.n, u = f - i;
      const wall = side < 0 ? U.lerp(t.wallL[i], t.wallL[j], u) : U.lerp(t.wallR[i], t.wallR[j], u); let d = wall + off;
      // inside of a corner: never place anything beyond the local radius (the normals cross there)
      if (t.kFold) { const kf = t.kFold[i]; if ((kf > 0 && side > 0) || (kf < 0 && side < 0)) d = Math.min(d, Math.max(2, 0.88 / (Math.abs(kf) + 1e-6))); }
      return { x: U.lerp(t.x[i], t.x[j], u) + t.nx[i] * side * d, y: U.lerp(t.y[i], t.y[j], u) - 0.03, z: U.lerp(t.z[i], t.z[j], u) + t.nz[i] * side * d, tx: t.tx[i], tz: t.tz[i], nx: t.nx[i] * side, nz: t.nz[i] * side, i, wall, d };
    }
    // ground height for anything: verge level near the track, terrain beyond
    ground(x, z) { return this.sc.height(x, z); }
    inObstacle(x, z, list) { for (const p of list || this.polys) if (U.pointInPoly(x, z, p)) return true; return false; }
    // find a trackside spot of half-length `half` and depth `depth` beyond the wall that overlaps no stand/building; walks along s in both directions
    freeSpot(s, side, off, half, depth) {
      for (const ds of [0, 15, -15, 30, -30, 45, -45, 60, -60, 80, -80, 100, -100]) {
        const p = this.at(s + ds, side, off); let ok = !this.inPit(s + ds, side) && !this.isReserved(s + ds, side);
        for (const [a, b] of [[-half, 0], [half, 0], [-half, depth], [half, depth], [0, depth / 2]]) { const x = p.x + p.tx * a + p.nx * b, z = p.z + p.tz * a + p.nz * b; if (this.inObstacle(x, z)) { ok = false; break; } }
        if (ok) { p.s = s + ds; return p; }
      }
      return null;
    }
    add(mesh, name) { mesh.name = name || mesh.name; this.group.add(mesh); return mesh; }
  }

  // ---------------------------------------------------------------- 1. advertising hoardings
  const BRANDS = [
    ['EQUATION I', '#e10600', '#ffffff'], ['EI', '#ffffff', '#e10600', 'bars'], ['DRS', '#1a73e8', '#ffffff'], ['EIRELLI', '#ffd500', '#111111'],
    ['SILVERSTONE', '#0b3d2e', '#ffffff'], ['KINETIK', '#0e0e0e', '#00e701'], ['VECTOR', '#1434cb', '#ffffff'], ['APEX FUELS', '#f2f2f2', '#0c2b63', 'stripe'],
  ];
  function paintBrand(ctx, x, y, w, h, b, size) {
    ctx.fillStyle = b[1]; ctx.fillRect(x, y, w, h);
    if (b[3] === 'bars') { ctx.fillStyle = '#111'; ctx.fillRect(x, y, w * 0.06, h); ctx.fillRect(x + w * 0.94, y, w * 0.06, h); }
    if (b[3] === 'stripe') { ctx.fillStyle = '#c8102e'; ctx.fillRect(x, y + h * 0.78, w, h * 0.1); }
    ctx.fillStyle = b[2]; ctx.font = 'italic 900 ' + size + 'px Arial Black, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(b[0], x + w / 2, y + h * 0.48);
  }
  Infra.hoardingAtlas = function () {
    const [c, ctx] = canvas(2048, 256);
    BRANDS.forEach((b, k) => { const x = (k % 4) * 512, y = Math.floor(k / 4) * 128; paintBrand(ctx, x, y, 512, 128, b, b[0].length > 8 ? 52 : 68); ctx.fillStyle = '#2a2d31'; ctx.fillRect(x, y + 120, 512, 8); });
    return tex(c);
  };
  function buildHoardings(cx) {
    const t = cx.t, rng = U.rng(901);
    const atlas = Infra.hoardingAtlas();
    const geo = new THREE.BoxGeometry(5.0, 1.0, 0.08); const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) { if (i >= 16 && i < 20) uv.setXY(i, uv.getX(i), 0.08 + uv.getY(i) * 0.9); else uv.setXY(i, 0.5, 0.03); }
    const spots = [];
    for (const side of [-1, 1]) {
      for (let s = 0; s < t.length - 5; s += 5.35) {
        const i = t.idxAtS(s + 2.6);
        if (cx.tyreZone(i, side) || cx.inPit(s + 2.6, side) || cx.isReserved(s + 2.6, side)) continue;
        if (rng() < 0.05) continue;
        spots.push([s + 2.6, side]);
      }
    }
    const mat = stdMat({ map: atlas, vertexColors: false, roughness: 0.55, metalness: 0.0 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 tileOff;').replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_UV\n\tvUv = vUv * vec2(0.25, 0.5) + tileOff;\n#endif');
    };
    mat.customProgramCacheKey = () => 'hoarding';
    const inst = new THREE.InstancedMesh(geo, mat, spots.length);
    const tiles = new Float32Array(spots.length * 2);
    const leg = (x) => { const g = new THREE.CylinderGeometry(0.07, 0.07, 2.05, 4, 1, true); g.rotateY(Math.PI / 4); g.translate(x, 1.025, -0.1); g.userData.color = C(0x2a2d31); return g; };
    const postGeo = merge([leg(-2.3), leg(2.3)]);
    const posts = new THREE.InstancedMesh(postGeo, stdMat({ roughness: 0.6, metalness: 0.4 }), spots.length);
    let brand = 0, run = 0;
    // drop boards that would overlap the previous one on the same side (the clamped line on the inside of hairpins bunches up)
    const last = {}; const kept = [];
    for (const sp of spots) { const p = cx.at(sp[0], sp[1], 1.9); const l = last[sp[1]]; if (l && Math.hypot(p.x - l.x, p.z - l.z) < 4.8) continue; last[sp[1]] = p; kept.push(sp); }
    spots.length = 0; spots.push(...kept);
    inst.count = spots.length; posts.count = spots.length;
    spots.forEach((sp, k) => {
      const p = cx.at(sp[0], sp[1], 1.9);
      frame(_m, p.x, p.y, p.z, sp[1], p.tx, p.tz); posts.setMatrixAt(k, _m);
      _m.multiply(new THREE.Matrix4().makeTranslation(0, 1.5, 0)); inst.setMatrixAt(k, _m);
      // brands come in runs of 3-6 identical boards, like real sponsor blocks
      if (run-- <= 0) { brand = Math.floor(rng() * BRANDS.length); run = 1 + Math.floor(rng() * 4); }
      tiles[k * 2] = (brand % 4) * 0.25; tiles[k * 2 + 1] = 0.5 - Math.floor(brand / 4) * 0.5;
    });
    geo.setAttribute('tileOff', new THREE.InstancedBufferAttribute(tiles, 2));
    inst.castShadow = true; inst.receiveShadow = true; posts.castShadow = true;
    cx.add(inst, 'hoardings'); cx.add(posts, 'hoardingPosts'); cx.stats.hoardings = spots.length;
  }

  // ---------------------------------------------------------------- 2. debris-fence posts and top rail
  function buildFencePosts(cx) {
    const t = cx.t; const n = t.n;
    const postGeo = new THREE.CylinderGeometry(0.1, 0.1, 3.6, 4, 1, true); postGeo.rotateY(Math.PI / 4); postGeo.translate(0, 1.8, 0);
    const railGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 4, 1, true); railGeo.rotateZ(Math.PI / 2); railGeo.translate(0.5, 3.44, 0);
    const mat = stdMat({ vertexColors: false, color: 0x4d5258, roughness: 0.5, metalness: 0.5 });
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
  }

  // ---------------------------------------------------------------- 3. tyre stacks at the big braking zones
  function buildTyreStacks(cx) {
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
        const i = t.idxAtS(s); if (!cx.tyreZone(i, side)) { run = 0; lp = null; continue; }
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
      // right-hand side: live picture placeholder with a big EI mark
      ctx.fillStyle = '#263b2a'; ctx.fillRect(560, 100, 424, 300); ctx.fillStyle = '#6e6e73'; ctx.fillRect(560, 330, 424, 70); ctx.fillStyle = '#3f7a33'; ctx.fillRect(560, 100, 424, 230);
      ctx.fillStyle = '#e10600'; ctx.fillRect(590, 120, 90, 34); ctx.fillStyle = '#fff'; ctx.font = '900 22px Arial'; ctx.textAlign = 'center'; ctx.fillText('LIVE', 635, 138);
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = 'italic 900 150px Arial Black, Arial'; ctx.fillText('EI', 772, 265);
      ctx.fillStyle = '#fff'; ctx.font = '700 30px Arial'; ctx.textAlign = 'left'; ctx.fillText('SILVERSTONE  ·  GRAND PRIX', 560, 450); ctx.fillStyle = '#9fb3d1'; ctx.font = '500 24px Arial'; ctx.fillText('DRS ENABLED   ·   TRACK TEMP 31°C', 560, 495);
    } else {
      ctx.fillStyle = '#e10600'; ctx.fillRect(0, 0, 1024, 576); const g2 = ctx.createLinearGradient(0, 0, 0, 576); g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,0.45)'); ctx.fillStyle = g2; ctx.fillRect(0, 0, 1024, 576);
      ctx.fillStyle = '#fff'; ctx.font = 'italic 900 230px Arial Black, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('EI', 512, 230);
      ctx.font = 'italic 900 64px Arial Black, Arial'; ctx.fillText('EQUATION I', 512, 410); ctx.font = '700 34px Arial'; ctx.fillStyle = '#ffd1cf'; ctx.fillText('BRITISH GRAND PRIX  ·  SILVERSTONE', 512, 480);
    }
    return tex(c);
  };
  function buildScreens(cx) {
    const t = cx.t; const frames = [], screens = [[], []];
    const steel = C(0x9ba1a8), dark = C(0x15171a), rail = C(0x6b7178);
    const want = [[3040, 'out'], [4990, 'out'], [2190, 'out'], [t.sf + 90, 'nonpit']];
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
      const sg = new THREE.PlaneGeometry(12, 6.75); sg.translate(0, 8.55, 0.59); sg.applyMatrix4(m); screens[placed % 2].push(sg);
      cx.reserve(p.s, side, 9); placed++;
    });
    if (!frames.length) return;
    const fm = new THREE.Mesh(merge(frames), stdMat({ roughness: 0.45, metalness: 0.5 })); fm.castShadow = true; fm.receiveShadow = true; cx.add(fm, 'screenFrames');
    screens.forEach((list, k) => { if (!list.length) return; const m = new THREE.Mesh(merge(list), new THREE.MeshBasicMaterial({ map: Infra.broadcastTexture(k === 0 ? 'timing' : 'logo') })); cx.add(m, 'screen' + k); });
    cx.stats.screens = placed;
  }
  function buildCameraTowers(cx) {
    const t = cx.t; const geos = []; const steel = C(0x8d9298), dark = C(0x33363b), cam = C(0x1a1b1e);
    const want = [[3160, 1], [3900, 1], [5075, 1], [5705, -1], [2010, 1], [965, 1], [460, 1]];
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
      box(geos, 0.55, 1.0, 0.4, 0.75, H + 1.75, -0.2, C(0x5a4a3a), m); // the operator
      cyl(geos, 0.16, 0.16, 0.3, 6, 0.75, H + 2.45, -0.2, C(0xe2c3a8), m);
      cx.reserve(p.s, side, 4); placed++;
    }
    if (!geos.length) return;
    const mesh = new THREE.Mesh(merge(geos), stdMat({ roughness: 0.5, metalness: 0.5 })); mesh.castShadow = true; cx.add(mesh, 'cameraTowers'); cx.stats.cameraTowers = placed;
  }

  // ---------------------------------------------------------------- 6. marshal posts with booths, flag marshals, number boards and LED panels
  function marshalTexture() {
    const [c, ctx] = canvas(128, 128); ctx.clearRect(0, 0, 128, 128);
    const figure = (x, flag) => {
      ctx.fillStyle = '#f4f4f0'; ctx.beginPath(); ctx.arc(x, 16, 9, 0, 6.283); ctx.fill(); // helmet/hat
      ctx.fillStyle = '#e8b592'; ctx.fillRect(x - 5, 20, 10, 7);
      ctx.fillStyle = '#ff6a00'; ctx.fillRect(x - 12, 27, 24, 42); ctx.fillRect(x - 10, 69, 8, 40); ctx.fillRect(x + 2, 69, 8, 40);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 12, 40, 24, 4); ctx.fillRect(x - 12, 60, 24, 4);
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x - 10, 108, 8, 8); ctx.fillRect(x + 2, 108, 8, 8);
      if (flag) { ctx.fillStyle = '#ff6a00'; ctx.fillRect(x + 10, 10, 5, 30); ctx.fillStyle = '#5a4a3a'; ctx.fillRect(x + 13, 0, 2, 22); ctx.fillStyle = '#ffd500'; ctx.beginPath(); ctx.moveTo(x + 15, 2); ctx.lineTo(x + 46, 8); ctx.lineTo(x + 42, 30); ctx.lineTo(x + 15, 22); ctx.fill(); }
      else { ctx.fillStyle = '#ff6a00'; ctx.fillRect(x - 17, 28, 5, 32); ctx.fillRect(x + 12, 28, 5, 32); }
    };
    figure(28, true); figure(90, false);
    return tex(c);
  }
  function numberAtlas() {
    const [c, ctx] = canvas(512, 768);
    for (let k = 0; k < 24; k++) { const x = (k % 4) * 128, y = Math.floor(k / 4) * 128; ctx.fillStyle = '#f6f6f2'; ctx.fillRect(x, y, 128, 128); ctx.fillStyle = '#111'; ctx.fillRect(x, y, 128, 6); ctx.fillRect(x, y + 122, 128, 6); ctx.font = '900 92px Arial Black, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(k + 1), x + 64, y + 66); }
    return tex(c);
  }
  function buildMarshalPosts(cx) {
    const t = cx.t; const geos = [], boards = [], marshalsA = [], marshalsB = [];
    const white = C(0xf2f2ee), orange = C(0xff6a00), dark = C(0x1e2024), grey = C(0xcfd0cc), led = C(0x2c2f34), post = C(0x3a3d42);
    const seen = {}; let num = 0;
    for (const c of t.data.corners) {
      if (/Straight/i.test(c.name) || seen[c.name]) continue; seen[c.name] = true;
      const i = t.idxAtS(c.s + 30); const side = cx.outsideSide(i);
      const p = cx.freeSpot(c.s - 28, side, 2.6, 3, 3); if (!p) continue;
      frame(_m, p.x, p.y, p.z, side, p.tx, p.tz); const m = _m.clone(); num++;
      // raised post: concrete plinth, low wall in front, hut on top with an orange band, dark window strip and a roof slab
      box(geos, 3.2, 1.0, 3.2, 0, 0.5, 0, C(0xb9b9b4), m); box(geos, 3.4, 0.9, 0.3, 0, 1.45, 1.5, grey, m); box(geos, 0.3, 0.9, 3.2, -1.55, 1.45, 0, grey, m);
      box(geos, 2.4, 2.1, 2.0, 0, 2.05, -0.2, white, m); box(geos, 2.44, 0.34, 2.04, 0, 3.1, -0.2, orange, m); box(geos, 2.1, 0.55, 0.1, 0, 2.55, 0.82, dark, m); box(geos, 0.08, 0.55, 2.0, 1.2, 2.55, -0.2, dark, m);
      box(geos, 2.9, 0.12, 2.5, 0, 3.33, -0.2, grey, m); box(geos, 2.6, 0.12, 0.3, 0, 3.1, -1.3, orange, m);
      // number board on a post beside the hut
      box(geos, 0.08, 3.4, 0.08, 1.9, 1.7, 0.3, post, m);
      const b = new THREE.PlaneGeometry(0.9, 0.9); const uv = b.attributes.uv; const k = (num - 1) % 24; for (let v = 0; v < uv.count; v++) uv.setXY(v, (k % 4 + uv.getX(v)) / 4, 1 - (Math.floor(k / 4) + 1 - uv.getY(v)) / 6); b.translate(1.9, 3.75, 0.36); b.applyMatrix4(m); boards.push(b);
      // LED flag panel just behind the fence line, ahead of the post
      const lp = cx.at(p.s + 14, side, 1.4); frame(_m, lp.x, lp.y, lp.z, side, lp.tx, lp.tz); const lm = _m.clone();
      box(geos, 0.12, 2.3, 0.12, 0, 1.15, 0, post, lm); box(geos, 1.1, 0.75, 0.2, 0, 2.5, 0.05, dark, lm); box(geos, 0.98, 0.63, 0.04, 0, 2.5, 0.17, led, lm);
      // marshals: one waving a flag beside the wall, one standing by the hut
      const local = (lx, lz) => [p.x + p.tx * lx * side - p.nx * lz, p.z + p.tz * lx * side - p.nz * lz];
      let w = local(-2.3, 1.2); marshalsA.push(frame(new THREE.Matrix4(), w[0], p.y, w[1], side, p.tx, p.tz));
      w = local(0.6, 1.0); marshalsB.push(frame(new THREE.Matrix4(), w[0], p.y + 1.0, w[1], side, p.tx, p.tz)); w = local(-2.6, -1.2); marshalsB.push(frame(new THREE.Matrix4(), w[0], p.y, w[1], side, p.tx, p.tz));
      cx.reserve(p.s, side, 5); cx.reserve(p.s + 14, side, 3);
    }
    if (!geos.length) return;
    const mesh = new THREE.Mesh(merge(geos), stdMat({ roughness: 0.7 })); mesh.castShadow = true; mesh.receiveShadow = true; cx.add(mesh, 'marshalPosts');
    cx.add(new THREE.Mesh(merge(boards), new THREE.MeshStandardMaterial({ map: numberAtlas(), roughness: 0.6 })), 'marshalBoards');
    const mt = marshalTexture();
    const quadA = new THREE.PlaneGeometry(1.0, 1.85); quadA.translate(0, 0.925, 0); const ua = quadA.attributes.uv; for (let v = 0; v < ua.count; v++) ua.setXY(v, ua.getX(v) * 0.5, ua.getY(v));
    const quadB = new THREE.PlaneGeometry(0.6, 1.85); quadB.translate(0, 0.925, 0); const ub = quadB.attributes.uv; for (let v = 0; v < ub.count; v++) ub.setXY(v, 0.55 + ub.getX(v) * 0.4, ub.getY(v));
    const mmat = new THREE.MeshLambertMaterial({ map: mt, alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: mt, emissiveIntensity: 0.15 });
    [[quadA, marshalsA], [quadB, marshalsB]].forEach(([q, list], k) => { const inst = new THREE.InstancedMesh(q, mmat, list.length); list.forEach((mm, j) => inst.setMatrixAt(j, mm)); cx.add(inst, 'marshals' + k); });
    cx.stats.marshalPosts = num;
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
    const place = (al, zo) => [mid[0] + dx * al + nx * zo, mid[1] + dz * al + nz * zo];
    const okSpot = (x, z) => { const p = t.project(x, z, null); return p.dist > Math.max(t.wallL[p.i], t.wallR[p.i]) + 12 && !cx.inObstacle(x, z, cx.obstacles); };
    // two rows of transporters nose-in towards the garages, then a row of hospitality motorhomes behind
    const rows = [[42, 0], [60, Math.PI]];
    for (const [zo, flip] of rows) for (let al = -L / 2 + 8; al < L / 2 - 8; al += 4.6) {
      const [x, z] = place(al, zo); if (!okSpot(x, z)) continue;
      // truck +x (nose) points along n, away from the garages, for the first row; the second row faces it across an aisle
      _q.setFromAxisAngle(_y, Math.atan2(-nz, nx) + flip + (rng() - 0.5) * 0.04); _p.set(x, sc.height(x, z) - 0.04, z); _s.set(1, 1, 1); _m.compose(_p, _q, _s);
      truck(geos, _m, teams[trucks % teams.length]); trucks++;
    }
    for (let al = -L / 2 + 10; al < L / 2 - 10; al += 19) {
      const [x, z] = place(al, 82); if (!okSpot(x, z)) continue;
      _q.setFromAxisAngle(_y, Math.atan2(-dz, dx)); _p.set(x, sc.height(x, z) - 0.05, z); _s.set(1, 1, 1); _m.compose(_p, _q, _s);
      motorhome(geos, _m, teams[homes % teams.length]); homes++;
    }
    if (geos.length) { const mesh = new THREE.Mesh(merge(geos), stdMat({ roughness: 0.5, metalness: 0.1 })); mesh.castShadow = true; mesh.receiveShadow = true; cx.add(mesh, 'paddock'); }
    cx.stats.trucks = trucks; cx.stats.motorhomes = homes;
  }
  function buildCarParks(cx) {
    const t = cx.t, sc = cx.sc, rng = U.rng(515); const geos = []; let vans = 0;
    const palette = [0xe63946, 0x457b9d, 0xffb703, 0x2a9d8f, 0x6a4c93, 0xf77f00, 0x1d3557, 0x8ecae6, 0x386641, 0xbc4749];
    // fields outside Copse, Hangar Straight, Wellington Straight and Abbey, 110-130 m beyond the fence
    const fields = [[3300, 1, 125], [4700, 1, 120], [1650, -1, 115], [560, 1, 120], [3850, -1, 120], [2400, 1, 130]];
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
    if (geos.length) { const mesh = new THREE.Mesh(merge(geos), stdMat({ roughness: 0.55, metalness: 0.1 })); mesh.castShadow = true; mesh.receiveShadow = true; cx.add(mesh, 'carParks'); }
    cx.stats.campervans = vans;
  }

  // ---------------------------------------------------------------- build
  // trackside spots the environment keeps free of grandstands: [s, side (0 = both), half-length]
  Infra.SPOTS = [[3040, 0, 18], [4990, 0, 18], [2190, 0, 18], [350, 0, 18], [3160, 0, 8], [3900, 0, 8], [5075, 0, 8], [5705, 0, 8], [2010, 0, 8], [965, 0, 8], [460, 0, 8]];
  Infra.build = function (track, scenery) {
    const cx = new Ctx(track, scenery);
    buildTyreStacks(cx);
    buildScreens(cx);
    buildCameraTowers(cx);
    buildMarshalPosts(cx);
    buildHoardings(cx);
    buildFencePosts(cx);
    buildDirtBands(cx);
    buildPaddock(cx);
    // triangle budget bookkeeping (instances x geometry)
    let tris = 0, draws = 0; cx.group.traverse(o => { if (!o.isMesh) return; draws++; const g = o.geometry; const n = g.index ? g.index.count : g.attributes.position.count; tris += (n / 3) * (o.isInstancedMesh ? o.count : 1); });
    cx.stats.triangles = Math.round(tris); cx.stats.meshes = draws;
    scenery.infraStats = cx.stats; scenery.infra = cx;
    return cx.group;
  };
  EI.Infra = Infra;
})();
