// Equation I - cadillac 2026 livery (owner: LIVERY-C). Registered with the livery core js/liveries.js, which documents the helpers
// (L.partner / partnerAt / emblem / mark / number / codeText / wordmark, L.k side kit, L.t top kit) and the part colour keys.
// Coordinates: metres, x forward (nose tip 3.0, front axle 1.75, rear axle -1.85), y up, z right.
(function () {
  const LV = EI.LIVERIES; if (!LV) return;
  const { TOP_V, LOW_V, W, MM } = LV.K;
  LV.register('cadillac', {
    parts: { body: '#f2f2f2', fwFlap: '#0b0b0b', fwEnd: '#0b0b0b', fwTip: '#f2f2f2', rwMain: '#0b0b0b', rwEnd: '#0b0b0b', rwFlap: '#0b0b0b', halo: '#0b0b0b', mirror: '#f2f2f2', fin: '#0b0b0b' },
    num: { ff: '"Titillium Web", Arial, sans-serif', w: 700, ls: 0.12 },
    side(L) {
      const { k } = L; const BK = '#0b0b0b';
      const LINE = [[3.2, 0.3], [2.0, 0.38], [1.0, 0.45], [0.0, 0.47], [-1.0, 0.5], [-1.8, 0.58], [-2.4, 0.68]];
      k.region(LINE, [[-2.6, LOW_V], [3.2, LOW_V]], BK); k.stroke(LINE.map(([x, y]) => [x, y + 0.01]), 0.006, '#b8975a');
      k.poly([[-1.3, 1.2], [-1.3, 0.45], [-2.6, 0.45], [-2.6, 1.2]], BK);
      L.wordmark('CADILLAC', -0.3, 0.36, 0.065, W, { w: 700, ls: 0.45 });
      L.emblem('cadCrest', -0.95, 0.88, 0.09, BK);
      L.partner('twgai', 'sp', 'black'); L.partner('tommyhilfiger', 'ec', 'black'); L.partner('jimbeam', 'ecRear', 'white'); L.partner('ifs', 'fwEnd', 'white');
      L.partner('claro', 'rwEnd', 'white'); L.partner('coreScientific', 'cockpit', 'black');
      L.number(1.05, 0.52, 0.085, BK); L.codeText(1.3, 0.64, 0.05, BK); L.number(-2.13, 0.62, 0.11, W);
    },
    top(L) {
      const { t } = L; t.rect(-3.2, -1.3, -1.2, 1.2, '#0b0b0b');
      L.emblem('cadCrest', 2.42, 0, 0.1, '#0b0b0b'); L.number(2.12, 0, 0.12, '#0b0b0b'); L.wordmark('CADILLAC', -0.6, 0, 0.05, '#0b0b0b', { w: 600, ls: 0.3 }, true);
      L.partner('tommyhilfiger', 'rwTop', 'white'); L.partner('twgai', 'spTop', 'black');
    },
  });
})();
