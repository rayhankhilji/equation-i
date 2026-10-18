// Equation I - audi 2026 livery (owner: LIVERY-B). Registered with the livery core js/liveries.js, which documents the helpers
// (L.partner / partnerAt / emblem / mark / number / codeText / wordmark, L.k side kit, L.t top kit) and the part colour keys.
// Coordinates: metres, x forward (nose tip 3.0, front axle 1.75, rear axle -1.85), y up, z right.
(function () {
  const LV = EI.LIVERIES; if (!LV) return;
  const { TOP_V, LOW_V, W, MM } = LV.K;
  LV.register('audi', {   // R26: titanium silver front and sides, a big Audi-red block on the flanks / engine cover, carbon-black tail
    parts: { body: '#c8ced4', fwFlap: '#151515', fwEnd: '#151515', fwTip: '#c8ced4', rwMain: '#151515', rwEnd: '#151515', rwFlap: '#f50537', halo: '#151515', mirror: '#c8ced4', fin: '#151515' },
    num: { ff: '"Instrument Sans", "Titillium Web", Arial, sans-serif', w: 600, ls: 0.04 },
    side(L) {
      const { k } = L; const BK = '#151515', RD = '#f03c14';
      k.poly([[0.35, 0.92], [0.55, 0.2], [-1.25, 0.2], [-1.25, 0.82], [-0.3, 1.02]], RD);              // Audi red block, geometric cut
      k.poly([[-1.25, TOP_V], [-1.25, LOW_V], [-2.6, LOW_V], [-2.6, TOP_V]], BK);                    // carbon-black tail
      k.region([[3.2, 0.14], [1.4, 0.16], [0.55, 0.2]], [[0.55, LOW_V], [3.2, LOW_V]], BK);
      L.partner('audi', 'ecRear', 'white');
      L.partner('revolut', 'sp', 'white'); L.partner('revolut', 'ec', 'white'); L.partner('bp', 'noseSide', 'color'); L.partner('castrol', 'spLow', 'white');
      L.partner('visitqatar', 'rwEnd', 'white'); L.partner('revolut', 'fwEnd', 'white'); L.partner('nexo', 'cockpit', 'black');
      L.number(1.3, 0.5, 0.08, BK); L.codeText(1.3, 0.62, 0.045, BK); L.number(-2.13, 0.62, 0.11, W);
    },
    top(L) {
      const { t } = L; t.poly([[0.5, -0.14], [0.5, 0.14], [-1.25, 0.14], [-1.25, -0.14]], '#f03c14');
      for (const s of [-1, 1]) t.poly([[0.45, s * 0.42], [0.45, s * 0.62], [-1.25, s * 0.62], [-1.25, s * 0.3]], '#f03c14');
      t.rect(-3.2, -1.25, -1.2, 1.2, '#151515');
      L.partnerTop('audi', 2.25, 0, 0.17, 0.08, 'mono:#f03c14'); L.partnerTop('audi', -0.6, 0, 0.24, 0.1, 'white', -Math.PI / 2);
      L.number(1.92, 0, 0.1, '#151515'); L.partner('revolut', 'rwTop', 'white'); L.partner('revolut', 'spTop', 'white');
    },
  });
})();
