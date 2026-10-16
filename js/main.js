// Equation I - bootstrap, menu, render loop and cameras
window.EI = window.EI || {};
(function () {
  const U = EI.U, $ = (id) => document.getElementById(id);
  const DT = 1 / 120;
  let renderer, scene, track, scenery, envMap, race = null, viewports = [], cameras = [], camModes = [], sun, hemi, lastT = 0, acc = 0, paused = false, hudT = 0;
  let engines = [], shake = 0, resultsShown = false;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3();
  const CAM_MODES = ['chase', 'cockpit', 'tv'];

  let composer = null, bloomPass = null, fxaaPass = null, speedPass = null, particles = null, skyMesh = null;
  // the race partners' logos in the menu footer (drawn with the same painters as the trackside boards)
  function drawPartnerLogos() {
    if (!EI.Ads) return;
    document.querySelectorAll('canvas.partner-logo').forEach((c) => {
      const ctx = c.getContext('2d'); const h = c.height * 0.8; ctx.clearRect(0, 0, c.width, c.height);
      if (c.dataset.brand === 'lumi') EI.Ads.lumiLogo(ctx, 2, c.height * 0.1, h, '#efe2ff'); else EI.Ads.intakeLogo(ctx, 2, c.height * 0.1, h, '#ffffff');
    });
  }
  // the circuit is chosen in the menu; a change reloads the page with ?track=<id> (the whole scene is built once at start-up)
  const trackId = (() => { try { const q = new URLSearchParams(location.search).get('track'); const id = q || localStorage.getItem('ei-track') || 'silverstone'; return EI.TRACKS[id] ? id : 'silverstone'; } catch (e) { return 'silverstone'; } })();
  function fillTrackCard(d) {
    const turns = d.corners.filter(c => c.t != null).length || d.corners.filter(c => !/Straight/i.test(c.name)).length;
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    set('track-kicker', d.country); set('track-name', d.name); set('track-meta', (d.location.split(',')[0]) + ' · ' + d.direction + ' · 3 sectors');
    set('track-km', (d.lapLength / 1000).toFixed(3)); set('track-turns', turns); set('track-drs', d.drs.length);
    const meta = $('menu-meta'); if (meta) meta.innerHTML = '<b>Round ' + (Object.keys(EI.TRACKS).indexOf(d.id) + 1) + '</b> &middot; ' + (d.gp || d.name + ' Grand Prix') + '<br>' + (d.circuit || d.name) + ' &middot; Race day';
    const sel = $('opt-track'); if (sel && !sel.options.length) { for (const id in EI.TRACKS) { const o = document.createElement('option'); o.value = id; o.textContent = EI.TRACKS[id].name + ' · ' + (EI.TRACKS[id].gp || ''); sel.appendChild(o); } sel.value = d.id; sel.addEventListener('change', () => { try { localStorage.setItem('ei-track', sel.value); } catch (e) { } const u = new URL(location.href); u.searchParams.set('track', sel.value); location.href = u.toString(); }); }
  }
  function init() {
    const canvas = $('gl');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    // colour grade baked into every shader: vivid saturation, a little contrast and a warm lift
    THREE.ShaderChunk.tonemapping_fragment = '#if defined( TONE_MAPPING )\n gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );\n#endif\n' +
      '{ vec3 c = gl_FragColor.rgb; float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, 1.45); c = (c - 0.5) * 1.08 + 0.5; c *= vec3(1.03, 1.0, 0.97); gl_FragColor.rgb = clamp(c, 0.0, 1.0); }\n';
    scene = new THREE.Scene();
    // physically based sky, with the sun light aligned to it and a PMREM environment for reflections / ambient
    // per-circuit light: Silverstone keeps its English afternoon; Monaco gets a high late-May sun from over the sea (so the
    // city facades facing the harbour are lit), a clearer sky, sea haze on the horizon and warm stone bounce light
    const LOOKS = { monaco: { elev: 52, azim: 338, turb: 1.9, ray: 1.5, mie: 0.003, horizon: 0xbcd3ea, fog: [1500, 7500], fogLow: [800, 3800], hemi: [0xa8cdf2, 0x8a7a66, 0.42], sun: [0xfff3e0, 2.65] } };
    const LK = Object.assign({ elev: 42, azim: 205, turb: 2.5, ray: 2.0, mie: 0.004, horizon: 0xa9c4e4, fog: [1300, 6000], fogLow: [700, 3200], hemi: [0x9fc4ee, 0x3f5a2e, 0.35], sun: [0xfff1dd, 2.4] }, LOOKS[trackId] || {}); EI.look = LK;
    const sunDir = new THREE.Vector3(); const elev = LK.elev, azim = LK.azim; const phi = THREE.MathUtils.degToRad(90 - elev), theta = THREE.MathUtils.degToRad(azim); sunDir.setFromSphericalCoords(1, phi, theta);
    skyMesh = new THREE.Sky(); skyMesh.scale.setScalar(5500); const su = skyMesh.material.uniforms; su.turbidity.value = LK.turb; su.rayleigh.value = LK.ray; su.mieCoefficient.value = LK.mie; su.mieDirectionalG.value = 0.85; su.sunPosition.value.copy(sunDir); scene.add(skyMesh);
    const t0 = performance.now(); const pm = new THREE.PMREMGenerator(renderer); pm.compileEquirectangularShader();
    const skyScene = new THREE.Scene(); const sky2 = new THREE.Sky(); sky2.scale.setScalar(5500); sky2.material.uniforms.turbidity.value = LK.turb; sky2.material.uniforms.rayleigh.value = LK.ray; sky2.material.uniforms.sunPosition.value.copy(sunDir); skyScene.add(sky2);
    scene.environment = pm.fromScene(skyScene, 0.02).texture; pm.dispose(); const tPmrem = Math.round(performance.now() - t0);
    const horizon = LK.horizon; scene.fog = new THREE.Fog(horizon, LK.fog[0], LK.fog[1]);
    hemi = new THREE.HemisphereLight(LK.hemi[0], LK.hemi[1], LK.hemi[2]); scene.add(hemi);
    sun = new THREE.DirectionalLight(LK.sun[0], LK.sun[1]); sun.castShadow = true; this_sunDir = sunDir;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.near = 10; sun.shadow.camera.far = 600;
    sun.shadow.camera.left = -70; sun.shadow.camera.right = 70; sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; sun.shadow.radius = 2;
    scene.add(sun); scene.add(sun.target);
    envMap = scene.environment;
    const timings = {}; let tm = performance.now(); const lap = (k) => { timings[k] = Math.round(performance.now() - tm); tm = performance.now(); };
    const tdata = EI.TRACKS[trackId] || EI.TRACKS.silverstone; EI.trackId = tdata.id;
    track = new EI.Track(tdata); lap('track-math');
    scenery = new EI.Scenery(track); scene.add(scenery.build()); lap('scenery');
    scene.add(track.build(scenery)); lap('track-mesh'); timings.pmrem = tPmrem; EI.debug.timings = timings;
    scene.traverse(o => { if (o.material && o.material.isMeshStandardMaterial && o.material.envMapIntensity === 1) o.material.envMapIntensity = 0.3; });
    particles = new EI.Particles(scene);
    // post-processing (single viewport): bloom + FXAA
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, new THREE.PerspectiveCamera()));
    bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.28, 0.55, 0.88); composer.addPass(bloomPass);
    fxaaPass = new THREE.ShaderPass(THREE.FXAAShader); composer.addPass(fxaaPass);
    // radial speed blur + vignette (only in the High preset)
    speedPass = new THREE.ShaderPass({
      uniforms: { tDiffuse: { value: null }, strength: { value: 0 }, vignette: { value: 0.35 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; uniform float strength; uniform float vignette; varying vec2 vUv; void main(){ vec2 c = vec2(0.5, 0.42); vec2 d = vUv - c; float r = length(d); vec4 col = vec4(0.0); float s = strength * smoothstep(0.15, 0.7, r); for (int i = 0; i < 8; i++) { float t = 1.0 - s * float(i) * 0.012; col += texture2D(tDiffuse, c + d * t); } col /= 8.0; col.rgb *= 1.0 - vignette * smoothstep(0.45, 0.95, r); gl_FragColor = col; }'
    }); composer.addPass(speedPass);
    EI.HUD.drawTrackPreview(track, $('track-preview')); fillTrackCard(track.data);
    setupMenu(); drawPartnerLogos();
    // the GLB car is optional: hide the loading overlay once it is in (or has failed and we fall back to the procedural car)
    const hideLoading = () => $('loading').classList.add('hidden');
    const tp = performance.now(); if (EI.CarGLB) EI.CarGLB.preload().then(() => { timings.preload = Math.round(performance.now() - tp); hideLoading(); }, hideLoading); else hideLoading();
    window.addEventListener('resize', onResize);
    if (U.isTouch()) EI.Input.initTouch($('touch'));
    cameras = [new THREE.PerspectiveCamera(60, 1, 0.3, 6000)]; onResize(); requestAnimationFrame(loop);
  }
  let this_sunDir = null;
  let quality = 'medium';
  function renderView(cam, usePost) {
    if (usePost && composer && quality === 'high') { composer.passes[0].camera = cam; if (speedPass && race) { const car = race.players[0]; const v = Math.abs(car.v); speedPass.uniforms.strength.value = U.clamp((v - 35) / 60, 0, 1) * (CAM_MODES[camModes[0]] === 'cockpit' ? 0.5 : 0.9); } composer.render(); } else renderer.render(scene, cam);
  }
  function setQuality(q) {
    quality = q; const pr = q === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, q === 'high' ? 1.5 : 1.25); renderer.setPixelRatio(pr); if (composer) composer.setPixelRatio(pr);
    const sm = q === 'low' ? 1024 : 2048; if (sun.shadow.mapSize.x !== sm) { sun.shadow.mapSize.set(sm, sm); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    renderer.shadowMap.type = q === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    if (scenery && scenery.group) scenery.group.traverse(o => { if (o.name === 'trees' || o.name === 'crowd') o.castShadow = q === 'high'; });
    EI.quality = q; if (scenery && scenery.setQuality) scenery.setQuality(q); if (EI.Pit && EI.Pit.setQuality) EI.Pit.setQuality(q); if (track && track.setQuality) track.setQuality(q);
    // low: no live mirrors, no grass tufts / decorative instancing named 'detail', fog closer
    scene.traverse(o => { if (/tuft|detail/i.test(o.name || '')) o.visible = q !== 'low'; });
    if (scene.fog) { const L = EI.look || { fog: [1300, 6000], fogLow: [700, 3200] }; const f = q === 'low' ? L.fogLow : L.fog; scene.fog.near = f[0]; scene.fog.far = f[1]; }
    onResize();
  }

  // ------------------------------------------------------------------ menu
  function setupMenu() {
    const teamSel = [$('p1-team'), $('p2-team')];
    teamSel.forEach((sel, k) => { EI.TEAMS.forEach((t, i) => { const o = document.createElement('option'); o.value = i; o.textContent = t.name; sel.appendChild(o); }); sel.value = k === 0 ? 0 : 3; });
    const refresh = () => {
      [0, 1].forEach(k => { const t = EI.TEAMS[+teamSel[k].value]; EI.drawLiveryPreview($('p' + (k + 1) + '-preview'), t, t.drivers[0].num, $('p' + (k + 1) + '-name').value || 'YOU'); });
      $('out-laps').textContent = $('opt-laps').value; $('p2-setup').classList.toggle('hidden', $('opt-players').value !== '2');
      const maxBots = 20 - (+$('opt-players').value); $('opt-bots').max = maxBots; if (+$('opt-bots').value > maxBots) $('opt-bots').value = maxBots; $('out-bots').textContent = $('opt-bots').value;
    };
    ['p1-team', 'p2-team', 'p1-name', 'p2-name', 'opt-laps', 'opt-bots', 'opt-players'].forEach(id => $(id).addEventListener('input', refresh)); refresh();
    $('btn-start').addEventListener('click', () => { EI.Audio.resume(); setQuality($('opt-quality').value); startRace(readConfig()); });
    $('btn-resume').addEventListener('click', () => setPaused(false));
    $('btn-restart').addEventListener('click', () => { setPaused(false); startRace(race.cfg); });
    $('btn-quit').addEventListener('click', () => { setPaused(false); endRace(); });
    $('btn-again').addEventListener('click', () => { $('results').classList.add('hidden'); startRace(race.cfg); });
    $('btn-menu').addEventListener('click', () => { $('results').classList.add('hidden'); endRace(); });
    window.addEventListener('keydown', e => {
      if (!race) return;
      if (e.code === 'Escape' || e.code === 'KeyP') { if (!resultsShown) setPaused(!paused); }
      if (e.code === 'KeyM') { const m = EI.Audio.toggleMute(); EI.HUD.toast(m ? 'Sound muted' : 'Sound on'); }
      if (e.code === 'KeyR' && !paused) startRace(race.cfg);
      if (e.code === 'KeyC') cycleCam(0); if (e.code === 'Slash') cycleCam(1);
    });
  }
  function cycleCam(k) { if (!race || !camModes[k] && camModes[k] !== 0) return; if (k >= race.players.length) return; camModes[k] = (camModes[k] + 1) % CAM_MODES.length; placeCamera(cameras[k], race.players[k], k, true, 0); EI.HUD.toast('P' + (k + 1) + ' camera: ' + CAM_MODES[camModes[k]]); }
  function readConfig() {
    const np = +$('opt-players').value; const players = [];
    for (let k = 0; k < np; k++) players.push({ name: ($('p' + (k + 1) + '-name').value || (k ? 'RIVAL' : 'YOU')).toUpperCase(), teamIndex: +$('p' + (k + 1) + '-team').value, tyre: $('p' + (k + 1) + '-tyre').value });
    return { players, bots: +$('opt-bots').value, laps: +$('opt-laps').value, difficulty: $('opt-diff').value, grid: $('opt-grid').value, assist: $('opt-assist').value, seed: (Math.random() * 1e9) | 0, envMap };
  }
  function setPaused(p) { paused = p; $('pause').classList.toggle('hidden', !p); if (!p) lastT = performance.now(); }

  // ------------------------------------------------------------------ race lifecycle
  function startRace(cfg) {
    endRace(); cfg.envMap = envMap;
    race = new EI.Race(track, cfg);
    for (const c of race.cars) scene.add(c.group);
    viewports = race.players.map((car, k) => EI.HUD.makeViewport(k, car));
    cameras = race.players.map(() => new THREE.PerspectiveCamera(62, 1, 0.25, 6000)); camModes = race.players.map(() => 0);
    engines = race.players.map(() => EI.Audio.createEngine());
    $('menu').classList.add('hidden'); $('results').classList.add('hidden');
    $('touch').classList.toggle('hidden', !(U.isTouch() && race.players.length === 1));
    resultsShown = false; paused = false; lastT = performance.now(); acc = 0; introT = 0; onResize();
    race.players.forEach((car, k) => placeCamera(cameras[k], car, k, true, 0));
    EI.HUD.banner('EQUATION I · ' + track.name.toUpperCase() + ' GP', 2400);
    introLen = race.players.length === 1 ? 8.2 : 2.8;
  }
  function endRace() {
    if (race) for (const c of race.cars) scene.remove(c.group);
    race = null; $('viewports').innerHTML = ''; viewports = []; EI.Audio.stopAll(); engines = [];
    $('lights').classList.add('hidden'); $('banner').classList.add('hidden'); $('touch').classList.add('hidden'); $('menu').classList.remove('hidden');
    cameras = [new THREE.PerspectiveCamera(60, 1, 0.3, 6000)]; onResize();
  }
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h);
    const pr = renderer.getPixelRatio(); if (composer) { composer.setSize(w, h); fxaaPass.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr)); }
    if (particles) particles.setViewportHeight(h * pr / (cameras.length > 1 && w < h ? 2 : 1));
    const rects = layout(cameras.length, w, h);
    cameras.forEach((cam, k) => { const r = rects[k]; cam.aspect = r[2] / r[3]; cam.updateProjectionMatrix(); if (viewports[k]) viewports[k].setRect(r[0], r[1], r[2], r[3]); });
  }
  function layout(n, w, h) {
    if (n <= 1) return [[0, 0, w, h]];
    if (w >= h) return [[0, 0, Math.floor(w / 2) - 1, h], [Math.floor(w / 2) + 1, 0, Math.floor(w / 2) - 1, h]];
    return [[0, 0, w, Math.floor(h / 2) - 1], [0, Math.floor(h / 2) + 1, w, Math.floor(h / 2) - 1]];
  }

  // ------------------------------------------------------------------ cameras
  // ------------------------------------------------------------------ cameras
  // chase: spring-damped follow with yaw lag, lateral offset into the corner, roll with lateral g, speed FOV, surface shake
  // cockpit: head physics (lateral sway, brake dip, rpm vibration, look-to-apex), halo framing
  const _f = new THREE.Vector3(), _l = new THREE.Vector3(), _tgt = new THREE.Vector3(), _look = new THREE.Vector3(), _q = new THREE.Quaternion();
  function camState(cam) { const u = cam.userData; if (!u.cs) u.cs = { yaw: null, roll: 0, lat: 0, fov: 60, sway: 0, dip: 0, shake: 0, blend: 0 }; return u.cs; }
  function surfaceShake(car) { const v = Math.abs(car.v); const base = { asphalt: 0.0012 * v, runoff: 0.002 * v, kerb: 0.035 + 0.001 * v, grass: 0.05 + 0.002 * v, gravel: 0.07 + 0.002 * v }[car.surface] || 0; return base * Math.min(1, v / 8); }
  function placeCamera(cam, car, k, snap, dt) {
    const mode = CAM_MODES[camModes[k] || 0]; const cs = camState(cam);
    const v = Math.abs(car.v); const cx = car.vx != null ? car.vx : cx, cy = car.vy != null ? car.vy : cy, cz = car.vz != null ? car.vz : cz, ch = car.vh != null ? car.vh : ch; const fx = Math.cos(ch), fz = Math.sin(ch); const lx = fz, lz = -fx;
    const introing = race && !race.started && race.phase === 'grid' && race.players.length === 1 && k === 0 && !EI.debug.freeCam && introT < 6.7;
    if (introing) { introCamera(cam, car); return; }
    const sh = (shake + surfaceShake(car)) * (mode === 'cockpit' ? 0.6 : 1); const tN = performance.now() * 0.001; const fN = car.surface === 'kerb' ? 26 : car.surface === 'grass' || car.surface === 'gravel' ? 9 : 2.5;
    const jx = sh * (0.6 * Math.sin(tN * fN * 6.283) + 0.4 * Math.sin(tN * fN * 12.1 + 1.3)) * 0.5, jy = sh * (0.6 * Math.sin(tN * fN * 6.283 + 2.1) + 0.4 * Math.sin(tN * fN * 11.3 + 0.4)) * 0.3, jz = sh * (0.5 * Math.sin(tN * fN * 6.283 + 4.0) + 0.5 * Math.sin(tN * fN * 13.7 + 2.2)) * 0.5;
    if (mode === 'cockpit') {
      // eye at the visor: halo blade dead centre, halo hoop across the upper third, wheel + gloves filling the bottom,
      // both front tyre tops and the mirrors at the edges. Head physics: g-force sway / brake dip, rpm buzz, look-to-apex.
      const glb = EI.CarGLB && EI.CarGLB.ready; const eyeX = EI.debug.eye ? EI.debug.eye.x : (glb ? 0.23 : 0.45), eyeY = EI.debug.eye ? EI.debug.eye.y : (glb ? 0.842 : 0.9);
      car._cockpitT = performance.now();
      if (snap) { cs.sway = 0; cs.dip = 0; cs.apex = 0; cs.roll = 0; cs.fov = 62; }
      const kSway = 1 - Math.exp(-dt * 5);
      cs.sway += (U.clamp(-car.aLat * 0.0009, -0.02, 0.02) - cs.sway) * kSway;           // head pushed to the outside of the corner
      cs.dip += (U.clamp(-car.aLong * 0.0008, -0.016, 0.028) - cs.dip) * kSway;          // forward under braking, back under power
      const vibA = (0.00025 + car.rpm * 0.0007) * (car.throttle > 0.3 ? 1 : 0.55); const vib = vibA * (Math.sin(tN * 6.283 * (24 + car.rpm * 11)) * 0.7 + Math.sin(tN * 6.283 * (37 + car.rpm * 17) + 1.1) * 0.3);
      const g = car.gradeNow || 0;
      _tgt.set(cx + fx * (eyeX + cs.dip) + lx * cs.sway, cy + eyeY - Math.abs(cs.dip) * 0.25 + vib, cz + fz * (eyeX + cs.dip) + lz * cs.sway);
      cam.position.copy(_tgt);
      const apexT = U.clamp(car.steer * 0.2 + (car.yaw || 0) * 0.02, -0.14, 0.14);       // look towards the apex, up to ~8 degrees
      cs.apex = (cs.apex || 0) + (apexT - (cs.apex || 0)) * (snap ? 1 : 1 - Math.exp(-dt * 3.5)); const ap = cs.apex;
      const ca = Math.cos(ap), sa = Math.sin(ap); const dx = fx * ca + lx * sa, dz = fz * ca + lz * sa;
      const pitch = -0.072 + g + jy * 0.012 + vib * 0.6;                                 // ~4 degrees nose-down so the wheel sits low in frame
      _look.set(_tgt.x + dx * 30 + lx * jx * 0.25, _tgt.y + pitch * 30, _tgt.z + dz * 30 + lz * jz * 0.25);
      cam.up.set(0, 1, 0); cam.lookAt(_look);
      cs.roll += (U.clamp(-car.aLat * 0.0006, -0.015, 0.015) - cs.roll) * kSway; cam.rotateZ(cs.roll);
      cs.fov += ((61 + Math.min(v, 95) * 0.03 + (car.drsOpen ? 1 : 0)) - cs.fov) * (snap ? 1 : Math.min(1, dt * 3)); cam.fov = cs.fov; cam.updateProjectionMatrix();
      cam.near = 0.04; cam.updateProjectionMatrix();
      const mir = car.screen && car.screen.userData.mirrors; if (mir && !EI.debug.noMirrors && quality !== 'low') mir.update(renderer, scene, quality === 'high' ? 1 : 3);
      return;
    }
    if (cam.near !== 0.25) { cam.near = 0.25; cam.updateProjectionMatrix(); }
    if (mode === 'tv') {
      const t = track; const seg = Math.floor(car.trk.s / 120); if (cam.userData.seg !== seg) { cam.userData.seg = seg; const i = t.idxAtS(seg * 120 + 80); const side = t.lineOff[i] > 0 ? -1 : 1; cam.userData.pos = new THREE.Vector3(t.x[i] + t.nx[i] * side * (t.halfWidth + 6), t.y[i] + 5, t.z[i] + t.nz[i] * side * (t.halfWidth + 6)); }
      cam.position.copy(cam.userData.pos); _look.set(cx, cy + 0.6, cz); cam.up.set(0, 1, 0); cam.lookAt(_look);
      const d = cam.position.distanceTo(_look); cam.fov = U.clamp(1800 / d, 18, 60); cam.updateProjectionMatrix(); return;
    }
    // ---- chase
    // The camera is rigid to the car's (interpolated) position: only its orientation and distance are smoothed. Smoothing the
    // world position itself lagged metres behind at speed and the catch-up snapped it every frame, which read as the car jittering.
    const dist = 5.7 + v * 0.011, height = 2.05 + v * 0.004;
    if (cs.yaw == null || snap) { cs.yaw = ch; cs.dist = dist; cs.h = height; }
    const kYaw = 1 - Math.exp(-dt * (v > 5 ? 5.5 : 9)); cs.yaw += U.wrapAngle(ch - cs.yaw) * kYaw;   // the camera swings round behind the car with a lag
    const cfx = Math.cos(cs.yaw), cfz = Math.sin(cs.yaw), clx = cfz, clz = -cfx;
    const kD = 1 - Math.exp(-dt * 4); cs.dist += (dist - cs.dist) * kD; cs.h += (height - cs.h) * kD;
    cs.lat += (U.clamp(car.yaw * 0.6, -0.4, 0.4) - cs.lat) * (1 - Math.exp(-dt * 2.5));                   // drift towards the inside of the turn
    cam.position.set(cx - cfx * cs.dist - clx * cs.lat * 0.6, cy + cs.h, cz - cfz * cs.dist - clz * cs.lat * 0.6);
    const minY = track.y[car.trk.i] + 1.0; if (cam.position.y < minY) cam.position.y = minY;
    _look.set(cx + fx * 5.5 + lx * (cs.lat * 1.3 + jx * 4), cy + 0.6 + jy * 4, cz + fz * 5.5 + lz * (cs.lat * 1.3 + jz * 4));
    cam.up.set(0, 1, 0); cam.lookAt(_look);
    cs.roll += (U.clamp(-car.aLat * 0.0009, -0.025, 0.025) - cs.roll) * (1 - Math.exp(-dt * 6)); cam.rotateZ(cs.roll);
    const fovT = 54 + v * 0.11 + (car.ersActive ? 2 : 0) + (car.drsOpen ? 1.5 : 0); cs.fov += (fovT - cs.fov) * Math.min(1, dt * 3); cam.fov = cs.fov; cam.updateProjectionMatrix();
  }
  // pre-race cinematic: a slow dolly down the grid, then an orbit around the player's car, then cut to the player camera
  let introT = 0, introLen = 8.2;
  function introCamera(cam, car) {
    const t = track, g0 = t.gridSlot(0); const n = race.cars.length; const gl = t.gridSlot(n - 1);
    const i0 = g0.i; const fx = t.tx[i0], fz = t.tz[i0], nx = t.nx[i0], nz = t.nz[i0];
    if (introT < 4.0) {
      const u = U.smoothstep(0, 4.0, introT);
      const sx = U.lerp(gl.x, g0.x, u), sz = U.lerp(gl.z, g0.z, u);
      cam.position.set(sx - fx * 6 + nx * 9, t.y[i0] + 4.5 - u * 1.5, sz - fz * 6 + nz * 9);
      _look.set(sx + fx * 10, t.y[i0] + 0.8, sz + fz * 10); cam.up.set(0, 1, 0); cam.lookAt(_look); cam.fov = 48; cam.updateProjectionMatrix();
    } else {
      const a = (introT - 4.0) * 0.6 + 2.4; const r = 5.2;
      cam.position.set(car.x + Math.cos(a) * r, car.y + 1.3, car.z + Math.sin(a) * r);
      _look.set(car.x, car.y + 0.55, car.z); cam.up.set(0, 1, 0); cam.lookAt(_look); cam.fov = 40; cam.updateProjectionMatrix();
    }
  }
  // live steering-wheel display for the player's car (LED strip + multi-function display), redrawn at the HUD rate (~15 Hz)
  function drawWheelScreen(car, delta) {
    if (!car.screen || !car.screenTex || !car._cockpitT || performance.now() - car._cockpitT > 400) return;
    const c = car.screen.userData.canvas, ctx = c.getContext('2d'), W = c.width, H = c.height; const F = '"Titillium Web", Arial, sans-serif';
    const now = performance.now(); const dtS = U.clamp((now - (car._wsT || now)) / 1000, 0, 0.5); car._wsT = now;
    // tyre carcass temperatures (FL, FR, RL, RR): load, braking, wheelspin and cornering side
    if (!car._tt) car._tt = [82, 82, 84, 84];
    const v = Math.abs(car.v), latL = Math.max(0, -car.aLat), latR = Math.max(0, car.aLat), surf = car.surface === 'grass' || car.surface === 'gravel' ? -6 : car.surface === 'kerb' ? 3 : 0;
    for (let i = 0; i < 4; i++) {
      const front = i < 2, right = i % 2 === 1;
      const tgt = 84 + v * 0.11 + (car.wear || 0) * 14 + surf + (front ? car.brake * 16 + Math.abs(car.steer) * 9 : car.throttle * car.rpm * 9) + (right ? latL : latR) * 0.55;
      car._tt[i] += (tgt - car._tt[i]) * (1 - Math.exp(-dtS / 2.5));
    }
    const tCol = (t) => t < 80 ? '#2f7bff' : t < 90 ? '#1fc9c2' : t < 104 ? '#21d06a' : t < 112 ? '#ffc400' : '#ff2a1c';
    ctx.fillStyle = '#030405'; ctx.fillRect(0, 0, W, H);
    // ---- LED strip: 5 green, 5 red, 5 blue; whole strip flashes blue at the limiter
    const ledY = 22, n = 15, sp = (W - 44) / (n - 1); const lit = Math.round(car.rpm * n * 1.02); const limiter = car.rpm > 0.97 && car.gear > 0 && car.gear < 8; const blink = limiter && Math.floor(now / 70) % 2 === 0;
    ctx.fillStyle = '#0b0c0f'; ctx.fillRect(0, 0, W, 44);
    for (let i = 0; i < n; i++) {
      const on = limiter ? blink : i < lit; const col = i < 5 ? ['#22e26a', '#0e3a1d'] : i < 10 ? ['#ff2a2a', '#3d0e0e'] : ['#3d8dff', '#10224a'];
      const x = 22 + i * sp; ctx.beginPath(); ctx.arc(x, ledY, 10, 0, 6.283); ctx.fillStyle = on ? (limiter ? '#3d8dff' : col[0]) : col[1]; ctx.fill();
      if (on) { ctx.beginPath(); ctx.arc(x - 3, ledY - 3, 3.5, 0, 6.283); ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.fill(); }
    }
    // ---- display
    const Y0 = 48; ctx.fillStyle = '#06080b'; ctx.fillRect(4, Y0, W - 8, H - Y0 - 4);
    const lab = (t, x, y, al) => { ctx.font = '700 15px ' + F; ctx.fillStyle = '#8a95a8'; ctx.textAlign = al || 'left'; ctx.fillText(t, x, y); };
    const val = (t, x, y, size, col, al, wgt) => { ctx.font = (wgt || 700) + ' ' + size + 'px ' + F; ctx.fillStyle = col; ctx.textAlign = al || 'left'; ctx.fillText(t, x, y); };
    ctx.textBaseline = 'alphabetic';
    // left column: delta / last / best
    lab('DELTA', 16, Y0 + 22); val(delta == null ? '--.---' : (delta >= 0 ? '+' : '−') + Math.abs(delta).toFixed(3), 16, Y0 + 56, 34, delta == null ? '#9aa3b2' : delta < 0 ? '#22e26a' : '#ff4a3a', 'left', 900);
    lab('LAST', 16, Y0 + 86); val(U.fmtTime(car.lastLap > 0 ? car.lastLap : null), 16, Y0 + 112, 24, '#f2f5f9');
    lab('BEST', 16, Y0 + 140); val(U.fmtTime(car.bestLap > 0 ? car.bestLap : null), 16, Y0 + 166, 24, '#c58cff');
    // centre: gear in a frame that lights up with the shift lights, speed underneath
    const gx = 256, gTop = Y0 + 8; const shiftCol = limiter ? '#3d8dff' : car.rpm > 0.8 ? '#ff2a2a' : car.rpm > 0.55 ? '#22e26a' : '#2a303a';
    ctx.strokeStyle = shiftCol; ctx.lineWidth = 4; ctx.strokeRect(gx - 62, gTop, 124, 150);
    val(car.gear === 0 ? 'N' : car.v < -0.5 ? 'R' : String(car.gear), gx, gTop + 128, 140, car.gear === 0 ? '#ffc400' : '#ffffff', 'center', 900);
    val(String(Math.round(car.speedKmh)), gx + 14, Y0 + 204, 40, '#ffffff', 'center', 900); lab('KPH', gx + 50, Y0 + 204, 'left');
    // right column: tyre temperatures (2 x 2), brake bias, position / lap
    const tx0 = 356, tw = 66, th = 40;
    lab('TYRES °C', tx0, Y0 + 22);
    for (let i = 0; i < 4; i++) { const x = tx0 + (i % 2) * (tw + 8), y = Y0 + 30 + Math.floor(i / 2) * (th + 6); const t = car._tt[i]; ctx.fillStyle = tCol(t); ctx.fillRect(x, y, tw, th); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x, y + th - 8, tw * U.clamp(1 - (car.wear || 0), 0, 1), 8); val(String(Math.round(t)), x + tw / 2, y + 29, 26, '#06080b', 'center', 900); }
    lab('BB', tx0, Y0 + 148); val((car._bb || 56.5).toFixed(1) + '%', tx0 + 30, Y0 + 148, 22, '#ffb347');
    val('P' + car.pos, tx0, Y0 + 176, 24, '#ffffff', 'left', 900); lab('LAP ' + Math.min(car.lap, race ? race.laps : car.lap) + '/' + (race ? race.laps : '-'), tx0 + 58, Y0 + 176);
    // bottom: ERS store + deploy mode, DRS state
    const by = Y0 + 222; lab('ERS', 16, by + 18); const bx = 62, bw = 300;
    ctx.fillStyle = '#1a2230'; ctx.fillRect(bx, by + 2, bw, 20); ctx.fillStyle = car.ersActive ? '#ff8a1f' : '#ffc400'; ctx.fillRect(bx, by + 2, bw * U.clamp(car.ers, 0, 1), 20);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; for (let i = 1; i < 10; i++) ctx.fillRect(bx + bw * i / 10 - 1, by + 2, 2, 20);
    val(Math.round(car.ers * 100) + '%', bx + bw + 8, by + 20, 22, '#ffffff', 'left', 900);
    lab(car.ersActive ? 'OVERTAKE' : 'BALANCED', bx, by + 44); if (car.ersActive) { ctx.fillStyle = '#ff8a1f'; ctx.fillRect(bx + 84, by + 34, 10, 10); }
    const dOpen = car.drsOpen, dArm = car.drsEligible && !dOpen; const dx0 = 418, dw = 82, dy0 = by - 2, dh = 46;
    ctx.lineWidth = 3; ctx.strokeStyle = dOpen || dArm ? '#22e26a' : '#3a414e'; ctx.fillStyle = dOpen ? '#22e26a' : '#06080b';
    ctx.fillRect(dx0, dy0, dw, dh); ctx.strokeRect(dx0, dy0, dw, dh); val('DRS', dx0 + dw / 2, dy0 + 33, 28, dOpen ? '#04210f' : dArm ? '#22e26a' : '#4a515c', 'center', 900);
    car.screenTex.needsUpdate = true;
  }
  function menuCamera(t) {
    const cam = cameras[0]; const i = track.idxAtS((t * 18) % track.length); const fx = track.tx[i], fz = track.tz[i];
    cam.position.set(track.x[i] - fx * 30 + track.nx[i] * 14, track.y[i] + 16, track.z[i] - fz * 30 + track.nz[i] * 14);
    cam.lookAt(track.x[i] + fx * 40, track.y[i] + 1, track.z[i] + fz * 40); cam.fov = 55; cam.updateProjectionMatrix();
  }
  // name tags above nearby cars, projected into the viewport
  function updateTags(k, cam, vp) {
    const car = race.players[k]; const list = []; const w = vp.w, h = vp.h;
    for (const o of race.cars) {
      if (o === car) continue; const dx = o.x - car.x, dz = o.z - car.z; const d = Math.hypot(dx, dz); if (d > 90) continue;
      tmp3.set(o.x, o.y + 1.4, o.z); tmp3.project(cam); if (tmp3.z > 1 || Math.abs(tmp3.x) > 1.1 || Math.abs(tmp3.y) > 1.1) continue;
      list.push({ x: (tmp3.x + 1) / 2 * w, y: (1 - tmp3.y) / 2 * h, pos: o.pos, color: o.team.primary, text: o.isPlayer ? o.name : o.driver.name.split(' ').pop().toUpperCase(), alpha: U.clamp(1.3 - d / 90, 0.2, 1) });
    }
    vp.updateTags(list);
  }

  // ------------------------------------------------------------------ main loop
  function loop(now) {
    requestAnimationFrame(loop);
    now = performance.now(); let dt = U.clamp((now - lastT) / 1000, 0, 0.05); lastT = now;   // never negative: a rAF timestamp can precede a lastT stamped in an input handler
    if (!race) {
      menuCamera(now / 1000); scenery.update(dt, cameras[0].position.x, cameras[0].position.z);
      renderer.setScissorTest(false); renderer.setViewport(0, 0, renderer.domElement.width, renderer.domElement.height);
      sunFollow(cameras[0].position.x, cameras[0].position.z); particles.update(dt); renderView(cameras[0], true); return;
    }
    if (paused) dt = 0;
    const single = race.players.length === 1; const inputs = race.players.map((c, k) => EI.Input.read(k, single));
    // gamepad camera button
    race.players.forEach((c, k) => { const pads = navigator.getGamepads ? navigator.getGamepads() : []; const gp = pads && pads[k]; if (gp && gp.buttons[3] && gp.buttons[3].pressed && !c._camBtn) cycleCam(k); c._camBtn = !!(gp && gp.buttons[3] && gp.buttons[3].pressed); });
    acc += dt; let steps = 0; while (acc >= DT && steps < 6) { for (const c of race.cars) c.savePose(); race.update(DT, inputs); acc -= DT; steps++; } if (steps === 6) acc = 0;
    if (EI.Pit) EI.Pit.frame(race, dt);
    const alpha = U.clamp(acc / DT, 0, 1); for (const c of race.cars) c.blend(alpha);
    for (const c of race.cars) { let d = 1e9; for (const pl of race.players) { const dd = Math.hypot(c.x - pl.x, c.z - pl.z); if (dd < d) d = dd; } c.setLOD(c.lodIsFar ? d > 120 : d > 150, d); }
    const wasIntro = introT < 6.7; introT += dt; if (wasIntro && introT >= 6.7 && race.players.length === 1) { placeCamera(cameras[0], race.players[0], 0, true, 0); shake = 0.25; }
    if (!race.started && race.phase === 'grid' && introT >= introLen) { race.startLights(); $('lights').classList.remove('hidden'); EI.HUD.setLights(0); race.players.forEach((car, k) => placeCamera(cameras[k], car, k, true, 0)); }
    handleEvents(); for (const c of race.cars) { c.updateVisual(dt); if (dt > 0) particles.fromCar(c, dt); } particles.update(dt); shake = Math.max(0, shake - dt * 3); hudT += dt;
    race.players.forEach((car, k) => { if (k === 0 && EI.debug.freeCam) { const f = EI.debug.freeCam; cameras[0].position.set(f.pos[0], f.pos[1], f.pos[2]); cameras[0].lookAt(f.look[0], f.look[1], f.look[2]); cameras[0].fov = f.fov || 50; cameras[0].updateProjectionMatrix(); } else placeCamera(cameras[k], car, k, false, dt); if (hudT > 0.05) { viewports[k].update(race, 0.05); updateTags(k, cameras[k], viewports[k]); drawWheelScreen(car, race.deltaBest(car)); } if (engines[k]) { const idleBlip = !race.started ? (Math.sin(performance.now() * 0.004 + k) > 0.6 ? 0.5 : 0.08) : 0; EI.Audio.setEngine(engines[k], race.started ? car.rpm : 0.15 + idleBlip * 0.8, race.started ? car.throttle : idleBlip, paused ? 0 : (CAM_MODES[camModes[k]] === 'cockpit' ? 1.3 : 1), car.gear); } });
    if (hudT > 0.05) hudT = 0;
    if (race.over && !resultsShown && race.classified) { resultsShown = true; EI.HUD.showResults(race); }
    scenery.update(dt, race.players[0].x, race.players[0].z);
    if (skyMesh) skyMesh.position.set(race.players[0].x, 0, race.players[0].z);
    const h = renderer.domElement.height, pr = renderer.getPixelRatio(); const rects = layout(cameras.length, window.innerWidth, window.innerHeight);
    renderer.setScissorTest(cameras.length > 1);
    cameras.forEach((cam, k) => {
      const r = rects[k]; const x = Math.floor(r[0] * pr), y = Math.floor(h - (r[1] + r[3]) * pr), rw = Math.floor(r[2] * pr), rh = Math.floor(r[3] * pr);
      renderer.setViewport(x, y, rw, rh); renderer.setScissor(x, y, rw, rh);
      const car = race.players[k]; sunFollow(car.x, car.z);
      const cockpit = CAM_MODES[camModes[k]] === 'cockpit'; if (cockpit) car.helmet.visible = false;
      renderView(cam, cameras.length === 1); if (cockpit) car.helmet.visible = true;
    });
  }
  function sunFollow(x, z) { const d = this_sunDir; sun.position.set(x + d.x * 160, d.y * 160, z + d.z * 160); sun.target.position.set(x, 0, z); sun.target.updateMatrixWorld(); }

  function handleEvents() {
    for (const e of race.pollEvents()) {
      switch (e.type) {
        case 'light': EI.HUD.setLights(e.data); EI.Audio.beep(440, 0.25, 0.25); if (e.data === 1) { EI.HUD.toast('P1: W A S D · Shift = DRS · Ctrl/Space = ERS boost · C = camera'); if (race.players.length > 1) EI.HUD.toast('P2: Arrows · Right Shift = DRS · Enter = ERS boost · / = camera'); } break;
        case 'go': $('lights').classList.add('hidden'); EI.HUD.banner('LIGHTS OUT!', 1500, '#37d67a'); EI.Audio.beep(880, 0.6, 0.3); break;
        case 'penalty': viewports[e.data.playerIndex].showMsg('JUMP START  +5s', 'bad', 3); EI.HUD.toast(e.data.name + ': jump start, +5 s penalty'); break;
        case 'fastest': EI.HUD.toast('Fastest lap: ' + e.data.name + ' ' + U.fmtTime(race.fastest.time)); if (e.data.isPlayer) viewports[e.data.playerIndex].showMsg('FASTEST LAP ' + U.fmtTime(race.fastest.time), 'good', 2.5); break;
        case 'finalLap': if (e.data.isPlayer) viewports[e.data.playerIndex].showMsg('FINAL LAP', 'warn', 2.5); else if (e.data.pos === 1) EI.HUD.toast('Final lap for the leader ' + e.data.name); break;
        case 'leaderFinished': EI.HUD.toast(e.data.name + ' takes the chequered flag!'); break;
        case 'finished': if (e.data.isPlayer) { viewports[e.data.playerIndex].showMsg('P' + e.data.pos + ' · ' + U.ordinal(e.data.pos).toUpperCase(), e.data.pos <= 3 ? 'good' : 'warn', 6); EI.Audio.beep(660, 0.3, 0.25); } break;
        case 'hit': shake = Math.max(shake, e.data * 0.6); EI.Audio.thud(e.data); break;
        case 'over': EI.HUD.toast('Waiting for the field to finish…'); break;
      }
    }
    for (const car of race.players) { if (car.wallHit > 0.5 && shake < 0.2) { shake = car.wallHit * 0.5; EI.Audio.thud(car.wallHit); car.wallHit = 0.3; }
      if (car._lastThr > 0.8 && car.throttle < 0.2 && car.rpm > 0.7 && Math.random() < 0.6) EI.Audio.pop(); car._lastThr = car.throttle; }
  }
  EI.debug = { get shake() { return shake; }, set shake(v) { shake = v; }, get introT() { return introT; }, set introT(v) { introT = v; }, get viewports() { return viewports; }, setQuality, snapCameras: () => race && race.players.forEach((car, k) => placeCamera(cameras[k], car, k, true, 0)), setCam: (k, m) => { camModes[k] = m; }, get race() { return race; }, get track() { return track; }, get scenery() { return scenery; }, get scene() { return scene; }, get cameras() { return cameras; }, renderer: () => renderer, startRace, endRace };
  window.addEventListener('DOMContentLoaded', () => { (EI.Ads ? EI.Ads.ready() : Promise.resolve()).then(() => setTimeout(init, 30)); });
})();
