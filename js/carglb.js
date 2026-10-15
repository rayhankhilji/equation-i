// Equation I - GLB car model loader (drop-in replacement for EI.CarModel.build)
// Loads assets/models/ei-car-{hi,lo}.glb (x forward, y up, z right, metres, ground at y = 0, axles at
// x = +1.75 / -1.85) plus the material-ID / AO atlases, and composes a per-team livery texture at runtime.
// build(car, lod) returns the same object shape as EI.CarModel.build(car):
//   { group, body, wheels[FL,FR,RL,RR], frontPivots[FL,FR], flap, helmet, bodyMat }
// The flap keeps CarModel's angle convention (rotation.z = 0.5 closed, -0.15 open); flapClosed / flapOpen are
// also exposed on the returned object.
// Materials: triplanar carbon weave under clear coat (dark satin inside the cockpit opening), clear-coated metallic paint
// with procedural flake, darker floor carbon, iridium visor, branded tyre walls, brake-disc glow (car.brake) and a rain
// light that flashes while ERS deploys. Wheels are seated on the road (tyre bottom at y = 0) and a soft contact shadow
// (tyre patches + footprint, zero alpha at its edges) sits 2 cm above it. Player cars ('hi') also get a detailed cockpit:
// procedural steering wheel (face texture, buttons, rotary knobs, live LED + display canvas = `screen` / `screenTex`,
// uploads capped at ~15 Hz), padded gloves and IK-driven race-suit arms re-shaped by animate(steer), torso / HANS, and
// cheap render-target mirrors (screen.userData.mirrors.update(renderer, scene, every)): small targets, heavy scenery and
// far cars hidden, own bodywork drawn from the lo LOD.
window.EI = window.EI || {};
(function () {
  const BASE = 'assets/models/';
  const FLAP_CLOSED = 0.5, FLAP_OPEN = -0.15;
  const cache = { hi: null, lo: null, meta: null, idImg: null, aoImg: null };
  const texCache = {}, helmetMats = {}, shared = {}, roleMaps = {};
  let loading = null;
  const CarGLB = { ready: false, preload, build, composeLivery, FLAP_CLOSED, FLAP_OPEN };

  // ---------------------------------------------------------------- loading
  function preload() {
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      if (!THREE.GLTFLoader) return reject(new Error('GLTFLoader not available'));
      const loader = new THREE.GLTFLoader();
      const glb = (f) => new Promise((res, rej) => loader.load(BASE + f, res, undefined, rej));
      const img = (f) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('failed to load ' + f)); im.src = BASE + f; });
      Promise.all([glb('ei-car-hi.glb'), glb('ei-car-lo.glb'), img('ei-car-id.png'), img('ei-car-ao.png')]).then(([hi, lo, idImg, aoImg]) => {
        cache.hi = hi.scene; cache.lo = lo.scene; cache.idImg = idImg; cache.aoImg = aoImg;
        cache.meta = hi.scene.userData && hi.scene.userData.anchors ? hi.scene.userData : (lo.scene.userData || {});
        for (const s of [cache.hi, cache.lo]) prepare(s);
        CarGLB.ready = true; resolve(CarGLB);
      }).catch((e) => { console.warn('EI.CarGLB: GLB car unavailable, using the procedural car.', e && e.message ? e.message : e); reject(e); });
    });
    return loading;
  }

  // ---------------------------------------------------------------- procedural material textures
  // 2x2 twill carbon weave, 256 px tile = 16 tows. R: albedo (0..1 across the dark->light carbon range), G: sheen layer
  // (the lighter, glossier tow tops that catch the light), B: tow-gap mask. Sampled triplanar in object space so the weave
  // has a constant real-world size (4 mm tows) on every part regardless of its UVs.
  function weaveTexture() {
    if (shared._weave) return shared._weave;
    const N = 256, T = 16; const c = document.createElement('canvas'); c.width = c.height = N; const ctx = c.getContext('2d'); const img = ctx.createImageData(N, N); const d = img.data;
    const U = EI.U;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = Math.floor(x / T), j = Math.floor(y / T); const horiz = ((i + j) & 3) < 2;
      const fx = ((x % T) + 0.5) / T, fy = ((y % T) + 0.5) / T; const across = horiz ? fy : fx;
      // position along the 2-cell run of this tow (it dives under the crossing tows at both ends)
      const runCell = horiz ? ((i + j) & 1) : ((i + j + 1) & 1); const along = ((horiz ? fx : fy) + runCell) / 2;
      const prof = Math.pow(Math.sin(across * Math.PI), 0.55), dive = 0.72 + 0.28 * Math.sin(along * Math.PI);
      const fib = U.noise2(horiz ? x * 0.045 : x * 1.7, horiz ? y * 1.7 : y * 0.045);
      let lum = (0.35 + 0.55 * prof * dive) + (fib - 0.5) * 0.35; if (across < 0.07 || across > 0.93) lum *= 0.35;
      const sheen = Math.pow(prof, 2.2) * dive * (horiz ? 1 : 0.62);
      const k = (y * N + x) * 4; d[k] = U.clamp(lum * 255, 0, 255); d[k + 1] = U.clamp(sheen * 255, 0, 255); d[k + 2] = (across < 0.07 || across > 0.93) ? 0 : 255; d[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8; tex.userData = { canvas: c };
    shared._weave = tex; return tex;
  }
  // carbon material: triplanar weave + clear-coat lacquer
  function carbonMaterial(opts) {
    opts = opts || {};
    const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0.5, clearcoat: opts.clearcoat != null ? opts.clearcoat : 0.45, clearcoatRoughness: 0.14, envMapIntensity: opts.env != null ? opts.env : 0.38 });
    const weave = weaveTexture(); const scale = opts.scale || 20.8;   // 1 / 48 mm tile (3 mm tows)
    // ckMask = 1 on car bodywork (body space): inside the cockpit opening (and under the halo) the carbon turns into a dark,
    // low-contrast satin finish, so the tub walls and halo read as dark padding instead of bright grey weave in the cockpit view
    m.userData.ckMask = opts.ckMask != null ? opts.ckMask : 1;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.weaveMap = { value: weave }; sh.uniforms.weaveScale = { value: scale }; sh.uniforms.ckMask = { value: m.userData.ckMask };
      sh.uniforms.weaveDark = { value: new THREE.Color(opts.dark || 0x030304) }; sh.uniforms.weaveLight = { value: new THREE.Color(opts.light || 0x111215) };
      sh.vertexShader = 'varying vec3 vWvPos;\nvarying vec3 vWvNrm;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWvPos = position; vWvNrm = normal;');
      sh.fragmentShader = 'uniform sampler2D weaveMap;\nuniform float weaveScale;\nuniform float ckMask;\nuniform vec3 weaveDark;\nuniform vec3 weaveLight;\nvarying vec3 vWvPos;\nvarying vec3 vWvNrm;\nvec3 wvSample;\nfloat wvCk;\n' +
        sh.fragmentShader.replace('#include <map_fragment>', [
          'vec3 wvN = abs(normalize(vWvNrm)); wvN = pow(wvN, vec3(4.0)); wvN /= (wvN.x + wvN.y + wvN.z);',
          'vec3 wvP = vWvPos * weaveScale;',
          'wvSample = texture2D(weaveMap, wvP.zy).rgb * wvN.x + texture2D(weaveMap, wvP.xz).rgb * wvN.y + texture2D(weaveMap, wvP.xy).rgb * wvN.z;',
          'wvCk = ckMask * (1.0 - smoothstep(0.24, 0.31, abs(vWvPos.z))) * smoothstep(-0.06, 0.06, vWvPos.x) * (1.0 - smoothstep(0.86, 1.0, vWvPos.x)) * smoothstep(0.36, 0.46, vWvPos.y);',
          'diffuseColor.rgb *= mix(weaveDark, weaveLight, mix(wvSample.r * wvSample.r, 0.35 + 0.3 * wvSample.r, wvCk)) * (1.0 - 0.45 * wvCk);'].join('\n'))
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(clamp(roughnessFactor * (1.25 - 0.6 * wvSample.g), 0.24, 1.0), 0.78, wvCk);')
        .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef CLEARCOAT\nmaterial.clearcoat *= 1.0 - 0.85 * wvCk;\n#endif');
    };
    m.customProgramCacheKey = () => 'ei-carbon';
    return m;
  }
  // tyre sidewall branding: compound-coloured band + EQUATION lettering, painted in polar form for RingGeometry UVs
  // RingGeometry(0.27, 0.335) UVs are planar, so the canvas is painted in polar form: R = 0.335 m
  function tyreWallTexture(tyre) {
    const key = '_tyre_' + tyre.name; if (shared[key]) return shared[key];
    const S = 1024, c = document.createElement('canvas'); c.width = c.height = S; const ctx = c.getContext('2d'); const R = S / 2, M = R / 0.335;
    ctx.translate(R, R);
    ctx.strokeStyle = tyre.color; ctx.lineWidth = 0.007 * M; ctx.beginPath(); ctx.arc(0, 0, 0.3235 * M, 0, 6.283); ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 0.0015 * M; ctx.beginPath(); ctx.arc(0, 0, 0.2755 * M, 0, 6.283); ctx.stroke();
    const words = ['EQUATION', tyre.name.toUpperCase(), 'EQUATION', tyre.name.toUpperCase()]; const rt = 0.2985 * M; const fs = 0.03 * M;
    ctx.font = '900 ' + Math.round(fs) + 'px "Titillium Web", "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    words.forEach((w, k) => {
      const a0 = k * Math.PI / 2 + Math.PI / 4; ctx.fillStyle = k % 2 ? tyre.color : '#f2f2f2';
      const ws = w.split('').map(ch => ctx.measureText(ch).width + fs * 0.12); const tot = ws.reduce((x, y) => x + y, 0);
      let a = a0 - tot / rt / 2;
      w.split('').forEach((ch, i) => { const da = ws[i] / rt; ctx.save(); ctx.rotate(a + da / 2); ctx.translate(0, -rt); ctx.fillText(ch, 0, 0); ctx.restore(); a += da; });
    });
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8; shared[key] = tex; return tex;
  }

  // clear-coated metallic paint: satin base with a procedural metal-flake normal perturbation (object-space hash cells, ~3 mm,
  // faded out once a flake is smaller than a pixel so it sparkles close up without shimmering at distance) under a smooth lacquer
  function paintMaterial(tex) {
    const m = new THREE.MeshPhysicalMaterial({ map: tex, metalness: 0.18, roughness: 0.42, clearcoat: 1.0, clearcoatRoughness: 0.035, envMapIntensity: 0.62, side: THREE.DoubleSide });
    m.extensions = { derivatives: true };
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = 'varying vec3 vFlkPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlkPos = position;');
      sh.fragmentShader = 'varying vec3 vFlkPos;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', [
        '#include <normal_fragment_maps>',
        '{ vec3 fp = vFlkPos * 380.0; vec3 fc = floor(fp);',
        '  vec3 fh = fract(sin(vec3(dot(fc, vec3(127.1, 311.7, 74.7)), dot(fc, vec3(269.5, 183.3, 246.1)), dot(fc, vec3(113.5, 271.9, 124.6)))) * 43758.5453) - 0.5;',
        '  float ffw = length(fwidth(fp)); normal = normalize(normal + fh * 0.07 * (1.0 - smoothstep(0.3, 1.1, ffw))); }'].join('\n'))
        // inside the cockpit opening the paint/carbon split follows mesh faces (a saw-tooth edge): fade any paint there to the
        // same dark satin as the cockpit carbon so the opening reads as one dark padded surround
        .replace('#include <map_fragment>', '#include <map_fragment>\nfloat pCk = (1.0 - smoothstep(0.215, 0.25, abs(vFlkPos.z))) * smoothstep(-0.06, 0.06, vFlkPos.x) * (1.0 - smoothstep(0.88, 0.97, vFlkPos.x)) * smoothstep(0.4, 0.5, vFlkPos.y);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012, 0.012, 0.014), pCk);')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.8, pCk);')
        .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.clearcoat *= 1.0 - 0.85 * pCk;');
    };
    m.customProgramCacheKey = () => 'ei-paint';
    return m;
  }
  // soft contact shadow under the car: an elliptical footprint (~0.4 at the centre) plus darker contact patches under the four tyres,
  // fading to exactly zero alpha on every edge of the plane (5.4 x 2.4 m, centred between the axles)
  const SHADOW = { w: 5.4, h: 2.4, cx: -0.05 };
  function contactShadowTexture() {
    if (shared._contact) return shared._contact;
    const W = 256, H = 128; const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d'); const img = ctx.createImageData(W, H); const d = img.data;
    const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const tyres = [[1.75, 0.86, 0.34, 0.2], [1.75, -0.86, 0.34, 0.2], [-1.85, 0.85, 0.36, 0.25], [-1.85, -0.85, 0.36, 0.25]];   // x, z, radius x, radius z
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W, v = (j + 0.5) / H; const x = SHADOW.cx + (u - 0.5) * SHADOW.w, z = (v - 0.5) * SHADOW.h;
      const e = Math.hypot((x + 0.25) / 2.4, z / 0.92);                     // floor + sidepods footprint
      let a = 0.4 * (1 - ss(0.25, 1.0, e)) * (0.75 + 0.25 * (1 - ss(0.0, 0.8, Math.abs(z) / 0.92)));
      for (const [tx, tz, rx, rz] of tyres) { const t = Math.hypot((x - tx) / rx, (z - tz) / rz); a = 1 - (1 - a) * (1 - 0.6 * (1 - ss(0.15, 1.0, t))); }
      a *= ss(0, 0.12, Math.min(u, 1 - u)) * ss(0, 0.16, Math.min(v, 1 - v));
      const k = (j * W + i) * 4; d[k] = d[k + 1] = d[k + 2] = 0; d[k + 3] = Math.round(Math.min(0.62, a) * 255);
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c); shared._contact = tex; return tex;
  }

  // shared (per-material-name) tweaks applied once to the loaded scenes
  function prepare(scene) {
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material; if (!m) return;
      const n = m.name || '';
      if (!shared[n]) {
        let mm = m;
        if (n === 'carbon') { mm = carbonMaterial(); mm.name = 'carbon'; }
        else if (n === 'metal') { mm = new THREE.MeshStandardMaterial({ name: 'metal', color: 0x7c8088, metalness: 0.92, roughness: 0.34, envMapIntensity: 1.0 }); }        // satin machined metal (rims, hubs)
        else if (n === 'mirror') { mm = new THREE.MeshStandardMaterial({ name: 'mirror', color: 0xe8eef5, metalness: 1.0, roughness: 0.03, envMapIntensity: 1.25 }); }
        else if (n === 'cover') { mm = new THREE.MeshPhysicalMaterial({ name: 'cover', color: 0x0c0d0f, metalness: 0.1, roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.15, envMapIntensity: 0.32 }); }
        else if (n === 'glass') { mm = new THREE.MeshPhysicalMaterial({ name: 'glass', color: 0x2a3550, metalness: 1.0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.01, envMapIntensity: 1.7 }); }   // mirrored iridium visor
        else if (n === 'tyre') { m.color.set(0x060607); m.roughness = 0.86; m.metalness = 0.0; m.envMapIntensity = 0.12; }
        else if (n === 'matte' || n === 'fabric') { m.color.set(0x17181c); m.roughness = 0.92; m.metalness = 0.0; m.envMapIntensity = 0.3; }
        else if (n === 'led') { m.emissive.set(0xff1a1a); m.emissiveIntensity = 0.6; }
        else { m.envMapIntensity = 0.6; m.metalness = 0.1; m.roughness = 0.7; }
        shared[n] = mm; if (mm !== m) o.material = mm;
      } else o.material = shared[n];
      const name = o.name || '';
      o.castShadow = /^(body_main|wing_|floor_main|wheel_.*_tyre|halo|susp_fin|mirror_main)/.test(name);
      o.receiveShadow = false;
    });
  }

  // ---------------------------------------------------------------- livery composition
  const PART_ROLES = {   // material-ID colour class -> colour role per atlas part
    body: { red: 'primary', yellow: 'primary', orange: 'primary', green: 'carbon', blue: 'carbon' },
    front_wing: { red: 'carbon', blue: 'secondary', yellow: 'primary', green: 'carbon', orange: 'primary' },   // carbon main plane, painted flaps / endplates
    rear_wing: { green: 'primary', orange: 'secondary', blue: 'secondary', yellow: 'secondary', red: 'secondary' },
    mirrors: { red: 'primary', yellow: 'primary', orange: 'primary', green: 'primary', blue: 'primary' },
    winglets: { blue: 'secondary', green: 'secondary', red: 'carbon', orange: 'carbon' },
    cockpit_foam: { green: 'foam' },
  };
  const DARK_BODIES = { rossa: 1, verdant: 1 };   // teams whose wings look better in primary
  function hexRgb(h) { const c = new THREE.Color(h); return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)]; }
  function classify(r, g, b) {
    if (r < 60 && g < 60 && b < 60) return 'none';
    if (b > 150) return 'blue'; if (g > 150 && r < 80) return 'green'; if (r > 150 && g > 150) return 'yellow';
    if (r > 150 && g > 40 && g < 140) return 'orange'; if (r > 150) return 'red'; return 'none';
  }
  function composeLivery(team, num, code, size) {
    size = size || 2048; const key = team.id + ':' + num + ':' + (code || '') + ':' + size;
    if (texCache[key]) return texCache[key];
    const meta = cache.meta || {}; const atlas = meta.atlas || {}; const anchors = meta.anchors || {};
    // 1) colour fill from the material-ID atlas, at <= 2048 (per-pixel JS), then upscaled with smoothing so region edges stay soft
    const base = Math.min(size, 2048);
    const c0 = document.createElement('canvas'); c0.width = base; c0.height = base; const ctx0 = c0.getContext('2d');
    let im; if (!roleMaps[base]) { ctx0.imageSmoothingEnabled = false; ctx0.drawImage(cache.idImg, 0, 0, base, base); im = ctx0.getImageData(0, 0, base, base); } else im = ctx0.createImageData(base, base);
    const d = im.data;
    const roles = { primary: hexRgb(team.primary), secondary: hexRgb(team.secondary), accent: hexRgb(team.accent), carbon: [30, 31, 34], foam: [28, 28, 30], none: [26, 27, 30] };
    // per-pixel colour role, from the ID atlas (team independent, cached per resolution)
    const ROLE_NAMES = ['none', 'primary', 'secondary', 'accent', 'carbon', 'foam'];
    if (!roleMaps[base]) {
      const src = new Uint8ClampedArray(d); const rm = new Uint8Array(base * base);
      const fill = (x0, y0, w, h, table) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const i = y * base + x; const cls = classify(src[i * 4], src[i * 4 + 1], src[i * 4 + 2]); rm[i] = Math.max(0, ROLE_NAMES.indexOf((table && table[cls]) || 'none')); } };
      for (const p of Object.keys(atlas)) { const [u0, v0, w, h] = atlas[p]; fill(Math.round(u0 * base), Math.round((1 - v0 - h) * base), Math.round(w * base), Math.round(h * base), PART_ROLES[p]); }
      roleMaps[base] = rm;
    }
    const rm = roleMaps[base]; const pal = ROLE_NAMES.map(n => roles[n]);
    for (let i = 0, n = base * base; i < n; i++) { const col = pal[rm[i]]; const k = i * 4; d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255; }
    ctx0.putImageData(im, 0, 0);
    let c = c0, ctx = ctx0;
    if (size > base) { c = document.createElement('canvas'); c.width = c.height = size; ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(c0, 0, 0, size, size); }
    ctx.imageSmoothingEnabled = true;
    // 2) team pattern bands + decals, drawn in the local frames of the UV anchors. Drawing units are metres * ppm on both axes
    //    (the frame transform carries the anisotropic UV stretch, so glyphs are rasterised directly at their final texel size).
    const frame = (name) => {
      const a = anchors[name]; if (!a) return null;
      const px = a.u * size, py = (1 - a.v) * size; const f = [a.fwd[0] * size, -a.fwd[1] * size], u = [a.up[0] * size, -a.up[1] * size];
      const lf = Math.hypot(f[0], f[1]), lu = Math.hypot(u[0], u[1]); if (lf < 1e-6 || lu < 1e-6) return null;
      return { px, py, f, u, lf, lu };
    };
    const withFrame = (name, fn) => { const fr = frame(name); if (!fr) return; ctx.save(); ctx.setTransform(fr.f[0] / fr.lu, fr.f[1] / fr.lu, -fr.u[0] / fr.lu, -fr.u[1] / fr.lu, fr.px, fr.py); fn(fr.lu); ctx.restore(); };
    const isR = (name) => /R$/.test(name);
    const band = (name, x0, x1, y0, y1, color) => withFrame(name, (ppm) => { ctx.fillStyle = color; ctx.fillRect(x0 * ppm, -y1 * ppm, (x1 - x0) * ppm, (y1 - y0) * ppm); });
    const FONT = '"Titillium Web", "Arial Black", Arial, sans-serif';
    const fontReady = !document.fonts || document.fonts.check('900 20px "Titillium Web"');
    const fontOf = (sp, px) => (sp.it ? 'italic ' : '') + (sp.w || 900) + ' ' + px.toFixed(1) + 'px ' + (fontReady ? FONT : '"Arial Black", Arial, sans-serif');
    // sponsor decal: optional rounded box behind fitted text. dr = metres towards the tail (mirrored per side), dy = metres up
    const logo = (name, sp, dr, dy, hM, maxW) => withFrame(name, (ppm) => {
      const x = (isR(name) ? -dr : dr) * ppm, y = -dy * ppm; let fs = hM * ppm;
      ctx.font = fontOf(sp, fs); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const ls = sp.ls || 0; const tw = (t) => ctx.measureText(t).width + ls * fs * (t.length - 1);
      let w = tw(sp.n); const mw = maxW * ppm; if (w > mw) { fs *= mw / w; ctx.font = fontOf(sp, fs); w = tw(sp.n); }
      if (sp.bg) { const pw = w + fs * 0.7, ph = fs * 1.18; ctx.fillStyle = sp.bg; roundRect(ctx, x - pw / 2, y - ph / 2, pw, ph, fs * 0.16); ctx.fill(); }
      ctx.fillStyle = sp.fg || '#fff';
      if (sp.ul) ctx.fillRect(x - w / 2, y + fs * 0.42, w, fs * 0.09);
      if (!ls) ctx.fillText(sp.n, x, y + fs * 0.04); else { let cx = x - w / 2; ctx.textAlign = 'left'; for (const ch of sp.n) { ctx.fillText(ch, cx, y + fs * 0.04); cx += ctx.measureText(ch).width + ls * fs; } }
    });
    const text = (name, str, hM, color, dr, dy, opts) => logo(name, Object.assign({ n: str, fg: color }, opts || {}), dr || 0, dy || 0, hM, 9);
    const P = team.primary, S = team.secondary, A = team.accent;
    const lum = (h) => { const cc = new THREE.Color(h); return 0.2126 * cc.r + 0.7152 * cc.g + 0.0722 * cc.b; };
    const NC = team.numberColor || (lum(P) > 0.4 ? '#101010' : '#ffffff');
    const SC = lum(S) > 0.4 ? '#101010' : '#ffffff';
    const sides = [['engineL', 'podL', 'chassisL'], ['engineR', 'podR', 'chassisR']];
    for (const [eng, pod, cha] of sides) {
      switch (team.id) {
        case 'rossa': band(eng, -1.7, 1.6, 0.12, 0.34, S); band(eng, -1.7, 1.6, 0.09, 0.12, A); band(pod, -0.9, 0.9, -0.12, -0.06, A); break;
        case 'argent': band(eng, -1.7, 1.6, 0.0, 0.2, S); band(eng, -1.7, 1.6, 0.2, 0.26, A); band(pod, -0.9, 0.9, -0.14, 0.02, S); band(cha, -0.4, 0.6, -0.16, 0.06, A); break;
        case 'taurus': band(eng, -1.7, 0.3, 0.08, 0.34, S); band(eng, 0.3, 1.6, 0.08, 0.34, A); band(pod, -0.9, 0.9, -0.16, -0.02, A); band(cha, -0.4, 0.6, -0.16, 0.08, S); break;
        case 'papaya': band(eng, -1.7, -0.6, -0.3, 0.34, S); band(eng, -0.6, 1.6, 0.2, 0.34, A); band(pod, -0.9, 0.9, -0.02, 0.06, A); break;
        case 'verdant': band(eng, -1.7, 1.6, 0.16, 0.26, S); band(pod, -0.9, 0.9, -0.16, -0.04, S); band(cha, -0.4, 0.6, -0.16, -0.02, S); break;
        case 'alpenne': band(eng, -1.7, 1.6, -0.3, -0.06, S); band(eng, -1.7, 1.6, 0.16, 0.3, A); band(pod, -0.9, 0.9, -0.16, 0.0, S); break;
        case 'wilhelm': band(eng, -1.7, 1.6, 0.04, 0.28, S); band(pod, -0.9, 0.9, -0.18, 0.0, S); band(cha, -0.4, 0.6, -0.1, 0.06, S); break;
        case 'hayes': band(eng, -1.7, 1.6, 0.1, 0.34, S); band(pod, -0.9, 0.9, -0.2, -0.02, S); band(cha, -0.4, 0.6, -0.16, 0.04, A); break;
        case 'kinetik': band(eng, -1.7, 1.6, 0.06, 0.14, S); band(pod, -0.9, 0.9, -0.14, -0.04, S); band(cha, -0.4, 0.6, -0.16, 0.06, S); break;
        case 'vector': band(eng, -1.7, 1.6, -0.3, 0.0, S); band(pod, -0.9, 0.9, -0.2, -0.04, S); band(cha, -0.4, 0.6, -0.14, 0.1, A); break;
        default: band(eng, -1.7, 1.6, 0.1, 0.3, S);
      }
    }
    band('nose', -0.4, 0.4, 0.45, 0.62, S); band('nose', -0.4, 0.4, 0.63, 0.68, A);
    // ---- sponsor layout (title sponsor on the engine cover + rear wing, partners on sidepods, nose, endplates, chassis)
    const sps = team.sponsors && team.sponsors.length ? team.sponsors : [{ n: 'EQUATION', fg: NC }, { n: 'EI', fg: NC }, { n: 'EI', fg: NC }, { n: 'EI', fg: NC }];
    const sp = (i) => sps[i % sps.length];
    for (const [eng, pod, cha] of sides) {
      logo(eng, sp(0), 0.05, 0.02, 0.15, 0.95);                                   // title sponsor, engine cover
      text(eng, String(num), 0.2, NC, 0.95, 0.06, { it: 1 });                      // race number towards the fin
      logo(pod, sp(1), 0.0, 0.08, 0.085, 0.62);                                   // sidepod partner
      logo(pod, sp(3), 0.0, -0.08, 0.05, 0.42);
      if (code) text(cha, code, 0.075, NC, 0.08, 0.02, { it: 1 });                // driver code + number by the cockpit
      text(cha, String(num), 0.05, NC, -0.22, 0.02, { it: 1 });
    }
    text('nose', String(num), 0.22, NC, 0, 0.2, { it: 1 }); logo('nose', Object.assign({}, sp(2), { bg: null, fg: SC }), 0, 0.535, 0.075, 0.26);
    text('nose2', 'EI', 0.1, NC, 0, 0);
    const tname = team.name.length > 13 ? team.short : team.name.toUpperCase();
    for (const ep of ['endplateL', 'endplateR']) { logo(ep, Object.assign({}, sp(0), { bg: null, fg: SC }), -0.07, 0.08, 0.08, 0.28); text(ep, String(num), 0.12, SC, 0, -0.12, { it: 1 }); text(ep, tname, 0.035, SC, 0, -0.24, { ls: 0.12, w: 700 }); }
    logo('wingtop', Object.assign({}, sp(0), { bg: null, fg: NC }), 0, 0, 0.09, 0.85); text('airbox', String(num), 0.08, NC, 0, 0, { it: 1 });
    // 3) ambient occlusion
    ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(cache.aoImg, 0, 0, size, size); ctx.globalCompositeOperation = 'source-over';
    const tex = new THREE.CanvasTexture(c); tex.flipY = false; tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8; tex.needsUpdate = true;
    texCache[key] = tex; return tex;
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); }

  // ---------------------------------------------------------------- mesh merging (one draw call per material)
  function nonIndexed(g) { return g.index ? g.toNonIndexed() : g; }
  function mergeMeshes(meshes, transformFn) {
    // meshes: THREE.Mesh[] ; transformFn(o) -> Matrix4 to bake into the geometry. Returns Mesh[] (one per material)
    const byMat = new Map();
    for (const o of meshes) {
      let g = nonIndexed(o.geometry.clone()); g.applyMatrix4(transformFn(o));
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      const key = o.material; if (!byMat.has(key)) byMat.set(key, []); byMat.get(key).push({ g, name: o.name });
    }
    const out = [];
    for (const [mat, list] of byMat) {
      let count = 0; for (const { g } of list) count += g.attributes.position.count;
      const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3), uv = new Float32Array(count * 2); let off = 0;
      for (const { g } of list) { const c = g.attributes.position.count; pos.set(g.attributes.position.array, off * 3); nrm.set(g.attributes.normal.array, off * 3); uv.set(g.attributes.uv.array, off * 2); off += c; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      const m = new THREE.Mesh(geo, mat); m.name = 'merged_' + (mat.name || 'mat'); m.castShadow = /^(paint|carbon|tyre|cover|helmet)$/.test(mat.name || '') ; m.receiveShadow = false; m.userData.parts = list.map(x => x.name); out.push(m);
    }
    return out;
  }
  const mergedCache = {};   // per lod+material-set cache of merged static geometry is not possible (paint differs per car), so merge per car (cheap: ~60 meshes)

  // ---------------------------------------------------------------- cockpit: steering wheel, gloves, sleeves, live mirrors
  // The wheel is built in its own frame (u = driver's right, v = up, w = towards the driver), then tilted with the column.
  const WHEEL = { centre: [0.728, 0.618, 0], tilt: 0.24, lock: 1.5, faceW: 0.0105 };
  const FACE_UV = { u0: -0.118, u1: 0.118, v0: -0.094, v1: 0.072 };   // face texture extents (metres)
  function capsuleGeo(r0, r1, len, radial, caps) {
    // tapered capsule along +y, centred at the origin (LatheGeometry of a stadium profile)
    radial = radial || 12; caps = caps || 4; const pts = [];
    for (let i = 0; i <= caps; i++) { const a = -Math.PI / 2 + (i / caps) * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r0 + 1e-5, -len / 2 + Math.sin(a) * r0)); }
    for (let i = 0; i <= caps; i++) { const a = (i / caps) * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r1 + 1e-5, len / 2 + Math.sin(a) * r1)); }
    return new THREE.LatheGeometry(pts, radial);
  }
  // matrix that maps a +y-aligned unit segment onto a -> b (or, with keepLen, a geometry already built at its true length),
  // with local +z pointing as close to `side` as possible
  const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3();
  function segMatrix(a, b, side, out, keepLen) {
    _by.subVectors(b, a); const len = _by.length(); _by.multiplyScalar(1 / Math.max(len, 1e-6));
    _bz.copy(side || new THREE.Vector3(0, 0, 1)).addScaledVector(_by, -_by.dot(side || _bz.set(0, 0, 1))); if (_bz.lengthSq() < 1e-8) _bz.set(1, 0, 0).cross(_by); _bz.normalize();
    _bx.crossVectors(_by, _bz).normalize();
    return (out || new THREE.Matrix4()).makeBasis(_bx, keepLen ? _by.clone() : _by.clone().multiplyScalar(len), _bz).setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  }
  // merge geometries (each with its own matrix and optional colour) into one non-indexed BufferGeometry
  function mergeGeos(items, withColor) {
    const parts = items.map(({ geo, m, color }) => { let g = nonIndexed(geo.clone()); if (m) g.applyMatrix4(m); if (!g.attributes.normal) g.computeVertexNormals(); return { g, color: color ? new THREE.Color(color) : null }; });
    let n = 0; for (const p of parts) n += p.g.attributes.position.count;
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = withColor ? new Float32Array(n * 3) : null; let o = 0;
    for (const { g, color } of parts) {
      const c = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      if (col) { const cc = color || new THREE.Color(1, 1, 1); for (let i = 0; i < c; i++) { col[(o + i) * 3] = cc.r; col[(o + i) * 3 + 1] = cc.g; col[(o + i) * 3 + 2] = cc.b; } }
      o += c;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  }
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const FONT = '"Titillium Web", "Arial Narrow", Arial, sans-serif';
  // wheel buttons / knobs (u, v in metres) shared by the 3D parts and the painted labels
  const BUTTONS = [
    [-0.089, 0.041, '#ffc400', 'N'], [-0.089, 0.018, '#2f7bff', 'PL'], [-0.089, -0.005, '#f2f2f2', 'R'], [-0.089, -0.028, '#21d06a', 'OT'],
    [0.089, 0.041, '#ff2a1c', 'PIT'], [0.089, 0.018, '#ff8a1f', 'DRS'], [0.089, -0.005, '#9b59ff', 'BOX'], [0.089, -0.028, '#18c7d8', 'MARK'],
    [-0.052, 0.058, '#2b2e35', 'TALK'], [0.052, 0.058, '#2b2e35', 'ACK'],
  ];
  const KNOBS = [[-0.036, -0.06, 0.0105, '#ff8a1f', 'BB'], [0.036, -0.06, 0.0105, '#2f7bff', 'DIFF'], [-0.071, -0.05, 0.0078, '#21d06a', 'ERS'], [0.071, -0.05, 0.0078, '#ffc400', 'ENG']];
  function faceTexture(team) {
    const key = '_face_' + team.id; if (shared[key]) return shared[key];
    const W = 1024, Wm = FACE_UV.u1 - FACE_UV.u0, Hm = FACE_UV.v1 - FACE_UV.v0, H = Math.round(W * Hm / Wm), M = W / Wm;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
    const X = (u) => (u - FACE_UV.u0) * M, Y = (v) => (FACE_UV.v1 - v) * M;
    // carbon weave background (colour version of the shared weave tile)
    const wv = weaveTexture().userData.canvas; const wc = document.createElement('canvas'); wc.width = wc.height = wv.width; const wx = wc.getContext('2d');
    const src = wv.getContext('2d').getImageData(0, 0, wv.width, wv.height); const out = wx.createImageData(wv.width, wv.height);
    for (let i = 0; i < src.data.length; i += 4) { const l = src.data[i] / 255, sh = src.data[i + 1] / 255; const g = 12 + l * l * 34 + sh * 16; out.data[i] = g; out.data[i + 1] = g + 1; out.data[i + 2] = g + 4; out.data[i + 3] = 255; }
    wx.putImageData(out, 0, 0); const pat = ctx.createPattern(wc, 'repeat'); if (pat.setTransform) pat.setTransform(new DOMMatrix().scale(1.1, 1.1));
    ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H);
    const gl = ctx.createLinearGradient(0, 0, 0, H); gl.addColorStop(0, 'rgba(255,255,255,0.10)'); gl.addColorStop(0.35, 'rgba(255,255,255,0.02)'); gl.addColorStop(1, 'rgba(0,0,0,0.25)'); ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);
    // display bezel (the live display plane sits inside it)
    ctx.fillStyle = '#050608'; roundRect(ctx, X(-0.0705), Y(0.0475), 0.141 * M, 0.0905 * M, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(160,170,185,0.55)'; ctx.lineWidth = 2; ctx.stroke();
    // team stripe + badge along the bottom edge
    ctx.fillStyle = team.primary; roundRect(ctx, X(-0.02), Y(-0.072), 0.04 * M, 0.006 * M, 4); ctx.fill();
    ctx.fillStyle = 'rgba(235,240,246,0.85)'; ctx.font = '900 ' + Math.round(0.0062 * M) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('EQUATION', X(0), Y(-0.082));
    // button labels (above each button)
    ctx.font = '700 ' + Math.round(0.0042 * M) + 'px ' + FONT; ctx.fillStyle = '#e8edf3';
    for (const [u, v, col, lab] of BUTTONS) { ctx.fillText(lab, X(u), Y(v + 0.0098)); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(X(u), Y(v), 0.0072 * M, 0, 6.283); ctx.stroke(); }
    // rotary knob scales: 8 positions over 270 degrees, numbers + ticks, coloured index arc
    for (const [u, v, r, col, lab] of KNOBS) {
      const cx = X(u), cy = Y(v), R = (r + 0.0045) * M;
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, R - 6, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
      ctx.fillStyle = '#e8edf3'; ctx.font = '700 ' + Math.round(0.0031 * M) + 'px ' + FONT;
      for (let i = 0; i < 8; i++) { const a = Math.PI * 0.75 + i / 7 * Math.PI * 1.5; ctx.fillText(String(i + 1), cx + Math.cos(a) * (R + 9), cy + Math.sin(a) * (R + 9)); }
      ctx.font = '900 ' + Math.round(0.0036 * M) + 'px ' + FONT; ctx.fillStyle = col; ctx.fillText(lab, cx, cy + R + 22);
    }
    // small screw heads + engraved separators
    ctx.fillStyle = 'rgba(200,205,215,0.55)'; for (const [u, v] of [[-0.1, 0.058], [0.1, 0.058], [-0.104, -0.045], [0.104, -0.045]]) { ctx.beginPath(); ctx.arc(X(u), Y(v), 5, 0, 6.283); ctx.fill(); }
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(-0.077), Y(0.05)); ctx.lineTo(X(-0.077), Y(-0.04)); ctx.moveTo(X(0.077), Y(0.05)); ctx.lineTo(X(0.077), Y(-0.04)); ctx.stroke();
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8; shared[key] = tex; return tex;
  }
  // glove back-of-hand logo and race-suit sleeve textures
  function gloveLogoTexture(team) {
    const key = '_glove_' + team.id; if (shared[key]) return shared[key];
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 256, 128); ctx.fillStyle = 'rgba(240,242,246,0.95)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const sp = (team.sponsors && team.sponsors[0] && team.sponsors[0].n) || 'EQUATION';
    ctx.font = 'italic 900 58px ' + FONT; ctx.fillText('EI', 128, 46); ctx.font = '700 26px ' + FONT; ctx.fillText(sp, 128, 96);
    ctx.fillStyle = team.primary; ctx.fillRect(70, 118, 116, 6);
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 4; shared[key] = tex; return tex;
  }
  // team kit colours: race suit (team.suit or primary) and gloves (team.glove, else the secondary when dark, else a dark
  // tint of it) with team-coloured accents (padding, strap) so the hands never read as bright blobs
  const lumOf = (h) => { const c = new THREE.Color(h); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
  function kitColours(team) {
    const suit = new THREE.Color(team.suit || team.primary);
    const sec = new THREE.Color(team.secondary); const dark = new THREE.Color(0x141519);
    const glove = team.glove ? new THREE.Color(team.glove) : (lumOf(team.secondary) < 0.12 ? sec.clone() : sec.clone().lerp(dark, 0.72));
    let accent = new THREE.Color(team.gloveAccent || team.primary); if (lumOf('#' + accent.getHexString()) < 0.05) accent = new THREE.Color(team.accent);
    const panel = new THREE.Color(team.suitPanel || (lumOf(team.secondary) < 0.3 ? team.secondary : '#1a1b20'));
    return { suit, glove, accent, panel, palm: new THREE.Color(0x4b4e55) };
  }
  // race-suit sleeve: u runs around the arm (u = 0.5 on top), v along it (v = 0 shoulder, v = 1 wrist; canvas y = 0 is the wrist).
  // Twill fabric grain, quilting stitch rows, an underside stretch panel with accent piping, a ribbed elastic cuff and sponsor patches.
  // Returns { map, bump }. Patches are drawn with a vertical squash so they keep their proportions on the anisotropic UVs.
  function suitTextures(team) {
    const key = '_suit_' + team.id; if (shared[key]) return shared[key];
    const W = 1024, H = 512, q = (H / 0.62) / (W / 0.3);   // px per metre along / around the arm
    const kit = kitColours(team); const hex = (c) => '#' + c.getHexString();
    const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
    const b = document.createElement('canvas'); b.width = W; b.height = H; const bx = b.getContext('2d');
    ctx.fillStyle = hex(kit.suit); ctx.fillRect(0, 0, W, H); bx.fillStyle = '#808080'; bx.fillRect(0, 0, W, H);
    // underside stretch panel (u < 0.2 and u > 0.8) with accent piping on its edges
    ctx.fillStyle = hex(kit.panel); ctx.fillRect(0, 0, 0.2 * W, H); ctx.fillRect(0.8 * W, 0, 0.2 * W, H);
    ctx.fillStyle = hex(kit.accent); ctx.fillRect(0.2 * W, 0, 7, H); ctx.fillRect(0.8 * W - 7, 0, 7, H);
    bx.fillStyle = '#9a9a9a'; bx.fillRect(0.2 * W, 0, 7, H); bx.fillRect(0.8 * W - 7, 0, 7, H);
    // quilting: stitch rows around the arm every ~3 cm, panel seams along it
    const rowStep = Math.round(0.03 * H / 0.62);
    for (let y = 40; y < H; y += rowStep) {
      for (let x = 0; x < W; x += 9) { ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(x, y, 5, 1.5); ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(x, y + 1.5, 5, 1); }
      const gr = bx.createLinearGradient(0, y - 6, 0, y + 6); gr.addColorStop(0, 'rgba(128,128,128,0)'); gr.addColorStop(0.5, 'rgba(40,40,40,0.9)'); gr.addColorStop(1, 'rgba(128,128,128,0)'); bx.fillStyle = gr; bx.fillRect(0, y - 6, W, 12);
    }
    for (const x of [0.2 * W + 14, 0.8 * W - 16, 0.5 * W - 150, 0.5 * W + 150]) { for (let y = 0; y < H; y += 7) { ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x, y, 1.5, 4); } bx.fillStyle = '#3a3a3a'; bx.fillRect(x - 1, 0, 3, H); }
    // twill grain on both maps
    const im = ctx.getImageData(0, 0, W, H), bi = bx.getImageData(0, 0, W, H); const r = EI.U.rng(11);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 4; const tw = (((x + Math.floor(y / q / 2.2)) % 6) < 3 ? 1 : -1); const n = (r() - 0.5);
      const f = 1 + tw * 0.035 + n * 0.05; im.data[k] *= f; im.data[k + 1] *= f; im.data[k + 2] *= f;
      bi.data[k] = bi.data[k + 1] = bi.data[k + 2] = EI.U.clamp(bi.data[k] + tw * 10 + n * 14, 0, 255);
    }
    ctx.putImageData(im, 0, 0); bx.putImageData(bi, 0, 0);
    // ribbed elastic cuff at the wrist end
    ctx.fillStyle = '#121317'; ctx.fillRect(0, 0, W, 34); ctx.fillStyle = hex(kit.accent); ctx.fillRect(0, 34, W, 5);
    for (let x = 0; x < W; x += 8) { ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x, 0, 3, 34); bx.fillStyle = '#c0c0c0'; bx.fillRect(x, 0, 4, 34); bx.fillStyle = '#404040'; bx.fillRect(x + 4, 0, 4, 34); }
    // sponsor patches: title sponsor on the forearm, team name on the upper arm (both on top, u = 0.5)
    const FONT2 = '"Titillium Web", "Arial Black", Arial, sans-serif';
    const patch = (sp, vC, wM, hM, bg, fg) => {
      const pw = wM * W / 0.3, ph = hM * W / 0.3; ctx.save(); ctx.translate(W / 2, (1 - vC) * H); ctx.scale(1, q);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; roundRect(ctx, -pw / 2 - 3, -ph / 2 - 3, pw + 6, ph + 6, ph * 0.18); ctx.fill();
      ctx.fillStyle = bg; roundRect(ctx, -pw / 2, -ph / 2, pw, ph, ph * 0.16); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([5, 4]); ctx.lineWidth = 2; roundRect(ctx, -pw / 2 + 5, -ph / 2 + 5, pw - 10, ph - 10, ph * 0.12); ctx.stroke(); ctx.setLineDash([]);
      let fs = ph * 0.62; ctx.font = (sp.it ? 'italic ' : '') + '900 ' + fs + 'px ' + FONT2; const tw2 = ctx.measureText(sp.n).width; if (tw2 > pw * 0.84) { fs *= pw * 0.84 / tw2; ctx.font = (sp.it ? 'italic ' : '') + '900 ' + fs + 'px ' + FONT2; }
      ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(sp.n, 0, fs * 0.04); ctx.restore();
      bx.save(); bx.translate(W / 2, (1 - vC) * H); bx.scale(1, q); bx.fillStyle = '#b4b4b4'; roundRect(bx, -pw / 2, -ph / 2, pw, ph, ph * 0.16); bx.fill(); bx.restore();
    };
    const sp0 = (team.sponsors && team.sponsors[0]) || { n: team.short };
    const light = lumOf(hex(kit.suit)) > 0.55;
    patch(sp0, 0.74, 0.085, 0.03, light ? '#16171b' : '#f3f3f3', light ? '#ffffff' : (lumOf(team.primary) > 0.6 ? team.secondary : team.primary));
    patch({ n: team.short, it: 1 }, 0.3, 0.06, 0.026, hex(kit.panel), '#ffffff');
    const map = new THREE.CanvasTexture(c); map.encoding = THREE.sRGBEncoding; map.anisotropy = 8;
    const bump = new THREE.CanvasTexture(b); bump.anisotropy = 4;
    shared[key] = { map, bump, kit }; return shared[key];
  }
  // glove leather / suede grain (tiny bump noise) and the palm grip dots
  function gloveGrain() {
    if (shared._gloveGrain) return shared._gloveGrain;
    const N = 256; const c = document.createElement('canvas'); c.width = c.height = N; const ctx = c.getContext('2d'); const im = ctx.createImageData(N, N); const r = EI.U.rng(21);
    for (let i = 0; i < N * N; i++) { const v = 128 + (r() - 0.5) * 70; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
    ctx.putImageData(im, 0, 0);
    // stitched panel seams
    ctx.strokeStyle = 'rgba(30,30,30,0.9)'; ctx.lineWidth = 3; for (const y of [64, 192]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(N, y); ctx.stroke(); }
    ctx.fillStyle = 'rgba(220,220,220,0.9)'; for (const y of [58, 70, 186, 198]) for (let x = 0; x < N; x += 8) ctx.fillRect(x, y, 4, 2);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; shared._gloveGrain = t; return t;
  }
  function buildCockpit(car, body) {
    const team = car.team;
    const steer = new THREE.Group(); steer.position.set(WHEEL.centre[0], WHEEL.centre[1], WHEEL.centre[2]); steer.rotation.z = -WHEEL.tilt;
    const spin = new THREE.Group(); steer.add(spin);
    const frame = new THREE.Group(); frame.rotation.y = -Math.PI / 2; spin.add(frame);   // (u, v, w) -> body (z, y, -x)
    // ---- wheel body: extruded outline, face texture on the caps, triplanar carbon on the walls
    const sh = new THREE.Shape(); sh.moveTo(-0.085, 0.066); sh.lineTo(0.085, 0.066); sh.quadraticCurveTo(0.106, 0.066, 0.108, 0.045); sh.lineTo(0.112, -0.035); sh.quadraticCurveTo(0.112, -0.062, 0.085, -0.07);
    sh.quadraticCurveTo(0, -0.09, -0.085, -0.07); sh.quadraticCurveTo(-0.112, -0.062, -0.112, -0.035); sh.lineTo(-0.108, 0.045); sh.quadraticCurveTo(-0.106, 0.066, -0.085, 0.066);
    const uvGen = {
      generateTopUV: (g, v, a, b, c) => [a, b, c].map(i => new THREE.Vector2((v[i * 3] - FACE_UV.u0) / (FACE_UV.u1 - FACE_UV.u0), (v[i * 3 + 1] - FACE_UV.v0) / (FACE_UV.v1 - FACE_UV.v0))),
      generateSideWallUV: () => [new THREE.Vector2(0, 0), new THREE.Vector2(1, 0), new THREE.Vector2(1, 1), new THREE.Vector2(0, 1)],
    };
    const bodyGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.0035, bevelSegments: 3, curveSegments: 10, UVGenerator: uvGen });
    bodyGeo.translate(0, 0, WHEEL.faceW - 0.026);
    const carbon = shared.carbon && shared.carbon.isMaterial ? shared.carbon : carbonMaterial();
    const faceMat = new THREE.MeshPhysicalMaterial({ map: faceTexture(team), roughness: 0.55, metalness: 0.1, clearcoat: 0.7, clearcoatRoughness: 0.1, envMapIntensity: 0.5 });
    frame.add(new THREE.Mesh(bodyGeo, [faceMat, carbon]));
    // ---- grips: moulded rubber, slightly bowed, with a team-colour thumb rest strip
    const rubber = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.25 });
    const gripItems = [];
    for (const s of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([V(s * 0.117, -0.074, 0.0), V(s * 0.129, -0.03, 0.003), V(s * 0.131, 0.02, 0.003), V(s * 0.124, 0.07, 0.0)]);
      gripItems.push({ geo: new THREE.TubeGeometry(curve, 20, 0.0185, 12, false) });
      for (const t of [0, 1]) { const p = curve.getPoint(t); gripItems.push({ geo: new THREE.SphereGeometry(0.0185, 12, 8), m: new THREE.Matrix4().makeTranslation(p.x, p.y, p.z) }); }
    }
    frame.add(new THREE.Mesh(mergeGeos(gripItems), rubber));
    // ---- buttons, knobs, paddles (one vertex-coloured mesh)
    const parts = []; const cyl = (r, h) => { const g = new THREE.CylinderGeometry(r, r * 1.04, h, 18); g.rotateX(Math.PI / 2); return g; };
    for (const [u, v, col] of BUTTONS) { parts.push({ geo: cyl(0.0062, 0.005), m: new THREE.Matrix4().makeTranslation(u, v, WHEEL.faceW + 0.0022), color: col }); parts.push({ geo: cyl(0.0074, 0.0016), m: new THREE.Matrix4().makeTranslation(u, v, WHEEL.faceW + 0.0006), color: '#0b0c0f' }); }
    const rr = EI.U.rng(3);
    for (const [u, v, r, col] of KNOBS) {
      parts.push({ geo: cyl(r + 0.0016, 0.003), m: new THREE.Matrix4().makeTranslation(u, v, WHEEL.faceW + 0.0015), color: col });
      parts.push({ geo: cyl(r, 0.011), m: new THREE.Matrix4().makeTranslation(u, v, WHEEL.faceW + 0.0065), color: '#1d1f24' });
      const a = (rr() - 0.5) * 3; const mk = new THREE.BoxGeometry(0.0014, r * 0.75, 0.0012); mk.translate(0, r * 0.45, 0); mk.rotateZ(a); mk.translate(u, v, WHEEL.faceW + 0.0122); parts.push({ geo: mk, color: '#f4f6f9' });
    }
    for (const s of [-1, 1]) { const pg = new THREE.BoxGeometry(0.06, 0.085, 0.004); pg.translate(s * 0.075, 0.012, WHEEL.faceW - 0.034); parts.push({ geo: pg, color: '#202226' }); }   // shift paddles behind
    frame.add(new THREE.Mesh(mergeGeos(parts, true), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.25, envMapIntensity: 0.6 })));
    // ---- live display (LED strip + screen) on a plane over the bezel
    const sc = document.createElement('canvas'); sc.width = 512; sc.height = 320;
    const screenTex = new THREE.CanvasTexture(sc); screenTex.encoding = THREE.sRGBEncoding; screenTex.anisotropy = 4;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.134, 0.0838), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
    screen.position.set(0, 0.0012, WHEEL.faceW + 0.0007); screen.userData.canvas = sc; frame.add(screen);
    // the wheel display is redrawn by main.js at the HUD rate; cap its texture uploads at ~15 Hz and skip mipmaps
    screenTex.generateMipmaps = false; screenTex.minFilter = THREE.LinearFilter;
    let upT = 0; Object.defineProperty(screenTex, 'needsUpdate', { configurable: true, set(v) { if (!v) return; const t = performance.now(); if (t - upT < 64) return; upT = t; this.version++; } });
    // ---- gloved hands at quarter-to-three: padded back of the hand, knuckle pads, three-segment fingers curled round the grip
    //      (suede tips), thumb resting on the face, gauntlet + team strap. Dark glove with team-colour accents.
    const kit = kitColours(team); const grain = gloveGrain();
    const glove = new THREE.MeshStandardMaterial({ color: kit.glove.clone().multiplyScalar(1.15), roughness: 1.3, metalness: 0.0, envMapIntensity: 0.38, roughnessMap: grain });
    const padMat = new THREE.MeshStandardMaterial({ color: kit.accent, roughness: 0.55, metalness: 0.0, envMapIntensity: 0.5 });
    const palmMat = new THREE.MeshStandardMaterial({ color: kit.palm.clone().multiplyScalar(0.6), roughness: 1.6, metalness: 0.0, envMapIntensity: 0.15, roughnessMap: grain });
    const cuffMat = new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 0.85, envMapIntensity: 0.18 });
    const logoMat = new THREE.MeshBasicMaterial({ map: gloveLogoTexture(team), transparent: true, depthWrite: false, toneMapped: true, polygonOffset: true, polygonOffsetFactor: -2 });
    const wrists = [];
    const ell = (c, a, b, d, seg) => ({ geo: new THREE.SphereGeometry(1, seg || 20, Math.round((seg || 20) * 0.7)), m: new THREE.Matrix4().makeScale(a, b, d).setPosition(c) });
    const cap = (p0, p1, r0, r1, rad, side) => ({ geo: capsuleGeo(r0, r1, p0.distanceTo(p1), rad || 10, 3), m: segMatrix(p0, p1, side || V(0, 0, 1), null, true) });
    for (const s of [-1, 1]) {
      const G = (du, dv, dw) => V(s * (0.13 + du), dv, 0.003 + dw);
      const base = [], pads = [], palm = [], cuffs = [];
      // back of the hand: a flattened shell over the outer-rear of the grip, slightly domed
      const MC = G(0.011, 0.002, 0.012); base.push(ell(MC, 0.026, 0.05, 0.031, 24));
      // fingers: proximal / middle / distal phalanges curling from the knuckles (outer side) round the front of the grip
      const fv = [0.031, 0.011, -0.009, -0.028], fr = [0.0098, 0.0103, 0.0099, 0.0087];
      for (let k = 0; k < 4; k++) {
        const rf = 0.0205 + fr[k] * 0.62; const ang = [0.12, 0.92, 1.72, 2.42];
        const pts = ang.map((a, i) => G(Math.cos(a) * rf + 0.004, fv[k] - 0.0018 * i, -Math.sin(a) * rf));
        for (let i = 0; i < 3; i++) { const r0 = fr[k] * (1 - i * 0.07); (i === 2 ? palm : base).push(cap(pts[i], pts[i + 1], r0, r0 * 0.94)); }
        // padded knuckle (team accent) and a crease ring at each joint
        const kn = G(0.03, fv[k], 0.005); pads.push(ell(kn, fr[k] * 1.08, fr[k] * 0.98, fr[k] * 0.95, 12));
        base.push(ell(pts[1], fr[k] * 1.04, fr[k] * 1.04, fr[k] * 1.04, 10));
      }
      // knuckle bar: the padded strip that links the four knuckle pads
      pads.push(cap(G(0.034, -0.034, 0.008), G(0.034, 0.037, 0.008), 0.0072, 0.0072, 10, V(1, 0, 0)));
      // thumb: base + two segments wrapping the near side of the grip onto the wheel face, suede tip
      const T0 = G(0.017, 0.004, 0.031), T1 = G(-0.002, 0.026, 0.031), T2 = G(-0.02, 0.034, 0.0245), T3 = G(-0.035, 0.036, 0.023);
      base.push(cap(T0, T1, 0.0165, 0.0122, 12)); base.push(cap(T1, T2, 0.0112, 0.0101)); palm.push(cap(T2, T3, 0.0101, 0.0091));
      // thenar padding on the side the driver sees (accent), palm edge (suede)
      pads.push(ell(G(0.02, 0.011, 0.034), 0.011, 0.016, 0.009, 14));
      palm.push(cap(G(0.024, -0.04, 0.02), G(0.024, 0.036, 0.022), 0.006, 0.006, 8, V(1, 0, 0)));
      // gauntlet running back, out and down to the sleeve, with a team-colour strap
      const C0 = G(0.02, -0.02, 0.024), Wr = G(0.05, -0.046, 0.07); const ax = new THREE.Vector3().subVectors(Wr, C0).normalize();
      const C1 = Wr.clone().addScaledVector(ax, 0.012);
      base.push({ geo: capsuleGeo(0.0245, 0.0265, C0.distanceTo(Wr), 14, 3), m: segMatrix(C0, Wr, V(0, 1, 0), null, true) });
      const sm = C0.clone().lerp(Wr, 0.55);
      pads.push({ geo: capsuleGeo(0.0272, 0.0274, 0.016, 16, 2), m: segMatrix(sm.clone().addScaledVector(ax, -0.008), sm.clone().addScaledVector(ax, 0.008), V(0, 1, 0), null, true) });
      cuffs.push({ geo: capsuleGeo(0.0285, 0.03, Wr.distanceTo(C1) + 0.02, 16, 3), m: segMatrix(Wr.clone().addScaledVector(ax, -0.014), C1, V(0, 1, 0), null, true) });
      frame.add(new THREE.Mesh(mergeGeos(base), glove)); frame.add(new THREE.Mesh(mergeGeos(pads), padMat)); frame.add(new THREE.Mesh(mergeGeos(palm), palmMat)); frame.add(new THREE.Mesh(mergeGeos(cuffs), cuffMat));
      // glove logo printed on the back of the hand, facing up / back towards the driver's eyes
      const nd = V(s * 0.62, 0.42, 0.66).normalize(); const ex = [0.026, 0.05, 0.031];
      const tt = 1 / Math.sqrt((nd.x / ex[0]) ** 2 + (nd.y / ex[1]) ** 2 + (nd.z / ex[2]) ** 2); const lp = MC.clone().addScaledVector(nd, tt);
      const ln = V(nd.x / ex[0] ** 2, nd.y / ex[1] ** 2, nd.z / ex[2] ** 2).normalize();
      const ly = V(0, 1, 0).addScaledVector(ln, -ln.y).normalize(), lx = new THREE.Vector3().crossVectors(ly, ln).normalize();
      const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.015), logoMat); logo.position.copy(lp).addScaledVector(ln, 0.0016);
      logo.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(lx.clone().multiplyScalar(-s), ly, ln.clone().multiplyScalar(1))); logo.rotateZ(s * Math.PI / 2); frame.add(logo);
      const wrist = new THREE.Object3D(); wrist.position.copy(C1); frame.add(wrist); wrists.push(wrist);
    }
    // ---- arms: one swept tube per arm (shoulder -> bent elbow -> wrist) in race-suit fabric, re-shaped on the CPU whenever the
    //      wheel turns. Two-bone IK with the elbow hanging down and out; radius tapers shoulder -> biceps -> elbow -> forearm -> wrist.
    const suitTex = suitTextures(team);
    const suitOpts = { map: suitTex.map, bumpMap: suitTex.bump, bumpScale: 0.0015, roughness: 0.74, metalness: 0.0, envMapIntensity: 0.4 };
    const suit = new THREE.MeshPhysicalMaterial(suitOpts); if ('sheen' in suit) suit.sheen = new THREE.Color(kit.suit).lerp(new THREE.Color(0xffffff), 0.5).multiplyScalar(0.35);
    const plainSuit = new THREE.MeshStandardMaterial({ color: kit.suit, roughness: 0.8, envMapIntensity: 0.35 });
    const RINGS = 26, SEG = 18;
    const shoulder = [V(0.06, 0.6, -0.2), V(0.06, 0.6, 0.2)];
    const arms = [-1, 1].map((s, k) => {
      const n = (RINGS + 1) * (SEG + 1); const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const uv = new Float32Array(n * 2), idx = [];
      for (let i = 0; i <= RINGS; i++) for (let j = 0; j <= SEG; j++) { uv[(i * (SEG + 1) + j) * 2] = j / SEG; uv[(i * (SEG + 1) + j) * 2 + 1] = i / RINGS; }
      for (let i = 0; i < RINGS; i++) for (let j = 0; j < SEG; j++) { const a = i * (SEG + 1) + j, b = a + SEG + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, suit); mesh.frustumCulled = false; body.add(mesh);
      return { mesh, geo, s, L: null };
    });
    // shoulders, chest and HANS collar (mostly hidden in the tub; they fill the gap at the arm roots in outside views)
    const torso = [ell(V(-0.02, 0.5, 0), 0.12, 0.17, 0.2, 20)]; for (const sh0 of shoulder) torso.push(ell(sh0, 0.062, 0.058, 0.064, 16));
    body.add(new THREE.Mesh(mergeGeos(torso), plainSuit));
    const hans = new THREE.TorusGeometry(0.088, 0.017, 8, 22, Math.PI * 1.25); hans.rotateX(Math.PI / 2); hans.rotateY(Math.PI * 0.375 + Math.PI); hans.translate(0.07, 0.69, 0);
    const hansMat = carbonMaterial({ dark: 0x020203, light: 0x0c0d10, clearcoat: 0.5, env: 0.35, ckMask: 0 });
    body.add(new THREE.Mesh(hans, hansMat));
    const _w = new THREE.Vector3(), _e = new THREE.Vector3(), _d0 = new THREE.Vector3(), _pole = new THREE.Vector3(), _inv = new THREE.Matrix4();
    const _A = new THREE.Vector3(), _B = new THREE.Vector3(), _P = new THREE.Vector3(), _T = new THREE.Vector3(), _top = new THREE.Vector3(), _side = new THREE.Vector3(), _q0 = new THREE.Vector3(), _q1 = new THREE.Vector3();
    // radius profile along normalised arc length (eE = elbow position)
    const radius = (t, eE) => {
      const knots = [[0, 0.058], [eE * 0.35, 0.054], [eE * 0.82, 0.046], [eE, 0.0435], [eE + (1 - eE) * 0.32, 0.0465], [eE + (1 - eE) * 0.78, 0.038], [1, 0.0335]];
      for (let i = 1; i < knots.length; i++) if (t <= knots[i][0]) { const [t0, r0] = knots[i - 1], [t1, r1] = knots[i]; const f = (t - t0) / Math.max(1e-6, t1 - t0); return r0 + (r1 - r0) * (f * f * (3 - 2 * f)); }
      return 0.0335;
    };
    const pathPoint = (S, A, E, B, W, lSA, lAB, lBW, d, out) => {
      if (d <= lSA) return out.lerpVectors(S, A, d / lSA);
      if (d <= lSA + lAB) { const t = (d - lSA) / lAB, u = 1 - t; return out.set(0, 0, 0).addScaledVector(A, u * u).addScaledVector(E, 2 * u * t).addScaledVector(B, t * t); }
      return out.lerpVectors(B, W, Math.min(1, (d - lSA - lAB) / lBW));
    };
    const shapeArm = (arm, S, W) => {
      const s = arm.s; _d0.subVectors(W, S); const dist = _d0.length(); _d0.multiplyScalar(1 / dist);
      if (!arm.L) arm.L = dist * 1.1;                                      // arm length fixed at the straight-ahead pose: elbows slightly bent
      const Lu = arm.L * 0.52, Lf = arm.L * 0.48, sc = Math.max(1, dist / (arm.L * 0.995)), lu = Lu * sc, lf = Lf * sc;
      const a = (lu * lu - lf * lf + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, lu * lu - a * a));
      _pole.set(-0.25, -1, s * 0.85); _pole.addScaledVector(_d0, -_pole.dot(_d0)).normalize();
      _e.copy(S).addScaledVector(_d0, a).addScaledVector(_pole, h);
      const f = 0.24; _A.lerpVectors(_e, S, f); _B.lerpVectors(_e, W, f);
      const lSA = S.distanceTo(_A), lAB = (_A.distanceTo(_e) + _e.distanceTo(_B)) * 0.92, lBW = _B.distanceTo(W), tot = lSA + lAB + lBW; const eE = (lSA + lAB * 0.5) / tot;
      const pos = arm.geo.attributes.position.array, nrm = arm.geo.attributes.normal.array;
      for (let i = 0; i <= RINGS; i++) {
        const t = i / RINGS, dd = t * tot; pathPoint(S, _A, _e, _B, W, lSA, lAB, lBW, dd, _P);
        pathPoint(S, _A, _e, _B, W, lSA, lAB, lBW, Math.max(0, dd - 0.01), _q0); pathPoint(S, _A, _e, _B, W, lSA, lAB, lBW, Math.min(tot, dd + 0.01), _q1); _T.subVectors(_q1, _q0).normalize();
        _top.set(0, 1, 0).addScaledVector(_T, -_T.y).normalize(); _side.crossVectors(_T, _top).normalize();
        const r = radius(t, eE);
        for (let j = 0; j <= SEG; j++) {
          const ang = (j / SEG - 0.5) * Math.PI * 2; const ca = Math.cos(ang), sa = Math.sin(ang);
          const ny = ca, nx = sa;   // u = 0.5 on top
          const o = (i * (SEG + 1) + j) * 3; const ry = r * 0.93, rx = r;
          pos[o] = _P.x + _top.x * ny * ry + _side.x * nx * rx; pos[o + 1] = _P.y + _top.y * ny * ry + _side.y * nx * rx; pos[o + 2] = _P.z + _top.z * ny * ry + _side.z * nx * rx;
          nrm[o] = _top.x * ny / 0.93 + _side.x * nx; nrm[o + 1] = _top.y * ny / 0.93 + _side.y * nx; nrm[o + 2] = _top.z * ny / 0.93 + _side.z * nx;
          const l = Math.hypot(nrm[o], nrm[o + 1], nrm[o + 2]) || 1; nrm[o] /= l; nrm[o + 1] /= l; nrm[o + 2] /= l;
        }
      }
      arm.geo.attributes.position.needsUpdate = true; arm.geo.attributes.normal.needsUpdate = true;
    };
    let lastSteer = null;
    const animate = (steerIn) => {
      spin.rotation.x = -steerIn * WHEEL.lock;
      if (lastSteer !== null && Math.abs(steerIn - lastSteer) < 2e-4) return; lastSteer = steerIn;
      steer.updateWorldMatrix(true, true); body.updateWorldMatrix(true, false); _inv.copy(body.matrixWorld).invert();
      arms.forEach((arm, k) => { _w.setFromMatrixPosition(wrists[k].matrixWorld).applyMatrix4(_inv); shapeArm(arm, shoulder[k], _w); });
    };
    animate(0);
    return { steer, spin, screen, screenTex, animate };
  }

  // live rear-view mirrors: a small render target per mirror, rendered alternately from the glass along the reflected eye ray.
  // Cheap by design: 128 px wide targets (160 on high), far plane 260 m, and while a mirror renders it hides the heavy
  // scenery (trees, crowd, grass cards / tufts, flags, parked vehicles, detail instancing) and every other car beyond 150 m.
  const MIRROR_HIDE = /^(trees|treesFar|treeStripsNear|treeShadows|grassCards|crowd|flags|tents|campervans|parkedCars|runoffLogos|perimeterPosts|tyreStacks|fencePosts|fenceRails|hoardingPosts|pit-tyre)$|tuft|detail|grass|^pit-fig-/i;
  function buildMirrors(glassMeshes, body, carGroup, swap) {
    const EYE = V(0.23, 0.842, 0);
    const mask = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 128, 64); x.fillStyle = '#fff'; roundRect(x, 2, 2, 124, 60, 22); x.fill(); return new THREE.CanvasTexture(c); })();
    const sides = [];
    for (const sgn of [-1, 1]) {
      const verts = [], nsum = new THREE.Vector3(); const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
      for (const o of glassMeshes) {
        const g = nonIndexed(o.geometry.clone()); g.applyMatrix4(o.matrixWorld); const p = g.attributes.position;
        for (let i = 0; i < p.count; i += 3) {
          a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2); if ((a.z + b.z + c.z) * sgn <= 0) continue;
          n.subVectors(c, b).cross(a.clone().sub(b)); const area = n.length(); n.normalize(); if (n.x > -0.3) n.negate(); if (n.x > -0.3) continue;   // rear-facing glass
          nsum.addScaledVector(n, area); verts.push(a.clone(), b.clone(), c.clone());
        }
      }
      if (verts.length < 3) return null;
      const nrm = nsum.normalize(); const ctr = new THREE.Vector3(); verts.forEach(v => ctr.add(v)); ctr.multiplyScalar(1 / verts.length);
      const up = V(0, 1, 0).addScaledVector(nrm, -nrm.y).normalize(); const rx = new THREE.Vector3().crossVectors(up, nrm).normalize();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const v of verts) { const d = v.clone().sub(ctr); const px = d.dot(rx), py = d.dot(up); x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
      const w = (x1 - x0) * 0.94, h = (y1 - y0) * 0.86; const cc = ctr.clone().addScaledVector(rx, (x0 + x1) / 2).addScaledVector(up, (y0 + y1) / 2).addScaledVector(nrm, 0.0025);
      const rt = new THREE.WebGLRenderTarget(128, 64, { encoding: THREE.sRGBEncoding, depthBuffer: true, stencilBuffer: false }); rt.texture.encoding = THREE.sRGBEncoding; rt.texture.generateMipmaps = false;
      rt.texture.repeat.x = -1; rt.texture.offset.x = 1;   // mirror image
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: rt.texture, alphaMap: mask, alphaTest: 0.5, toneMapped: false }));
      plane.position.copy(cc); plane.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(rx, up, nrm)); body.add(plane);
      // reflected eye ray -> camera direction (body space)
      const d = cc.clone().sub(EYE).normalize(); const refl = d.clone().addScaledVector(nrm, -2 * d.dot(nrm)).normalize();
      const cam = new THREE.PerspectiveCamera(16, w / h, 0.3, 260); cam.userData = { local: cc.clone(), dir: refl };
      cam.fov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(17)) / (w / h)) * 180 / Math.PI;   // ~34 deg horizontal
      cam.updateProjectionMatrix();
      sides.push({ rt, plane, cam, ar: w / h });
    }
    let frameN = 0, sideN = 0, hideList = null, carList = null, scanN = 0; const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _u = new THREE.Vector3();
    const hidden = [];
    const scan = (scene) => {
      hideList = []; carList = [];
      scene.traverse((o) => {
        if (o === scene) return;
        if (o.parent === scene && /^car-/.test(o.name || '')) { if (o !== carGroup) carList.push(o); return; }
        if (MIRROR_HIDE.test(o.name || '')) hideList.push(o);
      });
    };
    return {
      sides,
      update(renderer, scene, every) {
        frameN++; if (every > 1 && frameN % every) return;
        if (!hideList || ++scanN % 600 === 0) scan(scene);
        const sd = sides[(sideN++) % sides.length]; const cam = sd.cam;
        const W = every <= 1 ? 160 : 128, H = Math.max(40, Math.min(80, Math.round(W / sd.ar))); if (sd.rt.width !== W || sd.rt.height !== H) sd.rt.setSize(W, H);
        body.updateWorldMatrix(true, false);
        _p.copy(cam.userData.local).applyMatrix4(body.matrixWorld); _d.copy(cam.userData.dir).transformDirection(body.matrixWorld); _u.set(0, 1, 0).transformDirection(body.matrixWorld);
        cam.position.copy(_p); cam.up.copy(_u); cam.lookAt(_p.add(_d)); cam.updateMatrixWorld();
        hidden.length = 0;
        for (const o of hideList) if (o.visible) { o.visible = false; hidden.push(o); }
        const R2 = 150 * 150; for (const o of carList) if (o.visible && o.position.distanceToSquared(cam.position) > R2) { o.visible = false; hidden.push(o); }
        for (const s of sides) s.plane.visible = false;
        // the car's own bodywork renders from the lo LOD in the mirrors (~35k instead of ~130k triangles)
        if (swap) { for (const m of swap.hi) m.visible = false; for (const m of swap.lo) m.visible = true; }
        const prevRT = renderer.getRenderTarget(), au = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
        renderer.setRenderTarget(sd.rt); renderer.render(scene, cam); renderer.setRenderTarget(prevRT); renderer.shadowMap.autoUpdate = au;
        for (const s of sides) s.plane.visible = true;
        if (swap) { for (const m of swap.hi) m.visible = true; for (const m of swap.lo) m.visible = false; }
        for (const o of hidden) o.visible = true;
      },
    };
  }

  // ---------------------------------------------------------------- build
  function build(car, lod) {
    if (!CarGLB.ready) return EI.CarModel.build(car);
    const src = lod === 'lo' ? cache.lo : cache.hi; const meta = cache.meta || {};
    const code = (car.isPlayer && car.name ? car.name : (car.driver && car.driver.name) || car.team.short).replace(/^[A-Z]\. ?/, '').slice(0, 3).toUpperCase();
    const tex = composeLivery(car.team, car.num, code, lod === 'lo' ? 1024 : 4096);
    const paint = paintMaterial(tex);
    if (!helmetMats[car.team.id]) helmetMats[car.team.id] = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(car.team.accent), metalness: 0.1, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.7 });
    // underside: darker, less glossy carbon for the floor, plank surround, diffuser and gearbox
    if (!shared._floor) shared._floor = carbonMaterial({ dark: 0x010102, light: 0x07080a, clearcoat: 0.18, env: 0.22, ckMask: 0 });
    // per-car rain light (flashes while ERS deploys)
    const ledMat = new THREE.MeshStandardMaterial({ color: 0x220405, emissive: 0xff1a1a, emissiveIntensity: 0.6, roughness: 0.4 });
    const clone = src.clone(true);
    const g = new THREE.Group(); const body = new THREE.Group(); g.add(body);
    const helmet = new THREE.Group(); body.add(helmet);
    const WHEEL_R = meta.wheelR || 0.36, FA = meta.frontAxle || 1.75, RA = meta.rearAxle || -1.85;
    const hinge = meta.hinge || [-2.29, 0.98];
    const flapRoot = new THREE.Group(); flapRoot.position.set(hinge[0], hinge[1], 0); flapRoot.rotation.x = Math.PI; body.add(flapRoot);
    const flap = new THREE.Group(); flap.rotation.z = FLAP_CLOSED; flapRoot.add(flap);
    const flapA = new THREE.Group(); flapA.rotation.z = -FLAP_CLOSED; flap.add(flapA);
    const flapB = new THREE.Group(); flapB.rotation.x = Math.PI; flapA.add(flapB);
    const corners = ['fl', 'fr', 'rl', 'rr']; const spins = {}, pivots = {};
    for (const c of corners) {
      const pivot = new THREE.Group(); const spin = new THREE.Group(); pivot.add(spin); g.add(pivot); spins[c] = spin; pivots[c] = pivot;
      pivot.position.set(c[0] === 'f' ? FA : RA, WHEEL_R, (c[1] === 'l' ? -1 : 1) * 0.8);
    }
    clone.updateMatrixWorld(true);
    const meshes = []; clone.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const bodyList = [], helmetList = [], flapList = [], steerList = [], mirrorGlass = [], wheelLists = { fl: [], fr: [], rl: [], rr: [] };
    const detailed = lod !== 'lo' && car.isPlayer !== false;   // player cars get the full cockpit (wheel, gloves, live mirrors)
    for (const o of meshes) {
      const n = o.name || ''; const mname = o.material && o.material.name;
      // the cockpit surround is bare carbon (its paint/carbon split follows mesh faces, which reads as a saw-tooth edge)
      if (mname === 'paint') o.material = n.startsWith('body_cockpit') ? shared.carbon : paint; else if (mname === 'helmet') o.material = helmetMats[car.team.id];
      else if (mname === 'led') o.material = ledMat;
      else if (mname === 'carbon' && /^(floor_|body_gearbox|misc_rearled)/.test(n)) o.material = shared._floor;
      if (n.startsWith('driver_wheel')) { if (detailed) steerList.push(o); else bodyList.push(o); continue; }
      if (detailed && n === 'mirror_glass') mirrorGlass.push(o);
      const w = /^wheel_(fl|fr|rl|rr)_/.exec(n);
      if (w) { const c = w[1]; if (/tyre/.test(n) || pivots[c].userData.set !== true) { pivots[c].position.set(o.position.x, o.position.y, o.position.z); pivots[c].userData.set = /tyre/.test(n); } wheelLists[c].push(o); continue; }
      if (n.startsWith('drsflap_')) { flapList.push(o); continue; }
      // the belts stay with the body (visible from the cockpit, where the helmet group is hidden)
      if (n.startsWith('helmet_') || (n === 'driver_belts' && !detailed)) { helmetList.push(o); continue; }
      bodyList.push(o);
    }
    const world = (o) => o.matrixWorld;
    const hiBody = mergeMeshes(bodyList, world); for (const m of hiBody) body.add(m);
    for (const m of mergeMeshes(helmetList, world)) helmet.add(m);
    // flap: geometry is local to the hinge node, keep it local
    for (const m of mergeMeshes(flapList, (o) => new THREE.Matrix4())) flapB.add(m);
    // wheels: merge per corner, then seat each pivot so the tyre's lowest point is on the road (y = 0), less ~5 mm of tyre squash
    const tyreHalfW = {};
    for (const c of corners) {
      const pv = pivots[c].position; const inv = new THREE.Matrix4().makeTranslation(-pv.x, -pv.y, -pv.z);
      const bb = new THREE.Box3();
      for (const m of mergeMeshes(wheelLists[c], (o) => inv.clone().multiply(o.matrixWorld))) { spins[c].add(m); m.geometry.computeBoundingBox(); bb.union(m.geometry.boundingBox); if (/tyre/.test(m.name)) tyreHalfW[c] = Math.max(Math.abs(m.geometry.boundingBox.min.z), Math.abs(m.geometry.boundingBox.max.z)); }
      if (!bb.isEmpty()) pv.y = -bb.min.y - 0.005;
    }
    // ---- cockpit: detailed steering wheel with live display, gloved hands, sleeves, live mirrors (player cars only)
    let cockpit = null, screen = null, screenTex = null; const steer = new THREE.Group();
    if (detailed) {
      cockpit = buildCockpit(car, body); steer.add(cockpit.steer); body.add(steer); screen = cockpit.screen; screenTex = cockpit.screenTex;
      // lo-LOD copy of the bodywork, shown only while the mirrors render
      const loClone = cache.lo.clone(true); loClone.updateMatrixWorld(true); const loList = [];
      loClone.traverse((o) => {
        if (!o.isMesh) return; const n = o.name || ''; const mname = o.material && o.material.name;
        if (/^(wheel_|drsflap_|helmet_|driver_wheel|mirror_)/.test(n) || n === 'driver_belts') return;
        if (mname === 'paint') o.material = n.startsWith('body_cockpit') ? shared.carbon : paint; else if (mname === 'led') o.material = ledMat;
        else if (mname === 'carbon' && /^(floor_|body_gearbox|misc_rearled)/.test(n)) o.material = shared._floor;
        loList.push(o);
      });
      const loBody = mergeMeshes(loList, world); for (const m of loBody) { m.visible = false; m.castShadow = false; body.add(m); }
      if (mirrorGlass.length) { const mir = buildMirrors(mirrorGlass, body, g, { hi: hiBody, lo: loBody }); if (mir) screen.userData.mirrors = mir; }
    }
    // brake glow: hot discs show through the gap between the rim lip and the wheel cover (outer face) and on the inner face
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff6a1c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    let heat = 0, lastT = 0, ledOn = -1;
    const animate = (steerIn, helmetYaw) => {
      if (cockpit) cockpit.animate(steerIn);
      if (helmet && helmetYaw != null) helmet.rotation.y = helmetYaw;
      const now = performance.now() * 0.001; const dt = Math.min(0.1, Math.max(0, now - (lastT || now))); lastT = now;
      // discs heat with brake pressure x speed, cool over ~1.5 s
      const v = Math.abs(car.v || 0), target = (car.brake || 0) * Math.min(1, Math.max(0, (v - 12) / 45));
      heat += (target - heat) * (1 - Math.exp(-dt / (target > heat ? 0.35 : 1.4)));
      const op = Math.min(1, heat * 1.15); if (Math.abs(op - glowMat.opacity) > 0.01) { glowMat.opacity = op; glowMat.visible = op > 0.02; }
      // rain light: steady, flashing at 4 Hz while ERS deploys
      const on = car.ersActive ? ((now * 8) | 0) % 2 : 2; if (on !== ledOn) { ledOn = on; ledMat.emissiveIntensity = on === 2 ? 0.6 : on ? 3.2 : 0.15; }
    };
    glowMat.visible = false;
    // tyre sidewalls (compound stripe + lettering) on both faces, sitting just proud of each tyre's own width; brake glow rings
    const ringMat = new THREE.MeshStandardMaterial({ map: tyreWallTexture(car.tyre), transparent: false, alphaTest: 0.4, roughness: 0.75, envMapIntensity: 0.3, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 });
    const ringGeos = {}; const glowGeos = {};
    for (const c of corners) {
      const hw = (tyreHalfW[c] || 0.176) + 0.003; const key = hw.toFixed(3);
      if (!ringGeos[key]) {
        const r1 = new THREE.RingGeometry(0.27, 0.335, 64, 1); r1.translate(0, 0, hw); const r2 = new THREE.RingGeometry(0.27, 0.335, 64, 1); r2.rotateY(Math.PI); r2.translate(0, 0, -hw);
        ringGeos[key] = mergeMeshes([new THREE.Mesh(r1, ringMat), new THREE.Mesh(r2, ringMat)], () => new THREE.Matrix4())[0].geometry;
        const g1 = new THREE.RingGeometry(0.232, 0.273, 48, 1); g1.translate(0, 0, hw + 0.0015); const g2 = new THREE.RingGeometry(0.1, 0.165, 40, 1); g2.translate(0, 0, -hw + 0.04);
        const g4 = g1.clone(); g4.rotateY(Math.PI); const g5 = g2.clone(); g5.rotateY(Math.PI);
        glowGeos[key] = mergeGeos([{ geo: g1 }, { geo: g2 }, { geo: g4 }, { geo: g5 }]);
      }
      spins[c].add(new THREE.Mesh(ringGeos[key], ringMat));
      const gl = new THREE.Mesh(glowGeos[key], glowMat); gl.renderOrder = 2; gl.frustumCulled = false; spins[c].add(gl);
    }
    const wheels = corners.map((c) => spins[c]); const frontPivots = [pivots.fl, pivots.fr];
    // contact shadow: soft footprint + tyre contact patches, alpha 0 at every edge, just above the road
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(SHADOW.w, SHADOW.h), new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    blob.rotation.x = -Math.PI / 2; blob.position.set(SHADOW.cx, 0.02, 0); blob.name = 'contactShadow'; blob.renderOrder = -1; g.add(blob);
    return { group: g, body, wheels, frontPivots, flap, helmet, bodyMat: paint, flapClosed: FLAP_CLOSED, flapOpen: FLAP_OPEN, lod: lod || 'hi', steer, animate, screen, screenTex };
  }

  EI.CarGLB = CarGLB;
})();
