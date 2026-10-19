// Equation I - cadillac 2026 livery (owner: LIVERY-C). Registered with the livery core js/liveries.js, which documents the helpers
// (L.partner / partnerAt / emblem / mark / number / codeText / wordmark, L.k side kit, L.t top kit) and the part colour keys.
// Coordinates: metres, x forward (nose tip 3.0, front axle 1.75, rear axle -1.85), y up, z right.
//
// Cadillac Formula 1 Team MAC-26 (Ferrari PU), the symmetrical livery raced since the Austrian GP (round 8), from race photos
// (Austria, Baku, Monza; earlier rounds = the split black / white car; swarm/f1/liveryC/refs):
//  - white upper body: wide white nose top, white cockpit surround, sidepods and engine cover; black nose / chassis sides, floor,
//    undercut and the rear body under the cover; a "glitch" of black bars dissolving the white into the black at the cover's rear
//  - sidepod: the TWG AI lock-up big in black; chassis side: the white Cadillac script over the black, Claro under it, Jim Beam on
//    the floor fence ahead of the sidepod; engine cover: the Cadillac crest at the airbox, CORE SCIENTIFIC along the cover
//  - rear-wing endplates white with IFS (black), the top element white with CADILLAC; front-wing endplates white with 3M,
//    front-wing flaps white with black stripes; nose top: Tommy Hilfiger flag, TWG AI, Pirelli, Tenneco, Core Scientific, crest
//  - halo and mirrors white (IFS on the halo side), the number white on the black nose side ahead of the cockpit
(function () {
  const LV = EI.LIVERIES; if (!LV) return;
  const { LOW_V, W } = LV.K;
  const WH = '#f3f4f6', BK = '#121314';
  LV.register('cadillac', {
    parts: { body: WH, fwFlap: WH, fwEnd: WH, fwTip: BK, rwMain: WH, rwEnd: WH, rwFlap: BK, halo: WH, mirror: WH, fin: WH },
    num: { ff: '"Titillium Web", Arial, sans-serif', w: 700, ls: 0.04 },
    halo: { inner: ['@Cadillac_F1', 'ifs'] },
    side(L) {
      const { k } = L;
      // black: nose / chassis side under the white top, the sidepod undercut and floor, the lower rear body
      k.region([[3.25, 0.36], [2.6, 0.44], [2.0, 0.52], [1.5, 0.6], [1.05, 0.66], [0.8, 0.64], [0.6, 0.52], [0.45, 0.24], [0.0, 0.18], [-0.8, 0.2], [-1.3, 0.3], [-1.6, 0.48], [-2.0, 0.56]],
        [[-2.6, 0.56], [-2.6, LOW_V], [3.25, LOW_V]], BK);
      // the "glitch": black bars breaking up the white at the back of the engine cover / sidepod
      const bars = [[-0.95, 0.88, 0.14], [-0.88, 0.84, 0.3], [-1.0, 0.8, 0.22], [-0.9, 0.76, 0.42], [-1.05, 0.72, 0.3], [-0.95, 0.68, 0.5], [-1.1, 0.64, 0.36], [-1.0, 0.6, 0.55], [-1.15, 0.56, 0.42], [-1.05, 0.52, 0.5]];   // measured on axle-aligned photos (liveryC/measure)
      for (const [x, y, w] of bars) k.poly([[x, y + 0.014], [x - w, y + 0.014], [x - w, y - 0.014], [x, y - 0.014]], BK);
      k.poly([[3.0, 0.02], [2.42, 0.02], [2.42, 0.24], [3.0, 0.24]], WH);   // white front-wing endplates
      // sidepod title + engine cover
      L.partnerAt('twgai', -0.25, 0.4, 1.05, 0.24, 'black');
      L.partnerAt('cadillaccrest', -0.42, 0.9, 0.34, 0.13, 'color');
      L.partnerAt('corescientific', 0.06, 0.75, 0.48, 0.055, 'black');
      // chassis side: Cadillac script, Claro, the number; floor fence: Jim Beam
      L.wordmark('Cadillac', 1.08, 0.6, 0.085, W, { ff: 'Georgia, "Times New Roman", serif', w: 700, it: 1, ls: 0.0 });
      L.partnerAt('clarowordmark', 0.78, 0.5, 0.27, 0.075, 'white');
      L.number(1.85, 0.5, 0.065, W);
      L.partnerAt('jimbeam', 0.66, 0.25, 0.24, 0.17, 'white');
      L.partnerAt('tenneco', -1.8, 0.4, 0.22, 0.04, 'white');
      L.codeText(0.55, 0.69, 0.04, BK);
      // rear-wing endplate (white) with IFS; front-wing endplate (white) with 3M
      L.partnerAt('ifs', -2.13, 0.84, 0.34, 0.12, 'black');
      L.wordmark('USA', -2.13, 0.97, 0.03, BK, { w: 700, ls: 0.2 });
      L.partnerAt('3m', 2.68, 0.17, 0.2, 0.1, 'black');
      L.haloSide('IFS', BK, { w: 700, ls: 0.1 });
    },
    top(L) {
      // black nose flanks: only a white band runs down the nose top (narrow at the tip, widening to the cockpit)
      for (const sg of [-1, 1]) L.t.poly([[3.25, sg * 0.045], [2.4, sg * 0.07], [1.6, sg * 0.1], [1.05, sg * 0.13], [1.05, sg * 0.6], [3.25, sg * 0.6]], BK);
      // nose top (reads from ahead): crest at the tip, then the number, Tommy Hilfiger flag, TWG AI, Pirelli, Tenneco, Core Scientific
      L.partnerTop('cadillaccrest', 2.62, 0, 0.1, 0.045, 'color', Math.PI);
      const stack = [['corescientific', 2.4, 0.16, 0.025], ['tenneco', 2.25, 0.14, 0.026], ['pirelli', 2.1, 0.12, 0.028], ['twgai', 1.92, 0.13, 0.035], ['tommyhilfiger', 1.75, 0.07, 0.045]];
      for (const [id, x, w, h] of stack) L.partnerTop(id, x, 0, w, h, id === 'pirelli' || id === 'tommyhilfiger' ? 'color' : 'black', Math.PI);
      // engine cover top: crest; rear wing top element: CADILLAC; sidepod tops: TWG AI
      L.partnerTop('cadillaccrest', -0.5, 0, 0.14, 0.06, 'color');
      L.partnerTop('cadillac', -2.1, 0, 0.82, 0.07, 'black');
      L.partner('twgai', 'spTop', 'black');
      // halo top bar + front, mirrors
      L.haloTop('@Cadillac_F1', BK, -1); L.haloTop('cadillacf1team.com', BK, 1); L.haloFront('ifs', 'black');
      L.partner('ifs', 'mirrorTop', 'black');
    },
  });
})();
