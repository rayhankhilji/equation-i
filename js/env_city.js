// Equation I - the city round a street circuit (Monaco). Every map footprint becomes a designed building: a facade style picked
// from its height, size, type and neighbourhood (Belle Epoque stone round the Casino, 1960s-80s apartment towers with continuous
// wrap-round balconies along the harbour and the boulevards, glass towers on the Larvotto side, old town houses with terracotta
// roofs on the Rocher, pastel villas on the hills), with a wall colour and an accent colour (shutters, awnings, rails) of its own.
// Near the circuit the facades are modelled: balcony slabs with solid / glass / bar parapets, awnings over the balconies and the
// shops, cornices, mansard dormers, plinths, roofs with penthouses, terraces, parasols, planters, tanks and antennas; hand-built
// landmarks (the Casino with its towers and copper roofs, the Hotel de Paris and its rotunda, the Cafe de Paris, the hotel over
// the hairpin, the swimming pool, the Rascasse, the Palace and the Rocher's cliffs).
// Rendering: one facade atlas (albedo + wall / accent tint classes, and a half-resolution packed normal / roughness / glass map),
// one shader. Geometry is merged into spatial tiles with real bounding boxes: detail tiles (240 m) are drawn near the eye only,
// and every building also has a cheap proxy (walls, roof, silhouette) in larger tiles drawn behind them (polygon offset) and on its
// own beyond the detail range - a two-level HLOD that costs a few dozen draw calls. Only detail tiles near the eye cast shadows.
// Deterministic (hashed), built once at load.
window.EI = window.EI || {};
(function () {
  const U = EI.U, Env = EI.Env;
  const City = EI.EnvCity = {};
  const C = Env.C;
  const hash = (a, b, s) => Env.hash2(Math.floor(a), Math.floor(b), s || 0);

  // ================================================================ polygon helpers (x, z pairs)
  const area2 = (p) => { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1]; return a; };
  const centroid = (p) => { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; };
  // drop duplicate / collinear vertices; returns a ring with positive area2 (outward normal of edge a->b is (dz, -dx))
  function cleanRing(p) {
    let q = []; for (const v of p) { const l = q[q.length - 1]; if (!l || Math.hypot(v[0] - l[0], v[1] - l[1]) > 0.3) q.push([v[0], v[1]]); }
    if (q.length > 2 && Math.hypot(q[0][0] - q[q.length - 1][0], q[0][1] - q[q.length - 1][1]) < 0.3) q.pop();
    for (let it = 0; it < 2 && q.length > 3; it++) { const r = []; for (let i = 0; i < q.length; i++) { const a = q[(i + q.length - 1) % q.length], b = q[i], c = q[(i + 1) % q.length]; const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]); const l = Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(c[0] - b[0], c[1] - b[1]); if (Math.abs(cr) > l * 0.02 || r.length + (q.length - i) <= 3) r.push(b); } q = r; }
    if (area2(q) < 0) q.reverse(); return q;
  }
  // inset (d > 0) / outset (d < 0) by mitred offsets; null when the result folds over
  function offsetRing(p, d, loose) {
    const n = p.length, out = [];
    for (let i = 0; i < n; i++) {
      const a = p[(i + n - 1) % n], b = p[i], c = p[(i + 1) % n];
      let d1x = b[0] - a[0], d1z = b[1] - a[1], d2x = c[0] - b[0], d2z = c[1] - b[1]; const l1 = Math.hypot(d1x, d1z) || 1, l2 = Math.hypot(d2x, d2z) || 1; d1x /= l1; d1z /= l1; d2x /= l2; d2z /= l2;
      const n1x = -d1z, n1z = d1x, n2x = -d2z, n2z = d2x; let mx = n1x + n2x, mz = n1z + n2z; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
      const cosh = mx * n1x + mz * n1z; const k = d / Math.max(0.35, cosh); out.push([b[0] + mx * k, b[1] + mz * k]);
    }
    if (d > 0 && !loose) { const a0 = area2(p), a1 = area2(out); if (a1 <= 0 || a1 > a0) return null; for (let i = 0; i < n; i++) { const e0x = p[(i + 1) % n][0] - p[i][0], e0z = p[(i + 1) % n][1] - p[i][1], e1x = out[(i + 1) % n][0] - out[i][0], e1z = out[(i + 1) % n][1] - out[i][1]; if (e0x * e1x + e0z * e1z < 0) return null; } }
    return out;
  }
  // outset by d with rounded convex corners (balcony bands wrapping a tower): returns { ring, src } where src[k] is the index of the
  // footprint vertex each outset point belongs to (several points per rounded corner)
  function roundOutset(p, d, segs) {
    const n = p.length, out = [], src = [];
    for (let i = 0; i < n; i++) {
      const a = p[(i + n - 1) % n], b = p[i], c = p[(i + 1) % n];
      let d1x = b[0] - a[0], d1z = b[1] - a[1], d2x = c[0] - b[0], d2z = c[1] - b[1]; const l1 = Math.hypot(d1x, d1z) || 1, l2 = Math.hypot(d2x, d2z) || 1; d1x /= l1; d1z /= l1; d2x /= l2; d2z /= l2;
      const o1x = d1z, o1z = -d1x, o2x = d2z, o2z = -d2x; const cr = d1x * d2z - d1z * d2x;
      if (cr > 0.05 && segs > 0) {   // convex corner (left turn on a positive ring): arc from the outward normal of edge 1 to edge 2
        const a0 = Math.atan2(o1z, o1x); let a1 = Math.atan2(o2z, o2x); while (a1 < a0) a1 += Math.PI * 2; if (a1 - a0 > Math.PI) a1 -= Math.PI * 2;
        for (let k = 0; k <= segs; k++) { const t = a0 + (a1 - a0) * k / segs; out.push([b[0] + Math.cos(t) * d, b[1] + Math.sin(t) * d]); src.push(i); }
      } else { let mx = o1x + o2x, mz = o1z + o2z; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml; const k = d / Math.max(0.35, mx * o1x + mz * o1z); out.push([b[0] + mx * k, b[1] + mz * k]); src.push(i); }
    }
    return { ring: out, src };
  }
  // oriented bounding box: { cx, cz, ux, uz, hl, hw }
  function obb(p) {
    let best = null;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length]; let ux = b[0] - a[0], uz = b[1] - a[1]; const l = Math.hypot(ux, uz); if (l < 0.5) continue; ux /= l; uz /= l;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity; for (const q of p) { const s = q[0] * ux + q[1] * uz, t = -q[0] * uz + q[1] * ux; a0 = Math.min(a0, s); a1 = Math.max(a1, s); b0 = Math.min(b0, t); b1 = Math.max(b1, t); }
      const ar = (a1 - a0) * (b1 - b0); if (!best || ar < best.ar) best = { ar, ux, uz, a0, a1, b0, b1 };
    }
    if (!best) return null; const sa = (best.a0 + best.a1) / 2, sb = (best.b0 + best.b1) / 2; let hl = (best.a1 - best.a0) / 2, hw = (best.b1 - best.b0) / 2; let ux = best.ux, uz = best.uz;
    const cx = sa * ux - sb * uz, cz = sa * uz + sb * ux; if (hw > hl) { const t = hl; hl = hw; hw = t; const nx = -uz, nz = ux; ux = nx; uz = nz; }
    return { cx, cz, ux, uz, hl, hw, ar: best.ar };
  }
  const rectRing = (cx, cz, ux, uz, hl, hw) => cleanRing([[cx - ux * hl + uz * hw, cz - uz * hl - ux * hw], [cx + ux * hl + uz * hw, cz + uz * hl - ux * hw], [cx + ux * hl - uz * hw, cz + uz * hl + ux * hw], [cx - ux * hl - uz * hw, cz - uz * hl + ux * hw]]);
  const pip = (x, z, p) => U.pointInPoly(x, z, p);

  // ================================================================ facade atlas
  // 8 x 16 cells of 256 px in a 2048 x 4096 albedo atlas; each cell holds a 224 px tile (one bay x one storey, or a material swatch)
  // with a 16 px wrapped gutter so tiling and mipmaps stay clean down to 1/32 scale (beyond that the shader fades to the cell's
  // average colour, read from the 1-texel-per-cell mip). Albedo A = tint class: 1 wall colour, 0.5 untinted, 0 accent colour.
  // The packed map (half resolution) holds the normal (RG, from a painted height layer), roughness (B) and glass (A: 1 glazing,
  // 0.5 a lit interior). A cavity term from the height layer darkens the albedo in reveals and joints.
  const AW = 2048, AH = 4096, CS = 256, GUT = 16, IN = 224, NROW = AH / CS;
  const CELLS = {}, DEF = [];
  const def = (name, row, col, fns) => { CELLS[name] = [col, row, fns.length]; fns.forEach((fn, k) => DEF.push([col + k, row, fn])); };
  const TW = 1, TN = 0, TA = 2;          // tint classes: wall colour, none, accent colour
  const css = (c) => typeof c === 'string' ? c : 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
  const gray = (v) => { v = Math.round(U.clamp(v, 0, 255)); return 'rgb(' + v + ',' + v + ',' + v + ')'; };
  // a paint: albedo, tint class, roughness, glass (1 glazing, 0.5 lit interior), relief height (0.5 = the wall plane)
  const sp = (c, k, r, g, h) => ({ c, k: k == null ? TW : k, r: r == null ? 0.88 : r, g: g || 0, h: h == null ? 0.5 : h });
  const RENDER = [238, 234, 226], TRIM = [244, 240, 230], ALU = [200, 204, 206], ACCB = [226, 226, 222];
  const Hh = { wall: 0.5, reveal: 0.34, frame: 0.42, glass: 0.28, sill: 0.7, shut: 0.62, trim: 0.64, corn: 0.8, awn: 0.88, deep: 0.12 };
  const wallP = (c, h) => sp(c || RENDER, TW, 0.9, 0, h == null ? Hh.wall : h);
  const trimP = (c, h, r) => sp(c || TRIM, TN, r == null ? 0.72 : r, 0, h == null ? Hh.trim : h);
  const accP = (h, c, r) => sp(c || ACCB, TA, r == null ? 0.62 : r, 0, h == null ? Hh.shut : h);
  const darkP = (c, h, r) => sp(c, TN, r == null ? 0.8 : r, 0, h == null ? Hh.reveal : h);
  // four tileable noise tiles (grey 128 mean, speckles of 1-3 px), shared by every cell
  const NOISE = [];
  function noiseTile(seed) {
    const k = seed & 3; if (NOISE[k]) return NOISE[k];
    const [c, ctx] = Env.canvas(IN, IN); const img = ctx.createImageData(IN, IN); const d = img.data; const r = U.rng(9100 + k * 31); const f = new Float32Array(IN * IN);
    for (let i = 0; i < f.length; i++) f[i] = r() - 0.5;
    for (let n = 0; n < IN * IN / 9; n++) { const x = (r() * IN) | 0, y = (r() * IN) | 0, v = (r() - 0.5) * 1.6, w = 1 + (r() * 3 | 0); for (let yy = 0; yy < w; yy++) for (let xx = 0; xx < w; xx++) f[((y + yy) % IN) * IN + (x + xx) % IN] += v; }
    for (let i = 0; i < f.length; i++) { const v = U.clamp(128 + f[i] * 90, 0, 255); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
    ctx.putImageData(img, 0, 0); return (NOISE[k] = c);
  }
  function Painter() { const mk = () => Env.canvas(IN, IN); [this.ca, this.a] = mk(); [this.ct, this.t] = mk(); [this.cm, this.m] = mk(); [this.ch, this.h] = mk(); }
  Painter.prototype = {
    fill(path, s) {
      const tv = s.k === TA ? 0 : s.k === TN ? 128 : 255; const r = Math.round(s.r * 255), g = Math.round(s.g * 255);
      for (const [ctx, st] of [[this.a, css(s.c)], [this.t, gray(tv)], [this.m, 'rgb(' + r + ',' + g + ',0)'], [this.h, gray(s.h * 255)]]) { ctx.fillStyle = st; ctx.beginPath(); path(ctx); ctx.fill(); }
    },
    rect(x, y, w, h, s) { this.fill(c => c.rect(x, y, w, h), s); },
    ell(x, y, rx, ry, s) { this.fill(c => c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, 6.2832), s); },
    clear(s) { this.rect(0, 0, IN, IN, s); },
    // albedo-only overlays (shading, grain, curtains) and height-only overlays (grooves, stucco)
    shade(fn) { this.a.save(); fn(this.a); this.a.restore(); },
    bump(fn) { this.h.save(); fn(this.h); this.h.restore(); },
    hrect(x, y, w, h, v) { this.h.fillStyle = gray(v * 255); this.h.fillRect(x, y, w, h); },
    vgrad(x, y, w, h, stops) { this.shade(c => { const gr = c.createLinearGradient(0, y, 0, y + h); for (const [o, s] of stops) gr.addColorStop(o, s); c.fillStyle = gr; c.fillRect(x, y, w, h); }); },
    // speckle (albedo) and stucco relief (height): one draw of a shared noise tile, overlaid (mean preserving)
    grain(n, a, seed) { const k = Math.min(1, a * Math.sqrt(n / 1500) * 1.7); this.shade(c => { c.globalCompositeOperation = 'overlay'; c.globalAlpha = k; c.drawImage(noiseTile(seed || 7), 0, 0); }); },
    stucco(n, amp, seed) { const k = Math.min(1, amp * Math.sqrt(n / 1500) * 4); this.bump(c => { c.globalCompositeOperation = 'overlay'; c.globalAlpha = k; c.drawImage(noiseTile((seed || 5) + 1), 0, 0); }); },
    // weathering: soft dirt streaks running down from a ledge
    streaks(x, y, w, len, a, seed) { const r = U.rng(seed || 3); this.shade(c => { for (let i = 0; i < w / 6; i++) { const sx = x + r() * w, sl = len * (0.4 + r() * 0.6); const g = c.createLinearGradient(0, y, 0, y + sl); g.addColorStop(0, 'rgba(70,60,50,' + (a * (0.5 + r() * 0.5)).toFixed(3) + ')'); g.addColorStop(1, 'rgba(70,60,50,0)'); c.fillStyle = g; c.fillRect(sx, y, 2 + r() * 5, sl); } }); },
  };
  const aoTop = (p, y, h, a, x, w) => p.shade(c => { const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(20,16,12,' + a + ')'); g.addColorStop(1, 'rgba(20,16,12,0)'); c.fillStyle = g; c.fillRect(x || 0, y, w || IN, h); });
  const joints = (p, rows, a, depth) => { p.shade(c => { c.fillStyle = 'rgba(60,50,40,' + (a || 0.18) + ')'; for (let k = 1; k < rows; k++) c.fillRect(0, IN * k / rows - 1, IN, 2); }); if (depth) p.bump(c => { c.fillStyle = gray(255 * (0.5 - depth)); for (let k = 1; k < rows; k++) c.fillRect(0, IN * k / rows - 1, IN, 2); }); };

  // ---- reusable elements (tile pixels; the tile is one bay wide, one storey tall)
  // dark glazing with a faint sky sheen and the room behind it (curtains, a lamp, furniture shadows)
  function glass(p, x, y, w, h, o) {
    o = o || {}; const r = U.rng(o.seed || (x * 7 + y * 13 + w));
    const lt = o.light ? 1 : 0; p.rect(x, y, w, h, sp(lt ? [78, 96, 110] : [40, 47, 54], TN, 0.06, 1, Hh.glass));
    p.vgrad(x, y, w, h, lt ? [[0, 'rgba(190,210,224,0.5)'], [0.5, 'rgba(120,140,156,0.25)'], [1, 'rgba(40,50,60,0.15)']] : [[0, 'rgba(150,170,186,0.42)'], [0.42, 'rgba(84,98,110,0.18)'], [1, 'rgba(10,12,16,0.12)']]);
    if (o.room !== false) p.shade(c => {
      // back wall and ceiling of the room, a lamp, furniture silhouettes
      c.fillStyle = 'rgba(160,140,112,' + (0.10 + r() * 0.12).toFixed(2) + ')'; c.fillRect(x, y + h * 0.15, w, h * 0.55);
      if (r() < 0.4) { c.fillStyle = 'rgba(255,226,170,0.35)'; c.fillRect(x + w * (0.2 + r() * 0.5), y + h * 0.12, w * 0.12, 3); }
      c.fillStyle = 'rgba(20,18,16,0.25)'; for (let i = 0; i < 2; i++) c.fillRect(x + r() * w * 0.7, y + h * (0.55 + r() * 0.2), w * (0.15 + r() * 0.2), h * 0.3);
    });
    p.shade(c => { c.fillStyle = 'rgba(255,255,255,0.07)'; c.beginPath(); c.moveTo(x + w * 0.1, y); c.lineTo(x + w * 0.38, y); c.lineTo(x + w * 0.12, y + h); c.lineTo(x - w * 0.16, y + h); c.closePath(); c.fill(); });
    if (o.curtains !== false) curtains(p, x, y, w, h, o.seed || (x + y * 3));
  }
  function curtains(p, x, y, w, h, seed) {
    const r = U.rng(seed); const pal = [[236, 230, 214], [226, 220, 204], [214, 200, 176], [238, 236, 232], [200, 186, 160], [180, 150, 120]]; const col = pal[(r() * pal.length) | 0];
    p.shade(c => { for (let i = 0; i < 2; i++) { if (r() < 0.35) continue; const cw = w * (0.18 + r() * 0.32); const cx = i ? x + w - cw : x; c.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0.72)'; c.fillRect(cx, y + 2, cw, h - 4); c.fillStyle = 'rgba(0,0,0,0.08)'; for (let k = cx + 3; k < cx + cw; k += 6) c.fillRect(k, y + 2, 2, h - 4); } });
  }
  function frame(p, x, y, w, h, t, col, mull, k) {
    const s = sp(col || ALU, k == null ? TN : k, 0.45, 0, Hh.frame);
    p.rect(x, y, w, t, s); p.rect(x, y + h - t, w, t, s); p.rect(x, y, t, h, s); p.rect(x + w - t, y, t, h, s);
    if (mull) for (let i = 1; i < mull; i++) p.rect(x + w * i / mull - t / 2, y, t, h, s);
  }
  // the opening in the wall: reveal faces (a little darker, recessed), the lintel's shadow
  function reveal(p, x, y, w, h, d, col) {
    p.rect(x - d, y - d, w + 2 * d, h + 2 * d, sp(col || [196, 190, 180], TW, 0.9, 0, Hh.reveal));
    p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.30)'; c.fillRect(x - d, y - d, w + 2 * d, d + 3); c.fillStyle = 'rgba(0,0,0,0.16)'; c.fillRect(x - d, y - d, d + 1, h + 2 * d); });
  }
  function sill(p, x, y, w, col) { p.rect(x, y, w, 6, trimP(col, Hh.sill, 0.6)); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(x + 2, y + 6, w - 4, 5); }); p.streaks(x + 4, y + 10, w - 8, 26, 0.10, x + y); }
  // louvred shutter leaf in the accent colour
  function louvre(p, x, y, w, h, closedSplit) {
    p.rect(x, y, w, h, accP(Hh.shut));
    p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.26)'; for (let k = y + 5; k < y + h - 3; k += 5) c.fillRect(x + 2, k, w - 4, 1.6); c.fillStyle = 'rgba(255,255,255,0.14)'; for (let k = y + 7; k < y + h - 3; k += 5) c.fillRect(x + 2, k, w - 4, 1); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x, y, 1.5, h); c.fillRect(x + w - 1.5, y, 1.5, h); });
    p.bump(c => { c.fillStyle = gray(255 * (Hh.shut - 0.08)); for (let k = y + 5; k < y + h - 3; k += 5) c.fillRect(x + 2, k, w - 4, 2); });
    if (closedSplit) p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x + w / 2 - 0.8, y, 1.6, h); });
  }
  function roller(p, x, y, w, h, col) {
    p.rect(x, y, w, h, sp(col || [222, 214, 196], TN, 0.7, 0, Hh.frame + 0.02));
    p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.16)'; for (let k = y + 3; k < y + h; k += 4) c.fillRect(x, k, w, 1.2); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x, y + h - 3, w, 3); });
    p.bump(c => { c.fillStyle = gray(255 * (Hh.frame - 0.04)); for (let k = y + 3; k < y + h; k += 4) c.fillRect(x, k, w, 1.2); });
  }
  function ironRail(p, x, y, w, h, ornate, accent) {
    const s = accent ? accP(0.66, [70, 72, 74], 0.5) : sp([34, 36, 38], TN, 0.5, 0, 0.66);
    p.rect(x, y, w, 3, s); p.rect(x, y + h - 3, w, 3, s);
    for (let k = x + 3; k < x + w - 2; k += ornate ? 7 : 6) p.rect(k, y, 1.8, h, s);
    if (ornate) for (let k = x + 9; k < x + w - 8; k += 14) { p.ell(k, y + h * 0.5, 4.5, h * 0.28, s); p.ell(k, y + h * 0.5, 2.6, h * 0.18, sp([60, 56, 50], TN, 0.9, 0, Hh.reveal)); }
  }
  // striped canvas awning seen from the front, scalloped valance, shadow beneath (stripes alternate accent / cream)
  function awning(p, x, y, w, h, stripes, plain) {
    const n = stripes || 8;
    for (let k = 0; k < n; k++) p.fill(c => { c.moveTo(x + w * k / n, y); c.lineTo(x + w * (k + 1) / n, y); c.lineTo(x + w * (k + 1) / n + 2, y + h); c.lineTo(x + w * k / n - 2, y + h); c.closePath(); }, k % 2 && !plain ? sp([238, 232, 216], TN, 0.9, 0, Hh.awn) : accP(Hh.awn, [214, 214, 210], 0.9));
    p.vgrad(x - 2, y, w + 4, h, [[0, 'rgba(255,255,255,0.18)'], [1, 'rgba(0,0,0,0.14)']]);
    for (let k = 0; k < n * 2; k++) p.fill(c => { c.ellipse(x + w * (k + 0.5) / (n * 2), y + h, w / (n * 4), 3.5, 0, 0, Math.PI); }, k % 4 < 2 || plain ? accP(Hh.awn, [214, 214, 210], 0.9) : sp([238, 232, 216], TN, 0.9, 0, Hh.awn));
    p.shade(c => { const g = c.createLinearGradient(0, y + h, 0, y + h + 34); g.addColorStop(0, 'rgba(0,0,0,0.42)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x, y + h + 3, w, 34); });
  }
  function plants(p, x, y, w, seed) {
    const r = U.rng(seed); p.rect(x, y - 14, w, 14, sp([170, 96, 64], TN, 0.9, 0, 0.62));
    for (let i = 0; i < w / 9; i++) { const px = x + r() * w, pr = 6 + r() * 9; p.ell(px, y - 14 - pr * 0.6, pr, pr * 0.9, sp([54 + r() * 30, 82 + r() * 36, 40 + r() * 16], TN, 0.95, 0, 0.66 + r() * 0.08)); }
    p.shade(c => { for (let i = 0; i < 14; i++) { c.fillStyle = r() < 0.5 ? 'rgba(220,60,90,0.8)' : 'rgba(250,250,240,0.7)'; c.beginPath(); c.arc(x + r() * w, y - 18 - r() * 16, 1.6 + r() * 1.6, 0, 6.283); c.fill(); } });
  }
  // a generic window with optional surround, lintel ornament, sill, shutters, balconette, roller shutter
  function win(p, x, y, w, h, o) {
    o = o || {}; const fc = o.fc || [236, 236, 230];
    if (o.surround) { const s = o.surround; p.rect(x - s - 4, y - s - 4, w + 2 * s + 8, h + 2 * s + 8, trimP(o.trimC)); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(x - s - 4, y + h + s + 4, w + 2 * s + 8, 3); }); }
    if (o.lintel === 'pediment') { p.fill(c => { c.moveTo(x - 14, y - 10); c.lineTo(x + w / 2, y - 32); c.lineTo(x + w + 14, y - 10); c.closePath(); }, trimP(o.trimC, Hh.corn)); p.rect(x - 16, y - 12, w + 32, 6, trimP(o.trimC, Hh.corn)); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x - 16, y - 6, w + 32, 4); }); }
    else if (o.lintel === 'arch') { p.fill(c => { c.ellipse(x + w / 2, y - 6, w / 2 + 12, 16, 0, Math.PI, 0); }, trimP(o.trimC, Hh.corn)); p.rect(x + w / 2 - 6, y - 24, 12, 18, trimP(o.trimC, Hh.corn + 0.06)); }
    else if (o.lintel === 'cornice') { p.rect(x - 12, y - 14, w + 24, 8, trimP(o.trimC, Hh.corn)); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(x - 12, y - 6, w + 24, 4); }); }
    reveal(p, x, y, w, h, o.d || 5, o.revC);
    glass(p, x, y, w, h, { seed: o.seed, curtains: o.curtains });
    frame(p, x, y, w, h, o.ft || 4, fc, o.mull == null ? 2 : o.mull);
    if (o.transom) p.rect(x, y + h * 0.24, w, 3, sp(fc, TN, 0.45, 0, Hh.frame));
    if (o.roller) roller(p, x, y, w, h * o.roller);
    if (o.sill !== false) sill(p, x - 6, y + h, w + 12, o.trimC);
    if (o.shutters === 'open') { const sw = Math.min(w / 2, o.shutW || w / 2 - 2); louvre(p, x - sw - 6, y, sw, h); louvre(p, x + w + 6, y, sw, h); }
    else if (o.shutters === 'closed') { louvre(p, x, y, w / 2, h, false); louvre(p, x + w / 2, y, w / 2, h, false); }
    else if (o.shutters === 'half') { louvre(p, x, y, w / 2, h, false); louvre(p, x + w + 6, y, w / 2 - 2, h); }
    if (o.rail) ironRail(p, x - 4, y + h - (o.railH || 42), w + 8, o.railH || 42, o.rail === 'ornate', o.railAcc);
  }

  // race-day spectators standing on a balcony (F1 photos 051 / 054: the balconies along the circuit are packed): heads and shoulders over
  // the parapet line (the slab and parapet in front are geometry or painted), shirts in team colours, a cap or a raised arm now and then
  function spectators(p, x0, w, seed) {
    const r = U.rng(seed); const n = 2 + Math.floor(r() * 3); const SK = [[236, 196, 168], [214, 168, 132], [178, 128, 96], [120, 84, 62], [244, 214, 190]];
    const SH = [[226, 30, 40], [250, 250, 248], [24, 32, 64], [120, 170, 220], [30, 30, 32], [244, 200, 40], [0, 130, 120], [250, 120, 30], [200, 40, 60], [236, 236, 230]];
    for (let k = 0; k < n; k++) {
      const cx = x0 + (k + 0.5 + (r() - 0.5) * 0.5) * w / n, hy = 96 + r() * 14, sk = SK[(r() * SK.length) | 0], sh = SH[(r() * SH.length) | 0];
      if (r() < 0.25) { const ax = cx + (r() < 0.5 ? -14 : 14); p.rect(ax - 3, hy - 34, 7, 50, sp(sh, TN, 0.85, 0, 0.6)); p.ell(ax, hy - 36, 5, 5, sp(sk, TN, 0.8, 0, 0.62)); }
      p.fill(c => { c.moveTo(cx - 20, 150); c.lineTo(cx - 17, hy + 16); c.quadraticCurveTo(cx, hy + 9, cx + 17, hy + 16); c.lineTo(cx + 20, 150); c.closePath(); }, sp(sh, TN, 0.85, 0, 0.6));
      p.rect(cx - 4, hy + 6, 8, 8, sp(sk.map(v => v * 0.85), TN, 0.8, 0, 0.61)); p.ell(cx, hy, 8, 9.5, sp(sk, TN, 0.8, 0, 0.63));
      const hair = r() < 0.3 ? sh : [[40, 30, 24], [90, 64, 40], [190, 160, 110], [30, 28, 28], [150, 150, 150]][(r() * 5) | 0];
      if (r() < 0.3) p.rect(cx - 9, hy - 10, 18, 7, sp(hair, TN, 0.8, 0, 0.65)); else p.ell(cx, hy - 5, 8.5, 5, sp(hair, TN, 0.9, 0, 0.64));
      p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(cx + 6, hy + 18, 12, 40); });
    }
  }
  // ================================================================ the cells
  // ---------------- row 0: the wall behind a balcony (Riviera apartments, bay 3.4 m x storey 3.0 m) - sliding doors, eight states;
  // the balcony slab and parapet in front are geometry
  function rvBack(p, v, paintedRail) {
    p.clear(wallP()); p.grain(1500, 0.045, 11 + v); p.stucco(1600, 0.05, 21 + v);
    const x = 24, y = 50, w = 176, h = 174;
    if (v === 5) {   // a bedroom window and a stretch of wall
      win(p, 52, 62, 92, 112, { seed: 40 + v, roller: 0.45, sill: false, mull: 2 }); plants(p, 150, 222, 50, 9);
    } else {
      reveal(p, x, y, w, h, 5); glass(p, x, y, w, h, { seed: 30 + v, curtains: v !== 2 });
      frame(p, x, y, w, h, 5, ALU, 3);
      if (v === 1) roller(p, x, y, w, h * 0.62);
      if (v === 2) { p.shade(c => { c.fillStyle = 'rgba(10,8,6,0.55)'; c.fillRect(x + w * 0.36, y + 6, w * 0.3, h - 8); }); plants(p, x + 6, 222, 60, 3 + v); plants(p, x + w - 66, 222, 60, 4 + v); }
      if (v === 3) { louvre(p, x + 2, y + 2, w / 3 - 2, h - 2, false); louvre(p, x + w / 3 + 1, y + 2, w / 3 - 2, h - 2, false); }
      if (v === 4) { p.rect(x, y, w, h * 0.7, sp([228, 224, 212], TN, 0.75, 0, Hh.frame)); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.12)'; for (let k = y + 2; k < y + h * 0.7; k += 4) c.fillRect(x, k, w, 1.2); }); }
      if (v === 6) { roller(p, x, y, w * 0.34, h * 0.9); curtains(p, x + w * 0.34, y, w * 0.66, h, 77); }
      if (v === 7) { p.shade(c => { c.fillStyle = 'rgba(250,250,246,0.85)'; c.fillRect(x + w * 0.55, y + 30, 26, 70); c.fillStyle = 'rgba(70,110,160,0.8)'; c.fillRect(x + w * 0.55 + 30, y + 34, 22, 60); }); }
    }
    if (v === 0 || v === 3 || v === 6) spectators(p, 12, IN - 24, 901 + v * 17);
    // the slab above: soffit shadow; a drip line where the balcony floor meets the wall
    aoTop(p, 0, 62, 0.42); p.rect(0, 0, IN, 8, wallP([226, 222, 214], 0.56));
    p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(0, 216, IN, 8); });
    if (paintedRail) paintedRail(p, v);
  }
  def('rvb', 0, 0, [0, 1, 2, 3, 4, 5, 6, 7].map(v => (p) => rvBack(p, v)));
  // painted balconies (mid range and proxies): the slab edge and a parapet over the same wall; awnings in the accent colour
  const railSolid = (k) => (p, v) => {
    if (v === 1 || v === 3) awning(p, 12, 6, 200, v === 3 ? 120 : 52, 10);
    p.rect(0, 140, IN, 72, sp(k === TW ? RENDER : [246, 245, 242], k, 0.85, 0, 0.76)); p.vgrad(0, 140, IN, 72, [[0, 'rgba(255,255,255,0.18)'], [1, 'rgba(0,0,0,0.08)']]); p.rect(0, 136, IN, 6, sp(k === TW ? RENDER : [252, 252, 250], k, 0.6, 0, 0.82));
    p.rect(0, 210, IN, 14, sp([248, 246, 242], TN, 0.8, 0, 0.8)); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(0, 220, IN, 4); }); p.streaks(0, 224, IN, 4, 0.1, v);
  };
  const railGlass = (p, v) => {
    if (v === 1 || v === 3) awning(p, 12, 6, 200, v === 3 ? 120 : 52, 10);
    glass(p, 0, 140, IN, 70, { room: false, curtains: false, seed: 9 }); p.shade(c => { c.fillStyle = 'rgba(200,214,210,0.28)'; c.fillRect(0, 140, IN, 70); });
    p.rect(0, 134, IN, 7, accP(0.84, [214, 216, 218], 0.35)); for (let k = 0; k < IN; k += 74) p.rect(k, 140, 4, 70, accP(0.8, [200, 202, 204], 0.35));
    p.rect(0, 210, IN, 14, sp([248, 246, 242], TN, 0.8, 0, 0.8)); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(0, 220, IN, 4); });
  };
  def('rvbW', 1, 0, [0, 1, 4, 3].map(v => (p) => rvBack(p, v, railSolid(TN))));
  def('rvbG', 1, 4, [0, 1, 4, 3].map(v => (p) => rvBack(p, v, railGlass)));
  def('rvbT', 2, 0, [0, 1, 4, 3].map(v => (p) => rvBack(p, v, railSolid(TW))));
  // ---------------- row 2: punched windows (the side walls of the towers), the top floor under the roof parapet
  const rvWin = (v) => (p) => {
    p.clear(wallP()); p.grain(1400, 0.05, 13 + v); p.stucco(1500, 0.05, 23 + v);
    if (v === 0) win(p, 62, 50, 100, 128, { seed: 5, shutters: 'open', shutW: 40, mull: 2 });
    else if (v === 1) win(p, 62, 50, 100, 128, { seed: 6, roller: 0.55, mull: 2 });
    else { win(p, 30, 56, 70, 118, { seed: 7, mull: 1 }); win(p, 124, 56, 70, 118, { seed: 8, mull: 1, roller: 0.3 }); }
    p.streaks(0, 190, IN, 30, 0.05, 31 + v);
  };
  def('rv_win', 2, 4, [rvWin(0), rvWin(1), rvWin(2)]);
  def('rv_top', 2, 7, [(p) => {
    p.clear(wallP()); p.grain(1200, 0.05, 21); p.stucco(1200, 0.05, 22);
    win(p, 34, 82, 156, 112, { seed: 23, mull: 3, sill: false }); aoTop(p, 56, 26, 0.3);
    p.rect(0, 0, IN, 52, wallP(RENDER, 0.56)); p.rect(0, 48, IN, 7, trimP([246, 244, 238], 0.74)); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.26)'; c.fillRect(0, 55, IN, 5); });
    p.streaks(0, 60, IN, 40, 0.08, 24);
  }]);
  // ---------------- row 3: ground floors - shops with their signs and lit interiors, lobbies (bay 3.4 m x 4.2 m)
  function shopFront(p, v) {
    const r = U.rng(400 + v);
    p.clear(wallP([222, 216, 206])); p.grain(1500, 0.06, 401 + v); p.stucco(1500, 0.05, 402 + v);
    // stone plinth band and the fascia over the shop
    p.rect(0, 206, IN, 18, sp([176, 168, 156], TN, 0.7, 0, 0.6)); joints(p, 1, 0.1);
    const x = 14, y = 74, w = 196, h = 132;
    reveal(p, x, y, w, h, 4, [120, 116, 110]);
    // the lit interior: back wall, shelves with goods, ceiling lights
    const back = [[178, 166, 146], [196, 204, 200], [150, 138, 122], [184, 160, 132], [170, 172, 170], [160, 140, 118]][v % 6];   // (muted: shop glass reads dark from the street, MONACO-UPGRADE)
    p.rect(x, y, w, h, sp(back, TN, 0.4, 0.5, Hh.glass));
    p.shade(c => {
      for (let s = 0; s < 3; s++) { c.fillStyle = 'rgba(90,70,50,0.35)'; c.fillRect(x + 6, y + 30 + s * 30, w - 12, 3); for (let i = 0; i < 12; i++) { c.fillStyle = 'hsla(' + ((r() * 360) | 0) + ',16%,' + (28 + r() * 26 | 0) + '%,0.55)'; c.fillRect(x + 8 + r() * (w - 24), y + 14 + s * 30, 5 + r() * 8, 14); } }
      c.fillStyle = 'rgba(255,248,226,0.9)'; for (let i = 0; i < 4; i++) c.fillRect(x + 18 + i * 48, y + 4, 22, 3);
      c.fillStyle = 'rgba(40,30,24,0.4)'; for (let i = 0; i < 2; i++) c.fillRect(x + 30 + r() * (w - 80), y + h - 52, 36, 52);   // a counter, a display
      const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(160,180,196,0.32)'); g.addColorStop(0.5, 'rgba(255,255,255,0.0)'); g.addColorStop(1, 'rgba(0,0,0,0.12)'); c.fillStyle = g; c.fillRect(x, y, w, h);
    });
    frame(p, x, y, w, h, 5, v === 2 ? [40, 40, 42] : [70, 72, 76], v === 0 ? 3 : 2);
    p.rect(x + w / 2 - 18, y + 30, 36, h - 30, sp([60, 64, 68], TN, 0.4, 1, Hh.glass + 0.02)); frame(p, x + w / 2 - 18, y + 30, 36, h - 30, 3, [50, 52, 56]);  // the door
    // fascia and sign
    const signs = ['CAFE', 'PHARMACIE', 'BOUTIQUE', 'RESTAURANT', 'IMMOBILIER', 'TABAC'];
    const band = [[40, 46, 52], [236, 236, 230], [24, 24, 26], [120, 28, 34], [44, 64, 92], [196, 40, 40]][v];
    const ink = [[236, 222, 180], [30, 120, 70], [214, 186, 120], [246, 236, 210], [240, 240, 236], [250, 250, 246]][v];
    p.rect(0, 30, IN, 40, sp(band, TN, 0.5, 0, 0.62)); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 68, IN, 4); c.fillStyle = css(ink); c.font = 'bold ' + (signs[v].length > 8 ? 21 : 25) + 'px Arial, Helvetica, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(signs[v], IN / 2, 51); });
    if (v === 1) { p.rect(186, 8, 30, 30, sp([40, 170, 80], TN, 0.4, 0.5, 0.7)); p.rect(197, 12, 8, 22, sp([230, 255, 230], TN, 0.4, 0.5, 0.72)); p.rect(190, 19, 22, 8, sp([230, 255, 230], TN, 0.4, 0.5, 0.72)); }
    if (v === 5) p.fill(c => { c.moveTo(200, 4); c.lineTo(212, 16); c.lineTo(200, 28); c.lineTo(188, 16); c.closePath(); }, sp([200, 40, 40], TN, 0.4, 0.5, 0.72));
    p.rect(0, 0, IN, 30, wallP()); aoTop(p, 0, 14, 0.25);
  }
  def('shop', 3, 0, [0, 1, 2, 3, 4, 5].map(v => (p) => shopFront(p, v)));
  def('lobby', 3, 6, [(p) => {
    p.clear(wallP([226, 220, 210])); p.grain(1500, 0.06, 411); joints(p, 6, 0.12, 0.06);
    p.rect(0, 206, IN, 18, sp([150, 144, 136], TN, 0.5, 0, 0.6));
    const x = 54, y = 66, w = 116, h = 140; reveal(p, x, y, w, h, 6, [140, 132, 120]); glass(p, x, y, w, h, { seed: 412, curtains: false });
    p.shade(c => { c.fillStyle = 'rgba(255,236,190,0.4)'; c.fillRect(x, y, w, h * 0.4); }); frame(p, x, y, w, h, 6, [168, 136, 80], 2); p.rect(x, y + h * 0.3, w, 4, sp([168, 136, 80], TN, 0.35, 0, Hh.frame));
    // canopy over the entrance
    p.rect(30, 36, 164, 16, accP(0.86, [60, 64, 70], 0.4)); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(30, 52, 164, 14); c.fillStyle = '#e8e2d0'; c.font = 'bold 12px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('RESIDENCE', IN / 2, 44); });
    p.rect(0, 0, IN, 30, wallP());
  }, (p) => {
    p.clear(wallP([226, 220, 210])); p.grain(1500, 0.06, 413); joints(p, 6, 0.12, 0.06);
    p.rect(0, 206, IN, 18, sp([150, 144, 136], TN, 0.5, 0, 0.6));
    // garage door and a service door
    p.rect(20, 84, 130, 122, sp([170, 168, 160], TN, 0.6, 0, Hh.reveal)); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.18)'; for (let k = 88; k < 206; k += 8) c.fillRect(20, k, 130, 2); });
    p.bump(c => { c.fillStyle = gray(255 * (Hh.reveal - 0.05)); for (let k = 88; k < 206; k += 8) c.fillRect(20, k, 130, 2); });
    reveal(p, 168, 96, 40, 110, 4); p.rect(168, 96, 40, 110, accP(0.45, [120, 110, 96], 0.6)); p.rect(0, 0, IN, 40, wallP()); win(p, 166, 46, 44, 30, { seed: 414, sill: false, mull: 1 });
  }]);
  // ---------------- row 4: geometry faces of the balconies: parapets (u 2.4 m, v = parapet height), slab edges, awnings, plinths
  def('rail', 4, 0, [(p) => {      // solid render parapet with a coping
    p.clear(wallP()); p.grain(700, 0.04, 23); p.stucco(900, 0.05, 24); p.rect(0, 0, IN, 16, wallP(RENDER, 0.62)); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(0, 16, IN, 6); }); p.vgrad(0, 22, IN, 202, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.1)']]); p.streaks(0, 22, IN, 80, 0.07, 25);
  }, (p) => {                       // glass balustrade: tinted panes over the shaded balcony, handrail and posts in the accent colour
    p.clear(sp([70, 78, 80], TN, 0.06, 1, 0.42)); p.vgrad(0, 0, IN, IN, [[0, 'rgba(170,196,200,0.45)'], [0.6, 'rgba(90,110,112,0.25)'], [1, 'rgba(40,46,46,0.2)']]);
    p.shade(c => { c.fillStyle = 'rgba(30,26,22,0.35)'; c.fillRect(0, IN * 0.55, IN, IN * 0.45); c.fillStyle = 'rgba(255,255,255,0.10)'; c.beginPath(); c.moveTo(30, 20); c.lineTo(80, 20); c.lineTo(40, IN); c.lineTo(-10, IN); c.fill(); });
    p.rect(0, 0, IN, 22, accP(0.8, [214, 216, 218], 0.3)); p.shade(c => { c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(0, 2, IN, 4); });
    for (const k of [0, 110]) p.rect(k, 22, 8, IN - 22, accP(0.72, [206, 208, 210], 0.3)); p.rect(0, IN - 10, IN, 10, accP(0.7, [190, 192, 194], 0.4));
  }, (p) => {                       // steel bars over the shadowed balcony
    p.clear(sp([62, 58, 54], TN, 0.9, 0, 0.3)); p.vgrad(0, 0, IN, IN, [[0, 'rgba(0,0,0,0.05)'], [1, 'rgba(0,0,0,0.4)']]);
    p.shade(c => { c.fillStyle = 'rgba(200,190,170,0.18)'; c.fillRect(0, 30, IN, 90); });
    p.rect(0, 0, IN, 18, accP(0.8)); for (let k = 5; k < IN; k += 13) p.rect(k, 18, 4.5, IN - 30, accP(0.72)); p.rect(0, IN - 14, IN, 14, accP(0.74));
  }, (p) => {                       // solid parapet with a planter spilling over it
    p.clear(wallP()); p.grain(700, 0.04, 26); p.rect(0, 0, IN, 16, wallP(RENDER, 0.62)); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(0, 16, IN, 6); });
    const r = U.rng(27); for (let i = 0; i < 26; i++) { const x = r() * IN, rr = 10 + r() * 16; p.ell(x, 4 + r() * 30, rr, rr * 0.8, sp([50 + r() * 30, 80 + r() * 40, 36 + r() * 16], TN, 0.95, 0, 0.8)); }
    p.shade(c => { for (let i = 0; i < 40; i++) { c.fillStyle = ['rgba(220,40,90,0.9)', 'rgba(240,120,170,0.9)', 'rgba(250,250,240,0.8)'][(r() * 3) | 0]; c.beginPath(); c.arc(r() * IN, 6 + r() * 40, 2 + r() * 2, 0, 6.283); c.fill(); } });
  }]);
  def('slab', 4, 4, [(p) => { p.clear(wallP([244, 242, 238])); p.grain(800, 0.04, 28); p.stucco(800, 0.04, 29); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.08)'; c.fillRect(0, IN - 20, IN, 20); c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(0, 0, IN, 10); }); }]);
  def('awn', 4, 5, [(p) => {
    // awning canvas laid out flat: stripes run from the wall to the edge (v); a little sag shading across
    for (let k = 0; k < 8; k++) p.rect(k * 28, 0, 28, IN, k % 2 ? sp([238, 232, 214], TN, 0.9, 0, 0.5) : accP(0.5, [214, 214, 210], 0.9));
    p.shade(c => { for (let k = 0; k < IN; k += 56) { const g = c.createLinearGradient(k, 0, k + 56, 0); g.addColorStop(0, 'rgba(0,0,0,0.12)'); g.addColorStop(0.5, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0.12)'); c.fillStyle = g; c.fillRect(k, 0, 56, IN); } });
    p.bump(c => { for (let k = 0; k < IN; k += 56) { const g = c.createLinearGradient(k, 0, k + 56, 0); g.addColorStop(0, gray(110)); g.addColorStop(0.5, gray(150)); g.addColorStop(1, gray(110)); c.fillStyle = g; c.fillRect(k, 0, 56, IN); } });
  }]);
  def('awnb', 13, 0, [(p) => {
    // solid canvas awning (Boulevard Albert I blue: the colour comes from the accent), seams and a little sag shading across
    p.rect(0, 0, IN, IN, accP(Hh.awn, [236, 236, 232], 0.8)); p.rect(0, IN - 26, IN, 26, accP(Hh.awn, [214, 214, 210], 0.8));
    p.shade(c => { for (let k = 0; k < IN; k += 56) { const g = c.createLinearGradient(k, 0, k + 56, 0); g.addColorStop(0, 'rgba(0,0,0,0.14)'); g.addColorStop(0.5, 'rgba(255,255,255,0.1)'); g.addColorStop(1, 'rgba(0,0,0,0.14)'); c.fillStyle = g; c.fillRect(k, 0, 56, IN); } });
    p.bump(c => { for (let k = 0; k < IN; k += 56) { const g = c.createLinearGradient(k, 0, k + 56, 0); g.addColorStop(0, gray(110)); g.addColorStop(0.5, gray(150)); g.addColorStop(1, gray(110)); c.fillStyle = g; c.fillRect(k, 0, 56, IN); } });
  }]);
  def('loggia', 4, 6, [(p) => {
    // a recessed loggia: deep shade, the door at the back, a solid parapet painted at the front
    p.clear(wallP()); p.rect(10, 0, 204, 150, sp([110, 104, 96], TW, 0.9, 0, 0.18)); p.vgrad(10, 0, 204, 150, [[0, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0.25)']]);
    glass(p, 40, 30, 144, 120, { seed: 431 }); frame(p, 40, 30, 144, 120, 4, ALU, 2); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(40, 30, 144, 120); });
    p.rect(0, 150, IN, 74, wallP(RENDER, 0.56)); p.rect(0, 146, IN, 6, wallP(RENDER, 0.62)); p.grain(900, 0.04, 432);
  }]);
  def('plinth', 4, 7, [(p) => {
    p.clear(sp([196, 188, 176], TN, 0.8, 0, 0.5)); const r = U.rng(441);
    p.shade(c => { for (let y = 0; y < IN; y += 56) for (let x = (y / 56) % 2 ? -40 : 0; x < IN; x += 80) { const v = 0.85 + r() * 0.25; c.fillStyle = 'rgba(' + (196 * v | 0) + ',' + (186 * v | 0) + ',' + (172 * v | 0) + ',1)'; c.fillRect(x + 2, y + 2, 76, 52); } });
    p.bump(c => { c.fillStyle = gray(80); for (let y = 0; y < IN; y += 56) { c.fillRect(0, y, IN, 3); for (let x = (y / 56) % 2 ? -40 : 0; x < IN; x += 80) c.fillRect(x, y, 3, 56); } });
    p.grain(2400, 0.08, 442);
  }]);
  // ---------------- row 5: Belle Epoque stone (bay 3.6 m x storey 3.8 m)
  const STONE = [238, 230, 214];
  const beBase = (p, seed) => { p.clear(wallP(STONE)); p.grain(2600, 0.055, seed); p.stucco(2000, 0.05, seed + 1); joints(p, 6, 0.07, 0.03);
    // pilasters at the bay edges, with a shadow line each side
    for (const x of [0, IN - 16]) { p.rect(x, 0, 16, IN, wallP([246, 240, 228], 0.62)); } p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.13)'; c.fillRect(16, 0, 3, IN); c.fillRect(IN - 19, 0, 3, IN); }); };
  const beFloor = (kind) => (p) => {
    beBase(p, 31 + kind * 7);
    const x = 70, y = 44, w = 84, h = 150;
    win(p, x, y, w, h, { seed: 41 + kind, mull: 2, transom: true, fc: [242, 240, 232], surround: 8, trimC: [248, 244, 234], lintel: kind === 1 ? 'pediment' : kind === 2 ? 'cornice' : 'arch', shutters: kind === 2 ? 'closed' : null, rail: kind === 0 ? 'ornate' : 'iron', railH: 40, sill: false, d: 6 });
    if (kind !== 2) { louvre(p, x - 36, y, 22, h); louvre(p, x + w + 14, y, 22, h); }
    p.rect(x - 16, y + h + 8, w + 32, 7, trimP([248, 244, 234], Hh.sill)); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x - 14, y + h + 15, w + 28, 4); });
    p.streaks(x - 10, y + h + 18, w + 20, 30, 0.08, 51 + kind);
  };
  def('be_flr', 5, 0, [beFloor(0), beFloor(1), beFloor(2)]);
  def('be_piano', 5, 3, [(p) => {
    beFloor(1)(p);
    // stone balustrade of the continuous balcony (painted; near the circuit the slab is geometry)
    p.rect(0, 166, IN, 58, trimP([246, 240, 228], 0.7)); p.rect(0, 162, IN, 9, trimP([252, 248, 240], 0.8));
    for (let k = 6; k < IN; k += 16) p.ell(k + 5, 196, 5, 20, sp([70, 64, 58], TN, 0.9, 0, 0.3));
    for (let k = 6; k < IN; k += 16) p.ell(k + 5, 196, 3.4, 18, trimP([240, 234, 220], 0.72));
  }]);
  def('be_top', 5, 4, [(p) => {
    beBase(p, 57); win(p, 78, 86, 68, 96, { seed: 59, mull: 2, fc: [242, 240, 232], rail: 'iron', railH: 30, sill: false, surround: 5 });
    // dentil cornice and its deep shadow
    p.rect(0, 0, IN, 46, trimP([250, 246, 236], 0.78)); for (let k = 2; k < IN; k += 12) p.rect(k, 30, 7, 13, trimP([214, 206, 192], 0.7)); p.rect(0, 0, IN, 12, trimP([252, 250, 244], 0.86));
    p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.32)'; c.fillRect(0, 46, IN, 8); }); p.streaks(0, 54, IN, 50, 0.08, 58);
  }]);
  def('be_gnd', 5, 5, [(p) => {
    p.clear(wallP([228, 218, 198])); p.grain(2600, 0.07, 61); joints(p, 5, 0.3, 0.12); p.stucco(2000, 0.06, 62);
    // arched opening in rusticated stone, a lit cafe / boutique behind
    p.fill(c => { c.moveTo(32, IN); c.lineTo(32, 96); c.ellipse(112, 96, 80, 64, 0, Math.PI, 0); c.lineTo(192, IN); c.closePath(); }, wallP([200, 190, 172], Hh.reveal));
    p.fill(c => { c.moveTo(44, IN); c.lineTo(44, 100); c.ellipse(112, 100, 68, 54, 0, Math.PI, 0); c.lineTo(180, IN); c.closePath(); }, sp([238, 222, 196], TN, 0.4, 0.5, Hh.glass));
    p.shade(c => { const r = U.rng(63); for (let i = 0; i < 18; i++) { c.fillStyle = 'hsla(' + ((r() * 60) | 0) + ',40%,' + (35 + r() * 30 | 0) + '%,0.8)'; c.fillRect(52 + r() * 110, 140 + r() * 60, 6 + r() * 8, 14); } c.fillStyle = 'rgba(255,240,200,0.9)'; c.fillRect(96, 104, 32, 3); });
    frame(p, 44, 100, 136, 124, 5, [40, 46, 40], 3); p.rect(98, 28, 28, 26, trimP([250, 246, 236], 0.78));
  }, (p) => {
    p.clear(wallP([228, 218, 198])); p.grain(2600, 0.07, 64); joints(p, 5, 0.3, 0.12);
    const x = 28, y = 86, w = 168, h = 138; reveal(p, x, y, w, h, 5, [150, 140, 126]); p.rect(x, y, w, h, sp([230, 216, 190], TN, 0.45, 0.5, Hh.glass));
    p.shade(c => { const r = U.rng(65); for (let i = 0; i < 6; i++) { c.fillStyle = 'rgba(40,30,24,0.4)'; c.fillRect(x + 10 + r() * (w - 40), y + 60 + r() * 30, 20, 40); } });
    frame(p, x, y, w, h, 6, [44, 50, 44], 3); awning(p, 20, 46, 184, 36, 1, true);
    p.rect(0, 0, IN, 18, trimP([244, 236, 222], 0.7));
  }]);
  def('be_mans', 5, 7, [(p) => {
    // mansard slope: zinc / slate courses, a dormer with a curved hood (the dormers near the circuit are geometry)
    p.clear(sp([150, 156, 162], TW, 0.5, 0, 0.5)); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.14)'; for (let k = 0; k < IN; k += 9) c.fillRect(0, k, IN, 1.5); for (let k = 0; k < IN; k += 18) c.fillRect(k, 0, 1, IN); });
    p.bump(c => { c.fillStyle = gray(110); for (let k = 0; k < IN; k += 9) c.fillRect(0, k, IN, 1.5); });
    p.rect(66, 60, 92, 130, trimP([244, 240, 230], 0.7)); p.fill(c => { c.ellipse(112, 62, 46, 30, 0, Math.PI, 0); }, trimP([244, 240, 230], 0.74));
    win(p, 82, 74, 60, 104, { seed: 71, fc: [240, 238, 230], sill: false });
  }]);
  // ---------------- row 6: villas (1900-1930s Riviera residential, bay 3.2 x storey 3.2)
  const villa = (v) => (p) => {
    p.clear(wallP()); p.grain(1800, 0.06, 71 + v); p.stucco(1800, 0.06, 72 + v);
    win(p, 76, 44, 72, 134, { seed: 73 + v, mull: 2, fc: [244, 242, 236], shutters: v === 3 ? 'closed' : v === 2 ? 'half' : 'open', shutW: 34, rail: v === 1 ? 'ornate' : null, railH: 40, surround: v === 0 ? 5 : 0 });
    if (v === 1) { p.rect(60, 180, 104, 9, trimP(null, Hh.sill)); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(60, 189, 104, 8); }); }
    p.streaks(0, 196, IN, 26, 0.06, 79 + v);
  };
  def('vl_flr', 6, 0, [villa(0), villa(1), villa(2), villa(3)]);
  def('vl_gnd', 6, 4, [(p) => {
    p.clear(wallP([224, 218, 208])); p.grain(1800, 0.07, 81); joints(p, 5, 0.2, 0.08);
    p.fill(c => { c.moveTo(70, IN); c.lineTo(70, 92); c.ellipse(112, 92, 42, 34, 0, Math.PI, 0); c.lineTo(154, IN); c.closePath(); }, accP(0.4, [150, 120, 96], 0.7));
    p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(110, 94, 4, 130); c.fillStyle = 'rgba(0,0,0,0.12)'; for (let k = 100; k < 224; k += 20) { c.fillRect(76, k, 30, 2); c.fillRect(118, k, 30, 2); } });
    glass(p, 84, 64, 56, 28, { room: false, curtains: false }); p.rect(66, 58, 92, 6, trimP(null, Hh.corn));
  }, (p) => {
    p.clear(wallP([224, 218, 208])); p.grain(1800, 0.07, 83); joints(p, 5, 0.2, 0.08);
    const x = 24, y = 88, w = 176, h = 136; reveal(p, x, y, w, h, 4); p.rect(x, y, w, h, sp([236, 224, 200], TN, 0.45, 0.5, Hh.glass)); p.shade(c => { c.fillStyle = 'rgba(60,40,30,0.3)'; c.fillRect(x + 20, y + 70, 50, 66); c.fillRect(x + 110, y + 70, 50, 66); });
    frame(p, x, y, w, h, 5, [60, 70, 60], 2); awning(p, 16, 52, 192, 34, 9);
  }]);
  def('vl_top', 6, 6, [(p) => {
    p.clear(wallP()); p.grain(1600, 0.06, 85); win(p, 84, 92, 56, 84, { seed: 87, fc: [244, 242, 236], shutters: 'open', shutW: 24 });
    p.rect(0, 0, IN, 40, trimP([250, 248, 242], 0.74)); for (let k = 8; k < IN; k += 28) p.rect(k, 30, 10, 20, trimP([236, 232, 222], 0.7)); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.26)'; c.fillRect(0, 40, IN, 12); });
  }]);
  def('plain', 6, 7, [(p) => { p.clear(wallP()); p.grain(1600, 0.06, 109); p.stucco(1600, 0.06, 110); p.vgrad(0, 0, IN, IN, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.05)']]); }]);
  // ---------------- row 7: old town (Rocher), church, offices, glass lobby, the Palace
  const oldFlr = (v) => (p) => {
    p.clear(wallP([236, 226, 206])); p.grain(3000, 0.08, 91 + v); p.stucco(2600, 0.07, 92 + v);
    p.shade(c => { const r = U.rng(93 + v); for (let i = 0; i < 9; i++) { c.fillStyle = 'rgba(120,100,70,0.07)'; c.beginPath(); c.ellipse(r() * IN, r() * IN, 20 + r() * 40, 10 + r() * 30, 0, 0, 6.283); c.fill(); } });
    win(p, 90, 56, 44, 100, { seed: 95 + v, fc: [236, 234, 228], shutters: v ? 'closed' : 'open', shutW: 26, surround: 5, trimC: [244, 238, 226], mull: 2 });
  };
  def('ot_flr', 7, 0, [oldFlr(0), oldFlr(1)]);
  def('ot_gnd', 7, 2, [(p) => {
    p.clear(wallP([226, 214, 192])); p.grain(3000, 0.09, 101); joints(p, 6, 0.15, 0.06);
    p.fill(c => { c.moveTo(76, IN); c.lineTo(76, 108); c.ellipse(112, 108, 36, 30, 0, Math.PI, 0); c.lineTo(148, IN); c.closePath(); }, accP(0.4, [120, 90, 64], 0.75)); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(111, 108, 3, 116); });
  }, (p) => {
    p.clear(wallP([226, 214, 192])); p.grain(3000, 0.09, 103); const x = 40, y = 96, w = 144, h = 128; reveal(p, x, y, w, h, 4); p.rect(x, y, w, h, sp([236, 220, 190], TN, 0.45, 0.5, Hh.glass));
    p.shade(c => { const r = U.rng(104); for (let i = 0; i < 14; i++) { c.fillStyle = 'hsla(' + ((r() * 360) | 0) + ',50%,50%,0.8)'; c.fillRect(x + 6 + r() * (w - 20), y + 40 + r() * 70, 8, 10); } });
    frame(p, x, y, w, h, 5, [70, 90, 70], 2); awning(p, 32, 64, 160, 30, 8);
  }]);
  def('church', 7, 4, [(p) => {
    p.clear(wallP([234, 226, 210])); p.grain(2600, 0.07, 107); joints(p, 9, 0.2, 0.08);
    p.fill(c => { c.moveTo(84, 204); c.lineTo(84, 80); c.ellipse(112, 80, 28, 30, 0, Math.PI, 0); c.lineTo(140, 204); c.closePath(); }, trimP([246, 240, 228], Hh.corn));
    p.fill(c => { c.moveTo(90, 200); c.lineTo(90, 82); c.ellipse(112, 82, 22, 24, 0, Math.PI, 0); c.lineTo(134, 200); c.closePath(); }, sp([60, 74, 110], TN, 0.2, 0.7, Hh.glass));
    p.shade(c => { c.strokeStyle = 'rgba(200,170,90,0.6)'; c.lineWidth = 2; c.beginPath(); c.moveTo(112, 58); c.lineTo(112, 200); c.moveTo(90, 120); c.lineTo(134, 120); c.stroke(); c.fillStyle = 'rgba(160,40,40,0.4)'; c.fillRect(92, 130, 18, 30); c.fillStyle = 'rgba(40,120,60,0.4)'; c.fillRect(114, 130, 18, 30); });
  }]);
  def('of_flr', 7, 5, [(p) => { p.clear(wallP([234, 232, 228])); p.stucco(1200, 0.04, 111); glass(p, 0, 58, IN, 112, { seed: 112, curtains: false, light: true }); for (let k = 0; k < IN; k += 56) p.rect(k, 58, 5, 112, sp([200, 204, 206], TN, 0.3, 0.3, Hh.frame)); p.rect(0, 170, IN, 6, trimP([226, 228, 230], Hh.sill)); aoTop(p, 0, 40, 0.1); }]);
  def('mg_gnd', 7, 6, [(p) => { glass(p, 0, 40, IN, IN - 40, { seed: 113, curtains: false }); p.shade(c => { c.fillStyle = 'rgba(255,236,200,0.25)'; c.fillRect(0, 40, IN, 80); }); for (let k = 0; k < IN; k += 74) p.rect(k, 40, 6, IN, sp([70, 74, 80], TN, 0.3, 0.3, Hh.frame)); p.rect(0, 0, IN, 40, wallP([232, 234, 236], 0.6)); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(0, 40, IN, 6); }); }]);
  def('palace', 7, 7, [(p) => {
    p.clear(wallP([236, 216, 182])); p.grain(1800, 0.06, 167); p.stucco(1800, 0.06, 168);
    win(p, 88, 56, 48, 104, { seed: 169, fc: [236, 230, 216], shutters: 'open', shutW: 22, surround: 7, trimC: [246, 238, 222], lintel: 'cornice' });
    p.rect(0, 0, 12, IN, wallP([246, 240, 226], 0.64)); p.rect(IN - 12, 0, 12, IN, wallP([246, 240, 226], 0.64)); for (let k = 0; k < IN; k += 28) { p.rect(0, k, 16, 24, wallP([248, 242, 230], 0.66)); p.rect(IN - 16, k + 14, 16, 24, wallP([248, 242, 230], 0.66)); }
  }]);
  // ---------------- row 8: modern glass, the hairpin hotel, the yacht club, the Hotel de Paris, balustrades
  def('mg_flr', 8, 0, [(p) => {
    glass(p, 0, 0, IN, IN, { seed: 121, curtains: false, light: true }); p.vgrad(0, 0, IN, IN, [[0, 'rgba(150,180,200,0.22)'], [1, 'rgba(20,40,60,0.18)']]);
    for (let k = 0; k < IN; k += 56) p.rect(k, 0, 4, IN, sp([190, 196, 200], TN, 0.3, 0.3, Hh.frame)); p.rect(0, 0, IN, 30, wallP([226, 230, 232], 0.62)); p.rect(0, 30, IN, 4, sp([120, 126, 130], TN, 0.4, 0, 0.5));
  }, (p) => {
    glass(p, 0, 34, IN, IN - 34, { seed: 122, curtains: false, light: true }); p.rect(0, 0, IN, 34, wallP([244, 246, 246], 0.66)); glass(p, 0, 150, IN, 74, { room: false, curtains: false }); p.shade(c => { c.fillStyle = 'rgba(180,200,200,0.25)'; c.fillRect(0, 150, IN, 74); });
    p.rect(0, 146, IN, 5, accP(0.8, [230, 232, 232], 0.3)); for (let k = 0; k < IN; k += 74) p.rect(k, 34, 3, IN, sp([200, 204, 206], TN, 0.3, 0.3, Hh.frame));
  }]);
  def('fair_flr', 8, 2, [(p) => {
    p.clear(wallP([232, 226, 214])); glass(p, 14, 34, 196, 112, { seed: 171 }); frame(p, 14, 34, 196, 112, 4, [214, 212, 206], 4); aoTop(p, 30, 46, 0.45);
    for (const x of [0, 112]) p.rect(x, 30, 8, 150, wallP([240, 236, 228], 0.6));
    p.rect(0, 0, IN, 30, wallP([244, 240, 232], 0.6)); p.rect(0, 146, IN, 78, wallP([238, 232, 220], 0.7)); p.rect(0, 142, IN, 6, trimP([252, 250, 246], 0.8));
    const r = U.rng(165); for (let i = 0; i < 12; i++) p.ell(10 + r() * 204, 150 + r() * 10, 8 + r() * 12, 8 + r() * 7, sp([60 + r() * 40, 96 + r() * 40, 40 + r() * 20], TN, 0.95, 0, 0.8));
    p.streaks(0, 200, IN, 24, 0.1, 166);
  }]);
  def('fair_gnd', 8, 3, [(p) => { p.clear(wallP([238, 236, 230])); glass(p, 0, 70, IN, IN - 70, { seed: 172, curtains: false }); p.shade(c => { c.fillStyle = 'rgba(255,236,200,0.3)'; c.fillRect(0, 70, IN, 60); }); for (let k = 0; k < IN; k += 56) p.rect(k, 70, 5, IN, sp([60, 62, 66], TN, 0.3, 0.3, Hh.frame)); p.rect(0, 40, IN, 30, sp([46, 50, 56], TN, 0.4, 0, 0.7)); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(0, 70, IN, 8); }); }]);
  def('ycm', 8, 4, [(p) => { p.clear(wallP([246, 246, 244])); glass(p, 0, 60, IN, 120, { seed: 173, curtains: false }); for (let k = 0; k < IN; k += 37) p.rect(k, 60, 3, 120, sp([220, 224, 226], TN, 0.3, 0.3, Hh.frame)); p.rect(0, 176, IN, 6, sp([210, 214, 216], TN, 0.3, 0, Hh.sill)); aoTop(p, 60, 30, 0.3); }]);
  def('hdp_flr', 8, 5, [(p) => {
    // the Hotel de Paris: tall windows with carved surrounds and a cartouche, iron balconettes, pilasters with capitals
    beBase(p, 181); const x = 72, y = 40, w = 80, h = 150;
    win(p, x, y, w, h, { seed: 182, mull: 2, transom: true, fc: [244, 242, 236], surround: 9, trimC: [250, 246, 236], lintel: 'arch', rail: 'ornate', railH: 44, sill: false, d: 7 });
    p.ell(x + w / 2, y - 20, 12, 9, trimP([252, 248, 238], Hh.corn + 0.06)); p.rect(x - 18, y + h + 8, w + 36, 8, trimP([250, 246, 236], Hh.sill));
    for (const px of [0, IN - 16]) { p.rect(px - 3, 0, 22, 14, trimP([252, 248, 240], Hh.corn)); p.rect(px - 2, 14, 20, 6, trimP([240, 234, 220], Hh.corn - 0.05)); }
    p.streaks(x - 12, y + h + 18, w + 24, 34, 0.07, 183);
  }]);
  def('hdp_gnd', 8, 6, [(p) => {
    p.clear(wallP([230, 220, 200])); p.grain(2400, 0.07, 184); joints(p, 5, 0.32, 0.12);
    p.fill(c => { c.moveTo(36, IN); c.lineTo(36, 100); c.ellipse(112, 100, 76, 70, 0, Math.PI, 0); c.lineTo(188, IN); c.closePath(); }, trimP([246, 238, 222], Hh.trim));
    p.fill(c => { c.moveTo(48, IN); c.lineTo(48, 104); c.ellipse(112, 104, 64, 58, 0, Math.PI, 0); c.lineTo(176, IN); c.closePath(); }, sp([246, 226, 190], TN, 0.4, 0.5, Hh.glass));
    p.shade(c => { c.fillStyle = 'rgba(255,240,200,0.9)'; for (let i = 0; i < 3; i++) c.fillRect(80 + i * 26, 110, 10, 18); c.fillStyle = 'rgba(80,50,30,0.35)'; c.fillRect(60, 170, 104, 54); });
    frame(p, 48, 104, 128, 120, 5, [176, 146, 80], 3); p.rect(100, 26, 24, 30, trimP([252, 248, 238], Hh.corn));
  }]);
  def('balust', 8, 7, [(p) => {
    p.clear(sp([60, 56, 52], TN, 0.9, 0, 0.2)); p.rect(0, 0, IN, 30, trimP([248, 242, 230], 0.8)); p.rect(0, IN - 26, IN, 26, trimP([240, 234, 220], 0.72));
    for (let k = 0; k < IN; k += 28) { p.ell(k + 14, 112, 10, 70, trimP([244, 238, 226], 0.7)); p.rect(k + 8, 34, 12, 14, trimP([244, 238, 226], 0.7)); p.rect(k + 8, 176, 12, 22, trimP([244, 238, 226], 0.7)); }
    p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 30, IN, 6); });
  }]);
  // ---------------- row 9: the Casino
  const CAS = [234, 220, 192];
  def('cas_arch', 9, 0, [(p) => {
    // twin columns, a great arched window with a carved surround and a sculpted keystone, festoons over it
    p.clear(wallP(CAS)); p.grain(2400, 0.06, 191); p.stucco(2000, 0.06, 192);
    for (const x of [4, 26, 184, 206]) { p.rect(x, 0, 14, IN, trimP([246, 238, 222], 0.74)); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x + 12, 0, 3, IN); c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(x + 2, 0, 3, IN); }); }
    for (const x of [0, 22, 180, 202]) p.rect(x, 10, 22, 12, trimP([250, 244, 230], Hh.corn));
    p.fill(c => { c.moveTo(60, 200); c.lineTo(60, 84); c.ellipse(112, 84, 52, 46, 0, Math.PI, 0); c.lineTo(164, 200); c.closePath(); }, trimP([250, 244, 230], Hh.corn));
    p.fill(c => { c.moveTo(72, 194); c.lineTo(72, 88); c.ellipse(112, 88, 40, 36, 0, Math.PI, 0); c.lineTo(152, 194); c.closePath(); }, sp([52, 60, 66], TN, 0.08, 1, Hh.glass));
    glass(p, 72, 88, 80, 106, { seed: 193 }); frame(p, 72, 88, 80, 106, 4, [230, 222, 200], 2); p.rect(72, 120, 80, 3, sp([230, 222, 200], TN, 0.45, 0, Hh.frame)); ironRail(p, 68, 164, 88, 30, true);
    p.rect(98, 26, 28, 26, trimP([252, 246, 232], Hh.corn + 0.08)); p.shade(c => { c.fillStyle = 'rgba(170,140,70,0.35)'; c.fillRect(102, 30, 20, 16); c.strokeStyle = 'rgba(140,110,60,0.45)'; c.lineWidth = 3; c.beginPath(); c.moveTo(48, 40); c.quadraticCurveTo(70, 62, 96, 40); c.moveTo(128, 40); c.quadraticCurveTo(154, 62, 176, 40); c.stroke(); });
    p.rect(0, 204, IN, 20, trimP([244, 236, 220], 0.72)); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(0, 200, IN, 4); });
  }]);
  def('cas_bay', 9, 1, [(p) => {
    p.clear(wallP(CAS)); p.grain(2400, 0.06, 194); joints(p, 8, 0.1, 0.04);
    win(p, 76, 50, 72, 120, { seed: 195, fc: [236, 230, 210], surround: 8, trimC: [250, 244, 230], lintel: 'pediment', rail: 'ornate', railH: 32, sill: false });
    for (const x of [0, IN - 18]) p.rect(x, 0, 18, IN, trimP([246, 238, 222], 0.7));
    p.ell(112, 200, 26, 12, trimP([250, 244, 230], Hh.corn)); p.shade(c => { c.fillStyle = 'rgba(160,130,60,0.3)'; c.beginPath(); c.ellipse(112, 200, 16, 7, 0, 0, 6.283); c.fill(); });
  }]);
  def('cas_top', 9, 2, [(p) => {
    // balustraded attic with an oculus framed by garlands, urns on the balustrade
    p.clear(wallP([236, 226, 204])); p.grain(1600, 0.05, 196); p.rect(0, 166, IN, 58, trimP([246, 238, 222], 0.72));
    p.ell(112, 90, 32, 32, trimP([250, 244, 232], Hh.corn)); p.ell(112, 90, 21, 21, sp([60, 70, 76], TN, 0.1, 1, Hh.glass));
    p.shade(c => { c.strokeStyle = 'rgba(150,120,60,0.45)'; c.lineWidth = 4; c.beginPath(); c.moveTo(40, 60); c.quadraticCurveTo(72, 96, 80, 70); c.moveTo(184, 60); c.quadraticCurveTo(152, 96, 144, 70); c.stroke(); });
    for (let k = 6; k < IN; k += 16) p.ell(k + 5, 196, 4, 18, sp([80, 74, 66], TN, 0.9, 0, 0.32));
    p.rect(0, 162, IN, 8, trimP([252, 248, 238], Hh.corn)); for (const x of [10, 200]) { p.ell(x + 6, 150, 9, 12, trimP([246, 240, 228], Hh.corn)); p.rect(x + 2, 158, 8, 8, trimP([246, 240, 228], Hh.corn)); }
  }]);
  def('cas_tower', 9, 3, [(p) => {
    // the towers' faces: a tall round-headed opening between banded pilasters, a garlanded cartouche over it
    p.clear(wallP(CAS)); p.grain(2000, 0.06, 197); joints(p, 10, 0.12, 0.05);
    for (const x of [0, IN - 30]) { p.rect(x, 0, 30, IN, trimP([246, 238, 222], 0.7)); for (let k = 0; k < IN; k += 22) p.rect(x, k, 30, 4, trimP([226, 216, 196], 0.6)); }
    p.fill(c => { c.moveTo(70, 210); c.lineTo(70, 92); c.ellipse(112, 92, 42, 40, 0, Math.PI, 0); c.lineTo(154, 210); c.closePath(); }, trimP([250, 244, 230], Hh.corn));
    p.fill(c => { c.moveTo(80, 206); c.lineTo(80, 96); c.ellipse(112, 96, 32, 30, 0, Math.PI, 0); c.lineTo(144, 206); c.closePath(); }, sp([48, 56, 62], TN, 0.08, 1, Hh.glass));
    ironRail(p, 76, 176, 72, 30, true); p.ell(112, 30, 22, 16, trimP([252, 246, 232], Hh.corn + 0.06)); p.shade(c => { c.fillStyle = 'rgba(170,140,70,0.35)'; c.beginPath(); c.ellipse(112, 30, 12, 9, 0, 0, 6.283); c.fill(); });
  }]);
  def('clock', 9, 4, [(p) => { p.clear(wallP([234, 222, 198])); p.ell(112, 112, 74, 74, sp([200, 170, 90], TN, 0.35, 0.3, Hh.corn)); p.ell(112, 112, 62, 62, sp([246, 242, 230], TN, 0.5, 0, 0.66)); p.shade(c => { c.strokeStyle = '#2a2a2a'; c.lineWidth = 3; for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; c.beginPath(); c.moveTo(112 + Math.cos(a) * 50, 112 + Math.sin(a) * 50); c.lineTo(112 + Math.cos(a) * 58, 112 + Math.sin(a) * 58); c.stroke(); } c.lineWidth = 5; c.beginPath(); c.moveTo(112, 112); c.lineTo(112, 72); c.moveTo(112, 112); c.lineTo(142, 120); c.stroke(); c.strokeStyle = 'rgba(150,120,60,0.5)'; c.lineWidth = 5; c.beginPath(); c.arc(112, 112, 82, 3.4, 6.0); c.stroke(); }); }]);
  def('cas_gnd', 9, 5, [(p) => {
    p.clear(wallP(CAS)); p.grain(2400, 0.07, 198); joints(p, 5, 0.28, 0.12);
    p.fill(c => { c.moveTo(40, IN); c.lineTo(40, 96); c.ellipse(112, 96, 72, 62, 0, Math.PI, 0); c.lineTo(184, IN); c.closePath(); }, trimP([248, 240, 224], Hh.trim));
    p.fill(c => { c.moveTo(52, IN); c.lineTo(52, 100); c.ellipse(112, 100, 60, 52, 0, Math.PI, 0); c.lineTo(172, IN); c.closePath(); }, sp([250, 228, 180], TN, 0.4, 0.5, Hh.glass));
    p.shade(c => { c.fillStyle = 'rgba(255,230,160,0.9)'; c.beginPath(); c.arc(112, 128, 10, 0, 6.283); c.fill(); c.fillStyle = 'rgba(120,30,30,0.5)'; c.fillRect(60, 180, 104, 44); });
    frame(p, 52, 100, 120, 124, 5, [190, 160, 90], 3);
  }]);
  def('dormer', 9, 6, [(p) => { p.clear(trimP([244, 240, 230], 0.6)); p.grain(1200, 0.05, 199); win(p, 50, 40, 124, 170, { seed: 200, fc: [240, 238, 230], sill: false, mull: 2, d: 6 }); p.rect(0, 0, IN, 26, trimP([250, 246, 238], Hh.corn)); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(0, 26, IN, 8); }); }]);
  def('marquise', 9, 7, [(p) => { p.clear(sp([60, 70, 76], TN, 0.1, 1, 0.5)); p.vgrad(0, 0, IN, IN, [[0, 'rgba(200,220,230,0.4)'], [1, 'rgba(60,70,80,0.1)']]); for (let k = 0; k < IN; k += 28) p.rect(k, 0, 4, IN, sp([40, 44, 40], TN, 0.4, 0.4, 0.62)); for (let k = 0; k < IN; k += 56) p.rect(0, k, IN, 3, sp([40, 44, 40], TN, 0.4, 0.4, 0.62)); }]);
  // ---------------- row 10: roofs and materials (world-scaled swatches)
  def('tiles', 10, 0, [(p) => {
    // terracotta barrel tiles: courses of half cylinders (relief), mottled firing colours, lichen
    p.clear(wallP([214, 206, 198], 0.5)); const r = U.rng(211);
    p.shade(c => { for (let y = 0; y < IN; y += 14) { for (let x = (y / 14) % 2 ? 0 : 9; x < IN + 18; x += 18) { const g = c.createLinearGradient(x - 9, 0, x + 9, 0); const v = 0.8 + r() * 0.4; g.addColorStop(0, 'rgba(0,0,0,0.36)'); g.addColorStop(0.45, 'rgba(255,255,255,' + (0.2 * v).toFixed(2) + ')'); g.addColorStop(1, 'rgba(0,0,0,0.32)'); c.fillStyle = g; c.fillRect(x - 9, y, 18, 15); } c.fillStyle = 'rgba(0,0,0,0.32)'; c.fillRect(0, y + 13, IN, 2); } for (let i = 0; i < 60; i++) { c.fillStyle = 'rgba(' + (r() < 0.4 ? '40,30,20' : r() < 0.6 ? '120,130,90' : '255,236,210') + ',' + (0.05 + r() * 0.12).toFixed(2) + ')'; c.fillRect(r() * IN, r() * IN, 8 + r() * 30, 6 + r() * 18); } });
    p.bump(c => { for (let y = 0; y < IN; y += 14) for (let x = (y / 14) % 2 ? 0 : 9; x < IN + 18; x += 18) { const g = c.createLinearGradient(x - 9, 0, x + 9, 0); g.addColorStop(0, gray(60)); g.addColorStop(0.5, gray(200)); g.addColorStop(1, gray(60)); c.fillStyle = g; c.fillRect(x - 9, y, 18, 13); } });
  }]);
  def('flat', 10, 1, [(p) => { p.clear(wallP([200, 198, 194])); p.grain(4000, 0.1, 213); p.stucco(3000, 0.08, 214); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.12)'; for (let k = 0; k < IN; k += 56) { c.fillRect(k, 0, 2, IN); c.fillRect(0, k, IN, 2); } const r = U.rng(215); for (let i = 0; i < 10; i++) { c.fillStyle = 'rgba(60,56,50,0.07)'; c.beginPath(); c.ellipse(r() * IN, r() * IN, 20 + r() * 30, 14 + r() * 20, 0, 0, 6.283); c.fill(); } }); }]);
  def('terrace', 10, 2, [(p) => { p.clear(wallP([214, 196, 176])); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.15)'; for (let k = 0; k < IN; k += 28) { c.fillRect(k, 0, 1.5, IN); c.fillRect(0, k, IN, 1.5); } }); p.bump(c => { c.fillStyle = gray(100); for (let k = 0; k < IN; k += 28) { c.fillRect(k, 0, 1.5, IN); c.fillRect(0, k, IN, 1.5); } }); p.grain(900, 0.06, 216); }]);
  def('zinc', 10, 3, [(p) => { p.clear(sp([168, 172, 176], TW, 0.45, 0, 0.5)); p.shade(c => { for (let k = 0; k < IN; k += 16) { c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(k, 0, 2, IN); c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(k + 2, 0, 2, IN); } }); p.bump(c => { c.fillStyle = gray(200); for (let k = 0; k < IN; k += 16) c.fillRect(k, 0, 3, IN); }); p.grain(1200, 0.05, 217); }]);
  def('copper', 10, 4, [(p) => { p.clear(sp([112, 164, 140], TW, 0.55, 0, 0.5)); p.shade(c => { const r = U.rng(219); for (let k = 0; k < IN; k += 14) { c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(k, 0, 2, IN); } for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(' + (r() < 0.5 ? '40,80,60' : '180,214,196') + ',0.16)'; c.fillRect(r() * IN, r() * IN, 20 + r() * 40, 10 + r() * 30); } }); p.bump(c => { c.fillStyle = gray(190); for (let k = 0; k < IN; k += 14) c.fillRect(k, 0, 3, IN); }); }]);
  def('conc', 10, 5, [(p) => { p.clear(wallP([226, 224, 220])); p.grain(2600, 0.08, 221); p.stucco(2000, 0.07, 222); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.08)'; c.fillRect(0, 110, IN, 3); }); }]);
  def('stone', 10, 6, [(p) => {
    // rough-coursed limestone masonry (retaining walls, plinths): each stone raised, recessed mortar joints
    p.clear(sp([150, 142, 128], TW, 0.95, 0, 0.3)); const r = U.rng(223);
    for (let y = 0; y < IN; y += 22 + (r() * 6 | 0)) { let x = -r() * 30; const h = 20 + r() * 6; while (x < IN) { const w = 22 + r() * 34; const v = 0.75 + r() * 0.4; p.fill(c => { c.rect(x + 1.5, y + 1.5, w - 3, h - 3); }, sp([196 * v, 184 * v, 164 * v], TW, 0.95, 0, 0.55 + r() * 0.12)); p.shade(c => { c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(x + 1.5, y + 1.5, w - 3, 3); c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x + 1.5, y + h - 4, w - 3, 2.5); }); x += w; } }
    p.grain(2400, 0.08, 225); p.stucco(2000, 0.08, 226);
  }]);
  def('rock', 10, 7, [(p) => { p.clear(wallP([170, 162, 148])); p.shade(c => { const r = U.rng(227); for (let i = 0; i < 160; i++) { c.fillStyle = 'rgba(' + (r() < 0.5 ? '60,55,50' : '255,250,240') + ',' + (0.06 + r() * 0.12).toFixed(2) + ')'; c.beginPath(); const x = r() * IN, y = r() * IN; c.moveTo(x, y); for (let k = 0; k < 5; k++) c.lineTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 40); c.fill(); } }); p.stucco(4000, 0.2, 228); p.grain(3000, 0.1, 229); }]);
  // ---------------- row 11: cliffs, paving and ground swatches
  def('cliff', 11, 0, [(p) => {
    // weathered limestone: bedding planes, vertical joints, blocky relief, iron and lichen stains, tufts of scrub in the ledges
    p.clear(wallP([176, 166, 148], 0.5)); const r = U.rng(231);
    for (let y = 0; y < IN; y += 10 + r() * 22) { const h = 8 + r() * 20; let x = -r() * 40; while (x < IN) { const w = 20 + r() * 60; const v = 0.78 + r() * 0.34; const q = [x + r() * 4, y + r() * 3, x + w - r() * 4, y + r() * 3, x + w - r() * 6, y + h - r() * 3, x + r() * 6, y + h - r() * 2]; p.fill(c => { c.moveTo(q[0], q[1]); c.lineTo(q[2], q[3]); c.lineTo(q[4], q[5]); c.lineTo(q[6], q[7]); c.closePath(); }, wallP([176 * v, 166 * v, 148 * v], 0.38 + r() * 0.3)); x += w; } p.shade(c => { c.fillStyle = 'rgba(30,24,20,0.35)'; c.fillRect(0, y + h - 2, IN, 3); }); }
    p.shade(c => { for (let i = 0; i < 14; i++) { const x = r() * IN; const g = c.createLinearGradient(0, 0, 0, IN); g.addColorStop(0, 'rgba(150,90,50,0)'); g.addColorStop(0.5, 'rgba(150,90,50,0.14)'); g.addColorStop(1, 'rgba(150,90,50,0)'); c.fillStyle = g; c.fillRect(x, 0, 3 + r() * 10, IN); } for (let i = 0; i < 26; i++) { c.fillStyle = 'rgba(40,36,30,0.18)'; c.fillRect(r() * IN, r() * IN, 1.5, 10 + r() * 40); } });
    for (let i = 0; i < 7; i++) { const x = r() * IN, y = r() * IN, rr = 5 + r() * 10; p.ell(x, y, rr * 1.5, rr, sp([62 + r() * 18, 74 + r() * 18, 48], TN, 0.95, 0, 0.7)); }
    p.grain(3000, 0.1, 232); p.stucco(3000, 0.12, 233);
  }]);
  def('pave', 11, 1, [(p) => {
    p.clear(sp([196, 178, 170], TW, 0.9, 0, 0.5)); const r = U.rng(241); const bw = 18.7, bh = 9.33;
    p.shade(c => { for (let row = 0, y = 0; y < IN; row++, y += bh) for (let x = (row % 2) * bw / 2 - bw; x < IN; x += bw) { const v = 0.82 + r() * 0.3; const pink = r() < 0.35; c.fillStyle = 'rgba(' + ((pink ? 206 : 180) * v | 0) + ',' + ((pink ? 168 : 174) * v | 0) + ',' + ((pink ? 160 : 168) * v | 0) + ',1)'; c.fillRect(x + 0.7, y + 0.7, bw - 1.4, bh - 1.4); } });
    p.bump(c => { c.fillStyle = gray(90); for (let row = 0, y = 0; y < IN; row++, y += bh) { c.fillRect(0, y, IN, 1); for (let x = (row % 2) * bw / 2 - bw; x < IN; x += bw) c.fillRect(x, y, 1, bh); } });
    p.grain(1800, 0.06, 243);
  }]);
  def('kerb', 11, 2, [(p) => { p.clear(wallP([170, 168, 164])); p.grain(3600, 0.14, 245); p.stucco(3000, 0.1, 246); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < IN; k += 112) c.fillRect(k, 0, 2, IN); c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(0, 0, IN, 30); }); }]);
  def('lawn', 11, 3, [(p) => { p.clear(sp([66, 92, 46], TN, 0.95, 0, 0.5)); p.shade(c => { const r = U.rng(247); for (let i = 0; i < 3000; i++) { c.fillStyle = r() < 0.5 ? 'rgba(40,70,20,0.25)' : 'rgba(160,190,90,0.2)'; c.fillRect(r() * IN, r() * IN, 1, 3); } c.fillStyle = 'rgba(255,255,255,0.05)'; for (let k = 0; k < IN; k += 56) c.fillRect(k, 0, 28, IN); }); }]);
  def('flowers', 11, 4, [(p) => { p.clear(sp([56, 80, 38], TN, 0.95, 0, 0.5)); const r = U.rng(249); for (let i = 0; i < 70; i++) p.ell(r() * IN, r() * IN, 6 + r() * 10, 5 + r() * 8, sp([50 + r() * 30, 80 + r() * 30, 36], TN, 0.95, 0, 0.6 + r() * 0.2)); p.shade(c => { const cols = ['#d2263a', '#f2c230', '#e8e4dc', '#c03080', '#f07a20']; for (let i = 0; i < 900; i++) { c.fillStyle = cols[(r() * cols.length) | 0]; c.beginPath(); c.arc(r() * IN, r() * IN, 1.5 + r() * 2, 0, 6.283); c.fill(); } }); }]);
  def('water', 11, 5, [(p) => { p.clear(sp([40, 128, 170], TN, 0.06, 0.85, 0.5)); p.shade(c => { const r = U.rng(251); for (let i = 0; i < 60; i++) { c.strokeStyle = 'rgba(255,255,255,' + (0.08 + r() * 0.12).toFixed(2) + ')'; c.lineWidth = 1.5; c.beginPath(); const x = r() * IN, y = r() * IN; c.moveTo(x, y); c.quadraticCurveTo(x + 15, y - 6, x + 30, y); c.stroke(); } c.fillStyle = 'rgba(20,60,110,0.35)'; c.fillRect(0, 108, IN, 8); }); }]);
  def('pooltile', 11, 6, [(p) => { p.clear(sp([230, 236, 236], TN, 0.5, 0, 0.5)); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.12)'; for (let k = 0; k < IN; k += 14) { c.fillRect(k, 0, 1, IN); c.fillRect(0, k, IN, 1); } }); p.bump(c => { c.fillStyle = gray(100); for (let k = 0; k < IN; k += 14) { c.fillRect(k, 0, 1, IN); c.fillRect(0, k, IN, 1); } }); }]);
  def('soil', 11, 7, [(p) => { p.clear(sp([92, 74, 56], TN, 0.95, 0, 0.5)); p.grain(3000, 0.15, 253); p.stucco(3000, 0.15, 254); }]);
  // ---------------- row 13 (scenery polish): the Ste Devote chequer paving, the porthole block at the Nouvelle Chicane
  def('chequer', 13, 1, [(p) => {
    // Ste Devote forecourt: 0.34 m pale grey / salmon-red concrete flags laid as a chequer (devote2), grey joints; 2.4 m per tile
    p.clear(sp([150, 146, 140], TW, 0.9, 0, 0.5)); const r = U.rng(261), N = 7, q = IN / N;
    p.shade(c => { for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const v = 0.9 + r() * 0.2, red = (i + j) & 1; c.fillStyle = 'rgba(' + ((red ? 196 : 206) * v | 0) + ',' + ((red ? 116 : 202) * v | 0) + ',' + ((red ? 100 : 196) * v | 0) + ',1)'; c.fillRect(i * q + 1, j * q + 1, q - 2, q - 2); } });
    p.bump(c => { c.fillStyle = gray(90); for (let k = 0; k < N; k++) { c.fillRect(0, k * q, IN, 1.5); c.fillRect(k * q, 0, 1.5, IN); } });
    p.grain(1800, 0.06, 262);
  }]);
  const porthole = (p, x, y, r, seed) => {
    p.ell(x, y, r + 5, r + 5, sp([226, 228, 228], TN, 0.35, 0, 0.74)); p.ell(x, y, r + 1.5, r + 1.5, sp([120, 124, 128], TN, 0.4, 0.2, 0.7)); p.ell(x, y, r, r, sp([34, 46, 56], TN, 0.06, 1, Hh.glass));
    p.shade(c => { const g = c.createLinearGradient(x - r, y - r, x + r, y + r); g.addColorStop(0, 'rgba(190,214,228,0.55)'); g.addColorStop(0.55, 'rgba(90,112,128,0.2)'); g.addColorStop(1, 'rgba(10,16,22,0.2)'); c.fillStyle = g; c.beginPath(); c.ellipse(x, y, r, r, 0, 0, 6.2832); c.fill(); });
  };
  def('pth_flr', 13, 2, [(p) => {
    // a storey of the white block: a round porthole beside a glazed band, a sweeping white balcony slab with a dark soffit
    p.clear(wallP([245, 245, 242], 0.55)); porthole(p, 54, 86, 27, 511);
    glass(p, 112, 40, 104, 92, { seed: 512, curtains: false, light: true }); for (const k of [148, 182]) p.rect(k, 40, 4, 92, sp([236, 238, 238], TN, 0.4, 0.2, Hh.frame));
    p.rect(0, 146, IN, 24, trimP([250, 250, 248], 0.74)); p.rect(0, 170, IN, 10, sp([104, 78, 62], TN, 0.7, 0, 0.3)); p.rect(0, 140, IN, 7, sp([205, 210, 212], TN, 0.3, 0.2, 0.66));
    aoTop(p, 0, 26, 0.18); p.streaks(0, 180, IN, 40, 0.08, 513); p.grain(1400, 0.04, 514);
  }, (p) => {
    p.clear(wallP([245, 245, 242], 0.55)); for (const x of [40, 112, 184]) porthole(p, x, 82, 23, 520 + x);
    p.rect(0, 146, IN, 24, trimP([250, 250, 248], 0.74)); p.rect(0, 170, IN, 10, sp([104, 78, 62], TN, 0.7, 0, 0.3)); p.rect(0, 140, IN, 7, sp([205, 210, 212], TN, 0.3, 0.2, 0.66));
    aoTop(p, 0, 26, 0.18); p.streaks(0, 180, IN, 40, 0.08, 523); p.grain(1400, 0.04, 524);
  }]);
  def('pth_gnd', 13, 4, [(p) => {
    // podium: pale grey ribbed cladding, a row of portholes, a dark service opening
    p.clear(wallP([214, 218, 220], 0.5)); p.shade(c => { for (let k = 0; k < IN; k += 14) { c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(k, 0, 2, IN); c.fillStyle = 'rgba(40,50,60,0.14)'; c.fillRect(k + 6, 0, 3, IN); } });
    p.bump(c => { c.fillStyle = gray(150); for (let k = 0; k < IN; k += 14) c.fillRect(k, 0, 4, IN); });
    for (const x of [34, 100]) porthole(p, x, 84, 19, 530 + x); p.rect(150, 60, 66, IN - 60, sp([40, 44, 48], TN, 0.5, 0, 0.3)); for (let k = 62; k < IN; k += 12) p.rect(150, k, 66, 2, sp([70, 74, 78], TN, 0.5, 0.3, 0.45));
    p.rect(0, 0, IN, 22, trimP([246, 246, 244], 0.7)); aoTop(p, 22, 30, 0.2); p.grain(1400, 0.05, 534);
  }, (p) => {
    p.clear(wallP([214, 218, 220], 0.5)); p.shade(c => { for (let k = 0; k < IN; k += 14) { c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(k, 0, 2, IN); c.fillStyle = 'rgba(40,50,60,0.14)'; c.fillRect(k + 6, 0, 3, IN); } });
    for (const x of [10, 118]) { p.fill(c => { c.moveTo(x, IN); c.lineTo(x, 100); c.quadraticCurveTo(x + 48, 30, x + 96, 100); c.lineTo(x + 96, IN); c.closePath(); }, sp([226, 228, 228], TN, 0.4, 0, 0.7)); p.fill(c => { c.moveTo(x + 8, IN); c.lineTo(x + 8, 104); c.quadraticCurveTo(x + 48, 42, x + 88, 104); c.lineTo(x + 88, IN); c.closePath(); }, sp([34, 46, 56], TN, 0.06, 1, Hh.glass)); p.rect(x + 46, 70, 4, IN, sp([226, 228, 228], TN, 0.4, 0.2, 0.6)); }
    p.rect(0, 0, IN, 22, trimP([246, 246, 244], 0.7)); aoTop(p, 22, 30, 0.2); p.grain(1400, 0.05, 536);
  }]);
  // ---------------- row 12: foliage and fittings
  def('frond', 12, 0, [(p) => {
    p.clear(sp([70, 96, 40], TW, 0.85, 0, 0.5)); p.shade(c => { const r = U.rng(255); c.strokeStyle = 'rgba(20,40,10,0.55)'; c.lineWidth = 1.4; for (let y = 0; y < IN; y += 5) { c.beginPath(); c.moveTo(112, y); c.lineTo(10 + r() * 10, y + 22); c.moveTo(112, y); c.lineTo(214 - r() * 10, y + 22); c.stroke(); } c.fillStyle = 'rgba(200,190,120,0.7)'; c.fillRect(108, 0, 8, IN); c.fillStyle = 'rgba(255,255,200,0.12)'; c.fillRect(30, 0, 50, IN); });
  }]);
  def('pine', 12, 1, [(p) => {
    // a pine / scrub canopy seen from outside: clumps of needles with deep gaps (relief), tinted per tree
    p.clear(sp([60, 70, 46], TW, 0.95, 0, 0.3)); const r = U.rng(257);
    for (let i = 0; i < 90; i++) { const x = r() * IN, y = r() * IN, rr = 8 + r() * 16; const v = 0.75 + r() * 0.5; for (const ox of [-IN, 0, IN]) for (const oy of [-IN, 0, IN]) p.ell(x + ox, y + oy, rr, rr * 0.75, sp([86 * v, 100 * v, 62 * v], TW, 0.95, 0, 0.5 + r() * 0.3)); }
    p.shade(c => { for (let i = 0; i < 1600; i++) { c.fillStyle = r() < 0.5 ? 'rgba(10,20,6,0.25)' : 'rgba(200,220,150,0.18)'; c.fillRect(r() * IN, r() * IN, 1, 2 + r() * 3); } });
  }]);
  def('parasol', 12, 2, [(p) => { for (let k = 0; k < 8; k++) p.rect(k * 28, 0, 28, IN, k % 2 ? sp([244, 240, 228], TN, 0.9, 0, 0.5) : accP(0.5, [220, 220, 216], 0.9)); p.vgrad(0, 0, IN, IN, [[0, 'rgba(0,0,0,0.12)'], [1, 'rgba(255,255,255,0.08)']]); }]);
  def('shrub', 12, 3, [(p) => {
    p.clear(sp([58, 76, 40], TW, 0.95, 0, 0.35)); const r = U.rng(259);
    for (let i = 0; i < 110; i++) { const x = r() * IN, y = r() * IN, rr = 5 + r() * 10; const v = 0.75 + r() * 0.5; for (const ox of [-IN, 0, IN]) for (const oy of [-IN, 0, IN]) p.ell(x + ox, y + oy, rr, rr * 0.8, sp([74 * v, 104 * v, 52 * v], TW, 0.95, 0, 0.5 + r() * 0.3)); }
    p.shade(c => { for (let i = 0; i < 40; i++) { c.fillStyle = ['rgba(230,60,110,0.8)', 'rgba(250,250,240,0.7)', 'rgba(240,180,40,0.7)'][(r() * 3) | 0]; c.beginPath(); c.arc(r() * IN, r() * IN, 2 + r() * 2.5, 0, 6.283); c.fill(); } });
  }]);
  def('roofsign', 12, 4, [(p) => { p.clear(sp([34, 36, 40], TN, 0.5, 0, 0.5)); p.shade(c => { c.fillStyle = '#f2efe6'; c.font = 'bold 46px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('HOTEL', IN / 2, IN / 2 + 4); }); p.rect(0, 0, IN, 8, sp([150, 150, 150], TN, 0.4, 0, 0.6)); p.rect(0, IN - 8, IN, 8, sp([150, 150, 150], TN, 0.4, 0, 0.6)); }]);
  def('mod_bal', 12, 5, [(p) => {
    // late-modern apartment floor: floor-to-ceiling glazing behind a curved white balcony with a glass front
    p.clear(wallP([240, 240, 238])); glass(p, 10, 20, 204, 160, { seed: 261 }); frame(p, 10, 20, 204, 160, 4, [214, 216, 218], 4); aoTop(p, 0, 50, 0.4);
    glass(p, 0, 150, IN, 60, { room: false, curtains: false }); p.shade(c => { c.fillStyle = 'rgba(190,210,210,0.3)'; c.fillRect(0, 150, IN, 60); }); p.rect(0, 144, IN, 7, accP(0.82, [230, 232, 232], 0.3)); p.rect(0, 210, IN, 14, wallP([248, 248, 246], 0.8));
  }, (p) => {
    p.clear(wallP([240, 240, 238])); glass(p, 10, 20, 204, 160, { seed: 262 }); frame(p, 10, 20, 204, 160, 4, [214, 216, 218], 4); aoTop(p, 0, 50, 0.4); awning(p, 10, 14, 204, 60, 9);
    p.rect(0, 150, IN, 60, wallP([248, 248, 246], 0.76)); p.rect(0, 146, IN, 6, wallP([252, 252, 250], 0.8)); p.rect(0, 210, IN, 14, wallP([248, 248, 246], 0.8));
  }]);
  def('rv60', 12, 7, [(p) => {
    // 1960s block: alternating loggia and window bays in a gridded frame
    p.clear(wallP()); p.grain(1400, 0.05, 263); p.rect(0, 0, IN, 14, wallP(RENDER, 0.62)); p.rect(0, 0, 10, IN, wallP(RENDER, 0.62));
    p.rect(18, 22, 120, 190, sp([120, 112, 102], TW, 0.9, 0, 0.18)); glass(p, 30, 36, 96, 120, { seed: 264 }); frame(p, 30, 36, 96, 120, 4, ALU, 2); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(18, 22, 120, 30); });
    p.rect(18, 150, 120, 62, wallP(RENDER, 0.56)); ironRail(p, 18, 140, 120, 12, false, true);
    win(p, 160, 60, 46, 110, { seed: 265, roller: 0.4, mull: 1 });
  }]);

  // ---- atlas assembly: paint each cell, derive normals and a cavity term from its height layer, write it with its wrapped gutter
  // The painted atlas is kept between visits in IndexedDB, keyed by a hash of the code that paints and processes it (any change
  // to a cell repaints): read at script load (the scenery is built after the ads are in), written after a fresh build.
  let ATLAS = null, CACHED = null, SIG = null;
  function atlasSig() {
    if (SIG) return SIG; const fns = DEF.map(d => d[2]).concat([buildAtlas, glass, win, frame, reveal, sill, louvre, roller, ironRail, awning, plants, curtains, rvBack, shopFront, noiseTile, aoTop, joints, spectators], Object.values(Painter.prototype));
    let h = 2166136261; const src = fns.map(String).join('|') + [AW, AH, CS, GUT, IN].join(','); for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (SIG = 'atlas-' + (h >>> 0).toString(36));
  }
  function idb(fn) { try { const rq = indexedDB.open('ei-city', 1); rq.onupgradeneeded = () => rq.result.createObjectStore('atlas'); rq.onsuccess = () => { try { fn(rq.result); } catch (e) { } }; rq.onerror = () => { }; } catch (e) { } }
  City.preloadAtlas = function () {
    if (typeof indexedDB === 'undefined') return; const sig = atlasSig();
    idb(db => { const g = db.transaction('atlas', 'readonly').objectStore('atlas').get(sig); g.onsuccess = () => { const v = g.result; if (v && v.a && v.a.length === AW * AH * 4 && v.p && v.p.length === AW * AH) CACHED = v; }; });
  };
  function buildAtlas() {
    if (ATLAS) return ATLAS;
    const T0 = performance.now(); const PW = AW / 2, PH = AH / 2, PC = CS / 2;
    const mk = (d, w, hh, srgb) => { const tx = new THREE.DataTexture(d, w, hh, THREE.RGBAFormat); tx.magFilter = THREE.LinearFilter; tx.minFilter = THREE.LinearMipmapLinearFilter; tx.generateMipmaps = true; tx.anisotropy = 8; tx.needsUpdate = true; if (srgb) tx.encoding = THREE.sRGBEncoding; return tx; };
    if (CACHED) { ATLAS = { map: mk(CACHED.a, AW, AH, true), pk: mk(CACHED.p, PW, PH, false), ms: Math.round(performance.now() - T0), paint: 0, proc: 0, cached: true }; CACHED = null; return ATLAS; }
    const A = new Uint8Array(AW * AH * 4), P = new Uint8Array(PW * PH * 4);
    for (let i = 0; i < A.length; i += 4) { A[i] = A[i + 1] = A[i + 2] = 128; A[i + 3] = 255; }
    for (let i = 0; i < P.length; i += 4) { P[i] = P[i + 1] = 128; P[i + 2] = 230; P[i + 3] = 0; }
    // relief, cavity and normals are worked out at half resolution (112 px per cell): a quarter of the work, and the packed map is
    // half resolution anyway; the albedo picks the cavity term up from there
    const HN = IN / 2, N2 = HN * HN, Hf = new Float32Array(N2), Bl = new Float32Array(N2), Tm = new Float32Array(N2), AOc = new Float32Array(N2), NX = new Float32Array(N2), NY = new Float32Array(N2);
    const WO = 16, WT = new Int32Array(HN + 2 * WO); for (let k = 0; k < WT.length; k++) WT[k] = ((k - WO) % HN + HN) % HN;
    const GT = new Int32Array(CS); for (let k = 0; k < CS; k++) GT[k] = ((k - GUT) % IN + IN) % IN;
    const GH = new Int32Array(CS / 2); for (let k = 0; k < CS / 2; k++) GH[k] = ((k - GUT / 2) % HN + HN) % HN;
    const R = 3, RN = 2 * R + 1;
    const blur = (src, dst) => {   // separable wrapped box blur
      for (let y = 0; y < HN; y++) { const o = y * HN; let s = 0; for (let k = -R; k <= R; k++) s += src[o + WT[k + WO]]; for (let x = 0; x < HN; x++) { Tm[o + x] = s / RN; s += src[o + WT[x + R + 1 + WO]] - src[o + WT[x - R + WO]]; } }
      for (let x = 0; x < HN; x++) { let s = 0; for (let k = -R; k <= R; k++) s += Tm[WT[k + WO] * HN + x]; for (let y = 0; y < HN; y++) { dst[y * HN + x] = s / RN; s += Tm[WT[y + R + 1 + WO] * HN + x] - Tm[WT[y - R + WO] * HN + x]; } }
    };
    const NS = 9.0;   // relief scale: full height range ~0.3 m over ~1.4 cm texels (x2 at half resolution, x0.5 per texel step)
    let tPaint = 0, tProc = 0;
    for (const [col, row, fn] of DEF) {
      let tq = performance.now(); const p = new Painter(); fn(p); tPaint += performance.now() - tq; tq = performance.now();
      const a = p.a.getImageData(0, 0, IN, IN).data, t = p.t.getImageData(0, 0, IN, IN).data, m = p.m.getImageData(0, 0, IN, IN).data, h = p.h.getImageData(0, 0, IN, IN).data;
      for (let y = 0; y < HN; y++) for (let x = 0; x < HN; x++) { const s0 = (y * 2 * IN + x * 2) * 4; Hf[y * HN + x] = (h[s0] + h[s0 + 4] + h[s0 + IN * 4] + h[s0 + IN * 4 + 4]) * (1 / 1020); }
      blur(Hf, Bl);
      for (let y = 0; y < HN; y++) {
        const o = y * HN, om = WT[y - 1 + WO] * HN, op = WT[y + 1 + WO] * HN;
        for (let x = 0; x < HN; x++) { const i = o + x; const c = Bl[i] - Hf[i]; AOc[i] = c > 0 ? Math.max(0.55, 1 - c * 2.2) : 1; NX[i] = -(Hf[o + WT[x + 1 + WO]] - Hf[o + WT[x - 1 + WO]]) * 0.25 * NS; NY[i] = (Hf[op + x] - Hf[om + x]) * 0.25 * NS; }
      }
      const x0 = col * CS, y0 = row * CS;
      for (let yy = 0; yy < CS; yy++) {
        const sy = GT[yy], so = sy * IN, ao0 = (sy >> 1) * HN, dRow = (AH - 1 - (y0 + yy)) * AW + x0;
        for (let xx = 0; xx < CS; xx++) { const sx = GT[xx], s4 = (so + sx) * 4, di = (dRow + xx) * 4, ao = AOc[ao0 + (sx >> 1)]; A[di] = a[s4] * ao; A[di + 1] = a[s4 + 1] * ao; A[di + 2] = a[s4 + 2] * ao; A[di + 3] = t[s4]; }
      }
      for (let yy = 0; yy < PC; yy++) {
        const ty = PH - 1 - (row * PC + yy), hy = GH[yy], r0 = GT[yy * 2] * IN, r1 = GT[yy * 2 + 1] * IN;
        for (let xx = 0; xx < PC; xx++) {
          const hi = hy * HN + GH[xx]; const nx = NX[hi], ny = NY[hi]; const l = Math.sqrt(nx * nx + ny * ny + 1); const di = (ty * PW + col * PC + xx) * 4;
          const c0 = GT[xx * 2], c1 = GT[xx * 2 + 1]; const i0 = (r0 + c0) * 4, i1 = (r0 + c1) * 4, i2 = (r1 + c0) * 4, i3 = (r1 + c1) * 4;
          P[di] = Math.round((nx / l * 0.5 + 0.5) * 255); P[di + 1] = Math.round((ny / l * 0.5 + 0.5) * 255);
          P[di + 2] = (m[i0] + m[i1] + m[i2] + m[i3]) >> 2; P[di + 3] = (m[i0 + 1] + m[i1 + 1] + m[i2 + 1] + m[i3 + 1]) >> 2;
        }
      }
      tProc += performance.now() - tq;
    }
    ATLAS = { map: mk(A, AW, AH, true), pk: mk(P, PW, PH, false), ms: Math.round(performance.now() - T0), paint: Math.round(tPaint), proc: Math.round(tProc) };
    if (typeof indexedDB !== 'undefined') { const sig = atlasSig(); setTimeout(() => idb(db => { const st = db.transaction('atlas', 'readwrite').objectStore('atlas'); st.clear(); st.put({ a: A, p: P }, sig); }), 1500); }
    return ATLAS;
  }
  // cell attribute: column, row counted from the bottom of the texture, variant count
  const cell = (name, k) => { const c = CELLS[name]; if (!c) return [0, 0, 1]; return k == null ? [c[0], NROW - 1 - c[1], c[2]] : [c[0] + Math.min(k, c[2] - 1), NROW - 1 - c[1], 1]; };
  const cellSub = (name, from, n) => { const c = CELLS[name]; return [c[0] + from, NROW - 1 - c[1], n]; };

  // ================================================================ the city material: atlas cells tiled per bay / storey, wall and accent tints
  const PERTURB = [
    'vec3 cityPerturb(vec3 eye_pos, vec3 surf_norm, vec3 mapN, float fd) {',
    '  vec3 q0 = dFdx(eye_pos), q1 = dFdy(eye_pos); vec2 st0 = dFdx(vUv), st1 = dFdy(vUv); vec3 N = surf_norm;',
    '  vec3 q1perp = cross(q1, N), q0perp = cross(N, q0); vec3 T = q1perp * st0.x + q0perp * st1.x, B = q1perp * st0.y + q0perp * st1.y;',
    '  float det = max(dot(T, T), dot(B, B)); float scale = (det == 0.0) ? 0.0 : fd * inversesqrt(det);',
    '  return normalize(T * (mapN.x * scale) + B * (mapN.y * scale) + mapN.z * N); }'].join('\n');
  const f1 = (v) => v.toFixed(1);
  // the Low tier's city shader: Lambert (r128 lights it per VERTEX: flat facades need nothing more), ONE gradient fetch of the atlas, no packed
  // normal / roughness / glass fetch, no image-based lighting (the PBR path's env sampling was the bulk of the per-pixel cost). The sky
  // ambient the env map gave is put back as a constant fraction of the albedo (0.31 x albedo, matched on screenshots).
  function cityLambert(offset) {
    const A = buildAtlas(); const amb = (typeof window !== 'undefined' && window.__cityAmb != null) ? window.__cityAmb : 0.31;
    const lowMap = A.mapLow || (A.mapLow = (() => { const m = A.map.clone(); m.anisotropy = 2; m.needsUpdate = true; return m; })());   // its own 2x-aniso handle on the shared pixels (Low only; each gradient fetch costs less)
    const mat = new THREE.MeshLambertMaterial({ map: lowMap, vertexColors: true });
    mat.extensions = { derivatives: true, shaderTextureLOD: true };
    if (offset) { mat.polygonOffset = true; mat.polygonOffsetFactor = 1.5; mat.polygonOffsetUnits = 6; }
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 acell;\nattribute vec3 acol;\nvarying vec3 vCell;\nvarying vec3 vAcc;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCell = acell; vAcc = acol;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCell;\nvarying vec3 vAcc;')
        .replace('#include <map_fragment>', [
          'vec2 cTu = vUv; vec2 cTi = floor(cTu);',
          'float cH = fract(sin(dot(cTi + vCell.xy * vec2(7.13, 3.71), vec2(12.9898, 78.233))) * 43758.5453);',
          'float cVar = min(floor(pow(cH, 1.4) * vCell.z), vCell.z - 1.0);',
          'vec2 cCell = vec2(vCell.x + cVar, vCell.y);',
          'const vec2 cAt = vec2(' + f1(AW) + ', ' + f1(AH) + ');',
          'vec2 cAuv = (cCell * ' + f1(CS) + ' + ' + f1(GUT) + ' + fract(cTu) * ' + f1(IN) + ') / cAt;',
          'vec2 cG1 = dFdx(cTu) * ' + f1(IN) + ' / cAt, cG2 = dFdy(cTu) * ' + f1(IN) + ' / cAt;',
          'float cL = max(length(cG1 * cAt), length(cG2 * cAt));',
          'if (cL > 30.0) { float k = 30.0 / cL; cG1 *= k; cG2 *= k; }',
          // grazing facades: the Low map has 2x anisotropy, so a footprint longer than 2:1 sparkles (window dots); widen the minor axis to
          // half the major one (what 2x anisotropic hardware samples anyway: no change there, no shimmer where anisotropy is weaker)
          'float cA1 = length(cG1), cA2 = length(cG2); if (cA1 > 2.0 * cA2) cG2 *= 0.5 * cA1 / max(cA2, 1e-6); else if (cA2 > 2.0 * cA1) cG1 *= 0.5 * cA2 / max(cA1, 1e-6);',
          'vec4 cTex = texture2DGradEXT(map, cAuv, cG1, cG2);',
          'float cFar = smoothstep(30.0, 90.0, cL);',
          'if (cFar > 0.0) { vec2 cc = (cCell * ' + f1(CS) + ' + ' + f1(CS / 2) + ') / cAt; cTex = mix(cTex, texture2DLodEXT(map, cc, 8.0), cFar); }',
          'float cWall = clamp(cTex.a * 2.0 - 1.0, 0.0, 1.0), cAccW = clamp(1.0 - cTex.a * 2.0, 0.0, 1.0);',
          'vec4 texelColor = mapTexelToLinear(vec4(cTex.rgb, 1.0));',
          'float cJit = 0.95 + 0.1 * fract(cH * 31.7);',
          'diffuseColor.rgb *= texelColor.rgb * (1.0 + cWall * (vColor * cJit - 1.0) + cAccW * (vAcc - 1.0));'].join('\n'))
        .replace('#include <color_fragment>', '')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * ' + amb.toFixed(3) + ';');
    };
    mat.customProgramCacheKey = () => 'ei-city-lambert-' + (offset ? 'p' : 'd') + '-' + amb.toFixed(3);
    return mat;
  }
  function cityMaterial(lite, offset) {
    if (lite && !(typeof window !== 'undefined' && window.__cityStd)) return cityLambert(offset);
    const A = buildAtlas();
    const mat = new THREE.MeshStandardMaterial({ map: A.map, vertexColors: true, roughness: 0.85, metalness: 0.0 });
    mat.extensions = { derivatives: true, shaderTextureLOD: true };
    if (offset) { mat.polygonOffset = true; mat.polygonOffsetFactor = 1.5; mat.polygonOffsetUnits = 6; }
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.cityPk = { value: A.pk };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 acell;\nattribute vec3 acol;\nvarying vec3 vCell;\nvarying vec3 vAcc;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCell = acell; vAcc = acol;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCell;\nvarying vec3 vAcc;\nuniform sampler2D cityPk;').replace('#include <uv_pars_fragment>', '#include <uv_pars_fragment>\n' + PERTURB)
        .replace('#include <map_fragment>', [
          'vec2 cTu = vUv; vec2 cTi = floor(cTu);',
          'float cH = fract(sin(dot(cTi + vCell.xy * vec2(7.13, 3.71), vec2(12.9898, 78.233))) * 43758.5453);',
          'float cVar = min(floor(pow(cH, 1.4) * vCell.z), vCell.z - 1.0);',
          'vec2 cCell = vec2(vCell.x + cVar, vCell.y);',
          'const vec2 cAt = vec2(' + f1(AW) + ', ' + f1(AH) + ');',
          'vec2 cAuv = (cCell * ' + f1(CS) + ' + ' + f1(GUT) + ' + fract(cTu) * ' + f1(IN) + ') / cAt;',
          'vec2 cG1 = dFdx(cTu) * ' + f1(IN) + ' / cAt, cG2 = dFdy(cTu) * ' + f1(IN) + ' / cAt;',
          // texels per pixel along the worse axis; the wrapped gutter keeps mips clean to 1/32: beyond, fade to the cell average
          'float cL = max(length(cG1 * cAt), length(cG2 * cAt));',
          'if (cL > 30.0) { float k = 30.0 / cL; cG1 *= k; cG2 *= k; }',
          'vec4 cTex = texture2DGradEXT(map, cAuv, cG1, cG2);',
          'vec4 cPk = texture2DGradEXT(cityPk, cAuv, cG1, cG2);',
          'float cFar = smoothstep(30.0, 90.0, cL);',
          'if (cFar > 0.0) { vec2 cc = (cCell * ' + f1(CS) + ' + ' + f1(CS / 2) + ') / cAt; cTex = mix(cTex, texture2DLodEXT(map, cc, 8.0), cFar); cPk = mix(cPk, texture2DLodEXT(cityPk, cc, 7.0), cFar); }',
          'float cWall = clamp(cTex.a * 2.0 - 1.0, 0.0, 1.0), cAccW = clamp(1.0 - cTex.a * 2.0, 0.0, 1.0);',
          'vec4 texelColor = mapTexelToLinear(vec4(cTex.rgb, 1.0));',
          'float cJit = 0.95 + 0.1 * fract(cH * 31.7);',
          'diffuseColor.rgb *= texelColor.rgb * (1.0 + cWall * (vColor * cJit - 1.0) + cAccW * (vAcc - 1.0));',
          'float cGlass = smoothstep(0.62, 0.95, cPk.a), cLit = clamp(1.0 - abs(cPk.a - 0.5) * 4.0, 0.0, 1.0);'].join('\n'))
        .replace('#include <color_fragment>', '')
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = max(0.04, cPk.b);')
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = cGlass * 0.6;')
        .replace('#include <normal_fragment_maps>', lite ? '' : 'vec3 cN = vec3((cPk.rg * 2.0 - 1.0) * (1.0 - cFar), 0.0); cN.z = sqrt(max(0.05, 1.0 - dot(cN.xy, cN.xy))); normal = cityPerturb(-vViewPosition, normal, cN, faceDirection);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * cLit * 0.55;');
    };
    mat.customProgramCacheKey = () => 'ei-city2' + (lite ? '-lite' : '');
    return mat;
  }

  // ================================================================ merged geometry in spatial tiles (one material for the whole city)
  // Vertex: position f32x3, normal i8x3, uv f32x2 (bays / storeys), colour u8x3 (wall tint), acol u8x3 (accent), acell u8x3.
  // Each tile keeps three index lists drawn in order: 0 core, 1 extras (roof furniture, awnings...), 2 trees; the low tier stops
  // its draw range after the core.
  class Tile {
    constructor(kind, key) { this.kind = kind; this.key = key; this.nv = 0; this.cap = 0; this.idx = [[], [], []]; this.grow(2048); }
    grow(n) {
      const cap = Math.max(n, this.cap * 2); const cp = (Old, k, T) => { const a = new T(cap * k); if (Old) a.set(Old.subarray(0, this.nv * k)); return a; };
      this.P = cp(this.P, 3, Float32Array); this.N = cp(this.N, 3, Int8Array); this.T = cp(this.T, 2, Float32Array); this.Cw = cp(this.Cw, 3, Uint8Array); this.Ca = cp(this.Ca, 3, Uint8Array); this.Cl = cp(this.Cl, 3, Uint8Array); this.cap = cap;
    }
  }
  const b8 = (v) => Math.round(U.clamp(v, 0, 1) * 255);
  class Geo {
    constructor(E) { this.E = E; this.tiles = new Map(); this.cur = null; this.sub = 0; this.tris = 0; this.acc = WHITE; this.mode = 'D'; }
    // pick the tile for an object at (x, z): detail tiles 240 m; proxy tiles 800 m near the circuit, 1600 m out on the hills (480 / 1200 m measured: -9 % tris for +4 calls, not worth it)
    at(x, z, kind, sub) {
      kind = kind || 'D'; this.sub = sub || 0; const S = kind === 'D' ? 240 : (this.E.dcAt(x, z) < 900 ? 800 : 1600);
      const key = kind + S + ':' + Math.floor(x / S) + ',' + Math.floor(z / S); let c = this.tiles.get(key); if (!c) { c = new Tile(kind, key); this.tiles.set(key, c); } this.cur = c; return c;
    }
    vert(p, n, u, v, col, cl) {
      const c = this.cur; if (c.nv >= c.cap) c.grow(c.cap * 2); const i = c.nv, a = this.acc;
      c.P[i * 3] = p[0]; c.P[i * 3 + 1] = p[1]; c.P[i * 3 + 2] = p[2]; c.N[i * 3] = Math.round(n[0] * 127); c.N[i * 3 + 1] = Math.round(n[1] * 127); c.N[i * 3 + 2] = Math.round(n[2] * 127);
      c.T[i * 2] = u; c.T[i * 2 + 1] = v; c.Cw[i * 3] = b8(col.r); c.Cw[i * 3 + 1] = b8(col.g); c.Cw[i * 3 + 2] = b8(col.b); c.Ca[i * 3] = b8(a.r); c.Ca[i * 3 + 1] = b8(a.g); c.Ca[i * 3 + 2] = b8(a.b);
      c.Cl[i * 3] = cl[0]; c.Cl[i * 3 + 1] = cl[1]; c.Cl[i * 3 + 2] = cl[2]; return c.nv++;
    }
    push3(a, b, c) { this.cur.idx[this.sub].push(a, b, c); this.tris++; }
    // quad a-b-c-d counter-clockwise seen from the front (a bottom-left), uv per corner, flat normal n (computed when null)
    quad(a, b, c, d, n, uvs, col, cl) {
      if (!n) { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2]; let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; n = [nx / l, ny / l, nz / l]; }
      else { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2]; if ((uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2] < 0) { const t = b; b = d; d = t; uvs = [uvs[0], uvs[1], uvs[6], uvs[7], uvs[4], uvs[5], uvs[2], uvs[3]]; } }
      const i0 = this.vert(a, n, uvs[0], uvs[1], col, cl), i1 = this.vert(b, n, uvs[2], uvs[3], col, cl), i2 = this.vert(c, n, uvs[4], uvs[5], col, cl), i3 = this.vert(d, n, uvs[6], uvs[7], col, cl);
      const I = this.cur.idx[this.sub]; I.push(i0, i1, i2, i0, i2, i3); this.tris += 2;
    }
    // as quad() but the winding is kept as given whatever the normal (two-sided foliage lit from above)
    quadKeep(a, b, c, d, n, uvs, col, cl) { const i0 = this.vert(a, n, uvs[0], uvs[1], col, cl), i1 = this.vert(b, n, uvs[2], uvs[3], col, cl), i2 = this.vert(c, n, uvs[4], uvs[5], col, cl), i3 = this.vert(d, n, uvs[6], uvs[7], col, cl); this.cur.idx[this.sub].push(i0, i1, i2, i0, i2, i3); this.tris += 2; }
    tri(a, b, c, n, uvs, col, cl) { const i0 = this.vert(a, n, uvs[0], uvs[1], col, cl), i1 = this.vert(b, n, uvs[2], uvs[3], col, cl), i2 = this.vert(c, n, uvs[4], uvs[5], col, cl); this.push3(i0, i1, i2); }
    // horizontal polygon (ring with positive area2), facing up (or down), world-scaled uv (tile = `tile` metres)
    cap(ring, y, col, cl, tile, down) {
      const pts = ring.map(q => new THREE.Vector2(q[0], q[1])); let tris; try { tris = THREE.ShapeUtils.triangulateShape(pts, []); } catch (e) { return; }
      const n = down ? [0, -1, 0] : [0, 1, 0]; const base = []; for (const q of ring) base.push(this.vert([q[0], y, q[1]], n, q[0] / tile, -q[1] / tile, col, cl));
      for (const t of tris) { const A = ring[t[0]], B = ring[t[1]], Cc = ring[t[2]]; const cr = (B[0] - A[0]) * (Cc[1] - A[1]) - (B[1] - A[1]) * (Cc[0] - A[0]); if ((cr > 0) === !!down) this.push3(base[t[0]], base[t[1]], base[t[2]]); else this.push3(base[t[0]], base[t[2]], base[t[1]]); }
    }
    // a cap over `pts` triangulated with the topology of `topo` (same vertex count): insets of awkward footprints keep a clean fill
    capTopo(topo, pts, y, col, cl, tile) {
      const v2 = topo.map(q => new THREE.Vector2(q[0], q[1])); let tris; try { tris = THREE.ShapeUtils.triangulateShape(v2, []); } catch (e) { return; }
      const n = [0, 1, 0]; const base = pts.map(q => this.vert([q[0], y, q[1]], n, q[0] / tile, -q[1] / tile, col, cl));
      for (const t of tris) { const A = topo[t[0]], B = topo[t[1]], Cc = topo[t[2]]; const cr = (B[0] - A[0]) * (Cc[1] - A[1]) - (B[1] - A[1]) * (Cc[0] - A[0]); if (cr > 0) this.push3(base[t[0]], base[t[2]], base[t[1]]); else this.push3(base[t[0]], base[t[1]], base[t[2]]); }
    }
    // band between two rings with the same vertex count (inner ring a, outer ring b) at height y: a horizontal annulus
    band(a, b, y, col, cl, tile, down) { for (let i = 0; i < a.length; i++) { const j = (i + 1) % a.length; const A = [a[i][0], y, a[i][1]], B = [a[j][0], y, a[j][1]], Cc = [b[j][0], y, b[j][1]], D = [b[i][0], y, b[i][1]]; const uv = [a[i][0] / tile, -a[i][1] / tile, a[j][0] / tile, -a[j][1] / tile, b[j][0] / tile, -b[j][1] / tile, b[i][0] / tile, -b[i][1] / tile]; this.quad(A, B, Cc, D, down ? [0, -1, 0] : [0, 1, 0], uv, col, cl); } }
    // box from a footprint rectangle (centre, axis u, half sizes), y0..y1; sides with cellSide (bw / fh metres per tile), top with cellTop
    box(cx, cz, ux, uz, hl, hw, y0, y1, col, cellSide, cellTop, bw, fh, topCol) { const ring = rectRing(cx, cz, ux, uz, hl, hw); this.prism(ring, y0, y1, col, cellSide, bw, fh, 0); if (cellTop) this.cap(ring, y1, topCol || col, cellTop, 3); }
    // vertical walls round a ring (outward), bays of bw metres (negative: |bw| bays per metre... see nb), storeys of fh metres from v0
    prism(ring, y0, y1, col, cl, bw, fh, v0, u0) {
      let u = u0 || 0;
      for (let i = 0; i < ring.length; i++) {
        const P0 = ring[i], P1 = ring[(i + 1) % ring.length]; const dx = P1[0] - P0[0], dz = P1[1] - P0[1]; const L = Math.hypot(dx, dz); if (L < 0.05) continue;
        const n = [dz / L, 0, -dx / L]; const nb = bw > 0 ? Math.max(1, Math.round(L / bw)) : L / -bw; const vv0 = v0 || 0, vv1 = vv0 + (y1 - y0) / fh;
        this.quad([P1[0], y0, P1[1]], [P0[0], y0, P0[1]], [P0[0], y1, P0[1]], [P1[0], y1, P1[1]], n, [u, vv0, u + nb, vv0, u + nb, vv1, u, vv1], col, cl);
        u += nb;
      }
    }
    // a surface of revolution (domes, drums, lanterns, tanks, parasols): profile [[r, y], ...] bottom to top round (cx, cz)
    lathe(cx, cz, prof, segs, col, cl, vScale, uScale) {
      for (let k = 0; k + 1 < prof.length; k++) {
        const [r0, y0] = prof[k], [r1, y1] = prof[k + 1]; const sl = Math.hypot(r1 - r0, y1 - y0) || 1; const nr = (y1 - y0) / sl, ny = -(r1 - r0) / sl;
        for (let i = 0; i < segs; i++) {
          const a0 = i / segs * Math.PI * 2, a1 = (i + 1) / segs * Math.PI * 2; const am = (a0 + a1) / 2;
          const P = (r, y, a) => [cx + Math.cos(a) * r, y, cz - Math.sin(a) * r]; const n = [Math.cos(am) * nr, ny, -Math.sin(am) * nr];
          const us = uScale || 0.5; const u0 = i * us, u1 = (i + 1) * us, v0 = k * (vScale || 1), v1 = (k + 1) * (vScale || 1);
          if (r0 < 0.02 && r1 < 0.02) continue;
          this.quad(P(r0, y0, a1), P(r0, y0, a0), P(r1, y1, a0), P(r1, y1, a1), n, [u0, v0, u1, v0, u1, v1, u0, v1], col, cl);
        }
      }
    }
    meshes(group, mats) {
      const out = [];
      for (const [key, c] of this.tiles) {
        if (!c.nv) continue; const g = new THREE.BufferGeometry(); const nv = c.nv;
        g.setAttribute('position', new THREE.BufferAttribute(c.P.slice(0, nv * 3), 3)); g.setAttribute('normal', new THREE.BufferAttribute(c.N.slice(0, nv * 3), 3, true)); g.setAttribute('uv', new THREE.BufferAttribute(c.T.slice(0, nv * 2), 2));
        g.setAttribute('color', new THREE.BufferAttribute(c.Cw.slice(0, nv * 3), 3, true)); g.setAttribute('acol', new THREE.BufferAttribute(c.Ca.slice(0, nv * 3), 3, true)); g.setAttribute('acell', new THREE.BufferAttribute(c.Cl.slice(0, nv * 3), 3, false));
        const n0 = c.idx[0].length, n1 = c.idx[1].length, n2 = c.idx[2].length; const I = nv > 65535 ? new Uint32Array(n0 + n1 + n2) : new Uint16Array(n0 + n1 + n2);
        I.set(c.idx[0], 0); I.set(c.idx[1], n0); I.set(c.idx[2], n0 + n1); g.setIndex(new THREE.BufferAttribute(I, 1));
        g.computeBoundingSphere(); g.computeBoundingBox();
        const m = new THREE.Mesh(g, c.kind === 'D' ? mats.D : mats.P); m.name = c.kind === 'D' ? 'cityDetail' : 'cityProxy';
        m.castShadow = c.kind === 'D'; m.receiveShadow = true; m.renderOrder = c.kind === 'D' ? 0 : 1;
        m.userData.box = g.boundingBox; m.userData.kind = c.kind; m.userData.ranges = [n0, n0 + n1, n0 + n1 + n2];
        m.matrixAutoUpdate = false; m.updateMatrix(); group.add(m); out.push(m);
      }
      this.tiles.clear(); return out;
    }
  }

  // ================================================================ building styles
  // bw / fh: bay width and storey height (m); gh: ground floor height
  const STY = {
    riviera: { bw: 3.4, fh: 3.0, gh: 4.2, roof: 'flat' },
    belle: { bw: 3.6, fh: 3.8, gh: 5.0, roof: 'mansard', cornice: true, perFloor: true },
    villa: { bw: 3.2, fh: 3.2, gh: 3.8, roof: 'hip', cornice: true },
    old: { bw: 3.0, fh: 3.0, gh: 3.4, roof: 'hip' },
    modern: { bw: 3.0, fh: 3.25, gh: 5.2, roof: 'flat' },
    office: { bw: 3.0, fh: 3.5, gh: 4.6, roof: 'flat' },
    church: { bw: 4.5, fh: 6.0, gh: 6.0, roof: 'hip' },
    plain: { bw: 4.0, fh: 3.5, gh: 4.0, roof: 'flat' },
    palace: { bw: 4.0, fh: 3.6, gh: 4.4, roof: 'flat' },
    hotel: { bw: 6.0, fh: 3.3, gh: 4.5, roof: 'flat' },
    pth: { bw: 3.4, fh: 3.0, gh: 4.2, roof: 'flat' },   // the porthole block at the Nouvelle Chicane (pth_flr / pth_gnd, bay 3.4 x storey 3.0)
  };
  const TINTS = {
    riviera: [0xf3ead9, 0xe8c99a, 0xf0c9b5, 0xf7f4ee, 0xe3b98f, 0xead8c0, 0xdba590, 0xf5e2b8, 0xf2e0cc, 0xeeeae2, 0xe9cfa8, 0xe6b4a2, 0xf4efe4, 0xdcc0a0],
    belle: [0xefe3c6, 0xf2e6cf, 0xe9d5b0, 0xf4ecdc, 0xe8cfb0, 0xf0d9c2, 0xeadcc0, 0xf3e0c0],
    villa: [0xf2d3a7, 0xefc7b2, 0xe9d9be, 0xdcb48c, 0xf3e4c9, 0xe7c0a0, 0xf1dcb4, 0xe8b9a2, 0xf0d0a8, 0xe0a890],
    old: [0xe8b77a, 0xe9c79a, 0xe7a98a, 0xf0d7a4, 0xd9a275, 0xedc48e, 0xe2b48c, 0xefcfa0],
    modern: [0xf2f3f2, 0xe2e5e6, 0xd9dcdd, 0xeceae4],
    office: [0xe8e6e0, 0xdcd8d0, 0xf0ede6],
    church: [0xefe8da, 0xe9e0cc],
    plain: [0xdedad2, 0xcfcac0, 0xe6e1d6],
  };
  // accent colours (shutters, awnings, rails, doors) per style
  const ACCS = {
    riviera: [0x36598a, 0x2c4a6e, 0x2f6e86, 0x8a5434, 0xc0703a, 0x5f7f6a, 0x6e7378, 0xeeece6, 0x9a3a32, 0x406a4a, 0xb89060],
    belle: [0x6a7a6a, 0x868e86, 0xe4e0d6, 0x56665c, 0xa09a88, 0x7a8a96],
    villa: [0x5f7f5f, 0x46705a, 0x6f8fa0, 0xb0a080, 0x8a5a3a, 0xe0ddd2, 0x6a8a7a],
    old: [0x4f6f4f, 0x6a8a6a, 0x5a7f8f, 0x8a6a4a, 0x5a6a7a],
    modern: [0xb8c0c4, 0x90989c, 0xd8dcde], office: [0x9aa0a4, 0xc0c4c6], church: [0x6a5a4a], plain: [0x8a8a86, 0xb0aca4], palace: [0x4f6f4f], hotel: [0xd0d4d6],
  };
  const ROOFT = [0xa0604a, 0xa86a52, 0x96584a, 0xae7258, 0x9a6450, 0xa66e58, 0x8e5a48, 0xb47c62];
  const FLATT = [0xb9b5ad, 0xa9a59d, 0xc8c4bb, 0xbdb3a4, 0xc4bcb0];
  const WHITE = C(0xf4f2ee), STONE_TRIM = C(0xf6efe0);
  // pull a colour part of the way to its own grey (the frame grade boosts saturation hard; render colours stay pastel)
  const soften = (c, k) => { const l = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722; return new THREE.Color(c.r + (l - c.r) * k, c.g + (l - c.g) * k, c.b + (l - c.b) * k); };
  const pick = (arr, h) => arr[Math.min(arr.length - 1, Math.floor(h * arr.length))];
  const scaleC = (c, k) => new THREE.Color(Math.min(1, c.r * k), Math.min(1, c.g * k), Math.min(1, c.b * k));
  const DEFAULT_H = { yes: 16, apartments: 24, residential: 22, hotel: 30, commercial: 20, retail: 12, office: 24, house: 9, church: 20, chapel: 10, public: 18, civic: 18, school: 14, restaurant: 8, garage: 4, garages: 4, parking: 12 };
  const KC = { apartments: 1, residential: 1, house: 2, detached: 2, commercial: 3, retail: 3, office: 3, hotel: 4, church: 5, chapel: 5, cathedral: 5, public: 6, civic: 6, school: 6, college: 6, government: 6, industrial: 7, garage: 7, garages: 7, parking: 7, service: 7, kiosk: 7, toilets: 7 };

  // neighbourhood of a point (Monaco): drives the mix of styles
  function zoneAt(E, x, z) {
    const Z = E.cityZones; if (Math.hypot(x - Z.casino[0], z - Z.casino[1]) < 230) return 'casino';
    if (E.plateaus && E.plateaus[0] && pip(x, z, E.plateaus[0].p)) return 'rocher';
    if (x > 780 && z < -560 || x > 860) return 'larvotto';   // (Mirabeau / Portier, x 640-780, is still Monte-Carlo masonry)
    if (x < -250 && z > 380) return 'fontvieille';
    if (Math.hypot(x - Z.devote[0], z - Z.devote[1]) < 190) return 'devote';
    if (z < -860) return 'beausoleil';
    if (z < -280 && x > 100 && x < 640) return 'montecarlo';
    if (x < 130 && z > -260 && z < 420) return 'condamine';
    return 'hill';
  }
  const MIX = {
    casino: [['belle', 0.8], ['villa', 1]], montecarlo: [['belle', 0.35], ['villa', 0.6], ['riviera', 1]], devote: [['belle', 0.3], ['villa', 0.6], ['riviera', 1]],
    rocher: [['old', 0.9], ['villa', 1]], condamine: [['riviera', 0.55], ['villa', 0.9], ['belle', 1]], larvotto: [['modern', 0.3], ['riviera', 1]],
    fontvieille: [['riviera', 0.8], ['modern', 1]], beausoleil: [['villa', 0.5], ['riviera', 0.92], ['belle', 1]], hill: [['riviera', 0.55], ['villa', 0.97], ['modern', 1]],
  };
  // style, storeys, colours and the facade programme for a footprint
  function design(E, b, cx, cz, area, minW) {
    const zone = zoneAt(E, cx, cz); const h1 = hash(cx * 3.1, cz * 2.7, 11), h2 = hash(cx * 1.7, cz * 4.3, 12), h3 = hash(cx * 5.3, cz * 1.9, 13), h5 = hash(cx * 2.9, cz * 3.3, 15), h6 = hash(cx * 4.1, cz * 2.2, 16);
    const kc = b.kc != null ? b.kc : (KC[b.k] || 0);
    const known = b.h > 0 && !(b.k && DEFAULT_H[b.k] === b.h) && !(b.h === 16 && !DEFAULT_H[b.k]);
    let H = known ? b.h : 0;
    let style = 'riviera'; for (const [s, p] of MIX[zone]) { if (h1 <= p) { style = s; break; } }
    if (kc === 5) style = 'church'; else if (kc === 7) style = 'plain'; else if (kc === 3 && H > 0 && H < 14 && area > 600) style = 'office';
    else if (kc === 4) style = H > 42 ? 'modern' : 'belle';
    if (known && H > 58 && style !== 'church') style = zone === 'larvotto' && h2 < 0.6 || H > 100 && h2 < 0.5 ? 'modern' : 'riviera';
    if (style === 'modern' && !(known && H > 40) && zone !== 'larvotto') style = 'riviera';
    if (known && H > 30 && (style === 'old' || style === 'villa')) style = 'riviera';
    if (!known && area < 110 && style !== 'church') style = zone === 'rocher' ? 'old' : (h2 < 0.6 ? 'villa' : 'old');
    // Boulevard Albert I (the start straight, Rascasse exit to Ste Devote): sand-coloured apartment blocks with blue awnings
    const T = E.t, pa = T.project(cx, cz, null, E._dpr || (E._dpr = {}));
    const albert = T.data.id === 'monaco' && kc !== 5 && kc !== 7 && area > 150 && pa.dist < 75 && (pa.s > T.length - 330 || pa.s < 165);
    if (albert) style = 'riviera';
    // Monaco is masonry: glass curtain walls and office bands only out at Larvotto / Fontvieille and on the very tallest towers
    if ((style === 'modern' || style === 'office') && zone !== 'larvotto' && zone !== 'fontvieille' && !(known && H > 120)) style = 'riviera';
    const S = STY[style];
    if (!known) {
      let f0, f1;
      switch (style) {
        case 'riviera': f0 = zone === 'beausoleil' ? 4 : zone === 'condamine' || zone === 'devote' || zone === 'montecarlo' ? 6 : 5; f1 = zone === 'beausoleil' ? 8 : 12; break;
        case 'belle': f0 = 4; f1 = 6; break;
        case 'villa': f0 = 2; f1 = 6; break;
        case 'old': f0 = 2; f1 = 4; break;
        case 'modern': f0 = 9; f1 = 18; break;
        case 'church': f0 = 1; f1 = 2; break;
        default: f0 = 1; f1 = 3;
      }
      if (area < 120) f1 = Math.min(f1, 4); else if (area < 260) f1 = Math.min(f1, 7);
      if (zone === 'hill' || zone === 'beausoleil') { const g = E.groundAbs ? E.groundAbs(cx, cz) : 0; if (g > 180) f1 = Math.min(f1, 4); if (g > 260) f1 = Math.min(f1, 3); }
      f0 = Math.min(f0, f1); const nf = f0 + Math.floor(h3 * (f1 - f0 + 1)); H = S.gh + nf * S.fh;
    }
    H = Math.min(H, Math.max(9, Math.sqrt(area) * 5.5)); if (area < 90) H = Math.min(H, 3.5 + Math.sqrt(area) * 0.9);   // kiosks, pavilions, monuments stay low
    if (minW && minW < 5) H = Math.min(H, Math.max(4, minW * 2.6));   // slivers (walls, arcades, passages) too
    const nf = Math.max(0, Math.round((H - S.gh) / S.fh)); H = S.gh + nf * S.fh;
    // the pink / peach blocks at Portier and the ochre-pink row of the Quai Antoine Ier above Rascasse
    const mc = T.data.id === 'monaco' && pa.dist < 90 && (style === 'riviera' || style === 'belle' || style === 'villa');
    const pinkP = mc && pa.s > 1330 && pa.s < 1470, pinkR = mc && pa.s > 2770 && pa.s < 2960;
    const tint = albert ? soften(C(pick([0xead3a2, 0xefdcb4, 0xf1e2c0, 0xf0d2bc, 0xe9c4a8, 0xf3ece0, 0xe5cb96, 0xeccab4], h2)), 0.18) : pinkP ? C(pick([0xebbaa6, 0xf0c6b2, 0xe6ab96, 0xf2d2c0], h2)) : pinkR ? C(pick([0xe6a88e, 0xe3b480, 0xeec29c, 0xdc9c84, 0xe8b896], h2)) : soften(C(pick(TINTS[style] || TINTS.plain, h2)), 0.3), acc = C(pick(ACCS[style] || ACCS.plain, h5));
    let roof = S.roof; if (b.roof === 1) roof = 'flat'; else if (b.roof === 2) roof = 'hip'; if (roof === 'mansard' && (area < 160 || nf < 3)) roof = 'flat'; if (roof === 'hip' && area > (zone === 'rocher' ? 2600 : 900)) roof = 'flat'; if (zone === 'rocher' && roof === 'flat' && area < 2600 && b.roof !== 1 && h6 < 0.8) roof = 'hip'; if (style === 'villa' && h3 < 0.35 && area > 200) roof = 'flat';
    if (style === 'riviera' && nf <= 4 && area < 500 && h6 < 0.35) roof = 'hip';
    const roofTint = roof === 'flat' ? C(pick(FLATT, h3)) : roof === 'mansard' ? C(0x8e969c) : soften(C(pick(ROOFT, h3)), 0.22);
    // the Riviera programme: wrap-round balconies on the towers, balconies on the long faces, loggias, punched windows, late-modern
    let rv = null, rail = 0;
    if (style === 'riviera') {
      // towers carry balconies (wrap-round bands on most, the long faces on the rest); punched walls only on the smaller blocks
      if (H >= 28) rv = h6 < 0.58 ? 'wrap' : h6 < 0.86 ? 'long' : h6 < 0.94 ? 'loggia' : 'rv60';
      else rv = H >= 22 && area > 160 && h6 < 0.42 ? 'wrap' : h6 < 0.72 ? 'long' : h6 < 0.8 ? 'loggia' : h6 < 0.9 ? 'rv60' : 'punched';
      if (zone === 'larvotto' || zone === 'fontvieille') { if (h6 > 0.6) rv = 'mod'; }
      rail = Math.floor(h3 * 4) % 4; if (rv === 'mod') rail = 2;
    }
    if (albert) { roof = 'flat'; rv = h6 < 0.45 ? 'punched' : 'long'; }
    const awnP = albert ? 0.85 : style === 'riviera' && rv !== 'mod' ? (h5 < 0.35 ? 0.55 : h5 < 0.6 ? 0.18 : 0) : 0;
    // towers step back for their top floors (a penthouse ring with a terrace), the tallest get a crown
    let sb = null; if (!albert && (style === 'riviera' || style === 'modern') && nf >= 9 && area > 260 && h1 * 7 % 1 < 0.6) sb = { n: 1 + (h2 * 5 % 1 < 0.4 ? 1 : 0), d: 2.2 + h3 * 1.6 };
    return { zone, style, S, nf, H, tint, acc, roof, roofTint, rv, rail, awnP, albert, sb, seed: Math.floor(h1 * 997), shops: zone !== 'hill' && zone !== 'beausoleil' && style !== 'villa' && style !== 'old' };
  }

  // ================================================================ placement tests against the circuit
  function clear(E, x, z, m) { const t = E.t; const p = t.project(x, z, null, E._cpr || (E._cpr = {})); return p.dist > Math.max(t.wallL[p.i], t.wallR[p.i]) + m; }
  function segClear(E, a, b, m) { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.ceil(L / 1.5)); for (let k = 0; k <= n; k++) if (!clear(E, a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, m)) return false; return true; }
  function ringClear(E, r, m) { for (let i = 0; i < r.length; i++) if (!segClear(E, r[i], r[(i + 1) % r.length], m)) return false; return true; }
  // landmark outlines that reach into the circuit's corridor: densify, then push the offending points back to the barrier line + m
  function pushClear(E, ring, m) {
    const t = E.t, out = [], pr = {}; let moved = false;
    for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.ceil(L / 2.5)); for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
    for (const q of out) { for (let it = 0; it < 3; it++) { t.project(q[0], q[1], null, pr); const need = Math.max(t.wallL[pr.i], t.wallR[pr.i]) + m; if (pr.dist >= need) break; const sg = pr.lat < 0 ? -1 : 1; const d = need - pr.dist + 0.05; q[0] += t.nx[pr.i] * sg * d; q[1] += t.nz[pr.i] * sg * d; moved = true; } }
    return moved ? cleanRing(out) : ring;
  }

  // ================================================================ one building from its footprint
  // levels shared by the detail and the proxy builds (computed once per design)
  function levels(E, ring, D, cx, cz) {
    if (D.lv) return D.lv; const sc = E.sc, S = D.S;
    let gMin = Infinity, gMax = -Infinity; for (const q of ring) { const g = sc.height(q[0], q[1]); if (g < gMin) gMin = g; if (g > gMax) gMax = g; }
    const gc = sc.height(cx, cz); gMin = Math.min(gMin, gc); gMax = Math.max(gMax, gc);
    const yG = D.yG != null ? D.yG : gMin, yb = Math.min(yG, gMin) - 2.5 - Math.min((gMax - gMin) * 0.3, 4), yR = yG + D.H;   // (the slack under the lowest corner is capped: a steep or odd ring used to drop the plinth by tens of metres = the Portier 'pillars'; faces over a real drop get their own foundation wall, faceFoundation)
    const ob = obb(ring) || { cx, cz, ux: 1, uz: 0, hl: 5, hw: 5 }; ob.cx = ob.cx != null ? ob.cx : cx;
    let sbRing = null; if (D.sb) { sbRing = offsetRing(ring, D.sb.d); if (sbRing && Math.abs(area2(sbRing)) / 2 < 70) sbRing = null; }
    const nsb = sbRing ? D.sb.n : 0; const yTop = yR - nsb * S.fh;
    const parH = D.roof === 'flat' ? (D.style === 'modern' ? 1.2 : 0.95) : 0;
    D.lv = { yG, yb, yR, yTop, ob, sbRing, nsb, parH, far: E.dcAt(cx, cz) > 460, gMax }; D.yR = yR; D.yBase = yb; return D.lv;
  }
  // facade cells of one face: ground floor, a storey (k), the whole upper facade at once, the painted balcony cell for proxies
  function faceCells(D, s, mode, rvN) {
    const st = D.style, r = D.rail; const painted = r === 1 ? 'rvbW' : r >= 2 ? 'rvbG' : 'rvbT';
    let gnd, flr, single;
    if (D.casino) return { gnd: cell('cas_gnd'), single: cell('cas_arch'), flr: (k) => k === 0 ? cell('cas_arch') : cell('cas_top') };
    if (D.pth) return { gnd: cell('pth_gnd'), single: cell('pth_flr'), flr: () => cell('pth_flr') };
    if (D.hdp) return { gnd: cell('hdp_gnd'), single: cell('hdp_flr'), flr: (k) => k === 0 ? cell('be_piano') : k === D.nf - 1 ? cell('be_top') : cell('hdp_flr') };
    if (D.style === 'rascasse') return { gnd: cell('mg_gnd'), single: cell('vl_top'), flr: () => cell('vl_top') };
    switch (st) {
      case 'riviera': {
        gnd = D.shops && s.street ? cell('shop') : cell('lobby', s.L > 12 && (s.u & 3) === 0 ? 0 : (s.u % 5 === 1 ? 1 : 0));
        if (D.shops && !s.street) gnd = (s.u & 1) ? cell('lobby', 0) : cell('shop');
        const balFace = D.rv === 'wrap' || (D.rv === 'long' && s.long) || (rvN === 'long' && s.long);
        if (balFace) { flr = s.balc ? cell('rvb') : cell(painted); single = cell(painted); }
        else if (D.rv === 'loggia' && s.long) flr = single = cell('loggia');
        else if (D.rv === 'rv60' && s.long) flr = single = cell('rv60');
        else if (D.rv === 'mod') flr = single = cell('mod_bal');
        else flr = single = cell('rv_win');
        return { gnd, flr: () => flr, single };
      }
      case 'belle': gnd = D.shops ? cell('be_gnd') : cell('be_gnd', 0); single = cell('be_flr');
        return { gnd, single, flr: (k) => k === 0 && D.nf > 2 ? cell('be_piano') : k === D.nf - 1 && D.nf > 2 ? cell('be_top') : cell('be_flr') };
      case 'villa': return { gnd: cell('vl_gnd'), single: cell('vl_flr'), flr: (k) => k === D.nf - 1 && D.roof === 'flat' ? cell('vl_top') : cell('vl_flr') };
      case 'old': return { gnd: cell('ot_gnd'), single: cell('ot_flr'), flr: () => cell('ot_flr') };
      case 'modern': return { gnd: cell('mg_gnd'), single: cell('mg_flr'), flr: () => cell('mg_flr') };
      case 'office': return { gnd: cell('shop'), single: cell('of_flr'), flr: () => cell('of_flr') };
      case 'church': return { gnd: cell('church'), single: cell('church'), flr: () => cell('church') };
      case 'palace': return { gnd: cell('palace'), single: cell('palace'), flr: () => cell('palace') };
      case 'hotel': return { gnd: cell('fair_gnd'), single: cell('fair_flr'), flr: () => cell('fair_flr') };
      default: return { gnd: cell('lobby', 1), single: cell('of_flr'), flr: () => cell('of_flr') };
    }
  }
  // the lowest level a face's foundation must reach: the ground just outside it (the terrain grid, not the verge ribbon which keeps the road's
  // level near the circuit); only faces within 45 m of a barrier can float over a drop, elsewhere the plinth slack is enough
  function faceFoundation(E, s, yG, yb) {
    const mx = (s.P0[0] + s.P1[0]) / 2, mz = (s.P0[1] + s.P1[1]) / 2; if (E.fsAt(mx, mz) > 45) return yb;
    let g = Infinity; for (const o of [1.5, 4]) { const y = E.sc.gridHeight(mx + s.n[0] * o, mz + s.n[2] * o); if (y < g) g = y; }
    return g < yb + 0.8 ? Math.max(Math.min(yb, g - 0.8), yG - 36) : yb;
  }
  function buildOne(E, G, ring, D, mode, cxz) {
    const S = D.S; const [cx, cz] = cxz; const L = levels(E, ring, D, cx, cz);
    const { yG, yb, yR, yTop, ob, parH } = L; const tint = D.tint; const proxy = mode === 'proxy', near = mode === 'near';
    G.acc = D.acc; G.at(cx, cz, proxy ? 'P' : 'D', 0);
    const nfMain = D.nf - L.nsb; const t = E.t; const pr = E._bpr || (E._bpr = {});
    // the sun-shade bake of the road (js/track.js streetShade) needs every building near the circuit as a prism (MONACO-UPGRADE)
    if (proxy && E.sc && E.dcAt(cx, cz) < 170) (E.sc.shadowPrisms || (E.sc.shadowPrisms = [])).push([ring, yb, yTop + parH + (D.roof === 'flat' ? 0 : 1.5)]);
    // faces: bays, the long axis, which faces look onto a street close by (shops, canopies)
    let u = D.seed % 41; const seg = [];
    for (let i = 0; i < ring.length; i++) {
      const P0 = ring[i], P1 = ring[(i + 1) % ring.length]; const dx = P1[0] - P0[0], dz = P1[1] - P0[1]; const Ls = Math.hypot(dx, dz); if (Ls < 0.05) continue;
      const n = [dz / Ls, 0, -dx / Ls]; const long = Math.abs(dx / Ls * ob.ux + dz / Ls * ob.uz) > 0.7 || ob.hl < ob.hw * 1.35; const nb = Math.max(1, Math.round(Ls / S.bw));
      const mx = (P0[0] + P1[0]) / 2, mz = (P0[1] + P1[1]) / 2; let street = false;
      if (!proxy) { t.project(mx, mz, null, pr); const tx = t.x[pr.i] - mx, tz = t.z[pr.i] - mz; const tl = Math.hypot(tx, tz) || 1; street = pr.dist < 60 && (tx * n[0] + tz * n[2]) / tl > 0.45; }
      seg.push({ P0, P1, L: Ls, n, d: [dx / Ls, dz / Ls], nb, u, long, street, balc: Ls >= 4.5 }); u += nb;
    }
    // which faces get modelled balconies near the circuit (they must clear the barriers)
    let rvN = D.rv; const balcN = near && D.style === 'riviera' && !D.noBalc && (rvN === 'wrap' || rvN === 'long');
    if (balcN) {
      if (rvN === 'wrap' && !ringClear(E, roundOutset(ring, 1.35, 3).ring, 1.2)) rvN = 'long';
      for (const s of seg) {
        if (rvN === 'wrap') { s.balc = true; continue; }
        if (!s.long || !s.balc) { s.balc = false; continue; } const ins = 0.25, o = [s.n[0] * 1.35, s.n[2] * 1.35];
        s.balc = segClear(E, [s.P0[0] + s.d[0] * ins + o[0], s.P0[1] + s.d[1] * ins + o[1]], [s.P1[0] - s.d[0] * ins + o[0], s.P1[1] - s.d[1] * ins + o[1]], 1.2);
      }
    } else for (const s of seg) s.balc = false;
    const wq = (s, y0, y1, v0, v1, cl, col) => G.quad([s.P1[0], y0, s.P1[1]], [s.P0[0], y0, s.P0[1]], [s.P0[0], y1, s.P0[1]], [s.P1[0], y1, s.P1[1]], s.n, [s.u, v0, s.u + s.nb, v0, s.u + s.nb, v1, s.u, v1], col || tint, cl);
    for (const s of seg) {
      const fc = faceCells(D, s, mode, rvN);
      if (proxy && L.far) { wq(s, yb, yTop + parH, (yb - yG - S.gh) / S.fh, (yTop + parH - yG - S.gh) / S.fh, fc.single); continue; }
      // on a slope the walls stand on a foundation: where the ground just outside the face falls well below the base (a building on a
      // cliff edge), a rough limestone retaining wall carries it down to the ground instead of the facade being repeated down the slope
      const yLow = faceFoundation(E, s, yG, yb);
            if (yLow < yb - 0.01) { const sw = Math.max(1, Math.round(s.L / 2.6)); G.quad([s.P1[0], yLow, s.P1[1]], [s.P0[0], yLow, s.P0[1]], [s.P0[0], yG, s.P0[1]], [s.P1[0], yG, s.P1[1]], s.n, [0, 0, sw, 0, sw, (yG - yLow) / 2.6, 0, (yG - yLow) / 2.6], C(0xe2d7c4), cell('stone')); if (!proxy) wq(s, yb, yG, (yb - yG) / 2.4, 0, cell('plinth'), C(0xe8e2d8)); }
      else if (!proxy) wq(s, yb, yG, (yb - yG) / 2.4, 0, cell('plinth'), C(0xe8e2d8));
      const g0 = proxy && yLow >= yb - 0.01 ? yb : yG; wq(s, g0, yG + S.gh, 1 - (yG + S.gh - g0) / S.gh, 1, fc.gnd);
      if (nfMain > 0) {
        if (near || (!proxy && S.perFloor)) { for (let k = 0; k < nfMain; k++) { const y0 = yG + S.gh + k * S.fh; wq(s, y0, y0 + S.fh, k, k + 1, fc.flr(k)); } }
        else wq(s, yG + S.gh, yTop, 0, nfMain, fc.single);
      }
      if (parH) wq(s, yTop, yTop + parH, 0, 0.32, cell('plain'), scaleC(tint, 1.03));
    }
    if (near) {
      if (balcN) balconies(E, G, ring, seg, D, L, rvN);
      if (D.style === 'riviera' && (D.rv === 'mod' || D.rv === 'loggia' || D.rv === 'rv60' || D.rv === 'punched' && D.nf > 3)) slabBands(E, G, ring, D, L, D.rv === 'mod' ? 0.6 : 0.3);
      if (D.style === 'belle' && D.nf > 2 && !D.noBalc) pianoBalcony(E, G, seg, D, L);
      shopCanopies(E, G, seg, D, L);
      if (D.albert) windowAwnings(E, G, seg, D, L);
    }
    if (S.cornice && !proxy) cornices(E, G, seg, D, L);
    roofOf(E, G, ring, D, mode, L);
  }
  // ---- continuous balconies: rounded bands wrapping the tower (or slabs along the long faces), parapets, awnings, dividers
  const railCell = (D) => [CELLS.rail[0] + (D.rail === 0 || D.rail === 1 ? (hash(D.seed, 3, 5) < 0.18 ? 3 : 0) : D.rail === 2 ? 1 : 2), NROW - 1 - CELLS.rail[1], 1];
  function balconies(E, G, ring, seg, D, L, rvN) {
    const S = D.S, dep = 1.35, th = 0.2, ph = 1.05, pt = 0.1; const slabC = cell('slab'), paveC = cell('terrace'), rc = railCell(D);
    const railCol = D.rail === 0 ? scaleC(D.tint, 1.04) : WHITE; const slabCol = D.rail === 0 ? scaleC(D.tint, 1.06) : WHITE; const nfMain = D.nf - L.nsb;
    if (rvN === 'wrap') {
      const out = roundOutset(ring, dep, 3); const R = out.ring;
      const inner = out.src.map(i => ring[i]); const Ri = roundOutset(ring, dep - pt, 3).ring; let U0 = 0;
      for (let k = 0; k < nfMain; k++) {
        const y = L.yG + S.gh + k * S.fh, y0 = y - th, y2 = y + ph;
        G.sub = 0; G.band(inner, R, y, C(0xd9cfc2), paveC, 2.4); G.band(inner, R, y0, scaleC(slabCol, 0.82), slabC, 3, true);
        for (let i = 0; i < R.length; i++) {
          const j = (i + 1) % R.length; const a = R[i], b = R[j], ai = Ri[i], bi = Ri[j]; const Ls = Math.hypot(b[0] - a[0], b[1] - a[1]); if (Ls < 0.02) continue; const n = [(b[1] - a[1]) / Ls, 0, -(b[0] - a[0]) / Ls]; const u1 = U0 + Ls / 2.4;
          G.quad([b[0], y0, b[1]], [a[0], y0, a[1]], [a[0], y, a[1]], [b[0], y, b[1]], n, [U0, 0, u1, 0, u1, 0.08, U0, 0.08], slabCol, slabC);
          G.quad([b[0], y, b[1]], [a[0], y, a[1]], [a[0], y2, a[1]], [b[0], y2, b[1]], n, [U0, 0, u1, 0, u1, 1, U0, 1], railCol, rc);
          G.quad([ai[0], y, ai[1]], [bi[0], y, bi[1]], [bi[0], y2, bi[1]], [ai[0], y2, ai[1]], [-n[0], 0, -n[2]], [U0, 0, u1, 0, u1, 1, U0, 1], scaleC(railCol, 0.86), rc);
          G.quad([b[0], y2, b[1]], [a[0], y2, a[1]], [ai[0], y2, ai[1]], [bi[0], y2, bi[1]], [0, 1, 0], [U0, 0, u1, 0, u1, 0.05, U0, 0.05], railCol, slabC);
          U0 = u1;
        }
        awningsOn(E, G, seg, D, y + S.fh - 0.25, dep - 0.15, k, true);
      }
      return;
    }
    // balconies along the long faces only
    const plainC = cell('slab');
    for (const s of seg) {
      if (!s.balc) continue; const ins = 0.25;
      const a = [s.P0[0] + s.d[0] * ins, s.P0[1] + s.d[1] * ins], b = [s.P1[0] - s.d[0] * ins, s.P1[1] - s.d[1] * ins]; const o = [s.n[0], s.n[2]];
      const A = [a[0] + o[0] * dep, a[1] + o[1] * dep], B = [b[0] + o[0] * dep, b[1] + o[1] * dep];
      const Lb = Math.hypot(b[0] - a[0], b[1] - a[1]); const nbb = Math.max(1, Math.round(Lb / 2.4));
      const Ai = [A[0] - o[0] * pt, A[1] - o[1] * pt], Bi = [B[0] - o[0] * pt, B[1] - o[1] * pt];
      for (let k = 0; k < nfMain; k++) {
        const y = L.yG + S.gh + k * S.fh; const y0 = y - th, y2 = y + ph; G.sub = 0;
        G.quad([B[0], y0, B[1]], [A[0], y0, A[1]], [A[0], y, A[1]], [B[0], y, B[1]], s.n, [0, 0, nbb, 0, nbb, 0.08, 0, 0.08], slabCol, plainC);
        G.quad([b[0], y0, b[1]], [a[0], y0, a[1]], [A[0], y0, A[1]], [B[0], y0, B[1]], [0, -1, 0], [0, 0, nbb, 0, nbb, 0.3, 0, 0.3], scaleC(slabCol, 0.8), plainC);
        G.quad([B[0], y, B[1]], [A[0], y, A[1]], [a[0], y, a[1]], [b[0], y, b[1]], [0, 1, 0], [0, 0, Lb / 2.4, 0, Lb / 2.4, dep / 2.4, 0, dep / 2.4], C(0xd9cfc2), paveC);
        G.quad([B[0], y, B[1]], [A[0], y, A[1]], [A[0], y2, A[1]], [B[0], y2, B[1]], s.n, [0, 0, nbb, 0, nbb, 1, 0, 1], railCol, rc);
        G.quad([Ai[0], y, Ai[1]], [Bi[0], y, Bi[1]], [Bi[0], y2, Bi[1]], [Ai[0], y2, Ai[1]], [-o[0], 0, -o[1]], [0, 0, nbb, 0, nbb, 1, 0, 1], scaleC(railCol, 0.85), rc);
        G.quad([B[0], y2, B[1]], [A[0], y2, A[1]], [Ai[0], y2, Ai[1]], [Bi[0], y2, Bi[1]], [0, 1, 0], [0, 0, nbb, 0, nbb, 0.05, 0, 0.05], railCol, plainC);
        for (const [P, Q, sg] of [[a, A, -1], [b, B, 1]]) { const nn = [s.d[0] * sg, 0, s.d[1] * sg]; const q0 = sg < 0 ? [Q, P] : [P, Q]; G.quad([q0[0][0], y0, q0[0][1]], [q0[1][0], y0, q0[1][1]], [q0[1][0], y2, q0[1][1]], [q0[0][0], y2, q0[0][1]], nn, [0, 0, 0.5, 0, 0.5, 1, 0, 1], railCol, rc); }
      }
      for (let k = 0; k < nfMain; k++) awningsOn(E, G, [s], D, L.yG + S.gh + k * S.fh + S.fh - 0.25, dep - 0.15, k);
    }
  }
  // canvas awnings over some balcony bays (accent stripes): a sloping sheet and its valance
  function awningsOn(E, G, segs, D, yTopA, out, k, all) {
    if (!D.awnP) return; const cl = cell(D.albert ? 'awnb' : 'awn'); G.sub = D.albert ? 0 : 1; const drop = 0.75; const acc = G.acc; if (D.albert) G.acc = AWN_BLUE;
    for (const s of segs) {
      if (!(all || s.long) || !s.balc) continue; const nb = Math.max(1, Math.round(s.L / D.S.bw)); const bw = s.L / nb;
      for (let j = 0; j < nb; j++) {
        if (hash(s.u + j * 7, k * 13 + D.seed, 77) > D.awnP) continue; const a0 = j * bw + 0.15, a1 = (j + 1) * bw - 0.15;
        const P = (al, o) => [s.P0[0] + s.d[0] * al + s.n[0] * o, s.P0[1] + s.d[1] * al + s.n[2] * o];
        const w0 = P(a0, 0.02), w1 = P(a1, 0.02), e0 = P(a0, out), e1 = P(a1, out); const yB = yTopA - drop;
        G.quad([w1[0], yTopA, w1[1]], [w0[0], yTopA, w0[1]], [e0[0], yB, e0[1]], [e1[0], yB, e1[1]], null, [0, 0, 1, 0, 1, 1, 0, 1], WHITE, cl);
        if (D.albert) { G.acc = AWN_UNDER; G.quad([w1[0], yTopA, w1[1]], [w0[0], yTopA, w0[1]], [e0[0], yB, e0[1]], [e1[0], yB, e1[1]], [0, -1, 0], [0, 0, 1, 0, 1, 1, 0, 1], WHITE, cl); G.acc = AWN_BLUE; }
        G.quad([e1[0], yB - 0.28, e1[1]], [e0[0], yB - 0.28, e0[1]], [e0[0], yB, e0[1]], [e1[0], yB, e1[1]], s.n, [0, 0, 1, 0, 1, 0.12, 0, 0.12], WHITE, cl);
      }
    }
    G.sub = 0; G.acc = acc;
  }
  // Boulevard Albert I: a blue drop-arm awning over most windows of the plain faces (core geometry: Low draws them too)
  const AWN_BLUE = C(0x2a7ad8), AWN_UNDER = C(0x1d5aa6);
  function windowAwnings(E, G, seg, D, L) {
    const S = D.S, cl = cell('awnb'), nfMain = D.nf - L.nsb, out = 0.85, drop = 0.7, vh = 0.26; const acc = G.acc; G.acc = AWN_BLUE; G.sub = 0;
    for (const s of seg) {
      if (s.balc || !(s.street || s.long) || s.L < 3) continue; const bw = s.L / s.nb;
      const up = [s.n[0] * drop, out, s.n[2] * drop]; const ul = Math.hypot(up[0], up[1], up[2]); up[0] /= ul; up[1] /= ul; up[2] /= ul;
      for (let k = 0; k < nfMain; k++) {
        const yT = L.yG + S.gh + k * S.fh + 2.62, yB = yT - drop;
        for (let j = 0; j < s.nb; j++) {
          if (hash(s.u + j * 3, k * 7 + D.seed, 53) > 0.8) continue;
          const P = (al, o) => [s.P0[0] + s.d[0] * al + s.n[0] * o, s.P0[1] + s.d[1] * al + s.n[2] * o];
          const a0 = (j + 0.12) * bw, a1 = (j + 0.88) * bw; const w0 = P(a0, 0.03), w1 = P(a1, 0.03), e0 = P(a0, out), e1 = P(a1, out);
          G.quad([w1[0], yT, w1[1]], [w0[0], yT, w0[1]], [e0[0], yB, e0[1]], [e1[0], yB, e1[1]], up, [0, 0, 1, 0, 1, 0.88, 0, 0.88], WHITE, cl);
          G.acc = AWN_UNDER; G.quad([w1[0], yT, w1[1]], [w0[0], yT, w0[1]], [e0[0], yB, e0[1]], [e1[0], yB, e1[1]], [-up[0], -up[1], -up[2]], [0, 0, 1, 0, 1, 0.88, 0, 0.88], WHITE, cl); G.acc = AWN_BLUE;
          G.quad([e1[0], yB - vh, e1[1]], [e0[0], yB - vh, e0[1]], [e0[0], yB, e0[1]], [e1[0], yB, e1[1]], s.n, [0, 0.88, 1, 0.88, 1, 1, 0, 1], WHITE, cl);
        }
      }
    }
    G.acc = acc;
  }
  // late-modern blocks: thin projecting slab edges at every floor (the glass balconies are painted)
  function slabBands(E, G, ring, D, L, out) {
    const R = roundOutset(ring, out || 0.6, 2).ring; if (!ringClear(E, R, 1.0)) return; const inner = roundOutset(ring, 0.0, 2).ring; const cl = cell('slab');
    for (let k = 0; k < D.nf - L.nsb; k++) { const y = L.yG + D.S.gh + k * D.S.fh; G.band(inner, R, y, WHITE, cl, 3); G.band(inner, R, y - 0.22, scaleC(WHITE, 0.8), cl, 3, true); let U0 = 0; for (let i = 0; i < R.length; i++) { const a = R[i], b = R[(i + 1) % R.length]; const Ls = Math.hypot(b[0] - a[0], b[1] - a[1]); if (Ls < 0.02) continue; G.quad([b[0], y - 0.22, b[1]], [a[0], y - 0.22, a[1]], [a[0], y, a[1]], [b[0], y, b[1]], [(b[1] - a[1]) / Ls, 0, -(b[0] - a[0]) / Ls], [U0, 0, U0 + Ls / 3, 0, U0 + Ls / 3, 0.07, U0, 0.07], WHITE, cl); U0 += Ls / 3; } }
  }
  // the stone balcony along the first floor of the Belle Epoque buildings (balustrade cell)
  function pianoBalcony(E, G, seg, D, L) {
    const S = D.S; const y = L.yG + S.gh, dep = 0.85, th = 0.26, ph = 0.95; const bc = cell('balust'), sc0 = cell('slab');
    for (const s of seg) {
      if (s.L < 6) continue; const ins = 0.6; const a = [s.P0[0] + s.d[0] * ins, s.P0[1] + s.d[1] * ins], b = [s.P1[0] - s.d[0] * ins, s.P1[1] - s.d[1] * ins]; const o = [s.n[0], s.n[2]];
      const A = [a[0] + o[0] * dep, a[1] + o[1] * dep], B = [b[0] + o[0] * dep, b[1] + o[1] * dep]; if (!segClear(E, A, B, 1.2)) continue; const nbb = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.6));
      G.quad([B[0], y - th, B[1]], [A[0], y - th, A[1]], [A[0], y, A[1]], [B[0], y, B[1]], s.n, [0, 0, nbb, 0, nbb, 0.1, 0, 0.1], STONE_TRIM, sc0);
      G.quad([b[0], y - th, b[1]], [a[0], y - th, a[1]], [A[0], y - th, A[1]], [B[0], y - th, B[1]], [0, -1, 0], [0, 0, nbb, 0, nbb, 0.3, 0, 0.3], scaleC(STONE_TRIM, 0.75), sc0);
      G.quad([B[0], y, B[1]], [A[0], y, A[1]], [A[0], y + ph, A[1]], [B[0], y + ph, B[1]], s.n, [0, 0, nbb, 0, nbb, 1, 0, 1], STONE_TRIM, bc);
      G.quad([B[0], y + ph, B[1]], [A[0], y + ph, A[1]], [a[0], y + ph, a[1]], [b[0], y + ph, b[1]], [0, 1, 0], [0, 0, nbb, 0, nbb, 0.05, 0, 0.05], STONE_TRIM, sc0);
      G.quad([B[0], y, B[1]], [A[0], y, A[1]], [a[0], y, a[1]], [b[0], y, b[1]], [0, 1, 0], [0, 0, nbb, 0, nbb, dep / 2.4, 0, dep / 2.4], C(0xd8d0c4), cell('terrace'));
      // consoles under the slab
      for (let k = 0.5; k < nbb; k += 1) { const al = ins + (s.L - 2 * ins) * k / nbb; const px = s.P0[0] + s.d[0] * al, pz = s.P0[1] + s.d[1] * al; G.box(px + o[0] * 0.35, pz + o[1] * 0.35, o[0], o[1], 0.35, 0.12, y - th - 0.55, y - th, STONE_TRIM, sc0, null, 1, 1); }
    }
  }
  // shop canopies over the ground floors that face the circuit
  function shopCanopies(E, G, seg, D, L) {
    if (!D.shops) return; const S = D.S; const cl = cell('awn'); const y1 = L.yG + Math.min(S.gh - 0.6, 3.6), out = 1.5, drop = 0.6;
    for (const s of seg) {
      if (!s.street || s.L < 3) continue; const nb = Math.max(1, Math.round(s.L / S.bw)); const bw = s.L / nb;
      for (let j = 0; j < nb; j++) {
        const hh = hash(s.u + j * 5, D.seed, 91); if (hh > 0.6) continue; const a0 = j * bw + 0.12, a1 = (j + 1) * bw - 0.12;
        const P = (al, o) => [s.P0[0] + s.d[0] * al + s.n[0] * o, s.P0[1] + s.d[1] * al + s.n[2] * o]; const e0 = P(a0, out), e1 = P(a1, out); if (!segClear(E, e0, e1, 0.8)) continue;
        const w0 = P(a0, 0.03), w1 = P(a1, 0.03); G.sub = 1;
        G.quad([w1[0], y1, w1[1]], [w0[0], y1, w0[1]], [e0[0], y1 - drop, e0[1]], [e1[0], y1 - drop, e1[1]], null, [0, 0, 1, 0, 1, 1, 0, 1], WHITE, cl);
        G.quad([e1[0], y1 - drop - 0.3, e1[1]], [e0[0], y1 - drop - 0.3, e0[1]], [e0[0], y1 - drop, e0[1]], [e1[0], y1 - drop, e1[1]], s.n, [0, 0, 1, 0, 1, 0.12, 0, 0.12], WHITE, cl);
        G.quad([w0[0], y1 - drop - 0.3, w0[1]], [w1[0], y1 - drop - 0.3, w1[1]], [e1[0], y1 - drop - 0.3, e1[1]], [e0[0], y1 - drop - 0.3, e0[1]], [0, -1, 0], [0, 0, 1, 0, 1, 1, 0, 1], scaleC(WHITE, 0.6), cl);
        G.sub = 0;
      }
    }
  }
  // cornice bands at the roof line (and over the ground floor) for stone buildings and villas
  function cornices(E, G, seg, D, L) {
    const S = D.S; const yR = L.yTop; const bands = D.style === 'belle' ? [[yR - 0.75, yR, 0.6], [L.yG + S.gh - 0.4, L.yG + S.gh, 0.28]] : [[yR - 0.45, yR, 0.4]];
    const cc = scaleC(D.tint, 1.06), plainC = cell('slab');
    for (const s of seg) for (const [y0, y1, pr] of bands) {
      const e0 = [s.P0[0] - s.d[0] * pr, s.P0[1] - s.d[1] * pr], e1 = [s.P1[0] + s.d[0] * pr, s.P1[1] + s.d[1] * pr]; const O = [s.n[0] * pr, s.n[2] * pr];
      const A = [e0[0] + O[0], e0[1] + O[1]], B = [e1[0] + O[0], e1[1] + O[1]]; if (!segClear(E, A, B, 0.8)) continue;
      G.quad([B[0], y0, B[1]], [A[0], y0, A[1]], [A[0], y1, A[1]], [B[0], y1, B[1]], s.n, [0, 0.1, s.nb, 0.1, s.nb, 0.3, 0, 0.3], cc, plainC);
      G.quad([e1[0], y0, e1[1]], [e0[0], y0, e0[1]], [A[0], y0, A[1]], [B[0], y0, B[1]], [0, -1, 0], [0, 0, s.nb, 0, s.nb, 0.1, 0, 0.1], scaleC(cc, 0.62), plainC);
      G.quad([B[0], y1, B[1]], [A[0], y1, A[1]], [e0[0], y1, e0[1]], [e1[0], y1, e1[1]], [0, 1, 0], [0, 0, s.nb, 0, s.nb, 0.1, 0, 0.1], cc, plainC);
    }
  }

  // ================================================================ roofs: flat with parapet (+ setback floors, penthouses, terraces, plant), mansard, hipped
  function roofOf(E, G, ring, D, mode, L) {
    const S = D.S, rt = D.roofTint, proxy = mode === 'proxy', near = mode === 'near'; const yR = L.yTop; const ob = L.ob;
    if (D.roof === 'mansard') {
      // steep zinc / slate slopes (dormers near the circuit), a flat zinc top; awkward footprints use a loose inset with the footprint's fill
      const r1 = offsetRing(ring, 1.3) || offsetRing(ring, 1.0, true);
      if (r1) {
        const yT = yR + 3.0, mc = cell('be_mans'), zc = D.mansardTint || C(0x8e969c);
        for (let i = 0; i < ring.length; i++) {
          const j = (i + 1) % ring.length; const Le = Math.hypot(ring[j][0] - ring[i][0], ring[j][1] - ring[i][1]); if (Le < 0.2) continue; const nb = Math.max(1, Math.round(Le / S.bw));
          G.sub = 0; G.quad([ring[j][0], yR, ring[j][1]], [ring[i][0], yR, ring[i][1]], [r1[i][0], yT, r1[i][1]], [r1[j][0], yT, r1[j][1]], null, [0, 0, nb, 0, nb, 1, 0, 1], zc, near ? cell('zinc') : mc);
          if (near && Le > 3.5) dormers(G, ring[i], ring[j], r1[i], r1[j], yR, yT, nb, D);
        }
        G.sub = 0; G.capTopo(ring, r1, yT, D.mansardTop || C(0x7e868c), cell(D.mansardTopCell || 'zinc'), 3);
        if (near && !D.noChimneys) chimneys(G, r1, yT, D, 3); return;
      }
    }
    if (D.roof === 'hip') {
      const eave = offsetRing(ring, -0.45) || ring; let r1 = null, dd = Math.min(ob.hw * 0.92, 6);
      for (const k of [1, 0.75, 0.5]) { r1 = offsetRing(ring, dd * k); if (r1) { dd *= k; break; } }
      if (!r1 && ring.length > 4) { dd = Math.min(ob.hw * 0.5, 2.5); r1 = offsetRing(ring, dd, true); }
      if (r1) {
        const yT = yR + dd * 0.52, tc = cell('tiles');
        for (let i = 0; i < ring.length; i++) {
          const j = (i + 1) % ring.length; const Le = Math.hypot(eave[j][0] - eave[i][0], eave[j][1] - eave[i][1]); const sl = Math.hypot(dd + 0.45, yT - yR + 0.08);
          G.quad([eave[j][0], yR - 0.08, eave[j][1]], [eave[i][0], yR - 0.08, eave[i][1]], [r1[i][0], yT, r1[i][1]], [r1[j][0], yT, r1[j][1]], null, [0, 0, Le / 2.2, 0, Le / 2.2, sl / 2.2, 0, sl / 2.2], rt, tc);
          if (!proxy) { const dx = eave[j][0] - eave[i][0], dz = eave[j][1] - eave[i][1]; const l = Math.hypot(dx, dz) || 1; G.quad([eave[j][0], yR - 0.3, eave[j][1]], [eave[i][0], yR - 0.3, eave[i][1]], [eave[i][0], yR - 0.08, eave[i][1]], [eave[j][0], yR - 0.08, eave[j][1]], [dz / l, 0, -dx / l], [0, 0, 1, 0, 1, 0.05, 0, 0.05], WHITE, cell('slab')); G.quad([ring[j][0], yR - 0.3, ring[j][1]], [ring[i][0], yR - 0.3, ring[i][1]], [eave[i][0], yR - 0.3, eave[i][1]], [eave[j][0], yR - 0.3, eave[j][1]], [0, -1, 0], [0, 0, 1, 0, 1, 0.05, 0, 0.05], scaleC(D.tint, 0.72), cell('slab')); }
        }
        G.capTopo(ring, r1, yT, rt, tc, 2.2);
        if (near && !D.noChimneys) chimneys(G, r1, yT, D, 2);
        return;
      }
    }
    // flat roof: membrane or terrace tiles, parapet inner faces and coping
    const terr = (D.style === 'villa' || D.style === 'belle' || L.sbRing) && hash(ob.cx || 0, ob.cz || 0, 31) < 0.7;
    G.sub = 0; G.cap(ring, yR, terr ? C(0xd8c4ae) : D.roofTint, cell(terr ? 'terrace' : 'flat'), 3);
    if (!proxy && L.parH) {
      for (let i = 0; i < ring.length; i++) {
        const j = (i + 1) % ring.length; const dx = ring[j][0] - ring[i][0], dz = ring[j][1] - ring[i][1]; const Le = Math.hypot(dx, dz); if (Le < 0.05) continue; const n = [-dz / Le, 0, dx / Le];
        const ii = [ring[i][0] + n[0] * 0.25, ring[i][1] + n[2] * 0.25], jj = [ring[j][0] + n[0] * 0.25, ring[j][1] + n[2] * 0.25];
        G.quad([ii[0], yR, ii[1]], [jj[0], yR, jj[1]], [jj[0], yR + L.parH, jj[1]], [ii[0], yR + L.parH, ii[1]], n, [0, 0, Le / 3, 0, Le / 3, 0.3, 0, 0.3], scaleC(D.tint, 0.9), cell('plain'));
        G.quad([ring[j][0], yR + L.parH, ring[j][1]], [ring[i][0], yR + L.parH, ring[i][1]], [ii[0], yR + L.parH, ii[1]], [jj[0], yR + L.parH, jj[1]], [0, 1, 0], [0, 0, Le / 3, 0, Le / 3, 0.05, 0, 0.05], WHITE, cell('slab'));
      }
    }
    if (L.sbRing) setbackBlock(E, G, D, mode, L);
    if (proxy) { if (D.H > 40 && D.style === 'modern' && !L.sbRing) crown(G, ring, D, L.yR, true); return; }
    if (D.H > 13 || L.sbRing) rooftop(E, G, L.sbRing || ring, D, L.sbRing ? L.yR : yR, ob, near, !!L.sbRing);
    if (D.H > 40 && D.style === 'modern' && !L.sbRing) crown(G, ring, D, L.yR, false);
  }
  // the top floors of a tower set back behind a terrace: glazed walls, their own parapet and roof
  function setbackBlock(E, G, D, mode, L) {
    const r2 = L.sbRing, S = D.S, y0 = L.yTop, y1 = L.yR; const cl = D.style === 'modern' ? cell('mg_flr') : cell('rv_top'); G.sub = 0;
    if (mode === 'near') { for (let k = 0; k < L.nsb; k++) G.prism(r2, y0 + k * S.fh, y0 + (k + 1) * S.fh, D.tint, k === L.nsb - 1 ? cl : cell('mod_bal', 0), S.bw, S.fh, 0, D.seed); }
    else G.prism(r2, y0, y1, D.tint, cl, S.bw, S.fh * L.nsb, 0, D.seed);
    G.prism(r2, y1, y1 + 0.8, scaleC(D.tint, 1.03), cell('plain'), 4, 2.4, 0); G.cap(r2, y1 + 0.02, D.roofTint, cell('flat'), 3);
    if (mode !== 'proxy') { const top = offsetRing(r2, 0.2) || r2; G.band(top, r2, y1 + 0.8, WHITE, cell('slab'), 3); }
  }
  // modern towers: a louvred plant screen crowning the roof
  function crown(G, ring, D, y, proxy) {
    const r = offsetRing(ring, 2.5); if (!r || Math.abs(area2(r)) / 2 < 50) return; G.sub = proxy ? 0 : 1;
    G.prism(r, y, y + 3.2, C(0xc8ccce), cell('zinc'), 1, 3.2, 0); G.cap(r, y + 3.2, C(0x9a9ea2), cell('flat'), 3); G.sub = 0;
  }
  function dormers(G, A, B, Ai, Bi, yR, yT, nb, D) {
    // one dormer per bay on a mansard face: a window front standing on the slope, zinc cheeks and a curved (two-facet) hood
    G.sub = 1; const ex = B[0] - A[0], ez = B[1] - A[1]; const Le = Math.hypot(ex, ez); const dx = ex / Le, dz = ez / Le; const n = [dz, 0, -dx];
    const inX = (Ai[0] + Bi[0]) / 2 - (A[0] + B[0]) / 2, inZ = (Ai[1] + Bi[1]) / 2 - (A[1] + B[1]) / 2; const run = Math.hypot(inX, inZ) || 1; const ix = inX / run, iz = inZ / run;
    const zc = C(0x8a9298), dc = cell('dormer'), zn = cell('zinc'); const w = Math.min(1.5, Le / nb * 0.5), f = 0.35, h0 = yR + f * (yT - yR) / run, h1 = yR + 2.35;
    const back = (h1 + 0.5 - yR) / (yT - yR) * run + 0.05;
    for (let k = 0; k < nb; k++) {
      const al = (k + 0.5) * Le / nb; const cx = A[0] + dx * al + ix * f, cz = A[1] + dz * al + iz * f; const bx = A[0] + dx * al + ix * back, bz = A[1] + dz * al + iz * back;
      const L0 = [cx - dx * w / 2, cz - dz * w / 2], R0 = [cx + dx * w / 2, cz + dz * w / 2], LB = [bx - dx * w / 2, bz - dz * w / 2], RB = [bx + dx * w / 2, bz + dz * w / 2];
      G.quad([L0[0], h0, L0[1]], [R0[0], h0, R0[1]], [R0[0], h1, R0[1]], [L0[0], h1, L0[1]], n, [0, 0, 1, 0, 1, 1, 0, 1], C(0xf4efe4), dc);
      G.quad([R0[0], h0, R0[1]], [RB[0], h1, RB[1]], [RB[0], h1, RB[1]], [R0[0], h1, R0[1]], [dx, 0, dz], [0, 0, 1, 0, 1, 1, 0, 1], zc, zn);
      G.quad([LB[0], h1, LB[1]], [L0[0], h0, L0[1]], [L0[0], h1, L0[1]], [LB[0], h1, LB[1]], [-dx, 0, -dz], [0, 0, 1, 0, 1, 1, 0, 1], zc, zn);
      const mid0 = [cx - ix * 0.12, h1 + 0.45, cz - iz * 0.12], midB = [bx, h1 + 0.45, bz];
      G.quad([L0[0] - dx * 0.1 - ix * 0.12, h1, L0[1] - dz * 0.1 - iz * 0.12], [LB[0] - dx * 0.1, h1, LB[1] - dz * 0.1], midB, mid0, null, [0, 0, 1, 0, 1, 1, 0, 1], zc, zn);
      G.quad([R0[0] + dx * 0.1 - ix * 0.12, h1, R0[1] + dz * 0.1 - iz * 0.12], mid0, midB, [RB[0] + dx * 0.1, h1, RB[1] + dz * 0.1], null, [0, 0, 1, 0, 1, 1, 0, 1], zc, zn);
    }
    G.sub = 0;
  }
  function chimneys(G, r1, yT, D, n) {
    G.sub = 1; const c = centroid(r1); const st = cell('stone'), pc = cell('plain');
    for (let k = 0; k < n; k++) { const q = r1[(k * 2 + D.seed) % r1.length]; const x = q[0] + (c[0] - q[0]) * 0.3, z = q[1] + (c[1] - q[1]) * 0.3; if (!pip(x, z, r1)) continue; G.box(x, z, 1, 0, 0.35, 0.28, yT - 0.6, yT + 1.4, scaleC(D.tint, 0.95), pc, pc, 1, 1); G.box(x, z, 1, 0, 0.42, 0.34, yT + 1.4, yT + 1.55, WHITE, pc, pc, 1, 1); }
    G.sub = 0;
  }
  // roof furniture on flat roofs: penthouse with pergola and planters, parasols, lift head, tanks, AC units, antennas, dishes
  function rooftop(E, G, ring, D, yR, ob, near, onSetback) {
    const h = (k) => hash((ob.cx || 0) * 7 + k * 13.7, (ob.cz || 0) * 3 + k * 5.1, 41 + k); const area = Math.abs(area2(ring)) / 2;
    const plainC = cell('plain'), concC = cell('conc'), grey = C(0xcfccc6), dark = C(0x5a5c60); G.sub = 1;
    let pent = null;
    if (!onSetback && area > 220 && (D.style === 'riviera' || D.style === 'modern') && h(1) < 0.7) { pent = offsetRing(ring, 2.8 + h(2) * 2); if (pent && Math.abs(area2(pent)) / 2 < 60) pent = null; }
    if (pent) {
      const ph = 3.0; G.sub = 0; G.prism(pent, yR, yR + ph, D.tint, cell(D.style === 'modern' ? 'mg_flr' : 'rv_top'), 3.4, ph, 0, D.seed); G.cap(pent, yR + ph, D.roofTint, cell('flat'), 3); G.sub = 1;
      if (near) {
        // pergola over the terrace on one side, planters along the parapet
        const e = ring[D.seed % ring.length], e2 = ring[(D.seed + 1) % ring.length]; const mx = (e[0] + e2[0]) / 2, mz = (e[1] + e2[1]) / 2; const cxp = mx + (ob.cx - mx) * 0.15, czp = mz + (ob.cz - mz) * 0.15;
        if (pip(cxp, czp, ring) && !pip(cxp, czp, pent)) { const ux = (e2[0] - e[0]), uz = (e2[1] - e[1]); const ul = Math.hypot(ux, uz) || 1; for (let k = -2; k <= 2; k++) G.box(cxp + ux / ul * k * 0.9, czp + uz / ul * k * 0.9, -uz / ul, ux / ul, 1.3, 0.05, yR + 2.5, yR + 2.62, C(0x8a6a4a), plainC, plainC, 1, 1); for (const sg of [-1, 1]) G.box(cxp + ux / ul * sg * 2.0, czp + uz / ul * sg * 2.0, 1, 0, 0.06, 0.06, yR, yR + 2.5, C(0x8a6a4a), plainC, null, 1, 1); }
        for (let k = 0; k < 4; k++) { const a = ring[(k * 2 + D.seed) % ring.length]; const px = a[0] + (ob.cx - a[0]) * 0.1, pz = a[1] + (ob.cz - a[1]) * 0.1; if (pip(px, pz, ring) && !pip(px, pz, pent)) shrubBox(G, px, yR, pz, 0.5 + h(50 + k) * 0.4, k + D.seed); }
        if (h(3) < 0.6) for (let k = 0; k < 2; k++) { const a = ring[(k * 3 + 1 + D.seed) % ring.length]; const px = a[0] + (ob.cx - a[0]) * 0.22, pz = a[1] + (ob.cz - a[1]) * 0.22; if (pip(px, pz, ring) && !pip(px, pz, pent)) parasol(G, px, yR, pz, 1.4 + h(60 + k) * 0.6); }
      }
    } else if (near && (D.style === 'belle' || D.style === 'villa' || onSetback) && area > 80) {
      for (let k = 0; k < 3; k++) { const a = ring[(k * 3 + D.seed) % ring.length]; const px = a[0] + (ob.cx - a[0]) * 0.18, pz = a[1] + (ob.cz - a[1]) * 0.18; if (pip(px, pz, ring)) { if (k < 2) shrubBox(G, px, yR, pz, 0.6, D.seed + k); else parasol(G, px, yR, pz, 1.5); } }
    }
    // lift / stair head
    const lx = ob.cx + ob.ux * ob.hl * (h(3) - 0.5) * 0.6, lz = ob.cz + ob.uz * ob.hl * (h(3) - 0.5) * 0.6; const top = pent ? yR + 3.0 : yR;
    if (pip(lx, lz, ring)) { G.sub = 0; G.box(lx, lz, ob.ux, ob.uz, 1.8, 1.4, top, top + 2.6, grey, plainC, cell('flat'), 3, 3, grey); G.sub = 1; }
    if (!near) { G.sub = 0; return; }
    // water tanks, antennas, a dish and air-conditioning units
    const nt = Math.floor(h(4) * 3);
    for (let k = 0; k < nt; k++) { const tx = ob.cx + ob.ux * (h(5 + k) - 0.5) * ob.hl * 1.2 - ob.uz * (h(9 + k) - 0.5) * ob.hw, tz = ob.cz + ob.uz * (h(5 + k) - 0.5) * ob.hl * 1.2 + ob.ux * (h(9 + k) - 0.5) * ob.hw; if (!pip(tx, tz, ring) || pent && pip(tx, tz, pent)) continue; const r = 0.9 + h(12 + k) * 0.5, th = 1.8 + h(14 + k); G.lathe(tx, tz, [[r, yR], [r, yR + th], [r * 0.85, yR + th + 0.25], [0.02, yR + th + 0.3]], 8, grey, concC, 1, 0.5); }
    if (h(20) < 0.7) { const ax = ob.cx - ob.ux * ob.hl * 0.3, az = ob.cz - ob.uz * ob.hl * 0.3; if (pip(ax, az, ring)) { G.box(ax, az, 1, 0, 0.06, 0.06, top, top + 3 + h(21) * 5, dark, concC, null, -0.2, 1); G.box(ax, az, 1, 0, 0.7, 0.03, top + 2.4, top + 2.46, dark, concC, null, -0.2, 1); } }
    if (h(24) < 0.5) { const ax = ob.cx + ob.ux * ob.hl * 0.25, az = ob.cz + ob.uz * ob.hl * 0.25; if (pip(ax, az, ring) && !(pent && pip(ax, az, pent))) G.lathe(ax, az, [[0.05, top + 0.9], [0.45, top + 1.0], [0.5, top + 1.25]], 8, C(0xe8e8e4), concC, 1, 0.5); }
    const na = 2 + Math.floor(h(22) * 4);
    for (let k = 0; k < na; k++) { const ax = ob.cx + ob.ux * (h(23 + k) - 0.5) * ob.hl * 1.4 + ob.uz * (h(30 + k) - 0.5) * ob.hw, az = ob.cz + ob.uz * (h(23 + k) - 0.5) * ob.hl * 1.4 - ob.ux * (h(30 + k) - 0.5) * ob.hw; if (!pip(ax, az, ring) || pent && pip(ax, az, pent)) continue; G.box(ax, az, ob.ux, ob.uz, 0.55, 0.38, yR, yR + 0.85, C(0xdedcd6), plainC, plainC, 1, 1); }
    G.sub = 0;
  }
  // a planter box with a shrub (a low-poly bush in the foliage cell) and a striped parasol on a pole
  function shrubBox(G, x, y, z, r, seed) {
    const hh = (k) => hash(x * 3 + k, z * 7 + seed, 51 + k);
    G.box(x, z, 1, 0, r * 0.9, r * 0.9, y, y + 0.55, C(0xb07050), cell('plain'), null, 1, 1);
    const col = new THREE.Color().setHSL(0.25 + hh(1) * 0.08, 0.32, 0.42 + hh(2) * 0.12); G.lathe(x, z, [[r * 0.8, y + 0.5], [r * 1.15, y + 0.5 + r * 0.7], [r * 0.85, y + 0.5 + r * 1.5], [0.05, y + 0.5 + r * 1.8]], 6, col, cell('shrub'), 0.6, 0.6);
  }
  function parasol(G, x, y, z, r) { G.box(x, z, 1, 0, 0.03, 0.03, y, y + 2.3, C(0xd8d4cc), cell('plain'), null, 1, 1); G.lathe(x, z, [[r, y + 2.05], [0.05, y + 2.55]], 8, WHITE, cell('parasol'), 1, 0.125); G.lathe(x, z, [[0.05, y + 2.0], [r, y + 2.04]], 8, scaleC(WHITE, 0.55), cell('parasol'), 1, 0.125); }

  // ================================================================ landmarks
  // forced design for a landmark footprint
  function forced(style, nf, tintHex, roof, extra) {
    const S = STY[style] || STY.belle; const D = { zone: 'landmark', style, S, nf, H: S.gh + nf * S.fh, tint: C(tintHex), acc: C(0x6a7a6a), roof, roofTint: C(roof === 'flat' ? 0xbcb6aa : roof === 'mansard' ? 0x8e969c : 0xb0603e), rail: 0, seed: 7, shops: false };
    return Object.assign(D, extra || {});
  }
  // a landmark's detail build near the circuit plus its proxy (seen from afar)
  function both(E, G, ring, D, c, nearMode) { buildOne(E, G, ring, D, nearMode || 'near', c); buildOne(E, G, ring, D, 'proxy', c); }
  function domeProfile(r, h, y0, n) { const out = []; for (let k = 0; k <= (n || 6); k++) { const a = k / (n || 6) * Math.PI / 2; out.push([Math.max(0.05, Math.cos(a) * r), y0 + Math.sin(a) * h]); } return out; }
  // a date palm: tapering trunk, a crown of drooping fronds (both faces, so no culling holes)
  function palm(G, x, y, z, h, seed) {
    const r = U.rng(seed); const bark = C(0xb09a80), barkC = cell('conc'), frC = cell('frond');
    const lean = (r() - 0.5) * 0.12, lx = Math.cos(seed) * lean * h, lz = Math.sin(seed) * lean * h;
    const ring = (rad, ox, oz) => { const p = []; for (let a = 0; a < 6; a++) p.push([x + ox + Math.cos(a / 6 * 6.283) * rad, z + oz - Math.sin(a / 6 * 6.283) * rad]); return p; };
    const r0 = ring(0.3, 0, 0), r1 = ring(0.2, lx, lz);
    for (let i = 0; i < 6; i++) { const j = (i + 1) % 6; G.quad([r0[j][0], y - 0.3, r0[j][1]], [r0[i][0], y - 0.3, r0[i][1]], [r1[i][0], y + h, r1[i][1]], [r1[j][0], y + h, r1[j][1]], null, [0, 0, 0.3, 0, 0.3, h / 1.5, 0, h / 1.5], bark, barkC); }
    const cxp = x + lx, cyp = y + h, czp = z + lz; const nf = 9 + Math.floor(r() * 4); const fc = new THREE.Color().setHSL(0.2 + r() * 0.06, 0.35, 0.55 + r() * 0.12);
    for (let k = 0; k < nf; k++) {
      const a = k / nf * 6.283 + r() * 0.4, L = 2.8 + r() * 1.0, up = 0.9 - r() * 1.1; const dx = Math.cos(a), dz = Math.sin(a), wx = -dz * 0.45, wz = dx * 0.45;
      const mid = [cxp + dx * L * 0.5, cyp + up * 0.5 + 0.45, czp + dz * L * 0.5], tip = [cxp + dx * L, cyp + up - 0.5, czp + dz * L], base = [cxp, cyp, czp];
      const ma = [mid[0] + wx, mid[1], mid[2] + wz], mb = [mid[0] - wx, mid[1], mid[2] - wz]; const n = [dx * 0.25, 0.97, dz * 0.25];
      G.quadKeep(base, mb, mid, ma, n, [0.5, 0, 0, 0.5, 0.5, 0.5, 1, 0.5], fc, frC); G.quadKeep(ma, mid, mb, tip, n, [1, 0.5, 0.5, 0.5, 0, 0.5, 0.5, 1], fc, frC);
      G.quadKeep(base, ma, mid, mb, n, [0.5, 0, 1, 0.5, 0.5, 0.5, 0, 0.5], scaleC(fc, 0.8), frC); G.quadKeep(mb, mid, ma, tip, n, [0, 0.5, 0.5, 0.5, 1, 0.5, 0.5, 1], scaleC(fc, 0.8), frC);
    }
  }
  function agave(G, x, y, z, rad, seed) { const r = U.rng(seed); const col = new THREE.Color().setHSL(0.28 + r() * 0.08, 0.3, 0.55 + r() * 0.12); const n = 7; for (let k = 0; k < n; k++) { const a = k / n * 6.283 + r(), L = rad * (0.7 + r() * 0.5); const tip = [x + Math.cos(a) * L, y + 0.4 + r() * 0.6, z + Math.sin(a) * L]; const wa = [x + Math.cos(a + 0.35) * 0.18, y, z + Math.sin(a + 0.35) * 0.18], wb = [x + Math.cos(a - 0.35) * 0.18, y, z + Math.sin(a - 0.35) * 0.18]; G.tri(wa, wb, tip, [Math.cos(a) * 0.5, 0.86, Math.sin(a) * 0.5], [0, 0, 1, 0, 0.5, 1], col, cell('frond')); G.tri(wb, wa, tip, [Math.cos(a) * 0.5, 0.86, Math.sin(a) * 0.5], [0, 0, 1, 0, 0.5, 1], col, cell('frond')); } }
  function nearestOn(ring, x, z) { let best = Infinity, bp = ring[0]; for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; const dx = b[0] - a[0], dz = b[1] - a[1]; const l2 = dx * dx + dz * dz || 1; const u = U.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1); const px = a[0] + dx * u, pz = a[1] + dz * u; const d = Math.hypot(px - x, pz - z); if (d < best) { best = d; bp = [px, pz]; } } return bp; }
  // a square tower with a drum, a copper dome and a lantern (the Casino's towers and pavilions)
  function domedTower(G, x, z, fx, fz, hw, y0, y1, D, cl, segs, lantern) {
    const ring = rectRing(x, z, fx, fz, hw, hw); G.prism(ring, y0, y1, D.tint, cl, hw, (y1 - y0) / Math.max(1, Math.round((y1 - y0) / 6.5)), 0);
    G.prism(offsetRing(ring, -0.35) || ring, y1, y1 + 0.9, STONE_TRIM, cell('slab'), 2, 0.9, 0); G.cap(offsetRing(ring, -0.35) || ring, y1 + 0.9, C(0xe8dcc4), cell('conc'), 3);
    const r = hw * 0.85; const cu = C(0x8fbca6);
    G.lathe(x, z, [[r, y1 + 0.9], [r, y1 + 2.4], [r * 0.92, y1 + 2.6]], segs, D.tint, cell('cas_top'), 0.3, 0.5);
    G.lathe(x, z, domeProfile(r * 0.92, r * 1.25, y1 + 2.6, segs > 8 ? 6 : 3), segs, cu, cell('copper'), 1, 0.5);
    if (lantern) { const yl = y1 + 2.6 + r * 1.25; G.lathe(x, z, [[0.7, yl - 0.1], [0.7, yl + 1.3], [0.9, yl + 1.4], [0.05, yl + 2.6], [0.05, yl + 3.4]], 8, cu, cell('copper'), 1, 0.5); }
  }
  City.landmarks = function (E, G, claimed) {
    const sc = E.sc, t = E.t; const lm = E.data.landmarks || {}; const R = (k) => lm[k] ? cleanRing(lm[k]) : null;
    const add = (k) => { let r = R(k); if (r) { claimed.push(r); r = pushClear(E, r, 1.2); } return r; };
    // ---- the Casino: a stone front with an arcaded ground floor, great arched windows and a balustraded attic under a copper
    // mansard; the central pavilion with its clock between two towers crowned by copper domes and lanterns; domed corner pavilions
    const cas = add('casino'), fnt = lm.fountain ? centroid(lm.fountain) : null;
    if (cas && fnt) {
      const c = centroid(cas); let fx = fnt[0] - c[0], fz = fnt[1] - c[1]; const fl = Math.hypot(fx, fz); fx /= fl; fz /= fl; const rx = -fz, rz = fx;
      let mp = -Infinity; for (const q of cas) mp = Math.max(mp, (q[0] - c[0]) * fx + (q[1] - c[1]) * fz);
      let r0 = Infinity, r1 = -Infinity; for (const q of cas) { if ((q[0] - c[0]) * fx + (q[1] - c[1]) * fz < mp - 16) continue; const rr = (q[0] - c[0]) * rx + (q[1] - c[1]) * rz; r0 = Math.min(r0, rr); r1 = Math.max(r1, rr); }
      const FC = [c[0] + fx * mp + rx * (r0 + r1) / 2, c[1] + fz * mp + rz * (r0 + r1) / 2];
      const yG = sc.height(FC[0] + fx * 3, FC[1] + fz * 3);
      const S = { bw: 4.6, fh: 6.0, gh: 5.5, roof: 'mansard', cornice: true, perFloor: true };
      const D = forced('belle', 2, 0xead8b6, 'mansard', { yG, S, H: 17.5, noBalc: true, noChimneys: true, mansardTint: C(0x86b49c), mansardTop: C(0x96c0aa), mansardTopCell: 'copper', casino: true });
      both(E, G, cas, D, c);
      const mid = (r0 + r1) / 2; const P = (k, back) => [FC[0] + rx * (k - mid) - fx * back, FC[1] + rz * (k - mid) - fz * back];
      for (const kind of ['D', 'P']) {
        const segs = kind === 'D' ? 12 : 6; G.at(c[0], c[1], kind, 0); G.acc = D.acc;
        // twin towers either side of the central pavilion, stepping a little forward of the front
        for (const sg of [-1, 1]) { let p = P(mid + sg * 10.5, 2.4); for (let it = 0; it < 30 && !clear(E, p[0], p[1], 4.6); it++) p = [p[0] - fx, p[1] - fz]; domedTower(G, p[0], p[1], fx, fz, 3.6, yG - 0.5, yG + 26, D, cell('cas_tower'), segs, true); }   // (never on the circuit: stepped back behind the barrier + its radius; FIT-AUDIT)
        // domed pavilions at the ends of the front
        for (const k of [r0 + 6.5, r1 - 6.5]) { const p = P(k, 4.5); domedTower(G, p[0], p[1], fx, fz, 4.4, yG + 15.5, yG + 22, D, cell('cas_top'), segs, true); }
        // the central pavilion: the clock in a pediment over the attic, a crest, the dome of the salle behind
        const hw = 6.4, y0 = yG + 17.5; const A = [FC[0] - rx * hw + fx * 0.8, FC[1] - rz * hw + fx * 0 + fz * 0.8], B = [FC[0] + rx * hw + fx * 0.8, FC[1] + rz * hw + fz * 0.8]; const nF = [fx, 0, fz];
        G.quad([A[0], y0 - 2, A[1]], [B[0], y0 - 2, B[1]], [B[0], y0 + 5, B[1]], [A[0], y0 + 5, A[1]], nF, [0, 0, 1, 0, 1, 1, 0, 1], D.tint, cell('clock'));
        G.tri([A[0] - rx * 0.6, y0 + 5, A[1] - rz * 0.6], [B[0] + rx * 0.6, y0 + 5, B[1] + rz * 0.6], [FC[0] + fx * 0.8, y0 + 9, FC[1] + fz * 0.8], nF, [0, 0, 1, 0, 0.5, 0.6], STONE_TRIM, cell('slab'));
        const Ab = [A[0] - fx * 6, A[1] - fz * 6], Bb = [B[0] - fx * 6, B[1] - fz * 6]; G.quad([Ab[0], y0 + 5, Ab[1]], [A[0], y0 + 5, A[1]], [FC[0] + fx * 0.8, y0 + 9, FC[1] + fz * 0.8], [FC[0] - fx * 5.2, y0 + 9, FC[1] - fz * 5.2], null, [0, 0, 1, 0, 1, 1, 0, 1], C(0x86b49c), cell('copper')); G.quad([B[0], y0 + 5, B[1]], [Bb[0], y0 + 5, Bb[1]], [FC[0] - fx * 5.2, y0 + 9, FC[1] - fz * 5.2], [FC[0] + fx * 0.8, y0 + 9, FC[1] + fz * 0.8], null, [0, 0, 1, 0, 1, 1, 0, 1], C(0x86b49c), cell('copper'));
        if (kind === 'D') { for (const sg of [-1, 1]) G.lathe(FC[0] + rx * sg * 4.2 + fx * 1.2, FC[1] + rz * sg * 4.2 + fz * 1.2, [[0.7, y0 + 4.6], [0.55, y0 + 5.8], [0.75, y0 + 6.6], [0.3, y0 + 7.6], [0.05, y0 + 8.0]], 6, C(0xe0d4bc), cell('conc'), 1); G.lathe(FC[0] + fx * 1.0, FC[1] + fz * 1.0, [[0.9, y0 + 8.6], [0.6, y0 + 9.8], [0.05, y0 + 10.6]], 6, C(0xd8c890), cell('conc'), 1); }
        const bx = FC[0] - fx * 18, bz = FC[1] - fz * 18; G.lathe(bx, bz, [[7, yG + 20], [6.2, yG + 23]].concat(domeProfile(6.2, 4.5, yG + 23, kind === 'D' ? 5 : 3).slice(1)), segs + 2, C(0x8fbca6), cell('copper'), 1);
        // the glass marquise over the entrance on slim iron columns
        if (kind === 'D') { const mq = [FC[0] + fx * 3.4, FC[1] + fz * 3.4]; G.box(mq[0], mq[1], rx, rz, 5.5, 2.6, yG + 4.6, yG + 4.9, C(0xffffff), cell('marquise'), cell('marquise'), 2, 0.3); for (const sg of [-1, 1]) G.box(mq[0] + rx * sg * 5 + fx * 2.2, mq[1] + rz * sg * 5 + fz * 2.2, 1, 0, 0.08, 0.08, yG, yG + 4.6, C(0x2a2c2a), cell('plain'), null, 1, 1); }
      }
      E.casinoFront = { FC, fx, fz, yG };
    }
    // ---- the Hotel de Paris (seven storeys of carved stone, mansard and dormers, the rotunda's dome at the Massenet corner)
    const hdp = add('hotelDeParis');
    if (hdp) {
      const c = centroid(hdp); const D = forced('belle', 6, 0xf0e2c6, 'mansard', { hdp: true }); both(E, G, hdp, D, c);
      const i0 = t.idxAtS(790); const np = nearestOn(hdp, t.x[i0], t.z[i0]); let dx = c[0] - np[0], dz = c[1] - np[1]; const l = Math.hypot(dx, dz) || 1; const dcx = np[0] + dx / l * 9, dcz = np[1] + dz / l * 9;
      // the rotunda only where its whole drum stands on the hotel's roof
      let rr = 8.6; while (rr > 4 && ![0, 1, 2, 3, 4, 5, 6, 7].every(k => pip(dcx + Math.cos(k * 0.785) * rr, dcz + Math.sin(k * 0.785) * rr, hdp))) rr -= 0.8;
      // the entrance on the square: the black glass marquise over the steps, flanked by two red marble columns (where it clears the circuit)
      if (D.lv && E.cityZones) {
        const Zc = E.cityZones.casino, ep = nearestOn(hdp, Zc[0], Zc[1]); let ex = Zc[0] - ep[0], ez = Zc[1] - ep[1]; const el = Math.hypot(ex, ez) || 1; ex /= el; ez /= el; const yG = D.lv.yG;
        let dep = 4.6; while (dep > 2.2 && !(clear(E, ep[0] + ex * dep - ez * 4.6, ep[1] + ez * dep + ex * 4.6, 0.6) && clear(E, ep[0] + ex * dep + ez * 4.6, ep[1] + ez * dep - ex * 4.6, 0.6))) dep -= 0.4;
        if (dep > 2.2) {
          G.at(ep[0], ep[1], 'D', 0); const mx = ep[0] + ex * dep / 2, mz = ep[1] + ez * dep / 2;
          G.box(mx, mz, -ez, ex, 4.6, dep / 2, yG + 4.5, yG + 4.75, C(0x1e2328), cell('marquise'), cell('marquise'), 2, 0.3, C(0x3a4148));
          G.box(mx, mz, -ez, ex, 4.7, dep / 2 + 0.08, yG + 4.75, yG + 4.95, C(0x2a2c2e), cell('plain'), null, 3, 1);
          for (const sg of [-1, 1]) {
            const cx = ep[0] + ex * (dep - 0.5) - ez * sg * 3.9, cz = ep[1] + ez * (dep - 0.5) + ex * sg * 3.9; G.box(cx, cz, 1, 0, 0.07, 0.07, yG, yG + 4.5, C(0x22252a), cell('plain'), null, 1, 1);
            const px = ep[0] + ex * 0.7 - ez * sg * 2.2, pz = ep[1] + ez * 0.7 + ex * sg * 2.2;
            G.lathe(px, pz, [[0.55, yG], [0.55, yG + 0.6], [0.4, yG + 0.75], [0.36, yG + 5.4], [0.55, yG + 5.8], [0.62, yG + 6.1]], 10, C(0xa8443a), cell('conc'), 1);
          }
          G.box(ep[0] + ex * 1.2, ep[1] + ez * 1.2, -ez, ex, 3.4, 1.2, yG - 0.2, yG + 0.45, STONE_TRIM, cell('slab'), cell('slab'), 3, 1);
        }
      }
      if (rr > 4) for (const kind of ['D', 'P']) { const sg = kind === 'D' ? 16 : 8; G.at(dcx, dcz, kind, 0); G.lathe(dcx, dcz, [[rr, D.yR], [rr, D.yR + 3.4]], sg, D.tint, cell('be_top'), 1); G.lathe(dcx, dcz, domeProfile(rr, rr * 0.75, D.yR + 3.4, kind === 'D' ? 7 : 3), sg, C(0x7d8288), cell('zinc'), 1); G.lathe(dcx, dcz, [[1.2, D.yR + 3.3 + rr * 0.75], [1.2, D.yR + 5 + rr * 0.75], [0.05, D.yR + 6.5 + rr * 0.75]], 8, C(0x9a9890), cell('zinc'), 1); }
    }
    // ---- the Cafe de Paris: two storeys of arcades and awnings, a roof terrace
    const cdp = add('cafeDeParis'); if (cdp) both(E, G, cdp, forced('belle', 1, 0xefe2c8, 'flat', { noBalc: true, shops: true }), centroid(cdp));
    // ---- the Hermitage, the Oceanographic Museum (with its cupola), the cathedral, the Sainte-Devote chapel
    const her = add('hermitage'); if (her) both(E, G, her, forced('belle', 6, 0xf3e6cc, 'mansard'), centroid(her), 'mid');
    const mus = add('museeOceano'); if (mus) { const c = centroid(mus); const D = forced('belle', 3, 0xeee3cc, 'flat'); both(E, G, mus, D, c, 'mid'); for (const kind of ['D', 'P']) { G.at(c[0], c[1], kind, 0); G.lathe(c[0], c[1], [[7, D.yR], [7, D.yR + 2]].concat(domeProfile(7, 6, D.yR + 2, kind === 'D' ? 6 : 3).slice(1)), kind === 'D' ? 14 : 8, C(0x8a9a9c), cell('zinc'), 1); } }
    const cat = add('cathedral'); if (cat) both(E, G, cat, forced('church', 3, 0xf2ecdf, 'hip'), centroid(cat), 'mid');
    const dev = add('devoteChapel');
    if (dev) { const c = centroid(dev); const D = forced('church', 1, 0xf0d9b8, 'hip'); both(E, G, dev, D, c); const ob = obb(dev); if (ob) for (const kind of ['D', 'P']) { G.at(c[0], c[1], kind, 0); const tx = ob.cx + ob.ux * (ob.hl - 2.2), tz = ob.cz + ob.uz * (ob.hl - 2.2); const ring = rectRing(tx, tz, ob.ux, ob.uz, 2, 2); G.prism(ring, D.yR - 4, D.yR + 8, D.tint, cell('church'), 4, 6, 0); for (let i = 0; i < 4; i++) { const a = ring[i], b = ring[(i + 1) % 4]; G.quad([b[0], D.yR + 8, b[1]], [a[0], D.yR + 8, a[1]], [tx, D.yR + 11.5, tz], [tx, D.yR + 11.5, tz], null, [0, 0, 1, 0, 0.5, 1, 0.5, 1], C(0xb0603e), cell('tiles')); } } }
    // ---- the Prince's Palace: ochre ranges with crenellated parapets and a corner tower
    const pal = add('palace');
    if (pal) {
      const c = centroid(pal); const D = forced('palace', 3, 0xf6ead6, 'flat'); both(E, G, pal, D, c, 'mid');
      for (const kind of ['D', 'P']) {
        G.at(c[0], c[1], kind, 0);
        if (kind === 'D') for (let i = 0; i < pal.length; i++) { const a = pal[i], b = pal[(i + 1) % pal.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L; for (let d = 0.8; d < L - 0.4; d += 2.2) G.box(a[0] + ux * d, a[1] + uz * d, ux, uz, 0.5, 0.3, D.yR + 0.9, D.yR + 1.9, D.tint, cell('plain'), cell('plain'), 1, 1); }
        const ob = obb(pal); if (ob) { const tx = ob.cx + ob.ux * (ob.hl - 5), tz = ob.cz + ob.uz * (ob.hl - 5); const ring = rectRing(tx, tz, ob.ux, ob.uz, 4.5, 4.5); G.prism(ring, D.yR - 2, D.yR + 9, D.tint, cell('palace'), 4, 3.6, 0); G.cap(ring, D.yR + 9, C(0xc8bfae), cell('flat'), 3); if (kind === 'D') for (let i = 0; i < 4; i++) { const a = ring[i], b = ring[(i + 1) % 4]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L; for (let d = 0.6; d < L; d += 1.8) G.box(a[0] + ux * d, a[1] + uz * d, ux, uz, 0.4, 0.3, D.yR + 9, D.yR + 10.2, D.tint, cell('plain'), cell('plain'), 1, 1); } }
      }
    }
    // ---- the Yacht Club at the chicane (the street kit builds it along the quay when the track data lists it)
    const ycm = add('yachtClub');
    if (ycm && !(t.data.street && t.data.street.ycm)) {
      const c = centroid(ycm); let y = sc.height(c[0], c[1]); let ring = ycm; G.at(c[0], c[1], 'D', 0); G.acc = WHITE;
      for (let k = 0; k < 4 && ring; k++) { G.prism(ring, k ? y : y - 2, y + 4.2, C(0xf6f6f4), cell('ycm'), -3.7, 4.2, k ? 0 : -2 / 4.2); G.cap(ring, y + 4.2, C(0xd8cfc2), cell('terrace'), 3); for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.1) continue; const n = [(b[1] - a[1]) / L, 0, -(b[0] - a[0]) / L]; G.quad([b[0], y + 4.2, b[1]], [a[0], y + 4.2, a[1]], [a[0], y + 5.2, a[1]], [b[0], y + 5.2, b[1]], n, [0, 0, L / 3, 0, L / 3, 1, 0, 1], C(0xffffff), cell('rail', 1)); } y += 4.2; ring = offsetRing(ring, 2.6 + k * 0.6); }
    }
    // ---- the hotel over the hairpin: a long curved block over the tunnel, deep balcony bands with planters, from the sea road to
    // the hairpin level (its outline stays over the tunnel on purpose: the facade stops at the tunnel's roof)
    const fair = R('fairmont'); if (fair) claimed.push(fair);
    if (fair) {
      const c = centroid(fair); const TD = t.data.tunnel;
      const i0 = t.idxAtS(1262); const yTop = t.y[i0] + 19; const tint = C(0xebe2d2), fc = cell('fair_flr'); G.acc = C(0xd0d4d6);
      for (const kind of ['D', 'P']) {
        G.at(c[0], c[1], kind, 0);
        for (let i = 0; i < fair.length; i++) {
          const P0 = fair[i], P1 = fair[(i + 1) % fair.length]; const L = Math.hypot(P1[0] - P0[0], P1[1] - P0[1]); if (L < 0.1) continue; const n = [(P1[1] - P0[1]) / L, 0, -(P1[0] - P0[0]) / L];
          const np = Math.max(1, Math.round(L / 6)); let u = i * 3;
          for (let k = 0; k < np; k++) {
            const a = [P0[0] + (P1[0] - P0[0]) * k / np, P0[1] + (P1[1] - P0[1]) * k / np], b = [P0[0] + (P1[0] - P0[0]) * (k + 1) / np, P0[1] + (P1[1] - P0[1]) * (k + 1) / np];
            const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; const pr = t.project(mx, mz, null, {});
            let yb = Math.min(sc.height(a[0], a[1]), sc.height(b[0], b[1])) - 1;
            if (TD && pr.s > TD.s0 - 10 && pr.s < TD.s1 + 10 && pr.dist < Math.max(t.wallL[pr.i], t.wallR[pr.i]) + 2.2) yb = Math.max(yb, t.y[pr.i] + 7.3);
            const nfl = Math.max(1, Math.round((yTop - yb) / 3.3));
            G.quad([b[0], yb, b[1]], [a[0], yb, a[1]], [a[0], yTop, a[1]], [b[0], yTop, b[1]], n, [u, 0, u + 1, 0, u + 1, nfl, u, nfl], tint, fc); u++;
            // the roof fascia: dark lettered panels along the faces seen from the hairpin, white slab edge elsewhere
            if (pr.dist < 140 && (k & 1) === 0 && L > 5) G.quad([b[0], yTop, b[1]], [a[0], yTop, a[1]], [a[0], yTop + 1.6, a[1]], [b[0], yTop + 1.6, b[1]], n, [0, 0, 2, 0, 2, 1, 0, 1], WHITE, cell('roofsign'));
            else G.quad([b[0], yTop, b[1]], [a[0], yTop, a[1]], [a[0], yTop + 1.1, a[1]], [b[0], yTop + 1.1, b[1]], n, [0, 0, 1, 0, 1, 0.3, 0, 0.3], WHITE, cell('slab'));
            // near: a balcony slab with a planter edge at every floor, where it clears the circuit
            if (kind === 'D') {
              const o = [n[0] * 1.6, n[2] * 1.6]; const A = [a[0] + o[0], a[1] + o[1]], B = [b[0] + o[0], b[1] + o[1]];
              if (segClear(E, A, B, 1.5)) for (let f = 1; f < nfl; f++) { const y = yTop - f * 3.3; if (y < yb + 2) break; G.quad([B[0], y - 0.25, B[1]], [A[0], y - 0.25, A[1]], [A[0], y, A[1]], [B[0], y, B[1]], n, [0, 0, 2, 0, 2, 0.1, 0, 0.1], WHITE, cell('slab')); G.quad([b[0], y - 0.25, b[1]], [a[0], y - 0.25, a[1]], [A[0], y - 0.25, A[1]], [B[0], y - 0.25, B[1]], [0, -1, 0], [0, 0, 2, 0, 2, 0.5, 0, 0.5], scaleC(WHITE, 0.75), cell('slab')); G.quad([B[0], y + 0.55, B[1]], [A[0], y + 0.55, A[1]], [A[0] - o[0] * 0.3, y + 0.55, A[1] - o[1] * 0.3], [B[0] - o[0] * 0.3, y + 0.55, B[1] - o[1] * 0.3], [0, 1, 0], [0, 0, 2, 0, 2, 0.4, 0, 0.4], C(0xffffff), cell('shrub')); G.quad([B[0], y, B[1]], [A[0], y, A[1]], [A[0], y + 0.55, A[1]], [B[0], y + 0.55, B[1]], n, [0, 0, 2, 0, 2, 0.4, 0, 0.4], C(0xffffff), cell('shrub')); }
            }
          }
        }
        G.cap(fair, yTop, C(0xcfc8bc), cell('terrace'), 3);
        const ob = obb(fair); if (ob) for (const k of [-0.25, 0.3]) { const r = rectRing(ob.cx + ob.ux * ob.hl * k, ob.cz + ob.uz * ob.hl * k, ob.ux, ob.uz, 9, Math.min(6, ob.hw * 0.4)); G.prism(r, yTop, yTop + 3.4, C(0xf2f0ea), cell('mg_flr'), 3, 3.4, 0); G.cap(r, yTop + 3.4, C(0xe0ddd6), cell('flat'), 3); }
        // the sign rack on the roof
        if (ob) { const sx = ob.cx + ob.ux * ob.hl * 0.02, sz = ob.cz + ob.uz * ob.hl * 0.02; const sn = rectRing(sx, sz, ob.ux, ob.uz, 7, 0.15); G.prism(sn, yTop + 3.4, yTop + 6.4, C(0xffffff), cell('roofsign'), 14, 3, 0); }
      }
    }
  };

  // ---- the swimming pool between the two Piscine chicanes: deck, the basin, the diving tower, a low pool house along the quay
  function pool(E, G) {
    const t = E.t, sc = E.sc; const i = t.idxAtS(2630);
    let j = 0, bd = Infinity; for (let s = t.sf - 200; s < t.sf + 1; s += 4) { const k = t.idxAtS(s); const d = Math.hypot(t.x[k] - t.x[i], t.z[k] - t.z[i]); if (d < bd) { bd = d; j = k; } }
    const side = (t.x[j] - t.x[i]) * t.nx[i] + (t.z[j] - t.z[i]) * t.nz[i] > 0 ? 1 : -1;
    let tx = t.tx[i], tz = t.tz[i], nx = t.nx[i] * side, nz = t.nz[i] * side;
    let off = t.wallR[i] + 4, W = 24;
    for (; W > 12; W -= 1) { const cx = t.x[i] + nx * (off + W / 2), cz = t.z[i] + nz * (off + W / 2); const far = [cx + nx * W / 2, cz + nz * W / 2]; const p = t.project(far[0], far[1], null, {}); if (Math.abs(p.s - t.s[i]) < 100 || p.dist > Math.max(t.wallL[p.i], t.wallR[p.i]) + 42) break; }
    let L = 54, cx, cz, deck, tx2 = tx, tz2 = tz, nx2 = nx, nz2 = nz;
    // the real basin from the map when it lies by the circuit (the Stade Nautique), else between the chicanes
    const osm = (E.data.pools || []).find(q => E.dcAt(q[0], q[1]) < 90 && q[2] > 30);
    if (osm) {
      L = osm[2] + 4; W = osm[3] + 3; cx = osm[0]; cz = osm[1]; tx2 = Math.cos(osm[4]); tz2 = Math.sin(osm[4]); nx2 = -tz2; nz2 = tx2;
      let m = 4; for (; m > 0.5; m -= 0.5) { deck = rectRing(cx, cz, tx2, tz2, L / 2 + m, W / 2 + m); let ok = true; for (let q = 0; q < 4; q++) if (!segClear(E, deck[q], deck[(q + 1) % 4], 1.5)) { ok = false; break; } if (ok) break; }
    } else {
    for (let k = 0; k < 30; k++, off += 0.5) { cx = t.x[i] + nx * (off + W / 2); cz = t.z[i] + nz * (off + W / 2); deck = rectRing(cx, cz, tx, tz, L / 2 + 2, W / 2 + 1); let ok = true; for (let q = 0; q < 4; q++) if (!segClear(E, deck[q], deck[(q + 1) % 4], 1.5)) { ok = false; break; } if (ok) break; }
    }
    tx = tx2; tz = tz2; nx = nx2; nz = nz2;
    const y = (osm ? E.sc.height(cx, cz) : t.y[i]) + 0.25; G.acc = C(0x2f6e9e);
    for (const kind of ['D', 'P']) {
      const wl = L / 2 - 2, ww = W / 2 - 1.5; const q = rectRing(cx, cz, tx, tz, wl, ww); const yw = y - 0.35;
      // the deck round the basin (a band between the two outlines, so the water shows), its edge down to the quay
      G.at(cx, cz, kind, 0); G.band(q, deck, y, C(0xf2f0ea), cell('pooltile'), 2.4); G.prism(deck, y - 0.6, y, C(0xe8e4dc), cell('kerb'), 2, 0.6, 0);
      G.quad([q[0][0], yw, q[0][1]], [q[1][0], yw, q[1][1]], [q[2][0], yw, q[2][1]], [q[3][0], yw, q[3][1]], [0, 1, 0], [0, 0, wl / 1.2, 0, wl / 1.2, ww * 2 / 2.5, 0, ww * 2 / 2.5], C(0xffffff), cell('water'));
      if (kind === 'P') continue;
      for (let k = 0; k < 4; k++) { const a = q[k], b = q[(k + 1) % 4]; const L2 = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = [-(b[1] - a[1]) / L2, 0, (b[0] - a[0]) / L2]; G.quad([a[0], yw - 0.1, a[1]], [b[0], yw - 0.1, b[1]], [b[0], y + 0.01, b[1]], [a[0], y + 0.01, a[1]], n, [0, 0, L2 / 2.4, 0, L2 / 2.4, 0.15, 0, 0.15], C(0xdbe9ec), cell('pooltile')); }
      // the diving tower at the far end: two piers, platforms at 3, 5, 7.5 and 10 m with blue rails; loungers and parasols on the deck
      const dx = cx + tx * (wl + 1.2), dz = cz + tz * (wl + 1.2); const con = C(0xe6e3dc), cc = cell('conc');
      for (const sd of [-1, 1]) G.box(dx - nx * sd * 2.2, dz - nz * sd * 2.2, tx, tz, 0.5, 0.5, y, y + 10.4, con, cc, cc, 1, 3);
      for (const [h, len] of [[3, 3.5], [5, 4.5], [7.5, 5.5], [10, 6.5]]) { G.box(dx - tx * len / 2 + tx * 0.6, dz - tz * len / 2 + tz * 0.6, tx, tz, len / 2, 1.3, y + h - 0.3, y + h, con, cc, cc, 1, 1); G.box(dx - tx * len + tx * 0.8, dz - tz * len + tz * 0.8, tx, tz, 0.05, 1.25, y + h, y + h + 1.0, C(0x3a6aa0), cc, null, 1, 1); }
      for (let k = -3; k <= 3; k++) { const px = cx + tx * k * 6.5 + nx * (ww + 0.6), pz = cz + tz * k * 6.5 + nz * (ww + 0.6); if (k % 2 === 0) parasol(G, px, y, pz, 1.4); else G.box(px, pz, tx, tz, 0.9, 0.32, y, y + 0.35, C(0xf4f4f0), cell('plain'), cell('awn'), 1, 1); }
    }
    E.poolInfo = { cx, cz, tx, tz, nx, nz, L, W, y };
  }
  // ---- the planted island inside the hairpin (from the map's flowerbed) and the retaining wall above the descent to it
  function hairpin(E, G) {
    const t = E.t, sc = E.sc; let isl = null; const i0 = t.idxAtS(1262);
    for (const L of E.data.land || []) { if (L[0] !== 6) continue; const p = []; for (let i = 1; i + 1 < L.length; i += 2) p.push([L[i], L[i + 1]]); const c = centroid(p); if (Math.hypot(c[0] - t.x[i0], c[1] - t.z[i0]) < 40) { isl = cleanRing(p); break; } }
    const kitIsland = EI.StreetKit && EI.StreetKit.hairpin && EI.StreetKit.hairpin(t);
    if (isl && !kitIsland) {
      const c = centroid(isl); const y = sc.height(c[0], c[1]) + 0.05; G.at(c[0], c[1], 'D', 0);
      G.prism(isl, y - 0.4, y + 0.55, C(0xf4f2ee), cell('kerb'), 1.2, 0.95, 0); G.cap(isl, y + 0.55, C(0xffffff), cell('soil'), 2);
      const ins = offsetRing(isl, 0.8); if (ins) G.cap(ins, y + 0.6, C(0xffffff), cell('flowers'), 2);
      palm(G, c[0], y + 0.55, c[1], 5.5, 11); palm(G, c[0] + 1.5, y + 0.55, c[1] - 1, 4.2, 12); for (let k = 0; k < 5; k++) agave(G, c[0] + Math.cos(k * 1.3) * 2.2, y + 0.6, c[1] + Math.sin(k * 1.3) * 2.2, 0.9, 20 + k);
      E.hairpinIsland = c;
    }
    const ref = E.hairpinIsland || [t.x[i0], t.z[i0]]; let side = 1;
    { const j = t.idxAtS(1200); const lat = (ref[0] - t.x[j]) * t.nx[j] + (ref[1] - t.z[j]) * t.nz[j]; side = lat > 0 ? -1 : 1; }
    const RT = (t.data.street && t.data.street.retaining) || []; if (RT.some(r => r[0] < 1240 && r[1] > 1150)) return;
    let prev = null; const stC = cell('stone'), sc0 = C(0xf0e8da);
    for (let s = 1150; s <= 1242; s += 2) {
      const i = t.idxAtS(s); const w = E.wallCap(i, side) + 1.6; const x = t.x[i] + t.nx[i] * side * w, z = t.z[i] + t.nz[i] * side * w; const x2 = t.x[i] + t.nx[i] * side * (w + 3), z2 = t.z[i] + t.nz[i] * side * (w + 3);
      const h = 8.5 * U.smoothstep(1150, 1168, s) * (1 - U.smoothstep(1226, 1242, s)) + 1.2; const y = t.y[i] + 0.1; const cur = { x, z, x2, z2, y, top: y + h };
      if (prev) { const nn = [-t.nx[i] * side, 0, -t.nz[i] * side]; G.at(x, z, 'D', 0); G.quad([prev.x, prev.y - 0.4, prev.z], [x, y - 0.4, z], [x, cur.top, z], [prev.x, prev.top, prev.z], nn, [(s - 2) / 2.6, 0, s / 2.6, 0, s / 2.6, (cur.top - y) / 2.6, (s - 2) / 2.6, (prev.top - prev.y) / 2.6], sc0, stC); G.quad([prev.x, prev.top, prev.z], [x, cur.top, z], [x2, cur.top, z2], [prev.x2, prev.top, prev.z2], [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], C(0xc8c0b4), cell('pave')); }
      prev = cur;
    }
  }
  // ---- the Casino square garden: the lawn island with its flower beds, the fountain basin and palms
  function casinoLawn(E) {
    if (E.casinoLawn !== undefined) return E.casinoLawn; const t = E.t; const lm = E.data.landmarks || {}; if (!lm.fountain) return (E.casinoLawn = null);
    const f = centroid(lm.fountain); const pr = t.project(f[0], f[1], null, {});
    const tx = t.tx[pr.i], tz = t.tz[pr.i]; const toTrack = [t.x[pr.i] - f[0], t.z[pr.i] - f[1]]; const dl = Math.hypot(toTrack[0], toTrack[1]) || 1;
    let cx = f[0] + toTrack[0] / dl * 4, cz = f[1] + toTrack[1] / dl * 4; let ra = 30, rb = 19; const ang = Math.atan2(tz, tx);
    const mk = () => { const p = []; for (let k = 0; k < 28; k++) { const a = k / 28 * 6.283; const lx = Math.cos(a) * ra, lz = Math.sin(a) * rb; p.push([cx + lx * Math.cos(ang) - lz * Math.sin(ang), cz + lx * Math.sin(ang) + lz * Math.cos(ang)]); } return cleanRing(p); };
    let lawn = mk(); for (let it = 0; it < 30; it++) { let ok = true; for (const q of lawn) if (!clear(E, q[0], q[1], 5.5)) { ok = false; break; } if (ok) break; ra *= 0.95; rb *= 0.95; cx += (f[0] - cx) * 0.15; cz += (f[1] - cz) * 0.15; lawn = mk(); }
    lawn.info = { cx, cz, ra, rb, ang, f }; return (E.casinoLawn = lawn);
  }
  function casinoGarden(E, G) {
    const sc = E.sc; const lm = E.data.landmarks || {}; const lawn = casinoLawn(E); if (!lawn) return;
    const { cx, cz, ra, rb, ang, f } = lawn.info; const y = sc.height(cx, cz) + 0.02; G.at(cx, cz, 'D', 0);
    G.prism(lawn, y - 0.3, y + 0.3, C(0xece8e0), cell('kerb'), 1.5, 0.6, 0); G.cap(lawn, y + 0.3, C(0xffffff), cell('lawn'), 3);
    const ring = (r) => { const p = []; for (let k = 0; k < 20; k++) p.push([f[0] + Math.cos(k / 20 * 6.283) * r, f[1] + Math.sin(k / 20 * 6.283) * r]); return cleanRing(p); };
    const fr = lm.fountain ? Math.sqrt(Math.abs(area2(cleanRing(lm.fountain))) / 2 / Math.PI) : 5;
    G.cap(ring(fr + 2.6), y + 0.36, C(0xffffff), cell('flowers'), 2);
    for (const sg of [-1, 1]) { const ex = cx + Math.cos(ang) * ra * 0.62 * sg, ez = cz + Math.sin(ang) * ra * 0.62 * sg; const p = []; for (let k = 0; k < 14; k++) { const a = k / 14 * 6.283; p.push([ex + Math.cos(a) * 4.5, ez + Math.sin(a) * 2.4]); } G.cap(cleanRing(p), y + 0.36, C(0xffffff), cell('flowers'), 2); }
    const fb = ring(fr), fi = offsetRing(fb, 0.5) || fb; G.prism(fb, y, y + 0.75, C(0xf0ebe0), cell('stone'), 1.2, 0.75, 0); G.cap(fi, y + 0.55, C(0xffffff), cell('water'), 3);
    for (let k = 0; k < fb.length; k++) { const a = fb[k], b = fb[(k + 1) % fb.length], c2 = fi[(k + 1) % fi.length], d = fi[k]; G.quad([a[0], y + 0.75, a[1]], [b[0], y + 0.75, b[1]], [c2[0], y + 0.75, c2[1]], [d[0], y + 0.75, d[1]], [0, 1, 0], [0, 0, 1, 0, 1, 0.2, 0, 0.2], C(0xf4f0e6), cell('conc')); }
    G.lathe(f[0], f[1], [[1.2, y + 0.5], [0.9, y + 1.6], [0.4, y + 2.2], [1.4, y + 2.4], [0.05, y + 2.6]], 10, C(0xd8d4cc), cell('conc'), 1);
    for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283 + 0.3; const lx = Math.cos(a) * ra * 0.78, lz = Math.sin(a) * rb * 0.72; const px = cx + lx * Math.cos(ang) - lz * Math.sin(ang), pz = cz + lx * Math.sin(ang) + lz * Math.cos(ang); palm(G, px, y + 0.3, pz, 7 + (k % 3) * 1.6, 100 + k); }
  }
  // ---- the Rascasse: the low bar-restaurant inside the corner, glazed ground floor, red awnings, a roof terrace
  // ---- the white block with the round portholes at the Nouvelle Chicane (chicane2, chicane_a): no map footprint, so it is laid out by hand
  // along the barrier ([s0, s1, side, gap, depth, floors] in street.pthBlock, else the default for Monaco): a ribbed podium with portholes
  // and a pale tower body whose floors carry wavy white balcony slabs; sits on the road level, the ground behind it climbs into it
  function portholeBlock(E, G, claimed) {
    const t = E.t, sc = E.sc; const PB = (t.data.street && t.data.street.pthBlock) || (t.data.id === 'monaco' ? [2012, 2096, -1, 6, 17, 7] : null); if (!PB) return;
    const [s0, s1, side, gap, depth, nf] = PB; const near = [], far = [];
    // the back of the block reached across Beau Rivage (the stretch above the chicane) and its roof spanned the road: each slice now
    // stops short of any other stretch's barrier line (FIT-AUDIT)
    // clearance beyond the barrier of the nearest OTHER stretch (> 80 m of lap away; brute force: project() can settle on the near stretch)
    const otherClear = (px, pz, i) => { let bd = Infinity, bj = 0; for (let j = 0; j < t.n; j += 2) { const di = Math.abs(j - i); if (Math.min(di, t.n - di) < 40) continue; const d = (t.x[j] - px) ** 2 + (t.z[j] - pz) ** 2; if (d < bd) { bd = d; bj = j; } } return Math.sqrt(bd) - Math.max(t.wallL[bj], t.wallR[bj]); };
    for (let s = s0; s <= s1 + 0.01; s += 6) { const i = t.idxAtS(s); const w = E.wallCap(i, side) + gap; let dd = depth; for (let d2 = 1; d2 <= depth; d2++) { const px = t.x[i] + t.nx[i] * side * (w + d2), pz = t.z[i] + t.nz[i] * side * (w + d2); if (otherClear(px, pz, i) < 2.5) { dd = Math.max(2, d2 - 1); break; } }
      near.push([t.x[i] + t.nx[i] * side * w, t.z[i] + t.nz[i] * side * w, i, w, dd]); }
    // eroded (min with the neighbours) so the back edge between two slices cannot cut the corner of the other road either
    for (let k = 0; k < near.length; k++) { const q = near[k], dd = Math.min(q[4], (near[k - 1] || q)[4], (near[k + 1] || q)[4]), i = q[2]; far.push([t.x[i] + t.nx[i] * side * (q[3] + dd), t.z[i] + t.nz[i] * side * (q[3] + dd)]); }
    const ring = cleanRing(near.map(q => [q[0], q[1]]).concat(far.reverse())); if (ring.length < 4) return; claimed.push(ring);
    const c = centroid(ring); const D = forced('pth', nf, 0xf8f8f5, 'flat', { pth: true, noBalc: true, noChimneys: true, shops: false }); both(E, G, ring, D, c);
    // wavy balcony slabs along the face that looks at the road: one white slab per floor, its outer edge swinging 0.3 .. 1.3 m out
    const L = D.lv, S = D.S, slab = cell('slab'), tk = 0.26; const WV = C(0xfafaf8);
    for (let k = 0; k < nf; k++) {
      const y1 = L.yG + S.gh + k * S.fh + 1.0, y0 = y1 - tk; let U0 = 0; G.at(c[0], c[1], 'D', 0);
      for (let j = 0; j + 1 < near.length; j++) {
        const a = near[j], b = near[j + 1]; const dx = b[0] - a[0], dz = b[1] - a[1], Ls = Math.hypot(dx, dz); if (Ls < 0.5) continue;
        const n = [-side * t.nx[a[2]], 0, -side * t.nz[a[2]]]; const m = 3; let prev = null;
        for (let q = 0; q <= m; q++) {
          const u = q / m, px = a[0] + dx * u, pz = a[1] + dz * u; const off = 0.8 + 0.5 * Math.sin((j * m + q) * 1.05 + k * 0.7);
          const cur = { i: [px, pz], o: [px + n[0] * off, pz + n[2] * off] };
          if (prev) {
            const u1 = U0 + Ls / m / 2.4; const A = prev.o, B = cur.o, Ai = prev.i, Bi = cur.i;
            G.quad([B[0], y1, B[1]], [A[0], y1, A[1]], [Ai[0], y1, Ai[1]], [Bi[0], y1, Bi[1]], [0, 1, 0], [U0, 0, u1, 0, u1, 0.5, U0, 0.5], WV, slab);
            G.quad([A[0], y0, A[1]], [B[0], y0, B[1]], [Bi[0], y0, Bi[1]], [Ai[0], y0, Ai[1]], [0, -1, 0], [U0, 0, u1, 0, u1, 0.5, U0, 0.5], scaleC(WV, 0.78), slab);
            G.quad([B[0], y0, B[1]], [A[0], y0, A[1]], [A[0], y1, A[1]], [B[0], y1, B[1]], n, [U0, 0, u1, 0, u1, 0.1, U0, 0.1], WV, slab); U0 = u1;
          }
          prev = cur;
        }
      }
    }
    G.sub = 0; E.stats.pthBlock = [Math.round(D.H), near.length];
  }

  function rascasse(E, G, claimed) {
    const t = E.t; const i = t.idxAtS(2905); let best = null, bd = 60;
    const stands = (t.data.scenery.grandstands || []).map(g => g.p).concat(E.standPolys || []);
    for (const b of t.data.scenery.buildings.concat(Env.decodeCity(E.data.cityFill))) { const r = cleanRing(b.p); const c = centroid(r); const d = Math.hypot(c[0] - t.x[i], c[1] - t.z[i]); const a = Math.abs(area2(r)) / 2; if (d < bd && a > 80 && a < 1500 && !stands.some(sp2 => r.some(q => pip(q[0], q[1], sp2)))) { bd = d; best = r; } }
    if (!best) return; claimed.push(best); best = pushClear(E, best, 3.0); const c = centroid(best); E.rascasseInfo = c;
    const D = forced('villa', 1, 0xf2ece0, 'flat', { noBalc: true, acc: C(0xa8282e) }); D.S = Object.assign({}, STY.villa, { gh: 4.2, cornice: true }); D.nf = 1; D.H = 4.2 + 3.2; D.style = 'rascasse';
    both(E, G, best, D, c); G.at(c[0], c[1], 'D', 1); G.acc = D.acc;
    const yA = D.yR - 3.4; const aw = offsetRing(best, -1.6);
    if (aw) for (let k = 0; k < best.length; k++) { const a = best[k], b = best[(k + 1) % best.length], A = aw[k], B = aw[(k + 1) % best.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); G.quad([B[0], yA - 0.7, B[1]], [A[0], yA - 0.7, A[1]], [a[0], yA, a[1]], [b[0], yA, b[1]], null, [0, 0, L / 3, 0, L / 3, 1, 0, 1], WHITE, cell('awn')); G.quad([b[0], yA, b[1]], [a[0], yA, a[1]], [A[0], yA - 0.7, A[1]], [B[0], yA - 0.7, B[1]], null, [0, 0, L / 3, 0, L / 3, 1, 0, 1], scaleC(WHITE, 0.55), cell('awn')); }
    G.sub = 0;
  }
  City.extras = function (E, G) { pool(E, G); hairpin(E, G); casinoGarden(E, G); streetWalls(E, G); rocherCliffs(E, G); dropWalls(E, G); };

  // ================================================================ pavements along the barriers (block paving, granite kerb) and retaining walls
  function pavements(E, G) {
    const t = E.t, sc = E.sc; const n = t.n; const W = 4.2, KW = 0.32;
    const pit = t.data.pit || []; const sf = t.sf || 0; const stands = (t.data.scenery.grandstands || []).map(g => g.p).concat(E.standPolys || []);
    const TD = t.data.tunnel; const inTunnel = (s) => TD && s > TD.s0 - 6 && s < TD.s1 + 6;
    const lapD = (a, b) => { let d = Math.abs(a - b) % t.length; return Math.min(d, t.length - d); };
    const nearPit = (x, z) => { for (let k = 0; k + 1 < pit.length; k++) if (Env.segDist(x, z, pit[k][0], pit[k][1], pit[k + 1][0], pit[k + 1][1]) < 13) return true; return false; };
    const water = (t.data.scenery.water || []).filter(w => w.length > 2);
    const inWater = (x, z) => { if (E.isSea(x, z)) return true; for (const w of water) if (pip(x, z, w)) return true; return false; };
    const paveC = cell('pave'), kerbC = cell('kerb'), stoneC = cell('stone');
    // terracotta block paving from Ste Devote up through the town to Portier (beaurivage1, hairpin_entry), warm grey stone on the harbour side
    const pcT = C(0xe0a48c), pcG = C(0xd8d0c6), kc = C(0xe8e6e2), sc0 = C(0xcfc4b2); const terra = (s) => t.data.street && s > 130 && s < 1440;
    // Ste Devote (the chapel corner and the climb out of it): grey / salmon chequer flags (devote2)
    const chqC = cell('chequer'); const chq = (s) => t.data.id === 'monaco' && s > 120 && s < 330;
    let walls = 0; const RT = (t.data.street && t.data.street.retaining) || []; const retain = (s) => RT.some(r => s > r[0] - 10 && s < r[1] + 10); const TER = ((t.data.street && t.data.street.terraces) || []).concat(t.data.street && t.data.street.ycm ? [t.data.street.ycm] : []);
    for (const side of [-1, 1]) {
      let prev = null, u = 0, tierLast = 0, tierHold = 0;
      for (let i = 0; i <= n; i++) {
        const ii = i % n; const s = t.s[ii];
        const w0 = E.wallCap(ii, side) + 0.2; const x0 = t.x[ii] + t.nx[ii] * side * w0, z0 = t.z[ii] + t.nz[ii] * side * w0;
        // the street kit's quay terraces stand on the pavement line: stop the paving short of their fronts
        let Wd = W; for (const tr of TER) if (tr[2] === side && s >= tr[0] - 2 && s <= tr[1] + 2) Wd = Math.min(Wd, tr[3] - 0.4);
        const x1 = t.x[ii] + t.nx[ii] * side * (w0 + Wd), z1 = t.z[ii] + t.nz[ii] * side * (w0 + Wd);
        let ok = !inTunnel(s) && !inWater(x1, z1) && !inWater((x0 + x1) / 2, (z0 + z1) / 2);
        if (ok && E.pitSide === side && lapD(s, sf) < 225) ok = false;
        if (ok && nearPit(x1, z1)) ok = false;
        if (ok) for (const p of stands) if (pip(x1, z1, p) || pip((x0 + x1) / 2, (z0 + z1) / 2, p)) { ok = false; break; }
        // the other stretch of the lap close by (Beau Rivage over the harbour front): never pave over its barrier
        if (ok && !clear(E, x1, z1, -0.3) && t.project(x1, z1, null, E._cpr).i !== ii && Math.abs(t.project(x1, z1, null, E._cpr).i - ii) > 40) ok = false;
        // never pave into the road: on the inside of tight bends the neighbouring samples' edges cross the barrier line
        if (ok) for (const [px, pz] of [[x0, z0], [x1, z1]]) { const p = t.project(px, pz, null, E._cpr); if (Math.abs(p.i - ii) < 40 || Math.abs(p.i - ii) > n - 40) { if (p.dist < E.wallCap(p.i, p.lat < 0 ? -1 : 1) + 0.1) { ok = false; break; } } }
        const y = t.y[ii] + 0.06;
        const cur = ok ? { x0, z0, x1, z1, xk: t.x[ii] + t.nx[ii] * side * (w0 + KW), zk: t.z[ii] + t.nz[ii] * side * (w0 + KW), y, yr: t.y[ii] - 0.05, ii } : null;
        // the ribbon between two samples cuts the corner on the inside of a bend: its mid edge must stay behind the barrier too
        // (inside the barriers of any sample within 30 m of the lap: where the barrier width jumps, as at the chicane's escape road,
        // the nearest centreline sample alone does not tell)
        if (prev && cur) { const inRoad = (x, z) => { const p = t.project(x, z, null, E._cpr); for (let k = p.i - 15; k <= p.i + 15; k++) { const j = (k % n + n) % n; const dx = x - t.x[j], dz = z - t.z[j]; if (Math.abs(dx * t.tx[j] + dz * t.tz[j]) > 1.1) continue; const la = dx * t.nx[j] + dz * t.nz[j]; if (la > -E.wallCap(j, -1) - 0.12 && la < E.wallCap(j, 1) + 0.12) return true; } return false; }; if (inRoad((prev.x0 + cur.x0) / 2, (prev.z0 + cur.z0) / 2) || inRoad((prev.x0 + cur.x1) / 2, (prev.z0 + cur.z1) / 2) || inRoad((prev.x1 + cur.x0) / 2, (prev.z1 + cur.z0) / 2) || inRoad(prev.xk, prev.zk) || inRoad(cur.xk, cur.zk) || inRoad(prev.x1, prev.z1) || inRoad(cur.x1, cur.z1) || inRoad((prev.x1 + cur.x1) / 2, (prev.z1 + cur.z1) / 2)) prev = null; }
        if (prev && cur) {
          const dl = Math.hypot(cur.x1 - prev.x1, cur.z1 - prev.z1); const u1 = u + dl / 2.4;
          G.at((cur.x0 + cur.x1) / 2, (cur.z0 + cur.z1) / 2, 'D', 0);
          // ribbon corners ordered so the faces point up whichever side we are on
          const A = (P, k) => [P['x' + k], P.y, P['z' + k]];
          const q = (a0, a1, b0, b1, uv, col, cl) => { if (side > 0) G.quad(a0, b0, b1, a1, [0, 1, 0], [uv[0], uv[1], uv[2], uv[3], uv[4], uv[5], uv[6], uv[7]], col, cl); else G.quad(a1, b1, b0, a0, [0, 1, 0], [uv[6], uv[7], uv[4], uv[5], uv[2], uv[3], uv[0], uv[1]], col, cl); };
          // granite kerb strip, then the block paving
          q([prev.x0, prev.y, prev.z0], [prev.xk, prev.y, prev.zk], [cur.x0, cur.y, cur.z0], [cur.xk, cur.y, cur.zk], [u, 0, u, 0.15, u1, 0.15, u1, 0], kc, kerbC);
          q([prev.xk, prev.y, prev.zk], [prev.x1, prev.y, prev.z1], [cur.xk, cur.y, cur.zk], [cur.x1, cur.y, cur.z1], [u, 0, u, (Wd - KW) / 2.4, u1, (Wd - KW) / 2.4, u1, 0], chq(s) ? WHITE : terra(s) ? pcT : pcG, chq(s) ? chqC : paveC);
          // kerb face down to the road surface (behind the barrier)
          const nn = [-t.nx[ii] * side, 0, -t.nz[ii] * side];
          if (side > 0) G.quad([prev.x0, prev.yr, prev.z0], [cur.x0, cur.yr, cur.z0], [cur.x0, cur.y, cur.z0], [prev.x0, prev.y, prev.z0], nn, [u, 0, u1, 0, u1, 0.07, u, 0.07], kc, kerbC);
          else G.quad([cur.x0, cur.yr, cur.z0], [prev.x0, prev.yr, prev.z0], [prev.x0, prev.y, prev.z0], [cur.x0, cur.y, cur.z0], nn, [u1, 0, u, 0, u, 0.07, u1, 0.07], kc, kerbC);
          // a retaining wall where the ground behind climbs well above the pavement and nothing is built there
          const xb = t.x[ii] + t.nx[ii] * side * (w0 + W + 6), zb = t.z[ii] + t.nz[ii] * side * (w0 + W + 6);
          const gb = sc.gridHeight(xb, zb); let hw = gb - cur.y, tier = 0;
          // another stretch of the lap just above this one (Beau Rivage over the harbour front): the ground between can't follow
          // both roads on the terrain grid, so a tall retaining wall carries the upper level
          if (E.dC2) { const k = E._near(xb, zb), k0 = E._near(cur.x0, cur.z0); const d2 = E.dC2[k], i2 = E.dIdx2[k]; if (d2 < 80 && d2 < E.dC2[k0] - 2 && t.y[i2] - cur.y > 2.5) tier = Math.min(24, t.y[i2] - 0.25 - cur.y); }
          // the test flips node by node where the two levels are close, which left a 24 m wall as isolated 2 m slabs ('pillars' at Portier): a wall already running carries on over the next 14 nodes
          if (tier > 0) { tierLast = tier; tierHold = 14; } else if (tierHold > 0) { tier = tierLast; tierHold--; }
          const terr = TER.some(tr => tr[2] === side && s >= tr[0] - 4 && s <= tr[1] + 4);
          if ((hw > 1.6 || tier > 0) && !terr && !retain(s) && !(E.occAt(cur.x1, cur.z1) & Env.OCC.BUILT) && !(E.occAt(xb, zb) & Env.OCC.BUILT)) {
            const top = cur.y + Math.max(tier, Math.min(hw + 0.6, 4.8)), ptop = prev.wt || top; const v1 = (top - cur.y) / 2.4, v0 = (ptop - prev.y) / 2.4;
            if (side > 0) G.quad([prev.x1, prev.y - 0.3, prev.z1], [cur.x1, cur.y - 0.3, cur.z1], [cur.x1, top, cur.z1], [prev.x1, ptop, prev.z1], nn, [u, 0, u1, 0, u1, v1, u, v0], sc0, stoneC);
            else G.quad([cur.x1, cur.y - 0.3, cur.z1], [prev.x1, prev.y - 0.3, prev.z1], [prev.x1, ptop, prev.z1], [cur.x1, top, cur.z1], nn, [u1, 0, u, 0, u, v0, u1, v1], sc0, stoneC);
            cur.wt = top; walls++;
          }
          u = u1;
        }
        prev = cur;
      }
    }
    E.stats.cityWalls = walls;
  }

  // ================================================================ field-map overlays
  // land cover (sRGB, alpha): woods and gardens are dark greens under a scatter of crowns, scrub / meadows a light olive wash over
  // the garrigue already painted (never flat bright green), bare rock, flower beds, cemeteries, sports pitches, beaches, rail yards
  const LANDC = { 1: [40, 50, 32, 0.9], 2: [76, 80, 56, 0.45], 3: [150, 145, 135, 0.8], 4: [52, 66, 40, 0.85], 5: [70, 78, 56, 0.45], 6: [86, 78, 52, 1], 7: [100, 104, 92, 1], 8: [58, 76, 46, 1], 9: [60, 66, 46, 0.75], 10: [196, 182, 156, 1], 11: [118, 112, 104, 1] };
  const LAND_TREES = { 1: 1, 2: 0.7, 4: 1, 5: 0.5, 9: 1 };
  City.paintBase = function (E) {
    return (ctx, path) => {
      const t = E.t; const rgb = (c) => 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
      // land cover from the map
      const pat = ctx.createPattern(Env.scrubTile(), 'repeat'); const ppm = 2048 / (2 * Env.MAP_HALF); if (pat.setTransform) pat.setTransform(new DOMMatrix([1 / ppm, 0, 0, 1 / ppm, 0, 0]));
      for (const L of E.data.land || []) {
        const code = L[0]; const p = []; for (let i = 1; i + 1 < L.length; i += 2) p.push([L[i], L[i + 1]]); if (p.length < 3) continue; const lc = LANDC[code] || [100, 100, 90, 1];
        ctx.fillStyle = 'rgba(' + lc[0] + ',' + lc[1] + ',' + lc[2] + ',' + lc[3] + ')'; path(p); ctx.fill();
        if (LAND_TREES[code]) { ctx.save(); ctx.globalAlpha = LAND_TREES[code]; ctx.fillStyle = pat; path(p); ctx.fill(); ctx.restore(); }
      }
      // urban fabric: forecourts and pavements round every footprint, then the streets (paving each side, tarmac)
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgb(124,119,112)'; ctx.lineWidth = 7; ctx.beginPath(); for (const b of t.data.scenery.buildings) { const p = b.p; ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath(); } for (const b of E.cityFar || []) { const p = b.p; ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath(); } ctx.stroke();
      E.cityStreets = Env.decodeStreets(E.data.streets);
      // pavements only where the street runs through built-up ground; country roads are plain tarmac
      for (const r of E.cityStreets) { let c = 0; for (const p of r.pts) c += E.coverAt(p[0], p[1]); r.urban = c / r.pts.length > 0.05; }
      for (const pass of [0, 1]) for (const r of E.cityStreets) { if (!pass && !r.urban) continue; ctx.strokeStyle = pass ? 'rgb(74,75,78)' : 'rgb(150,145,138)'; ctx.lineWidth = pass ? r.w * (r.urban ? 1 : 0.8) : r.w + 4; ctx.beginPath(); r.pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); }
      // swimming pools in the gardens
      for (const [x, z, L, W, a] of E.data.pools || []) { if (E.dcAt(x, z) < 90) continue; ctx.save(); ctx.translate(x, z); ctx.rotate(a); ctx.fillStyle = 'rgb(226,222,214)'; ctx.fillRect(-L / 2 - 1.2, -W / 2 - 1.2, L + 2.4, W + 2.4); ctx.fillStyle = 'rgb(64,156,196)'; ctx.fillRect(-L / 2, -W / 2, L, W); ctx.restore(); }
      // pavement band beyond the barriers (block paving) with the granite kerb line
      for (const side of [-1, 1]) for (const [off, w, col] of [[4.5, 9, 'rgb(156,140,132)'], [0.35, 0.7, 'rgb(136,134,130)']]) {
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
        for (let i = 0; i <= t.n; i += 2) { const ii = i % t.n; const d = E.wallCap(ii, side) + off; const x = t.x[ii] + t.nx[ii] * side * d, z = t.z[ii] + t.nz[ii] * side * d; if (i) ctx.lineTo(x, z); else ctx.moveTo(x, z); }
        ctx.stroke();
      }
    };
  };
  City.paint = function (E) {
    return (ctx, path) => {
      // the casino square's paving and the lawn island (the planted island inside the hairpin is geometry)
      const lm = E.data.landmarks || {};
      if (lm.placeCasino) { ctx.fillStyle = 'rgb(150,138,128)'; path(lm.placeCasino); ctx.fill(); }
      const lawn = casinoLawn(E); if (lawn) { ctx.fillStyle = 'rgb(76,112,46)'; path(lawn); ctx.fill(); }
    };
  };

  // ---- the circuit's own embankments: where the ground falls away just behind a barrier (the Grand Hotel hairpin approach runs 14 m
  // beside Portier and 15 m above it), a stone wall carries the road edge down to the ground, so no stretch floats over a void
  function dropWalls(E, G) {
    const t = E.t, sc = E.sc, n = t.n; const TD = t.data.tunnel; const stC = cell('stone'), capC = cell('conc'), col = C(0xe2d7c4), capCol = C(0xd8d2c6); let walls = 0;
    const water = (t.data.scenery.water || []).filter(w => w.length > 2); const wet = (x, z) => { if (E.isSea(x, z)) return true; for (const w of water) if (pip(x, z, w)) return true; return false; };
    // where the verge runs out from the barrier it drapes down the slope itself (track.js); the walls go where it can't
    const VW = t.streetVergeWidths ? t.streetVergeWidths() : null;
    for (const side of [-1, 1]) {
      const curs = [];
      for (let i = 0; i <= n; i++) {
        const ii = i % n, s = t.s[ii]; let cur = null;
        if (!(TD && s > TD.s0 - 8 && s < TD.s1 + 8) && !(VW && VW[side < 0 ? 0 : 1][ii] > 3)) {
          const w = E.wallCap(ii, side) + 0.3, nx = t.nx[ii] * side, nz = t.nz[ii] * side, y = t.y[ii];
          const at = (o) => [t.x[ii] + nx * (w + o), t.z[ii] + nz * (w + o)];
          const [xa, za] = at(0.4), [xb, zb] = at(3);
          if (!wet(xa, za) && !wet(xb, zb)) {
            const g = Math.min(sc.gridHeight(xa, za), sc.gridHeight(xb, zb)); const drop = y - g;
            if (drop > 1.4) { const [x, z] = at(0); cur = { x, z, top: y + 0.15, bot: Math.max(g - 0.6, y - 30), cx: x - nx * 0.4, cz: z - nz * 0.4, nn: [nx, 0, nz] }; }
          }
        }
        curs.push(cur);
      }
      // a short run of a tall wall is a sliver (a 30 m tall, 8 m wide 'pillar' where the quay edge or a gap in the data breaks the run): dropped
      for (let i = 0; i < curs.length;) { if (!curs[i]) { i++; continue; } let k = i, len = 0, hMax = 0; while (k < curs.length && curs[k]) { if (k > i) len += Math.hypot(curs[k].x - curs[k - 1].x, curs[k].z - curs[k - 1].z); hMax = Math.max(hMax, curs[k].top - curs[k].bot); k++; } if (len < 40 && hMax > 9) { for (let q = i; q < k; q++) curs[q] = null; E.stats.dropSlivers = (E.stats.dropSlivers || 0) + 1; } i = k; }
      let prev = null, u = 0;
      for (let i = 0; i < curs.length; i++) {
        const cur = curs[i];
        if (prev && cur && Math.hypot(cur.x - prev.x, cur.z - prev.z) < 6) {
          const dl = Math.hypot(cur.x - prev.x, cur.z - prev.z), u1 = u + dl / 2.6; G.at((prev.x + cur.x) / 2, (prev.z + cur.z) / 2, 'P', 0);
          const a0 = [prev.x, prev.bot, prev.z], a1 = [cur.x, cur.bot, cur.z], b1 = [cur.x, cur.top, cur.z], b0 = [prev.x, prev.top, prev.z];
          const uv = [u, 0, u1, 0, u1, (cur.top - cur.bot) / 2.6, u, (prev.top - prev.bot) / 2.6];
          // the face looks away from the road (its winding follows the side); a flat coping on top behind the barrier
          if (side > 0) G.quad(a0, a1, b1, b0, cur.nn, uv, col, stC); else G.quad(a1, a0, b0, b1, cur.nn, [uv[2], uv[3], uv[0], uv[1], uv[6], uv[7], uv[4], uv[5]], col, stC);
          const c0 = [prev.cx, prev.top, prev.cz], c1 = [cur.cx, cur.top, cur.cz];
          if (side > 0) G.quad(c0, c1, b1, b0, [0, 1, 0], [0, 0, 1, 0, 1, 0.1, 0, 0.1], capCol, capC); else G.quad(c1, c0, b0, b1, [0, 1, 0], [0, 0, 1, 0, 1, 0.1, 0, 0.1], capCol, capC);
          u = u1; walls++;
        }
        prev = cur;
      }
    }
    E.stats.dropWalls = walls;
  }

  // ---- terraces: stone retaining walls along the hillside streets on their uphill side
  function streetWalls(E, G) {
    const sc = E.sc; const stC = cell('stone'), capC = cell('conc'); const col = C(0xe6dccb), capCol = C(0xd8d2c6); let n = 0;
    const lines = (E.cityStreets || []).map(r => [r.pts, r.w]).concat((E.roads || []).filter(r => r.kind === 'public').map(r => [r.line, r.w]));
    for (const [pts, w] of lines) {
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k], b = pts[k + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) continue; const dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L; const nx = -dz, nz = dx;
        const steps = Math.max(1, Math.round(L / 7));
        for (let j = 0; j < steps; j++) {
          const u0 = j / steps, u1 = (j + 1) / steps; const p0 = [a[0] + (b[0] - a[0]) * u0, a[1] + (b[1] - a[1]) * u0], p1 = [a[0] + (b[0] - a[0]) * u1, a[1] + (b[1] - a[1]) * u1];
          const pm = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]; if (E.dcAt(pm[0], pm[1]) < 30) continue;
          const hc = sc.gridHeight(pm[0], pm[1]); const off = w / 2 + 0.6;
          for (const sd of [1, -1]) {
            const hs = sc.gridHeight(pm[0] + nx * sd * (off + 5), pm[1] + nz * sd * (off + 5)); const rise = (hs - hc) / (off + 5); if (rise < 0.16) continue;
            const hgt = Math.min(5.5, rise * 11); if (hgt < 1.3) continue;
            const q0 = [p0[0] + nx * sd * off, p0[1] + nz * sd * off], q1 = [p1[0] + nx * sd * off, p1[1] + nz * sd * off];
            const y0 = sc.gridHeight(q0[0], q0[1]) - 0.4, y1 = sc.gridHeight(q1[0], q1[1]) - 0.4; const t0 = Math.min(y0 + 0.4 + hgt, Math.max(y0 + 1, hs + 0.3)), t1 = Math.min(y1 + 0.4 + hgt, Math.max(y1 + 1, hs + 0.3));
            G.at(pm[0], pm[1], 'P', 0); const nn = [-nx * sd, 0, -nz * sd]; const u = (k * 7 + j) * 2.6;
            G.quad([q0[0], y0, q0[1]], [q1[0], y1, q1[1]], [q1[0], t1, q1[1]], [q0[0], t0, q0[1]], nn, [u, 0, u + L / steps / 2.6, 0, u + L / steps / 2.6, (t1 - y1) / 2.6, u, (t0 - y0) / 2.6], col, stC);
            const r0 = [q0[0] + nx * sd * 0.45, q0[1] + nz * sd * 0.45], r1 = [q1[0] + nx * sd * 0.45, q1[1] + nz * sd * 0.45];
            G.quad([q0[0], t0, q0[1]], [q1[0], t1, q1[1]], [r1[0], t1, r1[1]], [r0[0], t0, r0[1]], [0, 1, 0], [0, 0, 1, 0, 1, 0.1, 0, 0.1], capCol, capC); n++;
          }
        }
      }
    }
    E.stats.streetWalls = n;
  }

  // terrain slope from the elevation model alone (cheap: no plateau or relief noise)
  const demSlope = (E, x, z) => Math.hypot(E.demAt(x + 12, z) - E.demAt(x - 12, z), E.demAt(x, z + 12) - E.demAt(x, z - 12)) / 24;
  // ================================================================ hillside umbrella pines and cypresses: merged into the proxy tiles (tree list 2)
  function hillTrees(E, G) {
    const sc = E.sc, t = E.t; const rng = U.rng(4401);
    // exclusion mask: footprints (grown 2.5 m), streets, the circuit's parks (their own trees) - 4 m per pixel over +-2.8 km
    const MH = 2800, MN = 1400; const [mc, mctx] = Env.canvas(MN, MN); mctx.fillStyle = '#000'; mctx.fillRect(0, 0, MN, MN); mctx.setTransform(MN / (2 * MH), 0, 0, MN / (2 * MH), MN / 2, MN / 2);
    mctx.fillStyle = '#fff'; mctx.strokeStyle = '#fff'; mctx.lineWidth = 5; mctx.lineJoin = 'round';
    const poly = (p) => { mctx.beginPath(); p.forEach((q, i) => i ? mctx.lineTo(q[0], q[1]) : mctx.moveTo(q[0], q[1])); mctx.closePath(); mctx.fill(); mctx.stroke(); };
    for (const b of t.data.scenery.buildings) poly(b.p); for (const b of E.cityFar || []) poly(b.p); for (const w of E.allWoods || []) poly(w);
    for (const r of E.cityStreets || []) { mctx.lineWidth = r.w + 3; mctx.beginPath(); r.pts.forEach((q, i) => i ? mctx.lineTo(q[0], q[1]) : mctx.moveTo(q[0], q[1])); mctx.stroke(); }
    for (const r of E.roads || []) { mctx.lineWidth = r.w + 3; mctx.beginPath(); r.line.forEach((q, i) => i ? mctx.lineTo(q[0], q[1]) : mctx.moveTo(q[0], q[1])); mctx.stroke(); }
    const md = mctx.getImageData(0, 0, MN, MN).data; const blocked = (x, z) => { const i = Math.floor((x + MH) / (2 * MH) * MN), j = Math.floor((z + MH) / (2 * MH) * MN); if (i < 0 || j < 0 || i >= MN || j >= MN) return false; return md[(j * MN + i) * 4] > 60; };
    // woods (1) / scrub (2) / parks (4) rasterised on the same 4 m grid (red channel = the land code x 40)
    mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.fillStyle = '#000'; mctx.fillRect(0, 0, MN, MN); mctx.setTransform(MN / (2 * MH), 0, 0, MN / (2 * MH), MN / 2, MN / 2);
    for (const L of E.data.land || []) { if (L[0] !== 1 && L[0] !== 2 && L[0] !== 4) continue; mctx.fillStyle = 'rgb(' + L[0] * 40 + ',0,0)'; mctx.beginPath(); for (let i = 1; i + 1 < L.length; i += 2) i > 1 ? mctx.lineTo(L[i], L[i + 1]) : mctx.moveTo(L[i], L[i + 1]); mctx.closePath(); mctx.fill(); }
    const ld = mctx.getImageData(0, 0, MN, MN).data; const inLand = (x, z) => { const i = Math.floor((x + MH) / (2 * MH) * MN), j = Math.floor((z + MH) / (2 * MH) * MN); if (i < 0 || j < 0 || i >= MN || j >= MN) return 0; return Math.round(ld[(j * MN + i) * 4] / 40); };
    const S = 15; const HX = 3400; let np = 0, nc = 0; const bark = C(0x5e5040), barkC = cell('soil'), pineC = cell('pine'); G.acc = WHITE;
    for (let z = -HX; z < HX; z += S) for (let x = -HX; x < HX; x += S) {
      const px = x + (rng() - 0.5) * S * 0.9, pz = z + (rng() - 0.5) * S * 0.9; const rr = rng(); if (rr > 0.75 * 0.66) continue;   // above the densest rate
      const r = Math.hypot(px - 300, pz + 300); if (r > 3400) continue;
      const dc = E.dcAt(px, pz); if (dc < 40) continue; if (E.isSea(px, pz)) continue;
      const g = E.groundAbs(px, pz); if (g < 2 || g > 780) continue;
      const cov = E.coverAt(px, pz); const lc = inLand(px, pz); const sl = demSlope(E, px, pz);
      if (dc < 260 && !(sl > 0.22 && cov < 0.14) && lc !== 1) continue;
      let dens = lc === 1 ? 0.75 : lc === 4 ? 0.45 : lc === 2 ? 0.35 : 0.16 + 0.32 * U.smoothstep(0.55, 0.75, U.fbm(px / 160 + 5.1, pz / 160 + 1.3, 3));
      dens *= 0.66 * (1 - U.smoothstep(0.55, 0.95, sl)) * (1 - U.smoothstep(380, 700, g)); if (cov > 0.04) dens *= 0.55;
      if (rr > dens) continue; if (blocked(px, pz)) continue;
      const y = sc.height(px, pz) - 0.3; if (!(y > -50)) continue;
      const s = 0.75 + rng() * 0.6, tone = rng(); const cyp = cov > 0.03 && rng() < 0.3 || rng() < 0.08; const trunk = dc < 900;
      G.at(px, pz, 'P', 2);
      if (cyp) { const col = new THREE.Color(0.17, 0.25, 0.14).multiplyScalar(0.8 + tone * 0.4); G.lathe(px, pz, [[0.95 * s, y + 0.4], [0.75 * s, y + 6.2 * s], [0.06, y + 10.8 * s]], 5, col, pineC, 1.4, 0.6); nc++; }
      else {
        const col = new THREE.Color(0.36, 0.42, 0.24).multiplyScalar(0.8 + tone * 0.4); const hs = s * (0.85 + tone * 0.3);
        if (trunk) G.lathe(px, pz, [[0.3 * s, y], [0.18 * s, y + 6.8 * hs]], 3, bark, barkC, 2, 0.3);
        G.lathe(px, pz, [[0.5 * s, y + 6.3 * hs], [4.2 * s, y + 7.2 * hs], [0.2 * s, y + 8.9 * hs]], 5, col, pineC, 0.8, 0.8); np++;
      }
    }
    G.sub = 0; E.stats.cityTrees = np + nc;
  }
  // ================================================================ the Rocher's cliffs: a weathered limestone skin over the steep flanks of the plateau
  function rocherCliffs(E, G) {
    const P = (E.plateaus || [])[0]; if (!P) return; const sc = E.sc; const ring = cleanRing(P.p); const pts = [];
    for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.round(L / 4)); for (let k = 0; k < n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
    const N = pts.length; const D = [-8, -4, -1, 2, 5, 9, 14, 20, 27, 35, 45]; const cols = []; let arc = 0; const cl = cell('cliff'); G.acc = WHITE;
    for (let k = 0; k < N; k++) {
      const a = pts[(k + N - 1) % N], b = pts[(k + 1) % N], p = pts[k]; let nx = b[1] - a[1], nz = -(b[0] - a[0]); const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
      if (k) arc += Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]);
      const hs = D.map(d => sc.gridHeight(p[0] + nx * d, p[1] + nz * d)); const drop = hs[1] - hs[8];
      const ok = drop > 16 && E.coverAt(p[0] + nx * 10, p[1] + nz * 10) < 0.35 && E.dcAt(p[0], p[1]) > 20;
      // each vertex: pushed out by a jagged amount (ledges, buttresses); it only counts above the foot of the slope and well clear
      // of the circuit (the skin never reaches the road, the stands or the quays)
      const base = Math.min(...hs);
      cols.push(ok ? D.map((d, j) => { const jag = (U.fbm(arc / 9 + j * 0.37, hs[j] / 7, 3) - 0.35) * 3.2 + (j > 1 && j < 8 ? 1.0 : 0); const o = d + Math.max(0, jag); const y = sc.gridHeight(p[0] + nx * d, p[1] + nz * d) + 0.7 + Math.max(0, jag) * 0.3; const X = p[0] + nx * o, Z = p[1] + nz * o; return [X, y, Z, arc, y - base > 1.2 && clear(E, X, Z, 6)]; }) : null);
    }
    for (let k = 0; k < N; k++) {
      const A = cols[k], B = cols[(k + 1) % N]; if (!A || !B) continue; const px = A[4][0], pz = A[4][2]; G.at(px, pz, 'P', 0);
      const tone = 0.85 + U.noise2(A[0][3] / 40, 3.3) * 0.25; const col = new THREE.Color(0.62 * tone, 0.57 * tone, 0.49 * tone);
      for (let j = 0; j + 1 < D.length; j++) {
        const a0 = A[j], a1 = A[j + 1], b0 = B[j], b1 = B[j + 1]; if (!(a0[4] && a1[4] && b0[4] && b1[4])) continue; const ua = a0[3] / 13, ub = ua + Math.hypot(b0[0] - a0[0], b0[2] - a0[2]) / 13;
        G.quad([a0[0], a0[1], a0[2]], [b0[0], b0[1], b0[2]], [b1[0], b1[1], b1[2]], [a1[0], a1[1], a1[2]], null, [ua, a0[1] / 11, ub, b0[1] / 11, ub, b1[1] / 11, ua, a1[1] / 11], col, cl);
      }
    }
  }

  // ================================================================ the Riviera beyond the map data: the towns along the coast either side (Cap d'Ail,
  // Roquebrune, Menton...) as merged blocks of simple buildings on the low coastal slopes, seen only from afar (proxy tiles)
  function coastTowns(E, G) {
    const t = E.t; const rng = U.rng(7311); const S = 34; let n = 0; const W = cell('rvbW'), V = cell('rv_win'), PL = cell('flat'), TL = cell('tiles');
    let lx0 = Infinity, lx1 = -Infinity, lz0 = Infinity, lz1 = -Infinity; for (let i = 0; i < t.n; i += 10) { lx0 = Math.min(lx0, t.x[i]); lx1 = Math.max(lx1, t.x[i]); lz0 = Math.min(lz0, t.z[i]); lz1 = Math.max(lz1, t.z[i]); }
    const cx0 = (lx0 + lx1) / 2, cz0 = (lz0 + lz1) / 2;
    for (let z = -6500; z < 6500; z += S) for (let x = -7000; x < 7000; x += S) {
      const px = x + (rng() - 0.5) * S * 0.8, pz = z + (rng() - 0.5) * S * 0.8; const r = Math.hypot(px - cx0, pz - cz0); const a = rng(), b = rng(), c = rng(), d = rng();
      if (r < 2900 || r > 7200) continue; if (a > 1.6 * (1 - U.smoothstep(4500, 7200, r))) continue; if (E.isSea(px, pz)) continue;
      const g = E.demAt(px, pz) - (E.demZ0 || 0); if (g < 3 || g > 190) continue;
      const dens = (1 - U.smoothstep(40, 190, g)) * (1 - U.smoothstep(4500, 7200, r)) * U.smoothstep(0.35, 0.6, U.fbm(px / 600 + 3.7, pz / 600 + 1.1, 3)) * 1.6;
      if (a > dens) continue; if (demSlope(E, px, pz) > 0.42) continue; if (E.isSea(px + 12, pz) || E.isSea(px - 12, pz) || E.isSea(px, pz + 12) || E.isSea(px, pz - 12)) continue;
      // footprint along the contour, levels from the terrain
      const ex = E.demAt(px + 10, pz) - E.demAt(px - 10, pz), ez = E.demAt(px, pz + 10) - E.demAt(px, pz - 10); let ux = -ez, uz = ex; const ul = Math.hypot(ux, uz); if (ul < 1e-3) { ux = 1; uz = 0; } else { ux /= ul; uz /= ul; }
      const hl = 6 + b * 9, hw = 5 + c * 5; const ring = rectRing(px, pz, ux, uz, hl, hw); const ys = ring.map(q => E.sc.height(q[0], q[1])); const y0 = Math.min(...ys) - 3, yG = Math.min(...ys); const H = 7 + d * d * 22;
      G.at(px, pz, 'P', 0); G.acc = WHITE; const tint = C(pick(TINTS.riviera.concat(TINTS.villa), (a + b * 7) % 1));
      G.prism(ring, y0, yG + H, tint, d > 0.5 ? W : V, 3.4, 3.0, (y0 - yG) / 3.0, Math.floor(c * 40));
      if (H < 14 && b < 0.6) { const top = offsetRing(ring, Math.min(hw * 0.9, 4)); if (top) { G.sub = 0; for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; G.quad([ring[j][0], yG + H, ring[j][1]], [ring[i][0], yG + H, ring[i][1]], [top[i][0], yG + H + 2.4, top[i][1]], [top[j][0], yG + H + 2.4, top[j][1]], null, [0, 0, 4, 0, 4, 1, 0, 1], C(pick(ROOFT, c)), TL); } G.cap(top, yG + H + 2.4, C(pick(ROOFT, c)), TL, 2.2); } }
      else G.cap(ring, yG + H, C(pick(FLATT, b)), PL, 3);
      n++;
    }
    E.stats.coastTowns = n;
  }

  // ================================================================ build
  City.build = function (E) {
    const T0 = performance.now(); const sc = E.sc, t = E.t; const G = new Geo(E);
    const mats = { D: cityMaterial(false, false), P: cityMaterial(false, true), DL: cityMaterial(true, false), PL: cityMaterial(true, true) };
    const lm = E.data.landmarks || {};
    E.cityZones = { casino: lm.fountain ? centroid(lm.fountain) : [504, -485], devote: lm.devoteChapel ? centroid(lm.devoteChapel) : [0, -230] };
    const claimed = []; const tm = {}; let tq = performance.now(); const lap = (k) => { const n = performance.now(); tm[k] = Math.round(n - tq); tq = n; };
    tm.atlas = ATLAS.ms; City.landmarks(E, G, claimed); rascasse(E, G, claimed); portholeBlock(E, G, claimed); lap('landmarks');
    const isClaimed = (x, z) => { for (const p of claimed) if (pip(x, z, p)) return true; return false; };
    const stats = { near: 0, mid: 0, proxyOnly: 0, skipped: 0 }; const nearList = []; sc.cityNearList = nearList;   // (previews and checks)
    const doOne = (b, farSet) => {
      if (b.p.length < 3) return; const ring = cleanRing(b.p); if (ring.length < 3) return; const area = Math.abs(area2(ring)) / 2; if (area < 25) { stats.skipped++; return; }
      const c = centroid(ring); if (isClaimed(c[0], c[1])) return;
      const dc = E.dcAt(c[0], c[1]); let rad = 0; for (const q of ring) rad = Math.max(rad, Math.hypot(q[0] - c[0], q[1] - c[1]));
      if (dc < rad + 70) for (let i = 0; i < ring.length; i++) if (!segClear(E, ring[i], ring[(i + 1) % ring.length], 0.5)) { stats.skipped++; return; } const tier = farSet ? (dc < 470 ? 'mid' : null) : dc < 140 ? 'near' : 'mid';
      const ob = obb(ring); const D = design(E, b, c[0], c[1], area, ob ? ob.hw * 2 : 0);
      if (tier) buildOne(E, G, ring, D, tier, c); buildOne(E, G, ring, D, 'proxy', c); stats[tier || 'proxyOnly']++;
      if (tier === 'near') nearList.push({ c, style: D.style, rv: D.rv, H: D.H, y: D.lv.yG }); if (D.albert) stats.albert = (stats.albert || 0) + (tier === 'near' ? 1 : 0.001);
    };
    for (const b of t.data.scenery.buildings) doOne(b, false);
    // the near ring's footprints the circuit data left out: kept when they clear the barriers, stands, pit lane and tunnel
    const stands = (t.data.scenery.grandstands || []).map(g => g.p).concat(E.standPolys || []); const pit = t.data.pit || []; const TD = t.data.tunnel;
    for (const b of Env.decodeCity(E.data.cityFill)) {
      let ok = true; const pr = {};
      for (const q of b.p) {
        if (!clear(E, q[0], q[1], 1.0)) { ok = false; break; }
        for (const sp2 of stands) if (pip(q[0], q[1], sp2)) { ok = false; break; } if (!ok) break;
        for (let k = 0; k + 1 < pit.length; k++) if (Env.segDist(q[0], q[1], pit[k][0], pit[k][1], pit[k + 1][0], pit[k + 1][1]) < 13) { ok = false; break; } if (!ok) break;
        if (E.paddock && pip(q[0], q[1], E.paddock)) { ok = false; break; }
        if (TD) { t.project(q[0], q[1], null, pr); if (pr.s > TD.s0 - 15 && pr.s < TD.s1 + 15 && pr.dist < Math.max(t.wallL[pr.i], t.wallR[pr.i]) + 3) { ok = false; break; } }
      }
      if (ok) { const c = centroid(b.p); if (!E.isSea(c[0], c[1])) { doOne(b, false); stats.fill = (stats.fill || 0) + 1; } }
    }
    lap('near'); for (const b of E.cityFar || []) doOne(b, true); lap('far');
    pavements(E, G); lap('pavements');
    if (City.extras) City.extras(E, G); lap('extras');
    hillTrees(E, G); lap('trees'); coastTowns(E, G); lap('towns'); stats.towns = E.stats.coastTowns;
    stats.tris = G.tris;
    const meshes = G.meshes(sc.group, mats); lap('meshes'); stats.tm = tm;
    sc.cityChunks = meshes; sc.cityMats = mats; sc.cityTrees = null;
    stats.tiles = meshes.length; stats.detailTiles = meshes.filter(m => m.userData.kind === 'D').length;
    stats.detailTris = meshes.filter(m => m.userData.kind === 'D').reduce((a, m) => a + m.geometry.index.count / 3, 0); stats.proxyTris = stats.tris - stats.detailTris;
    stats.atlasMs = [ATLAS.ms, ATLAS.paint, ATLAS.proc, ATLAS.cached ? 'cached' : 'painted']; stats.ms = Math.round(performance.now() - T0);
    sc.cityStats = stats; E.stats.city = stats;
    if (EI.ENV_LOG || EI.CITY_LOG) console.log('CITY ' + JSON.stringify(stats));
  };
  // the atlas pixels (debugging / previews): albedo RGBA and the packed normal / roughness / glass map, rows bottom-up
  City.atlasData = function () { const A = buildAtlas(); return { albedo: A.map.image.data, packed: A.pk.image.data, w: AW, h: AH, cells: CELLS, ms: [A.ms, A.paint, A.proc], cached: !!A.cached }; };
  // start reading the cached atlas now when the page is set to open a street circuit
  try { const q = new URLSearchParams(location.search).get('track') || localStorage.getItem('ei-track'); if (q && EI.ENVDATA && EI.ENVDATA[q] && EI.ENVDATA[q].kind === 'street') City.preloadAtlas(); } catch (e) { }
  // quality tiers: the low tier draws the core of each tile (no roof furniture, awnings or hillside trees) with the plain shader
  City.material = cityMaterial;   // (A/B previews)
  City.setQuality = function (sc, q) {
    const M = sc.cityMats; if (!M) return; const lite = q === 'low';
    for (const m of sc.cityChunks || []) { const r = m.userData.ranges; m.geometry.setDrawRange(0, lite ? r[0] : r[2]); m.material = m.userData.kind === 'D' ? (lite ? M.DL : M.D) : (lite ? M.PL : M.P); }
  };
  // per frame: a distance test per tile (a few dozen): detail tiles near the eye (they cast shadows close by), proxies to the tier's range
  // (PERF-2) a proxy tile whose nearest point lies beyond the camera's far plane (the fog's end) is wholly clipped: not drawn at all
  City.update = function (sc, x, z, T) {
    let far = T.cityFar; const cams = EI.debug && EI.debug.cameras; if (cams && cams.length) { let f = 0; for (const cm of cams) f = Math.max(f, cm.far || 0); if (f > 0) far = Math.min(far, f); }
    for (const c of sc.cityChunks || []) { const d = Env.eyeDist(c.userData.box, x, z); if (c.userData.kind === 'D') { c.visible = d < T.cityDetail; c.castShadow = d < 170; } else c.visible = d < far; }
  };
})();
