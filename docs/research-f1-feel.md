# F1 23/24 feel: implementation brief for a three.js F1 game

Evidence key: [S] = found in a source (listed at the end). [I] = my inference or standard racing-game practice, unverified for F1 23/24. Codemasters has published almost no camera, AI or HUD internals. Treat every number tagged [I] as a tunable starting value, not a measured F1 value.

Evidence key: [S] = sourced, [I] = my inference/standard practice (tunable start values). Codemasters has published almost no camera/AI/HUD internals.

## 1. Cameras
Game cameras [S]: TV Pod, Offset TV Pod, Cockpit, Chase (plus onboard/T-cam variants in other guides). Per-camera sliders: FOV (-20..+20 around a default), Offset Lateral/Horizontal/Vertical, Angle, Near Clip, Mirror Angle, Camera Shake, Camera Movement, Look to Apex Limit, Halo Column on/off.
- Defaults: Camera Shake and Camera Movement default to 20, and players zero them because the picture blurs/jolts on contact, kerbs and cornering [S]. Ship them as sliders (0..100) with defaults around 20-30%.
- Popular "realistic" cockpit preset: FOV -12, Offset V 13, Angle -16, Shake 0, Movement 0 (another guide: Movement 10), Look to Apex 10-15, Halo column on [S]. TV pod preset: FOV -10, Offset V 17, Angle -20, Near clip 20 [S]. Units unstated; assume FOV in degrees [I].

