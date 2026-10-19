// Equation I - TGR Haas F1 Team, VF-26 (2026) livery (owner: LIVERY-B). Registered with the livery core js/liveries.js, which documents
// the helpers (L.partner / partnerAt / emblem / mark / number / codeText / wordmark, L.k side kit, L.t top kit).
// Coordinates: metres, x forward (nose tip 3.0, front axle 1.75, rear axle -1.85), y up, z right.
// Reference: the launch renders (F1.com gallery, 8 angles incl. close-ups of the HAAS wordmark, airbox and halo) and 2026 race
// photos (AUS, AUT, GBR, BEL, ITA): gloss white car with a carbon-black lower body and tail; the giant black slashed HAAS wordmark
// across the sidepod; the giant Gazoo Racing GR on the engine cover (G black, R red); red airbox with RUCKUS NETWORKS; red nose band
// with Mphasis; a red / black slash along the sidepod shoulder; ORION180 INSURANCE and FIX NETWORK by the cockpit, ZOOMEX on the
// carbon under the inlet; black race number + Stars and Stripes on the nose; white rear-wing endplates (Play'n GO, SINGHA), red rear
// wing with the white HAAS wordmark; white front-wing flaps with the GR; white halo with the HAAS wordmark and partners.
(function () {
  const LV = EI.LIVERIES; if (!LV) return;
  const { TOP_V, LOW_V, W, MM } = LV.K;
  const WH = '#f6f6f4', BK = '#141518', RD = '#e10a17', RDD = '#b5000f';
  const A = () => EI.Ads;
  const has = (id) => !!(A() && A().hasPartner && A().hasPartner(id));
  function logo(g, id, w, h, tone, fb) {
    if (has(id) || !fb) return LV.partner(g, id, w, h, tone);
    g.save(); g.font = (fb.it ? 'italic ' : '') + (fb.w || 800) + ' 100px ' + fb.ff; const tw = g.measureText(fb.n).width / 100 * (1 + (fb.ls || 0) * 0.6);
    const cap = Math.min(h * 0.86, w / Math.max(0.05, tw)); LV.styledText(g, fb.n, cap, tone === 'white' ? '#ffffff' : tone === 'black' ? '#111214' : fb.col, { ff: fb.ff, w: fb.w, it: fb.it, ls: fb.ls }); g.restore();
  }
  function logoPart(g, id, w, h, tone, f) {
    if (!has(id)) return false; const a = A().partnerInfo(id).aspect; const pa = a * (f[2] - f[0]) / (f[3] - f[1]);
    const ph = Math.min(h, w / pa) * MM, pw = ph * pa, H = ph / (f[3] - f[1]), Wd = H * a;
    g.save(); g.beginPath(); g.rect(-pw / 2, -ph / 2, pw, ph); g.clip(); A().drawPartner(g, id, (0.5 - (f[0] + f[2]) / 2) * Wd, (0.5 - (f[1] + f[3]) / 2) * H, Wd, H, { tone }); g.restore(); return true;
  }
  // two-tone text (e.g. ORION + 180) fitted in w x h
  function twoTone(g, a, ca, b, cb, w, h, ff, wt, sub, csub) {
    g.save(); g.font = wt + ' 100px ' + ff; const ta = g.measureText(a).width / 100, tb = g.measureText(b).width / 100; const cap = Math.min(h * (sub ? 0.62 : 0.86), w / (ta + tb)); const fs = cap * MM;
    g.font = wt + ' ' + fs.toFixed(1) + 'px ' + ff; g.textBaseline = 'middle'; g.textAlign = 'left'; const x0 = -(ta + tb) * fs / 2, y0 = sub ? -h * 0.14 * MM : 0;
    g.fillStyle = ca; g.fillText(a, x0, y0); g.fillStyle = cb; g.fillText(b, x0 + ta * fs, y0);
    if (sub) { g.translate(0, h * 0.32 * MM); LV.styledText(g, sub, h * 0.2, csub, { ff, w: 600, ls: 0.4 }); } g.restore();
  }
  const FB = {
    ruckus: { n: 'RUCKUS', ff: '"Titillium Web", Arial, sans-serif', w: 900, col: '#ffffff', ls: 0.02 },
    zoomex: { n: 'ZOOMEX', ff: '"Unbounded", "Titillium Web", Arial, sans-serif', w: 800, col: '#ffffff', ls: 0.04 },
    mphasis: { n: 'Mphasis', ff: '"Plus Jakarta Sans", Arial, sans-serif', w: 700, col: '#ffffff' },
    singha: { n: 'SINGHA', ff: 'Georgia, "Times New Roman", serif', w: 700, col: '#111214', ls: 0.1 },
    ic: { n: 'IC', ff: '"Unbounded", Arial, sans-serif', w: 800, col: '#111214', it: 1 },
    uchicago: { n: 'UChicago Medicine', ff: 'Georgia, serif', w: 700, col: '#111214' },
    commscope: { n: 'COMMSCOPE', ff: '"Titillium Web", Arial, sans-serif', w: 700, col: '#111214', ls: 0.08 },
    tooling: { n: 'HAAS TOOLING.com', ff: '"Titillium Web", Arial, sans-serif', w: 900, it: 1, col: RD },
    emburse: { n: 'emburse', ff: '"Plus Jakarta Sans", Arial, sans-serif', w: 700, col: '#111214' },
  };
  // the giant slashed HAAS wordmark (Haas F1 Team's type): italic, the H's cross-bar run out to the left as a long dash, the two A's
  // as open chevrons, the S blocky. h = cap height (m); drawn centred on the origin
  function haasWord(g, h, col) {
    const u = h * MM, t = 0.19 * u, sk = 0.42; g.save(); g.transform(1, 0, -sk, 1, 0, 0); g.fillStyle = col;
    const R = (x, y, w, hh) => g.fillRect(x * u, y * u, w * u, hh * u); const x0 = -1.62;
    R(x0 - 0.55, -0.1, 0.62, t / u);                            // the lead dash (into the H's cross-bar)
    R(x0, -0.5, 0.19, 1); R(x0 + 0.47, -0.5, 0.19, 1); R(x0, -0.1, 0.66, t / u);   // H
    const chev = (cx) => { g.beginPath(); g.moveTo((cx - 0.42) * u, 0.5 * u); g.lineTo((cx - 0.08) * u, -0.5 * u); g.lineTo((cx + 0.14) * u, -0.5 * u); g.lineTo((cx + 0.45) * u, 0.5 * u); g.lineTo((cx + 0.24) * u, 0.5 * u); g.lineTo(cx * 0.995 * u + 0.02 * u, -0.18 * u); g.lineTo((cx - 0.2) * u, 0.5 * u); g.closePath(); g.fill(); };
    chev(x0 + 1.2); chev(x0 + 2.05);
    const sx = x0 + 2.6; g.beginPath();                          // S: three bars + two half verticals
    R(sx, -0.5, 0.6, t / u); R(sx, -0.5, 0.19, 0.55); R(sx, -0.05, 0.6, t / u); R(sx + 0.41, -0.05, 0.19, 0.55); R(sx - 0.05, 0.5 - t / u, 0.65, t / u);
    g.restore();
  }
  // Gazoo Racing GR (G black, R red), artwork when installed, else heavy italic type cut to the GR shapes
  function gr(g, w, h, cG, cR) {
    if (has('tgremblem')) return LV.partner(g, 'tgremblem', w, h, 'color');
    const ff = '"Unbounded", "Titillium Web", Arial, sans-serif'; g.save(); g.font = '800 100px ' + ff; const tg = g.measureText('G').width / 100, tr = g.measureText('R').width / 100;
    const cap = Math.min(h / 0.74, w / ((tg + tr) * 0.94)); const fs = cap * MM; g.font = '800 ' + fs.toFixed(1) + 'px ' + ff; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.transform(1, 0, -0.22, 1, 0, 0); const x0 = -(tg + tr) * 0.94 * fs / 2; g.fillStyle = cG; g.fillText('G', x0, fs * 0.04); g.fillStyle = cR; g.fillText('R', x0 + tg * fs * 0.94, fs * 0.04); g.restore();
  }
  // Play'n GO: the blue pill with PLAY'n and the red GO badge
  function playngo(g, w, h) {
    if (has('playngo')) return LV.partner(g, 'playngo', w, h, 'color');
    const hh = Math.min(h, w / 3.6) * MM, ww = hh * 3.6; g.save(); g.fillStyle = '#1d6ff2'; A().rr(g, -ww / 2, -hh / 2, ww, hh, hh / 2); g.fill();
    g.fillStyle = '#e8112d'; A().rr(g, ww * 0.12, -hh * 0.44, ww * 0.36, hh * 0.88, hh * 0.44); g.fill();
    g.translate(-ww * 0.17, 0); LV.styledText(g, "PLAY'n", hh * 0.5 / MM, '#ffffff', { ff: '"Titillium Web", Arial, sans-serif', w: 900, it: 1 }); g.translate(ww * 0.47, 0); LV.styledText(g, 'GO', hh * 0.62 / MM, '#ffffff', { ff: '"Titillium Web", Arial, sans-serif', w: 900, it: 1 }); g.restore();
  }
  // the Haas circle-H (team emblem, from the TGR Haas F1 Team logo artwork)
  function haasMark(g, d, tone) { if (!logoPart(g, 'haasf1', d, d, tone || 'black', [0.27, 0, 0.73, 0.46])) LV.styledText(g, 'H', d * 0.8, '#111214', { w: 900, it: 1 }); }
  LV.register('haas', {
    parts: { body: WH, fwFlap: WH, fwEnd: WH, fwTip: RD, rwMain: RD, rwEnd: WH, rwFlap: RD, halo: WH, mirror: BK, fin: BK },
    num: { ff: '"Titillium Web", Arial, sans-serif', w: 900, it: 1, sx: 0.9 },
    halo: { inner: ['@HaasF1Team', 'playngo', 'ic'] },
    side(L) {
      const { k, g } = L;
      // carbon lower body: chassis underside, sidepod undercut and the whole tail behind the sidepod
      k.region([[3.2, 0.17], [2.2, 0.28], [1.5, 0.36], [1.05, 0.4], [0.8, 0.3], [0.5, 0.2], [-0.5, 0.2], [-0.85, 0.3], [-1.05, 0.48], [-1.2, 0.66], [-1.32, 0.76]], [[-2.6, 0.76], [-2.6, LOW_V], [3.2, LOW_V]], BK);
      k.poly([[-1.3, TOP_V], [-1.3, 0.7], [-2.6, 0.7], [-2.6, TOP_V]], BK);
      // red nose band (upper nose side, tip to the cockpit) with a black keel under it
      k.region([[3.2, 0.24], [2.7, 0.3], [2.2, 0.39], [1.85, 0.45]], [[1.7, 0.6], [1.7, TOP_V], [3.2, TOP_V]], RD);
      k.stroke([[1.85, 0.6], [1.45, 0.6], [1.1, 0.59]], 0.03, RD); k.stroke([[1.85, 0.575], [1.45, 0.575], [1.12, 0.565]], 0.01, BK);
      // red / black slash along the sidepod shoulder, rising towards the tail
      k.poly([[0.62, 0.59], [-1.05, 0.66], [-1.15, 0.69], [0.62, 0.615]], RD); k.poly([[0.5, 0.575], [-0.9, 0.635], [-0.95, 0.65], [0.5, 0.585]], BK);
      // red airbox (RUCKUS NETWORKS), its red running back under the GR
      k.poly([[0.14, TOP_V], [0.14, 0.82], [-0.05, 0.8], [-0.42, 0.86], [-0.42, TOP_V]], RD);
      k.at(-0.18, 0.89, () => logo(g, 'ruckus', 0.38, 0.075, 'white', FB.ruckus));
      // the giant GR on the engine cover; the giant HAAS on the sidepod
      k.at(-0.8, 0.84, () => gr(g, 0.8, 0.15, BK, RD));
      k.at(-0.22, 0.4, () => haasWord(g, 0.27, BK));
      // cockpit side / sidepod front partners
      k.at(1.1, 0.53, () => twoTone(g, 'ORION', '#111214', '180', RD, 0.36, 0.085, '"Unbounded", "Titillium Web", Arial, sans-serif', 800, 'INSURANCE', '#111214'));
      k.at(0.52, 0.5, () => twoTone(g, 'FIX', '#111214', '', '#111214', 0.15, 0.09, '"Titillium Web", Arial, sans-serif', 900, 'NETWORK', '#111214'));
      k.at(0.74, 0.33, () => logo(g, 'zoomex', 0.3, 0.055, 'white', FB.zoomex));
      k.at(1.05, 0.62, () => logo(g, 'emburse', 0.14, 0.03, 'black', FB.emburse));
      // nose: Mphasis white on the red band, UChicago Medicine under it; race number + code by the cockpit
      k.at(2.45, 0.37, () => logo(g, 'mphasis', 0.3, 0.06, 'white', FB.mphasis));
      k.at(2.05, 0.33, () => logo(g, 'uchicago', 0.2, 0.03, 'black', FB.uchicago));
      L.number(1.62, 0.505, 0.07, BK); L.codeText(1.38, 0.5, 0.04, BK);
      // front-wing endplate (white): HAAS TOOLING red; rear-wing endplate (white): Play'n GO + SINGHA
      k.poly([[-1.88, 1.1], [-1.88, 0.4], [-2.6, 0.4], [-2.6, 1.1]], WH); k.poly([[-1.88, 1.1], [-1.88, 0.98], [-2.6, 0.98], [-2.6, 1.1]], BK);
      k.at(-2.14, 0.88, () => playngo(g, 0.38, 0.1));
      k.at(-2.14, 0.74, () => logo(g, 'singha', 0.34, 0.075, 'black', FB.singha));
      L.wordmark('LEMON SODA', -2.16, 0.69, 0.022, '#111214', { w: 700, ls: 0.2 });
      // halo (white): the HAAS wordmark small on the side, Play'n GO
      L.haloSide('HAAS', '#111214', { it: 1, w: 900 });
    },
    // front-wing endplates (own pass, the red nose band stays off them): white, HAAS TOOLING red with its red speed bars
    endplate(L) {
      const { k, g } = L;
      k.poly([[3.2, 0.0], [3.2, 0.6], [2.0, 0.6], [2.0, 0.0]], WH);
      k.poly([[2.78, 0.15], [2.74, 0.21], [2.32, 0.21], [2.36, 0.15]], RD);
      k.at(2.54, 0.28, () => logo(g, 'haastooling', 0.44, 0.07, 'color', FB.tooling));
    },
    top(L) {
      const { t, g } = L; const ALONG = Math.PI;   // the VF-26 nose column reads from the front
      // tail carbon, red airbox top, the red stripe edges of the sidepods
      t.poly([[-1.35, -0.5], [-1.35, 0.5], [-1.95, 0.3], [-1.95, -0.3]], BK);
      t.poly([[0.14, -0.13], [0.14, 0.13], [-0.45, 0.12], [-0.45, -0.12]], RD);
      // nose: number + flag + Haas emblem + partner column, reading along the car
      t.poly([[3.1, -0.08], [3.1, 0.08], [2.6, 0.095], [2.6, -0.095]], RD);
      L.number(1.8, 0, 0.17, BK);
      t.at(1.56, 0, () => { const w = 0.1 * MM, h = 0.064 * MM; for (let i = 0; i < 7; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#b22234'; g.fillRect(-w / 2, -h / 2 + i * h / 7, w, h / 7); } g.fillStyle = '#3c3b6e'; g.fillRect(-w / 2, -h / 2, w * 0.42, h * 4 / 7); }, ALONG);
      t.at(1.4, 0, () => haasMark(g, 0.11, 'color'), ALONG);
      t.at(1.24, 0, () => logo(g, 'ic', 0.13, 0.055, 'black', FB.ic), ALONG);
      t.at(1.13, 0, () => logo(g, 'zoomex', 0.16, 0.035, 'black', Object.assign({}, FB.zoomex, { col: '#111214' })), ALONG);
      L.partnerTop('pirelli', 1.04, 0, 0.15, 0.032, 'color', ALONG);
      t.at(2.25, 0, () => logo(g, 'mphasis', 0.13, 0.03, 'white', FB.mphasis), ALONG);
      // rear wing: red with the white HAAS; front-wing flaps: the GR in black / red
      t.at(-2.12, 0, () => haasWord(g, 0.1, '#ffffff'));
      for (const s of [-1, 1]) t.at(2.7, s * 0.6, () => gr(g, 0.32, 0.09, BK, RD));
      // halo: the team handle + HAAS, the Haas emblem where the arms meet
      L.haloTop('@HaasF1Team', '#111214', -1, { w: 700 }, 0.03); L.haloTop('HAAS', '#111214', 1, { w: 900, it: 1 }, 0.035);
      t.at(0.76, 0, () => haasMark(g, 0.06, 'color'));
    },
  });
  // front-wing main planes (LIVERY-LEAD default from the 2026 photos; a frontWing in the design above takes precedence)
  if (LV.designs['haas'] && !LV.designs['haas'].frontWing) LV.designs['haas'].frontWing = function (L) { L.t.rect(2.15, 3.25, -1.1, 1.1, '#f4f4f4'); for (const z of [-0.72, 0.72]) L.wordmark('MIC', 2.6, z, 0.09, '#16181c', { w: 900, it: 1, ls: 0.04 }, false, Math.PI); };
})();
