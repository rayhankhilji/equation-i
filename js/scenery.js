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
      this.buildTerrain();
      this.buildSky();
      this.buildStands();
      this.buildBuildings();
      this.buildWater();
      this.buildTrees();
      return this.group;
    }

    // ---------------------------------------------------------------- terrain: heightfield blended to the track elevation
    buildTerrain() {
      const t = this.track; const size = 4400, segs = 220; this.tSize = size; this.tSegs = segs;
      const geo = new THREE.PlaneGeometry(size, size, segs, segs); geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position; const n = p.count;
      const heights = new Float32Array((segs + 1) * (segs + 1)); this.heights = heights;
      const cols = new Float32Array(n * 3);
      const seedCell = 190; const pal = [0x3a6a22, 0x47782a, 0x52842e, 0x5e8a32, 0xa08f44, 0x8f7a36, 0x6a4f2c, 0x437028, 0x376424];
      const cellColor = (cx, cz) => { const h = U.noise2(cx * 12.9898 + 3.7, cz * 78.233 + 1.3); return pal[Math.floor(h * pal.length) % pal.length]; };
      const seed = (cx, cz) => [cx * seedCell + U.noise2(cx * 3.1, cz * 7.7) * seedCell, cz * seedCell + U.noise2(cx * 9.3, cz * 2.2) * seedCell];
      this.cellOf = (x, z) => {
        const cx0 = Math.floor(x / seedCell), cz0 = Math.floor(z / seedCell); let best = null, bd = Infinity;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const s = seed(cx0 + dx, cz0 + dz); const d = (s[0] - x) ** 2 + (s[1] - z) ** 2; if (d < bd) { bd = d; best = (cx0 + dx) * 1000 + (cz0 + dz); } }
        return best;
      };
      const circuitGreen = new THREE.Color(0x3b7024), tmp = new THREE.Color();
      const pr = {};
      for (let i = 0; i < n; i++) {
        const x = p.getX(i), z = p.getZ(i);
        t.project(x, z, null, pr);
        const d = pr.dist; const wall = Math.max(t.wallL[pr.i], t.wallR[pr.i]);
        const base = (U.fbm(x / 900 + 10, z / 900 + 10, 4) - 0.5) * 34 + (U.fbm(x / 250, z / 250, 3) - 0.5) * 6;
        const w = U.smoothstep(wall + 20, wall + 160, d);
        const trackY = t.y[pr.i];
        // keep the whole circuit area close to the track level, roll the countryside beyond
        const h = U.lerp(trackY, trackY + base * w, w);
        p.setY(i, h); heights[i] = h;
        // colour: circuit grass near the track, patchwork fields beyond, with noise
        let c;
        if (d < wall + 90) c = circuitGreen; else { const id = this.cellOf(x, z); c = tmp.setHex(cellColor(Math.floor(id / 1000), id % 1000)); }
        const nz = (U.noise2(x / 23, z / 23) - 0.5) * 0.08;
        cols[i * 3] = c.r + nz; cols[i * 3 + 1] = c.g + nz; cols[i * 3 + 2] = c.b + nz;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); geo.computeVertexNormals();
      const grass = U.grainTexture(256, 0xffffff, 0.09, 600, 3);
      const mat = new THREE.MeshStandardMaterial({ map: grass, normalMap: U.normalTexture(256, 8, 1.6, 600, 5), vertexColors: true, roughness: 1.0, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 8 });
      const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.name = 'terrain'; this.group.add(m);
    }
    height(x, z) {
      const size = this.tSize, segs = this.tSegs; const fx = (x + size / 2) / size * segs, fz = (z + size / 2) / size * segs;
      const ix = U.clamp(Math.floor(fx), 0, segs - 1), iz = U.clamp(Math.floor(fz), 0, segs - 1); const tx = fx - ix, tz = fz - iz; const W = segs + 1;
      const h00 = this.heights[iz * W + ix], h10 = this.heights[iz * W + ix + 1], h01 = this.heights[(iz + 1) * W + ix], h11 = this.heights[(iz + 1) * W + ix + 1];
      return U.lerp(U.lerp(h00, h10, tx), U.lerp(h01, h11, tx), tz);
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
      if (this.clouds) { this.clouds.material.map.offset.x += dt * 0.0015; this.clouds.position.x = camX; this.clouds.position.z = camZ; this.clouds2.position.x = camX; this.clouds2.position.z = camZ; this.clouds2.material.map.offset.x += dt * 0.0008; }
    }

    // ---------------------------------------------------------------- grandstands: tiered seating, roof, instanced crowd
    buildStands() {
      const t = this.track, sc = t.data.scenery; const rng = this.rng;
      const stepGeos = [], roofGeos = [], postGeos = []; const crowd = [];
      const pr = {};
      const tmpM = new THREE.Matrix4();
      for (const st of sc.grandstands) {
        const poly = st.p; if (poly.length < 3) continue;
        // orient to the nearest track tangent
        let cx = 0, cz = 0; for (const q of poly) { cx += q[0]; cz += q[1]; } cx /= poly.length; cz /= poly.length;
        t.project(cx, cz, null, pr); if (pr.dist < t.halfWidth + 8) continue;
        const i = pr.i; const tx = t.tx[i], tz = t.tz[i]; const side = pr.lat > 0 ? 1 : -1; const nx = t.nx[i] * side, nz = t.nz[i] * side; // n points away from the track
        let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
        for (const q of poly) { const dx = q[0] - cx, dz = q[1] - cz; const a = dx * tx + dz * tz, b = dx * nx + dz * nz; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
        const len = a1 - a0, depth = Math.min(b1 - b0, 26); if (len < 10 || depth < 5) continue;
        const rows = Math.max(4, Math.min(22, Math.floor(depth / 1.1)));
        const baseY = this.height(cx, cz) - 0.5;
        const frontB = b0; // nearest edge to the track
        const place = (a, b, y) => [cx + tx * a + nx * b, y, cz + tz * a + nz * b];
        const yaw = Math.atan2(nx, nz); // rotation so local +z points away from the track
        const basis = new THREE.Matrix4().makeRotationY(Math.atan2(-nz, -nx) + Math.PI / 2 - Math.PI / 2);
        // local frame: +x along tangent, +z away from the track
        const rot = new THREE.Matrix4().makeBasis(new THREE.Vector3(tx, 0, tz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, 0, nz));
        const addBox = (arr, w, h, d, lx, ly, lz, color) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(lx, ly, lz); g.applyMatrix4(rot); g.translate(cx, baseY, cz); g.userData.color = color; arr.push(g); };
        const seatColors = [0x2b2f3a, 0x323744];
        for (let r = 0; r < rows; r++) {
          const y = 1.2 + r * 0.55, z = frontB + 1.5 + r * 1.1;
          addBox(stepGeos, len, 0.55, 1.1, (a0 + a1) / 2, y + 0.275, z, new THREE.Color(seatColors[r % 2]));
          // crowd on this row
          const seats = Math.floor(len / 0.62);
          for (let s = 0; s < seats; s++) {
            if (rng() > 0.82) continue;
            const a = a0 + 0.3 + s * 0.62 + (rng() - 0.5) * 0.2; const pos = place(a, z - 0.1, baseY + y + 0.55);
            crowd.push({ pos, yaw: Math.atan2(-nx, -nz), scale: 0.9 + rng() * 0.25 });
          }
        }
        // structure: front wall, back wall, side walls, roof on posts
        addBox(stepGeos, len, 1.2, 0.3, (a0 + a1) / 2, 0.6, frontB + 1.0, new THREE.Color(0xd8dadd));
        const backZ = frontB + 1.5 + rows * 1.1, topY = 1.2 + rows * 0.55;
        addBox(stepGeos, len, topY + 2, 0.5, (a0 + a1) / 2, (topY + 2) / 2, backZ, new THREE.Color(0xc9ccd0));
        addBox(roofGeos, len + 2, 0.35, backZ - frontB + 3, (a0 + a1) / 2, topY + 4.2, (frontB + backZ) / 2, new THREE.Color(0xeef0f2));
        for (let a = a0; a <= a1 + 0.1; a += Math.max(8, len / 6)) { addBox(postGeos, 0.3, topY + 4.2, 0.3, a, (topY + 4.2) / 2, backZ - 0.6, new THREE.Color(0x9aa0a6)); addBox(postGeos, 0.3, topY + 4.2 - 1.2, 0.3, a, 1.2 + (topY + 3) / 2, frontB + 1.2, new THREE.Color(0x9aa0a6)); }
      }
      const standMesh = new THREE.Mesh(mergeGeos(stepGeos, true), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })); standMesh.castShadow = true; standMesh.receiveShadow = true; this.group.add(standMesh);
      if (roofGeos.length) { const roof = new THREE.Mesh(mergeGeos(roofGeos.concat(postGeos), true), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 })); roof.castShadow = true; this.group.add(roof); }
      // crowd: instanced billboards with a person silhouette
      const pc = document.createElement('canvas'); pc.width = 32; pc.height = 64; const pctx = pc.getContext('2d');
      pctx.fillStyle = '#fff'; pctx.beginPath(); pctx.arc(16, 10, 7, 0, 6.283); pctx.fill(); pctx.fillRect(6, 18, 20, 30); pctx.fillRect(8, 48, 6, 16); pctx.fillRect(18, 48, 6, 16);
      const ptex = new THREE.CanvasTexture(pc);
      const quad = new THREE.PlaneGeometry(0.55, 1.1); quad.translate(0, 0.55, 0);
      const inst = new THREE.InstancedMesh(quad, new THREE.MeshLambertMaterial({ map: ptex, alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: ptex, emissiveIntensity: 0.12 }), crowd.length);
      const q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(); const up = new THREE.Vector3(0, 1, 0);
      const palette = [0xe63946, 0xf1faee, 0xa8dadc, 0x457b9d, 0xffb703, 0xfb8500, 0x8ecae6, 0x219ebc, 0xffffff, 0x222222, 0x06d6a0, 0xef476f, 0x1d3557, 0xe10600, 0xff8000, 0x333333];
      const col = new THREE.Color();
      crowd.forEach((c, k) => { v.set(c.pos[0], c.pos[1], c.pos[2]); q.setFromAxisAngle(up, c.yaw); s.set(c.scale, c.scale, 1); tmpM.compose(v, q, s); inst.setMatrixAt(k, tmpM); inst.setColorAt(k, col.setHex(palette[Math.floor(rng() * palette.length)])); });
      inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.name = 'crowd'; this.group.add(inst); this.crowdCount = crowd.length;
    }

    // ---------------------------------------------------------------- buildings from OSM footprints, seated on the terrain
    buildBuildings() {
      const t = this.track, sc = t.data.scenery; const pr = {};
      const windowTex = (function () { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const ctx = c.getContext('2d'); ctx.fillStyle = '#b9bcc2'; ctx.fillRect(0, 0, 128, 64); ctx.fillStyle = '#3f5f80'; for (let x = 6; x < 128; x += 16) ctx.fillRect(x, 12, 10, 24); ctx.fillStyle = '#9ea2a8'; ctx.fillRect(0, 40, 128, 4); const tt = new THREE.CanvasTexture(c); tt.wrapS = tt.wrapT = THREE.RepeatWrapping; return tt; })();
      const glassTex = (function () { const c = document.createElement('canvas'); c.width = 128; c.height = 128; const ctx = c.getContext('2d'); ctx.fillStyle = '#e4e6ea'; ctx.fillRect(0, 0, 128, 128); ctx.fillStyle = '#5f7f9f'; ctx.fillRect(0, 20, 128, 34); ctx.fillRect(0, 76, 128, 34); ctx.fillStyle = 'rgba(255,255,255,0.35)'; for (let x = 0; x < 128; x += 16) ctx.fillRect(x, 20, 2, 90); ctx.fillStyle = '#c9ccd2'; ctx.fillRect(0, 0, 128, 6); const tt = new THREE.CanvasTexture(c); tt.wrapS = tt.wrapT = THREE.RepeatWrapping; return tt; })();
      const plain = [], glass = [], roofs = [];
      // the pit complex: the largest footprint within 250 m of the start line gets the glass "Wing" treatment
      let wing = null, wingArea = 0; const sfi = t.idxAtS(t.sf);
      for (const b of sc.buildings) { let cx = 0, cz = 0; for (const q of b.p) { cx += q[0]; cz += q[1]; } cx /= b.p.length; cz /= b.p.length; const d = Math.hypot(cx - t.x[sfi], cz - t.z[sfi]); const a = Math.abs(U.polyArea(b.p)); if (d < 300 && a > wingArea) { wingArea = a; wing = b; } }
      for (const b of sc.buildings) {
        const poly = b.p; if (poly.length < 3 || Math.abs(U.polyArea(poly)) < 60) continue;
        let clear = true, cx = 0, cz = 0, minY = Infinity;
        for (const q of poly) { t.project(q[0], q[1], null, pr); if (pr.dist < Math.max(t.wallL[pr.i], t.wallR[pr.i]) + 1) { clear = false; break; } cx += q[0]; cz += q[1]; minY = Math.min(minY, this.height(q[0], q[1])); }
        if (!clear) continue; cx /= poly.length; cz /= poly.length;
        const shape = new THREE.Shape(); shape.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < poly.length; i++) shape.lineTo(poly[i][0], poly[i][1]); shape.closePath();
        const isWing = b === wing;
        const h = isWing ? 16 : (b.h ? Math.min(b.h, 24) : 4 + Math.min(8, Math.sqrt(Math.abs(U.polyArea(poly))) * 0.12));
        const geo = new THREE.ExtrudeGeometry(shape, { depth: h + 2, bevelEnabled: false }); geo.rotateX(Math.PI / 2); geo.translate(0, h + minY - 1, 0);
        const p = geo.attributes.position, uv = geo.attributes.uv, nrm = geo.attributes.normal;
        for (let i = 0; i < p.count; i++) { const nx = nrm.getX(i), ny = nrm.getY(i); if (Math.abs(ny) > 0.5) uv.setXY(i, p.getX(i) * 0.05, p.getZ(i) * 0.05); else uv.setXY(i, (Math.abs(nx) > 0.5 ? p.getZ(i) : p.getX(i)) * (isWing ? 0.12 : 0.25), p.getY(i) * (isWing ? 0.125 : 0.25)); }
        (isWing ? glass : plain).push(geo);
        if (isWing) { // red roof accent band
          const r = new THREE.ExtrudeGeometry(shape, { depth: 1.2, bevelEnabled: false }); r.rotateX(Math.PI / 2); r.translate(0, h + minY + 0.2, 0); r.userData.color = new THREE.Color(0xc8102e); roofs.push(r);
        }
      }
      if (plain.length) { const m = new THREE.Mesh(mergeGeos(plain), new THREE.MeshStandardMaterial({ map: U.srgb(windowTex), roughness: 0.7 })); m.castShadow = true; m.receiveShadow = true; this.group.add(m); }
      if (glass.length) { const m = new THREE.Mesh(mergeGeos(glass), new THREE.MeshStandardMaterial({ map: U.srgb(glassTex), roughness: 0.25, metalness: 0.5 })); m.castShadow = true; this.group.add(m); }
      if (roofs.length) this.group.add(new THREE.Mesh(mergeGeos(roofs, true), new THREE.MeshLambertMaterial({ vertexColors: true })));
    }

    buildWater() {
      for (const w of this.track.data.scenery.water) {
        if (w.length < 3) continue; let y = Infinity; for (const q of w) y = Math.min(y, this.height(q[0], q[1]));
        const shape = new THREE.Shape(); shape.moveTo(w[0][0], w[0][1]); for (let i = 1; i < w.length; i++) shape.lineTo(w[i][0], w[i][1]);
        const geo = new THREE.ShapeGeometry(shape); geo.rotateX(Math.PI / 2);
        const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x2f5f98, roughness: 0.08, metalness: 0.6, side: THREE.DoubleSide })); m.position.y = y + 0.3; this.group.add(m);
      }
    }

    // ---------------------------------------------------------------- trees: woods polygons, hedgerows on field boundaries, ring around the circuit
    buildTrees() {
      const t = this.track, rng = this.rng, pr = {};
      // painted canopy + trunk on a cross of two quads (alpha tested), far cheaper and softer than polyhedra
      const tc = document.createElement('canvas'); tc.width = 256; tc.height = 256; const tctx = tc.getContext('2d'); tctx.clearRect(0, 0, 256, 256);
      tctx.fillStyle = '#4a3220'; tctx.fillRect(120, 150, 16, 106);
      const r0 = U.rng(13); const greens = ['#2f6b2a', '#356f2c', '#3f7a33', '#2a5e26', '#4a8238', '#2c6329'];
      for (let i = 0; i < 160; i++) { const ang = r0() * Math.PI * 2, rad = Math.pow(r0(), 0.6) * 95; const x = 128 + Math.cos(ang) * rad, y = 110 + Math.sin(ang) * rad * 0.85; tctx.fillStyle = greens[Math.floor(r0() * greens.length)]; tctx.beginPath(); tctx.arc(x, y, 10 + r0() * 16, 0, 6.283); tctx.fill(); }
      for (let i = 0; i < 60; i++) { const ang = r0() * Math.PI * 2, rad = Math.pow(r0(), 0.7) * 80; tctx.fillStyle = 'rgba(120,180,90,0.45)'; tctx.beginPath(); tctx.arc(128 + Math.cos(ang) * rad - 6, 100 + Math.sin(ang) * rad * 0.85 - 8, 6 + r0() * 9, 0, 6.283); tctx.fill(); }
      const ttex = new THREE.CanvasTexture(tc); ttex.encoding = THREE.sRGBEncoding;
      const q1 = new THREE.PlaneGeometry(9, 9); q1.translate(0, 4.5, 0); const q2 = q1.clone(); q2.rotateY(Math.PI / 2);
      const geo = mergeGeos([q1, q2]);
      this.treeMat = new THREE.MeshLambertMaterial({ map: ttex, alphaTest: 0.45, side: THREE.DoubleSide, emissive: 0x6a8a5a, emissiveMap: ttex, emissiveIntensity: 0.6 });
      const places = [];
      const okSpot = (x, z, margin) => { t.project(x, z, null, pr); return pr.dist > Math.max(t.wallL[pr.i], t.wallR[pr.i]) + margin; };
      for (const w of t.data.scenery.woods) {
        const b = U.polyBounds(w); const area = Math.abs(U.polyArea(w)); const count = Math.min(450, Math.floor(area / 320)); let tries = 0, got = 0;
        while (got < count && tries < count * 4) { tries++; const x = U.lerp(b.x0, b.x1, rng()), z = U.lerp(b.z0, b.z1, rng()); if (!U.pointInPoly(x, z, w) || !okSpot(x, z, 6)) continue; places.push([x, z]); got++; }
      }
      // hedgerows: walk a grid, drop trees where the field cell changes
      const half = 2100, step = 14;
      for (let z = -half; z < half; z += step) for (let x = -half; x < half; x += step) {
        if (places.length > 5200) break;
        const id = this.cellOf(x, z); if (id === this.cellOf(x + step, z) && id === this.cellOf(x, z + step)) continue;
        if (rng() > 0.35) continue; if (!okSpot(x, z, 60)) continue;
        places.push([x + (rng() - 0.5) * 6, z + (rng() - 0.5) * 6]);
      }
      // scattered trees just outside the circuit fences
      for (let i = 0; i < t.n; i += 12) for (const side of [-1, 1]) { if (rng() < 0.65) continue; const wall = side < 0 ? t.wallL[i] : t.wallR[i]; const d = wall + 16 + rng() * 30; places.push([t.x[i] + t.nx[i] * side * d, t.z[i] + t.nz[i] * side * d, 0.55 + rng() * 0.35]); }
      const inst = new THREE.InstancedMesh(geo, this.treeMat, places.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      places.forEach((pl, i) => { const s = pl[2] || (0.7 + rng() * 0.8); sc.set(s, s * (0.9 + rng() * 0.4), s); p.set(pl[0], this.height(pl[0], pl[1]) - 0.1, pl[1]); q.setFromAxisAngle(up, rng() * Math.PI); m.compose(p, q, sc); inst.setMatrixAt(i, m); });
      inst.castShadow = true; inst.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: ttex, alphaTest: 0.45 }); inst.name = 'trees'; this.group.add(inst); this.treeCount = places.length;
    }
  }
  EI.Scenery = Scenery;
})();
