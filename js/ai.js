// Equation I - bot drivers: speed profile, line following, racecraft and per-race personalities
window.EI = window.EI || {};
(function () {
  const U = EI.U, L = U.lerp;
  // seven bot levels. speed = fraction of the physical limit the bot targets; brakeMargin > 1 brakes earlier;
  // noise = random steering error; aggression scales how hard the personality may attack; ultra drives at the limit.
  // The level sets pace and caps; the personality traits below shape the style within it (span narrows the pace
  // effect of traits at the frontier so every ultra bot stays at the limit of the car).
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

  // ---------------------------------------------------------------- personality
  // Every bot carries these twelve indices (0.01 .. 1.00), rolled per race from the race seed. lo / hi say what the ends mean.
  const TRAITS = [
    { id: 'aggression',  short: 'AGG', name: 'Aggression',     lo: 'waits for a clear run, needs a big gap', hi: 'commits early, goes for small gaps, tailgates' },
    { id: 'defending',   short: 'DEF', name: 'Defending',      lo: 'rarely covers, lets faster cars by', hi: 'reads attacks early and covers the inside hard (once per straight)' },
    { id: 'braking',     short: 'BRK', name: 'Braking',        lo: 'early braker: long, gentle stops', hi: 'late braker: short, hard stops, more lock-ups' },
    { id: 'consistency', short: 'CON', name: 'Consistency',    lo: 'lap times scatter, small errors', hi: 'metronomic laps, few errors' },
    { id: 'composure',   short: 'CMP', name: 'Composure',      lo: 'tightens up and errs with a car close behind or alongside', hi: 'unbothered by pressure' },
    { id: 'racecraft',   short: 'CRA', name: 'Racecraft',      lo: 'squeezes and lifts when side by side, picks the obvious side', hi: 'leaves room, keeps momentum alongside, passes on the inside of the next corner' },
    { id: 'risk',        short: 'RSK', name: 'Risk',           lo: 'tucks back in before slow corners', hi: 'dives down the inside into hairpins and chicanes' },
    { id: 'patience',    short: 'PAT', name: 'Patience',       lo: 'pulls out at once', hi: 'sits in the tow and waits for the right moment or DRS' },
    { id: 'tyres',       short: 'TYR', name: 'Tyre care',      lo: 'pushes from lap 1 and fades as the tyres wear', hi: 'saves tyres early, strong at the end' },
    { id: 'ers',         short: 'ERS', name: 'ERS strategy',   lo: 'spends the battery on every straight', hi: 'saves it for attack, defence and the last lap' },
    { id: 'starts',      short: 'STA', name: 'Starts',         lo: 'slow reactions, cautious launch', hi: 'sharp reactions, full-bore launch, bold first lap' },
    { id: 'tow',         short: 'TOW', name: 'Slipstream',     lo: 'stays in clean air, opens DRS late', hi: 'hunts the tow, pulls out late, opens DRS at once' },
  ];
  // archetypes bias the trait rolls; each driver still rolls every trait, so two chargers never race quite alike
  const ARCHETYPES = [
    { id: 'charger',    name: 'Charger',        bias: { aggression: 0.36, risk: 0.24, patience: -0.3, ers: -0.22, starts: 0.15, composure: -0.06, tow: 0.08 } },
    { id: 'defender',   name: 'Defender',       bias: { defending: 0.4, composure: 0.16, racecraft: 0.14, aggression: -0.1, ers: 0.14, risk: -0.08 } },
    { id: 'metronome',  name: 'Metronome',      bias: { consistency: 0.36, composure: 0.24, tyres: 0.14, risk: -0.24, aggression: -0.1, racecraft: 0.08 } },
    { id: 'rookie',     name: 'Rookie',         bias: { consistency: -0.3, composure: -0.3, racecraft: -0.26, patience: -0.2, starts: -0.12, aggression: 0.1, risk: 0.12 } },
    { id: 'whisperer',  name: 'Tyre whisperer', bias: { tyres: 0.4, patience: 0.24, ers: 0.2, braking: -0.16, consistency: 0.1, aggression: -0.08 } },
    { id: 'latebraker', name: 'Late braker',    bias: { braking: 0.42, risk: 0.22, aggression: 0.12, tyres: -0.16, composure: -0.04 } },
    { id: 'tactician',  name: 'Tactician',      bias: { tow: 0.36, patience: 0.3, ers: 0.3, racecraft: 0.14, defending: 0.08, aggression: -0.06 } },
    { id: 'allrounder', name: 'All-rounder',    bias: {} },
  ];
  const ARCH = {}; ARCHETYPES.forEach(a => { ARCH[a.id] = a; });
  const q = v => Math.round(U.clamp(v, 0.01, 1) * 100) / 100;
  // 32-bit mix so neighbouring seeds give unrelated streams
  function mixSeed(a, b) { let h = (a ^ 0x9e3779b9) >>> 0; h = Math.imul(h ^ (b * 0x85ebca6b + 0x7f4a7c15), 0xc2b2ae35) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2f) >>> 0; h ^= h >>> 13; return (h >>> 0) || 1; }
  function gaussOf(rng) { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  // pick an archetype (rookies are common in easy fields and rare at the top), avoiding the teammate's
  function pickArchetype(rng, d, avoid) {
    const skill = U.clamp((d.speed - 0.72) / 0.28, 0, 1);
    const w = ARCHETYPES.map(a => (a.id === 'rookie' ? L(2.4, 0.35, skill) : a.id === 'allrounder' ? 0.8 : 1) * (avoid && avoid.indexOf(a.id) >= 0 ? 0 : 1));
    let r = rng() * w.reduce((s, x) => s + x, 0);
    for (let k = 0; k < w.length; k++) { r -= w[k]; if (r <= 0 && w[k] > 0) return ARCHETYPES[k]; }
    return ARCHETYPES[ARCHETYPES.length - 1];
  }
  function rollTraits(rng, arch) {
    const t = {};
    for (const tr of TRAITS) t[tr.id] = q(0.5 + (arch.bias[tr.id] || 0) + gaussOf(rng) * 0.17);
    return t;
  }

  // maximum speed profile along the racing line for the car model. dec = fraction of the brake limit used in the braking
  // zones: a lower value brakes earlier and more gently, a higher one later and harder. 0.88 is the shared reference profile.
  function buildSpeedProfile(track, dec) {
    dec = dec || 0.88;
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
        const B = EI.CAR.BRAKE; const de = Math.min(B.cap, B.b0 + B.b1 * vmax[nx] * vmax[nx]) * dec;
        vmax[i] = Math.min(vmax[i], Math.sqrt(vmax[nx] * vmax[nx] + 2 * de * ds));
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
  // profiles are shared between bots with the same braking level (quantised to 0.01)
  function profileFor(track, dec) {
    if (!track.aiSpeed) track.aiSpeed = buildSpeedProfile(track, 0.88);
    const key = Math.round(dec * 100); if (key === 88) return track.aiSpeed;
    const c = track.aiSpeedByDec || (track.aiSpeedByDec = {});
    return c[key] || (c[key] = buildSpeedProfile(track, key / 100));
  }

  class AIDriver {
    // opts.seed: personality seed (reproducible per race); opts.avoid: archetype ids not to pick (the teammate's)
    constructor(car, track, difficulty, rng, opts) {
      opts = opts || {};
      this.car = car; this.track = track; this.d = DIFF[difficulty] || DIFF.pro;
      if (!track.aiSpeed) track.aiSpeed = buildSpeedProfile(track, 0.88);
      // ---- per-race form: pace from team strength and the day's form; the level caps it
      const gauss = () => gaussOf(rng);
      const teamBias = (car.team.skill - 0.95) * (this.d.frontier ? 0.15 : 0.6);
      const formSigma = this.d.frontier ? 0.004 : 0.018;                     // race-to-race form (one standard deviation of pace)
      this.form = gauss() * formSigma;
      this.speedFactor = U.clamp(this.d.speed + teamBias + this.form, 0.62, 1.0);
      this.lineBias = gauss() * 0.35;                                         // prefers running a little inside (-) or outside (+)
      // ---- personality: archetype + twelve traits, from their own seeded stream so they do not depend on anything else rolled
      const prng = opts.seed != null ? U.rng(mixSeed(opts.seed >>> 0, opts.slot || 0)) : rng;
      for (let k = 0; k < 4; k++) prng();
      this.archetype = pickArchetype(prng, this.d, opts.avoid);
      this.traits = rollTraits(prng, this.archetype);
      this._react = prng();
      this.stats = { passAttempts: 0, aborts: 0, dives: 0, defends: 0, mistakes: 0, pressureMistakes: 0, yields: 0, towT: 0, ersT: 0, ersLastT: 0, drsT: 0 };
      this.derive();
      this.lapForm = 0; this.lapFormT = 0;
      this.offset = 0; this.offsetTarget = 0; this.noiseT = 0; this.noise = 0; this.rng = rng;
      this.launched = false; this.stuckT = 0; this.reverseT = 0;
      this.tailCar = null; this.tailT = 0; this.passing = false; this.diveT = 0; this.drsZoneT = 0; this.nc = null; this.ncT = 0;
      car.persona = this;
    }

    // expected pace for the qualifying order: the day's form plus what late braking is worth
    paceIndex() { return this.speedFactor * (1 + (this.d.frontier ? 0.5 : 1) * 0.03 * (this.traits.braking - 0.5)); }

    // replace some traits (tests, replays) and recompute everything that depends on them
    setTraits(obj) { for (const k in obj) if (k in this.traits) this.traits[k] = q(+obj[k]); this.derive(); }
    setArchetype(id, seed) { const a = ARCH[id]; if (!a) return; this.archetype = a; this.traits = rollTraits(U.rng(mixSeed(seed || 1, this.car.id)), a); this.derive(); }

    // turn the traits into driving parameters
    derive() {
      const T = this.traits, d = this.d, span = d.frontier ? 0.5 : 1, P = this.par = {};
      P.agg = T.aggression * (0.5 + 0.5 * d.aggression);                      // the level caps how hard anyone attacks
      // aggression: closing speed needed to try, distance it pulls out at, lateral gap it accepts, how close it follows
      P.passClosing = L(3.2, 0.5, P.agg);
      P.passGap = L(14, 34, P.agg) * L(1.15, 0.6, T.tow);                     // the tow hunters pull out late
      P.sepNeed = L(3.3, 2.6, P.agg);
      P.followGap = L(9.5, 6.5, P.agg);
      // patience: how long it sits behind before trying without a clear speed advantage
      P.minTail = L(0, 2.2, T.patience); P.waitT = L(0.6, 7, T.patience);
      // risk: how curved the track may be while it starts or holds a pass; dive-bombs into slow corners
      P.passK = 1 / L(140, 55, T.risk);
      P.dive = T.risk > 0.55; P.abortSlow = T.risk < 0.3;
      // braking: brake-zone deceleration (brake point) and the share of mistakes that are lock-ups running wide
      // (at the frontier the range is narrower and centred later, so the average ultra bot is as fast as before)
      P.decel = d.frontier ? L(0.87, 0.94, T.braking) : L(0.76, 0.95, T.braking);
      P.lookMul = d.frontier ? L(1.25, 0.8, T.braking) : L(1.6, 0.75, T.braking); // how far before the braking point it starts to slow
      P.carry = 1 + (d.frontier ? L(0.006, 0.022, T.braking) : L(-0.01, 0.02, T.braking)); // trail-braking: speed carried towards the apex
      P.brakeGain = L(7, 5, T.braking);                                       // late brakers stamp on the pedal, early ones squeeze it
      this.prof = profileFor(this.track, P.decel);
      this.profDive = profileFor(this.track, Math.min(0.96, P.decel + L(0.0, 0.05, U.clamp((T.risk - 0.55) / 0.45, 0, 1))));
      // consistency and composure: pace drift, steering noise, mistake rate and how pressure multiplies it
      P.formStep = L(0.045, 0.006, T.consistency); P.formMax = L(0.024, 0.006, T.consistency);
      P.noiseMul = L(1.5, 0.45, T.consistency);
      P.mistakeMul = L(1.45, 0.3, T.consistency) * L(0.85, 1.25, T.braking);
      P.overshoot = L(0.35, 0.7, T.braking) * (d.frontier ? 0.6 : 1); P.overshootK = d.frontier ? 1.025 : 1.03;
      P.pressMul = L(2.6, 0.9, T.composure);
      P.pressureSlow = span * L(0.014, 0, T.composure);
      // racecraft: room given alongside, momentum kept alongside, avoidance window, choice of side
      P.sidePush = L(1.5, 2.25, T.racecraft); P.sideGas = L(-0.8, 0.8, T.racecraft); P.diagWin = L(7.5, 10.5, T.racecraft);
      P.insidePass = T.racecraft > 0.5;
      // defending: how likely it covers on a given straight, how far it moves, how far back it reads the threat
      P.defendChance = L(0.04, 1.0, T.defending); P.defendLat = L(1.2, 2.9, T.defending); P.threatRange = L(10, 32, T.defending);
      // tyres: pace in the first half, on the last lap, and how much worn tyres cost
      P.tyreEarly = 1 + span * L(0.004, -0.011, T.tyres); P.tyreLate = 1 + span * L(-0.004, 0.006, T.tyres); P.wearK = L(0.34, 0.08, T.tyres);
      // ERS: free deployment threshold, reserve kept for fights, last-lap dump; attack or defence focus
      P.ersFree = L(0.2, 0.98, T.ers); P.ersFight = L(0.3, 0.06, T.ers); P.ersLast = T.ers > 0.3; P.ersAttack = T.aggression >= T.defending || T.ers > 0.6; P.ersDefend = T.defending > T.aggression || T.ers > 0.6;
      P.ersK = T.ers < 0.4 && !d.frontier ? 1 / 250 : 1 / 400;                                 // the spenders fire it up earlier on corner exit
      // starts: reaction time inside the level's range, launch throttle, first-lap boldness
      const rr = d.reaction || [0.15, 0.6]; this.reaction = rr[0] + (rr[1] - rr[0]) * U.clamp((1 - T.starts) * 0.85 + (this._react || 0) * 0.15, 0, 1);
      P.launch = L(0.55, 1.0, T.starts); P.lap1Agg = (T.starts - 0.5) * 0.3;
      // slipstream / DRS
      P.towHunt = U.clamp((T.tow - 0.3) / 0.7, 0, 1); P.drsDelay = L(1.0, 0, T.tow);
    }

    // next slow point of the speed profile within ~220 m: its speed, distance and which side is the inside
    scanAhead() {
      const t = this.track, n = t.n, i = this.car.trk.i, prof = this.prof; let vmin = Infinity, at = 0;
      for (let j = 2; j < 110; j += 2) { const v = prof[(i + j) % n]; if (v < vmin) { vmin = v; at = j; } }
      let ks = 0; for (let j = 0; j < 150; j += 3) { const k = t.lineK[(i + j) % n]; if (Math.abs(k) > 1 / 150) { ks = Math.sign(k); break; } }
      this.nc = { vmin, dist: at * t.ds, inside: ks || 1 };
    }

    update(dt, race, cars) {
      const car = this.car, t = this.track, inp = car.input, T = this.traits, P = this.par, st = this.stats;
      if (!race.started) { inp.throttle = 0; inp.brake = 1; inp.steer = 0; return; }
      if (EI.Pit && EI.Pit.driveBot(this, dt, race, cars)) return;
      const av = Math.abs(car.v);
      if (car.finished) { this.coolDown(); return; }
      if (race.time < this.reaction) { inp.throttle = 0; inp.brake = 1; return; }
      // --- recovery when stuck against a wall or spun
      const th = t.heading[car.trk.i];
      const rel = U.wrapAngle(car.heading - th);
      if (av < 2 && race.time > 4) this.stuckT += dt; else this.stuckT = 0;
      inp.reverse = false;
      if (this.reverseT > 0) {
        this.reverseT -= dt; inp.throttle = 0; inp.brake = 1; inp.reverse = true; inp.steer = rel > 0 ? -1 : 1; return;
      }
      if (this.stuckT > 1.5) { this.reverseT = 1.2; this.stuckT = 0; return; }
      const i = car.trk.i, n = t.n, hw = t.halfWidth;
      this.ncT -= dt; if (this.ncT <= 0 || !this.nc) { this.ncT = 0.1; this.scanAhead(); }
      const nc = this.nc;
      // --- speed target from this driver's braking profile, looking slightly ahead
      this.diveT = Math.max(0, this.diveT - dt);
      const prof = this.diveT > 0 ? this.profDive : this.prof;
      const look = Math.round((4 + av * 0.12) * P.lookMul / t.ds);
      let target = Infinity;
      for (let j = 0; j <= look; j += 2) target = Math.min(target, prof[(i + j) % n]);
      if (target < prof[i] - 2 && Math.abs(t.lineK[i]) < 1 / 250) target *= P.carry; // braking on a straight: late brakers carry more speed in
      // slow drift of pace within a lap (tyre feel, concentration): a random walk bounded by consistency
      this.lapFormT -= dt; if (this.lapFormT <= 0) { this.lapFormT = 6 + this.rng() * 8; this.lapForm = U.clamp(this.lapForm + (this.rng() - 0.5) * P.formStep, -P.formMax, P.formMax); }
      target *= (this.speedFactor + this.lapForm) / this.d.brakeMargin * (1 - Math.abs(this.offset) / hw * 0.18);
      if (car.tyre.grip < 1) target *= car.tyre.grip;
      // tyre management: savers hold back in the first half and push at the end; pushers do the opposite and fade with wear
      if (race.laps >= 2) { if (car.lap <= Math.ceil(race.laps / 2) && car.lap < race.laps) target *= P.tyreEarly; else if (car.lap >= race.laps) target *= P.tyreLate; }
      if (car.wear > 0) target *= (1 - P.wearK * Math.min(1, car.wear));
      if (this.d.frontier) target *= 1.0 + 0.012 * Math.min(1, car.ers); // frontier bots exploit every bit of grip
      if (this.underPressure) target *= 1 - P.pressureSlow;                 // tightening up with a car on the gearbox
      // --- mistakes: either a lock-up into a heavy stop (runs wide) or a hesitant early lift. More likely for inconsistent
      // drivers, late brakers and, under pressure, for the less composed. Applied before the traffic logic so the follow-distance
      // cap below still stops them rear-ending the car ahead.
      this.mistakeT = Math.max(0, (this.mistakeT || 0) - dt);
      // a mistake can only start as the car enters a braking zone
      const braking = this.wasBraking ? target < av - 1 : target < av - 4;
      if (braking && !this.wasBraking) {
        const pressure = this.underPressure ? P.pressMul : 1;
        if (this.rng() < 0.012 * (1.1 - this.d.speed) * 10 * P.mistakeMul * pressure) {
          st.mistakes++; if (this.underPressure) st.pressureMistakes++;
          if (this.rng() < P.overshoot) { this.mistakeT = 1.6 + this.rng(); this.mistakeKind = 1; } else { this.mistakeT = 0.8 + 0.6 * this.rng(); this.mistakeKind = -1; }
        }
      }
      this.wasBraking = braking;
      if (this.mistakeT > 0) target *= this.mistakeKind > 0 ? P.overshootK : 0.9;
      // --- traffic: car directly ahead, a car to tow behind, cars alongside, threats behind
      let ahead = null, aheadGap = 1e9, alongside = 0, behindClose = false, threat = null, towCar = null, towGap = 1e9;
      for (const o of cars) {
        if (o === car) continue;
        let dsx = o.trk.s - car.trk.s; if (dsx > t.length / 2) dsx -= t.length; if (dsx < -t.length / 2) dsx += t.length;
        const dl = o.trk.lat - car.trk.lat;
        if (dsx > 0 && dsx < 45 && Math.abs(dl) < 3.2 && dsx < aheadGap) { ahead = o; aheadGap = dsx; }
        if (dsx > 6 && dsx < 50 && Math.abs(dl) < 7 && dsx < towGap) { towCar = o; towGap = dsx; }
        if (Math.abs(dsx) < 6.5 && Math.abs(dl) < 3.4) alongside += dl > 0 ? 1 : -1;
        if (dsx < 0 && dsx > -25 && Math.abs(dl) < 4) behindClose = true;
        if (dsx < 0 && dsx > -P.threatRange && Math.abs(dl) < 5 && (o.v > car.v + 0.3 || dsx > -12)) threat = o;
      }
      this.underPressure = behindClose || alongside !== 0;
      // --- contact reaction: a bump makes the bot lift and steer away from the other car for half a second
      if (car.hit > 0.3 && !this.reactT) { this.reactT = 0.5; let away = 0; for (const o of cars) { if (o === car) continue; const dx = o.x - car.x, dz = o.z - car.z; if (dx * dx + dz * dz < 36) { const dl = o.trk.lat - car.trk.lat; away -= Math.sign(dl || 1) * 1.5; } } this.reactOffset = U.clamp(away, -2, 2); }
      if (this.reactT) { this.reactT = Math.max(0, this.reactT - dt); if (this.reactT === 0) this.reactT = null; }
      // --- choose a lateral offset: overtake, tow, defend, avoid, or hold the line
      const kHere = Math.abs(t.lineK[i]), onStraight = kHere < 1 / 300, base = t.lineOff[i];
      const slowSoon = nc.vmin < 30 && nc.dist < 170 && nc.vmin < av - 8;
      let wantOffset = this.lineBias, passing = false;
      if (ahead) {
        if (ahead !== this.tailCar) { this.tailCar = ahead; this.tailT = 0; this.passing = false; } else this.tailT += dt;
        const closing = car.v - ahead.v;
        const agg = U.clamp(P.agg + (car.lap === 1 ? P.lap1Agg : 0), 0, 1);
        const passClosing = car.lap === 1 ? L(3.2, 0.5, agg) : P.passClosing;
        let want = kHere < P.passK && ((closing > passClosing && this.tailT > P.minTail) || this.tailT > P.waitT || car.drsOpen);
        if (this.passing && kHere < P.passK * 1.4) want = true;               // once committed, it sees the move through
        let dive = false;
        if (want && slowSoon && aheadGap > 4) {
          if (P.abortSlow) { want = false; if (this.passing) st.aborts++; }  // careful drivers tuck back in before a slow corner
          else if (P.dive && aheadGap < 26) dive = true;                       // risk-takers go for the inside and brake later
        }
        if (want && aheadGap < P.passGap) {
          const room = hw - 1.3;
          const roomy = ahead.trk.lat > base ? -1 : 1;
          const first = dive || (P.insidePass && nc.dist < 300) ? nc.inside : roomy;
          for (const sd of [first, -first]) {
            const lat = U.clamp(ahead.trk.lat + sd * 3.6, -room, room);
            if (Math.abs(lat - ahead.trk.lat) >= P.sepNeed) { wantOffset = lat - base; passing = true; break; }
            if (dive) break;
          }
          if (passing && dive && this.diveT <= 0) { this.diveT = 2.5; st.dives++; }
        }
        if (passing && !this.passing) st.passAttempts++;
        this.passing = passing;
        // do not run into the back of the car ahead: match its speed while there is lateral overlap
        const overlap = Math.abs(ahead.trk.lat - car.trk.lat) < 2.6;
        const fg = onStraight ? Math.max(6.2, P.followGap - 0.8 * T.tow) : P.followGap;
        if (overlap && aheadGap < fg + 9) {
          const follow = Math.max(ahead.v + (aheadGap - fg) * 1.1, 3);
          target = Math.min(target, Math.max(follow, ahead.v + (passing ? 1.5 : L(0.4, 1.5, P.agg))));
        }
        if (overlap && aheadGap < Math.min(7, fg)) target = Math.min(target, ahead.v - 1);
      } else { this.tailCar = null; this.tailT = 0; this.passing = false; }
      // slipstream hunters line up behind the car ahead on a straight to sit in its tow
      if (!passing && towCar && onStraight && P.towHunt > 0 && alongside === 0) { wantOffset = L(wantOffset, U.clamp(towCar.trk.lat, -hw + 1.3, hw - 1.3) - base, P.towHunt); st.towT += dt; }
      if (alongside !== 0) {
        // car on the left (dl > 0 => alongside positive): move right
        const room = hw - 1.0;
        wantOffset = U.clamp(car.trk.lat - base - alongside * P.sidePush, -room - base, room - base);
        target = Math.min(target, Math.max(av + P.sideGas, 20));
        // side by side into a slow corner: the cautious yield
        if (slowSoon && T.risk < 0.35) { target = Math.min(target, av - 1.5); if (!this.yielding) st.yields++; this.yielding = true; } else this.yielding = false;
      }
      // defend the inside when a faster car is close behind on a straight: one decision, one move per straight
      if (!onStraight) { this.defendDecided = false; this.defending = false; }
      if (!ahead && threat && onStraight && alongside === 0 && !this.defendDecided) {
        this.defendDecided = true;
        if (this.rng() < P.defendChance) { this.defending = true; this.defendLat = U.clamp(nc.inside * P.defendLat, -hw + 1.3, hw - 1.3); st.defends++; }
      }
      if (this.defending && onStraight && alongside === 0) wantOffset = this.defendLat - base;
      // a car diagonally ahead and close: give it room instead of driving into its rear corner
      for (const o of cars) { if (o === car) continue; let dsx = o.trk.s - car.trk.s; if (dsx > t.length / 2) dsx -= t.length; if (dsx < -t.length / 2) dsx += t.length; const dl = o.trk.lat - car.trk.lat; if (dsx > 2 && dsx < P.diagWin && Math.abs(dl) > 1.2 && Math.abs(dl) < 3.4) { wantOffset = U.clamp(car.trk.lat - base - Math.sign(dl) * 1.2, -hw + 1.2 - base, hw - 1.2 - base); target = Math.min(target, Math.max(o.v - 0.5, 15)); } }
      if (this.reactT) { wantOffset = car.trk.lat - base + this.reactOffset; target = Math.min(target, Math.max(av * 0.9, 10)); }
      this.offsetTarget = wantOffset;
      this.offset += U.clamp(this.offsetTarget - this.offset, -3.5 * dt, 3.5 * dt);
      // --- random small errors
      this.noiseT -= dt; if (this.noiseT <= 0) { this.noiseT = 0.6 + this.rng() * 1.5; this.noise = (this.rng() - 0.5) * 2 * this.d.noise * P.noiseMul; if (this.rng() < 0.03 * (1 - T.consistency)) this.noise *= 4; }
      // --- steering: pursue a point on the (offset) racing line
      this.steerToLine(5.5 + av * 0.36);
      inp.steer = U.clamp(inp.steer + this.noise * 0.5, -1, 1);
      // --- throttle / brake
      const vErr = target - av;
      if (vErr > 0.8) { inp.throttle = U.clamp(vErr / 3, 0.35, 1); inp.brake = 0; }
      else if (vErr < -0.6) { inp.throttle = 0; inp.brake = U.clamp(-vErr / P.brakeGain, 0.15, 1); }
      else { inp.throttle = 0.55; inp.brake = 0; }
      // launch: the first second off the line, throttle set by the start skill
      if (race.time < this.reaction + 1.6) inp.throttle = Math.min(inp.throttle, P.launch);
      // heavy understeer if running wide: lift a little
      if (car.surface === 'grass' || car.surface === 'gravel') inp.throttle = Math.min(inp.throttle, 0.5);
      // --- DRS: open once the zone is reached; the tow-savvy open it at once, others a beat later
      if (car.inDrsZone >= 0 && car.drsEligible) this.drsZoneT += dt; else this.drsZoneT = 0;
      inp.drs = this.drsZoneT >= P.drsDelay;
      // --- ERS: spenders deploy whenever there is charge; strategists keep it for attack, defence and the last lap
      const ersStraight = kHere < P.ersK && av > 30;
      const fight = (P.ersAttack && ahead && aheadGap < 40) || (P.ersDefend && behindClose);
      inp.ers = ersStraight && (car.ers > P.ersFree || (fight && car.ers > P.ersFight) || (P.ersLast && car.lap === race.laps && car.ers > 0.03));
      if (car.ers > 0.95 && ersStraight && av > 40 && (T.ers < 0.7 || car.lap > 1)) inp.ers = true;   // never waste a full battery
      if (car.ersActive) { st.ersT += dt; if (car.lap === race.laps) st.ersLastT += dt; } if (car.drsOpen) st.drsT += dt;
    }

    // after the flag: a gentle lap on the racing line at three quarters of the profile
    coolDown() {
      const car = this.car, t = this.track, inp = car.input, av = Math.abs(car.v);
      inp.drs = false; inp.ers = false; inp.reverse = false;
      let target = Infinity; const look = Math.round((10 + av * 0.2) / t.ds);
      for (let j = 0; j <= look; j += 2) target = Math.min(target, t.aiSpeed[(car.trk.i + j) % t.n]);
      target *= 0.72; const vErr = target - av;
      if (vErr > 0.5) { inp.throttle = 0.35; inp.brake = 0; } else if (vErr < -1) { inp.throttle = 0; inp.brake = U.clamp(-vErr / 6, 0.15, 1); } else { inp.throttle = 0.2; inp.brake = 0; }
      this.steerToLine(5.5 + av * 0.36);
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
  EI.AI_TRAITS = TRAITS;
  EI.AI_ARCHETYPES = ARCHETYPES;
  EI.buildSpeedProfile = buildSpeedProfile;
})();
