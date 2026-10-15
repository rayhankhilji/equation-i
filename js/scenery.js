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
      Venue.layout(E); E.allWoods = this.track.data.scenery.woods.concat(E.data.woods || []); lap('layout');
      E.paintFieldMap([Venue.paint(E)]); lap('fieldMap');
      E.buildTerrain(); E.buildVerge(); lap('terrain');
      this.buildSky(); lap('sky');
      this.buildBuildings(); lap('buildings');
      this.buildWater(); lap('water');
      Venue.build(E); lap('venue');
      Veg.build(E); lap('trees');
      Veg.buildGrass(E); lap('grass');
      if (EI.Infra) this.group.add(EI.Infra.build(this.track, this)); lap('infra');
      this.envStats = E.stats;
      return this.group;
    }

    // visible ground height: the verge ribbons (track level) near the circuit, the terrain mesh beyond
    height(x, z) {
      const E = this.env, t = this.track;
      if (E && E.fsAt(x, z) < 41) return t.y[E.idxAt(x, z)] - 0.03;
      const H = this.hHalf;
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
        const a = U.clamp((f - 0.56) * 9, 0, 1); const i = (y * 512 + x) * 4; const shade = 215 + U.clamp((f - 0.5) * 220, -30, 40);
        d[i] = Math.min(255, shade + 20); d[i + 1] = Math.min(255, shade + 20); d[i + 2] = Math.min(255, shade + 28); d[i + 3] = a * 255;
      }
      ctx.putImageData(img, 0, 0);
      const cloudTex = new THREE.CanvasTexture(c); cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping; cloudTex.repeat.set(4, 4);
      const cloudGeo = new THREE.PlaneGeometry(9000, 9000); cloudGeo.rotateX(Math.PI / 2);
      this.clouds = new THREE.Mesh(cloudGeo, new THREE.MeshBasicMaterial({ map: cloudTex, color: 0xffffff, transparent: true, fog: false, depthWrite: false, opacity: 0.85 }));
      this.clouds.position.y = 520; this.group.add(this.clouds);
      const cloud2 = this.clouds.clone(); cloud2.material = this.clouds.material.clone(); cloud2.material.opacity = 0.25; cloud2.position.y = 760; cloud2.scale.set(1.6, 1, 1.6); this.group.add(cloud2); this.clouds2 = cloud2;
    }
    update(dt, camX, camZ) {
      const fc = EI.debug && EI.debug.freeCam; if (fc && fc.pos) { camX = fc.pos[0]; camZ = fc.pos[2]; }
      // the track draws its own detailed grass verge (named 'verge', ei-track shader): when present, our overlay ribbon steps aside
      if (!this._vergeChecked && this.env && this.env.vergeMesh) { this._vergeChecked = true; const tv = this.track.group && this.track.group.getObjectByName('verge'); if (tv && tv.material && tv.material.customProgramCacheKey && /ei-track/.test(tv.material.customProgramCacheKey())) { this.env.vergeMesh.visible = false; this.grassTint = [1.08, 1.4, 0.82]; } }
      if (this.grass) this.grass.update(dt, camX, camZ);
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
      return grp;
    }
    buildBuildings() {
      const t = this.track, sc = t.data.scenery; const pr = {}; const Env = EI.Env;
      const pitGroup = this.buildPitComplex(); if (pitGroup) this.group.add(pitGroup);
      // near-neutral facade textures (tinted per building by vertex colour); the top-left corner is a plain patch used by the roofs
      const mkTex = (draw) => { const [c, ctx] = Env.canvas(256, 128); draw(ctx); ctx.fillStyle = '#e6e6e6'; ctx.fillRect(0, 0, 12, 12); return Env.tex(c, true, 8); };
      const officeTex = mkTex(ctx => { ctx.fillStyle = '#ececec'; ctx.fillRect(0, 0, 256, 128); for (const y of [22, 86]) { ctx.fillStyle = '#41546b'; ctx.fillRect(0, y, 256, 26); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(0, y, 256, 5); ctx.fillStyle = '#c9c9c9'; for (let x = 0; x < 256; x += 32) ctx.fillRect(x, y, 3, 26); } ctx.fillStyle = '#d4d4d4'; ctx.fillRect(0, 60, 256, 4); ctx.fillRect(0, 124, 256, 4); });
      const hallTex = mkTex(ctx => { ctx.fillStyle = '#dcdcdc'; ctx.fillRect(0, 0, 256, 128); ctx.fillStyle = 'rgba(0,0,0,0.09)'; for (let x = 0; x < 256; x += 8) ctx.fillRect(x, 0, 3, 128); ctx.fillStyle = 'rgba(255,255,255,0.18)'; for (let x = 4; x < 256; x += 8) ctx.fillRect(x, 0, 1, 128); ctx.fillStyle = '#596574'; ctx.fillRect(40, 70, 70, 58); ctx.fillRect(170, 92, 40, 36); });
      const houseTex = mkTex(ctx => { ctx.fillStyle = '#efefef'; ctx.fillRect(0, 0, 256, 128); ctx.fillStyle = '#3c4654'; for (let x = 18; x < 256; x += 56) { ctx.fillRect(x, 30, 26, 30); ctx.fillRect(x, 84, 26, 30); } ctx.fillStyle = '#ffffff'; for (let x = 18; x < 256; x += 56) { ctx.fillRect(x - 2, 58, 30, 4); ctx.fillRect(x - 2, 112, 30, 4); } });
      const tints = { hall: [0xd9dcdf, 0xc9d1d8, 0xbfc5c9, 0xe6e2d6, 0x9fb0bd, 0x8d9b88, 0xe9e9e4], office: [0xffffff, 0xe8e8e8, 0xdde3ea, 0xf1ece2], house: [0xffffff, 0xe9dccb, 0xb88a6c, 0xd8d0c4, 0xa77a5c] };
      const roofs = [0xb9bcbf, 0x8f9499, 0x6e7177, 0xcfd1d2, 0x7c6a5c];
      const lists = { office: [], hall: [], house: [] }; const col = new THREE.Color(), roofC = new THREE.Color(); let k = 0;
      for (const b of sc.buildings) {
        const poly = b.p; const area = Math.abs(U.polyArea(poly)); if (poly.length < 3 || area < 60) continue;
        let clear = true, cx = 0, cz = 0, minY = Infinity;
        for (const q of poly) { t.project(q[0], q[1], null, pr); if (pr.dist < Math.max(t.wallL[pr.i], t.wallR[pr.i]) + 1) { clear = false; break; } cx += q[0]; cz += q[1]; minY = Math.min(minY, this.height(q[0], q[1])); }
        if (!clear) continue; cx /= poly.length; cz /= poly.length;
        if (this.pitBox && Math.hypot(cx - this.pitBox.cx, cz - this.pitBox.cz) < this.pitBox.r) continue;
        const shape = new THREE.Shape(); shape.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < poly.length; i++) shape.lineTo(poly[i][0], poly[i][1]); shape.closePath();
        const h = b.h ? Math.min(b.h, 24) : (area > 2500 ? 9 + Math.min(8, area / 1500) : area > 500 ? 6 + Math.min(6, area / 400) : 3.5 + Math.min(3, area / 80));
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
  EI.Scenery = Scenery;
})();
