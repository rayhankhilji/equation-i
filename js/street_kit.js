// Equation I - street furniture for the street circuit (Monaco): street lamps (tall two-arm columns, the cast-iron Casino lanterns,
// curved single-arm lamps), bollards, planters, pedestrian footbridges over the circuit, painted road markings (zebra crossings,
// yellow escape-road hatching), manholes and drain grates, stone retaining walls and the hairpin's planted island. Placement comes
// from the hand lists in the track data (data.street, lap metres + side + offset beyond the barrier). Built into the scenery's
// merged statics (one vertex-coloured material) plus a few textured batches.
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  const SK = EI.StreetKit = {};
  const C = (h) => new THREE.Color(h).convertSRGBToLinear();
  const inR = (s, a, b) => (a <= b ? s >= a && s <= b : s >= a || s <= b);

  // ---------------------------------------------------------------- the Grand Hotel hairpin: centre of the planted island inside the turn
  SK.hairpin = function (t) {
    if (t._hairpin !== undefined) return t._hairpin;
    const c = t.data.corners.find(cc => /hairpin/i.test(cc.name)); if (!c) return (t._hairpin = null);
    const kk = t.smooth(t.k, 4); let best = -1, bk = 0;
    for (let s = c.s - 20; s < c.s + 90; s += 1) { const i = t.idxAtS(s); if (Math.abs(kk[i]) > bk) { bk = Math.abs(kk[i]); best = i; } }
    if (bk < 0.04) return (t._hairpin = null);
    const side = kk[best] > 0 ? 1 : -1; let cx = 0, cz = 0, w = 0; const idx = [];
    for (let j = -40; j <= 40; j++) { const i = (best + j + t.n) % t.n; const k = Math.abs(kk[i]); if (k < bk * 0.6) continue; const R = 1 / k; cx += (t.x[i] + t.nx[i] * side * R) * k; cz += (t.z[i] + t.nz[i] * side * R) * k; w += k; idx.push(i); }
    cx /= w; cz /= w; let r = Infinity; for (let j = -60; j <= 60; j++) { const i = (best + j + t.n) % t.n; const d = Math.hypot(t.x[i] - cx, t.z[i] - cz) - t.halfWidth - 1.45; if (d < r) r = d; }
    const s0 = t.s[idx[0]] - 8, s1 = t.s[idx[idx.length - 1]] + 8;
    return (t._hairpin = r > 2 ? { cx, cz, r, side, s0, s1, y: t.y[best] } : null);
  };

  // ---------------------------------------------------------------- placement context
  function ctx(E) {
    const t = E.t, D = t.data, Z = t.streetZones ? t.streetZones() : null;
    // building footprints near the circuit on a 20 m hash, for "is this spot inside a building" tests
    const H = new Map(), G = 20; const key = (x, z) => Math.floor(x / G) * 4096 + Math.floor(z / G);
    for (const b of D.scenery.buildings.concat(D.scenery.grandstands)) {
      const p = b.p; if (!p || p.length < 3) continue; const bx = U.polyBounds(p); if (E.dcAt((bx.x0 + bx.x1) / 2, (bx.z0 + bx.z1) / 2) > 140) continue;
      for (let x = Math.floor(bx.x0 / G); x <= Math.floor(bx.x1 / G); x++) for (let z = Math.floor(bx.z0 / G); z <= Math.floor(bx.z1 / G); z++) { const k = x * 4096 + z; let l = H.get(k); if (!l) H.set(k, l = []); l.push(p); }
    }
    const inBuilding = (x, z, pad) => { for (const dx of [-pad, 0, pad]) for (const dz of [-pad, 0, pad]) { const l = H.get(key(x + dx, z + dz)); if (l) for (const p of l) if (U.pointInPoly(x + dx, z + dz, p)) return true; } return false; };
    const back = (i, side) => (Z ? Z[side].back[i] : 0);
    const wallAt = (i, side) => (side < 0 ? t.wallL[i] : t.wallR[i]);
    // point at lap distance s, `off` metres beyond the barrier line on `side` (interpolated), with the local axes
    const at = (s, side, off) => {
      const f = U.mod(s / t.ds, t.n); const i = Math.floor(f), j = (i + 1) % t.n, u = f - i;
      let d = U.lerp(wallAt(i, side), wallAt(j, side), u) + back(i, side) + off;
      const kf = t.kFold[i]; if ((kf > 0 && side > 0) || (kf < 0 && side < 0)) d = Math.min(d, Math.max(2, 0.88 / (Math.abs(kf) + 1e-6)));
      const x = U.lerp(t.x[i], t.x[j], u) + t.nx[i] * side * d, z = U.lerp(t.z[i], t.z[j], u) + t.nz[i] * side * d;
      return { x, z, y: E.ground(x, z), tx: t.tx[i], tz: t.tz[i], nx: t.nx[i] * side, nz: t.nz[i] * side, i, d };
    };
    const sideOf = (spec, a, b) => { if (spec === 1 || spec === -1) return spec; const kk = t.smooth(t.k, 12); let sum = 0; for (let s = a; s <= b; s += 2) sum += kk[t.idxAtS(s)]; const out = sum > 0 ? -1 : 1; return spec === 'out' ? out : -out; };
    const runs = (s0, s1, spacing, fn) => { const L = t.length; const len = U.mod(s1 - s0, L) || L; for (let a = spacing * 0.5; a < len; a += spacing) fn(U.mod(s0 + a, L)); };
    const inTunnel = (s) => D.tunnel && s > D.tunnel.s0 - 8 && s < D.tunnel.s1 + 8;
    return { t, D, Z, at, sideOf, runs, inBuilding, inTunnel, wallAt, back };
  }

  // ---------------------------------------------------------------- geometry helpers (local frames, vertex colours)
  // round column between heights y0 and y1 at local (x, z) of frame m
  function col(B, m, x, z, y0, y1, r0, r1, seg, c, cap) {
    const P = (lx, ly, lz) => EI.Env.xf(m, lx, ly, lz);
    for (let k = 0; k < seg; k++) {
      const a0 = k / seg * 6.2832, a1 = (k + 1) / seg * 6.2832;
      const A = P(x + Math.cos(a0) * r0, y0, z + Math.sin(a0) * r0), Bq = P(x + Math.cos(a1) * r0, y0, z + Math.sin(a1) * r0), Cq = P(x + Math.cos(a1) * r1, y1, z + Math.sin(a1) * r1), D = P(x + Math.cos(a0) * r1, y1, z + Math.sin(a0) * r1);
      B.quad(A, D, Cq, Bq, c);
      if (cap) B.tri(P(x, y1, z), Cq, D, c);
    }
  }
  // low-poly sphere / ellipsoid (lantern globes, shrub balls)
  function ball(B, m, x, y, z, rx, ry, rz, c, seg) {
    seg = seg || 6; const P = (lx, ly, lz) => EI.Env.xf(m, lx, ly, lz); const rows = Math.max(3, seg >> 1);
    for (let r = 0; r < rows; r++) for (let k = 0; k < seg; k++) {
      const p0 = r / rows * Math.PI, p1 = (r + 1) / rows * Math.PI, a0 = k / seg * 6.2832, a1 = (k + 1) / seg * 6.2832;
      const V = (p, a) => P(x + Math.sin(p) * Math.cos(a) * rx, y + Math.cos(p) * ry, z + Math.sin(p) * Math.sin(a) * rz);
      B.quad(V(p0, a0), V(p0, a1), V(p1, a1), V(p1, a0), c);
    }
  }
  SK.col = col; SK.ball = ball;

  // ================================================================ shared street atlas, batch builder and chunked world
  // Every static street-level piece (barriers, stands, street furniture, quays, yachts...) is written into SK.Batch builders: plain
  // triangles carrying a vertex colour, an atlas rectangle (tiled or clamped), roughness / metalness / emissive per vertex. SK.World
  // cuts the triangles into spatial cells per layer and draws each cell with ONE shared material (colour atlas + a packed
  // normal / roughness atlas), so a view costs a draw call per visible cell instead of one per kind of object. A small LOD manager
  // (hooked into the scenery's per-frame update) hides detail layers with distance, swaps near / far yacht cells and lets only
  // cells near the eye cast shadows.
  const AT = SK.Atlas = { S: 2048, G: 8 };
  AT.reset = function () {
    const S = AT.S; [AT.cv, AT.cx] = EI.Env.canvas(S, S); [AT.hv, AT.hx] = EI.Env.canvas(S, S); [AT.rv, AT.rx] = EI.Env.canvas(S, S);
    AT.cx.fillStyle = '#ffffff'; AT.cx.fillRect(0, 0, S, S); AT.hx.fillStyle = 'rgb(128,128,128)'; AT.hx.fillRect(0, 0, S, S); AT.rx.fillStyle = 'rgb(128,128,128)'; AT.rx.fillRect(0, 0, S, S);
    AT.x = 0; AT.y = 0; AT.rowH = 0; AT.R = {}; AT.done = false;
    AT.map = new THREE.CanvasTexture(AT.cv); AT.map.encoding = THREE.sRGBEncoding; AT.map.anisotropy = 4; AT.map.wrapS = AT.map.wrapT = THREE.ClampToEdgeWrapping;
    AT.nrmData = new Uint8Array(S * S * 4); for (let i = 0; i < S * S; i++) { AT.nrmData[i * 4] = 128; AT.nrmData[i * 4 + 1] = 128; AT.nrmData[i * 4 + 2] = 128; AT.nrmData[i * 4 + 3] = 255; }
    AT.nrm = new THREE.DataTexture(AT.nrmData, S, S, THREE.RGBAFormat); AT.nrm.generateMipmaps = true; AT.nrm.minFilter = THREE.LinearMipmapLinearFilter; AT.nrm.magFilter = THREE.LinearFilter; AT.nrm.anisotropy = 4; AT.nrm.needsUpdate = true;
    AT.region('white', 8, 8, (x, w, h) => { x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h); }, null, null, 'none');
  };
  // allocate and paint a w x h region; color(ctx, w, h), height(ctx, w, h) grey (128 = flat), rough(ctx, w, h) grey (128 = x1).
  // tile: 'uv' | 'u' | 'v' | 'none' (which axes repeat). Returns [u0, v0, du, dv] in texture space (negative du / dv = clamp)
  AT.region = function (name, w, h, color, height, rough, tile) {
    if (!AT.cv) AT.reset(); if (AT.R[name]) return AT.R[name];
    const S = AT.S, G = AT.G, W = w + 2 * G, H = h + 2 * G; tile = tile || 'uv';
    if (AT.x + W > S) { AT.x = 0; AT.y += AT.rowH; AT.rowH = 0; }
    if (AT.y + H > S) { console.warn('street atlas full: ' + name); return AT.R.white; }
    const x0 = AT.x + G, y0 = AT.y + G; AT.x += W; AT.rowH = Math.max(AT.rowH, H);
    const tu = tile === 'uv' || tile === 'u', tv = tile === 'uv' || tile === 'v';
    const blit = (dst, fn, def) => {
      const [c, x] = EI.Env.canvas(w, h); if (def) { x.fillStyle = def; x.fillRect(0, 0, w, h); } if (fn) fn(x, w, h);
      dst.save(); dst.beginPath(); dst.rect(x0 - G, y0 - G, W, H); dst.clip();
      for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
        if (dx === 0 && dy === 0) { dst.drawImage(c, x0, y0); continue; }
        // gutters: the wrapped neighbour on a tiling axis, the stretched edge row / column on a clamped one
        const sx = dx === 0 ? 0 : (tu ? (dx < 0 ? w - G : 0) : (dx < 0 ? 0 : w - 1)), sw = dx === 0 ? w : (tu ? G : 1);
        const sy = dy === 0 ? 0 : (tv ? (dy < 0 ? h - G : 0) : (dy < 0 ? 0 : h - 1)), sh = dy === 0 ? h : (tv ? G : 1);
        dst.drawImage(c, sx, sy, sw, sh, dx === 0 ? x0 : dx < 0 ? x0 - G : x0 + w, dy === 0 ? y0 : dy < 0 ? y0 - G : y0 + h, dx === 0 ? w : G, dy === 0 ? h : G);
      }
      dst.restore();
    };
    blit(AT.cx, color, '#ffffff'); if (height) blit(AT.hx, height, 'rgb(128,128,128)'); if (rough) blit(AT.rx, rough, 'rgb(128,128,128)');
    const r = [(x0 + 0.5) / S, 1 - (y0 + h - 0.5) / S, (w - 1) / S * (tu ? 1 : -1), (h - 1) / S * (tv ? 1 : -1)]; r.px = [w, h]; AT.R[name] = r; AT.done = false; return r;
  };
  // the packed normal / roughness atlas from the height and roughness canvases (once, after the last region is painted)
  AT.finalize = function () {
    if (!AT.cv || AT.done) return; AT.done = true; const S = AT.S;
    const hd = AT.hx.getImageData(0, 0, S, S).data, rd = AT.rx.getImageData(0, 0, S, S).data, out = AT.nrmData; const k = 2.2 / 255;
    for (let y = 0; y < S; y++) { const ym = Math.max(0, y - 1), yp = Math.min(S - 1, y + 1); const orow = (S - 1 - y) * S;
      for (let x = 0; x < S; x++) { const xm = Math.max(0, x - 1), xp = Math.min(S - 1, x + 1);
        const nx = -(hd[(y * S + xp) * 4] - hd[(y * S + xm) * 4]) * k, ny = (hd[(yp * S + x) * 4] - hd[(ym * S + x) * 4]) * k; const l = Math.hypot(nx, ny, 1);
        const o = (orow + x) * 4; out[o] = 128 + 127 * nx / l; out[o + 1] = 128 + 127 * ny / l; out[o + 2] = rd[(y * S + x) * 4]; out[o + 3] = 255; } }
    AT.nrm.needsUpdate = true; AT.map.needsUpdate = true;
  };

  // ---------------------------------------------------------------- batch builder: Env.Builder-compatible API + atlas / material state
  const STRIDE = 18; // p3 n3 c3 uv2 rect4 rme3
  class Batch {
    constructor() { this.f = new Float32Array(STRIDE * 3 * 1024); this.n = 0; this.rect = null; this.r = 0.6; this.m = 0.05; this.e = 0; }
    get count() { return this.n; }
    // material state: atlas region (name or rect), roughness, metalness, emissive
    set(rect, r, m, e) { this.rect = typeof rect === 'string' ? AT.R[rect] : rect; if (r != null) this.r = r; if (m != null) this.m = m; this.e = e || 0; return this; }
    mat(r, m, e) { this.r = r; this.m = m; this.e = e || 0; return this; }
    _grow(k) { if ((this.n + k) * STRIDE > this.f.length) { const g = new Float32Array(Math.max(this.f.length * 2, (this.n + k) * STRIDE * 1.5) | 0); g.set(this.f); this.f = g; } }
    _v(p, nx, ny, nz, c, u, v) {
      const f = this.f, o = this.n * STRIDE, R = this.rect || AT.R.white; f[o] = p[0]; f[o + 1] = p[1]; f[o + 2] = p[2]; f[o + 3] = nx; f[o + 4] = ny; f[o + 5] = nz; f[o + 6] = c.r; f[o + 7] = c.g; f[o + 8] = c.b;
      f[o + 9] = u; f[o + 10] = v; f[o + 11] = R[0]; f[o + 12] = R[1]; f[o + 13] = R[2]; f[o + 14] = R[3]; f[o + 15] = this.r; f[o + 16] = this.m; f[o + 17] = this.e; this.n++;
    }
    tri(a, b, c, col, uvs) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const cc = col.length === 3 && typeof col[0] === 'object' ? col : null; this._grow(3);
      this._v(a, nx, ny, nz, cc ? cc[0] : col, uvs ? uvs[0] : 0.5, uvs ? uvs[1] : 0.5); this._v(b, nx, ny, nz, cc ? cc[1] : col, uvs ? uvs[2] : 0.5, uvs ? uvs[3] : 0.5); this._v(c, nx, ny, nz, cc ? cc[2] : col, uvs ? uvs[4] : 0.5, uvs ? uvs[5] : 0.5);
    }
    // triangle with explicit vertex normals (smooth surfaces) and per-vertex colours
    triN(a, b, c, na, nb, nc, ca, cb, cc, uvs) { this._grow(3); this._v(a, na[0], na[1], na[2], ca, uvs ? uvs[0] : 0.5, uvs ? uvs[1] : 0.5); this._v(b, nb[0], nb[1], nb[2], cb || ca, uvs ? uvs[2] : 0.5, uvs ? uvs[3] : 0.5); this._v(c, nc[0], nc[1], nc[2], cc || ca, uvs ? uvs[4] : 0.5, uvs ? uvs[5] : 0.5); }
    quad(a, b, c, d, col, uvs) { this.tri(a, b, c, col, uvs ? [uvs[0], uvs[1], uvs[2], uvs[3], uvs[4], uvs[5]] : null); this.tri(a, c, d, col, uvs ? [uvs[0], uvs[1], uvs[4], uvs[5], uvs[6], uvs[7]] : null); }
    // box in frame m: same arguments as Env.Builder.box; textured boxes get uvs in metres / opts.tile
    box(m, w, h, d, x, y, z, col, opts) {
      const hw = w / 2, hd = d / 2; const P = (lx, ly, lz) => EI.Env.xf(m, x + lx, y + ly, z + lz);
      const a = P(-hw, 0, -hd), b = P(hw, 0, -hd), c = P(hw, 0, hd), e = P(-hw, 0, hd), A = P(-hw, h, -hd), B = P(hw, h, -hd), C = P(hw, h, hd), E = P(-hw, h, hd);
      const top = (opts && opts.top) || col; const T = opts && opts.tile; const uv = T ? (sa, sb) => [0, 0, sa / T, 0, sa / T, sb / T, 0, sb / T] : () => null;
      this.quad(A, E, C, B, top, uv(d, w)); this.quad(a, A, B, b, col, T ? [0, 0, 0, h / T, w / T, h / T, w / T, 0] : null); this.quad(b, B, C, c, col, T ? [0, 0, 0, h / T, d / T, h / T, d / T, 0] : null);
      this.quad(c, C, E, e, col, T ? [0, 0, 0, h / T, w / T, h / T, w / T, 0] : null); this.quad(e, E, A, a, col, T ? [0, 0, 0, h / T, d / T, h / T, d / T, 0] : null);
      if (opts && opts.bottom) this.quad(a, b, c, e, col);
    }
    // square beam between two local points (as Env.Builder.beam); seg > 4 makes a round tube (smooth normals)
    beam(m, p0, p1, th, col, seg) {
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2]; const L = Math.hypot(dx, dy, dz); if (L < 0.005) return;
      const ax = [dx / L, dy / L, dz / L]; const up = Math.abs(ax[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      let s = [ax[1] * up[2] - ax[2] * up[1], ax[2] * up[0] - ax[0] * up[2], ax[0] * up[1] - ax[1] * up[0]]; const sl = Math.hypot(s[0], s[1], s[2]); s = s.map(v => v / sl);
      const u = [ax[1] * s[2] - ax[2] * s[1], ax[2] * s[0] - ax[0] * s[2], ax[0] * s[1] - ax[1] * s[0]];
      const N = seg || 4, r = th / 2 * (N === 4 ? Math.SQRT2 : 1), a0 = N === 4 ? Math.PI / 4 : 0; const e = m.elements;
      const nrm = (v) => { const x = e[0] * v[0] + e[4] * v[1] + e[8] * v[2], y = e[1] * v[0] + e[5] * v[1] + e[9] * v[2], z = e[2] * v[0] + e[6] * v[1] + e[10] * v[2]; const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
      const ring = (p) => { const out = []; for (let k = 0; k < N; k++) { const a = a0 + k / N * 6.2832, ca = Math.cos(a), sa = Math.sin(a); const d = [s[0] * ca + u[0] * sa, s[1] * ca + u[1] * sa, s[2] * ca + u[2] * sa]; out.push([EI.Env.xf(m, p[0] + d[0] * r, p[1] + d[1] * r, p[2] + d[2] * r), nrm(d)]); } return out; };
      const A = ring(p0), B = ring(p1);
      for (let k = 0; k < N; k++) { const k2 = (k + 1) % N;
        if (N === 4) this.quad(A[k][0], B[k][0], B[k2][0], A[k2][0], col);
        else { this.triN(A[k][0], B[k][0], B[k2][0], A[k][1], B[k][1], B[k2][1], col); this.triN(A[k][0], B[k2][0], A[k2][0], A[k][1], B[k2][1], A[k2][1], col); } }
    }
    // a vertical round column (r0 at y0, r1 at y1) at local (x, z) of frame m, optional top cap
    col(m, x, z, y0, y1, r0, r1, seg, c, cap) {
      const e = m.elements; for (let k = 0; k < seg; k++) {
        const a0 = k / seg * 6.2832, a1 = (k + 1) / seg * 6.2832; const P = (a, r, y) => EI.Env.xf(m, x + Math.cos(a) * r, y, z + Math.sin(a) * r); const Nn = (a) => { const v = [Math.cos(a), (r0 - r1) / Math.max(0.01, y1 - y0), Math.sin(a)]; const X = e[0] * v[0] + e[4] * v[1] + e[8] * v[2], Y = e[1] * v[0] + e[5] * v[1] + e[9] * v[2], Z = e[2] * v[0] + e[6] * v[1] + e[10] * v[2]; const l = Math.hypot(X, Y, Z); return [X / l, Y / l, Z / l]; };
        this.triN(P(a0, r0, y0), P(a0, r1, y1), P(a1, r1, y1), Nn(a0), Nn(a0), Nn(a1), c); this.triN(P(a0, r0, y0), P(a1, r1, y1), P(a1, r0, y0), Nn(a0), Nn(a1), Nn(a1), c);
        if (cap) this.tri(P(0, 0, y1), P(a1, r1, y1), P(a0, r1, y1), c);
      }
    }
    // ellipsoid (smooth)
    ball(m, x, y, z, rx, ry, rz, c, seg) {
      seg = seg || 8; const rows = Math.max(3, seg >> 1); const e = m.elements;
      const V = (p, a) => { const sp = Math.sin(p), cp = Math.cos(p), ca = Math.cos(a), sa = Math.sin(a); const n = [sp * ca / rx, cp / ry, sp * sa / rz]; const X = e[0] * n[0] + e[4] * n[1] + e[8] * n[2], Y = e[1] * n[0] + e[5] * n[1] + e[9] * n[2], Z = e[2] * n[0] + e[6] * n[1] + e[10] * n[2]; const l = Math.hypot(X, Y, Z) || 1; return [EI.Env.xf(m, x + sp * ca * rx, y + cp * ry, z + sp * sa * rz), [X / l, Y / l, Z / l]]; };
      for (let r = 0; r < rows; r++) for (let k = 0; k < seg; k++) { const p0 = r / rows * Math.PI, p1 = (r + 1) / rows * Math.PI, a0 = k / seg * 6.2832, a1 = (k + 1) / seg * 6.2832;
        const A = V(p0, a0), B = V(p0, a1), C = V(p1, a1), D = V(p1, a0); if (r > 0) this.triN(A[0], B[0], C[0], A[1], B[1], C[1], c); if (r < rows - 1) this.triN(A[0], C[0], D[0], A[1], C[1], D[1], c); }
    }
    // recolour every vertex written so far (e.g. glass written with a placeholder colour)
    tint(c) { for (let i = 0; i < this.n; i++) { const o = i * STRIDE; this.f[o + 6] = c.r; this.f[o + 7] = c.g; this.f[o + 8] = c.b; } return this; }
    // import a THREE geometry (transformed by matrix m) with one colour
    geo(g, m, col) { const gg = g.index ? g.toNonIndexed() : g; if (m) gg.applyMatrix4(m); const p = gg.attributes.position, nr = gg.attributes.normal, uv = gg.attributes.uv; this._grow(p.count);
      for (let i = 0; i < p.count; i++) this._v([p.getX(i), p.getY(i), p.getZ(i)], nr.getX(i), nr.getY(i), nr.getZ(i), col, uv ? uv.getX(i) : 0.5, uv ? uv.getY(i) : 0.5); }
  }
  SK.Batch = Batch;

  // ---------------------------------------------------------------- polyline batches (ropes, rigging, cables): one LineSegments per cell
  class Lines {
    constructor() { this.p = []; this.c = []; }
    seg(a, b, col) { this.p.push(a[0], a[1], a[2], b[0], b[1], b[2]); this.c.push(col.r, col.g, col.b, col.r, col.g, col.b); }
    // catenary between two points (sag metres at mid span)
    rope(a, b, sag, col, n) { n = n || 6; let prev = a; for (let k = 1; k <= n; k++) { const t = k / n; const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]; this.seg(prev, q, col); prev = q; } }
    get count() { return this.p.length / 6; }
  }
  SK.Lines = Lines;

  // ---------------------------------------------------------------- the shared material
  function worldMaterial(kind) {
    const fence = kind === 'fence';
    // the chain-link fence is blended (it fades to a light haze with distance and at grazing angles); everything else is opaque with
    // alpha-to-coverage cut-outs (seats)
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: AT.map, normalMap: AT.nrm, normalScale: new THREE.Vector2(1, 1), roughness: 1, metalness: 0, envMapIntensity: 0.3, alphaTest: fence ? 0.02 : 0.5, side: fence ? THREE.DoubleSide : THREE.FrontSide, transparent: fence, depthWrite: !fence });
    mat.alphaToCoverage = !fence;
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aRect;\nattribute vec3 aRme;\nvarying vec4 vRect;\nvarying vec3 vRme;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRect = aRect; vRme = aRme;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vRect;\nvarying vec3 vRme;')
        .replace('#include <map_fragment>', [
          'vec2 sFu = vec2(vRect.z > 0.0 ? fract(vUv.x) : clamp(vUv.x, 0.0, 1.0), vRect.w > 0.0 ? fract(vUv.y) : clamp(vUv.y, 0.0, 1.0));',
          'vec2 sAuv = vRect.xy + sFu * abs(vRect.zw);',
          '#if __VERSION__ >= 300',
          'vec2 sGx = dFdx(vUv) * abs(vRect.zw), sGy = dFdy(vUv) * abs(vRect.zw);',
          'vec4 sTex = textureGrad(map, sAuv, sGx, sGy); vec4 sAux = textureGrad(normalMap, sAuv, sGx, sGy);',
          '#else',
          'vec4 sTex = texture2D(map, sAuv); vec4 sAux = texture2D(normalMap, sAuv);',
          '#endif',
          'diffuseColor *= mapTexelToLinear(sTex);',
          fence ? 'float sGz = abs(dot(normalize(vViewPosition), normalize(vNormal))); diffuseColor.a = mix(0.3 * diffuseColor.a + 0.05, diffuseColor.a, smoothstep(0.08, 0.4, sGz)) * mix(0.75, 0.38, smoothstep(12.0, 90.0, length(vViewPosition)));' : ''].join('\n'))
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(vRme.x * sAux.b * (255.0 / 128.0), 0.04, 1.0);')
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRme.y;')
        .replace('#include <normal_fragment_maps>', 'vec3 mapN = vec3(sAux.xy * 2.0 - 1.0, 1.0); mapN.xy *= normalScale; normal = perturbNormal2Arb(-vViewPosition, normal, normalize(mapN), faceDirection);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vRme.z;')
        // glossy and metallic surfaces (chrome, glass, lacquered hulls) take more of the sky in their reflections than the diffuse ones
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectSpecular *= 1.0 + 2.4 * clamp(vRme.y + 0.6 - vRme.x, 0.0, 1.0);');
    };
    mat.customProgramCacheKey = () => 'ei-street-world-' + kind;
    return mat;
  }
  SK.worldMaterial = worldMaterial;
  // the Low tier's version of the opaque world material: Lambert (r128: per-vertex lighting), ONE gradient atlas fetch (no normal / aux fetch),
  // no image-based lighting (the Standard path samples the env map for diffuse and specular on every pixel). Emissive stays (lamp heads, boards);
  // the sky ambient the env map gave comes back as a constant share of the albedo.
  function worldMaterialLite() {
    const amb = (typeof window !== 'undefined' && window.__cityAmb != null) ? window.__cityAmb : 0.22;
    const lowMap = AT.map.clone(); lowMap.anisotropy = 2; lowMap.needsUpdate = true;   // its own 2x-aniso handle on the shared canvas (Low only)
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: lowMap, alphaTest: 0.5 });
    mat.extensions = { derivatives: true, shaderTextureLOD: true };
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aRect;\nattribute vec3 aRme;\nvarying vec4 vRect;\nvarying vec3 vRme;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRect = aRect; vRme = aRme;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vRect;\nvarying vec3 vRme;')
        .replace('#include <map_fragment>', [
          'vec2 sFu = vec2(vRect.z > 0.0 ? fract(vUv.x) : clamp(vUv.x, 0.0, 1.0), vRect.w > 0.0 ? fract(vUv.y) : clamp(vUv.y, 0.0, 1.0));',
          'vec2 sAuv = vRect.xy + sFu * abs(vRect.zw);',
          'vec2 sGx = dFdx(vUv) * abs(vRect.zw), sGy = dFdy(vUv) * abs(vRect.zw);',
          'diffuseColor *= mapTexelToLinear(texture2DGradEXT(map, sAuv, sGx, sGy));'].join('\n'))
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * (vRme.z + ' + amb.toFixed(3) + ');');
    };
    mat.customProgramCacheKey = () => 'ei-street-world-lite-' + amb.toFixed(3);
    return mat;
  }
  SK.worldMaterialLite = worldMaterialLite;

  // ---------------------------------------------------------------- world: layers -> spatial cells -> meshes, plus the LOD manager
  // The opaque layers are drawn through three cell grids, ONE mesh per cell each, the layers of a grid ordered so that distance LOD is a
  // contiguous draw range (no extra draw calls): big cells hold [main | detail] (detail dropped in the distance), small cells hold
  // the fine near-only clutter, yacht cells hold [far hulls | near detail] and swap between them. The blended chain-link fence and
  // the line batches keep their own cells.
  const GRIDS = { A: { cell: 600, order: ['main', 'detail'] }, B: { cell: 130, order: ['fine'] }, Y: { cell: 450, order: ['yFar', 'yNear'] } };   // (B was 260 m: a cell is drawn whole, the 30k-tri clutter cells cost 36k tris in view; 130 m = 13k at the same call count. A / Y at 300 / 200 m cut 47 % of the street tris but added 8 calls + 100 objects: reverted)
  const LAYERS = {
    main: { grid: 'A' }, detail: { grid: 'A' }, fine: { grid: 'B' }, yFar: { grid: 'Y' }, yNear: { grid: 'Y' },
    fence: { cell: 600, vis: [240, 600, 1100], mat: 'fence' },
    lines: { cell: 800, vis: [220, 500, 900], lines: true },
    linesNear: { cell: 400, vis: [120, 260, 400], lines: true },
  };
  const NEAR = [100, 190, 300], NEARY = [0, 230, 340], MID = [250, 440, 800], SHADOW = [100, 150, 220];
  SK.LAYERS = LAYERS;
  class World {
    constructor(sc) {
      this.sc = sc; this.src = []; this.items = []; this.mats = {}; this.stats = { tris: 0, meshes: 0, lineSegs: 0 };
      this.group = new THREE.Group(); this.group.name = 'streetWorld'; sc.group.add(this.group);
      const self = this; sc.nearFar = sc.nearFar || []; sc.nearFar.push({ far: { range() {}, update(x, z) { self.update(x, z); } }, near: { range() {}, update() {} } });
    }
    add(b, layer) { if (b && b.count) this.src.push({ b, layer }); }
    mat(kind) { return this.mats[kind] || (this.mats[kind] = worldMaterial(kind)); }
    build() {
      AT.finalize(); const buckets = new Map();
      const bucket = (key, init) => { let k = buckets.get(key); if (!k) buckets.set(key, k = init()); return k; };
      for (const { b, layer } of this.src) {
        const Ly = LAYERS[layer];
        if (Ly.lines) { const CH = Ly.cell, p = b.p; for (let i = 0; i < p.length; i += 6) { const x = (p[i] + p[i + 3]) / 2, z = (p[i + 2] + p[i + 5]) / 2; const k = bucket(layer + ':' + Math.floor(x / CH) + ':' + Math.floor(z / CH), () => ({ layer, lp: [], lc: [] })); for (let j = 0; j < 6; j++) { k.lp.push(p[i + j]); k.lc.push(b.c[i + j]); } } continue; }
        const f = b.f, nt = b.n / 3; const G = Ly.grid ? GRIDS[Ly.grid] : null; const CH = G ? G.cell : Ly.cell; const ord = G ? G.order.indexOf(layer) : 0; const gk = Ly.grid || layer; const nO = G ? G.order.length : 1;
        for (let t = 0; t < nt; t++) {
          const o = t * 3 * STRIDE; const x = (f[o] + f[o + STRIDE] + f[o + 2 * STRIDE]) / 3, z = (f[o + 2] + f[o + STRIDE + 2] + f[o + 2 * STRIDE + 2]) / 3;
          const k = bucket(gk + ':' + Math.floor(x / CH) + ':' + Math.floor(z / CH), () => ({ layer: gk, grid: Ly.grid || null, parts: Array.from({ length: nO }, () => []), n: new Array(nO).fill(0) })); k.parts[ord].push(f.subarray(o, o + 3 * STRIDE)); k.n[ord] += 3;
        }
      }
      for (const k of buckets.values()) {
        const Ly = LAYERS[k.layer] || {}; let obj; const it = { Ly, grid: k.grid };
        if (Ly.lines) {
          const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(k.lp, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(k.lc, 3)); g.computeBoundingSphere(); g.computeBoundingBox();
          obj = new THREE.LineSegments(g, this.lineMat || (this.lineMat = new THREE.LineBasicMaterial({ vertexColors: true }))); obj.name = 'streetLines'; this.stats.lineSegs += k.lp.length / 6;
        } else {
          const total = k.n.reduce((a, b) => a + b, 0); const arr = new Float32Array(total * STRIDE); let o = 0; const off = [0];
          for (let q = 0; q < k.parts.length; q++) { for (const p of k.parts[q]) { arr.set(p, o); o += p.length; } off.push(o / STRIDE); }
          const ib = new THREE.InterleavedBuffer(arr, STRIDE); const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0)); g.setAttribute('normal', new THREE.InterleavedBufferAttribute(ib, 3, 3)); g.setAttribute('color', new THREE.InterleavedBufferAttribute(ib, 3, 6));
          g.setAttribute('uv', new THREE.InterleavedBufferAttribute(ib, 2, 9)); g.setAttribute('aRect', new THREE.InterleavedBufferAttribute(ib, 4, 11)); g.setAttribute('aRme', new THREE.InterleavedBufferAttribute(ib, 3, 15));
          g.computeBoundingSphere(); g.computeBoundingBox();
          obj = new THREE.Mesh(g, this.mat(Ly.mat || 'solid')); obj.name = it.grid ? 'streetCell' + it.grid : 'street_' + k.layer; obj.receiveShadow = true; obj.castShadow = false;
          if (!this.depthMat) this.depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); obj.customDepthMaterial = this.depthMat;
          it.off = off; this.stats.tris += total / 3;
        }
        it.obj = obj; it.box = obj.geometry.boundingBox; this.group.add(obj); this.stats.meshes++; this.items.push(it);
      }
      this.src = []; this._last = null; return this;
    }
    // per frame (scenery LOD hook): draw ranges per cell and tier, distance culling of the fence and line cells, shadow casters near the eye only
    update(x, z) {
      const q = EI.quality === 'low' ? 0 : EI.quality === 'high' ? 2 : 1;
      if (this._last && Math.abs(this._last[0] - x) < 4 && Math.abs(this._last[1] - z) < 4 && this._last[2] === q) return; this._last = [x, z, q];
      for (const it of this.items) {
        const d = EI.Env.boxDist(it.box, x, z);
        if (it.grid) {
          const off = it.off, g = it.obj.geometry; let a = 0, b = 0;
          if (it.grid === 'A') { b = d < MID[q] ? off[2] : off[1]; } else if (it.grid === 'B') { b = d < NEAR[q] ? off[1] : 0; } else if (d < NEARY[q]) { a = off[1]; b = off[2]; } else b = off[1];
          g.setDrawRange(a, b - a); it.obj.visible = b > a; it.obj.castShadow = it.obj.visible && d < SHADOW[q];
          const mm = q === 0 && !window.__cityStd ? (this.matLite || (this.matLite = worldMaterialLite())) : this.mat(it.Ly.mat || 'solid'); if (it.obj.material !== mm) it.obj.material = mm;
        } else it.obj.visible = d < it.Ly.vis[q];
      }
    }
  }
  SK.World = World;
  // the scenery's street world (created on first use; built at the end of the track build)
  // shared atlas regions used by several builders
  function weatherC(x, w, h, seed, n) { const r = U.rng(seed); x.globalCompositeOperation = 'destination-out'; for (let i = 0; i < n; i++) { x.fillStyle = 'rgba(0,0,0,' + (0.15 + r() * 0.55).toFixed(2) + ')'; x.fillRect(r() * (w - 3), r() * (h - 3), 1 + r() * 3, 1 + r() * 3); } x.globalCompositeOperation = 'source-over'; }
  SK.sleeves = function () {
    const out = []; const B = EI.Ads && EI.Ads.BARRIER;
    for (let k = 0; k < 8; k++) out.push(AT.region('sleeve' + k, 512, 64, (x, w, h) => { x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h); for (let j = 0; j < 2; j++) { x.save(); x.beginPath(); x.rect(j * w / 2, 0, w / 2, h); x.clip(); x.translate(j * w / 2, 0); const vw = 128 * 4; x.scale((w / 2) / vw, h / 128); if (B) B[(k * 2 + j) % B.length](x, vw, 128); else { x.fillStyle = k % 2 ? '#1a3d6e' : '#0d5e52'; x.fillRect(0, 0, vw, 128); } x.restore(); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(j * w / 2, 0, 2, h); } weatherC(x, w, h, 61 + k, 500); },
      (x, w, h) => { x.fillStyle = 'rgb(120,120,120)'; x.fillRect(0, 0, w, 3); x.fillRect(0, h - 3, w, 3); }, null, 'u'));
    return out;
  };
  SK.stone = function () {
    // rough-cut limestone courses: one block layout shared by the colour and the height (mortar joints recessed, faces bulging a little)
    const r = U.rng(606), blocks = []; for (let row = 0; row < 8; row++) { let px = -r() * 20; while (px < 256) { const ww = 20 + r() * 30; blocks.push([px, row * 16, ww, 16, 150 + r() * 50]); px += ww; } }
    return AT.region('stone', 256, 128, (x, w, h) => { const q = U.rng(7); x.fillStyle = '#9e9078'; x.fillRect(0, 0, w, h);
      for (const [px, py, ww, hh, v] of blocks) { x.fillStyle = 'rgb(' + (v + 20 | 0) + ',' + (v + 8 | 0) + ',' + (v - 14 | 0) + ')'; x.fillRect(px + 1, py + 1, ww - 2, hh - 2); for (let i = 0; i < 12; i++) { x.fillStyle = 'rgba(' + (q() < 0.5 ? '60,50,40' : '240,230,210') + ',' + (0.08 + q() * 0.12) + ')'; x.fillRect(px + q() * ww, py + q() * hh, 1 + q() * 2, 1 + q() * 2); } }
      x.fillStyle = 'rgba(70,60,40,0.18)'; for (let i = 0; i < 16; i++) x.fillRect(q() * w, 0, 1 + q() * 3, h); },
    (x, w, h) => { x.fillStyle = 'rgb(70,70,70)'; x.fillRect(0, 0, w, h); for (const [px, py, ww, hh] of blocks) { const g = x.createRadialGradient(px + ww / 2, py + hh / 2, 1, px + ww / 2, py + hh / 2, ww * 0.6); g.addColorStop(0, 'rgb(175,175,175)'); g.addColorStop(1, 'rgb(135,135,135)'); x.fillStyle = g; x.fillRect(px + 1.5, py + 1.5, ww - 3, hh - 3); } },
    (x, w, h) => { x.fillStyle = 'rgb(150,150,150)'; x.fillRect(0, 0, w, h); }, 'uv');
  };
  SK.world = function (sc) { if (!sc.sworld) { AT.reset(); sc.sworld = new World(sc); } return sc.sworld; };

  // ---------------------------------------------------------------- street lamps
  function lampDouble(B, m, c) {
    // ~10.5 m tapered steel column, a pair of long arms at the top across the column, flat luminaires
    col(B, m, 0, 0, 0, 0.6, 0.2, 0.2, 8, c.dark);
    col(B, m, 0, 0, 0.6, 10.2, 0.12, 0.075, 8, c.steel, true);
    for (const sd of [-1, 1]) {
      B.beam(m, [0, 9.9, 0], [0, 10.25, sd * 2.1], 0.07, c.steel);
      B.box(m, 0.32, 0.13, 0.9, 0, 10.14, sd * 2.45, c.steel); B.box(m, 0.26, 0.02, 0.76, 0, 10.12, sd * 2.45, c.lamp);
    }
    B.beam(m, [0, 7.4, 0], [0, 7.6, 1.3], 0.05, c.steel); B.box(m, 0.25, 0.1, 0.55, 0, 7.55, 1.5, c.steel); B.box(m, 0.2, 0.02, 0.45, 0, 7.53, 1.5, c.lamp);
  }
  function lampCasino(B, m, c) {
    // cast-iron candelabra: plinth, fluted shaft, collar, crown of five lanterns with gilded finials
    B.box(m, 0.62, 0.55, 0.62, 0, 0, 0, c.iron); B.box(m, 0.5, 0.18, 0.5, 0, 0.55, 0, c.iron);
    col(B, m, 0, 0, 0.73, 3.4, 0.13, 0.085, 8, c.iron); col(B, m, 0, 0, 3.4, 3.6, 0.16, 0.16, 8, c.gold, true);
    col(B, m, 0, 0, 3.6, 4.4, 0.07, 0.06, 6, c.iron);
    for (let k = 0; k < 4; k++) { const a = k / 4 * 6.2832 + 0.4; const x = Math.cos(a) * 0.62, z = Math.sin(a) * 0.62; B.beam(m, [0, 3.85, 0], [x, 4.0, z], 0.05, c.iron); col(B, m, x, z, 4.0, 4.12, 0.1, 0.1, 6, c.iron, true); ball(B, m, x, 4.36, z, 0.19, 0.24, 0.19, c.globe, 6); B.box(m, 0.05, 0.12, 0.05, x, 4.6, z, c.gold); }
    ball(B, m, 0, 4.7, 0, 0.22, 0.28, 0.22, c.globe, 6); B.box(m, 0.06, 0.18, 0.06, 0, 4.98, 0, c.gold);
  }
  function lampArc(B, m, c) {
    // modern column with one long curved arm reaching over the road (+z towards the track)
    col(B, m, 0, 0, 0, 7.5, 0.1, 0.075, 8, c.steel, false);
    let p = [0, 7.5, 0]; for (let k = 1; k <= 6; k++) { const a = k / 6 * Math.PI * 0.5; const q = [0, 7.5 + Math.sin(a) * 1.6, (1 - Math.cos(a)) * 1.6 + k * 0.28]; B.beam(m, p, q, 0.07, c.steel); p = q; }
    B.box(m, 0.3, 0.12, 0.85, 0, p[1] - 0.06, p[2] + 0.3, c.steel); B.box(m, 0.24, 0.02, 0.7, 0, p[1] - 0.075, p[2] + 0.3, c.lamp);
  }

  // ---------------------------------------------------------------- footbridges over the circuit
  function footbridge(K, B, banners, s, style) {
    const t = K.t; const i = t.idxAtS(s); const pL = K.at(s, -1, 2.4), pR = K.at(s, 1, 2.4); const y = Math.max(t.y[i] + 6.4, pL.y + 6.4, pR.y + 6.4);
    const cx = (pL.x + pR.x) / 2, cz = (pL.z + pR.z) / 2; const span = Math.hypot(pR.x - pL.x, pR.z - pL.z);
    const m = EI.Env.frame(cx, t.y[i], cz, t.tx[i], t.tz[i], t.nx[i], t.nz[i]); const yy = y - t.y[i];
    const white = C(0xeceeee), steel = C(0x8e959c), glass = C(0x5d7a90), dark = C(0x2c3036), stone = C(0xd8ccb2);
    const deckW = style === 'casino' ? 3.4 : 2.8;
    // deck girder, floor, glazed / steel parapets and a light canopy on the pool bridge
    B.box(m, deckW, 1.0, span + 1.2, 0, yy - 1.0, 0, style === 'casino' ? stone : white, { bottom: true });
    for (const sd of [-1, 1]) { B.box(m, 0.08, 1.15, span + 1.2, sd * (deckW / 2 - 0.04), yy, 0, glass); B.box(m, 0.14, 0.1, span + 1.2, sd * (deckW / 2 - 0.04), yy + 1.15, 0, steel); }
    if (style === 'pool') { B.box(m, deckW + 0.6, 0.12, span + 1.2, 0, yy + 2.6, 0, white, { bottom: true }); for (let z = -span / 2; z <= span / 2 + 0.1; z += span / 4) for (const sd of [-1, 1]) B.beam(m, [sd * (deckW / 2), yy, z], [sd * (deckW / 2), yy + 2.6, z], 0.1, steel); }
    // stair towers beyond the fences on both sides
    for (const sd of [-1, 1]) {
      const zc = sd * (span / 2 + 2.2); B.box(m, 3.6, yy + 1.2, 3.2, 0, 0, zc, style === 'casino' ? stone : C(0xd5d8db)); B.box(m, 3.8, 0.25, 3.4, 0, yy + 1.2, zc, white);
      for (let h = 1.5; h < yy; h += 1.5) B.box(m, 3.7, 0.1, 3.3, 0, h, zc, dark);
    }
    // partner banners along both faces of the girder
    for (const face of [-1, 1]) banners.push({ m, x: face * (deckW / 2 + 0.03), y: yy - 0.95, w: span + 1.0, h: 0.9, face, k: Math.round(s) % 8 });
  }

  // ---------------------------------------------------------------- road paint (zebras, escape-road hatching), manholes and grates
  function paint(K, P, G) {
    const t = K.t, D = K.D, hw = t.halfWidth; const white = C(0xf1f1ee), yellow = C(0xf0c419), metal = C(0x4a4b4e);
    const quad = (Bt, pts, c, uvs) => { const base = Bt.p.length / 3; for (let k = 0; k < 4; k++) { const q = pts[k]; Bt.p.push(q[0], q[1], q[2]); Bt.c.push(c.r, c.g, c.b); Bt.uv.push(uvs ? uvs[k][0] : (k === 1 || k === 2 ? 1 : 0), uvs ? uvs[k][1] : (k >= 2 ? 1 : 0)); } Bt.i.push(base, base + 2, base + 1, base, base + 3, base + 2); };
    const pt = (s, lat, dy) => { const f = t.frameAt(s); return [f.x + f.nx * lat, f.y + (dy || 0.014), f.z + f.nz * lat]; };
    // zebra crossings: bars 0.5 m wide every metre across the road, running with the traffic
    for (const [s, w] of D.street.zebras || []) for (let lat = -hw + 0.55; lat < hw - 0.5; lat += 1.0) quad(P, [pt(s - w / 2, lat), pt(s + w / 2, lat), pt(s + w / 2, lat + 0.5), pt(s - w / 2, lat + 0.5)], white);
    // worn dashed lane lines left from the public road (the hairpin, the harbour front): 3 m dashes, 6 m gaps
    for (const [s0, s1] of D.street.dashes || [[1140, 1300], [2160, 2420], [2590, 2700], [440, 560]]) for (let s = s0; s < s1; s += 9) { const lat = 0.0; quad(P, [pt(s, lat - 0.06), pt(s + 3, lat - 0.06), pt(s + 3, lat + 0.06), pt(s, lat + 0.06)], C(0xd9d9d4)); }
    // yellow hatching on the escape areas: a border line and 45 degree bars, from behind the kerb to short of the barrier
    for (const [s0, s1, spec] of D.street.yellow || []) {
      const sd = K.sideOf(spec, s0, s1); const wall = sd < 0 ? t.wallL : t.wallR; const a = hw + t.kerbWidth + 0.35;
      for (let s = s0; s < s1; s += 1.0) { const i = t.idxAtS(s); const b = wall[i] - 0.5; if (b - a < 1.2) continue; quad(P, [pt(s, sd * a), pt(s + 1.02, sd * a), pt(s + 1.02, sd * (a + 0.15)), pt(s, sd * (a + 0.15))], yellow); quad(P, [pt(s, sd * (b - 0.15)), pt(s + 1.02, sd * (b - 0.15)), pt(s + 1.02, sd * b), pt(s, sd * b)], yellow); }
      for (let s = s0; s < s1 - 2; s += 2.6) { const i = t.idxAtS(s); const b = wall[i] - 0.65; const w = b - a - 0.3; if (w < 1) continue; const steps = Math.ceil(w / 0.6); for (let k = 0; k < steps; k++) { const l0 = a + 0.15 + k * w / steps, l1 = a + 0.15 + (k + 1) * w / steps; const ds0 = (l0 - a) * 0.9, ds1 = (l1 - a) * 0.9; if (s + ds1 + 0.45 > s1) break; quad(P, [pt(s + ds0, sd * l0), pt(s + ds0 + 0.45, sd * l0), pt(s + ds1 + 0.45, sd * l1), pt(s + ds1, sd * l1)], yellow); } }
    }
    // green painted stripes on the outside of a bend, slanted with the traffic (Massenet, massenet_a): [s0, s1, side]
    for (const [s0, s1, spec] of D.street.green || []) {
      const sd = K.sideOf(spec, s0, s1); const wall = sd < 0 ? t.wallL : t.wallR; const a = hw + t.kerbWidth + 0.25; const g = C(0x34a874);
      for (let s = s0; s < s1 - 3; s += 3.2) { const b = Math.min(a + 2.6, wall[t.idxAtS(s)] - 0.45); if (b - a < 0.8) continue; const q = [pt(s, sd * a), pt(s + 0.7, sd * a), pt(s + 2.2, sd * b), pt(s + 1.5, sd * b)]; quad(P, sd > 0 ? q : q.reverse(), g); }
    }
    // drain grates along both gutters every ~18 m, manholes on the road every ~45 m (not in the tunnel's gutter-less stretch)
    const rng = U.rng(4545); const L = t.length;
    for (let s = 5; s < L; s += 16 + rng() * 6) for (const sd of [-1, 1]) { if (rng() < 0.3) continue; const lat = sd * (hw + 0.55); quad(G, [pt(s - 0.4, lat - 0.25, 0.016), pt(s + 0.4, lat - 0.25, 0.016), pt(s + 0.4, lat + 0.25, 0.016), pt(s - 0.4, lat + 0.25, 0.016)], C(0xffffff), [[0, 0], [1, 0], [1, 1], [0, 1]]); }
    for (let s = 20; s < L; s += 35 + rng() * 25) { const lat = (rng() - 0.5) * (hw * 1.4); const r = 0.36; const pts = []; const f = t.frameAt(s); for (let k = 0; k < 8; k++) { const a = k / 8 * 6.2832; pts.push([f.x + f.nx * (lat + Math.cos(a) * r) + f.tx * Math.sin(a) * r, f.y + 0.015, f.z + f.nz * (lat + Math.cos(a) * r) + f.tz * Math.sin(a) * r]); }
      const c0 = [f.x + f.nx * lat, f.y + 0.015, f.z + f.nz * lat]; for (let k = 0; k < 8; k++) { const base = P.p.length / 3; for (const q of [c0, pts[k], pts[(k + 1) % 8]]) { P.p.push(q[0], q[1], q[2]); P.c.push(metal.r, metal.g, metal.b); P.uv.push(q[0] * 0.8, q[2] * 0.8); } P.i.push(base, base + 2, base + 1); } }
  }
  function batchMesh(Bt, mat, name) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(Bt.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(Bt.c, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(Bt.uv, 2));
    const nr = new Float32Array(Bt.p.length); for (let i = 1; i < nr.length; i += 3) nr[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(nr, 3)); g.setIndex(Bt.i); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.name = name; m.receiveShadow = true; return m;
  }

  // ---------------------------------------------------------------- trees for the vegetation module: [x, z, species, width, height]
  // species names: 'pine' (umbrella / stone pine), 'palm', 'cypress', 'oleander', 'shrub', 'cactus'
  SK.trees = function (E) {
    const K = ctx(E), t = K.t, ST = K.D.street; if (!ST) return [];
    const out = []; const rng = U.rng(8181);
    const size = (sp) => sp === 'pine' ? [11 + rng() * 6, 12 + rng() * 5] : sp === 'palm' ? [6 + rng() * 2.5, 9 + rng() * 6] : sp === 'cypress' ? [2.6 + rng() * 1, 10 + rng() * 5] : sp === 'cactus' ? [1.6, 2.6 + rng() * 1.2] : [2.6 + rng() * 1.4, 2.2 + rng() * 1.2];
    // never on the pit lane, its entry / exit roads or the garages (the corridor beside the start straight on the pit side)
    const pit = K.D.pit || []; const pr = {}; const sf = t.sf || 0; const lapD = (a, b) => { const d = Math.abs(a - b) % t.length; return Math.min(d, t.length - d); };
    const onPit = (x, z) => { for (let k = 0; k + 1 < pit.length; k++) if (EI.Env.segDist ? EI.Env.segDist(x, z, pit[k][0], pit[k][1], pit[k + 1][0], pit[k + 1][1]) < 7 : false) return true; t.project(x, z, null, pr); const side = pr.lat < 0 ? -1 : 1; return side === E.pitSide && lapD(pr.s, sf) < 228 && pr.dist > K.wallAt(pr.i, side) + 2.4; };
    const ok = (x, z) => !K.inBuilding(x, z, 1.2) && E.fsAt(x, z) > 0.8 && !onPit(x, z);
    for (const [sp, s0, s1, side, off, spacing] of ST.plant || []) {
      K.runs(s0, s1, spacing, (s) => { if (K.inTunnel(s)) return; const p = K.at(s + (rng() - 0.5) * spacing * 0.3, side, off + rng() * 1.2); if (!ok(p.x, p.z)) return; const [w, h] = size(sp); out.push([p.x, p.z, sp, w, h]); });
    }
    // the hairpin island: a few palms and cacti among the flowers
    const isl = SK.hairpin(t); if (isl) { const r = isl.r; for (const [a, d, sp] of [[0.4, 0.45, 'palm'], [2.5, 0.35, 'palm'], [4.3, 0.5, 'palm'], [1.4, 0.6, 'cactus'], [3.3, 0.62, 'cactus'], [5.4, 0.3, 'oleander']]) { const [w, h] = size(sp); out.push([isl.cx + Math.cos(a) * r * d, isl.cz + Math.sin(a) * r * d, sp, sp === 'palm' ? w * 0.8 : w, sp === 'palm' ? h * 0.8 : h]); } }
    return out;
  };
  // species of a map street tree by stretch of the lap (data.street.treeRules)
  SK.treeSpecies = function (E, x, z) {
    const t = E.t, rules = (t.data.street || {}).treeRules || []; const p = t.project(x, z, null, {}); const side = p.lat < 0 ? -1 : 1;
    for (const [s0, s1, sd, sp] of rules) if (inR(p.s, s0, s1) && (!sd || sd === side)) return sp;
    return null;
  };

  // ---------------------------------------------------------------- build (called from EnvStreet.build, before the statics are merged)
  SK.build = function (E) {
    const T0 = performance.now(); const sc = E.sc, K = ctx(E), t = K.t, ST = K.D.street; if (!ST) return;
    const B = new SK.Batch().mat(0.7, 0.05), Bm = new SK.Batch().mat(0.42, 0.55), Bc = new SK.Batch().mat(0.45, 0.5); // main (stone, paint) / lamps (metal) / small clutter
    const Wb = new SK.Batch().set(SK.stone(), 0.92, 0), Gl = new SK.Batch(); const sl = SK.sleeves();
    const cl = { dark: C(0x3a3e44), steel: C(0x9aa1a8), lamp: C(0xfff4d6), iron: C(0x1f2622), gold: C(0xb08a3a), globe: C(0xf4f0e2) };
    let nLamp = 0, nBoll = 0, nPlant = 0;
    // ---- lamps: column on the pavement, arms reaching towards the road
    for (const [kind, s0, s1, side, off, spacing] of ST.lamps || []) K.runs(s0, s1, spacing, (s) => {
      if (K.inTunnel(s)) return; const p = K.at(s, side, off); if (K.inBuilding(p.x, p.z, 0.6)) return;
      const m = EI.Env.frame(p.x, p.y, p.z, p.tx, p.tz, -p.nx, -p.nz); // +z towards the track
      if (kind === 'double') lampDouble(Bm, m, cl); else if (kind === 'casino') lampCasino(Bm, m, cl); else lampArc(Bm, m, cl); nLamp++;
    });
    // ---- litter bins (dark green, the city crest band) beside every other lamp, road signs at the crossings and the junctions
    const signR = AT.region('roadSigns', 320, 64, (x, w, h) => {
      x.clearRect(0, 0, w, h); const cell = (k, fn) => { x.save(); x.translate(k * 64, 0); fn(); x.restore(); };
      cell(0, () => { x.fillStyle = '#1f5fbf'; x.fillRect(4, 4, 56, 56); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(32, 10); x.lineTo(56, 54); x.lineTo(8, 54); x.closePath(); x.fill(); x.fillStyle = '#111'; x.fillRect(29, 26, 6, 14); x.beginPath(); x.arc(32, 22, 4, 0, 6.283); x.fill(); x.fillRect(20, 46, 24, 3); });
      cell(1, () => { x.fillStyle = '#fff'; x.beginPath(); x.arc(32, 32, 29, 0, 6.283); x.fill(); x.fillStyle = '#c8102e'; x.beginPath(); x.arc(32, 32, 27, 0, 6.283); x.fill(); x.fillStyle = '#fff'; x.fillRect(12, 27, 40, 10); });
      cell(2, () => { x.fillStyle = '#fff'; x.beginPath(); x.arc(32, 32, 29, 0, 6.283); x.fill(); x.strokeStyle = '#c8102e'; x.lineWidth = 7; x.beginPath(); x.arc(32, 32, 24, 0, 6.283); x.stroke(); x.fillStyle = '#111'; x.font = '900 24px Arial Black, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('50', 32, 34); });
      cell(3, () => { x.fillStyle = '#1f5fbf'; x.beginPath(); x.arc(32, 32, 29, 0, 6.283); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(32, 12); x.lineTo(46, 30); x.lineTo(37, 30); x.lineTo(37, 52); x.lineTo(27, 52); x.lineTo(27, 30); x.lineTo(18, 30); x.closePath(); x.fill(); });
      cell(4, () => { x.fillStyle = '#1f5fbf'; x.fillRect(4, 4, 56, 56); x.fillStyle = '#fff'; x.font = '900 46px Arial Black, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('P', 32, 35); });
    }, null, null, 'none');
    const Sg = new SK.Batch(); let nBin = 0, nSign = 0; const binC = C(0x1f3b2c), crest = C(0xc8102e), postC = C(0x9aa0a6);
    const sign = (p, kind, h) => { const m = EI.Env.frame(p.x, p.y, p.z, p.tx, p.tz, -p.nx, -p.nz); Bc.col(m, 0, 0, 0, h + 0.3, 0.035, 0.035, 6, postC, true);
      Sg.set(signR, 0.45, 0.1); const u0 = kind / 5, u1 = (kind + 1) / 5; const P = (x, y) => EI.Env.xf(m, x, h + y, 0.05); Sg.quad(P(-0.3, -0.3), P(0.3, -0.3), P(0.3, 0.3), P(-0.3, 0.3), C(0xffffff), [u0, 0, u1, 0, u1, 1, u0, 1]); Sg.set('white', 0.5, 0.4); Sg.quad(P(0.3, -0.3), P(-0.3, -0.3), P(-0.3, 0.3), P(0.3, 0.3), C(0x9aa0a6)); nSign++; };
    let lampK = 0;
    for (const [kind, s0, s1, side, off, spacing] of ST.lamps || []) K.runs(s0, s1, spacing, (s) => {
      if (K.inTunnel(s) || (lampK++ & 1)) return; const p = K.at(s + 1.2, side, off + 0.1); if (K.inBuilding(p.x, p.z, 0.5)) return; const m = EI.Env.frame(p.x, p.y, p.z, p.tx, p.tz, -p.nx, -p.nz);
      Bc.mat(0.55, 0.3); Bc.col(m, 0, 0, 0, 0.95, 0.24, 0.27, 8, binC, true); Bc.col(m, 0, 0, 0.72, 0.8, 0.275, 0.275, 8, crest, false); Bc.col(m, 0, 0, 0.95, 1.0, 0.28, 0.2, 8, C(0x2a2d31), true); nBin++; });
    for (const [s, w] of ST.zebras || []) for (const sd of [-1, 1]) { const p = K.at(s - w * 0.5 - 1.5, sd, 0.9); if (!K.inBuilding(p.x, p.z, 0.3) && p.d > K.wallAt(p.i, sd) + 0.3) sign(p, 0, 2.3); }
    for (const [s, sd, kind] of ST.signs || [[3010, 1, 1], [2905, -1, 3], [1180, 1, 2], [700, -1, 2], [1990, 1, 4], [2440, -1, 2], [420, -1, 4], [1335, 1, 3]]) { const p = K.at(s, sd, 1.0); if (!K.inBuilding(p.x, p.z, 0.3) && p.d > K.wallAt(p.i, sd) + 0.3) sign(p, kind, 2.2); }   // (inside a hairpin the clamped line runs inside the rail: no sign there; FIT-AUDIT)
    E.stats.streetSigns = nSign; E.stats.streetBins = nBin;
    // ---- bollards (black posts with a steel cap) and planters (stone troughs with clipped shrubs or flowers)
    for (const [s0, s1, side, off, spacing] of ST.bollards || []) K.runs(s0, s1, spacing, (s) => { const p = K.at(s, side, off); if (K.inBuilding(p.x, p.z, 0.3)) return; const m = EI.Env.frame(p.x, p.y, p.z, p.tx, p.tz, -p.nx, -p.nz); col(Bc, m, 0, 0, 0, 0.85, 0.07, 0.07, 6, C(0x1d1f22)); col(Bc, m, 0, 0, 0.85, 0.95, 0.08, 0.05, 6, C(0xb7bcc0), true); nBoll++; });
    const rngP = U.rng(311);
    for (const [s0, s1, side, off, spacing] of ST.planters || []) K.runs(s0, s1, spacing, (s) => {
      const p = K.at(s, side, off); if (K.inBuilding(p.x, p.z, 0.8)) return; const m = EI.Env.frame(p.x, p.y, p.z, p.tx, p.tz, -p.nx, -p.nz);
      const stone = C([0xd9cdb4, 0xc9b79a, 0xb06a4a][Math.floor(rngP() * 3)]); B.box(m, 1.6, 0.62, 0.9, 0, 0, 0, stone); B.box(m, 1.5, 0.05, 0.8, 0, 0.6, 0, C(0x4a3a2a));
      const flowers = rngP() < 0.45; for (let k = 0; k < 3; k++) ball(B, m, -0.5 + k * 0.5, 0.82, 0, 0.32, 0.28, 0.32, flowers ? C([0xd23a6e, 0xe86a9a, 0xf2f0f0, 0xc81d3a][Math.floor(rngP() * 4)]) : C(0x3b5a2a), 5); nPlant++;
    });
    // ---- stone retaining walls behind the fences (rough-cut limestone, a balustrade on top)
    for (const [s0, s1, side, h] of ST.retaining || []) {
      let prev = null, u = 0;
      for (let s = s0; s <= s1 + 0.01; s += 2) {
        const p = K.at(s, side, 2.2); const y0 = p.y - 0.3, y1 = p.y + h;
        if (prev) { u += Math.hypot(p.x - prev.x, p.z - prev.z) / 4; const v1 = (h + 0.3) / 2; const a = [prev.x, prev.y - 0.3, prev.z], b = [p.x, p.y - 0.3, p.z], c = [p.x, p.y + h, p.z], d = [prev.x, prev.y + h, prev.z]; const wc = C(0xffffff); Wb.quad(a, b, c, d, wc, [prev.u, 0, u, 0, u, v1, prev.u, v1]); Wb.quad(a, d, c, b, wc, [prev.u, 0, prev.u, v1, u, v1, u, 0]);
          const m = EI.Env.frame(p.x, y1, p.z, p.tx, p.tz, -p.nx, -p.nz); Bc.box(m, 2.05, 0.18, 0.6, 0, 0, -0.3, C(0xd8ccb2)); for (let k = -0.8; k <= 0.81; k += 0.4) Bc.box(m, 0.12, 0.8, 0.12, k, 0.18, -0.15, C(0xe2d7c0)); Bc.box(m, 2.05, 0.12, 0.25, 0, 0.98, -0.15, C(0xd8ccb2)); }
        prev = p; prev.u = u;
      }
    }
    // ---- the hairpin island: raised planted bed inside a red / white kerb ring
    const isl = SK.hairpin(t);
    if (isl) {
      const I = new THREE.Matrix4(); const y = E.ground(isl.cx, isl.cz); const r = isl.r; const seg = 40; const red = C(0xc8102e), white = C(0xf2f2f0), soil = C(0x4a3a28), green = C(0x2f4a24);
      for (let k = 0; k < seg; k++) {
        const a0 = k / seg * 6.2832, a1 = (k + 1) / seg * 6.2832; const P = (a, rr, h) => [isl.cx + Math.cos(a) * rr, y + h, isl.cz + Math.sin(a) * rr];
        const c = (k >> 1) & 1 ? red : white;
        B.quad(P(a0, r + 0.6, 0.02), P(a1, r + 0.6, 0.02), P(a1, r, 0.2), P(a0, r, 0.2), c); B.quad(P(a0, r, 0.2), P(a1, r, 0.2), P(a1, r - 0.35, 0.22), P(a0, r - 0.35, 0.22), c);
        B.quad(P(a0, r - 0.35, 0.22), P(a1, r - 0.35, 0.22), P(a1, r - 0.4, 0.42), P(a0, r - 0.4, 0.42), C(0xd8d2c4));
        B.tri(P(a0, r - 0.4, 0.42), P(a1, r - 0.4, 0.42), [isl.cx, y + 0.62, isl.cz], k % 3 ? soil : green);
      }
      const rng = U.rng(77); for (let k = 0; k < 26; k++) { const a = rng() * 6.2832, d = Math.sqrt(rng()) * (r - 1.0); const cc = [C(0x3d6a2c), C(0xc8285a), C(0xe8d23a), C(0x4e7a34), C(0xd84a8a)][k % 5]; ball(B, I, isl.cx + Math.cos(a) * d, y + 0.75, isl.cz + Math.sin(a) * d, 0.45 + rng() * 0.35, 0.3 + rng() * 0.2, 0.45 + rng() * 0.35, cc, 5); }
      E.stats.hairpinIsland = Math.round(r * 10) / 10;
    }
    // ---- footbridges and their partner banners
    const banners = [];
    for (const [s, style] of ST.footbridges || []) footbridge(K, B, banners, s, style);
    if (banners.length) {
      for (const b of banners) { const g = new THREE.PlaneGeometry(b.w, b.h); g.rotateY(b.face * Math.PI / 2); const uv = g.attributes.uv; for (let v = 0; v < uv.count; v++) uv.setXY(v, uv.getX(v) * b.w / 8, uv.getY(v)); g.translate(b.x, b.y + b.h / 2, 0); g.applyMatrix4(b.m); Gl.set(sl[b.k % 8], 0.55, 0); Gl.geo(g, null, C(0xffffff)); }
    }
    // ---- road paint and ironwork (decals on the asphalt)
    const P = { p: [], c: [], uv: [], i: [] }, G = { p: [], c: [], uv: [], i: [] }; paint(K, P, G); const X = t.streetTextures();
    if (P.p.length) sc.group.add(batchMesh(P, new THREE.MeshStandardMaterial({ map: X.paint, vertexColors: true, roughness: 0.62, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), 'streetPaint'));
    if (G.p.length) sc.group.add(batchMesh(G, new THREE.MeshStandardMaterial({ map: X.grate, roughness: 0.5, metalness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), 'streetGrates'));
    const Wd = SK.world(sc); Wd.add(B, 'main'); Wd.add(Bm, 'detail'); Wd.add(Bc, 'fine'); Wd.add(Wb, 'main'); Wd.add(Gl, 'detail'); Wd.add(Sg, 'fine');
    E.stats.streetKit = { lamps: nLamp, bollards: nBoll, planters: nPlant, footbridges: (ST.footbridges || []).length, tris: Math.round((B.count + Bm.count + Bc.count) / 3) };
    E.timings.streetKit = Math.round(performance.now() - T0);
  };
})();
