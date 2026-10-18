// Equation I - bot drivers: speed profile, line following, racecraft and per-driver personalities
window.EI = window.EI || {};
(function () {
  const U = EI.U, L = U.lerp;
  // Seven bot levels. Every level fields the same drivers in the same order with the same personalities (from EI.SEASON); the
  // level only sets how close to the limit of the car the whole field runs:
  //   lapLoss = lap time the FASTEST car + driver gives away to the limit (ultra: 0 = on the limit of the car physics)
  //   brake   = share of the brake force used into corners (lower = brakes earlier and more gently)
  //   gapMul  = share of the real relative gaps kept (1 = the real qualifying gaps; < 1 = the same order, a slightly closer field)
  //   form    = race-to-race form, one standard deviation of lap time (seeded per race and driver)
  //   formMul = scales the lap-to-lap drift (consistency); noise = steering error; reaction = start reaction range (s)
  //   speed   = level index used for the mistake rate; brakeMargin stays 1 (pace lives in the profile, never on the straights)
  // The corner speed of each driver is solved from these (gripFor, in derive()) so the lap time hits the target whatever the braking style.
  // There is no speed cap anywhere: straights and corner exits are driven at full throttle with the car's full power at every level.
  const DIFF = {
    veryeasy: { lapLoss: 0.21,  brake: 0.8,  gapMul: 0.8,  form: 0.0016, formMul: 0.4,  speed: 0.93,  brakeMargin: 1, aggression: 0.6,  noise: 0.012,  reaction: [0.42, 0.85] },
    easy:     { lapLoss: 0.155, brake: 0.85, gapMul: 0.84, form: 0.0015, formMul: 0.37, speed: 0.945, brakeMargin: 1, aggression: 0.7,  noise: 0.009,  reaction: [0.34, 0.7] },
    average:  { lapLoss: 0.11,  brake: 0.89, gapMul: 0.88, form: 0.0014, formMul: 0.34, speed: 0.96,  brakeMargin: 1, aggression: 0.8,  noise: 0.007,  reaction: [0.27, 0.55] },
    above:    { lapLoss: 0.075, brake: 0.93, gapMul: 0.92, form: 0.0013, formMul: 0.31, speed: 0.97,  brakeMargin: 1, aggression: 0.87, noise: 0.005,  reaction: [0.22, 0.42] },
    hard:     { lapLoss: 0.045, brake: 0.96, gapMul: 0.95, form: 0.0012, formMul: 0.29, speed: 0.98,  brakeMargin: 1, aggression: 0.93, noise: 0.003,  reaction: [0.17, 0.32] },
    veryhard: { lapLoss: 0.02,  brake: 0.98, gapMul: 0.98, form: 0.0011, formMul: 0.27, speed: 0.99,  brakeMargin: 1, aggression: 0.97, noise: 0.0015, reaction: [0.13, 0.25] },
    ultra:    { lapLoss: 0,     brake: 1,    gapMul: 1,    form: 0.001,  formMul: 0.25, speed: 1.0,   brakeMargin: 1, aggression: 1.0,  noise: 0,      reaction: [0.1, 0.2], frontier: true },
    // legacy names
    rookie: null, pro: null, legend: null,
  };
  DIFF.rookie = DIFF.easy; DIFF.pro = DIFF.average; DIFF.legend = DIFF.veryhard;
  // corner-grip scale of the profile for the fastest car + driver at ultra, per circuit: the limit of the car. The racing-line
  // profile at grip 1 is conservative (the car's actual path through a corner is straighter than the line's curvature), so the
  // limit sits above 1: just below the scale at which a bot starts to leave the track limits (headless sim on the full-width
  // racing line: Silverstone runs wide from ~1.15, Yas from ~1.25; Monaco is steering-lock limited and clean beyond 1.3).
  // Re-measure (swarm/f1/personality/sweep.sh) when a circuit's geometry or the driving core changes.
  const C_LIMIT = { silverstone: 1.1, monaco: 1.25, abudhabi: 1.16 }, C_LIMIT_DEFAULT = 1.1;
  // lap time a late braker gains over an early one on top of the profile (trail-braking carry, later lift: update()), per unit of
  // the braking trait, measured in the headless sim. The corner grip is solved against it so braking style never changes the pace.
  const K_BRAKE = { silverstone: 0.001, monaco: 0.002, abudhabi: 0.001 }, K_BRAKE_DEFAULT = 0.0015;
  // the bots realise ~93% of the lap-time difference the profile predicts between two corner-grip scales (fit over 3 tracks x
  // 7 levels x 22 drivers, residual ~0.1%), so the gap is asked for 1/0.93 larger to come out right on the stopwatch
  const GAP_STRETCH = 1.075;

  // ---------------------------------------------------------------- personality
  // Every driver carries these twelve indices (0.01 .. 1.00), taken from the season data (EI.SEASON). lo / hi say what the ends mean.
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
  // style families (the tag on the results and the pause "Field" card). A real driver's family comes from the season data, or is
  // the one whose bias matches the driver's traits best. For drivers with no season profile the bias shapes a seeded trait roll.
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
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
  function gaussOf(rng) { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function rollTraits(rng, arch) {
    const t = {};
    for (const tr of TRAITS) t[tr.id] = q(0.5 + (arch.bias[tr.id] || 0) + gaussOf(rng) * 0.17);
    return t;
  }
  // the style family whose bias points most along the driver's traits measured from the centre c (the season field's mean:
  // every real driver is strong, what tags him is where he stands out); all-rounder when nothing stands out. 'Rookie' only for
  // real rookies.
  function nearestArchetype(t, c, rookie) {
    let best = ARCH.allrounder, bs = 0.06;
    for (const a of ARCHETYPES) {
      if (a.id === 'rookie' && rookie === false) continue;
      let s = 0, nb = 0; for (const k in a.bias) { s += a.bias[k] * (t[k] - (c ? c[k] : 0.5)); nb += a.bias[k] * a.bias[k]; }
      if (nb > 0 && s / Math.sqrt(nb) > bs) { bs = s / Math.sqrt(nb); best = a; }
    }
    return best;
  }

  // ---------------------------------------------------------------- season data (EI.SEASON) -> per-driver profile
  const pct = v => (v == null || isNaN(+v) ? 0 : +v / 100);                    // the season file gives gaps in % of a lap
  function trackOf(track) { return (track && track.data && track.data.id) || (track && track.name ? String(track.name).toLowerCase().replace(/[^a-z]/g, '') : ''); }
  function trackVal(o, tid) { if (o == null) return 0; if (typeof o === 'number') return o; return o[tid] != null ? +o[tid] : 0; }
  // find this car's driver and team in EI.SEASON (by 3-letter code, then number, then surname)
  function seasonEntry(car) {
    const S = EI.SEASON; if (!S || !S.drivers || !car || !car.driver) return null;
    const d = car.driver, nm = String(d.name || car.name || '').toLowerCase();
    const all = S.reserves ? S.drivers.concat(S.reserves) : S.drivers;
    let rec = null;
    if (d.code) rec = all.find(x => x.code === d.code);
    if (!rec && d.num != null) rec = all.find(x => x.number === d.num && (!x.last || nm.indexOf(String(x.last).toLowerCase()) >= 0));
    if (!rec && nm) rec = all.find(x => x.last && nm.indexOf(String(x.last).toLowerCase()) >= 0);
    if (!rec) return null;
    const team = (S.teams || []).find(t => t.id === rec.team) || null;
    return { rec, team };
  }
  // relative one-lap pace in fraction of a lap (0 = the fastest car + driver of the season; 0.01 = one percent slower):
  // EI.SEASON driver.q (car + driver gap to pole in %, current form) + the circuit's team and driver modifiers (%)
  function seasonGap(e, tid) {
    const rec = e.rec, team = e.team || {}, tr = (EI.SEASON.tracks && EI.SEASON.tracks[tid]) || {};
    let g = rec.q != null ? pct(rec.q) : pct(team.carQ) + pct(rec.dq);
    g += pct(tr.team && tr.team[rec.team]) + pct(tr.driver && tr.driver[rec.code]);
    return g;
  }
  // the season's fastest (smallest) gap at this track, so the best car + driver of the year runs on the limit
  const minGapCache = {};
  function seasonMinGap(tid) {
    if (minGapCache[tid] != null) return minGapCache[tid];
    const S = EI.SEASON; let m = Infinity;
    for (const rec of S.drivers) { const team = (S.teams || []).find(t => t.id === rec.team) || null; m = Math.min(m, seasonGap({ rec, team }, tid)); }
    return (minGapCache[tid] = isFinite(m) ? m : 0);
  }
  function seasonTraits(e) {
    const src = e.rec.traits; if (!src) return null;
    const t = {}; for (const tr of TRAITS) t[tr.id] = q(src[tr.id] != null ? +src[tr.id] : 0.5); return t;
  }
  let fieldMean = null;
  function seasonMean() {
    if (fieldMean) return fieldMean; const D = EI.SEASON.drivers.filter(x => x.traits); if (!D.length) return null;
    fieldMean = {}; for (const tr of TRAITS) fieldMean[tr.id] = D.reduce((s, x) => s + (x.traits[tr.id] != null ? +x.traits[tr.id] : 0.5), 0) / D.length;
    return fieldMean;
  }
  function seasonStyle(e) { const s = e.rec.archetype || e.rec.style; return s && ARCH[s] ? ARCH[s] : null; }

  // ---------------------------------------------------------------- speed profile
  // maximum speed along the racing line. dec = share of the brake limit used in the braking zones (lower = earlier, gentler);
  // grip = corner-grip scale (1 = the car's lateral limit); ceil = top of the profile. The forward pass is generous (ERS, tow) so
  // the profile never holds a car back on a corner exit: the car's own power and traction set the exit, at full throttle.
  const CEIL = () => EI.CAR.VMAX * 1.35;
  // highest speed at which the steering lock still reaches curvature k (car.js: dMax falls with speed; full assist) - f1-DRIVING
  const LOCKF = 0.88;
  function lockSpeed(k) {
    let lo = 0, hi = 40;
    for (let it = 0; it < 24; it++) { const v = (lo + hi) / 2, dMax = Math.max(0.42 / (1 + v / 18), 0.55 / (1 + Math.pow(v / 16, 3))); if (Math.tan(dMax) / EI.CAR.WB >= k * LOCKF) lo = v; else hi = v; }
    return lo;
  }
  function buildSpeedProfile(track, dec, grip, ceil, mode) {
    if (typeof raceLine === 'function') raceLine(track); // full-width minimum-curvature line (f1-DRIVING's half), once per track
    dec = dec || 0.88; grip = grip || 1; ceil = ceil || CEIL();
    const n = track.n, ds = track.ds;
    const vmax = new Float32Array(n);
    const G = EI.CAR.GRIP, B = EI.CAR.BRAKE, PM = EI.CAR.PM, CD = EI.CAR.CD;
    for (let i = 0; i < n; i++) {
      const k = Math.abs(track.lineK[i]) + 1e-6;
      let v = Math.sqrt(grip * G.cap / k);
      if (k > grip * G.a1) v = Math.min(v, Math.sqrt(grip * G.a0 / (k - grip * G.a1)));
      if (k > 0.03) v = Math.min(v, lockSpeed(k));   // hairpins: the steering lock, not the grip, sets the speed
      vmax[i] = Math.min(v, ceil);
    }
    // smooth a touch then enforce braking (backward) and acceleration (forward) limits
    const sm = track.smooth(vmax, 3);
    for (let i = 0; i < n; i++) vmax[i] = Math.min(vmax[i], sm[i] * 1.03);
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 2 * n - 1; j >= 0; j--) {
        const i = j % n, nx = (i + 1) % n;
        const de = Math.min(B.cap, B.b0 + B.b1 * vmax[nx] * vmax[nx]) * dec;
        vmax[i] = Math.min(vmax[i], Math.sqrt(vmax[nx] * vmax[nx] + 2 * de * ds));
      }
      for (let j = 0; j < 2 * n; j++) {
        const i = j % n, pv = (i + n - 1) % n;
        const v = vmax[pv];
        // mode 1: what the car does at full throttle without ERS (lap-time calibration); mode 2: the shared reference profile
        // (pit approach, cool-down lap); otherwise a generous envelope that never holds a car back
        const aCar = Math.min(14, PM / Math.max(v, 6)) - CD * v * v;
        const acc = mode === 1 ? Math.max(0.3, aCar) : mode === 2 ? Math.max(0.5, aCar) : Math.max(3, 1.3 * Math.min(14, PM / Math.max(v, 6)) + 5);
        vmax[i] = Math.min(vmax[i], Math.sqrt(v * v + 2 * acc * ds));
      }
    }
    return vmax;
  }
  // the shared reference profile (pit approach, cool-down lap): the original 0.88 braking profile with its VMAX + 6 ceiling
  const sharedProfile = track => buildSpeedProfile(track, 0.88, 1, EI.CAR.VMAX + 6, 2);
  // profiles are shared between bots with the same braking level and corner grip (quantised)
  function profileFor(track, dec, grip) {
    grip = grip || 1;
    const kd = Math.round(dec * 200), kg = Math.round(grip * 2000);
    const c = track.aiSpeedByDec || (track.aiSpeedByDec = {}), key = kd + ':' + kg;
    return c[key] || (c[key] = buildSpeedProfile(track, kd / 200, kg / 2000));
  }
  // lap time of a speed profile driven exactly (top speed capped at the car's VMAX)
  function profileLap(prof, ds) { let T = 0; const vm = EI.CAR.VMAX; for (let i = 0; i < prof.length; i++) T += ds / Math.max(1, Math.min(vm, prof[i])); return T; }
  // per track: lap time vs corner grip (at a reference braking level) and vs braking level (at full grip), built once per circuit
  const calCache = new Map();
  const CAL_G = [0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 1.05, 1.15, 1.25, 1.35], CAL_D = [0.68, 0.8, 0.92, 1.0], CAL_DREF = 0.92;
  function calibration(track) {
    const key = track.data || track; let c = calCache.get(key); if (c) return c;
    const tg = CAL_G.map(g => profileLap(buildSpeedProfile(track, CAL_DREF, g, EI.CAR.VMAX + 6, 1), track.ds));
    const td = CAL_D.map(d => profileLap(buildSpeedProfile(track, d, 1, EI.CAR.VMAX + 6, 1), track.ds));
    c = { tg, td, tdRef: interp(CAL_D, td, CAL_DREF) }; calCache.set(key, c); return c;
  }
  function interp(xs, ys, x) {
    let k = 0; while (k < xs.length - 2 && x > xs[k + 1]) k++;
    return ys[k] + (ys[k + 1] - ys[k]) * (x - xs[k]) / (xs[k + 1] - xs[k]);
  }
  // lap time (calibration units) at corner grip g and braking level d (separable approximation)
  function calLap(cal, g, d) { return interp(CAL_G, cal.tg, g) * interp(CAL_D, cal.td, d) / cal.tdRef; }
  // corner grip that makes the lap ratio (vs the limit car: grip C_LIMIT, braking decRef) equal to ratio at braking level d
  function gripFor(track, ratio, d, decRef) {
    const lim = C_LIMIT[trackOf(track)] || C_LIMIT_DEFAULT;
    const cal = calibration(track), want = calLap(cal, lim, decRef) * ratio;
    let lo = 0.4, hi = 1.4;
    for (let it = 0; it < 40; it++) { const m = (lo + hi) / 2; if (calLap(cal, m, d) > want) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  // braking level (profile deceleration share) from the braking trait and the level; decRef = the reference for lap ratios
  const decOf = (braking, d) => L(0.89, 0.97, braking) * d.brake;
  const DEC_REF = 0.93;

  class AIDriver {
    // opts.seed: race seed (per-race form); opts.slot: seat index. The driver's profile comes from EI.SEASON by car.driver.
    constructor(car, track, difficulty, rng, opts) {
      opts = opts || {};
      this.car = car; this.track = track; this.d = DIFF[difficulty] || DIFF.pro; const d = this.d;
      if (!track.aiSpeed) track.aiSpeed = sharedProfile(track);
      // ---- who is driving: the season profile (real pace and style) or, for unknown drivers, a seeded stand-in from team strength
      const tid = trackOf(track), e = seasonEntry(car);
      const name = (car.driver && (car.driver.code || car.driver.name)) || car.name || 'bot';
      const prng = U.rng(mixSeed(hashStr(String(name)), 0x51ed));              // per-driver stream: the same driver every race
      for (let k = 0; k < 4; k++) prng();
      // prefers running a little inside (-) or outside (+) of the racing line on the straights: a habit of the driver
      this.lineBias = U.clamp(gaussOf(prng) * 0.15, -0.3, 0.3);
      this.profile = e ? e.rec.code : null;
      if (e) {
        this.realGap = Math.max(0, seasonGap(e, tid) - seasonMinGap(tid));
        this.traits = seasonTraits(e) || rollTraits(prng, ARCH.allrounder);
        this.archetype = seasonStyle(e) || nearestArchetype(this.traits, seasonMean(), /rookie/i.test(e.rec.note || ''));
        const tr = EI.SEASON.tracks && EI.SEASON.tracks[tid];                 // circuits where a driver tends to err (Monaco walls)
        this.riskMul = (tr && tr.riskMul && tr.riskMul[e.rec.code]) || 1;
      } else {
        // a driver the season does not know: the real car under the paint (team.entry for a taken-over entry) + a stand-in's
        // deficit, or the team strength when there is no season data at all
        const S = EI.SEASON, tm = car.team || {}, st = S && S.teams && S.teams.find(x => x.id === (tm.entry || tm.id));
        const skill = tm.skill != null ? tm.skill : 0.95;
        this.realGap = st ? Math.max(0, pct(st.carQ) + 0.004 - seasonMinGap(tid)) + Math.abs(gaussOf(prng)) * 0.001
          : U.clamp((0.99 - skill) * 0.45, 0, 0.04) + Math.abs(gaussOf(prng)) * 0.002;
        this.archetype = ARCHETYPES[Math.floor(prng() * (ARCHETYPES.length - 1))]; if (opts.avoid && opts.avoid.indexOf(this.archetype.id) >= 0) this.archetype = ARCH.allrounder;
        this.traits = rollTraits(prng, this.archetype);
      }
      // ---- per-race form: a small seeded variation (race seed x driver) so races differ while the real hierarchy holds
      const frng = U.rng(mixSeed((opts.seed != null ? opts.seed : Math.floor(rng() * 1e9)) >>> 0, hashStr(String(name))));
      frng(); frng();
      this.form = gaussOf(frng) * d.form;
      this._react = frng();
      // lap ratio to the limit of the car: level loss x (1 + real gap, bunched a little on the lower levels, + today's form)
      this.lapRatio = (1 + d.lapLoss) * (1 + d.gapMul * this.realGap + this.form);
      this.expGap = this.lapRatio / (1 + d.lapLoss) - 1;                        // expected gap to a limit-pace car at this level
      this.speedFactor = 1;                                                   // pace lives in the profile (corner speed), never on straights
      this.stats = { passAttempts: 0, aborts: 0, dives: 0, defends: 0, mistakes: 0, pressureMistakes: 0, yields: 0, towT: 0, ersT: 0, ersLastT: 0, drsT: 0 };
      this.derive();
      this.lapForm = 0; this.lapFormT = 0;
      this.offset = 0; this.offsetTarget = 0; this.noiseT = 0; this.noise = 0; this.rng = rng;
      this.launched = false; this.stuckT = 0; this.reverseT = 0;
      this.tailCar = null; this.tailT = 0; this.passing = false; this.diveT = 0; this.drsZoneT = 0; this.nc = null; this.ncT = 0;
      car.persona = this;
    }

    // expected pace for the qualifying order (higher = faster): the real gap at this track plus the day's form
    paceIndex() { return 1 / this.lapRatio; }

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
      // braking: brake point (profile deceleration; the level brakes earlier), how early it starts to slow, trail-braking carry.
      // The corner grip is then solved so this driver's lap ratio holds: a late braker trades a little apex speed for it (V-style),
      // an early braker carries more mid-corner speed (U-style); neither is faster than the real pace says.
      P.decel = decOf(T.braking, d);
      P.lookMul = L(1.0, 0.75, T.braking);                                    // how far before the braking point it starts to slow
      P.carry = 1 + L(0.006, 0.022, T.braking);                               // trail-braking: speed carried towards the apex
      // (both the same on every level: the level's earlier braking is in d.brake, so the style costs the same everywhere)
      P.brakeGain = L(7, 5, T.braking);                                       // late brakers stamp on the pedal, early ones squeeze it
      const kb = K_BRAKE[trackOf(this.track)]; this.cornerScale = gripFor(this.track, (1 + d.lapLoss) * (1 + GAP_STRETCH * this.expGap) * (1 + (kb != null ? kb : K_BRAKE_DEFAULT) * (T.braking - 0.5)), P.decel, DEC_REF);
      this.prof = profileFor(this.track, P.decel, this.cornerScale);
      this.profDive = profileFor(this.track, Math.min(0.96, P.decel + L(0.0, 0.05, U.clamp((T.risk - 0.55) / 0.45, 0, 1))), this.cornerScale);
      // consistency and composure: lap-to-lap drift (narrower on the higher levels), steering noise, mistake rate, pressure
      P.formStep = L(0.045, 0.006, T.consistency) * d.formMul; P.formMax = L(0.024, 0.006, T.consistency) * d.formMul;
      P.noiseMul = L(1.5, 0.45, T.consistency);
      P.mistakeMul = L(1.45, 0.3, T.consistency) * L(0.85, 1.25, T.braking) * (this.riskMul || 1);
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
  EI.buildSpeedProfile = (track, dec) => buildSpeedProfile(track, dec || 0.88, 1, EI.CAR.VMAX + 6, 2);   // reference profile (track wear marks)
})();
