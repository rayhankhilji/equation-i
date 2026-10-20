// Equation I - redbull 2026 livery (owner: LIVERY-A). Registered with the livery core js/liveries.js, which documents the helpers.
// Coordinates: metres, x forward (nose tip 3.05, front axle 1.75, rear axle -1.85), y up, z right (see liveries/mercedes.js for the
// model landmarks). Oracle Red Bull Racing RB22 (2026 race photos, swarm/f1/liveryA/refs/rbr_*): gloss dark Red Bull blue; sun-yellow
// airbox with the big red charging bull running back over the engine cover; yellow-to-orange nose tip with a red bull; ORACLE big on
// the sidepod, the Red Bull wordmark (red, white keyline) on the sidepod top rear, ROKT by the cockpit, CARLYLE / 1Password / Hard Rock
// on the chassis, indeed / CLEAR / SIEMENS on the floor edge, Ford Racing on the cover rear, the race number in red on a white tag
// by the fin, Mobil 1 + Heineken 0.0 on the rear-wing endplates, ORACLE on the rear wing, Mobil + Pegasus on the front endplates.
(function () {
  const LV = EI.LIVERIES; if (!LV) return;
  const { W, MM } = LV.K;
  // national flag of the car's driver (by code, from EI.SEASON) next to the code on the cockpit side; h = flag height (m).
  // Shared by the LIVERY-A team files (defined once on EI).
  const FLAG = EI.liveryFlag || (EI.liveryFlag = function (g, nat, h) {
    const H = h * 1000, Wd = H * 1.5, x0 = -Wd / 2, y0 = -H / 2; const R = (c, x, y, w, hh) => { g.fillStyle = c; g.fillRect(x0 + x * Wd, y0 + y * H, w * Wd, hh * H); };
    if (nat === 'ITA') { R('#009246', 0, 0, 1 / 3, 1); R('#ffffff', 1 / 3, 0, 1 / 3, 1); R('#ce2b37', 2 / 3, 0, 1 / 3, 1); }
    else if (nat === 'FRA') { R('#0055a4', 0, 0, 1 / 3, 1); R('#ffffff', 1 / 3, 0, 1 / 3, 1); R('#ef4135', 2 / 3, 0, 1 / 3, 1); }
    else if (nat === 'MON') { R('#ce1126', 0, 0, 1, 0.5); R('#ffffff', 0, 0.5, 1, 0.5); }
    else if (nat === 'NED') { R('#ae1c28', 0, 0, 1, 1 / 3); R('#ffffff', 0, 1 / 3, 1, 1 / 3); R('#21468b', 0, 2 / 3, 1, 1 / 3); }
    else if (nat === 'GBR' || nat === 'AUS') {
      const uj = (w, hh) => { g.save(); g.beginPath(); g.rect(x0, y0, w, hh); g.clip(); g.fillStyle = '#012169'; g.fillRect(x0, y0, w, hh);
        g.strokeStyle = '#ffffff'; g.lineWidth = hh * 0.2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + w, y0 + hh); g.moveTo(x0 + w, y0); g.lineTo(x0, y0 + hh); g.stroke();
        g.strokeStyle = '#c8102e'; g.lineWidth = hh * 0.07; g.stroke();
        g.fillStyle = '#ffffff'; g.fillRect(x0 + w * 0.4, y0, w * 0.2, hh); g.fillRect(x0, y0 + hh * 0.333, w, hh * 0.333);
        g.fillStyle = '#c8102e'; g.fillRect(x0 + w * 0.44, y0, w * 0.12, hh); g.fillRect(x0, y0 + hh * 0.4, w, hh * 0.2); g.restore(); };
      if (nat === 'GBR') uj(Wd, H);
      else { g.fillStyle = '#012169'; g.fillRect(x0, y0, Wd, H); uj(Wd / 2, H / 2); g.fillStyle = '#ffffff';
        for (const [sx, sy, r] of [[0.25, 0.75, 0.09], [0.75, 0.25, 0.05], [0.62, 0.5, 0.05], [0.88, 0.45, 0.05], [0.75, 0.82, 0.05]]) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = (i % 2 ? 0.45 : 1) * r * H; g.lineTo(x0 + sx * Wd + Math.cos(a) * rr, y0 + sy * H + Math.sin(a) * rr); } g.fill(); } }
    } else return;
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = H * 0.04; g.strokeRect(x0, y0, Wd, H);
  });
  const natOf = (code) => { const S = EI.SEASON; const d = S && S.drivers && S.drivers.find((v) => v.code === code); return d ? d.nat : null; };
  // real-size placement (measured on the 2026 photos, scale from the 3.6 m wheelbase): a partner logo `w` metres wide (height from its
  // aspect, capped at hMax), and a set-in-code wordmark stretched / condensed to exactly `w` metres at cap height `cap`
  const fitW = (L, id, x, y, w, tone, plate, hMax) => { const I = EI.Ads.partnerInfo ? EI.Ads.partnerInfo(id) : null; const a = (I && I.aspect) || 4; let h = w / a; if (hMax && h > hMax) h = hMax; L.partnerAt(id, x, y, w * (plate ? 1.3 : 1), h * (plate ? 1.3 : 1), tone, plate); };
  const wordW = (L, str, x, y, w, cap, col, st) => { st = st || {}; const g = L.g; g.save(); g.font = (st.it ? 'italic ' : '') + (st.w || 900) + ' ' + (cap * MM).toFixed(1) + 'px ' + (st.ff || '"Titillium Web", Arial, sans-serif');
    const tw = g.measureText(str).width + (st.ls || 0) * cap * MM * (str.length - 1); g.restore(); L.wordmark(str, x, y, cap, col, Object.assign({}, st, { sx: w * MM / Math.max(1, tw) })); };
  const NAVY = '#1c2658', DK = '#0b0d16', YEL = '#ffc906', RED = '#db0a40';
  // a partner logo with a keyline (drawn in `line` tone at 8 offsets, then the logo on top); d = keyline width (m)
  function keyline(L, id, x, y, w, h, tone, line, d) { for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; L.partnerAt(id, x + Math.cos(a) * d, y + Math.sin(a) * d, w, h, line); } L.partnerAt(id, x, y, w, h, tone); }
  // the charging bull facing forward on this side (redbullbull artwork faces right), with a yellow keyline
  function bull(L, x, y, w, h, line) {
    const { k, g } = L; k.at(x, y, () => { g.scale(k.s, 1);
      if (line) for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; EI.Ads.drawPartner(g, 'redbullbull', Math.cos(a) * line * MM, Math.sin(a) * line * MM, w * MM, h * MM, { tone: 'mono:' + YEL }); }
      EI.Ads.drawPartner(g, 'redbullbull', 0, 0, w * MM, h * MM, { tone: 'mono:' + RED }); });
  }
  // Mobil (white lettering, red "o") with an optional boxed "1" (Mobil 1); w x h box (m), centred at the origin
  function mobil(g, w, h, one) {
    const tw = one ? w * 0.78 : w;
    g.save(); if (one) g.translate(-(w - tw) / 2 * MM, 0);
    if (EI.Ads.hasPartner('mobil')) EI.Ads.drawPartner(g, 'mobil', 0, 0, tw * MM, h * MM, { tone: 'whiteKeepRed' });
    else { g.font = '700 ' + (h * 0.9 * MM).toFixed(1) + 'px Arial, Helvetica, sans-serif'; const parts = [['M', W], ['o', '#ef1c25'], ['bil', W]]; const tot = parts.reduce((a, p) => a + g.measureText(p[0]).width, 0); const sc = Math.min(1, tw * MM / tot);
      g.scale(sc, 1); let x = -tot / 2; g.textBaseline = 'middle'; g.textAlign = 'left'; for (const [t, c] of parts) { g.fillStyle = c; g.fillText(t, x, h * 0.05 * MM); x += g.measureText(t).width; } }
    g.restore();
    if (one) { const bx = (w / 2 - h * 0.42) * MM, s = h * 0.8 * MM; g.strokeStyle = W; g.lineWidth = s * 0.09; g.strokeRect(bx - s / 2, -s / 2, s, s); g.fillStyle = W; g.font = '700 ' + (s * 0.8).toFixed(1) + 'px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('1', bx, s * 0.05); }
  }
  // Mobil's red Pegasus (flying horse, facing forward on this side), drawn as a simple silhouette ~0.1 m wide
  function bullOrPegasus(L, x, y) {
    const { k, g } = L; k.at(x, y, () => { g.scale(-k.s, 1); const s = 4.2; g.fillStyle = '#ef1c25'; g.beginPath();
      [[-12, 4], [-6, -2], [0, -2], [6, -10], [14, -14], [8, -6], [12, -4], [16, 0], [10, 2], [6, 2], [4, 8], [8, 14], [4, 14], [0, 8], [-4, 8], [-8, 14], [-12, 14], [-8, 6]].forEach(([a, b], i) => (i ? g.lineTo(a * s, b * s) : g.moveTo(a * s, b * s)));
      g.closePath(); g.fill(); });
  }
  LV.register('redbull', {
    parts: { body: NAVY, fwFlap: NAVY, fwEnd: NAVY, fwTip: NAVY, rwMain: NAVY, rwEnd: NAVY, rwFlap: DK, halo: DK, mirror: NAVY, fin: NAVY },
    num: { ff: '"Titillium Web", Arial, sans-serif', w: 900, it: 1, sx: 0.84, skew: 0.12 },
    halo: { inner: ['@redbullracing', 'visa'] },
    side(L) {
      const { k, g } = L;
      // gloss sheen (a faint woven diagonal) and the darker lower edge
      g.save(); g.globalAlpha = 0.06; for (let x = -2.6; x < 3.2; x += 0.05) k.stroke([[x, -0.1], [x + 0.6, 1.3]], 0.012, '#9fb4ff'); g.restore();
      k.region([[3.15, 0.12], [1.8, 0.2], [0.9, 0.22], [-0.5, 0.2], [-1.6, 0.24]], [[-2.6, -0.1], [3.2, -0.1]], DK);
      // yellow -> orange nose tip with the red bull
      const gr = g.createLinearGradient(k.X(3.1), 0, k.X(2.05), 0); gr.addColorStop(0, YEL); gr.addColorStop(0.7, '#ffb000'); gr.addColorStop(1, '#ff8a00');
      k.region([[2.05, 0.62], [2.15, 0.45], [2.3, 0.33], [2.5, 0.26], [2.8, 0.22]], [[3.12, 0.22], [3.12, 0.62]], gr);
      bull(L, 2.62, 0.36, 0.38, 0.16, 0);
      // sun-yellow airbox, the big bull over the engine cover
      k.poly([[0.1, 1.2], [0.1, 0.86], [-0.36, 0.86], [-0.4, 1.2]], YEL);
      bull(L, -0.64, 0.89, 1.0, 0.36, 0.012);
      // sidepod: ORACLE, Red Bull wordmark; cockpit: ROKT; chassis: CARLYLE / 1Password / Hard Rock
      L.partnerAt('oracle', -0.2, 0.4, 0.9, 0.13, 'white');
      keyline(L, 'redbull', -0.88, 0.57, 0.5, 0.16, 'color', 'white', 0.008);
      wordW(L, 'ROKT', 0.05, 0.76, 0.2, 0.055, W, { w: 900, ls: 0.04 });
      wordW(L, 'CARLYLE', 1.0, 0.62, 0.32, 0.045, W, { ff: 'Georgia, "Times New Roman", serif', w: 700, ls: 0.12 });
      if (EI.Ads.hasPartner('1password')) { L.partnerAt('1password', 0.88, 0.54, 0.04, 0.04, 'white'); wordW(L, '1Password', 1.03, 0.54, 0.22, 0.036, W, { w: 700 }); } else fitW(L, '1password', 1.0, 0.54, 0.24, 'white');
      L.partnerAt('hardrock', 0.6, 0.47, 0.1, 0.05, 'white');
      L.partnerAt('indeed', 0.85, 0.26, 0.24, 0.055, 'white');
      L.wordmark('CLEAR', -0.5, 0.21, 0.03, W, { w: 700, ls: 0.06 }); L.partnerAt('siemens', -0.82, 0.21, 0.2, 0.03, 'white');
      // Ford Racing on the cover rear, race number on a white tag by the fin
      fitW(L, 'ford', -1.28, 0.64, 0.18, 'color'); wordW(L, 'RACING', -1.28, 0.575, 0.18, 0.026, W, { w: 700, ls: 0.12 });
      k.at(-1.3, 0.8, () => { g.fillStyle = W; EI.Ads.rr(g, -80, -72, 160, 144, 14); g.fill(); });
      L.number(-1.3, 0.8, 0.125, RED);
      // front-wing endplates: Mobil + Pegasus; rear-wing endplates: Mobil 1, Heineken 0.0
      k.at(-2.19, 0.85, () => mobil(g, 0.33, 0.075, true));
      L.partnerAt('heineken', -2.17, 0.62, 0.22, 0.06, 'whiteKeepRed');
      L.codeText(1.27, 0.46, 0.036, W); L.car((g, k) => k.at(1.09, 0.46, () => FLAG(g, natOf(L.code), 0.03)));   // per-car (two-pass painting)
      L.haloHandle('redbullracing.com', W, -1); L.haloHandle('@redbullracing', W, 1);
    },
    endplate(L) {   // front-wing endplates (navy): Mobil + the red Pegasus
      const { k, g } = L;
      k.at(2.5, 0.31, () => mobil(g, 0.3, 0.07, false)); bullOrPegasus(L, 2.5, 0.2);
    },
    top(L) {
      const { t, g } = L;
      // nose tip yellow, the number on a white roundel, the sun + bulls on the airbox top / cover
      t.poly([[3.15, -0.2], [3.15, 0.2], [2.4, 0.2], [2.4, -0.2]], YEL);
      t.at(2.1, 0, () => { g.fillStyle = W; EI.Ads.rr(g, -70, -55, 140, 110, 50); g.fill(); });
      L.number(2.1, 0, 0.085, RED);
      L.partnerTop('visa', 1.8, 0, 0.16, 0.05, 'white', Math.PI); L.partnerTop('att', 1.6, 0, 0.16, 0.04, 'white', Math.PI);
      t.poly([[0.1, -0.14], [0.1, 0.14], [-0.36, 0.14], [-0.36, -0.14]], YEL);
      L.partnerTop('oracle', -2.1, 0, 0.85, 0.12, 'white');
      L.partnerTop('ford', -1.25, 0, 0.16, 0.07, 'color');
      L.haloTop('@redbullracing', W, -1); L.haloTop('redbullracing.com', W, 1); L.haloFront('visa', 'white');
    },
  });
  // front-wing main planes (LIVERY-LEAD default from the 2026 photos; a frontWing in the design above takes precedence)
  if (LV.designs['redbull'] && !LV.designs['redbull'].frontWing) LV.designs['redbull'].frontWing = function (L) { L.t.rect(2.15, 3.25, -1.1, 1.1, '#1b2554');  };
})();
