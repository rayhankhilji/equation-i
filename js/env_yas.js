// Equation I - Yas Marina (Abu Dhabi) landmarks: the W hotel and its LED gridshell over the track, Ferrari World's red roof,
// the marina and its yachts, the race control tower, the floodlight towers. Built for track data kind 'desert'.
// Static pieces go through the street kit's shared atlas / batched world (one material, a draw call per visible cell); the
// gridshell is its own mesh (no shadow), the floodlights two instanced meshes.
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  const C = (h) => new THREE.Color(h).convertSRGBToLinear();
  const Yas = {};
  const isDesert = (t) => ((EI.ENVDATA && EI.ENVDATA[t.data.id]) || {}).kind === 'desert';
  const isNight = () => !!(EI.Night && EI.Night.on);
  // night variants of the facade textures live with the architecture module's regions
  const NR = () => { const AT = EI.StreetKit.Atlas; return { glassN: AT.R.yasGlassN || AT.R.yasGlass }; };
  // footprints modelled here instead of by the scenery's generic box buildings (they still reserve their ground for the venue
  // layout and the trackside infrastructure: only the box-building pass skips them)
  const OWN = (b, t) => b.w || /^(Control Tower|Etihad Arena)$/.test(b.n || '') || !!(t && EI.EnvYasArch && EI.EnvYasArch.owns(b, t));
  if (EI.Scenery) {
    const orig = EI.Scenery.prototype.buildBuildings;
    EI.Scenery.prototype.buildBuildings = function () {
      const sc = this.track.data.scenery; if (!isDesert(this.track)) return orig.call(this);
      const all = sc.buildings; const tr = this.track; sc.buildings = all.filter(b => !OWN(b, tr));
      try { return orig.call(this); } finally { sc.buildings = all; }
    };
  }

  // ---------------------------------------------------------------- helpers
  const SKx = () => EI.StreetKit;
  const centroid = (p) => { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; };
  function segDist(px, pz, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1]; const L2 = dx * dx + dz * dz || 1; const t = U.clamp(((px - a[0]) * dx + (pz - a[1]) * dz) / L2, 0, 1); return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t); }
  function polyDist(x, z, p) { let d = Infinity; for (let i = 0; i < p.length; i++) d = Math.min(d, segDist(x, z, p[i], p[(i + 1) % p.length])); return d; }
  // atlas region painted with transparency (the atlas canvas starts opaque white: clear the slot it is about to get first)
  function alphaRegion(name, w, h, paint) {
    const AT = SKx().Atlas; if (!AT.cv) AT.reset(); if (AT.R[name]) return AT.R[name];
    const S = AT.S, G = AT.G, W = w + 2 * G, H = h + 2 * G; let x = AT.x, y = AT.y; if (x + W > S) { x = 0; y += AT.rowH; }
    AT.cx.clearRect(x, y, W, H);
    return AT.region(name, w, h, (c, ww, hh) => { c.clearRect(0, 0, ww, hh); paint(c, ww, hh); }, null, null, 'uv');
  }
  // signed distance raster (metres, > 0 inside) of a region given by an inside(x, z) test, two-pass chamfer on each side
  function sdf(x0, z0, x1, z1, st, inside) {
    const nx = Math.ceil((x1 - x0) / st) + 1, nz = Math.ceil((z1 - z0) / st) + 1, n = nx * nz; const ins = new Uint8Array(n);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) ins[j * nx + i] = inside(x0 + i * st, z0 + j * st) ? 1 : 0;
    const ch = (val) => {
      const d = new Float32Array(n); for (let k = 0; k < n; k++) d[k] = ins[k] === val ? 1e9 : 0; const D = Math.SQRT2;
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (!d[k]) continue; let v = d[k]; if (i > 0) v = Math.min(v, d[k - 1] + 1); if (j > 0) { v = Math.min(v, d[k - nx] + 1); if (i > 0) v = Math.min(v, d[k - nx - 1] + D); if (i < nx - 1) v = Math.min(v, d[k - nx + 1] + D); } d[k] = v; }
      for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const k = j * nx + i; if (!d[k]) continue; let v = d[k]; if (i < nx - 1) v = Math.min(v, d[k + 1] + 1); if (j < nz - 1) { v = Math.min(v, d[k + nx] + 1); if (i < nx - 1) v = Math.min(v, d[k + nx + 1] + D); if (i > 0) v = Math.min(v, d[k + nx - 1] + D); } d[k] = v; }
      return d;
    };
    const dI = ch(1), dO = ch(0); const d = new Float32Array(n); for (let k = 0; k < n; k++) d[k] = ins[k] ? (dI[k] - 0.5) * st : -(dO[k] - 0.5) * st;
    const at = (x, z) => { const fx = U.clamp((x - x0) / st, 0, nx - 1.001), fz = U.clamp((z - z0) / st, 0, nz - 1.001); const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * nx + i; return (d[k] * (1 - u) + d[k + 1] * u) * (1 - v) + (d[k + nx] * (1 - u) + d[k + nx + 1] * u) * v; };
    return { x0, z0, st, nx, nz, d, at };
  }
  // a height-field surface over an sdf region: grid vertices, the ones just outside snapped onto the outline, cells with an
  // inside corner become quads. f(x, z, din) -> y. emit(a, b, c, d) gets four [x, y, z] corners counter-clockwise from above
  function surface(F, f, emit) {
    const { nx, nz, st, x0, z0, d } = F; const V = new Array(nx * nz);
    const vert = (i, j) => {
      const k = j * nx + i; if (V[k]) return V[k]; let x = x0 + i * st, z = z0 + j * st; let dd = d[k];
      if (dd < 0) { const gx = F.at(x + st, z) - F.at(x - st, z), gz = F.at(x, z + st) - F.at(x, z - st); const gl = Math.hypot(gx, gz) || 1; x -= gx / gl * dd; z -= gz / gl * dd; dd = 0; }
      return (V[k] = [x, f(x, z, Math.max(0, dd)), z]);
    };
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const k = j * nx + i; if (d[k] < 0 && d[k + 1] < 0 && d[k + nx] < 0 && d[k + nx + 1] < 0) continue;
      emit(vert(i, j), vert(i, j + 1), vert(i + 1, j + 1), vert(i + 1, j));
    }
  }
  // a quad facing the horizontal direction (nx, nz): the world material is single sided
  function wallQuad(B, A, Bq, Cq, D, nx, nz, col, uv) {
    const ux = Bq[0] - A[0], uy = Bq[1] - A[1], uz = Bq[2] - A[2], vx = Cq[0] - A[0], vy = Cq[1] - A[1], vz = Cq[2] - A[2];
    const fx = uy * vz - uz * vy, fz = ux * vy - uy * vx;
    if (fx * nx + fz * nz >= 0) B.quad(A, Bq, Cq, D, col, uv); else B.quad(A, D, Cq, Bq, col, uv ? [uv[0], uv[1], uv[6], uv[7], uv[4], uv[5], uv[2], uv[3]] : null);
  }
  // outward normal of edge a-b of polygon p
  function outN(p, a, b) { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; let nx = (b[1] - a[1]) / l, nz = -(b[0] - a[0]) / l; if (U.pointInPoly((a[0] + b[0]) / 2 + nx * 0.3, (a[1] + b[1]) / 2 + nz * 0.3, p)) { nx = -nx; nz = -nz; } return [nx, nz]; }
  // extruded footprint: walls (u in metres along the outline / tile, v in metres / tile) between y0 and y1, optional roof
  function prism(B, p, y0, y1, col, tileU, tileV, roofCol, roofRect) {
    let u = 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 0.05) continue; const [nx, nz] = outN(p, a, b);
      wallQuad(B, [a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], nx, nz, col, [u / tileU, y0 / tileV, (u + l) / tileU, y0 / tileV, (u + l) / tileU, y1 / tileV, u / tileU, y1 / tileV]); u += l;
    }
    if (roofCol) { if (roofRect) B.set(roofRect, 0.8, 0); cap(B, p, y1, roofCol, true); }
  }
  function cap(B, p, y, col, up) {
    const tri = THREE.ShapeUtils.triangulateShape(p.map(q => new THREE.Vector2(q[0], q[1])), []);
    for (const [a, b, c] of tri) { const A = [p[a][0], y, p[a][1]], Bq = [p[b][0], y, p[b][1]], Cq = [p[c][0], y, p[c][1]]; const uv = [A[0] / 8, A[2] / 8, Bq[0] / 8, Bq[2] / 8, Cq[0] / 8, Cq[2] / 8];
      const ny = (Bq[2] - A[2]) * (Cq[0] - A[0]) - (Bq[0] - A[0]) * (Cq[2] - A[2]); if ((ny > 0) === up) B.tri(A, Bq, Cq, col, uv); else B.tri(A, Cq, Bq, col, [uv[0], uv[1], uv[4], uv[5], uv[2], uv[3]]); }
  }
  // a standalone mesh from street-kit batches, drawn with the world's shared material (same program, one draw call)
  function batchMesh(W, list, name, kind) {
    const S = 18; let n = 0; for (const B of list) n += B.n; const arr = new Float32Array(n * S); let o = 0; for (const B of list) { arr.set(B.f.subarray(0, B.n * S), o); o += B.n * S; }
    const ib = new THREE.InterleavedBuffer(arr, S); const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0)); g.setAttribute('normal', new THREE.InterleavedBufferAttribute(ib, 3, 3)); g.setAttribute('color', new THREE.InterleavedBufferAttribute(ib, 3, 6));
    g.setAttribute('uv', new THREE.InterleavedBufferAttribute(ib, 2, 9)); g.setAttribute('aRect', new THREE.InterleavedBufferAttribute(ib, 4, 11)); g.setAttribute('aRme', new THREE.InterleavedBufferAttribute(ib, 3, 15));
    g.computeBoundingSphere(); g.computeBoundingBox(); const m = new THREE.Mesh(g, W.mat(kind || 'solid')); m.name = name; m.matrixAutoUpdate = false; m.userData.tris = n / 3; return m;
  }
  // ---------------------------------------------------------------- textures (atlas regions)
  function regions() {
    const AT = SKx().Atlas;
    // curtain wall: blue-green glass with sky reflections, white floor slabs every 3.3 m, slim mullions (4 floors x 3 bays per tile)
    const glass = AT.region('yasGlass', 256, 256, (x, w, h) => {
      const r = U.rng(31); const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#5f7f93'); g.addColorStop(0.5, '#3c5a6c'); g.addColorStop(1, '#2b4352'); x.fillStyle = g; x.fillRect(0, 0, w, h);
      for (let k = 0; k < 14; k++) { x.fillStyle = 'rgba(210,225,235,' + (0.05 + r() * 0.1).toFixed(2) + ')'; const xx = r() * w; x.fillRect(xx, 0, 6 + r() * 20, h); }
      for (let f = 0; f < 4; f++) { const y = f * 64; x.fillStyle = '#ece9e2'; x.fillRect(0, y, w, 13); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, y + 13, w, 2); }
      x.fillStyle = 'rgba(220,226,230,0.85)'; for (let i = 0; i < 3; i++) x.fillRect(i * 85, 0, 3, h);
    }, (x, w, h) => { x.fillStyle = 'rgb(128,128,128)'; x.fillRect(0, 0, w, h); for (let f = 0; f < 4; f++) { x.fillStyle = 'rgb(170,170,170)'; x.fillRect(0, f * 64, w, 13); } },
    (x, w, h) => { x.fillStyle = 'rgb(40,40,40)'; x.fillRect(0, 0, w, h); for (let f = 0; f < 4; f++) { x.fillStyle = 'rgb(220,220,220)'; x.fillRect(0, f * 64, w, 15); } });
    // podium / control tower stone: pale limestone panels with a dark glass ground floor band
    const stone = AT.region('yasStone', 256, 128, (x, w, h) => {
      x.fillStyle = '#e9e1d2'; x.fillRect(0, 0, w, h); x.strokeStyle = 'rgba(120,110,95,0.35)'; x.lineWidth = 1.5; for (let y = 0; y < h; y += 32) { x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke(); } for (let xx = 0; xx < w; xx += 64) { x.beginPath(); x.moveTo(xx, 0); x.lineTo(xx, h); x.stroke(); }
      x.fillStyle = '#26323a'; x.fillRect(0, h - 40, w, 40); x.fillStyle = 'rgba(200,215,225,0.25)'; for (let xx = 4; xx < w; xx += 32) x.fillRect(xx, h - 38, 10, 36);
    }, null, (x, w, h) => { x.fillStyle = 'rgb(150,150,150)'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgb(50,50,50)'; x.fillRect(0, h - 40, w, 40); });
    // gridshell: steel diamond lattice (opaque) round glass panels that are cut out close up and read as a silvery veil far off
    const shell = alphaRegion('yasShell', 128, 128, (x, w, h) => {
      x.fillStyle = 'rgba(205,215,228,0.45)'; x.fillRect(0, 0, w, h);
      x.strokeStyle = '#ffffff'; x.lineWidth = 9; x.strokeRect(0, 0, w, h); x.lineWidth = 3; x.beginPath(); x.moveTo(0, h / 2); x.lineTo(w, h / 2); x.stroke();
      x.fillStyle = '#ffffff'; for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h], [w / 2, h / 2]]) { x.beginPath(); x.arc(cx, cy, 7, 0, 6.283); x.fill(); }
    });
    // Ferrari World roof: lacquered panels with fine seams
    const roof = AT.region('yasRoof', 128, 128, (x, w, h) => { x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(0,0,0,0.12)'; for (let k = 0; k < w; k += 32) { x.fillRect(k, 0, 2, h); x.fillRect(0, k, w, 2); } },
      (x, w, h) => { x.fillStyle = 'rgb(128,128,128)'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgb(100,100,100)'; for (let k = 0; k < w; k += 32) { x.fillRect(k, 0, 2, h); x.fillRect(0, k, w, 2); } });
    // the yellow shield with the tricolour band on the roof
    const shield = alphaRegion('yasShield', 128, 160, (x, w, h) => {
      const sh = () => { x.beginPath(); x.moveTo(6, 6); x.lineTo(w - 6, 6); x.lineTo(w - 6, h * 0.62); x.quadraticCurveTo(w - 8, h * 0.9, w / 2, h - 4); x.quadraticCurveTo(8, h * 0.9, 6, h * 0.62); x.closePath(); };
      sh(); x.fillStyle = '#ffd400'; x.fill(); x.save(); sh(); x.clip(); const bw = (w - 12) / 3; x.fillStyle = '#009246'; x.fillRect(6, 6, bw, 16); x.fillStyle = '#ffffff'; x.fillRect(6 + bw, 6, bw, 16); x.fillStyle = '#ce2b37'; x.fillRect(6 + 2 * bw, 6, bw, 16); x.restore();
      x.fillStyle = '#111'; x.beginPath(); x.ellipse(w / 2, h * 0.55, w * 0.18, h * 0.24, 0.25, 0, 6.283); x.fill(); x.fillStyle = '#ffd400'; x.beginPath(); x.ellipse(w / 2 + 6, h * 0.5, w * 0.08, h * 0.12, 0.25, 0, 6.283); x.fill();
      sh(); x.strokeStyle = '#111'; x.lineWidth = 4; x.stroke();
    });
    // Etihad Arena: vertical silver fins over dark glass
    const fins = AT.region('yasFins', 128, 128, (x, w, h) => { x.fillStyle = '#2a333b'; x.fillRect(0, 0, w, h); for (let i = 0; i < 8; i++) { const g = x.createLinearGradient(i * 16, 0, i * 16 + 10, 0); g.addColorStop(0, '#9aa3ab'); g.addColorStop(0.5, '#eef1f3'); g.addColorStop(1, '#8c959d'); x.fillStyle = g; x.fillRect(i * 16, 0, 10, h); } },
      (x, w, h) => { x.fillStyle = 'rgb(128,128,128)'; x.fillRect(0, 0, w, h); for (let i = 0; i < 8; i++) { x.fillStyle = 'rgb(170,170,170)'; x.fillRect(i * 16, 0, 2, h); x.fillStyle = 'rgb(90,90,90)'; x.fillRect(i * 16 + 8, 0, 2, h); } });
    return { glass, stone, shell, roof, shield, fins };
  }

  // ================================================================ the W Abu Dhabi - Yas Island
  function buildHotel(E, W, R, out) {
    const H = E.data.hotel; if (!H || !H.parts) return; const t = E.t, sc = E.sc; const night = isNight();
    const B = new (SKx().Batch)(); const parts = H.parts.filter(p => p.h > 1 && p.p.length >= 3);
    const ground = (p) => { let y = Infinity; for (const q of p) y = Math.min(y, E.ground(q[0], q[1])); return y - 0.3; };
    const white = C(0xf2f0eb), roofC = C(0xb8bcc0), glassTint = C(0xffffff);
    const wings = [];
    for (const p of parts) {
      const y0 = ground(p.p);
      if (p.h <= 12) { B.set(R.stone, 0.75, 0); prism(B, p.p, y0, y0 + p.h, white, 16, 8, C(0xd6d2c8), 'white'); continue; }
      wings.push({ p: p.p, h: p.h, y0 });
      B.set(R.stone, 0.75, 0, night ? 0.25 : 0); prism(B, p.p, y0, y0 + 9, white, 16, 8);
      B.set(night ? NR().glassN : R.glass, 0.25, 0.1, night ? 0.75 : 0); prism(B, p.p, y0 + 9, y0 + p.h, glassTint, 9, 13.2, roofC, 'white');
    }
    // the bridge across the track (9 m clear), glazed sides, white soffit
    const br = H.bridge; let bridgeY = null;
    if (br && br.p.length >= 3) {
      const y0 = ground(br.p) + 0.3 + br.h0, y1 = ground(br.p) + 0.3 + br.h; bridgeY = [y0, y1];
      B.set(R.glass, 0.25, 0.1); prism(B, br.p, y0 + 1.2, y1, glassTint, 9, 13.2, roofC, 'white');
      B.set('white', 0.7, 0); prism(B, br.p, y0, y0 + 1.2, white); cap(B, br.p, y0, white, false);
    }
    W.add(B, 'main'); out.hotelTris = B.count / 3;
    // ---- the gridshell: one flowing skin over both wings and the bridge, 6 m proud of them, its hem rising over the track
    const doms = wings.map(w => w.p).concat(br ? [br.p] : []); if (!doms.length) return;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const p of doms) for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    const PAD = 9; x0 -= PAD + 4; x1 += PAD + 4; z0 -= PAD + 4; z1 += PAD + 4;
    const inside = (x, z) => { for (const p of doms) if (U.pointInPoly(x, z, p) || polyDist(x, z, p) < PAD) return true; return false; };
    const F = sdf(x0, z0, x1, z1, 2.5, inside); const pr = {};
    const yBase = Math.min(...wings.map(w => w.y0));
    const topAt = (x, z) => { let sw = 0, sh = 0; for (const w of wings) { const d = U.pointInPoly(x, z, w.p) ? 0 : polyDist(x, z, w.p); const k = 1 / Math.pow(d + 6, 2.2); sw += k; sh += k * (w.y0 + w.h + 11); } return sh / sw; };
    const yFn = (x, z, din) => {
      t.project(x, z, null, pr); const overTrack = pr.dist < Math.max(t.wallL[pr.i], t.wallR[pr.i]) + 4;
      const hem = yBase + (overTrack ? 24 : 11); const top = topAt(x, z);
      const k = Math.pow(U.smoothstep(0, 16, din), 0.55);
      return hem + (top - hem) * k + (Math.sin(x / 17 + z / 29) * 2.2 + Math.sin(z / 11 - x / 23) * 0.9) * k;
    };
    const S = new (SKx().Batch)(); const tA = C(0xe9eef6), tB = C(0xeadff8);
    const uvOf = (p) => { const k = 1 / 4.2; return [(p[0] + p[2]) * k + p[1] * 0.12, (p[0] - p[2]) * k - p[1] * 0.12]; };
    let nq = 0; const led = [];
    surface(F, yFn, (a, b, c, d) => {
      if (night) led.push(a, b, c, a, c, d);
      const col = Math.sin(a[0] / 37) * Math.cos(a[2] / 29) > 0.2 ? tB : tA; S.set(R.shell, 0.35, 0.55, 0.22);
      const ua = uvOf(a), ub = uvOf(b), uc = uvOf(c), ud = uvOf(d);
      S.quad(a, b, c, d, col, [ua[0], ua[1], ub[0], ub[1], uc[0], uc[1], ud[0], ud[1]]); S.quad(a, d, c, b, col, [ua[0], ua[1], ud[0], ud[1], uc[0], uc[1], ub[0], ub[1]]); nq++;
    });
    // the hem: a white steel edge beam all round
    const shellMesh = batchMesh(W, [S], 'yasGridshell'); shellMesh.castShadow = false; shellMesh.receiveShadow = false; sc.group.add(shellMesh); out.shellTris = S.count / 3;
    // ---- at night the gridshell is a light show: ~5,000 LED nodes in the lattice washing slow waves of magenta, blue, purple and
    // white over the skin (one additive mesh over the same surface, animated in the shader)
    if (night && led.length) {
      const pos = new Float32Array(led.length * 3); led.forEach((p, k) => { pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2]; });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.computeBoundingSphere();
      const uni = { uT: { value: 0 } };
      const mat = new THREE.ShaderMaterial({ uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
        vertexShader: 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: ['uniform float uT; varying vec3 vP;',
          'vec3 pal(float t) { t = fract(t); vec3 a = vec3(1.0, 0.12, 0.75), b = vec3(0.2, 0.35, 1.0), c = vec3(0.62, 0.25, 1.0), d = vec3(0.95, 0.95, 1.0);',
          '  return t < 0.25 ? mix(a, b, t * 4.0) : t < 0.5 ? mix(b, c, t * 4.0 - 1.0) : t < 0.75 ? mix(c, d, t * 4.0 - 2.0) : mix(d, a, t * 4.0 - 3.0); }',
          'void main() { vec2 q = vec2((vP.x + vP.z) / 4.2 + vP.y * 0.12, (vP.x - vP.z) / 4.2 - vP.y * 0.12); vec2 f = fract(q); vec2 e = min(f, 1.0 - f);',
          '  float line = 1.0 - smoothstep(0.0, 0.07, min(e.x, e.y)); float node = 1.0 - smoothstep(0.0, 0.16, length(e));',
          '  float wave = 0.55 + 0.45 * sin(vP.x * 0.035 + vP.y * 0.08 - uT * 0.9) * sin(vP.z * 0.03 + uT * 0.37);',
          '  vec3 col = pal(vP.x * 0.0025 + vP.y * 0.006 + uT * 0.035);',
          '  gl_FragColor = vec4(col * (line * 0.55 + node * 1.6 + 0.05) * wave, 1.0); }'].join('\n') });
      mat.userData.nightEmissive = true;
      const lm = new THREE.Mesh(g, mat); lm.name = 'yasShellLED'; lm.renderOrder = 4; sc.group.add(lm);
      EI.Night.onFrame((dt, tt) => { uni.uT.value = tt; });
      // the skin's glow lights the track and the marina under it
      const hc = centroid(doms[0]); EI.Night.addFlood(hc[0], yBase + 30, hc[1], { power: 0.5, range: 110, color: [0.7, 0.45, 1.0] });
      if (br) { const bc = centroid(br.p); EI.Night.addFlood(bc[0], yBase + 12, bc[1], { power: 0.35, range: 50, color: [0.85, 0.6, 1.0] }); }
    }
    out.shell = { quads: nq, bridgeY };
  }

  // ================================================================ Ferrari World
  function buildFerrari(E, W, R, out) {
    const P = E.data.ferrari; if (!P || P.length < 3) return; const B = new (SKx().Batch)();
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const q of P) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    const F = sdf(x0 - 12, z0 - 12, x1 + 12, z1 + 12, 9, (x, z) => U.pointInPoly(x, z, P));
    const c = centroid(P); let g0 = Infinity; for (let k = 0; k < P.length; k += 6) g0 = Math.min(g0, E.ground(P[k][0], P[k][1])); const yg = isFinite(g0) ? g0 : 0;
    // roof: low at the tips, a long rise to the middle, the central funnel dipping in
    const yFn = (x, z, din) => { const r = Math.hypot(x - c[0], z - c[1]); return yg + 5 + 41 * Math.pow(U.smoothstep(0, 150, din), 0.85) - 14 * (1 - U.smoothstep(18, 42, r)); };
    const night = isNight(); const red = C(0xc4120e), redD = C(0x9e0d0b); B.set(R.roof, 0.28, 0.12, night ? 0.16 : 0);
    surface(F, yFn, (a, b, cc, d) => { const uv = (p) => [p[0] / 32, p[2] / 32]; const ua = uv(a), ub = uv(b), uc = uv(cc), ud = uv(d); B.quad(a, b, cc, d, a[1] < yg + 9 ? redD : red, [ua[0], ua[1], ub[0], ub[1], uc[0], uc[1], ud[0], ud[1]]); });
    // glazed walls under the roof edge
    B.set('white', 0.15, 0.3, night ? 0.9 : 0); const dark = night ? C(0xffc98a) : C(0x2a3540);
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; const ya = yFn(a[0], a[1], 0), yb = yFn(b[0], b[1], 0); const A = [a[0], yg - 0.5, a[1]], Bq = [b[0], yg - 0.5, b[1]], Cq = [b[0], yb, b[1]], D = [a[0], ya, a[1]]; B.quad(A, Bq, Cq, D, dark); B.quad(A, D, Cq, Bq, dark); }
    // the shield, lying on the roof facing the circuit (south)
    const top = yFn(c[0], c[1] + 120, F.at(c[0], c[1] + 120)) + 0.6; const sx = c[0], sz = c[1] + 120, w = 34, h = 42;
    B.set(R.shield, 0.4, 0.05, night ? 1.3 : 0.1);
    if (night) { EI.Night.addFlood(sx, top + 30, sz, { power: 0.6, range: 160, color: [1.0, 0.35, 0.3] }); for (let k = 0; k < P.length; k += 12) EI.Night.addGlow(P[k][0], yFn(P[k][0], P[k][1], 0) + 0.5, P[k][1], 3.5, [1.0, 0.75, 0.5]); } B.quad([sx - w / 2, top, sz + h / 2], [sx + w / 2, top, sz + h / 2], [sx + w / 2, top + 6, sz - h / 2], [sx - w / 2, top + 6, sz - h / 2], C(0xffffff), [0, 0, 1, 0, 1, 1, 0, 1]);
    W.add(B, 'main'); out.ferrariTris = B.count / 3;
  }

  // ================================================================ race control tower at Turn 1 and the pit building's glazed upper levels
  function buildTower(E, W, R, out) {
    const t = E.t; const tw = t.data.scenery.buildings.filter(b => b.n === 'Control Tower'); const B = new (SKx().Batch)();
    for (const b of tw) {
      const p = b.p; const c = centroid(p); let y0 = Infinity; for (const q of p) y0 = Math.min(y0, E.ground(q[0], q[1])); y0 -= 0.3;
      const sc = (k) => p.map(q => [c[0] + (q[0] - c[0]) * k, c[1] + (q[1] - c[1]) * k]);
      B.set(R.stone, 0.7, 0); prism(B, p, y0, y0 + 7, C(0xf4f1ea), 16, 8, C(0xcfcac0), 'white');
      B.set('white', 0.6, 0.05); prism(B, sc(0.45), y0 + 7, y0 + 27, C(0xf2f2ef), 8, 8);
      B.set(R.glass, 0.15, 0.2); const cab = sc(0.85), cab2 = sc(1.0); // control room leaning out
      for (let i = 0; i < cab.length; i++) { const a = cab[i], bb = cab[(i + 1) % cab.length], A2 = cab2[i], B2 = cab2[(i + 1) % cab.length]; const [nx, nz] = outN(cab, a, bb); wallQuad(B, [a[0], y0 + 27, a[1]], [bb[0], y0 + 27, bb[1]], [B2[0], y0 + 34, B2[1]], [A2[0], y0 + 34, A2[1]], nx, nz, C(0xffffff), [0, 0, 1, 0, 1, 0.6, 0, 0.6]); }
      B.set('white', 0.5, 0.1); cap(B, cab, y0 + 27, C(0xe8e8e4), false); prism(B, sc(1.06), y0 + 34, y0 + 35.2, C(0xf6f6f2), 8, 8, C(0xc9ccd0));
      B.col(new THREE.Matrix4(), c[0], c[1], y0 + 35.2, y0 + 47, 0.25, 0.12, 6, C(0xd6d9dc), true);
    }
    W.add(B, 'main'); out.towerTris = B.count / 3;
  }


  // ================================================================ Etihad Arena: silver fins round a glazed drum, a shallow dome
  function buildArena(E, W, R, out) {
    const b = E.t.data.scenery.buildings.find(q => q.n === 'Etihad Arena'); if (!b) return; const B = new (SKx().Batch)(); const p = b.p;
    let y0 = Infinity; for (const q of p) y0 = Math.min(y0, E.ground(q[0], q[1])); y0 -= 0.3; const h = 26; const c = centroid(p);
    const night = isNight(); B.set(R.fins, 0.3, 0.6, night ? 0.7 : 0); prism(B, p, y0, y0 + h, night ? C(0xc9a8ff) : C(0xffffff), 12, 13);
    if (night) { EI.Night.addFlood(centroid(p)[0], y0 + h + 10, centroid(p)[1], { power: 0.5, range: 120, color: [0.75, 0.55, 1.0] }); for (let k = 0; k < p.length; k += 2) EI.Night.addGlow(p[k][0], y0 + h + 1.2, p[k][1], 3, [0.8, 0.6, 1.0], { pulse: 0.3 }); }
    B.set('white', 0.45, 0.4); const rings = [[1.0, h + 1.2], [0.85, h + 5], [0.6, h + 8], [0.3, h + 9.5]];
    let prev = p.map(q => [q[0], y0 + h, q[1]]);
    for (const [k, y] of rings) { const cur = p.map(q => [c[0] + (q[0] - c[0]) * k, y0 + y, c[1] + (q[1] - c[1]) * k]); for (let i = 0; i < p.length; i++) { const j = (i + 1) % p.length; const A = prev[i], Bq = prev[j], Cq = cur[j], D = cur[i]; B.quad(A, Bq, Cq, D, C(0xdfe3e6)); B.quad(A, D, Cq, Bq, C(0xdfe3e6)); } prev = cur; }
    W.add(B, 'main'); out.arenaTris = B.count / 3;
  }

  // ================================================================ floodlight towers round the circuit
  function buildFloodlights(E, out) {
    const t = E.t, sc = E.sc, OCC = EI.Env.OCC; const spots = []; const L = t.length;
    const near = (x, z, r) => spots.some(s => Math.hypot(s[0] - x, s[2] - z) < r);
    for (let s = 20; s < L; s += 125) for (const side of [1, -1]) {
      for (const off of [14, 22, 30, 9]) {
        const i = t.idxAtS(s + (side > 0 ? 0 : 62)); const wall = side < 0 ? t.wallL[i] : t.wallR[i]; const d = wall + off;
        const x = t.x[i] + t.nx[i] * side * d, z = t.z[i] + t.nz[i] * side * d;
        if (E.occAt(x, z) & (OCC.BUILT | OCC.ROAD | OCC.WATER)) continue; if (E.isSea && E.isSea(x, z)) continue;
        const pr = t.project(x, z, null); if (pr.dist < Math.max(t.wallL[pr.i], t.wallR[pr.i]) + 6) continue; if (near(x, z, 60)) continue;
        // face the track
        spots.push([x, E.ground(x, z), z, Math.atan2(-(t.nx[i] * side), -(t.nz[i] * side))]); break;
      }
    }
    if (!spots.length) return;
    // the pylon (tapered column, the lamp bank's frame and platform tilted down at the track) and the lamp faces: two instanced meshes
    const H = 34, tilt = new THREE.Matrix4().makeRotationX(0.32), top = new THREE.Matrix4().makeTranslation(0, H + 1.2, 0);
    const col = new THREE.CylinderGeometry(0.32, 0.7, H, 6, 1); col.translate(0, H / 2, 0);
    const head = new THREE.BoxGeometry(6.2, 2.8, 0.45); head.translate(0, 0, 0.35); const plat = new THREE.BoxGeometry(6.8, 0.22, 1.5); plat.translate(0, -1.6, 0.3);
    for (const g of [head, plat]) { g.applyMatrix4(tilt); g.applyMatrix4(top); }
    const pylon = EI.Env.merge([col, head, plat]);
    const lamps = new THREE.PlaneGeometry(5.8, 2.4); lamps.translate(0, 0, 0.62); lamps.applyMatrix4(tilt); lamps.applyMatrix4(top);
    const mPy = new THREE.MeshStandardMaterial({ color: 0x9ea4aa, roughness: 0.5, metalness: 0.6 });
    // the lamp bank: rows of round reflectors in a dark frame, lit
    const [lc, lx] = EI.Env.canvas(128, 64); lx.fillStyle = '#1c1f23'; lx.fillRect(0, 0, 128, 64);
    for (let r = 0; r < 3; r++) for (let k = 0; k < 7; k++) { const cx = 10 + k * 18, cy = 11 + r * 21; const g = lx.createRadialGradient(cx, cy, 1, cx, cy, 8); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#fff1d0'); g.addColorStop(1, '#5a5040'); lx.fillStyle = g; lx.beginPath(); lx.arc(cx, cy, 7.5, 0, 6.283); lx.fill(); }
    const lt = new THREE.CanvasTexture(lc); lt.encoding = THREE.sRGBEncoding; lt.anisotropy = 4;
    const mLamp = new THREE.MeshBasicMaterial({ map: lt, color: new THREE.Color(1.0, 0.95, 0.85).multiplyScalar(1.6), toneMapped: false });
    const n = spots.length; const iPy = new THREE.InstancedMesh(pylon, mPy, n), iL = new THREE.InstancedMesh(lamps, mLamp, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1);
    spots.forEach((sp, k) => { const [x, y, z, yaw] = sp; e.set(0, yaw, 0); q.setFromEuler(e); m.compose(p.set(x, y - 0.2, z), q, s1); iPy.setMatrixAt(k, m); iL.setMatrixAt(k, m); });
    // instanced meshes cull by their geometry's bounds: give them the whole ring
    const bb = new THREE.Box3(); for (const sp of spots) bb.expandByPoint(p.set(sp[0], sp[1], sp[2])); bb.max.y += H + 6; const bs = bb.getBoundingSphere(new THREE.Sphere());
    for (const im of [iPy, iL]) { im.instanceMatrix.needsUpdate = true; im.castShadow = false; im.receiveShadow = false; im.geometry.boundingSphere = bs.clone(); }
    iPy.name = 'yasFloodPylons'; iL.name = 'yasFloodLamps';
    sc.group.add(iPy); sc.group.add(iL); out.floodlights = n;
  }

  // ================================================================ the marina: Gulf-blue water, quays and moored yachts
  function buildMarina(E, W, out) {
    const t = E.t, sc = E.sc; const ST = EI.EnvStreet; if (!ST || !ST.yachtKit) return;
    const polys = (t.data.scenery.water || []).filter(w => w.length >= 3);
    // water level: the environment's sea level when it has one, else just above the lowest shore (as the generic water did)
    const levels = polys.map(w => { let y = Infinity; for (const q of w) y = Math.min(y, E.ground(q[0], q[1])); return y + 0.25; });
    const generic = sc.group.getObjectByName('water'); if (generic) sc.group.remove(generic);
    const mat = ST.waterMaterial(E); const uni = E._waterUni; mat.color = C(0x1f6e76); mat.envMapIntensity = 1.1;   // Gulf turquoise
    const geos = []; polys.forEach((w, k) => {
      const wy = E.seaY != null ? E.seaY + 0.25 : levels[k];
      const shape = new THREE.Shape(); shape.moveTo(w[0][0], w[0][1]); for (let i = 1; i < w.length; i++) shape.lineTo(w[i][0], w[i][1]);
      const g = new THREE.ShapeGeometry(shape); g.rotateX(Math.PI / 2); g.translate(0, wy, 0); geos.push(g);
    });
    if (geos.length) { const m = new THREE.Mesh(EI.Env.merge(geos), mat); m.name = 'water'; m.receiveShadow = true; m.onBeforeRender = () => { uni.uTime.value = performance.now() / 1000; }; sc.group.add(m); }
    // the marina basin: the big water body's quay edges inside the marina near the circuit
    const sea = polys.reduce((a, w) => (Math.abs(U.polyArea(w)) > Math.abs(U.polyArea(a)) ? w : a), polys[0]); if (!sea) return;
    const seaY = E.seaY != null ? E.seaY + 0.25 : levels[polys.indexOf(sea)];
    const hotel = E.data.hotel && E.data.hotel.bridge ? centroid(E.data.hotel.bridge.p) : [100, 380];
    const SKk = SKx(); const N = new SKk.Batch(), Fb = new SKk.Batch(), LN = new SKk.Lines(), LF = new SKk.Lines(), Q = new SKk.Batch(); const refl = [];
    const K = ST.yachtKit(N, Fb, LN, LF, refl); const rng = U.rng(4242); const pr = {};
    const inSea = (x, z) => U.pointInPoly(x, z, sea);
    const lines = [];
    for (let i = 0; i < sea.length; i++) {
      const a = sea[i], b = sea[(i + 1) % sea.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 18) continue;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; const dh = Math.hypot(mx - hotel[0], mz - hotel[1]); if (dh > 520) continue;
      let nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l; if (!inSea(mx + nx * 4, mz + nz * 4)) { nx = -nx; nz = -nz; } if (!inSea(mx + nx * 4, mz + nz * 4)) continue;
      t.project(mx, mz, null, pr); if (pr.dist < Math.max(t.wallL[pr.i], t.wallR[pr.i]) + 8) continue;
      lines.push({ a, b, nx, nz, l, dh, y: Math.max(seaY + 1.0, E.ground(mx - nx * 2, mz - nz * 2)) });
    }
    lines.sort((p, q) => p.dh - q.dh);
    // quay walls along the edges (white concrete coping) where the ground stands above the water
    Q.set('white', 0.85, 0); const quayC = C(0xd8d4ca), copeC = C(0xf2f0ea);
    for (let i = 0; i < sea.length; i++) {
      const a = sea[i], b = sea[(i + 1) % sea.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 0.5 || l > 400) continue;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; if (Math.hypot(mx - hotel[0], mz - hotel[1]) > 650) continue;
      const ga = E.ground(a[0], a[1]), gb = E.ground(b[0], b[1]); if (Math.max(ga, gb) < seaY + 0.25) continue;
      const A = [a[0], seaY - 1, a[1]], Bq = [b[0], seaY - 1, b[1]], Cq = [b[0], gb + 0.12, b[1]], D = [a[0], ga + 0.12, a[1]];
      Q.quad(A, Bq, Cq, D, quayC); Q.quad(A, D, Cq, Bq, quayC);
    }
    const occ = new Set(); const OG = 3; const key = (x, z) => Math.floor(x / OG) * 8192 + Math.floor(z / OG);
    const free = (x, z, ax, az, Lb, Bm) => { for (let a = -Lb / 2; a <= Lb / 2; a += 2) for (let b = -Bm / 2; b <= Bm / 2; b += Math.max(1, Bm / 3)) { const px = x + ax * a - az * b, pz = z + az * a + ax * b; if (occ.has(key(px, pz)) || !inSea(px, pz)) return false; if (E.ground(px, pz) > seaY + 0.3 && !(E.isSea && E.isSea(px, pz))) return false; } return true; };
    const mark = (x, z, ax, az, Lb, Bm) => { for (let a = -Lb / 2 - 1; a <= Lb / 2 + 1; a += 1.5) for (let b = -Bm / 2 - 0.8; b <= Bm / 2 + 0.8; b += 1) occ.add(key(x + ax * a - az * b, z + az * a + ax * b)); };
    const beamOf = (k, Lb) => Lb * (k === 'super' ? 0.19 : k === 'bigsail' ? 0.21 : 0.31);
    let n = 0, nSuper = 0; const MAX = 64; const ropeC = C(0xd6cfbd);
    for (const ln of lines) {
      if (n >= MAX) break; const dx = ln.b[0] - ln.a[0], dz = ln.b[1] - ln.a[1]; const tx = dx / ln.l, tz = dz / ln.l; const heroQ = ln.dh < 200;
      for (let s = 2; s < ln.l - 2 && n < MAX;) {
        const r = rng(); let kind, Lb;
        if (heroQ && r < 0.45) { kind = 'super'; Lb = 38 + rng() * 34; } else if (r < 0.6) { kind = 'cruiser'; Lb = 14 + rng() * 14; } else if (r < 0.75) { kind = 'bigsail'; Lb = 24 + rng() * 16; } else if (r < 0.9) { kind = 'sail'; Lb = 11 + rng() * 9; } else { kind = 'sport'; Lb = 9 + rng() * 5; }
        const Bm = beamOf(kind, Lb); const along = s + Bm / 2; if (along > ln.l - Bm / 2) break;
        const sx = ln.a[0] + tx * along, sz = ln.a[1] + tz * along; const cx = sx + ln.nx * (Lb / 2 + 1.6), cz = sz + ln.nz * (Lb / 2 + 1.6);
        if (rng() < 0.12 || !free(cx, cz, ln.nx, ln.nz, Lb, Bm)) { s += Bm * 0.6 + 0.8; continue; }
        const yaw = Math.atan2(-ln.nz, ln.nx) + (rng() - 0.5) * 0.03; const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(cx, seaY, cz);
        const o = kind === 'super' ? K.superyacht(m, Lb, rng, Lb > 60) : kind === 'cruiser' ? K.cruiser(m, Lb, rng) : kind === 'sport' ? K.sport(m, Lb, rng) : K.sail(m, Lb, rng, kind === 'bigsail');
        mark(cx, cz, ln.nx, ln.nz, Lb, Bm); n++; if (kind === 'super') nSuper++; s += Bm + 0.7 + rng() * 0.9;
        // at night: deck and saloon lights along the boat, an anchor light at the masthead, blue underwater lights on the big ones
        if (isNight()) {
          const ux = ln.nx, uz = ln.nz; const deck = kind === 'super' ? [2.6, 5.2, 7.6] : kind === 'cruiser' ? [2.2, 4.0] : [1.6];
          for (const dy of deck) for (let a = -0.32; a <= 0.32; a += kind === 'super' ? 0.08 : 0.16) EI.Night.addGlow(cx + ux * a * Lb, seaY + dy, cz + uz * a * Lb, kind === 'super' ? 1.6 : 1.2, rng() < 0.75 ? [1.0, 0.85, 0.6] : [0.85, 0.9, 1.0]);
          if (kind === 'sail' || kind === 'bigsail') EI.Night.addGlow(cx, seaY + Lb * 1.15, cz, 1.4, [1, 1, 1]);
          if (kind === 'super') for (const sd of [-1, 1]) for (let a = -0.3; a <= 0.3; a += 0.15) EI.Night.addGlow(cx + ux * a * Lb - uz * sd * Bm * 0.55, seaY + 0.15, cz + uz * a * Lb + ux * sd * Bm * 0.55, 2.6, [0.2, 0.75, 1.0]);
        }
        if (o) { const S = o.S || K.hullShape(o); const sy = (S.hd ? S.hd(0) : 1) + seaY; for (const sd of [-1, 1]) { const st = [cx - ln.nx * Lb / 2 + tx * sd * Bm * 0.4, sy, cz - ln.nz * Lb / 2 + tz * sd * Bm * 0.4]; const q = [sx + tx * sd * (Bm * 0.5 + 1.2) - ln.nx * 0.6, ln.y + 0.2, sz + tz * sd * (Bm * 0.5 + 1.2) - ln.nz * 0.6]; LN.rope(st, q, 0.35, ropeC, 5); } }
      }
    }
    // promenade lamps along the quays round the marina: slim posts with a lantern, a warm pool of light each
    { const postC = C(0x2b2f35); Q.set('white', 0.5, 0.4); let nl = 0;
      for (const ln of lines) { if (ln.dh > 450) continue; for (let s = 6; s < ln.l - 3; s += 22) { const x = ln.a[0] + (ln.b[0] - ln.a[0]) * s / ln.l - ln.nx * 2.2, z = ln.a[1] + (ln.b[1] - ln.a[1]) * s / ln.l - ln.nz * 2.2; const yq = ln.y; const mm = new THREE.Matrix4().makeTranslation(x, yq, z);
        Q.col(mm, 0, 0, 0, 4.2, 0.09, 0.06, 6, postC); Q.set('white', 0.4, 0, isNight() ? 2.5 : 0.3); Q.box(mm, 0.4, 0.5, 0.4, 0, 4.2, 0, C(0xffe2b0)); Q.set('white', 0.5, 0.4);
        if (isNight()) { EI.Night.addGlow(x, yq + 4.45, z, 2.2, [1.0, 0.82, 0.55]); if (nl % 2 === 0) EI.Night.addFlood(x, yq + 4.4, z, { power: 0.08, range: 24, color: [1.0, 0.82, 0.58] }); } nl++; } }
      out.promenadeLamps = nl; }
    W.add(N, 'yNear'); W.add(Fb, 'yFar'); W.add(LN, 'lines'); W.add(LF, 'lines'); W.add(Q, 'main');   // rigging and ropes share the coarse line cells
    const keep = E.seaY; E.seaY = seaY; ST.buildReflections(E, refl, []); E.seaY = keep;
    out.yachts = n; out.superyachts = nSuper; out.seaY = +seaY.toFixed(2);
  }

  // ================================================================ entry point (after the venue)
  Yas.build = function (E) {
    const T0 = performance.now(); const out = E.stats.yas = {};
    if (!SKx() || !SKx().Batch) return;
    const sc = E.sc; const world = SKx().world(sc); const R = regions(); if (EI.EnvYasArch && EI.EnvYasArch.regions) EI.EnvYasArch.regions();
    // the landmarks' static geometry (hotel, tower, arena, quays, Ferrari World) is one mesh: a handful of buildings spread over
    // a kilometre would otherwise cost a draw call per 600 m world cell they touch; the yachts keep the world's near / far cells
    const statics = []; const W = { add: (b, layer) => { if (layer === 'main') { if (b && b.count) statics.push(b); } else world.add(b, layer); }, mat: (k) => world.mat(k) };
    const step = (k, fn) => { const t0 = performance.now(); try { fn(); } catch (e) { console.error('EnvYas ' + k, e); } out['ms_' + k] = Math.round(performance.now() - t0); };
    step('hotel', () => buildHotel(E, W, R, out));
    step('ferrari', () => buildFerrari(E, W, R, out));
    step('arena', () => buildArena(E, W, R, out));
    step('marina', () => buildMarina(E, W, out));
    // the circuit architecture after the reference photos: stand sails, pit building, paddock tents, control towers, the start
    // bridge, the floodlight towers (js/env_yas_arch.js); the concert fan zone (js/env_yas_fan.js)
    const Hh = { W, R, prism, cap, batchMesh, alphaRegion, centroid };
    if (EI.EnvYasArch) step('arch', () => EI.EnvYasArch.build(E, Hh, out));
    if (EI.EnvYasFan) step('fan', () => EI.EnvYasFan.build(E, Hh, out));
    // the street kit's world is otherwise built at the end of a street circuit's track build: do it here
    step('world', () => world.build());
    step('statics', () => { if (!statics.length) return; const m = batchMesh(world, statics, 'yasStatic'); m.castShadow = true; m.receiveShadow = true; m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); sc.group.add(m); out.staticTris = m.userData.tris; });
    out.worldTris = world.stats.tris; out.worldMeshes = world.stats.meshes; out.ms = Math.round(performance.now() - T0);
  };
  // palms and other planting for EI.EnvVeg: [x, z, species name, width, height]
  Yas.trees = function (E) { return []; };
  EI.EnvYas = Yas;
})();
