// Equation I - race recorder, highlight detection and the post-race highlights reel
//
// Recorder. EI.Replay.attach(race) wraps update() and emit() on that race instance (race.js itself is untouched). After every
// physics step the recorder checks its own clock and, 20 times a second, writes every car's visual state into preallocated
// typed arrays: position, heading, speed, steering, throttle / brake, lateral and longitudinal g (body roll / pitch), grade,
// surface, DRS flap, ERS rain light, pit lane - 23 bytes per car. Samples go into a rolling 40 s ring; when a moment worth
// showing is found, its window (a few seconds before to a few after) is copied out of the ring into one of 18 kept slots of
// up to 16 s and filled on as the race goes on. Memory is fixed by the field size, not by the race length (22 cars: ~3.4 MB),
// and nothing is allocated per sample.
//
// Detection, on each sample: on-track passes (the field kept in race-distance order by an insertion sort - every swap is a
// pass - confirmed when it still holds 1.5 s later; pit-lane / out-lap swaps and passes on a car that has just crashed, spun or
// stopped do not count), side-by-side battles, the start and the biggest lap-1 gain, contacts (car.hit), spins, barrier hits,
// near misses, the fastest lap, the chequered flag, the players' finishes and pit stops. Each moment is scored: how long the
// two were fighting, a pass in a corner rather than a DRS blow-by, the positions at stake, the lead, the last lap, a re-pass,
// and the players.
//
// Reel. After the race (results card: Highlights, or auto-play) the 5-8 best moments play in race order, 6-10 s each, with
// broadcast cameras: the trackside TV towers near the moment (infra camera spots when the scenery exposes them, else tower-like
// spots on the outside of the bend), chase, T-cam onboard and the helicopter. Playback poses the cars through the same
// car.updateVisual() the race uses, without physics; the touched fields are saved first and restored on exit. main.js hands
// over one full-screen camera (one and two players) through EI.Replay.bind({ enter, exit, scenery }).
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  const HZ = 20, STEP = 1 / HZ, RING_S = 40, NSLOT = 18, SLOT_S = 16, HQ = 32767 / Math.PI;
  const SURF = ['asphalt', 'kerb', 'grass', 'gravel', 'runoff'], SURF_I = { asphalt: 0, kerb: 1, grass: 2, gravel: 3, runoff: 4 };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // ------------------------------------------------------------------ sample storage (structure of arrays, cap samples x nc cars)
  function Store(cap, nc) {
    const n = cap * nc; this.cap = cap; this.nc = nc; this.t = new Float64Array(cap);
    this.x = new Float32Array(n); this.y = new Float32Array(n); this.z = new Float32Array(n);
    this.h = new Int16Array(n); this.v = new Int16Array(n); this.st = new Int8Array(n); this.th = new Uint8Array(n); this.br = new Uint8Array(n);
    this.al = new Int8Array(n); this.ao = new Int8Array(n); this.gr = new Int8Array(n); this.fl = new Uint8Array(n);
  }
  Store.BYTES = 23;
  function copySample(A, ai, B, bi) {
    const nc = A.nc, a = ai * nc, b = bi * nc; B.t[bi] = A.t[ai];
    for (let j = 0; j < nc; j++) {
      const p = a + j, q = b + j;
      B.x[q] = A.x[p]; B.y[q] = A.y[p]; B.z[q] = A.z[p]; B.h[q] = A.h[p]; B.v[q] = A.v[p]; B.st[q] = A.st[p]; B.th[q] = A.th[p]; B.br[q] = A.br[p];
      B.al[q] = A.al[p]; B.ao[q] = A.ao[p]; B.gr[q] = A.gr[p]; B.fl[q] = A.fl[p];
    }
  }

  const INCIDENT = { contact: 1, wall: 1, spin: 1, off: 1, nearmiss: 1 };
  const posBonus = (p) => (p === 1 ? 18 : p <= 3 ? 10 : p <= 6 ? 5 : p <= 10 ? 2 : 0);
  function code(c) {
    if (!c) return '';
    if (c.isPlayer) { const n = String(c.name || 'YOU').toUpperCase(); return n; }
    const d = c.driver || {}; if (d.code) return String(d.code).toUpperCase();
    const nm = String(d.name || c.name || '').trim().split(/\s+/).pop() || '???'; return nm.slice(0, 3).toUpperCase();
  }
  const isYou = (c) => c && c.isPlayer && /^YOU$/i.test(String(c.name || ''));

  // ------------------------------------------------------------------ recorder + detector
  class Recorder {
    constructor(race) {
      this.race = race; this.track = race.track; this.cars = race.cars; const nc = this.nc = race.cars.length;
      this.RC = RING_S * HZ; this.ring = new Store(this.RC, nc); this.g = 0; this.rt = 0; this.nextT = 0;
      this.slots = []; for (let k = 0; k < NSLOT; k++) this.slots.push({ k, st: new Store(SLOT_S * HZ, nc), used: false, open: false, g0: 0, g1: -1, n: 0, score: 0, events: [] });
      this.events = []; this.frozen = false; this.cost = 0; this.samples = 0; this.goT = -1; this.sorted = false;
      const F = (T) => new T(nc);
      this.ord = F(Int16Array); this.pitT = F(Float32Array).fill(-1e9); this.hitP = F(Float32Array); this.wallP = F(Float32Array);
      this.incT = F(Float32Array).fill(-1e9); this.spinT = F(Float32Array).fill(-1e9); this.offT = F(Float32Array).fill(-1e9); this.wallT = F(Float32Array).fill(-1e9);
      this.lap1 = F(Uint8Array); this.closeTo = F(Int16Array).fill(-1); this.closeT = F(Float32Array);
      this.sbsP = F(Int16Array).fill(-1); this.sbsT0 = F(Float32Array); this.sbsL = F(Float32Array); this.sbsLastP = F(Int16Array).fill(-1); this.sbsEnd = F(Float32Array).fill(-1e9);
      this.conP = F(Int16Array).fill(-1); this.conT = F(Float32Array).fill(-1e9); this.conEv = new Array(nc).fill(null);
      this.passBy = F(Int16Array).fill(-1); this.passByT = F(Float32Array).fill(-1e9);
      this.nmK = F(Int16Array).fill(-1); this.nmT = F(Float32Array).fill(-1e9); this.nmV = F(Float32Array); this.nmLast = F(Float32Array).fill(-1e9);
      this.pend = []; for (let i = 0; i < 32; i++) this.pend.push({ on: false, a: 0, b: 0, t: 0, s: 0, drs: false, va: 0, vb: 0, close: 0, lapsDone: 0 });
      this.idx = new Map(); race.cars.forEach((c, j) => this.idx.set(c, j));
      this.startEv = null; this.fastEv = null; this.bestGain = 0; this.gainCar = -1; this.lap1Leader = -1;
    }
    get bytes() { return (this.RC + NSLOT * SLOT_S * HZ) * (this.nc * Store.BYTES + 8); }

    // after each physics step
    step(dt) {
      if (this.frozen) return;
      this.rt += dt; if (this.rt < this.nextT) return;
      this.nextT += STEP; if (this.nextT <= this.rt) this.nextT = this.rt + STEP;
      const t0 = now(); this.sample(); this.detect(); this.cost += now() - t0; this.samples++;
    }
    sample() {
      const S = this.ring, ri = this.g % this.RC, nc = this.nc, o = ri * nc, cars = this.cars; S.t[ri] = this.rt;
      for (let j = 0; j < nc; j++) {
        const c = cars[j], q = o + j;
        S.x[q] = c.x; S.y[q] = c.y; S.z[q] = c.z; S.h[q] = Math.round(U.wrapAngle(c.heading) * HQ);
        S.v[q] = clamp(Math.round(c.v * 100), -32767, 32767); S.st[q] = Math.round(clamp(c.steer, -1, 1) * 127);
        S.th[q] = Math.round(clamp(c.throttle, 0, 1) * 255); S.br[q] = Math.round(clamp(c.brake, 0, 1) * 255);
        S.al[q] = clamp(Math.round(c.aLat * 2), -127, 127); S.ao[q] = clamp(Math.round(c.aLong * 2), -127, 127); S.gr[q] = clamp(Math.round((c.gradeNow || 0) * 1000), -127, 127);
        S.fl[q] = (c.drsOpen ? 1 : 0) | (c.ersActive ? 2 : 0) | (c.pit && c.pit.active ? 4 : 0) | ((SURF_I[c.surface] || 0) << 3);
      }
      for (const sl of this.slots) {
        if (!sl.open) continue;
        if (this.g === sl.g0 + sl.n && sl.n < sl.st.cap && this.g <= sl.g1) copySample(S, ri, sl.st, sl.n++);
        if (this.g >= sl.g1 || sl.n >= sl.st.cap) sl.open = false;
      }
      this.g++;
    }

    // keep the window [tA, tB] around tKey: merged into a kept slot it overlaps, else a free slot, else the weakest slot
    request(tA, tKey, tB, score) {
      const RC = this.RC, gNow = this.g - 1; if (gNow < 0) return null; const oldest = Math.max(0, this.g - RC);
      let gA = gNow; while (gA > oldest && this.ring.t[(gA - 1) % RC] >= tA) gA--;
      const gK = gA + Math.max(0, Math.round((tKey - this.ring.t[gA % RC]) * HZ)), gB = gA + Math.max(1, Math.ceil((tB - this.ring.t[gA % RC]) * HZ));
      const cap = SLOT_S * HZ;
      for (const sl of this.slots) {
        if (!sl.used || sl.g0 > gK || sl.g1 < gA - 2 || gK > sl.g0 + cap - 2 * HZ) continue;
        const want = Math.min(sl.g0 + cap - 1, Math.max(sl.g1, gB));
        if (want > sl.g1) {
          sl.g1 = want;
          if (!sl.open) { const next = sl.g0 + sl.n; if (next >= oldest) { for (let gg = next; gg <= gNow && sl.n < cap; gg++) copySample(this.ring, gg % RC, sl.st, sl.n++); } sl.open = sl.g0 + sl.n <= sl.g1 && sl.g0 + sl.n === this.g; }
        }
        if (score > sl.score) sl.score = score; return sl;
      }
      let sl = null; for (const s of this.slots) if (!s.used) { sl = s; break; }
      if (!sl) { for (const s of this.slots) if (!s.open && !s.keep && s.score < score && (!sl || s.score < sl.score)) sl = s; if (!sl) return null; for (const e of sl.events) e.slot = null; }
      sl.used = true; sl.keep = false; sl.events.length = 0; sl.g0 = gA; sl.g1 = Math.min(gA + cap - 1, gB); sl.n = 0; sl.score = score;
      for (let gg = gA; gg <= gNow && sl.n < cap; gg++) copySample(this.ring, gg % RC, sl.st, sl.n++);
      sl.open = sl.g0 + sl.n <= sl.g1; return sl;
    }
    add(ev) {
      ev.slot = this.request(ev.tA, ev.t, ev.tB, ev.score); if (ev.slot) { ev.slot.events.push(ev); if (ev.type === 'start' || ev.type === 'finish') ev.slot.keep = true; }   // never evicted
      this.events.push(ev);
      if (this.events.length > 600) { let w = -1; for (let i = 0; i < this.events.length; i++) if (!this.events[i].slot && (w < 0 || this.events[i].score < this.events[w].score)) w = i; if (w >= 0) this.events.splice(w, 1); }
      return ev;
    }
    kill(ev) {
      if (!ev || ev.dead) return; ev.dead = true; const sl = ev.slot; if (!sl) return;
      const i = sl.events.indexOf(ev); if (i >= 0) sl.events.splice(i, 1); ev.slot = null;
      sl.score = 0; for (const e of sl.events) if (e.score > sl.score) sl.score = e.score;
      if (!sl.events.length) { sl.used = false; sl.open = false; }
    }
    base(type, j, t, pre, post, score) {
      const c = this.cars[j]; const s = c.trk ? c.trk.s : 0;
      return { type, t, tA: t - pre, tB: t + post, a: j, b: -1, s, lap: Math.max(1, Math.min(this.race.laps, (c.lapsDone || 0) + 1)), pos: c.pos, score, slot: null };
    }

    // race events (every race.emit goes through here first)
    onEvent(type, data) {
      if (this.frozen) return; const t = this.rt, race = this.race;
      if (type === 'go') {
        this.goT = t; this.sortField(); const lead = this.ord[0];
        this.startEv = this.add(Object.assign(this.base('start', lead, t, 1.5, 12.5, 45), { lap: 1 }));
      } else if (type === 'fastest' && data && this.idx.has(data)) {
        this.kill(this.fastEv); const j = this.idx.get(data);
        this.fastEv = this.add(Object.assign(this.base('fastest', j, t, 8.5, 2.5, 16 + (data.isPlayer ? 24 : 0)), { time: race.fastest ? race.fastest.time : data.bestLap, lap: data.lapsDone }));
      } else if (type === 'leaderFinished' && data && this.idx.has(data)) {
        const j = this.idx.get(data); let margin = null, second = -1;
        for (const c of this.cars) { if (c === data) continue; if (second < 0 || c.dist > this.cars[second].dist) second = this.idx.get(c); }
        if (second >= 0) { const c2 = this.cars[second]; margin = Math.max(0, (data.dist - c2.dist) / Math.max(20, c2.v)); }
        const close = margin != null && margin < 1.0;
        this.add(Object.assign(this.base('finish', j, t, 7.5, 4.5, 60), { lap: race.laps, b: close ? second : -1, margin }));
      } else if (type === 'finished' && data && data.isPlayer && this.idx.has(data) && !(race.order && race.order[0] === data && data.pos === 1)) {
        const j = this.idx.get(data); this.add(Object.assign(this.base('pfinish', j, t, 6, 3, 26), { lap: race.laps, pos: data.pos }));
      } else if (type === 'pitStop' && data && data.car && this.idx.has(data.car)) {
        const c = data.car, j = this.idx.get(c); const st = +data.time || 2.5;
        const sc = (c.isPlayer ? 14 : 3) + (c.pos <= 3 ? 6 : 0) + (st < 2.4 ? 4 : 0);
        this.add(Object.assign(this.base('pit', j, t, st + 3, 3, sc), { time: st, tyre: data.tyre }));
      }
    }

    sortField() {
      const ord = this.ord, cars = this.cars; for (let j = 0; j < this.nc; j++) ord[j] = j;
      for (let i = 1; i < this.nc; i++) { let k = i; while (k > 0 && cars[ord[k]].dist > cars[ord[k - 1]].dist) { const u = ord[k]; ord[k] = ord[k - 1]; ord[k - 1] = u; k--; } }
      this.sorted = true;
    }

    detect() {
      const race = this.race; if (!race.started) return; if (!this.sorted) this.sortField();
      const cars = this.cars, nc = this.nc, t = this.rt, tr = this.track, ord = this.ord;
      // ---- per car: pit lane, contacts, barrier hits, spins, offs, lap-1 gains
      for (let j = 0; j < nc; j++) {
        const c = cars[j]; const inPit = !!(c.pit && c.pit.active); if (inPit) this.pitT[j] = t;
        const fin = c.finished, av = Math.abs(c.v);
        if (!fin && c.hit > this.hitP[j] + 0.1 && c.hit >= 0.25) this.contact(j, c.hit);
        this.hitP[j] = c.hit;
        if (!fin && c.wallHit > this.wallP[j] + 0.15 && c.wallHit >= 0.5 && t - this.wallT[j] > 6) this.wall(j, c.wallHit);
        this.wallP[j] = c.wallHit;
        if (!fin && !inPit && av > 3 && c.trk && c.trk.i >= 0 && t - this.spinT[j] > 10) { const rel = Math.abs(U.wrapAngle(c.heading - tr.heading[c.trk.i])); if (rel > 1.45) this.spin(j); }
        if (!fin && !inPit && c.offTrack > 0.6 && av > 12 && t - this.offT[j] > 12 && t - this.spinT[j] > 4) this.off(j);
        if (!this.lap1[j] && c.lapsDone >= 1) {
          this.lap1[j] = 1; if (this.lap1Leader < 0) this.lap1Leader = j;
          const gain = (c.gridPos || c.pos) - c.pos; if (gain > this.bestGain || (gain === this.bestGain && gain > 0 && c.isPlayer)) { this.bestGain = gain; this.gainCar = j; }
          if (this.startEv) { this.startEv.focus = this.gainCar; this.startEv.gain = this.bestGain; this.startEv.leader = this.lap1Leader; }
        }
      }
      // ---- the running order by race distance: each swap of the insertion sort is a pass
      for (let i = 1; i < nc; i++) { let k = i; while (k > 0 && cars[ord[k]].dist > cars[ord[k - 1]].dist) { const up = ord[k]; ord[k] = ord[k - 1]; ord[k - 1] = up; this.swap(up, ord[k]); k--; } }
      for (const p of this.pend) if (p.on && t - p.t >= 1.5) { p.on = false; if (cars[p.a].dist > cars[p.b].dist) this.pass(p); }
      // ---- closeness to the car ahead, side by side
      for (let i = 1; i < nc; i++) {
        const j = ord[i], a = ord[i - 1], c = cars[j], ca = cars[a]; if (c.finished || ca.finished) continue;
        const d = ca.dist - c.dist;
        if (this.closeTo[j] !== a) { this.closeTo[j] = a; this.closeT[j] = 0; }
        if (d < Math.max(c.v, 20) * 1.0) this.closeT[j] += STEP; else this.closeT[j] = Math.max(0, this.closeT[j] - 2 * STEP);
        if (d < 5.5 && c.v > 20 && ca.v > 20 && !(c.pit && c.pit.active) && !(ca.pit && ca.pit.active)) { const dl = Math.abs(c.trk.lat - ca.trk.lat); if (dl > 1.3 && dl < 7) this.sbsTouch(j, a); }
      }
      for (let j = 0; j < nc; j++) { const p = this.sbsP[j]; if (p > j && t - this.sbsL[j] > 0.6) this.sbsEndPair(j, p); }
      // ---- near misses: a big speed difference at very close quarters without contact
      for (let j = 0; j < nc; j++) {
        const c = cars[j]; if (c.finished || (c.pit && c.pit.active)) continue;
        for (let k = j + 1; k < nc; k++) {
          const o = cars[k]; const dx = o.x - c.x; if (dx > 3.6 || dx < -3.6) continue; const dz = o.z - c.z; if (dz > 3.6 || dz < -3.6) continue;
          if (dx * dx + dz * dz > 12.25 || o.finished || (o.pit && o.pit.active)) continue;
          const rv = Math.abs(c.v - o.v); if (rv < 9 || c.hit > 0.05 || o.hit > 0.05) continue;
          if (t - this.nmLast[j] < 6 || t - this.nmLast[k] < 6) continue;
          this.nmK[j] = k; this.nmT[j] = t; this.nmV[j] = rv; this.nmLast[j] = this.nmLast[k] = t;
        }
        const k = this.nmK[j];
        if (k >= 0 && t - this.nmT[j] >= 0.6) {
          this.nmK[j] = -1;
          if (this.conT[j] < this.nmT[j] - 0.3 && this.conT[k] < this.nmT[j] - 0.3) {
            const fast = cars[j].v > cars[k].v ? j : k, slow = fast === j ? k : j, rv = this.nmV[j], cf = cars[fast], cs = cars[slow];
            const sc = 10 + Math.min(16, (rv - 9) * 1.2) + posBonus(Math.min(cf.pos, cs.pos)) + (cf.isPlayer || cs.isPlayer ? 20 : 0);
            this.add(Object.assign(this.base('nearmiss', fast, this.nmT[j], 5, 3.5, sc), { b: slow, s: cf.trk.s }));
          }
        }
      }
    }

    swap(up, dn) {
      const cars = this.cars, cu = cars[up], cd = cars[dn]; if (cu.finished || cd.finished) return;
      for (const p of this.pend) if (p.on && p.a === dn && p.b === up) { p.on = false; return; }   // swapped straight back: no pass
      for (const p of this.pend) if (p.on && p.a === up && p.b === dn) return;
      let p = null; for (const q of this.pend) if (!q.on) { p = q; break; } if (!p) return;
      p.on = true; p.a = up; p.b = dn; p.t = this.rt; p.s = cu.trk.s; p.drs = !!cu.drsOpen; p.va = cu.v; p.vb = cd.v; p.close = this.closeT[up]; p.lapsDone = cu.lapsDone;
    }
    pass(p) {
      const cars = this.cars, t = this.rt, a = p.a, b = p.b, ca = cars[a], cb = cars[b], tr = this.track;
      if (t - this.pitT[a] < 14 || t - this.pitT[b] < 14) return;                       // a pit-cycle swap: in the lane or just out of it
      if (p.vb < 12 || p.vb < p.va * 0.55 || p.t - this.incT[b] < 4) return;            // past a car that crashed, spun or stopped
      const lap1 = p.lapsDone === 0; const posNew = ca.pos;
      let kMax = 0; for (let d = -60; d <= 40; d += 10) { const k = Math.abs(tr.k[tr.idxAtS(p.s + d)]); if (k > kMax) kMax = k; }
      const corner = kMax > 1 / 180;
      const sbs = this.sbsP[a] === b || (this.sbsLastP[a] === b && t - this.sbsEnd[a] < 5);
      const repass = this.passBy[a] === b && p.t - this.passByT[a] < 12;
      let sc = 22 + Math.min(14, p.close * 1.4) + (sbs ? 10 : 0) + (corner ? 8 : p.drs ? -4 : 0) + posBonus(posNew) * 1.5 + (posNew === 1 ? 12 : 0) + (Math.abs(p.va - p.vb) < 4 ? 5 : 0) + (repass ? 10 : 0);
      if (ca.lap >= this.race.laps && !lap1) sc += 8;
      if (lap1) sc *= 0.6;
      if (ca.isPlayer) sc += 30; else if (cb.isPlayer) sc += 22;
      this.passBy[b] = a; this.passByT[b] = p.t;
      this.add(Object.assign(this.base('pass', a, p.t, 6.5, 3.5, sc), { b, s: p.s, pos: posNew, drs: p.drs, corner, sbs, repass, lap: p.lapsDone + 1 }));
    }
    sbsTouch(j, a) {
      const t = this.rt;
      if (this.sbsP[j] === a) { this.sbsL[j] = this.sbsL[a] = t; return; }
      if (this.sbsP[j] >= 0 || this.sbsP[a] >= 0) return;
      this.sbsP[j] = a; this.sbsP[a] = j; this.sbsT0[j] = this.sbsT0[a] = t; this.sbsL[j] = this.sbsL[a] = t;
    }
    sbsEndPair(j, k) {
      const t0 = this.sbsT0[j], t1 = this.sbsL[j], dur = t1 - t0; const cars = this.cars;
      this.sbsP[j] = this.sbsP[k] = -1; this.sbsLastP[j] = k; this.sbsLastP[k] = j; this.sbsEnd[j] = this.sbsEnd[k] = this.rt;
      if (dur < 1.6) return;
      const cj = cars[j], ck = cars[k]; const lead = cj.dist >= ck.dist ? j : k, other = lead === j ? k : j; const cl = cars[lead], co = cars[other];
      const top = Math.min(cl.pos, co.pos);
      let sc = 16 + Math.min(18, dur * 4) + posBonus(top) * 1.5 + (top === 1 ? 8 : 0) + (cl.isPlayer || co.isPlayer ? 24 : 0);
      if (cl.lapsDone === 0) sc *= 0.7;
      const pre = Math.min(t1 - t0 + 2, 10);
      this.add(Object.assign(this.base('battle', other, t1, pre, 2.5, sc), { b: lead, t0, dur, pos: top, s: co.trk.s }));
    }
    contact(j, str) {
      const cars = this.cars, c = cars[j], t = this.rt; let best = -1, bd = 30.25;
      for (let k = 0; k < this.nc; k++) { if (k === j) continue; const o = cars[k]; const dx = o.x - c.x, dz = o.z - c.z, d2 = dx * dx + dz * dz; if (d2 < bd && o.hit > 0.15) { bd = d2; best = k; } }
      if (best < 0) return;
      if (t - this.conT[j] < 3 && this.conP[j] === best) { const e = this.conEv[j]; if (e && !e.dead) e.str = Math.max(e.str, str); return; }
      this.conT[j] = this.conT[best] = t; this.conP[j] = best; this.conP[best] = j; this.incT[j] = this.incT[best] = t;
      if (str < 0.3) return;
      const o = cars[best]; let sc = 8 + 26 * str + posBonus(Math.min(c.pos, o.pos)) + (c.isPlayer || o.isPlayer ? 24 : 0); if (c.lapsDone === 0) sc *= 0.8;
      const ev = this.add(Object.assign(this.base('contact', j, t, 5, 4, sc), { b: best, str }));
      this.conEv[j] = this.conEv[best] = ev;
    }
    wall(j, w) {
      const c = this.cars[j], t = this.rt; this.wallT[j] = t; this.incT[j] = t;
      this.add(this.base('wall', j, t, 5, 4, 10 + 16 * Math.min(1, w) + posBonus(c.pos) + (c.isPlayer ? 22 : 0)));
    }
    spin(j) {
      const c = this.cars[j], t = this.rt; this.spinT[j] = t; this.incT[j] = t;
      this.add(this.base('spin', j, t - 0.6, 5, 4, 18 + posBonus(c.pos) + (c.isPlayer ? 26 : 0)));
    }
    off(j) {
      const c = this.cars[j], t = this.rt; this.offT[j] = t; this.incT[j] = t;
      this.add(this.base('off', j, t - 0.6, 5, 3.5, 6 + posBonus(c.pos) * 0.5 + (c.isPlayer ? 10 : 0)));
    }

    // ---- the reel: the best moments, one per kept window, in race order
    reel(maxN) {
      maxN = maxN || 8; const cand = [];
      for (const e of this.events) { if (e.dead || !e.slot || e.slot.n < 2 * HZ) continue; const c = clipFor(e, this); if (c) cand.push(c); }
      cand.sort((a, b) => b.ev.score - a.ev.score);
      // one clip per stretch of footage: a clip may not repeat more than ~40 % of one already in the reel
      const clash = (c, pick) => { for (const q of pick) { const o = Math.min(c.c1, q.c1) - Math.max(c.c0, q.c0); if (o > 0.4 * Math.min(c.c1 - c.c0, q.c1 - q.c0)) return true; } return false; };
      const pick = [];
      for (const c of cand) if ((c.type === 'start' || c.type === 'finish') && !clash(c, pick)) pick.push(c);
      // variety: a pair (or a type) already in the reel counts for less the next time
      const pairK = (e) => (e.b >= 0 ? Math.min(e.a, e.b) * 64 + Math.max(e.a, e.b) : e.a * 64 + 63);
      while (pick.length < maxN) {
        let bi = null, bs = -1;
        for (const c of cand) {
          const e = c.ev; if (pick.indexOf(c) >= 0 || clash(c, pick)) continue; let s = e.score;
          let inc = 0; for (const q of pick) { if (pairK(q.ev) === pairK(e)) s *= 0.6; if (q.type === e.type && e.type !== 'pass') s *= 0.75; if (INCIDENT[q.type]) inc++; }
          if (INCIDENT[e.type] && inc >= 3) continue;   // at most three incidents: the reel is about the racing
          if (s > bs) { bs = s; bi = c; }
        }
        if (!bi || bs < 8 || (bs < 16 && pick.length >= 5)) break; pick.push(bi);
      }
      const rank = (c) => (c.type === 'finish' ? 2 : c.type === 'pfinish' ? 1 : 0);   // race order, the flag last
      pick.sort((a, b) => (rank(a) - rank(b)) || (a.c0 - b.c0)); return pick;
    }
    stats() {
      let used = 0; for (const s of this.slots) if (s.used) used++;
      const ev = {}; for (const e of this.events) if (!e.dead) ev[e.type] = (ev[e.type] || 0) + 1;
      return { bytes: this.bytes, mb: +(this.bytes / 1048576).toFixed(2), samples: this.samples, costMs: +this.cost.toFixed(2), usPerSample: this.samples ? +(this.cost * 1000 / this.samples).toFixed(1) : 0, slotsUsed: used, events: ev, recT: +this.rt.toFixed(1) };
    }
  }

  // ------------------------------------------------------------------ clips: time range, caption and camera plan per moment
  const TEAMC = (c) => (c && c.team && c.team.primary) || '#888';
  function cornerName(track, s) { try { return track.cornerNameAt ? track.cornerNameAt(U.mod(s, track.length)) : ''; } catch (e) { return ''; } }
  function clipFor(e, rec) {
    const sl = e.slot, st = sl.st, T0 = st.t[0], T1 = st.t[sl.n - 1]; const cars = rec.cars, ca = cars[e.a], cb = e.b >= 0 ? cars[e.b] : null;
    const tr = rec.track, race = rec.race; let c0, c1, kick, title; const nm = (c) => '<b style="--c:' + TEAMC(c) + '">' + esc(code(c)) + '</b>';
    const verb = (c, a, b) => (isYou(c) ? a : b);
    const where = cornerName(tr, e.s); const lapK = 'Lap ' + e.lap + (where ? ' · ' + where : '');
    switch (e.type) {
      case 'pass': c0 = e.t - 5; c1 = e.t + 3; kick = lapK;
        title = e.pos === 1 ? nm(ca) + verb(ca, ' take the lead from ', ' takes the lead from ') + nm(cb) : nm(ca) + verb(ca, ' pass ', ' passes ') + nm(cb) + ' for P' + e.pos;
        if (e.repass) title = nm(ca) + verb(ca, ' hit back on ', ' hits back on ') + nm(cb) + (e.pos === 1 ? ' for the lead' : ' for P' + e.pos);
        break;
      case 'battle': c0 = Math.max(e.t0 - 1.5, e.t - 8.5); c1 = e.t + 2; kick = lapK; title = 'Side by side · ' + nm(cb) + ' and ' + nm(ca) + ' fight for ' + (e.pos === 1 ? 'the lead' : 'P' + e.pos); break;
      case 'start': c0 = e.t - 1; c1 = e.t + 9.5; kick = 'Lap 1 · Lights out';
        if (e.gain >= 2 && e.focus >= 0) title = nm(cars[e.focus]) + verb(cars[e.focus], ' gain ', ' gains ') + e.gain + ' places on the opening lap';
        else title = nm(cars[e.leader >= 0 ? e.leader : e.a]) + verb(cars[e.leader >= 0 ? e.leader : e.a], ' lead', ' leads') + ' into ' + esc(cornerName(tr, tr.sf + 250) || 'turn 1');
        break;
      case 'finish': c0 = e.t - 5.5; c1 = e.t + 3.5; kick = 'Lap ' + race.laps + ' · Chequered flag';
        title = nm(ca) + verb(ca, ' win the ', ' wins the ') + esc(tr.name) + ' Grand Prix' + (e.margin != null && e.margin < 1 ? ' by ' + e.margin.toFixed(3) + ' s' : ''); break;
      case 'pfinish': c0 = e.t - 5; c1 = e.t + 2.5; kick = 'Lap ' + race.laps + ' · Finish'; title = nm(ca) + ' ' + verb(ca, 'finish', 'finishes') + ' P' + e.pos; break;
      case 'fastest': c0 = e.t - 6.5; c1 = e.t + 1.5; kick = 'Fastest lap · Lap ' + Math.max(1, e.lap); title = nm(ca) + ' · ' + U.fmtTime(e.time); break;
      case 'contact': c0 = e.t - 4; c1 = e.t + 3.5; kick = lapK; title = 'Contact · ' + nm(ca) + ' and ' + nm(cb); break;
      case 'nearmiss': c0 = e.t - 4; c1 = e.t + 3; kick = lapK; title = 'Close call · ' + nm(ca) + verb(ca, ' squeeze past ', ' squeezes past ') + nm(cb); break;
      case 'wall': c0 = e.t - 4; c1 = e.t + 3.5; kick = lapK; title = nm(ca) + verb(ca, ' hit the barrier', ' hits the barrier'); break;
      case 'spin': c0 = e.t - 3.5; c1 = e.t + 4; kick = lapK; title = nm(ca) + verb(ca, ' spin', ' spins') + (where ? ' at ' + esc(where) : ''); break;
      case 'off': c0 = e.t - 3.5; c1 = e.t + 3; kick = lapK; title = nm(ca) + verb(ca, ' run wide', ' runs wide'); break;
      case 'pit': c0 = e.t - (e.time || 2.5) - 2.5; c1 = e.t + 2.5; kick = 'Lap ' + e.lap + ' · Pit stop'; title = nm(ca) + ' · ' + (e.time || 0).toFixed(1) + ' s' + (e.tyre ? ' · ' + esc(e.tyre[0].toUpperCase() + e.tyre.slice(1)) + 's' : ''); break;
      default: return null;
    }
    c0 = Math.max(c0, T0); c1 = Math.min(c1, T1); if (c1 - c0 < 3) return null;
    return { ev: e, slot: sl, c0, c1, key: clamp(e.t, c0, c1), kick: esc(kick), title, type: e.type };
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  EI.ReplayCore = { Recorder, Store, HZ, code };   // node harness / tests

  // ------------------------------------------------------------------ playback
  if (typeof document === 'undefined') { EI.Replay = { attach() {}, detach() {}, onResults() {} }; return; }
  const R = {
    rec: null, host: null, playing: false, clips: [], ci: 0, pt: 0, paused: false, cam: null, focus: { x: 0, y: 0, z: 0 }, eye: { trk: { s: -1e9 } },
    audio: { rpm: 0.2, thr: 0, vol: 0, gear: 1 }, lights: 0, spots: null, spotsFor: null, ui: null, autoT: -1, saved: null, shot: -1, cur: 0, fade: 0, pad: {},
    get camera() { return this.cam; },
    bind(host) { this.host = host; },
    attach(race) {
      this.detach(); if (!race || !race.cars || !race.cars.length) return;
      const rec = this.rec = new Recorder(race);
      const up = race.update, em = race.emit;
      race.update = function (dt, inputs) { const r = up.call(this, dt, inputs); rec.step(dt); return r; };
      race.emit = function (type, data) { try { rec.onEvent(type, data); } catch (e) { if (typeof console !== 'undefined') console.warn('replay', e); } return em.call(this, type, data); };
      this.btnState(false);
    },
    detach() { if (this.playing) this.stop(true); this.rec = null; this.clips = []; this.autoT = -1; if (this._autoTimer) { clearTimeout(this._autoTimer); this._autoTimer = null; } this.btnState(false); },
    stats() { return this.rec ? this.rec.stats() : null; },
    // the results card is up: offer the reel (and play it on its own once, unless automated / turned off)
    onResults(race) {
      if (!this.rec || this.rec.race !== race) return;
      this.rec.frozen = true; for (const sl of this.rec.slots) sl.open = false;   // the kept windows are final: nothing can evict them now
      this.clips = this.rec.reel(8); this.btnState(this.clips.length > 0);
      let auto = true; try { auto = localStorage.getItem('ei-hl-auto') !== '0'; } catch (e) { }
      if (typeof navigator !== 'undefined' && navigator.webdriver && !/[?&]hl=auto/.test(location.search)) auto = false;
      if (auto && this.clips.length) this._autoTimer = setTimeout(() => { this._autoTimer = null; if (this.rec && this.rec.race === race && !this.playing && !document.getElementById('results').classList.contains('hidden')) this.play(); }, 1800);
    },
    btnState(on) {
      const res = document.getElementById('results'); if (!res) return; let b = document.getElementById('btn-highlights');
      if (!b) {
        const again = document.getElementById('btn-again'); if (!again || !again.parentNode) return;
        b = document.createElement('button'); b.id = 'btn-highlights'; b.type = 'button'; b.className = 'hl-btn'; b.innerHTML = '<span class="hl-play"></span>Highlights';
        again.parentNode.insertBefore(b, again.nextSibling); b.addEventListener('click', () => this.play());
      }
      b.classList.toggle('hidden', !on);
    },

    play(from) {
      if (this.playing || !this.rec || !this.host) return false;
      if (!this.clips.length) this.clips = this.rec.reel(8); if (!this.clips.length) return false;
      if (this._autoTimer) { clearTimeout(this._autoTimer); this._autoTimer = null; }
      this.rec.frozen = true;
      for (const sl of this.rec.slots) sl.open = false;
      if (!this.cam) this.cam = new THREE.PerspectiveCamera(50, 1, 0.1, 6000);
      // save what playback overwrites on the cars
      this.saved = this.rec.cars.map(c => ({ v: c.v, steer: c.steer, brake: c.brake, throttle: c.throttle, drsOpen: c.drsOpen, ersActive: c.ersActive, aLat: c.aLat, aLong: c.aLong, gradeNow: c.gradeNow, surface: c.surface }));
      this.ensureUI(); document.body.classList.add('hl-on'); this.ui.root.classList.remove('hidden'); document.getElementById('results').classList.add('hidden');
      this.playing = true; this.paused = false; this.padSeed = true; this.host.enter(this.cam);
      window.addEventListener('keydown', this._key, true);
      this.go(from || 0); return true;
    },
    stop(quiet) {
      if (!this.playing) return; this.playing = false; window.removeEventListener('keydown', this._key, true);
      const cars = this.rec ? this.rec.cars : []; if (this.saved) cars.forEach((c, j) => Object.assign(c, this.saved[j])); this.saved = null;
      if (this.lights && this.rec && this.rec.track.setStartLights) this.rec.track.setStartLights(0); this.lights = 0;
      if (this.ui) this.ui.root.classList.add('hidden'); document.body.classList.remove('hl-on');
      if (this.host) this.host.exit(quiet);
      if (!quiet) { const r = document.getElementById('results'); if (r) r.classList.remove('hidden'); }
    },
    next() { if (this.ci + 1 >= this.clips.length) this.stop(); else this.go(this.ci + 1); },
    prev() { this.go(Math.max(0, this.pt - this.clips[this.ci].c0 > 1.5 ? this.ci : this.ci - 1)); },
    go(i) {
      this.ci = i; const c = this.clips[i]; this.pt = c.c0; this.cur = 0; this.shot = -1; this.fade = 1; c.shots = c.shots || planShots(c, i, this);
      const u = this.ui; u.kick.innerHTML = c.kick; u.title.innerHTML = c.title; u.count.textContent = (i + 1) + ' / ' + this.clips.length; u.cap.classList.remove('show'); this.capT = 0;
      u.dots.innerHTML = this.clips.map((x, k) => '<i class="' + (k < i ? 'done' : k === i ? 'on' : '') + '"></i>').join('');
    },
    _key: null,

    // per frame (main.js): pose the cars at the playhead, place the camera
    update(dt) {
      if (!this.playing) return; this.nf = (this.nf || 0) + 1; this.pollPad();
      const c = this.clips[this.ci]; if (!c) { this.stop(); return; }
      const slow = (c.type === 'contact' || c.type === 'spin' || c.type === 'nearmiss' || c.type === 'wall') && Math.abs(this.pt - c.key) < 0.9 ? 0.45 : 1;
      const step = this.paused ? 0 : dt * slow; this.pt += step;
      if (this.pt >= c.c1) { this.next(); if (!this.playing) return; return this.update(0); }
      this.pose(c.slot, this.pt, step);
      const lights = c.type === 'start' && this.pt < c.ev.t ? 5 : 0; if (lights !== this.lights && this.rec.track.setStartLights) { this.lights = lights; this.rec.track.setStartLights(lights); }
      let si = 0; for (let k = 0; k < c.shots.length; k++) if (this.pt >= c.shots[k].t0) si = k;
      const snap = si !== this.shot; this.shot = si; shotCamera(this, c, c.shots[si], snap, dt);
      // caption in after a beat, progress bar, the dip to black between clips
      this.capT += dt; if (this.capT > 0.35) this.ui.cap.classList.add('show');
      this.ui.bar.style.transform = 'scaleX(' + clamp((this.pt - c.c0) / (c.c1 - c.c0), 0, 1).toFixed(4) + ')';
      this.fade = Math.max(0, this.fade - dt * 3.5); const endF = clamp(1 - (c.c1 - this.pt) / 0.25, 0, 1); const f = Math.max(this.fade, endF);
      if (Math.abs(f - (this._f || 0)) > 0.01) { this._f = f; this.ui.dip.style.opacity = f.toFixed(3); }
    },
    // interpolate every car between the two samples around time t and drive its visuals
    pose(sl, t, dt) {
      const st = sl.st, nc = st.nc, n = sl.n; let i = this.cur; if (i >= n - 1 || st.t[i] > t) i = 0;
      while (i < n - 2 && st.t[i + 1] <= t) i++; this.cur = i;
      const t0 = st.t[i], t1 = st.t[i + 1]; const u = clamp(t1 > t0 ? (t - t0) / (t1 - t0) : 0, 0, 1); const a0 = i * nc, b0 = (i + 1) * nc;
      const cars = this.rec.cars;
      for (let j = 0; j < nc; j++) {
        const c = cars[j], p = a0 + j, q = b0 + j; let w = u;
        const dx = st.x[q] - st.x[p], dz = st.z[q] - st.z[p]; if (dx * dx + dz * dz > 900) w = u < 0.5 ? 0 : 1;   // a jump (pit release): no smear
        const h0 = st.h[p] / HQ, h1 = st.h[q] / HQ;
        c.vx = st.x[p] + dx * w; c.vy = st.y[p] + (st.y[q] - st.y[p]) * w; c.vz = st.z[p] + dz * w; c.vh = U.wrapAngle(h0 + U.wrapAngle(h1 - h0) * w);
        c.v = (st.v[p] + (st.v[q] - st.v[p]) * w) / 100; c.steer = (st.st[p] + (st.st[q] - st.st[p]) * w) / 127;
        c.throttle = (st.th[p] + (st.th[q] - st.th[p]) * w) / 255; c.brake = (st.br[p] + (st.br[q] - st.br[p]) * w) / 255;
        c.aLat = (st.al[p] + (st.al[q] - st.al[p]) * w) / 2; c.aLong = (st.ao[p] + (st.ao[q] - st.ao[p]) * w) / 2; c.gradeNow = (st.gr[p] + (st.gr[q] - st.gr[p]) * w) / 1000;
        const fl = w < 0.5 ? st.fl[p] : st.fl[q]; c.drsOpen = !!(fl & 1); c.ersActive = !!(fl & 2); c.surface = SURF[(fl >> 3) & 7] || 'asphalt';
        c.updateVisual(dt);
      }
    },
    // engine note of the car on screen
    sound(c, d) {
      const G = EI.CAR && EI.CAR.GEARS; const av = Math.abs(c.v); let g = 0; if (G) while (g < G.length - 1 && av > G[g]) g++;
      const lo = !G || g === 0 ? 0 : G[g - 1], hi = G ? G[g] : 90; const A = this.audio;
      A.gear = av < 0.5 ? 0 : g + 1; A.rpm = av < 0.5 ? 0.15 : 0.38 + 0.62 * clamp((av - lo) / (hi - lo), 0, 1); A.thr = c.throttle; A.vol = clamp(26 / Math.max(1, d), 0.12, 1) * (this.paused ? 0 : 1);
    },
    pollPad() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : null; if (!pads) return;
      for (const p of pads) {
        if (!p) continue; const B = p.buttons, b = (k) => !!(B[k] && B[k].pressed);
        const m = (b(0) ? 1 : 0) | (b(1) ? 2 : 0) | (b(14) || b(4) ? 4 : 0) | (b(15) || b(5) ? 8 : 0) | (b(9) ? 16 : 0); const e = this.padSeed ? 0 : m & ~(this.pad[p.index] | 0); this.pad[p.index] = m;
        if (e & 9) this.next(); else if (e & 4) this.prev(); else if (e & 18) { this.stop(); return; }
      }
      this.padSeed = false;   // buttons already held when the reel starts do not count
    },
    ensureUI() {
      if (this.ui) return;
      const css = document.createElement('style'); css.id = 'hl-css'; css.textContent = CSS; document.head.appendChild(css);
      const root = document.createElement('div'); root.id = 'hl'; root.className = 'hl hidden';
      root.innerHTML = '<div class="hl-dip"></div><div class="hl-top"><span class="hl-tag"><i></i>Highlights</span><span class="hl-count"></span><span class="hl-dots"></span></div>' +
        '<div class="hl-cap"><div class="hl-kick"></div><div class="hl-title"></div><div class="hl-bar"><i></i></div></div>' +
        '<div class="hl-ctl"><button type="button" data-a="prev" title="Previous (&#8592;)">&#8249;</button><button type="button" data-a="pause" title="Pause (Space)">&#10073;&#10073;</button><button type="button" data-a="next" title="Next (&#8594;)">Next &#8250;</button><button type="button" data-a="exit" title="Exit (Esc)">Exit</button></div>';
      (document.getElementById('app') || document.body).appendChild(root);
      const q = (s) => root.querySelector(s);
      this.ui = { root, kick: q('.hl-kick'), title: q('.hl-title'), cap: q('.hl-cap'), bar: q('.hl-bar i'), count: q('.hl-count'), dots: q('.hl-dots'), dip: q('.hl-dip'), pauseB: q('[data-a=pause]') };
      root.addEventListener('click', (e) => { const a = e.target.closest && e.target.closest('button'); if (!a) return; e.stopPropagation(); this.act(a.dataset.a); a.blur(); });
      this._key = (e) => {
        if (!this.playing) return; const k = e.code;
        if (k === 'KeyM') return;   // mute stays the game's
        e.stopImmediatePropagation(); e.preventDefault();
        if (k === 'ArrowRight' || k === 'KeyN' || k === 'Enter' || k === 'NumpadEnter') this.act('next'); else if (k === 'ArrowLeft') this.act('prev');
        else if (k === 'Space' || k === 'KeyK') this.act('pause'); else if (k === 'Escape' || k === 'Backspace' || k === 'KeyQ') this.act('exit');
      };
    },
    act(a) {
      if (!this.playing) return;
      if (a === 'next') this.next(); else if (a === 'prev') this.prev(); else if (a === 'exit') this.stop();
      else if (a === 'pause') { this.paused = !this.paused; this.ui.pauseB.innerHTML = this.paused ? '&#9654;' : '&#10073;&#10073;'; }
    },
  };

  // ------------------------------------------------------------------ cameras
  // trackside TV spots: the scenery's camera towers / scaffolds when exposed (scenery.infra.camSpots), plus tower-like spots
  // every ~90 m on the outside of the coming bend (circuits: beyond the wall, ~8 m up; street circuits: on the fence line)
  function spots(P) {
    const tr = P.rec.track; if (P.spots && P.spotsFor === tr) return P.spots;
    const out = [], L = tr.length, street = !!(tr.data && tr.data.street);
    const inf = P.host && P.host.scenery && P.host.scenery.infra; const cs = (inf && inf.camSpots) || towerSpots(inf);
    if (cs && cs.length) for (const p of cs) { const pr = tr.project(p.x, p.z, null, {}); out.push({ x: p.x, y: p.y, z: p.z, s: pr.s, tower: true }); }
    const pit = tr.pitSideSign ? tr.pitSideSign() : -1;
    for (let s = 0; s < L; s += 90) {
      const i = tr.idxAtS(s); let ks = 0; for (let d = 0; d <= 160; d += 10) ks += tr.k[tr.idxAtS(s + d)];
      const side = Math.abs(ks) < 0.02 ? -pit : ks > 0 ? -1 : 1;
      const wall = side < 0 ? tr.wallL[i] : tr.wallR[i];
      const off = street ? wall + 0.6 : Math.min(wall + 5, tr.halfWidth + 32); const h = street ? 5.2 : 8;
      out.push({ x: tr.x[i] + tr.nx[i] * side * off, y: tr.y[i] + h, z: tr.z[i] + tr.nz[i] * side * off, s, tower: false });
    }
    P.spots = out; P.spotsFor = tr; return out;
  }
  // the TV towers and camera scaffolds js/infra.js built: their placement is deterministic (want list -> freeSpot -> reserve), so each
  // one is found again from its reservation [s, side, 4] and re-derived with the builder's own numbers (deck height, camera on top)
  function towerSpots(cx) {
    if (!cx || !cx.reserved || !cx.at || !cx.t) return null; const t = cx.t, out = [], F = cx.F || {};
    const DS = [0, 15, -15, 30, -30, 45, -45, 60, -60, 80, -80, 100, -100];
    const find = (s, side) => { for (const ds of DS) for (const r of cx.reserved) if (r[1] === side && r[2] === 4 && r[0] === s + ds) return s + ds; return null; };
    try {
      let placed = 0;
      for (const [s, which] of F.cameraTowers || [[3160, 1], [3900, 1], [5075, 1], [5705, -1], [2010, 1], [965, 1], [460, 1]]) {
        const i = t.idxAtS(s + 20); const side = which > 0 ? -cx.outsideSide(i) : cx.outsideSide(i); const ps = find(s, side); if (ps == null) continue;
        const p = cx.at(ps, side, 5.5); const H = 9 + (placed % 3) * 1.5; placed++;
        // Silverstone (QA r3, Village): the eye sat inside the tower's top cage, so its own lattice filled the foreground: put it just in
        // front of the platform (towards the track) and a metre higher
        const sv = t.data && t.data.id === 'silverstone'; const fo = sv ? 2.6 : 0.85, fu = sv ? 2.7 : 1.7;
        out.push({ x: p.x - p.nx * fo, y: p.y + H + fu, z: p.z - p.nz * fo });
      }
      let sc = 0;
      for (const s0 of F.scaffolds || [610, 1130, 1960, 2470, 3470, 3790, 4230, 5290, 5560, 760, 2860]) {
        const side = cx.outsideSide(t.idxAtS(s0 + 20)); const ps = find(s0, side); if (ps == null) continue;
        const p = cx.at(ps, side, 4.2); const Hh = 2.4 + (sc % 3) * 0.6; sc++;
        // Silverstone (QA r3): the 3.6 m catch fence stands 2.5 m in front of the scaffold, so the eye (~4-5 m) looked through its posts and rail:
        // lift it 1.4 m clear of the fence top there
        const fy = t.data && t.data.id === 'silverstone' && t.fenceH ? p.y + t.fenceH(t.idxAtS(ps), side, (t.data.fence && t.data.fence.h) || 3.4) + 1.4 : -1e9;
        out.push({ x: p.x - p.nx * 0.95, y: Math.max(p.y + Hh + 1.5, fy), z: p.z - p.nz * 0.95 });
      }
    } catch (e) { return out; }
    return out;
  }
  function pickSpot(P, s, x, z, wantAhead) {
    const tr = P.rec.track, L = tr.length; let best = null, bs = 1e9;
    for (const p of spots(P)) {
      let ds = U.mod(p.s - s + L / 2, L) - L / 2; if (ds < -80 || ds > 200) continue;
      const d = Math.hypot(p.x - x, p.z - z); if (d < 18 || d > 260) continue;
      const sc = Math.abs(ds - (wantAhead == null ? 70 : wantAhead)) + (p.tower ? -25 : 0) + Math.abs(d - 70) * 0.3;
      if (sc < bs) { bs = sc; best = p; }
    }
    if (!best) { const i = tr.idxAtS(s + 60); best = { x: tr.x[i] + tr.nx[i] * (tr.halfWidth + 8), y: tr.y[i] + 6, z: tr.z[i] + tr.nz[i] * (tr.halfWidth + 8), s: s + 60 }; }
    return best;
  }
  // the camera plan of a clip: 2-3 shots cut on the action
  function planShots(c, i, P) {
    const e = c.ev, k = c.key, a = e.a, b = e.b, L = c.c1 - c.c0, cars = P.rec.cars; const sh = [];
    const S = (t0, kind, car, extra) => sh.push(Object.assign({ t0: Math.max(c.c0, t0), kind, car, car2: -1 }, extra || {}));
    const at = (j, t) => { const sl = c.slot, st = sl.st; let i0 = 0; while (i0 < sl.n - 1 && st.t[i0 + 1] <= t) i0++; const q = i0 * st.nc + j; return { x: st.x[q], z: st.z[q] }; };
    const sAt = (j, t) => { const p = at(j, t); return P.rec.track.project(p.x, p.z, null, {}).s; };
    const tv = (t0, j, j2, tKey, ahead) => { const p = at(j, tKey); S(t0, 'tv', j, { car2: j2, spot: pickSpot(P, sAt(j, tKey), p.x, p.z, ahead) }); };
    const v = i % 3;
    switch (e.type) {
      case 'pass':
        if (v === 0) { S(c.c0, 'chase', a); tv(k - 1.4, a, b, k + 0.5, 60); }
        else if (v === 1) { S(c.c0, 'onboard', a); tv(k - 1.0, a, b, k + 0.5, 70); }
        else { S(c.c0, 'heli', a, { car2: b }); tv(k - 1.5, a, b, k, 50); }
        break;
      case 'battle': S(c.c0, 'heli', a, { car2: b }); tv(c.c0 + L * 0.5, a, b, c.c0 + L * 0.75, 60); break;
      case 'start': { const f = e.focus >= 0 ? e.focus : a; S(c.c0, 'grid', a); S(e.t + 4.2, 'chase', f); break; }
      case 'finish': S(c.c0, 'chase', a); S(k - 2.2, 'tv', a, { car2: b, spot: lineSpot(P) }); S(k + 1.4, 'heli', a); break;
      case 'pfinish': S(c.c0, 'chase', a); S(k - 1.6, 'tv', a, { spot: lineSpot(P) }); break;
      case 'fastest': S(c.c0, 'onboard', a); S(k - 2.4, 'tv', a, { spot: lineSpot(P) }); break;
      case 'contact': case 'nearmiss': tv(c.c0, a, b, k, 40); S(k + 1.3, v === 1 ? 'onboard' : 'chase', b >= 0 ? b : a); break;
      case 'spin': case 'wall': case 'off': tv(c.c0, a, -1, k, 40); S(k + 1.6, 'heli', a); break;
      case 'pit': S(c.c0, 'heli', a); break;
      default: S(c.c0, 'chase', a);
    }
    return sh;
  }
  // the finish line camera: beside the track opposite the pit wall, ~40 m before the line, looking down the straight
  function lineSpot(P) {
    const tr = P.rec.track, side = -(tr.pitSideSign ? tr.pitSideSign() : -1), i = tr.idxAtS(tr.sf + 35); const wall = side < 0 ? tr.wallL[i] : tr.wallR[i];
    const street = !!(tr.data && tr.data.street); const off = street ? wall + 0.5 : Math.min(wall + 6, tr.halfWidth + 22);
    return { x: tr.x[i] + tr.nx[i] * side * off, y: tr.y[i] + (street ? 5.5 : 9.5), z: tr.z[i] + tr.nz[i] * side * off, s: tr.sf + 35 };
  }
  const _v = typeof THREE !== 'undefined' ? new THREE.Vector3() : null, _w = typeof THREE !== 'undefined' ? new THREE.Vector3() : null;
  function shotCamera(P, c, sh, snap, dt) {
    const cam = P.cam, cars = P.rec.cars, A = cars[sh.car], B = sh.car2 >= 0 ? cars[sh.car2] : null, tr = P.rec.track; const cs = P.cs || (P.cs = { lx: 0, ly: 0, lz: 0, fov: 40, yaw: 0, px: 0, py: 0, pz: 0, ang: 0 });
    const ax = A.vx, ay = A.vy, az = A.vz, ah = A.vh, fx = Math.cos(ah), fz = Math.sin(ah);
    let tx = ax, ty = ay, tz = az, sep = 0;
    if (B) { const d = Math.hypot(B.vx - ax, B.vz - az); if (d < 45) { tx = (ax + B.vx) / 2; ty = (ay + B.vy) / 2; tz = (az + B.vz) / 2; sep = d; } }
    const aspect = cam.aspect || 1.7; let focusCar = A, camD = 5;
    if (sh.kind === 'tv') {
      const p = sh.spot; cam.position.set(p.x, p.y, p.z);
      const lead = 0.12 * A.v; const gx = tx + fx * lead, gy = ty + 0.7, gz = tz + fz * lead;
      const k = snap ? 1 : 1 - Math.exp(-dt * 7); cs.lx += (gx - cs.lx) * k; cs.ly += (gy - cs.ly) * k; cs.lz += (gz - cs.lz) * k;
      _v.set(cs.lx, cs.ly, cs.lz); cam.up.set(0, 1, 0); cam.lookAt(_v);
      const d = Math.hypot(cs.lx - p.x, cs.ly - p.y, cs.lz - p.z); const W = 16 + sep * 1.2; const hf = 2 * Math.atan(W / 2 / Math.max(d, 1)); const vf = 2 * Math.atan(Math.tan(hf / 2) / aspect) * 180 / Math.PI;
      const fv = clamp(vf, 3.5, 50); cs.fov = snap ? fv : cs.fov + (fv - cs.fov) * (1 - Math.exp(-dt * 3)); cam.fov = cs.fov; camD = d;
    } else if (sh.kind === 'grid') {
      // the start: high beside the track ahead of pole, looking back down the grid, then panning with the leader into turn 1
      const g0 = tr.gridSlot(0), i = g0.i, side = -(tr.pitSideSign ? tr.pitSideSign() : -1), street = !!(tr.data && tr.data.street);
      const wall = side < 0 ? tr.wallL[i] : tr.wallR[i]; const off = street ? wall + 0.5 : Math.min(wall + 4, tr.halfWidth + 16);
      const j = tr.idxAtS(tr.s[i] + 70); cam.position.set(tr.x[j] + tr.nx[j] * side * off, tr.y[j] + (street ? 9 : 13), tr.z[j] + tr.nz[j] * side * off);
      const gm = tr.gridSlot(Math.min(cars.length - 1, 7)); const u = U.smoothstep(c.ev.t + 0.5, c.ev.t + 4, P.pt);
      const gx = U.lerp((g0.x + gm.x) / 2, ax + fx * 0.15 * A.v, u), gz = U.lerp((g0.z + gm.z) / 2, az + fz * 0.15 * A.v, u), gy = U.lerp(g0.y, ay, u) + 0.6;
      const k = snap ? 1 : 1 - Math.exp(-dt * 5); cs.lx += (gx - cs.lx) * k; cs.ly += (gy - cs.ly) * k; cs.lz += (gz - cs.lz) * k;
      _v.set(cs.lx, cs.ly, cs.lz); cam.up.set(0, 1, 0); cam.lookAt(_v); cam.fov = U.lerp(34, 22, u); camD = cam.position.distanceTo(_v);
    } else if (sh.kind === 'heli') {
      const street = !!(tr.data && tr.data.street);
      if (snap) { cs.ang = 0.75; cs.px = tx; cs.py = ty; cs.pz = tz; const i = tr.idxAtS(A.trk ? A.trk.s : 0); cs.yaw = Math.atan2(tr.tz[i], tr.tx[i]); }
      const k = 1 - Math.exp(-dt * 2.2); cs.px += (tx - cs.px) * (snap ? 1 : k); cs.py += (ty - cs.py) * (snap ? 1 : k); cs.pz += (tz - cs.pz) * (snap ? 1 : k);
      cs.ang += dt * 0.07 * (P.paused ? 0 : 1);
      const back = 34, up = street ? 62 : 34, side = 22; const ya = cs.yaw;
      const bx = Math.cos(ya), bz = Math.sin(ya); const lx = bz, lz = -bx; const ca = Math.cos(cs.ang), sa = Math.sin(cs.ang);
      const ox = -bx * back * ca + lx * side * sa * 1.6, oz = -bz * back * ca + lz * side * sa * 1.6;
      cam.position.set(cs.px + ox, cs.py + up, cs.pz + oz); _v.set(cs.px + bx * 6, cs.py + 0.5, cs.pz + bz * 6); cam.up.set(0, 1, 0); cam.lookAt(_v);
      cam.fov = street ? 26 : 34; camD = Math.hypot(ox, up, oz);
    } else if (sh.kind === 'onboard') {
      // T-cam above the airbox, looking down the road over the driver's helmet
      const g = A.gradeNow || 0; cam.position.set(ax - fx * 0.55, ay + 1.32, az - fz * 0.55); _v.set(ax + fx * 30, ay + 0.55 + g * 30, az + fz * 30); cam.up.set(0, 1, 0); cam.lookAt(_v); cam.fov = 58; camD = 1.5;
    } else {
      // chase: the game's chase rig, a touch higher and wider
      const v = Math.abs(A.v); const dist = 6.2 + v * 0.012, h = 2.25 + v * 0.004;
      if (snap) cs.yaw = ah; cs.yaw += U.wrapAngle(ah - cs.yaw) * (snap ? 1 : 1 - Math.exp(-dt * 5));
      const cx = Math.cos(cs.yaw), cz = Math.sin(cs.yaw); cam.position.set(ax - cx * dist, ay + h, az - cz * dist);
      _v.set(ax + fx * 5.5, ay + 0.6, az + fz * 5.5); cam.up.set(0, 1, 0); cam.lookAt(_v); cam.fov = clamp(56 + v * 0.1, 56, 66); camD = dist;
    }
    cam.near = sh.kind === 'onboard' ? 0.06 : sh.kind === 'tv' ? 0.5 : 0.2; cam.updateProjectionMatrix();
    P.focus.x = tx; P.focus.y = ty; P.focus.z = tz;
    const pr = tr.project(cam.position.x, cam.position.z, P._eyeI, P._eyeP || (P._eyeP = {})); P._eyeI = pr.i; P.eye.trk.s = pr.dist < 40 ? pr.s : -1e9;
    P.sound(focusCar, camD);
  }

  const CSS = [
    'body.hl-on #viewports, body.hl-on #lights, body.hl-on #banner, body.hl-on #toasts, body.hl-on #pitui, body.hl-on #touch { display: none !important; }',
    '.hl { position: absolute; inset: 0; pointer-events: none; font-family: var(--font); color: var(--text); z-index: 30; }',
    '.hl-dip { position: absolute; inset: 0; background: #000; opacity: 1; }',
    '.hl-top { position: absolute; left: 22px; top: 18px; display: flex; align-items: center; gap: 12px; }',
    '.hl-tag { display: inline-flex; align-items: center; gap: 8px; padding: 5px 11px 5px 9px; background: rgba(8,10,14,0.72); border: 1px solid var(--line); border-radius: 4px; font-size: 11px; font-weight: 900; font-style: italic; letter-spacing: 2.5px; text-transform: uppercase; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }',
    '.hl-tag i { width: 8px; height: 8px; border-radius: 50%; background: var(--red); box-shadow: 0 0 8px rgba(225,6,0,0.8); }',
    '.hl-count { font-size: 11px; font-weight: 700; letter-spacing: 2px; color: var(--muted); font-variant-numeric: tabular-nums; }',
    '.hl-dots { display: inline-flex; gap: 4px; } .hl-dots i { width: 14px; height: 3px; border-radius: 2px; background: rgba(255,255,255,0.18); } .hl-dots i.done { background: rgba(255,255,255,0.5); } .hl-dots i.on { background: var(--red); }',
    '.hl-cap { position: absolute; left: 22px; bottom: 26px; max-width: min(640px, calc(100% - 44px)); padding: 10px 16px 12px; background: rgba(8,10,14,0.74); border: 1px solid var(--line); border-left: 3px solid var(--red); border-radius: 4px; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); opacity: 0; transform: translateY(6px); transition: opacity 0.35s, transform 0.35s; }',
    '.hl-cap.show { opacity: 1; transform: none; }',
    '.hl-kick { font-size: 10px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; color: var(--muted); margin-bottom: 3px; }',
    '.hl-title { font-size: 19px; font-weight: 600; letter-spacing: 0.3px; line-height: 1.25; }',
    '.hl-title b { font-weight: 900; font-style: italic; letter-spacing: 1px; } .hl-title b::before { content: ""; display: inline-block; width: 4px; height: 0.95em; margin: 0 6px -0.1em 0; border-radius: 1px; background: var(--c, #888); }',
    '.hl-bar { height: 2px; margin-top: 9px; background: rgba(255,255,255,0.12); overflow: hidden; border-radius: 1px; } .hl-bar i { display: block; height: 100%; background: rgba(255,255,255,0.7); transform-origin: 0 50%; transform: scaleX(0); }',
    '.hl-ctl { position: absolute; right: 22px; bottom: 26px; display: flex; gap: 8px; pointer-events: auto; }',
    '.hl-ctl button { padding: 9px 14px; font-size: 12px; letter-spacing: 2px; background: rgba(8,10,14,0.66); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }',
    '.hl-btn .hl-play { display: inline-block; width: 0; height: 0; border-left: 8px solid currentColor; border-top: 5px solid transparent; border-bottom: 5px solid transparent; margin-right: 9px; vertical-align: 0; }',
    '@media (max-width: 700px) { .hl-cap { bottom: 74px; left: 12px; } .hl-ctl { right: 12px; bottom: 16px; } .hl-title { font-size: 16px; } .hl-top { left: 12px; top: 12px; } }',
  ].join('\n');

  EI.Replay = R;
})();
