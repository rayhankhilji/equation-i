// Equation I - GLB car model loader (drop-in replacement for EI.CarModel.build)
// Loads assets/models/ei-car-{hi,lo}.glb (x forward, y up, z right, metres, ground at y = 0, axles at
// x = +1.75 / -1.85) plus the material-ID / AO atlases, and composes a per-team livery texture at runtime.
// build(car, lod) returns the EI.CarModel.build(car) shape { group, body, wheels, frontPivots, flap, helmet, bodyMat } plus pose()
// (wheel spin / steer, DRS flap and body roll are animated in the vertex shader of a per-car LOD material, see template()), the mid
// and far LOD meshes (one draw call each) and the shadow proxy geometry. The geometry of every LOD is merged once and shared by all
// cars; bots start on a 512 livery that is upgraded in the background (pump), a slice per frame.
// The flap pivots about its trailing edge (meta.hinge, where the endplate tips meet it) and the leading edge lifts on open:
// rotation.z = 0.5 closed, -0.46 open, i.e. about 55 degrees of travel, so a clear slot of daylight opens between the main
// plane and the flap from the chase camera; flapClosed / flapOpen are exposed on the returned object.
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
  const ASSET_V = 'w9';   // bump whenever a file in assets/models changes (the GLB, atlases and bins must stay in step; a stale cached GLB with a new id atlas paints wrong colours)
  const FLAP_CLOSED = 0.5, FLAP_OPEN = FLAP_CLOSED - 55 * Math.PI / 180;   // ~55 degrees of DRS travel
  const cache = { hi: null, lo: null, meta: null, idImg: null, aoImg: null, lods: null };
  const texCache = {}, helmetMats = {}, shared = {}, roleMaps = {};
  let loading = null;
  const CarGLB = { ready: false, preload, build, composeLivery, FLAP_CLOSED, FLAP_OPEN, cache };

  // ---------------------------------------------------------------- loading
  // Network-robust fetch of one model file. A single dropped or refused request used to put the whole session on the procedural
  // car (flat colours, no livery: the user's "quality looks shit" report on the live build). raw.githack.com answers every
  // .glb / .png / .bin with a 301 to raw.githubusercontent.com, which drops or rate-limits (429) requests under load, so: retry
  // with back-off, and when the page is served from githack try the same commit on jsDelivr too. The body is checked
  // (magic bytes), so an error page served with 200 counts as a failure. Resolves to an ArrayBuffer, or null after the last try.
  const MAGIC = { glb: 'glTF', png: '\x89PNG', bin: 'EI' };
  function mirrorBase() {
    try { const m = /(^|\.)githack\.com$/.test(location.hostname) && /^\/([^/]+)\/([^/]+)\/([^/]+)\/(.*\/)?[^/]*$/.exec(location.pathname); return m ? 'https://cdn.jsdelivr.net/gh/' + m[1] + '/' + m[2] + '@' + m[3] + '/' + (m[4] || '') + BASE : null; } catch (e) { return null; }
  }
  function fetchModelFile(url, tries) {
    const ext = (/\.(\w+)(\?|$)/.exec(url) || [])[1], magic = MAGIC[ext] || '';
    const mb = /^(https?:)?\/\//.test(url) ? null : mirrorBase(), srcs = [url, url, mb && mb + url.slice(BASE.length), url, mb && mb + url.slice(BASE.length)].filter(Boolean).slice(0, tries || 5);
    const wait = [0, 800, 1500, 3000, 5000];
    const attempt = (k) => new Promise((r) => setTimeout(r, wait[k] || 0)).then(() => fetch(srcs[k], { cache: k ? 'no-cache' : 'default' }))
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .then((b) => { const u = new Uint8Array(b, 0, Math.min(4, b.byteLength)); for (let i = 0; i < magic.length; i++) if (u[i] !== magic.charCodeAt(i)) throw new Error('not a ' + ext + ' file'); return b; })
      .catch((e) => { console.warn('EI.CarGLB: ' + srcs[k] + ' failed (' + (e && e.message ? e.message : e) + ')' + (k + 1 < srcs.length ? ', retrying' : '')); return k + 1 < srcs.length ? attempt(k + 1) : null; });
    return attempt(0);
  }
  CarGLB.fetchModelFile = fetchModelFile;
  let retries = 0;
  function preload() {
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      if (!THREE.GLTFLoader) return reject(new Error('GLTFLoader not available'));
      const loader = new THREE.GLTFLoader();
      const need = (f) => fetchModelFile(BASE + f + '?v=' + ASSET_V).then((b) => b || Promise.reject(new Error('failed to load ' + f)));
      const glb = (f) => need(f).then((b) => new Promise((res, rej) => loader.parse(b, '', res, rej)));
      // the atlases come in as bytes too (a blob URL: same origin, so the canvases they are drawn into stay readable)
      const img = (f) => need(f).then((b) => new Promise((res, rej) => { const u = URL.createObjectURL(new Blob([b], { type: 'image/png' })); const im = new Image(); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('failed to decode ' + f)); }; im.src = u; }));
      // the mid / far / vfar LOD index lists (ei-car-lods.bin, see lodSubset): optional, the vertex-clustered LODs stand in without it
      const bin = (f) => fetchModelFile(BASE + f + '?v=' + ASSET_V, 3);
      const lods = CarGLB.lodsUrl ? fetch(CarGLB.lodsUrl).then((r) => r.ok ? r.arrayBuffer() : null).catch(() => null) : bin('ei-car-lods.bin');
      // the lo car is rebuilt from the hi GLB (ei-car-lohi.bin, see loFromHi); ei-car-lo.glb is only fetched when that is not possible
      Promise.all([glb('ei-car-hi.glb'), CarGLB.noLoHi ? null : bin('ei-car-lohi.bin'), img('ei-car-id.png'), img('ei-car-ao.png'), lods]).then(([hi, loHiBuf, idImg, aoImg, lodBuf]) => {
        const lo = loHiBuf && loFromHi(hi.scene, loHiBuf);
        return lo ? [hi, { scene: lo }, idImg, aoImg, lodBuf] : glb('ei-car-lo.glb').then((l) => [hi, l, idImg, aoImg, lodBuf]);
      }).then(([hi, lo, idImg, aoImg, lodBuf]) => {
        cache.hi = hi.scene; cache.lo = lo.scene; cache.idImg = idImg; cache.aoImg = aoImg; cache.lods = lodBuf;
        cache.meta = hi.scene.userData && hi.scene.userData.anchors ? hi.scene.userData : (lo.scene.userData || {});
        for (const s of [cache.hi, cache.lo]) prepare(s);
        CarGLB.ready = true; resolve(CarGLB);
      }).catch((e) => {
        console.warn('EI.CarGLB: GLB car unavailable, using the procedural car.', e && e.message ? e.message : e); reject(e);
        // keep trying in the background (the menu is up by now): once it loads, the next race is built with the real car
        if (retries++ < 4) setTimeout(() => { loading = null; preload().catch(() => { }); }, 10000 * retries);
      });
    });
    return loading;
  }

  // The lo car (bots near the camera, the player's own car on Low, the mirrors) = the hi GLB's meshes, each simplified offline by edge
  // collapse with UV seams kept and UVs weighted (tools/carlods/genlo.js -> ei-car-lohi.bin: per hi mesh an index list into its
  // vertices), so the livery atlas, laid out on the hi car, maps onto the lo car without the torn / saw-toothed edges the separately
  // decimated ei-car-lo.glb showed on its nose and wings. Same meshes, names, materials and triangle counts as ei-car-lo.glb (~44k).
  // Returns a copy of the hi scene with compacted lo geometry, or null if the file does not match the hi GLB (ei-car-lo.glb then).
  function loChecksum(meshes) { let s = 0, k = 0; for (const o of meshes) { const P = o.geometry.attributes.position.array; for (let i = 0; i < P.length; i += 3) { s += (P[i] + P[i + 1] * 3 + P[i + 2] * 7) * ((k % 13) + 1); k++; } } return s; }
  function loFromHi(hi, buf) {
    if (!buf || buf.byteLength < 16) return null; const dv = new DataView(buf);
    if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'EIH1') return null;
    const hm = []; hi.traverse((o) => { if (o.isMesh) hm.push(o); });
    const sum = dv.getFloat64(8, true);
    if (dv.getUint32(4, true) !== hm.length || Math.abs(loChecksum(hm) - sum) > 1e-6 * Math.abs(sum) + 1e-3) { console.warn('EI.CarGLB: ei-car-lohi.bin does not match the hi car, using ei-car-lo.glb'); return null; }
    const lo = hi.clone(), lm = []; lo.traverse((o) => { if (o.isMesh) lm.push(o); });
    let o = 16;
    for (const m of lm) {
      const n = dv.getUint32(o, true); o += 4; const ix = new Uint16Array(buf, o, n); o += Math.ceil(n * 2 / 4) * 4;
      const src = m.geometry, nv = src.attributes.position.count, map = new Int32Array(nv).fill(-1); let k = 0;
      const idx = new Uint16Array(n); for (let i = 0; i < n; i++) { const v = ix[i]; if (map[v] < 0) map[v] = k++; idx[i] = map[v]; }
      const g = new THREE.BufferGeometry();
      for (const name of Object.keys(src.attributes)) { const a = src.attributes[name], s = a.itemSize, arr = new Float32Array(k * s), get = [a.getX, a.getY, a.getZ, a.getW]; for (let v = 0; v < nv; v++) { const r = map[v]; if (r >= 0) for (let q = 0; q < s; q++) arr[r * s + q] = get[q].call(a, v); } g.setAttribute(name, new THREE.BufferAttribute(arr, s)); }
      g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere(); g.computeBoundingBox(); m.geometry = g;
    }
    return lo;
  }
  CarGLB.loFromHi = loFromHi; CarGLB.loChecksum = loChecksum;

  // ---------------------------------------------------------------- procedural material textures
  // 2x2 twill carbon weave, 256 px tile = 16 tows. R: albedo (0..1 across the dark->light carbon range), G: sheen layer
  // (the lighter, glossier tow tops that catch the light), B: tow-gap mask. Sampled triplanar in object space so the weave
  // has a constant real-world size (4 mm tows) on every part regardless of its UVs.
  function weaveTexture() {
    if (shared._weave) return shared._weave;
    const N = 256, T = 16; const c = document.createElement('canvas'); c.width = c.height = N; const ctx = c.getContext('2d', { willReadFrequently: true }); const img = ctx.createImageData(N, N); const d = img.data;
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
          'wvCk = ckMask * (1.0 - smoothstep(0.24, 0.31, abs(vWvPos.z))) * smoothstep(-0.06, 0.06, vWvPos.x) * (1.0 - smoothstep(0.93, 0.955, vWvPos.x)) * smoothstep(0.36, 0.46, vWvPos.y);',
          'diffuseColor.rgb *= mix(weaveDark, weaveLight, mix(wvSample.r * wvSample.r, 0.35 + 0.3 * wvSample.r, wvCk)) * (1.0 - 0.45 * wvCk);'].join('\n'))
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(clamp(roughnessFactor * (1.25 - 0.6 * wvSample.g), 0.24, 1.0), 0.78, wvCk);')
        .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef CLEARCOAT\nmaterial.clearcoat *= 1.0 - 0.85 * wvCk;\n#endif');
    };
    m.customProgramCacheKey = () => 'ei-carbon';
    return m;
  }
  // tyre sidewall branding (Pirelli F1 style): two P ZERO marks in the compound colour and two PIRELLI wordmarks (the long-P bar
  // over the word) in white, compound-colour stripe arcs between them near the rim; painted in polar form for RingGeometry UVs
  // RingGeometry(0.27, 0.335) UVs are planar, so the canvas is painted in polar form: R = 0.335 m
  function tyreWallTexture(tyre) {
    const key = '_tyre_' + tyre.name; if (shared[key]) return shared[key];
    const S = 1024, c = document.createElement('canvas'); c.width = c.height = S; const ctx = c.getContext('2d'); const R = S / 2, M = R / 0.335;
    ctx.translate(R, R);
    const col = tyre.color, rt = 0.3015 * M;
    // moulded rim bead line + the compound stripe in four arcs between the wordmarks
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 0.0015 * M; ctx.beginPath(); ctx.arc(0, 0, 0.2755 * M, 0, 6.283); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 0.0062 * M; ctx.lineCap = 'round';
    for (let k = 0; k < 4; k++) { const m = k * Math.PI / 2; ctx.beginPath(); ctx.arc(0, 0, 0.3255 * M, m - 0.36, m + 0.36); ctx.stroke(); }
    // letters set along the arc, centred on angle a0; returns [start, end] angles
    const arcText = (w, a0, fs, fill, font, track) => {
      ctx.font = font.replace('%', Math.round(fs)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = fill;
      const ws = w.split('').map(ch => ch === ' ' ? fs * 0.32 : ctx.measureText(ch).width + fs * track); const tot = ws.reduce((x, y) => x + y, 0);
      let a = a0 - tot / rt / 2; const s0 = a;
      w.split('').forEach((ch, i) => { const da = ws[i] / rt; if (ch !== ' ') { ctx.save(); ctx.rotate(a + da / 2); ctx.translate(0, -rt); ctx.scale(1, 1.08); ctx.fillText(ch, 0, 0); ctx.restore(); } a += da; });
      return [s0, a];
    };
    for (let k = 0; k < 4; k++) {
      const a0 = k * Math.PI / 2 + Math.PI / 4 - Math.PI / 2;
      if (k % 2 === 0) arcText('P ZERO', a0, 0.044 * M, col, 'italic 900 %px "Titillium Web", "Arial Black", sans-serif', 0.02);
      else {
        const fs = 0.037 * M; const [s0, s1] = arcText('PIRELLI', a0, fs, '#f4f4f4', '900 %px "Titillium Web", "Arial Black", sans-serif', 0.06);
        // the long P: its bowl runs on as a bar over the whole word
        ctx.strokeStyle = '#f4f4f4'; ctx.lineCap = 'butt'; ctx.lineWidth = fs * 0.13; ctx.beginPath(); ctx.arc(0, 0, rt + fs * 0.43, s0 + 0.004 - Math.PI / 2, s1 - 0.004 - Math.PI / 2); ctx.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8; shared[key] = tex; return tex;
  }

  // clear-coated metallic paint: satin base with a procedural metal-flake normal perturbation (object-space hash cells, ~3 mm,
  // faded out once a flake is smaller than a pixel so it sparkles close up without shimmering at distance) under a smooth lacquer
  // Car paint = matte-ish base coat under a glossy clear coat. The base layer's own blurry sky reflection (roughness ~0.42) is what
  // greyed dark liveries (a uniform veil over black / navy / plum), so it is cut hard on dark albedo while the sharp clear-coat
  // reflections stay (that is the gloss): kB = base-layer env factor, kC = clear-coat env factor, both from the albedo luminance.
  // CarGLB.PAINT_SPEC = [kB dark, kB light, kC dark, kC light, ground] (tunable before the first car is built).
  CarGLB.PAINT_SPEC = [0.22, 0.85, 0.6, 1.0, 0.2];   // + [4] = what a fully downward reflection keeps of the sky (the 'ground')
  const paintSpecGLSL = (extra) => { const k = CarGLB.PAINT_SPEC.map(v => (+v).toFixed(3));
    // + ground occlusion: the environment is the sky (bright below the horizon too), but a reflection that points down sees the dark
    //   track. From the raised chase / TV cameras the car's flanks reflect downward rays, which is what washed dark cars out grey.
    return '#include <lights_fragment_maps>\n#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )\n{ float pL = smoothstep(0.008, 0.2, dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))); float kB = mix(' + k[0] + ', ' + k[1] + ', pL); float kC = mix(' + k[2] + ', ' + k[3] + ', pL); ' + extra +
      ' vec3 gR = inverseTransformDirection(reflect(-geometry.viewDir, geometry.normal), viewMatrix); float gO = mix(' + k[4] + ', 1.0, smoothstep(-0.3, 0.06, gR.y)); radiance *= kB * gO;\n#ifdef CLEARCOAT\nclearcoatRadiance *= kC * gO;\n#endif\n}\n#endif'; };
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
        .replace('#include <map_fragment>', '#include <map_fragment>\nfloat pCk = (1.0 - smoothstep(0.215, 0.25, abs(vFlkPos.z))) * smoothstep(-0.06, 0.06, vFlkPos.x) * (1.0 - smoothstep(0.93, 0.955, vFlkPos.x)) * smoothstep(0.4, 0.5, vFlkPos.y);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012, 0.012, 0.014), pCk);')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.8, pCk);')
        .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.clearcoat *= 1.0 - 0.85 * pCk;')
        // dark paint: the sky reflection (env + clear coat) is held down so plum / cocoa / anthracite stay dark at grazing angles
        .replace('#include <lights_fragment_maps>', paintSpecGLSL(''));
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
  // material-ID colour class -> colour role per atlas part. The painted roles (body .. fin) take each team's part colours
  // (EI.LIVERIES.partColours: body, wings, endplates, halo, mirrors, fins); 'carbon' / 'foam' stay bare.
  const PART_ROLES = {
    body: { red: 'body', yellow: 'body', orange: 'body', green: 'halo', blue: 'carbon' },
    front_wing: { red: 'fwMain', blue: 'fwFlap', yellow: 'fwTip', green: 'carbon', orange: 'fwEnd' },   // main plane (carbon unless a design paints it), flaps, endplates
    rear_wing: { green: 'rwMain', orange: 'rwFlap', blue: 'rwEnd', yellow: 'rwEnd', red: 'rwEnd' },
    mirrors: { red: 'mirror', yellow: 'mirror', orange: 'mirror', green: 'mirror', blue: 'mirror' },
    winglets: { blue: 'fin', green: 'fin', red: 'carbon', orange: 'carbon' },
    cockpit_foam: { green: 'foam' },
  };
  const ROLE_NAMES = ['none', 'body', 'fwFlap', 'fwEnd', 'fwTip', 'rwMain', 'rwEnd', 'rwFlap', 'halo', 'mirror', 'fin', 'fwMain', 'carbon', 'foam'];
  const PAINT_ROLES = 11;   // roles 1..11 are painted (decals land on them); fwMain only through a design's frontWing(L)
  const PAINTED = (o) => o.isMesh && o.material && (o.material.name === 'paint' || o.name === 'halo_main');   // the halo is livery-painted too
  function hexRgb(h) { const c = new THREE.Color(h); return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)]; }
  function classify(r, g, b) {
    if (r < 60 && g < 60 && b < 60) return 'none';
    if (b > 150) return 'blue'; if (g > 150 && r < 80) return 'green'; if (r > 150 && g > 150) return 'yellow';
    if (r > 150 && g > 40 && g < 140) return 'orange'; if (r > 150) return 'red'; return 'none';
  }
  // ---------------------------------------------------------------- projected decals
  // The livery atlas (repacked by tools/carlods/uvpack.py: islands un-squashed, the bodywork at ~2 texels/cm at 1024, gutters role-
  // filled; meta.roleAtlas) still folds over the sidepod and engine-cover tops, so drawing straight into UV space would distort lettering. Instead the decals are designed in orthographic
  // car views (side / top, in metres) and projected: a texel -> body-space position map is rasterised once per resolution from
  // the 'paint' meshes, and every painted texel samples the view canvas that faces it (with a mip chain, so the squashed side
  // islands do not alias). Car frame: x forward (front axle +1.75, rear -1.85), y up, z right.
  // posMap: pos = Int16 x,y,z in units of 1/8000 m, cls = 1 left-facing, 2 right-facing, 3 up-facing, 4 other.
  const posMaps = {};
  const PQ = 8000;
  function posMap(M) {
    if (posMaps[M] !== undefined) return posMaps[M];
    const meshes = []; if (!cache.hi) return null;
    cache.hi.updateMatrixWorld(true);
    cache.hi.traverse((o) => { if (PAINTED(o) && o.geometry && o.geometry.attributes.uv) meshes.push(o); });
    if (!meshes.length) return (posMaps[M] = null);
    const pos = new Int16Array(M * M * 3), cls = new Uint8Array(M * M), alt = new Uint8Array(M * M), wal = new Uint8Array(M * M);
    const v = new THREE.Vector3(), nm = new THREE.Matrix3();
    for (const o of meshes) {
      const g = o.geometry, pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv, ix = g.index; const n = pa.count;
      nm.getNormalMatrix(o.matrixWorld); const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
        if (na) { v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); N[i * 3] = v.x; N[i * 3 + 1] = v.y; N[i * 3 + 2] = v.z; }
        U[i * 2] = ua.getX(i) * M; U[i * 2 + 1] = ua.getY(i) * M;
      }
      const tris = ix ? ix.count / 3 : n / 3;
      for (let t = 0; t < tris; t++) {
        const a = ix ? ix.getX(t * 3) : t * 3, b = ix ? ix.getX(t * 3 + 1) : t * 3 + 1, c = ix ? ix.getX(t * 3 + 2) : t * 3 + 2;
        const ax = U[a * 2], ay = U[a * 2 + 1], bx = U[b * 2], by = U[b * 2 + 1], cx = U[c * 2], cy = U[c * 2 + 1];
        const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); if (Math.abs(area) < 1e-9) continue;
        let fnx = 0, fny = 0, fnz = 0;
        if (!na) { const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], wx = P[c * 3] - P[a * 3], wy = P[c * 3 + 1] - P[a * 3 + 1], wz = P[c * 3 + 2] - P[a * 3 + 2]; fnx = uy * wz - uz * wy; fny = uz * wx - ux * wz; fnz = ux * wy - uy * wx; }
        const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(M - 1, Math.ceil(Math.max(ax, bx, cx))), y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(M - 1, Math.ceil(Math.max(ay, by, cy)));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const px = x + 0.5, py = y + 0.5;
          const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area, w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area, w2 = 1 - w0 - w1;
          if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
          const k = y * M + x, k3 = k * 3;
          for (let q = 0; q < 3; q++) pos[k3 + q] = Math.round((P[a * 3 + q] * w0 + P[b * 3 + q] * w1 + P[c * 3 + q] * w2) * PQ);
          let nx = fnx, ny = fny, nz = fnz; if (na) { nx = N[a * 3] * w0 + N[b * 3] * w1 + N[c * 3] * w2; ny = N[a * 3 + 1] * w0 + N[b * 3 + 1] * w1 + N[c * 3 + 1] * w2; nz = N[a * 3 + 2] * w0 + N[b * 3 + 2] * w1 + N[c * 3 + 2] * w2; }
          const az = Math.abs(nz), ay2 = Math.abs(ny), ax2 = Math.abs(nx);
          const pz = P[a * 3 + 2] * w0 + P[b * 3 + 2] * w1 + P[c * 3 + 2] * w2;
          cls[k] = (az >= ay2 * 0.9 && az >= ax2) ? (nz < 0 ? 1 : 2) : (ny > 0 && ay2 >= ax2) ? 3 : (pz < 0 ? 4 : 5);
          // soft side / top split: near the class boundary (+-~17 degrees of normal tilt) the texel also takes the other view, weighted
          // (wal / 255), so colour blocks that change between the side and the top design meet in a smooth blend, not a texel staircase
          if (ny > 0) { const sv = Math.max(az / 0.9, ax2), tq = ay2 / (ay2 + sv + 1e-9), wt = Math.min(1, Math.max(0, (tq - 0.35) / 0.3)), wT = wt * wt * (3 - 2 * wt);
            const side = az >= ax2 ? (nz < 0 ? 1 : 2) : (pz < 0 ? 4 : 5), wa = cls[k] === 3 ? 1 - wT : wT;
            if (wa > 0.02) { alt[k] = cls[k] === 3 ? side : 3; wal[k] = Math.round(Math.min(0.5, wa) * 255); } else { alt[k] = 0; wal[k] = 0; } } else { alt[k] = 0; wal[k] = 0; }
        }
      }
    }
    // dilate the map so island edges carry positions too: bilinear filtering and the first mip levels reach a few texels past a seam,
    // and with only the base colour there a decal crossing a seam (nose, engine cover) showed a thin line of it from mid range
    // (the repacked atlas keeps >= 6 texels of gutter at 768, roles filled)
    for (let it = 0, nIt = cache.meta && cache.meta.roleAtlas ? 4 : 2; it < nIt; it++) {
      const src = cls.slice();
      for (let y = 1; y < M - 1; y++) for (let x = 1; x < M - 1; x++) {
        const k = y * M + x; if (src[k]) continue;
        const nb = src[k - 1] ? k - 1 : src[k + 1] ? k + 1 : src[k - M] ? k - M : src[k + M] ? k + M : -1; if (nb < 0) continue;
        cls[k] = src[nb]; alt[k] = alt[nb]; wal[k] = wal[nb]; pos[k * 3] = pos[nb * 3]; pos[k * 3 + 1] = pos[nb * 3 + 1]; pos[k * 3 + 2] = pos[nb * 3 + 2];
      }
    }
    let n = 0; for (let k = 0; k < M * M; k++) if (cls[k]) n++;
    const idx = new Int32Array(n); n = 0; for (let k = 0; k < M * M; k++) if (cls[k]) idx[n++] = k;
    return (posMaps[M] = { M, pos, cls, alt, wal, idx });
  }
  // posMap cell index: the painted texels bucketed by body position (0.1 m cells), so a view whose content is small (a number, a
  // flag) only visits the texels near it. CSR arrays per map resolution, built on first use.
  const CELL = 0.1, CX0 = -3.4, CY0 = -0.3, CZ0 = -1.3, NCX = 68, NCY = 17, NCZ = 26;
  function cellIndex(pm) {
    if (pm.cells) return pm.cells;
    const { pos, idx } = pm; const inv = 1 / PQ; const n = idx.length; const cellOf = new Int32Array(n); const cnt = new Int32Array(NCX * NCY * NCZ + 1);
    const cl = (v, v0, nc) => Math.max(0, Math.min(nc - 1, Math.floor((v - v0) / CELL)));
    for (let i = 0; i < n; i++) { const k = idx[i]; const ci = (cl(pos[k * 3] * inv, CX0, NCX) * NCY + cl(pos[k * 3 + 1] * inv, CY0, NCY)) * NCZ + cl(pos[k * 3 + 2] * inv, CZ0, NCZ); cellOf[i] = ci; cnt[ci + 1]++; }
    for (let i = 0; i < NCX * NCY * NCZ; i++) cnt[i + 1] += cnt[i];
    const list = new Int32Array(n); const fill = cnt.slice(0, NCX * NCY * NCZ); for (let i = 0; i < n; i++) list[fill[cellOf[i]]++] = idx[i];
    return (pm.cells = { start: cnt, list, mark: new Uint8Array(pm.M * pm.M) });
  }
  // the content box of a view in body metres -> the cell ranges it can reach (kind 'L' left side [-x, -y], 'R' right side [x, -y],
  // 'T' top [z, -x]); views without a kind reach everything
  function* candidatesGen(pm, views) {
    const C = cellIndex(pm); const out = []; const cl = (v, v0, nc) => Math.max(0, Math.min(nc - 1, Math.floor((v - v0) / CELL)));
    if (views.some(v => v.bb && v.pass !== 'car')) return pm.idx;   // full-car passes: every texel anyway
    let full = false; const boxes = [];
    for (const vw of views) {
      if (!vw.bb) continue; if (!vw.kind) { full = true; break; }
      const m = 0.06, X0 = vw.x0 + vw.bb[0] / vw.ppm0 - m, X1 = vw.x0 + vw.bb[2] / vw.ppm0 + m, Y0 = vw.y0 + vw.bb[1] / vw.ppm0 - m, Y1 = vw.y0 + vw.bb[3] / vw.ppm0 + m;
      if (vw.kind === 'L') boxes.push([-X1, -X0, -Y1, -Y0, -9, 9]); else if (vw.kind === 'R') boxes.push([X0, X1, -Y1, -Y0, -9, 9]); else boxes.push([-Y1, -Y0, -9, 9, X0, X1]);
    }
    if (full) return pm.idx;
    const mark = C.mark; let steps = 0;
    for (const b of boxes) {
      const ix0 = cl(b[0], CX0, NCX), ix1 = cl(b[1], CX0, NCX), iy0 = cl(b[2], CY0, NCY), iy1 = cl(b[3], CY0, NCY), iz0 = cl(b[4], CZ0, NCZ), iz1 = cl(b[5], CZ0, NCZ);
      for (let ix = ix0; ix <= ix1; ix++) { for (let iy = iy0; iy <= iy1; iy++) for (let iz = iz0; iz <= iz1; iz++) {
        const ci = (ix * NCY + iy) * NCZ + iz; for (let j = C.start[ci], e = C.start[ci + 1]; j < e; j++) { const k = C.list[j]; if (!mark[k]) { mark[k] = 1; out.push(k); } } }
        if ((++steps & 7) === 7) yield; }
    }
    for (const k of out) mark[k] = 0;
    return out;
  }
  // views: [{ cls, map: (x, y, z) => [X, Y] (metres, canvas axes: Y down), x0, y0, x1, y1 (canvas rect in metres), draw(g) }]
  // draw() paints in metres (the transform is set up). Decals land only on paint texels (roles primary / secondary / accent).
  function halveLevel(lv) {
    const w = Math.max(1, lv.w >> 1), h = Math.max(1, lv.h >> 1), s = lv.d, d = new Uint8ClampedArray(w * h * 4), W = lv.w;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let q = 0; q < 4; q++) { const sx = Math.min(lv.w - 1, x * 2 + (q & 1)), sy = Math.min(lv.h - 1, y * 2 + (q >> 1)); const o = (sy * W + sx) * 4, al = s[o + 3]; r += s[o] * al; g += s[o + 1] * al; b += s[o + 2] * al; a += al; }
      const o = (y * w + x) * 4; if (a > 0) { d[o] = r / a; d[o + 1] = g / a; d[o + 2] = b / a; d[o + 3] = a / 4; }
    }
    return { w, h, d };
  }
  // a generator, so a livery can be composed a slice at a time (see pump); projectDecals() runs it to completion
  function* projectDecalsGen(ctx, S, views, roleMap) {
    const M = Math.min(S, 2048); const pm = posMap(M); if (!pm) return false;
    const { pos, cls } = pm; const sc = M / S; const inv = 1 / PQ;
    for (const vw of views) {
      const ppm = vw.ppm || M * 0.22; const W = Math.ceil((vw.x1 - vw.x0) * ppm), H = Math.ceil((vw.y1 - vw.y0) * ppm);
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d', { willReadFrequently: true });
      g.setTransform(ppm, 0, 0, ppm, -vw.x0 * ppm, -vw.y0 * ppm);
      if (vw.pass && EI.LIVERIES && EI.LIVERIES.setPass) EI.LIVERIES.setPass(vw.pass);
      try { vw.draw(g, ppm); } finally { if (vw.pass && EI.LIVERIES && EI.LIVERIES.setPass) EI.LIVERIES.setPass('all'); }
      g.setTransform(1, 0, 0, 1, 0, 0);
      vw.lv = [{ w: W, h: H, d: g.getImageData(0, 0, W, H).data }]; vw.ppm0 = ppm;
      yield;
      // content bounds (px), scanned in row slices; an empty view (common in the per-car pass) stops here
      const l0 = vw.lv[0]; let bx0 = l0.w, by0 = l0.h, bx1 = -1, by1 = -1;
      for (let y = 0; y < l0.h; y++) {
        for (let x = 0, o = y * l0.w * 4 + 3; x < l0.w; x++, o += 4) if (l0.d[o]) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
        if ((y & 127) === 127) yield;
      }
      vw.bb = bx1 < 0 ? null : [bx0 - 3, by0 - 3, bx1 + 3, by1 + 3];
      if (!vw.bb) { vw.lv = null; continue; }
      // mip chain by 2x2 box filtering in JS (premultiplied), so no canvas has to be read back per level; a level per step
      let cur = vw.lv[0]; while (cur.w > 64 && cur.h > 16 && vw.lv.length < 6) { cur = halveLevel(cur); vw.lv.push(cur); yield; }
    }
    const byCls = [[], [], [], [], [], []]; for (const vw of views) { if (!vw.bb) continue; byCls[vw.cls].push(vw); if (vw.also) for (const cc of vw.also) byCls[cc].push(vw); }   // also: classes that reuse this view (no extra canvas)
    if (!views.some(v => v.bb)) { for (const vw of views) vw.lv = null; return true; }   // nothing to paint (e.g. a car without a number)
    // candidate texels: only those whose body position falls in some view's content box (posMap cell index)
    const cand = yield* candidatesGen(pm, views);
    const H2 = S >> 1; const out = [0, 0, 0, 0];
    const sample = (lv, X, Y) => {   // premultiplied bilinear sample into out
      const fx = X - 0.5, fy = Y - 0.5; const ix = Math.floor(fx), iy = Math.floor(fy); const tx = fx - ix, ty = fy - iy; out[0] = out[1] = out[2] = out[3] = 0;
      for (let q = 0; q < 4; q++) { const xx = ix + (q & 1), yy = iy + (q >> 1); if (xx < 0 || yy < 0 || xx >= lv.w || yy >= lv.h) continue; const w = ((q & 1) ? tx : 1 - tx) * ((q >> 1) ? ty : 1 - ty); const o = (yy * lv.w + xx) * 4; const a = lv.d[o + 3] * w; if (!a) continue; out[0] += lv.d[o] * a; out[1] += lv.d[o + 1] * a; out[2] += lv.d[o + 2] * a; out[3] += a; }
    };
    const quads = [[0, 0], [H2, 0], [0, H2], [H2, H2]]; const imgs = [null, null, null, null], dirty = [false, false, false, false];   // the repacked atlas (meta.roleAtlas) paints in all four quadrants
    const getQ = (q) => imgs[q] || (imgs[q] = ctx.getImageData(quads[q][0], quads[q][1], H2, H2));
    const R = Math.round(1 / sc);   // output texels per map texel (1, or 2 when composing 4096 from the 2048 map)
    const P3 = [0, 0, 0];
    const posAt = (mx, my, c, k) => {   // body position at fractional map coords (bilinear inside one class)
      if (R > 1) { const i0 = Math.floor(mx), j0 = Math.floor(my), tx = mx - i0, ty = my - j0; const k0 = j0 * M + i0;
        if (i0 >= 0 && j0 >= 0 && i0 < M - 1 && j0 < M - 1 && cls[k0] === c && cls[k0 + 1] === c && cls[k0 + M] === c && cls[k0 + M + 1] === c) {
          const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
          for (let q = 0; q < 3; q++) P3[q] = (pos[k0 * 3 + q] * w00 + pos[(k0 + 1) * 3 + q] * w10 + pos[(k0 + M) * 3 + q] * w01 + pos[(k0 + M + 1) * 3 + q] * w11) * inv;
          return; } }
      P3[0] = pos[k * 3] * inv; P3[1] = pos[k * 3 + 1] * inv; P3[2] = pos[k * 3 + 2] * inv;
    };
    const idx = cand; const { alt, wal } = pm; const ACC = [0, 0, 0], ALT = [0, 0, 0];
    // composite the views of one class over acc (premultiplied 'over', like the canvas): true when any of them painted
    const over = (list, acc, x, y, z, r, kx, ky) => {
      let hit = false;
      for (const vw of list) {
        if (!vw.bb || (vw.roles && !vw.roles[r]) || (vw.notRoles && vw.notRoles[r])) continue;
        const XY = vw.map(x, y, z); const X = (XY[0] - vw.x0) * vw.ppm0, Y = (XY[1] - vw.y0) * vw.ppm0; if (X < vw.bb[0] || Y < vw.bb[1] || X > vw.bb[2] || Y > vw.bb[3]) continue;
        const A = vw.map(pos[kx * 3] * inv, pos[kx * 3 + 1] * inv, pos[kx * 3 + 2] * inv), B = vw.map(pos[ky * 3] * inv, pos[ky * 3 + 1] * inv, pos[ky * 3 + 2] * inv);
        const fp = Math.max(Math.abs(A[0] - XY[0]), Math.abs(A[1] - XY[1]), Math.abs(B[0] - XY[0]), Math.abs(B[1] - XY[1])) * vw.ppm0 * sc;
        const L = fp > 1 ? Math.min(vw.lv.length - 1, Math.floor(Math.log2(fp) + 0.3)) : 0; const lv = vw.lv[L];
        sample(lv, X * lv.w / vw.lv[0].w, Y * lv.h / vw.lv[0].h); const a = out[3] / 255; if (a <= 0.002) continue;
        const ia = 1 - Math.min(1, a); acc[0] = out[0] / 255 + acc[0] * ia; acc[1] = out[1] / 255 + acc[1] * ia; acc[2] = out[2] / 255 + acc[2] * ia; hit = true;
      }
      return hit;
    };
    const inBox = (list, xc, yc, zc) => { for (const vw of list) { if (!vw.bb) continue; const XY = vw.map(xc, yc, zc); const X = (XY[0] - vw.x0) * vw.ppm0, Y = (XY[1] - vw.y0) * vw.ppm0; const m = 0.05 * vw.ppm0; if (X >= vw.bb[0] - m && X <= vw.bb[2] + m && Y >= vw.bb[1] - m && Y <= vw.bb[3] + m) return true; } return false; };
    for (let n = 0; n < idx.length; n++) {
      if ((n & 2047) === 2047) yield;
      const k = idx[n]; const c = cls[k]; const vws = byCls[c]; const wa = wal ? wal[k] / 255 : 0; const avs = wa > 0 ? byCls[alt[k]] : null;
      if (!vws.length && !(avs && avs.length)) continue;
      const r = roleMap ? roleMap[k] : 1; if (roleMap && (r < 1 || r > PAINT_ROLES)) continue;
      const mi = k % M, mj = (k - mi) / M; if (mi < 1 || mj < 1 || mi >= M - 1 || mj >= M - 1) continue;
      // early reject against every view's content box using the texel centre
      const xc = pos[k * 3] * inv, yc = pos[k * 3 + 1] * inv, zc = pos[k * 3 + 2] * inv;
      if (!inBox(vws, xc, yc, zc) && !(avs && inBox(avs, xc, yc, zc))) continue;
      const kx = cls[k + 1] === c ? k + 1 : cls[k - 1] === c ? k - 1 : k, ky = cls[k + M] === c ? k + M : cls[k - M] === c ? k - M : k;
      for (let sy = 0; sy < R; sy++) for (let sx = 0; sx < R; sx++) {
        const ox = mi * R + sx, oy = mj * R + sy; const q = oy < H2 ? (ox < H2 ? 0 : 1) : (ox < H2 ? 2 : 3);
        posAt((ox + 0.5) * sc - 0.5, (oy + 0.5) * sc - 0.5, c, k); const x = P3[0], y = P3[1], z = P3[2];
        const img = getQ(q); const d = img.data; const o = ((oy - quads[q][1]) * H2 + (ox - quads[q][0])) * 4;
        ACC[0] = ALT[0] = d[o]; ACC[1] = ALT[1] = d[o + 1]; ACC[2] = ALT[2] = d[o + 2];
        let hit = over(vws, ACC, x, y, z, r, kx, ky);
        if (avs) { if (over(avs, ALT, x, y, z, r, kx, ky)) hit = true; for (let i = 0; i < 3; i++) ACC[i] += (ALT[i] - ACC[i]) * wa; }
        if (hit) { d[o] = ACC[0]; d[o + 1] = ACC[1]; d[o + 2] = ACC[2]; dirty[q] = true; }
      }
    }
    for (let q = 0; q < 4; q++) if (dirty[q]) { ctx.putImageData(imgs[q], quads[q][0], quads[q][1]); yield; }
    for (const vw of views) vw.lv = null;
    return true;
  }
  function runGen(g) { let r; do { r = g.next(); } while (!r.done); return r.value; }
  function projectDecals(ctx, S, views, roleMap) { return runGen(projectDecalsGen(ctx, S, views, roleMap)); }
  CarGLB.projectDecals = projectDecals; CarGLB.posMap = posMap;
  // ---------------------------------------------------------------- livery designs (side and top views, see projectDecals)
  // Landmarks (metres; x forward, y up): nose tip x 3.0; front-wing endplates x 2.45..2.9, y 0.05..0.3; cockpit x 0.3..1.0;
  // sidepod flank x 1.0..-1.3, y 0.12..0.62; engine-cover upper band x 0.1..-1.3, y 0.78..1.0 (airbox x 0..-0.35);
  // engine-cover rear x -1.2..-1.8, y 0.2..0.7; rear-wing endplates x -1.9..-2.35, y 0.45..1.0; rear-wing top x -1.92..-2.28,
  // z +-0.55; front-wing outer flaps x 2.45..2.8, z +-0.55..1.0; nose top half-width 0.08 at x 2.4, 0.15 at x 1.6.
  const MM = 1000;
  const sideKit = (g, s) => EI.LIVERIES.sideKit(g, s);   // drawing helpers for one side view (js/liveries.js)
  const Ads = () => EI.Ads;
  CarGLB.sideKit = (g, s) => sideKit(g, s);   // used by teams.js (procedural sheet / menu preview) with the same team designs
  const lum = (h) => { const cc = new THREE.Color(h); return 0.2126 * cc.r + 0.7152 * cc.g + 0.0722 * cc.b; };
  const NUM_FONT = 'italic 900 % "Titillium Web", "Arial Black", Arial, sans-serif';
  // the team graphics on the side (painted under the decals): curves through the landmarks above
  const UPPER_LINE = [[3.1, 0.3], [2.2, 0.47], [1.3, 0.6], [0.4, 0.7], [-0.5, 0.72], [-1.3, 0.66], [-2.0, 0.55]];
  const TOP_V = 1.4, LOW_V = -0.1;
  function teamSide(k, team, o) {   // generic scheme for a team without a design in js/liveries.js
    k.region(UPPER_LINE.map(([x, y]) => [x, y + 0.04]), [[-2.4, TOP_V], [3.2, TOP_V]], o.S);
  }
  // top-view drawing kit (mm canvas units, X = z, Y = -x): shared by the top view and the halo's top view
  function topKit(g) {
    const at = (x, z, fn, rot) => { g.save(); g.translate(z * MM, -x * MM); if (rot) g.rotate(rot); fn(); g.restore(); };
    const txt = (str, x, z, cap, col, font, rot, ls) => at(x, z, () => { g.font = font.replace('%', (cap * MM).toFixed(1) + 'px'); Ads().setLS(g, (ls || 0) * cap * MM); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col; g.fillText(str, 0, cap * MM * 0.04); Ads().setLS(g, 0); }, rot);
    const dec = (spec, x, z, cap, maxW, rot) => at(x, z, () => Ads().drawDecal(g, spec, 0, 0, cap * MM, maxW * MM), rot);
    const rect = (x0, x1, z0, z1, col) => { g.fillStyle = col; g.fillRect(z0 * MM, -x1 * MM, (z1 - z0) * MM, (x1 - x0) * MM); };
    const poly = (pts, col) => { g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(z * MM, -x * MM) : g.moveTo(z * MM, -x * MM))); g.closePath(); g.fillStyle = col; g.fill(); };
    return { at, txt, dec, rect, poly };
  }
  function liveryViews(team, num, code, o) {
    const { P, S, A, NC, SC, sp, works } = o; const id = team.id;
    const tname = (team.name.length > 13 ? team.short : team.name).toUpperCase();
    const views = [];
    const side = (s) => (g) => {
      g.scale(1 / MM, 1 / MM); const k = sideKit(g, s);
      if (EI.LIVERIES && EI.LIVERIES.has(id)) EI.LIVERIES.side(g, k, team, num, code);   // the team designs (js/liveries.js + js/liveries/<id>.js)
      else {
        teamSide(k, team, o);
        // partner decals: one consistent layout for every customer team
        k.decal(sp(0), -0.62, 0.885, 0.07, 0.95);                       // title partner, engine-cover upper band
        k.decal(sp(1), -0.18, 0.44, 0.07, 0.78);                        // sidepod partner
        k.decal(sp(3), -0.18, 0.27, 0.05, 0.6);                         // sidepod lower
        // race number on a plate (engine-cover rear), so it reads on any paint scheme
        const dark = lum(o.NC) < 0.5; k.at(-1.5, 0.53, () => { g.fillStyle = dark ? '#f4f4f2' : '#15171c'; Ads().rr(g, -125, -82, 250, 164, 22); g.fill(); g.fillStyle = o.NC; g.font = NUM_FONT.replace('%', '130px'); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(num), 0, 6); });
        if (code) k.text(code, 1.45, 0.55, 0.07, o.NC, NUM_FONT);       // driver code by the cockpit
        k.text(String(num), 1.45, 0.44, 0.06, o.NC, NUM_FONT);
        // rear-wing endplates (secondary colour)
        k.decal(sp(0, { bg: null, fg: SC }), -2.13, 0.87, 0.05, 0.36);
        k.text(String(num), -2.13, 0.68, 0.12, SC, NUM_FONT);
        k.text(tname, -2.13, 0.53, 0.028, SC, '700 % "Titillium Web", Arial, sans-serif', { ls: 0.12 });
        // front-wing endplates
        k.decal(sp(2, { bg: null, fg: SC }), 2.68, 0.18, 0.035, 0.34);
      }
    };
    // the left view also colours the texels that face down / forward / back (sidepod undercut, inlet faces, nose tip), so the
    // colour blocks wrap round them instead of leaving the base paint there
    // (classes: 1 left-facing, 2 right-facing, 3 up-facing, 4 / 5 other-facing on the left / right half; see posMap)
    // A design with an endplate(L) callback paints the front-wing endplates from their own small side views, so the nose's colour
    // blocks (same x / y range) stay off them.
    const ep = EI.LIVERIES && EI.LIVERIES.hasEndplate && EI.LIVERIES.hasEndplate(id);
    const FWEND = ROLE_NAMES.indexOf('fwEnd'), HALO = ROLE_NAMES.indexOf('halo'), real = EI.LIVERIES && EI.LIVERIES.has(id) && EI.LIVERIES.sideHalo;
    const FWMAIN = ROLE_NAMES.indexOf('fwMain');
    const noEp = Object.assign({ [FWMAIN]: 1 }, ep ? { [FWEND]: 1 } : null, real ? { [HALO]: 1 } : null);   // texels only their own pass paints
    views.push({ cls: 1, also: [4], main: 1, notRoles: noEp, kind: 'L', map: (x, y) => [-x, -y], x0: -3.2, x1: 3.2, y0: -1.25, y1: 0.05, draw: side(-1) });
    views.push({ cls: 2, also: [5], main: 1, notRoles: noEp, kind: 'R', map: (x, y) => [x, -y], x0: -3.2, x1: 3.2, y0: -1.25, y1: 0.05, draw: side(1) });
    if (ep) for (const s of [-1, 1]) {
      const draw = (g) => { g.scale(1 / MM, 1 / MM); EI.LIVERIES.endplate(g, sideKit(g, s), team, num, code); };
      views.push(s < 0 ? { cls: 1, also: [4], roles: { [FWEND]: 1 }, kind: 'L', map: (x, y) => [-x, -y], x0: -3.2, x1: -2.1, y0: -0.65, y1: 0.05, draw }
        : { cls: 2, also: [5], roles: { [FWEND]: 1 }, kind: 'R', map: (x, y) => [x, -y], x0: 2.1, x1: 3.2, y0: -0.65, y1: 0.05, draw });
    }
    // the front-wing main planes (role fwMain): only a design's frontWing(L), drawn in top-view coordinates
    if (EI.LIVERIES && EI.LIVERIES.hasFrontWing && EI.LIVERIES.hasFrontWing(id))
      views.push({ cls: 3, also: [4, 5], roles: { [FWMAIN]: 1 }, kind: 'T', map: (x, y, z) => [z, -x], x0: -1.1, x1: 1.1, y0: -3.25, y1: -2.15, draw: (g) => { g.scale(1 / MM, 1 / MM); EI.LIVERIES.frontWing(g, topKit(g), team, num); } });
    // the halo's own small views (halo text only; see EI.LIVERIES.sideHalo / topHalo)
    if (real) {
      for (const s of [-1, 1]) {
        const draw = (g) => { g.scale(1 / MM, 1 / MM); EI.LIVERIES.sideHalo(g, sideKit(g, s), team, num, code); };
        views.push(s < 0 ? { cls: 1, also: [4], roles: { [HALO]: 1 }, kind: 'L', map: (x, y) => [-x, -y], x0: -1.3, x1: 0.05, y0: -0.96, y1: -0.6, draw }
          : { cls: 2, also: [5], roles: { [HALO]: 1 }, kind: 'R', map: (x, y) => [x, -y], x0: -0.05, x1: 1.3, y0: -0.96, y1: -0.6, draw });
      }
      views.push({ cls: 3, roles: { [HALO]: 1 }, kind: 'T', map: (x, y, z) => [z, -x], x0: -0.45, x1: 0.45, y0: -1.3, y1: 0.05, draw: (g) => { g.scale(1 / MM, 1 / MM); EI.LIVERIES.topHalo(g, topKit(g), team, num); } });
    }
    // top view: X = z (right), Y = -x (nose up), text upright reads from behind
    views.push({ cls: 3, main: 1, notRoles: noEp, kind: 'T', map: (x, y, z) => [z, -x], x0: -1.1, x1: 1.1, y0: -3.2, y1: 3.2, draw: (g) => {
      g.scale(1 / MM, 1 / MM); const { at, txt, dec, rect, poly } = topKit(g);
      if (EI.LIVERIES && EI.LIVERIES.has(id)) return EI.LIVERIES.top(g, { at, txt, dec, rect, poly }, team, num);
      // customer teams: nose tip and centre stripe, number on the nose (reads from the front), partner on the rear wing
      rect(2.6, 3.2, -1, 1, S);
      txt(String(num), 2.2, 0, 0.13, NC, NUM_FONT, Math.PI);
      dec(sp(2, { bg: null, fg: NC }), 1.62, 0, 0.045, 0.22);
      dec(sp(0, { bg: sp(0).bg || null, fg: sp(0).bg ? sp(0).fg : SC }), -2.1, 0, 0.09, 0.85);       // rear-wing top: title partner
      txt('EQUATION I', 0.62, 0, 0.032, NC, '700 % "Titillium Web", Arial, sans-serif', 0, 0.2);   // ahead of the cockpit, under the halo
    } });
    return views;
  }
  // the driver's 3-letter code (players: from their name unless they drive a real seat with a code)
  function carCode(car) {
    if (EI.carCode) return EI.carCode(car.driver, car.isPlayer ? car.name : null, car.team);
    return (car.isPlayer && car.name ? car.name : (car.driver && car.driver.name) || car.team.short).replace(/^[A-Z]\. ?/, '').slice(0, 3).toUpperCase();
  }
  CarGLB.carCode = carCode;
  function composeLivery(team, num, code, size) { return runGen(composeLiveryGen(team, num, code, size)); }
  CarGLB.composeLiveryGen = (team, num, code, size) => composeLiveryGen(team, num, code, size);   // for tools (profiling)
  function liverySize(team, size) { size = size || 2048; return (team.id === 'lumi' || team.id === 'intake') && size >= 1024 && size < 2048 ? 2048 : size; }   // the works liveries always get crisp lettering (the 512 stand-in excepted)
  function liveryKey(team, num, code, size) { return team.id + ':' + num + ':' + (code || '') + ':' + liverySize(team, size); }
  // Two-pass painting: the team layer (everything but the number / code / per-car marks, see EI.LIVERIES.setPass) is painted once
  // per team and size (baseCache, no AO yet); each car = a copy of it + its own small per-car pass + AO. Designs that cannot be split
  // (the own teams) are painted whole per car. ~11 team sheets + 22 cheap car passes instead of 22 full sheets.
  const baseCache = {};
  function* composeLiveryGen(team, num, code, size) {
    size = liverySize(team, size); const key = liveryKey(team, num, code, size);
    if (texCache[key]) return texCache[key];
    const split = !!(EI.LIVERIES && EI.LIVERIES.splitOK && EI.LIVERIES.splitOK(team.id)) && !CarGLB.noSplit;
    let c, ctx;
    if (split) {
      const bk = team.id + ':' + size; let baseC = baseCache[bk];
      if (!baseC) { baseC = yield* paintSheetGen(team, num, code, size, 'team'); baseCache[bk] = baseC; }
      c = document.createElement('canvas'); c.width = c.height = size; ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(baseC, 0, 0); yield;
      const views = liveryViews(team, num, code, viewOpts(team)).filter(v => v.main); for (const v of views) v.pass = 'car';
      yield* projectDecalsGen(ctx, size, views, roleMaps[Math.min(size, 2048)]);
    } else { c = yield* paintSheetGen(team, num, code, size, 'all'); ctx = c.getContext('2d'); }
    // ambient occlusion
    ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(cache.aoImg, 0, 0, size, size); ctx.globalCompositeOperation = 'source-over'; yield;
    const tex = new THREE.CanvasTexture(c); tex.flipY = false; tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8; tex.needsUpdate = true;
    texCache[key] = tex; return tex;
  }
  function viewOpts(team) {
    const P = team.primary, S = team.secondary, A = team.accent;
    const NC = team.numberColor || (lum(P) > 0.4 ? '#101010' : '#ffffff');
    const SC = lum(S) > 0.4 ? '#101010' : '#ffffff';
    const sps = team.sponsors && team.sponsors.length ? team.sponsors : [{ n: 'EQUATION', fg: NC }, { n: 'EI', fg: NC }, { n: 'EI', fg: NC }, { n: 'EI', fg: NC }];
    const sp = (i, o) => Object.assign({}, sps[i % sps.length], o || {});
    return { P, S, A, NC, SC, sp, works: team.id === 'lumi' || team.id === 'intake', Ads: EI.Ads };
  }
  // the role colour fill + the projected design views (pass 'team' or 'all'), no AO; returns the canvas
  function* paintSheetGen(team, num, code, size, pass) {
    const meta = cache.meta || {}; const atlas = meta.atlas || {};
    // 1) colour fill from the material-ID atlas, at <= 2048 (per-pixel JS), then upscaled with smoothing so region edges stay soft
    const base = Math.min(size, 2048);
    const c0 = document.createElement('canvas'); c0.width = base; c0.height = base; const ctx0 = c0.getContext('2d', { willReadFrequently: true });
    let im; if (!roleMaps[base]) { ctx0.imageSmoothingEnabled = false; ctx0.drawImage(cache.idImg, 0, 0, base, base); im = ctx0.getImageData(0, 0, base, base); } else im = ctx0.createImageData(base, base);
    const d = im.data;
    const roles = { carbon: [30, 31, 34], foam: [28, 28, 30], none: [26, 27, 30] };
    const parts = EI.LIVERIES ? EI.LIVERIES.partColours(team) : { body: team.primary, fwFlap: team.secondary, fwEnd: team.primary, fwTip: team.primary, rwMain: team.primary, rwEnd: team.secondary, rwFlap: team.secondary, mirror: team.primary, fin: team.secondary };
    for (const n of ROLE_NAMES) if (parts[n]) roles[n] = hexRgb(parts[n]); for (const n of ROLE_NAMES) if (!roles[n]) roles[n] = roles.carbon;
    if (CarGLB.debugRoles) ROLE_NAMES.forEach((n, i) => { if (i >= 1 && i <= PAINT_ROLES) roles[n] = hexRgb(['', '#999999', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ff8800', '#8800ff', '#ffffff', '#00ff88'][i]); });
    // per-pixel colour role, from the ID atlas (team independent, cached per resolution)
    if (!roleMaps[base]) {
      const src = new Uint8ClampedArray(d); const rm = new Uint8Array(base * base);
      const fill = (x0, y0, w, h, table) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const i = y * base + x; const cls = classify(src[i * 4], src[i * 4 + 1], src[i * 4 + 2]); rm[i] = Math.max(0, ROLE_NAMES.indexOf((table && table[cls]) || 'none')); } };
      // role atlas (meta.roleAtlas, tools/carlods/uvpack.py): the red channel holds the role index (R >> 4), gutters included
      if (meta.roleAtlas) { for (let i = 0, n = base * base; i < n; i++) { const r = src[i * 4]; rm[i] = r ? Math.min(ROLE_NAMES.length - 1, r >> 4) : 0; } }
      else for (const p of Object.keys(atlas)) { const [u0, v0, w, h] = atlas[p]; fill(Math.round(u0 * base), Math.round((1 - v0 - h) * base), Math.round(w * base), Math.round(h * base), PART_ROLES[p]); }
      roleMaps[base] = rm;
    }
    const rm = roleMaps[base]; const pal = ROLE_NAMES.map(n => roles[n]);
    for (let i = 0, n = base * base; i < n; i++) { if ((i & 131071) === 131071) yield; const col = pal[rm[i]]; const k = i * 4; d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255; }
    ctx0.putImageData(im, 0, 0);
    let c = c0, ctx = ctx0;
    if (size > base) { c = document.createElement('canvas'); c.width = c.height = size; ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(c0, 0, 0, size, size); }
    ctx.imageSmoothingEnabled = true;
    // 2) team graphics + decals, designed in orthographic side and top views of the car (metres; see projectDecals) and drawn in
    //    millimetres so the brand painters keep their precision. Side views: x = metres forward, y = metres up, mirrored per
    //    side so lettering always reads left to right. Top view: text reads from behind the car (the chase camera).
    const views = liveryViews(team, num, code, viewOpts(team)); for (const v of views) v.pass = pass;
    if (!(yield* projectDecalsGen(ctx, size, views, roleMaps[base]))) console.warn('EI.CarGLB: livery decals skipped (no position map)');
    return c;
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); }

  // ---------------------------------------------------------------- geometry helpers
  function nonIndexed(g) { return g.index ? g.toNonIndexed() : g; }
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
    [-0.089, 0.041, '#ffc400', 'N'], [-0.089, 0.018, '#2f7bff', 'PL'], [-0.089, -0.005, '#e8e8e8', 'MARK'], [-0.089, -0.028, '#ff3fd0', 'OT'],
    [0.089, 0.041, '#ff2a1c', 'PIT'], [0.089, 0.018, '#21d06a', 'SM'], [0.089, -0.005, '#9b59ff', 'BOX'], [0.089, -0.028, '#18c7d8', 'ACK'],
    [-0.052, 0.058, '#2b2e35', 'RAD'], [0.052, 0.058, '#2b2e35', 'LM'],
  ];
  // top-corner +10 / +1 toggles (purple, as on the 2026 wheels) and the flag / status LEDs beside the display (u, v, colour)
  const TOGGLES = [[-0.1, 0.05, '#7a3cff', '+10'], [0.1, 0.05, '#7a3cff', '+1']];
  const SIDE_LEDS = [[-0.0765, 0.036, '#2f7bff'], [-0.0765, 0.028, '#ffc400'], [-0.0765, 0.02, '#ff2a1c'], [0.0765, 0.036, '#2f7bff'], [0.0765, 0.028, '#ffc400'], [0.0765, 0.02, '#ff2a1c']];
  const linC = (h) => new THREE.Color(h).convertSRGBToLinear();
  const KNOBS = [[-0.036, -0.06, 0.0105, '#ff8a1f', 'BB'], [0.036, -0.06, 0.0105, '#2f7bff', 'DIFF'], [-0.071, -0.05, 0.0078, '#21d06a', 'ERS'], [0.071, -0.05, 0.0078, '#ffc400', 'ENG']];
  function faceTexture(team) {
    const key = '_face_' + team.id; if (shared[key]) return shared[key];
    const W = 1024, Wm = FACE_UV.u1 - FACE_UV.u0, Hm = FACE_UV.v1 - FACE_UV.v0, H = Math.round(W * Hm / Wm), M = W / Wm;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
    const X = (u) => (u - FACE_UV.u0) * M, Y = (v) => (FACE_UV.v1 - v) * M;
    // carbon weave background (colour version of the shared weave tile)
    const wv = weaveTexture().userData.canvas; const wc = document.createElement('canvas'); wc.width = wc.height = wv.width; const wx = wc.getContext('2d');
    const src = wv.getContext('2d').getImageData(0, 0, wv.width, wv.height); const out = wx.createImageData(wv.width, wv.height);
    for (let i = 0; i < src.data.length; i += 4) { const l = src.data[i] / 255, sh = src.data[i + 1] / 255; const g = 7 + l * l * 20 + sh * 10; out.data[i] = g; out.data[i + 1] = g + 1; out.data[i + 2] = g + 3; out.data[i + 3] = 255; }
    wx.putImageData(out, 0, 0); const pat = ctx.createPattern(wc, 'repeat'); if (pat.setTransform) pat.setTransform(new DOMMatrix().scale(0.55, 0.55));
    ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H);
    const gl = ctx.createLinearGradient(0, 0, 0, H); gl.addColorStop(0, 'rgba(255,255,255,0.10)'); gl.addColorStop(0.35, 'rgba(255,255,255,0.02)'); gl.addColorStop(1, 'rgba(0,0,0,0.25)'); ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);
    // display bezel (the live display plane sits inside it)
    ctx.fillStyle = '#050608'; roundRect(ctx, X(-0.0705), Y(0.0475), 0.141 * M, 0.0905 * M, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(160,170,185,0.55)'; ctx.lineWidth = 2; ctx.stroke();
    // team stripe + badge along the bottom edge
    ctx.fillStyle = team.primary; roundRect(ctx, X(-0.02), Y(-0.072), 0.04 * M, 0.006 * M, 4); ctx.fill();
    ctx.fillStyle = 'rgba(235,240,246,0.85)'; ctx.font = '900 ' + Math.round(0.0062 * M) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(team.brand || team.short || 'EQUATION').toUpperCase(), X(0), Y(-0.082));
    // button labels (above each button)
    ctx.font = '700 ' + Math.round(0.0042 * M) + 'px ' + FONT; ctx.fillStyle = '#e8edf3';
    for (const [u, v, col, lab] of TOGGLES) { ctx.fillText(lab, X(u), Y(v + 0.0098)); }
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
  function gloveLogoTexture(team, num) {
    const key = '_glove_' + team.id + ':' + (num || ''); if (shared[key]) return shared[key];
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 256, 128); ctx.fillStyle = 'rgba(240,242,246,0.95)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // the driver's number large (italic) over the team wordmark, a team-colour bar under it
    const brand = String(team.brand || team.short || 'EQUATION').toUpperCase();
    ctx.font = 'italic 900 62px ' + FONT; ctx.fillText(num != null ? String(num) : 'EI', 128, 46);
    let fs = 26; ctx.font = '700 ' + fs + 'px ' + FONT; const tw = ctx.measureText(brand).width; if (tw > 220) { fs *= 220 / tw; ctx.font = '700 ' + fs.toFixed(1) + 'px ' + FONT; } ctx.fillText(brand, 128, 96);
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
    const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d', { willReadFrequently: true });
    const b = document.createElement('canvas'); b.width = W; b.height = H; const bx = b.getContext('2d', { willReadFrequently: true });
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
    for (const [u, v, col] of BUTTONS.concat(TOGGLES)) { parts.push({ geo: cyl(0.0062, 0.005), m: new THREE.Matrix4().makeTranslation(u, v, WHEEL.faceW + 0.0022), color: linC(col) }); parts.push({ geo: cyl(0.0074, 0.0016), m: new THREE.Matrix4().makeTranslation(u, v, WHEEL.faceW + 0.0006), color: linC('#0b0c0f') }); }
    for (const [u, v, col] of SIDE_LEDS) parts.push({ geo: cyl(0.0019, 0.0012), m: new THREE.Matrix4().makeTranslation(u, v, WHEEL.faceW + 0.0008), color: linC(col).multiplyScalar(0.35) });
    const rr = EI.U.rng(3);
    for (const [u, v, r, col] of KNOBS) {
      parts.push({ geo: cyl(r + 0.0016, 0.003), m: new THREE.Matrix4().makeTranslation(u, v, WHEEL.faceW + 0.0015), color: linC(col) });
      parts.push({ geo: cyl(r, 0.011), m: new THREE.Matrix4().makeTranslation(u, v, WHEEL.faceW + 0.0065), color: linC('#1d1f24') });
      const a = (rr() - 0.5) * 3; const mk = new THREE.BoxGeometry(0.0014, r * 0.75, 0.0012); mk.translate(0, r * 0.45, 0); mk.rotateZ(a); mk.translate(u, v, WHEEL.faceW + 0.0122); parts.push({ geo: mk, color: linC('#f4f6f9') });
    }
    for (const s of [-1, 1]) { const pg = new THREE.BoxGeometry(0.06, 0.085, 0.004); pg.translate(s * 0.075, 0.012, WHEEL.faceW - 0.034); parts.push({ geo: pg, color: linC('#202226') }); }   // shift paddles behind
    frame.add(new THREE.Mesh(mergeGeos(parts, true), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.25, envMapIntensity: 0.6 })));
    // ---- live display (LED strip + screen) on a plane over the bezel
    const sc = document.createElement('canvas'); sc.width = 512; sc.height = 320;
    const screenTex = new THREE.CanvasTexture(sc); screenTex.encoding = THREE.sRGBEncoding; screenTex.anisotropy = 4;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.134, 0.0838), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
    screen.position.set(0, 0.0012, WHEEL.faceW + 0.0007); screen.userData.canvas = sc; frame.add(screen);
    // the wheel display is redrawn by main.js at the HUD rate; cap its texture uploads at ~15 Hz
    screenTex.generateMipmaps = true; screenTex.minFilter = THREE.LinearMipmapLinearFilter;   // ~3x minified on screen: mips keep the small type from shimmering
    let upT = 0; Object.defineProperty(screenTex, 'needsUpdate', { configurable: true, set(v) { if (!v) return; const t = performance.now(); if (t - upT < 64) return; upT = t; this.version++; } });
    // ---- gloved hands at quarter-to-three: padded back of the hand, knuckle pads, three-segment fingers curled round the grip
    //      (suede tips), thumb resting on the face, gauntlet + team strap. Dark glove with team-colour accents.
    const kit = kitColours(team); const grain = gloveGrain();
    const glove = new THREE.MeshStandardMaterial({ color: kit.glove.clone().convertSRGBToLinear().multiplyScalar(1.6), roughness: 1.0, metalness: 0.0, envMapIntensity: 0.38, roughnessMap: grain });
    const padMat = new THREE.MeshStandardMaterial({ color: kit.accent.clone().convertSRGBToLinear(), roughness: 0.55, metalness: 0.0, envMapIntensity: 0.5 });
    const palmMat = new THREE.MeshStandardMaterial({ color: kit.palm.clone().convertSRGBToLinear().multiplyScalar(0.8), roughness: 1.0, metalness: 0.0, envMapIntensity: 0.15, roughnessMap: grain });
    const cuffMat = new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 0.85, envMapIntensity: 0.18 });
    const logoMat = new THREE.MeshBasicMaterial({ map: gloveLogoTexture(team, car.num), transparent: true, depthWrite: false, toneMapped: true, polygonOffset: true, polygonOffsetFactor: -2 });
    const wrists = []; const hands = { base: [], pads: [], palm: [], cuffs: [], logos: [] };   // both hands merged per material
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
      hands.base.push(...base); hands.pads.push(...pads); hands.palm.push(...palm); hands.cuffs.push(...cuffs);
      // glove logo printed on the back of the hand, facing up / back towards the driver's eyes
      const nd = V(s * 0.62, 0.42, 0.66).normalize(); const ex = [0.026, 0.05, 0.031];
      const tt = 1 / Math.sqrt((nd.x / ex[0]) ** 2 + (nd.y / ex[1]) ** 2 + (nd.z / ex[2]) ** 2); const lp = MC.clone().addScaledVector(nd, tt);
      const ln = V(nd.x / ex[0] ** 2, nd.y / ex[1] ** 2, nd.z / ex[2] ** 2).normalize();
      const ly = V(0, 1, 0).addScaledVector(ln, -ln.y).normalize(), lx = new THREE.Vector3().crossVectors(ly, ln).normalize();
      const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.015), logoMat); logo.position.copy(lp).addScaledVector(ln, 0.0016);
      logo.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(lx.clone().multiplyScalar(-s), ly, ln.clone().multiplyScalar(1))); logo.rotateZ(s * Math.PI / 2); logo.updateMatrix(); hands.logos.push({ geo: logo.geometry, m: logo.matrix.clone() });
      const wrist = new THREE.Object3D(); wrist.position.copy(C1); frame.add(wrist); wrists.push(wrist);
    }
    frame.add(new THREE.Mesh(mergeGeos(hands.base), glove)); frame.add(new THREE.Mesh(mergeGeos(hands.pads), padMat)); frame.add(new THREE.Mesh(mergeGeos(hands.palm), palmMat)); frame.add(new THREE.Mesh(mergeGeos(hands.cuffs), cuffMat)); frame.add(new THREE.Mesh(mergeGeos(hands.logos), logoMat));
    // ---- arms: one swept tube per arm (shoulder -> bent elbow -> wrist) in race-suit fabric, re-shaped on the CPU whenever the
    //      wheel turns. Two-bone IK with the elbow hanging down and out; radius tapers shoulder -> biceps -> elbow -> forearm -> wrist.
    const suitTex = suitTextures(team);
    const suitOpts = { map: suitTex.map, bumpMap: suitTex.bump, bumpScale: 0.0015, roughness: 0.74, metalness: 0.0, envMapIntensity: 0.4 };
    const suit = new THREE.MeshPhysicalMaterial(suitOpts); if ('sheen' in suit) suit.sheen = kit.suit.clone().convertSRGBToLinear().lerp(new THREE.Color(0x404040), 0.25).multiplyScalar(0.5);   // a faint fabric sheen in the suit's own (linear) colour: a black suit stays black
    const plainSuit = new THREE.MeshStandardMaterial({ color: kit.suit.clone().convertSRGBToLinear(), roughness: 0.8, envMapIntensity: 0.35 });
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
    const torsoMesh = new THREE.Mesh(mergeGeos(torso), plainSuit); body.add(torsoMesh);
    const hans = new THREE.TorusGeometry(0.088, 0.017, 8, 22, Math.PI * 1.25); hans.rotateX(Math.PI / 2); hans.rotateY(Math.PI * 0.375 + Math.PI); hans.translate(0.07, 0.69, 0);
    const hansMat = carbonMaterial({ dark: 0x020203, light: 0x0c0d10, clearcoat: 0.5, env: 0.35, ckMask: 0 });
    const hansMesh = new THREE.Mesh(hans, hansMat); body.add(hansMesh);
    const _S0 = new THREE.Vector3(), _w = new THREE.Vector3(), _e = new THREE.Vector3(), _d0 = new THREE.Vector3(), _pole = new THREE.Vector3(), _inv = new THREE.Matrix4();
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
      const s = arm.s; _d0.subVectors(W, S); let dist = _d0.length(); _d0.multiplyScalar(1 / dist);
      if (!arm.L) arm.L = dist * 1.1;                                      // arm length fixed at the straight-ahead pose: elbows slightly bent
      // big lock: the hand that crosses over reaches with the shoulder (up to 16 cm forward) so the elbow stays bent and low
      // instead of the arm locking out straight across the view
      const reach = Math.min(0.16, Math.max(0, dist - arm.L * 0.9)); if (reach > 0) { S = _S0.copy(S).addScaledVector(_d0, reach); dist -= reach; }
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
    return { steer, spin, screen, screenTex, animate, hide: [steer, torsoMesh, hansMesh].concat(arms.map(a => a.mesh)) };
  }

  // live rear-view mirrors: a small render target per mirror, rendered alternately from the glass along the reflected eye ray.
  // Cheap by design: 128 px wide targets (160 on high), far plane 260 m, and while a mirror renders it hides the heavy
  // scenery (trees, crowd, grass cards / tufts, flags, parked vehicles, detail instancing, the outer city and hillside trees) and every
  // other car beyond 150 m.
  const MIRROR_HIDE = /^(trees|treesFar|treeStripsNear|treeShadows|grassCards|crowd|crowdFar|flags|tents|campervans|parkedCars|runoffLogos|perimeterPosts|tyreStacks|fencePosts|fenceRails|hoardingPosts|pit-tyre|cityFar|cityPines|cityCypresses)$|tuft|detail|grass|^pit-fig-/i;
  function buildMirrors(glassMeshes, body, carGroup, swap) {
    const EYE = V(0.3, 0.815, 0);   // the cockpit camera eye (main.js placeCamera)
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
      // the plane sits just proud of the frontmost glass vertex (a slanted or thick glass would otherwise cover it)
      let dz = -1e9; for (const v of verts) dz = Math.max(dz, v.clone().sub(ctr).dot(nrm));
      const w = (x1 - x0) * 0.94, h = (y1 - y0) * 0.86; const cc = ctr.clone().addScaledVector(rx, (x0 + x1) / 2).addScaledVector(up, (y0 + y1) / 2).addScaledVector(nrm, dz + 0.0025);
      const rt = new THREE.WebGLRenderTarget(128, 64, { encoding: THREE.sRGBEncoding, depthBuffer: true, stencilBuffer: false }); rt.texture.encoding = THREE.sRGBEncoding; rt.texture.generateMipmaps = false;
      rt.texture.repeat.x = -1; rt.texture.offset.x = 1;   // mirror image
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: rt.texture, alphaMap: mask, alphaTest: 0.5, toneMapped: false }));
      plane.position.copy(cc); plane.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(rx, up, nrm)); body.add(plane);
      // reflected eye ray -> camera direction (body space)
      const d = cc.clone().sub(EYE).normalize(); const refl = d.clone().addScaledVector(nrm, -2 * d.dot(nrm)); refl.z += sgn * 0.16; refl.y += 0.035; refl.normalize();   // aimed ~9 deg further out and a touch up: the rear tyre at the inner edge, the track behind filling the rest
      const cam = new THREE.PerspectiveCamera(16, w / h, 0.3, 260); cam.userData = { local: cc.clone(), dir: refl };
      cam.fov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(20)) / (w / h)) * 180 / Math.PI;   // ~40 deg horizontal
      cam.updateProjectionMatrix();
      sides.push({ rt, plane, cam, ar: w / h });
    }
    let frameN = 0, sideN = 0, hideList = null, carList = null, scanN = 0; const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _u = new THREE.Vector3();
    const hidden = [], lodSave = [], LITE_CARS = 8, near8 = new Float64Array(LITE_CARS);
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
      // lite (Low): an array of extra objects to hide (main.js passes the whole scenery group): road, barriers, kerbs and the cars
      // behind only, in a 112 px target with a 150 m far plane
      update(renderer, scene, every, lite) {
        frameN++; if (every > 1 && frameN % every) return;
        if (!hideList || ++scanN % 600 === 0) scan(scene);
        const sd = sides[(sideN++) % sides.length]; const cam = sd.cam;
        const W = lite ? 112 : every <= 1 ? 160 : 128, H = Math.max(lite ? 36 : 40, Math.min(80, Math.round(W / sd.ar))); if (sd.rt.width !== W || sd.rt.height !== H) sd.rt.setSize(W, H);
        const far = lite ? 150 : 260; if (cam.far !== far) { cam.far = far; cam.updateProjectionMatrix(); }
        body.updateWorldMatrix(true, false);
        _p.copy(cam.userData.local).applyMatrix4(body.matrixWorld); _d.copy(cam.userData.dir).transformDirection(body.matrixWorld); _u.set(0, 1, 0).transformDirection(body.matrixWorld);
        cam.position.copy(_p); cam.up.copy(_u); cam.lookAt(_p.add(_d)); cam.updateMatrixWorld();
        hidden.length = 0;
        for (const o of hideList) if (o.visible) { o.visible = false; hidden.push(o); }
        if (lite) for (const o of lite) if (o && o.visible) { o.visible = false; hidden.push(o); }
        if (swap && swap.ck) for (const o of swap.ck) if (o.visible) { o.visible = false; hidden.push(o); }   // wheel, arms, torso: never in a rear view
        const R2 = lite ? 70 * 70 : 150 * 150; for (const o of carList) if (o.visible && o.position.distanceToSquared(cam.position) > R2) { o.visible = false; hidden.push(o); }   // lite: the cars that matter (the next ~2 s behind)
        // lite: the other cars draw from their far LOD (1 draw call, ~6k triangles each) - plenty for a 112 px mirror
        lodSave.length = 0;
        // lite: at most the LITE_CARS nearest cars (a full grid behind would cost a draw call per car)
        if (lite) { let n = 0; for (const o of carList) if (o.visible) { const q = o.position.distanceToSquared(cam.position); let i = Math.min(n, LITE_CARS - 1); if (n < LITE_CARS || q < near8[i]) { while (i > 0 && near8[i - 1] > q) { near8[i] = near8[i - 1]; i--; } near8[i] = q; if (n < LITE_CARS) n++; } }
          if (n >= LITE_CARS) for (const o of carList) if (o.visible && o.position.distanceToSquared(cam.position) > near8[LITE_CARS - 1]) { o.visible = false; hidden.push(o); } }
        if (lite) for (const o of carList) { if (!o.visible) continue; let far = null; for (const c of o.children) if (c.name === 'car_far') far = c; if (!far) continue; for (const c of o.children) { lodSave.push(c, c.visible); c.visible = c === far; } }
        for (const s of sides) s.plane.visible = false;
        // the car's own bodywork renders from the lo LOD in the mirrors (~35k instead of ~130k triangles)
        if (swap) { for (const m of swap.hi) m.visible = false; for (const m of swap.lo) m.visible = true; }
        const prevRT = renderer.getRenderTarget(), au = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
        renderer.setRenderTarget(sd.rt); renderer.render(scene, cam); renderer.setRenderTarget(prevRT); renderer.shadowMap.autoUpdate = au;
        for (const s of sides) s.plane.visible = true;
        if (swap) { for (const m of swap.hi) m.visible = true; for (const m of swap.lo) m.visible = false; }
        for (let i = 0; i < lodSave.length; i += 2) lodSave[i].visible = lodSave[i + 1];
        for (const o of hidden) o.visible = true;
      },
    };
  }

  // ---------------------------------------------------------------- shared per-LOD templates + one LOD material per car
  // Every car of a LOD has the same geometry (only the livery texture, helmet colour and tyre compound differ), so the GLB is
  // merged once per LOD into a few shared, indexed buffers:
  //   paint / carbon / floor: body-space bodywork for the detailed shaders (flake paint, triplanar carbon): near cars
  //   lod:  every other part (wheels and tyre walls, helmet, DRS flap, suspension, metal, glass, rain light ...) in car-group space,
  //         drawn by the car's LOD material, which spins / steers the wheels, opens the flap, turns the helmet and rolls the body in
  //         its vertex shader: a near car is 4 draw calls (5 while the brake discs glow)
  //   mid:  the whole car in the LOD material (one draw call), vertex-clustered to ~14k triangles: ~25-70 m
  //   far:  a coarser vertex-clustered version (one draw call, ~6.5k triangles): beyond ~70 m
  // Vertex attributes: lodk = (slot, metalness, roughness, clearcoat), slot 0 vertex colour, 1 livery texture, 2 emissive vertex
  // colour (rain light), 3 team accent (helmet), 4 tyre-wall lettering over tyre black; lodg = 0 body, 1 flap, 2 helmet, 3..6 wheel
  const G_FLAP = 1, G_HELMET = 2, G_WHEEL = 3;
  const CORNERS = ['fl', 'fr', 'rl', 'rr'];
  const CARBON_AVG = [0.034, 0.035, 0.04], FLOOR_AVG = [0.012, 0.012, 0.014];
  const FLOOR_RE = /^(floor_|body_gearbox|misc_rearled)/;
  function lodParams(mat, node) {
    const n = (mat && mat.name) || '';
    if ((n === 'paint' && !node.startsWith('body_cockpit')) || node === 'halo_main') return { s: 1, m: 0.18, r: 0.42, c: 1, col: [1, 1, 1] };
    if (n === 'paint' || n === 'carbon') return FLOOR_RE.test(node) && n === 'carbon' ? { s: 0, m: 0.2, r: 0.55, c: 0.18, col: FLOOR_AVG } : { s: 0, m: 0.2, r: 0.5, c: 0.45, col: CARBON_AVG };
    if (n === 'cover') return { s: 6, m: 0.15, r: 0.45, c: 0.6, col: [1, 1, 1] };   // wheel covers: the team's cover design (uCover)
    if (n === 'helmet') return { s: 3, m: 0.1, r: 0.35, c: 1, col: [1, 1, 1] };
    if (n === 'led') return { s: 2, m: 0, r: 0.4, c: 0, col: [1, 0.1, 0.1] };
    const c = mat && mat.color ? mat.color : new THREE.Color(0x202020);
    return { s: 0, m: mat && mat.metalness != null ? mat.metalness : 0.1, r: mat && mat.roughness != null ? mat.roughness : 0.7, c: (mat && mat.clearcoat) || 0, col: [c.r, c.g, c.b] };
  }
  // merge [{ geo, lp, g }] (geometries already in their target space) into one indexed geometry; withLod adds color / lodk / lodg
  function mergeIndexed(items, withLod) {
    let nv = 0, ni = 0; for (const it of items) { nv += it.geo.attributes.position.count; ni += it.geo.index ? it.geo.index.count : it.geo.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    const col = withLod ? new Float32Array(nv * 3) : null, lk = withLod ? new Float32Array(nv * 4) : null, lg = withLod ? new Float32Array(nv) : null;
    let vo = 0, io = 0;
    for (const { geo, lp, g } of items) {
      const a = geo.attributes, n = a.position.count;
      pos.set(a.position.array, vo * 3); if (a.normal) nrm.set(a.normal.array, vo * 3); if (a.uv) uv.set(a.uv.array, vo * 2);
      if (geo.index) { const ix = geo.index.array; for (let i = 0; i < ix.length; i++) idx[io + i] = ix[i] + vo; io += ix.length; } else { for (let i = 0; i < n; i++) idx[io + i] = vo + i; io += n; }
      if (withLod) for (let i = 0; i < n; i++) { const k = vo + i; col[k * 3] = lp.col[0]; col[k * 3 + 1] = lp.col[1]; col[k * 3 + 2] = lp.col[2]; lk[k * 4] = lp.s; lk[k * 4 + 1] = lp.m; lk[k * 4 + 2] = lp.r; lk[k * 4 + 3] = lp.c; lg[k] = g; }
      vo += n;
    }
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (withLod) { out.setAttribute('color', new THREE.BufferAttribute(col, 3)); out.setAttribute('lodk', new THREE.BufferAttribute(lk, 4)); out.setAttribute('lodg', new THREE.BufferAttribute(lg, 1)); }
    out.setIndex(new THREE.BufferAttribute(idx, 1)); out.computeBoundingSphere(); out.computeBoundingBox(); return out;
  }
  // vertex-clustering simplification: vertices of the same part group and material snap to the mean of their grid cell, collapsed
  // and duplicate triangles are dropped. Attributes other than position come from the cell's first vertex.
  function clusterGeo(geo, cell) {
    const a = geo.attributes, P = a.position.array, K = a.lodk.array, G = a.lodg.array, C = a.color.array, n = a.position.count, UV = a.uv && a.uv.array;
    const map = new Map(), rep = new Int32Array(n), first = [], acc = [];
    // livery-textured vertices (slot 1) only merge within one UV cell of the atlas: merging across UV islands gave the merged vertex
    // another island's UV, so mid / far cars showed patches of carbon / wrong paint ('bodyless' cars from ~25 m)
    const uvq = Math.max(16, Math.round(2.4 / cell));
    for (let i = 0; i < n; i++) {
      const uvKey = UV && cell < 0.25 && K[i * 4] > 0.5 && K[i * 4] < 1.5 ? '|' + Math.floor(UV[i * 2] * uvq) + ',' + Math.floor(UV[i * 2 + 1] * uvq) : '';
      const key = G[i] + '|' + K[i * 4] + '|' + Math.round(K[i * 4 + 2] * 50) + '|' + Math.round(C[i * 3] * 40) + '|' + Math.floor(P[i * 3] / cell) + '|' + Math.floor(P[i * 3 + 1] / cell) + '|' + Math.floor(P[i * 3 + 2] / cell) + uvKey;
      let r = map.get(key); if (r === undefined) { r = first.length; map.set(key, r); first.push(i); acc.push(0, 0, 0, 0); }
      rep[i] = r; acc[r * 4] += P[i * 3]; acc[r * 4 + 1] += P[i * 3 + 1]; acc[r * 4 + 2] += P[i * 3 + 2]; acc[r * 4 + 3]++;
    }
    const m = first.length; const out = new THREE.BufferGeometry();
    for (const name of Object.keys(a)) { const src = a[name], s = src.itemSize; const arr = new Float32Array(m * s); for (let r = 0; r < m; r++) for (let q = 0; q < s; q++) arr[r * s + q] = src.array[first[r] * s + q]; out.setAttribute(name, new THREE.BufferAttribute(arr, s)); }
    const op = out.attributes.position.array; for (let r = 0; r < m; r++) { const w = acc[r * 4 + 3]; op[r * 3] = acc[r * 4] / w; op[r * 3 + 1] = acc[r * 4 + 1] / w; op[r * 3 + 2] = acc[r * 4 + 2] / w; }
    const ix = geo.index.array, tri = [], seen = new Set();
    for (let t = 0; t < ix.length; t += 3) {
      const i0 = rep[ix[t]], i1 = rep[ix[t + 1]], i2 = rep[ix[t + 2]]; if (i0 === i1 || i1 === i2 || i0 === i2) continue;
      // duplicates by vertex set AND winding: a thin two-sided panel (outer skin + inner skin) collapses onto the same cluster vertices
      // with opposite windings; keying on the set alone kept only one of the pair - often the inward-facing one, culled from outside,
      // which made mid / far cars lose most of their bodywork ('bodyless' cars at ~20-25 m, PERF wave 6)
      const r = i0 < i1 ? (i0 < i2 ? 0 : 2) : (i1 < i2 ? 1 : 2); const a0 = r === 0 ? i0 : r === 1 ? i1 : i2, a1 = r === 0 ? i1 : r === 1 ? i2 : i0, a2 = r === 0 ? i2 : r === 1 ? i0 : i1;
      const key = (a0 * m + a1) * m + a2;
      if (seen.has(key)) continue; seen.add(key); tri.push(i0, i1, i2);
    }
    out.setIndex(new THREE.BufferAttribute(m > 65535 ? new Uint32Array(tri) : new Uint16Array(tri), 1)); out.computeBoundingSphere(); out.computeBoundingBox(); return out;
  }
  // proper LODs: assets/models/ei-car-lods.bin holds, per LOD, an index list into the lo car's merged vertex array (template 'lo',
  // lists.all), made offline by edge-collapse simplification (meshoptimizer, seam- and border-preserving, normal / UV aware: no
  // holes, cracks or smeared liveries; hidden parts dropped). lodSubset copies the vertices those lists use. The file carries the
  // vertex count and a position checksum of the array it was made from: if the GLB or template() changes, it no longer matches and
  // the vertex-clustered LODs stand in (regenerate it: node tools/carlods/gen.js).
  function lodChecksum(P) { let s = 0; for (let i = 0, n = P.length / 3; i < n; i++) s += (P[i * 3] + P[i * 3 + 1] * 3 + P[i * 3 + 2] * 7) * ((i % 13) + 1); return s; }
  function readLods(buf, all) {
    if (!buf || buf.byteLength < 20) return null; const dv = new DataView(buf);
    if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'EIL1') return null;
    const nv = dv.getUint32(4, true), sum = dv.getFloat64(8, true), P = all.attributes.position.array;
    if (nv !== P.length / 3 || Math.abs(lodChecksum(P) - sum) > 1e-6 * Math.abs(sum) + 1e-3) { console.warn('EI.CarGLB: ei-car-lods.bin does not match the lo car, using clustered LODs'); return null; }
    const out = {}; let o = 20;
    for (let k = dv.getUint32(16, true); k > 0; k--) {
      const name = String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3)).trim(), n = dv.getUint32(o + 4, true); o += 8;
      out[name] = new Uint16Array(buf, o, n); o += Math.ceil(n * 2 / 4) * 4;
    }
    return out;
  }
  function lodSubset(all, ix) {
    const n = all.attributes.position.count, map = new Int32Array(n).fill(-1); let m = 0;
    const idx = new Uint16Array(ix.length); for (let i = 0; i < ix.length; i++) { const v = ix[i]; if (map[v] < 0) map[v] = m++; idx[i] = map[v]; }
    const out = new THREE.BufferGeometry();
    for (const name of Object.keys(all.attributes)) { const a = all.attributes[name], s = a.itemSize, arr = new Float32Array(m * s); for (let v = 0; v < n; v++) { const r = map[v]; if (r >= 0) for (let q = 0; q < s; q++) arr[r * s + q] = a.array[v * s + q]; } out.setAttribute(name, new THREE.BufferAttribute(arr, s)); }
    out.setIndex(new THREE.BufferAttribute(idx, 1)); out.computeBoundingSphere(); out.computeBoundingBox(); return out;
  }
  const templates = {};
  const MID_CELL = 0.08, FAR_CELL = 0.14, VFAR_CELL = 0.3;   // ~14k and ~6.5k triangles from the 45k-triangle lo car; vfar: a ~1-2k-triangle silhouette for cars far away (main.js updateCarLod, PERF)
  function template(lod, detailed) {
    const key = lod + (detailed ? ':d' : ''); if (templates[key]) return templates[key];
    const src = lod === 'lo' ? cache.lo : cache.hi; const meta = cache.meta || {};
    src.updateMatrixWorld(true);
    const WHEEL_R = meta.wheelR || 0.36, FA = meta.frontAxle || 1.75, RA = meta.rearAxle || -1.85; const hinge = meta.hinge || [-2.29, 0.98];
    const meshes = []; src.traverse((o) => { if (o.isMesh) meshes.push(o); });
    // wheel pivots at the tyre node, then seated so the tyre's lowest point is on the road (y = 0), less ~5 mm of tyre squash
    const piv = {}; for (const c of CORNERS) piv[c] = { p: new THREE.Vector3(c[0] === 'f' ? FA : RA, WHEEL_R, (c[1] === 'l' ? -1 : 1) * 0.8), set: false, bb: new THREE.Box3(), tyreHalfW: 0.176 };
    for (const o of meshes) { const w = /^wheel_(fl|fr|rl|rr)_/.exec(o.name || ''); if (!w) continue; const pv = piv[w[1]]; if (/tyre/.test(o.name) || !pv.set) { pv.p.copy(o.position); pv.set = /tyre/.test(o.name); } }
    const tmpBox = new THREE.Box3();
    for (const o of meshes) {
      const w = /^wheel_(fl|fr|rl|rr)_/.exec(o.name || ''); if (!w) continue; const pv = piv[w[1]];
      const m = new THREE.Matrix4().makeTranslation(-pv.p.x, -pv.p.y, -pv.p.z).multiply(o.matrixWorld);
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); tmpBox.copy(o.geometry.boundingBox).applyMatrix4(m); pv.bb.union(tmpBox);
      if (o.material && o.material.name === 'tyre') pv.tyreHalfW = Math.max(Math.abs(tmpBox.min.z), Math.abs(tmpBox.max.z));
    }
    const seat = {}; for (const c of CORNERS) { const pv = piv[c]; seat[c] = new THREE.Vector3(pv.p.x, pv.bb.isEmpty() ? pv.p.y : -pv.bb.min.y - 0.005, pv.p.z); }
    const lists = { paint: [], carbon: [], floor: [], lod: [], all: [], proxy: [] }, mirrorGlass = [];
    const strip = (g) => { const out = new THREE.BufferGeometry(); out.setAttribute('position', g.attributes.position.clone()); if (g.attributes.normal) out.setAttribute('normal', g.attributes.normal.clone()); else { out.setAttribute('normal', g.attributes.position.clone()); } if (g.attributes.uv) out.setAttribute('uv', g.attributes.uv.clone()); if (g.index) out.setIndex(g.index.clone()); if (!g.attributes.normal) out.computeVertexNormals(); return out; };
    for (const o of meshes) {
      const n = o.name || '', mname = o.material && o.material.name;
      if (detailed && n.startsWith('driver_wheel')) continue;   // replaced by the procedural steering wheel
      if (detailed && n === 'mirror_glass') mirrorGlass.push(o);
      let g = 0, M = o.matrixWorld; const w = /^wheel_(fl|fr|rl|rr)_/.exec(n);
      if (w) { const c = w[1], pv = piv[c].p, st = seat[c]; g = G_WHEEL + CORNERS.indexOf(c); M = new THREE.Matrix4().makeTranslation(st.x - pv.x, st.y - pv.y, st.z - pv.z).multiply(o.matrixWorld); }
      else if (n.startsWith('drsflap_')) { g = G_FLAP; M = new THREE.Matrix4().makeTranslation(hinge[0], hinge[1], 0); }   // flap geometry is local to its hinge
      else if (n.startsWith('helmet_')) g = G_HELMET;
      const geo = strip(o.geometry); geo.applyMatrix4(M); const lp = lodParams(o.material, n); const it = { geo, lp, g, name: n };
      lists.all.push(it);
      if (g === 0 && ((mname === 'paint' && !n.startsWith('body_cockpit')) || n === 'halo_main')) lists.paint.push(it);
      else if (g === 0 && (mname === 'carbon' || mname === 'paint')) (mname === 'carbon' && FLOOR_RE.test(n) ? lists.floor : lists.carbon).push(it);
      else lists.lod.push(it);
    }
    // T-cam on top of the airbox (slot 5: black on a team's first car, fluorescent yellow on the second, uTcam)
    { const tc = new THREE.BoxGeometry(0.1, 0.04, 0.06, 1, 1, 1); tc.translate(-0.05, 1.1, 0); const it = { geo: tc, lp: { s: 5, m: 0.1, r: 0.45, c: 1, col: [1, 1, 1] }, g: 0, name: 'tcam' }; lists.lod.push(it); lists.all.push(it); }
    // tyre walls (compound stripe + lettering, slot 4) just proud of each tyre's own width; brake-glow rings for the glow mesh
    const glow = [];
    CORNERS.forEach((c, k) => {
      const hw = piv[c].tyreHalfW + 0.003, st = seat[c];
      const r1 = new THREE.RingGeometry(0.27, 0.335, 64, 1); r1.translate(0, 0, hw); const r2 = new THREE.RingGeometry(0.27, 0.335, 64, 1); r2.rotateY(Math.PI); r2.translate(0, 0, -hw);
      for (const r of [r1, r2]) { r.translate(st.x, st.y, st.z); const it = { geo: r, lp: { s: 4, m: 0, r: 0.8, c: 0, col: [0.0018, 0.0018, 0.0022] }, g: G_WHEEL + k, name: 'wheel_' + c + '_wall' }; lists.lod.push(it); lists.all.push(it); }
      const g1 = new THREE.RingGeometry(0.232, 0.273, 48, 1); g1.translate(0, 0, hw + 0.0015); const g2 = new THREE.RingGeometry(0.1, 0.165, 40, 1); g2.translate(0, 0, -hw + 0.04);
      const g4 = g1.clone(); g4.rotateY(Math.PI); const g5 = g2.clone(); g5.rotateY(Math.PI);
      for (const gg of [g1, g2, g4, g5]) { gg.translate(st.x, st.y, st.z); glow.push({ geo: gg }); }
    });
    // proxy wheels for the far / vfar LODs only (lists.proxy, appended to the LOD source, see lodSubset): a GLB tyre cannot be decimated to a few dozen triangles and
    // stay round, so the far LODs swap the wheel parts for clean cylinders - tread, compound-stripe wall ring (slot 4, same UVs as the
    // walls above), team cover disc (slot 6) outside, dark rim face inside. far: 20 sides, walls both faces; vfar: 12 sides, outer only
    if (lod === 'lo') {
      const TYRE = { s: 0, m: 0, r: 0.86, c: 0, col: [0.0018, 0.0018, 0.0022] }, WALL = { s: 4, m: 0, r: 0.8, c: 0, col: [0.0018, 0.0018, 0.0022] }, COVER = { s: 6, m: 0.15, r: 0.45, c: 0.6, col: [1, 1, 1] }, RIM = { s: 0, m: 0.6, r: 0.5, c: 0, col: [0.03, 0.031, 0.034] };
      CORNERS.forEach((c, k) => {
        const pv = piv[c], st = seat[c], hw = pv.tyreHalfW, R = pv.bb.isEmpty() ? WHEEL_R : Math.max(0.3, (pv.bb.max.y - pv.bb.min.y) * 0.5 - 0.004), out = st.z >= 0 ? 1 : -1;
        for (const [tag, n, full] of [['far', 20, true], ['vfar', 12, false]]) {
          const add = (geo, lp, side) => { if (side) { if (side < 0) geo.rotateY(Math.PI); geo.translate(0, 0, side * (hw + (lp === WALL ? 0.003 : 0.002))); } geo.translate(st.x, st.y, st.z); const it = { geo, lp, g: G_WHEEL + k, name: 'proxy_' + tag + '_' + c }; lists.proxy.push(it); };
          const tread = new THREE.CylinderGeometry(R, R, hw * 2, n, 1, true); tread.rotateX(Math.PI / 2); add(tread, TYRE, 0);
          add(new THREE.CircleGeometry(0.27, n), COVER, out);
          if (full) { for (const sd of [1, -1]) { add(new THREE.RingGeometry(0.27, 0.335, n, 1), WALL, sd); add(new THREE.RingGeometry(0.335, R, n, 1), TYRE, sd); } add(new THREE.CircleGeometry(0.27, n), RIM, -out); }
          else { add(new THREE.RingGeometry(0.27, R, n, 1), TYRE, out); add(new THREE.CircleGeometry(R, n), TYRE, -out); }
        }
      });
    }
    const T = {
      paint: mergeIndexed(lists.paint), carbon: mergeIndexed(lists.carbon), floor: mergeIndexed(lists.floor), lod: mergeIndexed(lists.lod, true), glow: mergeIndexed(glow),
      wheels: CORNERS.map((c) => seat[c].clone()), hinge: new THREE.Vector2(hinge[0], hinge[1]), mirrorGlass,
    };
    if (lod === 'lo') {
      const items = lists.all.concat(lists.proxy), all = mergeIndexed(items, true), L = !CarGLB.noLods && readLods(cache.lods, all);
      if (L && L.mid && L.far && L.vfar) { T.mid = lodSubset(all, L.mid); T.far = lodSubset(all, L.far); T.vfar = lodSubset(all, L.vfar); }
      else { const car = mergeIndexed(lists.all, true); T.mid = clusterGeo(car, CarGLB.midCell || MID_CELL); T.far = clusterGeo(car, CarGLB.farCell || FAR_CELL); T.vfar = clusterGeo(car, CarGLB.vfarCell || VFAR_CELL); car.dispose(); }
      if (CarGLB.keepAll) { T.all = all; T.allParts = items.map((it) => [it.name || '', it.geo.attributes.position.count]); } else all.dispose();
    }
    for (const it of lists.all.concat(lists.proxy)) it.geo.dispose();
    for (const g of [T.lod, T.mid, T.far, T.vfar]) if (g) g.boundingSphere.radius += 0.3;   // room for the shader-animated wheels and flap
    templates[key] = T; return T;
  }
  CarGLB.template = template; CarGLB.clusterGeo = clusterGeo; CarGLB.lodSubset = lodSubset;
  // the per-car LOD material (see template): physical material with per-vertex colour / metalness / roughness / clearcoat and the
  // part animation in the vertex shader. One program for every car.
  // T-cam colour: driver.tcam ('y' / 'b', from race photos) or the FIA default (black on a team's first car, yellow on the second)
  const tcamYellow = (car) => { const d = car.driver; if (d && d.tcam) return d.tcam === 'y'; return !!(car.team && car.team.drivers && car.team.drivers.indexOf(d) === 1); };
  // per-driver helmet design (EI.LIVERIES.helmet paints it), mapped onto the helmet by a cylindrical projection in the LOD shader
  // (u = angle round the helmet's vertical axis, 0.5 = visor centre, left side u < 0.5; v = height). One small canvas per driver.
  const helmetTex = {};
  function helmetTexture(car) {
    const d = car.driver || {}; const key = (d.code || d.name || '') + ':' + car.team.id; if (helmetTex[key]) return helmetTex[key];
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = d.helmet || car.team.helmet || car.team.accent; g.fillRect(0, 0, 256, 128);
    if (EI.LIVERIES && EI.LIVERIES.helmet) EI.LIVERIES.helmet(g, 256, 128, d, car.team, car.num);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return (helmetTex[key] = t);
  }
  // wheel-cover design per team (EI.LIVERIES.cover), mapped as a disc in the wheel plane (outer faces read correctly on both sides)
  const coverTex = {};
  function coverTexture(team) {
    const key = team.id; if (coverTex[key]) return coverTex[key];
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
    g.fillStyle = '#121316'; g.fillRect(0, 0, S, S);
    if (EI.LIVERIES && EI.LIVERIES.cover) EI.LIVERIES.cover(g, S, team);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return (coverTex[key] = t);
  }
  function lodMaterial(tex, car, T) {
    const m = new THREE.MeshPhysicalMaterial({ map: tex, vertexColors: true, metalness: 1, roughness: 1, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.55, side: THREE.DoubleSide });
    const u = m.userData.u = {
      uBody: { value: new THREE.Matrix4() }, uSpin: { value: 0 }, uSteer: { value: 0 }, uFlap: { value: 0 }, uHelm: { value: 0 }, uHelmVis: { value: 1 },
      uWheel: { value: T.wheels }, uHinge: { value: T.hinge }, uAccent: { value: new THREE.Color((car.driver && car.driver.helmet) || car.team.helmet || car.team.accent) }, uTcam: { value: new THREE.Color(tcamYellow(car) ? 0xf2e600 : 0x0c0c0e) }, uHelmet: { value: helmetTexture(car) }, uCover: { value: coverTexture(car.team) }, uLed: { value: 0.6 }, uTyre: { value: tyreWallTexture(car.tyre) },
    };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = [
        'attribute vec4 lodk;', 'attribute float lodg;', 'varying vec4 vLodk;', 'varying vec3 vHelmP;', 'varying vec2 vCov;',
        'uniform mat4 uBody;', 'uniform float uSpin;', 'uniform float uSteer;', 'uniform float uFlap;', 'uniform float uHelm;', 'uniform float uHelmVis;', 'uniform vec3 uWheel[4];', 'uniform vec2 uHinge;',
        'mat3 lodRz(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }',
        'mat3 lodRy(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }', ''].join('\n') +
        sh.vertexShader.replace('#include <beginnormal_vertex>', [
          '#include <beginnormal_vertex>',
          'vLodk = lodk; vHelmP = position; vCov = vec2(0.5); mat3 lodR = mat3(1.0); vec3 lodC = vec3(0.0); float lodB = 1.0; float lodH = 1.0;',
          'if (lodg > 2.5) { lodB = 0.0; lodC = lodg < 3.5 ? uWheel[0] : lodg < 4.5 ? uWheel[1] : lodg < 5.5 ? uWheel[2] : uWheel[3]; lodR = lodRz(uSpin); if (lodg < 4.5) lodR = lodRy(uSteer) * lodR; vCov = (position.xy - lodC.xy) / 0.56 + 0.5; if (position.z < lodC.z) vCov.x = 1.0 - vCov.x; }',
          'else if (lodg > 1.5) { lodR = lodRy(uHelm); lodH = uHelmVis; }',
          'else if (lodg > 0.5) { lodC = vec3(uHinge, 0.0); lodR = lodRz(uFlap); }',
          'objectNormal = lodR * objectNormal; if (lodB > 0.5) objectNormal = mat3(uBody) * objectNormal;'].join('\n'))
          .replace('#include <begin_vertex>', ['#include <begin_vertex>',
            'transformed = lodC + lodR * (transformed - lodC); if (lodB > 0.5) transformed = (uBody * vec4(transformed, 1.0)).xyz; transformed *= lodH;'].join('\n'));
      sh.fragmentShader = 'varying vec4 vLodk;\nvarying vec3 vHelmP;\nvarying vec2 vCov;\nuniform sampler2D uHelmet;\nuniform sampler2D uCover;\nuniform vec3 uAccent;\nuniform vec3 uTcam;\nuniform float uLed;\nuniform sampler2D uTyre;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', [
          // the livery is fetched outside the branch: implicit derivatives (mip selection) are only defined in uniform control flow, and
          // inside the branch the quads that straddle a part edge picked random mips (sparkling seams on the mid / far cars)
          'float lodS = vLodk.x; vec3 lodCol = vColor; vec4 lodMap = texture2D(map, vUv);',
          'if (lodS > 0.5 && lodS < 1.5) lodCol = mapTexelToLinear(lodMap).rgb;',
          'else if (lodS > 2.5 && lodS < 3.5) { vec2 hu = vec2(atan(vHelmP.z, vHelmP.x - 0.16) * 0.159155 + 0.5, clamp((vHelmP.y - 0.665) / 0.21, 0.0, 1.0)); lodCol = mapTexelToLinear(texture2D(uHelmet, hu)).rgb; }',
          'else if (lodS > 5.5) lodCol = mapTexelToLinear(texture2D(uCover, vCov)).rgb;',
          'else if (lodS > 4.5) lodCol = uTcam;',
          'else if (lodS > 3.5) { vec4 lodT = mapTexelToLinear(texture2D(uTyre, vUv)); lodCol = mix(vColor, lodT.rgb, lodT.a); }',
          'diffuseColor.rgb *= lodCol;'].join('\n'))
        .replace('#include <color_fragment>', '')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vLodk.z;')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vLodk.y;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (lodS > 1.5 && lodS < 2.5) totalEmissiveRadiance += vColor * uLed;')
        .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef CLEARCOAT\nmaterial.clearcoat *= vLodk.w;\n#endif')
        .replace('#include <lights_fragment_maps>', paintSpecGLSL('if (lodS < 0.5 || lodS > 1.5) { kB = 1.0; kC = 1.0; }'));
    };
    m.customProgramCacheKey = () => 'ei-carlod';
    return m;
  }
  // all contact shadows of a race in one draw call: a world-space quad per car, rewritten every frame (main.js adds it to the scene)
  class ContactShadows {
    constructor(cars) {
      this.cars = cars; const n = cars.length; const pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), idx = [];
      for (let i = 0; i < n; i++) { uv.set([0, 1, 1, 1, 0, 0, 1, 0], i * 8); const b = i * 4; idx.push(b, b + 2, b + 1, b + 2, b + 3, b + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
      this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      this.mesh.name = 'contactShadows'; this.mesh.frustumCulled = false; this.mesh.renderOrder = -1; this.mesh.matrixAutoUpdate = false;
      this.v = new THREE.Vector3(); this.m = new THREE.Matrix4();
      // quad corners in car space (x forward, z right), 2 cm above the road
      this.local = [[SHADOW.cx - SHADOW.w / 2, -SHADOW.h / 2], [SHADOW.cx + SHADOW.w / 2, -SHADOW.h / 2], [SHADOW.cx - SHADOW.w / 2, SHADOW.h / 2], [SHADOW.cx + SHADOW.w / 2, SHADOW.h / 2]];
    }
    update() {
      const p = this.mesh.geometry.attributes.position, a = p.array, v = this.v;
      this.cars.forEach((c, i) => {
        const g = c.group; g.updateMatrix(); const vis = g.visible && c.blobOn !== false;
        for (let k = 0; k < 4; k++) { const L = this.local[k]; if (vis) v.set(L[0], 0.02, L[1]).applyMatrix4(g.matrix); else v.set(0, -1e4, 0); const q = (i * 4 + k) * 3; a[q] = v.x; a[q + 1] = v.y; a[q + 2] = v.z; }
      });
      p.needsUpdate = true;
    }
  }
  CarGLB.ContactShadows = ContactShadows;

  // ---------------------------------------------------------------- livery upgrades, a slice per frame
  // Bots start a race on a 512 livery (fast to paint) and get their full sheet composed in the background, a few milliseconds per
  // frame, nearest car first; finished sheets stay cached for later races.
  const jobs = []; let jobRun = null;
  // Proximity resolution: every half second the NEAR_N[quality] bots closest to a camera (within NEAR_IN m, kept until NEAR_OUT m)
  // are queued for a NEAR_RES[quality] sheet (High 2 at 4096; Low / Medium none); a bot that drops out goes back to its cached base sheet and the big one is freed, so VRAM
  // stays bounded (base sheets for the field + NEAR_N big ones). Medium stays on its 1536 base sheets (>= 1 texel per pixel for a car
  // ahead in the chase / cockpit view at Medium's canvas): every swap to 2048 was ~0.8-1.2 s of canvas painting on the main thread
  // (3 ms of every frame for ~300 frames) plus a 16 MB upload, again each time a bot came back into range (PERF).
  const NEAR_RES = { low: 0, medium: 0, high: 4096 }, NEAR_N = { low: 0, medium: 0, high: 2 }, NEAR_IN = 45, NEAR_OUT = 75; let nearT = 0;
  const nearList = [];
  function proximity(cars, eyes) {
    const now = performance.now(); if (now - nearT < 500) return; nearT = now;
    const n = NEAR_N[EI.quality] != null ? NEAR_N[EI.quality] : 4; nearList.length = 0;
    for (const c of cars) { const L = c._livery; if (!L || L.near <= L.base) continue; let d = Infinity; for (const e of eyes) d = Math.min(d, Math.hypot(c.x - e.x, c.z - e.z)); c._livD = d; nearList.push(c); }
    nearList.sort((a, b) => a._livD - b._livD);
    nearList.forEach((c, i) => {
      const L = c._livery; const isNear = i < n && c._livD < (L.cur >= L.near ? NEAR_OUT : NEAR_IN);
      const want = isNear ? L.near : L.base; if (want === L.cur && !jobs.some(j => j.car === c)) return;
      for (let k = jobs.length - 1; k >= 0; k--) if (jobs[k].car === c && jobs[k].size !== want) jobs.splice(k, 1);
      if (want === L.cur) return;
      const key = liveryKey(c.team, c.num, L.code, want);
      if (want < L.cur && texCache[key]) {   // back to the cached base sheet; free the big one
        const big = texCache[liveryKey(c.team, c.num, L.code, L.cur)]; L.apply(texCache[key]);
        if (big) { big.dispose(); delete texCache[liveryKey(c.team, c.num, L.code, big.image.width)]; }
        return;
      }
      if (texCache[key]) { L.apply(texCache[key]); return; }
      if (!jobs.some(j => j.car === c && j.size === want) && !(jobRun && jobRun.j.car === c && jobRun.j.size === want)) jobs.push({ car: c, code: L.code, size: want, apply: L.apply });
    });
  }
  CarGLB.pump = function (budgetMs, cars, eyes) {
    proximity(cars, eyes);
    const t0 = performance.now();
    while (performance.now() - t0 < budgetMs) {
      if (!jobRun) {
        let best = -1, bd = Infinity;
        for (let i = 0; i < jobs.length; i++) {
          const c = jobs[i].car; if (cars.indexOf(c) < 0) { jobs.splice(i--, 1); continue; }
          let d = Infinity; for (const e of eyes) d = Math.min(d, Math.hypot(c.x - e.x, c.z - e.z)); if (d < bd) { bd = d; best = i; }
        }
        if (best < 0) return; const j = jobs.splice(best, 1)[0]; jobRun = { j, gen: composeLiveryGen(j.car.team, j.car.num, j.code, j.size) };
      }
      const r = jobRun.gen.next(); if (r.done) { if (jobRun.j.car && cars.indexOf(jobRun.j.car) >= 0) jobRun.j.apply(r.value); jobRun = null; }
    }
  };
  CarGLB.pending = () => jobs.length + (jobRun ? 1 : 0);

  // ---------------------------------------------------------------- build
  // returns the EI.CarModel.build shape plus: lodMat, pose(spin, steerAngle, flapRot, body), mid / far meshes (bots) and the
  // shadow proxy geometry. Player cars ('hi') also get the cockpit, the live mirrors and the wheel display.
  const LIVERY_RES = CarGLB.LIVERY_RES = { low: [768, 1536], medium: [1024, 2048], high: [2048, 4096] };   // [bots, players] (agreed with PERF, wave 6)
  function build(car, lod) {
    if (!CarGLB.ready) return EI.CarModel.build(car);
    const lo = lod === 'lo'; const detailed = !lo && car.isPlayer !== false;
    const T = template(lo ? 'lo' : 'hi', detailed), TL = template('lo', false);
    const code = carCode(car);
    // livery resolution per quality: [bots, player cars]. Bots start on a 512 sheet and are upgraded in the background (pump);
    // player cars start at <= 2048 and a 4096 sheet (High) follows the same way, so the race build never stalls on it.
    const res = LIVERY_RES[EI.quality] || LIVERY_RES.medium; const full = lo ? res[0] : res[1];
    let tex = texCache[liveryKey(car.team, car.num, code, full)];
    // painted now, at the race build (the team layer once per team, then a small per-car pass), so nothing paints during the race on
    // Low / Medium; CarGLB.asyncLiveries = the old 512 stand-in + background upgrade
    if (!tex) tex = composeLivery(car.team, car.num, code, lo && CarGLB.asyncLiveries ? 512 : Math.min(full, 2048));
    const paint = paintMaterial(tex), lm = lodMaterial(tex, car, T), U = lm.userData.u;
    // per-car livery state for the background upgrades: base = this quality's size, near = the size the cars closest to a camera
    // get (see pump); cur = what the car wears now
    const LV = car._livery = { code, base: liverySize(car.team, full), near: lo && NEAR_N[EI.quality] ? liverySize(car.team, Math.max(full, NEAR_RES[EI.quality] || 0)) : liverySize(car.team, full), cur: tex.image.width,
      apply: (t) => { const old = paint.map; paint.map = t; lm.map = t; LV.cur = t.image.width;
        // the 512 stand-in is never used again once a real sheet exists: free its GPU copy and canvas
        if (old && old !== t && old.image && old.image.width === 512) { old.dispose(); delete texCache[liveryKey(car.team, car.num, code, 512)]; } } };
    if (tex.image.width < LV.base) {
      jobs.push({ car, code, size: LV.base, apply: LV.apply });
      posMap(Math.min(LV.base, 2048));   // rasterised now, at the race build, not in the first upgrade mid-race
    }
    if (LV.near > LV.base) posMap(Math.min(LV.near, 2048));
    if (!shared._floor) shared._floor = carbonMaterial({ dark: 0x010102, light: 0x07080a, clearcoat: 0.18, env: 0.22, ckMask: 0 });
    const g = new THREE.Group(); const body = new THREE.Group(); g.add(body);
    const mk = (geo, mat, parent, name) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = false; m.receiveShadow = false; parent.add(m); return m; };
    const hiBody = [mk(T.paint, paint, body, 'car_paint'), mk(T.carbon, shared.carbon, body, 'car_carbon'), mk(T.floor, shared._floor, body, 'car_floor')];
    const parts = mk(T.lod, lm, g, 'car_parts');
    // dummies that hold the animated state car.js writes (rotation.z of the flap); the helmet proxy toggles the shader's helmet
    const flap = new THREE.Object3D(); flap.rotation.z = FLAP_CLOSED;
    const helmet = { get visible() { return U.uHelmVis.value > 0.5; }, set visible(v) { U.uHelmVis.value = v ? 1 : 0; }, rotation: { y: 0 } };
    // ---- cockpit: detailed steering wheel with live display, gloved hands, sleeves, live mirrors (player cars only)
    let cockpit = null, screen = null, screenTex = null; const steer = new THREE.Group();
    if (detailed) {
      cockpit = buildCockpit(car, body); steer.add(cockpit.steer); body.add(steer); screen = cockpit.screen; screenTex = cockpit.screenTex;
      // lo-LOD copy of the bodywork, shown only while the mirrors render
      const loBody = [mk(TL.paint, paint, body, 'car_paint_lo'), mk(TL.carbon, shared.carbon, body, 'car_carbon_lo'), mk(TL.floor, shared._floor, body, 'car_floor_lo')];
      for (const m of loBody) m.visible = false;
      if (T.mirrorGlass.length) { const mir = buildMirrors(T.mirrorGlass, body, g, { hi: hiBody, lo: loBody, ck: cockpit.hide }); if (mir) screen.userData.mirrors = mir; }
      // lite(on): the player's own car drawn from the lo LOD (bodywork + parts, ~45k instead of ~210k triangles) - main.js turns it on
      // for the outside cameras on Low; the cockpit / T-cam views (and the mirrors, which swap the bodywork themselves) keep the detail
      let liteOn = false;
      g.userData.lite = (on) => { on = !!on; if (on === liteOn) return; liteOn = on; for (const m of hiBody) m.visible = !on; for (const m of loBody) m.visible = on; parts.geometry = on ? TL.lod : T.lod; for (const o of cockpit.hide) o.visible = !on; };   // lite: the lo parts carry the GLB's own wheel, so the procedural wheel / arms / torso go too
    }
    // brake glow: hot discs show through the gap between the rim lip and the wheel cover (outer face) and on the inner face
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff6a1c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const glow = mk(T.glow, glowMat, g, 'car_glow'); glow.renderOrder = 2; glowMat.visible = false;
    let heat = 0, lastT = 0, ledOn = -1;
    const animate = (steerIn, helmetYaw) => {
      if (cockpit) cockpit.animate(steerIn);
      if (helmetYaw != null) U.uHelm.value = helmetYaw;
      const now = performance.now() * 0.001; const dt = Math.min(0.1, Math.max(0, now - (lastT || now))); lastT = now;
      // discs heat with brake pressure x speed, cool over ~1.5 s
      const v = Math.abs(car.v || 0), target = (car.brake || 0) * Math.min(1, Math.max(0, (v - 12) / 45));
      heat += (target - heat) * (1 - Math.exp(-dt / (target > heat ? 0.35 : 1.4)));
      const op = Math.min(1, heat * 1.15); if (Math.abs(op - glowMat.opacity) > 0.01) { glowMat.opacity = op; glowMat.visible = op > 0.02; }
      // rain light: steady, flashing at 4 Hz while ERS deploys
      const on = car.ersActive ? ((now * 8) | 0) % 2 : 2; if (on !== ledOn) { ledOn = on; U.uLed.value = on === 2 ? 0.6 : on ? 3.2 : 0.15; }
    };
    // per-frame pose of the shader-animated parts (wheel spin / steer, DRS flap, body roll / pitch / heave)
    const pose = (spin, steerAngle, flapRot, bodyObj) => {
      U.uSpin.value = spin; U.uSteer.value = steerAngle; U.uFlap.value = FLAP_CLOSED - flapRot;
      if (bodyObj) { bodyObj.updateMatrix(); U.uBody.value.copy(bodyObj.matrix); }
    };
    let mid = null, far = null;
    if (lo) {
      mid = new THREE.Mesh(T.mid, lm); mid.name = 'car_mid'; mid.visible = false;
      far = new THREE.Mesh(T.far, lm); far.name = 'car_far'; far.visible = false; far.userData.geos = [T.far, T.vfar];   // main.js swaps in the vfar silhouette beyond ~90 m
    }
    return { group: g, body, wheels: [], frontPivots: [], flap, helmet, bodyMat: paint, flapClosed: FLAP_CLOSED, flapOpen: FLAP_OPEN, lod: lod || 'hi', steer, animate, screen, screenTex,
      lodMat: lm, pose, mid, far, shadowGeo: EI.quality === 'low' ? TL.far : TL.mid, glow };   // Low: the sun-shadow proxy from the far LOD (1024 map, ~10 cm texels: same shadow)
  }

  EI.CarGLB = CarGLB;
})();
