// Equation I - bootstrap, menu, render loop and cameras
window.EI = window.EI || {};
(function () {
  const U = EI.U, $ = (id) => document.getElementById(id);
  const DT = 1 / 120;
  let renderer, scene, track, scenery, envMap, race = null, viewports = [], cameras = [], camModes = [], sun, hemi, lastT = 0, acc = 0, paused = false, hudT = 0;
  let engines = [], shake = 0, resultsShown = false;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3();
  const CAM_MODES = ['chase', 'cockpit', 'tv'];

  let composer = null, bloomPass = null, fxaaPass = null, particles = null, skyMesh = null;
  function init() {
    const canvas = $('gl');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ReinhardToneMapping; renderer.toneMappingExposure = 1.35;
    scene = new THREE.Scene();
    // physically based sky, with the sun light aligned to it and a PMREM environment for reflections / ambient
    const sunDir = new THREE.Vector3(); const elev = 42, azim = 205; const phi = THREE.MathUtils.degToRad(90 - elev), theta = THREE.MathUtils.degToRad(azim); sunDir.setFromSphericalCoords(1, phi, theta);
    skyMesh = new THREE.Sky(); skyMesh.scale.setScalar(5500); const su = skyMesh.material.uniforms; su.turbidity.value = 2.2; su.rayleigh.value = 1.5; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.85; su.sunPosition.value.copy(sunDir); scene.add(skyMesh);
    const pm = new THREE.PMREMGenerator(renderer); pm.compileEquirectangularShader();
    const skyScene = new THREE.Scene(); const sky2 = new THREE.Sky(); sky2.scale.setScalar(5500); sky2.material.uniforms.turbidity.value = 2.2; sky2.material.uniforms.rayleigh.value = 1.5; sky2.material.uniforms.sunPosition.value.copy(sunDir); skyScene.add(sky2);
    scene.environment = pm.fromScene(skyScene, 0.02).texture; pm.dispose();
    const horizon = 0xb5c8de; scene.fog = new THREE.Fog(horizon, 1100, 5600);
    hemi = new THREE.HemisphereLight(0xb9cfe8, 0x3f4a2e, 0.3); scene.add(hemi);
    sun = new THREE.DirectionalLight(0xfff0dd, 1.9); sun.castShadow = true; this_sunDir = sunDir;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.near = 10; sun.shadow.camera.far = 600;
    sun.shadow.camera.left = -70; sun.shadow.camera.right = 70; sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; sun.shadow.radius = 2;
    scene.add(sun); scene.add(sun.target);
    envMap = scene.environment;
    track = new EI.Track(EI.TRACKS.silverstone);
    scenery = new EI.Scenery(track); scene.add(scenery.build());
    scene.add(track.build(scenery));
    scene.traverse(o => { if (o.material && o.material.isMeshStandardMaterial && o.material.envMapIntensity === 1) o.material.envMapIntensity = 0.3; });
    particles = new EI.Particles(scene);
    // post-processing (single viewport): bloom + FXAA
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, new THREE.PerspectiveCamera()));
    bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.28, 0.55, 0.88); composer.addPass(bloomPass);
    fxaaPass = new THREE.ShaderPass(THREE.FXAAShader); composer.addPass(fxaaPass);
    EI.HUD.drawTrackPreview(track, $('track-preview'));
    setupMenu(); $('loading').classList.add('hidden');
    window.addEventListener('resize', onResize);
    if (U.isTouch()) EI.Input.initTouch($('touch'));
    cameras = [new THREE.PerspectiveCamera(60, 1, 0.3, 6000)]; onResize(); requestAnimationFrame(loop);
  }
  let this_sunDir = null;
  function renderView(cam, usePost) {
    if (usePost && composer) { composer.passes[0].camera = cam; composer.render(); } else renderer.render(scene, cam);
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
    $('btn-start').addEventListener('click', () => { EI.Audio.resume(); startRace(readConfig()); });
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
    resultsShown = false; paused = false; lastT = performance.now(); acc = 0; onResize();
    race.players.forEach((car, k) => placeCamera(cameras[k], car, k, true, 0));
    EI.HUD.banner('EQUATION I · ' + track.name.toUpperCase() + ' GP', 2400);
    setTimeout(() => { if (race && !race.started && race.phase === 'grid') { race.startLights(); $('lights').classList.remove('hidden'); EI.HUD.setLights(0); } }, 2800);
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
  function placeCamera(cam, car, k, snap, dt) {
    const mode = CAM_MODES[camModes[k] || 0]; const fx = Math.cos(car.heading), fz = Math.sin(car.heading); const v = Math.abs(car.v); const lx = fz, lz = -fx;
    if (mode === 'cockpit') {
      // driver's eye: behind the halo, looking down the nose
      const g = car.gradeNow || 0; const bob = Math.sin(performance.now() * 0.03) * v * 0.0006;
      tmp.set(car.x + fx * 0.05, car.y + 0.9 + bob, car.z + fz * 0.05); cam.position.copy(tmp);
      tmp2.set(car.x + fx * 30, car.y + 0.55 + g * 30 + bob, car.z + fz * 30);
      if (shake > 0) { tmp2.x += (Math.random() - 0.5) * shake * 0.6; tmp2.y += (Math.random() - 0.5) * shake * 0.3; }
      cam.lookAt(tmp2); cam.fov = 78 + v * 0.05; cam.updateProjectionMatrix(); return;
    }
    if (mode === 'tv') {
      // trackside: a fixed pod ahead of the car that pans with it, re-anchored every ~120 m
      const t = track; const seg = Math.floor(car.trk.s / 120); if (cam.userData.seg !== seg) { cam.userData.seg = seg; const i = t.idxAtS(seg * 120 + 80); const side = t.lineOff[i] > 0 ? -1 : 1; cam.userData.pos = new THREE.Vector3(t.x[i] + t.nx[i] * side * (t.halfWidth + 6), t.y[i] + 5, t.z[i] + t.nz[i] * side * (t.halfWidth + 6)); }
      cam.position.copy(cam.userData.pos); tmp2.set(car.x, car.y + 0.6, car.z); cam.lookAt(tmp2);
      const d = cam.position.distanceTo(tmp2); cam.fov = U.clamp(1800 / d, 18, 60); cam.updateProjectionMatrix(); return;
    }
    const dist = 7.6 + v * 0.04, height = 2.7 + v * 0.011; const lean = car.yaw * 2.2;
    tmp.set(car.x - fx * dist + lx * lean * 0.5, car.y + height, car.z - fz * dist + lz * lean * 0.5);
    if (snap) cam.position.copy(tmp); else cam.position.lerp(tmp, 1 - Math.exp(-dt * 6));
    // keep the camera above the terrain/track
    const camY = track.y[car.trk.i] + 1.2; if (cam.position.y < camY) cam.position.y = camY;
    tmp2.set(car.x + fx * 7 + lx * lean, car.y + 0.9, car.z + fz * 7 + lz * lean);
    if (shake > 0) { tmp2.x += (Math.random() - 0.5) * shake; tmp2.y += (Math.random() - 0.5) * shake * 0.5; }
    cam.lookAt(tmp2); cam.fov = 60 + v * 0.14; cam.updateProjectionMatrix();
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
    let dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    if (!race) {
      menuCamera(now / 1000); scenery.update(dt, cameras[0].position.x, cameras[0].position.z);
      renderer.setScissorTest(false); renderer.setViewport(0, 0, renderer.domElement.width, renderer.domElement.height);
      sunFollow(cameras[0].position.x, cameras[0].position.z); particles.update(dt); renderView(cameras[0], true); return;
    }
    if (paused) dt = 0;
    const single = race.players.length === 1; const inputs = race.players.map((c, k) => EI.Input.read(k, single));
    // gamepad camera button
    race.players.forEach((c, k) => { const pads = navigator.getGamepads ? navigator.getGamepads() : []; const gp = pads && pads[k]; if (gp && gp.buttons[3] && gp.buttons[3].pressed && !c._camBtn) cycleCam(k); c._camBtn = !!(gp && gp.buttons[3] && gp.buttons[3].pressed); });
    acc += dt; let steps = 0; while (acc >= DT && steps < 6) { race.update(DT, inputs); acc -= DT; steps++; } if (steps === 6) acc = 0;
    handleEvents(); for (const c of race.cars) { c.updateVisual(dt); if (dt > 0) particles.fromCar(c, dt); } particles.update(dt); shake = Math.max(0, shake - dt * 3); hudT += dt;
    race.players.forEach((car, k) => { if (k === 0 && EI.debug.freeCam) { const f = EI.debug.freeCam; cameras[0].position.set(f.pos[0], f.pos[1], f.pos[2]); cameras[0].lookAt(f.look[0], f.look[1], f.look[2]); cameras[0].fov = f.fov || 50; cameras[0].updateProjectionMatrix(); } else placeCamera(cameras[k], car, k, false, dt); if (hudT > 0.05) { viewports[k].update(race, 0.05); updateTags(k, cameras[k], viewports[k]); } if (engines[k]) EI.Audio.setEngine(engines[k], car.rpm, car.throttle, paused ? 0 : (CAM_MODES[camModes[k]] === 'cockpit' ? 1.3 : 1)); });
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
        case 'light': EI.HUD.setLights(e.data); EI.Audio.beep(440, 0.25, 0.25); break;
        case 'go': $('lights').classList.add('hidden'); EI.HUD.banner('LIGHTS OUT!', 1500, '#37d67a'); EI.Audio.beep(880, 0.6, 0.3); break;
        case 'penalty': viewports[e.data.playerIndex].showMsg('JUMP START  +5s', 'bad', 3); EI.HUD.toast(e.data.name + ': jump start, +5 s penalty'); break;
        case 'drsOn': viewports[e.data.playerIndex].showMsg('DRS ENABLED', 'good', 1.5); break;
        case 'fastest': EI.HUD.toast('Fastest lap: ' + e.data.name + ' ' + U.fmtTime(race.fastest.time)); if (e.data.isPlayer) viewports[e.data.playerIndex].showMsg('FASTEST LAP ' + U.fmtTime(race.fastest.time), 'good', 2.5); break;
        case 'finalLap': if (e.data.isPlayer) viewports[e.data.playerIndex].showMsg('FINAL LAP', 'warn', 2.5); else if (e.data.pos === 1) EI.HUD.toast('Final lap for the leader ' + e.data.name); break;
        case 'leaderFinished': EI.HUD.toast(e.data.name + ' takes the chequered flag!'); break;
        case 'finished': if (e.data.isPlayer) { viewports[e.data.playerIndex].showMsg('P' + e.data.pos + ' · ' + U.ordinal(e.data.pos).toUpperCase(), e.data.pos <= 3 ? 'good' : 'warn', 6); EI.Audio.beep(660, 0.3, 0.25); } break;
        case 'hit': shake = Math.max(shake, e.data * 0.6); EI.Audio.thud(e.data); break;
        case 'over': EI.HUD.toast('Waiting for the field to finish…'); break;
      }
    }
    for (const car of race.players) if (car.wallHit > 0.5 && shake < 0.2) { shake = car.wallHit * 0.5; EI.Audio.thud(car.wallHit); car.wallHit = 0.3; }
  }
  EI.debug = { snapCameras: () => race && race.players.forEach((car, k) => placeCamera(cameras[k], car, k, true, 0)), setCam: (k, m) => { camModes[k] = m; }, get race() { return race; }, get track() { return track; }, get scenery() { return scenery; }, get scene() { return scene; }, get cameras() { return cameras; }, renderer: () => renderer, startRace, endRace };
  window.addEventListener('DOMContentLoaded', () => { setTimeout(init, 30); });
})();
