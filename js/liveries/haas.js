// Equation I - haas 2026 livery (owner: LIVERY-B). Registered with the livery core js/liveries.js, which documents the helpers
// (L.partner / partnerAt / emblem / mark / number / codeText / wordmark, L.k side kit, L.t top kit) and the part colour keys.
// Coordinates: metres, x forward (nose tip 3.0, front axle 1.75, rear axle -1.85), y up, z right.
(function () {
  const LV = EI.LIVERIES; if (!LV) return;
  const { TOP_V, LOW_V, W, MM } = LV.K;
  LV.register('haas', {   // VF-26: white car, black lower body and rear, red nose / front wing, the giant GR on the engine cover
    parts: { body: '#ffffff', fwFlap: '#e6002b', fwEnd: '#16181c', fwTip: '#ffffff', rwMain: '#16181c', rwEnd: '#ffffff', rwFlap: '#e6002b', halo: '#16181c', mirror: '#ffffff', fin: '#16181c' },
    num: { ff: '"Titillium Web", Arial, sans-serif', w: 900, sx: 0.86 },
    side(L) {
      const { k } = L; const BK = '#16181c', RD = '#e6002b';
      const LINE = [[3.2, 0.24], [2.2, 0.3], [1.2, 0.36], [0.4, 0.42], [-0.4, 0.46], [-1.1, 0.56], [-1.7, 0.74], [-2.2, 0.92]];
      k.region(LINE, [[-2.6, LOW_V], [3.2, LOW_V]], BK);
      k.poly([[3.2, 0.1], [3.2, 0.42], [2.55, 0.42], [2.4, 0.1]], RD);
      k.stroke(LINE.map(([x, y]) => [x, y + 0.02]), 0.016, RD);
      L.partnerAt('tgr-emblem', -0.85, 0.72, 0.62, 0.3, 'color'); L.partnerAt('haas', 0.05, 0.53, 0.8, 0.14, 'black');
      L.partner('moneygram', 'spLow', 'white'); L.partner('tgr', 'rwEnd', 'black'); L.partner('haas', 'fwEnd', 'white'); L.partner('tgr', 'noseSide', 'white');
      L.number(1.3, 0.5, 0.08, BK); L.codeText(1.3, 0.62, 0.045, BK); L.number(-2.13, 0.62, 0.11, BK);
    },
    top(L) {
      const { t } = L; t.rect(-3.2, -1.2, -1.2, 1.2, '#16181c'); t.rect(2.62, 3.2, -1.2, 1.2, '#e6002b');
      L.number(2.15, 0, 0.12, '#16181c'); L.partnerTop('tgr-emblem', -0.7, 0, 0.28, 0.4, 'color', -Math.PI / 2); L.partner('haas', 'rwTop', 'white'); L.partner('haas', 'spTop', 'black');
    },
  });
})();
