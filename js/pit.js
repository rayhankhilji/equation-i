// Equation I - pit lane: lane layout, boxes, garages and pit wall, animated crews, pit-stop logic, bot strategy and the pit HUD
// Hooks: Race constructor -> Pit.init(race); end of Race.update -> Pit.update(race, dt); AIDriver.update -> Pit.driveBot(); render loop -> Pit.frame(race, dt)
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  let LIMIT = 80 / 3.6;                    // pit lane speed limit (m/s): 80 km/h, 60 km/h at Monaco (set per circuit in buildLayout)
  const kmh = () => String(Math.round(LIMIT * 3.6));
  const FAST = -2.5, BOXO = 2.6;           // lateral offsets (towards the garages) of the fast lane and of the working lane
  const LANE_HW = 6.0, ROAD_HW = 4.2;      // half widths of the pit lane proper and of the entry / exit roads
  const GAR_FRONT = 7.8, GAR_D = 10, BOX_SP = 18, QUEUE_GAP = 8.6, STAND_O = -6.35;
  const WX = [1.75, 1.75, -1.85, -1.85], WZ = [-0.8, 0.8, -0.8, 0.8]; // wheel centres in car space (x forward, z right): FL FR RL RR
  const COMP = ['soft', 'medium', 'hard'];
  const Pit = { LIMIT };
  let L = null;   // static layout of the pit lane (per track)
  let V = null;   // static visuals + crew figures (built once, live in the scene across races)
  let R = null;   // per-race state

  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _c = new THREE.Color(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _nm = new THREE.Matrix3();
  const sstep = U.smoothstep;

  // ================================================================ layout
  function buildLayout(track) {
    const raw = track.data.pit; if (!raw || raw.length < 4) return null;
    LIMIT = (track.data.pitLimit || (track.data.id === 'monaco' ? 60 : 80)) / 3.6; Pit.LIMIT = LIMIT;
    const TL = track.length, hw = track.halfWidth, pr = {};
    const c0 = new THREE.CatmullRomCurve3(raw.map(p => new THREE.Vector3(p[0], 0, p[1])), false, 'centripetal'); c0.arcLengthDivisions = 8000;
    const n0 = Math.max(10, Math.round(c0.getLength() / 10)); const sp0 = c0.getSpacedPoints(n0);
    // lane -> circuit projection that keeps going forward: a fresh nearest-sample lookup can snap to another stretch that passes close
    // (Monaco: the pool, Rascasse and harbour sections lie beside the pit lane), so it is only taken when it moves on by less than
    // 450 m of lap and is nearer than the stretch the previous point was on; otherwise the lookup follows on from that point
    const pq = {}; let pl = null;
    const projLane = (x, z, out) => {
      track.project(x, z, null, out); if (!pl) { pl = { i: out.i, s: out.s }; return out; }
      track.project(x, z, pl.i, pq); const fwd = U.mod(out.s - pl.s, TL);
      if (!(fwd <= 450 && out.dist <= pq.dist)) { out.i = pq.i; out.s = pq.s; out.lat = pq.lat; out.along = pq.along; out.dist = pq.dist; }
      pl.i = out.i; pl.s = out.s; return out;
    };
    const orig = sp0.map(p => { projLane(p.x, p.z, pr); return { x: p.x, z: p.z, s: pr.s, lat: pr.lat }; });
    let sumLat = 0; for (const q of orig) sumLat += q.lat; const side = sumLat < 0 ? -1 : 1;
    const wallOf = (i) => side < 0 ? track.wallL[i] : track.wallR[i]; // wallL is the lat < 0 side
    // the pit lane proper runs parallel to the start / finish straight, beyond the circuit barrier and a strip for the pit wall stands
    const sA = U.mod(track.sf - 180, TL), span = 360;
    let maxWall = 0; for (let s = 0; s <= span; s += 4) maxWall = Math.max(maxWall, wallOf(track.idxAtS(sA + s)));
    const latC = maxWall + 2.9 + 0.35 + LANE_HW;
    const inWin = (s) => U.mod(s - (sA - 25), TL) < span + 65;
    const ctrl = []; let phase = 0; let straight0 = null, straight1 = null;
    for (const q of orig) {
      if (phase === 0) {
        if (inWin(q.s) && Math.abs(q.lat) < 60) {
          phase = 1;
          for (let s = 0; s <= span + 0.01; s += 20) { const i = track.idxAtS(sA + s); const p = new THREE.Vector3(track.x[i] + track.nx[i] * side * latC, 0, track.z[i] + track.nz[i] * side * latC); if (!straight0) straight0 = p; straight1 = p; ctrl.push(p); }
        } else ctrl.push(new THREE.Vector3(q.x, 0, q.z));
      } else if (phase === 1) { if (!inWin(q.s)) { phase = 2; ctrl.push(new THREE.Vector3(q.x, 0, q.z)); } }
      else ctrl.push(new THREE.Vector3(q.x, 0, q.z));
    }
    if (!straight0) return null;
    // the polyline ended inside the window (Monaco: the exit road rejoins within 40 m of the straight's end): keep its tail beyond the
    // straight so the lane still runs back to the circuit instead of stopping out in the lane
    if (phase === 1) for (const q of orig) { const k = U.mod(q.s - sA, TL); if (k > span + 6 && k < span + 60) ctrl.push(new THREE.Vector3(q.x, 0, q.z)); }
    const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal'); curve.arcLengthDivisions = 16000;
    pl = null; const len = curve.getLength(); const n = Math.round(len); const ds = len / n; const sp = curve.getSpacedPoints(n); const N = n + 1;
    const A = (T) => new T(N);
    const P = { n: N, ds, len, side, TL, x: A(Float32Array), z: A(Float32Array), y: A(Float32Array), tx: A(Float32Array), tz: A(Float32Array), gx: A(Float32Array), gz: A(Float32Array), s: A(Float32Array), lat: A(Float32Array), ti: A(Int32Array), k: A(Float32Array), vAuto: A(Float32Array), vCurv: A(Float32Array) };
    for (let i = 0; i < N; i++) { P.x[i] = sp[i].x; P.z[i] = sp[i].z; }
    for (let i = 0; i < N; i++) {
      const a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1); let dx = P.x[b] - P.x[a], dz = P.z[b] - P.z[a]; const l = Math.hypot(dx, dz) || 1; P.tx[i] = dx / l; P.tz[i] = dz / l;
      projLane(P.x[i], P.z[i], pr); P.s[i] = pr.s; P.lat[i] = pr.lat; P.ti[i] = pr.i;
    }
    // garage side: the right-hand normal (-tz, tx) or its opposite, whichever points away from the track along the straight
    const im = nearestIdx(P, straight0.x, straight0.z, 0, N);
    const gsign = ((-P.tz[im]) * track.nx[P.ti[im]] * side + P.tx[im] * track.nz[P.ti[im]] * side) > 0 ? 1 : -1; P.gsign = gsign;
    for (let i = 0; i < N; i++) { P.gx[i] = -P.tz[i] * gsign; P.gz[i] = P.tx[i] * gsign; }
    // elevation: track level near the circuit, following the terrain further out
    const sc = track.scenery; const yr = new Float32Array(N);
    for (let i = 0; i < N; i++) { const ty = track.y[P.ti[i]]; let y = ty; if (sc && sc.height) { const th = sc.height(P.x[i], P.z[i]); const w = sstep(wallOf(P.ti[i]) + 5, wallOf(P.ti[i]) + 30, Math.abs(P.lat[i])); y = ty + U.clamp(th - ty, -0.5, 3) * w; } yr[i] = y; }
    for (let i = 0; i < N; i++) { let a = 0, c = 0; for (let j = -8; j <= 8; j++) { const k = U.clamp(i + j, 0, N - 1); a += yr[k]; c++; } P.y[i] = a / c; }
    // curvature and speed profiles
    const head = new Float32Array(N); for (let i = 0; i < N; i++) head[i] = Math.atan2(P.tz[i], P.tx[i]);
    const kr = new Float32Array(N); for (let i = 1; i < N - 1; i++) kr[i] = U.wrapAngle(head[i + 1] - head[i - 1]) / (2 * ds);
    for (let i = 0; i < N; i++) { let a = 0, c = 0; for (let j = -6; j <= 6; j++) { const k = U.clamp(i + j, 0, N - 1); a += Math.abs(kr[k]); c++; } P.k[i] = a / c; }
    // anchors
    P.dA = nearestIdx(P, straight0.x, straight0.z, 0, N); P.dB = nearestIdx(P, straight1.x, straight1.z, P.dA, N);
    let dCap = 0; while (dCap < P.dA && Math.abs(P.lat[dCap]) < hw - 2) dCap++; P.dCap = dCap; P.sCap = P.s[dCap];
    let dRel = P.dB; while (dRel < N - 1 && Math.abs(P.lat[dRel]) > hw - 1.0) dRel++; P.dRel = dRel;
    let r0 = dCap; while (r0 < P.dA && Math.abs(P.lat[r0]) < hw + 0.6) r0++; P.dRoad0 = r0;
    let r1 = dRel; while (r1 > P.dB && Math.abs(P.lat[r1]) < hw + 0.6) r1--; P.dRoad1 = r1;
    P.dLimIn = P.dA + 15; P.dLimOut = P.dB - 15;
    const mid = (P.dLimIn + P.dLimOut) / 2; const NB = Math.max(10, EI.TEAMS.length); P.boxD = []; for (let k = 0; k < NB; k++) P.boxD.push(mid + ((NB - 1) / 2 - k) * BOX_SP);   // one box per entry (11 in 2026)
    P.garD0 = P.boxD[NB - 1] - BOX_SP / 2; P.garD1 = P.boxD[0] + BOX_SP / 2;
    // street circuit (Monaco): the limiter zone covers the garages only, not the whole straight (pit loss ~20 s)
    if (track.data.street) { P.dLimIn = Math.max(P.dLimIn, Math.round(P.garD0)); P.dLimOut = Math.min(P.dLimOut, Math.round(P.garD1)); }
    // circuits with a longer limiter zone than the 360 m straight window (Monza: the limit lines sit out on the entry and exit roads;
    // pit loss ~24 s). track.data.pitZonePad overrides the table.
    { const pad = track.data.pitZonePad != null ? track.data.pitZonePad : ({ monza: 35, spa: 40, cota: 40, mexico: 40 })[track.data.id] || 0;
      if (pad > 0 && !track.data.street) { P.dLimIn = Math.max(P.dRoad0 + 20, P.dLimIn - pad); P.dLimOut = Math.min(P.dRoad1 - 20, P.dLimOut + pad); } }
    // approach to the pit entry (Pit.driveBot): how far out a car lines up for it and how hard it brakes for the entry speed. Monaco's
    // entry comes straight out of Rascasse (already slow), so a short approach; elsewhere 430 m (measured pit loss ~19-21 s)
    P.appr = track.data.street ? 130 : 430; P.apprDec = track.data.street ? 24 : 14;
    P.latA = track.data.street ? 36 : 24; P.boxA = track.data.street ? 15 : 9; P.decA = 20; P.exitA = track.data.street ? 15 : 12;   // lane cornering, box stop / pull-away, braking for the limit line, pulling away after it (m/s2)
    const u = (s) => P.sCap + U.mod(s - P.sCap, TL);
    P.anch = [[dCap, P.sCap], [P.dA, u(P.s[P.dA])], [P.dB, u(P.s[P.dB])], [dRel, u(P.s[dRel])]];
    for (let k = 1; k < P.anch.length; k++) if (P.anch[k][1] <= P.anch[k - 1][1]) P.anch[k][1] = P.anch[k - 1][1] + (P.anch[k][0] - P.anch[k - 1][0]);
    for (let i = 0; i < N; i++) { const v = Math.min(78, Math.sqrt(P.latA / Math.max(P.k[i], 1e-4))); P.vCurv[i] = v; P.vAuto[i] = (i >= P.dLimIn && i <= P.dLimOut) ? Math.min(v, LIMIT) : v; }
    for (const arr of [P.vCurv, P.vAuto]) for (let i = N - 2; i >= 0; i--) arr[i] = Math.min(arr[i], Math.sqrt(arr[i + 1] * arr[i + 1] + 2 * P.decA * ds));
    // where the path passes through the circuit barrier (outside the straight): gaps get cut there
    P.gaps = []; let prev = null;
    for (let i = dCap; i < N; i++) { const t = Math.abs(P.lat[i]) - wallOf(P.ti[i]); const sg = t > 0; if (prev !== null && sg !== prev && (i < P.dA - 5 || i > P.dB + 5)) P.gaps.push([P.x[i], P.z[i]]); prev = sg; }
    P.orig = orig; P.hw = hw;
    return P;
  }
  function nearestIdx(P, x, z, a, b) { let best = a, bd = Infinity; for (let i = a; i < b; i++) { const d = (P.x[i] - x) ** 2 + (P.z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } } return best; }
  // interpolated path sample at distance d
  function pathAt(d, o) {
    o = o || {}; const f = U.clamp(d / L.ds, 0, L.n - 1.001); const i = Math.floor(f), t = f - i;
    o.x = U.lerp(L.x[i], L.x[i + 1], t); o.z = U.lerp(L.z[i], L.z[i + 1], t); o.y = U.lerp(L.y[i], L.y[i + 1], t);
    o.tx = U.lerp(L.tx[i], L.tx[i + 1], t); o.tz = U.lerp(L.tz[i], L.tz[i + 1], t); const l = Math.hypot(o.tx, o.tz) || 1; o.tx /= l; o.tz /= l;
    o.gx = -o.tz * L.gsign; o.gz = o.tx * L.gsign; o.i = i; return o;
  }
  function sEqAt(d) {
    const A = L.anch; if (d <= A[0][0]) return A[0][1] + (d - A[0][0]);
    for (let k = 1; k < A.length; k++) if (d <= A[k][0]) { const a = A[k - 1], b = A[k]; return a[1] + (b[1] - a[1]) * (d - a[0]) / Math.max(1e-6, b[0] - a[0]); }
    const z = A[A.length - 1]; return z[1] + (d - z[0]);
  }
  function sEqCar(st, d) { return sEqAt(d) + (st.sOff || 0) * Math.max(0, 1 - (d - st.d0) / 80); }
  const idxD = (d) => U.clamp(Math.round(d / L.ds), 0, L.n - 1);

  // ================================================================ geometry builder (merged, vertex coloured)
  const UNIT = {};
  function unit(name) {
    if (UNIT[name]) return UNIT[name];
    let g;
    if (name === 'box') g = new THREE.BoxGeometry(1, 1, 1);
    else if (name === 'cyl') g = new THREE.CylinderGeometry(1, 1, 1, 12, 1);
    else if (name === 'cyl6') g = new THREE.CylinderGeometry(1, 1, 1, 6, 1);
    else if (name === 'sph') g = new THREE.SphereGeometry(1, 10, 8);
    else if (name === 'sphL') g = new THREE.SphereGeometry(1, 7, 5);
    g = g.toNonIndexed(); UNIT[name] = { p: g.attributes.position.array, n: g.attributes.normal.array, uv: g.attributes.uv.array }; return UNIT[name];
  }
  class GB {
    constructor(uv) { this.p = []; this.n = []; this.c = []; this.u = uv ? [] : null; }
    add(name, m, color) {
      const src = unit(name); _nm.getNormalMatrix(m); const col = typeof color === 'object' ? color : _c.set(color).convertSRGBToLinear();
      const r = col.r, g = col.g, b = col.b;
      for (let i = 0; i < src.p.length; i += 3) {
        _v.set(src.p[i], src.p[i + 1], src.p[i + 2]).applyMatrix4(m); this.p.push(_v.x, _v.y, _v.z);
        _v.set(src.n[i], src.n[i + 1], src.n[i + 2]).applyMatrix3(_nm).normalize(); this.n.push(_v.x, _v.y, _v.z); this.c.push(r, g, b);
      }
      if (this.u) for (let i = 0; i < src.uv.length; i++) this.u.push(src.uv[i]);
    }
    // quad from 4 world points (a b c d counter-clockwise seen from the front) with uv rect [u0 v0 u1 v1]
    quad(a, b, c, d, color, uv) {
      _v.subVectors(b, a); _v2.subVectors(d, a); _v3.crossVectors(_v, _v2).normalize(); const col = typeof color === 'object' ? color : _c.set(color || 0xffffff).convertSRGBToLinear();
      for (const q of [a, b, c, a, c, d]) { this.p.push(q.x, q.y, q.z); this.n.push(_v3.x, _v3.y, _v3.z); this.c.push(col.r, col.g, col.b); }
      if (this.u) { const [u0, v0, u1, v1] = uv || [0, 0, 1, 1]; this.u.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1); }
    }
    geometry() {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      if (this.u) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2)); g.computeBoundingSphere(); return g;
    }
    mesh(mat) { return new THREE.Mesh(this.geometry(), mat); }
  }
  // frame on the path: origin at distance d, offset o towards the garages, height h; axes x = along the lane, y = up, z = right of travel
  function frameAt(d, o, h) {
    const p = pathAt(d); const m = new THREE.Matrix4();
    m.makeBasis(_v.set(p.tx, 0, p.tz), _v2.set(0, 1, 0), _v3.set(-p.tz, 0, p.tx)); m.setPosition(p.x + p.gx * o, p.y + (h || 0), p.z + p.gz * o); return m;
  }
  // local transform helper: base * T(x,y,z) * Ry(ry) * S(sx,sy,sz)
  const _t = new THREE.Matrix4(), _r = new THREE.Matrix4(), _s = new THREE.Matrix4();
  function lm(base, x, y, z, sx, sy, sz, ry, rx, rz) {
    const m = _m.copy(base).multiply(_t.makeTranslation(x, y, z));
    if (ry) m.multiply(_r.makeRotationY(ry)); if (rx) m.multiply(_r.makeRotationX(rx)); if (rz) m.multiply(_r.makeRotationZ(rz));
    return m.multiply(_s.makeScale(sx, sy, sz));
  }
  const col = (hex, k) => { const c = new THREE.Color(hex).convertSRGBToLinear(); if (k != null) c.multiplyScalar(k); return c; }; // sRGB hex -> linear (as Env.C)

  // ================================================================ textures
  function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t; }
  function decalAtlas() {
    // 5 x 4 cells of 256 x 128: rows 0-1 box decals (team short + box number), row 2: '80', 'PIT', 'PIT EXIT', 'LIMIT END', row 3 spare
    return canvasTex(1280, 512, (ctx) => {
      ctx.clearRect(0, 0, 1280, 512); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      EI.TEAMS.slice(0, 16).forEach((t, k0) => {
        const k = boxCell(k0), x = (k % 5) * 256, y = Math.floor(k / 5) * 128;
        ctx.fillStyle = t.primary; ctx.fillRect(x + 6, y + 6, 244, 116); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.strokeRect(x + 9, y + 9, 238, 110);
        ctx.fillStyle = t.accent === t.primary ? '#ffffff' : t.accent; ctx.font = 'italic 900 64px Arial Black, Arial'; ctx.fillText(t.short, x + 100, y + 66);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 186, y + 22, 52, 84); ctx.fillStyle = '#111'; ctx.font = '900 ' + (k0 >= 9 ? 40 : 56) + 'px Arial Black, Arial'; ctx.fillText(String(k0 + 1), x + 212, y + 66);
      });
      const cell = (k, fn) => { const x = (k % 5) * 256, y = Math.floor(k / 5) * 128; fn(x, y); };
      cell(10, (x, y) => { ctx.fillStyle = '#ffffff'; ctx.font = 'italic 900 100px Arial Black, Arial'; ctx.fillText(kmh(), x + 128, y + 68); });
      cell(11, (x, y) => { ctx.fillStyle = '#ffffff'; ctx.font = 'italic 900 100px Arial Black, Arial'; ctx.fillText('PIT', x + 128, y + 68); });
      cell(12, (x, y) => { ctx.fillStyle = '#ffffff'; ctx.font = 'italic 900 62px Arial Black, Arial'; ctx.fillText('EXIT', x + 128, y + 66); });
      cell(13, (x, y) => { ctx.fillStyle = '#ffd200'; ctx.font = 'italic 900 50px Arial Black, Arial'; ctx.fillText('LIMIT', x + 128, y + 66); });
    });
  }
  const boxCell = (k) => k < 10 ? k : k + 4;   // atlas cell of box k's decal (cells 10-13 hold the lane words)
  const cellUV = (k) => { const x = (k % 5) / 5, y = 1 - (Math.floor(k / 5) + 1) / 4; return [x, y, x + 0.2, y + 0.25]; };
  const SIGN_ROWS = () => Math.max(10, EI.TEAMS.length);
  function signAtlas() {
    // SIGN_ROWS rows of 1024 x (1024 / rows): garage facade signs, one per entry
    return canvasTex(1024, 1024, (ctx) => {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const rh = 1024 / SIGN_ROWS();
      EI.TEAMS.slice(0, SIGN_ROWS()).forEach((t, k) => {
        const y = k * rh; ctx.fillStyle = t.primary; ctx.fillRect(0, y, 1024, rh);
        ctx.fillStyle = t.secondary; ctx.fillRect(0, y + rh * 0.86, 1024, rh * 0.14); ctx.fillRect(0, y, 1024, 6);
        ctx.fillStyle = (t.accent === t.primary ? '#ffffff' : t.accent); ctx.font = 'italic 900 ' + Math.round(rh * 0.57) + 'px Arial Black, Arial'; ctx.fillText(t.name.toUpperCase(), 512, y + rh * 0.47, 1000);
      });
    });
  }
  function screenTex() {
    return canvasTex(512, 256, (ctx) => {
      ctx.fillStyle = '#05080e'; ctx.fillRect(0, 0, 512, 256);
      ctx.fillStyle = '#e10600'; ctx.fillRect(0, 0, 512, 22); ctx.fillStyle = '#fff'; ctx.font = '700 15px Arial'; ctx.fillText('LIVE TIMING  ·  SILVERSTONE', 10, 16);
      if (EI.Ads) { EI.Ads.lumiLogo(ctx, 372, 3, 16, '#fff'); EI.Ads.intakeLogo(ctx, 438, 3, 16, '#fff'); }
      const r = U.rng(77); const teams = EI.TEAMS;
      for (let i = 0; i < 10; i++) { const y = 30 + i * 22; ctx.fillStyle = i % 2 ? '#0d1320' : '#111a2b'; ctx.fillRect(0, y, 300, 21); ctx.fillStyle = teams[i % teams.length].primary; ctx.fillRect(28, y + 3, 5, 15); ctx.fillStyle = '#dfe6f2'; ctx.font = '700 13px Arial'; ctx.fillText(String(i + 1), 8, y + 15); ctx.fillText(teams[(i * 3) % teams.length].short + '  ' + (1 + r() * 9).toFixed(3), 40, y + 15); }
      ctx.strokeStyle = '#2fe36d'; ctx.lineWidth = 2; ctx.beginPath(); for (let x = 0; x < 200; x += 4) { const y = 80 + Math.sin(x * 0.07) * 30 + (r() - 0.5) * 16; x ? ctx.lineTo(310 + x, y) : ctx.moveTo(310, y); } ctx.stroke();
      ctx.strokeStyle = '#3ad7ff'; ctx.beginPath(); for (let x = 0; x < 200; x += 4) { const y = 180 + Math.cos(x * 0.05) * 26 + (r() - 0.5) * 10; x ? ctx.lineTo(310 + x, y) : ctx.moveTo(310, y); } ctx.stroke();
      ctx.strokeStyle = '#1d2a40'; ctx.lineWidth = 1; for (let y = 40; y < 250; y += 30) { ctx.beginPath(); ctx.moveTo(310, y); ctx.lineTo(510, y); ctx.stroke(); }
    });
  }

  // ================================================================ static visuals
  function buildVisuals(track, scene) {
    const grp = new THREE.Group(); grp.name = 'pitlane'; const street = !!track.data.street;
    const teams = EI.TEAMS; const GZ = L.gsign;
    // ---- lane surface (entry road, pit lane, exit road)
    {
      const pos = [], uv = [], idx = []; let vi = 0;
      const width = (d) => { const lane = sstep(L.dA - 40, L.dA, d) * (1 - sstep(L.dB, L.dB + 40, d)); const taper = Math.min(sstep(L.dRoad0 - 12, L.dRoad0 + 30, d), 1 - sstep(L.dRoad1 - 30, L.dRoad1 + 12, d)); return U.lerp(ROAD_HW, LANE_HW + 0.4, lane) * U.lerp(0.45, 1, taper); };
      const ext = (d) => { // the lane widens towards the garages and the pit wall in the straight
        const lane = sstep(L.dA - 40, L.dA, d) * (1 - sstep(L.dB, L.dB + 40, d)); return [-width(d) - lane * 0.3, width(d) + lane * 1.6];
      };
      const p = {};
      for (let d = L.dRoad0 - 12; d <= L.dRoad1 + 12; d += 2) {
        pathAt(d, p); const [a, b] = ext(d);
        pos.push(p.x + p.gx * a, p.y + 0.03, p.z + p.gz * a, p.x + p.gx * b, p.y + 0.03, p.z + p.gz * b); uv.push(0, d / 8, 1, d / 8);
        if (vi > 0) { const k = vi - 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } vi += 2;
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const nr = g.attributes.normal; for (let i = 0; i < nr.count; i++) nr.setXYZ(i, 0, 1, 0);
      const tex = U.grainTexture(256, 0x55565b, 0.07, 1, 14, 0.02); tex.repeat.set(1, 1);
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, ...(track.data.pitColor != null ? { color: track.data.pitColor } : {}) })); m.receiveShadow = true; grp.add(m);   // data.pitColor (COTA): tints the lane's grain texture down to the racing surface's tone under a strong sun
      V.laneExt = ext;
    }
    // ---- markings (vertex coloured, flat on the lane)
    {
      const gb = new GB(); const white = col(0xf2f2f2), yellow = col(0xffd200);
      const line = (d0, d1, o, w, c, dash) => { for (let d = d0; d < d1; d += dash ? dash * 2 : 2) { const l = Math.min(dash || 2, d1 - d); const f = frameAt(d + l / 2, o, 0.045); gb.add('box', lm(f, 0, 0, 0, l + 0.02, 0.01, w), c); } };
      const ext = V.laneExt;
      for (let d = L.dRoad0; d < L.dRoad1; d += 2) { const [a, b] = ext(d + 1); gb.add('box', lm(frameAt(d + 1, a + 0.12, 0.045), 0, 0, 0, 2.02, 0.01, 0.15), white); gb.add('box', lm(frameAt(d + 1, b - 0.12, 0.045), 0, 0, 0, 2.02, 0.01, 0.15), white); }
      // fast lane / working lane divider (yellow dashes on the street circuit, with a second row along the fast lane)
      if (street) { line(L.dLimIn, L.dLimOut, (FAST + BOXO) / 2 + 0.2, 0.16, yellow, 1.2); line(L.dLimIn, L.dLimOut, FAST - 2.2, 0.16, yellow, 1.2); }
      else line(L.dLimIn, L.dLimOut, (FAST + BOXO) / 2 + 0.2, 0.14, white, 3);
      // lane edges of the working lane in front of the garages
      line(L.garD0, L.garD1, LANE_HW - 0.1, 0.25, yellow);
      // pit entry line, speed limit lines (with the limit painted) and the exit line
      const across = (d, c, w) => { const [a, b] = ext(d); gb.add('box', lm(frameAt(d, (a + b) / 2, 0.046), 0, 0, 0, w, 0.01, b - a - 0.1), c); };
      across(L.dRoad0 + 4, white, 0.5); across(L.dLimIn, white, 0.45); across(L.dLimIn + 1.2, yellow, 0.2); across(L.dLimOut, white, 0.45); across(L.dLimOut - 1.2, yellow, 0.2); across(L.dRoad1 - 4, white, 0.5);
      // pit boxes: team coloured frame, stop bar and wheel marks
      L.boxD.forEach((d, k) => {
        const t = teams[k % teams.length]; const tc = col(t.primary); const f = frameAt(d, BOXO, 0.047);
        const bl = 7.4, bw = 3.5;
        if (street) {
          // the yellow T: a centre line along the box, the stop bar across its front, short ticks for the front wheels
          gb.add('box', lm(f, -0.4, 0, 0, bl - 0.8, 0.01, 0.2), yellow); gb.add('box', lm(f, bl / 2 - 0.4, 0, 0, 0.2, 0.012, 2.2), yellow);
          for (const sg of [-1, 1]) gb.add('box', lm(f, WX[0], 0.001, sg * 1.25, 0.9, 0.01, 0.16), yellow);
        } else {
        gb.add('box', lm(f, 0, 0, -bw / 2 * GZ, bl, 0.01, 0.22), tc); gb.add('box', lm(f, 0, 0, bw / 2 * GZ, bl, 0.01, 0.22), tc);
        gb.add('box', lm(f, -bl / 2, 0, 0, 0.22, 0.01, bw), tc); gb.add('box', lm(f, bl / 2, 0, 0, 0.3, 0.012, bw), white);
        for (let w = 0; w < 4; w++) gb.add('box', lm(f, WX[w], 0.001, WZ[w] * 1.0, 0.75, 0.01, 0.1), white);
        gb.add('box', lm(f, 0, -0.001, 0, bl - 0.2, 0.008, bw - 0.2), col(t.primary, 0.35).lerp(col(0x55565b), 0.6));
        }
      });
      const m = gb.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 })); m.receiveShadow = true; grp.add(m);
    }
    // ---- painted decals (atlas)
    {
      const tex = decalAtlas(); const gb = new GB(true); const p = {};
      const decal = (d, o, w, h, cell) => {
        // flat on the lane, reading for a driver arriving: the top of the texture points along the lane
        pathAt(d, p); const y = p.y + 0.06; const cx = p.x + p.gx * o, cz = p.z + p.gz * o;
        const ax = p.tx * h / 2, az = p.tz * h / 2, hx = -p.tz * w / 2, hz = p.tx * w / 2;
        const v0 = new THREE.Vector3(cx - ax - hx, y, cz - az - hz), v1 = new THREE.Vector3(cx - ax + hx, y, cz - az + hz), v2 = new THREE.Vector3(cx + ax + hx, y, cz + az + hz), v3 = new THREE.Vector3(cx + ax - hx, y, cz + az - hz);
        gb.quad(v0, v1, v2, v3, 0xffffff, cellUV(cell));
      };
      L.boxD.forEach((d, k) => decal(d + 4.6, BOXO, 3.2, 1.6, boxCell(k)));
      decal(L.dLimIn + 6, FAST, 3.6, 1.8, 10); decal(L.dLimIn + 6, BOXO, 3.6, 1.8, 10); decal(L.dRoad0 + 14, 0, 3.4, 1.7, 11); decal(L.dLimOut + 6, 0, 3.6, 1.8, 13); decal(L.dRoad1 - 30, 0, 3.4, 1.7, 12);
      const m = gb.mesh(new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -10 })); grp.add(m);
    }
    // ---- structures: pit wall, stands (pit wall gantries), garages
    const shell = new GB(), inner = new GB(), glow = new GB(), screens = new GB(true), signs = new GB(true);
    const concrete = col(0xd4d4d0), white = col(0xeceef1), dark = col(0x23262c), steel = col(0x9aa0a8), floorC = col(0xc9ccd2), glass = col(0x3e5a78), rubber = col(0x141416), black = col(0x0c0d10);
    // pit wall along the lane, from the limit line to past the exit line
    // (street circuit: grey concrete with a black partner board band on both faces, as the Monaco pit wall in the photos - MONACO-UPGRADE)
    for (let d = L.dA - 20; d < L.dB + 20; d += 4) { const pf = frameAt(d + 2, STAND_O, 0); gb4(shell, pf, 4.02, 1.05, 0.35, street ? concrete.clone().multiplyScalar(0.62) : concrete, 0.525); if (street) gb4(shell, pf, 4.04, 0.62, 0.39, col(0x17181c), 0.56); }
    // street circuit: the entry and exit roads are walled off from the circuit along their track-side edge (concrete wall, white
    // and red chevron board where each road splits from the track)
    if (street) {
      const ext = V.laneExt; const pp = {}, pr = {}; let walls = 0; const wallBoard = col(0x17181c);
      for (const [d0, d1, nose] of [[L.dRoad0 + 4, L.dA - 20, L.dRoad0 + 4], [L.dB + 20, L.dRoad1 - 4, L.dRoad1 - 4]]) {
        for (let d = d0; d < d1; d += 3) { const o = ext(d + 1.5)[0] - 0.35; pathAt(d + 1.5, pp); track.project(pp.x + pp.gx * o, pp.z + pp.gz * o, null, pr); if (pr.dist < track.halfWidth + 1.4) continue; const wf = frameAt(d + 1.5, o, 0); gb4(shell, wf, 3.02, 0.95, 0.4, concrete.clone().multiplyScalar(0.62), 0.475); gb4(shell, wf, 3.04, 0.62, 0.44, wallBoard, 0.5); walls++; }   // (MONACO-UPGRADE: grey concrete under a black partner board both sides, as the photos' walls, not a white slab)
        const o = ext(nose)[0] - 0.4; const f = frameAt(nose, o, 0); for (let k = 0; k < 4; k++) shell.add('box', lm(f, 0, 0.35 + k * 0.32, 0, 0.3, 0.3, 0.9), k & 1 ? col(0xf2f2f2) : col(0xc8102e));
      }
      L.entryWalls = walls;
    }
    function gb4(gb, f, lx, ly, lz, c, yc) { gb.add('box', lm(f, 0, yc, 0, lx, ly, lz), c); }
    const sZ = (o) => o * GZ; // local z for an offset towards the garages
    L.boxD.forEach((d, k) => {
      const t = teams[k % teams.length]; const tc = col(t.primary), sc2 = col(t.secondary);
      // ---- pit wall stand: platform, desk, monitors, chairs, canopy
      const f = frameAt(d, 0, 0); const o0 = STAND_O - 0.25, o1 = STAND_O - 2.6, oc = (o0 + o1) / 2, wz = Math.abs(o1 - o0);
      shell.add('box', lm(f, 0, 0.18, sZ(oc), 8.6, 0.36, wz), dark);
      shell.add('box', lm(f, 0, 0.82, sZ(o1 + 0.45), 8.2, 0.08, 0.8), col(0x30343c));                 // desk
      shell.add('box', lm(f, 0, 0.55, sZ(o1 + 0.45), 8.2, 0.45, 0.1), dark);
      for (let x = -3.6; x <= 3.6; x += 7.2) for (const oo of [o0 - 0.1, o1 + 0.1]) shell.add('box', lm(f, x, 1.8, sZ(oo), 0.12, 3.2, 0.12), steel); // posts
      shell.add('box', lm(f, 0, 3.4, sZ(oc), 9.0, 0.16, wz + 0.6), white);                          // canopy
      shell.add('box', lm(f, 0, 3.24, sZ(o0 + 0.2), 9.0, 0.3, 0.06), tc); shell.add('box', lm(f, 0, 3.24, sZ(o1 - 0.2), 9.0, 0.3, 0.06), tc);
      shell.add('box', lm(f, 0, 2.95, sZ(oc), 8.6, 0.08, 0.15), steel);                              // gantry truss
      for (let x = -3; x <= 3.01; x += 0.8) shell.add('box', lm(f, x, 3.0, sZ(oc), 0.05, 0.4, 0.05), steel);
      for (let j = 0; j < 4; j++) { const x = -2.7 + j * 1.8; screens.quad(...quadV(f, x - 0.45, 1.05, sZ(o1 + 0.62), 0.9, 0.55, GZ), 0xffffff, [0, 0, 1, 1]); inner.add('box', lm(f, x, 1.32, sZ(o1 + 0.58), 0.98, 0.62, 0.05), black); }
      for (let j = 0; j < 3; j++) { const x = -2.4 + j * 2.4; inner.add('box', lm(f, x, 0.62, sZ(o0 - 0.55), 0.5, 0.08, 0.5), dark); inner.add('box', lm(f, x, 0.95, sZ(o0 - 0.32), 0.5, 0.6, 0.06), dark); inner.add('box', lm(f, x, 0.45, sZ(o0 - 0.55), 0.06, 0.4, 0.06), steel); }
      // ---- traffic light rig over the box
      const lf = frameAt(d + 4.2, 0, 0); shell.add('box', lm(lf, 0, 1.9, sZ(GAR_FRONT - 1.0), 0.14, 3.8, 0.14), dark); shell.add('box', lm(lf, 0, 3.75, sZ((GAR_FRONT - 1.0 + BOXO - 0.6) / 2), 0.12, 0.12, GAR_FRONT - 1.0 - BOXO + 0.6), dark);
      shell.add('box', lm(lf, 0, 3.35, sZ(BOXO - 0.6), 0.3, 0.75, 0.3), black);
      V.lampPos.push([d + 4.2 - 0.16, 3.52, BOXO - 0.6], [d + 4.2 - 0.16, 3.18, BOXO - 0.6]);
      // ---- garage
      const gf = frameAt(d, GAR_FRONT, 0); const W = BOX_SP - 0.35, H = 4.8;
      inner.add('box', lm(gf, 0, 0.04, sZ(GAR_D / 2), W, 0.08, GAR_D), floorC);
      inner.add('box', lm(gf, 0, 0.085, sZ(GAR_D / 2 + 0.6), W - 3, 0.01, GAR_D - 3), col(t.primary, 0.25).lerp(floorC, 0.55));
      inner.add('box', lm(gf, 0, H / 2, sZ(GAR_D), W, H, 0.2), white);                                   // back wall
      inner.add('box', lm(gf, 0, 1.1, sZ(GAR_D - 0.12), W, 2.2, 0.06), tc);                                // team colour dado
      inner.add('box', lm(gf, 0, H - 0.05, sZ(GAR_D / 2), W, 0.1, GAR_D), col(0x5a5e66));                // ceiling
      for (const sg of [-1, 1]) inner.add('box', lm(gf, sg * BOX_SP / 2, H / 2, sZ(GAR_D / 2), 0.3, H, GAR_D), white); // partitions
      for (let x = -6; x <= 6; x += 4) glow.add('box', lm(gf, x, H - 0.14, sZ(GAR_D / 2), 0.25, 0.06, GAR_D - 1.5), col(0xfff6e6));
      // wall screen and timing screens on stands
      screens.quad(...quadV(gf, -2.2, 2.6, sZ(GAR_D - 0.15), 4.4, 1.9, -GZ), 0xffffff, [0, 0, 1, 1]);
      inner.add('box', lm(gf, 0, 3.55, sZ(GAR_D - 0.14), 4.7, 2.15, 0.05), black);
      for (const x of [-4.6, 4.6]) { inner.add('box', lm(gf, x, 0.8, sZ(GAR_D - 1.6), 0.08, 1.6, 0.08), steel); inner.add('box', lm(gf, x, 1.85, sZ(GAR_D - 1.6), 1.25, 0.75, 0.06), black); screens.quad(...quadV(gf, x - 0.58, 1.52, sZ(GAR_D - 1.64), 1.16, 0.66, -GZ), 0xffffff, [0, 0, 1, 1]); inner.add('box', lm(gf, x, 0.05, sZ(GAR_D - 1.6), 0.7, 0.1, 0.7), dark); }
      // engineers' desk at the back
      inner.add('box', lm(gf, 0, 0.78, sZ(GAR_D - 1.0), 3.8, 0.07, 0.8), col(0x2a2e36)); inner.add('box', lm(gf, 0, 0.4, sZ(GAR_D - 0.7), 3.6, 0.75, 0.08), dark);
      for (const x of [-1.2, 1.2]) { inner.add('box', lm(gf, x, 1.08, sZ(GAR_D - 1.25), 0.7, 0.45, 0.04), black); screens.quad(...quadV(gf, x - 0.32, 0.88, sZ(GAR_D - 1.28), 0.64, 0.4, -GZ), 0xffffff, [0, 0, 1, 1]); inner.add('box', lm(gf, x, 0.45, sZ(GAR_D - 2.15), 0.48, 0.08, 0.48), dark); }
      // tyre racks with blanketed sets
      for (const sg of [-1, 1]) {
        const x0 = sg * (BOX_SP / 2 - 1.1);
        for (const z of [2.4, 5.2]) {
          for (const y of [0.05, 0.95]) inner.add('box', lm(gf, x0, y + 0.02, sZ(z), 0.95, 0.04, 2.3), steel);
          for (const xx of [-0.42, 0.42]) for (const zz of [-1.1, 1.1]) inner.add('box', lm(gf, x0 + xx, 0.9, sZ(z + zz), 0.05, 1.8, 0.05), steel);
          for (const y of [0.06, 0.96]) for (let j = 0; j < 3; j++) { inner.add('cyl', lm(gf, x0, y + 0.36, sZ(z - 0.72 + j * 0.72), 0.36, 0.34, 0.36, 0, 0, Math.PI / 2), j % 2 ? sc2 : tc); }
        }
      }
      // tool trolleys, spare wing on a stand, jack and gun racks
      for (const [x, z, c2] of [[-5.2, 7.9, col(0xb3122b)], [-3.6, 7.9, col(0x1d1f24)], [3.8, 7.9, col(0xb3122b)], [5.4, 7.9, col(0x1d1f24)], [-2.6, 3.4, col(0x1d1f24)]]) {
        inner.add('box', lm(gf, x, 0.55, sZ(z), 1.0, 0.9, 0.56), c2); inner.add('box', lm(gf, x, 1.02, sZ(z), 1.04, 0.05, 0.6), steel);
        for (let y = 0.3; y < 0.95; y += 0.18) inner.add('box', lm(gf, x, y, sZ(z - 0.285), 0.9, 0.03, 0.01), steel);
        for (const xx of [-0.4, 0.4]) inner.add('cyl6', lm(gf, x + xx, 0.06, sZ(z), 0.06, 0.12, 0.06, 0, Math.PI / 2), rubber);
      }
      inner.add('box', lm(gf, 2.2, 0.55, sZ(4.2), 0.18, 1.1, 0.18), steel); inner.add('box', lm(gf, 2.2, 1.12, sZ(4.2), 0.6, 0.06, 2.0), tc); inner.add('box', lm(gf, 2.2, 1.0, sZ(4.2), 0.6, 0.25, 0.05), sc2);
      inner.add('box', lm(gf, -0.8, 1.0, sZ(GAR_D - 0.25), 3.0, 0.08, 0.2), steel);
      for (let j = 0; j < 4; j++) inner.add('box', lm(gf, -2.0 + j * 0.8, 0.86, sZ(GAR_D - 0.3), 0.14, 0.2, 0.36), col(0x2c2f35));
      if (street) {
        // temporary garages (street circuit): ribbed grey panels between the bays, the shutter rolled up under a white steel header
        // with the team band and sign, a glazed hospitality box above leaning out over the lane, a curved white canopy with a red edge
        const panel = col(0xaab0b6), hdr = col(0xf1f2f3), trussC = col(0xcfd3d7), gl = col(0x2d465e), redE = col(0xc8102e), chq = col(0x16171a);
        for (const sg of [-1, 1]) { shell.add('box', lm(gf, sg * (BOX_SP / 2 - 0.3), H / 2, sZ(0.05), 0.6, H, 0.4), panel); for (let y = 0.3; y < H; y += 0.3) shell.add('box', lm(gf, sg * (BOX_SP / 2 - 0.3), y, sZ(-0.17), 0.62, 0.04, 0.03), col(0x8c9298)); }
        shell.add('box', lm(gf, 0, H - 0.3, sZ(0.3), W - 1.0, 0.6, 0.55), panel);
        shell.add('box', lm(gf, 0, H + 0.7, sZ(GAR_D / 2), BOX_SP, 1.4, GAR_D + 0.3), hdr);
        shell.add('box', lm(gf, 0, H + 0.12, sZ(-0.2), BOX_SP, 0.22, 0.08), tc);
        for (let x = -BOX_SP / 2 + 0.5; x < BOX_SP / 2; x += 1.2) shell.add('box', lm(gf, x, H + 1.15, sZ(-0.2), 0.05, 0.5, 0.05), trussC);
        signs.quad(...quadV(gf, -W / 2 + 1.5, H + 0.28, sZ(-0.22), W - 3, 0.85, GZ), 0xffffff, [0, 1 - (k + 1) / SIGN_ROWS(), 1, 1 - k / SIGN_ROWS()]);
        const V3 = (x, y, z) => new THREE.Vector3(x, y, sZ(z)).applyMatrix4(gf); const yb = H + 1.4, yt = H + 5.2, zb = 0.1, zt = -1.5, xa = -W / 2 + 0.6, xb = W / 2 - 0.6;
        const both = (a, b, c, d, cc) => { shell.quad(a, b, c, d, cc); shell.quad(b, a, d, c, cc); };
        both(V3(xa, yb, zb), V3(xb, yb, zb), V3(xb, yt, zt), V3(xa, yt, zt), gl);
        for (const x of [xa, xb]) { both(V3(x, yb, zb), V3(x, yb, GAR_D * 0.6), V3(x, yt, GAR_D * 0.6), V3(x, yt, zt), gl); for (let f = 0.25; f < 1; f += 0.25) shell.add('box', lm(gf, xa + (xb - xa) * f, (yb + yt) / 2, sZ((zb + zt) / 2 - 0.02), 0.07, yt - yb + 0.1, 0.07, 0, -GZ * Math.atan2(zb - zt, yt - yb)), hdr); }
        shell.add('box', lm(gf, 0, yb + 0.05, sZ(GAR_D * 0.3), W - 0.8, 0.12, GAR_D * 0.6 + 0.3), hdr);
        // canopy: three slabs stepping down towards the back, a red trim on the leading edge, a chequered band below it
        for (const [z0, z1, y0] of [[-2.4, 0.4, yt + 0.55], [0.4, 3.4, yt + 0.85], [3.4, GAR_D * 0.75, yt + 0.95]]) shell.add('box', lm(gf, 0, y0, sZ((z0 + z1) / 2), BOX_SP - 0.2, 0.2, z1 - z0), hdr);
        shell.add('box', lm(gf, 0, yt + 0.48, sZ(-2.45), BOX_SP - 0.2, 0.32, 0.12), redE); shell.add('box', lm(gf, 0, yt + 0.22, sZ(-1.6), BOX_SP - 0.4, 0.14, 0.05), chq);
        shell.add('box', lm(gf, 0, yt + 0.25, sZ(GAR_D * 0.6), BOX_SP - 0.2, 0.6, 0.15), hdr);
      } else {
      // facade: header with the team sign, upper floor glass band, roof slab over the walkway (Monza: the building's own facade is
      // modelled by js/env_monza.js - EnvMonza.ownsPitFacade - and only the team sign is kept here)
      const ownF = EI.EnvMonza && EI.EnvMonza.ownsPitFacade && EI.EnvMonza.ownsPitFacade(track); if (!ownF) {
      shell.add('box', lm(gf, 0, H + 0.9, sZ(GAR_D / 2), BOX_SP, 1.8, GAR_D + 0.3), white); }
      signs.quad(...quadV(gf, -W / 2 + 1.5, H + 0.35, sZ(-0.17), W - 3, 1.15, GZ), 0xffffff, [0, 1 - (k + 1) / SIGN_ROWS(), 1, 1 - k / SIGN_ROWS()]);
      if (!ownF) {
      shell.add('box', lm(gf, 0, H + 3.4, sZ(GAR_D / 2 + 0.6), BOX_SP, 3.2, GAR_D - 1.0), glass);
      shell.add('box', lm(gf, 0, H + 5.15, sZ(GAR_D / 2 - 1.2), BOX_SP, 0.35, GAR_D + 3.6), white);
      shell.add('box', lm(gf, 0, H + 5.2, sZ(-2.9), BOX_SP, 0.5, 0.2), col(0xc8102e)); }
      }
    });
    // end walls of the garage block
    for (const [dd, sgn] of [[L.garD0, -1], [L.garD1, 1]]) { const gf = frameAt(dd, GAR_FRONT, 0); shell.add('box', lm(gf, sgn * 0.2, 5.0, sZ(GAR_D / 2), 0.4, 10, GAR_D + 0.3), white); }
    // signage boards: pit entry, limit, exit
    {
      // street circuit: the four boards share one canvas (one draw call); other circuits keep a texture per board
      const sbc = street ? document.createElement('canvas') : null, sbg = []; if (sbc) { sbc.width = 512; sbc.height = 512; }
      const board = street ? (d, o, text, bg, fg, w) => { const f = frameAt(d, o, 0); shell.add('box', lm(f, 0, 1.2, 0, 0.12, 2.4, 0.12), dark); const k = sbg.length; const tc = U.textTexture(text, { w: 512, h: 128, bg, color: fg, size: 64, font: 'italic 900 Arial Black, Arial' }); sbc.getContext('2d').drawImage(tc.image, 0, k * 128);
        const g = new THREE.PlaneGeometry(w, w / 4); const uv = g.attributes.uv; for (let v = 0; v < uv.count; v++) uv.setY(v, 1 - (k + 1 - uv.getY(v)) / 4); g.applyMatrix4(lm(f, 0.08, 2.6, 0, 1, 1, 1, -Math.PI / 2)); sbg.push(g); } :
        (d, o, text, bg, fg, w) => { const f = frameAt(d, o, 0); shell.add('box', lm(f, 0, 1.2, 0, 0.12, 2.4, 0.12), dark); const tx = U.srgb(U.textTexture(text, { w: 512, h: 128, bg, color: fg, size: 64, font: 'italic 900 Arial Black, Arial' })); const mm = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: tx, side: THREE.DoubleSide })); mm.applyMatrix4(lm(f, 0.08, 2.6, 0, 1, 1, 1, -Math.PI / 2)); grp.add(mm); };
      const ext = V.laneExt;
      board(L.dRoad0 - 30, ext(L.dRoad0)[1] + 1.2, 'PIT ENTRY', '#1a73e8', '#ffffff', 3.2);
      board(L.dLimIn - 4, ext(L.dLimIn)[1] + 0.8, 'PIT LIMIT ' + kmh(), '#ffffff', '#c8102e', 3.4);
      board(L.dLimOut + 4, ext(L.dLimOut)[1] + 0.8, 'END LIMIT', '#ffd200', '#111111', 3.0);
      board(L.dRoad1 - 50, ext(L.dRoad1 - 50)[1] + 1.2, 'PIT EXIT', '#1a73e8', '#ffffff', 3.0);
      if (sbg.length) { const geo = U.mergeGeometries(sbg.map(g => ({ geo: g, matrix: new THREE.Matrix4() }))); const tx = new THREE.CanvasTexture(sbc); tx.encoding = THREE.sRGBEncoding; grp.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tx, side: THREE.DoubleSide }))); }
    }
    const shellM = shell.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 })); shellM.castShadow = true; shellM.receiveShadow = true; grp.add(shellM);
    // garage interiors are lit: a little emissive and the full environment so faces turned away from the sun are not black
    const innerM = inner.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, emissive: 0x2c2d31 })); innerM.castShadow = false; innerM.receiveShadow = false; innerM.userData.keepEnv = true; grp.add(innerM);
    grp.add(glow.mesh(new THREE.MeshBasicMaterial({ vertexColors: true })));
    const scrTex = screenTex(); grp.add(screens.mesh(new THREE.MeshBasicMaterial({ map: scrTex, toneMapped: false })));
    const signM = signs.mesh(new THREE.MeshBasicMaterial({ map: signAtlas() })); grp.add(signM);
    return grp;
  }
  // vertical quad in a frame: lower-left corner at (x, y, z) local, width w along local x, height h, facing +z (face = +1) or -z (face = -1)
  function quadV(f, x, y, z, w, h, face) {
    const a = new THREE.Vector3(x, y, z), b = new THREE.Vector3(x + w, y, z), c = new THREE.Vector3(x + w, y + h, z), d = new THREE.Vector3(x, y + h, z);
    for (const q of [a, b, c, d]) q.applyMatrix4(f);
    return face > 0 ? [a, b, c, d] : [b, a, d, c];
  }

  // ================================================================ figures (instanced, procedurally posed)
  const POSES = {
    stand: { h: 0.95, sp: 0.04, hd: 0, hy: 0, shL: 0.12, shR: 0.12, abL: 0.1, abR: 0.1, elL: 0.25, elR: 0.25, hpL: 0, hpR: 0, knL: 0.05, knR: 0.05 },
    ready: { h: 0.8, sp: 0.42, hd: -0.3, hy: 0, shL: 0.75, shR: 0.75, abL: 0.15, abR: 0.15, elL: 0.6, elR: 0.6, hpL: 0.55, hpR: 0.55, knL: 0.8, knR: 0.8 },
    kneel: { h: 0.56, sp: 0.3, hd: -0.2, hy: 0, shL: 1.25, shR: 1.3, abL: 0.05, abR: 0.0, elL: 0.35, elR: 0.3, hpL: 1.45, hpR: -0.15, knL: 1.5, knR: 1.6 },
    crouch: { h: 0.64, sp: 0.75, hd: -0.5, hy: 0, shL: 1.05, shR: 1.05, abL: 0.25, abR: 0.25, elL: 0.3, elR: 0.3, hpL: 1.2, hpR: 1.2, knL: 1.6, knR: 1.6 },
    carry: { h: 0.93, sp: 0.1, hd: 0, hy: 0, shL: 0.6, shR: 0.6, abL: 0.32, abR: 0.32, elL: 0.95, elR: 0.95, hpL: 0, hpR: 0, knL: 0.12, knR: 0.12 },
    seat: { h: 0.52, sp: -0.04, hd: 0.05, hy: 0, shL: 0.55, shR: 0.55, abL: 0.12, abR: 0.12, elL: 1.0, elR: 1.0, hpL: 1.5, hpR: 1.5, knL: 1.5, knR: 1.5 },
    jack: { h: 0.9, sp: 0.38, hd: -0.2, hy: 0, shL: 1.05, shR: 1.05, abL: 0.12, abR: 0.12, elL: 0.2, elR: 0.2, hpL: 0.25, hpR: -0.15, knL: 0.35, knR: 0.15 },
    pull: { h: 0.86, sp: -0.15, hd: 0.1, hy: 0, shL: 0.55, shR: 0.55, abL: 0.1, abR: 0.1, elL: 0.1, elR: 0.1, hpL: 0.5, hpR: -0.25, knL: 0.55, knR: 0.1 },
    armup: { h: 0.95, sp: 0.0, hd: 0.1, hy: 0, shL: 0.15, shR: 2.9, abL: 0.1, abR: 0.15, elL: 0.25, elR: 0.1, hpL: 0, hpR: 0, knL: 0.05, knR: 0.05 },
    crossed: { h: 0.95, sp: 0.02, hd: 0, hy: 0, shL: 0.45, shR: 0.45, abL: -0.35, abR: -0.35, elL: 2.0, elR: 2.0, hpL: 0, hpR: 0.12, knL: 0.05, knR: 0.12 },
    lean: { h: 0.9, sp: 0.6, hd: -0.3, hy: 0, shL: 1.1, shR: 1.1, abL: 0.2, abR: 0.2, elL: 0.5, elR: 0.5, hpL: 0.1, hpR: -0.1, knL: 0.1, knR: 0.1 },
  };
  const PK = Object.keys(POSES.stand);
  function blendPose(a, b, t, out) { for (const k of PK) out[k] = a[k] + (b[k] - a[k]) * t; return out; }
  function copyPose(a, out) { for (const k of PK) out[k] = a[k]; return out; }
  function walkPose(ph, run, out) {
    const a = run ? 0.8 : 0.42, s = Math.sin(ph);
    out.h = 0.93 - (run ? 0.06 : 0) + 0.03 * Math.cos(2 * ph); out.sp = run ? 0.25 : 0.06; out.hd = 0; out.hy = 0;
    out.hpL = a * s; out.hpR = -a * s; out.knL = 0.1 + (run ? 1.2 : 0.6) * Math.max(0, Math.sin(ph - 1.3)); out.knR = 0.1 + (run ? 1.2 : 0.6) * Math.max(0, Math.sin(ph + Math.PI - 1.3));
    out.shL = -a * 0.8 * s; out.shR = a * 0.8 * s; out.abL = 0.1; out.abR = 0.1; out.elL = run ? 1.4 : 0.35; out.elR = run ? 1.4 : 0.35; return out;
  }
  function buildFigureMeshes(count, group) {
    // street circuit: lighter heads (the crews are seen from the stands and the grid, a few hundred figures in one draw per part)
    const SPH = (L.track && L.track.data.street) || EI.quality === 'low' ? 'sphL' : 'sph';   // low-poly heads on street circuits and on Low
    const mk = (fn) => { const gb = new GB(); fn(gb); return gb.geometry(); };
    const I = new THREE.Matrix4();
    const S = (x, y, z, sx, sy, sz) => new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeScale(sx, sy, sz));
    const geos = {
      torso: mk(g => { g.add('box', S(0, 0.3, 0, 0.25, 0.6, 0.42), 0xffffff); g.add('box', S(0, -0.02, 0, 0.22, 0.18, 0.36), 0xffffff); g.add('box', S(-0.02, 0.43, 0, 0.27, 0.06, 0.44), col(0xffffff, 0.55)); }),
      helmet: mk(g => { g.add(SPH, S(0.0, 0.14, 0, 0.145, 0.145, 0.14), 0xffffff); g.add('box', S(0.1, 0.15, 0, 0.07, 0.07, 0.2), col(0x111111)); g.add('box', S(0, 0.02, 0, 0.1, 0.06, 0.1), col(0x222222)); }),
      face: mk(g => { g.add(SPH, S(0, 0.13, 0, 0.11, 0.125, 0.105), col(0xd9a37e)); g.add('box', S(-0.01, 0.15, 0, 0.05, 0.1, 0.25), col(0x15161a)); g.add('box', S(0.0, 0.25, 0, 0.04, 0.03, 0.24), col(0x15161a)); g.add('box', S(0.09, 0.08, 0.1, 0.1, 0.02, 0.02), col(0x15161a)); g.add('box', S(0, 0.02, 0, 0.08, 0.06, 0.08), col(0xd9a37e)); }),
      cap: mk(g => { g.add(SPH, S(0, 0.2, 0, 0.115, 0.07, 0.11), 0xffffff); g.add('box', S(0.1, 0.18, 0, 0.1, 0.015, 0.16), 0xffffff); }),
      uarm: mk(g => { g.add('box', S(0, -0.15, 0, 0.11, 0.32, 0.11), 0xffffff); }),
      larm: mk(g => { g.add('box', S(0, -0.14, 0, 0.1, 0.28, 0.1), 0xffffff); g.add('box', S(0.01, -0.31, 0, 0.09, 0.1, 0.07), col(0x15161a)); }),
      uleg: mk(g => { g.add('box', S(0, -0.22, 0, 0.16, 0.47, 0.16), 0xffffff); }),
      lleg: mk(g => { g.add('box', S(0, -0.21, 0, 0.13, 0.44, 0.13), 0xffffff); g.add('box', S(0.05, -0.45, 0, 0.27, 0.08, 0.12), col(0x111214)); }),
    };
    void I;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
    const meshes = {};
    for (const k in geos) {
      const mult = (k === 'uarm' || k === 'larm' || k === 'uleg' || k === 'lleg') ? 2 : 1;
      const im = new THREE.InstancedMesh(geos[k], mat, count * mult); im.frustumCulled = false; im.castShadow = true; im.receiveShadow = false; im.name = 'pit-fig-' + k;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); for (let i = 0; i < count * mult; i++) { im.setMatrixAt(i, ZERO); im.setColorAt(i, _c.setRGB(1, 1, 1)); }
      group.add(im); meshes[k] = im;
    }
    return meshes;
  }
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const _root = new THREE.Matrix4(), _pel = new THREE.Matrix4(), _tor = new THREE.Matrix4(), _j = new THREE.Matrix4(), _j2 = new THREE.Matrix4(), _tmp = new THREE.Matrix4();
  // forward kinematics: write the part instances of figure fi; hands (world) are stored on the figure for props
  function writeFigure(fi, f) {
    const M = V.fig; const p = f.pose;
    if (!f.visible) { for (const k of ['torso', 'helmet', 'face', 'cap']) M[k].setMatrixAt(fi, ZERO); for (const k of ['uarm', 'larm', 'uleg', 'lleg']) { M[k].setMatrixAt(fi * 2, ZERO); M[k].setMatrixAt(fi * 2 + 1, ZERO); } return; }
    _root.makeRotationY(-f.yaw); _root.setPosition(f.x, f.y, f.z);
    _pel.copy(_root).multiply(_tmp.makeTranslation(0, p.h, 0));
    _tor.copy(_pel).multiply(_tmp.makeRotationZ(-p.sp)); M.torso.setMatrixAt(fi, _tor);
    _j.copy(_tor).multiply(_tmp.makeTranslation(0, 0.62, 0)).multiply(_tmp.makeRotationY(-p.hy)).multiply(_tmp.makeRotationZ(-p.hd));
    if (f.eng) { M.face.setMatrixAt(fi, _j); M.cap.setMatrixAt(fi, _j); M.helmet.setMatrixAt(fi, ZERO); } else { M.helmet.setMatrixAt(fi, _j); M.face.setMatrixAt(fi, ZERO); M.cap.setMatrixAt(fi, ZERO); }
    for (let s = 0; s < 2; s++) {
      const sg = s ? 1 : -1; const sh = s ? p.shR : p.shL, ab = s ? p.abR : p.abL, el = s ? p.elR : p.elL, hp = s ? p.hpR : p.hpL, kn = s ? p.knR : p.knL;
      _j.copy(_tor).multiply(_tmp.makeTranslation(0, 0.52, sg * 0.25)).multiply(_tmp.makeRotationZ(sh)).multiply(_tmp.makeRotationX(-sg * ab)); M.uarm.setMatrixAt(fi * 2 + s, _j);
      _j2.copy(_j).multiply(_tmp.makeTranslation(0, -0.3, 0)).multiply(_tmp.makeRotationZ(el)); M.larm.setMatrixAt(fi * 2 + s, _j2);
      (s ? f.handR : f.handL).set(0.0, -0.31, 0).applyMatrix4(_j2);
      _j.copy(_pel).multiply(_tmp.makeTranslation(0, -0.02, sg * 0.11)).multiply(_tmp.makeRotationZ(hp)); M.uleg.setMatrixAt(fi * 2 + s, _j);
      _j2.copy(_j).multiply(_tmp.makeTranslation(0, -0.45, 0)).multiply(_tmp.makeRotationZ(-kn)); M.lleg.setMatrixAt(fi * 2 + s, _j2);
    }
  }
  function setFigureColors(fi, f) {
    const M = V.fig; const oc = col(f.overall), lc = col(f.legs || f.overall), hc = col(f.helmet || 0xffffff);
    M.torso.setColorAt(fi, oc); M.helmet.setColorAt(fi, hc); M.cap.setColorAt(fi, hc); M.face.setColorAt(fi, _c.setRGB(1, 1, 1));
    for (let s = 0; s < 2; s++) { M.uarm.setColorAt(fi * 2 + s, oc); M.larm.setColorAt(fi * 2 + s, oc); M.uleg.setColorAt(fi * 2 + s, lc); M.lleg.setColorAt(fi * 2 + s, lc); }
  }
  function newFig(opts) { const f = Object.assign({ x: 0, y: 0, z: 0, yaw: 0, visible: true, eng: false, pose: copyPose(POSES.stand, {}), handL: new THREE.Vector3(), handR: new THREE.Vector3(), ph: Math.random() * 6.28 }, opts); f.i = V.figs.length; V.figs.push(f); return f; }

  // props: tyres carried by the crew, wheel guns, jacks, lamps
  function buildProps(group, nBoxes) {
    const tyre = (() => {
      const gb = new GB(); const S = (x, y, z, sx, sy, sz, rz) => new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationZ(rz || 0)).multiply(new THREE.Matrix4().makeScale(sx, sy, sz));
      // axis along x: cylinder (axis y) rotated about z
      gb.add('cyl', S(0, 0, 0, 0.34, 0.33, 0.34, Math.PI / 2), col(0x161618)); gb.add('cyl', S(0, 0, 0, 0.22, 0.345, 0.22, Math.PI / 2), col(0x3a3d42));
      gb.add('cyl', S(0.168, 0, 0, 0.29, 0.01, 0.29, Math.PI / 2), 0xffffff); gb.add('cyl', S(0.17, 0, 0, 0.255, 0.012, 0.255, Math.PI / 2), col(0x161618));
      gb.add('cyl', S(-0.168, 0, 0, 0.29, 0.01, 0.29, Math.PI / 2), 0xffffff); gb.add('cyl', S(-0.17, 0, 0, 0.255, 0.012, 0.255, Math.PI / 2), col(0x161618));
      return gb.geometry();
    })();
    const gun = (() => { const gb = new GB(); gb.add('box', new THREE.Matrix4().makeTranslation(0.12, 0, 0).multiply(new THREE.Matrix4().makeScale(0.36, 0.11, 0.11)), col(0x1b1c20)); gb.add('box', new THREE.Matrix4().makeTranslation(0.0, -0.09, 0).multiply(new THREE.Matrix4().makeScale(0.06, 0.16, 0.06)), col(0x1b1c20)); gb.add('cyl', new THREE.Matrix4().makeTranslation(0.33, 0, 0).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)).multiply(new THREE.Matrix4().makeScale(0.05, 0.08, 0.05)), col(0xc0c4ca)); return gb.geometry(); })();
    const jack = (() => { const gb = new GB(); gb.add('cyl6', new THREE.Matrix4().makeTranslation(0, 0.5, 0).multiply(new THREE.Matrix4().makeScale(0.035, 1, 0.035)), 0xffffff); gb.add('box', new THREE.Matrix4().makeTranslation(0, 1.0, 0).multiply(new THREE.Matrix4().makeScale(0.2, 0.08, 0.3)), col(0x222222)); gb.add('box', new THREE.Matrix4().makeTranslation(0, 0.05, 0).multiply(new THREE.Matrix4().makeScale(0.12, 0.1, 0.5)), col(0x222222)); return gb.geometry(); })();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 });
    const mk = (geo, n, name, m) => { const im = new THREE.InstancedMesh(geo, m || mat, n); im.frustumCulled = false; im.castShadow = name !== 'lamp'; im.name = 'pit-' + name; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); for (let i = 0; i < n; i++) { im.setMatrixAt(i, ZERO); im.setColorAt(i, _c.setRGB(1, 1, 1)); } group.add(im); return im; };
    V.tyres = mk(tyre, nBoxes * 8, 'tyre'); V.guns = mk(gun, nBoxes * 4, 'gun'); V.jacks = mk(jack, nBoxes * 2, 'jack');
    V.lamps = mk(new THREE.SphereGeometry(0.12, 10, 8), nBoxes * 2, 'lamp', new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  }

  // ================================================================ build crews and static figures
  function buildPeople(group) {
    const teams = EI.TEAMS; const GZ = L.gsign;
    V.figs = [];
    V.boxes = L.boxD.map((d, k) => {
      const t = teams[k % teams.length];
      const p = pathAt(d); const fwd = new THREE.Vector3(p.tx, 0, p.tz), right = new THREE.Vector3(-p.tz, 0, p.tx), G = new THREE.Vector3(p.gx, 0, p.gz);
      const O = new THREE.Vector3(p.x + p.gx * BOXO, p.y, p.z + p.gz * BOXO);
      const GO = new THREE.Vector3(p.x + p.gx * GAR_FRONT, p.y, p.z + p.gz * GAR_FRONT);
      const box = { k, team: t, d, fwd, right, G, O, GO, crew: [], state: 'idle', p: 0, owner: null, queue: [], plan: null, car: null, newKey: 'medium', oldKey: 'medium', lampT: 0, green: 0, retT: 0 };
      const rc = (role, w) => { const f = newFig({ overall: t.primary, legs: t.primary, helmet: t.secondary === t.primary ? '#ffffff' : t.secondary, role, w, box }); box.crew.push(f); return f; };
      for (let w = 0; w < 4; w++) { rc('gun', w); rc('off', w); rc('on', w); }
      rc('jackF', -1); rc('jackR', -1); rc('chief', -1);
      // garage idle spots: three rows facing the lane, a couple at the trolleys
      const styles = ['stand', 'crossed', 'stand', 'lean', 'crossed'];
      box.crew.forEach((f, i) => { const row = i % 3, col2 = Math.floor(i / 3); f.idle = { x: -6 + col2 * 3 + (row - 1) * 0.6, z: 1.7 + row * 1.5, yaw: 0, style: styles[(i + k) % styles.length] }; f.spot = null; });
      // two engineers at the desk at the back of the garage, facing the screens
      for (const x of [-1.2, 1.2]) { const f = newFig({ eng: true, overall: t.primary, legs: '#24262c', helmet: t.primary, role: 'gareng', box }); const w = gl(box, x, GAR_D - 2.0); f.x = w.x; f.y = w.y; f.z = w.z; f.yaw = Math.atan2(box.G.z, box.G.x); f.base = 'seat'; }
      // pit wall engineers on the stand opposite the box, facing the track
      for (let j = 0; j < 3; j++) { const f = newFig({ eng: true, overall: t.primary, legs: '#24262c', helmet: t.primary, role: 'walleng', box }); const pw = frameAt(d + (-2.4 + j * 2.4), STAND_O - 0.8, 0.36); _v.set(0, 0, 0).applyMatrix4(pw); f.x = _v.x; f.y = _v.y; f.z = _v.z; f.yaw = Math.atan2(-box.G.z, -box.G.x); f.base = 'seat'; }
      void GZ;
      return box;
    });
    // walkers: engineers and officials strolling along the walkway in front of the garages and on the pit wall strip
    V.walkers = [];
    for (let i = 0; i < 5; i++) { const t = teams[(i * 3) % teams.length]; const f = newFig({ eng: i % 2 === 0, overall: i === 4 ? '#ff7a00' : t.primary, legs: '#2a2c33', helmet: t.primary, role: 'walker' }); f.walk = { d0: L.garD0 + 6, d1: L.garD1 - 6, o: GAR_FRONT - 0.85, u: i / 5, v: 1.25 + (i % 3) * 0.15, dir: i % 2 ? 1 : -1 }; V.walkers.push(f); }
    for (let i = 0; i < 4; i++) { const t = teams[(i * 7 + 2) % teams.length]; const k = 1 + i * 2; const dmid = (L.boxD[k] + L.boxD[k + 1]) / 2; const f = newFig({ eng: true, overall: t.primary, legs: '#2a2c33', helmet: t.primary, role: 'walker' }); f.walk = { d0: dmid - 3.5, d1: dmid + 3.5, o: STAND_O - 1.4, u: i / 4, v: 0.9, dir: 1 }; V.walkers.push(f); }
    V.fig = buildFigureMeshes(V.figs.length, group);
    for (const f of V.figs) setFigureColors(f.i, f);
    for (const k in V.fig) if (V.fig[k].instanceColor) V.fig[k].instanceColor.needsUpdate = true;
    buildProps(group, V.boxes.length);
    // street circuit: the crews and their props only ever stand round the pit lane - a bounding sphere over the lane lets the camera
    // and the shadow pass skip all the instanced crew draws whenever the pit is out of view
    if (L.track && L.track.data.street) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity; const p = {};
      for (let d = L.garD0 - 40; d <= L.garD1 + 40; d += 5) { pathAt(d, p); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
      const sph = new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + 30);
      group.traverse(o => { if (o.isInstancedMesh && /^pit-/.test(o.name)) { o.geometry.boundingSphere = sph.clone(); o.frustumCulled = true; } });
    }
  }
  // garage-local point (x along the lane, z into the garage) -> world
  function gl(box, x, z, out) { out = out || new THREE.Vector3(); return out.copy(box.GO).addScaledVector(box.fwd, x).addScaledVector(box.G, z); }
  // box-local point (car space: x forward, z right) -> world
  function bl(box, x, z, out) { out = out || new THREE.Vector3(); return out.copy(box.O).addScaledVector(box.fwd, x).addScaledVector(box.right, z); }
  const yawOf = (x, z) => Math.atan2(z, x);

  // ================================================================ track patching: old pit ribbon off, barrier gaps at the entry / exit
  function patchTrack(track) {
    const g = track.group; if (!g) return;
    const orig = L.orig;
    const nearOrig = (x, z, r) => { for (const q of orig) if ((q.x - x) ** 2 + (q.z - z) ** 2 < r * r) return true; return false; };
    let hidden = 0, gapped = 0;
    const tcurve = track.pitCurve; const nOld = tcurve ? Math.max(8, Math.round(tcurve.getLength() / 4)) : -1;
    for (const m of g.children) {
      if (!m.isMesh || !m.geometry || !m.geometry.attributes.position) continue;
      const geo = m.geometry, pos = geo.attributes.position;
      // the circuit's own pit lane surface / markings (this module draws the lane on its own path)
      if (/^pit(Lane|Markings|Text)$/.test(m.name || '')) { m.visible = false; hidden++; continue; }
      // the old pit lane ribbon from Track.buildPitLane
      if (nOld > 0 && pos.count === 2 * (nOld + 1) && geo.attributes.uv && nearOrig(pos.getX(0), pos.getZ(0), 8)) { m.visible = false; hidden++; continue; }
      // its line markings
      if (geo.type === 'PlaneGeometry' && geo.parameters && (geo.parameters.height === 0.15 || geo.parameters.height === 0.12) && m.material && m.material.isMeshBasicMaterial && m.material.color.getHex() === 0xf2f2f2 && nearOrig(m.position.x, m.position.z, 7)) { m.visible = false; hidden++; continue; }
      // vertical ribbons (barriers, panels, fences): sink the vertices where the pit road passes through
      if (pos.count >= 8 && pos.count % 2 === 0 && Math.abs(pos.getX(0) - pos.getX(1)) < 1e-3 && Math.abs(pos.getZ(0) - pos.getZ(1)) < 1e-3 && Math.abs(pos.getY(0) - pos.getY(1)) > 0.2) {
        let touched = false;
        for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i); for (const c of L.gaps) if ((c[0] - x) ** 2 + (c[1] - z) ** 2 < 11 * 11) { pos.setY(i, -50); touched = true; break; } }
        if (touched) { pos.needsUpdate = true; geo.computeBoundingSphere(); gapped++; }
      }
    }
    // trees planted where the lane, the stands or the garages now stand
    let cleared = 0; const sc = track.scenery;
    // the scenery's stand-in pit building overlaps the garages built here: this module's garage block replaces it
    let replaced = 0;
    if (sc && sc.group) sc.group.traverse((o) => { if (o.isMesh && /^pit(Building|Signs)$/.test(o.name || '')) { o.visible = false; replaced++; } });
    L.replaced = replaced;
    if (sc && sc.group) {
      const street = !!track.data.street;
      const samp = []; for (let d = L.dRoad0; d <= L.dRoad1; d += 3) { const p = pathAt(d); const inGar = d >= L.garD0 - 6 && d <= L.garD1 + 6; const inLane = d >= L.dA - 20 && d <= L.dB + 20; samp.push([p.x, p.z, p.gx, p.gz, inLane ? (street ? -6.4 : -11) : (street ? -6.4 : -7), inGar ? GAR_FRONT + GAR_D + 5 : inLane ? 9 : 7, d]); }
      const inStand = (x, z) => { for (const d of L.boxD) { const p = pathAt(d); const dx = x - p.x, dz = z - p.z; const al = dx * p.tx + dz * p.tz, o = dx * p.gx + dz * p.gz; if (Math.abs(al) < 5.4 && o < STAND_O + 0.6 && o > STAND_O - 3.2) return true; } return false; };
      const inside = (x, z) => { if (street && inStand(x, z)) return true; for (const q of samp) { const dx = x - q[0], dz = z - q[1]; if (dx * dx + dz * dz > 400) continue; const o = dx * q[2] + dz * q[3]; if (o > q[4] && o < q[5]) return true; } return false; };
      sc.group.traverse((o) => {
        if (!o.isInstancedMesh || !/tree/i.test(o.name || '')) return; let any = false;
        for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, _m); _v.setFromMatrixPosition(_m); if (inside(_v.x, _v.z)) { o.setMatrixAt(i, ZERO); any = true; cleared++; } }
        if (any) o.instanceMatrix.needsUpdate = true;
      });
    }
    L.patch = { hidden, gapped, cleared };
  }

  // ================================================================ per-race setup
  function setupCar(car, race) {
    const st = { active: false, request: false, next: otherCompound(car.tyreKey), phase: null, d: 0, v: 0, o: 0, off0: 0, d0: 0, served: false, stops: 0, keyPrev: false, prevS: null, box: null, queued: false, stopD: null, plan: null, lastStop: null, ui: null };
    car.pit = st;
    // strategy for bots
    // (bot strategy and starting tyres: Strat.start, after the wheels below are known)
    // physics override: while in the pit lane this module moves the car along the lane
    const orig = car.update;
    car.update = function (dt, track, rc) { if (this.pit && this.pit.active) return stepPitCar(this, dt, track, rc || race); return orig.call(this, dt, track, rc); };
    // wheels: remember pivots and find the compound stripe meshes (a canvas-textured sidewall ring, or a plain coloured ring)
    car._pitWheels = (car.wheels || []).map((w) => {
      const piv = w.parent ? w.parent.position : new THREE.Vector3(); const rings = []; let kind = 'color';
      const hex = new THREE.Color(car.tyre.color).getHex();
      w.traverse(o => { if (!o.isMesh || !o.material) return; const m = o.material; if (m.map && m.map.image && m.map.image.tagName === 'CANVAS' && m.side === THREE.DoubleSide && m.alphaTest > 0) { rings.push(o); kind = 'map'; } });
      if (!rings.length) w.traverse(o => { if (o.isMesh && o.material && o.material.color && o.material.color.getHex() === hex && !o.material.map) rings.push(o); });
      if (!rings.length) { const g = new THREE.RingGeometry(0.262, 0.292, 32); const g2 = g.clone(); g.translate(0, 0, 0.215); g2.rotateY(Math.PI); g2.translate(0, 0, -0.215); for (const gg of [g, g2]) { const r = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ color: car.tyre.color, roughness: 0.7, side: THREE.DoubleSide })); w.add(r); rings.push(r); } }
      const mat = rings[0].material.clone(); for (const r of rings) r.material = mat;
      if (kind === 'map' && !RING_TEX[car.tyreKey]) RING_TEX[car.tyreKey] = { tex: rings[0].material.map || mat.map, key: car.tyreKey };
      return { spin: w, x: piv.x, z: piv.z, mat, kind, key: car.tyreKey };
    });
    if (!car.isPlayer) Strat.start(car, st, race);
  }
  // sidewall textures per compound: taken from the cars' own rings, or recoloured from one of them when no car started on that compound
  const RING_TEX = {};
  function ringTexture(key) {
    if (RING_TEX[key] && RING_TEX[key].tex) return RING_TEX[key].tex;
    const src = RING_TEX.soft || RING_TEX.medium || RING_TEX.hard; if (!src) return null;
    const from = new THREE.Color(EI.TYRES[src.key].color), to = new THREE.Color(EI.TYRES[key].color);
    const img = src.tex.image; const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const id = ctx.getImageData(0, 0, c.width, c.height), px = id.data; const fr = from.r * 255, fg = from.g * 255, fb = from.b * 255;
    for (let i = 0; i < px.length; i += 4) { if (px[i + 3] < 8) continue; const d = Math.abs(px[i] - fr) + Math.abs(px[i + 1] - fg) + Math.abs(px[i + 2] - fb); if (d < 30) { px[i] = to.r * 255; px[i + 1] = to.g * 255; px[i + 2] = to.b * 255; } }
    ctx.putImageData(id, 0, 0);
    const tex = new THREE.CanvasTexture(c); tex.encoding = src.tex.encoding; tex.anisotropy = src.tex.anisotropy; RING_TEX[key] = { tex, key }; return tex;
  }
  function setWheelCompound(w, key) {
    if (w.key === key) return; w.key = key;
    if (w.kind === 'map') { const t = ringTexture(key); if (t) { w.mat.map = t; w.mat.needsUpdate = true; } }
    else w.mat.color.set(EI.TYRES[key].color);
  }
  function otherCompound(k) { return k === 'soft' ? 'medium' : k === 'medium' ? 'hard' : 'medium'; }

  // ================================================================ bot race strategy (owner STRATEGY)
  // Each bot has a strategist. Tyre model (car.js, read-only): wear grows ~ TYRES[k].wear x 0.01 x lap time per lap (about
  // 0.015 / 0.008 / 0.004 a lap on soft / medium / hard at Silverstone, never scaled by race length); grip x (1 - 0.3 wear) and the
  // bot's own tyre-care fade (ai.js wearK) cost about lap x (0.03 + 0.33 wearK) s per unit of wear (+ a small square term).
  // A stop costs the circuit's pit loss + an out-lap warm-up. The strategist stops only when that wins time over the rest of the
  // race (one stop, best lap and compound, re-planned every sector from the car's own wear rate), never in the last 25 % unless a
  // tyre is about to fail, and reads the race around it: the lead and the cars a stop would drop it behind (track position is
  // worth a lot when passing is hard), undercutting a close car ahead, covering the car behind when it stops, waiting a lap
  // rather than rejoining in traffic, and not stacking behind a team-mate (one garage per team). Runs on lap / sector changes
  // only. QA: EI.debugStrategy = true logs every decision; Pit.strategyLog keeps the last 300; car.pit.strat / car.pit.why.
  const COMP_N = 3;
  const PIT_LOSS = { silverstone: 19, monaco: 21, abudhabi: 22, monza: 24, spa: 17, cota: 21, mexico: 22 };   // measured lane time - racing time (f1-QA gate), s (spa: SPA-GEN ploss.js, uncontested 15.7-17.4; cota: COTA-GEN ploss.js, uncontested 21.2-21.5, real 19-22)
  const PASS_COST = { monaco: 7, silverstone: 2.2, abudhabi: 2.5, monza: 1.6, spa: 1.6, cota: 1.6, mexico: 1.6 };    // what a car loses to a car it must re-pass on track, s
  // worn tyres and the bots: ai.js slows a bot by wearK x wear but grip falls faster, so past ~0.3 they slide off more and more
  // (Silverstone softs, 9 bots x 5 laps: 0.04 offs per bot-lap at wear 0-0.27, 0.18 at 0.37-0.42, 0.27 at 0.52-0.58). That risk is
  // a cost (C_K x lap per unit^2 beyond W_RISK) and W_PLAN caps a planned stint; W_FAIL = "about to fail": stops even in the last quarter
  const W_RISK = 0.3, W_PLAN = 0.48, W_FAIL = 0.8;
  const WARMUP = 0.6, MARGIN = 1.0, LATE = 0.75, B_K = 0.035, C_K = 0.6;
  const Strat = { log: [], sg: null };
  Pit.strategyLog = Strat.log;
  function sgFor(race) {
    if (Strat.sg && Strat.sg.race === race) return Strat.sg;
    const t = race.track, id = t.data.id; let lap = 0;
    if (t.aiSpeed && t.n) { for (let i = 0; i < t.n; i++) lap += t.ds / Math.max(8, t.aiSpeed[i]); lap *= 1.03; }
    if (!(lap > 20)) lap = t.length / 62;
    const PL = t.data.pitLoss || PIT_LOSS[id] || 21;
    Strat.sg = { race, lapRef: lap, PL, pass: PASS_COST[id] != null ? PASS_COST[id] : 2.2, kSum: 0, kN: 0, rng: U.rng(((race.seed || 1) * 2654435761 + 977) >>> 0) };
    Strat.log.length = 0; return Strat.sg;
  }
  function tyreA(car, sg) { const P = car.persona && car.persona.par; const wk = P && P.wearK != null ? P.wearK : 0.15; return sg.lapRef * (0.03 + 0.33 * wk); }
  function paceOff(key, sg) { return sg.lapRef * 0.6 * (1 / Math.sqrt(EI.TYRES[key].grip) - 1); }
  // wear per lap on compound key: the car's own observed rate (scaled from the compound it is on), else the field's, else the model
  function wearRate(car, st, key, sg) { const k = st.strat && st.strat.kw > 0 ? st.strat.kw : sg.kN >= 3 ? sg.kSum / sg.kN : 1; return EI.TYRES[key].wear * 0.01 * sg.lapRef * k; }
  // lap-time cost of n laps starting at wear w0, r per lap: sum of f(w0 + r (i + 0.5)), f(w) = A w + B w^2 (closed form)
  // lap-time cost of n laps starting at wear w0, r per lap: sum over laps of f(w0 + r (i + 0.5)), f(w) = A w + B w^2 + C max(0, w - W_RISK)^2
  // (closed forms: no loops, no allocations)
  const sq = (c, r, n) => n <= 0 ? 0 : n * c * c + c * r * n * (n - 1) + r * r * (n - 1) * n * (2 * n - 1) / 6;   // sum_{i<n} (c + r i)^2
  function stintCost(A, B, w0, r, n, C) {
    if (n <= 0) return 0; let v = A * (n * w0 + r * n * n / 2) + B * (n * w0 * w0 + w0 * r * n * n + r * r * (n * n * n / 3 - n / 12));
    if (C > 0 && w0 + r * (n - 0.5) > W_RISK) { const i0 = r > 0 ? Math.max(0, Math.ceil((W_RISK - w0) / r - 0.5)) : 0, c = w0 - W_RISK + r * 0.5; v += C * (sq(c, r, n) - sq(c, r, i0)); }
    return v;
  }
  const over = (w, lim) => w > lim ? 400 * (w - lim + 0.02) : 0;   // a stint past the planned limit (bots slide around): not an option
  // best plan for the laps after the current one: stay out to the flag, or one stop at the end of lap k (now .. last-1) onto c2.
  // out: stay, now (stop at the end of this lap, best compound nowC), later (best stop after this lap), best / k / c2 overall
  function plan(car, st, race, sg, lap, w, extraStop, out) {
    const Lr = race.laps, key = car.tyreKey, A = tyreA(car, sg), B = sg.lapRef * B_K, C = sg.lapRef * C_K, r = wearRate(car, st, key, sg), oc = paceOff(key, sg);
    const n = Lr - lap;
    out.stay = stintCost(A, B, w, r, n, C) + oc * n + over(w + r * n, W_PLAN); out.best = out.stay; out.k = 0; out.c2 = null; out.now = Infinity; out.nowC = null; out.later = Infinity; out.r = r;
    for (let k = Math.max(lap, 1); k < Lr; k++) {
      const m = k - lap, wS = w + r * m, cur = stintCost(A, B, w, r, m, C) + oc * m + over(wS, W_PLAN) + sg.PL + WARMUP + extraStop, n2 = Lr - k;
      for (let ci = 0; ci < COMP_N; ci++) {
        const c2 = COMP[ci], r2 = wearRate(car, st, c2, sg); const c = cur + stintCost(A, B, 0, r2, n2, C) + paceOff(c2, sg) * n2 + over(r2 * n2, W_PLAN);
        if (c < out.best) { out.best = c; out.k = k; out.c2 = c2; }
        if (k === Math.max(lap, 1)) { if (c < out.now) { out.now = c; out.nowC = c2; } } else if (c < out.later) out.later = c;
      }
    }
    return out;
  }
  const _P = {};
  // starting tyre: the plan cost from the grid on each compound (a stop there pays an expected traffic toll); the field picks among
  // the near-best ones (seeded), so a long race mixes strategies and a short one is (nearly) all one compound
  Strat.start = function (car, st, race) {
    const sg = sgFor(race); st.strat = { kw: 0, setD0: null, setLaps: 0, why: 'grid', stopLap: 0, next: null, sk: -1, hold: '' };
    if (!(race.laps >= 2)) return;
    const toll = sg.pass * (car.pos <= 2 ? 0.5 : 2);
    const keep = car.tyreKey; let best = Infinity; const cost = [0, 0, 0];
    for (let ci = 0; ci < COMP_N; ci++) { car.tyreKey = COMP[ci]; plan(car, st, race, sg, 0, 0, toll, _P); cost[ci] = _P.best; best = Math.min(best, cost[ci]); }
    car.tyreKey = keep;
    let tot = 0; const wgt = [0, 0, 0]; const temp = 0.8 * U.clamp((race.laps - 8) / 10, 0, 1);   // short races: the whole field on the best tyre (a mixed pack makes lap 1 messy)
    for (let ci = 0; ci < COMP_N; ci++) { const d = cost[ci] - best; wgt[ci] = d > 2.5 ? 0 : temp > 0 ? Math.exp(-d / temp) : d === 0 ? 1 : 0; tot += wgt[ci]; }
    let x = sg.rng() * tot, pick = 0; for (let ci = 0; ci < COMP_N; ci++) { x -= wgt[ci]; if (x <= 0) { pick = ci; break; } }
    const key = Pit.strategyStart && EI.TYRES[Pit.strategyStart] ? Pit.strategyStart : COMP[pick];   // (QA knob: force the bots' starting tyre)
    if (key !== car.tyreKey) { car.tyreKey = key; car.tyre = EI.TYRES[key]; if (car._pitWheels) for (const w of car._pitWheels) setWheelCompound(w, key); }
    plan(car, st, race, sg, 0, 0, toll, _P); st.strat.stopLap = _P.best < _P.stay - MARGIN ? _P.k : 0; st.strat.next = _P.c2; st.next = _P.c2 || otherCompound(key);
    st.strat.why = 'start ' + key + (st.strat.stopLap ? ', stop ~L' + st.strat.stopLap + ' -> ' + _P.c2 : ', no stop') + ' (' + cost.map((c, i) => COMP[i][0] + (c - best).toFixed(1)).join(' ') + ')';
    note(car, race, st.strat.why);
  };
  function note(car, race, msg) {
    const e = { t: +race.time.toFixed(1), lap: car.lap || 0, car: car.driver && car.driver.code || car.name, pos: car.pos, msg };
    Strat.log.push(e); if (Strat.log.length > 300) Strat.log.shift();
    if (EI.debugStrategy) console.log('[strategy] t' + e.t + ' L' + e.lap + ' P' + e.pos + ' ' + e.car + ': ' + msg);
  }
  // seconds a stop at the end of this lap costs in track position: each car within the pit loss behind that will not stop soon
  // itself has to be re-passed; the leader also gives the lead away; rejoining just behind a car = stuck in its dirty air
  function rejoinCost(car, race, sg, why) {
    const o = race.order, i = o.indexOf(car); if (i < 0) return 0; let acc = 0, cost = 0, n = 0;
    for (let j = i + 1; j < o.length; j++) {
      const c = o[j]; acc += c.gapAhead || 0;
      if (acc > sg.PL) { if (acc - sg.PL < 1.2 && !c.finished && race.lapGap(car, c) < 1) cost += sg.pass * 0.4; break; }
      if (c.finished || (c.pit && (c.pit.active || c.pit.request)) || race.lapGap(car, c) >= 1) continue;
      const s2 = c.pit && c.pit.strat, soon = s2 && s2.stopLap > 0 && s2.stopLap <= (car.lap || 1) + 3;
      cost += soon ? sg.pass * 0.25 : sg.pass; n++;
    }
    if (i === 0 && n > 0) cost += 6;   // the lead: worth more than the laps of fresher tyres
    why.n = n; return cost;
  }
  const _why = { n: 0 };
  Strat.eval = function (car, st, race) {
    const ss = st.strat; if (!ss || st.active || car.finished) return;
    const sec = car.sector || 0, key = (car.lap || 0) * 4 + sec; if (key === ss.sk) return;   // once per sector
    const newLap = ss.lapSeen !== car.lap; ss.sk = key; ss.lapSeen = car.lap;
    const sg = sgFor(race), Lr = race.laps, lap = car.lap || 1, TL = race.track.length;
    // the car's own wear rate on this set (race distance on the set), for the plan and as the field's reference
    if (ss.setD0 == null) ss.setD0 = car.dist;
    const onSet = (car.dist - ss.setD0) / TL;
    if (newLap && onSet > 0.7 && car.wear > 0) { const k = car.wear / onSet / (car.tyre.wear * 0.01 * sg.lapRef); if (k > 0.2 && k < 5) { ss.kw = k; sg.kSum += k; sg.kN++; } }
    if (st.request) { if (lap >= Lr) { st.request = false; note(car, race, 'final lap: stop cancelled'); } return; }
    if (st.stops >= 3 || lap >= Lr || !race.started) return;
    const dTo = U.mod(L.sCap - car.trk.s, TL); if (dTo < 260) return;   // too late on this lap: decided next sector / lap
    const prog = U.mod(car.trk.s - race.track.sf, TL) / TL;
    const r0 = wearRate(car, st, car.tyreKey, sg), wE = car.wear + r0 * (1 - prog);   // wear at the end of this lap
    const fracAfter = (Lr - lap) / Lr;                                               // race left after a stop at the end of this lap
    const damage = (car.damage || 0) > 0.5 || !!car.puncture;
    let why = '';
    if (damage) why = 'damage';
    else if (wE > W_FAIL) why = 'wear ' + wE.toFixed(2) + ' about to fail';
    if (!why) {
      if (fracAfter < 1 - LATE) {   // last quarter: stay out unless the tyre fails before the flag
        const wFin = wE + r0 * (Lr - lap); if (wFin <= W_FAIL) { if (newLap && ss.stopLap) { ss.stopLap = 0; note(car, race, 'last quarter: staying out (wear at flag ' + wFin.toFixed(2) + ')'); } return; }
        why = 'wear ' + wFin.toFixed(2) + ' at the flag: would fail';
      }
    }
    const p = plan(car, st, race, sg, lap, wE, 0, _P);
    ss.stopLap = p.best < p.stay - MARGIN ? p.k : 0; ss.next = p.c2;
    if (!why) {
      const rj = rejoinCost(car, race, sg, _why), nowT = p.now + rj, gain = p.stay - nowT;
      const o = race.order, i = o.indexOf(car);
      // undercut: a close car ahead on older tyres; our fresh out-lap beats its in-lap by more than the gap
      const a = i > 0 ? o[i - 1] : null;
      if (a && !a.finished && !(a.pit && (a.pit.active || a.pit.request)) && race.lapGap(a, car) < 1 && car.gapAhead < 2.0 && p.nowC && ss.stopLap && ss.stopLap - lap <= 4 && p.now < p.best + 2.5 && rj <= sg.pass * 1.5) {
        const Aa = tyreA(a, sg), wa = a.wear + wearRate(a, a.pit && a.pit.strat ? a.pit : st, a.tyreKey, sg);
        const dU = stintCost(Aa, sg.lapRef * B_K, wa, 0, 1, sg.lapRef * C_K) + paceOff(a.tyreKey, sg) - (tyreA(car, sg) * wearRate(car, st, p.nowC, sg) * 0.5 + paceOff(p.nowC, sg)) - WARMUP;
        if (dU > car.gapAhead + 0.3) why = 'undercut ' + (a.driver && a.driver.code || a.name) + ' (gap ' + car.gapAhead.toFixed(1) + ' s, fresh-tyre lap +' + dU.toFixed(1) + ' s)';
      }
      // cover: the car right behind has just stopped and we are in our window
      const b = i >= 0 && i + 1 < o.length ? o[i + 1] : null;
      if (!why && b && b.pit && race.lapGap(car, b) < 1 && b.gapAhead < 3.0 && (b.pit.active || (b.pit.tOut != null && race.time - b.pit.tOut < sg.lapRef * 0.6)) && ss.stopLap && p.now < p.best + 3 && p.now < p.stay)
        why = 'cover ' + (b.driver && b.driver.code || b.name) + ' (stopped ' + b.gapAhead.toFixed(1) + ' s behind)';
      // time: now is the best lap to stop (traffic included) and it wins time over staying out
      if (!why && gain > MARGIN && nowT <= p.later + 0.3) why = 'gains ' + gain.toFixed(1) + ' s (stay ' + p.stay.toFixed(1) + ' / stop ' + p.now.toFixed(1) + ' + rejoin ' + rj.toFixed(1) + ' over ' + _why.n + ' cars), wear ' + wE.toFixed(2);
      // forced: the tyre cannot reach the flag and a later stop is no better, or this is the last lap before the final quarter
      if (!why && p.stay >= 400 && (nowT <= p.later + 0.3 || (Lr - lap - 1) / Lr < 1 - LATE)) why = 'must stop: wear at the flag ' + (wE + r0 * (Lr - lap)).toFixed(2);
      if (!why) {
        if (newLap) { const wait = rj > 0 && p.k === lap, hk = ss.stopLap ? 'p' + ss.stopLap + ss.next + wait : 'n'; if (hk !== ss.hold) { ss.hold = hk; note(car, race, ss.stopLap ? 'plan: stop ~L' + ss.stopLap + ' -> ' + ss.next + (wait ? ' (waiting: rejoin behind ' + _why.n + ' cars, +' + rj.toFixed(1) + ' s)' : '') : 'plan: no stop (stay ' + p.stay.toFixed(1) + ' s vs best stop ' + Math.min(p.now, p.later).toFixed(1) + ' s)'); } }
        return;
      }
      // one garage per team: let the team-mate's stop clear first (not for a cover / undercut)
      const mate = race.cars.find(c => c !== car && c.team === car.team && c.pit && (c.pit.active || c.pit.request));
      if (mate && !/^(cover|undercut)/.test(why) && p.stay < 400) { if (ss.hold !== 'm') { ss.hold = 'm'; note(car, race, 'hold: team-mate ' + (mate.driver && mate.driver.code || mate.name) + ' in the box (' + why + ')'); } return; }
    }
    st.request = true; st.next = p.nowC || otherCompound(car.tyreKey); st.why = why + ' -> ' + st.next; ss.why = st.why; ss.hold = '';
    note(car, race, 'BOX ' + car.tyreKey + ' -> ' + st.next + ': ' + why);
  };
  // after a stop: a new set, measured from the release
  Strat.newSet = function (car) { const ss = car.pit && car.pit.strat; if (ss) { ss.setD0 = car.dist; ss.sk = -1; ss.stopLap = 0; } };

  Pit.init = function (race) {
    try {
      const track = race.track;
      if (!L || L.track !== track) { L = buildLayout(track); if (!L) return; L.track = track; V = null; }
      const scene = EI.debug && EI.debug.scene;
      if (!V && scene) {
        V = { lampPos: [] };
        const grp = buildVisuals(track, scene); buildPeople(grp); patchTrack(track);
        if (track.data.street) grp.children.forEach((o, k) => { if (o.isMesh && !o.isInstancedMesh && k > 0 && !o.castShadow) o.userData.pitFar = true; });
        // same ambient balance as the rest of the scene (main.js damps the environment map on materials that exist at start-up)
        grp.traverse(o => { if (o.material && o.material.isMeshStandardMaterial) o.material.envMapIntensity = o.userData.keepEnv ? 1.0 : 0.3; });
        scene.add(grp); V.group = grp; V.t = 0;
        ensureUI();
      }
      R = { race, cars: race.cars, toastDone: false, ui: [] };
      for (const car of race.cars) setupCar(car, race);
      if (V) for (const b of V.boxes) { b.state = 'idle'; b.p = 0; b.owner = null; b.queue = []; b.plan = null; b.car = null; b.green = 0; b.tRel = null; b.t0 = 0; }
      // collisions: cars in the pit lane are handled here, keep them out of the contact solver
      const rc = race.resolveCollisions;
      race.resolveCollisions = function (dt) { const all = this.cars; const out = all.filter(c => !(c.pit && c.pit.active)); if (out.length === all.length) return rc.call(this, dt); this.cars = out; try { rc.call(this, dt); } finally { this.cars = all; } for (const c of all) if (c.pit && c.pit.active) c.hit = Math.max(0, c.hit - dt * 2); };
      if (R.uiEls) R.uiEls = null;
      if (V) resetUI(race);
    } catch (e) { console.error('Pit.init', e); }
  };

  // ================================================================ per-step logic (end of Race.update)
  // forward crossings only: a car nudged backwards (contact, a spin, standing still) used to "cross" every line at once, which
  // captured a car with a pit request into the lane from anywhere on the circuit
  function crossed(a, b, s, TL) { const d = b - a; if (d >= 0 && d < TL / 2) return a < s && s <= b; if (d < -TL / 2) return s > a || s <= b; return false; }
  Pit.update = function (race, dt) {
    if (!R || R.race !== race || !L) return;
    const TL = race.track.length;
    for (const car of race.cars) {
      const st = car.pit; if (!st) continue;
      if (car.isPlayer && car.input) {
        const pk = !!car.input.pit; if (pk && !st.keyPrev && !car.finished) { if (st.active) { /* already in */ } else { st.request = !st.request; uiFlash(car, st.request ? 'PIT REQUESTED' : 'PIT CANCELLED', st.request ? 'info' : 'muted'); } }
        st.keyPrev = pk;
        const ty = car.input.tyre; if (ty && EI.TYRES[ty] && ty !== st.next && !(st.phase === 'service' && st.plan && st.plan.t > 0.2)) { st.next = ty; if (!st.request && !st.active) uiFlash(car, 'NEXT TYRE · ' + EI.TYRES[ty].name.toUpperCase(), 'muted'); }
      }
      if (!race.started) { st.prevS = car.trk.s; continue; }
      if (car.finished && !st.active) { st.request = false; st.prevS = car.trk.s; continue; }
      if (!car.isPlayer) strategy(car, st, race);
      if (st.request && !st.active && st.prevS != null && crossed(st.prevS, car.trk.s, L.sCap, TL)) {
        const side = car.trk.lat * L.side;
        if (side >= 0.8 && car.v > 2) capture(car, race);
        // a late swerve across the pit entry line still makes the lane (no penalty in this game)
        else if (side >= -1.6 && car.v > 2) capture(car, race);
        else if (car.isPlayer) { uiFlash(car, 'MISSED THE PIT ENTRY', 'bad'); if (EI.HUD) EI.HUD.toast(car.name + ' missed the pit entry'); }
      }
      st.prevS = car.trk.s;
    }
    if (V) for (const b of V.boxes) stepBox(b, race, dt);
  };
  // a car that still owes the second dry compound (races of 3 laps or more)
  function owesCompound() { return false; }   // the two-compound rule is not used in this game (kept as a hook)
  function strategy(car, st, race) { Strat.eval(car, st, race); }
  function capture(car, race) {
    const st = car.pit; let best = L.dCap, bd = Infinity;
    for (let i = Math.max(0, L.dCap - 70); i < Math.min(L.n, L.dCap + 70); i++) { const d = (L.x[i] - car.x) ** 2 + (L.z[i] - car.z) ** 2; if (d < bd) { bd = d; best = i; } }
    const d0 = best * L.ds; const p = pathAt(d0); const off = (car.x - p.x) * p.gx + (car.z - p.z) * p.gz;
    Object.assign(st, { active: true, d: d0, d0, off0: off, o: off, v: Math.max(0, car.v), phase: 'in', served: false, queued: false, plan: null, tIn: race.time, limitChecked: false, speeding: false, manual: car.isPlayer && !(car.assist && car.assist.steerHelp) });
    // progress: continue from the car's own track position, blending onto the lane mapping over the first 80 m
    const TL = race.track.length; let ws = car.trk.s - L.sCap; ws -= Math.round(ws / TL) * TL; const sU = L.sCap + ws;
    st.sOff = sU - sEqAt(d0); st.distBase = car.dist - sU;
    st.sGhost = sU;   // pit lane progress is capped by a ghost lapping at racing speed from here (stepPitCar)
    const ti = car.team.index != null ? car.team.index : Math.max(0, EI.TEAMS.indexOf(car.team)); const box = V ? V.boxes[ti % V.boxes.length] : { d: L.boxD[ti % L.boxD.length], owner: null, queue: [] };
    st.box = box; if (!box.owner) { box.owner = car; st.stopD = box.d; } else { box.queue.push(car); st.queued = true; st.stopD = box.d - QUEUE_GAP; }
    car.drsOpen = false; car.drsEligible = false; car.ersActive = false;
    if (car.isPlayer) uiFlash(car, 'PIT LANE', 'info');
  }

  // ---------------------------------------------------------------- motion along the lane (replaces Car.update while in the pit)
  const P0 = {}, P1 = {};
  function laneOffset(st, d) {
    let o = FAST * sstep(L.dA - 25, L.dA + 5, d) * (1 - sstep(L.dB - 5, L.dB + 25, d));
    const b = st.box;
    if (b) { if (!st.served) o += (BOXO - FAST) * sstep(b.d - 34, b.d - 6, d); else o += (BOXO - FAST) * (1 - sstep(b.d + 0.5, b.d + 26, d)); }
    o += st.off0 * (1 - sstep(st.d0, st.d0 + 45, d));
    return o;
  }
  function stepPitCar(car, dt, track, race) {
    const st = car.pit; const inp = car.input || {}; const vPrev = st.v;
    const inZone = st.d >= L.dLimIn && st.d <= L.dLimOut;
    // ---- longitudinal
    let vt = (st.manual && st.d < L.dLimIn ? L.vCurv : L.vAuto)[idxD(st.d)];
    if (st.d >= L.dLimIn - 1 && st.d <= L.dLimOut) vt = Math.min(vt, LIMIT);
    if (st.phase === 'in' && st.stopD != null) vt = Math.min(vt, Math.sqrt(2 * L.boxA * Math.max(0, st.stopD - st.d)));
    if (st.phase === 'wait' || st.phase === 'service') vt = 0;
    // spacing to cars ahead in the same lane
    for (const o of race.cars) { const q = o.pit; if (o === car || !q || !q.active || q.d <= st.d) continue; const gap = q.d - st.d; if (gap < 26 && Math.abs(q.o - st.o) < 2.3) vt = Math.min(vt, Math.max(0, q.v + (gap - 8.5) * 1.1)); }
    if (car.isPlayer) {
      const brk = U.clamp(inp.brake || 0, 0, 1), thr = U.clamp(inp.throttle || 0, 0, 1);
      if (brk > 0.05) vt = Math.min(vt, st.v - brk * 30 * dt);
      if (!inZone && st.phase !== 'service' && st.phase !== 'wait') { // outside the limiter the driver has the throttle
        if (st.d < L.dLimIn) { if (thr < 0.05) vt = Math.min(vt, st.v - 1.5 * dt); else vt = Math.min(vt, st.v + thr * 12 * dt); }
        else vt = Math.min(vt, st.v + Math.max(thr, 0.15) * 13 * dt);
      }
    }
    const acc = inZone ? L.boxA : L.exitA;
    if (vt > st.v) st.v = Math.min(vt, st.v + acc * dt); else st.v = Math.max(Math.max(0, vt), st.v - 34 * dt);
    const dPrev = st.d; st.d += st.v * dt;
    // ---- speed limit line
    if (!st.limitChecked && dPrev < L.dLimIn && st.d >= L.dLimIn) {
      st.limitChecked = true;
      // speeding at the line, by margin: < 6 km/h 5 s, 6-15 km/h drive-through, > 15 km/h stop-and-go (the last two as their
      // end-of-race time equivalents, 20 s and 30 s, B1.9.6c iii). The limiter then holds the car to the limit.
      const over = (st.v - LIMIT) * 3.6;
      if (over > 0.3) {
        const sec = over <= 6 ? 5 : over <= 15 ? 20 : 30; st.speeding = sec; st.speedOver = over;
        const why = 'Pit lane speeding +' + over.toFixed(1) + ' km/h' + (sec === 20 ? ' (drive-through)' : sec === 30 ? ' (stop-and-go)' : '');
        if (race.addPenalty) race.addPenalty(car, sec, why, sec === 5); else car.penalty += sec;
        if (car.isPlayer) uiFlash(car, 'PIT LANE SPEEDING  +' + sec + ' S', 'bad', 3); else if (EI.HUD) EI.HUD.toast(car.name + ': pit lane speeding, +' + sec + ' s penalty');
        race.emit('pitPenalty', car);
      }
      st.v = Math.min(st.v, LIMIT);
    }
    // ---- box: stop, wait, service, release
    const b = st.box;
    if (st.phase === 'in' && st.stopD != null && st.d >= st.stopD - 0.04 && st.v < 0.6) {
      st.d = st.stopD; st.v = 0;
      if (st.queued) st.phase = 'wait'; else beginService(car, race);
    }
    if (st.phase === 'wait' && b.owner === car) { st.queued = false; st.stopD = b.d; st.phase = 'in'; }
    if (st.phase === 'service') {
      const pl = st.plan; pl.t += dt;
      if (pl.t >= pl.release) {
        // unsafe release check: hold the car while a car is coming down the fast lane alongside
        let clear = true; for (const o of race.cars) { const q = o.pit; if (o === car || !q || !q.active) continue; if (q.d > b.d - 26 && q.d < b.d + 3 && q.o < 0.5 && q.v > 2) clear = false; }
        if (clear || pl.t > pl.release + 6) endService(car, race);
      }
    }
    if (st.d >= L.dRel * L.ds) { releaseCar(car, track, race); return; }
    // ---- pose on the lane
    const o = laneOffset(st, st.d); st.o = o;
    pathAt(st.d, P0); pathAt(st.d + 0.8, P1); const o1 = laneOffset(st, st.d + 0.8);
    const x0 = P0.x + P0.gx * o, z0 = P0.z + P0.gz * o, x1 = P1.x + P1.gx * o1, z1 = P1.z + P1.gz * o1;
    const hNew = Math.atan2(z1 - z0, x1 - x0); const yawRate = U.wrapAngle(hNew - car.heading) / dt;
    car.x = x0; car.z = z0; car.heading = hNew;
    let lift = 0, pitch = 0; if (st.phase === 'service') { const lf = liftAt(st.plan, 'F'), lr = liftAt(st.plan, 'R'); lift = (lf + lr) / 2; pitch = (lf - lr) / 3.6; }
    car.y = P0.y + lift; car.gradeNow = pitch;
    car.v = st.v; car.vLat = 0; car.yaw = car.v > 0.5 ? U.clamp(-yawRate, -2, 2) : 0; car.aLat = car.v * car.yaw; car.aLong = (st.v - vPrev) / dt;
    car.steer = U.clamp(car.yaw * 3.6 / Math.max(2, car.v) * 4, -1, 1);
    car.throttle = st.v > vPrev + 1e-4 ? 0.7 : (st.v > 0.5 ? 0.2 : 0); car.brake = st.v < vPrev - 1e-3 ? 0.7 : 0;
    car.surface = 'asphalt'; car.offTrack = 0; car.wallHit = Math.max(0, car.wallHit - dt); car.drsOpen = false; car.ersActive = false; car.slipstream = 0;
    // track-relative state: progress follows the lane so positions and lap lines stay consistent
    let sEq = sEqCar(st, st.d); const TL = track.length;
    // a ghost on the circuit at racing speed (the track's speed profile) from the capture point: the lane never gets ahead of it
    if (st.sGhost != null) { st.sGhost += track.aiSpeed[track.idxAtS(st.sGhost)] * dt; sEq = Math.min(sEq, st.sGhost); } const s = U.mod(sEq, TL); const ti = track.idxAtS(s);
    car.trk.i = ti; car.trk.s = s; car.trk.along = 0; car.trk.lat = (car.x - track.x[ti]) * track.nx[ti] + (car.z - track.z[ti]) * track.nz[ti]; car.trk.dist = Math.abs(car.trk.lat);
    if (race.started) car.dist = st.distBase + sEq; car._prevS = s;
    // engine note: pit limiter in second gear
    const GE = EI.CAR.GEARS; const av = st.v; let g = 0; while (g < GE.length - 1 && av > GE[g]) g++; const lo = g === 0 ? 0 : GE[g - 1], hi = GE[g];
    car.gear = av < 0.5 ? 0 : g + 1; const frac = U.clamp((av - lo) / (hi - lo), 0, 1); const target = av < 0.5 ? 0.14 : 0.38 + 0.62 * frac; car.rpm += (target - car.rpm) * Math.min(1, dt * 18);
  }
  function beginService(car, race) {
    const st = car.pit, b = st.box; st.phase = 'service';
    const rng = race.rng; const scale = 1.1 + rng() * 0.45;   // the same crews for players and bots
    const corners = []; for (let w = 0; w < 4; w++) { const off = scale * (0.55 + rng() * 0.15); const on = off + scale * (0.55 + rng() * 0.2); const done = on + scale * (0.3 + rng() * 0.12); corners.push({ off, on, done }); }
    if (rng() < 0.04) { const c = corners[Math.floor(rng() * 4)]; const extra = 0.5 + rng() * 1.0; c.on += extra; c.done += extra; } // a sticky wheel nut
    let last = 0; for (const c of corners) last = Math.max(last, c.done);
    const serve = Math.max(0, Math.min(car.penServable || 0, car.penalty || 0));
    if (serve > 0) { for (const c of corners) { c.off += serve; c.on += serve; c.done += serve; } last += serve; car.penalty -= serve; car.penServable = 0; car.penServed = (car.penServed || 0) + serve; }
    const plan = { t: 0, serve, corners, jackUp: 0.15 + serve, jackDown: last + 0.12, release: last + 0.37, oldKey: car.tyreKey, newKey: st.next || otherCompound(car.tyreKey) };
    st.plan = plan; b.plan = plan; b.car = car; b.oldKey = plan.oldKey; b.newKey = plan.newKey;
  }
  function liftAt(pl, which) { const o = which === 'F' ? 0 : 0.05; return 0.075 * sstep(pl.jackUp + o, pl.jackUp + o + 0.22, pl.t) * (1 - sstep(pl.jackDown + o, pl.jackDown + o + 0.14, pl.t)); }
  function endService(car, race) {
    const st = car.pit, b = st.box, pl = st.plan;
    car.tyreKey = pl.newKey; car.tyre = EI.TYRES[pl.newKey]; car.wear = 0; st.stops++; st.served = true; st.phase = 'leave'; (car.compounds || (car.compounds = {}))[pl.newKey] = true;
    st.lastStop = { time: pl.t, key: pl.newKey, lap: car.lap }; st.next = otherCompound(car.tyreKey);
    if (car._pitWheels) for (const w of car._pitWheels) { w.spin.visible = true; setWheelCompound(w, pl.newKey); }
    b.green = 1.4; b.owner = b.queue.shift() || null; b.tRel = race.time;
    race.emit('pitStop', { car, time: pl.t, tyre: pl.newKey, hold: Math.max(0, pl.t - pl.release) });
    if (car.isPlayer) uiFlash(car, 'RELEASE', 'good', 1.6);
  }
  function releaseCar(car, track, race) {
    const st = car.pit; const d = L.dRel * L.ds; pathAt(d, P0); const o = laneOffset(st, d);
    car.x = P0.x + P0.gx * o; car.z = P0.z + P0.gz * o; car.y = P0.y; car.heading = Math.atan2(P0.tz, P0.tx); car.v = st.v; car.vLat = 0; car.yaw = 0; car.steer = 0; car.gradeNow = 0;
    car.trk.i = -1; track.project(car.x, car.z, null, car.trk); car._prevS = car.trk.s;
    const sR = sEqCar(st, d); let dw = car.trk.s - U.mod(sR, track.length); dw -= Math.round(dw / track.length) * track.length;
    if (race.started) car.dist = st.distBase + sR + dw;
    st.active = false; st.phase = null; st.request = false; st.box = null; st.plan = null; st.prevS = car.trk.s; st.tOut = race.time;
    st.lastStop && (st.lastStop.laneTime = race.time - st.tIn);
    if (!car.isPlayer) Strat.newSet(car);
    if (car._pitWheels) for (const w of car._pitWheels) w.spin.visible = true;
    if (car.isPlayer) uiFlash(car, 'PIT EXIT', 'muted', 1.2);
  }

  // ---------------------------------------------------------------- bots: approach the pit entry, then hand over to the lane
  Pit.driveBot = function (ai, dt, race, cars) {
    if (!R || R.race !== race || !L) return false;
    const car = ai.car, st = car.pit; if (!st) return false; const inp = car.input;
    if (st.active) { inp.throttle = 1; inp.brake = 0; inp.steer = 0; inp.drs = false; inp.ers = false; inp.reverse = false; return true; }
    if (!st.request || car.finished || !race.started) return false;
    const t = race.track; const dTo = U.mod(L.sCap - car.trk.s, t.length); if (dTo > L.appr || dTo < 0.5) return false;
    const i = car.trk.i, av = Math.abs(car.v); const look = 7 + av * 0.35; const j = (i + Math.round(look / t.ds)) % t.n;
    const latT = L.side * (t.halfWidth - 2.0); const blend = U.clamp((L.appr - dTo) / (L.appr * 0.4), 0, 1);
    const lat = U.lerp(t.lineOff[j] + ai.offset, latT, blend);
    const tx = t.x[j] + t.nx[j] * lat, tz = t.z[j] + t.nz[j] * lat; const err = U.wrapAngle(Math.atan2(tz - car.z, tx - car.x) - car.heading);
    inp.steer = U.clamp(-err * 2.2, -1, 1); if (car.v < 0) inp.steer *= -1;
    let vt = Infinity; const lk = Math.round((4 + av * 0.12) / t.ds); for (let k = 0; k <= lk; k += 2) vt = Math.min(vt, t.aiSpeed[(i + k) % t.n]); vt *= ai.speedFactor;
    vt = Math.min(vt, Math.sqrt(L.vAuto[L.dCap] ** 2 + 2 * L.apprDec * dTo));
    for (const o of cars) { if (o === car) continue; let dsx = o.trk.s - car.trk.s; if (dsx > t.length / 2) dsx -= t.length; if (dsx < -t.length / 2) dsx += t.length; if (dsx > 0 && dsx < 30 && Math.abs(o.trk.lat - car.trk.lat) < 2.6) vt = Math.min(vt, Math.max(4, o.v + (dsx - 8) * 1.0)); }
    const vErr = vt - av;
    if (vErr > 0.8) { inp.throttle = U.clamp(vErr / 3, 0.35, 1); inp.brake = 0; } else if (vErr < -0.6) { inp.throttle = 0; inp.brake = U.clamp(-vErr / 6, 0.15, 1); } else { inp.throttle = 0.5; inp.brake = 0; }
    inp.drs = false; inp.ers = false; inp.reverse = false;
    return true;
  };

  // ================================================================ render-time: crews, props, lamps, wheels, UI
  const _hub = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _sc = new THREE.Vector3(1, 1, 1);
  Pit.frame = function (race, dt) {
    if (!R || R.race !== race || !V) return;
    try {
      V.t += dt;
      // wheels of cars in service
      for (const car of race.cars) { const st = car.pit; if (!st || !st.active || st.phase !== 'service' || !car._pitWheels) continue; const pl = st.plan; for (const w of car._pitWheels) { const c = pl.corners[cornerOf(w)]; w.spin.visible = !(pl.t >= c.off && pl.t < c.on); if (pl.t >= c.on) setWheelCompound(w, pl.newKey); } }
      // animate people and props only when a camera is near the pit lane
      const cams = (EI.debug && EI.debug.cameras) || []; let near = false; const mid = V.boxes[5] || V.boxes[0];
      for (const c of cams) if (c && c.position.distanceTo(mid.O) < 650) near = true;
      // the crews, engineers and their props (a dozen instanced draws, ~100k triangles) are only drawn within a few hundred metres
      // of the pit lane (street circuits: closer, the city hides them sooner)
      { const street = !!(L.track && L.track.data.street); let dmin = Infinity; for (const c of cams) if (c) dmin = Math.min(dmin, c.position.distanceTo(mid.O)); const kq = EI.quality === 'low' ? 0.55 : 1, vis = dmin < (street ? 260 : 330) * kq, vis2 = dmin < (street ? 380 : 480) * kq;   // low: crews within ~145-180 m (PERF)
        // the garage interiors, lane paint, screens and signs (small, many draws) also drop out beyond ~380 m; the lane and the garage shells stay
        if (V._crewVis !== vis || V._pitVis !== vis2) { V._crewVis = vis; V._pitVis = vis2; V.group.traverse(o => { if (o.isInstancedMesh && /^pit-/.test(o.name)) o.visible = vis; else if (o.isMesh && o.userData.pitFar) o.visible = vis2; }); } }
      // street circuit: no pose work at all while the crews are hidden (they are re-posed the frame they come back into range)
      // all boxes idle (no car coming in, in service or just released): the slow idle sway and the walkers are posed at ~20 Hz
      // instead of every frame (~1.3-2.2 ms a frame on the grid with 11 crews in view, PERF); a stop anywhere animates every frame
      let busy = false; for (const b of V.boxes) if (b.state !== 'idle') { busy = true; break; }
      V._animDt = Math.min(0.25, (V._animDt || 0) + dt);
      // an idle box more than ~70 m from every camera keeps its last pose (its slow sway is invisible from there): only the crews
      // near a camera are re-posed - at the grid that is 2-3 boxes instead of all 11 (Pit.frame was 1-4 ms a frame there, PERF)
      if (V.posed) for (const b of V.boxes) { let d2 = Infinity; if (b.state === 'idle' && b._idlePosed) for (const c of cams) if (c) d2 = Math.min(d2, c.position.distanceToSquared(b.O)); b._still = d2 > 4900; }
      if ((V._crewVis && near && (busy || V._animDt >= 0.05)) || !V.posed) { animatePeople(race, V._animDt); V._animDt = 0; V.posed = true; for (const b of V.boxes) b._idlePosed = b.state === 'idle'; }
      updateLamps();
      updateUI(race, dt);
    } catch (e) { if (!V.err) { V.err = true; console.error('Pit.frame', e); } }
  };
  function cornerOf(w) { return (w.x > 0 ? 0 : 2) + (w.z > 0 ? 1 : 0); }
  // crew state per box, advanced on race time so visuals match the stop even when frames are sparse
  function stepBox(b, race, dt) {
    const now = race.time;
    const serving = !!(b.car && b.car.pit.active && b.car.pit.box === b && b.car.pit.phase === 'service');
    const coming = (b.owner && b.owner.pit.active && b.owner.pit.d > b.d - 260) || b.queue.length > 0;
    b.green = Math.max(0, b.green - dt);
    if (b.owner && !serving) { b.newKey = b.owner.pit.next || b.newKey; b.oldKey = b.owner.tyreKey; }
    if (b.state === 'idle' && coming) { b.state = 'out'; b.t0 = now; b.plan = null; b.car = null; }
    if (b.state === 'return' && coming) { b.state = 'out'; b.t0 = now - b.p * 1.7; }
    if (b.state === 'out') {
      b.p = serving ? 1 : U.clamp((now - b.t0) / 1.7, 0, 1);
      if (b.plan && !serving && b.tRel != null && now - b.tRel > 1.6) {
        if (coming && b.owner && b.owner !== b.car) { b.plan = null; b.car = null; }      // the team-mate is next: get ready again
        else if (!coming) { b.state = 'return'; b.t0 = now; }
      }
    }
    if (b.state === 'return') { b.p = U.clamp(1 - (now - b.t0) / 2.8, 0, 1); if (b.p <= 0) { b.state = 'idle'; b.plan = null; b.car = null; } }
  }
  function updateLamps() {
    const L2 = V.lamps;
    V.boxes.forEach((b, k) => {
      const inService = b.plan && b.car && b.car.pit.active && b.car.pit.phase === 'service';
      const red = inService || (b.state === 'out' && !b.green), green = b.green > 0;
      L2.setColorAt(2 * k, red ? _c.setRGB(3, 0.15, 0.1) : _c.setRGB(0.18, 0.02, 0.02));
      L2.setColorAt(2 * k + 1, green ? _c.setRGB(0.2, 3, 0.5) : _c.setRGB(0.02, 0.14, 0.04));
      if (!V.lampsPlaced) { for (let j = 0; j < 2; j++) { const lp = V.lampPos[2 * k + j]; const f = frameAt(lp[0], lp[2], lp[1]); _v.set(0, 0, 0).applyMatrix4(f); _m.makeTranslation(_v.x, _v.y, _v.z); L2.setMatrixAt(2 * k + j, _m); } }
    });
    V.lampsPlaced = true; L2.instanceMatrix.needsUpdate = true; L2.instanceColor.needsUpdate = true;
  }
  // crew spots around the car in the box (car space)
  function stopSpot(f, out) {
    const w = f.w; const fs = w >= 0 ? (w < 2 ? 1 : -1) : 0; const sz = w >= 0 ? (WZ[w] > 0 ? 1 : -1) : 0;
    switch (f.role) {
      case 'gun': out.x = WX[w]; out.z = sz * 1.42; out.fx = 0; out.fz = -sz; break;
      case 'off': out.x = WX[w] - fs * 0.74; out.z = sz * 1.5; out.fx = 0; out.fz = -sz; break;
      case 'on': out.x = WX[w] + fs * 0.8; out.z = sz * 1.62; out.fx = 0; out.fz = -sz; break;
      case 'jackF': out.x = 4.45; out.z = 0; out.fx = -1; out.fz = 0; break;
      case 'jackR': out.x = -4.15; out.z = 0; out.fx = 1; out.fz = 0; break;
      default: out.x = 3.7; out.z = 2.0 * L.gsign; out.fx = -0.6; out.fz = -0.8 * L.gsign; break;
    }
    return out;
  }
  const SP = {}, _w1 = new THREE.Vector3(), _w2 = new THREE.Vector3(), _hands = new THREE.Vector3();
  function animatePeople(race, dt) {
    const T = V.t; const tyreSlots = new Array(V.boxes.length * 8).fill(null), gunSlots = new Array(V.boxes.length * 4).fill(null), jackSlots = new Array(V.boxes.length * 2).fill(null);
    for (const b of V.boxes) {
      if (b._still) continue;   // idle and far from every camera: posed once, left as it is (PERF)
      const pl = b.plan && b.car && b.car.pit.active && b.car.pit.box === b ? b.plan : null; const inServ = pl && b.car.pit.phase === 'service';
      const carNear = b.owner && b.owner.pit.active && b.owner.pit.phase === 'in' && b.owner.pit.d > b.d - 18;
      const after = b.plan && !inServ; // car released, crew still out
      const tt = pl ? pl.t : 0;
      for (const f of b.crew) {
        stopSpot(f, SP);
        // garage spot and stop spot in world space
        gl(b, f.idle.x, f.idle.z, _w1); const idleYaw = yawOf(-b.G.x, -b.G.z);
        bl(b, SP.x, SP.z, _w2); const stopYaw = yawOf(b.fwd.x * SP.fx + b.right.x * SP.fz, b.fwd.z * SP.fx + b.right.z * SP.fz);
        f.y = b.O.y; f.visible = true; f.carry = null; f.gun = f.role === 'gun' && b.state !== 'idle';
        if (b.state === 'idle') { f.x = _w1.x; f.z = _w1.z; f.yaw = idleYaw + Math.sin(T * 0.3 + f.ph) * 0.25; idlePose(f, T); continue; }
        if (b.p < 1) { // running out / walking back
          const u = b.state === 'out' ? sstep(0, 1, b.p) : sstep(0, 1, b.p);
          f.x = U.lerp(_w1.x, _w2.x, u); f.z = U.lerp(_w1.z, _w2.z, u);
          const dir = b.state === 'out' ? 1 : -1; f.yaw = yawOf((_w2.x - _w1.x) * dir, (_w2.z - _w1.z) * dir);
          walkPose(T * (b.state === 'out' ? 11 : 7.5) + f.ph, b.state === 'out', f.pose);
          if (f.role === 'on' && b.state === 'out') f.carry = 'new'; if (f.role === 'off' && b.state === 'return' && b.plan) f.carry = 'old';
          if (f.carry) { f.pose.shL = f.pose.shR = 0.6; f.pose.elL = f.pose.elR = 0.95; f.pose.abL = f.pose.abR = 0.32; }
          continue;
        }
        f.x = _w2.x; f.z = _w2.z; f.yaw = stopYaw;
        const c = f.w >= 0 && pl ? pl.corners[f.w] : null; const sz = f.w >= 0 ? (WZ[f.w] > 0 ? 1 : -1) : 0;
        switch (f.role) {
          case 'gun': {
            if (inServ || carNear) { copyPose(POSES.kneel, f.pose); if (c && ((tt > c.off - 0.3 && tt < c.off) || (tt > c.on && tt < c.done))) { f.pose.shR += 0.05 * Math.sin(T * 70); f.pose.shL += 0.05 * Math.sin(T * 70 + 1); } }
            else if (after) blendPose(POSES.kneel, POSES.stand, 0.6, f.pose); else copyPose(POSES.ready, f.pose);
            break;
          }
          case 'off': {
            if (inServ && c) {
              if (tt < c.off - 0.3) copyPose(POSES.ready, f.pose);
              else if (tt < c.off) blendPose(POSES.ready, POSES.crouch, (tt - c.off + 0.3) / 0.3, f.pose);
              else { const u = U.clamp((tt - c.off) / 0.35, 0, 1); blendPose(POSES.crouch, POSES.carry, u, f.pose); f.x += b.right.x * sz * 0.65 * u; f.z += b.right.z * sz * 0.65 * u; f.carry = 'old'; f.carryU = u; }
            } else if (after) { copyPose(POSES.carry, f.pose); f.x += b.right.x * sz * 0.65; f.z += b.right.z * sz * 0.65; f.carry = 'old'; f.carryU = 1; }
            else copyPose(carNear ? POSES.crouch : POSES.ready, f.pose);
            break;
          }
          case 'on': {
            if (inServ && c) {
              if (tt < c.on - 0.45) { copyPose(POSES.carry, f.pose); f.carry = 'new'; f.carryU = 0; }
              else if (tt < c.on) { const u = (tt - c.on + 0.45) / 0.45; blendPose(POSES.carry, POSES.crouch, u, f.pose); f.x -= b.right.x * sz * 0.5 * u; f.z -= b.right.z * sz * 0.5 * u; f.carry = 'new'; f.carryU = u; }
              else { const u = U.clamp((tt - c.on) / 0.3, 0, 1); blendPose(POSES.crouch, POSES.ready, u, f.pose); f.x -= b.right.x * sz * 0.5 * (1 - u); f.z -= b.right.z * sz * 0.5 * (1 - u); }
            } else if (after) copyPose(POSES.stand, f.pose);
            else { copyPose(POSES.carry, f.pose); f.carry = 'new'; f.carryU = 0; }
            break;
          }
          case 'jackF': case 'jackR': {
            const o = f.role === 'jackF' ? 0 : 0.05; const dirx = f.role === 'jackF' ? 1 : -1;
            if (inServ) { const up = sstep(pl.jackUp + o, pl.jackUp + o + 0.22, tt) * (1 - sstep(pl.jackDown + o, pl.jackDown + o + 0.14, tt)); blendPose(POSES.jack, POSES.pull, up, f.pose); const back = sstep(pl.jackDown + 0.1, pl.jackDown + 0.35, tt) * 1.1; f.x += b.fwd.x * dirx * back; f.z += b.fwd.z * dirx * back; }
            else if (after) { copyPose(POSES.jack, f.pose); f.x += b.fwd.x * dirx * 1.1; f.z += b.fwd.z * dirx * 1.1; }
            else { copyPose(POSES.jack, f.pose); f.x += b.fwd.x * dirx * 0.5; f.z += b.fwd.z * dirx * 0.5; }
            f.jack = true; break;
          }
          default: { // chief mechanic: arm up while the stop is on, drops it for the release
            if (inServ) { copyPose(tt < pl.release - 0.15 ? POSES.armup : POSES.stand, f.pose); } else copyPose(POSES.stand, f.pose);
          }
        }
      }
    }
    // static figures: engineers and walkers
    for (const f of V.figs) {
      if (f.box && f.box._still) continue;
      if (f.role === 'gareng' || f.role === 'walleng') { copyPose(POSES.seat, f.pose); f.pose.hy = Math.sin(T * 0.4 + f.ph) * 0.35; f.pose.elL += Math.sin(T * 9 + f.ph) * 0.08; f.pose.elR += Math.sin(T * 8 + f.ph * 2) * 0.08; f.pose.sp = 0.05 + Math.sin(T * 0.25 + f.ph) * 0.06; }
      else if (f.role === 'walker') {
        const w = f.walk; const lenW = w.d1 - w.d0; w.u += dt * w.v / lenW * w.dir; if (w.u > 1) { w.u = 1; w.dir = -1; } if (w.u < 0) { w.u = 0; w.dir = 1; }
        const d = U.lerp(w.d0, w.d1, w.u); pathAt(d, P0); f.x = P0.x + P0.gx * w.o; f.z = P0.z + P0.gz * w.o; f.y = P0.y + (w.o < 0 ? 0.36 : 0.0); f.yaw = yawOf(P0.tx * w.dir, P0.tz * w.dir);
        walkPose(V.t * 2 * Math.PI * w.v / 1.5 + f.ph, false, f.pose);
      }
    }
    for (const f of V.figs) if (!(f.box && f.box._still)) writeFigure(f.i, f);
    // props
    for (const b of V.boxes) {
      const pl = b.plan; const car = b.car; const k = b.k;
      for (const f of b.crew) {
        if (f.role === 'gun') { const slot = k * 4 + f.w; if (f.gun) { _hands.addVectors(f.handL, f.handR).multiplyScalar(0.5); gunSlots[slot] = [_hands.x, _hands.y, _hands.z, f.yaw]; } }
        if ((f.role === 'on' || f.role === 'off') && f.carry) {
          const slot = k * 8 + (f.carry === 'new' ? 0 : 4) + f.w; _hands.addVectors(f.handL, f.handR).multiplyScalar(0.5); _hands.x += Math.cos(f.yaw) * 0.18; _hands.z += Math.sin(f.yaw) * 0.18; _hands.y = Math.max(_hands.y, b.O.y + 0.36);
          // blend with the hub while the wheel is coming off / going on
          if (pl && car) { const w = f.w; const lift = car.pit && car.pit.plan === pl ? (liftAt(pl, w < 2 ? 'F' : 'R')) : 0; bl(b, WX[w], WZ[w] * 1.0, _hub); _hub.y = b.O.y + 0.36 + lift; const u = f.carry === 'old' ? 1 - (f.carryU != null ? f.carryU : 1) : (f.carryU || 0); if (u > 0) _hands.lerp(_hub, u); }
          const keyc = f.carry === 'new' ? b.newKey : b.oldKey; tyreSlots[slot] = [_hands.x, _hands.y, _hands.z, Math.atan2(b.right.z, b.right.x), EI.TYRES[keyc] ? EI.TYRES[keyc].color : '#ffffff'];
        }
        if (f.jack) {
          const slot = k * 2 + (f.role === 'jackF' ? 0 : 1); const front = f.role === 'jackF'; f.jack = false;
          const serv = pl && car && car.pit.active && car.pit.plan === pl && car.pit.phase === 'service';
          _hands.addVectors(f.handL, f.handR).multiplyScalar(0.5);
          if (serv && pl.t < pl.jackDown + 0.12) { bl(b, front ? 3.15 : -2.75, 0, _b); _b.y = b.O.y + 0.14 + liftAt(pl, front ? 'F' : 'R'); }
          else { _b.set(f.x + Math.cos(f.yaw) * 0.95, b.O.y + 0.1, f.z + Math.sin(f.yaw) * 0.95); }
          if (b.state !== 'idle') jackSlots[slot] = [_hands.clone(), _b.clone()];
        }
      }
    }
    tyreSlots.forEach((s, i) => { if (!s) { V.tyres.setMatrixAt(i, ZERO); return; } _q.setFromAxisAngle(_up, -s[3]); _v.set(s[0], s[1], s[2]); _m.compose(_v, _q, _sc); V.tyres.setMatrixAt(i, _m); V.tyres.setColorAt(i, _c.set(s[4]).convertSRGBToLinear()); });
    gunSlots.forEach((s, i) => { if (!s) { V.guns.setMatrixAt(i, ZERO); return; } _q.setFromAxisAngle(_up, -s[3]); _v.set(s[0], s[1], s[2]); _m.compose(_v, _q, _sc); V.guns.setMatrixAt(i, _m); });
    jackSlots.forEach((s, i) => { if (!s) { V.jacks.setMatrixAt(i, ZERO); return; } const a = s[1], bb = s[0]; _v.subVectors(bb, a); const len = _v.length(); _q.setFromUnitVectors(_up, _v.normalize()); _v2.set(1, len, 1); _m.compose(a, _q, _v2); V.jacks.setMatrixAt(i, _m); });
    for (const k in V.fig) { V.fig[k].instanceMatrix.needsUpdate = true; }
    V.tyres.instanceMatrix.needsUpdate = true; V.tyres.instanceColor.needsUpdate = true; V.guns.instanceMatrix.needsUpdate = true; V.jacks.instanceMatrix.needsUpdate = true;
  }
  function idlePose(f, T) {
    const st = f.idle.style; const p = f.pose;
    if (st === 'crossed') copyPose(POSES.crossed, p); else if (st === 'lean') copyPose(POSES.lean, p); else copyPose(POSES.stand, p);
    p.sp += Math.sin(T * 1.3 + f.ph) * 0.02; p.hy = Math.sin(T * 0.37 + f.ph * 3) * 0.4;
    if (st === 'lean') { p.elL += Math.sin(T * 3 + f.ph) * 0.25; p.elR += Math.sin(T * 2.6 + f.ph) * 0.25; }
    if (st === 'stand' && Math.sin(T * 0.21 + f.ph) > 0.7) { p.shR = 0.6 + Math.sin(T * 4 + f.ph) * 0.3; p.elR = 1.2; } // talking with gestures
  }

  // ================================================================ input: P / Backspace must reach the race instead of pausing
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyP' && e.code !== 'Backspace') return;
    const race = EI.debug && EI.debug.race; if (!race || !R || R.race !== race) return;
    const pause = document.getElementById('pause'); if (pause && !pause.classList.contains('hidden')) return;
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    if (EI.Input && EI.Input.keys) EI.Input.keys[e.code] = true;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);

  // ================================================================ pit HUD
  function ensureUI() {
    if (document.getElementById('pit-style')) return;
    const css = document.createElement('style'); css.id = 'pit-style';
    css.textContent = [
      '#pitui { position: absolute; inset: 0; pointer-events: none; z-index: 3; }',
      '#pitui .pitp { position: absolute; display: flex; justify-content: center; pointer-events: none; }',
      '#pitui .pt { margin-top: calc(66px * var(--s, 1)); transform: scale(var(--s, 1)); transform-origin: top center; display: none; flex-direction: column; align-items: center; gap: 6px; font-family: var(--font, "Titillium Web", Arial, sans-serif); text-transform: uppercase; color: #f4f6f9; }',
      '#pitui .pt.on { display: flex; animation: ptIn 0.35s cubic-bezier(.2,.9,.3,1.15); }',
      '#pitui .pt-bar { display: flex; align-items: stretch; height: 38px; background: linear-gradient(180deg, rgba(22,26,34,0.9), rgba(9,11,16,0.94)); border: 1px solid rgba(255,255,255,0.14); border-radius: 6px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.45); }',
      '#pitui .pt-tag { display: flex; align-items: center; padding: 0 12px; font-weight: 900; font-style: italic; font-size: 16px; letter-spacing: 2px; background: #1a73e8; color: #fff; }',
      '#pitui .pt.bad .pt-tag { background: #e10600; } #pitui .pt.good .pt-tag { background: #23b257; } #pitui .pt.lim .pt-tag { background: #1a73e8; animation: ptBlink 0.9s steps(2) infinite; }',
      '#pitui .pt-main { display: flex; align-items: center; padding: 0 14px; font-weight: 900; font-size: 17px; letter-spacing: 1.5px; white-space: nowrap; }',
      '#pitui .pt-ty { display: flex; align-items: center; gap: 7px; padding: 0 14px 0 10px; font-weight: 700; font-size: 14px; letter-spacing: 1px; border-left: 1px solid rgba(255,255,255,0.12); }',
      '#pitui .pt-ty i { width: 18px; height: 18px; border-radius: 50%; border: 4px solid #ffd200; background: #111; box-sizing: border-box; display: inline-block; }',
      '#pitui .pt-sub { font-size: 12.5px; font-weight: 700; letter-spacing: 1.5px; color: #c9d2df; background: rgba(9,11,16,0.72); padding: 3px 12px; border-radius: 4px; white-space: nowrap; }',
      '#pitui .pt-big { font-size: 46px; font-weight: 900; font-style: italic; line-height: 1; letter-spacing: -1px; text-shadow: 0 3px 14px rgba(0,0,0,0.85); font-variant-numeric: tabular-nums; }',
      '#pitui .pt-big:empty, #pitui .pt-sub:empty { display: none; }',
      '#pitui .pt.good .pt-big { color: #2fe36d; }',
      '#pitui .rk { position: absolute; left: 50%; top: calc(66px * var(--s, 1)); transform: translateX(-50%) scale(var(--s, 1)); transform-origin: top center; display: flex; align-items: center; gap: 9px; padding: 5px 13px 5px 8px; border-radius: 5px; background: rgba(9,11,16,0.78); border: 1px solid rgba(255,255,255,0.1); font-family: var(--font, "Titillium Web", Arial, sans-serif); color: #eef2f7; white-space: nowrap; opacity: 0; transition: opacity 0.25s, top 0.25s; }',
      '#pitui .pitp.pit-on .rk { top: calc(150px * var(--s, 1)); }',
      '#pitui .rk.on { opacity: 1; }',
      '#pitui .rk i { width: 16px; height: 12px; border-radius: 2px; flex: none; background: #8a93a3; }',
      '#pitui .rk.warn i { background: #ffd200; } #pitui .rk.pen i { background: #e10600; } #pitui .rk.blue i { background: #1e5bff; } #pitui .rk.ok i { background: #2fe36d; } #pitui .rk.ot i { background: #ff8a1f; }',
      '#pitui .rk.bw i { background: linear-gradient(135deg, #111 50%, #f4f4f4 50%); border: 1px solid rgba(255,255,255,0.5); }',
      '#pitui .rk b { font-weight: 900; font-size: 13.5px; letter-spacing: 1.2px; text-transform: uppercase; }',
      '#pitui .rk span { font-weight: 600; font-size: 12.5px; color: #b9c2cf; letter-spacing: 0.3px; }',
      '#pitui .rk span:empty { display: none; }',
      '@keyframes ptIn { from { opacity: 0; transform: translateY(-8px) scale(var(--s, 1)); } to { opacity: 1; transform: translateY(0) scale(var(--s, 1)); } }',
      '@keyframes ptBlink { 0% { background: #1a73e8; } 100% { background: #0d3f86; } }',
    ].join('\n');
    document.head.appendChild(css);
    if (!document.getElementById('pitui')) { const d = document.createElement('div'); d.id = 'pitui'; (document.getElementById('app') || document.body).appendChild(d); }
  }
  function resetUI(race) {
    ensureUI(); const root = document.getElementById('pitui'); root.innerHTML = '';
    R.ui = race.players.map((car, k) => {
      const el = document.createElement('div'); el.className = 'pitp';
      el.innerHTML = '<div class="pt"><div class="pt-bar"><span class="pt-tag">PIT</span><span class="pt-main"></span><span class="pt-ty"><i></i><b></b></span></div><div class="pt-sub"></div><div class="pt-big"></div></div><div class="rk"><i></i><b></b><span></span></div>';
      root.appendChild(el);
      const q = (s) => el.querySelector(s);
      return { car, k, el, box: q('.pt'), tag: q('.pt-tag'), main: q('.pt-main'), ty: q('.pt-ty'), tyI: q('.pt-ty i'), tyB: q('.pt-ty b'), sub: q('.pt-sub'), big: q('.pt-big'), rk: q('.rk'), rkB: q('.rk b'), rkS: q('.rk span'), note: null, noteUntil: -1, rkCls: '', flash: null, flashUntil: -1, cls: '', shown: false, rect: '' };
    });
  }
  // rules messages for a player (race.js stewards): one line, the newest replaces the last; blue flag / give back stay while they apply
  Pit.notify = function (car, title, sub, cls, dur) { if (!R || !R.ui) return; const u = R.ui.find(x => x.car === car); if (!u) return; u.note = { title, sub: sub || '', cls: cls || 'warn' }; u.noteUntil = (R.race ? R.race.time : 0) + (dur || 2.5); };
  function updateNote(u, race) {
    const car = u.car, rl = car.rules; let n = u.note && race.time < u.noteUntil ? u.note : null;
    if (!n && rl && rl.give) { const left = Math.max(0, Math.ceil(rl.give.until - race.time)); n = { title: 'GIVE THE POSITION BACK', sub: rl.give.cars.map(o => o.driver && o.driver.code || o.name).join(', ') + ' · ' + left + ' s', cls: 'warn' }; }
    const on = !!n; if (on !== u.rkOn) { u.rkOn = on; u.rk.classList.toggle('on', on); }
    if (!n) return;
    if (u.rkCls !== n.cls) { if (u.rkCls) u.rk.classList.remove(u.rkCls); u.rk.classList.add(n.cls); u.rkCls = n.cls; }
    setT(u.rkB, n.title); setT(u.rkS, n.sub);
  }
  function uiFlash(car, text, cls, dur) { if (!R || !R.ui) return; const u = R.ui.find(x => x.car === car); if (!u) return; u.flash = { text, cls: cls || 'info' }; u.flashUntil = (R.race ? R.race.time : 0) + (dur || 2.2); }
  const setT = (el, s) => { if (el._v !== s) { el._v = s; el.textContent = s; } };
  function updateUI(race, dt) {
    if (!R.ui || !R.ui.length) return;
    if (race.started && !R.toastDone && EI.HUD) { R.toastDone = true; EI.HUD.toast((race.players.length > 1 ? 'Pit stop: P1 P + 1/2/3 · P2 Backspace + 8/9/0' : 'Pit stop: P to call the car in · 1/2/3 choose soft / medium / hard')); }
    const vps = (EI.debug && EI.debug.viewports) || [];
    for (const u of R.ui) {
      const vp = vps[u.k]; if (vp && vp.el) { const r = vp.el.style.cssText; if (r !== u.rect) { u.rect = r; const s = vp.el.style; u.el.style.left = s.left; u.el.style.top = s.top; u.el.style.width = s.width; u.el.style.height = s.height; const sc = U.clamp(Math.min((vp.w || 1280) / 1280, (vp.h || 720) / 720), 0.64, 1.3); u.el.style.setProperty('--s', sc.toFixed(3)); } }
      const car = u.car, st = car.pit; if (!st) continue;
      updateNote(u, race);
      let show = false, tag = 'PIT', main = '', sub = '', big = '', cls = 'info', tyre = st.next;
      if (st.active) {
        show = true; const d = st.d;
        if (st.phase === 'service') { tag = 'BOX'; main = 'PIT STOP'; big = st.plan.t.toFixed(2) + ' s'; cls = 'bad'; tyre = st.plan.newKey; sub = st.plan.serve && st.plan.t < st.plan.serve ? 'SERVING ' + st.plan.serve + ' S PENALTY · ' + Math.ceil(st.plan.serve - st.plan.t) : 'CHANGING TO ' + EI.TYRES[st.plan.newKey].name.toUpperCase(); }
        else if (st.phase === 'leave' && st.lastStop && d < st.box.d + 40) { tag = 'GO'; main = 'RELEASE'; big = st.lastStop.time.toFixed(2) + ' s'; cls = 'good'; tyre = st.lastStop.key; }
        else if (st.phase === 'wait') { tag = 'BOX'; main = 'WAIT · CAR IN THE BOX'; cls = 'bad'; }
        else if (d < L.dLimIn) { const m = Math.max(0, L.dLimIn - d); tag = 'PIT'; main = 'PIT LANE · LIMIT IN ' + Math.round(m) + ' M'; sub = (car.v > LIMIT + 0.1 ? 'BRAKE · ' : '') + Math.round(car.v * 3.6) + ' KM/H · LIMIT ' + kmh(); cls = car.v > LIMIT + 0.5 && m < 120 ? 'bad' : 'info'; }
        else if (d <= L.dLimOut) { tag = 'LIM'; main = 'PIT LIMITER  ' + kmh(); cls = 'lim'; sub = Math.round(car.v * 3.6) + ' KM/H' + (st.phase === 'in' && st.box ? ' · BOX IN ' + Math.max(0, Math.round(st.box.d - d)) + ' M' : ''); if (st.lastStop && st.served) { big = st.lastStop.time.toFixed(2) + ' s'; } }
        else { tag = 'PIT'; main = 'LIMITER OFF · PIT EXIT'; cls = 'good'; }
        if (st.speeding && d < L.dLimIn + 80) { sub = 'PIT LANE SPEEDING · +' + st.speeding + ' S'; cls = 'bad'; }
      } else if (st.request && !car.finished) {
        show = true; tag = 'BOX'; main = 'PIT REQUESTED'; const dTo = U.mod(L.sCap - car.trk.s, race.track.length);
        sub = dTo < 700 ? 'PIT ENTRY ' + Math.round(dTo) + ' M · KEEP ' + (L.side < 0 ? 'RIGHT' : 'LEFT') : (u.k === 0 ? '1 SOFT · 2 MEDIUM · 3 HARD · P CANCEL' : '8 SOFT · 9 MEDIUM · 0 HARD · BKSP CANCEL');
        cls = dTo < 700 ? 'bad' : 'info';
      } else if (st.tOut != null && race.time - st.tOut < 3 && st.lastStop) { show = true; tag = 'PIT'; main = 'STOP ' + st.lastStop.time.toFixed(2) + ' S · LANE ' + (st.lastStop.laneTime || 0).toFixed(1) + ' S'; cls = 'good'; tyre = st.lastStop.key; }
      if (u.flash && race.time < u.flashUntil && !(st.active && st.phase === 'service')) { show = true; if (!st.active && !st.request) { main = u.flash.text; tag = 'PIT'; sub = ''; big = ''; } else if (!st.active) sub = u.flash.text; cls = u.flash.cls === 'muted' ? cls : u.flash.cls; if (u.flash.text === 'RELEASE' || /SPEEDING|MISSED/.test(u.flash.text)) { main = u.flash.text; } }
      if (show !== u.shown) { u.shown = show; u.box.classList.toggle('on', show); u.el.classList.toggle('pit-on', show); }
      if (!show) continue;
      if (u.cls !== cls) { u.box.classList.remove(u.cls || 'x'); if (cls) u.box.classList.add(cls); u.cls = cls; }
      setT(u.tag, tag); setT(u.main, main); setT(u.sub, sub); setT(u.big, big);
      const ty = EI.TYRES[tyre] || EI.TYRES.medium; setT(u.tyB, ty.name.toUpperCase()); if (u.tyI._c !== ty.color) { u.tyI._c = ty.color; u.tyI.style.borderColor = ty.color; }
    }
  }

  Pit.layout = () => L;
  Pit.boxes = () => (V ? V.boxes : null);
  Pit.request = (car, key) => { if (!car || !car.pit) return; car.pit.request = true; if (key && EI.TYRES[key]) car.pit.next = key; };
  EI.Pit = Pit;
})();
