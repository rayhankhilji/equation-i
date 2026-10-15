// Equation I - GLB car model loader (drop-in replacement for EI.CarModel.build)
// Loads assets/models/ei-car-{hi,lo}.glb (x forward, y up, z right, metres, ground at y = 0, axles at
// x = +1.75 / -1.85) plus the material-ID / AO atlases, and composes a per-team livery texture at runtime.
// build(car, lod) returns the same object shape as EI.CarModel.build(car):
//   { group, body, wheels[FL,FR,RL,RR], frontPivots[FL,FR], flap, helmet, bodyMat }
// The flap keeps CarModel's angle convention (rotation.z = 0.5 closed, -0.15 open); flapClosed / flapOpen are
// also exposed on the returned object.
window.EI = window.EI || {};
(function () {
  const BASE = 'assets/models/';
  const FLAP_CLOSED = 0.5, FLAP_OPEN = -0.15;
  const cache = { hi: null, lo: null, meta: null, idImg: null, aoImg: null };
  const texCache = {}, helmetMats = {}, shared = {};
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

  // shared (per-material-name) tweaks applied once to the loaded scenes
  function prepare(scene) {
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material; if (!m) return;
      const n = m.name || '';
      if (!shared[n]) {
        shared[n] = m;
        m.envMapIntensity = n === 'carbon' ? 0.8 : n === 'metal' || n === 'mirror' || n === 'cover' ? 1.0 : 0.6;
        if (n === 'metal' || n === 'mirror') { m.metalness = 0.9; m.roughness = 0.3; } else if (n === 'cover') { m.metalness = 0.75; m.roughness = 0.35; } else { m.metalness = 0.1; m.roughness = 0.7; }
        if (n === 'tyre') { m.color.set(0x121214); m.roughness = 0.9; m.metalness = 0.0; m.envMapIntensity = 0.3; }
        if (n === 'matte' || n === 'fabric') { m.color.set(0x1a1b1f); m.roughness = 0.9; }
        if (n === 'carbon') { m.color.set(0x1c1d21); m.metalness = 0.3; m.roughness = 0.42; }
        if (n === 'cover') { m.color.set(0x2a2b30); }
        if (n === 'glass') { m.color.set(0x0c0d10); m.metalness = 0.6; m.roughness = 0.05; }
        if (n === 'led') { m.emissive.set(0xff1a1a); m.emissiveIntensity = 0.6; }
      } else o.material = shared[n];
      const name = o.name || '';
      o.castShadow = /^(body_main|wing_|floor_main|wheel_.*_tyre|halo|susp_fin|mirror_main)/.test(name);
      o.receiveShadow = false;
    });
  }

  // ---------------------------------------------------------------- livery composition
  const PART_ROLES = {   // material-ID colour class -> colour role per atlas part
    body: { red: 'primary', yellow: 'primary', orange: 'primary', green: 'carbon', blue: 'carbon' },
    front_wing: { red: 'primary', blue: 'secondary', yellow: 'secondary', green: 'primary', orange: 'primary' },
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
    const c = document.createElement('canvas'); c.width = size; c.height = size; const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false; ctx.drawImage(cache.idImg, 0, 0, size, size);
    const im = ctx.getImageData(0, 0, size, size); const d = im.data; const src = new Uint8ClampedArray(d);   // keep the ID colours while we overwrite d
    const roles = { primary: hexRgb(team.primary), secondary: hexRgb(team.secondary), accent: hexRgb(team.accent), carbon: [30, 31, 34], foam: [28, 28, 30], none: [26, 27, 30] };
    if (DARK_BODIES[team.id]) { /* keep */ }
    // fill: per atlas part, map ID colours to team colours
    const parts = Object.keys(atlas);
    const fillRect = (x0, y0, w, h, table) => {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
        const i = (y * size + x) * 4; const cls = classify(src[i], src[i + 1], src[i + 2]);
        const col = roles[(table && table[cls]) || 'none'] || roles.none; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
      }
    };
    fillRect(0, 0, size, size, null);   // everything unassigned -> dark
    for (const p of parts) { const [u0, v0, w, h] = atlas[p]; fillRect(Math.round(u0 * size), Math.round((1 - v0 - h) * size), Math.round(w * size), Math.round(h * size), PART_ROLES[p]); }
    ctx.putImageData(im, 0, 0);
    ctx.imageSmoothingEnabled = true;
    // ---- team pattern bands + decals, drawn in the local frames of the UV anchors (metres)
    const frame = (name) => {
      const a = anchors[name]; if (!a) return null;
      const px = a.u * size, py = (1 - a.v) * size; const f = [a.fwd[0] * size, -a.fwd[1] * size], u = [a.up[0] * size, -a.up[1] * size];
      const lf = Math.hypot(f[0], f[1]), lu = Math.hypot(u[0], u[1]); if (lf < 1e-6 || lu < 1e-6) return null;
      return { px, py, f, u, lf, lu };
    };
    const withFrame = (name, fn) => { const fr = frame(name); if (!fr) return; ctx.save(); ctx.setTransform(fr.f[0] / fr.lf, fr.f[1] / fr.lf, -fr.u[0] / fr.lu, -fr.u[1] / fr.lu, fr.px, fr.py); fn(fr, fr.lu); ctx.restore(); };
    // rectangle in metres relative to the anchor (x along reading direction, y up)
    const band = (name, x0, x1, y0, y1, color) => withFrame(name, (fr, ppm) => { const sx = fr.lf / fr.lu; ctx.fillStyle = color; ctx.fillRect(x0 * ppm * sx, -y1 * ppm, (x1 - x0) * ppm * sx, (y1 - y0) * ppm); });
    const text = (name, str, hM, color, dx, dy, font) => withFrame(name, (fr, ppm) => {
      const sx = fr.lf / fr.lu; ctx.scale(sx, 1); ctx.fillStyle = color; ctx.font = '900 ' + Math.max(6, hM * ppm) + 'px ' + (font || 'Arial Black, Arial, sans-serif'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(str, (dx || 0) * ppm, -(dy || 0) * ppm);
    });
    const P = team.primary, S = team.secondary, A = team.accent;
    const lum = (h) => { const c = new THREE.Color(h); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
    const NC = team.numberColor || (lum(P) > 0.4 ? '#101010' : '#ffffff');     // text on primary surfaces
    const SC = lum(S) > 0.4 ? '#101010' : '#ffffff';                          // text on secondary surfaces (endplates)
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
    // decals: race number on the nose and engine cover, driver code on the sidepods, team on the endplates
    const sponsor = { rossa: 'EI SHELL', argent: 'EI PETRO', taurus: 'EI ORACLE', papaya: 'EI OKX', verdant: 'EI ARAMCO', alpenne: 'EI BWT', wilhelm: 'EI GULF', hayes: 'EI MONEY', kinetik: 'EI STAKE', vector: 'EI VISA' }[team.id] || 'EI';
    text('nose', String(num), 0.22, NC, 0, 0.2); text('nose2', 'EI', 0.1, NC, 0, 0);
    text('engineL', String(num), 0.2, NC, -0.6, -0.08); text('engineR', String(num), 0.2, NC, -0.6, -0.08);
    text('engineL', sponsor, 0.07, NC, 0.6, -0.16); text('engineR', sponsor, 0.07, NC, 0.6, -0.16);
    if (code) { text('podL', code, 0.1, NC, 0, 0.1); text('podR', code, 0.1, NC, 0, 0.1); }
    text('chassisL', team.short, 0.07, NC, 0, 0); text('chassisR', team.short, 0.07, NC, 0, 0);
    const tname = team.name.length > 13 ? team.short : team.name.toUpperCase();
    text('endplateL', tname, 0.07, SC, 0, 0.0); text('endplateR', tname, 0.07, SC, 0, 0.0);
    text('endplateL', String(num), 0.12, SC, 0, -0.14); text('endplateR', String(num), 0.12, SC, 0, -0.14);
    text('wingtop', 'EQUATION I', 0.05, NC, 0, 0); text('airbox', String(num), 0.08, NC, 0, 0);
    // ambient occlusion
    ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(cache.aoImg, 0, 0, size, size); ctx.globalCompositeOperation = 'source-over';
    const tex = new THREE.CanvasTexture(c); tex.flipY = false; tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8; tex.needsUpdate = true;
    texCache[key] = tex; return tex;
  }

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

  // ---------------------------------------------------------------- build
  function build(car, lod) {
    if (!CarGLB.ready) return EI.CarModel.build(car);
    const src = lod === 'lo' ? cache.lo : cache.hi; const meta = cache.meta || {};
    const code = (car.isPlayer && car.name ? car.name : (car.driver && car.driver.name) || car.team.short).replace(/^[A-Z]\. ?/, '').slice(0, 3).toUpperCase();
    const tex = composeLivery(car.team, car.num, code, lod === 'lo' ? 1024 : 2048);
    const paint = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.25, roughness: 0.3, envMapIntensity: 1.1, side: THREE.DoubleSide });
    if (!helmetMats[car.team.id]) helmetMats[car.team.id] = new THREE.MeshStandardMaterial({ color: new THREE.Color(car.team.accent), metalness: 0.3, roughness: 0.2 });
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
    const bodyList = [], helmetList = [], flapList = [], steerList = [], wheelLists = { fl: [], fr: [], rl: [], rr: [] };
    for (const o of meshes) {
      const n = o.name || ''; const mname = o.material && o.material.name;
      if (mname === 'paint') o.material = paint; else if (mname === 'helmet') o.material = helmetMats[car.team.id];
      if (n.startsWith('driver_wheel')) { steerList.push(o); continue; }
      const w = /^wheel_(fl|fr|rl|rr)_/.exec(n);
      if (w) { const c = w[1]; if (/tyre/.test(n) || pivots[c].userData.set !== true) { pivots[c].position.set(o.position.x, o.position.y, o.position.z); pivots[c].userData.set = /tyre/.test(n); } wheelLists[c].push(o); continue; }
      if (n.startsWith('drsflap_')) { flapList.push(o); continue; }
      if (n.startsWith('helmet_') || n === 'driver_belts') { helmetList.push(o); continue; }
      bodyList.push(o);
    }
    const world = (o) => o.matrixWorld;
    for (const m of mergeMeshes(bodyList, world)) body.add(m);
    for (const m of mergeMeshes(helmetList, world)) helmet.add(m);
    // flap: geometry is local to the hinge node, keep it local
    for (const m of mergeMeshes(flapList, (o) => new THREE.Matrix4())) flapB.add(m);
    for (const c of corners) { const pv = pivots[c].position; const inv = new THREE.Matrix4().makeTranslation(-pv.x, -pv.y, -pv.z); for (const m of mergeMeshes(wheelLists[c], (o) => inv.clone().multiply(o.matrixWorld))) spins[c].add(m); }
    // ---- steering wheel: pivot at its centre, rotates about the (tilted) column axis; gloved hands ride on the rim
    const steer = new THREE.Group(); let screen = null, screenTex = null, hands = [], forearms = [];
    if (steerList.length) {
      const bb = new THREE.Box3(); for (const o of steerList) bb.expandByObject(o);
      const ctr = bb.getCenter(new THREE.Vector3()); steer.position.copy(ctr); body.add(steer);
      const inv = new THREE.Matrix4().makeTranslation(-ctr.x, -ctr.y, -ctr.z);
      for (const m of mergeMeshes(steerList, (o) => inv.clone().multiply(o.matrixWorld))) { if (m.material.name === 'screen') { const sb = new THREE.Box3().setFromObject(m); m.userData.screenBox = sb; } steer.add(m); }
      const size = bb.getSize(new THREE.Vector3()); const rimR = Math.max(0.09, size.z * 0.5);
      // live display plane facing the driver (-x), sized to the screen part if present
      const sc = document.createElement('canvas'); sc.width = 256; sc.height = 128; screenTex = new THREE.CanvasTexture(sc); screenTex.encoding = THREE.sRGBEncoding;
      let sw = Math.min(0.2, size.z * 0.55), sh = sw * 0.5, sy = size.y * 0.12, sx = -size.x * 0.5 - 0.004;
      steer.traverse(o => { if (o.userData && o.userData.screenBox) { const b = o.userData.screenBox; const c = b.getCenter(new THREE.Vector3()); const sz = b.getSize(new THREE.Vector3()); sw = Math.max(0.06, sz.z); sh = Math.max(0.03, sz.y); sy = c.y - ctr.y; sx = b.min.x - ctr.x - 0.003; } });
      screen = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: screenTex })); screen.rotation.y = -Math.PI / 2; screen.position.set(sx, sy, 0); steer.add(screen); screen.userData.canvas = sc;
      // hands (gloves) at quarter-to-three, forearms from the shoulders
      const glove = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.85 }); const suit = new THREE.MeshStandardMaterial({ color: new THREE.Color(car.team.primary), roughness: 0.8 });
      for (const sgn of [1, -1]) {
        const h = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.055), glove); h.position.set(-0.03, -0.01, sgn * (rimR + 0.01)); h.rotation.x = sgn * 0.3; steer.add(h); hands.push(h);
        const fa = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1, 8), suit); fa.visible = true; body.add(fa); forearms.push(fa);
      }
    }
    const steerAxis = new THREE.Vector3(1, 0.42, 0).normalize(); const shoulder = [new THREE.Vector3(0.28, 0.62, 0.2), new THREE.Vector3(0.28, 0.62, -0.2)];
    const _q = new THREE.Quaternion(), _hp = new THREE.Vector3(), _d = new THREE.Vector3(), _mid = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
    const animate = (steerIn, helmetYaw) => {
      if (!steerList.length) return;
      _q.setFromAxisAngle(steerAxis, -steerIn * 1.5); steer.quaternion.copy(_q);
      hands.forEach((h, k) => { h.getWorldPosition(_hp); body.worldToLocal(_hp); const sh = shoulder[k]; _d.subVectors(_hp, sh); const len = _d.length(); const fa = forearms[k]; _mid.addVectors(sh, _hp).multiplyScalar(0.5); fa.position.copy(_mid); fa.scale.set(1, len, 1); fa.quaternion.setFromUnitVectors(_up, _d.normalize()); });
      if (helmet && helmetYaw != null) helmet.rotation.y = helmetYaw;
    };
    // tyre compound stripe (soft/medium/hard colour) on both sidewalls
    const ringMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(car.tyre.color), roughness: 0.7, side: THREE.DoubleSide });
    const r1 = new THREE.RingGeometry(0.262, 0.292, 40); r1.translate(0, 0, 0.176); const r2 = new THREE.RingGeometry(0.262, 0.292, 40); r2.translate(0, 0, -0.176);
    const ringGeo = mergeMeshes([new THREE.Mesh(r1, ringMat), new THREE.Mesh(r2, ringMat)], () => new THREE.Matrix4())[0].geometry;
    for (const c of corners) { const r = new THREE.Mesh(ringGeo, ringMat); spins[c].add(r); }
    const wheels = corners.map((c) => spins[c]); const frontPivots = [pivots.fl, pivots.fr];
    // contact shadow (same as CarModel)
    const sc = document.createElement('canvas'); sc.width = 128; sc.height = 64; const sctx = sc.getContext('2d'); const grd = sctx.createRadialGradient(64, 32, 4, 64, 32, 60); grd.addColorStop(0, 'rgba(0,0,0,0.6)'); grd.addColorStop(0.6, 'rgba(0,0,0,0.3)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); sctx.fillStyle = grd; sctx.fillRect(0, 0, 128, 64);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 3.0), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 })); blob.rotation.x = -Math.PI / 2; blob.position.set(-0.1, 0.03, 0); g.add(blob);
    return { group: g, body, wheels, frontPivots, flap, helmet, bodyMat: paint, flapClosed: FLAP_CLOSED, flapOpen: FLAP_OPEN, lod: lod || 'hi', steer, animate, screen, screenTex };
  }

  EI.CarGLB = CarGLB;
})();
