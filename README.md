# Equation I (EI)

A lightweight browser Grand Prix game: one or two players, up to 19 bots, on a faithful
Silverstone built from real survey geometry. No build step, no dependencies to install.

![EI](https://img.shields.io/badge/engine-three.js%20r128-blue) ![no build](https://img.shields.io/badge/build-none-brightgreen)

## Play

```bash
# any static server works; for example
python3 -m http.server 8000
# then open http://localhost:8000/
```

Opening `index.html` straight from disk also works in most browsers (the game uses plain scripts,
not ES modules). Chrome, Edge, Firefox and Safari on a laptop or desktop are the target; phones get
on-screen buttons for one player.

### Controls

| Action | Player 1 | Player 2 | Gamepad |
| --- | --- | --- | --- |
| Throttle / brake (reverse when stopped) | W / S | ↑ / ↓ | RT / LT |
| Steer | A / D | ← / → | Left stick |
| DRS (only in a DRS zone when armed) | Left Shift | Right Shift or . | A |
| ERS boost | Left Ctrl or Space | Enter or Right Ctrl | B / X |
| Camera (chase / cockpit / TV) | C | / | Y |
| Request a pit stop | P | Backspace | RB |
| Choose tyres for the stop (soft / medium / hard) | 1 / 2 / 3 | 8 / 9 / 0 | |
| Pause | Esc | | Start |
| Mute / restart | M / R (split screen: restart from the pause menu) | | |
| Controls screen (menu or pause) | H | | |

In single player either key set drives the car. The menu's CONTROLS button (or H) shows all of this in the game. In split
screen each view shows its player's keys while the cars wait on the grid.

## What is in the box

- **Abu Dhabi, Yas Marina at night.** The 2021-onwards Grand Prix layout (5.30 km traced versus the official
  5.281 km) from OpenStreetMap survey data, run anticlockwise with all 16 turns numbered: the Turn 5 hairpin under
  the North Grandstand, the long back straight, the Turn 6-7 chicane, the marina straight, the banked Turn 9 and
  the hotel section where the track runs under the W Abu Dhabi's LED gridshell. Around it: the marina basin inside
  the circuit and the sea round Yas Island traced from the coastline, the real grandstands, building footprints
  with their heights, Ferrari World's red roof on the skyline, date-palm avenues along the island's roads,
  irrigated lawns on the sand, and Yas Marina's turquoise run-off. It races at night under floodlights: every
  floodlight bank is baked into a world-space light map that all lit materials sample (one texture read per pixel instead
  of hundreds of real lights), lamp heads and LEDs glow, the sky is a clear desert night with the last of the dusk
  in the west, and cars and water reflect the lights. Two DRS zones (back straight,
  marina straight). The pit lane runs along the start straight and rejoins before Turn 1.
- **Monaco, 1:1.** The Circuit de Monaco (3.32 km) is traced from the same OpenStreetMap survey data:
  Sainte Devote, the Beau Rivage climb, Massenet, Casino, Mirabeau, the Grand Hotel hairpin, Portier, the
  tunnel, the Nouvelle Chicane, Tabac, the swimming pool, Rascasse and Anthony Noghes, with a hand-built
  elevation profile (about 38 m from the harbour to Casino Square). The city around it is built from
  a thousand OpenStreetMap building footprints with their real heights, Port Hercule with its quays and
  moored yachts, the open sea, parks and street trees, Armco and debris fences everywhere, temporary
  grandstands on the harbour front and the hill, and a lit tunnel. Pick the circuit in the menu.
- **Silverstone, for real.** The centreline is traced from OpenStreetMap survey data of the Grand Prix
  circuit (5.88 km versus the official 5.891 km), resampled every 2 m, with an elevation profile over the
  lap. Corner names, the pit lane, the grandstands, the Wing, the woods and the lakes all come from the
  same data and sit where they really are. Around it: tiered grandstands with a 50,000-person instanced
  crowd, a rolling patchwork of fields with hedgerows, corner boards, 150/100/50 braking boards, DRS boards
  and detection lines, sponsor walls, painted run-off decals, a start-light gantry, grid boxes, tyre walls,
  Armco, debris fences, gravel traps, green-painted strips and tarmac run-off.
- **Rendering.** Physically based materials lit by a Preetham sky model with a matching sun and a PMREM
  environment for reflections, normal-mapped asphalt and gravel, tone mapping, soft shadows, billboard
  trees, and dust / gravel / tyre-smoke particles. A Graphics setting picks Low (1024 shadows, no soft
  shadows, 1x pixel ratio), Medium (default, MSAA only) or High (adds bloom and FXAA post-processing); each tier
  also caps the pixel count on large or high-density screens. The sun shadow of the static scenery is cached and
  redrawn only when the shadow box moves (every ~10 m); the cars are drawn into it every frame through one
  simplified mesh each. Cars use three levels of detail (detailed within ~25 m, one draw call beyond, a coarser
  one-call mesh beyond ~70 m) built once and shared by the whole field.
- **Pit complex and buildings.** A designed pit building with garages, team signs, glass band, cantilever
  roof and pit wall stands, plus OSM-footprint buildings with office, hall and brick facades and parapets.
- **Track proportions.** 15 m asphalt, raised red-white kerbs, green-painted strips, tarmac aprons up to
  14 m, gravel traps beyond, and barriers 12 to 50 m out as at the real circuit.
- **Three cameras.** Chase, cockpit (behind the halo, helmet hidden) and a trackside TV pod. Name tags float
  over nearby cars.
- **Sectors.** Three timing sectors with purple / green / yellow flags, plus a live delta to your best lap.
- **Race weekend rules.** Staggered 20-car grid, five red lights with a random hold, jump-start penalty
  (+5 s), lap and sector timing, live gaps, fastest lap, a position tower, chequered flag and a full
  classification with lapped cars.
- **DRS and ERS.** Two DRS zones (Wellington Straight and Hangar Straight) with real detection points: you
  must be within 1.0 s of the car ahead at the detection line, from lap 2 onwards, then press DRS inside
  the zone. The rear-wing flap visibly opens. ERS gives a short power boost and recharges under braking.
  Slipstream reduces drag behind another car.
- **Bots that race.** Each bot follows a computed racing line with a braking/acceleration profile derived
  from the car physics (an ideal lap is about 1:26, like a real pole lap). They overtake, defend the inside,
  avoid side-by-side contact, use DRS and ERS, make small mistakes, and recover when they spin. Three skill
  levels from Very easy to Ultra; team strength and tyre choice vary the pack. Ultra bots drive at the
  physical limit of the car (about 1:29 at Silverstone against a 1:26 theoretical ideal) and react in a
  tenth of a second, Very easy bots run at 72 % of the limit with slow reactions and visible mistakes.
- **Cars.** The in-game car is a game-ready derivative of Peter Kiss's "F1 2022 Monopost" model (see
  CREDITS.md: CC BY-NC-SA, private non-commercial use), decimated to 212k triangles for the player car and
  44k for bots, with a per-team livery composed at runtime from the model's material-ID and baked
  ambient-occlusion atlases (numbers, driver codes and sponsor text included). If the model files are missing
  the game falls back to the procedural car in `js/carmodel.js`: lofted chassis, nose
  and sidepods with inlets, airbox and shark fin, four-element front wing with curved tips and endplates,
  rear wing with painted endplates, beam wing, swan-neck mounts and a working DRS flap, floor with edge wings
  and diffuser strakes, full wishbone / pushrod suspension with uprights and brake-duct winglets, halo,
  driver with helmet, HANS and arms on a steering wheel with a live display, headrest, mirrors, T-cam, pitot
  and rain light, 18-inch wheels with covers and branded tyres with compound-coloured sidewalls. Ten teams in recognisable colour schemes, two drivers each, with
  numbers, driver codes and sponsor-style decals painted into a livery sheet. A contact shadow sits under
  every car.
