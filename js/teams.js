// Equation I - teams, drivers and liveries.
// Each livery is painted procedurally into a canvas in the team's colour scheme. If a PNG exists at
// assets/liveries/<teamId>.png (1024x1024, same layout as the painted sheet: top view in the upper half,
// left side in the lower-left, right side lower-right), it is used instead - drop your own decals there and add the team id
// to LIVERY_PNGS below (only listed ids are requested, so missing sheets never log 404s).
window.EI = window.EI || {};
(function () {
  // ---- the 2026 grid: 11 entries in constructors' championship order (after round 17, Singapore). Identity, colours and kit
  // live here; js/liveries.js holds each team's livery design. Driver names / numbers / codes are refreshed from EI.SEASON
  // (js/data/season2026.js) when it is loaded. helmet = the driver's main helmet colour (the model's helmet is one colour).
  // primary = the team's broadcast colour (HUD, timing tower, pit boards, fans); the car's real paint is in js/liveries.js.
  // tcam: 'y' fluorescent yellow / 'b' black T-cam on the airbox (from 2026 race photos; unset = black on seat 1, yellow on seat 2)
  const D = (name, num, code, helmet, tcam) => (tcam ? { name, num, code, helmet, tcam } : { name, num, code, helmet });
  const TEAMS = [
    { id: 'mercedes', name: 'Mercedes-AMG Petronas F1 Team', brand: 'Mercedes', short: 'MER', primary: '#27f4d2', secondary: '#0e0e10', accent: '#00a19c', numberColor: '#0e0e10', skill: 0.99,
      drivers: [D('Andrea Kimi Antonelli', 12, 'ANT', '#e9edf2', 'y'), D('George Russell', 63, 'RUS', '#1f4fb8', 'b')] },
    { id: 'ferrari', name: 'Scuderia Ferrari HP', brand: 'Ferrari', short: 'FER', primary: '#e8002d', secondary: '#ffffff', accent: '#16171a', numberColor: '#ffffff', skill: 0.984,
      drivers: [D('Charles Leclerc', 16, 'LEC', '#f2f2f2', 'b'), D('Lewis Hamilton', 44, 'HAM', '#ffd400', 'y')] },
    { id: 'mclaren', name: 'McLaren Mastercard F1 Team', brand: 'McLaren', short: 'MCL', primary: '#ff8000', secondary: '#2b2d31', accent: '#47c7fc', numberColor: '#2b2d31', skill: 0.983,
      drivers: [D('Lando Norris', 1, 'NOR', '#d7ff1e', 'y'), D('Oscar Piastri', 81, 'PIA', '#f4f6fa', 'b')] },
    { id: 'redbull', name: 'Oracle Red Bull Racing', brand: 'Red Bull Racing', short: 'RBR', primary: '#3671c6', secondary: '#0b0c12', accent: '#db0a40', numberColor: '#ffffff', skill: 0.988,
      drivers: [D('Max Verstappen', 3, 'VER', '#16245c', 'b'), D('Isack Hadjar', 6, 'HAD', '#f2f2f2', 'y')] },
    { id: 'racingbulls', name: 'Visa Cash App Racing Bulls F1 Team', brand: 'Racing Bulls', short: 'VRB', primary: '#6692ff', secondary: '#1634cc', accent: '#e10600', numberColor: '#1634cc', skill: 0.964,
      drivers: [D('Liam Lawson', 30, 'LAW', '#121212'), D('Arvid Lindblad', 41, 'LIN', '#ff7a1a')] },
    { id: 'alpine', name: 'BWT Alpine F1 Team', brand: 'Alpine', short: 'ALP', primary: '#0093cc', secondary: '#ff87bc', accent: '#0b1630', numberColor: '#ffffff', skill: 0.965,
      drivers: [D('Pierre Gasly', 10, 'GAS', '#0b1d4f'), D('Franco Colapinto', 43, 'COL', '#79c2ff')] },
    { id: 'haas', name: 'TGR Haas F1 Team', brand: 'Haas', short: 'HAA', primary: '#b6babd', secondary: '#16181c', accent: '#e6002b', numberColor: '#16181c', skill: 0.949,
      drivers: [D('Esteban Ocon', 31, 'OCO', '#ff5aa5'), D('Oliver Bearman', 87, 'BEA', '#e6002b')] },
    { id: 'audi', name: 'Audi Revolut F1 Team', brand: 'Audi', short: 'AUD', primary: '#f03c14', secondary: '#151515', accent: '#f50537', numberColor: '#151515', skill: 0.959,
      drivers: [D('Nico Hülkenberg', 27, 'HUL', '#ffd200'), D('Gabriel Bortoleto', 5, 'BOR', '#13a24b')] },
    { id: 'williams', name: 'Atlassian Williams F1 Team', brand: 'Williams', short: 'WIL', primary: '#64c4ff', secondary: '#0a1433', accent: '#e4002b', numberColor: '#ffffff', skill: 0.942,
      drivers: [D('Alexander Albon', 23, 'ALB', '#0aa4e6'), D('Carlos Sainz', 55, 'SAI', '#d1001c')] },
    { id: 'astonmartin', name: 'Aston Martin Aramco F1 Team', brand: 'Aston Martin', short: 'AMR', primary: '#229971', secondary: '#cedc00', accent: '#6cc4e8', numberColor: '#ffffff', skill: 0.924,
      drivers: [D('Fernando Alonso', 14, 'ALO', '#1d3fa8'), D('Lance Stroll', 18, 'STR', '#f2f2f2')] },
    { id: 'cadillac', name: 'Cadillac Formula 1 Team', brand: 'Cadillac', short: 'CAD', primary: '#c9ccd1', secondary: '#0b0b0b', accent: '#b8975a', numberColor: '#0b0b0b', skill: 0.91,
      drivers: [D('Sergio Pérez', 11, 'PER', '#0f7a3c'), D('Valtteri Bottas', 77, 'BOT', '#1e5bc6')] },
  ];
  // the player-only works teams (they take over a real entry for the race, see race.js): their own brand liveries
  const OWN_TEAMS = [
    { id: 'lumi', name: 'Lumi Racing', brand: 'Lumi Racing', short: 'LUM', primary: '#fffaf2', secondary: '#5e3a5f', accent: '#7fcf9b', numberColor: '#5e3a5f', skill: 0.95, own: true, drivers: [] },
    { id: 'intake', name: 'Intake Racing', brand: 'Intake Racing', short: 'INT', primary: '#5bbcff', secondary: '#2b211c', accent: '#fff8ec', numberColor: '#2b211c', skill: 0.95, own: true, drivers: [] },
  ];
  // refresh names / numbers / codes from the season data (mid-season seat changes land there)
  const S = EI.SEASON;
  if (S && Array.isArray(S.teams)) {
    const byCode = {}; (S.drivers || []).concat(S.reserves || []).forEach(d => { if (d && d.code) byCode[d.code] = d; });
    TEAMS.forEach(t => {
      const st = S.teams.find(x => x && x.id === t.id); if (!st) return;
      if (st.full) t.name = st.full; if (st.name) t.brand = st.name;
      const list = (st.drivers || []).map(d => (typeof d === 'string' ? byCode[d] : d)).filter(Boolean);
      list.slice(0, 2).forEach((d, j) => {
        const cur = t.drivers[j] || (t.drivers[j] = { helmet: t.accent }); const code = d.code || cur.code;
        const old = t.drivers.find(x => x.code === code); if (old && old !== cur) for (const f of ['helmet', 'tcam']) { const h = old[f]; old[f] = cur[f]; cur[f] = h; }
        cur.code = code; cur.name = d.name || ((d.first ? d.first + ' ' : '') + (d.last || '')) || cur.name; cur.num = +(d.number || d.num || cur.num);
      });
    });
    const order = S.constructorsOrder || (S.standings && S.standings.constructors && S.standings.constructors.map(c => c[0]));
    if (Array.isArray(order)) TEAMS.sort((a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99));
  }
  // car sponsors: the real teams carry their own partners (drawn by js/liveries.js); the works teams their own brand
  const lumOf = (hex) => { const c = parseInt(hex.slice(1), 16); return (0.2126 * (c >> 16) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255; };
  TEAMS.forEach((t) => { t.sponsors = []; });
  OWN_TEAMS.forEach((t, k) => { t.sponsors = EI.Ads ? EI.Ads.sponsorsFor(k, lumOf(t.primary) > 0.55, t.id) : [{ n: 'EQUATION', fg: '#ffffff' }]; });
  // driver kit seen from the cockpit: race suit, suit underside panel, gloves and glove accent (padding / strap).
  // Gloves stay dark with team accents so the hands never read as bright blobs on the wheel.
  const KIT = {
    mercedes:    { suit: '#141418', suitPanel: '#c5c9ce', glove: '#121316', gloveAccent: '#00a19c' },
    ferrari:     { suit: '#d40d17', suitPanel: '#f2f2f2', glove: '#17171a', gloveAccent: '#e10a17' },
    mclaren:     { suit: '#ff7a00', suitPanel: '#2b2d31', glove: '#1a1b1e', gloveAccent: '#ff8000' },
    redbull:     { suit: '#1c2a5a', suitPanel: '#0f1630', glove: '#121a3a', gloveAccent: '#db0a40' },
    racingbulls: { suit: '#f2f4f8', suitPanel: '#1634cc', glove: '#14183a', gloveAccent: '#1634cc' },
    alpine:      { suit: '#0a5fbd', suitPanel: '#ff87bc', glove: '#0d1530', gloveAccent: '#ff87bc' },
    haas:        { suit: '#f4f4f4', suitPanel: '#16181c', glove: '#141414', gloveAccent: '#e6002b' },
    audi:        { suit: '#1a1a1a', suitPanel: '#c8ced4', glove: '#121212', gloveAccent: '#f50537' },
    williams:    { suit: '#1452c8', suitPanel: '#0a1433', glove: '#0c1430', gloveAccent: '#00aeef' },
    astonmartin: { suit: '#00594f', suitPanel: '#0f2b27', glove: '#0f1d1b', gloveAccent: '#cedc00' },
    cadillac:    { suit: '#121212', suitPanel: '#f2f2f2', glove: '#111111', gloveAccent: '#b8975a' },
    lumi:        { suit: '#fffaf2', suitPanel: '#5e3a5f', glove: '#2d1a3b', gloveAccent: '#7fcf9b' },
    intake:      { suit: '#5bbcff', suitPanel: '#2b211c', glove: '#1a1512', gloveAccent: '#5bbcff' },
  };
  TEAMS.concat(OWN_TEAMS).forEach((t) => Object.assign(t, KIT[t.id] || {}));
  TEAMS.forEach((t, i) => { t.index = i; });
  OWN_TEAMS.forEach((t, i) => { t.index = TEAMS.length + i; });

  // ---- livery painter -----------------------------------------------------------------------------
  // Canvas layout (1024 x 1024):
  //   top view  : x 0..1024, y 0..512   (car nose at left, tail at right; left side of car at top)
  //   left side : x 0..1024, y 512..768  (nose at left)
  //   right side: x 0..1024, y 768..1024 (nose at left)
  const CACHE = {};
  const LIVERY_PNGS = [];   // team ids that ship an assets/liveries/<id>.png decal sheet
  function paintLivery(team, driverNum, playerName, driver) {
    const code = carCode(driver, playerName, team);
    const key = team.id + ':' + driverNum + ':' + code;
    if (CACHE[key]) return CACHE[key];
    const c = document.createElement('canvas'); c.width = 1024; c.height = 1024;
    const ctx = c.getContext('2d');
    const P = team.primary, S = team.secondary, A = team.accent;
    // the 2026 teams: the same design functions as the GLB livery (js/liveries.js), drawn into this sheet's top / side views
    if (EI.LIVERIES && EI.LIVERIES.has(team.id) && EI.CarGLB && EI.CarGLB.sideKit) {
      const parts = EI.LIVERIES.partColours(team);
      ctx.fillStyle = parts.body; ctx.fillRect(0, 0, 1024, 1024);
      // top view (mm, X = z, Y = -x) -> u = 512 + 0.16 Y (nose left), v = 256 - 0.2327 X
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 1024, 512); ctx.clip(); ctx.setTransform(0, -0.2327, 0.16, 0, 512, 256);
      const at = (x, z, fn, rot) => { ctx.save(); ctx.translate(z * 1000, -x * 1000); if (rot) ctx.rotate(rot); fn(); ctx.restore(); };
      const rect = (x0, x1, z0, z1, col) => { ctx.fillStyle = col; ctx.fillRect(z0 * 1000, -x1 * 1000, (z1 - z0) * 1000, (x1 - x0) * 1000); };
      const poly = (pts, col) => { ctx.beginPath(); pts.forEach(([x, z], i) => (i ? ctx.lineTo(z * 1000, -x * 1000) : ctx.moveTo(z * 1000, -x * 1000))); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); };
      const txt = (str, x, z, cap, col, font, rot, ls) => at(x, z, () => { ctx.font = font.replace('%', (cap * 1000).toFixed(1) + 'px'); if (EI.Ads && EI.Ads.setLS) EI.Ads.setLS(ctx, (ls || 0) * cap * 1000); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = col; ctx.fillText(str, 0, cap * 40); if (EI.Ads && EI.Ads.setLS) EI.Ads.setLS(ctx, 0); }, rot);
      const dec = (spec, x, z, cap, maxW, rot) => at(x, z, () => EI.Ads && EI.Ads.drawDecal(ctx, spec, 0, 0, cap * 1000, maxW * 1000), rot);
      EI.LIVERIES.top(ctx, { at, txt, dec, rect, poly }, team, driverNum); ctx.restore();
      // side views (mm, X = -x, Y = -y), uniform scale so logos keep their aspect: u = 512 + 0.16 X (nose left), v = y0 + 184 + 0.16 Y (y 1.15 .. -0.45 m)
      for (let k = 0; k < 2; k++) {
        const y0 = 512 + k * 256; ctx.save(); ctx.beginPath(); ctx.rect(0, y0, 1024, 256); ctx.clip(); ctx.setTransform(0.16, 0, 0, 0.16, 512, y0 + 184);
        EI.LIVERIES.side(ctx, EI.CarGLB.sideKit(ctx, -1), team, driverNum, code); ctx.restore();
      }
      const tex = new THREE.CanvasTexture(c); tex.anisotropy = 8; tex.flipY = false; tex.encoding = THREE.sRGBEncoding;
      return (CACHE[key] = tex);
    }

    // base
    ctx.fillStyle = P; ctx.fillRect(0, 0, 1024, 1024);

    // helpers
    function band(y0, y1, color, x0, x1, skew) {
      skew = skew || 0; x0 = x0 == null ? 0 : x0; x1 = x1 == null ? 1024 : x1;
      ctx.fillStyle = color; ctx.beginPath();
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1 + skew, y1); ctx.lineTo(x0 + skew, y1); ctx.closePath(); ctx.fill();
    }
    function textAt(txt, x, y, size, color, rot, font, align) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0);
      ctx.fillStyle = color; ctx.font = '900 ' + size + 'px ' + (font || 'Arial Black, Arial, sans-serif');
      ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, 0, 0); ctx.restore();
    }
    // partner decals (EI.Ads.drawDecal: brand lock-ups on their plates, URLs in the brand faces); colours chosen against the paint
    const lumOf2 = (hex) => { const c = parseInt(hex.slice(1), 16); return (0.2126 * (c >> 16) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255; };
    const onP = lumOf2(P) > 0.55 ? '#141414' : '#ffffff', onS = lumOf2(S) > 0.55 ? '#141414' : '#ffffff';
    const sps = (team.sponsors && team.sponsors.length ? team.sponsors : [{ n: 'EQUATION' }, { n: 'EI' }, { n: 'EI' }, { n: 'EI' }]);
    const spAt = (i, x, y, cap, maxW, rot, fg) => {
      const sp = Object.assign({}, sps[i % sps.length]); if (fg && !sp.bg) sp.fg = fg; if (!sp.fg) sp.fg = onP;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0);
      if (EI.Ads && EI.Ads.drawDecal) EI.Ads.drawDecal(ctx, sp, 0, 0, cap, maxW); else { ctx.fillStyle = sp.fg; ctx.font = '900 ' + cap + 'px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(sp.n, 0, 0); }
      ctx.restore();
    };

    // ---- team-specific pattern on the top view ----
    switch (team.id) {
      case 'intake':   // sky-blue car, cocoa engine cover on dotted paper, cream edge stripe
        band(0, 512, P); band(0, 512, S, 560, 1024, 0); band(0, 512, A, 548, 560, 0);
        ctx.fillStyle = 'rgba(255,248,236,0.16)'; for (let x = 572; x < 1024; x += 14) for (let y = 7; y < 512; y += 14) { ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 7); ctx.fill(); }
        if (EI.Ads) EI.Ads.intakeMark(ctx, 700, 196, 120);
        break;
      case 'lumi':     // cream car, plum rear, the mark's lilac and green as pinstripes
        band(0, 512, P); band(0, 512, S, 600, 1024, 0); band(0, 512, '#e6c8ff', 584, 596, 0); band(0, 512, A, 570, 578, 0);
        if (EI.Ads) EI.Ads.lumiMark(ctx, 700, 196, 120, null, true);
        break;
      default:
        band(0, 512, P); band(0, 512, S, 0, 180, 0);
    }
    // ---- side views: mirror the scheme ----
    for (let k = 0; k < 2; k++) {
      const y0 = 512 + k * 256;
      ctx.fillStyle = P; ctx.fillRect(0, y0, 1024, 256);
      ctx.fillStyle = S; ctx.fillRect(0, y0 + 190, 1024, 66);  // floor edge dark
      ctx.fillStyle = S; ctx.fillRect(0, y0, 140, 256);          // nose tip
      ctx.fillStyle = A; ctx.fillRect(0, y0 + 110, 1024, 18);     // accent stripe along sidepod
      ctx.fillStyle = S; ctx.fillRect(860, y0, 164, 256);         // engine cover tail
      spAt(0, 500, y0 + 60, 40, 300); spAt(2 + k, 500, y0 + 160, 30, 260);
      textAt(team.name.toUpperCase(), 280, y0 + 212, 26, onS, 0);
      // race number on sidepod
      textAt(String(driverNum), 700, y0 + 60, 70, team.numberColor, 0, 'italic 900 Arial Black, Arial');
      // EI stamp on tail
      textAt('EI', 940, y0 + 100, 60, onS, 0);
    }
    // ---- top-view decals: number on nose, sponsors on sidepods/engine cover, driver code on the airbox ----
    textAt(String(driverNum), 150, 256, 130, team.numberColor, Math.PI / 2, 'italic 900 Arial Black, Arial');
    spAt(0, 420, 80, 34, 300); spAt(1, 420, 432, 34, 300);
    if (team.id !== 'lumi' && team.id !== 'intake') { spAt(2, 880, 256, 28, 300, Math.PI / 2, onS); spAt(3, 700, 256, 24, 260, Math.PI / 2); }
    textAt(code, 520, 256, 60, team.numberColor, Math.PI / 2);
    textAt('EQUATION I', 320, 256, 28, onP, Math.PI / 2);
    // front wing stripe + number plates on the wing endplates region (left/right edge of top view)
    ctx.fillStyle = A; ctx.fillRect(0, 0, 60, 10); ctx.fillRect(0, 502, 60, 10);
    // mirror-side driver name on the engine cover sides
    textAt((driver ? driver.name : team.name).toUpperCase(), 300, 512 + 40, 22, onP, 0); textAt((driver ? driver.name : team.name).toUpperCase(), 300, 768 + 40, 22, onP, 0);
    // subtle panel lines
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 3;
    for (const x of [180, 330, 640, 800]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke(); }
    // fine panel seams + subtle sheen gradient
    const sheen = ctx.createLinearGradient(0, 0, 0, 512); sheen.addColorStop(0, 'rgba(255,255,255,0.10)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(0,0,0,0.12)'); ctx.fillStyle = sheen; ctx.fillRect(0, 0, 1024, 512);
    const tex = new THREE.CanvasTexture(c); tex.anisotropy = 8; tex.flipY = false; tex.encoding = THREE.sRGBEncoding;
    CACHE[key] = tex;
    // optional external decal sheet replaces the painted one: only requested for teams listed in LIVERY_PNGS
    // (add a team id there after dropping assets/liveries/<id>.png in), so no 404s are logged on every load
    if (LIVERY_PNGS.indexOf(team.id) >= 0) {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = function () { ctx.drawImage(img, 0, 0, 1024, 1024); tex.needsUpdate = true; };
      img.onerror = function () { /* keep procedural livery */ };
      img.src = 'assets/liveries/' + team.id + '.png';
    }
    return tex;
  }

  // the 3-letter code painted on the car: the driver's code, or the player's own name when they typed one
  function carCode(driver, playerName, team) {
    const nm = playerName && !/^(YOU|P\d|PLAYER ?\d?)$/i.test(playerName.trim()) && !(driver && playerName === driver.name) ? playerName : null;
    if (!nm && driver && driver.code) return driver.code;
    return (nm || (driver && driver.name) || team.short).replace(/^[A-Z]\. ?/, '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
  }
  // small preview for the menu: side view of the car (nose left) in the team livery, with wheels and wings
  function drawPreview(canvas, team, num, name, driver) {
    driver = driver || (team.drivers || []).find(d => d.num === num) || null;
    if (EI.LIVERIES && EI.LIVERIES.has(team.id) && EI.CarGLB && EI.CarGLB.sideKit) return drawSidePreview(canvas, team, num, name, driver);
    const tex = paintLivery(team, num, name, driver);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0e1016'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    // car silhouette
    ctx.save();
    ctx.beginPath();
    const w = canvas.width, h = canvas.height;
    ctx.moveTo(w * 0.04, h * 0.5); ctx.lineTo(w * 0.22, h * 0.36); ctx.lineTo(w * 0.42, h * 0.26); ctx.lineTo(w * 0.86, h * 0.3); ctx.lineTo(w * 0.96, h * 0.4);
    ctx.lineTo(w * 0.96, h * 0.6); ctx.lineTo(w * 0.86, h * 0.7); ctx.lineTo(w * 0.42, h * 0.74); ctx.lineTo(w * 0.22, h * 0.64); ctx.closePath(); ctx.clip();
    ctx.drawImage(tex.image, 0, 0, 1024, 512, 0, 0, w, h);
    ctx.restore();
    // wheels
    ctx.fillStyle = '#111';
    for (const [x, y] of [[0.24, 0.12], [0.24, 0.72], [0.8, 0.1], [0.8, 0.74]]) ctx.fillRect(w * x, h * y, w * 0.1, h * 0.16);
    // wings
    ctx.fillStyle = team.secondary; ctx.fillRect(w * 0.02, h * 0.1, w * 0.05, h * 0.8); ctx.fillRect(w * 0.93, h * 0.14, w * 0.05, h * 0.72);
  }

  function drawSidePreview(canvas, team, num, name, driver) {
    const tex = paintLivery(team, num, name, driver); const parts = EI.LIVERIES.partColours(team);
    const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#0e1016'; ctx.fillRect(0, 0, w, h);
    const ppm = Math.min(w / 6.1, h / 1.55), X = (x) => w / 2 - (x - 0.3) * ppm, Y = (y) => h * 0.86 - y * ppm;
    const shape = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))); ctx.closePath(); };
    // floor shadow + carbon floor
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(X(0.2), Y(0.0), 2.9 * ppm, 0.06 * ppm, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#1b1c20'; shape([[2.2, 0.06], [-1.95, 0.06], [-1.95, 0.12], [2.2, 0.12]]); ctx.fill();
    // bodywork silhouette, filled with the side view of the livery sheet (u = 512 - 160 x, v = 696 - 160 y)
    const BODY = [[3.06, 0.17], [2.9, 0.27], [2.4, 0.4], [1.7, 0.53], [1.15, 0.64], [1.0, 0.72], [0.55, 0.74], [0.3, 0.8], [0.12, 0.98], [-0.08, 1.04], [-0.42, 0.98], [-0.9, 0.84], [-1.4, 0.68], [-1.82, 0.52], [-1.9, 0.3], [-1.85, 0.12], [-0.9, 0.12], [0.9, 0.14], [2.0, 0.15], [2.6, 0.13]];
    ctx.save(); shape(BODY); ctx.clip();
    ctx.drawImage(tex.image, 512 - 160 * 3.2, 696 - 160 * 1.15, 160 * 5.9, 160 * 1.3, X(3.2), Y(1.15), 5.9 * ppm, 1.3 * ppm);
    const sh = ctx.createLinearGradient(0, Y(1.05), 0, Y(0.1)); sh.addColorStop(0, 'rgba(255,255,255,0.18)'); sh.addColorStop(0.45, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.25)'); ctx.fillStyle = sh; ctx.fillRect(0, 0, w, h);
    ctx.restore();
    // halo + helmet
    ctx.fillStyle = (driver && driver.helmet) || team.accent; ctx.beginPath(); ctx.ellipse(X(0.6), Y(0.77), 0.12 * ppm, 0.1 * ppm, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#20232a'; ctx.beginPath(); ctx.ellipse(X(0.66), Y(0.78), 0.06 * ppm, 0.03 * ppm, 0, 0, 7); ctx.fill();   // visor
    ctx.lineCap = 'round'; ctx.lineWidth = 0.05 * ppm; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; for (const pass of [0, 1]) { if (pass) { ctx.lineWidth = 0.035 * ppm; ctx.strokeStyle = parts.halo || '#2a2c31'; }
      ctx.beginPath(); ctx.moveTo(X(1.15), Y(0.68)); ctx.quadraticCurveTo(X(1.0), Y(0.9), X(0.6), Y(0.9)); ctx.lineTo(X(0.25), Y(0.88)); ctx.stroke(); }
    // wings: front-wing endplate / flaps, rear-wing endplate / main plane
    ctx.fillStyle = parts.fwEnd; shape([[3.0, 0.05], [2.45, 0.05], [2.45, 0.3], [2.75, 0.3], [3.0, 0.16]]); ctx.fill();
    ctx.fillStyle = parts.fwFlap; shape([[2.95, 0.2], [2.5, 0.27], [2.5, 0.31], [2.9, 0.25]]); ctx.fill();
    ctx.fillStyle = parts.rwEnd; shape([[-1.9, 0.42], [-2.36, 0.42], [-2.36, 1.0], [-1.95, 1.0]]); ctx.fill();
    ctx.fillStyle = parts.rwMain; shape([[-1.92, 0.88], [-2.34, 0.92], [-2.34, 1.0], [-1.94, 0.97]]); ctx.fill();
    // wheels
    for (const x of [1.75, -1.85]) { ctx.fillStyle = '#0b0b0c'; ctx.beginPath(); ctx.arc(X(x), Y(0.36), 0.36 * ppm, 0, 7); ctx.fill(); ctx.strokeStyle = '#ffd200'; ctx.lineWidth = 0.03 * ppm; ctx.beginPath(); ctx.arc(X(x), Y(0.36), 0.3 * ppm, 0, 7); ctx.stroke(); ctx.fillStyle = '#2a2c31'; ctx.beginPath(); ctx.arc(X(x), Y(0.36), 0.2 * ppm, 0, 7); ctx.fill(); }
    // team + driver caption
    ctx.fillStyle = '#ffffff'; ctx.font = '700 ' + Math.round(h * 0.11) + 'px "Titillium Web", Arial, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(team.brand || team.name, w * 0.03, h * 0.04); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '600 ' + Math.round(h * 0.09) + 'px "Titillium Web", Arial, sans-serif';
    if (driver) ctx.fillText('#' + num + '  ' + driver.name, w * 0.03, h * 0.17);
  }
  EI.carCode = carCode;
  EI.TEAMS = TEAMS;
  EI.OWN_TEAMS = OWN_TEAMS;
  EI.TEAM_BY_ID = {}; TEAMS.concat(OWN_TEAMS).forEach(t => { EI.TEAM_BY_ID[t.id] = t; });
  EI.paintLivery = paintLivery;
  EI.drawLiveryPreview = drawPreview;
  EI.TYRES = {
    soft:   { name: 'Soft',   color: '#e10600', grip: 1.03, wear: 0.018 },
    medium: { name: 'Medium', color: '#ffd200', grip: 1.00, wear: 0.010 },
    hard:   { name: 'Hard',   color: '#ffffff', grip: 0.975, wear: 0.005 },
  };
})();
