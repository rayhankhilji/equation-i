// Equation I - HUD in the style of modern F1 games: lap panel, sector box, dash, local minimap, name tags
window.EI = window.EI || {};
(function () {
  const U = EI.U; const $ = (id) => document.getElementById(id);
  const TYRE_LETTER = { soft: 'S', medium: 'M', hard: 'H' };

  function makeViewport(k, car) {
    const el = document.createElement('div'); el.className = 'vp';
    el.innerHTML =
      '<div class="hud">' +
      '<div class="lappanel"><div class="lp-head"><div class="lp-title">LAP</div><div class="lp-lap"></div></div><div class="lp-rows"></div></div>' +
      '<div class="timebox"><div class="tb-top"><span class="tb-pos"></span><span class="tb-time"></span></div><div class="tb-sectors"><span>S1</span><span>S2</span><span>S3</span></div><div class="tb-best"></div></div>' +
      '<div class="msg"></div>' +
      '<div class="mapwrap"><canvas class="minimap" width="200" height="300"></canvas></div>' +
      '<div class="dash"><div class="leds"></div><div class="dash-main">' +
      '<div class="ers"><span class="ers-pct"></span><i class="batt"><b></b></i><div class="ers-bar"><i></i></div><div class="ers-label">ERS</div></div>' +
      '<div class="gear">N</div>' +
      '<div class="speed"><small>KM/H</small><b>0</b><div class="tb"><i class="thr"></i><i class="brk"></i></div></div>' +
      '<div class="drs">DRS</div></div><div class="rpm"></div><div class="delta"></div></div>' +
      '<div class="tags"></div><div class="corner"></div><div class="pname"></div></div>';
    $('viewports').appendChild(el);
    const q = (c) => el.querySelector(c);
    const leds = q('.leds'); for (let i = 0; i < 15; i++) { const d = document.createElement('i'); d.className = i < 5 ? 'g' : i < 10 ? 'r' : 'b'; leds.appendChild(d); }
    const r = { el, car, k, lap: q('.lp-lap'), rows: q('.lp-rows'), pos: q('.tb-pos'), time: q('.tb-time'), sectors: q('.tb-sectors').children, best: q('.tb-best'), msg: q('.msg'),
      map: q('.minimap').getContext('2d'), leds: leds.children, ersPct: q('.ers-pct'), ersBar: q('.ers-bar i'), ersBatt: q('.batt b'), ers: q('.ers'), gear: q('.gear'), speed: q('.speed b'), thr: q('.thr'), brk: q('.brk'), drs: q('.drs'), rpm: q('.rpm'), delta: q('.delta'), tags: q('.tags'), corner: q('.corner'), msgT: 0, tagEls: [] };
    q('.pname').innerHTML = '<i style="background:' + car.team.primary + '"></i>' + car.name + ' · ' + car.team.name + (car.isPlayer ? ' · <span class="cam">C: camera</span>' : '');
    r.setRect = (x, y, w, h) => { el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = w + 'px'; el.style.height = h + 'px'; r.w = w; r.h = h; };
    r.showMsg = (text, cls, dur) => { r.msg.textContent = text; r.msg.className = 'msg show ' + (cls || ''); r.msgT = dur || 2.5; };
    r.update = (race, dt) => {
      const c = car, t = race.track;
      // dash
      r.speed.textContent = Math.round(c.speedKmh); r.gear.textContent = c.gear === 0 ? 'N' : c.v < -0.5 ? 'R' : c.gear;
      const lit = Math.round(c.rpm * 15); for (let i = 0; i < 15; i++) r.leds[i].classList.toggle('on', i < lit);
      r.rpm.textContent = 'RPM ' + Math.round(4000 + c.rpm * 8500);
      r.thr.style.height = (c.throttle * 100) + '%'; r.brk.style.height = (c.brake * 100) + '%';
      r.ersPct.textContent = Math.round(c.ers * 100) + ' %'; r.ersBar.style.width = (c.ers * 100) + '%'; r.ersBatt.style.width = (c.ers * 100) + '%'; r.ers.classList.toggle('active', c.ersActive);
      r.drs.className = 'drs' + (c.drsOpen ? ' open' : c.drsEligible ? ' armed' : '');
      // lap panel: 2 ahead, me, 2 behind
      r.lap.textContent = (c.finished ? 'FIN' : Math.min(c.lap, race.laps)) + ' / ' + race.laps;
      const order = race.order; const idx = c.pos - 1; let a = Math.max(0, idx - 2); let b = Math.min(order.length, a + 5); a = Math.max(0, b - 5);
      let html = '';
      for (let j = a; j < b; j++) {
        const o = order[j]; const me = o === c; let gap;
        if (me) gap = c.finished ? 'FIN' : U.fmtTime(race.time - c.lapStart).replace('.', ',');
        else if (race.started) { const g = j < idx ? -race.timeGap(o, c) : race.timeGap(c, o); gap = (g < 0 ? '-' : '+') + Math.abs(g).toFixed(3).replace('.', ','); if (o.finished && !c.finished) gap = 'FIN'; }
        else gap = '--:--,---';
        html += '<div class="lp-row' + (me ? ' me' : '') + '"><span class="p">' + o.pos + '</span><span class="bar" style="background:' + o.team.primary + '"></span><span class="n">' + (o.isPlayer ? o.name : o.driver.name.split(' ').pop().toUpperCase()) + '</span><span class="ty ' + o.tyreKey + '">' + TYRE_LETTER[o.tyreKey] + '</span><span class="g">' + gap + '</span></div>';
      }
      r.rows.innerHTML = html;
      // time box
      r.pos.textContent = c.pos + ' / ' + race.cars.length;
      r.time.textContent = (race.started && !c.finished ? U.fmtTime(race.time - c.lapStart) : c.finished ? U.fmtTime(c.finishTime) : '0:00.000').replace('.', ',');
      for (let si = 0; si < 3; si++) { const f = c.sectorFlags ? c.sectorFlags[si] : ''; r.sectors[si].className = f || (si === c.sector && race.started ? 'live' : ''); }
      r.best.textContent = c.bestLap > 0 ? 'BEST ' + U.fmtTime(c.bestLap).replace('.', ',') : '';
      const d = race.deltaBest(c); r.delta.textContent = d == null ? '' : (d >= 0 ? '+' : '') + d.toFixed(2); r.delta.className = 'delta ' + (d == null ? '' : d < 0 ? 'neg' : 'pos');
      r.corner.textContent = t.cornerNameAt(c.trk.s);
      if (r.msgT > 0) { r.msgT -= dt; if (r.msgT <= 0) r.msg.classList.remove('show'); }
      drawLocalMap(r, race);
    };
    r.updateTags = (list) => {
      while (r.tagEls.length < list.length) { const d = document.createElement('div'); d.className = 'tag'; r.tags.appendChild(d); r.tagEls.push(d); }
      r.tagEls.forEach((d, i) => { const tg = list[i]; if (!tg) { d.style.display = 'none'; return; } d.style.display = 'block'; d.style.left = tg.x + 'px'; d.style.top = tg.y + 'px'; d.style.opacity = tg.alpha; d.innerHTML = '<span class="tp">' + tg.pos + '</span><span class="tb" style="background:' + tg.color + '"></span><span class="tn">' + tg.text + '</span>'; });
    };
    return r;
  }

  function drawLocalMap(r, race) {
    const ctx = r.map, W = 200, H = 300, c = r.car, t = race.track; ctx.clearRect(0, 0, W, H);
    const scale = 0.55; // px per metre
    ctx.save(); ctx.translate(W / 2, H * 0.62); ctx.rotate(-(c.heading + Math.PI / 2) - Math.PI); ctx.rotate(Math.PI);
    // rotate so the car's heading points up: world forward (cos h, sin h) -> screen (0,-1)
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.translate(W / 2, H * 0.62); const ang = -(c.heading) - Math.PI / 2; ctx.rotate(ang);
    const n = t.n, i0 = c.trk.i, span = Math.round(260 / t.ds);
    const path = (from, to, step) => { ctx.beginPath(); let first = true; for (let j = from; j <= to; j += step) { const i = (i0 + j + n * 4) % n; const px = (t.x[i] - c.x) * scale, pz = (t.z[i] - c.z) * scale; if (first) { ctx.moveTo(px, pz); first = false; } else ctx.lineTo(px, pz); } };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    path(-span, span, 4); ctx.lineWidth = 14; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.stroke();
    path(-span, span, 4); ctx.lineWidth = 10; ctx.strokeStyle = '#e9e9e9'; ctx.stroke();
    // DRS zones
    for (const z of t.drs) { ctx.beginPath(); let first = true; for (let s = z.start; s <= z.end; s += 8) { const i = t.idxAtS(s); let d = i - i0; if (d > n / 2) d -= n; if (d < -n / 2) d += n; if (Math.abs(d) > span) continue; const px = (t.x[i] - c.x) * scale, pz = (t.z[i] - c.z) * scale; if (first) { ctx.moveTo(px, pz); first = false; } else ctx.lineTo(px, pz); } ctx.lineWidth = 10; ctx.strokeStyle = '#2f7ff0'; ctx.stroke(); }
    // start line
    { const i = t.idxAtS(t.sf); let d = i - i0; if (d > n / 2) d -= n; if (d < -n / 2) d += n; if (Math.abs(d) < span) { ctx.fillStyle = '#fff'; ctx.fillRect((t.x[i] - c.x) * scale - 5, (t.z[i] - c.z) * scale - 2, 10, 4); } }
    // cars
    for (const o of race.cars) { if (o === c) continue; const px = (o.x - c.x) * scale, pz = (o.z - c.z) * scale; if (px * px + pz * pz > 150 * 150) continue; ctx.fillStyle = o.team.primary; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px, pz, 5, 0, 6.283); ctx.fill(); ctx.stroke(); }
    ctx.restore();
    // player arrow
    ctx.save(); ctx.translate(W / 2, H * 0.62); ctx.fillStyle = '#39ff7a'; ctx.strokeStyle = '#063'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(7, 7); ctx.lineTo(0, 3); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }

  function setLights(n) { const cols = $('lights').querySelectorAll('.light-col'); cols.forEach((c, i) => c.classList.toggle('on', i < n)); }
  function banner(text, ms, color) { const b = $('banner'); b.textContent = text; b.style.color = color || '#fff'; b.classList.remove('hidden'); clearTimeout(banner._t); if (ms) banner._t = setTimeout(() => b.classList.add('hidden'), ms); }
  function toast(text) { const d = document.createElement('div'); d.textContent = text; $('toasts').appendChild(d); setTimeout(() => d.remove(), 4000); }
  function showResults(race) {
    const res = race.results(); const tb = $('results-table');
    let html = '<tr><th>Pos</th><th>Driver</th><th>Team</th><th>Tyre</th><th class="num">Time / Gap</th><th class="num">Best lap</th></tr>';
    res.forEach(r => {
      const c = r.car; const gap = r.pos === 1 ? U.fmtTime(r.time != null ? r.time : race.time) : r.lapsBehind > 0 ? '+' + r.lapsBehind + ' LAP' + (r.lapsBehind > 1 ? 'S' : '') : r.gap != null ? '+' + r.gap.toFixed(3) : 'DNF';
      html += '<tr class="' + (c.isPlayer ? 'player' : '') + '"><td>' + r.pos + '</td><td><span class="c" style="background:' + c.team.primary + '"></span>' + c.name + (c.penalty ? ' <span style="color:#ff5a4a;font-size:11px">+' + c.penalty + 's</span>' : '') + '</td><td>' + c.team.name + '</td><td style="color:' + c.tyre.color + '">' + c.tyre.name + '</td><td class="num">' + gap + '</td><td class="num"' + (race.fastest.car === c ? ' style="color:#c48cff"' : '') + '>' + U.fmtTime(c.bestLap, '-') + '</td></tr>';
    });
    tb.innerHTML = html; const w = res[0].car;
    $('results-sub').textContent = w.name + ' wins the ' + race.track.name + ' Grand Prix' + (race.fastest.car ? ' · Fastest lap ' + race.fastest.car.name + ' ' + U.fmtTime(race.fastest.time) : '');
    $('results').classList.remove('hidden');
  }
  function drawTrackPreview(track, canvas) {
    const ctx = canvas.getContext('2d'); const size = canvas.width; const n = track.n; let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i++) { x0 = Math.min(x0, track.x[i]); x1 = Math.max(x1, track.x[i]); z0 = Math.min(z0, track.z[i]); z1 = Math.max(z1, track.z[i]); }
    const pad = 22; const sc = (size - pad * 2) / Math.max(x1 - x0, z1 - z0); const ox = pad + (size - pad * 2 - (x1 - x0) * sc) / 2 - x0 * sc, oz = pad + (size - pad * 2 - (z1 - z0) * sc) / 2 - z0 * sc;
    ctx.clearRect(0, 0, size, size); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); for (let i = 0; i <= n; i += 3) { const j = i % n; const px = track.x[j] * sc + ox, pz = track.z[j] * sc + oz; i === 0 ? ctx.moveTo(px, pz) : ctx.lineTo(px, pz); } ctx.closePath();
    ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke(); ctx.lineWidth = 4; ctx.strokeStyle = '#e6e6e6'; ctx.stroke();
    ctx.lineWidth = 4; ctx.strokeStyle = '#3b8bff'; for (const z of track.drs) { ctx.beginPath(); for (let s = z.start; s <= z.end; s += 6) { const j = track.idxAtS(s); const px = track.x[j] * sc + ox, pz = track.z[j] * sc + oz; s === z.start ? ctx.moveTo(px, pz) : ctx.lineTo(px, pz); } ctx.stroke(); }
    const si = track.idxAtS(track.sf); ctx.fillStyle = '#fff'; ctx.fillRect(track.x[si] * sc + ox - 3, track.z[si] * sc + oz - 3, 6, 6);
    ctx.fillStyle = '#c9d1dc'; ctx.font = '600 9px sans-serif'; ctx.textAlign = 'center'; const kk = track.smooth(track.k, 15);
    for (const c of track.data.corners) { if (/Straight/i.test(c.name)) continue; const j = track.idxAtS(c.s + 40); const side = kk[j] > 0 ? 1 : -1; ctx.fillText(c.name, track.x[j] * sc + ox + track.nx[j] * side * 16, track.z[j] * sc + oz + track.nz[j] * side * 16 + 3); }
  }
  EI.HUD = { makeViewport, setLights, banner, toast, showResults, drawTrackPreview, $ };
})();
