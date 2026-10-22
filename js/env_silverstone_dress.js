// Equation I - Silverstone trackside dressing (SILVERSTONE-DRESS). Hooks into the venue build only when the track is Silverstone and reads the
// lists of js/data/silverstone_dress.js (EI.ENVDATA.silverstone.dress). Marshal posts, TecPro / tyre walls and the catch fence are DATA on the
// shared infra / track passes (silverstone_dress.js); this file adds what has no shared pass:
//  * general-admission banks (photos 025 / 030 / 035 / 037): earth banks with a worn-grass toe, a crowd-mottled slope, standing fans on
//    cards up the slope, a low pedestrian barrier along the toe and a few flags. Four draws for all the banks (slope, fans, barrier, flags);
//    every segment is checked against the occupancy grid, so a bank only stands where the ground behind the fence is free;
//  * hospitality villages (photos 031 / 099): white two-storey terraces with dark glazing, awnings and white parasols, merged statics;
//  * the camping fields in the distance: instanced ridge and dome tents (one draw each) in free fields 400-1100 m out;
//  * the Northamptonshire farmland (photos 040 / 041 / 051): hawthorn hedgerows outside the perimeter fence, round bales in the cut fields,
//    farm barns, a village church spire, tree belts behind the banks.
// Everything is built once at load (no per-frame work), merged into the lap-wide statics or instanced; nothing stands inside the barriers
// or on a road, and every base follows the drawn ground (E.ground) so nothing floats.
window.EI = window.EI || {};
(function () {
  const U = EI.U, Env = EI.Env; if (!Env) return;
  const C = (h) => new THREE.Color(h).convertSRGBToLinear();
  const off = typeof location !== 'undefined' && /[?&]nodress=1/.test(location.search || '');   // (before / after shots: ?nodress=1 leaves the dressing out)
  const isSil = (t) => !off && !!(t && t.data && t.data.id === 'silverstone');
  const SD = EI.EnvSilverstoneDress = { isSil };
  const OCC = Env.OCC;

  // point along the lap: s, side (+1 left), metres from the centre line; frame +z away from the track
  function mkPt(E) {
    const t = E.t;
    return (s, side, d) => { const i = t.idxAtS(U.mod(s, t.length)); const x = t.x[i] + t.nx[i] * side * d, z = t.z[i] + t.nz[i] * side * d; return { x, z, tx: t.tx[i], tz: t.tz[i], nx: t.nx[i] * side, nz: t.nz[i] * side, i }; };
  }
  // is (x, z) outside the lap loop (the infield is the estate's own ground: no farms or camping fields there)
  function mkOutside(E) {
    const t = E.t, poly = []; for (let sv = 0; sv < t.length; sv += 40) { const i = t.idxAtS(sv); poly.push([t.x[i], t.z[i]]); }
    return (x, z) => !U.pointInPoly(x, z, poly);
  }
  const SOLID = OCC.ROAD | OCC.BUILT | OCC.WATER | OCC.PARK | OCC.WOOD | OCC.KEEP;

  // ================================================================ textures
  // ONE atlas (2048 x 512, wraps along u) for everything on a bank, so all the banks are one mesh / one draw:
  //   y   0..160  a standing crowd, three staggered layers (35.2 m x 2.75 m): shirts in team colours with hi-vis yellow and papaya orange, caps, raised arms, flags
  //   y 162..226  low pedestrian barrier panels (galvanised frame and vertical bars)
  //   y 232..484  the bank's surface: worn grass at the toe, then the packed crowd seen from above and the side (dots of shirts, hair and caps), grass behind the crest
  //   y 488..512  flag colour swatches
  const AT = { W: 2048, H: 512, cardY0: 0, cardY1: 158, herY0: 166, herY1: 224, surfY0: 236, surfY1: 482, flagY: 500 };
  const atlasV = (y) => 1 - y / AT.H;
  function atlasTexture() {
    const W = AT.W, H = AT.H; const [c, g] = Env.canvas(W, H); g.clearRect(0, 0, W, H); const r = U.rng(8128), CH = 160;
    const shirts = ['#e6e6e2', '#e6e6e2', '#d8d8d2', '#1c2a44', '#24262c', '#2c2f36', '#8e1f2c', '#a8322c', '#c8641c', '#d8d200', '#c9d03a', '#2a3b66', '#6e7a86', '#a6a198', '#7a6a58', '#3a5a40', '#6d8fb8', '#5c1e30', '#3b4a5a'];
    const skins = ['#f1c7a5', '#e0ac87', '#c68a62', '#8d5a3b', '#f5d3b8', '#d9a07a'], hairs = ['#2a1d14', '#4b3020', '#141414', '#a07a4a', '#d9b46a', '#8a8a8a'], trou = ['#2b3a55', '#1d1f24', '#6b6250', '#34445e', '#4a4d52'];
    const shade = (hex, k) => { const q = new THREE.Color(hex); return 'rgb(' + Math.min(255, q.r * 255 * k | 0) + ',' + Math.min(255, q.g * 255 * k | 0) + ',' + Math.min(255, q.b * 255 * k | 0) + ')'; };
    const person = (x, base, k, hi) => {
      const sh = shirts[Math.floor(r() * shirts.length)], skin = skins[Math.floor(r() * skins.length)], hair = hairs[Math.floor(r() * hairs.length)];
      const s = 0.9 + r() * 0.2; const top = base - 138 * s;
      g.fillStyle = shade(trou[Math.floor(r() * trou.length)], k); g.fillRect(x - 12 * s, base - 48 * s, 24 * s, 48 * s);
      g.fillStyle = shade(sh, k); g.beginPath(); g.moveTo(x - 17 * s, base - 46 * s); g.lineTo(x - 19 * s, top + 36 * s); g.quadraticCurveTo(x - 19 * s, top + 26 * s, x - 9 * s, top + 25 * s); g.lineTo(x + 9 * s, top + 25 * s);
      g.quadraticCurveTo(x + 19 * s, top + 26 * s, x + 19 * s, top + 36 * s); g.lineTo(x + 17 * s, base - 46 * s); g.closePath(); g.fill();
      const up = r();   // arms: down / one up / both up
      g.strokeStyle = shade(sh, k * 0.92); g.lineWidth = 8 * s; g.lineCap = 'round';
      if (up < 0.22) { g.beginPath(); g.moveTo(x + 17 * s, top + 40 * s); g.lineTo(x + 26 * s, top + 8 * s); g.stroke(); g.fillStyle = shade(skin, k); g.beginPath(); g.arc(x + 26 * s, top + 4 * s, 4.5 * s, 0, 6.283); g.fill(); }
      else if (up < 0.30) { for (const d of [-1, 1]) { g.beginPath(); g.moveTo(x + d * 17 * s, top + 40 * s); g.lineTo(x + d * 25 * s, top + 6 * s); g.stroke(); g.fillStyle = shade(skin, k); g.beginPath(); g.arc(x + d * 25 * s, top + 2 * s, 4.5 * s, 0, 6.283); g.fill(); } }
      else { for (const d of [-1, 1]) { g.beginPath(); g.moveTo(x + d * 18 * s, top + 40 * s); g.lineTo(x + d * 21 * s, top + 84 * s); g.stroke(); } }
      g.fillStyle = shade(skin, k); g.fillRect(x - 4 * s, top + 17 * s, 8 * s, 10 * s); g.beginPath(); g.ellipse(x, top + 11 * s, 8.5 * s, 10.5 * s, 0, 0, 6.283); g.fill();
      if (r() < 0.38) { g.fillStyle = shade(shirts[Math.floor(r() * shirts.length)], k); g.beginPath(); g.ellipse(x, top + 5 * s, 9 * s, 6.5 * s, 0, Math.PI, 0); g.fill(); g.fillRect(x - 9 * s, top + 4 * s, 18 * s, 3 * s); }
      else { g.fillStyle = shade(hair, k); g.beginPath(); g.ellipse(x, top + 6 * s, 8.8 * s, 7 * s, 0, Math.PI, 0); g.fill(); }
      if (hi && r() < 0.35) { g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(x - 16 * s, base - 78 * s, 32 * s, 4 * s); }
      if (r() < 0.07) { const fy = top - 8 * s; g.strokeStyle = shade('#6b5a44', k); g.lineWidth = 3 * s; g.beginPath(); g.moveTo(x + 22 * s, top + 40 * s); g.lineTo(x + 22 * s, fy - 12 * s); g.stroke(); const fc = r() < 0.5; g.fillStyle = fc ? '#f4f4f2' : '#012169'; g.fillRect(x + 22 * s, fy - 12 * s, 30 * s, 19 * s); if (fc) { g.fillStyle = '#c8102e'; g.fillRect(x + 22 * s, fy - 5 * s, 30 * s, 5 * s); g.fillRect(x + 34 * s, fy - 12 * s, 5 * s, 19 * s); } }
    };
    g.save(); g.beginPath(); g.rect(0, 0, W, AT.cardY1); g.clip();
    [[18, 0.72, 34], [9, 0.86, 32], [0, 1.0, 30]].forEach(([off, k, step], li) => {
      for (let x = -30 + r() * 12; x < W + 30; x += step + r() * 8) { const base = AT.cardY1 - off + (r() - 0.5) * 3; for (const ox of [0, -W, W]) if (x + ox > -40 && x + ox < W + 40) person(x + ox, base, k, li === 2); }
    });
    g.restore();
    // pedestrian barrier: 5 panels of 3.5 m across the strip? one panel per 256 px (3.5 m): frame, bars, a mid rail
    g.strokeStyle = 'rgba(176,182,188,1)';
    for (let x0 = 0; x0 < W; x0 += 256) { const y0 = AT.herY0, h = AT.herY1 - AT.herY0; g.lineWidth = 3; g.strokeRect(x0 + 2, y0 + 2, 252, h - 4); g.lineWidth = 1.6; for (let x = x0 + 18; x < x0 + 256; x += 14) { g.beginPath(); g.moveTo(x, y0 + 4); g.lineTo(x, y0 + h - 4); g.stroke(); } g.lineWidth = 2.4; g.beginPath(); g.moveTo(x0 + 2, y0 + h / 2); g.lineTo(x0 + 254, y0 + h / 2); g.stroke(); }
    // surface
    const sy0 = AT.surfY0, sh = AT.surfY1 - AT.surfY0; const Y = (f) => sy0 + f * sh;
    const grass = (y0, y1, a, b) => { for (let y = y0; y < y1; y += 1) { g.fillStyle = r() < 0.5 ? a : b; g.fillRect(0, y, W, 1); } for (let i = 0; i < (y1 - y0) * 30; i++) { g.fillStyle = r() < 0.5 ? a : b; g.fillRect(r() * W, y0 + r() * (y1 - y0), 6 + r() * 14, 1 + r() * 2); } };
    g.fillStyle = '#4b4a40'; g.fillRect(0, sy0 - 4, W, sh + 8);
    grass(sy0 - 4, Y(0.07), '#8f8a54', '#7d8248'); grass(Y(0.86), sy0 + sh + 4, '#6c7a3e', '#5e6e36');
    const skins2 = ['#f1c7a5', '#e0ac87', '#c68a62', '#8d5a3b', '#d9a07a'];
    for (let i = 0; i < 17000; i++) {
      const x = r() * W, y = Y(0.07) + r() * (Y(0.86) - Y(0.07)); const rx = 8 + r() * 6, ry = 2 + r() * 1.3; const sh2 = shirts[Math.floor(r() * shirts.length)];
      for (const ox of [0, -W, W]) { if (x + ox < -16 || x + ox > W + 16) continue; g.fillStyle = sh2; g.beginPath(); g.ellipse(x + ox, y, rx, ry, 0, 0, 6.283); g.fill(); g.fillStyle = r() < 0.4 ? skins2[Math.floor(r() * skins2.length)] : ['#2a1d14', '#4b3020', '#141414', '#a07a4a'][Math.floor(r() * 4)]; g.beginPath(); g.ellipse(x + ox, y - ry * 0.6, rx * 0.45, ry * 0.7, 0, 0, 6.283); g.fill(); }
    }
    // flag swatches: white, red, navy, orange, yellow, green, pole grey, dark
    ['#f4f4f2', '#c8102e', '#1a3a8a', '#ff8000', '#f4e400', '#3a8a3a', '#6a6a68', '#2a2a2a'].forEach((col, k) => { g.fillStyle = col; g.fillRect(k * 256, AT.flagY - 8, 256, 20); });
    const tex = Env.cutout(c, { repeat: true, aniso: 8 }); tex.wrapT = THREE.ClampToEdgeWrapping; return tex;
  }

  // ================================================================ general-admission banks (one mesh, one draw)
  SD.banks = function (E, D) {
    const t = E.t, sc = E.sc, P = mkPt(E), rng = U.rng(5252); const list = D.banks || []; if (!list.length) return;
    const M = { p: [], n: [], uv: [], c: [], i: [] }; const trees = [];
    const FR = [0, 0.12, 0.3, 0.5, 0.7, 0.82, 1.0];
    const ROWS = [0.08, 0.24, 0.42, 0.6];   // fraction of the depth: the standing fans
    const hprof = (f, H) => (f <= 0.8 ? H * Math.pow(f / 0.8, 1.12) : H * Math.max(0, 1 - (f - 0.8) / 0.2));
    const STEP = 3;   // lap samples (~6 m)
    const vS = (f) => atlasV(AT.surfY0 + f * (AT.surfY1 - AT.surfY0));
    const U1 = 35.2;
    const push = (x, y, z, nx, ny, nz, u, v, cr, cg, cb) => { M.p.push(x, y, z); M.n.push(nx, ny, nz); M.uv.push(u, v); M.c.push(cr, cg, cb); return M.p.length / 3 - 1; };
    let nSt = 0, nRuns = 0, len = 0, nFlag = 0; const runLog = [];
    for (const [s0, s1, side, gap, H, depth] of list) {
      const i0 = t.idxAtS(s0), i1 = t.idxAtS(s1); const n = t.n; const cnt = ((i1 - i0 + n) % n);
      // stations: accepted when the footprint of the segment ahead is free, the toe stays clear of the barrier and the inside of a bend does not fold over
      const runs = []; let run = [];
      const flush = () => { if (run.length >= 9) runs.push(run); run = []; };
      for (let k = 0; k <= cnt; k += STEP) {
        const i = (i0 + k) % n; const s = t.s[i]; const kf = t.kFold ? t.kFold[i] : 0;
        const d0 = E.wallCap(i, side) + gap; const dm = d0 + depth / 2; const inside = (kf > 0 && side > 0) || (kf < 0 && side < 0);
        let ok = true;
        if (inside && (d0 + depth) * Math.abs(kf) > 0.55) ok = false;
        if (ok) { const p = P(s, side, dm); const q = P(t.s[(i + STEP) % n], side, dm); const Ls = Math.hypot(q.x - p.x, q.z - p.z) || 1;
          if (E.rectFree((p.x + q.x) / 2, (p.z + q.z) / 2, (q.x - p.x) / Ls, (q.z - p.z) / Ls, Ls / 2 + 2.5, depth / 2 + 1, SOLID, 6) < 0.99) ok = false; }
        if (ok) run.push(i); else flush();
      }
      flush();
      for (const rn of runs) {
        nRuns++; const S = rn.length; const st = [];   // per station: toe point, arc
        let arc = 0, last = null;
        for (let a = 0; a < S; a++) { const i = rn[a]; const p0 = P(t.s[i], side, E.wallCap(i, side) + gap); if (last) arc += Math.hypot(p0.x - last.x, p0.z - last.z); last = p0; st.push({ p0, arc, tint: 0.9 + 0.14 * U.noise2(arc / 18 + 3.1, side * 5.5 + t.s[i] * 0.013) }); }
        // surface grid
        const base = M.p.length / 3; const G = [];
        for (let a = 0; a < S; a++) {
          const { p0, arc: ar, tint } = st[a]; const col = [];
          for (let k = 0; k < FR.length; k++) {
            const u = FR[k] * depth; const x = p0.x + p0.nx * u, z = p0.z + p0.nz * u; const y = E.ground(x, z) + hprof(FR[k], H) - (k === 0 || k === FR.length - 1 ? 0.07 : 0);
            push(x, y, z, 0, 1, 0, ar / U1, vS(FR[k]), tint, tint, tint); col.push([x, y, z]);
          }
          G.push(col);
        }
        for (let a = 0; a + 1 < S; a++) for (let k = 0; k + 1 < FR.length; k++) { const q0 = base + a * FR.length + k, q1 = q0 + FR.length, q2 = q1 + 1, q3 = q0 + 1; M.i.push(q0, q3, q2, q0, q2, q1); }
        for (let a = 0; a < S; a++) for (let k = 0; k < FR.length; k++) {
          const A = G[Math.max(0, a - 1)][k], B = G[Math.min(S - 1, a + 1)][k], Cc = G[a][Math.max(0, k - 1)], Dd = G[a][Math.min(FR.length - 1, k + 1)];
          const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = Dd[0] - Cc[0], vy = Dd[1] - Cc[1], vz = Dd[2] - Cc[2];
          let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; } const o = (base + a * FR.length + k) * 3; M.n[o] = nx / l; M.n[o + 1] = ny / l; M.n[o + 2] = nz / l;
        }
        // end caps: skirts down to the ground (a closed earth bank, not a folded sheet)
        for (const a of [0, S - 1]) for (let k = 0; k + 1 < FR.length; k++) {
          const A = G[a][k], B = G[a][k + 1]; const gA = E.ground(A[0], A[2]) - 0.35, gB = E.ground(B[0], B[2]) - 0.35; const vv = vS(0.95);
          const b0 = push(A[0], A[1], A[2], 0, 0.3, 0, 0.1, vv, 0.55, 0.58, 0.5); push(B[0], B[1], B[2], 0, 0.3, 0, 0.1, vv, 0.55, 0.58, 0.5); push(B[0], gB, B[2], 0, 0.3, 0, 0.1, vv, 0.55, 0.58, 0.5); push(A[0], gA, A[2], 0, 0.3, 0, 0.1, vv, 0.55, 0.58, 0.5);
          M.i.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3, b0, b0 + 2, b0 + 1, b0, b0 + 3, b0 + 2);
        }
        // standing fans on cards, one row per fraction of the depth (the card stands on the slope at its row)
        const vF = atlasV(AT.cardY1 - 1), vT = atlasV(AT.cardY0 + 1);
        ROWS.forEach((f, ri) => {
          const off = rng(); const shd = 0.9 - ri * 0.05; let b0 = -1;
          for (let a = 0; a < S; a++) {
            const i = rn[a]; const p0 = P(t.s[i], side, E.wallCap(i, side) + gap + f * depth); const gy = E.ground(p0.x, p0.z) + hprof(f, H) - 0.05;
            const nx = -p0.nx * 0.55, nz = -p0.nz * 0.55; const nl = Math.hypot(nx, 0.8, nz); const uu = st[a].arc / U1 + off;
            const q = push(p0.x, gy, p0.z, nx / nl, 0.8 / nl, nz / nl, uu, vF, shd, shd, shd); push(p0.x, gy + 2.1, p0.z, nx / nl, 0.8 / nl, nz / nl, uu, vT, shd, shd, shd); if (b0 < 0) b0 = q;
          }
          for (let a = 0; a + 1 < S; a++) { const q0 = b0 + a * 2; M.i.push(q0, q0 + 2, q0 + 3, q0, q0 + 3, q0 + 1); }
        });
        // pedestrian barrier along the toe (one 3.5 m panel per 256 px of the atlas: u in 1/8 steps)
        { const vh0 = atlasV(AT.herY1), vh1 = atlasV(AT.herY0); let b0 = -1;
          for (let a = 0; a < S; a++) { const i = rn[a]; const p0 = P(t.s[i], side, E.wallCap(i, side) + gap - 0.8); const gy = E.ground(p0.x, p0.z); const uu = st[a].arc / 3.5 / 8;
            const q = push(p0.x, gy - 0.05, p0.z, -p0.nx, 0.1, -p0.nz, uu, vh0, 1, 1, 1); push(p0.x, gy + 1.25, p0.z, -p0.nx, 0.1, -p0.nz, uu, vh1, 1, 1, 1); if (b0 < 0) b0 = q; }
          for (let a = 0; a + 1 < S; a++) { const q0 = b0 + a * 2; M.i.push(q0, q0 + 2, q0 + 3, q0, q0 + 3, q0 + 1); } }
        // flags: on the rows, one per ~25 m (a pole and a cloth, both flat quads facing the track; colour from the swatch strip)
        for (let a = 0; a < S; a += 4) { if (rng() < 0.45) continue; const i = rn[a]; const f = ROWS[1 + Math.floor(rng() * 3)]; const p0 = P(t.s[i], side, E.wallCap(i, side) + gap + f * depth + (rng() - 0.5) * 2); const gy = E.ground(p0.x, p0.z) + hprof(f, H) - 0.05;
          const sw = (k) => (k + 0.5) / 8, vv = atlasV(AT.flagY + 2); const fh = 3.2 + rng() * 0.5, fw = 0.95; const nn = [-p0.nx, 0.15, -p0.nz]; const tx = p0.tx, tz = p0.tz; const c0 = Math.floor(rng() * 6);
          for (const [x0, x1, y0, y1, k] of [[-0.03, 0.03, 0, fh, 6], [0.03, 0.03 + fw, fh - 0.75, fh, c0]]) { const q = push(p0.x + tx * x0, gy + y0, p0.z + tz * x0, nn[0], nn[1], nn[2], sw(k), vv, 1, 1, 1); push(p0.x + tx * x1, gy + y0, p0.z + tz * x1, nn[0], nn[1], nn[2], sw(k), vv, 1, 1, 1); push(p0.x + tx * x1, gy + y1, p0.z + tz * x1, nn[0], nn[1], nn[2], sw(k), vv, 1, 1, 1); push(p0.x + tx * x0, gy + y1, p0.z + tz * x0, nn[0], nn[1], nn[2], sw(k), vv, 1, 1, 1); M.i.push(q, q + 1, q + 2, q, q + 2, q + 3); }
          nFlag++; }
        // the footprint is taken: no trees or marquees here; a tree belt stands behind the crest
        for (let a = 0; a + 1 < S; a += 2) { const i = rn[a], j = rn[Math.min(S - 1, a + 2)]; const d0 = E.wallCap(i, side) + gap; const p = P(t.s[i], side, d0 + depth / 2); const q = P(t.s[j], side, d0 + depth / 2); const ln = Math.hypot(q.x - p.x, q.z - p.z) || 1; E.markRect((p.x + q.x) / 2, (p.z + q.z) / 2, (q.x - p.x) / ln, (q.z - p.z) / ln, ln / 2 + 1, depth / 2 + 2, OCC.BUILT); }
        for (let a = 0; a + 5 < S; a += 6) { const i = rn[a], j = rn[a + 5]; const d0 = E.wallCap(i, side) + gap + depth + 16; const p = P(t.s[i], side, d0), q = P(t.s[j], side, d0); trees.push([p.x, p.z, q.x, q.z]); }
        nSt += S; len += S * t.ds * STEP; runLog.push([Math.round(t.s[rn[0]]), Math.round(t.s[rn[S - 1]]), side, depth]);
      }
    }
    E.stats.banks = { runs: nRuns, stations: nSt, metres: Math.round(len), flags: nFlag, belts: trees.length, at: runLog };
    if (!M.p.length) return;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(M.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(M.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(M.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(M.c, 3)); g.setIndex(M.i); g.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({ map: atlasTexture(), vertexColors: true, alphaTest: 0.5, roughness: 0.93, metalness: 0, side: THREE.DoubleSide }); mat.onBeforeCompile = Env.noFlip; mat.customProgramCacheKey = () => 'sil-bank-atlas';
    const mesh = new THREE.Mesh(g, mat); mesh.name = 'slBank'; mesh.castShadow = false; mesh.receiveShadow = false; sc.group.add(mesh); E.stats.banks.tris = M.i.length / 3;
    // tree belts behind the banks (Veg.build plants the lines: English oaks, and the tree-line strips beyond the billboard range)
    E.treeLines = E.treeLines || []; for (const l of trees) E.treeLines.push(l);
  };

  // ================================================================ hospitality villages
  SD.hospitality = function (E, D) {
    const sc = E.sc, P = mkPt(E), rng = U.rng(3030); const list = D.hospitality || []; if (!list.length) return;
    const Bm = new Env.Builder(), Bd = new Env.Builder(); let placed = 0; const hlog = [];
    const white = C(0xe9eae8), whiteB = C(0xdadcda), glass = C(0x34485c), glassB = C(0x415a74), roof = C(0xb6babd), roofB = C(0x9fa4a8), deck = C(0xc4c6c4), rail = C(0xdfe1e0);
    const awn = [C(0xf4f4f2), C(0x1c2f58), C(0xf4f4f2), C(0xb11a2a)];
    for (const [s, side, off, units] of list) {
      let nPlaced = 0;
      for (let u = 0; u < units * 4 && nPlaced < units; u++) {
        const row = u % 2; const ds = (Math.floor(u / 2) - units / 2) * 62 + (rng() - 0.5) * 8; const p = P(s + ds, side, E.wallCap(E.t.idxAtS(U.mod(s + ds, E.t.length)), side) + off + row * 38);
        const L = 38 + rng() * 22, Dp = 13.5; const cx = p.x + p.nx * Dp / 2, cz = p.z + p.nz * Dp / 2;
        if (E.fAt(cx, cz) < 60 || E.rectFree(cx, cz, p.tx, p.tz, L / 2 + 3, Dp / 2 + 3, SOLID, 40) < 0.99) continue;
        const gy = Math.min(E.ground(cx, cz), E.ground(cx + p.tx * L / 2, cz + p.tz * L / 2), E.ground(cx - p.tx * L / 2, cz - p.tz * L / 2), E.ground(cx + p.nx * Dp / 2, cz + p.nz * Dp / 2), E.ground(cx - p.nx * Dp / 2, cz - p.nz * Dp / 2)) - 0.06;
        const m = Env.frame(cx, gy, cz, p.tx, p.tz, p.nx, p.nz); const Pp = (x, y, z) => Env.xf(m, x, y, z);
        // z: away from the track; the front (track side) is -z. Two floors, glazing bands, a flat roof with plant boxes
        Bm.box(m, L, 3.5, Dp, 0, 0, 0, white); Bm.box(m, L + 0.08, 2.0, Dp + 0.08, 0, 0.65, 0, glass);
        Bm.box(m, L - 1.2, 3.3, Dp - 1.6, 0, 3.5, 0.4, whiteB); Bm.box(m, L - 1.1, 1.9, Dp - 1.5, 0, 3.95, 0.4, glassB);
        Bm.box(m, L + 0.7, 0.4, Dp + 0.7, 0, 6.8, 0, roof, { top: roofB, bottom: true }); Bm.box(m, L + 0.7, 0.4, Dp + 0.7, 0, 3.4, -0.4, deck);
        for (let x = -L / 2 + 3; x < L / 2 - 3; x += 6.5) Bm.box(m, 2.4, 0.9, 2.0, x + (rng() - 0.5) * 2, 7.2, (rng() - 0.5) * 3, roofB);
        // balcony rail along the first floor front, awnings over the ground floor, white parasols on the terrace
        Bd.box(m, L + 0.6, 0.9, 0.06, 0, 3.8, -Dp / 2 - 0.3, rail);
        for (let x = -L / 2 + 1; x < L / 2 - 4; x += 4) { const ac = awn[Math.floor(rng() * awn.length)], x2 = x + 3.8; Bd.quad(Pp(x, 3.3, -Dp / 2), Pp(x2, 3.3, -Dp / 2), Pp(x2, 2.7, -Dp / 2 - 1.8), Pp(x, 2.7, -Dp / 2 - 1.8), ac); Bd.quad(Pp(x, 2.7, -Dp / 2 - 1.8), Pp(x2, 2.7, -Dp / 2 - 1.8), Pp(x2, 3.3, -Dp / 2), Pp(x, 3.3, -Dp / 2), ac); }
        for (let x = -L / 2 + 3; x < L / 2 - 2; x += 5.5) { const z = -Dp / 2 - 4.2 - rng() * 2; const px = x + (rng() - 0.5) * 1.5; Bd.beam(m, [px, 0, z], [px, 2.5, z], 0.06, rail); const k = 10; const apex = Pp(px, 3.0, z); const pcol = C(rng() < 0.7 ? 0xf6f6f4 : 0xeadfc8); for (let q = 0; q < k; q++) { const a0 = q / k * 6.283, a1 = (q + 1) / k * 6.283; const pa = Pp(px + Math.cos(a0) * 1.9, 2.4, z + Math.sin(a0) * 1.9), pb = Pp(px + Math.cos(a1) * 1.9, 2.4, z + Math.sin(a1) * 1.9), pc = pcol; Bd.tri(apex, pb, pa, pc); Bd.tri(apex, pa, pb, pc); } }
        E.markRect(cx - p.nx * 6, cz - p.nz * 6, p.tx, p.tz, L / 2 + 5, Dp / 2 + 9, OCC.BUILT); placed++; nPlaced++; hlog.push([Math.round(cx), Math.round(cz)]);
      }
    }
    sc.statics.add(Bm.geometry(), 0.6, 0.08, 'main'); sc.statics.add(Bd.geometry(), 0.7, 0.05, 'clutter');
    E.stats.hospVillage = placed; E.stats.hospAt = hlog;
  };

  // ================================================================ the camping fields in the distance
  SD.camps = function (E, D) {
    const sc = E.sc, P = mkPt(E), rng = U.rng(6161), t = E.t, outside = mkOutside(E); const cf = D.camps; if (!cf) return;
    const sites = []; const tcols = [0x3b5f8a, 0x4a7a4a, 0xb4642a, 0xc9b24a, 0x8e3a36, 0x6c757d, 0x2a3f5f, 0x6a5a82, 0xdcdcd6, 0xdcdcd6, 0xdcdcd6, 0x4a8a82, 0x5c6a3a, 0x3a3f46];
    for (let k = 0; k < 900 && sites.length < cf.fields; k++) {
      const s = rng() * t.length, side = rng() < 0.6 ? 1 : -1; const i = t.idxAtS(s); const d = E.wallCap(i, side) + cf.near + rng() * (cf.far - cf.near);
      const p = P(s, side, d); const ang = rng() * Math.PI; const ax = Math.cos(ang), az = Math.sin(ang); const hl = 50 + rng() * 14, hd = 32 + rng() * 8;
      if (Math.abs(p.x) > 1650 || Math.abs(p.z) > 1650) continue; const f = E.fAt(p.x, p.z); if (f < cf.near * 0.85 || f > cf.far * 1.1) continue;
      if (!outside(p.x, p.z)) continue;
      if (E.rectFree(p.x, p.z, ax, az, hl + 6, hd + 6, SOLID, cf.near * 0.7) < 0.99) continue;
      let lo = 1e9, hi = -1e9; for (const [a, b] of [[-hl, -hd], [hl, -hd], [hl, hd], [-hl, hd], [0, 0]]) { const y = E.ground(p.x + ax * a - az * b, p.z + az * a + ax * b); lo = Math.min(lo, y); hi = Math.max(hi, y); } if (hi - lo > 1.6) continue;
      if (sites.some(q => Math.hypot(q.x - p.x, q.z - p.z) < 160)) continue;
      sites.push({ x: p.x, z: p.z, ax, az, hl, hd }); E.markRect(p.x, p.z, ax, az, hl + 4, hd + 4, OCC.PARK);
    }
    const tents = [], vans = new Env.Builder(); const blocks = new Env.Builder();
    for (const c of sites) {
      c.flip = rng() < 0.5 ? 0 : Math.PI / 2;
      // rows of tents with a track between; a toilet block and a few caravans at one end
      for (let a = -c.hl + 4; a < c.hl - 3; a += 5.2) for (let b = -c.hd + 4; b < c.hd - 3; b += 6.4) {
        if (rng() < 0.2 || (Math.abs(b) < 2.4)) continue; const jx = (rng() - 0.5) * 1.6, jz = (rng() - 0.5) * 1.8; const x = c.x + c.ax * (a + jx) - c.az * (b + jz), z = c.z + c.az * (a + jx) + c.ax * (b + jz);
        tents.push([x, z, Math.atan2(-c.az, c.ax) + c.flip + (rng() - 0.5) * 0.16, rng() < 0.62 ? 0 : 1, 0.85 + rng() * 0.5, Math.floor(rng() * tcols.length)]);
      }
      const m = Env.frame(c.x - c.ax * (c.hl - 3), E.ground(c.x - c.ax * (c.hl - 3), c.z - c.az * (c.hl - 3)) - 0.05, c.z - c.az * (c.hl - 3), c.ax, c.az, -c.az, c.ax);
      blocks.box(m, 9, 2.6, 3.4, 0, 0, 0, C(0xd8dadb), { top: C(0xb8bcbf) }); blocks.box(m, 9.1, 0.5, 3.5, 0, 2.0, 0, C(0x3a6a8a));
    }
    // one tent shape (a ridge tent, 6 tris) in one instanced draw: colour, length and height vary per instance
    const ridge = new Env.Builder(); const w1 = new THREE.Color(1, 1, 1), w2 = new THREE.Color(0.72, 0.72, 0.72);
    ridge.quad([-1.2, 0, -1.6], [-1.2, 0, 1.6], [0, 1.4, 1.6], [0, 1.4, -1.6], w1); ridge.quad([1.2, 0, 1.6], [1.2, 0, -1.6], [0, 1.4, -1.6], [0, 1.4, 1.6], w2); ridge.tri([-1.2, 0, 1.6], [1.2, 0, 1.6], [0, 1.4, 1.6], w2); ridge.tri([1.2, 0, -1.6], [-1.2, 0, -1.6], [0, 1.4, -1.6], w2);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    if (tents.length) {
      const inst = new THREE.InstancedMesh(ridge.geometry(), mat, tents.length);
      tents.forEach((tn, k) => { pv.set(tn[0], E.ground(tn[0], tn[1]) - 0.03, tn[1]); q.setFromAxisAngle(up, tn[2]); const dome = tn[3] === 0; sv.set(tn[4] * (dome ? 1.15 : 0.95), tn[4] * (dome ? 0.85 : 1.05), tn[4] * (dome ? 1.0 : 1.3)); m4.compose(pv, q, sv); inst.setMatrixAt(k, m4); col.setHex(tcols[tn[5]]).convertSRGBToLinear(); inst.setColorAt(k, col); });
      inst.instanceMatrix.needsUpdate = true; inst.instanceColor.needsUpdate = true; Env.fitInstances(inst, 3); inst.name = 'slTents'; inst.receiveShadow = false; sc.group.add(inst);
    }
    if (blocks.count) sc.statics.add(blocks.geometry(), 0.6, 0.1, 'clutter');
    E.stats.campAt = sites.map(c => [Math.round(c.x), Math.round(c.z)]); E.stats.campFields = sites.length; E.stats.campTents = tents.length;
  };

  // ================================================================ farmland: hedgerows, bales, barns, church
  SD.farm = function (E, D) {
    const sc = E.sc, t = E.t, rng = U.rng(7272), outside = mkOutside(E); const fm = D.farm || {};
    // ---- hawthorn hedgerows just outside the perimeter fence: a lumpy prism (rounded section) with colour variation, a gap every ~140 m (a field gate)
    const Hb = new Env.Builder(); let nHedge = 0, metres = 0;
    const greens = [C(0x3e5a2c), C(0x35502a), C(0x466232), C(0x2f4a28), C(0x52703a)], dark = C(0x233a1f);
    const oq = (B, a, b, c, d, col, ref) => {   // quad wound to face away from the hedge's axis (single sided)
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const cx = (a[0] + c[0]) / 2 - ref[0], cy = (a[1] + c[1]) / 2 - ref[1], cz = (a[2] + c[2]) / 2 - ref[2];
      if (nx * cx + ny * cy + nz * cz >= 0) B.quad(a, b, c, d, col); else B.quad(d, c, b, a, col);
    };
    for (const run of E.fence || []) {
      let prev = null, prevRef = null, acc = 0, gate = 70 + rng() * 80;
      for (let i = 0; i + 2 < run.length; i += 2) {
        const a = run[i], b = run[i + 2]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue; const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
        let nx = -tz, nz = tx; const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; if (E.fAt(mx + nx * 6, mz + nz * 6) < E.fAt(mx - nx * 6, mz - nz * 6)) { nx = -nx; nz = -nz; }
        acc += L; if (acc > gate) { if (acc > gate + 5) { acc = 0; gate = 100 + rng() * 80; } prev = null; continue; }
        const x = mx + nx * 2.4, z = mz + nz * 2.4;
        if (E.occAt(x, z) & (OCC.ROAD | OCC.BUILT | OCC.WATER | OCC.PARK | OCC.TRACK) || E.fsAt(x, z) < 30) { prev = null; continue; }
        const y = E.ground(x, z) - 0.12; const w = 1.1 + rng() * 0.25, h = 2.0 + rng() * 0.7; const lump = () => (rng() - 0.5) * 0.35;
        const sec = [[-w, 0], [-w * 1.12, h * 0.4 + lump() * 0.3], [-w * 0.8, h * 0.82 + lump()], [0, h + lump()], [w * 0.8, h * 0.82 + lump()], [w * 1.12, h * 0.4 + lump() * 0.3], [w, 0]];
        const cur = sec.map(([u, v]) => [x + nx * u, y + v, z + nz * u]); const ref = [x, y + h * 0.4, z];
        if (prev) { const gc = greens[Math.floor(rng() * greens.length)]; for (let k = 0; k + 1 < cur.length; k++) { const col = k === 0 || k === cur.length - 2 ? dark : gc; oq(Hb, prev[k], prev[k + 1], cur[k + 1], cur[k], col, [(ref[0] + prevRef[0]) / 2, ref[1], (ref[2] + prevRef[2]) / 2]); } nHedge++; metres += L; }
        prev = cur; prevRef = ref;
      }
    }
    if (Hb.count) sc.statics.add(Hb.geometry(), 0.95, 0, 'clutter');
    E.stats.hedges = { segments: nHedge, metres: Math.round(metres) };
    // ---- round bales in the cut fields (gold hay, a few wrapped in black / white / green plastic), in short rows
    const P = mkPt(E); const spot = (dmin, dmax) => { const sv = rng() * t.length, sd = rng() < 0.5 ? 1 : -1; const i = t.idxAtS(sv); return P(sv, sd, E.wallCap(i, sd) + dmin + rng() * (dmax - dmin)); };
    const bales = []; const bc = [0xc9a95a, 0xc9a95a, 0xc9a95a, 0xc9a95a, 0xc4a255, 0x1d1f1e, 0x1d1f1e, 0xe8e9e6, 0x3d6a3a].map(C);
    const cell = {}; for (let k = 0; k < 6000 && bales.length < (fm.bales || 0); k++) {
      const { x, z } = spot(190, 950); if (Math.abs(x) > 1700 || Math.abs(z) > 1700) continue;
      if (E.fAt(x, z) < 190 || !outside(x, z) || (E.occAt(x, z) & SOLID)) continue; E.cellAt(x, z, cell); const ft = E.fType[cell.k]; if (!(ft === 6 || ft === 0 || ft === 1)) continue;
      const dx = Math.cos(rng() * 6.283), dz = Math.sin(rng() * 6.283), n = 4 + Math.floor(rng() * 8), colr = rng() < 0.7 ? 0 : 1 + Math.floor(rng() * 4);
      for (let j = 0; j < n; j++) { const bx = x + dx * j * 5.6, bz = z + dz * j * 5.6; if (E.occAt(bx, bz) & SOLID) continue; E.cellAt(bx, bz, cell); if (E.fType[cell.k] !== ft) continue; bales.push([bx, bz, rng() * 6.283, colr === 0 ? (rng() < 0.9 ? 0 : 4) : 4 + colr]); }
    }
    if (bales.length) {
      // merged statics (one tile mesh with the rest of the scenery, no extra draw): an 8-sided drum with a lighter top, wrapped bales black / white / green
      const bB = new Env.Builder(); const N = 8, R = 0.85, Hh = 1.2;
      for (const b of bales) {
        const y = E.ground(b[0], b[1]) - 0.05, cc = bc[b[3]]; const top = new THREE.Color(Math.min(1, cc.r * 1.12), Math.min(1, cc.g * 1.12), Math.min(1, cc.b * 1.12)), side2 = new THREE.Color(cc.r * 0.9, cc.g * 0.9, cc.b * 0.9);
        for (let k = 0; k < N; k++) { const a0 = b[2] + k / N * 6.283, a1 = b[2] + (k + 1) / N * 6.283; const x0 = b[0] + Math.cos(a0) * R, z0 = b[1] + Math.sin(a0) * R, x1 = b[0] + Math.cos(a1) * R, z1 = b[1] + Math.sin(a1) * R;
          bB.quad([x0, y, z0], [x0, y + Hh, z0], [x1, y + Hh, z1], [x1, y, z1], k % 2 ? side2 : cc); bB.tri([b[0], y + Hh, b[1]], [x1, y + Hh, z1], [x0, y + Hh, z0], top); }
      }
      sc.statics.add(bB.geometry(), 0.9, 0, 'clutter');
    }
    E.stats.bales = bales.length;
    // ---- farm barns (steel-framed, corrugated roofs) with a house and a smaller shed
    const Fb = new Env.Builder(); let nBarn = 0; const dbg = { oob: 0, venue: 0, rect: 0, slope: 0 };
    const roofs = [C(0x6f7c70), C(0x8a8e8c), C(0x5f6a63)], walls = [C(0xb9b49f), C(0xa7a79a), C(0xc4bda5)], brick = C(0x8a5a44), tile = C(0x6a4a3e);
    for (let k = 0; k < 2500 && nBarn < (fm.barns || 0); k++) {
      const { x, z } = spot(260, 800); if (Math.abs(x) > 1900 || Math.abs(z) > 1900) { dbg.oob++; continue; }
      if (E.fAt(x, z) < 250 || !outside(x, z)) { dbg.venue++; continue; } const a = rng() * Math.PI, ax = Math.cos(a), az = Math.sin(a);
      if (E.rectFree(x, z, ax, az, 34, 28, SOLID, 0) < 0.99) { dbg.rect++; continue; }
      let lo = 1e9, hi = -1e9; for (const [p, q] of [[-26, -20], [26, -20], [26, 20], [-26, 20], [0, 0]]) { const y = E.ground(x + ax * p - az * q, z + az * p + ax * q); lo = Math.min(lo, y); hi = Math.max(hi, y); } if (hi - lo > 1.5) { dbg.slope++; continue; }
      const m = Env.frame(x, lo - 0.08, z, ax, az, -az, ax); const Pp = (u, y, v) => Env.xf(m, u, y, v);
      const bl = 20 + rng() * 10, bw = 11 + rng() * 3, bh = 5.2, rh = 3.4, wc = walls[Math.floor(rng() * walls.length)], rc = roofs[Math.floor(rng() * roofs.length)];
      Fb.box(m, bl, bh, bw, 0, 0, 0, wc);
      const a0 = Pp(-bl / 2 - 0.4, bh, -bw / 2 - 0.5), b0 = Pp(bl / 2 + 0.4, bh, -bw / 2 - 0.5), c0 = Pp(bl / 2 + 0.4, bh, bw / 2 + 0.5), d0 = Pp(-bl / 2 - 0.4, bh, bw / 2 + 0.5), r1 = Pp(-bl / 2 - 0.4, bh + rh, 0), r2 = Pp(bl / 2 + 0.4, bh + rh, 0);
      Fb.quad(a0, r1, r2, b0, rc); Fb.quad(c0, r2, r1, d0, new THREE.Color(rc.r * 0.85, rc.g * 0.85, rc.b * 0.85)); Fb.tri(b0, r2, c0, wc); Fb.tri(d0, r1, a0, wc);
      Fb.box(m, 4.5, 3.6, 0.2, bl / 2 - 6, 0, -bw / 2 - 0.05, C(0x4e5558)); Fb.box(m, 12, 3.0, 8, -bl / 2 - 9, 0, 9, brick, { top: tile }); Fb.box(m, 10, 3.5, 6, bl / 2 + 8, 0, 12, wc, { top: rc });
      E.markRect(x, z, ax, az, 36, 30, OCC.BUILT); nBarn++; (E.stats.barnAt = E.stats.barnAt || []).push([Math.round(x), Math.round(z)]);
    }
    if (Fb.count) sc.statics.add(Fb.geometry(), 0.75, 0.05, 'clutter');
    E.stats.barns = nBarn; E.stats.barnReject = dbg;
    // ---- a hamlet on the horizon: a church (stone tower and a short slate spire, the nave under a slate roof) with a ring of cottages (brick / limestone walls,
    // tiled gabled roofs) and a few farm trees (Silverstone village lies beyond the circuit's south side)
    const ch = new Env.Builder(); let placedCh = 0;
    const gable = (B, m, l, w, h, rh, x, z, wallc, roofc) => {   // a gabled house in frame m: ridge along x
      B.box(m, l, h, w, x, 0, z, wallc); const P = (u, y, v) => Env.xf(m, x + u, y, z + v); const rc2 = new THREE.Color(roofc.r * 0.82, roofc.g * 0.82, roofc.b * 0.82);
      const a0 = P(-l / 2 - 0.3, h, -w / 2 - 0.4), b0 = P(l / 2 + 0.3, h, -w / 2 - 0.4), c0 = P(l / 2 + 0.3, h, w / 2 + 0.4), d0 = P(-l / 2 - 0.3, h, w / 2 + 0.4), r1 = P(-l / 2 - 0.3, h + rh, 0), r2 = P(l / 2 + 0.3, h + rh, 0);
      B.quad(a0, r1, r2, b0, roofc); B.quad(c0, r2, r1, d0, rc2); B.tri(b0, r2, c0, wallc); B.tri(d0, r1, a0, wallc);
    };
    { let best = null;
      for (let k = 0; k < 900; k++) {
        const sv = rng() * t.length, sd = rng() < 0.5 ? 1 : -1; const i = t.idxAtS(sv); const q = P(sv, sd, E.wallCap(i, sd) + 480 + rng() * 420); const x = q.x, z = q.z; const fa = E.fAt(x, z);
        if (fa < 440 || !outside(x, z) || (E.occAt(x, z) & SOLID) || Math.abs(x) > 1950 || Math.abs(z) > 1950 || (best && fa >= best.fa)) continue;
        const a = rng() * 6.283; const ax = Math.cos(a), az = Math.sin(a); if (E.rectFree(x, z, ax, az, 60, 40, SOLID, 0) < 0.99) continue; best = { x, z, ax, az, fa };
      }
      if (best) { const { x, z, ax, az } = best;
        let lo = 1e9; for (const [p, q] of [[-40, -30], [40, -30], [40, 30], [-40, 30], [0, 0]]) lo = Math.min(lo, E.ground(x + ax * p - az * q, z + az * p + ax * q));
        const m = Env.frame(x, lo - 0.1, z, ax, az, -az, ax); const stone = C(0xb4ab98), slate = C(0x5e6468), spire = C(0x6d7378);
        gable(ch, m, 15, 7.5, 6, 3.2, 0, 0, stone, slate); ch.box(m, 5.2, 13, 5.2, 9.2, 0, 0, stone);
        const Pq = (u, yy, v) => Env.xf(m, 9.2 + u, yy, v); const ap = Pq(0, 19.5, 0), c0 = [Pq(-2.6, 13, -2.6), Pq(2.6, 13, -2.6), Pq(2.6, 13, 2.6), Pq(-2.6, 13, 2.6)];
        for (let k = 0; k < 4; k++) { ch.tri(c0[(k + 1) % 4], c0[k], ap, spire); ch.tri(c0[k], c0[(k + 1) % 4], ap, spire); }
        const walls = [C(0xb8946a), C(0xa8714f), C(0xc2b08a), C(0x9a6a4e)], roofs = [C(0x6a4a3e), C(0x585e62), C(0x7a5444)];
        for (let k = 0; k < 7; k++) { const ang = k / 7 * 6.283 + rng() * 0.5, r = 24 + rng() * 14; gable(ch, m, 8 + rng() * 5, 5.5 + rng() * 1.5, 4.2 + rng() * 0.6, 2.2, Math.cos(ang) * r, Math.sin(ang) * r * 0.8, walls[k % 4], roofs[k % 3]); }
        E.markRect(x, z, ax, az, 44, 34, OCC.BUILT);
        for (let k = 0; k < 9; k++) { const ang = rng() * 6.283, r = 50 + rng() * 16; E.treeLines.push([x + ax * Math.cos(ang) * r - az * Math.sin(ang) * r * 0.7, z + az * Math.cos(ang) * r + ax * Math.sin(ang) * r * 0.7, x + ax * Math.cos(ang) * r - az * Math.sin(ang) * r * 0.7 + 4, z + az * Math.cos(ang) * r + ax * Math.sin(ang) * r * 0.7 + 4]); }
        placedCh++; E.stats.churchAt = [Math.round(x), Math.round(z)]; } }
    if (ch.count) sc.statics.add(ch.geometry(), 0.8, 0.05, 'clutter');
    E.stats.church = placedCh;
  };

  // ================================================================ build + hook (Silverstone only)
  SD.build = function (E) {
    const D = E.data && E.data.dress; if (!D) return; const T0 = performance.now();
    for (const [nm, fn] of [['banks', SD.banks], ['hospitality', SD.hospitality], ['camps', SD.camps], ['farm', SD.farm]]) {
      try { fn(E, D); } catch (e) { console.error('EnvSilverstoneDress ' + nm, e); }
    }
    E.stats.dressMs = Math.round(performance.now() - T0);
  };
  const V = EI.EnvVenue;
  if (V) {
    const oBuild = V.build;
    V.build = function (E) {
      const r = oBuild.call(this, E);
      if (isSil(E.t)) SD.build(E);
      return r;
    };
  }
})();
