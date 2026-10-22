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
  // ---------------------------------------------------------------- tunnel (street circuit): the bore under the hotel as it is: a FLAT grey concrete
  // ceiling, cream square tiles on the walls over a dark dado behind the rails, a slanted cable tray along the top of the outer wall carrying a row of
  // round white LED lamps, long partner boards on the outer wall. The shell is baked (unlit, vertex light) so the sun never reaches inside, and a
  // graded dark film over the road and rails fades in from each portal. Warmer, denser reinforcement lamps in the first and last 40 m.
  function buildTunnelVault(E) {
    const t = E.t, sc = E.sc, TD = t.data.tunnel; if (!TD) return;
    const s0 = TD.s0, s1 = TD.s1, step = 2; const Z = t.streetZones ? t.streetZones() : null;
    const Hw = 4.05, Ht = 4.55, Hc = 5.0, tray = 0.55; // tiles to Hw, upright tray face to Ht, the tray slopes in to the ceiling at Hc
    const P = [], N = [], Cc = [], UV = [], I = []; const LP = [], LC = [], LI = []; const SH = new EI.Env.Builder(); const OV = { p: [], uv: [], i: [] };
    const BP = [], BC = [], BU = [], BI = [], TB = {};
    const tile = C(0xeee8da), dado = C(0x4c4f52), trayC = C(0x55585c), ceil = C(0x9a9c9e), shellC = C(0xb7ab98);
    // the outer side of the curve gets the lamp row and the boards: the arc bulges away from its chord towards it
    const iA = t.idxAtS(s0), iB = t.idxAtS(s1), iM = t.idxAtS((s0 + s1) / 2);
    const outer = ((t.x[iM] - (t.x[iA] + t.x[iB]) / 2) * t.nx[iM] + (t.z[iM] - (t.z[iA] + t.z[iB]) / 2) * t.nz[iM]) > 0 ? 1 : -1;
    // profile across the bore (left to right): [side (-1 left wall, +1 right, 0 centre), inward offset, height, colour, flat (untextured)]
    const PROF = [];
    for (const sd of [-1, 1]) {
      const half = [[sd, 0, 0, dado, 0], [sd, 0, 1.15, dado, 0], [sd, 0, 1.18, tile, 0], [sd, 0, Hw, tile, 0], [sd, 0, Hw, trayC, 1], [sd, 0, Ht, trayC, 1], [sd, tray, Hc, ceil, 1]];
      if (sd < 0) PROF.push(...half); else { PROF.push([0, 0, Hc, ceil, 1]); PROF.push(...half.reverse()); }
    }
    let vtx = 0, along = 0, prevI = -1, prev = null;
    const nst = Math.ceil((s1 - s0) / step);
    for (let k = 0; k <= nst; k++) {
      const s = Math.min(s1, s0 + k * step); const i = t.idxAtS(s); const y = t.y[i];
      const wl = t.wallL[i] + (Z ? Z[-1].back[i] : 0) + 0.3, wr = t.wallR[i] + (Z ? Z[1].back[i] : 0) + 0.3;
      if (prevI >= 0) along += Math.hypot(t.x[i] - t.x[prevI], t.z[i] - t.z[prevI]); prevI = i;
      const dIn = Math.min(s - s0, s1 - s); const portalBoost = 1 + 0.9 * (1 - U.smoothstep(15, 45, dIn));
      const joint = 0.94 + 0.06 * Math.cos(along * Math.PI / 6) ** 8;   // concrete ceiling panels, 6 m
      let v = 0, last = null;
      for (let c = 0; c < PROF.length; c++) {
        const [f, inw, h, colr, flat] = PROF[c]; const lat = f < 0 ? -wl + inw : f > 0 ? wr - inw : (wr - wl) / 2;
        const x = t.x[i] + t.nx[i] * lat, z = t.z[i] + t.nz[i] * lat; if (last) v += Math.hypot(lat - last[0], h - last[1]); last = [lat, h];
        P.push(x, y + h, z); if (flat) UV.push(0.125, 0.125); else UV.push(along / 2, h / 2);
        // baked light: the lamp row washes the outer wall and the ceiling, the walls fade darker towards the dado
        const outerW = f === outer ? 1.12 : f === 0 ? 1.0 : 0.9;
        const glow = (0.42 + 0.42 * Math.exp(-Math.pow((h - (Hw - 0.4)) / 1.6, 2))) * portalBoost * outerW * (colr === ceil ? joint : 1) * (0.95 + 0.1 * Math.sin(along * 0.79));
        const warm = colr === tile ? 1 : 0.35; Cc.push(colr.r * glow * (1 + 0.04 * warm), colr.g * glow, colr.b * glow * (1 - 0.08 * warm));
        const nx = f < 0 ? t.nx[i] : f > 0 ? -t.nx[i] : 0, nz = f < 0 ? t.nz[i] : f > 0 ? -t.nz[i] : 0; N.push(nx, colr === ceil ? -1 : 0, nz);
      }
      const K = PROF.length; if (k > 0) for (let c = 0; c < K - 1; c++) { const a = vtx - K + c, b = vtx + c; I.push(a, b, a + 1, a + 1, b, b + 1); }
      vtx += K;
      // round LED lamps on the sloping tray of the outer wall, every 4 m (2 m and warmer near the portals): octagons facing down and in
      const W = outer < 0 ? wl : wr; const spacing = dIn < 40 ? 2 : 4;
      if (k > 0 && Math.floor(along / spacing) !== Math.floor((along - step) / spacing)) {
        const latA = outer * (W - tray * 0.5), hA = (Ht + Hc) / 2; const cx = t.x[i] + t.nx[i] * latA, cz = t.z[i] + t.nz[i] * latA, cy = y + hA - 0.02;
        // in the tray plane: along the track (tx, tz) and up the slope (towards the wall and down)
        const ux = t.tx[i], uz = t.tz[i]; const sl = Math.hypot(tray, Hc - Ht); const wx = t.nx[i] * outer * tray / sl, wz = t.nz[i] * outer * tray / sl, wy = -(Hc - Ht) / sl;
        const r = 0.22, base = LP.length / 3; const lc = dIn < 40 ? [1.0, 0.88, 0.58] : [1.0, 0.98, 0.92];
        // nudge off the tray towards the bore so the disc never z-fights
        const ox = -t.nx[i] * outer * 0.03, oz = -t.nz[i] * outer * 0.03, oy = -0.03;
        LP.push(cx + ox, cy + oy, cz + oz); LC.push(lc[0] * 1.6, lc[1] * 1.6, lc[2] * 1.6);
        for (let q = 0; q < 8; q++) { const a = q / 8 * Math.PI * 2, ca = Math.cos(a) * r, sa = Math.sin(a) * r; LP.push(cx + ox + ux * ca + wx * sa, cy + oy + wy * sa, cz + oz + uz * ca + wz * sa); LC.push(lc[0], lc[1], lc[2]); }
        for (let q = 0; q < 8; q++) LI.push(base, base + 1 + q, base + 1 + (q + 1) % 8);
      }
      // partner boards along the outer wall (1.3 - 3.1 m), 27 m long with 5 m gaps, clear of the portals
      { const lat = outer * (W - 0.04); const cur = [t.x[i] + t.nx[i] * lat, y, t.z[i] + t.nz[i] * lat, along];
        if (prev && dIn > 22 && Math.min(prev.s - s0, s1 - prev.s) > 22) {
          // each segment is clipped to the 27 m boards (and split where it crosses into the next one), so every board is complete (f1-BRAND)
          const run = 32, bl = 27; const P0 = prev.p[3], P1 = along, base0 = Math.floor(P0 / run) * run;
          for (let o = base0; o < P1; o += run) { const p0 = Math.max(0, P0 - o), p1 = Math.min(bl, P1 - o); if (p1 <= p0) continue;
            const ta = (o + p0 - P0) / (P1 - P0), tb = (o + p1 - P0) / (P1 - P0); const L3 = (t) => [prev.p[0] + (cur[0] - prev.p[0]) * t, prev.p[1] + (cur[1] - prev.p[1]) * t, prev.p[2] + (cur[2] - prev.p[2]) * t];
            const qa = L3(ta), qb = L3(tb); const row = Math.floor(o / run) % 4; const v0 = 1 - (row + 1) / 4 + 0.004, v1 = 1 - row / 4 - 0.004;
            const u0 = outer < 0 ? 1 - p0 / bl : p0 / bl, u1 = outer < 0 ? 1 - p1 / bl : p1 / bl; const g = 0.82 * portalBoost;
            const bk = TB[o] || (TB[o] = { len: 0, q: [] }); bk.len += p1 - p0; bk.q.push([[qa, u0, 1.3], [qb, u1, 1.3], [qb, u1, 3.1], [qa, u0, 3.1]].map(([q, u, h]) => [q[0], q[1] + h, q[2], u, h < 2 ? v0 : v1, g])); } }
        prev = { p: cur, s }; }
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
        SH.box(m, 0.62, 0.5, wl + wr, 0, Hc - 0.1, (wr - wl) / 2, C(0xd8a91c));
        // a partner board across the lintel's outer face (photo 034: the big board over the tunnel exit; MONACO-UPGRADE): tunnel board
        // texture cell (row, half) = venue tile 7 (AWS) at the exit, 0 (TAG Heuer) at the entry, 6.9 x 0.92 m at the tile's 7.5:1 aspect, above the lit reveal band
        { const tile = k === 0 ? 0 : 7, row = tile >> 1, half = tile & 1, Wb = 6.9, a = dir * 0.37, c0 = (wr - wl) / 2; const b0 = BP.length / 3;
          for (const [zz, yy, uu, vv] of [[-Wb / 2, 0.42, 0, 0], [Wb / 2, 0.42, 1, 0], [Wb / 2, 1.34, 1, 1], [-Wb / 2, 1.34, 0, 1]]) { const l = c0 + zz * dir; BP.push(t.x[i] + t.tx[i] * a + t.nx[i] * l, y + Hc + yy, t.z[i] + t.tz[i] * a + t.nz[i] * l); BU.push(half * 0.5 + uu * 0.5, 1 - (row + 1 - vv) / 4); BC.push(1, 1, 1); }
          BI.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3); } }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I); g.computeBoundingSphere();
    const vault = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tunnelTileTexture(), vertexColors: true, side: THREE.DoubleSide })); vault.name = 'tunnel'; sc.group.add(vault);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(LP, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(LC, 3)); lg.setIndex(LI); lg.computeBoundingSphere();
    const lamps = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide })); lamps.name = 'tunnelLamps'; sc.group.add(lamps);
    // only complete boards (the portal clearance can cut a board's start or end off: such boards are dropped)
    for (const o in TB) if (TB[o].len >= 27 - 0.01) for (const quad of TB[o].q) { const b0 = BP.length / 3; for (const v of quad) { BP.push(v[0], v[1], v[2]); BU.push(v[3], v[4]); BC.push(v[5], v[5], v[5]); } BI.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3); }
    if (BI.length) {
      const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(BP, 3)); bg.setAttribute('color', new THREE.Float32BufferAttribute(BC, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(BU, 2)); bg.setIndex(BI); bg.computeBoundingSphere();
      const boards = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ map: tunnelBoardTexture(), vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })); boards.name = 'tunnelBoards'; sc.group.add(boards);
    }
    const sm = new THREE.Mesh(SH.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide })); sm.name = 'tunnelShell'; sm.castShadow = true; sm.receiveShadow = true; sc.group.add(sm);
    // dark film: alpha ramp texture (u = darkness), drawn over the asphalt, kerbs and the rail faces
    const [rc, rx] = EI.Env.canvas(64, 4); const gr = rx.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, 'rgba(10,9,8,0)'); gr.addColorStop(1, 'rgba(10,9,8,0.5)'); rx.fillStyle = gr; rx.fillRect(0, 0, 64, 4);
    const ot = new THREE.CanvasTexture(rc); ot.wrapS = ot.wrapT = THREE.ClampToEdgeWrapping;
    const og = new THREE.BufferGeometry(); og.setAttribute('position', new THREE.Float32BufferAttribute(OV.p, 3)); og.setAttribute('uv', new THREE.Float32BufferAttribute(OV.uv, 2)); og.setIndex(OV.i); og.computeBoundingSphere();
    const film = new THREE.Mesh(og, new THREE.MeshBasicMaterial({ map: ot, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 })); film.name = 'tunnelFilm'; film.renderOrder = 1; sc.group.add(film);
    E.tunnel = { s0, s1 }; E.stats.tunnelSegs = nst; E.stats.tunnelLamps = LI.length / 24; E.stats.tunnelBoards = BI.length / 6;
  }
  // the long partner boards on the outer tunnel wall: four rows (2048 x 128 each = two partner designs side by side, 27 m on the wall)
  function tunnelBoardTexture() {
    const [c, ctx] = EI.Env.canvas(2048, 512); ctx.fillStyle = '#1d2026'; ctx.fillRect(0, 0, 2048, 512);
    if (EI.Ads && EI.Ads.paintTile) for (let r = 0; r < 4; r++) for (let h = 0; h < 2; h++) { try { EI.Ads.paintTile(ctx, r * 2 + h, h * 1024, r * 128, 1024, 128, 13.5 / 1.8); } catch (e) { } ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(h * 1024 + 1021, r * 128, 3, 128); }
    const tex = new THREE.CanvasTexture(c); tex.anisotropy = 8; return U.srgb(tex);
  }
  function tunnelTileTexture() {
    const [c, ctx] = EI.Env.canvas(256, 256); const r = U.rng(31);
    ctx.fillStyle = '#f1ece0'; ctx.fillRect(0, 0, 256, 256);
    // 0.5 m square glazed tiles (the texture covers 2 x 2 m), soft grime streaks and a few darker replacement tiles
    for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64) { const v = 234 + r() * 14; ctx.fillStyle = r() < 0.05 ? 'rgb(208,203,192)' : 'rgb(' + v + ',' + (v - 3) + ',' + (v - 11) + ')'; ctx.fillRect(x + 1, y + 1, 62, 62); }
    ctx.fillStyle = 'rgba(110,104,94,0.45)'; for (let y = 0; y <= 256; y += 64) ctx.fillRect(0, y - 1, 256, 2); for (let x = 0; x <= 256; x += 64) ctx.fillRect(x - 1, 0, 2, 256);
    for (let i = 0; i < 24; i++) { ctx.fillStyle = 'rgba(80,72,60,' + (0.03 + r() * 0.05) + ')'; ctx.fillRect(r() * 256, 0, 2 + r() * 8, 256); }
    // the flat (untextured) parts sample the middle of the first tile: keep it a clean even tone
    ctx.fillStyle = 'rgb(240,238,234)'; ctx.fillRect(8, 8, 48, 48);
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
    const seen = new Set(); for (const w of data.water) { if (w.length < 3 || Math.abs(polyArea(w)) <= 200) continue; const key = w.length + ':' + w[0][0] + ':' + w[0][1] + ':' + Math.round(polyArea(w)); if (seen.has(key)) continue; seen.add(key); polys.push(w); }
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
    // quay walls: dressed stone from the water up to the ground, a dark weed / tide band at the waterline (both faces: the street
    // world material is single sided); street circuits draw them through the shared atlas, other tracks keep the plain mesh
    const SKx = EI.StreetKit && E.t.data.street && EI.StreetKit.World ? EI.StreetKit : null; const Q = SKx ? new SKx.Batch().set(SKx.stone(), 0.9, 0) : null;
    const pos = [], nrm = [], col = [], uv = []; const quay = C(0xb9b3a6), tide = C(0x5a5f58);
    // a basin outline that runs inside the barriers (the chicane's escape road, the Piscine exit) left a stone lip across the asphalt:
    // edges are cut into ~4 m pieces where they come inside, and those pieces are dropped (FIT-AUDIT)
    const qpr = {}, inCorr = (x, z) => { t.project(x, z, null, qpr); return qpr.dist < E.wallCap(qpr.i, qpr.lat < 0 ? -1 : 1) + 0.3; }; const edges = [];
    for (const w of polys) for (let i = 0; i < w.length; i++) {
      const a = w[i], b = w[(i + 1) % w.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 0.5 || l > 600) continue;
      const n = Math.max(1, Math.ceil(l / 4)), P = (u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; const bad = []; let any = false;
      for (let k = 0; k <= 2 * n; k++) { const p = P(k / (2 * n)); bad.push(inCorr(p[0], p[1])); any = any || bad[k]; }
      if (!any) { edges.push([a, b]); continue; }
      for (let k = 0; k < n; k++) if (!bad[2 * k] && !bad[2 * k + 1] && !bad[2 * k + 2]) edges.push([P(k / n), P((k + 1) / n)]);
    }
    for (const [a, b] of edges) {
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 0.5) continue;
      const ga = sc.height(a[0], a[1]), gb = sc.height(b[0], b[1]); if (Math.max(ga, gb) < seaY + 0.3) continue;
      const nx = (b[1] - a[1]) / l, nz = -(b[0] - a[0]) / l;      // one side; the material is double sided
      if (Q) { const A = [a[0], seaY - 1, a[1]], Bq = [b[0], seaY - 1, b[1]], Cq = [b[0], gb + 0.15, b[1]], D = [a[0], ga + 0.15, a[1]]; const ha = (ga + 1.15 - seaY) / 2, hb = (gb + 1.15 - seaY) / 2; const qc = C(0xd8d0c0);
        Q.quad(A, Bq, Cq, D, qc, [0, 0, l / 4, 0, l / 4, hb, 0, ha]); Q.quad(A, D, Cq, Bq, qc, [0, 0, 0, ha, l / 4, hb, l / 4, 0]);
        const t0 = [a[0], seaY + 0.55, a[1]], t1 = [b[0], seaY + 0.55, b[1]]; const off = (p, k) => [p[0] + nx * k, p[1], p[2] + nz * k]; Q.set('white', 0.95, 0);
        for (const k of [0.02, -0.02]) { const qa = off(A, k), qb = off(Bq, k), qc2 = off(t1, k), qd = off(t0, k); if (k > 0) Q.quad(qa, qb, qc2, qd, tide); else Q.quad(qa, qd, qc2, qb, tide); } Q.set(SKx.stone(), 0.9, 0); continue; }
      ribbonQuad(pos, nrm, col, uv, [a[0], seaY - 1, a[1]], [b[0], seaY - 1, b[1]], [b[0], gb + 0.15, b[1]], [a[0], ga + 0.15, a[1]], [nx, 0, nz], quay, [[0, 0], [l / 4, 0], [l / 4, 1], [0, 1]]);
      ribbonQuad(pos, nrm, col, uv, [a[0], seaY - 1, a[1]], [b[0], seaY - 1, b[1]], [b[0], seaY + 0.5, b[1]], [a[0], seaY + 0.5, a[1]], [nx, 0, nz], tide);
    }
    if (Q) SKx.world(sc).add(Q, 'main');
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
    const mat = new THREE.MeshStandardMaterial({ color: C(0x0a2530), roughness: 0.12, metalness: 0.0, envMapIntensity: 0.85, side: THREE.DoubleSide });
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
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectSpecular *= vec3(0.16, 0.19, 0.215);');
    };
    mat.customProgramCacheKey = () => 'ei-water';
    E._waterMat = mat; E._waterUni = uni; return mat;
  }

  // ---------------------------------------------------------------- yachts: procedural superyachts, flybridge cruisers, open sports boats, sailing
  // yachts and tenders. Each boat is written twice: a detailed version into the near cells (smooth lacquered hulls with boot stripes and
  // hull windows, stacked white decks with dark glass bands that sweep down to raked windscreens, overhanging deck plates on slim
  // columns, glass balustrades, radar arches with domes, sun-deck loungers and jacuzzis, tenders, flags, masts with spreaders, furled
  // sails) and a simple one into the far cells. Rails, rigging and mooring lines are line segments. Local frame: +x bow, +y up from
  // the waterline, z across.
  function yachtKit(N, F, LN, LF, refl) {
    const X = EI.Env.xf; const C3 = (h) => C(h);
    const sm = (a, b, x) => U.smoothstep(a, b, x);
    const rotN = (m, v) => { const e = m.elements; const x = e[0] * v[0] + e[4] * v[1] + e[8] * v[2], y = e[1] * v[0] + e[5] * v[1] + e[9] * v[2], z = e[2] * v[0] + e[6] * v[1] + e[10] * v[2]; const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
    const glassC = C3(0x0e1a24), glassB = C3(0x162a3a), chrome = C3(0xd9dee2), whiteC = C3(0xf5f6f4), offW = C3(0xe9e9e4), teakC = C3(0x8b6d55), greyD = C3(0x2a2e33), antiC = C3(0x2a2526), lineC = C3(0xc8ccd0), ropeC = C3(0xd8d2c0);
    const GLASS = [0.05, 0.75], PAINT = [0.18, 0.08], DECK = [0.7, 0.0], CHROME = [0.12, 0.95];
    // ---- hull: lofted stations (denser at the bow), raked stem, sheer rising forward, bulwark on the foredeck, smooth normals
    function hullShape(o) {
      const L = o.L, B = o.B, H = o.H;
      const w = (u) => B / 2 * (u < 0.6 ? 0.9 + 0.1 * Math.sin(u / 0.6 * Math.PI / 2) : Math.pow(Math.max(0, Math.cos((u - 0.6) / 0.4 * Math.PI / 2)), o.sail ? 0.85 : 0.68)) + 0.02;
      const hd = (u) => H * (1 + (o.sheer != null ? o.sheer : 0.18) * Math.pow(sm(0.4, 1, u), 1.4));
      const bt = (u) => hd(u) + (o.bulw || 0) * sm(0.4, 0.56, u);
      const xAt = (u, y) => -L / 2 + u * L - (o.rake != null ? o.rake : 0.07 * L) * Math.pow(sm(0.78, 1, u), 1.4) * U.clamp(1 - y / hd(u), 0, 1.3);
      return { w, hd, bt, xAt };
    }
    function hull(B, m, o, far) {
      const S = hullShape(o); const NS = far ? 6 : 16;
      const us = []; for (let k = 0; k <= NS; k++) { const u = k / NS; us.push(1 - Math.pow(1 - u, far ? 1.2 : 1.35)); }
      // profile from the bulwark top down to below the waterline: [height(u), width factor, colour of the band below this point]
      const prof = far ? [(u) => S.bt(u), (u) => S.hd(u) * 0.55, () => 0.25, () => -0.3] : [(u) => S.bt(u), (u) => S.hd(u) - 0.1, (u) => S.hd(u) * 0.62, (u) => S.hd(u) * 0.3, () => 0.28, () => 0.0, () => -0.45];
      const wf = far ? [1, 0.99, 0.92, 0.8] : [1, 1, 0.99, 0.96, 0.93, 0.88, 0.78];
      const bandC = far ? [o.hullC, o.hullC, o.bootC] : [o.hullC, o.upperC || o.hullC, o.hullC, o.hullC, o.bootC, antiC];
      B.mat(PAINT[0], PAINT[1]);
      for (const sd of [1, -1]) {
        const P = us.map(u => prof.map((f, j) => { const y = f(u); return [S.xAt(u, y), y, sd * S.w(u) * wf[j]]; }));
        // smooth normals: cross of the along / down tangents
        const nrm = P.map((row, k) => row.map((p, j) => { const a = P[Math.min(NS, k + 1)][j], b = P[Math.max(0, k - 1)][j]; const c = row[Math.min(row.length - 1, j + 1)], d = row[Math.max(0, j - 1)];
          const tu = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], tv = [c[0] - d[0], c[1] - d[1], c[2] - d[2]]; let n = [tu[1] * tv[2] - tu[2] * tv[1], tu[2] * tv[0] - tu[0] * tv[2], tu[0] * tv[1] - tu[1] * tv[0]]; if (n[2] * sd < 0) n = n.map(v => -v); return rotN(m, n); }));
        const W = P.map(row => row.map(p => X(m, p[0], p[1], p[2])));
        for (let k = 0; k < NS; k++) for (let j = 0; j < prof.length - 1; j++) {
          const c = bandC[j]; const a = W[k][j], b = W[k + 1][j], cc = W[k + 1][j + 1], d = W[k][j + 1]; const na = nrm[k][j], nb = nrm[k + 1][j], nc = nrm[k + 1][j + 1], nd = nrm[k][j + 1];
          if (sd > 0) { B.triN(a, d, cc, na, nd, nc, c); B.triN(a, cc, b, na, nc, nb, c); } else { B.triN(a, b, cc, na, nb, nc, c); B.triN(a, cc, d, na, nc, nd, c); }
        }
        // inside of the foredeck bulwark
        if (o.bulw && !far) for (let k = 0; k < NS; k++) { const u0 = us[k], u1 = us[k + 1]; if (S.bt(u1) - S.hd(u1) < 0.05) continue; const q = (u, y) => X(m, S.xAt(u, S.hd(u)), y, sd * (S.w(u) - 0.12)); const a = q(u0, S.hd(u0)), b = q(u1, S.hd(u1)), c = q(u1, S.bt(u1)), d = q(u0, S.bt(u0)); if (sd > 0) B.quad(a, b, c, d, offW); else B.quad(a, d, c, b, offW); }
      }
      // deck between the two sheer lines, transom
      B.mat(DECK[0], DECK[1]);
      for (let k = 0; k < NS; k++) { const u0 = us[k], u1 = us[k + 1]; const q = (u, sd) => X(m, S.xAt(u, S.hd(u)), S.hd(u), sd * S.w(u) * (o.bulw ? 0.97 : 1)); B.quad(q(u0, -1), q(u1, -1), q(u1, 1), q(u0, 1), o.deckC); }
      B.mat(PAINT[0], PAINT[1]);
      const tp = prof.map((f, j) => [f(0), S.w(0) * wf[j]]); for (let j = 0; j < tp.length - 1; j++) { const x = S.xAt(0, 0); B.quad(X(m, x, tp[j][0], -tp[j][1]), X(m, x, tp[j][0], tp[j][1]), X(m, x, tp[j + 1][0], tp[j + 1][1]), X(m, x, tp[j + 1][0], -tp[j + 1][1]), j < bandC.length ? bandC[j] : o.hullC); }
      return S;
    }
    // dark hull-window band along both sides (lens shaped), proud of the hull by a few centimetres
    function hullWindows(B, m, o, S, u0, u1, y0, y1) {
      B.mat(GLASS[0], GLASS[1]); const n = 10;
      for (const sd of [1, -1]) for (let k = 0; k < n; k++) {
        const ua = u0 + (u1 - u0) * k / n, ub = u0 + (u1 - u0) * (k + 1) / n; const taper = (u) => Math.pow(Math.sin(Math.PI * (u - u0) / (u1 - u0)), 0.35);
        const pt = (u, f) => { const ym = (y0 + y1) / 2, hh = (y1 - y0) / 2 * taper(u); const y = ym + f * hh; return X(m, S.xAt(u, y), y, sd * (S.w(u) * 0.995 + 0.04)); };
        const a = pt(ua, -1), b = pt(ub, -1), c = pt(ub, 1), d = pt(ua, 1); if (sd > 0) B.quad(a, d, c, b, glassC); else B.quad(a, b, c, d, glassC);
      }
    }
    // ---- deck level: plan outline (rectangle closed by a rounded / pointed front), slab with fascia, enclosed saloon inset from the
    // edges with a white base and a dark glass band that sweeps up towards the aft end, raked front, glass balustrade on the edge
    function outline(o, xa, xb, w, nf) {
      const pts = []; const xf = xb - Math.min(w * 1.6, (xb - xa) * 0.45); nf = nf || 6;
      const hw = (x) => Math.max(0.3, Math.min(w, o.S.w((x + o.L / 2) / o.L) * 0.97 - 0.25));
      pts.push([xa, -hw(xa)]); for (let k = 1; k <= 3; k++) { const x = xa + (xf - xa) * k / 3; pts.push([x, -hw(x)]); }
      for (let k = 1; k < nf; k++) { const a = -Math.PI / 2 + Math.PI * k / nf; const x = xf + Math.cos(a) * (xb - xf), z = Math.sin(a) * hw(xf); pts.push([x, z * (o.pointy ? 1 - Math.pow(Math.cos(a), 2) * 0.35 : 1)]); }
      for (let k = 3; k >= 0; k--) { const x = xa + (xf - xa) * k / 3; pts.push([x, hw(x)]); }
      return { pts, xf };
    }
    function fan(B, m, pts, y, col, up) { let cx = 0, cz = 0; for (const p of pts) { cx += p[0]; cz += p[1]; } cx /= pts.length; cz /= pts.length; const c = X(m, cx, y, cz);
      for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; const A = X(m, a[0], y, a[1]), Bq = X(m, b[0], y, b[1]); if (up) B.tri(c, Bq, A, col); else B.tri(c, A, Bq, col); } }
    function ring(B, m, pts, y0, y1, col, inward, dxTop) {
      for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; const ta = dxTop ? dxTop(a) : 0, tb = dxTop ? dxTop(b) : 0;
        const A = X(m, a[0], y0, a[1]), Bq = X(m, b[0], y0, b[1]), Cq = X(m, b[0] + tb, y1, b[1]), D = X(m, a[0] + ta, y1, a[1]); if (inward) B.quad(A, D, Cq, Bq, col); else B.quad(A, Bq, Cq, D, col); }
    }
    function level(B, m, o, lv, far) {
      const { xa, xb, w, y, h } = lv; const slabT = lv.slabT || 0.34; const out = outline(o, xa, xb, w, far ? 3 : 6);
      // slab (roof of this level): top deck, white fascia, underside
      B.mat(PAINT[0] + 0.1, PAINT[1]); fan(B, m, out.pts, y + h, lv.deckC || offW, true); if (!far) fan(B, m, out.pts, y + h - slabT, offW, false); ring(B, m, out.pts, y + h - slabT, y + h, lv.fasciaC || whiteC, false);
      // enclosed saloon: inset sides, set back from the aft edge (open aft deck under the overhang)
      const ea = xa + (xb - xa) * (lv.open != null ? lv.open : 0.22), inset = far ? 0.5 : 0.7; const eo = outline(o, ea, xb - 0.35, w - inset, far ? 3 : 6);
      const hT = h - slabT; const rake = (p) => p[0] > eo.xf ? -(lv.rake || 0.55) * hT * sm(eo.xf, xb, p[0]) : 0; const yb = y + 0.01;
      if (far) { B.mat(PAINT[0], PAINT[1]); ring(B, m, eo.pts, yb, yb + hT * 0.35, lv.wallC || whiteC, false, (p) => rake(p) * 0.35); B.mat(GLASS[0], GLASS[1]); ring(B, m, eo.pts, yb + hT * 0.35, yb + hT, glassC, false, (p) => rake(p)); return out; }
      // per wall segment: white base to g0, glass to hT - 0.12, white strip above; g0 rises towards the aft end (the sweep)
      const len = xb - ea; const pts = eo.pts;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length]; const g = (p) => { const t = (p[0] - ea) / len; return (lv.g0 || 0.95) + (hT - 1.25) * 0.55 * sm(0.22, 0.0, t) * (lv.sweep === false ? 0 : 1); };
        const Q = (p, yy, f) => X(m, p[0] + rake(p) * f, yb + yy, p[1]);
        const fa = (yy) => yy / hT; const ga = g(a), gb = g(b), top = hT - 0.12;
        B.mat(PAINT[0], PAINT[1]); B.quad(Q(a, 0, 0), Q(b, 0, 0), Q(b, gb, fa(gb)), Q(a, ga, fa(ga)), lv.wallC || whiteC);
        B.mat(GLASS[0], GLASS[1]); B.quad(Q(a, ga, fa(ga)), Q(b, gb, fa(gb)), Q(b, top, fa(top)), Q(a, top, fa(top)), lv.glassC || glassC);
        B.mat(PAINT[0], PAINT[1]); B.quad(Q(a, top, fa(top)), Q(b, top, fa(top)), Q(b, hT, 1), Q(a, hT, 1), lv.wallC || whiteC);
      }
      // aft wall of the saloon: full-height glass doors
      // columns under the overhang at the aft corners
      if ((lv.open || 0.22) > 0.08) for (const sd of [-1, 1]) B.beam(m, [xa + 0.4, y, sd * (w - 0.5)], [xa + 0.4, y + hT, sd * (w - 0.5)], 0.18, whiteC);
      // balustrade on the deck edge above this level: tinted glass panels with a chrome handrail (lines)
      if (lv.rail !== false) { const rp = out.pts; B.mat(GLASS[0] + 0.05, 0.4); for (let i = 0; i < rp.length; i++) { const a = rp[i], b = rp[(i + 1) % rp.length]; if (a[0] > out.xf && b[0] > out.xf && lv.front === 'visor') continue; const A = X(m, a[0], y + h, a[1]), Bq = X(m, b[0], y + h, b[1]), Cq = X(m, b[0], y + h + 0.95, b[1]), D = X(m, a[0], y + h + 0.95, a[1]); B.quad(A, Bq, Cq, D, glassB); B.quad(A, D, Cq, Bq, glassB); LN.seg(X(m, a[0], y + h + 1.0, a[1]), X(m, b[0], y + h + 1.0, b[1]), lineC); } }
      return out;
    }
    // ---- fittings
    const lounger = (B, m, x, y, z, c) => { B.mat(0.6, 0); B.box(m, 1.9, 0.3, 0.68, x, y, z, whiteC); B.box(m, 1.35, 0.1, 0.62, x - 0.22, y + 0.3, z, c); const P = (a, b, cz) => X(m, x + a, y + b, z + cz); B.quad(P(0.5, 0.3, -0.31), P(0.5, 0.3, 0.31), P(0.86, 0.78, 0.31), P(0.86, 0.78, -0.31), c); B.quad(P(0.5, 0.3, -0.31), P(0.86, 0.78, -0.31), P(0.86, 0.78, 0.31), P(0.5, 0.3, 0.31), c); };
    const jacuzzi = (B, m, x, y, z, r) => { B.mat(0.3, 0); B.box(m, r * 2 + 0.4, 0.55, r * 2 + 0.4, x, y, z, whiteC); B.mat(0.05, 0.1, 0.25); B.box(m, r * 2, 0.02, r * 2, x, y + 0.55, z, C3(0x2fb6d2)); };
    const flag = (m, x, y, z, w, h, cols) => { const n = cols.length; for (let k = 0; k < n; k++) { const a = X(m, x - w, y - k * h / n, z), b = X(m, x, y - k * h / n, z), c = X(m, x, y - (k + 1) * h / n, z), d = X(m, x - w, y - (k + 1) * h / n, z); N.mat(0.8, 0); N.quad(a, b, c, d, cols[k]); N.quad(a, d, c, b, cols[k]); } };
    const FLAGS = [[C3(0xce1126), C3(0xf4f4f4)], [C3(0xc8102e), C3(0xf4f4f4), C3(0xc8102e)], [C3(0x00247d), C3(0xf4f4f4), C3(0xce1126)], [C3(0xf4f4f4), C3(0xce1126)], [C3(0x009246), C3(0xf1f2f1), C3(0xce2b37)]];
    // ---- superyacht (35 - 95 m)
    function superyacht(m, L, rng, hero) {
      const dark = rng() < (hero ? 0.5 : 0.25); const hullC = dark ? (rng() < 0.55 ? C3(0x1b2639) : rng() < 0.5 ? C3(0x2b3036) : C3(0x7d858c)) : whiteC;
      const o = { L, B: L * (0.17 + rng() * 0.025), H: 1.9 + L * 0.036, hullC, pointy: true, upperC: dark ? hullC : (rng() < 0.3 ? C3(0xc9ccd0) : whiteC), bootC: dark ? whiteC : (rng() < 0.6 ? C3(0x1d2a40) : C3(0x3a3f45)), deckC: teakC, bulw: 0.95, sheer: 0.16, rake: 0.075 * L };
      const nd = L > 75 ? 5 : L > 55 ? 4 : L > 40 ? 3 : 2; const blackTop = rng() < 0.4; const hd = 2.55 + L * 0.004; const supC = rng() < 0.12 ? C3(0xc4c9ce) : whiteC;
      for (const [B, far] of [[N, false], [F, true]]) {
        const S = hull(B, m, o, far); o.S = S;
        if (!far && L > 38) hullWindows(B, m, o, S, 0.16, 0.6, o.H * 0.4, o.H * 0.66);
        if (!far) for (const sd of [-1, 1]) for (let k = 0; k < 10; k++) { const u0 = k / 10, u1 = (k + 1) / 10; LN.seg(X(m, S.xAt(u0, S.hd(u0)), S.hd(u0) - 0.12, sd * (S.w(u0) + 0.02)), X(m, S.xAt(u1, S.hd(u1)), S.hd(u1) - 0.12, sd * (S.w(u1) + 0.02)), dark ? C3(0xc8a860) : chrome); }
        let y = S.hd(0.25) - 0.1, xa = -L * 0.42, xb = L * (0.2 + rng() * 0.04), w = o.B / 2;
        let top = null;
        for (let k = 0; k < nd; k++) {
          const lv = { xa, xb, w: w - 0.15, y, h: hd, open: k === 0 ? 0.18 : 0.2 + k * 0.03, rake: 0.5 + k * 0.08, deckC: k === nd - 1 ? teakC : offW, wallC: (k === nd - 1 && blackTop) ? C3(0x2a2e33) : supC, g0: k === 0 ? 1.0 : 0.7, front: k > 0 && rng() < 0.4 ? 'visor' : null };
          top = level(B, m, o, lv, far); y += hd; xa += L * (0.035 + k * 0.01); xb -= L * (0.055 + k * 0.03); w -= 0.25 + k * 0.12; if (xb - xa < L * 0.12) break;
        }
        // sun deck: radar arch / hardtop, domes, mast
        const mx = xa + (xb - xa) * 0.55 + 1;
        if (!far) {
          B.mat(PAINT[0], PAINT[1]);
          for (const sd of [-1, 1]) B.beam(m, [mx - 2.2, y, sd * w * 0.7], [mx - 0.2, y + 2.8, sd * w * 0.3], 0.35, whiteC);
          B.box(m, 2.6, 0.35, w * 0.7, mx - 0.1, y + 2.7, 0, whiteC);
          B.mat(0.4, 0.05); B.ball(m, mx - 0.5, y + 3.45, -0.9, 0.55, 0.62, 0.55, whiteC, 8); B.ball(m, mx - 0.5, y + 3.45, 0.9, 0.55, 0.62, 0.55, whiteC, 8); B.ball(m, mx + 0.4, y + 3.3, 0, 0.32, 0.4, 0.32, whiteC, 6);
          B.mat(CHROME[0], CHROME[1]); B.beam(m, [mx + 0.3, y + 3.0, 0], [mx + 0.45, y + 6.6, 0], 0.13, chrome); B.beam(m, [mx + 0.4, y + 5.6, -1.6], [mx + 0.4, y + 5.6, 1.6], 0.08, chrome);
          // loungers and the jacuzzi on the sun deck, a hardtop on the biggest
          const lc = rng() < 0.5 ? C3(0xf0ece2) : C3(0x2a3a5a);
          for (let k = 0; k < 4; k++) lounger(B, m, xa + 2.2 + (k >> 1) * 2.3, y, (k & 1 ? 1 : -1) * 1.0, lc);
          if (L > 45) jacuzzi(B, m, xb - 2.2, y, 0, Math.min(1.4, w * 0.4));
          if (L > 60 && rng() < 0.6) { B.mat(PAINT[0], PAINT[1]); B.box(m, (xb - xa) * 0.45, 0.25, w * 1.7, mx - 3.5, y + 2.6, 0, whiteC, { bottom: true }); for (const sd of [-1, 1]) B.beam(m, [mx - 6, y, sd * w * 0.75], [mx - 6, y + 2.6, sd * w * 0.75], 0.14, chrome); }
          // aft deck: lounge sofas on the main deck, the swim platform and the stern steps
          B.mat(0.6, 0); B.box(m, 2.2, 0.45, w * 1.4, -L * 0.45 + 2.6, S.hd(0.05), 0, lc);
          B.mat(DECK[0], DECK[1]); B.box(m, 2.2, 0.22, o.B * 0.82, -L / 2 - 1.0, 0.32, 0, teakC); for (let k = 0; k < 3; k++) B.box(m, 0.45, 0.2, o.B * 0.5, -L / 2 + 0.2 + k * 0.45, 0.6 + k * 0.45, 0, teakC);
          // tender on the foredeck of the bigger yachts
          if (L > 50) { const tl = Math.min(9, L * 0.11); const tm = new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().makeTranslation(L * 0.3, S.hd(0.8) + 0.05, 0)); tender(tm, tl, true); }
          // anchor pockets near the bow, ensign at the stern
          B.mat(0.4, 0.3); for (const sd of [-1, 1]) { const u = 0.9; const yy = S.hd(u) * 0.7; const p = X(m, S.xAt(u, yy), yy, sd * (S.w(u) + 0.03)); const q = X(m, S.xAt(u, yy) - 0.8, yy - 0.5, sd * (S.w(u - 0.016) + 0.03)); B.quad(p, X(m, S.xAt(u, yy) - 0.8, yy, sd * (S.w(u) + 0.03)), q, X(m, S.xAt(u, yy), yy - 0.5, sd * (S.w(u) + 0.03)), greyD); }
          const fs = [-L / 2 + 0.6, S.hd(0) + 0.2, 0]; LN.seg(X(m, fs[0], fs[1], 0), X(m, fs[0] - 0.4, fs[1] + 3.2, 0), chrome); flag(m, fs[0] - 0.42, fs[1] + 3.1, 0, 1.6, 1.0, FLAGS[Math.floor(rng() * FLAGS.length)]);
          LF.seg(X(m, mx + 0.4, y + 3.0, 0), X(m, mx + 0.45, y + 6.6, 0), chrome);
        } else { B.mat(PAINT[0], PAINT[1]); B.box(m, 2.6, 2.6, w * 0.6, mx - 0.6, y, 0, whiteC); }
      }
      refl.push({ m, L: L * 1.05, B: o.B, h: o.H + hd * nd + 3, hb: o.H, c1: hullC, c2: whiteC, dark });
      return o;
    }
    // ---- flybridge cruiser (14 - 32 m)
    function cruiser(m, L, rng) {
      const blue = rng() < 0.18; const hullC = blue ? (rng() < 0.5 ? C3(0x1d2e4a) : C3(0x5a6670)) : whiteC;
      const o = { L, B: L * 0.29, H: 1.0 + L * 0.033, hullC, bootC: blue ? whiteC : (rng() < 0.5 ? C3(0x1d2a40) : C3(0x2f6fb0)), deckC: rng() < 0.6 ? teakC : offW, bulw: L > 20 ? 0.7 : 0, sheer: 0.22, rake: 0.09 * L };
      const canvasC = rng() < 0.5 ? C3(0x1d2e4a) : C3(0xe8e6de);
      for (const [B, far] of [[N, false], [F, true]]) {
        const S = hull(B, m, o, far); o.S = S; const y = S.hd(0.3) - 0.05;
        if (!far && L > 16) hullWindows(B, m, o, S, 0.3, 0.62, o.H * 0.38, o.H * 0.58);
        const lv = { xa: -L * 0.42, xb: L * 0.12, w: o.B / 2 - 0.2, y, h: 2.0, open: 0.24, rake: 1.1, deckC: offW, g0: 0.8, rail: L > 18 };
        level(B, m, o, lv, far);
        if (!far) {
          // flybridge: console, seats, a bimini on four posts, the radar arch on the bigger ones
          const fy = y + 2.0; B.mat(0.5, 0.05); B.box(m, 1.6, 0.9, 1.4, L * 0.0, fy, -0.4, whiteC); B.mat(GLASS[0], GLASS[1]); B.quad(X(m, L * 0.0 + 0.8, fy + 0.9, -1.1), X(m, L * 0.0 + 0.8, fy + 0.9, 0.3), X(m, L * 0.0 + 0.55, fy + 1.3, 0.3), X(m, L * 0.0 + 0.55, fy + 1.3, -1.1), glassC);
          lounger(N, m, -L * 0.18, fy, 0.6, canvasC); B.mat(0.6, 0); B.box(m, 2.2, 0.55, o.B * 0.5, -L * 0.2, fy, -0.2, whiteC);
          B.mat(0.8, 0); B.box(m, Math.min(4.2, L * 0.18), 0.08, o.B * 0.52, -L * 0.12, fy + 2.05, 0, canvasC, { bottom: true });
          B.mat(CHROME[0], CHROME[1]); for (const sx of [-L * 0.12 - Math.min(2.0, L * 0.09), -L * 0.12 + Math.min(2.0, L * 0.09)]) for (const sd of [-1, 1]) B.beam(m, [sx, fy, sd * o.B * 0.24], [sx, fy + 2.05, sd * o.B * 0.24], 0.08, chrome);
          if (L > 20) { B.mat(PAINT[0], PAINT[1]); for (const sd of [-1, 1]) B.beam(m, [L * 0.02, fy, sd * o.B * 0.32], [L * 0.06, fy + 2.4, sd * o.B * 0.12], 0.22, whiteC); B.box(m, 0.8, 0.2, o.B * 0.3, L * 0.06, fy + 2.35, 0, whiteC); B.ball(m, L * 0.06, fy + 2.75, 0, 0.32, 0.36, 0.32, whiteC, 6); }
          B.mat(DECK[0], DECK[1]); B.box(m, 1.6, 0.18, o.B * 0.85, -L / 2 - 0.75, 0.3, 0, teakC);
          if (L > 21) { const tm = new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().makeTranslation(-L / 2 - 0.8, 0.45, 0)).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)); tender(tm, 3.6, true); }
          for (const sd of [-1, 1]) { LN.seg(X(m, L * 0.1, S.hd(0.62) + 0.7, sd * (S.w(0.62) - 0.1)), X(m, L * 0.45, S.hd(0.95) + 0.7, sd * 0.05), lineC); }
          LN.seg(X(m, -L / 2 + 0.4, S.hd(0) + 0.1, 0), X(m, -L / 2 + 0.1, S.hd(0) + 2.0, 0), chrome); flag(m, -L / 2 + 0.08, S.hd(0) + 1.95, 0, 0.9, 0.6, FLAGS[Math.floor(rng() * FLAGS.length)]);
        }
      }
      refl.push({ m, L, B: o.B, h: o.H + 4.5, hb: o.H, c1: hullC, c2: whiteC });
      return o;
    }
    // ---- open sports cruiser / day boat (8 - 14 m)
    function sport(m, L, rng) {
      const hullC = rng() < 0.25 ? C3([0x1d2e4a, 0x6b747c, 0x8a1d24][Math.floor(rng() * 3)]) : whiteC;
      const o = { L, B: L * 0.31, H: 0.85 + L * 0.03, hullC, bootC: C3(0x1d2a40), deckC: teakC, sheer: 0.25, rake: 0.12 * L };
      for (const [B, far] of [[N, false], [F, true]]) {
        const S = hull(B, m, o, far); o.S = S; const y = S.hd(0.4);
        B.mat(PAINT[0], PAINT[1]); B.box(m, L * 0.28, 0.65, o.B * 0.82, L * 0.08, y - 0.05, 0, whiteC);
        if (!far) { B.mat(GLASS[0], GLASS[1]); B.quad(X(m, -L * 0.06, y + 0.6, -o.B * 0.4), X(m, -L * 0.06, y + 0.6, o.B * 0.4), X(m, -L * 0.13, y + 1.25, o.B * 0.36), X(m, -L * 0.13, y + 1.25, -o.B * 0.36), glassC);
          lounger(B, m, -L * 0.3, S.hd(0.1) - 0.4, 0, rng() < 0.5 ? C3(0xf0ece2) : C3(0x2a3a5a)); if (L > 11) { B.mat(0.6, 0); B.box(m, L * 0.2, 0.06, o.B * 0.7, -L * 0.2, y + 1.9, 0, whiteC); for (const sd of [-1, 1]) B.beam(m, [-L * 0.13, y + 0.6, sd * o.B * 0.33], [-L * 0.13, y + 1.9, sd * o.B * 0.33], 0.07, chrome); } }
      }
      refl.push({ m, L, B: o.B, h: o.H + 1.6, hb: o.H, c1: hullC, c2: whiteC });
      return o;
    }
    // ---- sailing yacht (11 - 60 m): mast with spreaders, boom with the main furled under its cover, furled genoa, sprayhood
    function sail(m, L, rng, big) {
      const dark = big ? rng() < 0.6 : rng() < 0.15; const hullC = dark ? C3([0x1b2639, 0x2a2e33, 0x0f3a3a, 0x6b1d1d][Math.floor(rng() * 4)]) : whiteC;
      const o = { L, B: L * (big ? 0.21 : 0.3), H: 0.75 + L * 0.022, hullC, bootC: dark ? C3(0xd8c48a) : C3(0x1d2a40), deckC: teakC, sail: true, sheer: 0.1, rake: 0.05 * L };
      const mh = big ? L * 1.05 : Math.min(32, L * 1.35 + 2); const mx = L * (big ? 0.12 : 0.06); const coverC = rng() < 0.6 ? C3(0x1f3f7a) : C3(0xe9e6dc);
      for (const [B, far] of [[N, false], [F, true]]) {
        const S = hull(B, m, o, far); o.S = S; const y = S.hd(0.4);
        // coachroof / deckhouse with a window band
        const ca = -L * (big ? 0.2 : 0.12), cb = L * (big ? 0.18 : 0.16), cw = o.B * (big ? 0.34 : 0.3);
        B.mat(PAINT[0], PAINT[1]); B.box(m, cb - ca, big ? 1.4 : 0.55, cw * 2, (ca + cb) / 2, y - 0.05, 0, big ? offW : whiteC);
        if (!far) {
          B.mat(GLASS[0], GLASS[1]); for (const sd of [-1, 1]) B.quad(X(m, ca + 0.6, y + (big ? 0.6 : 0.2), sd * (cw + 0.01)), X(m, cb - 0.8, y + (big ? 0.6 : 0.2), sd * (cw + 0.01)), X(m, cb - 1.2, y + (big ? 1.15 : 0.4), sd * (cw + 0.01)), X(m, ca + 0.8, y + (big ? 1.15 : 0.4), sd * (cw + 0.01)), glassC);
          // mast (tapered), spreaders, boom + furled main, furled genoa, sprayhood, wheel pedestals
          B.mat(0.35, 0.5); const mt = big ? 0.55 : 0.2 + L * 0.004; B.beam(m, [mx, y, 0], [mx, y + mh * 0.5, 0], mt, C3(0xd8dadc)); B.beam(m, [mx, y + mh * 0.5, 0], [mx, y + mh, 0], mt * 0.7, C3(0xd8dadc));
          const ns = big ? 4 : 2; for (let k = 1; k <= ns; k++) { const yy = y + mh * k / (ns + 1); const sw = o.B * 0.42 * (1 - k * 0.12); B.beam(m, [mx - 0.1, yy, -sw], [mx - 0.1, yy, sw], 0.08, C3(0xd8dadc)); }
          const bl = L * (big ? 0.36 : 0.42); B.beam(m, [mx - 0.15, y + 1.6, 0], [mx - bl, y + 1.75, 0], 0.16, C3(0xc0c4c8)); B.mat(0.8, 0); B.beam(m, [mx - 0.3, y + 1.92, 0], [mx - bl * 0.95, y + 1.98, 0], big ? 0.7 : 0.38, coverC, 6);
          B.beam(m, [mx + 0.1, y + mh * 0.92, 0], [L * 0.49, S.hd(1) + 0.4, 0], 0.12, coverC, 6);
          B.mat(0.8, 0); if (!big) B.box(m, 1.2, 0.7, cw * 1.8, ca - 0.6, y, 0, coverC); else { B.mat(0.4, 0.05); B.box(m, (cb - ca) * 0.5, 0.25, cw * 2.1, ca + (cb - ca) * 0.3, y + 1.35, 0, whiteC, { bottom: true }); }
          B.mat(0.4, 0.6); for (const sd of (big ? [-1, 1] : [0])) B.beam(m, [-L * 0.36, S.hd(0.14), sd * o.B * 0.18], [-L * 0.36, S.hd(0.14) + 0.85, sd * o.B * 0.18], 0.12, chrome);
          // standing rigging and lifelines (lines)
          const top = X(m, mx, y + mh, 0); LN.seg(top, X(m, -L / 2 + 0.3, S.hd(0) + 0.1, 0), C3(0x6c7074)); for (const sd of [-1, 1]) { LN.seg(top, X(m, mx - 0.4, S.hd(0.55), sd * S.w(0.55) * 0.95), C3(0x6c7074)); LN.seg(X(m, mx, y + mh * 0.66, 0), X(m, mx + 0.4, S.hd(0.57), sd * S.w(0.57) * 0.95), C3(0x6c7074));
            for (let k = 0; k < 8; k++) { const u0 = 0.05 + k * 0.11, u1 = u0 + 0.11; for (const hh of [0.45, 0.75]) LN.seg(X(m, S.xAt(u0, S.hd(u0)), S.hd(u0) + hh, sd * S.w(u0) * 0.96), X(m, S.xAt(u1, S.hd(u1)), S.hd(u1) + hh, sd * S.w(u1) * 0.96), lineC); } }
          LN.seg(X(m, -L / 2 + 0.3, S.hd(0) + 0.1, 0), X(m, -L / 2 + 0.1, S.hd(0) + 1.4, 0), chrome); flag(m, -L / 2 + 0.08, S.hd(0) + 1.35, 0, 0.7, 0.45, FLAGS[Math.floor(rng() * FLAGS.length)]);
        }
        // the mast is a line in the distance: always visible, never shimmering
        if (far) { LF.seg(X(m, mx, y, 0), X(m, mx, y + mh, 0), C3(0xd0d3d6)); LF.seg(X(m, mx, y + mh, 0), X(m, L * 0.49, S.hd(1), 0), C3(0x8a8e92)); LF.seg(X(m, mx, y + mh, 0), X(m, -L / 2 + 0.3, S.hd(0), 0), C3(0x8a8e92)); }
      }
      refl.push({ m, L, B: o.B, h: o.H + (big ? 2 : 1), hb: o.H, c1: hullC, c2: whiteC, mast: [mx, mh] });
      return o;
    }
    // ---- tender / RIB: grey tube collar, console; `onDeck` skips the reflection
    function tender(m, L, onDeck) {
      const o = { L, B: L * 0.4, H: 0.5, hullC: C3(0x3d4248), bootC: C3(0x2a2d31), deckC: C3(0x8d9196), sheer: 0.2, rake: 0.1 * L };
      for (const [B, far] of [[N, false], [F, true]]) {
        if (far && onDeck) continue; const S = hull(B, m, o, far);
        if (!far) { B.mat(0.75, 0); for (const sd of [-1, 1]) B.beam(m, [-L / 2 + 0.2, 0.55, sd * (S.w(0.1) - 0.15)], [L * 0.3, 0.6, sd * (S.w(0.7) - 0.15)], 0.42, C3(0x4a4f56), 6); B.beam(m, [L * 0.3, 0.6, -(S.w(0.7) - 0.15)], [L * 0.3, 0.6, S.w(0.7) - 0.15], 0.42, C3(0x4a4f56), 6);
          B.mat(0.5, 0.05); B.box(m, 0.8, 0.9, 0.7, -L * 0.05, 0.5, 0, whiteC); B.mat(GLASS[0], GLASS[1]); B.quad(X(m, 0.35 - L * 0.05, 1.4, -0.35), X(m, 0.35 - L * 0.05, 1.4, 0.35), X(m, 0.15 - L * 0.05, 1.7, 0.3), X(m, 0.15 - L * 0.05, 1.7, -0.3), glassC); }
      }
      if (!onDeck) refl.push({ m, L, B: o.B, h: 1.4, hb: 0.6, c1: C3(0x4a4f56), c2: whiteC });
    }
    return { superyacht, cruiser, sport, sail, tender, hullShape };
  }

  // ---------------------------------------------------------------- yacht reflections, contact shadows and wakes on the water: one mesh,
  // a quad per boat whose far edge is placed in the vertex shader where the mirror image of the boat's top meets the water for the
  // current eye (long streaks at grazing angles, short ones from above), coloured hull below / superstructure above, broken into ripples
  function buildReflections(E, refl, wakes) {
    const sc = E.sc, seaY = E.seaY; const P = [], A = [], D2 = [], C1 = [], C2 = [], I = [];
    const quad = (base, dim, c1, c2) => { const o = P.length / 3; for (const [cx, cy] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) { P.push(cx, cy, 0); A.push(base[0], base[1], base[2], base[3]); D2.push(dim[0], dim[1], dim[2], dim[3]); C1.push(c1.r, c1.g, c1.b); C2.push(c2.r, c2.g, c2.b); } I.push(o, o + 2, o + 1, o, o + 3, o + 2); };
    for (const r of refl) {
      const e = r.m.elements; const x = e[12], z = e[14], ax = e[0], az = e[2]; const yaw = Math.atan2(az, ax);
      quad([x, z, yaw, r.L], [r.B, r.h, r.hb, r.dark ? 1 : 0], r.c1, r.c2);       // reflection (kind 0/1)
      quad([x, z, yaw, r.L], [r.B, 0, 0, -1], r.c1, r.c2);                        // contact shadow (kind -1)
    }
    for (const w of wakes) quad([w.x, w.z, w.yaw, w.L], [w.B, 0, 0, -2], new THREE.Color(1, 1, 1), new THREE.Color(1, 1, 1)); // wake (kind -2)
    if (!I.length) return;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aBase', new THREE.Float32BufferAttribute(A, 4)); g.setAttribute('aDim', new THREE.Float32BufferAttribute(D2, 4));
    g.setAttribute('aC1', new THREE.Float32BufferAttribute(C1, 3)); g.setAttribute('aC2', new THREE.Float32BufferAttribute(C2, 3)); g.setIndex(I);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (let i = 0; i < A.length; i += 4) { x0 = Math.min(x0, A[i]); x1 = Math.max(x1, A[i]); z0 = Math.min(z0, A[i + 1]); z1 = Math.max(z1, A[i + 1]); }
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, seaY, (z0 + z1) / 2), Math.hypot(x1 - x0, z1 - z0) / 2 + 150);
    const uni = { uSea: { value: seaY + 0.04 }, uTime: { value: 0 }, uWater: { value: new THREE.Color(0x0b2a3c).convertSRGBToLinear() } };
    const mat = new THREE.ShaderMaterial({ uniforms: uni, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      vertexShader: [
        'attribute vec4 aBase; attribute vec4 aDim; attribute vec3 aC1; attribute vec3 aC2; uniform float uSea;',
        'varying vec2 vQ; varying vec3 vC1; varying vec3 vC2; varying vec4 vD; varying float vK; varying float vH; varying vec2 vW;',
        'void main() {',
        '  vec2 c = aBase.xy; vec2 ax = vec2(cos(aBase.z), sin(aBase.z)); vec2 bx = vec2(-ax.y, ax.x); float L = aBase.w, B = aDim.x; vK = aDim.w; vC1 = aC1; vC2 = aC2; vD = aDim;',
        '  vec2 p;',
        '  if (aDim.w < -1.5) { p = c - ax * (L * 0.5 + position.y * L) + bx * position.x * (B * 0.5 + position.y * L * 0.28); vQ = position.xy; }',
        '  else if (aDim.w < -0.5) { vec2 q = vec2(position.x, position.y * 2.0 - 1.0); p = c + ax * q.y * (L * 0.5 + 2.5) + bx * q.x * (B * 0.5 + 2.5); vQ = vec2(q.x * (B * 0.5 + 2.5) / (B * 0.5), q.y * (L * 0.5 + 2.5) / (L * 0.5)); }',
        '  else {',
        '    vec2 toC = cameraPosition.xz - c; float Dh = max(length(toC), 1.0); vec2 dc = toC / Dh; vec2 pp = vec2(-dc.y, dc.x);',
        '    float camH = max(cameraPosition.y - uSea, 0.3); float hwd = 0.5 * (L * abs(dot(ax, pp)) + B * abs(dot(bx, pp)));',
        '    float nearE = 0.5 * (L * abs(dot(ax, dc)) + B * abs(dot(bx, dc))) * 0.85;',
        '    float ext = min(min(Dh * aDim.y / (camH + aDim.y), Dh * 0.9 - nearE), aDim.y * 3.0); ext = max(ext, 0.5);',
        '    p = c + pp * position.x * hwd + dc * (nearE + position.y * ext); vQ = position.xy; vH = camH; vW = vec2(ext, Dh);',
        '  }',
        '  vec4 mv = modelViewMatrix * vec4(p.x, uSea, p.y, 1.0); gl_Position = projectionMatrix * mv;',
        '}'].join('\n'),
      fragmentShader: [
        'uniform float uTime; uniform vec3 uWater; varying vec2 vQ; varying vec3 vC1; varying vec3 vC2; varying vec4 vD; varying float vK; varying float vH; varying vec2 vW;',
        'float h1(float n) { return fract(sin(n) * 43758.5453); }',
        'void main() {',
        '  vec4 o;',
        '  if (vK < -1.5) { float u = abs(vQ.x), t = vQ.y; float arm = abs(u - 0.75 * sqrt(t + 0.02)) ; float foam = (1.0 - smoothstep(0.0, 0.08 + t * 0.25, arm)) * (1.0 - t) * 0.55 + (1.0 - smoothstep(0.0, 0.25, u)) * (1.0 - smoothstep(0.0, 0.35, t)) * 0.5;',
        '    foam *= 0.6 + 0.4 * sin(t * 60.0 + u * 9.0 - uTime * 3.0); o = vec4(vec3(0.85, 0.9, 0.92), clamp(foam, 0.0, 0.8)); }',
        '  else if (vK < -0.5) { vec2 q = abs(vQ); float d = max(q.x - 1.0, 0.0) * 3.0 + max(q.y - 1.0, 0.0) * 6.0; float a = (1.0 - smoothstep(0.0, 1.0, d)) * 0.38; o = vec4(0.0, 0.015, 0.025, a); }',
        '  else {',
        '    float v = clamp(vQ.y, 0.0, 1.0); float e = v * vD.y / (vH + vD.y); float h = e * vH / max(1.0 - e, 0.02);',
        '    vec3 col = h < vD.z ? vC1 : (fract(h / 2.7) > 0.45 ? vC2 : vec3(0.03, 0.05, 0.07));',
        '    float rip = 0.6 + 0.4 * sin(v * vW.x * 0.9 + sin(vQ.x * 4.0 + uTime * 0.5) * 1.2 + uTime * 0.9);',
        '    float brk = 0.75 + 0.25 * sin(vQ.x * 11.0 + v * 5.0 + uTime * 0.3);',
        '    float graze = clamp(1.4 - vH / max(vW.y, 1.0) * 1.2, 0.25, 1.0);',
        '    float a = (1.0 - smoothstep(0.55, 1.0, abs(vQ.x))) * (1.0 - smoothstep(0.6, 1.0, v)) * mix(0.6, 1.0, rip) * brk * 0.32 * graze;',
        '    o = vec4(mix(col * 0.42, uWater, 0.45), a); }',
        '  gl_FragColor = o;',
        '  #include <tonemapping_fragment>',
        '  #include <encodings_fragment>',
        '}'].join('\n') });
    const mesh = new THREE.Mesh(g, mat); mesh.name = 'yachtReflections'; mesh.renderOrder = 1; mesh.onBeforeRender = () => { uni.uTime.value = performance.now() / 1000; }; sc.group.add(mesh);
    E.stats.reflQuads = I.length / 6;
  }
  function buildHarbour(E) {
    const sc = E.sc, t = E.t, D = t.data, HB = D.harbour; const seaY = E.seaY; const rng = U.rng(2024);
    const harbour = (E.waterPolys || []).filter(w => w !== E.seaPoly && Math.abs(polyArea(w)) > 4000);
    if (!harbour.length) return;
    const SKx = EI.StreetKit, W = SKx.world(sc);
    const Pq = new SKx.Batch(), Cl = new SKx.Batch(), N = new SKx.Batch(), F = new SKx.Batch(), LN = new SKx.Lines(), LF = new SKx.Lines(); const refl = [], wakes = [];
    const K = yachtKit(N, F, LN, LF, refl); const I4 = new THREE.Matrix4();
    const white = C(0xf6f7f5), black = C(0x15171a), ropeC = C(0xd6cfbd), chainC = C(0x3a3c3e);
    const deckR = SKx.Atlas.region('pontoonDeck', 128, 128, (x, w, h) => { x.fillStyle = '#c9c4b8'; x.fillRect(0, 0, w, h); const r = U.rng(5); for (let k = 0; k < 8; k++) { x.fillStyle = 'rgba(80,72,60,0.35)'; x.fillRect(0, k * 16, w, 1.5); } for (let i = 0; i < 900; i++) { x.fillStyle = 'rgba(' + (r() < 0.5 ? '90,84,74' : '235,230,220') + ',' + (0.08 + r() * 0.12) + ')'; x.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); } },
      (x, w, h) => { for (let k = 0; k < 8; k++) { x.fillStyle = 'rgb(90,90,90)'; x.fillRect(0, k * 16, w, 2); } }, (x, w, h) => { x.fillStyle = 'rgb(150,150,150)'; x.fillRect(0, 0, w, h); });
    // ---- piers / pontoons: plank-decked floating pontoons just above the water, concrete piers at quay level, cleats, power posts
    const piers = (HB && HB.piers) || []; const pierPolys = [];
    for (const pr of piers) {
      const p = pr.p; if (p.length < 3) continue; const y = pr.f ? seaY + 0.55 : Math.max(seaY + 1.4, E.ground((p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2)); pierPolys.push(p); p._y = y;
      const shape = new THREE.Shape(); shape.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) shape.lineTo(p[i][0], p[i][1]);
      const g = new THREE.ShapeGeometry(shape); const pos = g.attributes.position; const idx = g.index.array;
      Pq.set(deckR, 0.85, 0);
      for (let i = 0; i < idx.length; i += 3) { const q = [idx[i], idx[i + 1], idx[i + 2]].map(j => [pos.getX(j), y, pos.getY(j)]); Pq.tri(q[0], q[2], q[1], C(0xffffff), [q[0][0] / 4, q[0][2] / 4, q[2][0] / 4, q[2][2] / 4, q[1][0] / 4, q[1][2] / 4]); }
      Pq.set('white', 0.9, 0);
      for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 0.3) continue;
        Pq.quad([a[0], seaY - 0.4, a[1]], [b[0], seaY - 0.4, b[1]], [b[0], y, b[1]], [a[0], y, a[1]], pr.f ? C(0x6f6a62) : C(0x8f8a80));
        const tx = (b[0] - a[0]) / l, tz = (b[1] - a[1]) / l;
        Cl.set('white', 0.5, 0.3); for (let s = 1.5; s < l - 1; s += 3.2) { const u = s / l; Cl.box(EI.Env.frame(a[0] + (b[0] - a[0]) * u, y, a[1] + (b[1] - a[1]) * u, tx, tz, -tz, tx), 0.32, 0.14, 0.12, 0, 0, 0, black); }
        Cl.set('white', 0.5, 0.05); for (let s = 6; s < l - 3; s += 14) { const u = s / l; const x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u; Cl.box(I4, 0.3, 1.0, 0.3, x, y, z, white); Cl.box(I4, 0.34, 0.18, 0.34, x, y + 1.0, z, C(0x1f7a4a)); Cl.mat(0.3, 0, 1.2); Cl.box(I4, 0.12, 0.1, 0.31, x, y + 0.8, z, C(0x7fd0ff)); Cl.mat(0.5, 0.05); }
      }
    }
    E.stats.piers = pierPolys.length;
    const inPier = (x, z) => { for (const p of pierPolys) if (U.pointInPoly(x, z, p)) return true; return false; };
    // ---- mooring lines: both long sides of every pier, and the quay edges of the main basin; boats moor stern-to
    const lines = [];
    for (const p of pierPolys) {
      let bi = 0, bj = 1, bd = 0; for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) { const d = Math.hypot(p[i][0] - p[j][0], p[i][1] - p[j][1]); if (d > bd) { bd = d; bi = i; bj = j; } }
      if (bd < 25) continue; const a = p[bi], b = p[bj]; const tx = (b[0] - a[0]) / bd, tz = (b[1] - a[1]) / bd; let half = 0; for (const q of p) half = Math.max(half, Math.abs((q[0] - a[0]) * -tz + (q[1] - a[1]) * tx)); half = Math.max(1.2, half / 2 + 0.6);
      const y = p._y;
      for (const sd of [-1, 1]) lines.push({ a: [a[0] + -tz * sd * half, a[1] + tx * sd * half], b: [b[0] + -tz * sd * half, b[1] + tx * sd * half], nx: -tz * sd, nz: tx * sd, len: bd, cls: bd > 140 ? 1 : 2, y });
    }
    const pr = {};
    for (const w of harbour) for (let i = 0; i < w.length; i++) {
      const a = w[i], b = w[(i + 1) % w.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 35) continue; let nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; if (!U.pointInPoly(mx + nx * 3, mz + nz * 3, w)) { nx = -nx; nz = -nz; } if (!U.pointInPoly(mx + nx * 3, mz + nz * 3, w)) continue;
      const dTrack = t.project(mx, mz, null, pr).dist;
      lines.push({ a: [a[0] + nx * 0.8, a[1] + nz * 0.8], b: [b[0] + nx * 0.8, b[1] + nz * 0.8], nx, nz, len: l, cls: 0, dTrack, y: Math.max(seaY + 1.4, E.ground(mx - nx * 2, mz - nz * 2)) });
    }
    // hero quays first (the ones the TV cameras see from Tabac and the pool), so the big yachts get their berths
    lines.sort((p, q) => (p.cls === 0 ? p.dTrack : 999) - (q.cls === 0 ? q.dTrack : 999));
    // ---- boats
    const occ = new Map(); const OG = 3; const okey = (x, z) => Math.floor(x / OG) * 8192 + Math.floor(z / OG);
    const inWater = (px, pz) => { for (const w of harbour) if (U.pointInPoly(px, pz, w)) return true; return !!(E.seaPoly && U.pointInPoly(px, pz, E.seaPoly)); };
    const free = (x, z, ax, az, L, Bm) => { for (let a = -L / 2; a <= L / 2; a += 2) for (let b = -Bm / 2; b <= Bm / 2; b += Math.max(1, Bm / 3)) { const px = x + ax * a - az * b, pz = z + az * a + ax * b; if (occ.has(okey(px, pz)) || inPier(px, pz)) return false; if (sc.gridHeight && sc.gridHeight(px, pz) > seaY + 0.35) return false; if (!inWater(px, pz)) return false; } return true; };
    const mark = (x, z, ax, az, L, Bm) => { for (let a = -L / 2 - 1; a <= L / 2 + 1; a += 1.5) for (let b = -Bm / 2 - 0.8; b <= Bm / 2 + 0.8; b += 1) occ.set(okey(x + ax * a - az * b, z + az * a + ax * b), 1); };
    const n = { all: 0, super: 0, hero: 0, cruiser: 0, sport: 0, sail: 0, tender: 0 };
    const place = (kind, m, L) => { if (kind === 'super' || kind === 'hero') return K.superyacht(m, L, rng, kind === 'hero'); if (kind === 'cruiser') return K.cruiser(m, L, rng); if (kind === 'sport') return K.sport(m, L, rng); if (kind === 'sail' || kind === 'bigsail') return K.sail(m, L, rng, kind === 'bigsail'); K.tender(m, L); return null; };
    const beamOf = (kind, L) => L * (kind === 'super' || kind === 'hero' ? 0.19 : kind === 'bigsail' ? 0.21 : kind === 'tender' ? 0.4 : 0.31);
    for (const ln of lines) {
      const dx = ln.b[0] - ln.a[0], dz = ln.b[1] - ln.a[1]; const l = Math.hypot(dx, dz); const tx = dx / l, tz = dz / l;
      const nearTrack = ln.cls === 0 && ln.dTrack < 130, heroQ = ln.cls === 0 && ln.dTrack < 75;
      for (let s = 2; s < l - 2;) {
        let kind, L; const r = rng();
        if (ln.cls === 0) { if (heroQ && r < 0.8) { kind = 'hero'; L = 58 + rng() * 34; } else if (nearTrack && r < 0.85) { kind = 'super'; L = 36 + rng() * 26; } else if (r < 0.6) { kind = 'super'; L = 32 + rng() * 26; } else if (r < 0.88) { kind = 'cruiser'; L = 16 + rng() * 14; } else if (r < 0.96) { kind = 'bigsail'; L = 32 + rng() * 22; } else { kind = 'sail'; L = 13 + rng() * 10; } }
        // Grand Prix week: the long pontoons are lined with superyachts and big flybridge cruisers, only a few sailing boats
        else if (ln.cls === 1) { if (r < 0.62) { kind = 'super'; L = 30 + rng() * 26; } else if (r < 0.9) { kind = 'cruiser'; L = 16 + rng() * 12; } else if (r < 0.96) { kind = 'bigsail'; L = 26 + rng() * 14; } else { kind = 'sport'; L = 10 + rng() * 5; } }
        else { if (r < 0.4) { kind = 'super'; L = 26 + rng() * 16; } else if (r < 0.78) { kind = 'cruiser'; L = 13 + rng() * 11; } else if (r < 0.88) { kind = 'sport'; L = 9 + rng() * 5; } else if (r < 0.97) { kind = 'sail'; L = 10 + rng() * 7; } else { kind = 'tender'; L = 4.5 + rng() * 2; } }
        const Bm = beamOf(kind, L); const gap = 0.7 + rng() * 0.9;
        const along = s + Bm / 2; if (along > l - Bm / 2) break;
        const sx = ln.a[0] + tx * along, sz = ln.a[1] + tz * along; const cx = sx + ln.nx * (L / 2 + 1.6), cz = sz + ln.nz * (L / 2 + 1.6);
        if (rng() < 0.1 || !free(cx, cz, ln.nx, ln.nz, L, Bm)) { s += Bm * 0.6 + gap; continue; }
        const yaw = Math.atan2(-ln.nz, ln.nx) + (rng() - 0.5) * 0.03; const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(cx, seaY, cz);
        const o = place(kind, m, L); mark(cx, cz, ln.nx, ln.nz, L, Bm); if (kind === 'hero') (Street.heroes = Street.heroes || []).push({ x: cx, z: cz, nx: ln.nx, nz: ln.nz, tx, tz, L, y: seaY }); n.all++; n[kind === 'bigsail' ? 'sail' : kind]++; s += Bm + gap;
        // stern lines to the quay bollards, the passerelle on the big ones, bow chain into the water
        if (o) { const S = o.S || K.hullShape(o); const sy = (S.hd ? S.hd(0) : 1) + seaY; const qy = ln.y;
          for (const sd of [-1, 1]) { const st = [cx - ln.nx * L / 2 + tx * sd * Bm * 0.4, sy, cz - ln.nz * L / 2 + tz * sd * Bm * 0.4]; const q = [sx + tx * sd * (Bm * 0.5 + 1.2) - ln.nx * 0.6, qy + 0.2, sz + tz * sd * (Bm * 0.5 + 1.2) - ln.nz * 0.6]; LN.rope(st, q, 0.35, ropeC, 5); Cl.set('white', 0.4, 0.5); Cl.box(EI.Env.frame(q[0], qy, q[2], tx, tz, -tz, tx), 0.3, 0.35, 0.3, 0, 0, 0, C(0x2a2c30)); }
          const bow = [cx + ln.nx * L * 0.46, (S.hd ? S.hd(0.95) : 1.2) + seaY - 0.6, cz + ln.nz * L * 0.46]; LN.rope(bow, [cx + ln.nx * (L * 0.5 + 6), seaY - 0.2, cz + ln.nz * (L * 0.5 + 6)], 0.1, chainC, 2);
          if (kind === 'hero' || kind === 'super') { const pm = EI.Env.frame(cx - ln.nx * (L / 2 + 0.8), sy - 0.15, cz - ln.nz * (L / 2 + 0.8), ln.nx, ln.nz, -ln.nz, ln.nx); N.set('white', 0.35, 0.6); N.box(pm, 3.2, 0.12, 0.9, 0, 0, 0, C(0xd9dee2)); N.mat(0.5, 0.05); for (const sd of [-0.45, 0.45]) N.beam(pm, [-1.6, 0.9, sd], [1.6, 0.9, sd], 0.05, C(0xd9dee2)); } }
        // a tender tied alongside some superyachts
        if ((kind === 'super' || kind === 'hero') && rng() < 0.3) { const tl = 5 + rng() * 2; const ox = cx + ln.nx * (L / 2 + tl * 0.7), oz = cz + ln.nz * (L / 2 + tl * 0.7); if (free(ox, oz, ln.nx, ln.nz, tl, tl * 0.45)) { K.tender(new THREE.Matrix4().makeRotationY(yaw).setPosition(ox, seaY, oz), tl); mark(ox, oz, ln.nx, ln.nz, tl, tl * 0.45); n.all++; n.tender++; } }
      }
    }
    // a few big yachts at anchor off the harbour mouth (the sea beyond the breakwater)
    if (E.seaPoly) { let placed = 0; for (let k = 0; k < 400 && placed < 9; k++) { const x = 300 + rng() * 700, z = 150 + rng() * 650; if (!U.pointInPoly(x, z, E.seaPoly) || E.dcAt(x, z) < 160) continue; let near = false; for (const w of harbour) if (distToPoly(x, z, w) < 60) near = true; if (near) continue; const L = 45 + rng() * 40; const yaw = 0.6 + rng() * 0.4; const ax = Math.cos(yaw), az = -Math.sin(yaw); if (!free(x, z, ax, az, L, L * 0.2)) continue; K.superyacht(new THREE.Matrix4().makeRotationY(yaw).setPosition(x, seaY, z), L, rng, true); mark(x, z, ax, az, L, L * 0.2); placed++; n.all++; n.super++; } }
    // tenders crossing the basin, each with its wake
    for (let k = 0, placed = 0; k < 300 && placed < 10; k++) { const w = harbour[0]; const bx = U.polyBounds(w); const x = bx.x0 + rng() * (bx.x1 - bx.x0), z = bx.z0 + rng() * (bx.z1 - bx.z0); if (!U.pointInPoly(x, z, w) || distToPoly(x, z, w) < 25) continue; const yaw = rng() * 6.283; const ax = Math.cos(yaw), az = -Math.sin(yaw); if (!free(x, z, ax, az, 30, 8)) continue; const tl = 4.5 + rng() * 2.5; K.tender(new THREE.Matrix4().makeRotationY(yaw).setPosition(x, seaY, z), tl); mark(x, z, ax, az, 6, 2.5); wakes.push({ x, z, yaw: Math.atan2(az, ax), L: tl, B: tl * 0.4 }); placed++; n.all++; n.tender++; }
    // ---- breakwaters: concrete crowns above the swell, armour-block flanks, the green / red harbour-mouth beacons
    Pq.set('white', 0.9, 0);
    for (const bw of (HB && HB.breakwaters) || []) {
      const p = bw.p; const y = seaY + 2.6; const shape = new THREE.Shape(); shape.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) shape.lineTo(p[i][0], p[i][1]);
      const g = new THREE.ShapeGeometry(shape); const pos = g.attributes.position, idx = g.index.array; for (let i = 0; i < idx.length; i += 3) Pq.tri([pos.getX(idx[i]), y, pos.getY(idx[i])], [pos.getX(idx[i + 2]), y, pos.getY(idx[i + 2])], [pos.getX(idx[i + 1]), y, pos.getY(idx[i + 1])], C(0xbdb8ad));
      for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; Pq.quad([a[0], seaY - 0.5, a[1]], [b[0], seaY - 0.5, b[1]], [b[0], y, b[1]], [a[0], y, a[1]], C(0x8f8a80)); }
      let far = p[0], fd = -1; for (const q of p) { const d = E.dcAt(q[0], q[1]); if (d > fd) { fd = d; far = q; } }
      const red = Math.abs(polyArea(p)) > 2500; const fm = new THREE.Matrix4().makeTranslation(far[0], 0, far[1]);
      Pq.col(fm, 0, 0, y, y + 7, 0.9, 0.7, 10, white, false); Pq.mat(0.5, 0, 0.4); Pq.col(fm, 0, 0, y + 7, y + 9, 0.75, 0.75, 10, red ? C(0xc8102e) : C(0x1e8a4a), true); Pq.mat(0.9, 0);
    }
    // ---- buoys: yellow mooring buoys in the basin
    Cl.set('white', 0.4, 0.05);
    for (let k = 0, placed = 0; k < 300 && placed < 24; k++) { const w = harbour[0]; const bx = U.polyBounds(w); const x = bx.x0 + rng() * (bx.x1 - bx.x0), z = bx.z0 + rng() * (bx.z1 - bx.z0); if (!U.pointInPoly(x, z, w) || occ.has(okey(x, z)) || distToPoly(x, z, w) < 12) continue; Cl.ball(I4, x, seaY + 0.15, z, 0.45, 0.45, 0.45, C(0xf2c21a), 6); placed++; }
    // ---- people on the pontoons
    let nPeople = 0; for (const p of pierPolys) { const bx = U.polyBounds(p); for (let k = 0; k < 6; k++) { const x = bx.x0 + rng() * (bx.x1 - bx.x0), z = bx.z0 + rng() * (bx.z1 - bx.z0); if (!U.pointInPoly(x, z, p)) continue; person(Cl, x, seaY + 0.55, z, rng); nPeople++; } }
    W.add(N, 'yNear'); W.add(F, 'yFar'); W.add(LN, 'linesNear'); W.add(LF, 'lines'); W.add(Pq, 'main'); W.add(Cl, 'fine');
    buildReflections(E, refl, wakes);
    E.stats.yachts = n.all; E.stats.superyachts = n.super + n.hero; E.stats.heroYachts = n.hero; E.stats.sailYachts = n.sail; E.stats.yachtNearTris = Math.round(N.count / 3); E.stats.yachtFarTris = Math.round(F.count / 3); E.stats.yachtLines = LN.count + LF.count; E.stats.pontoonPeople = nPeople;
  }
  const SK = () => EI.StreetKit;
  function person(B, x, y, z, rng) {
    const I = new THREE.Matrix4(); const shirt = C([0xf2f2f2, 0x1d2e4a, 0x2b6fb8, 0xc8102e, 0xe8d9b0, 0x2a2b2e][Math.floor(rng() * 6)]), legs = C([0x2a2b2e, 0xd8d0b8, 0x1d2e4a][Math.floor(rng() * 3)]), skin = C([0xe8c0a0, 0xc89878, 0x8a5a3a][Math.floor(rng() * 3)]);
    B.set('white', 0.8, 0); B.box(I, 0.34, 0.85, 0.22, x, y, z, legs); B.box(I, 0.42, 0.62, 0.26, x, y + 0.85, z, shirt); B.ball(I, x, y + 1.62, z, 0.12, 0.14, 0.12, skin, 5);
  }

  // ---------------------------------------------------------------- the Yacht Club de Monaco and the temporary hospitality terraces on the quays
  function buildQuayBuildings(E) {
    const sc = E.sc, t = E.t, ST = t.data.street; if (!ST) return; const SKx = EI.StreetKit; const B = new SKx.Batch().mat(0.55, 0.05), Gb = new SKx.Batch().mat(0.06, 0.6);
    const white = C(0xf4f4f1), shade = C(0xdcdedd), glass = C(0x24384a), rail = C(0xd4d8db), canvas = C(0xfbfbf8), teak = C(0xa47a4a), red = C(0xc8102e), navy = C(0x1b2c4e);
    const along = (s0, s1, side, gap) => { const i0 = t.idxAtS(s0), i1 = t.idxAtS(s1); const w0 = (side < 0 ? t.wallL[i0] : t.wallR[i0]) + gap, w1 = (side < 0 ? t.wallL[i1] : t.wallR[i1]) + gap;
      const A = [t.x[i0] + t.nx[i0] * side * w0, t.z[i0] + t.nz[i0] * side * w0], Bp = [t.x[i1] + t.nx[i1] * side * w1, t.z[i1] + t.nz[i1] * side * w1]; const L = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]); let ax = (Bp[0] - A[0]) / L, az = (Bp[1] - A[1]) / L; let nx = -az, nz = ax; const im = t.idxAtS((s0 + s1) / 2); if (nx * t.nx[im] * side + nz * t.nz[im] * side < 0) { nx = -nx; nz = -nz; }
      // the straight front between the two ends cuts across the bend in between (the YCM stood in the chicane's escape road): slide the
      // whole block back until every point of its front clears the barrier line by min(gap, 2) m (FIT-AUDIT)
      let push = 0; const pq = {}; for (let k = 0; k <= 24; k++) { const u = k / 24; t.project(A[0] + (Bp[0] - A[0]) * u, A[1] + (Bp[1] - A[1]) * u, null, pq); const sd = pq.lat < 0 ? -1 : 1; const w = sd < 0 ? t.wallL[pq.i] : t.wallR[pq.i]; push = Math.max(push, w + Math.min(gap, 2) + (sd === side ? -pq.dist : pq.dist)); }
      return { cx: (A[0] + Bp[0]) / 2 + nx * push, cz: (A[1] + Bp[1]) / 2 + nz * push, ax, az, nx, nz, L, y: t.y[im] - 0.03 }; };
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
    Gb.tint(C(0x1e2c3a)); const W = SKx.world(sc); W.add(B, 'main'); W.add(Gb, 'main');
  }

  // shared with other circuits' harbours (js/env_yas.js): the boat kit, the water material and the boats' reflections on the water
  Street.yachtKit = yachtKit; Street.waterMaterial = waterMaterial; Street.buildReflections = buildReflections;
  Street.build = function (E) {
    const T0 = performance.now();
    buildWater(E); if (E.t.data.street) buildTunnelVault(E); else buildTunnel(E);
    if (E.t.data.harbour) { buildHarbour(E); buildQuayBuildings(E); } else buildYachts(E);
    if (EI.StreetKit && E.t.data.street) EI.StreetKit.build(E);
    E.timings.street = Math.round(performance.now() - T0);
  };
})();
