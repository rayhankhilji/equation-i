// Equation I - Monza trackside dressing (monza-DRESS). DATA ONLY: loaded after monza.js / monza_env.js / monza_stitch.js, it overrides
// and extends the track data's furniture block, so a regeneration of those files keeps this placement. Lap distance s = game s
// (the OSM lap is the game lap, start lights = s 0; swarm/monza/osm/corners.json). side: +1 = right of the direction of travel
// (pit side, the infield on the main straight), -1 = left (grandstand side), 'out' / 'in' = outside / inside of the bend there.
// Consumers: js/infra.js (marshals, cameraTowers, scaffolds, cranes, screens, billboards, gantries, tecProCorners), js/track.js
// (bridges, brakeStops + brakeBoards, startGantry, fence.runs), js/env_monza_stands.js + js/env_venue.js (dress.stands).
(function () {
  const T = EI.TRACKS && EI.TRACKS.monza; if (!T) return;
  const F = T.furniture = Object.assign({}, T.furniture || {});

  // ---- marshal posts: every real post of the lap (outside of every bend, then a post every ~150-250 m along the straights, sides alternating;
  // the FIA numbering runs round the lap, so the number boards read 1..24 and repeat). Posts keep clear of the pit wall (infra inPit).
  F.marshals = [
    [5340, -1], [5600, -1], [90, -1], [230, -1], [380, 1], [470, -1],            // main straight (stands on the left, pit wall + podium right)
    [575, 'out'], [700, 'out'], [775, 'in'],                                       // Prima Variante: escape road, exit
    [890, 'out'], [1030, 'out'], [1150, 'in'], [1290, 'out'], [1420, 'in'],        // Curva Biassono
    [1560, -1], [1700, 1], [1790, 'out'], [1900, 'out'], [1990, 1],                // run to the Roggia chicane
    [2110, -1], [2200, 'out'], [2280, 'out'], [2400, 1],                           // Lesmo 1
    [2530, 'out'], [2620, 'out'], [2760, -1], [2900, 1], [3040, -1], [3180, 1],    // Lesmo 2, Serraglio
    [3420, -1], [3540, 1], [3640, 'out'], [3740, 'out'], [3840, 'out'], [3950, -1],// Ascari
    [4080, 1], [4220, -1], [4360, 1], [4500, -1], [4640, 1],                       // back straight
    [4780, 'out'], [4900, 'out'], [5020, 'out'], [5130, 'out'], [5240, -1],        // Parabolica
  ];

  // ---- TV: camera towers [s, which] (which +1 = inside of the bend / right of a straight, -1 = outside), scaffolds, cranes, screens
  F.cameraTowers = [[5280, -1], [480, 1], [580, -1], [1100, -1], [1790, 1], [2160, 1], [2520, 1], [3560, 1], [3750, -1], [4350, -1], [4730, 1], [5000, -1]];
  F.scaffolds = [640, 760, 1100, 1450, 1860, 2250, 2600, 3300, 3700, 3850, 4130, 4560, 4900, 5150];
  F.cranes = [720, 4980];
  F.screens = [[700, 'out'], [1880, 'out'], [3760, 'out'], [4950, 'out']];
  F.billboards = [560, 1500, 2100, 2700, 3450, 4300, 5000, 5600];

  // ---- advertising bridges over the track (track.js box bridges [s, ad key, beam colour]; f1-BRAND paints the faces: EI.Ads.paintBridge) and the
  // lattice gantries with the 4:1 partner panels (infra.js). The back-straight footbridges (s 4131 / 4424) are monza-MODELS' own covered bridges.
  F.bridges = [[250, 'lumi', 'plum'], [745, 'intake', 'brown'], [1560, 'lumi2', 'plum'], [3960, 'intake2', 'blue']];
  F.gantries = [2900, 4640];
  F.floodlights = [];
  // start lights gantry: metres beyond the start line (the OSM start-lights node is s 0); monza-MODELS builds the model on this position
  F.startGantry = 4;

  // ---- braking zone boards: white 300 / 200 / (150 / 100 / 50 at T1) m boards before T1, Roggia, Ascari and the Parabolica (turn-in s of the first corner of the name)
  T.brakeStops = ['Variante del Rettifilo', 'Variante della Roggia', 'Variante Ascari', 'Curva Alboreto'];
  T.brakeBoards = { 'Variante del Rettifilo': [300, 200, 150, 100, 50], default: [300, 200, 100] };

  // ---- barriers: TecPro (red / white) blocks at the chicanes, tyre walls at the fast bends and the Parabolica
  T.tecProCorners = ['Variante del Rettifilo', 'Variante della Roggia', 'Variante Ascari'];
  T.tyreCorners = ['Variante del Rettifilo', 'Curva Biassono', 'Variante della Roggia', 'Lesmo 1', 'Lesmo 2', 'Variante Ascari', 'Curva Alboreto'];

  // ---- catch fence runs [s0, s1, side (0 = both), height m]: later runs win; 0 = none. Base = data.fence.h (4.5 m).
  // MONZA-UPGRADE: the catch fence is galvanised wire that reads as a silver-grey veil in the sun (photos rolex_straight_alps_trees, ferrari_banks_tifosi),
  // not the near-black grid that made a checkerboard at distance: lighter, thinner (lower opacity); unlit material = colour only
  // ground: true (track.js data.fence.ground, as COTA): where the drawn ground lies below the road behind the barrier (the Prima Variante's
  // run-off, QA r4 posts.js: 6 posts / 4 net sections 0.5-1.0 m in the air at s 587-684) the net and its posts stand on the ground
  T.fence = Object.assign({}, T.fence || {}, { color: 0x8c9298, op: 0.5, ground: true }, {
    runs: [
      [5396, 22, 1, 2.4],       // pit wall: low debris fence along the pit lane
      [430, 720, 0, 6.0],       // Prima Variante: the tall fence in front of Alta Velocita / Prima Variante Esterna (t1_braking_boards_fences_2022)
      [4880, 5230, -1, 5.5],    // Parabolica outside
      [3268, 3335, 0, 0],       // under the old banking bridge
    ],
  });

  // ---- MONZA-UPGRADE (WAVE 9, F1 photos staging/monza_refs): surfaces after the 2024 resurfacing - near-black charcoal asphalt (a linear
  // colour on the asphalt material, js/env_monza_up.js), a darker pit lane, and the striped tricolore kerbs at the two first chicanes
  // (track.js kerbGW stretches drawn from the 'monzastripe' tile: bands along the lap, pale-blue line at the edge; photos
  // ferrari_chicane_striped_kerb, williams_striped_kerb_spray, redbull_kerb_redwhite). The other corners keep the R-W-G-W blocks.
  T.asphaltTint = [0.44, 0.45, 0.48]; T.asphaltEnv = 0.16;
  T.pitColor = 0x7a7976;
  T.kerbGW = [[570, 705], [1795, 1910]];
  // painted run-off and gravel as the photos have them (pack_stands_pirelli, ferrari_banks_tifosi, gravel_runoff_haas_alpine, mercedes_gravel_runoff):
  // the aprons the same dark tarmac as the track, the band behind the kerbs a deep emerald (the grade lifts it; '#2f5a24' read lime), pale grey gravel
  T.runoffTint = [0.74, 0.75, 0.78]; T.runoffGreen = '#1d6444'; T.gravelTint = [1.8, 1.74, 1.6];
  T.treeTint = [0.46, 0.56, 0.44];
  // green standing A-frame partner boards on the grass of the long straights (photo rolex_straight_alps_trees), env_monza_up.js
  T.vergeBoards = { runs: [[730, 1700], [2700, 3250], [3350, 3560], [3960, 4600]], step: 42, brand: 'rolex', bg: '#006039' };
  // extra stand runs (game s; side +1 = left of travel): Lesmo 2 interno (right-hander: inside = right), the Parabolica's outside to the exit
  T.standsUp = [
    { s0: 2556, s1: 2614, side: -1, gap: 7, rows: 10, label: 'LESMO', seat: 0x9aa3ad, once: true },
    { s0: 4880, s1: 5070, side: 1, gap: 3, rows: 18, label: 'PARABOLICA', seat: 0xb4b8bc },
  ];   // the park's crowns: deep olive green, not lime (linear material colour, js/env_monza_up.js)

  // ---- crowd and flags per stand (key = stand name as env_monza_stands labels it): fill = seat occupancy, red = share of red shirts,
  // flags = metres per flag pole, banners = chance of a tifosi banner per block
  T.dress = {
    stands: {
      'PRIMA VARIANTE': { fill: 0.97, red: 0.85, flags: 12, banners: 0.85 },
      'ALTA VELOCITA': { fill: 0.95, red: 0.82, flags: 14, banners: 0.75 },
      'PARABOLICA': { fill: 0.96, red: 0.86, flags: 12, banners: 0.8 },
      'CENTRALE': { fill: 0.92, red: 0.4, flags: 16, banners: 0.5 },
      'PISCINA': { fill: 0.88, red: 0.5, flags: 18, banners: 0.55 },
      'VEDANO': { fill: 0.86, red: 0.6, flags: 18, banners: 0.6 },
      'Laterale Destra': { fill: 0.92, red: 0.55, flags: 16, banners: 0.6 },
      'Laterale Sinistra': { fill: 0.92, red: 0.55, flags: 16, banners: 0.6 },
      'ROGGIA': { fill: 0.92, red: 0.78, flags: 10, banners: 0.7 },
      'ASCARI': { fill: 0.9, red: 0.72, flags: 12, banners: 0.7 },
      'BIASSONO': { fill: 0.86, red: 0.7, flags: 12, banners: 0.65 },
      'LESMO': { fill: 0.7, red: 0.6, flags: 14, banners: 0.5 },
    },
  };
})();
