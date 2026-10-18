// Equation I - astonmartin 2026 livery (owner: LIVERY-C). Registered with the livery core js/liveries.js, which documents the helpers
// (L.partner / partnerAt / emblem / mark / number / codeText / wordmark, L.k side kit, L.t top kit) and the part colour keys.
// Coordinates: metres, x forward (nose tip 3.0, front axle 1.75, rear axle -1.85), y up, z right.
(function () {
  const LV = EI.LIVERIES; if (!LV) return;
  const { TOP_V, LOW_V, W, MM } = LV.K;
  LV.register('astonmartin', {
    parts: { body: '#004c41', fwFlap: '#004c41', fwEnd: '#004c41', fwTip: '#cedc00', rwMain: '#004c41', rwEnd: '#004c41', rwFlap: '#6cc4e8', halo: '#0d1a17', mirror: '#004c41', fin: '#0d1a17' },
    num: { ff: '"Titillium Web", Arial, sans-serif', w: 600, ls: 0.06 },
    side(L) {
      const { k } = L; const LM = '#cedc00';
      k.region([[3.2, 0.14], [1.0, 0.16], [-0.6, 0.18], [-2.0, 0.22]], [[-2.4, LOW_V], [3.2, LOW_V]], '#0d1a17');
      k.stroke([[3.1, 0.17], [1.0, 0.19], [-0.6, 0.21], [-1.9, 0.25]], 0.018, LM);
      k.stroke([[1.05, 0.64], [0.98, 0.42], [1.0, 0.25]], 0.02, LM);   // sidepod inlet edge
      k.poly([[0.02, 1.2], [0.02, 0.83], [-0.36, 0.83], [-0.42, 1.2]], '#111111');
      L.wordmark('ASTON MARTIN', 2.05, 0.42, 0.04, W, { w: 600, ls: 0.35 });
      L.partner('aramco', 'sp', 'white'); L.partner('honda', 'ec', 'white'); L.partner('maaden', 'spLow', 'white'); L.partner('cognizant', 'cockpit', 'white');
      L.partner('aramco', 'rwEnd', 'white'); L.partner('glenfiddich', 'fwEnd', 'white'); L.partner('coreweave', 'ecRear', 'white');
      L.number(1.05, 0.5, 0.085, W); L.codeText(1.3, 0.63, 0.05, LM); L.number(-2.13, 0.62, 0.11, LM);
    },
    top(L) {
      const { t } = L; t.rect(-0.38, 0.02, -0.09, 0.09, '#111111'); for (const s of [-1, 1]) t.poly([[3.0, s * 0.05], [3.0, s * 0.065], [1.0, s * 0.135], [1.0, s * 0.12]], '#cedc00');
      L.wordmark('ASTON MARTIN', 2.45, 0, 0.035, W, { w: 600, ls: 0.25 }); L.number(2.1, 0, 0.12, W);
      L.partner('aramco', 'rwTop', 'white'); L.partner('aramco', 'spTop', 'white'); L.partner('honda', 'noseTop', 'white');
    },
  });
})();
