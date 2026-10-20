// Equation I - terrain, grandstands with crowd, buildings, trees, water and sky
window.EI = window.EI || {};
(function () {
  const U = EI.U;

  function mergeGeos(geos, withColor) {
    const pos = [], nrm = [], uv = [], col = [];
    for (const ge of geos) {
      const g = ge.index ? ge.toNonIndexed() : ge;
      pos.push(...g.attributes.position.array); nrm.push(...g.attributes.normal.array);
      if (g.attributes.uv) uv.push(...g.attributes.uv.array); else for (let i = 0; i < g.attributes.position.count; i++) uv.push(0, 0);
      if (withColor) { const c = ge.userData.color || new THREE.Color(0xffffff); for (let i = 0; i < g.attributes.position.count; i++) col.push(c.r, c.g, c.b); }
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (withColor) out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return out;
  }

  class Scenery {
    constructor(track) { this.track = track; this.group = new THREE.Group(); this.rng = U.rng(77); }

    build() {
      this.timings = {}; let tm = performance.now(); const lap = (k) => { this.timings[k] = Math.round(performance.now() - tm); tm = performance.now(); if (EI.ENV_LOG) console.log('ENV ' + k + ' ' + this.timings[k]); };
      const Env = EI.Env, Venue = EI.EnvVenue, Veg = EI.EnvVeg;
      const E = this.env = new Env.Ctx(this); lap('distanceField');
      this.cellOf = (x, z) => E.cellAt(x, z).k;
      this.statics = new Env.Statics();
      Venue.layout(E); E.allWoods = this.track.data.scenery.woods.concat(E.data.woods || []); lap('layout');
      const City = E.data.kind === 'street' && E.dem ? EI.EnvCity : null;
      const desert = E.data.kind === 'desert';
      E.paintFieldMap(City ? [City.paintBase(E), Venue.paint(E), City.paint(E)] : desert ? [E.desertPaint(), Venue.paint(E), E.desertPaintTop()] : [Venue.paint(E)]); lap('fieldMap');
      E.buildTerrain(); E.buildVerge(); lap('terrain');
      this.buildSky(); lap('sky');
      this.buildBuildings(); lap('buildings');
      if (!(E.data.kind === 'street')) this.buildWater(); lap('water');
      Venue.build(E); lap('venue');
      if (EI.EnvStreet && E.data.kind === 'street') { EI.EnvStreet.build(E); lap('street'); }
      if (EI.EnvYas && E.data.kind === 'desert') { EI.EnvYas.build(E); lap('yas'); }
      Veg.build(E); lap('trees');
      // street circuits: the farmland hedgerow strips beyond the field map have no place on mountains and sea
      if (E.dem || desert) { const ts = this.group.getObjectByName('treeStrips'); if (ts) ts.visible = false; }
      Veg.buildGrass(E); lap('grass');
      if (EI.Infra) this.group.add(EI.Infra.build(this.track, this)); lap('infra');
      this.statics.build(this.group); E.stats.staticChunks = this.statics.chunks.length; E.stats.staticTris = this.statics.tris; lap('statics');
      // everything that is dropped beyond the tier's clutter distance: small static chunks + the chunked trackside instanced families
      this.clutter = this.statics.chunks.filter(c => c.userData.layer === 'clutter'); this.group.traverse(o => { if (o.userData.clutter && o.userData.box) this.clutter.push(o); });
      this.shadowTiles = this.statics.chunks;
      this.envStats = E.stats;
      this.setQuality(EI.quality || 'medium');
      return this.group;
    }

    // ---------------------------------------------------------------- quality tiers
    // low: no grass tufts, 3-card trees to 300 m and billboards to 900 m (tree-line strips beyond), crowd sprites to 250 m and the
    //      painted crowd strips to 600 m, parked cars / tents / small clutter near only, no tree / crowd shadows, closer fog (main.js)
    // medium: tufts to ~60 m, 3-card trees to 500 m, billboards to 1.5 km and tree-line strips beyond, crowd sprites to 400 m and
    //      the painted crowd strips beyond, parked cars and small trackside / stand detail to ~0.8-0.9 km
    // high: everything (tufts to 85 m, billboards everywhere, crowd sprites to 650 m), tree and crowd shadows (casters within ~160 m)
    setQuality(q) {
      q = q === 'low' || q === 'high' ? q : 'medium'; this.quality = q;
      const T = Scenery.TIERS[q]; this.tier = T;
      if (this.treeLod) this.treeLod.setRange(T.treeNear, T.treeFar);
      if (this.innerStrips) { this.innerStrips.mesh.visible = T.treeFar < 1e4; this.innerStrips.uni.uStripR.value = T.treeFar; }
      if (this.grass) this.grass.setRange(T.grass[0], T.grass[1]);
      if (this.crowdLod) this.crowdLod.setRange(T.crowd, T.crowdFar);
      if (this.parkedCars) this.parkedCars.dyn.range(0, T.cars);
      for (const tn of this.tents || []) tn.dyn.range(0, T.tents);
      this.treeBlobs = T.blobs;
      if (this.treeLod) { this.treeLod.near.castShadow = T.shadows; this.treeLod.blobs.visible = T.blobs && this.treeLod.near.visible; }
      if (this.crowdLod) this.crowdLod.inst.castShadow = T.shadows;
      if (this.cityChunks && EI.EnvCity && EI.EnvCity.setQuality) EI.EnvCity.setQuality(this, q);   // street city: draw ranges and shader per tier
      this._forceLod = true;
    }
    // per-frame LOD bookkeeping (cheap: a few distance tests, buffer regathers only after the eye has moved tens of metres)
    updateLod(dt, x, z) {
      const T = this.tier || Scenery.TIERS.medium; const force = this._forceLod; this._forceLod = false;
      if (this.treeLod) this.treeLod.update(x, z);
      if (this.innerStrips) this.innerStrips.uni.uEye.value.set(x, 0, z);
      if (this.crowdLod) this.crowdLod.update(dt, x, z);
      if (this.parkedCars) this.parkedCars.dyn.update(x, z, force);
      for (const tn of this.tents || []) tn.dyn.update(x, z, force);
      for (const c of this.clutter || []) c.visible = EI.Env.eyeDist(c.userData.box, x, z) < T.clutter;
      for (const f of this.nearFar || []) { f.far.range(100, T.clutter); f.near.range(0, 200); f.far.update(x, z, force); f.near.update(x, z, force); }
      // shadow casters: the sun shadow covers ~70 m round a point just ahead of the camera and the sun is 42 degrees up, so
      // static tiles further than ~170 m away cannot reach it - they skip the shadow pass (the bulk of its cost)
      for (const c of this.shadowTiles || []) c.castShadow = EI.Env.eyeDist(c.userData.box, x, z) < 170;
      // the city (street circuits): detail tiles near the eye (casting shadows close by), proxy tiles out to the tier's range
      if (this.cityChunks && EI.EnvCity && EI.EnvCity.update) EI.EnvCity.update(this, x, z, T);
    }

    // per-view eye for the distance fades (trees, crowd sprites, tree-line strips): uniforms only, the sets gathered in update() stay
    setEye(x, z) {
      if (this.treeLod) this.treeLod.update(x, z);
      if (this.crowdLod) this.crowdLod.update(0, x, z);
      if (this.innerStrips) this.innerStrips.uni.uEye.value.set(x, 0, z);
    }

    // visible ground height: the verge ribbons (track level) near the circuit, the terrain mesh beyond
    height(x, z) {
      const E = this.env, t = this.track;
      const fs = E ? E.fsAt(x, z) : 1e4;
      if (fs < 41) {
        let v = (E.dC2 ? E.tyAt(x, z) : t.y[E.idxAt(x, z)]) - 0.03; if (!E.dem) return v;
        // street circuits: on and right next to the road the surface is the road's own (the blended level belongs to the verges)
        const p = t.project(x, z, null, this._hp || (this._hp = {})); if (p.dist < Math.max(t.wallL[p.i], t.wallR[p.i]) + 1.5) v = t.y[p.i] - 0.03;
        // where the barrier width jumps between samples (escape roads), the nearest sample alone does not tell: any sample close by
        // that has (x, z) between its barriers puts the ground at its road level
        let road = p.dist < Math.max(t.wallL[p.i], t.wallR[p.i]) + 1.5;
        const n = t.n; for (let k = p.i - 12; k <= p.i + 12; k++) { const j = (k % n + n) % n; const dx = x - t.x[j], dz = z - t.z[j]; if (Math.abs(dx * t.tx[j] + dz * t.tz[j]) > 1.1) continue; const la = dx * t.nx[j] + dz * t.nz[j]; if (la > -t.wallL[j] - 1.5 && la < t.wallR[j] + 1.5) { v = Math.min(v, t.y[j] - 0.03); road = true; } }
        // off the road the verge drapes over the terrain where it falls away (track.js): the surface is at most a little above the grid
        const g = this.gridHeight(x, z); if (!road && this.heights) v = Math.min(v, g + 0.25);
        return Math.max(v, g);
      }
      return this.gridHeight(x, z);
    }
    // the terrain mesh surface (same triangulation), analytic beyond its fine grid
    gridHeight(x, z) {
      const E = this.env; const H = this.hHalf;
      if (!this.heights || Math.abs(x) >= H || Math.abs(z) >= H) return E ? E.terrainHeight(x, z) : 0;
      const N = this.hN, G = this.hCell; const fx = (x + H) / G, fz = (z + H) / G; const ix = U.clamp(Math.floor(fx), 0, N - 2), iz = U.clamp(Math.floor(fz), 0, N - 2); const tx = fx - ix, tz = fz - iz;
      const h = this.heights; const h00 = h[iz * N + ix], h10 = h[iz * N + ix + 1], h01 = h[(iz + 1) * N + ix], h11 = h[(iz + 1) * N + ix + 1];
      // same triangulation as the terrain mesh (a, c, b / b, c, d)
      if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
      return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
    }

    // ---------------------------------------------------------------- sky: gradient dome + drifting cloud layer + sun
    buildSky() {
      // cloud texture (tileable: blend of four offset noise samples)
      const c = document.createElement('canvas'); c.width = c.height = 512; const ctx = c.getContext('2d'); const img = ctx.createImageData(512, 512); const d = img.data;
      const T = 5.0; const nz = (u, v) => U.fbm(u + 37.2, v + 11.9, 5, 2.0, 0.5);
      for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
        const fx = x / 512, fy = y / 512; const u = fx * T, v = fy * T;
        const f = (nz(u, v) * (1 - fx) * (1 - fy) + nz(u - T, v) * fx * (1 - fy) + nz(u, v - T) * (1 - fx) * fy + nz(u - T, v - T) * fx * fy);
        // cumulus seen from below: bright sunlit fringes, the thick middles a flat blue-grey base
        const a = U.clamp((f - 0.56) * 9, 0, 1); const i = (y * 512 + x) * 4; const base = U.clamp((f - 0.6) * 5, 0, 1); const shade = 252 - 74 * Math.pow(base, 0.8);
        d[i] = shade; d[i + 1] = Math.min(255, shade + 3); d[i + 2] = Math.min(255, shade + 3 + 12 * base); d[i + 3] = a * 255;
      }
      ctx.putImageData(img, 0, 0);
      const cloudTex = new THREE.CanvasTexture(c); cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping; cloudTex.repeat.set(4, 4);
      const cloudGeo = new THREE.PlaneGeometry(9000, 9000); cloudGeo.rotateX(Math.PI / 2);
      this.clouds = new THREE.Mesh(cloudGeo, new THREE.MeshBasicMaterial({ map: cloudTex, color: 0xffffff, transparent: true, fog: false, depthWrite: false, opacity: 0.85 }));
      this.clouds.position.y = 520; this.group.add(this.clouds);
      const cloud2 = this.clouds.clone(); cloud2.material = this.clouds.material.clone(); cloud2.material.opacity = 0.25; cloud2.position.y = 760; cloud2.scale.set(1.6, 1, 1.6); this.group.add(cloud2); this.clouds2 = cloud2;
      // the cloud decks reach far beyond the camera's far plane (which stops at the fog's end): their depth is clamped onto the
      // far plane instead of being clipped (no hard seam across the sky), they thin out towards the horizon, and their
      // undersides are a touch greyer than the sunlit tops
      for (const m of [this.clouds, cloud2]) {
        m.frustumCulled = false; m.renderOrder = -5;
        m.material.onBeforeCompile = (sh) => {
          sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vCl;')
            .replace('#include <project_vertex>', '#include <project_vertex>\nvCl = position.xz / 4500.0; gl_Position.z = min(gl_Position.z, gl_Position.w * 0.99999);');
          sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vCl;')
            .replace('#include <map_fragment>', '#include <map_fragment>\nfloat cR = length(vCl); diffuseColor.a *= 1.0 - smoothstep(0.42, 0.95, cR); diffuseColor.rgb *= mix(0.86, 1.0, smoothstep(0.35, 0.8, diffuseColor.a));');
        };
        m.material.customProgramCacheKey = () => 'ei-clouds';
      }
    }
    // one update per frame; split screen passes the second view's eye too (x2, z2): every gathered set and tile visibility then
    // covers both views (one gather, not two), and setEye(x, z) moves the per-view fade centres before each view renders
    update(dt, camX, camZ, x2, z2) {
      const fc = EI.debug && EI.debug.freeCam; if (fc && fc.pos) { camX = fc.pos[0]; camZ = fc.pos[2]; }
      EI.Env.eyes = x2 != null && z2 != null ? [[camX, camZ], [x2, z2]] : null;
      // the track draws its own detailed grass verge (named 'verge', ei-track shader): when present, our overlay ribbon steps aside
      if (!this._vergeChecked && this.env && this.env.vergeMesh) { this._vergeChecked = true; const tv = this.track.group && this.track.group.getObjectByName('verge'); if (tv && tv.material && tv.material.customProgramCacheKey && /ei-track/.test(tv.material.customProgramCacheKey())) { this.env.vergeMesh.visible = false; this.grassTint = [0.96, 1.0, 0.94]; } }
      if (this.grass) this.grass.update(dt, camX, camZ);
      this.updateLod(dt, camX, camZ);
      if (this.clouds) { this.clouds.material.map.offset.x += dt * 0.0015; this.clouds.position.x = camX; this.clouds.position.z = camZ; this.clouds2.position.x = camX; this.clouds2.position.z = camZ; this.clouds2.material.map.offset.x += dt * 0.0008; }
    }

    // ---------------------------------------------------------------- pit complex (designed) + OSM buildings with proper facades
    buildPitComplex() {
      const t = this.track; const pit = t.data.pit; if (!pit || pit.length < 3) return null;
      const Env = EI.Env, C = Env.C;
      // pit lane direction and the side away from the track
      const a = pit[Math.floor(pit.length * 0.2)], b = pit[Math.floor(pit.length * 0.8)]; const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      let dx = b[0] - a[0], dz = b[1] - a[1]; const len = Math.hypot(dx, dz); dx /= len; dz /= len;
      const pr = t.project(mid[0], mid[1], null); const side = pr.lat > 0 ? 1 : -1; const nx = t.nx[pr.i] * side, nz = t.nz[pr.i] * side; // away from track
      const baseY = t.y[pr.i];
      const L = Math.min(len * 0.9, 320), D = 22;
      // the Wing pit building itself (garages, pit wall, signage) is built by js/pit.js along its own lane; the scenery only
      // reserves the area (pitBox) so the OSM buildings / paddock logic keep clear of it
      const grp = new THREE.Group(); grp.name = 'pitComplex';
      this.pitBox = { cx: mid[0] + nx * (8 + D / 2), cz: mid[1] + nz * (8 + D / 2), r: L / 2 + 30 };
      const kindW = ((EI.ENVDATA && EI.ENVDATA[t.data.id]) || {}).kind;
      if (!kindW && this.statics) this.buildWing(grp, side);
      return grp;
    }
    // ---------------------------------------------------------------- the Wing (Silverstone): the pit and paddock building along the
    // start straight. js/pit.js builds the ten team garages (to ~10 m); this adds what stands above and around them: three glazed
    // hospitality / media floors leaning out towards the track, white floor slabs, V-columns, the long blade roof that overhangs the
    // pit lane and lifts into the cantilevered prow of the media centre at the Abbey end, closed garages along the rest of the
    // ~400 m frontage, and the name on the roof fascia. Static, merged into the lap-wide statics (no extra draw calls) except the sign.
    buildWing(grp, side) {
      const t = this.track, Env = EI.Env, C = Env.C, sf = t.sf;
      // the pit lane's line (as js/pit.js lays it out): parallel to the straight beyond the barrier on the pit side
      let maxWall = 0; for (let s = -180; s <= 180; s += 4) { const i = t.idxAtS(sf + s); maxWall = Math.max(maxWall, side < 0 ? t.wallL[i] : t.wallR[i]); }
      const latC = maxWall + 2.9 + 0.35 + 6.0;
      const i0 = t.idxAtS(sf); const y0 = t.y[i0];
      const m = Env.frame(t.x[i0], y0, t.z[i0], t.tx[i0], t.tz[i0], t.nx[i0] * side, t.nz[i0] * side);
      // the frame may have flipped its x to stay right-handed: +x must point down the lap (towards Abbey)
      const ex = m.elements; const dirX = (ex[0] * t.tx[i0] + ex[2] * t.tz[i0]) > 0 ? 1 : -1;
      const B = new Env.Builder(), G = new Env.Builder(), F = new Env.Builder();   // structure, glass, fine detail
      const white = C(0xf1f2f0), offW = C(0xdfe1e2), steel = C(0xb9bec4), dark = C(0x2b2f36), glass = C(0x26364a), glassD = C(0x172230), shutter = C(0x9ea4ab), roofTop = C(0xc8ccd0), under = C(0xe4e6e8), red = C(0xc8102e);
      const L0 = -200, L1 = 200;                     // frontage along the straight (x, metres from the line; + towards Abbey)
      const X = (x) => x * dirX;
      const zG = latC + 7.8, zGB = latC + 17.8;      // garage front / back (from pit.js)
      const z0 = latC + 5.4, zB = latC + 25;        // upper floors: front line at the slab level, back
      const yb = 10.35, fl = 3.7, nFl = 3, yt = yb + nFl * fl;
      const prow = (x) => U.smoothstep(L1 - 70, L1 + 10, x);   // 0 along the frontage, 1 at the Abbey-end prow
      // ---- closed garages either side of the ten team boxes (pit.js covers about +-92 m): roller shutters in white frames
      for (const [a0, a1] of [[L0, -93], [93, L1]]) {
        for (let x = a0; x < a1 - 1; x += 9) {
          const w = Math.min(9, a1 - x), cx = x + w / 2;
          B.box(m, w, 0.6, zGB - zG, X(cx), 4.8, (zG + zGB) / 2, white);                 // header
          B.box(m, w, 4.8, 0.25, X(cx), 0, zGB, offW);                                   // back wall
          for (const e of [x, x + w]) B.box(m, 0.45, 5.4, 0.6, X(e), 0, zG, white);       // pilasters
          B.box(m, w - 0.5, 4.75, 0.08, X(cx), 0.02, zG + 0.25, shutter);                 // shutter
          for (let y = 0.35; y < 4.7; y += 0.32) F.box(m, w - 0.55, 0.04, 0.05, X(cx), y, zG + 0.2, C(0x8a9097));
          B.box(m, w, 0.28, 0.1, X(cx), 4.5, zG - 0.06, red);                             // red band under the header
          B.box(m, w, 5.4, 0.2, X(cx), 5.4, zG + 1.0, white);                             // first-floor wall over the garages
          G.box(m, w - 0.6, 3.0, 0.1, X(cx), 6.6, zG + 0.88, glass);
        }
        B.box(m, a1 - a0, 0.35, zGB - zG + 3, X((a0 + a1) / 2), 10.0, (zG + zGB) / 2 - 1, white);
      }
      // ---- upper floors: slabs, inclined glazing with mullions, the back wall, end walls; the prow end deepens and tapers to a point
      const seg = 6, xs = []; for (let x = L0; x <= L1 + 0.01; x += seg) xs.push(x); xs.push(L1 + 22);
      const lean = 2.6;                              // the glass leans out towards the track by this much over the three floors
      const back = (x) => zB - (zB - z0 - 4) * prow(x) * 0.85;           // the back face sweeps in towards the prow
      const topY = (x) => yt + 4.2 * prow(x);                             // the media centre adds a floor at the prow
      const frontZ = (x, y) => z0 - lean * (y - yb) / (yt - yb) - 3 * prow(x);
      // faces in this block are emitted with both windings: the frame's x may run either way along the straight (dirX)
      const dq = (Bd, a, b, c, d, col) => { Bd.quad(a, b, c, d, col); Bd.quad(d, c, b, a, col); };
      for (let k = 0; k + 1 < xs.length; k++) {
        const xa = xs[k], xb = xs[k + 1]; const ta = Math.min(1, (xa - L1) / 22), tb = Math.min(1, (xb - L1) / 22);
        if (xa >= L1) { // the prow itself: a wedge closing to a point
          const P = (x, y, z) => Env.xf(m, X(x), y, z);
          const zbA = back(xa), zbB = z0 - 3, yA = topY(xa), zfA = frontZ(xa, yA);
          dq(G, P(xa, yb, frontZ(xa, yb)), P(xb, yb, zbB), P(xb, yA - 1, zbB), P(xa, yA, zfA), glass);
          dq(G, P(xb, yb, zbB), P(xa, yb, zbA), P(xa, yA, zbA), P(xb, yA - 1, zbB), glassD);
          continue;
        }
        const P = (x, y, z) => Env.xf(m, X(x), y, z);
        const ya = topY(xa), ybb = topY(xb);
        // glass front (two triangles per floor so the lean reads), white slab edges at every floor
        for (let f = 0; f < nFl + 1; f++) {
          const yA0 = yb + f * fl, yA1 = Math.min(ya, yb + (f + 1) * fl), yB1 = Math.min(ybb, yb + (f + 1) * fl); if (yA1 <= yA0 + 0.1) continue;
          dq(G, P(xa, yA0 + 0.35, frontZ(xa, yA0 + 0.35)), P(xb, yA0 + 0.35, frontZ(xb, yA0 + 0.35)), P(xb, yB1, frontZ(xb, yB1)), P(xa, yA1, frontZ(xa, yA1)), f % 2 ? glass : glassD);
          // slab edge (white band) and a soffit under it
          dq(B, P(xa, yA0, frontZ(xa, yA0) - 0.5), P(xb, yA0, frontZ(xb, yA0) - 0.5), P(xb, yA0 + 0.38, frontZ(xb, yA0 + 0.38) - 0.5), P(xa, yA0 + 0.38, frontZ(xa, yA0 + 0.38) - 0.5), white);
          dq(B, P(xa, yA0, frontZ(xa, yA0) - 0.5), P(xa, yA0, frontZ(xa, yA0) + 1.5), P(xb, yA0, frontZ(xb, yA0) + 1.5), P(xb, yA0, frontZ(xb, yA0) - 0.5), under);
        }
        // mullions every 1.5 m (fine layer) and a glass balustrade line on each slab
        for (let x = xa; x < xb - 0.1; x += 1.5) F.beam(m, [X(x), yb + 0.38, frontZ(x, yb + 0.38) - 0.04], [X(x), ya, frontZ(x, ya) - 0.04], 0.09, white);
        // back wall (offwhite, with a dark window band) and roof of the box
        const zba = back(xa), zbb = back(xb);
        dq(B, P(xb, yb, zbb), P(xa, yb, zba), P(xa, ya, zba), P(xb, ybb, zbb), offW);
        dq(G, P(xb, yb + 4.5, zbb + 0.05), P(xa, yb + 4.5, zba + 0.05), P(xa, yb + 6.2, zba + 0.05), P(xb, yb + 6.2, zbb + 0.05), glassD);
        dq(B, P(xa, ya, frontZ(xa, ya)), P(xa, ya, zba), P(xb, ybb, zbb), P(xb, ybb, frontZ(xb, ybb)), roofTop);
      }
      // end wall at the far (Luffield) end
      { const P = (x, y, z) => Env.xf(m, X(x), y, z); dq(B, P(L0, yb, back(L0)), P(L0, yb, frontZ(L0, yb)), P(L0, yt, frontZ(L0, yt)), P(L0, yt, back(L0)), offW); }
      // ---- the blade roof: an aerofoil section extruded along the frontage, overhanging the pit lane; it lifts and sweeps forward into a
      // point beyond the prow. Leading edge (track side) higher and thinner, upper surface pale grey, the underside white with downlights.
      // the roofline's second crest: the blade kinks up to a sharp ridge about a third of the way along and back down (the 'wing')
      const kink = (x) => 8.0 * Math.max(0, 1 - Math.abs(x + 110) / 66);
      const prof = (x) => { const p = prow(x), kk = kink(x); const rise = 3.0 * p + kk; const over = 9 + 7 * p + kk * 0.5; const zle = z0 - over, zte = back(x) + 1.0 - 6 * p;
        return { zle, zte, yle: yt + 2.6 + rise + 1.2 * p, yte: yt + 0.9 + rise * 0.6 - kk * 0.25, thick: 1.6 - 0.6 * p }; };
      const rx = []; for (let x = L0 - 6; x <= L1 + 34.01; x += 4) rx.push(x);
      const sec = (x) => { const q = prof(x); const pts = []; const n = 6; for (let j = 0; j <= n; j++) { const u = j / n; const z = q.zle + (q.zte - q.zle) * u; const camber = Math.sin(Math.PI * u) * 0.9; const y = q.yle + (q.yte - q.yle) * u + camber; const th = q.thick * Math.sin(Math.PI * Math.min(1, u * 1.15 + 0.05)) * 0.9 + 0.15; pts.push([z, y + th * 0.4, y - th * 0.6]); } return pts; };
      const tipCut = (x) => U.clamp((L1 + 34 - x) / 34, 0.08, 1);   // the plan narrows to a point beyond the prow
      for (let k = 0; k + 1 < rx.length; k++) {
        const xa = rx[k], xb = rx[k + 1]; const A = sec(xa), Bq = sec(xb); const ca = tipCut(xa), cb = tipCut(xb);
        const za = (z, x) => { const q = prof(x); const c = tipCut(x); return q.zle + (z - q.zle) * c; };
        for (let j = 0; j + 1 < A.length; j++) {
          const P = (x, y, z) => Env.xf(m, X(x), y, z);
          const a0 = A[j], a1 = A[j + 1], b0 = Bq[j], b1 = Bq[j + 1];
          B.quad(P(xa, a0[1], za(a0[0], xa)), P(xb, b0[1], za(b0[0], xb)), P(xb, b1[1], za(b1[0], xb)), P(xa, a1[1], za(a1[0], xa)), j === 0 ? white : roofTop);
          B.quad(P(xa, a1[2], za(a1[0], xa)), P(xb, b1[2], za(b1[0], xb)), P(xb, b0[2], za(b0[0], xb)), P(xa, a0[2], za(a0[0], xa)), under);
        }
        // leading edge fascia (the white blade nose) and trailing edge
        { const P = (x, y, z) => Env.xf(m, X(x), y, z); const a0 = A[0], b0 = Bq[0]; B.quad(P(xb, b0[2], za(b0[0], xb)), P(xb, b0[1], za(b0[0], xb)), P(xa, a0[1], za(a0[0], xa)), P(xa, a0[2], za(a0[0], xa)), white);
          const an = A[A.length - 1], bn = Bq[Bq.length - 1]; B.quad(P(xa, an[2], za(an[0], xa)), P(xa, an[1], za(an[0], xa)), P(xb, bn[1], za(bn[0], xb)), P(xb, bn[2], za(bn[0], xb)), offW); }
        // downlight dots under the overhang (fine layer)
        if (k % 2 === 0) for (const u of [0.12, 0.3]) { const q = prof(xa); const z = za(q.zle + (q.zte - q.zle) * u, xa); const y = q.yle + (q.yte - q.yle) * u + Math.sin(Math.PI * u) * 0.9 - 0.62 * (q.thick * 0.9 + 0.15); F.box(m, 0.5, 0.05, 0.5, X(xa + 2), y - 0.06, z, C(0xfff7e8)); }
      }
      // ---- V-columns: pairs from the garage roof up to the blade's underside along the front, every 18 m; slim ties to the glazing
      for (let x = L0 + 9; x < L1; x += 18) {
        const q = prof(x); const zc = q.zle + (q.zte - q.zle) * 0.22; const yc = q.yle + (q.yte - q.yle) * 0.22 + Math.sin(Math.PI * 0.22) * 0.9 - 0.8;
        for (const d of [-3.2, 3.2]) B.beam(m, [X(x), yb, z0 + 0.6], [X(x + d), yc, zc], 0.42, white);
      }
      // ---- the paddock-side service core and stair towers (dark glass slots) every ~90 m
      for (let x = L0 + 40; x < L1 - 40; x += 90) { B.box(m, 8, yt + 1.5, 6, X(x), 0, zB + 2.5, offW); G.box(m, 1.4, yt - 2, 0.1, X(x), 2, zB - 0.5 + 0.05 + 2.5 + 3.0, glassD); }
      if (this.statics) { this.statics.add(B.geometry(), 0.55, 0.08, 'main'); this.statics.add(G.geometry(), 0.3, 0.12, 'main'); this.statics.add(F.geometry(), 0.5, 0.3, 'clutter'); }
      // ---- the name along the blade's leading edge, facing the track (one small textured mesh)
      {
        const text = 'SILVERSTONE  ·  HOME OF BRITISH MOTOR RACING  ·  ';
        const c = document.createElement('canvas'); c.width = 2048; c.height = 64; const x2 = c.getContext('2d');
        x2.fillStyle = '#f2f3f1'; x2.fillRect(0, 0, 2048, 64); x2.fillStyle = '#1b2a4a'; x2.font = 'italic 900 40px "Titillium Web", Arial, sans-serif'; x2.textBaseline = 'middle';
        const w1 = x2.measureText(text).width; for (let x = 6; x < 2048; x += w1) x2.fillText(text, x, 34);
        const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8; tex.wrapS = THREE.RepeatWrapping;
        const pos = [], uv = []; const len = L1 - L0 + 20;
        for (let x = L0; x < L1 + 20; x += 8) {
          const xb = Math.min(L1 + 20, x + 8); const qa = prof(x), qb = prof(xb);
          const za = qa.zle - 0.02, zb = qb.zle - 0.02, ya = qa.yle, yb2 = qb.yle; const h = 1.0;
          const p = [Env.xf(m, X(x), ya - h / 2, za), Env.xf(m, X(xb), yb2 - h / 2, zb), Env.xf(m, X(xb), yb2 + h / 2, zb), Env.xf(m, X(x), ya + h / 2, za)];
          const u0 = (x - L0) / 60, u1 = (xb - L0) / 60;
          for (const [pi, uu, vv] of [[0, u0, 0], [1, u1, 0], [2, u1, 1], [0, u0, 0], [2, u1, 1], [3, u0, 1]]) { pos.push(...p[pi]); uv.push(dirX > 0 ? uu : -uu, vv); }
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
        const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, side: THREE.DoubleSide })); mesh.name = 'wingSign'; grp.add(mesh);
      }
    }
    buildBuildings() {
      const t = this.track, sc = t.data.scenery; const pr = {}; const Env = EI.Env;
      const kindE = (EI.ENVDATA && EI.ENVDATA[t.data.id] || {}).kind; const street = kindE === 'street', desert = kindE === 'desert';
      // street circuits with a city model: every footprint becomes a designed building (js/env_city.js)
      if (street && EI.EnvCity && this.env && this.env.dem) { EI.EnvCity.build(this.env); return; }
      const pitGroup = street ? null : this.buildPitComplex(); if (pitGroup) this.group.add(pitGroup);
      // near-neutral facade textures (tinted per building by vertex colour); the top-left corner is a plain patch used by the roofs
      const mkTex = (draw) => { const [c, ctx] = Env.canvas(256, 128); draw(ctx); ctx.fillStyle = '#e6e6e6'; ctx.fillRect(0, 0, 12, 12); return Env.tex(c, true, 8); };
      const officeTex = mkTex(ctx => { ctx.fillStyle = '#ececec'; ctx.fillRect(0, 0, 256, 128); for (const y of [22, 86]) { ctx.fillStyle = '#41546b'; ctx.fillRect(0, y, 256, 26); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(0, y, 256, 5); ctx.fillStyle = '#c9c9c9'; for (let x = 0; x < 256; x += 32) ctx.fillRect(x, y, 3, 26); } ctx.fillStyle = '#d4d4d4'; ctx.fillRect(0, 60, 256, 4); ctx.fillRect(0, 124, 256, 4); });
      const hallTex = mkTex(ctx => { ctx.fillStyle = '#dcdcdc'; ctx.fillRect(0, 0, 256, 128); ctx.fillStyle = 'rgba(0,0,0,0.09)'; for (let x = 0; x < 256; x += 8) ctx.fillRect(x, 0, 3, 128); ctx.fillStyle = 'rgba(255,255,255,0.18)'; for (let x = 4; x < 256; x += 8) ctx.fillRect(x, 0, 1, 128); ctx.fillStyle = '#596574'; ctx.fillRect(40, 70, 70, 58); ctx.fillRect(170, 92, 40, 36); });
      const houseTex = mkTex(ctx => { ctx.fillStyle = '#efefef'; ctx.fillRect(0, 0, 256, 128); ctx.fillStyle = '#3c4654'; for (let x = 18; x < 256; x += 56) { ctx.fillRect(x, 30, 26, 30); ctx.fillRect(x, 84, 26, 30); } ctx.fillStyle = '#ffffff'; for (let x = 18; x < 256; x += 56) { ctx.fillRect(x - 2, 58, 30, 4); ctx.fillRect(x - 2, 112, 30, 4); } });
      const tints = desert ? { hall: [0xf2ede3, 0xe6dccb, 0xdcd8d0, 0xf6f3ec, 0xd6c8ae], office: [0xf7f4ee, 0xece2d0, 0xffffff, 0xe2d4ba, 0xd9d6d0, 0xefe6d6], house: [0xf3e7d2, 0xe8d6b8, 0xf7f1e4, 0xdcc6a2, 0xf0e2cc] } : street ? { hall: [0xf1e4c8, 0xe9d8b4, 0xf4ede0, 0xd9c7a6, 0xf3f0ea], office: [0xf6ecd9, 0xf0dcc0, 0xffffff, 0xe6cfa9, 0xf2e3d3, 0xdfc3a0], house: [0xf3e1c0, 0xe8c9a0, 0xf7f1e4, 0xd8b68c, 0xf0dcc8] } : { hall: [0xd9dcdf, 0xc9d1d8, 0xbfc5c9, 0xe6e2d6, 0x9fb0bd, 0x8d9b88, 0xe9e9e4], office: [0xffffff, 0xe8e8e8, 0xdde3ea, 0xf1ece2], house: [0xffffff, 0xe9dccb, 0xb88a6c, 0xd8d0c4, 0xa77a5c] };
      const roofs = desert ? [0xd8d4cc, 0xc9c5bd, 0xbab6ae, 0xe2ded6, 0xa9a6a0] : street ? [0xb8674a, 0xa85c40, 0xc9c6bd, 0x9c5a44, 0xd0ccc2] : [0xb9bcbf, 0x8f9499, 0x6e7177, 0xcfd1d2, 0x7c6a5c];
      const lists = { office: [], hall: [], house: [] }; const col = new THREE.Color(), roofC = new THREE.Color(); let k = 0;
      for (const b of sc.buildings) {
        const poly = b.p; const area = Math.abs(U.polyArea(poly)); if (poly.length < 3 || area < 60) continue;
        if (desert && b.w) continue;   // the W hotel is built by js/env_yas.js
        let clear = true, cx = 0, cz = 0, minY = Infinity;
        for (const q of poly) { t.project(q[0], q[1], null, pr); if (pr.dist < Math.max(t.wallL[pr.i], t.wallR[pr.i]) + 1) { clear = false; break; } cx += q[0]; cz += q[1]; minY = Math.min(minY, this.height(q[0], q[1])); }
        if (!clear) continue; cx /= poly.length; cz /= poly.length;
        if (this.pitBox && Math.hypot(cx - this.pitBox.cx, cz - this.pitBox.cz) < this.pitBox.r) continue;
        const shape = new THREE.Shape(); shape.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < poly.length; i++) shape.lineTo(poly[i][0], poly[i][1]); shape.closePath();
        const h = b.h ? Math.min(b.h, street ? 60 : desert ? 75 : 24) : (area > 2500 ? 9 + Math.min(8, area / 1500) : area > 500 ? 6 + Math.min(6, area / 400) : 3.5 + Math.min(3, area / 80));
        const kind = area > 2500 ? 'hall' : area > 500 ? 'office' : 'house'; const tl = tints[kind]; k++;
        col.setHex(tl[Math.floor(Math.abs(cx * 13 + cz * 7)) % tl.length]).convertSRGBToLinear(); roofC.setHex(roofs[Math.floor(Math.abs(cx * 3 + cz * 11)) % roofs.length]).convertSRGBToLinear();
        const geo = new THREE.ExtrudeGeometry(shape, { depth: h + 2, bevelEnabled: false }); geo.rotateX(Math.PI / 2); geo.translate(0, h + minY - 1, 0);
        const p = geo.attributes.position, uv = geo.attributes.uv, nrm = geo.attributes.normal; const cols = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) {
          const nx = nrm.getX(i), ny = nrm.getY(i); const roof = Math.abs(ny) > 0.5; const c = roof ? roofC : col;
          if (roof) uv.setXY(i, 0.02, 0.98); else uv.setXY(i, (Math.abs(nx) > 0.5 ? p.getZ(i) : p.getX(i)) * 0.125, (p.getY(i) - minY) * (kind === 'hall' ? 0.06 : 0.125));
          cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); lists[kind].push(geo);
      }
      const add = (geos, tex, rough) => { if (!geos.length) return; const m = new THREE.Mesh(Env.merge(geos), new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: rough, metalness: 0.05 })); m.castShadow = true; m.receiveShadow = true; m.name = 'osmBuildings'; this.group.add(m); };
      add(lists.office, officeTex, 0.6); add(lists.hall, hallTex, 0.7); add(lists.house, houseTex, 0.85);
    }

    buildWater() {
      const geos = [];
      for (const w of this.track.data.scenery.water) {
        if (w.length < 3) continue; let y = Infinity; for (const q of w) y = Math.min(y, this.height(q[0], q[1]));
        const shape = new THREE.Shape(); shape.moveTo(w[0][0], w[0][1]); for (let i = 1; i < w.length; i++) shape.lineTo(w[i][0], w[i][1]);
        const geo = new THREE.ShapeGeometry(shape); geo.rotateX(Math.PI / 2); geo.translate(0, y + 0.25, 0); geos.push(geo);
      }
      if (!geos.length) return;
      const m = new THREE.Mesh(mergeGeos(geos), new THREE.MeshStandardMaterial({ color: 0x2c4f5e, roughness: 0.06, metalness: 0.55, side: THREE.DoubleSide })); m.name = 'water'; this.group.add(m);
    }
  }
  // draw ranges stop at (or short of) the fog's far end per circuit (~2.4-2.6 km; ~1.4-1.5 km on low): past it nothing shows anyway
  Scenery.TIERS = {
    low: { treeNear: 220, treeFar: 600, grass: [0, 0], crowd: 200, crowdFar: 420, cars: 300, tents: 300, clutter: 320, blobs: true, shadows: false, cityDetail: 200, cityFar: 1150 },   // PERF wave 6: tighter (Low fog is 15 % closer too)
    medium: { treeNear: 420, treeFar: 1100, grass: [34, 55], crowd: 350, crowdFar: 1100, cars: 600, tents: 1200, clutter: 650, blobs: true, shadows: false, cityDetail: 340, cityFar: 2500 },
    high: { treeNear: 500, treeFar: 1600, grass: [50, 80], crowd: 550, crowdFar: 1600, cars: 1000, tents: 1800, clutter: 1100, blobs: true, shadows: true, cityDetail: 520, cityFar: 2650 },
  };
  EI.Scenery = Scenery;
})();
