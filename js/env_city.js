// Equation I - the city round a street circuit (Monaco). Every map footprint becomes a designed building: a facade style picked
// from its height, size, type and neighbourhood (Belle Epoque stone round the Casino, 1960s-2000s apartment towers with continuous
// balconies along the harbour and the boulevards, glass towers on the Larvotto side, old town houses with terracotta roofs on the
// Rocher, pastel villas on the hills), real balcony slabs, cornices and parapets near the track, roofs with penthouses, terraces,
// tanks and antennas. Hand-modelled landmarks (the Casino, the Hotel de Paris and the Cafe de Paris round the square garden, the
// hotel over the hairpin with its retaining wall and planted island, the swimming pool, the Rascasse, the Yacht Club, the Palace),
// pavements with granite kerbs along the barriers, retaining walls, hillside pines and cypresses.
// Everything shares one facade atlas (2048 px, 8 x 8 cells of one bay x one storey) and one material; geometry is merged into a
// few spatial chunks. Deterministic (hashed), built once at load.
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
      // inward normals (left of the edge for a positive ring): (-dz, dx)
      const n1x = -d1z, n1z = d1x, n2x = -d2z, n2z = d2x; let mx = n1x + n2x, mz = n1z + n2z; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
      const cosh = mx * n1x + mz * n1z; const k = d / Math.max(0.35, cosh); out.push([b[0] + mx * k, b[1] + mz * k]);
    }
    if (d > 0 && !loose) { const a0 = area2(p), a1 = area2(out); if (a1 <= 0 || a1 > a0) return null; for (let i = 0; i < n; i++) { const e0x = p[(i + 1) % n][0] - p[i][0], e0z = p[(i + 1) % n][1] - p[i][1], e1x = out[(i + 1) % n][0] - out[i][0], e1z = out[(i + 1) % n][1] - out[i][1]; if (e0x * e1x + e0z * e1z < 0) return null; } }
    return out;
  }
  // oriented bounding box: [cx, cz, ux, uz, halfLen, halfWid]
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
  // 8 x 8 cells of 256 px; each cell holds a 224 px tile (one bay x one storey, or a roof / material swatch) with a 16 px wrapped
  // gutter so fract() tiling and mipmaps stay seamless. Albedo RGB + A = how much the building's tint applies (1 render / stone,
  // 0 glass, frames, shutters, awnings, iron); a second map holds roughness (R) and glass (G).
  const AT = 2048, CS = 256, GUT = 16, IN = 224;
  const CELLS = {};       // name -> [col, row, variants]
  function Painter() {
    const mk = () => Env.canvas(IN, IN); [this.ca, this.a] = mk(); [this.cm, this.m] = mk(); [this.cg, this.g] = mk();
  }
  const css = (c) => typeof c === 'string' ? c : 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
  Painter.prototype = {
    clear(col, tint, rough, glass) { this.rect(0, 0, IN, IN, col, tint, rough, glass); },
    // fill a shape on the three layers: albedo colour, tint weight 0..1, roughness, glass
    fill(path, col, tint, rough, glass) {
      const t = Math.round((tint == null ? 1 : tint) * 255), r = Math.round((rough == null ? 0.85 : rough) * 255), g = Math.round((glass || 0) * 255);
      for (const [ctx, st] of [[this.a, css(col)], [this.m, 'rgb(' + t + ',' + t + ',' + t + ')'], [this.g, 'rgb(' + r + ',' + g + ',0)']]) { ctx.fillStyle = st; ctx.beginPath(); path(ctx); ctx.fill(); }
    },
    rect(x, y, w, h, col, tint, rough, glass) { this.fill(c => c.rect(x, y, w, h), col, tint, rough, glass); },
    // albedo-only overlays (shading, grain, joints): never change the masks
    shade(fn) { this.a.save(); fn(this.a); this.a.restore(); },
    vgrad(x, y, w, h, stops) { this.shade(c => { const gr = c.createLinearGradient(0, y, 0, y + h); for (const [o, s] of stops) gr.addColorStop(o, s); c.fillStyle = gr; c.fillRect(x, y, w, h); }); },
    grain(n, a, seed) { const r = U.rng(seed || 7); this.shade(c => { for (let i = 0; i < n; i++) { const v = r() < 0.5 ? 0 : 255; c.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (a * r()).toFixed(3) + ')'; c.fillRect(r() * IN, r() * IN, 1 + r() * 2, 1 + r() * 2); } }); },
  };
  // ---- reusable facade elements (coordinates in the 224 px tile)
  function glass(p, x, y, w, h, tone) {
    tone = tone || 0; const top = [120 + tone * 30, 136 + tone * 25, 152 + tone * 10], bot = [42 + tone * 20, 50 + tone * 18, 60 + tone * 10];
    p.rect(x, y, w, h, bot, 0, 0.08, 1);
    p.vgrad(x, y, w, h, [[0, css(top)], [0.45, css([(top[0] + bot[0]) / 2, (top[1] + bot[1]) / 2, (top[2] + bot[2]) / 2])], [1, css(bot)]]);
  }
  function curtains(p, x, y, w, h, seed) { const r = U.rng(seed); p.shade(c => { for (let i = 0; i < 2; i++) { if (r() < 0.45) continue; const cw = w * (0.2 + r() * 0.3); c.fillStyle = 'rgba(' + (200 + r() * 40 | 0) + ',' + (190 + r() * 40 | 0) + ',' + (170 + r() * 40 | 0) + ',0.55)'; c.fillRect(i ? x + w - cw : x, y + 2, cw, h - 4); } }); }
  function frame(p, x, y, w, h, t, col, mull) {
    col = col || [236, 236, 232]; p.rect(x, y, w, t, col, 0, 0.45); p.rect(x, y + h - t, w, t, col, 0, 0.45); p.rect(x, y, t, h, col, 0, 0.45); p.rect(x + w - t, y, t, h, col, 0, 0.45);
    if (mull) for (let k = 1; k < mull; k++) p.rect(x + w * k / mull - t / 2, y, t, h, col, 0, 0.45);
  }
  function window1(p, x, y, w, h, o) {
    o = o || {}; p.rect(x - 3, y - 3, w + 6, h + 6, [120, 116, 110], 1, 0.9);          // reveal (shadowed render)
    p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x - 3, y - 3, w + 6, 6); c.fillRect(x - 3, y - 3, 5, h + 6); });
    glass(p, x, y, w, h, o.tone); curtains(p, x, y, w, h, o.seed || (x * 7 + y));
    frame(p, x, y, w, h, o.ft || 4, o.fc, o.mull || 2); if (o.transom) p.rect(x, y + h * 0.22, w, 3, o.fc || [236, 236, 232], 0, 0.45);
  }
  function louvres(p, x, y, w, h, col, closed) {
    // louvred shutter leaf: slats with shadow lines
    p.rect(x, y, w, h, col, 0, 0.75); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.28)'; for (let k = y + 4; k < y + h - 2; k += 5) c.fillRect(x + 2, k, w - 4, 1.6); c.fillStyle = 'rgba(255,255,255,0.12)'; for (let k = y + 6; k < y + h - 2; k += 5) c.fillRect(x + 2, k, w - 4, 1); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x, y, 1.5, h); c.fillRect(x + w - 1.5, y, 1.5, h); });
    if (closed) p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x + w / 2 - 0.8, y, 1.6, h); });
  }
  function ironRail(p, x, y, w, h, ornate) {
    const col = [34, 36, 38]; p.rect(x, y, w, 3, col, 0, 0.5); p.rect(x, y + h - 3, w, 3, col, 0, 0.5);
    for (let k = x + 3; k < x + w - 2; k += ornate ? 7 : 6) p.rect(k, y, 1.6, h, col, 0, 0.5);
    if (ornate) for (let k = x + 8; k < x + w - 8; k += 14) p.fill(c => { c.ellipse(k, y + h * 0.5, 4.5, h * 0.3, 0, 0, 6.283); }, col, 0, 0.5);
  }
  function awning(p, x, y, w, h, a, b, stripes) {
    // striped canvas awning seen from the front (it projects out of the wall), scalloped valance, shadow beneath
    const n = stripes || 8; for (let k = 0; k < n; k++) p.fill(c => { c.moveTo(x + w * k / n, y); c.lineTo(x + w * (k + 1) / n, y); c.lineTo(x + w * (k + 1) / n + 2, y + h); c.lineTo(x + w * k / n - 2, y + h); c.closePath(); }, k % 2 ? b : a, 0, 0.9);
    p.vgrad(x - 2, y, w + 4, h, [[0, 'rgba(255,255,255,0.18)'], [1, 'rgba(0,0,0,0.12)']]);
    for (let k = 0; k < n * 2; k++) p.fill(c => { c.ellipse(x + w * (k + 0.5) / (n * 2), y + h, w / (n * 4), 3.5, 0, 0, Math.PI); }, k % 4 < 2 ? a : b, 0, 0.9);
    p.shade(c => { const g = c.createLinearGradient(0, y + h, 0, y + h + 30); g.addColorStop(0, 'rgba(0,0,0,0.38)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x, y + h + 3, w, 30); });
  }
  const ao = (p, y, h, a) => p.shade(c => { const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(0,0,0,' + a + ')'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, y, IN, h); });
  const stoneJoints = (p, rows, a) => p.shade(c => { c.fillStyle = 'rgba(60,50,40,' + (a || 0.18) + ')'; for (let k = 1; k < rows; k++) c.fillRect(0, IN * k / rows - 1, IN, 2); });

  // ---- the cells. Each entry: name, variants drawn left to right (the shader picks one per bay, mostly the first)
  const SHUT = [[96, 120, 96], [82, 104, 112], [140, 120, 96], [214, 210, 200], [120, 132, 128]];
  const DEF = [];
  const def = (name, row, col, fns) => { CELLS[name] = [col, row, fns.length]; fns.forEach((fn, k) => DEF.push([col + k, row, fn])); };
  // ---------------- row 0: Riviera apartment floors (bay 3.4 m x storey 3 m)
  const rvBack = (aw, blind) => (p) => {
    p.clear([238, 236, 232], 1, 0.85); p.grain(1400, 0.05, 11);
    // sliding doors behind the balcony, the slab's shadow at the top
    glass(p, 26, 34, 172, 168, 0.3); curtains(p, 26, 34, 172, 168, 5 + (aw ? 3 : 0) + (blind ? 7 : 0)); frame(p, 26, 34, 172, 168, 5, [200, 202, 204], 3);
    if (blind) { p.rect(26, 34, 172, 92, [226, 222, 210], 0, 0.8); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.12)'; for (let k = 38; k < 124; k += 4) c.fillRect(26, k, 172, 1); }); }
    if (aw) awning(p, 14, 26, 196, 40, aw[0], aw[1], 10);
    ao(p, 0, 70, 0.45); p.rect(0, 0, IN, 10, [214, 212, 208], 1, 0.85);
    p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 202, IN, 22); });
  };
  def('rv_back', 0, 0, [rvBack(null, false), rvBack([[40, 84, 150], [236, 236, 236]], false), rvBack(null, true), rvBack([[214, 110, 50], [240, 226, 196]], false)]);
  // balcony floor with the parapet painted on (mid / far buildings and the side walls of the towers)
  const rvBal = (aw, glassRail) => (p) => {
    rvBack(aw, false)(p);
    if (glassRail) { glass(p, 0, 138, IN, 64, 0.6); p.rect(0, 134, IN, 6, [230, 230, 228], 0, 0.4); for (let k = 0; k < IN; k += 56) p.rect(k, 138, 3, 64, [200, 200, 200], 0, 0.4); }
    else { p.rect(0, 136, IN, 66, [244, 242, 238], 1, 0.85); p.vgrad(0, 136, IN, 66, [[0, 'rgba(255,255,255,0.15)'], [1, 'rgba(0,0,0,0.06)']]); p.rect(0, 134, IN, 4, [252, 250, 248], 1, 0.7); }
    p.rect(0, 202, IN, 22, [150, 146, 140], 1, 0.9); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 214, IN, 10); });
  };
  def('rv_bal', 0, 4, [rvBal(null, false), rvBal([[40, 84, 150], [236, 236, 236]], false), rvBal(null, true), rvBal([[200, 92, 44], [238, 222, 190]], false)]);
  // ---------------- row 1: Riviera punched windows / ground / top, railings, slab
  const rvWin = (sh) => (p) => { p.clear([238, 236, 232], 1, 0.85); p.grain(1400, 0.05, 13); window1(p, 64, 46, 96, 132, { seed: 3 + sh }); if (sh === 1) { p.rect(64, 46, 96, 70, [230, 226, 214], 0, 0.8); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.12)'; for (let k = 48; k < 116; k += 4) c.fillRect(64, k, 96, 1); }); } p.rect(56, 178, 112, 7, [248, 246, 242], 1, 0.7); };
  def('rv_win', 1, 0, [rvWin(0), rvWin(1)]);
  def('rv_gnd', 1, 2, [(p) => {
    p.clear([214, 210, 204], 1, 0.85); p.grain(1200, 0.06, 17);
    glass(p, 14, 70, 196, 154, 0.8); frame(p, 14, 70, 196, 154, 5, [60, 62, 66], 2);
    p.rect(0, 30, IN, 34, [70, 72, 78], 0, 0.6); p.rect(30, 40, 90, 14, [226, 222, 208], 0, 0.5);       // signage band
    p.rect(0, 0, IN, 10, [236, 234, 230], 1, 0.8); ao(p, 10, 40, 0.3);
  }, (p) => {
    p.clear([214, 210, 204], 1, 0.85); p.grain(1200, 0.06, 19);
    glass(p, 50, 60, 124, 164, 0.2); frame(p, 50, 60, 124, 164, 6, [150, 120, 70], 2); p.rect(40, 50, 144, 10, [180, 176, 168], 1, 0.7);   // lobby door
    awning(p, 40, 20, 144, 26, [30, 60, 110], [30, 60, 110], 1); ao(p, 0, 20, 0.3);
  }]);
  def('rv_top', 1, 4, [(p) => {
    p.clear([238, 236, 232], 1, 0.85); p.grain(1200, 0.05, 21);
    glass(p, 30, 70, 164, 120, 0.4); frame(p, 30, 70, 164, 120, 5, [200, 202, 204], 2); ao(p, 60, 30, 0.35);
    p.rect(0, 0, IN, 54, [246, 244, 240], 1, 0.85); p.rect(0, 50, IN, 6, [180, 176, 170], 1, 0.8);       // parapet / roof edge band
    p.rect(0, 190, IN, 34, [244, 242, 238], 1, 0.85);
  }]);
  // balcony parapet faces (geometry): solid render, glass with a rail, steel bars over the shadowed balcony
  def('rail', 1, 5, [(p) => { p.clear([246, 244, 240], 1, 0.85); p.grain(600, 0.04, 23); p.rect(0, 0, IN, 12, [252, 252, 250], 1, 0.6); p.vgrad(0, 12, IN, 212, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.12)']]); },
    (p) => { glass(p, 0, 16, IN, IN - 16, 0.7); p.rect(0, 0, IN, 16, [228, 228, 226], 0, 0.35); for (let k = 0; k < IN; k += 74) p.rect(k, 16, 4, IN, [190, 190, 190], 0, 0.35); },
    (p) => { p.clear([70, 66, 62], 1, 0.9); p.vgrad(0, 0, IN, IN, [[0, 'rgba(0,0,0,0.1)'], [1, 'rgba(0,0,0,0.4)']]); p.rect(0, 0, IN, 12, [236, 236, 234], 0, 0.4); for (let k = 4; k < IN; k += 14) p.rect(k, 12, 4, IN - 12, [226, 226, 224], 0, 0.4); p.rect(0, IN - 10, IN, 10, [226, 226, 224], 0, 0.4); }]);
  // ---------------- row 2: Belle Epoque stone (bay 3.6 m x storey 3.9 m)
  const beFloor = (kind) => (p) => {
    p.clear([238, 230, 214], 1, 0.9); p.grain(2400, 0.06, 31 + kind); stoneJoints(p, 6, 0.08);
    // pilasters at the bay edges
    p.rect(0, 0, 14, IN, [246, 240, 228], 1, 0.85); p.rect(IN - 14, 0, 14, IN, [246, 240, 228], 1, 0.85); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(14, 0, 3, IN); c.fillRect(IN - 17, 0, 3, IN); });
    const x = 70, y = 40, w = 84, h = 150;
    // moulded surround + pediment / segmental arch
    p.rect(x - 12, y - 10, w + 24, h + 18, [248, 244, 234], 1, 0.8);
    if (kind === 1) p.fill(c => { c.moveTo(x - 18, y - 10); c.lineTo(x + w / 2, y - 34); c.lineTo(x + w + 18, y - 10); c.closePath(); }, [248, 244, 234], 1, 0.8);
    else p.fill(c => { c.ellipse(x + w / 2, y - 8, w / 2 + 14, 16, 0, Math.PI, 0); }, [248, 244, 234], 1, 0.8);
    p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x - 12, y + h + 6, w + 24, 4); });
    window1(p, x, y, w, h, { seed: 41 + kind, mull: 2, transom: true, fc: [240, 238, 230], tone: 0.1 });
    if (kind === 2) { louvres(p, x, y, w / 2, h, SHUT[3], true); louvres(p, x + w / 2, y, w / 2, h, SHUT[3], true); }
    else { louvres(p, x - 34, y, 22, h, [212, 206, 190], false); louvres(p, x + w + 12, y, 22, h, [212, 206, 190], false); }
    ironRail(p, x - 4, y + h - 46, w + 8, 44, true);
  };
  def('be_flr', 2, 0, [beFloor(0), beFloor(1), beFloor(2)]);
  def('be_piano', 2, 3, [(p) => {
    beFloor(1)(p);
    // stone balustrade of the continuous balcony (the slab is geometry)
    p.rect(0, 168, IN, 56, [246, 240, 228], 1, 0.85); p.rect(0, 166, IN, 8, [252, 248, 240], 1, 0.8);
    for (let k = 6; k < IN; k += 16) p.fill(c => { c.ellipse(k + 5, 196, 5, 20, 0, 0, 6.283); }, [70, 64, 58], 1, 0.9);
    for (let k = 6; k < IN; k += 16) p.fill(c => { c.ellipse(k + 5, 196, 3.2, 18, 0, 0, 6.283); }, [240, 234, 220], 1, 0.85);
  }]);
  def('be_gnd', 2, 4, [(p) => {
    p.clear([226, 216, 196], 1, 0.9); p.grain(2400, 0.07, 51); stoneJoints(p, 5, 0.3);
    // arched shopfront in rusticated stone
    p.fill(c => { c.moveTo(34, IN); c.lineTo(34, 92); c.ellipse(112, 92, 78, 62, 0, Math.PI, 0); c.lineTo(190, IN); c.closePath(); }, [60, 56, 52], 1, 0.9);
    glass(p, 44, 96, 136, 128, 0.9); p.fill(c => { c.ellipse(112, 96, 68, 54, 0, Math.PI, 0); }, [70, 74, 80], 0, 0.1, 1);
    p.vgrad(44, 40, 136, 60, [[0, 'rgba(255,240,200,0.25)'], [1, 'rgba(255,240,200,0)']]); frame(p, 44, 96, 136, 128, 5, [40, 44, 40], 3);
    p.rect(100, 26, 24, 24, [250, 246, 236], 1, 0.8);   // keystone
  }, (p) => {
    p.clear([226, 216, 196], 1, 0.9); p.grain(2400, 0.07, 53); stoneJoints(p, 5, 0.3);
    glass(p, 30, 80, 164, 144, 0.9); frame(p, 30, 80, 164, 144, 6, [44, 50, 44], 3);
    awning(p, 22, 44, 180, 34, [130, 30, 34], [130, 30, 34], 1); p.rect(0, 0, IN, 16, [244, 236, 222], 1, 0.8);
  }]);
  def('be_top', 2, 6, [(p) => {
    p.clear([238, 230, 214], 1, 0.9); p.grain(2000, 0.06, 57);
    window1(p, 78, 84, 68, 96, { seed: 59, mull: 2, fc: [240, 238, 230] }); ironRail(p, 74, 150, 76, 30, false);
    // dentil cornice band at the top
    p.rect(0, 0, IN, 44, [250, 246, 236], 1, 0.75); for (let k = 2; k < IN; k += 12) p.rect(k, 30, 7, 12, [208, 200, 186], 1, 0.8); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(0, 44, IN, 6); });
  }]);
  def('be_mans', 2, 7, [(p) => {
    // mansard slope: slate / zinc with a dormer
    p.clear([196, 198, 202], 1, 0.55); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.12)'; for (let k = 0; k < IN; k += 9) c.fillRect(0, k, IN, 1.5); for (let k = 0; k < IN; k += 18) c.fillRect(k, 0, 1, IN); });
    p.rect(66, 60, 92, 130, [244, 240, 230], 1, 0.8); p.fill(c => { c.ellipse(112, 62, 46, 30, 0, Math.PI, 0); }, [244, 240, 230], 1, 0.8);
    window1(p, 82, 74, 60, 104, { seed: 61, fc: [240, 238, 230] });
  }]);
  // ---------------- row 3: villas (1900-1930s Riviera residential, bay 3.2 x storey 3.2) and old town houses
  const villa = (shc, bal) => (p) => {
    p.clear([238, 234, 226], 1, 0.88); p.grain(1800, 0.06, 71 + shc);
    p.rect(68, 36, 88, 150, [248, 246, 240], 1, 0.8); window1(p, 76, 44, 72, 134, { seed: 73 + shc, mull: 2, fc: [244, 242, 236] });
    louvres(p, 38, 44, 34, 134, SHUT[shc], false); louvres(p, 152, 44, 34, 134, SHUT[shc], false);
    if (bal) { ironRail(p, 66, 140, 92, 40, true); p.rect(60, 180, 104, 8, [246, 244, 240], 1, 0.7); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(60, 188, 104, 8); }); }
    else p.rect(70, 184, 84, 6, [250, 248, 244], 1, 0.7);
    if (shc === 4) { louvres(p, 76, 44, 36, 134, SHUT[0], true); louvres(p, 112, 44, 36, 134, SHUT[0], true); }
  };
  def('vl_flr', 3, 0, [villa(0, false), villa(1, true), villa(2, false), villa(4, false)]);
  def('vl_gnd', 3, 4, [(p) => {
    p.clear([222, 216, 206], 1, 0.9); p.grain(1800, 0.07, 81); stoneJoints(p, 5, 0.22);
    p.fill(c => { c.moveTo(70, IN); c.lineTo(70, 90); c.ellipse(112, 90, 42, 34, 0, Math.PI, 0); c.lineTo(154, IN); c.closePath(); }, [96, 70, 50], 0, 0.7);
    p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(110, 92, 4, 132); }); glass(p, 82, 64, 60, 30, 0.5);
  }, (p) => {
    p.clear([222, 216, 206], 1, 0.9); p.grain(1800, 0.07, 83); stoneJoints(p, 5, 0.22); glass(p, 24, 84, 176, 140, 0.8); frame(p, 24, 84, 176, 140, 5, [60, 70, 60], 2);
    awning(p, 16, 52, 192, 32, [36, 100, 70], [230, 226, 210], 9);
  }]);
  def('vl_top', 3, 6, [(p) => {
    p.clear([238, 234, 226], 1, 0.88); p.grain(1600, 0.06, 85); window1(p, 84, 92, 56, 84, { seed: 87, fc: [244, 242, 236] }); louvres(p, 58, 92, 24, 84, SHUT[0], false); louvres(p, 142, 92, 24, 84, SHUT[0], false);
    p.rect(0, 0, IN, 40, [250, 248, 242], 1, 0.8); for (let k = 8; k < IN; k += 28) p.rect(k, 30, 10, 20, [236, 232, 222], 1, 0.8); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 40, IN, 12); });
  }]);
  def('ot_flr', 3, 7, [(p) => {
    p.clear([236, 226, 206], 1, 0.92); p.grain(3000, 0.08, 91); p.shade(c => { const r = U.rng(93); for (let i = 0; i < 8; i++) { c.fillStyle = 'rgba(120,100,70,0.06)'; c.beginPath(); c.ellipse(r() * IN, r() * IN, 20 + r() * 40, 10 + r() * 30, 0, 0, 6.283); c.fill(); } });
    p.rect(84, 50, 56, 112, [244, 238, 226], 1, 0.85); window1(p, 90, 56, 44, 100, { seed: 95, fc: [236, 234, 228] }); louvres(p, 62, 56, 26, 100, SHUT[0], false); louvres(p, 136, 56, 26, 100, SHUT[0], false);
    p.rect(84, 158, 56, 6, [214, 206, 190], 1, 0.8);
  }]);
  // ---------------- row 4: modern glass towers (bay 3 m x storey 3.2 m), offices, old town ground, church
  def('mg_flr', 4, 0, [(p) => {
    glass(p, 0, 0, IN, IN, 0.9); p.vgrad(0, 0, IN, IN, [[0, 'rgba(160,190,210,0.25)'], [1, 'rgba(20,40,60,0.2)']]);
    for (let k = 0; k < IN; k += 56) p.rect(k, 0, 4, IN, [190, 196, 200], 0, 0.3, 0.3); p.rect(0, 0, IN, 30, [226, 230, 232], 1, 0.5); p.rect(0, 30, IN, 4, [120, 126, 130], 0, 0.4);
  }, (p) => {
    glass(p, 0, 34, IN, IN - 34, 0.9); p.rect(0, 0, IN, 34, [244, 246, 246], 1, 0.6); glass(p, 0, 150, IN, 74, 0.3); p.rect(0, 146, IN, 5, [230, 232, 232], 0, 0.3); for (let k = 0; k < IN; k += 74) p.rect(k, 34, 3, IN, [200, 204, 206], 0, 0.3);
  }]);
  def('mg_gnd', 4, 2, [(p) => { glass(p, 0, 40, IN, IN - 40, 0.6); for (let k = 0; k < IN; k += 74) p.rect(k, 40, 5, IN, [70, 74, 80], 0, 0.3); p.rect(0, 0, IN, 40, [232, 234, 236], 1, 0.5); }]);
  def('of_flr', 4, 3, [(p) => { p.clear([234, 232, 228], 1, 0.8); glass(p, 0, 60, IN, 110, 0.6); for (let k = 0; k < IN; k += 56) p.rect(k, 60, 4, 110, [200, 204, 206], 0, 0.3); ao(p, 0, 40, 0.1); }]);
  def('ot_gnd', 4, 4, [(p) => {
    p.clear([226, 214, 192], 1, 0.92); p.grain(3000, 0.09, 101); stoneJoints(p, 6, 0.15);
    p.fill(c => { c.moveTo(76, IN); c.lineTo(76, 108); c.ellipse(112, 108, 36, 30, 0, Math.PI, 0); c.lineTo(148, IN); c.closePath(); }, [100, 66, 44], 0, 0.75); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(111, 108, 3, 116); });
  }, (p) => {
    p.clear([226, 214, 192], 1, 0.92); p.grain(3000, 0.09, 103); glass(p, 40, 96, 144, 128, 0.7); frame(p, 40, 96, 144, 128, 5, [70, 90, 70], 2); awning(p, 32, 64, 160, 30, [150, 40, 36], [236, 226, 206], 8);
  }]);
  def('church', 4, 6, [(p) => {
    p.clear([234, 226, 210], 1, 0.9); p.grain(2600, 0.07, 107); stoneJoints(p, 9, 0.2);
    p.fill(c => { c.moveTo(88, 200); c.lineTo(88, 80); c.ellipse(112, 80, 24, 26, 0, Math.PI, 0); c.lineTo(136, 200); c.closePath(); }, [70, 80, 110], 0, 0.2, 0.7);
    p.shade(c => { c.strokeStyle = 'rgba(200,170,90,0.5)'; c.lineWidth = 2; c.beginPath(); c.moveTo(112, 56); c.lineTo(112, 200); c.moveTo(88, 120); c.lineTo(136, 120); c.stroke(); });
  }]);
  def('plain', 4, 7, [(p) => { p.clear([236, 234, 230], 1, 0.9); p.grain(1600, 0.07, 109); p.vgrad(0, 0, IN, IN, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.06)']]); }]);
  // ---------------- row 5: roofs and materials (world-scaled swatches)
  def('tiles', 5, 0, [(p) => {
    // terracotta barrel tiles: rows of half cylinders, light top, dark gaps (tinted by the roof colour)
    p.clear([214, 206, 198], 1, 0.8); const r = U.rng(121);
    p.shade(c => { for (let y = 0; y < IN; y += 14) { for (let x = (y / 14) % 2 ? 0 : 9; x < IN + 18; x += 18) { const g = c.createLinearGradient(x - 9, 0, x + 9, 0); const v = 0.85 + r() * 0.3; g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(0.45, 'rgba(255,255,255,' + (0.18 * v).toFixed(2) + ')'); g.addColorStop(1, 'rgba(0,0,0,0.3)'); c.fillStyle = g; c.fillRect(x - 9, y, 18, 15); } c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(0, y + 13, IN, 2); } for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(' + (r() < 0.5 ? '40,30,20' : '255,240,220') + ',' + (0.05 + r() * 0.1).toFixed(2) + ')'; c.fillRect(r() * IN, r() * IN, 10 + r() * 30, 8 + r() * 20); } });
  }]);
  def('flat', 5, 1, [(p) => { p.clear([200, 198, 194], 1, 0.95); p.grain(4000, 0.1, 123); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.12)'; for (let k = 0; k < IN; k += 56) { c.fillRect(k, 0, 2, IN); c.fillRect(0, k, IN, 2); } }); }]);
  def('terrace', 5, 2, [(p) => { p.clear([214, 196, 176], 1, 0.85); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.15)'; for (let k = 0; k < IN; k += 28) { c.fillRect(k, 0, 1.5, IN); c.fillRect(0, k, IN, 1.5); } }); p.rect(10, 10, 40, 40, [70, 96, 50], 0, 0.95); p.rect(170, 160, 40, 40, [70, 96, 50], 0, 0.95); p.grain(900, 0.06, 125); }]);
  def('zinc', 5, 3, [(p) => { p.clear([168, 172, 176], 0, 0.5); p.shade(c => { for (let k = 0; k < IN; k += 16) { c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(k, 0, 2, IN); c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(k + 2, 0, 2, IN); } }); p.grain(1200, 0.05, 127); }]);
  def('copper', 5, 4, [(p) => { p.clear([112, 164, 140], 0, 0.6); p.shade(c => { const r = U.rng(129); for (let k = 0; k < IN; k += 14) { c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(k, 0, 2, IN); } for (let i = 0; i < 30; i++) { c.fillStyle = 'rgba(' + (r() < 0.5 ? '40,80,60' : '170,210,190') + ',0.15)'; c.fillRect(r() * IN, r() * IN, 20 + r() * 40, 10 + r() * 30); } }); }]);
  def('conc', 5, 5, [(p) => { p.clear([226, 224, 220], 1, 0.9); p.grain(2600, 0.08, 131); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.08)'; c.fillRect(0, 110, IN, 3); }); }]);
  def('stone', 5, 6, [(p) => {
    // rough-coursed limestone masonry (retaining walls, the hairpin wall, plinths)
    p.clear([196, 186, 168], 1, 0.95); const r = U.rng(133);
    p.shade(c => { for (let y = 0; y < IN; y += 22 + (r() * 6 | 0)) { let x = -r() * 30; const h = 20 + r() * 6; while (x < IN) { const w = 22 + r() * 34; const v = 0.75 + r() * 0.4; c.fillStyle = 'rgba(' + (196 * v | 0) + ',' + (184 * v | 0) + ',' + (164 * v | 0) + ',1)'; c.fillRect(x + 1.5, y + 1.5, w - 3, h - 3); c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(x + 1.5, y + 1.5, w - 3, 3); c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x + 1.5, y + h - 4, w - 3, 2.5); x += w; } } });
    p.grain(2400, 0.08, 135);
  }]);
  def('rock', 5, 7, [(p) => { p.clear([190, 184, 172], 1, 0.95); p.shade(c => { const r = U.rng(137); for (let i = 0; i < 140; i++) { c.fillStyle = 'rgba(' + (r() < 0.5 ? '60,55,50' : '255,250,240') + ',' + (0.06 + r() * 0.12).toFixed(2) + ')'; c.beginPath(); const x = r() * IN, y = r() * IN; c.moveTo(x, y); for (let k = 0; k < 5; k++) c.lineTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 40); c.fill(); } }); p.grain(3000, 0.1, 139); }]);
  // ---------------- row 6: pavements and ground swatches (2.4 m tiles)
  def('pave', 6, 0, [(p) => {
    // pinkish-grey block paving, stretcher bond (20 x 10 cm)
    p.clear([196, 178, 170], 1, 0.9); const r = U.rng(141); const bw = 18.7, bh = 9.33;
    p.shade(c => { for (let row = 0, y = 0; y < IN; row++, y += bh) for (let x = (row % 2) * bw / 2 - bw; x < IN; x += bw) { const v = 0.82 + r() * 0.3; const pink = r() < 0.35; c.fillStyle = 'rgba(' + ((pink ? 206 : 180) * v | 0) + ',' + ((pink ? 168 : 174) * v | 0) + ',' + ((pink ? 160 : 168) * v | 0) + ',1)'; c.fillRect(x + 0.7, y + 0.7, bw - 1.4, bh - 1.4); } });
    p.grain(1800, 0.06, 143);
  }]);
  def('kerb', 6, 1, [(p) => { p.clear([170, 168, 164], 1, 0.8); p.grain(3600, 0.14, 145); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < IN; k += 112) c.fillRect(k, 0, 2, IN); c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(0, 0, IN, 30); }); }]);
  def('lawn', 6, 2, [(p) => { p.clear([92, 128, 56], 0, 0.95); p.shade(c => { const r = U.rng(147); for (let i = 0; i < 3000; i++) { c.fillStyle = r() < 0.5 ? 'rgba(40,70,20,0.25)' : 'rgba(160,190,90,0.2)'; c.fillRect(r() * IN, r() * IN, 1, 3); } c.fillStyle = 'rgba(255,255,255,0.05)'; for (let k = 0; k < IN; k += 56) c.fillRect(k, 0, 28, IN); }); }]);
  def('flowers', 6, 3, [(p) => { p.clear([60, 84, 40], 0, 0.95); p.shade(c => { const r = U.rng(149); const cols = ['#d2263a', '#f2c230', '#e8e4dc', '#c03080', '#f07a20']; for (let i = 0; i < 900; i++) { c.fillStyle = cols[(r() * cols.length) | 0]; c.beginPath(); c.arc(r() * IN, r() * IN, 1.5 + r() * 2, 0, 6.283); c.fill(); } }); }]);
  def('water', 6, 4, [(p) => { p.clear([48, 150, 196], 0, 0.05, 0.6); p.shade(c => { const r = U.rng(151); for (let i = 0; i < 60; i++) { c.strokeStyle = 'rgba(255,255,255,' + (0.08 + r() * 0.12).toFixed(2) + ')'; c.lineWidth = 1.5; c.beginPath(); const x = r() * IN, y = r() * IN; c.moveTo(x, y); c.quadraticCurveTo(x + 15, y - 6, x + 30, y); c.stroke(); } c.fillStyle = 'rgba(20,60,110,0.35)'; c.fillRect(0, 108, IN, 8); }); }]);
  def('pooltile', 6, 5, [(p) => { p.clear([230, 236, 236], 0, 0.6); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.12)'; for (let k = 0; k < IN; k += 14) { c.fillRect(k, 0, 1, IN); c.fillRect(0, k, IN, 1); } }); }]);
  def('soil', 6, 6, [(p) => { p.clear([92, 74, 56], 0, 0.95); p.grain(3000, 0.15, 153); }]);
  def('frond', 6, 7, [(p) => {
    // a palm frond seen flat: the rib down the middle (v) and pinnate leaflets either side, tinted per tree
    p.clear([70, 96, 40], 1, 0.85); p.shade(c => { const r = U.rng(155); c.strokeStyle = 'rgba(20,40,10,0.55)'; c.lineWidth = 1.4; for (let y = 0; y < IN; y += 5) { c.beginPath(); c.moveTo(112, y); c.lineTo(10 + r() * 10, y + 22); c.moveTo(112, y); c.lineTo(214 - r() * 10, y + 22); c.stroke(); } c.fillStyle = 'rgba(200,190,120,0.7)'; c.fillRect(108, 0, 8, IN); c.fillStyle = 'rgba(255,255,200,0.12)'; c.fillRect(30, 0, 50, IN); });
  }]);
  // ---------------- row 7: landmark facades
  def('cas_flr', 7, 0, [(p) => {
    // the Casino's main front: twin columns, an arched window with a carved surround, sculpted panels
    p.clear([232, 220, 196], 1, 0.9); p.grain(2400, 0.06, 161);
    for (const x of [6, 26, 186, 206]) { p.rect(x, 0, 12, IN, [246, 238, 222], 1, 0.8); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(x + 10, 0, 2, IN); }); }
    p.fill(c => { c.moveTo(62, 196); c.lineTo(62, 82); c.ellipse(112, 82, 50, 44, 0, Math.PI, 0); c.lineTo(162, 196); c.closePath(); }, [250, 244, 230], 1, 0.8);
    p.fill(c => { c.moveTo(74, 190); c.lineTo(74, 86); c.ellipse(112, 86, 38, 34, 0, Math.PI, 0); c.lineTo(150, 190); c.closePath(); }, [60, 66, 70], 0, 0.1, 1);
    glass(p, 74, 86, 76, 104, 0.2); frame(p, 74, 86, 76, 104, 4, [230, 222, 200], 2); ironRail(p, 70, 160, 84, 30, true);
    p.rect(98, 24, 28, 22, [250, 244, 230], 1, 0.8); p.shade(c => { c.fillStyle = 'rgba(160,130,60,0.3)'; c.fillRect(102, 28, 20, 14); });
    p.rect(0, 206, IN, 18, [244, 236, 220], 1, 0.8); p.shade(c => { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 202, IN, 4); });
  }]);
  def('cas_top', 7, 1, [(p) => {
    // balustraded attic with an oculus between ornaments
    p.clear([236, 226, 204], 1, 0.9); p.grain(1600, 0.05, 163); p.rect(0, 170, IN, 54, [246, 238, 222], 1, 0.85);
    p.fill(c => { c.ellipse(112, 92, 30, 30, 0, 0, 6.283); }, [250, 244, 232], 1, 0.8); p.fill(c => { c.ellipse(112, 92, 20, 20, 0, 0, 6.283); }, [70, 80, 86], 0, 0.1, 1);
    for (let k = 6; k < IN; k += 16) p.fill(c => { c.ellipse(k + 5, 200, 4, 18, 0, 0, 6.283); }, [80, 74, 66], 1, 0.9);
    p.rect(0, 168, IN, 8, [252, 248, 238], 1, 0.8);
  }]);
  def('fair_flr', 7, 2, [(p) => {
    // the hotel over the hairpin: deep balconies with planters, dark glazing, white slab edges
    p.clear([232, 226, 214], 1, 0.85); glass(p, 14, 34, 196, 112, 0.7); curtains(p, 14, 34, 196, 112, 171); frame(p, 14, 34, 196, 112, 4, [214, 212, 206], 4); ao(p, 30, 40, 0.4);
    for (const x of [0, 112]) p.rect(x, 30, 8, 150, [240, 236, 228], 1, 0.8);
    p.rect(0, 0, IN, 30, [244, 240, 232], 1, 0.8); p.rect(0, 146, IN, 78, [238, 232, 220], 1, 0.85); p.rect(0, 142, IN, 6, [252, 250, 246], 1, 0.6);
    p.shade(c => { const r = U.rng(165); for (let i = 0; i < 8; i++) { c.fillStyle = 'rgba(' + (60 + r() * 40 | 0) + ',' + (100 + r() * 40 | 0) + ',' + (40 + r() * 20 | 0) + ',0.9)'; c.beginPath(); c.ellipse(14 + r() * 196, 166, 8 + r() * 10, 6 + r() * 6, 0, 0, 6.283); c.fill(); } });
  }]);
  def('ycm', 7, 3, [(p) => { p.clear([246, 246, 244], 1, 0.6); glass(p, 0, 60, IN, 120, 0.8); for (let k = 0; k < IN; k += 37) p.rect(k, 60, 3, 120, [220, 224, 226], 0, 0.3); p.rect(0, 176, IN, 6, [210, 214, 216], 0, 0.3); ao(p, 60, 30, 0.3); }]);
  def('palace', 7, 4, [(p) => {
    // the Prince's Palace: ochre render, framed windows with green shutters, white quoins
    p.clear([236, 216, 182], 1, 0.9); p.grain(1800, 0.06, 167); p.rect(80, 48, 64, 120, [246, 238, 222], 1, 0.8); window1(p, 88, 56, 48, 104, { seed: 169, fc: [236, 230, 216] });
    louvres(p, 62, 56, 22, 104, SHUT[0], false); louvres(p, 140, 56, 22, 104, SHUT[0], false); p.rect(0, 0, 10, IN, [246, 240, 226], 1, 0.85); p.rect(IN - 10, 0, 10, IN, [246, 240, 226], 1, 0.85);
  }]);
  def('glassroof', 7, 5, [(p) => { glass(p, 0, 0, IN, IN, 0.9); for (let k = 0; k < IN; k += 28) { p.rect(k, 0, 3, IN, [210, 214, 214], 0, 0.3); p.rect(0, k, IN, 3, [210, 214, 214], 0, 0.3); } }]);
  def('clock', 7, 6, [(p) => { p.clear([234, 222, 198], 1, 0.9); p.fill(c => { c.ellipse(112, 112, 70, 70, 0, 0, 6.283); }, [200, 170, 90], 0, 0.4); p.fill(c => { c.ellipse(112, 112, 60, 60, 0, 0, 6.283); }, [246, 242, 230], 0, 0.6); p.shade(c => { c.strokeStyle = '#2a2a2a'; c.lineWidth = 3; for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; c.beginPath(); c.moveTo(112 + Math.cos(a) * 50, 112 + Math.sin(a) * 50); c.lineTo(112 + Math.cos(a) * 58, 112 + Math.sin(a) * 58); c.stroke(); } c.lineWidth = 5; c.beginPath(); c.moveTo(112, 112); c.lineTo(112, 72); c.moveTo(112, 112); c.lineTo(142, 120); c.stroke(); }); }]);
  def('awnred', 7, 7, [(p) => { awning(p, 0, 0, IN, IN - 30, [168, 30, 36], [168, 30, 36], 1); }]);

  let ATLAS = null;
  function buildAtlas() {
    if (ATLAS) return ATLAS;
    const [ca, a] = Env.canvas(AT, AT), [cm, m] = Env.canvas(AT, AT), [cg, g] = Env.canvas(AT, AT);
    a.fillStyle = '#808080'; a.fillRect(0, 0, AT, AT); m.fillStyle = '#000'; m.fillRect(0, 0, AT, AT); g.fillStyle = 'rgb(230,0,0)'; g.fillRect(0, 0, AT, AT);
    for (const [col, row, fn] of DEF) {
      const p = new Painter(); fn(p); const x0 = col * CS, y0 = row * CS;
      for (const [dst, src] of [[a, p.ca], [m, p.cm], [g, p.cg]]) { dst.save(); dst.beginPath(); dst.rect(x0, y0, CS, CS); dst.clip(); for (const ox of [-IN, 0, IN]) for (const oy of [-IN, 0, IN]) dst.drawImage(src, x0 + GUT + ox, y0 + GUT + oy); dst.restore(); }
    }
    const A = a.getImageData(0, 0, AT, AT).data, M = m.getImageData(0, 0, AT, AT).data, G = g.getImageData(0, 0, AT, AT).data;
    // rows flipped to match the texture's v (uploaded without flipY)
    const out = new Uint8Array(AT * AT * 4), mat = new Uint8Array(AT * AT * 4);
    for (let y = 0; y < AT; y++) { const sy = (AT - 1 - y) * AT * 4, dy = y * AT * 4; for (let x = 0; x < AT * 4; x += 4) { out[dy + x] = A[sy + x]; out[dy + x + 1] = A[sy + x + 1]; out[dy + x + 2] = A[sy + x + 2]; out[dy + x + 3] = M[sy + x]; mat[dy + x] = G[sy + x]; mat[dy + x + 1] = G[sy + x + 1]; mat[dy + x + 2] = 0; mat[dy + x + 3] = 255; } }
    const mk = (d, srgb) => { const t = new THREE.DataTexture(d, AT, AT, THREE.RGBAFormat); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true; if (srgb) t.encoding = THREE.sRGBEncoding; return t; };
    ATLAS = { map: mk(out, true), mat: mk(mat, false) };
    return ATLAS;
  }
  // cell attribute: column, row (top row 0 in the canvas = v near 1 in the texture), variant count
  const cell = (name) => { const c = CELLS[name]; return c ? [c[0], 7 - c[1], c[2]] : [0, 0, 1]; };

  // ================================================================ the city material: atlas cells tiled per bay / storey, tinted per building
  function cityMaterial() {
    const A = buildAtlas();
    const mat = new THREE.MeshStandardMaterial({ map: A.map, vertexColors: true, roughness: 0.85, metalness: 0.0 });
    mat.extensions = { derivatives: true, shaderTextureLOD: true };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.cityMat = { value: A.mat };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 acell;\nvarying vec3 vCell;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCell = acell;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCell;\nuniform sampler2D cityMat;')
        .replace('#include <map_fragment>', [
          'vec2 cTu = vUv; vec2 cTi = floor(cTu);',
          'float cH = fract(sin(dot(cTi + vCell.xy * vec2(7.13, 3.71), vec2(12.9898, 78.233))) * 43758.5453);',
          'float cVar = floor(pow(cH, 1.8) * vCell.z - 0.001);',
          'vec2 cCell = vec2(vCell.x + max(cVar, 0.0), vCell.y);',
          'vec2 cAuv = (cCell * ' + CS.toFixed(1) + ' + ' + GUT.toFixed(1) + ' + fract(cTu) * ' + IN.toFixed(1) + ') / ' + AT.toFixed(1) + ';',
          'vec2 cG1 = dFdx(cTu) * ' + (IN / AT).toFixed(6) + ', cG2 = dFdy(cTu) * ' + (IN / AT).toFixed(6) + ';',
          'float cGl = max(length(cG1), length(cG2)); float cGm = ' + (14 / AT).toFixed(6) + '; if (cGl > cGm) { cG1 *= cGm / cGl; cG2 *= cGm / cGl; }',
          'vec4 cTex = texture2DGradEXT(map, cAuv, cG1, cG2);',
          'vec4 cMat = texture2DGradEXT(cityMat, cAuv, cG1, cG2);',
          'vec4 texelColor = mapTexelToLinear(vec4(cTex.rgb, 1.0));',
          'diffuseColor.rgb *= texelColor.rgb * mix(vec3(1.0), vColor, cTex.a);'].join('\n'))
        .replace('#include <color_fragment>', '')
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = max(0.05, cMat.r);')
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = cMat.g * 0.55;');
    };
    mat.customProgramCacheKey = () => 'ei-city';
    return mat;
  }

  // ================================================================ merged geometry, cut into spatial chunks (one material for the whole city)
  class Chunk {
    constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.cl = []; this.idx = []; this.nv = 0; }
  }
  class Geo {
    constructor() { this.chunks = new Map(); this.cur = null; this.tris = 0; }
    // pick the chunk for an object at (x, z); far objects go to coarser tiles
    // level 0: detailed buildings, pavements and landmarks next to the track (small tiles: the shadow pass only draws the near ones);
    // 1: the rest of the map's near set; 2 (or true): the hillside city
    at(x, z, lvl) { lvl = lvl === true ? 2 : lvl || 0; const S = [480, 1100, 2400][lvl]; const key = lvl + ':' + Math.floor(x / S) + ',' + Math.floor(z / S); let c = this.chunks.get(key); if (!c) { c = new Chunk(); c.far = lvl === 2; c.lvl = lvl; this.chunks.set(key, c); } this.cur = c; return c; }
    vert(p, n, u, v, col, cl) { const c = this.cur; c.p.push(p[0], p[1], p[2]); c.n.push(n[0], n[1], n[2]); c.uv.push(u, v); c.c.push(col.r, col.g, col.b); c.cl.push(cl[0], cl[1], cl[2]); return c.nv++; }
    // quad a-b-c-d counter-clockwise seen from the front (a bottom-left), uv per corner, flat normal n
    quad(a, b, c, d, n, uvs, col, cl) {
      if (!n) { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2]; let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; n = [nx / l, ny / l, nz / l]; }
      else { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2]; if ((uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2] < 0) { const t = b; b = d; d = t; uvs = [uvs[0], uvs[1], uvs[6], uvs[7], uvs[4], uvs[5], uvs[2], uvs[3]]; } }
      const i0 = this.vert(a, n, uvs[0], uvs[1], col, cl), i1 = this.vert(b, n, uvs[2], uvs[3], col, cl), i2 = this.vert(c, n, uvs[4], uvs[5], col, cl), i3 = this.vert(d, n, uvs[6], uvs[7], col, cl);
      this.cur.idx.push(i0, i1, i2, i0, i2, i3); this.tris += 2;
    }
    // as quad() but the winding is kept as given whatever the normal (two-sided foliage lit from above)
    quadKeep(a, b, c, d, n, uvs, col, cl) { const i0 = this.vert(a, n, uvs[0], uvs[1], col, cl), i1 = this.vert(b, n, uvs[2], uvs[3], col, cl), i2 = this.vert(c, n, uvs[4], uvs[5], col, cl), i3 = this.vert(d, n, uvs[6], uvs[7], col, cl); this.cur.idx.push(i0, i1, i2, i0, i2, i3); this.tris += 2; }
    tri(a, b, c, n, uvs, col, cl) { const i0 = this.vert(a, n, uvs[0], uvs[1], col, cl), i1 = this.vert(b, n, uvs[2], uvs[3], col, cl), i2 = this.vert(c, n, uvs[4], uvs[5], col, cl); this.cur.idx.push(i0, i1, i2); this.tris++; }
    // horizontal polygon (ring with positive area2), facing up (or down), world-scaled uv (tile = `tile` metres)
    cap(ring, y, col, cl, tile, down) {
      const pts = ring.map(q => new THREE.Vector2(q[0], q[1])); let tris; try { tris = THREE.ShapeUtils.triangulateShape(pts, []); } catch (e) { return; }
      const n = down ? [0, -1, 0] : [0, 1, 0]; const base = []; for (const q of ring) base.push(this.vert([q[0], y, q[1]], n, q[0] / tile, -q[1] / tile, col, cl));
      // a triangle whose x-z cross product is positive faces down (-y): order each one explicitly
      for (const t of tris) { const A = ring[t[0]], B = ring[t[1]], Cc = ring[t[2]]; const cr = (B[0] - A[0]) * (Cc[1] - A[1]) - (B[1] - A[1]) * (Cc[0] - A[0]); if ((cr > 0) === !!down) this.cur.idx.push(base[t[0]], base[t[1]], base[t[2]]); else this.cur.idx.push(base[t[0]], base[t[2]], base[t[1]]); this.tris++; }
    }
    // a cap over `pts` triangulated with the topology of `topo` (same vertex count): insets of awkward footprints keep a clean fill
    capTopo(topo, pts, y, col, cl, tile) {
      const v2 = topo.map(q => new THREE.Vector2(q[0], q[1])); let tris; try { tris = THREE.ShapeUtils.triangulateShape(v2, []); } catch (e) { return; }
      const n = [0, 1, 0]; const base = pts.map(q => this.vert([q[0], y, q[1]], n, q[0] / tile, -q[1] / tile, col, cl));
      for (const t of tris) { const A = topo[t[0]], B = topo[t[1]], Cc = topo[t[2]]; const cr = (B[0] - A[0]) * (Cc[1] - A[1]) - (B[1] - A[1]) * (Cc[0] - A[0]); if (cr > 0) this.cur.idx.push(base[t[0]], base[t[2]], base[t[1]]); else this.cur.idx.push(base[t[0]], base[t[1]], base[t[2]]); this.tris++; }
    }
    // axis-free box from a footprint rectangle (centre, axis u, half sizes), y0..y1; faces: sides with cellSide (tile = metres per bay / storey), top with cellTop
    box(cx, cz, ux, uz, hl, hw, y0, y1, col, cellSide, cellTop, bw, fh, topCol) {
      const ring = rectRing(cx, cz, ux, uz, hl, hw); this.prism(ring, y0, y1, col, cellSide, bw, fh, 0); if (cellTop) this.cap(ring, y1, topCol || col, cellTop, 3);
    }
    // vertical walls round a ring (outward), bays of bw metres, storeys of fh metres from v0
    prism(ring, y0, y1, col, cl, bw, fh, v0, u0) {
      let u = u0 || 0;
      for (let i = 0; i < ring.length; i++) {
        const P0 = ring[i], P1 = ring[(i + 1) % ring.length]; const dx = P1[0] - P0[0], dz = P1[1] - P0[1]; const L = Math.hypot(dx, dz); if (L < 0.05) continue;
        const n = [dz / L, 0, -dx / L]; const nb = bw > 0 ? Math.max(1, Math.round(L / bw)) : L / -bw; const vv0 = v0 || 0, vv1 = vv0 + (y1 - y0) / fh;
        this.quad([P1[0], y0, P1[1]], [P0[0], y0, P0[1]], [P0[0], y1, P0[1]], [P1[0], y1, P1[1]], n, [u, vv0, u + nb, vv0, u + nb, vv1, u, vv1], col, cl);
        u += nb;
      }
    }
    meshes(mat, group, name) {
      const out = [];
      for (const [key, c] of this.chunks) {
        if (!c.nv) continue; const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(c.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(c.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(c.uv, 2));
        const col = new Uint8Array(c.c.length); for (let i = 0; i < c.c.length; i++) col[i] = Math.round(U.clamp(c.c[i], 0, 1) * 255); g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
        g.setAttribute('acell', new THREE.BufferAttribute(new Uint8Array(c.cl), 3, false));
        g.setIndex(new THREE.BufferAttribute(c.nv > 65535 ? new Uint32Array(c.idx) : new Uint16Array(c.idx), 1));
        g.computeBoundingSphere(); g.computeBoundingBox();
        const m = new THREE.Mesh(g, mat); m.name = name + ['Near', 'Mid', 'Far'][c.lvl]; m.castShadow = true; m.receiveShadow = true; m.userData.box = g.boundingBox; m.userData.far = c.far;
        m.matrixAutoUpdate = false; m.updateMatrix(); group.add(m); out.push(m);
      }
      this.chunks.clear(); return out;
    }
  }

  // ================================================================ building styles
  // bw / fh: bay width and storey height (m); gh: ground floor height
  const STY = {
    riviera: { bw: 3.4, fh: 3.0, gh: 4.2, gnd: 'rv_gnd', flr: 'rv_bal', back: 'rv_back', side: 'rv_win', roof: 'flat', balcony: true },
    belle: { bw: 3.6, fh: 3.8, gh: 5.0, gnd: 'be_gnd', flr: 'be_flr', piano: 'be_piano', top: 'be_top', side: 'be_flr', roof: 'mansard', cornice: true },
    villa: { bw: 3.2, fh: 3.2, gh: 3.8, gnd: 'vl_gnd', flr: 'vl_flr', top: 'vl_top', side: 'vl_flr', roof: 'hip', cornice: true },
    old: { bw: 3.0, fh: 3.0, gh: 3.4, gnd: 'ot_gnd', flr: 'ot_flr', side: 'ot_flr', roof: 'hip' },
    modern: { bw: 3.0, fh: 3.25, gh: 5.2, gnd: 'mg_gnd', flr: 'mg_flr', side: 'mg_flr', roof: 'flat', crown: true },
    office: { bw: 3.0, fh: 3.5, gh: 4.6, gnd: 'rv_gnd', flr: 'of_flr', side: 'of_flr', roof: 'flat' },
    church: { bw: 4.5, fh: 6.0, gh: 6.0, gnd: 'church', flr: 'church', side: 'church', roof: 'hip' },
    plain: { bw: 4.0, fh: 3.5, gh: 4.0, gnd: 'plain', flr: 'of_flr', side: 'plain', roof: 'flat' },
    palace: { bw: 4.0, fh: 3.6, gh: 4.4, gnd: 'palace', flr: 'palace', side: 'palace', roof: 'flat' },
    hotel: { bw: 6.0, fh: 3.3, gh: 4.5, gnd: 'mg_gnd', flr: 'fair_flr', side: 'fair_flr', roof: 'flat' },
  };
  const TINTS = {
    riviera: [0xf3ead9, 0xe8c99a, 0xf0c9b5, 0xf7f4ee, 0xe3b98f, 0xead8c0, 0xdba590, 0xf5e2b8, 0xf2e0cc, 0xeeeae2, 0xe9cfa8],
    belle: [0xefe3c6, 0xf2e6cf, 0xe9d5b0, 0xf4ecdc, 0xe8cfb0, 0xf0d9c2, 0xeadcc0],
    villa: [0xf2d3a7, 0xefc7b2, 0xe9d9be, 0xdcb48c, 0xf3e4c9, 0xe7c0a0, 0xf1dcb4, 0xe8b9a2],
    old: [0xe8b77a, 0xe9c79a, 0xe7a98a, 0xf0d7a4, 0xd9a275, 0xedc48e, 0xe2b48c],
    modern: [0xf2f3f2, 0xe2e5e6, 0xd9dcdd, 0xeceae4],
    office: [0xe8e6e0, 0xdcd8d0, 0xf0ede6],
    church: [0xefe8da, 0xe9e0cc],
    plain: [0xdedad2, 0xcfcac0, 0xe6e1d6],
  };
  const ROOFT = [0xb4532f, 0xc0623a, 0xa34b2c, 0xc97646, 0xb85d36, 0xad5634];
  const FLATT = [0xb9b5ad, 0xa9a59d, 0xc8c4bb, 0xbdb3a4];
  const tintC = (hex) => C(hex);
  const pick = (arr, h) => arr[Math.min(arr.length - 1, Math.floor(h * arr.length))];
  // default heights the map data gives footprints without a height (they get a designed height instead)
  const DEFAULT_H = { yes: 16, apartments: 24, residential: 22, hotel: 30, commercial: 20, retail: 12, office: 24, house: 9, church: 20, chapel: 10, public: 18, civic: 18, school: 14, restaurant: 8, garage: 4, garages: 4, parking: 12 };
  const KC = { apartments: 1, residential: 1, house: 2, detached: 2, commercial: 3, retail: 3, office: 3, hotel: 4, church: 5, chapel: 5, cathedral: 5, public: 6, civic: 6, school: 6, college: 6, government: 6, industrial: 7, garage: 7, garages: 7, parking: 7, service: 7, kiosk: 7, toilets: 7 };

  // neighbourhood of a point (Monaco): drives the mix of styles
  function zoneAt(E, x, z) {
    const Z = E.cityZones; if (Math.hypot(x - Z.casino[0], z - Z.casino[1]) < 230) return 'casino';
    if (E.plateaus && E.plateaus[0] && pip(x, z, E.plateaus[0].p)) return 'rocher';
    if (x > 640 && z < -560 || x > 780) return 'larvotto';
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
  // style + storeys for a footprint
  function design(E, b, cx, cz, area, near) {
    const zone = zoneAt(E, cx, cz); const h1 = hash(cx * 3.1, cz * 2.7, 11), h2 = hash(cx * 1.7, cz * 4.3, 12), h3 = hash(cx * 5.3, cz * 1.9, 13);
    const kc = b.kc != null ? b.kc : (KC[b.k] || 0);
    let known = b.h > 0 && !(b.k && DEFAULT_H[b.k] === b.h) && !(b.h === 16 && !DEFAULT_H[b.k]);
    let H = known ? b.h : 0;
    let style = 'riviera'; for (const [s, p] of MIX[zone]) { if (h1 <= p) { style = s; break; } }
    if (kc === 5) style = 'church'; else if (kc === 7) style = 'plain'; else if (kc === 3 && H > 0 && H < 14 && area > 600) style = 'office';
    else if (kc === 4) style = H > 42 ? 'modern' : 'belle';
    if (known && H > 58 && style !== 'church') style = zone === 'larvotto' && h2 < 0.6 || H > 100 && h2 < 0.5 ? 'modern' : 'riviera';
    if (style === 'modern' && !(known && H > 40) && zone !== 'larvotto') style = 'riviera';
    if (known && H > 30 && (style === 'old' || style === 'villa')) style = 'riviera';
    if (!known && area < 110 && style !== 'church') style = zone === 'rocher' ? 'old' : (h2 < 0.6 ? 'villa' : 'old');
    const S = STY[style];
    if (!known) {
      let f0, f1; // storeys above the ground floor
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
    H = Math.min(H, Math.max(9, Math.sqrt(area) * 5.5));
    const nf = Math.max(0, Math.round((H - S.gh) / S.fh)); H = S.gh + nf * S.fh;
    const tints = TINTS[style]; const tint = tintC(pick(tints, h2));
    let roof = S.roof; if (b.roof === 1) roof = 'flat'; else if (b.roof === 2) roof = 'hip'; if (roof === 'mansard' && (area < 160 || nf < 3)) roof = 'flat'; if (roof === 'hip' && area > 900) roof = 'flat'; if (style === 'villa' && h3 < 0.35 && area > 200) roof = 'flat';
    const roofTint = tintC(roof === 'flat' ? pick(FLATT, h3) : roof === 'mansard' ? 0xd0d2d4 : pick(ROOFT, h3));
    // whole buildings dressed in the same awnings (blue / white on the boulevards, orange here and there)
    const h4 = hash(cx * 2.3, cz * 6.1, 14); const awn = style === 'riviera' && h4 < 0.3 ? (h4 < 0.22 ? 1 : 3) : 0;
    return { zone, style, S, nf, H, tint, roof, roofTint, rail: Math.floor(h3 * 3), seed: Math.floor(h1 * 997), awn };
  }

  // ================================================================ one building from its footprint
  const WHITE = C(0xf4f2ee), STONE_TRIM = C(0xf6efe0);
  const scaleC = (c, k) => new THREE.Color(Math.min(1, c.r * k), Math.min(1, c.g * k), Math.min(1, c.b * k));
  // clearance test against the circuit: true when (x, z) lies beyond the barriers by `m` metres
  function clear(E, x, z, m) { const t = E.t; const p = t.project(x, z, null, E._cpr || (E._cpr = {})); return p.dist > Math.max(t.wallL[p.i], t.wallR[p.i]) + m; }
  // the whole segment a-b (sampled every 1.5 m) clears the barriers by m
  function segClear(E, a, b, m) { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.ceil(L / 1.5)); for (let k = 0; k <= n; k++) if (!clear(E, a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, m)) return false; return true; }
  // landmark outlines that reach into the circuit's corridor: densify, then push the offending points back to the barrier line + m
  function pushClear(E, ring, m) {
    const t = E.t, out = [], pr = {}; let moved = false;
    for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.ceil(L / 2.5)); for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
    for (const q of out) { for (let it = 0; it < 3; it++) { t.project(q[0], q[1], null, pr); const need = Math.max(t.wallL[pr.i], t.wallR[pr.i]) + m; if (pr.dist >= need) break; const sg = pr.lat < 0 ? -1 : 1; const d = need - pr.dist + 0.05; q[0] += t.nx[pr.i] * sg * d; q[1] += t.nz[pr.i] * sg * d; moved = true; } }
    return moved ? cleanRing(out) : ring;
  }
  function buildOne(E, G, ring, D, detail, cxz) {
    const sc = E.sc; const S = D.S; const [cx, cz] = cxz;
    let gMin = Infinity, gMax = -Infinity; for (const q of ring) { const g = sc.height(q[0], q[1]); if (g < gMin) gMin = g; if (g > gMax) gMax = g; }
    const gc = sc.height(cx, cz); gMin = Math.min(gMin, gc); gMax = Math.max(gMax, gc);
    const yG = D.yG != null ? D.yG : gMin, yb = Math.min(yG, gMin) - 2.5 - (gMax - gMin) * 0.3, yR = yG + D.H; const far = detail === 2; D.yR = yR; D.yBase = yb;
    G.at(cx, cz, detail);
    const ob = obb(ring) || { cx, cz, ux: 1, uz: 0, hl: 5, hw: 5 }; const square = ob.hl < ob.hw * 1.35;
    const tint = D.tint; const flatRoof = D.roof === 'flat'; const parH = flatRoof ? (D.style === 'modern' ? 1.2 : 0.95) : 0;
    let u = D.seed % 41; const seg = [];
    for (let i = 0; i < ring.length; i++) {
      const P0 = ring[i], P1 = ring[(i + 1) % ring.length]; const dx = P1[0] - P0[0], dz = P1[1] - P0[1]; const L = Math.hypot(dx, dz); if (L < 0.05) continue;
      const n = [dz / L, 0, -dx / L]; const along = Math.abs(dx / L * ob.ux + dz / L * ob.uz) > 0.7; const nb = Math.max(1, Math.round(L / S.bw));
      const face = D.style === 'riviera' ? (along || square ? 'bal' : 'side') : 'main';
      seg.push({ P0, P1, L, n, d: [dx / L, dz / L], nb, u, face }); u += nb;
    }
    const wq = (s, y0, y1, v0, v1, cl, col) => G.quad([s.P1[0], y0, s.P1[1]], [s.P0[0], y0, s.P0[1]], [s.P0[0], y1, s.P0[1]], [s.P1[0], y1, s.P1[1]], s.n, [s.u, v0, s.u + s.nb, v0, s.u + s.nb, v1, s.u, v1], col || tint, cl);
    const floorCell = (s, k) => {
      switch (D.style) {
        case 'riviera': { if (s.face === 'side') return 'rv_win'; const nm = detail === 0 && s.L >= 4.5 && !D.noBalc ? 'rv_back' : 'rv_bal'; if (!D.awn) return nm; const c0 = cell(nm); return [c0[0] + D.awn, c0[1], 1]; }
        case 'belle': return detail === 2 ? 'be_flr' : k === 0 && D.nf > 2 ? 'be_piano' : k === D.nf - 1 && D.nf > 2 ? 'be_top' : 'be_flr';
        case 'villa': return k === D.nf - 1 && D.roof === 'flat' && detail < 2 ? 'vl_top' : 'vl_flr';
        default: return S.flr;
      }
    };
    for (const s of seg) {
      // ground floor (extends down into the slope), storeys, parapet
      wq(s, yb, yG + S.gh, 1 - (yG + S.gh - yb) / S.gh, 1, cell(S.gnd));
      if (D.nf > 0) {
        if (detail === 0 || D.style === 'belle' && detail === 1) { for (let k = 0; k < D.nf; k++) { const y0 = yG + S.gh + k * S.fh; const fc = floorCell(s, k); wq(s, y0, y0 + S.fh, k, k + 1, Array.isArray(fc) ? fc : cell(fc)); } }
        else { const fc = floorCell(s, 1); wq(s, yG + S.gh, yR, 0, D.nf, Array.isArray(fc) ? fc : cell(fc)); }
      }
      if (parH) wq(s, yR, yR + parH, 0, 0.35, cell('plain'), scaleC(tint, 1.03));
    }
    // ---- near detail: balcony slabs with parapets (apartment towers), the piano nobile balcony and cornices (stone / villas)
    if (detail === 0) {
      const railCell = [CELLS.rail[0] + D.rail, 7 - CELLS.rail[1], 1], plainC = cell('plain');
      const railCol = D.rail === 0 ? scaleC(tint, 1.04) : WHITE;
      for (const s of seg) {
        const balc = D.style === 'riviera' && s.face === 'bal' && s.L >= 4.5 && !D.noBalc;
        const piano = D.style === 'belle' && s.L >= 6 && D.nf > 2;
        if (!balc && !piano) continue;
        const dep = balc ? 1.35 : 0.85, th = balc ? 0.2 : 0.26, ph = balc ? 1.05 : 0.95, pt = 0.1, ins = balc ? 0.25 : 0.6;
        const a = [s.P0[0] + s.d[0] * ins, s.P0[1] + s.d[1] * ins], b = [s.P1[0] - s.d[0] * ins, s.P1[1] - s.d[1] * ins]; const o = [s.n[0], s.n[2]];
        const A = [a[0] + o[0] * dep, a[1] + o[1] * dep], B = [b[0] + o[0] * dep, b[1] + o[1] * dep];
        if (!segClear(E, A, B, 1.2)) continue;
        const Lb = Math.hypot(b[0] - a[0], b[1] - a[1]); const nbb = Math.max(1, Math.round(Lb / 2.4));
        const floors = balc ? D.nf : 1;
        for (let k = 0; k < floors; k++) {
          const y = yG + S.gh + k * S.fh; const y0 = y - th, y2 = y + ph;
          const slabC = balc ? WHITE : STONE_TRIM;
          // slab: front edge, underside, top, ends
          G.quad([B[0], y0, B[1]], [A[0], y0, A[1]], [A[0], y, A[1]], [B[0], y, B[1]], s.n, [0, 0, nbb, 0, nbb, 0.08, 0, 0.08], slabC, plainC);
          G.quad([b[0], y0, b[1]], [a[0], y0, a[1]], [A[0], y0, A[1]], [B[0], y0, B[1]], [0, -1, 0], [0, 0, nbb, 0, nbb, 0.3, 0, 0.3], scaleC(slabC, 0.8), plainC);
          G.quad([B[0], y, B[1]], [A[0], y, A[1]], [a[0], y, a[1]], [b[0], y, b[1]], [0, 1, 0], [0, 0, Lb / 2.4, 0, Lb / 2.4, dep / 2.4, 0, dep / 2.4], C(0xd9cfc2), cell('pave'));
          G.quad([A[0], y0, A[1]], [a[0], y0, a[1]], [a[0], y, a[1]], [A[0], y, A[1]], [-s.d[0], 0, -s.d[1]], [0, 0, 0.4, 0, 0.4, 0.08, 0, 0.08], slabC, plainC);
          G.quad([b[0], y0, b[1]], [B[0], y0, B[1]], [B[0], y, B[1]], [b[0], y, b[1]], [s.d[0], 0, s.d[1]], [0, 0, 0.4, 0, 0.4, 0.08, 0, 0.08], slabC, plainC);
          // parapet: outer face, inner face, top, ends (the facade behind shows through the rail cell's painted gaps)
          const Ai = [A[0] - o[0] * pt, A[1] - o[1] * pt], Bi = [B[0] - o[0] * pt, B[1] - o[1] * pt];
          const rc = balc ? railCell : [CELLS.rail[0], 7 - CELLS.rail[1], 1], rcol = balc ? railCol : STONE_TRIM;
          G.quad([B[0], y, B[1]], [A[0], y, A[1]], [A[0], y2, A[1]], [B[0], y2, B[1]], s.n, [0, 0, nbb, 0, nbb, 1, 0, 1], rcol, rc);
          G.quad([Ai[0], y, Ai[1]], [Bi[0], y, Bi[1]], [Bi[0], y2, Bi[1]], [Ai[0], y2, Ai[1]], [-o[0], 0, -o[1]], [0, 0, nbb, 0, nbb, 1, 0, 1], scaleC(rcol, 0.85), rc);
          G.quad([B[0], y2, B[1]], [A[0], y2, A[1]], [Ai[0], y2, Ai[1]], [Bi[0], y2, Bi[1]], [0, 1, 0], [0, 0, nbb, 0, nbb, 0.05, 0, 0.05], rcol, plainC);
          for (const [P, Q, sg] of [[a, A, -1], [b, B, 1]]) { const nn = [s.d[0] * sg, 0, s.d[1] * sg]; const q0 = sg < 0 ? [Q, P] : [P, Q]; G.quad([q0[0][0], y, q0[0][1]], [q0[1][0], y, q0[1][1]], [q0[1][0], y2, q0[1][1]], [q0[0][0], y2, q0[0][1]], nn, [0, 0, 0.5, 0, 0.5, 1, 0, 1], rcol, rc); }
        }
      }
    }
    // cornice bands at the roof line (and over the ground floor) for stone buildings and villas
    if (S.cornice && detail < 2) {
      const bands = D.style === 'belle' ? [[yR - 0.75, yR, 0.6], [yG + S.gh - 0.4, yG + S.gh, 0.28]] : [[yR - 0.45, yR, 0.4]];
      const cc = scaleC(tint, 1.06), plainC = cell('plain');
      for (const s of seg) for (const [y0, y1, pr] of bands) {
        const e0 = [s.P0[0] - s.d[0] * pr, s.P0[1] - s.d[1] * pr], e1 = [s.P1[0] + s.d[0] * pr, s.P1[1] + s.d[1] * pr]; const O = [s.n[0] * pr, s.n[2] * pr];
        const A = [e0[0] + O[0], e0[1] + O[1]], B = [e1[0] + O[0], e1[1] + O[1]];
        if (!segClear(E, A, B, 0.8)) continue;
        G.quad([B[0], y0, B[1]], [A[0], y0, A[1]], [A[0], y1, A[1]], [B[0], y1, B[1]], s.n, [0, 0.1, s.nb, 0.1, s.nb, 0.3, 0, 0.3], cc, plainC);
        G.quad([e1[0], y0, e1[1]], [e0[0], y0, e0[1]], [A[0], y0, A[1]], [B[0], y0, B[1]], [0, -1, 0], [0, 0, s.nb, 0, s.nb, 0.1, 0, 0.1], scaleC(cc, 0.7), plainC);
        G.quad([B[0], y1, B[1]], [A[0], y1, A[1]], [e0[0], y1, e0[1]], [e1[0], y1, e1[1]], [0, 1, 0], [0, 0, s.nb, 0, s.nb, 0.1, 0, 0.1], cc, plainC);
      }
    }
    roofOf(E, G, ring, D, detail, yR, ob, parH);
  }

  // ---- roofs: flat with parapet (+ penthouse, plant room, tanks, antennas on the taller ones), mansard, hipped terracotta
  function roofOf(E, G, ring, D, detail, yR, ob, parH) {
    const S = D.S; const rt = D.roofTint;
    if (D.roof === 'mansard') {
      // steep slate slopes with dormers all round, a flat zinc top; awkward footprints use a loose inset with the footprint's own fill
      const r1 = offsetRing(ring, 1.3) || offsetRing(ring, 1.0, true);
      if (r1) {
        const yT = yR + 3.0, mc = cell('be_mans'), zc = D.mansardTint || C(0x9ea4ac);
        for (let i = 0; i < ring.length; i++) { const j = (i + 1) % ring.length; const L = Math.hypot(ring[j][0] - ring[i][0], ring[j][1] - ring[i][1]); if (L < 0.2) continue; const nb = Math.max(1, Math.round(L / S.bw)); G.quad([ring[j][0], yR, ring[j][1]], [ring[i][0], yR, ring[i][1]], [r1[i][0], yT, r1[i][1]], [r1[j][0], yT, r1[j][1]], null, [0, 0, nb, 0, nb, 1, 0, 1], zc, mc); }
        G.capTopo(ring, r1, yT, D.mansardTop || C(0x8a9096), cell(D.mansardTopCell || 'zinc'), 3); return;
      }
    }
    if (D.roof === 'hip') {
      const eave = offsetRing(ring, -0.45) || ring; let r1 = null, dd = Math.min(ob.hw * 0.92, 6);
      for (const k of [1, 0.75, 0.5]) { r1 = offsetRing(ring, dd * k); if (r1) { dd *= k; break; } }
      if (!r1 && ring.length > 4) { dd = Math.min(ob.hw * 0.5, 2.5); r1 = offsetRing(ring, dd, true); }
      if (r1) {
        const yT = yR + dd * 0.52, tc = cell('tiles');
        for (let i = 0; i < ring.length; i++) {
          const j = (i + 1) % ring.length; const L = Math.hypot(eave[j][0] - eave[i][0], eave[j][1] - eave[i][1]); const sl = Math.hypot(dd + 0.45, yT - yR + 0.08);
          G.quad([eave[j][0], yR - 0.08, eave[j][1]], [eave[i][0], yR - 0.08, eave[i][1]], [r1[i][0], yT, r1[i][1]], [r1[j][0], yT, r1[j][1]], null, [0, 0, L / 2.2, 0, L / 2.2, sl / 2.2, 0, sl / 2.2], rt, tc);
          // fascia under the eave
          if (detail < 2) { const dx = eave[j][0] - eave[i][0], dz = eave[j][1] - eave[i][1]; const l = Math.hypot(dx, dz) || 1; G.quad([eave[j][0], yR - 0.3, eave[j][1]], [eave[i][0], yR - 0.3, eave[i][1]], [eave[i][0], yR - 0.08, eave[i][1]], [eave[j][0], yR - 0.08, eave[j][1]], [dz / l, 0, -dx / l], [0, 0, 1, 0, 1, 0.05, 0, 0.05], WHITE, cell('plain')); G.quad([ring[j][0], yR - 0.3, ring[j][1]], [ring[i][0], yR - 0.3, ring[i][1]], [eave[i][0], yR - 0.3, eave[i][1]], [eave[j][0], yR - 0.3, eave[j][1]], [0, -1, 0], [0, 0, 1, 0, 1, 0.05, 0, 0.05], scaleC(D.tint, 0.75), cell('plain')); }
        }
        G.capTopo(ring, r1, yT, rt, tc, 2.2); return;
      }
    }
    // flat roof
    const terr = (D.style === 'villa' || D.style === 'belle') && hash(ob.cx || 0, ob.cz || 0, 31) < 0.6;
    G.cap(ring, yR, rt, cell(terr ? 'terrace' : 'flat'), 3);
    if (detail < 2 && parH) {
      // parapet inside face and coping
      for (let i = 0; i < ring.length; i++) {
        const j = (i + 1) % ring.length; const dx = ring[j][0] - ring[i][0], dz = ring[j][1] - ring[i][1]; const L = Math.hypot(dx, dz); if (L < 0.05) continue; const n = [-dz / L, 0, dx / L];
        const ii = [ring[i][0] + n[0] * 0.25, ring[i][1] + n[2] * 0.25], jj = [ring[j][0] + n[0] * 0.25, ring[j][1] + n[2] * 0.25];
        G.quad([ii[0], yR, ii[1]], [jj[0], yR, jj[1]], [jj[0], yR + parH, jj[1]], [ii[0], yR + parH, ii[1]], n, [0, 0, L / 3, 0, L / 3, 0.3, 0, 0.3], scaleC(D.tint, 0.9), cell('plain'));
        G.quad([ring[j][0], yR + parH, ring[j][1]], [ring[i][0], yR + parH, ring[i][1]], [ii[0], yR + parH, ii[1]], [jj[0], yR + parH, jj[1]], [0, 1, 0], [0, 0, L / 3, 0, L / 3, 0.05, 0, 0.05], WHITE, cell('plain'));
      }
    }
    if (detail < 2 && D.H > 13) rooftop(E, G, ring, D, yR, ob);
  }
  function rooftop(E, G, ring, D, yR, ob) {
    const h = (k) => hash((ob.cx || 0) * 7 + k * 13.7, (ob.cz || 0) * 3 + k * 5.1, 41 + k); const area = Math.abs(area2(ring)) / 2;
    const plainC = cell('plain'), concC = cell('conc'); const grey = C(0xcfccc6), dark = C(0x5a5c60);
    let penthouse = null;
    if (area > 220 && (D.style === 'riviera' || D.style === 'modern') && h(1) < 0.75) { penthouse = offsetRing(ring, 2.8 + h(2) * 2); if (penthouse && Math.abs(area2(penthouse)) / 2 < 60) penthouse = null; }
    if (penthouse) {
      const ph = 3.0; G.prism(penthouse, yR, yR + ph, D.tint, cell(D.style === 'modern' ? 'mg_flr' : 'rv_top'), 3.4, ph, 0, D.seed); G.cap(penthouse, yR + ph, D.roofTint, cell('flat'), 3);
      // pergola / terrace furniture hint: a few planters on the terrace
      for (let k = 0; k < 3; k++) { const a = ring[(k * 3 + D.seed) % ring.length]; const px = a[0] + (ob.cx - a[0]) * 0.12, pz = a[1] + (ob.cz - a[1]) * 0.12; if (pip(px, pz, ring) && !pip(px, pz, penthouse)) G.box(px, pz, 1, 0, 0.5, 0.5, yR, yR + 0.8, C(0x4f6e36), cell('soil'), cell('lawn'), 1, 1, C(0x5f8a3e)); }
    }
    // lift / stair head
    const lx = ob.cx + ob.ux * ob.hl * (h(3) - 0.5) * 0.6, lz = ob.cz + ob.uz * ob.hl * (h(3) - 0.5) * 0.6; const top = penthouse ? yR + 3.0 : yR;
    if (pip(lx, lz, ring)) G.box(lx, lz, ob.ux, ob.uz, 1.8, 1.4, top, top + 2.6, grey, plainC, cell('flat'), 3, 3, grey);
    // water tanks, antennas and air-conditioning units
    const nt = Math.floor(h(4) * 3);
    for (let k = 0; k < nt; k++) { const tx = ob.cx + ob.ux * (h(5 + k) - 0.5) * ob.hl * 1.2 - ob.uz * (h(9 + k) - 0.5) * ob.hw, tz = ob.cz + ob.uz * (h(5 + k) - 0.5) * ob.hl * 1.2 + ob.ux * (h(9 + k) - 0.5) * ob.hw; if (!pip(tx, tz, ring) || penthouse && pip(tx, tz, penthouse)) continue; const r = 0.9 + h(12 + k) * 0.5; const oc = []; for (let a = 0; a < 8; a++) oc.push([tx + Math.cos(a / 8 * 6.283) * r, tz - Math.sin(a / 8 * 6.283) * r]); G.prism(cleanRing(oc), yR, yR + 1.8 + h(14 + k), grey, concC, -2, 2); G.cap(cleanRing(oc), yR + 1.8 + h(14 + k), grey, concC, 2); }
    if (h(20) < 0.7) { const ax = ob.cx - ob.ux * ob.hl * 0.3, az = ob.cz - ob.uz * ob.hl * 0.3; if (pip(ax, az, ring)) G.box(ax, az, 1, 0, 0.07, 0.07, top, top + 3 + h(21) * 5, dark, concC, null, -0.2, 1); }
    const na = 2 + Math.floor(h(22) * 4);
    for (let k = 0; k < na; k++) { const ax = ob.cx + ob.ux * (h(23 + k) - 0.5) * ob.hl * 1.4 + ob.uz * (h(30 + k) - 0.5) * ob.hw, az = ob.cz + ob.uz * (h(23 + k) - 0.5) * ob.hl * 1.4 - ob.ux * (h(30 + k) - 0.5) * ob.hw; if (!pip(ax, az, ring) || penthouse && pip(ax, az, penthouse)) continue; G.box(ax, az, ob.ux, ob.uz, 0.6, 0.4, yR, yR + 0.9, C(0xdedcd6), plainC, plainC, 1, 1); }
  }

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
    const pc = C(0xe4dcd6), kc = C(0xd8d6d2), sc0 = C(0xcfc4b2);
    let walls = 0; const RT = (t.data.street && t.data.street.retaining) || []; const retain = (s) => RT.some(r => s > r[0] - 10 && s < r[1] + 10); const TER = ((t.data.street && t.data.street.terraces) || []).concat(t.data.street && t.data.street.ycm ? [t.data.street.ycm] : []);
    for (const side of [-1, 1]) {
      let prev = null, u = 0;
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
        if (prev && cur) {
          const dl = Math.hypot(cur.x1 - prev.x1, cur.z1 - prev.z1); const u1 = u + dl / 2.4;
          G.at((cur.x0 + cur.x1) / 2, (cur.z0 + cur.z1) / 2, false);
          // ribbon corners ordered so the faces point up whichever side we are on
          const A = (P, k) => [P['x' + k], P.y, P['z' + k]];
          const q = (a0, a1, b0, b1, uv, col, cl) => { if (side > 0) G.quad(a0, b0, b1, a1, [0, 1, 0], [uv[0], uv[1], uv[2], uv[3], uv[4], uv[5], uv[6], uv[7]], col, cl); else G.quad(a1, b1, b0, a0, [0, 1, 0], [uv[6], uv[7], uv[4], uv[5], uv[2], uv[3], uv[0], uv[1]], col, cl); };
          // granite kerb strip, then the block paving
          q([prev.x0, prev.y, prev.z0], [prev.xk, prev.y, prev.zk], [cur.x0, cur.y, cur.z0], [cur.xk, cur.y, cur.zk], [u, 0, u, 0.15, u1, 0.15, u1, 0], kc, kerbC);
          q([prev.xk, prev.y, prev.zk], [prev.x1, prev.y, prev.z1], [cur.xk, cur.y, cur.zk], [cur.x1, cur.y, cur.z1], [u, 0, u, (Wd - KW) / 2.4, u1, (Wd - KW) / 2.4, u1, 0], pc, paveC);
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
  const LANDC = { 1: [40, 52, 30], 2: [70, 76, 48], 3: [150, 145, 135], 4: [60, 82, 42], 5: [72, 96, 46], 6: [86, 78, 52], 7: [100, 106, 90], 8: [64, 104, 52], 9: [74, 86, 46], 10: [196, 182, 156], 11: [118, 112, 104] };
  City.paintBase = function (E) {
    return (ctx, path) => {
      const t = E.t; const rgb = (c) => 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
      // land cover from the map
      for (const L of E.data.land || []) { const code = L[0]; const p = []; for (let i = 1; i + 1 < L.length; i += 2) p.push([L[i], L[i + 1]]); if (p.length < 3) continue; ctx.fillStyle = rgb(LANDC[code] || [100, 100, 90]); path(p); ctx.fill(); }
      // urban fabric: forecourts and pavements round every footprint, then the streets (paving each side, tarmac)
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgb(124,119,112)'; ctx.lineWidth = 7; ctx.beginPath(); for (const b of t.data.scenery.buildings) { const p = b.p; ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath(); } for (const b of E.cityFar || []) { const p = b.p; ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath(); } ctx.stroke();
      E.cityStreets = Env.decodeStreets(E.data.streets);
      // pavements only where the street runs through built-up ground; country roads are plain tarmac
      for (const r of E.cityStreets) { let c = 0; for (const p of r.pts) c += E.coverAt(p[0], p[1]); r.urban = c / r.pts.length > 0.05; }
      for (const pass of [0, 1]) for (const r of E.cityStreets) { if (!pass && !r.urban) continue; ctx.strokeStyle = pass ? 'rgb(74,75,78)' : 'rgb(150,145,138)'; ctx.lineWidth = pass ? r.w * (r.urban ? 1 : 0.8) : r.w + 4; ctx.beginPath(); r.pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); }
      // swimming pools in the gardens
      for (const [x, z, L, W, a] of E.data.pools || []) { ctx.save(); ctx.translate(x, z); ctx.rotate(a); ctx.fillStyle = 'rgb(226,222,214)'; ctx.fillRect(-L / 2 - 1.2, -W / 2 - 1.2, L + 2.4, W + 2.4); ctx.fillStyle = 'rgb(64,156,196)'; ctx.fillRect(-L / 2, -W / 2, L, W); ctx.restore(); }
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
      if (lm.placeCasino) { ctx.fillStyle = 'rgb(164,152,140)'; path(lm.placeCasino); ctx.fill(); }
      const lawn = casinoLawn(E); if (lawn) { ctx.fillStyle = 'rgb(76,112,46)'; path(lawn); ctx.fill(); }
    };
  };

  // ================================================================ landmarks
  // forced design for a landmark footprint
  function forced(style, nf, tintHex, roof, extra) {
    const S = STY[style]; const D = { zone: 'landmark', style, S, nf, H: S.gh + nf * S.fh, tint: C(tintHex), roof, roofTint: C(roof === 'flat' ? 0xbcb6aa : roof === 'mansard' ? 0xd0d2d4 : 0xb85d36), rail: 0, seed: 7 };
    return Object.assign(D, extra || {});
  }
  // surface of revolution (domes, drums, lanterns): profile [[r, y], ...] bottom to top, around (cx, cz)
  function lathe(G, cx, cz, prof, segs, col, cl, vScale) {
    for (let k = 0; k + 1 < prof.length; k++) {
      const [r0, y0] = prof[k], [r1, y1] = prof[k + 1]; const sl = Math.hypot(r1 - r0, y1 - y0) || 1; const nr = (y1 - y0) / sl, ny = -(r1 - r0) / sl;
      for (let i = 0; i < segs; i++) {
        const a0 = i / segs * Math.PI * 2, a1 = (i + 1) / segs * Math.PI * 2; const am = (a0 + a1) / 2;
        const P = (r, y, a) => [cx + Math.cos(a) * r, y, cz - Math.sin(a) * r];
        const n = [Math.cos(am) * nr, ny, -Math.sin(am) * nr];
        const u0 = i / segs * segs / 2, u1 = (i + 1) / segs * segs / 2, v0 = k * (vScale || 1), v1 = (k + 1) * (vScale || 1);
        G.quad(P(r0, y0, a1), P(r0, y0, a0), P(r1, y1, a0), P(r1, y1, a1), n, [u0, v0, u1, v0, u1, v1, u0, v1], col, cl);
      }
    }
  }
  function domeProfile(r, h, y0, n) { const out = []; for (let k = 0; k <= (n || 6); k++) { const a = k / (n || 6) * Math.PI / 2; out.push([Math.max(0.05, Math.cos(a) * r), y0 + Math.sin(a) * h]); } return out; }
  // a date palm: tapering trunk, a crown of drooping fronds (both faces, so no culling holes)
  function palm(G, x, y, z, h, seed) {
    const r = U.rng(seed); const bark = C(0xb09a80), barkC = cell('conc'), frC = cell('frond');
    const lean = (r() - 0.5) * 0.12, lx = Math.cos(seed) * lean * h, lz = Math.sin(seed) * lean * h;
    const ring = (rad, yy, ox, oz) => { const p = []; for (let a = 0; a < 6; a++) p.push([x + ox + Math.cos(a / 6 * 6.283) * rad, z + oz - Math.sin(a / 6 * 6.283) * rad]); return p; };
    const r0 = ring(0.3, y, 0, 0), r1 = ring(0.2, y + h, lx, lz);
    for (let i = 0; i < 6; i++) { const j = (i + 1) % 6; G.quad([r0[j][0], y - 0.3, r0[j][1]], [r0[i][0], y - 0.3, r0[i][1]], [r1[i][0], y + h, r1[i][1]], [r1[j][0], y + h, r1[j][1]], null, [0, 0, 0.3, 0, 0.3, h / 1.5, 0, h / 1.5], bark, barkC); }
    const cxp = x + lx, cyp = y + h, czp = z + lz; const nf = 9 + Math.floor(r() * 4); const fc = new THREE.Color().setHSL(0.2 + r() * 0.06, 0.35, 0.62 + r() * 0.12);
    for (let k = 0; k < nf; k++) {
      const a = k / nf * 6.283 + r() * 0.4, L = 2.8 + r() * 1.0, up = 0.9 - r() * 1.1; const dx = Math.cos(a), dz = Math.sin(a), wx = -dz * 0.45, wz = dx * 0.45;
      const mid = [cxp + dx * L * 0.5, cyp + up * 0.5 + 0.45, czp + dz * L * 0.5], tip = [cxp + dx * L, cyp + up - 0.5, czp + dz * L], base = [cxp, cyp, czp];
      const ma = [mid[0] + wx, mid[1], mid[2] + wz], mb = [mid[0] - wx, mid[1], mid[2] - wz];
      for (const sgn of [1, -1]) {
        const n = [dx * 0.25, 0.97, dz * 0.25];   // both faces lit as from above (foliage reads dark from below otherwise)
        if (sgn > 0) { G.quadKeep(base, mb, mid, ma, n, [0.5, 0, 0, 0.5, 0.5, 0.5, 1, 0.5], fc, frC); G.quadKeep(ma, mid, mb, tip, n, [1, 0.5, 0.5, 0.5, 0, 0.5, 0.5, 1], fc, frC); }
        else { G.quadKeep(base, ma, mid, mb, n, [0.5, 0, 1, 0.5, 0.5, 0.5, 0, 0.5], scaleC(fc, 0.8), frC); G.quadKeep(mb, mid, ma, tip, n, [0, 0.5, 0.5, 0.5, 1, 0.5, 0.5, 1], scaleC(fc, 0.8), frC); }
      }
    }
  }
  // a low spiky agave / shrub clump
  function agave(G, x, y, z, rad, seed) { const r = U.rng(seed); const col = new THREE.Color().setHSL(0.28 + r() * 0.08, 0.3, 0.6 + r() * 0.12); const n = 7; for (let k = 0; k < n; k++) { const a = k / n * 6.283 + r(), L = rad * (0.7 + r() * 0.5); const tip = [x + Math.cos(a) * L, y + 0.4 + r() * 0.6, z + Math.sin(a) * L]; const wa = [x + Math.cos(a + 0.35) * 0.18, y, z + Math.sin(a + 0.35) * 0.18], wb = [x + Math.cos(a - 0.35) * 0.18, y, z + Math.sin(a - 0.35) * 0.18]; G.tri(wa, wb, tip, [Math.cos(a) * 0.5, 0.86, Math.sin(a) * 0.5], [0, 0, 1, 0, 0.5, 1], col, cell('frond')); G.tri(wb, wa, tip, [Math.cos(a) * 0.5, 0.86, Math.sin(a) * 0.5], [0, 0, 1, 0, 0.5, 1], col, cell('frond')); } }
  // the point of a ring nearest a target, and the ring's ground levels
  function nearestOn(ring, x, z) { let best = Infinity, bp = ring[0]; for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; const dx = b[0] - a[0], dz = b[1] - a[1]; const l2 = dx * dx + dz * dz || 1; const u = U.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1); const px = a[0] + dx * u, pz = a[1] + dz * u; const d = Math.hypot(px - x, pz - z); if (d < best) { best = d; bp = [px, pz]; } } return bp; }

  City.landmarks = function (E, G, claimed) {
    const sc = E.sc, t = E.t; const lm = E.data.landmarks || {}; const R = (k) => lm[k] ? cleanRing(lm[k]) : null;
    const add = (k) => { let r = R(k); if (r) { claimed.push(r); r = pushClear(E, r, 1.2); } return r; };
    const trackNear = (x, z) => t.project(x, z, null, {});
    // ---- the Casino: stone front with twin domed pavilions and the clock pediment facing the square, copper roofs
    const cas = add('casino'), fnt = lm.fountain ? centroid(lm.fountain) : null;
    if (cas && fnt) {
      const c = centroid(cas); let fx = fnt[0] - c[0], fz = fnt[1] - c[1]; const fl = Math.hypot(fx, fz); fx /= fl; fz /= fl; const rx = -fz, rz = fx;
      let mp = -Infinity; for (const q of cas) mp = Math.max(mp, (q[0] - c[0]) * fx + (q[1] - c[1]) * fz);
      let r0 = Infinity, r1 = -Infinity; for (const q of cas) { if ((q[0] - c[0]) * fx + (q[1] - c[1]) * fz < mp - 16) continue; const rr = (q[0] - c[0]) * rx + (q[1] - c[1]) * rz; r0 = Math.min(r0, rr); r1 = Math.max(r1, rr); }
      const FC = [c[0] + fx * mp + rx * (r0 + r1) / 2, c[1] + fz * mp + rz * (r0 + r1) / 2];
      const yG = sc.height(FC[0] + fx * 3, FC[1] + fz * 3);
      const D = forced('belle', 0, 0xeadbbd, 'mansard', { yG, H: 15, noBalc: true, mansardTint: C(0x8fbca6), mansardTop: C(0x9cc4ae), mansardTopCell: 'copper' }); D.S = Object.assign({}, STY.belle, { gh: 9, fh: 6, bw: 4.6, gnd: 'cas_flr', cornice: true }); D.nf = 0;
      buildOne(E, G, cas, D, 1, c);
      // attic storey and balustrade over the whole block (buildOne drew the ground storey; the attic sits under the mansard)
      const yA = yG + 9; G.at(c[0], c[1], false);
      for (let i = 0; i < cas.length; i++) { const P0 = cas[i], P1 = cas[(i + 1) % cas.length]; const L = Math.hypot(P1[0] - P0[0], P1[1] - P0[1]); if (L < 0.1) continue; const n = [(P1[1] - P0[1]) / L, 0, -(P1[0] - P0[0]) / L]; const nb = Math.max(1, Math.round(L / 4.6)); G.quad([P1[0], yA, P1[1]], [P0[0], yA, P0[1]], [P0[0], yA + 6, P0[1]], [P1[0], yA + 6, P1[1]], n, [0, 0, nb, 0, nb, 1, 0, 1], D.tint, cell('cas_top')); }
      // the twin pavilions at the ends of the front, domed, with lanterns
      for (const k of [r0 + 6.5, r1 - 6.5]) {
        const px = FC[0] + rx * (k - (r0 + r1) / 2) - fx * 4.5, pz = FC[1] + rz * (k - (r0 + r1) / 2) - fz * 4.5; const ring = rectRing(px, pz, fx, fz, 4.6, 4.6);
        G.prism(ring, yG + 14.5, yG + 23, D.tint, cell('cas_top'), 4.6, 8.5, 0); G.cap(ring, yG + 23, C(0xe8dcc4), cell('conc'), 3);
        lathe(G, px, pz, [[4.0, yG + 23], [4.0, yG + 24.2], [3.6, yG + 24.4]], 12, C(0xeadbbd), cell('cas_top'), 0.2);
        lathe(G, px, pz, domeProfile(3.6, 4.6, yG + 24.4, 6), 12, C(0x9cc4ae), cell('copper'), 1);
        lathe(G, px, pz, [[0.8, yG + 29], [0.8, yG + 30.6], [0.05, yG + 32.4]], 8, C(0x9cc4ae), cell('copper'), 1);
      }
      // the clock pediment over the entrance and the copper roof behind it
      const hw = 7.5, y0 = yG + 14.5; const A = [FC[0] - rx * hw + fx * 0.6, FC[1] - rz * hw + fz * 0.6], B = [FC[0] + rx * hw + fx * 0.6, FC[1] + rz * hw + fz * 0.6]; const nF = [fx, 0, fz];
      G.quad([A[0], y0, A[1]], [B[0], y0, B[1]], [B[0], y0 + 5, B[1]], [A[0], y0 + 5, A[1]], nF, [0, 0, 1, 0, 1, 1, 0, 1], D.tint, cell('clock'));
      G.tri([A[0], y0 + 5, A[1]], [B[0], y0 + 5, B[1]], [FC[0] + fx * 0.6, y0 + 8.5, FC[1] + fz * 0.6], nF, [0, 0, 1, 0, 0.5, 0.6], D.tint, cell('plain'));
      const bx = FC[0] - fx * 16, bz = FC[1] - fz * 16; lathe(G, bx, bz, [[7, yG + 18], [6.2, yG + 21]].concat(domeProfile(6.2, 4, yG + 21, 5).slice(1)), 14, C(0x9cc4ae), cell('copper'), 1);
      E.casinoFront = { FC, fx, fz, yG };
    }
    // ---- the Hotel de Paris (seven storeys of Belle Epoque stone, mansard, the rotunda's dome at the Massenet corner)
    const hdp = add('hotelDeParis');
    if (hdp) {
      const c = centroid(hdp); const D = forced('belle', 6, 0xf1e5cc, 'mansard'); buildOne(E, G, hdp, D, 0, c);
      const i0 = t.idxAtS(790); const np = nearestOn(hdp, t.x[i0], t.z[i0]); let dx = c[0] - np[0], dz = c[1] - np[1]; const l = Math.hypot(dx, dz) || 1; const dcx = np[0] + dx / l * 9, dcz = np[1] + dz / l * 9;
      G.at(dcx, dcz, false); lathe(G, dcx, dcz, [[8.6, D.yR], [8.6, D.yR + 3.4]], 16, D.tint, cell('be_top'), 1); lathe(G, dcx, dcz, domeProfile(8.6, 6.5, D.yR + 3.4, 7), 16, C(0x7d8288), cell('zinc'), 1); lathe(G, dcx, dcz, [[1.2, D.yR + 9.8], [1.2, D.yR + 11.5], [0.05, D.yR + 13]], 8, C(0x9a9890), cell('zinc'), 1);
    }
    // ---- the Cafe de Paris: two storeys of arcades and awnings, a roof terrace
    const cdp = add('cafeDeParis'); if (cdp) buildOne(E, G, cdp, forced('belle', 1, 0xefe2c8, 'flat', { noBalc: true }), 0, centroid(cdp));
    // ---- the Hermitage, the Oceanographic Museum (with its cupola), the cathedral, the Sainte-Devote chapel
    const her = add('hermitage'); if (her) buildOne(E, G, her, forced('belle', 6, 0xf3e6cc, 'mansard'), 1, centroid(her));
    const mus = add('museeOceano'); if (mus) { const c = centroid(mus); const D = forced('belle', 3, 0xeee3cc, 'flat'); buildOne(E, G, mus, D, 1, c); G.at(c[0], c[1], false); lathe(G, c[0], c[1], [[7, D.yR], [7, D.yR + 2]].concat(domeProfile(7, 6, D.yR + 2, 6).slice(1)), 14, C(0x8a9a9c), cell('zinc'), 1); }
    const cat = add('cathedral'); if (cat) buildOne(E, G, cat, forced('church', 3, 0xf2ecdf, 'hip'), 1, centroid(cat));
    const dev = add('devoteChapel');
    if (dev) { const c = centroid(dev); const D = forced('church', 1, 0xf0d9b8, 'hip'); buildOne(E, G, dev, D, 0, c); const ob = obb(dev); if (ob) { const tx = ob.cx + ob.ux * (ob.hl - 2.2), tz = ob.cz + ob.uz * (ob.hl - 2.2); const ring = rectRing(tx, tz, ob.ux, ob.uz, 2, 2); G.prism(ring, D.yR - 4, D.yR + 8, D.tint, cell('church'), 4, 6, 0); for (let i = 0; i < 4; i++) { const a = ring[i], b = ring[(i + 1) % 4]; G.quad([b[0], D.yR + 8, b[1]], [a[0], D.yR + 8, a[1]], [tx, D.yR + 11.5, tz], [tx, D.yR + 11.5, tz], null, [0, 0, 1, 0, 0.5, 1, 0.5, 1], C(0xb85d36), cell('tiles')); } } }
    // ---- the Prince's Palace: ochre ranges with crenellated parapets and a corner tower
    const pal = add('palace');
    if (pal) {
      const c = centroid(pal); const D = forced('palace', 3, 0xeed2a6, 'flat'); buildOne(E, G, pal, D, 1, c); G.at(c[0], c[1], false);
      for (let i = 0; i < pal.length; i++) { const a = pal[i], b = pal[(i + 1) % pal.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L; for (let d = 0.8; d < L - 0.4; d += 2.2) G.box(a[0] + ux * d, a[1] + uz * d, ux, uz, 0.5, 0.3, D.yR + 0.9, D.yR + 1.9, D.tint, cell('plain'), cell('plain'), 1, 1); }
      const ob = obb(pal); if (ob) { const tx = ob.cx + ob.ux * (ob.hl - 5), tz = ob.cz + ob.uz * (ob.hl - 5); const ring = rectRing(tx, tz, ob.ux, ob.uz, 4.5, 4.5); G.prism(ring, D.yR - 2, D.yR + 9, D.tint, cell('palace'), 4, 3.6, 0); G.cap(ring, D.yR + 9, C(0xc8bfae), cell('flat'), 3); for (let i = 0; i < 4; i++) { const a = ring[i], b = ring[(i + 1) % 4]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L; for (let d = 0.6; d < L; d += 1.8) G.box(a[0] + ux * d, a[1] + uz * d, ux, uz, 0.4, 0.3, D.yR + 9, D.yR + 10.2, D.tint, cell('plain'), cell('plain'), 1, 1); } }
    }
    // ---- the Yacht Club at the chicane: white decks stepping back like a liner, long glazing bands
    // (the circuit's own street kit builds the club along the quay when the track data lists it: then only the footprint is reserved)
    const ycm = add('yachtClub');
    if (ycm && !(t.data.street && t.data.street.ycm)) {
      const c = centroid(ycm); let y = sc.height(c[0], c[1]); let ring = ycm; G.at(c[0], c[1], false);
      for (let k = 0; k < 4 && ring; k++) { G.prism(ring, k ? y : y - 2, y + 4.2, C(0xf6f6f4), cell('ycm'), -3.7, 4.2, k ? 0 : -2 / 4.2); G.cap(ring, y + 4.2, C(0xd8cfc2), cell('terrace'), 3); for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.1) continue; const n = [(b[1] - a[1]) / L, 0, -(b[0] - a[0]) / L]; G.quad([b[0], y + 4.2, b[1]], [a[0], y + 4.2, a[1]], [a[0], y + 5.2, a[1]], [b[0], y + 5.2, b[1]], n, [0, 0, L / 3, 0, L / 3, 1, 0, 1], C(0xffffff), [CELLS.rail[0] + 1, 7 - CELLS.rail[1], 1]); } y += 4.2; ring = offsetRing(ring, 2.6 + k * 0.6); }
    }
    // ---- the hotel over the hairpin: a long curved block over the tunnel, deep balcony bands, from the sea road to the hairpin level
    // (the hotel stands over the tunnel on purpose: its outline is kept, the facade stops at the tunnel's roof)
    const fair = R('fairmont'); if (fair) claimed.push(fair);
    if (fair) {
      const c = centroid(fair); const TD = t.data.tunnel; G.at(c[0], c[1], false);
      const i0 = t.idxAtS(1262); const yTop = t.y[i0] + 19; const tint = C(0xebe2d2), fc = cell('fair_flr'), gc = cell('mg_gnd');
      for (let i = 0; i < fair.length; i++) {
        const P0 = fair[i], P1 = fair[(i + 1) % fair.length]; const L = Math.hypot(P1[0] - P0[0], P1[1] - P0[1]); if (L < 0.1) continue; const n = [(P1[1] - P0[1]) / L, 0, -(P1[0] - P0[0]) / L];
        const np = Math.max(1, Math.round(L / 6)); let u = i * 3;
        for (let k = 0; k < np; k++) {
          const a = [P0[0] + (P1[0] - P0[0]) * k / np, P0[1] + (P1[1] - P0[1]) * k / np], b = [P0[0] + (P1[0] - P0[0]) * (k + 1) / np, P0[1] + (P1[1] - P0[1]) * (k + 1) / np];
          const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; const pr = t.project(mx, mz, null, {});
          let yb = Math.min(sc.height(a[0], a[1]), sc.height(b[0], b[1])) - 1;
          // over the tunnel: the facade stops at the tunnel's roof
          if (TD && pr.s > TD.s0 - 10 && pr.s < TD.s1 + 10 && pr.dist < Math.max(t.wallL[pr.i], t.wallR[pr.i]) + 2.2) yb = Math.max(yb, t.y[pr.i] + 7.3);
          const nfl = Math.max(1, Math.round((yTop - yb) / 3.3));
          G.quad([b[0], yb, b[1]], [a[0], yb, a[1]], [a[0], yTop, a[1]], [b[0], yTop, b[1]], n, [u, 0, u + 1, 0, u + 1, nfl, u, nfl], tint, fc); u++;
          G.quad([b[0], yTop, b[1]], [a[0], yTop, a[1]], [a[0], yTop + 1.1, a[1]], [b[0], yTop + 1.1, b[1]], n, [0, 0, 1, 0, 1, 0.3, 0, 0.3], WHITE, cell('plain'));
        }
      }
      G.cap(fair, yTop, C(0xcfc8bc), cell('terrace'), 3);
      // rooftop pavilions and the canopy over the entrance at the hairpin level
      const ob = obb(fair); if (ob) for (const k of [-0.25, 0.3]) { const r = rectRing(ob.cx + ob.ux * ob.hl * k, ob.cz + ob.uz * ob.hl * k, ob.ux, ob.uz, 9, Math.min(6, ob.hw * 0.4)); G.prism(r, yTop, yTop + 3.4, C(0xf2f0ea), cell('mg_flr'), 3, 3.4, 0); G.cap(r, yTop + 3.4, C(0xe0ddd6), cell('flat'), 3); }
    }
  };

  // ---- the swimming pool between the two Piscine chicanes: deck, the basin, the diving tower
  function pool(E, G) {
    const t = E.t, sc = E.sc; const i = t.idxAtS(2630);
    // the pool lies between this stretch and the start / finish straight (the side the straight is on)
    let j = 0, bd = Infinity; for (let s = t.sf - 200; s < t.sf + 1; s += 4) { const k = t.idxAtS(s); const d = Math.hypot(t.x[k] - t.x[i], t.z[k] - t.z[i]); if (d < bd) { bd = d; j = k; } }
    const side = (t.x[j] - t.x[i]) * t.nx[i] + (t.z[j] - t.z[i]) * t.nz[i] > 0 ? 1 : -1;
    const tx = t.tx[i], tz = t.tz[i], nx = t.nx[i] * side, nz = t.nz[i] * side;
    // widest basin that keeps clear of both stretches (the pit corridor runs along the start straight)
    let off = t.wallR[i] + 4, W = 24;
    for (; W > 12; W -= 1) { const cx = t.x[i] + nx * (off + W / 2), cz = t.z[i] + nz * (off + W / 2); const far = [cx + nx * W / 2, cz + nz * W / 2]; const p = t.project(far[0], far[1], null, {}); if (Math.abs(p.s - t.s[i]) < 100 || p.dist > Math.max(t.wallL[p.i], t.wallR[p.i]) + 42) break; }
    const L = 54; let cx, cz, deck;
    // slide the deck away from the track until its whole outline clears the barriers (the stretch curves along the pool)
    for (let k = 0; k < 30; k++, off += 0.5) { cx = t.x[i] + nx * (off + W / 2); cz = t.z[i] + nz * (off + W / 2); deck = rectRing(cx, cz, tx, tz, L / 2 + 2, W / 2 + 1); let ok = true; for (let q = 0; q < 4; q++) if (!segClear(E, deck[q], deck[(q + 1) % 4], 1.5)) { ok = false; break; } if (ok) break; }
    const y = t.y[i] + 0.25;
    G.at(cx, cz, false); G.cap(deck, y, C(0xf2f0ea), cell('pooltile'), 2.4); G.prism(deck, y - 0.6, y, C(0xe8e4dc), cell('kerb'), 2, 0.6, 0);
    const wl = L / 2 - 2, ww = W / 2 - 1.5; const basin = rectRing(cx, cz, tx, tz, wl, ww); const yw = y - 0.35;
    // water (lanes run along the basin), the tiled inner walls
    const q = basin; G.quad([q[0][0], yw, q[0][1]], [q[1][0], yw, q[1][1]], [q[2][0], yw, q[2][1]], [q[3][0], yw, q[3][1]], [0, 1, 0], [0, 0, wl / 1.2, 0, wl / 1.2, ww * 2 / 2.5, 0, ww * 2 / 2.5], C(0xffffff), cell('water'));
    for (let k = 0; k < 4; k++) { const a = q[k], b = q[(k + 1) % 4]; const L2 = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = [-(b[1] - a[1]) / L2, 0, (b[0] - a[0]) / L2]; G.quad([a[0], yw - 0.1, a[1]], [b[0], yw - 0.1, b[1]], [b[0], y + 0.01, b[1]], [a[0], y + 0.01, a[1]], n, [0, 0, L2 / 2.4, 0, L2 / 2.4, 0.15, 0, 0.15], C(0xdbe9ec), cell('pooltile')); }
    // the diving tower at the far end: two piers, platforms at 3, 5, 7.5 and 10 m
    const dx = cx + tx * (wl + 1.2), dz = cz + tz * (wl + 1.2); const con = C(0xe6e3dc), cc = cell('conc');
    for (const sd of [-1, 1]) G.box(dx - nx * sd * 2.2, dz - nz * sd * 2.2, tx, tz, 0.5, 0.5, y, y + 10.4, con, cc, cc, 1, 3);
    for (const [h, len] of [[3, 3.5], [5, 4.5], [7.5, 5.5], [10, 6.5]]) { G.box(dx - tx * len / 2 + tx * 0.6, dz - tz * len / 2 + tz * 0.6, tx, tz, len / 2, 1.3, y + h - 0.3, y + h, con, cc, cc, 1, 1); G.box(dx - tx * len + tx * 0.8, dz - tz * len + tz * 0.8, tx, tz, 0.05, 1.25, y + h, y + h + 1.0, C(0x3a6aa0), cc, null, 1, 1); }
    E.poolInfo = { cx, cz, tx, tz, nx, nz, L, W, y };
  }
  // ---- the planted island inside the hairpin (from the map's flowerbed) and the retaining wall above the descent to it
  function hairpin(E, G) {
    const t = E.t, sc = E.sc; let isl = null; const i0 = t.idxAtS(1262);
    for (const L of E.data.land || []) { if (L[0] !== 6) continue; const p = []; for (let i = 1; i + 1 < L.length; i += 2) p.push([L[i], L[i + 1]]); const c = centroid(p); if (Math.hypot(c[0] - t.x[i0], c[1] - t.z[i0]) < 40) { isl = cleanRing(p); break; } }
    const kitIsland = EI.StreetKit && EI.StreetKit.hairpin && EI.StreetKit.hairpin(t);
    if (isl && !kitIsland) {
      const c = centroid(isl); const y = sc.height(c[0], c[1]) + 0.05; G.at(c[0], c[1], false);
      G.prism(isl, y - 0.4, y + 0.55, C(0xf4f2ee), cell('kerb'), 1.2, 0.95, 0); G.cap(isl, y + 0.55, C(0xffffff), cell('soil'), 2);
      const ins = offsetRing(isl, 0.8); if (ins) G.cap(ins, y + 0.6, C(0xffffff), cell('flowers'), 2);
      palm(G, c[0], y + 0.55, c[1], 5.5, 11); palm(G, c[0] + 1.5, y + 0.55, c[1] - 1, 4.2, 12); for (let k = 0; k < 5; k++) agave(G, c[0] + Math.cos(k * 1.3) * 2.2, y + 0.6, c[1] + Math.sin(k * 1.3) * 2.2, 0.9, 20 + k);
      E.hairpinIsland = c;
    }
    // the stone wall: along the outside of the descent from Mirabeau, ~8 m of rough masonry holding up the road above
    const ref = E.hairpinIsland || [t.x[i0], t.z[i0]]; let side = 1;
    { const j = t.idxAtS(1200); const lat = (ref[0] - t.x[j]) * t.nx[j] + (ref[1] - t.z[j]) * t.nz[j]; side = lat > 0 ? -1 : 1; }
    // the street kit's hand-listed retaining walls already cover it when the track data has them
    const RT = (t.data.street && t.data.street.retaining) || []; if (RT.some(r => r[0] < 1240 && r[1] > 1150)) return;
    let prev = null; const stC = cell('stone'), sc0 = C(0xf0e8da);
    for (let s = 1150; s <= 1242; s += 2) {
      const i = t.idxAtS(s); const w = E.wallCap(i, side) + 1.6; const x = t.x[i] + t.nx[i] * side * w, z = t.z[i] + t.nz[i] * side * w; const x2 = t.x[i] + t.nx[i] * side * (w + 3), z2 = t.z[i] + t.nz[i] * side * (w + 3);
      const h = 8.5 * U.smoothstep(1150, 1168, s) * (1 - U.smoothstep(1226, 1242, s)) + 1.2; const y = t.y[i] + 0.1;
      const cur = { x, z, x2, z2, y, top: y + h };
      if (prev) { const nn = [-t.nx[i] * side, 0, -t.nz[i] * side]; G.at(x, z, false); G.quad([prev.x, prev.y - 0.4, prev.z], [x, y - 0.4, z], [x, cur.top, z], [prev.x, prev.top, prev.z], nn, [(s - 2) / 2.6, 0, s / 2.6, 0, s / 2.6, (cur.top - y) / 2.6, (s - 2) / 2.6, (prev.top - prev.y) / 2.6], sc0, stC); G.quad([prev.x, prev.top, prev.z], [x, cur.top, z], [x2, cur.top, z2], [prev.x2, prev.top, prev.z2], [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], C(0xc8c0b4), cell('pave')); }
      prev = cur;
    }
  }
  // ---- the Casino square garden: the lawn island with its flower beds, the fountain basin and palms
  // the lawn: an oval round the fountain, pulled towards the track, kept clear of the barrier and the pavement
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
    const t = E.t, sc = E.sc; const lm = E.data.landmarks || {}; const lawn = casinoLawn(E); if (!lawn) return;
    const { cx, cz, ra, rb, ang, f } = lawn.info; const y = sc.height(cx, cz) + 0.02; G.at(cx, cz, false);
    G.prism(lawn, y - 0.3, y + 0.3, C(0xece8e0), cell('kerb'), 1.5, 0.6, 0); G.cap(lawn, y + 0.3, C(0xffffff), cell('lawn'), 3);
    // flower beds: a ring round the fountain and two crescents at the ends
    const ring = (r, h) => { const p = []; for (let k = 0; k < 20; k++) p.push([f[0] + Math.cos(k / 20 * 6.283) * r, f[1] + Math.sin(k / 20 * 6.283) * r]); return cleanRing(p); };
    const fr = lm.fountain ? Math.sqrt(Math.abs(area2(cleanRing(lm.fountain))) / 2 / Math.PI) : 5;
    G.cap(ring(fr + 2.6), y + 0.36, C(0xffffff), cell('flowers'), 2);
    for (const sg of [-1, 1]) { const ex = cx + Math.cos(ang) * ra * 0.62 * sg, ez = cz + Math.sin(ang) * ra * 0.62 * sg; const p = []; for (let k = 0; k < 14; k++) { const a = k / 14 * 6.283; p.push([ex + Math.cos(a) * 4.5, ez + Math.sin(a) * 2.4]); } G.cap(cleanRing(p), y + 0.36, C(0xffffff), cell('flowers'), 2); }
    // the fountain: a stone basin, water, a central pedestal
    const fb = ring(fr), fi = offsetRing(fb, 0.5) || fb; G.prism(fb, y, y + 0.75, C(0xf0ebe0), cell('stone'), 1.2, 0.75, 0); G.cap(fi, y + 0.55, C(0xffffff), cell('water'), 3);
    for (let k = 0; k < fb.length; k++) { const a = fb[k], b = fb[(k + 1) % fb.length], c2 = fi[(k + 1) % fi.length], d = fi[k]; G.quad([a[0], y + 0.75, a[1]], [b[0], y + 0.75, b[1]], [c2[0], y + 0.75, c2[1]], [d[0], y + 0.75, d[1]], [0, 1, 0], [0, 0, 1, 0, 1, 0.2, 0, 0.2], C(0xf4f0e6), cell('conc')); }
    lathe(G, f[0], f[1], [[1.2, y + 0.5], [0.9, y + 1.6], [0.4, y + 2.2], [1.4, y + 2.4], [0.05, y + 2.6]], 10, C(0xd8d4cc), cell('conc'), 1);
    // palms round the lawn
    for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283 + 0.3; const lx = Math.cos(a) * ra * 0.78, lz = Math.sin(a) * rb * 0.72; const px = cx + lx * Math.cos(ang) - lz * Math.sin(ang), pz = cz + lx * Math.sin(ang) + lz * Math.cos(ang); palm(G, px, y + 0.3, pz, 7 + (k % 3) * 1.6, 100 + k); }
  }
  // ---- the Rascasse: the low bar-restaurant inside the corner, glazed ground floor, red awnings, a roof terrace
  function rascasse(E, G, claimed) {
    const t = E.t, sc = E.sc; const i = t.idxAtS(2905); let best = null, bd = 60;
    const stands = (t.data.scenery.grandstands || []).map(g => g.p).concat(E.standPolys || []);
    for (const b of t.data.scenery.buildings.concat(Env.decodeCity(E.data.cityFill))) { const r = cleanRing(b.p); const c = centroid(r); const d = Math.hypot(c[0] - t.x[i], c[1] - t.z[i]); const a = Math.abs(area2(r)) / 2; if (d < bd && a > 80 && a < 1500 && !stands.some(sp => r.some(q => pip(q[0], q[1], sp)))) { bd = d; best = r; } }
    if (!best) return; claimed.push(best); best = pushClear(E, best, 3.0); const c = centroid(best); E.rascasseInfo = c; const D = forced('villa', 1, 0xf2ece0, 'flat', { noBalc: true }); D.S = Object.assign({}, STY.villa, { gnd: 'mg_gnd', gh: 4.2, cornice: true }); D.nf = 1; D.H = 4.2 + 3.2;
    buildOne(E, G, best, D, 0, c); G.at(c[0], c[1], false);
    // awnings all round the ground floor
    const yA = D.yR - 3.4; const aw = offsetRing(best, -1.6);
    if (aw) for (let k = 0; k < best.length; k++) { const a = best[k], b = best[(k + 1) % best.length], A = aw[k], B = aw[(k + 1) % best.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); G.quad([B[0], yA - 0.7, B[1]], [A[0], yA - 0.7, A[1]], [a[0], yA, a[1]], [b[0], yA, b[1]], null, [0, 0, L / 3, 0, L / 3, 1, 0, 1], C(0xffffff), cell('awnred')); G.quad([b[0], yA, b[1]], [a[0], yA, a[1]], [A[0], yA - 0.7, A[1]], [B[0], yA - 0.7, B[1]], null, [0, 0, L / 3, 0, L / 3, 1, 0, 1], C(0x804040), cell('awnred')); }
  }
  // ================================================================ hillside pines and cypresses (instanced, beyond the near streets)
  function hillTrees(E) {
    const sc = E.sc, t = E.t; const rng = U.rng(4401);
    // exclusion mask: footprints (grown 2.5 m), streets, the circuit's parks (their own trees) - 4 m per pixel over +-2.8 km
    const MH = 2800, MN = 1400; const [mc, mctx] = Env.canvas(MN, MN); mctx.fillStyle = '#000'; mctx.fillRect(0, 0, MN, MN); mctx.setTransform(MN / (2 * MH), 0, 0, MN / (2 * MH), MN / 2, MN / 2);
    mctx.fillStyle = '#fff'; mctx.strokeStyle = '#fff'; mctx.lineWidth = 5; mctx.lineJoin = 'round';
    const poly = (p) => { mctx.beginPath(); p.forEach((q, i) => i ? mctx.lineTo(q[0], q[1]) : mctx.moveTo(q[0], q[1])); mctx.closePath(); mctx.fill(); mctx.stroke(); };
    for (const b of t.data.scenery.buildings) poly(b.p); for (const b of E.cityFar || []) poly(b.p); for (const w of E.allWoods || []) poly(w);
    for (const r of E.cityStreets || []) { mctx.lineWidth = r.w + 3; mctx.beginPath(); r.pts.forEach((q, i) => i ? mctx.lineTo(q[0], q[1]) : mctx.moveTo(q[0], q[1])); mctx.stroke(); }
    for (const r of E.roads || []) { mctx.lineWidth = r.w + 3; mctx.beginPath(); r.line.forEach((q, i) => i ? mctx.lineTo(q[0], q[1]) : mctx.moveTo(q[0], q[1])); mctx.stroke(); }
    const md = mctx.getImageData(0, 0, MN, MN).data; const blocked = (x, z) => { const i = Math.floor((x + MH) / (2 * MH) * MN), j = Math.floor((z + MH) / (2 * MH) * MN); if (i < 0 || j < 0 || i >= MN || j >= MN) return false; return md[(j * MN + i) * 4] > 60; };
    // land cover polygons that want woods (code 1) / scrub (2) / parks (4)
    const woods = []; for (const L of E.data.land || []) { if (L[0] !== 1 && L[0] !== 2 && L[0] !== 4) continue; const p = []; for (let i = 1; i + 1 < L.length; i += 2) p.push([L[i], L[i + 1]]); woods.push([L[0], p, U.polyBounds(p)]); }
    const inLand = (x, z) => { for (const [c, p, b] of woods) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && pip(x, z, p)) return c; return 0; };
    const pines = [], cyps = []; const S = 15; const HX = 3400;
    for (let z = -HX; z < HX; z += S) for (let x = -HX; x < HX; x += S) {
      const px = x + (rng() - 0.5) * S * 0.9, pz = z + (rng() - 0.5) * S * 0.9; const rr = rng(); if (rr > 0.75) continue;
      const r = Math.hypot(px - 300, pz + 300); if (r > 3400) continue;
      const dc = E.dcAt(px, pz); if (dc < 40) continue; if (E.isSea(px, pz)) continue;
      const g = E.groundAbs(px, pz); if (g < 2 || g > 780) continue;
      const cov = E.coverAt(px, pz); const lc = inLand(px, pz); const sl = E.slopeAt(px, pz);
      // close to the circuit only the steep unbuilt slopes get trees (the street trees and parks there are planted separately)
      if (dc < 260 && !(sl > 0.22 && cov < 0.14) && lc !== 1) continue;
      // density: woods dense, parks and gardens moderate, built-up blocks sparse, steep rock faces bare, thinning on the high ground
      let dens = lc === 1 ? 0.75 : lc === 4 ? 0.45 : lc === 2 ? 0.35 : 0.16 + 0.32 * U.smoothstep(0.55, 0.75, U.fbm(px / 160 + 5.1, pz / 160 + 1.3, 3));
      dens *= 0.72 * (1 - U.smoothstep(0.55, 0.95, sl)) * (1 - U.smoothstep(380, 700, g)); if (cov > 0.04) dens *= 0.55;
      if (rr > dens) continue; if (blocked(px, pz)) continue;
      const y = sc.height(px, pz); if (!(y > -50)) continue;
      const cyp = cov > 0.03 && rng() < 0.3 || rng() < 0.08;
      (cyp ? cyps : pines).push([px, y, pz, 0.75 + rng() * 0.6, rng() * 6.283, rng()]);
    }
    const group = sc.group; const out = [];
    const mk = (list, geo, col, name) => {
      if (!list.length) return; const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
      const inst = new THREE.InstancedMesh(geo, mat, list.length); const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), cc = new THREE.Color();
      list.forEach((a, k) => { q.setFromAxisAngle(up, a[4]); sv.set(a[3], a[3] * (0.85 + a[5] * 0.3), a[3]); pv.set(a[0], a[1] - 0.3, a[2]); m.compose(pv, q, sv); inst.setMatrixAt(k, m); cc.copy(col).multiplyScalar(0.8 + a[5] * 0.4); inst.setColorAt(k, cc); });
      inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true; Env.fitInstances(inst, 20); inst.castShadow = false; inst.receiveShadow = true; inst.name = name; group.add(inst); out.push(inst);
    };
    // umbrella pine: a bare trunk and a flat spreading canopy (vertex coloured: trunk brown, crown dark green)
    // low-poly on purpose (thousands of them, seen from far): a 3-sided trunk, two flattened octahedra for the canopy
    const blob = (sx, sy, sz, x, y, z, col) => { const g = new THREE.OctahedronGeometry(1, 0); g.scale(sx, sy, sz); g.rotateY(0.4); g.translate(x, y, z); g.userData.color = col; return g; };
    const pine = (() => { const tr = new THREE.CylinderGeometry(0.2, 0.3, 7.2, 3, 1, true); tr.translate(0, 3.6, 0); tr.userData.color = C(0x5e5040); return Env.merge([tr, blob(4.4, 1.5, 4.0, 0, 7.7, 0, C(0x3e5c2c)), blob(2.6, 1.1, 2.4, 1.7, 7.0, 0.9, C(0x34502a))]); })();
    const cyp = (() => { const g = new THREE.CylinderGeometry(0.05, 0.95, 10.5, 6, 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = (p.getY(i) + 5.25) / 10.5; const k = y < 0.5 ? 0.75 + y * 0.5 : 1 - (y - 0.5) * 1.7; const r0 = Math.hypot(p.getX(i), p.getZ(i)); if (r0 > 0.01) { const r1 = Math.max(0.05, 0.95 * Math.min(1, k)); p.setX(i, p.getX(i) / r0 * r1); p.setZ(i, p.getZ(i) / r0 * r1); } } g.computeVertexNormals(); g.translate(0, 5.6, 0); g.userData.color = C(0x2c4426); return Env.merge([g]); })();
    mk(pines, pine, new THREE.Color(1, 1, 1), 'cityPines'); mk(cyps, cyp, new THREE.Color(1, 1, 1), 'cityCypresses');
    E.stats.cityTrees = pines.length + cyps.length; return out;
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
            G.at(pm[0], pm[1], true); const nn = [-nx * sd, 0, -nz * sd]; const u = (k * 7 + j) * 2.6;
            G.quad([q0[0], y0, q0[1]], [q1[0], y1, q1[1]], [q1[0], t1, q1[1]], [q0[0], t0, q0[1]], nn, [u, 0, u + L / steps / 2.6, 0, u + L / steps / 2.6, (t1 - y1) / 2.6, u, (t0 - y0) / 2.6], col, stC);
            const r0 = [q0[0] + nx * sd * 0.45, q0[1] + nz * sd * 0.45], r1 = [q1[0] + nx * sd * 0.45, q1[1] + nz * sd * 0.45];
            G.quad([q0[0], t0, q0[1]], [q1[0], t1, q1[1]], [r1[0], t1, r1[1]], [r0[0], t0, r0[1]], [0, 1, 0], [0, 0, 1, 0, 1, 0.1, 0, 0.1], capCol, capC); n++;
          }
        }
      }
    }
    E.stats.streetWalls = n;
  }
  City.extras = function (E, G) { pool(E, G); hairpin(E, G); casinoGarden(E, G); streetWalls(E, G); };

  // ================================================================ build
  City.build = function (E) {
    const T0 = performance.now(); const sc = E.sc, t = E.t; const G = new Geo(); const mat = cityMaterial();
    const lm = E.data.landmarks || {};
    E.cityZones = { casino: lm.fountain ? centroid(lm.fountain) : [504, -485], devote: lm.devoteChapel ? centroid(lm.devoteChapel) : [0, -230] };
    const claimed = [];   // landmark footprints: the generic builder leaves them alone
    if (City.landmarks) City.landmarks(E, G, claimed);
    rascasse(E, G, claimed);
    const isClaimed = (x, z) => { for (const p of claimed) if (pip(x, z, p)) return true; return false; };
    const stats = { near: 0, mid: 0, far: 0, skipped: 0 };
    const doOne = (b, farSet) => {
      if (b.p.length < 3) return; const ring = cleanRing(b.p); if (ring.length < 3) return; const area = Math.abs(area2(ring)) / 2; if (area < 25) { stats.skipped++; return; }
      const [cx, cz] = centroid(ring); if (isClaimed(cx, cz)) return;
      for (let i = 0; i < ring.length; i++) if (!segClear(E, ring[i], ring[(i + 1) % ring.length], 0.5)) { stats.skipped++; return; }
      const dc = E.dcAt(cx, cz); const detail = farSet ? (dc < 700 ? 1 : 2) : (dc < 140 ? 0 : 1);
      const D = design(E, b, cx, cz, area, !farSet);
      buildOne(E, G, ring, D, detail, [cx, cz]); stats[detail === 0 ? 'near' : detail === 1 ? 'mid' : 'far']++;
    };
    for (const b of t.data.scenery.buildings) doOne(b, false);
    // the near ring's footprints the circuit data left out: kept when they clear the barriers, stands, pit lane and tunnel
    const stands = (t.data.scenery.grandstands || []).map(g => g.p).concat(E.standPolys || []); const pit = t.data.pit || []; const TD = t.data.tunnel;
    for (const b of Env.decodeCity(E.data.cityFill)) {
      let ok = true; const pr = {};
      for (const q of b.p) {
        if (!clear(E, q[0], q[1], 1.0)) { ok = false; break; }
        for (const sp of stands) if (pip(q[0], q[1], sp)) { ok = false; break; } if (!ok) break;
        for (let k = 0; k + 1 < pit.length; k++) if (Env.segDist(q[0], q[1], pit[k][0], pit[k][1], pit[k + 1][0], pit[k + 1][1]) < 13) { ok = false; break; } if (!ok) break;
        if (E.paddock && pip(q[0], q[1], E.paddock)) { ok = false; break; }
        if (TD) { t.project(q[0], q[1], null, pr); if (pr.s > TD.s0 - 15 && pr.s < TD.s1 + 15 && pr.dist < Math.max(t.wallL[pr.i], t.wallR[pr.i]) + 3) { ok = false; break; } }
      }
      if (ok) { const c = centroid(b.p); if (!E.isSea(c[0], c[1])) { doOne(b, false); stats.fill = (stats.fill || 0) + 1; } }
    }
    for (const b of E.cityFar || []) doOne(b, true);
    pavements(E, G);
    if (City.extras) City.extras(E, G);
    const meshes = G.meshes(mat, sc.group, 'city');
    sc.cityTrees = hillTrees(E);
    sc.cityChunks = meshes; sc.cityMat = mat;
    stats.tris = meshes.reduce((a, m) => a + m.geometry.index.count / 3, 0); stats.chunks = meshes.length; stats.ms = Math.round(performance.now() - T0);
    sc.cityStats = stats; E.stats.city = stats;
    if (EI.ENV_LOG || EI.CITY_LOG) console.log('CITY ' + JSON.stringify(stats));
  };
})();
