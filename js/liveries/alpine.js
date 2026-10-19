// Equation I - BWT Alpine F1 Team, A526 (2026) livery (owner: LIVERY-B). Registered with the livery core js/liveries.js, which
// documents the helpers (L.partner / partnerAt / emblem / mark / number / codeText / wordmark, L.k side kit, L.t top kit).
// Coordinates: metres, x forward (nose tip 3.0, front axle 1.75, rear axle -1.85), y up, z right.
// Reference: the Barcelona launch (F1.com gallery: hero shots + partner close-ups) and 2026 race photos (CHN, AUS, BEL, ITA; the
// all-pink Austria car was a one-off): metallic Alpine blue body darkening to navy low and at the rear; BWT pink nose top, halo,
// front-wing flaps (navy BWT with a white keyline), rear-wing main plane (same) and the front panels of the rear-wing endplates;
// big pink BWT on the sidepod with MSC (compass rose + serif MSC) ahead of it; enilive (eni dog) on the engine cover; a large pink
// Alpine "A" with a white keyline on the cover tail; white race number on the cover tail; eToro on the nose; Delphi under the
// sidepod; MSC / EURODATACAR white on the carbon rear-wing endplates; "ALPINE" white on the rear wing; businessolver on the halo.
(function () {
  const LV = EI.LIVERIES; if (!LV) return;
  const { TOP_V, LOW_V, W, MM } = LV.K;
  const BL = '#1f56c4', BLL = '#2c73d8', NV = '#15205a', NVD = '#0c1131', PK = '#f78fc3', PKD = '#ec6fae', BK = '#15161a', BN = '#1b2a8c';
  const A = () => EI.Ads;
  const has = (id) => !!(A() && A().hasPartner && A().hasPartner(id));
  function logo(g, id, w, h, tone, fb) {
    if (has(id) || !fb) return LV.partner(g, id, w, h, tone);
    g.save(); g.font = (fb.it ? 'italic ' : '') + (fb.w || 800) + ' 100px ' + fb.ff; const tw = g.measureText(fb.n).width / 100 * (1 + (fb.ls || 0) * 0.6);
    const cap = Math.min(h * 0.86, w / Math.max(0.05, tw)); LV.styledText(g, fb.n, cap, tone === 'white' ? '#ffffff' : tone === 'black' ? '#111214' : fb.col, { ff: fb.ff, w: fb.w, it: fb.it, ls: fb.ls }); g.restore();
  }
  function logoPart(g, id, w, h, tone, f, keyline) {
    if (!has(id)) return false; const a = A().partnerInfo(id).aspect; const pa = a * (f[2] - f[0]) / (f[3] - f[1]);
    const ph = Math.min(h, w / pa) * MM, pw = ph * pa, H = ph / (f[3] - f[1]), Wd = H * a; const cx = (0.5 - (f[0] + f[2]) / 2) * Wd, cy = (0.5 - (f[1] + f[3]) / 2) * H;
    g.save(); g.beginPath(); g.rect(-pw / 2 - ph * 0.1, -ph / 2 - ph * 0.1, pw + ph * 0.2, ph * 1.2); g.clip();
    if (keyline) { const o = ph * 0.045; for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o], [-o * 0.7, -o * 0.7], [o * 0.7, o * 0.7], [-o * 0.7, o * 0.7], [o * 0.7, -o * 0.7]]) A().drawPartner(g, id, cx + dx, cy + dy, Wd, H, { tone: 'mono:' + keyline }); }
    g.beginPath(); g.rect(-pw / 2, -ph / 2, pw, ph); g.clip(); A().drawPartner(g, id, cx, cy, Wd, H, { tone }); g.restore(); return true;
  }
  // BWT letters only (the artwork's "b" water swirl cut off), optionally with a keyline (the navy-on-pink wing lettering)
  const BWT_F = [0.29, 0, 1, 1];
  function bwt(g, w, h, tone, keyline) { if (!logoPart(g, 'bwt', w, h, tone, BWT_F, keyline)) logo(g, 'bwt', w, h, tone); }
  const FB = {
    msc: { n: 'MSC', ff: 'Georgia, "Times New Roman", serif', w: 700, col: '#ffffff', ls: 0.02 },
    enilive: { n: 'enilive', ff: '"Plus Jakarta Sans", "Titillium Web", Arial, sans-serif', w: 700, col: '#ffffff', ls: -0.02 },
    eurodatacar: { n: 'EURODATACAR', ff: '"Titillium Web", Arial, sans-serif', w: 600, col: '#ffffff', ls: 0.06 },
    delphi: { n: 'Delphi', ff: 'Arial, Helvetica, sans-serif', w: 700, col: '#ffffff' },
    avature: { n: 'avature', ff: '"Plus Jakarta Sans", Arial, sans-serif', w: 700, col: '#ffffff' },
    modo: { n: 'MODO CASINO', ff: '"Titillium Web", Arial, sans-serif', w: 900, col: '#ffffff' },
    businessolver: { n: 'businessolver', ff: '"Plus Jakarta Sans", Arial, sans-serif', w: 700, col: '#111214' },
    oakberry: { n: 'OAKBERRY', ff: '"Titillium Web", Arial, sans-serif', w: 900, col: '#ffffff', ls: 0.04 },
    moser: { n: 'MOSER WATCH', ff: 'Georgia, serif', w: 700, col: '#ffffff', ls: 0.08 },
  };
  // MSC: the compass-rose emblem + serif MSC (MSC Cruises' car mark), set in code
  function msc(g, w, h, col) {
    if (has('msc')) return LV.partner(g, 'msc', w, h, col === '#ffffff' ? 'white' : 'color');
    const r = Math.min(h * 0.46, w * 0.13) * MM; const fs = r * 1.75; g.save(); g.font = '700 ' + fs.toFixed(1) + 'px Georgia, "Times New Roman", serif'; const tw = g.measureText('MSC').width;
    const tot = r * 2.3 + tw; g.translate(-tot / 2 + r, 0); g.fillStyle = col; g.strokeStyle = col; g.lineWidth = r * 0.1;
    g.beginPath(); g.arc(0, 0, r * 0.52, 0, 7); g.stroke();
    g.beginPath(); for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8 - Math.PI / 2, rr = i % 2 ? r * 0.42 : (i % 4 ? r * 0.78 : r); g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill();
    g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('MSC', r * 1.3, fs * 0.06); g.restore();
  }
  // the Alpine "A" (team mark): artwork when installed, else two slanted strokes + the arrow cross-bar, pink with a white keyline
  function alpA(g, h, col, key) {
    if (has('alpinef1') && logoPart(g, 'alpinef1', h * 2.9, h, 'mono:' + col, [0.02, 0, 0.98, 0.37], key)) return;
    h *= MM; const w = h * 1.05; const draw = () => { g.beginPath(); g.moveTo(-w * 0.5, h * 0.5); g.lineTo(-w * 0.08, -h * 0.5); g.lineTo(w * 0.14, -h * 0.5); g.lineTo(-w * 0.22, h * 0.5); g.closePath();
      g.moveTo(w * 0.06, h * 0.5); g.lineTo(w * 0.26, -h * 0.02); g.lineTo(w * 0.5, h * 0.5); g.closePath(); g.moveTo(-w * 0.32, h * 0.14); g.lineTo(w * 0.36, h * 0.14); g.lineTo(w * 0.3, h * 0.27); g.lineTo(-w * 0.37, h * 0.27); g.closePath(); };
    if (key) { draw(); g.lineWidth = h * 0.09; g.lineJoin = 'round'; g.strokeStyle = key; g.stroke(); } draw(); g.fillStyle = col; g.fill();
  }
  LV.register('alpine', {
    parts: { body: BL, fwFlap: PK, fwEnd: BK, fwTip: PK, rwMain: PK, rwEnd: BK, rwFlap: BK, halo: PK, mirror: BK, fin: NV },
    num: { ff: '"Titillium Web", Arial, sans-serif', w: 700, ls: 0.02 },
    halo: { inner: ['businessolver', '@AlpineF1Team'] },
    side(L) {
      const { k, g } = L;
      // body: Alpine blue on top, deepening to navy low down and towards the tail (the paint's metallic flop)
      const gv = g.createLinearGradient(0, k.Y(0.95), 0, k.Y(0.15)); gv.addColorStop(0, BLL); gv.addColorStop(0.35, BL); gv.addColorStop(0.75, '#173e9c'); gv.addColorStop(1, NV);
      k.poly([[3.2, TOP_V], [3.2, LOW_V], [-1.88, LOW_V], [-1.88, TOP_V]], gv);
      const gt = g.createLinearGradient(k.X(-0.6), 0, k.X(-1.8), 0); gt.addColorStop(0, 'rgba(18,26,74,0)'); gt.addColorStop(1, 'rgba(12,17,49,0.45)');
      k.poly([[-0.6, TOP_V], [-0.6, LOW_V], [-1.88, LOW_V], [-1.88, TOP_V]], gt);
      // pink nose top: the upper band of the nose / chassis side from the tip back to the cockpit
      k.region([[3.2, 0.25], [2.7, 0.31], [2.2, 0.41], [1.7, 0.5], [1.3, 0.56], [1.05, 0.6]], [[1.0, TOP_V], [3.2, TOP_V]], PK);
      k.stroke([[3.15, 0.25], [2.7, 0.31], [2.2, 0.41], [1.7, 0.5], [1.3, 0.56], [1.05, 0.6]], 0.008, PKD);
      // carbon floor edge
      k.region([[3.2, 0.13], [0.8, 0.14], [-0.6, 0.15], [-2.0, 0.17]], [[-2.6, LOW_V], [3.2, LOW_V]], BK);
      // big pink BWT on the sidepod, MSC ahead of it, Delphi under it
      k.at(-0.34, 0.41, () => bwt(g, 0.92, 0.28, 'mono:#ff9fd2'));
      k.at(0.4, 0.56, () => msc(g, 0.5, 0.12, '#ffffff'));
      k.at(-0.1, 0.21, () => logo(g, 'delphi', 0.22, 0.055, 'white', FB.delphi));
      // engine cover: enilive (the eni artwork + "live"), the small partners row under it; the pink A on the tail; the number
      k.at(-0.36, 0.885, () => (has('eni') ? LV.partner(g, 'eni', 0.36, 0.085, 'white') : logo(g, 'enilive', 0.5, 0.11, 'white', FB.enilive)));   // eni (six-legged dog) white
      k.at(-0.2, 0.705, () => logo(g, 'avature', 0.2, 0.045, 'white', FB.avature));
      L.partnerAt('mercadolibre', -0.6, 0.705, 0.14, 0.05, 'white');
      k.at(0.1, 0.705, () => logo(g, 'modo', 0.17, 0.045, 'white', FB.modo));
      k.at(-1.0, 0.6, () => alpA(g, 0.24, PK, '#ffffff'));   // the big pink A (keylined) at the cover / sidepod tail
      L.number(-1.4, 0.74, 0.1, '#ffffff');
      L.codeText(1.42, 0.535, 0.04, '#ffffff');
      // nose: eToro (white, on the blue under the pink band), the Alpine A at the tip
      L.partnerAt('etoro', 2.0, 0.39, 0.3, 0.06, 'white');
      k.at(2.88, 0.24, () => alpA(g, 0.05, '#ffffff'));
      k.at(1.3, 0.48, () => logo(g, 'moser', 0.2, 0.025, 'white', FB.moser));
      // rear-wing endplate: pink front panel with eni (black), MSC + EURODATACAR white on the carbon
      k.poly([[-1.88, 1.1], [-1.88, 0.4], [-2.6, 0.4], [-2.6, 1.1]], BK); k.poly([[-1.88, 1.06], [-1.88, 0.72], [-2.3, 0.72], [-2.3, 1.06]], PK);
      L.partnerAt('eni', -2.09, 0.89, 0.34, 0.13, 'black');
      k.at(-2.12, 0.62, () => msc(g, 0.3, 0.075, '#ffffff'));
      k.at(-2.12, 0.53, () => logo(g, 'eurodatacar', 0.3, 0.036, 'white', FB.eurodatacar));
      // halo (pink): businessolver along the side
      L.haloSide('businessolver', '#16171b', { ff: '"Plus Jakarta Sans", Arial, sans-serif', w: 700 });
    },
    // front-wing endplates (own pass): carbon with OAKBERRY / businessolver / eni white, the pink foot
    endplate(L) {
      const { k, g } = L;
      k.poly([[3.2, 0.0], [3.2, 0.6], [2.0, 0.6], [2.0, 0.0]], BK); k.poly([[3.2, 0.0], [3.2, 0.17], [2.0, 0.17], [2.0, 0.0]], PK);
      k.at(2.52, 0.36, () => logo(g, 'oakberry', 0.34, 0.06, 'white', FB.oakberry));
      k.at(2.52, 0.27, () => logo(g, 'businessolver', 0.34, 0.05, 'white', FB.businessolver));
      L.partnerAt('eni', 2.52, 0.205, 0.12, 0.04, 'white');
    },
    top(L) {
      const { t, g } = L; const ALONG = -Math.PI / 2;
      // blue body from above, navy at the tail; pink nose top from the tip to the cockpit
      t.poly([[-0.8, -0.5], [-0.8, 0.5], [-1.9, 0.25], [-1.9, -0.25]], '#16378e');
      t.poly([[3.1, -0.075], [3.1, 0.075], [2.4, 0.1], [1.6, 0.15], [1.0, 0.2], [0.85, 0.2], [0.85, -0.2], [1.0, -0.2], [1.6, -0.15], [2.4, -0.1]], PK);
      t.poly([[3.1, -0.05], [3.1, 0.05], [2.9, 0.06], [2.9, -0.06]], BL);
      t.at(3.0, 0, () => alpA(g, 0.05, '#ffffff'), -Math.PI / 2);
      // nose: the partner column + ALPINE spaced along the top
      t.at(2.66, 0, () => logo(g, 'eni', 0.1, 0.035, 'black'), ALONG);
      t.at(2.5, 0, () => msc(g, 0.11, 0.03, '#1b2a8c'), ALONG);
      L.partnerTop('pirelli', 2.36, 0, 0.12, 0.03, 'color', ALONG);
      t.at(2.18, 0, () => bwt(g, 0.12, 0.045, 'mono:' + BN), ALONG);
      L.wordmark('ALPINE', 1.6, 0, 0.05, BN, { ff: '"Titillium Web", Arial, sans-serif', w: 600, ls: 0.5 }, true);
      L.wordmark(String(L.num), 1.15, 0, 0.09, BN, { ff: '"Titillium Web", Arial, sans-serif', w: 700 }, true);
      // sidepod tops: MSC; engine cover: enilive along the spine; rear wing: pink with navy BWT (white keyline)
      for (const s of [-1, 1]) { t.at(0.15, s * 0.45, () => msc(g, 0.3, 0.07, '#ffffff')); }
      t.at(-0.55, 0, () => (has('eni') ? LV.partner(g, 'eni', 0.36, 0.1, 'white') : logo(g, 'enilive', 0.42, 0.08, 'white', FB.enilive)), ALONG);
      for (const s of [-1, 1]) t.at(-2.08, s * 0.28, () => bwt(g, 0.42, 0.1, 'mono:' + BN, '#ffffff'));
      L.wordmark('ALPINE', -2.22, 0, 0.04, '#ffffff', { ff: '"Titillium Web", Arial, sans-serif', w: 600, ls: 0.45 });
      // front-wing flaps: navy BWT with the white keyline on the pink
      for (const s of [-1, 1]) t.at(2.72, s * 0.62, () => bwt(g, 0.3, 0.085, 'mono:' + BN, '#ffffff'));
      // halo (pink): the team handle + businessolver; BWT where the arms meet
      L.haloTop('@AlpineF1Team', BN, -1, { w: 700 }, 0.03); L.haloTop('businessolver', '#16171b', 1, { ff: '"Plus Jakarta Sans", Arial, sans-serif', w: 700 }, 0.03);
      L.haloFront('bwt', 'mono:' + BN);
    },
  });
  // front-wing main planes (LIVERY-LEAD default from the 2026 photos; a frontWing in the design above takes precedence)
  if (LV.designs['alpine'] && !LV.designs['alpine'].frontWing) LV.designs['alpine'].frontWing = function (L) { L.t.rect(2.15, 3.25, -1.1, 1.1, '#0a5fc0');  };
})();
