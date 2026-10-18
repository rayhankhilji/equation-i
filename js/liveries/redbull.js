// Equation I - redbull 2026 livery (owner: LIVERY-A). Registered with the livery core js/liveries.js, which documents the helpers
// (L.partner / partnerAt / emblem / mark / number / codeText / wordmark, L.k side kit, L.t top kit) and the part colour keys.
// Coordinates: metres, x forward (nose tip 3.0, front axle 1.75, rear axle -1.85), y up, z right.
(function () {
  const LV = EI.LIVERIES; if (!LV) return;
  const { TOP_V, LOW_V, W, MM } = LV.K;
  LV.register('redbull', {   // RB22: gloss dark Red Bull blue with a woven sheen, black lower body, red nose tip, the sun-and-bull big on the cover
    parts: { body: '#1b2554', fwFlap: '#1b2554', fwEnd: '#db0a40', fwTip: '#db0a40', rwMain: '#1b2554', rwEnd: '#1b2554', rwFlap: '#0b0c12', halo: '#0b0c12', mirror: '#1b2554', fin: '#0b0c12' },
    num: { ff: '"Titillium Web", Arial, sans-serif', w: 900, it: 1, sx: 0.84, skew: 0.12 },
    side(L) {
      const { k, g } = L;
      g.save(); g.globalAlpha = 0.08; for (let x = -2.6; x < 3.2; x += 0.05) k.stroke([[x, -0.1], [x + 0.6, 1.3]], 0.012, '#9fb4ff'); g.restore();   // jacquard sheen
      const LINE = [[3.2, 0.19], [2.0, 0.24], [1.0, 0.27], [0.0, 0.28], [-0.9, 0.36], [-1.6, 0.5], [-2.3, 0.7]];
      k.region(LINE, [[-2.6, LOW_V], [3.2, LOW_V]], '#0b0c12'); k.stroke(LINE.map(([x, y]) => [x, y + 0.012]), 0.014, '#db0a40');
      k.poly([[3.2, 0.1], [3.2, 0.4], [2.75, 0.4], [2.6, 0.1]], '#db0a40');
      L.emblem('bullMark', -0.95, 0.68, 0.5); L.partnerAt('redbull', -0.95, 0.5, 0.5, 0.09, 'color');
      L.partner('oracle', 'sp', 'white'); L.partner('ford', 'spFront', 'color'); L.partner('mobil1', 'spLow', 'white');
      L.partner('oracle', 'rwEnd', 'white'); L.partner('att', 'noseSide', 'white'); L.partner('tagheuer', 'cockpit', 'white'); L.partner('hardrock', 'fwEnd', 'white');
      L.number(1.25, 0.5, 0.085, W); L.codeText(1.3, 0.62, 0.045, W); L.number(-2.13, 0.62, 0.11, W);
    },
    top(L) {
      const { t } = L; t.rect(2.62, 3.2, -1, 1, '#db0a40'); L.emblem('bullMark', -0.95, 0, 0.34);
      L.emblem('bullMark', 2.35, 0, 0.18); L.number(1.98, 0, 0.11, W); L.partner('oracle', 'rwTop', 'white'); L.partner('oracle', 'spTop', 'white');
    },
  });
})();
