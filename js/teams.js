// Equation I - teams, drivers and liveries.
// Each livery is painted procedurally into a canvas in the team's colour scheme. If a PNG exists at
// assets/liveries/<teamId>.png (1024x1024, same layout as the painted sheet: top view in the upper half,
// left side in the lower-left, right side lower-right), it is used instead - drop your own decals there.
window.EI = window.EI || {};
(function () {
  const TEAMS = [
    { id: 'rossa',   name: 'Scuderia Rossa',     short: 'ROS', primary: '#d8141a', secondary: '#1b1b1b', accent: '#ffffff', numberColor: '#ffffff', skill: 0.98, drivers: [{ name: 'L. Moretti', num: 16 }, { name: 'K. Hale', num: 44 }] },
    { id: 'argent',  name: 'Argent Arrows',      short: 'ARG', primary: '#0f0f12', secondary: '#c6c9cf', accent: '#00d2be', numberColor: '#ffffff', skill: 0.97, drivers: [{ name: 'G. Rossi', num: 63 }, { name: 'A. Nilsen', num: 12 }] },
    { id: 'taurus',  name: 'Taurus Energy',      short: 'TAU', primary: '#1e2a6b', secondary: '#c8102e', accent: '#ffc906', numberColor: '#ffffff', skill: 0.99, drivers: [{ name: 'M. Verhoeven', num: 1 }, { name: 'Y. Tsukada', num: 22 }] },
    { id: 'papaya',  name: 'Papaya Racing',      short: 'PAP', primary: '#f26d00', secondary: '#101010', accent: '#47c7fc', numberColor: '#101010', skill: 0.99, drivers: [{ name: 'L. Norrington', num: 4 }, { name: 'O. Piastro', num: 81 }] },
    { id: 'verdant', name: 'Verdant Aramco',     short: 'VER', primary: '#00594f', secondary: '#cedc00', accent: '#ffffff', numberColor: '#cedc00', skill: 0.94, drivers: [{ name: 'F. Alonzo', num: 14 }, { name: 'L. Strode', num: 18 }] },
    { id: 'alpenne', name: 'Alpenne',            short: 'ALP', primary: '#0b1d4f', secondary: '#ff4fa3', accent: '#2a8af6', numberColor: '#ffffff', skill: 0.93, drivers: [{ name: 'P. Gasly', num: 10 }, { name: 'F. Colapinto', num: 43 }] },
    { id: 'wilhelm', name: 'Wilhelm Racing',     short: 'WIL', primary: '#0c2b63', secondary: '#37bedd', accent: '#ffffff', numberColor: '#ffffff', skill: 0.94, drivers: [{ name: 'A. Albon', num: 23 }, { name: 'C. Sainz', num: 55 }] },
    { id: 'hayes',   name: 'Hayes EI Team',      short: 'HAY', primary: '#f2f2f2', secondary: '#b6002a', accent: '#101010', numberColor: '#101010', skill: 0.92, drivers: [{ name: 'E. Ocon', num: 31 }, { name: 'O. Bearman', num: 87 }] },
    { id: 'kinetik', name: 'Kinetik Sauber',     short: 'KIN', primary: '#0e0e0e', secondary: '#00e701', accent: '#ffffff', numberColor: '#00e701', skill: 0.91, drivers: [{ name: 'N. Hulk', num: 27 }, { name: 'G. Bortoleto', num: 5 }] },
    { id: 'vector',  name: 'Vector RB',          short: 'VRB', primary: '#f5f5f7', secondary: '#1434cb', accent: '#c8102e', numberColor: '#1434cb', skill: 0.93, drivers: [{ name: 'I. Hadjar', num: 6 }, { name: 'L. Lawson', num: 30 }] },
  ];
  TEAMS.forEach((t, i) => { t.index = i; });

  // ---- livery painter -----------------------------------------------------------------------------
  // Canvas layout (1024 x 1024):
  //   top view  : x 0..1024, y 0..512   (car nose at left, tail at right; left side of car at top)
  //   left side : x 0..1024, y 512..768  (nose at left)
  //   right side: x 0..1024, y 768..1024 (nose at left)
  const CACHE = {};
  function paintLivery(team, driverNum, playerName, driver) {
    const key = team.id + ':' + driverNum + ':' + (playerName || '');
    const code = (playerName || (driver && driver.name) || team.short).replace(/^[A-Z]\. ?/, '').slice(0, 3).toUpperCase();
    if (CACHE[key]) return CACHE[key];
    const c = document.createElement('canvas'); c.width = 1024; c.height = 1024;
    const ctx = c.getContext('2d');
    const P = team.primary, S = team.secondary, A = team.accent;

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
    // sponsor-like blocks: lightweight text decals in team style
    const sponsors = {
      rossa:   ['HP', 'SHELL', 'RAY-BAN', 'SANTANDER'], argent: ['PETRONAS', 'INEOS', 'TOMMY', 'CROWDSTRIKE'],
      taurus:  ['ORACLE', 'BYBIT', 'MOBIL 1', 'TAG HEUER'], papaya: ['MASTERCARD', 'GOOGLE', 'OKX', 'DELL'],
      verdant: ['ARAMCO', 'COGNIZANT', 'VALVOLINE', 'BOSS'], alpenne: ['BWT', 'RENAULT', 'CASTROL', 'BINANCE'],
      wilhelm: ['ATLASSIAN', 'KOMATSU', 'DURACELL', 'GULF'], hayes: ['MONEYGRAM', 'TOYOTA', 'CHIPOTLE', 'PIRELLI'],
      kinetik: ['STAKE', 'KICK', 'AUDI', 'ALLIANZ'], vector: ['VISA', 'CASH APP', 'HONDA', 'HUGO'],
    }[team.id] || ['EI', 'EI', 'EI', 'EI'];

    // ---- team-specific pattern on the top view ----
    switch (team.id) {
      case 'rossa':
        band(0, 512, P); band(200, 312, S, 420, 1024, 0); band(0, 40, S, 0, 1024); band(472, 512, S, 0, 1024);
        band(220, 292, A, 0, 300, 0);
        break;
      case 'argent':
        band(0, 512, P); band(130, 190, S, 0, 1024, 0); band(320, 380, S, 0, 1024, 0); band(236, 276, A, 0, 1024, 0);
        band(0, 512, S, 760, 1024, 0); band(0, 512, A, 980, 1024, 0);
        break;
      case 'taurus':
        band(0, 512, P); band(60, 150, S, 0, 1024, 60); band(360, 450, S, 0, 1024, -60);
        band(230, 282, A, 0, 1024, 0); band(0, 512, S, 0, 120, 0);
        break;
      case 'papaya':
        band(0, 512, P); band(0, 512, S, 820, 1024, 0); band(0, 512, S, 0, 90, 0);
        band(60, 120, A, 200, 820, 20); band(392, 452, A, 200, 820, -20);
        break;
      case 'verdant':
        band(0, 512, P); band(180, 332, S, 0, 160, 0); band(0, 512, S, 900, 1024, 0); band(236, 276, S, 160, 900, 0);
        break;
      case 'alpenne':
        band(0, 512, P); band(0, 512, S, 0, 1024); band(0, 512, P, 140, 1024, 0); band(0, 512, A, 700, 1024, 0); band(0, 512, P, 860, 1024, 0);
        break;
      case 'wilhelm':
        band(0, 512, P); band(0, 512, S, 300, 1024, 0); band(0, 512, P, 520, 1024, 0); band(0, 512, S, 720, 1024, 0); band(0, 512, P, 760, 1024, 0);
        break;
      case 'hayes':
        band(0, 512, P); band(0, 512, S, 0, 180, 0); band(0, 512, A, 860, 1024, 0); band(236, 276, S, 180, 860, 0);
        break;
      case 'kinetik':
        band(0, 512, P); band(0, 512, S, 0, 130, 0); band(0, 512, S, 540, 700, 0); band(0, 512, S, 930, 1024, 0);
        break;
      case 'vector':
        band(0, 512, P); band(0, 512, S, 0, 200, 0); band(0, 512, S, 900, 1024, 0); band(236, 276, A, 200, 900, 0);
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
      textAt(sponsors[k], 500, y0 + 60, 54, k === 0 ? A : A, 0); textAt(sponsors[2 + k], 500, y0 + 160, 40, A, 0);
      textAt(team.name.toUpperCase(), 280, y0 + 212, 26, A, 0);
      // race number on sidepod
      textAt(String(driverNum), 700, y0 + 60, 70, team.numberColor, 0, 'italic 900 Arial Black, Arial');
      // EI stamp on tail
      textAt('EI', 940, y0 + 100, 60, A, 0);
    }
    // ---- top-view decals: number on nose, sponsors on sidepods/engine cover, driver code on the airbox ----
    textAt(String(driverNum), 150, 256, 130, team.numberColor, Math.PI / 2, 'italic 900 Arial Black, Arial');
    textAt(sponsors[0], 560, 80, 44, A, 0); textAt(sponsors[1], 560, 432, 44, A, 0);
    textAt(sponsors[2], 880, 256, 36, A, Math.PI / 2); textAt(sponsors[3], 700, 256, 30, A, Math.PI / 2);
    textAt(code, 520, 256, 60, team.numberColor, Math.PI / 2);
    textAt('EQUATION I', 320, 256, 28, A, Math.PI / 2);
    // front wing stripe + number plates on the wing endplates region (left/right edge of top view)
    ctx.fillStyle = A; ctx.fillRect(0, 0, 60, 10); ctx.fillRect(0, 502, 60, 10);
    // mirror-side driver name on the engine cover sides
    textAt((driver ? driver.name : team.name).toUpperCase(), 300, 512 + 40, 22, A, 0); textAt((driver ? driver.name : team.name).toUpperCase(), 300, 768 + 40, 22, A, 0);
    // subtle panel lines
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 3;
    for (const x of [180, 330, 640, 800]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke(); }
    // fine panel seams + subtle sheen gradient
    const sheen = ctx.createLinearGradient(0, 0, 0, 512); sheen.addColorStop(0, 'rgba(255,255,255,0.10)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(0,0,0,0.12)'); ctx.fillStyle = sheen; ctx.fillRect(0, 0, 1024, 512);
    const tex = new THREE.CanvasTexture(c); tex.anisotropy = 8; tex.flipY = false;
    CACHE[key] = tex;
    // optional external decal sheet replaces the painted one when it exists
    const img = new Image();
    img.onload = function () { ctx.drawImage(img, 0, 0, 1024, 1024); tex.needsUpdate = true; };
    img.onerror = function () { /* keep procedural livery */ };
    img.src = 'assets/liveries/' + team.id + '.png';
    return tex;
  }

  // small preview for the menu (top view)
  function drawPreview(canvas, team, num, name) {
    const tex = paintLivery(team, num, name);
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

  EI.TEAMS = TEAMS;
  EI.paintLivery = paintLivery;
  EI.drawLiveryPreview = drawPreview;
  EI.TYRES = {
    soft:   { name: 'Soft',   color: '#e10600', grip: 1.03, wear: 0.018 },
    medium: { name: 'Medium', color: '#ffd200', grip: 1.00, wear: 0.010 },
    hard:   { name: 'Hard',   color: '#ffffff', grip: 0.975, wear: 0.005 },
  };
})();
