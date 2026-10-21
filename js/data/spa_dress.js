// Equation I - Spa-Francorchamps trackside dressing (SPA-DRESS). DATA ONLY: loaded after spa.js / spa_env.js / spa_stitch.js, it overrides and
// extends the track data (furniture, barriers, kerbs, painted run-off, catch fence), so a regeneration of spa.js keeps this placement.
// Lap distance s = game s (start line s 0, lap 6987.4 m). 'out' / 'in' = outside / inside of the bend there; side +-1 as in the other tracks'
// dress files (+1 = the "R" arrays, -1 = the "L" arrays = the pit-lane side at Spa). Corner keys are the names GEN emits (T9 "Speaker's Corner",
// T14 "Stavelot", T15 "Paul Frère"). Gravel beds stay GEN's data.runoff (OSM + 2022 works); nothing here moves a wall or the drivable surface.
// Consumers: js/infra.js (marshals, cameraTowers, scaffolds, screens, billboards, gantries, hoardZones, tec / tyre corners), js/track.js
// (kerbAlt, runoffSchemes, runoffGreen, gravelTint, sausages, brakeStops / brakeBoards, bridges, fence), js/ads.js (VENUES.spa).
(function () {
  const T = EI.TRACKS && EI.TRACKS.spa; if (!T) return;
  const F = T.furniture = Object.assign({}, T.furniture || {});

  // ---- kerbs: red / white everywhere, red / yellow on the Raidillon crest and exit and through Blanchimont (photos raidillon_*, blanchimont_*)
  T.kerbAlt = [[1040, 1255, 'ry'], [5640, 6130, 'ry']];
  // sausage kerbs (yellow / black): La Source apex, Les Combes exit, the Fagnes chicane, the Bus Stop
  T.sausageCorners = ['La Source', 'Les Combes', 'Fagnes', 'Bus Stop'];

  // ---- painted run-off (the 2022+ state, photos): bright green strip behind every kerb (the strip at Eau Rouge / Bus Stop), yellow with dark red bands on the
  // Raidillon apron, teal with an orange-red edge band at Blanchimont, green paint at the Bus Stop. [corner name, pattern, colour A, colour B]
  T.runoffGreen = '#2a8a3a';
  T.runoffSchemes = [
    ['La Source', 2, '#dfae1c', '#9e2219'],
    ['Raidillon', 2, '#dfae1c', '#9e2219'],
    ['Blanchimont', 0, '#1b8f89', '#c24a1c'],
    ['Bus Stop', 3, '#2a8a3a', '#2a8a3a'],
  ];
  T.gravelTint = [1.6, 1.5, 1.32];   // pale grey-beige Spa gravel

  // ---- marshal posts: the corners' outsides, then a post every ~200-250 m along the straights, sides alternating (infra keeps clear of the pit lane, stands, the corridor)
  F.marshals = [
    [6770, 1], [60, 1],                                                   // pit straight (grandstand side)
    [215, 'out'], [330, 'out'], [520, 1], [690, -1], [810, 1],             // La Source and the descent
    [905, 'out'], [1030, 'out'], [1180, 'out'],                            // Eau Rouge / Raidillon
    [1390, -1], [1620, 1], [1850, -1], [2090, 1],                          // Kemmel
    [2245, 'out'], [2380, 'out'], [2540, 'out'], [2720, 1],                // Les Combes, Malmedy
    [2860, 'out'], [3040, 1], [3180, 'out'], [3400, -1],                   // Bruxelles, Speaker's Corner
    [3640, 'in'], [3790, 'in'], [3980, 'in'],                              // Pouhon
    [4200, -1], [4340, 'in'], [4500, 'out'], [4660, 1],                    // Fagnes
    [4800, 'out'], [4980, 'out'], [5200, 1], [5440, -1],                   // Stavelot, Paul Frère
    [5720, 'in'], [5900, 'in'], [6040, 'in'], [6240, 'in'],                // Blanchimont
    [6420, -1], [6575, 'out'], [6700, 1],                                  // Bus Stop
  ];
  // ---- TV: camera towers [s, which] (+1 = inside of the bend / right of a straight, -1 = outside), scaffolds, screens, billboards (10 x 3.5 m, rare), no cranes
  F.cameraTowers = [[1120, -1], [1850, 1], [2275, 1], [2560, -1], [3700, 1], [4420, -1], [5900, 1], [6585, -1]];
  F.scaffolds = [300, 1060, 2290, 2890, 3700, 4400, 5800];
  F.cranes = [];
  F.screens = [[313, 'out'], [1093, 'out'], [2333, 'out'], [6633, 'out']];
  F.billboards = [120, 1493, 2693, 4143, 5293, 6393];
  // ---- advertising bridges over the track (partners painted by Ads.paintBridge via VENUES.spa.bridge) and the lattice gantries with the 4:1 partner panels (infra.js)
  F.bridges = [[1600, 'lumi', 'plum'], [4640, 'intake', 'brown'], [5600, 'intake2', 'blue']];
  F.gantries = [2120, 3400];
  F.floodlights = [];
  // concrete spectator walls with sponsor covers behind the tyre wall: only at the tight corners (the rest of the lap is Armco + fence)
  F.sponsorWallCorners = ['La Source', 'Bus Stop'];
  // partner boards (hoardings, 5 x 1 m): [s0, s1, side (0 = both), spacing m]; a continuous wall opposite the pits, sparse boards elsewhere,
  // none in the Eau Rouge dip, the Kemmel boards on the left fence only
  F.hoardZones = [
    [6690, 330, 1, 5.35], [450, 840, -1, 10.7], [1150, 1240, 0, 22], [1300, 2160, 1, 48], [2190, 2440, 0, 16], [2560, 2830, 1, 27], [2860, 3000, 0, 16],
    [3150, 3330, 0, 27], [3560, 4000, 0, 16], [4300, 4560, 0, 21], [4780, 4900, 0, 21], [5100, 5560, 1, 43], [5660, 6100, 0, 16], [6500, 6700, 0, 10.7],
  ];

  // ---- braking zone boards: white 300 / 200 / 150 / 100 / 50 at La Source, 300 / 200 / 100 at the other heavy stops
  T.brakeStops = ['La Source', 'Les Combes', 'Bruxelles', 'Pouhon', 'Stavelot', 'Bus Stop'];
  T.brakeBoards = { 'La Source': [300, 200, 150, 100, 50], default: [300, 200, 100] };
  // painted partner logos on the run-off tarmac (corner, run-off row 0-3, length m): the La Source and Bus Stop aprons only
  T.logoSpots = [['La Source', 0, 34], ['Bus Stop', 1, 30]];

  // ---- barriers: red / white cushion blocks (TecPro) on the outsides at Eau Rouge, Pouhon and the Bus Stop, tyre walls at the other heavy stops (grey Armco elsewhere)
  T.tecProCorners = ['Eau Rouge', 'Pouhon', 'Bus Stop'];
  T.tyreCorners = ['La Source', 'Eau Rouge', 'Raidillon', 'Les Combes', 'Bruxelles', 'Pouhon', 'Stavelot', 'Blanchimont', 'Bus Stop'];

  // ---- the catch fence: dark-green welded mesh on dark-green posts, 3.6 m (kept on Low: it is in every photo); the debris fence along the pit wall is low
  T.fence = Object.assign({}, T.fence || {}, {
    h: 3.6, op: 0.92, mesh: 'rgba(24,66,38,0.95)', postColor: 0x2c4a36, low: true,
    runs: [
      [6577, 445, -1, 2.4],      // pit wall: low debris fence along the pit lane
    ],
  });
})();
