// Equation I - mercedes 2026 livery (owner: LIVERY-A). Registered with the livery core js/liveries.js, which documents the helpers
// (L.partner / partnerAt / emblem / mark / number / codeText / wordmark, L.k side kit, L.t top kit) and the part colour keys.
// Coordinates: metres, x forward (nose tip 3.0, front axle 1.75, rear axle -1.85), y up, z right.
(function () {
  const LV = EI.LIVERIES; if (!LV) return;
  const { TOP_V, LOW_V, W, MM } = LV.K;
  LV.register('mercedes', {   // W17: black car, silver nose spine and cockpit shoulders, a Petronas-teal flow line down the side
    parts: { body: '#0e0f11', fwFlap: '#0e0f11', fwEnd: '#0e0f11', fwTip: '#00a19c', rwMain: '#0e0f11', rwEnd: '#0e0f11', rwFlap: '#0e0f11', halo: '#0e0f11', mirror: '#0e0f11', fin: '#0e0f11' },
    num: { ff: '"Titillium Web", Arial, sans-serif', w: 700, ls: 0.02 },
    side(L) {
      const { k, g } = L; const SIL = '#c5c9ce', TEAL = '#00a19c';
      // silver shoulder over the cockpit side / airbox, fading into the black towards the rear
      const gr = g.createLinearGradient(k.X(1.2), 0, k.X(-1.3), 0); gr.addColorStop(0, SIL); gr.addColorStop(0.55, '#8d9298'); gr.addColorStop(1, 'rgba(14,15,17,0)');
      k.region([[1.6, 0.56], [0.9, 0.64], [0.2, 0.7], [-0.6, 0.74], [-1.4, 0.66]], [[-1.4, TOP_V], [1.6, TOP_V]], gr);
      g.save(); g.globalAlpha = 0.5; for (let i = 0; i < 7; i++) for (let j = 0; j < 3; j++) { const x = 0.05 - i * 0.13 - (j % 2) * 0.065, y = 0.76 + j * 0.055; k.poly([[x, y + 0.025], [x + 0.05, y], [x, y - 0.025], [x - 0.05, y]], '#0e0f11'); } g.restore();   // AMG diamonds
      const FLOW = [[3.05, 0.2], [2.2, 0.31], [1.4, 0.4], [0.7, 0.47], [0.0, 0.46], [-0.7, 0.38], [-1.5, 0.3]];
      k.stroke(FLOW, 0.032, TEAL); k.stroke(FLOW.map(([x, y]) => [x, y + 0.035]), 0.008, SIL);
      L.mark('mercedes', -1.05, 0.55, 0.15, 0.15, 'mono:#c5c9ce', 'star', 0.075, SIL);
      L.wordmark('PETRONAS', -0.2, 0.44, 0.085, W, { w: 900, ls: 0.06 }); L.partnerAt('petronas', 0.42, 0.44, 0.1, 0.1, 'color'); L.partner('microsoft', 'airbox', 'black'); L.partner('ineos', 'spLow', 'white');
      L.partner('crowdstrike', 'rwEnd', 'white'); L.partner('microsoft', 'fwEnd', 'white'); L.partner('teamviewer', 'noseSide', 'white');
      L.number(1.05, 0.56, 0.08, '#0e0f11'); L.codeText(1.3, 0.69, 0.045, '#0e0f11');
      L.number(-2.13, 0.62, 0.11, W);
    },
    top(L) {
      const { t, g } = L; const SIL = '#c5c9ce';
      t.poly([[3.05, -0.05], [3.05, 0.05], [1.0, 0.12], [0.3, 0.2], [-0.4, 0.14], [-0.4, -0.14], [0.3, -0.2], [1.0, -0.12]], SIL);   // nose spine + cockpit shoulders
      for (const s of [-1, 1]) t.poly([[3.0, s * 0.055], [3.0, s * 0.07], [1.0, s * 0.14], [1.0, s * 0.125]], '#00a19c');
      L.mark('mercedes', 2.6, 0, 0.09, 0.09, 'black', 'star', 0.045, '#0e0f11');
      L.number(2.2, 0, 0.09, '#0e0f11'); L.wordmark('PETRONAS', -2.1, 0, 0.09, W, { w: 900, ls: 0.06 }); L.partner('petronas', 'spTop', 'color');
    },
  });
})();
