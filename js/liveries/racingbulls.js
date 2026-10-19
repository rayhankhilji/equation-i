// Equation I - Visa Cash App Racing Bulls, VCARB 03 (2026) livery (owner: LIVERY-B). Registered with the livery core js/liveries.js,
// which documents the helpers (L.partner / partnerAt / emblem / mark / number / codeText / wordmark, L.k side kit, L.t top kit).
// Coordinates: metres, x forward (nose tip 3.0, front axle 1.75, rear axle -1.85), y up, z right.
// Reference: the Detroit launch studio shots (F1.com gallery, side / top / 3/4) and 2026 race photos (CHN, AUT, BEL, ITA):
//   gloss white car; a deep navy band that starts thin at the cockpit and widens along the sidepod into the dark tail; a white
//   blade under it carrying the big navy VISA; navy / carbon sidepod undercut; yellow nose tip and yellow airbox ("sun") with the
//   red Red Bull bull charging rearwards on both (on both sides of the car); "Red Bull" red under the cover bull; Cash App ($ badge
//   + wordmark) on the cockpit shoulder, front-wing endplates (black on white) and the DRS flap; HUGO red and Mobil (white on the
//   carbon chassis) ahead of the sidepod; Ford RACING on the cover tail; red italic race number on the cover tail; navy rear-wing
//   endplates with the VISA RB team mark, TUDOR on the rear-wing main plane; halo carbon with HUGO / VISA.
(function () {
  const LV = EI.LIVERIES; if (!LV) return;
  const { TOP_V, LOW_V, W, MM } = LV.K;
  const NV = '#1b2563', NVD = '#10153a', BK = '#16171b', YL = '#ffcc00', YO = '#f6a400', RED = '#db0a40', HUGO_RED = '#e4002b', WH = '#f3f4f6';
  const A = () => EI.Ads;
  const has = (id) => !!(A() && A().hasPartner && A().hasPartner(id));
  // partner art when installed, else a faithful set wordmark (fb = { n, ff, w, col, it, ls }) fitted in w x h (metres)
  function logo(g, id, w, h, tone, fb) {
    if (has(id) || !fb) return LV.partner(g, id, w, h, tone);
    g.save(); g.font = (fb.it ? 'italic ' : '') + (fb.w || 800) + ' 100px ' + fb.ff; const tw = g.measureText(fb.n).width / 100 * (1 + (fb.ls || 0) * 0.6);
    const cap = Math.min(h * 0.86, w / Math.max(0.05, tw)); LV.styledText(g, fb.n, cap, tone === 'white' ? '#ffffff' : tone === 'black' ? '#111214' : fb.col, { ff: fb.ff, w: fb.w, it: fb.it, ls: fb.ls }); g.restore();
  }
  // a part of an artwork (fractions of its trimmed box) fitted into w x h: TUDOR shield / wordmark of the stacked logo
  function logoPart(g, id, w, h, tone, f) {
    if (!has(id)) return false; const a = A().partnerInfo(id).aspect; const pa = a * (f[2] - f[0]) / (f[3] - f[1]);
    const ph = Math.min(h, w / pa) * MM, pw = ph * pa, H = ph / (f[3] - f[1]), Wd = H * a;
    g.save(); g.beginPath(); g.rect(-pw / 2, -ph / 2, pw, ph); g.clip(); A().drawPartner(g, id, (0.5 - (f[0] + f[2]) / 2) * Wd, (0.5 - (f[1] + f[3]) / 2) * H, Wd, H, { tone }); g.restore(); return true;
  }
  const FB = {
    hugo: { n: 'HUGO', ff: '"Plus Jakarta Sans", "Titillium Web", Arial, sans-serif', w: 800, col: HUGO_RED, ls: 0.04 },
    mobil: { n: 'Mobil', ff: 'Arial, Helvetica, sans-serif', w: 900, col: '#ffffff' },
    confluent: { n: 'CONFLUENT', ff: '"Plus Jakarta Sans", Arial, sans-serif', w: 700, col: '#111214', ls: 0.12 },
    octave: { n: 'OCTAVE', ff: '"Plus Jakarta Sans", Arial, sans-serif', w: 800, col: '#ffffff', ls: 0.06 },
    yugo: { n: 'vugo', ff: '"Plus Jakarta Sans", Arial, sans-serif', w: 700, col: '#111214' },
    neft: { n: 'NEFT', ff: 'Arial, sans-serif', w: 900, col: '#111214', ls: 0.1 },
  };
  // "Mobil" with its red o, set in code until the Mobil artwork is installed (white letters on the carbon chassis)
  function mobil(g, w, h, col) {
    if (has('mobil')) {   // the white wordmark with its red "o" kept (as on the carbon chassis)
      const asp = A().partnerInfo('mobil').aspect; const hh = Math.min(h, w / asp) * MM, ww = hh * asp; A().drawPartner(g, 'mobil', 0, 0, ww, hh, { tone: col === '#ffffff' ? 'white' : 'color' });
      g.save(); g.beginPath(); g.rect(-ww / 2 + ww * 0.33, -hh / 2, ww * 0.26, hh); g.clip(); A().drawPartner(g, 'mobil', 0, 0, ww, hh, { tone: 'color' }); g.restore(); return; }
    g.save(); g.font = '900 100px Arial, Helvetica, sans-serif'; const tw = g.measureText('Mobil').width / 100; const cap = Math.min(h * 0.86, w / tw); const fs = cap * MM;
    g.font = '900 ' + fs.toFixed(1) + 'px Arial, Helvetica, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left'; let x = -tw * fs / 2;
    for (const ch of 'Mobil') { g.fillStyle = ch === 'o' ? '#e4002b' : col; g.fillText(ch, x, fs * 0.04); x += g.measureText(ch).width; } g.restore();
  }
  // "$ Cash App": the green badge (artwork) + the wordmark, as on the cockpit shoulders and the nose
  function cashApp(g, w, h, col, badge) {
    const ff = '"Plus Jakarta Sans", "Titillium Web", Arial, sans-serif'; g.save(); g.font = '700 100px ' + ff; const tw = g.measureText('Cash App').width / 100;
    const cap = Math.min(h * 0.72, w / (tw + (badge ? 1.45 : 0))); const bw = badge ? cap * 1.3 : 0; const total = tw * cap + (badge ? bw + cap * 0.3 : 0);
    if (badge) { const bx = -total / 2 + bw / 2; g.save(); g.translate(bx * MM, 0); LV.partner(g, 'cashapp', bw, bw, 'color'); g.restore(); }
    g.translate((total / 2 - tw * cap / 2) * MM, 0); LV.styledText(g, 'Cash App', cap, col, { ff, w: 700 }); g.restore();
  }
  // the VISA RB team mark on the rear-wing endplates (VISA / RB / bull / $ Cash App / HUGO, stacked), h = total height (m)
  function teamStack(g, h) {
    const u = h / 1.0; g.save();
    g.save(); g.translate(0, -u * 0.38 * MM); LV.partner(g, 'visa', u * 0.42, u * 0.12, 'white'); g.restore();
    g.save(); g.translate(0, -u * 0.22 * MM); LV.styledText(g, 'RB', u * 0.17, '#ffffff', { ff: '"Unbounded", "Titillium Web", Arial, sans-serif', w: 800, sx: 0.9 }); g.restore();
    g.save(); g.translate(0, -u * 0.04 * MM); bull(g, u * 0.3, u * 0.15); g.restore();
    g.save(); g.translate(0, u * 0.12 * MM); cashApp(g, u * 0.4, u * 0.08, '#ffffff', true); g.restore();
    g.save(); g.translate(0, u * 0.3 * MM); logo(g, 'hugo', u * 0.32, u * 0.09, 'white', FB.hugo); g.restore();
    g.restore();
  }
  // the charging bull (Red Bull artwork, head to the right), fitted in w x h; flip = mirror so the head points left
  function bull(g, w, h, flip, tone) {
    g.save(); if (flip) g.scale(-1, 1);
    if (has('redbullbull')) LV.partner(g, 'redbullbull', w, h, tone || 'color'); else LV.EMBLEM.bullMark(g, Math.min(w, h * 1.8)); g.restore();
  }
  LV.register('racingbulls', {
    parts: { body: WH, fwFlap: WH, fwEnd: WH, fwTip: NV, rwMain: WH, rwEnd: NVD, rwFlap: BK, halo: BK, mirror: BK, fin: NV },
    num: { ff: '"Titillium Web", Arial, sans-serif', w: 900, it: 1, sx: 0.92, skew: 0.1, outline: [0.012, '#ffffff'] },
    halo: { inner: ['@visacashapprb', 'hugo', 'visa'] },
    side(L) {
      const { k, g } = L; const flip = k.s > 0;   // the bulls charge rearwards on both sides
      // carbon / black lower chassis from the nose underside to the sidepod inlet (Mobil sits on it in white)
      k.region([[3.2, 0.17], [2.6, 0.27], [2.0, 0.37], [1.5, 0.46], [1.2, 0.52], [0.98, 0.56], [0.8, 0.555], [0.74, 0.3], [0.62, 0.13]], [[0.62, LOW_V], [3.2, LOW_V]], BK);
      // yellow nose tip (orange at the very tip) with a navy keel line under it
      const gy = g.createLinearGradient(k.X(3.05), 0, k.X(2.3), 0); gy.addColorStop(0, YO); gy.addColorStop(0.45, YL); gy.addColorStop(1, '#ffd84a');
      // (the front-wing endplate, x 2.3..2.78, shares this side view with the nose: it stays white for its Cash App, so the yellow is
      //  painted ahead of it (nose tip) and behind it (nose flank), where the endplate does not cover the nose)
      k.region([[3.2, 0.2], [2.8, 0.27], [2.45, 0.34], [2.25, 0.38]], [[2.05, 0.6], [2.05, TOP_V], [3.2, TOP_V]], gy);
      k.stroke([[3.15, 0.19], [2.8, 0.255], [2.45, 0.325], [2.1, 0.385], [1.6, 0.47], [1.2, 0.53], [1.0, 0.56]], 0.026, NV);
      // thin navy line along the chassis shoulder towards HUGO
      k.stroke([[1.85, 0.6], [1.5, 0.585], [1.2, 0.565]], 0.018, NV);
      // the navy band (starts at the cockpit, widens backwards into the dark tail) and the white VISA blade under it
      const BAND_UP = [[0.95, 0.6], [0.5, 0.65], [0.0, 0.645], [-0.5, 0.615], [-0.9, 0.615], [-1.15, 0.66], [-1.6, 0.8]];
      const BLADE_UP = [[-1.3, 0.3], [-1.0, 0.43], [-0.6, 0.51], [-0.2, 0.555], [0.3, 0.58], [0.7, 0.585], [0.95, 0.585]];
      const BLADE_LO = [[0.95, 0.58], [0.75, 0.42], [0.5, 0.3], [0.1, 0.24], [-0.4, 0.2], [-0.85, 0.2], [-1.1, 0.23], [-1.3, 0.3]];
      const gn = g.createLinearGradient(k.X(0.9), 0, k.X(-1.6), 0); gn.addColorStop(0, NV); gn.addColorStop(0.6, NV); gn.addColorStop(1, NVD);
      k.curve(BAND_UP, [[-1.75, 0.86], [-2.6, 0.86], [-2.6, 0.13], [-1.3, 0.13]]); g.closePath(); g.fillStyle = gn; g.fill();   // band + tail + undercut (navy)
      k.curve(BLADE_UP.concat(BLADE_LO.slice(1))); g.closePath(); g.fillStyle = WH; g.fill();                                   // white blade
      // sidepod undercut and floor edge: navy fading to carbon
      const gu = g.createLinearGradient(0, k.Y(0.24), 0, k.Y(0.12)); gu.addColorStop(0, NV); gu.addColorStop(0.5, NV); gu.addColorStop(1, BK);
      k.region(BLADE_LO.slice().reverse().concat([[0.95, 0.5]]), [[0.75, 0.13], [-1.4, 0.13]], gu);
      k.region([[0.9, 0.13], [-1.4, 0.13], [-2.6, 0.13]], [[-2.6, LOW_V], [0.9, LOW_V]], BK);
      // engine cover: yellow airbox "sun" fading into the white, the dark tail behind the bull
      const ga = g.createRadialGradient(k.X(-0.18), k.Y(0.98), 10, k.X(-0.18), k.Y(0.98), 420); ga.addColorStop(0, YL); ga.addColorStop(0.55, '#ffc400'); ga.addColorStop(0.8, 'rgba(255,196,0,0.55)'); ga.addColorStop(1, 'rgba(255,196,0,0)');
      k.poly([[0.12, TOP_V], [0.12, 0.8], [-0.1, 0.74], [-0.75, 0.74], [-0.75, TOP_V]], ga);
      k.poly([[-1.0, TOP_V], [-1.0, 0.86], [-1.12, 0.78], [-1.75, 0.8], [-1.75, TOP_V]], NVD);
      // logos
      L.partnerAt('redbull', -0.66, 0.65, 0.44, 0.085, 'color');                       // "Red Bull" red under the cover bull
      k.at(-0.66, 0.85, () => bull(g, 0.66, 0.33, flip));   // bull aspect ~1.9: 0.63 x 0.33 m as measured                                  // the big cover bull, charging rearwards
      k.at(2.26, 0.375, () => bull(g, 0.34, 0.11, flip));                                 // the nose bull
      k.at(0.02, 0.7, () => cashApp(g, 0.46, 0.09, '#16171b', true));                  // $ Cash App on the cockpit shoulder
      k.at(1.08, 0.61, () => logo(g, 'hugo', 0.34, 0.085, 'color', FB.hugo));            // HUGO red ahead of the sidepod
      k.at(1.04, 0.47, () => mobil(g, 0.26, 0.08, '#ffffff'));                          // Mobil (white) on the carbon chassis side
      L.partnerAt('visa', -0.3, 0.38, 0.7, 0.2, 'mono:' + NV);                         // VISA navy on the white blade
      L.partnerAt('ford', -1.18, 0.56, 0.25, 0.085, 'color');                              // Ford oval + RACING on the navy tail
      L.wordmark('RACING', -1.18, 0.49, 0.036, '#ffffff', { ff: '"Titillium Web", Arial, sans-serif', w: 700, ls: 0.12 });
      k.at(1.0, 0.33, () => { g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, 0.05 * MM, 0, 7); g.fill(); logo(g, 'yugo', 0.075, 0.032, 'black', FB.yugo); });
      k.at(0.78, 0.3, () => logo(g, 'octave', 0.2, 0.04, 'white', FB.octave));
      L.number(-1.26, 0.84, 0.12, '#e1001a');                                            // red italic number, white keyline, on the tail
      L.codeText(1.42, 0.535, 0.04, '#ffffff');
      // front-wing endplate (white): Cash App black; rear-wing endplate (navy): the VISA RB stack
      k.at(-2.13, 0.72, () => teamStack(g, 0.56));
      // halo side (carbon): small white partner text
      L.haloSide('vugo.com', '#ffffff', { w: 700 });
    },
    // front-wing endplates (their own pass: the nose's yellow stays off them): white, Cash App in black, carbon foot
    endplate(L) {
      const { k, g } = L;
      k.poly([[3.2, 0.0], [3.2, 0.6], [2.0, 0.6], [2.0, 0.0]], WH); k.poly([[3.2, 0.0], [3.2, 0.1], [2.0, 0.1], [2.0, 0.0]], BK);
      k.at(2.5, 0.27, () => cashApp(g, 0.42, 0.11, '#16171b', false));
    },
    top(L) {
      const { t, g } = L; const ALONG = -Math.PI / 2;   // text along the car, glyph tops to the car's left (as the nose 30 / VISA)
      // yellow nose tip (and the nose bull's flanks), Ford oval on the tip
      t.poly([[3.1, -0.12], [3.1, 0.12], [2.45, 0.11], [2.36, 0.07], [2.36, -0.07], [2.45, -0.11]], YL);
      t.poly([[3.1, -0.06], [3.1, 0.06], [2.95, 0.05], [2.95, -0.05]], YO);
      for (const s of [-1, 1]) t.poly([[2.74, s * 0.075], [2.4, s * 0.1], [2.38, s * 0.13], [2.74, s * 0.13]], RED);   // bull flanks seen from above
      L.partnerTop('ford', 2.98, 0, 0.07, 0.035, 'color', ALONG);
      // navy keel lines along the nose and chassis edges, navy tail of the engine cover
      for (const s of [-1, 1]) t.poly([[2.36, s * 0.105], [1.0, s * 0.17], [1.0, s * 0.19], [2.36, s * 0.125]], NV);
      t.poly([[-1.15, -0.32], [-1.15, 0.32], [-1.9, 0.18], [-1.9, -0.18]], NV);
      // the big cover bull from above: the two flanks' bulls meet over the spine, on the yellow airbox sun
      const ga = g.createRadialGradient(0, 0.1 * MM, 10, 0, 0.1 * MM, 330); ga.addColorStop(0, YL); ga.addColorStop(0.6, '#ffc400'); ga.addColorStop(1, 'rgba(255,196,0,0)');
      t.poly([[0.3, -0.33], [0.3, 0.33], [-0.5, 0.33], [-0.5, -0.33]], ga);
      for (const s of [-1, 1]) t.at(-0.5, s * 0.055, () => { g.save(); g.rotate(Math.PI / 2); if (s > 0) g.scale(1, -1); bull(g, 0.7, 0.11); g.restore(); });   // heads to the rear, legs outboard
      // nose: the race number (navy, white keyline) and the partner column, all reading along the car
      L.wordmark(String(L.num), 1.72, 0, 0.22, NV, { ff: '"Titillium Web", Arial, sans-serif', w: 900, it: 1, sx: 0.92, outline: [0.012, '#ffffff'] }, true);
      L.partnerTop('visa', 1.42, -0.035, 0.13, 0.045, 'mono:' + NV, ALONG);
      t.at(1.42, 0.035, () => cashApp(g, 0.12, 0.035, '#16171b', true), ALONG);
      L.partnerTop('dynatrace', 1.28, 0, 0.03, 0.03, 'black', ALONG);
      L.partnerTop('pirelli', 1.2, 0, 0.13, 0.03, 'color', ALONG);
      // chassis ahead of the cockpit: TUDOR, VISA / Cash App, Red Bull + bull
      t.at(1.08, 0, () => logoPart(g, 'tudor', 0.13, 0.04, 'black', [0, 0.62, 1, 1]), ALONG);
      L.partnerTop('visa', 0.96, -0.03, 0.12, 0.04, 'mono:' + NV, ALONG);
      L.partnerTop('redbull', 0.86, 0, 0.16, 0.04, 'color', ALONG);
      // sidepod tops: CONFLUENT (black), the white panels; Cash App badges by the cockpit
      for (const s of [-1, 1]) { L.t.at(-0.3, s * 0.4, () => logo(g, 'confluent', 0.34, 0.05, 'black', FB.confluent), 0); L.partnerTop('cashapp', 0.42, s * 0.36, 0.05, 0.05, 'color', 0); }
      // rear wing: white main plane with TUDOR (shield + wordmark) on each half; the DRS flap carries Cash App in white
      for (const s of [-1, 1]) { t.at(-2.04, s * 0.27, () => logoPart(g, 'tudor', 0.34, 0.07, 'black', [0, 0.62, 1, 1])); t.at(-2.04, s * 0.5, () => logoPart(g, 'tudor', 0.05, 0.06, 'color', [0.3, 0, 0.7, 0.42])); }
      t.at(-2.2, -0.12, () => cashApp(g, 0.6, 0.1, '#ffffff', false)); L.partnerTop('cashapp', -2.2, 0.38, 0.09, 0.09, 'color', 0);
      // front-wing flaps: HUGO + Red Bull red on white, Cash App on the outer (carbon) tips
      for (const s of [-1, 1]) { t.at(2.72, s * 0.62, () => logo(g, 'hugo', 0.2, 0.06, 'color', FB.hugo)); L.partnerTop('redbull', 2.62, s * 0.66, 0.2, 0.05, 'color', 0); L.partnerTop('cashapp', 2.8, s * 0.9, 0.05, 0.05, 'color', 0); }
      // halo: HUGO on both arms, VISA where they meet
      L.haloTop('HUGO', '#ffffff', -1, { ff: '"Plus Jakarta Sans", Arial, sans-serif', w: 800 }, 0.035); L.haloTop('HUGO', '#ffffff', 1, { ff: '"Plus Jakarta Sans", Arial, sans-serif', w: 800 }, 0.035);
      L.haloFront('visa', 'white');
    },
  });
  // front-wing main planes (LIVERY-LEAD default from the 2026 photos; a frontWing in the design above takes precedence)
  if (LV.designs['racingbulls'] && !LV.designs['racingbulls'].frontWing) LV.designs['racingbulls'].frontWing = function (L) { L.t.rect(2.15, 3.25, -1.1, 1.1, '#f4f6fa');  };
})();
