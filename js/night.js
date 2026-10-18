// Equation I - night racing (Yas Marina): floodlit circuits after dark.
// Light sources register here while the scenery builds (EI.EnvYas, the track furniture); EI.Night.build() then bakes every
// floodlight into a world-space light map that all lit materials sample (one texture read per pixel instead of hundreds of
// real lights), builds the additive glow sprites for the lamp heads and LED points, and gives the scene a night sky.
//
// Contract for builders (call during Scenery.build, before EI.Night.build):
//   EI.Night.on                                  true when the current circuit races at night (set by main.js from the look)
//   EI.Night.addFlood(x, y, z, opts)             a floodlight bank: opts.power (1 = one ~30 m tower bank), opts.color [r, g, b]
//                                                (linear, default warm white), opts.aim [dx, dz] unit vector the bank faces (null =
//                                                all round), opts.spread (cone half-angle, rad, default 1.0), opts.range (m, 110)
//   EI.Night.addGlow(x, y, z, size, color, opts) an additive glow sprite (a lamp head, an LED point, a lit window cluster):
//                                                size in metres, color [r, g, b] 0..1 (sRGB-ish); opts.pulse (Hz) for a slow pulse
//   EI.Night.onFrame(fn)                         fn(dt, timeSeconds) called once per frame while racing (animated LED facades...)
//   material.userData.nightEmissive = true       keeps an unlit (MeshBasic) material at full brightness (screens, LEDs, signs)
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  const Night = { on: false, floods: [], glows: [], frameFns: [], built: false };
  Night.reset = function () { Night.floods = []; Night.glows = []; Night.frameFns = []; Night.built = false; };
  Night.addFlood = function (x, y, z, opts) { opts = opts || {}; Night.floods.push({ x, y, z, power: opts.power != null ? opts.power : 1, color: opts.color || [1.0, 0.94, 0.84], aim: opts.aim || null, spread: opts.spread || 1.0, range: opts.range || 110 }); };
  Night.addGlow = function (x, y, z, size, color, opts) { Night.glows.push({ x, y, z, size, color: color || [1, 0.95, 0.85], pulse: (opts && opts.pulse) || 0 }); };
  Night.onFrame = function (fn) { Night.frameFns.push(fn); };

  // shared uniforms (one object, referenced by every patched material). The light map is read with a soft roll-off
  // (e / (1 + 0.32 e)): overlapping pools such as the pit straight's compress, a single pool barely changes
  const UNI = {
    uNMap: { value: null }, uNDir: { value: null }, uNBox: { value: new THREE.Vector4(0, 0, 1, 1) }, uNTop: { value: 60 },
    uNBasic: { value: new THREE.Vector3(0.16, 0.18, 0.24) }, uNTime: { value: 0 },
  };
  Night.uniforms = UNI;

  // ---------------------------------------------------------------- sky: deep navy overhead, a dusky band low in the west where the
  // sun went down, the city's warm sodium glow along the horizon, stars
  const SKY_V = 'varying vec3 vDir; void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vDir = wp.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * wp; gl_Position.z = gl_Position.w; }';
  const SKY_F = [
    'varying vec3 vDir; uniform vec3 uWest;',
    'float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }',
    'void main() {',
    '  vec3 d = normalize(vDir); float h = d.y;',
    '  vec3 zen = vec3(0.006, 0.008, 0.018), mid = vec3(0.016, 0.020, 0.040), hor = vec3(0.075, 0.062, 0.080);',
    '  vec3 c = mix(hor, mid, smoothstep(0.0, 0.18, h)); c = mix(c, zen, smoothstep(0.15, 0.7, h));',
    '  float w = max(dot(normalize(vec3(d.x, 0.0, d.z)), uWest), 0.0);',
    '  c += vec3(0.16, 0.06, 0.04) * pow(w, 3.0) * exp(-max(h, 0.0) * 16.0);',          // the last of the dusk in the west
    '  c += vec3(0.20, 0.11, 0.05) * exp(-abs(h) * 22.0) * 0.7;',                        // the city glow on the horizon
    '  if (h < 0.0) c = mix(c, vec3(0.05, 0.05, 0.07), smoothstep(0.0, -0.08, h));',
    '  vec3 q = floor(d * 420.0); float s = hash(q); float st = step(0.9992, s) * smoothstep(0.08, 0.4, h) * (0.4 + 0.6 * hash(q + 7.0));',
    '  c += vec3(0.85, 0.9, 1.0) * st * 0.4;',
    '  gl_FragColor = vec4(c, 1.0);',
    '#include <tonemapping_fragment>',
    '#include <encodings_fragment>',
    '}'].join('\n');
  Night.makeSky = function (westDir) {
    const mat = new THREE.ShaderMaterial({ uniforms: { uWest: { value: (westDir || new THREE.Vector3(-1, 0, 0.3)).clone().normalize() } }, vertexShader: SKY_V, fragmentShader: SKY_F, side: THREE.BackSide, depthWrite: false, fog: false });
    mat.userData.nightEmissive = true;
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat); m.name = 'nightSky'; m.frustumCulled = false; m.renderOrder = -10; return m;
  };
  // environment for reflections: the night sky plus rings of bright floodlight heads all round the horizon (cars, glass and the
  // water pick up streaks of light instead of a black mirror)
  Night.makeEnv = function (renderer, westDir) {
    const s = new THREE.Scene(); const sky = Night.makeSky(westDir); sky.scale.setScalar(900); s.add(sky);
    const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 8.6, 7.6) }), warm = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.2, 1.6) });
    const g = new THREE.BoxGeometry(14, 6, 2);
    for (let k = 0; k < 44; k++) { const a = k / 44 * Math.PI * 2 + (k % 3) * 0.05; const r = 300 + (k % 5) * 40; const m = new THREE.Mesh(g, k % 4 === 3 ? warm : lamp); m.position.set(Math.cos(a) * r, 40 + (k % 4) * 18, Math.sin(a) * r); m.lookAt(0, 0, 0); s.add(m); }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.05, 0.06) })); ground.rotation.x = -Math.PI / 2; ground.position.y = -20; s.add(ground);
    const pm = new THREE.PMREMGenerator(renderer); const tex = pm.fromScene(s, 0.03).texture; pm.dispose(); return tex;
  };

  // ---------------------------------------------------------------- floodlights along any circuit with none registered: towers
  // every ~65 m on alternate sides just beyond the barriers, banks aimed at the track
  function autoFloods(t) {
    for (let s = 0; s < t.length; s += 65) {
      const side = (Math.floor(s / 65) & 1) ? 1 : -1; const i = t.idxAtS(s); const w = (side < 0 ? t.wallL[i] : t.wallR[i]) + 9;
      const x = t.x[i] + t.nx[i] * side * w, z = t.z[i] + t.nz[i] * side * w; Night.addFlood(x, t.y[i] + 32, z, { aim: [-t.nx[i] * side, -t.nz[i] * side] }); Night.addGlow(x, t.y[i] + 32, z, 7, [1, 0.96, 0.88]);
    }
  }

  // ---------------------------------------------------------------- the light map: irradiance (rgb, sqrt-encoded) and the mean
  // horizontal direction towards the lights (rg) with how one-sided it is (b), over the whole venue
  const MAPN = 1024, EMAX = 9, K = 2400;
  function bake(t, ground) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < t.n; i++) { x0 = Math.min(x0, t.x[i]); x1 = Math.max(x1, t.x[i]); z0 = Math.min(z0, t.z[i]); z1 = Math.max(z1, t.z[i]); }
    for (const f of Night.floods) { x0 = Math.min(x0, f.x - 60); x1 = Math.max(x1, f.x + 60); z0 = Math.min(z0, f.z - 60); z1 = Math.max(z1, f.z + 60); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, half = Math.min(2600, Math.max(x1 - x0, z1 - z0) / 2 + 250);
    const N = MAPN, px = 2 * half / N, ox = cx - half, oz = cz - half;
    const R = new Float32Array(N * N), G = new Float32Array(N * N), B = new Float32Array(N * N), DX = new Float32Array(N * N), DZ = new Float32Array(N * N);
    let top = 0;
    for (const f of Night.floods) {
      const gy = ground ? ground(f.x, f.z) : 0; const h = Math.max(4, f.y - gy); top = Math.max(top, f.y);
      const rng = f.range, cs = Math.cos(f.spread); const P = f.power * K;
      const i0 = Math.max(0, Math.floor((f.x - rng - ox) / px)), i1 = Math.min(N - 1, Math.ceil((f.x + rng - ox) / px));
      const j0 = Math.max(0, Math.floor((f.z - rng - oz) / px)), j1 = Math.min(N - 1, Math.ceil((f.z + rng - oz) / px));
      for (let j = j0; j <= j1; j++) { const pz = oz + (j + 0.5) * px; const dz = pz - f.z;
        for (let i = i0; i <= i1; i++) {
          const pxw = ox + (i + 0.5) * px; const dx = pxw - f.x; const dh = Math.sqrt(dx * dx + dz * dz); if (dh > rng) continue;
          const d2 = dh * dh + h * h; const cosI = h / Math.sqrt(d2);
          let fa = 1; if (f.aim && dh > 1) { const ca = (dx * f.aim[0] + dz * f.aim[1]) / dh; fa = 0.18 + 0.82 * U.smoothstep(cs - 0.9, Math.min(0.95, cs + 0.35), ca) * (0.55 + 0.45 * U.smoothstep(0, h * 0.6, dh)); }
          const E = P * cosI / d2 * fa * (1 - U.smoothstep(rng * 0.65, rng, dh)); if (E < 1e-4) continue;
          const k = j * N + i; R[k] += E * f.color[0]; G[k] += E * f.color[1]; B[k] += E * f.color[2];
          if (dh > 0.5) { DX[k] -= dx / dh * E; DZ[k] -= dz / dh * E; }
        }
      }
    }
    const a = new Uint8Array(N * N * 4), b = new Uint8Array(N * N * 4);
    for (let k = 0; k < N * N; k++) {
      a[k * 4] = Math.round(Math.sqrt(Math.min(1, R[k] / EMAX)) * 255); a[k * 4 + 1] = Math.round(Math.sqrt(Math.min(1, G[k] / EMAX)) * 255); a[k * 4 + 2] = Math.round(Math.sqrt(Math.min(1, B[k] / EMAX)) * 255); a[k * 4 + 3] = 255;
      const e = R[k] + G[k] + B[k] + 1e-6, l = Math.hypot(DX[k], DZ[k]); const m = U.clamp(l / (e / 3), 0, 1);
      b[k * 4] = Math.round((DX[k] / (l || 1) * 0.5 + 0.5) * 255); b[k * 4 + 1] = Math.round((DZ[k] / (l || 1) * 0.5 + 0.5) * 255); b[k * 4 + 2] = Math.round(m * 255); b[k * 4 + 3] = 255;
    }
    const mk = (arr) => { const tx = new THREE.DataTexture(arr, N, N, THREE.RGBAFormat); tx.magFilter = THREE.LinearFilter; tx.minFilter = THREE.LinearFilter; tx.generateMipmaps = false; tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping; tx.needsUpdate = true; return tx; };
    UNI.uNMap.value = mk(a); UNI.uNDir.value = mk(b); UNI.uNBox.value.set(ox, oz, 1 / (2 * half), EMAX); UNI.uNTop.value = top + 6;
    Night.stats = { floods: Night.floods.length, half: Math.round(half), px: +px.toFixed(2) };
  }

  // ---------------------------------------------------------------- material patch: the light map as one more light, through the
  // material's own lighting model (diffuse + specular for standard / physical / phong; a plain scale for unlit materials)
  const VERT = 'vec4 nwp = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nnwp = instanceMatrix * nwp;\n#endif\nvNW = (modelMatrix * nwp).xyz;\n';
  const FDECL = 'varying vec3 vNW; uniform sampler2D uNMap; uniform sampler2D uNDir; uniform vec4 uNBox; uniform float uNTop; uniform vec3 uNBasic;\n' +
    'vec3 nightE(out vec3 Lw) { vec2 uv = (vNW.xz - uNBox.xy) * uNBox.z; Lw = vec3(0.0, 1.0, 0.0); if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return vec3(0.0);\n' +
    '  vec3 e = texture2D(uNMap, uv).rgb; e = e * e * uNBox.w; e = e / (1.0 + e * 0.32); vec3 dd = texture2D(uNDir, uv).rgb; vec2 dh = (dd.xy * 2.0 - 1.0) * dd.z;\n' +
    '  Lw = normalize(vec3(dh.x * 0.9, 1.0, dh.y * 0.9)); return e * (1.0 - smoothstep(uNTop, uNTop + 50.0, vNW.y)); }\n';
  const LIT = '{ vec3 nLw; vec3 nE = nightE(nLw); IncidentLight nl; nl.color = nE; nl.direction = normalize((viewMatrix * vec4(nLw, 0.0)).xyz); nl.visible = true; RE_Direct(nl, geometry, material, reflectedLight); }\n';
  const patched = new WeakSet();
  function patchMaterial(m) {
    if (!m || patched.has(m)) return; patched.add(m);
    const lit = m.isMeshStandardMaterial || m.isMeshPhongMaterial, basic = m.isMeshBasicMaterial && !(m.userData && m.userData.nightEmissive) && m.blending === THREE.NormalBlending;
    if (!lit && !basic) return;
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
    m.onBeforeCompile = function (sh, r) {
      if (prev) prev.call(this, sh, r);
      if (sh.vertexShader.indexOf('#include <project_vertex>') < 0) return;
      const fragOk = lit ? sh.fragmentShader.indexOf('#include <lights_fragment_begin>') >= 0 : sh.fragmentShader.indexOf('#include <envmap_fragment>') >= 0;
      if (!fragOk) return;
      Object.assign(sh.uniforms, UNI);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vNW;').replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FDECL);
      if (lit) sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', '#include <lights_fragment_begin>\n' + LIT);
      else sh.fragmentShader = sh.fragmentShader.replace('#include <envmap_fragment>', '{ vec3 nLw; vec3 nE = nightE(nLw); outgoingLight *= uNBasic + nE * 0.55; }\n#include <envmap_fragment>');
    };
    const pk = prev ? prev.toString() : '';
    m.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + pk.length + pk.slice(0, 80) + '|night'; };
    m.needsUpdate = true;
  }
  Night.patchScene = function (root) {
    root.traverse(o => { if (!o.material || o.name === 'nightSky' || o.name === 'nightGlows') return; if (Array.isArray(o.material)) o.material.forEach(patchMaterial); else patchMaterial(o.material); });
  };

  // ---------------------------------------------------------------- glow sprites: one Points cloud, additive, sized in metres
  const GV = ['attribute float gsize; attribute vec3 gcol; attribute float gpulse; uniform float uScale; uniform float uNTime; varying vec3 vC; varying float vF;',
    'void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z; float p = gpulse > 0.0 ? 0.75 + 0.25 * sin(uNTime * gpulse * 6.2832 + position.x * 0.37) : 1.0;',
    '  gl_PointSize = clamp(gsize * uScale / max(d, 1.0), 1.5, 220.0); vC = gcol * p * clamp(gsize * uScale / max(d, 1.0) / 2.0, 0.35, 1.0); vF = 1.0 - smoothstep(1600.0, 3200.0, d);',
    '  gl_Position = projectionMatrix * mv; }'].join('\n');
  const GF = ['varying vec3 vC; varying float vF;',
    'void main() { vec2 q = gl_PointCoord * 2.0 - 1.0; float r2 = dot(q, q); if (r2 > 1.0) discard; float a = exp(-r2 * 5.0) + 0.55 * exp(-r2 * 40.0); gl_FragColor = vec4(vC * a * vF, 1.0); }'].join('\n');
  let glowMat = null;
  function buildGlows(scene) {
    const n = Night.glows.length; if (!n) return;
    const pos = new Float32Array(n * 3), sz = new Float32Array(n), col = new Float32Array(n * 3), pu = new Float32Array(n);
    Night.glows.forEach((g, k) => { pos[k * 3] = g.x; pos[k * 3 + 1] = g.y; pos[k * 3 + 2] = g.z; sz[k] = g.size; col[k * 3] = g.color[0]; col[k * 3 + 1] = g.color[1]; col[k * 3 + 2] = g.color[2]; pu[k] = g.pulse; });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('gsize', new THREE.BufferAttribute(sz, 1)); geo.setAttribute('gcol', new THREE.BufferAttribute(col, 3)); geo.setAttribute('gpulse', new THREE.BufferAttribute(pu, 1)); geo.computeBoundingSphere();
    glowMat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 600 }, uNTime: UNI.uNTime }, vertexShader: GV, fragmentShader: GF, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    glowMat.userData.nightEmissive = true;
    const pts = new THREE.Points(geo, glowMat); pts.name = 'nightGlows'; pts.frustumCulled = false; pts.renderOrder = 5; scene.add(pts);
    // sprites are sized in pixels: the scale follows whatever viewport / render target this view is drawn into
    const vp = new THREE.Vector4(); pts.onBeforeRender = (r, s, cam) => { r.getCurrentViewport(vp); glowMat.uniforms.uScale.value = vp.w / 2 / Math.tan((cam.fov || 60) * Math.PI / 360); };
  }
  Night.frame = function (dt, t) { UNI.uNTime.value = t; for (const fn of Night.frameFns) fn(dt, t); };

  // ---------------------------------------------------------------- after the scenery and the track are built
  Night.build = function (scene, track, scenery) {
    if (!Night.on || Night.built) return; Night.built = true;
    if (Night.floods.length < 20) autoFloods(track);
    const ground = scenery && scenery.height ? (x, z) => scenery.height(x, z) : null;
    bake(track, ground); buildGlows(scene);
    if (scenery) { if (scenery.clouds) scenery.clouds.visible = false; if (scenery.clouds2) scenery.clouds2.visible = false; }   // a clear desert night
    Night.patchScene(scene);
  };
  EI.Night = Night;
})();
