// Equation I - HUD in the style of modern F1 games: lap tower, timing box, dash, local minimap, name tags
window.EI = window.EI || {};
(function () {
  const U = EI.U; const $ = (id) => document.getElementById(id);
  const TYRE_LETTER = { soft: 'S', medium: 'M', hard: 'H' };
  const fmt = (t) => U.fmtTime(t);
  // tower: the player's name, a bot's 3-letter code (VER, NOR...)
  const shortName = (o) => o.isPlayer ? o.name : (o.driver.code || o.driver.name.split(' ').pop().slice(0, 3)).toUpperCase();
  // add a class for one animation cycle, re-triggering if it is already running
  function flash(el, cls, ms) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); clearTimeout(el['_t_' + cls]); el['_t_' + cls] = setTimeout(() => el.classList.remove(cls), ms || 900); }
  function setText(el, s) { if (el._v !== s) { el._v = s; el.textContent = s; } }

  // Two players get a purpose-built compact HUD (class 'split'): a single band along the outer edge of each view (P1 along the top
  // of the screen, P2 along the bottom; side by side: corners) with a three-row position tower, a small minimap, the timing box and a
  // short dash, all sized in real pixels from the view size (--u) rather than scaled, plus per-view start lights, banner, toasts
  // and a finished card. The single-player HUD below is unchanged.
  const live = [];   // viewports of the current race
  function splitMarkup(k) {
    let lights = ''; for (let i = 0; i < 5; i++) lights += '<div class="light-col"><span></span><span></span></div>';
    return '<div class="hud">' +
      '<div class="sp-tower panel"><div class="sp-head"><span class="sp-pl">P' + (k + 1) + '</span><div class="tm-pos"><span>POS</span><b>1</b><small>/ 20</small></div><div class="tw-lap"><span>LAP</span><b>1</b><i>/ 1</i></div></div><div class="tw-rows"></div></div>' +
      '<div class="mapwrap"><canvas class="minimap" width="360" height="360"></canvas><i class="map-n"></i></div>' +
      '<div class="sp-timing panel"><div class="tm-time">0:00.000</div><div class="tm-sectors"><span>S1</span><span>S2</span><span>S3</span></div>' +
      '<div class="tm-foot"><span class="tm-last">LAST<b>--:--.---</b></span><span class="tm-best">BEST<b>--:--.---</b></span><span class="delta"></span></div></div>' +
      '<div class="dash panel"><div class="leds"></div><div class="dash-main">' +
      '<div class="ers"><div class="ers-top"><i class="batt"><b></b></i><span class="ers-pct">100%</span></div><div class="ers-bar"><i></i></div><div class="ers-label">ERS</div></div>' +
      '<div class="centre"><div class="gear-wrap"><div class="gear">N</div><div class="rpm"></div></div>' +
      '<div class="speed"><div class="speed-v"><b>0</b><small>KM/H</small></div><div class="pedals"><i class="thr"></i><i class="brk"></i></div></div></div>' +
      '<div class="right"><div class="drs"><b>DRS</b><small>OFF</small></div></div></div></div>' +
      '<div class="msg"><span></span></div><div class="sp-fin"><b></b><span></span></div>' +
      '<div class="sp-lights">' + lights + '</div><div class="sp-banner"></div><div class="sp-toasts"></div>' +
      '<div class="tags"></div><div class="corner"></div><div class="pname"></div></div>';
  }
  function makeViewport(k, car, nPlayers) {
    const split = nPlayers > 1;
    const el = document.createElement('div'); el.className = 'vp' + (split ? ' split p' + (k + 1) : '');
    el.innerHTML = split ? splitMarkup(k) :
      '<div class="hud">' +
      '<div class="tower panel"><div class="tw-head"><div class="tw-label">LAP</div><div class="tw-lap"><b>1</b><i>/ 1</i></div><div class="tw-session">GRAND PRIX</div></div><div class="tw-rows"></div></div>' +
      '<div class="timing panel"><div class="tm-top"><div class="tm-pos"><b>1</b><small>/ 20</small></div><div class="tm-time">0:00.000</div></div>' +
      '<div class="tm-sectors"><span>S1</span><span>S2</span><span>S3</span></div>' +
      '<div class="tm-foot"><span class="tm-last">LAST<b>--:--.---</b></span><span class="tm-best">BEST<b>--:--.---</b></span><span class="delta"></span></div></div>' +
      '<div class="msg"><span></span></div>' +
      '<div class="mapwrap"><canvas class="minimap" width="360" height="360"></canvas><i class="map-n"></i></div>' +
      '<div class="dash panel"><div class="leds"></div><div class="dash-main">' +
      '<div class="ers"><div class="ers-top"><i class="batt"><b></b></i><span class="ers-pct">100%</span></div><div class="ers-bar"><i></i></div><div class="ers-label">ERS</div></div>' +
      '<div class="centre"><div class="gear-wrap"><div class="gear">N</div><div class="rpm"></div></div>' +
      '<div class="speed"><div class="speed-v"><b>0</b><small>KM/H</small></div><div class="pedals"><i class="thr"></i><i class="brk"></i></div></div></div>' +
      '<div class="right"><div class="drs"><b>DRS</b><small>OFF</small></div></div></div></div>' +
      '<div class="tags"></div><div class="corner"></div><div class="pname"></div></div>';
    $('viewports').appendChild(el);
    for (let i = live.length - 1; i >= 0; i--) if (!live[i].el.isConnected) live.splice(i, 1);
    const q = (c) => el.querySelector(c);
    const leds = q('.leds'); for (let i = 0; i < 15; i++) { const d = document.createElement('i'); d.className = i < 5 ? 'g' : i < 10 ? 'r' : 'b'; leds.appendChild(d); }
    // five persistent rows (2 ahead, me, 2 behind) so position flashes and transitions survive updates
    const rowsEl = q('.tw-rows'); const rows = []; const NROWS = split ? 3 : 5;
    for (let i = 0; i < NROWS; i++) {
      const d = document.createElement('div'); d.className = 'lp-row empty';
      d.innerHTML = '<span class="p"></span><span class="bar"></span><span class="n"></span><span class="ty"></span><span class="g"></span>';
      rowsEl.appendChild(d); rows.push({ el: d, p: d.children[0], bar: d.children[1], n: d.children[2], ty: d.children[3], g: d.children[4] });
    }
    const r = { el, car, k, split, lapWrap: q('.tw-lap'), lapN: q('.tw-lap b'), lapT: q('.tw-lap i'), rows, posWrap: q('.tm-pos'), pos: q('.tm-pos b'), posT: q('.tm-pos small'), time: q('.tm-time'), sectors: q('.tm-sectors').children,
      last: q('.tm-last b'), best: q('.tm-best b'), delta: q('.delta'), msg: q('.msg'), msgText: q('.msg span'), map: q('.minimap').getContext('2d'), ledsEl: leds, leds: leds.children,
      ersPct: q('.ers-pct'), ersBar: q('.ers-bar i'), ersBatt: q('.batt b'), ers: q('.ers'), gear: q('.gear'), speed: q('.speed-v b'), thr: q('.thr'), brk: q('.brk'), drs: q('.drs'), drsSub: q('.drs small'), drsCall: q('.drs-call'), rpm: q('.rpm'), tags: q('.tags'), corner: q('.corner'),
      msgT: 0, tagEls: [], prevPos: car.pos, prevLap: -1, prevFlags: ['', '', ''], prevMe: -1 };
    q('.pname').innerHTML = '<i style="background:' + car.team.primary + '"></i><span>' + car.name + '</span><span class="team">' + car.team.short + '</span>' + (car.isPlayer ? '<span class="cam">' + (k === 0 ? 'C' : '/') + ' · CAMERA</span>' : '');
    r.setRect = (x, y, w, h, sp) => {
      el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = w + 'px'; el.style.height = h + 'px'; r.w = w; r.h = h;
      if (split) {
        // --u: one unit in px for this view, from its size (1 = a 1920 x 539 stacked view); everything is laid out in real pixels
        const tb = !sp || sp.dir !== 'sbs'; const u = tb ? U.clamp(Math.min(w / 1920, h / 540), 0.72, 1.35) : U.clamp(Math.min(w / 1000, h / 1000), 0.72, 1.2);
        r.s = u; el.style.setProperty('--u', u.toFixed(3)); el.style.setProperty('--s', u.toFixed(3));
        el.classList.toggle('edge-top', tb && k === 0); el.classList.toggle('edge-bottom', tb && k === 1); el.classList.toggle('sbs', !tb); el.classList.toggle('sbs-left', !tb && k === 0); el.classList.toggle('sbs-right', !tb && k === 1);
        return;
      }
      const s = U.clamp(Math.min(w / 1280, h / 720), 0.7, 1.3); r.s = s; el.style.setProperty('--s', s.toFixed(3));
      const side = (w - 520 * s) / 2; el.classList.toggle('narrow', side < 200 * s); el.classList.toggle('tight', side < 120 * s);   // room left beside the centre dash
    };
    // finished (two players): a card that stays up for the rest of the race while the cool-down lap is driven
    r.setFinished = (pos) => { const f = q('.sp-fin'); if (!f) return; f.children[0].textContent = 'P' + pos + ' · FINISHED'; f.children[1].textContent = 'Cool-down lap'; f.classList.add('show'); r.msgT = 0; r.msg.classList.remove('show'); r.fin = true; };
    r.toastEl = q('.sp-toasts'); r.bannerEl = q('.sp-banner');
    live.push(r);
    r.showMsg = (text, cls, dur) => { if (r.fin && split) return; r.msgText.textContent = text; r.msg.className = 'msg ' + (cls || ''); void r.msg.offsetWidth; r.msg.classList.add('show'); r.msgT = dur || 2.5; };
    r.update = (race, dt) => {
      const c = car, t = race.track;
      // cockpit view: the wheel display carries gear / speed / ERS / DRS, so the centre dash (and the corner / driver chips) go away;
      // only the lap tower, timing box, minimap and name tags stay, plus a vignette that frames the cockpit
      const ck = !!(c._cockpitT && performance.now() - c._cockpitT < 400); if (ck !== r.ck) { r.ck = ck; el.classList.toggle('cockpit', ck); }
      // ---- dash (hidden in the cockpit, where the wheel display carries it: skip the DOM work entirely)
      if (!ck || split) {   // split screen keeps its dash in the cockpit (the short view crops the wheel display)
        setText(r.speed, String(Math.round(c.speedKmh))); setText(r.gear, c.gear === 0 ? 'N' : c.v < -0.5 ? 'R' : String(c.gear));
        const lit = Math.round(c.rpm * 15); for (let i = 0; i < 15; i++) r.leds[i].classList.toggle('on', i < lit);
        r.ledsEl.classList.toggle('shift', c.rpm > 0.96 && c.gear > 0 && c.gear < 8);
        setText(r.rpm, Math.round((4000 + c.rpm * 8500) / 50) * 50 + ' RPM');
        r.thr.style.setProperty('--v', (c.throttle * 100).toFixed(0) + '%'); r.brk.style.setProperty('--v', (c.brake * 100).toFixed(0) + '%');
        const ep = Math.round(c.ers * 100); setText(r.ersPct, ep + '%'); r.ersBar.style.width = ep + '%'; r.ersBatt.style.width = ep + '%'; r.ers.classList.toggle('active', !!c.ersActive);
      }
      updateDrs(r, race, c, ck && !split, dt);
      // ---- lap tower: 2 ahead, me, 2 behind
      const lapNow = c.finished ? 'FIN' : String(Math.min(c.lap, race.laps));
      if (lapNow !== r.prevLap) { setText(r.lapN, lapNow); if (r.prevLap !== -1) flash(r.lapWrap, 'bump', 600); r.prevLap = lapNow; }
      setText(r.lapT, split && c.finished ? '' : '/ ' + race.laps);
      const order = race.order; const idx = c.pos - 1; let a = Math.max(0, idx - (NROWS >> 1)); let b = Math.min(order.length, a + NROWS); a = Math.max(0, b - NROWS);
      for (let i = 0; i < NROWS; i++) {
        const row = rows[i]; const j = a + i; const o = order[j];
        if (!o) { row.el.className = 'lp-row empty'; continue; }
        const me = o === c; let gap;
        // lapped cars read in laps (+1 LAP), as on the timing screens
        const lg = !race.started || !race.lapGap ? 0 : me ? race.lapGap(order[0], c) : j < idx ? race.lapGap(o, c) : race.lapGap(c, o);
        if (!race.started) gap = '—';
        else if (me) gap = c.finished ? 'FIN' : c.pos === 1 ? 'LEADER' : lg > 0 ? '+' + lg + ' LAP' : '+' + race.timeGap(order[0], c).toFixed(3);
        else if (lg > 0 && !(o.finished && !c.finished)) gap = (j < idx ? '-' : '+') + lg + ' LAP';
        else { const g = j < idx ? -race.timeGap(o, c) : race.timeGap(c, o); gap = (g < 0 ? '-' : '+') + Math.abs(g).toFixed(3); if (o.finished && !c.finished) gap = 'FIN'; }
        const cls = 'lp-row' + (me ? ' me' : ''); if (row.el.className.replace(/ (gain|loss)/g, '') !== cls) row.el.className = cls;
        setText(row.p, String(o.pos)); row.bar.style.background = o.team.primary; setText(row.n, shortName(o)); row.ty.className = 'ty ' + o.tyreKey; setText(row.ty, TYRE_LETTER[o.tyreKey] || '?'); setText(row.g, gap);
        if (me) r.meRow = row.el;
      }
      // ---- position change flash
      if (c.pos !== r.prevPos) { const cls = c.pos < r.prevPos ? 'gain' : 'loss'; flash(r.posWrap, cls, 900); if (r.meRow && race.started) flash(r.meRow, cls, 900); r.prevPos = c.pos; }
      // ---- timing box
      setText(r.pos, String(c.pos)); setText(r.posT, '/ ' + race.cars.length + (c.penalty > 0 ? '  +' + c.penalty + 's' : ''));
      setText(r.time, race.started && !c.finished ? fmt(race.time - c.lapStart) : c.finished ? fmt(c.finishTime) : '0:00.000');
      for (let si = 0; si < 3; si++) {
        const f = c.sectorFlags ? c.sectorFlags[si] : ''; const cls = f || (si === c.sector && race.started && !c.finished ? 'live' : '');
        if (r.sectors[si].className.replace(' pop', '') !== cls) { r.sectors[si].className = cls; if (f) flash(r.sectors[si], 'pop', 600); }
      }
      setText(r.last, c.lastLap > 0 ? fmt(c.lastLap) : '--:--.---'); const del = !!c.lastLapDeleted; if (r._del !== del) { r._del = del; r.last.style.textDecoration = del ? 'line-through' : ''; r.last.style.opacity = del ? '0.55' : ''; r.last.title = del ? 'Lap deleted (track limits)' : ''; } setText(r.best, c.bestLap > 0 ? fmt(c.bestLap) : '--:--.---');
      const d = race.deltaBest(c); setText(r.delta, d == null ? '' : (d >= 0 ? '+' : '') + d.toFixed(2)); r.delta.className = 'delta ' + (d == null ? '' : d < 0 ? 'neg' : 'pos');
      setText(r.corner, t.cornerNameAt(c.trk.s));
      if (r.msgT > 0) { r.msgT -= dt; if (r.msgT <= 0) r.msg.classList.remove('show'); }
      drawLocalMap(r, race);
    };
    r.updateTags = (list) => {
      while (r.tagEls.length < list.length) { const d = document.createElement('div'); d.className = 'tag'; d.innerHTML = '<span class="tp"></span><span class="tb"></span><span class="tn"></span><i class="tpt"></i>'; r.tags.appendChild(d); r.tagEls.push(d); }
      // declutter: nearest cars keep their spot, farther tags that would overlap are stacked upwards
      const order = list.map((tg, i) => i).sort((i, j) => list[j].alpha - list[i].alpha); const placed = []; const s = r.s || 1;
      const ys = [];
      for (const i of order) {
        const tg = list[i]; const sc = s * (0.7 + 0.3 * Math.min(1, tg.alpha)); const w = (42 + String(tg.text).length * 8.7) * sc, h = 22 * sc; let y = tg.y;
        // split screen views are short: one step up at most, and a farther tag that still overlaps is dropped instead of being
        // stacked off into the sky, away from its car
        const maxTries = split ? 1 : 2; let hit = null;
        for (let tries = 0; tries <= maxTries; tries++) { hit = placed.find(p => Math.abs(p.x - tg.x) < (p.w + w) / 2 && Math.abs(p.y - y) < (p.h + h) / 2); if (!hit || tries === maxTries) break; y = hit.y - (hit.h + h) / 2 - 2; }
        if (hit || y < h * 1.5) { ys[i] = null; continue; }   // still overlapping (or pushed off the top): the farther tag is dropped
        placed.push({ x: tg.x, y, w, h }); ys[i] = y;
      }
      r.tagEls.forEach((d, i) => {
        const tg = list[i]; if (!tg || ys[i] == null) { if (d.style.display !== 'none') d.style.display = 'none'; return; }
        d.style.display = 'flex'; d.style.left = tg.x.toFixed(1) + 'px'; d.style.top = ys[i].toFixed(1) + 'px'; d.style.opacity = tg.alpha; d.style.setProperty('--d', (0.7 + 0.3 * Math.min(1, tg.alpha)).toFixed(2));
        d.classList.toggle('stacked', ys[i] < tg.y - 1);
        setText(d.children[0], String(tg.pos)); d.children[1].style.background = tg.color; setText(d.children[2], tg.text);
      });
    };
    return r;
  }

  // ---- DRS: three-state indicator on the dash (off / armed / open) with a hint line, a callout at each detection line and
  //      while armed in the zone, a toast when DRS is enabled, and chimes on enable / open / close. Reads car and race state only.
  function drsKey(race, car, short) {
    if (race.players.length < 2) return short ? 'SHIFT' : 'Shift';
    return car.playerIndex === 0 ? (short ? 'L SHIFT' : 'Left Shift') : (short ? 'R SHIFT' : 'Right Shift');
  }
  // the same rule as the detection line: time to the nearest car ahead on track at this car's speed (min 15 m/s)
  function gapAheadOnTrack(race, c) {
    const L = race.track.length; let g = Infinity;
    for (const o of race.cars) { if (o === c) continue; let d = o.trk.s - c.trk.s; if (d <= 0) d += L; g = Math.min(g, d / Math.max(c.v, 15)); }
    return g;
  }
  // DRS on the dash: a single box, dim when DRS is not available, green outline when it is ready to use, solid green while
  // the flap is open. Nothing else (no callouts, toasts or chimes): in the cockpit the steering-wheel display carries the lamp.
  function updateDrs(r, race, c, ck) {
    // 2026: the box is the active-aero Straight Mode (any car, in the activation zones); Overtake (extra energy for the lap, earned
    // within 1 s at the Detection Line) lights the ERS label
    const ot = c.otEnergy > 0.01; if (r._ot !== ot && r.ers) { r._ot = ot; const lb = r.ers.querySelector('.ers-label'); if (lb) { lb.textContent = ot ? 'OVERTAKE' : 'ERS'; lb.style.color = ot ? '#ff8a1f' : ''; } }
    if (r._aero !== 1 && r.drs) { r._aero = 1; const b = r.drs.querySelector('b'); if (b) b.textContent = 'AERO'; r.drs.title = 'Straight Mode (low-drag wings) in the activation zones'; }
    if (ck) return; const open = !!c.drsOpen, ready = !!c.drsEligible && !open;
    const cls = 'drs' + (open ? ' open' : ready ? ' armed' : ''); if (r.drs.className !== cls) r.drs.className = cls; setText(r.drsSub, '');
  }

  // rotating local map: heading up, ~ +/-450 m around the car, whole circuit outline, DRS zones, sector ticks, cars
  function drawLocalMap(r, race) {
    const ctx = r.map, S = 360, c = r.car, t = race.track; const k = S / 180; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, S, S);
    const scale = 0.19 * k; const cx = S / 2, cy = S * 0.56;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-(c.heading) - Math.PI / 2);
    const n = t.n, step = Math.max(1, Math.round(6 / (t.ds || 1)));
    const P = (i) => [(t.x[i] - c.x) * scale, (t.z[i] - c.z) * scale];
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // track outline and DRS zones: world-space paths built once per circuit, stroked under a car-centred transform
    if (!t._mapPaths) {
      const tp = new Path2D(); for (let i = 0; i <= n; i += step) { const j = i % n; i === 0 ? tp.moveTo(t.x[j], t.z[j]) : tp.lineTo(t.x[j], t.z[j]); } tp.closePath();
      const drs = t.drs.map((z) => { const ze = z.end >= z.start ? z.end : z.end + t.length; const dp = new Path2D(); for (let s = z.start; s <= ze; s += 10) { const j = t.idxAtS(s); s === z.start ? dp.moveTo(t.x[j], t.z[j]) : dp.lineTo(t.x[j], t.z[j]); } return dp; });
      t._mapPaths = { tp, drs };
    }
    ctx.save(); ctx.scale(scale, scale); ctx.translate(-c.x, -c.z);
    ctx.lineWidth = 11 * k / 2 / scale; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.stroke(t._mapPaths.tp);
    ctx.lineWidth = 6 * k / 2 / scale; ctx.strokeStyle = '#e4e8ee'; ctx.stroke(t._mapPaths.tp);
    ctx.strokeStyle = '#2fe36d'; for (const dp of t._mapPaths.drs) ctx.stroke(dp);
    ctx.restore();
    // sector boundaries + start line
    const tick = (s, col, len) => { const i = t.idxAtS(s); const p = P(i); const nx = t.nx[i], nz = t.nz[i]; ctx.beginPath(); ctx.moveTo(p[0] - nx * len, p[1] - nz * len); ctx.lineTo(p[0] + nx * len, p[1] + nz * len); ctx.strokeStyle = col; ctx.lineWidth = 2.5 * k / 2; ctx.stroke(); };
    if (t.sectors) for (const s of t.sectors) tick(s, '#ffd23f', 6 * k / 2);
    tick(t.sf, '#ffffff', 8 * k / 2);
    // cars (team colour, white ring); the car directly ahead / behind gets a slightly larger dot
    const ahead = race.order[c.pos - 2], behind = race.order[c.pos];
    for (const o of race.cars) {
      if (o === c) continue; const px = (o.x - c.x) * scale, pz = (o.z - c.z) * scale; if (px * px + pz * pz > (S * 0.62) * (S * 0.62)) continue;
      const big = o === ahead || o === behind; ctx.beginPath(); ctx.arc(px, pz, (big ? 5.5 : 4.2) * k / 2 * 1.2, 0, 6.283); ctx.fillStyle = o.team.primary; ctx.fill(); ctx.lineWidth = 1.6 * k / 2; ctx.strokeStyle = big ? '#ffffff' : 'rgba(255,255,255,0.75)'; ctx.stroke();
    }
    ctx.restore();
    // player arrow
    ctx.save(); ctx.translate(cx, cy); ctx.scale(k / 2 * 1.25, k / 2 * 1.25); ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 4; ctx.fillStyle = '#ffffff'; ctx.strokeStyle = c.team.primary; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7.5, 8); ctx.lineTo(0, 4); ctx.lineTo(-7.5, 8); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; ctx.stroke(); ctx.restore();
  }

  function setLights(n) {
    const cols = $('lights').querySelectorAll('.light-col'); cols.forEach((c, i) => c.classList.toggle('on', i < n));
    // split screen: n < 0 takes the per-view gantries away (lights out)
    for (const r of live) if (r.split && r.el.isConnected) { r.el.classList.toggle('lights-on', n >= 0); r.el.querySelectorAll('.sp-lights .light-col').forEach((c, i) => c.classList.toggle('on', i < n)); }
  }
  const splitLive = () => live.filter(r => r.split && r.el.isConnected);
  function banner(text, ms, color, sub) {
    const b = $('banner'); const parts = String(text).split(' · ');
    const kicker = parts.length > 1 ? parts.slice(0, -1).join(' · ') : ''; const main = parts[parts.length - 1];
    b.innerHTML = (kicker ? '<div class="bn-kicker">' + kicker + '</div>' : '') + '<div class="bn-text" style="color:' + (color || '#fff') + '">' + main + '</div>' + (sub ? '<div class="bn-kicker" style="margin:8px 0 0;letter-spacing:3px">' + sub + '</div>' : '');
    b.classList.remove('hidden'); clearTimeout(banner._t); if (ms) banner._t = setTimeout(() => b.classList.add('hidden'), ms);
    // split screen: the same banner centred in each view
    for (const r of splitLive()) { r.bannerEl.innerHTML = b.innerHTML; r.bannerEl.classList.remove('show'); void r.bannerEl.offsetWidth; r.bannerEl.classList.add('show'); }
    if (ms) { clearTimeout(banner._t2); banner._t2 = setTimeout(() => { for (const r of splitLive()) r.bannerEl.classList.remove('show'); }, ms); }
  }
  // toasts: one player's (k given) go to that player's view in split screen; the others show in every view
  function toast(text, cls, k) {
    const views = splitLive();
    if (views.length) {
      for (const r of views) {
        if (k != null && r.k !== k) continue;
        const d = document.createElement('div'); d.textContent = text; if (cls) d.className = cls; r.toastEl.appendChild(d); setTimeout(() => d.remove(), 4000);
        while (r.toastEl.children.length > 3) r.toastEl.firstChild.remove();
      }
      return;
    }
    const d = document.createElement('div'); d.textContent = text; if (cls) d.className = cls; $('toasts').appendChild(d); setTimeout(() => d.remove(), 4000);
  }
  // the thin bar between the two views
  function setDivider(rect) {
    let d = $('split-divider');
    if (!rect) { if (d) d.remove(); return; }
    if (!d) { d = document.createElement('div'); d.id = 'split-divider'; ($('app') || document.body).appendChild(d); }
    d.style.left = rect[0] + 'px'; d.style.top = rect[1] + 'px'; d.style.width = rect[2] + 'px'; d.style.height = rect[3] + 'px'; d.className = rect[2] > rect[3] ? 'h' : 'v';
  }
  function showResults(race) {
    const res = race.results(); const tb = $('results-table');
    let html = '<tr><th class="pos">Pos</th><th>Driver</th><th>Team</th><th>Tyre</th><th class="num">Time / Gap</th><th class="num">Best lap</th></tr>';
    res.forEach(r => {
      const c = r.car; const dnf = !c.finished && r.lapsBehind === 0 && r.gap == null; const ai = race.aiFor ? race.aiFor(c) : null;
      const gap = r.dsq ? 'DSQ' : r.pos === 1 ? fmt(r.time != null ? r.time : race.time) : r.lapsBehind > 0 ? '+' + r.lapsBehind + ' LAP' + (r.lapsBehind > 1 ? 'S' : '') : r.gap != null ? '+' + r.gap.toFixed(3) : 'DNF';
      const isFl = race.fastest.car === c && c.bestLap > 0;
      html += '<tr class="' + (c.isPlayer ? 'player' : '') + (dnf ? ' dnf' : '') + '"><td class="pos">' + r.pos + '</td><td class="drv"><span class="c" style="background:' + c.team.primary + '"></span>' + c.name + (c.penalty ? ' <span class="pen">+' + c.penalty + 's</span>' : '') + (ai ? '<span class="arch-tag arch-' + ai.archetype.id + '">' + ai.archetype.name + '</span>' : '') + '</td><td class="team">' + c.team.name + '</td><td><span class="ty ' + c.tyreKey + '">' + (TYRE_LETTER[c.tyreKey] || '?') + '</span></td><td class="num">' + gap + '</td><td class="num' + (isFl ? ' fl' : '') + '">' + U.fmtTime(c.bestLap, '—') + '</td></tr>';
    });
    tb.innerHTML = html; const w = res[0].car;
    $('results-sub').textContent = w.name + ' wins the ' + race.track.name + ' Grand Prix' + (race.fastest.car ? ' · Fastest lap ' + race.fastest.car.name + ' ' + U.fmtTime(race.fastest.time) : '') + (race.gridInfo ? ' · Grid: ' + race.gridInfo.label : '');
    $('results').classList.remove('hidden');
  }
  function drawTrackPreview(track, canvas) {
    const ctx = canvas.getContext('2d'); const size = canvas.width; const k = size / 260; const n = track.n; let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i++) { x0 = Math.min(x0, track.x[i]); x1 = Math.max(x1, track.x[i]); z0 = Math.min(z0, track.z[i]); z1 = Math.max(z1, track.z[i]); }
    const pad = 26 * k; const sc = (size - pad * 2) / Math.max(x1 - x0, z1 - z0); const ox = pad + (size - pad * 2 - (x1 - x0) * sc) / 2 - x0 * sc, oz = pad + (size - pad * 2 - (z1 - z0) * sc) / 2 - z0 * sc;
    const P = (i) => [track.x[i] * sc + ox, track.z[i] * sc + oz];
    ctx.clearRect(0, 0, size, size); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // outline + sector-coloured ribbon (S1 red, S2 blue, S3 yellow, like the broadcast track maps)
    ctx.beginPath(); for (let i = 0; i <= n; i += 2) { const p = P(i % n); i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]); } ctx.closePath();
    ctx.lineWidth = 9 * k; ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.stroke();
    const cols = ['#ff3b2d', '#3d8dff', '#ffd23f']; const bounds = [track.sf, track.sectors[0], track.sectors[1], track.sf + track.length];
    for (let s = 0; s < 3; s++) {
      ctx.beginPath(); let first = true; for (let d = bounds[s]; d <= bounds[s + 1]; d += 4) { const p = P(track.idxAtS(d)); if (first) { ctx.moveTo(p[0], p[1]); first = false; } else ctx.lineTo(p[0], p[1]); }
      ctx.lineWidth = 4.5 * k; ctx.strokeStyle = cols[s]; ctx.stroke();
    }
    // DRS zones: white dashes on top
    ctx.lineWidth = 4.5 * k; ctx.strokeStyle = '#f4f6f9'; ctx.setLineDash([5 * k, 4 * k]);
    for (const z of track.drs) { const ze = z.end >= z.start ? z.end : z.end + track.length; ctx.beginPath(); for (let s = z.start; s <= ze; s += 6) { const p = P(track.idxAtS(s)); s === z.start ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]); } ctx.stroke(); }
    ctx.setLineDash([]);
    // start / finish
    const si = track.idxAtS(track.sf); const sp = P(si); ctx.save(); ctx.translate(sp[0], sp[1]); ctx.rotate(Math.atan2(track.tz[si], track.tx[si])); ctx.fillStyle = '#fff'; ctx.fillRect(-2 * k, -8 * k, 4 * k, 16 * k); ctx.restore();
    // corner labels
    ctx.fillStyle = '#d6dde8'; ctx.font = '700 ' + (9.5 * k) + 'px "Titillium Web", sans-serif'; ctx.textAlign = 'center'; ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 3 * k; const kk = track.smooth(track.k, 15);
    // labels: skip a corner whose label would collide with one already placed (the map is small)
    const placed = []; const seen = {};
    for (const c of track.data.corners) {
      if (/Straight/i.test(c.name) || seen[c.name]) continue; seen[c.name] = 1;
      const j = track.idxAtS(c.s + 40); const side = kk[j] > 0 ? 1 : -1; const p = P(j); const name = c.name.toUpperCase();
      const w = ctx.measureText(name).width, h = 10 * k; const lx = p[0] + track.nx[j] * side * 17 * k, ly = p[1] + track.nz[j] * side * 17 * k + 3 * k;
      const box = [lx - w / 2 - 2 * k, ly - h, lx + w / 2 + 2 * k, ly + 2 * k];
      if (placed.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
      placed.push(box); ctx.fillText(name, lx, ly);
    }
  }
  // range sliders: keep the filled part of the track in sync with the value (main.js may set .value/.max directly)
  function syncRanges() { document.querySelectorAll('input[type=range]').forEach(el => { const v = (el.value - el.min) / Math.max(1, el.max - el.min) * 100; const f = v.toFixed(1) + '%'; if (el._fill !== f) { el._fill = f; el.style.setProperty('--fill', f); } }); }
  window.addEventListener('DOMContentLoaded', () => { syncRanges(); document.addEventListener('input', e => { if (e.target && e.target.type === 'range') syncRanges(); }); setInterval(() => { const m = $('menu'); if (m && !m.classList.contains('hidden')) syncRanges(); }, 150); });
  EI.HUD = { makeViewport, setLights, banner, toast, setDivider, showResults, drawTrackPreview, $ };
})();
