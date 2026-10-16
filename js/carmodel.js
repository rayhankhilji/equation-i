// Equation I - detailed procedural single-seater (2022-era proportions)
// Coordinates: x forward, y up, z right. Ground at y = 0. Length 5.6 m, wheelbase 3.6 m, width 2.0 m.
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  const WHEEL_R = 0.36, FRONT_AXLE = 1.75, REAR_AXLE = -1.85;
  const FLAP_CLOSED = -0.63, FLAP_OPEN = FLAP_CLOSED + 55 * Math.PI / 180;   // DRS flap rotation.z about its trailing-edge pivot (positive lifts the leading edge)

  // ---------------------------------------------------------------- geometry helpers
  function merge(geos) {
    const pos = [], nrm = [], uv = [];
    for (const g0 of geos) { const g = g0.index ? g0.toNonIndexed() : g0; pos.push(...g.attributes.position.array); nrm.push(...g.attributes.normal.array); if (g.attributes.uv) uv.push(...g.attributes.uv.array); else for (let i = 0; i < g.attributes.position.count; i++) uv.push(0, 0); }
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return out;
  }
  // loft of superellipse sections along x. station: {x, w, h, y0, n, wt, zc}
  function loft(stations, zc, segs) {
    segs = segs || 32; const pos = [], idx = []; const n = stations.length;
    for (let i = 0; i < n; i++) {
      const st = stations[i]; const e = st.n || 2.6; const zOff = (zc || 0) + (st.zc || 0);
      for (let j = 0; j < segs; j++) {
        const t = (j / segs) * Math.PI * 2; const c = Math.cos(t), sn = Math.sin(t);
        const fy = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / e); const y = st.y0 + st.h / 2 + (st.h / 2) * fy;
        const k = U.clamp((y - st.y0) / st.h, 0, 1); const w = st.wt != null ? U.lerp(st.w, st.w * st.wt, Math.pow(k, 1.6)) : st.w;
        pos.push(st.x, y, zOff + w * Math.sign(c) * Math.pow(Math.abs(c), 2 / e));
      }
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < segs; j++) { const a = i * segs + j, b = i * segs + (j + 1) % segs, c = (i + 1) * segs + j, d = (i + 1) * segs + (j + 1) % segs; idx.push(a, c, b, b, c, d); }
    const sa = stations[0], sb = stations[n - 1];
    const capA = pos.length / 3; pos.push(sa.x, sa.y0 + sa.h / 2, (zc || 0) + (sa.zc || 0)); for (let j = 0; j < segs; j++) idx.push(capA, (j + 1) % segs, j);
    const capB = pos.length / 3; pos.push(sb.x, sb.y0 + sb.h / 2, (zc || 0) + (sb.zc || 0)); for (let j = 0; j < segs; j++) idx.push(capB, (n - 1) * segs + j, (n - 1) * segs + (j + 1) % segs);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  // wing element swept along z. fn(z) -> {x (leading edge), y, chord, aoa (rad), t (thickness)}
  function wing(z0, z1, fn, sections) {
    sections = sections || 28; const prof = [[0, 0], [0.12, 0.55], [0.3, 0.7], [0.55, 0.55], [1, 0.05], [1, -0.05], [0.55, -0.3], [0.3, -0.42], [0.12, -0.35]];
    const P = prof.length; const pos = [], idx = [];
    for (let i = 0; i <= sections; i++) {
      const z = U.lerp(z0, z1, i / sections); const s = fn(z); const ca = Math.cos(-s.aoa), sa = Math.sin(-s.aoa);
      for (const [pc, pt] of prof) { const lx = -pc * s.chord, ly = pt * s.t; pos.push(s.x + lx * ca - ly * sa, s.y + lx * sa + ly * ca, z); }
    }
    for (let i = 0; i < sections; i++) for (let j = 0; j < P; j++) { const a = i * P + j, b = i * P + (j + 1) % P, c = (i + 1) * P + j, d = (i + 1) * P + (j + 1) % P; idx.push(a, b, c, b, d, c); }
    // end caps
    for (const i of [0, sections]) { const base = i * P; const cx = pos.length / 3; let mx = 0, my = 0; for (let j = 0; j < P; j++) { mx += pos[(base + j) * 3]; my += pos[(base + j) * 3 + 1]; } pos.push(mx / P, my / P, pos[base * 3 + 2]); for (let j = 0; j < P; j++) { if (i === 0) idx.push(cx, base + (j + 1) % P, base + j); else idx.push(cx, base + j, base + (j + 1) % P); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  // thin plate from a 2D outline in the x/y plane extruded along z (endplates, fins)
  function plate(points, thickness, z, bevel) {
    const s = new THREE.Shape(); s.moveTo(points[0][0], points[0][1]); for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: !!bevel, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 }); g.translate(0, 0, z - thickness / 2); return g;
  }
  // strut between two points (suspension arms, pylons), flattened (airfoil-ish) box
  function strut(a, b, w, h) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = d.length();
    const g = new THREE.BoxGeometry(len, h || 0.03, w || 0.06); // along x
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.clone().normalize());
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q)); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); return g;
  }
  function box(w, h, d, x, y, z, ry) { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); return g; }
  function boxProjectUV(geo) {
    const p = geo.attributes.position, n = geo.attributes.normal; const uv = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ny = n.getY(i), nz = n.getZ(i); const u = U.clamp((x + 3.0) / 6.2, 0, 1); let v;
      const side = Math.abs(ny) < 0.5 && Math.abs(nz) >= 0.5;
      if (!side) v = U.clamp((z + 1.0) / 2.0, 0, 1) * 0.5; else if (nz < 0) v = 0.5 + (1 - U.clamp(y / 1.2, 0, 1)) * 0.25; else v = 0.75 + (1 - U.clamp(y / 1.2, 0, 1)) * 0.25;
      uv.push(side && nz < 0 ? 1 - u : u, v);
    }
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return geo;
  }

  // ---------------------------------------------------------------- shared textures
  let carbonTex = null, coverTex = null, wheelDisplay = null;
  function textures() {
    if (carbonTex) return;
    const c = document.createElement('canvas'); c.width = c.height = 64; const ctx = c.getContext('2d');
    for (let y = 0; y < 64; y += 4) for (let x = 0; x < 64; x += 4) { const k = ((x >> 2) + (y >> 2)) % 2; ctx.fillStyle = k ? '#262830' : '#15161a'; ctx.fillRect(x, y, 4, 4); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x, y, 4, 1); }
    carbonTex = new THREE.CanvasTexture(c); carbonTex.wrapS = carbonTex.wrapT = THREE.RepeatWrapping; carbonTex.repeat.set(40, 40); carbonTex.encoding = THREE.sRGBEncoding;
    const d = document.createElement('canvas'); d.width = d.height = 256; const dctx = d.getContext('2d');
    dctx.fillStyle = '#b9bcc2'; dctx.beginPath(); dctx.arc(128, 128, 128, 0, 6.283); dctx.fill();
    for (let i = 0; i < 16; i++) { dctx.save(); dctx.translate(128, 128); dctx.rotate(i * Math.PI / 8); dctx.fillStyle = i % 2 ? '#9a9da3' : '#cfd2d7'; dctx.fillRect(-6, -120, 12, 100); dctx.restore(); }
    dctx.fillStyle = '#50545b'; dctx.beginPath(); dctx.arc(128, 128, 26, 0, 6.283); dctx.fill(); dctx.strokeStyle = '#7a7e85'; dctx.lineWidth = 6; dctx.beginPath(); dctx.arc(128, 128, 118, 0, 6.283); dctx.stroke();
    coverTex = new THREE.CanvasTexture(d); coverTex.encoding = THREE.sRGBEncoding;
    const w = document.createElement('canvas'); w.width = 256; w.height = 128; const wctx = w.getContext('2d');
    wctx.fillStyle = '#0a0a0c'; wctx.fillRect(0, 0, 256, 128); const cols = ['#22e26a', '#22e26a', '#22e26a', '#22e26a', '#22e26a', '#ff2a2a', '#ff2a2a', '#ff2a2a', '#ff2a2a', '#ff2a2a', '#4aa8ff', '#4aa8ff', '#4aa8ff', '#4aa8ff', '#4aa8ff'];
    cols.forEach((cl, i) => { wctx.fillStyle = cl; wctx.beginPath(); wctx.arc(20 + i * 15.4, 14, 5, 0, 6.283); wctx.fill(); });
    wctx.fillStyle = '#ffd200'; wctx.font = '900 54px Arial'; wctx.textAlign = 'center'; wctx.fillText('6', 128, 80); wctx.fillStyle = '#9fe'; wctx.font = '700 16px Arial'; wctx.fillText('ERS 78%   DRS', 128, 110);
    for (let i = 0; i < 6; i++) { wctx.fillStyle = ['#e10600', '#1a73e8', '#ffd200', '#22e26a', '#fff', '#ff7a00'][i]; wctx.beginPath(); wctx.arc(30 + i * 40, 60 + (i % 2) * 30, 7, 0, 6.283); wctx.fill(); }
    wheelDisplay = new THREE.CanvasTexture(w); wheelDisplay.encoding = THREE.sRGBEncoding;
  }

  // ---------------------------------------------------------------- station data
  const BODY = [
    { x: 3.02, w: 0.05, h: 0.08, y0: 0.31, n: 2.2 }, { x: 2.8, w: 0.1, h: 0.15, y0: 0.30, n: 2.4 }, { x: 2.5, w: 0.15, h: 0.23, y0: 0.30, n: 2.6 }, { x: 2.2, w: 0.21, h: 0.31, y0: 0.29, n: 2.8 },
    { x: 1.9, w: 0.27, h: 0.4, y0: 0.26, n: 3.0 }, { x: 1.6, w: 0.32, h: 0.5, y0: 0.19, n: 3.2 }, { x: 1.3, w: 0.36, h: 0.58, y0: 0.13, n: 3.4 }, { x: 1.0, w: 0.4, h: 0.64, y0: 0.09, n: 3.6 },
    { x: 0.7, w: 0.42, h: 0.68, y0: 0.07, n: 3.6 }, { x: 0.4, w: 0.44, h: 0.72, y0: 0.06, n: 3.4, wt: 0.6 }, { x: 0.1, w: 0.44, h: 0.96, y0: 0.06, n: 3.0, wt: 0.3 }, { x: -0.25, w: 0.43, h: 0.9, y0: 0.06, n: 2.9, wt: 0.22 },
    { x: -0.7, w: 0.4, h: 0.74, y0: 0.06, n: 2.8, wt: 0.18 }, { x: -1.2, w: 0.36, h: 0.6, y0: 0.07, n: 2.8, wt: 0.14 }, { x: -1.7, w: 0.3, h: 0.48, y0: 0.09, n: 2.7, wt: 0.12 }, { x: -2.2, w: 0.2, h: 0.34, y0: 0.14, n: 2.5, wt: 0.12 }, { x: -2.55, w: 0.1, h: 0.2, y0: 0.2, n: 2.3 },
  ];
  const POD = [
    { x: 0.36, w: 0.3, h: 0.5, y0: 0.1, n: 3.6 }, { x: -0.1, w: 0.36, h: 0.55, y0: 0.08, n: 3.6 }, { x: -0.6, w: 0.36, h: 0.5, y0: 0.08, n: 3.4, zc: -0.02 },
    { x: -1.1, w: 0.32, h: 0.4, y0: 0.08, n: 3.2, zc: -0.06 }, { x: -1.6, w: 0.26, h: 0.28, y0: 0.09, n: 3.0, zc: -0.12 }, { x: -2.1, w: 0.16, h: 0.16, y0: 0.1, n: 2.6, zc: -0.2 }, { x: -2.4, w: 0.06, h: 0.06, y0: 0.12, n: 2.4, zc: -0.26 },
  ];

  // ---------------------------------------------------------------- build
  function build(car) {
    textures();
    const g = new THREE.Group(); const body = new THREE.Group(); g.add(body);
    const tex = EI.paintLivery(car.team, car.num, car.isPlayer ? car.name : null, car.driver);
    const paint = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.25, roughness: 0.28, envMapIntensity: 1.1 });
    const carbon = new THREE.MeshStandardMaterial({ map: carbonTex, color: 0xd0d0d0, metalness: 0.35, roughness: 0.38, envMapIntensity: 0.8 });
    const matte = new THREE.MeshStandardMaterial({ color: 0x0e0f12, metalness: 0.05, roughness: 0.75 });
    const metal = new THREE.MeshStandardMaterial({ color: 0xb8bbc0, metalness: 0.95, roughness: 0.3 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0c0d10, metalness: 0.6, roughness: 0.05 });
    const accent = new THREE.Color(car.team.accent);

    // ---- painted bodywork (livery): body, sidepods, engine cover fin, nose pylons
    const painted = [loft(BODY, 0), loft(POD, 0.63), loft(POD, -0.63)];
    painted.push(box(1.3, 0.3, 0.02, -1.4, 0.74, 0));                       // shark fin
    for (const s of [1, -1]) painted.push(box(0.32, 0.25, 0.04, 2.78, 0.3, s * 0.2));   // nose to wing pylons
    const paintedGeo = boxProjectUV(merge(painted)); const bodyMesh = new THREE.Mesh(paintedGeo, paint); bodyMesh.castShadow = true; body.add(bodyMesh);

    // ---- sidepod inlets (dark recesses) and cockpit opening
    for (const s of [1, -1]) { const inlet = new THREE.Mesh(loft([{ x: 0.4, w: 0.24, h: 0.34, y0: 0.19, n: 3.4 }, { x: 0.2, w: 0.2, h: 0.28, y0: 0.22, n: 3.4 }], s * 0.63, 20), matte); body.add(inlet); }
    const cockpitHole = new THREE.Mesh(loft([{ x: 1.05, w: 0.18, h: 0.1, y0: 0.72, n: 3 }, { x: 0.15, w: 0.3, h: 0.1, y0: 0.7, n: 3 }], 0, 20), matte); body.add(cockpitHole);
    const airboxHole = new THREE.Mesh(loft([{ x: 0.36, w: 0.1, h: 0.2, y0: 0.86, n: 2.6 }, { x: 0.2, w: 0.12, h: 0.22, y0: 0.84, n: 2.6 }], 0, 16), matte); body.add(airboxHole);

    // ---- floor, edge wings, diffuser (carbon)
    const floorShape = [[1.2, 0.5], [0.9, 0.85], [0.3, 0.95], [-1.2, 0.95], [-1.9, 0.75], [-2.55, 0.55], [-2.55, -0.55], [-1.9, -0.75], [-1.2, -0.95], [0.3, -0.95], [0.9, -0.85], [1.2, -0.5]];
    const fs = new THREE.Shape(); fs.moveTo(floorShape[0][0], floorShape[0][1]); for (let i = 1; i < floorShape.length; i++) fs.lineTo(floorShape[i][0], floorShape[i][1]); fs.closePath();
    const floorGeo = new THREE.ExtrudeGeometry(fs, { depth: 0.05, bevelEnabled: false }); floorGeo.rotateX(Math.PI / 2); floorGeo.translate(0, 0.1, 0);
    const carbonParts = [floorGeo];
    for (const s of [1, -1]) { carbonParts.push(box(1.3, 0.04, 0.12, -0.6, 0.17, s * 0.98)); carbonParts.push(box(0.5, 0.12, 0.02, -0.1, 0.2, s * 1.0)); }
    // diffuser: ramp + strakes
    const ramp = box(0.8, 0.03, 1.1, -2.2, 0.16, 0); ramp.rotateZ(-0.35); ramp.translate(0, 0.08, 0); carbonParts.push(ramp);
    for (const z of [-0.45, -0.2, 0.2, 0.45]) { const st = box(0.7, 0.2, 0.015, -2.2, 0.22, z); carbonParts.push(st); }
    // front wing endplates + footplates, rear wing endplates
    for (const s of [1, -1]) {
      carbonParts.push(plate([[2.3, 0.06], [3.2, 0.06], [3.2, 0.28], [2.95, 0.46], [2.45, 0.5], [2.3, 0.4]], 0.018, s * 1.02, true));
      carbonParts.push(box(0.5, 0.012, 0.12, 2.85, 0.065, s * 0.96));
    }
    // suspension: wishbones, pushrods, track rods, uprights (front and rear)
    const corners = [[FRONT_AXLE, 1], [FRONT_AXLE, -1], [REAR_AXLE, 1], [REAR_AXLE, -1]];
    for (const [ax, s] of corners) {
      const front = ax > 0; const zIn = s * (front ? 0.36 : 0.4), zOut = s * (front ? 0.78 : 0.76);
      carbonParts.push(strut([ax + 0.22, 0.5, zIn], [ax + 0.02, 0.5, zOut], 0.07, 0.025)); carbonParts.push(strut([ax - 0.25, 0.48, zIn], [ax - 0.02, 0.5, zOut], 0.07, 0.025));
      carbonParts.push(strut([ax + 0.2, 0.18, zIn], [ax + 0.02, 0.2, zOut], 0.07, 0.025)); carbonParts.push(strut([ax - 0.28, 0.17, zIn], [ax - 0.02, 0.2, zOut], 0.07, 0.025));
      carbonParts.push(strut(front ? [ax - 0.08, 0.62, zIn] : [ax - 0.1, 0.2, zIn], front ? [ax - 0.06, 0.2, zOut - s * 0.04] : [ax - 0.06, 0.52, zOut - s * 0.04], 0.05, 0.03)); // pushrod / pullrod
      carbonParts.push(strut([ax + 0.12, 0.33, zIn], [ax + 0.1, 0.35, zOut], 0.05, 0.02)); // track rod
      carbonParts.push(box(0.12, 0.36, 0.08, ax, 0.36, zOut)); // upright
      // brake duct winglets
      carbonParts.push(box(0.3, 0.3, 0.02, ax, 0.4, zOut + s * 0.08));
    }
    // halo V pylon, mirror arms, T-cam mount, pitot
    carbonParts.push(strut([1.12, 0.74, 0], [0.98, 0.96, 0], 0.04, 0.05));
    for (const s of [1, -1]) carbonParts.push(strut([0.85, 0.66, s * 0.42], [0.92, 0.8, s * 0.66], 0.02, 0.02));
    carbonParts.push(box(0.02, 0.02, 0.5, 2.6, 0.5, 0)); // pitot
    const carbonMesh = new THREE.Mesh(merge(carbonParts), carbon); carbonMesh.castShadow = true; body.add(carbonMesh);

    // ---- front wing: 4 elements with upward-curved tips (painted) + rear wing main plane, beam wing (painted)
    const fw = (chord, x, y, aoa, t, flapGapAtNose) => wing(-1.0, 1.0, (z) => { const a = Math.abs(z); const lift = 0.1 * a * a; const nose = flapGapAtNose && a < 0.22 ? 0.06 : 0; return { x, y: y + lift + nose, chord: chord * (1 - 0.15 * a), aoa: aoa * (1 - 0.3 * a), t: t }; }, 32);
    const wings = [fw(0.42, 3.15, 0.09, 0.08, 0.035, false), fw(0.3, 2.82, 0.17, 0.26, 0.03, true), fw(0.22, 2.6, 0.26, 0.42, 0.025, true), fw(0.16, 2.43, 0.33, 0.55, 0.02, true)];
    wings.push(wing(-0.5, 0.5, (z) => ({ x: -2.3, y: 0.72, chord: 0.4, aoa: 0.16, t: 0.04 }), 16));
    wings.push(wing(-0.5, 0.5, (z) => ({ x: -2.25, y: 0.4, chord: 0.2, aoa: 0.25, t: 0.025 }), 12)); wings.push(wing(-0.5, 0.5, (z) => ({ x: -2.4, y: 0.33, chord: 0.18, aoa: 0.2, t: 0.02 }), 12));
    for (const s of [1, -1]) wings.push(strut([-1.75, 0.55, s * 0.08], [-2.35, 0.8, s * 0.08], 0.05, 0.03)); // swan necks
    for (const s of [1, -1]) wings.push(plate([[-2.92, 0.5], [-2.3, 0.5], [-2.22, 0.78], [-2.35, 1.0], [-2.92, 1.02], [-2.98, 0.75]], 0.018, s * 0.51, true));
    const wingMesh = new THREE.Mesh(boxProjectUV(merge(wings)), paint); wingMesh.castShadow = true; body.add(wingMesh);
    // DRS flap: pivot at the trailing edge, up between the endplate tops; closed it sits steep above the main plane's trailing edge,
    // open the leading edge lifts ~55 degrees so a slot of daylight shows between the two elements (FLAP_CLOSED / FLAP_OPEN)
    const flapGeo = wing(-0.49, 0.49, (z) => ({ x: 0.26, y: 0.0, chord: 0.26, aoa: 0.0, t: 0.028 }), 12); flapGeo.translate(-2.87, 0.99, 0); boxProjectUV(flapGeo); flapGeo.translate(2.87, -0.99, 0);   // livery mapped where the flap sits, like the main plane
    const flap = new THREE.Mesh(flapGeo, paint); flap.position.set(-2.87, 0.99, 0); flap.rotation.z = FLAP_CLOSED; flap.castShadow = true; body.add(flap);

    // ---- halo
    const haloGeo = new THREE.TorusGeometry(0.46, 0.036, 10, 32, Math.PI); haloGeo.rotateZ(-Math.PI / 2); haloGeo.rotateX(Math.PI / 2);
    const halo = new THREE.Mesh(haloGeo, carbon); halo.position.set(0.42, 0.99, 0); halo.scale.set(1.35, 1, 1); body.add(halo);
    for (const s of [1, -1]) { const leg = new THREE.Mesh(strut([-0.05, 0.75, s * 0.44], [-0.2, 0.97, s * 0.44], 0.05, 0.05), carbon); body.add(leg); }

    // ---- wheels: tyre (lathe), wheel cover disc, inner drum, brake disc glow
    const prof = []; const R = WHEEL_R, rr = 0.07;
    const tyreGeo = (w) => { const pts = [new THREE.Vector2(0.24, -w), new THREE.Vector2(R - rr, -w), new THREE.Vector2(R - rr * 0.3, -w + rr * 0.3), new THREE.Vector2(R, -w + rr), new THREE.Vector2(R, w - rr), new THREE.Vector2(R - rr * 0.3, w - rr * 0.3), new THREE.Vector2(R - rr, w), new THREE.Vector2(0.24, w)]; const l = new THREE.LatheGeometry(pts, 28); l.rotateX(Math.PI / 2); return l; };
    const sidewall = sidewallTexture(car.tyre.color);
    const tyreMat = new THREE.MeshStandardMaterial({ map: sidewall, metalness: 0, roughness: 0.85 });
    const coverMat = new THREE.MeshStandardMaterial({ map: coverTex, metalness: 0.8, roughness: 0.3 });
    const wheels = [], frontPivots = [];
    [[FRONT_AXLE, 0.155, 0.8], [FRONT_AXLE, 0.155, -0.8], [REAR_AXLE, 0.2, 0.78], [REAR_AXLE, 0.2, -0.78]].forEach(([ax, hw, z], k) => {
      const pivot = new THREE.Group(); pivot.position.set(ax, R, z);
      const spin = new THREE.Group();
      const tyre = new THREE.Mesh(tyreGeo(hw), tyreMat); tyre.castShadow = true; spin.add(tyre);
      const cover = new THREE.Mesh(new THREE.CircleGeometry(0.245, 32), coverMat); cover.position.z = Math.sign(z) * (hw + 0.002); if (z < 0) cover.rotation.y = Math.PI; spin.add(cover);
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, hw * 2 - 0.02, 20), matte); drum.rotation.x = Math.PI / 2; spin.add(drum);
      const inner = new THREE.Mesh(new THREE.CircleGeometry(0.23, 24), metal); inner.position.z = -Math.sign(z) * (hw - 0.01); if (z > 0) inner.rotation.y = Math.PI; spin.add(inner);
      pivot.add(spin); g.add(pivot); wheels.push(spin); if (k < 2) frontPivots.push(pivot);
    });

    // ---- driver, cockpit, steering wheel, mirrors, cameras, lights
    const helmet = new THREE.Group();
    const helmetMat = new THREE.MeshStandardMaterial({ color: accent, metalness: 0.3, roughness: 0.2 });
    const hm = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14), helmetMat); hm.position.set(0.42, 0.74, 0); hm.scale.set(1.08, 1, 1); helmet.add(hm);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.152, 18, 10, -0.9, 1.8, 1.1, 0.8), glass); visor.position.copy(hm.position); helmet.add(visor);
    const hans = new THREE.Mesh(box(0.22, 0.08, 0.34, 0.3, 0.6, 0), carbon); helmet.add(hans);
    const shoulders = new THREE.Mesh(box(0.3, 0.14, 0.46, 0.32, 0.54, 0), new THREE.MeshStandardMaterial({ color: new THREE.Color(car.team.primary), roughness: 0.8 })); helmet.add(shoulders);
    for (const s of [1, -1]) { const arm = new THREE.Mesh(strut([0.4, 0.62, s * 0.2], [0.78, 0.7, s * 0.12], 0.07, 0.07), new THREE.MeshStandardMaterial({ color: new THREE.Color(car.team.primary), roughness: 0.8 })); helmet.add(arm); }
    body.add(helmet);
    // steering wheel with display
    const wheelGrp = new THREE.Group(); wheelGrp.position.set(0.86, 0.7, 0); wheelGrp.rotation.z = -0.35;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.022, 8, 20, Math.PI * 1.4), matte); rim.rotation.y = Math.PI / 2; rim.rotation.x = Math.PI * 0.3; wheelGrp.add(rim);
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), new THREE.MeshBasicMaterial({ map: wheelDisplay })); disp.rotation.y = -Math.PI / 2; disp.position.set(-0.01, 0.02, 0); wheelGrp.add(disp);
    const hub = new THREE.Mesh(box(0.04, 0.16, 0.24, 0.01, 0, 0), carbon); wheelGrp.add(hub); body.add(wheelGrp);
    // headrest / cockpit surround
    const headrest = new THREE.Mesh(loft([{ x: 0.78, w: 0.28, h: 0.06, y0: 0.72, n: 3 }, { x: 0.3, w: 0.36, h: 0.12, y0: 0.72, n: 3 }, { x: 0.05, w: 0.34, h: 0.14, y0: 0.72, n: 3 }], 0, 18), new THREE.MeshStandardMaterial({ color: 0x0b0c10, roughness: 0.95 })); body.add(headrest);
    // mirrors: housing + reflective face
    for (const s of [1, -1]) { const h = new THREE.Mesh(loft([{ x: 0.98, w: 0.04, h: 0.07, y0: 0.77, n: 2.6 }, { x: 0.86, w: 0.09, h: 0.1, y0: 0.755, n: 2.6 }], s * 0.67, 12), carbon); body.add(h); const m = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.06), new THREE.MeshStandardMaterial({ color: 0x8fa3b8, metalness: 1, roughness: 0.06 })); m.position.set(0.858, 0.805, s * 0.67); m.rotation.y = -Math.PI / 2; body.add(m); }
    // T-cam and rain light
    const tcam = new THREE.Mesh(box(0.22, 0.06, 0.1, 0.22, 1.1, 0), new THREE.MeshStandardMaterial({ color: car.driver && car.team.drivers[0] === car.driver ? 0x111111 : 0xffd200, roughness: 0.5 })); body.add(tcam);
    const rain = new THREE.Mesh(box(0.06, 0.12, 0.1, -2.6, 0.32, 0), new THREE.MeshStandardMaterial({ color: 0xff1a1a, emissive: 0xff1a1a, emissiveIntensity: 0.6 })); body.add(rain);
    // contact shadow
    const sc = document.createElement('canvas'); sc.width = 128; sc.height = 64; const sctx = sc.getContext('2d'); const grd = sctx.createRadialGradient(64, 32, 4, 64, 32, 60); grd.addColorStop(0, 'rgba(0,0,0,0.6)'); grd.addColorStop(0.6, 'rgba(0,0,0,0.3)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); sctx.fillStyle = grd; sctx.fillRect(0, 0, 128, 64);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 3.0), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 })); blob.rotation.x = -Math.PI / 2; blob.position.set(-0.1, 0.03, 0); g.add(blob);
    return { group: g, body, wheels, frontPivots, flap, helmet, bodyMat: paint, flapClosed: FLAP_CLOSED, flapOpen: FLAP_OPEN };
  }

  function sidewallTexture(color) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const ctx = c.getContext('2d');
    ctx.fillStyle = '#17171a'; ctx.fillRect(0, 0, 1024, 256); ctx.fillStyle = '#212124'; ctx.fillRect(0, 110, 1024, 36);
    const r = U.rng(3); for (let i = 0; i < 500; i++) { ctx.fillStyle = 'rgba(0,0,0,' + (0.2 + r() * 0.4) + ')'; ctx.fillRect(r() * 1024, 110 + r() * 36, 3 + r() * 8, 1); }
    for (const y of [72, 184]) { ctx.fillStyle = color; ctx.fillRect(0, y - 2, 1024, 5); }
    ctx.fillStyle = '#e6e6e6'; ctx.font = '900 22px Arial Black, Arial'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    for (let i = 0; i < 6; i++) { ctx.fillText('EIRELLI', 85 + i * 170, 40); ctx.save(); ctx.translate(85 + i * 170, 216); ctx.scale(-1, 1); ctx.fillText('EIRELLI', 0, 0); ctx.restore(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8; t.encoding = THREE.sRGBEncoding; return t;
  }
  EI.CarModel = { build, WHEEL_R };
})();
