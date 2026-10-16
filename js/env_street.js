// Equation I - street-circuit extras (Monaco): the tunnel, the harbour and the open sea with quay walls, moored yachts,
// and the Armco-era details a city track needs instead of fields. Built after the venue, into the scenery's group.
window.EI = window.EI || {};
(function () {
  const U = EI.U; const Street = EI.EnvStreet = {};
  const C = (h) => new THREE.Color(h).convertSRGBToLinear();

  // ---------------------------------------------------------------- helpers
  function ribbonQuad(pos, nrm, col, uv, a, b, c, d, n, color, uvs) {
    // two triangles a-b-c, a-c-d with one normal and one colour
    for (const p of [a, b, c, a, c, d]) { pos.push(p[0], p[1], p[2]); nrm.push(n[0], n[1], n[2]); col.push(color.r, color.g, color.b); }
    const q = uvs || [[0, 0], [1, 0], [1, 1], [0, 1]]; for (const k of [0, 1, 2, 0, 2, 3]) uv.push(q[k][0], q[k][1]);
  }
  function mesh(pos, nrm, col, uv, mat, name) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const m = new THREE.Mesh(g, mat); m.name = name; return m;
  }
  function polyArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; } return a / 2; }
  function distToPoly(x, z, poly) {
    let best = Infinity;
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; const dx = b[0] - a[0], dz = b[1] - a[1]; const l2 = dx * dx + dz * dz || 1; const t = U.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1); const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); if (d < best) best = d; }
    return best;
  }

  // ---------------------------------------------------------------- tunnel: inner walls, a lit ceiling, a thick outer shell and portal faces
  function buildTunnel(E) {
    const t = E.t, sc = E.sc, TD = t.data.tunnel; if (!TD) return;
    const s0 = TD.s0, s1 = TD.s1; const H = 5.4, TH = 1.6; const step = 3;
    const pos = [], nrm = [], col = [], uv = []; const posL = [], nrmL = [], colL = [], uvL = [];
    const wallC = C(0xcfc8ba), ceilC = C(0x5c5b5e), shellC = C(0xb7ab98), kerbC = C(0x3a3a3c), lampC = C(0xfff2cc);
    let prev = null; let kseg = 0;
    for (let s = s0; s <= s1 + 0.01; s += step, kseg++) {
      const i = t.idxAtS(s); const wl = t.wallL[i] + 0.25, wr = t.wallR[i] + 0.25; const y = t.y[i];
      const P = (lat, dy) => [t.x[i] + t.nx[i] * lat, y + dy, t.z[i] + t.nz[i] * lat];
      const cur = { L0: P(-wl, 0), L1: P(-wl, H), R0: P(wr, 0), R1: P(wr, H), LT: P(-wl - 1.2, H + TH), RT: P(wr + 1.2, H + TH), LB: P(-wl - 1.2, 0), RB: P(wr + 1.2, 0) };
      if (prev) {
        const u0 = kseg - 1, u1 = kseg;
        // inner walls (normals facing the road), tiled 1 m
        ribbonQuad(pos, nrm, col, uv, prev.L0, cur.L0, cur.L1, prev.L1, [t.nx[i], 0, t.nz[i]], wallC, [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
        ribbonQuad(pos, nrm, col, uv, cur.R0, prev.R0, prev.R1, cur.R1, [-t.nx[i], 0, -t.nz[i]], wallC, [[u1, 0], [u0, 0], [u0, 1], [u1, 1]]);
        // ceiling (facing down) and the outer shell (top + outer sides) so nothing shows through from above
        ribbonQuad(pos, nrm, col, uv, prev.R1, cur.R1, cur.L1, prev.L1, [0, -1, 0], ceilC, [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
        ribbonQuad(pos, nrm, col, uv, prev.LT, cur.LT, cur.RT, prev.RT, [0, 1, 0], shellC);
        ribbonQuad(pos, nrm, col, uv, prev.LB, cur.LB, cur.LT, prev.LT, [-t.nx[i], 0, -t.nz[i]], shellC);
        ribbonQuad(pos, nrm, col, uv, cur.RB, prev.RB, prev.RT, cur.RT, [t.nx[i], 0, t.nz[i]], shellC);
        // a dark skirting band at the foot of each wall
        ribbonQuad(pos, nrm, col, uv, prev.L0, cur.L0, P(-wl + 0.001, 0.5), [prev.L0[0], prev.L0[1] + 0.5, prev.L0[2]], [t.nx[i], 0, t.nz[i]], kerbC);
        // ceiling lamps every 9 m: a short emissive strip down the middle
        if (kseg % 3 === 0) { const a = P(-0.5, H - 0.12), b = P(0.5, H - 0.12), c = [cur.R1[0] - t.nx[i] * (wr - 0.5), H - 0.12 + y, cur.R1[2] - t.nz[i] * (wr - 0.5)]; const j = t.idxAtS(s - step); const yj = t.y[j]; const Q = (lat, dy, jj) => [t.x[jj] + t.nx[jj] * lat, (jj === i ? y : yj) + dy, t.z[jj] + t.nz[jj] * lat]; ribbonQuad(posL, nrmL, colL, uvL, Q(-0.5, H - 0.12, j), Q(-0.5, H - 0.12, i), Q(0.5, H - 0.12, i), Q(0.5, H - 0.12, j), [0, -1, 0], lampC); }
      } else {
        // entry portal face: a frame around the mouth (the hill side)
        portal(pos, nrm, col, uv, cur, [-t.tx[i], 0, -t.tz[i]], shellC);
      }
      prev = cur; if (s + step > s1 + 0.01) portal(pos, nrm, col, uv, cur, [t.tx[i], 0, t.tz[i]], shellC);
    }
    const wallTex = tunnelWallTexture();
    const m = mesh(pos, nrm, col, uv, new THREE.MeshStandardMaterial({ map: wallTex, vertexColors: true, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide }), 'tunnel'); m.castShadow = true; m.receiveShadow = true; sc.group.add(m);
    const lamps = mesh(posL, nrmL, colL, uvL, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide }), 'tunnelLamps'); sc.group.add(lamps);
    // point lights are too costly for 50 lamps: brighten the tunnel with a long warm hemisphere light instead (main.js keeps one global hemi)
    E.tunnel = { s0, s1 };
    E.stats.tunnelSegs = kseg;
  }
  function portal(pos, nrm, col, uv, c, n, color) {
    // the face between the inner opening and the outer shell: left pillar, right pillar, lintel
    ribbonQuad(pos, nrm, col, uv, c.LB, c.L0, c.L1, c.LT, n, color); ribbonQuad(pos, nrm, col, uv, c.R0, c.RB, c.RT, c.R1, n, color); ribbonQuad(pos, nrm, col, uv, c.L1, c.R1, c.RT, c.LT, n, color);
  }
  function tunnelWallTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const ctx = c.getContext('2d'); const r = U.rng(31);
    ctx.fillStyle = '#d8d2c6'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 6000; i++) { const v = 190 + r() * 50; ctx.fillStyle = 'rgba(' + v + ',' + (v - 4) + ',' + (v - 12) + ',0.6)'; ctx.fillRect(r() * 256, r() * 256, 2, 2); }
    // tile joints every 64 px (0.25 of the 1 m tile)
    ctx.strokeStyle = 'rgba(90,86,80,0.45)'; ctx.lineWidth = 1.5; for (let k = 0; k <= 256; k += 64) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k, 256); ctx.moveTo(0, k); ctx.lineTo(256, k); ctx.stroke(); }
    ctx.fillStyle = 'rgba(60,60,60,0.5)'; ctx.fillRect(0, 236, 256, 20);
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8; return U.srgb(tex);
  }

  // ---------------------------------------------------------------- water: the harbour basins and the open sea, with quay walls down to the water
  function buildWater(E) {
    const t = E.t, sc = E.sc, data = t.data.scenery; const seaY = E.seaY != null ? E.seaY : (t.data.seaLevel != null ? t.data.seaLevel : -3.6);
    const polys = []; const geos = [];
    for (const w of data.water) if (w.length >= 3 && Math.abs(polyArea(w)) > 200) polys.push(w);
    // the sea: the coastline (land on its left, water on its right) closed far out to the east and south
    if (E.seaPoly) polys.push(E.seaPoly);
    for (const w of polys) {
      const shape = new THREE.Shape(); shape.moveTo(w[0][0], w[0][1]); for (let i = 1; i < w.length; i++) shape.lineTo(w[i][0], w[i][1]);
      const geo = new THREE.ShapeGeometry(shape); geo.rotateX(Math.PI / 2); geo.translate(0, seaY, 0); geos.push(geo);
    }
    if (geos.length) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x1d4b63, roughness: 0.08, metalness: 0.5, side: THREE.DoubleSide, envMapIntensity: 1.2 });
      const m = new THREE.Mesh(EI.Env.merge(geos), mat); m.name = 'water'; m.receiveShadow = true; sc.group.add(m);
    }
    // quay walls: a vertical band along every water edge from the water up to the ground; grey concrete with a dark tide line
    const pos = [], nrm = [], col = [], uv = []; const quay = C(0xb9b3a6), tide = C(0x5a5f58);
    for (const w of polys) for (let i = 0; i < w.length; i++) {
      const a = w[i], b = w[(i + 1) % w.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 0.5 || l > 600) continue;
      const ga = sc.height(a[0], a[1]), gb = sc.height(b[0], b[1]); if (Math.max(ga, gb) < seaY + 0.3) continue;
      const nx = (b[1] - a[1]) / l, nz = -(b[0] - a[0]) / l;      // one side; the material is double sided
      ribbonQuad(pos, nrm, col, uv, [a[0], seaY - 1, a[1]], [b[0], seaY - 1, b[1]], [b[0], gb + 0.15, b[1]], [a[0], ga + 0.15, a[1]], [nx, 0, nz], quay, [[0, 0], [l / 4, 0], [l / 4, 1], [0, 1]]);
      ribbonQuad(pos, nrm, col, uv, [a[0], seaY - 1, a[1]], [b[0], seaY - 1, b[1]], [b[0], seaY + 0.5, b[1]], [a[0], seaY + 0.5, a[1]], [nx, 0, nz], tide);
    }
    if (pos.length) { const m = mesh(pos, nrm, col, uv, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), 'quays'); m.receiveShadow = true; sc.group.add(m); }
    E.waterPolys = polys; E.seaY = seaY;
  }

  // ---------------------------------------------------------------- yachts: motor cruisers and a few sailing boats moored in the harbour
  function buildYachts(E) {
    const sc = E.sc, t = E.t; const polys = (E.waterPolys || []).filter(w => w !== E.seaPoly && Math.abs(polyArea(w)) > 4000);
    if (!polys.length) return; const rng = U.rng(2024); const y = E.seaY;
    const geos = []; const white = C(0xf4f5f3), cream = C(0xe8e4d8), glass = C(0x2a3a4a), navy = C(0x1d2d4a), teak = C(0xb08a5a), mast = C(0xd8d8d8);
    const box = (w, h, d, x, yy, z, color, m) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, yy, z); g.applyMatrix4(m); g.userData.color = color; geos.push(g); };
    const hull = (L, m, k) => {
      const W = L * 0.26, H = L * 0.09;
      // hull: a box with a tapered bow (two extra wedges), white topsides over a dark boot line
      box(L * 0.74, H, W, -L * 0.1, y + H * 0.5, 0, white, m); box(L * 0.74, H * 0.2, W * 1.01, -L * 0.1, y + H * 0.1, 0, navy, m);
      const bow = new THREE.CylinderGeometry(0, W * 0.5, L * 0.28, 4, 1); bow.rotateZ(-Math.PI / 2); bow.rotateX(Math.PI / 4); bow.scale(1, H / (W * 0.5), 1); bow.translate(L * 0.4, y + H * 0.5, 0); bow.applyMatrix4(m); bow.userData.color = white; geos.push(bow);
      if (k === 0) { // motor yacht: two decks of superstructure, dark glazing, a flybridge
        box(L * 0.46, H * 0.9, W * 0.8, -L * 0.08, y + H * 1.45, 0, cream, m); box(L * 0.44, H * 0.35, W * 0.82, -L * 0.08, y + H * 1.55, 0, glass, m);
        box(L * 0.26, H * 0.7, W * 0.56, -L * 0.12, y + H * 2.25, 0, cream, m); box(L * 0.25, H * 0.3, W * 0.58, -L * 0.12, y + H * 2.3, 0, glass, m);
        box(L * 0.3, H * 0.12, W * 0.7, L * 0.05, y + H * 1.05, 0, teak, m);
      } else { // sailing yacht: low coachroof, a tall mast with a boom
        box(L * 0.38, H * 0.5, W * 0.55, -L * 0.05, y + H * 1.22, 0, cream, m); box(L * 0.03, L * 1.2, L * 0.03, L * 0.05, y + H + L * 0.6, 0, mast, m); box(L * 0.4, L * 0.02, L * 0.02, -L * 0.15, y + H + L * 0.16, 0, mast, m);
      }
    };
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1);
    let n = 0; const placed = [];
    for (const w of polys) {
      const bx = U.polyBounds(w); const area = Math.abs(polyArea(w)); const want = Math.min(60, Math.round(area / 2600));
      for (let tries = 0; tries < want * 30 && n < 160; tries++) {
        const x = bx.x0 + rng() * (bx.x1 - bx.x0), z = bx.z0 + rng() * (bx.z1 - bx.z0); if (!U.pointInPoly(x, z, w)) continue;
        const d = distToPoly(x, z, w); if (d < 9) continue;
        const k = rng() < 0.7 ? 0 : 1; const L = k === 0 ? 14 + rng() * 26 : 10 + rng() * 10;
        let ok = true; for (const o of placed) if (Math.hypot(o[0] - x, o[1] - z) < (o[2] + L) * 0.55 + 4) { ok = false; break; } if (!ok) continue;
        // keep clear of the circuit's quays (the pit lane runs along the water)
        const pr = t.project(x, z, null); if (pr.dist < Math.max(t.wallL[pr.i], t.wallR[pr.i]) + 14) continue;
        const yaw = d < 22 ? Math.atan2(0, 1) + rng() * 0.4 + (rng() < 0.5 ? 0 : Math.PI) : rng() * Math.PI * 2;
        q.setFromAxisAngle(up, yaw); p.set(x, 0, z); m.compose(p, q, s1); hull(L, m, k); placed.push([x, z, L]); n++;
      }
    }
    if (!geos.length) return;
    const g = EI.Env.merge(geos, true); const mm = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05 })); mm.name = 'yachts'; mm.castShadow = true; mm.receiveShadow = true; sc.group.add(mm);
    E.stats.yachts = n;
  }

  Street.build = function (E) {
    const T0 = performance.now();
    buildWater(E); buildTunnel(E); buildYachts(E);
    E.timings.street = Math.round(performance.now() - T0);
  };
})();
