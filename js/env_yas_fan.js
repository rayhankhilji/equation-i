// Equation I - the Yas Marina fan zone: the after-race concert stage (truss towers and roof, an animated LED wall and side screens,
// moving-head light beams sweeping the night sky), a packed, jumping crowd in front of it, and a row of fan zone stalls with lit
// signage. Placed on open, clear ground near the North Grandstand / the hairpin. Four draw calls: the static parts go into the
// landmarks' shared batch, plus the screens, the beams and the crowd.
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  const C = (h) => new THREE.Color(h).convertSRGBToLinear();
  const Fan = {};
  const isNight = () => !!(EI.Night && EI.Night.on);
  const xf = (m, x, y, z) => EI.Env.xf(m, x, y, z);

  // ---------------------------------------------------------------- the site: a clear 140 x 100 m rectangle, as close as possible
  // to the hairpin (the North Grandstand) without touching the track, buildings, roads, water or car parks
  function findSite(E) {
    const t = E.t, OCC = EI.Env.OCC; let hp = null;
    for (const c of t.data.corners) if (/Hairpin/.test(c.name)) hp = t.idxAtS(c.s + 40);
    if (hp == null) hp = t.idxAtS(t.length * 0.25);
    const ox = t.x[hp], oz = t.z[hp]; const mask = OCC.BUILT | OCC.ROAD | OCC.WATER | OCC.PARK; let best = null;
    for (let r = 120; r <= 900; r += 30) for (let a = 0; a < 24; a++) {
      const ang = a / 24 * Math.PI * 2; const cx = ox + Math.cos(ang) * r, cz = oz + Math.sin(ang) * r;
      if (E.isSea && E.isSea(cx, cz)) continue; if (E.fAt(cx, cz) < 70) continue;
      for (const yaw of [0, Math.PI / 4, Math.PI / 2, -Math.PI / 4]) {
        const ax = Math.cos(yaw), az = Math.sin(yaw);
        if (E.rectFree(cx, cz, ax, az, 70, 50, mask, 45) < 0.97) continue;
        let wet = false; for (const [u, v] of [[-70, -50], [70, -50], [70, 50], [-70, 50], [0, 0]]) { const x = cx + ax * u - az * v, z = cz + az * u + ax * v; if (E.isSea && E.isSea(x, z)) wet = true; } if (wet) continue;
        const sc = r; if (!best || sc < best.sc) best = { cx, cz, ax, az, sc };
      }
      if (best && r > best.sc + 60) break;
    }
    return best;
  }

  // ---------------------------------------------------------------- LED wall shader: equaliser bars, sweeping colour washes and
  // radial pulses, cycling every few seconds
  const LED_V = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const LED_F = [
    'uniform float uT; varying vec2 vUv;',
    'vec3 pal(float t) { return 0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + t)); }',
    'void main() {',
    '  vec2 g = vec2(vUv.x * 96.0, vUv.y * 40.0); vec2 c = fract(g) - 0.5; float px = smoothstep(0.5, 0.32, max(abs(c.x), abs(c.y)));',
    '  vec2 q = (floor(g) + 0.5) / vec2(96.0, 40.0); float mode = mod(floor(uT / 6.0), 3.0); vec3 col;',
    '  if (mode < 0.5) { float bar = floor(q.x * 24.0); float h = 0.25 + 0.7 * abs(sin(uT * (2.0 + mod(bar, 5.0)) + bar * 1.7)); col = pal(q.x * 0.6 + uT * 0.05) * step(q.y, h) * (0.6 + 0.4 * q.y); }',
    '  else if (mode < 1.5) { float r = length((q - 0.5) * vec2(2.4, 1.0)); col = pal(r * 1.5 - uT * 0.4) * (0.55 + 0.45 * sin(r * 26.0 - uT * 9.0)); }',
    '  else { float w = sin(q.x * 9.0 + uT * 2.2) * 0.25 + sin(q.y * 7.0 - uT * 1.6) * 0.25 + 0.5; col = mix(vec3(0.9, 0.1, 0.8), vec3(0.1, 0.55, 1.0), w) * (0.7 + 0.3 * sin(uT * 8.0)); }',
    '  gl_FragColor = vec4(col * px * 1.7 + 0.015, 1.0);',
    '}'].join('\n');
  // beam cones: additive, fading along their length and towards the cone's rim
  const BEAM_V = ['varying float vL; varying vec3 vC; varying float vR;',
    'void main() { vL = position.z; vR = length(position.xy) / max(position.z * 0.075, 0.001); vec3 c = vec3(1.0);',
    '#ifdef USE_INSTANCING_COLOR', 'c = instanceColor;', '#endif', 'vC = c;',
    '  vec4 p = vec4(position, 1.0);', '#ifdef USE_INSTANCING', 'p = instanceMatrix * p;', '#endif',
    '  gl_Position = projectionMatrix * modelViewMatrix * p; }'].join('\n');
  const BEAM_F = 'varying float vL; varying vec3 vC; varying float vR; void main() { float a = pow(1.0 - clamp(vL, 0.0, 1.0), 1.6) * 0.3; gl_FragColor = vec4(vC * a, 1.0); }';

  Fan.build = function (E, H, out) {
    const site = findSite(E); if (!site) { out.fan = 'no site'; return; }
    const night = isNight(); const SK = EI.StreetKit; const B = new SK.Batch(); const sc = E.sc;
    const { cx, cz, ax, az } = site; const y = E.ground(cx, cz) + 0.03; const m = EI.Env.frame(cx, y, cz, ax, az, -az, ax);
    E.markRect && E.markRect(cx, cz, ax, az, 72, 52, EI.Env.OCC.BUILT);
    const black = C(0x15171b), truss = C(0xb9bec4), floorC = C(0x3d3f44), white = C(0xf2f2ef);
    // the arena floor (local x along the site, z across; the stage at x = +60 facing -x)
    B.set('white', 0.9, 0); B.quad(xf(m, -70, 0.02, -50), xf(m, -70, 0.02, 50), xf(m, 70, 0.02, 50), xf(m, 70, 0.02, -50), floorC);
    // stage deck, back wall, wings
    const SX = 58; B.set('white', 0.6, 0.05); B.box(m, 16, 1.8, 36, SX, 0, 0, black, { top: C(0x23252a) });
    B.box(m, 1.2, 15, 36, SX + 7.5, 0, 0, black);
    // truss towers (square lattice) and the roof grid
    const tw = [[SX - 7.5, -17.5], [SX - 7.5, 17.5], [SX + 7.5, -17.5], [SX + 7.5, 17.5]]; const TH = 16;
    for (const [tx, tz] of tw) {
      for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) B.beam(m, [tx + dx, 0, tz + dz], [tx + dx, TH, tz + dz], 0.08, truss);
      for (let h = 0; h < TH; h += 1.2) { B.beam(m, [tx - 0.5, h, tz - 0.5], [tx + 0.5, h + 1.2, tz - 0.5], 0.04, truss); B.beam(m, [tx - 0.5, h, tz + 0.5], [tx + 0.5, h + 1.2, tz + 0.5], 0.04, truss); }
    }
    for (const [a, b] of [[tw[0], tw[1]], [tw[2], tw[3]], [tw[0], tw[2]], [tw[1], tw[3]]]) for (const dy of [0, 1]) for (const dz of [-0.5, 0.5]) B.beam(m, [a[0] + (a[0] === b[0] ? dz : 0), TH + dy, a[1] + (a[1] === b[1] ? dz : 0)], [b[0] + (a[0] === b[0] ? dz : 0), TH + dy, b[1] + (a[1] === b[1] ? dz : 0)], 0.08, truss);
    B.set('white', 0.8, 0); B.box(m, 17, 0.5, 38, SX, TH + 1.1, 0, black);
    // speaker hangs and the front-of-house tower
    for (const sz of [-15, 15]) B.box(m, 2.2, 6.5, 2.2, SX - 8.5, 6.5, sz, black);
    B.box(m, 6, 4.5, 6, -10, 0, 0, black, { top: C(0x2a2d33) }); B.box(m, 6.6, 0.4, 6.6, -10, 4.5, 0, white);
    // crowd barrier in front of the stage
    B.set('white', 0.5, 0.3); for (let z = -18; z < 18; z += 2) B.box(m, 0.3, 1.2, 2.0, SX - 10, 0, z + 1, C(0xa9adb2));
    // fan zone stalls along the far side: counters with lit signage and white awnings
    const signs = [0xc8102e, 0x1d4f8f, 0x7b2cbf, 0xff8a1f, 0x0fa3b1, 0xe8c21c, 0x2fb34a, 0xd6336c];
    for (let k = 0; k < 8; k++) {
      const x = -60 + k * 13, z = -44; B.set('white', 0.7, 0); B.box(m, 8, 3.2, 5, x, 0, z, white);
      B.set('white', 0.5, 0, night ? 1.4 : 0.2); B.box(m, 8.1, 0.9, 0.2, x, 3.3, z + 2.6, C(signs[k]));
      B.set('white', 0.6, 0, night ? 0.6 : 0); B.box(m, 7.4, 1.0, 0.1, x, 1.0, z + 2.55, C(0xffe3b8));
      B.set('white', 0.6, 0); B.quad(xf(m, x - 4.2, 4.4, z + 2.4), xf(m, x + 4.2, 4.4, z + 2.4), xf(m, x + 4.2, 3.4, z + 4.6), xf(m, x - 4.2, 3.4, z + 4.6), white);
      if (night) EI.Night.addGlow(...xf(m, x, 3.0, z + 3.4), 3.0, [1.0, 0.85, 0.6]);
    }
    H.W.add(B, 'main');
    // ---- LED wall and side screens (one mesh, one animated material)
    const geos = [];
    const scr = (x, yb, z0, z1, h) => { const g = new THREE.PlaneGeometry(z1 - z0, h); g.rotateY(-Math.PI / 2); g.translate(x, yb + h / 2, (z0 + z1) / 2); return g; };
    geos.push(scr(SX + 6.8, 2.6, -14, 14, 11.8), scr(SX - 8.2, 7, -27, -19, 5.4), scr(SX - 8.2, 7, 19, 27, 5.4));
    const sg = EI.Env.merge(geos); sg.applyMatrix4(m);
    const uni = { uT: { value: 0 } };
    const smat = new THREE.ShaderMaterial({ uniforms: uni, vertexShader: LED_V, fragmentShader: LED_F, side: THREE.DoubleSide }); smat.userData.nightEmissive = true;
    const sm = new THREE.Mesh(sg, smat); sm.name = 'yasFanScreens'; sc.group.add(sm);
    // side screen supports
    // ---- moving-head beams from the roof truss
    const NB = 12; const cone = new THREE.CylinderGeometry(0.0, 0.075, 1, 10, 1, true);   // apex at the lamp after the turn below cone.rotateX(-Math.PI / 2); cone.translate(0, 0, 0.5);
    const bmat = new THREE.ShaderMaterial({ vertexShader: BEAM_V, fragmentShader: BEAM_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    bmat.userData.nightEmissive = true;
    const beams = new THREE.InstancedMesh(cone, bmat, NB); beams.name = 'yasFanBeams'; beams.frustumCulled = false;
    const bcols = [0xff2bd6, 0x2bd9ff, 0xffffff, 0x8a5cff, 0x2bff8a, 0xffd02b];
    const heads = []; for (let k = 0; k < NB; k++) { const z = -16 + k * 32 / (NB - 1); const p = xf(m, SX - 7, TH - 0.3, z); heads.push(p); beams.setColorAt(k, new THREE.Color(bcols[k % bcols.length]).multiplyScalar(1.0)); }
    beams.instanceColor.needsUpdate = true; beams.visible = night;
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Sv = new THREE.Vector3(), Pv = new THREE.Vector3(), D = new THREE.Vector3(), Zv = new THREE.Vector3(0, 0, 1);
    const fwd = [-ax, -az];   // the stage faces local -x
    const setBeams = (t) => {
      for (let k = 0; k < NB; k++) {
        const ph = k * 0.7; const pan = Math.sin(t * 0.6 + ph) * 0.9 + (k % 2 ? 0.3 : -0.3), tilt = 0.55 + 0.35 * Math.sin(t * 0.43 + ph * 1.3);
        const hx = fwd[0] * Math.cos(pan) - fwd[1] * Math.sin(pan), hz = fwd[1] * Math.cos(pan) + fwd[0] * Math.sin(pan);
        D.set(hx * Math.cos(tilt), Math.sin(tilt), hz * Math.cos(tilt)).normalize(); Q.setFromUnitVectors(Zv, D);
        const L = 90; M.compose(Pv.set(heads[k][0], heads[k][1], heads[k][2]), Q, Sv.set(L, L, L)); beams.setMatrixAt(k, M);
      }
      beams.instanceMatrix.needsUpdate = true;
    };
    setBeams(0); sc.group.add(beams);
    // ---- the crowd: a packed, jumping audience between the stage and the front-of-house tower
    const person = (() => {
      const parts = []; const add = (w, h, d, x, y, z, c) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); const cc = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < cc.length; i += 3) { cc[i] = c[0]; cc[i + 1] = c[1]; cc[i + 2] = c[2]; } g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); parts.push(g); };
      add(0.34, 0.86, 0.22, 0, 0, 0, [0.22, 0.22, 0.25]); add(0.44, 0.62, 0.26, 0, 0.86, 0, [1, 1, 1]); add(0.2, 0.22, 0.2, 0, 1.5, 0, [0.95, 0.8, 0.68]);
      add(0.09, 0.55, 0.09, -0.25, 1.35, 0, [1, 1, 1]); add(0.09, 0.55, 0.09, 0.25, 1.35, 0, [1, 1, 1]);
      return EI.Env.merge(parts);
    })();
    const cmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
    const NU = EI.Night && EI.Night.uniforms ? EI.Night.uniforms.uNTime : { value: 0 };
    cmat.onBeforeCompile = (sh) => { sh.uniforms.uNTime = NU; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uNTime;').replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\nfloat ph = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);\ntransformed.y += max(0.0, sin(uNTime * (5.0 + ph * 2.0) + ph * 6.2832)) * 0.32 * step(0.25, ph);\nif (position.y > 1.3 && abs(position.x) > 0.2) transformed.y += 0.15 * sin(uNTime * 7.0 + ph * 9.0);\n#endif'); };
    cmat.customProgramCacheKey = () => 'yas-fan-crowd';
    const rng = U.rng(9090); const spots = [];
    for (let x = -4; x < SX - 11; x += 1.05) for (let z = -30; z <= 30; z += 1.0) { const dens = 0.92 - Math.max(0, (SX - 11 - x) / (SX + 4)) * 0.45 - Math.max(0, Math.abs(z) - 20) / 20; if (rng() > dens) continue; if (Math.abs(x + 10) < 4.2 && Math.abs(z) < 4.2) continue; spots.push([x + (rng() - 0.5) * 0.6, z + (rng() - 0.5) * 0.6]); }
    const crowd = new THREE.InstancedMesh(person, cmat, spots.length); crowd.name = 'yasFanCrowd';
    const shirts = [0xffffff, 0x1a1a1a, 0xc8102e, 0x1d4f8f, 0xff8a1f, 0x2fb34a, 0xe8c21c, 0x7b2cbf, 0xd6d6d0, 0x3a3f4a].map(h => new THREE.Color(h));
    const yawF = Math.atan2(ax, az); spots.forEach((p, k) => {
      const w = xf(m, p[0], 0, p[1]); M.compose(Pv.set(w[0], y, w[2]), Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawF + Math.PI / 2 + (rng() - 0.5) * 0.6), Sv.set(1, 0.92 + rng() * 0.16, 1)); crowd.setMatrixAt(k, M);
      crowd.setColorAt(k, shirts[Math.floor(rng() * shirts.length)]);
    });
    crowd.instanceMatrix.needsUpdate = true; crowd.instanceColor.needsUpdate = true; crowd.castShadow = false; crowd.receiveShadow = false;
    crowd.geometry = crowd.geometry.clone(); crowd.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, y + 1, cz), 80);
    sc.group.add(crowd);
    // ---- lights: stage wash floods (coloured), truss lamps, house lights over the crowd
    if (night) {
      const N = EI.Night;
      for (let k = 0; k < 6; k++) { const z = -15 + k * 6; const p = xf(m, SX - 8, TH, z); N.addFlood(p[0], p[1], p[2], { power: 0.35, aim: fwd, spread: 1.0, range: 70, color: k % 2 ? [0.9, 0.3, 1.0] : [0.35, 0.8, 1.0] }); N.addGlow(p[0], p[1] - 0.3, p[2], 2.6, k % 2 ? [1, 0.4, 1] : [0.4, 0.85, 1], { pulse: 0.8 + k * 0.1 }); }
      for (const [x, z] of [[20, -20], [20, 20], [-25, 0]]) { const p = xf(m, x, 18, z); N.addFlood(p[0], p[1], p[2], { power: 0.25, range: 50 }); }
      N.onFrame((dt, t) => { uni.uT.value = t; setBeams(t); });
    } else uni.uT.value = 3.0;
    out.fan = { site: [Math.round(cx), Math.round(cz)], crowd: spots.length };
  };
  EI.EnvYasFan = Fan;
})();
