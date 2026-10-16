// Equation I - race director: grid, start lights, laps, DRS, collisions, positions and results
window.EI = window.EI || {};
(function () {
  const U = EI.U;

  class Race {
    constructor(track, cfg) {
      this.track = track; this.cfg = cfg; this.laps = cfg.laps;
      this.cars = []; this.ais = []; this.players = [];
      this.phase = 'grid'; this.time = 0; this.started = false; this.lightsOn = 0; this.phaseT = 0; this.finishedCount = 0;
      this.events = []; this.fastest = { time: -1, car: null }; this.leaderFinished = false; this.over = false; this.overT = 0;
      this.rng = U.rng(cfg.seed || (Date.now() & 0xffff));
      this.drsEnabled = false; this.bestSectors = [-1, -1, -1];
      this.buildGrid();
      if (EI.Pit) EI.Pit.init(this);
    }

    buildGrid() {
      const cfg = this.cfg, track = this.track, rng = this.rng;
      const teams = EI.TEAMS;
      let id = 0;
      // players
      const takenDrivers = new Set();
      cfg.players.forEach((p, pi) => {
        const team = teams[p.teamIndex];
        const driver = team.drivers[takenDrivers.has(team.id + ':0') ? 1 : 0]; takenDrivers.add(team.id + ':' + team.drivers.indexOf(driver));
        const car = new EI.Car({ id: id++, team, driver, name: p.name, num: driver.num, isPlayer: true, playerIndex: pi, tyre: p.tyre, assist: cfg.assist, envMap: cfg.envMap });
        car.input = { throttle: 0, brake: 0, steer: 0, drs: false, ers: false };
        this.cars.push(car); this.players.push(car);
      });
      // bots: fill from the grid of teams, skipping drivers the players took
      const pool = [];
      for (const t of teams) t.drivers.forEach((d, di) => { if (!takenDrivers.has(t.id + ':' + di)) pool.push({ team: t, driver: d }); });
      // sort pool by team skill so the strongest teams come first, then take the number needed
      pool.sort((a, b) => b.team.skill - a.team.skill + (rng() - 0.5) * 0.02);
      const nb = Math.min(cfg.bots, pool.length);
      const tyreChoices = ['soft', 'medium', 'medium', 'hard'];
      for (let i = 0; i < nb; i++) {
        const e = pool[i];
        const car = new EI.Car({ id: id++, team: e.team, driver: e.driver, tyre: tyreChoices[Math.floor(rng() * tyreChoices.length)], assist: 'full', skill: e.team.skill, envMap: cfg.envMap });
        this.cars.push(car);
        this.ais.push(new EI.AIDriver(car, track, cfg.difficulty, rng));
      }
      // grid order
      let order = this.cars.slice();
      const bots = order.filter(c => !c.isPlayer), players = order.filter(c => c.isPlayer);
      const botsByPace = bots.slice().sort((a, b) => (this.aiFor(b).speedFactor + rng() * 0.012) - (this.aiFor(a).speedFactor + rng() * 0.012));
      if (cfg.grid === 'front') order = players.concat(botsByPace);
      else if (cfg.grid === 'back') order = botsByPace.concat(players);
      else if (cfg.grid === 'random') { order = this.cars.slice(); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; } }
      else { // qualifying: players slot in at a position matching the bot difficulty (mid-grid)
        order = botsByPace.slice();
        const dl = { veryeasy: 0.05, easy: 0.15, rookie: 0.15, average: 0.4, pro: 0.4, above: 0.55, hard: 0.7, veryhard: 0.85, legend: 0.85, ultra: 1.0 }; const slot = Math.round(order.length * (dl[cfg.difficulty] != null ? dl[cfg.difficulty] : 0.4));
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
          for (const c of this.cars) { c.lapStart = 0; }
          this.players.forEach(p => { if (p.jumpStart) { p.penalty += 5; this.emit('penalty', p); } });
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
      // ---- slipstream and DRS detection
      this.drsEnabled = this.started && this.cars.some(c => c.lapsDone >= 1);
      for (const car of this.cars) {
        car.slipstream = 0;
        let best = 1e9;
        for (const o of this.cars) {
          if (o === car) continue;
          let d = o.trk.s - car.trk.s; if (d > track.length / 2) d -= track.length; if (d < -track.length / 2) d += track.length;
          if (d > 2 && d < 40 && Math.abs(o.trk.lat - car.trk.lat) < 3.5 && d < best) best = d;
        }
        if (best < 40 && car.v > 20) car.slipstream = U.clamp(1 - best / 40, 0, 1) * 0.85;
      }
      // ---- physics
      const prevS = new Float32Array(this.cars.length);
      this.cars.forEach((c, i) => { prevS[i] = c.trk.s; });
      for (const car of this.cars) { const wasOpen = car.drsOpen; car.update(dt, track, this); if (car.isPlayer && car.drsOpen !== wasOpen) this.emit('drsFlap', car); }
      this.resolveCollisions(dt);
      // ---- crossings: DRS detection / zone end, lap lines
      this.cars.forEach((car, i) => {
        const a = prevS[i], b = car.trk.s;
        const crossed = (s) => (a <= s && b >= s && b - a < track.length / 2) || (a > b && (s >= a || s <= b)); // handles wrap
        track.drs.forEach((z, zi) => {
          if (crossed(z.detect)) {
            car.drsEligible = false; let detGap = null;
            if (this.drsEnabled && car.lapsDone >= 1) {
              // within 1.0 s of any car ahead on track
              let gapT = 1e9;
              for (const o of this.cars) {
                if (o === car) continue;
                let d = o.trk.s - car.trk.s; if (d < 0) d += track.length;
                const tgap = d / Math.max(car.v, 15); if (tgap < gapT) gapT = tgap;
              }
              detGap = gapT;
              if (gapT <= 1.0) { car.drsEligible = true; car.drsZone = zi; if (car.isPlayer) this.emit('drsOn', car); }
            }
            // last detection result, read by the HUD (n counts crossings so a repeat result still shows)
            if (this.started) car.drsDetect = { n: (car.drsDetect ? car.drsDetect.n : 0) + 1, zone: zi, gap: detGap, ok: car.drsEligible, live: detGap != null, t: this.time };
          }
          if (crossed(z.end)) { car.drsEligible = false; car.drsOpen = false; }
        });
        if (this.started && crossed(track.sf)) this.onLapLine(car, b);
        if (this.started && !car.finished) track.sectors.forEach((ss, si) => { if (crossed(ss)) this.onSector(car, si, b, ss); });
        // time marks every 10 m for live gaps
        if (this.started) { const mi = Math.floor(car.dist / 10); if (mi >= 0 && mi < car.marks.length && car.marks[mi] < 0) car.marks[mi] = this.time; }
        if (this.started && !car.finished) { const li = Math.floor(U.mod(car.trk.s - track.sf, track.length) / 10); if (li < car.lapMarks.length) car.lapMarks[li] = this.time - car.lapStart; }
      });
      this.updatePositions();
      // ---- race end
      if (this.players.every(p => p.finished)) {
        if (!this.over) { this.over = true; this.overT = 0; this.emit('over'); }
      }
      if (this.over) { this.overT += dt; if (!this.classified && (this.cars.every(c => c.finished) || this.overT > 20)) { this.classified = true; this.emit('classified'); } }
      if (EI.Pit) EI.Pit.update(this, dt);
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
      const rel = car.dist - track.sf;
      if (rel < 0) return;
      const lapsDone = Math.floor(rel / track.length); // crossing the line from the grid completes nothing
      if (lapsDone <= car.lapsDone && car.crossedStart) return;
      let over = sNow - track.sf; if (over < 0) over += track.length;
      const tCross = this.time - over / Math.max(car.v, 1);
      if (!car.crossedStart) { car.crossedStart = true; car.sectorStart = tCross; car.sector = 0; car.sectorFlags = ['', '', '']; if (lapsDone === 0) return; }
      car.lapsDone = lapsDone;
      const lt = tCross - car.lapStart;
      this.recordSector(car, 2, tCross - car.sectorStart); car.sectorStart = tCross; car.sector = 0; car.lastLapFlags = car.sectorFlags.slice(); car.sectorFlags = ['', '', ''];
      if (lt > 20) {
        car.lastLap = lt; car.laps.push(lt);
        if (car.bestLap < 0 || lt < car.bestLap) { car.bestLap = lt; car.bestMarks = car.lapMarks.slice(); }
        if (this.fastest.time < 0 || lt < this.fastest.time) { this.fastest = { time: lt, car }; this.emit('fastest', car); }
      }
      car.lapStart = tCross; car.lap = lapsDone + 1;
      if (lapsDone >= this.laps || this.leaderFinished) {
        car.finished = true; car.finishTime = tCross + car.penalty; car.finishOrder = this.finishedCount++;
        if (!this.leaderFinished) { this.leaderFinished = true; this.emit('leaderFinished', car); }
        this.emit('finished', car);
      } else if (car.lap === this.laps) this.emit('finalLap', car);
    }

    updatePositions() {
      const cars = this.cars.slice();
      cars.sort((a, b) => {
        if (a.finished && b.finished) return a.finishTime - b.finishTime;
        if (a.finished) return -1; if (b.finished) return 1;
        return b.dist - a.dist;
      });
      this.order = cars;
      cars.forEach((c, i) => {
        c.pos = i + 1;
        if (i === 0) { c.gapAhead = 0; c.gapLeader = 0; return; }
        const ahead = cars[i - 1];
        c.gapAhead = this.timeGap(ahead, c); c.gapLeader = this.timeGap(cars[0], c);
      });
    }
    timeGap(ahead, car) {
      if (ahead.finished && car.finished) return car.finishTime - ahead.finishTime;
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

    emit(type, data) { this.events.push({ type, data }); }
    pollEvents() { const e = this.events; this.events = []; return e; }

    results() {
      const leader = this.order[0];
      return this.order.map(c => {
        const lapsBehind = leader.finished ? Math.max(0, this.laps - c.lapsDone) : 0;
        return { car: c, pos: c.pos, time: c.finished ? c.finishTime : null, best: c.bestLap,
          gap: c.finished ? c.finishTime - leader.finishTime : (lapsBehind > 0 ? null : c.gapLeader), lapsBehind };
      });
    }
  }
  EI.Race = Race;
})();
