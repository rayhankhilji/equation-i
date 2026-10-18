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
//   EI.Night.addColorSpill(x, y, z, r, colorFn)  a coloured light volume (an LED facade washing its surroundings): radius r (m),
//                                                colorFn(t) -> [r, g, b] linear (evaluated per frame); up to 4 (the W hotel's
//                                                gridshell gets three automatically when none are registered)
//   material.userData.nightEmissive = true       keeps an unlit (MeshBasic) material at full brightness (screens, LEDs, signs)
//   material.userData.nightGloss = k             (0..1) racing surfaces: smoother at night so the floods streak across them
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  const Night = { on: false, floods: [], glows: [], frameFns: [], built: false };
  Night.reset = function () { Night.floods = []; Night.glows = []; Night.frameFns = []; Night.spills = []; Night.built = false; };
  Night.addFlood = function (x, y, z, opts) { opts = opts || {}; Night.floods.push({ x, y, z, power: opts.power != null ? opts.power : 1, color: opts.color || [1.0, 0.94, 0.84], aim: opts.aim || null, spread: opts.spread || 1.0, range: opts.range || 110 }); };
  Night.addGlow = function (x, y, z, size, color, opts) { Night.glows.push({ x, y, z, size, color: color || [1, 0.95, 0.85], pulse: (opts && opts.pulse) || 0 }); };
  Night.onFrame = function (fn) { Night.frameFns.push(fn); };
  Night.spills = [];
  Night.addColorSpill = function (x, y, z, r, colorFn) { Night.spills.push({ x, y, z, r, fn: colorFn }); };

  // shared uniforms (one object, referenced by every patched material). The light map is read with a soft roll-off
  // (e / (1 + 0.14 e)): overlapping pools such as the pit straight's compress, a single pool barely changes
  const UNI = {
    uNMap: { value: null }, uNDir: { value: null }, uNBox: { value: new THREE.Vector4(0, 0, 1, 1) }, uNTop: { value: 60 },
    uNBasic: { value: new THREE.Vector3(0.16, 0.18, 0.24) }, uNTime: { value: 0 },
    // coloured light volumes (xyz centre, w radius) and their current colours; the floodlit air (haze colour, strength)
    uNSp: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, -1e5, 0, 1)) }, uNSpC: { value: [0, 1, 2, 3].map(() => new THREE.Vector3()) },
    uNAir: { value: new THREE.Vector4(1.0, 0.86, 0.66, 0.05) },
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
    // near-black navy overhead easing to a hazy blue-grey low down: the floodlit air over the venue lifts the whole lower sky
    '  vec3 zen = vec3(0.0075, 0.0115, 0.031), mid = vec3(0.016, 0.023, 0.05), hor = vec3(0.062, 0.06, 0.068);',
    '  vec3 c = mix(hor, mid, smoothstep(0.0, 0.25, h)); c = mix(c, zen, smoothstep(0.2, 0.9, h));',
    // the light-pollution dome: warm sodium haze all round the horizon (Yas Island, the motorways), strongest over Abu Dhabi
    '  float w = max(dot(normalize(vec3(d.x, 0.0, d.z)), uWest), 0.0); float hp = max(h, 0.0);',
    '  float dome = exp(-hp * 14.0) * (0.4 + 0.6 * pow(w, 1.6)) + 0.25 * pow(w, 3.0) * exp(-hp * 6.0);',
    '  c += vec3(0.105, 0.072, 0.040) * dome;',
    // the venue glow: light scattered up from ~100 floodlight towers by the humid Gulf air - a pale blue-grey veil, highest
    // round the horizon, so roofs, poles and stands read as silhouettes against it instead of a black void
    '  c += vec3(0.034, 0.038, 0.048) * exp(-hp * 3.2) + vec3(0.005, 0.006, 0.009) * exp(-hp * 0.8);',
    '  if (h < 0.0) c = mix(c, vec3(0.045, 0.036, 0.028), smoothstep(0.0, -0.05, h));',
    // stars: only the brightest, only high overhead - the floodlights wash the rest out
    '  vec3 q = floor(d * 380.0); float s = hash(q); float st = step(0.9993, s) * smoothstep(0.42, 0.85, h) * (0.3 + 0.7 * hash(q + 7.0));',
    '  c += vec3(0.8, 0.85, 1.0) * st * 0.22;',
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
    const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 13.3, 12) }), warm = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.2, 1.6) });
    const g = new THREE.BoxGeometry(14, 6, 2);
    for (let k = 0; k < 72; k++) { const a = k / 72 * Math.PI * 2 + (k % 3) * 0.04; const r = 260 + (k % 5) * 45; const m = new THREE.Mesh(g, k % 5 === 4 ? warm : lamp); m.position.set(Math.cos(a) * r, 34 + (k % 4) * 16, Math.sin(a) * r); m.lookAt(0, 0, 0); s.add(m); }
    // the hotel's LED skin and the city's sodium band, so paint and glass pick up colour, not only white points
    const led = new THREE.Mesh(new THREE.BoxGeometry(220, 60, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.4, 1.3) })); led.position.set(-320, 70, 160); led.lookAt(0, 0, 0); s.add(led);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(800, 800, 30, 32, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.34, 0.16), side: THREE.BackSide })); band.position.y = 6; s.add(band);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.11, 0.10, 0.09) })); ground.rotation.x = -Math.PI / 2; ground.position.y = -20; s.add(ground);
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
  const MAPN = 1024, EMAX = 9, K = 1300;
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
    // broadcast lighting: the racing surface, the run-off and the verges inside the barriers are lit to a near-daylight level all
    // round the lap (the real circuit is lit for television, with no dark gaps between towers); outside the barriers the level
    // falls off over ~30 m (fences, front rows of the stands) and a faint spill carries ~150 m (service roads, lawns, the backs
    // of the stands). The spill comes from the track's side, so faces turned towards the circuit catch it.
    if (Night.track) {
      const TC = Night.track.core, TH = Night.track.halo, TCOL = Night.track.color, RR = 160;
      const DT = new Float32Array(N * N).fill(1e9), GX = new Float32Array(N * N), GZ = new Float32Array(N * N);
      for (let i = 0; i < t.n; i += 2) {
        const w = Math.max(t.wallL[i], t.wallR[i]); const R = w + RR; const cxw = t.x[i], czw = t.z[i];
        const i0 = Math.max(0, Math.floor((cxw - R - ox) / px)), i1 = Math.min(N - 1, Math.ceil((cxw + R - ox) / px));
        const j0 = Math.max(0, Math.floor((czw - R - oz) / px)), j1 = Math.min(N - 1, Math.ceil((czw + R - oz) / px));
        for (let j = j0; j <= j1; j++) { const dz = oz + (j + 0.5) * px - czw;
          for (let ii = i0; ii <= i1; ii++) { const dx = ox + (ii + 0.5) * px - cxw; const dd = Math.sqrt(dx * dx + dz * dz); if (dd > R) continue; const d = dd - w; const k = j * N + ii; if (d < DT[k]) { DT[k] = d; GX[k] = dd > 0.5 ? -dx / dd : 0; GZ[k] = dd > 0.5 ? -dz / dd : 0; } }
        }
      }
      for (let k = 0; k < N * N; k++) {
        const d = DT[k]; if (d > RR) continue;
        const core = TC * (1 - U.smoothstep(0.5, 30, d)), halo = TH * (1 - U.smoothstep(8, RR, d)); const E = core + halo;
        R[k] += E * TCOL[0]; G[k] += E * TCOL[1]; B[k] += E * TCOL[2];
        const hz = halo * 0.9 + core * 0.35 * U.smoothstep(0, 12, d); DX[k] += GX[k] * hz; DZ[k] += GZ[k] * hz;
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
    'uniform vec4 uNSp[4]; uniform vec3 uNSpC[4]; uniform vec4 uNAir; vec3 nHaze = vec3(0.0);\n' +
    'vec3 nightE(out vec3 Lw) { vec2 uv = (vNW.xz - uNBox.xy) * uNBox.z; Lw = vec3(0.0, 1.0, 0.0); if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return vec3(0.0);\n' +
    '  vec3 e = texture2D(uNMap, uv).rgb; e = e * e * uNBox.w; e = e / (1.0 + e * 0.14); vec3 dd = texture2D(uNDir, uv).rgb; vec2 dh = (dd.xy * 2.0 - 1.0) * dd.z;\n' +
    '  e *= 1.0 - smoothstep(uNTop, uNTop + 50.0, vNW.y); nHaze = e;\n' +
    '  Lw = normalize(vec3(dh.x * 0.9, 1.0, dh.y * 0.9)); return e; }\n' +
    // coloured volumes: falloff to the radius, the light coming from the volume's centre; hollow in the middle (the emitter's own
    // building is lit by its LEDs, not by its spill)
    'vec3 nightSpill(out vec3 Ls) { vec3 acc = vec3(0.0); vec3 dir = vec3(0.0);\n' +
    '  for (int i = 0; i < 4; i++) { vec3 dv = uNSp[i].xyz - vNW; float d = length(dv); float k = 1.0 - clamp(d / uNSp[i].w, 0.0, 1.0); k = pow(k, 1.6) * smoothstep(0.0, uNSp[i].w * 0.3, d);\n' +
    '    acc += uNSpC[i] * k; dir += dv / max(d, 1.0) * k * dot(uNSpC[i], vec3(0.333)); }\n' +
    '  Ls = length(dir) > 1e-4 ? normalize(dir) : vec3(0.0, 1.0, 0.0); nHaze += acc * 0.6; return acc; }\n';
  const LIT = '{ vec3 nLw; vec3 nE = nightE(nLw); IncidentLight nl; nl.color = nE; nl.direction = normalize((viewMatrix * vec4(nLw, 0.0)).xyz); nl.visible = true; RE_Direct(nl, geometry, material, reflectedLight);\n' +
    '  vec3 nLs; vec3 nS = nightSpill(nLs); if (dot(nS, vec3(1.0)) > 0.002) { nl.color = nS; nl.direction = normalize((viewMatrix * vec4(nLs, 0.0)).xyz); reflectedLight.directDiffuse += nS * saturate(dot(geometry.normal, nl.direction)) * material.diffuseColor; reflectedLight.indirectDiffuse += nS * 0.18 * material.diffuseColor; } }\n';
  // racing surfaces at night: smoother, so the floodlights streak across the asphalt and the painted run-off (u2 / u3)
  const GLOSS = '#if defined( STANDARD ) && defined( NIGHT_GLOSS )\n{ vec3 nWN = inverseTransformDirection(normal, viewMatrix); float up = smoothstep(0.75, 0.95, nWN.y);\n' +
    '  material.specularRoughness = mix(material.specularRoughness, max(0.34, material.specularRoughness * 0.7), up * float(NIGHT_GLOSS)); }\n#endif\n';
  // the floodlit air: everything picks up a faint warm haze with distance, more where the air itself is lit
  const FOG = '#ifdef USE_FOG\n  float nFogF = smoothstep(fogNear, fogFar, fogDepth); float nAir = (1.0 - exp(-fogDepth * 0.0022)) * uNAir.w;\n' +
    '  gl_FragColor.rgb += uNAir.rgb * nAir * (0.35 + min(dot(nHaze, vec3(0.333)), 2.5));\n' +
    '  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor + uNAir.rgb * uNAir.w * 0.6, nFogF);\n#endif\n';
  const patched = new WeakSet();
  function patchMaterial(m) {
    if (!m || patched.has(m)) return; patched.add(m);
    const lit = m.isMeshStandardMaterial || m.isMeshPhongMaterial, basic = m.isMeshBasicMaterial && !(m.userData && m.userData.nightEmissive) && m.blending === THREE.NormalBlending;
    if (!lit && !basic) return;
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey; const gloss = lit && m.userData && m.userData.nightGloss ? +m.userData.nightGloss : 0;
    m.onBeforeCompile = function (sh, r) {
      if (prev) prev.call(this, sh, r);
      if (sh.vertexShader.indexOf('#include <project_vertex>') < 0) return;
      const fragOk = lit ? sh.fragmentShader.indexOf('#include <lights_fragment_begin>') >= 0 : sh.fragmentShader.indexOf('#include <envmap_fragment>') >= 0;
      if (!fragOk) return;
      Object.assign(sh.uniforms, UNI);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vNW;').replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FDECL);
      if (gloss) sh.fragmentShader = '#define NIGHT_GLOSS ' + gloss.toFixed(2) + '\n' + sh.fragmentShader;
      if (lit) sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', GLOSS + '#include <lights_fragment_begin>\n' + LIT);
      else sh.fragmentShader = sh.fragmentShader.replace('#include <envmap_fragment>', '{ vec3 nLw; vec3 nE = nightE(nLw); vec3 nLs; vec3 nS = nightSpill(nLs); outgoingLight *= uNBasic + (nE + nS) * 0.55; }\n#include <envmap_fragment>');
      if (sh.fragmentShader.indexOf('#include <fog_fragment>') >= 0) sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', FOG);
    };
    const pk = prev ? prev.toString() : '';
    m.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + pk.length + pk.slice(0, 80) + '|night2' + gloss; };
    m.needsUpdate = true;
  }
  Night.patchScene = function (root) {
    root.traverse(o => { if (!o.material || o.name === 'nightSky' || o.name === 'nightGlows') return; if (Array.isArray(o.material)) o.material.forEach(patchMaterial); else patchMaterial(o.material); });
  };

  // ---------------------------------------------------------------- glow sprites: one Points cloud, additive, sized in metres
  const GV = ['attribute float gsize; attribute vec3 gcol; attribute float gpulse; uniform float uScale; uniform float uNTime; varying vec3 vC; varying float vF; varying float vStar;',
    'void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z; float p = gpulse > 0.0 ? 0.75 + 0.25 * sin(uNTime * gpulse * 6.2832 + position.x * 0.37) : 1.0;',
    // the sprite is 3x the light's size: the core sits in the middle, the rest is halo; far lamps keep a few pixels of halo
    '  float px = gsize * uScale / max(d, 1.0); gl_PointSize = clamp(px * 3.0, 3.0, 360.0);',
    '  vC = gcol * p * clamp(px / 2.0, 0.4, 1.0); vF = 1.0 - smoothstep(1800.0, 3400.0, d); vStar = gsize >= 3.5 ? clamp(px / 6.0, 0.25, 1.0) : 0.0;',
    '  gl_Position = projectionMatrix * mv; }'].join('\n');
  const GF = ['varying vec3 vC; varying float vF; varying float vStar;',
    'void main() { vec2 q = gl_PointCoord * 2.0 - 1.0; float r2 = dot(q, q); if (r2 > 1.0) discard;',
    '  float core = exp(-r2 * 50.0) * 1.2 + exp(-r2 * 300.0) * 1.6; float halo = (exp(-r2 * 9.0) * 0.45 + exp(-r2 * 2.5) * 0.22) * (1.0 - r2);',
    '  float star = (exp(-abs(q.y) * 90.0) + exp(-abs(q.x) * 90.0)) * exp(-r2 * 2.0) * 0.45 * vStar;',
    '  gl_FragColor = vec4(vC * (core + halo + star) * vF, 1.0); }'].join('\n');
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
  Night.frame = function (dt, t) {
    UNI.uNTime.value = t; for (const fn of Night.frameFns) fn(dt, t);
    for (let i = 0; i < 4; i++) { const sp = Night.spills[i]; const c = UNI.uNSpC.value[i]; if (!sp) { c.set(0, 0, 0); continue; } const v = sp.fn(t); c.set(v[0], v[1], v[2]); }
  };
  // the W hotel's gridshell (EnvYas' 'yasShellLED'): three coloured volumes along the building, in the LED show's palette at their
  // spot (the same function as the skin's shader), so the track, the run-off, the walls and the cars under it take its colour
  function hotelSpills(scene) {
    if (Night.spills.length) return; const m = scene.getObjectByName('yasShellLED'); if (!m || !m.geometry) return;
    m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox; const sx = bb.max.x - bb.min.x, sz = bb.max.z - bb.min.z; const cy = bb.min.y + 10;
    const pal = (t) => { t = t - Math.floor(t); const A = [1.0, 0.12, 0.75], B = [0.2, 0.35, 1.0], Cc = [0.62, 0.25, 1.0], D = [0.95, 0.95, 1.0]; const mix = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
      return t < 0.25 ? mix(A, B, t * 4) : t < 0.5 ? mix(B, Cc, t * 4 - 1) : t < 0.75 ? mix(Cc, D, t * 4 - 2) : mix(D, A, t * 4 - 3); };
    const L = Math.max(sx, sz), R = Math.max(80, L * 0.62);
    for (const f of [0.2, 0.5, 0.8]) {
      const x = sx >= sz ? bb.min.x + sx * f : (bb.min.x + bb.max.x) / 2, z = sx >= sz ? (bb.min.z + bb.max.z) / 2 : bb.min.z + sz * f;
      Night.addColorSpill(x, cy, z, R, (t) => { const c = pal(x * 0.0025 + cy * 0.006 + t * 0.035); const w = 0.75 + 0.25 * Math.sin(x * 0.035 + cy * 0.08 - t * 0.9); const k = 3.4 * w; return [c[0] * k, c[1] * k * 0.75, c[2] * k]; });
    }
  }

  // ---------------------------------------------------------------- after the scenery and the track are built
  // broadcast lighting along the circuit (see bake): core level on the racing surface, spill level, colour. Set from the look.
  Night.track = { core: 2.3, halo: 0.42, color: [1.0, 0.95, 0.87] };
  Night.build = function (scene, track, scenery) {
    if (!Night.on || Night.built) return; Night.built = true;
    const L = EI.look && EI.look.nightTrack; if (L) Object.assign(Night.track, L);
    if (Night.floods.length < 20) autoFloods(track);
    const ground = scenery && scenery.height ? (x, z) => scenery.height(x, z) : null;
    bake(track, ground); buildGlows(scene); hotelSpills(scene);
    Night.spills.slice(0, 4).forEach((sp, i) => UNI.uNSp.value[i].set(sp.x, sp.y, sp.z, sp.r));
    const air = EI.look && EI.look.nightAir; if (air) UNI.uNAir.value.set(air[0], air[1], air[2], air[3]);
    // the racing surfaces turn smoother at night (specular streaks under the floods)
    if (track.group) track.group.traverse(o => { if (!o.material || Array.isArray(o.material)) return; const k = { asphalt: 0.55, runoff: 0.2, kerb: 0.3, pitLane: 0.45, paint: 0.25 }[o.name]; if (k) o.material.userData.nightGloss = k; });
    if (scenery) { if (scenery.clouds) scenery.clouds.visible = false; if (scenery.clouds2) scenery.clouds2.visible = false; }   // a clear desert night
    Night.patchScene(scene);
  };
  EI.Night = Night;
})();
