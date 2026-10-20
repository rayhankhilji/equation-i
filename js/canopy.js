// Equation I - dappled light under the trees (a day circuit whose look sets LOOKS canopy, e.g. Monza's Royal Park).
// The park's trees don't cast real-time shadows (thousands of instanced crowns in every cached shadow pass would cost far too much
// on Low). Instead, once at load, every tree crown near the circuit is splatted into a world-space shade map (~1.5 m texels) at the
// spot its shadow falls for the look's sun; the sun term of the ground, the track and the scenery that receive shadows is then
// darkened by it, broken up by two scales of a tiling leaf-noise texture into sun flecks. Cost per pixel: two texture reads.
// API: EI.Canopy.build(scene, track, sunDir, opts) after the scenery is built; trees are captured from EI.EnvVeg.instance.
(function () {
  const Canopy = { trees: null, built: false };
  const U = EI.U;
  // the tree list (records [x, z, species, width, height, variant, tint, interior]) as the vegetation instancer receives it
  if (EI.EnvVeg && EI.EnvVeg.instance) { const orig = EI.EnvVeg.instance; EI.EnvVeg.instance = function (E, trees) { Canopy.trees = trees; return orig.apply(this, arguments); }; }

  const UNI = { uCanMap: { value: null }, uCanLeaf: { value: null }, uCanBox: { value: new THREE.Vector4(0, 0, 1, 0) }, uCanQ: { value: 1 } };
  const FDECL = 'uniform sampler2D uCanMap; uniform sampler2D uCanLeaf; uniform vec4 uCanBox; uniform float uCanQ;\n' +
    'float eiCanopy() { if (uCanQ < 0.5) return 1.0; vec3 vp = -vViewPosition; vec3 wd = vec3(dot(viewMatrix[0].xyz, vp), dot(viewMatrix[1].xyz, vp), dot(viewMatrix[2].xyz, vp));\n' +
    '  vec3 wp = cameraPosition + wd; vec2 uv = (wp.xz - uCanBox.xy) * uCanBox.z; if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return 1.0;\n' +
    '  float cov = texture2D(uCanMap, uv).r; if (cov < 0.004) return 1.0;\n' +
    // cheap mode (uCanQ 1, Low): the soft crown shade alone, one texture read; 2 = with the leaf-noise sun flecks
    '  if (uCanQ < 1.5) return 1.0 - uCanBox.w * cov * 0.8;\n' +
    // sun flecks: two octaves of leaf noise; the gaps open where both are high, fewer under dense cover
    '  float n = texture2D(uCanLeaf, wp.xz * 0.11).r * 0.62 + texture2D(uCanLeaf, wp.xz * 0.37 + 0.3).r * 0.38;\n' +
    '  float fleck = smoothstep(0.5 + cov * 0.16, 0.66 + cov * 0.16, n);\n' +
    '  return 1.0 - uCanBox.w * cov * (1.0 - fleck * 0.85); }\n';
  const LINE = 'getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );';
  const patched = new WeakSet();
  function patch(m) {
    if (!m || !m.isMeshStandardMaterial || patched.has(m)) return; patched.add(m);
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
    m.onBeforeCompile = function (sh, r) {
      if (prev) prev.call(this, sh, r);
      if (sh.fragmentShader.indexOf('#include <lights_fragment_begin>') < 0 || sh.fragmentShader.indexOf('#include <common>') < 0) return;
      Object.assign(sh.uniforms, UNI);
      sh.fragmentShader = '#define EI_CANOPY\n' + sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FDECL);
    };
    const pk = prev ? prev.toString() : '';
    m.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + pk.length + pk.slice(0, 80) + '|canopy'; };
    m.needsUpdate = true;
  }

  Canopy.build = function (scene, track, sunDir, opts) {
    if (Canopy.built || !Canopy.trees || !Canopy.trees.length || sunDir.y < 0.05) return; Canopy.built = true; opts = opts || {};
    const t = track, n = t.n; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < n; i++) { x0 = Math.min(x0, t.x[i]); x1 = Math.max(x1, t.x[i]); z0 = Math.min(z0, t.z[i]); z1 = Math.max(z1, t.z[i]); }
    const M = 90; x0 -= M; z0 -= M; x1 += M; z1 += M; const size = Math.max(x1 - x0, z1 - z0); const px = Math.max(1.25, size / 1536); const N = Math.min(1536, Math.ceil(size / px / 4) * 4);
    const c = document.createElement('canvas'); c.width = c.height = N; const ctx = c.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, N, N);
    ctx.globalCompositeOperation = 'lighter';
    // the shadow of a crown at height hc falls hc / tan(elevation) away from the sun, stretched along the sun's azimuth
    const sl = Math.hypot(sunDir.x, sunDir.z) || 1, ux = sunDir.x / sl, uz = sunDir.z / sl, cot = sl / sunDir.y; const ang = Math.atan2(uz, ux);
    const pr = {}; const SHRUB = EI.EnvVeg.SP ? EI.EnvVeg.SP.SHRUB : 3; let used = 0;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, 'rgba(255,255,255,0.62)'); g.addColorStop(0.6, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    for (const tr of Canopy.trees) {
      const [x, z, sp, w, h] = tr; if (sp === SHRUB || !(w > 0) || !(h > 0)) continue;
      t.project(x, z, -1, pr); const wall = pr.lat < 0 ? t.wallL[pr.i] : t.wallR[pr.i]; if (pr.dist > wall + 55) continue;
      const hc = h * 0.62, r = Math.max(1.5, w * 0.5); const sx = x - ux * hc * cot, sz = z - uz * hc * cot;
      ctx.setTransform(1, 0, 0, 1, (sx - x0) / px, (sz - z0) / px); ctx.rotate(ang); ctx.scale(r * Math.min(2.2, 1 + 0.5 * cot) / px, r / px); ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); used++;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!used) return;
    const tex = new THREE.CanvasTexture(c); tex.flipY = false; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true;
    // leaf noise: tileable 128 x 128 value noise, blotchy (a few octaves), wrapped
    const L = 128, lc = document.createElement('canvas'); lc.width = lc.height = L; const lx = lc.getContext('2d'); const img = lx.createImageData(L, L); const d = img.data; const T = 8;
    const nz = (u, v) => U.fbm(u + 3.1, v + 7.7, 3, 2.0, 0.55);
    for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
      const fx = x / L, fy = y / L, u = fx * T, v = fy * T;
      const f = nz(u, v) * (1 - fx) * (1 - fy) + nz(u - T, v) * fx * (1 - fy) + nz(u, v - T) * (1 - fx) * fy + nz(u - T, v - T) * fx * fy;
      const k = (y * L + x) * 4; const q = U.clamp(f * 255, 0, 255); d[k] = d[k + 1] = d[k + 2] = q; d[k + 3] = 255;
    }
    lx.putImageData(img, 0, 0); const leaf = new THREE.CanvasTexture(lc); leaf.wrapS = leaf.wrapT = THREE.RepeatWrapping;
    UNI.uCanMap.value = tex; UNI.uCanLeaf.value = leaf; UNI.uCanBox.value.set(x0, z0, 1 / (N * px), opts.k != null ? opts.k : 0.72);
    if (THREE.ShaderChunk.lights_fragment_begin.indexOf('eiCanopy') < 0) THREE.ShaderChunk.lights_fragment_begin = THREE.ShaderChunk.lights_fragment_begin.replace(LINE, LINE + '\n\t\t#ifdef EI_CANOPY\n\t\tdirectLight.color *= eiCanopy();\n\t\t#endif');
    // what receives shadows (ground, track, verges, stands, statics) gets the shade; the trees and the cars do not
    scene.traverse(o => { if (!o.isMesh || !o.receiveShadow || !o.material || o.name === 'trees') return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(patch); });
    Canopy.stats = { trees: used, px: +px.toFixed(2), N }; Canopy.map = tex;
  };
  // quality: 'off' = no shade (0 reads), Low = the crown shade only (1 read on receiving pixels), Medium / High = shade + sun flecks
  // (3 reads under the trees). A uniform switch: no shader recompiles. Canopy.LOW = what Low gets ('off' | 'shade').
  Canopy.LOW = 'off';   // PERF (wave 6): no canopy cost on Low
  Canopy.setQuality = function (q) { UNI.uCanQ.value = q === 'low' ? (Canopy.LOW === 'off' ? 0 : 1) : 2; };
  EI.Canopy = Canopy;
})();
