// Equation I - park ground (kind 'park': the Royal Park of Monza). Terrain heights from the DEM grid relative to the start line,
// ground colour from a satellite-classified ground-cover raster (ENVDATA.<id>.ground: 8 m cells, classes 0 woodland floor, 1 lawn,
// 2 dry grass, 3 built / paved), painted into the field map instead of the Voronoi farm fields. Methods are added to Env.Ctx; env.js
// calls initPark() for kind 'park' and routes terrainHeight / fieldRGB / paintFieldMap here.
window.EI = window.EI || {};
(function () {
  const U = EI.U, Env = EI.Env, Ctx = Env.Ctx;
  const P = {}; EI.EnvPark = P;
  // sRGB bytes (muted like env.js PAL: main.js grades the frame with a saturation boost)
  const PAL = [[36, 50, 28], [58, 70, 40], [112, 100, 68], [116, 111, 103]];
  P.PAL = PAL;
  // run-length block: one byte per run, high 2 bits = class, low 6 bits = run length - 1
  P.decodeGround = function (G) {
    const b = Env.b64bytes(G.rle); const n = G.n, cls = new Uint8Array(n * n); let k = 0;
    for (let i = 0; i < b.length && k < cls.length; i++) { const c = b[i] >> 6, r = (b[i] & 63) + 1; for (let j = 0; j < r && k < cls.length; j++) cls[k++] = c; }
    return { x0: G.x0, z0: G.z0, cell: G.cell, n, cls };
  };
  Ctx.prototype.initPark = function () {
    this.parkOn = true;
    const D = this.data.dem; if (D && D.near) { const g = D.near; this.parkDem = { h: g.h, step: g.step, n: g.n, a: Env.decodeI16(g.d) }; }
    if (this.data.ground) this.parkGround = P.decodeGround(this.data.ground);
  };
  // terrain elevation in metres relative to the start line (bilinear on the 30 m grid, clamped at its edge)
  Ctx.prototype.parkDemAt = function (x, z) {
    const g = this.parkDem; if (!g) return 0;
    const fx = U.clamp((x + g.h) / g.step, 0, g.n - 1.001), fz = U.clamp((z + g.h) / g.step, 0, g.n - 1.001); const ix = fx | 0, iz = fz | 0, u = fx - ix, v = fz - iz, a = g.a, n = g.n, k = iz * n + ix;
    return (a[k] * (1 - u) + a[k + 1] * u) * (1 - v) + (a[k + n] * (1 - u) + a[k + n + 1] * u) * v;
  };
  // flat at track level next to the circuit, easing into the real ground (a few metres of relief) beyond the venue
  Ctx.prototype.parkHeight = function (x, z) {
    const f = this.fAt(x, z), fs = this.fsAt(x, z), ty = this.tyAt(x, z);
    const G = this.parkDemAt(x, z); const h = ty + (G - ty) * U.smoothstep(40, 260, f);
    return h - 0.14 * (1 - U.smoothstep(36, 52, fs));
  };
  Ctx.prototype.parkClass = function (x, z) {
    const g = this.parkGround; if (!g) return -1;
    const i = Math.floor((x - g.x0) / g.cell), j = Math.floor((z - g.z0) / g.cell); if (i < 0 || j < 0 || i >= g.n || j >= g.n) return -1;
    return g.cls[j * g.n + i];
  };
  // ground colour (sRGB bytes into `out`): mown strips right beside the circuit, the classified ground cover beyond, a dry / green /
  // woodland blend outside the raster
  Ctx.prototype.parkRGB = function (x, z, out, fpre) {
    out = out || [0, 0, 0]; const f = fpre != null ? fpre : this.fAt(x, z); const n1 = U.noise2(x / 61 + 3.3, z / 61 + 7.1); let c, k;
    if (f < 48) {
      c = (Math.floor((this.dcAt(x, z) - this.t.halfWidth) / 7.5) & 1) ? Env.PAL.mowA : Env.PAL.mowB; k = 0.94 + n1 * 0.1;
      out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k; return out;
    }
    const cl = this.parkClass(x, z);
    if (cl >= 0) { c = PAL[cl]; k = 0.9 + n1 * 0.2 + (U.noise2(x / 17 + 1.1, z / 17 + 4.7) - 0.5) * 0.12; }
    else { const m = U.fbm(x / 400 + 2.2, z / 400 + 5.1, 3); c = m < 0.4 ? PAL[0] : m < 0.62 ? PAL[1] : PAL[2]; k = 0.92 + n1 * 0.16; }
    out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k; return out;
  };
  // the ground-cover raster into the field map canvas (called by paintFieldMap once the base is filled); ctx is in pixel space
  Ctx.prototype.parkBase = function (ctx, S, H) {
    const g = this.parkGround; if (!g) return; const n = g.n, ppm = S / (2 * H);
    const [c, cx] = Env.canvas(n, n); const im = cx.createImageData(n, n), d = im.data;
    for (let i = 0; i < n * n; i++) { const h = (Math.imul(i, 2654435761) >>> 0) / 4294967296; const cl = g.cls[i]; let p = PAL[cl]; let v = 0.94 + 0.12 * h;
      // woodland: a mosaic of crown-sized (8 m) light and dark green cells so the canopy reads from the air / beyond the tree range
      if (cl === 0) { const h2 = (Math.imul(i + 7919, 2246822519) >>> 0) / 4294967296; p = h2 < 0.45 ? [52, 74, 36] : [34, 48, 26]; v = 0.8 + 0.4 * h; } d[i * 4] = p[0] * v; d[i * 4 + 1] = p[1] * v; d[i * 4 + 2] = p[2] * v; d[i * 4 + 3] = 255; }
    cx.putImageData(im, 0, 0);
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(c, (g.x0 + H) * ppm, (g.z0 + H) * ppm, n * g.cell * ppm, n * g.cell * ppm); ctx.restore();
  };
})();
