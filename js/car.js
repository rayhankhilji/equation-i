// Equation I - car model and vehicle physics
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  const L = 5.6, W = 2.0, WB = 3.6, VMAX = 92, PM = 900, CD = PM / (VMAX * VMAX * VMAX), WHEEL_R = 0.36;
  const GEARS = [0.16, 0.26, 0.37, 0.49, 0.61, 0.74, 0.88, 1.06].map(f => f * VMAX);
  const GRIP = { a0: 28, a1: 0.006, cap: 56 }, BRAKE = { b0: 34, b1: 0.004, cap: 52 };
  const ASSIST = { full: { steerHelp: true, abs: true, tc: true }, medium: { steerHelp: false, abs: true, tc: true }, none: { steerHelp: false, abs: false, tc: false } };

  // ---------------------------------------------------------------- geometry helpers
  // rounded box via extruded rounded rectangle in YZ, extruded along X; optional taper of the +x end and of the top
  function roundedBox(lx, ly, lz, r, opts) {
    opts = opts || {}; r = Math.min(r, ly / 2 - 0.001, lz / 2 - 0.001);
    const s = new THREE.Shape(); const w = lz, h = ly; // shape in (z, y)
    s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    const g = new THREE.ExtrudeGeometry(s, { depth: lx, bevelEnabled: true, bevelThickness: Math.min(0.06, lx * 0.2), bevelSize: Math.min(0.05, r), bevelSegments: 2, curveSegments: 6 });
    // extrude goes along +z of the shape space; shape x -> world z, shape y -> world y, depth -> world x
    g.rotateY(Math.PI / 2); // now depth along +x ... (shape x -> -z)
    g.translate(-lx / 2 - 0.03, 0, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const t = U.clamp(x / lx + 0.5, 0, 1);
      const sw = U.lerp(opts.backW || 1, opts.frontW || 1, t), sh = U.lerp(opts.backH || 1, opts.frontH || 1, t);
      p.setZ(i, z * sw); p.setY(i, y * sh + (opts.droop || 0) * t * t);
    }
    g.computeVertexNormals(); return g;
  }
  function translate(g, x, y, z) { g.translate(x, y, z); return g; }

  // ---------------------------------------------------------------- lofted body: smooth superellipse cross-sections along x
  function loft(stations, zc, segs) {
    segs = segs || 28; const pos = [], idx = []; const n = stations.length;
    for (let i = 0; i < n; i++) {
      const st = stations[i]; const e = st.n || 2.6; const zOff = (zc || 0) + (st.zc || 0);
      for (let j = 0; j < segs; j++) {
        const t = (j / segs) * Math.PI * 2; const c = Math.cos(t), sn = Math.sin(t);
        const fy = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / e); const y = st.y0 + st.h / 2 + (st.h / 2) * fy;
        const k = (y - st.y0) / st.h; const w = st.wt != null ? U.lerp(st.w, st.wt, U.clamp(k, 0, 1)) : st.w;
        const z = zOff + w * Math.sign(c) * Math.pow(Math.abs(c), 2 / e);
        pos.push(st.x, y, z);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < segs; j++) { const a = i * segs + j, b = i * segs + (j + 1) % segs, c = (i + 1) * segs + j, d = (i + 1) * segs + (j + 1) % segs; idx.push(a, c, b, b, c, d); }
    // caps
    const capA = pos.length / 3; const sa = stations[0]; pos.push(sa.x, sa.y0 + sa.h / 2, (zc || 0) + (sa.zc || 0)); for (let j = 0; j < segs; j++) idx.push(capA, (j + 1) % segs, j);
    const capB = pos.length / 3; const sb = stations[n - 1]; pos.push(sb.x, sb.y0 + sb.h / 2, (zc || 0) + (sb.zc || 0)); for (let j = 0; j < segs; j++) idx.push(capB, (n - 1) * segs + j, (n - 1) * segs + (j + 1) % segs);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  const BODY = [
    { x: 2.95, w: 0.07, h: 0.1, y0: 0.3, n: 2.2 }, { x: 2.65, w: 0.12, h: 0.18, y0: 0.31, n: 2.4 }, { x: 2.25, w: 0.19, h: 0.28, y0: 0.32, n: 2.6 }, { x: 1.85, w: 0.26, h: 0.4, y0: 0.29, n: 2.8 },
    { x: 1.45, w: 0.33, h: 0.5, y0: 0.22, n: 3 }, { x: 1.05, w: 0.41, h: 0.58, y0: 0.16, n: 3.2 }, { x: 0.65, w: 0.46, h: 0.62, y0: 0.14, n: 3.4 }, { x: 0.3, w: 0.46, h: 0.7, y0: 0.14, n: 3.2, wt: 0.3 },
    { x: 0.0, w: 0.44, h: 0.96, y0: 0.14, n: 2.8, wt: 0.22 }, { x: -0.4, w: 0.4, h: 0.98, y0: 0.14, n: 2.8, wt: 0.2 }, { x: -0.9, w: 0.36, h: 0.84, y0: 0.14, n: 2.8, wt: 0.14 }, { x: -1.4, w: 0.31, h: 0.66, y0: 0.15, n: 2.8, wt: 0.1 },
    { x: -1.9, w: 0.24, h: 0.46, y0: 0.18, n: 2.6, wt: 0.08 }, { x: -2.3, w: 0.14, h: 0.28, y0: 0.24, n: 2.4 }, { x: -2.5, w: 0.07, h: 0.14, y0: 0.3, n: 2.2 },
  ];
  const POD = [
    { x: 0.28, w: 0.27, h: 0.42, y0: 0.14, n: 3.4, zc: 0 }, { x: -0.2, w: 0.33, h: 0.46, y0: 0.13, n: 3.4, zc: 0.02 }, { x: -0.8, w: 0.3, h: 0.42, y0: 0.13, n: 3.2, zc: -0.03 },
    { x: -1.4, w: 0.22, h: 0.32, y0: 0.14, n: 3, zc: -0.1 }, { x: -2.0, w: 0.11, h: 0.17, y0: 0.16, n: 2.6, zc: -0.16 }, { x: -2.3, w: 0.04, h: 0.07, y0: 0.19, n: 2.4, zc: -0.2 },
  ];

  let bodyGeoCache = null;
  function buildBodyGeometry() {
    if (bodyGeoCache) return bodyGeoCache;
    const parts = [];
    const add = (g) => parts.push(g.index ? g.toNonIndexed() : g);
    add(loft(BODY, 0)); add(loft(POD, 0.62)); add(loft(POD, -0.62));
    // shark fin
    add(translate(new THREE.BoxGeometry(1.3, 0.3, 0.025), -1.5, 0.95, 0));
    // floor and floor edges
    add(translate(roundedBox(3.8, 0.09, 1.78, 0.03, { frontW: 0.5 }), -0.7, 0.09, 0));
    for (const sgn of [1, -1]) { add(translate(new THREE.BoxGeometry(1.4, 0.03, 0.14), -0.5, 0.15, sgn * 0.95)); add(translate(new THREE.BoxGeometry(0.5, 0.28, 0.03), 0.9, 0.3, sgn * 0.7)); }
    // front wing: main plane + 2 flaps + endplates + pylons
    add(translate(roundedBox(0.6, 0.035, 1.98, 0.015), 2.95, 0.11, 0));
    add(translate(roundedBox(0.3, 0.03, 1.8, 0.012), 2.72, 0.2, 0));
    add(translate(roundedBox(0.22, 0.03, 1.5, 0.012), 2.58, 0.28, 0));
    for (const sgn of [1, -1]) add(translate(roundedBox(0.7, 0.34, 0.03, 0.012), 2.85, 0.25, sgn * 1.0));
    for (const sgn of [1, -1]) add(translate(new THREE.BoxGeometry(0.3, 0.25, 0.05), 2.7, 0.32, sgn * 0.18));
    // rear wing: endplates, main plane, beam wing, pylon (DRS flap is separate)
    for (const sgn of [1, -1]) add(translate(roundedBox(0.8, 0.72, 0.03, 0.02), -2.55, 0.8, sgn * 0.53));
    add(translate(roundedBox(0.36, 0.03, 1.04, 0.012), -2.55, 0.66, 0));
    add(translate(roundedBox(0.3, 0.03, 1.0, 0.012), -2.3, 0.42, 0));
    add(translate(new THREE.BoxGeometry(0.1, 0.5, 0.08), -2.3, 0.47, 0));
    for (const sgn of [1, -1]) add(translate(new THREE.BoxGeometry(0.1, 0.09, 0.17), 0.95, 0.8, sgn * 0.66));
    const pos = [], nrm = []; for (const g of parts) { pos.push(...g.attributes.position.array); nrm.push(...g.attributes.normal.array); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    const p = geo.attributes.position, n = geo.attributes.normal; const uv = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ny = n.getY(i), nz = n.getZ(i); const u = U.clamp((x + 3.0) / 6.2, 0, 1); let v;
      const side = Math.abs(ny) < 0.5 && Math.abs(nz) >= 0.5;
      if (!side) v = U.clamp((z + 1.0) / 2.0, 0, 1) * 0.5; else if (nz < 0) v = 0.5 + (1 - U.clamp(y / 1.2, 0, 1)) * 0.25; else v = 0.75 + (1 - U.clamp(y / 1.2, 0, 1)) * 0.25;
      uv.push(side && nz < 0 ? 1 - u : u, v);
    }
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); bodyGeoCache = geo; return geo;
  }

  // wheel: tyre with rounded shoulders (lathe), rim with spokes, branded sidewall ring
  let wheelCache = null;
  function wheelParts() {
    if (wheelCache) return wheelCache;
    const prof = []; const R = WHEEL_R, w = 0.2; const rr = 0.07;
    prof.push(new THREE.Vector2(0.2, -w)); prof.push(new THREE.Vector2(R - rr, -w)); prof.push(new THREE.Vector2(R - rr * 0.3, -w + rr * 0.3)); prof.push(new THREE.Vector2(R, -w + rr)); prof.push(new THREE.Vector2(R, w - rr)); prof.push(new THREE.Vector2(R - rr * 0.3, w - rr * 0.3)); prof.push(new THREE.Vector2(R - rr, w)); prof.push(new THREE.Vector2(0.2, w));
    const tyre = new THREE.LatheGeometry(prof, 24); tyre.rotateX(Math.PI / 2); // axis now along z
    const rim = new THREE.CylinderGeometry(0.215, 0.215, 0.36, 16); rim.rotateX(Math.PI / 2);
    const spokes = [];
    for (let i = 0; i < 5; i++) { const s = new THREE.BoxGeometry(0.05, 0.34, 0.42); s.rotateZ(i * Math.PI * 2 / 5); spokes.push(s.toNonIndexed()); }
    const sp = new THREE.BufferGeometry(); const pos = [], nrm = []; for (const g of spokes) { pos.push(...g.attributes.position.array); nrm.push(...g.attributes.normal.array); }
    sp.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sp.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    // sidewall texture with brand text + compound band (uv v along circumference)
    const sidewall = (color) => {
      // u = around the tyre, v = across the profile (0..0.43 inner sidewall, 0.43..0.57 tread, 0.57..1 outer sidewall)
      const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const ctx = c.getContext('2d');
      ctx.fillStyle = '#17171a'; ctx.fillRect(0, 0, 1024, 256);
      ctx.fillStyle = '#232326'; ctx.fillRect(0, 110, 1024, 36);
      const r = U.rng(3); for (let i = 0; i < 400; i++) { ctx.fillStyle = 'rgba(0,0,0,' + (0.2 + r() * 0.4) + ')'; ctx.fillRect(r() * 1024, 110 + r() * 36, 3 + r() * 8, 1); }
      for (const y of [70, 186]) { ctx.fillStyle = color; ctx.fillRect(0, y - 2, 1024, 5); }
      ctx.fillStyle = '#e6e6e6'; ctx.font = '900 22px Arial Black, Arial'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      for (let i = 0; i < 6; i++) { ctx.fillText('EIRELLI', 85 + i * 170, 40); ctx.save(); ctx.translate(85 + i * 170, 216); ctx.scale(-1, 1); ctx.fillText('EIRELLI', 0, 0); ctx.restore(); }
      const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8; return t;
    };
    wheelCache = { tyre, rim, spokes: sp, sidewall }; return wheelCache;
  }

  class Car {
    constructor(opts) {
      this.id = opts.id; this.team = opts.team; this.driver = opts.driver; this.name = opts.name || opts.driver.name; this.num = opts.num || opts.driver.num;
      this.isPlayer = !!opts.isPlayer; this.playerIndex = opts.playerIndex; this.tyre = EI.TYRES[opts.tyre || 'medium']; this.tyreKey = opts.tyre || 'medium';
      this.assist = ASSIST[opts.assist || 'full']; this.skill = opts.skill || 0.9; this.color = this.team.primary; this.envMap = opts.envMap;
      this.x = 0; this.y = 0; this.z = 0; this.heading = 0; this.v = 0; this.vLat = 0; this.steer = 0; this.yaw = 0; this.aLong = 0; this.aLat = 0; this.gear = 1; this.rpm = 0.1; this.gradeNow = 0;
      this.throttle = 0; this.brake = 0; this.drsOpen = false; this.drsEligible = false; this.drsZone = -1; this.inDrsZone = -1; this.ers = 1; this.ersActive = false; this.wear = 0; this.slipstream = 0;
      this.surface = 'asphalt'; this.offTrack = 0; this.hit = 0; this.wallHit = 0; this.trk = { i: -1, s: 0, lat: 0, along: 0, dist: 0 };
      this.dist = 0; this.lapsDone = 0; this.lap = 1; this.lapStart = 0; this.lastLap = -1; this.bestLap = -1; this.laps = []; this.sectorTimes = [-1, -1, -1]; this.bestSectors = [-1, -1, -1]; this.sector = 0; this.sectorStart = 0; this.lastSectorT = [-1, -1, -1];
      this.finished = false; this.finishTime = -1; this.penalty = 0; this.jumpStart = false; this.pos = 1; this.gapAhead = 0; this.gapLeader = 0;
      this.input = { throttle: 0, brake: 0, steer: 0, drs: false, ers: false };
      this.buildModel();
    }

    buildModel() {
      const glb = EI.CarGLB && EI.CarGLB.ready;
      const m = glb ? EI.CarGLB.build(this, this.isPlayer ? 'hi' : 'lo') : EI.CarModel.build(this);
      // wrapper group: the detailed model plus, for bots, a one-draw-call mid model (~25-120 m) and a coarse far model beyond
      this.group = new THREE.Group(); this.group.add(m.group); this.lodNear = m.group; this.lodMid = m.mid || null; this.lodFar = m.far || null; this.lodLevel = 0; this.lodIsFar = false;
      if (this.lodMid) { this.group.add(this.lodMid); this.group.add(this.lodFar); }
      else if (!this.isPlayer && glb) { const f = EI.CarModel.build(this); this.lodFar = f.group; this.lodFar.visible = false; this.group.add(this.lodFar); this.farWheels = f.wheels; }
      this.shadowMeshes = []; m.group.traverse(o => { if (o.isMesh && o.castShadow) this.shadowMeshes.push(o); }); this._cast = true;
      // shadow proxy: the GLB cars cast through one mesh (the mid geometry) that main.js draws in the shadow pass only
      this.shadowProxy = null; this.shadowOn = true;
      if (m.shadowGeo) { const p = new THREE.Mesh(m.shadowGeo, Car.proxyMat || (Car.proxyMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))); p.castShadow = true; p.matrixAutoUpdate = false; p.name = 'carShadow'; this.shadowProxy = p; }
      this.body = m.body; this.wheels = m.wheels; this.frontPivots = m.frontPivots; this.flap = m.flap; this.helmet = m.helmet; this.bodyMat = m.bodyMat; this.animateDriver = m.animate || null; this.screen = m.screen || null; this.screenTex = m.screenTex || null; this.flapClosed = m.flapClosed != null ? m.flapClosed : 0.5; this.flapOpen = m.flapOpen != null ? m.flapOpen : -0.15;
      this.pose = m.pose || null;
      this.group.name = 'car-' + this.id; this.wheelSpin = 0;
      this._fwd = new THREE.Vector3(); this._up = new THREE.Vector3(); this._right = new THREE.Vector3(); this._m = new THREE.Matrix4();
    }

    // distance-based level of detail (dist: metres from the nearest camera, already scaled for zoom and tier by main.js):
    // near (< 25 m) the detailed model, mid (< 70 m) and far: one draw call each; the sun shadow stops at 60 m
    setLOD(far, dist) {
      if (this.lodMid) {
        const L = this.lodLevel; const n = L === 0 ? (dist > 27 ? (dist > 72 ? 2 : 1) : 0) : L === 1 ? (dist < 23 ? 0 : dist > 75 ? 2 : 1) : (dist < 23 ? 0 : dist < 66 ? 1 : 2);
        if (n !== L) { this.lodLevel = n; this.lodNear.visible = n === 0; this.lodMid.visible = n === 1; this.lodFar.visible = n === 2; this.lodIsFar = n === 2; }
        this.shadowOn = dist < 60; this.blobOn = dist < 160; return;
      }
      if (far == null) far = this.lodIsFar ? dist > 120 : dist > 150;
      if (this.lodFar && far !== this.lodIsFar) { this.lodIsFar = far; this.lodNear.visible = !far; this.lodFar.visible = far; }
      this.shadowOn = dist < 60 || this.isPlayer;
      const cast = dist < 90; if (cast !== this._cast) { this._cast = cast; for (const o of this.shadowMeshes) o.castShadow = cast; }
    }
    place(x, z, heading, y) { this.x = x; this.z = z; this.y = y || 0; this.heading = heading; this.v = 0; this.vLat = 0; this.steer = 0; this.yaw = 0; this.trk.i = -1; this._px = null; this.vx = null; this.updateVisual(0); }
    get speedKmh() { return Math.abs(this.v) * 3.6; }

    // ------------------------------------------------------------------ physics
    update(dt, track, race) {
      const inp = this.input; const pr = track.project(this.x, this.z, this.trk.i, this.trk); const hw = track.halfWidth, kw = track.kerbWidth; const lat = pr.lat, i = pr.i;
      let surfGrip = 1, surfDrag = 0, surfRoll = 0.6; const absLat = Math.abs(lat);
      if (absLat <= hw) this.surface = 'asphalt';
      else if (absLat <= hw + kw) { this.surface = 'kerb'; surfGrip = 0.93; }
      else if (absLat <= hw + kw + 2) { this.surface = 'asphalt'; surfGrip = 0.97; }
      else if ((lat < 0 ? track.runoffL[i] : track.runoffR[i]) && absLat <= hw + kw + ((lat < 0 ? track.gravelL[i] : track.gravelR[i]) ? 7 : 14)) { this.surface = 'runoff'; surfGrip = 0.9; surfRoll = 1.2; }
      else { const grav = lat < 0 ? track.gravelL[i] : track.gravelR[i]; if (grav) { this.surface = 'gravel'; surfGrip = 0.55; surfDrag = 3.0 + 0.07 * Math.abs(this.v); surfRoll = 2.6; } else { this.surface = 'grass'; surfGrip = 0.62; surfDrag = 1.8 + 0.045 * Math.abs(this.v); surfRoll = 2; } }
      this.offTrack = this.surface === 'grass' || this.surface === 'gravel' ? this.offTrack + dt : 0;
      const mu = this.tyre.grip * surfGrip * (1 - 0.3 * Math.min(1, this.wear));
      const v = this.v, av = Math.abs(v);
      // pedals: a short first-order lag so digital keys ramp like a foot on a pedal (brake quicker than throttle)
      const thrT = U.clamp(inp.throttle, 0, 1), brkT = U.clamp(inp.brake, 0, 1);
      this.throttle += (thrT - this.throttle) * (1 - Math.exp(-dt / (thrT > this.throttle ? 0.14 : 0.08)));
      this.brake += (brkT - this.brake) * (1 - Math.exp(-dt / (brkT > this.brake ? 0.07 : 0.1)));
      if (Math.abs(this.throttle - thrT) < 0.004) this.throttle = thrT; if (Math.abs(this.brake - brkT) < 0.004) this.brake = brkT;
      if (this.finished && !this.isPlayer) this.throttle = Math.min(this.throttle, 0.6);
      let aEng = 0; this.shiftCut = Math.max(0, (this.shiftCut || 0) - dt);
      if (this.throttle > 0 && v >= -0.5) { const tract = (this.assist.tc ? 14 : 16) * Math.min(1, mu * 1.3); aEng = this.throttle * Math.min(tract, PM / Math.max(av, 6)); if (!this.assist.tc && this.throttle > 0.9 && av < 30 && this.surface !== 'asphalt') aEng *= 0.5; }
      this.ersActive = !!inp.ers && this.ers > 0.02 && this.throttle > 0.5 && v > 5;
      if (this.ersActive) { aEng += 4.5; this.ers = Math.max(0, this.ers - 0.22 * dt); } else this.ers = Math.min(1, this.ers + (0.012 + this.brake * 0.14) * dt);
      if (this.shiftCut > 0) aEng *= 0.15;                                        // ignition cut during an upshift
      if (this.throttle < 0.05 && v > 3) aEng -= 1.2 + 0.02 * av;                 // engine braking off throttle
      this.inDrsZone = -1; track.drs.forEach((z, zi) => { if (z.end >= z.start ? (pr.s >= z.start && pr.s <= z.end) : (pr.s >= z.start || pr.s <= z.end)) this.inDrsZone = zi; });   // a zone may wrap the start line
      this.drsOpen = !!inp.drs && this.inDrsZone >= 0 && this.drsEligible && this.drsZone === this.inDrsZone && this.brake < 0.1 && v > 25;
      const dragMul = (this.drsOpen ? 0.74 : 1) * (1 - 0.3 * this.slipstream);
      const aDrag = CD * v * av * dragMul + surfDrag * U.sign(v) * Math.min(1, av / 2);
      let aBrk = 0; if (this.brake > 0) { const bmax = Math.min(BRAKE.cap, BRAKE.b0 + BRAKE.b1 * v * v) * Math.max(0.3, mu); aBrk = this.brake * bmax * U.sign(v) * Math.min(1, av / 1.5); }
      const aRoll = surfRoll * U.sign(v) * Math.min(1, av / 1.5);
      const grade = track.grade[i]; this.gradeNow = grade;
      this.aLong = aEng - aDrag - aBrk - aRoll - 9.81 * grade;
      let nv = v + this.aLong * dt;
      // reverse: bots only on an explicit request; players after holding the brake for half a second at a standstill once racing
      if (this.brake > 0.5 && av < 0.6 && this.throttle === 0 && race && race.started) this.brakeHold = (this.brakeHold || 0) + dt; else this.brakeHold = 0;
      if (inp.reverse || (this.isPlayer && this.brakeHold > 0.5)) nv = Math.max(-6, nv - 4 * dt);
      if (v > 0 && nv < 0 && this.brake > 0) nv = 0;
      this.v = nv;
      // steering: smooth approach to the target with a speed-sensitive rate limit (slow hands at speed, quick return to centre)
      const steerTarget = U.clamp(inp.steer, -1, 1); const returning = Math.abs(steerTarget) < Math.abs(this.steer) || Math.sign(steerTarget) !== Math.sign(this.steer);
      // bots steer through the controller, not a hand on a wheel: a much lighter filter keeps their line-following precise
      const ai = !this.isPlayer; const rate = (ai ? 4 : 1) * (returning ? 2.0 : 1.0) * (1.6 + 14 / (1 + av / 12));
      const want = this.steer + (steerTarget - this.steer) * (1 - Math.exp(-dt * (ai ? 30 : 9)));
      this.steer += U.clamp(want - this.steer, -rate * dt, rate * dt);
      let aLatMax = mu * Math.min(GRIP.cap, GRIP.a0 + GRIP.a1 * v * v);
      if (!this.assist.abs && this.brake > 0.92 && av > 8) aLatMax *= 0.45;
      // steering lock: the original curve, plus extra lock only at hairpin speeds (below ~60 km/h; Monaco's Grand Hotel hairpin
      // needs an ~8 m turning radius). Above that the original value is the larger one, so the car drives exactly as before.
      const dMax = Math.max(0.42 / (1 + av / 18), 0.55 / (1 + Math.pow(av / 16, 3))); const delta = this.steer * dMax; let omega;
      if (this.assist.steerHelp) { const gripOmega = av > 0.5 ? aLatMax / av : 99; omega = this.steer * Math.min(Math.abs(v * Math.tan(dMax) / WB), gripOmega) * U.sign(v); this.aLat = v * omega; }
      else {
        omega = v * Math.tan(delta) / WB; this.aLat = v * omega;
        if (Math.abs(this.aLat) > aLatMax && av > 1) { const over = Math.abs(this.aLat) - aLatMax; omega = U.sign(omega) * (aLatMax / av) * 0.92; this.v -= Math.min(over * 0.12, 8) * dt * U.sign(v); this.vLat -= U.sign(this.aLat) * over * 0.35 * dt; this.aLat = v * omega; }
      }
      if (surfGrip < 0.6 && av > 5) this.vLat -= U.sign(this.aLat) * Math.abs(this.aLat) * 0.15 * dt;
      const tauYaw = (this.isPlayer ? 0.05 + 0.06 * Math.min(1, av / 60) : 0.03);                         // tyres take a moment to build slip angle
      this.yaw += (omega - this.yaw) * (1 - Math.exp(-dt / tauYaw)); this.aLat = v * this.yaw;
      this.heading = U.wrapAngle(this.heading - this.yaw * dt); this.vLat *= Math.exp(-dt * (surfGrip < 0.6 ? 2.5 : 7));
      const fx = Math.cos(this.heading), fz = Math.sin(this.heading); const lx = fz, lz = -fx;
      this.x += (fx * this.v + lx * this.vLat) * dt; this.z += (fz * this.v + lz * this.vLat) * dt;
      const p2 = track.project(this.x, this.z, this.trk.i, this.trk); const wl = track.wallR[p2.i] - 1.0, wr = track.wallL[p2.i] - 1.0; // L arrays are the lat<0 side (drawing convention)
      this.wallHit = Math.max(0, this.wallHit - dt);
      if (p2.lat > wl || p2.lat < -wr) {
        const side = p2.lat > wl ? 1 : -1; const target = side > 0 ? wl : -wr;
        this.x += track.nx[p2.i] * (target - p2.lat); this.z += track.nz[p2.i] * (target - p2.lat);
        const th = track.heading[p2.i]; const rel = U.wrapAngle(this.heading - th); const into = Math.abs(Math.sin(rel)) * av;
        this.v *= Math.max(0.35, 1 - into * 0.06); this.vLat = 0; this.heading = U.wrapAngle(th + side * 0.08); this.wallHit = Math.min(1, into * 0.15 + 0.2); p2.lat = target;
      }
      this.y = track.y[p2.i] + track.grade[p2.i] * p2.along;
      if (race && race.started) { let ds = p2.s - this._prevS; if (ds > track.length / 2) ds -= track.length; if (ds < -track.length / 2) ds += track.length; this.dist += ds; }
      this._prevS = p2.s;
      const stress = Math.min(1.5, Math.abs(this.aLat) / 40 + Math.abs(this.aLong) / 60); this.wear += this.tyre.wear * 0.01 * (0.4 + stress) * dt;
      let g = 0; while (g < GEARS.length - 1 && av > GEARS[g]) g++;
      // hold the gear through a 1.2 m/s band below the upshift point: on grass or gravel the ignition cut used to cost more speed than
      // the engine could win back, so the box shifted 1-2-1-2 for ever and the car sat at the first shift speed
      const pg = Math.max(0, (this._prevGear || 1) - 1); if (g === pg - 1 && av > GEARS[g] - 1.2) g = pg;
      const lo = g === 0 ? 0 : GEARS[g - 1], hi = GEARS[g]; this.gear = av < 0.5 && this.throttle === 0 ? 0 : g + 1;
      if (this.gear > (this._prevGear || 0) && this.gear > 1 && this.throttle > 0.5) this.shiftCut = 0.055; this._prevGear = this.gear;
      const frac = U.clamp((av - lo) / (hi - lo), 0, 1); const target = av < 0.5 ? 0.12 + this.throttle * 0.5 : 0.38 + 0.62 * frac;
      this.rpm += (target - this.rpm) * Math.min(1, dt * 18);
    }

    // called before each physics step so the renderer can interpolate between the previous and current pose
    savePose() { this._px = this.x; this._py = this.y; this._pz = this.z; this._ph = this.heading; }
    blend(alpha) {
      if (this._px == null) { this.vx = this.x; this.vy = this.y; this.vz = this.z; this.vh = this.heading; return; }
      this.vx = U.lerp(this._px, this.x, alpha); this.vy = U.lerp(this._py, this.y, alpha); this.vz = U.lerp(this._pz, this.z, alpha);
      this.vh = this._ph + U.wrapAngle(this.heading - this._ph) * alpha;
    }
    updateVisual(dt) {
      if (this.vx == null) this.blend(1);
      const g = this.group; g.position.set(this.vx, this.vy, this.vz);
      // orientation: forward pitched by the track grade, yaw from heading
      const fx = Math.cos(this.vh), fz = Math.sin(this.vh); const gr = this.gradeNow || 0;
      this._fwd.set(fx, gr, fz).normalize(); this._up.set(0, 1, 0); this._right.crossVectors(this._fwd, this._up).normalize(); this._up.crossVectors(this._right, this._fwd).normalize();
      this._m.makeBasis(this._fwd, this._up, this._right); g.quaternion.setFromRotationMatrix(this._m);
      // an F1 car is stiff and stuck to the road: a fraction of a degree of roll, a little dive under braking and squat on power
      const roll = U.clamp(-this.aLat * 0.0004, -0.012, 0.012), pitch = U.clamp(-this.aLong * 0.0008 - this.brake * 0.008, -0.025, 0.02);
      const kB = 1 - Math.exp(-dt / 0.14); this.body.rotation.x += (roll - this.body.rotation.x) * kB; this.body.rotation.z += (pitch - this.body.rotation.z) * kB;
      // suspension heave: kerb rattle, grass/gravel judder, a little squat under acceleration
      const av2 = Math.abs(this.v); this._t = (this._t || 0) + dt;
      const heaveAmp = this.surface === 'kerb' ? 0.012 : (this.surface === 'grass' ? 0.009 : this.surface === 'gravel' ? 0.014 : 0) * Math.min(1, av2 / 20);
      this.body.position.y = heaveAmp * Math.sin(this._t * (this.surface === 'kerb' ? 75 : 40) + this.id) - this.aLong * 0.0008;
      if (this.lodLevel === 2) return;   // far: frozen wheels, flap and driver
      if (this.animateDriver) this.animateDriver(this.steer, this.steer * 0.12);
      this.wheelSpin -= (this.v / WHEEL_R) * dt; for (const w of this.wheels) w.rotation.z = this.wheelSpin; if (this.lodIsFar && this.farWheels) for (const w of this.farWheels) w.rotation.z = this.wheelSpin;
      const sa = this.steer * 0.42 / (1 + Math.abs(this.v) / 18); for (const p of this.frontPivots) p.rotation.y = sa;
      const ft = this.drsOpen ? this.flapOpen : this.flapClosed; this.flap.rotation.z += (ft - this.flap.rotation.z) * Math.min(1, dt * 12);
      if (this.pose) this.pose(this.wheelSpin, sa, this.flap.rotation.z, this.body);
    }
  }
  EI.Car = Car; EI.CAR = { L, W, WB, VMAX, GEARS, GRIP, BRAKE, PM, CD };
})();
