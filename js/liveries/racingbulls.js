// Equation I - racingbulls 2026 livery (owner: LIVERY-B). Registered with the livery core js/liveries.js, which documents the helpers
// (L.partner / partnerAt / emblem / mark / number / codeText / wordmark, L.k side kit, L.t top kit) and the part colour keys.
// Coordinates: metres, x forward (nose tip 3.0, front axle 1.75, rear axle -1.85), y up, z right.
(function () {
  const LV = EI.LIVERIES; if (!LV) return;
  const { TOP_V, LOW_V, W, MM } = LV.K;
  LV.register('racingbulls', {   // VCARB 03: white car, deep blue band along the nose and cockpit sides sweeping up over the engine cover
    parts: { body: '#f4f6fa', fwFlap: '#1634cc', fwEnd: '#1634cc', fwTip: '#e10600', rwMain: '#1634cc', rwEnd: '#1634cc', rwFlap: '#f4f6fa', halo: '#16171a', mirror: '#f4f6fa', fin: '#1634cc' },
    num: { ff: '"Unbounded", "Titillium Web", Arial, sans-serif', w: 800, sx: 0.8 },
    side(L) {
      const { k } = L; const B = '#1634cc';
      const UP = [[3.2, 0.33], [2.2, 0.44], [1.2, 0.56], [0.4, 0.66], [-0.4, 0.82], [-1.0, 1.0], [-1.4, 1.2]];
      const LO = [[3.2, 0.22], [2.2, 0.3], [1.2, 0.36], [0.4, 0.4], [-0.4, 0.48], [-1.2, 0.6], [-2.0, 0.75]];
      k.curve(UP.concat(LO.slice().reverse())); L.g.fillStyle = B; L.g.fill();
      k.region(UP, [[-2.6, TOP_V], [-2.6, 0.9]], B);
      k.stroke(LO.map(([x, y]) => [x, y - 0.012]), 0.012, '#e10600');
      k.region([[3.2, 0.13], [1.0, 0.15], [0, 0.16]], [[0, LOW_V], [3.2, LOW_V]], '#16171a');
      L.partner('visa', 'sp', 'color'); L.partner('cashapp', 'spFront', 'color'); L.partner('visa', 'ec', 'white'); L.partner('mobil1', 'spLow', 'color');
      L.partner('visa', 'rwEnd', 'white'); L.partner('cashapp', 'fwEnd', 'white'); L.emblem('bullMark', -1.45, 0.55, 0.4);
      L.number(1.3, 0.48, 0.07, W); L.codeText(1.3, 0.62, 0.045, W); L.number(-2.13, 0.62, 0.11, W);
    },
    top(L) {
      const { t } = L; t.rect(-3.2, -1.3, -1.2, 1.2, '#1634cc');
      for (const s of [-1, 1]) t.poly([[3.0, s * 0.05], [1.0, s * 0.12], [0.2, s * 0.2], [-1.3, s * 0.12], [-1.3, s * 0.18], [0.2, s * 0.27], [1.0, s * 0.17], [3.0, s * 0.08]], '#1634cc');
      L.emblem('bullMark', -0.75, 0, 0.3); L.emblem('bullMark', 2.4, 0, 0.15);
      L.number(2.05, 0, 0.1, '#1634cc'); L.partner('visa', 'rwTop', 'white'); L.partner('cashapp', 'spTop', 'color');
    },
  });
})();
