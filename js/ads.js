// Equation I - trackside advertising for the two race partners: Lumi (trylumi.co, the AI tutor that draws the explanation
// while it talks) and Intake (intake.ink, the free UK degree-apprenticeship tracker with interview practice).
// Everything here paints onto 2D canvases that the track, infrastructure, venue and livery code turn into textures.
// The marks are the brands' own artwork (assets/brand: the Intake icon, the Lumi mark, and the employer logos Intake shows on its
// programme cards), preloaded by Ads.ready(); if an image cannot be loaded the painters fall back to drawing the same shapes in
// code, so every format still works. The type is set in the brands' own faces (vendored in assets/fonts) and every painter is
// resolution independent (it lays out from the box it is given), so one design serves a 5 m hoarding, a 2:1 grandstand board or a
// 16:9 big screen.
(function () {
  const EI = window.EI = window.EI || {};
  const Ads = EI.Ads = {};

  // ---------------------------------------------------------------- brand sheets
  const LUMI = Ads.LUMI = {
    name: 'lumi', url: 'trylumi.co',
    bg: '#fffaf2', ink: '#171717', plum: '#5e3a5f', plumDeep: '#2d1a3b', lilac: '#e6c8ff', mint: '#dceed1', green: '#7fcf9b',
    // the three colours of the mark itself (sampled from the logo artwork)
    markGreen: '#73cc9b', markLilac: '#d1a7f2', markPlum: '#270b41',
    sky: '#60c4ff', coral: '#ff6b5c', teal: '#08bfa9', orange: '#ffaa42', muted: '#5f5a66',
    head: '"Plus Jakarta Sans", "Titillium Web", Arial, sans-serif', body: '"Plus Jakarta Sans", "Titillium Web", Arial, sans-serif',
  };
  const INTAKE = Ads.INTAKE = {
    name: 'intake', url: 'intake.ink',
    bg: '#fff8ec', ink: '#2b211c', blue: '#5bbcff', blueDeep: '#1f6fb8', yellow: '#ffd84d', green: '#2e7d4f', pink: '#ff6fb5', muted: '#6b5c52',
    border: '#ede2cf', openBg: '#e4f6ea',
    head: '"Unbounded", "Titillium Web", Arial, sans-serif', body: '"Instrument Sans", "Titillium Web", Arial, sans-serif',
  };
  // the employers whose programme cards intake.ink shows (logos in assets/brand/employers). st: 'open' | 'soon'
  const EMPLOYERS = Ads.EMPLOYERS = [
    { id: 'goldman-sachs', name: 'Goldman Sachs', prog: 'Engineering Apprentice Programme · L6', st: 'open' },
    { id: 'kpmg', name: 'KPMG', prog: 'Apprenticeships 2027 · Tech consulting', st: 'soon' },
    { id: 'rolls-royce', name: 'Rolls-Royce', prog: 'Engineering degree apprenticeship', st: 'open' },
    { id: 'bank-of-england', name: 'Bank of England', prog: 'Economics degree apprenticeship', st: 'open' },
    { id: 'jp-morgan', name: 'J.P. Morgan', prog: 'Software engineering · L6', st: 'open' },
    { id: 'bae-systems', name: 'BAE Systems', prog: 'Engineering degree apprenticeship', st: 'open' },
    { id: 'pwc', name: 'PwC', prog: 'Technology degree apprenticeship', st: 'open' },
    { id: 'deloitte', name: 'Deloitte', prog: 'Technology degree apprenticeship', st: 'soon' },
    { id: 'lloyds-banking-group', name: 'Lloyds Banking Group', prog: 'Software engineering · L6', st: 'open' },
    { id: 'barclays', name: 'Barclays', prog: 'Technology degree apprenticeship', st: 'open' },
    { id: 'ibm', name: 'IBM', prog: 'Software engineering · L6', st: 'open' },
    { id: 'microsoft', name: 'Microsoft', prog: 'Software engineering · L6', st: 'open' },
  ];
  const EMP = {}; EMPLOYERS.forEach((e) => { EMP[e.id] = e; });

  // ---------------------------------------------------------------- brand images (preloaded by Ads.ready)
  Ads.BRAND_DIR = 'assets/brand/';
  const IMG_SRC = { lumiMark: 'lumi-mark.png', lumiLogo: 'lumi-logo.png', intakeIcon: 'intake-icon.png' };
  EMPLOYERS.forEach((e) => { IMG_SRC['emp:' + e.id] = 'employers/' + e.id + '.png'; });
  const IMG = Ads.IMG = {};   // key -> decoded HTMLImageElement (absent if it failed: the painters then use the procedural fallback)
  function loadImages() {
    // file:// pages cannot draw images into canvases that become WebGL textures (the canvas is tainted), so stay procedural there
    if (typeof location !== 'undefined' && location.protocol === 'file:') return Promise.resolve();
    const one = (key) => new Promise((res) => {
      const im = new Image(); im.decoding = 'async';
      im.onload = () => { if (im.naturalWidth > 0) IMG[key] = im; res(); }; im.onerror = () => res();
      im.src = Ads.BRAND_DIR + IMG_SRC[key];
    });
    const all = Promise.all(Object.keys(IMG_SRC).map(one));
    return Promise.race([all, new Promise((res) => setTimeout(res, 12000))]);   // never hold the game back on a slow network
  }
  Ads.img = (key) => IMG[key] || null;
  // the faces the painters need; main.js waits for these (and the brand images) before the scene is built
  Ads.FONTS = ['800 24px "Plus Jakarta Sans"', '700 24px "Plus Jakarta Sans"', '800 24px "Unbounded"', '700 24px "Unbounded"', '600 24px "Instrument Sans"'];
  let readyP = null;
  Ads.ready = function () {
    if (readyP) return readyP;
    const fonts = (!document.fonts || !document.fonts.load) ? Promise.resolve() : Promise.all(Ads.FONTS.map(f => document.fonts.load(f).catch(() => null)));
    readyP = Promise.all([fonts.catch(() => null), loadImages().catch(() => null)]).then(() => null, () => null);
    return readyP;
  };

  // image drawing with a box-filtered mip chain, so a 512 px mark stays clean when it is drawn 20 px tall on a hoarding
  const MIPS = new Map();
  function mipFor(im, px) {
    let lv = MIPS.get(im);
    if (!lv) {
      lv = [im]; let cur = im, w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
      while (h > 20 && w > 20) {
        w = Math.max(1, Math.round(w / 2)); h = Math.max(1, Math.round(h / 2));
        const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, w, h); lv.push(c); cur = c;
      }
      MIPS.set(im, lv);
    }
    let best = lv[0]; for (const l of lv) { if ((l.naturalHeight || l.height) >= px) best = l; else break; }
    return best;
  }
  function drawImg(ctx, im, x, y, w, h) {
    const t = ctx.getTransform ? ctx.getTransform() : null; const sx = t ? Math.hypot(t.a, t.b) : 1, sy = t ? Math.hypot(t.c, t.d) : 1;
    const ih = im.naturalHeight || im.height, iw = im.naturalWidth || im.width;
    const src = mipFor(im, Math.max(h * sy, w * sx * ih / iw) * 1.05);
    const se = ctx.imageSmoothingEnabled, sq = ctx.imageSmoothingQuality; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, x, y, w, h); ctx.imageSmoothingEnabled = se; ctx.imageSmoothingQuality = sq;
  }
  Ads.drawImg = drawImg;
  // canvas letter spacing where the browser supports it (the brands set their wordmarks and headlines tight)
  const HAS_LS = typeof CanvasRenderingContext2D !== 'undefined' && 'letterSpacing' in CanvasRenderingContext2D.prototype;
  function setLS(ctx, px) { if (HAS_LS) ctx.letterSpacing = (Math.abs(px) < 0.005 ? 0 : px).toFixed(2) + 'px'; }
  Ads.setLS = setLS;

  // ---------------------------------------------------------------- logos
  // Lumi mark: green quarter disc over a lilac quarter disc (right angles at the bottom right) and a dark plum dot. (x, y) is the
  // top-left corner of a square of side s; the mark fills its height. The image is the vector trace of the logo on trylumi.co.
  // rev: the reversed mark for dark grounds (the plum dot turns cream so it does not vanish)
  Ads.lumiMark = function (ctx, x, y, s, mono, rev) {
    if (!mono && IMG.lumiMark) {
      drawImg(ctx, IMG.lumiMark, x, y, s, s);
      if (rev) { ctx.fillStyle = LUMI.bg; ctx.beginPath(); ctx.arc(x + 0.7621 * s, y + 0.5665 * s, 0.158 * s, 0, Math.PI * 2); ctx.fill(); }
      return;
    }
    const q = (cx, cy, rx, ry, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x + cx * s, y + cy * s); ctx.lineTo(x + (cx - rx) * s, y + cy * s); ctx.ellipse(x + cx * s, y + cy * s, rx * s, ry * s, 0, Math.PI, Math.PI * 1.5); ctx.closePath(); ctx.fill(); };
    q(0.5847, 0.4859, 0.5, 0.4718, mono || LUMI.markGreen);
    q(0.6048, 0.9859, 0.5202, 0.4919, mono || LUMI.markLilac);
    ctx.fillStyle = mono || (rev ? LUMI.bg : LUMI.markPlum); ctx.beginPath(); ctx.arc(x + 0.7621 * s, y + 0.5665 * s, 0.1532 * s, 0, Math.PI * 2); ctx.fill();
  };
  // Intake mark: the sky-blue rounded square with the cocoa "i" (the site's icon). (x, y) top-left, side s.
  // rev: the reversed icon for sky-blue grounds (cocoa square, sky-blue "i"), same geometry as the site's icon.svg
  Ads.intakeMark = function (ctx, x, y, s, mono, rev) {
    if (!mono && !rev && IMG.intakeIcon) { drawImg(ctx, IMG.intakeIcon, x, y, s, s); return; }
    ctx.fillStyle = mono ? 'rgba(0,0,0,0)' : rev ? INTAKE.ink : INTAKE.blue; rr(ctx, x, y, s, s, s * 0.219); if (!mono) ctx.fill();
    if (mono) { ctx.strokeStyle = mono; ctx.lineWidth = s * 0.07; ctx.stroke(); }
    ctx.fillStyle = mono || (rev ? INTAKE.blue : INTAKE.ink);
    ctx.beginPath(); ctx.arc(x + s * 0.5, y + s * 0.293, s * 0.086, 0, Math.PI * 2); ctx.fill();
    rr(ctx, x + s * 0.418, y + s * 0.434, s * 0.164, s * 0.348, s * 0.066); ctx.fill();
  };
  // full lock-ups (mark + wordmark) with the proportions of the sites' headers; h is the mark height, returns the total width.
  // `col` overrides the wordmark colour.
  const LK = { lumi: { tx: 1.58, fs: 1.03, base: 0.92, ls: -0.05, wt: 700 }, intake: { tx: 1.335, fs: 0.808, base: 0.817, ls: -0.04, wt: 700 } };
  function wordFont(ctx, brand, h) { const k = LK[brand], fs = h * k.fs; ctx.font = k.wt + ' ' + fs.toFixed(1) + 'px ' + (brand === 'lumi' ? LUMI.head : INTAKE.head); setLS(ctx, k.ls * fs); }
  function wordW(ctx, brand, h) { wordFont(ctx, brand, h); const w = ctx.measureText(brand).width + (HAS_LS ? LK[brand].ls * h * LK[brand].fs : 0); setLS(ctx, 0); return w; }
  Ads.lumiLogoW = function (ctx, h) { return h * LK.lumi.tx + wordW(ctx, 'lumi', h); };
  Ads.intakeLogoW = function (ctx, h) { return h * LK.intake.tx + wordW(ctx, 'intake', h); };
  // the reversed marks are picked automatically: Lumi's on a light wordmark colour (dark ground), Intake's when `rev` is passed
  const isLight = (c) => { if (!c || c[0] !== '#' || c.length < 7) return false; const v = parseInt(c.slice(1, 7), 16); return (0.2126 * (v >> 16) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255 > 0.7; };
  function lockup(ctx, brand, x, y, h, col, mono, rev) {
    if (brand === 'lumi') Ads.lumiMark(ctx, x, y, h, mono, rev != null ? rev : isLight(col)); else Ads.intakeMark(ctx, x, y, h, mono, rev);
    const k = LK[brand]; const w = h * k.tx + wordW(ctx, brand, h);
    wordFont(ctx, brand, h); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = mono || col || (brand === 'lumi' ? LUMI.plum : INTAKE.ink); ctx.fillText(brand, x + h * k.tx, y + h * k.base); setLS(ctx, 0);
    return w;
  }
  Ads.lumiLogo = function (ctx, x, y, h, col, mono, rev) { return lockup(ctx, 'lumi', x, y, h, col, mono, rev); };
  Ads.intakeLogo = function (ctx, x, y, h, col, mono, rev) { return lockup(ctx, 'intake', x, y, h, col, mono, rev); };
  // a lock-up centred on (cx, cy), fitted to maxW: used by the car decals. Returns the width drawn.
  Ads.lockupCentered = function (ctx, brand, cx, cy, h, maxW, col, rev) {
    let w = brand === 'lumi' ? Ads.lumiLogoW(ctx, h) : Ads.intakeLogoW(ctx, h); if (maxW && w > maxW) { h *= maxW / w; w = maxW; }
    lockup(ctx, brand, cx - w / 2, cy - h / 2, h, col, null, rev); return w;
  };

  // employer logo, contain-fitted in (x, y, w, h) with optical sizing (wide wordmarks and square badges carry the same visual
  // weight). align: 'left' | 'center' | 'right' relative to x (centre/right anchor x). Returns the width drawn.
  Ads.employerLogo = function (ctx, id, x, y, w, h, align, fill) {
    const im = IMG['emp:' + id]; const e = EMP[id] || { name: id };
    if (!im) {   // fallback: the firm's name set in the Intake face
      ctx.font = '600 ' + (h * 0.5).toFixed(1) + 'px ' + INTAKE.body; let tw = ctx.measureText(e.name).width; let fs = h * 0.5; if (tw > w) { fs *= w / tw; ctx.font = '600 ' + fs.toFixed(1) + 'px ' + INTAKE.body; tw = w; }
      const x0 = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x; ctx.fillStyle = INTAKE.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(e.name, x0, y + h / 2); return tw;
    }
    const a = im.naturalWidth / im.naturalHeight; const ww = align === 'center' ? w : w;
    let lh = Math.min(h, ww / a, Math.sqrt(ww * h * (fill || 0.42) / a)); const lw = lh * a;
    const x0 = align === 'center' ? x - lw / 2 : align === 'right' ? x - lw : x;
    drawImg(ctx, im, x0, y + (h - lh) / 2, lw, lh); return lw;
  };

  // ---------------------------------------------------------------- type helpers
  function rr(ctx, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); } }
  Ads.rr = rr;
  // one line of rich text: parts = [[text, colour], ...]; fitted into maxW by shrinking the size. Returns the size used.
  // trk = letter spacing in em (the display faces default to the brands' tight headline setting)
  function line(ctx, parts, x, y, size, font, weight, maxW, align, trk) {
    if (trk == null) trk = (font === LUMI.head || font === INTAKE.head) && weight >= 800 ? -0.03 : 0;
    const setF = (s) => { ctx.font = weight + ' ' + s.toFixed(1) + 'px ' + font; setLS(ctx, trk * s); };
    setF(size); let w = parts.reduce((a, p) => a + ctx.measureText(p[0]).width, 0);
    if (maxW && w > maxW) { size *= maxW / w; setF(size); w = parts.reduce((a, p) => a + ctx.measureText(p[0]).width, 0); }
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    for (const p of parts) { ctx.fillStyle = p[1]; ctx.fillText(p[0], cx, y); cx += ctx.measureText(p[0]).width; }
    setLS(ctx, 0);
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
  function tag(ctx, x, y, h, text, bg, dot, fg, align, maxW) {
    ctx.font = '600 ' + (h * 0.52).toFixed(1) + 'px ' + INTAKE.body; let w = ctx.measureText(text).width + h * 1.35;
    if (maxW && w > maxW) { const k = maxW / w; y += h * (1 - k) / 2; h *= k; ctx.font = '600 ' + (h * 0.52).toFixed(1) + 'px ' + INTAKE.body; w = ctx.measureText(text).width + h * 1.35; }
    const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    ctx.fillStyle = bg; rr(ctx, x0, y, w, h, h * 0.5); ctx.fill();
    ctx.fillStyle = dot; ctx.beginPath(); ctx.arc(x0 + h * 0.5, y + h * 0.5, h * 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, x0 + h * 0.85, y + h * 0.54);
    return w;
  }
  Ads.tag = tag;
  const statusTag = (ctx, st, x, y, h, align, maxW) => st === 'soon' ? tag(ctx, x, y, h, 'Closes soon', INTAKE.yellow, '#9a6a00', INTAKE.ink, align, maxW) : tag(ctx, x, y, h, 'Open', INTAKE.openBg, INTAKE.green, INTAKE.green, align, maxW);
  // a programme chip: white card with the firm's logo and its status tag under it (the logo row of the Intake formats)
  function chip(ctx, id, x, y, w, h, o) {
    o = o || {}; const e = EMP[id] || { st: 'open' };
    ctx.fillStyle = o.bg || '#ffffff'; rr(ctx, x, y, w, h, Math.min(w, h) * 0.14); ctx.fill();
    if (o.stroke !== false) { ctx.strokeStyle = 'rgba(43,33,28,0.16)'; ctx.lineWidth = Math.max(1, h * 0.018); ctx.stroke(); }
    const padX = w * 0.1, padY = h * 0.11, tagH = o.tag === false ? 0 : Math.min(h * 0.22, w * 0.2);
    const lh = h - padY * 2 - (tagH ? tagH + h * 0.05 : 0);
    Ads.employerLogo(ctx, id, x + w / 2, y + padY, w - padX * 2, lh, 'center', o.fill || 0.5);
    if (tagH) statusTag(ctx, e.st, x + w / 2, y + h - padY - tagH, tagH, 'center', w - padX);
  }
  Ads.chip = chip;
  // a row of n programme chips filling (x, y, w, h); `ids` defaults to the first n employers
  function chipRow(ctx, x, y, w, h, n, o) {
    o = o || {}; const ids = (o.ids || EMPLOYERS.map(e => e.id)).slice(o.from || 0).concat(EMPLOYERS.map(e => e.id)).slice(0, n);
    const gap = o.gap != null ? o.gap : h * 0.12; const cw = (w - gap * (n - 1)) / n;
    ids.forEach((id, i) => chip(ctx, id, x + i * (cw + gap), y, cw, h, o));
  }
  Ads.chipRow = chipRow;
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
  Ads.haze = haze;
  // dotted paper (Intake's background grid)
  function dots(ctx, x, y, w, h, col, step) { ctx.fillStyle = col; for (let yy = y + step / 2; yy < y + h; yy += step) for (let xx = x + step / 2; xx < x + w; xx += step) { ctx.beginPath(); ctx.arc(xx, yy, step * 0.05, 0, Math.PI * 2); ctx.fill(); } }
  Ads.dots = dots;

  // ---------------------------------------------------------------- tile painters (hoardings, grandstand boards, gantry panels, concrete wall covers)
  // each paints into (0, 0, w, h) on a clipped context. Every board in the game is about 5 m x 1 m, so the painters lay out in a
  // 5:1 frame and paintTile squeezes that into whatever pixel box the atlas gives it (4:1 for hoardings, 2:1 for the stand boards).
  // Designs read at distance: the logo and URL on the top row, one big headline underneath.
  function lumiFrame(ctx, w, h, bg, hz) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); if (hz) { haze(ctx, w * 0.12, 0, w * 0.5, h, hz[0]); haze(ctx, w * 0.92, h, w * 0.5, h, hz[1]); } }
  function intakeFrame(ctx, w, h, bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); if (bg === INTAKE.bg) dots(ctx, 0, 0, w, h, 'rgba(43,33,28,0.10)', h * 0.16); }
  // shared two-row layout: o = { logo: 'lumi' | 'intake' | 'lumiMark' | 'intakeMark', logoCol, head: parts, headFont, sub: [text, col] (replaces the URL pill), pill: [text, bg, fg, font, weight] }
  function rows(ctx, w, h, o) {
    const m = h * 0.1, top = h * 0.1, lh = h * 0.26;
    if (o.logo === 'lumi') Ads.lumiLogo(ctx, m, top, lh, o.logoCol); else if (o.logo === 'intake') Ads.intakeLogo(ctx, m, top, lh, o.logoCol, null, o.rev);
    else if (o.logo === 'lumiMark') Ads.lumiMark(ctx, m, top, lh); else Ads.intakeMark(ctx, m, top, lh);
    if (o.pill) pill(ctx, w - m, top - h * 0.02, lh + h * 0.04, o.pill[0], o.pill[1], o.pill[2], o.pill[3], o.pill[4], 'right');
    else if (o.sub) line(ctx, [o.sub], w - m, top + lh * 0.8, lh * 0.62, o.sub[2] || LUMI.body, o.sub[3] || 700, w * 0.55, 'right');
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
    // 5 Intake blue: get paid to get a degree
    { brand: INTAKE, paint(ctx, w, h) { intakeFrame(ctx, w, h, INTAKE.blue);
      rows(ctx, w, h, { logo: 'intake', rev: true, head: [['Get paid to get a degree.', INTAKE.ink]], headFont: INTAKE.head, pill: ['intake.ink', INTAKE.ink, INTAKE.blue, INTAKE.body, 600] }); } },
    // 6 Intake cream: the programmes that are open right now, as a row of real programme chips
    { brand: INTAKE, paint(ctx, w, h) { intakeFrame(ctx, w, h, INTAKE.bg);
      const m = h * 0.1; Ads.intakeMark(ctx, m, m, h * 0.8);
      const tx = m + h * 0.98; line(ctx, [['Open', INTAKE.ink]], tx, h * 0.47, h * 0.3, INTAKE.head, 800, h * 1.1, 'left'); line(ctx, [['now.', INTAKE.blueDeep]], tx, h * 0.84, h * 0.3, INTAKE.head, 800, h * 1.1, 'left');
      const x0 = tx + h * 1.05; chipRow(ctx, x0, m, w - x0 - m, h - m * 2, 4, { gap: h * 0.1, tag: false, fill: 0.55 }); } },
    // 7 Intake dark: application windows
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
      const lw = Ads.lumiLogo(ctx, h * 0.2, h * 0.22, h * 0.5);
      line(ctx, [['Learn anything. ', LUMI.ink], ['Actually understand it.', LUMI.ink]], w * 0.53, h * 0.66, h * 0.42, LUMI.head, 800, w - lw - h * 3.4, 'center');
      line(ctx, [['trylumi.co', LUMI.plum]], w - h * 0.2, h * 0.64, h * 0.3, LUMI.body, 700, 0, 'right');
    } else if (which === 'lumi2') {
      lumiFrame(ctx, w, h, LUMI.plum); haze(ctx, w * 0.3, 0, w * 0.5, h * 2, 'rgba(230,200,255,0.25)');
      Ads.lumiMark(ctx, h * 0.16, h * 0.2, h * 0.6);
      const pw = pill(ctx, w - h * 0.2, h * 0.25, h * 0.5, 'trylumi.co', LUMI.bg, LUMI.plum, LUMI.body, 700, 'right');
      line(ctx, [['Brake late. Revise early. ', LUMI.lilac], ['Ask Lumi.', '#ffffff']], (h * 0.9 + w - pw - h * 0.4) / 2, h * 0.66, h * 0.42, LUMI.head, 800, w - pw - h * 1.5, 'center');
    } else if (which === 'intake') {
      intakeFrame(ctx, w, h, INTAKE.bg);
      const lw = Ads.intakeLogo(ctx, h * 0.2, h * 0.22, h * 0.56);
      line(ctx, [['Win your degree ', INTAKE.ink], ['apprenticeship.', INTAKE.blueDeep]], w * 0.53, h * 0.68, h * 0.44, INTAKE.head, 800, w - lw - h * 3.4, 'center');
      line(ctx, [['intake.ink', INTAKE.blueDeep]], w - h * 0.2, h * 0.64, h * 0.3, INTAKE.body, 600, 0, 'right');
    } else if (which === 'intake2') {
      // the open-now strip: the icon, six programme chips, the URL
      intakeFrame(ctx, w, h, INTAKE.blue);
      Ads.intakeMark(ctx, h * 0.14, h * 0.14, h * 0.72, null, true);
      line(ctx, [['Open now', INTAKE.ink]], h * 1.06, h * 0.64, h * 0.36, INTAKE.head, 800, h * 2.4, 'left');
      const pw = pill(ctx, w - h * 0.2, h * 0.25, h * 0.5, 'intake.ink', INTAKE.ink, INTAKE.blue, INTAKE.body, 600, 'right');
      const x0 = h * 3.6; chipRow(ctx, x0, h * 0.1, w - pw - h * 0.5 - x0, h * 0.8, 6, { tag: false, gap: h * 0.14, stroke: false, fill: 0.55 });
    }
    ctx.restore();
  };
  // start gantry banner: both partners side by side
  Ads.paintBanner = function (ctx, w, h) {
    ctx.fillStyle = LUMI.bg; ctx.fillRect(0, 0, w / 2, h); ctx.fillStyle = INTAKE.bg; ctx.fillRect(w / 2, 0, w / 2, h);
    haze(ctx, w * 0.1, 0, w * 0.2, h, 'rgba(230,200,255,0.6)'); dots(ctx, w / 2, 0, w / 2, h, 'rgba(43,33,28,0.10)', h * 0.2);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(w / 2 - 2, 0, 4, h);
    let lw = Ads.lumiLogo(ctx, h * 0.2, h * 0.2, h * 0.58);
    line(ctx, [['Learn anything. Actually understand it.', LUMI.ink]], h * 0.2 + lw + h * 0.5, h * 0.7, h * 0.42, LUMI.head, 800, w / 2 - lw - h * 3.4, 'left');
    line(ctx, [['trylumi.co', LUMI.plum]], w / 2 - h * 0.3, h * 0.68, h * 0.32, LUMI.body, 700, 0, 'right');
    lw = Ads.intakeLogo(ctx, w / 2 + h * 0.2, h * 0.21, h * 0.58);
    line(ctx, [['Win your degree ', INTAKE.ink], ['apprenticeship.', INTAKE.blueDeep]], w / 2 + h * 0.2 + lw + h * 0.5, h * 0.72, h * 0.44, INTAKE.head, 800, w / 2 - lw - h * 3.4, 'left');
    line(ctx, [['intake.ink', INTAKE.blueDeep]], w - h * 0.3, h * 0.68, h * 0.32, INTAKE.body, 600, 0, 'right');
  };

  // ---------------------------------------------------------------- big screens (16:9) and the pit-garage monitors
  // an Intake programme card as on the site: status tag, firm logo in the top-right corner tile, firm, programme, footer line
  function progCard(ctx, id, x, y, cw, ch, h, foot) {
    const e = EMP[id];
    ctx.fillStyle = '#ffffff'; rr(ctx, x, y, cw, ch, h * 0.025); ctx.fill(); ctx.strokeStyle = 'rgba(43,33,28,0.12)'; ctx.lineWidth = h * 0.004; ctx.stroke();
    statusTag(ctx, e.st, x + cw * 0.06, y + ch * 0.1, ch * 0.17, 'left');
    const ls = ch * 0.42; ctx.fillStyle = '#ffffff'; rr(ctx, x + cw - cw * 0.05 - ls, y + ch * 0.08, ls, ls, ls * 0.18); ctx.fill(); ctx.strokeStyle = INTAKE.border; ctx.lineWidth = h * 0.003; ctx.stroke();
    Ads.employerLogo(ctx, id, x + cw - cw * 0.05 - ls / 2, y + ch * 0.08 + ls * 0.12, ls * 0.8, ls * 0.76, 'center', 0.62);
    line(ctx, [[e.name, INTAKE.ink]], x + cw * 0.06, y + ch * 0.6, ch * 0.15, INTAKE.body, 600, cw * 0.62, 'left');
    line(ctx, [[e.prog, INTAKE.muted]], x + cw * 0.06, y + ch * 0.77, ch * 0.105, INTAKE.body, 500, cw * 0.88, 'left');
    if (foot) line(ctx, [[foot, INTAKE.blueDeep]], x + cw * 0.06, y + ch * 0.93, ch * 0.105, INTAKE.body, 600, cw * 0.88, 'left');
  }
  Ads.progCard = progCard;
  Ads.paintScreen = function (ctx, which, w, h) {
    if (which === 'lumi') {
      lumiFrame(ctx, w, h, LUMI.bg, ['rgba(230,200,255,0.75)', 'rgba(220,238,209,0.8)']); haze(ctx, w * 0.5, h * 1.1, w * 0.3, h * 0.6, 'rgba(96,196,255,0.3)');
      Ads.lumiLogo(ctx, w * 0.06, h * 0.08, h * 0.12);
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
      Ads.intakeLogo(ctx, w * 0.05, h * 0.07, h * 0.12);
      tag(ctx, w * 0.95, h * 0.08, h * 0.09, '2027 applications are open', '#ffffff', INTAKE.green, INTAKE.ink, 'right');
      line(ctx, [['Win your degree', INTAKE.ink]], w * 0.05, h * 0.4, h * 0.17, INTAKE.head, 800, w * 0.56, 'left');
      line(ctx, [['apprenticeship.', INTAKE.blueDeep]], w * 0.05, h * 0.58, h * 0.17, INTAKE.head, 800, w * 0.56, 'left');
      line(ctx, [['The free tracker tells you the day each one opens,', INTAKE.muted]], w * 0.05, h * 0.67, h * 0.045, INTAKE.body, 600, w * 0.56, 'left');
      line(ctx, [['then helps you practise the interview.', INTAKE.muted]], w * 0.05, h * 0.725, h * 0.045, INTAKE.body, 600, w * 0.56, 'left');
      // two programme cards on the right, as on the site
      progCard(ctx, 'goldman-sachs', w * 0.65, h * 0.21, w * 0.3, h * 0.27, h, 'Want me to draft your answers?');
      progCard(ctx, 'kpmg', w * 0.65, h * 0.51, w * 0.3, h * 0.27, h, 'Tracked · Drafting');
      // the open-now strip along the bottom
      ctx.fillStyle = 'rgba(43,33,28,0.06)'; ctx.fillRect(0, h * 0.8, w, h * 0.2);
      line(ctx, [['Open now', INTAKE.ink]], w * 0.05, h * 0.9, h * 0.05, INTAKE.body, 600, w * 0.1, 'left');
      line(ctx, [['intake.ink', INTAKE.blueDeep]], w * 0.05, h * 0.955, h * 0.045, INTAKE.body, 600, w * 0.1, 'left');
      chipRow(ctx, w * 0.16, h * 0.825, w * 0.79, h * 0.15, 6, { from: 2, tag: false, gap: w * 0.012, fill: 0.5 });
    }
  };
  // the timing screen's right-hand picture slot: a compact co-branded panel
  Ads.paintTimingSlot = function (ctx, x, y, w, h) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.translate(x, y);
    lumiFrame(ctx, w, h / 2, LUMI.bg, ['rgba(230,200,255,0.6)', 'rgba(220,238,209,0.7)']);
    Ads.lumiLogo(ctx, h * 0.06, h * 0.07, h * 0.15);
    line(ctx, [['Stuck on a question? Ask Lumi.', LUMI.ink]], h * 0.06, h * 0.41, h * 0.11, LUMI.head, 800, w - h * 0.12, 'left');
    ctx.translate(0, h / 2); intakeFrame(ctx, w, h / 2, INTAKE.bg);
    Ads.intakeLogo(ctx, h * 0.06, h * 0.07, h * 0.15);
    line(ctx, [['Get paid ', INTAKE.blueDeep], ['to get a degree.', INTAKE.ink]], h * 0.06, h * 0.41, h * 0.11, INTAKE.head, 800, w - h * 0.12, 'left');
    ctx.restore();
  };

  // ---------------------------------------------------------------- white paint on the run-off (single colour)
  Ads.paintRunoff = function (ctx, k, x, y, w, h, col, aspect) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.translate(x, y); const vw = h * (aspect || 5); ctx.scale(w / vw, 1); w = vw;
    const mono = col || '#f2f1ec';
    // rows 0 / 1: full-colour lock-ups on a painted cream plate; rows 2 / 3: the URLs in plain white paint
    if (k === 0) { const lh = h * 0.56, lw = Ads.lumiLogoW(ctx, lh); ctx.fillStyle = LUMI.bg; rr(ctx, (w - lw) / 2 - h * 0.3, h * 0.06, lw + h * 0.6, h * 0.88, h * 0.2); ctx.fill(); Ads.lumiLogo(ctx, (w - lw) / 2, h * 0.21, lh); }
    else if (k === 1) { const lh = h * 0.56, lw = Ads.intakeLogoW(ctx, lh); ctx.fillStyle = INTAKE.bg; rr(ctx, (w - lw) / 2 - h * 0.3, h * 0.06, lw + h * 0.6, h * 0.88, h * 0.2); ctx.fill(); Ads.intakeLogo(ctx, (w - lw) / 2, h * 0.22, lh); }
    else if (k === 2) line(ctx, [['trylumi.co', mono]], w / 2, h * 0.78, h * 0.78, LUMI.head, 800, w * 0.96, 'center');
    else line(ctx, [['intake.ink', mono]], w / 2, h * 0.76, h * 0.7, INTAKE.head, 800, w * 0.96, 'center');
    ctx.restore();
  };

  // ---------------------------------------------------------------- barrier panels (5.12 m x 0.7 m, repeating along the wall)
  Ads.BARRIER_ASPECT = 5.12 / 0.7;
  Ads.BARRIER = [
    (ctx, w, h) => { ctx.fillStyle = LUMI.bg; ctx.fillRect(0, 0, w, h); Ads.lumiLogo(ctx, (w - Ads.lumiLogoW(ctx, h * 0.66)) / 2, h * 0.16, h * 0.66); },
    (ctx, w, h) => { ctx.fillStyle = INTAKE.blue; ctx.fillRect(0, 0, w, h); line(ctx, [['intake.ink', INTAKE.ink]], w / 2, h * 0.74, h * 0.6, INTAKE.head, 800, w * 0.92, 'center'); },
    (ctx, w, h) => { ctx.fillStyle = LUMI.plum; ctx.fillRect(0, 0, w, h); line(ctx, [['Ask Lumi.', '#ffffff']], w / 2, h * 0.76, h * 0.68, LUMI.head, 800, w * 0.92, 'center'); },
    (ctx, w, h) => { ctx.fillStyle = INTAKE.bg; ctx.fillRect(0, 0, w, h); Ads.intakeLogo(ctx, (w - Ads.intakeLogoW(ctx, h * 0.68)) / 2, h * 0.16, h * 0.68); },
    (ctx, w, h) => { ctx.fillStyle = LUMI.bg; ctx.fillRect(0, 0, w, h); line(ctx, [['trylumi.co', LUMI.plum]], w / 2, h * 0.75, h * 0.66, LUMI.head, 800, w * 0.92, 'center'); },
  ];

  // ---------------------------------------------------------------- car livery decals (carglb.js / teams.js fit these onto the body)
  // A decal is { n: text, fg, bg (optional plate colour), w: weight, ff: font family } or, with lk: 'lumi' | 'intake', the brand's
  // full lock-up (mark + wordmark; fg = wordmark colour), or with emp: id an employer logo (bg = plate colour). Slot order:
  // 0 title (engine cover, rear wing, endplates), 1 sidepod, 2 nose, 3 lower sidepod. Half the grid runs Lumi, half Intake.
  const LUMI_SET = [{ lk: 'lumi', n: 'lumi', fg: LUMI.plum, bg: LUMI.bg, w: 700, ff: LUMI.head }, { lk: 'intake', n: 'intake', fg: INTAKE.ink, bg: INTAKE.bg, w: 700, ff: INTAKE.head }, { n: 'trylumi.co', fg: '#ffffff', w: 700, ff: LUMI.body }, { n: 'intake.ink', fg: '#ffffff', w: 600, ff: INTAKE.body }];
  const INTAKE_SET = [{ lk: 'intake', n: 'intake', fg: INTAKE.ink, bg: INTAKE.bg, w: 700, ff: INTAKE.head }, { lk: 'lumi', n: 'lumi', fg: LUMI.plum, bg: LUMI.bg, w: 700, ff: LUMI.head }, { n: 'intake.ink', fg: '#ffffff', w: 600, ff: INTAKE.body }, { n: 'trylumi.co', fg: '#ffffff', w: 700, ff: LUMI.body }];
  // the two works teams carry their own brand (their full livery graphics are drawn by the livery composer)
  const LUMI_TEAM = [{ lk: 'lumi', n: 'lumi', fg: '#ffffff', w: 700, ff: LUMI.head }, { n: 'trylumi.co', fg: LUMI.plum, w: 700, ff: LUMI.body }, { n: 'Ask Lumi.', fg: '#ffffff', w: 800, ff: LUMI.head }, { n: 'Learn anything.', fg: LUMI.plum, w: 800, ff: LUMI.head }];
  const INTAKE_TEAM = [{ lk: 'intake', n: 'intake', fg: INTAKE.bg, w: 700, ff: INTAKE.head }, { n: 'intake.ink', fg: INTAKE.ink, w: 600, ff: INTAKE.body }, { n: 'intake.ink', fg: INTAKE.bg, w: 600, ff: INTAKE.body }, { n: 'Get paid to get a degree.', fg: INTAKE.ink, w: 600, ff: INTAKE.body }];
  Ads.sponsorsFor = function (k, light, id) {
    if (id === 'lumi') return LUMI_TEAM.map(s => Object.assign({}, s));
    if (id === 'intake') return INTAKE_TEAM.map(s => Object.assign({}, s));
    // on light liveries the white partner text flips to the brand inks
    const set = (k % 2 ? INTAKE_SET : LUMI_SET).map(s => Object.assign({}, s));
    if (light) for (const s of set) if (!s.bg && s.fg === '#ffffff') s.fg = s.ff === LUMI.head || s.ff === LUMI.body ? LUMI.plum : INTAKE.ink;
    return set;
  };
  // draw one decal centred on (x, y) at cap height fs, fitted into maxW; returns the width used. Used by the livery composers.
  Ads.drawDecal = function (ctx, sp, x, y, fs, maxW) {
    if (sp.lk) {
      const mh = fs * 1.25; let w = sp.lk === 'lumi' ? Ads.lumiLogoW(ctx, mh) : Ads.intakeLogoW(ctx, mh); const pad = sp.bg ? mh * 0.42 : 0;
      let s = 1; if (w + pad * 2 > maxW) s = maxW / (w + pad * 2); const h = mh * s; w *= s;
      if (sp.bg) { ctx.fillStyle = sp.bg; rr(ctx, x - w / 2 - pad * s, y - h / 2 - pad * s * 0.62, w + pad * 2 * s, h + pad * 1.24 * s, h * 0.3); ctx.fill(); }
      lockup(ctx, sp.lk, x - w / 2, y - h / 2, h, sp.fg); return w + pad * 2 * s;
    }
    if (sp.emp) {
      const h = fs * 1.5; const pad = sp.bg ? h * 0.28 : 0; const im = IMG['emp:' + sp.emp]; const a = im ? im.naturalWidth / im.naturalHeight : 3;
      let lh = Math.min(h, (maxW - pad * 2) / a, Math.sqrt(maxW * h * 0.42 / a)); const lw = lh * a;
      if (sp.bg) { ctx.fillStyle = sp.bg; rr(ctx, x - lw / 2 - pad, y - lh / 2 - pad * 0.7, lw + pad * 2, lh + pad * 1.4, Math.min(lh, lw) * 0.2 + pad * 0.5); ctx.fill(); }
      Ads.employerLogo(ctx, sp.emp, x - lw / 2, y - lh / 2, lw, lh, 'left', 1); return lw + pad * 2;
    }
    let f = fs; const font = () => (sp.it ? 'italic ' : '') + (sp.w || 800) + ' ' + f.toFixed(1) + 'px ' + (sp.ff || LUMI.head);
    ctx.font = font(); setLS(ctx, (sp.ls || -0.02) * f); let w = ctx.measureText(sp.n).width; const pad = sp.bg ? f * 0.38 : 0;
    if (w + pad * 2 > maxW) { f *= maxW / (w + pad * 2); ctx.font = font(); setLS(ctx, (sp.ls || -0.02) * f); w = ctx.measureText(sp.n).width; }
    if (sp.bg) { const p = f * 0.38; ctx.fillStyle = sp.bg; rr(ctx, x - w / 2 - p, y - f * 0.62, w + p * 2, f * 1.24, f * 0.22); ctx.fill(); }
    ctx.fillStyle = sp.fg || '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(sp.n, x, y + f * 0.04); setLS(ctx, 0);
    return w + pad * 2;
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
      // Get paid to get a degree + a 2 x 2 grid of the programme cards that are open now
      intakeFrame(ctx, w, h, INTAKE.bg);
      const gw = h * 1.32, gx = w - m - gw, tx = m, tw2 = gx - tx - m * 1.4;
      Ads.intakeLogo(ctx, m, m, h * 0.2);
      line(ctx, [['Get paid to', INTAKE.ink]], tx, h * 0.53, h * 0.2, INTAKE.head, 800, tw2, 'left');
      line(ctx, [['get a degree.', INTAKE.blueDeep]], tx, h * 0.75, h * 0.2, INTAKE.head, 800, tw2, 'left');
      line(ctx, [['Every UK degree apprenticeship, tracked free.  ', INTAKE.muted], ['intake.ink', INTAKE.blueDeep]], tx, h - m, h * 0.065, INTAKE.body, 600, tw2, 'left');
      const ch = (h - m * 2 - h * 0.05) / 2, cw = (gw - h * 0.05) / 2;
      ['goldman-sachs', 'rolls-royce', 'kpmg', 'bank-of-england'].forEach((id, i) => chip(ctx, id, gx + (i % 2) * (cw + h * 0.05), m + Math.floor(i / 2) * (ch + h * 0.05), cw, ch, { fill: 0.5 }));
    } else if (k % 4 === 2) {
      lumiFrame(ctx, w, h, LUMI.plum); haze(ctx, w * 0.85, h * 0.1, w * 0.4, h, 'rgba(230,200,255,0.3)'); haze(ctx, w * 0.1, h, w * 0.3, h, 'rgba(127,207,155,0.25)');
      Ads.lumiLogo(ctx, m, m, h * 0.24, '#ffffff');
      line(ctx, [['Win this race.', '#ffffff']], m, h * 0.62, h * 0.3, LUMI.head, 800, w - h * 1.6, 'left');
      line(ctx, [['Then your exams.', LUMI.lilac]], m, h * 0.9, h * 0.26, LUMI.head, 800, w - h * 1.6, 'left');
      pill(ctx, w - m, m, h * 0.18, 'trylumi.co', LUMI.bg, LUMI.plum, LUMI.body, 700, 'right');
      lumiDoodle(ctx, w - h * 0.95, h * 0.42, h * 0.5, LUMI.lilac);
    } else {
      // Win your degree apprenticeship + the open-now logo strip
      intakeFrame(ctx, w, h, INTAKE.blue);
      Ads.intakeLogo(ctx, m, m, h * 0.17, INTAKE.ink, null, true);
      tag(ctx, w - m, m, h * 0.14, 'Open now  ·  intake.ink', '#ffffff', INTAKE.green, INTAKE.ink, 'right');
      line(ctx, [['Win your degree', INTAKE.ink]], m, h * 0.45, h * 0.18, INTAKE.head, 800, w - m * 2, 'left');
      line(ctx, [['apprenticeship.', '#ffffff']], m, h * 0.64, h * 0.18, INTAKE.head, 800, w - m * 2, 'left');
      chipRow(ctx, m, h * 0.71, w - m * 2, h * 0.2, 6, { tag: false, gap: h * 0.05, stroke: false, fill: 0.55 });
    }
    ctx.restore();
  };
})();
