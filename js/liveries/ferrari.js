// Equation I - ferrari 2026 livery (owner: LIVERY-A). Registered with the livery core js/liveries.js, which documents the helpers
// (L.partner / partnerAt / emblem / mark / number / codeText / wordmark, L.k side kit, L.t top kit) and the part colour keys.
// Coordinates: metres, x forward (nose tip 3.0, front axle 1.75, rear axle -1.85), y up, z right.
(function () {
  const LV = EI.LIVERIES; if (!LV) return;
  const { TOP_V, LOW_V, W, MM } = LV.K;
  LV.register('ferrari', {   // SF-26: bright gloss red, white panels around the cockpit and over the engine cover, black lower floor edge
    parts: { body: '#e10a17', fwFlap: '#e10a17', fwEnd: '#e10a17', fwTip: '#ffffff', rwMain: '#e10a17', rwEnd: '#e10a17', rwFlap: '#16171a', halo: '#16171a', mirror: '#e10a17', fin: '#e10a17' },
    num: { ff: '"Titillium Web", Arial, sans-serif', w: 900, it: 1, sx: 0.92 },
    side(L) {
      const { k } = L;
      k.region([[1.05, 1.3], [1.0, 0.72], [0.4, 0.74], [-0.3, 0.76], [-0.9, 0.72], [-1.4, 0.64], [-2.0, 0.56]], [[-2.6, 0.56], [-2.6, TOP_V], [1.05, TOP_V]], W);
      k.stroke([[1.0, 0.7], [0.4, 0.72], [-0.3, 0.74], [-0.9, 0.7], [-1.4, 0.62]], 0.012, '#16171a');
      k.region([[3.2, 0.14], [1.0, 0.16], [-0.6, 0.18], [-2.0, 0.22]], [[-2.4, LOW_V], [3.2, LOW_V]], '#16171a');
      L.partner('hp', 'ec', 'color'); L.partner('hp', 'sp', 'white'); L.partner('shell', 'ecRear', 'color'); L.partner('unicredit', 'noseSide', 'white');
      L.partner('ibm', 'spLow', 'white'); L.partner('hp', 'fwEnd', 'white'); L.partner('shell', 'rwEnd', 'color');
      L.mark('ferrari', 0.62, 0.6, 0.12, 0.13, 'color', 'shield', 0.1, '#fff200', true);
      L.number(1.25, 0.5, 0.085, W); L.codeText(1.3, 0.62, 0.045, W); L.number(-2.13, 0.62, 0.11, W);
    },
    top(L) {
      const { t } = L;
      for (const s of [-1, 1]) t.poly([[1.0, s * 0.1], [1.0, s * 0.3], [0.2, s * 0.55], [-0.6, s * 0.4], [-1.3, s * 0.14], [-1.3, s * 0.06], [0.2, s * 0.12]], W);
      t.poly([[0.25, -0.08], [0.25, 0.08], [-1.4, 0.06], [-1.4, -0.06]], W);
      t.rect(-3.2, -1.5, -1.2, 1.2, '#16171a');
      L.mark('ferrari', 2.5, 0, 0.1, 0.12, 'color', 'shield', 0.11, '#fff200', true); L.number(2.12, 0, 0.13, W);
      L.partner('hp', 'rwTop', 'white'); L.partner('hp', 'ecTop', 'color');
    },
  });
})();
