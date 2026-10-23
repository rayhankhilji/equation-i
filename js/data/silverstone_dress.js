// Equation I - Silverstone trackside dressing (SILVERSTONE-DRESS). DATA ONLY: loaded after silverstone.js / silverstone_env.js, it extends the track
// data (marshal posts, TecPro and tyre-wall corners, the catch / debris fence) and the Silverstone environment layout (EI.ENVDATA.silverstone.dress,
// read by js/env_silverstone_dress.js: spectator banks, hospitality villages, campsites, hedgerows, tree belts, farm buildings). Nothing here moves
// a wall or the drivable surface; the env file validates every placement against the occupancy grid and the track corridor at build time.
// Lap distance s = game s (the HUD corner table: start / finish line at s 260, lap 5880.7 m). Side +1 = left of travel (+lat), -1 = right;
// the pit lane is on -1 (the right, the inside of this clockwise lap); 'out' / 'in' = outside / inside of the bend at that s (marshals).
// Corner keys are the names GEN emits (Brooklands and Vale appear twice, Chapel Curve twice: track.js takes every stretch that carries the name).
// Photo basis (swarm/staging/silverstone_refs): 004 / 023 / 038 the tall dark catch fence over the concrete wall and sponsor boards; 052-056,
// 064-066 the red / orange barrier line and the orange-suited marshals at their posts; 025 / 030 / 035 / 037 the terraced general-admission banks
// of Luffield, Copse and the Wellington Straight with the hi-vis yellow crowd, 031 / 099 the white hospitality terraces; 040 / 041 / 051 the dark
// broadleaf tree belts behind the crowd, the farmland beyond.
// Consumers: js/infra.js (marshals, tec / tyre corners), js/track.js (fence, tyre / TecPro masks), js/env_silverstone_dress.js.
window.EI = window.EI || {};
(function () {
  const T = EI.TRACKS && EI.TRACKS.silverstone; if (!T) return;
  if (typeof location !== 'undefined' && /[?&]nodress=1/.test(location.search || '')) return;   // (before / after shots: ?nodress=1 leaves the dressing out)
  const F = T.furniture = Object.assign({}, T.furniture || {});

  // ---- marshal posts: the outsides of the corners, then a post every ~200 m along the straights, sides alternating (infra keeps clear of the pit
  // lane, the stands and the corridor; a post that cannot stand on its side tries the other). 44 posts round the lap: Silverstone is marshalled
  // every 150-250 m (photos 098 / 064: orange overalls, a green LED flag panel and a number board at each post).
  F.marshals = [
    [100, 1], [330, 1],                                                                    // Hamilton Straight (the stand side after the line)
    [470, 'out'], [575, 1], [700, 'out'], [840, -1],                                       // Abbey, Farm, the run to Village
    [965, 'out'], [1040, 'out'], [1115, 'out'], [1200, 1], [1295, 'out'],                  // Village, The Loop, Aintree
    [1450, -1], [1660, 1], [1860, -1],                                                     // Wellington Straight
    [1995, 'out'], [2090, 'out'], [2215, 'out'], [2320, 'out'], [2490, 'out'],             // Brooklands, Luffield, Woodcote
    [2620, 1], [2790, -1], [2960, 1],                                                      // National Pit Straight
    [3130, 'out'], [3250, 'out'], [3430, -1],                                              // Copse, the run to Maggotts
    [3640, 'out'], [3790, 'out'], [3915, 'out'], [4095, 'out'], [4225, 'in'],              // Maggotts, Becketts, Chapel
    [4400, 1], [4620, -1], [4830, 1], [4990, -1],                                          // Hangar Straight
    [5110, 'out'], [5225, 'out'], [5420, -1],                                              // Stowe, Vale
    [5585, 'out'], [5695, 'out'], [5790, 1],                                               // Club
  ];

  // ---- barriers: red / white cushion blocks (TecPro) on the outsides of the fast and heavy corners, tyre walls on the rest of the corner outsides
  // (the red / white panels of the sponsor wall and the grey Armco carry every other metre). tyreCorners lists every corner with a protected outside
  // (TecPro takes precedence, js/infra.js).
  T.tecProCorners = ['Abbey', 'Brooklands', 'Luffield', 'Woodcote', 'Copse', 'Stowe', 'Club'];
  T.tyreCorners = ['Abbey', 'Village', 'Brooklands', 'Luffield', 'Woodcote', 'Copse', 'Maggotts', 'Chapel Curve', 'Stowe', 'Vale', 'Club'];

  // ---- the catch fence: black-coated wire mesh on galvanised grey posts (photos 004 / 023 / 038), 3.6 m, kept on Low (it is in every frame). The posts are
  // infra.js' instanced ones (near / far split; no fence.posts here: track.js' merged leaning posts would be ~24 k tris, always drawn). The debris fence along
  // the pit wall is low (the pit lane is on the right: s 5331 -> 762).
  T.fence = Object.assign({}, T.fence || {}, {
    h: 3.6, op: 0.8, mesh: 'rgba(22,25,29,1)', postColor: 0x3c4147, low: true, ground: true,   // ground: the net drops onto the drawn ground where it lies below the road (QA r4: 10 net sections hung 0.5-1.3 m up)
    runs: [
      [5331, 762, -1, 2.4],     // pit wall: low debris fence along the pit lane
    ],
  });

  // ---- the surroundings (js/env_silverstone_dress.js): hand-placed lists, validated against the grid at build time
  EI.ENVDATA = EI.ENVDATA || {};
  const E = EI.ENVDATA.silverstone = EI.ENVDATA.silverstone || {};
  E.dress = {
    // general-admission banks: [s0, s1, side, gap m beyond the barrier, height m, depth m (the slope's run)]. Each entry is a ZONE: the env file keeps only the
    // stretches (>= 48 m) where the footprint is free of stands, roads, woods and car parks, so a bank fills the gaps between the grandstands. The first two
    // entries are the low grass banks right behind the fence on both sides of the whole lap (photo 036: the infield bank of the Wellington Straight, fans
    // standing three deep behind the pedestrian barrier); the rest stand behind the perimeter road, beyond the stands: the big terraced banks of Luffield /
    // Woodcote and Copse that rise above the stand roofs (photos 025 / 030), the Wellington and Hangar Straights, Stowe.
    banks: [
      [0, 5880, 1, 8, 6.5, 24], [0, 5880, -1, 8, 6.5, 24],
      [2380, 2830, 1, 56, 9.5, 38], [3040, 3240, 1, 56, 9, 38], [1470, 1900, 1, 56, 7, 34], [4340, 4900, 1, 56, 7.5, 34], [4980, 5300, 1, 56, 8, 36],
      [3220, 3570, -1, 56, 7, 34], [1430, 1700, -1, 56, 7, 32], [4530, 4990, -1, 56, 6.5, 32],
    ],
    // hospitality villages: [s, side, metres beyond the barrier, units, long axis along the lap]. White two-storey terraces with dark glazing
    hospitality: [[300, 1, 118, 4], [2120, 1, 124, 3], [2560, 1, 120, 3], [3140, 1, 118, 3], [3850, 1, 112, 3], [5080, 1, 116, 3], [5700, 1, 112, 4]],
    // campsites in the distance (the tents of the camping fields): [minimum metres beyond the barrier, maximum, count of fields]
    camps: { near: 380, far: 1150, fields: 8, perField: 150 },
    // round hay bales left in the stubble of the near fields, farm barns and farmhouses, a village church beyond the east side
    farm: { bales: 260, barns: 9 },
    // English hedgerows: gaps and standard oaks along the lap's outer fence, extra tree belts behind the banks (the fraction of s covered)
    belts: { runs: [[2120, 2640], [2980, 3300], [3700, 4260], [4900, 5260], [5540, 5880]], depth: 70 },
  };
})();
