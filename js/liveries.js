// Equation I - the 2026 team liveries (one design function per team, drawn procedurally).
// carglb.js composes every car's livery texture by projecting orthographic SIDE and TOP views of the car (metres; x forward,
// y up, z right; nose tip x 3.0, front axle 1.75, rear axle -1.85) onto the bodywork (see CarGLB.projectDecals). Each team
// here gives:
//   parts : the base colour of each painted part of the model (body, wings, endplates, halo, mirrors, fins), names in PART_KEYS
//   side(L): colour blocks / stripes / emblems / partner logos for one side (called for both, mirrored so text reads left->right)
//   top(L) : the same for the up-facing surfaces (nose, sidepod tops, engine cover, rear wing top), text reads from behind
//   num   : the race-number style (font, colour, slant, condensing)
// Partner logos are drawn through EI.Ads.drawPartner (f1-BRAND: real artwork, aspect kept); without it a styled wordmark is
// drawn instead. Everything is painted once per team + number + driver code and cached by carglb.js (no per-frame work).
window.EI = window.EI || {};
(function () {
  const MM = 1000;
  const TOP_V = 1.4, LOW_V = -0.1;
  // ---------------------------------------------------------------- shared drawing helpers (side kit k comes from carglb)
  const slug = (n) => String(n).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
  const lum = (h) => { const c = parseInt(String(h).slice(1), 16); return (0.2126 * (c >> 16) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255; };
  // number / wordmark text in metres at (0, 0) of the current transform: st = { ff, w, it, sx, skew, ls, outline: [w m, col] }
  function styledText(g, str, cap, col, st) {
    st = st || {}; g.save(); if (st.sx) g.scale(st.sx, 1); if (st.skew) g.transform(1, 0, -st.skew, 1, 0, 0);
    g.font = (st.it ? 'italic ' : '') + (st.w || 900) + ' ' + (cap * MM).toFixed(1) + 'px ' + (st.ff || '"Titillium Web", Arial, sans-serif');
    if (EI.Ads && EI.Ads.setLS) EI.Ads.setLS(g, (st.ls || 0) * cap * MM);
    g.textAlign = st.align || 'center'; g.textBaseline = 'middle';
    if (st.outline) { g.lineWidth = st.outline[0] * MM; g.strokeStyle = st.outline[1]; g.lineJoin = 'round'; g.strokeText(str, 0, cap * MM * 0.04); }
    g.fillStyle = col; g.fillText(str, 0, cap * MM * 0.04);
    if (EI.Ads && EI.Ads.setLS) EI.Ads.setLS(g, 0); g.restore();
  }
  // partner logo centred on the current origin inside w x h (metres). tone: 'white' | 'black' | 'color' | 'mono:#hex'
  const FALLBACK = {   // styled-text stand-ins (used only when f1-BRAND has no artwork for the id)
    petronas: { n: 'PETRONAS', w: 900, col: '#00a19c' }, hp: { n: 'hp', w: 700, it: 1, col: '#0096d6' }, mastercard: { mc: 1 },
    oracle: { n: 'ORACLE', w: 700, col: '#c74634' }, visa: { n: 'VISA', w: 900, it: 1, col: '#1a1f71' }, cashapp: { n: 'Cash App', w: 800, col: '#00d64f' },
    bwt: { n: 'bwt', w: 900, col: '#ff5aa5' }, tgr: { n: 'GR', w: 900, it: 1, col: '#eb0a1e' }, revolut: { n: 'Revolut', w: 700, col: '#ffffff' },
    atlassian: { n: 'ATLASSIAN', w: 700, col: '#0052cc' }, aramco: { n: 'aramco', w: 700, col: '#00a3e0' }, microsoft: { n: 'Microsoft', w: 600, col: '#ffffff' },
    ford: { oval: 1 }, redbull: { bull: 1 }, shell: { n: 'Shell', w: 800, col: '#ffd500' }, okx: { n: 'OKX', w: 900, col: '#000000' },
    allwyn: { n: 'ALLWYN', w: 800, col: '#ffffff' }, honda: { n: 'HONDA', w: 900, col: '#ffffff' }, haasautomation: { n: 'HAAS', w: 900, col: '#e6002b' },
    barclays: { n: 'BARCLAYS', w: 700, col: '#00aeef' }, msccruises: { n: 'MSC', w: 900, col: '#ffffff' }, cadillac: { n: 'CADILLAC', w: 600, col: '#ffffff', ls: 0.3 },
    audi: { rings: 1 }, mercedesbenz: { star: 1 }, haas: { n: 'HAAS', w: 900, it: 1, col: '#e6002b' }, tgremblem: { n: 'GR', w: 900, it: 1, col: '#eb0a1e' }, tommyhilfiger: { n: 'TOMMY HILFIGER', w: 700, col: '#ffffff' },
  };
  function toneCol(tone, def) { if (!tone || tone === 'color') return def; if (tone === 'white') return '#ffffff'; if (tone === 'black') return '#111214'; if (tone.indexOf('mono:') === 0) return tone.slice(5); return def; }
  function partner(g, id, w, h, tone) {
    const A = EI.Ads; const sid = slug(id); const f0 = FALLBACK[sid];
    // f1-BRAND's artwork (aspect kept); it draws a wordmark itself for unknown ids, except where a drawn emblem below reads better
    if (A && A.drawPartner && (!(f0 && !f0.n) || (A.hasPartner && A.hasPartner(id)))) { A.drawPartner(g, id, 0, 0, w * MM, h * MM, { tone: tone || 'color' }); return; }
    id = sid; const f = f0 || { n: id.toUpperCase(), w: 800, col: '#ffffff' };
    if (f.mc) { const r = Math.min(h * 0.5, w * 0.31) * MM; g.globalAlpha = 1; g.fillStyle = tone === 'white' || tone === 'black' ? toneCol(tone) : '#eb001b'; g.beginPath(); g.arc(-r * 0.62, 0, r, 0, 7); g.fill(); g.fillStyle = tone === 'white' || tone === 'black' ? toneCol(tone) : '#f79e1b'; g.beginPath(); g.arc(r * 0.62, 0, r, 0, 7); g.fill(); if (!tone || tone === 'color') { g.fillStyle = '#ff5f00'; g.beginPath(); g.arc(-r * 0.62, 0, r, -1.02, 1.02); g.arc(r * 0.62, 0, r, Math.PI - 1.02, Math.PI + 1.02); g.fill(); } return; }
    if (f.rings) { rings(g, Math.min(w, h * 3.2), toneCol(tone, '#ffffff')); return; }
    if (f.star) { star(g, Math.min(w, h) * 0.5, toneCol(tone, '#c9ccd1')); return; }
    if (f.oval) { const rx = Math.min(w * 0.5, h * 0.95) * MM, ry = rx * 0.38; g.fillStyle = '#133a7c'; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, 7); g.fill(); g.strokeStyle = '#ffffff'; g.lineWidth = ry * 0.12; g.stroke(); styledText(g, 'Ford', ry * 1.15 / MM, '#ffffff', { w: 700, it: 1, ff: 'Georgia, serif' }); return; }
    if (f.bull) { bullMark(g, Math.min(w, h * 1.8)); return; }
    // fit the wordmark inside w x h
    g.save(); g.font = (f.it ? 'italic ' : '') + f.w + ' 100px "Titillium Web", Arial, sans-serif'; const tw = g.measureText(f.n).width * (1 + (f.ls || 0) * 0.5) / 100;
    const cap = Math.min(h * 0.82, w * 0.95 / Math.max(0.1, tw)); styledText(g, f.n, cap, toneCol(tone, f.col), { w: f.w, it: f.it, ls: f.ls }); g.restore();
  }
  // ---------------------------------------------------------------- team emblems (procedural, simplified)
  function rings(g, w, col) {   // Audi four rings, w = overall width (m)
    const r = w / (2 + 3 * 1.38) * MM, step = r * 1.38; g.strokeStyle = col; g.lineWidth = r * 0.2;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc((i - 1.5) * step, 0, r, 0, 7); g.stroke(); }
  }
  function star(g, R, col, ring) {   // three-pointed star in a ring, R = radius (m)
    R *= MM; g.fillStyle = col; g.strokeStyle = col;
    if (ring !== false) { g.lineWidth = R * 0.09; g.beginPath(); g.arc(0, 0, R, 0, 7); g.stroke(); }
    for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 3; const c = Math.cos(a), s = Math.sin(a), ca = Math.cos(a + Math.PI / 2), sa = Math.sin(a + Math.PI / 2); const w = R * 0.15;
      g.beginPath(); g.moveTo(c * R * 0.93, s * R * 0.93); g.lineTo(ca * w, sa * w); g.lineTo(-ca * w, -sa * w); g.closePath(); g.fill(); }
  }
  function bullMark(g, w) {   // sun disc + two charging bulls, w = overall width (m)
    w *= MM; const r = w * 0.2; g.fillStyle = '#ffc906'; g.beginPath(); g.arc(0, -r * 0.1, r, 0, 7); g.fill();
    for (const s of [-1, 1]) {
      g.save(); g.scale(s, 1); g.fillStyle = '#db0a40'; g.beginPath();
      g.moveTo(w * 0.04, r * 0.1); g.lineTo(w * 0.16, -r * 0.55); g.lineTo(w * 0.24, -r * 0.62); g.lineTo(w * 0.42, -r * 0.5); g.lineTo(w * 0.5, -r * 0.1);
      g.lineTo(w * 0.47, r * 0.55); g.lineTo(w * 0.38, r * 0.3); g.lineTo(w * 0.3, r * 0.62); g.lineTo(w * 0.24, r * 0.3); g.lineTo(w * 0.14, r * 0.55); g.lineTo(w * 0.12, r * 0.2); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(w * 0.08, -r * 0.05); g.lineTo(w * 0.0, -r * 0.42); g.lineTo(w * 0.13, -r * 0.3); g.fill(); g.restore();
    }
  }
  function shield(g, h, col, stripes) {   // Ferrari-style shield: yellow field, tricolore top, prancing silhouette simplified as "SF"
    h *= MM; const w = h * 0.72; g.fillStyle = col; g.beginPath(); g.moveTo(-w / 2, -h / 2); g.lineTo(w / 2, -h / 2); g.lineTo(w / 2, h * 0.12); g.quadraticCurveTo(w / 2, h * 0.38, 0, h / 2); g.quadraticCurveTo(-w / 2, h * 0.38, -w / 2, h * 0.12); g.closePath(); g.fill();
    if (stripes) { const sh = h * 0.1; ['#009246', '#ffffff', '#ce2b37'].forEach((c, i) => { g.fillStyle = c; g.fillRect(-w / 2 + i * w / 3, -h / 2, w / 3, sh); }); }
    g.fillStyle = '#111111'; g.font = '900 ' + (h * 0.42).toFixed(1) + 'px "Titillium Web", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SF', 0, h * 0.12);
  }
  function alpineA(g, h, col) { h *= MM; const w = h * 0.95; g.fillStyle = col; g.beginPath(); g.moveTo(-w / 2, h / 2); g.lineTo(0, -h / 2); g.lineTo(w / 2, h / 2); g.lineTo(w * 0.28, h / 2); g.lineTo(0, -h * 0.02); g.lineTo(-w * 0.12, h * 0.25); g.lineTo(w * 0.08, h * 0.25); g.lineTo(w * 0.0, h * 0.42); g.lineTo(-w * 0.2, h * 0.42); g.lineTo(-w * 0.28, h / 2); g.closePath(); g.fill(); }
  function speedmark(g, w, col) { w *= MM; g.fillStyle = col; g.beginPath(); g.moveTo(-w / 2, w * 0.12); g.quadraticCurveTo(-w * 0.05, -w * 0.32, w / 2, -w * 0.18); g.quadraticCurveTo(w * 0.05, -w * 0.12, -w * 0.28, w * 0.12); g.closePath(); g.fill(); }
  function williamsW(g, h, col) { h *= MM; g.strokeStyle = col; g.lineWidth = h * 0.14; g.lineJoin = 'miter'; g.beginPath(); g.moveTo(-h * 0.7, -h * 0.45); g.lineTo(-h * 0.35, h * 0.45); g.lineTo(0, -h * 0.2); g.lineTo(h * 0.35, h * 0.45); g.lineTo(h * 0.7, -h * 0.45); g.stroke(); }
  function cadCrest(g, h, col) { h *= MM; const w = h * 0.8; g.strokeStyle = col; g.lineWidth = h * 0.07; g.beginPath(); g.moveTo(-w / 2, -h / 2); g.lineTo(w / 2, -h / 2); g.lineTo(w * 0.42, h * 0.1); g.lineTo(0, h / 2); g.lineTo(-w * 0.42, h * 0.1); g.closePath(); g.stroke();
    g.fillStyle = col; for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2 === 0) g.fillRect(-w * 0.36 + i * w * 0.24, -h * 0.4 + j * h * 0.25, w * 0.24, h * 0.25); }
  const EMBLEM = { rings, star, bullMark, shield, alpineA, speedmark, williamsW, cadCrest };

  // ---------------------------------------------------------------- slots: where partner logos sit on this car model
  // side slots (x, y centre; w, h box; metres); top slots (x, z centre; w along z, h along x; rot = text along the car)
  const SIDE = {
    sp: [-0.2, 0.43, 0.82, 0.17], spLow: [-0.15, 0.27, 0.62, 0.075], spFront: [0.72, 0.47, 0.38, 0.1], ec: [-0.62, 0.885, 0.95, 0.11],
    ecRear: [-1.5, 0.52, 0.5, 0.16], noseSide: [2.0, 0.39, 0.55, 0.075], cockpit: [1.3, 0.62, 0.36, 0.06], airbox: [-0.12, 0.93, 0.28, 0.07],
    rwEnd: [-2.13, 0.84, 0.36, 0.13], rwEndLow: [-2.13, 0.6, 0.36, 0.1], fwEnd: [2.68, 0.18, 0.36, 0.1], floor: [0.6, 0.155, 0.6, 0.04],
  };
  const TOP = { noseTop: [1.62, 0, 0.17, 0.22], rwTop: [-2.1, 0, 0.9, 0.12], spTop: [0.35, 0.4, 0.42, 0.13, 1], ecTop: [-0.9, 0, 0.2, 0.5, 1], fwTop: [2.75, 0.62, 0.42, 0.1] };

  // ---------------------------------------------------------------- per-team designs
  // L (side): { g, k, s, P, S, A, num, code, team, partner(id, slot, tone), emblem(name, x, y, ...args), number(x, y, cap, col),
  //             codeText(x, y, cap, col) }
  // L (top):  { g, t: { at, rect, poly }, partner(id, slot, tone), number(x, z, cap, col), emblem(name, x, z, ...args) }
  const W = '#ffffff';
  const D = {};
  // Mercedes-AMG Petronas F1 Team, W17: silver front / black rear split by a downward Petronas-teal flow line, AMG diamond panels
  D.mercedes = {   // W17: black car, silver nose spine and cockpit shoulders, a Petronas-teal flow line down the side
    parts: { body: '#0e0f11', fwFlap: '#0e0f11', fwEnd: '#0e0f11', fwTip: '#00a19c', rwMain: '#0e0f11', rwEnd: '#0e0f11', rwFlap: '#0e0f11', halo: '#0e0f11', mirror: '#0e0f11', fin: '#0e0f11' },
    num: { ff: '"Titillium Web", Arial, sans-serif', w: 700, ls: 0.02 },
    side(L) {
      const { k, g } = L; const SIL = '#c5c9ce', TEAL = '#00a19c';
      // silver shoulder over the cockpit side / airbox, fading into the black towards the rear
      const gr = g.createLinearGradient(k.X(1.2), 0, k.X(-1.3), 0); gr.addColorStop(0, SIL); gr.addColorStop(0.55, '#8d9298'); gr.addColorStop(1, 'rgba(14,15,17,0)');
      k.region([[1.6, 0.56], [0.9, 0.64], [0.2, 0.7], [-0.6, 0.74], [-1.4, 0.66]], [[-1.4, TOP_V], [1.6, TOP_V]], gr);
      g.save(); g.globalAlpha = 0.5; for (let i = 0; i < 7; i++) for (let j = 0; j < 3; j++) { const x = 0.05 - i * 0.13 - (j % 2) * 0.065, y = 0.76 + j * 0.055; k.poly([[x, y + 0.025], [x + 0.05, y], [x, y - 0.025], [x - 0.05, y]], '#0e0f11'); } g.restore();   // AMG diamonds
      const FLOW = [[3.05, 0.2], [2.2, 0.31], [1.4, 0.4], [0.7, 0.47], [0.0, 0.46], [-0.7, 0.38], [-1.5, 0.3]];
      k.stroke(FLOW, 0.032, TEAL); k.stroke(FLOW.map(([x, y]) => [x, y + 0.035]), 0.008, SIL);
      L.emblem('star', -1.05, 0.55, 0.075, SIL);
      L.partner('petronas', 'sp', 'white'); L.partner('microsoft', 'airbox', 'black'); L.partner('ineos', 'spLow', 'white');
      L.partner('crowdstrike', 'rwEnd', 'white'); L.partner('microsoft', 'fwEnd', 'white'); L.partner('teamviewer', 'noseSide', 'white');
      L.number(1.05, 0.56, 0.08, '#0e0f11'); L.codeText(1.3, 0.69, 0.045, '#0e0f11');
      L.number(-2.13, 0.62, 0.11, W);
    },
    top(L) {
      const { t, g } = L; const SIL = '#c5c9ce';
      t.poly([[3.05, -0.05], [3.05, 0.05], [1.0, 0.12], [0.3, 0.2], [-0.4, 0.14], [-0.4, -0.14], [0.3, -0.2], [1.0, -0.12]], SIL);   // nose spine + cockpit shoulders
      for (const s of [-1, 1]) t.poly([[3.0, s * 0.055], [3.0, s * 0.07], [1.0, s * 0.14], [1.0, s * 0.125]], '#00a19c');
      L.emblem('star', 2.6, 0, 0.045, '#0e0f11');
      L.number(2.2, 0, 0.09, '#0e0f11'); L.partner('petronas', 'rwTop', 'white'); L.partner('petronas', 'spTop', 'white');
    },
  };

  // Scuderia Ferrari HP, SF-26: bright gloss red, big white airbox / engine-cover spine, blue HP on the white, black floor edge
  D.ferrari = {   // SF-26: bright gloss red, white panels around the cockpit and over the engine cover, black lower floor edge
    parts: { body: '#e10a17', fwFlap: '#e10a17', fwEnd: '#e10a17', fwTip: '#ffffff', rwMain: '#e10a17', rwEnd: '#e10a17', rwFlap: '#16171a', halo: '#16171a', mirror: '#e10a17', fin: '#e10a17' },
    num: { ff: '"Titillium Web", Arial, sans-serif', w: 900, it: 1, sx: 0.92 },
    side(L) {
      const { k } = L;
      k.region([[1.05, 1.3], [1.0, 0.72], [0.4, 0.74], [-0.3, 0.76], [-0.9, 0.72], [-1.4, 0.64], [-2.0, 0.56]], [[-2.6, 0.56], [-2.6, TOP_V], [1.05, TOP_V]], W);
      k.stroke([[1.0, 0.7], [0.4, 0.72], [-0.3, 0.74], [-0.9, 0.7], [-1.4, 0.62]], 0.012, '#16171a');
      k.region([[3.2, 0.14], [1.0, 0.16], [-0.6, 0.18], [-2.0, 0.22]], [[-2.4, LOW_V], [3.2, LOW_V]], '#16171a');
      L.partner('hp', 'ec', 'color'); L.partner('hp', 'sp', 'white'); L.partner('shell', 'ecRear', 'color'); L.partner('unicredit', 'noseSide', 'white');
      L.partner('ibm', 'spLow', 'white'); L.partner('hp', 'fwEnd', 'white'); L.partner('shell', 'rwEnd', 'color');
      L.emblem('shield', 0.62, 0.6, 0.1, '#fff200', true);
      L.number(1.25, 0.5, 0.085, W); L.codeText(1.3, 0.62, 0.045, W); L.number(-2.13, 0.62, 0.11, W);
    },
    top(L) {
      const { t } = L;
      for (const s of [-1, 1]) t.poly([[1.0, s * 0.1], [1.0, s * 0.3], [0.2, s * 0.55], [-0.6, s * 0.4], [-1.3, s * 0.14], [-1.3, s * 0.06], [0.2, s * 0.12]], W);
      t.poly([[0.25, -0.08], [0.25, 0.08], [-1.4, 0.06], [-1.4, -0.06]], W);
      t.rect(-3.2, -1.5, -1.2, 1.2, '#16171a');
      L.emblem('shield', 2.5, 0, 0.11, '#fff200', true); L.number(2.12, 0, 0.13, W);
      L.partner('hp', 'rwTop', 'white'); L.partner('hp', 'ecTop', 'color');
    },
  };

  // McLaren Mastercard F1 Team, MCL40: papaya top, anthracite lower body / undercut / rear, dark green airbox and mirrors
  D.mclaren = {
    parts: { body: '#ff8000', fwFlap: '#ff8000', fwEnd: '#2b2d31', fwTip: '#ff8000', rwMain: '#2b2d31', rwEnd: '#ff8000', rwFlap: '#2b2d31', halo: '#2b2d31', mirror: '#0f3d2e', fin: '#2b2d31' },
    num: { ff: '"Plus Jakarta Sans", "Titillium Web", Arial, sans-serif', w: 800, ls: -0.02 },
    side(L) {
      const { k } = L; const AN = '#2b2d31';
      const LINE = [[3.2, 0.2], [2.2, 0.27], [1.2, 0.31], [0.3, 0.3], [-0.5, 0.36], [-1.2, 0.5], [-1.9, 0.7], [-2.4, 0.9]];
      k.region(LINE, [[-2.6, LOW_V], [3.2, LOW_V]], AN);
      k.stroke(LINE.map(([x, y]) => [x, y + 0.012]), 0.008, '#47c7fc');
      k.poly([[0.02, 1.2], [0.02, 0.84], [-0.34, 0.84], [-0.4, 1.2]], '#0f3d2e');   // Allwyn airbox
      L.emblem('speedmark', 2.15, 0.45, 0.26, AN);
      L.partner('mastercard', 'sp', 'color'); L.partner('okx', 'spLow', 'white'); L.partner('allwyn', 'airbox', 'white'); L.partner('gemini', 'ec', 'black');
      L.partner('etihad', 'rwEnd', 'black'); L.partner('dell', 'cockpit', 'black'); L.partner('deloitte', 'fwEnd', 'white');
      L.number(1.0, 0.48, 0.09, AN); L.codeText(1.3, 0.62, 0.05, AN); L.number(-2.13, 0.62, 0.11, AN);
    },
    top(L) {
      const { t } = L; t.rect(-3.2, -1.25, -1.2, 1.2, '#2b2d31'); t.rect(-0.36, 0.02, -0.09, 0.09, '#0f3d2e');
      L.number(2.15, 0, 0.13, '#2b2d31'); L.partner('mastercard', 'noseTop', 'color'); L.partner('etihad', 'rwTop', 'white'); L.partner('mastercard', 'spTop', 'black');
    },
  };
  // Oracle Red Bull Racing, RB22: gloss navy with a woven sheen, black lower body, heritage white panel behind the bull
  D.redbull = {   // RB22: gloss dark Red Bull blue with a woven sheen, black lower body, red nose tip, the sun-and-bull big on the cover
    parts: { body: '#1b2554', fwFlap: '#1b2554', fwEnd: '#db0a40', fwTip: '#db0a40', rwMain: '#1b2554', rwEnd: '#1b2554', rwFlap: '#0b0c12', halo: '#0b0c12', mirror: '#1b2554', fin: '#0b0c12' },
    num: { ff: '"Titillium Web", Arial, sans-serif', w: 900, it: 1, sx: 0.84, skew: 0.12 },
    side(L) {
      const { k, g } = L;
      g.save(); g.globalAlpha = 0.08; for (let x = -2.6; x < 3.2; x += 0.05) k.stroke([[x, -0.1], [x + 0.6, 1.3]], 0.012, '#9fb4ff'); g.restore();   // jacquard sheen
      const LINE = [[3.2, 0.19], [2.0, 0.24], [1.0, 0.27], [0.0, 0.28], [-0.9, 0.36], [-1.6, 0.5], [-2.3, 0.7]];
      k.region(LINE, [[-2.6, LOW_V], [3.2, LOW_V]], '#0b0c12'); k.stroke(LINE.map(([x, y]) => [x, y + 0.012]), 0.014, '#db0a40');
      k.poly([[3.2, 0.1], [3.2, 0.4], [2.75, 0.4], [2.6, 0.1]], '#db0a40');
      L.partnerAt('redbull', -0.95, 0.62, 0.62, 0.3, 'color');
      L.partner('oracle', 'sp', 'white'); L.partner('ford', 'spFront', 'color'); L.partner('mobil1', 'spLow', 'white');
      L.partner('oracle', 'rwEnd', 'white'); L.partner('att', 'noseSide', 'white'); L.partner('tagheuer', 'cockpit', 'white'); L.partner('hardrock', 'fwEnd', 'white');
      L.number(1.25, 0.5, 0.085, W); L.codeText(1.3, 0.62, 0.045, W); L.number(-2.13, 0.62, 0.11, W);
    },
    top(L) {
      const { t } = L; t.rect(2.62, 3.2, -1, 1, '#db0a40'); L.partnerTop('redbull', -0.95, 0, 0.36, 0.2, 'color');
      L.partnerTop('redbull', 2.35, 0, 0.2, 0.12, 'color'); L.number(1.98, 0, 0.11, W); L.partner('oracle', 'rwTop', 'white'); L.partner('oracle', 'spTop', 'white');
    },
  };

  // Visa Cash App Racing Bulls, VCARB 03: white car, deep blue sweep along the flank and over the rear, red pinline
  D.racingbulls = {   // VCARB 03: white car, deep blue band along the nose and cockpit sides sweeping up over the engine cover
    parts: { body: '#f4f6fa', fwFlap: '#1634cc', fwEnd: '#1634cc', fwTip: '#e10600', rwMain: '#1634cc', rwEnd: '#1634cc', rwFlap: '#f4f6fa', halo: '#16171a', mirror: '#f4f6fa', fin: '#1634cc' },
    num: { ff: '"Unbounded", "Titillium Web", Arial, sans-serif', w: 800, sx: 0.8 },
    side(L) {
      const { k } = L; const B = '#1634cc';
      const UP = [[3.2, 0.33], [2.2, 0.44], [1.2, 0.56], [0.4, 0.66], [-0.4, 0.82], [-1.0, 1.0], [-1.4, 1.2]];
      const LO = [[3.2, 0.22], [2.2, 0.3], [1.2, 0.36], [0.4, 0.4], [-0.4, 0.48], [-1.2, 0.6], [-2.0, 0.75]];
      k.curve(UP.concat(LO.slice().reverse())); L.g.fillStyle = B; L.g.fill();
      k.region(UP, [[-2.6, TOP_V], [-2.6, 0.9]], B);
      k.stroke(LO.map(([x, y]) => [x, y - 0.012]), 0.012, '#e10600');
      k.region([[3.2, 0.13], [1.0, 0.15], [0, 0.16]], [[0, LOW_V], [3.2, LOW_V]], '#16171a');
      L.partner('visa', 'sp', 'color'); L.partner('cashapp', 'spFront', 'color'); L.partner('visa', 'ec', 'white'); L.partner('mobil1', 'spLow', 'color');
      L.partner('visa', 'rwEnd', 'white'); L.partner('cashapp', 'fwEnd', 'white'); L.partnerAt('redbull', -1.45, 0.5, 0.42, 0.2, 'color');
      L.number(1.3, 0.48, 0.07, W); L.codeText(1.3, 0.62, 0.045, W); L.number(-2.13, 0.62, 0.11, W);
    },
    top(L) {
      const { t } = L; t.rect(-3.2, -1.3, -1.2, 1.2, '#1634cc');
      for (const s of [-1, 1]) t.poly([[3.0, s * 0.05], [1.0, s * 0.12], [0.2, s * 0.2], [-1.3, s * 0.12], [-1.3, s * 0.18], [0.2, s * 0.27], [1.0, s * 0.17], [3.0, s * 0.08]], '#1634cc');
      L.partnerTop('redbull', -0.75, 0, 0.3, 0.18, 'color'); L.partnerTop('redbull', 2.4, 0, 0.16, 0.1, 'color');
      L.number(2.05, 0, 0.1, '#1634cc'); L.partner('visa', 'rwTop', 'white'); L.partner('cashapp', 'spTop', 'color');
    },
  };

  // BWT Alpine F1 Team, A526: gloss Alpine blue body, pink BWT blocks on the sidepod tops and endplates, navy lower body and rear
  D.alpine = {   // A526: gloss Alpine blue front, BWT pink over the sidepods and engine cover, navy floor edge
    parts: { body: '#0a63c4', fwFlap: '#0a5fc0', fwEnd: '#0a5fc0', fwTip: '#ff5fa8', rwMain: '#ff5fa8', rwEnd: '#0a5fc0', rwFlap: '#0a5fc0', halo: '#0b1630', mirror: '#ff5fa8', fin: '#0b1630' },
    num: { ff: '"Titillium Web", Arial, sans-serif', w: 700, it: 1, ls: 0.02 },
    side(L) {
      const { k, g } = L; const NV = '#0b1630', PK = '#ff5fa8';
      const gr = g.createLinearGradient(k.X(0.95), 0, k.X(0.35), 0); gr.addColorStop(0, 'rgba(255,95,168,0)'); gr.addColorStop(1, PK);
      k.poly([[0.95, TOP_V], [0.95, LOW_V], [-2.6, LOW_V], [-2.6, TOP_V]], gr);
      k.region([[3.2, 0.16], [1.0, 0.18], [-0.6, 0.2], [-2.0, 0.24]], [[-2.4, LOW_V], [3.2, LOW_V]], NV);
      L.emblem('alpineA', 2.1, 0.43, 0.08, W); L.emblem('alpineA', -1.05, 0.66, 0.13, W);
      L.partner('bwt', 'sp', 'white'); L.partner('msccruises', 'ec', 'white'); L.partner('mercadolibre', 'spFront', 'color'); L.partner('eni', 'spLow', 'white');
      L.partner('bwt', 'rwEnd', 'white'); L.partner('bwt', 'fwEnd', 'white');
      L.number(1.3, 0.48, 0.075, W); L.codeText(1.3, 0.62, 0.045, W); L.number(-2.13, 0.62, 0.11, W);
    },
    top(L) {
      const { t, g } = L; t.poly([[0.6, -1.2], [0.6, 1.2], [-3.2, 1.2], [-3.2, -1.2]], '#ff5fa8');
      L.emblem('alpineA', 2.45, 0, 0.1, W); L.number(2.12, 0, 0.12, W); L.partner('bwt', 'spTop', 'white'); L.partner('bwt', 'rwTop', 'white'); L.partner('msccruises', 'ecTop', 'white');
    },
  };

  // TGR Haas F1 Team, VF-26: white upper body, big black lower / rear, red slash, giant GR on the airbox / fin
  D.haas = {   // VF-26: white car, black lower body and rear, red nose / front wing, the giant GR on the engine cover
    parts: { body: '#ffffff', fwFlap: '#e6002b', fwEnd: '#16181c', fwTip: '#ffffff', rwMain: '#16181c', rwEnd: '#ffffff', rwFlap: '#e6002b', halo: '#16181c', mirror: '#ffffff', fin: '#16181c' },
    num: { ff: '"Titillium Web", Arial, sans-serif', w: 900, sx: 0.86 },
    side(L) {
      const { k } = L; const BK = '#16181c', RD = '#e6002b';
      const LINE = [[3.2, 0.24], [2.2, 0.3], [1.2, 0.36], [0.4, 0.42], [-0.4, 0.46], [-1.1, 0.56], [-1.7, 0.74], [-2.2, 0.92]];
      k.region(LINE, [[-2.6, LOW_V], [3.2, LOW_V]], BK);
      k.poly([[3.2, 0.1], [3.2, 0.42], [2.55, 0.42], [2.4, 0.1]], RD);
      k.stroke(LINE.map(([x, y]) => [x, y + 0.02]), 0.016, RD);
      L.partnerAt('tgr-emblem', -0.85, 0.72, 0.62, 0.3, 'color'); L.partnerAt('haas', 0.05, 0.53, 0.8, 0.14, 'black');
      L.partner('moneygram', 'spLow', 'white'); L.partner('tgr', 'rwEnd', 'black'); L.partner('haas', 'fwEnd', 'white'); L.partner('tgr', 'noseSide', 'white');
      L.number(1.3, 0.5, 0.08, BK); L.codeText(1.3, 0.62, 0.045, BK); L.number(-2.13, 0.62, 0.11, BK);
    },
    top(L) {
      const { t } = L; t.rect(-3.2, -1.2, -1.2, 1.2, '#16181c'); t.rect(2.62, 3.2, -1.2, 1.2, '#e6002b');
      L.number(2.15, 0, 0.12, '#16181c'); L.partnerTop('tgr-emblem', -0.7, 0, 0.28, 0.4, 'color', -Math.PI / 2); L.partner('haas', 'rwTop', 'white'); L.partner('haas', 'spTop', 'black');
    },
  };

  // Audi Revolut F1 Team, R26: titanium front and sides, geometric Audi-red block on the flanks, carbon-black rear with the rings
  D.audi = {   // R26: titanium silver front and sides, a big Audi-red block on the flanks / engine cover, carbon-black tail
    parts: { body: '#c8ced4', fwFlap: '#151515', fwEnd: '#151515', fwTip: '#c8ced4', rwMain: '#151515', rwEnd: '#151515', rwFlap: '#f50537', halo: '#151515', mirror: '#c8ced4', fin: '#151515' },
    num: { ff: '"Instrument Sans", "Titillium Web", Arial, sans-serif', w: 600, ls: 0.04 },
    side(L) {
      const { k } = L; const BK = '#151515', RD = '#f03c14';
      k.poly([[0.35, 0.92], [0.55, 0.2], [-1.25, 0.2], [-1.25, 0.82], [-0.3, 1.02]], RD);              // Audi red block, geometric cut
      k.poly([[-1.25, TOP_V], [-1.25, LOW_V], [-2.6, LOW_V], [-2.6, TOP_V]], BK);                    // carbon-black tail
      k.region([[3.2, 0.14], [1.4, 0.16], [0.55, 0.2]], [[0.55, LOW_V], [3.2, LOW_V]], BK);
      L.partner('audi', 'ecRear', 'white');
      L.partner('revolut', 'sp', 'white'); L.partner('revolut', 'ec', 'white'); L.partner('bp', 'noseSide', 'color'); L.partner('castrol', 'spLow', 'white');
      L.partner('visitqatar', 'rwEnd', 'white'); L.partner('revolut', 'fwEnd', 'white'); L.partner('nexo', 'cockpit', 'black');
      L.number(1.3, 0.5, 0.08, BK); L.codeText(1.3, 0.62, 0.045, BK); L.number(-2.13, 0.62, 0.11, W);
    },
    top(L) {
      const { t } = L; t.poly([[0.5, -0.14], [0.5, 0.14], [-1.25, 0.14], [-1.25, -0.14]], '#f03c14');
      for (const s of [-1, 1]) t.poly([[0.45, s * 0.42], [0.45, s * 0.62], [-1.25, s * 0.62], [-1.25, s * 0.3]], '#f03c14');
      t.rect(-3.2, -1.25, -1.2, 1.2, '#151515');
      L.partnerTop('audi', 2.25, 0, 0.17, 0.08, 'mono:#f03c14'); L.partnerTop('audi', -0.6, 0, 0.24, 0.1, 'white', -Math.PI / 2);
      L.number(1.92, 0, 0.1, '#151515'); L.partner('revolut', 'rwTop', 'white'); L.partner('revolut', 'spTop', 'white');
    },
  };

  // Atlassian Williams F1 Team, FW48: gloss blue, navy sweep from the chassis side through the rear with a white / red keyline,
  // light-blue partner panel, white blocks on the wings
  D.williams = {
    parts: { body: '#1a5bd8', fwFlap: '#ffffff', fwEnd: '#0a1433', fwTip: '#1a5bd8', rwMain: '#0a1433', rwEnd: '#1a5bd8', rwFlap: '#ffffff', halo: '#0a1433', mirror: '#1a5bd8', fin: '#0a1433' },
    num: { ff: '"Unbounded", "Titillium Web", Arial, sans-serif', w: 700, sx: 0.88 },
    side(L) {
      const { k } = L; const NV = '#0a1433';
      const LINE = [[3.2, 0.15], [1.7, 0.2], [0.9, 0.28], [0.2, 0.45], [-0.4, 0.68], [-0.9, 0.95], [-1.3, 1.3]];
      k.region(LINE, [[-2.6, TOP_V], [-2.6, LOW_V], [3.2, LOW_V]], NV);
      k.stroke(LINE.map(([x, y]) => [x + 0.02, y + 0.03]), 0.016, W); k.stroke(LINE.map(([x, y]) => [x + 0.035, y + 0.055]), 0.01, '#e4002b');
      k.poly([[0.55, 0.5], [0.45, 0.33], [-0.75, 0.36], [-0.65, 0.53]], '#00aeef');   // light-blue partner panel on the sidepod
      L.emblem('williamsW', 1.95, 0.45, 0.07, W);
      L.partnerAt('barclays', -0.1, 0.435, 0.95, 0.1, 'white'); L.partner('atlassian', 'ec', 'white'); L.partner('duracell', 'airbox', 'white'); L.partner('komatsu', 'ecRear', 'white');
      L.partner('kraken', 'rwEnd', 'white'); L.partner('gulf', 'fwEnd', 'color'); L.partner('claude', 'noseSide', 'white'); L.partner('bny', 'spLow', 'white');
      L.number(1.05, 0.5, 0.085, W); L.codeText(1.3, 0.63, 0.05, W); L.number(-2.13, 0.62, 0.11, W);
    },
    top(L) {
      const { t } = L; t.poly([[-0.1, -1.2], [-0.1, 1.2], [-3.2, 1.2], [-3.2, -1.2]], '#0a1433'); t.rect(-0.1, -0.04, -1.2, 1.2, W); t.rect(-0.04, 0.0, -1.2, 1.2, '#e4002b');
      L.emblem('williamsW', 2.45, 0, 0.06, W); L.number(2.12, 0, 0.12, W); L.partner('atlassian', 'rwTop', 'white'); L.partner('atlassian', 'spTop', 'white');
    },
  };
  // Aston Martin Aramco F1 Team, AMR26: satin British racing green, lime pinlines, black airbox, light-blue rear-wing element
  D.astonmartin = {
    parts: { body: '#005a4e', fwFlap: '#00665a', fwEnd: '#00665a', fwTip: '#cedc00', rwMain: '#00665a', rwEnd: '#00665a', rwFlap: '#6cc4e8', halo: '#0d1a17', mirror: '#00665a', fin: '#0d1a17' },
    num: { ff: '"Titillium Web", Arial, sans-serif', w: 600, ls: 0.06 },
    side(L) {
      const { k } = L; const LM = '#cedc00';
      k.region([[3.2, 0.14], [1.0, 0.16], [-0.6, 0.18], [-2.0, 0.22]], [[-2.4, LOW_V], [3.2, LOW_V]], '#0d1a17');
      k.stroke([[3.1, 0.17], [1.0, 0.19], [-0.6, 0.21], [-1.9, 0.25]], 0.018, LM);
      k.stroke([[1.05, 0.64], [0.98, 0.42], [1.0, 0.25]], 0.02, LM);   // sidepod inlet edge
      k.poly([[0.02, 1.2], [0.02, 0.83], [-0.36, 0.83], [-0.42, 1.2]], '#111111');
      L.wordmark('ASTON MARTIN', 2.05, 0.42, 0.04, W, { w: 600, ls: 0.35 });
      L.partner('aramco', 'sp', 'white'); L.partner('honda', 'ec', 'white'); L.partner('maaden', 'spLow', 'white'); L.partner('cognizant', 'cockpit', 'white');
      L.partner('aramco', 'rwEnd', 'white'); L.partner('glenfiddich', 'fwEnd', 'white'); L.partner('coreweave', 'ecRear', 'white');
      L.number(1.05, 0.5, 0.085, W); L.codeText(1.3, 0.63, 0.05, LM); L.number(-2.13, 0.62, 0.11, LM);
    },
    top(L) {
      const { t } = L; t.rect(-0.38, 0.02, -0.09, 0.09, '#111111'); for (const s of [-1, 1]) t.poly([[3.0, s * 0.05], [3.0, s * 0.065], [1.0, s * 0.135], [1.0, s * 0.12]], '#cedc00');
      L.wordmark('ASTON MARTIN', 2.45, 0, 0.035, W, { w: 600, ls: 0.25 }); L.number(2.1, 0, 0.12, W);
      L.partner('aramco', 'rwTop', 'white'); L.partner('aramco', 'spTop', 'white'); L.partner('honda', 'noseTop', 'white');
    },
  };
  // Cadillac Formula 1 Team, MAC-26 (since round 8): white upper body / nose / sidepods over black, wide-spaced wordmark, crest
  D.cadillac = {
    parts: { body: '#f2f2f2', fwFlap: '#0b0b0b', fwEnd: '#0b0b0b', fwTip: '#f2f2f2', rwMain: '#0b0b0b', rwEnd: '#0b0b0b', rwFlap: '#0b0b0b', halo: '#0b0b0b', mirror: '#f2f2f2', fin: '#0b0b0b' },
    num: { ff: '"Titillium Web", Arial, sans-serif', w: 700, ls: 0.12 },
    side(L) {
      const { k } = L; const BK = '#0b0b0b';
      const LINE = [[3.2, 0.3], [2.0, 0.38], [1.0, 0.45], [0.0, 0.47], [-1.0, 0.5], [-1.8, 0.58], [-2.4, 0.68]];
      k.region(LINE, [[-2.6, LOW_V], [3.2, LOW_V]], BK); k.stroke(LINE.map(([x, y]) => [x, y + 0.01]), 0.006, '#b8975a');
      k.poly([[-1.3, 1.2], [-1.3, 0.45], [-2.6, 0.45], [-2.6, 1.2]], BK);
      L.wordmark('CADILLAC', -0.3, 0.36, 0.065, W, { w: 700, ls: 0.45 });
      L.emblem('cadCrest', -0.95, 0.88, 0.09, BK);
      L.partner('twgai', 'sp', 'black'); L.partner('tommyhilfiger', 'ec', 'black'); L.partner('jimbeam', 'ecRear', 'white'); L.partner('ifs', 'fwEnd', 'white');
      L.partner('claro', 'rwEnd', 'white'); L.partner('coreScientific', 'cockpit', 'black');
      L.number(1.05, 0.52, 0.085, BK); L.codeText(1.3, 0.64, 0.05, BK); L.number(-2.13, 0.62, 0.11, W);
    },
    top(L) {
      const { t } = L; t.rect(-3.2, -1.3, -1.2, 1.2, '#0b0b0b');
      L.emblem('cadCrest', 2.42, 0, 0.1, '#0b0b0b'); L.number(2.12, 0, 0.12, '#0b0b0b'); L.wordmark('CADILLAC', -0.6, 0, 0.05, '#0b0b0b', { w: 600, ls: 0.3 }, true);
      L.partner('tommyhilfiger', 'rwTop', 'white'); L.partner('twgai', 'spTop', 'black');
    },
  };

  // ---------------------------------------------------------------- the painter API used by carglb.js
  // part keys (colour roles of the model's painted parts) and their defaults from the team colours
  const PART_KEYS = ['body', 'fwFlap', 'fwEnd', 'fwTip', 'rwMain', 'rwEnd', 'rwFlap', 'halo', 'mirror', 'fin'];
  function partColours(team) {
    const d = D[team.id]; const p = (d && d.parts) || {};
    const def = { body: team.primary, fwFlap: team.secondary, fwEnd: team.primary, fwTip: team.primary, rwMain: team.primary, rwEnd: team.secondary, rwFlap: team.secondary, halo: null, mirror: team.primary, fin: team.secondary };
    const out = {}; for (const key of PART_KEYS) out[key] = p[key] || def[key]; return out;
  }
  function helpersSide(g, k, team, num, code) {
    const d = D[team.id]; const st = (d && d.num) || {};
    const at = (x, y, fn) => k.at(x, y, fn);
    return {
      g, k, s: k.s, team, num, code,
      partner(id, slot, tone) { const b = SIDE[slot]; if (!b) return; at(b[0], b[1], () => partner(g, id, b[2], b[3], tone)); },
      partnerAt(id, x, y, w, h, tone) { at(x, y, () => partner(g, id, w, h, tone)); },
      emblem(name, x, y, ...args) { at(x, y, () => EMBLEM[name](g, ...args)); },
      number(x, y, cap, col) { at(x, y, () => styledText(g, String(num), cap, col, st)); },
      codeText(x, y, cap, col) { if (code) at(x, y, () => styledText(g, code, cap, col, { ff: st.ff, w: st.w, it: st.it, sx: st.sx, skew: st.skew, ls: 0.06 })); },
      wordmark(str, x, y, cap, col, o) { at(x, y, () => styledText(g, str, cap, col, o)); },
    };
  }
  function helpersTop(g, t, team, num) {
    const d = D[team.id]; const st = (d && d.num) || {};
    return {
      g, t, team, num,
      partner(id, slot, tone) { const b = TOP[slot]; if (!b) return; const n = b[1] ? 2 : 1;
        for (let i = 0; i < n; i++) { const z = b[1] * (i ? -1 : 1); t.at(b[0], z, () => partner(g, id, b[4] ? b[3] : b[2], b[4] ? b[2] : b[3], tone), b[4] ? (z < 0 ? Math.PI / 2 : -Math.PI / 2) : 0); } },
      partnerTop(id, x, z, w, h, tone, rot) { t.at(x, z, () => partner(g, id, w, h, tone), rot || 0); },
      emblem(name, x, z, ...args) { t.at(x, z, () => EMBLEM[name](g, ...args)); },
      number(x, z, cap, col) { t.at(x, z, () => styledText(g, String(num), cap, col, st), Math.PI); },   // reads from the front
      wordmark(str, x, z, cap, col, o, along) { t.at(x, z, () => styledText(g, str, cap, col, o), along ? -Math.PI / 2 : 0); },
    };
  }
  // the faces the numbers / wordmarks use must be loaded before the first livery is painted (Ads.ready() awaits Ads.FONTS)
  if (EI.Ads && Array.isArray(EI.Ads.FONTS)) ['900 24px "Titillium Web"', '700 24px "Titillium Web"', '600 24px "Titillium Web"', 'italic 900 24px "Titillium Web"', 'italic 700 24px "Titillium Web"']
    .forEach(f => { if (EI.Ads.FONTS.indexOf(f) < 0) EI.Ads.FONTS.push(f); });
  EI.LIVERIES = {
    has: (id) => !!D[id], designs: D, PART_KEYS, partColours, slug, styledText, partner, EMBLEM,
    side(g, k, team, num, code) { const d = D[team.id]; if (d) d.side(helpersSide(g, k, team, num, code)); },
    top(g, t, team, num) { const d = D[team.id]; if (d) d.top(helpersTop(g, t, team, num)); },
    numStyle: (team) => (D[team.id] && D[team.id].num) || {},
  };
})();