- **Physics tuned for fun.** Grip rises with speed (downforce), strong brakes, grass and gravel slow you
  down, barriers scrub speed. Assists: *Full* keeps you at the grip limit so you cannot spin from steering
  alone; *Medium* removes the steering help; *None* adds locked wheels and wheelspin.
- **Two players** on one keyboard (and / or one gamepad each) in split screen: stacked top and bottom by default, each view
  with its own compact HUD along the outer edge and a wide field of view; side by side on very wide windows or when chosen
  in the menu (Split: Auto / Top-bottom / Side-by-side).

## Pit stops

Press P (Backspace for player 2) to request a stop and 1/2/3 (8/9/0) to choose the compound. Be on the
pit side of the track at the entry; the lane drives you at the 80 km/h limiter (5 s penalty if you cross the
limit line too fast). A 15-person crew changes the tyres in about 2.5 s, wear resets, and you rejoin. Bots
pit on wear or a planned lap. The pit lane has garages, tyre racks, pit-wall engineers and idle crews.

## Custom liveries

Liveries are painted procedurally in `js/teams.js`. If a file exists at
`assets/liveries/<teamId>.png` (1024×1024) it is drawn over the painted sheet, so you can drop in your
own decals. Layout: top view of the car in the upper half (nose on the left, left side of the car at the
top), left side in rows 512–768, right side in rows 768–1024. Team ids: `rossa argent taurus papaya
verdant alpenne wilhelm hayes kinetik vector`.

## Adding a circuit

`js/data/silverstone.js` holds the centreline as metres in a local tangent plane plus named corners,
DRS zones, pit lane and scenery polygons. Any closed loop of points in the same format works; the track
builder resamples it, computes curvature, walls, kerbs, gravel placement and the racing line automatically.

## Project layout

```
index.html          page, menu, HUD markup
css/style.css
js/data/silverstone.js   circuit geometry (derived from OpenStreetMap)
js/util.js          helpers, procedural textures
js/teams.js         teams, drivers, livery painter
js/track.js         resampling, elevation, lookups, racing line, track surface and furniture
js/scenery.js       terrain, grandstands + crowd, buildings, trees, sky
js/carglb.js        loads the GLB car and composes per-team liveries
js/carmodel.js      procedural fallback car model
js/infra.js         hoardings, fences, tyre stacks, screens, flags, paddock
js/car.js           vehicle physics
js/ai.js            bot drivers and speed profile
js/race.js          race director: grid, lights, laps, DRS detection, collisions, classification
js/hud.js           per-player HUD, minimap, tower, results
js/audio.js         synthesized engine and cues
js/input.js         keyboard / gamepad / touch
js/main.js          renderer, cameras, loop, menu
vendor/three.min.js three.js r128 (MIT) plus its EffectComposer, bloom, FXAA and Sky modules
js/particles.js     dust, gravel spray and tyre smoke
```

## Deploying

The game is static files with `index.html` at the repository root, so it deploys unchanged on Vercel,
Netlify or GitHub Pages. Serve it over HTTP; the car model is loaded with fetch.

## Credits

Circuit geometry derived from [OpenStreetMap](https://www.openstreetmap.org/copyright) data,
© OpenStreetMap contributors, licensed under the ODbL. three.js is MIT licensed. Team and driver
names in the game are fictional. The trackside advertising, the two works teams (Lumi Racing and Intake Racing) and the
menu partner links are for [Lumi](https://www.trylumi.co) and [Intake](https://www.intake.ink); see CREDITS.md.
