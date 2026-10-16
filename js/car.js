// Equation I - car model and vehicle physics
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  const L = 5.6, W = 2.0, WB = 3.6, VMAX = 92, PM = 900, CD = PM / (VMAX * VMAX * VMAX), WHEEL_R = 0.36;
  const GEARS = [0.16, 0.26, 0.37, 0.49, 0.61, 0.74, 0.88, 1.06].map(f => f * VMAX);
  // ---------------------------------------------------------------- vehicle model constants
  // Single-track (bicycle) model with a front and a rear axle. Everything is per unit mass (forces in m/s^2).
  // Each axle: load = static share + aero share of downforce +- longitudinal load transfer; grip = mu * load with
  // load sensitivity; lateral force follows a slip-angle curve that rises to a peak and falls gently into a slide;
  // braking and drive forces share each tyre's grip through a friction circle.
  const G = 9.81;
  const VEH = {
    b: 0.46 * WB, a: 0.54 * WB,   // CoG to rear / front axle: 46 % of the static weight on the front
    h: 0.28,                      // CoG height (longitudinal load transfer)
    iz: 0.85 * 0.54 * 0.46 * WB * WB, // yaw inertia / mass (m^2): a low-polar-moment car
    mu0: 1.74, ls: 0.15,          // tyre friction at static load, load sensitivity
    kdf: 0.011, aero: 0.43,       // downforce / mass = kdf * v^2 (3.4 x weight at 200 km/h), share on the front axle
    frontTrim: 0.96,              // front grip a touch below the rear: gentle understeer at the limit
    peakF: 0.075, peakR: 0.06,    // slip angle (rad) at peak lateral force, front / rear
    shapeF: 1.2, shapeR: 1.35,    // curve shape: beyond the peak the force falls to sin(shape * pi / 2) of it, 95 % front, 85 % rear
    slide: 0.85,                  // sliding friction / peak friction for a locked or spinning tyre
    longMu: 1.04,                 // tyres give a little more grip along the wheel than sideways
    brakeSys: 50, bias: 0.6,      // brake system decel limit (m/s^2) and front share
    abs: 0.92, absR: 0.86, tc: 0.95, // fraction of the available grip the ABS (front / rear) and TC hold the tyres at
    lock0: 0.48, lockK: 1.3,      // road-wheel lock at parking speed (rad); at speed, full lock = lockK x the angle the grip limit needs
    drs: 0.9,                     // drag multiplier with the DRS flap open
  };
  VEH.nf0 = G * VEH.b / WB; VEH.nr0 = G * VEH.a / WB;
  VEH.bF = Math.tan(Math.PI / (2 * VEH.shapeF)); VEH.bR = Math.tan(Math.PI / (2 * VEH.shapeR)); // so each curve peaks at slip = peak
  function curve(x, c, b) { return Math.sin(c * Math.atan(b * x)); } // x = slip / peak slip; 0 -> 0, 1 -> 1 (peak), inf -> sin(c pi / 2)
  function axleGrip(n, n0, mu) { return mu * VEH.mu0 * n / (1 + VEH.ls * (n / n0 - 1)); }
  // steady-state limits at nominal grip (no longitudinal load), shared with the bots' speed profile
  function axleMax(v) {
    const df = VEH.kdf * v * v; const nf = VEH.nf0 + VEH.aero * df, nr = VEH.nr0 + (1 - VEH.aero) * df;
    return [axleGrip(nf, VEH.nf0, VEH.frontTrim), axleGrip(nr, VEH.nr0, 1)];
  }
  function latLimit(v) { const m = axleMax(v); return Math.min(m[0] * WB / VEH.b, m[1] * WB / VEH.a); }
  // longitudinal limits; latUse (0..1) = share of the lateral limit in use, which the friction circle takes off the tyres
  function brakeLimit(v, latUse) { const m = axleMax(v), c = Math.sqrt(Math.max(0.04, 1 - (latUse || 0) * (latUse || 0))); return Math.min(VEH.brakeSys, c * VEH.longMu * (VEH.abs * m[0] + VEH.absR * m[1])) + CD * v * v + 0.6; }
  function driveLimit(v, latUse) { const m = axleMax(v), c = Math.sqrt(Math.max(0.02, 1 - (latUse || 0) * (latUse || 0))); return Math.min(PM / Math.max(v, 5), c * VEH.tc * VEH.longMu * m[1] * 1.08) - CD * v * v - 0.6; }
  // steady-state road-wheel angle for yaw rate r at speed u (nominal grip): kinematic angle + front slip - rear slip
  function steerFor(u, r) {
    const au = Math.max(1, Math.abs(u)), m = axleMax(au), ay = Math.abs(u * r);
    const inv = (y, c, b) => Math.tan(Math.asin(Math.min(1, y)) / c) / b;
    const af = VEH.peakF * inv(ay * VEH.b / WB / m[0], VEH.shapeF, VEH.bF), ar = VEH.peakR * inv(ay * VEH.a / WB / m[1], VEH.shapeR, VEH.bR);
    return WB * r / au + Math.sign(r) * (af - ar);
  }
  // road-wheel angle at full steering input: generous at parking speed, proportional to what the grip can use at speed
  function steerMax(v) { const av = Math.abs(v); if (av < 1) return VEH.lock0; return Math.min(VEH.lock0, VEH.lockK * (WB * latLimit(av) / (av * av) + 0.035)); }
  // stab: stability control strength for the player's car (keeps the yaw rate to what the steering asks for and stops the rear
  // sliding past its grip peak); 'none' keeps a light touch so a keyboard driver can still catch the car
  const ASSIST = { full: { steerHelp: true, abs: true, tc: true, stab: 1 }, medium: { steerHelp: false, abs: true, tc: true, stab: 0.8 }, none: { steerHelp: false, abs: false, tc: false, stab: 0.35 } };
  // one axle's tyres: longitudinal demand fx and slip angle alpha in, forces out (TY). Grip fmax sideways, fxCap along the wheel
  // (loose ground digs in: more drive than side grip). Within the friction ellipse the side force follows the slip curve with
  // its peak shrunk by the longitudinal load; beyond it the tyre locks or spins and slides, the friction acting along the sliding
  // direction: a locked front only steers by sin(alpha) (understeer), a spinning rear lets go sideways (power oversteer).
  const TY = { fx: 0, fy: 0, slide: false };
  function tyre(fx, alpha, fmax, fxCap, peak, c, b, u, vSlip) {
    const ax = Math.abs(fx);
    if (ax <= fxCap) { const q = fx / fxCap; TY.fx = fx; TY.fy = Math.sign(alpha) * fmax * Math.sqrt(1 - q * q) * curve(Math.abs(alpha) / peak, c, b); TY.slide = false; return; }
    const vy = u * Math.abs(Math.sin(alpha)); const s = vy / Math.max(1e-6, Math.hypot(vy, vSlip));
    TY.fy = Math.sign(alpha) * fmax * VEH.slide * s; TY.fx = Math.sign(fx) * fxCap * VEH.slide * Math.sqrt(1 - s * s); TY.slide = true;
  }

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
      const m = (EI.CarGLB && EI.CarGLB.ready) ? EI.CarGLB.build(this, this.isPlayer ? 'hi' : 'lo') : EI.CarModel.build(this);
      // wrapper group: the detailed model plus, for bots, a cheap far model (procedural, ~10k triangles) swapped in beyond ~150 m
      this.group = new THREE.Group(); this.group.add(m.group); this.lodNear = m.group; this.lodFar = null; this.lodIsFar = false;
      if (!this.isPlayer && EI.CarGLB && EI.CarGLB.ready) { const f = EI.CarModel.build(this); this.lodFar = f.group; this.lodFar.visible = false; this.group.add(this.lodFar); this.farWheels = f.wheels; }
      this.shadowMeshes = []; m.group.traverse(o => { if (o.isMesh && o.castShadow) this.shadowMeshes.push(o); }); this._cast = true;
      this.body = m.body; this.wheels = m.wheels; this.frontPivots = m.frontPivots; this.flap = m.flap; this.helmet = m.helmet; this.bodyMat = m.bodyMat; this.animateDriver = m.animate || null; this.screen = m.screen || null; this.screenTex = m.screenTex || null; this.flapClosed = m.flapClosed != null ? m.flapClosed : 0.5; this.flapOpen = m.flapOpen != null ? m.flapOpen : -0.15;
      this.group.name = 'car-' + this.id; this.wheelSpin = 0;
      this._fwd = new THREE.Vector3(); this._up = new THREE.Vector3(); this._right = new THREE.Vector3(); this._m = new THREE.Matrix4();
    }

    // distance-based level of detail for bots; also drops shadow casting for distant cars
    setLOD(far, dist) {
      if (this.lodFar && far !== this.lodIsFar) { this.lodIsFar = far; this.lodNear.visible = !far; this.lodFar.visible = far; }
      const cast = dist < 90; if (cast !== this._cast) { this._cast = cast; for (const o of this.shadowMeshes) o.castShadow = cast; }
    }
    place(x, z, heading, y) {
      this.x = x; this.z = z; this.y = y || 0; this.heading = heading; this.v = 0; this.vLat = 0; this.steer = 0; this.yaw = 0; this.trk.i = -1; this._px = null; this.vx = null;
      this._w = 0; this._vLatOut = 0; this._yawOut = 0; this._kb = 0; this._ax = 0; this._fyr = 0; this.delta = 0; this.updateVisual(0);
    }
    get speedKmh() { return Math.abs(this.v) * 3.6; }

    // ------------------------------------------------------------------ physics
    update(dt, track, race) {
      const inp = this.input; const pr = track.project(this.x, this.z, this.trk.i, this.trk); const hw = track.halfWidth, kw = track.kerbWidth; const lat = pr.lat, i = pr.i;
      // surfaces: lateral grip, extra drag, rolling resistance, and how much drive / braking grip loose ground still gives
      // (tyres dig in for traction, but downforce barely helps on grass or gravel: capped per axle)
      let surfGrip = 1, surfDrag = 0, surfRoll = 0.6, surfLong = 1, surfCap = Infinity; const absLat = Math.abs(lat);
      if (absLat <= hw) this.surface = 'asphalt';
      else if (absLat <= hw + kw) { this.surface = 'kerb'; surfGrip = 0.97; }
      else if (absLat <= hw + kw + 2) { this.surface = 'asphalt'; surfGrip = 0.97; }
      else if ((lat < 0 ? track.runoffL[i] : track.runoffR[i]) && absLat <= hw + kw + ((lat < 0 ? track.gravelL[i] : track.gravelR[i]) ? 7 : 14)) { this.surface = 'runoff'; surfGrip = 0.9; surfRoll = 1.2; }
      else { const grav = lat < 0 ? track.gravelL[i] : track.gravelR[i]; if (grav) { this.surface = 'gravel'; surfGrip = 0.55; surfLong = 1.9; surfCap = 10.5; surfDrag = 3.0 + 0.07 * Math.abs(this.v); surfRoll = 2.6; } else { this.surface = 'grass'; surfGrip = 0.62; surfLong = 1.6; surfCap = 11; surfDrag = 1.8 + 0.045 * Math.abs(this.v); surfRoll = 2; } }
      this.offTrack = this.surface === 'grass' || this.surface === 'gravel' ? this.offTrack + dt : 0;
      const mu = this.tyre.grip * surfGrip * (1 - 0.3 * Math.min(1, this.wear));
      // the pit lane and car-to-car contact write v / vLat / yaw directly: fold those writes into the internal lateral velocity
      if (this._w == null || this.yaw !== this._yawOut) this._w = this.vLat || 0;
      else if (this.vLat !== this._vLatOut) this._w += this.vLat - this._vLatOut;
      const v = this.v, av = Math.abs(v);
      // pedals: a short first-order lag so digital keys ramp like a foot on a pedal (brake quicker than throttle)
      const thrT = U.clamp(inp.throttle, 0, 1), brkT = U.clamp(inp.brake, 0, 1);
      this.throttle += (thrT - this.throttle) * (1 - Math.exp(-dt / (thrT > this.throttle ? 0.14 : 0.08)));
      this.brake += (brkT - this.brake) * (1 - Math.exp(-dt / (brkT > this.brake ? 0.05 : 0.1)));
      if (Math.abs(this.throttle - thrT) < 0.004) this.throttle = thrT; if (Math.abs(this.brake - brkT) < 0.004) this.brake = brkT;
      if (this.finished && !this.isPlayer) this.throttle = Math.min(this.throttle, 0.6);
      // engine: power-limited drive force at the rear tyres, ERS, ignition cut on upshifts, engine braking off throttle
      let drive = 0; this.shiftCut = Math.max(0, (this.shiftCut || 0) - dt);
      if (this.throttle > 0 && v >= -0.5) drive = this.throttle * PM / Math.max(av, 5);
      this.ersActive = !!inp.ers && this.ers > 0.02 && this.throttle > 0.5 && v > 5;
      if (this.ersActive) { drive += 4.5; this.ers = Math.max(0, this.ers - 0.22 * dt); } else this.ers = Math.min(1, this.ers + (0.012 + this.brake * 0.14) * dt);
      if (this.shiftCut > 0) drive *= 0.15;
      const engBrake = this.throttle < 0.05 && v > 3 ? 1.2 + 0.02 * av : 0;
      this.inDrsZone = -1; track.drs.forEach((z, zi) => { if (z.end >= z.start ? (pr.s >= z.start && pr.s <= z.end) : (pr.s >= z.start || pr.s <= z.end)) this.inDrsZone = zi; });   // a zone may wrap the start line
      this.drsOpen = !!inp.drs && this.inDrsZone >= 0 && this.drsEligible && this.drsZone === this.inDrsZone && this.brake < 0.1 && v > 25;
      const dragMul = (this.drsOpen ? VEH.drs : 1) * (1 - 0.3 * this.slipstream);
      const grade = track.grade[i]; this.gradeNow = grade;
      const brakeF = this.brake * VEH.brakeSys;

      // steering. Keyboard / d-pad: the key ramps the wheel in like a hand (slower at speed) and lets it self-centre quickly,
      // so a tap is a small correction and a hold builds to full lock. Analog sticks go straight through.
      let steerT = U.clamp(inp.steer, -1, 1); const ai = !this.isPlayer;
      if (!ai && inp.steerDigital) {
        const kb = this._kb || 0; const rIn = 0.8 + 3.4 / (1 + (av / 22) * (av / 22)), rOut = 8;
        if (steerT === 0 || (kb !== 0 && Math.sign(steerT) !== Math.sign(kb))) this._kb = Math.abs(kb) <= rOut * dt ? 0 : kb - Math.sign(kb) * rOut * dt;
        else this._kb = kb + U.clamp(steerT - kb, -rIn * dt, rIn * dt);
        steerT = this._kb;
      } else this._kb = steerT;
      // hands: a light low-pass plus a rate limit in input units (the road-wheel angle per unit input already shrinks with speed)
      const returning = Math.abs(steerT) < Math.abs(this.steer) || Math.sign(steerT) !== Math.sign(this.steer);
      const sRate = ai ? 30 : (returning ? 10 : 7);
      const sWant = this.steer + (steerT - this.steer) * (1 - Math.exp(-dt / (ai ? 0.02 : 0.04)));
      this.steer += U.clamp(sWant - this.steer, -sRate * dt, sRate * dt);
      const dMax = steerMax(av);

      // axle loads: static + aero + longitudinal load transfer (from the filtered acceleration: the chassis pitches)
      const dfv = VEH.kdf * v * v * (this.drsOpen ? 0.92 : 1); const dn = -(this._ax || 0) * VEH.h / WB;
      const nf = Math.max(0.25 * VEH.nf0, VEH.nf0 + VEH.aero * dfv + dn), nr = Math.max(0.25 * VEH.nr0, VEH.nr0 + (1 - VEH.aero) * dfv - dn);
      // kerbs: the car skips across the ridges, the front and the rear axle losing grip out of step
      let kf = 1, kr = 1;
      if (this.surface === 'kerb') { this._odo = (this._odo || 0) + av * dt; kf = 1 - 0.12 * (0.5 + 0.5 * Math.sin(this._odo * 1.6)); kr = 1 - 0.12 * (0.5 + 0.5 * Math.sin(this._odo * 1.6 - 1.7)); }
      const fmf = axleGrip(nf, VEH.nf0, mu * VEH.frontTrim * kf), fmr = axleGrip(nr, VEH.nr0, mu * kr);
      // explicit integration of stiff tyres: sub-step at low speed; below walking pace the car simply follows its front wheels
      const cLin = VEH.shapeF * VEH.bF * fmf / VEH.peakF + VEH.shapeR * VEH.bR * fmr / VEH.peakR;
      const nSub = Math.min(8, Math.max(1, Math.ceil(dt * 2.5 * cLin / Math.max(av, 2)))); const h = dt / nSub;
      const kDyn = U.clamp((av - 2.5) / 4, 0, 1);
      const resistRoll = surfRoll + surfDrag;
      let u = v, w = this._w, r = this.yaw, Fx = 0, Fy = 0, delta = 0, af = 0, ar = 0, fyr = this._fyr || 0, lockF = false, spinR = false;
      for (let k = 0; k < nSub; k++) {
        const au = Math.abs(u), su = U.sign(u) * Math.min(1, au / 1.5);
        delta = this.steer * dMax; af = 0; ar = 0;
        if (u > 0.5) {
          const thF = Math.atan2(w + VEH.a * r, u), thR = Math.atan2(w - VEH.b * r, u);
          // when the rear lets go, the steering reference follows the slide (centred stick = wheels along the direction of
          // travel), so the small lock a pad or keyboard gives at speed can still catch a power slide
          const ex = Math.abs(thR) - VEH.peakR; if (ex > 0) delta = U.clamp(delta + Math.sign(thR) * ex * (this.assist.steerHelp ? 1 : 0.8), -VEH.lock0, VEH.lock0);
          // steering assist: never ask the front tyres for more slip than their peak (no scrubbing, catches slides)
          if (this.assist.steerHelp) delta = U.clamp(delta, thF - VEH.peakF, thF + VEH.peakF);
          af = delta - thF; ar = -thR;
        }
        // longitudinal demand per axle (positive = retarding): brake balance, engine braking on the rear; ABS / TC trim it
        let bf = brakeF * VEH.bias * su, br = (brakeF * (1 - VEH.bias) + engBrake) * su, dr = drive;
        const fxCapF = Math.min(surfCap, fmf * VEH.longMu * surfLong), fxCapR = Math.min(surfCap, fmr * VEH.longMu * surfLong);
        if (this.assist.abs) { bf = U.clamp(bf, -VEH.abs * fxCapF, VEH.abs * fxCapF); br = U.clamp(br, -VEH.absR * fxCapR, VEH.absR * fxCapR); }
        if (this.assist.tc && dr > 0) dr = Math.min(dr, br + VEH.tc * fxCapR * Math.sqrt(Math.max(0, 1 - (fyr / fmr) * (fyr / fmr))));
        tyre(-bf, af, fmf, fxCapF, VEH.peakF, VEH.shapeF, VEH.bF, au, au); const fxf = TY.fx, fyf = TY.fy; lockF = TY.slide;
        tyre(dr - br, ar, fmr, fxCapR, VEH.peakR, VEH.shapeR, VEH.bR, au, dr > br ? 1.5 + 0.05 * au : au); const fxr = TY.fx; fyr = TY.fy; spinR = TY.slide && dr > br;
        const cd = Math.cos(delta), sd = Math.sin(delta); const fyFront = fxf * sd + fyf * cd;
        Fx = fxf * cd - fyf * sd + fxr - CD * u * au * dragMul - resistRoll * su - G * grade;
        Fy = fyFront + fyr;
        const Mz = VEH.a * fyFront - VEH.b * fyr;
        const u0 = u;
        u += h * (Fx + kDyn * r * w); w += h * (Fy - r * u0); r += h * Mz / VEH.iz;
        // stability control (player cars): the yaw rate follows what the steering asks for, capped at what the tyres can hold,
        // and the rear is not allowed to slide far past its grip peak, so the car neither spins nor keeps rotating after a tap
        const stab = ai ? 0 : (this.assist.stab || 0);
        if (stab > 0 && u > 4) {
          const rMax = (fmf + fmr) * 0.97 / u; const rT = U.clamp(u * Math.tan(delta) / WB, -rMax, rMax);
          r += (rT - r) * stab * (1 - Math.exp(-h / 0.09));
          const vr = w - VEH.b * r, lim = u * Math.tan(VEH.peakR * 1.1);
          if (Math.abs(vr) > lim) w += (Math.sign(vr) * lim - vr) * stab * (1 - Math.exp(-h / 0.05));
        }
        if (kDyn < 1) { const rk = u * Math.tan(delta) / WB; r = U.lerp(rk, r, kDyn); w = U.lerp(rk * VEH.b, w, kDyn); }
        if (u0 > 0 && u < 0 && brakeF > 0) u = 0;
        this.heading = U.wrapAngle(this.heading - r * h);
        const cx = Math.cos(this.heading), cz = Math.sin(this.heading);
        this.x += (cx * u + cz * w) * h; this.z += (cz * u - cx * w) * h;
      }
      // reverse: bots only on an explicit request; players after holding the brake for half a second at a standstill once racing
      if (this.brake > 0.5 && av < 0.6 && this.throttle === 0 && race && race.started) this.brakeHold = (this.brakeHold || 0) + dt; else this.brakeHold = 0;
      if (inp.reverse || (this.isPlayer && this.brakeHold > 0.5)) u = Math.max(-6, u - 4 * dt);
      // straight-line help (full assists, player): with the wheel centred the car settles onto the road's direction, so a light
      // keyboard tap is a lane change rather than a new heading the driver has to tap back out of. Small errors only (< ~8 deg),
      // never against a deliberate input, and at most 4 deg/s
      if (!ai && this.assist.steerHelp && Math.abs(steerT) < 0.01 && Math.abs(this.steer) < 0.04 && av > 15) {
        const err = U.wrapAngle(track.heading[i] - this.heading);
        if (Math.abs(err) < 0.14) { const d = U.clamp(err * (1 - Math.exp(-dt / 0.45)), -0.07 * dt, 0.07 * dt); this.heading = U.wrapAngle(this.heading + d); }
      }
      this.v = u; this._w = w; this.yaw = r; this._fyr = fyr; this.delta = delta; this.alphaF = af; this.alphaR = ar; this.lockF = lockF && brakeF > 0; this.spinR = spinR;
      this.aLong = Fx; this.aLat = kDyn * Fy + (1 - kDyn) * u * r; this.beta = Math.atan2(w, Math.max(1, Math.abs(u)));
      this._ax = (this._ax || 0) + (Fx - (this._ax || 0)) * (1 - Math.exp(-dt / 0.06));
      const p2 = track.project(this.x, this.z, this.trk.i, this.trk); const wl = track.wallR[p2.i] - 1.0, wr = track.wallL[p2.i] - 1.0; // L arrays are the lat<0 side (drawing convention)
      this.wallHit = Math.max(0, this.wallHit - dt);
      if (p2.lat > wl || p2.lat < -wr) {
        const side = p2.lat > wl ? 1 : -1; const target = side > 0 ? wl : -wr;
        this.x += track.nx[p2.i] * (target - p2.lat); this.z += track.nz[p2.i] * (target - p2.lat);
        const th = track.heading[p2.i]; const rel = U.wrapAngle(this.heading - th); const into = Math.abs(Math.sin(rel)) * av;
        this.v *= Math.max(0.35, 1 - into * 0.06); this._w = 0; this.yaw *= 0.25; this.heading = U.wrapAngle(th + side * 0.08); this.wallHit = Math.min(1, into * 0.15 + 0.2); p2.lat = target;
      }
      // published lateral velocity: the slide, i.e. how fast the rear axle moves sideways beyond what the tyres hold at peak slip
      const vr = this._w - VEH.b * this.yaw, gripV = Math.abs(this.v) * Math.tan(VEH.peakR) * 1.5;
      this.vLat = Math.abs(vr) > gripV ? vr - Math.sign(vr) * gripV : 0; this._vLatOut = this.vLat; this._yawOut = this.yaw;
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
      if (this.animateDriver) this.animateDriver(this.steer, this.steer * 0.12);
      this.wheelSpin -= (this.v / WHEEL_R) * dt; for (const w of this.wheels) w.rotation.z = this.wheelSpin; if (this.lodIsFar && this.farWheels) for (const w of this.farWheels) w.rotation.z = this.wheelSpin;
      const sa = this.delta || 0; for (const p of this.frontPivots) p.rotation.y = sa;
      const ft = this.drsOpen ? this.flapOpen : this.flapClosed; this.flap.rotation.z += (ft - this.flap.rotation.z) * Math.min(1, dt * 12);
    }
  }
  EI.Car = Car; EI.CAR = { L, W, WB, VMAX, GEARS, PM, CD, VEH, latLimit, brakeLimit, driveLimit, steerMax, steerFor };
})();
