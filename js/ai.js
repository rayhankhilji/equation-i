// Equation I - bot drivers: speed profile, line following, racecraft and per-driver personalities
window.EI = window.EI || {};
(function () {
  const U = EI.U, L = U.lerp;
  // Bot levels (the menu select). Every level fields the same drivers in the same order with the same driving styles and the
  // same real gaps (car gap per team per track + driver delta, from EI.RACEPACE / EI.SEASON, gap scale 1.0 everywhere); the level
  // only moves the whole field together. Internally each level is a skill value 0..100:
  //   Ultra (100)        = the limit of the game car (the fastest real car + driver on the limit of the car physics)
  //   Official F1 (80)   = the real 2026 lap times: the fastest car + driver laps the track's real pole, everyone else his real gap
  //   Very hard .. Very easy (72 .. 10) = the same field uniformly softer: slower corners, earlier braking, slower reactions
  // Straights and corner exits are driven at full throttle with the car's full power at every level (no speed cap anywhere).
  // Level fields: lapLoss = lap time the FASTEST car + driver gives away to the limit (per track); brake = share of the brake force
  // used into corners; form = race-to-race form (1 sd of lap time, seeded per race and driver); formMul = lap-to-lap drift;
  // noise = steering error; reaction = start reaction range (s); speed = index for the mistake rate; frontierW 0..1 = how far the
  // level is towards the frontier (narrower pressure / tyre effects); gapMul = 1 and brakeMargin = 1 always.
  const STOPS = [
    { v: 10, id: 'veryeasy', label: 'Very easy' }, { v: 25, id: 'easy', label: 'Easy' }, { v: 40, id: 'average', label: 'Average' },
    { v: 52, id: 'above', label: 'Above average' }, { v: 63, id: 'hard', label: 'Hard' }, { v: 72, id: 'veryhard', label: 'Very hard' },
    { v: 80, id: 'official', label: 'Official F1' }, { v: 100, id: 'ultra', label: 'Ultra' },
  ];
  const LEGACY = { rookie: 25, pro: 40, legend: 72, frontier: 100 }; STOPS.forEach(x => { LEGACY[x.id] = x.v; });
  const SKILL_DEFAULT = 40, SKILL_OFFICIAL = 80, LOSS_AT_ZERO = 0.25;
  function normSkill(x) {
    if (typeof x === 'number' && isFinite(x)) return U.clamp(x, 0, 100);
    if (typeof x === 'string') { if (LEGACY[x] != null) return LEGACY[x]; const n = parseFloat(x); if (isFinite(n)) return U.clamp(n, 0, 100); }
    return SKILL_DEFAULT;
  }
  // the parameters of a skill value (track-independent part); lapLoss(tid) is per circuit (officialLoss below)
  function skillParams(v) {
    const s = normSkill(v), u = U.clamp(s / SKILL_OFFICIAL, 0, 1), f = U.clamp((s - SKILL_OFFICIAL) / (100 - SKILL_OFFICIAL), 0, 1);
    return {
      skill: s, gapMul: 1, brakeMargin: 1,
      brake: L(0.78, 1, u),                                   // official F1 and above brake on the limit; below, earlier and gentler
      aggression: L(0.55, 1, u), noise: L(0.014, 0, u),
      reaction: [L(0.45, L(0.15, 0.1, f), u), L(0.9, L(0.26, 0.2, f), u)],
      form: L(0.0016, 0.001, u), formMul: L(0.42, 0.25, u), speed: L(0.92, 1, u),
      frontierW: U.clamp((s - 50) / 30, 0, 1), frontier: s >= SKILL_OFFICIAL,
      lapLoss: (tid) => lapLossAt(s, tid),
    };
  }
  function lapLossAt(s, tid) {
    const L80 = officialLoss(tid);
    if (s >= SKILL_OFFICIAL) return L80 * (100 - s) / (100 - SKILL_OFFICIAL);
    return (1 + L80) * (1 + LOSS_AT_ZERO * (SKILL_OFFICIAL - s) / SKILL_OFFICIAL) - 1;
  }
  // the level of a driver at a circuit (cached: every bot of a race shares it)
  const levelCache = {};
  function levelFor(difficulty, tid) {
    const s = normSkill(difficulty), key = s + ':' + tid; let d = levelCache[key]; if (d) return d;
    d = skillParams(s); d.lapLoss = lapLossAt(s, tid); return (levelCache[key] = d);
  }
  // level table (EI.AI_DIFF): every level name with its parameters (lapLoss is per circuit: EI.Skill.lapLoss(level, track))
  const DIFF = {}; for (const k in LEGACY) { DIFF[k] = skillParams(LEGACY[k]); }
  // corner-grip scale of the profile for the fastest car + driver at ultra, per circuit: the limit of the car. The racing-line
  // profile at grip 1 is conservative (the car's actual path through a corner is straighter than the line's curvature), so the
  // limit sits above 1: just below the scale at which a bot starts to leave the track limits (headless sim on the full-width
  // racing line: Silverstone runs wide from ~1.15, Yas from ~1.25; Monaco is steering-lock limited and clean beyond 1.3).
  // Re-measure (swarm/f1/personality/sweep.sh) when a circuit's geometry or the driving core changes.
  // Monza (monza-GEN, swarm/monza/gen/sweep.sh): solo clean to 1.2, wide from 1.25; at 1.16 race traffic still put bots wide at the
  // Lesmo 1 exit / Parabolica (3-lap 22-car sims, 4 seeds), at 1.12 not -> 1.12
  // Spa (SPA-GEN, swarm/spa/gen/sweep.sh): solo clean to 1.15, wide from 1.2; 3-lap 22-car races at 1.12 / 1.15 (2 seeds) both 0 bot wall hits -> 1.12
  // COTA (COTA-GEN, swarm/cota/gen/sweep.sh): solo clean to 1.15, wide from 1.2; ultra 22-car 3-lap races at 1.12: 0 bot wall hits -> 1.12.
  // LIMIT_LAP 87.88 (qsim ultra, mediums); TYRE_DELTA soft -0.48 % / hard +0.42 % (whole field); Official on softs 95.98-96.00 vs the 2026 estimate 96.033
  // Mexico (MEX-GEN, swarm/mexico/gen/sweep.sh + lapct.sh): solo clean to 1.25, ultra 22-car 3-lap races clean at 1.0 / 1.06 / 1.12 (0 bot wall hits). ALTITUDE (2,240 m,
  // air density ~0.78 of sea level): the real cars lose ~22 % aero load at equal wing and win part of it back with max-downforce wings, while
  // car.js (shared, frozen) has one sea-level grip model -> the limit car's corner grip is capped lower here: 1.0 = the usual 1.12 x ~0.89.
  // Straights need no constant: with Straight Mode + full ERS the game car already reaches 356 km/h at the end of the pit straight (real 2025
  // traps 355-363) and bots never pace on straights (speedFactor 1). LIMIT_LAP 70.49 (qsim ultra, mediums); TYRE_DELTA soft -0.51 % / hard +0.45 %;
  // GAP_STRETCH 1.175: the bots realise only ~86 % of the profile's lap ratio on this straight-heavy lap; Official on softs 78.46 vs the 2026 estimate 78.464
  const C_LIMIT = { silverstone: 1.1, monaco: 1.25, abudhabi: 1.16, monza: 1.12, spa: 1.12, cota: 1.12, mexico: 1.0 }, C_LIMIT_DEFAULT = 1.1;
  // lap time a late braker gains over an early one on top of the profile (trail-braking carry, later lift: update()), per unit of
  // the braking trait, measured in the headless sim. The corner grip is solved against it so braking style never changes the pace.
  // Monza: braking trait 0 -> 1 = -0.067 s on a 76.2 s solo lap (grip 1.16) -> 0.001
  const K_BRAKE = { silverstone: 0.001, monaco: 0.002, abudhabi: 0.001, monza: 0.001 }, K_BRAKE_DEFAULT = 0.0015;
  // the bots realise ~92-97% of the lap-time difference the profile predicts between two corner-grip scales (fit per circuit over
  // 7 skills x 22 drivers, residual ~0.1%), so the lap ratio is asked for that much larger to come out right on the stopwatch
  const GAP_STRETCH = { silverstone: 1.09, monaco: 1.09, abudhabi: 1.07, monza: 1.04, spa: 1.12, cota: 1.075, mexico: 1.175 }, GAP_STRETCH_DEFAULT = 1.075;   // spa: matrix.js ultra spread 5.81 % vs 5.77 % real, rho 0.999

  // lap time of the season's fastest car + driver at skill 100 (no form), headless sim on the circuit (qsim.js, solo flying laps):
  // the anchor that turns a real lap time into the game's scale. Re-measure with C_LIMIT.
  // (Silverstone / Monaco / Spa nudged by the Official-level fit against every driver's real quali lap, solo on softs, no form)
  const LIMIT_LAP = { silverstone: 80.8, monaco: 64.17, abudhabi: 79.26, monza: 76.65, spa: 94.28, cota: 87.88, mexico: 70.49 }, OFFICIAL_LOSS_DEFAULT = 0.08;
  // per-circuit slope of the realised driver gaps against the real quali gaps (same fit; 1 = no correction), applied at every level
  const GAP_SLOPE = { silverstone: 0.971, monaco: 1.04, monza: 1.064, spa: 0.943 };
  // real 2026 pole lap of a circuit (s): EI.RACEPACE (real lap data) > EI.SEASON.tracks > the season's real grids (pole time)
  const GRID_NAME = { silverstone: /british/i, monaco: /monaco/i, abudhabi: /abu dhabi/i, monza: /italian/i, spa: /belgian/i, cota: /united states/i, mexico: /mexic/i };
  const parseLap = t => { if (typeof t === 'number') return t; const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(String(t || '').trim()); return m ? (+(m[1] || 0)) * 60 + (+m[2]) : 0; };
  function realPole(tid) {
    const RP = EI.RACEPACE && EI.RACEPACE[tid]; if (RP) { if (RP.pole && RP.pole.s) return +RP.pole.s; if (RP.q) { const v = Object.values(RP.q).map(parseLap).filter(x => x > 0); if (v.length) return Math.min(...v); } }
    const S = EI.SEASON, tr = S && S.tracks && S.tracks[tid];
    if (tr) { if (tr.pole && tr.pole.s && (!tr.pole.year || tr.pole.year === (S.season || 2026))) return +tr.pole.s; if (tr.poleEst2026 && tr.poleEst2026.s) return +tr.poleEst2026.s; }
    const g = S && S.grids && GRID_NAME[tid] && S.grids.find(x => GRID_NAME[tid].test(x.name || '')); if (g && g.poleTime) return parseLap(g.poleTime);
    return 0;
  }
  // lap time the fastest car + driver gives away to the game car's limit at skill 80: real pole / limit lap - 1
  const officialCache = {};
  // compounds: LIMIT_LAP is measured on mediums; the tyre itself (car.js grip + update()'s sqrt(grip) target) makes a soft lap
  // faster and a hard lap slower by these fractions (headless sim, whole field at skill 100, every circuit). The profile is the same
  // on every compound, so the tyre effect is counted once - by the tyre.
  const TYRE_DELTA = {
    silverstone: { soft: -0.0057, hard: 0.0046 }, monaco: { soft: -0.0052, hard: 0.005 }, abudhabi: { soft: -0.0054, hard: 0.0042 },
    monza: { soft: -0.0041, hard: 0.0035 }, spa: { soft: -0.0042, hard: 0.0041 }, cota: { soft: -0.0048, hard: 0.0042 },
    mexico: { soft: -0.0051, hard: 0.0045 },
  }, TYRE_DELTA_DEFAULT = { soft: -0.005, hard: 0.0042 };
  const tyreDelta = (tid, key) => { const t = TYRE_DELTA[tid] || TYRE_DELTA_DEFAULT; return key === 'soft' || key === 'hard' ? t[key] : 0; };
  // Official F1 = the real 2026 qualifying pole ON SOFTS (real qualifying runs on softs): the lap loss is measured against the soft
  // limit lap. On the race compounds the same bots are as much slower as the tyre makes them (medium +0.4-0.6 %, hard +0.8-1.1 %).
  function officialLoss(tid) {
    if (officialCache[tid] != null) return officialCache[tid];
    const p = realPole(tid), lim = LIMIT_LAP[tid] * (1 + tyreDelta(tid, 'soft'));
    return (officialCache[tid] = p > 0 && lim > 0 ? Math.max(0, p / lim - 1) : OFFICIAL_LOSS_DEFAULT);
  }

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
  // ---- car performance and driver performance, separately (fractions of a lap; 0 = the fastest car / the faster team-mate)
  // the user's own teams (Lumi Racing, Intake Racing): their own car (gap % to the fastest car at the circuit, corner character,
  // circuit modifiers %); EI.SEASON.ownTeams.<id> overrides any field (the user's tweak point). Their driver - inherited from the
  // entry they take over - keeps his own driver delta and style.
  const OWN_TEAMS = {
    lumi:   { carQ: 0.6, highSpeed: 0.92, lowSpeed: 0.72, straight: 0.8,  traction: 0.75, track: { silverstone: -0.15, monaco: 0.15, abudhabi: 0, monza: 0.1 }, note: 'upper midfield, strong in fast corners' },
    intake: { carQ: 1.1, highSpeed: 0.7,  lowSpeed: 0.75, straight: 0.95, traction: 0.95, track: { silverstone: 0.1, monaco: 0, abudhabi: -0.1, monza: -0.2 }, note: 'midfield, strong traction and straight line' },
  };
  function ownTeam(id) {
    const o = OWN_TEAMS[id]; if (!o) return null; const S = EI.SEASON, x = S && S.ownTeams && S.ownTeams[id];
    return x ? Object.assign({}, o, x, { track: Object.assign({}, o.track, x.track || {}) }) : o;
  }
  const seasonTeam = id => (EI.SEASON && EI.SEASON.teams || []).find(t => t.id === id) || null;
  const seasonDrivers = () => { const S = EI.SEASON; return S && S.drivers ? (S.reserves ? S.drivers.concat(S.reserves) : S.drivers) : []; };
  // real lap data for a circuit (EI.RACEPACE.<tid>: q = best qualifying lap, r = median green-flag race lap, per driver code):
  // a driver's gap to the best of the field, and the team he drove for there (seat: stand-ins at that event)
  const rpMin = {};
  function rpGap(code, tid, kind) {
    const RP = EI.RACEPACE && EI.RACEPACE[tid], tab = RP && RP[kind], t = tab && parseLap(tab[code]); if (!(t > 0)) return null;
    const key = tid + kind; let m = rpMin[key];
    if (m == null) { m = kind === 'q' ? realPole(tid) : Math.min(...Object.values(tab).map(parseLap).filter(x => x > 0)); rpMin[key] = m; }
    return m > 0 ? Math.max(0, t / m - 1) : null;
  }
  const eventTeam = (rec, tid) => { const RP = EI.RACEPACE && EI.RACEPACE[tid]; return (RP && RP.seat && RP.seat[rec.code]) || rec.team; };
  // car gap of a real team at a circuit (kind 'q' one lap, 'r' race pace): its faster driver's real lap there, else the season
  // car gap + the circuit's team modifier
  const carCache = {};
  function carGap(teamId, tid, kind) {
    kind = kind || 'q'; const key = teamId + ':' + tid + ':' + kind; if (carCache[key] != null) return carCache[key];
    const S = EI.SEASON, tm = seasonTeam(teamId) || {}; let g = Infinity;
    for (const d of seasonDrivers()) if (eventTeam(d, tid) === teamId) { const r = rpGap(d.code, tid, kind); if (r != null) g = Math.min(g, r); }
    if (!isFinite(g)) { const tr = (S && S.tracks && S.tracks[tid]) || {}; g = pct(kind === 'r' && tm.carR != null ? tm.carR : tm.carQ) + pct(tr.team && tr.team[teamId]); }
    return (carCache[key] = g);
  }
  // the fastest real car at a circuit (the reference for the own teams' car gap)
  function fastestCar(tid, kind) { let m = Infinity; for (const t of (EI.SEASON && EI.SEASON.teams) || []) m = Math.min(m, carGap(t.id, tid, kind)); return isFinite(m) ? m : 0; }
  // driver delta: his real lap minus his car's at the circuit (capped at his season delta + 0.6 % so a one-off incident lap does
  // not define him), else (season q - car gap) + the circuit's driver modifier
  function driverDelta(rec, tid, kind) {
    kind = kind || 'q';
    const tm = seasonTeam(rec.team) || {}, tr = (EI.SEASON.tracks && EI.SEASON.tracks[tid]) || {};
    const model = Math.max(0, pct(rec.q != null ? rec.q - (tm.carQ || 0) : rec.dq)) + pct(tr.driver && tr.driver[rec.code]);
    const r = rpGap(rec.code, tid, kind); if (r == null) return model;
    return Math.min(Math.max(0, r - carGap(eventTeam(rec, tid), tid, kind)), model + 0.006);
  }
  // the car under this car's paint: an own team's car, or the real entry
  function ownCarGap(own, tid, kind) { return fastestCar(tid, kind) + pct(own.carQ) + pct(trackVal(own.track, tid)); }
  // one-lap gap (kind 'q') or driving pace (default: the mean of the one-lap and race-pace gaps, real data where it exists)
  // RACE_BLEND = share of the race-pace gap in the driving pace (0 = every driver drives his real qualifying gap: the Official level
  // then matches each driver's real best quali lap on softs; QA checks it driver by driver)
  const RACE_BLEND = 0;
  function seasonGap(e, tid, own, kind) {
    const one = k => (own ? ownCarGap(own, tid, k) : carGap(e.rec.team, tid, k)) + driverDelta(e.rec, tid, k);
    return kind === 'q' || !RACE_BLEND ? one('q') : (1 - RACE_BLEND) * one('q') + RACE_BLEND * one('r');
  }
  // the season's fastest car + driver at this circuit runs on the limit at skill 100 and laps the real pole at 80
  const minGapCache = {};
  function seasonMinGap(tid, kind) {
    const key = tid + ':' + (kind || ''); if (minGapCache[key] != null) return minGapCache[key];
    let m = Infinity; for (const rec of EI.SEASON.drivers) m = Math.min(m, seasonGap({ rec }, tid, null, kind));
    return (minGapCache[key] = isFinite(m) ? m : 0);
  }
  // corner character of a car: + = stronger in fast corners / weaker in slow ones (EI.SEASON teams[].car highSpeed - lowSpeed)
  const CHAR_K = 0.05;
  function carChar(teamId, own) { const c = own || (seasonTeam(teamId) || {}).car; return c && c.highSpeed != null && c.lowSpeed != null ? U.clamp((c.highSpeed - c.lowSpeed) * CHAR_K, -0.03, 0.03) : 0; }
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
  // chi = corner character: grip x (1 + chi) in fast corners (base speed > ~60 m/s), x (1 - chi) in slow ones (< ~28 m/s)
  function buildSpeedProfile(track, dec, grip, ceil, mode, chi) {
    if (typeof raceLine === 'function') raceLine(track); // full-width minimum-curvature line (f1-DRIVING's half), once per track
    dec = dec || 0.88; grip = grip || 1; ceil = ceil || CEIL();
    const n = track.n, ds = track.ds;
    const vmax = new Float32Array(n);
    const G = EI.CAR.GRIP, B = EI.CAR.BRAKE, PM = EI.CAR.PM, CD = EI.CAR.CD;
    const gCap = C_LIMIT[trackOf(track)] || C_LIMIT_DEFAULT;   // a car's strong corners never go beyond the car's limit
    const vAt = (k, g) => { let v = Math.sqrt(g * G.cap / k); if (k > g * G.a1) v = Math.min(v, Math.sqrt(g * G.a0 / (k - g * G.a1))); return v; };
    for (let i = 0; i < n; i++) {
      const k = Math.abs(track.lineK[i]) + 1e-6;
      let v = vAt(k, grip);
      if (chi) { const w = U.smoothstep(28, 60, vAt(k, 1)); v = vAt(k, Math.min(grip * (1 + chi * (2 * w - 1)), Math.max(grip, gCap))); }
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
  function profileFor(track, dec, grip, chi) {
    grip = grip || 1;
    const kd = Math.round(dec * 200), kg = Math.round(grip * 2000), kc = Math.round((chi || 0) * 1000);
    const c = track.aiSpeedByDec || (track.aiSpeedByDec = {}), key = kd + ':' + kg + ':' + kc;
    return c[key] || (c[key] = buildSpeedProfile(track, kd / 200, kg / 2000, 0, 0, kc / 1000));
  }
  // lap time of a speed profile driven exactly (top speed capped at the car's VMAX)
  function profileLap(prof, ds) { let T = 0; const vm = EI.CAR.VMAX; for (let i = 0; i < prof.length; i++) T += ds / Math.max(1, Math.min(vm, prof[i])); return T; }
  // per track: lap time vs corner grip (at a reference braking level) and vs braking level (at full grip), built once per circuit
  const calCache = new Map();
  const CAL_G = [0.12, 0.18, 0.25, 0.33, 0.42, 0.52, 0.63, 0.75, 0.87, 0.97, 1.07, 1.17, 1.27, 1.37], CAL_D = [0.68, 0.8, 0.92, 1.0], CAL_DREF = 0.92;
  function calibration(track) {
    const key = track.data || track; let c = calCache.get(key); if (c) return c;
    const tg = CAL_G.map(g => profileLap(buildSpeedProfile(track, CAL_DREF, g, EI.CAR.VMAX + 6, 1), track.ds));
    const td = CAL_D.map(d => profileLap(buildSpeedProfile(track, d, 1, EI.CAR.VMAX + 6, 1), track.ds));
    // lap-time effect of the corner character (per unit chi, at grip 1), so a car's character never changes its lap
    const t0 = profileLap(buildSpeedProfile(track, CAL_DREF, 1, EI.CAR.VMAX + 6, 1), track.ds), t1 = profileLap(buildSpeedProfile(track, CAL_DREF, 1, EI.CAR.VMAX + 6, 1, 0.02), track.ds);
    c = { tg, td, tdRef: interp(CAL_D, td, CAL_DREF), chiSens: (t1 / t0 - 1) / 0.02 }; calCache.set(key, c); return c;
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
    let lo = 0.12, hi = 1.37;
    for (let it = 0; it < 40; it++) { const m = (lo + hi) / 2; if (calLap(cal, m, d) > want) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  // braking level (profile deceleration share) from the braking trait and the level; decRef = the reference for lap ratios
  const decOf = (braking, d) => L(0.89, 0.97, braking) * d.brake;
  const DEC_REF = 0.93;

  // ---------------------------------------------------------------- public level API (menu select, HUD hints, race.js)
  // EI.Skill.LEVELS = the menu list, easiest first; difficulty = a level id ('official'), a legacy id, or a number 0..100
  const tidOf = t => (typeof t === 'string' ? t : trackOf(t));
  EI.Skill = {
    STOPS, LEVELS: STOPS, DEFAULT: SKILL_DEFAULT, OFFICIAL: SKILL_OFFICIAL,
    // where a player slots into the qualifying grid for this level (0 = front, 1 = back: the stronger the field, the further back)
    gridFraction(v) { return U.clamp(normSkill(v) / 100, 0, 1); },
    normalize: normSkill,
    label(v) { const s = normSkill(v), st = STOPS.find(x => x.v === Math.round(s)); return st ? st.label : 'Skill ' + Math.round(s); },
    idOf(v) { const s = normSkill(v), st = STOPS.find(x => x.v === Math.round(s)); return st ? st.id : null; },
    params: skillParams, fromSlider: skillParams,
    lapLoss: (v, t) => lapLossAt(normSkill(v), tidOf(t)),
    // seconds the fastest bot laps at this skill on this circuit (0 if unknown)
    // tyre: 'soft' (default: qualifying), 'medium' or 'hard'
    expectedPole(t, v, tyre) {
      const tid = tidOf(t), s = normSkill(v), lim = LIMIT_LAP[tid], ty = 1 + tyreDelta(tid, tyre || 'soft');
      if (lim > 0) return lim * ty * (1 + lapLossAt(s, tid));
      const p = realPole(tid); return p > 0 ? p * (1 + lapLossAt(s, tid)) / (1 + officialLoss(tid)) * ty / (1 + tyreDelta(tid, 'soft')) : 0;
    },
    tyreDelta: (t, key) => tyreDelta(tidOf(t), key),
    realPole: t => realPole(tidOf(t)),
    ownTeam,
  };

  class AIDriver {
    // opts.seed: race seed (per-race form); opts.slot: seat index. The driver's profile comes from EI.SEASON by car.driver.
    constructor(car, track, difficulty, rng, opts) {
      opts = opts || {};
      const tid = trackOf(track);
      this.car = car; this.track = track; this.skill = normSkill(difficulty); this.d = levelFor(this.skill, tid); const d = this.d;
      if (!track.aiSpeed) track.aiSpeed = sharedProfile(track);
      // ---- who is driving: the season profile (real pace and style) or, for unknown drivers, a seeded stand-in from team strength
      const e = seasonEntry(car), tm = car.team || {}, own = ownTeam(tm.id);
      const name = (car.driver && (car.driver.code || car.driver.name)) || car.name || 'bot';
      const prng = U.rng(mixSeed(hashStr(String(name)), 0x51ed));              // per-driver stream: the same driver every race
      for (let k = 0; k < 4; k++) prng();
      // prefers running a little inside (-) or outside (+) of the racing line on the straights: a habit of the driver
      this.lineBias = U.clamp(gaussOf(prng) * 0.15, -0.3, 0.3);
      this.profile = e ? e.rec.code : null;
      if (e) {
        this.realGap = Math.max(0, seasonGap(e, tid, own) - seasonMinGap(tid));
        this.qGap = Math.max(0, seasonGap(e, tid, own, 'q') - seasonMinGap(tid, 'q'));
        this.chi = carChar(e.rec.team, own);
        this.traits = seasonTraits(e) || rollTraits(prng, ARCH.allrounder);
        this.archetype = seasonStyle(e) || nearestArchetype(this.traits, seasonMean(), /rookie/i.test(e.rec.note || ''));
        const tr = EI.SEASON.tracks && EI.SEASON.tracks[tid];                 // circuits where a driver tends to err (Monaco walls)
        this.riskMul = (tr && tr.riskMul && tr.riskMul[e.rec.code]) || 1;
      } else {
        // a driver the season does not know: the real car under the paint (team.entry for a taken-over entry) + a stand-in's
        // deficit, or the team strength when there is no season data at all
        const S = EI.SEASON, st = S && S.teams && S.teams.find(x => x.id === (tm.entry || tm.id));
        const skill = tm.skill != null ? tm.skill : 0.95;
        this.realGap = (own || st) && S ? Math.max(0, (own ? ownCarGap(own, tid) : carGap(st.id, tid)) + 0.004 - seasonMinGap(tid)) + Math.abs(gaussOf(prng)) * 0.001
          : U.clamp((0.99 - skill) * 0.45, 0, 0.04) + Math.abs(gaussOf(prng)) * 0.002;
        this.qGap = this.realGap;
        this.chi = carChar(st && st.id, own);
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

    // expected pace for the qualifying order (higher = faster): the real one-lap gap at this track plus the day's form
    paceIndex() { return 1 / ((1 + this.d.lapLoss) * (1 + (this.qGap != null ? this.qGap : this.realGap) + this.form)); }

    // replace some traits (tests, replays) and recompute everything that depends on them
    setTraits(obj) { for (const k in obj) if (k in this.traits) this.traits[k] = q(+obj[k]); this.derive(); }
    setArchetype(id, seed) { const a = ARCH[id]; if (!a) return; this.archetype = a; this.traits = rollTraits(U.rng(mixSeed(seed || 1, this.car.id)), a); this.derive(); }

    // turn the traits into driving parameters
    derive() {
      const T = this.traits, d = this.d, fw = d.frontierW != null ? d.frontierW : (d.frontier ? 1 : 0), span = L(1, 0.5, fw), P = this.par = {};
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
      const kb = K_BRAKE[trackOf(this.track)]; const gs = GAP_STRETCH[trackOf(this.track)] || GAP_STRETCH_DEFAULT;
      const lr = (1 + d.lapLoss) * (1 + (GAP_SLOPE[trackOf(this.track)] || 1) * this.expGap);
      this.cornerScale = gripFor(this.track, (1 + gs * (lr - 1)) * (1 + (kb != null ? kb : K_BRAKE_DEFAULT) * (T.braking - 0.5)) / (1 + calibration(this.track).chiSens * (this.chi || 0)), P.decel, DEC_REF);
      this.prof = profileFor(this.track, P.decel, this.cornerScale, this.chi);
      this.profDive = profileFor(this.track, Math.min(0.96, P.decel + L(0.0, 0.05, U.clamp((T.risk - 0.55) / 0.45, 0, 1))), this.cornerScale, this.chi);
      // consistency and composure: lap-to-lap drift (narrower on the higher levels), steering noise, mistake rate, pressure
      P.formStep = L(0.045, 0.006, T.consistency) * d.formMul; P.formMax = L(0.024, 0.006, T.consistency) * d.formMul;
      P.noiseMul = L(1.5, 0.45, T.consistency);
      P.mistakeMul = L(1.45, 0.3, T.consistency) * L(0.85, 1.25, T.braking) * (this.riskMul || 1);
      P.overshoot = L(0.35, 0.7, T.braking) * L(1, 0.6, fw); P.overshootK = L(1.03, 1.025, fw);
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
      P.ersK = T.ers < 0.4 && fw < 1 ? 1 / 250 : 1 / 400;                                 // the spenders fire it up earlier on corner exit
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
      const nc = this.nc || (this.nc = { vmin: 0, dist: 0, inside: 1 }); nc.vmin = vmin; nc.dist = at * t.ds; nc.inside = ks || 1;
    }

    update(dt, race, cars) {
      const car = this.car, t = this.track, inp = car.input, T = this.traits, P = this.par, st = this.stats;
      if (!race.started) { inp.throttle = 0; inp.brake = 1; inp.steer = 0; return; }
      if (EI.Pit && EI.Pit.driveBot(this, dt, race, cars)) { this.cleanT = 0; return; }
      const av = Math.abs(car.v);
      if (car.finished) { this.coolDown(cars); return; }
      if (race.time < U.clamp(this.reaction, 0.15, 0.3)) { inp.throttle = 0; inp.brake = 1; return; }   // a real F1 reaction at every level (the starts trait picks where in 0.15-0.30 s)
      // --- recovery when stuck against a wall or spun
      const th = t.heading[car.trk.i];
      const rel = U.wrapAngle(car.heading - th);
      if (av < 2 && race.time > 4) this.stuckT += this.queued ? dt * 0.2 : dt; else this.stuckT = 0;   // waiting in a queue (a car just ahead) is not stuck: reversing there backs into the queue and gridlocks a chicane
      inp.reverse = false;
      if (this.reverseT > 0) {
        this.reverseT -= dt; this.cleanT = 0; inp.throttle = 0; inp.brake = 1; inp.reverse = true; inp.steer = rel > 0 ? -1 : 1; return;
      }
      if (this.stuckT > 1.5) { this.reverseT = 1.2; this.stuckT = 0; return; }
      const i = car.trk.i, n = t.n, hw = t.halfWidth;
      this.ncT -= dt; if (this.ncT <= 0) { this.ncT = 0.1; this.scanAhead(); }
      const nc = this.nc;
      if (this.t1 !== false && (race.time > 25 || car.lapsDone >= 1 || (nc.dist < 12 && av < nc.vmin + 4 && race.time > 3))) this.t1 = false;
      // --- speed target from this driver's braking profile, looking slightly ahead
      this.diveT = Math.max(0, this.diveT - dt);
      const prof = this.diveT > 0 ? this.profDive : this.prof;
      const look = Math.round((4 + av * 0.12) * P.lookMul / t.ds);
      let target = Infinity;
      for (let j = 0; j <= look; j += 2) target = Math.min(target, prof[(i + j) % n]);
      if (target < prof[i] - 2 && Math.abs(t.lineK[i]) < 1 / 250) target *= P.carry; // braking on a straight: late brakers carry more speed in
      // slow drift of pace within a lap (tyre feel, concentration): a random walk bounded by consistency
      this.lapFormT -= dt; if (this.lapFormT <= 0) { this.lapFormT = 6 + this.rng() * 8; this.lapForm = U.clamp(this.lapForm + (this.rng() - 0.5) * P.formStep, -P.formMax, P.formMax); }
      // off the line (passing, side by side): the path's own limit. A 160 m scan: refreshed every 1/30 s or when the offset moves
      this.olcT = (this.olcT || 0) - dt;
      if (this.olcT <= 0 || Math.abs(this.offset - this.olcO) > 0.25 || prof !== this.olcP) { this.olcT = 1 / 30; this.olcO = this.offset; this.olcP = prof; this.olcV = this.offLineCap(prof, av); }
      target = Math.min(target, this.olcV);
      target *= (this.speedFactor + this.lapForm) / this.d.brakeMargin;
      if (car.tyre.grip !== 1) target *= Math.sqrt(car.tyre.grip);
      // tyre management: savers hold back in the first half and push at the end; pushers do the opposite and fade with wear
      if (race.laps >= 2) { if (car.lap <= Math.ceil(race.laps / 2) && car.lap < race.laps) target *= P.tyreEarly; else if (car.lap >= race.laps) target *= P.tyreLate; }
      if (car.wear > 0) target *= (1 - P.wearK * Math.min(1, car.wear));
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
      this.urgent = false;
      let blue = car.blueFlag && !car.blueFlag.finished ? car.blueFlag : null, blueD = -1e9;
      let sideL = 0, sideR = 0;
      let ahead = null, aheadGap = 1e9, alongside = 0, alongV = 0, alongD = 1e9, alongAhead = false, behindClose = false, threat = null, towCar = null, towGap = 1e9;
      for (const o of cars) {
        if (o === car) continue;
        let dsx = o.trk.s - car.trk.s; if (dsx > t.length / 2) dsx -= t.length; if (dsx < -t.length / 2) dsx += t.length;
        const dl = o.trk.lat - car.trk.lat;
        if (dsx > 0 && dsx < 45 && Math.abs(dl) < 3.6 && dsx < aheadGap) { ahead = o; aheadGap = dsx; }
        if (dsx > 6 && dsx < 50 && Math.abs(dl) < 7 && dsx < towGap) { towCar = o; towGap = dsx; }
        if (Math.abs(dsx) < 6.5 && Math.abs(dl) < 3.4) { alongside += dl > 0 ? 1 : -1; if (Math.abs(dsx) < alongD) { alongD = Math.abs(dsx); alongV = o.v; alongAhead = dsx > 0.5; } }
        if (dsx < 0 && dsx > -25 && Math.abs(dl) < 4) behindClose = true;
        if (dsx > -12 && dsx < 30 && Math.abs(dl) > 1.6 && Math.abs(dl) < 6) { if (dl > 0) sideR++; else sideL++; }
        if (dsx < 0 && dsx > -P.threatRange && Math.abs(dl) < 5 && (o.v > car.v + 0.3 || dsx > -12)) threat = o;
        if (dsx < 0 && dsx > -60 && o.dist - car.dist > t.length * 0.5 && !o.finished && (!blue || dsx > blueD)) { blue = o; blueD = dsx; }   // a car a lap up
      }
      this.underPressure = behindClose || alongside !== 0;
      // --- lanes: never steer into a car that overlaps this one nose to tail; hold at least sep (car width + racecraft margin) to
      // its side. Both cars apply it, so two cars side by side keep their lanes through the corner instead of both following the
      // racing line into each other. A car squeezed against the track edge by a car ahead of it drops in behind.
      const myW = 1.45 * Math.abs(Math.sin(rel)), sep0 = 1.3 + P.sidePush + myW; let lo = -Infinity, hi = Infinity, sqV = Infinity;
      for (const o of cars) {
        if (o === car || (o.pit && o.pit.active)) continue;
        let dsx = o.trk.s - car.trk.s; if (dsx > t.length / 2) dsx -= t.length; if (dsx < -t.length / 2) dsx += t.length;
        const dl = o.trk.lat - car.trk.lat; if (dsx > 5.8 || dsx < -4.5 || Math.abs(dl) > 6) continue;   // overlapping: its rear beside our nose, or its nose beside our rear wheels
        const sep = sep0 + 1.45 * Math.abs(Math.sin(U.wrapAngle(o.heading - t.heading[o.trk.i])));
        if (dl > 0 || (dl === 0 && o.id > car.id)) hi = Math.min(hi, o.trk.lat - sep); else lo = Math.max(lo, o.trk.lat + sep);
        if (dsx > 1 && o.v < sqV) sqV = o.v;
      }
      if (lo > -Infinity || hi < Infinity) {
        const edge = hw - 0.6;
        if ((lo > edge || hi < -edge || lo > hi) && sqV < Infinity) target = Math.min(target, Math.max(sqV - 2, 10));
        lo = Math.min(Math.max(lo, -edge), edge); hi = Math.max(Math.min(hi, edge), -edge); if (lo > hi) lo = hi = (lo + hi) / 2;
      }
      this.latLo = lo; this.latHi = hi;
      // --- contact reaction: a bump makes the bot lift and steer away from the other car for half a second
      if (car.hit > 0.3 && !this.reactT) { this.reactT = 0.5; let away = 0; for (const o of cars) { if (o === car) continue; const dx = o.x - car.x, dz = o.z - car.z; if (dx * dx + dz * dz < 36) { const dl = o.trk.lat - car.trk.lat; away -= Math.sign(dl || 1) * 1.5; } } this.reactOffset = U.clamp(away, -2, 2); }
      if (this.reactT) { this.reactT = Math.max(0, this.reactT - dt); if (this.reactT === 0) this.reactT = null; }
      // --- choose a lateral offset: overtake, tow, defend, avoid, or hold the line
      const kHere = Math.abs(t.lineK[i]), onStraight = kHere < 1 / 300, base = t.lineOff[i];
      const slowSoon = nc.vmin < 30 && nc.dist < 170 && nc.vmin < av - 8;
      let wantOffset = onStraight ? this.lineBias : 0, passing = false;
      if (ahead) {
        if (ahead !== this.tailCar) { this.tailCar = ahead; this.tailT = 0; this.passing = false; } else this.tailT += dt;
        const closing = car.v - ahead.v;
        const agg = U.clamp(P.agg + (car.lap === 1 ? P.lap1Agg : 0), 0, 1);
        const passClosing = car.lap === 1 ? L(3.2, 0.5, agg) : P.passClosing;
        let want = kHere < P.passK && ((closing > passClosing && this.tailT > P.minTail) || this.tailT > P.waitT || car.drsOpen);
        if (this.passing && kHere < P.passK * 1.4) want = true;               // once committed, it sees the move through
        // the lap-1 pack: queued behind a car that holds it up, take a free lane beside it (the whole field runs 2-3 wide into
        // the first corner and brakes there, instead of a single file that crawls while the outside of the road stays empty)
        const pack = car.lapsDone < 1 && race.time < 30 && aheadGap < P.followGap + 10 + av * 0.1 && ahead.v < av + 3;
        const brakeZone = slowSoon && nc.dist < (av * av - nc.vmin * nc.vmin) / 50 + 30;   // no new lane into a braking zone: the pack files through
        if (pack && kHere < P.passK && !brakeZone) want = true;
        if (ahead.dist - car.dist > t.length * 0.5) want = false;            // a car that has just lapped this one: no fight to unlap it
        let dive = false;
        if (want && slowSoon && aheadGap > 4) {
          const late = aheadGap < 9 && closing > 1 && car.lapsDone >= 1;     // right on the gearbox with a run: out-brake it into the corner
          if (P.abortSlow && !late) { want = false; if (this.passing) st.aborts++; }  // careful drivers tuck back in before a slow corner
          // risk-takers (or anyone with the run) go for the inside and brake later - only from where the run can still get it alongside
          // before the turn-in, and never into the first corner (the grid arrives 2-3 wide: a late-braking dive there piles up T1)
          else if ((P.dive && this.t1 === false && aheadGap < Math.min(26, 10 + 3 * Math.max(0, closing))) || (late && aheadGap < 26)) dive = true;
        }
        // attacking on a straight: first close right up in the tow, then pull out with the speed it gives (pulling out 20-30 m
        // back threw the tow away and the pass never got closer); pull out once close, closing fast, with DRS, or near the braking zone
        const attack = want && onStraight && car.lapsDone >= 1 && !(nc.dist < Math.max(120, (av * av - nc.vmin * nc.vmin) / 80 + av * 0.8) && nc.vmin < av - 8);   // tow run ends a second before the braking point (Monza: 200 m from 360 km/h)   // not in the lap-1 pack
        const fgA = 4.5 + av * 0.04;
        if (want && aheadGap < P.passGap && (this.passing || dive || pack || (car.drsOpen && aheadGap < fgA + 6) || (aheadGap < fgA + 1 && closing > 0.5) || (nc.dist < 160 && closing > 2 && aheadGap < fgA + 4))) {   // stay in the tow until the run is built, then pull out
          const room = pack ? hw - 0.9 : hw - 1.3;
          const roomy = pack ? (sideL === sideR ? (ahead.trk.lat > 0 ? -1 : 1) : (sideL < sideR ? -1 : 1)) : ahead.trk.lat > base ? -1 : 1;
          const first = !pack && (dive || (P.insidePass && nc.dist < 300)) ? nc.inside : roomy;
          for (let q = 0, sd = first; q < 2; q++, sd = -first) {
            const lat = U.clamp(ahead.trk.lat + sd * 3.6, -room, room);
            if (Math.abs(lat - ahead.trk.lat) >= P.sepNeed) { wantOffset = lat - base; passing = true; break; }
            if (dive) break;
          }
          if (passing && dive && this.diveT <= 0) { this.diveT = 2.5; st.dives++; }
        }
        this.aheadDl = Math.abs(ahead.trk.lat - car.trk.lat);
        if (passing && !this.passing) st.passAttempts++;
        this.passing = passing;
        // do not run into the back of the car ahead: match its speed while there is lateral overlap
        const overlap = Math.abs(ahead.trk.lat - car.trk.lat) < 2.7 + myW + 1.45 * Math.abs(Math.sin(U.wrapAngle(ahead.heading - t.heading[ahead.trk.i])));   // 2.3 m contact width + yawed corners
        const held = this.tailT > 2 && car.lapsDone >= 1 && this.prof[i] > ahead.v * 1.03 + 1;
        const fg = attack ? fgA : pack ? 7 + av * 0.04 : held ? Math.max(6.5, P.followGap - 2.5) + av * 0.05 : (onStraight ? Math.max(6.2, P.followGap - 0.8 * T.tow) : P.followGap) + av * 0.06;   // + a time headway: 5 m more at 300 km/h; the lap-1 pack runs nose to tail
        // vA: the car ahead's speed a moment from now if it keeps braking as hard as it is now; the kinematic cap is the most
        // this car can carry and still match vA before the gap closes to 3.5 m (braking at 25 m/s2, well inside the brakes)
        const start = car.lapsDone < 1, t1 = start && this.t1 !== false;   // t1: from the grid to the first corner
        // + its acceleration: off the line the car ahead is gone 0.5 s later, so do not queue behind it; but a car ahead braking hard for a
        // corner (beyond -15 m/s2, not just lifting off the line) is read 0.3 s ahead on lap 1 too: the short lap-1 read rear-ended the
        // first-corner queues (SPA-GEN, 5 tracks x 2 levels x 2 seeds: race contacts -6 %, lap-1 -10 %, bot wall hits 0 -> 0)
        const vA = Math.max(0, ahead.v + ahead.aLong * (ahead.aLong < 0 ? (start && ahead.aLong > -15 ? 0.1 : 0.3) : 0.5));
        // attacking in the tow on a straight: only the closing speed it can still kill (10 m/s2 more than the car ahead) limits
        // it, so the tow builds the run that the late pull-out turns into a pass; otherwise follow at the gap
        if (attack && overlap) target = Math.min(target, ahead.v + Math.sqrt(2 * 10 * Math.max(0, aheadGap - 4.5 - av * 0.03)));
        else if (overlap && !start) target = Math.min(target, Math.sqrt(vA * vA + 2 * 25 * Math.max(0, aheadGap - 3.5 - av * 0.05)));
        else if (overlap) {
          // same car, same brakes: the follower may carry what it can still kill braking at bF (a margin under the car's brakes)
          // before the gap closes, against the car ahead braking at its own rate (at least bF). The old cap (25 m/s2 against the
          // leader's speed 0.3 s ahead) made each car in a queue brake earlier than the one in front: the queue into T1 stood still.
          const B = EI.CAR.BRAKE, bF = 0.72 * Math.min(B.cap, B.b0 + B.b1 * av * av) * car.tyre.grip, bL = Math.max(bF, -ahead.aLong);
          target = Math.min(target, Math.sqrt(Math.max(0, 2 * bF * (aheadGap - 6 - av * (pack ? 0.04 : 0.08)) + ahead.v * ahead.v * bF / bL)));
        }
        // from the grid into the first corner a column brakes on the kinematic cap above alone while it is more than ~2 lengths back: the
        // follow controller on top (reading a braking car 0.3 s ahead) made each car of a grid column brake ~8 m/s earlier than the one in
        // front - a braking wave down the grid into Ste Devote that let a late-braking player pass 7-8 cars
        // (not into a hairpin, nc.vmin < 20 m/s: that is single file anyway and the tighter column only queued longer - La Source / COTA T1)
        if (overlap && !attack && aheadGap < fg + 9 && !(t1 && nc.vmin > 20 && ahead.aLong < -3 && aheadGap > 11)) {
          const follow = Math.max(vA + (aheadGap - fg) * 1.1, 3);
          target = Math.min(target, Math.max(follow, vA + (passing ? 1.5 : L(0.4, 1.5, P.agg))));
        }
        if (overlap && aheadGap < Math.min(7, fg)) target = Math.min(target, vA - 1);
        if (overlap && aheadGap < fg && target < av - 0.6) this.urgent = true;   // closing on the car ahead: brake like it, not gently
      } else { this.tailCar = null; this.tailT = 0; this.passing = false; this.aheadDl = 0; }
      this.queued = !!ahead && aheadGap < 12;
      // slipstream hunters line up behind the car ahead on a straight to sit in its tow
      if (!passing && towCar && onStraight && P.towHunt > 0 && alongside === 0) { wantOffset = L(wantOffset, U.clamp(towCar.trk.lat, -hw + 1.3, hw - 1.3) - base, P.towHunt); st.towT += dt; }
      if (alongside !== 0) {
        // in a corner the car that is behind gives way (racecraft: how much momentum it keeps); the car ahead has the corner.
        // Flat out side by side on a straight.
        if (!onStraight && alongAhead) target = Math.min(target, Math.max(alongV + P.sideGas, 20));
        // side by side into a slow corner: the cautious yield
        if (slowSoon && T.risk < 0.35 && alongAhead) { target = Math.min(target, alongV - 1.5); if (!this.yielding) st.yields++; this.yielding = true; } else this.yielding = false;
      }
      // defend the inside when a faster car is close behind on a straight: one decision, one move per straight
      if (!onStraight) { this.defendDecided = false; this.defending = false; }
      if (!ahead && threat && onStraight && alongside === 0 && !this.defendDecided && !(nc.vmin < av - 8 && nc.dist < (av * av - nc.vmin * nc.vmin) / 70 + 30)) {   // one move, and never under braking
        this.defendDecided = true;
        if (this.rng() < P.defendChance) { this.defending = true; this.defendLat = U.clamp(nc.inside * P.defendLat, -hw + 1.3, hw - 1.3); st.defends++; }
      }
      if (this.defending && onStraight && alongside === 0) wantOffset = this.defendLat - base;
      // blue flag: a car a lap up close behind. No defending; on the straight move off its side of the line and lift a little
      if (blue) {
        let db = blue.trk.s - car.trk.s; if (db > t.length / 2) db -= t.length; if (db < -t.length / 2) db += t.length;
        if (db < 0 && db > -60) {
          this.defending = false; st.blues = (st.blues || 0) + dt;
          if (db > -6.5) target = Math.min(target, Math.max(blue.v - 1, 12));   // alongside: let it through, never fight it into the corner
          if (onStraight) { wantOffset = U.clamp(car.trk.lat - base + (blue.trk.lat > car.trk.lat ? -2.5 : 2.5), -hw + 1.3 - base, hw - 1.3 - base); if (db > -30) target = Math.min(target, Math.max(blue.v - 3, 20)); }
        }
      }
      // a car diagonally ahead and close: give it room instead of driving into its rear corner
      for (const o of cars) { if (o === car) continue; let dsx = o.trk.s - car.trk.s; if (dsx > t.length / 2) dsx -= t.length; if (dsx < -t.length / 2) dsx += t.length; const dl = o.trk.lat - car.trk.lat; if (dsx > 2 && dsx < P.diagWin && Math.abs(dl) > 1.2 && Math.abs(dl) < 3.4) { wantOffset = U.clamp(car.trk.lat - base - Math.sign(dl) * 1.2, -hw + 1.2 - base, hw - 1.2 - base); if (Math.abs(dl) < 2.5) target = Math.min(target, Math.max(o.v - 0.5, 15)); } }
      // bumper check in world space (track s / lat distort in hairpins: the inside of a 10 m hairpin has half the arc length):
      // a car in front of this one's nose within 12 m and in its path caps the speed to what can still be killed in the gap
      let pathClear = true;
      { const fx = Math.cos(car.heading), fz = Math.sin(car.heading), kp = Math.abs(this.kWant || 0) < 1 / 30 ? this.kWant || 0 : 0;   // (hairpins: the straight-heading check, as before)
        for (const o of cars) {
          if (o === car || (o.pit && o.pit.active)) continue; const dx = o.x - car.x, dz = o.z - car.z; if (dx * dx + dz * dz > 144) continue;
          // a car clearly in the next lane (track lateral > 2.6 m): side measured from the arc this car steers along (kWant), not its straight
          // heading - in a bend that car sits straight ahead of the outside car's nose, and the outside lane braked for it (lap-1 Village /
          // Loop pile-ups at Silverstone); a diagonal car closer than that keeps the straight-heading check (chicanes)
          const fwd = dx * fx + dz * fz, sideA = Math.abs(o.trk.lat - car.trk.lat) > 2.6 ? kp * Math.max(0, fwd) * Math.max(0, fwd) / 2 : 0, side = dz * fx - dx * fz - sideA, rh = U.wrapAngle(o.heading - car.heading);
          if (fwd <= 0 || Math.abs(side) > 2.5 + 1.45 * Math.abs(Math.sin(rh))) continue;
          if (av < 4 && o.dist < car.dist - 0.5) continue;   // crawling in a jam: a car behind us on the lap that sits across our nose (chicane, hairpin) waits for us, not the other way round - no gridlock
          if (fwd < 8.5 && Math.abs(side) < 2.4) pathClear = false;
          const vo = Math.max(0, o.v * Math.cos(rh)); target = Math.min(target, vo + Math.sqrt(2 * 8 * Math.max(0, fwd - 6.3)));
          if (fwd < 7.5 && av > vo) this.urgent = true;
        } }
      // jam release: crawling behind a car that is in the next lane (a queue in a hairpin / chicane) with nothing in this car's own path:
      // creep on instead of waiting for it (every car of a pile-up waited for a car beside it: 4-6 cars stood > 2 s at the Village)
      if (av < 4 && pathClear && this.queued && this.aheadDl > 2.2 && race.time > 3 && !this.reactT) target = Math.max(target, Math.min(6, prof[i]));
      // lap 1: change lanes only into a gap. Merging two grid columns into one file at 8 m spacing made every car brake to
      // open the gap again (a braking wave down the grid 2-4 s after the start that let a player from the back pass half the field);
      // nor cut in front of a car close behind in that lane
      this.holdLat = null;
      if (car.lapsDone < 1 && (onStraight || race.time < 12) && Math.abs(wantOffset + base - car.trk.lat) > 1.2) {
        const tl = wantOffset + base, room = P.followGap + 5 + av * 0.1;
        for (const o of cars) { if (o === car) continue; let d = o.trk.s - car.trk.s; if (d > t.length / 2) d -= t.length; if (d < -t.length / 2) d += t.length;
          if (d > -room * 0.8 && d < room && Math.abs(o.trk.lat - tl) < 2.6 && Math.abs(o.trk.lat - car.trk.lat) > 1.5) { wantOffset = car.trk.lat - base; this.holdLat = car.trk.lat; break; } }
      }
      if (this.reactT) wantOffset = car.trk.lat - base + this.reactOffset;   // after a bump: steer away and lift (below), no stamp on the brakes
      this.offsetTarget = wantOffset;
      this.offset += U.clamp(this.offsetTarget - this.offset, -3.5 * dt, 3.5 * dt);
      // --- random small errors
      this.noiseT -= dt; if (this.noiseT <= 0) { this.noiseT = 0.6 + this.rng() * 1.5; this.noise = (this.rng() - 0.5) * 2 * this.d.noise * P.noiseMul; if (this.rng() < 0.03 * (1 - T.consistency)) this.noise *= 4; }
      // --- steering: pursue a point on the (offset) racing line
      // fairness: in clean air the bot steers through the player's hands (filter + rate limit, hands() below) with the longer
      // look-ahead that steering lag needs; in traffic (a car within ~35 m, alongside, or just after a bump) it keeps the precise
      // controller so it can hold a lane next to another car. On the player car (autopilot; car.js already filters) the same look rule.
      const clean = !((ahead && aheadGap < 35) || (towCar && towGap < 35) || alongside !== 0 || behindClose || this.reactT);
      this.cleanT = clean ? (this.cleanT || 0) + dt : 0;
      const filt = !car.isPlayer && this.cleanT > 1;
      this.steerToLine(5.5 + av * 0.36 + (this.cleanT > 1 ? Math.max(0, av - 25) * 0.15 : 0));
      inp.steer = U.clamp(inp.steer + this.noise * 0.5, -1, 1);
      if (filt) inp.steer = this.hands(inp.steer, av, dt); else this.hs2 = inp.steer;
      // --- throttle / brake
      const vErr = target - av;
      // out of a corner (the target still rising at the end of the look window) the profile already is the full-throttle curve:
      // squeeze to full power instead of creeping up on it with part throttle
      const rising = vErr > 0.3 && this.prof[(i + look) % n] > this.prof[i] + 0.3;
      if (rising) { inp.throttle = U.clamp(0.5 + vErr / 2, 0.5, 1); inp.brake = 0; }
      else if (vErr > 0.8) { inp.throttle = U.clamp(vErr / 3, 0.35, 1); inp.brake = 0; }
      else if (vErr < -0.6) { inp.throttle = 0; inp.brake = U.clamp(-vErr / (this.urgent ? 2 : P.brakeGain), 0.15, 1); }
      else { inp.throttle = 0.55; inp.brake = 0; }
      // launch: full throttle off the line at every level (traction control handles the wheelspin)
      // heavy understeer if running wide: lift a little
      if (car.surface === 'grass' || car.surface === 'gravel') inp.throttle = Math.min(inp.throttle, 0.5);
      if (this.reactT) inp.throttle = Math.min(inp.throttle, 0.3);
      // --- DRS: open once the zone is reached; the tow-savvy open it at once, others a beat later
      if (car.inDrsZone >= 0 && car.drsEligible) this.drsZoneT += dt; else this.drsZoneT = 0;
      inp.drs = this.drsZoneT >= P.drsDelay;
      // --- ERS: spenders deploy whenever there is charge; strategists keep it for attack, defence and the last lap
      const ersStraight = kHere < P.ersK && av > 30;
      const fight = (P.ersAttack && ahead && aheadGap < 40) || (P.ersDefend && behindClose);
      inp.ers = ersStraight && (car.ers > P.ersFree || (fight && car.ers > P.ersFight) || (P.ersLast && car.lap === race.laps && car.ers > 0.03) || (car.otEnergy > 0.01 && ahead && aheadGap < 60));   // Overtake energy: spend it on the car ahead
      if (car.ers > 0.95 && ersStraight && av > 40 && (T.ers < 0.7 || car.lap > 1)) inp.ers = true;   // never waste a full battery
      if (car.ersActive) { st.ersT += dt; if (car.lap === race.laps) st.ersLastT += dt; } if (car.drsOpen) st.drsT += dt;
    }

    // the player's steering hands (car.js: 9/s filter and a speed-sensitive rate limit; bots get 30/s and a 4x rate there)
    hands(cmd, av, dt) {
      const s2 = this.hs2 || 0, returning = Math.abs(cmd) < Math.abs(s2) || Math.sign(cmd) !== Math.sign(s2);
      const rate = (returning ? 2.0 : 1.0) * (1.6 + 14 / (1 + av / 12)), want = s2 + (cmd - s2) * (1 - Math.exp(-dt * 9));
      this.hs2 = s2 + U.clamp(want - s2, -rate * dt, rate * dt);
      return this.hs2;
    }

    // speed limit of the path this car is actually on: the racing line shifted sideways by this.offset has curvature
    // k / (1 - k * offset) (k > 0 bends towards +lat). Where that is tighter than the line, the profile speed scales with
    // sqrt(k / kOff); the cap also brakes for such a point up to 160 m ahead. Replaces a flat "up to 18% slower at the edge".
    offLineCap(prof, av) {
      const o = this.offset; if (Math.abs(o) < 0.6) return Infinity;
      const t = this.track, n = t.n, i = this.car.trk.i, step = Math.max(1, Math.round(4 / t.ds)), dec = 0.85 * EI.CAR.BRAKE.b0;
      let cap = Infinity;
      for (let j = 0, d = 0; d < 160; j += step, d += step * t.ds) {
        const q = (i + j) % n, k = t.lineK[q], den = 1 - k * o; if (k * o <= 0 && Math.abs(k) < 1 / 400) continue;
        const r = den > 0.2 ? 1 / den : 5; if (r <= 1) continue;          // on the outside of this bend: no tighter than the line
        const v = prof[q] / Math.sqrt(r); cap = Math.min(cap, Math.sqrt(v * v + 2 * dec * d));
        if (cap < av - 40) break;
      }
      return cap;
    }

    // after the flag: a gentle lap on the racing line at three quarters of the profile
    coolDown(cars) {
      const car = this.car, t = this.track, inp = car.input, av = Math.abs(car.v);
      inp.drs = false; inp.ers = false; inp.reverse = false; this.latLo = -Infinity; this.latHi = Infinity;
      let target = Infinity; const look = Math.round((10 + av * 0.2) / t.ds);
      for (let j = 0; j <= look; j += 2) target = Math.min(target, t.aiSpeed[(car.trk.i + j) % t.n]);
      target *= 0.72;
      // keep a gap to the car ahead in the same lane: the whole field cools down on one line, and without this the cars stacked up into the
      // first corner after the flag (COTA ultra: ~1100 contacts on the cool-down lap, Turn 1 is 360 m past the line; Monza ~30-70). COTA-GEN
      if (cars) { const TL = t.length; let gap = 1e9, vo = 0; for (const o of cars) { if (o === car) continue; let d = o.trk.s - car.trk.s; if (d < 0) d += TL; if (d < gap && d < 50 && Math.abs(o.trk.lat - car.trk.lat) < 2.8) { gap = d; vo = Math.abs(o.v); } } if (gap < 50) target = Math.min(target, Math.max(0, vo + (gap - 15) * 0.4)); }
      const vErr = target - av;
      if (vErr > 0.5) { inp.throttle = 0.35; inp.brake = 0; } else if (vErr < -1) { inp.throttle = 0; inp.brake = U.clamp(-vErr / 6, 0.15, 1); } else { inp.throttle = 0.2; inp.brake = 0; }
      this.steerToLine(5.5 + av * 0.36);
    }

    // pure pursuit: the arc through a point on the (offset) line ahead gives the path curvature to drive; the steering input
    // is that curvature over the most the car can turn at this speed (lock-limited when slow, grip-limited when fast; the
    // same model car.js applies with full steering assist). The old fixed-gain steer (2.2 x heading error) asked for far
    // too little lock at speed, so the car only turned once it was metres off the line: it ran wide in every fast corner
    // (Maggotts-Becketts-Chapel onto the grass on every lap) and snaked on the straights.
    steerToLine(lookDist) {
      const car = this.car, t = this.track, n = t.n;
      const j = (car.trk.i + Math.round(lookDist / t.ds)) % n;
      // never aim off the road: the line swings edge to edge, so an offset taken here can point off track 30 m on
      const edge = t.halfWidth - 1.0;
      if (this.holdLat != null) this.offset = this.holdLat - t.lineOff[j];   // holding a lane: the same distance from the edge, not from the line
      const lo = this.latLo == null ? -edge : Math.max(-edge, this.latLo), hi = this.latHi == null ? edge : Math.min(edge, this.latHi);
      this.offset = U.clamp(this.offset, lo - t.lineOff[j], hi - t.lineOff[j]);
      const tx = t.lineX[j] + t.nx[j] * this.offset, tz = t.lineZ[j] + t.nz[j] * this.offset;
      const dx = tx - car.x, dz = tz - car.z, ld = Math.max(2, Math.hypot(dx, dz));
      const err = U.wrapAngle(Math.atan2(dz, dx) - car.heading);
      const av = Math.abs(car.v), kWant = 2 * Math.sin(err) / ld; this.kWant = car.v < 0 ? 0 : kWant;
      const dMax = Math.max(0.42 / (1 + av / 18), 0.55 / (1 + Math.pow(av / 16, 3)));
      const G = EI.CAR.GRIP, mu = car.tyre.grip * (1 - 0.3 * Math.min(1, car.wear));
      const kMax = Math.min(Math.tan(dMax) / EI.CAR.WB, av > 0.5 ? mu * Math.min(G.cap, G.a0 + G.a1 * av * av) / (av * av) : 99);
      car.input.steer = U.clamp(-kWant / kMax, -1, 1);
      if (car.v < 0) car.input.steer *= -1;
    }
  }
  // the racing line the bots drive: a minimum-curvature line over the full usable width (car edge on the white line, kerbs
  // left as margin), replacing track.js's heuristic line (which used only 62% of the half width, so its corners were much
  // tighter than the road allows: a human on the full width was seconds a lap faster than an ultra bot). Computed once per
  // track, in place (lineOff / lineX / lineZ / lineK keep their meaning for everything that reads them: pit entry, cameras).
  // Gauss-Seidel on sum |p[i-1] - 2 p[i] + p[i+1]|^2 with each point moving along its normal, coarse to fine.
  function raceLine(track) {
    if (track._aiLine) return; track._aiLine = true;
    const n = track.n, X = track.x, Z = track.z, NX = track.nx, NZ = track.nz, w = track.halfWidth - 1.15;
    const off = Float64Array.from(track.lineOff, v => U.clamp(v, -w, w));
    for (const step of [24, 12, 6, 3, 1]) {
      for (let it = 0; it < (step === 1 ? 400 : 150); it++) {
        for (let i = 0; i < n; i++) {
          const a2 = (i - 2 * step + 2 * n) % n, a1 = (i - step + n) % n, b1 = (i + step) % n, b2 = (i + 2 * step) % n;
          const px = (-(X[a2] + NX[a2] * off[a2]) + 4 * (X[a1] + NX[a1] * off[a1]) + 4 * (X[b1] + NX[b1] * off[b1]) - (X[b2] + NX[b2] * off[b2])) / 6;
          const pz = (-(Z[a2] + NZ[a2] * off[a2]) + 4 * (Z[a1] + NZ[a1] * off[a1]) + 4 * (Z[b1] + NZ[b1] * off[b1]) - (Z[b2] + NZ[b2] * off[b2])) / 6;
          off[i] = U.clamp((px - X[i]) * NX[i] + (pz - Z[i]) * NZ[i], -w, w);
        }
      }
    }
    const lo = track.smooth(Float32Array.from(off), 2);
    for (let i = 0; i < n; i++) { track.lineOff[i] = U.clamp(lo[i], -w, w); track.lineX[i] = X[i] + NX[i] * track.lineOff[i]; track.lineZ[i] = Z[i] + NZ[i] * track.lineOff[i]; }
    const k = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i + n - 1) % n, b = (i + 1) % n; const ax = track.lineX[b] - track.lineX[i], az = track.lineZ[b] - track.lineZ[i], bx = track.lineX[i] - track.lineX[a], bz = track.lineZ[i] - track.lineZ[a];
      const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1; k[i] = -((bx / lb) * (az / la) - (bz / lb) * (ax / la)) / ((la + lb) / 2);
    }
    track.lineK.set(track.smooth(k, 6));
  }
  EI.AIDriver = AIDriver; EI.aiRaceLine = raceLine;
  EI.AI_DIFF = DIFF;
  EI.AI_TRAITS = TRAITS;
  EI.AI_ARCHETYPES = ARCHETYPES;
  EI.buildSpeedProfile = (track, dec) => buildSpeedProfile(track, dec || 0.88, 1, EI.CAR.VMAX + 6, 2);   // reference profile (track wear marks)
})();
