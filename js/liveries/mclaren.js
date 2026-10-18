// Equation I - mclaren 2026 livery (owner: LIVERY-A). Registered with the livery core js/liveries.js, which documents the helpers
// (L.partner / partnerAt / emblem / mark / number / codeText / wordmark, L.k side kit, L.t top kit) and the part colour keys.
// Coordinates: metres, x forward (nose tip 3.0, front axle 1.75, rear axle -1.85), y up, z right.
(function () {
  const LV = EI.LIVERIES; if (!LV) return;
  const { TOP_V, LOW_V, W, MM } = LV.K;
  LV.register('mclaren', {
    parts: { body: '#ff8000', fwFlap: '#ff8000', fwEnd: '#2b2d31', fwTip: '#ff8000', rwMain: '#2b2d31', rwEnd: '#ff8000', rwFlap: '#2b2d31', halo: '#2b2d31', mirror: '#0f3d2e', fin: '#2b2d31' },
    num: { ff: '"Plus Jakarta Sans", "Titillium Web", Arial, sans-serif', w: 800, ls: -0.02 },
    side(L) {
      const { k } = L; const AN = '#2b2d31';
      const LINE = [[3.2, 0.2], [2.2, 0.27], [1.2, 0.31], [0.3, 0.3], [-0.5, 0.36], [-1.2, 0.5], [-1.9, 0.7], [-2.4, 0.9]];
      k.region(LINE, [[-2.6, LOW_V], [3.2, LOW_V]], AN);
      k.stroke(LINE.map(([x, y]) => [x, y + 0.012]), 0.008, '#47c7fc');
      k.poly([[0.02, 1.2], [0.02, 0.84], [-0.34, 0.84], [-0.4, 1.2]], '#0f3d2e');   // Allwyn airbox
      L.emblem('speedmark', 2.15, 0.45, 0.26, AN);
      L.partnerAt('mastercard', -0.15, 0.44, 0.42, 0.15, 'color', '#2b2d31'); L.partner('okx', 'spLow', 'white'); L.partner('allwyn', 'airbox', 'white'); L.partner('gemini', 'ec', 'black');
      L.partner('etihad', 'rwEnd', 'black'); L.partner('dell', 'cockpit', 'black'); L.partner('deloitte', 'fwEnd', 'white');
      L.number(1.0, 0.48, 0.09, AN); L.codeText(1.3, 0.62, 0.05, AN); L.number(-2.13, 0.62, 0.11, AN);
    },
    top(L) {
      const { t } = L; t.rect(-3.2, -1.25, -1.2, 1.2, '#2b2d31'); t.rect(-0.36, 0.02, -0.09, 0.09, '#0f3d2e');
      L.number(2.15, 0, 0.13, '#2b2d31'); L.partnerTop('mastercard', 1.62, 0, 0.15, 0.1, 'color', 0, '#2b2d31'); L.partner('etihad', 'rwTop', 'white'); L.partner('mastercard', 'spTop', 'black');
    },
  });
})();
