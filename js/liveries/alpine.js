// Equation I - alpine 2026 livery (owner: LIVERY-B). Registered with the livery core js/liveries.js, which documents the helpers
// (L.partner / partnerAt / emblem / mark / number / codeText / wordmark, L.k side kit, L.t top kit) and the part colour keys.
// Coordinates: metres, x forward (nose tip 3.0, front axle 1.75, rear axle -1.85), y up, z right.
(function () {
  const LV = EI.LIVERIES; if (!LV) return;
  const { TOP_V, LOW_V, W, MM } = LV.K;
  LV.register('alpine', {   // A526: gloss Alpine blue front, BWT pink over the sidepods and engine cover, navy floor edge
    parts: { body: '#0a63c4', fwFlap: '#0a5fc0', fwEnd: '#0a5fc0', fwTip: '#ff5fa8', rwMain: '#ff5fa8', rwEnd: '#0a5fc0', rwFlap: '#0a5fc0', halo: '#0b1630', mirror: '#ff5fa8', fin: '#0b1630' },
    num: { ff: '"Titillium Web", Arial, sans-serif', w: 700, it: 1, ls: 0.02 },
    side(L) {
      const { k, g } = L; const NV = '#0b1630', PK = '#ff5fa8';
      const gr = g.createLinearGradient(k.X(0.95), 0, k.X(0.35), 0); gr.addColorStop(0, 'rgba(255,95,168,0)'); gr.addColorStop(1, PK);
      k.poly([[0.95, TOP_V], [0.95, LOW_V], [-2.6, LOW_V], [-2.6, TOP_V]], gr);
      k.region([[3.2, 0.16], [1.0, 0.18], [-0.6, 0.2], [-2.0, 0.24]], [[-2.4, LOW_V], [3.2, LOW_V]], NV);
      L.emblem('alpineA', 2.1, 0.43, 0.08, W); L.emblem('alpineA', -1.05, 0.66, 0.13, W);
      L.partner('bwt', 'sp', 'white'); L.partner('msccruises', 'ec', 'white'); L.partner('mercadolibre', 'spFront', 'color'); L.partner('eni', 'spLow', 'white');
      L.partner('bwt', 'rwEnd', 'white'); L.partner('bwt', 'fwEnd', 'white');
      L.number(1.3, 0.48, 0.075, W); L.codeText(1.3, 0.62, 0.045, W); L.number(-2.13, 0.62, 0.11, W);
    },
    top(L) {
      const { t, g } = L; t.poly([[0.6, -1.2], [0.6, 1.2], [-3.2, 1.2], [-3.2, -1.2]], '#ff5fa8');
      L.emblem('alpineA', 2.45, 0, 0.1, W); L.number(2.12, 0, 0.12, W); L.partner('bwt', 'spTop', 'white'); L.partner('bwt', 'rwTop', 'white'); L.partner('msccruises', 'ecTop', 'white');
    },
  });
})();
