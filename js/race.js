// Equation I - race director: grid, start lights, laps, DRS, collisions, positions and results
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  // Sporting rules (2026 FIA F1 Sporting Regulations, Driving Standards and Penalty Guidelines, scaled to short races):
  //  - timing: one control Line (track.sf), lap times from it; positions by timing loops (every LOOP m: a car moves up only when it
  //    reaches a loop before the car ahead did, so side-by-side cars do not flicker); finished cars by laps, then crossing order
  //  - 2026 aero: Straight Mode (low-drag wings, the old DRS flap) for every car in the activation zones; Overtake (+0.5 MJ,
  //    here: OT_ENERGY of free battery for one lap) for a car within OT_GAP s of the car ahead at the Detection Line, armed at the Line
  //  - the Line is crossed when the car's nose (NOSE m ahead of its centre) reaches it: lap and sector times start and end there
  //  - track limits: no part of the car on the track (white lines are track, kerbs are not) = that lap time is deleted; a cut that
  //    gains a place must give it back within GIVE_BACK_T s (else 5 s), a cut that gains a lot of time costs 3 s. Nothing else is shown.
  //  - jump start 5 s, pit lane speeding (pit.js), chequered flag for every car at its next crossing after the leader, time
  //    penalties added to the classification. car.blueFlag (a lapping car close behind) is left for the bots' racecraft, unflagged.
  //    (Deliberately not used here: blue / black-and-white flags, strikes, unsafe release, the two-compound rule.)
  const TOW_LEN = 50, TOW_MAX = 0.6;   // wake length (m) and strength right behind (car.js: x0.3 = 18% less drag) - f1-DRIVING, see the slipstream block
  const NOSE = 2.7, LOOP = 20, HYST = 1.0, OT_GAP = 1.0, OT_ENERGY = 0.5, OFF_W = 1.1, TL_DEBOUNCE = 0.12, TL_REJOIN = 0.35, GIVE_BACK_T = 15, MANDATORY_LAPS = 3;

  class Race {
    constructor(track, cfg) {
      this.track = track; this.cfg = cfg; this.laps = cfg.laps;
      this.cars = []; this.ais = []; this.players = [];
      this.phase = 'grid'; this.time = 0; this.started = false; this.lightsOn = 0; this.phaseT = 0; this.finishedCount = 0;
      this.events = []; this.fastest = { time: -1, car: null }; this.leaderFinished = false; this.over = false; this.overT = 0;
      this.seed = (cfg.seed || (Date.now() & 0xffff)) >>> 0;
      this.rng = U.rng(this.seed);
      this.drsEnabled = false; this.bestSectors = [-1, -1, -1];
      this.buildGrid();
      if (EI.Pit) EI.Pit.init(this);
      lastRace = this; this.renderField();
    }

    // ------------------------------------------------------------------ pause "Field" card: each bot's archetype and traits
    renderField() {
      if (typeof document === 'undefined' || !EI.AI_TRAITS) return;
      const el = document.getElementById('pause-field'); if (!el) return;
      const TR = EI.AI_TRAITS, esc = (x) => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      let h = '<div class="fd-row fd-head"><span class="fd-pos">P</span><span class="fd-name">Driver</span><span class="fd-arch">Style</span>';
      for (const t of TR) h += '<span class="fd-t" title="' + esc(t.name + ': 0.01 ' + t.lo + ' · 1.00 ' + t.hi) + '">' + t.short + '</span>';
      h += '</div>';
      for (const car of this.order) {
        const ai = this.aiFor(car);
        h += '<div class="fd-row' + (car.isPlayer ? ' fd-player' : '') + '"><span class="fd-pos">' + car.pos + '</span><span class="fd-name"><i style="background:' + car.team.primary + '"></i>' + esc(car.name) + '</span>';
        if (!ai) { h += '<span class="fd-arch fd-you">Player</span><span class="fd-none">your call</span></div>'; continue; }
        h += '<span class="fd-arch arch-' + ai.archetype.id + '">' + esc(ai.archetype.name) + '</span>';
        for (const t of TR) { const v = ai.traits[t.id]; h += '<span class="fd-t" title="' + esc(t.name + ' ' + v.toFixed(2)) + '"><b style="width:' + Math.round(v * 100) + '%"></b><em>' + v.toFixed(2) + '</em></span>'; }
        h += '</div>';
      }
      const sk = this.cfg && this.cfg.difficulty && this.ais.length ? (EI.skillLabel ? EI.skillLabel(this.cfg.difficulty) : 'Skill: ' + this.cfg.difficulty) : '';   // SKILL-UI: bot skill next to the grid
      if (this.gridInfo || sk) h = '<div class="fd-row fd-grid" style="display:block;opacity:.8;font-size:12px;padding:2px 0 6px">' + [this.gridInfo ? 'Grid: ' + esc(this.gridInfo.label) : '', esc(sk)].filter(Boolean).join(' · ') + '</div>' + h;
      el.innerHTML = h;
    }

    buildGrid() {
      const cfg = this.cfg, track = this.track, rng = this.rng;
      let id = 0;
      // every seat of the field (11 entries x 2 = 22); a player takes a seat and replaces that real driver. A player on an own team
      // (Lumi / Intake) takes over a real entry (Race.lineup), keeping its other driver and its grid slots
      const LU = Race.lineup(cfg.players); this.entries = LU.entries; this.takeovers = LU.takeovers;
      const seats = LU.seats, playerSeat = LU.playerSeats;
      const takenDrivers = new Set(playerSeat.map(st => st.key));
      // the 2026 grid mode: a real qualifying / starting grid from a race already run this season
      const real = cfg.grid === 'season' ? Race.seasonGrid(rng, seats, cfg.gridRound) : null;
      this.gridInfo = real ? { label: real.label, round: real.round, race: real.race } : null;
      // bots: the top of the real grid (season mode), otherwise the strongest seats first (average real grid slot this season,
      // or the team's skill without season data) with a little shuffle
      let pool = seats.filter(st => !takenDrivers.has(st.key));
      if (real) pool = real.order.filter(st => !takenDrivers.has(st.key));
      else {
        const avg = Race.seasonAverage(seats);
        const w = new Map(pool.map(st => [st, avg ? -(avg.get(st) || 23) + (rng() - 0.5) * 6 : st.team.skill + (rng() - 0.5) * 0.02]));
        pool.sort((a, b) => w.get(b) - w.get(a));
      }
      const nb = Math.min(cfg.bots, pool.length);
      cfg.players.forEach((p, pi) => {
        const st = playerSeat[pi];
        const car = new EI.Car({ id: id++, team: st.team, driver: st.driver, name: p.name, num: st.driver.num, isPlayer: true, playerIndex: pi, tyre: p.tyre, assist: cfg.assist, envMap: cfg.envMap });
        car.seat = st; car.input = { throttle: 0, brake: 0, steer: 0, drs: false, ers: false };
        this.cars.push(car); this.players.push(car);
      });
      for (let i = 0; i < nb; i++) {
        const e = pool[i];
        const car = new EI.Car({ id: id++, team: e.team, driver: e.driver, tyre: 'medium', assist: 'full', skill: e.team.skill, envMap: cfg.envMap });
        car.seat = e; this.cars.push(car);
        // personality: seeded from the race seed and the seat, so the same seed always gives the same field; teammates
        // never share an archetype
        const mate = this.ais.find(a => a.car.team === e.team);
        this.ais.push(new EI.AIDriver(car, track, cfg.difficulty, rng, { seed: this.seed, slot: e.team.index * 2 + e.di, avoid: mate && mate.archetype ? [mate.archetype.id] : null }));
      }
      // grid order
      let order = this.cars.slice();
      const bots = order.filter(c => !c.isPlayer), players = order.filter(c => c.isPlayer);
      const pace = new Map(bots.map(c => [c, this.aiFor(c).paceIndex()]));   // (the day's form is inside paceIndex)
      const botsByPace = bots.slice().sort((a, b) => pace.get(b) - pace.get(a));
      if (real) { const at = new Map(real.order.map((st, i) => [st, i])); order = this.cars.slice().sort((a, b) => at.get(a.seat) - at.get(b.seat)); }   // the real order (players in their driver's slot), closed up
      else if (cfg.grid === 'front') order = players.concat(botsByPace);
      else if (cfg.grid === 'back') order = botsByPace.concat(players);
      else if (cfg.grid === 'random') { order = this.cars.slice(); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; } }
      else { // qualifying: players slot in at a position matching the bot difficulty (mid-grid)
        order = botsByPace.slice();
        const dl = { veryeasy: 0.05, easy: 0.15, rookie: 0.15, average: 0.4, pro: 0.4, above: 0.55, hard: 0.7, veryhard: 0.85, legend: 0.85, official: 0.93, ultra: 1.0 }; const fr = EI.Skill && EI.Skill.gridFraction ? EI.Skill.gridFraction(cfg.difficulty) : (dl[cfg.difficulty] != null ? dl[cfg.difficulty] : 0.4); const slot = Math.round(order.length * (isFinite(fr) ? fr : 0.4));
        players.forEach((p, k) => order.splice(Math.min(order.length, slot + k), 0, p));
      }
      order.forEach((car, pos) => {
        const g = track.gridSlot(pos);
        car.place(g.x, g.z, g.heading, g.y);
        car.gridPos = pos + 1; car.pos = pos + 1;
        // distance counted from behind the line (so a grid that wraps past the end of the lap still starts short of lap 1)
        track.project(car.x, car.z, null, car.trk); car._prevS = car.trk.s; car.dist = track.sf - U.mod(track.sf - car.trk.s, track.length);
        car.crossedStart = false; car.sectorFlags = ['', '', '']; car.lastLapFlags = ['', '', '']; car.marks = new Float32Array(Math.ceil((this.laps + 2) * track.length / 10) + 10).fill(-1);
        car.lapMarks = new Float32Array(Math.ceil(track.length / 10) + 2); car.bestMarks = null;
      });
      this.order = order.slice();
    }
    aiFor(car) { return this.ais.find(a => a.car === car); }

    // ------------------------------------------------------------------ start procedure
    startLights() { this.phase = 'lights'; this.phaseT = 0; this.lightsOn = 0; }

    update(dt, inputs) {
      const track = this.track;
      this.phaseT += dt;
      if (this.phase === 'lights') {
        const n = Math.min(5, Math.floor(this.phaseT / 1.0) + 1);
        if (n !== this.lightsOn && n <= 5) { this.lightsOn = n; this.emit('light', n); track.setStartLights(n); }
        if (this.lightsOn === 5 && !this.holdT) this.holdT = 1.0 + 0.4 + this.rng() * 2.2;
        if (this.lightsOn === 5 && this.phaseT >= 5 + this.holdT - 1) {
          this.phase = 'racing'; this.started = true; this.time = 0; track.setStartLights(0); this.emit('go');
          for (const c of this.cars) { c.lapStart = 0; c.compounds = {}; c.compounds[c.tyreKey] = true; }
          // jump start (B5.11): 5 s, servable at a stop; main.js shows the message on the 'penalty' event
          this.players.forEach(p => { if (p.jumpStart) { p.penalty += 5; p.penServable = (p.penServable || 0) + 5; (p.penLog || (p.penLog = [])).push({ sec: 5, reason: 'Jump start', t: 0, lap: 1 }); this.emit('penalty', p); } });
        }
      }
      if (this.started) this.time += dt;
      // ---- player inputs
      this.players.forEach((car, k) => { car.input = inputs[k]; });
      if (!this.started) {
        // hold everyone on the grid; players creeping forward before lights out is a jump start
        for (const car of this.cars) {
          if (!car.isPlayer) { car.input.throttle = 0; car.input.brake = 1; }
          else if (this.phase === 'lights' && this.lightsOn >= 1) {
            const g = track.gridSlot(car.gridPos - 1);
            if ((Math.hypot(car.x - g.x, car.z - g.z) > 0.3 || car.v > 1.4) && !car.jumpStart) { car.jumpStart = true; }
          } else if (this.phase === 'grid') { car.input.throttle = 0; car.input.brake = 1; }
        }
      }
      // ---- bots
      for (const ai of this.ais) ai.update(dt, this, this.cars);
      // ---- slipstream; 2026 aero: Straight Mode is enabled for every car from lights out (it is not an overtaking aid)
      this.drsEnabled = this.started;
      for (const car of this.cars) {
        car.slipstream = 0;
        // the tow: strongest right behind a car, fading over TOW_LEN m and as the follower moves out of its wake (full within
        // 1.5 m of its line, none beyond 4.5 m), so a car pulling out to pass keeps part of it for the first metres.
        // car.js turns 1.0 into 30% less drag: TOW_MAX 0.6 = 18% right behind, ~11% at 20 m (Monza tops 360-375 km/h with Straight Mode)
        if (car.v > 20) for (const o of this.cars) {
          if (o === car || (o.pit && o.pit.active)) continue;
          let d = o.trk.s - car.trk.s; if (d > track.length / 2) d -= track.length; if (d < -track.length / 2) d += track.length;
          if (d <= 2 || d >= TOW_LEN) continue;
          const w = U.clamp((4.5 - Math.abs(o.trk.lat - car.trk.lat)) / 3, 0, 1); if (w <= 0) continue;
          car.slipstream = Math.max(car.slipstream, TOW_MAX * w * (1 - d / TOW_LEN));
        }
      }
      // ---- physics
      if (!this._prevS || this._prevS.length !== this.cars.length) this._prevS = new Float32Array(this.cars.length);
      const prevS = this._prevS;
      this.cars.forEach((c, i) => { prevS[i] = c.trk.s; });
      for (const car of this.cars) { const wasOpen = car.drsOpen; car.update(dt, track, this); if (car.isPlayer && car.drsOpen !== wasOpen) this.emit('drsFlap', car); }
      // Overtake: the extra energy pays for the boost (ERS) while it lasts
      for (const car of this.cars) if (car.otEnergy > 0 && (car.ersActive || (car.input && car.input.ers && car.ers <= 0.02))) { const r = Math.min(car.otEnergy, 0.22 * dt); car.ers = Math.min(1, car.ers + r); car.otEnergy -= r; }
      this.resolveCollisions(dt);
      // ---- crossings (forward only: a car pushed or spun backwards crosses nothing): activation zones, the Detection Line, the Line
      if (this.otZone == null) this.otZone = this.detectionZone();
      this.cars.forEach((car, i) => {
        const a = prevS[i], b = car.trk.s;
        const inPit = !!(car.pit && car.pit.active);
        for (let zi = 0; zi < track.drs.length; zi++) {
          const z = track.drs[zi];
          if (this.crossed(a, b, z.detect)) {
            // Straight Mode: enabled for every car through this activation zone (not from the pit lane)
            car.drsEligible = this.drsEnabled && !inPit; car.drsZone = zi;
            if (car.drsEligible && car.isPlayer) this.emit('drsOn', car);
            // Overtake: the one Detection Line of the lap; within the Detection Gap of the car ahead -> armed at the next Line
            let detGap = null;
            if (zi === this.otZone && this.started && !inPit && !car.finished) { detGap = this.gapAheadOnTrack(car); car.otNext = detGap <= OT_GAP; }
            if (this.started) car.drsDetect = { n: (car.drsDetect ? car.drsDetect.n : 0) + 1, zone: zi, gap: detGap, ok: !!car.otNext, live: detGap != null, t: this.time };
          }
          if (this.crossed(a, b, z.end)) { car.drsEligible = false; car.drsOpen = false; }
        }
        if (this.started && this.crossed(a, b, U.mod(track.sf - NOSE, track.length))) this.onLapLine(car, b);
        if (this.started && !car.finished) for (let si = 0; si < track.sectors.length; si++) { const ls = U.mod(track.sectors[si] - NOSE, track.length); if (this.crossed(a, b, ls)) this.onSector(car, si, b, ls); }
        // timing loop: the time this car entered its current loop (the running order compares these)
        if (this.started) { const li = Math.floor(car.dist / LOOP); if (li !== car._loop) { car._loop = li; car._loopT = this.time; } }
        // time marks every 10 m for live gaps
        if (this.started) { const mi = Math.floor(car.dist / 10); if (mi >= 0 && mi < car.marks.length && car.marks[mi] < 0) car.marks[mi] = this.time; }
        if (this.started && !car.finished) { const li = Math.floor(U.mod(car.trk.s - track.sf, track.length) / 10); if (li < car.lapMarks.length) car.lapMarks[li] = this.time - car.lapStart; }
      });
      this.stewards(dt);
      this.updatePositions();
      // ---- race end
      if (this.players.every(p => p.finished)) {
        if (!this.over) { this.over = true; this.overT = 0; this.emit('over'); }
      }
      if (this.over) { this.overT += dt; if (!this.classified && (this.cars.every(c => c.finished) || this.overT > 20)) { this.classified = true; this.emit('classified'); } }
      if (EI.Pit) EI.Pit.update(this, dt);
    }

    // a forward crossing of lap distance s between two steps (a backward step crosses nothing; a jump over the lap wrap does)
    crossed(a, b, s) {
      const d = b - a, TL = this.track.length;
      if (d >= 0 && d < TL / 2) return a < s && s <= b;
      if (d < -TL / 2) return s > a || s <= b;
      return false;
    }
    // the Overtake Detection Line: the detection point of the activation zone that comes last before the Line
    detectionZone() {
      const t = this.track; let best = -1, bd = Infinity;
      t.drs.forEach((z, zi) => { const d = U.mod(t.sf - z.detect, t.length); if (d < bd) { bd = d; best = zi; } });
      return best;
    }
    // time since the nearest car ahead on track (any car, lapped or not; not in the pit lane) passed this car's position
    gapAheadOnTrack(car) {
      const TL = this.track.length; let best = null, bd = Infinity;
      for (const o of this.cars) { if (o === car || o.finished || (o.pit && o.pit.active)) continue; let d = o.trk.s - car.trk.s; if (d <= 0) d += TL; if (d < bd) { bd = d; best = o; } }
      if (!best) return Infinity;
      const mi = Math.floor((best.dist - bd) / 10);
      if (mi >= 0 && mi < best.marks.length && best.marks[mi] >= 0) return Math.max(0, this.time - best.marks[mi]);
      return bd / Math.max(car.v, 15);
    }

    onSector(car, si, sNow, ss) {
      // sector si (0 or 1) just ended at ss
      let over = sNow - ss; if (over < 0) over += this.track.length;
      const tCross = this.time - over / Math.max(car.v, 1);
      if (!car.crossedStart) return;
      const st = tCross - car.sectorStart; car.sectorStart = tCross; car.sector = si + 1;
      this.recordSector(car, si, st);
    }
    recordSector(car, si, st) {
      car.lastSectorT[si] = st;
      const personal = car.bestSectors[si] < 0 || st < car.bestSectors[si]; if (personal) car.bestSectors[si] = st;
      const overall = this.bestSectors[si] < 0 || st < this.bestSectors[si]; if (overall) this.bestSectors[si] = st;
      car.sectorFlags[si] = overall ? 'purple' : personal ? 'green' : 'yellow';
    }
    onLapLine(car, sNow) {
      const track = this.track;
      if (car.finished) return;
      // this runs on a forward crossing of the Line; race distance only says which lap it completes. A crossing by a few mm left
      // dist a hair short of the next lap (float error, Monaco / Yas with the Line at s = 0) and the lap was not counted until the
      // next time round: allow 5 m of slack (a car going back over the Line and forward again still cannot count twice)
      const rel = car.dist + NOSE - track.sf;
      if (rel < -5) return;
      const lapsDone = Math.max(0, Math.floor((rel + 5) / track.length)); // crossing the line from the grid completes nothing
      if (lapsDone <= car.lapsDone && car.crossedStart) return;
      let over = sNow + NOSE - track.sf; over -= Math.floor(over / track.length) * track.length; if (over > track.length / 2) over = 0;
      const tCross = this.time - over / Math.max(car.v, 1);
      if (!car.crossedStart) { car.crossedStart = true; car.sectorStart = tCross; car.sector = 0; car.sectorFlags = ['', '', '']; if (lapsDone === 0) return; }
      car.lapsDone = lapsDone;
      const lt = tCross - car.lapStart;
      this.recordSector(car, 2, tCross - car.sectorStart); car.sectorStart = tCross; car.sector = 0; car.lastLapFlags = car.sectorFlags.slice(); car.sectorFlags = ['', '', ''];
      const deleted = !!car.lapInvalid; car.lapInvalid = false; car.lastLapDeleted = deleted;
      if (lt > 20) {
        car.lastLap = lt; car.laps.push(lt); (car.lapsDeleted || (car.lapsDeleted = [])).push(deleted);
        // a lap set beyond the track limits is deleted: it never counts as a best or the fastest lap
        if (!deleted && (car.bestLap < 0 || lt < car.bestLap)) { car.bestLap = lt; car.bestMarks = car.lapMarks.slice(); }
        if (!deleted && (this.fastest.time < 0 || lt < this.fastest.time)) { this.fastest = { time: lt, car }; this.emit('fastest', car); }
      }
      car.lapStart = tCross; car.lap = lapsDone + 1;
      // Overtake: armed for this lap when the car was within the Detection Gap at the Detection Line
      car.overtake = !!car.otNext; car.otNext = false; car.otEnergy = car.overtake ? OT_ENERGY : 0;
      if (lapsDone >= this.laps || this.leaderFinished) {
        car.finished = true; car.raceTime = tCross; car.finishDist = this.track.sf + lapsDone * this.track.length; car.finishTime = tCross + car.penalty; car.finishOrder = this.finishedCount++;
        car.overtake = false; car.otEnergy = 0; if (car.rules) { car.rules.give = null; car.rules.blueBy = null; } car.blueFlag = null;
        if (!this.leaderFinished) { this.leaderFinished = true; this.emit('leaderFinished', car); }
        this.emit('finished', car);
      } else if (car.lap === this.laps) this.emit('finalLap', car);
    }

    // running order as the timing system sees it: by the last timing loop reached (every LOOP m of race distance, the pit lane
    // included), then by who reached it first; finished cars by laps, then by crossing order. An insertion sort over the previous
    // order keeps ties as they were, so two cars side by side do not swap back and forth.
    orderKey(c) {
      if (c.finished) { c._ok = c.finishDist; c._ot = c.raceTime; return; }
      if (c._loop == null) { c._ok = c.dist; c._ot = 0; return; }
      c._ok = c._loop * LOOP; c._ot = c._loopT;
    }
    updatePositions() {
      const cars = this.order && this.order.length === this.cars.length ? this.order : this.cars.slice();
      if (this.started) {
        for (const c of cars) this.orderKey(c);
        for (let i = 1; i < cars.length; i++) {
          const c = cars[i]; let j = i - 1;
          // ... and a car only goes ahead once it is at least HYST m clear (cars nose to tail or side by side keep their order)
          while (j >= 0 && (c._ok > cars[j]._ok || (c._ok === cars[j]._ok && c._ot < cars[j]._ot)) && (c.finished || cars[j].finished || c.dist - cars[j].dist > HYST)) { cars[j + 1] = cars[j]; j--; }
          cars[j + 1] = c;
        }
      }
      this.order = cars;
      cars.forEach((c, i) => {
        c.pos = i + 1;
        if (i === 0) { c.gapAhead = 0; c.gapLeader = 0; return; }
        const ahead = cars[i - 1];
        c.gapAhead = this.timeGap(ahead, c); c.gapLeader = this.timeGap(cars[0], c);
      });
    }
    // race distance for comparisons: frozen at the Line for a car that has finished
    raceDist(c) { return c.finished && c.finishDist != null ? c.finishDist : c.dist; }
    // whole laps between two cars (ahead minus behind): 1 or more means the second car is lapped by the first
    lapGap(ahead, car) { return Math.max(0, Math.floor((this.raceDist(ahead) - this.raceDist(car)) / this.track.length + 1e-6)); }
    timeGap(ahead, car) {
      if (ahead.finished && car.finished) return car.raceTime - ahead.raceTime;
      const mi = Math.floor(car.dist / 10);
      if (mi >= 0 && mi < ahead.marks.length && ahead.marks[mi] >= 0) return Math.max(0, this.time - ahead.marks[mi]);
      return Math.max(0, (ahead.dist - car.dist) / Math.max(car.v, 20));
    }

    // player delta against own best lap at this point of the lap
    deltaBest(car) {
      if (!car.bestMarks) return null;
      const li = Math.floor(U.mod(car.trk.s - this.track.sf, this.track.length) / 10);
      if (li >= car.bestMarks.length || car.bestMarks[li] <= 0) return null;
      return (this.time - car.lapStart) - car.bestMarks[li];
    }

    resolveCollisions(dt) {
      const cars = this.cars, n = cars.length, R = 1.15, half = 1.45;
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
        const A = cars[a], B = cars[b];
        const dx0 = B.x - A.x, dz0 = B.z - A.z; if (dx0 * dx0 + dz0 * dz0 > 49) continue;
        const fa = [Math.cos(A.heading), Math.sin(A.heading)], fb = [Math.cos(B.heading), Math.sin(B.heading)];
        for (let ia = -1; ia <= 1; ia += 2) for (let ib = -1; ib <= 1; ib += 2) {
          const ax = A.x + fa[0] * half * ia, az = A.z + fa[1] * half * ia, bx = B.x + fb[0] * half * ib, bz = B.z + fb[1] * half * ib;
          let dx = bx - ax, dz = bz - az; const d = Math.hypot(dx, dz);
          if (d >= 2 * R || d < 1e-4) continue;
          dx /= d; dz /= d; const pen = 2 * R - d;
          A.x -= dx * pen * 0.5; A.z -= dz * pen * 0.5; B.x += dx * pen * 0.5; B.z += dz * pen * 0.5;
          // velocities
          const va = [fa[0] * A.v + fa[1] * A.vLat, fa[1] * A.v - fa[0] * A.vLat];
          const vb = [fb[0] * B.v + fb[1] * B.vLat, fb[1] * B.v - fb[0] * B.vLat];
          const rel = (vb[0] - va[0]) * dx + (vb[1] - va[1]) * dz; // >0 separating
          if (rel < 0) {
            const j = -(1 + 0.25) * rel * 0.5;
            va[0] -= dx * j; va[1] -= dz * j; vb[0] += dx * j; vb[1] += dz * j;
            // rubbing friction along the contact
            A.v = (va[0] * fa[0] + va[1] * fa[1]) * 0.985; A.vLat = (va[0] * fa[1] - va[1] * fa[0]) * 0.8;
            B.v = (vb[0] * fb[0] + vb[1] * fb[1]) * 0.985; B.vLat = (vb[0] * fb[1] - vb[1] * fb[0]) * 0.8;
            const str = Math.min(1, -rel / 12);
            A.hit = Math.max(A.hit, str); B.hit = Math.max(B.hit, str);
            // yaw kick: hitting a corner of the car spins it a little
            A.heading = U.wrapAngle(A.heading + (ia * (dx * fa[1] - dz * fa[0])) * str * 0.08);
            B.heading = U.wrapAngle(B.heading - (ib * (dx * fb[1] - dz * fb[0])) * str * 0.08);
            if (A.isPlayer || B.isPlayer) this.emit('hit', str);
          }
        }
      }
      for (const c of cars) c.hit = Math.max(0, c.hit - dt * 2);
    }

    // ------------------------------------------------------------------ stewards
    // a message for a player's HUD (quiet chip under the pit / rules bar; pit.js draws it)
    notify(car, title, sub, cls, dur) { if (car.isPlayer && EI.Pit && EI.Pit.notify) EI.Pit.notify(car, title, sub, cls, dur); }
    // a time penalty, added to the race time in the classification. servable: a 5 s / 10 s penalty can be served at the next stop
    // (B1.9.6b); a drive-through or stop-and-go is converted to 20 s / 30 s (B1.9.6c iii: races here are all "last three laps")
    addPenalty(car, sec, reason, servable) {
      car.penalty += sec; if (servable) car.penServable = (car.penServable || 0) + sec;
      (car.penLog || (car.penLog = [])).push({ sec, reason, t: this.time, lap: car.lap });
      if (car.finished) car.finishTime = car.raceTime + car.penalty;
      this.emit('steward', { car, kind: 'penalty', sec, reason });
      this.notify(car, '+' + sec + ' S PENALTY', reason, 'pen', 3.5);
    }
    stewards(dt) {
      if (!this.started) return;
      const t = this.track, TL = t.length, hw = t.halfWidth;
      for (const car of this.cars) {
        const R = car.rules || (car.rules = { off: false, offT: 0, onT: 0, gain: 0, lost: false, hit: false, ahead: [], strikes: 0, give: null, blueBy: null, blueD: 0, bluePen: null, pd: car.dist });
        const prog = car.dist - R.pd; R.pd = car.dist;
        // the pit entry approach and the first seconds after the pit exit are not judged (the lane joins outside the white lines)
        const pl = car.pit && EI.Pit && EI.Pit.layout ? EI.Pit.layout() : null;
        const inPit = !!(car.pit && (car.pit.active || (car.pit.request && pl && U.mod(pl.sCap - car.trk.s, TL) < 250) || (car.pit.tOut != null && this.time - car.pit.tOut < 4)));
        if (car.finished || inPit) { R.off = false; R.offT = 0; R.give = null; R.blueBy = null; car.blueFlag = null; continue; }
        // ---- track limits: off when no part of the car is on the track (centre beyond the edge line by more than half the car)
        const out = Math.abs(car.trk.lat) > hw + OFF_W;
        if (out) {
          R.offT += dt; R.onT = 0;
          if (!R.off && R.offT >= TL_DEBOUNCE) {
            R.off = true; R.gain = 0; R.lost = false; R.hit = car.hit > 0.25 || car.wallHit > 0.3; R.ahead.length = 0;
            for (const o of this.cars) if (o !== car && !o.finished && !(o.pit && o.pit.active) && o.dist > car.dist && o.dist - car.dist < 60) R.ahead.push(o);
          }
          if (R.off) {
            // progress beyond what the tightest legal line (the inside edge of this bend) could have made: the cut
            const k = Math.abs(t.k[car.trk.i] || 0); const legal = Math.abs(car.v) * dt / Math.max(0.25, 1 - k * hw);
            R.gain += prog - legal;
            if (Math.abs(car.vLat) > Math.max(4, 0.4 * Math.abs(car.v)) || car.v < 3) R.lost = true;   // sliding / spun / stopped: loss of control
            if (car.hit > 0.25) R.hit = true;
          }
        } else {
          R.offT = 0;
          if (R.off) { R.onT += dt; if (R.onT >= TL_REJOIN) { R.off = false; this.judgeExcursion(car, R); } }
        }
        // ---- give the position back
        if (R.give) {
          let owed = 0; for (const o of R.give.cars) if (!o.finished && !(o.pit && o.pit.active) && o.dist < car.dist) owed++;
          if (!owed) { R.give = null; this.notify(car, 'POSITION RETURNED', '', 'ok', 1.5); this.emit('steward', { car, kind: 'returned' }); }
          else if (this.time > R.give.until) { R.give = null; this.addPenalty(car, 5, 'Corner cut · position not given back', true); }
        }
        // ---- a lapping car within 1 s behind (read by the bots' racecraft; no flag, no message, no penalty)
        let by = null;
        for (const o of this.cars) {
          if (o === car || o.finished || (o.pit && o.pit.active) || o.dist - car.dist < TL * 0.5) continue;
          let d = car.trk.s - o.trk.s; if (d < 0) d += TL; if (d > 120) continue;
          const mi = Math.floor((car.dist - d) / 10); const g = mi >= 0 && mi < car.marks.length && car.marks[mi] >= 0 ? this.time - car.marks[mi] : d / Math.max(o.v, 15);
          if (g <= 1.0) { by = o; break; }
        }
        R.blueBy = by; car.blueFlag = by;
      }
    }
    judgeExcursion(car, R) {
      car.lapInvalid = true;   // the lap time goes either way
      if (R.lost || R.hit) { this.emit('steward', { car, kind: 'excused' }); return; }   // loss of control / contact: the lap time only
      const passed = R.ahead.filter(o => !o.finished && !(o.pit && o.pit.active) && o.dist < car.dist - 0.5);
      const gainT = R.gain / Math.max(20, Math.abs(car.v));
      if (passed.length) {
        R.give = { cars: passed, until: this.time + GIVE_BACK_T };
        this.emit('steward', { car, kind: 'giveBack', cars: passed });
        this.notify(car, 'GIVE THE POSITION BACK', 'Let ' + passed.map(o => o.driver && o.driver.code || o.name).join(', ') + ' through · ' + GIVE_BACK_T + ' s', 'warn', GIVE_BACK_T);
        return;
      }
      if (gainT > 0.6) { this.addPenalty(car, 3, 'Corner cut', true); return; }
      this.emit('steward', { car, kind: 'deleted' });
    }

    emit(type, data) { this.events.push({ type, data }); }
    pollEvents() { const e = this.events; this.events = []; return e; }

    // classification: laps completed, then race time plus time penalties. A car still running when the results are drawn up is
    // classified at its next crossing of the Line (time projected from its last lap). (The two-compound rule, B6.3.6, is not used.)
    results() {
      const TL = this.track.length, sf = this.track.sf;
      const rows = this.cars.map(c => {
        let laps = c.lapsDone, time = null, projected = false;
        if (c.finished) time = c.raceTime != null ? c.raceTime : c.finishTime - c.penalty;
        else if (this.leaderFinished) {
          const n = Math.floor((c.dist - sf) / TL) + 1, next = sf + n * TL; const lap = c.lastLap > 0 ? c.lastLap : (c.bestLap > 0 ? c.bestLap : TL / 50);
          laps = Math.max(c.lapsDone, n); time = this.time + Math.max(0, next - c.dist) / (TL / lap); projected = true;
        }
        const used = c.compounds ? Object.keys(c.compounds).length : 2;
        const dsq = false && used < 2;   // the two-compound rule is not used in this game
        return { car: c, laps, raceTime: time, time: time != null ? time + c.penalty : null, best: c.bestLap, projected, dsq, gap: null, lapsBehind: 0 };
      });
      rows.sort((a, b) => (a.dsq - b.dsq) || (b.laps - a.laps) || ((a.time == null) - (b.time == null)) || (a.time != null ? a.time - b.time : this.raceDist(b.car) - this.raceDist(a.car)));
      const lead = rows.find(r => !r.dsq) || rows[0];
      rows.forEach((r, i) => {
        r.pos = i + 1; r.lapsBehind = r.dsq ? 0 : Math.max(0, lead.laps - r.laps);
        if (r.dsq) r.gap = null; else if (r.lapsBehind === 0 && r.time != null && lead.time != null) r.gap = r.time - lead.time;
        else if (r.lapsBehind === 0 && !this.leaderFinished) r.gap = r.car.gapLeader;
      });
      return rows;
    }
  }
  // ------------------------------------------------------------------ the field: 11 real entries, own teams taking one over
  const entryOf = (t) => t.entry || t.id;
  // constructors' standings, leader first: EI.SEASON.standings (team ids), else the EI.TEAMS order
  function standings() {
    const S = EI.SEASON, raw = S && (S.constructorsOrder || (S.standings && (Array.isArray(S.standings) ? S.standings : S.standings.constructors)));
    const ids = Array.isArray(raw) ? raw.map(x => Array.isArray(x) ? x[0] : typeof x === 'object' ? x.team || x.id : x) : null;
    const T = EI.TEAMS.slice(); if (!ids) return T;
    const r = (t) => { const i = ids.indexOf(t.id); return i < 0 ? 99 + t.index : i; }; return T.sort((a, b) => r(a) - r(b));
  }
  Race.ownTeams = () => EI.OWN_TEAMS || [];
  const seasonName = (t) => { const s = EI.SEASON && (EI.SEASON.teams || []).find(x => x.id === t.id); return s && s.name || t.name; };   // 'Cadillac', not the full entry name
  // the team a player config picks: { own: 'lumi' } for an own team, else EI.TEAMS[teamIndex]
  const ownOf = (p) => p && p.own ? Race.ownTeams().find(t => t.id === p.own) || null : null;
  // players -> { entries (EI.TEAMS order, taken-over entries replaced by the own team's per-race clone), seats, playerSeats, takeovers }
  Race.lineup = function (players) {
    const real = EI.TEAMS, entries = real.slice(), takeovers = [];
    const driven = new Set(); players.forEach(p => { if (!ownOf(p)) { const t = real[p.teamIndex] || real[0]; driven.add(t.id); } });
    const byOwn = {};
    players.forEach(p => {
      const own = ownOf(p); if (!own || byOwn[own.id]) return;
      const low = standings().reverse().find(t => !driven.has(t.id)); if (!low) return;   // lowest team in the standings no player drives for
      driven.add(low.id);
      const c = Object.assign({}, own, { entry: low.id, entryName: seasonName(low), index: low.index, skill: low.skill, drivers: low.drivers.slice(), takeover: low });
      entries[low.index] = c; byOwn[own.id] = c; takeovers.push({ own: own.id, entry: low.id, team: c });
    });
    const seats = []; entries.forEach((t) => t.drivers.forEach((d, di) => seats.push({ team: t, driver: d, di, key: entryOf(t) + ':' + di })));
    const taken = new Set();
    const playerSeats = players.map((p) => {
      const own = ownOf(p); const team = own ? byOwn[own.id] : entries[(real[p.teamIndex] || real[0]).index];
      let di = p.seat != null ? U.clamp(p.seat | 0, 0, team.drivers.length - 1) : 0;
      if (taken.has(entryOf(team) + ':' + di)) di = team.drivers.findIndex((d, j) => !taken.has(entryOf(team) + ':' + j));
      const st = di >= 0 ? seats.find(x => x.key === entryOf(team) + ':' + di) : seats.find(x => !taken.has(x.key));   // both players on one team: next free seat
      taken.add(st.key); return st;
    });
    return { entries, seats, playerSeats, takeovers };
  };
  // ------------------------------------------------------------------ real 2026 grids (EI.SEASON.grids, from js/data/season2026.js)
  // a driver of a grid entry: 'VER' / 1 / { code, num, team } ; matched to a seat by code, then number, then the team's free seat
  const codeOf = (d) => String(d.code || String(d.name || '').split(' ').pop().slice(0, 3)).toUpperCase();
  function gridList() {
    const S = EI.SEASON; const g = S && (S.grids || S.qualifying); if (!Array.isArray(g)) return [];
    const now = Date.now();
    return g.filter(x => x && Array.isArray(gridOf(x)) && gridOf(x).length >= 10 && !(x.date && Date.parse(x.date) > now));
  }
  // the starting grid of a round, mapped onto today's line-up (gridNow: stand-ins swapped back to the race seats), else as raced
  const gridOf = (x) => x.gridNow || x.order || x.grid || x.quali;
  const entryCode = (e) => String(e && typeof e === 'object' ? (e.code || e.driver || e.id || '') : e).toUpperCase();
  // the team a grid entry drove for: given on the entry (or a parallel grid.teams list), else the driver's team in EI.SEASON
  function teamOfEntry(e, k, grid) {
    if (e && typeof e === 'object' && e.team) return e.team;
    if (grid && Array.isArray(grid.teams) && grid.teams[k]) return grid.teams[k];
    const S = EI.SEASON, code = entryCode(e); if (!S) return null;
    for (const t of S.teams || []) for (const d of t.drivers || []) if (String(d.code || '').toUpperCase() === code) return t.id;
    for (const d of (S.drivers || []).concat(S.reserves || [])) if (String(d.code || '').toUpperCase() === code) return d.team;
    return null;
  }
  function seatOrder(grid, seats) {
    const left = seats.slice(), out = [], pend = [];
    const list = gridOf(grid);
    list.forEach((e, k) => {
      const code = entryCode(e), num = e && typeof e === 'object' ? e.num : (typeof e === 'number' ? e : null);
      const tid = e && typeof e === 'object' && e.team ? e.team : (Array.isArray(grid.teams) ? grid.teams[k] : null);
      // the driver in his own seat (a driver who raced that weekend for another team stands in for that team's car instead)
      const st = left.find(s => codeOf(s.driver) === code && (!tid || entryOf(s.team) === tid)) || (num != null && !code ? left.find(s => s.driver.num === num) : null);
      if (st) { left.splice(left.indexOf(st), 1); out.push(st); } else pend.push([out.length, e, k]);
    });
    // stand-ins and replaced drivers: the free seat of the team they drove for, else any free seat, at their real position
    const fill = [];
    for (const [at, e, k] of pend) {
      const tid = teamOfEntry(e, k, grid); let st = left.find(s => tid && entryOf(s.team) === tid);
      if (!st) st = left[0]; if (!st) continue; left.splice(left.indexOf(st), 1); fill.push([at, st]);
    }
    for (let k = fill.length - 1; k >= 0; k--) out.splice(Math.min(fill[k][0], out.length), 0, fill[k][1]);
    return out.concat(left);   // anyone the grid did not list starts from the back
  }
  Race.seasonGrid = function (rng, seats, round) {
    const L = gridList(); if (!L.length) return null;
    let g = round != null ? L.find(x => String(x.round) === String(round) || x.id === round) : null;
    // a circuit that names its own 2026 race (data.seasonGrid, e.g. Monza: 'Italian GP') starts from that race's grid when it has been run
    const own = round == null && EI.TRACKS && EI.trackId && EI.TRACKS[EI.trackId] && EI.TRACKS[EI.trackId].seasonGrid;
    if (!g && own) g = L.find(x => String(x.race || x.gp || x.name || '').replace(/Grand Prix/i, 'GP').toLowerCase() === String(own).toLowerCase()) || null;
    if (!g) g = L[Math.floor(rng() * L.length) % L.length];
    const race = String(g.race || g.gp || g.name || ('Round ' + g.round)).replace(/Grand Prix/i, 'GP');
    const sess = g.session || g.type || (g.gridNow || g.grid ? 'starting grid' : 'qualifying');
    return { order: seatOrder(g, seats), round: g.round, race, label: g.label || ((EI.SEASON.season || EI.SEASON.year || 2026) + ' ' + race + ' ' + sess) };
  };
  // each seat's average real grid slot over the season (null without data): picks the strongest bots for the other grid modes
  Race.seasonAverage = function (seats) {
    const L = gridList(); if (!L.length) return null;
    const sum = new Map(); for (const g of L) seatOrder(g, seats).forEach((st, i) => sum.set(st, (sum.get(st) || 0) + i + 1));
    for (const [k, v] of sum) sum.set(k, v / L.length); return sum;
  };
  Race.gridCount = () => gridList().length;
  EI.Race = Race;
  // refresh the Field card (current running order) every time the pause overlay opens
  let lastRace = null;
  if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
    const hook = () => { const p = document.getElementById('pause'); if (!p) return; new MutationObserver(() => { if (lastRace && !p.classList.contains('hidden')) lastRace.renderField(); }).observe(p, { attributes: true, attributeFilter: ['class'] }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
  }
})();
