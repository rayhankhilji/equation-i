// Equation I - circuit geometry, lookups and the 3D scene for a track
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  const STEP = 2.0; // metres between samples

  class Track {
    constructor(data) {
      this.data = data;
      this.name = data.name;
      this.halfWidth = data.width / 2;
      this.kerbWidth = 1.3;
      this.sf = data.startFinish;
      this.buildSamples();
      this.computeWalls();
      this.computeRacingLine();
      this.computeDRS();
      this.group = new THREE.Group();
    }

    // ---------------------------------------------------------------- samples
    buildSamples() {
      const pts = this.data.center.map(p => new THREE.Vector3(p[0], 0, p[1]));
      const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
      curve.arcLengthDivisions = 40000; // fine arc-length table so samples are evenly spaced
      const len = curve.getLength();
      const n = Math.round(len / STEP);
      const spaced = curve.getSpacedPoints(n); // n+1 points, last == first
      this.n = n; this.length = len;
      this.x = new Float32Array(n); this.z = new Float32Array(n);
      this.tx = new Float32Array(n); this.tz = new Float32Array(n);
      this.nx = new Float32Array(n); this.nz = new Float32Array(n);
      this.k = new Float32Array(n); this.s = new Float32Array(n);
      for (let i = 0; i < n; i++) { this.x[i] = spaced[i].x; this.z[i] = spaced[i].z; this.s[i] = i * (len / n); }
      this.ds = len / n;
      // survey nodes carry a little GPS jitter: smooth positions over ~12 m so tangents and curvature are clean
      this.x = this.smooth(this.x, 6); this.z = this.smooth(this.z, 6);
      for (let i = 0; i < n; i++) {
        const a = (i + n - 1) % n, b = (i + 1) % n;
        let dx = this.x[b] - this.x[a], dz = this.z[b] - this.z[a];
        const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        this.tx[i] = dx; this.tz[i] = dz;
        this.nx[i] = dz; this.nz[i] = -dx; // left normal (x east, z south)
      }
      // signed curvature, positive = left turn
      for (let i = 0; i < n; i++) {
        const b = (i + 1) % n;
        const cross = this.tx[i] * this.tz[b] - this.tz[i] * this.tx[b];
        this.k[i] = -cross / this.ds;
      }
      this.k = this.smooth(this.k, 3);
      // precompute heading per sample for car spawn
      this.heading = new Float32Array(n);
      for (let i = 0; i < n; i++) this.heading[i] = Math.atan2(this.tz[i], this.tx[i]);
    }

    smooth(arr, radius) {
      const n = arr.length, out = new Float32Array(n);
      const w = []; let ws = 0;
      for (let j = -radius; j <= radius; j++) { const g = Math.exp(-(j * j) / (2 * (radius / 2 + 0.01) ** 2)); w.push(g); ws += g; }
      for (let i = 0; i < n; i++) { let v = 0; for (let j = -radius; j <= radius; j++) v += arr[(i + j + n) % n] * w[j + radius]; out[i] = v / ws; }
      return out;
    }

    // distance from centreline to the barrier on each side, plus surface classification
    computeWalls() {
      const n = this.n, hw = this.halfWidth;
      const kw = this.smooth(this.k, 25);
      this.wallL = new Float32Array(n); this.wallR = new Float32Array(n);
      this.gravelL = new Uint8Array(n); this.gravelR = new Uint8Array(n);
      this.runoffL = new Uint8Array(n); this.runoffR = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        const c = kw[i]; // + left turn: outside is right
        const outside = Math.min(1, Math.abs(c) * 120);
        let l = hw + 7, r = hw + 7;
        if (c > 0) { r += 16 * outside; l -= 2 * outside; } else { l += 16 * outside; r -= 2 * outside; }
        this.wallL[i] = l; this.wallR[i] = r;
      }
      this.wallL = this.smooth(this.wallL, 20); this.wallR = this.smooth(this.wallR, 20);
      // gravel traps on the outside of the heavy corners, tarmac run-off elsewhere in corners
      const kk = this.smooth(this.k, 8);
      const gravelCorners = ['Copse', 'Becketts', 'Stowe', 'Club', 'Luffield', 'Abbey', 'Brooklands', 'Vale', 'Village'];
      const cornerAt = (s) => { let name = null; for (const c of this.data.corners) if (s >= c.s - 60) name = c.name; return name; };
      for (let i = 0; i < n; i++) {
        const c = kk[i]; if (Math.abs(c) < 1 / 500) continue;
        const name = cornerAt(this.s[i]);
        const gravel = gravelCorners.indexOf(name) >= 0 && Math.abs(c) > 1 / 220;
        if (c > 0) { this.runoffR[i] = 1; if (gravel) this.gravelR[i] = 1; } else { this.runoffL[i] = 1; if (gravel) this.gravelL[i] = 1; }
      }
    }

    // out-in-out line as a lateral offset from the centreline
    computeRacingLine() {
      const n = this.n, hw = this.halfWidth;
      const kt = this.smooth(this.k, 10), kw = this.smooth(this.k, 55);
      const kref = 1 / 70, maxOff = hw * 0.62;
      const off = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const a = kt[i] / kref, b = kw[i] / kref;
        off[i] = U.clamp(maxOff * (1.7 * a - 1.25 * b), -maxOff, maxOff);
      }
      this.lineOff = this.smooth(off, 18);
      this.lineX = new Float32Array(n); this.lineZ = new Float32Array(n); this.lineK = new Float32Array(n);
      for (let i = 0; i < n; i++) { this.lineX[i] = this.x[i] + this.nx[i] * this.lineOff[i]; this.lineZ[i] = this.z[i] + this.nz[i] * this.lineOff[i]; }
      for (let i = 0; i < n; i++) {
        const a = (i + n - 1) % n, b = (i + 1) % n;
        const ax = this.lineX[b] - this.lineX[i], az = this.lineZ[b] - this.lineZ[i];
        const bx = this.lineX[i] - this.lineX[a], bz = this.lineZ[i] - this.lineZ[a];
        const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
        const cross = (bx / lb) * (az / la) - (bz / lb) * (ax / la);
        this.lineK[i] = -cross / ((la + lb) / 2);
      }
      this.lineK = this.smooth(this.lineK, 6);
    }

    computeDRS() {
      this.drs = this.data.drs.map(z => ({ name: z.name, detect: z.detect, start: z.start, end: z.end }));
    }

    // ---------------------------------------------------------------- lookups
    idxAtS(s) { return U.mod(Math.round(s / this.ds), this.n); }
    nearestIndex(x, z, hint) {
      const n = this.n;
      if (hint == null || hint < 0) {
        let best = 0, bd = Infinity;
        for (let i = 0; i < n; i += 2) { const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
        hint = best;
      }
      let best = hint, bd = (this.x[hint] - x) ** 2 + (this.z[hint] - z) ** 2;
      for (let j = -30; j <= 30; j++) {
        const i = (hint + j + n) % n; const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }
    // project a world point onto the centreline: returns {i, s, lat, along}
    project(x, z, hint, out) {
      const i = this.nearestIndex(x, z, hint);
      const dx = x - this.x[i], dz = z - this.z[i];
      out = out || {};
      out.i = i;
      out.along = dx * this.tx[i] + dz * this.tz[i];
      out.lat = dx * this.nx[i] + dz * this.nz[i];
      out.s = U.mod(this.s[i] + out.along, this.length);
      return out;
    }
    cornerNameAt(s) {
      let name = ''; for (const c of this.data.corners) if (s >= c.s - 40) name = c.name; if (!name) name = this.data.corners[this.data.corners.length - 1].name; return name;
    }
    // world position for a grid slot (0 = pole)
    gridSlot(pos) {
      const s = this.sf - 10 - pos * 8;
      const i = this.idxAtS(s);
      const side = (pos % 2 === 0 ? -1 : 1) * 2.6; // pole on the right (inside of Abbey)
      return { x: this.x[i] + this.nx[i] * side, z: this.z[i] + this.nz[i] * side, heading: this.heading[i], i };
    }

    // ---------------------------------------------------------------- scene
    build(opts) {
      const g = this.group;
      this.buildGround(g);
      this.buildSurfaces(g);
      this.buildBarriers(g);
      this.buildPitLane(g);
      this.buildScenery(g);
      this.buildFurniture(g);
      return g;
    }

    ribbon(offsetA, offsetB, opts) {
      // builds a triangle strip along the whole loop between lateral offsets a(i) and b(i); opts.mask(i) can skip samples
      const n = this.n, pos = [], uv = [], col = [], idx = [];
      const color = new THREE.Color(opts.color || 0xffffff);
      let vi = 0; const map = new Int32Array(n + 1);
      const y = opts.y || 0;
      for (let i = 0; i <= n; i++) {
        const ii = i % n;
        if (opts.mask && !opts.mask(ii)) { map[i] = -1; continue; }
        const a = offsetA(ii), b = offsetB(ii);
        const ya = opts.ya ? opts.ya(ii) : y, yb = opts.yb ? opts.yb(ii) : y;
        pos.push(this.x[ii] + this.nx[ii] * a, ya, this.z[ii] + this.nz[ii] * a);
        pos.push(this.x[ii] + this.nx[ii] * b, yb, this.z[ii] + this.nz[ii] * b);
        const v = (i * this.ds) / (opts.vScale || 8);
        uv.push(0, v, 1, v);
        const ca = opts.colorFn ? opts.colorFn(ii, 0) : color, cb = opts.colorFn ? opts.colorFn(ii, 1) : color;
        col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b);
        map[i] = vi; vi += 2;
      }
      for (let i = 0; i < n; i++) {
        const a = map[i], b = map[i + 1]; if (a < 0 || b < 0) continue;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return geo;
    }

    buildGround(g) {
      const grass = U.noiseTexture(256, 0x3f7a2c, 0.06, 400, { seed: 3, gMul: 1.4 });
      const geo = new THREE.PlaneGeometry(4200, 4200, 1, 1);
      const mat = new THREE.MeshLambertMaterial({ map: grass, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 });
      const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.y = -0.08; m.receiveShadow = true; m.name = 'ground';
      g.add(m);
    }

    buildSurfaces(g) {
      const hw = this.halfWidth, kw = this.kerbWidth, n = this.n;
      // asphalt with white edge lines and a rubbered racing line
      const asphaltTex = U.noiseTexture(256, 0x3a3a3e, 0.05, 1, { seed: 11 });
      asphaltTex.repeat.set(2, 1);
      const grey = new THREE.Color(0x5a5a5f), rubber = new THREE.Color(0x3c3c40), white = new THREE.Color(0xffffff);
      const self = this;
      const strips = [[-hw, -hw + 0.3, white, white], [-hw + 0.3, hw - 0.3, null, null], [hw - 0.3, hw, white, white]];
      const mat = new THREE.MeshLambertMaterial({ map: asphaltTex, vertexColors: true });
      for (const st of strips) {
        const geo = this.ribbon(() => st[0], () => st[1], {
          vScale: 6,
          colorFn: (i, side) => {
            if (st[2]) return st[2];
            // darker band where the racing line runs
            const lat = side === 0 ? st[0] : st[1];
            const d = Math.abs(lat - self.lineOff[i]);
            return d < 3.5 ? rubber : grey;
          }
        });
        // interior: add a 3rd row to carry the rubber line colour. Simpler: use a 4-row ribbon for the interior.
        const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; g.add(m);
      }
      // rubbered racing line as its own faint ribbon
      const lineGeo = this.ribbon(i => this.lineOff[i] - 2.2, i => this.lineOff[i] + 2.2, { y: 0.012, color: 0x2e2e32, vScale: 6 });
      const lineMat = new THREE.MeshLambertMaterial({ color: 0x2b2b2f, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
      g.add(new THREE.Mesh(lineGeo, lineMat));

      // kerbs on both sides in the corners
      const kerbTex = (function () {
        const c = document.createElement('canvas'); c.width = 64; c.height = 128; const ctx = c.getContext('2d');
        ctx.fillStyle = '#e8e8e8'; ctx.fillRect(0, 0, 64, 128); ctx.fillStyle = '#d0141a'; ctx.fillRect(0, 0, 64, 64);
        const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
      })();
      const kk = this.smooth(this.k, 6);
      const kerbMask = i => Math.abs(kk[i]) > 1 / 420;
      const kerbMat = new THREE.MeshLambertMaterial({ map: kerbTex });
      for (const side of [-1, 1]) {
        const geo = this.ribbon(() => side * hw, () => side * (hw + kw), { mask: kerbMask, vScale: 2, ya: () => 0.02, yb: () => 0.06 });
        const m = new THREE.Mesh(geo, kerbMat); m.receiveShadow = true; g.add(m);
      }
      // tarmac run-off and gravel traps
      const runoffMat = new THREE.MeshLambertMaterial({ color: 0x6d6d70, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
      const gravelTex = U.noiseTexture(256, 0xcdb78a, 0.09, 1, { seed: 5 }); gravelTex.repeat.set(1, 1);
      const gravelMat = new THREE.MeshLambertMaterial({ map: gravelTex, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
      for (const side of [-1, 1]) {
        const run = side < 0 ? this.runoffL : this.runoffR, grav = side < 0 ? this.gravelL : this.gravelR, wall = side < 0 ? this.wallL : this.wallR;
        const r = this.ribbon(() => side * (hw + kw - 0.1), i => side * Math.min(hw + kw + 5, wall[i] - 0.5), { mask: i => run[i] && !grav[i], y: -0.01 });
        const rm = new THREE.Mesh(r, runoffMat); rm.receiveShadow = true; g.add(rm);
        const gg = this.ribbon(() => side * (hw + kw - 0.1), i => side * (wall[i] - 0.3), { mask: i => grav[i], y: -0.01, vScale: 10 });
        const gm = new THREE.Mesh(gg, gravelMat); gm.receiveShadow = true; g.add(gm);
      }
      // start / finish line
      const sfTex = (function () {
        const c = document.createElement('canvas'); c.width = 128; c.height = 32; const ctx = c.getContext('2d');
        for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { ctx.fillStyle = (i + j) % 2 ? '#fff' : '#111'; ctx.fillRect(i * 8, j * 8, 8, 8); }
        return new THREE.CanvasTexture(c);
      })();
      const i0 = this.idxAtS(this.sf);
      const sfGeo = new THREE.PlaneGeometry(hw * 2, 1.2);
      const sfMesh = new THREE.Mesh(sfGeo, new THREE.MeshBasicMaterial({ map: sfTex }));
      sfMesh.rotation.x = -Math.PI / 2; sfMesh.rotation.z = -this.heading[i0];
      sfMesh.position.set(this.x[i0], 0.015, this.z[i0]); g.add(sfMesh);
      // grid boxes
      const boxMat = new THREE.MeshBasicMaterial({ color: 0xf2c200 });
      for (let p = 0; p < 20; p++) {
        const slot = this.gridSlot(p);
        const box = new THREE.Group();
        const l1 = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 2.2), boxMat); l1.position.set(-0.6, 0, 1.1); l1.rotation.x = -Math.PI / 2;
        const l2 = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 2.2), boxMat); l2.position.set(-0.6, 0, -1.1); l2.rotation.x = -Math.PI / 2;
        const l3 = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.18), boxMat); l3.position.set(-0.1, 0, 0); l3.rotation.x = -Math.PI / 2;
        // model space: car forward = +x
        l1.position.set(1.8, 0, 1.1); l2.position.set(1.8, 0, -1.1); l3.position.set(2.8, 0, 0); l3.scale.set(1, 1, 1);
        l1.rotation.z = 0; l2.rotation.z = 0;
        box.add(l1, l2, l3);
        box.position.set(slot.x, 0.016, slot.z); box.rotation.y = -slot.heading; g.add(box);
      }
    }

    buildBarriers(g) {
      const n = this.n, hw = this.halfWidth;
      // tyre wall texture (stacked tyres, some painted)
      const tyreTex = (function () {
        const c = document.createElement('canvas'); c.width = 128; c.height = 64; const ctx = c.getContext('2d');
        ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, 128, 64);
        const cols = ['#202020', '#202020', '#f0f0f0', '#202020', '#d01418', '#202020'];
        for (let i = 0; i < 4; i++) { ctx.fillStyle = cols[i % cols.length]; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(i * 32 + 2, 4, 28, 56, 10) : ctx.rect(i * 32 + 2, 4, 28, 56); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(i * 32 + 2, 30, 28, 4); }
        const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
      })();
      const armcoTex = (function () {
        const c = document.createElement('canvas'); c.width = 64; c.height = 64; const ctx = c.getContext('2d');
        ctx.fillStyle = '#9a9ea3'; ctx.fillRect(0, 0, 64, 64); ctx.fillStyle = '#6f7378'; ctx.fillRect(0, 28, 64, 8); ctx.fillStyle = '#c3c6c9'; ctx.fillRect(0, 10, 64, 6); ctx.fillRect(0, 48, 64, 6);
        const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
      })();
      const kk = this.smooth(this.k, 12);
      const tyreMat = new THREE.MeshLambertMaterial({ map: tyreTex, side: THREE.DoubleSide });
      const armMat = new THREE.MeshLambertMaterial({ map: armcoTex, side: THREE.DoubleSide });
      for (const side of [-1, 1]) {
        const wall = side < 0 ? this.wallL : this.wallR;
        // vertical quad: a at ground, b at 1.1m - we reuse ribbon with ya/yb and same lateral offset
        const isTyre = i => Math.abs(kk[i]) > 1 / 600;
        const tg = this.ribbon(i => side * wall[i], i => side * wall[i], { mask: isTyre, ya: () => 0, yb: () => 1.0, vScale: 2.6 });
        const tm = new THREE.Mesh(tg, tyreMat); tm.castShadow = true; g.add(tm);
        const ag = this.ribbon(i => side * wall[i], i => side * wall[i], { mask: i => !isTyre(i), ya: () => 0, yb: () => 0.8, vScale: 4 });
        const am = new THREE.Mesh(ag, armMat); g.add(am);
        // debris fence posts behind the barrier (instanced boxes every 10 m)
      }
      // debris fence (semi transparent mesh) 3.5 m high, 1 m behind barriers
      const fenceTex = (function () {
        const c = document.createElement('canvas'); c.width = 64; c.height = 64; const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, 64, 64); ctx.strokeStyle = 'rgba(40,40,40,0.9)'; ctx.lineWidth = 1.5;
        for (let i = 0; i <= 64; i += 8) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 64); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(64, i); ctx.stroke(); }
        ctx.fillStyle = '#444'; ctx.fillRect(0, 0, 3, 64);
        const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
      })();
      const fenceMat = new THREE.MeshBasicMaterial({ map: fenceTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.85 });
      for (const side of [-1, 1]) {
        const wall = side < 0 ? this.wallL : this.wallR;
        const fg = this.ribbon(i => side * (wall[i] + 1.0), i => side * (wall[i] + 1.0), { ya: () => 0, yb: () => 3.2, vScale: 3 });
        g.add(new THREE.Mesh(fg, fenceMat));
      }
    }

    buildPitLane(g) {
      const pts = this.data.pit.map(p => new THREE.Vector3(p[0], 0, p[1]));
      if (pts.length < 3) return;
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      curve.arcLengthDivisions = 4000;
      const len = curve.getLength(); const n = Math.max(8, Math.round(len / 4));
      const sp = curve.getSpacedPoints(n);
      const pos = [], idx = [], uv = [];
      for (let i = 0; i <= n; i++) {
        const a = sp[Math.max(0, i - 1)], b = sp[Math.min(n, i + 1)];
        let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const nx = dz, nz = -dx, w = 5.5;
        pos.push(sp[i].x + nx * w, 0.0, sp[i].z + nz * w, sp[i].x - nx * w, 0.0, sp[i].z - nz * w);
        uv.push(0, i, 1, i);
      }
      for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x55555a })); m.receiveShadow = true; g.add(m);
      // pit wall between the pit lane and the track: concrete blocks along the pit side of the main straight
      this.pitCurve = curve;
    }

    buildScenery(g) {
      const sc = this.data.scenery;
      const self = this;
      // crowd texture for grandstand walls
      const crowdTex = (function () {
        const c = document.createElement('canvas'); c.width = 128; c.height = 128; const ctx = c.getContext('2d');
        ctx.fillStyle = '#2a2d33'; ctx.fillRect(0, 0, 128, 128);
        const r = U.rng(99); const palette = ['#e63946', '#f1faee', '#a8dadc', '#457b9d', '#ffb703', '#fb8500', '#8ecae6', '#219ebc', '#ffffff', '#222', '#06d6a0', '#ef476f'];
        for (let y = 0; y < 128; y += 6) for (let x = 0; x < 128; x += 5) { ctx.fillStyle = palette[Math.floor(r() * palette.length)]; ctx.fillRect(x + r() * 2, y + r() * 2, 3, 4); }
        const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.15, 0.3); return t;
      })();
      const windowTex = (function () {
        const c = document.createElement('canvas'); c.width = 64; c.height = 64; const ctx = c.getContext('2d');
        ctx.fillStyle = '#c9ccd1'; ctx.fillRect(0, 0, 64, 64); ctx.fillStyle = '#4a6a8a';
        for (let y = 8; y < 64; y += 20) for (let x = 6; x < 64; x += 16) ctx.fillRect(x, y, 10, 10);
        const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.25, 0.3); return t;
      })();

      function extrude(polys, heightFn, mat, roofColor) {
        const geos = [];
        for (const b of polys) {
          const poly = b.p || b; if (poly.length < 3) continue;
          const shape = new THREE.Shape();
          // Shape works in XY; we map x->x, z->y then rotate the geometry
          shape.moveTo(poly[0][0], poly[0][1]);
          for (let i = 1; i < poly.length; i++) shape.lineTo(poly[i][0], poly[i][1]);
          shape.closePath();
          const h = heightFn(b);
          const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
          geo.rotateX(Math.PI / 2); geo.translate(0, h, 0);
          // planar uv for walls: use world x/z along wall + y
          const p = geo.attributes.position, uv = geo.attributes.uv, nrm = geo.attributes.normal;
          for (let i = 0; i < p.count; i++) {
            const nx = nrm.getX(i), ny = nrm.getY(i);
            if (Math.abs(ny) > 0.5) uv.setXY(i, p.getX(i) * 0.1, p.getZ(i) * 0.1);
            else uv.setXY(i, (Math.abs(nx) > 0.5 ? p.getZ(i) : p.getX(i)) * 0.5, p.getY(i) * 0.5);
          }
          geos.push(geo.index ? geo.toNonIndexed() : geo);
        }
        if (!geos.length) return null;
        const merged = mergeGeos(geos);
        const m = new THREE.Mesh(merged, mat); m.castShadow = true; m.receiveShadow = true; return m;
      }
      function mergeGeos(geos) {
        const pos = [], nrm = [], uv = [];
        for (const ge of geos) { pos.push(...ge.attributes.position.array); nrm.push(...ge.attributes.normal.array); uv.push(...ge.attributes.uv.array); }
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
        out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        return out;
      }
      // keep buildings that do not overlap the track
      const clear = (poly, margin) => {
        for (const p of poly) { const pr = self.project(p[0], p[1], null); if (Math.abs(pr.lat) < self.halfWidth + margin) return false; }
        return true;
      };
      const stands = sc.grandstands.filter(b => clear(b.p, 9));
      const standMesh = extrude(stands, b => (b.h && b.h > 6 ? Math.min(b.h, 22) : 12), new THREE.MeshLambertMaterial({ map: crowdTex }));
      if (standMesh) { standMesh.name = 'grandstands'; g.add(standMesh); }
      // roofs for grandstands (white canopy slightly larger)
      const roofMesh = extrude(stands, () => 1.2, new THREE.MeshLambertMaterial({ color: 0xe9ecef }));
      if (roofMesh) { roofMesh.position.y = 12; g.add(roofMesh); }
      const blds = sc.buildings.filter(b => clear(b.p, 9) && Math.abs(U.polyArea(b.p)) > 60);
      const bMesh = extrude(blds, b => (b.h ? Math.min(b.h, 30) : 6 + Math.min(10, Math.sqrt(Math.abs(U.polyArea(b.p))) * 0.15)), new THREE.MeshLambertMaterial({ map: windowTex }));
      if (bMesh) { bMesh.name = 'buildings'; g.add(bMesh); }
      // water
      for (const w of sc.water) {
        const shape = new THREE.Shape(); shape.moveTo(w[0][0], w[0][1]); for (let i = 1; i < w.length; i++) shape.lineTo(w[i][0], w[i][1]);
        const geo = new THREE.ShapeGeometry(shape); geo.rotateX(Math.PI / 2);
        const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x2f6fb5, side: THREE.DoubleSide })); m.position.y = -0.03; g.add(m);
      }
      // trees: one instanced low-poly tree scattered through the woods polygons and in clumps around the circuit
      this.buildTrees(g, sc.woods);
    }

    buildTrees(g, woods) {
      const trunk = new THREE.CylinderGeometry(0.25, 0.4, 3, 5); trunk.translate(0, 1.5, 0);
      const crown = new THREE.ConeGeometry(2.6, 7, 6); crown.translate(0, 6, 0);
      const crown2 = new THREE.SphereGeometry(2.4, 6, 5); crown2.translate(0, 5.2, 0);
      const parts = [[trunk, 0x5b3a1e], [crown, 0x2f6b2a], [crown2, 0x3b7d32]];
      const pos = [], col = [], nrm = [];
      for (const [geo, c] of parts) {
        const ng = geo.toNonIndexed(); const cc = new THREE.Color(c);
        pos.push(...ng.attributes.position.array); nrm.push(...ng.attributes.normal.array);
        for (let i = 0; i < ng.attributes.position.count; i++) col.push(cc.r, cc.g, cc.b);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const r = U.rng(42);
      const places = [];
      for (const w of woods) {
        const b = U.polyBounds(w); const area = Math.abs(U.polyArea(w));
        const count = Math.min(600, Math.floor(area / 260));
        let tries = 0;
        while (places.length < 3000 && tries < count * 4 && count > 0) {
          tries++;
          const x = U.lerp(b.x0, b.x1, r()), z = U.lerp(b.z0, b.z1, r());
          if (!U.pointInPoly(x, z, w)) continue;
          const pr = this.project(x, z, null); if (Math.abs(pr.lat) < Math.max(this.wallL[pr.i], this.wallR[pr.i]) + 6) continue;
          places.push([x, z]);
          if (places.length >= count) { }
        }
      }
      // ring of trees around the outside of the circuit, beyond the fences, where there is no building
      const n = this.n;
      for (let i = 0; i < n; i += 9) {
        for (const side of [-1, 1]) {
          if (r() < 0.55) continue;
          const wall = side < 0 ? this.wallL[i] : this.wallR[i];
          const d = wall + 10 + r() * 30;
          places.push([this.x[i] + this.nx[i] * side * d, this.z[i] + this.nz[i] * side * d]);
        }
      }
      const inst = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), places.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
      places.forEach((pl, i) => {
        const s = 0.7 + r() * 0.8; sc.set(s, s * (0.8 + r() * 0.5), s); p.set(pl[0], 0, pl[1]);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2);
        m.compose(p, q, sc); inst.setMatrixAt(i, m);
      });
      inst.castShadow = true; inst.name = 'trees'; g.add(inst);
      this.treeCount = places.length;
    }

    buildFurniture(g) {
      const hw = this.halfWidth;
      const self = this;
      const placeAt = (s, side, dist, h) => {
        const i = this.idxAtS(s);
        const wall = side < 0 ? this.wallL[i] : this.wallR[i];
        const d = dist != null ? dist : wall - 0.1;
        return { x: this.x[i] + this.nx[i] * side * d, z: this.z[i] + this.nz[i] * side * d, heading: this.heading[i], i };
      };
      // --- start light gantry across the track at the start line
      const i0 = this.idxAtS(this.sf + 6);
      const gantry = new THREE.Group();
      const postMat = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7.5, 0.5), postMat); post.position.set(0, 3.75, side * (hw + 1.6)); post.castShadow = true; gantry.add(post);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, hw * 2 + 3.6), postMat); beam.position.y = 7.4; gantry.add(beam);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.6, 6.4), new THREE.MeshLambertMaterial({ color: 0x111111 })); panel.position.y = 6.2; gantry.add(panel);
      this.startLights = [];
      const offMat = new THREE.MeshBasicMaterial({ color: 0x2a0b0b });
      for (let c = 0; c < 5; c++) {
        const col = [];
        for (let rr = 0; rr < 2; rr++) {
          const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), offMat.clone());
          lamp.position.set(-0.25, 6.55 - rr * 0.65, (c - 2) * 1.15);
          gantry.add(lamp); col.push(lamp);
        }
        this.startLights.push(col);
      }
      gantry.position.set(this.x[i0], 0, this.z[i0]); gantry.rotation.y = -this.heading[i0];
      g.add(gantry);

      // --- boards: corner names on the outside barrier, braking boards, DRS signs
      const boardMat = (tex) => new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
      const addBoard = (s, side, text, opts) => {
        const p = placeAt(s, side, null);
        const w = opts.w || 6, h = opts.h || 1.4;
        const tex = U.textTexture(text, { w: 512, h: Math.round(512 * h / w), bg: opts.bg, color: opts.color, size: opts.size || 70, stripe: opts.stripe });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), boardMat(tex));
        m.position.set(p.x, (opts.y || 2.2), p.z);
        m.rotation.y = -p.heading + (side < 0 ? 0 : Math.PI);
        g.add(m);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, opts.y || 2.2, 0.15), postMat); post.position.set(p.x, (opts.y || 2.2) / 2, p.z); g.add(post);
      };
      const kk = this.smooth(this.k, 15);
      for (const c of this.data.corners) {
        if (/Straight/i.test(c.name)) continue;
        const i = this.idxAtS(c.s + 50);
        const side = kk[i] > 0 ? 1 : -1; // outside of the corner
        addBoard(c.s + 50, side, c.name.toUpperCase(), { bg: '#ffffff', color: '#111', w: 7, h: 1.5, size: 64 });
      }
      // braking distance boards before the big stops
      const stops = ['Village', 'Brooklands', 'Stowe', 'Vale', 'Club', 'Abbey', 'Copse', 'Luffield'];
      for (const c of this.data.corners) {
        if (stops.indexOf(c.name) < 0) continue;
        const i = this.idxAtS(c.s + 40); const side = kk[i] > 0 ? 1 : -1;
        for (const d of [150, 100, 50]) addBoard(c.s - d + 20, side, String(d), { bg: '#f2c200', color: '#111', w: 1.6, h: 1.6, size: 180, y: 1.6 });
      }
      for (const z of this.drs) {
        const si = this.idxAtS(z.start); const side = -1;
        addBoard(z.detect, side, 'DRS DETECTION', { bg: '#ffffff', color: '#111', w: 5, h: 1.2, size: 70, stripe: '#1a73e8' });
        addBoard(z.start, side, 'DRS', { bg: '#1a73e8', color: '#fff', w: 4, h: 1.6, size: 170 });
        addBoard(z.start, 1, 'DRS', { bg: '#1a73e8', color: '#fff', w: 4, h: 1.6, size: 170 });
        // DRS zone line across the track
        const i = this.idxAtS(z.start);
        const line = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 0.4), new THREE.MeshBasicMaterial({ color: 0x1a73e8 }));
        line.rotation.x = -Math.PI / 2; line.rotation.z = -this.heading[i]; line.position.set(this.x[i], 0.014, this.z[i]); g.add(line);
        const di = this.idxAtS(z.detect);
        const dl = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 0.3), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        dl.rotation.x = -Math.PI / 2; dl.rotation.z = -this.heading[di]; dl.position.set(this.x[di], 0.014, this.z[di]); g.add(dl);
      }
      // big sponsor bridge over Hangar Straight and the pit straight
      const bridge = (s, text) => {
        const i = this.idxAtS(s); const grp = new THREE.Group();
        for (const side of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8, 0.8), postMat); post.position.set(0, 4, side * (hw + 3)); grp.add(post); }
        const tex = U.textTexture(text, { w: 1024, h: 128, bg: '#e10600', color: '#fff', size: 80 });
        const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, hw * 2 + 7), new THREE.MeshLambertMaterial({ color: 0xe10600 })); b.position.y = 8.5; grp.add(b);
        for (const dir of [-1, 1]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 + 6.8, 2.1), new THREE.MeshBasicMaterial({ map: tex })); f.position.set(dir * 0.62, 8.5, 0); f.rotation.y = dir * Math.PI / 2; grp.add(f); }
        grp.position.set(this.x[i], 0, this.z[i]); grp.rotation.y = -this.heading[i]; g.add(grp);
      };
      bridge(this.sf + 140, 'EQUATION I');
      bridge(4650, 'EI  ·  SILVERSTONE');
      bridge(2850, 'EQUATION I');
      // marshal posts: small orange huts at a few corners
      const hutMat = new THREE.MeshLambertMaterial({ color: 0xff7a00 });
      for (const c of this.data.corners) {
        if (/Straight/i.test(c.name)) continue;
        const p = placeAt(c.s + 20, kk[this.idxAtS(c.s + 20)] > 0 ? -1 : 1, null);
        const hut = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 1.6), hutMat); hut.position.set(p.x + this.nx[p.i] * 0, 1.1, p.z); hut.castShadow = true;
        // move 2 m behind the wall
        const side = kk[this.idxAtS(c.s + 20)] > 0 ? -1 : 1;
        hut.position.x += this.nx[p.i] * side * 2.5; hut.position.z += this.nz[p.i] * side * 2.5; g.add(hut);
      }
    }

    setStartLights(count) {
      if (!this.startLights) return;
      this.startLights.forEach((col, c) => col.forEach(l => { l.material.color.setHex(c < count ? 0xff1a1a : 0x2a0b0b); }));
    }
  }
  EI.Track = Track;
})();
