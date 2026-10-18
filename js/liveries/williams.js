// Equation I - williams 2026 livery (owner: LIVERY-C). Registered with the livery core js/liveries.js, which documents the helpers
// (L.partner / partnerAt / emblem / mark / number / codeText / wordmark, L.k side kit, L.t top kit) and the part colour keys.
// Coordinates: metres, x forward (nose tip 3.0, front axle 1.75, rear axle -1.85), y up, z right.
(function () {
  const LV = EI.LIVERIES; if (!LV) return;
  const { TOP_V, LOW_V, W, MM } = LV.K;
  LV.register('williams', {
    parts: { body: '#1a5bd8', fwFlap: '#ffffff', fwEnd: '#0a1433', fwTip: '#1a5bd8', rwMain: '#0a1433', rwEnd: '#1a5bd8', rwFlap: '#ffffff', halo: '#0a1433', mirror: '#1a5bd8', fin: '#0a1433' },
    num: { ff: '"Unbounded", "Titillium Web", Arial, sans-serif', w: 700, sx: 0.88 },
    side(L) {
      const { k } = L; const NV = '#0a1433';
      const LINE = [[3.2, 0.15], [1.7, 0.2], [0.9, 0.28], [0.2, 0.45], [-0.4, 0.68], [-0.9, 0.95], [-1.3, 1.3]];
      k.region(LINE, [[-2.6, TOP_V], [-2.6, LOW_V], [3.2, LOW_V]], NV);
      k.stroke(LINE.map(([x, y]) => [x + 0.02, y + 0.03]), 0.016, W); k.stroke(LINE.map(([x, y]) => [x + 0.035, y + 0.055]), 0.01, '#e4002b');
      k.poly([[0.55, 0.5], [0.45, 0.33], [-0.75, 0.36], [-0.65, 0.53]], '#00aeef');   // light-blue partner panel on the sidepod
      L.emblem('williamsW', 1.95, 0.45, 0.07, W);
      L.partnerAt('barclays', -0.1, 0.435, 0.95, 0.1, 'white'); L.partner('atlassian', 'ec', 'white'); L.partner('duracell', 'airbox', 'white'); L.partner('komatsu', 'ecRear', 'white');
      L.partner('kraken', 'rwEnd', 'white'); L.partner('gulf', 'fwEnd', 'color'); L.partner('claude', 'noseSide', 'white'); L.partner('bny', 'spLow', 'white');
      L.number(1.05, 0.5, 0.085, W); L.codeText(1.3, 0.63, 0.05, W); L.number(-2.13, 0.62, 0.11, W);
    },
    top(L) {
      const { t } = L; t.poly([[-0.1, -1.2], [-0.1, 1.2], [-3.2, 1.2], [-3.2, -1.2]], '#0a1433'); t.rect(-0.1, -0.04, -1.2, 1.2, W); t.rect(-0.04, 0.0, -1.2, 1.2, '#e4002b');
      L.emblem('williamsW', 2.45, 0, 0.06, W); L.number(2.12, 0, 0.12, W); L.partner('atlassian', 'rwTop', 'white'); L.partner('atlassian', 'spTop', 'white');
    },
  });
})();
