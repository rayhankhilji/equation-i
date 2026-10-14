// Equation I - bot drivers
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  const DIFF = { rookie: { speed: 0.84, brakeMargin: 1.12, aggression: 0.35, noise: 0.08 }, pro: { speed: 0.92, brakeMargin: 1.05, aggression: 0.6, noise: 0.04 }, legend: { speed: 0.975, brakeMargin: 1.0, aggression: 0.85, noise: 0.015 } };

  // maximum speed profile along the racing line for the car model (shared by all bots)
  function buildSpeedProfile(track) {
    const n = track.n, ds = track.ds;
    const vmax = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const k = Math.abs(track.lineK[i]) + 1e-6;
      const G = EI.CAR.GRIP;
      let v = Math.sqrt(G.cap / k);
      if (k > G.a1) v = Math.min(v, Math.sqrt(G.a0 / (k - G.a1)));
      vmax[i] = Math.min(v, EI.CAR.VMAX + 6);
    }
    // smooth a touch then enforce braking (backward) and acceleration (forward) limits
    const sm = track.smooth(vmax, 3);
    for (let i = 0; i < n; i++) vmax[i] = Math.min(vmax[i], sm[i] * 1.03);
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 2 * n - 1; j >= 0; j--) {
        const i = j % n, nx = (i + 1) % n;
        const B = EI.CAR.BRAKE; const dec = Math.min(B.cap, B.b0 + B.b1 * vmax[nx] * vmax[nx]) * 0.88;
        vmax[i] = Math.min(vmax[i], Math.sqrt(vmax[nx] * vmax[nx] + 2 * dec * ds));
      }
      for (let j = 0; j < 2 * n; j++) {
        const i = j % n, pv = (i + n - 1) % n;
        const v = vmax[pv];
        const acc = Math.max(0.5, Math.min(14, EI.CAR.PM / Math.max(v, 6)) - EI.CAR.CD * v * v);
        vmax[i] = Math.min(vmax[i], Math.sqrt(v * v + 2 * acc * ds));
      }
    }
    return vmax;
  }

  class AIDriver {
    constructor(car, track, difficulty, rng) {
      this.car = car; this.track = track; this.d = DIFF[difficulty] || DIFF.pro;
      if (!track.aiSpeed) track.aiSpeed = buildSpeedProfile(track);
      const teamBias = (car.team.skill - 0.95) * 0.6;
      this.speedFactor = U.clamp(this.d.speed + teamBias + (rng() - 0.5) * 0.02, 0.78, 0.99);
      this.aggression = U.clamp(this.d.aggression + (rng() - 0.5) * 0.3, 0.1, 1);
      this.reaction = 0.15 + rng() * 0.45 + (1 - this.d.speed) * 1.5;
      this.offset = 0; this.offsetTarget = 0; this.noiseT = 0; this.noise = 0; this.rng = rng;
      this.launched = false; this.stuckT = 0; this.reverseT = 0;
    }

    update(dt, race, cars) {
      const car = this.car, t = this.track, inp = car.input;
      if (!race.started) { inp.throttle = 0; inp.brake = 1; inp.steer = 0; return; }
      if (car.finished) { inp.throttle = 0.35; inp.brake = 0; inp.drs = false; inp.ers = false; this.steerToLine(10); return; }
      if (race.time < this.reaction) { inp.throttle = 0; inp.brake = 1; return; }
      // --- recovery when stuck against a wall or spun
      const av = Math.abs(car.v);
      const th = t.heading[car.trk.i];
      const rel = U.wrapAngle(car.heading - th);
      if (av < 2 && race.time > 4) this.stuckT += dt; else this.stuckT = 0;
      if (this.reverseT > 0) {
        this.reverseT -= dt; inp.throttle = 0; inp.brake = 1; inp.steer = rel > 0 ? -1 : 1; return;
      }
      if (this.stuckT > 1.5) { this.reverseT = 1.2; this.stuckT = 0; return; }
      // --- speed target from the profile, looking slightly ahead
      const i = car.trk.i, n = t.n;
      const look = Math.round((4 + av * 0.12) / t.ds);
      let target = Infinity;
      for (let j = 0; j <= look; j += 2) target = Math.min(target, t.aiSpeed[(i + j) % n]);
      target *= this.speedFactor / this.d.brakeMargin * (1 - Math.abs(this.offset) / t.halfWidth * 0.18);
      if (car.tyre.grip < 1) target *= car.tyre.grip; if (car.wear > 0) target *= (1 - 0.2 * Math.min(1, car.wear));
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
      // --- choose a lateral offset: overtake, avoid, or hold the line
      let wantOffset = 0;
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
      if (alongside !== 0) {
        // car on the left (dl > 0 => alongside positive): move right
        const room = t.halfWidth - 1.0;
        wantOffset = U.clamp(car.trk.lat - t.lineOff[i] - alongside * 1.8, -room - t.lineOff[i], room - t.lineOff[i]);
        target = Math.min(target, Math.max(av, 20));
      }
      // defend the inside line when a faster car is close behind on a straight
      if (!ahead && behindClose && this.aggression > 0.5 && Math.abs(t.lineK[i]) < 1 / 300) {
        const kAhead = t.smoothK ? 0 : 0;
        wantOffset = -U.sign(t.lineK[(i + 150) % n] || 1) * 2.5 - t.lineOff[i];
      }
      this.offsetTarget = wantOffset;
      this.offset += U.clamp(this.offsetTarget - this.offset, -3.5 * dt, 3.5 * dt);
      // --- random small errors
      this.noiseT -= dt; if (this.noiseT <= 0) { this.noiseT = 0.6 + this.rng() * 1.5; this.noise = (this.rng() - 0.5) * 2 * this.d.noise; }
      // --- steering: pursue a point on the (offset) racing line
      this.steerToLine(5 + av * 0.32);
      inp.steer = U.clamp(inp.steer + this.noise * 0.5, -1, 1);
      // --- throttle / brake
      const vErr = target - av;
      if (vErr > 0.8) { inp.throttle = U.clamp(vErr / 3, 0.35, 1); inp.brake = 0; }
      else if (vErr < -0.6) { inp.throttle = 0; inp.brake = U.clamp(-vErr / 6, 0.15, 1); }
      else { inp.throttle = 0.55; inp.brake = 0; }
      // launch control: ease the throttle for the first second
      if (race.time < this.reaction + 1.2) inp.throttle = Math.min(inp.throttle, 0.85);
      // heavy understeer if running wide: lift a little
      if (car.surface === 'grass' || car.surface === 'gravel') inp.throttle = Math.min(inp.throttle, 0.5);
      // --- DRS / ERS
      inp.drs = true;
      const straight = Math.abs(t.lineK[i]) < 1 / 400;
      inp.ers = straight && car.ers > 0.25 && ((ahead && aheadGap < 35) || behindClose || car.lap === race.laps) && av > 30;
      if (car.ers > 0.95 && straight && av > 40) inp.ers = true;
    }

    steerToLine(lookDist) {
      const car = this.car, t = this.track, n = t.n;
      const j = (car.trk.i + Math.round(lookDist / t.ds)) % n;
      const tx = t.lineX[j] + t.nx[j] * this.offset, tz = t.lineZ[j] + t.nz[j] * this.offset;
      const want = Math.atan2(tz - car.z, tx - car.x);
      const err = U.wrapAngle(want - car.heading);
      car.input.steer = U.clamp(-err * 2.2, -1, 1);
      if (car.v < 0) car.input.steer *= -1;
    }
  }
  EI.AIDriver = AIDriver;
  EI.AI_DIFF = DIFF;
  EI.buildSpeedProfile = buildSpeedProfile;
})();
