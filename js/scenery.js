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
      this.timings = {}; let tm = performance.now(); const lap = (k) => { this.timings[k] = Math.round(performance.now() - tm); tm = performance.now(); };
      this.buildTerrain(); lap('thisbuildTerrain');
      this.buildSky(); lap('thisbuildSky');
      this.buildStands(); lap('thisbuildStands');
      this.buildBuildings(); lap('thisbuildBuildings');
      this.buildWater(); lap('thisbuildWater');
      this.buildTrees(); lap('thisbuildTrees');
      if (EI.Infra) this.group.add(EI.Infra.build(this.track, this)); lap('ifEIInfrathisgroupaddEII');
      return this.group;
    }

    // ---------------------------------------------------------------- terrain: heightfield blended to the track elevation
    buildTerrain() {
      const t = this.track; const size = 4400, segs = 220; this.tSize = size; this.tSegs = segs;
      const geo = new THREE.PlaneGeometry(size, size, segs, segs); geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position; const n = p.count;
      const heights = new Float32Array((segs + 1) * (segs + 1)); this.heights = heights;
      const cols = new Float32Array(n * 3);
      const seedCell = 190; const pal = [0x3c7a1f, 0x4a8a28, 0x56962c, 0x649c30, 0xb39a3c, 0x9c8430, 0x6e4f2a, 0x45802a, 0x3a7222];
      const cellColor = (cx, cz) => { const h = U.noise2(cx * 12.9898 + 3.7, cz * 78.233 + 1.3); return pal[Math.floor(h * pal.length) % pal.length]; };
      const seed = (cx, cz) => [cx * seedCell + U.noise2(cx * 3.1, cz * 7.7) * seedCell, cz * seedCell + U.noise2(cx * 9.3, cz * 2.2) * seedCell];
      this.cellOf = (x, z) => {
        const cx0 = Math.floor(x / seedCell), cz0 = Math.floor(z / seedCell); let best = null, bd = Infinity;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const s = seed(cx0 + dx, cz0 + dz); const d = (s[0] - x) ** 2 + (s[1] - z) ** 2; if (d < bd) { bd = d; best = (cx0 + dx) * 1000 + (cz0 + dz); } }
        return best;
      };
      const circuitGreen = new THREE.Color(0x3f7f22), tmp = new THREE.Color();
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
      const stepGeos = [], roofGeos = [], postGeos = [], frontGeos = []; const crowd = [], flags = [];
      const pr = {};
      const tmpM = new THREE.Matrix4();
      const beamColor = new THREE.Color(0x9aa0a6), towerColor = new THREE.Color(0xb5b8bd), ledgeColor = new THREE.Color(0x8e9196);
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
        // square-section beam between two local points (truss members)
        const addBeam = (arr, a, b, th, color) => { const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]; const l = Math.hypot(dx, dy, dz); if (l < 0.05) return; const g = new THREE.BoxGeometry(th, th, l); g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(dx / l, dy / l, dz / l)))); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); g.applyMatrix4(rot); g.translate(cx, baseY, cz); g.userData.color = color; arr.push(g); };
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
        const roofY = topY + 4.2, frontZ = frontB + 1.2, roofFront = frontB - 1.5 + 0.8;
        for (let a = a0; a <= a1 + 0.1; a += Math.max(8, len / 6)) {
          addBox(postGeos, 0.3, roofY, 0.3, a, roofY / 2, backZ - 0.6, beamColor); addBox(postGeos, 0.3, roofY - 1.2, 0.3, a, 1.2 + (topY + 3) / 2, frontZ, beamColor);
          // roof truss: top chord under the slab, bottom chord 1.1 m lower, zig-zag diagonals, cantilevered over the front rows
          const yTop = roofY - 0.2, yBot = roofY - 1.3; addBeam(postGeos, [a, yTop, roofFront], [a, yTop, backZ + 0.8], 0.16, beamColor); addBeam(postGeos, [a, yBot, roofFront + 1.2], [a, yBot, backZ + 0.3], 0.16, beamColor);
          const span = backZ - roofFront; const nd = Math.max(3, Math.round(span / 2.4));
          for (let k = 0; k < nd; k++) { const z0 = roofFront + 1.2 + (span - 1.5) * k / nd, z1 = roofFront + 1.2 + (span - 1.5) * (k + 0.5) / nd, z2 = roofFront + 1.2 + (span - 1.5) * (k + 1) / nd; addBeam(postGeos, [a, yBot, z0], [a, yTop, z1], 0.1, beamColor); addBeam(postGeos, [a, yTop, z1], [a, yBot, z2], 0.1, beamColor); addBeam(postGeos, [a, yBot, z0], [a, yTop, z0], 0.08, beamColor); }
          addBeam(postGeos, [a, yBot, frontZ + 0.3], [a, 1.2 + (topY + 3) / 2 + (roofY - 1.2) / 2 - 2.0, frontZ], 0.1, beamColor); // knee brace
        }
        // longitudinal purlins tying the trusses together
        for (const z of [roofFront + 1.6, (roofFront + backZ) / 2, backZ - 0.5]) addBeam(postGeos, [a0 - 0.5, roofY - 1.3, z], [a1 + 0.5, roofY - 1.3, z], 0.12, beamColor);
        // back-wall cladding: a dark glazed band, a red fascia along the top and vertical ribs
        addBox(stepGeos, len, 1.6, 0.12, (a0 + a1) / 2, Math.max(2.5, topY * 0.45), backZ + 0.3, new THREE.Color(0x3c4654));
        addBox(stepGeos, len + 0.2, 0.7, 0.14, (a0 + a1) / 2, topY + 1.5, backZ + 0.3, new THREE.Color(0xc8102e));
        for (let a = a0 + 3; a < a1 - 1; a += 6) addBox(stepGeos, 0.25, topY + 1.6, 0.3, a, (topY + 1.6) / 2, backZ + 0.3, new THREE.Color(0xa9adb3));
        // stair towers at both ends: a tower with cantilevered landings and a dark door
        for (const ea of [a0 - 2.0, a1 + 2.0]) {
          addBox(stepGeos, 3.4, topY + 2.6, 4.2, ea, (topY + 2.6) / 2, backZ - 2.0, towerColor);
          for (let y = 2.2; y < topY + 1; y += 2.2) addBox(stepGeos, 3.6, 0.22, 4.4, ea, y, backZ - 2.0, ledgeColor);
          addBox(stepGeos, 1.2, 2.1, 0.2, ea, 1.05, backZ + 0.15, new THREE.Color(0x30333a));
          addBox(stepGeos, 3.6, 0.3, 4.4, ea, topY + 2.75, backZ - 2.0, new THREE.Color(0xdfe1e4));
        }
        // sponsor strip on the track side of the front wall
        const strip = new THREE.PlaneGeometry(len, 1.0); strip.rotateY(Math.PI); const suv = strip.attributes.uv; for (let v = 0; v < suv.count; v++) suv.setXY(v, suv.getX(v) * len / 5, suv.getY(v)); strip.translate((a0 + a1) / 2, 0.62, frontB + 0.84); strip.applyMatrix4(rot); strip.translate(cx, baseY, cz); frontGeos.push(strip);
        // flag poles behind the stand
        for (let a = a0 + 3; a <= a1 - 2; a += 9) { const g = new THREE.CylinderGeometry(0.05, 0.08, 9.5, 6); g.translate(a, 4.75, backZ + 2.6); g.applyMatrix4(rot); g.translate(cx, baseY, cz); g.userData.color = beamColor; postGeos.push(g); flags.push({ pos: place(a, backZ + 2.6, baseY + 9.3), yaw: Math.atan2(nx, nz) }); }
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
      // sponsor strip along the stand fronts (one mesh, repeating brand texture)
      if (frontGeos.length) {
        const sc2 = document.createElement('canvas'); sc2.width = 2048; sc2.height = 128; const sctx = sc2.getContext('2d');
        const brands = [['EQUATION I', '#e10600', '#fff'], ['EIRELLI', '#ffd500', '#111'], ['SILVERSTONE', '#0b3d2e', '#fff'], ['DRS', '#1a73e8', '#fff'], ['KINETIK', '#0e0e0e', '#00e701'], ['EI', '#fff', '#e10600'], ['VECTOR', '#1434cb', '#fff'], ['APEX FUELS', '#f2f2f2', '#0c2b63']];
        brands.forEach((b, k) => { const x = k * 256; sctx.fillStyle = b[1]; sctx.fillRect(x, 0, 256, 128); sctx.fillStyle = b[2]; sctx.font = 'italic 900 ' + (b[0].length > 8 ? 36 : 48) + 'px Arial Black, Arial'; sctx.textAlign = 'center'; sctx.textBaseline = 'middle'; sctx.fillText(b[0], x + 128, 62); sctx.fillStyle = 'rgba(0,0,0,0.35)'; sctx.fillRect(x + 252, 0, 4, 128); });
        const stex = new THREE.CanvasTexture(sc2); stex.wrapS = stex.wrapT = THREE.RepeatWrapping; stex.anisotropy = 8; stex.encoding = THREE.sRGBEncoding;
        this.group.add(new THREE.Mesh(mergeGeos(frontGeos), new THREE.MeshStandardMaterial({ map: stex, roughness: 0.5 })));
      }
      // team flags on the poles behind the stands: instanced, gently waved planes coloured per instance
      if (flags.length) {
        const fc = document.createElement('canvas'); fc.width = 64; fc.height = 128; const fctx = fc.getContext('2d'); fctx.fillStyle = '#ffffff'; fctx.fillRect(0, 0, 64, 128);
        const fg = fctx.createLinearGradient(0, 0, 64, 0); fg.addColorStop(0, 'rgba(0,0,0,0.25)'); fg.addColorStop(0.3, 'rgba(255,255,255,0)'); fg.addColorStop(0.7, 'rgba(0,0,0,0.12)'); fg.addColorStop(1, 'rgba(0,0,0,0.3)'); fctx.fillStyle = fg; fctx.fillRect(0, 0, 64, 128);
        fctx.fillStyle = 'rgba(255,255,255,0.85)'; fctx.font = 'italic 900 34px Arial Black, Arial'; fctx.textAlign = 'center'; fctx.textBaseline = 'middle'; fctx.fillText('EI', 32, 64);
        const ftex = new THREE.CanvasTexture(fc); ftex.encoding = THREE.sRGBEncoding;
        const fgeo = new THREE.PlaneGeometry(1.6, 3.2, 6, 1); const fp = fgeo.attributes.position; for (let v = 0; v < fp.count; v++) { const x = fp.getX(v); fp.setZ(v, Math.sin((x + 0.8) * 3.6) * 0.16); } fgeo.translate(0.8, 0, 0); fgeo.computeVertexNormals();
        const finst = new THREE.InstancedMesh(fgeo, new THREE.MeshStandardMaterial({ map: ftex, side: THREE.DoubleSide, roughness: 0.8 }), flags.length);
        const teams = EI.TEAMS || [{ primary: '#e10600' }]; const fcol = new THREE.Color();
        flags.forEach((f, k) => { v.set(f.pos[0], f.pos[1] - 1.6, f.pos[2]); q.setFromAxisAngle(up, f.yaw + Math.PI / 2 + (rng() - 0.5) * 0.5); s.set(1, 1, 1); tmpM.compose(v, q, s); finst.setMatrixAt(k, tmpM); finst.setColorAt(k, fcol.set(teams[Math.floor(rng() * teams.length)].primary)); });
        finst.instanceColor.needsUpdate = true; finst.name = 'flags'; this.group.add(finst); this.flagCount = flags.length;
      }
    }

    // ---------------------------------------------------------------- pit complex (designed) + OSM buildings with proper facades
    buildPitComplex() {
      const t = this.track; const pit = t.data.pit; if (!pit || pit.length < 3) return null;
      // pit lane direction and the side away from the track
      const a = pit[Math.floor(pit.length * 0.2)], b = pit[Math.floor(pit.length * 0.8)]; const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      let dx = b[0] - a[0], dz = b[1] - a[1]; const len = Math.hypot(dx, dz); dx /= len; dz /= len;
      const pr = t.project(mid[0], mid[1], null); const side = pr.lat > 0 ? 1 : -1; const nx = t.nx[pr.i] * side, nz = t.nz[pr.i] * side; // away from track
      const baseY = t.y[pr.i];
      const L = Math.min(len * 0.9, 320), D = 22;
      const rot = new THREE.Matrix4().makeBasis(new THREE.Vector3(dx, 0, dz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, 0, nz));
      const grp = new THREE.Group(); grp.applyMatrix4(rot); grp.position.set(mid[0] + nx * 8, baseY, mid[1] + nz * 8);
      const white = new THREE.MeshStandardMaterial({ color: 0xe9ebee, roughness: 0.55, metalness: 0.1 });
      const red = new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.5 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.8 });
      const glassTex = (function () { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const ctx = c.getContext('2d'); ctx.fillStyle = '#56779a'; ctx.fillRect(0, 0, 256, 64); ctx.fillStyle = 'rgba(255,255,255,0.35)'; for (let x = 0; x < 256; x += 16) ctx.fillRect(x, 0, 2, 64); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 30, 256, 3); const tt = new THREE.CanvasTexture(c); tt.wrapS = tt.wrapT = THREE.RepeatWrapping; tt.repeat.set(40, 1); tt.encoding = THREE.sRGBEncoding; return tt; })();
      const glass = new THREE.MeshStandardMaterial({ map: glassTex, roughness: 0.15, metalness: 0.7 });
      // ground floor: garages (dark openings) separated by white piers, 2nd floor glass band, 3rd floor white, roof slab cantilevered toward the pit lane
      const ground = new THREE.Mesh(new THREE.BoxGeometry(L, 4.5, D), white); ground.position.set(0, 2.25, D / 2); grp.add(ground);
      const nGar = Math.floor(L / 10);
      for (let i = 0; i < nGar; i++) {
        const x = -L / 2 + 5 + i * 10; const door = new THREE.Mesh(new THREE.BoxGeometry(7.6, 3.6, 0.3), dark); door.position.set(x, 1.8, 0.05); grp.add(door);
        const team = EI.TEAMS[i % EI.TEAMS.length];
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 0.7), new THREE.MeshBasicMaterial({ map: U.srgb(U.textTexture(team.name.toUpperCase(), { w: 512, h: 48, bg: team.primary, color: team.accent, size: 30, font: 'italic 900 Arial Black, Arial' })) })); sign.position.set(x, 4.1, -0.12); sign.rotation.y = Math.PI; grp.add(sign);
      }
      const band = new THREE.Mesh(new THREE.BoxGeometry(L, 3.2, D - 1), glass); band.position.set(0, 6.1, D / 2 - 0.3); grp.add(band);
      const top = new THREE.Mesh(new THREE.BoxGeometry(L, 2.6, D - 2), white); top.position.set(0, 9.0, D / 2 - 0.6); grp.add(top);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(L + 6, 0.5, D + 10), white); roof.position.set(0, 10.5, D / 2 - 5); grp.add(roof);
      const accentBand = new THREE.Mesh(new THREE.BoxGeometry(L + 6.1, 0.8, 0.3), red); accentBand.position.set(0, 10.6, -5.1); grp.add(accentBand);
      // roof wedge (the sweeping Wing roof) and name on the facade
      const wedge = new THREE.Mesh(new THREE.BoxGeometry(L * 0.5, 3, D * 0.6), white); wedge.position.set(L * 0.1, 12, D * 0.5); wedge.rotation.z = 0.06; grp.add(wedge);
      const name = new THREE.Mesh(new THREE.PlaneGeometry(40, 2.2), new THREE.MeshBasicMaterial({ map: U.srgb(U.textTexture('EQUATION I  ·  SILVERSTONE', { w: 1024, h: 64, bg: '#e9ebee', color: '#c8102e', size: 44, font: 'italic 900 Arial Black, Arial' })) })); name.position.set(0, 9.1, -0.62); name.rotation.y = Math.PI; grp.add(name);
      // hospitality balcony on the track side of the 2nd floor and support columns
      for (let x = -L / 2 + 3; x < L / 2; x += 12) { const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 10.5, 8), white); col.position.set(x, 5.25, -4.6); grp.add(col); }
      // pit wall on the track side of the pit lane with a row of team stands
      const wallOff = -(16 + 4); const pw = new THREE.Mesh(new THREE.BoxGeometry(L, 1.0, 0.4), new THREE.MeshStandardMaterial({ color: 0xd9d9d6, roughness: 0.9 })); pw.position.set(0, 0.5, wallOff); grp.add(pw);
      for (let x = -L / 2 + 8; x < L / 2 - 8; x += 11) { const stand = new THREE.Mesh(new THREE.BoxGeometry(8, 2.6, 2.2), dark); stand.position.set(x, 2.3, wallOff + 1.5); grp.add(stand); const canopy = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.15, 2.8), white); canopy.position.set(x, 3.7, wallOff + 1.5); grp.add(canopy); }
      grp.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.pitBox = { cx: mid[0] + nx * (8 + D / 2), cz: mid[1] + nz * (8 + D / 2), r: L / 2 + 30 };
      return grp;
    }
    buildBuildings() {
      const t = this.track, sc = t.data.scenery; const pr = {};
      const pitGroup = this.buildPitComplex(); if (pitGroup) this.group.add(pitGroup);
      const mkTex = (draw) => { const c = document.createElement('canvas'); c.width = 256; c.height = 128; const ctx = c.getContext('2d'); draw(ctx); const tt = new THREE.CanvasTexture(c); tt.wrapS = tt.wrapT = THREE.RepeatWrapping; tt.encoding = THREE.sRGBEncoding; return tt; };
      const officeTex = mkTex(ctx => { ctx.fillStyle = '#d6d8dc'; ctx.fillRect(0, 0, 256, 128); ctx.fillStyle = '#5a7390'; for (let x = 8; x < 256; x += 32) ctx.fillRect(x, 24, 20, 40); ctx.fillStyle = '#b9bcc2'; ctx.fillRect(0, 70, 256, 6); ctx.fillStyle = 'rgba(255,255,255,0.4)'; for (let x = 8; x < 256; x += 32) ctx.fillRect(x, 24, 20, 6); });
      const hallTex = mkTex(ctx => { ctx.fillStyle = '#c9c6bd'; ctx.fillRect(0, 0, 256, 128); ctx.fillStyle = '#b7b3a8'; for (let x = 0; x < 256; x += 24) ctx.fillRect(x, 0, 2, 128); ctx.fillStyle = '#4e5a68'; ctx.fillRect(0, 86, 256, 24); ctx.fillStyle = '#9a968c'; ctx.fillRect(0, 0, 256, 8); });
      const brickTex = mkTex(ctx => { ctx.fillStyle = '#b08a6e'; ctx.fillRect(0, 0, 256, 128); ctx.fillStyle = '#9b7658'; for (let y = 0; y < 128; y += 10) for (let x = (y / 10) % 2 ? 0 : 12; x < 256; x += 24) ctx.fillRect(x, y, 22, 8); ctx.fillStyle = '#5a7390'; for (let x = 20; x < 256; x += 64) ctx.fillRect(x, 40, 22, 34); });
      const plain = [], office = [], hall = [], brick = [], parapets = [];
      for (const b of sc.buildings) {
        const poly = b.p; const area = Math.abs(U.polyArea(poly)); if (poly.length < 3 || area < 60) continue;
        let clear = true, cx = 0, cz = 0, minY = Infinity;
        for (const q of poly) { t.project(q[0], q[1], null, pr); if (pr.dist < Math.max(t.wallL[pr.i], t.wallR[pr.i]) + 1) { clear = false; break; } cx += q[0]; cz += q[1]; minY = Math.min(minY, this.height(q[0], q[1])); }
        if (!clear) continue; cx /= poly.length; cz /= poly.length;
        if (this.pitBox && Math.hypot(cx - this.pitBox.cx, cz - this.pitBox.cz) < this.pitBox.r) continue;
        const shape = new THREE.Shape(); shape.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < poly.length; i++) shape.lineTo(poly[i][0], poly[i][1]); shape.closePath();
        const h = b.h ? Math.min(b.h, 24) : (area > 2500 ? 9 + Math.min(8, area / 1500) : area > 500 ? 6 + Math.min(6, area / 400) : 3.5 + Math.min(3, area / 80));
        const geo = new THREE.ExtrudeGeometry(shape, { depth: h + 2, bevelEnabled: false }); geo.rotateX(Math.PI / 2); geo.translate(0, h + minY - 1, 0);
        const p = geo.attributes.position, uv = geo.attributes.uv, nrm = geo.attributes.normal;
        for (let i = 0; i < p.count; i++) { const nx = nrm.getX(i), ny = nrm.getY(i); if (Math.abs(ny) > 0.5) uv.setXY(i, p.getX(i) * 0.05, p.getZ(i) * 0.05); else uv.setXY(i, (Math.abs(nx) > 0.5 ? p.getZ(i) : p.getX(i)) * 0.125, (p.getY(i) - minY) * 0.125 / (h > 8 ? 1 : 0.6)); }
        (area > 2500 ? hall : area > 500 ? office : brick).push(geo);
        // parapet / roof edge
        const par = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false }); par.rotateX(Math.PI / 2); par.translate(0, h + minY - 0.4, 0); parapets.push(par);
      }
      const add = (geos, mat) => { if (!geos.length) return; const m = new THREE.Mesh(mergeGeos(geos), mat); m.castShadow = true; m.receiveShadow = true; this.group.add(m); };
      add(office, new THREE.MeshStandardMaterial({ map: officeTex, roughness: 0.6, metalness: 0.1 }));
      add(hall, new THREE.MeshStandardMaterial({ map: hallTex, roughness: 0.7 }));
      add(brick, new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.9 }));
      add(parapets, new THREE.MeshStandardMaterial({ color: 0x6e7177, roughness: 0.8 }));
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
      // painted canopy + trunk on a cross of two quads (alpha tested), far cheaper and softer than polyhedra.
      // three species: a round ash/maple, a broad dark oak and a tall narrow poplar
      const paint = (seed, opts) => {
        const tc = document.createElement('canvas'); tc.width = 256; tc.height = 256; const tctx = tc.getContext('2d'); tctx.clearRect(0, 0, 256, 256);
        tctx.fillStyle = opts.trunk; tctx.fillRect(128 - opts.trunkW / 2, opts.trunkTop, opts.trunkW, 256 - opts.trunkTop);
        if (opts.branches) { tctx.strokeStyle = opts.trunk; tctx.lineWidth = 5; for (let b = 0; b < 4; b++) { tctx.beginPath(); tctx.moveTo(128, opts.trunkTop + 20); tctx.lineTo(128 + (b % 2 ? 1 : -1) * (30 + b * 12), opts.trunkTop - 30 - b * 8); tctx.stroke(); } }
        const r0 = U.rng(seed);
        for (let i = 0; i < opts.blobs; i++) { const ang = r0() * Math.PI * 2, rad = Math.pow(r0(), opts.pow) ; const x = opts.cx + Math.cos(ang) * rad * opts.rx, y = opts.cy + Math.sin(ang) * rad * opts.ry; tctx.fillStyle = opts.greens[Math.floor(r0() * opts.greens.length)]; tctx.beginPath(); tctx.arc(x, y, opts.blobR0 + r0() * opts.blobR1, 0, 6.283); tctx.fill(); }
        for (let i = 0; i < opts.blobs * 0.4; i++) { const ang = r0() * Math.PI * 2, rad = Math.pow(r0(), 0.7); tctx.fillStyle = opts.light; tctx.beginPath(); tctx.arc(opts.cx + Math.cos(ang) * rad * opts.rx * 0.85 - 6, opts.cy + Math.sin(ang) * rad * opts.ry * 0.85 - 8, (opts.blobR0 + r0() * opts.blobR1) * 0.6, 0, 6.283); tctx.fill(); }
        const ttex = new THREE.CanvasTexture(tc); ttex.encoding = THREE.sRGBEncoding; return ttex;
      };
      const species = [
        { tex: paint(13, { trunk: '#4a3220', trunkW: 16, trunkTop: 150, cx: 128, cy: 110, rx: 95, ry: 81, pow: 0.6, blobs: 160, blobR0: 10, blobR1: 16, greens: ['#2f6b2a', '#356f2c', '#3f7a33', '#2a5e26', '#4a8238', '#2c6329'], light: 'rgba(120,180,90,0.45)' }), w: 9, h: 9, emissive: 0x6a8a5a },
        { tex: paint(29, { trunk: '#3d2a1a', trunkW: 22, trunkTop: 165, branches: true, cx: 128, cy: 118, rx: 118, ry: 72, pow: 0.5, blobs: 210, blobR0: 12, blobR1: 20, greens: ['#234d1f', '#2b5a24', '#1f4a1c', '#33652a', '#2a5422', '#3b6e2e'], light: 'rgba(110,160,80,0.35)' }), w: 11, h: 8.5, emissive: 0x4f7046 },
        { tex: paint(41, { trunk: '#5a4630', trunkW: 10, trunkTop: 200, cx: 128, cy: 105, rx: 42, ry: 100, pow: 0.55, blobs: 170, blobR0: 7, blobR1: 11, greens: ['#4c8a34', '#5a9a3c', '#3f7a2e', '#6aa844', '#4a8a36'], light: 'rgba(170,210,110,0.5)' }), w: 5.5, h: 12, emissive: 0x7a9a5a },
      ];
      const places = [[], [], []]; // per species
      const okSpot = (x, z, margin) => { t.project(x, z, null, pr); return pr.dist > Math.max(t.wallL[pr.i], t.wallR[pr.i]) + margin; };
      let total = 0;
      for (const w of t.data.scenery.woods) {
        const b = U.polyBounds(w); const area = Math.abs(U.polyArea(w)); const count = Math.min(450, Math.floor(area / 320)); let tries = 0, got = 0;
        while (got < count && tries < count * 4) { tries++; const x = U.lerp(b.x0, b.x1, rng()), z = U.lerp(b.z0, b.z1, rng()); if (!U.pointInPoly(x, z, w) || !okSpot(x, z, 6)) continue; places[rng() < 0.6 ? 0 : 1].push([x, z]); got++; total++; }
      }
      // hedgerows: walk a grid, drop trees where the field cell changes; poplars line about half of the boundaries
      const half = 2100, step = 14;
      for (let z = -half; z < half; z += step) for (let x = -half; x < half; x += step) {
        if (total > 5200) break;
        const id = this.cellOf(x, z); if (id === this.cellOf(x + step, z) && id === this.cellOf(x, z + step)) continue;
        if (rng() > 0.35) continue; if (!okSpot(x, z, 60)) continue;
        const poplar = U.noise2(x / 300 + 5, z / 300 + 9) > 0.55;
        places[poplar ? 2 : (rng() < 0.7 ? 0 : 1)].push([x + (rng() - 0.5) * 6, z + (rng() - 0.5) * 6]); total++;
      }
      // scattered trees just outside the circuit fences (mostly oaks)
      for (let i = 0; i < t.n; i += 12) for (const side of [-1, 1]) { if (rng() < 0.65) continue; const wall = side < 0 ? t.wallL[i] : t.wallR[i]; const d = wall + 16 + rng() * 30; places[rng() < 0.5 ? 1 : 0].push([t.x[i] + t.nx[i] * side * d, t.z[i] + t.nz[i] * side * d, 0.55 + rng() * 0.35]); total++; }
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      this.treeMeshes = [];
      species.forEach((sp, k) => {
        const list = places[k]; if (!list.length) return;
        const q1 = new THREE.PlaneGeometry(sp.w, sp.h); q1.translate(0, sp.h / 2, 0); const q2 = q1.clone(); q2.rotateY(Math.PI / 2);
        const geo = mergeGeos([q1, q2]);
        const mat = new THREE.MeshLambertMaterial({ map: sp.tex, alphaTest: 0.45, side: THREE.DoubleSide, emissive: sp.emissive, emissiveMap: sp.tex, emissiveIntensity: 0.6 });
        if (k === 0) this.treeMat = mat;
        const inst = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach((pl, i) => { const s = pl[2] || (0.7 + rng() * 0.8); sc.set(s, s * (0.9 + rng() * 0.4), s); p.set(pl[0], this.height(pl[0], pl[1]) - 0.1, pl[1]); q.setFromAxisAngle(up, rng() * Math.PI); m.compose(p, q, sc); inst.setMatrixAt(i, m); });
        // shadows for the tree quads are switched on by main.js in 'high' quality only (meshes named 'trees')
        inst.castShadow = false; inst.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: sp.tex, alphaTest: 0.45 }); inst.name = 'trees'; this.group.add(inst); this.treeMeshes.push(inst);
      });
      this.treeCount = total;
    }
  }
  EI.Scenery = Scenery;
})();
