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
  // ---------------------------------------------------------------- tunnel (street circuit): a vaulted bore under the hotel, cream tiled walls over a
  // dark dado behind the rails, the haunches carrying continuous rows of light fittings, a dark soffit. The interior is lit by its own lamps:
  // the shell is baked (unlit, vertex light) so the sun never reaches inside, and a graded dark film over the road and rails fades in from
  // each portal. Brighter yellow reinforcement lighting in the first and last 40 m, as at the real portals.
  function buildTunnelVault(E) {
    const t = E.t, sc = E.sc, TD = t.data.tunnel; if (!TD) return;
    const s0 = TD.s0, s1 = TD.s1, step = 2; const Z = t.streetZones ? t.streetZones() : null;
    const Hw = 3.7, Hc = 6.1; // wall height before the haunch, crown height
    const P = [], N = [], Cc = [], UV = [], I = []; const LP = [], LC = [], LI = []; const SH = new EI.Env.Builder(); const OV = { p: [], uv: [], i: [] };
    const tile = C(0xe9e2d0), dado = C(0x4c4f52), haunch = C(0xb9b3a4), soffit = C(0x34363a), shellC = C(0xb7ab98);
    // profile across the bore (left to right): [lateral factor (-1 = left wall line, +1 = right), extra inward offset, height, colour, v]
    const prof = (wl, wr) => { const out = []; const arc = (side, a0, a1, n) => { for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; out.push([side, -Math.sin(a) * 1.9 + 0, Hw + (1 - Math.cos(a)) * 0 + Math.sin(a) * 0 + (Hc - Hw) * (1 - Math.cos(a)) / (1 - Math.cos(Math.PI / 2)), a < 0.4 ? tile : haunch]); } };
      out.push([-1, 0, 0, dado], [-1, 0, 1.15, dado], [-1, 0, 1.18, tile], [-1, 0, Hw, tile]);
      for (let k = 1; k <= 4; k++) { const a = k / 4 * Math.PI / 2; out.push([-1, Math.sin(a) * 1.9 * -1, Hw + (Hc - Hw) * (1 - Math.cos(a)), k < 2 ? tile : haunch]); }
      out.push([0, 0, Hc + 0.05, soffit]);
      for (let k = 4; k >= 1; k--) { const a = k / 4 * Math.PI / 2; out.push([1, Math.sin(a) * 1.9 * -1, Hw + (Hc - Hw) * (1 - Math.cos(a)), k < 2 ? tile : haunch]); }
      out.push([1, 0, Hw, tile], [1, 0, 1.18, tile], [1, 0, 1.15, dado], [1, 0, 0, dado]); return out; };
    let row = -1, vtx = 0, along = 0, prevI = -1;
    const nst = Math.ceil((s1 - s0) / step);
    for (let k = 0; k <= nst; k++) {
      const s = Math.min(s1, s0 + k * step); const i = t.idxAtS(s); const y = t.y[i];
      const wl = t.wallL[i] + (Z ? Z[-1].back[i] : 0) + 0.3, wr = t.wallR[i] + (Z ? Z[1].back[i] : 0) + 0.3;
      if (prevI >= 0) along += Math.hypot(t.x[i] - t.x[prevI], t.z[i] - t.z[prevI]); prevI = i;
      const pr = prof(wl, wr); const dIn = Math.min(s - s0, s1 - s); const portalBoost = 1 + 0.9 * (1 - U.smoothstep(15, 45, dIn));
      let v = 0, last = null;
      for (let c = 0; c < pr.length; c++) {
        const [f, inw, h, colr] = pr[c]; const lat = f < 0 ? -wl - inw : f > 0 ? wr + inw : (wr - wl) / 2;
        const x = t.x[i] + t.nx[i] * lat, z = t.z[i] + t.nz[i] * lat; if (last) v += Math.hypot(lat - last[0], h - last[1]); last = [lat, h];
        P.push(x, y + h, z); UV.push(along / 2, v / 2);
        // baked light: a warm wash peaking under the light rows (at the haunch), the dado and the soffit darker
        const glow = (0.34 + 0.5 * Math.exp(-Math.pow((h - (Hw + 0.3)) / 1.4, 2))) * portalBoost * (colr === soffit ? 0.5 : 1) * (0.92 + 0.16 * Math.sin(along * 0.9));
        Cc.push(colr.r * glow * 1.05, colr.g * glow * 0.98, colr.b * glow * 0.86);
        const nx = f < 0 ? t.nx[i] : f > 0 ? -t.nx[i] : 0, nz = f < 0 ? t.nz[i] : f > 0 ? -t.nz[i] : 0; N.push(nx, f === 0 ? -1 : 0, nz);
      }
      const K = pr.length; if (k > 0) for (let c = 0; c < K - 1; c++) { const a = vtx - K + c, b = vtx + c; I.push(a, b, a + 1, a + 1, b, b + 1); }
      vtx += K;
      // light fittings: a row of linear luminaires on each haunch (2.4 m fittings, 0.2 m gaps), denser yellow ones near the portals
      if (k > 0) for (const sd of [-1, 1]) {
        const j = t.idxAtS(s - step * 0.9); const W = sd < 0 ? wl : wr; const vh = (inw) => Hw + (Hc - Hw) * (1 - Math.cos(Math.asin(Math.min(1, inw / 1.9)))) - 0.05;
        const lat0 = sd * (W - 0.45), lat1 = sd * (W - 0.95);
        const A = (ii, l) => [t.x[ii] + t.nx[ii] * l, t.y[ii] + vh(W - Math.abs(l)), t.z[ii] + t.nz[ii] * l];
        const base = LP.length / 3; for (const q of [A(j, lat0), A(i, lat0), A(i, lat1), A(j, lat1)]) LP.push(q[0], q[1], q[2]);
        const lc = dIn < 40 ? [1.0, 0.86, 0.5] : [1.0, 0.95, 0.82]; for (let q = 0; q < 4; q++) LC.push(lc[0], lc[1], lc[2]); LI.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      // outer shell (top + sides), so nothing shows through from above
      const LT = [t.x[i] - t.nx[i] * (wl + 1.4), y + Hc + 1.4, t.z[i] - t.nz[i] * (wl + 1.4)], RT = [t.x[i] + t.nx[i] * (wr + 1.4), y + Hc + 1.4, t.z[i] + t.nz[i] * (wr + 1.4)];
      const LB = [LT[0], y - 0.3, LT[2]], RB = [RT[0], y - 0.3, RT[2]];
      if (k > 0) { const pv = buildTunnelVault._prev; SH.quad(pv.LT, LT, RT, pv.RT, shellC); SH.quad(pv.LB, LB, LT, pv.LT, shellC); SH.quad(RB, pv.RB, pv.RT, RT, shellC); }
      buildTunnelVault._prev = { LT, RT, LB, RB };
      // the dark film over the road and the rails, graded in from the portals (u = darkness)
      const dark = U.smoothstep(4, 42, dIn); const ob = OV.p.length / 3;
      for (const [lat, hy] of [[-wl + 0.42, 1.25], [-wl + 0.42, 0.02], [wr - 0.42, 0.02], [wr - 0.42, 1.25]]) { OV.p.push(t.x[i] + t.nx[i] * lat, y + hy, t.z[i] + t.nz[i] * lat); OV.uv.push(dark, 0.5); }
      if (k > 0) for (const [a, b] of [[0, 1], [1, 2], [2, 3]]) { const p0 = ob - 4; OV.i.push(p0 + a, ob + a, p0 + b, p0 + b, ob + a, ob + b); }
      // portal faces at both mouths: concrete frame, a dark band with the yellow-lit reveal
      if (k === 0 || k === nst) { const dir = k === 0 ? -1 : 1; const fx = t.tx[i] * dir * 0.05, fz = t.tz[i] * dir * 0.05; const m = EI.Env.frame(t.x[i] + fx, y, t.z[i] + fz, t.tx[i], t.tz[i], t.nx[i], t.nz[i]);
        SH.box(m, 0.6, Hc + 1.4, wl + 1.4 - (wl - 0.05), 0, 0, -(wl + 0.7), shellC); SH.box(m, 0.6, Hc + 1.4, 1.4, 0, 0, wr + 0.7, shellC); SH.box(m, 0.6, 1.4, wl + wr + 2.8, 0, Hc, (wr - wl) / 2, shellC);
        SH.box(m, 0.62, 0.5, wl + wr, 0, Hc - 0.1, (wr - wl) / 2, C(0xd8a91c)); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I); g.computeBoundingSphere();
    const vault = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tunnelTileTexture(), vertexColors: true, side: THREE.DoubleSide })); vault.name = 'tunnel'; sc.group.add(vault);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(LP, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(LC, 3)); lg.setIndex(LI); lg.computeBoundingSphere();
    const lamps = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide })); lamps.name = 'tunnelLamps'; sc.group.add(lamps);
    const sm = new THREE.Mesh(SH.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide })); sm.name = 'tunnelShell'; sm.castShadow = true; sm.receiveShadow = true; sc.group.add(sm);
    // dark film: alpha ramp texture (u = darkness), drawn over the asphalt, kerbs and the rail faces
    const [rc, rx] = EI.Env.canvas(64, 4); const gr = rx.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, 'rgba(10,9,8,0)'); gr.addColorStop(1, 'rgba(10,9,8,0.62)'); rx.fillStyle = gr; rx.fillRect(0, 0, 64, 4);
    const ot = new THREE.CanvasTexture(rc); ot.wrapS = ot.wrapT = THREE.ClampToEdgeWrapping;
    const og = new THREE.BufferGeometry(); og.setAttribute('position', new THREE.Float32BufferAttribute(OV.p, 3)); og.setAttribute('uv', new THREE.Float32BufferAttribute(OV.uv, 2)); og.setIndex(OV.i); og.computeBoundingSphere();
    const film = new THREE.Mesh(og, new THREE.MeshBasicMaterial({ map: ot, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 })); film.name = 'tunnelFilm'; film.renderOrder = 1; sc.group.add(film);
    E.tunnel = { s0, s1 }; E.stats.tunnelSegs = nst;
  }
  function tunnelTileTexture() {
    const [c, ctx] = EI.Env.canvas(256, 256); const r = U.rng(31);
    ctx.fillStyle = '#f1ece0'; ctx.fillRect(0, 0, 256, 256);
    // 0.5 x 0.25 m glazed tiles (the texture covers 2 x 2 m), soft grime streaks and a few darker replacement tiles
    for (let y = 0; y < 256; y += 32) for (let x = 0; x < 256; x += 64) { const v = 232 + r() * 16; ctx.fillStyle = r() < 0.04 ? 'rgb(205,200,188)' : 'rgb(' + v + ',' + (v - 4) + ',' + (v - 14) + ')'; ctx.fillRect(x + 1, y + 1, 62, 30); }
    ctx.fillStyle = 'rgba(120,112,100,0.3)'; for (let y = 0; y <= 256; y += 32) ctx.fillRect(0, y - 1, 256, 2); for (let x = 0; x <= 256; x += 64) ctx.fillRect(x - 1, 0, 2, 256);
    for (let i = 0; i < 30; i++) { ctx.fillStyle = 'rgba(80,72,60,' + (0.04 + r() * 0.06) + ')'; ctx.fillRect(r() * 256, 0, 2 + r() * 8, 256); }
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8; return U.srgb(tex);
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
      const mat = waterMaterial(E); const uni = E._waterUni;
      const m = new THREE.Mesh(EI.Env.merge(geos), mat); m.name = 'water'; m.receiveShadow = true; m.onBeforeRender = () => { uni.uTime.value = performance.now() / 1000; }; sc.group.add(m);
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

  const GW = new THREE.Color(1, 1, 1);
  // ---------------------------------------------------------------- water material: deep Mediterranean blue, three scrolling layers of small waves
  // (world-space normal map, so every basin and the open sea share one tile), sharp sun glints and the sky environment in the reflections
  function waterMaterial(E) {
    if (E._waterMat) return E._waterMat;
    const nt = U.normalTexture(256, 8, 3.2, 1, 17); nt.repeat.set(1, 1); nt.anisotropy = 4;
    const uni = { uTime: { value: 0 }, uWave: { value: nt } };
    const mat = new THREE.MeshStandardMaterial({ color: C(0x05202f), roughness: 0.12, metalness: 0.0, envMapIntensity: 0.85, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uni);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWW;\nuniform float uTime;\nuniform sampler2D uWave;')
        .replace('#include <normal_fragment_maps>', [
          'vec2 wq = vWW.xz; float wt = uTime;',
          'vec2 w1 = texture2D(uWave, wq * 0.071 + vec2(wt * 0.011, wt * 0.007)).xy * 2.0 - 1.0;',
          'vec2 w2 = texture2D(uWave, vec2(wq.x * 0.6 - wq.y * 0.8, wq.x * 0.8 + wq.y * 0.6) * 0.17 + vec2(-wt * 0.019, wt * 0.023)).xy * 2.0 - 1.0;',
          'vec2 w3 = texture2D(uWave, wq * 0.0093 + vec2(wt * 0.0021, -wt * 0.0017)).xy * 2.0 - 1.0;',
          'float wfar = clamp(length(vViewPosition) / 420.0, 0.0, 1.0);',
          'vec2 wd = (w1 * 0.55 + w2 * 0.4 * (1.0 - wfar) + w3 * 0.6) * 0.42;',
          'vec3 wn = normalize(vec3(-wd.x, 1.0, -wd.y));',
          'normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);',
          'float wsp = 0.5 + 0.5 * dot(w2, w1);'].join('\n'))
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 0.85 + 0.3 * smoothstep(0.2, 0.9, length(vWW.xz - vec2(260.0, 120.0)) / 600.0);')
        // the hazy sky would wash the basin out: reflections take the colour of the deep Mediterranean, the sun glints stay white
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectSpecular *= vec3(0.15, 0.21, 0.27);');
    };
    mat.customProgramCacheKey = () => 'ei-water';
    E._waterMat = mat; E._waterUni = uni; return mat;
  }

  // ---------------------------------------------------------------- yachts: procedural motor yachts (superyachts and flybridge cruisers),
  // sailing yachts with furled mainsails and tenders, merged into one body mesh (vertex colours) and one tinted-glass mesh
  function yachtKit(B, G) {
    const X = (m, x, y, z) => EI.Env.xf(m, x, y, z);
    // lofted hull, bow +x: stations stern -> bow; half-beam / deck sheer / topside colour bands; underwater faces skipped (opaque water)
    const hull = (m, L, Bm, H, cTop, cBoot, cStripe, cDeck, sail) => {
      const N = 11, secs = [];
      for (let k = 0; k <= N; k++) {
        const u = k / N, x = -L / 2 + u * L; const w = Bm / 2 * (u < 0.5 ? 0.86 + 0.14 * Math.sin(u / 0.5 * Math.PI / 2) : Math.pow(Math.max(0, Math.cos((u - 0.5) / 0.5 * Math.PI / 2)), sail ? 0.8 : 0.62)) + 0.02;
        const hd = H * (1 + 0.22 * Math.pow(Math.max(0, u - 0.45) / 0.55, 1.6)); const xr = u > 0.97 ? x + (sail ? 0.02 : 0.25) * L * (u - 0.97) / 0.03 * 0 : x;
        secs.push({ x: xr, w, hd, pts: [[w, hd], [w * 0.998, hd - 0.28], [w * 0.97, 0.38], [w * 0.92, 0.0], [w * 0.86, -0.32]] });
      }
      const cols = [cStripe || cTop, cTop, cBoot, cBoot];
      for (let k = 0; k < N; k++) { const a = secs[k], b = secs[k + 1];
        for (let j = 0; j < 4; j++) for (const sd of [1, -1]) { const A = X(m, a.x, a.pts[j][1], sd * a.pts[j][0]), Bq = X(m, b.x, b.pts[j][1], sd * b.pts[j][0]), Cq = X(m, b.x, b.pts[j + 1][1], sd * b.pts[j + 1][0]), D = X(m, a.x, a.pts[j + 1][1], sd * a.pts[j + 1][0]); B.quad(A, Bq, Cq, D, cols[j]); }
        B.quad(X(m, a.x, a.hd, -a.w), X(m, b.x, b.hd, -b.w), X(m, b.x, b.hd, b.w), X(m, a.x, a.hd, a.w), cDeck);
      }
      const s0 = secs[0]; for (let j = 0; j < 4; j++) B.quad(X(m, s0.x, s0.pts[j][1], -s0.pts[j][0]), X(m, s0.x, s0.pts[j][1], s0.pts[j][0]), X(m, s0.x, s0.pts[j + 1][1], s0.pts[j + 1][0]), X(m, s0.x, s0.pts[j + 1][1], -s0.pts[j + 1][0]), j ? cBoot : cTop);
      return secs;
    };
    // superstructure deck: plan from xa (aft) to xb (fore), half width w, height h, raked front; glass band all round
    const deck = (m, xa, xb, y, w, h, cW, rake, glassBand) => {
      const r = rake || 0.25; const fw = w * 0.72; const P = (x, yy, z) => X(m, x, yy, z);
      const a0 = P(xa, y, -w), a1 = P(xa, y, w), b0 = P(xb, y, -fw), b1 = P(xb, y, fw); const xt = xb - h * r * 3;
      const A0 = P(xa, y + h, -w), A1 = P(xa, y + h, w), B0 = P(xt, y + h, -fw * 0.92), B1 = P(xt, y + h, fw * 0.92);
      B.quad(a0, b0, B0, A0, cW); B.quad(b1, a1, A1, B1, cW); B.quad(b0, b1, B1, B0, cW); B.quad(a1, a0, A0, A1, cW); B.quad(A0, B0, B1, A1, cW);
      if (glassBand !== false) { const g0 = 0.32, g1 = 0.82; const e = 0.04; const Q = (x, yy, z) => X(m, x, y + yy * h, z);
        const ga0 = Q(xa - e, g0, -w - e), ga1 = Q(xa - e, g0, w + e), gb0 = Q(xb - (g0 * h) * r * 3 + e, g0, -fw - e), gb1 = Q(xb - (g0 * h) * r * 3 + e, g0, fw + e);
        const GA0 = Q(xa - e, g1, -w - e), GA1 = Q(xa - e, g1, w + e), GB0 = Q(xb - (g1 * h) * r * 3 + e, g1, -fw * 0.95 - e), GB1 = Q(xb - (g1 * h) * r * 3 + e, g1, fw * 0.95 + e);
        G.quad(ga0, gb0, GB0, GA0, GW); G.quad(gb1, ga1, GA1, GB1, GW); G.quad(gb0, gb1, GB1, GB0, GW); G.quad(ga1, ga0, GA0, GA1, GW); }
    };
    return { hull, deck };
  }
  function buildHarbour(E) {
    const sc = E.sc, t = E.t, D = t.data, HB = D.harbour; const seaY = E.seaY; const rng = U.rng(2024);
    const harbour = (E.waterPolys || []).filter(w => w !== E.seaPoly && Math.abs(polyArea(w)) > 4000);
    if (!harbour.length) return;
    const Bd = new EI.Env.Builder(), Gl = new EI.Env.Builder(), Pq = new EI.Env.Builder(), Cl = new EI.Env.Builder();
    const K = yachtKit(Bd, Gl); const I4 = new THREE.Matrix4();
    const white = C(0xf6f7f5), cream = C(0xece8dc), teak = C(0x8a6a4c), deckW = C(0xdcdad3), navy = C(0x1b2c4e), boot = C(0x2a3550), grey = C(0x8c9399), steelC = C(0xc9ced2), black = C(0x15171a), silver = C(0xb9c0c6), blueStripe = C(0x1f4f9a);
    // ---- piers / pontoons: concrete decks just above the water (floating) or at quay level, cleats, power posts, a few people
    const piers = (HB && HB.piers) || []; const pierPolys = [];
    for (const pr of piers) {
      const p = pr.p; if (p.length < 3) continue; const y = pr.f ? seaY + 0.55 : Math.max(seaY + 1.4, E.ground((p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2)); pierPolys.push(p);
      const shape = new THREE.Shape(); shape.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) shape.lineTo(p[i][0], p[i][1]);
      const g = new THREE.ShapeGeometry(shape); g.rotateX(Math.PI / 2); const pos = g.attributes.position; for (let i = 0; i < pos.count; i++) pos.setY(i, y); const idx = g.index.array;
      for (let i = 0; i < idx.length; i += 3) { const a = [pos.getX(idx[i]), y, pos.getZ(idx[i])], b = [pos.getX(idx[i + 1]), y, pos.getZ(idx[i + 1])], c = [pos.getX(idx[i + 2]), y, pos.getZ(idx[i + 2])]; Pq.tri(a, c, b, C(0xc9c4b8)); }
      for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 0.3) continue;
        Pq.quad([a[0], seaY - 0.4, a[1]], [b[0], seaY - 0.4, b[1]], [b[0], y, b[1]], [a[0], y, a[1]], C(0x7f7a70));
        for (let s = 1.5; s < l - 1; s += 3.2) { const u = s / l; Cl.box(EI.Env.frame(a[0] + (b[0] - a[0]) * u, y, a[1] + (b[1] - a[1]) * u, (b[0] - a[0]) / l, (b[1] - a[1]) / l, -(b[1] - a[1]) / l, (b[0] - a[0]) / l), 0.32, 0.14, 0.12, 0, 0, 0, black); }
        for (let s = 6; s < l - 3; s += 14) { const u = s / l; const x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u; Cl.box(I4, 0.3, 1.0, 0.3, x, y, z, white); Cl.box(I4, 0.34, 0.18, 0.34, x, y + 1.0, z, C(0x1f7a4a)); }
      }
    }
    E.stats.piers = pierPolys.length;
    const inPier = (x, z) => { for (const p of pierPolys) if (U.pointInPoly(x, z, p)) return true; return false; };
    // ---- mooring lines: both long sides of every pier, and the quay edges of the main basin; boats moor stern-to
    const lines = [];
    for (const p of pierPolys) { // long axis from the polygon's farthest pair of points
      let bi = 0, bj = 1, bd = 0; for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) { const d = Math.hypot(p[i][0] - p[j][0], p[i][1] - p[j][1]); if (d > bd) { bd = d; bi = i; bj = j; } }
      if (bd < 25) continue; const a = p[bi], b = p[bj]; const tx = (b[0] - a[0]) / bd, tz = (b[1] - a[1]) / bd; let half = 0; for (const q of p) half = Math.max(half, Math.abs((q[0] - a[0]) * -tz + (q[1] - a[1]) * tx)); half = Math.max(1.2, half / 2 + 0.6);
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; for (const sd of [-1, 1]) lines.push({ a: [a[0] + -tz * sd * half, a[1] + tx * sd * half], b: [b[0] + -tz * sd * half, b[1] + tx * sd * half], nx: -tz * sd, nz: tx * sd, len: bd, cls: bd > 140 ? 1 : 2, mid });
    }
    for (const w of harbour) for (let i = 0; i < w.length; i++) { // quay edges facing the water, the long ones near the circuit carry the superyachts
      const a = w[i], b = w[(i + 1) % w.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 35) continue; let nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; if (!U.pointInPoly(mx + nx * 3, mz + nz * 3, w)) { nx = -nx; nz = -nz; } if (!U.pointInPoly(mx + nx * 3, mz + nz * 3, w)) continue;
      lines.push({ a: [a[0] + nx * 0.8, a[1] + nz * 0.8], b: [b[0] + nx * 0.8, b[1] + nz * 0.8], nx, nz, len: l, cls: 0 });
    }
    // ---- boats
    const occ = new Map(); const OG = 3; const okey = (x, z) => Math.floor(x / OG) * 8192 + Math.floor(z / OG);
    const free = (x, z, ax, az, L, Bm) => { for (let a = -L / 2; a <= L / 2; a += 2) for (let b = -Bm / 2; b <= Bm / 2; b += Math.max(1, Bm / 3)) { const px = x + ax * a - az * b, pz = z + az * a + ax * b; if (occ.has(okey(px, pz)) || inPier(px, pz)) return false; if (sc.gridHeight && sc.gridHeight(px, pz) > seaY + 0.35) return false; let inW = false; for (const w of harbour) if (U.pointInPoly(px, pz, w)) { inW = true; break; } if (!inW && !(E.seaPoly && U.pointInPoly(px, pz, E.seaPoly))) return false; } return true; };
    const mark = (x, z, ax, az, L, Bm) => { for (let a = -L / 2 - 1; a <= L / 2 + 1; a += 1.5) for (let b = -Bm / 2 - 0.8; b <= Bm / 2 + 0.8; b += 1) occ.set(okey(x + ax * a - az * b, z + az * a + ax * b), 1); };
    let nBoats = 0, nSuper = 0, nSail = 0; const pr = {};
    const motorYacht = (m, L, kind) => {
      const Bm = L * (kind === 'super' ? 0.185 : 0.3), H = kind === 'super' ? 1.8 + L * 0.034 : 1.1 + L * 0.02;
      const dark = rng() < 0.25; const top = dark ? (rng() < 0.5 ? navy : C(0x3d4247)) : white; const stripe = !dark && rng() < 0.45 ? blueStripe : null;
      K.hull(m, L, Bm, H, top, boot, stripe, kind === 'super' || rng() < 0.6 ? deckW : teak, false);
      // swim platform, aft deck furniture
      Bd.box(m, 0.18 * Bm + 1.0, 0.25, Bm * 0.9, -L / 2 - 0.5, 0.35, 0, teak);
      if (kind === 'super') {
        const nd = L > 50 ? 4 : L > 36 ? 3 : 2; let xa = -L * 0.4, xb = L * 0.27; const hd = 2.5; let y = H;
        for (let k = 0; k < nd; k++) { const w = Bm / 2 * (0.93 - k * 0.06); K.deck(m, xa, xb, y, w, hd, k % 2 ? cream : white, 0.12 + k * 0.05); Bd.box(m, (xb - xa) * 0.25, 0.22, w * 2.05, xa - (xb - xa) * 0.08, y + hd - 0.11, 0, white); y += hd; xa += L * 0.04; xb -= L * (0.06 + k * 0.025); }
        // radar arch, radomes and the mast on the sun deck
        const mx = (xa + xb) / 2 + L * 0.02; for (const sd of [-1, 1]) Bd.beam(m, [mx - 1.6, y, sd * Bm * 0.22], [mx, y + 2.6, sd * Bm * 0.08], 0.32, white); Bd.box(m, 1.4, 0.35, Bm * 0.2, mx, y + 2.5, 0, white);
        Bd.beam(m, [mx, y + 2.8, 0], [mx + 0.3, y + 5.2, 0], 0.12, steelC); Bd.box(m, 0.12, 0.12, 2.4, mx + 0.25, y + 4.6, 0, steelC);
        for (const sd of [-1, 1]) { EI.StreetKit.ball(Bd, m, mx - 0.4, y + 3.3, sd * 0.9, 0.42, 0.45, 0.42, white, 6); }
        // tender on the aft deck
        const tl = Math.min(7, L * 0.12); K.hull(new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().makeTranslation(-L * 0.38, H + 0.05, 0)), tl, tl * 0.38, 0.6, rng() < 0.5 ? C(0x2d3238) : white, C(0x30343a), null, teak, false);
        nSuper++;
      } else {
        // flybridge cruiser: one saloon deck, flybridge with a bimini top
        K.deck(m, -L * 0.3, L * 0.18, H, Bm * 0.4, 1.9, white, 0.3); const fy = H + 1.9;
        Bd.box(m, L * 0.32, 0.9, Bm * 0.7, -L * 0.1, fy, 0, white); Bd.box(m, L * 0.26, 0.08, Bm * 0.74, -L * 0.14, fy + 2.0, 0, rng() < 0.5 ? C(0x1d2e4a) : C(0xe8e6de)); for (const sd of [-1, 1]) Bd.beam(m, [-L * 0.24, fy + 0.9, sd * Bm * 0.33], [-L * 0.2, fy + 2.0, sd * Bm * 0.33], 0.06, steelC);
      }
    };
    const sailYacht = (m, L) => {
      const Bm = L * 0.3, H = 0.9 + L * 0.015; K.hull(m, L, Bm, H, rng() < 0.2 ? navy : white, boot, null, teak, true);
      Bd.box(m, L * 0.32, 0.5, Bm * 0.5, -L * 0.05, H, 0, cream); Gl.quad(EI.Env.xf(m, -L * 0.05 + L * 0.16 + 0.01, H + 0.15, -Bm * 0.2), EI.Env.xf(m, -L * 0.05 + L * 0.16 + 0.01, H + 0.15, Bm * 0.2), EI.Env.xf(m, -L * 0.05 + L * 0.16 + 0.01, H + 0.42, Bm * 0.2), EI.Env.xf(m, -L * 0.05 + L * 0.16 + 0.01, H + 0.42, -Bm * 0.2), GW);
      const mh = L * 1.35; const mx = L * 0.08; Bd.beam(m, [mx, H, 0], [mx, H + mh, 0], 0.14 + L * 0.004, silver);
      // boom with the furled mainsail under its blue cover, forestay with the rolled genoa, shrouds
      Bd.beam(m, [mx, H + 1.6, 0], [mx - L * 0.42, H + 1.75, 0], 0.12, silver); Bd.beam(m, [mx - 0.2, H + 1.85, 0], [mx - L * 0.4, H + 1.95, 0], 0.32, rng() < 0.6 ? C(0x1f3f7a) : C(0xe9e6dc));
      Bd.beam(m, [mx, H + mh, 0], [L * 0.5, H + 0.4, 0], 0.07, C(0xe8e8e2)); for (const sd of [-1, 1]) Bd.beam(m, [mx, H + mh * 0.92, 0], [mx - 0.3, H + 0.2, sd * Bm * 0.46], 0.025, C(0x707478));
      Bd.beam(m, [mx, H + mh, 0], [-L * 0.5 + 0.3, H + 0.3, 0], 0.025, C(0x707478)); nSail++;
    };
    const tender = (m, L) => { K.hull(m, L, L * 0.42, 0.55, C(0x5d6268), C(0x3a3d42), null, C(0x5d6268), false); Bd.box(m, 0.5, 0.6, 0.6, -L * 0.2, 0.55, 0, C(0x2a2c30)); };
    for (const ln of lines) {
      const dx = ln.b[0] - ln.a[0], dz = ln.b[1] - ln.a[1]; const l = Math.hypot(dx, dz); const tx = dx / l, tz = dz / l;
      // near the circuit (within ~120 m of the track) the quays carry the superyachts
      const nearTrack = ln.cls === 0 && (t.project((ln.a[0] + ln.b[0]) / 2, (ln.a[1] + ln.b[1]) / 2, null, pr).dist < 130);
      for (let s = 2; s < l - 2;) {
        let kind, L; const r = rng();
        if (ln.cls === 0) { if (nearTrack && r < 0.85) { kind = 'super'; L = 32 + rng() * 36; } else if (r < 0.95) { kind = 'cruiser'; L = 14 + rng() * 12; } else { kind = 'sail'; L = 14 + rng() * 10; } }
        else if (ln.cls === 1) { if (r < 0.45) { kind = 'super'; L = 26 + rng() * 18; } else if (r < 0.85) { kind = 'cruiser'; L = 12 + rng() * 10; } else { kind = 'sail'; L = 12 + rng() * 8; } }
        else { if (r < 0.55) { kind = 'cruiser'; L = 9 + rng() * 9; } else if (r < 0.92) { kind = 'sail'; L = 9 + rng() * 7; } else { kind = 'tender'; L = 4 + rng() * 2; } }
        const Bm = L * (kind === 'super' ? 0.185 : kind === 'sail' ? 0.3 : 0.3); const gap = 0.6 + rng() * 0.8;
        const along = s + Bm / 2; if (along > l - Bm / 2) break;
        const sx = ln.a[0] + tx * along, sz = ln.a[1] + tz * along; const cx = sx + ln.nx * (L / 2 + 1.2), cz = sz + ln.nz * (L / 2 + 1.2);
        if (rng() < 0.12 || !free(cx, cz, ln.nx, ln.nz, L, Bm)) { s += Bm * 0.6 + gap; continue; }
        const yaw = Math.atan2(-ln.nz, ln.nx) + (rng() - 0.5) * 0.04; const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(cx, seaY, cz);
        if (kind === 'super' || kind === 'cruiser') motorYacht(m, L, kind); else if (kind === 'sail') sailYacht(m, L); else tender(m, L);
        mark(cx, cz, ln.nx, ln.nz, L, Bm); nBoats++; s += Bm + gap;
        // a tender tied alongside some superyachts
        if (kind === 'super' && rng() < 0.3) { const tl = 5 + rng() * 2; const ox = cx + ln.nx * (L / 2 + tl * 0.7), oz = cz + ln.nz * (L / 2 + tl * 0.7); if (free(ox, oz, ln.nx, ln.nz, tl, tl * 0.45)) { tender(new THREE.Matrix4().makeRotationY(yaw).setPosition(ox, seaY, oz), tl); mark(ox, oz, ln.nx, ln.nz, tl, tl * 0.45); nBoats++; } }
      }
    }
    // a few big yachts at anchor off the harbour mouth (the sea beyond the breakwater) and dinghies crossing the basin
    if (E.seaPoly) { let placed = 0; for (let k = 0; k < 400 && placed < 9; k++) { const x = 300 + rng() * 700, z = 150 + rng() * 650; if (!U.pointInPoly(x, z, E.seaPoly) || E.dcAt(x, z) < 160) continue; let near = false; for (const w of harbour) if (distToPoly(x, z, w) < 60) near = true; if (near) continue; const L = 45 + rng() * 40; const yaw = 0.6 + rng() * 0.4; const ax = Math.cos(yaw), az = -Math.sin(yaw); if (!free(x, z, ax, az, L, L * 0.2)) continue; motorYacht(new THREE.Matrix4().makeRotationY(yaw).setPosition(x, seaY, z), L, 'super'); mark(x, z, ax, az, L, L * 0.2); placed++; nBoats++; } }
    for (let k = 0, placed = 0; k < 300 && placed < 10; k++) { const w = harbour[0]; const bx = U.polyBounds(w); const x = bx.x0 + rng() * (bx.x1 - bx.x0), z = bx.z0 + rng() * (bx.z1 - bx.z0); if (!U.pointInPoly(x, z, w) || distToPoly(x, z, w) < 25) continue; const yaw = rng() * 6.283; const ax = Math.cos(yaw), az = -Math.sin(yaw); if (!free(x, z, ax, az, 6, 2.5)) continue; tender(new THREE.Matrix4().makeRotationY(yaw).setPosition(x, seaY, z), 4.5 + rng() * 2); mark(x, z, ax, az, 6, 2.5); placed++; nBoats++; }
    // ---- breakwaters: concrete crowns above the swell, armour-block flanks, the green / red harbour-mouth beacons
    for (const bw of (HB && HB.breakwaters) || []) {
      const p = bw.p; const y = seaY + 2.6; const shape = new THREE.Shape(); shape.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) shape.lineTo(p[i][0], p[i][1]);
      const g = new THREE.ShapeGeometry(shape); g.rotateX(Math.PI / 2); const pos = g.attributes.position, idx = g.index.array; for (let i = 0; i < idx.length; i += 3) Pq.tri([pos.getX(idx[i]), y, pos.getZ(idx[i])], [pos.getX(idx[i + 2]), y, pos.getZ(idx[i + 2])], [pos.getX(idx[i + 1]), y, pos.getZ(idx[i + 1])], C(0xbdb8ad));
      for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; Pq.quad([a[0], seaY - 0.5, a[1]], [b[0], seaY - 0.5, b[1]], [b[0], y, b[1]], [a[0], y, a[1]], C(0x8f8a80)); }
      let far = p[0], fd = -1; for (const q of p) { const d = E.dcAt(q[0], q[1]); if (d > fd) { fd = d; far = q; } }
      const red = Math.abs(polyArea(p)) > 2500; SK().col(Cl, I4, far[0], far[1], y, y + 7, 0.9, 0.7, 10, white, false); SK().col(Cl, I4, far[0], far[1], y + 7, y + 9, 0.75, 0.75, 10, red ? C(0xc8102e) : C(0x1e8a4a), true);
    }
    // ---- buoys: yellow mooring buoys in the basin, a red / green pair at the mouth
    for (let k = 0, placed = 0; k < 300 && placed < 24; k++) { const w = harbour[0]; const bx = U.polyBounds(w); const x = bx.x0 + rng() * (bx.x1 - bx.x0), z = bx.z0 + rng() * (bx.z1 - bx.z0); if (!U.pointInPoly(x, z, w) || occ.has(okey(x, z)) || distToPoly(x, z, w) < 12) continue; SK().ball(Cl, I4, x, seaY + 0.15, z, 0.45, 0.45, 0.45, C(0xf2c21a), 6); placed++; }
    // ---- people on the pontoons
    let nPeople = 0; for (const p of pierPolys) { const bx = U.polyBounds(p); for (let k = 0; k < 6; k++) { const x = bx.x0 + rng() * (bx.x1 - bx.x0), z = bx.z0 + rng() * (bx.z1 - bx.z0); if (!U.pointInPoly(x, z, p)) continue; const y = seaY + 0.55 + (p.f ? 0 : 0); person(Cl, x, y, z, rng); nPeople++; } }
    // merged meshes: hull / deck / superstructure (vertex colours), tinted glass, pontoons + breakwaters, small clutter
    const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.05, side: THREE.DoubleSide, envMapIntensity: 0.6 });
    const glassMat = new THREE.MeshStandardMaterial({ color: C(0x1a2a38), roughness: 0.06, metalness: 0.55, envMapIntensity: 0.8, side: THREE.DoubleSide });
    const add = (Bb, mat, name, shadow) => { if (!Bb.count) return null; const m = new THREE.Mesh(Bb.geometry(), mat); m.name = name; m.castShadow = !!shadow; m.receiveShadow = true; sc.group.add(m); return m; };
    add(Bd, bodyMat, 'yachts', true); add(Gl, glassMat, 'yachtGlass', false);
    sc.statics.add(Pq.geometry(), 0.85, 0.0, 'main'); sc.statics.add(Cl.geometry(), 0.6, 0.1, 'clutter');
    E.stats.yachts = nBoats; E.stats.superyachts = nSuper; E.stats.sailYachts = nSail; E.stats.yachtTris = Math.round((Bd.count + Gl.count) / 3); E.stats.pontoonPeople = nPeople;
  }
  const SK = () => EI.StreetKit;
  function person(B, x, y, z, rng) {
    const I = new THREE.Matrix4(); const shirt = C([0xf2f2f2, 0x1d2e4a, 0x2b6fb8, 0xc8102e, 0xe8d9b0, 0x2a2b2e][Math.floor(rng() * 6)]), legs = C([0x2a2b2e, 0xd8d0b8, 0x1d2e4a][Math.floor(rng() * 3)]), skin = C([0xe8c0a0, 0xc89878, 0x8a5a3a][Math.floor(rng() * 3)]);
    B.box(I, 0.34, 0.85, 0.22, x, y, z, legs); B.box(I, 0.42, 0.62, 0.26, x, y + 0.85, z, shirt); SK().ball(B, I, x, y + 1.62, z, 0.12, 0.14, 0.12, skin, 5);
  }

  // ---------------------------------------------------------------- the Yacht Club de Monaco and the temporary hospitality terraces on the quays
  function buildQuayBuildings(E) {
    const sc = E.sc, t = E.t, ST = t.data.street; if (!ST) return; const B = new EI.Env.Builder(), Gb = new EI.Env.Builder();
    const white = C(0xf4f4f1), shade = C(0xdcdedd), glass = C(0x24384a), rail = C(0xd4d8db), canvas = C(0xfbfbf8), teak = C(0xa47a4a), red = C(0xc8102e), navy = C(0x1b2c4e);
    const along = (s0, s1, side, gap) => { const i0 = t.idxAtS(s0), i1 = t.idxAtS(s1); const w0 = (side < 0 ? t.wallL[i0] : t.wallR[i0]) + gap, w1 = (side < 0 ? t.wallL[i1] : t.wallR[i1]) + gap;
      const A = [t.x[i0] + t.nx[i0] * side * w0, t.z[i0] + t.nz[i0] * side * w0], Bp = [t.x[i1] + t.nx[i1] * side * w1, t.z[i1] + t.nz[i1] * side * w1]; const L = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]); let ax = (Bp[0] - A[0]) / L, az = (Bp[1] - A[1]) / L; let nx = -az, nz = ax; const im = t.idxAtS((s0 + s1) / 2); if (nx * t.nx[im] * side + nz * t.nz[im] * side < 0) { nx = -nx; nz = -nz; }
      return { cx: (A[0] + Bp[0]) / 2, cz: (A[1] + Bp[1]) / 2, ax, az, nx, nz, L, y: t.y[im] - 0.03 }; };
    // Yacht Club de Monaco: a long white liner of a building, decks stepping back towards a rounded bow at the harbour end, porthole band below
    if (ST.ycm) {
      const [s0, s1, side, gap] = ST.ycm; const f = along(s0, s1, side, gap); const m = EI.Env.frame(f.cx, f.y, f.cz, f.ax, f.az, f.nx, f.nz); const L = f.L, hl = L / 2;
      const P = (x, y, z) => EI.Env.xf(m, x, y, z);
      // stepped decks: [height, depth, setback at the land end, setback at the bow end]
      const decks = [[5.0, 26, 0, 0], [3.6, 23, 4, 6], [3.4, 19, 10, 16], [3.2, 14, 18, 30]]; let y = 0;
      decks.forEach(([h, d, sa, sb], k) => {
        const xa = -hl + sa, xb = hl - sb; const z0 = 0.5, z1 = z0 + d; const R = d / 2; const zc = z0 + R;
        // plan: a rectangle closed by a half round at the bow (+x) end
        const ring = [[xa, z0], [xb - R * 0.2, z0]]; for (let a = -Math.PI / 2; a <= Math.PI / 2 + 0.01; a += Math.PI / 10) ring.push([xb - R * 0.2 + Math.cos(a) * R * 0.9, zc + Math.sin(a) * R]); ring.push([xa, z1]);
        for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; B.quad(P(a[0], y, a[1]), P(b[0], y, b[1]), P(b[0], y + h, b[1]), P(a[0], y + h, a[1]), white);
          const g0 = k === 0 ? 1.6 : 0.9, g1 = k === 0 ? 2.4 : h - 0.7; const e = 0.03; const nA = [a[0], a[1]], nB = [b[0], b[1]]; const ex = (q) => { const dx = q[0] - (xb - R * 0.2 * 0.5), dz = q[1] - zc; const l = Math.hypot(dx, dz) || 1; return [q[0] + dx / l * e, q[1] + dz / l * e]; }; const qa = ex(nA), qb = ex(nB);
          if (k === 0) { const segL = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let s = 1.2; s < segL - 0.8; s += 2.4) { const u = s / segL; const cxp = a[0] + (b[0] - a[0]) * u, czp = a[1] + (b[1] - a[1]) * u; const c = ex([cxp, czp]); for (let j = 0; j < 6; j++) { const a0 = j / 6 * 6.283, a1 = (j + 1) / 6 * 6.283; const dirx = (b[0] - a[0]) / segL, dirz = (b[1] - a[1]) / segL; Gb.tri(P(c[0], y + 2.0, c[1]), P(c[0] + dirx * Math.cos(a0) * 0.42, y + 2.0 + Math.sin(a0) * 0.42, c[1] + dirz * Math.cos(a0) * 0.42), P(c[0] + dirx * Math.cos(a1) * 0.42, y + 2.0 + Math.sin(a1) * 0.42, c[1] + dirz * Math.cos(a1) * 0.42), GW); } } }
          else Gb.quad(P(qa[0], y + g0, qa[1]), P(qb[0], y + g0, qb[1]), P(qb[0], y + g1, qb[1]), P(qa[0], y + g1, qa[1]), GW);
        }
        // deck slab (overhanging a little) with white rails along its edge
        const yy = y + h; for (let i = 1; i < ring.length - 1; i++) B.tri(P(ring[0][0], yy, ring[0][1]), P(ring[i + 1][0], yy, ring[i + 1][1]), P(ring[i][0], yy, ring[i][1]), k === decks.length - 1 ? teak : shade);
        for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; B.beam(m, [a[0], yy + 1.05, a[1]], [b[0], yy + 1.05, b[1]], 0.06, rail); B.box(m, 0.05, 0.02, 0.05, a[0], yy, a[1], rail); }
        y += h;
      });
      // the signal mast with yards and the club burgee colours
      const mx = hl - 24, mz = 0.5 + 13; B.beam(m, [mx, y, mz], [mx, y + 16, mz], 0.3, white); B.beam(m, [mx - 3.5, y + 11, mz], [mx + 3.5, y + 11, mz], 0.14, white); B.box(m, 1.6, 1.0, 0.04, mx + 1.0, y + 15.2, mz, red); B.box(m, 1.6, 0.5, 0.045, mx + 1.0, y + 15.0, mz, white);
      E.stats.ycm = Math.round(L);
    }
    // hospitality terraces: glazed ground floor, an open terrace above under a white tensioned canopy, team / partner colour fascia
    for (const [s0, s1, side, gap, depth] of ST.terraces || []) {
      const f = along(s0, s1, side, gap); const m = EI.Env.frame(f.cx, f.y, f.cz, f.ax, f.az, f.nx, f.nz); const L = f.L, hl = L / 2; const P = (x, y, z) => EI.Env.xf(m, x, y, z);
      const n = Math.max(1, Math.round(L / 16)); const ul = L / n;
      for (let k = 0; k < n; k++) {
        const xa = -hl + k * ul + 0.4, xb = xa + ul - 0.8; const xc = (xa + xb) / 2, w = xb - xa;
        B.box(m, w, 0.4, depth, xc, 0, depth / 2, shade); B.box(m, w, 3.4, 0.2, xc, 0.4, depth - 0.1, white); for (const sx of [xa, xb]) B.box(m, 0.25, 3.8, depth, sx, 0.4, depth / 2, white);
        Gb.quad(P(xa, 0.5, 0.1), P(xb, 0.5, 0.1), P(xb, 3.6, 0.1), P(xa, 3.6, 0.1), GW);
        for (let x = xa + 1.6; x < xb - 0.5; x += 1.6) B.box(m, 0.08, 3.2, 0.08, x, 0.45, 0.05, white);
        B.box(m, w + 0.3, 0.35, depth + 0.6, xc, 3.8, depth / 2 - 0.2, white, { bottom: true }); B.box(m, w + 0.32, 0.5, 0.1, xc, 3.85, -0.12, k % 2 ? navy : red);
        for (let x = xa; x <= xb + 0.01; x += w / 4) B.beam(m, [x, 4.15, 0.2], [x, 5.2, 0.2], 0.04, rail); B.beam(m, [xa, 5.2, 0.2], [xb, 5.2, 0.2], 0.05, rail);
        // canopy: two pitched membrane panels on slender masts
        const ry = 7.6; for (const sx of [xa + 0.3, xb - 0.3]) for (const sz of [0.6, depth - 0.6]) B.beam(m, [sx, 4.15, sz], [sx, ry, sz], 0.1, rail);
        B.quad(P(xa, ry - 0.8, 0.0), P(xb, ry - 0.8, 0.0), P(xb, ry, depth / 2), P(xa, ry, depth / 2), canvas); B.quad(P(xa, ry, depth / 2), P(xb, ry, depth / 2), P(xb, ry - 0.8, depth), P(xa, ry - 0.8, depth), canvas);
        for (let x = xa + 1; x < xb - 1; x += 2.2) for (let z = 1.5; z < depth - 1; z += 3) B.box(m, 0.8, 0.75, 0.8, x, 4.15, z, C(0xe8e2d4));
      }
    }
    if (B.count) sc.statics.add(B.geometry(), 0.55, 0.05, 'main');
    if (Gb.count) { const g = Gb.geometry(); const mm = new THREE.Mesh(g, E._quayGlass || (E._quayGlass = new THREE.MeshStandardMaterial({ color: C(0x1e2c3a), roughness: 0.06, metalness: 0.6, envMapIntensity: 0.6, side: THREE.DoubleSide }))); mm.name = 'quayGlass'; mm.receiveShadow = true; sc.group.add(mm); }
  }

  Street.build = function (E) {
    const T0 = performance.now();
    buildWater(E); if (E.t.data.street) buildTunnelVault(E); else buildTunnel(E);
    if (E.t.data.harbour) { buildHarbour(E); buildQuayBuildings(E); } else buildYachts(E);
    if (EI.StreetKit && E.t.data.street) EI.StreetKit.build(E);
    E.timings.street = Math.round(performance.now() - T0);
  };
})();
