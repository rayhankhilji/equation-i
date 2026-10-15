// Equation I - trackside advertising for the two race partners: Lumi (trylumi.co, the AI tutor that draws the explanation
// while it talks) and Intake (intake.ink, the free UK degree-apprenticeship tracker with interview practice).
// Everything here paints onto 2D canvases that the track, infrastructure, venue and livery code turn into textures:
// the logos are drawn procedurally from the brands' own shapes, the type is set in their own faces (vendored in assets/fonts)
// and every painter is resolution independent (it lays out from the box it is given), so one tile design serves a 5 m hoarding,
// a 2:1 grandstand board or a 16:9 big screen.
(function () {
  const EI = window.EI = window.EI || {};
  const Ads = EI.Ads = {};

  // ---------------------------------------------------------------- brand sheets
  const LUMI = Ads.LUMI = {
    name: 'lumi', url: 'trylumi.co',
    bg: '#fffaf2', ink: '#171717', plum: '#5e3a5f', plumDeep: '#2d1a3b', lilac: '#e6c8ff', mint: '#dceed1', green: '#7fcf9b',
    sky: '#60c4ff', coral: '#ff6b5c', teal: '#08bfa9', orange: '#ffaa42', muted: '#5f5a66',
    head: '"Plus Jakarta Sans", "Titillium Web", Arial, sans-serif', body: '"Plus Jakarta Sans", "Titillium Web", Arial, sans-serif',
  };
  const INTAKE = Ads.INTAKE = {
    name: 'intake', url: 'intake.ink',
    bg: '#fff8ec', ink: '#2b211c', blue: '#5bbcff', blueDeep: '#1f7fe0', yellow: '#ffd84d', green: '#2fb46a', pink: '#ff5fa2', muted: '#6b625b',
    head: '"Unbounded", "Titillium Web", Arial, sans-serif', body: '"Instrument Sans", "Titillium Web", Arial, sans-serif',
  };
  // the faces the painters need; main.js waits for these before the scene is built so canvases never fall back to Arial
  Ads.FONTS = ['800 24px "Plus Jakarta Sans"', '700 24px "Plus Jakarta Sans"', '800 24px "Unbounded"', '600 24px "Instrument Sans"'];
  Ads.ready = function () {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all(Ads.FONTS.map(f => document.fonts.load(f).catch(() => null))).then(() => null, () => null);
  };

  // ---------------------------------------------------------------- logos
  // Lumi mark: a green quarter disc over a lilac quarter disc (both with their right angle at the bottom right), a dark plum
  // circle to the right. (x, y) is the top-left corner of a square of side s.
  Ads.lumiMark = function (ctx, x, y, s, mono) {
    const q = (cx, cy, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - r, cy); ctx.arc(cx, cy, r, Math.PI, Math.PI * 1.5); ctx.lineTo(cx, cy - r); ctx.closePath(); ctx.fill(); };
    const r = s * 0.42;
    q(x + s * 0.56, y + s * 0.46, r, mono || LUMI.green);
    q(x + s * 0.62, y + s * 0.96, r, mono || LUMI.lilac);
    ctx.fillStyle = mono || LUMI.plumDeep; ctx.beginPath(); ctx.arc(x + s * 0.80, y + s * 0.60, s * 0.2, 0, Math.PI * 2); ctx.fill();
  };
  // Intake mark: the blue rounded square with the dark "i". (x, y) top-left, side s.
  Ads.intakeMark = function (ctx, x, y, s, mono) {
    ctx.fillStyle = mono ? 'rgba(0,0,0,0)' : INTAKE.blue; rr(ctx, x, y, s, s, s * 0.22); if (!mono) ctx.fill();
    if (mono) { ctx.strokeStyle = mono; ctx.lineWidth = s * 0.07; ctx.stroke(); }
    ctx.fillStyle = mono || INTAKE.ink;
    ctx.beginPath(); ctx.arc(x + s * 0.5, y + s * 0.293, s * 0.086, 0, Math.PI * 2); ctx.fill();
    rr(ctx, x + s * 0.418, y + s * 0.434, s * 0.164, s * 0.348, s * 0.066); ctx.fill();
  };
  // full lock-ups (mark + wordmark); h is the mark height, returns the total width. `col` overrides the wordmark colour.
  Ads.lumiLogo = function (ctx, x, y, h, col, mono) {
    Ads.lumiMark(ctx, x, y, h, mono);
    ctx.font = '700 ' + (h * 0.78).toFixed(1) + 'px ' + LUMI.head; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = mono || col || LUMI.plum; ctx.fillText('lumi', x + h * 1.12, y + h * 0.76);
    return h * 1.12 + ctx.measureText('lumi').width;
  };
  Ads.lumiLogoW = function (ctx, h) { ctx.font = '700 ' + (h * 0.78).toFixed(1) + 'px ' + LUMI.head; return h * 1.12 + ctx.measureText('lumi').width; };
  Ads.intakeLogoW = function (ctx, h) { ctx.font = '800 ' + (h * 0.62).toFixed(1) + 'px ' + INTAKE.head; return h * 1.22 + ctx.measureText('intake').width; };
  Ads.intakeLogo = function (ctx, x, y, h, col, mono) {
    Ads.intakeMark(ctx, x, y, h, mono);
    ctx.font = '800 ' + (h * 0.62).toFixed(1) + 'px ' + INTAKE.head; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = mono || col || INTAKE.ink; ctx.fillText('intake', x + h * 1.22, y + h * 0.74);
    return h * 1.22 + ctx.measureText('intake').width;
  };

  // ---------------------------------------------------------------- type helpers
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); } }
  Ads.rr = rr;
  // one line of rich text: parts = [[text, colour], ...]; fitted into maxW by shrinking the size. Returns the size used.
  function line(ctx, parts, x, y, size, font, weight, maxW, align) {
    const setF = (s) => { ctx.font = weight + ' ' + s.toFixed(1) + 'px ' + font; };
    setF(size); let w = parts.reduce((a, p) => a + ctx.measureText(p[0]).width, 0);
    if (maxW && w > maxW) { size *= maxW / w; setF(size); w = parts.reduce((a, p) => a + ctx.measureText(p[0]).width, 0); }
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    for (const p of parts) { ctx.fillStyle = p[1]; ctx.fillText(p[0], cx, y); cx += ctx.measureText(p[0]).width; }
    return size;
  }
  Ads.line = line;
  // a small rounded "button" with text; returns its width
  function pill(ctx, x, y, h, text, bg, fg, font, weight, align) {
    ctx.font = weight + ' ' + (h * 0.5).toFixed(1) + 'px ' + font; const w = ctx.measureText(text).width + h * 0.9;
    const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    ctx.fillStyle = bg; rr(ctx, x0, y, w, h, h * 0.3); ctx.fill();
    ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, x0 + h * 0.45, y + h * 0.54);
    return w;
  }
  Ads.pill = pill;
  // the little status tag Intake uses on its cards ("● Open", "● Closes soon")
  function tag(ctx, x, y, h, text, bg, dot, fg, align) {
    ctx.font = '600 ' + (h * 0.52).toFixed(1) + 'px ' + INTAKE.body; const w = ctx.measureText(text).width + h * 1.35;
    const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    ctx.fillStyle = bg; rr(ctx, x0, y, w, h, h * 0.5); ctx.fill();
    ctx.fillStyle = dot; ctx.beginPath(); ctx.arc(x0 + h * 0.5, y + h * 0.5, h * 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, x0 + h * 0.85, y + h * 0.54);
    return w;
  }
  Ads.tag = tag;
  // Lumi's hand-drawn "live board" doodle: a loop with two orbits, used as a decorative element on the wide formats
  function lumiDoodle(ctx, x, y, s, col) {
    ctx.save(); ctx.strokeStyle = col || LUMI.plum; ctx.lineWidth = s * 0.045; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.ellipse(x + s * 0.5, y + s * 0.5, s * 0.46, s * 0.3, -0.5, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = LUMI.orange; ctx.beginPath(); ctx.arc(x + s * 0.5, y + s * 0.5, s * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = LUMI.sky; ctx.beginPath(); ctx.arc(x + s * 0.86, y + s * 0.24, s * 0.06, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  Ads.lumiDoodle = lumiDoodle;
  // soft radial tint in a corner (the pastel haze on the Lumi site)
  function haze(ctx, x, y, w, h, col) { const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(w, h) * 0.75); g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(x - w, y - h, w * 2, h * 2); }
  // dotted paper (Intake's background grid)
  function dots(ctx, x, y, w, h, col, step) { ctx.fillStyle = col; for (let yy = y + step / 2; yy < y + h; yy += step) for (let xx = x + step / 2; xx < x + w; xx += step) { ctx.beginPath(); ctx.arc(xx, yy, step * 0.05, 0, Math.PI * 2); ctx.fill(); } }

  // ---------------------------------------------------------------- tile painters (hoardings, grandstand boards, gantry panels, concrete wall covers)
  // each paints into (0, 0, w, h) on a clipped context. Every board in the game is about 5 m x 1 m, so the painters lay out in a
  // 5:1 frame and paintTile squeezes that into whatever pixel box the atlas gives it (4:1 for hoardings, 2:1 for the stand boards).
  // Designs read at distance: the logo and URL on the top row, one big headline underneath.
  function lumiFrame(ctx, w, h, bg, hz) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); if (hz) { haze(ctx, w * 0.12, 0, w * 0.5, h, hz[0]); haze(ctx, w * 0.92, h, w * 0.5, h, hz[1]); } }
  function intakeFrame(ctx, w, h, bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); if (bg === INTAKE.bg) dots(ctx, 0, 0, w, h, 'rgba(43,33,28,0.10)', h * 0.16); }
  // shared two-row layout: o = { logo: 'lumi' | 'intake' | 'lumiMark' | 'intakeMark', logoCol, head: parts, headFont, sub: [text, col] (replaces the URL pill), pill: [text, bg, fg, font, weight] }
  function rows(ctx, w, h, o) {
    const m = h * 0.1, top = h * 0.1, lh = h * 0.26;
    if (o.logo === 'lumi') Ads.lumiLogo(ctx, m, top, lh, o.logoCol); else if (o.logo === 'intake') Ads.intakeLogo(ctx, m, top, lh, o.logoCol);
    else if (o.logo === 'lumiMark') Ads.lumiMark(ctx, m, top, lh); else Ads.intakeMark(ctx, m, top, lh);
    if (o.pill) pill(ctx, w - m, top - h * 0.02, lh + h * 0.04, o.pill[0], o.pill[1], o.pill[2], o.pill[3], o.pill[4], 'right');
    else if (o.sub) line(ctx, [o.sub], w - m, top + lh * 0.8, lh * 0.62, o.sub[2] || LUMI.body, o.sub[3] || 700, w * 0.6, 'right');
    line(ctx, o.head, w / 2, h * 0.84, h * 0.4, o.headFont, 800, w - m * 2, 'center');
  }
  const TILES = Ads.TILES = [
    // 0 Lumi hero
    { brand: LUMI, paint(ctx, w, h) { lumiFrame(ctx, w, h, LUMI.bg, ['rgba(230,200,255,0.55)', 'rgba(220,238,209,0.6)']);
      rows(ctx, w, h, { logo: 'lumi', head: [['Learn anything. ', LUMI.ink], ['Actually understand it.', LUMI.ink]], headFont: LUMI.head, sub: ['trylumi.co', LUMI.plum] }); } },
    // 1 Lumi plum: Stuck? Ask Lumi.
    { brand: LUMI, paint(ctx, w, h) { lumiFrame(ctx, w, h, LUMI.plum); haze(ctx, w * 0.95, h * 0.1, w * 0.4, h, 'rgba(230,200,255,0.28)');
      rows(ctx, w, h, { logo: 'lumi', logoCol: '#ffffff', head: [['Stuck on a question? ', LUMI.lilac], ['Ask Lumi.', '#ffffff']], headFont: LUMI.head, pill: ['trylumi.co', LUMI.bg, LUMI.plum, LUMI.body, 700] }); } },
    // 2 Lumi mint: before the exam
    { brand: LUMI, paint(ctx, w, h) { lumiFrame(ctx, w, h, LUMI.mint); haze(ctx, w * 0.1, h, w * 0.4, h, 'rgba(255,250,242,0.7)');
      rows(ctx, w, h, { logo: 'lumi', head: [['Win this race. ', LUMI.ink], ['Then your exams.', LUMI.plum]], headFont: LUMI.head, sub: ['3 free lessons · trylumi.co', LUMI.plum] }); } },
    // 3 Lumi cream: tutor-level, not tutor-priced
    { brand: LUMI, paint(ctx, w, h) { lumiFrame(ctx, w, h, LUMI.bg, ['rgba(96,196,255,0.3)', 'rgba(255,170,66,0.35)']);
      rows(ctx, w, h, { logo: 'lumi', head: [["You can't ask the examiner. ", LUMI.ink], ['You can ask Lumi.', LUMI.plum]], headFont: LUMI.head, pill: ['trylumi.co', LUMI.plum, '#ffffff', LUMI.body, 700] }); } },
    // 4 Intake hero
    { brand: INTAKE, paint(ctx, w, h) { intakeFrame(ctx, w, h, INTAKE.bg);
      rows(ctx, w, h, { logo: 'intake', head: [['Win your degree ', INTAKE.ink], ['apprenticeship.', INTAKE.blueDeep]], headFont: INTAKE.head, sub: ['intake.ink', INTAKE.blueDeep, INTAKE.body, 600] }); } },
    // 5 Intake blue: never miss a window
    { brand: INTAKE, paint(ctx, w, h) { intakeFrame(ctx, w, h, INTAKE.blue);
      rows(ctx, w, h, { logo: 'intake', head: [['Get paid to get a degree.', INTAKE.ink]], headFont: INTAKE.head, pill: ['intake.ink', INTAKE.ink, INTAKE.blue, INTAKE.body, 600] }); } },
    // 6 Intake cream: get paid to get a degree
    { brand: INTAKE, paint(ctx, w, h) { intakeFrame(ctx, w, h, INTAKE.bg);
      rows(ctx, w, h, { logo: 'intake', head: [['Goldman. Rolls-Royce. KPMG. ', INTAKE.ink], ['Open now.', INTAKE.blueDeep]], headFont: INTAKE.head, sub: ['Every UK degree apprenticeship, tracked free · intake.ink', INTAKE.muted, INTAKE.body, 600] }); } },
    // 7 Intake dark: interviews out loud
    { brand: INTAKE, paint(ctx, w, h) { intakeFrame(ctx, w, h, INTAKE.ink);
      rows(ctx, w, h, { logo: 'intake', logoCol: '#ffffff', head: [['Applications close faster ', '#ffffff'], ['than Copse.', INTAKE.blue]], headFont: INTAKE.head, pill: ['intake.ink', INTAKE.blue, INTAKE.ink, INTAKE.body, 600] }); } },
  ];
  // paint tile k into the pixel box (x, y, w, h); `aspect` is the board's physical width / height (default 5:1)
  Ads.paintTile = function (ctx, k, x, y, w, h, aspect) { const vw = h * (aspect || 5); ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.translate(x, y); ctx.scale(w / vw, 1); TILES[k % TILES.length].paint(ctx, vw, h); ctx.restore(); };

  // ---------------------------------------------------------------- bridges and the start gantry banner (very wide formats)
  Ads.paintBridge = function (ctx, which, w, h, aspect) {
    const vw = h * (aspect || 10.4); ctx.save(); ctx.scale(w / vw, 1); w = vw;
    if (which === 'lumi') {
      lumiFrame(ctx, w, h, LUMI.bg, ['rgba(230,200,255,0.6)', 'rgba(220,238,209,0.7)']);
      const lw = Ads.lumiLogo(ctx, h * 0.16, h * 0.2, h * 0.5);
      line(ctx, [['Learn anything. ', LUMI.ink], ['Actually understand it.', LUMI.ink]], w * 0.52, h * 0.66, h * 0.42, LUMI.head, 800, w - lw - h * 3.2, 'center');
      line(ctx, [['trylumi.co', LUMI.plum]], w - h * 0.2, h * 0.64, h * 0.3, LUMI.body, 700, 0, 'right');
    } else if (which === 'lumi2') {
      lumiFrame(ctx, w, h, LUMI.plum); haze(ctx, w * 0.3, 0, w * 0.5, h * 2, 'rgba(230,200,255,0.25)');
      Ads.lumiMark(ctx, h * 0.16, h * 0.22, h * 0.5);
      const pw = pill(ctx, w - h * 0.2, h * 0.25, h * 0.5, 'trylumi.co', LUMI.bg, LUMI.plum, LUMI.body, 700, 'right');
      line(ctx, [['Brake late. Revise early. ', LUMI.lilac], ['Ask Lumi.', '#ffffff']], (h * 0.9 + w - pw - h * 0.4) / 2, h * 0.66, h * 0.42, LUMI.head, 800, w - pw - h * 1.5, 'center');
    } else if (which === 'intake') {
      intakeFrame(ctx, w, h, INTAKE.bg);
      const lw = Ads.intakeLogo(ctx, h * 0.16, h * 0.22, h * 0.5);
      line(ctx, [['Win your degree ', INTAKE.ink], ['apprenticeship.', INTAKE.blueDeep]], w * 0.52, h * 0.68, h * 0.44, INTAKE.head, 800, w - lw - h * 3.2, 'center');
      line(ctx, [['intake.ink', INTAKE.blueDeep]], w - h * 0.2, h * 0.64, h * 0.3, INTAKE.body, 600, 0, 'right');
    } else if (which === 'intake2') {
      intakeFrame(ctx, w, h, INTAKE.blue);
      Ads.intakeMark(ctx, h * 0.16, h * 0.22, h * 0.5);
      const pw = pill(ctx, w - h * 0.2, h * 0.25, h * 0.5, 'intake.ink', INTAKE.ink, INTAKE.blue, INTAKE.body, 600, 'right');
      line(ctx, [['Win this race. Then win a ', INTAKE.ink], ['degree apprenticeship.', '#ffffff']], (h * 0.9 + w - pw - h * 0.4) / 2, h * 0.68, h * 0.44, INTAKE.head, 800, w - pw - h * 1.5, 'center');
    }
    ctx.restore();
  };
  // start gantry banner: both partners side by side
  Ads.paintBanner = function (ctx, w, h) {
    ctx.fillStyle = LUMI.bg; ctx.fillRect(0, 0, w / 2, h); ctx.fillStyle = INTAKE.bg; ctx.fillRect(w / 2, 0, w / 2, h);
    haze(ctx, w * 0.1, 0, w * 0.2, h, 'rgba(230,200,255,0.6)'); dots(ctx, w / 2, 0, w / 2, h, 'rgba(43,33,28,0.10)', h * 0.2);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(w / 2 - 2, 0, 4, h);
    let lw = Ads.lumiLogo(ctx, h * 0.18, h * 0.2, h * 0.56);
    line(ctx, [['Learn anything. Actually understand it.', LUMI.ink]], h * 0.18 + lw + h * 0.5, h * 0.7, h * 0.42, LUMI.head, 800, w / 2 - lw - h * 3.4, 'left');
    line(ctx, [['trylumi.co', LUMI.plum]], w / 2 - h * 0.3, h * 0.68, h * 0.32, LUMI.body, 700, 0, 'right');
    lw = Ads.intakeLogo(ctx, w / 2 + h * 0.18, h * 0.22, h * 0.56);
    line(ctx, [['Win your degree ', INTAKE.ink], ['apprenticeship.', INTAKE.blueDeep]], w / 2 + h * 0.18 + lw + h * 0.5, h * 0.72, h * 0.44, INTAKE.head, 800, w / 2 - lw - h * 3.4, 'left');
    line(ctx, [['intake.ink', INTAKE.blueDeep]], w - h * 0.3, h * 0.68, h * 0.32, INTAKE.body, 600, 0, 'right');
  };

  // ---------------------------------------------------------------- big screens (16:9) and the pit-garage monitors
  Ads.paintScreen = function (ctx, which, w, h) {
    if (which === 'lumi') {
      lumiFrame(ctx, w, h, LUMI.bg, ['rgba(230,200,255,0.75)', 'rgba(220,238,209,0.8)']); haze(ctx, w * 0.5, h * 1.1, w * 0.3, h * 0.6, 'rgba(96,196,255,0.3)');
      Ads.lumiLogo(ctx, w * 0.06, h * 0.08, h * 0.13);
      line(ctx, [['Learn anything.', LUMI.ink]], w * 0.06, h * 0.47, h * 0.2, LUMI.head, 800, w * 0.6, 'left');
      line(ctx, [['Actually understand it.', LUMI.ink]], w * 0.06, h * 0.68, h * 0.2, LUMI.head, 800, w * 0.6, 'left');
      line(ctx, [['Stuck on a past paper? Lumi talks it through and draws it out until it clicks. 3 free lessons.', LUMI.muted]], w * 0.06, h * 0.8, h * 0.055, LUMI.body, 700, w * 0.62, 'left');
      pill(ctx, w * 0.06, h * 0.855, h * 0.1, 'Start learning free  →', LUMI.plum, '#ffffff', LUMI.body, 700, 'left');
      line(ctx, [['trylumi.co', LUMI.plum]], w * 0.94, h * 0.93, h * 0.07, LUMI.body, 700, 0, 'right');
      // the live board, top right
      ctx.fillStyle = '#ffffff'; rr(ctx, w * 0.70, h * 0.07, w * 0.25, h * 0.36, h * 0.03); ctx.fill(); ctx.strokeStyle = LUMI.ink; ctx.lineWidth = h * 0.012; ctx.stroke();
      ctx.fillStyle = LUMI.mint; rr(ctx, w * 0.72, h * 0.1, w * 0.095, h * 0.3, h * 0.02); ctx.fill(); lumiDoodle(ctx, w * 0.725, h * 0.13, h * 0.24);
      line(ctx, [['Why cars grip', LUMI.ink]], w * 0.83, h * 0.19, h * 0.05, LUMI.body, 700, w * 0.11, 'left');
      ctx.fillStyle = LUMI.sky; ctx.fillRect(w * 0.83, h * 0.215, w * 0.08, h * 0.012);
      line(ctx, [['downforce = ½ ρ v² A Cl', LUMI.muted]], w * 0.83, h * 0.3, h * 0.038, LUMI.body, 700, w * 0.11, 'left');
      pill(ctx, w * 0.83, h * 0.33, h * 0.06, 'speed² → grip', LUMI.lilac, LUMI.plum, LUMI.body, 700, 'left');
    } else if (which === 'intake') {
      intakeFrame(ctx, w, h, INTAKE.bg);
      Ads.intakeLogo(ctx, w * 0.06, h * 0.08, h * 0.13);
      tag(ctx, w * 0.94, h * 0.09, h * 0.09, '50 degree apprenticeships open right now', '#ffffff', INTAKE.green, INTAKE.ink, 'right');
      line(ctx, [['Win your degree', INTAKE.ink]], w * 0.06, h * 0.47, h * 0.2, INTAKE.head, 800, w * 0.6, 'left');
      line(ctx, [['apprenticeship.', INTAKE.blueDeep]], w * 0.06, h * 0.68, h * 0.2, INTAKE.head, 800, w * 0.6, 'left');
      line(ctx, [['Goldman Sachs, Rolls-Royce, KPMG: the free tracker tells you the day each one opens, then helps you practise the interview.', INTAKE.muted]], w * 0.06, h * 0.8, h * 0.05, INTAKE.body, 600, w * 0.6, 'left');
      pill(ctx, w * 0.06, h * 0.855, h * 0.1, "See what's open now", INTAKE.blue, INTAKE.ink, INTAKE.body, 600, 'left');
      line(ctx, [['intake.ink', INTAKE.blueDeep]], w * 0.94, h * 0.93, h * 0.07, INTAKE.body, 600, 0, 'right');
      // two programme cards on the right
      const card = (x, y, cw, ch, st, stBg, stDot, stFg, firm, prog, foot) => {
        ctx.fillStyle = '#ffffff'; rr(ctx, x, y, cw, ch, h * 0.025); ctx.fill(); ctx.strokeStyle = 'rgba(43,33,28,0.12)'; ctx.lineWidth = h * 0.004; ctx.stroke();
        tag(ctx, x + cw * 0.07, y + ch * 0.1, ch * 0.18, st, stBg, stDot, stFg, 'left');
        line(ctx, [[firm, INTAKE.ink]], x + cw * 0.07, y + ch * 0.5, ch * 0.15, INTAKE.body, 600, cw * 0.86, 'left');
        line(ctx, [[prog, INTAKE.muted]], x + cw * 0.07, y + ch * 0.68, ch * 0.11, INTAKE.body, 500, cw * 0.86, 'left');
        line(ctx, [[foot, INTAKE.blueDeep]], x + cw * 0.07, y + ch * 0.88, ch * 0.11, INTAKE.body, 600, cw * 0.86, 'left');
      };
      card(w * 0.68, h * 0.26, w * 0.27, h * 0.26, 'Open', '#e4f6ea', INTAKE.green, '#1f6b3f', 'Goldman Sachs', 'Engineering Apprentice Programme · L6', 'Want me to draft your answers?');
      card(w * 0.68, h * 0.56, w * 0.27, h * 0.26, 'Closes soon', INTAKE.yellow, '#b07a00', INTAKE.ink, 'Rolls-Royce', 'Engineering Degree Apprenticeship 2027', 'Mock interview · difficulty: Ultra');
    }
  };
  // the timing screen's right-hand picture slot: a compact co-branded panel
  Ads.paintTimingSlot = function (ctx, x, y, w, h) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.translate(x, y);
    lumiFrame(ctx, w, h / 2, LUMI.bg, ['rgba(230,200,255,0.6)', 'rgba(220,238,209,0.7)']);
    Ads.lumiLogo(ctx, h * 0.06, h * 0.07, h * 0.16);
    line(ctx, [['Stuck on a question? Ask Lumi.', LUMI.ink]], h * 0.06, h * 0.41, h * 0.11, LUMI.head, 800, w - h * 0.12, 'left');
    ctx.translate(0, h / 2); intakeFrame(ctx, w, h / 2, INTAKE.bg);
    Ads.intakeLogo(ctx, h * 0.06, h * 0.07, h * 0.16);
    line(ctx, [['Get paid ', INTAKE.blueDeep], ['to get a degree.', INTAKE.ink]], h * 0.06, h * 0.41, h * 0.11, INTAKE.head, 800, w - h * 0.12, 'left');
    ctx.restore();
  };

  // ---------------------------------------------------------------- white paint on the run-off (single colour)
  Ads.paintRunoff = function (ctx, k, x, y, w, h, col, aspect) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.translate(x, y); const vw = h * (aspect || 5); ctx.scale(w / vw, 1); w = vw;
    const mono = col || '#f2f1ec';
    // rows 0 / 1: full-colour lock-ups on a painted cream plate; rows 2 / 3: the URLs in plain white paint
    if (k === 0) { const lw = Ads.lumiLogoW(ctx, h * 0.62); ctx.fillStyle = LUMI.bg; rr(ctx, (w - lw) / 2 - h * 0.25, h * 0.06, lw + h * 0.5, h * 0.88, h * 0.2); ctx.fill(); Ads.lumiLogo(ctx, (w - lw) / 2, h * 0.19, h * 0.62); }
    else if (k === 1) { const lw = Ads.intakeLogoW(ctx, h * 0.62); ctx.fillStyle = INTAKE.bg; rr(ctx, (w - lw) / 2 - h * 0.25, h * 0.06, lw + h * 0.5, h * 0.88, h * 0.2); ctx.fill(); Ads.intakeLogo(ctx, (w - lw) / 2, h * 0.19, h * 0.62); }
    else if (k === 2) line(ctx, [['trylumi.co', mono]], w / 2, h * 0.78, h * 0.78, LUMI.head, 800, w * 0.96, 'center');
    else line(ctx, [['intake.ink', mono]], w / 2, h * 0.76, h * 0.7, INTAKE.head, 800, w * 0.96, 'center');
    ctx.restore();
  };

  // ---------------------------------------------------------------- barrier panels (5.12 m x 0.7 m, repeating along the wall)
  Ads.BARRIER_ASPECT = 5.12 / 0.7;
  Ads.BARRIER = [
    (ctx, w, h) => { ctx.fillStyle = LUMI.bg; ctx.fillRect(0, 0, w, h); Ads.lumiLogo(ctx, (w - Ads.lumiLogoW(ctx, h * 0.72)) / 2, h * 0.14, h * 0.72); },
    (ctx, w, h) => { ctx.fillStyle = INTAKE.blue; ctx.fillRect(0, 0, w, h); line(ctx, [['intake.ink', INTAKE.ink]], w / 2, h * 0.74, h * 0.6, INTAKE.head, 800, w * 0.92, 'center'); },
    (ctx, w, h) => { ctx.fillStyle = LUMI.plum; ctx.fillRect(0, 0, w, h); line(ctx, [['Ask Lumi.', '#ffffff']], w / 2, h * 0.76, h * 0.68, LUMI.head, 800, w * 0.92, 'center'); },
    (ctx, w, h) => { ctx.fillStyle = INTAKE.bg; ctx.fillRect(0, 0, w, h); Ads.intakeLogo(ctx, (w - Ads.intakeLogoW(ctx, h * 0.72)) / 2, h * 0.14, h * 0.72); },
    (ctx, w, h) => { ctx.fillStyle = LUMI.bg; ctx.fillRect(0, 0, w, h); line(ctx, [['trylumi.co', LUMI.plum]], w / 2, h * 0.75, h * 0.66, LUMI.head, 800, w * 0.92, 'center'); },
  ];

  // ---------------------------------------------------------------- car livery sponsors (text decals carglb.js / teams.js fit onto the body)
  // title sponsor first (engine cover + rear wing), then sidepod / nose / chassis partners. Half the grid runs Lumi, half Intake.
  const LUMI_SET = [{ n: 'lumi', fg: LUMI.plum, bg: LUMI.bg, w: 700, ff: LUMI.head, lc: 1 }, { n: 'intake.ink', fg: INTAKE.ink, bg: INTAKE.blue, w: 600, ff: INTAKE.body, lc: 1 }, { n: 'trylumi.co', fg: '#ffffff', w: 700, ff: LUMI.body, lc: 1 }, { n: 'Ask Lumi.', fg: '#ffffff', w: 800, ff: LUMI.head, lc: 1 }];
  const INTAKE_SET = [{ n: 'intake', fg: INTAKE.ink, bg: INTAKE.blue, w: 800, ff: INTAKE.head, lc: 1 }, { n: 'trylumi.co', fg: LUMI.plum, bg: LUMI.bg, w: 700, ff: LUMI.body, lc: 1 }, { n: 'intake.ink', fg: '#ffffff', w: 600, ff: INTAKE.body, lc: 1 }, { n: 'lumi', fg: '#ffffff', w: 700, ff: LUMI.head, lc: 1 }];
  // the two works teams carry their own brand only (mk = draw the brand mark as part of the lock-up)
  const LUMI_TEAM = [{ n: 'lumi', fg: LUMI.plum, w: 700, ff: LUMI.head, mk: 'lumi' }, { n: 'trylumi.co', fg: LUMI.plum, w: 700, ff: LUMI.body }, { n: 'Ask Lumi.', fg: '#ffffff', bg: LUMI.plum, w: 800, ff: LUMI.head }, { n: 'lumi', fg: LUMI.plum, w: 700, ff: LUMI.head }];
  const INTAKE_TEAM = [{ n: 'intake', fg: INTAKE.ink, w: 800, ff: INTAKE.head, mk: 'intake' }, { n: 'intake.ink', fg: INTAKE.ink, w: 600, ff: INTAKE.body }, { n: 'intake.ink', fg: INTAKE.bg, bg: INTAKE.ink, w: 600, ff: INTAKE.body }, { n: 'intake', fg: INTAKE.ink, w: 800, ff: INTAKE.head }];
  Ads.sponsorsFor = function (k, light, id) {
    if (id === 'lumi') return LUMI_TEAM.map(s => Object.assign({}, s));
    if (id === 'intake') return INTAKE_TEAM.map(s => Object.assign({}, s));
    // on light liveries the white partner text flips to the brand inks
    const set = (k % 2 ? INTAKE_SET : LUMI_SET).map(s => Object.assign({}, s));
    if (light) for (const s of set) if (!s.bg && s.fg === '#ffffff') s.fg = s.ff === LUMI.head || s.ff === LUMI.body ? LUMI.plum : INTAKE.ink;
    return set;
  };

  // ---------------------------------------------------------------- billboards (10 m x 3.5 m on posts behind the fences)
  // the big, mostly visual formats: the logo at full height, one line of copy, the URL
  Ads.BILLBOARD_ASPECT = 10 / 3.5;
  Ads.paintBillboard = function (ctx, k, x, y, w, h) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.translate(x, y); const vw = h * Ads.BILLBOARD_ASPECT; ctx.scale(w / vw, 1); w = vw;
    const m = h * 0.09;
    if (k % 4 === 0) {
      lumiFrame(ctx, w, h, LUMI.bg, ['rgba(230,200,255,0.8)', 'rgba(220,238,209,0.9)']); haze(ctx, w * 0.5, h * 1.2, w * 0.3, h * 0.6, 'rgba(96,196,255,0.35)');
      Ads.lumiMark(ctx, m, m, h * 0.5);
      line(ctx, [['Stuck on a question?', LUMI.ink]], m + h * 0.66, m + h * 0.3, h * 0.26, LUMI.head, 800, w - h * 1.0, 'left');
      line(ctx, [['Ask Lumi.', LUMI.plum]], m + h * 0.66, m + h * 0.58, h * 0.26, LUMI.head, 800, w - h * 1.0, 'left');
      pill(ctx, m, h - m - h * 0.16, h * 0.16, '3 free lessons  ·  no card  ·  trylumi.co', LUMI.plum, '#ffffff', LUMI.body, 700, 'left');
      lumiDoodle(ctx, w - h * 0.62, h * 0.5, h * 0.42, LUMI.plum);
    } else if (k % 4 === 1) {
      intakeFrame(ctx, w, h, INTAKE.bg);
      Ads.intakeMark(ctx, m, m, h * 0.5);
      const cw = h * 0.98, tx = m + h * 0.62, tw2 = w - tx - cw - m * 2;
      line(ctx, [['Get paid to', INTAKE.ink]], tx, m + h * 0.3, h * 0.27, INTAKE.head, 800, tw2, 'left');
      line(ctx, [['get a degree.', INTAKE.blueDeep]], tx, m + h * 0.58, h * 0.27, INTAKE.head, 800, tw2, 'left');
      line(ctx, [['Every UK degree apprenticeship, tracked free.  intake.ink', INTAKE.muted]], m, h - m - h * 0.02, h * 0.08, INTAKE.body, 600, w - cw - m * 3, 'left');
      // two programme cards at the right
      const card = (cx, cy, cw, ch, st, stBg, stDot, stFg, firm, prog) => { ctx.fillStyle = '#ffffff'; rr(ctx, cx, cy, cw, ch, h * 0.04); ctx.fill(); ctx.strokeStyle = 'rgba(43,33,28,0.14)'; ctx.lineWidth = h * 0.006; ctx.stroke(); tag(ctx, cx + cw * 0.07, cy + ch * 0.12, ch * 0.22, st, stBg, stDot, stFg, 'left'); line(ctx, [[firm, INTAKE.ink]], cx + cw * 0.07, cy + ch * 0.6, ch * 0.19, INTAKE.body, 600, cw * 0.86, 'left'); line(ctx, [[prog, INTAKE.muted]], cx + cw * 0.07, cy + ch * 0.82, ch * 0.13, INTAKE.body, 500, cw * 0.86, 'left'); };
      card(w - m - cw, m, cw, h * 0.38, 'Open', '#e4f6ea', INTAKE.green, '#1f6b3f', 'Goldman Sachs', 'Engineering Apprentice · L6');
      card(w - m - cw, m + h * 0.44, cw, h * 0.38, 'Closes soon', INTAKE.yellow, '#b07a00', INTAKE.ink, 'Rolls-Royce', 'Degree Apprenticeship 2027');
    } else if (k % 4 === 2) {
      lumiFrame(ctx, w, h, LUMI.plum); haze(ctx, w * 0.85, h * 0.1, w * 0.4, h, 'rgba(230,200,255,0.3)'); haze(ctx, w * 0.1, h, w * 0.3, h, 'rgba(127,207,155,0.25)');
      Ads.lumiLogo(ctx, m, m, h * 0.26, '#ffffff');
      line(ctx, [['Win this race.', '#ffffff']], m, h * 0.62, h * 0.3, LUMI.head, 800, w - h * 1.6, 'left');
      line(ctx, [['Then your exams.', LUMI.lilac]], m, h * 0.9, h * 0.26, LUMI.head, 800, w - h * 1.6, 'left');
      pill(ctx, w - m, m, h * 0.18, 'trylumi.co', LUMI.bg, LUMI.plum, LUMI.body, 700, 'right');
      lumiDoodle(ctx, w - h * 0.95, h * 0.42, h * 0.5, LUMI.lilac);
    } else {
      intakeFrame(ctx, w, h, INTAKE.blue);
      Ads.intakeLogo(ctx, m, m, h * 0.26);
      tag(ctx, w - m, m + h * 0.05, h * 0.15, '50 programmes open now', '#ffffff', INTAKE.green, INTAKE.ink, 'right');
      line(ctx, [['Win your degree', INTAKE.ink]], m, h * 0.62, h * 0.3, INTAKE.head, 800, w - h * 0.4, 'left');
      line(ctx, [['apprenticeship.', '#ffffff']], m, h * 0.9, h * 0.3, INTAKE.head, 800, w - h * 1.6, 'left');
      line(ctx, [['intake.ink', INTAKE.ink]], w - m, h * 0.9, h * 0.16, INTAKE.body, 600, 0, 'right');
    }
    ctx.restore();
  };
})();
