// Equation I - williams 2026 livery (owner: LIVERY-C). Registered with the livery core js/liveries.js, which documents the helpers
// (L.partner / partnerAt / emblem / mark / number / codeText / wordmark, L.k side kit, L.t top kit) and the part colour keys.
// Coordinates: metres, x forward (nose tip 3.0, front axle 1.75, rear axle -1.85), y up, z right.
//
// Atlassian Williams F1 Team FW48 (2026), from race photos (Australia, China, Austria, Silverstone, Spa, Baku; swarm/f1/liveryC/refs):
//  - gloss Williams blue body; black chassis side from the nose tip back to the sidepod inlet, under the cockpit rim, with a thin
//    red + white keyline on the nose; black floor, undercut and the bodywork behind the sidepods; black airbox with DURACELL
//  - sidepod: blue top, a light-blue Barclays band sweeping down to the rear, a white block under it with KOMATSU in navy
//  - engine cover side: Claude + kraken ahead of a big white ATLASSIAN, the Atlassian mark above it; Gulf roundel low behind the
//    sidepod; Wilkinson Sword on the fin
//  - chassis side: Stephens (white on black), brillio on the cockpit rim, KEEPER on the floor edge ahead of the sidepod
//  - rear-wing endplate: navy box with KOMATSU over a white lower half with the Estrella Galicia badge; top flap light blue with
//    BARCLAYS, main plane black (ATLASSIAN on its leading face, seen from ahead)
//  - front wing: black flaps with white blocks, black endplates with betway; nose top: the number + a stack of small partners
//  - halo and mirrors black (BARCLAYS on the mirror pods), Atlassian / Williams handles on the halo top bar
(function () {
  const LV = EI.LIVERIES; if (!LV) return;
  const { TOP_V, LOW_V, W } = LV.K;
  const BLUE = '#1681da', BLK = '#121417', LB = '#62bdf0', NAVY = '#1d2a8f', RED = '#e4002b';
  // black / blue boundary: nose side keyline -> cockpit rim -> sidepod inlet -> under the sidepod -> up behind it to the cover
  const NOSE = [[3.25, 0.25], [2.7, 0.33], [2.1, 0.43], [1.5, 0.54], [1.05, 0.62]];
  LV.register('williams', {
    parts: { body: BLUE, fwFlap: BLK, fwEnd: BLK, fwTip: '#f4f6f8', rwMain: BLK, rwEnd: '#eef1f4', rwFlap: LB, halo: BLK, mirror: BLK, fin: BLUE },
    num: { ff: '"Titillium Web", Arial, sans-serif', w: 700, it: 1, ls: 0.02 },
    halo: { inner: ['@WilliamsRacing', 'atlassian'] },
    side(L) {
      const { k } = L;
      // black lower body: nose side + chassis side under the cockpit rim, the sidepod undercut and floor, the rear body behind the pod
      k.region(NOSE.concat([[0.85, 0.63], [0.66, 0.6], [0.5, 0.36], [0.3, 0.26], [0.0, 0.24], [-0.6, 0.2], [-1.1, 0.26], [-1.3, 0.46], [-1.45, 0.66], [-1.75, 0.72], [-2.0, 0.66]]),
        [[-2.6, 0.66], [-2.6, LOW_V], [3.25, LOW_V]], BLK);
      // red + white keyline along the top of the black on the nose (FW14B / FW18 homage)
      k.stroke(NOSE.map(([x, y]) => [x, y + 0.012]), 0.009, W); k.stroke(NOSE.map(([x, y]) => [x, y + 0.024]), 0.008, RED);
      // sidepod: light-blue Barclays band sweeping down to the rear, the white KOMATSU block under it
      k.region([[0.6, 0.66], [0.2, 0.65], [-0.3, 0.62], [-0.85, 0.57], [-1.25, 0.51]], [[-1.3, 0.44], [-0.8, 0.47], [-0.3, 0.5], [0.2, 0.52], [0.55, 0.54]], LB);
      k.region([[0.45, 0.52], [-0.3, 0.5], [-0.8, 0.47], [-1.3, 0.44]], [[-1.34, 0.25], [-0.9, 0.22], [-0.4, 0.22], [0.0, 0.26], [0.35, 0.4]], '#f6f8fa');
      // airbox + roll hoop block (black) and the Atlassian mark on the cover above the title
      k.poly([[0.12, TOP_V], [0.12, 1.0], [-0.1, 0.98], [-0.42, 0.96], [-0.6, TOP_V]], BLK);
      L.partnerAt('duracell', -0.15, 1.0, 0.3, 0.06, 'white');   // sizes / positions measured on axle-aligned photos (liveryC/measure)
      L.partnerAt('atlassian', -0.88, 0.84, 0.88, 0.125, 'white');
      L.partnerAt('claude', 0.04, 0.745, 0.3, 0.06, 'white'); L.partnerAt('kraken', -0.28, 0.745, 0.3, 0.06, 'white');
      L.partnerAt('barclays', -0.1, 0.565, 0.6, 0.08, 'white');
      L.partnerAt('komatsu', -0.6, 0.36, 0.95, 0.14, 'color');
      L.partnerAt('gulf', -1.25, 0.57, 0.2, 0.2, 'color');
      L.partnerAt('vastdata', -1.6, 0.85, 0.16, 0.04, 'white');
      // chassis / cockpit / floor
      L.wordmark('Stephens', 1.15, 0.5, 0.09, W, { ff: 'Georgia, "Times New Roman", serif', w: 700, ls: 0.0 });
      L.wordmark('brillio', 1.0, 0.63, 0.05, W, { ff: '"Plus Jakarta Sans", Arial, sans-serif', w: 800, ls: -0.02 });
      L.partnerAt('keeper', 0.72, 0.36, 0.42, 0.07, 'color');
      L.partnerAt('betway', 2.25, 0.33, 0.2, 0.045, 'white');
      L.partnerAt('claude', 1.75, 0.43, 0.16, 0.035, 'white');
      // rear-wing endplate: navy KOMATSU box over the white lower half with the Estrella Galicia badge
      k.poly([[-1.88, 1.02], [-2.4, 1.02], [-2.4, 0.8], [-1.88, 0.8]], NAVY);
      L.partnerAt('komatsu', -2.13, 0.905, 0.44, 0.085, 'white');
      L.partnerAt('estrellagalicia', -2.13, 0.66, 0.16, 0.11, 'color');
      // front-wing endplate
      L.partnerAt('betway', 2.66, 0.17, 0.34, 0.09, 'white');
      // driver name on the cockpit rim, number on the engine cover rear
      L.codeText(0.55, 0.69, 0.04, W);
      L.number(-1.62, 0.83, 0.07, W);
      L.haloSide('atlassian.com/williams', W, { w: 600 });
    },
    top(L) {
      // engine cover: the Atlassian mark each side of the spine, Wilkinson Sword on the fin top
      L.partner('atlassian', 'ecTop', 'white');
      // sidepod tops: Barclays
      L.partner('barclays', 'spTop', 'white');
      // nose top: number, then the stacked partners (Barclays, BNY, Gulf, Komatsu, Claude, betway, brillio)
      L.number(1.5, 0, 0.1, W);
      L.partnerTop('williams', 2.6, 0, 0.12, 0.03, 'white', Math.PI);
      const stack = [['barclays', 1.72], ['gulf', 1.86], ['komatsu', 1.98], ['claude', 2.1], ['betway', 2.22], ['vastdata', 2.34]];
      for (const [id, x] of stack) L.partnerTop(id, x, 0, 0.14, 0.05, id === 'gulf' ? 'color' : 'white', Math.PI);   // read from ahead, like the real stack
      // rear wing: light-blue top flap with BARCLAYS
      L.t.rect(-2.32, -2.17, -0.5, 0.5, LB); L.partnerTop('barclays', -2.245, 0, 0.8, 0.07, 'white'); L.partnerTop('atlassian', -2.05, 0, 0.85, 0.08, 'white', Math.PI);   // flap top reads from behind, main plane from ahead (photos)
      // halo top bar: team handles reading from the cockpit; Atlassian on the front pillar
      L.haloTop('@WilliamsRacing', W, -1); L.haloTop('@Atlassian', W, 1);
      L.haloFront('atlassian', 'white');
      L.partner('barclays', 'mirrorTop', 'white');
    },
  });
  // front-wing main planes (LIVERY-LEAD default from the 2026 photos; a frontWing in the design above takes precedence)
  if (LV.designs['williams'] && !LV.designs['williams'].frontWing) LV.designs['williams'].frontWing = function (L) { L.t.rect(2.15, 3.25, -1.1, 1.1, '#0a1433');  };
})();
