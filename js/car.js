// Equation I - car model and vehicle physics
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  const L = 5.6, W = 2.0, WB = 3.6;        // length, width, wheelbase (m)
  const VMAX = 92;                           // m/s (331 km/h) with DRS closed
  const PM = 900;                            // power / mass (W/kg)
  const CD = PM / (VMAX * VMAX * VMAX);     // drag coefficient so that top speed = VMAX
  const WHEEL_R = 0.36;
  const GEARS = [0.16, 0.26, 0.37, 0.49, 0.61, 0.74, 0.88, 1.06].map(f => f * VMAX);
  const GRIP = { a0: 28, a1: 0.006, cap: 56 };   // lateral acceleration limit: a0 + a1*v^2, capped
  const BRAKE = { b0: 34, b1: 0.004, cap: 52 };  // braking deceleration
  const ASSIST = { full: { steerHelp: true, abs: true, tc: true }, medium: { steerHelp: false, abs: true, tc: true }, none: { steerHelp: false, abs: false, tc: false } };

  let bodyGeoCache = null;
  function buildBodyGeometry() {
    if (bodyGeoCache) return bodyGeoCache;
    const parts = [];
    const add = (geo, tx, ty, tz, rx, ry, rz, sx, sy, sz) => {
      if (sx != null) geo.scale(sx, sy, sz);
      if (rx) geo.rotateX(rx); if (ry) geo.rotateY(ry); if (rz) geo.rotateZ(rz);
      geo.translate(tx, ty, tz); parts.push(geo.toNonIndexed());
    };
    const taperBox = (lx, ly, lz, frontScale, topScale) => {
      // box whose +x end is scaled by frontScale (width) and top by topScale (for engine cover shapes)
      const g = new THREE.BoxGeometry(lx, ly, lz, 1, 1, 1); const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const t = (x / lx) + 0.5; const s = U.lerp(1, frontScale, t);
        p.setZ(i, z * s); if (y > 0) p.setY(i, y * U.lerp(1, topScale, t));
      }
      g.computeVertexNormals(); return g;
    };
    // floor
    add(new THREE.BoxGeometry(4.6, 0.08, 1.75), -0.1, 0.08, 0);
    // monocoque / cockpit
    add(taperBox(1.9, 0.6, 0.95, 0.75, 0.9), 0.55, 0.42, 0);
    // nose (tapered)
    add(taperBox(1.9, 0.38, 0.62, 0.3, 0.55), 2.3, 0.48, 0);
    // engine cover and airbox
    add(taperBox(2.2, 0.75, 0.7, 0.45, 0.45), -1.35, 0.5, 0);
    add(taperBox(0.9, 0.4, 0.5, 0.6, 0.7), -0.15, 1.02, 0);
    // sidepods (with undercut taper to the rear)
    add(taperBox(2.0, 0.5, 0.55, 0.45, 0.85), -0.75, 0.33, 0.62);
    add(taperBox(2.0, 0.5, 0.55, 0.45, 0.85), -0.75, 0.33, -0.62);
    // sidepod inlets (dark)
    // bargeboards / floor edges
    add(new THREE.BoxGeometry(1.6, 0.04, 0.12), -0.6, 0.14, 0.93);
    add(new THREE.BoxGeometry(1.6, 0.04, 0.12), -0.6, 0.14, -0.93);
    // front wing: main plane + flap + endplates + nose pylons
    add(new THREE.BoxGeometry(0.55, 0.04, 1.95), 2.95, 0.12, 0);
    add(new THREE.BoxGeometry(0.3, 0.035, 1.8), 2.7, 0.22, 0, 0, 0, 0.35);
    add(new THREE.BoxGeometry(0.6, 0.3, 0.03), 2.85, 0.24, 0.99);
    add(new THREE.BoxGeometry(0.6, 0.3, 0.03), 2.85, 0.24, -0.99);
    add(new THREE.BoxGeometry(0.3, 0.22, 0.05), 2.75, 0.3, 0.2);
    add(new THREE.BoxGeometry(0.3, 0.22, 0.05), 2.75, 0.3, -0.2);
    // rear wing: endplates, lower beam, main plane (flap is separate for DRS)
    add(new THREE.BoxGeometry(0.75, 0.7, 0.03), -2.55, 0.8, 0.52);
    add(new THREE.BoxGeometry(0.75, 0.7, 0.03), -2.55, 0.8, -0.52);
    add(new THREE.BoxGeometry(0.35, 0.03, 1.0), -2.55, 0.66, 0);
    add(new THREE.BoxGeometry(0.3, 0.03, 1.0), -2.3, 0.42, 0); // beam wing
    add(new THREE.BoxGeometry(0.12, 0.45, 0.08), -2.3, 0.45, 0); // swan neck pylon
    // mirrors
    add(new THREE.BoxGeometry(0.12, 0.08, 0.16), 0.9, 0.78, 0.62);
    add(new THREE.BoxGeometry(0.12, 0.08, 0.16), 0.9, 0.78, -0.62);
    // merge
    const pos = [], nrm = [], uv = [];
    for (const g of parts) { pos.push(...g.attributes.position.array); nrm.push(...g.attributes.normal.array); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    // box projection into the livery sheet
    const p = geo.attributes.position, n = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ny = n.getY(i), nz = n.getZ(i);
      const u = U.clamp((x + 3.0) / 6.2, 0, 1);
      let v;
      if (Math.abs(ny) >= 0.5 || Math.abs(nz) < 0.5) v = U.clamp((z + 1.0) / 2.0, 0, 1) * 0.5;
      else if (nz < 0) v = 0.5 + (1 - U.clamp(y / 1.2, 0, 1)) * 0.25;
      else v = 0.75 + (1 - U.clamp(y / 1.2, 0, 1)) * 0.25;
      uv.push(u, v);
    }
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    bodyGeoCache = geo; return geo;
  }

  let wheelGeoCache = null;
  function wheelGeometry() {
    if (wheelGeoCache) return wheelGeoCache;
    const tyre = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.4, 18, 1); tyre.rotateX(Math.PI / 2);
    wheelGeoCache = tyre; return tyre;
  }

  class Car {
    constructor(opts) {
      this.id = opts.id; this.team = opts.team; this.driver = opts.driver; this.name = opts.name || opts.driver.name;
      this.num = opts.num || opts.driver.num; this.isPlayer = !!opts.isPlayer; this.playerIndex = opts.playerIndex;
      this.tyre = EI.TYRES[opts.tyre || 'medium']; this.tyreKey = opts.tyre || 'medium';
      this.assist = ASSIST[opts.assist || 'full'];
      this.skill = opts.skill || 0.9;
      this.color = this.team.primary;
      // state
      this.x = 0; this.z = 0; this.heading = 0; this.v = 0; this.vLat = 0; this.steer = 0; this.yaw = 0;
      this.aLong = 0; this.aLat = 0; this.gear = 1; this.rpm = 0.1;
      this.throttle = 0; this.brake = 0; this.steerIn = 0;
      this.drsOpen = false; this.drsEligible = false; this.drsZone = -1; this.inDrsZone = -1;
      this.ers = 1; this.ersActive = false; this.wear = 0; this.slipstream = 0;
      this.surface = 'asphalt'; this.offTrack = 0; this.hit = 0; this.wallHit = 0;
      this.trk = { i: -1, s: 0, lat: 0, along: 0 };
      this.dist = 0; this.lapsDone = 0; this.lap = 1; this.lapStart = 0; this.lastLap = -1; this.bestLap = -1; this.laps = [];
      this.finished = false; this.finishTime = -1; this.penalty = 0; this.jumpStart = false; this.pos = 1; this.gapAhead = 0; this.gapLeader = 0;
      this.input = { throttle: 0, brake: 0, steer: 0, drs: false, ers: false };
      this.buildModel();
    }

    buildModel() {
      const g = new THREE.Group(); g.name = 'car-' + this.id;
      const tex = EI.paintLivery(this.team, this.num, this.isPlayer ? this.name : null);
      this.bodyMat = new THREE.MeshPhongMaterial({ map: tex, shininess: 60, specular: 0x333333 });
      const body = new THREE.Mesh(buildBodyGeometry(), this.bodyMat); body.castShadow = true; body.receiveShadow = false;
      this.body = new THREE.Group(); this.body.add(body); g.add(this.body);
      // dark parts: sidepod inlets, cockpit opening, diffuser
      const dark = new THREE.MeshLambertMaterial({ color: 0x15161a });
      const inletL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.42), dark); inletL.position.set(0.27, 0.36, 0.62);
      const inletR = inletL.clone(); inletR.position.z = -0.62;
      const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.5), dark); cockpit.position.set(0.5, 0.72, 0);
      const diffuser = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 1.3), dark); diffuser.position.set(-2.35, 0.2, 0);
      this.body.add(inletL, inletR, cockpit, diffuser);
      // halo
      const haloMat = new THREE.MeshPhongMaterial({ color: 0x202226, shininess: 80 });
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.045, 8, 20, Math.PI), haloMat);
      halo.rotation.x = -Math.PI / 2; halo.rotation.z = Math.PI / 2; halo.position.set(0.45, 0.96, 0); halo.scale.set(1.25, 1, 1);
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.06), haloMat); pylon.position.set(1.05, 0.86, 0); pylon.rotation.z = -0.5;
      this.body.add(halo, pylon);
      // driver helmet
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), new THREE.MeshPhongMaterial({ color: this.team.accent, shininess: 90 }));
      helmet.position.set(0.35, 0.8, 0); this.body.add(helmet);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.2), dark); visor.position.set(0.5, 0.8, 0); this.body.add(visor);
      // DRS flap (hinge at its rear-top edge)
      const flapGeo = new THREE.BoxGeometry(0.3, 0.03, 1.0); flapGeo.translate(0.15, 0, 0);
      this.flap = new THREE.Mesh(flapGeo, this.bodyMat); this.flap.position.set(-2.75, 0.95, 0); this.flap.rotation.z = 0.12;
      this.body.add(this.flap);
      // rear wing upper main plane (fixed)
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 1.0), this.bodyMat); upper.position.set(-2.5, 0.9, 0); upper.rotation.z = 0.25; this.body.add(upper);
      // wheels: tyre + rim + compound sidewall ring
      const tyreMat = new THREE.MeshPhongMaterial({ color: 0x141414, shininess: 10 });
      const rimMat = new THREE.MeshPhongMaterial({ color: 0x8a8d92, shininess: 100 });
      const ringMat = new THREE.MeshBasicMaterial({ color: this.tyre.color });
      this.wheels = []; this.frontPivots = [];
      const wpos = [[1.75, 0.95], [1.75, -0.95], [-1.85, 0.98], [-1.85, -0.98]];
      wpos.forEach((wp, k) => {
        const pivot = new THREE.Group(); pivot.position.set(wp[0], WHEEL_R, wp[1]);
        const tyre = new THREE.Mesh(wheelGeometry(), tyreMat); tyre.castShadow = true;
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.42, 12), rimMat); rim.rotation.x = Math.PI / 2;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.02, 4, 18), ringMat); ring.position.z = (wp[1] > 0 ? 0.2 : -0.2);
        const spin = new THREE.Group(); spin.add(tyre, rim, ring); pivot.add(spin);
        // suspension arms
        const armMat = new THREE.MeshLambertMaterial({ color: 0x1a1b1f });
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, Math.abs(wp[1]) - 0.3), armMat); arm.position.set(wp[0] + (k < 2 ? -0.2 : 0.2), 0.42, wp[1] * 0.45); this.body.add(arm);
        const arm2 = arm.clone(); arm2.position.set(wp[0] + (k < 2 ? 0.2 : -0.2), 0.25, wp[1] * 0.45); this.body.add(arm2);
        g.add(pivot); this.wheels.push(spin); if (k < 2) this.frontPivots.push(pivot);
      });
      // small shadow disc under the car to anchor it visually
      this.group = g; this.wheelSpin = 0;
    }

    place(x, z, heading) {
      this.x = x; this.z = z; this.heading = heading; this.v = 0; this.vLat = 0; this.steer = 0; this.yaw = 0;
      this.trk.i = -1; this.updateVisual(0);
    }

    get speedKmh() { return Math.abs(this.v) * 3.6; }

    // ------------------------------------------------------------------ physics
    update(dt, track, race) {
      const inp = this.input;
      const pr = track.project(this.x, this.z, this.trk.i, this.trk);
      const hw = track.halfWidth, kw = track.kerbWidth;
      const lat = pr.lat, i = pr.i;
      // surface
      let surfGrip = 1, surfDrag = 0, surfRoll = 0.6;
      const absLat = Math.abs(lat);
      if (absLat <= hw) this.surface = 'asphalt';
      else if (absLat <= hw + kw) { this.surface = 'kerb'; surfGrip = 0.93; }
      else {
        const grav = lat > 0 ? track.gravelL[i] : track.gravelR[i];
        if (grav) { this.surface = 'gravel'; surfGrip = 0.35; surfDrag = 14 + 0.25 * Math.abs(this.v); surfRoll = 3; }
        else { this.surface = 'grass'; surfGrip = 0.45; surfDrag = 5 + 0.08 * Math.abs(this.v); surfRoll = 2; }
      }
      this.offTrack = this.surface === 'grass' || this.surface === 'gravel' ? this.offTrack + dt : 0;
      const wearGrip = 1 - 0.3 * Math.min(1, this.wear);
      const mu = this.tyre.grip * surfGrip * wearGrip;
      const v = this.v, av = Math.abs(v);
      // ---- longitudinal
      this.throttle = U.clamp(inp.throttle, 0, 1); this.brake = U.clamp(inp.brake, 0, 1);
      if (this.finished && !this.isPlayer) { this.throttle = Math.min(this.throttle, 0.6); }
      let aEng = 0;
      if (this.throttle > 0 && v >= -0.5) {
        const tract = (this.assist.tc ? 14 : 16) * Math.min(1, mu * 1.3);
        aEng = this.throttle * Math.min(tract, PM / Math.max(av, 6));
        if (!this.assist.tc && this.throttle > 0.9 && av < 30 && this.surface !== 'asphalt') aEng *= 0.5;
      }
      // ERS boost
      this.ersActive = !!inp.ers && this.ers > 0.02 && this.throttle > 0.5 && v > 5;
      if (this.ersActive) { aEng += 4.5; this.ers = Math.max(0, this.ers - 0.22 * dt); }
      else { this.ers = Math.min(1, this.ers + (0.012 + this.brake * 0.14) * dt); }
      // DRS
      this.inDrsZone = -1;
      track.drs.forEach((z, zi) => { if (pr.s >= z.start && pr.s <= z.end) this.inDrsZone = zi; });
      const wantDrs = !!inp.drs && this.inDrsZone >= 0 && this.drsEligible && this.drsZone === this.inDrsZone && this.brake < 0.1 && v > 25;
      this.drsOpen = wantDrs;
      const dragMul = (this.drsOpen ? 0.74 : 1) * (1 - 0.3 * this.slipstream);
      const aDrag = CD * v * av * dragMul + surfDrag * U.sign(v) * Math.min(1, av / 2);
      let aBrk = 0;
      if (this.brake > 0) {
        const bmax = Math.min(BRAKE.cap, BRAKE.b0 + BRAKE.b1 * v * v) * Math.max(0.3, mu);
        aBrk = this.brake * bmax * U.sign(v) * Math.min(1, av / 1.5);
      }
      const aRoll = surfRoll * U.sign(v) * Math.min(1, av / 1.5);
      this.aLong = aEng - aDrag - aBrk - aRoll;
      let nv = v + this.aLong * dt;
      // reverse when braking from standstill
      if (this.brake > 0.5 && av < 0.6 && this.throttle === 0) nv = Math.max(-6, nv - 4 * dt);
      if (v > 0 && nv < 0 && this.brake > 0) nv = 0;
      this.v = nv;
      // ---- lateral / steering
      const steerTarget = U.clamp(inp.steer, -1, 1);
      const rate = 7 + av * 0.04;
      this.steer += U.clamp(steerTarget - this.steer, -rate * dt, rate * dt);
      this.steerIn = this.steer;
      let aLatMax = mu * Math.min(GRIP.cap, GRIP.a0 + GRIP.a1 * v * v);
      if (!this.assist.abs && this.brake > 0.92 && av > 8) aLatMax *= 0.45; // locked wheels
      const dMax = 0.42 / (1 + av / 18);
      const delta = this.steer * dMax;
      let omega;
      if (this.assist.steerHelp) {
        const gripOmega = av > 0.5 ? aLatMax / av : 99;
        omega = this.steer * Math.min(Math.abs(v * Math.tan(dMax) / WB), gripOmega) * U.sign(v);
        this.aLat = v * omega;
      } else {
        omega = v * Math.tan(delta) / WB;
        this.aLat = v * omega;
        if (Math.abs(this.aLat) > aLatMax && av > 1) {
          const over = Math.abs(this.aLat) - aLatMax;
          omega = U.sign(omega) * (aLatMax / av) * 0.92;
          this.v -= Math.min(over * 0.12, 8) * dt * U.sign(v);
          this.vLat -= U.sign(this.aLat) * over * 0.35 * dt;
          this.aLat = v * omega;
        }
      }
      // extra slide on low grip surfaces when turning hard
      if (surfGrip < 0.6 && av > 5) this.vLat -= U.sign(this.aLat) * Math.abs(this.aLat) * 0.15 * dt;
      this.yaw = omega;
      this.heading = U.wrapAngle(this.heading - omega * dt);
      this.vLat *= Math.exp(-dt * (surfGrip < 0.6 ? 2.5 : 7));
      // ---- integrate position
      const fx = Math.cos(this.heading), fz = Math.sin(this.heading);
      const lx = fz, lz = -fx; // left normal
      this.x += (fx * this.v + lx * this.vLat) * dt;
      this.z += (fz * this.v + lz * this.vLat) * dt;
      // ---- barriers
      const p2 = track.project(this.x, this.z, this.trk.i, this.trk);
      const wl = track.wallL[p2.i] - 1.0, wr = track.wallR[p2.i] - 1.0;
      this.wallHit = Math.max(0, this.wallHit - dt);
      if (p2.lat > wl || p2.lat < -wr) {
        const side = p2.lat > wl ? 1 : -1;
        const target = side > 0 ? wl : -wr;
        this.x += track.nx[p2.i] * (target - p2.lat); this.z += track.nz[p2.i] * (target - p2.lat);
        const th = track.heading[p2.i];
        const rel = U.wrapAngle(this.heading - th);
        // impact: component of velocity into the wall
        const into = Math.abs(Math.sin(rel)) * av;
        this.v *= Math.max(0.35, 1 - into * 0.06);
        this.vLat = 0;
        // steer away from the wall: left wall (side>0) -> point slightly right (heading increases)
        this.heading = U.wrapAngle(th + side * 0.08);
        this.wallHit = Math.min(1, into * 0.15 + 0.2);
        p2.lat = target;
      }
      // ---- progress along the lap
      if (race && race.started) {
        let ds = p2.s - this._prevS; if (ds > track.length / 2) ds -= track.length; if (ds < -track.length / 2) ds += track.length;
        this.dist += ds;
      }
      this._prevS = p2.s;
      // ---- tyre wear
      const stress = Math.min(1.5, Math.abs(this.aLat) / 40 + Math.abs(this.aLong) / 60);
      this.wear += this.tyre.wear * 0.01 * (0.4 + stress) * dt;
      // ---- gear / rpm for hud + audio
      let g = 0; while (g < GEARS.length - 1 && av > GEARS[g]) g++;
      const lo = g === 0 ? 0 : GEARS[g - 1], hi = GEARS[g];
      this.gear = av < 0.5 && this.throttle === 0 ? 0 : g + 1;
      const frac = U.clamp((av - lo) / (hi - lo), 0, 1);
      const target = av < 0.5 ? 0.12 + this.throttle * 0.5 : 0.38 + 0.62 * frac;
      this.rpm += (target - this.rpm) * Math.min(1, dt * 18);
    }

    updateVisual(dt) {
      const g = this.group;
      g.position.set(this.x, 0, this.z);
      g.rotation.y = -this.heading;
      // body roll / pitch
      const roll = U.clamp(-this.aLat * 0.0022, -0.06, 0.06), pitch = U.clamp(-this.aLong * 0.0018, -0.05, 0.05);
      this.body.rotation.x += (roll - this.body.rotation.x) * Math.min(1, dt * 10);
      this.body.rotation.z += (pitch - this.body.rotation.z) * Math.min(1, dt * 10);
      // wheels
      this.wheelSpin -= (this.v / WHEEL_R) * dt;
      for (const w of this.wheels) w.rotation.z = this.wheelSpin;
      const sa = this.steer * 0.42 / (1 + Math.abs(this.v) / 18);
      for (const p of this.frontPivots) p.rotation.y = sa;
      // DRS flap
      const ft = this.drsOpen ? -0.95 : 0.12;
      this.flap.rotation.z += (ft - this.flap.rotation.z) * Math.min(1, dt * 12);
    }
  }
  EI.Car = Car;
  EI.CAR = { L, W, WB, VMAX, GEARS, GRIP, BRAKE, PM, CD };
})();
