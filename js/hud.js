// Equation I - HUD: per-player overlays, minimap, position tower, start lights, toasts and results
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  const $ = (id) => document.getElementById(id);
  let mapCanvas = null, mapScale = 1, mapOff = [0, 0];

  function prepareMinimap(track, size) {
    const n = track.n; let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i++) { x0 = Math.min(x0, track.x[i]); x1 = Math.max(x1, track.x[i]); z0 = Math.min(z0, track.z[i]); z1 = Math.max(z1, track.z[i]); }
    const pad = 10; mapScale = (size - pad * 2) / Math.max(x1 - x0, z1 - z0);
    mapOff = [pad + (size - pad * 2 - (x1 - x0) * mapScale) / 2 - x0 * mapScale, pad + (size - pad * 2 - (z1 - z0) * mapScale) / 2 - z0 * mapScale];
    mapCanvas = document.createElement('canvas'); mapCanvas.width = mapCanvas.height = size;
    const ctx = mapCanvas.getContext('2d');
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineJoin = 'round'; ctx.beginPath();
    for (let i = 0; i <= n; i += 3) { const j = i % n; const px = track.x[j] * mapScale + mapOff[0], pz = track.z[j] * mapScale + mapOff[1]; i === 0 ? ctx.moveTo(px, pz) : ctx.lineTo(px, pz); }
    ctx.closePath(); ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = '#e6e6e6'; ctx.stroke();
    // DRS zones in blue, start line white
    ctx.lineWidth = 3; ctx.strokeStyle = '#3b8bff';
    for (const z of track.drs) { ctx.beginPath(); for (let s = z.start; s <= z.end; s += 6) { const j = track.idxAtS(s); const px = track.x[j] * mapScale + mapOff[0], pz = track.z[j] * mapScale + mapOff[1]; s === z.start ? ctx.moveTo(px, pz) : ctx.lineTo(px, pz); } ctx.stroke(); }
    const si = track.idxAtS(track.sf); ctx.fillStyle = '#fff'; ctx.fillRect(track.x[si] * mapScale + mapOff[0] - 3, track.z[si] * mapScale + mapOff[1] - 3, 6, 6);
  }

  function makeViewport(k, car) {
    const el = document.createElement('div'); el.className = 'vp';
    el.innerHTML = '<div class="hud">' +
      '<div class="laps"><div class="pos"></div><div class="lap"></div></div>' +
      '<div class="times"><div class="cur"></div><div class="best"></div><div class="delta"></div><div class="gap"></div></div>' +
      '<div class="msg"></div><canvas class="minimap" width="150" height="150"></canvas>' +
      '<div class="pname"><i></i><span></span></div>' +
      '<div class="speedo"><div class="speed">0<small>km/h</small></div><div class="gear">N</div>' +
      '<div class="bars"><div class="bar throttle"><i></i></div><div class="bar brake"><i></i></div><div class="bar ers"><i></i></div></div><div class="drs">DRS</div></div>' +
      '<div class="corner"></div></div>';
    $('viewports').appendChild(el);
    const q = (c) => el.querySelector(c);
    const r = { el, car, k, pos: q('.pos'), lap: q('.lap'), cur: q('.cur'), best: q('.best'), delta: q('.delta'), gap: q('.gap'), msg: q('.msg'), map: q('.minimap').getContext('2d'),
      speed: q('.speed'), gear: q('.gear'), thr: q('.bar.throttle i'), brk: q('.bar.brake i'), ers: q('.bar.ers'), ersI: q('.bar.ers i'), drs: q('.drs'), corner: q('.corner'), msgT: 0 };
    q('.pname i').style.background = car.team.primary; q('.pname span').textContent = car.name + ' · ' + car.team.name;
    r.setRect = (x, y, w, h) => { el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = w + 'px'; el.style.height = h + 'px'; };
    r.showMsg = (text, cls, dur) => { r.msg.textContent = text; r.msg.className = 'msg show ' + (cls || ''); r.msgT = dur || 2.5; };
    r.update = (race, dt) => {
      const c = car, t = race.track;
      r.speed.innerHTML = Math.round(c.speedKmh) + '<small>km/h</small>';
      r.gear.textContent = c.gear === 0 ? 'N' : c.v < -0.5 ? 'R' : c.gear;
      r.thr.style.width = (c.throttle * 100) + '%'; r.brk.style.width = (c.brake * 100) + '%'; r.ersI.style.width = (c.ers * 100) + '%';
      r.ers.classList.toggle('active', c.ersActive);
      r.drs.className = 'drs' + (c.drsOpen ? ' open' : c.drsEligible ? ' available' : '');
      r.drs.textContent = c.drsOpen ? 'DRS OPEN' : c.drsEligible ? (c.inDrsZone >= 0 ? 'DRS · PRESS' : 'DRS ARMED') : 'DRS';
      r.pos.innerHTML = 'P' + c.pos + '<sup>' + U.ordinal(c.pos).replace(/\d+/, '') + '</sup>';
      r.lap.textContent = (c.finished ? 'FINISHED' : 'LAP ' + Math.min(c.lap, race.laps) + ' / ' + race.laps) + '  ·  ' + race.cars.length + ' CARS';
      r.cur.textContent = race.started && !c.finished ? U.fmtTime(race.time - c.lapStart) : (c.finished ? U.fmtTime(c.finishTime) : '0:00.000');
      r.best.textContent = c.bestLap > 0 ? 'BEST ' + U.fmtTime(c.bestLap) : (c.lastLap > 0 ? 'LAST ' + U.fmtTime(c.lastLap) : '');
      const d = race.deltaBest(c);
      r.delta.textContent = d == null ? '' : (d >= 0 ? '+' : '') + d.toFixed(2); r.delta.className = 'delta ' + (d == null ? '' : d < 0 ? 'neg' : 'pos');
      if (c.pos > 1) { const ah = race.order[c.pos - 2]; r.gap.textContent = '▲ ' + ah.name + '  +' + c.gapAhead.toFixed(1) + 's'; } else r.gap.textContent = '★ LEADER';
      r.corner.textContent = t.cornerNameAt(c.trk.s);
      if (r.msgT > 0) { r.msgT -= dt; if (r.msgT <= 0) r.msg.classList.remove('show'); }
      // minimap
      const ctx = r.map; ctx.clearRect(0, 0, 150, 150); ctx.drawImage(mapCanvas, 0, 0);
      for (const o of race.cars) {
        if (o === c) continue;
        ctx.fillStyle = o.team.primary; ctx.beginPath(); ctx.arc(o.x * mapScale + mapOff[0], o.z * mapScale + mapOff[1], 2.5, 0, 6.283); ctx.fill();
      }
      ctx.fillStyle = '#fff'; ctx.strokeStyle = c.team.primary; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(c.x * mapScale + mapOff[0], c.z * mapScale + mapOff[1], 4, 0, 6.283); ctx.fill(); ctx.stroke();
    };
    return r;
  }

  function updateTower(race) {
    const el = $('tower'); let html = '';
    race.order.forEach((c) => {
      const gap = c.pos === 1 ? (race.started ? 'LEADER' : '') : (c.finished || race.started ? '+' + c.gapAhead.toFixed(1) : '');
      html += '<div class="row' + (c.isPlayer ? ' player' : '') + '"><span class="p">' + c.pos + '</span><span class="c" style="background:' + c.team.primary + '"></span><span class="n">' + (c.isPlayer ? c.name : c.driver.name.split(' ').pop().slice(0, 3).toUpperCase()) + '</span>' +
        (c.drsOpen ? '<span class="drs">DRS</span>' : '') + (c.finished ? '<span class="pit">FIN</span>' : '') + '<span class="g">' + gap + '</span></div>';
    });
    el.innerHTML = html;
  }
  function setLights(n) { const cols = $('lights').querySelectorAll('.light-col'); cols.forEach((c, i) => c.classList.toggle('on', i < n)); }
  function banner(text, ms, color) { const b = $('banner'); b.textContent = text; b.style.color = color || '#fff'; b.classList.remove('hidden'); clearTimeout(banner._t); if (ms) banner._t = setTimeout(() => b.classList.add('hidden'), ms); }
  function toast(text) { const d = document.createElement('div'); d.textContent = text; $('toasts').appendChild(d); setTimeout(() => d.remove(), 4000); }
  function showResults(race) {
    const res = race.results(); const tb = $('results-table');
    let html = '<tr><th>Pos</th><th>Driver</th><th>Team</th><th>Tyre</th><th class="num">Time / Gap</th><th class="num">Best lap</th></tr>';
    res.forEach(r => {
      const c = r.car;
      const gap = r.pos === 1 ? U.fmtTime(r.time != null ? r.time : race.time) : r.lapsBehind > 0 ? '+' + r.lapsBehind + ' LAP' + (r.lapsBehind > 1 ? 'S' : '') : r.gap != null ? '+' + r.gap.toFixed(3) : 'DNF';
      html += '<tr class="' + (c.isPlayer ? 'player' : '') + '"><td>' + r.pos + '</td><td><span class="c" style="background:' + c.team.primary + '"></span>' + c.name + (c.penalty ? ' <span style="color:#ff5a4a;font-size:11px">+' + c.penalty + 's</span>' : '') + '</td><td>' + c.team.name + '</td><td style="color:' + c.tyre.color + '">' + c.tyre.name + '</td><td class="num">' + gap + '</td><td class="num"' + (race.fastest.car === c ? ' style="color:#c48cff"' : '') + '>' + U.fmtTime(c.bestLap, '-') + '</td></tr>';
    });
    tb.innerHTML = html;
    const w = res[0].car;
    $('results-sub').textContent = w.name + ' wins the ' + race.track.name + ' Grand Prix' + (race.fastest.car ? ' · Fastest lap ' + race.fastest.car.name + ' ' + U.fmtTime(race.fastest.time) : '');
    $('results').classList.remove('hidden');
  }
  function drawTrackPreview(track, canvas) {
    const ctx = canvas.getContext('2d'); const size = canvas.width;
    prepareMinimap(track, size);
    ctx.clearRect(0, 0, size, size); ctx.drawImage(mapCanvas, 0, 0);
    // corner labels
    ctx.fillStyle = '#9aa3b2'; ctx.font = '600 9px sans-serif'; ctx.textAlign = 'center';
    const kk = track.smooth(track.k, 15);
    for (const c of track.data.corners) {
      if (/Straight/i.test(c.name)) continue; const j = track.idxAtS(c.s + 40); const side = kk[j] > 0 ? 1 : -1;
      ctx.fillText(c.name, track.x[j] * mapScale + mapOff[0] + track.nx[j] * side * 16, track.z[j] * mapScale + mapOff[1] + track.nz[j] * side * 16 + 3);
    }
    prepareMinimap(track, 150);
  }
  EI.HUD = { prepareMinimap, makeViewport, updateTower, setLights, banner, toast, showResults, drawTrackPreview, $ };
})();