### Chase cam [I]
- Rig: target point = car CoG + 3-4 m ahead along heading. Camera 6.5-7.5 m behind the car, 1.7-2.2 m above ground, pitched ~ -5 to -8 deg. Chase is considered "too far removed" for lap times [S], so keep it simple and forgiving.
- Heading: follow a blend of car yaw and velocity direction (iRacing's chase follows travel direction, not chassis heading [S]). Use 0.6 x velocity heading + 0.4 x chassis heading, so slides show the car rotating in frame without the camera snapping.
- Spring-damper: position critically damped, time constant ~0.12-0.2 s longitudinal, 0.25-0.35 s yaw. Use an exponential smoothing factor `1 - exp(-dt/tau)` rather than a physical spring (springs go unstable at low/variable frame rate [S forum]).
- Lateral offset into corners: shift the camera 0.3-0.6 m to the outside of the turn proportional to lateral g (clamp at ~4 g), and aim the look target 0.5-1 m to the inside. Lag the offset by ~0.2 s.
- Roll: apply 15-25% of car body roll, max ~2 deg, so the horizon stays mostly level.
- Pitch: braking raises the camera pitch ~1-2 deg and pulls back ~0.3 m; acceleration squats the camera ~0.2 m. Low-pass at 3-4 Hz.
- FOV vs speed: vertical FOV 58 deg at standstill -> ~68 deg at 330 km/h using `smoothstep` on speed, low-passed 0.3 s. Most of the change should happen in 0-200 km/h (a speed-FOV camera mod uses most of its effect at low speeds and tapers off [S forum]). Add +3 deg on DRS open or slipstream, ramped over 0.5 s.

### Cockpit cam [I unless noted]
- Eye point: centred in the cockpit, ~0.25-0.35 m behind the steering wheel top, ~0.1 m above the wheel rim, so the halo's central pillar sits just left of the horizon line, covering ~8-12% of screen width. The Halo Column toggle exists [S]; make the pillar a mesh you can hide.
- FOV: use 55-65 deg vertical at 16:9 (about 90-105 deg horizontal). Too wide makes objects look small/far and hurts braking points [S Fanatec]. Offer a slider +-20 like the game [S].
- Head lean with lateral g: translate eye 0.02-0.04 m per g toward the corner, roll the camera 0.5-1 deg per g (max ~3 deg), lag 0.15 s. Real drivers' necks resist, so keep it small.
- Braking dip: pitch down 1-2 deg and move forward 0.02 m at 4-5 g decel. Throttle: pitch up 0.5 deg.
- Look-to-apex: yaw the camera up to the limit (10-15 deg [S value 10-15]) toward the next apex. Drive it by steering input blended with upcoming curvature on the racing line, smoothed with tau ~0.3 s. Zero it when going straight.
- Vibration: sum of two sines at engine order frequencies: freq = rpm/60 x 1 and x 2 (10 000 rpm = 167 Hz is invisible, so alias it to 18-30 Hz visible rattle), amplitude 0.0005-0.0015 m, scaled by throttle. Do not render at true engine frequency.
- Cockpit contents: wheel mesh, hands and forearms in front, mirrors, halo, front tyre tops visible left/right of the nose.

### TV pod
- Camera sits above/behind driver on the airbox [I]: ~0.9-1.1 m above eye height, 0.5-1 m behind, pitched down ~ 10-20 deg [S: angle -20, vert offset 17]. Car body, front wing and both front tyres visible. Almost no shake, strong speed feel from the camera being high and wide.

### Switching, horizon vs car lock
- Switching cameras with R1/RB is instant in play [S for button, I for blend]. Use a hard cut, optionally masked by a 80-120 ms radial blur flash. Do not interpolate position between cockpit and chase (they pass through the car).
- Cockpit: car-locked (rolls and pitches with the body, slightly reduced). Chase: horizon-ish (roll 15-25%), yaw-damped.

### Shake sources and amplitudes [I]
- Kerbs: from tyre surface type `rumble strip` [S field], inject vertical impulse + 25-35 Hz buzz, amplitude 0.004-0.008 m for 0.1-0.25 s per strike, scaled by speed/200.
- Grass/gravel: sustained low-frequency 6-10 Hz noise, 0.01-0.02 m, plus pitch jitter 0.5 deg.
- Engine rpm: 0.0005-0.0015 m as above.
- Collisions: impulse decaying with `exp(-t/0.25)`, 0.03-0.08 m, roll kick 2-4 deg.
- Always cap total shake and expose a master slider (users reduce it to 0 [S]).

## 2. Sense of speed (ranked by payoff)
Evidence: a controlled study found wider geometric FOV increases perceived speed, strong motion blur decreases perceived speed, and higher camera altitude at high speed increases it [S Holm 2017]. Fanatec warns excessive FOV exaggerates speed but hurts judgement [S].
1. Optic flow from near objects: dense trackside furniture (barriers, tyre walls, fences, kerbs, marshal posts, lamp posts, gantries). Spacing 5-15 m for fences/posts, 25-50 m for boards. Near objects within 3-8 m of the wheels matter most [I].
2. Ground texture frequency: tarmac with fine aggregate, white lines, rubbered line, kerb stripes ~0.5-1 m wide stripes. Use texture anisotropy 8-16 so it doesn't blur away.
3. FOV ramp (see chase cam). Also altitude: lower chase height at speed is the opposite of the study; keep height constant or slightly raise.
4. Light radial blur only at speed, since strong blur reduces perceived speed [S]. Implement: full-screen pass, 6-8 taps along the vector to screen centre, strength = smoothstep(220, 330 km/h) x 0.015-0.03 of screen radius, masked to edges (vignette), leave the car sharp. Use EffectComposer + custom ShaderPass.
5. Particle streaks: 40-80 thin additive line sprites (instanced), spawned in a ring 2-8 m from the camera, stretched along velocity, alpha 0.1-0.25, enabled above ~200 km/h. Cheap and effective.
6. Camera shake and engine rumble (above); amplitude rises with speed but saturates ~250 km/h.
7. Audio: engine pitch tied to rpm (see section 5), wind noise whoosh = speed^2 into a high-pass-ish filter, passing-by doppler on other cars (pitch shift of 1/(1 +- v_rel/343), clamped to +-6%), tunnel/barrier reverb pulses.
8. Per-object motion blur: skip in WebGL; velocity-buffer blur is costly. Fake with stretched wheels (transparent spoke blur disc above ~100 km/h).

## 3. Race start
Real procedure [S real-world, game implements a stylised version]: formation lap, cars stop in grid slots, five red lights illuminate one by one at 1 s intervals, then hold for a random period, then all go out = start [S]. Random hold range 0.2-3.0 s is the commonly stated figure [I]. No green light [S].
Game structure (I = from my knowledge of the series, not sourced):
1. Pre-race cinematic: track flyover, weather/temp, grid walk, driver on grid; garage/crowd ambience plays on the grid (recorded at Bahrain, Silverstone, Zandvoort [S audio]).
2. Optional formation lap: session safety-car status = "formation lap" (value 3 [S]). Player may weave to heat tyres; the game lets you practise starts here [S guide]. Penalties exist for formation-lap infringements, e.g. removed from formation lap, and infringement types 35-39 [S].
3. Grid: camera cuts to a rear/high chase view (or cockpit if chosen). HUD: rev lights, clutch/rev bar, light gantry graphic, position, no gap info [I].
4. Lights: 5 lights x 1.0 s each, hold random uniform(0.2, 3.0) s [I for range]. Engine held near launch revs (~10-11k, with limiter ~15k [I]); play a rising rev + crowd hush.
5. Lights out: crowd roar swell, AI release with individual reaction times (see AI). Player clutch is auto-bite unless manual start.
6. Jump start: infringement type 34 "Jump start" exists [S]. Penalty = drive-through or stop-go (5-10 s in reality [S]). Implement: if player speed > 5 km/h or position delta > 0.15 m before lights out, flag it, show race control message at lap 1 and apply a 10 s stop-go [I].
7. DRS locked for first 2 laps after start/restart [S real rules]; DRS enabled event DRSE/disabled DRSD sent by the game [S].
8. Camera: the cinematic cut to player view is a hard cut about 1-2 s before the first light, with a 0.5 s fade [I].
- Sounds: gantry lights are silent in reality; the games add a soft beep/click per light [I]. Engine revs rise on the 5th light, then a roar.
- First-corner AI: AI starts tightly bunched, each driver with a start skill trait [S F1 2010]. Cap AI aggression on lap 1: widen their desired lateral gap to 1.5x, brake 5-8 m earlier at T1, allow 0.5-1 car-width of line deviation to avoid you [I]. Typical outcome: slipstream tow into T1 and heavy bunching.

## 4. AI model
Sourced facts:
- Difficulty 0-110, set per track by players; F1 24 AI is about 7 steps slower than F1 23 at the same level; players finish ~1.4 positions above their start slot at the same level so add +2-3 for races vs qualifying [S F1Laps, community data].
- Per-driver ratings: experience, racecraft, awareness, pace, plus overall [S The Race]. Awareness tracks recent penalties; pace tracks lap times vs teammate; ratings drift during the season [S].
- Driver traits (F1 2010): start ability, overtaking (better ones attempt narrower gaps), wet pace, aggression, track suitability; a hidden system gives some drivers a good/bad race [S HEXUS]. AI performance not tied to race position or distance to player [S HEXUS]; Grid says no rubber banding and avoids spline-following [S PCGamesN, different game].
- Designers supply racing lines, braking zones, and track extents so AI can steer around crashes/onto grass [S PCGamesN, different game].
- F1 24 v1.5: AI uses ERS better for overtaking/gaps; v1.7: slipstream/DRS tuned to reduce AI trains [S].
- Practice/quali AI times are simulated from car/driver/weather/tyre inputs, not driven [S HEXUS F1 2010].
Implementable model [I]:
- Pace per car: `lapTime = trackBase x carFactor x (1 + 0.0008 x (110 - level))` where carFactor in [1.000, 1.025] from team performance. Per-race driver form: `formDelta ~ N(0, 0.15%)`, clamp +-0.4%, plus per-driver pace rating offset `(rating - 85) x 0.0004`. Per-lap noise N(0, 0.15%) at level 110, up to N(0, 0.4%) at level 30.
- Tyre degradation: lose 0.03-0.08 s per lap after a compound's cliff lap; AI pits within +-2 laps of a planned window, with strategy chosen at random from 1-2 stops.
- Aggression bands: defensive/neutral/aggressive = 0.3/0.5/0.7 of lateral-gap tolerance; min pass gap = carWidth x (1.1 - 0.4 x aggression); attempt probability per straight = 0.1 + 0.6 x racecraft/100.
- Mistakes: per corner probability `p = 0.0004 x (110 - level)/110 x (1.6 - awareness/100) x (1 + 0.5 x pressure)` where pressure is 1 if a car is within 0.5 s. Mistake outcomes: 60% lockup/run wide (+0.3-1.0 s), 25% off-track (+3-6 s), 10% spin, 5% minor contact. Keep totals to about one per car every 3-8 races at 90 level.
- Reaction times: lights-out reaction ~ N(0.25 s, 0.05) per driver, shifted by -0.03 per 10 experience points; AI gets a clean launch trait.
- Awareness: scan radius 1.5 car-lengths; if player alongside, hold a line with 1 car-width spacing; backs off throttle 5-10% when contact predicted within 0.3 s (TTC).
- Overtaking: only attempt when within 1 s (DRS or slipstream), choose the inside line at a braking zone, commit if the lateral gap > min pass gap; abort at braking point if not alongside by 50%.
- Defending: one move, shift lateral 0.5-1 car-width before the braking zone, return to the racing line before the apex (no weaving). Blocking rule: no moves after the car behind has committed (lateral overlap > 30%); penalty if player does.
- ERS: Auto-select Medium; use Overtake mode when within 1 s of target and battery > 30%; recharge in cruise. DRS: usable when gap at detection < 1.0 s, not in the first 2 laps [S rules], opens at zone start, closes on brake.
- No rubber banding: no speed boost to catch up. Instead accept natural pack dynamics [S].
- Avoidance: lateral offset target field around cars; use track extents to go wide, down to the grass edge.

## 5. Handling feel
- Steering: telemetry exposes normalised steer -1..+1 and front wheel angle in radians [S], plus lateral/long/vertical g, pitch/roll [S], suspension position and wheel slip ratio [S]. Model those same signals.
- Wheel mesh: rotate +-180 deg at full lock (360 lock-to-lock typical, ~450 at Monaco; forum, low confidence [S]); road-wheel angle ~ +-12-14 deg at the front tyres [I]. Smooth input: `steer += (target - steer) x (1 - exp(-dt/0.06))`, with speed-sensitive max (full lock at 0 km/h, ~25% at 300 km/h) [I].
- Hands: attach forearms to a wheel with IK; add 2-3 deg of hand lag.
- Body motion [I]: roll 1.0-1.5 deg per g, max ~3 deg; pitch ~0.5-1 deg per g braking, squat 0.5 deg under throttle; heave over kerbs 10-25 mm spikes. F1 24 reworked suspension so the body leans/yaws within the frames over corners and kerbs, models anti-dive and squat, and splits heave from roll stiffness [S].
- Understeer: front tyre slip > limit and yaw rate < expected: mild front scrub squeal, steering wheel turns further but car yaw lags; show front tyres angled but car pushing wide. Oversteer: rear slip angle > 8 deg; the car yaws, counter-steer shown visibly, camera heading blends to velocity heading.
- Traction loss cues: slip ratio > 0.1 under throttle: rear tyre smoke wisps + squeal, rev flare; > 0.2 heavy smoke. Lock-ups: brake slip > 0.15 flat-spot smoke and screech. Tyre audio uses wheel slip ratio / wheel rotation speed [S audio].
- Engine audio [S unless noted]: Codemasters uses Wwise, mapping RPM to car/audio; sounds selected for acceleration, idle, decel and crash; recorded with mics in each sidepod + one at the exhaust, mixed into a per-team bundle; transmission and turbo sounds are nonlinear and recorded separately; driver mix = helmet mics. Audiokinetic loop pattern: separate on-load and off-load loops, RPM RTPC plus a load RTPC (idle = 0.5 centre) [S Wwise tutorial].
 Web Audio implementation [I]: 4-6 looped rpm bands (idle 4k, 6k, 9k, 12k, 15k) crossfaded with equal-power curves, playbackRate = rpm / bandRpm; two sets (on-throttle / off-throttle) crossfaded by throttle with 80 ms smoothing; extra layers: turbo/MGU-H whistle (a high sine-ish band rising from 20% throttle), ERS whine (3-6 kHz band, gain from deploy level, faint), gear whine/transmission (pitch from wheel speed), exhaust pops/backfire on lift (random 40-90 ms bursts at 0.2-0.4 per second when rpm > 9k and throttle drops), shift cut (50-80 ms rpm dip + gain drop on upshift, 8-15 ms ramp), DRS flap clack (short 100 ms transient, plus a 3-5% drag-reduction hiss), tyre squeal loop gain from slip, wind loop gain ~ v^2, kerb rumble loop when on rumble strip.
- Gearshift timing [I]: 8 gears; upshift ~ 11.5-12.5k rpm (limiter ~ 15k [rpm max/idle fields S]); shift time 40-50 ms for auto, rpm drop ~ 1.5-2k. Rev LED pattern: 15 LEDs, 5 green + 5 red + 5 blue symmetric from the outside in; fill by `rpm% from 70% to 100%`, flash all on limiter or at the shift point. The telemetry exposes rev lights as a percentage [S].

## 6. HUD and broadcast
Data shown in the telemetry spec [S] is a good HUD content list: gear, speed, rpm/rev lights %, throttle/brake/clutch, DRS available + activation distance, ERS store (J), deploy mode (none/medium/overtake/hotlap), harvested/deployed this lap, tyre compound/age/wear/surface+inner temps, brake temps, fuel/laps remaining, fuel mix, TC/ABS, lap/sector times, delta, penalties, flags, safety-car status.
- Steering-wheel display [I]: gear large centre, speed, lap delta (green/red), ERS bar, DRS state, brake bias, tyre temp icons, laps remaining, rev LEDs along the top. Tyre temps: show colour-coded (blue cold, green optimal 80-100 C surface, red hot).
- Position change animation [I]: tower row slides 0.35 s (ease-out), green flash up, red flash down, hold 1.5 s.
- Sector colours [I]: purple = overall best, green = personal best, yellow = slower; show for 3-5 s after the sector line.
- DRS indicator state machine [I, based on field availability [S]]: OFF/greyed (not allowed) -> ELIGIBLE (lit outline when in detection <1 s at the detection line) -> OPEN (solid green, flap sound) -> CLOSED on brake/lift/zone end -> back to greyed. Also locked on yellow flags/first 2 laps [S real rules].
- Race control messages [I, events from spec S]: fastest lap (FTLP) purple banner; penalty issued (PENA); retirement (RTMT); DRS enabled (DRSE); chequered flag (CHQF); safety car, VSC, yellow/blue flags from FIA flag field [S].
- Delta: running delta vs best lap, updated 10-20 Hz, colour flip at zero, with a +-0.0 smoothing 0.1 s.
- Broadcast: pre-race grid graphics, lights gantry, leaderboard tower, battle graphic ("gap 0.6 s") when within 1 s, on-screen radio message cards.

## 7. Trackside detail that reads at speed [I; surface types [S]]
- Surface types in the game [S]: tarmac, rumble strip, concrete, rock, gravel, mud, sand, grass, water, cobblestone, metal, ridged. Use those as physics/audio/shake triggers.
- Kerbs: apex kerb 1.0-1.5 m wide, red/white stripes ~0.8-1.0 m each, ~15 mm rise; sausage kerbs ~ 0.2-0.3 m wide, yellow/ white, 40-60 mm high, bad to hit (heave impulse 3x). Use stripe normal map so lighting breaks up.
- Run-off: painted asphalt (red/ green/blue) with higher friction cue; gravel traps with bright beige noise texture and wheel dust particles; grass with darker, noisier texture and mud/dirt streaks bleeding onto the track edge.
- Rubber line: darker 1.0-1.5 m wide strip along the racing line, plus marbles (grey noisy bits) outside it; offline = lower grip multiplier 0.9-0.95 [I]. Use a decal / vertex alpha lerp.
- Edges: white track-limit lines, tyre marks at braking zones, dirt/dust, oil patches.
- Distance boards: 300/200/100/50 m braking boards, DRS zone boards (detection and activation markers), pit entry/exit lines, gantries and gantry shadows, marshal posts with flags, fencing with catch fencing at 4-6 m, TecPro barriers, tyre walls, advertising boards that repeat every ~20 m; camera trackside cameras for replays.
- Lighting cues: gantry shadows and tree lines passing give strobe-like speed cues; place them every ~40-80 m.

## 8. Build order (highest payoff first)
1. Speed FOV + speed-scaled shake + trackside density; 2. kerb/grass shake + engine layering with rpm bands; 3. chase camera with yaw-lag and lateral offset; 4. five-light start with random hold and jump-start check; 5. AI with pace distribution + mistakes + DRS/ERS rules; 6. HUD tower animations, sector colours, DRS machine; 7. polish (smoke, rubber line, radial blur).

## Sources
- EA/Codemasters UDP telemetry spec (F1 2020 reproduction used): https://f1-2020-telemetry.readthedocs.io/en/stable/telemetry-specification.html (F1 23/24 spec is on EA forums, not fetched)
- The Race, how F1 24 sounds are recorded: https://www.the-race.com/gaming/f1-24-how-sounds-are-recorded/
- The Race, F1 23 driver ratings: https://www.the-race.com/formula-1/new-f1-games-driver-ratings-show-ea-has-learned-some-lessons/
- Racinggames.gg F1 24 camera settings: https://racinggames.gg/f1/f1-24-best-camera-settings
- Racinggames.gg F1 24 physics/handling: https://racinggames.gg/f1/f1-24-physics-and-handling-changes ; GGRecon: https://www.ggrecon.com/articles/codemasters-reveals-more-about-f1-24-revised-physics-and-handling-systems
- HEXUS on F1 2010 AI: https://hexus.net/gaming/news/industry/26730-codemasters-responds-compaints-dodgy-f1-2010-ai/
- PCGamesN on Codemasters AI (Grid): https://www.pcgamesn.com/how-codemasters-teach-ai-drive
- F1Laps AI difficulty data: https://www.f1laps.com/f1-24/average-difficulty/ and https://www.f1laps.com/faqs/ai-difficulty-calculator/
- EA F1 24 patch notes v1.5/v1.7 (via search results): https://forums.ea.com/blog/f1-games-game-info-hub-en/f1%C2%AE-24-patch-notes-v1-5/8404942
- Flowracers on start lights: https://flowracers.com/blog/how-f1-start-lights-work/ ; DRS rules: https://flowracers.com/blog/f1-drs-zone
- Holm et al. 2017 (FOV/motion blur and perceived speed): https://eudl.eu/doi/10.1007/978-3-319-55834-9_14
- Fanatec FOV: https://www.fanatec.com/eu/en/explorer/games/gaming-tips/optimizing-fov-for-sim-racing-getting-the-view-right/
- Audiokinetic loop-based engine design: https://www.audiokinetic.com/en/loop-based-car-engine-design-with-wwise-part-2
- iRacing chase cam doc, BeamNG/GTA mod forum threads on speed-FOV camera (from search snippets).
