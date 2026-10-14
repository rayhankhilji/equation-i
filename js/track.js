// Equation I - circuit geometry, elevation, lookups and the track surface meshes
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  const STEP = 2.0;

  // elevation profile keyed by distance along the lap (metres). Silverstone sits on a gently rolling plateau.
  const ELEV = [[0, 0], [300, 0.8], [440, 1.5], [660, 4], [940, 5.5], [1010, 5.5], [1255, 4.5], [1350, 3.2], [1700, 1], [1973, -1.5], [2168, -2], [2500, -0.5], [2735, 0], [3085, 1], [3630, 3.5], [3875, 5], [4033, 4], [4300, 2.5], [4650, 1], [5028, 2.5], [5240, -2.5], [5570, -3], [5640, -1.5], [5878, 0]];

  class Track {
    constructor(data) {
      this.data = data; this.name = data.name;
      this.halfWidth = data.width / 2; this.kerbWidth = 1.3; this.sf = data.startFinish;
      this.buildSamples();
      this.buildElevation();
      this.buildCoarseGrid();
      this.computeWalls();
      this.computeRacingLine();
      this.drs = data.drs.map(z => ({ name: z.name, detect: z.detect, start: z.start, end: z.end }));
      this.sectors = [this.length / 3, 2 * this.length / 3];
      this.group = new THREE.Group();
    }

    // ---------------------------------------------------------------- samples
    buildSamples() {
      const pts = this.data.center.map(p => new THREE.Vector3(p[0], 0, p[1]));
      const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
      curve.arcLengthDivisions = 40000;
      const len = curve.getLength(); const n = Math.round(len / STEP);
      const spaced = curve.getSpacedPoints(n);
      this.n = n; this.length = len; this.ds = len / n;
      this.x = new Float32Array(n); this.z = new Float32Array(n); this.s = new Float32Array(n);
      for (let i = 0; i < n; i++) { this.x[i] = spaced[i].x; this.z[i] = spaced[i].z; this.s[i] = i * this.ds; }
      this.x = this.smooth(this.x, 6); this.z = this.smooth(this.z, 6);
      this.tx = new Float32Array(n); this.tz = new Float32Array(n); this.nx = new Float32Array(n); this.nz = new Float32Array(n); this.k = new Float32Array(n); this.heading = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const a = (i + n - 1) % n, b = (i + 1) % n;
        let dx = this.x[b] - this.x[a], dz = this.z[b] - this.z[a]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        this.tx[i] = dx; this.tz[i] = dz; this.nx[i] = dz; this.nz[i] = -dx; this.heading[i] = Math.atan2(dz, dx);
      }
      for (let i = 0; i < n; i++) { const b = (i + 1) % n; this.k[i] = -(this.tx[i] * this.tz[b] - this.tz[i] * this.tx[b]) / this.ds; }
      this.k = this.smooth(this.k, 3);
    }
    buildElevation() {
      const n = this.n, L = this.length;
      const pts = ELEV.map(p => new THREE.Vector3(p[0] / L * 100, p[1], 0));
      // closed 1D spline through the control points via catmull-rom on (s, y)
      const cps = ELEV.slice(0, -1).map(p => [p[0] * L / 5878, p[1]]); cps.push([L, 0]);
      this.y = new Float32Array(n); this.grade = new Float32Array(n);
      const m = cps.length;
      for (let i = 0; i < n; i++) {
        const s = this.s[i];
        let j = 0; while (j < m - 1 && cps[j + 1][0] < s) j++;
        const p0 = cps[(j - 1 + m) % m], p1 = cps[j], p2 = cps[(j + 1) % m], p3 = cps[(j + 2) % m];
        const t = (s - p1[0]) / ((p2[0] - p1[0]) || 1);
        const cr = (a, b, c, d, t) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
        this.y[i] = cr(p0[1], p1[1], p2[1], p3[1], U.clamp(t, 0, 1));
      }
      this.y = this.smooth(this.y, 12);
      for (let i = 0; i < n; i++) { const a = (i + n - 1) % n, b = (i + 1) % n; this.grade[i] = (this.y[b] - this.y[a]) / (2 * this.ds); }
    }
    elevAt(s) { const f = U.mod(s / this.ds, this.n); const i = Math.floor(f), t = f - i; return U.lerp(this.y[i], this.y[(i + 1) % this.n], t); }
    smooth(arr, radius) {
      const n = arr.length, out = new Float32Array(n); const w = []; let ws = 0;
      for (let j = -radius; j <= radius; j++) { const g = Math.exp(-(j * j) / (2 * (radius / 2 + 0.01) ** 2)); w.push(g); ws += g; }
      for (let i = 0; i < n; i++) { let v = 0; for (let j = -radius; j <= radius; j++) v += arr[(i + j + n) % n] * w[j + radius]; out[i] = v / ws; }
      return out;
    }
    // coarse grid of nearest sample indices for fast world->track lookups anywhere on the map
    buildCoarseGrid() {
      const cell = 40, half = 2400; this.gridCell = cell; this.gridHalf = half; const gn = Math.ceil(half * 2 / cell); this.gridN = gn;
      this.grid = new Int32Array(gn * gn);
      for (let gz = 0; gz < gn; gz++) for (let gx = 0; gx < gn; gx++) {
        const x = -half + (gx + 0.5) * cell, z = -half + (gz + 0.5) * cell; let best = 0, bd = Infinity;
        for (let i = 0; i < this.n; i += 4) { const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
        this.grid[gz * gn + gx] = best;
      }
    }
    nearestIndex(x, z, hint) {
      const n = this.n;
      if (hint == null || hint < 0) {
        const gx = U.clamp(Math.floor((x + this.gridHalf) / this.gridCell), 0, this.gridN - 1), gz = U.clamp(Math.floor((z + this.gridHalf) / this.gridCell), 0, this.gridN - 1);
        hint = this.grid[gz * this.gridN + gx];
        let best = hint, bd = Infinity;
        for (let j = -60; j <= 60; j += 2) { const i = (hint + j + n) % n; const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
        hint = best;
      }
      let best = hint, bd = (this.x[hint] - x) ** 2 + (this.z[hint] - z) ** 2;
      for (let j = -30; j <= 30; j++) { const i = (hint + j + n) % n; const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
      return best;
    }
    project(x, z, hint, out) {
      const i = this.nearestIndex(x, z, hint); const dx = x - this.x[i], dz = z - this.z[i];
      out = out || {}; out.i = i; out.along = dx * this.tx[i] + dz * this.tz[i]; out.lat = dx * this.nx[i] + dz * this.nz[i];
      out.s = U.mod(this.s[i] + out.along, this.length); out.dist = Math.abs(out.lat); return out;
    }
    idxAtS(s) { return U.mod(Math.round(s / this.ds), this.n); }
    cornerNameAt(s) { let name = ''; for (const c of this.data.corners) if (s >= c.s - 40) name = c.name; return name || this.data.corners[this.data.corners.length - 1].name; }
    sectorAt(s) { return s < this.sectors[0] ? 0 : s < this.sectors[1] ? 1 : 2; }
    gridSlot(pos) {
      const s = this.sf - 10 - pos * 8; const i = this.idxAtS(s); const side = (pos % 2 === 0 ? -1 : 1) * 2.6;
      return { x: this.x[i] + this.nx[i] * side, z: this.z[i] + this.nz[i] * side, y: this.y[i], heading: this.heading[i], i };
    }

    computeWalls() {
      const n = this.n, hw = this.halfWidth; const kw = this.smooth(this.k, 25);
      this.wallL = new Float32Array(n); this.wallR = new Float32Array(n); this.gravelL = new Uint8Array(n); this.gravelR = new Uint8Array(n); this.runoffL = new Uint8Array(n); this.runoffR = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        const c = kw[i]; const outside = Math.min(1, Math.abs(c) * 110); let l = hw + 12, r = hw + 12;
        if (c > 0) { r += 40 * outside; l -= 5 * outside; } else { l += 40 * outside; r -= 5 * outside; }
        this.wallL[i] = l; this.wallR[i] = r;
      }
      this.wallL = this.smooth(this.wallL, 30); this.wallR = this.smooth(this.wallR, 30);
      const kk = this.smooth(this.k, 8);
      const gravelCorners = ['Copse', 'Becketts', 'Stowe', 'Club', 'Luffield', 'Abbey', 'Brooklands', 'Vale', 'Village', 'Maggotts'];
      const cornerAt = (s) => { let name = null; for (const c of this.data.corners) if (s >= c.s - 60) name = c.name; return name; };
      for (let i = 0; i < n; i++) {
        const c = kk[i]; if (Math.abs(c) < 1 / 500) continue; const name = cornerAt(this.s[i]);
        const gravel = gravelCorners.indexOf(name) >= 0 && Math.abs(c) > 1 / 220;
        if (c > 0) { this.runoffR[i] = 1; if (gravel) this.gravelR[i] = 1; } else { this.runoffL[i] = 1; if (gravel) this.gravelL[i] = 1; }
      }
    }
    computeRacingLine() {
      const n = this.n, hw = this.halfWidth; const kt = this.smooth(this.k, 10), kw = this.smooth(this.k, 55); const kref = 1 / 70, maxOff = hw * 0.62;
      const off = new Float32Array(n);
      for (let i = 0; i < n; i++) off[i] = U.clamp(maxOff * (1.7 * kt[i] / kref - 1.25 * kw[i] / kref), -maxOff, maxOff);
      this.lineOff = this.smooth(off, 18);
      this.lineX = new Float32Array(n); this.lineZ = new Float32Array(n); this.lineK = new Float32Array(n);
      for (let i = 0; i < n; i++) { this.lineX[i] = this.x[i] + this.nx[i] * this.lineOff[i]; this.lineZ[i] = this.z[i] + this.nz[i] * this.lineOff[i]; }
      for (let i = 0; i < n; i++) {
        const a = (i + n - 1) % n, b = (i + 1) % n; const ax = this.lineX[b] - this.lineX[i], az = this.lineZ[b] - this.lineZ[i], bx = this.lineX[i] - this.lineX[a], bz = this.lineZ[i] - this.lineZ[a];
        const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1; this.lineK[i] = -((bx / lb) * (az / la) - (bz / lb) * (ax / la)) / ((la + lb) / 2);
      }
      this.lineK = this.smooth(this.lineK, 6);
    }

    // ---------------------------------------------------------------- ribbon helper (y follows track elevation)
    ribbon(offsetA, offsetB, opts) {
      const n = this.n, pos = [], uv = [], col = [], idx = []; const color = new THREE.Color(opts.color || 0xffffff);
      let vi = 0; const map = new Int32Array(n + 1); const y = opts.y || 0;
      for (let i = 0; i <= n; i++) {
        const ii = i % n;
        if (opts.mask && !opts.mask(ii)) { map[i] = -1; continue; }
        const a = offsetA(ii), b = offsetB(ii); const ya = this.y[ii] + (opts.ya ? opts.ya(ii) : y), yb = this.y[ii] + (opts.yb ? opts.yb(ii) : y);
        pos.push(this.x[ii] + this.nx[ii] * a, ya, this.z[ii] + this.nz[ii] * a, this.x[ii] + this.nx[ii] * b, yb, this.z[ii] + this.nz[ii] * b);
        const v = (i * this.ds) / (opts.vScale || 8); uv.push(0, v, 1, v);
        const ca = opts.colorFn ? opts.colorFn(ii, 0) : color, cb = opts.colorFn ? opts.colorFn(ii, 1) : color; col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b);
        map[i] = vi; vi += 2;
      }
      for (let i = 0; i < n; i++) { const a = map[i], b = map[i + 1]; if (a < 0 || b < 0) continue; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx); geo.computeVertexNormals(); return geo;
    }

    // ---------------------------------------------------------------- build
    build(scenery) {
      const g = this.group; this.scenery = scenery;
      this.buildSurfaces(g); this.buildBarriers(g); this.buildPitLane(g); this.buildFurniture(g);
      return g;
    }

    buildSurfaces(g) {
      const hw = this.halfWidth, kw = this.kerbWidth, n = this.n, self = this;
      // asphalt: 6 vertex rows -> white lines, grey body with rubbered racing line
      const asphaltTex = U.grainTexture(512, 0x4a4a4e, 0.09, 1, 11, 0.02); asphaltTex.repeat.set(1.5, 1);
      const asphaltN = U.normalTexture(256, 6, 2.2, 1, 3); asphaltN.repeat.set(1.5, 1);
      const mat = new THREE.MeshStandardMaterial({ map: asphaltTex, normalMap: asphaltN, normalScale: new THREE.Vector2(0.6, 0.6), vertexColors: true, metalness: 0.0, roughness: 0.92 });
      const grey = new THREE.Color(0x6e6e73), rubber = new THREE.Color(0x4a4a4f), white = new THREE.Color(0xf4f4f4);
      const strips = [[-hw, -hw + 0.25, white], [-hw + 0.25, hw - 0.25, null], [hw - 0.25, hw, white]];
      for (const st of strips) {
        const geo = this.ribbon(() => st[0], () => st[1], { vScale: 7, colorFn: (i, side) => { if (st[2]) return st[2]; const lat = side === 0 ? st[0] : st[1]; return Math.abs(lat - self.lineOff[i]) < 3.5 ? rubber : grey; } });
        const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; g.add(m);
      }
      // rubber line with tyre marks texture
      const marksTex = (function () { const c = document.createElement('canvas'); c.width = 128; c.height = 512; const ctx = c.getContext('2d'); ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.clearRect(0, 0, 128, 512); const r = U.rng(21);
        for (let i = 0; i < 40; i++) { ctx.strokeStyle = 'rgba(20,20,22,' + (0.15 + r() * 0.35) + ')'; ctx.lineWidth = 2 + r() * 4; ctx.beginPath(); const x = 10 + r() * 108; ctx.moveTo(x, r() * 512); ctx.lineTo(x + (r() - 0.5) * 20, r() * 512); ctx.stroke(); }
        const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
      const lineGeo = this.ribbon(i => this.lineOff[i] - 2.4, i => this.lineOff[i] + 2.4, { y: 0.012, vScale: 30 });
      g.add(new THREE.Mesh(lineGeo, new THREE.MeshStandardMaterial({ map: marksTex, color: 0x303034, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, roughness: 0.6 })));
      // kerbs: red/white sawtooth
      const kerbTex = (function () { const c = document.createElement('canvas'); c.width = 64; c.height = 128; const ctx = c.getContext('2d'); ctx.fillStyle = '#eceae6'; ctx.fillRect(0, 0, 64, 128); ctx.fillStyle = '#c8101a'; ctx.fillRect(0, 0, 64, 64); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, 60, 64, 4); ctx.fillRect(0, 124, 64, 4); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
      const kk = this.smooth(this.k, 6); const kerbMask = i => Math.abs(kk[i]) > 1 / 420;
      const kerbMat = new THREE.MeshStandardMaterial({ map: U.srgb(kerbTex), roughness: 0.55, metalness: 0.0 });
      for (const side of [-1, 1]) {
        const g1 = this.ribbon(() => side * hw, () => side * (hw + kw * 0.45), { mask: kerbMask, vScale: 2.2, ya: () => 0.012, yb: () => 0.075 });
        const g2 = this.ribbon(() => side * (hw + kw * 0.45), () => side * (hw + kw), { mask: kerbMask, vScale: 2.2, ya: () => 0.075, yb: () => 0.02 });
        for (const geo of [g1, g2]) { const m = new THREE.Mesh(geo, kerbMat); m.receiveShadow = true; m.castShadow = true; g.add(m); }
      }
      // green painted asphalt strip beyond the kerbs (Silverstone style), then tarmac run-off / gravel
      const greenMat = new THREE.MeshStandardMaterial({ color: 0x2d8a38, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
      const runoffTex = U.grainTexture(256, 0x77777b, 0.07, 1, 12, 0.01);
      const runoffMat = new THREE.MeshStandardMaterial({ map: runoffTex, normalMap: asphaltN, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
      const gravelTex = U.grainTexture(256, 0xc9b58c, 0.12, 1, 5, 0.03);
      const gravelMat = new THREE.MeshStandardMaterial({ map: gravelTex, normalMap: U.normalTexture(256, 10, 3.5, 1, 8), roughness: 1.0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
      for (const side of [-1, 1]) {
        const run = side < 0 ? this.runoffL : this.runoffR, grav = side < 0 ? this.gravelL : this.gravelR, wall = side < 0 ? this.wallL : this.wallR;
        const gr = this.ribbon(() => side * (hw + kw - 0.05), () => side * (hw + kw + 2.0), { mask: i => kerbMask(i) || run[i], y: -0.005 });
        g.add(new THREE.Mesh(gr, greenMat));
        const r = this.ribbon(() => side * (hw + kw + 1.9), i => side * Math.min(hw + kw + (grav[i] ? 7 : 14), wall[i] - 0.4), { mask: i => run[i], y: -0.01, vScale: 12 });
        const rm = new THREE.Mesh(r, runoffMat); rm.receiveShadow = true; g.add(rm);
        const gg = this.ribbon(i => side * Math.min(hw + kw + 6.9, wall[i] - 0.5), i => side * (wall[i] - 0.3), { mask: i => grav[i], y: -0.012, vScale: 12 });
        const gm = new THREE.Mesh(gg, gravelMat); gm.receiveShadow = true; g.add(gm);
      }
      // grass verge ribbon so the join to the terrain is clean
      const verge = this.ribbon(i => -(this.wallL[i] + 40), i => (this.wallR[i] + 40), { y: -0.03, color: 0x4f8a3a });
      g.add(new THREE.Mesh(verge, new THREE.MeshStandardMaterial({ map: U.grainTexture(256, 0x3b7024, 0.07, 1, 3), roughness: 1.0, polygonOffset: true, polygonOffsetFactor: 3, polygonOffsetUnits: 6 })));
      // start / finish line and grid boxes
      const sfTex = (function () { const c = document.createElement('canvas'); c.width = 128; c.height = 32; const ctx = c.getContext('2d'); for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { ctx.fillStyle = (i + j) % 2 ? '#fff' : '#111'; ctx.fillRect(i * 8, j * 8, 8, 8); } return new THREE.CanvasTexture(c); })();
      const i0 = this.idxAtS(this.sf);
      const sfMesh = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 1.2), new THREE.MeshBasicMaterial({ map: sfTex }));
      sfMesh.rotation.x = -Math.PI / 2; sfMesh.rotation.z = -this.heading[i0]; sfMesh.position.set(this.x[i0], this.y[i0] + 0.02, this.z[i0]); g.add(sfMesh);
      const boxMat = new THREE.MeshBasicMaterial({ color: 0xf2c200 });
      for (let p = 0; p < 20; p++) {
        const slot = this.gridSlot(p); const box = new THREE.Group();
        const l1 = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 2.2), boxMat); l1.rotation.x = -Math.PI / 2; l1.position.set(1.8, 0, 1.1);
        const l2 = l1.clone(); l2.position.set(1.8, 0, -1.1);
        const l3 = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.18), boxMat); l3.rotation.x = -Math.PI / 2; l3.position.set(2.8, 0, 0);
        box.add(l1, l2, l3); box.position.set(slot.x, slot.y + 0.02, slot.z); box.rotation.y = -slot.heading; g.add(box);
      }
      // painted logos on the run-off at the big corners (like the trackside paint at Luffield / Club)
      const paint = (s, side, text, color, w) => {
        const i = this.idxAtS(s); const wall = side < 0 ? this.wallL[i] : this.wallR[i]; const d = (hw + kw + 2 + Math.min(wall - 1, hw + kw + 9)) / 2;
        const tex = U.textTexture(text, { w: 1024, h: 256, bg: color, color: '#ffffff', size: 150 });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.25), new THREE.MeshStandardMaterial({ map: U.srgb(tex), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
        m.rotation.x = -Math.PI / 2; m.rotation.z = -this.heading[i] + (side < 0 ? Math.PI : 0); m.position.set(this.x[i] + this.nx[i] * side * d, this.y[i] + 0.02, this.z[i] + this.nz[i] * side * d); g.add(m);
      };
      paint(2250, -1, 'EQUATION I', '#1a73e8', 34); paint(5700, -1, 'EI', '#e10600', 18); paint(3150, -1, 'EQUATION I', '#e10600', 30); paint(1000, 1, 'EI', '#1a73e8', 14);
    }

    buildBarriers(g) {
      const kk = this.smooth(this.k, 12);
      // sponsor wall panels (concrete wall with advertising) in corners, Armco on straights, tyre walls at the big stops
      const panelTex = (function () {
        const c = document.createElement('canvas'); c.width = 1024; c.height = 128; const ctx = c.getContext('2d');
        const panels = [['#b3122b', '#ffffff', 'EQUATION I'], ['#ffffff', '#111111', 'EI RACING'], ['#1a73e8', '#ffffff', 'DRS'], ['#b3122b', '#ffffff', 'EQUATION I'], ['#111111', '#ffffff', 'SILVERSTONE']];
        panels.forEach((p, i) => { const x = i * 204.8; ctx.fillStyle = p[0]; ctx.fillRect(x, 0, 204.8, 128); ctx.fillStyle = p[1]; ctx.font = 'italic 900 44px Arial Black, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p[2], x + 102, 64); });
        const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
      })();
      const tyreTex = (function () { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const ctx = c.getContext('2d'); ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, 128, 64); const cols = ['#202020', '#202020', '#f0f0f0', '#202020', '#d01418', '#202020'];
        for (let i = 0; i < 4; i++) { ctx.fillStyle = cols[i % cols.length]; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(i * 32 + 2, 4, 28, 56, 10) : ctx.rect(i * 32 + 2, 4, 28, 56); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(i * 32 + 2, 30, 28, 4); }
        const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
      const armcoTex = (function () { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const ctx = c.getContext('2d'); ctx.fillStyle = '#a7abb0'; ctx.fillRect(0, 0, 64, 64); ctx.fillStyle = '#7a7e83'; ctx.fillRect(0, 28, 64, 8); ctx.fillStyle = '#cfd2d5'; ctx.fillRect(0, 10, 64, 6); ctx.fillRect(0, 48, 64, 6); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
      const tyreCorners = ['Copse', 'Stowe', 'Club', 'Village', 'Vale'];
      const cornerAt = (s) => { let name = null; for (const c of this.data.corners) if (s >= c.s - 60) name = c.name; return name; };
      const panelMat = new THREE.MeshStandardMaterial({ map: U.srgb(panelTex), side: THREE.DoubleSide, roughness: 0.5 });
      const tyreMat = new THREE.MeshStandardMaterial({ map: U.srgb(tyreTex), side: THREE.DoubleSide, roughness: 0.9 });
      const armMat = new THREE.MeshStandardMaterial({ map: U.srgb(armcoTex), side: THREE.DoubleSide, roughness: 0.4, metalness: 0.6 });
      const concrete = new THREE.MeshStandardMaterial({ color: 0xd9d9d6, side: THREE.DoubleSide, roughness: 0.9 });
      for (const side of [-1, 1]) {
        const wall = side < 0 ? this.wallL : this.wallR;
        const inCorner = i => Math.abs(kk[i]) > 1 / 600;
        const isTyre = i => inCorner(i) && tyreCorners.indexOf(cornerAt(this.s[i])) >= 0 && (side < 0 ? kk[i] < 0 : kk[i] > 0);
        const isPanel = i => !isTyre(i) && (inCorner(i) || Math.abs(this.s[i] - this.sf) < 500);
        // concrete base + panels
        const pg = this.ribbon(i => side * wall[i], i => side * wall[i], { mask: isPanel, ya: () => 0.5, yb: () => 1.2, vScale: 25.6 });
        g.add(new THREE.Mesh(pg, panelMat));
        const cg = this.ribbon(i => side * wall[i], i => side * wall[i], { mask: isPanel, ya: () => 0, yb: () => 0.5 });
        const cm = new THREE.Mesh(cg, concrete); cm.castShadow = true; g.add(cm);
        const tg = this.ribbon(i => side * wall[i], i => side * wall[i], { mask: isTyre, ya: () => 0, yb: () => 1.0, vScale: 2.6 });
        const tm = new THREE.Mesh(tg, tyreMat); tm.castShadow = true; g.add(tm);
        const ag = this.ribbon(i => side * wall[i], i => side * wall[i], { mask: i => !isTyre(i) && !isPanel(i), ya: () => 0.1, yb: () => 0.8, vScale: 4 });
        g.add(new THREE.Mesh(ag, armMat));
      }
      // debris fence
      const fenceTex = (function () { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const ctx = c.getContext('2d'); ctx.clearRect(0, 0, 64, 64); ctx.strokeStyle = 'rgba(30,30,30,0.85)'; ctx.lineWidth = 1.2;
        for (let i = 0; i <= 64; i += 6) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 64); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(64, i); ctx.stroke(); } ctx.fillStyle = '#555'; ctx.fillRect(0, 0, 3, 64);
        const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
      const fenceMat = new THREE.MeshBasicMaterial({ map: fenceTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.7 });
      for (const side of [-1, 1]) {
        const wall = side < 0 ? this.wallL : this.wallR;
        const fg = this.ribbon(i => side * (wall[i] + 0.8), i => side * (wall[i] + 0.8), { ya: () => 0, yb: () => 3.4, vScale: 3 });
        g.add(new THREE.Mesh(fg, fenceMat));
      }
    }

    buildPitLane(g) {
      const pts = this.data.pit.map(p => new THREE.Vector3(p[0], 0, p[1])); if (pts.length < 3) return;
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'); curve.arcLengthDivisions = 4000;
      const len = curve.getLength(); const n = Math.max(8, Math.round(len / 4)); const sp = curve.getSpacedPoints(n);
      const pos = [], idx = [], uv = [];
      for (let i = 0; i <= n; i++) {
        const a = sp[Math.max(0, i - 1)], b = sp[Math.min(n, i + 1)]; let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const nx = dz, nz = -dx, w = 5.5; const pr = this.project(sp[i].x, sp[i].z, null); const y = this.y[pr.i] + 0.005;
        pos.push(sp[i].x + nx * w, y, sp[i].z + nz * w, sp[i].x - nx * w, y, sp[i].z - nz * w); uv.push(0, i, 1, i);
      }
      for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x5a5a5e, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 })); m.receiveShadow = true; g.add(m);
      this.pitCurve = curve;
    }

    buildFurniture(g) {
      const hw = this.halfWidth; const postMat = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
      const placeAt = (s, side, dist) => { const i = this.idxAtS(s); const wall = side < 0 ? this.wallL[i] : this.wallR[i]; const d = dist != null ? dist : wall - 0.1; return { x: this.x[i] + this.nx[i] * side * d, y: this.y[i], z: this.z[i] + this.nz[i] * side * d, heading: this.heading[i], i }; };
      // start light gantry
      const i0 = this.idxAtS(this.sf + 6); const gantry = new THREE.Group();
      for (const side of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7.5, 0.5), postMat); post.position.set(0, 3.75, side * (hw + 1.6)); post.castShadow = true; gantry.add(post); }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, hw * 2 + 3.6), postMat); beam.position.y = 7.4; gantry.add(beam);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.6, 6.4), new THREE.MeshLambertMaterial({ color: 0x111111 })); panel.position.y = 6.2; gantry.add(panel);
      this.startLights = []; const offMat = new THREE.MeshBasicMaterial({ color: 0x2a0b0b });
      for (let c = 0; c < 5; c++) { const col = []; for (let rr = 0; rr < 2; rr++) { const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), offMat.clone()); lamp.position.set(-0.25, 6.55 - rr * 0.65, (c - 2) * 1.15); gantry.add(lamp); col.push(lamp); } this.startLights.push(col); }
      gantry.position.set(this.x[i0], this.y[i0], this.z[i0]); gantry.rotation.y = -this.heading[i0]; g.add(gantry);
      // boards
      const addBoard = (s, side, text, opts) => {
        const p = placeAt(s, side, null); const w = opts.w || 6, h = opts.h || 1.4;
        const tex = U.textTexture(text, { w: 512, h: Math.round(512 * h / w), bg: opts.bg, color: opts.color, size: opts.size || 70, stripe: opts.stripe, font: 'italic 900 Arial Black, Arial' });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: U.srgb(tex), side: THREE.DoubleSide }));
        m.position.set(p.x, p.y + (opts.y || 2.3), p.z); m.rotation.y = -p.heading + (side < 0 ? 0 : Math.PI); g.add(m);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, opts.y || 2.3, 0.15), postMat); post.position.set(p.x, p.y + (opts.y || 2.3) / 2, p.z); g.add(post);
      };
      const kk = this.smooth(this.k, 15);
      for (const c of this.data.corners) { if (/Straight/i.test(c.name)) continue; const i = this.idxAtS(c.s + 50); addBoard(c.s + 50, kk[i] > 0 ? 1 : -1, c.name.toUpperCase(), { bg: '#ffffff', color: '#111', w: 7, h: 1.5, size: 64 }); }
      const stops = ['Village', 'Brooklands', 'Stowe', 'Vale', 'Club', 'Abbey', 'Copse', 'Luffield'];
      for (const c of this.data.corners) { if (stops.indexOf(c.name) < 0) continue; const i = this.idxAtS(c.s + 40); const side = kk[i] > 0 ? 1 : -1; for (const d of [150, 100, 50]) addBoard(c.s - d + 20, side, String(d), { bg: '#f2c200', color: '#111', w: 1.6, h: 1.6, size: 180, y: 1.6 }); }
      for (const z of this.drs) {
        addBoard(z.detect, -1, 'DRS DETECTION', { bg: '#ffffff', color: '#111', w: 5, h: 1.2, size: 70, stripe: '#1a73e8' });
        addBoard(z.start, -1, 'DRS', { bg: '#1a73e8', color: '#fff', w: 4, h: 1.6, size: 170 }); addBoard(z.start, 1, 'DRS', { bg: '#1a73e8', color: '#fff', w: 4, h: 1.6, size: 170 });
        for (const [ss, col, ww] of [[z.start, 0x1a73e8, 0.4], [z.detect, 0xffffff, 0.3]]) { const i = this.idxAtS(ss); const line = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, ww), new THREE.MeshBasicMaterial({ color: col })); line.rotation.x = -Math.PI / 2; line.rotation.z = -this.heading[i]; line.position.set(this.x[i], this.y[i] + 0.02, this.z[i]); g.add(line); }
      }
      // sponsor bridges
      const bridge = (s, text, bg) => {
        const i = this.idxAtS(s); const grp = new THREE.Group();
        for (const side of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8, 0.8), postMat); post.position.set(0, 4, side * (hw + 3)); post.castShadow = true; grp.add(post); }
        const tex = U.textTexture(text, { w: 1024, h: 128, bg: bg || '#e10600', color: '#fff', size: 80, font: 'italic 900 Arial Black, Arial' });
        const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, hw * 2 + 7), new THREE.MeshLambertMaterial({ color: bg ? new THREE.Color(bg) : 0xe10600 })); b.position.y = 8.5; b.castShadow = true; grp.add(b);
        for (const dir of [-1, 1]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 + 6.8, 2.1), new THREE.MeshBasicMaterial({ map: U.srgb(tex) })); f.position.set(dir * 0.62, 8.5, 0); f.rotation.y = dir * Math.PI / 2; grp.add(f); }
        grp.position.set(this.x[i], this.y[i], this.z[i]); grp.rotation.y = -this.heading[i]; g.add(grp);
      };
      bridge(this.sf + 140, 'EQUATION I', '#e10600'); bridge(4650, 'EI  ·  SILVERSTONE', '#5b2a86'); bridge(2850, 'EQUATION I', '#e10600'); bridge(1600, 'DRS ZONE', '#1a73e8');
      // marshal posts
      const hutMat = new THREE.MeshLambertMaterial({ color: 0xff7a00 });
      for (const c of this.data.corners) { if (/Straight/i.test(c.name)) continue; const i = this.idxAtS(c.s + 20); const side = kk[i] > 0 ? -1 : 1; const p = placeAt(c.s + 20, side, this.wallL[i] + 2.5);
        const hut = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 1.6), hutMat); hut.position.set(p.x, p.y + 1.1, p.z); hut.castShadow = true; g.add(hut); }
      // flood lights / camera towers along the straights for skyline interest
      for (const s of [500, 1500, 2600, 3300, 4500, 5400]) { const p = placeAt(s, 1, this.wallR[this.idxAtS(s)] + 4); const t = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 18, 6), postMat); t.position.set(p.x, p.y + 9, p.z); g.add(t); const head = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.8, 1.2), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 })); head.position.set(p.x, p.y + 18.2, p.z); head.rotation.y = -p.heading; g.add(head); }
    }
    setStartLights(count) { if (!this.startLights) return; this.startLights.forEach((col, c) => col.forEach(l => { l.material.color.setHex(c < count ? 0xff1a1a : 0x2a0b0b); })); }
  }
  EI.Track = Track;
})();
