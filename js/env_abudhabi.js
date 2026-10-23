// Equation I - Yas Marina (ABUDHABI-UPGRADE, wave 9): the photo-matched pass over the Yas venue, after the 110 F1 photos
// (staging/abudhabi_refs). Every hook here is gated on the Abu Dhabi track (data id 'abudhabi' / EI.trackId), the other circuits are
// untouched. Built on top of js/env_yas*.js (hotel, marina, stands, pit building, floodlights) and js/night.js (the light map):
//  * the floodlit TWILIGHT sky of the race start (LOOKS.abudhabi.twilight): a deep blue zenith over a burnt-orange sunset band low in
//    the west-south-west (the back straight drives straight into it), streaks of sunset cloud, a violet anti-twilight belt in the east,
//    the venue's light dome all round - one shader, the same box mesh as the night sky (no extra draw call)
//  * the Yas Marina Circuit footbridge on the run from Turn 1 to Turn 2 (photo #019: white box deck, a turquoise glazed truss band with
//    the venue name in white, a curved white pier each side), merged into the landmarks' static mesh (no extra draw call)
//  * the red LED wave sculpture beside the back straight (photo #033, night only): night.js glows (one Points draw for all of them)
// Elsewhere (Yas-only branches): the crimson / white kerbs (js/track.js kerbTexture 'yas'), grey run-off stripes (data runoffColors),
// the white start-gantry portal (js/env_yas_arch.js), the board mix (VENUES.abudhabi, js/ads.js), LOOKS.abudhabi (js/main.js).
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  const AD = {}; const isAD = (t) => !!(t && t.data && t.data.id === 'abudhabi');
  AD.isAD = isAD;
  const C = (h) => new THREE.Color(h).convertSRGBToLinear();
  const f4 = (v) => (+v).toFixed(4); const v3 = (a) => 'vec3(' + a.map(f4).join(', ') + ')';

  // ================================================================ twilight sky (replaces the night sky's shader when the look asks)
  // P: { zen, mid, hor, glow, cloak, belt, dome, ground, clouds } linear colours (pre tone map); see LOOKS.abudhabi in js/main.js
  function twilightFrag(P) {
    return [
      'varying vec3 vDir; uniform vec3 uWest;',
      'float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }',
      'float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
      'float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }',
      'void main() {',
      '  vec3 d = normalize(vDir); float h = d.y; float hp = max(h, 0.0);',
      '  vec3 hz = normalize(vec3(d.x, 0.0, d.z) + vec3(1e-5)); float w = dot(hz, uWest); float wp = max(w, 0.0); float w01 = w * 0.5 + 0.5;',
      // the clear desert dusk: deep blue overhead, violet-grey towards the horizon
      '  vec3 c = mix(' + v3(P.hor) + ', ' + v3(P.mid) + ', smoothstep(0.0, 0.3, h)); c = mix(c, ' + v3(P.zen) + ', smoothstep(0.25, 0.95, h));',
      // the sunset: a hot band on the horizon in the west, a wide warm cloak over half the sky, the earth's shadow + violet belt in the east
      '  float gl = pow(wp, 1.6) * exp(-hp * 9.0); c += ' + v3(P.glow) + ' * gl;',
      '  c += ' + v3(P.cloak) + ' * pow(w01, 3.0) * exp(-hp * 4.2);',
      '  c += ' + v3(P.belt) + ' * (1.0 - w01) * (1.0 - w01) * exp(-abs(h - 0.08) * 9.0);',
      // the venue's light dome: the floodlit haze over the island, low all round
      '  c += ' + v3(P.dome) + ' * exp(-hp * 10.0);',
      // streaks of altocumulus low over the sunset (photos #032 / #040): dark violet undersides, lit orange towards the sun
      '  vec3 wr = normalize(vec3(-uWest.z, 0.0, uWest.x)); float az = atan(dot(hz, wr), w); float band = smoothstep(0.015, 0.05, h) * (1.0 - smoothstep(0.12, 0.26, h));',
      '  float n = vn(vec2(az * 9.0, h * 70.0)) * 0.6 + vn(vec2(az * 23.0 + 3.1, h * 160.0)) * 0.3 + vn(vec2(az * 61.0, h * 300.0)) * 0.1;',
      '  float cm = smoothstep(0.52, 0.78, n) * band * smoothstep(-0.5, 0.4, w) * ' + f4(P.clouds) + ';',
      '  vec3 cc = mix(' + v3(P.cloudDark) + ', ' + v3(P.cloudLit) + ', pow(wp, 2.2) * (0.55 + 0.45 * smoothstep(0.03, 0.12, h)));',
      '  c = mix(c, cc, cm);',
      '  if (h < 0.0) c = mix(c, ' + v3(P.ground) + ', smoothstep(0.0, -0.05, h));',
      // the first stars, only high up and away from the sunset
      '  vec3 q = floor(d * 380.0); float s = hash(q); float st = step(0.9995, s) * smoothstep(0.5, 0.9, h) * (1.0 - wp) * (0.3 + 0.7 * hash(q + 7.0));',
      '  c += vec3(0.8, 0.85, 1.0) * st * 0.18;',
      '  gl_FragColor = vec4(c, 1.0);',
      '#include <tonemapping_fragment>',
      '#include <encodings_fragment>',
      '}'].join('\n');
  }
  const SKY_V = 'varying vec3 vDir; void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vDir = wp.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * wp; gl_Position.z = gl_Position.w; }';
  const TW = { zen: [0.008, 0.016, 0.058], mid: [0.022, 0.028, 0.08], hor: [0.05, 0.04, 0.065], glow: [0.55, 0.11, 0.018], cloak: [0.12, 0.036, 0.016],
    belt: [0.022, 0.012, 0.042], dome: [0.045, 0.03, 0.016], ground: [0.045, 0.036, 0.03], clouds: 0.7, cloudDark: [0.03, 0.022, 0.04], cloudLit: [0.9, 0.3, 0.07] };
  if (EI.Night && EI.Night.makeSky) {
    const orig = EI.Night.makeSky;
    EI.Night.makeSky = function (westDir) {
      // (gated on the look: only LOOKS.abudhabi carries 'twilight'; EI.trackId is only assigned after the sky is made)
      const L = EI.look; if (!L || !L.twilight) return orig.call(this, westDir);
      const P = Object.assign({}, TW, L.twilight === true ? {} : L.twilight);
      const mat = new THREE.ShaderMaterial({ uniforms: { uWest: { value: (westDir || new THREE.Vector3(-1, 0, 0.3)).clone().normalize() } }, vertexShader: SKY_V, fragmentShader: twilightFrag(P), side: THREE.BackSide, depthWrite: false, fog: false });
      mat.userData.nightEmissive = true;
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat); m.name = 'nightSky'; m.frustumCulled = false; m.renderOrder = -10; return m;
    };
  }

  // ================================================================ helpers
  const isNight = () => !!(EI.Night && EI.Night.on);
  const glow = (p, size, col, opts) => { if (isNight()) EI.Night.addGlow(p[0], p[1], p[2], size, col, opts); };
  const flood = (p, opts) => { if (isNight()) EI.Night.addFlood(p[0], p[1], p[2], opts); };
  // a quad wound so its normal faces `want` (the street kit's world material is single sided)
  function faceQ(B, a, b, c, d, col, uv, want) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * want[0] + ny * want[1] + nz * want[2] >= 0) B.quad(a, b, c, d, col, uv);
    else B.quad(a, d, c, b, col, uv ? [uv[0], uv[1], uv[6], uv[7], uv[4], uv[5], uv[2], uv[3]] : null);
  }
  function faceT(B, a, b, c, col, want) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * want[0] + ny * want[1] + nz * want[2] >= 0) B.tri(a, b, c, col); else B.tri(a, c, b, col);
  }

  // ================================================================ the Yas Marina Circuit footbridge (photo #019)
  // A white box deck spanning the track on a curved white pier each side: the outer top corners sweep down into the piers, a
  // turquoise glazed band along both faces shows the walkway's diagonal truss, the venue name in big white italic capitals with the
  // Arabic name above it. At night the band glows (lit walkway) and downlights line the soffit.
  function signRegion() {
    const AT = EI.StreetKit.Atlas; if (AT.R.adFootSign) return AT.R.adFootSign;
    return AT.region('adFootSign', 1024, 80, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0e7f96'); g.addColorStop(0.55, '#12a2b8'); g.addColorStop(1, '#0b7489'); x.fillStyle = g; x.fillRect(0, 0, w, h);
      // the walkway truss behind the glass: X bracing between posts, a handrail, a few walkers
      x.strokeStyle = 'rgba(205,240,248,0.55)'; x.lineWidth = 2.2; const P = 34;
      for (let px = 0; px <= w; px += P) { x.beginPath(); x.moveTo(px, 0); x.lineTo(px, h); x.stroke(); x.beginPath(); x.moveTo(px, 4); x.lineTo(px + P, h - 4); x.moveTo(px + P, 4); x.lineTo(px, h - 4); x.stroke(); }
      x.fillStyle = 'rgba(8,40,52,0.45)'; for (let k = 0; k < 14; k++) { const px = 40 + ((k * 197) % (w - 80)); x.fillRect(px, h * 0.3, 3, h * 0.42); x.beginPath(); x.arc(px + 1.5, h * 0.26, 2.4, 0, 6.283); x.fill(); }
      x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillRect(0, 0, w, 2); x.fillRect(0, h - 2, w, 2);
      // the venue name: white heavy italic capitals across most of the band, the Arabic name above right
      x.fillStyle = '#ffffff'; x.textBaseline = 'alphabetic';
      x.save(); x.translate(w * 0.5, h * 0.92); x.transform(1, 0, -0.18, 1, 0, 0); x.font = '900 46px "Arial Black", Arial, sans-serif'; x.textAlign = 'center';
      const txt = 'YAS MARINA CIRCUIT'; const tw = x.measureText(txt).width || 600; x.scale(Math.min(1.35, w * 0.74 / tw), 1); x.fillText(txt, 0, 0); x.restore();
      x.font = '700 24px Arial, sans-serif'; x.textAlign = 'right'; x.fillText('حلبة مرسى ياس', w * 0.86, h * 0.36);
    }, null, null, 'none');
  }
  function footbridge(E, H, out, s) {
    const t = E.t, OCC = EI.Env.OCC; const SK = EI.StreetKit; const night = isNight();
    const i = t.idxAtS(s); const cx = t.x[i], cz = t.z[i], cy = t.y[i];
    let tx = t.tx[i], tz = t.tz[i]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl; const nx = t.nx[i], nz = t.nz[i];
    const wL = (E.wallCap ? E.wallCap(i, 1) : t.wallL[i]), wR = (E.wallCap ? E.wallCap(i, -1) : t.wallR[i]);
    // piers 1.8 m thick, their inner faces 3.2 m behind each barrier (clear of the fence and the barrier's footing)
    const PT = 1.8, D = 2.2, lL = wL + 3.2, lR = -(wR + 3.2);
    const P = (lat, y, a) => [cx + nx * lat + tx * a, cy + y, cz + nz * lat + tz * a];
    for (const lat of [lL + PT / 2, lR - PT / 2]) { const p = P(lat, 0, 0); if (E.occAt(p[0], p[2]) & (OCC.BUILT | OCC.WATER)) return false; if (E.isSea && E.isSea(p[0], p[2])) return false; }
    const gnd = (lat) => { let g = Infinity; for (const a of [-D, 0, D]) { const q = P(lat, 0, a); g = Math.min(g, E.ground(q[0], q[2])); } return g; };
    const gL = Math.min(gnd(lL), gnd(lL + PT)) - cy - 0.4, gR = Math.min(gnd(lR), gnd(lR - PT)) - cy - 0.4;
    const yB = 7.8, yT = 12.6, R = 3.6, rI = 1.4;   // deck soffit / top, outer sweep radius, inner fillet radius
    // the outline in (lat, y): the -lat pier's outer foot -> up and round the sweep -> deck top -> the other sweep -> the +lat pier's outer
    // foot -> its inner foot -> up, the fillet under the deck -> soffit -> the fillet -> the -lat pier's inner foot
    const oL = lL + PT, oR = lR - PT; const pts = [];
    const arc = (cxl, cyl, r, a0, a1, n) => { for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; pts.push([cxl + Math.cos(a) * r, cyl + Math.sin(a) * r]); } };
    pts.push([oR, gR]); arc(oR + R, yT - R, R, Math.PI, Math.PI / 2, 6); arc(oL - R, yT - R, R, Math.PI / 2, 0, 6); pts.push([oL, gL]); pts.push([lL, gL]);
    arc(lL - rI, yB - rI, rI, 0, Math.PI / 2, 4); arc(lR + rI, yB - rI, rI, Math.PI / 2, Math.PI, 4); pts.push([lR, gR]);
    const B = new SK.Batch(); const white = C(0xf4f4f1), soffit = C(0xe6e8ea);
    B.set('white', 0.42, 0.05, 0);
    // front / back faces (a = +D / -D): the triangulated outline
    const v2 = pts.map(p => new THREE.Vector2(p[0], p[1])); const tris = THREE.ShapeUtils.triangulateShape(v2, []);
    for (const sg of [1, -1]) { const want = [tx * sg, 0, tz * sg]; for (const [a, b, c] of tris) faceT(B, P(pts[a][0], pts[a][1], sg * D), P(pts[b][0], pts[b][1], sg * D), P(pts[c][0], pts[c][1], sg * D), white, want); }
    // the skin round the outline (outward normals from the outline's winding)
    let ar = 0; for (let k = 0; k < pts.length; k++) { const p = pts[k], q = pts[(k + 1) % pts.length]; ar += p[0] * q[1] - q[0] * p[1]; } const ow = ar > 0 ? 1 : -1;
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k], q = pts[(k + 1) % pts.length]; const el = q[0] - p[0], ey = q[1] - p[1]; const ll = Math.hypot(el, ey) || 1; const ol = ow * ey / ll, oy = -ow * el / ll;
      const want = [nx * ol, oy, nz * ol]; const under = oy < -0.5 && p[1] > 0;
      faceQ(B, P(p[0], p[1], -D), P(q[0], q[1], -D), P(q[0], q[1], D), P(p[0], p[1], D), under ? soffit : white, null, want);
    }
    // the glazed band with the sign on both faces, 4 cm proud, between the piers' inner faces
    const sr = signRegion(); B.set(sr, 0.15, 0.35, night ? 0.95 : 0.05);
    const s0 = lR + 0.6, s1 = lL - 0.6, b0 = yB + 0.75, b1 = yB + 3.35;
    for (const sg of [1, -1]) { const a = sg * (D + 0.04); const want = [tx * sg, 0, tz * sg];
      // u runs left-to-right as seen from that face
      const uv = sg > 0 ? [1, 0, 0, 0, 0, 1, 1, 1] : [0, 0, 1, 0, 1, 1, 0, 1];
      faceQ(B, P(s1, b0, a), P(s0, b0, a), P(s0, b1, a), P(s1, b1, a), C(0xffffff), uv, want); }
    // soffit downlights
    B.set('white', 0.3, 0, night ? 2.4 : 0.3); const nL = Math.max(2, Math.round((lL - lR) / 4));
    for (let k = 1; k < nL; k++) { const lat = lR + (lL - lR) * k / nL; for (const a of [-1.1, 1.1]) faceQ(B, P(lat - 0.3, yB - 0.02, a - 0.2), P(lat + 0.3, yB - 0.02, a - 0.2), P(lat + 0.3, yB - 0.02, a + 0.2), P(lat - 0.3, yB - 0.02, a + 0.2), C(0xfff4e2), null, [0, -1, 0]);
      if (k % 2 === 0) glow(P(lat, yB - 0.3, 0), 1.6, [1.0, 0.95, 0.86]); }
    if (night) { flood(P((lL + lR) / 2, yB - 0.5, 0), { power: 0.2, range: 40, color: [0.9, 0.95, 1.0] }); for (const sg of [1, -1]) glow(P((lL + lR) / 2, (b0 + b1) / 2, sg * (D + 1)), 6, [0.25, 0.75, 0.85]); }
    H.W.add(B, 'main'); out.adFootbridge = { s: Math.round(s), span: +(lL - lR).toFixed(1), tris: B.count / 3 };
    return true;
  }
  // ================================================================ the LED wave (photo #033, 2025): a free-standing light sculpture beside a
  // straight - a long, rolling curtain of red LED points (a crest that rises and dips along its length) on slim dark masts. Night only:
  // the points are night.js glows (all of them one Points draw), the masts a handful of thin beams in the static mesh
  function ledWave(E, H, out) {
    if (!isNight()) return false; const t = E.t, OCC = EI.Env.OCC; const L = 46, NC = 46, NR = 11;
    for (const [s0, side] of [[1960, 1], [1960, -1], [2160, 1], [2160, -1], [1780, 1], [1780, -1]]) {
      const i0 = t.idxAtS(s0); const off = (E.wallCap ? E.wallCap(i0, side) : (side < 0 ? t.wallL[i0] : t.wallR[i0])) + 22;
      const at = (u) => { const i = t.idxAtS(s0 + u); return [t.x[i] + t.nx[i] * side * off, t.z[i] + t.nz[i] * side * off]; };
      let ok = true; for (let u = -4; u <= L + 4 && ok; u += 4) { const p = at(u); if ((E.occAt(p[0], p[1]) & (OCC.BUILT | OCC.ROAD | OCC.WATER)) || (E.isSea && E.isSea(p[0], p[1]))) ok = false; }
      if (!ok) continue;
      const B = new EI.StreetKit.Batch(); B.set('white', 0.6, 0.3, 0); const mast = C(0x23262b); const I4 = new THREE.Matrix4(); let n = 0;
      const top = (u) => 6.5 + 4.2 * Math.sin(u / L * Math.PI * 1.6 + 0.4) * Math.sin(u / L * Math.PI);   // the rolling crest
      for (let c = 0; c <= NC; c++) {
        const u = c / NC * L; const p = at(u); const g = E.ground(p[0], p[1]); const ht = Math.max(2.5, top(u));
        // the curtain leans out over its base: a gentle S across its height
        const i = t.idxAtS(s0 + u); const ox = t.nx[i] * side, oz = t.nz[i] * side;
        for (let r = 0; r <= NR; r++) { const f = r / NR; const lean = 1.6 * Math.sin(f * Math.PI) * Math.cos(u / L * 5.0); const y = g + 0.6 + f * ht;
          EI.Night.addGlow(p[0] - ox * lean, y, p[1] - oz * lean, 0.75 + 0.25 * f, [1.0, 0.07 + 0.05 * f, 0.05], { pulse: 0 }); n++; }
        if (c % 6 === 0) B.beam(I4, [p[0], g - 0.2, p[1]], [p[0], g + 0.6 + ht, p[1]], 0.14, mast, 6);
      }
      // the red light it throws on the ground and the run-off side of the fence
      const pm = at(L / 2); flood([pm[0], E.ground(pm[0], pm[1]) + 5, pm[1]], { power: 0.12, range: 45, color: [1.0, 0.12, 0.08] });
      H.W.add(B, 'main'); out.adLedWave = { s: s0, side, points: n }; return true;
    }
    return false;
  }

  // the bridge stands on the run from Turn 1 to Turn 2 (the pit exit joins there, #019); the first s with both piers on clear ground
  AD.FOOT_S = [400, 380, 420, 360, 440];
  if (EI.EnvYasCity && EI.EnvYasCity.build) {
    const origCity = EI.EnvYasCity.build;
    EI.EnvYasCity.build = function (E, H, out) {
      const r = origCity.apply(this, arguments);
      if (isAD(E.t)) {
        try { for (const s of AD.FOOT_S) if (footbridge(E, H, out, s)) break; } catch (e) { console.error('EnvAbuDhabi footbridge', e); }
        try { ledWave(E, H, out); } catch (e) { console.error('EnvAbuDhabi ledWave', e); }
      }
      return r;
    };
  }

  EI.EnvAbuDhabi = AD;
})();
