// Equation I - bootstrap, menu, render loop and cameras
window.EI = window.EI || {};
(function () {
  const U = EI.U, $ = (id) => document.getElementById(id);
  const DT = 1 / 120;
  let renderer, scene, track, scenery, envMap, race = null, viewports = [], cameras = [], camModes = [], sun, hemi, lastT = 0, acc = 0, paused = false, hudT = 0;
  let engines = [], shake = 0, resultsShown = false;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3();
  const CAM_MODES = ['chase', 'cockpit', 'tcam', 'tv'];   // tcam: the T-camera on top of the airbox (over the helmet and the halo)

  let composer = null, bloomPass = null, fxaaPass = null, speedPass = null, particles = null, skyMesh = null;
  // the race partners' logos in the menu footer (drawn with the same painters as the trackside boards)
  function drawPartnerLogos() {
    if (!EI.Ads) return;
    document.querySelectorAll('canvas.partner-logo').forEach((c) => {
      const ctx = c.getContext('2d'); const h = c.height * 0.8; ctx.clearRect(0, 0, c.width, c.height);
      if (c.dataset.brand === 'lumi') EI.Ads.lumiLogo(ctx, 2, c.height * 0.1, h, '#efe2ff'); else EI.Ads.intakeLogo(ctx, 2, c.height * 0.1, h, '#ffffff');
    });
  }
  // the circuit is chosen in the menu; a change reloads the page with ?track=<id> (the whole scene is built once at start-up)
  const trackId = (() => { try { const q = new URLSearchParams(location.search).get('track'); const id = q || localStorage.getItem('ei-track') || 'silverstone'; return EI.TRACKS[id] ? id : 'silverstone'; } catch (e) { return 'silverstone'; } })();
  // loading screen (F1 dress): the event and circuit of the track being built, filled in before the (blocking) scene build starts
  (function fillLoader(d) {
    if (!d) return; const set = (sel, v) => { const el = document.querySelector(sel); if (el && v) el.textContent = v; };
    set('#loader-event', d.gp || d.name + ' Grand Prix'); set('#loader-venue', d.circuit || d.name); set('#loading .loader-text', 'Building ' + d.name);
  })(EI.TRACKS[trackId]);
  function fillTrackCard(d) {
    const turns = d.corners.filter(c => c.t != null).length || d.corners.filter(c => !/Straight/i.test(c.name)).length;
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    set('track-kicker', d.country); set('track-name', d.name); set('track-meta', (d.location.split(',')[0]) + ' · ' + d.direction + ' · 3 sectors');
    set('track-km', (d.lapLength / 1000).toFixed(3)); set('track-turns', turns); set('track-drs', d.drs.length);
    const meta = $('menu-meta'); if (meta) meta.innerHTML = '<b>Round ' + (Object.keys(EI.TRACKS).indexOf(d.id) + 1) + '</b> &middot; ' + (d.gp || d.name + ' Grand Prix') + '<br>' + (d.circuit || d.name) + ' &middot; Race day';
    const sel = $('opt-track'); if (sel && !sel.options.length) { for (const id in EI.TRACKS) { const o = document.createElement('option'); o.value = id; o.textContent = EI.TRACKS[id].name + ' · ' + (EI.TRACKS[id].gp || ''); sel.appendChild(o); } sel.value = d.id; sel.addEventListener('change', () => { try { localStorage.setItem('ei-track', sel.value); } catch (e) { } const u = new URL(location.href); u.searchParams.set('track', sel.value); location.href = u.toString(); }); }
  }
  function init() {
    if (EI.CarGLB) EI.CarGLB.preload().catch(() => { });   // start downloading the car model now, while the scenery is being built
    const canvas = $('gl');
    // no MSAA on the canvas itself: the 3D view renders into an offscreen target (MSAA there when the budget allows, FXAA
    // otherwise) and is resolved onto the canvas in one pass (see the render pipeline below). desynchronized: a low-latency
    // canvas where the browser supports it (one frame less between the draw and the screen)
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', desynchronized: syncPref !== 'vsync' });
    // shader status queries stall until the GPU has compiled each program; skipped unless ?shaderdebug is in the URL
    renderer.debug.checkShaderErrors = /[?&]shaderdebug/.test(location.search); renderer.info.autoReset = false; capTextureUploads(renderer.getContext());
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;   // medium (the default); setQuality switches
    renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    // colour grade baked into every shader: vivid saturation, a little contrast and a warm lift
    // (the contrast pivots in a gamma-2 space: around 0.5 in linear it clipped everything darker than ~sRGB 55 to pure black -
    // crushed shade, and the night sky's whole navy gradient came out as a black void)
    const gradeChunk = (sat, con, warm) => '#if defined( TONE_MAPPING )\n gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );\n#endif\n' +
      '{ vec3 c = gl_FragColor.rgb; float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = max(mix(vec3(l), c, ' + sat.toFixed(3) + '), 0.0); c = sqrt(c); c = max((c - 0.5) * ' + con.toFixed(3) + ' + 0.5, 0.0); c *= c; c *= vec3(' + warm.map(v => v.toFixed(3)).join(', ') + '); gl_FragColor.rgb = clamp(c, 0.0, 1.0); }\n';
    THREE.ShaderChunk.tonemapping_fragment = gradeChunk(1.45, 1.13, [1.025, 1.0, 0.975]);
    scene = new THREE.Scene();
    // physically based sky, with the sun light aligned to it and a PMREM environment for reflections / ambient
    // per-circuit light: Silverstone keeps its English afternoon; Monaco gets a high late-May sun from over the sea (so the
    // city facades facing the harbour are lit), a clearer sky, sea haze on the horizon and warm stone bounce light
    const LOOKS = { monaco: { elev: 52, azim: 338, turb: 1.9, ray: 1.5, mie: 0.003, horizon: 0xb4cde8, sky: [0.27, 1.7], fog: [550, 2400], fogLow: [320, 1400], hemi: [0xa8cdf2, 0x8a7a66, 0.42], sun: [0xfff3e0, 2.65],
        // the cyan sky in the reflections tinted the shaded asphalt teal: a greyer environment, a little less saturation boost and
        // more contrast for the hard May sun; the Tete de Chien / Mont Agel ridge painted into the sky to the north (west to east-north-east)
        // MONACO-UPGRADE (vs the F1 photo set): the clear deep-blue Riviera sky of the race photos (was a pale cyan haze), and less
        // saturation boost (the sand / cream facades of the Boulevard Albert I read mustard), a touch more contrast for the hard sun
        envSat: 0.4, grade: { sat: 1.24, con: 1.19, warm: [1.012, 1.0, 0.985] }, ridge: [-3.05, -0.3, 0.38] },
      // Monza: race afternoon in a Lombardy September (~16:00) - the sun in the south-west at 37 degrees (long shadows across the
      // straights without the low-sun glare that washed the asphalt and the crowns towards the sun), a clear blue zenith over a hazy pale
      // horizon, the Royal Park's deep greens bouncing up as a green-olive ground light; a rich grade (deep park greens, vivid kerbs and
      // grass, slightly lower exposure so the pale sky and the white buildings hold); canopy: dappled sun under the park's trees (js/canopy.js)
      monza: { elev: 37, azim: 305, turb: 3.4, ray: 2.0, mie: 0.005, mieG: 0.84, horizon: 0xc8c9c3, sky: [0.46, 1.1], fog: [480, 2300], fogLow: [320, 1400],
        hemi: [0xb4c4d6, 0x4b6130, 0.44], sun: [0xffeccc, 2.5], envSat: 0.5, exp: 1.0, grade: { sat: 1.36, con: 1.16, warm: [1.02, 1.0, 0.98] }, canopy: { k: 0.72 },
        // MONZA-UPGRADE (F1 photos grid_stands_alps, rolex_straight_alps_trees): the Lombard Prealps on the northern horizon over the park - a broad
        // hazy range from Como to Bergamo, the Grigne massif and the Resegone's saw-tooth above Lecco, Monte Rosa's snow far in the west-north-west;
        // and a little less saturation boost (the park's crowns read lime, the photos' are deep olive). Sky pixels only.
        peaks: [[292, 0.07, 0.024, 0.28, 1, 0.9], [8, 0.62, 0.03, 0.32, 2, 0], [17, 0.12, 0.046, 0.42, 1, 0.12], [31, 0.08, 0.041, 0.42, 0, 0]] },
      // Yas Marina: the race starts at sunset - the sun low over the Gulf in the west-south-west, warm haze, long shadows
      // Yas Marina: a night race under floodlights (js/night.js: night sky, the light map, glows); the 'sun' is dim moonlight from
      // high up so the cars keep their contact shadows
      abudhabi: { night: true, elev: 70, azim: 200, west: [-0.7, 0, 0.7], horizon: 0x2a1f22, fog: [800, 3400], fogLow: [480, 1900], hemi: [0x3a4470, 0x2a1e14, 0.48], sun: [0xc8d2ff, 0.2], nightTrack: { core: 0.6, halo: 0.2 }, nightAir: [1.0, 0.84, 0.62, 0.05],
        grade: { sat: 1.22, con: 1.12, warm: [1.02, 1.0, 0.985] },
        // ABUDHABI-UPGRADE (the 2016-2025 race photos #023 / #028 / #032 / #040): the race starts at sunset - floodlit TWILIGHT, a burnt-orange
        // band low in the west-south-west under a deep blue sky (js/env_abudhabi.js; true = its defaults, or an object of colour overrides), a
        // dusk fog that melts the far island into the horizon, a violet-blue sky fill over a warm ground bounce
        twilight: true },
      // Spa-Francorchamps (SPA-BEAUTY): race afternoon in the Ardennes, 19 Jul 2026 15:00 CEST - the sun ~57 deg up in the south-west
      // (52 here), veiled by a milky overcast: soft sun, a strong cool-grey sky fill (no shadow map on Low, so the fill carries the shape),
      // white-grey sky with pale blue gaps (veil) under heavy cumulus decks, a hazy rim and two layers of blue-grey wooded ridges
      // (hills); the fog starts close so the spruce walls take an aerial blue-grey haze with distance and the far stands sit in it;
      // a cool, moderate grade (deep blue-green forest, mid-grey asphalt). All constants / sky-pixel maths: no calls, tris or programs.
      spa: { elev: 52, azim: 325, turb: 6, ray: 1.6, mie: 0.010, mieG: 0.78, horizon: 0xb2bcc2, sky: [0.48, 0.5], fog: [60, 1850], fogLow: [35, 1200],
        hemi: [0xc4ccd4, 0x34402c, 1.05], sun: [0xfff0dc, 1.5], envSat: 0.35, exp: 0.92, grade: { sat: 1.18, con: 1.1, warm: [0.98, 1.0, 1.02] },
        veil: [0.55, 0xd1d5da], haze: [0.65, 0.14], hills: [[0.052, 0.55, 1.3], [0.031, 1.1, 4.1]], clouds: [1.0, 0.7, 0xe2e6ea] },
      // Circuit of the Americas (COTA-BEAUTY): race afternoon in Austin, 25 Oct 2026 ~16:00 CDT - a warm low sun 30 deg up in the south-west
      // (game azim 308 = compass ~232), a big deep-blue Texas sky (low sky gain + strong zenith deepening) over a bright pale-blue haze rim,
      // a tight sun glow (low mie, high g), fair-weather cumulus; dry air, so the fog only starts far out (the Tower keeps its contrast across
      // the site) and ends where Low's far plane already was (no cost change); a brown straw ground bounce under a cool sky fill (Low has no
      // shadow map: the fill carries the shape); a punchy grade with less saturation boost than the default so the prairie reads tan-gold,
      // not lemon, and exposure ~10 % down so sunlit whites hold. All constants / sky-pixel maths: no calls, tris or programs.
      cota: { elev: 30, azim: 308, turb: 2.0, ray: 2.4, mie: 0.0015, mieG: 0.93, horizon: 0xbfd0e2, sky: [0.22, 2.2], fog: [700, 3200], fogLow: [800, 1800],
        hemi: [0x9fbfe8, 0x7a6440, 0.62], sun: [0xffe2bc, 2.65], envSat: 0.45, exp: 0.9, grade: { sat: 1.25, con: 1.2, warm: [1.04, 1.0, 0.96] },
        haze: [0.7, 0.12], clouds: [0.75, 0.4, 0xeef0f0] },
      // Autodromo Hermanos Rodriguez (MEX-BEAUTY): race afternoon in Mexico City, 1 Nov 2026 ~14:45 CST (mid-race) - the sun 40 deg up in the
      // south-west (game azim 312 = compass ~228), 2,240 m up: a hard white sun, and (as every race photo shows) a PALE, milky light-blue sky - a light
      // veil over the scattering sky, cool near-white rim, no brown smog band - with white fair-weather cumulus; a cool fill over a park-green bounce;
      // a moderate grade (less saturation boost than the default so the lawns read green, not lime; exposure a step down so sunlit whites hold).
      // peaks: the valley rim from GEN's landmarks (compass bearings in the circuit frame, apparent heights after curvature + refraction), farthest
      // first: Popocatepetl 131 / 64 km and Iztaccihuatl 118 / 53 km (FAINT, snow-capped, their feet lost in the smog: not confirmed visible from
      // the circuit), Sierra de las Cruces W, Ajusco SW (backlit, very faint), Sierra de Guadalupe N, Santa Catarina SE (in front of the volcanoes),
      // Cerro de la Estrella S; skyline: GEN's 76 OSM towers >= 70 m (7-17 km: Mitikah SW, the Reforma cluster WNW) merged into 36 silhouettes.
      // Fog / far plane as the stub (Low far 1275 m). All constants / sky-pixel maths: no calls, tris or programs.
      mexico: { elev: 40, azim: 312, turb: 4, ray: 1.8, mie: 0.005, mieG: 0.86, horizon: 0xccd2d6, sky: [0.38, 1.3], fog: [650, 2800], fogLow: [700, 1500],
        hemi: [0xb4c8e0, 0x6e6a54, 0.55], sun: [0xfff4e6, 2.7], envSat: 0.42, exp: 0.92, grade: { sat: 1.2, con: 1.16, warm: [1.02, 1, 0.98] },
        veil: [0.26, 0xdde3ea], haze: [0.7, 0.12], hills: [[0.01, 0.45, 2.1]], clouds: [0.7, 0.4, 0xf4f4f2],
        peaks: [[131, 0.19, 0.045, 0.6, 0, 0.65], [117.8, 0.2, 0.053, 0.6, 1, 0.9], [275, 0.55, 0.042, 0.22, 2, 0], [220, 0.22, 0.056, 0.2, 2, 0], [352, 0.38, 0.03, 0.32, 2, 0], [138, 0.17, 0.031, 0.45, 2, 0], [180, 0.2, 0.03, 0.45, 2, 0]],
        skyline: [0.55, [[237.05, 0.0021, 0.0064, 0.96], [240.32, 0.0057, 0.0275, 0.97], [246.6, 0.0067, 0.0145, 0.88], [257.74, 0.0021, 0.0032, 0.91], [261.13, 0.0035, 0.0142, 0.95], [263.77, 0.0028, 0.0095, 0.96], [264.73, 0.0021, 0.0084, 0.88], [266.03, 0.0057, 0.0161, 1.04], [268.94, 0.0025, 0.0087, 0.98], [282.23, 0.0021, 0.0091, 0.94], [282.71, 0.0021, 0.0098, 0.92], [284.19, 0.0108, 0.0105, 1.02], [285.38, 0.0042, 0.0252, 0.99], [286.2, 0.0025, 0.0261, 0.88], [286.81, 0.0024, 0.0138, 0.96], [287.39, 0.0037, 0.0099, 0.91], [287.88, 0.0023, 0.0169, 0.99], [288.4, 0.0059, 0.0083, 0.89], [289.74, 0.0025, 0.0095, 0.97], [290.63, 0.0025, 0.0194, 0.96], [291.2, 0.0047, 0.0138, 0.9], [291.75, 0.0033, 0.015, 0.87], [292.67, 0.0026, 0.0199, 1.05], [293.85, 0.0069, 0.0119, 1.05], [296.58, 0.003, 0.0116, 0.88], [297.47, 0.0027, 0.0115, 0.95], [298.23, 0.0028, 0.0103, 1.05], [299.36, 0.0028, 0.0133, 0.9], [301.54, 0.0029, 0.0138, 0.94], [302.43, 0.0031, 0.0103, 0.97], [302.89, 0.0033, 0.0165, 0.99], [312.56, 0.0024, 0.014, 0.92], [317.05, 0.0029, 0.0132, 0.89], [318.42, 0.0057, 0.0119, 1.06], [318.96, 0.0027, 0.0099, 0.95], [321.49, 0.0086, 0.0116, 0.91]]] } };
    const LK = Object.assign({ elev: 38, azim: 212, turb: 2.5, ray: 2.0, mie: 0.004, horizon: 0xa9c4e4, sky: [0.42, 1.0], fog: [600, 2600], fogLow: [350, 1500], hemi: [0x9fc4ee, 0x3f5a2e, 0.35], sun: [0xfff1dd, 2.4] }, LOOKS[trackId] || {}); EI.look = LK;
    // look tuning (art direction): ?look={json} merges over the circuit's LOOKS entry, e.g. ?look={"elev":34,"grade":{"sat":1.4,"con":1.1}}
    { const m = /[?&]look=([^&]+)/.exec(location.search); if (m) { try { Object.assign(LK, JSON.parse(decodeURIComponent(m[1]))); } catch (e) { console.warn('bad ?look', e); } } }
    // a per-circuit grade replaces the default one (the night race: less saturation boost, a little more contrast, so the floodlit
    // turquoise and the purple LED wash read vivid without turning neon)
    if (LK.exp) renderer.toneMappingExposure = LK.exp;   // per-circuit exposure (LOOKS exp; default 1.05)
    if (LK.grade) { const G = LK.grade; THREE.ShaderChunk.tonemapping_fragment = gradeChunk(G.sat, G.con, G.warm || [1.03, 1.0, 0.97]); }
    const nightLook = !!(LK.night && EI.Night); if (nightLook) EI.Night.on = true; const nightWest = new THREE.Vector3(...(LK.west || [-1, 0, 0]));
    const sunDir = new THREE.Vector3(); const elev = LK.elev, azim = LK.azim; const phi = THREE.MathUtils.degToRad(90 - elev), theta = THREE.MathUtils.degToRad(azim); sunDir.setFromSphericalCoords(1, phi, theta);
    skyMesh = new THREE.Sky(); skyMesh.scale.setScalar(5500); const su = skyMesh.material.uniforms; su.turbidity.value = LK.turb; su.rayleigh.value = LK.ray; su.mieCoefficient.value = LK.mie; su.mieDirectionalG.value = LK.mieG || 0.85;
    // the sky may put its sun lower than the light's (a sunset glow without shadows stretched across the whole circuit)
    const skySun = LK.skyElev != null ? new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - LK.skyElev), theta) : sunDir; su.sunPosition.value.copy(skySun); scene.add(skyMesh);
    // drawn after every opaque surface (it sits on the far plane): the scattering shader then only runs where the sky shows - early
    // depth rejection skips the pixels the city, the trees and the stands already cover (PERF)
    skyMesh.renderOrder = 100;
    // the scattering sky comes out bright enough that ACES flattens it to near-white: a gain per circuit (LOOKS sky: [gain,
    // zenith deepening]) keeps a clear blue overhead fading to a paler, hazier horizon - only on screen (the environment map
    // that lights and reflects the scene keeps the full sky)
    // LOOKS ridge: [azimuth from, azimuth to (atan2(z, x), +x east, +z south), crest height as sin(elevation)]: a hazy mountain
    // silhouette in the sky itself (no geometry; it sits behind everything), darker grey-olive towards the crest, streaked by ravines
    const RIDGE = !LK.ridge ? '' : (() => { const R = LK.ridge, f = (v) => (+v).toFixed(4); return ' float rph = atan(direction.z, direction.x);' +
      ' float rmk = smoothstep(' + f(R[0]) + ', ' + f(R[0] + 0.35) + ', rph) * (1.0 - smoothstep(' + f(R[1] - 0.35) + ', ' + f(R[1]) + ', rph));' +
      ' float rh = ' + f(R[2]) + ' * rmk * (0.6 + 0.2 * sin(rph * 3.1 + 0.7) + 0.13 * sin(rph * 7.7 + 2.1) + 0.06 * sin(rph * 19.3 + 0.4) + 0.025 * sin(rph * 47.0 + 1.3) + 0.012 * sin(rph * 113.0));' +
      ' float ra = (1.0 - smoothstep(rh - 0.0022, rh, direction.y)) * step(0.004, rh);' +
      ' if (ra > 0.0) { float rd = clamp(direction.y / max(rh, 0.001), 0.0, 1.0); float rn = 0.5 + 0.5 * sin(rph * 64.0 + 2.2 * sin(rph * 23.0) + direction.y * 6.0) * (0.6 + 0.4 * sin(rph * 17.0 + 1.3));' +
      ' vec3 rc = hz0 * uSkyGain * mix(vec3(0.8, 0.82, 0.82), vec3(0.5, 0.5, 0.42), smoothstep(0.0, 0.8, rd)) * (0.88 + 0.22 * rn);' +
      ' retColor = mix(retColor, rc, ra); }'; })();
    // LOOKS haze: [k, height as sin(elevation)]: the sky melts into the fog colour towards the horizon (a milky rim). LOOKS hills:
    // [[crest as sin(elevation), darkness 0..1, seed], ...] full-circle wooded ridges painted into the sky, farthest first: each rises
    // out of the fog colour and darkens / cools towards its serrated (tree-lined) crest, nearer layers darker = aerial perspective.
    // Both are mixed AFTER the tone map + grade + sRGB encoding, exactly where three's fog mixes, so fogged ground at the far plane
    // and the painted hills meet without a seam. Integer frequencies round the circle (no step in the west). Sky pixels only.
    // LOOKS veil: [k, hex]: a milky overcast over the whole sky (blue gaps between the cloud decks turn pale blue-grey, the sun's disc
    // is veiled); the clouds draw over it
    // LOOKS peaks: [[compass deg (circuit frame: x east, z south), half width rad, crest as sin(elevation), contrast 0..1, shape (0 cone,
    // 1 three-summit massif, 2 broad range), snow 0..1], ...], farthest first: distant mountains painted before the hills, their feet lost
    // in the low smog band (contrast grows with height), sunlit snow above ~80 % of the crest, gullies streaking the snow line. LOOKS
    // skyline: [contrast, [[compass deg, half width rad, top as sin(elevation), tone], ...]]: far towers painted after the hills (nearer
    // than the rim), backlit grey, their bases in the city haze. Sky pixels only, each mountain / the skyline behind its own sector test;
    // compiled only when a circuit's look sets them (every other sky shader is unchanged). Sky.js measures its direction from the eye (an
    // infinitely far sky, SKY-FIX), and so do these layers: bearings and heights stay true round the lap
    const PK = (() => { const f = (v) => (+v).toFixed(4), ang = (c) => f(THREE.MathUtils.euclideanModulo(c - 90, 360) * Math.PI / 180);
      const sq = (o, w) => 'exp(-(pa - ' + f(o) + ') * (pa - ' + f(o) + ') * ' + f(1 / (w * w)) + ')';
      let p = ''; for (const [Cp, W, H, Kc, Sh, Sn] of LK.peaks || []) {
        const shape = Sh === 1 ? '(0.86 * pow(1.0 - pu, 1.15) + 0.15 * ' + sq(-0.08 * W, 0.04 * W) + ' + 0.14 * ' + sq(0, 0.07 * W) + ' + 0.2 * ' + sq(0.135 * W, 0.06 * W) + ' + 0.2 * ' + sq(0.23 * W, 0.05 * W) + ')'
          : Sh === 2 ? '(1.0 - pu * pu) * (0.78 + 0.12 * sin(pa * 23.0 + ' + f(Cp * 0.37) + ') + 0.07 * sin(pa * 61.0 + ' + f(Cp * 0.71) + ') + 0.03 * abs(sin(pa * 157.0 + ' + f(Cp) + ')))'
          : 'min(1.0, 1.04 * (1.0 - pu) * (1.0 - pu)) * (1.0 + 0.03 * pu * sin(pa * 140.0 + ' + f(Cp * 0.53) + '))';
        p += ' { float pa = mod(pph - ' + ang(Cp) + ' + 3.14159, 6.28319) - 3.14159, pu = abs(pa) * ' + f(1 / W) + '; if (pu < 1.0) { float ph = ' + f(H) + ' * ' + shape + ';' +
          ' float pm = (1.0 - smoothstep(ph - 0.0012, ph, py)) * smoothstep(-0.006, 0.0, py); if (pm > 0.0) { vec3 pc = uHz * vec3(0.56, 0.63, 0.76);' +
          (Sn ? ' pc = mix(pc, min(uHz * 1.1 + 0.03, vec3(1.0)), ' + f(Sn) + ' * smoothstep(' + f(0.8 * H - 0.0015) + ', ' + f(0.8 * H + 0.0015) + ', py + 0.0016 * sin(pa * 330.0 + 1.3 * sin(pa * 120.0))));' : '') +
          ' hc = mix(hc, pc, pm * ' + f(Kc) + ' * (0.3 + 0.7 * smoothstep(0.004, 0.034, py))); } } }'; }
      let k = ''; if (LK.skyline) { const [Kc, T] = LK.skyline; let lo = 1e9, hi = -1e9, top = 0; for (const [c, w, h] of T) { lo = Math.min(lo, c - w * 57.3); hi = Math.max(hi, c + w * 57.3); top = Math.max(top, h); }
        const mid = (lo + hi) / 2; k = ' { float sa = mod(pph - ' + ang(mid) + ' + 3.14159, 6.28319) - 3.14159; if (abs(sa) < ' + f((hi - lo) / 2 * Math.PI / 180 + 0.001) + ' && py < ' + f(top + 0.001) + ') { float th = 0.0, tn = 1.0;';
        for (const [c, w, h, tone] of T) k += ' { float m = step(abs(sa - ' + f((c - mid) * Math.PI / 180) + '), ' + f(w) + ') * step(th, ' + f(h) + '); th = mix(th, ' + f(h) + ', m); tn = mix(tn, ' + f(tone) + ', m); }';
        k += ' float tm = (1.0 - smoothstep(th - 0.0005, th, py)) * step(0.0001, th) * smoothstep(-0.006, 0.0, py); hc = mix(hc, uHz * vec3(0.56, 0.6, 0.7) * tn, tm * ' + f(Kc) + ' * (0.45 + 0.55 * smoothstep(0.0, 0.02, py))); } }'; }
      const D = ' float py = direction.y, pph = atan(direction.z, direction.x);';
      return LK.peaks || LK.skyline ? [' {' + D + p, k + ' }'] : ['', '']; })();
    const HAZE = !(LK.haze || LK.hills || LK.veil || LK.peaks || LK.skyline) ? '' : (() => { const f = (v) => (+v).toFixed(4), Hz = LK.haze || [0, 0.1], Vl = LK.veil, vc = Vl ? new THREE.Color(Vl[1]) : null;
      let s = '\n{ vec3 hc = gl_FragColor.rgb; float hy = direction.y, hph = atan(direction.z, direction.x);' +
        (Vl ? ' hc = mix(hc, vec3(' + f(vc.r) + ', ' + f(vc.g) + ', ' + f(vc.b) + '), ' + f(Vl[0]) + ');' : '') +
        ' hc = mix(hc, uHz, ' + f(Hz[0]) + ' * (1.0 - smoothstep(-0.01, ' + f(Hz[1]) + ', hy)));' + PK[0];
      for (const [C, K, q] of LK.hills || []) s += ' { float rh = ' + f(C) + ' * (0.56 + 0.2 * sin(hph * 2.0 + ' + f(q) + ') + 0.12 * sin(hph * 5.0 + ' + f(q * 2.3) + ') + 0.07 * sin(hph * 11.0 + ' + f(q * 3.7) + ')' +
        ' + 0.035 * sin(hph * 23.0 + ' + f(q * 1.9) + ') + 0.03 * abs(sin(hph * 170.0 + 2.0 * sin(hph * 41.0 + ' + f(q) + '))));' +
        ' float rm = 1.0 - smoothstep(rh - 0.0015, rh, hy); float rd = clamp(hy / max(rh, 0.001), 0.0, 1.0);' +
        ' hc = mix(hc, uHz * mix(vec3(1.0), vec3(0.55, 0.66, 0.68), ' + f(K) + ' * smoothstep(0.0, 1.0, rd)), rm); }';
      return s + PK[1] + ' gl_FragColor.rgb = hc; }\n'; })();
    { const SG = LK.sky || [0.62, 0.35]; su.uSkyGain = { value: SG[0] }; su.uSkyDeep = { value: SG[1] }; su.uHz = { value: new THREE.Color(LK.horizon) };
      skyMesh.material.onBeforeCompile = (sh) => { sh.uniforms.uSkyGain = su.uSkyGain; sh.uniforms.uSkyDeep = su.uSkyDeep; sh.uniforms.uHz = su.uHz;
        sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform float uSkyGain; uniform float uSkyDeep; uniform vec3 uHz;\nvoid main() {')
          .replace('gl_FragColor = vec4( retColor, 1.0 );', 'vec3 hz0 = retColor; float zk = smoothstep(0.02, 0.75, direction.y); retColor *= uSkyGain * mix(vec3(1.0), vec3(0.78, 0.9, 1.08), zk * uSkyDeep);' + RIDGE + ' gl_FragColor = vec4( retColor, 1.0 );')
          .replace('#include <encodings_fragment>', '#include <encodings_fragment>' + HAZE); };
      skyMesh.material.customProgramCacheKey = () => 'ei-sky-gain' + (LK.ridge ? 'r' : '') + (HAZE ? 'h' + HAZE.length : ''); }
    // the night sky sits on the far plane like the day sky: drawn last of the opaques, it only shades the pixels where it shows (PERF-2)
    if (nightLook) { scene.remove(skyMesh); skyMesh = EI.Night.makeSky(nightWest); skyMesh.renderOrder = 100; scene.add(skyMesh); }
    const t0 = performance.now(); const pm = new THREE.PMREMGenerator(renderer); pm.compileEquirectangularShader();
    const skyScene = new THREE.Scene(); const sky2 = new THREE.Sky(); sky2.scale.setScalar(5500); sky2.material.uniforms.turbidity.value = LK.turb; sky2.material.uniforms.rayleigh.value = LK.ray; if (LK.skyElev != null) { sky2.material.uniforms.mieCoefficient.value = LK.mie; sky2.material.uniforms.mieDirectionalG.value = LK.mieG || 0.85; } sky2.material.uniforms.sunPosition.value.copy(skySun); skyScene.add(sky2);
    // the environment (reflections + ambient of every PBR surface) sees a greyer sky than the screen: the saturated cyan otherwise
    // tints every grazing surface - asphalt in the shade above all - teal (LOOKS envSat, 1 = the full sky colour)
    { const es = (LK.envSat != null ? LK.envSat : 0.6).toFixed(3); sky2.material.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );', 'retColor = mix(vec3(dot(retColor, vec3(0.2126, 0.7152, 0.0722))), retColor, ' + es + '); gl_FragColor = vec4( retColor, 1.0 );'); }; sky2.material.customProgramCacheKey = () => 'ei-env-sky' + es; }
    scene.environment = nightLook ? EI.Night.makeEnv(renderer, nightWest) : pm.fromScene(skyScene, 0.02).texture; pm.dispose(); const tPmrem = Math.round(performance.now() - t0);
    const horizon = LK.horizon; scene.fog = new THREE.Fog(horizon, LK.fog[0], LK.fog[1]);
    hemi = new THREE.HemisphereLight(LK.hemi[0], LK.hemi[1], LK.hemi[2]); scene.add(hemi);
    sun = new THREE.DirectionalLight(LK.sun[0], LK.sun[1]); sun.castShadow = true; this_sunDir = sunDir;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.near = 10; sun.shadow.camera.far = 600;
    sun.shadow.camera.left = -70; sun.shadow.camera.right = 70; sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; sun.shadow.radius = 1.6;
    scene.add(sun); scene.add(sun.target); installShadowCache(); if (EI.Perf) EI.Perf.attach(renderer);
    envMap = scene.environment;
    const timings = {}; let tm = performance.now(); const lap = (k) => { timings[k] = Math.round(performance.now() - tm); tm = performance.now(); };
    const tdata = EI.TRACKS[trackId] || EI.TRACKS.silverstone; EI.trackId = tdata.id;
    track = new EI.Track(tdata); lap('track-math');
    scenery = new EI.Scenery(track); scene.add(scenery.build()); lap('scenery');
    // LOOKS clouds: [opacity of the low deck, of the high deck, tint hex]: a heavier, greyer sky with the same two draws
    if (LK.clouds && scenery.clouds && scenery.clouds2) { const C = LK.clouds; scenery.clouds.material.opacity = C[0]; scenery.clouds2.material.opacity = C[1]; if (C[2] != null) { scenery.clouds.material.color.setHex(C[2]); scenery.clouds2.material.color.setHex(C[2]); } }
    scene.add(track.build(scenery)); lap('track-mesh');
    if (EI.Night && EI.Night.on) { EI.Night.build(scene, track, scenery); lap('night'); } timings.pmrem = tPmrem; EI.debug.timings = timings;
    scene.traverse(o => { if (o.material && o.material.isMeshStandardMaterial && o.material.envMapIntensity === 1) o.material.envMapIntensity = 0.3; });
    if (LK.canopy && EI.Canopy && !nightLook) { EI.Canopy.build(scene, track, sunDir, LK.canopy); lap('canopy'); }
    particles = new EI.Particles(scene);
    // post-processing (single viewport): bloom + FXAA
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, new THREE.PerspectiveCamera()));
    bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.28, 0.55, 0.88); composer.addPass(bloomPass);
    fxaaPass = new THREE.ShaderPass(THREE.FXAAShader); composer.addPass(fxaaPass);
    // radial speed blur + vignette (only in the High preset)
    speedPass = new THREE.ShaderPass({
      uniforms: { tDiffuse: { value: null }, strength: { value: 0 }, vignette: { value: 0.35 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; uniform float strength; uniform float vignette; varying vec2 vUv; void main(){ vec2 c = vec2(0.5, 0.42); vec2 d = vUv - c; float r = length(d); vec4 col = vec4(0.0); float s = strength * smoothstep(0.15, 0.7, r); for (int i = 0; i < 8; i++) { float t = 1.0 - s * float(i) * 0.012; col += texture2D(tDiffuse, c + d * t); } col /= 8.0; col.rgb *= 1.0 - vignette * smoothstep(0.45, 0.95, r); gl_FragColor = col; }'
    }); composer.addPass(speedPass);
    EI.HUD.drawTrackPreview(track, $('track-preview')); fillTrackCard(track.data);
    setupMenu(); drawPartnerLogos();
    // the GLB car is optional: hide the loading overlay once it is in (or has failed and we fall back to the procedural car)
    const hideLoading = () => { $('loading').classList.add('hidden'); loaded = true; };
    const tp = performance.now(); if (EI.CarGLB) EI.CarGLB.preload().then(() => { timings.preload = Math.round(performance.now() - tp); hideLoading(); }, hideLoading); else hideLoading();
    window.addEventListener('resize', onResize);
    if (U.isTouch()) EI.Input.initTouch($('touch'));
    cameras = [new THREE.PerspectiveCamera(60, 1, 0.3, 6000)]; onResize(); requestAnimationFrame(loop);
  }
  let this_sunDir = null, loaded = false;
  // display: 'low' = a desynchronized (low-latency) canvas, 'vsync' = the browser's normal vsynced path (no tearing). The
  // context attribute is fixed when the renderer is made, so a change applies on the next page load.
  const syncPref = (() => { try { return localStorage.getItem('ei-sync') === 'vsync' ? 'vsync' : 'low'; } catch (e) { return 'low'; } })();
  // graphics preset: Low (the fastest, the default) unless the player picked another one before (remembered)
  const savedQ = (() => { try { const v = localStorage.getItem('ei-quality'); return v === 'low' || v === 'medium' || v === 'high' ? v : 'low'; } catch (e) { return 'low'; } })();
  let quality = savedQ; EI.quality = savedQ;
  // one view of the frame: the High preset's post chain (bloom, FXAA, speed blur; single view only) renders straight to the
  // canvas, everything else goes through the render pipeline's offscreen target (rect in CSS pixels, null = full screen)
  // tunnel exposure (a circuit with a tunnel): inside, the camera opens up (exposure x1.45) while the ambient fill drops, so the
  // bore reads dim and the exit burns white; it adapts over ~0.3 s each way, per view (uniform changes only)
  const tunF = [0, 0]; let dtT = 0;
  function tunnelLight(k, car, dt) {
    const TD = track && track.data.tunnel; if (!TD || !hemi || !EI.look) return; if (k === 0) dtT = dt;
    const s = car.trk ? car.trk.s : -1e9, inT = s > TD.s0 + 4 && s < TD.s1 - 2 ? 1 : 0;
    tunF[k] += (inT - tunF[k]) * Math.min(1, dt * 3.5);
    renderer.toneMappingExposure = (EI.look.exp || 1.05) * (1 + 0.45 * tunF[k]); hemi.intensity = EI.look.hemi[2] * (1 - 0.45 * tunF[k]);
    if (sun && EI.look.sun) sun.intensity = EI.look.sun[1] * (renderer.shadowMap.enabled ? 1 : 1 - 0.92 * tunF[k]);   // no shadow map (Low): the roof cannot shade the bore, so the sun fades in the tunnel
  }
  function renderView(cam, usePost, rect) {
    if (!(usePost && composer && quality === 'high')) { pipeDraw(cam, rect); return; }
    { composer.passes[0].camera = cam; if (speedPass && race) { const car = hlCams ? { v: 0 } : race.players[0]; const v = Math.abs(car.v); speedPass.uniforms.strength.value = U.clamp((v - 35) / 60, 0, 1) * (CAM_MODES[camModes[0]] === 'cockpit' ? 0.5 : 0.9); } composer.render(); }
  }
  // pixel ratio per tier: the device ratio capped (low 1, medium 1.25, high 1.5) and held to a pixel budget, so a large or dense
  // screen does not multiply the fill cost (low ~1.6 Mpx, medium ~3.2 Mpx, high ~4.6 Mpx; 1080p at ratio 1 is 2.1 Mpx)
  const PX_BUDGET = { low: 1.6e6, medium: 3.2e6, high: 4.6e6 };
  // Low's sun shadow filter: three's BasicShadowMap branch (unused otherwise) becomes a 4-tap bilinear PCF - a smooth one-texel
  // edge for 4 depth reads per shaded pixel instead of the PCF filter's 17 (shadow sampling is a large share of the per-pixel cost
  // on an integrated GPU); Medium / High keep the wider PCF
  { const C = THREE.ShaderChunk, A = '#else\n\t\t\tshadow = texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z );\n\t\t#endif';
    if (C.shadowmap_pars_fragment.indexOf(A) >= 0) C.shadowmap_pars_fragment = C.shadowmap_pars_fragment.replace(A, '#else\n\t\t\tvec2 eiT = shadowCoord.xy * shadowMapSize - 0.5, eiF = fract(eiT), eiB = (floor(eiT) + 0.5) / shadowMapSize, eiS = 1.0 / shadowMapSize;\n' +
      '\t\t\tshadow = mix(mix(texture2DCompare(shadowMap, eiB, shadowCoord.z), texture2DCompare(shadowMap, eiB + vec2(eiS.x, 0.0), shadowCoord.z), eiF.x),\n' +
      '\t\t\t\tmix(texture2DCompare(shadowMap, eiB + vec2(0.0, eiS.y), shadowCoord.z), texture2DCompare(shadowMap, eiB + eiS, shadowCoord.z), eiF.x), eiF.y);\n\t\t#endif'); }
  // texture size cap per tier (PERF): on Low every image / data texture larger than 2048 x 2048 texels (the city atlas, the big ad
  // and banner sheets...) is uploaded at half size (box-filtered; UVs are normalised, mips are generated from the smaller level),
  // so an integrated GPU sharing system memory keeps ~60-90 MB less in textures; Medium / High upload everything as built.
  // Hooked at the GL call, so it also covers textures that only live in a shader's uniforms; render targets (no pixels) are untouched.
  const TEX_CAP = { low: 2048 * 2048, medium: 4096 * 4096, high: Infinity }; let texCap = TEX_CAP[savedQ] || Infinity;
  function capTextureUploads(gl) {
    if (!gl || gl._eiCap) return; gl._eiCap = true; const orig = gl.texImage2D;
    const half = (src, w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w >> 1); c.height = Math.max(1, h >> 1); const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height); return c; };
    const halfData = (d, w, h) => { const w2 = w >> 1, h2 = h >> 1, o = new Uint8Array(w2 * h2 * 4); for (let y = 0; y < h2; y++) { const r0 = (y * 2) * w * 4, r1 = r0 + w * 4; for (let x = 0; x < w2; x++) { const a = r0 + x * 8, b = r1 + x * 8, q = (y * w2 + x) * 4; for (let k = 0; k < 4; k++) o[q + k] = (d[a + k] + d[a + 4 + k] + d[b + k] + d[b + 4 + k] + 2) >> 2; } } return o; };
    gl.texImage2D = function () {
      const a = arguments;
      try {
        if (a[1] === 0 && texCap < Infinity) {
          if (a.length === 6 && a[5] && a[5].width && a[5].height) {   // (target, level, internalformat, format, type, source)
            let src = a[5], w = src.width, h = src.height; while (w * h > texCap && w > 1 && h > 1) { src = half(src, w, h); w = src.width; h = src.height; }
            if (src !== a[5]) return orig.call(this, a[0], a[1], a[2], a[3], a[4], src);
          } else if (a.length === 9 && a[8] && a[8].length && a[6] === gl.RGBA && a[7] === gl.UNSIGNED_BYTE && a[3] * a[4] > texCap && !(a[3] & 1) && !(a[4] & 1)) {
            let d = a[8], w = a[3], h = a[4]; while (w * h > texCap && !(w & 1) && !(h & 1)) { d = halfData(d, w, h); w >>= 1; h >>= 1; }
            return orig.call(this, a[0], a[1], a[2], w, h, a[5], a[6], a[7], d);
          }
        }
      } catch (e) { }
      return orig.apply(this, a);
    };
  }
  // a changed cap re-uploads the large textures of the scene's materials (the next render uploads them through the hook)
  function applyTexCap(q) {
    const cap = TEX_CAP[q] || Infinity; if (cap === texCap) return; texCap = cap; if (!scene) return; const seen = new Set();
    const chk = (t) => { if (!t || !t.isTexture || seen.has(t) || t.isRenderTargetTexture) return; seen.add(t); const im = t.image; if (im && im.width * im.height > 2048 * 2048) t.needsUpdate = true; };
    scene.traverse(o => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) { for (const k in m) { const v = m[k]; if (v && v.isTexture) chk(v); } if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k] && m.uniforms[k].value; if (v && v.isTexture) chk(v); } } });
  }
  function tierPixelRatio(q) { const cap = q === 'low' ? 1 : q === 'high' ? 1.5 : 1.25; return Math.max(0.6, Math.min(window.devicePixelRatio || 1, cap, Math.sqrt(PX_BUDGET[q] / Math.max(1, window.innerWidth * window.innerHeight)))); }
  function setQuality(q) {
    if (q !== quality || !setQuality.done) { quality = q; autoLv = loadLv(); ftEma = 16.7; lockUpUntil = 0; setQuality.done = true; } quality = q; const pr = tierPixelRatio(q); renderer.setPixelRatio(pr);
    const sm = q === 'low' ? 1024 : 2048; if (sun.shadow.mapSize.x !== sm) { sun.shadow.mapSize.set(sm, sm); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    // shadow filtering: the 4-tap bilinear PCF on low (above), PCF (17 taps) with a little blur radius on medium, the soft PCF on
    // high
    const st = q === 'high' ? THREE.PCFSoftShadowMap : q === 'low' ? THREE.BasicShadowMap : THREE.PCFShadowMap; sun.shadow.radius = q === 'high' ? 2 : 1.6;
    // Low: no sun shadow map at all (no shadow pass, no shadow lookups per pixel); the cars keep their contact shadows (one draw for
    // the field) and the Monaco tunnel dims the sun itself (tunnelLight). PERF wave 6: the user found every Low track laggy.
    const shOn = q !== 'low'; sun.castShadow = shOn;
    if (renderer.shadowMap.type !== st || renderer.shadowMap.enabled !== shOn) { renderer.shadowMap.enabled = shOn; renderer.shadowMap.type = st; scene.traverse(o => { const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => { x.needsUpdate = true; }); }); }   // programs are keyed by the type
    // the shadow box: +-70 m (+-55 m on low, where the map is 1024); the cached static shadow is rebuilt for the new settings
    const R = q === 'low' ? 55 : 70, sc = sun.shadow.camera; if (sc.right !== R) { sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.updateProjectionMatrix(); } invalidateShadowCache();
    if (scenery && scenery.group) scenery.group.traverse(o => { if (o.name === 'trees' || o.name === 'crowd') o.castShadow = q === 'high'; });
    applyTexCap(q); if (EI.Env && EI.Env.setQuality) EI.Env.setQuality(q); EI.quality = q; if (scenery && scenery.setQuality) scenery.setQuality(q); if (EI.Pit && EI.Pit.setQuality) EI.Pit.setQuality(q); if (track && track.setQuality) track.setQuality(q); if (EI.Canopy && EI.Canopy.setQuality) EI.Canopy.setQuality(q);
    // fog: Low's haze (and the far plane with it) 15 % closer (PERF wave 6)
    // low: no live mirrors, no grass tufts / decorative instancing named 'detail', fog closer
    scene.traverse(o => { if (/tuft|detail/i.test(o.name || '')) o.visible = q !== 'low'; });
    if (scene.fog) { const L = EI.look || { fog: [600, 2600], fogLow: [350, 1500] }; const f = q === 'low' ? L.fogLow : L.fog, fk = q === 'low' ? 0.85 : 1; scene.fog.near = f[0] * fk; scene.fog.far = f[1] * fk; } fitFarPlane();
    onResize();
  }

  // ------------------------------------------------------------------ menu
  function setupMenu() {
    const teamSel = [$('p1-team'), $('p2-team')];
    teamSel.forEach((sel, k) => { EI.TEAMS.forEach((t, i) => { const o = document.createElement('option'); o.value = i; o.textContent = t.name; sel.appendChild(o); }); sel.value = k === 0 ? 0 : 3; });
    // own teams (Lumi / Intake): listed after the 11 entries; a player on one takes over the lowest-standing entry no player drives for
    const OWN = EI.Race && EI.Race.ownTeams ? EI.Race.ownTeams() : [];
    if (OWN.length) teamSel.forEach((sel) => { const g = document.createElement('optgroup'); g.label = 'Own team (takes over an entry)'; OWN.forEach(t => { const o = document.createElement('option'); o.value = 'own:' + t.id; o.textContent = t.name; g.appendChild(o); }); sel.appendChild(g); });
    // seat: the driver the player replaces (their car number, and their slot on a real 2026 grid); two players never share a seat
    const seatSel = [$('p1-seat'), $('p2-seat')];
    const pick = (k) => { const v = teamSel[k].value; return /^own:/.test(v) ? { own: v.slice(4) } : { teamIndex: +v }; };
    const lineupFor = (k) => { const np = +$('opt-players').value; const ks = k < np ? [0, 1].slice(0, np) : [k]; const LU = EI.Race.lineup(ks.map(j => Object.assign(pick(j), { seat: seatSel[j] ? +seatSel[j].value || 0 : 0 }))); return LU.playerSeats[ks.indexOf(k)]; };
    const fillSeats = (k) => {
      const sel = seatSel[k]; if (!sel) return; const st = lineupFor(k), t = st.team, key = t.id + ':' + (t.entry || '');
      if (sel._key !== key) { const was = sel.value; sel._key = key; sel.innerHTML = ''; t.drivers.forEach((d, j) => { const o = document.createElement('option'); o.value = j; o.textContent = '#' + d.num + ' ' + String(d.name).split(' ').pop() + (t.entry ? ' · ' + t.entryName : ''); o.title = d.name; sel.appendChild(o); }); sel.value = was && +was < t.drivers.length ? was : '0'; }
    };
    const refresh = () => {
      fillSeats(0); fillSeats(1);
      if ($('opt-players').value === '2' && seatSel[1] && teamSel[0].value === teamSel[1].value && seatSel[0].value === seatSel[1].value) seatSel[1].value = String(1 - (+seatSel[0].value || 0));
      [0, 1].forEach(k => { const st = lineupFor(k); EI.drawLiveryPreview($('p' + (k + 1) + '-preview'), st.team, st.driver.num, $('p' + (k + 1) + '-name').value || 'YOU'); });
      $('out-laps').textContent = $('opt-laps').value; $('p2-setup').classList.toggle('hidden', $('opt-players').value !== '2'); if ($('split-field')) $('split-field').classList.toggle('hidden', $('opt-players').value !== '2');
      const maxBots = EI.TEAMS.reduce((n, t) => n + t.drivers.length, 0) - (+$('opt-players').value); $('opt-bots').max = maxBots; if (+$('opt-bots').value > maxBots) $('opt-bots').value = maxBots; $('out-bots').textContent = $('opt-bots').value;
    };
    ['p1-team', 'p2-team', 'p1-seat', 'p2-seat', 'p1-name', 'p2-name', 'opt-laps', 'opt-bots', 'opt-players'].forEach(id => $(id) && $(id).addEventListener('input', refresh)); refresh();
    initSkill();
    const sp = $('opt-split'); if (sp) { sp.value = splitPref; sp.addEventListener('change', () => { splitPref = sp.value; try { localStorage.setItem('ei-split', splitPref); } catch (e) { } onResize(); }); }
    if ($('opt-quality')) { $('opt-quality').value = savedQ; $('opt-quality').addEventListener('change', () => { try { localStorage.setItem('ei-quality', $('opt-quality').value); } catch (e) { } }); }
    $('btn-start').addEventListener('click', () => { EI.Audio.resume(); setQuality($('opt-quality').value); try { localStorage.setItem('ei-quality', $('opt-quality').value); } catch (e) { } startRace(readConfig()); });
    const syncSel = $('opt-sync'); if (syncSel) { syncSel.value = syncPref; syncSel.addEventListener('change', () => { try { localStorage.setItem('ei-sync', syncSel.value); } catch (e) { } if (syncSel.value !== syncPref && !race) location.reload(); }); }
    // resolution: the menu and the pause card share one saved setting
    const resSel = [$('opt-res'), $('pause-res')].filter(Boolean);
    resSel.forEach(sel => { sel.value = resPref; sel.addEventListener('change', () => { setRes(sel.value); resSel.forEach(o => { o.value = sel.value; }); }); });
    $('btn-resume').addEventListener('click', () => setPaused(false));
    $('btn-restart').addEventListener('click', () => { setPaused(false); startRace(race.cfg); });
    $('btn-quit').addEventListener('click', () => { setPaused(false); endRace(); });
    $('btn-again').addEventListener('click', () => { $('results').classList.add('hidden'); startRace(race.cfg); });
    $('btn-menu').addEventListener('click', () => { $('results').classList.add('hidden'); endRace(); });
    // controls screen: the menu button, H anywhere outside a text field, Esc / the close button / a click outside to close
    const ctl = $('controls'); const showCtl = (on) => { if (ctl) ctl.classList.toggle('hidden', !on); };
    if ($('btn-controls')) $('btn-controls').addEventListener('click', () => showCtl(true));
    if ($('btn-controls-close')) $('btn-controls-close').addEventListener('click', () => showCtl(false));
    if (ctl) ctl.addEventListener('click', e => { if (e.target === ctl) showCtl(false); });
    window.addEventListener('keydown', e => {
      const a = document.activeElement; if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
      const open = ctl && !ctl.classList.contains('hidden');
      if (e.code === 'KeyH' && (!race || paused)) { showCtl(!open); e.stopImmediatePropagation(); return; }
      if (open && e.code === 'Escape') { showCtl(false); e.stopImmediatePropagation(); }
      if (e.code === 'KeyF' && !e.repeat && !e.ctrlKey && !e.metaKey && EI.Perf) EI.Perf.toggle();   // performance readout
    }, true);
    window.addEventListener('keydown', e => {
      if (!race) return;
      if (e.code === 'Escape' || e.code === 'KeyP') { if (!resultsShown) setPaused(!paused); }
      if (e.code === 'KeyM') { const m = EI.Audio.toggleMute(); EI.HUD.toast(m ? 'Sound muted' : 'Sound on'); }
      if (e.code === 'KeyR' && !paused && race.players.length === 1) startRace(race.cfg);   // split screen: restart from the pause menu (R sits next to player 1's keys)
      if (e.code === 'KeyC') cycleCam(0); if (e.code === 'Slash') cycleCam(1);
    });
  }
  function cycleCam(k) { if (!race || paused || !camModes[k] && camModes[k] !== 0) return; if (k >= race.players.length) return; camModes[k] = (camModes[k] + 1) % CAM_MODES.length; placeCamera(cameras[k], race.players[k], k, true, 0); if (race.players.length > 1) EI.HUD.toast('Camera · ' + CAM_MODES[camModes[k]], null, k); else EI.HUD.toast('P' + (k + 1) + ' camera: ' + CAM_MODES[camModes[k]]); }
  // two players: tighter scenery level-of-detail radii (the scenery is drawn twice a frame); restored for one player
  function applySplitTier(on) {
    const S = EI.Scenery; if (!scenery || !scenery.setQuality || !S || !S.TIERS) return;
    const q = EI.quality || quality, T = S.TIERS[q]; if (!T) return;
    if (!on) { scenery.setQuality(q); return; }
    const m = (v, f, cap) => Math.min(v * f, cap == null ? Infinity : cap);
    const tight = Object.assign({}, T, { treeNear: m(T.treeNear, 0.7), treeFar: m(T.treeFar, 0.75, 1600), grass: [T.grass[0] * 0.8, T.grass[1] * 0.8], crowd: m(T.crowd, 0.75), cars: m(T.cars, 0.7, 700), tents: m(T.tents, 1, 700), clutter: m(T.clutter, 0.7, 900), cityDetail: m(T.cityDetail || 0, 0.75), cityFar: m(T.cityFar || 0, 0.75) });   // city ranges too (PERF: the street city is the bulk of Monaco's 2P cost)
    S.TIERS[q] = tight; try { scenery.setQuality(q); } finally { S.TIERS[q] = T; }
  }
  // Bot skill = the named levels in #opt-diff (Very easy ... Very hard, Official F1 = real 2026 pace, Ultra = car limit); the pick is remembered.
  const SKILL_SHORT = { official: 'Official F1', ultra: 'Ultra', above: 'Above average' };
  function skillLabel(v) { const o = $('opt-diff') && Array.prototype.find.call($('opt-diff').options, x => x.value === v); return 'Skill: ' + (SKILL_SHORT[v] || (o ? o.textContent.replace(/\s*\(.*$/, '') : v)); }   // pause / start screen: next to "Grid: ..."
  EI.skillLabel = skillLabel;
  function initSkill() {
    const el = $('opt-diff'); if (!el) return;
    try { const q = localStorage.getItem('ei-diff'); if (q && Array.prototype.some.call(el.options, o => o.value === q)) el.value = q; } catch (e) { }
    el.addEventListener('change', () => { try { localStorage.setItem('ei-diff', el.value); } catch (e) { } });
  }
  function readConfig() {
    const np = +$('opt-players').value; const players = [];
    // two players on the default names: P1 / P2 (otherwise player 2's own tower and tags call the other car "YOU")
    const nm = (k) => { const v = ($('p' + (k + 1) + '-name').value || (k ? 'RIVAL' : 'YOU')).toUpperCase(); return np > 1 && v === (k ? 'RIVAL' : 'YOU') ? 'P' + (k + 1) : v; };
    for (let k = 0; k < np; k++) players.push({ name: nm(k), teamIndex: /^own:/.test($('p' + (k + 1) + '-team').value) ? 0 : +$('p' + (k + 1) + '-team').value, own: /^own:/.test($('p' + (k + 1) + '-team').value) ? $('p' + (k + 1) + '-team').value.slice(4) : null, seat: $('p' + (k + 1) + '-seat') ? +$('p' + (k + 1) + '-seat').value || 0 : 0, tyre: $('p' + (k + 1) + '-tyre').value });
    return { players, bots: +$('opt-bots').value, laps: +$('opt-laps').value, difficulty: $('opt-diff').value, grid: $('opt-grid').value, assist: $('opt-assist').value, seed: (Math.random() * 1e9) | 0, envMap };
  }
  function setPaused(p) { paused = p; $('pause').classList.toggle('hidden', !p); if (!p) lastT = performance.now(); }

  // ------------------------------------------------------------------ race lifecycle
  function startRace(cfg) {
    endRace(); cfg.envMap = envMap;
    race = new EI.Race(track, cfg);
    if (EI.Replay) EI.Replay.attach(race);   // post-race highlights: records the race (js/replay.js)
    for (const c of race.cars) scene.add(c.group);
    viewports = race.players.map((car, k) => EI.HUD.makeViewport(k, car, race.players.length));
    // split screen: each view shows its player's keys while the cars wait on the grid (and for a few seconds after the start)
    if (race.players.length > 1) viewports.forEach((vp, k) => {
      const chip = document.createElement('div'); chip.className = 'sp-keys show';
      chip.innerHTML = k === 0 ? '<span class="ctl-pl">P1</span><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> drive</span><span><kbd>L.Shift</kbd> aero</span><span><kbd>Space</kbd> ERS</span><span><kbd>C</kbd> camera</span><span><kbd>P</kbd> pit</span>'
        : '<span class="ctl-pl">P2</span><span><kbd>&#8593;</kbd><kbd>&#8592;</kbd><kbd>&#8595;</kbd><kbd>&#8594;</kbd> drive</span><span><kbd>R.Shift</kbd>/<kbd>.</kbd> aero</span><span><kbd>Enter</kbd> ERS</span><span><kbd>/</kbd> camera</span><span><kbd>&#9003;</kbd> pit</span>';
      vp.el.appendChild(chip); vp.keyChip = chip;
    });
    cameras = race.players.map(() => new THREE.PerspectiveCamera(62, 1, 0.25, 6000)); camModes = race.players.map(() => 0);
    engines = race.players.map(() => EI.Audio.createEngine());
    $('menu').classList.add('hidden'); $('results').classList.add('hidden');
    $('touch').classList.toggle('hidden', !(U.isTouch() && race.players.length === 1));
    resultsShown = false; paused = false; lastT = performance.now(); acc = 0; introT = 0; autopilots = []; tunF[0] = tunF[1] = 0; applySplitTier(race.players.length > 1); onResize();   // tunF: a race quit inside the tunnel must not start the next one over-exposed. onResize sizes the HUD viewports (setRect)
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();   // Enter / Space must not press a menu button
    race.players.forEach((car, k) => placeCamera(cameras[k], car, k, true, 0));
    EI.HUD.banner('EQUATION I · ' + track.name.toUpperCase() + ' GP', race.gridInfo ? 3400 : 2400, null, [race.gridInfo ? 'Grid: ' + race.gridInfo.label : '', cfg.difficulty && race.ais && race.ais.length ? skillLabel(cfg.difficulty) : ''].filter(Boolean).join(' · ') || null);
    introLen = race.players.length === 1 ? 8.2 : 2.8;
    raceRenderSetup();
  }
  function endRace() {
    if (EI.Replay) EI.Replay.detach();
    if (race) for (const c of race.cars) scene.remove(c.group);
    if (contactShadows) { scene.remove(contactShadows.mesh); contactShadows.mesh.geometry.dispose(); contactShadows = null; }
    if (race && race.players.length > 1) applySplitTier(false);
    race = null; $('viewports').innerHTML = ''; viewports = []; EI.Audio.stopAll(); engines = []; autopilots = [];
    $('lights').classList.add('hidden'); $('banner').classList.add('hidden'); $('touch').classList.add('hidden'); $('menu').classList.remove('hidden');
    cameras = [new THREE.PerspectiveCamera(60, 1, 0.3, 6000)]; onResize();
  }
  // ------------------------------------------------------------------ race rendering: car level of detail, contact shadows, shader warm-up
  // car LOD from the cameras of the last frame: distance scaled by the zoom (the TV camera) and the tier (low switches sooner)
  const LOD_TIER = { low: 2.2, medium: 1.25, high: 0.8 };   // medium: full-detail bots within ~22 m, the 14k mid LOD to ~58 m (PERF wave 6: was 27 / 72 m)   // low: full-detail bots within ~12 m, the 14k-triangle mid LOD to ~33 m
  let contactShadows = null, lodFrame = -1;
  function updateCarLod() {
    const ts = (LOD_TIER[quality] || 1) * (cameras.length > 1 ? 1.3 : 1);   // two views: every car is drawn twice, switch to the lighter LODs sooner
    for (const c of race.cars) {
      let d = 1e9;
      for (const cam of cameras) { const dx = c.x - cam.position.x, dy = c.y - cam.position.y, dz = c.z - cam.position.z; const z = Math.tan(cam.fov * Math.PI / 360) * 1.732; const dd = Math.sqrt(dx * dx + dy * dy + dz * dz) * z; if (dd < d) d = dd; }
      c.setLOD(null, c.isPlayer ? 0 : d * ts);
      if (c.isPlayer) {
        // Low: the player's own car from the lo LOD in the outside views (chase / TV / replay); cockpit and T-cam keep the detail
        const lite = c.lodNear && c.lodNear.userData.lite; if (lite) { const m = CAM_MODES[camModes[c.playerIndex] || 0]; lite(quality === 'low' && (!!hlCams || (m !== 'cockpit' && m !== 'tcam'))); }
      } else if (c.lodLevel === 2 && c.lodFar && c.lodFar.userData.geos) {
        // beyond ~200 m (scaled: ~90 m on Low) the far LOD becomes a ~1-2k-triangle silhouette (PERF)
        const G = c.lodFar.userData.geos, dd = d * ts, g = dd > (c.lodFar.geometry === G[1] ? 180 : 200) ? G[1] : G[0]; if (g && c.lodFar.geometry !== g) c.lodFar.geometry = g;
      }
    }
    // bots' full-size liveries are painted in the background: a larger slice per frame during the intro, ~3 ms while racing
    // while racing the painter gets what the frame can spare: up to 3 ms, less when the rest of the frame's CPU work (smoothed)
    // already nears 12 ms, so on a slow laptop the background painting never pushes a frame past the 60 Hz refresh
    if (EI.CarGLB && EI.CarGLB.pump) {
      _eyes.length = 0; for (const cam of cameras) _eyes.push(cam.position);
      const t = performance.now(); EI.CarGLB.pump(!race.started && introT < introLen ? 14 : U.clamp(12 - cpuEma, 0.5, 3), race.cars, _eyes); pumpMs = performance.now() - t;
    }
  }
  const _eyes = []; let cpuEma = 6, pumpMs = 0, frameT0 = 0;
  // nothing beyond the fog's far end can be seen: the far plane stops there, and the sky box shrinks to fit inside it
  function fitFarPlane() {
    const far = Math.min(6000, scene && scene.fog ? scene.fog.far : 6000);
    for (const cam of cameras || []) { cam.far = far; cam.updateProjectionMatrix(); }
    if (skyMesh) skyMesh.scale.setScalar(far * 1.1);
  }
  function raceRenderSetup() {
    // all contact shadows in one draw call, rewritten once per frame just before the first render of the frame
    if (EI.CarGLB && EI.CarGLB.ContactShadows && race.cars.some(c => c.lodMid)) { contactShadows = new EI.CarGLB.ContactShadows(race.cars); scene.add(contactShadows.mesh); }
    scene.onBeforeRender = () => { if (contactShadows && lodFrame !== frameNo) { lodFrame = frameNo; contactShadows.update(); } };
    // nothing beyond the fog's far end can be seen: the far plane stops there
    fitFarPlane();
    // compile every program the race can use now (all car LODs, every scenery material) instead of hitching on first sight
    if (EI.Night && EI.Night.on) EI.Night.patchScene(scene);   // the race's cars and anything added since the build
    try { renderer.compile(scene, cameras[0]); } catch (e) { }
    collectShadowMovers(); invalidateShadowCache();
  }
  // ------------------------------------------------------------------ split screen
  // Split: 'auto' stacks the two views top / bottom (wide, short frames that see as much road as one player does) and only puts
  // them side by side on very wide windows (wider than 2.2 : 1, where stacked views would be letterbox slits). Chosen in the menu.
  const SPLIT_GAP = 2, SPLIT_PR = { low: 0.8, medium: 1, high: 1.1 };
  let splitPref = (() => { try { const v = localStorage.getItem('ei-split'); return v === 'tb' || v === 'sbs' ? v : 'auto'; } catch (e) { return 'auto'; } })();
  let splitDirNow = null;
  // ------------------------------------------------------------------ render pipeline
  // The 3D view renders into an offscreen target at the internal resolution, then one full-screen pass resolves it onto the
  // canvas: a bilinear upscale with contrast-adaptive sharpening (AMD CAS style) when the internal resolution is below the
  // canvas, FXAA when the target has no MSAA. The HUD is HTML and always stays sharp. Frame rate is what makes the controls
  // feel direct (input is read once per frame), so when frames run long the Auto setting steps down through cheaper
  // settings - MSAA -> FXAA first (a large saving on laptop GPUs, hardly visible), then the internal resolution in mild
  // steps to 75 % (68 % with two views, 60 % on Low), sharpened - and climbs back when there is room. Fixed settings: Resolution menu.
  // 'native': one 3D pixel per CSS pixel (a Retina / HiDPI screen gets the canvas at the preset's pixel ratio and the 3D view
  // CAS-upscaled onto it: about 1.3 Mpx instead of 2 Mpx for a 13" MacBook on Medium, still sharp)
  const RES_OPTS = { auto: 0, native: -1, '100': 1, '85': 0.85, '70': 0.7, '50': 0.5 };
  let resPref = (() => { try { const v = localStorage.getItem('ei-res'); return v && RES_OPTS[v] != null ? v : 'auto'; } catch (e) { return 'auto'; } })();
  const LEVELS = [{ s: 1, msaa: true }, { s: 1, msaa: false }, { s: 0.9 }, { s: 0.82 }, { s: 0.75 }, { s: 0.68 }, { s: 0.6 }];
  let autoLv = 0, ftEma = 16.7, ftClock = 0, ftUp = 0, lockUpUntil = 0, lastUpAt = -1e9;
  // the level Auto settled on is remembered per preset, so a slow machine starts the next race there instead of stuttering
  // through the first seconds while it steps down again
  const lvKey = () => 'ei-autolv-' + quality;
  // first race on a preset: Medium starts on FXAA (level 1) and climbs to MSAA only when the frames have room (PERF wave 6: MSAA was the
  // dearest default on an integrated GPU); Low / High start at the top
  const lv0 = () => quality === 'medium' ? 1 : 0;
  const loadLv = () => { try { const s = localStorage.getItem(lvKey()); if (s == null) return lv0(); const v = +s; return v >= 0 && v < LEVELS.length ? v : lv0(); } catch (e) { return lv0(); } };
  const saveLv = () => { try { localStorage.setItem(lvKey(), String(autoLv)); } catch (e) { } };
  // internal scale (of the canvas resolution) and whether the target is multisampled
  function viewState() {
    const lv = LEVELS[Math.min(autoLv, LEVELS.length - 1)];
    let sc = resPref === 'auto' ? lv.s : resPref === 'native' ? Math.min(1, 1 / renderer.getPixelRatio()) : RES_OPTS[resPref]; let msaa = resPref === 'auto' ? !!lv.msaa : sc >= 1;
    if (quality === 'low') msaa = false;
    // two views: the internal resolution per preset as before (the two views together cover the screen)
    if (cameras.length > 1) sc *= Math.min(1, (SPLIT_PR[quality] || 1) / tierPixelRatio(quality));
    return { sc, msaa: msaa && PIPE.maxSamples > 0 };
  }
  function adaptResolution(rawMs, dt) {
    if (!race || paused || rawMs > 250 || document.hidden || resPref !== 'auto') return;
    ftEma += (rawMs - ftEma) * 0.06; ftClock += dt; if (ftClock < 1) return; ftClock = 0;
    const now = performance.now(), maxLv = quality === 'low' ? LEVELS.length - 1 : cameras.length > 1 ? 5 : 4; let lv = autoLv;   // low may go to 60 % (sharpened) when the GPU cannot keep up
    // on a 60 Hz screen frames come in 16.7 / 33.3 ms steps: an average over ~19 ms means about one frame in seven misses the
    // refresh - noticeable as judder and input lag - so step down; step back up only when nearly every frame makes it
    if ((ftEma > 19 || gpuQ > 1.6) && lv < maxLv) { lv++; ftUp = 0; if (now - lastUpAt < 6000) lockUpUntil = now + 30000; }   // a step up that did not hold: stay down a while
    else if (ftEma < 17.2 && gpuQ < 0.9 && lv > 0 && now > lockUpUntil) { if (++ftUp >= 4) { lv--; ftUp = 0; lastUpAt = now; } }
    else ftUp = 0;
    if (lv !== autoLv) { autoLv = lv; saveLv(); onResize(); }
  }
  const PIPE = { rt: null, maxSamples: 0, scene: null, cam: null, mat: null, w: 0, h: 0, sc: 1, msaa: false, open: false };
  function pipeInit() {
    PIPE.maxSamples = renderer.capabilities.isWebGL2 ? Math.min(4, renderer.capabilities.maxSamples || 0) : 0;
    PIPE.mat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2(1, 1) }, uFxaa: { value: 0 }, uSharp: { value: 0 }, uBloom: { value: 0 }, uBT: { value: new THREE.Vector3(0.8, 0.55, 0.42) }, uVig: { value: 0.22 }, uAsp: { value: 1.78 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: [
        'varying vec2 vUv; uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uFxaa; uniform float uSharp; uniform float uBloom; uniform vec3 uBT; uniform float uVig; uniform float uAsp;',
        'vec3 tx(vec2 o) { return texture2D(tDiffuse, vUv + o * uTexel).rgb; }',
        'float lu(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }',
        'void main() {',
        '  vec3 c = tx(vec2(0.0)); vec3 n = tx(vec2(0.0, 1.0)), s = tx(vec2(0.0, -1.0)), e = tx(vec2(1.0, 0.0)), w = tx(vec2(-1.0, 0.0));',
        '  if (uFxaa > 0.5) {',
        // FXAA (console style): blur along the edge found from the luma of the four diagonal neighbours
        '    vec3 a1 = tx(vec2(-1.0, 1.0)), a2 = tx(vec2(1.0, 1.0)), a3 = tx(vec2(-1.0, -1.0)), a4 = tx(vec2(1.0, -1.0));',
        '    float lNW = lu(a1), lNE = lu(a2), lSW = lu(a3), lSE = lu(a4), lM = lu(c);',
        '    float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));',
        '    vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));',
        '    float red = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125); float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);',
        '    dir = clamp(dir * rcp, -8.0, 8.0);',
        '    vec3 ra = 0.5 * (tx(dir * (1.0 / 3.0 - 0.5)) + tx(dir * (2.0 / 3.0 - 0.5)));',
        '    vec3 rb = ra * 0.5 + 0.25 * (tx(dir * -0.5) + tx(dir * 0.5)); float lB = lu(rb);',
        '    c = (lB < lMin || lB > lMax) ? ra : rb;',
        '  }',
        '  if (uSharp > 0.0) {',
        // contrast-adaptive sharpening: a negative-lobe cross filter, weaker where the local contrast is already high
        '    vec3 mn = min(c, min(min(n, s), min(e, w))), mx = max(c, max(max(n, s), max(e, w)));',
        '    vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0));',
        '    vec3 wt = -amp * mix(0.125, 0.2, uSharp);',
        '    c = clamp((c + (n + s + e + w) * wt) / (1.0 + 4.0 * wt), 0.0, 1.0);',
        '  }',
        // cheap glow (Low / Medium at night; High has its bloom chain): three blurred levels of the frame's own mip chain, each
        // above a threshold that drops with the blur (a small bright lamp averages down) - a soft halo round floodlights, LEDs
        // and lit glass for three texture reads
        '  if (uBloom > 0.0) {',
        '    vec3 b1 = texture2D(tDiffuse, vUv, 2.5).rgb, b2 = texture2D(tDiffuse, vUv, 4.0).rgb, b3 = texture2D(tDiffuse, vUv, 5.5).rgb;',
        '    vec3 g = max(b1 - uBT.x, 0.0) * 0.7 + max(b2 - uBT.y, 0.0) * 0.55 + max(b3 - uBT.z, 0.0) * 0.5;',
        '    c = 1.0 - (1.0 - c) * (1.0 - clamp(g * uBloom, 0.0, 1.0));',
        '  }',
        // lens vignette: the corners fall off a little (frames the car, a camera-lens feel), aspect-corrected, ~3 ALU ops
        '  vec2 vq = (vUv - 0.5) * vec2(uAsp, 1.0) / max(uAsp, 1.0); c *= 1.0 - uVig * smoothstep(0.32, 0.9, dot(vq, vq) * 2.2);',
        '  gl_FragColor = vec4(c, 1.0);',
        '}'].join('\n'),
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    PIPE.scene = new THREE.Scene(); PIPE.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), PIPE.mat); q.frustumCulled = false; PIPE.scene.add(q);
  }
  // (re)allocate the offscreen target for the canvas size, internal scale and MSAA
  function pipeSize() {
    if (!PIPE.mat) pipeInit();
    const st = viewState(); const pr = renderer.getPixelRatio();
    const w = Math.max(2, Math.round(window.innerWidth * pr * st.sc)), h = Math.max(2, Math.round(window.innerHeight * pr * st.sc));
    // glow from the target's mip chain: night circuits on Low / Medium (WebGL2, a target without MSAA: the mips are made after
    // each view is drawn)
    // day circuits get a gentle high-threshold glare too (sun glints off cars, glass and white paint): LOOKS bloom [strength,
    // thresholds x3]; the night threshold catches every lamp
    const night = !!(EI.Night && EI.Night.on), BL = (EI.look && EI.look.bloom) || (night ? [1, 0.8, 0.55, 0.42] : [0.55, 0.93, 0.84, 0.76]);
    // (day glare is optional polish: it goes as soon as the internal resolution has to drop - the mip chain of the target is a
    // full-screen pass on its own; the night glow stays, the lamps need it)
    // Low at full internal scale: no offscreen target, no resolve pass (FXAA / glow / vignette) - the view renders straight to the
    // canvas; the target only comes back when Auto has to lower the internal resolution (PERF wave 6)
    const direct = quality === 'low' && st.sc >= 0.999 && !st.msaa;
    if (direct) { if (PIPE.rt) { PIPE.rt.dispose(); PIPE.rt = null; } PIPE.direct = true; PIPE.sc = st.sc; PIPE.w = w; PIPE.h = h; PIPE.msaa = false; PIPE.bloom = false; return; }
    PIPE.direct = false;
    const bloom = quality !== 'high' && quality !== 'low' && !st.msaa && renderer.capabilities.isWebGL2 && BL[0] > 0 && (night || st.sc >= 0.999 || resPref === 'native');
    PIPE.mat.uniforms.uBloom.value = bloom ? BL[0] : 0; PIPE.mat.uniforms.uBT.value.set(BL[1], BL[2], BL[3]);
    PIPE.mat.uniforms.uVig.value = (EI.look && EI.look.vignette != null) ? EI.look.vignette : 0.22; PIPE.mat.uniforms.uAsp.value = window.innerWidth / Math.max(1, window.innerHeight);
    PIPE.sc = st.sc; if (PIPE.rt && PIPE.w === w && PIPE.h === h && PIPE.msaa === st.msaa && PIPE.bloom === bloom) return;
    if (PIPE.rt) PIPE.rt.dispose();
    // stencilBuffer: true is what buys a 24-bit depth buffer: three r128 gives a depth-only render target DEPTH_COMPONENT16, ~2 cm depth
    // steps at 20 m and ~60 cm at 100 m with the 0.25 m near plane, so the far cars' panels / wheels / wings z-fought through each
    // other ('broken, shattered' bots and replay shots); DEPTH24_STENCIL8 is 256x finer for +2 bytes a pixel
    const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, encoding: THREE.sRGBEncoding, depthBuffer: true, stencilBuffer: true };
    PIPE.rt = st.msaa ? new THREE.WebGLMultisampleRenderTarget(w, h, opts) : new THREE.WebGLRenderTarget(w, h, opts);
    if (st.msaa) PIPE.rt.samples = PIPE.maxSamples;
    PIPE.rt.texture.encoding = THREE.sRGBEncoding; PIPE.rt.texture.generateMipmaps = bloom; if (bloom) PIPE.rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
    PIPE.w = w; PIPE.h = h; PIPE.msaa = st.msaa; PIPE.bloom = bloom;
    PIPE.mat.uniforms.tDiffuse.value = PIPE.rt.texture; PIPE.mat.uniforms.uTexel.value.set(1 / w, 1 / h);
    PIPE.mat.uniforms.uFxaa.value = st.msaa ? 0 : 1;
    // sharpening: none at native resolution with MSAA, a touch with FXAA (it softens), more the further the upscale
    PIPE.mat.uniforms.uSharp.value = st.sc >= 0.999 ? (st.msaa ? 0 : 0.25) : U.clamp(0.35 + (1 - st.sc) * 1.2, 0, 1);
  }
  // draw one view into the offscreen target (rect in CSS pixels, null = the whole screen); the target is cleared on the first
  // view of the frame. Shadow maps, mirrors and the shadow cache render into their own targets and restore this one.
  function pipeDraw(cam, rect) {
    if (PIPE.direct) {
      renderer.setRenderTarget(null);
      if (rect) { const y = window.innerHeight - rect[1] - rect[3]; renderer.setViewport(rect[0], y, rect[2], rect[3]); renderer.setScissor(rect[0], y, rect[2], rect[3]); renderer.setScissorTest(true); }
      else { renderer.setViewport(0, 0, window.innerWidth, window.innerHeight); renderer.setScissorTest(false); }
      renderer.render(scene, cam); return;
    }
    if (!PIPE.rt) pipeSize(); if (PIPE.direct) { pipeDraw(cam, rect); return; } const rt = PIPE.rt, fx = PIPE.w / window.innerWidth, fy = PIPE.h / window.innerHeight;
    if (!PIPE.open) { renderer.setRenderTarget(rt); rt.viewport.set(0, 0, PIPE.w, PIPE.h); rt.scissorTest = false; renderer.setRenderTarget(rt); renderer.clear(); PIPE.open = true; }
    if (rect) {
      const x = Math.round(rect[0] * fx), y = Math.round((window.innerHeight - rect[1] - rect[3]) * fy), w = Math.round(rect[2] * fx), h = Math.round(rect[3] * fy);
      rt.viewport.set(x, y, w, h); rt.scissor.set(x, y, w, h); rt.scissorTest = true;
    } else { rt.viewport.set(0, 0, PIPE.w, PIPE.h); rt.scissorTest = false; }
    renderer.setRenderTarget(rt); renderer.render(scene, cam);
  }
  // resolve the frame onto the canvas (only when something was drawn into the target this frame)
  function pipeResolve() {
    if (!PIPE.open) return; PIPE.open = false;
    renderer.setRenderTarget(null); renderer.setScissorTest(false); renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.render(PIPE.scene, PIPE.cam);
  }
  // the readout's resolution line: preset, internal resolution (pixels) and anti-aliasing
  function perfRes() { return quality[0].toUpperCase() + quality.slice(1) + ' ' + (resPref === 'auto' ? 'auto ' : '') + PIPE.w + 'x' + PIPE.h + (PIPE.direct ? ' direct' : PIPE.msaa ? ' MSAA' : ' FXAA') + (PIPE.sc < 0.999 ? ' CAS' : ''); }
  function setRes(v) { if (RES_OPTS[v] == null) return; resPref = v; try { localStorage.setItem('ei-res', v); } catch (e) { } autoLv = 0; saveLv(); lockUpUntil = 0; ftEma = 16.7; if (renderer) onResize(); }
  function splitDir(w, h) { return splitPref === 'tb' || splitPref === 'sbs' ? splitPref : (w / h > 2.2 ? 'sbs' : 'tb'); }
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight; const n = cameras.length;
    // the canvas at the preset's pixel ratio; the 3D view's internal resolution is the render pipeline's (pipeSize)
    const want = tierPixelRatio(quality); if (renderer.getPixelRatio() !== want) renderer.setPixelRatio(want);
    renderer.setSize(w, h); pipeSize();
    const pr = renderer.getPixelRatio(), ipr = pr * PIPE.sc;
    if (composer) { if (composer.setPixelRatio) composer.setPixelRatio(ipr); composer.setSize(w, h); fxaaPass.material.uniforms.resolution.value.set(1 / (w * ipr), 1 / (h * ipr)); }
    const rects = layout(n, w, h);
    if (particles) particles.setViewportHeight(rects[0][3] * ipr);
    splitDirNow = n > 1 ? splitDir(w, h) : null;
    document.body.classList.toggle('split2', n > 1); document.body.classList.toggle('split-tb', splitDirNow === 'tb'); document.body.classList.toggle('split-sbs', splitDirNow === 'sbs');
    if (EI.HUD.setDivider) EI.HUD.setDivider(n > 1 ? (splitDirNow === 'tb' ? [0, rects[0][3], w, SPLIT_GAP] : [rects[0][2], 0, SPLIT_GAP, h]) : null);
    cameras.forEach((cam, k) => { const r = rects[k]; cam.aspect = r[2] / r[3]; cam.updateProjectionMatrix(); if (viewports[k]) viewports[k].setRect(r[0], r[1], r[2], r[3], n > 1 ? { dir: splitDirNow, k } : null); });
  }
  function layout(n, w, h) {
    if (n <= 1) return [[0, 0, w, h]];
    if (splitDir(w, h) === 'sbs') { const a = Math.floor((w - SPLIT_GAP) / 2); return [[0, 0, a, h], [a + SPLIT_GAP, 0, w - a - SPLIT_GAP, h]]; }
    const a = Math.floor((h - SPLIT_GAP) / 2); return [[0, 0, w, a], [0, a + SPLIT_GAP, w, h - a - SPLIT_GAP]];
  }

  // ------------------------------------------------------------------ cameras
  // ------------------------------------------------------------------ cameras
  // chase: spring-damped follow with yaw lag, lateral offset into the corner, roll with lateral g, speed FOV, surface shake
  // cockpit: head physics (lateral sway, brake dip, rpm vibration, look-to-apex), halo framing
  const _f = new THREE.Vector3(), _l = new THREE.Vector3(), _tgt = new THREE.Vector3(), _look = new THREE.Vector3(), _q = new THREE.Quaternion();
  function camState(cam) { const u = cam.userData; if (!u.cs) u.cs = { yaw: null, roll: 0, lat: 0, fov: 60, sway: 0, dip: 0, shake: 0, blend: 0 }; return u.cs; }
  function surfaceShake(car) { const v = Math.abs(car.v); const base = { asphalt: 0, runoff: 0.001 * v, kerb: 0.035 + 0.001 * v, grass: 0.05 + 0.002 * v, gravel: 0.07 + 0.002 * v }[car.surface] || 0; return base * Math.min(1, v / 8); }
  const TCAM = { x: -0.02, y: 1.16, p: -0.17 };   // T-camera lens (body metres: x forward, y up) and pitch
  const _mirLite = []; function mirrorLite() { _mirLite.length = 0; if (scenery && scenery.group) _mirLite.push(scenery.group); return _mirLite; }
  function placeCamera(cam, car, k, snap, dt) {
    const mode = CAM_MODES[camModes[k] || 0]; const cs = camState(cam);
    const v = Math.abs(car.v); const cx = car.vx != null ? car.vx : cx, cy = car.vy != null ? car.vy : cy, cz = car.vz != null ? car.vz : cz, ch = car.vh != null ? car.vh : ch; const fx = Math.cos(ch), fz = Math.sin(ch); const lx = fz, lz = -fx;
    const introing = race && !race.started && race.phase === 'grid' && race.players.length === 1 && k === 0 && !EI.debug.freeCam && introT < 6.7;
    if (introing) { introCamera(cam, car); return; }
    const sh = ((cameras.length > 1 ? shakeP[k] || 0 : shake) + surfaceShake(car)) * (mode === 'cockpit' ? 0.6 : 1); const tN = performance.now() * 0.001; const fN = car.surface === 'kerb' ? 26 : car.surface === 'grass' || car.surface === 'gravel' ? 9 : 2.5;
    const jx = sh * (0.6 * Math.sin(tN * fN * 6.283) + 0.4 * Math.sin(tN * fN * 12.1 + 1.3)) * 0.5, jy = sh * (0.6 * Math.sin(tN * fN * 6.283 + 2.1) + 0.4 * Math.sin(tN * fN * 11.3 + 0.4)) * 0.3, jz = sh * (0.5 * Math.sin(tN * fN * 6.283 + 4.0) + 0.5 * Math.sin(tN * fN * 13.7 + 2.2)) * 0.5;
    if (mode === 'cockpit') {
      // eye at the visor: halo blade dead centre, halo hoop across the upper third, wheel + gloves filling the bottom,
      // both front tyre tops and the mirrors at the edges. Head physics: g-force sway / brake dip, rpm buzz, look-to-apex.
      const glb = EI.CarGLB && EI.CarGLB.ready; const eyeX = EI.debug.eye ? EI.debug.eye.x : (glb ? 0.3 : 0.45), eyeY = EI.debug.eye ? EI.debug.eye.y : (glb ? 0.815 : 0.9);   // low in the tub as in the F1 games: the halo bar heavy across the top
      car._cockpitT = performance.now();
      const fov0 = EI.debug.ckFov || 55;   // ~84 deg across a 16:9 screen: the wheel fills the lower third as in the F1 games
      if (snap) { cs.sway = 0; cs.dip = 0; cs.apex = 0; cs.roll = 0; cs.fov = fov0 + 1; }
      const kSway = 1 - Math.exp(-dt * 5);
      cs.sway += (U.clamp(-car.aLat * 0.0009, -0.02, 0.02) - cs.sway) * kSway;           // head pushed to the outside of the corner
      cs.dip += (U.clamp(-car.aLong * 0.0008, -0.016, 0.028) - cs.dip) * kSway;          // forward under braking, back under power
      const vibA = (0.00025 + car.rpm * 0.0007) * (car.throttle > 0.3 ? 1 : 0.55); const vib = vibA * (Math.sin(tN * 6.283 * (24 + car.rpm * 11)) * 0.7 + Math.sin(tN * 6.283 * (37 + car.rpm * 17) + 1.1) * 0.3);
      const g = car.gradeNow || 0;
      // the eye sits in the CAR's frame (the body is pitched by the grade): a world-up offset slid it ~10 cm back / forward in the tub on a 12 % slope and the halo / wheel framing changed with the gradient
      const gn = 1 / Math.sqrt(1 + g * g), ex = eyeX + cs.dip, ey = eyeY - Math.abs(cs.dip) * 0.25 + vib;
      _tgt.set(cx + (fx * ex - fx * g * ey) * gn + lx * cs.sway, cy + (g * ex + ey) * gn, cz + (fz * ex - fz * g * ey) * gn + lz * cs.sway);
      cam.position.copy(_tgt);
      const apexT = U.clamp(car.steer * 0.2 + (car.yaw || 0) * 0.02, -0.14, 0.14);       // look towards the apex, up to ~8 degrees
      cs.apex = (cs.apex || 0) + (apexT - (cs.apex || 0)) * (snap ? 1 : 1 - Math.exp(-dt * 3.5)); const ap = cs.apex;
      const ca = Math.cos(ap), sa = Math.sin(ap); const dx = fx * ca + lx * sa, dz = fz * ca + lz * sa;
      const pitch = (cameras.length > 1 && cam.aspect > 1.6 ? -0.012 : -0.072) + g + jy * 0.012 + vib * 0.6;   // ~4 degrees nose-down so the wheel sits low in frame (level in a short split view: more road)
      _look.set(_tgt.x + dx * 30 + lx * jx * 0.25, _tgt.y + pitch * 30, _tgt.z + dz * 30 + lz * jz * 0.25);
      cam.up.set(0, 1, 0); cam.lookAt(_look);
      cs.roll += (U.clamp(-car.aLat * 0.0006, -0.015, 0.015) - cs.roll) * kSway; cam.rotateZ(cs.roll);
      cs.fov += ((fov0 + Math.min(v, 95) * 0.03 + (car.drsOpen ? 1 : 0)) - cs.fov) * (snap ? 1 : Math.min(1, dt * 3)); cam.fov = viewFov(cam, cs.fov, 6); cam.updateProjectionMatrix();
      cam.near = 0.04; cam.updateProjectionMatrix();
      // split screen: one low-res mirror render per frame at most, taking turns between the players
      // Low: a lite mirror (112 px target, scenery group hidden: road, barriers and the 8 nearest cars behind), one side every 2nd
      // frame (every 4th below 15 m/s: on the grid and in the pit lane the view behind hardly changes)
      const mir = car.screen && car.screen.userData.mirrors; if (mir && !EI.debug.noMirrors && (cameras.length < 2 || (frameNo & 1) === k)) { if (EI.Perf) EI.Perf.push('mirror'); mir.update(renderer, scene, cameras.length > 1 ? 2 : quality === 'high' ? 1 : quality === 'low' && v < 15 ? 4 : 2, quality === 'low' ? mirrorLite() : null); if (EI.Perf) EI.Perf.pop(); }
      return;
    }
    if (mode === 'tcam') {
      // T-camera: rigid on the airbox, just above the intake lip: the helmet top and the airbox edge at the bottom of the frame,
      // the halo hoop (its top-face branding) below the horizon, nose and both front tyres ahead. Only vibration, kerb shake and
      // a little roll with the car (it is bolted to the chassis, no head physics).
      if (snap) { cs.roll = 0; cs.fov = 64; }
      const vib = (0.0002 + car.rpm * 0.0005) * Math.sin(tN * 6.283 * (29 + car.rpm * 13)); const g = car.gradeNow || 0;
      const TC = EI.debug.tcam || TCAM; { const gn = 1 / Math.sqrt(1 + g * g), ty = TC.y + vib + jy * 0.01; _tgt.set(cx + (fx * TC.x - fx * g * ty) * gn, cy + (g * TC.x + ty) * gn, cz + (fz * TC.x - fz * g * ty) * gn); } cam.position.copy(_tgt);   // in the car's (pitched) frame   // the lens: over the front of the T-cam housing (x -0.125..0.025, top y 1.135)
      const pitch = (cameras.length > 1 && cam.aspect > 1.6 ? TC.p + 0.045 : TC.p) + g + jy * 0.01;
      _look.set(_tgt.x + fx * 30 + lx * jx * 0.15, _tgt.y + pitch * 30, _tgt.z + fz * 30 + lz * jx * 0.15); cam.up.set(0, 1, 0); cam.lookAt(_look);
      cs.roll += (U.clamp(-car.aLat * 0.0005, -0.012, 0.012) - cs.roll) * (snap ? 1 : 1 - Math.exp(-dt * 4)); cam.rotateZ(cs.roll);
      cs.fov += ((63 + Math.min(v, 95) * 0.035) - cs.fov) * (snap ? 1 : Math.min(1, dt * 3)); cam.fov = viewFov(cam, cs.fov, 6); cam.near = 0.04; cam.updateProjectionMatrix();
      const mir = car.screen && car.screen.userData.mirrors; if (mir && !EI.debug.noMirrors && (cameras.length < 2 || (frameNo & 1) === k)) { if (EI.Perf) EI.Perf.push('mirror'); mir.update(renderer, scene, cameras.length > 1 ? 2 : quality === 'high' ? 1 : quality === 'low' && v < 15 ? 4 : 2, quality === 'low' ? mirrorLite() : null); if (EI.Perf) EI.Perf.pop(); }
      return;
    }
    if (cam.near !== 0.25) { cam.near = 0.25; cam.updateProjectionMatrix(); }
    if (mode === 'tv') {
      const t = track; const seg = Math.floor(car.trk.s / 120); if (cam.userData.seg !== seg) { cam.userData.seg = seg; const i = t.idxAtS(seg * 120 + 80); const side = t.lineOff[i] > 0 ? -1 : 1; cam.userData.pos = new THREE.Vector3(t.x[i] + t.nx[i] * side * (t.halfWidth + 6), t.y[i] + 5, t.z[i] + t.nz[i] * side * (t.halfWidth + 6)); keepInside(cam.userData.pos); }
      cam.position.copy(cam.userData.pos); _look.set(cx, cy + 0.6, cz); cam.up.set(0, 1, 0); cam.lookAt(_look);
      const d = cam.position.distanceTo(_look); cam.fov = viewFov(cam, U.clamp(1800 / d, 18, 60)); cam.updateProjectionMatrix(); return;
    }
    // ---- chase
    // The camera is rigid to the car's (interpolated) position: only its orientation and distance are smoothed. Smoothing the
    // world position itself lagged metres behind at speed and the catch-up snapped it every frame, which read as the car jittering.
    const C = chaseRig(cam); const dist = C.d0 + v * C.dv, height = C.h0 + v * C.hv;
    if (cs.yaw == null || snap) { cs.yaw = ch; cs.dist = dist; cs.h = height; }
    const kYaw = 1 - Math.exp(-dt * (v > 5 ? 5.5 : 9)); cs.yaw += U.wrapAngle(ch - cs.yaw) * kYaw;   // the camera swings round behind the car with a lag
    const cfx = Math.cos(cs.yaw), cfz = Math.sin(cs.yaw), clx = cfz, clz = -cfx;
    const kD = 1 - Math.exp(-dt * 4); cs.dist += (dist - cs.dist) * kD; cs.h += (height - cs.h) * kD;
    cs.lat += (U.clamp(car.yaw * 0.6, -0.4, 0.4) - cs.lat) * (1 - Math.exp(-dt * 1.4));                   // drift towards the inside of the turn
    cam.position.set(cx - cfx * cs.dist - clx * cs.lat * 0.6, cy + cs.h, cz - cfz * cs.dist - clz * cs.lat * 0.6);
    if (cameras.length > 1) keepInsideBarriers(cam, cs, car, dt);
    const minY = track.y[car.trk.i] + 1.0; if (cam.position.y < minY) cam.position.y = minY;
    _look.set(cx + fx * C.look + lx * (cs.lat * 1.3 + jx * 4), cy + C.lookY + jy * 4, cz + fz * C.look + lz * (cs.lat * 1.3 + jz * 4));
    cam.up.set(0, 1, 0); cam.lookAt(_look);
    cs.roll += (U.clamp(-car.aLat * 0.0007, -0.02, 0.02) - cs.roll) * (1 - Math.exp(-dt * 3)); cam.rotateZ(cs.roll);
    const fovT = 54 + v * 0.11 + (car.ersActive ? 2 : 0) + (car.drsOpen ? 1.5 : 0); cs.fov += (fovT - cs.fov) * Math.min(1, dt * 3); cam.fov = viewFov(cam, cs.fov, C.hx); cam.updateProjectionMatrix();
  }
  // Split screen: the field of view is set from the horizontal angle. A single-player vertical FOV is turned into the horizontal
  // angle it gives on a 16:9 screen (chase ~84 deg at rest to ~98 at top speed, cockpit ~94-97) plus a little extra, then back
  // into the vertical FOV for this viewport's aspect, so a wide short view sees as much road as one player does.
  const D2R = Math.PI / 180;
  function viewFov(cam, vfov, extraH) {
    if (cameras.length < 2) return vfov;
    const hf = 2 * Math.atan(Math.tan(vfov * D2R / 2) * 16 / 9) + (extraH || 0) * D2R;
    return U.clamp(2 * Math.atan(Math.tan(hf / 2) / cam.aspect) / D2R, 22, 74);
  }
  // chase rig: single player as before; stacked split views are short and wide: the camera stays close (the car fills a
  // proper part of the frame, as in one player) and aims a little further down the road
  const RIG_1P = { d0: 5.7, dv: 0.011, h0: 2.05, hv: 0.004, look: 5.5, lookY: 0.6, hx: 0 };
  const RIG_WIDE = { d0: 6.3, dv: 0.010, h0: 1.95, hv: 0.0035, look: 6.5, lookY: 0.55, hx: 0 };
  // split screen: the longer chase rig could swing out past the barriers on tight street corners (Monaco) and look through the
  // debris-fence posts. Keep the camera 1.2 m inside the wall line of the nearest track point: pushed straight back in along the
  // track normal and lifted a little, the push applied at once and eased off over ~0.3 s so it never jitters.
  function keepInsideBarriers(cam, cs, car, dt) {
    const t = track; if (!t.wallL || !t.wallR || EI.debug.noCamClamp) return;
    // project from the car's own track position (the camera is a few metres behind it): a remembered index goes stale after a
    // hitch or a jump and can lock onto a neighbouring stretch of a street circuit, which would shove the camera into the city
    const p = t.project(cam.position.x, cam.position.z, car.trk.i, cs.tp || (cs.tp = {}));
    let di = Math.abs(p.i - car.trk.i); di = Math.min(di, t.n - di); if (di * t.ds > 40) { cs.push = 0; return; }
    const lim = (p.lat < 0 ? t.wallL[p.i] : t.wallR[p.i]) - 1.2; const ex = U.clamp(Math.abs(p.lat) - lim, 0, 4);
    const prev = cs.push || 0; cs.push = ex >= prev ? ex : prev + (ex - prev) * (1 - Math.exp(-dt * 3.5)); cs.pushSide = ex > 0 ? (p.lat < 0 ? -1 : 1) : (cs.pushSide || 1);
    if (cs.push < 0.001) return;
    const sg = cs.pushSide; cam.position.x -= t.nx[p.i] * sg * cs.push; cam.position.z -= t.nz[p.i] * sg * cs.push; cam.position.y += Math.min(cs.push * 0.35, 1.5);
  }
  function chaseRig(cam) { return cameras.length > 1 && cam.aspect > 1.6 ? RIG_WIDE : RIG_1P; }
  // pre-race cinematic: a slow dolly down the grid, then an orbit around the player's car, then cut to the player camera
  let introT = 0, introLen = 8.2;
  // a TV camera never stands in the crowd or behind the debris fence: projected onto the circuit, it is pulled back to 1.2 m inside
  // the barrier line on its side (track.wallL / wallR) and rises by part of that distance so it still looks over the cars
  const _pj = { i: -1, s: 0, lat: 0, along: 0, dist: 0 };
  function keepInside(p) {
    const t = track; t.project(p.x, p.z, -1, _pj); const i = _pj.i, lat = _pj.lat; if (!t.wallL || !t.wallR) return;
    const over = Math.abs(lat) - ((lat < 0 ? t.wallL[i] : t.wallR[i]) - 1.2); if (!(over > 0)) return;
    const k = Math.sign(lat) * over; p.x -= t.nx[i] * k; p.z -= t.nz[i] * k; p.y += Math.min(over, 6) * 0.35;
  }
  function introCamera(cam, car) {
    const t = track, g0 = t.gridSlot(0); const n = race.cars.length; const gl = t.gridSlot(n - 1);
    const i0 = g0.i; const fx = t.tx[i0], fz = t.tz[i0], nx = t.nx[i0], nz = t.nz[i0];
    if (introT < 4.0) {
      const u = U.smoothstep(0, 4.0, introT);
      const sx = U.lerp(gl.x, g0.x, u), sz = U.lerp(gl.z, g0.z, u);
      cam.position.set(sx - fx * 6 + nx * 9, t.y[i0] + 4.5 - u * 1.5, sz - fz * 6 + nz * 9); keepInside(cam.position);
      _look.set(sx + fx * 10, t.y[i0] + 0.8, sz + fz * 10); cam.up.set(0, 1, 0); cam.lookAt(_look); cam.fov = 48; cam.updateProjectionMatrix();
    } else {
      const a = (introT - 4.0) * 0.6 + 2.4; const r = 5.2;
      cam.position.set(car.x + Math.cos(a) * r, car.y + 1.3, car.z + Math.sin(a) * r); keepInside(cam.position);
      _look.set(car.x, car.y + 0.55, car.z); cam.up.set(0, 1, 0); cam.lookAt(_look); cam.fov = 40; cam.updateProjectionMatrix();
    }
  }
  // live steering-wheel display for the player's car, redrawn at the HUD rate (uploads capped at ~15 Hz by carglb.js).
  // 2026 layout (512 x 320 canvas): shift-light LED row on top; status row (delta to best, position, lap); battery gauge (state of
  // charge, harvesting / deploying) on the left, the gear big in the centre with the energy state under it, speed + RPM gauge on the
  // right, tyre carcass temperatures beside the gear; bottom bar: OVERTAKE (2026 manual override) and the Straight Mode lamp.
  const WS = { F: '"Titillium Web", Arial, sans-serif' };
  function drawWheelScreen(car, delta) {
    if (!car.screen || !car.screenTex || !car._cockpitT || performance.now() - car._cockpitT > 400) return;
    const c = car.screen.userData.canvas, ctx = c.getContext('2d'), W = c.width, H = c.height, F = WS.F;
    const now = performance.now(); const dtS = U.clamp((now - (car._wsT || now)) / 1000, 0, 0.5); car._wsT = now;
    ctx.save(); ctx.scale(W / 512, H / 320);
    // tyre carcass temperatures (FL, FR, RL, RR): load, braking, wheelspin and cornering side
    if (!car._tt) car._tt = [82, 82, 84, 84];
    const v = Math.abs(car.v), latL = Math.max(0, -car.aLat), latR = Math.max(0, car.aLat), surf = car.surface === 'grass' || car.surface === 'gravel' ? -6 : car.surface === 'kerb' ? 3 : 0;
    for (let i = 0; i < 4; i++) {
      const front = i < 2, right = i % 2 === 1;
      const tgt = 84 + v * 0.11 + (car.wear || 0) * 14 + surf + (front ? car.brake * 16 + Math.abs(car.steer) * 9 : car.throttle * car.rpm * 9) + (right ? latL : latR) * 0.55;
      car._tt[i] += (tgt - car._tt[i]) * (1 - Math.exp(-dtS / 2.5));
    }
    const tCol = (t) => t < 80 ? '#2f7bff' : t < 90 ? '#1fc9c2' : t < 104 ? '#21d06a' : t < 112 ? '#ffc400' : '#ff2a1c';
    const txt = (t, x, y, size, col, al, wgt, it) => { ctx.font = (it ? 'italic ' : '') + (wgt || 700) + ' ' + size + 'px ' + F; ctx.fillStyle = col; ctx.textAlign = al || 'left'; ctx.fillText(t, x, y); };
    ctx.textBaseline = 'alphabetic'; ctx.lineCap = 'butt';
    // ---- energy state: deploying (boost), harvesting (braking / lift-off), overtake (extra energy this lap)
    const otE = car.otEnergy || 0, otOn = otE > 0.005, otLive = otOn && car.ersActive, otNext = !!car.otNext && !otOn;
    const harvest = !car.ersActive && car.ers < 0.999 && (car.brake > 0.05 || car.throttle < 0.2) && v > 3;
    const eState = otLive ? 'OVERTAKE' : car.ersActive ? 'DEPLOY' : harvest ? 'HARVEST' : 'BALANCED';
    const eCol = otLive ? '#ff3fd0' : car.ersActive ? '#ff8a1f' : harvest ? '#2fd6ff' : '#8a95a8';
    // ---- shift lights: 5 green, 5 red, 5 blue; the whole row flashes blue at the limiter
    ctx.fillStyle = '#020203'; ctx.fillRect(0, 0, 512, 320);
    const n = 15, sp = 468 / (n - 1); const lit = Math.round(U.clamp((car.rpm - 0.42) / 0.55, 0, 1) * n); const limiter = car.rpm > 0.97 && car.gear > 0 && car.gear < 8; const blink = limiter && Math.floor(now / 70) % 2 === 0;
    for (let i = 0; i < n; i++) {
      const on = limiter ? blink : i < lit; const col = i < 5 ? ['#2bff78', '#0b2a16'] : i < 10 ? ['#ff2d2d', '#2e0c0c'] : ['#4a8dff', '#0e1a38'];
      const x = 22 + i * sp; ctx.beginPath(); ctx.arc(x, 18, 11, 0, 6.283); ctx.fillStyle = '#000'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, 18, 8.5, 0, 6.283); ctx.fillStyle = on ? (limiter ? '#4a8dff' : col[0]) : col[1]; ctx.fill();
      if (on) { ctx.beginPath(); ctx.arc(x - 2.5, 15.5, 3, 0, 6.283); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill(); }
    }
    // ---- display glass
    const Y0 = 38; ctx.fillStyle = '#05070b'; ctx.fillRect(2, Y0, 508, 280); ctx.strokeStyle = '#1b2230'; ctx.lineWidth = 2; ctx.strokeRect(3, Y0 + 1, 506, 278);
    // ---- status row: delta | position | lap
    const cell = (x, w, lab, val, col, vs) => { ctx.fillStyle = '#0d121a'; ctx.fillRect(x, Y0 + 6, w, 40); txt(lab, x + 6, Y0 + 19, 12, '#7f8a9c', 'left', 700); txt(val, x + w - 7, Y0 + 41, vs || 26, col, 'right', 900); };
    const dTxt = delta == null ? '--.---' : (delta >= 0 ? '+' : '−') + Math.min(99.999, Math.abs(delta)).toFixed(3);
    const dCol = delta == null ? '#9aa3b2' : delta < 0 ? '#2bff78' : '#ff4a3a';
    const nCars = race ? race.cars.length : 22, laps = race ? race.laps : 0;
    cell(8, 176, 'DELTA', dTxt, dCol, 28); cell(190, 132, 'POS', 'P' + (car.pos || '-') + (race ? '/' + nCars : ''), '#ffffff', 24); cell(328, 176, 'LAP', Math.max(1, Math.min(car.lap || 1, laps || 99)) + (laps ? '/' + laps : ''), '#ffffff', 26);
    // ---- battery gauge (left): state of charge ring, 270 degrees, coloured by the energy state
    const ring = (cx, cy, r, f, col, segs) => {
      const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25; ctx.lineWidth = 13; ctx.strokeStyle = '#141a24'; ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
      if (f > 0.003) { ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(cx, cy, r, a0, a0 + (a1 - a0) * U.clamp(f, 0, 1)); ctx.stroke(); }
      ctx.strokeStyle = '#05070b'; ctx.lineWidth = 2.5; for (let i = 1; i < segs; i++) { const a = a0 + (a1 - a0) * i / segs; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8)); ctx.lineTo(cx + Math.cos(a) * (r + 8), cy + Math.sin(a) * (r + 8)); ctx.stroke(); }
    };
    const soc = U.clamp(car.ers, 0, 1); const gy = Y0 + 140;
    ring(84, gy, 58, soc, otLive ? '#ff3fd0' : car.ersActive ? '#ff8a1f' : soc < 0.2 ? '#ff4a3a' : '#c6ff1f', 20);
    txt('BATT', 84, gy - 16, 14, '#9aa3b2', 'center', 700); txt(Math.round(soc * 100) + '%', 84, gy + 16, 32, '#ffffff', 'center', 900);
    ctx.fillStyle = eCol; ctx.font = '900 13px ' + F; ctx.textAlign = 'center'; ctx.fillText(eState, 84, gy + 44);
    // ---- speed + RPM gauge (right): rpm ring green -> red -> blue
    const rpmN = U.clamp(car.rpm, 0, 1); const rCol = limiter ? '#4a8dff' : rpmN > 0.85 ? '#ff2d2d' : rpmN > 0.6 ? '#ffc400' : '#2bff78';
    ring(428, gy, 58, rpmN, rCol, 15);
    txt('KPH', 428, gy - 18, 13, '#9aa3b2', 'center', 700); txt(String(Math.round(car.speedKmh)), 428, gy + 14, 34, '#ffffff', 'center', 900);
    txt(String(Math.round(4000 + rpmN * 11000)), 428, gy + 36, 15, '#c9d1dc', 'center', 700); txt('RPM', 428, gy + 50, 10, '#7f8a9c', 'center', 700);
    // ---- gear, framed by the shift colour, the energy state under it
    const gear = car.gear === 0 ? 'N' : car.v < -0.5 ? 'R' : String(car.gear);
    const fCol = limiter ? '#4a8dff' : car.rpm > 0.85 ? '#ff2d2d' : car.rpm > 0.6 ? '#2bff78' : '#263040';
    ctx.strokeStyle = fCol; ctx.lineWidth = 4; ctx.strokeRect(198, Y0 + 56, 116, 146);
    txt(gear, 256, Y0 + 182, 148, car.gear === 0 ? '#ffc400' : '#ffffff', 'center', 900);
    // tyre carcass temperatures beside the gear (FL / RL left, FR / RR right)
    for (let i = 0; i < 4; i++) {
      const x = i % 2 ? 322 : 152, y = Y0 + 60 + (i < 2 ? 0 : 74), t = car._tt[i];
      const tc = tCol(t), wl = U.clamp(1 - (car.wear || 0), 0, 1); ctx.fillStyle = '#0d121a'; ctx.fillRect(x, y, 38, 64); ctx.fillStyle = tc; ctx.fillRect(x, y + 64 - 60 * wl, 5, 60 * wl);   // bar = tyre life left
      txt(String(Math.round(t)), x + 22, y + 30, 18, tc, 'center', 900); txt(['FL', 'FR', 'RL', 'RR'][i], x + 22, y + 52, 11, '#7f8a9c', 'center', 700);
    }
    // ---- bottom bar: OVERTAKE (manual override) + Straight Mode
    const by = Y0 + 214, bh = 56;
    const blinkOT = Math.floor(now / 160) % 2 === 0;
    ctx.fillStyle = otLive ? (blinkOT ? '#ff3fd0' : '#b0208f') : otOn ? '#1f7a3e' : '#0d121a'; ctx.fillRect(8, by, 362, bh);
    if (otOn) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(14, by + bh - 12, 350, 7); ctx.fillStyle = otLive ? '#ffffff' : '#2bff78'; ctx.fillRect(14, by + bh - 12, 350 * U.clamp(otE / 0.5, 0, 1), 7); }
    txt('OVERTAKE', 22, by + 34, 30, otOn ? '#ffffff' : otNext ? '#2bff78' : '#3e4756', 'left', 900, true);
    txt(otLive ? 'ACTIVE' : otOn ? 'READY' : otNext ? 'NEXT LAP' : 'OFF', 360, by + 33, 18, otOn ? '#ffffff' : otNext ? '#2bff78' : '#3e4756', 'right', 900);
    // Straight Mode (2026 active aero, the old DRS box): enabled = green outline that blinks, open = solid green
    const smOpen = !!car.drsOpen, smArm = !!car.drsEligible && !smOpen; const sx = 378, sw = 126;
    ctx.fillStyle = smOpen ? '#2bff78' : '#0d121a'; ctx.fillRect(sx, by, sw, bh);
    if (smArm && Math.floor(now / 250) % 2 === 0) { ctx.strokeStyle = '#2bff78'; ctx.lineWidth = 4; ctx.strokeRect(sx + 2, by + 2, sw - 4, bh - 4); }
    txt('STRAIGHT', sx + sw / 2, by + 24, 15, smOpen ? '#04210f' : smArm ? '#2bff78' : '#3e4756', 'center', 900); txt('MODE', sx + sw / 2, by + 46, 22, smOpen ? '#04210f' : smArm ? '#2bff78' : '#3e4756', 'center', 900);
    ctx.restore();
    car.screenTex.needsUpdate = true;
  }
  function menuCamera(t) {
    const cam = cameras[0]; const i = track.idxAtS((t * 18) % track.length); const fx = track.tx[i], fz = track.tz[i];
    cam.position.set(track.x[i] - fx * 30 + track.nx[i] * 14, track.y[i] + 16, track.z[i] - fz * 30 + track.nz[i] * 14);
    cam.lookAt(track.x[i] + fx * 40, track.y[i] + 1, track.z[i] + fz * 40); cam.fov = 55; cam.updateProjectionMatrix();
  }
  // name tags above nearby cars, projected into the viewport
  function updateTags(k, cam, vp) {
    const car = race.players[k]; const list = []; const w = vp.w, h = vp.h; const split = cameras.length > 1; const maxD = split ? 60 : 90;
    for (const o of race.cars) {
      if (o === car) continue; const dx = o.x - car.x, dz = o.z - car.z; const d = Math.hypot(dx, dz); if (d > maxD) continue;
      tmp3.set(o.x, o.y + 1.4, o.z); tmp3.project(cam); if (tmp3.z > 1 || Math.abs(tmp3.x) > 1.1 || Math.abs(tmp3.y) > 1.1 || (cameras.length > 1 && tmp3.y < -0.8)) continue;   // split: no tags cut off at the bottom edge
      list.push({ x: (tmp3.x + 1) / 2 * w, y: (1 - tmp3.y) / 2 * h, pos: o.pos, color: o.team.primary, text: o.isPlayer ? o.name : o.driver.name.split(' ').pop().toUpperCase(), alpha: U.clamp(1.3 - d / maxD, 0.2, 1) });
    }
    if (split && list.length > 3) { list.sort((a, b) => b.alpha - a.alpha); list.length = 3; }
    vp.updateTags(list);
  }

  // ------------------------------------------------------------------ main loop
  function loop(now) {
    requestAnimationFrame(loop); frameNo++; if (renderer) renderer.info.reset();   // info counts the whole frame (views, shadows, mirrors, resolve)
    const gl2 = renderer && renderer.capabilities.isWebGL2 ? renderer.getContext() : null; if (race) pollFences(gl2);
    now = performance.now(); const rawMs = now - lastT; let dt = U.clamp(rawMs / 1000, 0, MAX_FRAME); lastT = now; adaptResolution(rawMs, dt); frameT0 = now; pumpMs = 0; const PF = EI.Perf; if (PF) PF.begin(now);   // never negative: a rAF timestamp can precede a lastT stamped in an input handler
    if (!race) {
      if (!loaded) return;   // nothing to draw behind the loading screen: the car model loads and parses sooner
      menuCamera(now / 1000); scenery.update(dt, cameras[0].position.x, cameras[0].position.z);
      renderer.setScissorTest(false); renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);   // CSS pixels: three scales by the pixel ratio itself
      sunFollow(cameras[0].position.x, cameras[0].position.z); particles.update(dt); if (EI.Night && EI.Night.on) EI.Night.frame(dt, now / 1000); renderView(cameras[0], true, null); pipeResolve(); if (PF) PF.end(renderer, perfRes); return;
    }
    if (EI.Replay && EI.Replay.playing) { if (EI.Night && EI.Night.on) EI.Night.frame(dt, now / 1000); hlFrame(dt, gl2); if (PF) PF.end(renderer, perfRes); return; }   // the highlights reel
    if (paused) dt = 0;
    if (EI.Night && EI.Night.on) EI.Night.frame(dt, now / 1000);
    // input is sampled here, right before the physics steps that use it
    const single = race.players.length === 1; const inputs = race.players.map((c, k) => EI.Input.read(k, single)); if (PF) { PF.inputRead(); PF.to('sim'); }
    // gamepad camera (Y) and pause (Start) buttons, on the press
    race.players.forEach((c, k) => { const i = inputs[k]; if (i.cam && !c._camBtn) cycleCam(k); c._camBtn = i.cam; if (i.pause && !c._padPause && !resultsShown) setPaused(!paused); c._padPause = i.pause; });
    // two players: a player who has taken the flag is driven round the cool-down lap while the other one is still racing
    race.players.forEach((c, k) => { const ap = autopilots[k]; if (ap) { inputs[k] = ap.inp; c.input = ap.inp; } });
    // fixed 120 Hz steps; up to 12 per frame (100 ms) so the race keeps real time down to 10 fps instead of slowing down
    acc += dt; let steps = 0; while (acc >= DT && steps < MAX_STEPS) { for (const c of race.cars) c.savePose(); for (const ap of autopilots) if (ap && race.started) ap.ai.coolDown(); race.update(DT, inputs); acc -= DT; steps++; } if (steps === MAX_STEPS) acc = Math.min(acc, DT);
    if (EI.Pit) EI.Pit.frame(race, dt); if (PF) PF.to('cars');
    const alpha = U.clamp(acc / DT, 0, 1); for (const c of race.cars) presentCar(c, alpha);
    updateCarLod();
    const wasIntro = introT < 6.7; introT += dt; if (wasIntro && introT >= 6.7 && race.players.length === 1) { placeCamera(cameras[0], race.players[0], 0, true, 0); shake = 0.25; }
    if (!race.started && race.phase === 'grid' && introT >= introLen) { race.startLights(); $('lights').classList.remove('hidden'); EI.HUD.setLights(0); race.players.forEach((car, k) => placeCamera(cameras[k], car, k, true, 0)); }
    if (PF) PF.to('hud'); handleEvents(); if (PF) PF.to('cars'); for (const c of race.cars) { c.updateVisual(dt); if (dt > 0) particles.fromCar(c, dt); } particles.update(dt); shake = Math.max(0, shake - dt * 3); for (let k = 0; k < shakeP.length; k++) shakeP[k] = Math.max(0, (shakeP[k] || 0) - dt * 3); hudT += dt;
    // HUD at 20 Hz; with two players the two panels take turns (one DOM update per frame, never both in the same frame)
    const hudDue = hudT > 0.05 / race.players.length; const hudK = hudDue ? (hudTurn++) % race.players.length : -1;
    if (PF) PF.to('cam'); race.players.forEach((car, k) => { if (k === 0 && EI.debug.freeCam) { const f = EI.debug.freeCam; cameras[0].position.set(f.pos[0], f.pos[1], f.pos[2]); cameras[0].lookAt(f.look[0], f.look[1], f.look[2]); cameras[0].fov = f.fov || 50; cameras[0].updateProjectionMatrix(); } else placeCamera(cameras[k], car, k, false, dt); if (k === hudK) { if (PF) PF.push('hud'); viewports[k].update(race, 0.05); updateTags(k, cameras[k], viewports[k]); drawWheelScreen(car, race.deltaBest(car)); if (PF) PF.pop(); } if (engines[k]) { const idleBlip = !race.started ? (Math.sin(performance.now() * 0.004 + k) > 0.6 ? 0.5 : 0.08) : 0; EI.Audio.setEngine(engines[k], race.started ? car.rpm : 0.15 + idleBlip * 0.8, race.started ? car.throttle : idleBlip, paused ? 0 : (CAM_MODES[camModes[k]] === 'cockpit' ? 1.3 : 1), car.gear); } });
    if (hudDue) hudT = 0; if (PF) PF.to('hud');
    for (const vp of viewports) if (vp.keyChip) { const on = !race.started || race.time < 4; if (on !== vp.keyChipOn) { vp.keyChipOn = on; vp.keyChip.classList.toggle('show', on); } }
    if (race.over && !resultsShown && race.classified) { resultsShown = true; EI.HUD.showResults(race); if (race.players.length > 1) markResultPlayers(); if (EI.Replay) EI.Replay.onResults(race); }
    const split = cameras.length > 1; if (PF) PF.to('scenery');
    if (!split) {
      if (splitShadow) { renderer.shadowMap.autoUpdate = splitShadow.auto; splitShadow = null; }
      scenery.update(dt, race.players[0].x, race.players[0].z);
      if (skyMesh) skyMesh.position.set(cameras[0].position.x, 0, cameras[0].position.z);   // the sky box follows the eye (TV / free cameras can be far from the car)
    } else {
      // Two views, one shadow pass per frame when the cars are close: the sun's shadow box is centred between them (it covers
      // both). Apart, each view gets its own shadow pass (the static part comes from the shadow cache). The scenery level of
      // detail is gathered once a frame for both eyes (the union of the two rings, tighter radii in two-player, see
      // applySplitTier); before each view only its fade centre moves (setEye, uniforms only).
      if (!splitShadow) splitShadow = { auto: renderer.shadowMap.autoUpdate };
      renderer.shadowMap.autoUpdate = false;
      const a = race.players[0], b = race.players[1]; const shareR = (sun.shadow.camera.right || 70) * 0.7;
      sharedEye = Math.hypot(a.x - b.x, a.z - b.z) < shareR ? [(a.x + b.x) / 2, (a.z + b.z) / 2] : null;
      if (scenery.setEye) scenery.update(dt, a.x, a.z, b.x, b.z); else if (sharedEye) scenery.update(dt, sharedEye[0], sharedEye[1]);
    }
    const rects = layout(cameras.length, window.innerWidth, window.innerHeight); if (PF) PF.to('draw');
    // the composer path (High, one view) draws to the whole canvas; the pipeline places each view in its target by rect
    renderer.setScissorTest(false); renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    cameras.forEach((cam, k) => {
      const r = rects[k];
      const car = race.players[k];
      if (!split) sunFollow(car.x, car.z);
      else {
        if (sharedEye) { if (k === 0) { sunFollow(sharedEye[0], sharedEye[1]); renderer.shadowMap.needsUpdate = true; } }
        else { if (!scenery.setEye) scenery.update(k === 0 ? dt : 0, car.x, car.z); sunFollow(car.x, car.z); renderer.shadowMap.needsUpdate = true; }
        if (scenery.setEye) scenery.setEye(car.x, car.z);
        if (skyMesh) skyMesh.position.set(cam.position.x, 0, cam.position.z);
      }
      const cockpit = CAM_MODES[camModes[k]] === 'cockpit'; if (cockpit) car.helmet.visible = false;
      tunnelLight(k, car, k === 0 ? dt : dtT); renderView(cam, !split, split ? r : null); if (cockpit) car.helmet.visible = true;
    });
    if (PF) PF.to('post'); pipeResolve(); pushFence(gl2); cpuEma += (performance.now() - frameT0 - pumpMs - cpuEma) * 0.1; if (PF) PF.end(renderer, perfRes);
  }
  // catch-up cap: at most 6 physics steps (50 ms of race time) per frame. A long frame (a hitch, a slow machine below 20 fps) then slows the
  // race down for a moment instead of piling up to 12 steps (~15-25 ms of CPU with 22 cars) on the NEXT frame, which made that one long
  // too - the spiral that turned a stutter into seconds of low frame rate (PERF)
  const MAX_FRAME = 0.05, MAX_STEPS = 6;
  // Cars are drawn where the last physics step is heading, a fraction of a step ahead (extrapolated from the last two steps),
  // instead of blended between the last two steps: the same smooth motion at any refresh rate, one 120 Hz step (8.3 ms) less
  // between a key press and the screen. A jump of more than 5 m between steps (a reset, the pit lane) is drawn as it is.
  function presentCar(c, a) {
    if (c._px == null) { c.blend(1); return; }
    const dx = c.x - c._px, dz = c.z - c._pz; if (dx * dx + dz * dz > 25) { c.blend(1); return; }
    c.vx = c.x + dx * a; c.vy = c.y + (c.y - c._py) * a; c.vz = c.z + dz * a; c.vh = c.heading + U.wrapAngle(c.heading - c._ph) * a;
  }
  // GPU frames in flight (WebGL2 fences): when the GPU falls behind, the browser queues finished frames and every queued frame
  // adds a refresh of input lag without the frame interval showing it. A fence after each frame; the number still pending at
  // the start of the next frame feeds the Auto resolution, which steps down before the queue grows.
  const FENCES = []; let gpuQ = 0;
  function pollFences(gl) {
    if (!gl || !gl.fenceSync) return; let pending = 0;
    for (let i = FENCES.length - 1; i >= 0; i--) { const f = FENCES[i]; if (gl.getSyncParameter(f, gl.SYNC_STATUS) === gl.SIGNALED) { gl.deleteSync(f); FENCES.splice(i, 1); } else pending++; }
    gpuQ += (pending - gpuQ) * 0.1;
    while (FENCES.length > 4) gl.deleteSync(FENCES.shift());
  }
  function pushFence(gl) { if (gl && gl.fenceSync) { const f = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); if (f) FENCES.push(f); } }
  let frameNo = 0, hudTurn = 0, splitShadow = null, sharedEye = null, autopilots = [], shakeP = [0, 0];
  // the sun's shadow box follows (x, z) in steps of ~10 m snapped in light space (whole shadow-map texels), so static shadows never
  // swim and the cached static shadow (below) stays valid until the box moves
  const _sR = new THREE.Vector3(), _sU = new THREE.Vector3(), _sC = new THREE.Vector3();
  function sunFollow(x, z) {
    const d = this_sunDir; const sc = sun.shadow.camera; const texel = (sc.right - sc.left) / sun.shadow.mapSize.x; const S = texel * Math.max(1, Math.round((quality === 'low' ? 20 : 10) / texel));   // the cached static shadow is re-rendered each time the box snaps on: every 20 m on Low (half as often at speed), 10 m otherwise
    _sR.set(0, 1, 0).cross(d).normalize(); _sU.crossVectors(d, _sR);
    const r = Math.round((x * _sR.x + z * _sR.z) / S), u = Math.round((x * _sU.x + z * _sU.z) / S), w = Math.round((x * d.x + z * d.z) / S);
    _sC.set(0, 0, 0).addScaledVector(_sR, r * S).addScaledVector(_sU, u * S).addScaledVector(d, w * S);
    sun.position.copy(_sC).addScaledVector(d, 160); sun.target.position.copy(_sC); sun.target.updateMatrixWorld();
    SHC.key = r + ',' + u + ',' + w + ',' + sun.shadow.mapSize.x + ',' + sc.right;
  }
  // ------------------------------------------------------------------ cached sun shadow
  // Static casters (city, stands, barriers, trees ...) are drawn into the shadow map only when the shadow box moves (every ~10 m)
  // or every 180 frames, and kept in a cache texture. Every other frame the map is rebuilt from that cache (one full-screen pass
  // that writes the cached depth with gl_FragDepth) plus the cars, each drawn through a single proxy mesh within 60 m. Two cache
  // slots, so split-screen views do not evict each other. EI.debug.shadowCache = false draws the whole scene every frame.
  const SHC = { on: true, key: '', slots: [], movers: [], dyn: new THREE.Object3D(), maxAge: 180, statics: 0, quad: null, geo: null, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
  function installShadowCache() {
    const sm = renderer.shadowMap, orig = sm.render;
    const vs = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    const copy = new THREE.ShaderMaterial({ uniforms: { tMap: { value: null } }, vertexShader: vs, fragmentShader: 'uniform sampler2D tMap; varying vec2 vUv; void main() { gl_FragColor = texture2D(tMap, vUv); }', depthTest: false, depthWrite: false, blending: THREE.NoBlending });
    const comp = new THREE.ShaderMaterial({ uniforms: { tMap: { value: null } }, vertexShader: vs, extensions: { fragDepth: true }, depthTest: true, depthWrite: true, depthFunc: THREE.LessEqualDepth, blending: THREE.NoBlending,
      fragmentShader: '#include <packing>\nuniform sampler2D tMap; varying vec2 vUv; void main() { vec4 c = texture2D(tMap, vUv); gl_FragDepthEXT = unpackRGBAToDepth(c); gl_FragColor = c; }' });
    SHC.geo = new THREE.PlaneGeometry(2, 2); SHC.quad = new THREE.Mesh(SHC.geo, copy); SHC.quad.frustumCulled = false; const quadScene = new THREE.Scene(); quadScene.add(SHC.quad);
    // a full-screen pass through a nested render (it uploads the quad's buffers and binds the program state); no clear, so the
    // composite keeps the cars' depth already in the map
    const blit = (mat, tex, target) => { mat.uniforms.tMap.value = tex; SHC.quad.material = mat; renderer.setRenderTarget(target); const ac = renderer.autoClear; renderer.autoClear = false; renderer.render(quadScene, SHC.cam); renderer.autoClear = ac; };
    sm.render = function (lights, sc, camera) {
      if (!SHC.on || EI.debug.shadowCache === false || !race || lights.length !== 1 || this.enabled === false || (this.autoUpdate === false && this.needsUpdate === false) || this.type === THREE.VSMShadowMap) return orig.call(this, lights, sc, camera);
      const shadow = lights[0].shadow; const prev = renderer.getRenderTarget(), pf = renderer.getActiveCubeFace(), pm = renderer.getActiveMipmapLevel(); const now = performance.now();
      let slot = null; for (const s of SHC.slots) if (s.key === SHC.key) slot = s;
      if (!slot || !slot.valid || frameNo - slot.f > SHC.maxAge || !shadow.map || slot.rt.width !== shadow.map.width) {
        // static pass: the whole scene with the cars hidden, then copied into the slot's cache texture
        const hidden = []; for (const c of race.cars) if (c.group.visible) { c.group.visible = false; hidden.push(c.group); }
        for (const m of SHC.movers) if (m.o.visible) { m.o.visible = false; hidden.push(m.o); }
        orig.call(this, lights, sc, camera); for (const g of hidden) g.visible = true;
        if (!slot) { if (SHC.slots.length < 2) SHC.slots.push(slot = {}); else slot = SHC.slots[0].used < SHC.slots[1].used ? SHC.slots[0] : SHC.slots[1]; }
        if (!slot.rt || slot.rt.width !== shadow.map.width) { if (slot.rt) slot.rt.dispose(); slot.rt = new THREE.WebGLRenderTarget(shadow.map.width, shadow.map.height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false }); }
        blit(copy, shadow.map.texture, slot.rt); slot.key = SHC.key; slot.valid = true; slot.f = frameNo; SHC.statics++;
      }
      slot.used = now;
      // dynamic pass: the cars (orig clears the map first), then the cached static depth on top, depth-tested against them
      const dyn = SHC.dyn.children; dyn.length = 0;
      for (const c of race.cars) { if (!c.shadowOn || !c.group.visible) continue; const p = c.shadowProxy; if (p) { p.matrixWorld.copy(c.group.matrixWorld); dyn.push(p); } else dyn.push(c.group); }
      for (const m of SHC.movers) if (m.o.visible && m.box.containsPoint(sun.target.position)) dyn.push(m.o);
      this.needsUpdate = true; orig.call(this, lights, SHC.dyn, camera);
      blit(comp, slot.rt.texture, shadow.map); renderer.setRenderTarget(prev, pf, pm); this.needsUpdate = false;
    };
  }
  function invalidateShadowCache() { for (const s of SHC.slots) s.valid = false; }
  // animated casters (the pit crews, wheel guns and jacks, or anything with userData.shadowMover): drawn with the cars every frame,
  // and only while the shadow box is near them
  function collectShadowMovers() {
    SHC.movers = [];
    scene.traverse((o) => { if (o.castShadow && (o.userData.shadowMover || (o.isInstancedMesh && /^pit-/.test(o.name || '') && o.instanceMatrix.usage === THREE.DynamicDrawUsage))) { const box = new THREE.Box3(); if (o.parent && o.parent !== scene) box.setFromObject(o.parent); if (box.isEmpty()) box.set(new THREE.Vector3(-1e5, -1e5, -1e5), new THREE.Vector3(1e5, 1e5, 1e5)); box.expandByScalar(90); SHC.movers.push({ o, box }); } });
  }

  // ------------------------------------------------------------------ post-race highlights (js/replay.js)
  // The reel takes over the screen with one full-screen camera (one and two players); the race is frozen meanwhile (no physics
  // steps) and replay.js poses the cars through car.updateVisual. Scenery / shadows / sky follow the camera and the action.
  let hlCams = null;
  function hlEnter(cam) {
    if (hlCams) return; hlCams = cameras; cameras = [cam]; fitFarPlane();
    if (race && race.players.length > 1) applySplitTier(false);
    if (splitShadow) { renderer.shadowMap.autoUpdate = splitShadow.auto; splitShadow = null; }
    onResize(); invalidateShadowCache();
  }
  function hlExit() {
    if (!hlCams) return; cameras = hlCams; hlCams = null;
    if (race && race.players.length > 1) applySplitTier(true);
    for (const e of engines) EI.Audio.setEngine(e, 0.15, 0, 0, 0);
    onResize(); invalidateShadowCache(); lastT = performance.now(); acc = 0;
    if (race) race.players.forEach((car, k) => placeCamera(cameras[k], car, k, true, 0));
  }
  function hlFrame(dt, gl2) {
    const H = EI.Replay; H.update(dt); if (!H.playing) return;   // the reel ended this frame: the results card is back
    const cam = cameras[0], f = H.focus, cp = cam.position;
    updateCarLod(); particles.update(dt);
    scenery.update(dt, cp.x, cp.z); if (scenery.setEye) scenery.setEye(cp.x, cp.z);   // level of detail around the camera (TV towers, the helicopter)
    if (skyMesh) skyMesh.position.set(cp.x, 0, cp.z);
    sunFollow(f.x, f.z); tunnelLight(0, H.eye, dt);
    const A = H.audio; engines.forEach((e, k) => EI.Audio.setEngine(e, A.rpm, A.thr, k === 0 ? A.vol : 0, A.gear));
    renderer.setScissorTest(false); renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    renderView(cam, true, null); pipeResolve(); pushFence(gl2);
  }
  if (EI.Replay && EI.Replay.bind) EI.Replay.bind({ enter: hlEnter, exit: hlExit, get scenery() { return scenery; } });

  // two players: P1 / P2 chips in the colours of their HUDs on the classification rows
  function markResultPlayers() {
    const tb = $('results-table'); if (!tb) return; const res = race.results();
    res.forEach((r, i) => { const tr = tb.rows[i + 1]; if (!tr || !r.car.isPlayer) return; const k = r.car.playerIndex; tr.classList.add('sp-p' + (k + 1)); const td = tr.querySelector('td.drv'); if (td && !td.querySelector('.sp-chip')) td.insertAdjacentHTML('afterbegin', '<span class="sp-chip">P' + (k + 1) + '</span>'); });
  }
  // two players: the one who has finished is driven round the cool-down lap (as in the broadcast games) and their view says so,
  // while the other player is still racing
  function finishPlayer(k) {
    const car = race.players[k]; if (autopilots[k] || !EI.AIDriver) return;
    const persona = car.persona; const ai = new EI.AIDriver(car, track, 'average', U.rng(97 + k)); car.persona = persona;
    autopilots[k] = { ai, inp: { throttle: 0, brake: 0, steer: 0, drs: false, ers: false, pit: false, tyre: null, cam: false, pause: false } };
    if (viewports[k].setFinished) viewports[k].setFinished(car.pos);
  }
  function handleEvents() {
    for (const e of race.pollEvents()) {
      switch (e.type) {
        case 'light': EI.HUD.setLights(e.data); EI.Audio.beep(440, 0.25, 0.25); if (e.data === 1) { if (race.players.length > 1) { EI.HUD.toast('W A S D · L Shift straight mode · Space ERS · C camera · P pit', 'keys', 0); EI.HUD.toast('Arrows · R Shift straight mode · Enter ERS · / camera · Backspace pit', 'keys', 1); } else EI.HUD.toast('W A S D · Shift = straight mode · Ctrl/Space = ERS boost · C = camera · P = pit'); } break;
        case 'go': $('lights').classList.add('hidden'); EI.HUD.setLights(-1); EI.HUD.banner('LIGHTS OUT!', 1500, '#37d67a'); EI.Audio.beep(880, 0.6, 0.3); break;
        case 'penalty': viewports[e.data.playerIndex].showMsg('JUMP START  +5s', 'bad', 3); if (race.players.length === 1) EI.HUD.toast(e.data.name + ': jump start, +5 s penalty'); break;
        case 'fastest': EI.HUD.toast('Fastest lap: ' + e.data.name + ' ' + U.fmtTime(race.fastest.time)); if (e.data.isPlayer) viewports[e.data.playerIndex].showMsg('FASTEST LAP ' + U.fmtTime(race.fastest.time), 'good', 2.5); break;
        case 'finalLap': if (e.data.isPlayer) viewports[e.data.playerIndex].showMsg('FINAL LAP', 'warn', 2.5); else if (e.data.pos === 1) EI.HUD.toast('Final lap for the leader ' + e.data.name); break;
        case 'leaderFinished': EI.HUD.toast(e.data.name + ' takes the chequered flag!'); break;
        case 'finished': if (e.data.isPlayer) { const k = e.data.playerIndex; viewports[k].showMsg('P' + e.data.pos + ' · ' + U.ordinal(e.data.pos).toUpperCase(), e.data.pos <= 3 ? 'good' : 'warn', 6); EI.Audio.beep(660, 0.3, 0.25); if (race.players.length > 1) finishPlayer(k); } break;
        case 'hit': if (race.players.length > 1) { race.players.forEach((c, k) => { if (c.hit >= e.data * 0.5) shakeP[k] = Math.max(shakeP[k] || 0, e.data * 0.6); }); } else shake = Math.max(shake, e.data * 0.6); EI.Audio.thud(e.data); break;
        case 'over': EI.HUD.toast('Waiting for the field to finish…'); break;
      }
    }
    if (race.players.length > 1) race.players.forEach((car, k) => { if (car.wallHit > 0.5 && (shakeP[k] || 0) < 0.2) { shakeP[k] = car.wallHit * 0.5; EI.Audio.thud(car.wallHit); car.wallHit = 0.3; } });
    else for (const car of race.players) if (car.wallHit > 0.5 && shake < 0.2) { shake = car.wallHit * 0.5; EI.Audio.thud(car.wallHit); car.wallHit = 0.3; }
    for (const car of race.players) {
      if (car._lastThr > 0.8 && car.throttle < 0.2 && car.rpm > 0.7 && Math.random() < 0.6) EI.Audio.pop(); car._lastThr = car.throttle; }
  }
  EI.debug = { get shake() { return shake; }, set shake(v) { shake = v; }, get introT() { return introT; }, set introT(v) { introT = v; }, get viewports() { return viewports; }, setQuality, snapCameras: () => race && race.players.forEach((car, k) => placeCamera(cameras[k], car, k, true, 0)), setCam: (k, m) => { camModes[k] = m; }, get race() { return race; }, get track() { return track; }, get scenery() { return scenery; }, get scene() { return scene; }, get cameras() { return cameras; }, renderer: () => renderer, startRace, endRace };
  EI.debug.shadowCacheState = SHC;
  Object.defineProperty(EI.debug, 'pipe', { get: () => ({ sc: PIPE.sc, msaa: PIPE.msaa, bloom: !!PIPE.bloom, autoLv, gpuQ: +gpuQ.toFixed(2), sync: syncPref }) });
  Object.defineProperty(EI.debug, 'resScale', { get: () => PIPE.sc });
  EI.debug.pipe = PIPE; EI.debug.viewState = () => viewState(); EI.debug.setRes = setRes; EI.debug.setAutoLevel = (lv) => { autoLv = lv; onResize(); };
  EI.debug.placeCam = (k, dt) => race && placeCamera(cameras[k], race.players[k], k, false, dt);   // test hook: one camera update
  EI.debug.wheelScreen = (car) => drawWheelScreen(car, race ? race.deltaBest(car) : null);   // test hook: one wheel-display redraw
  window.addEventListener('DOMContentLoaded', () => { (EI.Ads ? EI.Ads.ready() : Promise.resolve()).then(() => setTimeout(init, 30)); });
})();
