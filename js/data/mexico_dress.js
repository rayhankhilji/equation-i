// Equation I - Autodromo Hermanos Rodriguez trackside dressing (MEX-DRESS). DATA ONLY: loaded after mexico.js / mexico_env.js / mexico_stitch.js, it
// overrides and extends the track data (furniture, barriers, kerbs, painted run-off, catch fence), so a regeneration of mexico.js keeps this placement.
// Corners are keyed by TURN NUMBER (data.turns[].t, 1..17; HUD names cover several turns: "Ese Moises Solana" T1-T3, "The Esses" T7-T11, "Foro Sol" T13-T16)
// and every lap position is computed from GEN's turn table (turn-in s = turns[].s, apex = turns[].apex), nothing is hard-coded to a metre.
// SIDES: +1 = the LEFT of travel (+lat), -1 = the RIGHT. The lap is CLOCKWISE (a right-hander has its outside on +1); the pit lane and the garages are on -1
// (data.pitSide), the Main Grandstand, the outside of T1 and the property fence on +1. 'out' / 'in' = outside / inside of the bend at that s.
// The STADIUM section (Foro Sol) is the stretch of the lap inside the OSM outline of 'Estadio GNP Seguros' (+30 m): s 3534 .. 3903 (T12 exit .. T16).
// Sources: [V] FACTS.md v1.1 (PIRELLI: "the penultimate right-hander (T16) ... the wall so close, arguably easiest to crash on"; Foro Sol surrounded on three sides
// by grandstands; event title "Formula 1 Gran Premio de la Ciudad de Mexico", 2025 presented by Heineken [F1 race programme]); [P] the F1 photo set (PHOTOS-A, swarm/staging/mexico_refs/photos): red / white
// ridged kerbs with a thin blue edge band, blue and green PAINTED aprons (white Heineken lettering), pale concrete walls under a tall dark catch fence, crimson '#MexicoGP' / Lenovo / LVMH / MSC / Heineken boards;
// still [K] (best knowledge): which corner carries which paint colour (the photos have no turn numbers), tyre wall / TecPro placement, marshal / camera / screen positions.
// Gravel: none (the sources and GEN's OSM show asphalt aprons and grass, no gravel beds). Nothing here moves a wall or the drivable surface.
// Consumers: js/infra.js (marshals, cameraTowers, scaffolds, screens, billboards, gantries, hoardZones, tec / tyre corners, sponsor walls, fiesta),
// js/track.js (kerbStyle 'mexico', runoffSchemes, runoffGreen, sausages, brakeStops / brakeBoards, fence, logoSpots, pitColor), js/ads.js (VENUES.mexico).
window.EI = window.EI || {};
(function () {
  const T = EI.TRACKS && EI.TRACKS.mexico; if (!T) return;
  const F = T.furniture = Object.assign({}, T.furniture || {});
  const L = T.lapLength || 4300.3;
  const mod = (a) => ((a % L) + L) % L;
  const TU = {}; for (const u of T.turns || []) TU[u.t] = u; for (const c of T.corners || []) if (c.t != null && !TU[c.t]) TU[c.t] = { t: c.t, s: c.s, apex: c.s + 40, dir: 'R' };
  const tin = (t) => (TU[t] ? TU[t].s : 0), apx = (t) => (TU[t] ? TU[t].apex : 0);
  const outS = (t) => (TU[t] && TU[t].dir === 'L' ? -1 : 1);   // the side of the outside of turn t (clockwise lap: a right-hander has its outside on the left = +1)
  const ST0 = 3534, ST1 = 3903;                                   // the stadium section (Foro Sol outline +30 m)

  // ---- kerbs: red / white raised ridged blocks with a thin blue band on the track-side edge (F1 photos mex_kerb_redwhiteblue_redbull, mex_grandstand_crowd_kerb_mclaren, mex_kerb_blue_runoff_car):
  // track.js kerbStyle 'mexico' (GEN's value; the default raised red / white tile + the blue edge band). Sausage kerbs: the photos show orange flexi-bollards on the stadium apexes and no sausage
  // humps, so only the slow hairpin / stadium apexes keep a (yellow / black) one: T3, T6, T12, T16. [K]
  T.kerbStyle = 'mexico';
  T.sausageCorners = [3, 6, 12, 16];

  // ---- painted run-off, from the photos (mex_kerb_blue_runoff_car, mex_stadium_green_heineken_kerb, mex_stadium_bowl_mc_wall): the aprons are painted royal BLUE at the opening corners and GREEN
  // (with big white 'Heineken' lettering) in the stadium; plain asphalt elsewhere. Which corner carries which colour is [K] (the photos carry no turn number): blue T1 / T3 / T4 / T6, green T12-T17.
  // Colours pre-darkened (the grade adds saturation, nothing neon). [turn number, pattern (0 = inner band + outer field, 3 = one band), colour A, colour B]
  T.runoffGreen = '#1f5a37';   // the green strip behind every kerb (the photos: a mid green beyond the kerb)
  T.runoffTint = [0.78, 0.77, 0.75];
  T.runoffSchemes = [
    [1, 0, '#1a3a82', '#1e438e'], [3, 0, '#1a3a82', '#1e438e'], [4, 0, '#1a3a82', '#1e438e'], [6, 0, '#1a3a82', '#1e438e'],
    [12, 0, '#1e5e38', '#236840'], [13, 0, '#1e5e38', '#a02a26'], [14, 0, '#1e5e38', '#236840'], [15, 0, '#1e5e38', '#a02a26'], [16, 0, '#1e5e38', '#236840'], [17, 0, '#1e5e38', '#236840'],   // T13 / T15: green band + white line + red field = the tricolour apron of the stadium photos (MEX-BEAUTY: red ~0xb8322a under the grade)
  ];
  T.pitColor = 0x6c6b69;   // pit lane asphalt: the plain map under the default tint reads near white in the altitude sun

  // ---- marshal posts: the outsides of the corners (the stadium S-pair gets one), then a post every ~220-300 m along the straights, sides alternating
  const posts = [];
  for (const t of [1, 3, 4, 6, 7, 9, 11, 12, 13, 16, 17]) posts.push([apx(t) - 30, 'out']);
  posts.push([tin(14) + 10, 'in']);
  posts.push([mod(tin(1) - 220), 1], [mod(tin(1) - 520), -1],                          // pit straight (grandstand side; the pit side after the pit exit)
    [1600, -1],                                                                         // the T3-T4 diagonal
    [3150, -1], [3380, 1]);                                                             // back straight
  F.marshals = posts.map(([s, w]) => [Math.round(mod(s)), w]).sort((a, b) => a[0] - b[0]);
  // ---- TV: camera towers [s, which] (+1 = inside of the bend / pit side of a straight, -1 = outside), scaffolds, screens (12 m), billboards (10 x 3.5 m, rare)
  F.cameraTowers = [[apx(1) - 40, -1], [apx(4) + 10, -1], [apx(6), 1], [apx(9) + 20, -1], [apx(11) - 30, -1], [tin(12) - 100, -1], [apx(13) + 20, 1], [apx(16), -1], [apx(17) + 40, -1]].map(([s, w]) => [Math.round(mod(s)), w]);
  F.scaffolds = [tin(2) + 60, tin(5) + 20, tin(7) + 40, tin(10) + 30, tin(12) + 40, tin(14) + 10, tin(16) + 30].map((s) => Math.round(mod(s)));
  F.cranes = [];
  F.screens = [[apx(1) + 40, 'out'], [apx(4) + 30, 'out'], [apx(6) + 40, 'out'], [tin(12) - 150, 'out'], [apx(17) + 30, 'out']].map(([s, w]) => [Math.round(mod(s)), w]);
  F.billboards = [tin(4) - 300, tin(7) + 50, 3120].map((s) => Math.round(mod(s)));
  // the footbridges (5 OSM footways over the lap) and the start gantry are MEX-MODELS' (env_mexico_infra.js); no box sponsor bridges, no floodlight posts
  F.bridges = [];
  F.floodlights = [];
  F.gantries = [1560, 3190];   // two lattice advertising gantries on the T3-T4 diagonal and the back straight
  F.paddockSnap = true;        // infra.js buildPaddock: trucks / motorhomes stand on the lowest drawn ground under their whole footprint
  // concrete spectator walls with a sponsor cover behind the tyre / TecPro stack: the heavy outsides (T1 braking, the stadium corners, the wall so close at T16)
  F.sponsorWallCorners = [1, 12, 13, 14, 15, 16];
  // ---- partner boards (hoardings, 5 x 1 m): [s0, s1, side (0 = both), spacing m]. A continuous band on the Main Grandstand front (5.35 m) and in the STADIUM
  // (both sides of the field, 5.35 m: the TV shot is boards + crowd; the tyre / TecPro corners carry the 4:1 sponsor wall instead), sparse elsewhere,
  // none in the T1 braking zone, none along the pit lane
  const Z = (a, b, side, step) => [Math.round(mod(a)), Math.round(mod(b)), side, step];
  F.hoardZones = [
    Z(tin(17) + 150, tin(1) - 780, 1, 5.35),                 // exit of T17 -> the Main Grandstand front (grandstand side, continuous)
    Z(mod(tin(1) - 780), tin(1) - 170, 1, 16),               // the rest of the pit straight (grandstand side)
    Z(430, tin(1) - 170, -1, 21),                            // pit side after the pit exit
    Z(apx(1) + 20, apx(1) + 140, 1, 16),                     // T1 exit outside
    Z(apx(3) + 30, tin(4) - 130, 0, 32),                     // the T3-T4 diagonal
    Z(apx(4) + 20, tin(7) - 30, 0, 27),                      // T4-T6
    Z(apx(7) - 20, tin(11) + 30, 0, 27),                     // the Esses (sparse)
    Z(apx(11) + 30, tin(12) - 60, 0, 32),                    // back straight
    Z(ST0, ST1, 0, 5.35),                                    // the stadium: continuous both sides
    Z(ST1 + 40, tin(17) + 120, 1, 10.7),                     // T17 exit outside
  ];

  // ---- braking boards: white 300 / 200 / 150 / 100 / 50 at T1 (the big stop at the end of the 1.2 km straight), 200..50 at T4 / T6 / T12; they stand on the outside of the approach
  T.brakeStops = [1, 4, 6, 12];
  T.brakeBoards = { 1: [300, 200, 150, 100, 50], 4: [200, 150, 100, 50], 6: [200, 150, 100, 50], 12: [200, 150, 100, 50], default: [200, 100, 50] };
  // painted partner logos on the run-off (turn number, run-off row 0-3 = VENUES.mexico.runoff, length m): Heineken on the green stadium aprons (T12, T14, T16: the photos' white lettering), Pirelli T1, Lumi T4, Intake T6
  T.logoSpots = [[1, 2, 36], [4, 1, 30], [6, 3, 28], [12, 0, 38], [14, 0, 34], [16, 0, 38]];

  // ---- barriers: red / white cushion blocks (TecPro) on the outsides of the medium corners and the stadium (T16: the wall so close), tyre walls at the heavy stops and
  // the tight outsides (grey Armco + sponsor panels elsewhere). tyreCorners lists every corner that gets a protected outside (TecPro takes precedence).
  T.tecProCorners = [2, 3, 6, 12, 13, 16, 17];
  T.tyreCorners = [1, 2, 3, 4, 5, 6, 7, 9, 11, 12, 13, 14, 15, 16, 17];

  // ---- the catch fence: dark charcoal welded mesh on dark posts, 4 m (kept on Low: it is in every photo, mex_start_pack_smoke_trees_barrier / mex_barrier_wall_mercedes_pair); taller in front of the stands, low along the pit wall
  T.fence = Object.assign({}, T.fence || {}, {
    h: 4.0, op: 0.7, mesh: 'rgba(24,26,30,1)', postColor: 0x2a2d31, posts: 12, low: true, ground: true,
    runs: [
      [mod(tin(17) + 150), mod(tin(1) - 170), 1, 4.8],   // Main Grandstand front (the photos: a tall dark catch fence over a pale concrete wall)
      [ST0, ST1, 0, 5.0],                                // the stadium: both sides, in front of the decks
      [3961, 417, -1, 2.4],                              // pit wall (pit side = -1): low debris fence along the pit lane, entry (inside T17) to exit
    ],
  });

  // ---- Dia de Muertos dressing (1 Nov race weekend, all [K] and cheap: merged vertex-coloured statics on the 'clutter' layer, no texture, no new program).
  // infra.js buildFiesta (opt-in on this key). Runs: [s0, s1, side, kinds]: poles every `step` m behind the board band; kinds: 'pp' papel picado strings between poles
  // (8 pennant colours), 'mg' marigold garlands (cempasuchil orange / yellow) swagged between poles, 'flag' a tricolour flag on every other pole. Panels: calavera
  // panels (marigold frame, skull) at [s, side]. Everything stays behind the fence line, at least 2.5 m behind the wall, never over the lap, skipping stands.
  const BR = ((EI.ENVDATA && EI.ENVDATA.mexico && EI.ENVDATA.mexico.landmarks && EI.ENVDATA.mexico.landmarks.bridges) || []).map((b) => b.s);   // the OSM footbridges (MEX-MODELS builds them): poles / panels keep 12 m clear
  F.fiesta = {
    step: 18, avoid: BR, avoidHalf: 12,
    runs: [
      [mod(tin(17) + 190), mod(tin(1) - 790), 1, 'pp,flag'],     // Main Grandstand front
      [ST0 + 10, ST1 - 10, 1, 'mg,flag'],
      [ST0 + 10, ST1 - 10, -1, 'pp,flag'],
      [3080, 3440, 1, 'flag'],
    ],
    panels: [[mod(tin(1) - 640), 1], [880, -1], [tin(4) + 90, 'out'], [tin(12) - 60, 'out'], [ST0 + 120, 'out'], [ST1 - 50, 'out']],
  };
})();
