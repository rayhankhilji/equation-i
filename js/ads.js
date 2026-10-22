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
      const im = new Image(); im.crossOrigin = 'anonymous'; im.decoding = 'async';
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
    const t0 = Promise.all([loadF1Font(), loadPartners()]).then(() => (document.fonts && document.fonts.load ? document.fonts.load('800 24px "F1 Wide"').catch(() => null) : null));
    const parts = Promise.race([t0, new Promise((res) => setTimeout(res, 12000))]);
    readyP = Promise.all([fonts.catch(() => null), loadImages().catch(() => null), parts.catch(() => null)]).then(() => null, () => null);
    return readyP;
  };

  // image drawing with a box-filtered mip chain, so a 512 px mark stays clean when it is drawn 20 px tall on a hoarding. The levels
  // are CPU canvases (willReadFrequently): the livery sheets are CPU canvases too, and drawing a GPU canvas into one forces a
  // synchronous read back from the GPU - a long stall mid-race when a bot's full livery is composed
  const MIPS = new Map();
  function mipFor(im, px) {
    let lv = MIPS.get(im);
    if (!lv) {
      lv = [im]; let cur = im, w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
      while (h > 20 && w > 20) {
        w = Math.max(1, Math.round(w / 2)); h = Math.max(1, Math.round(h / 2));
        const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, w, h); lv.push(c); cur = c;
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


  // ---------------------------------------------------------------- real partner logos (F1 global partners trackside, team partners on the cars)
  // The artwork is each company's official vector logo from Wikimedia Commons (assets/brand/partners/<id>.svg, trimmed to the painted
  // bounds, see assets/brand/SOURCES.md). A partner without a clean vector is set as a wordmark in code (PARTNERS[id].word). Every
  // logo is rasterised once per tone (colour / white / black / reversed) at 256 px high and drawn through the box-filtered mip chain,
  // always contain-fitted: a logo is never stretched.
  // board: the partner's trackside board (ground colour + logo tone), as on the real F1 boards; word: the fallback wordmark style
  const W_ = (ff, w, o) => Object.assign({ ff, w }, o || {});
  const F1W = '"F1 Wide", "Titillium Web", Arial, sans-serif', TIT = '"Titillium Web", Arial, sans-serif', SANS = 'Arial, Helvetica, sans-serif';
  const PARTNERS = Ads.PARTNERS = {
    // Formula 1 and its 2026 global / official partners (trackside)
    f1: { n: 'Formula 1', board: { bg: '#262630', tone: 'color' } },
    aramco: { n: 'aramco', board: { bg: '#ffffff', tone: 'color' }, word: W_('"Plus Jakarta Sans", Arial, sans-serif', 800, { col: '#0a7dc1', ls: -0.03 }) },
    aws: { n: 'AWS', board: { bg: '#232f3e', tone: 'rev' } },
    dhl: { n: 'DHL', board: { bg: '#fecc00', tone: 'color' }, word: W_(F1W, 900, { it: 1, col: '#d40511', up: 1 }) },
    heineken: { n: 'Heineken', board: { bg: '#00843d', tone: 'whiteKeepRed' } },
    lenovo: { n: 'Lenovo', board: { bg: '#e1140a', tone: 'color' } },
    lvmh: { n: 'LVMH', board: { bg: '#222428', tone: 'white' } },
    louisvuitton: { n: 'Louis Vuitton', board: { bg: '#2b2420', tone: 'white' }, word: W_('Georgia, "Times New Roman", serif', 400, { up: 1, ls: 0.18 }) },
    tagheuer: { n: 'TAG Heuer', board: { bg: '#212328', tone: 'color' } },
    msccruises: { n: 'MSC Cruises', board: { bg: '#0b2a55', tone: 'white' } },
    pirelli: { n: 'Pirelli', board: { bg: '#212328', tone: 'color' }, word: W_(SANS, 900, { up: 1, it: 1, col: '#e30613' }) },
    qatarairways: { n: 'Qatar Airways', board: { bg: '#5c0632', tone: 'white' } },
    salesforce: { n: 'Salesforce', board: { bg: '#ffffff', tone: 'color' } },
    cryptocom: { n: 'Crypto.com', board: { bg: '#0b1c40', tone: 'white' }, word: W_(SANS, 700, { col: '#0b1c40', ls: -0.01 }) },
    santander: { n: 'Santander', board: { bg: '#ec0000', tone: 'white' } },
    americanexpress: { n: 'American Express', board: { bg: '#006fcf', tone: 'color' } },
    moetchandon: { n: 'Moët & Chandon', board: { bg: '#b8142a', tone: 'white' }, word: W_('Georgia, "Times New Roman", serif', 600, { up: 1, col: '#ffffff', ls: 0.04 }) },   // trackside red with the white serif wordmark (Spa F1 photo spa_main_straight_moet_board_cars)
    liquimoly: { n: 'Liqui Moly', board: { bg: '#ffffff', tone: 'color' } },
    globant: { n: 'Globant', board: { bg: '#ffffff', tone: 'color' } },
    etihadairways: { n: 'Etihad Airways', board: { bg: '#f6f1e7', tone: 'color' } },
    // team partners on the cars (season2026.json teams[].partners); the board entries double as their plate colours
    petronas: { n: 'PETRONAS', board: { bg: '#00a19c', tone: 'white' } }, microsoft: { n: 'Microsoft' }, crowdstrike: { n: 'CrowdStrike' }, ineos: { n: 'INEOS', word: W_(SANS, 900, { up: 1, ls: 0.04 }) },
    snapdragon: { n: 'Snapdragon', word: W_(SANS, 700, { ls: -0.01 }) }, adidas: { n: 'adidas' }, teamviewer: { n: 'TeamViewer', word: W_(SANS, 700) }, ubs: { n: 'UBS', word: W_('Georgia, serif', 700, { up: 1, ls: 0.05 }) },
    hp: { n: 'HP' }, shell: { n: 'Shell' }, unicredit: { n: 'UniCredit' }, ibm: { n: 'IBM' }, puma: { n: 'PUMA' }, cevalogistics: { n: 'CEVA Logistics' },
    philipmorrisinternational: { n: 'PMI', word: W_(SANS, 700, { up: 1 }) }, bingx: { n: 'BingX', word: W_(SANS, 800) }, whoop: { n: 'WHOOP', word: W_(F1W, 900, { up: 1, ls: 0.04 }) },
    mastercard: { n: 'Mastercard' }, okx: { n: 'OKX', word: W_(SANS, 900, { up: 1 }) }, allwyn: { n: 'Allwyn', word: W_(SANS, 800, { ls: -0.02 }) }, googlegemini: { n: 'Gemini' },
    dell: { n: 'Dell' }, dpworld: { n: 'DP World' }, deloitte: { n: 'Deloitte' }, oracle: { n: 'ORACLE' }, ford: { n: 'Ford' }, redbull: { n: 'Red Bull' }, mobil1: { n: 'Mobil 1', word: W_(SANS, 900, { col1: '#e4002b' }) },
    visa: { n: 'VISA' }, rokt: { n: 'Rokt', word: W_(SANS, 800, { ls: -0.02 }) }, hardrock: { n: 'Hard Rock' }, att: { n: 'AT&T' }, cashapp: { n: 'Cash App' },
    bwt: { n: 'BWT', board: { bg: '#ec008c', tone: 'white' } }, mercadolibre: { n: 'Mercado Libre' }, eni: { n: 'eni' }, hmosercie: { n: 'H. Moser & Cie.', word: W_('Georgia, serif', 400, { ls: 0.02 }) },
    tgr: { n: 'TOYOTA GAZOO Racing' }, haasautomation: { n: 'HAAS', word: W_(F1W, 900, { up: 1, it: 1, ls: 0.02 }) }, ic: { n: 'IC', word: W_(SANS, 900, { up: 1 }) }, mgmresorts: { n: 'MGM Resorts', word: W_('Georgia, serif', 700, { up: 1, ls: 0.08 }) },
    playngo: { n: "Play'n GO", word: W_(SANS, 900) }, singha: { n: 'SINGHA', word: W_('Georgia, serif', 700, { up: 1, ls: 0.06 }) },
    audi: { n: 'Audi' }, revolut: { n: 'Revolut' }, visitqatar: { n: 'Visit Qatar', word: W_(SANS, 700) }, bp: { n: 'bp' }, castrol: { n: 'Castrol' }, nexo: { n: 'NEXO', word: W_(F1W, 800, { up: 1, ls: 0.1 }) },
    atlassian: { n: 'Atlassian' }, barclays: { n: 'Barclays', word: W_(SANS, 700, { up: 1, ls: 0.05, col: '#00aeef' }) }, komatsu: { n: 'KOMATSU' }, claude: { n: 'Claude' }, kraken: { n: 'Kraken', word: W_(SANS, 800, { ls: -0.02 }) }, bny: { n: 'BNY', word: W_('Georgia, serif', 700, { up: 1, ls: 0.04 }) },
    gulf: { n: 'Gulf' }, duracell: { n: 'Duracell' }, maaden: { n: "Ma'aden", word: W_(SANS, 700, { up: 1, ls: 0.06 }) }, honda: { n: 'HONDA' }, coreweave: { n: 'CoreWeave' }, cognizant: { n: 'Cognizant' },
    valvoline: { n: 'Valvoline' }, glenfiddich: { n: 'Glenfiddich', word: W_('Georgia, serif', 700, { ls: 0.02 }) }, jcb: { n: 'JCB', word: W_(SANS, 900, { up: 1, it: 0 }) }, coinbase: { n: 'coinbase' },
    cadillac: { n: 'CADILLAC', word: W_(F1W, 600, { up: 1, ls: 0.32 }) }, tommyhilfiger: { n: 'TOMMY HILFIGER', word: W_(SANS, 700, { up: 1, ls: 0.06 }) }, jimbeam: { n: 'JIM BEAM', word: W_('Georgia, serif', 700, { up: 1, ls: 0.05 }) },
    ifs: { n: 'IFS', word: W_(SANS, 900, { up: 1 }) }, corescientific: { n: 'Core Scientific' }, claro: { n: 'Claro' }, tenneco: { n: 'Tenneco' }, twgai: { n: 'TWG AI', word: W_(SANS, 800, { up: 1, ls: 0.04 }) },
    mercedes: { n: 'Mercedes-Benz' }, tgremblem: { n: 'TGR', word: W_(F1W, 900, { up: 1, it: 1, col: '#eb0a1e' }) }, moneygram: { n: 'MoneyGram', word: W_(SANS, 800, { col: '#da291c', ls: -0.02 }) }, mobil: { n: 'Mobil' }, ferrari: { n: 'Ferrari' }, pepsico: { n: 'PepsiCo' }, kitkat: { n: 'KitKat' }, paramountplus: { n: 'Paramount+' }, standardchartered: { n: 'Standard Chartered' }, qualcomm: { n: 'Qualcomm' },
  };
  // Spa's venue partners (boards seen at the circuit): wordmarks set in code on the partners' board colours
  Object.assign(PARTNERS, {
    ing: { n: 'ING', board: { bg: '#ffffff', tone: 'color' }, word: W_(SANS, 900, { col: '#ff6200', ls: -0.02 }) },
    allianz: { n: 'Allianz', board: { bg: '#ffffff', tone: 'color' }, word: W_(SANS, 800, { col: '#003781', ls: -0.02 }) },
    vodafone: { n: 'vodafone', board: { bg: '#e60000', tone: 'white' }, word: W_(SANS, 700, { col: '#ffffff', ls: -0.01 }) },
    rolex: { n: 'ROLEX', board: { bg: '#006039', tone: 'white' }, word: W_('Georgia, "Times New Roman", serif', 700, { up: 1, col: '#ffffff', ls: 0.08 }) },
  });
  // Silverstone (SILVERSTONE-UPGRADE, F1 photo set staging/silverstone_refs): Fly Emirates' red wall boards and Rolex's green stand fronts (2015-16),
  // UBS on the start gantry and boards (2016), Barilla's blue boards with the red oval round Woodcote (2025-26); DHL / Pirelli / Qatar Airways are above
  Object.assign(PARTNERS, {
    flyemirates: { n: 'Fly Emirates', board: { bg: '#d71921', tone: 'white' }, word: W_('Georgia, "Times New Roman", serif', 700, { col: '#ffffff', ls: 0.01 }) },
    lasvegas: { n: 'LAS VEGAS', board: { bg: '#4b2a83', tone: 'white' }, word: W_(SANS, 900, { up: 1, col: '#ffffff', ls: 0.04 }) },   // the 2026 footbridge over the start straight (ref_037)
    barilla: { n: 'Barilla', board: { bg: '#1d3f8f', tone: 'color' }, word: W_('Georgia, "Times New Roman", serif', 700, { it: 1, col: '#ffffff', oval: '#d6202b' }) },
  });
  PARTNERS.ubs.board = { bg: '#ffffff', tone: 'color' }; PARTNERS.ubs.word = W_('Georgia, serif', 700, { up: 1, ls: 0.05, col: '#111111' });
  // COTA (COTA-UPGRADE, photo cota_mclaren_stands_flag): the event's black '#USGP' wall boards that line the stadium-section walls
  Object.assign(PARTNERS, {
    usgp: { n: '#USGP', board: { bg: '#121418', tone: 'white' }, word: W_(SANS, 900, { col: '#ffffff', ls: -0.02 }) },
  });
  // Mexico City (MEX-DRESS): the event's own hashtag board, the crimson '#MexicoGP' band that runs along the stadium walls and the stand fronts (F1 photo set, PHOTOS-A: mex_stadium_bowl_*, mex_podium_*)
  Object.assign(PARTNERS, {
    mexicogp: { n: '#MexicoGP', board: { bg: '#7a1a30', tone: 'white' }, word: W_(SANS, 900, { col: '#ffffff', ls: -0.02 }) },
    italiangp: { n: '#ItalianGP', board: { bg: '#121418', tone: 'white' }, word: W_(SANS, 900, { col: '#ffffff', ls: -0.02 }) },   // MONZA-UPGRADE: the black #ItalianGP band (F1 photos grandstand_crowd_italiangp_msc, mclaren_italiangp_banner)
  });
  // Monaco (MONACO-UPGRADE, F1 photo set staging/monaco_refs): Explora Journeys' navy boards round the pool and the harbour, the Casino's red
  // CASINO MONTE-CARLO sign boards on Casino Square, and the event's black MONACO banner boards at Mirabeau / Loews (red lettering)
  Object.assign(PARTNERS, {
    explorajourneys: { n: 'EXPLORA JOURNEYS', board: { bg: '#14284a', tone: 'white' }, word: W_('Georgia, "Times New Roman", serif', 400, { up: 1, col: '#ffffff', ls: 0.16 }) },
    casinomontecarlo: { n: 'CASINO', board: { bg: '#b3122e', tone: 'white' }, word: W_('Georgia, "Times New Roman", serif', 400, { up: 1, col: '#ffffff', ls: 0.1 }) },
    monacogp: { n: 'MONACO', board: { bg: '#121216', tone: 'color' }, word: W_(F1W, 900, { up: 1, col: '#e3242b', ls: 0.02 }) },
  });
  // id lookup by any spelling of the name ('Google (Gemini)', 'Mobil 1', 'TAG Heuer', 'MSC Cruises' ...)
  const ALIAS = { gemini: 'googlegemini', google: 'googlegemini', msc: 'msccruises', etihad: 'etihadairways', qatar: 'qatarairways', amex: 'americanexpress', moet: 'moetchandon', mobil: 'mobil1',
    toyotagazooracing: 'tgr', tgrhaas: 'tgr', haas: 'haasautomation', moser: 'hmosercie', hmoser: 'hmosercie', ceva: 'cevalogistics', pmi: 'philipmorrisinternational', lv: 'louisvuitton',
    mgm: 'mgmresorts', twg: 'twgai', formula1: 'f1', formulaone: 'f1', petronasl: 'petronas', redbullracing: 'redbull', attinc: 'att', cryptocomarena: 'cryptocom', tommy: 'tommyhilfiger', saudiaramco: 'aramco', heineken00: 'heineken' };
  const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  Ads.partnerId = function (name) { const s = slug(name); return PARTNERS[s] ? s : ALIAS[s] || s; };
  // which ids have vector artwork in assets/brand/partners (filled in with the downloaded files; anything else uses its wordmark)
  const ART = Ads.PARTNER_ART = new Set(['adidas', 'americanexpress', 'atlassian', 'att', 'audi', 'aws', 'bp', 'bwt', 'cashapp', 'castrol', 'cevalogistics', 'claro', 'claude', 'cognizant', 'coinbase', 'corescientific', 'coreweave', 'crowdstrike', 'dell', 'deloitte', 'dhl', 'dpworld', 'duracell', 'eni', 'etihadairways', 'ferrari', 'ford', 'globant', 'googlegemini', 'gulf', 'hardrock', 'heineken', 'honda', 'hp', 'ibm', 'ineos', 'kitkat', 'komatsu', 'lenovo', 'liquimoly', 'louisvuitton', 'lvmh', 'mastercard', 'mercadolibre', 'mercedes', 'microsoft', 'okx', 'oracle', 'paramountplus', 'pepsico', 'petronas', 'pirelli', 'puma', 'qatarairways', 'qualcomm', 'redbull', 'revolut', 'salesforce', 'santander', 'shell', 'standardchartered', 'tagheuer', 'tenneco', 'unicredit', 'valvoline', 'visa']);
  // LIVERY-B (racingbulls / alpine / haas / audi) partner artwork, same pipeline (see SOURCES.md)
  Object.assign(PARTNERS, { tudor: { n: 'TUDOR' }, redbullbull: { n: 'Red Bull' }, dynatrace: { n: 'dynatrace' }, ninjaone: { n: 'ninjaOne' }, etoro: { n: 'eToro' }, haasf1: { n: 'TGR Haas F1 Team' }, alpinef1: { n: 'Alpine F1 Team' }, confluent: { n: 'Confluent' }, hugo: { n: 'HUGO' } });
  ['tudor', 'redbullbull', 'dynatrace', 'ninjaone', 'mobil', 'etoro', 'haasf1', 'alpinef1', 'confluent', 'hugo'].forEach((id) => ART.add(id));
  // LIVERY-A (mercedes / ferrari / mclaren / redbull) partner artwork, same pipeline (see SOURCES.md)
  Object.assign(PARTNERS, { amd: { n: 'AMD' }, amg: { n: 'AMG' }, cisco: { n: 'Cisco' }, dxc: { n: 'DXC Technology' }, groq: { n: 'Groq' }, mclarenspeedmark: { n: 'McLaren' }, nubank: { n: 'Nu' }, okta: { n: 'Okta' }, workday: { n: 'Workday' }, indeed: { n: 'Indeed' }, siemens: { n: 'SIEMENS' }, avolta: { n: 'Avolta' }, delltechnologies: { n: 'Dell Technologies' }, dropbox: { n: 'Dropbox' }, richardmille: { n: 'RICHARD MILLE' }, shellpecten: { n: 'Shell' }, '1password': { n: '1Password' }, signify: { n: 'Signify' }, pumacat: { n: 'PUMA' }, solera: { n: 'SOLERA' } });
  ['amd', 'amg', 'cisco', 'dxc', 'groq', 'mclarenspeedmark', 'nubank', 'okta', 'snapdragon', 'teamviewer', 'whoop', 'workday', 'indeed', 'siemens', 'avolta', 'delltechnologies', 'dropbox', 'richardmille', 'allwyn', 'shellpecten', '1password', 'signify', 'pumacat', 'solera'].forEach((id) => ART.add(id));
  // LIVERY-C (williams / astonmartin / cadillac) partner artwork, same pipeline (see SOURCES.md; team-site logos are the teams' own partner files)
  Object.assign(PARTNERS, { '3m': { n: '3M' }, alpinestars: { n: 'Alpinestars' }, arm: { n: 'Arm' }, astonmartin: { n: 'Aston Martin' }, betway: { n: 'betway' }, boss: { n: 'BOSS' },
    breitling: { n: 'Breitling' }, cadillaccrest: { n: 'Cadillac' }, cognition: { n: 'Cognition' }, cohere: { n: 'cohere' }, coinpayments: { n: 'CoinPayments' }, estrellagalicia: { n: 'Estrella Galicia' },
    keeper: { n: 'Keeper' }, clarowordmark: { n: 'Claro' }, honda2026: { n: 'Honda' }, valvolinev: { n: 'Valvoline' }, hondawordmark: { n: 'Honda' }, valvolinemark: { n: 'Valvoline' }, valvolinewordmark: { n: 'Valvoline' }, atlasair: { n: 'Atlas Air' }, celsius: { n: 'Celsius' }, eightsleep: { n: 'Eight Sleep' }, krown: { n: 'Krown' }, servicenow: { n: 'ServiceNow' }, ukg: { n: 'UKG' }, zscaler: { n: 'Zscaler' }, netapp: { n: 'NetApp' }, nexgen: { n: 'NexGen' }, pepperstone: { n: 'Pepperstone' }, vastdata: { n: 'VAST Data' }, williams: { n: 'Williams' }, xerox: { n: 'xerox' } });
  ['3m', 'alpinestars', 'aramco', 'arm', 'astonmartin', 'barclays', 'betway', 'boss', 'breitling', 'cadillac', 'cadillaccrest', 'cognition', 'cohere', 'coinpayments', 'estrellagalicia', 'glenfiddich',
    'ifs', 'jcb', 'jimbeam', 'keeper', 'kraken', 'maaden', 'netapp', 'nexgen', 'pepperstone', 'tommyhilfiger', 'twgai', 'vastdata', 'williams', 'xerox', 'clarowordmark', 'honda2026', 'valvolinev', 'hondawordmark', 'valvolinemark', 'valvolinewordmark', 'atlasair', 'celsius', 'eightsleep', 'krown', 'servicenow', 'ukg', 'zscaler'].forEach((id) => ART.add(id));
  // trimmed aspect (width / height) of each artwork, measured offline (the SVGs carry the same trimmed viewBox)
  Ads.PARTNER_DIR = Ads.BRAND_DIR + 'partners/';
  const PIMG = {};   // id -> decoded SVG image
  function loadPartners() {
    if (typeof location !== 'undefined' && location.protocol === 'file:') return Promise.resolve();
    const one = (id) => new Promise((res) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.decoding = 'async'; im.onload = () => { if (im.naturalWidth > 0) PIMG[id] = im; res(); }; im.onerror = () => res(); im.src = Ads.PARTNER_DIR + id + '.svg'; });
    const f1 = new Promise((res) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { if (im.naturalWidth > 0) PIMG.f1 = im; res(); }; im.onerror = () => res(); im.src = Ads.BRAND_DIR + 'f1/f1-logo.svg'; });
    return Promise.all([f1].concat([...ART].map(one)));
  }
  // the F1-style display face (Saira, OFL, at its widest setting) for the F1 / event branding and the fallback wordmarks
  function loadF1Font() {
    if (typeof FontFace === 'undefined' || !document.fonts) return Promise.resolve();
    try { const ff = new FontFace('F1 Wide', 'url(' + Ads.BRAND_DIR + 'f1/Saira-wdth.woff2) format("woff2")', { weight: '100 900', stretch: '125%' }); document.fonts.add(ff); return ff.load().catch(() => null); } catch (e) { return Promise.resolve(); }
  }
  // rasters: id + tone -> { c: canvas (256 px high), a: aspect }
  const PRAS = new Map(); const PH = 256;
  function toneCanvas(src, tone) {
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(src, 0, 0);
    if (tone === 'rev' || tone === 'whiteKeepRed') {   // rev: dark ink -> white, colours kept (AWS's "aws" over its orange smile, on a dark board);
      // whiteKeepRed: everything white except the red (Heineken's white lettering with the red star on its green boards)
      const d = x.getImageData(0, 0, c.width, c.height); const p = d.data; const rev = tone === 'rev';
      for (let i = 0; i < p.length; i += 4) { const l = (0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]) / 255, s = Math.max(p[i], p[i + 1], p[i + 2]) - Math.min(p[i], p[i + 1], p[i + 2]);
        if (rev ? (l < 0.42 && s < 60) : !(p[i] > 150 && p[i + 1] < 90 && p[i + 2] < 90)) { p[i] = p[i + 1] = p[i + 2] = 255; } }
      x.putImageData(d, 0, 0); return c;
    }
    const col = tone === 'white' ? '#ffffff' : tone === 'black' ? '#111111' : tone.slice(0, 5) === 'mono:' ? tone.slice(5) : null;
    if (col) { x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height); x.globalCompositeOperation = 'source-over'; }
    return c;
  }
  // the wordmark of a partner without artwork, set in code on a transparent 256 px-high canvas, trimmed
  function wordRaster(id) {
    const P = PARTNERS[id] || { n: id }; const o = P.word || W_(F1W, 800, { up: 1 }); const txt = o.up ? String(P.n).toUpperCase() : String(P.n);
    const c = document.createElement('canvas'); const x = c.getContext('2d', { willReadFrequently: true }); const fs = PH * 0.78;
    const font = (o.it ? 'italic ' : '') + o.w + ' ' + fs + 'px ' + o.ff; x.font = font; setLS(x, (o.ls || 0) * fs); const tw = Math.ceil(x.measureText(txt).width + fs * Math.abs(o.ls || 0) + fs * 0.2);
    c.width = Math.min(4096, tw); c.height = PH; x.font = font; setLS(x, (o.ls || 0) * fs); x.textBaseline = 'alphabetic'; x.textAlign = 'left'; x.fillStyle = o.col || '#111111';
    if (c.width < tw) { x.scale(c.width / tw, 1); }
    if (o.oval) x.fillText(txt, fs * 0.1, PH * 0.8);
    if (o.oval) {   // the word on a filled oval badge (Barilla's red oval): wider canvas, the oval behind, the word centred on it
      const ow = Math.min(4096, Math.ceil(tw * 1.32)); const o2 = document.createElement('canvas'); o2.width = ow; o2.height = PH; const y2 = o2.getContext('2d', { willReadFrequently: true });
      y2.fillStyle = o.oval; y2.beginPath(); y2.ellipse(ow / 2, PH / 2, ow / 2 - 2, PH / 2 - 2, 0, 0, Math.PI * 2); y2.fill();
      y2.drawImage(c, (ow - c.width) / 2 + fs * 0.02, PH * 0.06); setLS(x, 0); return o2;
    }
    x.fillText(txt, fs * 0.1, PH * 0.8); setLS(x, 0);
    return trimCanvas(c);
  }
  function trimCanvas(c) {
    const x = c.getContext('2d', { willReadFrequently: true }); const d = x.getImageData(0, 0, c.width, c.height).data; let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let xx = 0; xx < c.width; xx++) if (d[(y * c.width + xx) * 4 + 3] > 8) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return c; const w = x1 - x0 + 1, h = y1 - y0 + 1; const s = PH / h;
    const o = document.createElement('canvas'); o.width = Math.max(1, Math.min(4096, Math.round(w * s))); o.height = PH; const ox = o.getContext('2d', { willReadFrequently: true }); ox.imageSmoothingQuality = 'high'; ox.drawImage(c, x0, y0, w, h, 0, 0, o.width, o.height); return o;
  }
  // logos drawn on their own filled plate (DHL's yellow bar, Pirelli's yellow box, TAG Heuer's shield, Ford's oval ...): a one-colour
  // tone would turn them into a solid blob, so they always keep their own colours
  const PLATE = Ads.PARTNER_PLATE = new Set(['dhl', 'pirelli', 'tagheuer', 'americanexpress', 'okx', 'ford', 'cashapp', 'gulf', 'claro', 'hardrock', 'mastercard', 'salesforce', 'lenovo', 'liquimoly', 'kitkat']);
  function partnerRaster(id, tone) {
    tone = tone || 'color'; if (PLATE.has(id) && tone !== 'color' && tone !== 'rev') tone = 'color'; const key = id + '|' + tone; let r = PRAS.get(key); if (r) return r;
    let base = PRAS.get(id + '|color');
    if (!base) {
      const im = PIMG[id]; let c;
      if (im) { const a = im.naturalWidth / im.naturalHeight; let h = PH, w = Math.round(h * a); if (w > 4096) { w = 4096; h = Math.round(w / a); } c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, w, h); }
      else c = wordRaster(id);
      base = { c, a: c.width / c.height, art: !!im }; PRAS.set(id + '|color', base);
    }
    if (tone === 'color') return base;
    r = { c: toneCanvas(base.c, tone), a: base.a, art: base.art }; PRAS.set(key, r); return r;
  }
  Ads.partnerReady = function () { return Ads.ready(); };
  Ads.hasPartner = function (idOrName) { const id = Ads.partnerId(idOrName); return !!PIMG[id]; };
  Ads.partnerInfo = function (idOrName) { const id = Ads.partnerId(idOrName); const P = PARTNERS[id] || { n: idOrName }; const r = partnerRaster(id); return { id, name: P.n, aspect: r.a, art: r.art, board: P.board || null }; };
  // contain-fit the logo in maxW x maxH centred on (cx, cy); o = { tone, plate: '#hex' (rounded plate behind), pad (plate padding, x height), fill (optical
  // area share: wide wordmarks and square badges get the same visual weight; 1 = plain contain) }. Returns [w, h] of the logo
  Ads.drawPartner = function (ctx, idOrName, cx, cy, maxW, maxH, o) {
    o = o || {}; const id = Ads.partnerId(idOrName); if (!PARTNERS[id]) PARTNERS[id] = { n: String(idOrName) };
    const r = partnerRaster(id, o.tone || 'color'); const pad = o.plate ? (o.pad != null ? o.pad : 0.16) : 0;
    const bw = maxW / (1 + pad * 2 / Math.max(1e-3, maxH / maxW)), bh = maxH;   // keep room for the plate
    let h = Math.min(bh / (1 + pad * 2), maxW / (r.a + pad * 2)); if (o.fill && o.fill < 1) h = Math.min(h, Math.sqrt(maxW * maxH * o.fill / r.a)); const w = h * r.a;
    if (o.plate) { const p = h * pad; ctx.fillStyle = o.plate; rr(ctx, cx - w / 2 - p, cy - h / 2 - p, w + p * 2, h + p * 2, Math.min(h, w) * 0.18 + p * 0.6); ctx.fill(); }
    drawImg(ctx, r.c, cx - w / 2, cy - h / 2, w, h); void bw; return [w, h];
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
    // safe margins: at least 16 % of the height or 4.5 % of the width on each side (nothing runs to a board edge)
    const m = Math.max(h * 0.16, w * 0.045), top = h * 0.1, lh = h * 0.26;
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
      rows(ctx, w, h, { logo: 'intake', logoCol: '#ffffff', head: [['Applications close faster ', '#ffffff'], ['than a pit stop.', INTAKE.blue]], headFont: INTAKE.head, pill: ['intake.ink', INTAKE.blue, INTAKE.ink, INTAKE.body, 600] }); } },
  ];
  // paint tile k into the pixel box (x, y, w, h); `aspect` is the board's physical width / height (default 5:1)
  // Each slot k (0-7) is the venue's k-th board (VENUES[track].tiles): real F1 partners with Lumi / Intake as about one board in four.
  // The layout is done in the board's physical proportions (vw = h * aspect) and squeezed into the pixel box, so on the mesh, whose
  // face is `aspect` times as wide as it is tall, nothing is stretched. o.dark: Yas's black boards (white logos)
  Ads.paintTile = function (ctx, k, x, y, w, h, aspect, o) {
    const vw = h * (aspect || 5); const V = venue(); const slot = V.tiles[((k % 8) + 8) % 8]; if (!o && V.darkBoards) o = { dark: true };
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.translate(x, y); ctx.scale(w / vw, 1); slotPainter(slot, 'tile', o)(ctx, vw, h); ctx.restore();
  };
  // a Lumi / Intake design by its own index (0-3 Lumi, 4-7 Intake), for surfaces that carry the race partners only
  Ads.paintBrandTile = function (ctx, k, x, y, w, h, aspect) { const vw = h * (aspect || 5); ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.translate(x, y); ctx.scale(w / vw, 1); TILES[k % TILES.length].paint(ctx, vw, h); ctx.restore(); };

  // ---------------------------------------------------------------- the venue mix: real F1 trackside partners + the occasional Lumi / Intake board
  // F1's 2026 global partners (Aramco, AWS, DHL, Heineken, Lenovo, LVMH: Louis Vuitton / TAG Heuer, MSC Cruises, Pirelli, Qatar Airways,
  // Salesforce) carry the trackside boards at every race, official partners (Crypto.com, Santander, ...) at selected ones, and each
  // event adds its title partner (Qatar Airways British GP, Louis Vuitton GP de Monaco, Etihad Airways Abu Dhabi GP). TAG Heuer is the
  // official timekeeper since 2025 (it replaced Rolex): the start gantry carries the F1 logo, the event title and the TAG Heuer clock.
  // Slots: a partner id, or 'L<n>' / 'I<n>' = Lumi / Intake design n. Every format keeps Lumi and Intake to about one board in four.
  const VENUES = Ads.VENUES = {
    // Silverstone (SILVERSTONE-UPGRADE, the F1 photos 2015-2026): DHL yellow (pit wall, the Wing, straights), Pirelli yellow, Fly Emirates red walls,
    // Rolex green stand fronts, Qatar Airways (the 2026 title), Barilla blue (2026), UBS (gantry / boards); Lumi / Intake keep about one board in four
    silverstone: { title: 'qatarairways', event: 'British Grand Prix', dark: false,
      tiles: ['dhl', 'qatarairways', 'L0', 'flyemirates', 'pirelli', 'rolex', 'I4', 'barilla'],
      // wall panels avoid Qatar Airways (it is on the hoardings right behind them: no same-brand stacking)
      barrier: ['dhl', 'flyemirates', 'L', 'rolex', 'pirelli'], billboard: ['qatarairways', 'L0', 'ubs', 'I1'],
      runoff: ['dhl', 'L', 'pirelli', 'I'], bridge: { lumi: 'lasvegas', intake: 'qatarairways', lumi2: 'L', intake2: 'I' } },
    monaco: { title: 'louisvuitton', event: 'Grand Prix de Monaco', dark: false,
      // (MONACO-UPGRADE: the partners in the Monaco race photos - Qatar Airways along the harbour, Rolex's green wall, AWS, Heineken)
      tiles: ['tagheuer', 'louisvuitton', 'L1', 'qatarairways', 'rolex', 'heineken', 'I5', 'aws'],
      barrier: ['tagheuer', 'L', 'louisvuitton', 'msccruises', 'I'], billboard: ['louisvuitton', 'L2', 'tagheuer', 'I3'],
      runoff: ['aramco', 'L', 'pirelli', 'I'], bridge: { lumi: 'L', intake: 'louisvuitton', lumi2: 'tagheuer', intake2: 'I' } },
    // Yas Marina (ABUDHABI-UPGRADE, the 2016-2025 F1 photos): Etihad's black boards with white lettering dominate the walls, the stand fronts
    // and the start gantry; MSC Cruises on the stand fascias, Pirelli, Rolex and DHL at the corners, CrowdStrike (2025); Lumi / Intake keep
    // about one board in four. Heineken / AWS (not seen at Yas) dropped
    abudhabi: { title: 'etihadairways', event: 'Abu Dhabi Grand Prix', dark: true,
      tiles: ['etihadairways', 'msccruises', 'L1', 'pirelli', 'etihadairways', 'crowdstrike', 'I7', 'rolex'],
      barrier: ['etihadairways', 'L', 'msccruises', 'etihadairways', 'I'], billboard: ['etihadairways', 'L2', 'rolex', 'I3'],
      runoff: ['etihadairways', 'L', 'pirelli', 'I'], bridge: { lumi: 'L', intake: 'etihadairways', lumi2: 'etihadairways', intake2: 'I' } },
  };
  // Monza: Pirelli is the Italian GP's title partner ("Formula 1 Pirelli Gran Premio d'Italia") and its boards/bridges dominate the venue
  // Monza's trackside partner boards are dark navy (2025 photos: crypto.com-style navy walls behind pale gravel) with white lettering
  // MONZA-UPGRADE (35 F1 photos 2023-25, staging/monza_refs): the walls are a mix - YELLOW Pirelli boards with red lettering (T1, the start wall,
  // the Parabolica), green Heineken, navy MSC Cruises, the black #ItalianGP band, TAG Heuer; ownBoards keep their own ground on the navy venue
  VENUES.monza = { title: 'pirelli', event: "Gran Premio d'Italia", dark: false, darkBoards: true, darkBg: '#0c1a42',
    ownBoards: { pirelli: { bg: '#ffd200', tone: 'color' }, heineken: {}, italiangp: {}, rolex: {} },
    tiles: ['pirelli', 'heineken', 'L0', 'msccruises', 'italiangp', 'pirelli', 'I4', 'tagheuer'],
    barrier: ['pirelli', 'L', 'italiangp', 'msccruises', 'I'], billboard: ['pirelli', 'L2', 'heineken', 'I3'],
    runoff: ['pirelli', 'L', 'italiangp', 'I'], bridge: { lumi: 'L', intake: 'pirelli', lumi2: 'tagheuer', intake2: 'I' } };   // lumi2 = the green sign bridge after the Rettifilo (Rolex until 2024 -> TAG Heuer, F1's timekeeper since 2025)
  // Spa (SPA-UPGRADE, the 35 F1 photos 2022-2025 in staging/spa_refs/photos): red Moet & Chandon walls and the start gantry on the pit straight (the event's
  // title partner in the photos), Qatar Airways (La Source exit gantry, painted run-off, stand walls), Pirelli yellow walls, Globant at Eau Rouge, plus the
  // F1 partners; Lumi / Intake keep about one board in four
  VENUES.spa = { title: 'moetchandon', event: 'Belgian Grand Prix', dark: false,
    tiles: ['moetchandon', 'qatarairways', 'L0', 'pirelli', 'heineken', 'aramco', 'I4', 'dhl'],
    barrier: ['moetchandon', 'qatarairways', 'L', 'pirelli', 'globant', 'aramco', 'I', 'dhl'], billboard: ['moetchandon', 'L2', 'qatarairways', 'I3'],
    runoff: ['qatarairways', 'L', 'pirelli', 'I'], bridge: { lumi: 'L', intake: 'I', lumi2: 'qatarairways', intake2: 'moetchandon' } };
  // Circuit of the Americas (COTA-DRESS): "Formula 1 MSC Cruises United States Grand Prix" (the 2025 title); the F1 global partners plus the US-market
  // ones seen at Austin (Crypto.com, Heineken 0.0, AWS, Lenovo, American Express); Lumi / Intake 2 of the 8 hoarding tiles, 1 wall panel in 5
  // COTA-UPGRADE (22 F1 photos, staging/cota_refs/photos): the boards actually seen at Austin are MSC Cruises (navy, the start gantry, the
  // main-straight wall, the T1 stands), DHL (yellow, the Main Grandstand wall), Qatar Airways (maroon, the walls by the tower), Pirelli (yellow, T1
  // area), Heineken (green, run-off + fences), American Express (blue, the T3 footbridge) and the black #USGP band; Lumi / Intake keep 2 of 8 tiles
  VENUES.cota = { title: 'msccruises', event: 'United States Grand Prix', dark: false,
    tiles: ['msccruises', 'dhl', 'L0', 'qatarairways', 'usgp', 'pirelli', 'I4', 'heineken'],
    barrier: ['msccruises', 'L', 'usgp', 'qatarairways', 'I'], billboard: ['msccruises', 'L2', 'americanexpress', 'I3'],
    runoff: ['heineken', 'L', 'qatarairways', 'I'], bridge: { lumi: 'L', intake: 'I', lumi2: 'tagheuer', intake2: 'msccruises' } };
  // Autodromo Hermanos Rodriguez (MEX-DRESS): "Formula 1 Gran Premio de la Ciudad de Mexico" (the brief's title partner MSC Cruises; the 2025 programme names Heineken as the presenting partner).
  // Boards seen in the F1 photo set: MSC Cruises + LVMH on the stadium decks, Heineken (green) and the crimson #MexicoGP band on the walls, Lenovo along the grandstand fronts; no other Mexico-market
  // brand has a source at this GP. Lumi / Intake 2 of the 8 hoarding tiles and 2 of the 5 wall panels
  VENUES.mexico = { title: 'msccruises', event: 'Gran Premio de la Ciudad de México', dark: false,
    tiles: ['msccruises', 'mexicogp', 'L0', 'heineken', 'lenovo', 'mexicogp', 'I4', 'lvmh'],
    barrier: ['mexicogp', 'L', 'lenovo', 'heineken', 'I'], billboard: ['msccruises', 'L2', 'heineken', 'I3'],
    runoff: ['heineken', 'L', 'pirelli', 'I'], bridge: { lumi: 'L', intake: 'I', lumi2: 'tagheuer', intake2: 'msccruises' } };
  const venue = Ads.venue = () => VENUES[EI.trackId] || VENUES.silverstone;
  // the track's width (m): the start gantry banner ((width + 2.6) x 0.9 m) and the bridge fascias ((width + 6.8) x 2.1 m) span it
  const trackW = () => (EI.TRACKS && EI.TRACKS[EI.trackId] && EI.TRACKS[EI.trackId].width) || 15;
  // a partner board in a (w x h) frame that already has the board's physical proportions (the callers pre-squeeze, see paintTile).
  // Real LED / vinyl boards are flat: the brand ground and the logo, repeated on the very long formats. o.dark: Yas's black boards
  function partnerBoard(ctx, id, w, h, o) {
    // (Monza: venue ownBoards keep their own ground on the dark-board venue)
    o = o || {}; { const OB = venue().ownBoards && venue().ownBoards[id]; if (OB) o = Object.assign({}, o, { dark: false }, OB); } const P = PARTNERS[id] || {}; const b = P.board || { bg: '#ffffff', tone: 'color' };
    const dark = o.dark && id !== 'f1'; const bg = dark ? (venue().darkBg || '#0b0c0f') : (o.bg || b.bg); const tone = dark ? (b.tone === 'whiteKeepRed' ? b.tone : b.tone === 'color' && isLightRaster(id) ? 'color' : 'white') : (o.tone || b.tone);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    // compact marks (TAG Heuer's shield, Gulf's disc ...) on long boards: larger, and repeated like the real boards; safe margins all round
    const a = partnerRaster(id, 'color').a, asp = w / h, compact = a < 2.2 && asp > 2.6;
    const n = compact ? Math.max(1, Math.min(6, Math.floor(asp / (a * 0.84 + 1.1)))) : (o.repeat || (asp > 7.5 ? Math.max(2, Math.round(asp / 4.6)) : 1)); const cw = w / n;
    const lh = h * (compact ? 0.8 : (o.lh || 0.6)), lw = cw * 0.8;
    for (let i = 0; i < n; i++) Ads.drawPartner(ctx, id, cw * (i + 0.5), h * 0.5, lw, lh, { tone, fill: compact ? 1 : (o.fill || 0.36) });
    if (n > 1 && o.dividers !== false) { ctx.fillStyle = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'; for (let i = 1; i < n; i++) ctx.fillRect(cw * i - h * 0.01, h * 0.18, h * 0.02, h * 0.64); }
  }
  Ads.partnerBoard = partnerBoard;
  // a colour logo that is mostly light already reads on black (e.g. TAG Heuer's shield, Etihad's gold): keep its colours on the dark boards
  const LIGHT_RASTER = { tagheuer: 1, etihadairways: 1, f1: 1 };
  function isLightRaster(id) { return !!LIGHT_RASTER[id]; }
  // the F1 logo (official artwork, assets/brand/f1) in a box; falls back to the word "F1" in the display face
  Ads.drawF1 = function (ctx, cx, cy, maxW, maxH, col) {
    const tone = col ? (col === '#ffffff' ? 'white' : 'mono:' + col) : 'color';
    if (PIMG.f1 || ART.has('f1')) return Ads.drawPartner(ctx, 'f1', cx, cy, maxW, maxH, { tone });
    ctx.font = 'italic 900 ' + maxH + 'px ' + F1W; ctx.fillStyle = col || '#e10600'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('F1', cx, cy, maxW); return [maxW, maxH];
  };
  // slot -> painter (ctx, w, h) for the given format; Lumi / Intake keep their own designs
  function slotPainter(slot, fmt, o) {
    if (slot[0] === 'L' || slot[0] === 'I') {
      const lumi = slot[0] === 'L', k = slot.length > 1 ? +slot.slice(1) : 0;
      if (o && o.dark) return darkBrand(slot[0]);
      // short boards (under ~3.2:1, e.g. Yas's 2:1 LED band) get the short copy: the lock-up and the URL only, so nothing overlaps
      if (fmt === 'tile') return (ctx, w, h) => (w / h < 3.2 ? compactBrand(lumi, ctx, w, h) : TILES[k % TILES.length].paint(ctx, w, h));
      if (fmt === 'billboard') return (ctx, w, h) => brandBillboard(ctx, k, w, h);
      if (fmt === 'barrier') return lumi ? BRAND_BARRIER[0] : BRAND_BARRIER[3];
      if (fmt === 'runoff') return null;
      if (fmt === 'bridge') return (ctx, w, h) => brandBridge(ctx, lumi ? 'lumi' : 'intake2', w, h);
    }
    return (ctx, w, h) => partnerBoard(ctx, slot, w, h, o);
  }
  Ads.slotPainter = slotPainter;
  function compactBrand(lumi, ctx, w, h) {
    if (lumi) lumiFrame(ctx, w, h, LUMI.bg, ['rgba(230,200,255,0.55)', 'rgba(220,238,209,0.6)']); else intakeFrame(ctx, w, h, INTAKE.bg);
    Ads.lockupCentered(ctx, lumi ? 'lumi' : 'intake', w / 2, h * 0.42, h * 0.34, w * 0.8);
    line(ctx, [[lumi ? 'trylumi.co' : 'intake.ink', lumi ? LUMI.plum : INTAKE.blueDeep]], w / 2, h * 0.84, h * 0.15, lumi ? LUMI.body : INTAKE.body, lumi ? 700 : 600, w * 0.8, 'center');
  }
  // single-colour (white mask on black) lettering band painted on the run-off along a straight (track.js brandStripTexture): the venue's
  // title partner and Aramco in white, with the two race partners' URLs between them; w x h covers 2 x `seg` metres per partner
  Ads.paintMaskStrip = function (ctx, w, h) {
    const V = venue(); const items = [V.title || 'aramco', 'trylumi.co', 'aramco', 'intake.ink']; const sw = w / items.length;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    items.forEach((it, i) => { const cx = sw * (i + 0.5);
      if (it === 'trylumi.co') line(ctx, [[it, '#fff']], cx, h * 0.68, h * 0.62, LUMI.head, 800, sw * 0.86, 'center');
      else if (it === 'intake.ink') line(ctx, [[it, '#fff']], cx, h * 0.68, h * 0.56, INTAKE.head, 800, sw * 0.86, 'center');
      else Ads.drawPartner(ctx, it, cx, h * 0.5, sw * 0.8, h * 0.72, { tone: 'white' }); });
  };


  // ---------------------------------------------------------------- bridges and the start gantry banner (very wide formats)
  function brandBridge(ctx, which, w, h) {
    ctx.save();
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
  }
  // the sponsor bridges over the track: `which` is the bridge's name in the track data ('lumi', 'intake', 'lumi2', 'intake2'); the venue
  // maps it to a partner (VENUES[track].bridge) - one Lumi and one Intake bridge stay, the others carry the event's partners
  Ads.paintBridge = function (ctx, which, w, h, aspect) {
    const vw = h * (aspect || (trackW() + 6.8) / 2.1); const V = venue(); const slot = (V.bridge && V.bridge[which]) || which;
    ctx.save(); ctx.scale(w / vw, 1);
    if (slot === 'L' || slot === 'I') brandBridge(ctx, slot === 'L' ? (which === 'lumi2' ? 'lumi2' : 'lumi') : (which === 'intake' ? 'intake' : 'intake2'), vw, h);
    else if (VENUES[EI.trackId] || slot !== which) partnerBoard(ctx, slot, vw, h, { lh: 0.58 });
    else brandBridge(ctx, which, vw, h);
    ctx.restore();
  };
  // a tall event panel (the raised sign over a start gantry, ~4.8:1): the F1 logo, the event title and the title partner, centred
  Ads.paintEventPanel = function (ctx, w, h, aspect) {
    const vw = h * (aspect || 4.85); ctx.save(); ctx.scale(w / vw, 1); w = vw; const V = venue();
    ctx.fillStyle = '#15151e'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#e10600'; ctx.fillRect(0, h * 0.94, w, h * 0.06);
    const f1 = Ads.drawF1(ctx, w * 0.25, h * 0.47, w * 0.36, h * 0.5);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(w * 0.25 + f1[0] / 2 + h * 0.2, h * 0.2, Math.max(1, h * 0.02), h * 0.56);
    const x0 = w * 0.25 + f1[0] / 2 + h * 0.42, tw = w - x0 - h * 0.3;
    if (PARTNERS[V.title]) { const r = Ads.drawPartner(ctx, V.title, -9999, -9999, tw, h * 0.3, { tone: 'white' }); Ads.drawPartner(ctx, V.title, x0 + r[0] / 2, h * 0.33, tw, h * 0.3, { tone: 'white' }); }
    line(ctx, [[V.event.toUpperCase(), '#ffffff']], x0, h * 0.72, h * 0.2, F1W, 800, tw, 'left', 0.01);
    ctx.restore();
  };
  // the Lumi + Intake co-branded banner (the old start gantry design; kept for surfaces that want both race partners)
  Ads.paintPartnersBanner = function (ctx, w, h) { brandBanner(ctx, w, h); };
  // start gantry banner: both partners side by side
  function brandBanner(ctx, w, h) {
    ctx.fillStyle = LUMI.bg; ctx.fillRect(0, 0, w / 2, h); ctx.fillStyle = INTAKE.bg; ctx.fillRect(w / 2, 0, w / 2, h);
    haze(ctx, w * 0.1, 0, w * 0.2, h, 'rgba(230,200,255,0.6)'); dots(ctx, w / 2, 0, w / 2, h, 'rgba(43,33,28,0.10)', h * 0.2);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(w / 2 - 2, 0, 4, h);
    let lw = Ads.lumiLogo(ctx, h * 0.2, h * 0.2, h * 0.58);
    line(ctx, [['Learn anything. Actually understand it.', LUMI.ink]], h * 0.2 + lw + h * 0.5, h * 0.7, h * 0.42, LUMI.head, 800, w / 2 - lw - h * 3.4, 'left');
    line(ctx, [['trylumi.co', LUMI.plum]], w / 2 - h * 0.3, h * 0.68, h * 0.32, LUMI.body, 700, 0, 'right');
    lw = Ads.intakeLogo(ctx, w / 2 + h * 0.2, h * 0.21, h * 0.58);
    line(ctx, [['Win your degree ', INTAKE.ink], ['apprenticeship.', INTAKE.blueDeep]], w / 2 + h * 0.2 + lw + h * 0.5, h * 0.72, h * 0.44, INTAKE.head, 800, w / 2 - lw - h * 3.4, 'left');
    line(ctx, [['intake.ink', INTAKE.blueDeep]], w - h * 0.3, h * 0.68, h * 0.32, INTAKE.body, 600, 0, 'right');
  }
  // the start gantry: F1 black, the official F1 logo, the event title ("FORMULA 1 QATAR AIRWAYS BRITISH GRAND PRIX 2026" with the title
  // partner's logo) and the TAG Heuer timing panel at both ends, as on the 2025-26 gantries. aspect = physical width / height of the banner
  Ads.paintBanner = function (ctx, w, h, aspect) {
    const vw = h * (aspect || (trackW() + 2.6) / 0.9); ctx.save(); ctx.scale(w / vw, 1); w = vw;
    const V = venue(); ctx.fillStyle = '#15151e'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e10600'; ctx.fillRect(0, h * 0.9, w, h * 0.1);
    // TAG Heuer panels at both ends
    const tp = Math.min(w * 0.16, h * 3.4);
    for (const x0 of [0, w - tp]) { ctx.fillStyle = '#0a0a0c'; ctx.fillRect(x0, 0, tp, h * 0.9); Ads.drawPartner(ctx, 'tagheuer', x0 + tp / 2, h * 0.45, tp * 0.8, h * 0.66, { fill: 0.5 }); }
    // centre: F1 logo + title partner + event name
    const cx0 = tp + h * 0.5, cw = w - 2 * tp - h; let x = cx0;
    const f1 = Ads.drawF1(ctx, x + h * 1.1, h * 0.45, h * 2.2, h * 0.5); x += h * 1.1 + f1[0] / 2 + h * 0.45;
    const tl = PARTNERS[V.title] ? Ads.drawPartner(ctx, V.title, 0, -9999, h * 3.6, h * 0.56, { tone: 'white' }) : [0, 0];
    if (tl[0]) { Ads.drawPartner(ctx, V.title, x + tl[0] / 2, h * 0.45, h * 3.6, h * 0.56, { tone: 'white' }); x += tl[0] + h * 0.45; }
    line(ctx, [[V.event.toUpperCase() + ' 2026', '#ffffff']], x, h * 0.63, h * 0.44, F1W, 800, cx0 + cw - x, 'left', 0.02);
    ctx.restore();
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
    line(ctx, [['Stuck on a question? Ask Lumi.', LUMI.ink]], h * 0.06, h * 0.41, h * 0.11, LUMI.head, 800, w - h * 0.2, 'left');
    ctx.translate(0, h / 2); intakeFrame(ctx, w, h / 2, INTAKE.bg);
    Ads.intakeLogo(ctx, h * 0.06, h * 0.07, h * 0.15);
    line(ctx, [['Get paid ', INTAKE.blueDeep], ['to get a degree.', INTAKE.ink]], h * 0.06, h * 0.41, h * 0.11, INTAKE.head, 800, w - h * 0.2, 'left');
    ctx.restore();
  };

  // ---------------------------------------------------------------- white paint on the run-off (single colour)
  // row k (0-3) of the run-off paint: the venue's VENUES[track].runoff[k] - a partner logo painted in its colours on its plate, or Lumi /
  // Intake (their lock-ups on a cream plate). aspect = the painted patch's length / width on the ground
  Ads.paintRunoff = function (ctx, k, x, y, w, h, col, aspect) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.translate(x, y); const vw = h * (aspect || 5); ctx.scale(w / vw, 1); w = vw;
    const slot = venue().runoff[k & 3];
    if (slot === 'L' || slot === 'I') brandRunoff(ctx, slot === 'L' ? 0 : 1, w, h, col);
    else { const P = PARTNERS[slot] || {}; const b = P.board || { bg: '#ffffff', tone: 'color' }; const r = partnerRaster(slot, b.tone); const lh = h * 0.56; const lw = Math.min(w * 0.8, lh * r.a); const lh2 = lw / r.a;
      ctx.fillStyle = b.bg; rr(ctx, (w - lw) / 2 - h * 0.3, h * 0.06, lw + h * 0.6, h * 0.88, h * 0.2); ctx.fill(); Ads.drawPartner(ctx, slot, w / 2, h / 2, lw, lh2, { tone: b.tone }); }
    ctx.restore();
  };
  function brandRunoff(ctx, k, w, h, col) {
    const mono = col || '#f2f1ec';
    // rows 0 / 1: full-colour lock-ups on a painted cream plate; rows 2 / 3: the URLs in plain white paint
    if (k === 0) { const lh = h * 0.56, lw = Ads.lumiLogoW(ctx, lh); ctx.fillStyle = LUMI.bg; rr(ctx, (w - lw) / 2 - h * 0.3, h * 0.06, lw + h * 0.6, h * 0.88, h * 0.2); ctx.fill(); Ads.lumiLogo(ctx, (w - lw) / 2, h * 0.21, lh); }
    else if (k === 1) { const lh = h * 0.56, lw = Ads.intakeLogoW(ctx, lh); ctx.fillStyle = INTAKE.bg; rr(ctx, (w - lw) / 2 - h * 0.3, h * 0.06, lw + h * 0.6, h * 0.88, h * 0.2); ctx.fill(); Ads.intakeLogo(ctx, (w - lw) / 2, h * 0.22, lh); }
    else if (k === 2) line(ctx, [['trylumi.co', mono]], w / 2, h * 0.78, h * 0.78, LUMI.head, 800, w * 0.96, 'center');
    else line(ctx, [['intake.ink', mono]], w / 2, h * 0.76, h * 0.7, INTAKE.head, 800, w * 0.96, 'center');
  }

  // ---------------------------------------------------------------- barrier panels (5.12 m x 0.7 m, repeating along the wall)
  Ads.BARRIER_ASPECT = 5.12 / 0.7;
  const BRAND_BARRIER = Ads.BRAND_BARRIER = [
    (ctx, w, h) => { ctx.fillStyle = LUMI.bg; ctx.fillRect(0, 0, w, h); Ads.lumiLogo(ctx, (w - Ads.lumiLogoW(ctx, h * 0.66)) / 2, h * 0.16, h * 0.66); },
    (ctx, w, h) => { ctx.fillStyle = INTAKE.blue; ctx.fillRect(0, 0, w, h); line(ctx, [['intake.ink', INTAKE.ink]], w / 2, h * 0.74, h * 0.6, INTAKE.head, 800, w * 0.92, 'center'); },
    (ctx, w, h) => { ctx.fillStyle = LUMI.plum; ctx.fillRect(0, 0, w, h); line(ctx, [['Ask Lumi.', '#ffffff']], w / 2, h * 0.76, h * 0.68, LUMI.head, 800, w * 0.92, 'center'); },
    (ctx, w, h) => { ctx.fillStyle = INTAKE.bg; ctx.fillRect(0, 0, w, h); Ads.intakeLogo(ctx, (w - Ads.intakeLogoW(ctx, h * 0.68)) / 2, h * 0.16, h * 0.68); },
    (ctx, w, h) => { ctx.fillStyle = LUMI.bg; ctx.fillRect(0, 0, w, h); line(ctx, [['trylumi.co', LUMI.plum]], w / 2, h * 0.75, h * 0.66, LUMI.head, 800, w * 0.92, 'center'); },
  ];
  // the five wall panels of the venue (VENUES[track].barrier): painters (ctx, w, h) laid out in the panel's physical 5.12 x 0.7 frame.
  // Ads.barrierArt({ dark }) for Yas's black boards with white logos
  Ads.barrierArt = function (o) { o = o || {}; const V = venue(); const dark = o.dark != null ? o.dark : (V.dark || V.darkBoards); return V.barrier.map((s) => (s === 'L' || s === 'I') ? (dark ? darkBrand(s) : slotPainter(s, 'barrier')) : (ctx, w, h) => partnerBoard(ctx, s, w, h, { dark, lh: 0.62, repeat: 1 })); };
  function darkBrand(s) { return (ctx, w, h) => { ctx.fillStyle = venue().darkBg || '#0b0c0f'; ctx.fillRect(0, 0, w, h); Ads.lockupCentered(ctx, s === 'L' ? 'lumi' : 'intake', w / 2, h / 2, h * 0.6, w * 0.8, '#ffffff', s === 'L'); }; }
  Object.defineProperty(Ads, 'BARRIER', { get() { return Ads.barrierArt(); }, enumerable: true });

  // ---------------------------------------------------------------- car livery decals (carglb.js / teams.js fit these onto the body)
  // A decal is { n: text, fg, bg (optional plate colour), w: weight, ff: font family } or, with lk: 'lumi' | 'intake', the brand's
  // full lock-up (mark + wordmark; fg = wordmark colour), or with emp: id an employer logo (bg = plate colour). Slot order:
  // 0 title (engine cover, rear wing, endplates), 1 sidepod, 2 nose, 3 lower sidepod. Half the grid runs Lumi, half Intake.
  const LUMI_SET = [{ lk: 'lumi', n: 'lumi', fg: LUMI.plum, bg: LUMI.bg, w: 700, ff: LUMI.head }, { lk: 'intake', n: 'intake', fg: INTAKE.ink, bg: INTAKE.bg, w: 700, ff: INTAKE.head }, { n: 'trylumi.co', fg: '#ffffff', w: 700, ff: LUMI.body }, { n: 'intake.ink', fg: '#ffffff', w: 600, ff: INTAKE.body }];
  const INTAKE_SET = [{ lk: 'intake', n: 'intake', fg: INTAKE.ink, bg: INTAKE.bg, w: 700, ff: INTAKE.head }, { lk: 'lumi', n: 'lumi', fg: LUMI.plum, bg: LUMI.bg, w: 700, ff: LUMI.head }, { n: 'intake.ink', fg: '#ffffff', w: 600, ff: INTAKE.body }, { n: 'trylumi.co', fg: '#ffffff', w: 700, ff: LUMI.body }];
  // the two works teams carry their own brand (their full livery graphics are drawn by the livery composer)
  const LUMI_TEAM = [{ lk: 'lumi', n: 'lumi', fg: '#ffffff', w: 700, ff: LUMI.head }, { n: 'trylumi.co', fg: LUMI.plum, w: 700, ff: LUMI.body }, { n: 'Ask Lumi.', fg: '#ffffff', w: 800, ff: LUMI.head }, { n: 'Learn anything.', fg: LUMI.plum, w: 800, ff: LUMI.head }];
  const INTAKE_TEAM = [{ lk: 'intake', n: 'intake', fg: INTAKE.bg, w: 700, ff: INTAKE.head }, { n: 'intake.ink', fg: INTAKE.ink, w: 600, ff: INTAKE.body }, { n: 'intake.ink', fg: INTAKE.bg, w: 600, ff: INTAKE.body }, { n: 'Get paid to get a degree.', fg: INTAKE.ink, w: 600, ff: INTAKE.body }];
  // the real teams' 2026 car partners, most prominent first (EI.SEASON teams[].partners; f1-RESEARCH), for the default decal slots
  // 0 title (engine cover, rear wing, endplates), 1 sidepod, 2 nose, 3 lower sidepod. Lumi / Intake are only on their own teams' cars
  const TEAM_PARTNERS = Ads.TEAM_PARTNERS = {
    mercedes: ['petronas', 'microsoft', 'crowdstrike', 'ineos', 'snapdragon', 'adidas', 'teamviewer', 'ubs'],
    ferrari: ['hp', 'shell', 'unicredit', 'ibm', 'aws', 'puma', 'cevalogistics', 'bingx', 'whoop'],
    mclaren: ['mastercard', 'okx', 'allwyn', 'etihadairways', 'googlegemini', 'dell', 'dpworld', 'deloitte'],
    redbull: ['oracle', 'ford', 'mobil1', 'visa', 'tagheuer', 'rokt', 'hardrock', 'att'],
    racingbulls: ['visa', 'cashapp', 'ford', 'mobil1'],
    alpine: ['bwt', 'msccruises', 'mercadolibre', 'eni', 'hmosercie'],
    haas: ['tgr', 'haasautomation', 'ic', 'mgmresorts', 'playngo', 'singha'],
    audi: ['revolut', 'audi', 'visitqatar', 'bp', 'castrol', 'adidas', 'nexo'],
    williams: ['atlassian', 'barclays', 'komatsu', 'claude', 'kraken', 'bny', 'gulf', 'duracell'],
    astonmartin: ['aramco', 'maaden', 'honda', 'coreweave', 'cognizant', 'valvoline', 'glenfiddich', 'jcb', 'coinbase'],
    cadillac: ['tommyhilfiger', 'jimbeam', 'ifs', 'corescientific', 'claro', 'tenneco', 'twgai'],
  };
  Ads.teamPartners = function (teamId) {
    const S = EI.SEASON && EI.SEASON.teams && EI.SEASON.teams.find((t) => t.id === teamId);
    if (S && S.partners && S.partners.length) return S.partners.map((p) => Ads.partnerId(p.name)).filter((id) => id !== teamId);
    return (TEAM_PARTNERS[teamId] || []).slice();
  };
  Ads.sponsorsFor = function (k, light, id) {
    if (id === 'lumi') return LUMI_TEAM.map(s => Object.assign({}, s));
    if (id === 'intake') return INTAKE_TEAM.map(s => Object.assign({}, s));
    // real teams: their real partners' logos (white on dark paint, the logo's own colours on light paint)
    if (TEAM_PARTNERS[id]) return Ads.teamPartners(id).slice(0, 4).map((pid) => ({ partner: pid, n: (PARTNERS[pid] || { n: pid }).n, tone: light ? 'color' : 'white', fg: light ? '#111111' : '#ffffff' }));
    // on light liveries the white partner text flips to the brand inks
    const set = (k % 2 ? INTAKE_SET : LUMI_SET).map(s => Object.assign({}, s));
    if (light) for (const s of set) if (!s.bg && s.fg === '#ffffff') s.fg = s.ff === LUMI.head || s.ff === LUMI.body ? LUMI.plum : INTAKE.ink;
    return set;
  };
  // draw one decal centred on (x, y) at cap height fs, fitted into maxW; returns the width used. Used by the livery composers.
  Ads.drawDecal = function (ctx, sp, x, y, fs, maxW) {
    if (sp.partner) { const r = Ads.drawPartner(ctx, sp.partner, x, y, maxW, fs * 1.5, { tone: sp.tone || 'white', plate: sp.bg || null, fill: 0.5 }); return r[0]; }
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
  Ads.paintBillboard = function (ctx, k, x, y, w, h, aspect) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.translate(x, y); const vw = h * (aspect || Ads.BILLBOARD_ASPECT); ctx.scale(w / vw, 1);
    const V = venue(); const slot = V.billboard[((k % 4) + 4) % 4];
    if (slot[0] === 'L' || slot[0] === 'I') brandBillboard(ctx, slot.length > 1 ? +slot.slice(1) : 0, vw, h); else partnerBoard(ctx, slot, vw, h, { lh: 0.56, fill: 0.46 });
    ctx.restore();
  };
  function brandBillboard(ctx, k, w, h) {
    ctx.save(); const m = h * 0.12;   // safe margin all round
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
