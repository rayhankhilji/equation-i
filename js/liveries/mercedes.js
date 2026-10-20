// Equation I - mercedes 2026 livery (owner: LIVERY-A). Registered with the livery core js/liveries.js, which documents the helpers
// (L.partner / partnerAt / emblem / mark / number / codeText / wordmark, L.k side kit, L.t top kit) and the part colour keys.
// Coordinates: metres, x forward (nose tip 3.05, front axle 1.75, rear axle -1.85), y up, z right. Model landmarks: body y 0.13..1.09,
// cockpit x 0.87..0.02 (rim y ~0.8), airbox top (0.0, 1.09), halo x 1.2..0.02 (top bar y ~0.9), mirrors x 0.7..0.92 / y 0.65..0.79,
// front-wing endplates x 2.29..2.73 / y 0.13..0.5, rear-wing endplates x -1.93..-2.42 / y 0.45..0.99.
// Mercedes-AMG F1 W17 (2026 race photos, swarm/f1/liveryA/refs/mer_*): gloss black car; silver nose and chassis shoulder edged by a
// Petronas-teal stripe; forward-leaning silver pillars on the sidepod boxed by a teal swoosh with PETRONAS under it; a field of small
// silver three-pointed stars over the engine cover; Microsoft / SOLERA on the airbox, TeamViewer on the cover; INEOS / IWC / Microsoft
// on the front-wing endplates; Snapdragon / CrowdStrike / PETRONAS PRIMAX on the rear-wing endplates, PETRONAS on the rear-wing top.
(function () {
  const LV = EI.LIVERIES; if (!LV) return;
  const { TOP_V, LOW_V, W, MM } = LV.K;
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
  const BK = '#0b0c0e', SIL = '#b9bfc5', SIL2 = '#9aa1a8', TEAL = '#00a19c';
  // a small three-pointed star (the Mercedes star without its ring), r = tip radius in metres, at the current origin
  function star3(g, r, col) {
    r *= MM; g.fillStyle = col; g.beginPath();
    for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 3, b = a + Math.PI / 3; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); g.lineTo(Math.cos(b) * r * 0.16, Math.sin(b) * r * 0.16); }
    g.closePath(); g.fill();
  }
  const rnd = (n) => { const s = Math.sin(n * 127.1 + 3.7) * 43758.5453; return s - Math.floor(s); };
  // Microsoft on a dark ground: white wordmark, the four squares in their own colours (white pass, then the colour art clipped to
  // the square mark at the left end)
  function msft(g, w, h) {
    const r = EI.Ads.drawPartner(g, 'microsoft', 0, 0, w * MM, h * MM, { tone: 'white' });
    g.save(); g.beginPath(); g.rect(-r[0] / 2 - 1, -r[1] / 2 - 1, r[1] * 1.02 + 1, r[1] + 2); g.clip();
    EI.Ads.drawPartner(g, 'microsoft', 0, 0, w * MM, h * MM, { tone: 'color' }); g.restore();
  }
  LV.register('mercedes', {
    parts: { body: BK, fwFlap: BK, fwEnd: BK, fwTip: TEAL, rwMain: BK, rwEnd: BK, rwFlap: BK, halo: BK, mirror: TEAL, fin: BK },
    num: { ff: '"Titillium Web", Arial, sans-serif', w: 700, ls: 0.02 },
    halo: { inner: ['@MercedesAMGF1', 'crowdstrike'] },
    side(L) {
      const { k, g } = L;
      // silver nose + chassis shoulder above the teal stripe, ending at the sidepod inlet (the halo / cockpit rim stay black)
      const EDGE = [[3.1, 0.24], [2.7, 0.24], [2.2, 0.28], [1.7, 0.36], [1.25, 0.43], [0.95, 0.47], [0.7, 0.5]];
      k.region(EDGE, [[0.7, 0.74], [0.95, 0.74], [1.25, 0.72], [2.2, 0.62], [3.2, 0.5]], SIL); k.stroke(EDGE, 0.03, TEAL);
      // sidepod: silver pillars leaning forward over the black flank, boxed below by the teal swoosh
      const SW = [[-1.2, 0.42], [-0.7, 0.43], [-0.25, 0.45], [0.15, 0.5], [0.45, 0.58], [0.62, 0.68]];
      g.save(); k.curve(SW, [[0.9, 0.7], [0.9, 0.74], [-1.35, 0.7], [-1.35, 0.42]]); g.closePath(); g.clip();
      for (let i = 0; i < 5; i++) { const x = 0.36 - i * 0.235, w = 0.17 - i * 0.012; k.poly([[x + 0.2, 0.76], [x + 0.2 + w, 0.76], [x + w - 0.06, 0.4], [x - 0.06, 0.4]], i % 2 ? SIL2 : SIL); }
      g.restore();
      k.stroke(SW, 0.04, TEAL);
      wordW(L, 'PETRONAS', -0.3, 0.335, 0.76, 0.1, W, { w: 900, ls: 0.02 });
      // stars over the engine cover, denser and brighter towards the airbox
      for (let i = 0; i < 60; i++) { const x = -0.15 - rnd(i) * 1.15, y = 0.6 + rnd(i + 99) * 0.42; const a = 1.0 - (-0.15 - x) * 0.55; if (a < 0.3 || (x > -0.7 && y > 0.82) || (x > -0.75 && y < 0.78 && y > 0.66)) continue; k.at(x, y, () => { g.globalAlpha = a; star3(g, 0.034 + rnd(i + 7) * 0.012, SIL); g.globalAlpha = 1; }); }
      // airbox / engine cover / cockpit partners
      k.at(-0.17, 0.93, () => msft(g, 0.42, 0.09));
      fitW(L, 'solera', -0.48, 0.858, 0.32, 'white', null, 0.05);
      fitW(L, 'teamviewer', -0.45, 0.705, 0.48, 'white');
      fitW(L, 'amd', 0.25, 0.78, 0.18, 'white');
      fitW(L, 'nubank', 0.55, 0.79, 0.11, 'white');
      fitW(L, 'amg', 1.08, 0.6, 0.36, 'black');
      fitW(L, 'einhell', 2.3, 0.37, 0.26, 'white', null, 0.05);
      fitW(L, 'signify', 0.95, 0.24, 0.36, 'white', null, 0.07);
      // rear-wing endplates: Snapdragon / CrowdStrike / PETRONAS PRIMAX
      fitW(L, 'snapdragon', -2.16, 0.87, 0.33, 'white'); fitW(L, 'crowdstrike', -2.2, 0.78, 0.36, 'white');
      wordW(L, 'PETRONAS', -2.2, 0.61, 0.2, 0.038, W, { w: 900 }); wordW(L, 'PRIMAX', -2.2, 0.565, 0.2, 0.04, W, { w: 900, it: 1 });
      L.number(1.5, 0.56, 0.06, BK); L.codeText(1.27, 0.525, 0.036, BK); L.car((g, k) => k.at(1.09, 0.525, () => FLAG(g, natOf(L.code), 0.03)));   // per-car (two-pass painting)
      L.haloHandle('mercedesamgf1.com', W, -1); L.haloHandle('@MercedesAMGF1', W, 1);
    },
    endplate(L) {   // front-wing endplates (black): INEOS / IWC / Microsoft
      const { k, g } = L;
      fitW(L, 'ineos', 2.47, 0.42, 0.29, 'white'); fitW(L, 'iwc', 2.5, 0.3, 0.26, 'white', null, 0.08); k.at(2.5, 0.19, () => msft(g, 0.36, 0.08));
    },
    top(L) {
      const { t, g } = L;
      // silver nose spine + cockpit shoulders, teal edge lines
      t.poly([[3.1, -0.06], [3.1, 0.06], [2.2, 0.1], [1.4, 0.15], [0.9, 0.24], [0.9, -0.24], [1.4, -0.15], [2.2, -0.1]], SIL);
      for (const s of [-1, 1]) t.poly([[3.1, s * 0.06], [3.1, s * 0.075], [2.2, s * 0.115], [1.4, s * 0.165], [0.9, s * 0.255], [0.9, s * 0.24], [1.4, s * 0.15], [2.2, s * 0.1]], TEAL);
      L.mark('mercedes', 2.75, 0, 0.1, 0.1, 'black', 'star', 0.05, BK);
      L.number(2.3, 0, 0.08, BK);
      t.at(1.75, 0, () => LV.styledText(g, 'PETRONAS', 0.032, BK, { w: 900, ls: 0.04 }), Math.PI);
      // engine cover stars from above
      for (let i = 0; i < 40; i++) { const x = -0.25 - rnd(i + 300) * 1.1, z = (rnd(i + 331) - 0.5) * 0.55; t.at(x, z, () => { g.globalAlpha = 0.85 - (-0.25 - x) * 0.5; star3(g, 0.024, SIL); g.globalAlpha = 1; }); }
      // rear-wing top: PETRONAS
      L.wordmark('PETRONAS', -2.12, 0, 0.1, W, { w: 900, ls: 0.04 });
      // halo: team handle + site on the arms, CrowdStrike where they meet
      L.haloTop('@MercedesAMGF1', W, -1); L.haloTop('mercedesamgf1.com', W, 1); L.haloFront('crowdstrike', 'white');
    },
  });
  // front-wing main planes (LIVERY-LEAD default from the 2026 photos; a frontWing in the design above takes precedence)
  if (LV.designs['mercedes'] && !LV.designs['mercedes'].frontWing) LV.designs['mercedes'].frontWing = function (L) { L.t.rect(2.15, 3.25, -1.1, 1.1, '#0e0f11'); for (const z of [-0.72, 0.72]) L.wordmark('PETRONAS', 2.6, z, 0.06, '#ffffff', { w: 900, ls: 0.06 }, false, Math.PI); };
})();
