// Equation I - astonmartin 2026 livery (owner: LIVERY-C). Registered with the livery core js/liveries.js, which documents the helpers
// (L.partner / partnerAt / emblem / mark / number / codeText / wordmark, L.k side kit, L.t top kit) and the part colour keys.
// Coordinates: metres, x forward (nose tip 3.0, front axle 1.75, rear axle -1.85), y up, z right.
//
// Aston Martin Aramco F1 Team AMR26 (Honda), from race photos (China, Barcelona, Austria, Silverstone, Spa; swarm/f1/liveryC/refs):
//  - satin British racing green all over, black floor; a lime keyline from the nose along the lower chassis side up to the sidepod
//    inlet and another along the floor edge under the sidepod; lime hatching on the sidepod shoulder ahead of the title
//  - sidepod: a big white "aramco" low on the flank, BOSS above its front, cohere on the shoulder behind
//  - engine cover side: MAADEN (principal partner), CoreWeave + its CW mark at the airbox, "powered by Honda" behind, a small aramco
//    and the Glenfiddich stag at the back of the cover, Valvoline low by the rear tyre
//  - chassis side: pepperstone over the Aston Martin wings; cognizant on the floor ahead of the sidepod
//  - rear-wing endplate green with coinbase; the top element light blue with a white aramco; front-wing endplates GLENFIDDICH,
//    front-wing flaps black with aramco on top; nose top: the lime race number, Honda H, NexGen / xerox / NetApp, the wings at the tip
//  - halo green with Breitling on the top bar, BOSS on the mirrors
(function () {
  const LV = EI.LIVERIES; if (!LV) return;
  const { LOW_V, W } = LV.K;
  const BRG = '#07584f', BLK = '#101413', LM = '#cedc00', SKY = '#45b2e6';
  LV.register('astonmartin', {
    parts: { body: BRG, fwFlap: BLK, fwEnd: BRG, fwTip: BLK, rwMain: SKY, rwEnd: BRG, rwFlap: SKY, halo: BRG, mirror: BRG, fin: BRG },
    num: { ff: '"Titillium Web", Arial, sans-serif', w: 700, ls: 0.04 },
    halo: { inner: ['breitling', '@AstonMartinF1'] },
    side(L) {
      const { k, g } = L;
      // black floor / lower edge, lime keyline along it under the sidepod
      const FLOOR = [[3.25, 0.12], [2.2, 0.14], [1.2, 0.16], [0.4, 0.18], [-0.6, 0.19], [-1.4, 0.22], [-2.1, 0.26]];
      k.region(FLOOR, [[-2.6, 0.26], [-2.6, LOW_V], [3.25, LOW_V]], BLK);
      k.stroke([[0.65, 0.205], [-0.2, 0.215], [-1.0, 0.225]], 0.014, LM);
      // lime keyline: nose side -> chassis -> sidepod inlet edge
      // dark-green band behind the title, as on the car (sizes / positions measured on axle-aligned photos, liveryC/measure)
      k.region([[0.6, 0.6], [0.0, 0.64], [-0.6, 0.6], [-1.05, 0.5]], [[-1.05, 0.26], [0.0, 0.24], [0.6, 0.28]], '#0a302a');
      k.stroke([[3.0, 0.27], [2.5, 0.37], [2.0, 0.45], [1.5, 0.42], [1.0, 0.36], [0.5, 0.29], [0.15, 0.25]], 0.022, LM);
      // lime hatching on the sidepod shoulder ahead of the title
      g.save(); k.path([[0.1, 0.62], [0.1, 0.55], [-0.75, 0.52], [-0.75, 0.6]]); g.clip();
      for (let i = 0; i < 18; i++) { const x = 0.1 - i * 0.05; k.stroke([[x, 0.5], [x - 0.04, 0.63]], 0.011, LM); }
      g.restore();
      // sidepod + engine cover partners
      L.partnerAt('aramco', -0.32, 0.43, 0.86, 0.15, 'white');
      L.partnerAt('boss', 0.3, 0.56, 0.24, 0.07, 'white');
      L.partnerAt('cohere', -0.12, 0.72, 0.41, 0.08, 'white');
      L.partnerAt('maaden', -0.6, 0.77, 0.42, 0.15, 'white');
      L.partnerAt('coreweave', -0.12, 0.94, 0.32, 0.16, 'white');
      L.partnerAt('cognizant', -1.22, 0.8, 0.46, 0.07, 'white');
      L.partnerAt('hondawordmark', -1.1, 0.63, 0.34, 0.05, 'white');
      L.wordmark('Powered by', -1.06, 0.68, 0.026, W, { w: 600, ls: 0.02 });
      L.partnerAt('aramco', -1.35, 0.9, 0.22, 0.04, 'white');
      L.partnerAt('glenfiddich', -1.4, 1.02, 0.1, 0.07, 'white');
      L.partnerAt('valvolinemark', -1.05, 0.52, 0.09, 0.05, 'color'); L.partnerAt('valvolinewordmark', -1.27, 0.52, 0.3, 0.05, 'white');
      L.partnerAt('zscaler', -1.22, 0.9, 0.2, 0.09, 'white');
      // the small partner row along the floor edge under the title (Krown, Atlas Air, UKG)
      L.partnerAt('krown', 0.12, 0.3, 0.12, 0.05, 'white'); L.partnerAt('atlasair', -0.45, 0.3, 0.12, 0.05, 'white'); L.partnerAt('ukg', -0.72, 0.3, 0.1, 0.04, 'white');
      // chassis / cockpit / floor
      L.partnerAt('pepperstone', 1.22, 0.62, 0.42, 0.07, 'white');
      L.partnerAt('astonmartin', 1.2, 0.52, 0.36, 0.09, 'white');
      L.partnerAt('cognizant', 0.72, 0.28, 0.4, 0.07, 'white');
      L.partnerAt('cognition', 1.62, 0.42, 0.2, 0.04, 'white');
      L.number(2.05, 0.36, 0.07, LM);
      L.codeText(0.55, 0.69, 0.04, W);
      // rear-wing endplate (green) and front-wing endplate
      L.partnerAt('coinbase', -2.13, 0.9, 0.42, 0.09, 'white');
      L.partnerAt('servicenow', -2.13, 0.79, 0.34, 0.05, 'white'); L.partnerAt('jcb', -2.13, 0.64, 0.2, 0.06, 'white');
      L.partnerAt('glenfiddich', 2.66, 0.19, 0.42, 0.16, 'white');
      L.haloSide('Breitling', W, { w: 600, ls: 0.12 });
    },
    top(L) {
      // nose: lime number (reads from ahead), Honda H, then NexGen / xerox / NetApp / Pirelli, the wings at the tip
      L.number(1.5, 0, 0.1, LM);
      const stack = [['honda2026', 1.72, 0.08, 0.07], ['nexgen', 1.95, 0.12, 0.04], ['xerox', 2.07, 0.12, 0.035], ['netapp', 2.18, 0.12, 0.03], ['pirelli', 2.29, 0.11, 0.026], ['valvolinev', 2.42, 0.06, 0.045], ['astonmartin', 2.66, 0.12, 0.04]];
      for (const [id, x, w, h] of stack) L.partnerTop(id, x, 0, w, h, id === 'pirelli' ? 'color' : 'white', Math.PI);
      // sidepod tops: aramco; engine cover spine: MAADEN; rear wing top element (light blue): aramco
      L.partner('aramco', 'spTop', 'white'); L.partner('maaden', 'ecTop', 'white');
      L.t.rect(-2.32, -2.17, -0.5, 0.5, SKY); L.partnerTop('aramco', -2.05, 0, 0.9, 0.1, 'white', Math.PI); L.partnerTop('aramco', -2.245, 0, 0.9, 0.075, 'white', Math.PI);   // the rear wing reads from ahead (photos)
      // front-wing top flaps: aramco each side
      for (const z of [-0.62, 0.62]) L.partnerTop('aramco', 2.75, z, 0.46, 0.11, 'white', Math.PI);   // reads from ahead (photos)
      // halo top bar + front, mirrors
      L.haloTop('@AstonMartinF1', W, -1); L.haloTop('@aramco', W, 1); L.haloFront('breitling', 'white');
      L.partner('boss', 'mirrorTop', 'white');
    },
  });
  // front-wing main planes (LIVERY-LEAD default from the 2026 photos; a frontWing in the design above takes precedence)
  if (LV.designs['astonmartin'] && !LV.designs['astonmartin'].frontWing) LV.designs['astonmartin'].frontWing = function (L) { L.t.rect(2.15, 3.25, -1.1, 1.1, '#004c41');  };
})();
