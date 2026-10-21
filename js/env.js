// Equation I - environment core: track distance field, occupancy grid, field patchwork, terrain and ground shading.
// Shared by env_veg.js (trees, hedges, grass cards) and env_venue.js (stands, car parks, roads, fences...).
// Everything is deterministic (EI.U.rng / hashed noise) and built once at load.
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  const Env = {};

  // ---------------------------------------------------------------- geometry helpers (vertex-coloured merge, boxes, beams)
  Env.merge = function (geos) {
    let count = 0; const list = [];
    for (const ge of geos) { const g = ge.index ? ge.toNonIndexed() : ge; list.push([g, ge.userData.color]); count += g.attributes.position.count; }
    const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3), uv = new Float32Array(count * 2), col = new Float32Array(count * 3);
    let o = 0;
    for (const [g, c] of list) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      if (g.attributes.color && !c) col.set(g.attributes.color.array, o * 3);
      else { const r = c ? c.r : 1, gg = c ? c.g : 1, b = c ? c.b : 1; for (let i = 0; i < n; i++) { col[(o + i) * 3] = r; col[(o + i) * 3 + 1] = gg; col[(o + i) * 3 + 2] = b; } }
      o += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  };
  // binary data blocks (base64, little-endian): int16 decimetres -> metres; the city's packed building footprints
  Env.b64bytes = function (s) { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
  Env.decodeI16 = function (s) { const b = Env.b64bytes(s); const dv = new DataView(b.buffer); const n = b.length >> 1; const out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = dv.getInt16(i * 2, true) / 10; return out; };
  // per building: u16 vertex count, u16 height (dm, 0 = unknown), u8 kind, u8 roof shape, then (i16 x, i16 z) in half metres
  Env.decodeCity = function (blk) {
    if (!blk || !blk.d) return []; const b = Env.b64bytes(blk.d); const dv = new DataView(b.buffer); const out = []; let o = 0;
    while (o + 6 <= b.length) { const n = dv.getUint16(o, true), h = dv.getUint16(o + 2, true) / 10, k = b[o + 4], r = b[o + 5]; o += 6; const p = []; for (let i = 0; i < n; i++) { p.push([dv.getInt16(o, true) / 2, dv.getInt16(o + 2, true) / 2]); o += 4; } out.push({ p, h, kc: k, roof: r }); }
    return out;
  };
  // street polylines: u16 point count, u8 width (half metres), u8 bridge flag, then (i16 x, i16 z) in metres
  Env.decodeStreets = function (blk) {
    if (!blk || !blk.d) return []; const b = Env.b64bytes(blk.d); const dv = new DataView(b.buffer); const out = []; let o = 0;
    while (o + 4 <= b.length) { const n = dv.getUint16(o, true), w = b[o + 2] / 2, br = b[o + 3]; o += 4; const p = []; for (let i = 0; i < n; i++) { p.push([dv.getInt16(o, true), dv.getInt16(o + 2, true)]); o += 4; } out.push({ pts: p, w, bridge: !!br }); }
    return out;
  };
  // fast builder for big merged meshes: raw arrays of triangles with per-vertex colour
  class Builder {
    constructor() { this.p = []; this.n = []; this.c = []; this.uv = []; }
    get count() { return this.p.length / 3; }
    tri(a, b, c, col, uvs) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      this.n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
      const cc = col.length === 3 && typeof col[0] === 'object' ? col : [col, col, col];
      for (const k of cc) this.c.push(k.r, k.g, k.b);
      if (uvs) this.uv.push(uvs[0], uvs[1], uvs[2], uvs[3], uvs[4], uvs[5]); else this.uv.push(0, 0, 0, 0, 0, 0);
    }
    quad(a, b, c, d, col, uvs) { this.tri(a, b, c, col, uvs ? [uvs[0], uvs[1], uvs[2], uvs[3], uvs[4], uvs[5]] : null); this.tri(a, c, d, col, uvs ? [uvs[0], uvs[1], uvs[4], uvs[5], uvs[6], uvs[7]] : null); }
    // axis-aligned box in a local frame m (Matrix4 elements), 6 faces minus optional bottom
    box(m, w, h, d, x, y, z, col, opts) {
      const hw = w / 2, hd = d / 2; const P = (lx, ly, lz) => Env.xf(m, x + lx, y + ly, z + lz);
      const a = P(-hw, 0, -hd), b = P(hw, 0, -hd), c = P(hw, 0, hd), e = P(-hw, 0, hd), A = P(-hw, h, -hd), B = P(hw, h, -hd), C = P(hw, h, hd), E = P(-hw, h, hd);
      const top = (opts && opts.top) || col;
      // counter-clockwise seen from outside (front faces), in a right-handed frame
      this.quad(A, E, C, B, top); this.quad(a, A, B, b, col); this.quad(b, B, C, c, col); this.quad(c, C, E, e, col); this.quad(e, E, A, a, col);
      if (opts && opts.bottom) this.quad(a, b, c, e, col);
    }
    // beam between two local points (square section)
    beam(m, p0, p1, th, col) {
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2]; const L = Math.hypot(dx, dy, dz); if (L < 0.01) return;
      const ax = [dx / L, dy / L, dz / L]; let up = Math.abs(ax[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      let s = [ax[1] * up[2] - ax[2] * up[1], ax[2] * up[0] - ax[0] * up[2], ax[0] * up[1] - ax[1] * up[0]]; let sl = Math.hypot(s[0], s[1], s[2]); s = s.map(v => v / sl * th / 2);
      let u = [ax[1] * s[2] - ax[2] * s[1], ax[2] * s[0] - ax[0] * s[2], ax[0] * s[1] - ax[1] * s[0]]; const ul = Math.hypot(u[0], u[1], u[2]); u = u.map(v => v / ul * th / 2);
      const corner = (p, i) => { const sx = i & 1 ? 1 : -1, ux = i & 2 ? 1 : -1; return Env.xf(m, p[0] + s[0] * sx + u[0] * ux, p[1] + s[1] * sx + u[1] * ux, p[2] + s[2] * sx + u[2] * ux); };
      const A = [0, 1, 3, 2].map(i => corner(p0, i)), B = [0, 1, 3, 2].map(i => corner(p1, i));
      const c0 = Env.xf(m, (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
      for (let k = 0; k < 4; k++) {
        const k2 = (k + 1) % 4; const a = A[k], b = A[k2], c = B[k2], d = B[k];
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const mx = (a[0] + c[0]) / 2 - c0[0], my = (a[1] + c[1]) / 2 - c0[1], mz = (a[2] + c[2]) / 2 - c0[2];
        if (nx * mx + ny * my + nz * mz >= 0) this.quad(a, b, c, d, col); else this.quad(d, c, b, a, col);
      }
    }
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.computeBoundingSphere(); return g;
    }
  }
  Env.Builder = Builder;
  // transform a local point by a Matrix4 (column-major elements)
  Env.xf = function (m, x, y, z) { const e = m.elements; return [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]]; };
  // local frame: +x along (tx,tz), +y up, +z = (nx,nz) (unit, horizontal), origin (x,y,z)
  // always right-handed (x cross y = z): when (t, n) would be mirrored, x is flipped, so front faces keep their winding
  Env.frame = function (x, y, z, tx, tz, nx, nz) { if (-tz * nx + tx * nz < 0) { tx = -tx; tz = -tz; } const m = new THREE.Matrix4(); m.set(tx, 0, nx, x, 0, 1, 0, y, tz, 0, nz, z, 0, 0, 0, 1); return m; };
  Env.C = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  // 2D canvases are drawn once on the CPU and read back; willReadFrequently keeps them off the GPU (much faster for thousands of small paths)
  Env.canvas = function (w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d', { willReadFrequently: true })]; };
  // alpha-cutout texture from a canvas: transparent texels get the colour of the nearest opaque ones (push-pull fill),
  // so mipmapped foliage / crowd edges do not fade to black. Rows are flipped to match CanvasTexture's flipY.
  Env.cutout = function (c, opts) {
    opts = opts || {}; const W = c.width, H = c.height; const src = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    // pyramid of weighted colour sums
    const levels = []; let w = W, h = H; const n0 = W * H; const R0 = new Float32Array(n0), G0 = new Float32Array(n0), B0 = new Float32Array(n0), A0 = new Float32Array(n0);
    for (let i = 0; i < n0; i++) { const al = src[i * 4 + 3] > 24 ? 1 : 0; A0[i] = al; R0[i] = src[i * 4] * al; G0[i] = src[i * 4 + 1] * al; B0[i] = src[i * 4 + 2] * al; }
    levels.push({ w, h, r: R0, g: G0, b: B0, a: A0 });
    while (w > 1 || h > 1) {
      const w2 = Math.max(1, w >> 1), h2 = Math.max(1, h >> 1), L = levels[levels.length - 1]; const R = new Float32Array(w2 * h2), G = new Float32Array(w2 * h2), B = new Float32Array(w2 * h2), A = new Float32Array(w2 * h2);
      for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) { const o = y * w2 + x; for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const k = Math.min(h - 1, y * 2 + dy) * w + Math.min(w - 1, x * 2 + dx); R[o] += L.r[k]; G[o] += L.g[k]; B[o] += L.b[k]; A[o] += L.a[k]; } }
      levels.push({ w: w2, h: h2, r: R, g: G, b: B, a: A }); w = w2; h = h2;
    }
    // pull: every texel becomes an average colour; empty texels inherit their parent's
    const top = levels[levels.length - 1]; if (top.a[0] > 0) { top.r[0] /= top.a[0]; top.g[0] /= top.a[0]; top.b[0] /= top.a[0]; } else { top.r[0] = top.g[0] = top.b[0] = 128; }
    for (let l = levels.length - 2; l >= 0; l--) {
      const L = levels[l], P = levels[l + 1];
      for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
        const o = y * L.w + x; const k = L.a[o];
        if (k > 0) { L.r[o] /= k; L.g[o] /= k; L.b[o] /= k; } else { const po = Math.min(P.h - 1, y >> 1) * P.w + Math.min(P.w - 1, x >> 1); L.r[o] = P.r[po]; L.g[o] = P.g[po]; L.b[o] = P.b[po]; }
      }
    }
    const out = new Uint8Array(n0 * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, o = ((H - 1 - y) * W + x) * 4; out[o] = R0[i]; out[o + 1] = G0[i]; out[o + 2] = B0[i]; out[o + 3] = src[i * 4 + 3]; }
    const t = new THREE.DataTexture(out, W, H, THREE.RGBAFormat); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = opts.aniso || 4;
    if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; t.encoding = THREE.sRGBEncoding; return t;
  };
  Env.tex = function (c, repeat, aniso) { const t = new THREE.CanvasTexture(c); if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso || 8; return U.srgb(t); };
  // double-sided cards: keep the authored normal on back faces (no flip) so foliage / crowd stay lit from both sides
  Env.noFlip = function (sh) { sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal = normal * faceDirection;', '').replace('normal = normal * ( float( gl_FrontFacing ) * 2.0 - 1.0 );', '')); };
  // give an InstancedMesh a bounding sphere that covers all instances (r128 culls instanced meshes by the base geometry only)
  Env.fitInstances = function (inst, pad) {
    const a = inst.instanceMatrix.array; let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < inst.count; i++) { const x = a[i * 16 + 12], y = a[i * 16 + 13], z = a[i * 16 + 14]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    if (!inst.count) { inst.visible = false; return; }
    const g = inst.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
    // the geometry must not be shared with another InstancedMesh (the sphere is per mesh); objects stay at the identity transform
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + g.boundingSphere.radius + (pad || 0));
  };

  // ---------------------------------------------------------------- cell-sorted instance sets
  // Items carry several parallel float records (one per stride). After finalize() they are sorted by grid cell, so the set of
  // items around the eye is gathered with a few block copies (typed-array set) instead of per-item work; rebuilt only when the
  // eye has moved a few tens of metres.
  class CellSet {
    constructor(strides, cell) { this.strides = strides; this.cell = cell || 50; this.raw = strides.map(() => []); this.keys = []; this.n = 0; }
    push(x, z, recs) { const C = this.cell; this.keys.push(((Math.floor(x / C) + 2048) << 12) | (Math.floor(z / C) + 2048)); for (let k = 0; k < recs.length; k++) { const a = this.raw[k], r = recs[k]; for (let j = 0; j < r.length; j++) a.push(r[j]); } this.n++; }
    finalize() {
      const n = this.n, keys = this.keys, order = new Uint32Array(n); for (let i = 0; i < n; i++) order[i] = i;
      order.sort((a, b) => keys[a] - keys[b] || a - b);
      this.data = this.strides.map((st, k) => { const src = this.raw[k], out = new Float32Array(n * st); for (let i = 0; i < n; i++) { const o = order[i] * st; for (let j = 0; j < st; j++) out[i * st + j] = src[o + j]; } return out; });
      const C = this.cell; this.cells = [];
      for (let i = 0; i < n;) { const key = keys[order[i]]; let j = i; while (j < n && keys[order[j]] === key) j++; this.cells.push({ x: ((key >> 12) - 2048 + 0.5) * C, z: ((key & 4095) - 2048 + 0.5) * C, start: i, count: j - i }); i = j; }
      this.raw = null; this.keys = null; return this;
    }
    // copy every cell whose square may hold items at distance r0..r1 from (x, z) into the target arrays; returns the item count
    // with Env.eyes set (split screen: one list of [x, z] per view) a cell is taken when it is in range of any eye
    gather(x, z, r0, r1, targets) {
      const h = this.cell * 0.7072, st = this.strides; let n = 0; const eyes = Env.eyes; const cap = targets[0].length / st[0];
      for (const c of this.cells) {
        let take = false;
        if (eyes) { for (const e of eyes) { const d = Math.hypot(c.x - e[0], c.z - e[1]); if (!(d + h < r0 || d - h > r1)) { take = true; break; } } }
        else { const d = Math.hypot(c.x - x, c.z - z); take = !(d + h < r0 || d - h > r1); }
        if (!take || n + c.count > cap) continue;
        for (let k = 0; k < st.length; k++) targets[k].set(this.data[k].subarray(c.start * st[k], (c.start + c.count) * st[k]), n * st[k]);
        n += c.count;
      }
      return n;
    }
  }
  Env.CellSet = CellSet;
  // a CellSet bound to buffer attributes (InstancedMesh instanceMatrix / instanceColor or InstancedBufferAttributes):
  // regather when the eye has moved more than `move` metres or the range changed; uploads only the used range
  class DynSet {
    constructor(set, attrs, setCount, move) { this.set = set; this.attrs = attrs; this.setCount = setCount; this.move = move || 30; this.last = null; this.r0 = 0; this.r1 = 0; this.n = 0; }
    range(r0, r1) { if (r0 !== this.r0 || r1 !== this.r1) { this.r0 = r0; this.r1 = r1; this.last = null; } }
    update(x, z, force) {
      // split screen (Env.eyes): one gather for the union of the views, redone when any eye has moved
      const eyes = Env.eyes ? Env.eyes.map(e => [e[0], e[1]]) : [[x, z]];
      const still = this.last && this.last.length === eyes.length && eyes.every((e, k) => Math.hypot(e[0] - this.last[k][0], e[1] - this.last[k][1]) < this.move);
      if (!force && this.last && (this.r0 <= 0 && this.r1 >= 1e4 || still)) return false;
      this.last = eyes; const st = this.set.strides;
      const n = this.r1 > this.r0 ? this.set.gather(x, z, this.r0, this.r1, this.attrs.map(a => a.array)) : 0;
      this.attrs.forEach((a, k) => { a.updateRange.offset = 0; a.updateRange.count = Math.max(1, n * st[k]); a.needsUpdate = true; });
      this.n = n; this.setCount(n); return true;
    }
  }
  Env.DynSet = DynSet;
  // InstancedBufferGeometry from a base geometry + per-instance vec4 attributes sized for `cap` instances
  Env.instGeo = function (base, names, cap) {
    const g = new THREE.InstancedBufferGeometry(); g.index = base.index; for (const k in base.attributes) g.setAttribute(k, base.attributes[k]);
    const attrs = names.map(nm => { const a = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, cap) * 4), 4); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(nm, a); return a; });
    g.instanceCount = 0; g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5); return [g, attrs];
  };

  // ---------------------------------------------------------------- static scenery merged by material and split into spatial chunks
  // Every untextured vertex-coloured structure (stands, roofs, marquees, towers, marshal posts, lorries...) goes into one material
  // (roughness / metalness per vertex) and is cut into CHUNK x CHUNK m tiles, so the camera and the shadow camera only draw the
  // tiles they see. layer 'main' = buildings and stands (always shown), 'clutter' = small things that the low / medium tiers drop
  // beyond a distance.
  class Statics {
    constructor() { this.src = []; }
    add(geo, rough, metal, layer) { if (geo && geo.attributes.position.count) this.src.push({ g: geo.index ? geo.toNonIndexed() : geo, rough, metal, layer: layer || 'main' }); }
    build(group, CH) {
      CH = CH || 600; const buckets = new Map();
      for (const s of this.src) {
        const p = s.g.attributes.position.array, nt = p.length / 9; const keys = new Int32Array(nt);
        for (let t = 0; t < nt; t++) { const o = t * 9; const x = (p[o] + p[o + 3] + p[o + 6]) / 3, z = (p[o + 2] + p[o + 5] + p[o + 8]) / 3; const key = (Math.floor(x / CH) + 64) * 128 + (Math.floor(z / CH) + 64); keys[t] = key; const bk = s.layer + keys[t]; let b = buckets.get(bk); if (!b) buckets.set(bk, b = { layer: s.layer, key, n: 0, parts: [] }); b.n++; }
        s.keys = keys;
      }
      for (const b of buckets.values()) b.pos = new Float32Array(b.n * 9), b.nrm = new Float32Array(b.n * 9), b.col = new Float32Array(b.n * 9), b.rm = new Float32Array(b.n * 6), b.o = 0;
      for (const s of this.src) {
        const A = s.g.attributes, p = A.position.array, nr = A.normal.array, c = A.color ? A.color.array : null; const nt = p.length / 9;
        for (let t = 0; t < nt; t++) {
          const b = buckets.get(s.layer + s.keys[t]); const o = b.o; b.o++;
          b.pos.set(p.subarray(t * 9, t * 9 + 9), o * 9); b.nrm.set(nr.subarray(t * 9, t * 9 + 9), o * 9);
          if (c) b.col.set(c.subarray(t * 9, t * 9 + 9), o * 9); else b.col.fill(1, o * 9, o * 9 + 9);
          for (let v = 0; v < 3; v++) { b.rm[o * 6 + v * 2] = s.rough; b.rm[o * 6 + v * 2 + 1] = s.metal; }
        }
      }
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 });
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 rm;\nvarying vec2 vRM;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = rm;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRM;').replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;').replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;');
      };
      mat.customProgramCacheKey = () => 'env-static-rm';
      const chunks = []; let tris = 0;
      for (const b of buckets.values()) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(b.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(b.nrm, 3)); g.setAttribute('color', new THREE.BufferAttribute(b.col, 3)); g.setAttribute('rm', new THREE.BufferAttribute(b.rm, 2)); g.computeBoundingSphere(); g.computeBoundingBox();
        const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; m.name = b.layer === 'clutter' ? 'venueClutter' : 'venueStatic'; m.userData.box = g.boundingBox; m.userData.layer = b.layer;
        group.add(m); chunks.push(m); tris += b.n;
      }
      this.src = []; this.chunks = chunks; this.mat = mat; this.tris = tris;
      return chunks;
    }
  }
  Env.Statics = Statics;
  // horizontal distance from (x, z) to a Box3
  // distance to the nearest eye (split screen: Env.eyes lists every view's eye)
  Env.eyeDist = function (b, x, z) { const E = Env.eyes; if (!E) return Env.boxDist(b, x, z); let d = Infinity; for (const e of E) d = Math.min(d, Env.boxDist(b, e[0], e[1])); return d; };
  Env.boxDist = function (b, x, z) { const dx = Math.max(b.min.x - x, 0, x - b.max.x), dz = Math.max(b.min.z - z, 0, z - b.max.z); return Math.hypot(dx, dz); };

  // ---------------------------------------------------------------- the environment context (per scenery build)
  const DG = 10, DHALF = 2400, DN = DHALF * 2 / DG + 1;         // track distance field
  const OG = 4, OHALF = 2000, ON = OHALF * 2 / OG;               // occupancy grid
  const MAP_HALF = 2300, MAP_PX = 2048;                          // field-map texture (2.25 m / texel)
  const FC = 240;                                                // field (Voronoi) cell size
  const OCC = { ROAD: 1, BUILT: 2, PARK: 4, WOOD: 8, WATER: 16, TRACK: 32, KEEP: 64, HEDGE: 128 };
  Env.OCC = OCC; Env.MAP_HALF = MAP_HALF; Env.CARD_HALF = 1800; // billboard trees inside CARD_HALF, tree-line strips beyond

  class Ctx {
    constructor(scenery) {
      this.sc = scenery; this.t = scenery.track; this.data = (EI.ENVDATA && EI.ENVDATA[this.t.data.id]) || {};
      this.stats = {}; this.timings = {};
      this.VENUE_F = 185;
      this.buildDistanceField();
      this.buildFields();
      this.occ = new Uint8Array(ON * ON);
      // street circuit: the sea (coastline closed far out to the east and south) and the low ground round the harbour
      if (this.data.kind === 'street') {
        const coast = (this.data.coast || [])[0];
        if (coast && coast.length > 10) { const a = coast[0], b = coast[coast.length - 1]; const far = 4000; this.seaPoly = coast.concat([[b[0] + far, b[1]], [b[0] + far, a[1] + far], [a[0], a[1] + far]]); }
        this.seaY = this.t.data.seaLevel != null ? this.t.data.seaLevel : -3.6;
        this.lowland = this.data.lowland || [];
        if (this.data.dem) this.initStreetGround();
      }
      if (this.data.kind === 'desert') this.initDesert();
      if (this.data.kind === 'park' && this.data.forest && this.initForest) this.initForest();   // env_forest.js (Spa: hill ground in the woods)
      else if (this.data.kind === 'park' && this.initPark) this.initPark();   // env_park.js (Royal Park of Monza)
    }
    // ------------------------------------------------ desert circuit (Yas Marina): flat ground round the circuit, low dunes far out, the sea and the
    // marina basin from the map's water polygons as a raster mask (isSea), with a seabed a few metres below the quays
    initDesert() {
      const SH = 4400, SP = 2048; const [c, ctx] = Env.canvas(SP, SP); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SP, SP);
      ctx.setTransform(SP / (2 * SH), 0, 0, SP / (2 * SH), SP / 2, SP / 2); ctx.fillStyle = '#fff';
      for (const w of this.t.data.scenery.water || []) { if (w.length < 3) continue; ctx.beginPath(); w.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill(); }
      const d = ctx.getImageData(0, 0, SP, SP).data; this.seaMask = new Uint8Array(SP * SP); for (let i = 0; i < SP * SP; i++) this.seaMask[i] = d[i * 4] > 127 ? 1 : 0;
      this.seaMaskH = SH; this.seaMaskN = SP; this.seaY = -2.6;
    }
    // ------------------------------------------------ street circuit ground: real terrain heights, a raster sea mask, the built-up cover
    initStreetGround() {
      const D = this.data.dem;
      this.demZ0 = this.data.demZ0 != null ? this.data.demZ0 : 3.6;     // game y = metres above the sea - demZ0
      this.plateaus = this.data.plateaus || [];
      // sea mask: the coastline polygon rasterised once (6.8 m / px over +-7 km) instead of a point-in-polygon test per sample
      const SH = 7000, SP = 2048; const [c, ctx] = Env.canvas(SP, SP); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SP, SP);
      ctx.setTransform(SP / (2 * SH), 0, 0, SP / (2 * SH), SP / 2, SP / 2); ctx.fillStyle = '#fff';
      const fillP = (poly) => { ctx.beginPath(); poly.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill(); };
      if (this.seaPoly) fillP(this.seaPoly);
      // the harbour basins drawn at sea level (the street water's polygons) count as sea too, so the ground sits below them;
      // ponds and fountains up in the town are left alone
      const decD = (g) => ({ h: g.h, step: g.step, n: g.n, a: Env.decodeI16(g.d) }); this.dem = { near: decD(D.near), far: decD(D.far) };
      for (const w of this.t.data.scenery.water || []) { if (w.length < 3 || Math.abs(U.polyArea(w)) <= 200) continue; let cx = 0, cz = 0; for (const q of w) { cx += q[0]; cz += q[1]; } cx /= w.length; cz /= w.length; if (this.demAt(cx, cz) < 15) fillP(w); }
      const sd = ctx.getImageData(0, 0, SP, SP).data; this.seaMask = new Uint8Array(SP * SP); for (let i = 0; i < SP * SP; i++) this.seaMask[i] = sd[i * 4] > 127 ? 1 : 0;
      this.seaMaskH = SH; this.seaMaskN = SP;
      // a fine copy over the harbour and the circuit (1.2 m / px) so the quays meet the water where the water is drawn
      const FH = 1250; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SP, SP); ctx.setTransform(SP / (2 * FH), 0, 0, SP / (2 * FH), SP / 2, SP / 2); ctx.fillStyle = '#fff';
      if (this.seaPoly) fillP(this.seaPoly); for (const w of this.t.data.scenery.water || []) { if (w.length < 3 || Math.abs(U.polyArea(w)) <= 200) continue; let cx = 0, cz = 0; for (const q of w) { cx += q[0]; cz += q[1]; } cx /= w.length; cz /= w.length; if (this.demAt(cx, cz) < 15) fillP(w); }
      const fd = ctx.getImageData(0, 0, SP, SP).data; this.seaFine = new Uint8Array(SP * SP); for (let i = 0; i < SP * SP; i++) this.seaFine[i] = fd[i * 4] > 127 ? 1 : 0; this.seaFineH = FH;
      // every footprint (near set + the far city) and the built-up cover (fraction of ground under roofs, ~40 m blur)
      this.cityFar = Env.decodeCity(this.data.city);
      const CH = 2800, CN = 700; const [cc, cctx] = Env.canvas(CN, CN); cctx.fillStyle = '#000'; cctx.fillRect(0, 0, CN, CN); cctx.setTransform(CN / (2 * CH), 0, 0, CN / (2 * CH), CN / 2, CN / 2); cctx.fillStyle = '#fff';
      const fill = (p) => { cctx.beginPath(); p.forEach((q, i) => i ? cctx.lineTo(q[0], q[1]) : cctx.moveTo(q[0], q[1])); cctx.closePath(); cctx.fill(); };
      for (const b of this.t.data.scenery.buildings) fill(b.p); for (const b of this.cityFar) fill(b.p);
      const [bc, bctx] = Env.canvas(CN / 10, CN / 10); bctx.imageSmoothingEnabled = true; bctx.filter = 'blur(1px)'; bctx.drawImage(cc, 0, 0, CN / 10, CN / 10);
      const bd = bctx.getImageData(0, 0, CN / 10, CN / 10).data; this.cover = new Float32Array((CN / 10) * (CN / 10)); for (let i = 0; i < this.cover.length; i++) this.cover[i] = bd[i * 4] / 255;
      this.coverH = CH; this.coverN = CN / 10;
      // per distance-field cell: the nearest stretch's level and, for the second stretch, its level and distance beyond its barrier;
      // the ground near the circuit is capped against both so the coarse terrain triangles never reach above a road surface
      const t = this.t, n = this.dC.length; this.dY1 = new Float32Array(n); this.dY2 = new Float32Array(n); this.dF2 = new Float32Array(n);
      for (let k = 0; k < n; k++) { this.dY1[k] = t.y[this.dIdx[k]]; const i2 = this.dIdx2[k]; this.dY2[k] = t.y[i2]; this.dF2[k] = this.dC2[k] >= 1e4 ? 1e4 : this.dC2[k] - Math.max(t.wallL[i2], t.wallR[i2]); }
    }
    // highest the ground may stand at (x, z): a terrain triangle that covers a road point has its corners within one cell diagonal
    // (17 m on the 12 m grid), so every vertex that close to a stretch's barrier stays under that stretch's road surface
    groundCap(x, z) {
      // conservative: the lowest road level among the four distance-field cells round the point (no blending between stretches),
      // flat for the first 12 m beyond a stretch's barrier, then rising 1.5 m per metre: where a lower stretch runs beside a higher one
      // (Portier below the Grand Hotel hairpin) the ground banks up between them instead of leaving the upper road over a pit
      let cap = Infinity; const R = 18; const fx = (x + DHALF) / DG, fz = (z + DHALF) / DG; if (fx < 0 || fz < 0 || fx >= DN - 1 || fz >= DN - 1) return cap;
      const k0 = (fz | 0) * DN + (fx | 0); const up = (d) => Math.max(0, d - 12) * 1.5;
      for (const k of [k0, k0 + 1, k0 + DN, k0 + DN + 1]) { if (this.dF[k] < R + 8) cap = Math.min(cap, this.dY1[k] + up(this.dF[k])); if (this.dF2[k] < R + 8) cap = Math.min(cap, this.dY2[k] + up(this.dF2[k])); }
      return cap - 0.35;
    }
    isSea(x, z) {
      if (!this.seaMask) return !!(this.seaPoly && U.pointInPoly(x, z, this.seaPoly));
      const N = this.seaMaskN;
      if (this.seaFine && Math.abs(x) < this.seaFineH && Math.abs(z) < this.seaFineH) { const F = this.seaFineH; return this.seaFine[Math.floor((z + F) / (2 * F) * N) * N + Math.floor((x + F) / (2 * F) * N)] === 1; }
      const H = this.seaMaskH; const i = Math.floor((x + H) / (2 * H) * N), j = Math.floor((z + H) / (2 * H) * N);
      if (i < 0 || j < 0 || i >= N || j >= N) return !!(this.seaPoly && U.pointInPoly(x, z, this.seaPoly));
      return this.seaMask[j * N + i] === 1;
    }
    // built-up fraction 0..1 (bilinear on the 80 m cover grid)
    coverAt(x, z) {
      if (!this.cover) return 0; const H = this.coverH, N = this.coverN; const fx = (x + H) / (2 * H) * N - 0.5, fz = (z + H) / (2 * H) * N - 0.5;
      if (fx < 0 || fz < 0 || fx >= N - 1 || fz >= N - 1) return 0; const ix = fx | 0, iz = fz | 0, u = fx - ix, v = fz - iz, a = this.cover;
      return (a[iz * N + ix] * (1 - u) + a[iz * N + ix + 1] * u) * (1 - v) + (a[(iz + 1) * N + ix] * (1 - u) + a[(iz + 1) * N + ix + 1] * u) * v;
    }
    // terrain elevation in metres above the sea (bilinear: the 24 m grid near, the 96 m grid out to ~9.6 km)
    demAt(x, z) {
      for (const g of [this.dem.near, this.dem.far]) {
        const fx = (x + g.h) / g.step, fz = (z + g.h) / g.step; if (fx < 0 || fz < 0 || fx >= g.n - 1 || fz >= g.n - 1) continue;
        const ix = fx | 0, iz = fz | 0, u = fx - ix, v = fz - iz, a = g.a, n = g.n; const k = iz * n + ix;
        const e = (a[k] * (1 - u) + a[k + 1] * u) * (1 - v) + (a[k + n] * (1 - u) + a[k + n + 1] * u) * v;
        if (g === this.dem.far || fx > 2 && fz > 2 && fx < g.n - 3 && fz < g.n - 3) return e;
        // blend into the far grid over the last cells of the near one
        const gf = this.dem.far; const b = Math.min(fx, fz, g.n - 1 - fx, g.n - 1 - fz) / 3; const ff = (x + gf.h) / gf.step, fg = (z + gf.h) / gf.step; const jx = ff | 0, jz = fg | 0, uu = ff - jx, vv = fg - jz, af = gf.a, nf = gf.n, kf = jz * nf + jx;
        const e2 = (af[kf] * (1 - uu) + af[kf + 1] * uu) * (1 - vv) + (af[kf + nf] * (1 - uu) + af[kf + nf + 1] * uu) * vv; return e2 + (e - e2) * b;
      }
      return 0;
    }
    // natural ground (game frame, no circuit influence): the terrain model, the Rocher's plateau, a little rocky relief on the mountains
    groundAbs(x, z) {
      let g = this.demAt(x, z) - this.demZ0;
      for (const p of this.plateaus) {
        const b = p.bb || (p.bb = U.polyBounds(p.p)); const e = p.edge || 30; if (x < b.x0 - e || x > b.x1 + e || z < b.z0 - e || z > b.z1 + e) continue;
        const ins = U.pointInPoly(x, z, p.p); const d = this.distToPoly(x, z, p.p) * (ins ? 1 : -1);
        const k = U.smoothstep(-e, e * 0.35, d); if (k > 0) g = Math.max(g, g + (p.h + (U.noise2(x / 70, z / 70) - 0.5) * 3 - g) * k);
      }
      const m = U.smoothstep(120, 420, g); if (m > 0) g += (U.fbm(x / 110 + 3.1, z / 110 + 8.7, 3) - 0.5) * 22 * m;
      return g;
    }
    // ground slope (rise per metre) of the natural ground
    slopeAt(x, z) { const e = 12; return Math.hypot(this.groundAbs(x + e, z) - this.groundAbs(x - e, z), this.groundAbs(x, z + e) - this.groundAbs(x, z - e)) / (2 * e); }
    inLowland(x, z) { for (const p of this.lowland) if (U.pointInPoly(x, z, p)) return true; return false; }
    // rendered barrier distance on a side (the track ribbon clamps offsets on the inside of tight corners)
    wallCap(i, side, off) {
      const t = this.t; let d = (side < 0 ? t.wallL[i] : t.wallR[i]) + (off || 0);
      const kf = t.kFold ? t.kFold[i] : 0; const cap = Math.max(2, 0.9 / (Math.abs(kf) + 1e-6));
      if ((kf > 0 && side > 0) || (kf < 0 && side < 0)) d = Math.min(d, cap);
      return d;
    }
    // ------------------------------------------------ distance field: distance to the centreline, beyond the (max) barrier, side, nearest sample
    buildDistanceField() {
      const t = this.t, n = DN * DN; this.dC = new Float32Array(n); this.dF = new Float32Array(n); this.dFs = new Float32Array(n); this.dSide = new Int8Array(n); this.dIdx = new Uint16Array(n);
      const pr = {};
      for (let gz = 0; gz < DN; gz++) for (let gx = 0; gx < DN; gx++) {
        const x = -DHALF + gx * DG, z = -DHALF + gz * DG; t.project(x, z, null, pr); const k = gz * DN + gx;
        const side = pr.lat < 0 ? -1 : 1; this.dC[k] = pr.dist; this.dF[k] = pr.dist - Math.max(t.wallL[pr.i], t.wallR[pr.i]); this.dFs[k] = pr.dist - this.wallCap(pr.i, side); this.dSide[k] = side; this.dIdx[k] = pr.i;
      }
      // centreline polygon for robust inside tests (coarse); which lateral sign is the infield depends on the lap direction
      this.loop = []; let cx = 0, cz = 0; for (let i = 0; i < t.n; i += 3) { this.loop.push([t.x[i], t.z[i]]); cx += t.x[i]; cz += t.z[i]; }
      cx /= this.loop.length; cz /= this.loop.length; t.project(cx, cz, null, pr); this.insideSign = pr.lat < 0 ? -1 : 1;
      // street circuits: where two stretches of the lap run close together at different heights (Beau Rivage above the harbour
      // front), the ground between them follows both: the second-nearest stretch (> 120 m of lap away) and its distance
      if (this.data.kind === 'street') {
        this.dC2 = new Float32Array(n).fill(1e4); this.dIdx2 = new Uint16Array(n); const L = this.loop, m = L.length, step = 3;
        for (let gz = 0; gz < DN; gz++) for (let gx = 0; gx < DN; gx++) {
          const k = gz * DN + gx; if (this.dC[k] > 110) continue; const x = -DHALF + gx * DG, z = -DHALF + gz * DG; const i0 = this.dIdx[k]; let best = 1e4, bi = 0;
          for (let j = 0; j < m; j++) { const idx = j * step; let di = Math.abs(idx - i0); if (di > t.n / 2) di = t.n - di; if (di < 60) continue; const dx = L[j][0] - x, dz = L[j][1] - z; const d = dx * dx + dz * dz; if (d < best) { best = d; bi = idx; } }
          this.dC2[k] = Math.sqrt(best); this.dIdx2[k] = bi;
        }
      }
    }
    _bil(arr, x, z, far) {
      const fx = (x + DHALF) / DG, fz = (z + DHALF) / DG; if (fx < 0 || fz < 0 || fx >= DN - 1 || fz >= DN - 1) return far;
      const ix = fx | 0, iz = fz | 0, u = fx - ix, v = fz - iz, k = iz * DN + ix;
      return (arr[k] * (1 - u) + arr[k + 1] * u) * (1 - v) + (arr[k + DN] * (1 - u) + arr[k + DN + 1] * u) * v;
    }
    // track height for the ground at (x, z): the nearest lap sample, blended with the second-nearest stretch when both are close
    tyAt(x, z) {
      const t = this.t; const k = this._near(x, z); const y1 = t.y[this.dIdx[k]]; if (!this.dC2) return y1;
      const d1 = Math.max(2, this.dC[k]), d2 = this.dC2[k]; if (d2 > 90) return y1; const y2 = t.y[this.dIdx2[k]];
      const w1 = 1 / (d1 * d1 * d1), w2 = (1 - U.smoothstep(60, 90, d2)) / (d2 * d2 * d2); return (y1 * w1 + y2 * w2) / (w1 + w2);
    }
    fAt(x, z) { return this._bil(this.dF, x, z, 5000); }        // metres beyond the outermost barrier (conservative)
    fsAt(x, z) { return this._bil(this.dFs, x, z, 5000); }      // metres beyond the rendered barrier on this side
    dcAt(x, z) { return this._bil(this.dC, x, z, 5000); }
    _near(x, z) { const gx = U.clamp(Math.round((x + DHALF) / DG), 0, DN - 1), gz = U.clamp(Math.round((z + DHALF) / DG), 0, DN - 1); return gz * DN + gx; }
    idxAt(x, z) { return this.dIdx[this._near(x, z)]; }
    // inside the circuit loop: the nearest-point side test is exact for a simple closed curve
    inside(x, z) { const k = this._near(x, z); return this.dSide[k] === (this.insideSign || -1) && this.dC[k] < 1500; }
    isVenue(x, z) { const f = this.fAt(x, z); return f < this.VENUE_F || (f < 900 && this.inside(x, z)); }
    // precise test for "outside the barriers by margin" (spec: project().dist > max(wallL, wallR) + margin)
    clearOfTrack(x, z, margin) { const t = this.t; const p = t.project(x, z, null, this._pr || (this._pr = {})); return p.dist > Math.max(t.wallL[p.i], t.wallR[p.i]) + margin; }
    // visible ground: the verge ribbons near the track (track level), terrain beyond
    ground(x, z) { return this.sc.height(x, z); }

    // ------------------------------------------------ occupancy grid
    oi(x, z) { const gx = Math.floor((x + OHALF) / OG), gz = Math.floor((z + OHALF) / OG); if (gx < 0 || gz < 0 || gx >= ON || gz >= ON) return -1; return gz * ON + gx; }
    occAt(x, z) { const k = this.oi(x, z); return k < 0 ? 0 : this.occ[k]; }
    mark(x, z, bit) { const k = this.oi(x, z); if (k >= 0) this.occ[k] |= bit; }
    // every cell whose centre is inside the polygon (even-odd, scanline spans per row of the grid), plus a band `pad` metres
    // wide along its outline. Linear in the polygon size: the sea round Yas Island is a ~950-point ring kilometres across.
    markPoly(poly, bit, pad) {
      const b = U.polyBounds(poly); const n = poly.length; const xs = [];
      const gz0 = Math.max(0, Math.floor((b.z0 + OHALF) / OG)), gz1 = Math.min(ON - 1, Math.floor((b.z1 + OHALF) / OG));
      for (let gz = gz0; gz <= gz1; gz++) {
        const z = -OHALF + (gz + 0.5) * OG; xs.length = 0;
        for (let i = 0, j = n - 1; i < n; j = i++) { const zi = poly[i][1], zj = poly[j][1]; if ((zi > z) !== (zj > z)) xs.push(poly[i][0] + (z - zi) * (poly[j][0] - poly[i][0]) / (zj - zi)); }
        if (xs.length < 2) continue; xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const g0 = Math.max(0, Math.ceil((xs[k] + OHALF) / OG - 0.5)), g1 = Math.min(ON - 1, Math.floor((xs[k + 1] + OHALF) / OG - 0.5));
          for (let gx = g0; gx <= g1; gx++) this.occ[gz * ON + gx] |= bit;
        }
      }
      if (pad) this.markLine(poly.concat([poly[0]]), pad, bit);
    }
    distToPoly(x, z, poly) { let best = Infinity; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { best = Math.min(best, segDist(x, z, poly[j][0], poly[j][1], poly[i][0], poly[i][1])); } return best; }
    // oriented rectangle: centre, unit axis (ax,az), half-length along axis hl, half-depth hd
    rectPoly(cx, cz, ax, az, hl, hd) { const bx = -az, bz = ax; return [[cx - ax * hl - bx * hd, cz - az * hl - bz * hd], [cx + ax * hl - bx * hd, cz + az * hl - bz * hd], [cx + ax * hl + bx * hd, cz + az * hl + bz * hd], [cx - ax * hl + bx * hd, cz - az * hl + bz * hd]]; }
    markRect(cx, cz, ax, az, hl, hd, bit) { const p = this.rectPoly(cx, cz, ax, az, hl, hd); this.markPoly(p, bit); return p; }
    // fraction of a rectangle's sample points that are free of `mask` (and clear of the track by `margin`)
    rectFree(cx, cz, ax, az, hl, hd, mask, margin) {
      const bx = -az, bz = ax; let ok = 0, tot = 0; const st = 4;
      for (let a = -hl; a <= hl + 0.01; a += Math.max(st, hl / 12)) for (let b = -hd; b <= hd + 0.01; b += Math.max(st, hd / 8)) {
        const x = cx + ax * a + bx * b, z = cz + az * a + bz * b; tot++;
        if (this.occAt(x, z) & mask) continue; if (margin != null && this.fAt(x, z) < margin) continue; ok++;
      }
      return tot ? ok / tot : 0;
    }
    markLine(pts, halfW, bit) {
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const nx = -(b[1] - a[1]) / (L || 1), nz = (b[0] - a[0]) / (L || 1);
        for (let s = 0; s <= L; s += OG * 0.5) for (let w = -halfW; w <= halfW + 0.01; w += OG * 0.5) { const u = s / (L || 1); this.mark(a[0] + (b[0] - a[0]) * u + nx * w, a[1] + (b[1] - a[1]) * u + nz * w, bit); }
      }
    }

    // ------------------------------------------------ field patchwork (jittered Voronoi), types and hedge boundaries
    buildFields() {
      const R = Math.ceil(6800 / FC) + 1; this.FR = R; const W = R * 2 + 1; this.FW = W;
      this.seedX = new Float32Array(W * W); this.seedZ = new Float32Array(W * W); this.fType = new Uint8Array(W * W); this.fAng = new Float32Array(W * W); this.fTone = new Float32Array(W * W);
      // field types: 0 pasture, 1 pasture dark, 2 wheat (golden), 3 barley (pale gold), 4 green crop, 5 ploughed, 6 stubble, 7 rapeseed, 8 copse (wood)
      const pick = [0, 0, 0, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 5, 6, 6, 7, 0, 1, 2];
      for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) {
        const k = (cz + R) * W + (cx + R); const h1 = hash2(cx, cz, 1), h2 = hash2(cx, cz, 2), h3 = hash2(cx, cz, 3);
        this.seedX[k] = (cx + 0.05 + 0.9 * h1) * FC; this.seedZ[k] = (cz + 0.05 + 0.9 * h2) * FC;
        const big = hash2(cx >> 1, cz >> 1, 7) < 0.45; const ht = big ? hash2(cx >> 1, cz >> 1, 3) : h3;
        let ty = pick[Math.floor(ht * pick.length) % pick.length];
        const r = Math.hypot(this.seedX[k], this.seedZ[k] - 60); if (r > 1300 && hash2(cx, cz, 9) < 0.09) ty = 8;
        this.fType[k] = ty; this.fAng[k] = hash2(cx, cz, 4) * Math.PI; this.fTone[k] = hash2(cx, cz, 5);
      }
    }
      // is there a hedge on the field boundary a-b? (none between two cells of the same crop in a merged block)
    hedgeOn(a, b, cell) {
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; this.cellAt(mx, mz, cell); if (cell.k2 < 0) return true;
      return !(this.fType[cell.k] === this.fType[cell.k2] && hash2(Math.round(mx), Math.round(mz), 13) < 0.85);
    }
  // nearest two field seeds: returns cell key, and distance to the boundary (bisector)
    cellAt(x, z, out) {
      const R = this.FR, W = this.FW; const cx0 = Math.floor(x / FC), cz0 = Math.floor(z / FC); let d1 = Infinity, d2 = Infinity, k1 = -1, k2 = -1;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const cx = cx0 + dx, cz = cz0 + dz; if (cx < -R || cx > R || cz < -R || cz > R) continue; const k = (cz + R) * W + (cx + R);
        const d = (this.seedX[k] - x) ** 2 + (this.seedZ[k] - z) ** 2;
        if (d < d1) { d2 = d1; k2 = k1; d1 = d; k1 = k; } else if (d < d2) { d2 = d; k2 = k; }
      }
      out = out || {}; out.k = k1; out.k2 = k2;
      if (k2 >= 0) { const sx = this.seedX[k2] - this.seedX[k1], sz = this.seedZ[k2] - this.seedZ[k1]; out.edge = (d2 - d1) / (2 * Math.hypot(sx, sz)); } else out.edge = 999;
      return out;
    }
  }
  function segDist(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az; const l2 = dx * dx + dz * dz || 1; const u = U.clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1); return Math.hypot(px - ax - dx * u, pz - az - dz * u); }
  function hash2(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  Env.hash2 = hash2; Env.segDist = segDist;
  Env.Ctx = Ctx;

  // ---------------------------------------------------------------- marching squares contours of a grid field
  Env.contours = function (ctx, arr, level, mask) {
    const N = DN; const segs = []; const pt = (k, x, z) => [x, z];
    const val = (gx, gz) => arr[gz * N + gx];
    const edgePt = (ax, az, va, bx, bz, vb) => { const u = (level - va) / (vb - va); return [-DHALF + (ax + (bx - ax) * u) * DG, -DHALF + (az + (bz - az) * u) * DG]; };
    const map = new Map();
    const addSeg = (ka, pa, kb, pb) => { const s = { a: ka, b: kb, pa, pb, used: false }; segs.push(s); for (const kk of [ka, kb]) { let l = map.get(kk); if (!l) map.set(kk, l = []); l.push(s); } };
    for (let gz = 0; gz < N - 1; gz++) for (let gx = 0; gx < N - 1; gx++) {
      if (mask && !mask(gx, gz)) continue;
      const v0 = val(gx, gz), v1 = val(gx + 1, gz), v2 = val(gx + 1, gz + 1), v3 = val(gx, gz + 1);
      const c = (v0 > level ? 1 : 0) | (v1 > level ? 2 : 0) | (v2 > level ? 4 : 0) | (v3 > level ? 8 : 0); if (c === 0 || c === 15) continue;
      // edges: 0 top (0-1), 1 right (1-2), 2 bottom (3-2), 3 left (0-3)
      const E = [
        () => [(gz * N + gx) * 2, edgePt(gx, gz, v0, gx + 1, gz, v1)], () => [(gz * N + gx + 1) * 2 + 1, edgePt(gx + 1, gz, v1, gx + 1, gz + 1, v2)],
        () => [((gz + 1) * N + gx) * 2, edgePt(gx, gz + 1, v3, gx + 1, gz + 1, v2)], () => [(gz * N + gx) * 2 + 1, edgePt(gx, gz, v0, gx, gz + 1, v3)]];
      const T = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[0, 2]], 10: [[0, 1], [2, 3]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[0, 3]] }[c];
      for (const [ea, eb] of T) { const A = E[ea](), B = E[eb](); addSeg(A[0], A[1], B[0], B[1]); }
    }
    const lines = [];
    for (const s of segs) {
      if (s.used) continue; s.used = true; const line = [s.pa, s.pb]; let head = s.b, tail = s.a; let closed = false;
      const grow = (key, front) => { for (;;) { const l = map.get(key); let nx = null; if (l) for (const q of l) if (!q.used) { nx = q; break; } if (!nx) return; nx.used = true; const fwd = nx.a === key; const p = fwd ? nx.pb : nx.pa; key = fwd ? nx.b : nx.a; if (front) line.push(p); else line.unshift(p); if (key === (front ? tail : head)) { closed = true; return; } if (front) head = key; else tail = key; } };
      grow(head, true); if (!closed) grow(tail, false);
      line.closed = closed; lines.push(line);
    }
    return lines;
  };
  Env.polyLength = function (pts, closed) { let L = 0; for (let i = 0; i + 1 < pts.length; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); if (closed) L += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]); return L; };
  // Chaikin smoothing + uniform resampling
  Env.smoothLine = function (pts, closed, iters, step) {
    let p = pts.slice();
    for (let it = 0; it < (iters || 0); it++) {
      const q = []; const n = p.length; const lim = closed ? n : n - 1; if (!closed) q.push(p[0]);
      for (let i = 0; i < lim; i++) { const a = p[i], b = p[(i + 1) % n]; q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
      if (!closed) q.push(p[n - 1]); p = q;
    }
    if (!step) return p;
    const out = []; const n = p.length; const segs = closed ? n : n - 1; let carry = 0; out.push(p[0]);
    for (let i = 0; i < segs; i++) {
      const a = p[i], b = p[(i + 1) % n]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); let s = step - carry;
      while (s <= L) { const u = s / L; out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]); s += step; }
      carry = L - (s - step);
    }
    if (closed && out.length > 2) { const f = out[0], l = out[out.length - 1]; if (Math.hypot(f[0] - l[0], f[1] - l[1]) < step * 0.5) out.pop(); }
    else if (!closed) { const l = p[n - 1]; const o = out[out.length - 1]; if (Math.hypot(o[0] - l[0], o[1] - l[1]) > step * 0.3) out.push(l); }
    out.closed = closed; return out;
  };

  // ---------------------------------------------------------------- terrain: non-uniform grid out to the horizon, field-map + detail shading
  // grid coordinate for index k (|k| <= K): 20 m cells inside +-1800, then geometrically growing cells out to ~6.6 km
  const KIN0 = 75, KTOT0 = 102, GS0 = 24;
  function gridPos(k, kin, gs) { kin = kin || KIN0; gs = gs || GS0; const a = Math.abs(k); if (a <= kin) return k * gs; let p = kin * gs, st = gs; for (let j = kin; j < a; j++) { st *= 1.125; p += st; } return Math.sign(k) * p; }
  Env.gridPos = gridPos;
  Ctx.prototype.heightRaw = function (x, z) {
    if (this.data.kind === 'street') return this.hillRaw(x, z);
    const r = Math.hypot(x + 40, z - 60);
    const amp = 10 + 26 * U.smoothstep(1400, 4200, r);
    return (U.fbm(x / 900 + 10, z / 900 + 10, 4) - 0.5) * amp * 2 + (U.fbm(x / 260, z / 260, 3) - 0.5) * 5 + 34 * U.smoothstep(3800, 6200, r) * (0.6 + 0.4 * U.fbm(x / 1500 + 3, z / 1500 + 7, 2));
  };
  // street circuit (Monaco): the ground climbs away from the harbour on every side (the Rocher, the hill behind the Casino),
  // stays level towards the water. Relative to the nearest track sample so the slopes stay consistent with the course profile.
  Ctx.prototype.hillRaw = function (x, z) {
    const t = this.t; const hc = this.data.hill || { slope: 0.32, max: 110 }; const f = this.fAt(x, z); const i = this.idxAt(x, z);
    // the sea sits below the quays whatever the nearest track sample says
    if (this.seaPoly && U.pointInPoly(x, z, this.seaPoly)) return this.seaY - 1.5 - t.y[i];
    // inside the lap (the harbour and its quays) and the listed low ground: level with the circuit
    if (this.inside(x, z)) return 0; for (const p of this.lowland) if (U.pointInPoly(x, z, p)) return 0;
    const base = U.clamp((f - 24) * hc.slope, 0, hc.max);
    return base + (U.fbm(x / 240 + 5, z / 240 + 9, 3) - 0.5) * 12 * U.smoothstep(40, 260, f);
  };
  // terrain height: flat at track level near the circuit (and a touch below the verge ribbons), rolling countryside beyond
  Ctx.prototype.terrainHeight = function (x, z) {
    if (this.forestOn) return this.forestHeight(x, z);
    if (this.dem) return this.streetHeight(x, z);
    if (this.parkOn) return this.parkHeight(x, z);
    if (this.data.kind === 'desert') return this.desertHeight(x, z);
    const t = this.t; const f = this.fAt(x, z), fs = this.fsAt(x, z); const ty = this.tyAt(x, z);
    const w = this.data.kind === 'street' ? U.smoothstep(55, 330, f) : U.smoothstep(25, 220, f);
    return ty + this.heightRaw(x, z) * w - 0.14 * (1 - U.smoothstep(36, 52, fs));
  };

  // desert circuit: track level beside the circuit, easing to sea level and low wind-shaped dunes further out; the seabed under the
  // sea and the marina (their water sits at ~seaY + 0.25, the quays and the track a couple of metres above)
  Ctx.prototype.desertHeight = function (x, z) {
    const f = this.fAt(x, z), fs = this.fsAt(x, z); const ty = this.tyAt(x, z);
    if (this.isSea(x, z)) return this.seaY - 2.4;
    const far = U.smoothstep(60, 420, f);
    const dunes = (U.fbm(x / 330 + 4.1, z / 330 + 8.3, 3) - 0.5) * 8 * U.smoothstep(500, 2400, f) + (U.fbm(x / 85 + 1.3, z / 85 + 2.9, 2) - 0.5) * 1.4 * U.smoothstep(150, 700, f);
    return ty * (1 - far) + dunes - 0.14 * (1 - U.smoothstep(36, 52, fs));
  };
  // street circuit with a terrain model: the harbour and the quays inside the lap (and the listed low ground) stay at circuit level;
  // outside it the ground blends from the pavement (circuit level) into the real slopes over the first ~75 m; the sea sits below
  // the coast. Near the track the ground never drops below the verge bands (it falls away beyond them at most 1:1).
  Ctx.prototype.streetHeight = function (x, z) {
    if (this.isSea(x, z)) return this.seaY - 40;
    const f = this.fAt(x, z), fs = this.fsAt(x, z); const ty = this.tyAt(x, z); let h;
    if (this.inside(x, z) || this.inLowland(x, z)) h = ty;
    else { const G = Math.max(this.groundAbs(x, z), this.seaY + 0.7); h = ty + (G - ty) * U.smoothstep(6, 75, f); }
    h = Math.max(h, ty - 0.12 - Math.max(0, f - 42));
    h -= 0.14 * (1 - U.smoothstep(36, 52, fs));
    return Math.min(h, this.groundCap(x, z));
  };
  Ctx.prototype.buildTerrain = function () {
    // street circuits with a terrain model use a 12 m grid inside +-1.8 km (roads, quays and slopes meet more tightly), 24 m otherwise
    const fine = !!this.dem; const KIN = fine ? (this.terrainKin || 150) : KIN0, GS = fine ? (this.terrainGS || 12) : GS0, KTOT = fine ? KIN + (this.terrainRing || 33) : KTOT0;
    const sc = this.sc; const K = KTOT, W = K * 2 + 1;
    const pos = new Float32Array(W * W * 3), col = new Float32Array(W * W * 3), uv = new Float32Array(W * W * 2);
    const heights = new Float32Array((KIN * 2 + 1) * (KIN * 2 + 1)); const HW = KIN * 2 + 1;
    const tmp = new THREE.Color(), cell = {}; const inner = [Env.SPAL.city[0], Env.SPAL.city[1], Env.SPAL.city[2]];
    // exact road cap for the vertices near the circuit: under every road sample within its barrier + one cell diagonal (nearly flat
    // for 14 m past the barrier, so further samples down a slope don't drag the ground below the road beside them, then banking up
    // 1.5:1 so a higher stretch beside a lower one keeps its ground; a 17 m triangle never lifts above the road inside the barrier)
    let roadCap = null;
    if (fine) {
      const t = this.t, HC = 32, hashT = new Map(); for (let j = 0; j < t.n; j++) { const key = Math.floor(t.x[j] / HC) + ',' + Math.floor(t.z[j] / HC); let l = hashT.get(key); if (!l) hashT.set(key, l = []); l.push(j); }
      roadCap = (x, z) => { let cap = Infinity; const gx = Math.floor(x / HC), gz = Math.floor(z / HC); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = hashT.get((gx + a) + ',' + (gz + b)); if (!l) continue; for (const j of l) { const wj = Math.max(t.wallL[j], t.wallR[j]), r = wj + GS * 1.5; const dx = x - t.x[j], dz = z - t.z[j]; const d2 = dx * dx + dz * dz; if (d2 < r * r) { const e = Math.max(0, Math.sqrt(d2) - wj); const c = t.y[j] + (e < 14 ? e * 0.12 : 1.68 + (e - 14) * 1.5); if (c < cap) cap = c; } } } return cap - 0.35; };
    }
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      const x = gridPos(i - K, KIN, GS), z = gridPos(j - K, KIN, GS); const k = j * W + i;
      let h = this.terrainHeight(x, z); if (roadCap && Math.abs(x) < 2400 && Math.abs(z) < 2400 && this.fAt(x, z) < 40) h = Math.min(h, roadCap(x, z));
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      if (Math.abs(i - K) <= KIN && Math.abs(j - K) <= KIN) heights[(j - K + KIN) * HW + (i - K + KIN)] = h;
      // (well inside the field map the vertex colour is never seen: skip the street colour model there)
      this._coarse = fine; const c = fine && Math.max(Math.abs(x), Math.abs(z)) < 2040 ? inner : this.fieldRGB(x, z, cell); this._coarse = false; tmp.setRGB(c[0] / 255, c[1] / 255, c[2] / 255).convertSRGBToLinear();
      col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
      uv[k * 2] = (x + MAP_HALF) / (MAP_HALF * 2); uv[k * 2 + 1] = 1 - (z + MAP_HALF) / (MAP_HALF * 2);
    }
    const idx = []; for (let j = 0; j < W - 1; j++) for (let i = 0; i < W - 1; i++) { const a = j * W + i, b = a + 1, c = a + W, d = c + 1; idx.push(a, c, b, b, c, d); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    sc.heights = heights; sc.hHalf = KIN * GS; sc.hN = HW; sc.hCell = GS;
    const mat = this.groundMaterial(false); mat.polygonOffset = true; mat.polygonOffsetFactor = 4; mat.polygonOffsetUnits = 8;
    // cut into tiles (shared vertex buffers, an index list and a real bounding box each) so the frustum culls what is behind the
    // camera: the fine grid in 3 x 3 blocks, the coarse outer ring in its four sides and four corners
    const cuts = [0, K - KIN, K - KIN + Math.round(2 * KIN / 3), K + KIN - Math.round(2 * KIN / 3), K + KIN, W - 1]; const tiles = []; let tris = 0;
    const blocks = []; const c = cuts;
    if (this.terrainQuads) {
      // forest ground (Spa): the fine grid in 2 x 2 quadrants round the lap's centre and the coarse ring in 4 strips (8 draws instead of 17; PERF budget)
      for (const [i0, i1] of [[c[1], K], [K, c[4]]]) for (const [j0, j1] of [[c[1], K], [K, c[4]]]) blocks.push([i0, i1, j0, j1]);
      if (this.terrainRingHalves) blocks.push([[c[0], c[5], c[0], c[1]], [c[0], c[1], c[1], K], [c[4], c[5], c[1], K]], [[c[0], c[5], c[4], c[5]], [c[0], c[1], K, c[4]], [c[4], c[5], K, c[4]]]);   // (COTA: the ring in 2 halves, north / south: <= 6 draws)
      else blocks.push([c[0], c[5], c[0], c[1]], [c[0], c[5], c[4], c[5]], [c[0], c[1], c[1], c[4]], [c[4], c[5], c[1], c[4]]);
    } else {
    for (let bj = 1; bj <= 3; bj++) for (let bi = 1; bi <= 3; bi++) blocks.push([c[bi], c[bi + 1], c[bj], c[bj + 1]]);
    for (const [bi, bj] of [[0, 0], [4, 0], [0, 4], [4, 4]]) blocks.push([c[bi], c[bi + 1], c[bj], c[bj + 1]]);
    blocks.push([c[0], c[1], c[1], c[4]], [c[4], c[5], c[1], c[4]], [c[1], c[4], c[0], c[1]], [c[1], c[4], c[4], c[5]]);
    }
    for (const blk of blocks) {
      const ti = []; const mn = new THREE.Vector3(Infinity, Infinity, Infinity), mx = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      for (const [a0, a1, b0, b1] of (Array.isArray(blk[0]) ? blk : [blk])) {   // (a block is one rectangle, or a list of them drawn as one tile)
      for (let j = b0; j < b1; j++) for (let i = a0; i < a1; i++) { const a = j * W + i, b = a + 1, c = a + W, d = c + 1; ti.push(a, c, b, b, c, d); }
      for (let j = b0; j <= b1; j++) for (let i = a0; i <= a1; i++) { const k = (j * W + i) * 3; mn.min(new THREE.Vector3(pos[k], pos[k + 1], pos[k + 2])); mx.max(new THREE.Vector3(pos[k], pos[k + 1], pos[k + 2])); }
      }
      const g = new THREE.BufferGeometry(); for (const nm of ['position', 'normal', 'color', 'uv']) g.setAttribute(nm, geo.attributes[nm]);
      g.setIndex(new THREE.BufferAttribute(W * W > 65535 ? new Uint32Array(ti) : new Uint16Array(ti), 1)); g.boundingBox = new THREE.Box3(mn, mx); g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
      const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.name = 'terrainMesh'; m.matrixAutoUpdate = false; sc.group.add(m); tiles.push(m); tris += ti.length / 3;
    }
    sc.terrainTiles = tiles; this.stats.terrainTris = tris; this.stats.terrainTiles = tiles.length;
    // compatibility for track.js, which samples the 'terrain' vertex colours on a uniform tSize x tSegs grid just beyond its verge:
    // an invisible carrier of the field-map colours (linear) on such a grid
    const TS = 2 * MAP_HALF, TG = 230, TW = TG + 1; const tc = new Float32Array(TW * TW * 3); const cc = new THREE.Color();
    for (let j = 0; j < TW; j++) for (let i = 0; i < TW; i++) { this.mapColor(-MAP_HALF + i * TS / TG, -MAP_HALF + j * TS / TG, cc); const o = (j * TW + i) * 3; tc[o] = cc.r; tc[o + 1] = cc.g; tc[o + 2] = cc.b; }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('color', new THREE.BufferAttribute(tc, 3)); cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    const carrier = new THREE.Mesh(cg, new THREE.MeshBasicMaterial()); carrier.visible = false; carrier.name = 'terrain'; sc.group.add(carrier); sc.tSize = TS; sc.tSegs = TG;
  };

  // ---------------------------------------------------------------- grass detail texture: tileable blades, mean 0.5 per channel (used as a x2 multiplier)
  Env.grassDetail = function () {
    const S = 512; const [c, ctx] = Env.canvas(S, S); const r = U.rng(4711);
    ctx.fillStyle = 'rgb(120,126,110)'; ctx.fillRect(0, 0, S, S);
    // soft clumps (mid frequency)
    for (let i = 0; i < 260; i++) { const x = r() * S, y = r() * S, rad = 10 + r() * 34, l = r() < 0.5 ? 'rgba(80,92,64,' : 'rgba(170,176,140,'; ctx.fillStyle = l + (0.08 + r() * 0.12).toFixed(2) + ')'; for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { ctx.beginPath(); ctx.ellipse(x + ox, y + oy, rad, rad * (0.6 + r() * 0.4), r() * 3, 0, 6.283); ctx.fill(); } }
    // blades: short curved strokes batched by colour / width class (a few paths instead of thousands)
    const cols = ['rgba(40,50,30,0.7)', 'rgba(150,166,112,0.65)', 'rgba(180,190,134,0.65)', 'rgba(200,198,150,0.6)', 'rgba(210,186,118,0.65)'];
    const weights = [0.38, 0.25, 0.17, 0.13, 0.07];
    for (let ci = 0; ci < cols.length; ci++) for (const lw of [0.9, 1.5, 2.1]) {
      ctx.strokeStyle = cols[ci]; ctx.lineWidth = lw; ctx.beginPath(); const n = Math.round(16000 * weights[ci] / 3);
      for (let i = 0; i < n; i++) {
        const x = r() * S, y = r() * S, len = 5 + r() * 13, ang = -Math.PI / 2 + (r() - 0.5) * 2.2; const ex = Math.cos(ang) * len, ey = Math.sin(ang) * len, bend = (r() - 0.5) * 3;
        for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { if (x + ox < -20 || x + ox > S + 20 || y + oy < -20 || y + oy > S + 20) continue; ctx.moveTo(x + ox, y + oy); ctx.quadraticCurveTo(x + ox + ex * 0.5 + bend, y + oy + ey * 0.5, x + ox + ex, y + oy + ey); }
      }
      ctx.stroke();
    }
    // normalise to a 0.5 mean per channel; alpha carries tileable low-frequency mottling for the macro variation
    const img = ctx.getImageData(0, 0, S, S); const d = img.data; const sum = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) { sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; }
    const n = d.length / 4; const k = sum.map(s => 128 / (s / n));
    const P = 8, hsh = (x, y, o) => Env.hash2(((x % P) + P) % P, ((y % P) + P) % P, o);
    const vn = (x, y, o) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); return U.lerp(U.lerp(hsh(xi, yi, o), hsh(xi + 1, yi, o), u), U.lerp(hsh(xi, yi + 1, o), hsh(xi + 1, yi + 1, o), u), v); };
    const out = new Uint8Array(S * S * 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4; const fx = x / S * P, fy = y / S * P; const m = vn(fx, fy, 1) * 0.6 + vn(fx * 2, fy * 2, 2) * 0.3 + vn(fx * 4, fy * 4, 3) * 0.1;
      out[i] = U.clamp(d[i] * k[0], 0, 255); out[i + 1] = U.clamp(d[i + 1] * k[1], 0, 255); out[i + 2] = U.clamp(d[i + 2] * k[2], 0, 255); out[i + 3] = U.clamp(m * 255, 0, 255);
    }
    const t = new THREE.DataTexture(out, S, S, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true;
    return t; // linear data (a multiplier), not sRGB
  };

  // city / hillside ground detail (same contract as the grass one: tileable, 0.5 mean per channel, alpha = macro mottling):
  // stone grain, worn stains, joints and small dark flecks, no blades
  Env.groundDetail = function () {
    const S = 512; const [c, ctx] = Env.canvas(S, S); const r = U.rng(9137);
    ctx.fillStyle = 'rgb(128,128,128)'; ctx.fillRect(0, 0, S, S);
    const wrap = (fn) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(ox, oy); };
    for (let i = 0; i < 220; i++) { const x = r() * S, y = r() * S, rad = 8 + r() * 40, l = r() < 0.5 ? 'rgba(100,98,94,' : 'rgba(160,158,150,'; ctx.fillStyle = l + (0.08 + r() * 0.12).toFixed(2) + ')'; wrap((ox, oy) => { ctx.beginPath(); ctx.ellipse(x + ox, y + oy, rad, rad * (0.5 + r() * 0.5), r() * 3, 0, 6.283); ctx.fill(); }); }
    for (let i = 0; i < 40000; i++) { const v = 70 + r() * 120; ctx.fillStyle = 'rgba(' + v + ',' + (v - 2) + ',' + (v - 5) + ',0.6)'; ctx.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2); }
    for (let i = 0; i < 90; i++) { const x = r() * S, y = r() * S; ctx.fillStyle = 'rgba(60,58,54,' + (0.08 + r() * 0.12).toFixed(2) + ')'; wrap((ox, oy) => { ctx.beginPath(); ctx.ellipse(x + ox, y + oy, 3 + r() * 12, 2 + r() * 8, r() * 3, 0, 6.283); ctx.fill(); }); }
    ctx.strokeStyle = 'rgba(70,68,64,0.35)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i < 60; i++) { let x = r() * S, y = r() * S; ctx.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 30; y += (r() - 0.5) * 30; ctx.lineTo(x, y); } }
    ctx.stroke();
    const img = ctx.getImageData(0, 0, S, S); const d = img.data; const sum = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) { sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; }
    const n = d.length / 4; const k = sum.map(sv => 128 / (sv / n));
    const P = 8, hsh = (x, y, o) => Env.hash2(((x % P) + P) % P, ((y % P) + P) % P, o);
    const vn = (x, y, o) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); return U.lerp(U.lerp(hsh(xi, yi, o), hsh(xi + 1, yi, o), u), U.lerp(hsh(xi, yi + 1, o), hsh(xi + 1, yi + 1, o), u), v); };
    const out = new Uint8Array(S * S * 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4; const fx = x / S * P, fy = y / S * P; const m = vn(fx, fy, 1) * 0.6 + vn(fx * 2, fy * 2, 2) * 0.3 + vn(fx * 4, fy * 4, 3) * 0.1;
      out[i] = U.clamp(d[i] * k[0], 0, 255); out[i + 1] = U.clamp(d[i + 1] * k[1], 0, 255); out[i + 2] = U.clamp(d[i + 2] * k[2], 0, 255); out[i + 3] = U.clamp(m * 255, 0, 255);
    }
    const t = new THREE.DataTexture(out, S, S, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true;
    return t;
  };
  // a 256 px tile of Mediterranean scrub seen from above at the field map's scale (~2.2 m / px): dark crowns of pines and holm oaks
  // with their shadows, olive clumps of lentisk and broom, pale limestone outcrops and ochre soil; transparent between
  Env.scrubTile = function () {
    if (Env._scrub) return Env._scrub; const S = 256; const [c, ctx] = Env.canvas(S, S); const r = U.rng(6203);
    const blob = (x, y, rad, col) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { if (x + ox < -rad || x + ox > S + rad || y + oy < -rad || y + oy > S + rad) continue; ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x + ox, y + oy, rad, rad * (0.75 + r() * 0.3), r() * 3, 0, 6.283); ctx.fill(); } };
    // bare ground between: ochre soil and pale limestone
    for (let i = 0; i < 200; i++) blob(r() * S, r() * S, 1.5 + r() * 4, 'rgba(' + (128 + r() * 30 | 0) + ',' + (114 + r() * 26 | 0) + ',' + (90 + r() * 20 | 0) + ',' + (0.2 + r() * 0.25).toFixed(2) + ')');
    for (let i = 0; i < 120; i++) blob(r() * S, r() * S, 0.8 + r() * 2.2, 'rgba(' + (156 + r() * 30 | 0) + ',' + (150 + r() * 28 | 0) + ',' + (134 + r() * 24 | 0) + ',' + (0.3 + r() * 0.3).toFixed(2) + ')');
    // shrub clumps (lentisk, broom, rosemary): low olive cushions
    for (let i = 0; i < 1800; i++) { const v = r(); blob(r() * S, r() * S, 0.7 + r() * 1.5, 'rgba(' + (64 + v * 34 | 0) + ',' + (72 + v * 30 | 0) + ',' + (48 + v * 20 | 0) + ',' + (0.4 + r() * 0.4).toFixed(2) + ')'); }
    // groves: pines and holm oaks in clusters, each crown with its shadow and a sunlit side
    for (let g = 0; g < 46; g++) {
      const gx = r() * S, gy = r() * S, gr = 6 + r() * 16, n = 4 + (r() * 14 | 0);
      for (let i = 0; i < n; i++) { const a = r() * 6.283, d = Math.sqrt(r()) * gr; const x = gx + Math.cos(a) * d, y = gy + Math.sin(a) * d, rad = 1.6 + r() * 2.6; const v = r();
        blob(x + rad * 0.45, y + rad * 0.55, rad, 'rgba(18,22,14,0.28)'); blob(x, y, rad, 'rgba(' + (40 + v * 22 | 0) + ',' + (52 + v * 22 | 0) + ',' + (34 + v * 12 | 0) + ',0.9)'); blob(x - rad * 0.3, y - rad * 0.3, rad * 0.5, 'rgba(104,118,76,0.32)'); }
    }
    for (let i = 0; i < 160; i++) { const x = r() * S, y = r() * S, rad = 1.4 + r() * 2.4; blob(x + rad * 0.5, y + rad * 0.6, rad, 'rgba(18,22,14,0.25)'); blob(x, y, rad, 'rgba(' + (44 + r() * 20 | 0) + ',' + (56 + r() * 20 | 0) + ',' + (36 + r() * 10 | 0) + ',0.88)'); }
    return (Env._scrub = c);
  };
  Ctx.prototype.groundMaterial = function (tinted) {
    if (!this._detail) this._detail = this.dem && !this.forestOn ? Env.groundDetail() : Env.grassDetail();
    const det = this._detail; const rocky = !!this.dem && !this.forestOn && !tinted;
    const mat = new THREE.MeshStandardMaterial({ map: this.fieldTex, vertexColors: true, roughness: 0.96, metalness: 0.0 }); if (rocky) mat.extensions = { derivatives: true };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.detailMap = { value: det };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D detailMap;')
        .replace('#include <map_fragment>', [
          'vec4 fm = mapTexelToLinear(texture2D(map, vUv));',
          'vec2 qd = abs(vUv - 0.5); float inMap = 1.0 - smoothstep(0.465, 0.497, max(qd.x, qd.y));',
          tinted ? 'diffuseColor.rgb *= fm.rgb * vColor;' : 'diffuseColor.rgb *= mix(vColor, fm.rgb, inMap);',
          'vec2 wq = vWPos.xz;',
          'vec3 d1 = texture2D(detailMap, wq * 0.62).rgb;',
          // Low (EI_LOW, Env.setQuality): one detail octave and one macro read instead of three + two (PERF: the ground covers much of
          // the frame and was the dearest surface per pixel)
          '#ifdef EI_LOW',
          'float mac = texture2D(detailMap, wq * 0.0071).a;',
          'diffuseColor.rgb *= d1 * 2.0 * (0.78 + 0.44 * mac);',
          '#else',
          'vec3 d2 = texture2D(detailMap, vec2(wq.x * 0.6 - wq.y * 0.8, wq.x * 0.8 + wq.y * 0.6) * 0.15).rgb;',
          'vec3 d3 = texture2D(detailMap, wq * 0.031 + 0.37).rgb;',
          'float mac = texture2D(detailMap, wq * 0.0071).a * 0.65 + texture2D(detailMap, vec2(-wq.y, wq.x) * 0.0023 + 0.5).a * 0.35;',
          'diffuseColor.rgb *= (d1 * 0.5 + d2 * 0.3 + d3 * 0.2) * 2.0 * (0.78 + 0.44 * mac);',
          '#endif'].concat(rocky ? [
          // mountains: steep faces turn to weathered limestone - buttresses and ledges in bands along the height (projected along
          // the face, broken by noise), grey to warm ochre, dark scrub in the gullies and on the ledges; a relief normal from the
          // same bands breaks up the big terrain facets
          'float rkSl = 1.0 - vWN.y, rkHk = smoothstep(60.0, 320.0, vWPos.y);',
          // outside the city (beyond the field map, or high up): the slopes turn to limestone and scrub
          'float rkSteep = clamp(smoothstep(0.05, 0.3, rkSl) * (0.55 + 0.45 * rkHk) + rkHk * 0.3, 0.0, 1.0) * smoothstep(40.0, 130.0, vWPos.y) * max(1.0 - inMap, smoothstep(200.0, 320.0, vWPos.y));',
          'vec2 rkQ = vec2(dot(wq, normalize(vec2(-vWN.z, vWN.x) + 1e-4)), vWPos.y);',
          // (the detail map's alpha is its smooth low-frequency noise: buttresses / ledges / patches at three scales)
          'float rkA = texture2D(detailMap, rkQ * vec2(0.0045, 0.0105) + 0.13).a;',
          'float rkB = texture2D(detailMap, rkQ * vec2(0.014, 0.036) + 0.61).a;',
          'float rkC = texture2D(detailMap, wq * 0.0062 + 0.7).a;',
          'float rkL = rkA * 0.55 + rkB * 0.3 + rkC * 0.15; rkH = rkL;',
          'vec3 rkCol = mix(vec3(0.085, 0.08, 0.072), vec3(0.25, 0.235, 0.205), smoothstep(0.3, 0.7, rkL));',
          'rkCol = mix(rkCol, rkCol * vec3(1.08, 0.98, 0.86), smoothstep(0.5, 0.7, rkC));',
          'float rkVeg = smoothstep(0.42, 0.6, rkC * 0.55 + (1.0 - rkB) * 0.45 + (0.22 - rkSl) * 1.1 - rkHk * 0.12);',
          'rkCol = mix(rkCol, vec3(0.05, 0.062, 0.042) * (0.7 + 0.6 * rkB), rkVeg * 0.8);',
          'rkMix = rkSteep * 0.92; diffuseColor.rgb = mix(diffuseColor.rgb, rkCol * (0.85 + 0.3 * mac), rkMix);'] : []).join('\n'))
        .replace('#include <color_fragment>', '');
      if (rocky) {
        sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'float rkH = 0.5, rkMix = 0.0;\nvoid main() {').replace('#include <normal_fragment_maps>', [
          '#include <normal_fragment_maps>',
          '#ifndef EI_LOW',
          '{ vec2 dH = vec2(dFdx(rkH), dFdy(rkH)) * 14.0 * rkMix; vec3 sp = -vViewPosition; vec3 vSx = dFdx(sp), vSy = dFdy(sp); vec3 R1 = cross(vSy, normal), R2 = cross(normal, vSx);',
          '  float fDet = dot(vSx, R1) * faceDirection; vec3 vGrad = sign(fDet) * (dH.x * R1 + dH.y * R2); normal = normalize(abs(fDet) * normal - vGrad); }',
          '#endif'].join('\n'));
      }
      if (rocky) { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWN;').replace('#include <project_vertex>', '#include <project_vertex>\nvWN = normalize(mat3(modelMatrix) * objectNormal);'); sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWN;'); }
    };
    mat.customProgramCacheKey = () => (tinted ? 'ground-tint' : 'ground') + (rocky ? '-rock' : '') + (mat.defines && mat.defines.EI_LOW !== undefined ? '-low' : '');
    Env.groundMats.push(mat); if (Env.quality === 'low') { mat.defines = mat.defines || {}; mat.defines.EI_LOW = ''; }
    return mat;
  };
  // quality: Low compiles the ground with EI_LOW (main.js setQuality)
  Env.groundMats = []; Env.quality = null;
  Env.setQuality = function (q) {
    Env.quality = q; const low = q === 'low';
    for (const m of Env.groundMats) { const has = !!(m.defines && m.defines.EI_LOW !== undefined); if (has === low) continue; m.defines = m.defines || {}; if (low) m.defines.EI_LOW = ''; else delete m.defines.EI_LOW; m.needsUpdate = true; }
  };

  // ---------------------------------------------------------------- field colour (sRGB bytes) at a point: circuit grass, venue grass, farm fields
  // albedo (sRGB). Kept muted: main.js grades the frame with a strong saturation boost.
  const PAL = {
    mowA: [52, 61, 37], mowB: [59, 68, 42], venue: [56, 63, 38], venueDry: [80, 79, 55], wood: [30, 36, 22],
    // 0 pasture, 1 pasture dark, 2 wheat, 3 barley, 4 green crop, 5 ploughed, 6 stubble, 7 rapeseed, 8 copse
    fields: [[56, 64, 38], [47, 55, 33], [120, 106, 74], [128, 119, 92], [60, 70, 37], [80, 68, 54], [122, 113, 93], [132, 124, 62], [33, 40, 27]],
    hedge: [27, 33, 21],
  };
  Env.PAL = PAL;
  // writes sRGB bytes into `out` (reused array) and returns it
  // venue grass colour, or false when (x, z) is out in the farmland
  Ctx.prototype.venueRGB = function (x, z, out) {
    const f = this.fAt(x, z); if (!(f < this.VENUE_F || (f < 900 && this.inside(x, z)))) return false; if ((this.parkOn || this.forestOn) && f >= 48) return false;
    return this.fieldRGB(x, z, null, out, f);
  };
  Ctx.prototype.fieldRGB = function (x, z, cell, out, fpre) {
    out = out || [0, 0, 0];
    if (this.forestOn) return this.forestRGB(x, z, out, fpre);
    if (this.parkOn) return this.parkRGB(x, z, out, fpre);
    if (this.dem) return this.streetRGB(x, z, out);
    if (this.data.kind === 'desert') return this.desertRGB(x, z, out, fpre);
    if (this.data.kind === 'street') { const n0 = U.noise2(x / 23 + 1.7, z / 23 + 4.2); const g = 118 + n0 * 22; const h = this.hillRaw(x, z); const k = U.smoothstep(14, 60, h); out[0] = (g + 6) * (1 - k) + 92 * k; out[1] = (g + 3) * (1 - k) + 104 * k; out[2] = (g - 4) * (1 - k) + 66 * k; return out; }
    const f = fpre != null ? fpre : this.fAt(x, z); const n1 = U.noise2(x / 61 + 3.3, z / 61 + 7.1);
    let c, k; const PAL = this.data.pal ? (this._pal || (this._pal = Object.assign({}, Env.PAL, this.data.pal))) : Env.PAL;   // ENVDATA[id].pal: a circuit's own grass tones (Silverstone)
    if (f < 48) {
      const dc = this.dcAt(x, z); c = (Math.floor((dc - this.t.halfWidth) / 7.5) & 1) ? PAL.mowA : PAL.mowB; k = 0.94 + n1 * 0.1;
      out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k; return out;
    }
    if (f < this.VENUE_F || (f < 900 && this.inside(x, z))) {
      const dry = U.smoothstep(0.55, 0.8, U.noise2(x / 140 + 9, z / 140 + 4)) * 0.6;
      const stripe = f < 150 ? ((Math.floor(this.dcAt(x, z) / 11) & 1) ? 0.96 : 1.03) : 1; k = (0.92 + n1 * 0.14) * stripe;
      const a = PAL.venue, b = PAL.venueDry; out[0] = (a[0] + (b[0] - a[0]) * dry) * k; out[1] = (a[1] + (b[1] - a[1]) * dry) * k; out[2] = (a[2] + (b[2] - a[2]) * dry) * k; return out;
    }
    cell = this.cellAt(x, z, cell);
    if (cell.edge < 2.2 && cell.k2 >= 0 && this.fType[cell.k] !== this.fType[cell.k2]) { c = PAL.hedge; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; return out; }
    const ty = this.fType[cell.k]; c = PAL.fields[ty];
    k = 0.88 + this.fTone[cell.k] * 0.16 + (n1 - 0.5) * 0.12;
    if (ty === 5) { const a = this.fAng[cell.k]; const u = x * Math.cos(a) + z * Math.sin(a); if ((((u % 3) + 3) % 3) < 1.1) k *= 0.86; }
    else if (ty >= 2 && ty <= 7) {
      // tramlines and a headland round the edge of arable fields
      if (cell.edge < 9) k *= 0.95;
      else { const a = this.fAng[cell.k]; const u = x * Math.cos(a) + z * Math.sin(a); const m = ((u % 24) + 24) % 24; if (Math.abs(m - 11) < 0.9 || Math.abs(m - 13) < 0.9) k *= 0.8; }
    }
    out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k; return out;
  };
  // desert ground colour (sRGB, muted like the rest - the frame grade adds the warmth): pale wind-rippled sand, darker compacted
  // patches and tyre-worn tracks, the landscaped circuit surrounds a touch paler; wet sand at the shore, the seabed under the water
  const DPAL = { sand: [168, 146, 110], sandDark: [138, 116, 84], pale: [186, 168, 134], wet: [118, 104, 82], seabed: [92, 118, 108],
    lawnA: [44, 56, 30], lawnB: [52, 64, 35], pave: [150, 147, 140], paveDark: [118, 116, 110], asphalt: [62, 63, 66], scrub: [120, 112, 84] };
  Env.DPAL = DPAL;
  // Yas Island at the circuit (from the satellite views): irrigated lawns inside the barriers and round the venue - all of the
  // infield, a band outside the lap - pale concrete aprons behind the barriers, paved hardstanding for the paddocks and compounds,
  // dry scrubby ground beyond the landscaping, and the sand of the undeveloped plots further out
  Ctx.prototype.desertRGB = function (x, z, out, fpre) {
    out = out || [0, 0, 0];
    if (this.isSea(x, z)) { const c = DPAL.seabed; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; return out; }
    const f = fpre != null ? fpre : this.fAt(x, z);
    const n1 = U.fbm(x / 140 + 2.3, z / 140 + 7.7, 3), n2 = U.noise2(x / 19 + 4.4, z / 19 + 1.9), n3 = U.fbm(x / 70 + 9.1, z / 60 + 3.3, 2);
    const inside = f < 900 && this.inside(x, z);
    const reach = inside ? 560 : 55 + 50 * U.fbm(x / 210 + 1.7, z / 210 + 5.2, 2);
    const set = (c, k) => { out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k; };
    const mix = (c, t) => { out[0] += (c[0] - out[0]) * t; out[1] += (c[1] - out[1]) * t; out[2] += (c[2] - out[2]) * t; };
    if (f < reach) {
      if (f >= 0 && f < 3.4) { set(DPAL.pave, 0.94 + n2 * 0.08); return out; }               // concrete apron behind the barriers
      // mown lawn: stripes along the circuit, a slow tonal drift
      const dc = this.dcAt(x, z); const st = (Math.floor(dc / 8) & 1) ? 1.05 : 0.95; const tone = 0.9 + n1 * 0.18 + n2 * 0.05;
      const c = DPAL.lawnA, d = DPAL.lawnB; const u = U.smoothstep(0.35, 0.65, n1);
      out[0] = (c[0] + (d[0] - c[0]) * u) * st * tone; out[1] = (c[1] + (d[1] - c[1]) * u) * st * tone; out[2] = (c[2] + (d[2] - c[2]) * u) * st * tone;
      // paved hardstanding patches away from the track (paddocks, compounds, plazas)
      if (f > 40) { const hp = U.smoothstep(0.6, 0.66, n3); if (hp > 0) { const keep = out.slice(); set(DPAL.paveDark, 0.95 + n2 * 0.08); for (let q = 0; q < 3; q++) out[q] = keep[q] + (out[q] - keep[q]) * hp; } }
      // the lawn's edge fades into the dry ground (not a hard line)
      const e = U.smoothstep(reach - 25, reach, f); if (e > 0) mix(DPAL.scrub, e * 0.85);
      return out;
    }
    const rip = Math.sin((x * 0.82 + z * 0.57) * 0.9 + U.noise2(x / 30, z / 30) * 6);
    const dk = U.smoothstep(0.45, 0.75, n1) * 0.55, pl = U.smoothstep(0.62, 0.9, 1 - n1) * 0.3;
    const k = 0.95 + n2 * 0.08 + rip * 0.015;
    for (let q = 0; q < 3; q++) { let v = DPAL.sand[q] + (DPAL.sandDark[q] - DPAL.sand[q]) * dk; v += (DPAL.pale[q] - v) * pl; out[q] = v * k; }
    // dry, compacted scrubland next to the developed areas, then open sand
    const sc = 1 - U.smoothstep(reach, reach + 260, f); if (sc > 0) mix(DPAL.scrub, sc * 0.7);
    if (f > reach && f < reach + 500) { const hp = U.smoothstep(0.62, 0.68, n3) * (1 - U.smoothstep(reach + 200, reach + 500, f)); if (hp > 0) mix(DPAL.paveDark, hp * 0.9); }
    // shore: a band of darker damp sand along the water's edge
    if (this.isSea(x + 6, z) || this.isSea(x - 6, z) || this.isSea(x, z + 6) || this.isSea(x, z - 6)) for (let q = 0; q < 3; q++) out[q] = out[q] * 0.55 + DPAL.wet[q] * 0.45;
    return out;
  };
  // painted overlays for the desert field map (under the venue's own paint): pavements along the roads, the irrigated lawns from
  // the map, open sand plots, car parks
  Ctx.prototype.desertPaint = function () {
    const E = this, D = this.data;
    return (ctx, path) => {
      const fillAll = (list, col) => { ctx.fillStyle = col; for (const p of list || []) { if (p.length < 3) continue; path(p); ctx.fill(); } };
      fillAll((D.sand || []).filter(p => E.fAt(p[0][0], p[0][1]) > 120), 'rgb(176,154,116)');
      fillAll(D.lawns, 'rgb(48,60,32)');
      ctx.strokeStyle = 'rgba(30,44,20,0.5)'; ctx.lineWidth = 1.0; for (const p of D.lawns || []) { if (p.length < 3) continue; path(p); ctx.stroke(); }
      // pale concrete pavements both sides of every road (the venue paint lays the carriageway on top)
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgb(146,143,136)';
      for (const r of E.roads || []) { if (r.w < 5) continue; ctx.lineWidth = r.w + 7; ctx.beginPath(); r.line.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); }
      E._desertParking(ctx, path, D.parking || []);
      // the hairpin pocket's turquoise paint (track.js buildInfield lays the detail on top): no lawn, no tufts there
      const pk = E.t.infieldPocket && E.t.infieldPocket(); if (pk) { ctx.fillStyle = 'rgb(40,150,165)'; path(pk.poly); ctx.fill(); }
    };
  };
  // car parks: dark asphalt with white bay lines in rows along the polygon's longest side
  Ctx.prototype._desertParking = function (ctx, path, list) {
    for (const p of list) {
      if (p.length < 3) continue; let best = 0, ang = 0;
      for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > best) { best = L; ang = Math.atan2(b[1] - a[1], b[0] - a[0]); } }
      ctx.save(); path(p); ctx.fillStyle = 'rgb(58,59,62)'; ctx.fill(); ctx.clip();
      const bb = U.polyBounds(p), cx = (bb.x0 + bb.x1) / 2, cz = (bb.z0 + bb.z1) / 2, R = Math.hypot(bb.x1 - bb.x0, bb.z1 - bb.z0) / 2 + 4;
      ctx.translate(cx, cz); ctx.rotate(ang); ctx.strokeStyle = 'rgba(214,214,206,0.75)'; ctx.lineWidth = 0.18; ctx.beginPath();
      // double rows of 5 m bays either side of 7 m aisles (a 17 m module), 2.6 m wide
      for (let v = -R; v < R; v += 17) { for (const row of [v, v + 10]) { ctx.moveTo(-R, row); ctx.lineTo(R, row); for (let u = -R; u < R; u += 2.6) { ctx.moveTo(u, row); ctx.lineTo(u, row + (row === v ? 5 : -5)); } } }
      ctx.stroke(); ctx.restore();
      ctx.strokeStyle = 'rgba(160,156,148,0.9)'; ctx.lineWidth = 0.8; path(p); ctx.stroke();
    }
  };
  // painted over the venue's own paint for the desert: its generic car parks (grass fields on an English estate) become paved
  // ones with bays, and the trampled aprons round the hospitality units become paving
  Ctx.prototype.desertPaintTop = function () {
    const E = this;
    return (ctx, path) => {
      for (const pk of E.parks || []) { const ax = pk.ax, az = pk.az, hl = pk.hl + 3, hd = pk.hd + 3; const poly = [[pk.cx - ax * hl + az * hd, pk.cz - az * hl - ax * hd], [pk.cx + ax * hl + az * hd, pk.cz + az * hl - ax * hd], [pk.cx + ax * hl - az * hd, pk.cz + az * hl + ax * hd], [pk.cx - ax * hl - az * hd, pk.cz - az * hl + ax * hd]]; E._desertParking(ctx, path, [poly]); }
      ctx.fillStyle = 'rgb(138,135,128)'; for (const h of E.hosp || []) { ctx.save(); ctx.translate(h.cx, h.cz); ctx.rotate(Math.atan2(h.tz, h.tx)); ctx.fillRect(-h.L / 2 - 5, -h.D / 2 - 5, h.L + 10, h.D + 10); ctx.restore(); }
    };
  };
  // street lights along Yas's service and public roads, so the land beyond the fences reads at night instead of a black void
  // (b_outward): a 10 m galvanised pole every ~36 m, the arm over the carriageway, sides alternating; twin arms on the central
  // reservation of the dual carriageways. Night: a lamp glow and a small warm pool in the light map. Poles go to the clutter layer
  Ctx.prototype.desertLights = function () {
    const E = this, night = !!(EI.Night && EI.Night.on); const B = new Env.Builder(), I4 = new THREE.Matrix4();
    const pc = new THREE.Color(0x8c9096).convertSRGBToLinear(), hc = new THREE.Color(0x3c3f44).convertSRGBToLinear();
    const LIM = 1750, H = 10, SP = 36, LC = [1.0, 0.86, 0.66]; let n = 0;
    const pole = (x, z, arms) => {
      const y = E.ground(x, z); B.beam(I4, [x, y - 0.2, z], [x, y + H, z], 0.16, pc);
      for (const [ax, az] of arms) {
        const hx = x + ax * 2.2, hz = z + az * 2.2; B.beam(I4, [x, y + H - 0.4, z], [hx, y + H, hz], 0.07, pc); B.box(I4, 0.8, 0.14, 0.8, hx, y + H - 0.12, hz, hc);
        if (night) { EI.Night.addGlow(hx, y + H - 0.2, hz, 1.5, LC); EI.Night.addFlood(hx, y + H, hz, { power: 0.06, range: 30, color: LC }); }
      }
      n++;
    };
    for (const r of E.roads || []) {
      if (r.w < 6) continue; const L = r.line; const wide = r.w >= 14; let next = SP * 0.5, side = 1;
      for (let i = 0; i + 1 < L.length; i++) {
        const a = L[i], b = L[i + 1]; const d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d < 0.01) continue;
        const tx = (b[0] - a[0]) / d, tz = (b[1] - a[1]) / d, nx = -tz, nz = tx;
        for (; next < d; next += SP) {
          side = -side; const off = wide ? 0 : r.w / 2 + 1.2; const x = a[0] + tx * next + nx * side * off, z = a[1] + tz * next + nz * side * off;
          if (Math.abs(x) > LIM || Math.abs(z) > LIM) continue; const f = E.fAt(x, z); if (f < 14 || f > 1400) continue;
          if (E.occAt(x, z) & (OCC.BUILT | OCC.WATER)) continue;
          pole(x, z, wide ? [[nx, nz], [-nx, -nz]] : [[-nx * side, -nz * side]]);
        }
        next -= d;
      }
    }
    if (B.count) this.sc.statics.add(B.geometry(), 0.5, 0.6, 'clutter'); this.stats.streetLights = n;
  };
  // street circuit ground colour (sRGB): built-up city, Mediterranean scrub (garrigue), umbrella-pine woods and the grey limestone
  // of the steep faces and the high ground; the harbour floor under the water
  const SPAL = { city: [112, 108, 102], cityDark: [90, 88, 84], scrub: [80, 82, 66], scrubDark: [52, 58, 45], dry: [120, 112, 94], pine: [38, 46, 34], rock: [128, 123, 112], rockDark: [86, 82, 74], high: [98, 98, 82], garden: [58, 66, 48], gardenDry: [90, 90, 72], sea: [70, 78, 76] };
  Env.SPAL = SPAL;
  Ctx.prototype.streetRGB = function (x, z, out) {
    out = out || [0, 0, 0];
    if (this.isSea(x, z)) { out[0] = SPAL.sea[0]; out[1] = SPAL.sea[1]; out[2] = SPAL.sea[2]; return out; }
    const g = this.groundAbs(x, z); const e = 14; const sl = Math.hypot(this.demAt(x + e, z) - this.demAt(x - e, z), this.demAt(x, z + e) - this.demAt(x, z - e)) / (2 * e);
    const n1 = this._coarse ? U.noise2(x / 420 + 2.3, z / 420 + 7.7) : U.noise2(x / 37 + 2.3, z / 37 + 7.7), n2 = U.fbm(x / 160 + 5.1, z / 160 + 1.3, 3), n3 = this._coarse ? 0.5 : U.noise2(x / 9 + 1.1, z / 9 + 3.9);
    let r = SPAL.scrub[0] + (SPAL.scrubDark[0] - SPAL.scrub[0]) * n1, gg = SPAL.scrub[1] + (SPAL.scrubDark[1] - SPAL.scrub[1]) * n1, b = SPAL.scrub[2] + (SPAL.scrubDark[2] - SPAL.scrub[2]) * n1;
    const mixc = (c, k) => { r += (c[0] - r) * k; gg += (c[1] - gg) * k; b += (c[2] - b) * k; };
    mixc(SPAL.high, U.smoothstep(450, 800, g) * 0.7);
    // garrigue: dry grass and bare ochre soil between the shrubs on the sunny slopes, umbrella-pine woods lower down
    mixc(SPAL.dry, U.smoothstep(0.52, 0.72, U.fbm(x / 90 + 7.3, z / 90 + 2.9, 3)) * (0.35 + 0.4 * U.smoothstep(0.15, 0.45, sl)) * (1 - U.smoothstep(500, 800, g)));
    mixc(SPAL.pine, U.smoothstep(0.5, 0.64, n2) * U.smoothstep(15, 70, g) * (1 - U.smoothstep(520, 760, g)) * 0.9);
    const rock = Math.min(1, U.smoothstep(0.34, 0.75, sl) * U.smoothstep(60, 220, g) + U.smoothstep(0.55, 0.75, n2 + sl * 0.35) * U.smoothstep(200, 520, g) * 0.7);
    const rk = U.smoothstep(0.25, 0.75, n3); mixc([SPAL.rockDark[0] + (SPAL.rock[0] - SPAL.rockDark[0]) * rk, SPAL.rockDark[1] + (SPAL.rock[1] - SPAL.rockDark[1]) * rk, SPAL.rockDark[2] + (SPAL.rock[2] - SPAL.rockDark[2]) * rk], rock * (0.7 + 0.3 * n1));
    const city = U.smoothstep(0.02, 0.16, this.coverAt(x, z)); const f = this.fAt(x, z); let near = 1 - U.smoothstep(40, 140, f); const ck = U.smoothstep(0.2, 0.8, n3);
    // next to the circuit: steep unbuilt banks are terraced gardens (dark greens), not paving
    if (near > 0 && f > 8) { const d = 6; const hs = Math.hypot(this.streetHeight(x + d, z) - this.streetHeight(x - d, z), this.streetHeight(x, z + d) - this.streetHeight(x, z - d)) / (2 * d); const gk = U.smoothstep(0.18, 0.4, hs) * (1 - U.smoothstep(0.1, 0.3, this.coverAt(x, z))); if (gk > 0) { mixc(n2 > 0.5 ? SPAL.garden : SPAL.gardenDry, gk); near *= 1 - gk; } }
    const built = Math.max(city * 0.85, near);
    mixc([SPAL.cityDark[0] + (SPAL.city[0] - SPAL.cityDark[0]) * ck, SPAL.cityDark[1] + (SPAL.city[1] - SPAL.cityDark[1]) * ck, SPAL.cityDark[2] + (SPAL.city[2] - SPAL.cityDark[2]) * ck], built);
    // out[3]: how natural the ground is (the field map scatters shrubs, pines and rock over it)
    const k = 0.93 + n3 * 0.12; out[0] = r * k; out[1] = gg * k; out[2] = b * k; out[3] = (1 - built) * (1 - rock * 0.55); return out;
  };
  function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  // Voronoi cell polygon of field seed k (clip a square by the bisectors with the 5x5 neighbourhood)
  Ctx.prototype.fieldPoly = function (k) {
    const R = this.FR, W = this.FW; const cx = (k % W) - R, cz = Math.floor(k / W) - R; const sx = this.seedX[k], sz = this.seedZ[k];
    let poly = [[sx - FC * 2, sz - FC * 2], [sx + FC * 2, sz - FC * 2], [sx + FC * 2, sz + FC * 2], [sx - FC * 2, sz + FC * 2]];
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if (!dx && !dz) continue; const x2 = cx + dx, z2 = cz + dz; if (x2 < -R || x2 > R || z2 < -R || z2 > R) continue; const j = (z2 + R) * W + (x2 + R);
      const ax = this.seedX[j] - sx, az = this.seedZ[j] - sz, c = (this.seedX[j] ** 2 + this.seedZ[j] ** 2 - sx * sx - sz * sz) / 2;
      const inside = p => p[0] * ax + p[1] * az <= c; const out = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length]; const ia = inside(a), ib = inside(b);
        if (ia) out.push(a);
        if (ia !== ib) { const da = a[0] * ax + a[1] * az - c, db = b[0] * ax + b[1] * az - c; const u = da / (da - db); out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]); }
      }
      poly = out; if (poly.length < 3) return poly;
    }
    return poly;
  };
  // paint the field map: farm fields as vector polygons, the venue grass per pixel, then vector overlays (woods, roads, car parks...)
  Ctx.prototype.paintFieldMap = function (overlays) {
    const S = MAP_PX, H = MAP_HALF, ppm = S / (H * 2); const [c, ctx] = Env.canvas(S, S);
    const rgb = (a, k) => 'rgb(' + (U.clamp(a[0] * k, 0, 255) | 0) + ',' + (U.clamp(a[1] * k, 0, 255) | 0) + ',' + (U.clamp(a[2] * k, 0, 255) | 0) + ')';
    const street = this.data.kind === 'street';
    const desert = this.data.kind === 'desert';
    this._mt = performance.now(); ctx.fillStyle = street ? 'rgb(128,125,116)' : desert ? rgb(DPAL.sand, 1) : rgb(PAL.fields[0], 1); ctx.fillRect(0, 0, S, S);
    if (desert) {
      // the desert colour per 9 m pixel over the whole map (sand tones, shore, seabed), smoothed up to full size
      const BN = 512; const [bc, bctx] = Env.canvas(BN, BN); const bi = bctx.createImageData(BN, BN); const col = [0, 0, 0];
      for (let j = 0; j < BN; j++) for (let i = 0; i < BN; i++) { const x = -H + (i + 0.5) * 2 * H / BN, z = -H + (j + 0.5) * 2 * H / BN; this.desertRGB(x, z, col); const o = (j * BN + i) * 4; bi.data[o] = col[0]; bi.data[o + 1] = col[1]; bi.data[o + 2] = col[2]; bi.data[o + 3] = 255; }
      bctx.putImageData(bi, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(bc, 0, 0, S, S);
    }
    if (this.parkOn) this.parkBase(ctx, S, H);   // satellite-classified ground cover (env_park.js)
    if (this.forestOn) { this.forestBase(ctx, S, H); this.allWoods = []; }   // env_forest.js: cover rasters (the OSM woods' flat floor fill is not wanted)
    if (street && this.dem) {
      // natural / built-up ground per 9 m pixel, smoothed up to the full map (the overlays add the streets, paving, parks...)
      const BN = 512; const [bc, bctx] = Env.canvas(BN, BN); const bi = bctx.createImageData(BN, BN); const col = [0, 0, 0];
      this._natBuf = new Float32Array(BN * BN);
      for (let j = 0; j < BN; j++) for (let i = 0; i < BN; i++) { const x = -H + (i + 0.5) * 2 * H / BN, z = -H + (j + 0.5) * 2 * H / BN; col[3] = 0; this.streetRGB(x, z, col); const o = (j * BN + i) * 4; bi.data[o] = col[0]; bi.data[o + 1] = col[1]; bi.data[o + 2] = col[2]; bi.data[o + 3] = 255; this._natBuf[j * BN + i] = col[3] || 0; }
      bctx.putImageData(bi, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(bc, 0, 0, S, S);
      // garrigue over the natural ground: clumps of holm oak and lentisk, umbrella pines, pale limestone and ochre soil (a tiled
      // scatter, masked by how natural each 9 m pixel is) - the hills read as Mediterranean scrub instead of flat green
      for (let i = 0; i < BN * BN; i++) { bi.data[i * 4 + 3] = U.clamp(Math.round(this._natBuf[i] * 255), 0, 255); }
      bctx.putImageData(bi, 0, 0); const [pc, pctx] = Env.canvas(S, S); pctx.fillStyle = pctx.createPattern(Env.scrubTile(), 'repeat'); pctx.fillRect(0, 0, S, S);
      pctx.globalCompositeOperation = 'destination-in'; pctx.imageSmoothingEnabled = true; pctx.drawImage(bc, 0, 0, S, S); ctx.drawImage(pc, 0, 0); this._natBuf = null;
    }
    ctx.setTransform(ppm, 0, 0, ppm, S / 2, S / 2);
    const path = (poly) => { ctx.beginPath(); ctx.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]); ctx.closePath(); };
    const R = this.FR, W = this.FW; const polys = []; this.fieldPolys = polys;
    for (let k = 0; k < W * W; k++) {
      if (street || desert || this.parkOn || this.forestOn) break;
      const sx = this.seedX[k], sz = this.seedZ[k]; if (Math.abs(sx) > H + FC * 1.5 || Math.abs(sz) > H + FC * 1.5) continue;
      const poly = this.fieldPoly(k); if (poly.length < 3) continue; polys.push([k, poly]);
      const ty = this.fType[k], tone = this.fTone[k]; path(poly); ctx.fillStyle = rgb(PAL.fields[ty], 0.88 + tone * 0.16); ctx.fill();
      if (ty >= 2 && ty <= 7) {
        ctx.save(); path(poly); ctx.clip(); const a = this.fAng[k], ca = Math.cos(a), sa = Math.sin(a);
        if (ty === 5) { ctx.strokeStyle = 'rgba(50,34,20,0.22)'; ctx.lineWidth = 1.1; ctx.beginPath(); for (let u = -FC * 2; u < FC * 2; u += 3) { ctx.moveTo(sx + ca * u - sa * FC * 2, sz + sa * u + ca * FC * 2); ctx.lineTo(sx + ca * u + sa * FC * 2, sz + sa * u - ca * FC * 2); } ctx.stroke(); }
        else {
          ctx.strokeStyle = 'rgba(60,66,34,0.35)'; ctx.lineWidth = 1.2; ctx.beginPath();
          for (let u = -FC * 2; u < FC * 2; u += 24) for (const o of [-0.9, 0.9]) { const uu = u + o + (tone * 24); ctx.moveTo(sx + ca * uu - sa * FC * 2, sz + sa * uu + ca * FC * 2); ctx.lineTo(sx + ca * uu + sa * FC * 2, sz + sa * uu - ca * FC * 2); }
          ctx.stroke();
          path(poly); ctx.strokeStyle = 'rgba(90,100,52,0.25)'; ctx.lineWidth = 16; ctx.stroke(); // headland
        }
        ctx.restore();
      }
    }
    const T = () => { if (EI.ENV_LOG) { const n = performance.now(); console.log('ENV  map step ' + Math.round(n - (this._mt || n))); this._mt = n; } }; T();
    // large-scale tonal variation (soil moisture, cloud of slightly different growth)
    { const [nc, nctx] = Env.canvas(128, 128); const ni = nctx.createImageData(128, 128); for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) { const v = U.fbm(i / 11 + 4.1, j / 11 + 2.7, 4) * 255; const o = (j * 128 + i) * 4; ni.data[o] = ni.data[o + 1] = ni.data[o + 2] = v; ni.data[o + 3] = 255; } nctx.putImageData(ni, 0, 0);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 0.22; ctx.globalCompositeOperation = 'soft-light'; ctx.imageSmoothingEnabled = true; ctx.drawImage(nc, 0, 0, S, S); ctx.restore(); }
    T();
    // hedgerow lines along every field boundary
    ctx.strokeStyle = rgb(PAL.hedge, 1); ctx.lineWidth = 3.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath(); const cell = {};
    for (const [k, poly] of polys) for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; if (!this.hedgeOn(a, b, cell)) continue; ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
    T();
    // venue grass (mown circuit grass, infield) per pixel over its bounding box
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; const t = this.t;
    for (let i = 0; i < t.n; i++) { x0 = Math.min(x0, t.x[i]); x1 = Math.max(x1, t.x[i]); z0 = Math.min(z0, t.z[i]); z1 = Math.max(z1, t.z[i]); }
    const pad = this.VENUE_F + 80; const i0 = U.clamp(Math.floor((x0 - pad + H) * ppm), 0, S - 1), i1 = U.clamp(Math.ceil((x1 + pad + H) * ppm), 0, S - 1), j0 = U.clamp(Math.floor((z0 - pad + H) * ppm), 0, S - 1), j1 = U.clamp(Math.ceil((z1 + pad + H) * ppm), 0, S - 1);
    const img = ctx.getImageData(i0, j0, i1 - i0 + 1, j1 - j0 + 1); const d = img.data; const col = [0, 0, 0]; const iw = i1 - i0 + 1;
    if (!(street && this.dem)) for (let j = j0; j <= j1; j++) { const z = -H + (j + 0.5) / ppm; for (let i = i0; i <= i1; i++) { const x = -H + (i + 0.5) / ppm; if (!this.venueRGB(x, z, col)) continue; const o = ((j - j0) * iw + (i - i0)) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; } }
    ctx.putImageData(img, i0, j0);
    T();
    // world -> canvas transform for vector overlays
    ctx.setTransform(ppm, 0, 0, ppm, S / 2, S / 2);
    for (const fn of overlays) { ctx.save(); fn(ctx, path); ctx.restore(); }
    const tex = new THREE.CanvasTexture(c); tex.anisotropy = 8; tex.encoding = THREE.sRGBEncoding; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    this.fieldTex = tex; this.fieldCanvas = c;
    T();
    this.fieldPixels = ctx.getImageData(0, 0, S, S).data; T(); // kept for sampling colours of grass cards / tree tints
    return tex;
  };
  // sample the painted field map (linear 0..1 RGB) at a world point
  Ctx.prototype.mapColor = function (x, z, out) {
    const S = MAP_PX; const i = U.clamp(Math.floor((x + MAP_HALF) / (MAP_HALF * 2) * S), 0, S - 1), j = U.clamp(Math.floor((z + MAP_HALF) / (MAP_HALF * 2) * S), 0, S - 1); const o = (j * S + i) * 4; const d = this.fieldPixels;
    out = out || new THREE.Color(); return out.setRGB(d[o] / 255, d[o + 1] / 255, d[o + 2] / 255).convertSRGBToLinear();
  };

  // ---------------------------------------------------------------- verge overlay ribbons: same ground shading right up to the kerbs, with a worn band at the edge
  Ctx.prototype.buildVerge = function () {
    const t = this.t, hw = t.halfWidth, kw = t.kerbWidth; const parts = [];
    const dirt = new THREE.Color(1.12, 0.86, 0.66), worn = new THREE.Color(1.06, 0.94, 0.82), clean = new THREE.Color(1, 1, 1), tmp = new THREE.Color();
    for (const side of [-1, 1]) {
      const wall = side < 0 ? t.wallL : t.wallR;
      const bands = [[() => hw - 0.05, () => hw + kw * 0.7, dirt, worn], [() => hw + kw * 0.7, () => hw + kw + 3.2, worn, clean], [() => hw + kw + 3.2, i => this.forestOn ? Math.max(hw + kw + 4, wall[i]) : Math.max(hw + kw + 4, wall[i] + 42), clean, clean]];   // (forest ground: up to the barrier only - a flat sheet beyond would float over the hillsides)
      for (const [a, b, ca, cb] of bands) {
        const geo = t.ribbon(i => side * a(i), i => side * b(i), { y: -0.02, colorFn: (i, s) => { const n = 0.92 + U.noise2(i * 0.07, side * 5 + s) * 0.16; return tmp.copy(s === 0 ? ca : cb).multiplyScalar(n).clone(); } });
        parts.push(geo);
      }
    }
    // merge indexed ribbons
    let nv = 0, ni = 0; for (const g of parts) { nv += g.attributes.position.count; ni += g.index.count; }
    const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni); let ov = 0, oi = 0;
    for (const g of parts) {
      pos.set(g.attributes.position.array, ov * 3); col.set(g.attributes.color.array, ov * 3); nrm.set(g.attributes.normal.array, ov * 3);
      const ia = g.index.array; for (let i = 0; i < ia.length; i++) idx[oi + i] = ia[i] + ov; ov += g.attributes.position.count; oi += ia.length;
    }
    for (let i = 0; i < nv; i++) { uv[i * 2] = (pos[i * 3] + MAP_HALF) / (MAP_HALF * 2); uv[i * 2 + 1] = 1 - (pos[i * 3 + 2] + MAP_HALF) / (MAP_HALF * 2); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeBoundingSphere();
    const mat = this.groundMaterial(true); mat.polygonOffset = true; mat.polygonOffsetFactor = 2; mat.polygonOffsetUnits = 4;
    const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.name = 'envVerge'; this.sc.group.add(m); this.vergeMesh = m;
    this.stats.vergeTris = ni / 3;
  };

  EI.Env = Env;
})();
