// Equation I - bot drivers
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  // seven bot levels. speed = fraction of the physical limit the bot targets; brakeMargin > 1 brakes earlier;
  // noise = random steering error; lookahead scales how far ahead the bot plans its line; ultra drives at the limit.
  const DIFF = {
    veryeasy: { speed: 0.72, brakeMargin: 1.2, aggression: 0.15, noise: 0.12, reaction: [0.5, 1.2] },
    easy:     { speed: 0.80, brakeMargin: 1.14, aggression: 0.3, noise: 0.08, reaction: [0.35, 0.9] },
    average:  { speed: 0.88, brakeMargin: 1.08, aggression: 0.5, noise: 0.05, reaction: [0.25, 0.6] },
    above:    { speed: 0.93, brakeMargin: 1.04, aggression: 0.65, noise: 0.03, reaction: [0.2, 0.45] },
    hard:     { speed: 0.965, brakeMargin: 1.015, aggression: 0.8, noise: 0.015, reaction: [0.15, 0.35] },
    veryhard: { speed: 0.985, brakeMargin: 1.0, aggression: 0.9, noise: 0.006, reaction: [0.12, 0.25] },
    ultra:    { speed: 1.0, brakeMargin: 0.99, aggression: 1.0, noise: 0.0, reaction: [0.1, 0.18], frontier: true },
    // legacy names
    rookie: null, pro: null, legend: null,
  };
  DIFF.rookie = DIFF.easy; DIFF.pro = DIFF.average; DIFF.legend = DIFF.veryhard;

  const BRAKE_USE = 0.94;  // share of the braking limit the profile plans with (a margin for traffic and bumps)
  // highest speed at which the car's steady-state grip (mechanical + aero) holds curvature k
  function cornerSpeed(k) {
    const C = EI.CAR, vTop = C.VMAX + 6;
    if (C.latLimit(vTop) >= k * vTop * vTop) return vTop;
    let lo = 1, hi = vTop; for (let it = 0; it < 28; it++) { const m = (lo + hi) / 2; if (C.latLimit(m) >= k * m * m) lo = m; else hi = m; }
    return lo;
  }
  // maximum speed profile along the racing line for the car model (shared by all bots)
  function buildSpeedProfile(track) {
    const n = track.n, ds = track.ds, C = EI.CAR;
    const vmax = new Float32Array(n);
    for (let i = 0; i < n; i++) vmax[i] = cornerSpeed(Math.abs(track.lineK[i]) + 1e-6);
    // smooth a touch then enforce braking (backward) and acceleration (forward) limits
    const sm = track.smooth(vmax, 3);
    for (let i = 0; i < n; i++) vmax[i] = Math.min(vmax[i], sm[i] * 1.03);
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 2 * n - 1; j >= 0; j--) {
        const i = j % n, nx = (i + 1) % n;
        const vn = vmax[nx], k = Math.abs(track.lineK[i]); const dec = C.brakeLimit(vn, Math.min(1, k * vn * vn / C.latLimit(vn))) * BRAKE_USE;
        vmax[i] = Math.min(vmax[i], Math.sqrt(vmax[nx] * vmax[nx] + 2 * dec * ds));
      }
      for (let j = 0; j < 2 * n; j++) {
        const i = j % n, pv = (i + n - 1) % n;
        const v = vmax[pv];
        const acc = Math.max(0.5, C.driveLimit(v, Math.min(1, Math.abs(track.lineK[pv]) * v * v / C.latLimit(v))));
        vmax[i] = Math.min(vmax[i], Math.sqrt(v * v + 2 * acc * ds));
      }
    }
    return vmax;
  }

  class AIDriver {
    constructor(car, track, difficulty, rng) {
      this.car = car; this.track = track; this.d = DIFF[difficulty] || DIFF.pro;
      if (!track.aiSpeed) track.aiSpeed = buildSpeedProfile(track);
      // ---- per-race personality: every bot is drawn fresh each race so the field never feels the same twice
      const gauss = () => { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
      const teamBias = (car.team.skill - 0.95) * (this.d.frontier ? 0.15 : 0.6);
      const formSigma = this.d.frontier ? 0.004 : 0.018;                     // race-to-race form (one standard deviation of pace)
      this.form = gauss() * formSigma;
      this.speedFactor = U.clamp(this.d.speed + teamBias + this.form, 0.62, 1.0);
      this.aggression = U.clamp(this.d.aggression + gauss() * 0.22, 0.05, 1);  // how eagerly they attack and defend
      this.consistency = U.clamp(0.75 + gauss() * 0.15 + (this.d.speed - 0.85), 0.3, 1); // lap-to-lap scatter and mistake rate
      this.braker = U.clamp(1 + gauss() * 0.04, 0.9, 1.1);                   // late (<1) vs early (>1) braker
      this.lineBias = gauss() * 0.35;                                         // prefers running a little inside (-) or outside (+)
      this.defender = rng() < 0.35 + this.aggression * 0.4;                  // moves to the inside under threat
      this.ersStyle = rng() < 0.5 ? 'attack' : 'defend';
      const rr = this.d.reaction || [0.15, 0.6]; this.reaction = rr[0] + rng() * (rr[1] - rr[0]);
      this.lapForm = 0; this.lapFormT = 0;
      this.offset = 0; this.offsetTarget = 0; this.noiseT = 0; this.noise = 0; this.rng = rng;
      this.launched = false; this.stuckT = 0; this.reverseT = 0;
    }

    update(dt, race, cars) {
      const car = this.car, t = this.track, inp = car.input;
      if (!race.started) { inp.throttle = 0; inp.brake = 1; inp.steer = 0; return; }
      if (EI.Pit && EI.Pit.driveBot(this, dt, race, cars)) return;
      if (car.finished) { // cool-down lap: well below the limit, braking for the corners like everywhere else
        const av0 = Math.abs(car.v), i0 = car.trk.i; let tc = 45; for (let j = 0; j <= Math.round((4 + av0 * 0.12) / this.track.ds); j += 2) tc = Math.min(tc, this.track.aiSpeed[(i0 + j) % this.track.n] * 0.7);
        this.pedals(tc, av0); inp.drs = false; inp.ers = false; this.steerToLine(5.5 + av0 * 0.36); return;
      }
      if (race.time < this.reaction) { inp.throttle = 0; inp.brake = 1; return; }
      // --- recovery when stuck against a wall or spun
      const av = Math.abs(car.v);
      const th = t.heading[car.trk.i];
      const rel = U.wrapAngle(car.heading - th);
      if (av < 2 && race.time > 4) this.stuckT += dt; else this.stuckT = 0;
      inp.reverse = false;
      if (this.reverseT > 0) {
        this.reverseT -= dt; inp.throttle = 0; inp.brake = 1; inp.reverse = true; inp.steer = rel > 0 ? -1 : 1; return;
      }
      if (this.stuckT > 1.5) { this.reverseT = 1.2; this.stuckT = 0; return; }
      // --- speed target from the profile, looking slightly ahead
      const i = car.trk.i, n = t.n;
      const look = Math.round((4 + av * 0.12) / t.ds);
      let target = Infinity;
      for (let j = 0; j <= look; j += 2) target = Math.min(target, t.aiSpeed[(i + j) % n]);
      // slow drift of pace within a lap (tyre feel, concentration): a random walk bounded by consistency
      this.lapFormT -= dt; if (this.lapFormT <= 0) { this.lapFormT = 6 + this.rng() * 8; this.lapForm = U.clamp(this.lapForm + (this.rng() - 0.5) * (1 - this.consistency) * 0.03, -0.02, 0.02); }
      target *= (this.speedFactor + this.lapForm) / (this.d.brakeMargin * this.braker) * (1 - Math.abs(this.offset) / t.halfWidth * 0.18);
      if (car.tyre.grip < 1) target *= car.tyre.grip; if (car.wear > 0) target *= (1 - 0.2 * Math.min(1, car.wear));
      if (this.d.frontier) target *= 1.0 + 0.012 * Math.min(1, car.ers); // frontier bots exploit every bit of grip
      // --- mistakes: late braking into a heavy stop (runs wide), more likely for weaker, less consistent drivers under pressure.
      // Applied before the traffic logic so the follow-distance cap below still stops them rear-ending the car ahead.
      this.mistakeT = Math.max(0, (this.mistakeT || 0) - dt);
      const braking = target < av - 12;
      if (braking && !this.wasBraking) { const pressure = this.underPressure ? 1.5 : 1; if (this.rng() < 0.012 * (1.1 - this.d.speed) * 10 * (1.6 - this.consistency) * pressure) this.mistakeT = 1.6 + this.rng(); }
      this.wasBraking = braking;
      if (this.mistakeT > 0) target *= 1.06;
      // --- traffic: find car directly ahead and cars alongside
      let ahead = null, aheadGap = 1e9, alongside = 0, behindClose = false;
      for (const o of cars) {
        if (o === car) continue;
        let dsx = o.trk.s - car.trk.s; if (dsx > t.length / 2) dsx -= t.length; if (dsx < -t.length / 2) dsx += t.length;
        const dl = o.trk.lat - car.trk.lat;
        if (dsx > 0 && dsx < 45 && Math.abs(dl) < 3.2 && dsx < aheadGap) { ahead = o; aheadGap = dsx; }
        if (Math.abs(dsx) < 6.5 && Math.abs(dl) < 3.4) alongside += dl > 0 ? 1 : -1;
        if (dsx < 0 && dsx > -25 && Math.abs(dl) < 4) behindClose = true;
      }
      // --- contact reaction: a bump makes the bot lift and steer away from the other car for half a second
      if (car.hit > 0.3 && !this.reactT) { this.reactT = 0.5; let away = 0; for (const o of cars) { if (o === car) continue; const dx = o.x - car.x, dz = o.z - car.z; if (dx * dx + dz * dz < 36) { const dl = o.trk.lat - car.trk.lat; away -= Math.sign(dl || 1) * 1.5; } } this.reactOffset = U.clamp(away, -2, 2); }
      if (this.reactT) { this.reactT = Math.max(0, this.reactT - dt); if (this.reactT === 0) this.reactT = null; }
      // --- choose a lateral offset: overtake, avoid, or hold the line
      let wantOffset = this.lineBias;
      if (ahead) {
        const closing = car.v - ahead.v;
        const wantPass = (closing > 1.5 || aheadGap < 12) && this.aggression > 0.15 && Math.abs(t.lineK[i]) < 1 / 90;
        if (wantPass && aheadGap < 30) {
          // go to the side with more room, away from the other car
          const room = t.halfWidth - 1.3;
          const side = ahead.trk.lat > t.lineOff[i] ? -1 : 1;
          wantOffset = U.clamp(ahead.trk.lat + side * 3.6, -room, room) - t.lineOff[i];
        }
        // do not run into the back of the car ahead: match its speed while there is lateral overlap
        const overlap = Math.abs(ahead.trk.lat - car.trk.lat) < 2.6;
        if (overlap && aheadGap < 16) {
          const follow = Math.max(ahead.v + (aheadGap - 7) * 1.1, 3);
          target = Math.min(target, wantOffset ? Math.max(follow, ahead.v + 1.5) : follow);
        }
        if (overlap && aheadGap < 7) target = Math.min(target, ahead.v - 1);
      }
      this.underPressure = behindClose;
      if (alongside !== 0) {
        // car on the left (dl > 0 => alongside positive): move right
        const room = t.halfWidth - 1.0;
        wantOffset = U.clamp(car.trk.lat - t.lineOff[i] - alongside * 1.8, -room - t.lineOff[i], room - t.lineOff[i]);
        target = Math.min(target, Math.max(av, 20));
      }
      // defend the inside line when a faster car is close behind on a straight
      const onStraight = Math.abs(t.lineK[i]) < 1 / 300;
      if (!onStraight) this.defendedThisStraight = false;
      if (!ahead && behindClose && this.defender && onStraight && alongside === 0 && !this.defendedThisStraight) { this.defendedThisStraight = true; this.defendOffset = -U.sign(t.lineK[(i + 150) % n] || 1) * 2.2 - t.lineOff[i]; }
      if (this.defendedThisStraight && onStraight && alongside === 0) wantOffset = this.defendOffset;
      // a car diagonally ahead and close: give it room instead of driving into its rear corner
      for (const o of cars) { if (o === car) continue; let dsx = o.trk.s - car.trk.s; if (dsx > t.length / 2) dsx -= t.length; if (dsx < -t.length / 2) dsx += t.length; const dl = o.trk.lat - car.trk.lat; if (dsx > 2 && dsx < 9 && Math.abs(dl) > 1.2 && Math.abs(dl) < 3.4) { wantOffset = U.clamp(car.trk.lat - t.lineOff[i] - Math.sign(dl) * 1.2, -t.halfWidth + 1.2 - t.lineOff[i], t.halfWidth - 1.2 - t.lineOff[i]); target = Math.min(target, Math.max(o.v - 0.5, 15)); } }
      if (this.reactT) { wantOffset = car.trk.lat - t.lineOff[i] + this.reactOffset; target = Math.min(target, Math.max(av * 0.9, 10)); }
      this.offsetTarget = wantOffset;
      this.offset += U.clamp(this.offsetTarget - this.offset, -3.5 * dt, 3.5 * dt);
      // --- random small errors
      this.noiseT -= dt; if (this.noiseT <= 0) { this.noiseT = 0.6 + this.rng() * 1.5; this.noise = (this.rng() - 0.5) * 2 * this.d.noise * (1.6 - this.consistency); if (this.rng() < 0.03 * (1 - this.consistency)) this.noise *= 4; }
      // --- steering: pursue a point on the (offset) racing line
      this.steerToLine(5.5 + av * 0.36);
      inp.steer = U.clamp(inp.steer + this.noise * 0.5, -1, 1);
      // --- throttle / brake
      this.pedals(target, av);
      // launch control: ease the throttle for the first second
      if (race.time < this.reaction + 1.2) inp.throttle = Math.min(inp.throttle, 0.85);
      // heavy understeer if running wide: lift a little
      if (car.surface === 'grass' || car.surface === 'gravel') inp.throttle = Math.min(inp.throttle, 0.5);
      // --- DRS / ERS
      inp.drs = true;
      const straight = Math.abs(t.lineK[i]) < 1 / 400;
      inp.ers = straight && car.ers > 0.25 && ((this.ersStyle === 'attack' && ahead && aheadGap < 35) || (this.ersStyle === 'defend' && behindClose) || car.lap === race.laps) && av > 30;
      if (car.ers > 0.95 && straight && av > 40) inp.ers = true;
    }

    // ask for an acceleration proportional to the speed error and turn it into pedals with the car's own numbers, so that at
    // the target speed mid-corner the tyres are not also asked to brake or drive (the friction circle would take it off the grip)
    pedals(target, av) {
      const inp = this.car.input, C = EI.CAR, vErr = target - av, aWant = U.clamp(vErr * (vErr < 0 ? 10 : 4), -60, 40), resist = C.CD * av * av + 0.6;
      if (aWant + resist > 0) { inp.throttle = U.clamp((aWant + resist) / (C.PM / Math.max(av, 5)), 0, 1); inp.brake = 0; }
      else { inp.throttle = 0; inp.brake = U.clamp(-(aWant + resist) / C.VEH.brakeSys, 0, 1); }
    }

    steerToLine(lookDist) {
      const car = this.car, t = this.track, n = t.n;
      const j = (car.trk.i + Math.round(lookDist / t.ds)) % n;
      const tx = t.lineX[j] + t.nx[j] * this.offset, tz = t.lineZ[j] + t.nz[j] * this.offset;
      const want = Math.atan2(tz - car.z, tx - car.x); const u = car.v;
      if (u < 4) { car.input.steer = U.clamp(-U.wrapAngle(want - car.heading) * 2.2, -1, 1); if (u < 0) car.input.steer *= -1; return; }
      // pure pursuit from the direction of travel gives the yaw rate the line needs; the steering angle for it is the
      // car's steady-state angle (kinematic angle plus the tyres' slip difference), with a little yaw-rate feedback
      const hv = car.heading - (car.beta || 0); const err = U.wrapAngle(want - hv);
      const ld = Math.max(2, Math.hypot(tx - car.x, tz - car.z)); const rDes = -2 * u * Math.sin(err) / ld;
      const delta = EI.CAR.steerFor(u, rDes) + 0.08 * (rDes - car.yaw);
      car.input.steer = U.clamp(delta / EI.CAR.steerMax(u), -1, 1);
    }
  }
  EI.AIDriver = AIDriver;
  EI.AI_DIFF = DIFF;
  EI.buildSpeedProfile = buildSpeedProfile;
})();
