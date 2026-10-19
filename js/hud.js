// Equation I - in-race HUD in the style of the official F1 games (swarm/f1/ui_refs 14-18):
//   top-left   timing tower: F1 logo + session + LAP x/y, rows = position | team colour + team mark | driver | state | tyre | gap
//              (compact: the cars around you; T = the whole field), your row lit, purple fastest-lap marker, PIT / penalty / B&W
//   top-right  timing panel: S1 S2 S3 bars (purple overall best / green personal best / yellow), position x/N, current / best lap
//   bot-right  dash: gear, speed, RPM bar, battery %, Overtake (2026 manual override energy) and Straight Mode (aero) states
//   bot-left   whole-circuit minimap (small canvas, <= 10 Hz over a cached outline), coloured car dots, you highlighted
//   name tags "7 | HAMILTON" above nearby cars, start lights, purple FASTEST LAP banner, quiet steward chips (pit.js draws them)
// Flat broadcast panels (no backdrop blur), Saira wide ("F1 HUD", vendored in assets/brand/f1) + Titillium Web. Panels are laid
// out in design px and scaled with CSS zoom (--u) so text stays crisp at every size. DOM writes only when a value changes;
// tags move with transforms. Two players: the same components, compact, in a band along each view's outer edge.
window.EI = window.EI || {};
(function () {
  const U = EI.U; const $ = (id) => document.getElementById(id);
  const TYRE_LETTER = { soft: 'S', medium: 'M', hard: 'H', inter: 'I', wet: 'W' };
  const fmt = (t) => U.fmtTime(t);
  // tower: the player's name, a bot's 3-letter code (VER, NOR...) in the full list, the surname around you
  const shortName = (o) => o.isPlayer ? o.name : (o.driver.code || o.driver.name.split(' ').pop().slice(0, 3)).toUpperCase();
  const surname = (o) => o.isPlayer ? o.name : o.driver.name.split(' ').pop().toUpperCase();
  // add a class for one animation cycle, re-triggering if it is already running
  function flash(el, cls, ms) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); clearTimeout(el['_t_' + cls]); el['_t_' + cls] = setTimeout(() => el.classList.remove(cls), ms || 900); }
  function setText(el, s) { if (el._v !== s) { el._v = s; el.textContent = s; } }
  function setCls(el, s) { if (el._c !== s) { el._c = s; el.className = s; } }

  // ---------------------------------------------------------------- preferences (per viewer; storage may be unavailable)
  const prefs = { full: false, ckDash: false };
  try { const p = JSON.parse(localStorage.getItem('ei.hud') || '{}'); prefs.full = !!p.full; prefs.ckDash = !!p.ckDash; } catch (e) { /* defaults */ }
  const savePrefs = () => { try { localStorage.setItem('ei.hud', JSON.stringify(prefs)); } catch (e) { /* not kept */ } };

  // ---------------------------------------------------------------- team marks: small logos for the tower, drawn once per team
  // Official artwork through f1-BRAND's EI.Ads.drawPartner where it exists (Mercedes star, Ferrari shield, Audi rings), else the
  // livery emblems (EI.LIVERIES.EMBLEM: Red Bull sun + bulls, McLaren speedmark, Alpine A, Williams W, Cadillac crest), else a
  // drawn mark. Rendered at 3x into a canvas -> data URL, used as a background image (cached by team id).
  const MARK_W = 30, MARK_H = 20, MARK_K = 3; const markCache = {};
  const OWN_MARK = { lumi: 'assets/brand/lumi-mark.svg', intake: 'assets/brand/intake-icon.svg' };
  function drawMark(g, id, team) {
    const W = MARK_W * MARK_K, H = MARK_H * MARK_K, cx = W / 2, cy = H / 2; const A = EI.Ads, E = EI.LIVERIES && EI.LIVERIES.EMBLEM;
    const art = (pid, tone, w, h) => { if (A && A.hasPartner && A.hasPartner(pid)) { A.drawPartner(g, pid, cx, cy, w || W * 0.9, h || H * 0.9, { tone: tone || 'color' }); return true; } return false; };
    const em = (name, ...args) => { if (!E || !E[name]) return false; g.save(); g.translate(cx, cy); E[name](g, ...args); g.restore(); return true; };
    const txt = (s, col, size, it) => { g.fillStyle = col; g.font = (it ? 'italic ' : '') + '900 ' + size + 'px "Titillium Web", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, cx, cy + size * 0.06); };
    switch (id) {
      case 'mercedes': if (!em('star', H * 0.45 / 1000, '#e8ebef')) txt('M', '#e8ebef', H * 0.8); break;
      case 'ferrari': if (!em('shield', H * 0.96 / 1000, '#ffd200', true)) txt('SF', '#ffd200', H * 0.7); break;
      case 'mclaren': if (!em('speedmark', W * 0.82 / 1000, '#ff8000')) txt('M', '#ff8000', H * 0.8); break;
      case 'redbull': bulls(g, cx, cy, W * 0.98, '#ffc906', '#db0a40'); break;
      case 'racingbulls': bulls(g, cx, cy, W * 0.98, '#ffffff', '#3d6bff'); break;
      case 'alpine': if (!em('alpineA', H * 0.86 / 1000, '#2aa6ec')) txt('A', '#2aa6ec', H * 0.8); g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#ff87bc'; g.fillRect(cx + H * 0.16, 0, W, H); g.globalCompositeOperation = 'source-over'; break;
      case 'haas': txt('H', '#ffffff', H * 0.98, true); g.fillStyle = '#e6002b'; g.beginPath(); g.moveTo(cx - H * 0.44, cy + H * 0.04); g.lineTo(cx + H * 0.5, cy - H * 0.05); g.lineTo(cx + H * 0.46, cy + H * 0.09); g.lineTo(cx - H * 0.48, cy + H * 0.18); g.closePath(); g.fill(); break;
      case 'audi': if (!art('audi', 'white', W * 0.96, H * 0.6) && !em('rings', W * 0.9 / 1000, '#e8ebef')) txt('AUDI', '#ffffff', H * 0.5); break;
      case 'williams': if (!em('williamsW', H * 0.62 / 1000, '#37bdf8')) txt('W', '#37bdf8', H * 0.8); break;
      case 'astonmartin': {   // the wings: two swept feather fans either side of a centre bar
        g.save(); g.translate(cx, cy); g.fillStyle = '#e8ebef';
        for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { const y = -H * 0.22 + i * H * 0.13, x0 = s * W * 0.06, x1 = s * (W * 0.48 - i * W * 0.07); g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y - H * 0.05); g.lineTo(x1 - s * W * 0.03, y + H * 0.06); g.lineTo(x0, y + H * 0.08); g.closePath(); g.fill(); }
        g.fillStyle = '#cedc00'; g.fillRect(-W * 0.035, -H * 0.3, W * 0.07, H * 0.62); g.restore(); break;
      }
      case 'cadillac': if (!em('cadCrest', H * 0.92 / 1000, '#e8ebef')) txt('C', '#e8ebef', H * 0.8); break;
      default: txt(((team && (team.short || team.brand || team.name)) || '?').slice(0, 2), (team && team.primary) || '#fff', H * 0.62); break;
    }
  }
  // sun disc + two charging bulls (the Red Bull family mark; Racing Bulls in its own colours)
  function bulls(g, cx, cy, w, sun, bull) {
    const r = w * 0.2; g.save(); g.translate(cx, cy); g.fillStyle = sun; g.beginPath(); g.arc(0, -r * 0.1, r, 0, 7); g.fill();
    for (const s of [-1, 1]) {
      g.save(); g.scale(s, 1); g.fillStyle = bull; g.beginPath();
      g.moveTo(w * 0.04, r * 0.1); g.lineTo(w * 0.16, -r * 0.55); g.lineTo(w * 0.24, -r * 0.62); g.lineTo(w * 0.42, -r * 0.5); g.lineTo(w * 0.5, -r * 0.1);
      g.lineTo(w * 0.47, r * 0.55); g.lineTo(w * 0.38, r * 0.3); g.lineTo(w * 0.3, r * 0.62); g.lineTo(w * 0.24, r * 0.3); g.lineTo(w * 0.14, r * 0.55); g.lineTo(w * 0.12, r * 0.2); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(w * 0.08, -r * 0.05); g.lineTo(w * 0.0, -r * 0.42); g.lineTo(w * 0.13, -r * 0.3); g.fill(); g.restore();
    }
    g.restore();
  }
  function teamMark(team) {
    if (!team) return '';
    const id = team.id; if (OWN_MARK[id]) return 'url("' + OWN_MARK[id] + '")';
    if (markCache[id]) return markCache[id];
    let url = '';
    try { const c = document.createElement('canvas'); c.width = MARK_W * MARK_K; c.height = MARK_H * MARK_K; drawMark(c.getContext('2d'), id, team); url = 'url("' + c.toDataURL('image/png') + '")'; } catch (e) { url = ''; }
    return (markCache[id] = url);
  }

  // ---------------------------------------------------------------- viewports
  const live = [];   // viewports of the current race
  const F1_LOGO = 'assets/brand/f1/f1-logo.svg';
  function markup(k, split) {
    let lights = ''; for (let i = 0; i < 5; i++) lights += '<div class="light-col"><span></span><span></span></div>';
    return '<div class="hud"><div class="tags"></div>' +
      '<div class="tower"><div class="tw-head"><i class="tw-f1" style="background-image:url(' + F1_LOGO + ')"></i><span class="tw-sess">RACE</span>' + (split ? '<span class="tw-pl">P' + (k + 1) + '</span>' : '') + '</div>' +
        '<div class="tw-lap"><span>LAP</span><b>1</b><i>/ 1</i></div><div class="tw-rows"></div></div>' +
      '<div class="timing"><div class="tm-sec"><span><em>S1</em><i></i></span><span><em>S2</em><i></i></span><span><em>S3</em><i></i></span></div>' +
        '<div class="tm-main"><div class="tm-pos"><b>1</b><small>/ 20</small></div><div class="tm-time">0:00.000</div></div>' +
        '<div class="tm-foot"><span class="tm-best"><em>BEST</em><b>--:--.---</b></span><span class="tm-last"><em>LAST</em><b>--:--.---</b></span><span class="delta"></span></div></div>' +
      '<div class="mapwrap"><canvas class="minimap" width="220" height="150"></canvas></div>' +
      '<div class="dash"><div class="gear">N</div><div class="ds-body">' +
        '<div class="ds-top"><span class="aero"><i></i>AERO</span><span class="ot"><i></i>OVERTAKE</span><span class="ers"><em class="ers-mode"></em><b class="ers-pct">100%</b><i class="bolt"></i></span></div>' +
        '<div class="ds-ers"><i class="ers-fill"></i><i class="ot-fill"></i></div>' +
        '<div class="ds-read"><span class="spd"><b>0</b><small>KM/H</small></span><span class="rpmv"><b>4000</b><small>RPM</small></span></div>' +
        '<div class="ds-rpm"><i></i></div></div></div>' +
      '<div class="corner"></div>' +
      '<div class="flb"><div class="flb-tag"><span>FASTEST</span><span>LAP</span></div><div class="flb-main"><i></i><b></b><span></span></div></div>' +
      '<div class="msg"><span></span></div>' +
      (split ? '<div class="sp-fin"><b></b><span></span></div><div class="sp-lights">' + lights + '</div><div class="sp-banner"></div><div class="sp-toasts"></div>' : '') +
      '</div>';
  }
  function makeViewport(k, car, nPlayers) {
    const split = nPlayers > 1;
    const el = document.createElement('div'); el.className = 'vp f1hud' + (split ? ' split p' + (k + 1) : '');
    el.innerHTML = markup(k, split);
    $('viewports').appendChild(el);
    for (let i = live.length - 1; i >= 0; i--) if (!live[i].el.isConnected) live.splice(i, 1);
    const q = (c) => el.querySelector(c);
    const sec = q('.tm-sec').children;
    const r = { el, car, k, split, nCompact: split ? 3 : 5, full: !split && prefs.full, rowsEl: q('.tw-rows'), rows: [],
      lapWrap: q('.tw-lap'), lapN: q('.tw-lap b'), lapT: q('.tw-lap i'),
      posWrap: q('.tm-pos'), pos: q('.tm-pos b'), posT: q('.tm-pos small'), time: q('.tm-time'), sectors: [sec[0], sec[1], sec[2]],
      best: q('.tm-best b'), bestWrap: q('.tm-best'), last: q('.tm-last b'), delta: q('.delta'),
      msg: q('.msg'), msgText: q('.msg span'), mapC: q('.minimap'), map: q('.minimap').getContext('2d'), mapWrap: q('.mapwrap'),
      gear: q('.gear'), speed: q('.spd b'), rpmV: q('.rpmv b'), rpmBar: q('.ds-rpm i'), rpmWrap: q('.ds-rpm'), ersPct: q('.ers-pct'), ersMode: q('.ers-mode'), ers: q('.ers'),
      ersFill: q('.ers-fill'), otFill: q('.ot-fill'), ot: q('.ot'), aero: q('.aero'), dash: q('.dash'),
      tags: q('.tags'), corner: q('.corner'), flb: q('.flb'), flbBar: q('.flb-main i'), flbName: q('.flb-main b'), flbTime: q('.flb-main span'),
      mapW: split ? 160 : 220, mapH: split ? 110 : 150, msgT: 0, tagEls: [], prevPos: car.pos, prevLap: -1, flT: -1, flCar: null, flUntil: 0, mapT: 0, u: 1 };
    el.classList.toggle('tw-full', r.full);
    r.setRect = (x, y, w, h, sp) => {
      el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = w + 'px'; el.style.height = h + 'px'; r.w = w; r.h = h;
      let u;
      if (split) {
        // one design unit in px for this view (1 = a 1920 x 540 stacked view)
        const tb = !sp || sp.dir !== 'sbs'; u = tb ? U.clamp(Math.min(w / 1920, h / 540), 0.66, 1.35) : U.clamp(Math.min(w / 1000, h / 1000), 0.66, 1.2);
        el.classList.toggle('edge-top', tb && k === 0); el.classList.toggle('edge-bottom', tb && k === 1); el.classList.toggle('sbs', !tb); el.classList.toggle('sbs-left', !tb && k === 0); el.classList.toggle('sbs-right', !tb && k === 1);
      } else u = U.clamp(Math.min(w / 1280, h / 720), 0.5, 2);
      r.s = u; r.u = u; el.style.setProperty('--u', u.toFixed(3)); el.style.setProperty('--s', u.toFixed(3));
      r.mapGeo = null;   // the minimap canvas is re-sized for the new scale
      r.blkT = 0;        // panel boxes for the name tags are measured again
    };
    // finished (two players): a card that stays up for the rest of the race while the cool-down lap is driven
    r.setFinished = (pos) => { const f = q('.sp-fin'); if (!f) return; f.children[0].textContent = 'P' + pos + ' · FINISHED'; f.children[1].textContent = 'Cool-down lap'; f.classList.add('show'); r.msgT = 0; r.msg.classList.remove('show'); r.fin = true; };
    r.toastEl = q('.sp-toasts'); r.bannerEl = q('.sp-banner');
    live.push(r);
    r.showMsg = (text, cls, dur) => {
      if (r.fin && split) return;
      if (/^FASTEST LAP/.test(text)) return;   // the purple fastest-lap banner carries it
      r.msgText.textContent = text; r.msg.className = 'msg ' + (cls || ''); void r.msg.offsetWidth; r.msg.classList.add('show'); r.msgT = dur || 2.5;
    };
    r.setFull = (on) => { r.full = !split && on; el.classList.toggle('tw-full', r.full); r.blkT = 0; };
    r.update = (race, dt) => {
      const c = car, t = race.track;
      // cockpit view: the wheel display carries gear / speed / ERS, so the dash goes away (I brings it back); split screen keeps it
      const ck = !!(c._cockpitT && performance.now() - c._cockpitT < 400); if (ck !== r.ck) { r.ck = ck; el.classList.toggle('cockpit', ck); r.blkT = 0; }
      if (!ck || split || prefs.ckDash) updateDash(r, race, c);
      updateTower(r, race, c);
      updateTiming(r, race, c);
      updateFastest(r, race);
      setText(r.corner, t.cornerNameAt(c.trk.s));
      if (r.msgT > 0) { r.msgT -= dt; if (r.msgT <= 0) r.msg.classList.remove('show'); }
      const now = performance.now(); if (now - r.mapT > 95) { r.mapT = now; drawMap(r, race); }   // <= ~10 Hz
    };
    r.updateTags = (list) => updateTags(r, list);
    return r;
  }

  // ---------------------------------------------------------------- timing tower
  function ensureRows(r, n) {
    while (r.rows.length < n) {
      const d = document.createElement('div'); d.className = 'lp-row empty';
      d.innerHTML = '<span class="p"></span><i class="bar"></i><i class="lg"></i><span class="n"></span><i class="fl"></i><span class="st"></span><span class="ty"></span><span class="g"></span>';
      r.rowsEl.appendChild(d);
      const ch = d.children; r.rows.push({ el: d, p: ch[0], bar: ch[1], lg: ch[2], n: ch[3], fl: ch[4], st: ch[5], ty: ch[6], g: ch[7], car: null });
    }
  }
  function updateTower(r, race, c) {
    const order = race.order, n = order.length, idx = c.pos - 1;
    ensureRows(r, n);
    const lapNow = c.finished ? 'FIN' : String(Math.max(1, Math.min(c.lap, race.laps)));
    if (lapNow !== r.prevLap) { setText(r.lapN, lapNow); if (r.prevLap !== -1) flash(r.lapWrap, 'bump', 600); r.prevLap = lapNow; }
    setText(r.lapT, c.finished ? '' : '/ ' + race.laps);
    const full = r.full, N = full ? n : Math.min(r.nCompact, n);
    let a = full ? 0 : Math.max(0, idx - (N >> 1)); const b = Math.min(n, a + N); a = Math.max(0, b - N);
    const flCar = race.fastest && race.fastest.time > 0 ? race.fastest.car : null; const flNew = flCar && race.time < r.flUntil;
    r.meRow = null;
    for (let i = 0; i < r.rows.length; i++) {
      const row = r.rows[i]; const j = a + i; const o = i < N ? order[j] : null;
      if (!o) { setCls(row.el, 'lp-row empty'); row.car = null; continue; }
      const me = o === c; const inPit = !!(o.pit && o.pit.active) && !o.finished;
      let gap, gcls = 'g';
      if (!race.started) gap = '';
      else if (inPit) { gap = 'IN PIT'; gcls = 'g pit'; }
      else if (flNew && o === flCar) { gap = 'FASTEST LAP'; gcls = 'g flap'; }
      else if (full) {
        // the whole field: interval to the car ahead (lapped cars in laps), the leader reads LEADER
        if (j === 0) gap = o.finished ? 'FIN' : 'LEADER';
        else { const p = order[j - 1]; const lg = race.lapGap(p, o); gap = o.finished && !p.finished ? 'FIN' : lg > 0 && !(p.finished && !o.finished && lg === 1 && race.lapGap(order[0], o) === 0) ? '+' + lg + ' LAP' : '+' + Math.max(0, o.gapAhead != null ? o.gapAhead : race.timeGap(p, o)).toFixed(3); }
      } else {
        // around you: gaps relative to your car (yours: to the leader); lapped cars read in laps (+1 LAP), as on the timing screens
        const lg = me ? race.lapGap(order[0], c) : j < idx ? race.lapGap(o, c) : race.lapGap(c, o);
        if (me) gap = c.finished ? 'FIN' : c.pos === 1 ? 'LEADER' : lg > 0 ? '+' + lg + ' LAP' : '+' + race.timeGap(order[0], c).toFixed(3);
        else if (lg > 0 && !(o.finished && !c.finished)) gap = (j < idx ? '-' : '+') + lg + ' LAP';
        else { const g = j < idx ? -race.timeGap(o, c) : race.timeGap(c, o); gap = (g < 0 ? '-' : '+') + Math.abs(g).toFixed(3); if (o.finished && !c.finished) gap = 'FIN'; }
      }
      // state chip: penalty time (amber), chequered (finished)
      let st = '', scls = 'st';
      if (o.penalty > 0) { st = '+' + Math.round(o.penalty) + 'S'; scls = 'st pen'; }
      else if (o.finished) { scls = 'st chq'; }
      setCls(row.el, 'lp-row' + (me ? ' me' : '') + (o.isPlayer && !me ? ' pl' : '') + (inPit ? ' inpit' : '') + (flNew && o === flCar ? ' flnew' : ''));
      setText(row.p, String(j + 1));
      if (row.car !== o) {   // the car in this row changed: colour, mark, name
        row.car = o; row.bar.style.background = o.team.primary; row.lg.style.backgroundImage = teamMark(o.team);
        setText(row.n, full ? shortName(o) : surname(o));
      } else if (row._full !== full) setText(row.n, full ? shortName(o) : surname(o));
      row._full = full;
      setCls(row.fl, o === flCar ? 'fl on' : 'fl');
      setCls(row.st, scls); setText(row.st, st);
      setCls(row.ty, 'ty ' + o.tyreKey); setText(row.ty, TYRE_LETTER[o.tyreKey] || '?');
      setCls(row.g, gcls); setText(row.g, gap);
      if (me) r.meRow = row.el;
    }
    // position change flash
    if (c.pos !== r.prevPos) { const cls = c.pos < r.prevPos ? 'gain' : 'loss'; flash(r.posWrap, cls, 900); if (r.meRow && race.started) flash(r.meRow, cls, 900); r.prevPos = c.pos; }
  }

  // ---------------------------------------------------------------- timing panel
  function updateTiming(r, race, c) {
    setText(r.pos, String(c.pos)); setText(r.posT, '/ ' + race.cars.length);
    setText(r.time, race.started && !c.finished ? fmt(Math.max(0, race.time - c.lapStart)) : c.finished ? fmt(c.raceTime != null ? c.raceTime : c.finishTime) : '0:00.000');
    // the sector bars keep the last lap's colours for 3 s after the Line, then show the new lap
    const fresh = race.started && c.sector === 0 && c.lastLapFlags && race.time - c.lapStart < 3 && c.lapsDone > 0;
    const flags = fresh ? c.lastLapFlags : c.sectorFlags;
    for (let si = 0; si < 3; si++) {
      const f = flags ? flags[si] : ''; const cls = f || (!fresh && si === c.sector && race.started && !c.finished ? 'live' : '');
      if (r.sectors[si]._c !== cls) { const was = r.sectors[si]._c; setCls(r.sectors[si], cls); if (f && was !== cls && !fresh) flash(r.sectors[si], 'pop', 600); }
    }
    setText(r.last, c.lastLap > 0 ? fmt(c.lastLap) : '--:--.---');
    const del = !!c.lastLapDeleted; if (r._del !== del) { r._del = del; r.last.classList.toggle('del', del); r.last.title = del ? 'Lap deleted (track limits)' : ''; }
    setText(r.best, c.bestLap > 0 ? fmt(c.bestLap) : '--:--.---');
    const ov = !!(race.fastest && race.fastest.car === c && c.bestLap > 0); if (r._ov !== ov) { r._ov = ov; r.bestWrap.classList.toggle('overall', ov); }
    const d = race.deltaBest(c); setText(r.delta, d == null || c.finished ? '' : (d >= 0 ? '+' : '-') + Math.abs(d).toFixed(3)); setCls(r.delta, 'delta ' + (d == null ? '' : d < 0 ? 'neg' : 'pos'));
  }

  // ---------------------------------------------------------------- fastest-lap banner (any car; polled, so main.js needs no hook)
  function updateFastest(r, race) {
    const f = race.fastest; if (!f || !(f.time > 0) || !f.car) return;
    if (f.time === r.flT && f.car === r.flCar) return;
    const first = r.flT === -1 && race.time < 1; r.flT = f.time; r.flCar = f.car; if (first) return;
    r.flUntil = race.time + 5;
    r.flbBar.style.background = f.car.team.primary; setText(r.flbName, surname(f.car)); setText(r.flbTime, fmt(f.time));
    r.flb.classList.remove('show'); void r.flb.offsetWidth; r.flb.classList.add('show');
    clearTimeout(r._flbT); r._flbT = setTimeout(() => r.flb.classList.remove('show'), 4600);
  }

  // ---------------------------------------------------------------- dash: gear, speed, RPM, battery, Overtake, Straight Mode
  function updateDash(r, race, c) {
    setText(r.speed, String(Math.round(c.speedKmh))); setText(r.gear, c.gear === 0 ? 'N' : c.v < -0.5 ? 'R' : String(c.gear));
    const rpm = U.clamp(c.rpm, 0, 1); setText(r.rpmV, String(Math.round((4000 + rpm * 8500) / 50) * 50));
    const rq = Math.round(rpm * 60) / 60; if (r._rq !== rq) { r._rq = rq; r.rpmBar.style.transform = 'scaleX(' + rq.toFixed(3) + ')'; }
    const band = rpm > 0.965 && c.gear > 0 && c.gear < 8 ? 'ds-rpm shift' : rpm > 0.82 ? 'ds-rpm hi' : 'ds-rpm'; setCls(r.rpmWrap, band);
    const ep = Math.round(U.clamp(c.ers, 0, 1) * 100); setText(r.ersPct, ep + '%');
    if (r._ep !== ep) { r._ep = ep; r.ersFill.style.transform = 'scaleX(' + (ep / 100).toFixed(2) + ')'; }
    // Overtake (2026): extra energy for this lap, earned within 1 s at the Detection Line; lit while it is being deployed
    const ote = c.otEnergy > 0.01 ? U.clamp(c.otEnergy / 0.5, 0, 1) : 0; const otq = Math.round(ote * 40) / 40;
    if (r._otq !== otq) { r._otq = otq; r.otFill.style.transform = 'scaleX(' + (otq * 0.5).toFixed(3) + ')'; }
    setCls(r.ot, 'ot' + (ote > 0 ? (c.ersActive ? ' on' : ' armed') : ''));
    setCls(r.ers, 'ers' + (c.ersActive ? ' deploy' : c.brake > 0.2 && c.v > 5 ? ' harvest' : ''));
    setText(r.ersMode, c.ersActive ? 'DEPLOY' : c.brake > 0.2 && c.v > 5 ? 'HARVEST' : '');
    // Straight Mode (the 2026 low-drag wing position, the old DRS flap) in the activation zones
    setCls(r.aero, 'aero' + (c.drsOpen ? ' open' : c.drsEligible && c.inDrsZone >= 0 ? ' armed' : ''));
  }

  // ---------------------------------------------------------------- minimap: the whole circuit, fixed, best-fit rotation
  function mapGeometry(r, t) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), k = r.u * dpr; const W = r.mapW, H = r.mapH;
    const cw = Math.max(2, Math.round(W * k)), ch = Math.max(2, Math.round(H * k));
    if (r.mapC.width !== cw || r.mapC.height !== ch) { r.mapC.width = cw; r.mapC.height = ch; }
    // fit: the rotation (5 degree steps) that gives the circuit the most room; the drawn orientation (0) unless that is 8% smaller
    const fits = t._hudFit || (t._hudFit = {}); let fit = fits[W + 'x' + H];
    if (!fit) {
      const n = t.n, step = Math.max(1, Math.round(n / 360)); let best = null;
      for (let a = 0; a < 180; a += 5) {
        const ca = Math.cos(a * Math.PI / 180), sa = Math.sin(a * Math.PI / 180); let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (let i = 0; i < n; i += step) { const x = t.x[i] * ca - t.z[i] * sa, y = t.x[i] * sa + t.z[i] * ca; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        const sc = Math.min((W - 24) / (x1 - x0), (H - 24) / (y1 - y0)); const f = { a, ca, sa, sc, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
        if (a === 0) fit = f; if (!best || sc > best.sc) best = f;
      }
      if (fit.sc < best.sc * 0.92) fit = best;
      fits[W + 'x' + H] = fit;
    }
    const sc = fit.sc * k, ox = cw / 2 - (fit.cx * fit.sc) * k, oy = ch / 2 - (fit.cy * fit.sc) * k;
    const P = (x, z) => [(x * fit.ca - z * fit.sa) * sc + ox, (x * fit.sa + z * fit.ca) * sc + oy];
    // outline: dark casing, light ribbon, aero zones, sector ticks, the Line - drawn once into an offscreen canvas
    const oc = document.createElement('canvas'); oc.width = cw; oc.height = ch; const g = oc.getContext('2d'); g.lineJoin = 'round'; g.lineCap = 'round';
    const n = t.n, step = Math.max(1, Math.round(3 / (t.ds || 1)));
    const path = new Path2D(); for (let i = 0; i <= n; i += step) { const p = P(t.x[i % n], t.z[i % n]); i === 0 ? path.moveTo(p[0], p[1]) : path.lineTo(p[0], p[1]); } path.closePath();
    g.strokeStyle = 'rgba(6,7,11,0.72)'; g.lineWidth = 7.5 * k; g.stroke(path);
    g.strokeStyle = '#eef0f4'; g.lineWidth = 3 * k; g.stroke(path);
    g.strokeStyle = '#2fe36d'; g.lineWidth = 3 * k;
    for (const z of t.drs) { const ze = z.end >= z.start ? z.end : z.end + t.length; g.beginPath(); for (let s = z.start; s <= ze; s += 8) { const j = t.idxAtS(s); const p = P(t.x[j], t.z[j]); s === z.start ? g.moveTo(p[0], p[1]) : g.lineTo(p[0], p[1]); } g.stroke(); }
    const tick = (s, col, len, w) => { const i = t.idxAtS(s); const p = P(t.x[i], t.z[i]); const nx = t.nx[i] * fit.ca - t.nz[i] * fit.sa, ny = t.nx[i] * fit.sa + t.nz[i] * fit.ca; g.beginPath(); g.moveTo(p[0] - nx * len * k, p[1] - ny * len * k); g.lineTo(p[0] + nx * len * k, p[1] + ny * len * k); g.strokeStyle = col; g.lineWidth = w * k; g.lineCap = 'butt'; g.stroke(); };
    if (t.sectors) for (const s of t.sectors) tick(s, '#ffd23f', 5, 2);
    tick(t.sf, '#0b0c10', 7, 4.2); tick(t.sf, '#ffffff', 6, 2.4);
    // sector numbers beside the start of each sector (as on the F1 game maps)
    g.font = '700 ' + (10 * k).toFixed(1) + 'px "F1 HUD", "Titillium Web", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    [t.sf].concat(t.sectors || []).forEach((s, si) => {
      const i = t.idxAtS(s + 25); const p = P(t.x[i], t.z[i]); const nx = t.nx[i] * fit.ca - t.nz[i] * fit.sa, ny = t.nx[i] * fit.sa + t.nz[i] * fit.ca;
      const x = p[0] + nx * 11 * k, y = p[1] + ny * 11 * k; g.lineWidth = 3 * k; g.strokeStyle = 'rgba(6,7,11,0.85)'; g.strokeText(String(si + 1), x, y); g.fillStyle = '#ffffff'; g.fillText(String(si + 1), x, y);
    });
    r.mapGeo = { t, P, oc, k, cw, ch };
    return r.mapGeo;
  }
  function drawMap(r, race) {
    const t = race.track; const G = r.mapGeo && r.mapGeo.t === t ? r.mapGeo : mapGeometry(r, t);
    const ctx = r.map, k = G.k, c = r.car; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, G.cw, G.ch); ctx.drawImage(G.oc, 0, 0);
    const R = 3.3 * k; ctx.lineWidth = 1.3 * k; ctx.strokeStyle = 'rgba(4,5,8,0.85)';
    for (const o of race.cars) {
      if (o === c || o.isPlayer) continue; const p = G.P(o.x, o.z);
      ctx.beginPath(); ctx.arc(p[0], p[1], R, 0, 6.2832); ctx.fillStyle = o.team.primary; ctx.fill(); ctx.stroke();
    }
    for (const o of race.players) {   // the other player (split screen): a larger dot ringed in white
      if (o === c) continue; const p = G.P(o.x, o.z);
      ctx.beginPath(); ctx.arc(p[0], p[1], R * 1.25, 0, 6.2832); ctx.fillStyle = o.team.primary; ctx.fill(); ctx.lineWidth = 1.6 * k; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    }
    const p = G.P(c.x, c.z);
    ctx.beginPath(); ctx.arc(p[0], p[1], R * 2.3, 0, 6.2832); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
    ctx.beginPath(); ctx.arc(p[0], p[1], R * 1.45, 0, 6.2832); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 2.2 * k; ctx.strokeStyle = c.team.primary; ctx.stroke();
  }

  // ---------------------------------------------------------------- name tags (main.js projects them; positions via transforms)
  // the boxes of the HUD panels in this view (px, view-local), measured at most once a second or after a layout change (one
  // layout read): name tags never draw over them
  const BLK = ['.tower', '.timing', '.dash', '.mapwrap', '.flb-tag', '.flb-main', '.corner', '.sp-keys'];
  function panelBoxes(r) {
    const now = performance.now(); if (r.blk && now - r.blkT < 1000) return r.blk;
    r.blkT = now; const v = r.el.getBoundingClientRect(); const out = r.blk || (r.blk = []); out.length = 0;
    for (const sel of BLK) for (const e of r.el.querySelectorAll(sel)) {
      const b = e.getBoundingClientRect(); if (b.width < 1 || b.height < 1) continue;
      const cs = getComputedStyle(e.closest('.flb, .dash, .corner, .sp-keys') || e); if (cs.visibility === 'hidden' || cs.opacity === '0' || cs.display === 'none') continue;
      out.push([b.left - v.left - 4, b.top - v.top - 4, b.right - v.left + 4, b.bottom - v.top + 4]);
    }
    return out;
  }
  // tag width in design px, measured with the tag's own face on a 2D canvas (no DOM layout), cached per string
  let tagCtx = null; const tagW = new Map();
  function textW(str, bold) {
    const key = (bold ? 'b' : 'n') + str; let w = tagW.get(key); if (w != null) return w;
    if (!tagCtx) { tagCtx = document.createElement('canvas').getContext('2d'); }
    tagCtx.font = (bold ? '700' : '600') + ' 12.5px "F1 HUD", "Titillium Web", sans-serif'; try { tagCtx.fontStretch = 'semi-expanded'; tagCtx.letterSpacing = '0.4px'; } catch (e) { /* older canvas */ }
    w = tagCtx.measureText(str).width * 1.04 + 1; if (tagW.size > 400) tagW.clear(); tagW.set(key, w); return w;
  }
  const TAG_MAX = 6, TAG_GAP = 3, PANEL_PAD = 12, EDGE = 6;
  function tagFree(r, n, x0, y0, x1, y1, blk) {
    if (x0 < EDGE || y0 < EDGE || x1 > r.w - EDGE || y1 > r.h - EDGE) return false;
    for (const b of blk) if (x0 < b[2] + PANEL_PAD && x1 > b[0] - PANEL_PAD && y0 < b[3] + PANEL_PAD && y1 > b[1] - PANEL_PAD) return false;
    const P = r._tagBox; for (let k = 0; k < n; k++) { const q = k * 4; if (x0 < P[q + 2] + TAG_GAP && x1 > P[q] - TAG_GAP && y0 < P[q + 3] + TAG_GAP && y1 > P[q + 1] - TAG_GAP) return false; }
    return true;
  }
  function updateTags(r, list) {
    while (r.tagEls.length < list.length) {
      const d = document.createElement('div'); d.className = 'tag'; d.style.display = 'none';   // hidden until placed (an unplaced tag would sit empty at 0,0)
      d.innerHTML = '<div class="tg"><b class="tp"></b><i class="tb"></i><span class="tn"></span></div>';
      r.tags.appendChild(d); const g = d.firstChild; r.tagEls.push({ el: d, p: g.children[0], b: g.children[1], n: g.children[2], on: false, col: '' });
    }
    if (!r._tagBox || r._tagBox.length < list.length * 4) r._tagBox = new Float32Array(Math.max(32, list.length * 4));
    // declutter: nearest cars first; a tag that would touch a HUD panel, the view edge or a nearer tag is lifted (1P: up to two
    // steps, split: one) and otherwise dropped, so a tag never draws over the tower / timing panel / dash / map
    const ord = r._tagOrd || (r._tagOrd = []); ord.length = 0; for (let i = 0; i < list.length; i++) ord.push(i); ord.sort((i, j) => list[j].alpha - list[i].alpha);
    const s = r.u || 1; const ys = r._tagYs || (r._tagYs = []); ys.length = list.length; for (let i = 0; i < list.length; i++) ys[i] = null;
    const blk = panelBoxes(r); const max = r.split ? 3 : TAG_MAX; let n = 0;
    for (const i of ord) {
      if (n >= max) break;
      const tg = list[i]; const sc = s * (0.72 + 0.28 * Math.min(1, tg.alpha));
      const w = (13 + textW(String(tg.pos), true) + 3 + 14 + textW(String(tg.text), false)) * sc, h = 28 * sc;   // 22 px tag + 6 px gap under it
      const x0 = tg.x - w / 2, x1 = tg.x + w / 2; let y = tg.y; let ok = false;
      for (let tries = 0, maxT = r.split ? 1 : 2; tries <= maxT; tries++) { if (tagFree(r, n, x0, y - h, x1, y, blk)) { ok = true; break; } y -= h * 0.92; }
      if (!ok) continue;
      const q = n * 4; r._tagBox[q] = x0; r._tagBox[q + 1] = y - h; r._tagBox[q + 2] = x1; r._tagBox[q + 3] = y; n++; ys[i] = y;
    }
    for (let i = 0; i < r.tagEls.length; i++) {
      const T = r.tagEls[i]; const tg = list[i];
      if (!tg || ys[i] == null) { if (T.on) { T.on = false; T.el.style.display = 'none'; } continue; }
      if (!T.on) { T.on = true; T.el.style.display = ''; }
      const sc = s * (0.72 + 0.28 * Math.min(1, tg.alpha));
      T.el.style.transform = 'translate3d(' + tg.x.toFixed(1) + 'px,' + ys[i].toFixed(1) + 'px,0) translate(-50%,-100%) scale(' + sc.toFixed(3) + ')';
      const op = Math.min(1, tg.alpha).toFixed(2); if (T.op !== op) { T.op = op; T.el.style.opacity = op; }
      setText(T.p, String(tg.pos)); if (T.col !== tg.color) { T.col = tg.color; T.b.style.background = tg.color; } setText(T.n, tg.text);
    }
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
    b.innerHTML = (kicker ? '<div class="bn-kicker">' + kicker + '</div>' : '') + '<div class="bn-text" style="color:' + (color || '#fff') + '">' + main + '</div>' + (sub ? '<div class="bn-sub">' + sub + '</div>' : '');
    b.classList.remove('hidden'); clearTimeout(banner._t); if (ms) banner._t = setTimeout(() => b.classList.add('hidden'), ms);
    // split screen: the same banner centred in each view
    for (const r of splitLive()) { r.bannerEl.innerHTML = b.innerHTML; r.bannerEl.classList.remove('show'); void r.bannerEl.offsetWidth; r.bannerEl.classList.add('show'); }
    if (ms) { clearTimeout(banner._t2); banner._t2 = setTimeout(() => { for (const r of splitLive()) r.bannerEl.classList.remove('show'); }, ms); }
  }
  // toasts: one player's (k given) go to that player's view in split screen; the others show in every view
  function toast(text, cls, k) {
    if (/^Fastest lap: /.test(text)) return;   // the purple fastest-lap banner carries it
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
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  }
  // keys: T = whole field / around you in the tower, I = the dash in the cockpit view (the wheel display shows the same)
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return; const a = document.activeElement; if (a && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA')) return;
    const views = live.filter(r => r.el.isConnected); if (!views.length) return;
    const shown = (id) => { const el = $(id); return !!el && !el.classList.contains('hidden'); }; if (shown('menu') || shown('pause') || shown('results')) return;
    if (e.code === 'KeyT') { if (views[0].split) return; prefs.full = !prefs.full; savePrefs(); for (const r of views) r.setFull(prefs.full); toast(prefs.full ? 'Timing tower: full field (T)' : 'Timing tower: around you (T)'); }
    else if (e.code === 'KeyI') { prefs.ckDash = !prefs.ckDash; savePrefs(); for (const r of views) r.el.classList.toggle('ckdash', prefs.ckDash); toast(prefs.ckDash ? 'Cockpit: HUD dash shown (I)' : 'Cockpit: HUD dash hidden, the wheel shows it (I)'); }
  });
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
  EI.HUD = { makeViewport, setLights, banner, toast, setDivider, showResults, drawTrackPreview, teamMark, prefs, $ };
})();
