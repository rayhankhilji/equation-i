// Equation I - ferrari 2026 livery (owner: LIVERY-A). Registered with the livery core js/liveries.js, which documents the helpers.
// Coordinates: metres, x forward (nose tip 3.05, front axle 1.75, rear axle -1.85), y up, z right (see liveries/mercedes.js for the
// model landmarks). Scuderia Ferrari HP SF-26 (2026 race photos, swarm/f1/liveryA/refs/fer_*): lighter gloss red; a white block over
// the airbox and the engine-cover spine with a red pinstripe along its lower edge, cut diagonally at the rear where the big white race
// number sits on the red; the blue HP disc on the white airbox; Shell pecten + CEVA Logistics on the sidepod, Puma ahead of it,
// UniCredit on the cover rear; Richard Mille + the Scuderia shield on the chassis; ZYN / IBM by the cockpit; black wings with UniCredit
// + tricolore on the front endplates and Shell V-Power / Peroni Nastro Azzurro 0.0% on the rear endplates; HP discs on the rear wing.
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
  const RED = '#e2131f', BK = '#141518', WH = '#f6f6f4', YEL = '#fbd70c';
  // the Shell pecten (scallop): yellow shell, red rim and grooves; h = height in metres, centred on the origin
  function pecten(g, h) {
    h *= MM; const w = h * 1.08, r = w / 2; g.save(); g.lineJoin = 'round';
    const outline = () => { g.beginPath(); g.moveTo(-w * 0.17, h * 0.5); g.lineTo(-w * 0.2, h * 0.36); g.bezierCurveTo(-w * 0.5, h * 0.3, -w * 0.52, h * 0.05, -w * 0.47, -h * 0.08);
      g.bezierCurveTo(-w * 0.42, -h * 0.38, -w * 0.2, -h * 0.5, 0, -h * 0.5); g.bezierCurveTo(w * 0.2, -h * 0.5, w * 0.42, -h * 0.38, w * 0.47, -h * 0.08);
      g.bezierCurveTo(w * 0.52, h * 0.05, w * 0.5, h * 0.3, w * 0.2, h * 0.36); g.lineTo(w * 0.17, h * 0.5); g.closePath(); };
    if (EI.Ads.hasPartner('shellpecten')) {   // the real pecten artwork in Shell red over a yellow ground (the art is single colour)
      g.save(); g.scale(0.94, 0.94); outline(); g.fillStyle = YEL; g.fill(); g.restore();
      EI.Ads.drawPartner(g, 'shellpecten', 0, 0, w, h, { tone: 'mono:#dd1d21' }); g.restore(); return;
    }
    outline(); g.fillStyle = '#dd1d21'; g.fill(); g.save(); g.translate(0, 0); g.scale(0.86, 0.86); outline(); g.fillStyle = YEL; g.fill(); g.restore();
    g.strokeStyle = '#dd1d21'; g.lineWidth = h * 0.045; g.lineCap = 'round';
    for (let i = -3; i <= 3; i++) { if (!i) continue; const a = i * 0.21; g.beginPath(); g.moveTo(Math.sin(a) * h * 0.12, h * 0.3); g.lineTo(Math.sin(a) * h * 0.47, h * 0.3 - Math.cos(a) * h * 0.66); g.stroke(); }
    g.beginPath(); g.moveTo(0, h * 0.3); g.lineTo(0, -h * 0.37); g.stroke();
    g.fillStyle = '#dd1d21'; g.fillRect(-w * 0.2, h * 0.3, w * 0.4, h * 0.12);
    g.restore();
  }
  // the Scuderia shield: yellow field, tricolore band, black prancing horse, S F; h = height (m)
  function shield(g, h) {
    h *= MM; const w = h * 0.7; g.save();
    const sh = () => { g.beginPath(); g.moveTo(-w / 2, -h / 2); g.lineTo(w / 2, -h / 2); g.lineTo(w / 2, h * 0.14); g.quadraticCurveTo(w / 2, h * 0.36, 0, h / 2); g.quadraticCurveTo(-w / 2, h * 0.36, -w / 2, h * 0.14); g.closePath(); };
    sh(); g.fillStyle = '#111'; g.fill(); g.save(); g.translate(0, h * 0.01); g.scale(0.9, 0.93); sh(); g.clip(); g.fillStyle = YEL; g.fillRect(-w, -h, w * 2, h * 2);
    ['#009a44', '#ffffff', '#e2131f'].forEach((c, i) => { g.fillStyle = c; g.fillRect(-w / 2 + i * w / 3, -h / 2, w / 3 + 1, h * 0.1); });
    // prancing horse (rearing, facing left), body ~0.5 h tall
    const s = h * 0.0105; g.translate(-h * 0.01, h * 0.06); g.scale(s, s); g.fillStyle = '#111'; g.beginPath();
    const P = [[-6, -26], [-2, -24], [3, -18], [4, -12], [8, -8], [14, -10], [18, -6], [16, -2], [11, -2], [9, 4], [12, 10], [14, 18], [10, 18], [7, 10], [3, 8], [0, 14], [2, 22], [-2, 22], [-4, 14], [-6, 8], [-10, 4], [-13, 6], [-16, 2], [-12, -2], [-10, -8], [-14, -12], [-18, -10], [-16, -16], [-11, -16], [-9, -20], [-12, -24], [-9, -28]];
    P.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
    g.restore();
    g.fillStyle = '#111'; g.font = '900 ' + (h * 0.15).toFixed(1) + 'px "Titillium Web", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('S  F', 0, h * 0.33);
    g.restore();
  }
  // the Puma leaping cat (Puma's formstrip-free mark), facing right, w = width (m), centred on the origin
  function pumaCat(g, w, col) {
    w *= MM; const P = [[0.98, 0.12], [0.9, 0.0], [0.86, 0.07], [0.78, 0.05], [0.6, 0.13], [0.38, 0.27], [0.24, 0.39], [0.12, 0.43], [0.0, 0.62], [0.05, 0.65], [0.16, 0.52], [0.23, 0.52], [0.16, 0.72], [0.26, 0.74], [0.36, 0.5], [0.56, 0.37], [0.72, 0.31], [0.97, 0.37], [1.0, 0.31], [0.8, 0.23], [0.93, 0.19]];
    g.fillStyle = col; g.beginPath(); P.forEach(([x, y], i) => (i ? g.lineTo((x - 0.5) * w, (y - 0.37) * w) : g.moveTo((x - 0.5) * w, (y - 0.37) * w))); g.closePath(); g.fill();
  }
  function tricolore(g, w, h) { w *= MM; h *= MM; ['#009a44', '#ffffff', '#e2131f'].forEach((c, i) => { g.fillStyle = c; g.fillRect(-w / 2 + i * w / 3, -h / 2, w / 3 + 0.5, h); }); }
  LV.register('ferrari', {
    parts: { body: RED, fwFlap: BK, fwEnd: BK, fwTip: BK, rwMain: BK, rwEnd: BK, rwFlap: BK, halo: BK, mirror: RED, fin: RED },
    num: { ff: '"Titillium Web", Arial, sans-serif', w: 900, it: 1, sx: 0.92 },
    halo: { inner: ['@ScuderiaFerrari', 'dxc'] },
    side(L) {
      const { k, g } = L;
      // white block: cockpit rear, airbox and engine-cover spine, diagonal rear cut, red pinstripe along its lower edge
      const LOW = [[0.62, 0.74], [0.3, 0.67], [-0.1, 0.63], [-0.5, 0.61], [-0.7, 0.61]];
      k.region(LOW, [[-1.0, 1.2], [0.62, 1.2]], WH);
      k.stroke(LOW.map(([x, y]) => [x, y + 0.025]).concat([[-0.76, 0.65], [-1.02, 1.12]]), 0.012, RED);
      // race number on the red cover behind the white
      L.number(-1.2, 0.8, 0.2, W);
      L.partnerAt('hp', -0.14, 0.9, 0.23, 0.23, 'color');
      fitW(L, 'zyn', 0.52, 0.81, 0.17, 'black', W, 0.05);
      fitW(L, 'ibm', 0.22, 0.81, 0.17, 'black');
      // sidepod: Puma, Shell pecten, CEVA; UniCredit on the cover rear
      if (EI.Ads.hasPartner('pumacat')) k.at(0.4, 0.53, () => EI.Ads.drawPartner(g, 'pumacat', 0, 0, 0.15 * MM, 0.12 * MM, { tone: 'white' }));   // brand art, unmirrored on both sides
      else k.at(0.4, 0.53, () => { g.scale(k.s, 1); pumaCat(g, 0.13, W); });
      k.at(0.04, 0.45, () => pecten(g, 0.24));
      fitW(L, 'cevalogistics', -0.45, 0.36, 0.36, 'white');
      fitW(L, 'unicredit', -0.95, 0.58, 0.4, 'white');
      // chassis: Richard Mille + the shield; floor: ambipar
      fitW(L, 'richardmille', 1.25, 0.6, 0.31, 'white');
      k.at(0.98, 0.56, () => shield(g, 0.11));
      fitW(L, 'ambipar', 0.95, 0.24, 0.29, 'white', null, 0.07);
      // rear-wing endplates: tricolore strip, Shell V-Power, Peroni Nastro Azzurro 0.0%
      k.at(-2.17, 0.95, () => tricolore(g, 0.3, 0.03));
      k.at(-2.0, 0.85, () => pecten(g, 0.1)); wordW(L, 'V-Power', -2.23, 0.85, 0.27, 0.07, W, { w: 700, it: 1 });
      wordW(L, 'PERONI', -2.17, 0.72, 0.26, 0.06, W, { w: 700, ff: 'Georgia, "Times New Roman", serif', ls: 0.06 }); wordW(L, 'NASTRO AZZURRO 0.0%', -2.17, 0.66, 0.26, 0.03, W, { w: 700 });
      L.codeText(1.27, 0.48, 0.036, W); L.car((g, k) => k.at(1.09, 0.48, () => FLAG(g, natOf(L.code), 0.03)));   // per-car (two-pass painting)
      L.haloHandle('DXC', W, -1, { w: 900, ls: 0.14 }); L.haloHandle('DXC', W, 1, { w: 900, ls: 0.14 });   // DXC on the halo sides
    },
    endplate(L) {   // front-wing endplates (black): UniCredit + tricolore
      const { k, g } = L;
      fitW(L, 'unicredit', 2.5, 0.36, 0.25, 'white'); k.at(2.5, 0.26, () => tricolore(g, 0.2, 0.035));
    },
    top(L) {
      const { t, g } = L;
      // white spine over the airbox and the engine cover, pinstripe edges
      t.poly([[0.6, -0.3], [0.6, 0.3], [0.0, 0.36], [-0.6, 0.3], [-0.95, 0.0], [-0.6, -0.3], [0.0, -0.36]], WH);
      t.at(2.62, 0, () => pecten(g, 0.09), Math.PI);
      L.number(2.25, 0, 0.12, W);
      L.partnerTop('ibm', 1.97, 0, 0.12, 0.04, 'white', Math.PI); L.partnerTop('whoop', 1.6, 0, 0.14, 0.03, 'white', Math.PI); L.partnerTop('unicredit', 1.75, 0, 0.17, 0.035, 'white', Math.PI);
      t.at(1.42, 0, () => shield(g, 0.085), Math.PI);
      // rear wing: HP discs on the main plane, IBM on the flap; front-wing flaps: HP discs
      for (const z of [-0.3, 0.3]) L.partnerTop('hp', -2.06, z, 0.15, 0.15, 'color');
      L.partnerTop('ibm', -2.26, 0, 0.3, 0.07, 'white');
      for (const z of [-0.62, 0.62]) L.partnerTop('hp', 2.72, z, 0.12, 0.12, 'color');
      L.haloTop('DXC', W, -1, { w: 900, ls: 0.12 }, 0.06); L.haloTop('DXC', W, 1, { w: 900, ls: 0.12 }, 0.06); L.haloFront('dxc', 'white');   // DXC big on both halo arms (2026 photos)
    },
  });
  // front-wing main planes (LIVERY-LEAD default from the 2026 photos; a frontWing in the design above takes precedence)
  if (LV.designs['ferrari'] && !LV.designs['ferrari'].frontWing) LV.designs['ferrari'].frontWing = function (L) { L.t.rect(2.15, 3.25, -1.1, 1.1, '#e10a17');  };
})();
