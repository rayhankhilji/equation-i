// Equation I - bootstrap, menu, render loop and cameras
window.EI = window.EI || {};
(function () {
  const U = EI.U, $ = (id) => document.getElementById(id);
  const DT = 1 / 120;
  let renderer, scene, track, race = null, viewports = [], cameras = [], sun, hemi, lastT = 0, acc = 0, running = false, paused = false, hudT = 0, towerT = 0;
  let engines = [], shake = 0, lightsShown = false, resultsShown = false;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

  function init() {
    const canvas = $('gl');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    const sky = 0x9fc8ea; scene.background = new THREE.Color(sky); scene.fog = new THREE.Fog(sky, 500, 2200);
    // sky dome with a gradient
    const skyGeo = new THREE.SphereGeometry(2600, 24, 12); const cols = []; const p = skyGeo.attributes.position; const top = new THREE.Color(0x4f8fd6), hor = new THREE.Color(0xcfe3f5);
    for (let i = 0; i < p.count; i++) { const t = U.clamp(p.getY(i) / 2600, 0, 1); const c = hor.clone().lerp(top, Math.pow(t, 0.6)); cols.push(c.r, c.g, c.b); }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const skyMesh = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })); scene.add(skyMesh);
    // a few clouds
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false });
    const cr = U.rng(5);
    for (let i = 0; i < 30; i++) { const c = new THREE.Mesh(new THREE.SphereGeometry(40 + cr() * 60, 8, 6), cloudMat); c.scale.y = 0.35; c.position.set((cr() - 0.5) * 4000, 380 + cr() * 150, (cr() - 0.5) * 4000); scene.add(c); }
    hemi = new THREE.HemisphereLight(0xbfdcff, 0x3f5a2c, 0.9); scene.add(hemi);
    sun = new THREE.DirectionalLight(0xfff2dc, 1.25); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.near = 10; sun.shadow.camera.far = 400;
    sun.shadow.camera.left = -70; sun.shadow.camera.right = 70; sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
    scene.add(sun); scene.add(sun.target);
    // track
    track = new EI.Track(EI.TRACKS.silverstone);
    scene.add(track.build());
    EI.HUD.drawTrackPreview(track, $('track-preview'));
    setupMenu();
    $('loading').classList.add('hidden');
    window.addEventListener('resize', onResize);
    if (U.isTouch()) EI.Input.initTouch($('touch'));
    // idle camera orbit on the menu
    cameras = [new THREE.PerspectiveCamera(60, 1, 0.5, 4000)]; onResize(); requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------------ menu
  function setupMenu() {
    const teamSel = [$('p1-team'), $('p2-team')];
    teamSel.forEach((sel, k) => { EI.TEAMS.forEach((t, i) => { const o = document.createElement('option'); o.value = i; o.textContent = t.name; sel.appendChild(o); }); sel.value = k === 0 ? 0 : 3; });
    const refresh = () => {
      [0, 1].forEach(k => { const t = EI.TEAMS[+teamSel[k].value]; EI.drawLiveryPreview($('p' + (k + 1) + '-preview'), t, t.drivers[0].num, $('p' + (k + 1) + '-name').value || 'YOU'); });
      $('out-laps').textContent = $('opt-laps').value; $('out-bots').textContent = $('opt-bots').value;
      $('p2-setup').classList.toggle('hidden', $('opt-players').value !== '2');
      const maxBots = 20 - (+$('opt-players').value); $('opt-bots').max = maxBots; if (+$('opt-bots').value > maxBots) $('opt-bots').value = maxBots; $('out-bots').textContent = $('opt-bots').value;
    };
    ['p1-team', 'p2-team', 'p1-name', 'p2-name', 'opt-laps', 'opt-bots', 'opt-players'].forEach(id => $(id).addEventListener('input', refresh));
    refresh();
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
    });
  }
  function readConfig() {
    const np = +$('opt-players').value;
    const players = [];
    for (let k = 0; k < np; k++) players.push({ name: ($('p' + (k + 1) + '-name').value || (k ? 'RIVAL' : 'YOU')).toUpperCase(), teamIndex: +$('p' + (k + 1) + '-team').value, tyre: $('p' + (k + 1) + '-tyre').value });
    if (np === 2 && players[0].teamIndex === players[1].teamIndex) { /* same team is fine: second driver */ }
    return { players, bots: +$('opt-bots').value, laps: +$('opt-laps').value, difficulty: $('opt-diff').value, grid: $('opt-grid').value, assist: $('opt-assist').value, seed: (Math.random() * 1e9) | 0 };
  }
  function setPaused(p) { paused = p; $('pause').classList.toggle('hidden', !p); if (!p) lastT = performance.now(); }

  // ------------------------------------------------------------------ race lifecycle
  function startRace(cfg) {
    endRace();
    race = new EI.Race(track, cfg);
    for (const c of race.cars) scene.add(c.group);
    viewports = race.players.map((car, k) => EI.HUD.makeViewport(k, car));
    cameras = race.players.map(() => new THREE.PerspectiveCamera(62, 1, 0.3, 4000));
    engines = race.players.map(() => EI.Audio.createEngine());
    $('menu').classList.add('hidden'); $('tower').classList.remove('hidden'); $('results').classList.add('hidden');
    $('touch').classList.toggle('hidden', !(U.isTouch() && race.players.length === 1));
    resultsShown = false; lightsShown = false; running = true; paused = false; lastT = performance.now(); acc = 0;
    onResize();
    // snap cameras behind the cars, then begin the start procedure after a short formation pause
    race.players.forEach((car, k) => placeCamera(cameras[k], car, true));
    EI.HUD.banner('EQUATION I · ' + track.name.toUpperCase() + ' GP', 2400);
    EI.HUD.updateTower(race);
    setTimeout(() => { if (race && !race.started && race.phase === 'grid') { race.startLights(); $('lights').classList.remove('hidden'); EI.HUD.setLights(0); } }, 2800);
  }
  function endRace() {
    if (race) { for (const c of race.cars) scene.remove(c.group); }
    race = null; running = false;
    $('viewports').innerHTML = ''; viewports = []; EI.Audio.stopAll(); engines = [];
    $('tower').classList.add('hidden'); $('lights').classList.add('hidden'); $('banner').classList.add('hidden'); $('touch').classList.add('hidden');
    $('menu').classList.remove('hidden');
    cameras = [new THREE.PerspectiveCamera(60, 1, 0.5, 4000)]; onResize();
  }

  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    const rects = layout(cameras.length, w, h);
    cameras.forEach((cam, k) => { const r = rects[k]; cam.aspect = r[2] / r[3]; cam.updateProjectionMatrix(); if (viewports[k]) viewports[k].setRect(r[0], r[1], r[2], r[3]); });
  }
  function layout(n, w, h) {
    if (n <= 1) return [[0, 0, w, h]];
    if (w >= h) return [[0, 0, Math.floor(w / 2) - 1, h], [Math.floor(w / 2) + 1, 0, Math.floor(w / 2) - 1, h]];
    return [[0, 0, w, Math.floor(h / 2) - 1], [0, Math.floor(h / 2) + 1, w, Math.floor(h / 2) - 1]];
  }

  // ------------------------------------------------------------------ cameras
  function placeCamera(cam, car, snap, dt) {
    const fx = Math.cos(car.heading), fz = Math.sin(car.heading);
    const v = Math.abs(car.v);
    const dist = 7.6 + v * 0.04, height = 2.7 + v * 0.011;
    // look a little into the turn
    const lx = fz, lz = -fx; const lean = car.yaw * 2.2;
    tmp.set(car.x - fx * dist + lx * lean * 0.5, height, car.z - fz * dist + lz * lean * 0.5);
    if (snap) cam.position.copy(tmp); else cam.position.lerp(tmp, 1 - Math.exp(-dt * 6));
    tmp2.set(car.x + fx * 7 + lx * lean, 0.9, car.z + fz * 7 + lz * lean);
    if (shake > 0) { tmp2.x += (Math.random() - 0.5) * shake; tmp2.y += (Math.random() - 0.5) * shake * 0.5; }
    cam.lookAt(tmp2);
    cam.fov = 60 + v * 0.14; cam.updateProjectionMatrix();
  }
  function menuCamera(t) {
    const cam = cameras[0]; const i = track.idxAtS((t * 18) % track.length);
    const fx = track.tx[i], fz = track.tz[i];
    cam.position.set(track.x[i] - fx * 30 + track.nx[i] * 14, 16, track.z[i] - fz * 30 + track.nz[i] * 14);
    cam.lookAt(track.x[i] + fx * 40, 1, track.z[i] + fz * 40); cam.fov = 55; cam.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ main loop
  function loop(now) {
    requestAnimationFrame(loop);
    let dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    if (!race) {
      menuCamera(now / 1000);
      renderer.setScissorTest(false); renderer.setViewport(0, 0, renderer.domElement.width, renderer.domElement.height);
      sunFollow(cameras[0].position.x, cameras[0].position.z);
      renderer.render(scene, cameras[0]); return;
    }
    if (paused) dt = 0;
    const single = race.players.length === 1;
    const inputs = race.players.map((c, k) => EI.Input.read(k, single));
    acc += dt; let steps = 0;
    while (acc >= DT && steps < 6) { race.update(DT, inputs); acc -= DT; steps++; }
    if (steps === 6) acc = 0;
    handleEvents();
    for (const c of race.cars) c.updateVisual(dt);
    shake = Math.max(0, shake - dt * 3);
    hudT += dt; towerT += dt;
    race.players.forEach((car, k) => {
      placeCamera(cameras[k], car, false, dt);
      if (hudT > 0.05) viewports[k].update(race, 0.05);
      if (engines[k]) EI.Audio.setEngine(engines[k], car.rpm, car.throttle, paused ? 0 : 1);
    });
    if (hudT > 0.05) hudT = 0;
    if (towerT > 0.25) { EI.HUD.updateTower(race); towerT = 0; }
    if (race.over && !resultsShown && race.classified) { resultsShown = true; EI.HUD.showResults(race); }
    // render each viewport
    const w = renderer.domElement.width, h = renderer.domElement.height;
    const pr = renderer.getPixelRatio();
    const rects = layout(cameras.length, window.innerWidth, window.innerHeight);
    renderer.setScissorTest(cameras.length > 1);
    cameras.forEach((cam, k) => {
      const r = rects[k];
      const x = Math.floor(r[0] * pr), y = Math.floor(h - (r[1] + r[3]) * pr), rw = Math.floor(r[2] * pr), rh = Math.floor(r[3] * pr);
      renderer.setViewport(x, y, rw, rh); renderer.setScissor(x, y, rw, rh);
      const car = race.players[k]; sunFollow(car.x, car.z);
      renderer.render(scene, cam);
    });
  }
  function sunFollow(x, z) { sun.position.set(x + 60, 110, z + 35); sun.target.position.set(x, 0, z); sun.target.updateMatrixWorld(); }

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
        case 'classified': break;
      }
    }
    for (const car of race.players) if (car.wallHit > 0.5 && shake < 0.2) { shake = car.wallHit * 0.5; EI.Audio.thud(car.wallHit); car.wallHit = 0.3; }
  }

  EI.debug = { snapCameras: () => race && race.players.forEach((car, k) => placeCamera(cameras[k], car, true)), get race() { return race; }, get track() { return track; }, get scene() { return scene; }, get cameras() { return cameras; }, renderer: () => renderer, startRace, endRace, handleEvents };
  window.addEventListener('DOMContentLoaded', () => { setTimeout(init, 30); });
})();
