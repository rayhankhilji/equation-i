// Equation I - mclaren 2026 livery (owner: LIVERY-A). Registered with the livery core js/liveries.js, which documents the helpers.
// Coordinates: metres, x forward (nose tip 3.05, front axle 1.75, rear axle -1.85), y up, z right (see liveries/mercedes.js for the
// model landmarks). McLaren Mastercard F1 Team MCL40 (2026 race photos, swarm/f1/liveryA/refs/mcl_*): papaya nose, chassis, cockpit
// sides and tail; an anthracite-black field over the engine-cover side and the sidepod split by a papaya band that sweeps from the
// cockpit down to the tail, a papaya flick at the sidepod's lower front; dark-teal Allwyn airbox; Gemini on the black cover, OKX and
// the Mastercard circles on the black sidepod, Cisco / ClubAvolta on papaya by the cockpit, Richard Mille and DP World on the chassis,
// Dell Technologies on the papaya tail, Dropbox on the papaya rear-wing endplates, ETIHAD on the black rear wing, workday on the
// front-wing endplates.
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
  const PAP = '#ff8000', AN = '#1d1e21', TEAL = '#0e4a40';
  // OKX: the logotype built from squares (white on the black sidepod); w = overall width (m)
  function okx(g, w, col) {
    const c = w * MM / 11; g.fillStyle = col; const sq = (i, j) => g.fillRect(-w * MM / 2 + i * c, -1.5 * c + j * c, c * 1.0, c * 1.0);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (!(i === 1 && j === 1)) sq(i, j);          // O
    for (const [i, j] of [[4, 0], [4, 1], [4, 2], [5, 1], [6, 0], [6, 2]]) sq(i, j);                      // K
    for (const [i, j] of [[8, 0], [10, 0], [9, 1], [8, 2], [10, 2]]) sq(i, j);                            // X
  }
  LV.register('mclaren', {
    parts: { body: PAP, fwFlap: AN, fwEnd: PAP, fwTip: PAP, rwMain: AN, rwEnd: PAP, rwFlap: AN, halo: AN, mirror: '#14302b', fin: PAP },
    num: { ff: '"Plus Jakarta Sans", "Titillium Web", Arial, sans-serif', w: 800, ls: -0.02 },
    halo: { inner: ['@McLarenF1', 'mclaren.com'] },
    side(L) {
      const { k, g } = L;
      // anthracite lower chassis under the nose
      k.region([[3.15, 0.14], [2.4, 0.22], [1.6, 0.3], [1.1, 0.36], [0.8, 0.4]], [[0.8, -0.1], [3.2, -0.1]], AN);
      // the black field (engine-cover side + sidepod) between the cockpit / sidepod front and the papaya tail
      const FRONT = [[0.05, 1.2], [0.12, 0.86], [0.42, 0.66], [0.7, 0.48], [0.85, 0.3], [0.88, -0.1]];
      const TAIL = [[-1.02, -0.1], [-0.98, 0.36], [-0.82, 0.72], [-0.72, 1.2]];
      k.poly(FRONT.concat(TAIL), AN);
      // papaya band sweeping from the cockpit side down to the tail, papaya flick at the sidepod's lower front
      k.poly([[0.5, 0.76], [0.66, 0.6], [-0.2, 0.44], [-0.86, 0.3], [-0.92, 0.5], [-0.3, 0.6]], PAP);
      k.poly([[0.86, 0.14], [0.36, 0.14], [0.78, 0.36]], PAP);
      // Allwyn airbox: dark teal fading to black
      const gr = g.createLinearGradient(0, k.Y(1.1), 0, k.Y(0.82)); gr.addColorStop(0, TEAL); gr.addColorStop(1, AN);
      k.poly([[0.08, 1.2], [0.08, 0.86], [-0.4, 0.86], [-0.42, 1.2]], gr);
      if (EI.Ads.hasPartner('allwyn')) k.at(-0.16, 0.95, () => {   // the white allwyn wordmark (the artwork's round 'a' mark clipped off)
        const w = 0.26 * MM, h = w / 0.74 / 3.82; g.save(); g.beginPath(); g.rect(-w / 2, -h, w, h * 2); g.clip(); const F = w / 0.74; EI.Ads.drawPartner(g, 'allwyn', -0.13 * F, 0, F, h, { tone: 'white' }); g.restore(); });
      else L.wordmark('allwyn', -0.15, 0.99, 0.065, W, { ff: '"Plus Jakarta Sans", Arial, sans-serif', w: 800, ls: -0.02 });
      fitW(L, 'googlegemini', -0.45, 0.665, 0.52, 'rev');
      k.at(-0.2, 0.36, () => okx(g, 0.3, W));
      L.partnerAt('mastercard', -0.66, 0.24, 0.22, 0.12, 'color');
      L.partnerAt('cisco', 0.42, 0.68, 0.2, 0.085, 'mono:#9c3d00');
      L.wordmark('ClubAvolta', 0.3, 0.6, 0.04, W, { w: 700 });
      L.partnerAt('richardmille', 1.12, 0.6, 0.32, 0.036, 'mono:#7d1a12');
      L.partnerAt('dpworld', 0.84, 0.46, 0.2, 0.065, 'white', '#23286a');
      wordW(L, 'DELL', -1.22, 0.61, 0.24, 0.07, '#141414', { w: 900, ls: 0.14 }); wordW(L, 'Technologies', -1.22, 0.555, 0.19, 0.03, '#141414', { w: 600 });   // stacked DELL / Technologies, black on papaya (photos)
      L.partnerAt('mclarenspeedmark', 0.98, 0.25, 0.2, 0.06, 'color');
      // front-wing endplates: workday; rear-wing endplates: Dropbox
      L.partnerAt('dropbox', -2.17, 0.86, 0.4, 0.075, 'black'); L.partnerAt('groq', -2.17, 0.56, 0.14, 0.05, 'white');
      L.number(1.62, 0.52, 0.07, AN); L.codeText(1.27, 0.5, 0.036, AN); L.car((g, k) => k.at(1.09, 0.5, () => FLAG(g, natOf(L.code), 0.03)));   // per-car (two-pass painting)
      L.haloHandle('mclaren.com', W, -1); L.haloHandle('@McLarenF1', W, 1);
    },
    // wheel covers (2026 photos): dark covers with the rainbow rings, an outer ring at the rim and a small inner ring at the hub
    cover(g, S) {
      const r = (m) => m / 0.56 * S, c = S / 2; g.fillStyle = '#16171a'; g.beginPath(); g.arc(c, c, r(0.27), 0, 7); g.fill();
      for (const [rr, lw] of [[0.205, 0.03], [0.1, 0.018]]) for (let i = 0; i < 48; i++) { g.strokeStyle = 'hsl(' + (i * 7.5) + ',95%,55%)'; g.lineWidth = r(lw); g.beginPath(); g.arc(c, c, r(rr), i * Math.PI / 24 - 0.01, (i + 1) * Math.PI / 24 + 0.01); g.stroke(); }
    },
    endplate(L) {   // front-wing endplates (papaya): workday
      L.partnerAt('workday', 2.5, 0.3, 0.3, 0.09, 'mono:#3a1f0c');
    },
    top(L) {
      const { t, g } = L;
      // black engine-cover top behind the airbox, papaya tail
      t.poly([[0.05, -0.26], [0.05, 0.26], [-0.75, 0.3], [-0.75, -0.3]], AN);
      t.poly([[0.05, -0.12], [0.05, 0.12], [-0.42, 0.12], [-0.42, -0.12]], TEAL);
      L.partnerTop('mclarenspeedmark', 2.6, 0, 0.16, 0.06, 'black', Math.PI);
      L.number(2.25, 0, 0.12, AN);
      L.partnerTop('mastercard', 1.85, 0, 0.12, 0.07, 'color', Math.PI);
      L.partnerTop('googlegemini', -0.45, 0, 0.36, 0.08, 'rev');
      t.at(-2.1, 0, () => {   // the rear wing carries only the Latin ETIHAD, full width (the artwork's lower line, Arabic above clipped off)
        const I = EI.Ads.partnerInfo('etihadairways'); const w = 0.86 * MM, h = w / ((I && I.aspect) || 2.6);
        g.save(); g.beginPath(); g.rect(-w, -h * 0.2, w * 2, h * 0.6); g.clip(); EI.Ads.drawPartner(g, 'etihadairways', 0, -h * 0.25, w, h, { tone: 'white' }); g.restore(); });
      for (const z of [-0.62, 0.62]) L.partnerTop('mastercard', 2.72, z, 0.14, 0.09, 'color');
      L.haloTop('@McLarenF1', W, -1); L.haloTop('mclaren.com', W, 1); t.at(0.76, 0, () => okx(g, 0.12, W));
    },
  });
  // front-wing main planes (LIVERY-LEAD default from the 2026 photos; a frontWing in the design above takes precedence)
  if (LV.designs['mclaren'] && !LV.designs['mclaren'].frontWing) LV.designs['mclaren'].frontWing = function (L) { L.t.rect(2.15, 3.25, -1.1, 1.1, '#ff8000');  };
})();
