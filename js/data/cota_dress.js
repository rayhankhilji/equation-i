// Equation I - Circuit of the Americas trackside dressing (COTA-DRESS). DATA ONLY: loaded after cota.js / cota_env.js / cota_stitch.js, it
// overrides and extends the track data (furniture, barriers, kerbs, painted run-off, catch fence), so a regeneration of cota.js keeps this placement.
// Corners are keyed by TURN NUMBER (data.corners[].t / data.turns[].t, 1..20): the HUD names cover several turns ("The Esses" T3-T6,
// "Stadium Section" T12-T15, "Triple Apex" T16-T18) and a regeneration moves s by a few metres, so every lap position below is computed from GEN's
// turn table (turn-in s = turns[].s, apex = turns[].apex) and nothing is hard-coded to a metre. Lists that track.js / infra.js match against the
// corner table (tyreCorners, tecProCorners, sausageCorners, brakeStops, runoffSchemes, logoSpots, sponsorWallCorners) take turn numbers.
// Sides: +1 = the pit side = the LEFT of travel, -1 = the RIGHT (the lap is anticlockwise: k > 0 turns towards +lat = left); the main grandstand,
// the property fence and the outside of the lap are on -1; 'out' / 'in' = outside / inside of the bend at that s.
// Gravel beds stay GEN's data.runoff (OSM surface=gravel); nothing here moves a wall or the drivable surface.
// Consumers: js/infra.js (marshals, cameraTowers, scaffolds, screens, billboards, gantries, hoardZones, tec / tyre corners), js/track.js
// (kerbStyle 'cota', runoffSchemes, runoffGreen, gravelTint, sausages, brakeStops / brakeBoards, fence, logoSpots), js/ads.js (VENUES.cota).
window.EI = window.EI || {};
(function () {
  const T = EI.TRACKS && EI.TRACKS.cota; if (!T) return;
  const F = T.furniture = Object.assign({}, T.furniture || {});
  const L = T.lapLength || 5510;
  const mod = (a) => ((a % L) + L) % L;
  // GEN's turn table -> turn-in s and apex s per turn number (falls back to the corner table)
  const TU = {}; for (const u of T.turns || []) TU[u.t] = u; for (const c of T.corners || []) if (c.t != null && !TU[c.t]) TU[c.t] = { t: c.t, s: c.s, apex: c.s + 40 };
  const tin = (t) => (TU[t] ? TU[t].s : 0), apx = (t) => (TU[t] ? TU[t].apex : 0);

  // ---- kerbs: COTA's low painted red / white blocks (kerbStyle 'cota' in track.js); no second colour. Sausage kerbs (yellow / black) on the inside
  // apexes of the slow corners and the exit of the track-limit corners: T1, T6 exit, T9, the T11 and T12 hairpins, T15, T20.
  T.kerbStyle = 'cota';
  T.sausageCorners = [1, 6, 9, 11, 12, 15, 20];

  // ---- painted run-off (COTA-UPGRADE, from the photos: kerb_stars_banner_car, mclaren_stands_flag, haas_turn_kerb, aerial_tower_grandstand,
  // tower_aerial_track): a solid RED band behind every kerb (the old dark-green strip does not exist at COTA), then the stars-and-stripes
  // apron (track.js runoffFlag pattern 4: white | navy | white | navy with white stars | white | red with navy / white stars | white, ~10 m,
  // plain pale asphalt beyond) at every corner with an asphalt apron; Turn 1 is a solid red apron with a starred navy band (pattern 5).
  // Red and navy are pre-darkened for the grade (the old values clipped to 255,0,0). [turn number, pattern, colour A (red), colour B (navy)]
  T.runoffGreen = '#7c2428';
  T.runoffFlag = true;
  T.runoffTint = [0.8, 0.78, 0.75];   // the apron: a mid warm grey, a little lighter than the track
  const RED = '#7c2428', NAVY = '#20283e';   // calibrated on Low frames: photo sunlit red ~190,25,22 / navy ~30,35,70 (the grade lifts red and blue hard)
  T.runoffSchemes = [[1, 5, RED, NAVY]];
  for (let t = 2; t <= 20; t++) T.runoffSchemes.push([t, 4, RED, NAVY]);
  T.pitColor = 0x6c6b69;   // pit lane asphalt: the plain asphalt map under the default tint reads near white beside COTA's darker racing surface
  T.gravelTint = [1.5, 1.42, 1.2];   // pale limestone / caliche gravel

  // ---- marshal posts: the outsides of the corners, then a post every ~200-250 m along the straights, sides alternating (infra keeps clear of the pit lane,
  // stands and the corridor)
  const posts = [];
  for (const t of [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20]) posts.push([apx(t) - 30, 'out']);
  posts.push([tin(4) + 10, 'in'], [tin(14) + 20, 'in']);
  posts.push([mod(tin(20) + 260), -1], [mod(tin(1) - 120), 1],                       // pit straight (grandstand side, then the pit side after the line)
    [2560, -1], [2800, 1], [3060, -1], [3300, 1],                                    // back straight
    [apx(9) + 120, 1], [apx(10) + 150, -1], [apx(14) + 120, 1], [apx(18) + 150, 1], [apx(18) + 260, -1]);
  F.marshals = posts.map(([s, w]) => [Math.round(mod(s)), w]).sort((a, b) => a[0] - b[0]);
  // ---- TV: camera towers [s, which] (+1 = inside of the bend / pit side of a straight, -1 = outside), scaffolds, screens (12 m), billboards (10 x 3.5 m, rare)
  F.cameraTowers = [[apx(1) - 40, -1], [apx(6), 1], [apx(8) + 20, -1], [apx(11) - 30, -1], [3020, -1], [apx(12) + 30, 1], [apx(15) + 40, -1], [apx(17), -1], [apx(20) + 30, 1]].map(([s, w]) => [Math.round(mod(s)), w]);
  F.scaffolds = [tin(2) + 60, tin(5) + 20, tin(7) + 40, tin(10) + 30, tin(13) + 20, tin(16) + 30, tin(19) + 40].map((s) => Math.round(mod(s)));
  F.cranes = [];
  F.screens = [[apx(1) + 30, 'out'], [apx(5) + 40, 'out'], [apx(12) + 20, 'out'], [apx(15) - 40, 'out'], [apx(19) + 30, 'out']].map(([s, w]) => [Math.round(mod(s)), w]);
  F.billboards = [tin(2) + 40, tin(7) + 60, 3040, tin(14) + 60, tin(19) - 120].map((s) => Math.round(mod(s)));
  // ---- the two pedestrian bridges and COTALAND are COTA-MODELS' (env_cota_infra.js builds them from the landmarks); no box sponsor bridges
  F.bridges = [];
  F.gantries = [2740, mod(tin(19) - 90)].map(Math.round);
  F.floodlights = [];
  F.paddockSnap = true;   // infra.js buildPaddock: trucks / motorhomes stand on the lowest drawn ground under their whole footprint
  // concrete spectator walls with sponsor covers behind the tyre / TecPro stack: the heavy outsides only (the rest of the lap is Armco + fence)
  F.sponsorWallCorners = [1, 11, 12, 15];
  // ---- partner boards (hoardings, 5 x 1 m): [s0, s1, side (0 = both), spacing m]. A continuous board band on the grandstand wall of the pit straight
  // (5.35 m spacing), sparse boards elsewhere: outside only on the back straight (every ~43 m), none in the T1 braking zone, none in the stand fronts.
  const Z = (a, b, side, step) => [Math.round(mod(a)), Math.round(mod(b)), side, step];
  F.hoardZones = [
    Z(tin(20) + 280, tin(1) - 170, -1, 5.35),
    Z(apx(1) - 10, apx(1) + 170, -1, 16),
    Z(tin(2) + 20, tin(3) - 40, -1, 27),
    Z(apx(3) - 30, tin(7) - 30, 0, 27),
    Z(apx(7) - 20, tin(10) + 20, 0, 22),
    Z(apx(10) + 20, tin(11) - 20, -1, 27),
    Z(tin(11) + 20, tin(11) + 150, -1, 16),
    Z(2440, 3380, -1, 43),
    Z(tin(12) - 30, tin(13) - 20, 0, 16),
    Z(tin(13) + 20, tin(16) - 100, 0, 22),
    Z(tin(16) - 20, tin(19) - 160, 0, 27),
    Z(tin(19) - 20, tin(20) + 60, 0, 22),
  ];

  // ---- braking zone boards: white 300 / 200 / 150 / 100 / 50 at the T1 and T11 stops, 300 / 200 / 100 at the other heavy stops (they stand on the outside of the approach)
  T.brakeStops = [1, 11, 12, 15, 20];
  T.brakeBoards = { 1: [300, 200, 150, 100, 50], 11: [300, 200, 150, 100, 50], default: [300, 200, 100] };
  // painted partner logos on the run-off tarmac (turn number, run-off row 0-3, length m): the T1 and T11 aprons, the T12 and T20 exits
  T.logoSpots = [[1, 0, 36], [11, 1, 32], [12, 2, 28], [20, 3, 26]];

  // ---- barriers: red / white cushion blocks (TecPro) on the outsides of the fast / medium corners, tyre walls at the heavy stops and the tight
  // outsides (grey Armco / sponsor panels elsewhere). tyreCorners lists every corner that gets a protected outside (TecPro takes precedence).
  T.tecProCorners = [2, 3, 6, 9, 12, 15, 17, 19];
  T.tyreCorners = [1, 2, 3, 6, 7, 9, 11, 12, 13, 15, 16, 17, 18, 19, 20];

  // ---- the catch fence, 3.6 m (kept on Low: it is in every photo); the debris fence along the pit wall is low. COTA-UPGRADE: galvanised grey
  // posts and a light grey mesh (photos tower_aerial_track, pack_turn_grandstand, crowd_aerial_track_curve), not the dark charcoal guess
  T.fence = Object.assign({}, T.fence || {}, {
    h: 3.6, op: 0.55, mesh: 'rgba(118,122,126,1)', postColor: 0x878c91, posts: 8, low: true, ground: true,
    runs: [
      [4790, 450, 1, 2.4],      // pit wall (pit side = +1): low debris fence along the pit lane, entry (T19 exit) to exit (T1 inside)
    ],
  });
})();
